// -----------------------------------------------------------------------------
// Non-regression of everything users store: every key of the manifest a
// saved configuration, a scene or a widget refers to, the option values they
// may have picked, the variables and outputs a scene may read, and the image
// keys the core caches.
//
// test/fixtures/discovery.baseline.json was generated from version 0.1.0 (the
// first release). A failure here means existing users would lose a setting,
// a scene filter or a widget setting: never update the baseline without a
// documented migration. (No device: a weather integration publishes none.)
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { iconKey, iconUrlFromKey } from '../src/conditions.js';
import { parseForecast } from '../src/forecast.js';
import { createWatcher } from '../src/watcher.js';
import { createMeteograms } from '../src/meteograms.js';
import {
  buildForecastOutputs,
  buildCurrentOutputs,
  buildRainOutputs,
} from '../src/scene-actions.js';
import { forecastAnswer, NOW, TIME_ZONE, LATITUDE, LONGITUDE } from './helpers/fixtures.js';
import { silent } from './helpers/fakes.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const baseline = read('./fixtures/discovery.baseline.json');
const manifest = read('../gladys-assistant-integration.json');

const byKey = (list) => new Map((list ?? []).map((entry) => [entry.key, entry]));
const optionValues = (field) => (field?.options ?? []).map((option) => option.value);

/**
 * @description Check that every stored key keeps its type.
 * @param {object[]} current - The current fields.
 * @param {object[]} stored - The baseline `[{ key, type }]`.
 * @param {string} where - The entry, for the messages.
 */
function assertFieldsKept(current, stored, where) {
  const now = byKey(current);
  for (const { key, type } of stored) {
    assert.equal(now.get(key)?.type, type, `${where}.${key}`);
  }
}

/**
 * @description Check that every stored option value is still offered.
 * @param {object[]} fields - The current fields of a manifest entry.
 * @param {object} options - The baseline `{ fieldKey: [values] }`.
 * @param {string} where - The entry, for the messages.
 */
function assertOptionsKept(fields, options, where) {
  const current = byKey(fields);
  for (const [key, stored] of Object.entries(options ?? {})) {
    const offered = optionValues(current.get(key));
    for (const value of stored) {
      assert.ok(offered.includes(value), `${where}.${key}: ${value}`);
    }
  }
}

test('stays a cloud weather integration', () => {
  assert.equal(manifest.type, baseline.manifest.type);
  assert.deepEqual(manifest.transports, baseline.manifest.transports);
});

test('no configuration key or action disappears or changes type', () => {
  assertFieldsKept(manifest.config_schema, baseline.manifest.config_schema, 'config_schema');
  const actions = (manifest.actions ?? []).map((action) => action.key);
  baseline.manifest.actions.forEach((key) => assert.ok(actions.includes(key), key));
});

test('scene triggers keep their keys, filters, filter values and variables', () => {
  const current = byKey(manifest.scene_triggers);
  for (const trigger of baseline.manifest.scene_triggers) {
    const now = current.get(trigger.key);
    assert.ok(now, `scene_triggers.${trigger.key}`);
    assertFieldsKept(now.fields, trigger.fields, `${trigger.key}.fields`);
    assertOptionsKept(now.fields, trigger.options, trigger.key);
    assertFieldsKept(now.variables, trigger.variables, `${trigger.key}.variables`);
  }
});

test('scene actions keep their keys, fields, field values and outputs', () => {
  const current = byKey(manifest.scene_actions);
  for (const action of baseline.manifest.scene_actions) {
    const now = current.get(action.key);
    assert.ok(now, `scene_actions.${action.key}`);
    assertFieldsKept(now.fields, action.fields, `${action.key}.fields`);
    assertOptionsKept(now.fields, action.options, action.key);
    assertFieldsKept(now.outputs, action.outputs, `${action.key}.outputs`);
  }
});

test('widgets keep their keys, settings, setting types and option values', () => {
  const current = byKey(manifest.widgets);
  for (const widget of baseline.manifest.widgets) {
    const now = current.get(widget.key);
    assert.ok(now, `widgets.${widget.key}`);
    assertFieldsKept(now.settings, widget.settings, `${widget.key}.settings`);
    assertOptionsKept(now.settings, widget.options, widget.key);
  }
});

test('the code still fills every scene variable and action output of 0.1.0', async () => {
  const forecast = parseForecast(forecastAnswer(), { timeZone: TIME_ZONE });
  const house = { name: 'Home', selector: 'home', latitude: LATITUDE, longitude: LONGITUDE };
  const events = {};
  const clock = { now: NOW };
  let levels = [];
  const watcher = createWatcher({
    houses: { refresh: async () => [house], list: () => [house] },
    loadForecast: async () => forecast,
    credits: {
      newLevels: () => levels,
      used: () => 7500000,
      annual: () => 10000000,
      remaining: () => 2500000,
      periodEnd: () => '2027-10-20',
    },
    publish: async (key, data) => {
      events[`${key}_data`] = data;
    },
    getPreferences: () => ({ language: 'en', units: 'metric' }),
    logger: silent,
    now: () => clock.now,
  });
  await watcher.round();
  clock.now = Date.parse('2026-10-20T10:30:00Z');
  await watcher.round();
  clock.now = Date.parse('2026-10-22T18:00:00Z');
  levels = [75];
  await watcher.round();
  const context = { forecast, house: 'Home', language: 'en', units: 'metric', now: NOW };
  const produced = {
    ...events,
    get_forecast_outputs: buildForecastOutputs({ ...context, day: '1' }),
    get_current_outputs: buildCurrentOutputs(context),
    get_rain_outputs: buildRainOutputs({ ...context, fields: { hours: '12' } }),
  };
  for (const [name, keys] of Object.entries(baseline.code)) {
    assert.ok(produced[name], name);
    for (const key of keys) {
      assert.ok(key in produced[name], `${name}.${key}`);
    }
  }
});

test('the image keys cached by the core are still produced and understood', () => {
  for (const [key, { set, code, isDay, url }] of Object.entries(baseline.image_keys)) {
    assert.equal(iconKey(code, set, isDay), key);
    assert.equal(iconUrlFromKey(key), url);
  }
  const meteograms = createMeteograms({
    api: {},
    getConfig: () => ({ meteogramEnabled: true, meteogramHours: 24 }),
    getPreferences: () => ({ language: 'en', units: 'metric' }),
    getTimeZone: () => TIME_ZONE,
  });
  const id = meteograms.register({ latitude: LATITUDE, longitude: LONGITUDE });
  assert.match(meteograms.weatherKey(id), new RegExp(baseline.meteogram_keys.weather));
  assert.match(meteograms.widgetKey(id), new RegExp(baseline.meteogram_keys.widget));
  assert.equal(meteograms.idFromWeatherKey(meteograms.weatherKey(id)), id);
  assert.equal(meteograms.idFromWidgetKey(meteograms.widgetKey(id)), id);
});
