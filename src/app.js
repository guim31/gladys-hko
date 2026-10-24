// -----------------------------------------------------------------------------
// The integration, wired to a Gladys client.
//
// Hong Kong Observatory is a WEATHER integration (manifest `type: "weather"`,
// contract B.18): no devices, no discovery — a provider API. Gladys asks for
// the weather of a house, the integration answers in the pivot format
// (current conditions of the nearest station, the 9-day forecast), with the
// warnings and signals in force as alerts; a house outside Hong Kong gets "no
// forecast", and the core moves on to its next provider.
//
//   onWeatherGet       the pivot payload, from the data in memory;
//   onSceneAction      "rain within the hour", "forecast of the day" and
//                      "warnings in force" (scene-actions.js);
//   publishSceneEvent  "rain expected within the hour" and "Hong Kong
//                      warning changed" (scene-triggers.js);
//   requestWeatherRefresh  after a warning change, so that the core's own
//                      weather-alert trigger sees it within a minute;
//   onAction           "Test the Observatory".
//
// No widget: the weather widget of the core already draws everything the
// Observatory gives (current conditions, 8 days, the warnings).
//
// One timer refreshes the data sets (scheduler.js); everything else reads
// the store (store.js). The SDK client is injected, so the tests drive this
// module with the fake Gladys of the SDK.
// -----------------------------------------------------------------------------

import { ERROR_KINDS, HkoError } from './api.js';
import { inHongKong } from './area.js';
import { normalizeConfig } from './config.js';
import { createFailureLog } from './failure-log.js';
import { createHouseRegistry } from './houses.js';
import { buildWeather, currentAt } from './pivot.js';
import {
  SCENE_ACTIONS,
  currentWarnings,
  dayForecast,
  precipitationNextHour,
} from './scene-actions.js';
import { createWatcher } from './scene-triggers.js';
import { createScheduler } from './scheduler.js';
import { DATASETS, createStore } from './store.js';
import { LANGUAGES, MESSAGES, TEMPLATES, resolveLanguage, warningsSentence } from './texts.js';
import { UNIT_SYSTEMS } from './units.js';

/**
 * @description The connection status matching the last refresh cycle.
 * @param {object|null} summary - The last cycle summary.
 * @returns {{connected: boolean, message?: object}} The status.
 * @example
 * connectionStatus({ houses: 1, inArea: 1, refreshed: 5, error: null });
 */
function connectionStatus(summary) {
  if (summary !== null && summary.houses === 0) {
    return { connected: false, message: MESSAGES.noLocation };
  }
  if (summary !== null && summary.inArea === 0) {
    return { connected: false, message: MESSAGES.noHouseInArea };
  }
  const error = summary?.error ?? null;
  if (error === null) {
    return { connected: true };
  }
  switch (error.kind) {
    case ERROR_KINDS.THROTTLED:
      return { connected: false, message: MESSAGES.throttled };
    case ERROR_KINDS.FORBIDDEN:
      return { connected: false, message: MESSAGES.forbidden };
    case ERROR_KINDS.REQUEST:
    case ERROR_KINDS.INVALID:
      return { connected: false, message: MESSAGES.invalid };
    default:
      return { connected: false, message: MESSAGES.unreachable };
  }
}

/**
 * @description Format a time, 24-hour, in Hong Kong time.
 * @param {number} ms - The instant.
 * @returns {string} 'HH:MM'.
 * @example
 * formatClock(Date.UTC(2026, 9, 24, 4, 0)); // -> '12:00'
 */
function formatClock(ms) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Hong_Kong',
  }).format(ms);
}

/**
 * @description Create the integration on a Gladys client.
 * @param {object} gladys - The SDK client (GladysIntegration, or a fake).
 * @param {object} [options] - Options, for the tests.
 * @param {Function} [options.fetchImpl] - fetch.
 * @param {Function} [options.now] - `() => ms`.
 * @param {Function} [options.random] - `() => [0, 1)`, the jitter.
 * @param {object} [options.logger] - Logger with info/warn/debug/error.
 * @param {Function} [options.setTimer] - setTimeout.
 * @param {Function} [options.clearTimer] - clearTimeout.
 * @returns {object} The running parts ({ store, scheduler, houses, watcher,
 * config }).
 * @example
 * createApp(new GladysIntegration());
 */
