'use strict';

const { getSourceDefinition } = require('./catalog.js');
const {
  assertSchemaValue,
  jsonClone,
  redactCredentialValue,
  rejectCredentialValue,
  rejectSecretFields,
} = require('./validation.js');

const APIFY_BASE_URL = 'https://api.apify.com';
const DEFAULT_MAX_TOTAL_CHARGE_USD = 0.25;
const MAX_TOTAL_CHARGE_USD = 0.25;
const MIN_TOTAL_CHARGE_USD = 0.00005;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 300000;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

class OpenGovDataError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'OpenGovDataError';
    this.code = code;
    if (options.statusCode !== undefined) this.statusCode = options.statusCode;
  }

  toJSON() {
    return safeError(this);
  }
}

function fail(code, message, options) {
  throw new OpenGovDataError(code, message, options);
}

function validateCredential(provider, value) {
  const label = provider === 'apify' ? 'Apify credential' : 'RapidAPI credential';
  if (typeof value !== 'string' || value.length === 0) fail('AUTH_MISSING', `${label} is required`);
  if (value !== value.trim() || /\s/.test(value)) fail('AUTH_INVALID', `${label} has an invalid format`);
  const valid = provider === 'apify'
    ? /^apify_api_[A-Za-z0-9_-]{12,}$/.test(value)
    : /^[A-Za-z0-9_-]{20,}$/.test(value);
  if (!valid) fail('AUTH_INVALID', `${label} has an invalid format`);
  return value;
}

function validateProviderAndSource(provider, source) {
  if (provider !== 'apify' && provider !== 'rapidapi') {
    fail('PROVIDER_NOT_ALLOWED', 'Provider is not allowed');
  }
  const definition = getSourceDefinition(provider, source);
  if (!definition) fail('SOURCE_NOT_ALLOWED', 'Source is not allowed');
  return definition;
}

function parseInput(value) {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      fail('INPUT_INVALID', 'Request Input must be valid JSON');
    }
  }
  if (parsed === undefined || parsed === null) return {};
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail('INPUT_INVALID', 'Request Input must be a JSON object');
  }
  rejectSecretFields(parsed, fail);
  return jsonClone(parsed, fail);
}

function validateMaxTotalChargeUsd(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < MIN_TOTAL_CHARGE_USD || number > MAX_TOTAL_CHARGE_USD) {
    fail(
      'COST_LIMIT_INVALID',
      `Max Total Charge USD must be between ${MIN_TOTAL_CHARGE_USD} and ${MAX_TOTAL_CHARGE_USD}`,
    );
  }
  return number;
}

function validateTimeout(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < MIN_TIMEOUT_MS || number > MAX_TIMEOUT_MS) {
    fail('TIMEOUT_INVALID', `Timeout must be an integer from ${MIN_TIMEOUT_MS} to ${MAX_TIMEOUT_MS} milliseconds`);
  }
  return number;
}

function validateAndBoundInput(provider, definition, requestInput, maxItems) {
  const input = { ...requestInput };
  if (provider === 'rapidapi') {
    delete input.maxItems;
    input.limit = Number(maxItems);
  } else {
    input.maxItems = Number(maxItems);
  }
  assertSchemaValue(input, definition.inputSchema, 'Request Input', fail);
  return input;
}

function appendQuery(url, input) {
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) url.searchParams.set(key, value.join(','));
    else url.searchParams.set(key, String(value));
  }
}

function validateLoopbackBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail('TEST_ENDPOINT_INVALID', 'Test endpoint override must be a valid URL');
  }
  const hostAllowed = url.hostname === '127.0.0.1'
    || url.hostname === '::1'
    || url.hostname === '[::1]'
    || url.hostname === 'localhost';
  if (!hostAllowed || url.protocol !== 'http:' || url.username || url.password || url.pathname !== '/') {
    fail('TEST_ENDPOINT_INVALID', 'Test endpoint override must be an uncredentialed loopback HTTP origin');
  }
  return url.origin;
}

