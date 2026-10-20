// The pure parts: local times, pictocodes, the parser, the pivot payload,
// the forecast watcher's evaluation, the scene action outputs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEATHER_CONDITIONS } from '@gladysassistant/integration-sdk';

import { readTime, zonedInstant, localNoon, formatDate } from '../src/time.js';
import {
  DAILY,
  HOURLY,
  conditionOf,
  describe,
  iconKey,
  iconUrlFromKey,
} from '../src/conditions.js';
import { parseForecast, currentHour, upcomingHours, isWetHour } from '../src/forecast.js';
import { buildWeather } from '../src/weather.js';
import { evaluate, kindOf } from '../src/watcher.js';
import {
  buildForecastOutputs,
  buildCurrentOutputs,
  buildRainOutputs,
} from '../src/scene-actions.js';
import {
  toCelsius,
  toMetersPerSecond,
  toMillimeters,
  speedIn,
  displaySpeed,
} from '../src/units.js';
import { readDate, readNumber, ANNUAL_CREDITS } from '../src/config.js';
import { NOW, LATITUDE, LONGITUDE, TIME_ZONE, HOUR, forecastAnswer } from './helpers/fixtures.js';

const forecast = () => parseForecast(forecastAnswer(), { timeZone: TIME_ZONE });
const iso = (instant) => new Date(instant).toISOString();

test('local wall-clock times become instants with the DST rules of the zone', () => {
  assert.equal(iso(zonedInstant(2026, 10, 20, 14, 0, 'Europe/Paris')), '2026-10-20T12:00:00.000Z');
  assert.equal(iso(zonedInstant(2026, 1, 20, 14, 0, 'Europe/Paris')), '2026-01-20T13:00:00.000Z');
  // Autumn: 02:00 happens twice, the first one is taken.
  assert.equal(iso(zonedInstant(2026, 10, 25, 2, 0, 'Europe/Paris')), '2026-10-25T00:00:00.000Z');
  // Spring: 02:30 does not exist, read as 03:30.
  assert.equal(iso(zonedInstant(2026, 3, 29, 2, 30, 'Europe/Paris')), '2026-03-29T01:30:00.000Z');
  assert.equal(iso(localNoon('2026-10-20', 'America/New_York')), '2026-10-20T16:00:00.000Z');
  // Every format of the reference.
  const context = { timeZone: 'Europe/Paris' };
  assert.equal(iso(readTime('2026-10-20 14:00', context).instant), '2026-10-20T12:00:00.000Z');
  assert.equal(iso(readTime('20261020 14:00', context).instant), '2026-10-20T12:00:00.000Z');
  assert.equal(readTime('2026-10-20', context).date, '2026-10-20');
  assert.equal(
    iso(readTime('2026-10-20T14:00:00+02:00', context).instant),
    '2026-10-20T12:00:00.000Z',
  );
  assert.equal(
    iso(readTime(Date.parse('2026-10-20T12:00:00Z') / 1000, context).instant),
    '2026-10-20T12:00:00.000Z',
  );
  // A zone the runtime ignores: the offset of the answer.
  assert.equal(
    iso(readTime('2026-10-20 14:00', { timeZone: 'Mars/Olympus', utcOffsetHours: 5.5 }).instant),
    '2026-10-20T08:30:00.000Z',
  );
  assert.equal(readTime('soon', context), null);
  assert.equal(formatDate('2027-03-02', 'fr'), '2 mars 2027');
});

