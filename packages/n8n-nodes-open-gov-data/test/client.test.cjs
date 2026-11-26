'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { SOURCES } = require('../dist/lib/catalog.js');
const {
  OpenGovDataError,
  executeRequest,
  extractRecords,
  parseInput,
  safeError,
  validateCredential,
  validateMaxTotalChargeUsd,
} = require('../dist/lib/client.js');
const { readBody, sendJson, withLoopbackServer } = require('./helpers.cjs');

const APIFY_TOKEN = `apify_${'api'}_${'A'.repeat(32)}`;
const RAPIDAPI_KEY = `rapid_${'B'.repeat(32)}`;

test('catalog contains exactly the four approved Actors and four approved RapidAPI APIs', () => {
  assert.deepEqual(
    Object.values(SOURCES.apify).map((source) => source.actorId),
    ['8LFIbRbidiHPknMz5', 'KchE3qKKrwU0rCe9f', 'txnvyTckeQx4hVBc6', 'Z3ioK0wOAeczj6nCx'],
  );
  assert.deepEqual(
    Object.values(SOURCES.rapidapi).map((source) => source.apiSlug),
    [
      'sec-edgar-corporate-filings',
      'clinicaltrials-gov-studies-trials',
      'openfda-recalls-enforcement-approvals',
      'singapore-bca-green-mark-buildings',
    ],
  );
  assert.equal(Object.keys(SOURCES.apify).length, 4);
  assert.equal(Object.keys(SOURCES.rapidapi).length, 4);
  assert.doesNotMatch(JSON.stringify(SOURCES), /hong\s*kong|(^|[^a-z])hk([^a-z]|$)/i);
});

test('strict credential validation rejects missing, malformed, and whitespace-bearing secrets', () => {
  for (const [provider, secret] of [
    ['apify', ''],
    ['apify', 'short-token'],
    ['apify', `${APIFY_TOKEN} `],
    ['rapidapi', 'short'],
    ['rapidapi', `${RAPIDAPI_KEY}\n`],
  ]) {
    assert.throws(() => validateCredential(provider, secret), (error) => {
      assert.ok(error instanceof OpenGovDataError);
      assert.match(error.code, /^AUTH_/);
      assert.doesNotMatch(error.message, /A{8}|B{8}/);
      return true;
    });
  }
  assert.equal(validateCredential('apify', APIFY_TOKEN), APIFY_TOKEN);
  assert.equal(validateCredential('rapidapi', RAPIDAPI_KEY), RAPIDAPI_KEY);
});

test('authentication fails before any HTTP request is attempted', async () => {
  let calls = 0;
  await assert.rejects(
    executeRequest({
      provider: 'apify',
      source: 'secEdgar',
      credentials: { token: 'invalid' },
      fetchImpl: async () => {
        calls += 1;
        return new Response('{}');
      },
    }),
    (error) => error.code === 'AUTH_INVALID',
  );
  assert.equal(calls, 0);
});

test('Apify loopback integration sends bearer auth, overrides maxItems, and enforces charge query', async () => {
  await withLoopbackServer(async (request, response) => {
    const url = new URL(request.url, 'http://loopback.test');
    assert.equal(request.method, 'POST');
    assert.equal(url.pathname, '/v2/acts/8LFIbRbidiHPknMz5/run-sync-get-dataset-items');
    assert.equal(url.searchParams.get('maxTotalChargeUsd'), '0.125');
    assert.equal(url.searchParams.get('clean'), 'true');
    assert.equal(request.headers.authorization, `Bearer ${APIFY_TOKEN}`);
    const body = JSON.parse(await readBody(request));
    assert.deepEqual(body, { query: 'climate', maxItems: 7 });
    sendJson(response, 200, [{ accessionNumber: '0001' }]);
  }, async (baseUrl) => {
    const payload = await executeRequest({
      provider: 'apify',
      source: 'secEdgar',
      credentials: { token: APIFY_TOKEN },
      requestInput: { query: 'climate', maxItems: 999 },
      maxItems: 7,
      maxTotalChargeUsd: 0.125,
      timeoutMs: 2000,
      endpointOverrides: { apifyBaseUrl: baseUrl },
    });
    assert.deepEqual(payload, [{ accessionNumber: '0001' }]);
  });
});

