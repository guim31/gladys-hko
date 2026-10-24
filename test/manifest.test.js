// -----------------------------------------------------------------------------
// The manifest, tied to the code: versions, defaults, handlers, the keys and
// types of the scene events and outputs.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../src/app.js';
import { DEFAULT_CONFIG, LANGUAGE_CHOICES, UNITS_CHOICES } from '../src/config.js';
import { INTENSITIES, parseNowcast, readNextHour } from '../src/nowcast.js';
import { parseCurrent, parseForecast, parseLocalForecast } from '../src/reports.js';
import {
  DAYS,
  SCENE_ACTIONS,
  currentWarnings,
  dayForecast,
  precipitationNextHour,
} from '../src/scene-actions.js';
import {
  SCENE_TRIGGERS,
  buildRainEventData,
  buildWarningEventData,
} from '../src/scene-triggers.js';
import { CHANGES, SEVERITIES, WARNING_TYPES, parseWarnings } from '../src/warnings.js';
import {
  FIXTURE_NOW,
  HOUSES,
  loadFixture,
  loadText,
  silentLogger,
  withRain,
} from './helpers/fixtures.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
];
const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const byKey = (list, key) => list.find((entry) => entry.key === key);

const gladys = createFakeGladys();
createApp(gladys, { logger: silentLogger(), setTimer: () => ({}), clearTimer: () => {} });

const wetNowcast = () =>
  parseNowcast(withRain(loadText('real-nowcast-hk.csv'), HOUSES.central, [0, 1.5, 0, 0]), [
    HOUSES.central,
  ])[0];
const typhoon = () =>
  parseWarnings(
    loadFixture('sample-warnsum-typhoon.json'),
    loadFixture('sample-warningInfo-typhoon.json'),
  );

