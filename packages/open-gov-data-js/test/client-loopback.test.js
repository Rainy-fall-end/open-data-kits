import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_RESPONSE_BYTES,
  OpenGovDataClient,
  safeError,
} from '../src/index.js';
import { readRequestBody, sendJson, withLoopbackServer } from './helpers.js';

const APIFY_TOKEN = `apify_api_${'C'.repeat(32)}`;
const RAPIDAPI_KEY = `rapid_${'D'.repeat(32)}`;

test('Apify loopback request sends fixed Actor, auth, row cap, and non-raiseable cost cap', async () => {
  let captured;
  await withLoopbackServer(async (request, response) => {
    const url = new URL(request.url, 'http://loopback.test');
    captured = {
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      authorization: request.headers.authorization,
      contentType: request.headers['content-type'],
      body: JSON.parse(await readRequestBody(request)),
    };
    sendJson(response, 200, [{ accessionNumber: '0001' }]);
  }, async (baseUrl) => {
    const client = new OpenGovDataClient({
      apifyToken: APIFY_TOKEN,
      maxTotalChargeUsd: '0.25',
      timeoutMs: 2_000,
      testing: { apifyBaseUrl: baseUrl },
    });
    const result = await client.runActor(
      'secEdgar',
      { query: 'climate', maxItems: 999, maxTotalChargeUsd: 99 },
      { maxItems: 7, maxTotalChargeUsd: '0.1250' },
    );
    assert.deepEqual(result, [{ accessionNumber: '0001' }]);
  });

  assert.deepEqual(captured, {
    method: 'POST',
    path: '/v2/acts/8LFIbRbidiHPknMz5/run-sync-get-dataset-items',
    query: { maxTotalChargeUsd: '0.125', clean: 'true' },
    authorization: `Bearer ${APIFY_TOKEN}`,
    contentType: 'application/json; charset=utf-8',
    body: { query: 'climate', maxItems: 7 },
  });
});

test('RapidAPI loopback request sends fixed host, route, auth, and limit', async () => {
  let captured;
  await withLoopbackServer((request, response) => {
    const url = new URL(request.url, 'http://loopback.test');
    captured = {
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      apiKey: request.headers['x-rapidapi-key'],
      apiHost: request.headers['x-rapidapi-host'],
    };
    sendJson(response, 200, { items: [{ recallNumber: 'R-1' }] });
  }, async (baseUrl) => {
    const client = new OpenGovDataClient({
      rapidApiKey: RAPIDAPI_KEY,
      timeoutMs: 2_000,
      testing: { rapidApiBaseUrl: baseUrl },
    });
    const records = await client.records(
      'rapidapi',
      'openFda',
      {
        dataset: 'drug_enforcement',
        status: ['ongoing', 'completed'],
        limit: 999,
        maxItems: 888,
      },
      { maxItems: 5 },
    );
    assert.deepEqual(records, [{ recallNumber: 'R-1' }]);
  });

  assert.deepEqual(captured, {
    method: 'GET',
    path: '/v1/openfda/records',
    query: {
      dataset: 'drug_enforcement',
      status: 'ongoing,completed',
      limit: '5',
    },
    apiKey: RAPIDAPI_KEY,
    apiHost: 'openfda-recalls-enforcement-approvals.p.rapidapi.com',
  });
});

test('redirect response is blocked and redirect target receives zero requests', async () => {
  let targetCalls = 0;
  await withLoopbackServer((request, response) => {
    targetCalls += 1;
    sendJson(response, 200, { unexpected: true });
  }, async (targetUrl) => {
    await withLoopbackServer((request, response) => {
      response.writeHead(302, { location: `${targetUrl}/capture`, connection: 'close' });
      response.end();
    }, async (redirectUrl) => {
      const client = new OpenGovDataClient({
        rapidApiKey: RAPIDAPI_KEY,
        testing: { rapidApiBaseUrl: redirectUrl },
      });
      await assert.rejects(
        client.queryRapidApi('secEdgar'),
        { code: 'REDIRECT_BLOCKED', statusCode: 302 },
      );
    });
  });
  assert.equal(targetCalls, 0);
});

