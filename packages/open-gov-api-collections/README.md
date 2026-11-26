# Open Government Paid API Collections

This package contains import-ready clients for eight read-only paid data requests: four RapidAPI REST APIs and four Apify Actors. It has no third-party dependencies and requires Node.js 20 or newer only for deterministic regeneration and offline verification.

| Provider | Request | Endpoint or Actor ID |
| --- | --- | --- |
| RapidAPI | SEC EDGAR Corporate Filings | `sec-edgar-corporate-filings` |
| RapidAPI | ClinicalTrials.gov Studies and Trials | `clinicaltrials-gov-studies-trials` |
| RapidAPI | openFDA Recalls, Enforcement and Approvals | `openfda-recalls-enforcement-approvals` |
| RapidAPI | Singapore BCA Green Mark Buildings | `singapore-bca-green-mark-buildings` |
| Apify | SEC EDGAR Filings | `8LFIbRbidiHPknMz5` |
| Apify | ClinicalTrials.gov Studies | `KchE3qKKrwU0rCe9f` |
| Apify | UK Government Tenders | `txnvyTckeQx4hVBc6` |
| Apify | Singapore BCA Green Mark Buildings | `Z3ioK0wOAeczj6nCx` |

## Import and credentials

- Postman: import both files under `postman/`, select the imported environment, and locally populate its two secret values.
- Insomnia: import `insomnia/Open-Gov-Paid-APIs.insomnia.json`, then locally populate the Base Environment.
- Bruno: open the `bruno/` directory as a collection and locally define collection or environment variables for the two credential names.

Requests reference only `{{APIFY_TOKEN}}` and `{{RAPIDAPI_KEY}}`. No credential value is included. The RapidAPI examples require subscriptions and can consume plan quota. Every Apify URL fixes `maxTotalChargeUsd=0.25`; do not remove or raise that server-side cap without an explicit budget review.

## Deterministic build and offline verification

```powershell
node generate.mjs
node verify.mjs
```

The verifier reads the four repository `.actor/input_schema.json` files and the four RapidAPI OpenAPI documents, validates every generated client artifact, rejects unexpected IDs, URLs, variables, or credential values, and replays exactly eight extracted Postman requests against an ephemeral `127.0.0.1` HTTP server. It never calls an external host. A successful run rewrites `evidence.json` with hashes and check results.
