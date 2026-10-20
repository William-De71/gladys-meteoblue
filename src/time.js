// -----------------------------------------------------------------------------
// Local dates and times of the house.
//
// meteoblue writes its time axes as local wall-clock strings of the time zone
// of the request ("2026-10-20 14:00", "2026-10-20"). The integration names
// that zone itself (`tz`, the IANA zone of Gladys, which the supervisor
// passes as TZ): the strings are turned back into instants here with the
// daylight-saving rules of that zone, which one `utc_timeoffset` for the
// whole answer could not do across a DST change.
//
// The pivot payload is made of instants, which the core formats itself; the
// texts this integration writes (scene summaries, widget subtitles) need the
// local wall-clock time, formatted here.
// -----------------------------------------------------------------------------

const LOCALES = { en: 'en-US', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };
const HOUR = 3600 * 1000;

const localeOf = (language) => LOCALES[language] ?? LOCALES.en;

/**
 * @description Whether an IANA time zone is known to this runtime.
 * @param {unknown} timeZone - The zone.
 * @returns {boolean} True when usable.
 * @example
 * isTimeZone('Europe/Paris'); // -> true
 */
function isTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || timeZone === '') {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * @description Build an Intl formatter, falling back to UTC on an unknown zone.
 * @param {string} locale - The locale.
 * @param {object} options - Intl options.
 * @param {string|null} timeZone - The IANA time zone.
 * @returns {Intl.DateTimeFormat} The formatter.
 * @example
 * formatter('en-US', { hour: 'numeric' }, 'America/Chicago');
 */
function formatter(locale, options, timeZone) {
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: timeZone || 'UTC' });
  } catch {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
  }
}

/**
 * @description The offset of a zone at an instant, in ms (UTC+2 -> 7200000).
 * @param {number} instant - The instant in ms.
 * @param {string|null} timeZone - The IANA time zone.
 * @returns {number} The offset.
 * @example
 * zoneOffset(Date.parse('2026-07-01T00:00:00Z'), 'Europe/Paris'); // -> 7200000
 */
