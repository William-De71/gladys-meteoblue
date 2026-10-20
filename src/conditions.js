// -----------------------------------------------------------------------------
// meteoblue pictocodes -> pivot conditions, sky descriptions and icons.
//
// meteoblue describes the sky with numeric codes, in two sets (Forecast API
// reference, pictograms page of the documentation):
//   - the HOURLY set, 1-35 (`pictocode` of data_1h): cirrus, low clouds,
//     haze, fog, rain, snow and thunderstorm combinations;
//   - the DAILY set, 1-17 and 20-25 (`pictocode` of data_day).
// Neither set is localized by the API: the descriptions below are written in
// the four languages of Gladys from the English ones of the reference.
//
// Icons: meteoblue offers its pictograms for free use, with a link back to
// its pictogram page (docs and widgets carry it). They are fetched at run
// time from static.meteoblue.com, never redistributed. PNG files exist for
// the hourly set by day and by night (`NN_day.png`, `NN_night.png`, 1-35) and
// for the daily set ("iday", `NN_iday.png`, 1-19 only): the daily codes 20-25
// borrow the closest hourly day icon. An image key names a code of a known
// set ("mb-h-07-n", "mb-d-03"): the URL is rebuilt from a fixed host and
// that code, so nothing else can ever be fetched (no SSRF).
// -----------------------------------------------------------------------------

import { WEATHER_CONDITIONS as C } from '@gladysassistant/integration-sdk';

const ICON_BASE = 'https://static.meteoblue.com/assets/images/picto/';
const PICTOGRAMS_PAGE = 'https://docs.meteoblue.com/en/meteo/variables/pictograms';

