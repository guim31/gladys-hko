// -----------------------------------------------------------------------------
// The Hong Kong Observatory open data requests.
//
// Everything comes from the open data of the Observatory (data.gov.hk), with
// no account and no key:
//
//   weather.php?dataType=rhrread      current weather report (temperature of
//                                     every station, humidity, UV, icon)
//   weather.php?dataType=fnd          9-day forecast
//   weather.php?dataType=flw          local forecast (text, today and tonight)
//   weather.php?dataType=warnsum      warnings and signals in force
//   weather.php?dataType=warningInfo  their texts
//   hko_data/F3/Gridded_rainfall_nowcast.csv
//                                     rainfall nowcast of the next two hours,
//                                     in half hours, on a ~2 km grid
//
// English answers only (`lang=en`): the Observatory also speaks traditional
// and simplified Chinese, but none of the languages of Gladys besides
// English. The integration translates what it can (signal names, conditions)
// itself.
//
// Errors carry a kind, so that the callers react the same way whatever the
// request: a 429 pauses every call, a 403 pauses them for hours, a network
// or server failure is retried later, an answer that does not parse is
// INVALID.
// -----------------------------------------------------------------------------

const OPEN_DATA_URL = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php';
const NOWCAST_URL =
  'https://data.weather.gov.hk/weatherAPI/hko_data/F3/Gridded_rainfall_nowcast.csv';

const DATA_TYPES = Object.freeze({
  CURRENT: 'rhrread',
  FORECAST: 'fnd',
  LOCAL_FORECAST: 'flw',
  WARNINGS: 'warnsum',
  WARNING_INFO: 'warningInfo',
});

const USER_AGENT = 'gladys-hko (+https://github.com/guim31/gladys-hko)';

// A weather request of the core waits 15 s: the small JSON answers must fit.
const JSON_TIMEOUT_MS = 10000;
// The nowcast is a 2.7 MB file the Observatory serves slowly (two minutes
// from Europe, 21 kB/s); only the scheduler downloads it, in the background,
// never a weather request.
const NOWCAST_TIMEOUT_MS = 240000;

const ERROR_KINDS = Object.freeze({
  NETWORK: 'network',
  SERVER: 'server',
  THROTTLED: 'throttled',
  FORBIDDEN: 'forbidden',
  REQUEST: 'request',
  INVALID: 'invalid',
});

class HkoError extends Error {
  /**
   * @param {string} kind - One of ERROR_KINDS.
   * @param {string} message - Safe to log.
   * @param {object} [details] - `{ status, retryAfterMs }`.
   */
  constructor(kind, message, { status = null, retryAfterMs = null } = {}) {
    super(message);
    this.name = 'HkoError';
    this.kind = kind;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * @description The URL of an open data set.
 * @param {string} dataType - One of DATA_TYPES.
 * @returns {string} The URL.
 * @example
 * openDataUrl('fnd');
 */
function openDataUrl(dataType) {
  return `${OPEN_DATA_URL}?dataType=${dataType}&lang=en`;
}

/**
 * @description Read a `Retry-After` header.
 * @param {string|null} value - The header.
 * @param {number} now - The current time in ms.
 * @returns {number|null} The delay in ms.
 * @example
 * retryAfter('120', Date.now()); // -> 120000
 */
function retryAfter(value, now) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

/**
 * @description GET a URL, turning every failure into an HkoError.
 * @param {string} url - The URL.
 * @param {object} options - Options.
 * @param {Function} options.fetchImpl - fetch.
 * @param {number} options.timeoutMs - The deadline.
 * @param {Function} [options.now] - `() => ms`.
 * @returns {Promise<string>} The body.
 * @throws {HkoError} On any failure.
 * @example
 * await get(openDataUrl('fnd'), { fetchImpl: fetch, timeoutMs: 10000 });
 */
async function get(url, { fetchImpl, timeoutMs, now = Date.now }) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json, text/csv' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const reason = err?.name === 'TimeoutError' ? `timeout after ${timeoutMs} ms` : err.message;
    throw new HkoError(ERROR_KINDS.NETWORK, `Hong Kong Observatory unreachable: ${reason}`);
  }
  const { status } = response;
  if (status === 429) {
    throw new HkoError(
      ERROR_KINDS.THROTTLED,
      'Hong Kong Observatory throttles the requests (429)',
      {
        status,
        retryAfterMs: retryAfter(response.headers.get('retry-after'), now()),
      },
    );
  }
  if (status === 403) {
    throw new HkoError(ERROR_KINDS.FORBIDDEN, 'Hong Kong Observatory refused the request (403)', {
      status,
    });
  }
  if (status >= 500) {
    throw new HkoError(ERROR_KINDS.SERVER, `Hong Kong Observatory answered ${status}`, { status });
  }
  if (status !== 200) {
    throw new HkoError(ERROR_KINDS.REQUEST, `Hong Kong Observatory answered ${status}`, { status });
  }
  try {
    return await response.text();
  } catch (err) {
    throw new HkoError(ERROR_KINDS.NETWORK, `Hong Kong Observatory answer cut: ${err.message}`);
  }
}

/**
 * @description Fetch one open data set.
 * @param {string} dataType - One of DATA_TYPES.
 * @param {object} options - Options.
 * @param {Function} [options.fetchImpl] - fetch.
 * @param {Function} [options.now] - `() => ms`.
 * @returns {Promise<object>} The parsed JSON.
 * @throws {HkoError} On any failure (INVALID when the body is not an object).
 * @example
 * await fetchOpenData('rhrread', { fetchImpl: fetch });
 */
async function fetchOpenData(dataType, { fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const body = await get(openDataUrl(dataType), { fetchImpl, timeoutMs: JSON_TIMEOUT_MS, now });
  let json;
  try {
    // The Observatory answers an empty body for an empty warning list.
    json = body.trim() === '' ? {} : JSON.parse(body);
  } catch {
    throw new HkoError(ERROR_KINDS.INVALID, `Unreadable ${dataType} answer`, { status: 200 });
  }
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    throw new HkoError(ERROR_KINDS.INVALID, `Unexpected ${dataType} answer`, { status: 200 });
  }
  return json;
}

/**
 * @description Fetch the rainfall nowcast (CSV).
 * @param {object} options - Options.
 * @param {Function} [options.fetchImpl] - fetch.
 * @param {Function} [options.now] - `() => ms`.
 * @returns {Promise<string>} The CSV.
 * @throws {HkoError} On any failure.
 * @example
 * await fetchNowcast({ fetchImpl: fetch });
 */
function fetchNowcast({ fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  return get(NOWCAST_URL, { fetchImpl, timeoutMs: NOWCAST_TIMEOUT_MS, now });
}

export {
  DATA_TYPES,
  ERROR_KINDS,
  HkoError,
  JSON_TIMEOUT_MS,
  NOWCAST_TIMEOUT_MS,
  NOWCAST_URL,
  OPEN_DATA_URL,
  USER_AGENT,
  fetchNowcast,
  fetchOpenData,
  openDataUrl,
  retryAfter,
};
