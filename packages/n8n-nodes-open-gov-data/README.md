# n8n-nodes-open-gov-data

An installable, zero-runtime-dependency n8n community node for eight allowlisted public-data products. It uses only Node 20 built-ins at runtime. `n8n-workflow` is declared as an optional peer for n8n ecosystem compatibility; the package does not import it.

中文摘要：这是一个面向公开政府数据的 n8n 社区节点，统一接入 4 个公开 Apify 付费 Actor 和 4 个 RapidAPI 付费 REST API。节点严格限定数据源，不包含任何私有香港 Actor，不记录密钥，并为 Apify 调用强制传递 `maxTotalChargeUsd` 硬限费参数。

## Supported sources

| Provider | Source | Identifier or path |
| --- | --- | --- |
| Apify | SEC EDGAR Corporate Filings | `8LFIbRbidiHPknMz5` |
| Apify | ClinicalTrials.gov Studies & Trials | `KchE3qKKrwU0rCe9f` |
| Apify | UK Government Tenders | `txnvyTckeQx4hVBc6` |
| Apify | Singapore BCA Green Mark Buildings | `Z3ioK0wOAeczj6nCx` |
| RapidAPI | SEC EDGAR Corporate Filings | `/v1/sec-edgar/filings` |
| RapidAPI | ClinicalTrials.gov Studies & Trials | `/v1/clinical-trials/studies` |
| RapidAPI | openFDA Recalls, Enforcement & Approvals | `/v1/openfda/records` |
| RapidAPI | Singapore BCA Green Mark Buildings | `/v1/sg-green-mark/certificates` |

The catalog is a closed allowlist. Users cannot enter arbitrary Actor IDs, RapidAPI hosts, or URLs.

## Install after the package owner publishes it

This workspace does **not** publish the package. After owner or CI review and publication:

1. In n8n, open **Settings → Community Nodes**.
2. Install `n8n-nodes-open-gov-data`.
3. Add either **Open Gov Data: Apify API** or **Open Gov Data: RapidAPI** credentials.
4. Add the **Open Gov Data** node to a workflow and choose the provider and source.

For local package review, run `npm pack --dry-run --json --ignore-scripts`; no install step or third-party build tool is required.

## Parameters and cost controls

- **Request Input** is a JSON object. It becomes the Actor input for Apify or query parameters for RapidAPI.
- **Max Items** defaults to 10, is limited to 1–1000, and always overrides a `maxItems` value supplied in Request Input.
- **Max Total Charge USD** is required for Apify, defaults to `$0.25`, and is always sent to Apify's synchronous Actor endpoint as `maxTotalChargeUsd`. It cannot be omitted by Request Input.
- **Timeout** defaults to 30 seconds. Every operation makes one attempt only; there are no automatic retries that could duplicate a paid call.

RapidAPI does not expose Apify's `maxTotalChargeUsd` run control. On RapidAPI calls, this node bounds requested rows with **Max Items**; account-plan charges and quotas remain governed by the user's RapidAPI subscription.

Example SEC Actor input:

```json
{
  "mode": "search",
  "query": "artificial intelligence",
  "forms": "10-K,10-Q,8-K",
  "startDate": "2026-01-01"
}
```

Example ClinicalTrials.gov RapidAPI query:

```json
{
  "condition": "type 2 diabetes",
  "status": "RECRUITING",
  "queryTerm": "GLP-1"
}
```

## Credential safety

- Apify tokens must match the modern `apify_api_…` format. RapidAPI keys must be at least 20 URL-safe characters.
- Credentials are accepted only from n8n credential records and sent only in request headers.
- Request Input rejects credential-like fields, including `authorization`, `token`, `APIFY_TOKEN`, and `X-RapidAPI-Key`.
- Upstream error bodies are never copied into node errors. Stable error codes report authentication, HTTP status, invalid JSON, network failure, and timeout without including secrets.
- The implementation contains no logging calls and never places a credential in a URL.

## Offline verification

Requires Node 20 and npm (npm is used only for a local dry-run package manifest):

```text
node verify.mjs
```

The verifier syntax-checks shipped JavaScript, confirms the dependency and n8n metadata contracts, runs offline unit and local-loopback HTTP integration tests, runs `npm pack --dry-run`, and atomically writes `evidence.json`. It never contacts an external service, invokes a paid API, installs dependencies, or publishes to npm.

## Development layout

```text
dist/credentials/             n8n credential descriptions
dist/lib/                     allowlisted catalog and Node 20 fetch client
dist/nodes/OpenGovData/       executable n8n node and icon
test/                         offline and loopback integration tests
verify.mjs                    one-command verification and evidence writer
```

## License

MIT. Upstream public datasets retain their own attribution and reuse terms; workflows should preserve any `attribution` fields returned by the products.