// Hourly set: [pivot condition, en, fr, de, es].
const HOURLY = {
  1: [
    C.CLEAR,
    'Clear, cloudless sky',
    'Ciel clair, sans nuages',
    'Klarer, wolkenloser Himmel',
    'Cielo despejado, sin nubes',
  ],
  2: [
    C.CLEAR,
    'Clear, few cirrus',
    'Clair, quelques cirrus',
    'Klar, wenige Zirren',
    'Despejado, algunos cirros',
  ],
  3: [C.CLEAR, 'Clear with cirrus', 'Clair avec cirrus', 'Klar mit Zirren', 'Despejado con cirros'],
  4: [
    C.CLEAR,
    'Clear with few low clouds',
    'Clair, quelques nuages bas',
    'Klar, wenige tiefe Wolken',
    'Despejado, algunas nubes bajas',
  ],
  5: [
    C.CLEAR,
    'Clear with few low clouds and few cirrus',
    'Clair, quelques nuages bas et cirrus',
    'Klar, wenige tiefe Wolken und Zirren',
    'Despejado, algunas nubes bajas y cirros',
  ],
  6: [
    C.CLEAR,
    'Clear with few low clouds and cirrus',
    'Clair, nuages bas et cirrus',
    'Klar, tiefe Wolken und Zirren',
    'Despejado, nubes bajas y cirros',
  ],
  7: [
    C.PARTLY_CLOUDY,
    'Partly cloudy',
    'Partiellement nuageux',
    'Teilweise bewölkt',
    'Parcialmente nublado',
  ],
  8: [
    C.PARTLY_CLOUDY,
    'Partly cloudy and few cirrus',
    'Partiellement nuageux, quelques cirrus',
    'Teilweise bewölkt, wenige Zirren',
    'Parcialmente nublado, algunos cirros',
  ],
  9: [
    C.PARTLY_CLOUDY,
    'Partly cloudy and cirrus',
    'Partiellement nuageux avec cirrus',
    'Teilweise bewölkt mit Zirren',
    'Parcialmente nublado con cirros',
  ],
  10: [
    C.PARTLY_CLOUDY,
    'Mixed, thunderstorm clouds possible',
    'Variable, nuages orageux possibles',
    'Wechselhaft, Gewitterwolken möglich',
    'Variable, posibles nubes de tormenta',
  ],
  11: [
    C.PARTLY_CLOUDY,
    'Mixed with few cirrus, thunderstorm clouds possible',
    'Variable, quelques cirrus, nuages orageux possibles',
    'Wechselhaft, wenige Zirren, Gewitterwolken möglich',
    'Variable, algunos cirros, posibles nubes de tormenta',
  ],
  12: [
    C.PARTLY_CLOUDY,
    'Mixed with cirrus, thunderstorm clouds possible',
    'Variable avec cirrus, nuages orageux possibles',
    'Wechselhaft mit Zirren, Gewitterwolken möglich',
    'Variable con cirros, posibles nubes de tormenta',
  ],
  13: [
    C.CLEAR,
    'Clear but hazy',
    'Clair mais brumeux',
    'Klar, aber dunstig',
    'Despejado pero brumoso',
  ],
  14: [
    C.CLEAR,
    'Clear but hazy with few cirrus',
    'Clair mais brumeux, quelques cirrus',
    'Klar, aber dunstig, wenige Zirren',
    'Despejado pero brumoso, algunos cirros',
  ],
  15: [
    C.CLEAR,
    'Clear but hazy with cirrus',
    'Clair mais brumeux avec cirrus',
    'Klar, aber dunstig mit Zirren',
    'Despejado pero brumoso con cirros',
  ],
  16: [
    C.FOG,
    'Fog / low stratus clouds',
    'Brouillard / stratus bas',
    'Nebel / Hochnebel',
    'Niebla / estratos bajos',
  ],
  17: [
    C.FOG,
    'Fog / low stratus with few cirrus',
    'Brouillard / stratus bas, quelques cirrus',
    'Nebel / Hochnebel, wenige Zirren',
    'Niebla / estratos bajos, algunos cirros',
  ],
  18: [
    C.FOG,
    'Fog / low stratus with cirrus',
    'Brouillard / stratus bas avec cirrus',
    'Nebel / Hochnebel mit Zirren',
    'Niebla / estratos bajos con cirros',
  ],
  19: [C.CLOUD, 'Mostly cloudy', 'Plutôt nuageux', 'Überwiegend bewölkt', 'Mayormente nublado'],
  20: [
    C.CLOUD,
    'Mostly cloudy and few cirrus',
    'Plutôt nuageux, quelques cirrus',
    'Überwiegend bewölkt, wenige Zirren',
    'Mayormente nublado, algunos cirros',
  ],
  21: [
    C.CLOUD,
    'Mostly cloudy and cirrus',
    'Plutôt nuageux avec cirrus',
    'Überwiegend bewölkt mit Zirren',
    'Mayormente nublado con cirros',
  ],
  22: [C.CLOUD, 'Overcast', 'Couvert', 'Bedeckt', 'Cubierto'],
  23: [
    C.RAIN,
    'Overcast with rain',
    'Couvert avec pluie',
    'Bedeckt mit Regen',
    'Cubierto con lluvia',
  ],
  24: [
    C.SNOW,
    'Overcast with snow',
    'Couvert avec neige',
    'Bedeckt mit Schnee',
    'Cubierto con nieve',
  ],
  25: [
    C.POURING,
    'Overcast with heavy rain',
    'Couvert, fortes pluies',
    'Bedeckt mit starkem Regen',
    'Cubierto con lluvia fuerte',
  ],
  26: [
    C.SNOW,
    'Overcast with heavy snow',
    'Couvert, fortes chutes de neige',
    'Bedeckt mit starkem Schneefall',
    'Cubierto con nevada fuerte',
  ],
  27: [
    C.THUNDERSTORM,
    'Rain, thunderstorms likely',
    'Pluie, orages probables',
    'Regen, Gewitter wahrscheinlich',
    'Lluvia, tormentas probables',
  ],
  28: [
    C.THUNDERSTORM,
    'Light rain, thunderstorms likely',
    'Pluie faible, orages probables',
    'Leichter Regen, Gewitter wahrscheinlich',
    'Lluvia débil, tormentas probables',
  ],
  29: [
    C.SNOW,
    'Storm with heavy snow',
    'Tempête avec fortes chutes de neige',
    'Sturm mit starkem Schneefall',
    'Temporal con nevada fuerte',
  ],
  30: [
    C.THUNDERSTORM,
    'Heavy rain, thunderstorms likely',
    'Fortes pluies, orages probables',
    'Starker Regen, Gewitter wahrscheinlich',
    'Lluvia fuerte, tormentas probables',
  ],
  31: [
    C.RAIN,
    'Mixed with showers',
    'Variable avec averses',
    'Wechselhaft mit Schauern',
    'Variable con chubascos',
  ],
  32: [
    C.SNOW,
    'Mixed with snow showers',
    'Variable avec averses de neige',
    'Wechselhaft mit Schneeschauern',
    'Variable con chubascos de nieve',
  ],
  33: [
    C.DRIZZLE,
    'Overcast with light rain',
    'Couvert avec pluie faible',
    'Bedeckt mit leichtem Regen',
    'Cubierto con lluvia débil',
  ],
  34: [
    C.SNOW,
    'Overcast with light snow',
    'Couvert avec neige faible',
    'Bedeckt mit leichtem Schneefall',
    'Cubierto con nieve débil',
  ],
  35: [
    C.SLEET,
    'Overcast with snow and rain',
    'Couvert avec pluie et neige mêlées',
    'Bedeckt mit Schneeregen',
    'Cubierto con aguanieve',
  ],
};

