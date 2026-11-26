# open-gov-ai-tools 0.2.0

A zero-runtime-dependency Python 3.11+ package that exposes exactly twelve public-data integrations as OpenAI, Anthropic, and Gemini function declarations. It also includes a strict dispatcher, RAG provenance documents, and recursive secret redaction.

The dispatcher makes one request per call and never retries a paid request. Credentials are read from configuration or environment variables, never from model-generated arguments.

## Tool catalog

| Tool name | Provider route |
|---|---|
| `apify_ats_jobs_hiring_signals` | Apify Actor `CRulq5dak4mqAUmMn` |
| `apify_sec_edgar_intelligence` | Apify Actor `8LFIbRbidiHPknMz5`; modes `form_d_funding`, `xbrl_financials`, `filings` |
| `apify_global_public_tenders` | Apify Actor `ZlabhlvEIyRVdtKiQ` |
| `apify_pharma_pipeline_intelligence` | Apify Actor `re8aRvtqBonP5HMuY` |
| `apify_usaspending_contracts` | Apify Actor `eQQ2beomyLlW4DTGM` |
| `apify_clinical_trials` | Apify Actor `KchE3qKKrwU0rCe9f` |
| `apify_uk_gov_tenders` | Apify Actor `txnvyTckeQx4hVBc6` |
| `apify_sg_green_mark` | Apify Actor `Z3ioK0wOAeczj6nCx` |
| `rapidapi_sec_edgar` | `sec-edgar-corporate-filings` |
| `rapidapi_clinical_trials` | `clinicaltrials-gov-studies-trials` |
| `rapidapi_openfda` | `openfda-recalls-enforcement-approvals` |
| `rapidapi_sg_green_mark` | `singapore-bca-green-mark-buildings` |

The eight Apify argument schemas mirror the corresponding repository `.actor/input_schema.json` files. Each schema adds one dispatcher control, `maxTotalChargeUsd`, whose default and maximum are USD 0.25. Callers may lower this value but cannot raise it above the dispatcher's immutable cap.

## Schema exports

```python
from open_gov_ai_tools import (
    export_anthropic_tools,
    export_gemini_function_declarations,
    export_gemini_tools,
    export_openai_tools,
)

openai_chat_tools = export_openai_tools()
openai_responses_tools = export_openai_tools(style="responses")
anthropic_tools = export_anthropic_tools()
gemini_function_declarations = export_gemini_function_declarations()
gemini_rest_tools = export_gemini_tools()
```

OpenAI Chat Completions tools use `{"type": "function", "function": {...}}`; Responses tools use the flat `{"type": "function", "name": ..., "parameters": ...}` shape. The schemas set `strict: false` because the real Actor contracts contain optional fields. Dispatcher validation is always authoritative and rejects unknown fields, bad types, invalid enums, malformed dates, oversize inputs, duplicate JSON keys, and secret-bearing argument keys.

The same exports are available without importing application code:

```powershell
python -m open_gov_ai_tools openai --compact
python -m open_gov_ai_tools openai-responses --compact
python -m open_gov_ai_tools anthropic --compact
python -m open_gov_ai_tools gemini --compact
python -m open_gov_ai_tools gemini-tools --compact
python -m open_gov_ai_tools catalog --compact
```

## Dispatch

Set `APIFY_TOKEN` and/or `RAPIDAPI_KEY` in the process environment, then create the closed dispatcher:

```python
from open_gov_ai_tools import ToolDispatcher

dispatcher = ToolDispatcher.from_env(
    max_total_charge_usd="0.25",
    timeout=30,
)

result = dispatcher.dispatch(
    "apify_sec_edgar_intelligence",
    {
        "mode": "form_d_funding",
        "query": "artificial intelligence",
        "maxItems": 10,
        "maxTotalChargeUsd": 0.10,
    },
)
```

Apify requests use the fixed route `/v2/acts/{allowlisted_actor_id}/run-sync-get-dataset-items`. RapidAPI requests use fixed HTTPS hosts derived from the four allowlisted slugs and these fixed paths:

- `/v1/sec-edgar/filings`
- `/v1/clinical-trials/studies`
- `/v1/openfda/records`
- `/v1/sg-green-mark/certificates`

Tool arguments cannot choose a host or request path. Redirects are blocked. Test endpoint overrides are private constructor hooks and accept only an explicit `127.0.0.1`, `::1`, or `localhost` URL with a port. Responses are capped at 2 MB by default.

## RAG provenance and redaction

```python
from open_gov_ai_tools import ProvenanceFormatter, redact_secrets

documents = ProvenanceFormatter().format_dispatch_result(result)
safe_for_logs = redact_secrets(
    {"authorization": "Bearer ...", "result": result},
)
```

Every RAG document contains:

- a deterministic `id`;
- canonical JSON `text` suitable for embedding;
- the redacted original `record`;
- `metadata` with tool, provider, publisher, official source URL, license URL, license name, and attribution.

Record-provided source and license URLs are kept only when they use HTTPS and an allowlisted official hostname. Otherwise the formatter uses the catalog's official fallback URL. Secret fields and recognizable credential values are redacted before text generation.

## Build and verification

This project has no runtime or build dependencies. Its PEP 517 backend creates deterministic wheel and sdist archives with fixed timestamps, member order, permissions, and metadata.

```powershell
python verify.py
```

`verify.py` performs syntax and standard-library import audits, runs the complete offline unit suite, sends all twelve dispatcher calls only to a temporary `127.0.0.1` HTTP server, verifies all three model schema formats, builds the wheel and sdist twice, byte-compares both builds, validates wheel `RECORD` hashes and metadata, imports the unpacked wheel in isolated mode, scans deliverables for excluded integrations and credential-shaped values, and writes `evidence.json`.

No verification step calls Apify, RapidAPI, or any other external service.

## License

Package code is MIT licensed. Upstream records remain subject to the source and license metadata attached to each RAG document.

