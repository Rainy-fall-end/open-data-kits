'use strict';

const { SOURCES } = require('./catalog.js');

const APIFY_BASE_URL = 'https://api.apify.com';
const MAX_ITEMS_LIMIT = 1000;
const MAX_CHARGE_LIMIT_USD = 100;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 300000;
const SECRET_FIELD_NAMES = new Set([
  'authorization',
  'token',
  'apifytoken',
  'apify_token',
  'x-rapidapi-key',
  'xrapidapikey',
  'rapidapikey',
]);

class OpenGovDataError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'OpenGovDataError';
    this.code = code;
    if (options.statusCode !== undefined) this.statusCode = options.statusCode;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

function validateCredential(provider, value) {
  const label = provider === 'apify' ? 'Apify credential' : 'RapidAPI credential';
  if (typeof value !== 'string' || value.length === 0) {
    throw new OpenGovDataError('AUTH_MISSING', `${label} is required`);
  }
  if (value !== value.trim() || /\s/.test(value)) {
    throw new OpenGovDataError('AUTH_INVALID', `${label} has an invalid format`);
  }

  const valid = provider === 'apify'
    ? /^apify_api_[A-Za-z0-9_-]{12,}$/.test(value)
    : /^[A-Za-z0-9_-]{20,}$/.test(value);
  if (!valid) throw new OpenGovDataError('AUTH_INVALID', `${label} has an invalid format`);
  return value;
}

function validateProviderAndSource(provider, source) {
  if (provider !== 'apify' && provider !== 'rapidapi') {
    throw new OpenGovDataError('PROVIDER_NOT_ALLOWED', 'Provider is not allowed');
  }
  const definition = SOURCES[provider][source];
  if (!definition) throw new OpenGovDataError('SOURCE_NOT_ALLOWED', 'Source is not allowed');
  return definition;
}

function parseInput(value) {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new OpenGovDataError('INPUT_INVALID', 'Request Input must be valid JSON');
    }
  }
  if (parsed === undefined || parsed === null) return {};
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new OpenGovDataError('INPUT_INVALID', 'Request Input must be a JSON object');
  }
  rejectSecretFields(parsed);
  return structuredClone(parsed);
}

function rejectSecretFields(value, seen = new Set()) {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) throw new OpenGovDataError('INPUT_INVALID', 'Request Input must not be cyclic');
  seen.add(value);
  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.toLowerCase().replaceAll('_', '').replaceAll('-', '');
    if (SECRET_FIELD_NAMES.has(key.toLowerCase()) || SECRET_FIELD_NAMES.has(normalized)) {
      throw new OpenGovDataError('INPUT_SECRET_FIELD', 'Request Input must not contain credential fields');
    }
    rejectSecretFields(nested, seen);
  }
  seen.delete(value);
}

function validateMaxItems(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > MAX_ITEMS_LIMIT) {
    throw new OpenGovDataError('MAX_ITEMS_INVALID', `Max Items must be an integer from 1 to ${MAX_ITEMS_LIMIT}`);
  }
  return number;
}

function validateMaxTotalChargeUsd(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0.00005 || number > MAX_CHARGE_LIMIT_USD) {
    throw new OpenGovDataError(
      'COST_LIMIT_INVALID',
      `Max Total Charge USD must be between 0.00005 and ${MAX_CHARGE_LIMIT_USD}`,
    );
  }
  return number;
}

function validateTimeout(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < MIN_TIMEOUT_MS || number > MAX_TIMEOUT_MS) {
    throw new OpenGovDataError(
      'TIMEOUT_INVALID',
      `Timeout must be an integer from ${MIN_TIMEOUT_MS} to ${MAX_TIMEOUT_MS} milliseconds`,
    );
  }
  return number;
}

function appendQuery(url, input) {
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) url.searchParams.set(key, value.join(','));
    else if (typeof value === 'object') url.searchParams.set(key, JSON.stringify(value));
    else url.searchParams.set(key, String(value));
  }
}

