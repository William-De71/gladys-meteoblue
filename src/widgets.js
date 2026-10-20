// -----------------------------------------------------------------------------
// Dashboard widgets of the Meteoblue integration.
//
// The core weather widget already shows what this provider answers (current
// conditions, hours, days). The widgets add what that generic card cannot:
//
//   - `daily`      the 7 days of meteoblue with its own pictograms, the
//                  amount and hours of precipitation, and the PREDICTABILITY
//                  meteoblue gives each day (how far the models agree);
//   - `hourly`     the next 12, 24 or 48 hours as a curve: temperature and
//                  feels like, precipitation, or wind;
//   - `meteogram`  the 5-day meteogram picture of meteoblue (when switched on);
//   - `credits`    the credit budget of the key year: used, left, the refresh
//                  interval it allows, the end of the key year.
//
// Every forecast widget names its source and links to the meteoblue page of
// the same place, as meteoblue asks of free uses. The content is built per
// user language and unit system (the core caches it per variant). Icons are
// image keys ("mb-d-03") served by the image handler (conditions.js): the
// browser never contacts meteoblue.
// -----------------------------------------------------------------------------

import { describe, iconKey } from './conditions.js';
import { upcomingHours, isWetHour } from './forecast.js';
import { sunTimes } from './sun.js';
import { addDays, formatDate, formatDayTime, formatTime, localDate, weekdayName } from './time.js';
import {
  compassOf,
  displaySpeed,
  isNumber,
  precipitationIn,
  temperatureIn,
  unitLabels,
} from './units.js';
import { formatDuration, formatNumber, formatPercent } from './i18n.js';

const WIDGETS = {
  DAILY: 'daily',
  HOURLY: 'hourly',
  METEOGRAM: 'meteogram',
  CREDITS: 'credits',
};

const TTL_SECONDS = {
  [WIDGETS.DAILY]: 1800,
  [WIDGETS.HOURLY]: 900,
  [WIDGETS.METEOGRAM]: 1800,
  [WIDGETS.CREDITS]: 600,
};

const HOURLY_METRICS = ['temperature', 'precipitation', 'wind'];
const HOURLY_SPANS = ['12', '24', '48'];
const DAILY_SPANS = ['3', '5', '7'];
const MAX_DESCRIPTION = 2000;

// The meteoblue week page of a place, per language (checked 2026-10-20).
const PAGE_PATHS = {
  en: 'en/weather/week',
  fr: 'fr/meteo/semaine',
  de: 'de/wetter/woche',
  es: 'es/tiempo/semana',
};

