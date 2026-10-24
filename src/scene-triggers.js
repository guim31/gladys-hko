// -----------------------------------------------------------------------------
// Scene triggers.
//
// "Rain expected within the hour" (precipitation_expected). After each
// refresh cycle, the next hour of every house in Hong Kong (nowcast.js) is
// compared with the previous reading: when the previous one was dry and the
// new one holds rain, the trigger fires once, with how hard and when. The
// reading is redone on every cycle (10 minutes), even when the nowcast did
// not change: the hour did. Guards: the first reading of a house after a
// start is a baseline, it never fires (a restart during a shower must not
// announce it again); a gap in the nowcast keeps the previous reading as the
// baseline; a house fires at most once an hour.
//
// "Hong Kong warning changed" (warning_changed). After each cycle, the
// warnings in force are compared with the previous reading (warnings.js
// diffWarnings): a signal issued, upgraded (TC3 → TC8, amber → red),
// downgraded, updated (TC8 changing quadrant, reissued, extended) or lifted
// fires the trigger once per house in Hong Kong. What it adds to the core's
// own weather-alert trigger, which also sees these warnings through the
// alerts of the weather answer: the Observatory's signals themselves (the
// typhoon signal number, the rainstorm colour), downgrades and updates (the
// core fires on new or higher alerts and on their end only), and a sentence
// in the language of the user. Guards: the first reading of a house is a
// baseline; an unknown list (Observatory unreachable) is no reading, so a
// failure never looks like every warning being lifted.
// -----------------------------------------------------------------------------

import { isRainAnnounced, readNextHour } from './nowcast.js';
import { buildNextHourOutputs } from './scene-actions.js';
import { warningChangeSentence, warningName } from './texts.js';
import { diffWarnings } from './warnings.js';

const SCENE_TRIGGERS = Object.freeze({
  PRECIPITATION_EXPECTED: 'precipitation_expected',
  WARNING_CHANGED: 'warning_changed',
});

const COOLDOWN_MS = 60 * 60 * 1000;

// The SDK refuses a scene event holding a string longer than this
// (MAX_SCENE_EVENT_STRING_LENGTH): the whole event would be lost.
const MAX_EVENT_STRING = 1000;

/**
 * @description Cut a text to the longest string a scene event may carry.
 * @param {string} text - The text.
 * @returns {string} The text, cut with an ellipsis when too long.
 * @example
 * bounded('a'.repeat(3000)).length; // -> 1000
 */
function bounded(text) {
  return text.length <= MAX_EVENT_STRING ? text : `${text.slice(0, MAX_EVENT_STRING - 1)}…`;
}

/**
 * @description Build the event data of the rain trigger: flat, the filter
 * keys (`house` is the selector the scene card stores) and the variables.
 * @param {object} house - The house.
 * @param {object} reading - The reading announcing rain.
 * @param {object} options - `{ language, units }`.
 * @returns {object} The event data.
 * @example
 * buildRainEventData(house, reading, { language: 'en', units: 'metric' });
 */
function buildRainEventData(house, reading, { language, units }) {
  const outputs = buildNextHourOutputs(reading, { language, units });
  delete outputs.available;
  delete outputs.precipitation_expected;
  return { house: house.selector, house_name: house.name, ...outputs };
}

/**
 * @description Build the event data of the warning trigger.
 * @param {object} house - The house.
 * @param {object} change - `{ change, warning, previous? }` (diffWarnings).
 * @param {object} options - `{ language }`.
 * @returns {object} The event data.
 * @example
 * buildWarningEventData(house, change, { language: 'en' });
 */
function buildWarningEventData(house, change, { language }) {
  const { warning } = change;
  return {
    house: house.selector,
    change: change.change,
    severity: warning.severity,
    warning_type: warning.type,
    house_name: house.name,
    signal: warning.code,
    name: warningName(warning, language),
    description: bounded(warning.contents),
    summary: warningChangeSentence(change, language),
  };
}

