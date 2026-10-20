// -----------------------------------------------------------------------------
// The yearly credit budget of the meteoblue key: what decides how fresh the
// forecast can be.
//
// meteoblue does not count calls but CREDITS, per package (Forecast API
// reference, "Credits and Call Limits"): `basic-1h` + `basic-day` in one call
// cost 8,000 credits (the most expensive resolution of a package is charged
// once), a meteogram of the Image API 16,000. The free Weather API trial
// gives 10 million credits for one year: about 1,250 forecasts, 3 a day for
// one house. Each answer says what it cost (header `MB-Credits-Accounted`):
// that real figure is counted, the table above only plans.
//
// The budget is spread evenly over what is left of the key year: the refresh
// interval of a house is "credits left per day / cost of a refresh", never
// shorter than the configured floor. A small reserve (2 %) is kept for the
// "Test the API key" action and the meteograms asked on demand. The cap is
// hard: once the year's credits are spent, no call goes out (the cached
// forecast is served) until the next key year.
//
// The count lives in /data/credits.json so that a restart does not reset it.
// It is our own estimate: the meteoblue account page is the reference (it
// also counts calls made with the same key elsewhere).
// -----------------------------------------------------------------------------

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const DAY = 24 * 3600 * 1000;
const COSTS = { forecast: 8000, meteogram: 16000 };
const RESERVE_SHARE = 0.02;
// The longest interval the plan stretches to: past it, a 7-day forecast would
// be too old to be worth serving as "current".
const MAX_INTERVAL_MS = 3 * DAY;
const LEVELS = [75, 90, 100];
const MAX_LOG = 20;

/**
 * @description The YYYY-MM-DD of an instant, in UTC.
 * @param {number} instant - The instant in ms.
 * @returns {string} The date.
 * @example
 * dayOf(Date.parse('2026-10-20T08:00:00Z')); // -> '2026-10-20'
 */
function dayOf(instant) {
  return new Date(instant).toISOString().slice(0, 10);
}

/**
 * @description Add whole years to a YYYY-MM-DD date (29 February -> 28).
 * @param {string} date - The date.
 * @param {number} years - Years (may be negative).
 * @returns {string} The date.
 * @example
 * addYears('2028-02-29', 1); // -> '2029-02-28'
 */
function addYears(date, years) {
  const [year, month, day] = date.split('-').map(Number);
  const target = new Date(Date.UTC(year + years, month - 1, day));
  if (target.getUTCMonth() !== month - 1) {
    target.setUTCDate(0);
  }
  return target.toISOString().slice(0, 10);
}

/**
 * @description The start of the key year that contains a day.
 * @param {string} anchor - Any start of a key year (YYYY-MM-DD).
 * @param {string} today - The day (YYYY-MM-DD).
 * @returns {string} The start of the current key year.
 * @example
 * periodStartOf('2025-03-02', '2026-10-20'); // -> '2026-03-02'
 */
function periodStartOf(anchor, today) {
  let start = anchor;
  while (start > today) {
    start = addYears(start, -1);
  }
  while (addYears(start, 1) <= today) {
    start = addYears(start, 1);
  }
  return start;
}

/**
 * @description Create the credit budget.
 * @param {object} options - Options.
 * @param {string|null} options.path - The JSON file (null: memory only).
 * @param {Function} options.getConfig - `() => ({ annualCredits, keyStartDate,
 * minRefreshMinutes })`, read on every check.
 * @param {Function} [options.now] - `() => number` in ms.
 * @param {object} [options.logger] - Logger.
 * @returns {object} The budget.
 * @example
 * const credits = createCredits({ path: '/data/credits.json', getConfig: () => config });
 */
