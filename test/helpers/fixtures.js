// -----------------------------------------------------------------------------
// Fixture loading and a fake fetch answering like the Hong Kong Observatory.
// See test/fixtures/README.md for where each fixture comes from.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { NOWCAST_URL, OPEN_DATA_URL } from '../../src/api.js';

// The real responses were recorded on 2026-10-24 around 12:10 Hong Kong time
// (04:10 UTC): current report of 12:00, nowcast issued at 12:00 (steps ending
// 12:30, 13:00, 13:30, 14:00), a red fire danger warning in force.
const FIXTURE_NOW = Date.UTC(2026, 9, 24, 4, 10);

const HOUSES = Object.freeze({
  central: {
    id: 'h-central',
    name: 'Flat',
    selector: 'flat',
    latitude: 22.2783,
    longitude: 114.1615,
  },
  saikung: {
    id: 'h-saikung',
    name: 'Village house',
    selector: 'village-house',
    latitude: 22.3814,
    longitude: 114.2705,
  },
  paris: {
    id: 'h-paris',
    name: 'Maison',
    selector: 'maison',
    latitude: 48.8566,
    longitude: 2.3522,
  },
});

/**
 * @description Load a text fixture.
 * @param {string} name - The file name in test/fixtures.
 * @returns {string} The content.
 * @example
 * loadText('real-nowcast-hk.csv');
 */
function loadText(name) {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
}

/**
 * @description Load a JSON fixture (a fresh copy on every call).
 * @param {string} name - The file name in test/fixtures.
 * @returns {any} The parsed JSON.
 * @example
 * loadFixture('real-fnd.json');
 */
function loadFixture(name) {
  return JSON.parse(loadText(name));
}

/**
 * @description Set the rain of the grid points near a location in a nowcast.
 * @param {string} csv - A nowcast.
 * @param {object} location - `{ latitude, longitude }`.
 * @param {Array<number>} steps - mm of each half-hour step, in time order.
 * @returns {string} The changed nowcast.
 * @example
 * withRain(csv, HOUSES.central, [0, 0, 2, 4]);
 */
function withRain(csv, { latitude, longitude }, steps) {
  const lines = csv.split('\n');
  const ends = [...new Set(lines.slice(1).map((line) => line.split(',')[1]))]
    .filter(Boolean)
    .sort();
  return lines
    .map((line, index) => {
      const fields = line.split(',');
      if (index === 0 || fields.length < 5) {
        return line;
      }
      const near =
        Math.abs(Number(fields[2]) - latitude) < 0.05 &&
        Math.abs(Number(fields[3]) - longitude) < 0.05;
      if (!near) {
        return line;
      }
      fields[4] = steps[ends.indexOf(fields[1])].toFixed(2);
      return fields.join(',');
    })
    .join('\n');
}

/**
 * @description A fake fetch. `route(url, init)` returns `{ status, body,
 * headers }` (or throws to simulate a network error); every call is recorded.
 * @param {Function} route - The router.
 * @returns {Function} The fetch, with `.calls` (`{ url, headers }`).
 * @example
 * const fetchImpl = fakeFetch(hkoRoute());
 */
function fakeFetch(route) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), headers: { ...init.headers } });
    const { status = 200, body = '', headers = {} } = await route(String(url), init);
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return new Response(text, { status, headers });
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

/**
 * @description An answer like the Observatory's, from the real fixtures; each
 * data set can be replaced.
 * @param {object} [overrides] - `{ rhrread, fnd, flw, warnsum, warningInfo,
 * nowcast }`, functions returning the body.
 * @returns {Function} A route for fakeFetch.
 * @example
 * fakeFetch(hkoRoute({ warnsum: () => ({}) }));
 */
function hkoRoute(overrides = {}) {
  const bodies = {
    rhrread: () => loadText('real-rhrread.json'),
    fnd: () => loadText('real-fnd.json'),
    flw: () => loadText('real-flw.json'),
    warnsum: () => loadText('real-warnsum.json'),
    warningInfo: () => loadText('real-warningInfo.json'),
    nowcast: () => loadText('real-nowcast-hk.csv'),
    ...overrides,
  };
  return (url) => {
    if (url === NOWCAST_URL) {
      return { body: bodies.nowcast(), headers: { 'content-type': 'application/octet-stream' } };
    }
    if (url.startsWith(OPEN_DATA_URL)) {
      const type = new URL(url).searchParams.get('dataType');
      return { body: bodies[type](), headers: { 'content-type': 'application/json' } };
    }
    throw new Error(`Unexpected URL ${url}`);
  };
}

/**
 * @description A logger that records nothing.
 * @returns {object} The logger.
 * @example
 * createApp(gladys, { logger: silentLogger() });
 */
function silentLogger() {
  return { info() {}, warn() {}, debug() {}, error() {} };
}

/**
 * @description A logger that keeps every line, by level.
 * @returns {object} The logger, with `lines` and `at(level)`.
 * @example
 * const logger = recordingLogger(); logger.at('info');
 */
function recordingLogger() {
  const lines = [];
  const record = (level) => (message) => lines.push({ level, message: String(message) });
  return {
    lines,
    at: (level) => lines.filter((line) => line.level === level).map((line) => line.message),
    debug: record('debug'),
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
  };
}

/**
 * @description A clock the test moves by hand.
 * @param {number} start - The start, in ms.
 * @returns {Function} `() => ms`, with `.advance(ms)`.
 * @example
 * const clock = manualClock(FIXTURE_NOW); clock.advance(60000);
 */
function manualClock(start) {
  let current = start;
  const now = () => current;
  now.advance = (ms) => {
    current += ms;
  };
  return now;
}

export {
  FIXTURE_NOW,
  HOUSES,
  fakeFetch,
  hkoRoute,
  loadFixture,
  loadText,
  manualClock,
  recordingLogger,
  silentLogger,
  withRain,
};