const TEXTS = {
  noHouse: {
    en: 'No house of Gladys has a location: set it in the house settings.',
    fr: 'Aucune maison de Gladys n’est localisée : renseignez sa position dans ses réglages.',
    de: 'Kein Zuhause in Gladys hat einen Standort: Lege ihn in den Einstellungen des Zuhauses fest.',
    es: 'Ninguna vivienda de Gladys tiene ubicación: defínala en los ajustes de la vivienda.',
  },
  unknownHouse: {
    en: 'The house chosen for this widget no longer exists: pick another one in its settings.',
    fr: 'La maison choisie pour ce widget n’existe plus : choisissez-en une autre dans ses réglages.',
    de: 'Das für dieses Widget gewählte Zuhause existiert nicht mehr: Wähle in den Einstellungen ein anderes.',
    es: 'La vivienda elegida para este widget ya no existe: elija otra en sus ajustes.',
  },
  notLocated: {
    en: 'The house "{name}" has no location: set it in the house settings.',
    fr: 'La maison « {name} » n’est pas localisée : renseignez sa position dans ses réglages.',
    de: 'Das Zuhause „{name}“ hat keinen Standort: Lege ihn in den Einstellungen des Zuhauses fest.',
    es: 'La vivienda «{name}» no tiene ubicación: defínala en los ajustes de la vivienda.',
  },
  noKey: {
    en: 'Enter your meteoblue API key in the integration configuration.',
    fr: 'Saisissez votre clé API meteoblue dans la configuration de l’intégration.',
    de: 'Gib deinen meteoblue-API-Schlüssel in der Konfiguration der Integration ein.',
    es: 'Introduzca su clave API de meteoblue en la configuración de la integración.',
  },
  noForecast: {
    en: 'meteoblue has no forecast to come for this house right now.',
    fr: 'meteoblue ne fournit pas de prévision à venir pour cette maison en ce moment.',
    de: 'meteoblue hat für dieses Zuhause gerade keine kommende Vorhersage.',
    es: 'meteoblue no tiene ahora mismo previsión para esta vivienda.',
  },
  unavailable: {
    en: 'meteoblue is unavailable right now: {reason}',
    fr: 'meteoblue est indisponible pour le moment : {reason}',
    de: 'meteoblue ist gerade nicht verfügbar: {reason}',
    es: 'meteoblue no está disponible en este momento: {reason}',
  },
  budget: {
    en: 'The credits of the key year are spent and no forecast is cached for this house yet.',
    fr: 'Les crédits de l’année de la clé sont épuisés et aucune prévision n’est encore en cache pour cette maison.',
    de: 'Die Credits des Schlüsseljahres sind aufgebraucht, und für dieses Zuhause ist noch keine Vorhersage zwischengespeichert.',
    es: 'Los créditos del año de la clave están agotados y aún no hay previsión en caché para esta vivienda.',
  },
  meteogramOff: {
    en: 'The meteogram is switched off: turn it on in the integration configuration. Each picture costs 16,000 credits.',
    fr: 'Le météogramme est désactivé : activez-le dans la configuration de l’intégration. Chaque image coûte 16 000 crédits.',
    de: 'Das Meteogramm ist ausgeschaltet: Schalte es in der Konfiguration der Integration ein. Jedes Bild kostet 16.000 Credits.',
    es: 'El meteograma está desactivado: actívelo en la configuración de la integración. Cada imagen cuesta 16 000 créditos.',
  },
  meteogramAlt: {
    en: 'meteoblue 5-day meteogram: temperature, clouds, precipitation and wind',
    fr: 'Météogramme meteoblue sur 5 jours : température, nuages, précipitations et vent',
    de: 'meteoblue-5-Tage-Meteogramm: Temperatur, Wolken, Niederschlag und Wind',
    es: 'Meteograma meteoblue de 5 días: temperatura, nubes, precipitación y viento',
  },
  source: {
    en: 'Data: meteoblue',
    fr: 'Données : meteoblue',
    de: 'Daten: meteoblue',
    es: 'Datos: meteoblue',
  },
  openMeteoblue: {
    en: 'On meteoblue.com',
    fr: 'Sur meteoblue.com',
    de: 'Auf meteoblue.com',
    es: 'En meteoblue.com',
  },
  updated: {
    en: 'updated {time}',
    fr: 'mise à jour {time}',
    de: 'aktualisiert {time}',
    es: 'actualizado {time}',
  },
  high: { en: 'High', fr: 'Max', de: 'Max.', es: 'Máx.' },
  low: { en: 'Low', fr: 'Min', de: 'Min.', es: 'Mín.' },
  now: { en: 'Now', fr: 'Actuel', de: 'Jetzt', es: 'Ahora' },
  temperature: { en: 'Temperature', fr: 'Température', de: 'Temperatur', es: 'Temperatura' },
  feelsLike: { en: 'Feels like', fr: 'Ressenti', de: 'Gefühlt', es: 'Sensación' },
  precipitation: {
    en: 'Precipitation',
    fr: 'Précipitations',
    de: 'Niederschlag',
    es: 'Precipitación',
  },
  chance: { en: 'Chance', fr: 'Risque', de: 'Risiko', es: 'Probabilidad' },
  maxChance: { en: 'Max chance', fr: 'Risque max', de: 'Max. Risiko', es: 'Prob. máx.' },
  total: { en: 'Total', fr: 'Cumul', de: 'Summe', es: 'Total' },
  firstRain: { en: 'First rain', fr: '1re pluie', de: 'Erster Regen', es: '1.ª lluvia' },
  none: { en: 'None', fr: 'Aucune', de: 'Keiner', es: 'Ninguna' },
  wind: { en: 'Wind', fr: 'Vent', de: 'Wind', es: 'Viento' },
  maxWind: { en: 'Max wind', fr: 'Vent max', de: 'Max. Wind', es: 'Viento máx.' },
  direction: { en: 'Direction', fr: 'Direction', de: 'Richtung', es: 'Dirección' },
  nextHours: {
    en: 'Next {n} hours',
    fr: '{n} prochaines heures',
    de: 'Nächste {n} Stunden',
    es: 'Próximas {n} horas',
  },
  today: { en: 'Today', fr: 'Aujourd’hui', de: 'Heute', es: 'Hoy' },
  tomorrow: { en: 'Tomorrow', fr: 'Demain', de: 'Morgen', es: 'Mañana' },
  hoursOfRain: {
    en: '{amount} in {hours} h',
    fr: '{amount} en {hours} h',
    de: '{amount} in {hours} Std.',
    es: '{amount} en {hours} h',
  },
  uv: { en: 'UV index', fr: 'Indice UV', de: 'UV-Index', es: 'Índice UV' },
  humidity: { en: 'Humidity', fr: 'Humidité', de: 'Luftfeuchtigkeit', es: 'Humedad' },
  sun: {
    en: 'Sunrise / sunset',
    fr: 'Lever / coucher',
    de: 'Sonnenauf-/untergang',
    es: 'Salida / puesta',
  },
  predictability: {
    en: 'Predictability',
    fr: 'Fiabilité',
    de: 'Vorhersagbarkeit',
    es: 'Fiabilidad',
  },
  // predictability_class 1-5 of meteoblue.
  class1: { en: 'very low', fr: 'très faible', de: 'sehr gering', es: 'muy baja' },
  class2: { en: 'low', fr: 'faible', de: 'gering', es: 'baja' },
  class3: { en: 'medium', fr: 'moyenne', de: 'mittel', es: 'media' },
  class4: { en: 'high', fr: 'élevée', de: 'hoch', es: 'alta' },
  class5: { en: 'very high', fr: 'très élevée', de: 'sehr hoch', es: 'muy alta' },
  creditsUsed: {
    en: 'Credits used',
    fr: 'Crédits utilisés',
    de: 'Credits genutzt',
    es: 'Créditos usados',
  },
  creditsLeft: {
    en: 'Credits left',
    fr: 'Crédits restants',
    de: 'Credits übrig',
    es: 'Créditos restantes',
  },
  refresh: { en: 'Refresh every', fr: 'Mise à jour', de: 'Aktualisierung', es: 'Actualización' },
  daysLeft: { en: 'Days left', fr: 'Jours restants', de: 'Tage übrig', es: 'Días restantes' },
  usedOf: { en: 'Used / year', fr: 'Utilisés / an', de: 'Genutzt / Jahr', es: 'Usados / año' },
  yearEnd: {
    en: 'Key year ends',
    fr: 'Fin de l’année de la clé',
    de: 'Schlüsseljahr endet',
    es: 'Fin del año de la clave',
  },
  perRefresh: {
    en: 'Cost of a refresh',
    fr: 'Coût d’une mise à jour',
    de: 'Kosten pro Aktualisierung',
    es: 'Coste por actualización',
  },
  places: {
    en: 'Places followed',
    fr: 'Lieux suivis',
    de: 'Verfolgte Orte',
    es: 'Lugares seguidos',
  },
  lastCall: { en: 'Last call', fr: 'Dernier appel', de: 'Letzter Aufruf', es: 'Última llamada' },
  frozen: { en: 'paused', fr: 'en pause', de: 'pausiert', es: 'en pausa' },
  creditsBody: {
    en: 'The forecast refresh is spread over what is left of the key year. Buy credits on meteoblue.com and raise "Credits per key year" for fresher forecasts.',
    fr: 'Les mises à jour sont réparties sur ce qui reste de l’année de la clé. Achetez des crédits sur meteoblue.com et augmentez « Crédits par année de clé » pour des prévisions plus fraîches.',
    de: 'Die Aktualisierungen werden auf den Rest des Schlüsseljahres verteilt. Kaufe Credits auf meteoblue.com und erhöhe „Credits pro Schlüsseljahr“ für frischere Vorhersagen.',
    es: 'Las actualizaciones se reparten en lo que queda del año de la clave. Compre créditos en meteoblue.com y aumente «Créditos por año de clave» para previsiones más frescas.',
  },
};

