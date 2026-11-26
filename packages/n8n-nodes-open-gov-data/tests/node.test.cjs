'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { OpenGovData } = require('../nodes/OpenGovData/OpenGovData.node.js');

const APIFY_TOKEN = `apify_${'api'}_${'C'.repeat(32)}`;

function context({ parameters, credentials, continueOnFail = false, itemCount = 1 }) {
  return {
    getInputData: () => Array.from({ length: itemCount }, () => ({ json: { trigger: true } })),
    getNodeParameter: (name, _index, fallback) => parameters[name] ?? fallback,
    getCredentials: async (name) => credentials[name],
    continueOnFail: () => continueOnFail,
  };
}

test('node execution maps response rows to paired n8n items', async (t) => {
  let captured;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    captured = { url: String(url), options };
    return new Response(JSON.stringify([{ id: 1 }, { id: 2 }]), { status: 200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const result = await new OpenGovData().execute.call(context({
    parameters: {
      provider: 'apify', source: 'clinicalTrials', requestInput: { condition: 'asthma' },
      maxItems: 2, maxTotalChargeUsd: 0.05, timeoutMs: 1000,
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

test('continueOnFail emits a stable safe error item', async () => {
  const malformed = 'malformed credential value';
  const result = await new OpenGovData().execute.call(context({
    parameters: { provider: 'rapidapi', source: 'secEdgarCorporateFilings', timeoutMs: 1000 },
    credentials: { openGovDataRapidApi: { apiKey: malformed } },
    continueOnFail: true,
  }));
  assert.equal(result[0][0].json.error.code, 'AUTH_INVALID');
  assert.doesNotMatch(JSON.stringify(result), new RegExp(malformed));
});