function createApp(
  gladys,
  {
    fetchImpl = globalThis.fetch,
    now = Date.now,
    random,
    logger = console,
    setTimer,
    clearTimer,
  } = {},
) {
  let config = normalizeConfig(gladys.config ?? {});
  // Language and units of the last request of the core, for the scenes.
  let lastLanguage = null;
  let lastUnits = null;
  let lastSummary = null;
  let lastStatus = null;
  const failures = createFailureLog(logger);

  const language = () => resolveLanguage(config.language, lastLanguage);
  const units = () => {
    const wanted = config.units === 'auto' ? lastUnits : config.units;
    return wanted === UNIT_SYSTEMS.US ? UNIT_SYSTEMS.US : UNIT_SYSTEMS.METRIC;
  };

  const houses = createHouseRegistry({ fetchHouses: () => gladys.getHouses(), logger });
  const store = createStore({ fetchImpl, now, logger });
  const watcher = createWatcher({
    publish: (key, data) => gladys.publishSceneEvent(key, data),
    getLanguage: language,
    getUnits: units,
    logger,
    now,
  });

  /**
   * @description Publish the connection status, only when it changed.
   * @returns {Promise<void>} Resolves once published (or refused).
   * @example
   * await publishStatus();
   */
  async function publishStatus() {
    const status = connectionStatus(lastSummary);
    const serialized = JSON.stringify(status);
    if (serialized === lastStatus) {
      return;
    }
    try {
      await gladys.setConnectionStatus(status.connected, status.message);
      lastStatus = serialized;
      failures.recover('status', 'The connection status is published again');
    } catch (err) {
      // Retried at every cycle: logged once while it lasts.
      failures.fail('status', `Unable to publish the connection status: ${err.message}`);
    }
  }

  /**
   * @description Fire the triggers of every house in Hong Kong. After a
   * warning change, the core is asked to pull the weather again, for its own
   * alert trigger.
   * @returns {Promise<void>} Resolves once observed.
   * @example
   * await observe();
   */
  async function observe() {
    const inArea = houses.list().filter((house) => inHongKong(house.latitude, house.longitude));
    watcher.forget(new Set(inArea.map((house) => house.id)));
    const warnings = store.peekWarnings();
    let changed = false;
    for (const house of inArea) {
      await watcher.observeRain(house, store.nowcastAt(house.latitude, house.longitude));
      const published = await watcher.observeWarnings(house, warnings);
      changed ||= published.length > 0;
    }
    if (changed) {
      try {
        await gladys.requestWeatherRefresh();
      } catch (err) {
        logger.debug(`Weather refresh request refused: ${err.message}`);
      }
    }
  }

  const scheduler = createScheduler({
    houses,
    store,
    logger,
    now,
    ...(random ? { random } : {}),
    ...(setTimer ? { setTimer } : {}),
    ...(clearTimer ? { clearTimer } : {}),
    onNowcast: async () => {
      for (const house of houses.list()) {
        if (inHongKong(house.latitude, house.longitude)) {
          await watcher.observeRain(house, store.nowcastAt(house.latitude, house.longitude));
        }
      }
    },
    onCycle: async (summary) => {
      lastSummary = summary;
      await observe();
      // Every cycle, every 10 minutes or so: debug, not info.
      logger.debug(
        `Refreshed ${summary.refreshed} data set(s) for ${summary.inArea} house(s) in Hong Kong; next refresh in ${Math.round(summary.delayMs / 60000)} min`,
      );
      await publishStatus();
    },
  });

  /**
   * @description The house a scene action targets, reading the houses once
   * more when none is known yet.
   * @param {any} wanted - The "House" field (a selector).
   * @returns {Promise<object>} The house.
   * @example
   * await resolveHouse('');
   */
  async function resolveHouse(wanted) {
    if (houses.list().length === 0) {
      await houses.refresh();
    }
    return houses.resolve(wanted);
  }

  /**
   * @description A data set for a reader, null when unavailable.
   * @param {string} name - One of DATASETS.
   * @returns {Promise<object|null>} The parsed value.
   * @example
   * await optional('local');
   */
  async function optional(name) {
    try {
      return (await store.load(name)).value;
    } catch {
      // Logged once by the store.
      return null;
    }
  }

  // --- Weather request: the dashboard, the chat, the alert scenes -------------
  gladys.onWeatherGet(async ({ latitude, longitude, language: requested, units: wanted } = {}) => {
    if (typeof requested === 'string' && requested !== '') {
      lastLanguage = requested;
    }
    const unitSystem = wanted === UNIT_SYSTEMS.US ? UNIT_SYSTEMS.US : UNIT_SYSTEMS.METRIC;
    lastUnits = unitSystem;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error('The house has no location');
    }
    if (!inHongKong(latitude, longitude)) {
      // Not an outage: the core tries its next weather provider.
      throw new HkoError(ERROR_KINDS.INVALID, 'The house is outside Hong Kong: no forecast');
    }
    // All at once: the core waits 15 s, each call 10 s at most. Only the
    // current report is required; days and alerts are optional in the pivot.
    const [current, forecast, warnings] = await Promise.all([
      store.load(DATASETS.current),
      optional(DATASETS.forecast),
      optional(DATASETS.warnings),
    ]);
    return buildWeather(
      { current: current.value, forecast, warnings },
      {
        latitude,
        longitude,
        units: unitSystem,
        language: resolveLanguage(requested ?? 'en'),
        now: now(),
      },
    );
  });

  // --- Scene action: rain within the hour ----------------------------------
  gladys.onSceneAction(SCENE_ACTIONS.GET_PRECIPITATION_NEXT_HOUR, async (fields = {}) => {
    const house = await resolveHouse(fields?.house);
    const nowcast = inHongKong(house.latitude, house.longitude)
      ? store.nowcastAt(house.latitude, house.longitude)
      : null;
    return precipitationNextHour(nowcast, { language: language(), units: units(), now: now() });
  });

  // --- Scene action: forecast of today or tomorrow -------------------------
  gladys.onSceneAction(SCENE_ACTIONS.GET_DAY_FORECAST, async (fields = {}) => {
    const house = await resolveHouse(fields?.house);
    if (!inHongKong(house.latitude, house.longitude)) {
      return { available: false, summary: MESSAGES.outsideArea[language()] };
    }
    const [forecast, local, current] = await Promise.all(
      [DATASETS.forecast, DATASETS.local, DATASETS.current].map(optional),
    );
    return dayForecast(
      { forecast, local, current },
      { day: fields?.day, language: language(), units: units(), now: now() },
    );
  });

  // --- Scene action: warnings in force -------------------------------------
  gladys.onSceneAction(SCENE_ACTIONS.GET_WARNINGS, async (fields = {}) => {
    const house = await resolveHouse(fields?.house);
    const inArea = inHongKong(house.latitude, house.longitude);
    return currentWarnings(inArea ? await optional(DATASETS.warnings) : null, {
      inArea,
      language: language(),
    });
  });

  // --- Configuration action: test the Observatory ----------------------------
  gladys.onAction('test_connection', async () => {
    const located = houses.list().length === 0 ? await houses.refresh() : houses.list();
    const house =
      located.find((candidate) => inHongKong(candidate.latitude, candidate.longitude)) ??
      located[0] ??
      null;
    if (house !== null && !inHongKong(house.latitude, house.longitude)) {
      // Nothing to ask the Observatory about this house.
      return Object.fromEntries(
        Object.values(LANGUAGES).map((lang) => [
          lang,
          TEMPLATES.testOutside[lang]({ house: house.name }),
        ]),
      );
    }
    const [{ value: current }, warnings] = await Promise.all([
      store.load(DATASETS.current),
      optional(DATASETS.warnings),
    ]);
    // A refresh that failed before may now work: run a cycle.
    if (lastSummary?.error) {
      scheduler.requestCycle();
    }
    const here = currentAt(current, house ?? { latitude: 22.302, longitude: 114.174 });
    return Object.fromEntries(
      Object.values(LANGUAGES).map((lang) => [
        lang,
        TEMPLATES.testSucceeded[lang]({
          temperature: here.temperature,
          station: here.station,
          time: formatClock(here.time ?? now()),
          warnings:
            warnings === null ? MESSAGES.warningsUnknown[lang] : warningsSentence(warnings, lang),
        }).slice(0, 200),
      ]),
    );
  });

  // --- Configuration ---------------------------------------------------------
  gladys.onConfigUpdated(async (raw) => {
    config = normalizeConfig(raw);
  });

  // --- Connection lifecycle --------------------------------------------------
  gladys.on('connected', async () => {
    try {
      config = normalizeConfig(await gladys.getConfig());
      // Gladys may have restarted: publish the status again.
      lastStatus = null;
      if (!scheduler.started) {
        // The first cycle runs in the background: the connection must not
        // wait for the Observatory.
        scheduler.start();
      } else {
        await houses.refresh();
        await publishStatus();
      }
    } catch (err) {
      logger.error(`Post-connection initialization failed: ${err.message}`);
    }
  });

  return {
    store,
    scheduler,
    houses,
    watcher,
    get config() {
      return config;
    },
  };
}

export { connectionStatus, createApp, formatClock };
