import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inspect } from 'node:util';
import test from 'node:test';

import {
  APIFY_SOURCES,
  RAPIDAPI_SOURCES,
  OpenGovDataClient,
  OpenGovDataError,
  compareMaxTotalChargeUsd,
  extractRecords,
  getCatalog,
  parseInput,
  rapidApiQueryValue,
  safeError,
  validateCredential,
  validateMaxItems,
  validateMaxTotalChargeUsd,
  validateTimeoutMs,
} from '../src/index.js';

const APIFY_TOKEN = `apify_api_${'A'.repeat(32)}`;
const RAPIDAPI_KEY = `rapid_${'B'.repeat(32)}`;

test('catalog contains exactly the eight approved public products', () => {
  assert.deepEqual(
    Object.values(APIFY_SOURCES).map((source) => source.actorId),
    ['8LFIbRbidiHPknMz5', 'KchE3qKKrwU0rCe9f', 'txnvyTckeQx4hVBc6', 'Z3ioK0wOAeczj6nCx'],
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
  assert.equal(Object.keys(APIFY_SOURCES).length, 4);
  assert.equal(Object.keys(RAPIDAPI_SOURCES).length, 4);
  assert.doesNotMatch(JSON.stringify(getCatalog()), /hong[ -]?kong|private[_-]?hk/i);
});

test('catalog definitions and maps are immutable while getCatalog returns copies', () => {
  assert.throws(() => {
    APIFY_SOURCES.custom = APIFY_SOURCES.secEdgar;
  }, TypeError);
  assert.throws(() => {
    APIFY_SOURCES.secEdgar.actorId = 'other';
  }, TypeError);
  const copy = getCatalog();
  copy.apify[0].actorId = 'caller-copy';
  assert.equal(APIFY_SOURCES.secEdgar.actorId, '8LFIbRbidiHPknMz5');
});

test('credential validation is strict and never echoes rejected credentials', () => {
  assert.equal(validateCredential('apify', APIFY_TOKEN), APIFY_TOKEN);
  assert.equal(validateCredential('rapidapi', RAPIDAPI_KEY), RAPIDAPI_KEY);
  for (const [provider, credential] of [
    ['apify', 'apify_api_short'],
    ['apify', `${APIFY_TOKEN} `],
    ['rapidapi', 'too-short'],
    ['rapidapi', `${RAPIDAPI_KEY}\n`],
  ]) {
    assert.throws(
      () => validateCredential(provider, credential),
      (error) => {
        assert.ok(error instanceof OpenGovDataError);
        assert.equal(error.code, 'AUTH_INVALID');
        assert.doesNotMatch(`${error} ${inspect(error)} ${JSON.stringify(error)}`, new RegExp(credential.trim()));
        return true;
      },
    );
  }
});

test('client JSON and custom inspection expose configuration but not credentials', () => {
  const client = new OpenGovDataClient({
    apifyToken: APIFY_TOKEN,
    rapidApiKey: RAPIDAPI_KEY,
    maxTotalChargeUsd: '0.2500',
  });
  const rendered = `${inspect(client)} ${JSON.stringify(client)}`;
  assert.doesNotMatch(rendered, new RegExp(APIFY_TOKEN));
  assert.doesNotMatch(rendered, new RegExp(RAPIDAPI_KEY));
  assert.deepEqual(client.toJSON(), {
    name: 'OpenGovDataClient',
    apifyConfigured: true,
    rapidApiConfigured: true,
    maxTotalChargeUsd: '0.25',
    timeoutMs: 30_000,
  });
});

test('money limits are normalized exactly and per-request cap cannot rise', async () => {
  assert.equal(validateMaxTotalChargeUsd('0.12500'), '0.125');
  assert.equal(validateMaxTotalChargeUsd(1e-4), '0.0001');
  assert.equal(compareMaxTotalChargeUsd('0.10000000000000001', '0.1'), 1);
  for (const invalid of [true, 0, -1, 101, Number.POSITIVE_INFINITY, 'NaN', ' 0.25']) {
    assert.throws(() => validateMaxTotalChargeUsd(invalid), { code: 'COST_LIMIT_INVALID' });
  }

  const client = new OpenGovDataClient({
    apifyToken: APIFY_TOKEN,
    maxTotalChargeUsd: '0.10',
  });
  await assert.rejects(
    client.runActor('clinicalTrials', {}, { maxTotalChargeUsd: '0.10000000000000001' }),
    { code: 'COST_LIMIT_EXCEEDED' },
  );
});

test('RapidAPI rejects any false server-side USD cap promise', async () => {
  const client = new OpenGovDataClient({ rapidApiKey: RAPIDAPI_KEY });
  await assert.rejects(
    client.queryRapidApi('openFda', {}, { maxTotalChargeUsd: '0.25' }),
    { code: 'COST_LIMIT_UNSUPPORTED' },
  );
  await assert.rejects(
    client.request('rapidapi', 'openFda', {}, { maxTotalChargeUsd: '0.25' }),
    { code: 'COST_LIMIT_UNSUPPORTED' },
  );
});

test('input validation clones JSON and rejects secrets, cycles, accessors, and non-finite values', () => {
  const original = { query: 'climate', nested: { values: [1, 2] } };
  const clone = parseInput(original);
  original.nested.values.push(3);
  assert.deepEqual(clone, { query: 'climate', nested: { values: [1, 2] } });

  for (const key of ['authorization', 'Authorization', 'APIFY_TOKEN', 'x-rapidapi-key', 'password']) {
    assert.throws(
      () => parseInput({ nested: { [key]: APIFY_TOKEN } }),
      { code: 'INPUT_SECRET_FIELD' },
    );
  }
  const cyclic = {};
  cyclic.self = cyclic;
  const withAccessor = {};
  Object.defineProperty(withAccessor, 'query', { enumerable: true, get: () => 'unsafe' });
  for (const invalid of ['{bad', [], { value: Number.NaN }, cyclic, withAccessor, { value: 1n }]) {
    assert.throws(() => parseInput(invalid), { code: 'INPUT_INVALID' });
  }
});

test('numeric and RapidAPI query validation remains deliberately narrow', () => {
  assert.equal(validateMaxItems(1), 1);
  assert.equal(validateMaxItems(1000), 1000);
  assert.equal(validateTimeoutMs(100), 100);
  assert.equal(validateTimeoutMs(300_000), 300_000);
  for (const invalid of [true, 0, 1001, 1.5, '10']) {
    assert.throws(() => validateMaxItems(invalid), { code: 'MAX_ITEMS_INVALID' });
  }
  assert.equal(rapidApiQueryValue(['ongoing', 'completed']), 'ongoing,completed');
  assert.equal(rapidApiQueryValue(true), 'true');
  assert.equal(rapidApiQueryValue(null), null);
  assert.throws(() => rapidApiQueryValue({ arbitrary: 'json' }), { code: 'INPUT_INVALID' });
});

test('unknown provider, source, and non-loopback endpoints fail closed', async () => {
  const client = new OpenGovDataClient();
  await assert.rejects(client.request('custom', 'anything'), { code: 'PROVIDER_NOT_ALLOWED' });
  await assert.rejects(client.runActor('privateHongKong'), { code: 'SOURCE_NOT_ALLOWED' });
  await assert.rejects(client.queryRapidApi('arbitraryUrl'), { code: 'SOURCE_NOT_ALLOWED' });
  assert.throws(
    () => new OpenGovDataClient({ testing: { rapidApiBaseUrl: 'https://example.invalid' } }),
    { code: 'ENDPOINT_INVALID' },
  );
  assert.throws(
    () => new OpenGovDataClient({ testing: { apifyBaseUrl: 'http://localhost:not-a-port' } }),
    { code: 'ENDPOINT_INVALID' },
  );
});

test('safe errors and record envelope normalization are stable', () => {
  const expected = { code: 'UNKNOWN_ERROR', message: 'Open Gov Data request failed' };
  assert.deepEqual(safeError(new Error(`never expose ${RAPIDAPI_KEY}`)), expected);
  assert.deepEqual(extractRecords({ results: [1, 2] }), [1, 2]);
  assert.deepEqual(extractRecords(null), []);
  assert.deepEqual(extractRecords('value'), [{ value: 'value' }]);
});

test('package metadata declares ESM, Node 20, handwritten types, bin, and zero dependencies', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.type, 'module');
  assert.equal(packageJson.engines.node, '>=20');
  assert.equal(packageJson.types, './src/index.d.ts');
  assert.equal(packageJson.bin['open-gov-data'], './bin/open-gov-data.js');
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    assert.equal(packageJson[field], undefined);
  }
  const declarations = await readFile(new URL('../src/index.d.ts', import.meta.url), 'utf8');
  for (const symbol of [
    'OpenGovDataClient',
    'OpenGovDataError',
    'ApifySourceKey',
    'RapidApiSourceKey',
    'ApifyRequestOptions',
    'RapidApiRequestOptions',
    'cliMain',
  ]) {
    assert.match(declarations, new RegExp(`\\b${symbol}\\b`));
  }
});
