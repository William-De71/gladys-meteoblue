// -----------------------------------------------------------------------------
// Units: from what meteoblue answers to what Gladys asks for.
//
// The integration never asks meteoblue for a unit: the API defaults are °C,
// m/s, degrees and mm. The `units` object of every answer is still read
// rather than assumed (a key configured otherwise on the meteoblue side, or a
// future default, must not turn 20 °F into 20 °C): the parser brings every
// value back to °C, m/s and mm, the internal system.
//
// Gladys asks for one of two systems (contract B.18): `metric` (°C, m/s, hPa,
// mm, km) or `us` (°F, mph, hPa, in, mi). Pressure stays in hPa in both.
// -----------------------------------------------------------------------------

/**
 * @description Round to a number of decimals.
 * @param {number} value - The value.
 * @param {number} [decimals] - Decimals (1).
 * @returns {number} The rounded value.
 * @example
 * round(1.26); // -> 1.3
 */
function round(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * @description Whether a value is a finite number.
 * @param {unknown} value - The value.
 * @returns {boolean} True for a finite number.
 * @example
 * isNumber(NaN); // -> false
 */
function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// --- meteoblue units -> internal (°C, m/s, mm) ------------------------------------

/**
 * @description A meteoblue temperature in °C.
 * @param {unknown} value - The value.
 * @param {string} [unit] - The `units.temperature` of the answer ("C", "F", "K").
 * @returns {number|undefined} °C.
 * @example
 * toCelsius(68, 'F'); // -> 20
 */
function toCelsius(value, unit = 'C') {
  if (!isNumber(value)) {
    return undefined;
  }
  const normalized = String(unit).toUpperCase().replace('°', '');
  if (normalized === 'F') {
    return ((value - 32) * 5) / 9;
  }
  if (normalized === 'K') {
    return value - 273.15;
  }
  return value;
}

// meteoblue writes "ms-1" in its answers and "m/s" in its query enum.
const SPEED_FACTORS = {
  'ms-1': 1,
  'm/s': 1,
  kmh: 1 / 3.6,
  'km/h': 1 / 3.6,
  'kmh-1': 1 / 3.6,
  mph: 0.44704,
  kn: 0.514444,
  kt: 0.514444,
};

/**
 * @description A meteoblue wind speed in m/s. Beaufort is not convertible
 * back to a speed: such a value is dropped.
 * @param {unknown} value - The value.
 * @param {string} [unit] - The `units.windspeed` of the answer.
 * @returns {number|undefined} m/s.
 * @example
 * toMetersPerSecond(36, 'kmh'); // -> 10
 */
function toMetersPerSecond(value, unit = 'ms-1') {
  if (!isNumber(value)) {
    return undefined;
  }
  const factor = SPEED_FACTORS[String(unit).toLowerCase()];
  return factor === undefined ? undefined : value * factor;
}

/**
 * @description A meteoblue precipitation amount in mm.
 * @param {unknown} value - The value.
 * @param {string} [unit] - The `units.precipitation` of the answer ("mm", "inch").
 * @returns {number|undefined} mm.
 * @example
 * toMillimeters(1, 'inch'); // -> 25.4
 */
function toMillimeters(value, unit = 'mm') {
  if (!isNumber(value)) {
    return undefined;
  }
  return /^in/i.test(String(unit)) ? value * 25.4 : value;
}

// --- internal -> the system Gladys asks for -----------------------------------------

/**
 * @description A °C temperature in the requested system.
 * @param {number|undefined} celsius - °C.
 * @param {string} units - 'metric' or 'us'.
 * @returns {number|undefined} °C or °F, one decimal.
 * @example
 * temperatureIn(20, 'us'); // -> 68
 */
function temperatureIn(celsius, units) {
  if (!isNumber(celsius)) {
    return undefined;
  }
  return units === 'us' ? round((celsius * 9) / 5 + 32) : round(celsius);
}

/**
 * @description A m/s speed in the requested system (pivot units).
 * @param {number|undefined} speed - m/s.
 * @param {string} units - 'metric' (m/s) or 'us' (mph).
 * @returns {number|undefined} The speed, one decimal.
 * @example
 * speedIn(10, 'us'); // -> 22.4
 */
function speedIn(speed, units) {
  if (!isNumber(speed)) {
    return undefined;
  }
  return units === 'us' ? round(speed / 0.44704) : round(speed);
}

/**
 * @description A mm amount in the requested system.
 * @param {number|undefined} mm - mm.
 * @param {string} units - 'metric' (mm) or 'us' (in).
 * @returns {number|undefined} The amount.
 * @example
 * precipitationIn(25.4, 'us'); // -> 1
 */
function precipitationIn(mm, units) {
  if (!isNumber(mm)) {
    return undefined;
  }
  return units === 'us' ? round(mm / 25.4, 2) : round(mm, 1);
}

/**
 * @description Clamp a percentage to 0-100, rounded.
 * @param {unknown} value - The percentage.
 * @returns {number|undefined} The clamped value.
 * @example
 * percent(101); // -> 100
 */
function percent(value) {
  return isNumber(value) ? Math.min(100, Math.max(0, Math.round(value))) : undefined;
}

// The 16 compass points, from 0° clockwise.
const COMPASS_POINTS = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
];

/**
 * @description The compass point of a direction, with the letters of each
 * language (O for Ouest / Oeste, E stays E).
 * @param {number|undefined} degrees - The direction.
 * @param {string} [language] - The language.
 * @returns {string|undefined} "SW", "SO"…
 * @example
 * compassOf(225, 'fr'); // -> 'SO'
 */
function compassOf(degrees, language = 'en') {
  if (!isNumber(degrees)) {
    return undefined;
  }
  const point = COMPASS_POINTS[Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16];
  return language === 'fr' || language === 'es' ? point.replaceAll('W', 'O') : point;
}

/**
 * @description The unit labels shown in widgets and sentences.
 * @param {string} units - 'metric' or 'us'.
 * @returns {{ temperature: string, speed: string, precipitation: string }}
 * The labels (wind shown in km/h in metric, as weather services do).
 * @example
 * unitLabels('us').speed; // -> 'mph'
 */
function unitLabels(units) {
  return units === 'us'
    ? { temperature: '°F', speed: 'mph', precipitation: 'in' }
    : { temperature: '°C', speed: 'km/h', precipitation: 'mm' };
}

/**
 * @description A m/s wind speed as displayed (km/h or mph).
 * @param {number|undefined} speed - m/s.
 * @param {string} units - 'metric' or 'us'.
 * @returns {number|undefined} The displayed speed, rounded.
 * @example
 * displaySpeed(10, 'metric'); // -> 36
 */
function displaySpeed(speed, units) {
  if (!isNumber(speed)) {
    return undefined;
  }
  return units === 'us' ? Math.round(speed / 0.44704) : Math.round(speed * 3.6);
}

export {
  round,
  isNumber,
  toCelsius,
  toMetersPerSecond,
  toMillimeters,
  temperatureIn,
  speedIn,
  precipitationIn,
  percent,
  compassOf,
  unitLabels,
  displaySpeed,
};
