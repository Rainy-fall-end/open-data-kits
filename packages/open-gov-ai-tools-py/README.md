# open-gov-ai-tools

`open-gov-ai-tools` is a Python 3.11+ Function Calling toolpack for eight paid,
public open-government data integrations. It exports provider-ready JSON for
OpenAI, Anthropic Claude, and Google Gemini, and executes the same closed catalog
through a hardened synchronous `ToolDispatcher`.

The package has **zero third-party runtime dependencies and zero third-party
build dependencies**. Its PEP 517 backend, wheel builder, sdist builder, HTTP
client, schema validator, CLI, RAG formatter, and tests all use the Python
standard library.

This repository artifact is a local build candidate. It has not been uploaded to
PyPI and verification never calls the paid APIs.

## Closed public catalog

| Tool name | Channel | Fixed paid product |
|---|---|---|
| `rapidapi_sec_edgar_filings` | RapidAPI | `sec-edgar-corporate-filings` · `GET /v1/sec-edgar/filings` |
| `rapidapi_clinical_trials` | RapidAPI | `clinicaltrials-gov-studies-trials` · `GET /v1/clinical-trials/studies` |
| `rapidapi_openfda_records` | RapidAPI | `openfda-recalls-enforcement-approvals` · `GET /v1/openfda/records` |
| `rapidapi_singapore_green_mark` | RapidAPI | `singapore-bca-green-mark-buildings` · `GET /v1/sg-green-mark/certificates` |
| `apify_sec_edgar_filings` | Apify | Actor `8LFIbRbidiHPknMz5` |
| `apify_clinical_trials` | Apify | Actor `KchE3qKKrwU0rCe9f` |
| `apify_uk_gov_tenders` | Apify | Actor `txnvyTckeQx4hVBc6` |
| `apify_singapore_green_mark` | Apify | Actor `Z3ioK0wOAeczj6nCx` |

The allowlist contains exactly these four RapidAPI slugs and four public Actor
IDs. It has no arbitrary URL, slug, or Actor-ID execution path. Private actors
are not present.

## Export schemas

```python
from open_gov_ai_tools import (
    export_anthropic_tools,
    export_gemini_function_declarations,
    export_gemini_tools,
    export_openai_tools,
)

openai_chat_tools = export_openai_tools()  # nested Chat Completions shape
openai_responses_tools = export_openai_tools(style="responses")
claude_tools = export_anthropic_tools()
gemini_declarations = export_gemini_function_declarations()
gemini_legacy_tools = export_gemini_tools()  # [{"function_declarations": [...]}]
```

Equivalent offline CLI exports:

```console
python -m open_gov_ai_tools openai
python -m open_gov_ai_tools openai-responses
python -m open_gov_ai_tools anthropic
python -m open_gov_ai_tools gemini
python -m open_gov_ai_tools gemini-tools --compact
```

