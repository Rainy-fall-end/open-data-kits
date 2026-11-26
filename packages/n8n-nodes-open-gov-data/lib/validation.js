'use strict';

const SECRET_FIELD_NAMES = new Set([
  'authorization',
  'token',
  'apikey',
  'apifytoken',
  'xrapidapikey',
  'rapidapikey',
  'credential',
  'credentials',
]);

function normalizedFieldName(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function rejectSecretFields(value, fail, seen = new Set()) {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) fail('INPUT_INVALID', 'Request Input must not be cyclic');
  seen.add(value);
  for (const [key, nested] of Object.entries(value)) {
    if (SECRET_FIELD_NAMES.has(normalizedFieldName(key))) {
      fail('INPUT_SECRET_FIELD', 'Request Input must not contain credential fields');
    }
    rejectSecretFields(nested, fail, seen);
  }
  seen.delete(value);
}

function rejectCredentialValue(value, secret, fail, seen = new Set()) {
  if (typeof value === 'string' && value.includes(secret)) {
    fail('INPUT_SECRET_VALUE', 'Request Input must not contain credential values');
  }
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) fail('INPUT_INVALID', 'Request Input must not be cyclic');
  seen.add(value);
  for (const nested of Object.values(value)) rejectCredentialValue(nested, secret, fail, seen);
  seen.delete(value);
}

function redactCredentialValue(value, secret) {
  if (typeof value === 'string') return value.split(secret).join('[REDACTED]');
  if (Array.isArray(value)) return value.map((nested) => redactCredentialValue(nested, secret));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, redactCredentialValue(nested, secret)]),
    );
  }
  return value;
}

function assertSchemaValue(value, schema, path, fail) {
  const label = path || 'Request Input';
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      fail('INPUT_SCHEMA_INVALID', `${label} must be an object`);
    }
    const properties = schema.properties || {};
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) {
          fail('INPUT_SCHEMA_INVALID', `${label} contains an unsupported field`);
        }
      }
    }
    for (const required of schema.required || []) {
      if (!Object.hasOwn(value, required)) fail('INPUT_SCHEMA_INVALID', `${label} is missing a required field`);
    }
    for (const [key, nested] of Object.entries(value)) {
      if (properties[key]) assertSchemaValue(nested, properties[key], `${label}.${key}`, fail);
    }
    return;
  }

  if (schema.type === 'array') {
    if (!Array.isArray(value)) fail('INPUT_SCHEMA_INVALID', `${label} must be an array`);
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      fail('INPUT_SCHEMA_INVALID', `${label} has too few items`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      fail('INPUT_SCHEMA_INVALID', `${label} has too many items`);
    }
    if (schema.items) {
      value.forEach((nested, index) => assertSchemaValue(nested, schema.items, `${label}[${index}]`, fail));
    }
    return;
  }

  if (schema.type === 'string') {
    if (typeof value !== 'string') fail('INPUT_SCHEMA_INVALID', `${label} must be a string`);
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      fail('INPUT_SCHEMA_INVALID', `${label} is too short`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      fail('INPUT_SCHEMA_INVALID', `${label} is too long`);
    }
    if (schema.pattern && !(new RegExp(schema.pattern)).test(value)) {
      fail('INPUT_SCHEMA_INVALID', `${label} has an invalid format`);
    }
  } else if (schema.type === 'integer') {
    if (!Number.isSafeInteger(value)) fail('INPUT_SCHEMA_INVALID', `${label} must be an integer`);
  } else if (schema.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      fail('INPUT_SCHEMA_INVALID', `${label} must be a finite number`);
    }
  } else if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') fail('INPUT_SCHEMA_INVALID', `${label} must be a boolean`);
  }

  if (schema.enum && !schema.enum.includes(value)) {
    fail('INPUT_SCHEMA_INVALID', `${label} is not an allowed value`);
  }
  if (schema.minimum !== undefined && value < schema.minimum) {
    fail('INPUT_SCHEMA_INVALID', `${label} is below its minimum`);
  }
  if (schema.maximum !== undefined && value > schema.maximum) {
    fail('INPUT_SCHEMA_INVALID', `${label} exceeds its maximum`);
  }
}

function jsonClone(value, fail) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    fail('INPUT_INVALID', 'Request Input must contain only JSON-compatible values');
  }
}

module.exports = {
  assertSchemaValue,
  jsonClone,
  redactCredentialValue,
  rejectCredentialValue,
  rejectSecretFields,
};
