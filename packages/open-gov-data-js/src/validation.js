import { OpenGovDataError } from './errors.js';

export const MAX_ITEMS_LIMIT = 1_000;
export const MIN_TIMEOUT_MS = 100;
export const MAX_TIMEOUT_MS = 300_000;
export const MIN_CHARGE_USD = '0.00005';
export const MAX_CHARGE_USD = '100';
export const MAX_INPUT_BYTES = 1_000_000;
export const MAX_INPUT_DEPTH = 32;
export const MAX_RESPONSE_BYTES = 10_000_000;

const APIFY_TOKEN_PATTERN = /^apify_api_[A-Za-z0-9_-]{12,}$/;
const RAPIDAPI_KEY_PATTERN = /^[A-Za-z0-9_-]{20,256}$/;
const SECRET_KEYS = new Set([
  'apikey',
  'apifyapikey',
  'apifytoken',
  'authorization',
  'credential',
  'password',
  'proxysecret',
  'rapidapikey',
  'secret',
  'token',
  'xrapidapikey',
  'xrapidapiproxysecret',
]);
const ENCODER = new TextEncoder();

function fail(code, message) {
  return new OpenGovDataError(code, message);
}

function decimalParts(value) {
  const text = typeof value === 'number' ? String(value) : value;
  if (typeof text !== 'string' || text.length === 0 || text.length > 100 || text !== text.trim()) {
    throw fail(
      'COST_LIMIT_INVALID',
      `maxTotalChargeUsd must be from ${MIN_CHARGE_USD} to ${MAX_CHARGE_USD}`,
    );
  }
  const match = /^(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match) {
    throw fail(
      'COST_LIMIT_INVALID',
      `maxTotalChargeUsd must be from ${MIN_CHARGE_USD} to ${MAX_CHARGE_USD}`,
    );
  }
  const exponent = Number(match[3] || 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100) {
    throw fail(
      'COST_LIMIT_INVALID',
      `maxTotalChargeUsd must be from ${MIN_CHARGE_USD} to ${MAX_CHARGE_USD}`,
    );
  }
  let coefficient = BigInt(`${match[1]}${match[2] || ''}`);
  let scale = (match[2] || '').length - exponent;
  if (scale < 0) {
    coefficient *= 10n ** BigInt(-scale);
    scale = 0;
  }
  while (scale > 0 && coefficient % 10n === 0n) {
    coefficient /= 10n;
    scale -= 1;
  }
  return { coefficient, scale };
}

function decimalText(parts) {
  const digits = parts.coefficient.toString();
  if (parts.scale === 0) return digits;
  if (digits.length > parts.scale) {
    return `${digits.slice(0, -parts.scale)}.${digits.slice(-parts.scale)}`;
  }
  return `0.${'0'.repeat(parts.scale - digits.length)}${digits}`;
}

function compareDecimals(left, right) {
  const leftParts = decimalParts(left);
  const rightParts = decimalParts(right);
  const scale = Math.max(leftParts.scale, rightParts.scale);
  const leftValue = leftParts.coefficient * 10n ** BigInt(scale - leftParts.scale);
  const rightValue = rightParts.coefficient * 10n ** BigInt(scale - rightParts.scale);
  return leftValue === rightValue ? 0 : leftValue < rightValue ? -1 : 1;
}

export function validateCredential(provider, value) {
  if (provider !== 'apify' && provider !== 'rapidapi') {
    throw fail('PROVIDER_NOT_ALLOWED', 'Provider is not allowed');
  }
  const label = provider === 'apify' ? 'Apify credential' : 'RapidAPI credential';
  if (typeof value !== 'string' || value.length === 0) {
    throw fail('AUTH_MISSING', `${label} is required`);
  }
  const pattern = provider === 'apify' ? APIFY_TOKEN_PATTERN : RAPIDAPI_KEY_PATTERN;
  if (value !== value.trim() || /\s/u.test(value) || !pattern.test(value)) {
    throw fail('AUTH_INVALID', `${label} has an invalid format`);
  }
  return value;
}

export function validateMaxItems(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_ITEMS_LIMIT) {
    throw fail(
      'MAX_ITEMS_INVALID',
      `maxItems must be an integer from 1 to ${MAX_ITEMS_LIMIT}`,
    );
  }
  return value;
}

export function validateTimeoutMs(value) {
  if (!Number.isSafeInteger(value) || value < MIN_TIMEOUT_MS || value > MAX_TIMEOUT_MS) {
    throw fail(
      'TIMEOUT_INVALID',
      `timeoutMs must be an integer from ${MIN_TIMEOUT_MS} to ${MAX_TIMEOUT_MS}`,
    );
  }
  return value;
}

export function validateMaxTotalChargeUsd(value) {
  if ((typeof value !== 'string' && typeof value !== 'number') || typeof value === 'boolean') {
    throw fail(
      'COST_LIMIT_INVALID',
      `maxTotalChargeUsd must be from ${MIN_CHARGE_USD} to ${MAX_CHARGE_USD}`,
    );
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw fail(
      'COST_LIMIT_INVALID',
      `maxTotalChargeUsd must be from ${MIN_CHARGE_USD} to ${MAX_CHARGE_USD}`,
    );
  }
  const parts = decimalParts(value);
  const normalized = decimalText(parts);
  if (compareDecimals(normalized, MIN_CHARGE_USD) < 0 || compareDecimals(normalized, MAX_CHARGE_USD) > 0) {
    throw fail(
      'COST_LIMIT_INVALID',
      `maxTotalChargeUsd must be from ${MIN_CHARGE_USD} to ${MAX_CHARGE_USD}`,
    );
  }
  return normalized;
}

