// -----------------------------------------------------------------------------
// Rain within the hour, from the Observatory's rainfall nowcast.
//
// The nowcast (data.gov.hk, "gridded rainfall nowcast") is a CSV over the
// Pearl River Delta: a grid of about 2 km (121 × 121 points), four half-hour
// steps covering the next two hours, the accumulated rainfall of each step in
// mm. A row: issue time, end of the step (both 'YYYYMMDDHHmm', Hong Kong
// time), latitude, longitude, mm. It is issued every 6 to 12 minutes; the
// integration downloads it every 30 minutes (2.7 MB), so a reading is up to
// half an hour old: it still covers the next 90 minutes.
//
// For each house, the nearest grid point (within 0.03°) is kept. "Within the
// hour" reads the steps overlapping the next 60 minutes. A step is wet from
// 0.25 mm in its half hour (0.5 mm/h): below, the nowcast speaks of traces.
// The intensity is the rate of the wettest step: light under 2.5 mm/h,
// moderate up to 7.6 mm/h, heavy above — the usual rainfall rates.
//
// A nowcast that no longer covers the next hour (older than an hour) is "not
// available": the trigger stays silent and the scene action says so, instead
// of reading "dry" into missing data.
// -----------------------------------------------------------------------------

import { HK_OFFSET_MS } from './area.js';

const WET_MM = 0.25;
const MODERATE_MM_H = 2.5;
const HEAVY_MM_H = 7.6;
const MAX_GRID_DISTANCE_DEG = 0.03;
const WINDOW_MS = 60 * 60 * 1000;
const STEP_MS = 30 * 60 * 1000;

const INTENSITIES = Object.freeze({ LIGHT: 'light', MODERATE: 'moderate', HEAVY: 'heavy' });

/**
 * @description An instant of the nowcast ('202610241230', Hong Kong time).
 * @param {string} text - The text.
 * @returns {number|null} The instant in ms.
 * @example
 * nowcastTime('202610241230'); // -> Date.UTC(2026, 9, 24, 4, 30)
 */
function nowcastTime(text) {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(text);
  if (match === null) {
    return null;
  }
  const [, y, mo, d, h, mi] = match.map(Number);
  return Date.UTC(y, mo - 1, d, h, mi) - HK_OFFSET_MS;
}

/**
 * @description Read the nowcast of the given locations.
 * @param {string} csv - The nowcast CSV.
 * @param {Array<{latitude: number, longitude: number}>} locations - The
 * locations.
 * @returns {Array<object|null>} For each location, `{ issuedAt, steps:
 * [{ start, end, mm }] }` (steps in time order), or null when no grid point
 * is near enough.
 * @throws {Error} When the file holds no row.
 * @example
 * parseNowcast(csv, [{ latitude: 22.28, longitude: 114.16 }]);
 */
function parseNowcast(csv, locations) {
  const rows = [];
  let start = csv.indexOf('\n') + 1;
  while (start > 0 && start < csv.length) {
    let end = csv.indexOf('\n', start);
    if (end === -1) {
      end = csv.length;
    }
    const fields = csv.slice(start, end).trim().split(',');
    start = end + 1;
    if (fields.length < 5) {
      continue;
    }
    const issuedAt = nowcastTime(fields[0]);
    const stepEnd = nowcastTime(fields[1]);
    const latitude = Number(fields[2]);
    const longitude = Number(fields[3]);
    const mm = Number(fields[4]);
    if (
      issuedAt === null ||
      stepEnd === null ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(mm)
    ) {
      continue;
    }
    rows.push({ issuedAt, stepEnd, latitude, longitude, mm });
  }
  if (rows.length === 0) {
    throw new Error('The rainfall nowcast holds no row');
  }
  return locations.map(({ latitude, longitude }) => {
    let best = null;
    let bestDistance = Infinity;
    for (const row of rows) {
      const distance = Math.hypot(row.latitude - latitude, row.longitude - longitude);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = row;
      }
    }
    if (best === null || bestDistance > MAX_GRID_DISTANCE_DEG) {
      return null;
    }
    const steps = rows
      .filter((row) => row.latitude === best.latitude && row.longitude === best.longitude)
      .sort((a, b) => a.stepEnd - b.stepEnd)
      .map((row) => ({ start: row.stepEnd - STEP_MS, end: row.stepEnd, mm: row.mm }));
    return { issuedAt: best.issuedAt, steps };
  });
}

/**
 * @description The intensity class of a rate.
 * @param {number} rate - mm/h.
 * @returns {string} One of INTENSITIES.
 * @example
 * intensityOfRate(3); // -> 'moderate'
 */
function intensityOfRate(rate) {
  if (rate >= HEAVY_MM_H) {
    return INTENSITIES.HEAVY;
  }
  if (rate >= MODERATE_MM_H) {
    return INTENSITIES.MODERATE;
  }
  return INTENSITIES.LIGHT;
}

/**
 * @description Read the next hour of a nowcast.
 * @param {object|null} nowcast - A parseNowcast() entry.
 * @param {number} now - The current time in ms.
 * @returns {object} `{ available: false }`, or `{ available: true, wetNow,
 * minutesUntil (null when dry), intensity, amount (mm over the steps of the
 * hour), start (ms) }`.
 * @example
 * readNextHour(nowcast, Date.now());
 */
function readNextHour(nowcast, now) {
  const steps = (nowcast?.steps ?? []).filter(
    (step) => step.end > now && step.start < now + WINDOW_MS,
  );
  const covered = steps.length > 0 && steps[0].start <= now && steps.at(-1).end >= now + WINDOW_MS;
  if (!covered) {
    return { available: false };
  }
  const amount = Math.round(steps.reduce((sum, step) => sum + step.mm, 0) * 10) / 10;
  const wet = steps.filter((step) => step.mm >= WET_MM);
  if (wet.length === 0) {
    return {
      available: true,
      wetNow: false,
      minutesUntil: null,
      intensity: null,
      amount,
      start: null,
    };
  }
  const first = wet[0];
  const wetNow = first.start <= now;
  return {
    available: true,
    wetNow,
    minutesUntil: wetNow ? 0 : Math.max(1, Math.round((first.start - now) / 60000)),
    intensity: intensityOfRate(Math.max(...wet.map((step) => step.mm * 2))),
    amount,
    start: first.start,
  };
}

/**
 * @description Whether a new reading announces rain the previous one did
 * not: the transition the trigger fires on. The first reading of a house is
 * a baseline (null previous): it never fires — a restart during a shower must
 * not announce it again.
 * @param {object|null} previous - The previous reading of the house.
 * @param {object} current - The new reading.
 * @returns {boolean} True when the trigger should fire.
 * @example
 * isRainAnnounced(previousReading, reading);
 */
function isRainAnnounced(previous, current) {
  if (!current.available || current.minutesUntil === null) {
    return false;
  }
  if (previous === null || !previous.available) {
    return false;
  }
  return previous.minutesUntil === null;
}

export {
  HEAVY_MM_H,
  INTENSITIES,
  MAX_GRID_DISTANCE_DEG,
  MODERATE_MM_H,
  WET_MM,
  intensityOfRate,
  isRainAnnounced,
  nowcastTime,
  parseNowcast,
  readNextHour,
};
