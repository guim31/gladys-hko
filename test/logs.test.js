// -----------------------------------------------------------------------------
// Quiet logs: nothing at info for a normal cycle, one line when a failure
// starts and one when it ends, never the address of the API.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { NOWCAST_URL } from '../src/api.js';
import { createApp } from '../src/app.js';
import {
  FIXTURE_NOW,
  HOUSES,
  fakeFetch,
  hkoRoute,
  manualClock,
  recordingLogger,
} from './helpers/fixtures.js';

/**
 * @param {Function} route - The fake Observatory.
 * @returns {Promise<object>} `{ gladys, logger, fetchImpl, cycle }`.
 */
async function start(route = hkoRoute()) {
  const now = manualClock(FIXTURE_NOW);
  const fetchImpl = fakeFetch(route);
  const { id, name, selector, latitude, longitude } = HOUSES.central;
  const gladys = createFakeGladys({ houses: [{ id, name, selector, latitude, longitude }] });
  const logger = recordingLogger();
  const app = createApp(gladys, {
    fetchImpl,
    now,
    random: () => 0,
    logger,
    setTimer: () => ({}),
    clearTimer: () => {},
  });
  await gladys.connect();
  await app.scheduler.settled();
  const cycle = async () => {
    now.advance(10 * 60 * 1000);
    await app.scheduler.requestCycle();
  };
  return { gladys, logger, fetchImpl, cycle };
}

test('the timer of the container refreshes on its own, each data set at its cadence', async () => {
  const { gladys, fetchImpl, cycle } = await start();
  const count = () => fetchImpl.calls.length;
  assert.equal(count(), 6, 'everything at connection');
  await cycle();
  // +10 min: the current report and the warnings (summary + texts).
  assert.equal(count(), 9);
  await cycle();
  assert.equal(count(), 12);
  await cycle();
  // +30 min: the forecasts and the nowcast too.
  assert.equal(count(), 18);
  assert.deepEqual(gladys.fake.discoveredDevices, []);
});

test('normal refresh cycles write nothing at info level', async () => {
  const { logger, cycle } = await start();
  await cycle();
  await cycle();
  await cycle();
  assert.deepEqual(logger.at('info'), []);
  assert.deepEqual(logger.at('warn'), []);
  assert.deepEqual(logger.at('error'), []);
  assert.ok(logger.at('debug').length > 0, 'the cycles are still told in debug');
});

test('the Observatory down is one warning, then one line when it answers again', async () => {
  let down = true;
  const route = hkoRoute();
  const { logger, cycle } = await start((url) =>
    down ? { status: 503, body: 'down' } : route(url),
  );
  await cycle();
  await cycle();
  assert.equal(logger.at('warn').length, 1, logger.at('warn').join('\n'));
  assert.match(logger.at('warn')[0], /Hong Kong Observatory unavailable: .*503/);
  assert.deepEqual(logger.at('info'), [
    'Rainfall nowcast unavailable: Hong Kong Observatory answered 503',
  ]);
  down = false;
  await cycle();
  await cycle();
  assert.deepEqual(logger.at('info').slice(1).sort(), [
    'Hong Kong Observatory answers again',
    'Rainfall nowcast available again',
  ]);
  await cycle();
  assert.equal(logger.at('warn').length, 1);
  assert.equal(logger.at('info').length, 3, 'nothing more once it works');
  assert.deepEqual(logger.at('error'), []);
});

test('the slow nowcast timing out alone is an info line, not a warning', async () => {
  const route = hkoRoute();
  const { logger, gladys } = await start((url) => {
    if (url === NOWCAST_URL) {
      throw new Error('socket hang up');
    }
    return route(url);
  });
  assert.deepEqual(logger.at('warn'), []);
  assert.equal(logger.at('info').length, 1);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
});

test('no log line carries the address of the API', async () => {
  const { logger, cycle } = await start(() => ({ status: 500, body: 'oops' }));
  await cycle();
  for (const { message } of logger.lines) {
    assert.doesNotMatch(message, /https?:\/\//);
  }
});