function zoneOffset(instant, timeZone) {
  const parts = Object.fromEntries(
    formatter(
      'en-US',
      {
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      },
      timeZone,
    )
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  const wall = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return wall - Math.floor(instant / 1000) * 1000;
}

/**
 * @description The instant of a local wall-clock time of a zone. A time of
 * the hour repeated in autumn is its first occurrence (the forecast parser
 * moves the second one an hour on); a time of the hour skipped in spring is
 * read with the offset before the change (02:30 -> 03:30).
 * @param {number} year - Year.
 * @param {number} month - Month, 1-12.
 * @param {number} day - Day.
 * @param {number} hour - Hour.
 * @param {number} minute - Minute.
 * @param {string|null} timeZone - The IANA time zone.
 * @returns {number} The instant in ms.
 * @example
 * zonedInstant(2026, 10, 20, 14, 0, 'Europe/Paris'); // -> Date.parse('2026-10-20T12:00:00Z')
 */
function zonedInstant(year, month, day, hour, minute, timeZone) {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  // The offsets in force half a day before and after: a DST change sits
  // between them. A candidate is right when it shows that wall-clock time.
  const candidates = [
    zoneOffset(wall - 12 * HOUR, timeZone),
    zoneOffset(wall + 12 * HOUR, timeZone),
  ]
    .map((offset) => wall - offset)
    .filter((instant) => instant + zoneOffset(instant, timeZone) === wall);
  if (candidates.length > 0) {
    // A repeated hour: its first occurrence.
    return Math.min(...candidates);
  }
  // A skipped hour: read with the offset before the change.
  return wall - zoneOffset(wall - 12 * HOUR, timeZone);
}

/**
 * @description Read one value of a meteoblue time axis.
 * @param {unknown} value - "YYYY-MM-DD hh:mm", "YYYY-MM-DD", "YYYYMMDD hh:mm",
 * an ISO 8601 string with an offset, or a UTC timestamp (s or ms).
 * @param {object} context - { timeZone, utcOffsetHours }: the zone of the
 * request, and the offset of the answer for a zone this runtime ignores.
 * @returns {{ instant: number, date: string }|null} The instant and its local
 * date, or null when unreadable.
 * @example
 * readTime('2026-10-20 14:00', { timeZone: 'Europe/Paris' });
 */
function readTime(value, { timeZone = null, utcOffsetHours = 0 } = {}) {
  const local = (year, month, day, hour, minute) => {
    const instant = isTimeZone(timeZone)
      ? zonedInstant(year, month, day, hour, minute, timeZone)
      : Date.UTC(year, month - 1, day, hour, minute) - utcOffsetHours * HOUR;
    const pad = (n) => String(n).padStart(2, '0');
    return { instant, date: `${year}-${pad(month)}-${pad(day)}` };
  };
  if (typeof value === 'number' && Number.isFinite(value)) {
    const instant = value > 1e11 ? value : value * 1000;
    return { instant, date: localDate(instant, timeZone) };
  }
  if (typeof value !== 'string') {
    return null;
  }
  const wall = /^(\d{4})-?(\d{2})-?(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(value.trim());
  if (wall !== null) {
    const [, year, month, day, hour = '0', minute = '0'] = wall;
    return local(Number(year), Number(month), Number(day), Number(hour), Number(minute));
  }
  const instant = Date.parse(value);
  return Number.isNaN(instant) ? null : { instant, date: localDate(instant, timeZone) };
}

/**
 * @description The local calendar date of an instant.
 * @param {number|string|Date} instant - The instant.
 * @param {string|null} timeZone - The IANA time zone.
 * @returns {string} YYYY-MM-DD.
 * @example
 * localDate(Date.parse('2026-10-10T03:00:00Z'), 'America/Chicago'); // -> '2026-10-09'
 */
function localDate(instant, timeZone) {
  return formatter('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }, timeZone).format(
    new Date(instant),
  );
}

/**
 * @description Noon of a local date, as an instant: the datetime of a pivot
 * day (a bare date reads as UTC midnight, the evening before west of Greenwich).
 * @param {string} date - YYYY-MM-DD.
 * @param {string|null} timeZone - The IANA time zone.
 * @returns {number} The instant in ms.
 * @example
 * localNoon('2026-10-20', 'Europe/Paris'); // -> Date.parse('2026-10-20T10:00:00Z')
 */
function localNoon(date, timeZone) {
  const [year, month, day] = date.split('-').map(Number);
  return zonedInstant(year, month, day, 12, 0, isTimeZone(timeZone) ? timeZone : 'UTC');
}

/**
 * @description Add days to a YYYY-MM-DD date.
 * @param {string} date - The date.
 * @param {number} days - Days to add.
 * @returns {string} The new date.
 * @example
 * addDays('2026-10-31', 1); // -> '2026-11-01'
 */
function addDays(date, days) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * @description Format a local time: "5:12 PM" in English, "17:12" in French.
 * @param {number|string|Date} instant - The instant.
 * @param {string|null} timeZone - The IANA time zone.
 * @param {string} language - 'en', 'fr', 'de' or 'es'.
 * @returns {string} The time.
 * @example
 * formatTime('2026-10-09T22:12:00Z', 'America/Chicago', 'en'); // -> '5:12 PM'
 */
function formatTime(instant, timeZone, language) {
  return formatter(localeOf(language), { hour: 'numeric', minute: '2-digit' }, timeZone).format(
    new Date(instant),
  );
}

/**
 * @description Format a short local day and time: "Sat 6:00 PM", "sam. 18:00".
 * @param {number|string|Date} instant - The instant.
 * @param {string|null} timeZone - The IANA time zone.
 * @param {string} language - 'en', 'fr', 'de' or 'es'.
 * @returns {string} The day and time.
 * @example
 * formatDayTime('2026-10-10T23:00:00Z', 'America/Chicago', 'en'); // -> 'Sat 6:00 PM'
 */
function formatDayTime(instant, timeZone, language) {
  return formatter(
    localeOf(language),
    { weekday: 'short', hour: 'numeric', minute: '2-digit' },
    timeZone,
  ).format(new Date(instant));
}

/**
 * @description Format a local date: "Oct 21, 2026", "21 oct. 2026".
 * @param {string} date - YYYY-MM-DD.
 * @param {string} language - 'en', 'fr', 'de' or 'es'.
 * @returns {string} The date.
 * @example
 * formatDate('2027-03-02', 'fr'); // -> '2 mars 2027'
 */
function formatDate(date, language) {
  const [year, month, day] = date.split('-').map(Number);
  return formatter(localeOf(language), { day: 'numeric', month: 'short', year: 'numeric' }, 'UTC')
    .format(new Date(Date.UTC(year, month - 1, day, 12)))
    .replace(/\.$/, '');
}

/**
 * @description The local weekday name of a YYYY-MM-DD date.
 * @param {string} date - The date.
 * @param {string} language - 'en', 'fr', 'de' or 'es'.
 * @returns {string} "Saturday", "samedi".
 * @example
 * weekdayName('2026-10-10', 'fr'); // -> 'samedi'
 */
function weekdayName(date, language) {
  const [year, month, day] = date.split('-').map(Number);
  return formatter(localeOf(language), { weekday: 'long' }, 'UTC').format(
    new Date(Date.UTC(year, month - 1, day, 12)),
  );
}

export {
  isTimeZone,
  zoneOffset,
  zonedInstant,
  readTime,
  localDate,
  localNoon,
  addDays,
  formatTime,
  formatDayTime,
  formatDate,
  weekdayName,
};
