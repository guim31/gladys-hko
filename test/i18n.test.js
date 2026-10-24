// -----------------------------------------------------------------------------
// Four languages everywhere: the manifest, the texts of the code, the
// documentation. German says "du", Spanish says "usted".
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ERROR_KINDS } from '../src/api.js';
import { connectionStatus } from '../src/app.js';
import { ICON_CONDITIONS, RAIN_CHANCES } from '../src/conditions.js';
import { LANGUAGE_CHOICES } from '../src/config.js';
import { INTENSITIES } from '../src/nowcast.js';
import { DAYS } from '../src/scene-actions.js';
import {
  CONDITION_NAMES,
  DAY_NAMES,
  LANGUAGES,
  MESSAGES,
  RAIN_CHANCE_WORDS,
  RAIN_LABELS,
  SIGNAL_NAMES,
  TEMPLATES,
  daySentence,
  nextHourSentence,
  warningChangeSentence,
  warningsSentence,
} from '../src/texts.js';
import { unitLabels } from '../src/units.js';
import { CHANGES, SIGNALS, parseWarnings } from '../src/warnings.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const EXPECTED_LANGUAGES = ['de', 'en', 'es', 'fr'];
const POLITE_GERMAN = /\b(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)\b/;
// A language key marks a multilingual object, whatever else it holds.
const LANGUAGE_KEY = /^[a-z]{2}(-[A-Z]{2})?$/;

/**
 * @description The problems of one multilingual text object.
 * @param {object} texts - `{ en, fr, de, es }`.
 * @param {string} where - Its path, for the messages.
 * @param {number} maxLength - The longest text allowed.
 * @returns {Array<string>} The problems, empty when fine.
 */
function checkTexts(texts, where, maxLength) {
  const problems = [];
  const keys = Object.keys(texts).sort();
  if (keys.join() !== EXPECTED_LANGUAGES.join()) {
    problems.push(`${where}: languages [${keys}], expected [${EXPECTED_LANGUAGES}]`);
  }
  for (const [language, text] of Object.entries(texts)) {
    if (typeof text !== 'string' || text.trim() === '') {
      problems.push(`${where}.${language}: empty`);
    } else if (text.length > maxLength) {
      problems.push(`${where}.${language}: ${text.length} characters, ${maxLength} at most`);
    }
  }
  if (typeof texts.de === 'string' && POLITE_GERMAN.test(texts.de)) {
    problems.push(`${where}.de: polite "${texts.de.match(POLITE_GERMAN)[0]}", German says "du"`);
  }
  return problems;
}

// Length limits of the manifest texts, by key; the store and the core cut
// beyond them, and a long label breaks a form or a card.
const MANIFEST_LIMITS = { label: 60, placeholder: 100, description: 400 };

/**
 * @description Walk a manifest and check every multilingual object it holds.
 * @param {object} root - The manifest.
 * @returns {{problems: Array<string>, count: number}} The problems and how
 * many objects were checked.
 */
function checkManifest(root) {
  const problems = [];
  let count = 0;
  const walk = (node, path, key) => {
    if (Array.isArray(node)) {
      node.forEach((child, index) => walk(child, `${path}[${index}]`, key));
      return;
    }
    if (node === null || typeof node !== 'object') {
      return;
    }
    if (Object.keys(node).some((k) => LANGUAGE_KEY.test(k))) {
      count += 1;
      problems.push(...checkTexts(node, path, MANIFEST_LIMITS[key] ?? 400));
      return;
    }
    for (const [childKey, child] of Object.entries(node)) {
      const label = node.key ?? node.value;
      walk(child, `${path}${label ? `(${label})` : ''}.${childKey}`, childKey);
    }
  };
  walk(root, 'manifest', null);
  return { problems, count };
}

test('the guard catches a missing language, an empty text and a polite German', () => {
  const broken = structuredClone(manifest);
  delete broken.config_schema[1].label.de;
  broken.scene_triggers[0].label.es = ' ';
  broken.scene_actions[0].description.de = 'Liest die Vorhersage Ihres Zuhauses.';
  broken.actions[0].label.it = 'Prova';
  const { problems } = checkManifest(broken);
  assert.equal(problems.length, 4, problems.join('\n'));
  assert.match(problems.join('\n'), /units\)\.label: languages \[en,es,fr\]/);
  assert.match(problems.join('\n'), /\.es: empty/);
  assert.match(problems.join('\n'), /polite "Ihres"/);
  assert.match(problems.join('\n'), /languages \[de,en,es,fr,it\]/);
});

test('every multilingual object of the manifest has en, fr, de and es', () => {
  const { problems, count } = checkManifest(manifest);
  assert.deepEqual(problems, []);
  // Guards the walker itself: it must reach the whole manifest.
  assert.ok(count >= 75, `only ${count} multilingual objects found`);
});

test('the language setting offers the four languages', () => {
  const field = manifest.config_schema.find((entry) => entry.key === 'language');
  assert.deepEqual(
    field.options.map((option) => option.value),
    LANGUAGE_CHOICES,
  );
  assert.deepEqual(['auto', ...Object.values(LANGUAGES)], LANGUAGE_CHOICES);
});

