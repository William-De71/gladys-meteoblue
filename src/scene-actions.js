// -----------------------------------------------------------------------------
// Scene actions of the Meteoblue integration.
//
// Read-only cards of the scene editor, each targeting a house (the first
// located one when the "House" field is empty), each returning scalars for the
// following actions of the scene — a `summary` sentence ready to send in a
// message among them:
//   - get_forecast: the forecast of a day (today to 6 days ahead), with the
//                   predictability meteoblue gives each day;
//   - get_current:  the conditions of the present hour;
//   - get_rain:     is rain (or snow) expected in the next hours, from when,
//                   how much.
// They read the cached forecast: a scene that runs every morning costs no
// credit while the forecast is fresh enough for the budget plan.
// Wind speeds are given as displayed (km/h or mph), not in m/s.
// -----------------------------------------------------------------------------

import { describe } from './conditions.js';
import { currentHour, isWetHour, upcomingHours } from './forecast.js';
import { kindOf } from './watcher.js';
import { addDays, formatTime, localDate, weekdayName } from './time.js';
import {
  displaySpeed,
  isNumber,
  percent,
  precipitationIn,
  temperatureIn,
  unitLabels,
} from './units.js';

const SCENE_ACTIONS = {
  GET_FORECAST: 'get_forecast',
  GET_CURRENT: 'get_current',
  GET_RAIN: 'get_rain',
};

const MAX_DAY_OFFSET = 6;
const RAIN_SPANS = ['3', '6', '12', '24'];
const HOUR = 3600 * 1000;

const KIND_WORDS = {
  en: { rain: 'rain', snow: 'snow', mixed: 'rain and snow' },
  fr: { rain: 'pluie', snow: 'neige', mixed: 'neige fondue' },
  de: { rain: 'Regen', snow: 'Schnee', mixed: 'Schneeregen' },
  es: { rain: 'lluvia', snow: 'nieve', mixed: 'aguanieve' },
};

// The `summary` sentences, per language (English for any other).
const SENTENCES = {
  en: {
    today: 'today',
    tomorrow: 'tomorrow',
    forecast: ({ name, house, sky, max, min }) =>
      `Weather ${name} in ${house}: ${sky}, ${min} to ${max}`,
    rain: ({ chance, amount }) =>
      `${chance}% chance of precipitation${amount ? ` (${amount})` : ''}`,
    predictability: (value) => `predictability ${value}%`,
    current: ({ house, temperature, sky }) => `In ${house}: ${temperature}, ${sky}`,
    feels: (value) => `feels like ${value}`,
    humidity: (value) => `humidity ${value}%`,
    wind: (value) => `wind ${value}`,
    rainYes: ({ house, kind, time, amount, hours }) =>
      `${capitalize(kind)} expected in ${house} from ${time} (${amount}) in the next ${hours} hours.`,
    rainNo: ({ house, hours }) => `No rain expected in ${house} in the next ${hours} hours.`,
  },
  fr: {
    today: "aujourd'hui",
    tomorrow: 'demain',
    forecast: ({ name, house, sky, max, min }) =>
      `Météo ${name} à ${house} : ${sky}, de ${min} à ${max}`,
    rain: ({ chance, amount }) =>
      `${chance} % de risque de précipitations${amount ? ` (${amount})` : ''}`,
    predictability: (value) => `fiabilité ${value} %`,
    current: ({ house, temperature, sky }) => `À ${house} : ${temperature}, ${sky}`,
    feels: (value) => `ressenti ${value}`,
    humidity: (value) => `humidité ${value} %`,
    wind: (value) => `vent ${value}`,
    rainYes: ({ house, kind, time, amount, hours }) =>
      `${capitalize(kind)} attendue à ${house} à partir de ${time} (${amount}) dans les ${hours} prochaines heures.`,
    rainNo: ({ house, hours }) =>
      `Pas de pluie attendue à ${house} dans les ${hours} prochaines heures.`,
  },
  de: {
    today: 'heute',
    tomorrow: 'morgen',
    forecast: ({ name, house, sky, max, min }) =>
      `Wetter ${name} in ${house}: ${sky}, ${min} bis ${max}`,
    rain: ({ chance, amount }) => `Niederschlagsrisiko ${chance} %${amount ? ` (${amount})` : ''}`,
    predictability: (value) => `Vorhersagbarkeit ${value} %`,
    current: ({ house, temperature, sky }) => `In ${house}: ${temperature}, ${sky}`,
    feels: (value) => `gefühlt ${value}`,
    humidity: (value) => `Luftfeuchtigkeit ${value} %`,
    wind: (value) => `Wind ${value}`,
    rainYes: ({ house, kind, time, amount, hours }) =>
      `${capitalize(kind)} in ${house} ab ${time} erwartet (${amount}) in den nächsten ${hours} Stunden.`,
    rainNo: ({ house, hours }) =>
      `Kein Regen in ${house} in den nächsten ${hours} Stunden erwartet.`,
  },
  es: {
    today: 'hoy',
    tomorrow: 'mañana',
    forecast: ({ name, house, sky, max, min }) =>
      `Tiempo ${name} en ${house}: ${sky}, de ${min} a ${max}`,
    rain: ({ chance, amount }) =>
      `${chance} % de probabilidad de precipitación${amount ? ` (${amount})` : ''}`,
    predictability: (value) => `fiabilidad ${value} %`,
    current: ({ house, temperature, sky }) => `En ${house}: ${temperature}, ${sky}`,
    feels: (value) => `sensación ${value}`,
    humidity: (value) => `humedad ${value} %`,
    wind: (value) => `viento ${value}`,
    rainYes: ({ house, kind, time, amount, hours }) =>
      `${capitalize(kind)} prevista en ${house} a partir de las ${time} (${amount}) en las próximas ${hours} horas.`,
    rainNo: ({ house, hours }) => `No se prevé lluvia en ${house} en las próximas ${hours} horas.`,
  },
};

