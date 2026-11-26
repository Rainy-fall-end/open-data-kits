import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  ACTOR_SCHEMA_SOURCES,
  APIFY_INPUT_SCHEMAS,
  APIFY_SOURCES,
  OpenGovDataClient,
  RAPIDAPI_QUERY_SCHEMAS,
  RAPIDAPI_SOURCES,
  getCatalog,
} from '../src/index.js';

const REPOSITORY_ROOT = new URL('../../../', import.meta.url);

function contractShape(schema) {
  const result = {};
  for (const key of ['type', 'default', 'minimum', 'maximum', 'minLength', 'maxLength']) {
    if (Object.hasOwn(schema, key)) result[key] = schema[key];
  }
  if (Array.isArray(schema.enum)) result.enum = [...schema.enum];
  if (schema.type === 'object') {
    result.required = [...(schema.required || [])];
    result.properties = Object.fromEntries(
      Object.entries(schema.properties || {}).map(([key, value]) => [key, contractShape(value)]),
    );
  }
  if (schema.items) result.items = contractShape(schema.items);
  return result;
}

test('catalog contains exactly the eight requested actors and four requested APIs', () => {
  assert.deepEqual(
    Object.values(APIFY_SOURCES).map((source) => source.actorId),
    [
      'CRulq5dak4mqAUmMn',
      '8LFIbRbidiHPknMz5',
      'ZlabhlvEIyRVdtKiQ',
      're8aRvtqBonP5HMuY',
      'eQQ2beomyLlW4DTGM',
      'KchE3qKKrwU0rCe9f',
      'txnvyTckeQx4hVBc6',
      'Z3ioK0wOAeczj6nCx',
    ],
  );
  assert.deepEqual(
    Object.values(RAPIDAPI_SOURCES).map((source) => source.apiSlug),
    [
      'sec-edgar-corporate-filings',
      'clinicaltrials-gov-studies-trials',
      'openfda-recalls-enforcement-approvals',
      'singapore-bca-green-mark-buildings',
    ],
  );
  assert.equal(Object.keys(APIFY_SOURCES).length, 8);
  assert.equal(Object.keys(RAPIDAPI_SOURCES).length, 4);
  assert.equal(getCatalog().apify.length, 8);
  assert.equal(getCatalog().rapidapi.length, 4);
});

test('embedded actor contracts match all validation keywords in the real repository schemas', async () => {
  for (const [schemaKey, relativePath] of Object.entries(ACTOR_SCHEMA_SOURCES)) {
    const source = JSON.parse(await readFile(new URL(relativePath, REPOSITORY_ROOT), 'utf8'));
    assert.deepEqual(
      contractShape(APIFY_INPUT_SCHEMAS[schemaKey]),
      contractShape(source),
      schemaKey,
    );
  }
});

test('embedded RapidAPI contracts match the four real OpenAPI operations', async () => {
  const contracts = {
    secEdgarCorporateFilings: ['sec-edgar-api.json', '/v1/sec-edgar/filings'],
    clinicaltrialsStudies: ['clinical-trials-api.json', '/v1/clinical-trials/studies'],
    openfdaRecalls: ['openfda-recalls-api.json', '/v1/openfda/records'],
    sgGreenMarkBuildings: ['sg-green-mark-api.json', '/v1/sg-green-mark/certificates'],
  };
  for (const [schemaKey, [file, path]] of Object.entries(contracts)) {
    const document = JSON.parse(await readFile(
      new URL(`pipelines/rapidapi_hub/openapi/${file}`, REPOSITORY_ROOT),
      'utf8',
    ));
    const properties = Object.fromEntries(
      document.paths[path].get.parameters.map((parameter) => [parameter.name, parameter.schema]),
    );
    assert.deepEqual(
      contractShape(RAPIDAPI_QUERY_SCHEMAS[schemaKey]),
      contractShape({ type: 'object', properties }),
      schemaKey,
    );
  }
});

test('all typed methods reject schema violations before authentication or transport', async () => {
  const client = new OpenGovDataClient();
  const invalidCases = [
    ['atsJobsHiringSignals', { preset: 'unknown' }],
    ['secEdgarIntelligence', { mode: 'search' }],
    ['globalPublicTenders', { sourceTimeoutSecs: 31 }],
    ['pharmaPipelineIntelligence', { query: '' }],
    ['usaspendingContracts', { awardCategory: 'loans' }],
    ['clinicalTrials', { status: 'PENDING' }],
    ['ukGovTenders', { keyword: 'x'.repeat(121) }],
    ['sgGreenMark', { rating: 'Silver' }],
    ['secEdgarCorporateFilings', { limit: 21 }],
    ['clinicaltrialsStudies', { status: '' }],
    ['openfdaRecalls', { dataset: 'other' }],
    ['sgGreenMarkBuildings', { rating: '' }],
  ];
  for (const [method, input] of invalidCases) {
    await assert.rejects(client[method](input), { code: 'INPUT_SCHEMA_INVALID' }, method);
  }
  await assert.rejects(
    client.atsJobsHiringSignals({ misspelledPreset: 'ai_leaders' }),
    { code: 'INPUT_SCHEMA_INVALID' },
  );
});

test('typed actors cannot raise the configured client charge ceiling', async () => {
  const client = new OpenGovDataClient({
    apifyToken: `apify_api_${'C'.repeat(32)}`,
    maxTotalChargeUsd: '0.10',
  });
  await assert.rejects(
    client.secEdgarIntelligence({ mode: 'filings' }, { maxTotalChargeUsd: '0.100001' }),
    { code: 'COST_LIMIT_EXCEEDED' },
  );
});
