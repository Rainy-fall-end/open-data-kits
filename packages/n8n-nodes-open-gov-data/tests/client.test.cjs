'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { SOURCES } = require('../lib/catalog.js');
const {
  executeRequest,
  extractRecords,
  parseInput,
  safeError,
  validateCredential,
  validateLoopbackBaseUrl,
  validateMaxTotalChargeUsd,
} = require('../lib/client.js');
const { readBody, sendJson, withLoopbackServer } = require('./helpers.cjs');

const APIFY_TOKEN = `apify_${'api'}_${'A'.repeat(32)}`;
const RAPIDAPI_KEY = `rapid_${'B'.repeat(32)}`;

test('Apify loopback call uses the fixed Actor, bearer header, row bound, and charge cap', async () => {
  await withLoopbackServer(async (request, response) => {
    const url = new URL(request.url, 'http://loopback.invalid');
    assert.equal(request.method, 'POST');
    assert.equal(url.pathname, `/v2/acts/${SOURCES.apify.secEdgarIntelligence.actorId}/run-sync-get-dataset-items`);
    assert.equal(url.searchParams.get('maxTotalChargeUsd'), '0.125');
    assert.equal(url.searchParams.get('clean'), 'true');
    assert.equal(request.headers.authorization, `Bearer ${APIFY_TOKEN}`);
    assert.deepEqual(JSON.parse(await readBody(request)), {
      mode: 'xbrl_financials', ticker: 'AAPL', maxItems: 7,
    });
    sendJson(response, 200, [{ ok: true, echoed: APIFY_TOKEN }]);
  }, async (baseUrl) => {
    const payload = await executeRequest({
      provider: 'apify',
      source: 'secEdgarIntelligence',
      credentials: { token: APIFY_TOKEN },
      requestInput: { mode: 'xbrl_financials', ticker: 'AAPL', maxItems: 999 },
      maxItems: 7,
      maxTotalChargeUsd: 0.125,
      timeoutMs: 2000,
      endpointOverrides: { apifyBaseUrl: baseUrl },
      allowTestEndpointOverrides: true,
    });
    assert.deepEqual(payload, [{ ok: true, echoed: '[REDACTED]' }]);
  });
});

test('RapidAPI loopback call maps maxItems to the OpenAPI limit parameter', async () => {
  await withLoopbackServer((request, response) => {
    const url = new URL(request.url, 'http://loopback.invalid');
    assert.equal(request.method, 'GET');
    assert.equal(url.pathname, '/v1/openfda/records');
    assert.equal(url.searchParams.get('dataset'), 'drug_enforcement');
    assert.equal(url.searchParams.get('limit'), '5');
    assert.equal(url.searchParams.has('maxItems'), false);
    assert.equal(request.headers['x-rapidapi-key'], RAPIDAPI_KEY);
    assert.equal(request.headers['x-rapidapi-host'], SOURCES.rapidapi.openfdaRecalls.host);
    sendJson(response, 200, { items: [{ recallNumber: 'R-1' }] });
  }, async (baseUrl) => {
    const payload = await executeRequest({
      provider: 'rapidapi',
      source: 'openfdaRecalls',
      credentials: { apiKey: RAPIDAPI_KEY },
      requestInput: { dataset: 'drug_enforcement', limit: 19, maxItems: 400 },
      maxItems: 5,
      timeoutMs: 2000,
      endpointOverrides: { rapidApiBaseUrl: baseUrl },
      allowTestEndpointOverrides: true,
    });
    assert.deepEqual(extractRecords(payload), [{ recallNumber: 'R-1' }]);
  });
});

test('legacy source values execute against their canonical endpoints', async () => {
  await withLoopbackServer((request, response) => {
    assert.equal(new URL(request.url, 'http://loopback.invalid').pathname, '/v1/sec-edgar/filings');
    sendJson(response, 200, { items: [] });
  }, async (baseUrl) => {
    assert.deepEqual(await executeRequest({
      provider: 'rapidapi',
      source: 'secEdgar',
      credentials: { apiKey: RAPIDAPI_KEY },
      maxItems: 5,
      timeoutMs: 2000,
      endpointOverrides: { rapidApiBaseUrl: baseUrl },
      allowTestEndpointOverrides: true,
    }), { items: [] });
  });
});

