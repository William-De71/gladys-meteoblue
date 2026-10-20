import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

import { SCENE_TRIGGERS } from '../src/watcher.js';
import { SCENE_ACTIONS, MAX_DAY_OFFSET, RAIN_SPANS } from '../src/scene-actions.js';
import { ACTIONS } from '../src/app.js';
import { WIDGETS, HOURLY_METRICS, HOURLY_SPANS, DAILY_SPANS } from '../src/widgets.js';
import { ANNUAL_CREDITS, MIN_REFRESH_MINUTES, METEOGRAM_HOURS } from '../src/config.js';
import { COSTS, LEVELS, createCredits } from '../src/credits.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = read('../gladys-assistant-integration.json');
const pkg = read('../package.json');
const byKey = (list) => new Map(list.map((entry) => [entry.key, entry]));
const values = (field) => field.options.map((option) => option.value);
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('a weather integration, in lockstep with package.json, at 0.x until 1.0.0 is decided', () => {
  assert.equal(manifest.type, 'weather');
  assert.equal(manifest.name, 'Meteoblue');
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/william-de71/gladys-meteoblue:${pkg.version}`);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/William-De71/gladys-meteoblue/main/cover.jpg',
  );
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(pkg.name, 'gladys-meteoblue');
});

test('cloud transport only, the house coordinates as only permission, Gladys 5.2.0', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.doesNotMatch(source('../src/app.js'), /GLADYS_PREFER_LOCAL|publishTransports/);
  assert.equal(manifest.location, true, 'the forecast watcher reads the houses');
  assert.match(source('../src/app.js'), /getHouses\(\)/);
  for (const key of ['network_wake', 'containers', 'network_discovery', 'webhooks']) {
    assert.equal(manifest[key], undefined, key);
  }
  // `source: "houses"` needs 5.2.0 (store constants), the minimum declared.
  assert.equal(manifest.gladys_version, '>=5.2.0');
  const houseFields = [
    ...manifest.widgets.flatMap((widget) => widget.settings ?? []),
    ...manifest.scene_triggers.flatMap((trigger) => trigger.fields),
    ...manifest.scene_actions.flatMap((action) => action.fields),
  ].filter((field) => field.key === 'house');
  assert.ok(houseFields.length >= 8);
  houseFields.forEach((field) => {
    assert.equal(field.type, 'select');
    assert.equal(field.source, 'houses');
    assert.equal(field.default, undefined, 'no default with a source');
  });
});

test('declares exactly the scene triggers, actions and widgets the code handles', () => {
  assert.deepEqual(
    manifest.scene_triggers.map((x) => x.key).sort(),
    Object.values(SCENE_TRIGGERS).sort(),
  );
  assert.deepEqual(
    manifest.scene_actions.map((x) => x.key).sort(),
    Object.values(SCENE_ACTIONS).sort(),
  );
  assert.deepEqual(manifest.widgets.map((x) => x.key).sort(), Object.values(WIDGETS).sort());
  assert.deepEqual(
    manifest.actions.map((x) => x.key),
    Object.values(ACTIONS),
  );
  const app = source('../src/app.js');
  for (const key of Object.keys(WIDGETS)) {
    assert.match(app, new RegExp(`onWidgetGet\\(WIDGETS\\.${key}`), key);
  }
  for (const key of Object.keys(SCENE_ACTIONS)) {
    assert.match(app, new RegExp(`onSceneAction\\(SCENE_ACTIONS\\.${key}`), key);
  }
  for (const key of Object.keys(ACTIONS)) {
    assert.match(app, new RegExp(`onAction\\(ACTIONS\\.${key}`), key);
  }
  for (const handler of ['onWeatherGet', 'onWeatherGetImage', 'onWidgetGetImage']) {
    assert.match(app, new RegExp(`${handler}\\(`), handler);
  }
});

test('mirrors the bounds and values of the code', () => {
  const config = byKey(manifest.config_schema);
  for (const [key, bounds] of [
    ['annual_credits', ANNUAL_CREDITS],
    ['min_refresh_minutes', MIN_REFRESH_MINUTES],
    ['meteogram_hours', METEOGRAM_HOURS],
  ]) {
    for (const bound of ['min', 'max', 'default']) {
      assert.equal(config.get(key)[bound], bounds[bound], `${key}.${bound}`);
    }
  }
  assert.equal(config.get('api_key').type, 'secret');
  assert.equal(config.get('api_key').required, true);
  assert.equal(config.get('meteogram_enabled').default, false, 'the meteogram costs extra');
  assert.equal(config.get('key_start_date').type, 'string');
  const triggers = byKey(manifest.scene_triggers);
  assert.deepEqual(values(byKey(triggers.get('rain_expected').fields).get('kind')), [
    'rain',
    'snow',
    'mixed',
  ]);
  assert.deepEqual(
    values(byKey(triggers.get('credits_level').fields).get('level')),
    LEVELS.map(String),
  );
  const actions = byKey(manifest.scene_actions);
  const day = byKey(actions.get('get_forecast').fields).get('day');
  assert.equal(values(day).length, MAX_DAY_OFFSET + 1);
  assert.deepEqual(values(byKey(actions.get('get_rain').fields).get('hours')), RAIN_SPANS);
  const widgets = byKey(manifest.widgets);
  const hourly = byKey(widgets.get('hourly').settings);
  assert.deepEqual(values(hourly.get('metric')), HOURLY_METRICS);
  assert.deepEqual(values(hourly.get('hours')), HOURLY_SPANS);
  assert.deepEqual(values(byKey(widgets.get('daily').settings).get('days')), DAILY_SPANS);
});

test('the figures of the form match the credit plan of the code', () => {
  assert.deepEqual(COSTS, { forecast: 8000, meteogram: 16000 });
  const config = byKey(manifest.config_schema);
  assert.match(config.get('credits').description.en, /8,000 credits/);
  assert.match(config.get('credits').description.en, /about 3 refreshes a day/);
  assert.match(config.get('meteogram').description.en, /16,000 credits/);
  assert.match(config.get('meteogram_hours').description.en, /5\.8 million/);
  assert.match(manifest.actions[0].description.en, /8,000 credits/);
  // The free year, one house, from its first day: 3 refreshes a day, a
  // little more than 7 hours apart.
  const settings = { annualCredits: 10000000, keyStartDate: '2026-10-20', minRefreshMinutes: 60 };
  const credits = createCredits({
    path: null,
    getConfig: () => settings,
    now: () => Date.parse('2026-10-20T08:00:00Z'),
  });
  const plan = credits.plan({ locations: 1 });
  assert.ok(plan.refreshesPerDay > 3 && plan.refreshesPerDay < 3.5, String(plan.refreshesPerDay));
  // 24 h meteograms: 16,000 × 365 = 5.84 million.
  assert.equal(Math.round((16000 * 365) / 1e5) / 10, 5.8);
});

test('limits of the store: counts, timeouts, sizes, no secret in widget settings', () => {
  assert.ok(manifest.widgets.length >= 1 && manifest.widgets.length <= 5);
  assert.ok(manifest.scene_triggers.length <= 20);
  assert.ok(manifest.scene_actions.length <= 20);
  for (const trigger of manifest.scene_triggers) {
    assert.ok((trigger.fields ?? []).length <= 10 && trigger.variables.length <= 20, trigger.key);
  }
  for (const action of [...manifest.scene_actions, ...manifest.actions]) {
    assert.ok(action.timeout_seconds >= 5 && action.timeout_seconds <= 120, action.key);
    assert.ok((action.outputs ?? []).length <= 20, action.key);
    assert.ok((action.fields ?? []).length <= 10, action.key);
  }
  for (const widget of manifest.widgets) {
    assert.ok((widget.settings ?? []).length <= 10);
    for (const setting of widget.settings ?? []) {
      assert.ok(!['secret', 'oauth2', 'account_link'].includes(setting.type));
    }
  }
  const size = statSync(new URL('../gladys-assistant-integration.json', import.meta.url)).size;
  assert.ok(size < 100 * 1024, `${size} bytes`);
  const cover = readFileSync(new URL('../cover.jpg', import.meta.url));
  assert.ok(cover.length < 150 * 1024, `cover.jpg: ${cover.length} bytes`);
  assert.equal(cover.readUInt16BE(0), 0xffd8, 'cover.jpg is a JPEG');
});

test('no host other than the documented ones in the code', () => {
  const hosts = new Set();
  for (const file of [
    'meteoblue-api.js',
    'conditions.js',
    'app.js',
    'widgets.js',
    'meteograms.js',
    'forecast-store.js',
    'credits.js',
  ]) {
    for (const [, host] of source(`../src/${file}`).matchAll(/https:\/\/([a-z0-9.-]+)/g)) {
      hosts.add(host);
    }
  }
  assert.deepEqual([...hosts].sort(), [
    // the documentation, in comments and in the attribution link
    'docs.meteoblue.com',
    'my.meteoblue.com',
    'static.meteoblue.com',
    // the attribution link to the page of the place
    'www.meteoblue.com',
  ]);
});