The layouts follow the providers' documented fields: OpenAI function tools,
Claude `input_schema`, and Gemini `function_declarations`. OpenAI exports use
`strict: false` because the shared cross-provider schema contains optional and
conditional arguments. This does **not** relax execution: every call is parsed
and strictly validated again by the dispatcher, including unknown-field
rejection. See the official [OpenAI function calling guide](https://developers.openai.com/api/docs/guides/function-calling),
[Claude tool definition guide](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools),
and [Gemini function calling guide](https://ai.google.dev/gemini-api/docs/function-calling).

## Dispatch safely

```python
from open_gov_ai_tools import ToolDispatcher

dispatcher = ToolDispatcher.from_env(max_total_charge_usd="0.25")

result = dispatcher.dispatch(
    "apify_sec_edgar_filings",
    {
        "query": "artificial intelligence",
        "forms": "10-K,10-Q",
        "maxItems": 10,
        "maxTotalChargeUsd": 0.10,  # may lower, never raise, the 0.25 hard cap
    },
)

rapid_result = dispatcher.dispatch(
    "rapidapi_openfda_records",
    {"dataset": "device_recall", "classification": "Class I", "limit": 5},
)
```

Credentials are read from `APIFY_TOKEN` and `RAPIDAPI_KEY` (also
`X_RAPIDAPI_KEY` for compatibility). Never put credentials in model arguments.
Credential-like argument keys are rejected at every nesting level.

Security and cost behavior:

- Actor ID, RapidAPI host, and route are fixed by the catalog.
- Apify credentials use an `Authorization` header, never the URL.
- RapidAPI credentials use `X-RapidAPI-Key`; neither credential is included in
  results, exceptions, or `repr(dispatcher)`.
- Every Apify URL includes `maxTotalChargeUsd`. A call may request a lower cap,
  but any value above the dispatcher's immutable hard cap is rejected before
  network I/O.
- RapidAPI does not provide a per-request USD cap, so its schema enforces a row
  `limit` of 1–20.
- Unknown fields, wrong types, invalid enums/patterns/dates, duplicate JSON
  object keys, non-finite numbers, cycles, excess nesting, and oversized model
  arguments are rejected.
- Redirects are disabled so authorization headers cannot cross origins.
- Responses are bounded by `max_response_bytes` (2 MB by default, at most 10
  MB), checked against both `Content-Length` and streamed bytes.
- Paid requests run once with no automatic retry.
- Errors never include upstream response bodies, request URLs, arguments, or
  credential values.
- Non-production endpoint overrides accept only `http(s)` loopback hosts with
  an explicit port and exist solely for the offline integration tests.

`dispatch()` is synchronous. Put it in your application's worker or executor if
the surrounding agent runtime is asynchronous.

## RAG provenance

```python
from open_gov_ai_tools import ProvenanceFormatter

documents = ProvenanceFormatter().format_dispatch_result(result)
for document in documents:
    print(document["text"])
    print(document["metadata"]["source_url"])
    print(document["metadata"]["license_name"])
    print(document["metadata"]["license_url"])
    print(document["metadata"]["attribution"])
```

Each document retains the untouched JSON record and carries its own publisher,
official source URL, licence name, official licence/terms URL, and attribution.
Record-specific official URLs are preferred; URLs outside the dataset's
official domain are ignored to prevent citation poisoning. Missing fields fall
back to the catalog's official provenance policy.

| Dataset | Official source and reuse terms |
|---|---|
| SEC EDGAR | [EDGAR search](https://www.sec.gov/edgar/search/) · [SEC reuse FAQ](https://www.sec.gov/about/webmaster-frequently-asked-questions) |
| ClinicalTrials.gov | [ClinicalTrials.gov](https://clinicaltrials.gov/) · [Terms and Conditions](https://clinicaltrials.gov/terms-conditions) |
| openFDA | [openFDA](https://open.fda.gov/) · [Public domain / CC0 terms](https://open.fda.gov/terms/) |
| UK Contracts Finder | [OCDS search](https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search) · [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/) |
| Singapore BCA Green Mark | [BCA dataset](https://data.gov.sg/datasets/d_c4bd082b48fa7611713f39e23d250c27/view) · [Singapore Open Data Licence v1.0](https://developers.data.gov.sg/open-data-licence) |

The MIT licence in this package covers the software. Upstream records retain
their respective terms; preserve the per-record provenance when redistributing
or grounding model output.

## Build and verify

Run the deterministic, offline verification gate:

```console
python verify.py
```

It compiles the package, runs all `unittest` cases (including local loopback HTTP
tests), builds reproducible wheel and sdist artifacts into `dist/`, validates
archive membership and wheel hashes, imports the unpacked wheel in isolation,
and writes `evidence.json`. It does not use `pip`, contact PyPI, load repository
keys, or call Apify/RapidAPI.

Manual build with the in-tree standard-library backend:

```console
python -c "import build_backend; build_backend.build_wheel('dist'); build_backend.build_sdist('dist')"
```
