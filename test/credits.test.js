// The credit budget and the meteoblue client: the costs, the plan, the key
// year, the cap, and the classification of the documented errors.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { addYears, createCredits, periodStartOf, MAX_INTERVAL_MS } from '../src/credits.js';
import {
  ApiKeyError,
  BudgetExceededError,
  QuotaError,
  classifyError,
  createMeteoblueApi,
  roundCoordinate,
} from '../src/meteoblue-api.js';
import { API_KEY, fakeMeteoblue, silent } from './helpers/fakes.js';

const DAY = 24 * 3600 * 1000;
const START = Date.parse('2026-10-20T08:00:00Z');

/**
 * @description A budget on a settable clock.
 * @param {object} [settings] - Config overrides.
 * @param {string|null} [path] - The file.
 * @returns {object} { credits, clock, settings }.
 */
function budget(settings = {}, path = null) {
  const clock = { now: START };
  const config = {
    annualCredits: 10000000,
    keyStartDate: null,
    minRefreshMinutes: 60,
    ...settings,
  };
  const credits = createCredits({
    path,
    getConfig: () => config,
    now: () => clock.now,
    logger: silent,
  });
  return { credits, clock, config };
}

test('key years: from the start date, 29 February, a date in the future', () => {
  assert.equal(addYears('2028-02-29', 1), '2029-02-28');
  assert.equal(periodStartOf('2025-03-02', '2026-10-20'), '2026-03-02');
  assert.equal(periodStartOf('2026-12-01', '2026-10-20'), '2025-12-01');
  assert.equal(periodStartOf('2026-10-20', '2026-10-20'), '2026-10-20');
});

test('the plan spreads what is left over the rest of the key year', () => {
  const { credits, clock, config } = budget({ keyStartDate: '2026-10-20' });
  const one = credits.plan({ locations: 1 });
  assert.ok(
    Math.abs(one.intervalMs - 7.15 * 3600 * 1000) < 5 * 60 * 1000,
    String(one.intervalMs / 3600000),
  );
  const two = credits.plan({ locations: 2 });
  assert.ok(two.intervalMs > 1.9 * one.intervalMs, 'two houses share the credits');
  const meteogram = credits.plan({ locations: 1, meteogramsPerDay: 1 });
  assert.ok(meteogram.intervalMs > 2 * one.intervalMs, 'a daily meteogram is 2 refreshes');
  // Bought credits: the floor of the configuration rules.
  config.annualCredits = 1e9;
  assert.equal(credits.plan({ locations: 1 }).intervalMs, 60 * 60 * 1000);
  // Most credits spent early: the interval stretches, up to 3 days.
  config.annualCredits = 10000000;
  credits.record('forecast', 9600000);
  assert.ok(credits.plan({ locations: 1 }).intervalMs > 24 * 3600 * 1000);
  assert.ok(credits.plan({ locations: 1 }).intervalMs <= MAX_INTERVAL_MS);
  // Past the reserve: nothing left to plan with.
  credits.record('forecast', 300000);
  assert.equal(credits.plan({ locations: 1 }).intervalMs, Infinity);
  // A new key year resets the count.
  clock.now += 366 * DAY;
  assert.equal(credits.used(), 0);
  assert.equal(credits.periodStart(), '2027-10-20');
});

