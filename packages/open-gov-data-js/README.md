# open-gov-data-sdk

`open-gov-data-sdk` is a publish-ready, zero-dependency Node.js 20+ ESM SDK and `open-gov-data` CLI for eight allowlisted paid public-government-data products. Runtime and verification code use only Node built-ins; the package has no runtime, development, peer, optional, or build dependencies. TypeScript support comes from a complete handwritten `src/index.d.ts`, so no transpilation step is required.

中文摘要：`open-gov-data-sdk` 是零第三方运行时与构建依赖的 Node.js 20+ ESM SDK 和命令行工具，统一封装 4 款公开 Apify 付费 Actor 与 4 款 RapidAPI 政府开放数据 API。目录是闭合白名单，不接受任意 Actor ID、主机或生产 URL，也不包含任何私有香港 Actor。本工作区不会执行 `npm publish`；发布必须由持有人或 CI 在复核后显式完成。

## Supported products

| Provider | Source key | Product | Fixed identifier or route |
| --- | --- | --- | --- |
| Apify | `secEdgar` | SEC EDGAR Corporate Filings | `8LFIbRbidiHPknMz5` |
| Apify | `clinicalTrials` | ClinicalTrials.gov Studies & Trials | `KchE3qKKrwU0rCe9f` |
| Apify | `ukGovTenders` | UK Government Tenders | `txnvyTckeQx4hVBc6` |
| Apify | `singaporeGreenMark` | Singapore BCA Green Mark Buildings | `Z3ioK0wOAeczj6nCx` |
| RapidAPI | `secEdgar` | SEC EDGAR Corporate Filings | `sec-edgar-corporate-filings` · `/v1/sec-edgar/filings` |
| RapidAPI | `clinicalTrials` | ClinicalTrials.gov Studies & Trials | `clinicaltrials-gov-studies-trials` · `/v1/clinical-trials/studies` |
| RapidAPI | `openFda` | openFDA Recalls, Enforcement & Approvals | `openfda-recalls-enforcement-approvals` · `/v1/openfda/records` |
| RapidAPI | `singaporeGreenMark` | Singapore BCA Green Mark Buildings | `singapore-bca-green-mark-buildings` · `/v1/sg-green-mark/certificates` |

## Install after publication

```text
npm install open-gov-data-sdk
```

The package is ESM-only. It works directly from JavaScript and supplies its own types to TypeScript editors and compilers.

## SDK

Pass credentials explicitly, or load `APIFY_TOKEN` and `RAPIDAPI_KEY`/`X_RAPIDAPI_KEY` with `OpenGovDataClient.fromEnv()`.

```js
import { OpenGovDataClient } from 'open-gov-data-sdk';

const client = OpenGovDataClient.fromEnv({
  maxTotalChargeUsd: '0.25',
  timeoutMs: 30_000,
});

const filings = await client.records(
  'apify',
  'secEdgar',
  {
    mode: 'search',
    query: 'artificial intelligence',
    forms: '10-K,10-Q,8-K',
    startDate: '2026-01-01',
  },
  { maxItems: 10, maxTotalChargeUsd: '0.10' },
);

const recalls = await client.records(
  'rapidapi',
  'openFda',
  { dataset: 'drug_enforcement', classification: 'Class I' },
  { maxItems: 10 },
);
```

Use `runActor()` and `queryRapidApi()` for provider-specific calls, or `request()` and `records()` for a unified interface. `records()` unwraps common `items`, `results`, `records`, and `data` envelopes. Decoded JSON otherwise remains unchanged.

## Cost and request safety

- `maxTotalChargeUsd` defaults to `$0.25`, is normalized with exact decimal arithmetic, and must be from `$0.00005` to `$100`.
- Every Apify request sends the cap as a server-side `maxTotalChargeUsd` query parameter. A per-request value may lower the client's hard ceiling but can never raise it.
- RapidAPI has no equivalent per-request dollar cap. The SDK rejects any attempt to claim one and instead forces `limit` from `maxItems` (default 10, maximum 1,000). Subscription quota and pricing remain controlled by the user's RapidAPI plan.
- Calls make one attempt only. No automatic retry can duplicate a paid operation.
- Actor IDs, API hosts, and paths come only from the frozen catalog. Test endpoint overrides accept explicit-port loopback origins only.
- Redirects are returned in manual mode and rejected before following the `Location` target.
- Successful bodies are streamed through a 10 MB hard limit. Oversized `Content-Length` values are rejected before reading the body.
- Upstream error bodies and underlying transport messages are discarded.
- Inputs reject credential-like field names recursively, non-JSON values, cycles, accessors, non-finite numbers, excessive depth, and payloads over 1 MB.

Credentials live in JavaScript private fields. `JSON.stringify(client)`, `util.inspect(client)`, `JSON.stringify(error)`, `util.inspect(error)`, and `safeError(error)` expose only sanitized metadata. Do not put credentials in request input or command arguments.

## CLI

The CLI reads credentials only from environment variables, not command-line flags.

```text
open-gov-data catalog

open-gov-data apify secEdgar \
  --input-json '{"mode":"search","query":"climate"}' \
  --max-items 10 \
  --max-total-charge-usd 0.10

open-gov-data rapidapi openFda \
  --input-json '{"dataset":"drug_enforcement","classification":"Class I"}' \
  --max-items 10
```

`--input-file <path>` avoids large JSON in shell history. Expected failures are emitted as stable, compact JSON, for example `{"code":"HTTP_429","message":"Upstream request failed with HTTP 429","statusCode":429}`.

## Offline verification

From this directory:

```text
node verify.mjs
```

The verifier runs all `node --test` unit, CLI, and real local-loopback HTTP tests, performs static zero-dependency and export checks, runs `npm pack --dry-run --json`, validates the package file list, and atomically writes `evidence.json`. It does not install packages, contact the paid APIs, publish to npm, or read repository credentials.

Individual gates are also available:

```text
npm test
npm pack --dry-run
```

## License and upstream data

SDK code is MIT licensed. Upstream datasets retain their own terms: U.S. government public-domain/CC0 sources, UK Open Government Licence data, and Singapore Open Data Licence data. Preserve source attribution fields when redistributing records.
