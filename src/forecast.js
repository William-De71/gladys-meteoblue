// -----------------------------------------------------------------------------
// A meteoblue `basic-1h_basic-day` answer -> the forecast of a place, in the
// internal units (°C, m/s, mm, hPa, %), with instants.
//
// The answer is column-oriented: `data_1h` and `data_day` hold one array per
// variable, aligned on their `time` axis (Forecast API reference, Basic
// package). The variables read here:
//   data_1h:  temperature, felttemperature, relativehumidity, sealevelpressure,
//             windspeed, winddirection, precipitation, precipitation_probability,
//             convective_precipitation, snowfraction, pictocode (hourly set),
//             isdaylight, uvindex
//   data_day: temperature_min/max/mean, felttemperature_min/max,
//             precipitation, precipitation_probability, precipitation_hours,
//             snowfraction, pictocode (daily set), uvindex, windspeed_min/max/
//             mean, winddirection, relativehumidity_mean, sealevelpressure_mean,
//             predictability (%), predictability_class (1-5)
// Any of them may be missing or null: the forecast simply has less detail.
// An hourly precipitation value is the amount of one hour at its time stamp;
// the integration only sums them over windows of several hours, where which
// side of the hour it covers does not matter.
// -----------------------------------------------------------------------------

import { readTime } from './time.js';
import { isNumber, toCelsius, toMetersPerSecond, toMillimeters } from './units.js';

const HOUR = 3600 * 1000;

const at = (column, index) => (Array.isArray(column) ? column[index] : undefined);
const numberOr = (value) => (isNumber(value) ? value : undefined);
const integerOr = (value) => (Number.isInteger(value) ? value : undefined);

/**
 * @description Parse a forecast answer.
 * @param {object} answer - The JSON answer of /packages/basic-1h_basic-day.
 * @param {object} [options] - { timeZone }: the zone the request named.
 * @returns {{ meta: object, hours: Array<object>, days: Array<object> }} The
 * forecast, hours and days in time order.
 * @example
 * const { hours, days } = parseForecast(answer, { timeZone: 'Europe/Paris' });
 */
