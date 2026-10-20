// Fixtures for the tests and the widget illustrations: a meteoblue answer of
// /packages/basic-1h_basic-day shaped exactly like the Forecast API reference
// (metadata, units, data_1h, data_day, column arrays on a "YYYY-MM-DD hh:mm"
// local time axis), for Paris from Tuesday 20 October 2026, 00:00 local time,
// 7 days. Deterministic: no clock, no randomness.
//
// The weather it tells, for the tests:
//   - Tuesday 20: dry morning, rain from 15:00 to 19:00 local time;
//   - Friday 23: a frost night (down to about -3 °C), a little wet snow at dawn;
//   - Sunday 25: the autumn DST change (02:00 local time appears twice).

const NOW = Date.parse('2026-10-20T08:00:00Z'); // 10:00 in Paris
const LATITUDE = 48.8566;
const LONGITUDE = 2.3522;
const TIME_ZONE = 'Europe/Paris';
const HOUR = 3600 * 1000;
const START = Date.parse('2026-10-19T22:00:00Z'); // 2026-10-20 00:00 local
const DAYS = 7;

// Mean temperature of each day and its amplitude.
const DAY_MEANS = [12, 11, 7, 2, 6, 9, 10];
const AMPLITUDE = 5;
const PREDICTABILITY = [85, 76, 62, 48, 40, 33, 28];
const PREDICTABILITY_CLASS = [5, 4, 4, 3, 2, 2, 1];
const DAILY_PICTOCODES = [6, 3, 4, 13, 2, 3, 20];

const local = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * @description The local "YYYY-MM-DD hh:mm" of an instant, as meteoblue writes it.
 * @param {number} instant - The instant.
 * @returns {string} The local time.
 */