test('RapidAPI loopback integration sends key and fixed host while bounding row count', async () => {
  await withLoopbackServer((request, response) => {
    const url = new URL(request.url, 'http://loopback.test');
    assert.equal(request.method, 'GET');
    assert.equal(url.pathname, '/v1/openfda/records');
    assert.equal(url.searchParams.get('category'), 'drug');
    assert.equal(url.searchParams.get('status'), 'ongoing,completed');
    assert.equal(url.searchParams.get('maxItems'), '5');
    assert.equal(request.headers['x-rapidapi-key'], RAPIDAPI_KEY);
    assert.equal(request.headers['x-rapidapi-host'], 'openfda-recalls-enforcement-approvals.p.rapidapi.com');
    sendJson(response, 200, { items: [{ recallNumber: 'R-1' }] });
  }, async (baseUrl) => {
    const payload = await executeRequest({
      provider: 'rapidapi',
      source: 'openFda',
      credentials: { apiKey: RAPIDAPI_KEY },
      requestInput: { category: 'drug', status: ['ongoing', 'completed'], maxItems: 400 },
      maxItems: 5,
      timeoutMs: 2000,
      endpointOverrides: { rapidApiBaseUrl: baseUrl },
    });
    assert.deepEqual(extractRecords(payload), [{ recallNumber: 'R-1' }]);
  });
});

test('HTTP errors preserve status and never include credentials or an echoed response body', async () => {
  const statuses = [401, 429, 500];
  let call = 0;
  await withLoopbackServer((_request, response) => {
    const status = statuses[call];
    call += 1;
    sendJson(response, status, { reflectedSecret: RAPIDAPI_KEY });
  }, async (baseUrl) => {
    for (const status of statuses) {
      await assert.rejects(
        executeRequest({
          provider: 'rapidapi',
          source: 'clinicalTrials',
          credentials: { apiKey: RAPIDAPI_KEY },
          timeoutMs: 2000,
          endpointOverrides: { rapidApiBaseUrl: baseUrl },
        }),
        (error) => {
          assert.equal(error.code, `HTTP_${status}`);
          assert.equal(error.statusCode, status);
          assert.doesNotMatch(`${error.message} ${JSON.stringify(error)}`, new RegExp(RAPIDAPI_KEY));
          return true;
        },
      );
    }
  });
});

test('timeout aborts a stalled loopback request and returns a safe typed error', async () => {
  await withLoopbackServer(() => {}, async (baseUrl) => {
    await assert.rejects(
      executeRequest({
        provider: 'rapidapi',
        source: 'singaporeGreenMark',
        credentials: { apiKey: RAPIDAPI_KEY },
        timeoutMs: 100,
        endpointOverrides: { rapidApiBaseUrl: baseUrl },
      }),
      (error) => {
        assert.deepEqual(safeError(error), { code: 'TIMEOUT', message: 'Upstream request timed out' });
        return true;
      },
    );
  });
});

test('invalid JSON responses get a stable error without unsafe body content', async () => {
  await withLoopbackServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(`not-json-${APIFY_TOKEN}`);
  }, async (baseUrl) => {
    await assert.rejects(
      executeRequest({
        provider: 'apify',
        source: 'ukGovTenders',
        credentials: { token: APIFY_TOKEN },
        maxTotalChargeUsd: 0.25,
        timeoutMs: 2000,
        endpointOverrides: { apifyBaseUrl: baseUrl },
      }),
      (error) => error.code === 'RESPONSE_INVALID' && !error.message.includes(APIFY_TOKEN),
    );
  });
});

test('input and cost validation reject credential injection and unsafe limits', () => {
  assert.throws(() => parseInput({ nested: { authorization: `Bearer ${APIFY_TOKEN}` } }), {
    code: 'INPUT_SECRET_FIELD',
  });
  assert.throws(() => parseInput('{bad json'), { code: 'INPUT_INVALID' });
  for (const value of [0, -1, Number.POSITIVE_INFINITY, 101, 'not-a-number']) {
    assert.throws(() => validateMaxTotalChargeUsd(value), { code: 'COST_LIMIT_INVALID' });
  }
  assert.equal(validateMaxTotalChargeUsd(0.25), 0.25);
});

test('unknown providers and sources cannot be converted into arbitrary upstream requests', async () => {
  for (const options of [
    { provider: 'custom', source: 'anything' },
    { provider: 'apify', source: 'unlistedActor' },
    { provider: 'rapidapi', source: 'unlistedApi' },
  ]) {
    await assert.rejects(
      executeRequest({ ...options, credentials: { token: APIFY_TOKEN, apiKey: RAPIDAPI_KEY } }),
      (error) => ['PROVIDER_NOT_ALLOWED', 'SOURCE_NOT_ALLOWED'].includes(error.code),
    );
  }
});
