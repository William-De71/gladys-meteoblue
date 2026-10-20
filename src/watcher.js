// -----------------------------------------------------------------------------
// The forecast watcher: the scene triggers of the integration.
//
// meteoblue publishes no official warning in the Forecast API, so the
// triggers are FORECASTS reaching a horizon, evaluated every few minutes on
// the cached forecast of each located house (a round costs no credit; the
// store refreshes a house only when the budget plan says so):
//
//   - rain_expected    the next 3 hours now hold a wet hour (≥ 0.2 mm, and a
//                      chance of at least 40 % when meteoblue gives one),
//                      after a check that held none;
//   - frost_expected   the next 12 hours now hold a temperature at or below
//                      0 °C, after a check that held none;
//   - credits_level    75, 90 or 100 % of the credits of the key year used
//                      (each level once a key year).
//
// One event per transition: a house stays "rain expected" until a check finds
// the next 3 hours dry again. The first round after a start is a baseline
// (it fires nothing): a restart must not repeat an event already sent.
// Event data is flat and scalar (≤ 30 keys); `house` is the selector of the
// house, the value the "House" filter of the trigger is compared with.
// -----------------------------------------------------------------------------

import { describe } from './conditions.js';
import { isWetHour, upcomingHours } from './forecast.js';
import { formatTime } from './time.js';
import { isNumber, precipitationIn, temperatureIn } from './units.js';

const SCENE_TRIGGERS = {
  RAIN_EXPECTED: 'rain_expected',
  FROST_EXPECTED: 'frost_expected',
  CREDITS_LEVEL: 'credits_level',
};

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const INTERVAL_MS = 10 * MINUTE;
const RAIN_HORIZON_HOURS = 3;
const FROST_HORIZON_HOURS = 12;
const FROST_THRESHOLD = 0;

/**
 * @description The kind of a wet spell, from the snow fraction of its hours.
 * @param {Array<object>} hours - The wet hours.
 * @returns {'rain'|'snow'|'mixed'} The kind.
 * @example
 * kindOf([{ snowFraction: 1 }]); // -> 'snow'
 */
function kindOf(hours) {
  const fractions = hours.map((hour) => hour.snowFraction).filter(isNumber);
  if (fractions.length === 0) {
    return 'rain';
  }
  const mean = fractions.reduce((sum, value) => sum + value, 0) / fractions.length;
  if (mean >= 0.7) {
    return 'snow';
  }
  return mean >= 0.2 ? 'mixed' : 'rain';
}

/**
 * @description What the forecast says about the next hours of a house.
 * @param {object} forecast - The parsed forecast.
 * @param {number} now - The instant.
 * @returns {{ rain: object|null, frost: object|null }} The wet spell starting
 * within 3 hours, and the coldest freezing hour within 12 hours.
 * @example
 * evaluate(forecast, Date.now());
 */
function evaluate(forecast, now) {
  const coming = upcomingHours(forecast.hours, now);
  const rainWindow = coming.filter((hour) => hour.instant <= now + RAIN_HORIZON_HOURS * HOUR);
  const wet = rainWindow.filter((hour) => isWetHour(hour));
  const rain =
    wet.length === 0
      ? null
      : {
          first: wet[0],
          total: wet.reduce((sum, hour) => sum + hour.precipitation, 0),
          probability: Math.max(...wet.map((hour) => hour.probability ?? 0)),
          kind: kindOf(wet),
        };
  const frostWindow = coming.filter(
    (hour) => hour.instant <= now + FROST_HORIZON_HOURS * HOUR && isNumber(hour.temperature),
  );
  const freezing = frostWindow.filter((hour) => hour.temperature <= FROST_THRESHOLD);
  const frost =
    freezing.length === 0
      ? null
      : {
          first: freezing[0],
          coldest: freezing.reduce((best, hour) =>
            hour.temperature < best.temperature ? hour : best,
          ),
        };
  return { rain, frost };
}

/**
 * @description Create the watcher.
 * @param {object} options - Options.
 * @param {object} options.houses - The house registry.
 * @param {Function} options.loadForecast - `(house) => Promise<object>`: the
 * parsed forecast of a house (through the store).
 * @param {object} options.credits - The credit budget.
 * @param {Function} options.publish - `(key, data) => Promise`.
 * @param {Function} options.getPreferences - `() => ({ language, units })`.
 * @param {Function} [options.getTimeZone] - `() => string|null`.
 * @param {object} [options.logger] - Logger.
 * @param {Function} [options.now] - `() => number` in ms.
 * @returns {object} `{ start, stop, running, round, checkCredits }`.
 * @example
 * const watcher = createWatcher({ houses, loadForecast, credits, publish, getPreferences });
 */