/**
 * @description Pick a text in the user's language (English fallback).
 * @param {string} key - The TEXTS key.
 * @param {string} language - The language.
 * @param {object} [values] - `{name}` substitutions.
 * @returns {string} The text.
 * @example
 * text('nextHours', 'fr', { n: 24 }); // -> '24 prochaines heures'
 */
function text(key, language, values = {}) {
  const entry = TEXTS[key];
  const template = entry[language] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

// French puts a (non-breaking) space before a colon.
const colon = (language) => (language === 'fr' ? ' :' : ':');

const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound in characters.
 * @returns {string} The text.
 * @example
 * truncate('abcdef', 4); // -> 'abc…'
 */
function truncate(value, max) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * @description A content made of a single explanatory text.
 * @param {string} message - The text.
 * @param {number} ttl - The TTL in seconds.
 * @returns {object} The content.
 * @example
 * messageContent('No house', 60);
 */
function messageContent(message, ttl) {
  return {
    version: 1,
    ttl_seconds: ttl,
    components: [{ type: 'text', variant: 'body', text: truncate(message, 300) }],
  };
}

const caption = (parts) => ({
  type: 'text',
  variant: 'caption',
  text: truncate(parts.filter(Boolean).join(' · '), 80),
});

/**
 * @description The meteoblue week page of a place, in a language: the link
 * meteoblue asks free uses to give, "with the settings so that the same
 * location is accessed".
 * @param {object} house - { latitude, longitude }.
 * @param {string} language - The language.
 * @returns {string} The URL.
 * @example
 * meteoblueUrl({ latitude: 48.8566, longitude: 2.3522 }, 'fr'); // -> 'https://www.meteoblue.com/fr/meteo/semaine/48.857N2.352E'
 */
function meteoblueUrl({ latitude, longitude }, language) {
  const path = PAGE_PATHS[language] ?? PAGE_PATHS.en;
  const coordinate = (value) => String(Math.round(value * 1000) / 1000);
  return `https://www.meteoblue.com/${path}/${coordinate(latitude)}N${coordinate(longitude)}E`;
}

const sourceButton = (house, language) => ({
  type: 'button',
  label: text('openMeteoblue', language),
  icon: 'external-link',
  style: 'secondary',
  link: { url: meteoblueUrl(house, language) },
});

/**
 * @description The caption of a forecast widget: house, source, age.
 * @param {object} house - The house.
 * @param {number} at - When the forecast was fetched.
 * @param {string|null} timeZone - The zone.
 * @param {string} language - The language.
 * @returns {object} The caption component.
 */
function sourceCaption(house, at, timeZone, language) {
  return caption([
    house.name,
    text('source', language),
    at ? text('updated', language, { time: formatDayTime(at, timeZone, language) }) : null,
  ]);
}

// --- Daily widget -------------------------------------------------------------

/**
 * @description Read the daily settings.
 * @param {object} settings - The widget settings.
 * @returns {{ days: number, showIcons: boolean }} The span and icon switch.
 * @example
 * readDailySettings({ days: '5' }); // -> { days: 5, showIcons: true }
 */
function readDailySettings(settings = {}) {
  return {
    days: DAILY_SPANS.includes(String(settings.days)) ? Number(settings.days) : 7,
    showIcons: settings.show_icons !== false && settings.show_icons !== 'false',
  };
}

/**
 * @description The title of a forecast day.
 * @param {string} date - YYYY-MM-DD.
 * @param {string} today - The local date of today.
 * @param {string} language - The language.
 * @returns {string} "Today", "Tomorrow", "Monday".
 * @example
 * dayTitle('2026-10-22', '2026-10-20', 'fr'); // -> 'Jeudi'
 */
function dayTitle(date, today, language) {
  if (date === today) {
    return text('today', language);
  }
  if (date === addDays(today, 1)) {
    return text('tomorrow', language);
  }
  return capitalize(weekdayName(date, language));
}

const PREDICTABILITY_COLORS = { 1: 'danger', 2: 'warning', 3: 'info', 4: 'success', 5: 'success' };

/**
 * @description Build the content of the `daily` widget.
 * @param {object} options - Options.
 * @param {object} options.forecast - The parsed forecast.
 * @param {number} options.at - When it was fetched.
 * @param {object} options.house - The house.
 * @param {string} options.language - The user language.
 * @param {string} options.units - 'metric' or 'us'.
 * @param {object} options.settings - The widget settings.
 * @param {number} [options.now] - Current time in ms.
 * @returns {object} The widget content.
 * @example
 * buildDailyWidget({ forecast, at, house, language: 'fr', units: 'metric', settings: {} });
 */
function buildDailyWidget({ forecast, at, house, language, units, settings, now = Date.now() }) {
  const { days: span, showIcons } = readDailySettings(settings);
  const ttl = TTL_SECONDS[WIDGETS.DAILY];
  const timeZone = forecast.meta.timeZone;
  const today = localDate(now, timeZone);
  const labels = unitLabels(units);
  const days = forecast.days.filter((day) => day.date >= today).slice(0, span);
  if (days.length === 0) {
    return messageContent(text('noForecast', language), ttl);
  }
  const degrees = (value) =>
    isNumber(value) ? `${Math.round(temperatureIn(value, units))}°` : '–';
  const items = days.map((day) => {
    const sky = describe(day.pictocode, 'daily', language) ?? '';
    const item = {
      title: dayTitle(day.date, today, language),
      subtitle: truncate(
        [`${degrees(day.temperatureMax)} / ${degrees(day.temperatureMin)}`, sky]
          .filter(Boolean)
          .join(' · '),
        60,
      ),
    };
    if (isNumber(day.probability) && day.probability >= 20) {
      item.badge = {
        text: formatPercent(Math.round(day.probability), language),
        color: day.probability >= 60 ? 'primary' : 'info',
      };
    }
    const details = [];
    const amount = precipitationIn(day.precipitation, units);
    if (isNumber(amount) && amount > 0) {
      const hours = isNumber(day.precipitationHours) ? Math.round(day.precipitationHours) : null;
      details.push(
        `${text('precipitation', language)}${colon(language)} ${
          hours
            ? text('hoursOfRain', language, { amount: `${amount} ${labels.precipitation}`, hours })
            : `${amount} ${labels.precipitation}`
        }`,
      );
    }
    const wind = displaySpeed(day.windSpeedMax, units);
    if (isNumber(wind)) {
      const direction = compassOf(day.windDirection, language);
      details.push(
        `${text('maxWind', language)}${colon(language)} ${[direction, `${wind} ${labels.speed}`].filter(Boolean).join(' ')}`,
      );
    }
    if (isNumber(day.uvIndex)) {
      details.push(`${text('uv', language)} ${Math.round(day.uvIndex)}`);
    }
    if (isNumber(day.predictabilityClass) && day.predictabilityClass >= 1) {
      const level = Math.min(5, Math.round(day.predictabilityClass));
      details.push(
        `${text('predictability', language)}${colon(language)} ${text(`class${level}`, language)}${
          isNumber(day.predictability)
            ? ` (${formatPercent(Math.round(day.predictability), language)})`
            : ''
        }`,
      );
      if (item.badge === undefined && level <= 2) {
        item.badge = { text: text(`class${level}`, language), color: PREDICTABILITY_COLORS[level] };
      }
    }
    const sun = sunTimes(day.date, house.latitude, house.longitude);
    if (sun) {
      details.push(
        `${text('sun', language)} ${formatTime(sun.sunrise, timeZone, language)} / ${formatTime(sun.sunset, timeZone, language)}`,
      );
    }
    if (details.length > 0) {
      item.description = truncate(details.join('\n'), MAX_DESCRIPTION);
    }
    if (showIcons) {
      const key = iconKey(day.pictocode, 'daily');
      if (key !== null) {
        item.image = key;
      }
    }
    return item;
  });
  return {
    version: 1,
    ttl_seconds: ttl,
    components: [
      sourceCaption(house, at, timeZone, language),
      { type: 'card-list', display: 'list', items },
      sourceButton(house, language),
    ],
  };
}

// --- Hourly widget ------------------------------------------------------------

/**
 * @description Read the hourly settings.
 * @param {object} settings - The widget settings.
 * @returns {{ metric: string, hours: number }} The metric and span.
 * @example
 * readHourlySettings({ metric: 'wind', hours: '12' }); // -> { metric: 'wind', hours: 12 }
 */
function readHourlySettings(settings = {}) {
  const metric = HOURLY_METRICS.includes(settings.metric) ? settings.metric : 'temperature';
  const hours = HOURLY_SPANS.includes(String(settings.hours)) ? Number(settings.hours) : 24;
  return { metric, hours };
}

/**
 * @description The entry with the highest (or lowest) value of a field.
 * @param {Array<object>} entries - Entries.
 * @param {string} field - The field.
 * @param {number} sign - 1 for the maximum, -1 for the minimum.
 * @returns {object|null} The entry.
 * @example
 * extreme(hours, 'temperature', 1);
 */
function extreme(entries, field, sign) {
  return entries.reduce((best, entry) => {
    if (!isNumber(entry[field])) {
      return best;
    }
    return best === null || sign * entry[field] > sign * best[field] ? entry : best;
  }, null);
}

const iso = (instant) => new Date(instant).toISOString();

/**
 * @description Build the content of the `hourly` widget.
 * @param {object} options - Options.
 * @param {object} options.forecast - The parsed forecast.
 * @param {number} options.at - When it was fetched.
 * @param {object} options.house - The house.
 * @param {string} options.language - The user language.
 * @param {string} options.units - 'metric' or 'us'.
 * @param {object} options.settings - The widget settings.
 * @param {number} [options.now] - Current time in ms.
 * @returns {object} The widget content.
 * @example
 * buildHourlyWidget({ forecast, at, house, language: 'en', units: 'metric', settings: {} });
 */
function buildHourlyWidget({ forecast, at, house, language, units, settings, now = Date.now() }) {
  const { metric, hours: span } = readHourlySettings(settings);
  const ttl = TTL_SECONDS[WIDGETS.HOURLY];
  const timeZone = forecast.meta.timeZone;
  const hours = upcomingHours(forecast.hours, now)
    .slice(0, span)
    .map((hour) => ({
      ...hour,
      temperatureShown: temperatureIn(hour.temperature, units),
      feelsShown: temperatureIn(hour.feelsLike, units),
      amountShown: precipitationIn(hour.precipitation, units),
      speedShown: displaySpeed(hour.windSpeed, units),
    }));
  if (hours.length === 0) {
    return messageContent(text('noForecast', language), ttl);
  }
  const labels = unitLabels(units);
  const title = text('nextHours', language, { n: hours.length });
  const time = (entry) => formatTime(entry.instant, timeZone, language);
  const components = [sourceCaption(house, at, timeZone, language)];

  if (metric === 'temperature') {
    const temperatures = hours.filter((h) => isNumber(h.temperatureShown));
    if (temperatures.length === 0) {
      return messageContent(text('noForecast', language), ttl);
    }
    const max = extreme(temperatures, 'temperatureShown', 1);
    const min = extreme(temperatures, 'temperatureShown', -1);
    const series = [
      {
        name: text('temperature', language),
        points: temperatures.map((h) => ({ t: iso(h.instant), v: h.temperatureShown })),
      },
    ];
    const feels = temperatures.filter((h) => isNumber(h.feelsShown));
    if (
      feels.length === temperatures.length &&
      feels.some((h) => Math.abs(h.feelsShown - h.temperatureShown) >= 1)
    ) {
      series.push({
        name: text('feelsLike', language),
        points: feels.map((h) => ({ t: iso(h.instant), v: h.feelsShown })),
      });
    }
    components.push(
      {
        type: 'value',
        value: Math.round(temperatures[0].temperatureShown),
        unit: labels.temperature,
        label: text('now', language),
        icon: 'thermometer',
      },
      {
        type: 'value',
        value: Math.round(max.temperatureShown),
        unit: labels.temperature,
        label: `${text('high', language)} ${time(max)}`,
        color: 'danger',
      },
      {
        type: 'value',
        value: Math.round(min.temperatureShown),
        unit: labels.temperature,
        label: `${text('low', language)} ${time(min)}`,
        color: 'info',
      },
      {
        type: 'chart',
        chart_type: 'line',
        title,
        unit: labels.temperature,
        series,
        now_marker: true,
        annotations: [
          {
            t: iso(max.instant),
            value: max.temperatureShown,
            label: `${Math.round(max.temperatureShown)}°`,
            color: 'danger',
          },
          {
            t: iso(min.instant),
            value: min.temperatureShown,
            label: `${Math.round(min.temperatureShown)}°`,
            color: 'info',
          },
        ],
      },
    );
  } else if (metric === 'precipitation') {
    const amounts = hours.map((h) => (isNumber(h.amountShown) ? h.amountShown : 0));
    const total = amounts.reduce((sum, value) => sum + value, 0);
    const chances = hours.map((h) => h.probability).filter(isNumber);
    const maxChance = chances.length > 0 ? Math.round(Math.max(...chances)) : null;
    const first = hours.find((h) => isWetHour(h)) ?? null;
    components.push(
      {
        type: 'value',
        value: units === 'us' ? Math.round(total * 100) / 100 : Math.round(total * 10) / 10,
        unit: labels.precipitation,
        label: text('total', language),
        icon: 'droplet',
        color: total > 0 ? 'primary' : 'neutral',
      },
      {
        type: 'value',
        value: first ? time(first) : text('none', language),
        label: text('firstRain', language),
        icon: 'clock',
      },
    );
    if (maxChance !== null) {
      components.push({
        type: 'value',
        value: maxChance,
        unit: '%',
        label: text('maxChance', language),
        icon: 'umbrella',
        color: maxChance >= 60 ? 'primary' : 'neutral',
      });
    }
    const chart = {
      type: 'chart',
      chart_type: 'bar',
      title: `${text('precipitation', language)} · ${title}`,
      unit: labels.precipitation,
      series: [
        {
          name: text('precipitation', language),
          points: hours.map((h, index) => ({ t: iso(h.instant), v: amounts[index] })),
        },
      ],
      now_marker: true,
    };
    if (first) {
      chart.annotations = [{ t: iso(first.instant), label: time(first), color: 'primary' }];
    }
    components.push(chart);
  } else {
    const speeds = hours.map((h) => h.speedShown ?? 0);
    const maxSpeed = Math.max(...speeds);
    const maxIndex = speeds.indexOf(maxSpeed);
    components.push({
      type: 'value',
      value: speeds[0],
      unit: labels.speed,
      label: text('now', language),
      icon: 'wind',
    });
    components.push({
      type: 'value',
      value: maxSpeed,
      unit: labels.speed,
      label: `${text('maxWind', language)} ${time(hours[maxIndex])}`,
      color: maxSpeed >= (units === 'us' ? 30 : 50) ? 'warning' : 'neutral',
    });
    const direction = compassOf(hours[0].windDirection, language);
    if (direction) {
      components.push({
        type: 'value',
        value: direction,
        label: text('direction', language),
        icon: 'navigation',
      });
    }
    components.push({
      type: 'chart',
      chart_type: 'line',
      title,
      unit: labels.speed,
      series: [
        {
          name: text('wind', language),
          points: hours.map((h, index) => ({ t: iso(h.instant), v: speeds[index] })),
        },
      ],
      now_marker: true,
      annotations: [
        {
          t: iso(hours[maxIndex].instant),
          value: maxSpeed,
          label: `${maxSpeed}`,
          color: 'warning',
        },
      ],
    });
  }
  components.push(sourceButton(house, language));
  return { version: 1, ttl_seconds: ttl, components };
}

// --- Meteogram widget -----------------------------------------------------------

/**
 * @description Build the content of the `meteogram` widget.
 * @param {object} options - Options.
 * @param {object} options.house - The house.
 * @param {string|null} options.imageKey - The image key, null when switched off.
 * @param {number|null} options.at - When the picture was made.
 * @param {string|null} options.timeZone - The zone.
 * @param {string} options.language - The user language.
 * @returns {object} The widget content.
 * @example
 * buildMeteogramWidget({ house, imageKey: 'mb-mg-0123456789-abc', at, timeZone, language: 'fr' });
 */
function buildMeteogramWidget({ house, imageKey, at, timeZone, language }) {
  const ttl = TTL_SECONDS[WIDGETS.METEOGRAM];
  if (imageKey === null) {
    return messageContent(text('meteogramOff', language), ttl);
  }
  return {
    version: 1,
    ttl_seconds: ttl,
    components: [
      sourceCaption(house, at, timeZone, language),
      { type: 'image', key: imageKey, alt: text('meteogramAlt', language), fit: 'contain' },
      sourceButton(house, language),
    ],
  };
}

// --- Credits widget -------------------------------------------------------------

/**
 * @description Build the content of the `credits` widget.
 * @param {object} options - Options.
 * @param {object} options.credits - The credit budget.
 * @param {object} options.plan - Its plan() result.
 * @param {number} options.places - The places sharing the budget.
 * @param {string} options.language - The user language.
 * @param {number} [options.now] - Current time in ms.
 * @returns {object} The widget content.
 * @example
 * buildCreditsWidget({ credits, plan: credits.plan({ locations: 1 }), places: 1, language: 'en' });
 */
function buildCreditsWidget({ credits, plan, places, language }) {
  const percent = credits.usedPercent();
  const last = credits.log().at(-1);
  const color = percent >= 90 ? 'danger' : percent >= 75 ? 'warning' : 'success';
  const items = [
    {
      label: text('usedOf', language),
      value: truncate(
        `${formatNumber(credits.used(), language)} / ${formatNumber(credits.annual(), language)}`,
        40,
      ),
      color,
    },
    {
      label: text('yearEnd', language),
      value: formatDate(credits.periodEnd(), language),
      color: 'info',
    },
    {
      label: text('perRefresh', language),
      value: formatNumber(credits.costOf('forecast'), language),
      color: 'neutral',
    },
    { label: text('places', language), value: places, color: 'neutral' },
  ];
  if (last) {
    items.push({
      label: text('lastCall', language),
      value: truncate(
        `${formatDate(last.at.slice(0, 10), language)} · ${formatNumber(last.credits, language)}`,
        40,
      ),
      color: 'neutral',
    });
  }
  return {
    version: 1,
    ttl_seconds: TTL_SECONDS[WIDGETS.CREDITS],
    components: [
      {
        type: 'gauge',
        value: percent,
        min: 0,
        max: 100,
        unit: '%',
        label: text('creditsUsed', language),
        color,
      },
      {
        type: 'value',
        value:
          credits.remaining() >= 1e6
            ? Math.round(credits.remaining() / 1e5) / 10
            : formatNumber(credits.remaining(), language),
        unit: credits.remaining() >= 1e6 ? 'M' : '',
        label: text('creditsLeft', language),
        icon: 'database',
      },
      {
        type: 'value',
        value: Number.isFinite(plan.intervalMs)
          ? formatDuration(plan.intervalMs, language)
          : text('frozen', language),
        label: text('refresh', language),
        icon: 'refresh-cw',
        color: Number.isFinite(plan.intervalMs) ? 'neutral' : 'danger',
      },
      {
        type: 'value',
        value: credits.daysLeft(),
        label: text('daysLeft', language),
        icon: 'calendar',
      },
      { type: 'status', items },
      { type: 'text', variant: 'body', text: text('creditsBody', language) },
    ],
  };
}

export {
  WIDGETS,
  TEXTS,
  TTL_SECONDS,
  HOURLY_METRICS,
  HOURLY_SPANS,
  DAILY_SPANS,
  text,
  truncate,
  messageContent,
  meteoblueUrl,
  readDailySettings,
  dayTitle,
  buildDailyWidget,
  readHourlySettings,
  buildHourlyWidget,
  buildMeteogramWidget,
  buildCreditsWidget,
};