/**
 * @description Create the watcher of the two triggers.
 * @param {object} options - Options.
 * @param {Function} options.publish - `(key, data) => Promise`, the SDK
 * publishSceneEvent.
 * @param {Function} options.getLanguage - `() => 'en'|'fr'|'de'|'es'`.
 * @param {Function} options.getUnits - `() => 'metric'|'us'`.
 * @param {object} [options.logger] - Logger with info/warn/debug.
 * @param {Function} [options.now] - `() => ms`, for the tests.
 * @returns {object} `{ observeRain, observeWarnings, forget }`.
 * @example
 * const watcher = createWatcher({ publish, getLanguage, getUnits });
 */
function createWatcher({ publish, getLanguage, getUnits, logger = console, now = Date.now }) {
  // house id -> { reading, lastFiredAt }
  const rain = new Map();
  // house id -> the warnings of the previous reading
  const warnings = new Map();

  /**
   * @description Publish an event, never throwing.
   * @param {string} key - The trigger key.
   * @param {object} data - The event data.
   * @returns {Promise<void>} Resolves once published (or refused).
   * @example
   * await send('warning_changed', data);
   */
  async function send(key, data) {
    try {
      await publish(key, data);
    } catch (err) {
      // Refused (core too old, disconnected, rate limited): logged, never
      // thrown — the refresh cycle carries on.
      logger.warn(`Scene event refused: ${err.message}`);
    }
  }

  /**
   * @description Compare the next hour of a house with its previous reading,
   * and fire the trigger on the dry → wet transition.
   * @param {object} house - The house.
   * @param {object|null} nowcast - Its nowcast.
   * @returns {Promise<object|null>} The published event data, or null.
   * @example
   * await watcher.observeRain(house, nowcast);
   */
  async function observeRain(house, nowcast) {
    const reading = readNextHour(nowcast, now());
    const state = rain.get(house.id) ?? { reading: null, lastFiredAt: null };
    const announced = isRainAnnounced(state.reading, reading);
    // A gap in the nowcast (download failed, file too old) is no reading:
    // the last available one stays the baseline, so rain announced by the
    // next file still fires.
    if (reading.available) {
      rain.set(house.id, { ...state, reading });
    }
    if (!announced) {
      return null;
    }
    if (state.lastFiredAt !== null && now() - state.lastFiredAt < COOLDOWN_MS) {
      logger.debug(`Rain trigger for "${house.name}" skipped (cooldown)`);
      return null;
    }
    rain.set(house.id, { reading, lastFiredAt: now() });
    const data = buildRainEventData(house, reading, {
      language: getLanguage(),
      units: getUnits(),
    });
    logger.debug(`Scene event ${SCENE_TRIGGERS.PRECIPITATION_EXPECTED} for "${house.name}"`);
    await send(SCENE_TRIGGERS.PRECIPITATION_EXPECTED, data);
    return data;
  }

  /**
   * @description Compare the warnings with the previous reading of a house,
   * and fire the trigger for each change.
   * @param {object} house - The house.
   * @param {Array<object>|null} current - The warnings in force, null when
   * unknown.
   * @returns {Promise<Array<object>>} The published event data.
   * @example
   * await watcher.observeWarnings(house, warnings);
   */
  async function observeWarnings(house, current) {
    if (current === null) {
      return [];
    }
    const previous = warnings.get(house.id);
    warnings.set(house.id, current);
    if (previous === undefined) {
      return [];
    }
    const published = [];
    for (const change of diffWarnings(previous, current)) {
      const data = buildWarningEventData(house, change, { language: getLanguage() });
      // One line per warning change: a rare, user-visible event.
      logger.info(`Warning ${change.change} for "${house.name}": ${change.warning.code}`);
      await send(SCENE_TRIGGERS.WARNING_CHANGED, data);
      published.push(data);
    }
    return published;
  }

  /**
   * @description Forget the houses that disappeared (deleted, unlocated,
   * moved out of Hong Kong).
   * @param {Set<any>} ids - The ids of the houses still watched.
   * @example
   * watcher.forget(new Set([1, 2]));
   */
  function forget(ids) {
    for (const states of [rain, warnings]) {
      for (const id of states.keys()) {
        if (!ids.has(id)) {
          states.delete(id);
        }
      }
    }
  }

  return { observeRain, observeWarnings, forget };
}

export {
  COOLDOWN_MS,
  MAX_EVENT_STRING,
  SCENE_TRIGGERS,
  buildRainEventData,
  buildWarningEventData,
  createWatcher,
};