function createWatcher({
  houses,
  loadForecast,
  credits,
  publish,
  getPreferences,
  getTimeZone = () => null,
  logger = console,
  now = () => Date.now(),
}) {
  // selector -> { rain: boolean, frost: boolean }
  const states = new Map();
  let timer = null;
  let baseline = true;

  const send = async (key, data) => {
    try {
      await publish(key, data);
    } catch (err) {
      logger.warn(`Unable to publish the scene event ${key}: ${err.message}`);
    }
  };

  /** Report the credit levels newly reached. */
  async function checkCredits() {
    const levels = credits.newLevels();
    for (const level of levels) {
      logger.info(`meteoblue credits: ${level} % of the key year used`);
      await send(SCENE_TRIGGERS.CREDITS_LEVEL, {
        level: String(level),
        used: credits.used(),
        annual: credits.annual(),
        remaining: credits.remaining(),
        year_end: credits.periodEnd(),
      });
    }
  }

  /**
   * @description Evaluate one house and fire its transitions.
   * @param {object} house - The house.
   * @param {boolean} quiet - Baseline: remember, fire nothing.
   */
  async function checkHouse(house, quiet) {
    let forecast;
    try {
      forecast = await loadForecast(house);
    } catch (err) {
      logger.debug?.(`Forecast of "${house.name}" unavailable: ${err.message}`);
      return;
    }
    const instant = now();
    const { rain, frost } = evaluate(forecast, instant);
    const previous = states.get(house.selector) ?? { rain: false, frost: false };
    states.set(house.selector, { rain: rain !== null, frost: frost !== null });
    if (quiet) {
      return;
    }
    const { language, units } = getPreferences();
    const timeZone = forecast.meta.timeZone ?? getTimeZone();
    if (rain !== null && !previous.rain) {
      await send(SCENE_TRIGGERS.RAIN_EXPECTED, {
        house: house.selector,
        house_name: house.name,
        kind: rain.kind,
        start_time: formatTime(rain.first.instant, timeZone, language),
        minutes_until: Math.max(0, Math.round((rain.first.instant - instant) / MINUTE)),
        precipitation: precipitationIn(rain.total, units) ?? 0,
        probability: Math.round(rain.probability),
        sky: describe(rain.first.pictocode, 'hourly', language) ?? '',
      });
    }
    if (frost !== null && !previous.frost) {
      await send(SCENE_TRIGGERS.FROST_EXPECTED, {
        house: house.selector,
        house_name: house.name,
        start_time: formatTime(frost.first.instant, timeZone, language),
        hours_until: Math.max(0, Math.round((frost.first.instant - instant) / HOUR)),
        min_temperature: temperatureIn(frost.coldest.temperature, units),
        coldest_time: formatTime(frost.coldest.instant, timeZone, language),
      });
    }
  }

  /**
   * @description One round over every located house.
   * @returns {Promise<void>} Resolved when done.
   */
  async function round() {
    const quiet = baseline;
    baseline = false;
    await houses.refresh();
    for (const house of houses.list()) {
      await checkHouse(house, quiet);
    }
    await checkCredits();
  }

  const schedule = () => {
    timer = setTimeout(async () => {
      try {
        await round();
      } catch (err) {
        logger.warn(`Forecast watcher round failed: ${err.message}`);
      }
      if (timer !== null) {
        schedule();
      }
    }, INTERVAL_MS);
    timer.unref?.();
  };

  return {
    /**
     * @description Start: a baseline round, then a round every 10 minutes.
     * @returns {Promise<void>} Resolved after the baseline.
     */
    async start() {
      if (timer !== null) {
        return;
      }
      baseline = true;
      timer = true;
      try {
        await round();
      } catch (err) {
        logger.warn(`Forecast watcher baseline failed: ${err.message}`);
      }
      // Stopped during the baseline (shutdown, key removed): stay stopped.
      if (timer === true) {
        schedule();
      }
    },
    stop() {
      if (timer !== null && timer !== true) {
        clearTimeout(timer);
      }
      timer = null;
    },
    running: () => timer !== null,
    round,
    checkCredits,
  };
}

export {
  SCENE_TRIGGERS,
  INTERVAL_MS,
  RAIN_HORIZON_HOURS,
  FROST_HORIZON_HOURS,
  kindOf,
  evaluate,
  createWatcher,
};
