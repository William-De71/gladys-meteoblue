// The whole integration against the fake Gladys of the SDK and a fake meteoblue.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent, validateWidgetImage } from '@gladysassistant/integration-sdk';

import { createApp, ACTIONS } from '../src/app.js';
import { SCENE_ACTIONS } from '../src/scene-actions.js';
import { SCENE_TRIGGERS } from '../src/watcher.js';
import { WIDGETS } from '../src/widgets.js';
import { API_KEY, fakeMeteoblue, silent } from './helpers/fakes.js';
import { LATITUDE, LONGITUDE, NOW, TIME_ZONE, HOUR } from './helpers/fixtures.js';

const HOUSES = [
  { id: 'h1', name: 'Maison', selector: 'maison', latitude: LATITUDE, longitude: LONGITUDE },
  { id: 'h2', name: 'Grange', selector: 'grange', latitude: null, longitude: null },
];

/**
 * @description The integration on a fake Gladys and a fake meteoblue.
 * @param {object} [options] - { config, meteoblue, clock, houses, dataDir }.
 * @returns {Promise<object>} { gladys, app, meteoblue, clock }.
 */
async function startApp({
  config = { api_key: API_KEY, key_start_date: '2026-10-20' },
  meteoblue = fakeMeteoblue(),
  clock = { now: NOW },
  houses = HOUSES,
  dataDir = null,
} = {}) {
  const gladys = createFakeGladys({ config: { ...config }, houses });
  const app = createApp(gladys, {
    fetchImpl: meteoblue,
    now: () => clock.now,
    logger: silent,
    dataDir,
    timeZone: TIME_ZONE,
  });
  await gladys.connect();
  await app.idle();
  return { gladys, app, meteoblue, clock };
}

const widgetOf = async (gladys, key, settings = {}, language = 'en', units = 'metric') => {
  const ack = await gladys.fake.widgetGet(key, { settings, language, units });
  return { ...ack, data: ack.data?.content };
};

const outputsOf = async (gladys, key, fields = {}) => {
  const ack = await gladys.fake.sceneAction(key, fields);
  return { ...ack, data: ack.data?.outputs };
};

const weatherOf = async (gladys, options = {}) => {
  const ack = await gladys.fake.weatherGet({
    latitude: LATITUDE,
    longitude: LONGITUDE,
    language: 'fr',
    units: 'metric',
    ...options,
  });
  return { ...ack, data: ack.data?.weather };
};

test('without a key: says what to do, calls nobody, the core falls through', async (t) => {
  const { gladys, meteoblue } = await startApp({ config: {} });
  t.after(() => gladys.fake.shutdown());
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /clé API/);
  const ack = await weatherOf(gladys);
  assert.equal(ack.success, false);
  assert.equal(meteoblue.calls.length, 0);
  const widget = await widgetOf(gladys, WIDGETS.DAILY, {}, 'de');
  assert.match(widget.data.components[0].text, /API-Schlüssel/);
});

test('weather: one forecast feeds everything, then the cache until the plan says so', async (t) => {
  const { gladys, app, meteoblue, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  // The baseline round of the watcher read the located house: one call.
  assert.equal(meteoblue.forecasts(), 1);
  const ack = await weatherOf(gladys);
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.temperature, 13.3);
  assert.equal(ack.data.hours.length, 24);
  assert.equal(ack.data.days.length, 7);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  await weatherOf(gladys, { units: 'us' });
  await widgetOf(gladys, WIDGETS.DAILY);
  await widgetOf(gladys, WIDGETS.HOURLY, { metric: 'precipitation' });
  await outputsOf(gladys, SCENE_ACTIONS.GET_RAIN);
  assert.equal(meteoblue.forecasts(), 1, 'everything from the same forecast');
  assert.equal(app.credits.used(), 8000);
  // The free year for one house: a refresh a little more than 7 hours apart.
  const { intervalMs } = app.plan();
  assert.ok(intervalMs > 7 * HOUR && intervalMs < 7.3 * HOUR, String(intervalMs / HOUR));
  clock.now += 6 * HOUR;
  await weatherOf(gladys);
  assert.equal(meteoblue.forecasts(), 1);
  clock.now += 1.5 * HOUR;
  await weatherOf(gladys);
  assert.equal(meteoblue.forecasts(), 2);
  assert.equal(gladys.fake.config.last_language, 'fr');
});

