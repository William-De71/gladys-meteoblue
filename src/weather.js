// -----------------------------------------------------------------------------
// The forecast of a place -> the Gladys pivot weather format (contract B.18).
//
// One meteoblue forecast feeds the three parts of the payload:
//   - the current fields come from the hour that holds the present moment
//     (the Basic package is corrected with nearby stations, radar and
//     satellite; the "current" package of meteoblue is not in the free
//     trial, and would cost credits again);
//   - `hours`: the next 24 hours, the running one first;
//   - `days`: the 7 days meteoblue forecasts (Gladys keeps 8).
// Sunrise and sunset are computed (sun.js): the Sun & Moon package is not in
// the free trial either. meteoblue publishes no official alert in this
// product: the payload has no `alerts`, the core's weather-alert trigger
// stays silent with this provider (the rain and frost triggers of the
// integration are forecasts, not warnings).
// -----------------------------------------------------------------------------

import { conditionOf } from './conditions.js';
import { currentHour, upcomingHours } from './forecast.js';
import { sunTimes } from './sun.js';
import { localDate, localNoon } from './time.js';
import { isNumber, percent, precipitationIn, round, speedIn, temperatureIn } from './units.js';

const MAX_HOURS = 24;
const MAX_DAYS = 8;

/**
 * @description Drop the undefined and null fields of an object.
 * @param {object} object - The object.
 * @returns {object} The same object without empty fields.
 * @example
 * compact({ a: 1, b: undefined }); // -> { a: 1 }
 */
function compact(object) {
  Object.keys(object).forEach((key) => {
    if (object[key] === undefined || object[key] === null) {
      delete object[key];
    }
  });
  return object;
}

const direction = (degrees) => (isNumber(degrees) ? ((degrees % 360) + 360) % 360 : undefined);
const integer = (value) => (isNumber(value) ? Math.round(value) : undefined);

/**
 * @description Build one pivot hour.
 * @param {object} hour - A parsed hour (forecast.js).
 * @param {string} units - 'metric' or 'us'.
 * @returns {object} The pivot hour.
 * @example
 * buildHour(hour, 'metric');
 */
function buildHour(hour, units) {
  return compact({
    datetime: new Date(hour.instant).toISOString(),
    temperature: temperatureIn(hour.temperature, units),
    weather: conditionOf(hour.pictocode, 'hourly'),
    is_day: typeof hour.isDay === 'boolean' ? hour.isDay : undefined,
    apparent_temperature: temperatureIn(hour.feelsLike, units),
    humidity: percent(hour.humidity),
    pressure: isNumber(hour.pressure) ? round(hour.pressure) : undefined,
    wind_speed: speedIn(hour.windSpeed, units),
    wind_direction: direction(hour.windDirection),
    precipitation: precipitationIn(hour.precipitation, units),
    precipitation_probability: percent(hour.probability),
    uv_index: integer(hour.uvIndex),
  });
}

/**
 * @description Build one pivot day.
 * @param {object} day - A parsed day (forecast.js).
 * @param {object} context - { units, timeZone, latitude, longitude }.
 * @returns {object} The pivot day.
 * @example
 * buildDay(day, { units: 'metric', timeZone: 'Europe/Paris', latitude, longitude });
 */
function buildDay(day, { units, timeZone, latitude, longitude }) {
  const sun = sunTimes(day.date, latitude, longitude);
  return compact({
    datetime: new Date(localNoon(day.date, timeZone)).toISOString(),
    temperature_max: temperatureIn(day.temperatureMax, units),
    temperature_min: temperatureIn(day.temperatureMin, units),
    weather: conditionOf(day.pictocode, 'daily'),
    humidity: percent(day.humidity),
    wind_speed: speedIn(day.windSpeedMax, units),
    wind_direction: direction(day.windDirection),
    precipitation: precipitationIn(day.precipitation, units),
    precipitation_probability: percent(day.probability),
    uv_index: integer(day.uvIndex),
    sunrise: sun ? sun.sunrise.toISOString() : undefined,
    sunset: sun ? sun.sunset.toISOString() : undefined,
  });
}

/**
 * @description Build the pivot weather payload of a place.
 * @param {object} forecast - The parsed forecast (forecast.js).
 * @param {object} options - { units, latitude, longitude, now, images }.
 * @returns {object} The pivot payload.
 * @throws {Error} When the forecast has no temperature for the present hour.
 * @example
 * buildWeather(forecast, { units: 'metric', latitude, longitude });
 */
function buildWeather(forecast, { units, latitude, longitude, now = Date.now(), images = [] }) {
  const timeZone = forecast.meta.timeZone;
  const hour = currentHour(forecast.hours, now);
  if (hour === null || !isNumber(hour.temperature)) {
    throw new Error('The meteoblue forecast has no temperature for the present hour');
  }
  const today = localDate(now, timeZone);
  const sun = sunTimes(today, latitude, longitude);
  const current = buildHour(hour, units);
  const weather = compact({
    ...current,
    datetime: new Date(now).toISOString(),
    sunrise: sun ? sun.sunrise.toISOString() : undefined,
    sunset: sun ? sun.sunset.toISOString() : undefined,
  });
  // The pivot current fields have no amount nor chance of rain.
  delete weather.precipitation;
  delete weather.precipitation_probability;
  const hours = upcomingHours(forecast.hours, now)
    .slice(0, MAX_HOURS)
    .map((entry) => buildHour(entry, units))
    .filter((entry) => isNumber(entry.temperature));
  if (hours.length > 0) {
    weather.hours = hours;
  }
  const days = forecast.days
    .filter((day) => day.date >= today)
    .map((day) => buildDay(day, { units, timeZone, latitude, longitude }))
    .filter((day) => isNumber(day.temperature_max) && isNumber(day.temperature_min))
    .slice(0, MAX_DAYS);
  if (days.length > 0) {
    weather.days = days;
  }
  if (images.length > 0) {
    weather.images = images;
  }
  return weather;
}

export { MAX_HOURS, MAX_DAYS, compact, buildHour, buildDay, buildWeather };
