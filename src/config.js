// -----------------------------------------------------------------------------
// Configuration of the Meteoblue integration.
//
// One required field, the API key of the user's meteoblue account (the free
// "Weather API" trial, or paid credits). The rest frames the credit budget,
// which is what decides how fresh the forecast can be:
//
//   - `annual_credits`       credits of the key for one year (10 million for
//                            the free trial; more when credits are bought)
//   - `key_start_date`       the day the key year started (the trial is valid
//                            one year); empty: the first day the integration
//                            spent a credit
//   - `min_refresh_minutes`  floor of the refresh interval: the budget decides
//                            the real one (src/credits.js)
//   - `meteogram_enabled`    the 5-day meteogram picture (16,000 credits each)
//   - `meteogram_hours`      how long a meteogram is kept before a new one
//
// Two internal keys, outside the config_schema (never shown in the UI): the
// language and unit system of the last request, for the scene triggers and
// the scene actions, which receive no language (see readPreferences()).
// -----------------------------------------------------------------------------

// Bounds and defaults, mirrored from the manifest `config_schema`.
const ANNUAL_CREDITS = { min: 100000, max: 10000000000, default: 10000000 };
const MIN_REFRESH_MINUTES = { min: 30, max: 1440, default: 60 };
const METEOGRAM_HOURS = { min: 3, max: 168, default: 24 };

const PREFERENCE_KEYS = { language: 'last_language', units: 'last_units' };
const UNIT_SYSTEMS = ['metric', 'us'];

/**
 * @description Read a bounded number field, falling back to its default.
 * @param {unknown} raw - The raw value (the form can send numbers as strings).
 * @param {{ min: number, max: number, default: number }} bounds - The bounds.
 * @returns {number} The value, rounded to an integer.
 * @example
 * readNumber('45', MIN_REFRESH_MINUTES); // -> 45
 */
function readNumber(raw, bounds) {
  const value = Number(typeof raw === 'string' ? raw.replace(/[\s_'’,.]/g, '') : (raw ?? NaN));
  if (raw === '' || raw === null || raw === undefined || !Number.isFinite(value)) {
    return bounds.default;
  }
  return Math.round(Math.min(bounds.max, Math.max(bounds.min, value)));
}

/**
 * @description Read a boolean field (the form may send "true"/"false").
 * @param {unknown} raw - The raw value.
 * @param {boolean} fallback - The default.
 * @returns {boolean} The value.
 * @example
 * readBoolean('false', true); // -> false
 */
function readBoolean(raw, fallback) {
  if (raw === true || raw === 'true' || raw === 1 || raw === '1') {
    return true;
  }
  if (raw === false || raw === 'false' || raw === 0 || raw === '0') {
    return false;
  }
  return fallback;
}

/**
 * @description Read the API key: printable ASCII only, spaces trimmed (a key
 * pasted with a line break would break the URL).
 * @param {unknown} raw - The raw value.
 * @returns {string} The key, '' when absent.
 * @example
 * readApiKey(' AbCdEf123 \n'); // -> 'AbCdEf123'
 */
function readApiKey(raw) {
  if (typeof raw !== 'string') {
    return '';
  }
  return raw.replace(/[^\x21-\x7e]/g, '');
}

/**
 * @description Read a YYYY-MM-DD date (also DD/MM/YYYY and DD.MM.YYYY, as
 * written in French and German).
 * @param {unknown} raw - The raw value.
 * @returns {string|null} YYYY-MM-DD, or null when empty or not a real date.
 * @example
 * readDate('20/10/2026'); // -> '2026-10-20'
 */
function readDate(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return null;
  }
  const value = raw.trim();
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  let parts = match ? [match[1], match[2], match[3]] : null;
  if (parts === null) {
    match = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(value);
    parts = match ? [match[3], match[2], match[1]] : null;
  }
  if (parts === null) {
    return null;
  }
  const [year, month, day] = parts.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config_schema values.
 * @returns {object} `{ apiKey, annualCredits, keyStartDate, minRefreshMinutes,
 * meteogramEnabled, meteogramHours }`.
 * @example
 * normalizeConfig({ api_key: 'abc' });
 */
function normalizeConfig(rawConfig = {}) {
  const config = rawConfig ?? {};
  return {
    apiKey: readApiKey(config.api_key),
    annualCredits: readNumber(config.annual_credits, ANNUAL_CREDITS),
    keyStartDate: readDate(config.key_start_date),
    minRefreshMinutes: readNumber(config.min_refresh_minutes, MIN_REFRESH_MINUTES),
    meteogramEnabled: readBoolean(config.meteogram_enabled, false),
    meteogramHours: readNumber(config.meteogram_hours, METEOGRAM_HOURS),
  };
}

/**
 * @description Read the stored language and unit system of the last request.
 * @param {object} [rawConfig] - The raw config values.
 * @param {{ language: string, units: string }} fallback - The values to keep
 * when nothing valid is stored.
 * @returns {{ language: string, units: string }} The preferences.
 * @example
 * readPreferences({ last_language: 'fr', last_units: 'metric' }, { language: 'en', units: 'metric' });
 */
function readPreferences(rawConfig, fallback) {
  const config = rawConfig ?? {};
  const language = config[PREFERENCE_KEYS.language];
  const units = config[PREFERENCE_KEYS.units];
  return {
    language:
      typeof language === 'string' && /^[a-z]{2}$/.test(language) ? language : fallback.language,
    units: UNIT_SYSTEMS.includes(units) ? units : fallback.units,
  };
}

export {
  ANNUAL_CREDITS,
  MIN_REFRESH_MINUTES,
  METEOGRAM_HOURS,
  PREFERENCE_KEYS,
  normalizeConfig,
  readNumber,
  readApiKey,
  readBoolean,
  readDate,
  readPreferences,
};
