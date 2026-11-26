# n8n-nodes-open-gov-data

A zero-runtime-dependency n8n community node for 12 allowlisted, public-data products. Version `0.2.0` uses only Node 20 built-ins, keeps the v0.1 node and credential identities, validates request fields against the repository contracts, and applies a hard Apify charge ceiling of `$0.25` per run.

## Operations

| Provider | Operation value | Product | Fixed identifier or path |
| --- | --- | --- | --- |
| Apify | `atsJobsHiringSignals` | ATS Jobs & Hiring Signals | `CRulq5dak4mqAUmMn` |
| Apify | `secEdgarIntelligence` | SEC EDGAR Intelligence | `8LFIbRbidiHPknMz5` |
| Apify | `globalPublicTenders` | Global Public Tenders & Grants | `ZlabhlvEIyRVdtKiQ` |
| Apify | `pharmaPipelineIntelligence` | Pharma & Biotech Pipeline Intelligence | `re8aRvtqBonP5HMuY` |
| Apify | `usaspendingContracts` | USAspending Contracts & Grants | `eQQ2beomyLlW4DTGM` |
| Apify | `clinicalTrials` | ClinicalTrials.gov Studies | `KchE3qKKrwU0rCe9f` |
| Apify | `ukGovTenders` | UK Government Tenders | `txnvyTckeQx4hVBc6` |
| Apify | `sgGreenMark` | Singapore BCA Green Mark Buildings | `Z3ioK0wOAeczj6nCx` |
| RapidAPI | `secEdgarCorporateFilings` | SEC EDGAR Corporate Filings | `/v1/sec-edgar/filings` |
| RapidAPI | `clinicaltrialsStudies` | ClinicalTrials.gov Studies | `/v1/clinical-trials/studies` |
| RapidAPI | `openfdaRecalls` | openFDA Recalls, Enforcement & Approvals | `/v1/openfda/records` |
| RapidAPI | `sgGreenMarkBuildings` | Singapore BCA Green Mark Buildings | `/v1/sg-green-mark/certificates` |

The catalog is closed: workflows cannot supply Actor IDs, API hosts, endpoint paths, or arbitrary URLs. The SEC Actor supports `form_d_funding`, `xbrl_financials`, and `filings` modes.

## Install

After the package owner publishes it:

1. Open **Settings → Community Nodes** in n8n.
2. Install `n8n-nodes-open-gov-data`.
3. Add **Open Gov Data: Apify API** and/or **Open Gov Data: RapidAPI** credentials.
4. Add **Open Gov Data** to a workflow and choose the provider and operation.

This workspace does not publish or install the package.

## Parameters and billing controls

- **Request Input** is a JSON object. Only fields present in the selected Actor input schema or RapidAPI OpenAPI query contract are accepted.
- **Max Items** defaults to `10`. It always replaces `maxItems` for Actors and `limit` for RapidAPI. RapidAPI operations allow at most 20 rows; each Actor retains its repository-defined maximum.
- **Max Total Charge USD** is shown only for Apify, defaults to `0.25`, and cannot exceed `0.25`. It is sent as the server-side `maxTotalChargeUsd` query parameter and never placed in the Actor input body.
- **Timeout** defaults to 30 seconds. Calls are single-attempt, do not follow redirects, and reject responses larger than 10 MiB.

Example SEC funding input:

```json
{
  "mode": "form_d_funding",
  "query": "artificial intelligence",
  "excludePooledFunds": true,
  "minOfferingAmountUsd": 1000000
}
```

Example SEC XBRL input:

```json
{
  "mode": "xbrl_financials",
  "ticker": "AAPL",
  "forms": "10-K,10-Q"
}
```

Example openFDA query:

```json
{
  "dataset": "drug_enforcement",
  "classification": "Class I",
  "status": "Ongoing"
}
```

## v0.1 compatibility

The n8n node name remains `openGovData`; credential names remain `openGovDataApifyApi` and `openGovDataRapidApi`; node type version remains `1`; parameter names and provider values are unchanged. Saved v0.1 source values are resolved internally to the corresponding v0.2 canonical operation, but aliases are not shown as duplicate products in the dropdown.

## Credential and network safety

- Credentials come only from n8n credential records and are sent only in request headers.
- Credential-like input fields and any input value containing the active credential are rejected before HTTP.
- Response strings containing the active credential are replaced with `[REDACTED]`; error messages never include URLs, response bodies, input values, or credentials.
- Runtime destinations are fixed by the catalog. Test endpoint overrides require an explicit opt-in and accept only an uncredentialed `http://127.0.0.1`, `http://[::1]`, or `http://localhost` origin.
- The node performs no retries and rejects redirects.

## Offline verification

From this directory, with Node 20+ and npm available:

```text
node verify.mjs
```

The verifier checks JavaScript syntax, exact n8n metadata, the 12-operation allowlist, v0.1 aliases, all eight repository Actor schemas, all four repository OpenAPI operations, and package contents. It runs all tests, sends all 12 operations through a real `127.0.0.1` HTTP mock, proves the cap/SSRF/redaction guards, runs `npm pack --dry-run` in offline mode, makes no external calls, and atomically writes `evidence.json`.

## Layout

```text
credentials/                 n8n credential descriptions
lib/                         catalog, schema validation, and HTTP client
nodes/OpenGovData/           backwards-compatible n8n node and icon
tests/                       offline and loopback tests
verify.mjs                   deterministic one-command verifier
evidence.json                generated verification evidence
```

## License

MIT. Upstream datasets retain their own attribution and reuse terms. Preserve returned `attribution`, source URL, and licence fields in downstream workflows.