/**
 * @description Upper-case the first letter.
 * @param {string} value - The text.
 * @returns {string} The text.
 * @example
 * capitalize('rain'); // -> 'Rain'
 */
function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const sentences = (language) => SENTENCES[language] ?? SENTENCES.en;
const kindWord = (kind, language) => (KIND_WORDS[language] ?? KIND_WORDS.en)[kind];

/**
 * @description Read the "day" field: 0 today … 6.
 * @param {unknown} value - The field value.
 * @returns {number} The offset.
 * @example
 * readDayOffset('1'); // -> 1
 */
function readDayOffset(value) {
  const offset = Number(value);
  return Number.isInteger(offset) && offset >= 0 && offset <= MAX_DAY_OFFSET ? offset : 0;
}

/**
 * @description Read the "hours" field of get_rain.
 * @param {unknown} value - The field value.
 * @returns {number} 3, 6, 12 or 24 (12 by default).
 * @example
 * readRainSpan('6'); // -> 6
 */
function readRainSpan(value) {
  return RAIN_SPANS.includes(String(value)) ? Number(value) : 12;
}

const degrees = (value, units) =>
  isNumber(value) ? `${Math.round(value)}${unitLabels(units).temperature}` : '?';
const amountText = (mm, units) => {
  const value = precipitationIn(mm, units);
  return isNumber(value) ? `${value} ${unitLabels(units).precipitation}` : null;
};

/**
 * @description Outputs of get_forecast.
 * @param {object} options - { forecast, house, language, units, day, now }.
 * @returns {object} The outputs.
 * @throws {Error} When meteoblue has no forecast for that day.
 * @example
 * buildForecastOutputs({ forecast, house: 'Home', language: 'en', units: 'metric', day: '1' });
 */
function buildForecastOutputs({ forecast, house, language, units, day, now = Date.now() }) {
  const offset = readDayOffset(day);
  const date = addDays(localDate(now, forecast.meta.timeZone), offset);
  const entry = forecast.days.find((candidate) => candidate.date === date);
  if (!entry) {
    throw new Error(`meteoblue has no forecast for ${date}`);
  }
  const words = sentences(language);
  const name =
    offset === 0 ? words.today : offset === 1 ? words.tomorrow : weekdayName(date, language);
  const sky = describe(entry.pictocode, 'daily', language) ?? '?';
  const parts = [
    words.forecast({
      name,
      house,
      sky: language === 'de' ? sky : sky.toLowerCase(),
      max: degrees(temperatureIn(entry.temperatureMax, units), units),
      min: degrees(temperatureIn(entry.temperatureMin, units), units),
    }),
  ];
  if (isNumber(entry.probability)) {
    parts.push(
      words.rain({
        chance: Math.round(entry.probability),
        amount: entry.precipitation > 0 ? amountText(entry.precipitation, units) : null,
      }),
    );
  }
  if (isNumber(entry.predictability)) {
    parts.push(words.predictability(Math.round(entry.predictability)));
  }
  const outputs = {
    summary: `${parts.join(', ')}.`,
    sky,
    date,
  };
  const number = (key, value) => {
    if (isNumber(value)) {
      outputs[key] = value;
    }
  };
  number('temperature_max', temperatureIn(entry.temperatureMax, units));
  number('temperature_min', temperatureIn(entry.temperatureMin, units));
  number('precipitation', precipitationIn(entry.precipitation, units));
  number('precipitation_probability', percent(entry.probability));
  number('predictability', percent(entry.predictability));
  number('wind_max', displaySpeed(entry.windSpeedMax, units));
  return outputs;
}

