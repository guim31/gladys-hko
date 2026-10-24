// -----------------------------------------------------------------------------
// The current weather report and the forecasts, read into slim objects.
//
// rhrread (current weather report, updated about every hour, temperatures
// every 10 minutes): a temperature per station, the humidity at the
// Observatory, the UV index of the past hour at King's Park (empty at night),
// the weather icon. Only the fields the integration uses are kept.
//
// fnd (9-day forecast, updated twice a day): one entry per day from
// tomorrow — today is in it only between midnight and the morning update —
// with its icon, temperatures, humidity, wind (words), probability of
// significant rain and a short English text.
//
// flw (local forecast): the English text of the forecast for the rest of
// today and tonight; "today" falls back on it when fnd no longer holds today.
//
// The Observatory publishes no hourly forecast in its open data: the pivot of
// Gladys gets no `hours`, and the 24-hour strip of the weather widget stays
// empty (said in the documentation).
// -----------------------------------------------------------------------------

import { parseWind, rainChance } from './conditions.js';

/**
 * @description A finite number, or null.
 * @param {any} value - The value ('', null, a string or a number).
 * @returns {number|null} The number.
 * @example
 * finite('29'); // -> 29
 */
function finite(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * @description An instant of the Observatory ('2026-10-24T12:00:00+08:00').
 * @param {any} value - The text.
 * @returns {number|null} The instant in ms.
 * @example
 * instant('2026-10-24T12:00:00+08:00');
 */
function instant(value) {
  const ms = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

/**
 * @description Read the current weather report.
 * @param {object} json - The rhrread answer.
 * @returns {object} `{ updatedAt, temperatures: [{ place, value }],
 * temperatureTime, humidity, uvIndex, icon }`.
 * @throws {Error} When the answer holds no temperature at all.
 * @example
 * parseCurrent(rhrread);
 */
function parseCurrent(json) {
  const temperatures = (Array.isArray(json?.temperature?.data) ? json.temperature.data : [])
    .map((reading) => ({ place: String(reading?.place ?? ''), value: finite(reading?.value) }))
    .filter((reading) => reading.place !== '' && reading.value !== null);
  if (temperatures.length === 0) {
    throw new Error('The current weather report holds no temperature');
  }
  const humidity = Array.isArray(json?.humidity?.data)
    ? finite(json.humidity.data.find((reading) => finite(reading?.value) !== null)?.value)
    : null;
  const uv = Array.isArray(json?.uvindex?.data) ? json.uvindex.data[0] : null;
  const icon = Array.isArray(json?.icon) ? finite(json.icon[0]) : null;
  return {
    updatedAt: instant(json.updateTime),
    temperatures,
    temperatureTime: instant(json?.temperature?.recordTime) ?? instant(json.updateTime),
    humidity,
    uvIndex: finite(uv?.value),
    icon,
  };
}

/**
 * @description Read the 9-day forecast.
 * @param {object} json - The fnd answer.
 * @returns {object} `{ updatedAt, days: [{ date ('YYYY-MM-DD'), icon,
 * temperatureMin, temperatureMax, humidityMin, humidityMax, rainChance,
 * windDirection, windForce, windSpeed, text }] }`.
 * @throws {Error} When no day is readable.
 * @example
 * parseForecast(fnd);
 */
function parseForecast(json) {
  const days = (Array.isArray(json?.weatherForecast) ? json.weatherForecast : [])
    .map((day) => {
      const date = /^(\d{4})(\d{2})(\d{2})$/.exec(String(day?.forecastDate ?? ''));
      const wind = parseWind(day?.forecastWind);
      return {
        date: date === null ? null : `${date[1]}-${date[2]}-${date[3]}`,
        icon: finite(day?.ForecastIcon),
        temperatureMin: finite(day?.forecastMintemp?.value),
        temperatureMax: finite(day?.forecastMaxtemp?.value),
        humidityMin: finite(day?.forecastMinrh?.value),
        humidityMax: finite(day?.forecastMaxrh?.value),
        rainChance: rainChance(day?.PSR),
        windDirection: wind.direction,
        windForce: wind.force,
        windSpeed: wind.speed,
        text: typeof day?.forecastWeather === 'string' ? day.forecastWeather.trim() : '',
      };
    })
    .filter(
      (day) => day.date !== null && day.temperatureMin !== null && day.temperatureMax !== null,
    );
  if (days.length === 0) {
    throw new Error('The 9-day forecast holds no day');
  }
  return { updatedAt: instant(json.updateTime), days };
}

/**
 * @description Read the local forecast.
 * @param {object} json - The flw answer.
 * @returns {{updatedAt: number|null, text: string}} The forecast text of
 * today and tonight.
 * @example
 * parseLocalForecast(flw);
 */
function parseLocalForecast(json) {
  return {
    updatedAt: instant(json?.updateTime),
    text: typeof json?.forecastDesc === 'string' ? json.forecastDesc.trim() : '',
  };
}

export { finite, instant, parseCurrent, parseForecast, parseLocalForecast };
