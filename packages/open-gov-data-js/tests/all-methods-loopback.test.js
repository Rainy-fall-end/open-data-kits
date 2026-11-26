import assert from 'node:assert/strict';
import test from 'node:test';

import { OpenGovDataClient } from '../src/index.js';
import { readRequestBody, sendJson, withLoopbackServer } from './helpers.js';

const APIFY_TOKEN = `apify_api_${'A'.repeat(32)}`;
const RAPIDAPI_KEY = `rapid_${'B'.repeat(32)}`;

const ACTORS = [
  ['atsJobsHiringSignals', 'CRulq5dak4mqAUmMn', { preset: 'ai_leaders', keywords: 'LLM', maxItems: 1 }],
  ['secEdgarIntelligence', '8LFIbRbidiHPknMz5', { mode: 'xbrl_financials', ticker: 'NVDA', maxItems: 2 }],
  ['globalPublicTenders', 'ZlabhlvEIyRVdtKiQ', { keyword: 'clean energy', maxItems: 3 }],
  ['pharmaPipelineIntelligence', 're8aRvtqBonP5HMuY', { query: 'semaglutide', maxItems: 4 }],
  ['usaspendingContracts', 'eQQ2beomyLlW4DTGM', { awardCategory: 'contracts', maxItems: 5 }],
  ['clinicalTrials', 'KchE3qKKrwU0rCe9f', { condition: 'diabetes', maxItems: 6 }],
  ['ukGovTenders', 'txnvyTckeQx4hVBc6', { stages: 'tender', maxItems: 7 }],
  ['sgGreenMark', 'Z3ioK0wOAeczj6nCx', { rating: 'Platinum', maxItems: 8 }],
];

const RAPID = [
  ['secEdgarCorporateFilings', '/v1/sec-edgar/filings', { ticker: 'NVDA', limit: 4 }, 4],
  ['clinicaltrialsStudies', '/v1/clinical-trials/studies', { condition: 'diabetes' }, 5],
  ['openfdaRecalls', '/v1/openfda/records', { dataset: 'drug_enforcement', classification: 'Class I' }, 6],
  ['sgGreenMarkBuildings', '/v1/sg-green-mark/certificates', { rating: 'Gold', limit: 2 }, 2],
];

test('all twelve typed helpers stay on loopback and send the exact allowlisted routes', async () => {
  const captured = [];
  await withLoopbackServer(async (request, response) => {
    const url = new URL(request.url, 'http://loopback.invalid');
    captured.push({
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: request.headers,
      body: request.method === 'POST' ? JSON.parse(await readRequestBody(request)) : undefined,
      remoteAddress: request.socket.remoteAddress,
    });
    sendJson(response, 200, request.method === 'POST' ? [{ ok: true }] : { items: [{ ok: true }] });
  }, async (baseUrl) => {
    const client = new OpenGovDataClient({
      apifyToken: APIFY_TOKEN,
      rapidApiKey: RAPIDAPI_KEY,
      timeoutMs: 2_000,
      testing: { apifyBaseUrl: baseUrl, rapidApiBaseUrl: baseUrl },
    });

    for (const [method, actorId, input] of ACTORS) {
      assert.deepEqual(await client[method](input), [{ ok: true }], method);
      const request = captured.at(-1);
      assert.equal(request.method, 'POST');
      assert.equal(request.path, `/v2/acts/${actorId}/run-sync-get-dataset-items`);
      assert.deepEqual(request.query, { maxTotalChargeUsd: '0.25', clean: 'true' });
      assert.equal(request.headers.authorization, `Bearer ${APIFY_TOKEN}`);
      assert.equal(request.body.maxItems, input.maxItems);
    }

    for (const [method, path, query, expectedLimit] of RAPID) {
      const options = method === 'openfdaRecalls' ? { maxItems: expectedLimit } : {};
      assert.deepEqual(await client[method](query, options), { items: [{ ok: true }] }, method);
      const request = captured.at(-1);
      assert.equal(request.method, 'GET');
      assert.equal(request.path, path);
      assert.equal(request.query.limit, String(expectedLimit));
      assert.equal(request.headers['x-rapidapi-key'], RAPIDAPI_KEY);
      assert.match(request.headers['x-rapidapi-host'], /\.p\.rapidapi\.com$/);
    }
  });

  assert.equal(captured.length, 12);
  assert.ok(captured.every((request) => request.remoteAddress === '127.0.0.1'));
});

test('typed helper method names are complete and unique', () => {
  const expected = [...ACTORS, ...RAPID].map(([method]) => method);
  assert.equal(new Set(expected).size, 12);
  for (const method of expected) assert.equal(typeof OpenGovDataClient.prototype[method], 'function');
});
