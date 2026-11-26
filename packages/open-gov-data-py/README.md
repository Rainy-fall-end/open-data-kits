# open-gov-data 0.2.0

`open-gov-data` is a synchronous, zero-runtime-dependency Python 3.11+ SDK for a closed catalog of eight public Apify Actors and four public RapidAPI routes. It uses only the standard library (`urllib`, `json`, `dataclasses`, and related modules).

## Install and configure

Build artifacts locally with `python verify.py`, or install a built wheel:

```bash
python -m pip install dist/open_gov_data-0.2.0-py3-none-any.whl
```

Credentials may be passed directly or loaded from `APIFY_TOKEN` and `RAPIDAPI_KEY`:

```python
from open_gov_data import OpenGovDataClient

client = OpenGovDataClient.from_env()
```

Credentials are excluded from `repr`, never included in public errors, and never accepted inside request input. Production routes are fixed. Private endpoint overrides accept only explicit loopback origins for offline testing.

## Typed helpers

| Provider | Typed method | Fixed product |
|---|---|---|
| Apify | `ats_jobs_hiring_signals` | ATS Jobs & Hiring Signals (`CRulq5dak4mqAUmMn`) |
| Apify | `sec_edgar_intelligence` | SEC EDGAR intelligence (`8LFIbRbidiHPknMz5`) |
| Apify | `global_public_tenders` | Global Public Tenders & Grants (`ZlabhlvEIyRVdtKiQ`) |
| Apify | `pharma_pipeline_intelligence` | Pharma & Biotech Pipeline (`re8aRvtqBonP5HMuY`) |
| Apify | `usaspending_contracts` | USAspending Contracts & Grants (`eQQ2beomyLlW4DTGM`) |
| Apify | `clinical_trials` | ClinicalTrials.gov (`KchE3qKKrwU0rCe9f`) |
| Apify | `uk_gov_tenders` | UK Government Tenders (`txnvyTckeQx4hVBc6`) |
| Apify | `sg_green_mark` | Singapore Green Mark Buildings (`Z3ioK0wOAeczj6nCx`) |
| RapidAPI | `sec_edgar_corporate_filings` | `sec-edgar-corporate-filings` |
| RapidAPI | `clinicaltrials_studies` | `clinicaltrials-gov-studies-trials` |
| RapidAPI | `openfda_recalls` | `openfda-recalls-enforcement-approvals` |
| RapidAPI | `sg_green_mark_buildings` | `singapore-bca-green-mark-buildings` |

Every typed Apify helper sends `maxTotalChargeUsd` as a server-side run parameter. Its default and maximum are USD `0.25`; a lower client-wide or per-call value is honored. Typed RapidAPI helpers enforce the real route limit of 1–20 rows.

```python
from open_gov_data import OpenGovDataClient

client = OpenGovDataClient.from_env(timeout=30)

funding = client.sec_edgar_intelligence(
    mode="form_d_funding",
    query="artificial intelligence",
    exclude_pooled_funds=True,
    min_offering_amount_usd=1_000_000,
    max_items=25,
)

financials = client.sec_edgar_intelligence(
    mode="xbrl_financials",
    ticker="AAPL",
    forms="10-K,10-Q",
    max_items=10,
)

filings = client.sec_edgar_intelligence(
    mode="filings",
    ticker="NVDA",
    forms="10-K,8-K",
    max_items=10,
    max_total_charge_usd="0.10",
)

recalls = client.openfda_recalls(
    dataset="drug_enforcement",
    classification="Class I",
    status="Ongoing",
    max_items=10,
)
```

Typed helpers use idiomatic snake-case arguments and serialize the exact upstream field names. They reject wrong types, unsupported enum members, out-of-range numbers, overlong strings, and non-finite values before transport. Actor constraints are snapshotted from the repository `.actor/input_schema.json` files; RapidAPI constraints come from the checked OpenAPI documents.

### Apify helper arguments

- `ats_jobs_hiring_signals`: `preset`, `company_boards`, `keywords`, `remote_only`, `department_filter`, `include_description`, `max_items`.
- `sec_edgar_intelligence`: `mode`, `query`, `ticker`, `cik`, `forms`, `start_date`, `end_date`, `exclude_pooled_funds`, `min_offering_amount_usd`, `industry_filter`, `include_amendments`, `max_items`.
- `global_public_tenders`: `sources`, `opportunity_types`, `keyword`, `date_from`, `date_to`, `per_source_limit`, `source_timeout_secs`, `max_items`.
- `pharma_pipeline_intelligence`: `mode`, `query`, `drug_names`, `source_items_per_query`, `source_timeout_seconds`, `request_delay_ms`, `max_items`.
- `usaspending_contracts`: `keyword`, `award_category`, `start_date`, `end_date`, `awarding_agency`, `min_award_amount`, `naics_code`, `sort_order`, `max_items`.
- `clinical_trials`: `condition`, `intervention`, `status`, `sponsor`, `query_term`, `max_items`.
- `uk_gov_tenders`: `keyword`, `stages`, `min_value`, `published_from`, `max_items`.
- `sg_green_mark`: `query`, `rating`, `expires_within_days`, `max_items`.

All eight also accept `max_total_charge_usd`, but typed calls cannot raise it above `0.25`.

## v0.1 compatibility

The v0.1 public API remains import- and call-compatible:

- `OpenGovDataClient`, `OpenGovDataError`, `ApifySource`, and `RapidAPISource`.
- `OpenGovDataClient.from_env`, `request`, `run_actor`, `query_rapidapi`, and `records`.
- `extract_records`, `safe_error`, `catalog_dict`, `APIFY_SOURCES`, and `RAPIDAPI_SOURCES`.
- Legacy source keys: Apify `sec_edgar`, `clinical_trials`, `uk_gov_tenders`, `singapore_green_mark`; RapidAPI `sec_edgar`, `clinical_trials`, `openfda`, `singapore_green_mark`.
- CLI commands `catalog`, `apify`, and `rapidapi`, including the `open-gov-data` console entry point.

Generic calls continue to work:

```python
result = client.run_actor(
    "sec_edgar",
    {"mode": "filings", "ticker": "AAPL"},
    max_items=10,
    max_total_charge_usd="0.25",
)

rows = client.records(
    "rapidapi",
    "openfda",
    {"dataset": "device_recall"},
    max_items=5,
)
```

Additive descriptive source aliases are accepted by generic calls without adding duplicate catalog entries.

## CLI

```bash
open-gov-data catalog --compact
open-gov-data apify sec_edgar --input-json '{"mode":"filings","ticker":"AAPL"}' --max-items 10
open-gov-data rapidapi openfda --input-json '{"dataset":"drug_enforcement"}' --max-items 5
```

## Verification and deterministic builds

```bash
python verify.py
```

Verification is offline. It validates all eight Actor snapshots against the real repository schemas, validates all four RapidAPI snapshots against their OpenAPI routes, exercises all twelve typed methods and compatibility aliases through `127.0.0.1`, audits standard-library-only imports and release content, builds byte-reproducible wheel and sdist archives twice, performs an isolated wheel import, and writes `evidence.json`.

No publish or paid-network action is performed.

## License

MIT. Each returned record may carry separate source attribution and licence metadata; retain it when redistributing data.
