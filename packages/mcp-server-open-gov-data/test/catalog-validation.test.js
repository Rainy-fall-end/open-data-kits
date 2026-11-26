import assert from 'node:assert/strict';
import test from 'node:test';

import {
  APIFY_ACTOR_IDS,
  createConfig,
  createToolCatalog,
  formatUsdMicros,
  parseUsdMicros,
  RAPIDAPI_SLUGS,
  SchemaValidationError,
  validateAgainstSchema,
} from '../src/index.js';

test('catalog is an exact eight-tool allowlist and excludes private Hong Kong sources', () => {
  const catalog = createToolCatalog(createConfig({}));
  assert.deepEqual(catalog.map((item) => item.name), [
    'rapidapi_sec_edgar_filings',
    'rapidapi_clinical_trials',
    'rapidapi_openfda_records',
    'rapidapi_singapore_green_mark',
    'apify_sec_edgar_filings',
    'apify_clinical_trials',
    'apify_uk_gov_tenders',
    'apify_singapore_green_mark',
  ]);
  assert.deepEqual(catalog.filter((item) => item.provider === 'apify').map((item) => item.actorId), APIFY_ACTOR_IDS);
  assert.deepEqual(catalog.filter((item) => item.provider === 'rapidapi').map((item) => item.apiSlug), RAPIDAPI_SLUGS);
  assert.deepEqual(APIFY_ACTOR_IDS, [
    '8LFIbRbidiHPknMz5',
    'KchE3qKKrwU0rCe9f',
    'txnvyTckeQx4hVBc6',
    'Z3ioK0wOAeczj6nCx',
  ]);
  assert.doesNotMatch(JSON.stringify(catalog), /hk-country-park|cn-gov-tender|hong.?kong/i);
  for (const item of catalog) assert.equal(item.tool.inputSchema.additionalProperties, false);
});

test('strict schemas reject unknown fields, invalid dates, semantic company gaps, and excess caps', () => {
  const config = createConfig({ MCP_APIFY_MAX_TOTAL_CHARGE_USD: '0.10' });
  const catalog = createToolCatalog(config);
  const rapidSec = catalog.find((item) => item.name === 'rapidapi_sec_edgar_filings');
  const actorSec = catalog.find((item) => item.name === 'apify_sec_edgar_filings');

  assert.throws(
    () => validateAgainstSchema({ unexpected: true }, rapidSec.tool.inputSchema),
    SchemaValidationError,
  );
  assert.throws(
    () => validateAgainstSchema({ startDate: '2026-02-30' }, rapidSec.tool.inputSchema),
    /valid calendar date/,
  );
  assert.throws(
    () => validateAgainstSchema({ mode: 'company' }, rapidSec.tool.inputSchema),
    /at least one allowed schema/,
  );
  assert.throws(
    () => validateAgainstSchema({ maxTotalChargeUsd: 0.100001 }, actorSec.tool.inputSchema),
    /at most 0.1/,
  );
  assert.doesNotThrow(() => validateAgainstSchema(
    { mode: 'company', ticker: 'AAPL', maxItems: 7, maxTotalChargeUsd: 0.1 },
    actorSec.tool.inputSchema,
  ));
});

test('charge settings use exact micro-dollars and clamp the default to a lower environment cap', () => {
  assert.equal(parseUsdMicros('0.25'), 250_000);
  assert.equal(parseUsdMicros(0.125), 125_000);
  assert.equal(formatUsdMicros(125_000), '0.125');
  assert.throws(() => parseUsdMicros('1e-3'), /positive decimal/);
  assert.throws(() => parseUsdMicros(0.0000001), /six decimal places/);

  const config = createConfig({ MCP_APIFY_MAX_TOTAL_CHARGE_USD: '0.05' });
  assert.equal(config.hardChargeMicros, 50_000);
  assert.equal(config.defaultChargeMicros, 50_000);
});

test('test endpoint overrides accept loopback only and only in test mode', () => {
  assert.equal(
    createConfig({ NODE_ENV: 'test', MCP_TEST_APIFY_BASE_URL: 'http://127.0.0.1:1234' }).apifyBaseUrl,
    'http://127.0.0.1:1234',
  );
  assert.throws(
    () => createConfig({ NODE_ENV: 'test', MCP_TEST_APIFY_BASE_URL: 'https://example.com' }),
    /loopback/,
  );
  assert.throws(
    () => createConfig({ MCP_TEST_APIFY_BASE_URL: 'http://127.0.0.1:1234' }),
    /NODE_ENV=test/,
  );
});
