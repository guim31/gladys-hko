// -----------------------------------------------------------------------------
// Texts the integration writes itself, in English, French, German and Spanish
// (the languages of the Gladys interface).
//
// The core gives the language of the user in a weather request, but a scene
// trigger or a scene action receives none: those texts follow the `language`
// setting ('fr' by default; 'auto' is the language of the last request of the
// core). The condition names are the ones of the Gladys weather widget
// (front/src/config/i18n/*.json, dashboard.boxes.weather.conditions). The
// signal names follow the Observatory's English names; the French, German
// and Spanish ones are translations of the integration (the Observatory
// publishes English and Chinese only).
//
// Every table below holds exactly one entry per language: test/i18n.test.js
// walks them all. German says "du", Spanish says "usted".
// -----------------------------------------------------------------------------

const LANGUAGES = Object.freeze({ EN: 'en', FR: 'fr', DE: 'de', ES: 'es' });

// Locales of the numbers and times of the sentences.
const LOCALES = Object.freeze({ en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' });

const CONDITION_NAMES = Object.freeze({
  clear: { en: 'Clear sky', fr: 'Ciel dégagé', de: 'Klarer Himmel', es: 'Cielo despejado' },
  'partly-cloudy': {
    en: 'Partly cloudy',
    fr: 'Peu nuageux',
    de: 'Leicht bewölkt',
    es: 'Parcialmente nublado',
  },
  cloud: { en: 'Cloudy', fr: 'Nuageux', de: 'Bewölkt', es: 'Nublado' },
  fog: { en: 'Fog', fr: 'Brouillard', de: 'Nebel', es: 'Niebla' },
  rain: { en: 'Rain', fr: 'Pluie', de: 'Regen', es: 'Lluvia' },
  pouring: { en: 'Heavy rain', fr: 'Fortes pluies', de: 'Starkregen', es: 'Lluvia intensa' },
  thunderstorm: { en: 'Thunderstorm', fr: 'Orages', de: 'Gewitter', es: 'Tormenta' },
  wind: { en: 'Windy', fr: 'Vent', de: 'Windig', es: 'Ventoso' },
  unknown: { en: 'Unavailable', fr: 'Indisponible', de: 'Nicht verfügbar', es: 'No disponible' },
});

const RAIN_LABELS = Object.freeze({
  light: { en: 'Light rain', fr: 'Pluie faible', de: 'Leichter Regen', es: 'Lluvia débil' },
  moderate: {
    en: 'Moderate rain',
    fr: 'Pluie modérée',
    de: 'Mäßiger Regen',
    es: 'Lluvia moderada',
  },
  heavy: { en: 'Heavy rain', fr: 'Pluie forte', de: 'Starker Regen', es: 'Lluvia fuerte' },
});

const DAY_NAMES = Object.freeze({
  today: { en: 'Today', fr: 'Aujourd’hui', de: 'Heute', es: 'Hoy' },
  tomorrow: { en: 'Tomorrow', fr: 'Demain', de: 'Morgen', es: 'Mañana' },
});

const RAIN_CHANCE_WORDS = Object.freeze({
  low: { en: 'low', fr: 'faible', de: 'geringe', es: 'baja' },
  medium_low: {
    en: 'medium-low',
    fr: 'moyenne à faible',
    de: 'mittlere bis geringe',
    es: 'media-baja',
  },
  medium: { en: 'medium', fr: 'moyenne', de: 'mittlere', es: 'media' },
  medium_high: {
    en: 'medium-high',
    fr: 'moyenne à élevée',
    de: 'mittlere bis hohe',
    es: 'media-alta',
  },
  high: { en: 'high', fr: 'élevée', de: 'hohe', es: 'alta' },
});

const gale = (en, fr, de, es) => ({
  en: `No. 8 ${en} Gale or Storm Signal`,
  fr: `Signal n° 8 de coup de vent ou tempête du ${fr}`,
  de: `Sturmsignal Nr. 8 aus ${de}`,
  es: `Señal n.º 8 de temporal del ${es}`,
});

const SIGNAL_NAMES = Object.freeze({
  TC1: {
    en: 'Standby Signal No. 1',
    fr: 'Signal d’alerte n° 1',
    de: 'Bereitschaftssignal Nr. 1',
    es: 'Señal de alerta n.º 1',
  },
  TC3: {
    en: 'Strong Wind Signal No. 3',
    fr: 'Signal de vent fort n° 3',
    de: 'Starkwindsignal Nr. 3',
    es: 'Señal de viento fuerte n.º 3',
  },
  TC8NE: gale('Northeast', 'nord-est', 'Nordost', 'noreste'),
  TC8SE: gale('Southeast', 'sud-est', 'Südost', 'sureste'),
  TC8SW: gale('Southwest', 'sud-ouest', 'Südwest', 'suroeste'),
  TC8NW: gale('Northwest', 'nord-ouest', 'Nordwest', 'noroeste'),
  TC9: {
    en: 'Increasing Gale or Storm Signal No. 9',
    fr: 'Signal n° 9 de coup de vent ou tempête en renforcement',
    de: 'Signal Nr. 9 für zunehmenden Sturm',
    es: 'Señal n.º 9 de temporal en aumento',
  },
  TC10: {
    en: 'Hurricane Signal No. 10',
    fr: 'Signal d’ouragan n° 10',
    de: 'Orkansignal Nr. 10',
    es: 'Señal de huracán n.º 10',
  },
  WTCPRE8: {
    en: 'Pre-No. 8 Special Announcement',
    fr: 'Annonce spéciale avant le signal n° 8',
    de: 'Sondermeldung vor Signal Nr. 8',
    es: 'Aviso especial previo a la señal n.º 8',
  },
  WRAINA: {
    en: 'Amber Rainstorm Warning Signal',
    fr: 'Alerte pluies diluviennes ambre',
    de: 'Starkregenwarnung Bernstein',
    es: 'Aviso ámbar de lluvias torrenciales',
  },
  WRAINR: {
    en: 'Red Rainstorm Warning Signal',
    fr: 'Alerte pluies diluviennes rouge',
    de: 'Starkregenwarnung Rot',
    es: 'Aviso rojo de lluvias torrenciales',
  },
  WRAINB: {
    en: 'Black Rainstorm Warning Signal',
    fr: 'Alerte pluies diluviennes noire',
    de: 'Starkregenwarnung Schwarz',
    es: 'Aviso negro de lluvias torrenciales',
  },
  WTS: {
    en: 'Thunderstorm Warning',
    fr: 'Avertissement d’orages',
    de: 'Gewitterwarnung',
    es: 'Aviso de tormentas',
  },
  WFNTSA: {
    en: 'Flooding in the northern New Territories',
    fr: 'Inondations dans le nord des Nouveaux Territoires',
    de: 'Überschwemmungen in den nördlichen New Territories',
    es: 'Inundaciones en el norte de los Nuevos Territorios',
  },
  WL: {
    en: 'Landslip Warning',
    fr: 'Alerte glissements de terrain',
    de: 'Erdrutschwarnung',
    es: 'Aviso de deslizamientos de tierra',
  },
  WMSGNL: {
    en: 'Strong Monsoon Signal',
    fr: 'Signal de mousson forte',
    de: 'Signal für starken Monsun',
    es: 'Señal de monzón fuerte',
  },
  WHOT: {
    en: 'Very Hot Weather Warning',
    fr: 'Avertissement de très fortes chaleurs',
    de: 'Warnung vor sehr heißem Wetter',
    es: 'Aviso de tiempo muy caluroso',
  },
  WCOLD: {
    en: 'Cold Weather Warning',
    fr: 'Avertissement de temps froid',
    de: 'Kältewarnung',
    es: 'Aviso de tiempo frío',
  },
  WFROST: {
    en: 'Frost Warning',
    fr: 'Avertissement de gel',
    de: 'Frostwarnung',
    es: 'Aviso de heladas',
  },
  WFIREY: {
    en: 'Yellow Fire Danger Warning',
    fr: 'Risque d’incendie jaune',
    de: 'Waldbrandwarnung Gelb',
    es: 'Aviso amarillo de peligro de incendio',
  },
  WFIRER: {
    en: 'Red Fire Danger Warning',
    fr: 'Risque d’incendie rouge',
    de: 'Waldbrandwarnung Rot',
    es: 'Aviso rojo de peligro de incendio',
  },
  WTMW: {
    en: 'Tsunami Warning',
    fr: 'Alerte tsunami',
    de: 'Tsunamiwarnung',
    es: 'Aviso de tsunami',
  },
});

// Fixed texts, sent as a whole to Gladys (statuses) or picked by language.
const MESSAGES = Object.freeze({
  noNowcast: {
    en: 'The rainfall nowcast does not cover the next hour.',
    fr: 'La prévision immédiate de pluie ne couvre pas l’heure à venir.',
    de: 'Die Regen-Kurzfristvorhersage deckt die nächste Stunde nicht ab.',
    es: 'La predicción inmediata de lluvia no cubre la próxima hora.',
  },
  noRain: {
    en: 'No rain expected within the hour.',
    fr: 'Pas de pluie prévue dans l’heure.',
    de: 'Kein Regen in der nächsten Stunde erwartet.',
    es: 'No se espera lluvia en la próxima hora.',
  },
  noDayForecast: {
    en: 'No forecast for this day.',
    fr: 'Pas de prévision pour ce jour.',
    de: 'Keine Vorhersage für diesen Tag.',
    es: 'No hay previsión para este día.',
  },
  outsideArea: {
    en: 'This house is outside Hong Kong: the Observatory only covers Hong Kong.',
    fr: 'Cette maison est hors de Hong Kong : l’Observatoire ne couvre que Hong Kong.',
    de: 'Dieses Zuhause liegt außerhalb von Hongkong: Das Observatorium deckt nur Hongkong ab.',
    es: 'Esta vivienda está fuera de Hong Kong: el Observatorio solo cubre Hong Kong.',
  },
  warningsUnknown: {
    en: 'The Observatory’s warnings are unavailable for now.',
    fr: 'Les avertissements de l’Observatoire sont indisponibles pour le moment.',
    de: 'Die Warnungen des Observatoriums sind im Moment nicht verfügbar.',
    es: 'Los avisos del Observatorio no están disponibles por ahora.',
  },
  noLocation: {
    en: 'No house of Gladys has a location: set it in Settings → Houses.',
    fr: 'Aucune maison de Gladys n’a de position : renseignez-la dans Paramètres → Maisons.',
    de: 'Kein Zuhause in Gladys hat einen Standort: Lege ihn unter Einstellungen → Zuhause fest.',
    es: 'Ninguna vivienda de Gladys tiene ubicación: indíquela en Configuración → Viviendas.',
  },
  noHouseInArea: {
    en: 'No house of Gladys is in Hong Kong: the Observatory only covers Hong Kong.',
    fr: 'Aucune maison de Gladys n’est à Hong Kong : l’Observatoire ne couvre que Hong Kong.',
    de: 'Kein Zuhause in Gladys liegt in Hongkong: Das Observatorium deckt nur Hongkong ab.',
    es: 'Ninguna vivienda de Gladys está en Hong Kong: el Observatorio solo cubre Hong Kong.',
  },
  throttled: {
    en: 'The Observatory asks to slow down (too many requests from your Internet connection): retrying later.',
    fr: 'L’Observatoire demande de ralentir (trop de requêtes depuis votre connexion Internet) : nouvel essai plus tard.',
    de: 'Das Observatorium bittet darum, langsamer zu werden (zu viele Anfragen von deiner Internetverbindung): neuer Versuch später.',
    es: 'El Observatorio pide reducir el ritmo (demasiadas solicitudes desde su conexión a Internet): se reintentará más tarde.',
  },
  forbidden: {
    en: 'The Observatory refuses the requests (HTTP 403): retrying in 6 hours. Update the integration if this persists.',
    fr: 'L’Observatoire refuse les requêtes (HTTP 403) : nouvel essai dans 6 heures. Mettez à jour l’intégration si cela persiste.',
    de: 'Das Observatorium lehnt die Anfragen ab (HTTP 403): neuer Versuch in 6 Stunden. Aktualisiere die Integration, wenn das anhält.',
    es: 'El Observatorio rechaza las solicitudes (HTTP 403): se reintentará dentro de 6 horas. Actualice la integración si persiste.',
  },
  invalid: {
    en: 'The Observatory sent an unreadable answer: retrying in a few minutes.',
    fr: 'L’Observatoire a envoyé une réponse illisible : nouvel essai dans quelques minutes.',
    de: 'Das Observatorium hat eine unlesbare Antwort geschickt: neuer Versuch in ein paar Minuten.',
    es: 'El Observatorio envió una respuesta ilegible: se reintentará en unos minutos.',
  },
  unreachable: {
    en: 'The Hong Kong Observatory is unreachable for now: retrying in a few minutes.',
    fr: 'L’Observatoire de Hong Kong est injoignable pour le moment : nouvel essai dans quelques minutes.',
    de: 'Das Hong Kong Observatory ist im Moment nicht erreichbar: neuer Versuch in ein paar Minuten.',
    es: 'El Observatorio de Hong Kong no está disponible por ahora: se reintentará en unos minutos.',
  },
});

const plural = (count, one, many) => (count > 1 ? many : one);

// Texts built from values, one function per language.
const TEMPLATES = Object.freeze({
  now: {
    en: (label) => `${label} now.`,
    fr: (label) => `${label} en ce moment.`,
    de: (label) => `${label} gerade jetzt.`,
    es: (label) => `${label} en este momento.`,
  },
  expected: {
    en: (label, minutes) => `${label} expected in ${minutes} minutes.`,
    fr: (label, minutes) => `${label} attendue dans ${minutes} minutes.`,
    de: (label, minutes) => `${label} in ${minutes} Minuten erwartet.`,
    es: (label, minutes) => `${label} prevista en ${minutes} minutos.`,
  },
  temperatures: {
    en: (min, max, unit) => `${min} to ${max} ${unit}`,
    fr: (min, max, unit) => `${min} à ${max} ${unit}`,
    de: (min, max, unit) => `${min} bis ${max} ${unit}`,
    es: (min, max, unit) => `de ${min} a ${max} ${unit}`,
  },
  rainChance: {
    en: (word) => `${word} chance of significant rain`,
    fr: (word) => `probabilité de pluie significative ${word}`,
    de: (word) => `${word} Wahrscheinlichkeit für ergiebigen Regen`,
    es: (word) => `probabilidad ${word} de lluvia significativa`,
  },
  day: {
    en: (name, parts) => `${name}: ${parts.join(', ')}.`,
    fr: (name, parts) => `${name} : ${parts.join(', ')}.`,
    de: (name, parts) => `${name}: ${parts.join(', ')}.`,
    es: (name, parts) => `${name}: ${parts.join(', ')}.`,
  },
  issued: {
    en: (name) => `Issued: ${name}.`,
    fr: (name) => `Émission : ${name}.`,
    de: (name) => `Ausgegeben: ${name}.`,
    es: (name) => `Emitido: ${name}.`,
  },
  upgraded: {
    en: (name, was) => `Upgraded: ${name} (was ${was}).`,
    fr: (name, was) => `Hausse : ${name} (au lieu de ${was}).`,
    de: (name, was) => `Hochgestuft: ${name} (vorher ${was}).`,
    es: (name, was) => `Elevado: ${name} (antes ${was}).`,
  },
  downgraded: {
    en: (name, was) => `Downgraded: ${name} (was ${was}).`,
    fr: (name, was) => `Baisse : ${name} (au lieu de ${was}).`,
    de: (name, was) => `Herabgestuft: ${name} (vorher ${was}).`,
    es: (name, was) => `Rebajado: ${name} (antes ${was}).`,
  },
  updated: {
    en: (name) => `Updated: ${name}.`,
    fr: (name) => `Mise à jour : ${name}.`,
    de: (name) => `Aktualisiert: ${name}.`,
    es: (name) => `Actualizado: ${name}.`,
  },
  lifted: {
    en: (name) => `Lifted: ${name}.`,
    fr: (name) => `Fin : ${name}.`,
    de: (name) => `Aufgehoben: ${name}.`,
    es: (name) => `Levantado: ${name}.`,
  },
  noWarning: {
    en: () => 'No warning in force in Hong Kong.',
    fr: () => 'Aucun avertissement en vigueur à Hong Kong.',
    de: () => 'Keine Warnung in Hongkong in Kraft.',
    es: () => 'Ningún aviso vigente en Hong Kong.',
  },
  warnings: {
    en: (count, names) =>
      `${count} ${plural(count, 'warning', 'warnings')} in force in Hong Kong: ${names}.`,
    fr: (count, names) =>
      `${count} ${plural(count, 'avertissement', 'avertissements')} en vigueur à Hong Kong : ${names}.`,
    de: (count, names) =>
      `${count} ${plural(count, 'Warnung', 'Warnungen')} in Hongkong in Kraft: ${names}.`,
    es: (count, names) =>
      `${count} ${plural(count, 'aviso vigente', 'avisos vigentes')} en Hong Kong: ${names}.`,
  },
  testSucceeded: {
    en: ({ temperature, station, time, warnings }) =>
      `Hong Kong Observatory OK: ${temperature} °C at ${station} at ${time}. ${warnings}`,
    fr: ({ temperature, station, time, warnings }) =>
      `Observatoire de Hong Kong OK : ${temperature} °C à ${station} à ${time}. ${warnings}`,
    de: ({ temperature, station, time, warnings }) =>
      `Hong Kong Observatory OK: ${temperature} °C in ${station} um ${time}. ${warnings}`,
    es: ({ temperature, station, time, warnings }) =>
      `Observatorio de Hong Kong OK: ${temperature} °C en ${station} a las ${time}. ${warnings}`,
  },
  testOutside: {
    en: ({ house }) =>
      `The Observatory answers, but ${house} is outside Hong Kong: Gladys will use another weather provider there.`,
    fr: ({ house }) =>
      `L’Observatoire répond, mais ${house} est hors de Hong Kong : Gladys y utilisera un autre fournisseur météo.`,
    de: ({ house }) =>
      `Das Observatorium antwortet, aber ${house} liegt außerhalb von Hongkong: Gladys nutzt dort einen anderen Wetteranbieter.`,
    es: ({ house }) =>
      `El Observatorio responde, pero ${house} está fuera de Hong Kong: Gladys usará allí otro proveedor del tiempo.`,
  },
});

/**
 * @description Pick the language of a text: the setting, or with 'auto' the
 * language of the last request of the core. An unknown language is English.
 * @param {string} setting - The `language` setting ('auto', 'en', 'fr', 'de', 'es').
 * @param {string|null} [lastSeen] - The language of the last core request.
 * @returns {string} 'en', 'fr', 'de' or 'es'.
 * @example
 * resolveLanguage('auto', 'fr-FR'); // -> 'fr'
 */
function resolveLanguage(setting, lastSeen = null) {
  const wanted = setting === 'auto' ? lastSeen : setting;
  if (typeof wanted !== 'string') {
    return LANGUAGES.EN;
  }
  const prefix = wanted.toLowerCase().slice(0, 2);
  return Object.values(LANGUAGES).includes(prefix) ? prefix : LANGUAGES.EN;
}

/**
 * @description A text of a table in a language, English when unknown.
 * @param {object} table - A table of `{ en, fr, de, es }`.
 * @param {string} key - The key in the table.
 * @param {string} language - 'en', 'fr', 'de' or 'es'.
 * @returns {string} The text.
 * @example
 * pick(MESSAGES, 'noRain', 'de');
 */
function pick(table, key, language) {
  const texts = table[key];
  return texts[language] ?? texts.en;
}

/**
 * @description The function of a template in a language, English when unknown.
 * @param {string} key - A TEMPLATES key.
 * @param {string} language - 'en', 'fr', 'de' or 'es'.
 * @returns {Function} The template.
 * @example
 * template('noWarning', 'es')();
 */
function template(key, language) {
  return TEMPLATES[key][language] ?? TEMPLATES[key].en;
}

/**
 * @description Format a number with the decimal separator of a language.
 * @param {number} value - The number.
 * @param {string} language - 'en', 'fr', 'de' or 'es'.
 * @returns {string} The formatted number.
 * @example
 * formatNumber(5.2, 'fr'); // -> '5,2'
 */
function formatNumber(value, language) {
  return new Intl.NumberFormat(LOCALES[language] ?? LOCALES.en, {
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * @description The name of a condition, as the weather widget of Gladys says it.
 * @param {string} condition - A Gladys condition.
 * @param {string} language - 'en', 'fr', 'de' or 'es'.
 * @returns {string} The capitalized name.
 * @example
 * conditionName('partly-cloudy', 'fr'); // -> 'Peu nuageux'
 */
function conditionName(condition, language) {
  return pick(
    CONDITION_NAMES,
    Object.hasOwn(CONDITION_NAMES, condition) ? condition : 'unknown',
    language,
  );
}

/**
 * @description The name of a warning in a language; the Observatory's
 * English name for a signal the integration does not know.
 * @param {object} warning - A parsed warning.
 * @param {string} language - 'en', 'fr', 'de' or 'es'.
 * @returns {string} The name.
 * @example
 * warningName({ code: 'TC8NE' }, 'fr'); // -> 'Signal n° 8 de coup de vent ou tempête du nord-est'
 */
function warningName(warning, language) {
  return Object.hasOwn(SIGNAL_NAMES, warning.code)
    ? pick(SIGNAL_NAMES, warning.code, language)
    : warning.name;
}

/**
 * @description The sentence of the next hour, ready to put in a message.
 * @param {object} reading - A readNextHour() result.
 * @param {string} language - 'en', 'fr', 'de' or 'es'.
 * @returns {string} The sentence.
 * @example
 * nextHourSentence(reading, 'en'); // -> 'Light rain expected in 30 minutes.'
 */
function nextHourSentence(reading, language) {
  if (!reading.available) {
    return pick(MESSAGES, 'noNowcast', language);
  }
  if (reading.minutesUntil === null) {
    return pick(MESSAGES, 'noRain', language);
  }
  const label = pick(RAIN_LABELS, reading.intensity, language);
  return reading.minutesUntil === 0
    ? template('now', language)(label)
    : template('expected', language)(label, reading.minutesUntil);
}

/**
 * @description The sentence of a day, ready to put in a message:
 * "Tomorrow: partly cloudy, 25 to 31 °C, low chance of significant rain."
 * @param {object} values - The day, in the unit system of the outputs.
 * @param {string} values.day - 'today' or 'tomorrow'.
 * @param {string} values.condition - The Gladys condition.
 * @param {number|null} values.min - The minimum temperature, or null.
 * @param {number|null} values.max - The maximum temperature, or null.
 * @param {string|null} values.rainChance - A rain chance key, or null.
 * @param {object} values.labels - The unit labels (units.js).
 * @param {string} language - 'en', 'fr', 'de' or 'es'.
 * @returns {string} The sentence.
 * @example
 * daySentence({ day: 'tomorrow', condition: 'rain', min: 24, max: 28, rainChance: 'high', labels }, 'en');
 */
function daySentence({ day, condition, min, max, rainChance, labels }, language) {
  const number = (value) => formatNumber(value, language);
  let name = conditionName(condition, language);
  if (language !== LANGUAGES.DE) {
    // German nouns keep their capital; the others read as a sentence.
    name = name.charAt(0).toLowerCase() + name.slice(1);
  }
  const parts = [name];
  if (min !== null && max !== null) {
    parts.push(template('temperatures', language)(number(min), number(max), labels.temperature));
  }
  if (rainChance !== null) {
    parts.push(template('rainChance', language)(pick(RAIN_CHANCE_WORDS, rainChance, language)));
  }
  return template('day', language)(pick(DAY_NAMES, day, language), parts);
}

/**
 * @description The sentence of a warning change.
 * @param {object} change - `{ change, warning, previous? }` (diffWarnings).
 * @param {string} language - 'en', 'fr', 'de' or 'es'.
 * @returns {string} The sentence.
 * @example
 * warningChangeSentence({ change: 'issued', warning }, 'en'); // -> 'Issued: Red Fire Danger Warning.'
 */
function warningChangeSentence({ change, warning, previous }, language) {
  const name = warningName(warning, language);
  const was = previous === undefined ? '' : warningName(previous, language);
  return template(change, language)(name, was);
}

/**
 * @description The sentence of the warnings in force.
 * @param {Array<object>} warnings - The parsed warnings, most severe first.
 * @param {string} language - 'en', 'fr', 'de' or 'es'.
 * @returns {string} The sentence.
 * @example
 * warningsSentence(warnings, 'en');
 */
function warningsSentence(warnings, language) {
  if (warnings.length === 0) {
    return template('noWarning', language)();
  }
  const names = warnings.map((warning) => warningName(warning, language)).join(', ');
  return template('warnings', language)(warnings.length, names);
}

export {
  CONDITION_NAMES,
  DAY_NAMES,
  LANGUAGES,
  MESSAGES,
  RAIN_CHANCE_WORDS,
  RAIN_LABELS,
  SIGNAL_NAMES,
  TEMPLATES,
  conditionName,
  daySentence,
  formatNumber,
  nextHourSentence,
  pick,
  resolveLanguage,
  template,
  warningChangeSentence,
  warningName,
  warningsSentence,
};