// Daily set: [pivot condition, en, fr, de, es, hourly icon for the codes
// without a daily PNG].
const DAILY = {
  1: [
    C.CLEAR,
    'Sunny, cloudless sky',
    'Ensoleillé, ciel sans nuages',
    'Sonnig, wolkenloser Himmel',
    'Soleado, cielo sin nubes',
  ],
  2: [
    C.PARTLY_CLOUDY,
    'Sunny and few clouds',
    'Ensoleillé, quelques nuages',
    'Sonnig, wenige Wolken',
    'Soleado, algunas nubes',
  ],
  3: [
    C.PARTLY_CLOUDY,
    'Partly cloudy',
    'Partiellement nuageux',
    'Teilweise bewölkt',
    'Parcialmente nublado',
  ],
  4: [C.CLOUD, 'Overcast', 'Couvert', 'Bedeckt', 'Cubierto'],
  5: [C.FOG, 'Fog', 'Brouillard', 'Nebel', 'Niebla'],
  6: [
    C.RAIN,
    'Overcast with rain',
    'Couvert avec pluie',
    'Bedeckt mit Regen',
    'Cubierto con lluvia',
  ],
  7: [
    C.RAIN,
    'Mixed with showers',
    'Variable avec averses',
    'Wechselhaft mit Schauern',
    'Variable con chubascos',
  ],
  8: [
    C.THUNDERSTORM,
    'Showers, thunderstorms likely',
    'Averses, orages probables',
    'Schauer, Gewitter wahrscheinlich',
    'Chubascos, tormentas probables',
  ],
  9: [
    C.SNOW,
    'Overcast with snow',
    'Couvert avec neige',
    'Bedeckt mit Schnee',
    'Cubierto con nieve',
  ],
  10: [
    C.SNOW,
    'Mixed with snow showers',
    'Variable avec averses de neige',
    'Wechselhaft mit Schneeschauern',
    'Variable con chubascos de nieve',
  ],
  11: [
    C.SLEET,
    'Mostly cloudy, snow and rain',
    'Plutôt nuageux, pluie et neige mêlées',
    'Überwiegend bewölkt, Schneeregen',
    'Mayormente nublado, aguanieve',
  ],
  12: [
    C.DRIZZLE,
    'Overcast with occasional rain',
    'Couvert, pluie par moments',
    'Bedeckt, zeitweise Regen',
    'Cubierto, lluvia ocasional',
  ],
  13: [
    C.SNOW,
    'Overcast with occasional snow',
    'Couvert, neige par moments',
    'Bedeckt, zeitweise Schnee',
    'Cubierto, nieve ocasional',
  ],
  14: [
    C.RAIN,
    'Mostly cloudy with rain',
    'Plutôt nuageux avec pluie',
    'Überwiegend bewölkt mit Regen',
    'Mayormente nublado con lluvia',
  ],
  15: [
    C.SNOW,
    'Mostly cloudy with snow',
    'Plutôt nuageux avec neige',
    'Überwiegend bewölkt mit Schnee',
    'Mayormente nublado con nieve',
  ],
  16: [
    C.DRIZZLE,
    'Mostly cloudy with occasional rain',
    'Plutôt nuageux, pluie par moments',
    'Überwiegend bewölkt, zeitweise Regen',
    'Mayormente nublado, lluvia ocasional',
  ],
  17: [
    C.SNOW,
    'Mostly cloudy with occasional snow',
    'Plutôt nuageux, neige par moments',
    'Überwiegend bewölkt, zeitweise Schnee',
    'Mayormente nublado, nieve ocasional',
  ],
  20: [C.CLOUD, 'Mostly cloudy', 'Plutôt nuageux', 'Überwiegend bewölkt', 'Mayormente nublado', 19],
  21: [
    C.PARTLY_CLOUDY,
    'Mostly sunny, local thunderstorms possible',
    'Plutôt ensoleillé, orages locaux possibles',
    'Überwiegend sonnig, örtliche Gewitter möglich',
    'Mayormente soleado, posibles tormentas locales',
    10,
  ],
  22: [
    C.PARTLY_CLOUDY,
    'Partly cloudy, local thunderstorms possible',
    'Partiellement nuageux, orages locaux possibles',
    'Teilweise bewölkt, örtliche Gewitter möglich',
    'Parcialmente nublado, posibles tormentas locales',
    10,
  ],
  23: [
    C.THUNDERSTORM,
    'Partly cloudy, local thunderstorms and showers',
    'Partiellement nuageux, orages locaux et averses',
    'Teilweise bewölkt, örtliche Gewitter und Schauer',
    'Parcialmente nublado, tormentas locales y chubascos',
    28,
  ],
  24: [
    C.THUNDERSTORM,
    'Cloudy, thunderstorms and heavy showers',
    'Nuageux, orages et fortes averses',
    'Bewölkt, Gewitter und starke Schauer',
    'Nublado, tormentas y chubascos fuertes',
    30,
  ],
  25: [
    C.THUNDERSTORM,
    'Mostly cloudy, thunderstorms and showers',
    'Plutôt nuageux, orages et averses',
    'Überwiegend bewölkt, Gewitter und Schauer',
    'Mayormente nublado, tormentas y chubascos',
    27,
  ],
};

