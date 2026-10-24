// -----------------------------------------------------------------------------
// The warnings and signals of the Observatory.
//
// warnsum lists what is in force, one entry per warning statement (WTCSGNL
// the tropical cyclone signal, WRAIN the rainstorm signal, WFIRE the fire
// danger warning…), with the signal in force as `code` (TC8NE, WRAINR,
// WFIRER…) and the last action (ISSUE, REISSUE, EXTEND, UPDATE, CANCEL). A
// cancelled signal stays listed for a while with CANCEL: it is no longer in
// force. warningInfo gives the English texts, by statement.
//
// Every warning covers the whole territory (the flooding announcement of the
// northern New Territories included: the Observatory gives no area). A house
// in Hong Kong has them all; a house elsewhere, none.
//
// Each signal gets a level inside its statement (TC1 < TC3 < TC8 < TC9 <
// TC10, amber < red < black, yellow < red), which tells an upgrade from a
// downgrade, and a CAP severity for the core and the scenes:
//
//   minor     TC1 (standby)
//   moderate  TC3, pre-no. 8 announcement, amber rainstorm, yellow fire
//             danger, very hot, cold, frost, strong monsoon, thunderstorm
//   severe    TC8, red rainstorm, red fire danger, landslip, northern New
//             Territories flooding
//   extreme   TC9, TC10, black rainstorm, tsunami
// -----------------------------------------------------------------------------

import { instant } from './reports.js';

const SEVERITIES = Object.freeze(['minor', 'moderate', 'severe', 'extreme']);

const WARNING_TYPES = Object.freeze([
  'tropical_cyclone',
  'rainstorm',
  'thunderstorm',
  'flooding',
  'landslip',
  'strong_monsoon',
  'very_hot',
  'cold',
  'frost',
  'fire_danger',
  'tsunami',
  'other',
]);

// signal code -> [warning type, level inside its statement, severity]
const SIGNALS = Object.freeze({
  TC1: ['tropical_cyclone', 1, 'minor'],
  TC3: ['tropical_cyclone', 3, 'moderate'],
  TC8NE: ['tropical_cyclone', 8, 'severe'],
  TC8SE: ['tropical_cyclone', 8, 'severe'],
  TC8SW: ['tropical_cyclone', 8, 'severe'],
  TC8NW: ['tropical_cyclone', 8, 'severe'],
  TC9: ['tropical_cyclone', 9, 'extreme'],
  TC10: ['tropical_cyclone', 10, 'extreme'],
  WTCPRE8: ['tropical_cyclone', 1, 'moderate'],
  WRAINA: ['rainstorm', 1, 'moderate'],
  WRAINR: ['rainstorm', 2, 'severe'],
  WRAINB: ['rainstorm', 3, 'extreme'],
  WTS: ['thunderstorm', 1, 'moderate'],
  WFNTSA: ['flooding', 1, 'severe'],
  WL: ['landslip', 1, 'severe'],
  WMSGNL: ['strong_monsoon', 1, 'moderate'],
  WHOT: ['very_hot', 1, 'moderate'],
  WCOLD: ['cold', 1, 'moderate'],
  WFROST: ['frost', 1, 'moderate'],
  WFIREY: ['fire_danger', 1, 'moderate'],
  WFIRER: ['fire_danger', 2, 'severe'],
  WTMW: ['tsunami', 1, 'extreme'],
});

// Warning type -> phenomenon of the pivot (contract B.18), when one fits.
const PIVOT_TYPES = Object.freeze({
  tropical_cyclone: 'wind',
  strong_monsoon: 'wind',
  rainstorm: 'rain',
  landslip: 'rain',
  thunderstorm: 'thunderstorm',
  flooding: 'flood',
  very_hot: 'heat',
  cold: 'cold',
  frost: 'cold',
  tsunami: 'coastal',
});

const CHANGES = Object.freeze({
  ISSUED: 'issued',
  UPGRADED: 'upgraded',
  DOWNGRADED: 'downgraded',
  UPDATED: 'updated',
  LIFTED: 'lifted',
});

/**
 * @description The tropical cyclone signal number of a code.
 * @param {string} code - e.g. 'TC8NE'.
 * @returns {number} 1, 3, 8, 9 or 10; 0 for any other code.
 * @example
 * cycloneSignal('TC8NE'); // -> 8
 */
function cycloneSignal(code) {
  const match = /^TC(\d{1,2})/.exec(code);
  return match === null ? 0 : Number(match[1]);
}