function parseForecast(answer, { timeZone = null } = {}) {
  const metadata = answer?.metadata ?? {};
  const units = answer?.units ?? {};
  const context = {
    timeZone,
    utcOffsetHours: isNumber(metadata.utc_timeoffset) ? metadata.utc_timeoffset : 0,
  };
  const temperature = (value) => toCelsius(value, units.temperature ?? 'C');
  const speed = (value) => toMetersPerSecond(value, units.windspeed ?? 'ms-1');
  const amount = (value) => toMillimeters(value, units.precipitation ?? 'mm');

  const hourly = answer?.data_1h ?? {};
  const hours = [];
  (Array.isArray(hourly.time) ? hourly.time : []).forEach((raw, index) => {
    const time = readTime(raw, context);
    if (time === null) {
      return;
    }
    // A repeated wall-clock hour (autumn DST change) must not go back in time.
    const previous = hours.at(-1);
    const instant =
      previous && time.instant <= previous.instant ? previous.instant + HOUR : time.instant;
    const daylight = at(hourly.isdaylight, index);
    hours.push({
      instant,
      date: time.date,
      temperature: temperature(at(hourly.temperature, index)),
      feelsLike: temperature(at(hourly.felttemperature, index)),
      humidity: numberOr(at(hourly.relativehumidity, index)),
      pressure: numberOr(at(hourly.sealevelpressure, index)),
      windSpeed: speed(at(hourly.windspeed, index)),
      windDirection: numberOr(at(hourly.winddirection, index)),
      precipitation: amount(at(hourly.precipitation, index)),
      convective: amount(at(hourly.convective_precipitation, index)),
      probability: numberOr(at(hourly.precipitation_probability, index)),
      snowFraction: numberOr(at(hourly.snowfraction, index)),
      pictocode: integerOr(at(hourly.pictocode, index)),
      isDay: daylight === 1 ? true : daylight === 0 ? false : undefined,
      uvIndex: numberOr(at(hourly.uvindex, index)),
    });
  });

  const daily = answer?.data_day ?? {};
  const days = [];
  (Array.isArray(daily.time) ? daily.time : []).forEach((raw, index) => {
    const time = readTime(raw, context);
    if (time === null) {
      return;
    }
    days.push({
      date: time.date,
      temperatureMin: temperature(at(daily.temperature_min, index)),
      temperatureMax: temperature(at(daily.temperature_max, index)),
      temperatureMean: temperature(at(daily.temperature_mean, index)),
      feelsLikeMin: temperature(at(daily.felttemperature_min, index)),
      feelsLikeMax: temperature(at(daily.felttemperature_max, index)),
      precipitation: amount(at(daily.precipitation, index)),
      probability: numberOr(at(daily.precipitation_probability, index)),
      precipitationHours: numberOr(at(daily.precipitation_hours, index)),
      snowFraction: numberOr(at(daily.snowfraction, index)),
      pictocode: integerOr(at(daily.pictocode, index)),
      uvIndex: numberOr(at(daily.uvindex, index)),
      windSpeedMin: speed(at(daily.windspeed_min, index)),
      windSpeedMax: speed(at(daily.windspeed_max, index)),
      windSpeedMean: speed(at(daily.windspeed_mean, index)),
      windDirection: numberOr(at(daily.winddirection, index)),
      humidity: numberOr(at(daily.relativehumidity_mean, index)),
      pressure: numberOr(at(daily.sealevelpressure_mean, index)),
      predictability: numberOr(at(daily.predictability, index)),
      predictabilityClass: numberOr(at(daily.predictability_class, index)),
    });
  });

  const modelRun = readTime(metadata.modelrun_utc, { timeZone: 'UTC' });
  const updated = readTime(metadata.modelrun_updatetime_utc, { timeZone: 'UTC' });
  return {
    meta: {
      latitude: numberOr(metadata.latitude),
      longitude: numberOr(metadata.longitude),
      height: numberOr(metadata.height),
      timeZone,
      modelRun: modelRun ? modelRun.instant : null,
      updated: updated ? updated.instant : null,
    },
    hours,
    days,
  };
}

/**
 * @description The hour that holds an instant: the entry whose time stamp is
 * the closest one, within 90 minutes.
 * @param {Array<object>} hours - The parsed hours.
 * @param {number} instant - The instant.
 * @returns {object|null} The hour.
 * @example
 * currentHour(forecast.hours, Date.now());
 */
function currentHour(hours, instant) {
  let best = null;
  hours.forEach((hour) => {
    const distance = Math.abs(hour.instant - instant);
    if (distance <= 1.5 * HOUR && (best === null || distance < Math.abs(best.instant - instant))) {
      best = hour;
    }
  });
  return best;
}

/**
 * @description The hours still to come, the running one first.
 * @param {Array<object>} hours - The parsed hours.
 * @param {number} instant - The instant.
 * @returns {Array<object>} The hours whose time stamp is past `instant - 30 min`.
 * @example
 * upcomingHours(forecast.hours, Date.now()).slice(0, 24);
 */
function upcomingHours(hours, instant) {
  return hours.filter((hour) => hour.instant > instant - HOUR / 2);
}

/**
 * @description Whether an hour is wet: some precipitation is forecast, and
 * not ruled unlikely by its probability.
 * @param {object} hour - A parsed hour.
 * @param {object} [thresholds] - { amount (mm), probability (%) }.
 * @returns {boolean} True when wet.
 * @example
 * isWetHour({ precipitation: 0.6, probability: 70 }); // -> true
 */
function isWetHour(hour, { amount = 0.2, probability = 40 } = {}) {
  if (!isNumber(hour.precipitation) || hour.precipitation < amount) {
    return false;
  }
  return !isNumber(hour.probability) || hour.probability >= probability;
}

export { parseForecast, currentHour, upcomingHours, isWetHour };
