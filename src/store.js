// -----------------------------------------------------------------------------
// The data store: the last answer of each Observatory data set, and the only
// thing that ever calls the Observatory.
//
// The data of the Observatory is territory-wide: one current weather report,
// one 9-day forecast, one warning list for every house in Hong Kong. Only the
// rainfall nowcast depends on the house, and it is read from one file.
//
// Every reader — the core's weather requests (dashboard, chat, the core's
// 30-minute alert check), the scene actions, the "Test" button — is served
// from memory. The scheduler refreshes the data sets; a reader only causes a
// call when a data set has not been refreshed for a while, and concurrent
// readers share one call.
//
// The cadence is enforced HERE, so that no caller can break it — each data
// set is taken as valid for:
//   - current report and warnings: 10 minutes (the temperatures are updated
//     every 10 minutes, and a typhoon signal must not wait long);
//   - 9-day and local forecasts: 30 minutes (updated a few times a day);
//   - rainfall nowcast: 30 minutes (2.7 MB a time: about 130 MB a day).
// A 429 blocks every call, with a doubling delay (10 minutes, up to 2 hours)
// or the server's `Retry-After`; a 403 blocks every call for 6 hours.
//
// When a call fails, an answer up to 3 hours old is still served: an hour-old
// forecast beats the core falling back to another provider or an empty
// dashboard. The nowcast never is: it only says something about the next
// hour.
// -----------------------------------------------------------------------------

import { DATA_TYPES, ERROR_KINDS, HkoError, fetchNowcast, fetchOpenData } from './api.js';
import { createFailureLog } from './failure-log.js';
import { parseNowcast } from './nowcast.js';
import { parseCurrent, parseForecast, parseLocalForecast } from './reports.js';
import { parseWarnings } from './warnings.js';

const MINUTE_MS = 60 * 1000;
const STALE_MAX_MS = 3 * 60 * MINUTE_MS;
const THROTTLE_FIRST_MS = 10 * MINUTE_MS;
const THROTTLE_MAX_MS = 2 * 60 * MINUTE_MS;
const FORBIDDEN_BLOCK_MS = 6 * 60 * MINUTE_MS;
// After a failure, the same data set is not asked again for this long (a
// reader must not pay a timeout at every dashboard refresh).
const RETRY_AFTER_FAILURE_MS = 2 * MINUTE_MS;

const DATASETS = Object.freeze({
  current: 'current',
  forecast: 'forecast',
  local: 'local',
  warnings: 'warnings',
  nowcast: 'nowcast',
});

const EXPIRY_MS = Object.freeze({
  current: 10 * MINUTE_MS,
  forecast: 30 * MINUTE_MS,
  local: 30 * MINUTE_MS,
  warnings: 10 * MINUTE_MS,
  nowcast: 30 * MINUTE_MS,
});

/**
 * @description The cache key of a location (4 decimals).
 * @param {number} latitude - The latitude.
 * @param {number} longitude - The longitude.
 * @returns {string} The key.
 * @example
 * locationKey(22.28, 114.16); // -> '22.2800,114.1600'
 */