test('every pictocode of the reference has a pivot condition, 4 descriptions and an icon', () => {
  const pivot = new Set(Object.values(WEATHER_CONDITIONS));
  for (let code = 1; code <= 35; code += 1) {
    assert.ok(HOURLY[code], `hourly ${code}`);
    assert.ok(pivot.has(conditionOf(code, 'hourly')), `hourly ${code}`);
    for (const language of ['en', 'fr', 'de', 'es']) {
      assert.ok(describe(code, 'hourly', language), `hourly ${code} ${language}`);
    }
    const day = iconKey(code, 'hourly', true);
    const night = iconKey(code, 'hourly', false);
    assert.equal(
      iconUrlFromKey(day),
      `https://static.meteoblue.com/assets/images/picto/${String(code).padStart(2, '0')}_day.png`,
    );
    assert.match(iconUrlFromKey(night), /_night\.png$/);
  }
  const dailyCodes = [...Array(17).keys()].map((i) => i + 1).concat([20, 21, 22, 23, 24, 25]);
  assert.deepEqual(Object.keys(DAILY).map(Number), dailyCodes);
  for (const code of dailyCodes) {
    assert.ok(pivot.has(conditionOf(code, 'daily')), `daily ${code}`);
    const key = iconKey(code, 'daily');
    assert.ok(iconUrlFromKey(key), `daily ${code}: ${key}`);
  }
  // The daily PNG files stop at 19: 20-25 borrow an hourly day icon.
  assert.equal(iconKey(3, 'daily'), 'mb-d-03');
  assert.equal(
    iconUrlFromKey('mb-d-03'),
    'https://static.meteoblue.com/assets/images/picto/03_iday.png',
  );
  assert.equal(iconKey(24, 'daily'), 'mb-h-30-d');
  assert.equal(conditionOf(23, 'hourly'), 'rain');
  assert.equal(conditionOf(35, 'hourly'), 'sleet');
  assert.equal(conditionOf(99, 'hourly'), 'unknown');
  assert.equal(describe(4, 'daily', 'fr'), 'Couvert');
  // Nothing else can be fetched (no SSRF).
  for (const key of [
    'mb-h-36-d',
    'mb-d-20',
    'mb-d-18',
    'mb-h-07-x',
    '../etc',
    'mb-h-7-d',
    'https://evil',
  ]) {
    assert.equal(iconUrlFromKey(key), null, key);
  }
});

test('the parser reads the columns, keeps the hourly axis increasing over the DST change', () => {
  const parsed = forecast();
  assert.equal(parsed.hours.length, 169, '7 days + the repeated hour');
  assert.equal(parsed.days.length, 7);
  const steps = new Set(
    parsed.hours.slice(1).map((hour, i) => hour.instant - parsed.hours[i].instant),
  );
  assert.deepEqual([...steps], [HOUR]);
  const first = parsed.hours[0];
  assert.equal(iso(first.instant), '2026-10-19T22:00:00.000Z');
  assert.equal(first.date, '2026-10-20');
  assert.equal(first.isDay, false);
  assert.equal(parsed.days[3].temperatureMin, -3);
  assert.equal(parsed.days[0].predictabilityClass, 5);
  assert.equal(parsed.meta.timeZone, TIME_ZONE);
  assert.equal(iso(parsed.meta.modelRun), '2026-10-20T06:00:00.000Z');
});

test('the units of the answer are read, never assumed', () => {
  assert.equal(Math.round(toCelsius(68, 'F')), 20);
  assert.equal(Math.round(toCelsius(293.15, 'K')), 20);
  assert.equal(toMetersPerSecond(36, 'kmh'), 10);
  assert.equal(toMetersPerSecond(3, 'bft'), undefined, 'Beaufort is not a speed');
  assert.equal(toMillimeters(1, 'inch'), 25.4);
  const answer = forecastAnswer();
  answer.units.temperature = 'F';
  answer.data_1h.temperature = answer.data_1h.temperature.map((c) => (c * 9) / 5 + 32);
  answer.units.windspeed = 'kmh';
  answer.data_1h.windspeed = answer.data_1h.windspeed.map((v) => v * 3.6);
  const hour = currentHour(parseForecast(answer, { timeZone: TIME_ZONE }).hours, NOW);
  const reference = currentHour(forecast().hours, NOW);
  assert.ok(Math.abs(hour.temperature - reference.temperature) < 1e-9);
  assert.ok(Math.abs(hour.windSpeed - reference.windSpeed) < 1e-9);
  assert.equal(speedIn(10, 'us'), 22.4);
  assert.equal(displaySpeed(10, 'metric'), 36);
});

test('pivot payload: the present hour, 24 hours, the days from today, no alert', () => {
  const weather = buildWeather(forecast(), {
    units: 'metric',
    latitude: LATITUDE,
    longitude: LONGITUDE,
    now: NOW,
  });
  assert.equal(weather.datetime, iso(NOW));
  assert.equal(weather.temperature, 13.3);
  assert.equal(weather.weather, 'partly-cloudy');
  assert.equal(weather.is_day, true);
  assert.equal(weather.precipitation, undefined, 'not a pivot current field');
  assert.equal(weather.hours.length, 24);
  assert.equal(weather.hours[0].datetime, '2026-10-20T08:00:00.000Z');
  assert.equal(weather.hours[5].weather, 'drizzle');
  assert.equal(weather.days.length, 7);
  assert.equal(weather.days[0].datetime, '2026-10-20T10:00:00.000Z', 'noon local');
  assert.equal(weather.days[0].weather, 'rain');
  assert.equal(weather.days[0].precipitation, 4.7);
  assert.equal(weather.days[3].temperature_min, -3);
  assert.match(weather.sunrise, /^2026-10-20T06:1/);
  assert.equal(weather.alerts, undefined);
  assert.equal(weather.images, undefined);
  const us = buildWeather(forecast(), {
    units: 'us',
    latitude: LATITUDE,
    longitude: LONGITUDE,
    now: NOW,
  });
  assert.equal(us.temperature, 55.9);
  assert.equal(us.days[0].precipitation, 0.19);
  // A forecast that no longer reaches the present hour is refused.
  assert.throws(() =>
    buildWeather(forecast(), {
      units: 'metric',
      latitude: 0,
      longitude: 0,
      now: NOW + 9 * 24 * HOUR,
    }),
  );
});

