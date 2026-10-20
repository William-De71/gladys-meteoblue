// -----------------------------------------------------------------------------
// The Meteoblue integration, wired to a Gladys client.
//
// `createApp(gladys)` registers every handler on the client it receives:
// `new GladysIntegration()` in production (index.js), the fake Gladys of the
// SDK in the tests. Nothing here connects: the caller does, once the
// handlers are registered.
//
// A WEATHER integration (manifest `type: "weather"`, contract B.18): Gladys
// asks for the weather of a location, we answer in the pivot format, and the
// core feeds its dashboard card and the chat assistant with it. On top of
// that:
//   - scene triggers rain_expected / frost_expected / credits_level
//     (watcher.js), which need the houses on their own: `location: true`;
//   - scene actions get_forecast / get_current / get_rain;
//   - widgets daily / hourly / meteogram / credits, with meteoblue's
//     pictograms and meteogram served by the image handler;
//   - the meteogram as a provider image of the weather payload;
//   - a "Test the API key" configuration action.
// Every meteoblue call goes through the forecast store (cache, /data) and
// the credit budget (credits.js): the yearly credits are the first design
// constraint, 8,000 credits a forecast, 10 million a year with the free key.
// -----------------------------------------------------------------------------

import { join } from 'node:path';
import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, readPreferences, PREFERENCE_KEYS } from './config.js';
import { createCredits } from './credits.js';
import { createMeteoblueApi, roundCoordinate } from './meteoblue-api.js';
import { createForecastStore } from './forecast-store.js';
import { createMeteograms } from './meteograms.js';
import { createHouseRegistry } from './houses.js';
import { createWatcher } from './watcher.js';
import { buildWeather } from './weather.js';
import { currentHour } from './forecast.js';
import { describe, iconUrlFromKey } from './conditions.js';
import { isTimeZone, formatDate } from './time.js';
import { temperatureIn, unitLabels } from './units.js';
import {
  SCENE_ACTIONS,
  buildForecastOutputs,
  buildCurrentOutputs,
  buildRainOutputs,
} from './scene-actions.js';
import {
  WIDGETS,
  TTL_SECONDS,
  text,
  messageContent,
  buildDailyWidget,
  buildHourlyWidget,
  buildMeteogramWidget,
  buildCreditsWidget,
} from './widgets.js';
import { all, formatDuration, formatNumber } from './i18n.js';

const ACTIONS = { TEST_API_KEY: 'test_api_key' };
const MAX_ICON_BYTES = 300 * 1024;
const ICON_TIMEOUT_MS = 10 * 1000;
const DATA_DIR = process.env.GLADYS_DATA_DIR || '/data';
const METEOGRAM_LABEL = {
  en: 'Meteogram (meteoblue)',
  fr: 'Météogramme (meteoblue)',
  de: 'Meteogramm (meteoblue)',
  es: 'Meteograma (meteoblue)',
};

/**
 * @description The time zone asked of meteoblue: the zone of Gladys (TZ,
 * passed by the supervisor), else the zone of the runtime, else none (then
 * meteoblue picks the zone of the place).
 * @returns {string|null} The IANA zone.
 * @example
 * defaultTimeZone(); // -> 'Europe/Paris'
 */
function defaultTimeZone() {
  if (isTimeZone(process.env.TZ)) {
    return process.env.TZ;
  }
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isTimeZone(zone) ? zone : null;
}

/**
 * @description Register the handlers of the integration on a Gladys client.
 * @param {object} gladys - The SDK client (or the fake one).
 * @param {object} [options] - Injections for the tests.
 * @param {Function} [options.fetchImpl] - `fetch`.
 * @param {Function} [options.now] - `() => number` in ms.
 * @param {object} [options.logger] - Logger.
 * @param {string|null} [options.dataDir] - The writable folder (null: memory).
 * @param {string|null} [options.timeZone] - The zone asked of meteoblue.
 * @returns {object} `{ idle, store, credits, watcher, meteograms, plan }` for the tests.
 * @example
 * createApp(new GladysIntegration());
 */
