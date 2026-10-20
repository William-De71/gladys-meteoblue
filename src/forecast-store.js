// -----------------------------------------------------------------------------
// The forecast of each place, kept as long as the credit budget wants it.
//
// One `basic-1h_basic-day` call gives 7 days of hourly and daily forecast:
// every consumer (the Gladys weather card, the widgets, the scene actions and
// the scene triggers) reads from it, and so do the "current conditions",
// taken from the hour that holds the present moment. A place is refreshed
// only when its forecast is older than the interval of the budget plan
// (credits.js): with the free trial, about every 7 hours for one house.
//
// The answers are also written to /data/forecasts.json: a restart of Gladys
// or of the container does not cost a call (8,000 credits) per place.
//
// When a refresh is impossible (budget spent, meteoblue refused or
// unreachable), the last forecast is served while it is younger than
// STALE_MAX_MS: a 7-day forecast stays useful for a while, an empty weather
// card does not.
// -----------------------------------------------------------------------------

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { roundCoordinate } from './meteoblue-api.js';
import { parseForecast } from './forecast.js';

const HOUR = 3600 * 1000;
const STALE_MAX_MS = 4 * 24 * HOUR;
// Places not asked for this long are forgotten (another house, a test).
const FORGET_AFTER_MS = 14 * 24 * HOUR;

/**
 * @description The key of a place: its rounded coordinates.
 * @param {object} location - { latitude, longitude }.
 * @returns {string} "48.857,2.352".
 * @example
 * placeKey({ latitude: 48.85661, longitude: 2.35222 }); // -> '48.857,2.352'
 */
function placeKey({ latitude, longitude }) {
  return `${roundCoordinate(latitude)},${roundCoordinate(longitude)}`;
}

/**
 * @description Create the store.
 * @param {object} options - Options.
 * @param {object} options.api - The meteoblue-api.js client.
 * @param {Function} options.getIntervalMs - `() => number`: the refresh
 * interval of the budget plan.
 * @param {Function} options.getTimeZone - `() => string|null`: the zone asked.
 * @param {string|null} [options.path] - The JSON file (null: memory only).
 * @param {Function} [options.now] - `() => number` in ms.
 * @param {object} [options.logger] - Logger.
 * @returns {object} `{ get, peek, places, clear }`.
 * @example
 * const store = createForecastStore({ api, getIntervalMs: () => 6 * HOUR, getTimeZone: () => 'Europe/Paris' });
 */
function createForecastStore({
  api,
  getIntervalMs,
  getTimeZone,
  path = null,
  now = () => Date.now(),
  logger = console,
}) {
  // key -> { answer, forecast, at, timeZone, askedAt }
  const entries = new Map();
  // key -> Promise (single flight)
  const pending = new Map();

  if (path) {
    try {
      const stored = JSON.parse(readFileSync(path, 'utf8'));
      Object.entries(stored ?? {}).forEach(([key, entry]) => {
        if (entry && entry.answer && Number.isFinite(entry.at)) {
          const timeZone = entry.timeZone ?? null;
          entries.set(key, {
            answer: entry.answer,
            forecast: parseForecast(entry.answer, { timeZone }),
            at: entry.at,
            timeZone,
            askedAt: entry.askedAt ?? entry.at,
          });
        }
      });
    } catch {
      // No file yet or unreadable: the first ask fetches.
    }
  }

  const save = () => {
    if (!path) {
      return;
    }
    try {
      mkdirSync(dirname(path), { recursive: true });
      const out = {};
      entries.forEach((entry, key) => {
        out[key] = {
          answer: entry.answer,
          at: entry.at,
          timeZone: entry.timeZone,
          askedAt: entry.askedAt,
        };
      });
      writeFileSync(path, JSON.stringify(out));
    } catch (err) {
      logger.warn(`Unable to store the forecasts: ${err.message}`);
    }
  };

  /**
   * @description The forecast of a place, from the cache when fresh enough.
   * @param {object} location - { latitude, longitude }.
   * @param {object} [options] - { force: refresh now (the test action),
   * kind: 'forecast' or 'test' }.
   * @returns {Promise<object>} `{ forecast, at, stale }`.
   * @example
   * const { forecast } = await store.get(house);
   */
  async function get(location, { force = false, kind = 'forecast' } = {}) {
    const key = placeKey(location);
    const entry = entries.get(key);
    const timeZone = getTimeZone();
    if (entry) {
      entry.askedAt = now();
    }
    // A forecast asked in another time zone has its days cut elsewhere.
    const usable = entry !== undefined && entry.timeZone === timeZone;
    if (!force && usable && now() - entry.at < getIntervalMs()) {
      return { forecast: entry.forecast, at: entry.at, stale: false };
    }
    if (pending.has(key)) {
      return pending.get(key);
    }
    const request = api
      .forecast(location.latitude, location.longitude, { timeZone, kind })
      .then((answer) => {
        const fresh = {
          answer,
          forecast: parseForecast(answer, { timeZone }),
          at: now(),
          timeZone,
          askedAt: now(),
        };
        entries.set(key, fresh);
        forgetOld();
        save();
        return { forecast: fresh.forecast, at: fresh.at, stale: false };
      })
      .catch((err) => {
        if (!force && entry !== undefined && now() - entry.at < STALE_MAX_MS) {
          logger.warn(`meteoblue forecast not refreshed (${err.message}): previous one served`);
          return { forecast: entry.forecast, at: entry.at, stale: true, error: err };
        }
        throw err;
      })
      .finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  }

  /**
   * @description The cached forecast of a place, never fetching.
   * @param {object} location - { latitude, longitude }.
   * @returns {object|null} `{ forecast, at }`.
   */
  function peek(location) {
    const entry = entries.get(placeKey(location));
    return entry ? { forecast: entry.forecast, at: entry.at } : null;
  }

  /** Forget the places nobody asked for in two weeks. */
  function forgetOld() {
    entries.forEach((entry, key) => {
      if (now() - entry.askedAt > FORGET_AFTER_MS) {
        entries.delete(key);
      }
    });
  }

  /**
   * @returns {Array<string>} The keys of the places asked recently (they share
   * the budget).
   */
  function places() {
    forgetOld();
    return [...entries.keys()];
  }

  /** Forget everything (a new API key). */
  function clear() {
    entries.clear();
    save();
  }

  return { get, peek, places, clear };
}

export { STALE_MAX_MS, placeKey, createForecastStore };