test('the count: the accounted cost, the hard cap, the levels, the file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mb-credits-'));
  try {
    const path = join(dir, 'credits.json');
    const { credits, config } = budget({ annualCredits: 100000 }, path);
    credits.record('forecast', 8000);
    credits.record('forecast', null);
    credits.record('meteogram', 16000);
    assert.equal(credits.used(), 32000);
    assert.equal(credits.costOf('forecast'), 8000);
    // Without a start date, the key year starts on the first use.
    assert.equal(credits.periodStart(), '2026-10-20');
    assert.deepEqual(credits.newLevels(), []);
    credits.record('forecast', 48000);
    assert.deepEqual(credits.newLevels(), [75]);
    assert.deepEqual(credits.newLevels(), [], 'once a key year');
    assert.equal(credits.canSpend(8000), true);
    credits.record('forecast', 16000);
    assert.equal(credits.canSpend(8000), false, 'the cap is hard');
    assert.deepEqual(credits.newLevels(), [90]);
    // Kept across a restart.
    const again = createCredits({
      path,
      getConfig: () => config,
      now: () => START,
      logger: silent,
    });
    assert.equal(again.used(), 96000);
    assert.deepEqual(again.newLevels(), []);
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).log.length, 5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the documented errors map to the key, the quota or a plain error', () => {
  assert.equal(classifyError(403, 'Apikey was specified, but is not valid.').reason, 'invalid');
  assert.equal(
    classifyError(400, 'Please specify an apikey in the url: &apikey=1234').reason,
    'missing',
  );
  assert.equal(
    classifyError(403, 'Access to the image API expired for this user').reason,
    'expired',
  );
  assert.equal(
    classifyError(
      403,
      'This api key requires signature validation. Please specify the url parameter &sig=…',
    ).reason,
    'signature',
  );
  assert.ok(
    classifyError(429, 'Available credits exceeded for this API key') instanceof QuotaError,
  );
  assert.ok(classifyError(403, 'Daily credit limit reached') instanceof QuotaError);
  assert.ok(classifyError(500, '') instanceof Error);
  assert.equal(roundCoordinate(48.85661), 48.857);
});

test('the client: documented request, the key in the query only, counted with its header', async () => {
  const { credits } = budget({ annualCredits: 100000 });
  const fetchImpl = fakeMeteoblue({ credits: 7000 });
  const api = createMeteoblueApi({ getApiKey: () => API_KEY, credits, fetchImpl, logger: silent });
  const answer = await api.forecast(48.85661, 2.35222, { timeZone: 'Europe/Paris' });
  assert.ok(answer.data_1h.time.length > 100);
  const url = fetchImpl.calls[0];
  assert.equal(url.origin + url.pathname, 'https://my.meteoblue.com/packages/basic-1h_basic-day');
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    lat: '48.857',
    lon: '2.352',
    format: 'json',
    tz: 'Europe/Paris',
    apikey: API_KEY,
  });
  assert.equal(credits.used(), 7000, 'the accounted cost');
  assert.equal(credits.costOf('forecast'), 7000, 'learned for the plan');
  const png = await api.meteogram(48.857, 2.352, { language: 'fr', units: 'us', name: 'Maison' });
  assert.equal(png.readUInt32BE(0), 0x89504e47);
  const meteogram = fetchImpl.calls[1];
  assert.equal(meteogram.pathname, '/images/meteogram');
  assert.equal(meteogram.searchParams.get('lang'), 'fr');
  assert.equal(meteogram.searchParams.get('temperature_units'), 'F');
  assert.equal(meteogram.searchParams.get('no_logo'), null, 'the logo is the attribution');
  assert.equal(credits.used(), 23000);
});

test('the client: a wrong key, the cap reached, a network failure that never shows the key', async () => {
  const { credits } = budget({ annualCredits: 100000 });
  const fetchImpl = fakeMeteoblue();
  const wrong = createMeteoblueApi({ getApiKey: () => 'nope', credits, fetchImpl, logger: silent });
  await assert.rejects(
    wrong.forecast(1, 2),
    (err) => err instanceof ApiKeyError && err.reason === 'invalid',
  );
  assert.equal(credits.used(), 0, 'a refused call costs nothing');
  const none = createMeteoblueApi({ getApiKey: () => '', credits, fetchImpl, logger: silent });
  await assert.rejects(none.forecast(1, 2), (err) => err.reason === 'missing');
  assert.equal(fetchImpl.calls.length, 1, 'no call without a key');
  credits.record('forecast', 95000);
  const api = createMeteoblueApi({ getApiKey: () => API_KEY, credits, fetchImpl, logger: silent });
  await assert.rejects(api.forecast(1, 2), BudgetExceededError);
  assert.equal(fetchImpl.calls.length, 1, 'no call past the cap');
  const failing = createMeteoblueApi({
    getApiKey: () => API_KEY,
    credits: budget().credits,
    fetchImpl: async (url) => {
      throw new TypeError(`fetch failed for ${url}`, { cause: { code: 'ECONNRESET' } });
    },
    logger: silent,
  });
  await assert.rejects(failing.forecast(1, 2), (err) => {
    assert.doesNotMatch(err.message, new RegExp(API_KEY));
    assert.equal(err.cause, undefined);
    assert.match(err.message, /ECONNRESET/);
    return true;
  });
});
