// -----------------------------------------------------------------------------
// Scene actions: read-only questions a scene asks the Observatory, then gates
// on.
//
//   get_precipitation_next_hour  "will it rain within the hour?" — close the
//                                awning, skip the watering, warn before
//                                leaving (rainfall nowcast);
//   get_day_forecast             "what will today / tomorrow be like?" — the
//                                morning message, the evening plan;
//   get_warnings                 "which warnings and signals are in force?" —
//                                the typhoon signal number, the rainstorm
//                                colour, the highest severity, to gate a
//                                scene on them.
//
// They read what the scheduler keeps in memory: no call (a call is made only
// when a data set has not been refreshed for a while). Outputs are scalars
// the following actions of the scene can read; a value the Observatory does
// not give is left out rather than sent as a fake number. Temperatures and
// wind follow the `units` setting, the sentences the `language` setting.
// -----------------------------------------------------------------------------

import { DAY_MS, hkDate } from './area.js';
import { RAIN_CHANCES, iconCondition } from './conditions.js';
import { readNextHour } from './nowcast.js';
import {
  MESSAGES,
  conditionName,
  daySentence,
  nextHourSentence,
  pick,
  warningName,
  warningsSentence,
} from './texts.js';
import { fromMetric, unitLabels } from './units.js';
import { cycloneSignal } from './warnings.js';

const SCENE_ACTIONS = Object.freeze({
  GET_PRECIPITATION_NEXT_HOUR: 'get_precipitation_next_hour',
  GET_DAY_FORECAST: 'get_day_forecast',
  GET_WARNINGS: 'get_warnings',
});

const DAYS = Object.freeze({ TODAY: 'today', TOMORROW: 'tomorrow' });

const RAINSTORM_COLOURS = Object.freeze({ WRAINA: 'amber', WRAINR: 'red', WRAINB: 'black' });

/**
 * @description The outputs of the next-hour action, also the variables of
 * the trigger.
 * @param {object} reading - A readNextHour() result.
 * @param {object} options - Options.
 * @param {string} options.language - 'en', 'fr', 'de' or 'es'.
 * @param {string} options.units - 'metric' or 'us'.
 * @returns {object} `{ available, precipitation_expected, minutes_until?,
 * intensity?, precipitation?, summary }`.
 * @example
 * buildNextHourOutputs(reading, { language: 'en', units: 'metric' });
 */
function buildNextHourOutputs(reading, { language, units }) {
  const outputs = {
    available: reading.available,
    precipitation_expected: reading.available && reading.minutesUntil !== null,
  };
  if (reading.available) {
    outputs.precipitation = fromMetric(units).precipitation(reading.amount);
  }
  if (outputs.precipitation_expected) {
    outputs.minutes_until = reading.minutesUntil;
    outputs.intensity = reading.intensity;
  }
  outputs.summary = nextHourSentence(reading, language);
  return outputs;
}

/**
 * @description Run the next-hour action on a nowcast.
 * @param {object|null} nowcast - The nowcast of the house.
 * @param {object} options - Options.
 * @param {string} options.language - 'en', 'fr', 'de' or 'es'.
 * @param {string} options.units - 'metric' or 'us'.
 * @param {number} [options.now] - The current time in ms.
 * @returns {object} The outputs.
 * @example
 * precipitationNextHour(nowcast, { language: 'fr', units: 'metric' });
 */
function precipitationNextHour(nowcast, { language, units, now = Date.now() }) {
  return buildNextHourOutputs(readNextHour(nowcast, now), { language, units });
}

/**
 * @description Run the day action.
 * @param {object} data - `{ forecast, local, current }`, each parsed or null.
 * @param {object} options - Options.
 * @param {any} options.day - The "Day" field: 'today' (default) or 'tomorrow'.
 * @param {string} options.language - 'en', 'fr', 'de' or 'es'.
 * @param {string} options.units - 'metric' or 'us'.
 * @param {number} [options.now] - The current time in ms.
 * @returns {object} `{ available, condition?, condition_name?,
 * temperature_min?, temperature_max?, humidity_min?, humidity_max?,
 * rain_chance?, precipitation_probability?, wind_speed?, forecast_text?,
 * summary }`.
 * @example
 * dayForecast({ forecast, local, current }, { day: 'tomorrow', language: 'en', units: 'metric' });
 */
