// -----------------------------------------------------------------------------
// The Observatory's data → the pivot weather format of Gladys (contract B.18).
//
//   current  the temperature of the nearest station of the current weather
//            report, the humidity measured at the Observatory, the UV index
//            of the past hour (King's Park, daytime only), the weather of the
//            report's icon, the sun computed for the house;
//   days     the 9-day forecast (8 days at most), cut at Hong Kong
//            midnights: icon, temperatures, humidity (the middle of the
//            forecast range), wind read from the forecast words, and the
//            probability of significant rain as the middle of its class;
//   alerts   the warnings and signals in force, in the language of the
//            request.
//
// No `hours`: the open data of the Observatory has no hourly forecast. Values
// come in °C, m/s; the request's unit system converts them (units.js).
// -----------------------------------------------------------------------------

import { DAY_MS, hkDate, hkMidnight, nearestReading } from './area.js';
import { RAIN_CHANCES, iconCondition } from './conditions.js';
import { isSunUp, sunTimes } from './sun.js';
import { warningName } from './texts.js';
import { fromMetric, round } from './units.js';
import { toAlerts } from './warnings.js';

const MAX_DAYS = 8;

/**
 * @description An ISO date, or null.
 * @param {number|null} ms - The instant.
 * @returns {string|null} The ISO text.
 * @example
 * isoDate(0); // -> '1970-01-01T00:00:00.000Z'
 */
function isoDate(ms) {
  return ms === null || ms === undefined ? null : new Date(ms).toISOString();
}

/**
 * @description Drop the null fields of an object.
 * @param {object} object - The object.
 * @returns {object} A copy without null or undefined fields.
 * @example
 * compact({ a: 1, b: null }); // -> { a: 1 }
 */
function compact(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== null && value !== undefined),
  );
}

/**
 * @description The middle of a humidity range.
 * @param {number|null} min - The minimum.
 * @param {number|null} max - The maximum.
 * @returns {number|null} The middle.
 * @example
 * middle(60, 90); // -> 75
 */
function middle(min, max) {
  return min === null || max === null ? null : Math.round((min + max) / 2);
}

/**
 * @description The current conditions of a location.
 * @param {object} current - The parsed current weather report.
 * @param {object} location - `{ latitude, longitude }`.
 * @returns {object} `{ station, temperature, time }` (station name, °C, ms).
 * @example
 * currentAt(current, { latitude: 22.28, longitude: 114.16 });
 */
function currentAt(current, { latitude, longitude }) {
  const reading =
    nearestReading(current.temperatures, latitude, longitude) ??
    current.temperatures.find((candidate) => candidate.place === 'Hong Kong Observatory') ??
    current.temperatures[0];
  return { station: reading.place, temperature: reading.value, time: current.temperatureTime };
}

/**
 * @description Build the pivot weather of a location.
 * @param {object} data - `{ current, forecast, warnings }`: the parsed
 * report, the parsed 9-day forecast, the parsed warnings (or null).
 * @param {object} options - Options.
 * @param {number} options.latitude - The latitude of the house.
 * @param {number} options.longitude - The longitude of the house.
 * @param {string} options.units - 'metric' or 'us'.
 * @param {string} [options.language] - The language of the alerts.
 * @param {number} [options.now] - The current time in ms.
 * @returns {object} The pivot weather.
 * @example
 * buildWeather({ current, forecast, warnings }, { latitude, longitude, units: 'metric' });
 */
function buildWeather(
  { current, forecast, warnings },
  { latitude, longitude, units, language = 'en', now = Date.now() },
) {
  const convert = fromMetric(units);
  const here = currentAt(current, { latitude, longitude });
  const todayStart = hkMidnight(hkDate(now));
  const today = sunTimes(todayStart, todayStart + DAY_MS, latitude, longitude);
  const weather = compact({
    temperature: convert.temperature(here.temperature),
    weather: iconCondition(current.icon) ?? 'unknown',
    datetime: isoDate(here.time ?? now),
    humidity: round(current.humidity, 0),
    uv_index: round(current.uvIndex, 0),
    sunrise: isoDate(today.sunrise),
    sunset: isoDate(today.sunset),
    is_day: isSunUp(now, latitude, longitude),
  });

  weather.days = forecast.days
    .filter((day) => day.date >= hkDate(now))
    .slice(0, MAX_DAYS)
    .map((day) => {
      const start = hkMidnight(day.date);
      const sun = sunTimes(start, start + DAY_MS, latitude, longitude);
      return compact({
        temperature_min: convert.temperature(day.temperatureMin),
        temperature_max: convert.temperature(day.temperatureMax),
        datetime: isoDate(start),
        weather: iconCondition(day.icon),
        humidity: middle(day.humidityMin, day.humidityMax),
        wind_speed: convert.speed(day.windSpeed),
        wind_direction: day.windDirection,
        precipitation_probability: day.rainChance === null ? null : RAIN_CHANCES[day.rainChance],
        sunrise: isoDate(sun.sunrise),
        sunset: isoDate(sun.sunset),
      });
    });

  if (Array.isArray(warnings) && warnings.length > 0) {
    weather.alerts = toAlerts(warnings, (warning) => warningName(warning, language));
  }
  return weather;
}

export { MAX_DAYS, buildWeather, compact, currentAt, isoDate };