function createCredits({ path, getConfig, now = () => Date.now(), logger = console }) {
  let state = {
    periodStart: null,
    firstUse: null,
    used: 0,
    calls: 0,
    costs: { ...COSTS },
    levels: [],
    log: [],
  };
  if (path) {
    try {
      const stored = JSON.parse(readFileSync(path, 'utf8'));
      if (stored && Number.isFinite(stored.used)) {
        state = {
          ...state,
          periodStart: typeof stored.periodStart === 'string' ? stored.periodStart : null,
          firstUse: typeof stored.firstUse === 'string' ? stored.firstUse : null,
          used: Math.max(0, stored.used),
          calls: Number.isInteger(stored.calls) ? stored.calls : 0,
          costs: { ...COSTS, ...(stored.costs ?? {}) },
          levels: Array.isArray(stored.levels)
            ? stored.levels.filter((l) => LEVELS.includes(l))
            : [],
          log: Array.isArray(stored.log) ? stored.log.slice(-MAX_LOG) : [],
        };
      }
    } catch {
      // No file yet (first start) or unreadable: start from zero.
    }
  }

  const save = () => {
    if (!path) {
      return;
    }
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(state));
    } catch (err) {
      logger.warn(`Unable to store the credit counter: ${err.message}`);
    }
  };

  /**
   * @description Move to the current key year, resetting the count when a
   * new year began.
   * @returns {string} The start of the current key year.
   */
  function rollOver() {
    const today = dayOf(now());
    const anchor = getConfig().keyStartDate ?? state.firstUse ?? today;
    const start = periodStartOf(anchor, today);
    if (state.periodStart !== null && start > state.periodStart) {
      logger.info(`New meteoblue key year from ${start}: credit counter reset`);
      state = { ...state, periodStart: start, used: 0, calls: 0, levels: [] };
      save();
    } else if (state.periodStart !== start) {
      // First start, or a start date entered later: same year, counts kept.
      state.periodStart = start;
    }
    return start;
  }

  const annual = () => getConfig().annualCredits;

  return {
    /** @returns {number} The credits counted in the current key year. */
    used() {
      rollOver();
      return state.used;
    },
    /** @returns {number} The credits of a key year. */
    annual,
    /** @returns {number} The credits left this key year. */
    remaining() {
      rollOver();
      return Math.max(0, annual() - state.used);
    },
    /** @returns {number} The share of the year's credits used, 0-100. */
    usedPercent() {
      rollOver();
      return Math.min(100, Math.round((state.used / annual()) * 1000) / 10);
    },
    /** @returns {string} The first day of the current key year. */
    periodStart: rollOver,
    /** @returns {string} The first day of the next key year. */
    periodEnd() {
      return addYears(rollOver(), 1);
    },
    /** @returns {number} Days left in the key year, today included (≥ 1). */
    daysLeft() {
      const end = Date.parse(`${addYears(rollOver(), 1)}T00:00:00Z`);
      return Math.max(1, Math.ceil((end - now()) / DAY));
    },
    /**
     * @param {string} kind - 'forecast' or 'meteogram'.
     * @returns {number} The cost of one call, as last accounted by meteoblue.
     */
    costOf(kind) {
      return state.costs[kind] ?? COSTS[kind];
    },
    /**
     * @param {number} cost - Credits.
     * @returns {boolean} Whether the year's credits still cover it.
     */
    canSpend(cost) {
      rollOver();
      return state.used + cost <= annual();
    },
    /**
     * Count a call.
     * @param {string} kind - 'forecast', 'meteogram' or 'test'.
     * @param {number|null} accounted - The `MB-Credits-Accounted` header, or
     * null when absent (the planned cost is counted).
     */
    record(kind, accounted) {
      rollOver();
      const costKind = kind === 'test' ? 'forecast' : kind;
      const credits =
        Number.isFinite(accounted) && accounted >= 0 ? accounted : this.costOf(costKind);
      if (Number.isFinite(accounted) && accounted > 0) {
        state.costs[costKind] = accounted;
      }
      state.used += credits;
      state.calls += 1;
      state.firstUse = state.firstUse ?? dayOf(now());
      state.log = [...state.log, { at: new Date(now()).toISOString(), kind, credits }].slice(
        -MAX_LOG,
      );
      save();
    },
    /**
     * @description The refresh plan: how often each location may be
     * refreshed for the credits to last until the end of the key year.
     * @param {object} options - Options.
     * @param {number} options.locations - Locations refreshed (≥ 1).
     * @param {number} [options.meteogramsPerDay] - Meteograms planned a day.
     * @returns {{ intervalMs: number, refreshesPerDay: number, perDay: number }}
     * The interval (Infinity when nothing is left to plan with), the
     * refreshes a day of one location and the credits a day it allows.
     */
    plan({ locations, meteogramsPerDay = 0 }) {
      const spendable = this.remaining() - annual() * RESERVE_SHARE;
      const perDay = Math.max(0, spendable / this.daysLeft());
      const forForecasts = perDay - meteogramsPerDay * this.costOf('meteogram');
      const refreshesPerDay = Math.max(
        0,
        forForecasts / (this.costOf('forecast') * Math.max(1, locations)),
      );
      const floor = getConfig().minRefreshMinutes * 60 * 1000;
      const intervalMs =
        refreshesPerDay <= 0
          ? Infinity
          : Math.min(MAX_INTERVAL_MS, Math.max(floor, Math.ceil(DAY / refreshesPerDay)));
      return { intervalMs, refreshesPerDay, perDay: Math.floor(perDay) };
    },
    /**
     * @description The usage levels (75, 90, 100 %) newly reached since the
     * last call, each reported once per key year.
     * @returns {Array<number>} The levels.
     */
    newLevels() {
      const percent = this.usedPercent();
      const reached = LEVELS.filter((level) => percent >= level && !state.levels.includes(level));
      if (reached.length > 0) {
        state.levels = [...state.levels, ...reached];
        save();
      }
      return reached;
    },
    /** @returns {Array<object>} The last calls ({ at, kind, credits }). */
    log() {
      return [...state.log];
    },
  };
}

export { COSTS, LEVELS, MAX_INTERVAL_MS, RESERVE_SHARE, addYears, periodStartOf, createCredits };