function dayForecast({ forecast, local, current }, { day, language, units, now = Date.now() }) {
  const which = day === DAYS.TOMORROW ? DAYS.TOMORROW : DAYS.TODAY;
  const date = hkDate(which === DAYS.TODAY ? now : now + DAY_MS);
  const target = forecast?.days.find((candidate) => candidate.date === date);
  const convert = fromMetric(units);
  const labels = unitLabels(units);
  if (target !== undefined) {
    const condition = iconCondition(target.icon) ?? 'unknown';
    const outputs = {
      available: true,
      condition,
      condition_name: conditionName(condition, language),
      temperature_min: convert.temperature(target.temperatureMin),
      temperature_max: convert.temperature(target.temperatureMax),
    };
    const optional = {
      humidity_min: target.humidityMin,
      humidity_max: target.humidityMax,
      rain_chance: target.rainChance,
      precipitation_probability:
        target.rainChance === null ? null : RAIN_CHANCES[target.rainChance],
      wind_speed: convert.speed(target.windSpeed),
      forecast_text: target.text === '' ? null : target.text.slice(0, 500),
    };
    for (const [key, value] of Object.entries(optional)) {
      if (value !== null) {
        outputs[key] = value;
      }
    }
    outputs.summary = daySentence(
      {
        day: which,
        condition,
        min: outputs.temperature_min,
        max: outputs.temperature_max,
        rainChance: target.rainChance,
        labels,
      },
      language,
    );
    return outputs;
  }
  // The 9-day forecast starts tomorrow once the morning update is out: today
  // is then the weather of the current report and the local forecast text.
  if (which === DAYS.TODAY && current !== null && current !== undefined) {
    const condition = iconCondition(current.icon) ?? 'unknown';
    const outputs = {
      available: true,
      condition,
      condition_name: conditionName(condition, language),
    };
    if (local?.text) {
      outputs.forecast_text = local.text.slice(0, 500);
    }
    outputs.summary = daySentence(
      { day: which, condition, min: null, max: null, rainChance: null, labels },
      language,
    );
    return outputs;
  }
  return { available: false, summary: pick(MESSAGES, 'noDayForecast', language) };
}

/**
 * @description Run the warnings action.
 * @param {Array<object>|null} warnings - The parsed warnings, null when
 * unknown.
 * @param {object} options - Options.
 * @param {object} options.house - The house.
 * @param {boolean} options.inArea - Whether the house is in Hong Kong.
 * @param {string} options.language - 'en', 'fr', 'de' or 'es'.
 * @returns {object} `{ available, has_warning?, warning_count?, severity?,
 * tropical_cyclone_signal?, rainstorm_signal?, warning_type?, signal?,
 * name?, summary }`.
 * @example
 * currentWarnings(warnings, { house, inArea: true, language: 'en' });
 */
function currentWarnings(warnings, { inArea, language }) {
  if (!inArea) {
    return { available: false, summary: pick(MESSAGES, 'outsideArea', language) };
  }
  if (warnings === null) {
    return { available: false, summary: pick(MESSAGES, 'warningsUnknown', language) };
  }
  const [highest] = warnings;
  const cyclone = Math.max(0, ...warnings.map((warning) => cycloneSignal(warning.code)));
  const rainstorm = warnings.find((warning) => RAINSTORM_COLOURS[warning.code] !== undefined);
  const outputs = {
    available: true,
    has_warning: warnings.length > 0,
    warning_count: warnings.length,
    severity: highest?.severity ?? 'none',
    tropical_cyclone_signal: cyclone,
    rainstorm_signal: rainstorm === undefined ? 'none' : RAINSTORM_COLOURS[rainstorm.code],
  };
  if (highest !== undefined) {
    outputs.warning_type = highest.type;
    outputs.signal = highest.code;
    outputs.name = warningName(highest, language);
  }
  outputs.summary = warningsSentence(warnings, language);
  return outputs;
}

export {
  DAYS,
  RAINSTORM_COLOURS,
  SCENE_ACTIONS,
  buildNextHourOutputs,
  currentWarnings,
  dayForecast,
  precipitationNextHour,
};
