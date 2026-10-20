// -----------------------------------------------------------------------------
// The 5-day meteogram of meteoblue, a picture of its own forecast
// (temperature, clouds and precipitation, wind), served to Gladys twice:
//   - as a provider image of the weather payload (onWeatherGetImage, key
//     "meteogram-<place>"), which the core weather card can show;
//   - in the `meteogram` widget (onWidgetGetImage, key "mb-mg-<place>-<time>",
//     a new key when the picture changes, as the widget image cache asks).
//
// A meteogram costs 16,000 credits, twice a forecast: it is off by default,
// fetched only when someone looks at it, and kept `meteogram_hours` (24 h by
// default) in /data/meteograms, so that the core asking again every 10
// minutes, or a restart, costs nothing. The meteoblue logo is kept on the
// picture: it is the attribution meteoblue asks for.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { placeKey } from './forecast-store.js';

const HOUR = 3600 * 1000;
const STALE_MAX_MS = 3 * 24 * HOUR;
const WEATHER_PREFIX = 'meteogram-';
const WIDGET_PREFIX = 'mb-mg-';

/**
 * @description The short id of a place, stable across restarts.
 * @param {object} location - { latitude, longitude }.
 * @returns {string} 10 hexadecimal characters.
 * @example
 * placeId({ latitude: 48.857, longitude: 2.352 }); // -> 'a1b2c3d4e5'
 */
function placeId(location) {
  return createHash('sha256').update(placeKey(location)).digest('hex').slice(0, 10);
}

/**
 * @description Create the meteogram cache.
 * @param {object} options - Options.
 * @param {object} options.api - The meteoblue-api.js client.
 * @param {Function} options.getConfig - `() => ({ meteogramEnabled, meteogramHours })`.
 * @param {Function} options.getPreferences - `() => ({ language, units })`.
 * @param {Function} options.getTimeZone - `() => string|null`.
 * @param {string|null} [options.dir] - The folder (null: memory only).
 * @param {Function} [options.now] - `() => number` in ms.
 * @param {object} [options.logger] - Logger.
 * @returns {object} The cache.
 * @example
 * const meteograms = createMeteograms({ api, getConfig, getPreferences, getTimeZone, dir: '/data/meteograms' });
 */
function createMeteograms({
  api,
  getConfig,
  getPreferences,
  getTimeZone,
  dir = null,
  now = () => Date.now(),
  logger = console,
}) {
  // id -> { latitude, longitude, name, at, bytes|null }
  const places = new Map();
  const pending = new Map();
  const indexPath = dir ? join(dir, 'index.json') : null;

  if (indexPath) {
    try {
      const index = JSON.parse(readFileSync(indexPath, 'utf8'));
      Object.entries(index ?? {}).forEach(([id, entry]) => {
        if (/^[0-9a-f]{10}$/.test(id) && Number.isFinite(entry?.latitude)) {
          places.set(id, { ...entry, bytes: null });
        }
      });
    } catch {
      // Nothing stored yet.
    }
  }

  const save = (id) => {
    if (!dir) {
      return;
    }
    try {
      mkdirSync(dir, { recursive: true });
      const entry = places.get(id);
      if (entry?.bytes) {
        writeFileSync(join(dir, `${id}.png`), entry.bytes);
      }
      const index = {};
      places.forEach((place, key) => {
        index[key] = {
          latitude: place.latitude,
          longitude: place.longitude,
          name: place.name,
          at: place.at,
        };
      });
      writeFileSync(indexPath, JSON.stringify(index));
    } catch (err) {
      logger.warn(`Unable to store the meteogram: ${err.message}`);
    }
  };

  const bytesOf = (id, entry) => {
    if (entry.bytes === null && dir && entry.at) {
      try {
        entry.bytes = readFileSync(join(dir, `${id}.png`));
      } catch {
        entry.at = null;
      }
    }
    return entry.bytes;
  };

  /**
   * @description Remember a place, so that its keys can be served.
   * @param {object} location - { latitude, longitude }.
   * @param {string} [name] - The house name, printed on the picture.
   * @returns {string} The place id.
   */
  function register(location, name) {
    const id = placeId(location);
    const entry = places.get(id);
    if (entry === undefined) {
      places.set(id, {
        latitude: location.latitude,
        longitude: location.longitude,
        name: name ?? null,
        at: null,
        bytes: null,
      });
    } else if (name && entry.name !== name) {
      entry.name = name;
    }
    return id;
  }

  /**
   * @description The meteogram of a place, fetched when missing or too old.
   * @param {string} id - The place id.
   * @returns {Promise<Buffer>} The PNG bytes.
   */
  async function get(id) {
    const entry = places.get(id);
    if (entry === undefined) {
      throw new Error(`Unknown meteogram place ${id}`);
    }
    const { meteogramEnabled, meteogramHours } = getConfig();
    const cached = bytesOf(id, entry);
    const age = entry.at ? now() - entry.at : Infinity;
    if (cached && (age < meteogramHours * HOUR || !meteogramEnabled)) {
      return cached;
    }
    if (!meteogramEnabled) {
      throw new Error('The meteogram is switched off in the configuration');
    }
    if (pending.has(id)) {
      return pending.get(id);
    }
    const { language, units } = getPreferences();
    const request = api
      .meteogram(entry.latitude, entry.longitude, {
        timeZone: getTimeZone(),
        language,
        units,
        name: entry.name ?? undefined,
      })
      .then((bytes) => {
        entry.bytes = bytes;
        entry.at = now();
        save(id);
        return bytes;
      })
      .catch((err) => {
        if (cached && age < STALE_MAX_MS) {
          logger.warn(`Meteogram not refreshed (${err.message}): previous one served`);
          return cached;
        }
        throw err;
      })
      .finally(() => pending.delete(id));
    pending.set(id, request);
    return request;
  }

  return {
    register,
    get,
    /** @returns {number|null} When the cached picture of a place was made. */
    stamp: (id) => places.get(id)?.at ?? null,
    weatherKey: (id) => `${WEATHER_PREFIX}${id}`,
    widgetKey: (id) => `${WIDGET_PREFIX}${id}-${(places.get(id)?.at ?? 0).toString(36)}`,
    /**
     * @param {string} key - A weather image key.
     * @returns {string|null} The place id, or null when the key is not one.
     */
    idFromWeatherKey: (key) => {
      const match = /^meteogram-([0-9a-f]{10})$/.exec(String(key));
      return match && places.has(match[1]) ? match[1] : null;
    },
    /**
     * @param {string} key - A widget image key.
     * @returns {string|null} The place id, or null when the key is not one.
     */
    idFromWidgetKey: (key) => {
      const match = /^mb-mg-([0-9a-f]{10})-[0-9a-z]+$/.exec(String(key));
      return match && places.has(match[1]) ? match[1] : null;
    },
    /** @returns {number} Places with a meteogram (for the budget plan). */
    count: () => [...places.values()].filter((place) => place.at !== null).length,
  };
}

export { WEATHER_PREFIX, WIDGET_PREFIX, placeId, createMeteograms };