test('a restart costs nothing: credits and forecasts are kept in /data', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'mb-app-'));
  try {
    const meteoblue = fakeMeteoblue();
    const first = await startApp({ dataDir, meteoblue });
    await weatherOf(first.gladys);
    await first.gladys.fake.shutdown();
    const second = await startApp({ dataDir, meteoblue, clock: { now: NOW + HOUR } });
    const ack = await weatherOf(second.gladys);
    assert.equal(ack.success, true);
    assert.equal(meteoblue.forecasts(), 1, 'served from /data/forecasts.json');
    assert.equal(second.app.credits.used(), 8000, 'counted in /data/credits.json');
    await second.gladys.fake.shutdown();
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('a wrong key: the status says so, the core falls through, the test action explains', async (t) => {
  const { gladys, meteoblue } = await startApp({ config: { api_key: 'wrong-key' } });
  t.after(() => gladys.fake.shutdown());
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /refused the API key \(invalid\)/);
  assert.equal((await weatherOf(gladys)).success, false);
  const ack = await gladys.fake.action(ACTIONS.TEST_API_KEY);
  assert.match(ack.data.message.fr, /a refusé la clé API/);
  meteoblue.failure = { status: 403, message: 'Access to the image API expired for this user' };
  await gladys.fake.configUpdated({ api_key: API_KEY });
  const expired = await gladys.fake.action(ACTIONS.TEST_API_KEY);
  assert.match(expired.data.message.en, /expired/);
});

test('meteoblue down: the previous forecast is served, the status stays as it was', async (t) => {
  const { gladys, meteoblue, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  meteoblue.failure = { status: 500, message: 'Internal error' };
  clock.now += 8 * HOUR;
  const ack = await weatherOf(gladys);
  assert.equal(ack.success, true, 'stale but there');
  assert.equal(gladys.fake.connectionStatus.connected, true);
  meteoblue.failure = { status: 429, message: 'Available credits exceeded for this API key' };
  clock.now += 8 * HOUR;
  assert.equal((await weatherOf(gladys)).success, true);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /credits or rate/);
});

test('the credits of the key year spent: no call, the cache is served, the status says until when', async (t) => {
  const { gladys, app, meteoblue, clock } = await startApp({
    config: { api_key: API_KEY, annual_credits: 100000, key_start_date: '2026-10-20' },
  });
  t.after(() => gladys.fake.shutdown());
  app.credits.record('forecast', 90000);
  clock.now += 3 * 24 * HOUR;
  await weatherOf(gladys);
  const calls = meteoblue.forecasts();
  assert.equal(calls, 1, 'nothing left to plan with: the cached forecast is served');
  await gladys.fake.configUpdated({
    api_key: API_KEY,
    annual_credits: 100000,
    key_start_date: '2026-10-20',
  });
  assert.ok(app.credits.used() > 92000);
  // The 75 and 90 % levels, once each.
  await app.watcher.round();
  const levels = gladys.fake.sceneEvents.filter(
    (event) => event.key === SCENE_TRIGGERS.CREDITS_LEVEL,
  );
  assert.deepEqual(
    levels.map((event) => event.data.level),
    ['75', '90'],
  );
  assert.equal(levels[0].data.year_end, '2027-10-20');
  await app.watcher.round();
  assert.equal(gladys.fake.sceneEvents.length, 2);
});