function locationKey(latitude, longitude) {
  return `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
}

/**
 * @description Parse an answer, turning a parsing error into INVALID.
 * @param {Function} parse - The parser.
 * @param {...any} args - Its arguments.
 * @returns {any} The parsed value.
 * @throws {HkoError} INVALID.
 * @example
 * parsed(parseForecast, json);
 */
function parsed(parse, ...args) {
  try {
    return parse(...args);
  } catch (err) {
    throw new HkoError(ERROR_KINDS.INVALID, err.message, { status: 200 });
  }
}

/**
 * @description Create the data store.
 * @param {object} [options] - Options.
 * @param {Function} [options.fetchImpl] - fetch, injectable for the tests.
 * @param {Function} [options.now] - `() => ms`, injectable for the tests.
 * @param {object} [options.logger] - Logger with info/warn/debug/error.
 * @returns {object} The store.
 * @example
 * const store = createStore();
 */
function createStore({ fetchImpl = globalThis.fetch, now = Date.now, logger = console } = {}) {
  // name -> { value, fetchedAt, expiresAt }
  const entries = new Map();
  // name -> Promise of the call under way
  const inflight = new Map();
  // name -> { until, error } after a failure
  const failed = new Map();
  // location key -> nowcast of the location, from the last file
  let nowcastByKey = new Map();
  let blockedUntil = 0;
  let blockedKind = null;
  let throttleMs = THROTTLE_FIRST_MS;
  let calls = 0;
  const failures = createFailureLog(logger);

  const fetchers = {
    current: async () =>
      parsed(parseCurrent, await fetchOpenData(DATA_TYPES.CURRENT, { fetchImpl, now })),
    forecast: async () =>
      parsed(parseForecast, await fetchOpenData(DATA_TYPES.FORECAST, { fetchImpl, now })),
    local: async () =>
      parsed(
        parseLocalForecast,
        await fetchOpenData(DATA_TYPES.LOCAL_FORECAST, { fetchImpl, now }),
      ),
    warnings: async () => {
      // The texts are a bonus: without them, the warnings keep their names.
      const [summary, info] = await Promise.all([
        fetchOpenData(DATA_TYPES.WARNINGS, { fetchImpl, now }),
        fetchOpenData(DATA_TYPES.WARNING_INFO, { fetchImpl, now }).catch((err) => {
          logger.debug(`Warning texts unavailable: ${err.message}`);
          return null;
        }),
      ]);
      return parsed(parseWarnings, summary, info);
    },
    nowcast: async () => {
      const csv = await fetchNowcast({ fetchImpl, now });
      // Checked once, on a point of the territory: a file without rows or
      // without Hong Kong is INVALID.
      if (parsed(parseNowcast, csv, [{ latitude: 22.3, longitude: 114.17 }])[0] === null) {
        throw new HkoError(ERROR_KINDS.INVALID, 'The rainfall nowcast does not cover Hong Kong');
      }
      return csv;
    },
  };

  /**
   * @description Why calls are refused right now, if they are.
   * @returns {HkoError|null} The error to throw, or null.
   * @example
   * store.blockedError();
   */
  function blockedError() {
    if (blockedUntil > now()) {
      return new HkoError(
        blockedKind,
        `Hong Kong Observatory calls paused until ${new Date(blockedUntil).toISOString()} (${blockedKind})`,
      );
    }
    return null;
  }

  /**
   * @description Remember a failure, and pause the calls when the
   * Observatory asks.
   * @param {string} name - The data set.
   * @param {HkoError} err - The error.
   * @example
   * recordFailure('current', err);
   */
  function recordFailure(name, err) {
    const kind = err.kind ?? ERROR_KINDS.NETWORK;
    if (kind === ERROR_KINDS.THROTTLED) {
      const delay = Math.min(Math.max(err.retryAfterMs ?? 0, throttleMs), THROTTLE_MAX_MS);
      blockedUntil = now() + delay;
      blockedKind = kind;
      throttleMs = Math.min(throttleMs * 2, THROTTLE_MAX_MS);
      failures.fail(
        'hko',
        `Hong Kong Observatory throttles the requests (429): pausing ${Math.round(delay / MINUTE_MS)} min`,
        { kind },
      );
      return;
    }
    if (kind === ERROR_KINDS.FORBIDDEN) {
      blockedUntil = now() + FORBIDDEN_BLOCK_MS;
      blockedKind = kind;
      failures.fail('hko', 'Hong Kong Observatory refused the requests (403): pausing 6 hours', {
        kind,
        level: 'error',
      });
      return;
    }
    failed.set(name, { until: now() + RETRY_AFTER_FAILURE_MS, error: err });
    if (name === DATASETS.nowcast) {
      // A bonus, slow to download: its failure is an info line of its own.
      failures.fail('hko:nowcast', `Rainfall nowcast unavailable: ${err.message}`, {
        kind,
        level: 'info',
      });
    } else if (kind === ERROR_KINDS.NETWORK || kind === ERROR_KINDS.SERVER) {
      // The Observatory down fails every data set: one warning for all.
      failures.fail('hko', `Hong Kong Observatory unavailable: ${err.message}`, { kind });
    } else {
      failures.fail(`hko:${name}`, `Hong Kong Observatory ${name} unusable: ${err.message}`, {
        kind,
      });
    }
  }

  /**
   * @description Call the Observatory for a data set — unless its cached
   * answer has not expired yet — sharing a call under way.
   * @param {string} name - One of DATASETS.
   * @returns {Promise<object>} The entry `{ value, fetchedAt, expiresAt }`.
   * @throws {HkoError} When the call fails or is paused.
   * @example
   * await store.refresh('forecast');
   */
  function refresh(name) {
    const cached = entries.get(name);
    if (cached !== undefined && cached.expiresAt > now()) {
      return Promise.resolve(cached);
    }
    const pending = inflight.get(name);
    if (pending !== undefined) {
      return pending;
    }
    const recent = failed.get(name);
    if (recent !== undefined && recent.until > now()) {
      return Promise.reject(recent.error);
    }
    const blocked = blockedError();
    if (blocked !== null) {
      return Promise.reject(blocked);
    }
    const call = (async () => {
      calls += 1;
      try {
        const value = await fetchers[name]();
        const at = now();
        const entry = { value, fetchedAt: at, expiresAt: at + EXPIRY_MS[name] };
        entries.set(name, entry);
        if (name === DATASETS.nowcast) {
          nowcastByKey = new Map();
        }
        failed.delete(name);
        throttleMs = THROTTLE_FIRST_MS;
        if (name === DATASETS.nowcast) {
          failures.recover('hko:nowcast', 'Rainfall nowcast available again');
        } else {
          failures.recover('hko', 'Hong Kong Observatory answers again');
          failures.recover(`hko:${name}`, `Hong Kong Observatory ${name} usable again`);
        }
        return entry;
      } catch (err) {
        recordFailure(name, err);
        throw err;
      } finally {
        inflight.delete(name);
      }
    })();
    inflight.set(name, call);
    return call;
  }

  /**
   * @description A data set for a reader: the cached one when fetched less
   * than `maxAgeMs` ago, else a refresh — falling back to a cached one up to
   * 3 hours old when the call fails.
   * @param {string} name - One of DATASETS (not the nowcast).
   * @param {object} [options] - Options.
   * @param {number} [options.maxAgeMs] - The age under which the cache is
   * used without asking; its expiry plus a margin by default.
   * @returns {Promise<object>} The entry, with `stale`.
   * @throws {HkoError} When there is nothing to serve.
   * @example
   * const { value } = await store.load('forecast');
   */
  async function load(name, { maxAgeMs = EXPIRY_MS[name] + 5 * MINUTE_MS } = {}) {
    const cached = entries.get(name);
    if (cached !== undefined && now() - cached.fetchedAt <= maxAgeMs) {
      return { ...cached, stale: false };
    }
    try {
      return { ...(await refresh(name)), stale: false };
    } catch (err) {
      if (cached !== undefined && now() - cached.fetchedAt <= STALE_MAX_MS) {
        logger.debug(
          `Serving ${name} fetched ${Math.round((now() - cached.fetchedAt) / MINUTE_MS)} min ago: ${err.message}`,
        );
        return { ...cached, stale: true };
      }
      throw err;
    }
  }

  /**
   * @description The warnings as last read, without calling.
   * @returns {Array<object>|null} The warnings, null when never read or too
   * old.
   * @example
   * store.peekWarnings();
   */
  function peekWarnings() {
    const entry = entries.get(DATASETS.warnings);
    return entry !== undefined && now() - entry.fetchedAt <= STALE_MAX_MS ? entry.value : null;
  }

  /**
   * @description The nowcast of a location, from the last file (never a
   * call).
   * @param {number} latitude - The latitude.
   * @param {number} longitude - The longitude.
   * @returns {object|null} `{ issuedAt, steps }`, or null.
   * @example
   * store.nowcastAt(22.28, 114.16);
   */
  function nowcastAt(latitude, longitude) {
    const entry = entries.get(DATASETS.nowcast);
    if (entry === undefined) {
      return null;
    }
    const key = locationKey(latitude, longitude);
    if (!nowcastByKey.has(key)) {
      let reading = null;
      try {
        [reading] = parseNowcast(entry.value, [{ latitude, longitude }]);
      } catch {
        // Checked at download: cannot happen.
      }
      nowcastByKey.set(key, reading);
    }
    return nowcastByKey.get(key);
  }

  /**
   * @description The earliest instant a data set expires among those cached.
   * @returns {number|null} The instant, or null when nothing is cached.
   * @example
   * store.nextExpiry();
   */
  function nextExpiry() {
    let next = null;
    for (const entry of entries.values()) {
      if (next === null || entry.expiresAt < next) {
        next = entry.expiresAt;
      }
    }
    return next;
  }

  return {
    refresh,
    load,
    peekWarnings,
    nowcastAt,
    nextExpiry,
    blockedError,
    peek: (name) => entries.get(name) ?? null,
    get blockedUntil() {
      return blockedUntil;
    },
    get calls() {
      return calls;
    },
  };
}

export {
  DATASETS,
  EXPIRY_MS,
  FORBIDDEN_BLOCK_MS,
  RETRY_AFTER_FAILURE_MS,
  STALE_MAX_MS,
  THROTTLE_FIRST_MS,
  THROTTLE_MAX_MS,
  createStore,
  locationKey,
};
