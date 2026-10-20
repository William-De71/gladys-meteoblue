// -----------------------------------------------------------------------------
// The languages of the integration.
//
// Gladys runs in English, French, German or Spanish: every text this
// integration writes exists in the four (test/i18n.test.js), any other
// language falls back to English. meteoblue itself writes no text in the
// Forecast API: the sky descriptions are in conditions.js.
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];
const LOCALES = { en: 'en-US', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

/**
 * @description A percentage: "40%" in English, "40 %" in the other languages.
 * @param {number} value - The value.
 * @param {string} language - The language.
 * @returns {string} The percentage.
 * @example
 * formatPercent(40, 'fr'); // -> '40 %'
 */
function formatPercent(value, language) {
  return language === 'en' || !LANGUAGES.includes(language) ? `${value}%` : `${value} %`;
}

/**
 * @description A whole number with the thousands separator of a language.
 * @param {number} value - The number.
 * @param {string} language - The language.
 * @returns {string} "10,000,000", "10 000 000", "10.000.000".
 * @example
 * formatNumber(8000, 'de'); // -> '8.000'
 */
function formatNumber(value, language) {
  return Math.round(value).toLocaleString(LOCALES[language] ?? LOCALES.en);
}

/**
 * @description A duration in hours and minutes: "7 h 10 min", "45 min".
 * @param {number} ms - The duration.
 * @param {string} language - The language.
 * @returns {string} The duration ("–" when infinite).
 * @example
 * formatDuration(7.25 * 3600 * 1000, 'en'); // -> '7 h 15 min'
 */
function formatDuration(ms, language) {
  if (!Number.isFinite(ms)) {
    return '–';
  }
  const minutes = Math.round(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const unit = language === 'de' ? 'Min.' : 'min';
  if (hours === 0) {
    return `${rest} ${unit}`;
  }
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} ${unit}`;
}

// Runtime messages: connection status and configuration action results.
const MESSAGES = {
  noKey: {
    en: 'Enter the API key of your meteoblue account (Account overview → Weather API) in the configuration.',
    fr: 'Saisissez dans la configuration la clé API de votre compte meteoblue (menu du compte → « Account overview » → Weather API).',
    de: 'Gib in der Konfiguration den API-Schlüssel deines meteoblue-Kontos ein (Kontomenü → „Account overview“ → Weather API).',
    es: 'Introduzca en la configuración la clave API de su cuenta meteoblue (menú de la cuenta → «Account overview» → Weather API).',
  },
  keyInvalid: {
    en: 'meteoblue refused the API key ({reason}). Copy it again from your meteoblue account and check that the Weather API access is active.',
    fr: 'meteoblue a refusé la clé API ({reason}). Recopiez-la depuis votre compte meteoblue et vérifiez que l’accès Weather API est actif.',
    de: 'meteoblue hat den API-Schlüssel abgelehnt ({reason}). Kopiere ihn erneut aus deinem meteoblue-Konto und prüfe den Weather-API-Zugang.',
    es: 'meteoblue rechazó la clave API ({reason}). Cópiela de nuevo desde su cuenta meteoblue y compruebe que el acceso a la Weather API está activo.',
  },
  keyExpired: {
    en: 'meteoblue says the access of this key has expired: renew the free Weather API year or buy credits on meteoblue.com.',
    fr: 'meteoblue indique que l’accès de cette clé a expiré : renouvelez l’année gratuite de la Weather API ou achetez des crédits sur meteoblue.com.',
    de: 'Laut meteoblue ist der Zugang dieses Schlüssels abgelaufen: Verlängere das kostenlose Weather-API-Jahr oder kaufe Credits auf meteoblue.com.',
    es: 'meteoblue indica que el acceso de esta clave ha caducado: renueve el año gratuito de la Weather API o compre créditos en meteoblue.com.',
  },
  keySignature: {
    en: 'This key requires signed requests (shared secret), which the integration does not support: use a key without signature.',
    fr: 'Cette clé exige des requêtes signées (secret partagé), que l’intégration ne gère pas : utilisez une clé sans signature.',
    de: 'Dieser Schlüssel verlangt signierte Anfragen (gemeinsames Geheimnis), die die Integration nicht unterstützt: Nutze einen Schlüssel ohne Signatur.',
    es: 'Esta clave exige solicitudes firmadas (secreto compartido), que la integración no admite: use una clave sin firma.',
  },
  quota: {
    en: 'meteoblue refused the request for credits or rate ({reason}). The cached forecast is served meanwhile.',
    fr: 'meteoblue a refusé la requête faute de crédits ou par limite de débit ({reason}). La prévision en cache est servie en attendant.',
    de: 'meteoblue hat die Anfrage wegen Credits oder Ratenlimit abgelehnt ({reason}). Bis dahin wird die zwischengespeicherte Vorhersage geliefert.',
    es: 'meteoblue rechazó la solicitud por créditos o límite de frecuencia ({reason}). Mientras tanto se sirve la previsión en caché.',
  },
  budget: {
    en: 'Credits of the key year spent ({used} of {annual}): no call to meteoblue until {end}, the cached forecast is served.',
    fr: 'Crédits de l’année de la clé épuisés ({used} sur {annual}) : plus d’appel à meteoblue avant le {end}, la prévision en cache est servie.',
    de: 'Credits des Schlüsseljahres aufgebraucht ({used} von {annual}): kein Aufruf an meteoblue bis {end}, die zwischengespeicherte Vorhersage wird geliefert.',
    es: 'Créditos del año de la clave agotados ({used} de {annual}): ninguna llamada a meteoblue hasta el {end}, se sirve la previsión en caché.',
  },
  testOk: {
    en: 'Key OK for "{house}": {temperature}, {sky}. This call: {cost} credits. Key year: {used} of {annual} used, a refresh about every {interval}.',
    fr: 'Clé valide pour « {house} » : {temperature}, {sky}. Cet appel : {cost} crédits. Année de la clé : {used} sur {annual}, une mise à jour toutes les {interval} environ.',
    de: 'Schlüssel gültig für „{house}“: {temperature}, {sky}. Dieser Aufruf: {cost} Credits. Schlüsseljahr: {used} von {annual}, Aktualisierung etwa alle {interval}.',
    es: 'Clave válida para «{house}»: {temperature}, {sky}. Esta llamada: {cost} créditos. Año de la clave: {used} de {annual}, una actualización cada {interval} aprox.',
  },
  testFailed: {
    en: 'Test failed: {reason}',
    fr: 'Échec du test : {reason}',
    de: 'Test fehlgeschlagen: {reason}',
    es: 'La prueba falló: {reason}',
  },
  noHouse: {
    en: 'No house of Gladys has a location: set it in the house settings.',
    fr: 'Aucune maison de Gladys n’est localisée : renseignez sa position dans ses réglages.',
    de: 'Kein Zuhause in Gladys hat einen Standort: Lege ihn in den Einstellungen des Zuhauses fest.',
    es: 'Ninguna vivienda de Gladys tiene ubicación: defínala en los ajustes de la vivienda.',
  },
};

/**
 * @description One runtime message in a language, with `{name}` substitutions.
 * @param {string} key - The MESSAGES key.
 * @param {string} language - The language (English fallback).
 * @param {object} [values] - Substitutions.
 * @returns {string} The message (≤ 200 characters is the caller's concern).
 * @example
 * t('testFailed', 'fr', { reason: 'timeout' }); // -> 'Échec du test : timeout'
 */
function t(key, language, values = {}) {
  const entry = MESSAGES[key];
  const template = entry[language] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

/**
 * @description A runtime message in the four languages.
 * @param {string} key - The MESSAGES key.
 * @param {object|Function} [values] - Substitutions, or `(language) => values`.
 * @returns {{ en: string, fr: string, de: string, es: string }} The message.
 * @example
 * all('noKey');
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      t(key, language, typeof values === 'function' ? values(language) : values),
    ]),
  );
}

export { LANGUAGES, MESSAGES, formatPercent, formatNumber, formatDuration, t, all };