/**
 * @description Read the warnings in force.
 * @param {object} summary - The warnsum answer.
 * @param {object|null} [info] - The warningInfo answer (texts), if read.
 * @returns {Array<object>} `[{ id, code, type, level, severity, name,
 * contents, issuedAt, updatedAt, expiresAt }]`, the most severe first.
 * @example
 * parseWarnings(warnsum, warningInfo);
 */
function parseWarnings(summary, info = null) {
  const details = Array.isArray(info?.details) ? info.details : [];
  const warnings = [];
  for (const [id, entry] of Object.entries(summary ?? {})) {
    if (entry === null || typeof entry !== 'object') {
      continue;
    }
    const code = String(entry.code ?? id).trim();
    if (String(entry.actionCode ?? '').toUpperCase() === 'CANCEL' || code === 'CANCEL') {
      continue;
    }
    const [type, level, severity] = SIGNALS[code] ?? ['other', 1, 'moderate'];
    const name = [entry.type, entry.name]
      .filter((part) => typeof part === 'string' && part.trim() !== '')
      .join(' ');
    const contents = details
      .filter((detail) => detail?.warningStatementCode === id)
      .flatMap((detail) => (Array.isArray(detail.contents) ? detail.contents : []))
      .filter((line) => typeof line === 'string' && line.trim() !== '')
      .join('\n');
    warnings.push({
      id,
      code,
      type,
      level,
      severity,
      name: name === '' ? code : name,
      contents,
      issuedAt: instant(entry.issueTime),
      updatedAt: instant(entry.updateTime),
      expiresAt: instant(entry.expireTime),
    });
  }
  return warnings.sort(
    (a, b) => SEVERITIES.indexOf(b.severity) - SEVERITIES.indexOf(a.severity) || b.level - a.level,
  );
}

/**
 * @description The warnings as alerts of the pivot (at most 10).
 * @param {Array<object>} warnings - The parsed warnings.
 * @param {Function} nameOf - `(warning) => string`, the name in the language
 * of the request.
 * @returns {Array<object>} `[{ severity, event, description?, start?, end?,
 * type? }]`.
 * @example
 * toAlerts(warnings, (warning) => warning.name);
 */
function toAlerts(warnings, nameOf) {
  return warnings.slice(0, 10).map((warning) => {
    const alert = { severity: warning.severity, event: nameOf(warning).slice(0, 100) };
    if (warning.contents !== '') {
      alert.description = warning.contents.slice(0, 5000);
    }
    if (warning.issuedAt !== null) {
      alert.start = new Date(warning.issuedAt).toISOString();
    }
    if (warning.expiresAt !== null) {
      alert.end = new Date(warning.expiresAt).toISOString();
    }
    if (PIVOT_TYPES[warning.type] !== undefined) {
      alert.type = PIVOT_TYPES[warning.type];
    }
    return alert;
  });
}

/**
 * @description The changes between two readings of the warnings.
 * @param {Array<object>} previous - The previous warnings.
 * @param {Array<object>} current - The current warnings.
 * @returns {Array<{change: string, warning: object, previous?: object}>} The
 * changes; a lifted warning carries its last state.
 * @example
 * diffWarnings([], warnings);
 */
function diffWarnings(previous, current) {
  const before = new Map(previous.map((warning) => [warning.id, warning]));
  const changes = [];
  for (const warning of current) {
    const old = before.get(warning.id);
    before.delete(warning.id);
    if (old === undefined) {
      changes.push({ change: CHANGES.ISSUED, warning });
    } else if (warning.level > old.level) {
      changes.push({ change: CHANGES.UPGRADED, warning, previous: old });
    } else if (warning.level < old.level) {
      changes.push({ change: CHANGES.DOWNGRADED, warning, previous: old });
    } else if (warning.code !== old.code || warning.updatedAt !== old.updatedAt) {
      // Same level: a TC8 changing quadrant, or a signal reissued or extended.
      changes.push({ change: CHANGES.UPDATED, warning, previous: old });
    }
  }
  for (const old of before.values()) {
    changes.push({ change: CHANGES.LIFTED, warning: old });
  }
  return changes;
}

export {
  CHANGES,
  PIVOT_TYPES,
  SEVERITIES,
  SIGNALS,
  WARNING_TYPES,
  cycloneSignal,
  diffWarnings,
  parseWarnings,
  toAlerts,
};