const LANGUAGE_INDEX = { en: 1, fr: 2, de: 3, es: 4 };
// The daily PNG files ("iday") stop at 19.
const DAILY_PNG_MAX = 19;

const entryOf = (set, code) => (Number.isInteger(code) ? (set[code] ?? null) : null);

/**
 * @description The pivot condition of a pictocode.
 * @param {unknown} code - The pictocode.
 * @param {'hourly'|'daily'} [set] - The set of the code.
 * @returns {string} A WEATHER_CONDITIONS value ('unknown' for an unknown code).
 * @example
 * conditionOf(23, 'hourly'); // -> 'rain'
 */
function conditionOf(code, set = 'hourly') {
  const entry = entryOf(set === 'daily' ? DAILY : HOURLY, code);
  return entry === null ? C.UNKNOWN : entry[0];
}

/**
 * @description The sky description of a pictocode, in a language.
 * @param {unknown} code - The pictocode.
 * @param {'hourly'|'daily'} set - The set of the code.
 * @param {string} language - The language (English fallback).
 * @returns {string|null} The description, null for an unknown code.
 * @example
 * describe(4, 'daily', 'fr'); // -> 'Couvert'
 */
function describe(code, set, language) {
  const entry = entryOf(set === 'daily' ? DAILY : HOURLY, code);
  return entry === null ? null : entry[LANGUAGE_INDEX[language] ?? 1];
}

const pad = (code) => String(code).padStart(2, '0');

/**
 * @description The image key of a pictocode icon.
 * @param {unknown} code - The pictocode.
 * @param {'hourly'|'daily'} set - The set of the code.
 * @param {boolean} [isDay] - Day or night (hourly set only).
 * @returns {string|null} "mb-h-07-d", "mb-d-03", or null for an unknown code.
 * @example
 * iconKey(21, 'daily'); // -> 'mb-h-10-d'
 */
function iconKey(code, set, isDay = true) {
  if (set === 'daily') {
    const entry = entryOf(DAILY, code);
    if (entry === null) {
      return null;
    }
    return code <= DAILY_PNG_MAX ? `mb-d-${pad(code)}` : `mb-h-${pad(entry[5])}-d`;
  }
  return entryOf(HOURLY, code) === null ? null : `mb-h-${pad(code)}-${isDay ? 'd' : 'n'}`;
}

/**
 * @description The URL behind an image key, or null when the key names no
 * known pictogram (the image handler then refuses it).
 * @param {string} key - The image key.
 * @returns {string|null} The static.meteoblue.com PNG URL.
 * @example
 * iconUrlFromKey('mb-h-07-n'); // -> 'https://static.meteoblue.com/assets/images/picto/07_night.png'
 */
function iconUrlFromKey(key) {
  const hourly = /^mb-h-(\d{2})-([dn])$/.exec(String(key));
  if (hourly !== null) {
    const code = Number(hourly[1]);
    return HOURLY[code]
      ? `${ICON_BASE}${hourly[1]}_${hourly[2] === 'd' ? 'day' : 'night'}.png`
      : null;
  }
  const daily = /^mb-d-(\d{2})$/.exec(String(key));
  if (daily !== null) {
    const code = Number(daily[1]);
    return DAILY[code] && code <= DAILY_PNG_MAX ? `${ICON_BASE}${daily[1]}_iday.png` : null;
  }
  return null;
}

/**
 * @description Whether a pictocode means precipitation (the rain triggers
 * also look at the amounts; this only helps a dry-looking sky be read right).
 * @param {unknown} code - The pictocode.
 * @param {'hourly'|'daily'} [set] - The set.
 * @returns {boolean} True for rain, drizzle, showers, snow, sleet or storms.
 * @example
 * isWet(33); // -> true
 */
function isWet(code, set = 'hourly') {
  return [C.RAIN, C.POURING, C.DRIZZLE, C.SNOW, C.SLEET, C.THUNDERSTORM, C.HAIL].includes(
    conditionOf(code, set),
  );
}

export {
  ICON_BASE,
  PICTOGRAMS_PAGE,
  HOURLY,
  DAILY,
  conditionOf,
  describe,
  iconKey,
  iconUrlFromKey,
  isWet,
};