test('the watcher evaluation: rain within 3 hours, frost within 12 hours, the kind of a spell', () => {
  const parsed = forecast();
  assert.equal(evaluate(parsed, NOW).rain, null, 'rain from 15:00, now 10:00');
  const soon = evaluate(parsed, Date.parse('2026-10-20T10:30:00Z')).rain;
  assert.equal(iso(soon.first.instant), '2026-10-20T13:00:00.000Z');
  assert.equal(soon.kind, 'rain');
  assert.equal(evaluate(parsed, NOW).frost, null);
  const frost = evaluate(parsed, Date.parse('2026-10-22T18:00:00Z')).frost;
  assert.equal(frost.coldest.temperature, -3);
  assert.equal(kindOf([{ snowFraction: 1 }, { snowFraction: 0.8 }]), 'snow');
  assert.equal(kindOf([{ snowFraction: 0.4 }]), 'mixed');
  assert.equal(isWetHour({ precipitation: 0.1 }), false);
  assert.equal(isWetHour({ precipitation: 1, probability: 20 }), false, 'unlikely');
  assert.equal(isWetHour({ precipitation: 1 }), true, 'no probability given');
  assert.equal(upcomingHours(parsed.hours, NOW)[0].instant, NOW);
});

test('scene action outputs: forecast of a day, current, rain', () => {
  const parsed = forecast();
  const tomorrow = buildForecastOutputs({
    forecast: parsed,
    house: 'Maison',
    language: 'fr',
    units: 'metric',
    day: '1',
    now: NOW,
  });
  assert.equal(tomorrow.date, '2026-10-21');
  assert.equal(tomorrow.temperature_max, 16);
  assert.equal(tomorrow.predictability, 76);
  assert.match(tomorrow.summary, /^Météo demain à Maison : partiellement nuageux, de 6°C à 16°C/);
  const current = buildCurrentOutputs({
    forecast: parsed,
    house: 'Home',
    language: 'en',
    units: 'metric',
    now: NOW,
  });
  assert.equal(current.temperature, 13.3);
  assert.equal(current.wind_speed, 15);
  assert.match(current.summary, /^In Home: 13°C, partly cloudy, feels like 12°C/);
  const rain = buildRainOutputs({
    forecast: parsed,
    house: 'Zuhause',
    language: 'de',
    units: 'metric',
    fields: { hours: '6' },
    now: NOW,
  });
  assert.equal(rain.rain_expected, true);
  assert.equal(rain.first_time, '15:00');
  assert.equal(rain.total_precipitation, 1.6);
  assert.match(rain.summary, /^Regen in Zuhause ab 15:00 erwartet/);
  const dry = buildRainOutputs({
    forecast: parsed,
    house: 'Casa',
    language: 'es',
    units: 'metric',
    fields: { hours: '3' },
    now: NOW,
  });
  assert.equal(dry.rain_expected, false);
  assert.match(dry.summary, /^No se prevé lluvia en Casa/);
  assert.throws(() =>
    buildForecastOutputs({
      forecast: parsed,
      house: 'x',
      language: 'en',
      units: 'metric',
      day: '6',
      now: NOW + 3 * 24 * HOUR,
    }),
  );
});

test('configuration fields: dates and numbers as people type them', () => {
  assert.equal(readDate('2026-10-20'), '2026-10-20');
  assert.equal(readDate('20/10/2026'), '2026-10-20');
  assert.equal(readDate('20.10.2026'), '2026-10-20');
  assert.equal(readDate('2026-02-30'), null);
  assert.equal(readDate(''), null);
  assert.equal(readNumber('10 000 000', ANNUAL_CREDITS), 10000000);
  assert.equal(readNumber('10.000.000', ANNUAL_CREDITS), 10000000);
  assert.equal(readNumber('', ANNUAL_CREDITS), 10000000);
  assert.equal(readNumber(5, ANNUAL_CREDITS), 100000, 'bounded');
});