test('cap, schema, credential-value, and SSRF guards fail before HTTP', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response('{}');
  };
  const cases = [
    {
      options: { provider: 'apify', source: 'clinicalTrials', credentials: { token: APIFY_TOKEN }, maxTotalChargeUsd: 0.250001 },
      code: 'COST_LIMIT_INVALID',
    },
    {
      options: { provider: 'apify', source: 'clinicalTrials', credentials: { token: APIFY_TOKEN }, requestInput: { unsupported: true } },
      code: 'INPUT_SCHEMA_INVALID',
    },
    {
      options: { provider: 'apify', source: 'clinicalTrials', credentials: { token: APIFY_TOKEN }, requestInput: { condition: APIFY_TOKEN } },
      code: 'INPUT_SECRET_VALUE',
    },
    {
      options: { provider: 'apify', source: 'clinicalTrials', credentials: { token: APIFY_TOKEN }, endpointOverrides: { apifyBaseUrl: 'http://127.0.0.1:9' } },
      code: 'TEST_ENDPOINT_FORBIDDEN',
    },
    {
      options: { provider: 'apify', source: 'clinicalTrials', credentials: { token: APIFY_TOKEN }, endpointOverrides: { apifyBaseUrl: 'http://192.0.2.1:9' }, allowTestEndpointOverrides: true },
      code: 'TEST_ENDPOINT_INVALID',
    },
  ];
  for (const item of cases) {
    await assert.rejects(executeRequest({ ...item.options, fetchImpl }), { code: item.code });
  }
  assert.equal(calls, 0);
});

test('test endpoint validator accepts loopback origins only', () => {
  assert.equal(validateLoopbackBaseUrl('http://127.0.0.1:8080'), 'http://127.0.0.1:8080');
  assert.equal(validateLoopbackBaseUrl('http://[::1]:8080'), 'http://[::1]:8080');
  assert.equal(validateLoopbackBaseUrl('http://localhost:8080'), 'http://localhost:8080');
  assert.throws(() => validateLoopbackBaseUrl('https://127.0.0.1:8080'), { code: 'TEST_ENDPOINT_INVALID' });
  assert.throws(() => validateLoopbackBaseUrl('http://127.0.0.1:8080/path'), { code: 'TEST_ENDPOINT_INVALID' });
});

test('authentication and input guards redact all credential material', () => {
  for (const [provider, value] of [
    ['apify', 'invalid value'],
    ['rapidapi', 'short'],
  ]) {
    assert.throws(() => validateCredential(provider, value), (error) => {
      assert.doesNotMatch(JSON.stringify(safeError(error)), new RegExp(value));
      return true;
    });
  }
  assert.throws(() => parseInput({ nested: { authorization: `Bearer ${APIFY_TOKEN}` } }), {
    code: 'INPUT_SECRET_FIELD',
  });
  for (const value of [0, -1, 0.250001, Number.POSITIVE_INFINITY, 'bad']) {
    assert.throws(() => validateMaxTotalChargeUsd(value), { code: 'COST_LIMIT_INVALID' });
  }
  assert.equal(validateMaxTotalChargeUsd(0.25), 0.25);
});

test('HTTP errors and invalid JSON never echo response bodies or credentials', async () => {
  let count = 0;
  await withLoopbackServer((_request, response) => {
    count += 1;
    if (count === 1) sendJson(response, 429, { reflected: RAPIDAPI_KEY });
    else {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(`not-json-${RAPIDAPI_KEY}`);
    }
  }, async (baseUrl) => {
    const options = {
      provider: 'rapidapi', source: 'clinicaltrialsStudies', credentials: { apiKey: RAPIDAPI_KEY },
      maxItems: 5, timeoutMs: 2000, endpointOverrides: { rapidApiBaseUrl: baseUrl },
      allowTestEndpointOverrides: true,
    };
    await assert.rejects(executeRequest(options), (error) => {
      assert.equal(error.code, 'HTTP_429');
      assert.doesNotMatch(JSON.stringify(error), new RegExp(RAPIDAPI_KEY));
      return true;
    });
    await assert.rejects(executeRequest(options), (error) => {
      assert.equal(error.code, 'RESPONSE_INVALID');
      assert.doesNotMatch(JSON.stringify(error), new RegExp(RAPIDAPI_KEY));
      return true;
    });
  });
});

test('unknown providers, unknown sources, and invalid credentials cannot initiate HTTP', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return new Response('{}'); };
  await assert.rejects(executeRequest({ provider: 'custom', source: 'x', fetchImpl }), { code: 'PROVIDER_NOT_ALLOWED' });
  await assert.rejects(executeRequest({ provider: 'apify', source: 'x', fetchImpl }), { code: 'SOURCE_NOT_ALLOWED' });
  await assert.rejects(executeRequest({
    provider: 'apify', source: 'clinicalTrials', credentials: { token: 'invalid' }, fetchImpl,
  }), { code: 'AUTH_INVALID' });
  assert.equal(calls, 0);
});
