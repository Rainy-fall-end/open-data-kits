import { SchemaValidationError } from './errors.js';

function fail(path, expectation) {
  throw new SchemaValidationError(`${path} ${expectation}`);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function matches(value, schema) {
  try {
    validateAgainstSchema(value, schema);
    return true;
  } catch (error) {
    if (error instanceof SchemaValidationError) return false;
    throw error;
  }
}

function validateType(value, type, path) {
  const valid = (
    (type === 'object' && isObject(value))
    || (type === 'array' && Array.isArray(value))
    || (type === 'string' && typeof value === 'string')
    || (type === 'number' && typeof value === 'number' && Number.isFinite(value))
    || (type === 'integer' && Number.isSafeInteger(value))
    || (type === 'boolean' && typeof value === 'boolean')
    || (type === 'null' && value === null)
  );
  if (!valid) fail(path, `must be of type ${type}`);
}

function validateDate(value, path) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(path, 'must be an RFC 3339 full-date');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    fail(path, 'must be a valid calendar date');
  }
}

export function validateAgainstSchema(value, schema, path = '$') {
  if (!isObject(schema)) throw new TypeError('Schema must be an object');
  if (schema.const !== undefined && !Object.is(value, schema.const)) {
    fail(path, 'must equal the required constant');
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => Object.is(item, value))) {
    fail(path, `must be one of: ${schema.enum.join(', ')}`);
  }
  if (Array.isArray(schema.allOf)) {
    for (const child of schema.allOf) validateAgainstSchema(value, child, path);
  }
  if (Array.isArray(schema.anyOf) && !schema.anyOf.some((child) => matches(value, child))) {
    fail(path, 'must match at least one allowed schema');
  }
  if (schema.if && matches(value, schema.if)) {
    if (schema.then) validateAgainstSchema(value, schema.then, path);
  } else if (schema.else) {
    validateAgainstSchema(value, schema.else, path);
  }
  if (schema.type) validateType(value, schema.type, path);

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      fail(path, `must contain at least ${schema.minLength} characters`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      fail(path, `must contain at most ${schema.maxLength} characters`);
    }
    if (schema.pattern !== undefined && !(new RegExp(schema.pattern, 'u')).test(value)) {
      fail(path, 'does not match the required pattern');
    }
    if (schema.format === 'date') validateDate(value, path);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (schema.minimum !== undefined && value < schema.minimum) {
      fail(path, `must be at least ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      fail(path, `must be at most ${schema.maximum}`);
    }
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
      fail(path, `must be greater than ${schema.exclusiveMinimum}`);
    }
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) {
      fail(path, `must be less than ${schema.exclusiveMaximum}`);
    }
    if (schema.multipleOf !== undefined) {
      const quotient = value / schema.multipleOf;
      if (Math.abs(quotient - Math.round(quotient)) > 1e-9) {
        fail(path, `must be a multiple of ${schema.multipleOf}`);
      }
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      fail(path, `must contain at least ${schema.minItems} items`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      fail(path, `must contain at most ${schema.maxItems} items`);
    }
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) {
      fail(path, 'must contain unique items');
    }
    if (schema.items) {
      value.forEach((item, index) => validateAgainstSchema(item, schema.items, `${path}[${index}]`));
    }
  }

  if (isObject(value)) {
    const properties = isObject(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
      if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, 'is required');
    }
    for (const [key, item] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) {
        validateAgainstSchema(item, properties[key], `${path}.${key}`);
      } else if (schema.additionalProperties === false) {
        fail(`${path}.${key}`, 'is not allowed');
      } else if (isObject(schema.additionalProperties)) {
        validateAgainstSchema(item, schema.additionalProperties, `${path}.${key}`);
      }
    }
  }
  return value;
}
