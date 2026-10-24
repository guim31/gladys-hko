// -----------------------------------------------------------------------------
// The integration end to end, against the fake Gladys of the SDK and a fake
// Observatory answering the real fixtures.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { NOWCAST_URL } from '../src/api.js';
import { createApp } from '../src/app.js';
import { MIN_INTERVAL_MS } from '../src/scheduler.js';
import {
  FIXTURE_NOW,
  HOUSES,
  fakeFetch,
  hkoRoute,
  loadFixture,
  loadText,
  manualClock,
  recordingLogger,
  withRain,
} from './helpers/fixtures.js';

const MINUTE = 60 * 1000;

/**
 * @param {object} [options] - `{ houses, route, config }`.
 * @returns {Promise<object>} `{ gladys, app, fetchImpl, now, logger, fireTimer }`.
 */
async function start({ houses = [HOUSES.central], route = hkoRoute(), config } = {}) {
  const now = manualClock(FIXTURE_NOW);
  const fetchImpl = fakeFetch(typeof route === 'function' && route.length === 0 ? route() : route);
  const gladys = createFakeGladys({
    houses: houses.map(({ id, name, selector, latitude, longitude }) => ({
      id,
      name,
      selector,
      latitude,
      longitude,
    })),
    ...(config ? { config } : {}),
  });
  const logger = recordingLogger();
  const timers = [];
  const app = createApp(gladys, {
    fetchImpl,
    now,
    random: () => 0,
    logger,
    setTimer: (fn, delay) => {
      const timer = { fn, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      timer.cleared = true;
    },
  });
  await gladys.connect();
  await app.scheduler.settled();
  const fireTimer = async () => {
    const timer = timers.filter((candidate) => !candidate.cleared).at(-1);
    assert.ok(timer, 'a next refresh is armed');
    timer.cleared = true;
    now.advance(timer.delay);
    await timer.fn();
    await app.scheduler.settled();
  };
  return { gladys, app, fetchImpl, now, logger, fireTimer, timers };
}

test('a first cycle reads the five data sets and reports connected', async () => {
  const { gladys, fetchImpl, timers } = await start();
  assert.equal(fetchImpl.calls.length, 6, 'rhrread, fnd, flw, warnsum, warningInfo, nowcast');
  assert.ok(fetchImpl.calls.every((call) => /gladys-hko/.test(call.headers['User-Agent'])));
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  assert.equal(timers.at(-1).delay, MIN_INTERVAL_MS);
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('the weather of a house in Hong Kong, in the pivot format', async () => {
  const { gladys } = await start();
  const ack = await gladys.fake.weatherGet({
    latitude: HOUSES.central.latitude,
    longitude: HOUSES.central.longitude,
    language: 'fr',
    units: 'metric',
  });
  assert.equal(ack.success, true, ack.error);
  const { weather } = ack.data;
  // Hong Kong Park is the nearest station to the flat in Central: 30 °C.
  assert.equal(weather.temperature, 30);
  assert.equal(weather.weather, 'clear');
  assert.equal(weather.datetime, '2026-10-24T04:00:00.000Z');
  assert.equal(weather.humidity, 46);
  assert.equal(weather.uv_index, 7);
  assert.equal(weather.is_day, true);
  assert.equal(weather.hours, undefined, 'no hourly forecast in the open data');
  assert.equal(weather.days.length, 8);
  assert.deepEqual(weather.days[0], {
    temperature_min: 25,
    temperature_max: 31,
    datetime: '2026-10-24T16:00:00.000Z',
    weather: 'clear',
    humidity: 65,
    wind_speed: 6.7,
    wind_direction: 45,
    precipitation_probability: 15,
    sunrise: weather.days[0].sunrise,
    sunset: weather.days[0].sunset,
  });
  assert.match(weather.days[0].sunrise, /^2026-10-24T22:2\d/);
  assert.deepEqual(weather.alerts, [
    {
      severity: 'severe',
      event: 'Risque d’incendie rouge',
      description: 'The fire danger warning is Red and the fire risk is Extreme.',
      start: '2026-10-22T22:00:00.000Z',
    },
  ]);

  const us = await gladys.fake.weatherGet({
    latitude: HOUSES.saikung.latitude,
    longitude: HOUSES.saikung.longitude,
    language: 'en',
    units: 'us',
  });
  // Sai Kung station: 29 °C = 84.2 °F; the alert in English.
  assert.equal(us.data.weather.temperature, 84.2);
  assert.equal(us.data.weather.alerts[0].event, 'Red Fire Danger Warning');
});

test('outside Hong Kong: no forecast, the core moves on, and nothing is called', async () => {
  const { gladys, fetchImpl } = await start({ houses: [HOUSES.paris] });
  assert.equal(fetchImpl.calls.length, 0);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /No house of Gladys is in Hong Kong/);
  const ack = await gladys.fake.weatherGet({
    latitude: HOUSES.paris.latitude,
    longitude: HOUSES.paris.longitude,
    language: 'fr',
    units: 'metric',
  });
  assert.equal(ack.success, false);
  assert.match(ack.error, /outside Hong Kong/);
  assert.equal(fetchImpl.calls.length, 0);
  const warnings = await gladys.fake.sceneAction('get_warnings', {});
  assert.equal(warnings.data.outputs.available, false);
  const test = await gladys.fake.action('test_connection');
  assert.match(test.data.message.en, /Maison is outside Hong Kong/);
});

test('the scene actions read the data in memory', async () => {
  const { gladys, fetchImpl } = await start({ houses: [HOUSES.central, HOUSES.saikung] });
  const calls = fetchImpl.calls.length;
  const nextHour = await gladys.fake.sceneAction('get_precipitation_next_hour', {
    house: 'village-house',
  });
  assert.deepEqual(nextHour.data.outputs, {
    available: true,
    precipitation_expected: false,
    precipitation: 0,
    summary: 'Pas de pluie prévue dans l’heure.',
  });
  const tomorrow = await gladys.fake.sceneAction('get_day_forecast', { day: 'tomorrow' });
  assert.deepEqual(tomorrow.data.outputs, {
    available: true,
    condition: 'clear',
    condition_name: 'Ciel dégagé',
    temperature_min: 25,
    temperature_max: 31,
    humidity_min: 50,
    humidity_max: 80,
    rain_chance: 'low',
    precipitation_probability: 15,
    wind_speed: 6.7,
    forecast_text: 'Fine. Dry during the day.',
    summary: 'Demain : ciel dégagé, 25 à 31 °C, probabilité de pluie significative faible.',
  });
  // Today is no longer in the 9-day forecast at noon: the current report and
  // the local forecast.
  const today = await gladys.fake.sceneAction('get_day_forecast', {});
  assert.equal(today.data.outputs.condition, 'clear');
  assert.match(today.data.outputs.forecast_text, /^It will be fine/);
  assert.equal(today.data.outputs.temperature_min, undefined);
  const warnings = await gladys.fake.sceneAction('get_warnings', {});
  assert.deepEqual(warnings.data.outputs, {
    available: true,
    has_warning: true,
    warning_count: 1,
    severity: 'severe',
    tropical_cyclone_signal: 0,
    rainstorm_signal: 'none',
    warning_type: 'fire_danger',
    signal: 'WFIRER',
    name: 'Risque d’incendie rouge',
    summary: '1 avertissement en vigueur à Hong Kong : Risque d’incendie rouge.',
  });
  assert.equal(fetchImpl.calls.length, calls, 'no call: everything was in memory');
  const unknown = await gladys.fake.sceneAction('get_day_forecast', { house: 'nowhere' });
  assert.match(unknown.error, /No located house "nowhere"/);
});

test('"Test the Observatory" answers in the four languages, within a toast', async () => {
  const { gladys } = await start();
  const ack = await gladys.fake.action('test_connection');
  assert.deepEqual(ack.data.message, {
    en: 'Hong Kong Observatory OK: 30 °C at Hong Kong Park at 12:00. 1 warning in force in Hong Kong: Red Fire Danger Warning.',
    fr: 'Observatoire de Hong Kong OK : 30 °C à Hong Kong Park à 12:00. 1 avertissement en vigueur à Hong Kong : Risque d’incendie rouge.',
    de: 'Hong Kong Observatory OK: 30 °C in Hong Kong Park um 12:00. 1 Warnung in Hongkong in Kraft: Waldbrandwarnung Rot.',
    es: 'Observatorio de Hong Kong OK: 30 °C en Hong Kong Park a las 12:00. 1 aviso vigente en Hong Kong: Aviso rojo de peligro de incendio.',
  });
});

test('rain coming within the hour fires the trigger once, after a dry baseline', async () => {
  let csv = loadText('real-nowcast-hk.csv');
  const { gladys, fireTimer, now } = await start({
    houses: [HOUSES.central, HOUSES.saikung],
    route: hkoRoute({ nowcast: () => csv }),
  });
  assert.deepEqual(gladys.fake.sceneEvents, [], 'the first reading is a baseline');
  // The next nowcast (30 minutes later) shows rain over the flat from 13:30.
  csv = withRain(csv, HOUSES.central, [0, 0, 0, 3]);
  await fireTimer(); // +10 min: the nowcast has not expired yet
  assert.deepEqual(gladys.fake.sceneEvents, []);
  await fireTimer(); // +20 min
  await fireTimer(); // +30 min: new nowcast
  assert.ok(now() - FIXTURE_NOW >= 30 * MINUTE);
  const events = gladys.fake.sceneEvents;
  assert.equal(events.length, 1);
  assert.equal(events[0].key, 'precipitation_expected');
  assert.deepEqual(events[0].data, {
    house: 'flat',
    house_name: 'Flat',
    precipitation: 3,
    minutes_until: events[0].data.minutes_until,
    intensity: 'moderate',
    summary: `Pluie modérée attendue dans ${events[0].data.minutes_until} minutes.`,
  });
  assert.ok(events[0].data.minutes_until > 0 && events[0].data.minutes_until <= 60);
  await fireTimer();
  assert.equal(gladys.fake.sceneEvents.length, 1, 'still wet: no new event');
});

test('a typhoon signal issued, upgraded and lifted fires the warning trigger', async () => {
  let summary = loadFixture('real-warnsum.json');
  let info = loadFixture('real-warningInfo.json');
  const { gladys, fireTimer } = await start({
    houses: [HOUSES.central, HOUSES.paris],
    route: hkoRoute({ warnsum: () => summary, warningInfo: () => info }),
    config: { language: 'en' },
  });
  assert.deepEqual(gladys.fake.sceneEvents, [], 'baseline');
  summary = loadFixture('sample-warnsum-typhoon.json');
  info = loadFixture('sample-warningInfo-typhoon.json');
  await fireTimer();
  const events = gladys.fake.sceneEvents.map((event) => [
    event.data.house,
    event.data.change,
    event.data.signal,
    event.data.severity,
    event.data.warning_type,
    event.data.summary,
  ]);
  assert.deepEqual(events, [
    [
      'flat',
      'issued',
      'TC8NE',
      'severe',
      'tropical_cyclone',
      'Issued: No. 8 Northeast Gale or Storm Signal.',
    ],
    [
      'flat',
      'issued',
      'WRAINA',
      'moderate',
      'rainstorm',
      'Issued: Amber Rainstorm Warning Signal.',
    ],
    ['flat', 'lifted', 'WFIRER', 'severe', 'fire_danger', 'Lifted: Red Fire Danger Warning.'],
  ]);
  assert.match(
    gladys.fake.sceneEvents[0].data.description,
    /No\. 8 Northeast Gale or Storm Signal is in force/,
  );
  assert.equal(gladys.fake.weatherRefreshes, 1, 'the core is asked to pull the alerts again');

  summary = structuredClone(summary);
  summary.WTCSGNL.code = 'TC9';
  summary.WTCSGNL.updateTime = '2026-09-14T13:00:00+08:00';
  await fireTimer();
  const upgrade = gladys.fake.sceneEvents.at(-1).data;
  assert.equal(upgrade.change, 'upgraded');
  assert.equal(upgrade.severity, 'extreme');
  assert.equal(
    upgrade.summary,
    'Upgraded: Increasing Gale or Storm Signal No. 9 (was No. 8 Northeast Gale or Storm Signal).',
  );
  const action = await gladys.fake.sceneAction('get_warnings', {});
  assert.equal(action.data.outputs.tropical_cyclone_signal, 9);
  assert.equal(action.data.outputs.rainstorm_signal, 'amber');
  assert.equal(action.data.outputs.severity, 'extreme');

  summary = {};
  info = {};
  const before = gladys.fake.sceneEvents.length;
  await fireTimer();
  assert.deepEqual(
    gladys.fake.sceneEvents.slice(before).map((event) => event.data.change),
    ['lifted', 'lifted'],
  );
});

test('the Observatory unreachable: the warnings are not "lifted", the status says so', async () => {
  let down = false;
  const route = hkoRoute();
  const { gladys, fireTimer, logger } = await start({
    route: (url) => (down ? { status: 503, body: 'down' } : route(url)),
  });
  down = true;
  await fireTimer();
  await fireTimer();
  assert.deepEqual(gladys.fake.sceneEvents, [], 'a failure is no reading');
  // Served from memory while it lasts.
  const ack = await gladys.fake.weatherGet({
    latitude: HOUSES.central.latitude,
    longitude: HOUSES.central.longitude,
    language: 'en',
    units: 'metric',
  });
  assert.equal(ack.success, true);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /unreachable/);
  assert.ok(logger.at('warn').length >= 1);
  down = false;
  await fireTimer();
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
});

test('a 429 pauses every call; a 403 for six hours', async () => {
  let status = 200;
  const route = hkoRoute();
  const { app, fetchImpl, gladys, fireTimer, timers } = await start({
    route: (url) =>
      status === 200 ? route(url) : { status, body: '', headers: { 'retry-after': '1200' } },
  });
  status = 429;
  await fireTimer();
  await fireTimer();
  const calls = fetchImpl.calls.length;
  assert.ok(app.store.blockedError() !== null);
  assert.match(gladys.fake.connectionStatus.message.en, /slow down/);
  // The pause: 20 minutes (Retry-After), the next cycle after it.
  assert.ok(timers.at(-1).delay >= 20 * MINUTE);
  const ack = await gladys.fake.weatherGet({
    latitude: HOUSES.central.latitude,
    longitude: HOUSES.central.longitude,
    language: 'en',
    units: 'metric',
  });
  assert.equal(ack.success, true, 'served from memory');
  assert.equal(fetchImpl.calls.length, calls, 'no call while paused');
  status = 403;
  await fireTimer();
  await fireTimer();
  await fireTimer();
  assert.match(gladys.fake.connectionStatus.message.en, /HTTP 403/);
  assert.ok(app.store.blockedError() !== null);
  assert.ok(timers.at(-1).delay >= 6 * 60 * MINUTE - MINUTE);
});

test('the nowcast failing alone is no outage', async () => {
  const route = hkoRoute();
  const { gladys } = await start({
    route: (url) => (url === NOWCAST_URL ? { status: 500, body: '' } : route(url)),
  });
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  const nextHour = await gladys.fake.sceneAction('get_precipitation_next_hour', {});
  assert.deepEqual(nextHour.data.outputs, {
    available: false,
    precipitation_expected: false,
    summary: 'La prévision immédiate de pluie ne couvre pas l’heure à venir.',
  });
});

test('no house located: the status asks for a location', async () => {
  const { gladys, fetchImpl } = await start({ houses: [] });
  assert.equal(fetchImpl.calls.length, 0);
  assert.match(gladys.fake.connectionStatus.message.en, /No house of Gladys has a location/);
});
