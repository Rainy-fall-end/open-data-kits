import assert from 'node:assert/strict';
import test from 'node:test';

import { createConfig, McpServer } from '../src/index.js';

const initialize = {
  jsonrpc: '2.0',
  id: 'init',
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'unit-client', version: '1' },
  },
};

test('MCP lifecycle implements initialize, initialized notification, ping, and tools/list', async () => {
  const server = new McpServer({ config: createConfig({}) });
  assert.deepEqual(await server.handleMessage({
    jsonrpc: '2.0', id: 0, method: 'tools/list', params: {},
  }), {
    jsonrpc: '2.0', id: 0, error: { code: -32002, message: 'Server not initialized' },
  });

  const initialized = await server.handleMessage(initialize);
  assert.equal(initialized.result.protocolVersion, '2024-11-05');
  assert.deepEqual(initialized.result.capabilities, { tools: { listChanged: false } });
  assert.equal(await server.handleMessage({
    jsonrpc: '2.0', method: 'notifications/initialized', params: {},
  }), null);
  assert.deepEqual(await server.handleMessage({
    jsonrpc: '2.0', id: 2, method: 'ping', params: {},
  }), { jsonrpc: '2.0', id: 2, result: {} });
  const listed = await server.handleMessage({
    jsonrpc: '2.0', id: 3, method: 'tools/list', params: {},
  });
  assert.equal(listed.result.tools.length, 8);
});

test('tools/call validates arguments before executing and produces text content', async () => {
  const calls = [];
  const server = new McpServer({
    config: createConfig({}),
    executor: async (definition, args) => {
      calls.push({ name: definition.name, args });
      return { ok: true, source: definition.source };
    },
  });
  await server.handleMessage(initialize);

  const invalid = await server.handleMessage({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'rapidapi_openfda_records', arguments: { limit: 21 } },
  });
  assert.equal(invalid.error.code, -32602);
  assert.equal(invalid.error.data.code, 'ARGUMENT_VALIDATION_FAILED');
  assert.equal(calls.length, 0);

  const valid = await server.handleMessage({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'rapidapi_openfda_records',
      arguments: { dataset: 'device_recall', limit: 2 },
    },
  });
  assert.deepEqual(JSON.parse(valid.result.content[0].text), { ok: true, source: 'openFda' });
  assert.deepEqual(calls, [{
    name: 'rapidapi_openfda_records',
    args: { dataset: 'device_recall', limit: 2 },
  }]);
});

test('invalid requests and unknown methods return JSON-RPC standard errors', async () => {
  const server = new McpServer({ config: createConfig({}) });
  assert.equal((await server.handleMessage(null)).error.code, -32600);
  assert.equal((await server.handleMessage({ jsonrpc: '2.0', id: true, method: 'ping' })).error.code, -32600);
  await server.handleMessage(initialize);
  const missing = await server.handleMessage({ jsonrpc: '2.0', id: 9, method: 'unknown' });
  assert.deepEqual(missing, {
    jsonrpc: '2.0', id: 9, error: { code: -32601, message: 'Method not found' },
  });
});