test('a weather provider for the cloud, reading the houses', () => {
  assert.equal(manifest.type, 'weather');
  assert.equal(manifest.name, 'Hong Kong Observatory');
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.deepEqual(manifest.categories, ['environment']);
  assert.equal(manifest.location, true);
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/guim31/gladys-hko:${manifest.version}`);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-hko/main/cover.png',
  );
  assert.equal(manifest.widgets, undefined, 'the weather widget of the core draws everything');
  for (const [language, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `${language}: ${text.length}`);
  }
});

test('scene cards and house lists require Gladys >= 5.2.0', () => {
  assert.ok(allFields.some((field) => field.source === 'houses'));
  assert.equal(manifest.gladys_version, '>=5.2.0');
});

test('house fields list the houses of Gladys, never static options', () => {
  for (const field of allFields.filter((f) => f.key === 'house')) {
    assert.equal(field.type, 'select');
    assert.equal(field.source, 'houses');
    assert.equal(field.options, undefined);
    assert.equal(field.default, undefined);
    assert.equal(field.required, false);
  }
});

test('every manifest action has a handler, and vice versa', async () => {
  assert.deepEqual(keysOf(manifest.actions), ['test_connection']);
  const unknown = await gladys.fake.action('nope', {});
  assert.equal(unknown.error, 'not implemented');
});

test('every scene action has a handler, and vice versa', async () => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.values(SCENE_ACTIONS).sort());
  for (const key of Object.values(SCENE_ACTIONS)) {
    const ack = await gladys.fake.sceneAction(key, {});
    // Without a house the action fails, but its handler ran.
    assert.match(ack.error, /No house of Gladys has a location/, key);
  }
});

test('every scene trigger the code fires is declared, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers), Object.values(SCENE_TRIGGERS));
});

/**
 * @param {object} trigger - A manifest trigger.
 * @param {object} data - Event data the code builds.
 */
function assertEventMatches(trigger, data) {
  for (const field of trigger.fields) {
    assert.ok(Object.hasOwn(data, field.key), `the event carries the filter "${field.key}"`);
  }
  assert.deepEqual(
    keysOf(trigger.variables).sort(),
    Object.keys(data)
      .filter((key) => key !== 'house')
      .sort(),
  );
  for (const variable of trigger.variables) {
    assert.equal(typeof data[variable.key], variable.type, variable.key);
  }
}

test('the rain trigger: filters and variables are what the code sends', () => {
  const trigger = byKey(manifest.scene_triggers, SCENE_TRIGGERS.PRECIPITATION_EXPECTED);
  assert.deepEqual(
    byKey(trigger.fields, 'intensity').options.map((option) => option.value),
    Object.values(INTENSITIES),
  );
  const reading = readNextHour(wetNowcast(), FIXTURE_NOW);
  assert.ok(reading.minutesUntil > 0);
  assertEventMatches(
    trigger,
    buildRainEventData(HOUSES.central, reading, { language: 'en', units: 'metric' }),
  );
});

test('the warning trigger: filters and variables are what the code sends', () => {
  const trigger = byKey(manifest.scene_triggers, SCENE_TRIGGERS.WARNING_CHANGED);
  const options = (key) => byKey(trigger.fields, key).options.map((option) => option.value);
  assert.deepEqual(options('change'), Object.values(CHANGES));
  assert.deepEqual(options('severity'), SEVERITIES);
  assert.deepEqual(options('warning_type'), WARNING_TYPES);
  const [warning] = typhoon();
  assertEventMatches(
    trigger,
    buildWarningEventData(HOUSES.central, { change: CHANGES.ISSUED, warning }, { language: 'en' }),
  );
});

test('the action outputs are the keys the code returns, with their types', () => {
  const nextHour = byKey(manifest.scene_actions, SCENE_ACTIONS.GET_PRECIPITATION_NEXT_HOUR);
  const wet = precipitationNextHour(wetNowcast(), {
    language: 'en',
    units: 'metric',
    now: FIXTURE_NOW,
  });
  const day = byKey(manifest.scene_actions, SCENE_ACTIONS.GET_DAY_FORECAST);
  const tomorrow = dayForecast(
    {
      forecast: parseForecast(loadFixture('real-fnd.json')),
      local: parseLocalForecast(loadFixture('real-flw.json')),
      current: parseCurrent(loadFixture('real-rhrread.json')),
    },
    { day: DAYS.TOMORROW, language: 'en', units: 'metric', now: FIXTURE_NOW },
  );
  const warnings = byKey(manifest.scene_actions, SCENE_ACTIONS.GET_WARNINGS);
  const typhoonOutputs = currentWarnings(typhoon(), { inArea: true, language: 'en' });
  for (const [action, outputs] of [
    [nextHour, wet],
    [day, tomorrow],
    [warnings, typhoonOutputs],
  ]) {
    assert.deepEqual(keysOf(action.outputs).sort(), Object.keys(outputs).sort(), action.key);
    for (const output of action.outputs) {
      assert.equal(typeof outputs[output.key], output.type, `${action.key}.${output.key}`);
    }
  }
  assert.deepEqual(
    byKey(day.fields, 'day').options.map((option) => option.value),
    Object.values(DAYS),
  );
  assert.equal(byKey(day.fields, 'day').default, DAYS.TODAY);
});

test('config_schema keys and defaults stay consistent with DEFAULT_CONFIG', () => {
  const stored = manifest.config_schema.filter((field) => field.type !== 'section');
  assert.deepEqual(stored.map((field) => field.key).sort(), Object.keys(DEFAULT_CONFIG).sort());
  for (const field of stored) {
    assert.equal(DEFAULT_CONFIG[field.key], field.default ?? null, field.key);
    assert.equal(field.required, false);
  }
  const options = (key) => byKey(manifest.config_schema, key).options.map((o) => o.value);
  assert.deepEqual(options('language'), LANGUAGE_CHOICES);
  assert.deepEqual(options('units'), UNITS_CHOICES);
  assert.equal(DEFAULT_CONFIG.language, 'fr');
});

test('no secret: the Observatory needs no key, and the source is credited', () => {
  assert.ok(!allFields.some((field) => field.type === 'secret' || field.type === 'password'));
  const intro = byKey(manifest.config_schema, 'intro');
  for (const text of Object.values(intro.description)) {
    assert.ok(text.includes('Hong Kong Observatory (DATA.GOV.HK)'), text);
  }
});