test('scene triggers: rain within 3 hours and frost within 12, once per spell, after a baseline', async (t) => {
  const { gladys, app, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  await weatherOf(gladys);
  assert.equal(gladys.fake.sceneEvents.length, 0, 'the baseline fires nothing');
  clock.now = Date.parse('2026-10-20T10:30:00Z');
  await app.watcher.round();
  const [rain] = gladys.fake.sceneEvents;
  assert.equal(rain.key, SCENE_TRIGGERS.RAIN_EXPECTED);
  assert.deepEqual(
    { ...rain.data },
    {
      house: 'maison',
      house_name: 'Maison',
      kind: 'rain',
      start_time: '15:00',
      minutes_until: 150,
      precipitation: 0.4,
      probability: 70,
      sky: 'Couvert avec pluie faible',
    },
  );
  clock.now += 30 * 60 * 1000;
  await app.watcher.round();
  assert.equal(gladys.fake.sceneEvents.length, 1, 'still the same spell');
  clock.now = Date.parse('2026-10-22T18:00:00Z');
  await app.watcher.round();
  const frost = gladys.fake.sceneEvents.find(
    (event) => event.key === SCENE_TRIGGERS.FROST_EXPECTED,
  );
  assert.equal(frost.data.house, 'maison');
  assert.equal(frost.data.min_temperature, -3);
  // Flat scalar data, within the limits.
  for (const event of gladys.fake.sceneEvents) {
    assert.ok(Object.keys(event.data).length <= 30);
    for (const value of Object.values(event.data)) {
      assert.ok(['string', 'number', 'boolean'].includes(typeof value), event.key);
    }
  }
});

test('scene actions: the house by selector, its outputs only', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  await weatherOf(gladys, { language: 'en' });
  const manifest = (
    await import('../gladys-assistant-integration.json', { with: { type: 'json' } })
  ).default;
  for (const action of manifest.scene_actions) {
    const ack = await outputsOf(gladys, action.key, { house: 'maison' });
    assert.equal(ack.success, true, `${action.key}: ${ack.error}`);
    const declared = action.outputs.map((output) => output.key);
    for (const [key, value] of Object.entries(ack.data)) {
      assert.ok(declared.includes(key), `${action.key}.${key}`);
      assert.ok(typeof value !== 'string' || value.length <= 10000);
    }
  }
  const forecast = await outputsOf(gladys, SCENE_ACTIONS.GET_FORECAST, { day: '3' });
  assert.equal(forecast.data.temperature_min, -3);
  assert.match(forecast.data.summary, /predictability 48%/);
  const unlocated = await outputsOf(gladys, SCENE_ACTIONS.GET_CURRENT, { house: 'grange' });
  assert.equal(unlocated.success, false);
  assert.match(unlocated.error, /has no location/);
});