function wallClock(instant) {
  const parts = Object.fromEntries(
    local.formatToParts(new Date(instant)).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

const round = (value, decimals = 1) => Math.round(value * 10 ** decimals) / 10 ** decimals;

/**
 * @description The hourly weather of the story.
 * @param {string} date - Local date.
 * @param {number} hour - Local hour.
 * @param {number} day - Day index (0 = 20 October).
 * @returns {object} The values of that hour.
 */
function weatherAt(date, hour, day) {
  const temperature = round(DAY_MEANS[day] + AMPLITUDE * Math.sin(((hour - 9) / 24) * 2 * Math.PI));
  let precipitation = 0;
  let probability = 5;
  let pictocode = hour >= 8 && hour < 18 ? 7 : 1;
  let snowfraction = 0;
  if (day === 0 && hour >= 15 && hour <= 19) {
    precipitation = [0.4, 1.2, 2.0, 0.8, 0.3][hour - 15];
    probability = [70, 85, 85, 75, 60][hour - 15];
    pictocode = precipitation >= 1 ? 23 : 33;
  } else if (day === 0 && hour >= 12 && hour < 15) {
    pictocode = 22;
    probability = 30;
  } else if (day === 3 && hour >= 6 && hour <= 8) {
    precipitation = 0.5;
    probability = 55;
    snowfraction = 0.4;
    pictocode = 35;
  } else if (day >= 5) {
    pictocode = hour >= 8 && hour < 18 ? 19 : 4;
  }
  return {
    temperature,
    felttemperature: round(temperature - 1.5 - (day === 3 ? 1.5 : 0)),
    relativehumidity: Math.round(
      72 + 18 * Math.cos(((hour - 4) / 24) * 2 * Math.PI) + (precipitation > 0 ? 10 : 0),
    ),
    sealevelpressure: round(1016 - day * 1.2 - (day === 0 && hour >= 12 ? 4 : 0), 1),
    windspeed: round(
      2.5 +
        2 * Math.sin(((hour - 6) / 24) * 2 * Math.PI) +
        (day === 0 && hour >= 14 && hour <= 20 ? 4 : 0),
    ),
    winddirection: 200 + ((day * 37 + hour * 3) % 90),
    precipitation,
    convective_precipitation: day === 0 && hour === 17 ? 0.6 : 0,
    precipitation_probability: probability,
    snowfraction,
    pictocode,
    isdaylight: hour >= 8 && hour < 19 ? 1 : 0,
    uvindex: hour >= 10 && hour <= 15 && precipitation === 0 ? (day === 4 ? 3 : 2) : 0,
    date,
  };
}

/**
 * @description The meteoblue answer.
 * @param {object} [options] - { shift: hours added to every temperature }.
 * @returns {object} The JSON answer.
 */
function forecastAnswer({ shift = 0 } = {}) {
  const hourly = {
    time: [],
    temperature: [],
    felttemperature: [],
    relativehumidity: [],
    sealevelpressure: [],
    windspeed: [],
    winddirection: [],
    precipitation: [],
    convective_precipitation: [],
    precipitation_probability: [],
    snowfraction: [],
    pictocode: [],
    isdaylight: [],
    uvindex: [],
  };
  const perDay = Array.from({ length: DAYS }, () => []);
  for (let instant = START; ; instant += HOUR) {
    const wall = wallClock(instant);
    const date = wall.slice(0, 10);
    const day = Math.round(
      (Date.parse(`${date}T00:00:00Z`) - Date.parse('2026-10-20T00:00:00Z')) / (24 * HOUR),
    );
    if (day >= DAYS) {
      break;
    }
    const values = weatherAt(date, Number(wall.slice(11, 13)), day);
    values.temperature = round(values.temperature + shift);
    values.felttemperature = round(values.felttemperature + shift);
    hourly.time.push(wall);
    Object.keys(hourly).forEach((key) => {
      if (key !== 'time') {
        hourly[key].push(values[key]);
      }
    });
    perDay[day].push(values);
  }
  const sum = (list, key) => list.reduce((total, values) => total + values[key], 0);
  const max = (list, key) => Math.max(...list.map((values) => values[key]));
  const min = (list, key) => Math.min(...list.map((values) => values[key]));
  const daily = {
    time: perDay.map((list) => list[0].date),
    temperature_instant: perDay.map((list) => list[0].temperature),
    temperature_max: perDay.map((list) => max(list, 'temperature')),
    temperature_min: perDay.map((list) => min(list, 'temperature')),
    temperature_mean: perDay.map((list) => round(sum(list, 'temperature') / list.length)),
    felttemperature_max: perDay.map((list) => max(list, 'felttemperature')),
    felttemperature_min: perDay.map((list) => min(list, 'felttemperature')),
    felttemperature_mean: perDay.map((list) => round(sum(list, 'felttemperature') / list.length)),
    precipitation: perDay.map((list) => round(sum(list, 'precipitation'))),
    convective_precipitation: perDay.map((list) => round(sum(list, 'convective_precipitation'))),
    precipitation_probability: perDay.map((list) => max(list, 'precipitation_probability')),
    precipitation_hours: perDay.map(
      (list) => list.filter((values) => values.precipitation > 0).length,
    ),
    snowfraction: perDay.map((list) => (list.some((values) => values.snowfraction > 0) ? 0.2 : 0)),
    pictocode: DAILY_PICTOCODES,
    uvindex: perDay.map((list) => max(list, 'uvindex')),
    windspeed_max: perDay.map((list) => max(list, 'windspeed')),
    windspeed_min: perDay.map((list) => min(list, 'windspeed')),
    windspeed_mean: perDay.map((list) => round(sum(list, 'windspeed') / list.length)),
    winddirection: perDay.map((list) => list[12].winddirection),
    relativehumidity_max: perDay.map((list) => max(list, 'relativehumidity')),
    relativehumidity_min: perDay.map((list) => min(list, 'relativehumidity')),
    relativehumidity_mean: perDay.map((list) =>
      Math.round(sum(list, 'relativehumidity') / list.length),
    ),
    sealevelpressure_max: perDay.map((list) => max(list, 'sealevelpressure')),
    sealevelpressure_min: perDay.map((list) => min(list, 'sealevelpressure')),
    sealevelpressure_mean: perDay.map((list) => round(sum(list, 'sealevelpressure') / list.length)),
    humiditygreater90_hours: perDay.map(
      (list) => list.filter((values) => values.relativehumidity > 90).length,
    ),
    predictability: PREDICTABILITY,
    predictability_class: PREDICTABILITY_CLASS,
    rainspot: perDay.map(() => '0'.repeat(49)),
  };
  return {
    metadata: {
      name: '',
      latitude: 48.857,
      longitude: 2.352,
      height: 42,
      timezone_abbrevation: 'CEST',
      utc_timeoffset: 2,
      modelrun_utc: '2026-10-20 06:00',
      modelrun_updatetime_utc: '2026-10-20 07:40',
      generation_time_ms: 21.5,
    },
    units: {
      time: 'YYYY-MM-DD hh:mm',
      temperature: 'C',
      windspeed: 'ms-1',
      winddirection: 'degree',
      precipitation: 'mm',
      precipitation_probability: 'percent',
      relativehumidity: 'percent',
      pressure: 'hPa',
      predictability: 'percent',
    },
    data_1h: hourly,
    data_day: daily,
  };
}

export { NOW, LATITUDE, LONGITUDE, TIME_ZONE, HOUR, forecastAnswer, wallClock };
