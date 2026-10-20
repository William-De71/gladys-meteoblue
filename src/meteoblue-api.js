// -----------------------------------------------------------------------------
// meteoblue client: the Forecast API and the meteogram of the Image API.
//
// Documented requests only (https://my.meteoblue.com/packages/redoc and
// https://my.meteoblue.com/images/redoc):
//   GET https://my.meteoblue.com/packages/basic-1h_basic-day
//       ?lat&lon&apikey&format=json&tz=<IANA zone>
//   GET https://my.meteoblue.com/images/meteogram
//       ?lat&lon&apikey&format=png&lang&tz&location_name&temperature_units…
// Both are in the free Weather API trial. No unit is asked: the defaults (°C,
// m/s, degrees, mm) are what the parser expects, and it reads the `units` of
// the answer anyway. The key goes in the query string, as meteoblue requires:
// a URL is therefore never logged nor put in an error message.
//
// Errors are JSON `{ "error": true, "error_message": "…" }`. The messages
// seen and documented: 400 "Please specify an apikey…", 403 "Apikey was
// specified, but is not valid." (checked against the live API on
// 2026-10-20), 403 "Access to the image API expired for this user", 429
// "Available credits exceeded for this API key"; a daily credit limit set on
// the key also answers an error. They map to three classes the app reacts to:
//   - ApiKeyError     the key is missing, wrong, expired or needs a signature;
//   - QuotaError      meteoblue refused for credits or rate (its own count);
//   - BudgetExceededError  OUR cap: the year's credits are spent, no call made.
// Every successful call is counted in the credit budget (credits.js) with the
// cost meteoblue accounted (`MB-Credits-Accounted`).
// -----------------------------------------------------------------------------

const BASE = 'https://my.meteoblue.com';
const FORECAST_PACKAGES = 'basic-1h_basic-day';
const TIMEOUT_MS = 12 * 1000;
const MAX_METEOGRAM_BYTES = 500 * 1024;

class ApiKeyError extends Error {
  /**
   * @param {string} reason - 'missing', 'invalid', 'expired', 'signature' or
   * the meteoblue message.
   */
  constructor(reason) {
    super(`meteoblue refused the API key (${reason})`);
    this.name = 'ApiKeyError';
    this.reason = reason;
  }
}

class QuotaError extends Error {
  /** @param {string} message - The meteoblue message. */
  constructor(message) {
    super(`meteoblue refused the request for credits or rate: ${message}`);
    this.name = 'QuotaError';
  }
}

class BudgetExceededError extends Error {
  constructor() {
    super('The credits of the key year are spent: no call to meteoblue until the next key year');
    this.name = 'BudgetExceededError';
  }
}

