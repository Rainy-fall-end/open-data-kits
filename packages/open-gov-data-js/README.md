# open-gov-data

`open-gov-data` is a zero-runtime-dependency ESM SDK for Node.js 20+. Version 0.2.0 exposes typed helpers for eight allowlisted public Apify Actors and four allowlisted RapidAPI endpoints while retaining the v0.1.0 generic client, exports, source keys, validation helpers, and CLI.

## Install

```bash
npm install open-gov-data
```

Set credentials in the environment or pass them to `OpenGovDataClient`. Request inputs never accept credentials, and client inspection/JSON output never exposes them.

```js
import { OpenGovDataClient } from 'open-gov-data';

const client = OpenGovDataClient.fromEnv();

const funding = await client.secEdgarIntelligence({
  mode: 'form_d_funding',
  query: 'artificial intelligence',
  excludePooledFunds: true,
  maxItems: 25,
});

const recalls = await client.openfdaRecalls({
  dataset: 'drug_enforcement',
  classification: 'Class I',
  limit: 10,
});
```

Apify calls include the server-side `maxTotalChargeUsd=0.25` cap by default. A client or request may lower that cap; a request cannot raise the client ceiling. RapidAPI does not provide an equivalent per-request dollar cap, so its typed helpers enforce the endpoint's `limit` range of 1–20 instead.

## Typed helpers

| Provider | Method | Fixed product |
| --- | --- | --- |
| Apify | `atsJobsHiringSignals()` | `CRulq5dak4mqAUmMn` |
| Apify | `secEdgarIntelligence()` | `8LFIbRbidiHPknMz5`; modes `form_d_funding`, `xbrl_financials`, `filings` |
| Apify | `globalPublicTenders()` | `ZlabhlvEIyRVdtKiQ` |
| Apify | `pharmaPipelineIntelligence()` | `re8aRvtqBonP5HMuY` |
| Apify | `usaspendingContracts()` | `eQQ2beomyLlW4DTGM` |
| Apify | `clinicalTrials()` | `KchE3qKKrwU0rCe9f` |
| Apify | `ukGovTenders()` | `txnvyTckeQx4hVBc6` |
| Apify | `sgGreenMark()` | `Z3ioK0wOAeczj6nCx` |
| RapidAPI | `secEdgarCorporateFilings()` | `/v1/sec-edgar/filings` |
| RapidAPI | `clinicaltrialsStudies()` | `/v1/clinical-trials/studies` |
| RapidAPI | `openfdaRecalls()` | `/v1/openfda/records` |
| RapidAPI | `sgGreenMarkBuildings()` | `/v1/sg-green-mark/certificates` |

The eight Apify input interfaces and four RapidAPI query interfaces are declared in `src/index.d.ts`. Typed helpers reject misspelled properties and validate types, enum values, lengths, and numeric bounds before authentication or transport. The embedded Apify contracts are parity-checked against the repository's real `.actor/input_schema.json` files by `verify.mjs`.

An `options.maxItems` value overrides `input.maxItems` or `query.limit`. Apify helpers use each Actor schema's own maximum. RapidAPI helpers use the endpoint maximum of 20.

## v0.1.0 compatibility

The following generic API remains available:

```js
const client = new OpenGovDataClient({
  apifyToken: process.env.APIFY_TOKEN,
  rapidApiKey: process.env.RAPIDAPI_KEY,
});

await client.runActor('secEdgar', { query: 'climate' }, { maxItems: 10 });
await client.queryRapidApi('openFda', { dataset: 'drug_enforcement' }, { maxItems: 5 });
await client.request('apify', 'clinicalTrials', { condition: 'diabetes' });
await client.records('rapidapi', 'singaporeGreenMark', { rating: 'Gold' });
```

All v0.1.0 runtime export names remain present, including `APIFY_SOURCES`, `RAPIDAPI_SOURCES`, `getCatalog`, `OpenGovDataClient`, `OpenGovDataError`, `safeError`, `extractRecords`, the validation constants/functions, `USAGE`, and `cliMain`. Legacy source keys remain accepted. New semantic catalog aliases are non-enumerable, so the catalog still contains exactly eight distinct Actors and four distinct RapidAPI products.

## CLI

```bash
open-gov-data catalog --compact
open-gov-data apify secEdgar --input-json '{"query":"climate"}' --max-items 10
open-gov-data rapidapi openFda --input-json '{"dataset":"drug_enforcement"}' --max-items 5
```

Credentials come only from `APIFY_TOKEN` and `RAPIDAPI_KEY`/`X_RAPIDAPI_KEY`.

## Verification

```bash
npm test
npm run verify
```

`verify.mjs` runs syntax/static checks, schema parity checks, the complete offline and `127.0.0.1` HTTP suite, direct v0.1.0 compatibility checks, and `npm pack --dry-run --json`. It prevents non-loopback SDK requests during the test process and writes reproducible results to `evidence.json`. It never publishes a package or makes a paid API call.

## License

MIT
