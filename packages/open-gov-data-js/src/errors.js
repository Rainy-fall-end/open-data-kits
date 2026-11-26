import { inspect } from 'node:util';

const CUSTOM_INSPECT = inspect.custom;

export class OpenGovDataError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'OpenGovDataError';
    Object.defineProperty(this, 'code', {
      value: code,
      enumerable: true,
      writable: false,
      configurable: false,
    });
    if (options.statusCode !== undefined) {
      Object.defineProperty(this, 'statusCode', {
        value: options.statusCode,
        enumerable: true,
        writable: false,
        configurable: false,
      });
    }
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      ...(this.statusCode === undefined ? {} : { statusCode: this.statusCode }),
    };
  }

  [CUSTOM_INSPECT]() {
    return `${this.name} ${inspect(this.toJSON(), { colors: false, compact: true })}`;
  }
}

export function safeError(error) {
  if (error instanceof OpenGovDataError) return error.toJSON();
  return Object.freeze({
    code: 'UNKNOWN_ERROR',
    message: 'Open Gov Data request failed',
  });
}
