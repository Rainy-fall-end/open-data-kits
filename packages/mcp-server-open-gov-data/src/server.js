import { createInterface } from 'node:readline';

import { createToolCatalog } from './catalog.js';
import { createConfig, MAX_REQUEST_BYTES } from './config.js';
import { OpenGovError, safeError, SchemaValidationError } from './errors.js';
import { executeTool } from './http.js';
import { validateAgainstSchema } from './validation.js';

export const SUPPORTED_PROTOCOL_VERSIONS = Object.freeze([
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
]);

const SERVER_INFO = Object.freeze({ name: 'mcp-server-open-gov-data', version: '0.2.0' });
const emptyObjectSchema = { type: 'object', additionalProperties: false };
const initializeSchema = {
  type: 'object',
  required: ['protocolVersion', 'capabilities', 'clientInfo'],
  properties: {
    protocolVersion: { type: 'string', minLength: 1, maxLength: 64 },
    capabilities: { type: 'object' },
    clientInfo: {
      type: 'object',
      required: ['name', 'version'],
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 200 },
        version: { type: 'string', minLength: 1, maxLength: 100 },
        title: { type: 'string', minLength: 1, maxLength: 200 },
      },
      additionalProperties: true,
    },
  },
  additionalProperties: true,
};
const toolsListSchema = {
  type: 'object',
  properties: { cursor: { type: 'string', minLength: 1, maxLength: 200 } },
  additionalProperties: false,
};
const toolsCallSchema = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 128 },
    arguments: { type: 'object' },
  },
  additionalProperties: false,
};

function response(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function errorResponse(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id, error };
}

function validId(value) {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
}

function toolErrorResult(error) {
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ error: safeError(error) }) }],
  };
}

export class McpServer {
  #config;
  #definitions;
  #definitionByName;
  #executor;
  #initialized = false;

  constructor(options = {}) {
    this.#config = options.config || createConfig(options.env);
    this.#definitions = createToolCatalog(this.#config);
    this.#definitionByName = new Map(this.#definitions.map((item) => [item.name, item]));
    this.#executor = options.executor || executeTool;
  }

  get tools() {
    return this.#definitions.map((definition) => definition.tool);
  }

  async handleMessage(message) {
    if (message === null || typeof message !== 'object' || Array.isArray(message)) {
      return errorResponse(null, -32600, 'Invalid Request');
    }
    const hasId = Object.hasOwn(message, 'id');
    const id = hasId && validId(message.id) ? message.id : null;
    if (
      message.jsonrpc !== '2.0'
      || typeof message.method !== 'string'
      || (hasId && !validId(message.id))
    ) {
      return errorResponse(id, -32600, 'Invalid Request');
    }

    const isNotification = !hasId;
    try {
      const result = await this.#dispatch(message.method, message.params);
      return isNotification ? null : response(message.id, result);
    } catch (error) {
      if (isNotification) return null;
      if (error instanceof SchemaValidationError) {
        return errorResponse(message.id, -32602, 'Invalid params', {
          code: error.code,
          message: error.message,
        });
      }
      if (error instanceof OpenGovError && error.code === 'METHOD_NOT_FOUND') {
        return errorResponse(message.id, -32601, 'Method not found');
      }
      if (error instanceof OpenGovError && error.code === 'NOT_INITIALIZED') {
        return errorResponse(message.id, -32002, 'Server not initialized');
      }
      return errorResponse(message.id, -32603, 'Internal error');
    }
  }

  async #dispatch(method, params) {
    if (method === 'initialize') {
      validateAgainstSchema(params, initializeSchema, '$.params');
      if (this.#initialized) {
        throw new SchemaValidationError('$.params initialize may only be called once');
      }
      this.#initialized = true;
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(params.protocolVersion)
        ? params.protocolVersion
        : SUPPORTED_PROTOCOL_VERSIONS[0];
      return {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: 'Twelve fixed read-only public-data tools. Every Apify call has a server-enforced charge cap.',
      };
    }

    if (method === 'notifications/initialized') {
      if (!this.#initialized) throw new OpenGovError('NOT_INITIALIZED', 'Server not initialized');
      if (params !== undefined) validateAgainstSchema(params, emptyObjectSchema, '$.params');
      return {};
    }
    if (method === 'ping') {
      if (params !== undefined) validateAgainstSchema(params, emptyObjectSchema, '$.params');
      return {};
    }
    if (!this.#initialized) {
      throw new OpenGovError('NOT_INITIALIZED', 'Server not initialized');
    }
    if (method === 'tools/list') {
      validateAgainstSchema(params ?? {}, toolsListSchema, '$.params');
      if (params?.cursor !== undefined) {
        throw new SchemaValidationError('$.params.cursor is not valid for this unpaginated catalog');
      }
      return { tools: this.tools };
    }
    if (method === 'tools/call') {
      validateAgainstSchema(params, toolsCallSchema, '$.params');
      const definition = this.#definitionByName.get(params.name);
      if (!definition) {
        throw new SchemaValidationError('$.params.name is not an allowlisted tool');
      }
      const args = params.arguments ?? {};
      validateAgainstSchema(args, definition.tool.inputSchema, '$.params.arguments');
      try {
        const payload = await this.#executor(definition, args, this.#config);
        return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
      } catch (error) {
        return toolErrorResult(error);
      }
    }
    throw new OpenGovError('METHOD_NOT_FOUND', 'Method not found');
  }
}

export async function runStdioServer(options = {}) {
  const input = options.input || process.stdin;
  const output = options.output || process.stdout;
  const server = options.server || new McpServer(options);
  const lines = createInterface({ input, crlfDelay: Infinity, terminal: false });
  for await (const line of lines) {
    if (line.trim() === '') continue;
    let reply;
    if (Buffer.byteLength(line, 'utf8') > MAX_REQUEST_BYTES) {
      reply = errorResponse(null, -32700, 'Parse error');
    } else {
      try {
        reply = await server.handleMessage(JSON.parse(line));
      } catch (error) {
        reply = error instanceof SyntaxError
          ? errorResponse(null, -32700, 'Parse error')
          : errorResponse(null, -32603, 'Internal error');
      }
    }
    if (reply !== null) output.write(`${JSON.stringify(reply)}\n`);
  }
}
