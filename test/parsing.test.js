// -----------------------------------------------------------------------------
// Reading the Observatory's answers: real fixtures of 2026-10-24, and the
// documented format for a typhoon signal.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hkDate, hkMidnight, inHongKong, nearestReading } from '../src/area.js';
import { iconCondition, isNightIcon, parseWind, rainChance } from '../src/conditions.js';
import { nowcastTime, parseNowcast, readNextHour, isRainAnnounced } from '../src/nowcast.js';
import { parseCurrent, parseForecast, parseLocalForecast } from '../src/reports.js';
import { CHANGES, cycloneSignal, diffWarnings, parseWarnings, toAlerts } from '../src/warnings.js';
import { FIXTURE_NOW, HOUSES, loadFixture, loadText, withRain } from './helpers/fixtures.js';

const MINUTE = 60 * 1000;

test('Hong Kong: the box, its clock and the nearest station', () => {
  assert.ok(inHongKong(HOUSES.central.latitude, HOUSES.central.longitude));
  assert.ok(inHongKong(HOUSES.saikung.latitude, HOUSES.saikung.longitude));
  assert.ok(!inHongKong(HOUSES.paris.latitude, HOUSES.paris.longitude));
  // Shenzhen, north of the border river.
  assert.ok(!inHongKong(22.65, 114.06));
  assert.equal(hkDate(Date.UTC(2026, 9, 24, 15, 59)), '2026-10-24');
  assert.equal(hkDate(Date.UTC(2026, 9, 24, 16, 0)), '2026-10-25');
  assert.equal(hkMidnight('2026-10-25'), Date.UTC(2026, 9, 24, 16));
  const readings = [
    { place: 'Tai Mo Shan', value: 20 },
    { place: 'Sai Kung', value: 29 },
    { place: 'Hong Kong Park', value: 30 },
  ];
  assert.equal(
    nearestReading(readings, HOUSES.saikung.latitude, HOUSES.saikung.longitude).place,
    'Sai Kung',
  );
  assert.equal(nearestReading([{ place: 'Tai Mo Shan', value: 20 }], 22.41, 114.12), null);
});

test('icons, probability of significant rain and wind words', () => {
  assert.equal(iconCondition(50), 'clear');
  assert.equal(iconCondition('64'), 'pouring');
  assert.equal(iconCondition(65), 'thunderstorm');
  assert.equal(iconCondition(54), 'rain');
  assert.equal(iconCondition(72), 'clear');
  assert.ok(isNightIcon(72));
  assert.equal(iconCondition(99), null);
  assert.equal(rainChance('Medium High'), 'medium_high');
  assert.equal(rainChance('Low'), 'low');
  assert.equal(rainChance('Unknown'), null);
  assert.deepEqual(parseWind('Northeast force 3 to 4.'), { direction: 45, force: 4, speed: 6.7 });
  assert.deepEqual(parseWind('East to northeast force 4, force 5 offshore later.'), {
    direction: 90,
    force: 4,
    speed: 6.7,
  });
  assert.equal(parseWind('North-northeast force 6.').direction, 22.5);
  assert.deepEqual(parseWind('Light winds.'), { direction: null, force: null, speed: null });
});

test('the real current weather report', () => {
  const current = parseCurrent(loadFixture('real-rhrread.json'));
  assert.equal(current.temperatures.length, 27);
  assert.equal(current.temperatureTime, Date.parse('2026-10-24T12:00:00+08:00'));
  assert.equal(current.humidity, 46);
  assert.equal(current.uvIndex, 7);
  assert.equal(current.icon, 50);
  // At night the UV index is an empty string: no value, not 0.
  const night = loadFixture('real-rhrread.json');
  night.uvindex = '';
  assert.equal(parseCurrent(night).uvIndex, null);
  assert.throws(() => parseCurrent({}), /no temperature/);
});

test('the real 9-day and local forecasts', () => {
  const { days } = parseForecast(loadFixture('real-fnd.json'));
  assert.equal(days.length, 9);
  assert.deepEqual(days[0], {
    date: '2026-10-25',
    icon: 50,
    temperatureMin: 25,
    temperatureMax: 31,
    humidityMin: 50,
    humidityMax: 80,
    rainChance: 'low',
    windDirection: 45,
    windForce: 4,
    windSpeed: 6.7,
    text: 'Fine. Dry during the day.',
  });
  assert.throws(() => parseForecast({ weatherForecast: [] }), /no day/);
  assert.match(parseLocalForecast(loadFixture('real-flw.json')).text, /^It will be fine\./);
});

test('the real warning list: a red fire danger warning', () => {
  const warnings = parseWarnings(
    loadFixture('real-warnsum.json'),
    loadFixture('real-warningInfo.json'),
  );
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].id, 'WFIRE');
  assert.equal(warnings[0].code, 'WFIRER');
  assert.equal(warnings[0].type, 'fire_danger');
  assert.equal(warnings[0].severity, 'severe');
  assert.equal(warnings[0].name, 'Red Fire Danger Warning');
  assert.match(warnings[0].contents, /fire risk is Extreme/);
  assert.deepEqual(parseWarnings({}), []);
  // Without the texts, the warning keeps its name.
  assert.equal(parseWarnings(loadFixture('real-warnsum.json'), null)[0].contents, '');
});

