import { OpenGovError } from './errors.js';

export const USD_SCALE = 1_000_000;
export const DEFAULT_MAX_TOTAL_CHARGE_MICROS = 250_000;
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const MAX_REQUEST_BYTES = 1024 * 1024;

const MAX_HARD_CHARGE_MICROS = 100 * USD_SCALE;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '[::1]', 'localhost']);

function configError(message) {
  return new OpenGovError('CONFIG_INVALID', message);
}

export function parseUsdMicros(value, label = 'charge limit') {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) throw configError(`${label} must be a positive amount`);
    const scaled = value * USD_SCALE;
    if (!Number.isSafeInteger(scaled)) {
      throw configError(`${label} must use at most six decimal places`);
    }
    return scaled;
  }
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value)) {
    throw configError(`${label} must be a positive decimal with at most six decimal places`);
  }
  const [whole, fraction = ''] = value.split('.');
  const micros = (BigInt(whole) * BigInt(USD_SCALE))
    + BigInt(fraction.padEnd(6, '0'));
  if (micros <= 0n || micros > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw configError(`${label} is outside the supported range`);
  }
  return Number(micros);
}

export function formatUsdMicros(micros) {
  const whole = Math.floor(micros / USD_SCALE);
  const fraction = String(micros % USD_SCALE).padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

function validateCredential(value) {
  if (value === undefined || value === '') return undefined;
  if (
    typeof value !== 'string'
    || value.length < 8
    || value.length > 512
    || value.trim() !== value
    || /[\u0000-\u0020\u007f]/.test(value)
  ) {
    throw configError('A configured credential is invalid');
  }
  return value;
}

function parseIntegerSetting(value, fallback, minimum, maximum, label) {
  if (value === undefined || value === '') return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw configError(`${label} must be an integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw configError(`${label} is outside the supported range`);
  }
  return parsed;
}

function validateTestBaseUrl(value, label, env) {
  if (value === undefined || value === '') return undefined;
  if (env.NODE_ENV !== 'test') throw configError(`${label} is available only when NODE_ENV=test`);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw configError(`${label} must be a loopback URL`);
  }
  const rootOnly = url.pathname === '/' && !url.search && !url.hash;
  const valid = (
    url.protocol === 'http:'
    && LOOPBACK_HOSTS.has(url.hostname)
    && url.port.length > 0
    && !url.username
    && !url.password
    && rootOnly
  );
  if (!valid) throw configError(`${label} must be an HTTP loopback origin with an explicit port`);
  return url.origin;
}

export function createConfig(env = process.env) {
  if (env === null || typeof env !== 'object' || Array.isArray(env)) {
    throw configError('Environment must be an object');
  }
  const hardChargeMicros = parseUsdMicros(
    env.MCP_APIFY_MAX_TOTAL_CHARGE_USD || '0.25',
    'MCP_APIFY_MAX_TOTAL_CHARGE_USD',
  );
  if (hardChargeMicros > MAX_HARD_CHARGE_MICROS) {
    throw configError('MCP_APIFY_MAX_TOTAL_CHARGE_USD cannot exceed 100 USD');
  }
  const defaultChargeMicros = Math.min(
    DEFAULT_MAX_TOTAL_CHARGE_MICROS,
    hardChargeMicros,
  );

  return Object.freeze({
    apifyToken: validateCredential(env.APIFY_TOKEN),
    rapidApiKey: validateCredential(
      env.RAPIDAPI_KEY || env.X_RAPIDAPI_KEY || env['X-RapidAPI-Key'],
    ),
    hardChargeMicros,
    defaultChargeMicros,
    timeoutMs: parseIntegerSetting(
      env.MCP_HTTP_TIMEOUT_MS,
      30_000,
      100,
      120_000,
      'MCP_HTTP_TIMEOUT_MS',
    ),
    apifyBaseUrl: validateTestBaseUrl(
      env.MCP_TEST_APIFY_BASE_URL,
      'MCP_TEST_APIFY_BASE_URL',
      env,
    ),
    rapidApiBaseUrl: validateTestBaseUrl(
      env.MCP_TEST_RAPIDAPI_BASE_URL,
      'MCP_TEST_RAPIDAPI_BASE_URL',
      env,
    ),
  });
}