function buildRequest({ provider, definition, input, maxItems, maxTotalChargeUsd, credential, endpointOverrides }) {
  if (provider === 'apify') {
    const base = endpointOverrides?.apifyBaseUrl || APIFY_BASE_URL;
    const url = new URL(`/v2/acts/${definition.actorId}/run-sync-get-dataset-items`, base);
    url.searchParams.set('maxTotalChargeUsd', String(maxTotalChargeUsd));
    url.searchParams.set('clean', 'true');
    return {
      url,
      options: {
        method: 'POST',
        redirect: 'error',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${credential}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ ...input, maxItems }),
      },
    };
  }

  const base = endpointOverrides?.rapidApiBaseUrl || `https://${definition.host}`;
  const url = new URL(definition.path, base);
  appendQuery(url, { ...input, maxItems });
  return {
    url,
    options: {
      method: 'GET',
      redirect: 'error',
      headers: {
        accept: 'application/json',
        'x-rapidapi-host': definition.host,
        'x-rapidapi-key': credential,
      },
    },
  };
}

async function fetchJson(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    if (!response || typeof response.status !== 'number') {
      throw new OpenGovDataError('NETWORK_ERROR', 'Upstream returned an invalid HTTP response');
    }
    if (!response.ok) {
      await response.body?.cancel?.().catch(() => {});
      throw new OpenGovDataError(`HTTP_${response.status}`, `Upstream request failed with HTTP ${response.status}`, {
        statusCode: response.status,
      });
    }
    if (response.status === 204) return null;
    const text = await response.text();
    if (text.length === 0) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new OpenGovDataError('RESPONSE_INVALID', 'Upstream returned invalid JSON');
    }
  } catch (error) {
    if (error instanceof OpenGovDataError) throw error;
    if (controller.signal.aborted || error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      throw new OpenGovDataError('TIMEOUT', 'Upstream request timed out');
    }
    throw new OpenGovDataError('NETWORK_ERROR', 'Upstream network request failed');
  } finally {
    clearTimeout(timer);
  }
}

async function executeRequest(options) {
  const {
    provider,
    source,
    credentials,
    requestInput = {},
    maxItems = 10,
    maxTotalChargeUsd = 0.25,
    timeoutMs = 30000,
    fetchImpl = globalThis.fetch,
    endpointOverrides,
  } = options || {};
  const definition = validateProviderAndSource(provider, source);
  const input = parseInput(requestInput);
  const itemLimit = validateMaxItems(maxItems);
  const timeout = validateTimeout(timeoutMs);
  const secret = validateCredential(provider, provider === 'apify' ? credentials?.token : credentials?.apiKey);
  const costLimit = provider === 'apify' ? validateMaxTotalChargeUsd(maxTotalChargeUsd) : undefined;
  if (typeof fetchImpl !== 'function') throw new OpenGovDataError('NETWORK_ERROR', 'Fetch implementation is unavailable');
  const { url, options: requestOptions } = buildRequest({
    provider,
    definition,
    input,
    maxItems: itemLimit,
    maxTotalChargeUsd: costLimit,
    credential: secret,
    endpointOverrides,
  });
  return fetchJson(fetchImpl, url, requestOptions, timeout);
}

function extractRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    for (const key of ['items', 'results', 'records', 'data']) {
      if (Array.isArray(payload[key])) return payload[key];
    }
    return [payload];
  }
  if (payload === null || payload === undefined) return [];
  return [{ value: payload }];
}

function safeError(error) {
  if (error instanceof OpenGovDataError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.statusCode === undefined ? {} : { statusCode: error.statusCode }),
    };
  }
  return { code: 'UNKNOWN_ERROR', message: 'Open Gov Data request failed' };
}

module.exports = {
  MAX_CHARGE_LIMIT_USD,
  MAX_ITEMS_LIMIT,
  OpenGovDataError,
  executeRequest,
  extractRecords,
  parseInput,
  safeError,
  validateCredential,
  validateMaxTotalChargeUsd,
};
