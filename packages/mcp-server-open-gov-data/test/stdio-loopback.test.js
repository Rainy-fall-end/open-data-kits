import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_RESPONSE_BYTES } from '../src/index.js';
import {
  APIFY_TOKEN,
  initialize,
  RAPIDAPI_KEY,
  readRequestBody,
  sendJson,
  StdioMcpClient,
  withLoopbackServer,
} from './helpers.js';

function toolPayload(reply) {
  return JSON.parse(reply.result.content[0].text);
}

test('child-process stdio MCP calls RapidAPI and Apify through local HTTP only', async () => {
  const captured = [];
  await withLoopbackServer(async (request, response) => {
    const url = new URL(request.url, 'http://loopback.test');
    captured.push({
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      authorization: request.headers.authorization,
      rapidKey: request.headers['x-rapidapi-key'],
      rapidHost: request.headers['x-rapidapi-host'],
      body: request.method === 'POST' ? JSON.parse(await readRequestBody(request)) : undefined,
    });
    if (request.method === 'POST') sendJson(response, 200, [{ accessionNumber: '0001' }]);
    else sendJson(response, 200, { items: [{ recallNumber: 'R-1' }] });
  }, async (baseUrl) => {
    const client = new StdioMcpClient({
      MCP_TEST_APIFY_BASE_URL: baseUrl,
      MCP_TEST_RAPIDAPI_BASE_URL: baseUrl,
    });
    try {
      const init = await initialize(client);
      assert.equal(init.result.serverInfo.name, 'mcp-server-open-gov-data');

      const listed = await client.request({
        jsonrpc: '2.0', id: 2, method: 'tools/list', params: {},
      });
      assert.equal(listed.result.tools.length, 8);

      const ping = await client.request({ jsonrpc: '2.0', id: 3, method: 'ping', params: {} });
      assert.deepEqual(ping.result, {});

      const rapid = await client.request({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'rapidapi_openfda_records',
          arguments: { dataset: 'drug_enforcement', classification: 'Class I', limit: 2 },
        },
      });
      assert.deepEqual(toolPayload(rapid), {
        provider: 'rapidapi',
        source: 'openFda',
        apiSlug: 'openfda-recalls-enforcement-approvals',
        data: { items: [{ recallNumber: 'R-1' }] },
      });

      const apify = await client.request({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'apify_sec_edgar_filings',
          arguments: { query: 'climate', maxItems: 7, maxTotalChargeUsd: 0.125 },
        },
      });
      assert.deepEqual(toolPayload(apify), {
        provider: 'apify',
        source: 'secEdgar',
        actorId: '8LFIbRbidiHPknMz5',
        maxTotalChargeUsd: '0.125',
        data: [{ accessionNumber: '0001' }],
      });
      await client.stop();
      assert.equal(client.stderr, '');
      assert.doesNotMatch(client.stdout, new RegExp(APIFY_TOKEN));
      assert.doesNotMatch(client.stdout, new RegExp(RAPIDAPI_KEY));
    } catch (error) {
      client.kill();
      throw error;
    }
  });

  assert.deepEqual(captured, [
    {
      method: 'GET',
      path: '/v1/openfda/records',
      query: { dataset: 'drug_enforcement', classification: 'Class I', limit: '2' },
      authorization: undefined,
      rapidKey: RAPIDAPI_KEY,
      rapidHost: 'openfda-recalls-enforcement-approvals.p.rapidapi.com',
      body: undefined,
    },
    {
      method: 'POST',
      path: '/v2/acts/8LFIbRbidiHPknMz5/run-sync-get-dataset-items',
      query: { maxTotalChargeUsd: '0.125', clean: 'true' },
      authorization: `Bearer ${APIFY_TOKEN}`,
      rapidKey: undefined,
      rapidHost: undefined,
      body: { query: 'climate', maxItems: 7 },
    },
  ]);
});

test('child process rejects invalid JSON, extra arguments, and charge caps above environment limit without HTTP', async () => {
  let calls = 0;
  await withLoopbackServer((request, response) => {
    calls += 1;
    sendJson(response, 500, {});
  }, async (baseUrl) => {
    const client = new StdioMcpClient({
      MCP_TEST_APIFY_BASE_URL: baseUrl,
      MCP_APIFY_MAX_TOTAL_CHARGE_USD: '0.10',
    });
    try {
      client.sendRaw('{bad json');
      assert.equal((await client.next()).error.code, -32700);
      await initialize(client);

      const extra = await client.request({
        jsonrpc: '2.0', id: 7, method: 'tools/call',
        params: { name: 'apify_sec_edgar_filings', arguments: { actorId: 'forbidden' } },
      });
      assert.equal(extra.error.code, -32602);

      const costly = await client.request({
        jsonrpc: '2.0', id: 8, method: 'tools/call',
        params: {
          name: 'apify_sec_edgar_filings',
          arguments: { maxTotalChargeUsd: 0.100001 },
        },
      });
      assert.equal(costly.error.code, -32602);
      await client.stop();
    } catch (error) {
      client.kill();
      throw error;
    }
  });
  assert.equal(calls, 0);
});

test('child process blocks redirects, rejects oversized bodies, and never reflects secrets', async () => {
  let redirectTargetCalls = 0;
  await withLoopbackServer((request, response) => {
    const url = new URL(request.url, 'http://loopback.test');
    if (url.pathname === '/v1/sec-edgar/filings') {
      response.writeHead(302, { location: '/redirect-target', connection: 'close' });
      response.end();
      return;
    }
    if (url.pathname === '/redirect-target') {
      redirectTargetCalls += 1;
      sendJson(response, 200, { secret: RAPIDAPI_KEY });
      return;
    }
    response.writeHead(200, {
      'content-type': 'application/json',
      'content-length': String(MAX_RESPONSE_BYTES + 1),
      connection: 'close',
    });
    response.end();
  }, async (baseUrl) => {
    const client = new StdioMcpClient({ MCP_TEST_RAPIDAPI_BASE_URL: baseUrl });
    try {
      await initialize(client);
      const redirect = await client.request({
        jsonrpc: '2.0', id: 10, method: 'tools/call',
        params: { name: 'rapidapi_sec_edgar_filings', arguments: {} },
      });
      assert.equal(toolPayload(redirect).error.code, 'REDIRECT_BLOCKED');

      const oversized = await client.request({
        jsonrpc: '2.0', id: 11, method: 'tools/call',
        params: { name: 'rapidapi_clinical_trials', arguments: {} },
      });
      assert.equal(toolPayload(oversized).error.code, 'RESPONSE_TOO_LARGE');
      await client.stop();
      assert.doesNotMatch(`${client.stdout}${client.stderr}`, new RegExp(RAPIDAPI_KEY));
    } catch (error) {
      client.kill();
      throw error;
    }
  });
  assert.equal(redirectTargetCalls, 0);
});