test('widgets: valid contents in the four languages, the source link, the pictograms', async (t) => {
  const { gladys, meteoblue } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const cases = [
    [WIDGETS.DAILY, {}],
    [WIDGETS.DAILY, { days: '3', show_icons: false }],
    [WIDGETS.HOURLY, {}],
    [WIDGETS.HOURLY, { metric: 'precipitation', hours: '12' }],
    [WIDGETS.HOURLY, { metric: 'wind', hours: '48' }],
    [WIDGETS.METEOGRAM, {}],
    [WIDGETS.CREDITS, {}],
  ];
  for (const language of ['en', 'fr', 'de', 'es']) {
    for (const [key, settings] of cases) {
      const ack = await widgetOf(
        gladys,
        key,
        settings,
        language,
        language === 'en' ? 'us' : 'metric',
      );
      assert.equal(ack.success, true, `${key} ${language}: ${ack.error}`);
      const problems = validateWidgetContent(ack.data);
      assert.deepEqual(problems, [], `${key} ${language}: ${JSON.stringify(problems)}`);
    }
  }
  const daily = await widgetOf(gladys, WIDGETS.DAILY, {}, 'fr');
  const list = daily.data.components.find((component) => component.type === 'card-list');
  assert.equal(list.items.length, 7);
  assert.equal(list.items[0].title, 'Aujourd’hui');
  assert.equal(list.items[0].image, 'mb-d-06');
  const button = daily.data.components.find((component) => component.type === 'button');
  assert.equal(button.link.url, 'https://www.meteoblue.com/fr/meteo/semaine/48.857N2.352E');
  assert.match(daily.data.components[0].text, /Données : meteoblue/);
  const image = await gladys.fake.widgetGetImage('mb-d-06');
  assert.equal(image.success, true);
  assert.deepEqual(validateWidgetImage(image.data.image), []);
  await gladys.fake.widgetGetImage('mb-d-06');
  assert.equal(meteoblue.count('/assets/images/picto/06_iday.png'), 1, 'kept in memory');
  const refused = await gladys.fake.widgetGetImage('https://evil.example/x.png');
  assert.equal(refused.success, false);
  const meteogram = await widgetOf(gladys, WIDGETS.METEOGRAM, {}, 'en');
  assert.match(meteogram.data.components[0].text, /switched off/);
  assert.equal(meteoblue.count('/images/meteogram'), 0, 'off by default: no credit spent');
});

test('the meteogram, when switched on: in the weather payload and its widget, kept for its duration', async (t) => {
  const { gladys, app, meteoblue, clock } = await startApp({
    config: { api_key: API_KEY, key_start_date: '2026-10-20', meteogram_enabled: true },
  });
  t.after(() => gladys.fake.shutdown());
  const weather = await weatherOf(gladys);
  assert.equal(weather.data.images.length, 1);
  const [{ key, label }] = weather.data.images;
  assert.match(key, /^meteogram-[0-9a-f]{10}$/);
  assert.equal(label.fr, 'Météogramme (meteoblue)');
  const image = await gladys.fake.weatherGetImage(key);
  assert.equal(image.success, true, image.error);
  assert.equal(meteoblue.count('/images/meteogram'), 1);
  const widget = await widgetOf(gladys, WIDGETS.METEOGRAM, {}, 'fr');
  const picture = widget.data.components.find((component) => component.type === 'image');
  assert.match(picture.key, /^mb-mg-[0-9a-f]{10}-[0-9a-z]+$/);
  assert.equal((await gladys.fake.widgetGetImage(picture.key)).success, true);
  assert.equal(meteoblue.count('/images/meteogram'), 1, 'one picture for both');
  clock.now += 25 * HOUR;
  await gladys.fake.weatherGetImage(key);
  assert.equal(meteoblue.count('/images/meteogram'), 2, 'renewed after 24 h');
  assert.equal(app.credits.used() % 8000, 0);
  assert.equal((await gladys.fake.weatherGetImage('meteogram-0000000000')).success, false);
  // The meteogram enters the plan: refreshes are further apart.
  assert.ok(app.plan().intervalMs > 14 * HOUR);
});

test('the test action: a fresh forecast, its cost, the interval it leads to', async (t) => {
  const { gladys, meteoblue } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const ack = await gladys.fake.action(ACTIONS.TEST_API_KEY);
  assert.equal(ack.success, true);
  assert.equal(meteoblue.forecasts(), 2, 'forced, even with a fresh cache');
  assert.match(
    ack.data.message.en,
    /^Key OK for "Maison": 13°C, Partly cloudy\. This call: 8,000 credits\. Key year: 16,000 of 10,000,000 used, a refresh about every 7 h/,
  );
  for (const text of Object.values(ack.data.message)) {
    assert.ok(text.length <= 200, text);
  }
});

test('shutdown stops the watcher', async () => {
  const { gladys, app } = await startApp();
  assert.equal(app.watcher.running(), true);
  await gladys.fake.shutdown();
  assert.equal(app.watcher.running(), false);
});