test('a typhoon signal and a rainstorm signal; a cancelled warning is no longer in force', () => {
  const warnings = parseWarnings(
    loadFixture('sample-warnsum-typhoon.json'),
    loadFixture('sample-warningInfo-typhoon.json'),
  );
  assert.deepEqual(
    warnings.map((warning) => warning.code),
    ['TC8NE', 'WRAINA'],
  );
  assert.equal(cycloneSignal('TC8NE'), 8);
  assert.equal(cycloneSignal('WRAINA'), 0);
  const alerts = toAlerts(warnings, (warning) => warning.code);
  assert.deepEqual(alerts[0], {
    severity: 'severe',
    event: 'TC8NE',
    description:
      'The No. 8 Northeast Gale or Storm Signal is in force.\nThis means that winds with mean speeds of 63 kilometres per hour or more are expected from the northeast quarter.',
    start: '2026-09-14T01:40:00.000Z',
    type: 'wind',
  });
  assert.equal(alerts[1].type, 'rain');
  assert.equal(alerts[1].end, '2026-09-14T05:15:00.000Z');
});

test('warning changes: issued, upgraded, downgraded, updated, lifted', () => {
  const at = (code, updated = 1) => {
    const [warning] = parseWarnings({
      WTCSGNL: {
        name: 'Tropical Cyclone Warning Signal',
        code,
        actionCode: 'ISSUE',
        updateTime: `2026-09-14T0${updated}:00:00+08:00`,
      },
    });
    return warning;
  };
  const kinds = (previous, current) => diffWarnings(previous, current).map((c) => c.change);
  assert.deepEqual(kinds([], [at('TC1')]), [CHANGES.ISSUED]);
  assert.deepEqual(kinds([at('TC3')], [at('TC8SE')]), [CHANGES.UPGRADED]);
  assert.deepEqual(kinds([at('TC9')], [at('TC8NW')]), [CHANGES.DOWNGRADED]);
  assert.deepEqual(kinds([at('TC8NE')], [at('TC8SE')]), [CHANGES.UPDATED]);
  assert.deepEqual(kinds([at('TC8NE', 1)], [at('TC8NE', 2)]), [CHANGES.UPDATED]);
  assert.deepEqual(kinds([at('TC8NE')], [at('TC8NE')]), []);
  assert.deepEqual(kinds([at('TC3')], []), [CHANGES.LIFTED]);
});

test('the real nowcast: the nearest grid point, four half hours', () => {
  const csv = loadText('real-nowcast-hk.csv');
  assert.equal(nowcastTime('202610241230'), Date.UTC(2026, 9, 24, 4, 30));
  const [central, paris] = parseNowcast(csv, [HOUSES.central, HOUSES.paris]);
  assert.equal(paris, null);
  assert.equal(central.issuedAt, Date.UTC(2026, 9, 24, 4, 0));
  assert.deepEqual(
    central.steps.map((step) => [step.start, step.end, step.mm]),
    [
      [Date.UTC(2026, 9, 24, 4, 0), Date.UTC(2026, 9, 24, 4, 30), 0],
      [Date.UTC(2026, 9, 24, 4, 30), Date.UTC(2026, 9, 24, 5, 0), 0],
      [Date.UTC(2026, 9, 24, 5, 0), Date.UTC(2026, 9, 24, 5, 30), 0],
      [Date.UTC(2026, 9, 24, 5, 30), Date.UTC(2026, 9, 24, 6, 0), 0],
    ],
  );
  assert.throws(() => parseNowcast('header\n', [HOUSES.central]), /no row/);
});

test('rain within the hour: dry, coming, falling, too old', () => {
  const read = (steps, now = FIXTURE_NOW) => {
    const [nowcast] = parseNowcast(
      withRain(loadText('real-nowcast-hk.csv'), HOUSES.central, steps),
      [HOUSES.central],
    );
    return readNextHour(nowcast, now);
  };
  assert.deepEqual(read([0, 0, 0, 0]), {
    available: true,
    wetNow: false,
    minutesUntil: null,
    intensity: null,
    amount: 0,
    start: null,
  });
  // 12:10: the hour holds the steps 12:00-12:30, 12:30-13:00, 13:00-13:30.
  const coming = read([0, 2, 0.5, 0]);
  assert.equal(coming.minutesUntil, 20);
  assert.equal(coming.intensity, 'moderate');
  assert.equal(coming.amount, 2.5);
  assert.equal(read([0.1, 0.2, 0, 9]).minutesUntil, null, 'traces and rain beyond the hour');
  assert.equal(read([5, 0, 0, 0]).intensity, 'heavy');
  assert.equal(read([5, 0, 0, 0]).minutesUntil, 0);
  assert.deepEqual(read([0, 0, 0, 0], FIXTURE_NOW + 61 * MINUTE), { available: false });
  assert.deepEqual(readNextHour(null, FIXTURE_NOW), { available: false });
  // The trigger: dry → wet only, never on the first reading.
  const dry = read([0, 0, 0, 0]);
  assert.ok(isRainAnnounced(dry, coming));
  assert.ok(!isRainAnnounced(null, coming));
  assert.ok(!isRainAnnounced(coming, coming));
  assert.ok(!isRainAnnounced({ available: false }, coming));
});