test('every table of the code has en, fr, de and es', () => {
  const problems = [];
  const tables = {
    MESSAGES,
    CONDITION_NAMES,
    RAIN_LABELS,
    DAY_NAMES,
    RAIN_CHANCE_WORDS,
    SIGNAL_NAMES,
  };
  for (const [name, table] of Object.entries(tables)) {
    for (const [key, texts] of Object.entries(table)) {
      problems.push(...checkTexts(texts, `${name}.${key}`, 200));
    }
  }
  for (const [key, templates] of Object.entries(TEMPLATES)) {
    const keys = Object.keys(templates).sort();
    if (keys.join() !== EXPECTED_LANGUAGES.join()) {
      problems.push(`TEMPLATES.${key}: languages [${keys}]`);
    }
  }
  assert.deepEqual(problems, []);
  assert.deepEqual(
    Object.keys(CONDITION_NAMES).sort(),
    [...new Set([...Object.values(ICON_CONDITIONS), 'unknown'])].sort(),
    'a name for every condition the integration sends',
  );
  assert.deepEqual(Object.keys(SIGNAL_NAMES).sort(), Object.keys(SIGNALS).sort());
  assert.deepEqual(Object.keys(RAIN_LABELS).sort(), Object.values(INTENSITIES).sort());
  assert.deepEqual(Object.keys(RAIN_CHANCE_WORDS).sort(), Object.keys(RAIN_CHANCES).sort());
  assert.deepEqual(Object.keys(DAY_NAMES).sort(), Object.values(DAYS).sort());
});

/**
 * @param {Function} build - `(language) => string`.
 * @returns {object} `{ en, fr, de, es }`.
 */
const inEvery = (build) =>
  Object.fromEntries(Object.values(LANGUAGES).map((language) => [language, build(language)]));

test('the sentences read in every language, whatever the values', () => {
  const problems = [];
  const readings = [{ available: false }, { available: true, minutesUntil: null }];
  for (const intensity of Object.values(INTENSITIES)) {
    for (const minutesUntil of [0, 20, 50]) {
      readings.push({ available: true, intensity, minutesUntil });
    }
  }
  readings.forEach((reading, index) =>
    problems.push(
      ...checkTexts(
        inEvery((l) => nextHourSentence(reading, l)),
        `next hour ${index}`,
        120,
      ),
    ),
  );
  for (const condition of Object.keys(CONDITION_NAMES)) {
    for (const [min, rainChance] of [
      [null, null],
      [24, 'medium_high'],
    ]) {
      const values = { day: 'tomorrow', condition, min, max: min === null ? null : 31, rainChance };
      problems.push(
        ...checkTexts(
          inEvery((l) => daySentence({ ...values, labels: unitLabels('metric') }, l)),
          `day ${condition}`,
          160,
        ),
      );
    }
  }
  const signals = parseWarnings(
    Object.fromEntries(
      Object.keys(SIGNALS).map((code) => [code, { name: 'Signal', code, actionCode: 'ISSUE' }]),
    ),
  );
  for (const change of Object.values(CHANGES)) {
    for (const warning of signals) {
      const sentence = inEvery((l) =>
        warningChangeSentence({ change, warning, previous: signals[0] }, l),
      );
      problems.push(...checkTexts(sentence, `${change} ${warning.code}`, 200));
    }
  }
  problems.push(
    ...checkTexts(
      inEvery((l) => warningsSentence([], l)),
      'no warning',
      200,
    ),
  );
  problems.push(
    ...checkTexts(
      inEvery((l) => warningsSentence(signals.slice(0, 2), l)),
      'two',
      300,
    ),
  );
  assert.deepEqual(problems, []);
  assert.equal(
    nextHourSentence({ available: true, intensity: 'heavy', minutesUntil: 20 }, 'de'),
    'Starker Regen in 20 Minuten erwartet.',
  );
  assert.equal(
    daySentence(
      {
        day: 'tomorrow',
        condition: 'rain',
        min: 24,
        max: 28,
        rainChance: 'high',
        labels: unitLabels('metric'),
      },
      'es',
    ),
    'Mañana: lluvia, de 24 a 28 °C, probabilidad alta de lluvia significativa.',
  );
});

test('the statuses have the four languages', () => {
  const problems = [];
  const summaries = [
    { houses: 0, inArea: 0, error: null },
    { houses: 1, inArea: 0, error: null },
    ...Object.values(ERROR_KINDS).map((kind) => ({ houses: 1, inArea: 1, error: { kind } })),
  ];
  for (const summary of summaries) {
    const { message } = connectionStatus(summary);
    problems.push(...checkTexts(message, `status ${JSON.stringify(summary)}`, 200));
  }
  assert.deepEqual(problems, []);
});

/**
 * @param {string} language - 'en', 'fr', 'de' or 'es'.
 * @returns {Promise<string>} The documentation in that language.
 */
async function readDoc(language) {
  return readFile(new URL(`../docs/${language}.md`, import.meta.url), 'utf8');
}

test('the four documentation files exist, with the same sections', async () => {
  const outlines = {};
  for (const language of EXPECTED_LANGUAGES) {
    const doc = await readDoc(language);
    assert.ok(doc.length >= 300, `docs/${language}.md is too short for the store`);
    outlines[language] = doc
      .split('\n')
      .filter((line) => /^#{1,3} /.test(line))
      .map((line) => line.match(/^#+/)[0].length);
  }
  for (const language of EXPECTED_LANGUAGES) {
    assert.deepEqual(outlines[language], outlines.en, `docs/${language}.md: other sections`);
  }
  assert.ok(outlines.en.filter((level) => level === 2).length >= 8, 'the template sections');
});

test('the documentation credits the Observatory and names every scene card', async () => {
  for (const language of EXPECTED_LANGUAGES) {
    const doc = await readDoc(language);
    assert.match(doc, /Hong Kong Observatory/, language);
    assert.match(doc, /DATA\.GOV\.HK/, language);
    if (language === 'de') {
      assert.doesNotMatch(doc, POLITE_GERMAN, 'German says "du"');
    }
    for (const label of [
      ...manifest.scene_triggers.map((trigger) => trigger.label[language]),
      ...manifest.scene_actions.map((action) => action.label[language]),
    ]) {
      assert.ok(doc.includes(label), `docs/${language}.md: "${label}"`);
    }
  }
});
