# Flagship Open-Data Conversion Kits

Turn five production Apify Actors into buyer-ready automations in minutes. This pack gives operators, analysts, sales teams, and researchers six practical workflows for jobs, startup funding, public-company financials, procurement, drug pipelines, and federal contracts.

No package install is required. Import an n8n workflow, paste one Google Apps Script file, or load the Postman collection. Every run request includes `maxTotalChargeUsd=0.25`, and every credential remains a local placeholder or secret property.

## Pick the outcome you need

| Workflow | Best for | Starter output |
| --- | --- | --- |
| ATS Jobs & Hiring Signals | Lead scoring, headcount signals, talent-market research | AI and machine-learning openings from curated employers |
| SEC Form D Startup Funding | Founder discovery, funding alerts, B2B prospecting | AI issuers with offerings of at least $1 million |
| SEC XBRL AAPL Financials | Financial models, earnings research, KPI monitoring | Structured AAPL 10-K and 10-Q facts |
| Global Public Tenders & Grants | Bid discovery, market intelligence, grant research | AI opportunities across seven official sources |
| Pharma & Biotech Pipeline Intelligence | Competitive intelligence, diligence, research briefs | A cross-source semaglutide dossier |
| USASpending Federal Contracts | Government-sales targeting, award analysis, account research | Large cybersecurity software contracts |

The Form D and XBRL presets use the same SEC EDGAR Actor but are intentionally separate workflows, giving the pack six importable automations across five Actors.

## What is included

```text
flagship-conversion-kits-v2/
├── n8n/
│   ├── 01-ats-jobs-hiring-signals.json
│   ├── 02-sec-form-d-startup-funding.json
│   ├── 03-sec-xbrl-aapl-financials.json
│   ├── 04-global-public-tenders-grants.json
│   ├── 05-pharma-biotech-pipeline.json
│   └── 06-usaspending-federal-contracts.json
├── google-sheets/FlagshipConnectors.gs
├── postman/Flagship-Apify-Workflows.postman_collection.json
├── presets.json
├── build-artifacts.mjs
└── verify.mjs
```

## Start with n8n

1. Set `APIFY_TOKEN` in the n8n instance environment. Do not paste it into a workflow node.
2. In n8n, choose **Import from File** and select any JSON file from `n8n/`.
3. Open the **Preset** node if you want to adjust filters. Leave `outputFormat` as `json`, or change it to `csv`.
4. Run the workflow. The HTTP node starts the Actor synchronously and returns its clean default-dataset output.

Each workflow is inactive after import and begins with a manual trigger, so importing it cannot spend money. Activate or replace the trigger only after reviewing the preset.

## Start with Google Sheets

1. Open a spreadsheet and choose **Extensions > Apps Script**.
2. Paste `google-sheets/FlagshipConnectors.gs` into the editor and save.
3. In **Project Settings > Script Properties**, add `APIFY_TOKEN` with your Apify API token as its value.
4. Reload the spreadsheet and use the **Flagship Apify** menu.

The connector creates or refreshes one sheet per preset. Nested objects become dot-path columns such as `company.location.country`; arrays become JSON strings. Before any value reaches a cell, leading `=`, `+`, `-`, `@`, tab, and carriage-return characters are prefixed with an apostrophe to prevent spreadsheet formula injection.

Available functions are:

- `importAtsJobs()`
- `importSecFormD()`
- `importSecXbrlAapl()`
- `importGlobalTenders()`
- `importPharmaPipeline()`
- `importUsaSpendingContracts()`

## Start with Postman

1. Import `postman/Flagship-Apify-Workflows.postman_collection.json`.
2. Edit the collection variable `APIFY_TOKEN` and set its **Current value**. Keep it out of shared exports.
3. Send one of the six requests or run the collection.

Every request returns JSON dataset items and includes tests for a successful status, array output, the preset's item limit, and the fixed USD 0.25 maximum-charge parameter.

## Customize safely

The ready-made inputs live in `presets.json`. They are valid against the Actors' repository input schemas at the time this pack was built. When increasing `maxItems` or widening a query, keep the charge ceiling in place and test on a small sample first.

The ceiling limits the Actor run request; it is not a promise that every run costs exactly $0.25. Actual charges depend on the Actor's pricing and work completed, and the platform can stop a run when the limit is reached.

## Verify the complete pack

With Node.js 20 or newer:

```bash
node verify.mjs
```

The verifier uses only Node.js built-ins. It performs all of the following without calling the public internet:

- validates all six inputs against the real repository schemas;
- checks the six n8n contracts and their JSON/CSV selector;
- checks every Postman request, body, test script, credential placeholder, and charge cap;
- runs all six Apps Script import functions inside a restricted VM;
- routes those functions to a temporary `127.0.0.1` HTTP server and confirms every received payload;
- proves nested-object flattening and all six formula-injection defenses;
- scans the pack for real credential material and out-of-scope Actor references; and
- writes a machine-readable `evidence.json` report with SHA-256 hashes.

## Built for responsible public-data workflows

These presets target public business and government data. Review source terms, applicable law, and your organization's policies before operational use. Avoid enriching results with sensitive personal data, keep tokens in secret storage, and use conservative schedules and limits.

Import one workflow today, validate a small result set, and connect the output to the decision your team already needs to make.