class ApiError extends Error {
  /**
   * @param {number} status - HTTP status.
   * @param {string} message - The meteoblue message.
   */
  constructor(status, message) {
    super(`meteoblue answered ${status}: ${message}`);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * @description Round a coordinate to 3 decimals (about 100 m): enough for a
 * forecast whose finest model has a 700 m grid, and the house is not sent
 * more precisely than needed.
 * @param {number} value - Degrees.
 * @returns {number} The rounded value.
 * @example
 * roundCoordinate(48.85661); // -> 48.857
 */
function roundCoordinate(value) {
  return Math.round(value * 1000) / 1000;
}

/**
 * @description Classify a meteoblue error answer.
 * @param {number} status - HTTP status.
 * @param {string} message - `error_message` (may be empty).
 * @returns {Error} The error to throw.
 * @example
 * classifyError(403, 'Apikey was specified, but is not valid.'); // -> ApiKeyError
 */
function classifyError(status, message) {
  const text = message.toLowerCase();
  if (/credit|limit|too many|rate/.test(text) || status === 429) {
    return new QuotaError(message || `HTTP ${status}`);
  }
  if (/specify an apikey|apikey is missing|no apikey/.test(text)) {
    return new ApiKeyError('missing');
  }
  if (/signature|\bsig\b/.test(text)) {
    return new ApiKeyError('signature');
  }
  if (/expired/.test(text)) {
    return new ApiKeyError('expired');
  }
  if (/apikey|api key|not valid|invalid key/.test(text) || status === 401) {
    return new ApiKeyError('invalid');
  }
  if (status === 403) {
    // A forbidden package or area: say it as meteoblue does.
    return new ApiKeyError(message.slice(0, 60) || 'forbidden');
  }
  return new ApiError(status, message.slice(0, 200) || 'no message');
}

/**
 * @description Read an error answer without failing on a non-JSON body.
 * @param {Response} response - The fetch response.
 * @returns {Promise<string>} The `error_message`, or ''.
 */
async function errorMessageOf(response) {
  try {
    const body = await response.json();
    return typeof body?.error_message === 'string' ? body.error_message : '';
  } catch {
    return '';
  }
}

/**
 * @description The credits accounted for a call, from its header.
 * @param {Response} response - The fetch response.
 * @returns {number|null} The credits, or null when absent.
 */
function accountedOf(response) {
  const raw = response.headers?.get?.('mb-credits-accounted');
  const value = raw === null || raw === undefined ? NaN : Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * @description Create the meteoblue client.
 * @param {object} options - Options.
 * @param {Function} options.getApiKey - `() => string`.
 * @param {object} options.credits - The credits.js budget.
 * @param {Function} [options.fetchImpl] - `fetch`.
 * @param {object} [options.logger] - Logger.
 * @returns {object} `{ forecast, meteogram }`.
 * @example
 * const api = createMeteoblueApi({ getApiKey: () => key, credits });
 */
function createMeteoblueApi({ getApiKey, credits, fetchImpl = fetch, logger = console }) {
  /**
   * @description Send one request, counted in the budget.
   * @param {string} path - The path ("/packages/…", "/images/meteogram").
   * @param {object} params - Query parameters (the key is added here).
   * @param {string} kind - 'forecast', 'meteogram' or 'test'.
   * @returns {Promise<Response>} The successful response.
   */
  async function call(path, params, kind) {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new ApiKeyError('missing');
    }
    const cost = credits.costOf(kind === 'meteogram' ? 'meteogram' : 'forecast');
    if (!credits.canSpend(cost)) {
      throw new BudgetExceededError();
    }
    const url = new URL(path, BASE);
    Object.entries(params).forEach(([name, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(name, String(value));
      }
    });
    url.searchParams.set('apikey', apiKey);
    let response;
    try {
      response = await fetchImpl(url, {
        redirect: 'error',
        headers: { Accept: kind === 'meteogram' ? 'image/png' : 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      // The error of fetch (or its cause) can quote the URL, and the URL holds
      // the key: never pass it on, only its name and network code.
      const code = err.cause?.code ? `, ${err.cause.code}` : '';
      // eslint-disable-next-line preserve-caught-error -- the cause would leak the key
      throw new Error(
        `meteoblue unreachable (${err.name === 'TimeoutError' ? 'timeout' : err.name}${code})`,
      );
    }
    if (!response.ok) {
      throw classifyError(response.status, await errorMessageOf(response));
    }
    credits.record(kind, accountedOf(response));
    logger.debug?.(`meteoblue ${path} (${kind}) OK`);
    return response;
  }

  return {
    /**
     * @description The hourly and daily forecast of a place.
     * @param {number} latitude - Latitude.
     * @param {number} longitude - Longitude.
     * @param {object} [options] - { timeZone, kind }.
     * @returns {Promise<object>} The JSON answer.
     */
    async forecast(latitude, longitude, { timeZone = null, kind = 'forecast' } = {}) {
      const response = await call(
        `/packages/${FORECAST_PACKAGES}`,
        {
          lat: roundCoordinate(latitude),
          lon: roundCoordinate(longitude),
          format: 'json',
          tz: timeZone,
        },
        kind,
      );
      const body = await response.json();
      if (body?.error === true) {
        throw classifyError(response.status, String(body.error_message ?? ''));
      }
      if (!body || typeof body !== 'object' || !body.data_1h) {
        throw new ApiError(response.status, 'answer without hourly data');
      }
      return body;
    },

    /**
     * @description The 5-day meteogram picture of a place.
     * @param {number} latitude - Latitude.
     * @param {number} longitude - Longitude.
     * @param {object} [options] - { timeZone, language, units, name }.
     * @returns {Promise<Buffer>} The PNG bytes (meteoblue logo kept: it is the
     * attribution).
     */
    async meteogram(
      latitude,
      longitude,
      { timeZone = null, language = 'en', units = 'metric', name } = {},
    ) {
      const response = await call(
        '/images/meteogram',
        {
          lat: roundCoordinate(latitude),
          lon: roundCoordinate(longitude),
          format: 'png',
          lang: ['en', 'fr', 'de', 'es'].includes(language) ? language : 'en',
          tz: timeZone,
          location_name: typeof name === 'string' ? name.slice(0, 40) : undefined,
          temperature_units: units === 'us' ? 'F' : 'C',
          windspeed_units: units === 'us' ? 'mph' : 'kmh',
          precipitation_units: units === 'us' ? 'inch' : 'mm',
        },
        'meteogram',
      );
      const bytes = Buffer.from(await response.arrayBuffer());
      const isPng = bytes.length > 8 && bytes.readUInt32BE(0) === 0x89504e47;
      if (!isPng || bytes.length > MAX_METEOGRAM_BYTES) {
        throw new ApiError(response.status, `unexpected meteogram (${bytes.length} bytes)`);
      }
      return bytes;
    },
  };
}

export {
  BASE,
  FORECAST_PACKAGES,
  MAX_METEOGRAM_BYTES,
  ApiKeyError,
  QuotaError,
  BudgetExceededError,
  ApiError,
  roundCoordinate,
  classifyError,
  createMeteoblueApi,
};
