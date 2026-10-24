// -----------------------------------------------------------------------------
// The Observatory's vocabulary, in Gladys terms.
//
// Weather icons. The Observatory draws its forecast and its current weather
// with numbered icons (https://www.hko.gov.hk/textonly/v2/explain/wxicon_e.htm):
//
//   50 sunny, 51 sunny periods, 52 sunny intervals, 53 sunny periods with a
//   few showers, 54 sunny intervals with showers, 60 cloudy, 61 overcast,
//   62 light rain, 63 rain, 64 heavy rain, 65 thunderstorms, 70-77 fine at
//   night (the phase of the moon), 80 windy, 81 dry, 82 humid, 83 fog,
//   84 mist, 85 haze, 90 hot, 91 warm, 92 cool, 93 cold.
//
// The showers icons (53, 54) are rain for Gladys: the shower is what a scene
// or a reader cares about. The night icons are a clear sky, the night being
// carried by `is_day`. The temperature icons (90-93) come with fine or mainly
// fine weather; cool and cold with some clouds.
//
// Probability of significant rain (PSR). The 9-day forecast gives a class,
// not a number: High (70 % or more), Medium High (55-70 %), Medium
// (45-55 %), Medium Low (30-45 %), Low (under 30 %). The pivot of Gladys
// wants a percentage: the middle of the class (85, 63, 50, 38, 15), said so
// in the documentation.
//
// Wind. The forecast says it in words ("East to northeast force 4, force 5
// offshore later."): the first direction is the wind, the first force (the
// highest of a range) its Beaufort strength, given in m/s by the middle of
// its scale band.
// -----------------------------------------------------------------------------

const ICON_CONDITIONS = Object.freeze({
  50: 'clear',
  51: 'partly-cloudy',
  52: 'partly-cloudy',
  53: 'rain',
  54: 'rain',
  60: 'cloud',
  61: 'cloud',
  62: 'rain',
  63: 'rain',
  64: 'pouring',
  65: 'thunderstorm',
  70: 'clear',
  71: 'clear',
  72: 'clear',
  73: 'clear',
  74: 'clear',
  75: 'clear',
  76: 'clear',
  77: 'clear',
  80: 'wind',
  81: 'clear',
  82: 'cloud',
  83: 'fog',
  84: 'fog',
  85: 'fog',
  90: 'clear',
  91: 'clear',
  92: 'partly-cloudy',
  93: 'partly-cloudy',
});

const RAIN_CHANCES = Object.freeze({
  high: 85,
  medium_high: 63,
  medium: 50,
  medium_low: 38,
  low: 15,
});

// Middle of each Beaufort band, in m/s.
const BEAUFORT_MS = Object.freeze([
  0, 0.9, 2.4, 4.4, 6.7, 9.3, 12.3, 15.5, 18.9, 22.6, 26.4, 30.5, 34,
]);

// Longest names first: "northeast" must not read as "north".
const DIRECTIONS = Object.freeze([
  ['north-northeast', 22.5],
  ['east-northeast', 67.5],
  ['east-southeast', 112.5],
  ['south-southeast', 157.5],
  ['south-southwest', 202.5],
  ['west-southwest', 247.5],
  ['west-northwest', 292.5],
  ['north-northwest', 337.5],
  ['northeast', 45],
  ['southeast', 135],
  ['southwest', 225],
  ['northwest', 315],
  ['north', 0],
  ['east', 90],
  ['south', 180],
  ['west', 270],
]);

/**
 * @description The Gladys condition of an Observatory icon.
 * @param {any} icon - The icon number.
 * @returns {string|null} The condition, or null when unknown.
 * @example
 * iconCondition(64); // -> 'pouring'
 */
function iconCondition(icon) {
  return ICON_CONDITIONS[Number(icon)] ?? null;
}

/**
 * @description Whether an icon is a night icon (fine at night).
 * @param {any} icon - The icon number.
 * @returns {boolean} True for 70-77.
 * @example
 * isNightIcon(72); // -> true
 */
function isNightIcon(icon) {
  const value = Number(icon);
  return value >= 70 && value <= 77;
}

/**
 * @description The key of a probability of significant rain.
 * @param {any} psr - 'High', 'Medium High', 'Medium', 'Medium Low' or 'Low'.
 * @returns {string|null} 'high', 'medium_high', 'medium', 'medium_low',
 * 'low', or null.
 * @example
 * rainChance('Medium High'); // -> 'medium_high'
 */
function rainChance(psr) {
  if (typeof psr !== 'string') {
    return null;
  }
  const key = psr.trim().toLowerCase().replace(/\s+/g, '_');
  return RAIN_CHANCES[key] === undefined ? null : key;
}

/**
 * @description Read the wind of a forecast text.
 * @param {any} text - e.g. 'East to northeast force 4, force 5 offshore later.'
 * @returns {{direction: number|null, force: number|null, speed: number|null}}
 * Degrees, Beaufort force, m/s (null when the text does not say).
 * @example
 * parseWind('Northeast force 3 to 4.'); // -> { direction: 45, force: 4, speed: 6.7 }
 */
function parseWind(text) {
  const wind = { direction: null, force: null, speed: null };
  if (typeof text !== 'string') {
    return wind;
  }
  const lower = text.toLowerCase();
  let first = Infinity;
  for (const [name, degrees] of DIRECTIONS) {
    const match = new RegExp(`\\b${name}\\b`).exec(lower);
    if (match !== null && match.index < first) {
      first = match.index;
      wind.direction = degrees;
    }
  }
  const force = /force\s+(\d{1,2})(?:\s+to\s+(\d{1,2}))?/.exec(lower);
  if (force !== null) {
    const value = Math.min(Number(force[2] ?? force[1]), BEAUFORT_MS.length - 1);
    wind.force = value;
    wind.speed = BEAUFORT_MS[value];
  }
  return wind;
}

export {
  BEAUFORT_MS,
  ICON_CONDITIONS,
  RAIN_CHANCES,
  iconCondition,
  isNightIcon,
  parseWind,
  rainChance,
};
