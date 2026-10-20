// A fake meteoblue (Forecast API, Image API and the pictogram host) behind a
// `fetch`, following the documented requests and error bodies. Tests never
// touch the network.

import { forecastAnswer } from './fixtures.js';

const API_KEY = 'mbTestKey0123456789';
// A valid 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
const silent = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * @description A fetch response.
 * @param {number} status - HTTP status.
 * @param {object|Buffer} body - JSON body, or bytes.
 * @param {object} [headers] - Headers.
 * @returns {object} The response.
 */
function response(status, body, headers = {}) {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]),
  );
  const bytes = Buffer.isBuffer(body) ? body : null;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => lower[name.toLowerCase()] ?? null },
    json: async () => {
      if (bytes) {
        throw new SyntaxError('not JSON');
      }
      return body;
    },
    arrayBuffer: async () =>
      bytes
        ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)
        : new ArrayBuffer(0),
  };
}

const error = (status, message) => response(status, { error_message: message, error: true });

/**
 * @description The fake meteoblue, as a `fetch`.
 * @param {object} [options] - { failure: { status, message } for every API
 * call, answer: () => forecast answer, credits: accounted header value }.
 * @returns {Function} The fetch, with `calls`, `failure` and `count()`.
 */
function fakeMeteoblue({ failure = null, answer = () => forecastAnswer(), credits = 8000 } = {}) {
  const calls = [];
  const impl = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.hostname === 'static.meteoblue.com') {
      return response(200, PNG);
    }
    if (url.hostname !== 'my.meteoblue.com') {
      throw new Error(`unexpected host ${url.hostname}`);
    }
    if (impl.failure) {
      return error(impl.failure.status, impl.failure.message);
    }
    const key = url.searchParams.get('apikey');
    if (!key) {
      return error(400, 'Please specify an apikey in the url: &apikey=1234');
    }
    if (key !== API_KEY) {
      return error(403, 'Apikey was specified, but is not valid.');
    }
    if (url.pathname === '/packages/basic-1h_basic-day') {
      return response(200, impl.answer(url), { 'MB-Credits-Accounted': impl.credits });
    }
    if (url.pathname === '/images/meteogram') {
      return response(200, PNG, { 'MB-Credits-Accounted': 16000, 'Content-Type': 'image/png' });
    }
    return error(404, 'Not found');
  };
  impl.calls = calls;
  impl.failure = failure;
  impl.answer = answer;
  impl.credits = credits;
  impl.count = (path) => calls.filter((url) => url.pathname === path).length;
  impl.forecasts = () => impl.count('/packages/basic-1h_basic-day');
  return impl;
}

export { API_KEY, PNG, silent, response, fakeMeteoblue };
