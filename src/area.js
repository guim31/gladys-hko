// -----------------------------------------------------------------------------
// Hong Kong: the area the Observatory describes, its stations, its clock.
//
// The Observatory's forecast and warnings are territory-wide: a house is
// served when it lies in Hong Kong, the box below (Lantau to Tap Mun, the
// Shenzhen river to Lamma, with a margin for the outlying islands). Outside,
// the integration answers "no forecast" and the core moves on to its next
// weather provider.
//
// The current temperature is the one of the nearest station of the current
// weather report. The report names its stations without coordinates: the
// table below gives them, from the station list of the Observatory (rounded
// to three decimals, enough to pick the nearest one). A station the report
// names and the table does not know is never picked — the hill-top stations
// (Tai Mo Shan, Ngong Ping) are left out on purpose, being far colder than
// the homes around them.
//
// Hong Kong keeps UTC+8 all year round (no daylight saving): the days of the
// forecast are cut at that midnight, whatever the time zone of Gladys.
// -----------------------------------------------------------------------------

const HONG_KONG_BOX = Object.freeze({ south: 22.1, north: 22.6, west: 113.8, east: 114.5 });

const HK_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const STATIONS = Object.freeze({
  'Chek Lap Kok': [22.309, 113.922],
  'Cheung Chau': [22.201, 114.027],
  'Happy Valley': [22.27, 114.184],
  'Hong Kong Observatory': [22.302, 114.174],
  'Hong Kong Park': [22.278, 114.162],
  'Kai Tak Runway Park': [22.305, 114.216],
  "King's Park": [22.312, 114.173],
  'Kowloon City': [22.335, 114.185],
  'Kwun Tong': [22.319, 114.225],
  'Lau Fau Shan': [22.469, 113.984],
  'Sai Kung': [22.376, 114.275],
  'Sha Tin': [22.402, 114.21],
  'Sham Shui Po': [22.336, 114.137],
  'Shau Kei Wan': [22.282, 114.236],
  'Shek Kong': [22.436, 114.085],
  Stanley: [22.214, 114.219],
  'Ta Kwu Ling': [22.529, 114.157],
  'Tai Mei Tuk': [22.475, 114.237],
  'Tai Po': [22.446, 114.179],
  'Tseung Kwan O': [22.316, 114.256],
  'Tsing Yi': [22.344, 114.11],
  'Tsuen Wan Ho Koon': [22.383, 114.108],
  'Tsuen Wan Shing Mun Valley': [22.376, 114.127],
  'Tuen Mun': [22.386, 113.964],
  'Wong Chuk Hang': [22.248, 114.174],
  'Wong Tai Sin': [22.339, 114.205],
  'Yuen Long Park': [22.441, 114.019],
});

/**
 * @description Whether a location lies in Hong Kong.
 * @param {number} latitude - The latitude.
 * @param {number} longitude - The longitude.
 * @returns {boolean} True inside the box.
 * @example
 * inHongKong(22.28, 114.16); // -> true
 */
function inHongKong(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= HONG_KONG_BOX.south &&
    latitude <= HONG_KONG_BOX.north &&
    longitude >= HONG_KONG_BOX.west &&
    longitude <= HONG_KONG_BOX.east
  );
}

/**
 * @description The distance between two points, in km (equirectangular:
 * exact enough across Hong Kong).
 * @param {number} lat1 - Latitude of the first point.
 * @param {number} lon1 - Longitude of the first point.
 * @param {number} lat2 - Latitude of the second point.
 * @param {number} lon2 - Longitude of the second point.
 * @returns {number} The distance.
 * @example
 * distanceKm(22.3, 114.17, 22.31, 114.17); // -> ~1.1
 */
function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const x = (lon2 - lon1) * rad * Math.cos(((lat1 + lat2) / 2) * rad);
  const y = (lat2 - lat1) * rad;
  return Math.sqrt(x * x + y * y) * 6371;
}

/**
 * @description The nearest known station among the named ones.
 * @param {Array<{place: string}>} readings - The readings, by station name.
 * @param {number} latitude - The latitude of the house.
 * @param {number} longitude - The longitude of the house.
 * @returns {object|null} The reading, with `distanceKm`, or null.
 * @example
 * nearestReading([{ place: 'Stanley', value: 24 }], 22.21, 114.21);
 */
function nearestReading(readings, latitude, longitude) {
  let best = null;
  for (const reading of readings) {
    const position = STATIONS[reading.place];
    if (position === undefined) {
      continue;
    }
    const distance = distanceKm(latitude, longitude, position[0], position[1]);
    if (best === null || distance < best.distanceKm) {
      best = { ...reading, distanceKm: distance };
    }
  }
  return best;
}

/**
 * @description The Hong Kong date of an instant.
 * @param {number} ms - The instant.
 * @returns {string} 'YYYY-MM-DD'.
 * @example
 * hkDate(Date.UTC(2026, 9, 24, 17)); // -> '2026-10-25'
 */
function hkDate(ms) {
  return new Date(ms + HK_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * @description The Hong Kong midnight starting a date.
 * @param {string} date - 'YYYY-MM-DD'.
 * @returns {number} The instant, in ms.
 * @example
 * hkMidnight('2026-10-25'); // -> Date.UTC(2026, 9, 24, 16)
 */
function hkMidnight(date) {
  return Date.parse(`${date}T00:00:00Z`) - HK_OFFSET_MS;
}

export {
  DAY_MS,
  HK_OFFSET_MS,
  HONG_KONG_BOX,
  STATIONS,
  distanceKm,
  hkDate,
  hkMidnight,
  inHongKong,
  nearestReading,
};
