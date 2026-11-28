# Open Data Kits — SDKs, BI Connectors, n8n Templates & API Playground

Production-ready, **zero-dependency** developer kits, analyst connectors, and free interactive browser tools for official commercial-clean public data APIs (**SEC EDGAR**, **ClinicalTrials.gov**, **openFDA**, **UK Government Tenders**, and **Singapore BCA Green Mark**) on **Apify Store** and **RapidAPI Hub**.

> **Interactive Browser Tools (Free, Client-Side, No Login):**  
> [Open Live Interactive Hub & API Playground ->](https://rainy-fall-end.github.io/open-data-kits/)

---

## NYC contractor business emails

Start with up to 20 New York City general contractors whose active city registrations publish a business email. Each row links to the original record. A full 20-result run costs $0.029 on the Free plan, with a $0.03 Actor charge cap. [Try the NYC example](https://apify.com/perceptive_city_af7/houzz-professionals-scraper/examples/find-20-nyc-contractors-with-public-business-emails) · [Preview the fields and 50-company sample](https://rainy-fall-end.github.io/open-data-kits/nyc-contractor-emails/) · [Download the n8n CSV workflow](https://rainy-fall-end.github.io/open-data-kits/channel/n8n-nyc-contractor-emails-csv.json).

## Small searches you can run on Apify

| Research question | Preset search | Download |
|---|---|---|
| Compare two YouTube channels | [Open the Apify example](https://apify.com/perceptive_city_af7/youtube-channel-email-scraper/examples/compare-apify-and-n8n-youtube-channel-activity?utm_source=github&utm_medium=referral&utm_campaign=portfolio_trials&utm_content=compare-apify-and-n8n-youtube-channel-activity) | [n8n CSV workflow](docs/channel/n8n-youtube-channel-activity-csv.json) |
| Find Italian packaging suppliers | [Open the Apify example](https://apify.com/perceptive_city_af7/europages-scraper/examples/find-italian-packaging-suppliers-with-websites?utm_source=github&utm_medium=referral&utm_campaign=portfolio_trials&utm_content=find-italian-packaging-suppliers-with-websites) | [n8n CSV workflow](docs/channel/n8n-europages-packaging-suppliers-csv.json) |
| Compare Hamburg apartment rents up to €1,600 | [Open the Apify example](https://apify.com/perceptive_city_af7/immowelt-scraper/examples/compare-hamburg-apartment-rents-under-1600-eur?utm_source=github&utm_medium=referral&utm_campaign=portfolio_trials&utm_content=compare-hamburg-apartment-rents-under-1600-eur) | [n8n CSV workflow](docs/channel/n8n-immowelt-hamburg-rents-csv.json) |
| Find account executive jobs at fintech and SaaS companies | [Open the Apify example](https://apify.com/perceptive_city_af7/ats-jobs-hiring-signals-scraper/examples/find-fintech-saas-account-executive-jobs?utm_source=github&utm_medium=referral&utm_campaign=portfolio_trials&utm_content=find-fintech-saas-account-executive-jobs) | [n8n CSV workflow](docs/channel/n8n-ats-account-executive-jobs-csv.json) |
| Find SEC Form D offerings of at least $1M | [Open the Apify example](https://apify.com/perceptive_city_af7/sec-edgar-filings-scraper/examples/find-form-d-offerings-at-least-1m?utm_source=github&utm_medium=referral&utm_campaign=portfolio_trials&utm_content=find-form-d-offerings-at-least-1m) | [n8n CSV workflow](docs/channel/n8n-sec-edgar-filings-csv.json) |
| Research UK contract awards and suppliers | [Open the Apify example](https://apify.com/perceptive_city_af7/uk-gov-tenders-scraper/examples/research-uk-contract-awards-and-suppliers?utm_source=github&utm_medium=referral&utm_campaign=portfolio_trials&utm_content=research-uk-contract-awards-and-suppliers) | [n8n CSV workflow](docs/channel/n8n-uk-gov-tenders-csv.json) |

[See all sample searches, including Asian market data, funding and clinical research](https://rainy-fall-end.github.io/open-data-kits/#buyer-trials).

## Live Production APIs & Scrapers

### RapidAPI Hub (Pay-Per-Row REST APIs — Free Basic Tier Included, 6 Live APIs)
| API | Data Scope & License | Live Endpoint |
|---|---|---|
| **ATS Jobs & Hiring Signals (Greenhouse, Lever & Ashby)** | 22 AI/tech leaders + custom boards, salary ranges & hiring intent | [Try on RapidAPI](https://rapidapi.com/fallRainy/api/ats-jobs-hiring-signals-greenhouse-lever-ashby) |
| **SEC EDGAR Corporate Filings (3-in-1: Form D + XBRL + Filings)** | Live Form D startup funding XML, audited 10-K/10-Q XBRL & filings (US Public Domain) | [Try on RapidAPI](https://rapidapi.com/fallRainy/api/sec-edgar-corporate-filings) |
| **Cyber KEV, EPSS & CVE Threat Intelligence** | Cross-linked CISA KEV + FIRST EPSS + Google OSV + NVD risk scoring | [Try on RapidAPI](https://rapidapi.com/fallRainy/api/cyber-kev-epss-cve-threat-intelligence-cisa-first-osv) |
| **ClinicalTrials.gov Studies & Trials** | Phase 1-4 pharma trials, sponsors & recruiting status (US Public Domain) | [Try on RapidAPI](https://rapidapi.com/fallRainy/api/clinicaltrials-gov-studies-trials) |
| **openFDA Recalls, Enforcement & Approvals** | FDA drug/device/food recalls & approvals (CC0 1.0) | [Try on RapidAPI](https://rapidapi.com/fallRainy/api/openfda-recalls-enforcement-approvals) |
| **Singapore BCA Green Mark Buildings** | ESG certified green buildings & ratings (Singapore Open Data Licence) | [Try on RapidAPI](https://rapidapi.com/fallRainy/api/singapore-bca-green-mark-buildings) |

### Apify Store (Pay-Per-Event Serverless Datasets — No Proxies / No Browser)
| Actor | Best For | Pricing | Live Store Page |
|---|---|---|---|
| **Cyber KEV, EPSS & CVE Threat Intelligence** | Cross-linked CISA KEV + FIRST EPSS + OSV + NVD risk scoring | `$8.00 / 1,000` | [Open on Apify](https://apify.com/perceptive_city_af7/cyber-kev-epss-cve-intelligence) |
| **ATS Jobs & Hiring Signals API (Greenhouse, Lever & Ashby)** | B2B hiring intent, recruiting, salary intel (22 tech leaders + custom URLs) | `$4.00 / 1,000` | [Open on Apify](https://apify.com/perceptive_city_af7/ats-jobs-hiring-signals-scraper) |
| **SEC EDGAR v2.0 — Form D Funding, 10-K/8-K & XBRL** | VC startup funding rounds, audited XBRL financials, AI RAG | `$4.00 / 1,000` | [Open on Apify](https://apify.com/perceptive_city_af7/sec-edgar-filings-scraper) |
| **Global Public Tenders & Grants Aggregator (7 Countries)** | Unified US, UK, EU, World Bank, Canada & Australia procurement | `$8.00 / 1,000` | [Open on Apify](https://apify.com/perceptive_city_af7/global-public-tenders-grants-aggregator) |
| **Pharma & Biotech Pipeline Intelligence (4-Source Cross-Linked)** | ClinicalTrials + openFDA + ChEMBL + Europe PMC drug dossiers | `$10.00 / 1,000` | [Open on Apify](https://apify.com/perceptive_city_af7/pharma-biotech-pipeline-intelligence) |
| **USASpending Federal Contracts & B2G Awards** | US federal prime contracts, NAICS/PSC codes & defense spend | `$5.00 / 1,000` | [Open on Apify](https://apify.com/perceptive_city_af7/usaspending-gov-contracts-scraper) |
| **ClinicalTrials.gov Scraper** | Biotech pipeline intelligence & CRO sourcing | `$3.50 / 1,000` | [Open on Apify](https://apify.com/perceptive_city_af7/clinical-trials-scraper) |
| **UK Government Tenders (OCDS)** | B2G sales leads & procurement monitoring | `$5.00 / 1,000` | [Open on Apify](https://apify.com/perceptive_city_af7/uk-gov-tenders-scraper) |
| **Singapore Green Mark Buildings** | APAC ESG & PropTech compliance | `$2.00 / 1,000` | [Open on Apify](https://apify.com/perceptive_city_af7/sg-green-mark-buildings) |
---

## Free Zero-Dependency Developer & Analyst Kits (`packages/`)

| Kit | Target Users | Highlights | Path |
|---|---|---|---|
| **Flagship Conversion Kits (n8n + Google Sheets + Postman)** | VC, Sales, Recruiting & Biotech Teams | 6 ready-to-import presets for ATS Jobs, SEC Form D/XBRL, 7-Country Tenders, Pharma Pipeline & USASpending | [`packages/open-gov-flagship-kits/`](packages/open-gov-flagship-kits/) |
| **Google Sheets & Excel Power Query BI Connectors** | Analysts, Ops, Biotech, Finance | Copy-paste `.gs` Apps Script + `.pq` M scripts, formula-injection safe | [`packages/open-gov-bi-connectors/`](packages/open-gov-bi-connectors/) |
| **Postman v2.1, Insomnia v4 & Bruno Collections** | API Developers & QA | Ready-to-import collections with assertions & `$0.25` spend caps | [`packages/open-gov-api-collections/`](packages/open-gov-api-collections/) |
| **AI Agent Function-Calling & RAG Toolpack (Python)** | OpenAI, Anthropic & Gemini Agents | JSON tool schemas + grounded provenance citations, zero deps | [`packages/open-gov-ai-tools-py/`](packages/open-gov-ai-tools-py/) |
| **MCP Server (Stdio, Node 20+)** | Claude Desktop, Cursor, Windsurf | Exposes all live public APIs via Model Context Protocol | [`packages/mcp-server-open-gov-data/`](packages/mcp-server-open-gov-data/) |
| **n8n Community Node & CSV Templates** | No-Code Automation Teams | Cost-capped workflows + custom node | [`packages/n8n-nodes-open-gov-data/`](packages/n8n-nodes-open-gov-data/) & [`docs/channel/`](docs/channel/) |
| **Python SDK (`open-gov-data-py`)** | Data Engineers & Quant Teams | Pure stdlib PEP 621 client for Apify + RapidAPI | [`packages/open-gov-data-py/`](packages/open-gov-data-py/) |
| **TypeScript / JS SDK (`open-gov-data-js`)** | Full-Stack & Node.js Teams | Full `.d.ts` typings, zero runtime dependencies | [`packages/open-gov-data-js/`](packages/open-gov-data-js/) |
| **GitHub Action CI/CD** | Automated Scheduled Data Sync | Secret masking (`::add-mask::`) + JSON/CSV export | [`packages/open-gov-data-github-action/`](packages/open-gov-data-github-action/) |

---

## Free Browser Tools (`docs/tools/`)
- [ATS Jobs & Hiring Signals API Guide](https://rainy-fall-end.github.io/open-data-kits/tools/ats-jobs-hiring-signals/) — Greenhouse, Lever & Ashby job board presets + snippet generator.
- [SEC Form D Startup Funding & XBRL API Guide](https://rainy-fall-end.github.io/open-data-kits/tools/sec-form-d-funding-tracker/) — Live Form D VC rounds & audited 10-K/10-Q XBRL financials.
- [Global Government Tenders & Grants API Guide](https://rainy-fall-end.github.io/open-data-kits/tools/global-tenders-procurement-api/) — 7-country unified procurement aggregator.
- [Pharma & Biotech Drug Pipeline API Guide](https://rainy-fall-end.github.io/open-data-kits/tools/pharma-drug-pipeline-api/) — 4-source cross-linked drug dossier intelligence.
- [Interactive Open-Gov API Playground & Cost Comparator](https://rainy-fall-end.github.io/open-data-kits/tools/open-gov-api-playground/) — Compare Apify vs RapidAPI cost and generate ready-to-run `curl`, Python, n8n & MCP snippets.
- [Apify Pay-Per-Event Cost Calculator](https://rainy-fall-end.github.io/open-data-kits/tools/ppe-calculator/) — Estimate exact cloud run budgets before running at scale.
- [Client-Side JSONL to CSV Converter](https://rainy-fall-end.github.io/open-data-kits/tools/jsonl-to-csv/) — Flatten nested API datasets directly in your browser with formula-injection protection.

## License
Code and templates in this repository are MIT licensed. Upstream official government datasets retain their respective open commercial licenses (US Public Domain 17 U.S.C. § 105, CC0 1.0, UK Open Government Licence v3.0, Singapore Open Data Licence).