export function compareMaxTotalChargeUsd(left, right) {
  return compareDecimals(
    validateMaxTotalChargeUsd(left),
    validateMaxTotalChargeUsd(right),
  );
}

function normalizedKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]/gu, '');
}

function cloneJson(value, depth, active) {
  if (depth > MAX_INPUT_DEPTH) {
    throw fail('INPUT_INVALID', 'Request input is nested too deeply');
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw fail('INPUT_INVALID', 'Request input contains a non-finite number');
    }
    return value;
  }
  if (typeof value !== 'object') {
    throw fail('INPUT_INVALID', 'Request input must contain only JSON values');
  }
  if (active.has(value)) throw fail('INPUT_INVALID', 'Request input must not be cyclic');
  active.add(value);
  try {
    if (Array.isArray(value)) {
      const clone = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
          throw fail('INPUT_INVALID', 'Request input arrays must contain JSON values');
        }
        clone.push(cloneJson(descriptor.value, depth + 1, active));
      }
      const extraKeys = Object.keys(value).filter((key) => !/^(0|[1-9]\d*)$/.test(key));
      if (extraKeys.length > 0 || Object.getOwnPropertySymbols(value).length > 0) {
        throw fail('INPUT_INVALID', 'Request input arrays must contain only JSON values');
      }
      return clone;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw fail('INPUT_INVALID', 'Request input must contain only JSON values');
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw fail('INPUT_INVALID', 'Request input keys must be strings');
    }
    const clone = {};
    for (const key of Object.getOwnPropertyNames(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
        throw fail('INPUT_INVALID', 'Request input must contain only JSON values');
      }
      if (SECRET_KEYS.has(normalizedKey(key))) {
        throw fail('INPUT_SECRET_FIELD', 'Request input must not contain credential fields');
      }
      Object.defineProperty(clone, key, {
        value: cloneJson(descriptor.value, depth + 1, active),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return clone;
  } finally {
    active.delete(value);
  }
}

export function parseInput(value) {
  let parsed = value;
  if (typeof value === 'string') {
    if (ENCODER.encode(value).byteLength > MAX_INPUT_BYTES) {
      throw fail('INPUT_INVALID', 'Request input is too large');
    }
    try {
      parsed = JSON.parse(value);
    } catch {
      throw fail('INPUT_INVALID', 'Request input must be valid JSON');
    }
  }
  if (parsed === undefined || parsed === null) return {};
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw fail('INPUT_INVALID', 'Request input must be a JSON object');
  }
  const clone = cloneJson(parsed, 0, new Set());
  let encoded;
  try {
    encoded = ENCODER.encode(JSON.stringify(clone));
  } catch {
    throw fail('INPUT_INVALID', 'Request input must contain valid JSON');
  }
  if (encoded.byteLength > MAX_INPUT_BYTES) {
    throw fail('INPUT_INVALID', 'Request input is too large');
  }
  return clone;
}

export function rapidApiQueryValue(value) {
  if (value === null || value === '') return null;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) {
    const values = value.map((item) => {
      if (item === null || Array.isArray(item) || typeof item === 'object') {
        throw fail('INPUT_INVALID', 'RapidAPI query arrays must contain scalar values');
      }
      const serialized = rapidApiQueryValue(item);
      if (serialized === null) {
        throw fail('INPUT_INVALID', 'RapidAPI query arrays must contain scalar values');
      }
      return serialized;
    });
    return values.length === 0 ? null : values.join(',');
  }
  throw fail('INPUT_INVALID', 'RapidAPI query values must be scalar or arrays');
}

function typeMatches(value, expected) {
  if (expected === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (expected === 'array') return Array.isArray(value);
  if (expected === 'integer') return Number.isSafeInteger(value);
  if (expected === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (expected === 'null') return value === null;
  return typeof value === expected;
}

function schemaFail(path, message) {
  throw fail('INPUT_SCHEMA_INVALID', `${path} ${message}`);
}

/** Validate the JSON Schema subset used by the shipped Actor and RapidAPI contracts. */
export function validateAgainstSchema(value, schema, options = {}, path = '$') {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new TypeError('Schema must be an object');
  }
  if (schema.type !== undefined && !typeMatches(value, schema.type)) {
    schemaFail(path, `must be ${schema.type}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => Object.is(item, value))) {
    schemaFail(path, `must be one of: ${schema.enum.join(', ')}`);
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      schemaFail(path, `must contain at least ${schema.minLength} characters`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      schemaFail(path, `must contain at most ${schema.maxLength} characters`);
    }
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      schemaFail(path, `must be at least ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      schemaFail(path, `must be at most ${schema.maximum}`);
    }
  }
  if (Array.isArray(value) && schema.items !== undefined) {
    value.forEach((item, index) => validateAgainstSchema(item, schema.items, options, `${path}[${index}]`));
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const properties = schema.properties || {};
    for (const required of schema.required || []) {
      if (!Object.hasOwn(value, required)) schemaFail(`${path}.${required}`, 'is required');
    }
    for (const [key, item] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) {
        validateAgainstSchema(item, properties[key], options, `${path}.${key}`);
      } else if (options.rejectUnknown === true || schema.additionalProperties === false) {
        schemaFail(`${path}.${key}`, 'is not an allowed property');
      }
    }
  }
  return value;
}