test('HTTP errors discard reflected response bodies and preserve only status', async () => {
  let status = 429;
  await withLoopbackServer((request, response) => {
    sendJson(response, status, {
      reflectedSecret: RAPIDAPI_KEY,
      private: 'upstream private details',
    });
  }, async (baseUrl) => {
    const client = new OpenGovDataClient({
      rapidApiKey: RAPIDAPI_KEY,
      testing: { rapidApiBaseUrl: baseUrl },
    });
    for (status of [401, 429, 500]) {
      await assert.rejects(client.queryRapidApi('clinicalTrials'), (error) => {
        assert.equal(error.code, `HTTP_${status}`);
        assert.equal(error.statusCode, status);
        const rendered = `${error} ${JSON.stringify(error)} ${JSON.stringify(safeError(error))}`;
        assert.doesNotMatch(rendered, new RegExp(RAPIDAPI_KEY));
        assert.doesNotMatch(rendered, /upstream private details/);
        return true;
      });
    }
  });
});

test('invalid JSON response cannot reflect a credential through errors', async () => {
  await withLoopbackServer((request, response) => {
    const body = Buffer.from(`not-json-${APIFY_TOKEN}`, 'utf8');
    response.writeHead(200, {
      'content-length': String(body.byteLength),
      connection: 'close',
    });
    response.end(body);
  }, async (baseUrl) => {
    const client = new OpenGovDataClient({
      apifyToken: APIFY_TOKEN,
      testing: { apifyBaseUrl: baseUrl },
    });
    await assert.rejects(client.runActor('ukGovTenders'), (error) => {
      assert.equal(error.code, 'RESPONSE_INVALID');
      assert.doesNotMatch(`${error} ${JSON.stringify(error)}`, new RegExp(APIFY_TOKEN));
      return true;
    });
  });
});

test('oversized response is rejected from Content-Length before body parsing', async () => {
  await withLoopbackServer((request, response) => {
    response.writeHead(200, {
      'content-length': String(MAX_RESPONSE_BYTES + 1),
      'content-type': 'application/json',
      connection: 'close',
    });
    response.end();
  }, async (baseUrl) => {
    const client = new OpenGovDataClient({
      rapidApiKey: RAPIDAPI_KEY,
      testing: { rapidApiBaseUrl: baseUrl },
    });
    await assert.rejects(
      client.queryRapidApi('singaporeGreenMark'),
      { code: 'RESPONSE_TOO_LARGE' },
    );
  });
});

test('timeout is stable, sanitized, and aborts the local request', async () => {
  await withLoopbackServer((request, response) => {
    setTimeout(() => {
      if (!response.destroyed) sendJson(response, 200, { items: [] });
    }, 300).unref?.();
  }, async (baseUrl) => {
    const client = new OpenGovDataClient({
      rapidApiKey: RAPIDAPI_KEY,
      timeoutMs: 100,
      testing: { rapidApiBaseUrl: baseUrl },
    });
    await assert.rejects(client.queryRapidApi('singaporeGreenMark'), (error) => {
      assert.deepEqual(safeError(error), {
        code: 'TIMEOUT',
        message: 'Upstream request timed out',
      });
      return true;
    });
  });
});

test('204 and empty successful bodies normalize to null', async () => {
  await withLoopbackServer((request, response) => {
    response.writeHead(204, { connection: 'close' });
    response.end();
  }, async (baseUrl) => {
    const client = new OpenGovDataClient({
      rapidApiKey: RAPIDAPI_KEY,
      testing: { rapidApiBaseUrl: baseUrl },
    });
    assert.equal(await client.queryRapidApi('openFda'), null);
  });
});
