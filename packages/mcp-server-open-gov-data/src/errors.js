export class OpenGovError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'OpenGovError';
    this.code = code;
    if (Number.isInteger(options.statusCode)) this.statusCode = options.statusCode;
  }

  toJSON() {
    return safeError(this);
  }
}

export class SchemaValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SchemaValidationError';
    this.code = 'ARGUMENT_VALIDATION_FAILED';
  }
}

export function safeError(error) {
  if (error instanceof OpenGovError || error instanceof SchemaValidationError) {
    const result = { code: error.code, message: error.message };
    if (Number.isInteger(error.statusCode)) result.statusCode = error.statusCode;
    return result;
  }
  return { code: 'INTERNAL_ERROR', message: 'Internal server error' };
}
