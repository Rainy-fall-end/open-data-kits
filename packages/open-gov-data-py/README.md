# open-gov-data

`open-gov-data` is a publish-ready, zero-runtime-dependency Python 3.11+ SDK and CLI for eight allowlisted paid public-data products. Runtime code uses only the Python standard library (`urllib`, `json`, `dataclasses`, `argparse`, and related built-ins).

中文摘要：`open-gov-data` 是一个可发布到 PyPI 的纯标准库 Python SDK 与命令行工具，统一访问 4 款公开 Apify 付费 Actor 和 4 款 RapidAPI 付费政府开放数据 API。它不包含任何私有香港 Actor，不记录凭证，并为每次 Apify 运行强制传递 `maxTotalChargeUsd` 硬限费参数。

This workspace does not publish the package. Publication remains an explicit owner or CI action after review.

## Supported sources

The catalog is closed: callers choose a source key and cannot supply arbitrary Actor IDs, API hosts, routes, or production base URLs.

| Provider | SDK source key | Product | Fixed identifier |
| --- | --- | --- | --- |
| Apify | `sec_edgar` | SEC EDGAR Corporate Filings | `8LFIbRbidiHPknMz5` |
| Apify | `clinical_trials` | ClinicalTrials.gov Studies & Trials | `KchE3qKKrwU0rCe9f` |
| Apify | `uk_gov_tenders` | UK Government Tenders | `txnvyTckeQx4hVBc6` |
| Apify | `singapore_green_mark` | Singapore BCA Green Mark Buildings | `Z3ioK0wOAeczj6nCx` |
| RapidAPI | `sec_edgar` | SEC EDGAR Corporate Filings | `sec-edgar-corporate-filings` · `/v1/sec-edgar/filings` |
| RapidAPI | `clinical_trials` | ClinicalTrials.gov Studies & Trials | `clinicaltrials-gov-studies-trials` · `/v1/clinical-trials/studies` |
| RapidAPI | `openfda` | openFDA Recalls, Enforcement & Approvals | `openfda-recalls-enforcement-approvals` · `/v1/openfda/records` |
| RapidAPI | `singapore_green_mark` | Singapore BCA Green Mark Buildings | `singapore-bca-green-mark-buildings` · `/v1/sg-green-mark/certificates` |

## Install after publication

```text
python -m pip install open-gov-data
```

The package has no runtime dependencies. Its in-tree PEP 517 backend also has no build dependencies.

## Python SDK

Credentials are passed explicitly or loaded from `APIFY_TOKEN` and `RAPIDAPI_KEY` (also `X_RAPIDAPI_KEY`). Credential fields are excluded from object representations and never copied to exception messages.

```python
from open_gov_data import OpenGovDataClient

client = OpenGovDataClient.from_env(max_total_charge_usd="0.25")

filings = client.records(
    "apify",
    "sec_edgar",
    {
        "mode": "search",
        "query": "artificial intelligence",
        "forms": "10-K,10-Q,8-K",
        "startDate": "2026-01-01",
    },
    max_items=10,
)

recalls = client.records(
    "rapidapi",
    "openfda",
    {"dataset": "drug_enforcement", "classification": "Class I"},
    max_items=10,
)
```

`run_actor()` and `query_rapidapi()` expose the provider-specific operations directly. `request()` and `records()` provide a unified interface. Responses stay as decoded JSON; `records()` additionally unwraps common `items`, `results`, `records`, and `data` envelopes.

## Cost and request safety

- `max_total_charge_usd` defaults to `$0.25`, must be between `$0.00005` and `$100`, and is always sent to Apify as `maxTotalChargeUsd`.
- A per-call Actor cap may lower the client's hard cap but can never raise it.
- `max_items` defaults to 10 and is restricted to 1–1,000. It overrides user input as Actor `maxItems` or RapidAPI `limit`.
- RapidAPI does not expose an Apify-style per-request dollar cap. The SDK therefore enforces the returned-row limit, while subscription pricing and quota remain controlled by the user's RapidAPI plan.
- Requests make one attempt only. There are no automatic retries that could repeat a paid operation.
- Redirects are blocked, response bodies are size-limited, and upstream error bodies are discarded.
- Inputs reject credential-like keys recursively and reject cyclic, oversized, non-JSON, non-finite, or excessively nested values.

## CLI

The CLI accepts credentials only from environment variables, keeping secrets out of command history and process arguments.

```text
open-gov-data catalog

open-gov-data apify sec_edgar \
  --input-json '{"mode":"search","query":"climate"}' \
  --max-items 10 \
  --max-total-charge-usd 0.10

open-gov-data rapidapi openfda \
  --input-json '{"dataset":"drug_enforcement","classification":"Class I"}' \
  --max-items 10
```

Expected failures are emitted as stable JSON objects such as `{"code":"HTTP_429","message":"Upstream request failed with HTTP 429","status_code":429}`. Neither upstream response bodies nor underlying network exception text is exposed.

## Offline verification

From this directory, run:

```text
python verify.py
```

The verifier performs syntax and standard-library import checks, runs the complete `unittest` suite including real local-loopback HTTP exchanges, builds and inspects a wheel and source distribution, imports and runs the wheel in a clean subprocess, and atomically writes `evidence.json`. It does not install packages, contact external services, make paid requests, run `twine`, or publish anything.

The wheel and source distribution created during verification are temporary. For a reviewed release, any PEP 517 frontend can build the same package from `pyproject.toml`.

## License and upstream data

SDK code is MIT licensed. Upstream datasets retain their own terms: U.S. government public-domain/CC0 sources, UK Open Government Licence data, and Singapore Open Data Licence data. Preserve returned attribution fields when redistributing records.