/**
 * @description Outputs of get_current.
 * @param {object} options - { forecast, house, language, units, now }.
 * @returns {object} The outputs.
 * @throws {Error} When the forecast does not reach the present hour.
 * @example
 * buildCurrentOutputs({ forecast, house: 'Home', language: 'en', units: 'metric' });
 */
function buildCurrentOutputs({ forecast, house, language, units, now = Date.now() }) {
  const hour = currentHour(forecast.hours, now);
  if (hour === null || !isNumber(hour.temperature)) {
    throw new Error('The meteoblue forecast does not cover the present hour');
  }
  const words = sentences(language);
  const labels = unitLabels(units);
  const sky = describe(hour.pictocode, 'hourly', language) ?? '?';
  const temperature = temperatureIn(hour.temperature, units);
  const feels = temperatureIn(hour.feelsLike, units);
  const wind = displaySpeed(hour.windSpeed, units);
  const parts = [
    words.current({
      house,
      temperature: degrees(temperature, units),
      sky: language === 'de' ? sky : sky.toLowerCase(),
    }),
  ];
  if (isNumber(feels) && Math.abs(feels - temperature) >= 1) {
    parts.push(words.feels(degrees(feels, units)));
  }
  if (isNumber(hour.humidity)) {
    parts.push(words.humidity(Math.round(hour.humidity)));
  }
  if (isNumber(wind)) {
    parts.push(words.wind(`${wind} ${labels.speed}`));
  }
  const outputs = { summary: `${parts.join(', ')}.`, sky, temperature };
  if (isNumber(feels)) {
    outputs.feels_like = feels;
  }
  if (isNumber(hour.humidity)) {
    outputs.humidity = percent(hour.humidity);
  }
  if (isNumber(wind)) {
    outputs.wind_speed = wind;
  }
  return outputs;
}

/**
 * @description Outputs of get_rain.
 * @param {object} options - { forecast, house, language, units, fields, now }.
 * @returns {object} The outputs.
 * @example
 * buildRainOutputs({ forecast, house: 'Home', language: 'en', units: 'metric', fields: { hours: '6' } });
 */
function buildRainOutputs({ forecast, house, language, units, fields = {}, now = Date.now() }) {
  const span = readRainSpan(fields.hours);
  const coming = upcomingHours(forecast.hours, now).filter(
    (hour) => hour.instant <= now + span * HOUR,
  );
  const wet = coming.filter((hour) => isWetHour(hour));
  const total = wet.reduce((sum, hour) => sum + hour.precipitation, 0);
  const maxProbability = Math.max(0, ...coming.map((hour) => hour.probability ?? 0));
  const words = sentences(language);
  if (wet.length === 0) {
    return {
      rain_expected: false,
      first_time: '',
      kind: '',
      total_precipitation: 0,
      max_probability: Math.round(maxProbability),
      summary: words.rainNo({ house, hours: span }),
    };
  }
  const kind = kindOf(wet);
  const time = formatTime(wet[0].instant, forecast.meta.timeZone, language);
  return {
    rain_expected: true,
    first_time: time,
    kind,
    total_precipitation: precipitationIn(total, units),
    max_probability: Math.round(maxProbability),
    summary: words.rainYes({
      house,
      kind: kindWord(kind, language),
      time,
      amount: amountText(total, units),
      hours: span,
    }),
  };
}

export {
  SCENE_ACTIONS,
  SENTENCES,
  KIND_WORDS,
  MAX_DAY_OFFSET,
  RAIN_SPANS,
  readDayOffset,
  readRainSpan,
  buildForecastOutputs,
  buildCurrentOutputs,
  buildRainOutputs,
};
