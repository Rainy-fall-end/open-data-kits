'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { OpenGovData } = require('../dist/nodes/OpenGovData/OpenGovData.node.js');

const APIFY_TOKEN = `apify_${'api'}_${'C'.repeat(32)}`;

function context({ parameters, credentials, continueOnFail = false }) {
  return {
    getInputData: () => [{ json: { trigger: true } }],
    getNodeParameter: (name, _index, fallback) => parameters[name] ?? fallback,
    getCredentials: async (name) => credentials[name],
    continueOnFail: () => continueOnFail,
  };
}

test('node execution maps upstream arrays to paired n8n items', async (t) => {
  let captured;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    captured = { url: String(url), options };
    return new Response(JSON.stringify([{ id: 1 }, { id: 2 }]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const node = new OpenGovData();
  const result = await node.execute.call(context({
    parameters: {
      provider: 'apify',
      source: 'clinicalTrials',
      requestInput: { condition: 'asthma' },
      maxItems: 2,
      maxTotalChargeUsd: 0.05,
      timeoutMs: 1000,
    },
    credentials: { openGovDataApifyApi: { token: APIFY_TOKEN } },
  }));

  assert.deepEqual(result, [[
    { json: { id: 1 }, pairedItem: { item: 0 } },
    { json: { id: 2 }, pairedItem: { item: 0 } },
  ]]);
  assert.match(captured.url, /KchE3qKKrwU0rCe9f/);
  assert.match(captured.url, /maxTotalChargeUsd=0.05/);
  assert.equal(captured.options.headers.authorization, `Bearer ${APIFY_TOKEN}`);
});

test('continueOnFail emits a safe n8n error item without the malformed credential', async () => {
  const malformed = 'malformed credential value';
  const node = new OpenGovData();
  const result = await node.execute.call(context({
    parameters: { provider: 'rapidapi', source: 'secEdgar', timeoutMs: 1000 },
    credentials: { openGovDataRapidApi: { apiKey: malformed } },
    continueOnFail: true,
  }));
  assert.equal(result[0][0].json.error.code, 'AUTH_INVALID');
  assert.doesNotMatch(JSON.stringify(result), new RegExp(malformed));
});