function resolveBaseUrl(provider, definition, endpointOverrides, allowTestEndpointOverrides) {
  const override = provider === 'apify'
    ? endpointOverrides?.apifyBaseUrl
    : endpointOverrides?.rapidApiBaseUrl;
  if (override !== undefined) {
    if (allowTestEndpointOverrides !== true) {
      fail('TEST_ENDPOINT_FORBIDDEN', 'Endpoint overrides are disabled');
    }
    return validateLoopbackBaseUrl(override);
  }
  return provider === 'apify' ? APIFY_BASE_URL : `https://${definition.host}`;
}

function buildRequest({
  provider,
  definition,
  input,
  maxTotalChargeUsd,
  credential,
  endpointOverrides,
  allowTestEndpointOverrides,
}) {
  const base = resolveBaseUrl(provider, definition, endpointOverrides, allowTestEndpointOverrides);
  if (provider === 'apify') {
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
        body: JSON.stringify(input),
      },
    };
  }

  const url = new URL(definition.path, base);
  appendQuery(url, input);
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

async function readLimitedText(response) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    await response.body?.cancel?.().catch(() => {});
    fail('RESPONSE_TOO_LARGE', 'Upstream response exceeded the size limit');
  }
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) {
      fail('RESPONSE_TOO_LARGE', 'Upstream response exceeded the size limit');
    }
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => {});
      fail('RESPONSE_TOO_LARGE', 'Upstream response exceeded the size limit');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total).toString('utf8');
}

async function fetchJson(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    if (!response || typeof response.status !== 'number') {
      fail('NETWORK_ERROR', 'Upstream returned an invalid HTTP response');
    }
    if (!response.ok) {
      await response.body?.cancel?.().catch(() => {});
      fail(`HTTP_${response.status}`, `Upstream request failed with HTTP ${response.status}`, {
        statusCode: response.status,
      });
    }
    if (response.status === 204) return null;
    const text = await readLimitedText(response);
    if (text.length === 0) return null;
    try {
      return JSON.parse(text);
    } catch {
      fail('RESPONSE_INVALID', 'Upstream returned invalid JSON');
    }
  } catch (error) {
    if (error instanceof OpenGovDataError) throw error;
    if (controller.signal.aborted || error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      fail('TIMEOUT', 'Upstream request timed out');
    }
    fail('NETWORK_ERROR', 'Upstream network request failed');
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
    maxTotalChargeUsd = DEFAULT_MAX_TOTAL_CHARGE_USD,
    timeoutMs = 30000,
    fetchImpl = globalThis.fetch,
    endpointOverrides,
    allowTestEndpointOverrides = false,
  } = options || {};
  const definition = validateProviderAndSource(provider, source);
  const parsedInput = parseInput(requestInput);
  const timeout = validateTimeout(timeoutMs);
  const secret = validateCredential(provider, provider === 'apify' ? credentials?.token : credentials?.apiKey);
  rejectCredentialValue(parsedInput, secret, fail);
  const boundedInput = validateAndBoundInput(provider, definition, parsedInput, maxItems);
  const costLimit = provider === 'apify' ? validateMaxTotalChargeUsd(maxTotalChargeUsd) : undefined;
  if (typeof fetchImpl !== 'function') fail('NETWORK_ERROR', 'Fetch implementation is unavailable');
  const request = buildRequest({
    provider,
    definition,
    input: boundedInput,
    maxTotalChargeUsd: costLimit,
    credential: secret,
    endpointOverrides,
    allowTestEndpointOverrides,
  });
  const payload = await fetchJson(fetchImpl, request.url, request.options, timeout);
  return redactCredentialValue(payload, secret);
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
  DEFAULT_MAX_TOTAL_CHARGE_USD,
  MAX_RESPONSE_BYTES,
  MAX_TOTAL_CHARGE_USD,
  OpenGovDataError,
  executeRequest,
  extractRecords,
  parseInput,
  safeError,
  validateCredential,
  validateLoopbackBaseUrl,
  validateMaxTotalChargeUsd,
};
