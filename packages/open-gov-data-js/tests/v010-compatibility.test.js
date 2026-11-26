import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import test from 'node:test';

import * as current from '../src/index.js';
import { readRequestBody, sendJson, withLoopbackServer } from './helpers.js';

const legacy = await import('../../../packages/open-gov-data-js/src/index.js');
const APIFY_TOKEN = `apify_api_${'D'.repeat(32)}`;
const RAPIDAPI_KEY = `rapid_${'E'.repeat(32)}`;

test('every v0.1.0 runtime export and OpenGovDataClient method remains available', () => {
  for (const exportName of Object.keys(legacy)) {
    assert.ok(Object.hasOwn(current, exportName), `missing legacy export ${exportName}`);
  }
  for (const method of Object.getOwnPropertyNames(legacy.OpenGovDataClient.prototype)) {
    assert.ok(method in current.OpenGovDataClient.prototype, `missing legacy method ${method}`);
  }
  for (const key of Object.keys(legacy.APIFY_SOURCES)) {
    const expected = legacy.APIFY_SOURCES[key];
    assert.equal(current.APIFY_SOURCES[key].key, expected.key);
    assert.equal(current.APIFY_SOURCES[key].label, expected.label);
    assert.equal(current.APIFY_SOURCES[key].actorId, expected.actorId);
  }
  for (const key of Object.keys(legacy.RAPIDAPI_SOURCES)) {
    assert.deepEqual(current.RAPIDAPI_SOURCES[key], legacy.RAPIDAPI_SOURCES[key]);
  }
});

test('v0.1.0 generic request methods preserve URLs, limits, cap semantics, and envelopes', async () => {
  const captured = [];
  await withLoopbackServer(async (request, response) => {
    const url = new URL(request.url, 'http://loopback.invalid');
    captured.push({
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      authorization: request.headers.authorization,
      apiKey: request.headers['x-rapidapi-key'],
      body: request.method === 'POST' ? JSON.parse(await readRequestBody(request)) : undefined,
    });
    sendJson(response, 200, request.method === 'POST'
      ? [{ accessionNumber: '0001' }]
      : { items: [{ recallNumber: 'R-1' }] });
  }, async (baseUrl) => {
    const client = new current.OpenGovDataClient({
      apifyToken: APIFY_TOKEN,
      rapidApiKey: RAPIDAPI_KEY,
      testing: { apifyBaseUrl: baseUrl, rapidApiBaseUrl: baseUrl },
    });
    assert.deepEqual(
      await client.runActor(
        'secEdgar',
        { query: 'climate', maxItems: 999, maxTotalChargeUsd: 99 },
        { maxItems: 7, maxTotalChargeUsd: '0.1250' },
      ),
      [{ accessionNumber: '0001' }],
    );
    assert.deepEqual(
      await client.queryRapidApi('openFda', { dataset: 'drug_enforcement', limit: 999 }, { maxItems: 5 }),
      { items: [{ recallNumber: 'R-1' }] },
    );
    assert.deepEqual(
      await client.request('apify', 'clinicalTrials', { condition: 'diabetes' }, { maxItems: 3 }),
      [{ accessionNumber: '0001' }],
    );
    assert.deepEqual(
      await client.records('rapidapi', 'clinicalTrials', { condition: 'diabetes' }, { maxItems: 2 }),
      [{ recallNumber: 'R-1' }],
    );
  });

  assert.deepEqual(captured[0], {
    method: 'POST',
    path: '/v2/acts/8LFIbRbidiHPknMz5/run-sync-get-dataset-items',
    query: { maxTotalChargeUsd: '0.125', clean: 'true' },
    authorization: `Bearer ${APIFY_TOKEN}`,
    apiKey: undefined,
    body: { query: 'climate', maxItems: 7 },
  });
  assert.equal(captured[1].path, '/v1/openfda/records');
  assert.deepEqual(captured[1].query, { dataset: 'drug_enforcement', limit: '5' });
  assert.equal(captured[2].path, '/v2/acts/KchE3qKKrwU0rCe9f/run-sync-get-dataset-items');
  assert.equal(captured[3].path, '/v1/clinical-trials/studies');
});

test('v0.1.0 validation, safe errors, and credential redaction behavior remain stable', async () => {
  assert.equal(current.validateMaxTotalChargeUsd('0.2500'), '0.25');
  assert.equal(current.compareMaxTotalChargeUsd('0.10000000000000001', '0.1'), 1);
  assert.equal(current.validateMaxItems(1_000), 1_000);
  assert.equal(current.validateTimeoutMs(300_000), 300_000);
  assert.deepEqual(current.extractRecords({ results: [1, 2] }), [1, 2]);
  assert.deepEqual(current.extractRecords(null), []);
  assert.equal(current.rapidApiQueryValue(['a', 'b']), 'a,b');

  const clone = current.parseInput({ query: 'climate', nested: { values: [1, 2] } });
  assert.deepEqual(clone, { query: 'climate', nested: { values: [1, 2] } });
  assert.throws(() => current.parseInput({ token: APIFY_TOKEN }), { code: 'INPUT_SECRET_FIELD' });
  assert.throws(() => current.validateMaxItems(1_001), { code: 'MAX_ITEMS_INVALID' });

  const client = new current.OpenGovDataClient({
    apifyToken: APIFY_TOKEN,
    rapidApiKey: RAPIDAPI_KEY,
  });
  const rendered = `${inspect(client)} ${JSON.stringify(client)}`;
  assert.doesNotMatch(rendered, new RegExp(APIFY_TOKEN));
  assert.doesNotMatch(rendered, new RegExp(RAPIDAPI_KEY));
  await assert.rejects(
    client.queryRapidApi('openFda', {}, { maxTotalChargeUsd: '0.25' }),
    { code: 'COST_LIMIT_UNSUPPORTED' },
  );
  assert.deepEqual(current.safeError(new Error(`hidden ${RAPIDAPI_KEY}`)), {
    code: 'UNKNOWN_ERROR',
    message: 'Open Gov Data request failed',
  });
});

test('legacy aliases and new semantic aliases resolve only to the same public products', () => {
  assert.equal(current.APIFY_SOURCES.secEdgarIntelligence.actorId, current.APIFY_SOURCES.secEdgar.actorId);
  assert.equal(current.APIFY_SOURCES.sgGreenMark.actorId, current.APIFY_SOURCES.singaporeGreenMark.actorId);
  assert.equal(current.RAPIDAPI_SOURCES.openfdaRecalls.apiSlug, current.RAPIDAPI_SOURCES.openFda.apiSlug);
  assert.equal(current.RAPIDAPI_SOURCES.sgGreenMarkBuildings.path, current.RAPIDAPI_SOURCES.singaporeGreenMark.path);
});