function createApp(
  gladys,
  {
    fetchImpl = fetch,
    now = () => Date.now(),
    logger = sdkLogger,
    dataDir = DATA_DIR,
    timeZone = defaultTimeZone(),
  } = {},
) {
  let config = normalizeConfig();
  // Language and unit system of the last request: the scene triggers and the
  // scene actions get none. Stored in the integration config (internal keys)
  // so the first event after a restart is in the right language.
  let preferences = { language: 'en', units: 'metric' };
  let lastStatus = null;
  const getTimeZone = () => timeZone;
  const icons = new Map();

  const credits = createCredits({
    path: dataDir ? join(dataDir, 'credits.json') : null,
    getConfig: () => config,
    now,
    logger,
  });
  const api = createMeteoblueApi({ getApiKey: () => config.apiKey, credits, fetchImpl, logger });
  const houses = createHouseRegistry({ fetchHouses: () => gladys.getHouses(), logger });
  const meteograms = createMeteograms({
    api,
    getConfig: () => config,
    getPreferences: () => preferences,
    getTimeZone,
    dir: dataDir ? join(dataDir, 'meteograms') : null,
    now,
    logger,
  });

  /**
   * @description The refresh plan of the budget, for the places followed.
   * @returns {object} credits.plan() for the current places.
   */
  function plan() {
    const locations = Math.max(1, houses.list().length, store.places().length);
    const meteogramsPerDay = config.meteogramEnabled
      ? (Math.max(1, meteograms.count()) * 24) / config.meteogramHours
      : 0;
    return credits.plan({ locations, meteogramsPerDay });
  }

  const store = createForecastStore({
    api,
    getIntervalMs: () => plan().intervalMs,
    getTimeZone,
    path: dataDir ? join(dataDir, 'forecasts.json') : null,
    now,
    logger,
  });

  // --- Connection status ---------------------------------------------------------

  /**
   * @description Report the connection status, only when it changes.
   * @param {boolean} connected - Connected or not.
   * @param {object} [message] - Multilingual message.
   * @example
   * await setStatus(false, all('noKey'));
   */
  async function setStatus(connected, message) {
    const signature = JSON.stringify([connected, message?.en ?? null]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      logger.warn(`Unable to report the connection status: ${err.message}`);
    }
  }

  /**
   * @description The message of a meteoblue failure, or null for one that
   * needs nothing from the user (a network hiccup).
   * @param {Error} err - The failure.
   * @returns {object|null} The multilingual message.
   */
  function messageOf(err) {
    if (err.name === 'ApiKeyError') {
      if (err.reason === 'missing') {
        return all('noKey');
      }
      if (err.reason === 'expired') {
        return all('keyExpired');
      }
      if (err.reason === 'signature') {
        return all('keySignature');
      }
      return all('keyInvalid', { reason: err.reason });
    }
    if (err.name === 'BudgetExceededError') {
      return all('budget', (language) => ({
        used: formatNumber(credits.used(), language),
        annual: formatNumber(credits.annual(), language),
        end: formatDate(credits.periodEnd(), language),
      }));
    }
    if (err.name === 'QuotaError') {
      return all('quota', { reason: err.message.replace(/^.*?: /, '').slice(0, 60) });
    }
    return null;
  }

  /**
   * @description The forecast of a place through the store, reporting the
   * connection status.
   * @param {object} location - { latitude, longitude }.
   * @param {object} [options] - Passed to store.get().
   * @returns {Promise<object>} `{ forecast, at, stale }`.
   * @example
   * await fetchForecast(house);
   */
  async function fetchForecast(location, options) {
    try {
      const result = await store.get(location, options);
      const message = result.error ? messageOf(result.error) : null;
      if (message) {
        await setStatus(false, message);
      } else if (!result.stale) {
        await setStatus(true);
      }
      return result;
    } catch (err) {
      const message = messageOf(err);
      if (message) {
        await setStatus(false, message);
      }
      throw err;
    }
  }

  /**
   * @description Remember the language and units of the last request, and
   * store them when they changed.
   * @param {object} options - { language, units }.
   * @example
   * rememberPreferences({ language: 'fr', units: 'metric' });
   */
  function rememberPreferences({ language, units }) {
    const next = {
      language: typeof language === 'string' && language ? language : preferences.language,
      units: units === 'us' || units === 'metric' ? units : preferences.units,
    };
    if (next.language === preferences.language && next.units === preferences.units) {
      return;
    }
    preferences = next;
    Promise.resolve()
      .then(() =>
        gladys.setConfig({
          [PREFERENCE_KEYS.language]: next.language,
          [PREFERENCE_KEYS.units]: next.units,
        }),
      )
      .catch((err) => logger.warn(`Unable to store the language and units: ${err.message}`));
  }

  /**
   * @description The located house at a place, if any (its name goes on the
   * meteogram).
   * @param {object} location - { latitude, longitude }.
   * @returns {object|null} The house.
   */
  function houseAt({ latitude, longitude }) {
    return (
      houses
        .list()
        .find(
          (house) =>
            roundCoordinate(house.latitude) === roundCoordinate(latitude) &&
            roundCoordinate(house.longitude) === roundCoordinate(longitude),
        ) ?? null
    );
  }

  // --- Weather provider ------------------------------------------------------------

  gladys.onWeatherGet(async ({ latitude, longitude, language, units }) => {
    rememberPreferences({ language, units });
    const location = { latitude, longitude };
    // No key, budget spent with nothing cached, meteoblue refusing: the
    // request fails and the core falls through to the next provider.
    const { forecast } = await fetchForecast(location);
    const images = [];
    if (config.meteogramEnabled) {
      const id = meteograms.register(location, houseAt(location)?.name);
      images.push({ key: meteograms.weatherKey(id), label: METEOGRAM_LABEL });
    }
    return buildWeather(forecast, {
      units: units === 'us' ? 'us' : 'metric',
      latitude,
      longitude,
      now: now(),
      images,
    });
  });

  gladys.onWeatherGetImage(async (key) => {
    const id = meteograms.idFromWeatherKey(key);
    if (id === null) {
      throw new Error(`Unknown weather image key: ${key}`);
    }
    const bytes = await meteograms.get(id);
    return bytes.toString('base64');
  });

  // --- Forecast watcher (scene triggers) -------------------------------------------

  const watcher = createWatcher({
    houses,
    loadForecast: async (house) => (await fetchForecast(house)).forecast,
    credits,
    publish: (key, data) => gladys.publishSceneEvent(key, data),
    getPreferences: () => preferences,
    getTimeZone,
    logger,
    now,
  });

  /**
   * @description Start or stop the watcher to match the configuration.
   * @returns {Promise<void>} Resolved after the baseline round, if started.
   * @example
   * await syncWatcher();
   */
  async function syncWatcher() {
    if (!config.apiKey) {
      watcher.stop();
      return;
    }
    if (!watcher.running()) {
      await watcher.start();
    }
  }

  // --- Scene actions ---------------------------------------------------------------

  /**
   * @description Find the house a scene action or widget targets.
   * @param {string|null|undefined} selector - The "House" field.
   * @returns {Promise<object>} The house.
   * @example
   * const house = await resolveHouse('main-house');
   */
  async function resolveHouse(selector) {
    if (houses.list().length === 0 || selector) {
      await houses.refresh();
    }
    return houses.resolve(selector);
  }

  gladys.onSceneAction(SCENE_ACTIONS.GET_FORECAST, async (fields) => {
    const house = await resolveHouse(fields.house);
    const { forecast } = await fetchForecast(house);
    return buildForecastOutputs({
      forecast,
      house: house.name,
      language: preferences.language,
      units: preferences.units,
      day: fields.day,
      now: now(),
    });
  });

  gladys.onSceneAction(SCENE_ACTIONS.GET_CURRENT, async (fields) => {
    const house = await resolveHouse(fields.house);
    const { forecast } = await fetchForecast(house);
    return buildCurrentOutputs({
      forecast,
      house: house.name,
      language: preferences.language,
      units: preferences.units,
      now: now(),
    });
  });

  gladys.onSceneAction(SCENE_ACTIONS.GET_RAIN, async (fields) => {
    const house = await resolveHouse(fields.house);
    const { forecast } = await fetchForecast(house);
    return buildRainOutputs({
      forecast,
      house: house.name,
      language: preferences.language,
      units: preferences.units,
      fields,
      now: now(),
    });
  });

  // --- Dashboard widgets -----------------------------------------------------------

  /**
   * @description Build a house widget, or the content explaining why there is none.
   * @param {string} key - The widget key.
   * @param {object} request - { settings, language, units }.
   * @param {Function} build - `(house, language, units, settings) => Promise<object>`.
   * @returns {Promise<object>} The content.
   * @example
   * await houseWidget('daily', request, async (house) => buildDailyWidget({...}));
   */
  async function houseWidget(key, { settings = {}, language, units }, build) {
    rememberPreferences({ language, units });
    const lang = language || preferences.language;
    const ttl = TTL_SECONDS[key];
    if (!config.apiKey) {
      return messageContent(text('noKey', lang), ttl);
    }
    let house;
    try {
      house = await resolveHouse(settings.house);
    } catch (err) {
      if (err.code === 'not_located') {
        return messageContent(text('notLocated', lang, { name: err.houseName }), ttl);
      }
      return messageContent(
        text(err.code === 'unknown_house' ? 'unknownHouse' : 'noHouse', lang),
        ttl,
      );
    }
    try {
      return await build(house, lang, units === 'us' ? 'us' : 'metric', settings);
    } catch (err) {
      if (err.name === 'BudgetExceededError') {
        return messageContent(text('budget', lang), ttl);
      }
      logger.warn(`Widget ${key} failed: ${err.message}`);
      return messageContent(text('unavailable', lang, { reason: err.message.slice(0, 150) }), 60);
    }
  }

  gladys.onWidgetGet(WIDGETS.DAILY, (request) =>
    houseWidget(WIDGETS.DAILY, request, async (house, language, units, settings) => {
      const { forecast, at } = await fetchForecast(house);
      return buildDailyWidget({ forecast, at, house, language, units, settings, now: now() });
    }),
  );

  gladys.onWidgetGet(WIDGETS.HOURLY, (request) =>
    houseWidget(WIDGETS.HOURLY, request, async (house, language, units, settings) => {
      const { forecast, at } = await fetchForecast(house);
      return buildHourlyWidget({ forecast, at, house, language, units, settings, now: now() });
    }),
  );

  gladys.onWidgetGet(WIDGETS.METEOGRAM, (request) =>
    houseWidget(WIDGETS.METEOGRAM, request, async (house, language) => {
      const id = meteograms.register(house, house.name);
      const enabled = config.meteogramEnabled || meteograms.stamp(id) !== null;
      if (enabled && config.meteogramEnabled) {
        // Fetched now, so that the key names the picture it will serve.
        await meteograms.get(id);
      }
      return buildMeteogramWidget({
        house,
        imageKey: enabled ? meteograms.widgetKey(id) : null,
        at: meteograms.stamp(id),
        timeZone,
        language,
      });
    }),
  );

  gladys.onWidgetGet(WIDGETS.CREDITS, async ({ language, units }) => {
    rememberPreferences({ language, units });
    const lang = language || preferences.language;
    if (!config.apiKey) {
      return messageContent(text('noKey', lang), TTL_SECONDS[WIDGETS.CREDITS]);
    }
    return buildCreditsWidget({
      credits,
      plan: plan(),
      places: Math.max(1, houses.list().length, store.places().length),
      language: lang,
    });
  });

  // Pictogram keys name a documented meteoblue pictogram (conditions.js): the
  // URL is rebuilt from a fixed host and a known code, so nothing else can be
  // fetched. Meteogram keys name a place this integration registered.
  gladys.onWidgetGetImage(async (imageKey) => {
    const meteogram = meteograms.idFromWidgetKey(imageKey);
    if (meteogram !== null) {
      return (await meteograms.get(meteogram)).toString('base64');
    }
    const url = iconUrlFromKey(imageKey);
    if (url === null) {
      throw new Error(`Unknown meteoblue image key: ${imageKey}`);
    }
    if (icons.has(imageKey)) {
      return icons.get(imageKey);
    }
    const response = await fetchImpl(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(ICON_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Pictogram ${imageKey}: HTTP ${response.status}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_ICON_BYTES) {
      throw new Error(`Pictogram ${imageKey}: unexpected size ${bytes.length}`);
    }
    const base64 = bytes.toString('base64');
    icons.set(imageKey, base64);
    return base64;
  });

  // --- Configuration action ----------------------------------------------------

  gladys.onAction(ACTIONS.TEST_API_KEY, async () => {
    if (!config.apiKey) {
      return all('noKey');
    }
    await houses.refresh();
    if (houses.list().length === 0) {
      return all('noHouse');
    }
    const house = houses.list()[0];
    try {
      // Fresh on purpose: the point is to test the key now (8,000 credits).
      const { forecast } = await fetchForecast(house, { force: true, kind: 'test' });
      const hour = currentHour(forecast.hours, now());
      const { units, language: last } = preferences;
      const interval = plan().intervalMs;
      return all('testOk', (language) => ({
        house: house.name,
        temperature: hour
          ? `${Math.round(temperatureIn(hour.temperature, units))}${unitLabels(units).temperature}`
          : '?',
        sky: (hour && describe(hour.pictocode, 'hourly', language ?? last)) ?? '?',
        cost: formatNumber(credits.log().at(-1)?.credits ?? credits.costOf('forecast'), language),
        used: formatNumber(credits.used(), language),
        annual: formatNumber(credits.annual(), language),
        interval: formatDuration(interval, language),
      }));
    } catch (err) {
      const message = messageOf(err);
      return message ?? all('testFailed', { reason: err.message.slice(0, 120) });
    }
  });

  // --- Configuration ---------------------------------------------------------------

  /**
   * @description Apply a new configuration.
   * @param {object} rawConfig - The raw config.
   * @returns {Promise<void>} Resolved once applied.
   * @example
   * await applyConfig(await gladys.getConfig());
   */
  async function applyConfig(rawConfig) {
    const previousKey = config.apiKey;
    config = normalizeConfig(rawConfig);
    if (config.apiKey !== previousKey) {
      lastStatus = null;
      // A forecast read with another key stays valid: nothing is cleared, the
      // credits already spent would otherwise be spent again.
    }
    if (!config.apiKey) {
      await setStatus(false, all('noKey'));
    } else if (!credits.canSpend(credits.costOf('forecast'))) {
      await setStatus(false, messageOf({ name: 'BudgetExceededError' }));
    } else if (lastStatus === null) {
      await setStatus(true);
    }
    const current = plan();
    logger.info(
      `Configuration: ${formatNumber(config.annualCredits, 'en')} credits a key year from ` +
        `${credits.periodStart()} (${formatNumber(credits.used(), 'en')} used), refresh every ` +
        `${formatDuration(current.intervalMs, 'en')} (floor ${config.minRefreshMinutes} min), ` +
        `meteogram ${config.meteogramEnabled ? `every ${config.meteogramHours} h` : 'off'}, zone ${timeZone ?? 'auto'}`,
    );
  }

  gladys.onConfigUpdated(async (rawConfig) => {
    await applyConfig(rawConfig);
    await syncWatcher();
  });

  // --- Connection lifecycle ------------------------------------------------------
  // Each step on its own: a failing one must not keep the watcher from starting.
  let ready = Promise.resolve();
  gladys.on('connected', () => {
    ready = (async () => {
      try {
        const rawConfig = await gladys.getConfig();
        preferences = readPreferences(rawConfig, preferences);
        await applyConfig(rawConfig);
      } catch (err) {
        logger.error(`Unable to read the configuration: ${err.message}`);
      }
      await houses.refresh();
      await syncWatcher();
    })();
    return ready;
  });

  gladys.handleShutdown((signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    watcher.stop();
  });

  return {
    idle: () => ready,
    store,
    credits,
    watcher,
    meteograms,
    plan,
    preferences: () => preferences,
  };
}

export { ACTIONS, METEOGRAM_LABEL, createApp, defaultTimeZone };
