# Open Government Data CI

A dependency-free Node 20 GitHub Action that fetches a bounded snapshot from one of eight public, commercial government-data integrations and writes safe JSON or CSV. Runtime and verification use only Node built-ins; there is no build step, lockfile, `node_modules`, or `@actions/core`.

The two private Hong Kong Actors are deliberately absent from the compiled allowlist and documentation.

## Supported targets

| `target` | Provider | Public integration |
| --- | --- | --- |
| `apify-sec-edgar` | Apify | SEC EDGAR — `8LFIbRbidiHPknMz5` |
| `apify-clinicaltrials` | Apify | ClinicalTrials.gov — `KchE3qKKrwU0rCe9f` |
| `apify-uk-gov-tenders` | Apify | UK Government Tenders — `txnvyTckeQx4hVBc6` |
| `apify-sg-green-mark` | Apify | Singapore BCA Green Mark — `Z3ioK0wOAeczj6nCx` |
| `rapidapi-sec-edgar-corporate-filings` | RapidAPI | `sec-edgar-corporate-filings` |
| `rapidapi-clinicaltrials-gov-studies-trials` | RapidAPI | `clinicaltrials-gov-studies-trials` |
| `rapidapi-openfda-recalls-enforcement-approvals` | RapidAPI | `openfda-recalls-enforcement-approvals` |
| `rapidapi-singapore-bca-green-mark-buildings` | RapidAPI | `singapore-bca-green-mark-buildings` |

RapidAPI target hosts are fixed to `<slug>.p.rapidapi.com`. `rapidapi_path` may choose an endpoint on that host, while `input_json` becomes query parameters. Each run makes exactly one request and never retries, so a transient error cannot create duplicate paid calls.

## Usage

```yaml
- id: govdata
  uses: your-org/open-government-data-ci@v1
  with:
    target: apify-uk-gov-tenders
    apify_token: ${{ secrets.APIFY_TOKEN }}
    input_json: '{"maxItems":10}'
    max_total_charge_usd: "0.25"
    output_format: csv
    output_path: data/uk-tenders.csv
```

For RapidAPI, use `rapidapi_key` instead of `apify_token`:

```yaml
- uses: your-org/open-government-data-ci@v1
  with:
    target: rapidapi-openfda-recalls-enforcement-approvals
    rapidapi_key: ${{ secrets.RAPIDAPI_KEY }}
    rapidapi_path: /recalls
    input_json: '{"limit":10}'
```

See [`examples/scheduled-open-gov-data.yml`](examples/scheduled-open-gov-data.yml) for a scheduled workflow.

## Budget and security behavior

- `max_total_charge_usd` defaults to USD 0.25 and validation rejects zero, negative, malformed, or greater-than-USD-5 values. For Apify, the validated value is sent as the platform-native `maxTotalChargeUsd` hard limit. RapidAPI offers no per-request budget parameter, so this Action performs exactly one request without retries; the RapidAPI subscription/plan remains the authoritative billing ceiling.
- Only the eight compiled HTTPS origins are reachable. A RapidAPI path cannot change the origin. Production redirects are rejected.
- Secrets are registered with the runner through the native `::add-mask::` workflow command before any request or validation output.
- Responses are streamed into a bounded buffer (5 MiB by default, hard maximum 10 MiB).
- Output paths must stay below `GITHUB_WORKSPACE`; absolute paths, `..`, symlinks, and extension mismatches are rejected.
- CSV cells that could be interpreted as spreadsheet formulas are prefixed with an apostrophe, then RFC 4180 quoted.
- `GITHUB_OUTPUT` uses fresh cryptographic delimiters that are checked against each value. Step Summary content is escaped and contains no response records or secrets.

`max_items` limits records written. Provider-side inputs should also request a small page; the default is 10.

## Outputs

The Action writes `output_path`, `item_count`, `format`, `target`, `provider`, and `max_total_charge_usd` to `GITHUB_OUTPUT`, and appends a compact status table to `GITHUB_STEP_SUMMARY`.

## Offline verification

Requires Node 20 or newer:

```sh
node verify.mjs
```

The verifier runs the complete `node --test` suite, including local loopback HTTP checks for success, redirect refusal, and response-size enforcement. It makes no internet or paid provider calls and writes reproducible results plus artifact hashes to `evidence.json`.
