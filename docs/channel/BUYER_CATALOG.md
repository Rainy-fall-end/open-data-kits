# Global & APAC B2B Buyer & Developer Catalog
# 全球与亚太 B2B 买家与开发者目录

Unified live paid Apify Actors + RapidAPI Hub REST APIs.  
统一的 Apify 付费 Actor + RapidAPI REST API 清单。

**Scope / 范围:** 8 live paid Apify Actors + 4 live RapidAPI REST APIs only. No private/free regional Actors.  
仅包含 8 个 Apify 付费 Actor 和 4 个 RapidAPI REST API；不含私有/免费区域 Actor。

**Auth & secrets / 认证与密钥:** Use `Authorization: Bearer $APIFY_TOKEN` for Apify MCP; use RapidAPI dashboard key or OAuth placeholders. Never hardcode or commit tokens.  
Apify MCP 使用 `Authorization: Bearer $APIFY_TOKEN`；RapidAPI 使用后台密钥或 OAuth 占位符；禁止硬编码或提交密钥。

**Apify PPE billing / Apify 按事件计费:** Every Actor uses Pay-Per-Event: `$0.00005` per `apify-actor-start` (includes first 5s compute) + per-item `apify-default-dataset-item` rate shown below.  
每个 Actor 均按事件计费：`apify-actor-start` `$0.00005`（含前 5 秒计算）+ 下方按条 `apify-default-dataset-item` 费率。

---

## 1) Apify Actors — Live Paid Inventory / Apify Actor 付费清单

### Group A — Global / US / UK / SG B2B Open Data (Commercial-Clean, Zero PII)
### A 组 — 全球 / 美国 / 英国 / 新加坡 B2B 开放数据（商业可用、零 PII）

| Actor / 工具 | Actor ID | Store / Pricing | PPE rate (Free/Base) / 基础按事件费率 | License / 许可 | Cost-capped n8n input / 限费 n8n 输入 | Workflow / Guide | RapidAPI alt / 替代 |
|---|---|---|---|---|---|---|---|
| **SEC EDGAR Corporate Filings** (`sec-edgar-filings-scraper`) | `8LFIbRbidiHPknMz5` | [Store](https://apify.com/perceptive_city_af7/sec-edgar-filings-scraper) · [Pricing](https://apify.com/perceptive_city_af7/sec-edgar-filings-scraper/pricing) | `$0.004` / item (`$4.00/1K`) | US Gov Public Domain (SEC EDGAR) | `{"mode":"search","query":"artificial intelligence","forms":"10-K,10-Q,8-K","startDate":"2025-01-01","maxItems":25}`<br>`maxTotalChargeUsd=0.25`; 25 items ≈ `$0.10005` | [`./n8n-sec-edgar-filings-csv.json`](./n8n-sec-edgar-filings-csv.json)<br>[`./n8n-sec-edgar-filings-csv.md`](./n8n-sec-edgar-filings-csv.md) | [RapidAPI](https://rapidapi.com/fallRainy/api/sec-edgar-corporate-filings) |
| **ClinicalTrials.gov Studies & Trials** (`clinical-trials-scraper`) | `KchE3qKKrwU0rCe9f` | [Store](https://apify.com/perceptive_city_af7/clinical-trials-scraper) · [Pricing](https://apify.com/perceptive_city_af7/clinical-trials-scraper/pricing) | `$0.0035` / item (`$3.50/1K`) | US Gov Public Domain (NIH / NLM) | `{"condition":"type 2 diabetes","status":"RECRUITING","queryTerm":"GLP-1","maxItems":25}`<br>`maxTotalChargeUsd=0.25`; 25 items ≈ `$0.08755` | [`./n8n-clinical-trials-csv.json`](./n8n-clinical-trials-csv.json)<br>[`./n8n-clinical-trials-csv.md`](./n8n-clinical-trials-csv.md) | [RapidAPI](https://rapidapi.com/fallRainy/api/clinicaltrials-gov-studies-trials) |
| **UK Gov Tenders & Procurement (Contracts Finder OCDS)** (`uk-gov-tenders-scraper`) | `txnvyTckeQx4hVBc6` | [Store](https://apify.com/perceptive_city_af7/uk-gov-tenders-scraper) · [Pricing](https://apify.com/perceptive_city_af7/uk-gov-tenders-scraper/pricing) | `$0.005` / item (`$5.00/1K`) | UK Open Government Licence v3.0 | `{"keyword":"software","stages":"tender","minValue":50000,"maxItems":25}`<br>`maxTotalChargeUsd=0.25`; 25 items ≈ `$0.12505` | [`./n8n-uk-gov-tenders-csv.json`](./n8n-uk-gov-tenders-csv.json)<br>[`./n8n-uk-gov-tenders-csv.md`](./n8n-uk-gov-tenders-csv.md) | Direct Apify Sync REST API & MCP |
| **Singapore BCA Green Mark Buildings** (`sg-green-mark-buildings`) | `Z3ioK0wOAeczj6nCx` | [Store](https://apify.com/perceptive_city_af7/sg-green-mark-buildings) · [Pricing](https://apify.com/perceptive_city_af7/sg-green-mark-buildings/pricing) | `$0.002` / item (`$2.00/1K`) | Singapore Open Data Licence v1.0 | `{"query":"Plaza","rating":"Platinum","maxItems":25}`<br>`maxTotalChargeUsd=0.25`; 25 items ≈ `$0.05005` | [`./n8n-sg-green-mark-csv.json`](./n8n-sg-green-mark-csv.json)<br>[`./n8n-sg-green-mark-csv.md`](./n8n-sg-green-mark-csv.md) | [RapidAPI](https://rapidapi.com/fallRainy/api/singapore-bca-green-mark-buildings) |

### Group B — Asia-Pacific / China Public-Data Actors
### B 组 — 亚太 / 中国公开数据 Actor

| Actor / 工具 | Actor ID | Store / Pricing | Verified 4-tier PPE / 四档费率 | Trial input & cap / 试用输入与限费 | Workflow / Guide / Sample |
|---|---|---|---|---|---|
| **CN Finance News & A-Share Filings** (`cn-finance-news-scraper`) | `JBrF7BHqtCAQVb3bC` | [Store](https://apify.com/perceptive_city_af7/cn-finance-news-scraper) · [Pricing](https://apify.com/perceptive_city_af7/cn-finance-news-scraper/pricing) | Free `$0.003` ($3.00/1K)<br>Starter `$0.00285` ($2.85/1K)<br>Scale `$0.00255` ($2.55/1K)<br>Business `$0.00225` ($2.25/1K) | `{"source":"cls_telegraph","maxItems":2}`<br>`maxTotalChargeUsd=0.00605` | [`./n8n-cn-finance-news-csv.json`](./n8n-cn-finance-news-csv.json)<br>[`./n8n-cn-finance-news-csv.md`](./n8n-cn-finance-news-csv.md)<br>[`./cn-finance-sample.json`](./cn-finance-sample.json) |
| **ModelScope Models & Datasets** (`modelscope-scraper`) | `vm7r2D9VXZsEnu1bT` | [Store](https://apify.com/perceptive_city_af7/modelscope-scraper) · [Pricing](https://apify.com/perceptive_city_af7/modelscope-scraper/pricing) | Free `$0.002` ($2.00/1K)<br>Starter `$0.0019` ($1.90/1K)<br>Scale `$0.0017` ($1.70/1K)<br>Business `$0.0015` ($1.50/1K) | `{"mode":"models","query":"Qwen","maxItems":3}`<br>`maxTotalChargeUsd=0.00605` | [`./n8n-modelscope-csv.json`](./n8n-modelscope-csv.json)<br>live KVS: `https://api.apify.com/v2/key-value-stores/RdnBqv2mkrx9GM8bt/records/n8n-modelscope-csv.json`<br>[`./n8n-modelscope-csv.md`](./n8n-modelscope-csv.md) |
| **TapTap Mobile Game Rankings & Reviews** (`taptap-scraper`) | `w2pM7TcmfbQ2bVyeW` | [Store](https://apify.com/perceptive_city_af7/taptap-scraper) · [Pricing](https://apify.com/perceptive_city_af7/taptap-scraper/pricing) | Free `$0.0025` ($2.50/1K)<br>Starter `$0.002375` ($2.375/1K)<br>Scale `$0.002125` ($2.125/1K)<br>Business `$0.001875` ($1.875/1K) | `{"mode":"rankings","rankingType":"hot","platform":"android","maxItems":2}`<br>`maxTotalChargeUsd=0.00505` | [`./n8n-taptap-rankings-csv.json`](./n8n-taptap-rankings-csv.json)<br>[`./n8n-taptap-rankings-csv.md`](./n8n-taptap-rankings-csv.md)<br>[`./taptap-sample.json`](./taptap-sample.json) |
| **SMZDM Featured Deals** (`smzdm-deals-scraper`) | `81GXKlIURUAlYAKtO` | [Store](https://apify.com/perceptive_city_af7/smzdm-deals-scraper) · [Pricing](https://apify.com/perceptive_city_af7/smzdm-deals-scraper/pricing) | Free `$0.005` ($5.00/1K)<br>Starter `$0.00475` ($4.75/1K)<br>Scale `$0.00425` ($4.25/1K)<br>Business `$0.00375` ($3.75/1K) | `{"maxItems":2,"maxPages":1}`<br>`maxTotalChargeUsd=0.01005` | [`./n8n-smzdm-deals-csv.json`](./n8n-smzdm-deals-csv.json)<br>[`./n8n-smzdm-deals-csv.md`](./n8n-smzdm-deals-csv.md)<br>[`./smzdm-deals-sample.json`](./smzdm-deals-sample.json) |

---

## 2) RapidAPI Hub REST APIs / RapidAPI REST API 清单

**Auth / 认证:** Use RapidAPI dashboard-managed key or OAuth placeholder (`X-RapidAPI-Key: $RAPIDAPI_KEY` / `Authorization: Bearer <OAUTH_TOKEN>`); never hardcode.  
使用 RapidAPI 后台密钥或 OAuth 占位符；禁止硬编码。

| API / 接口 | RapidAPI Hub | Endpoint | License / Data | Metering / 计费 |
|---|---|---|---|---|
| **SEC EDGAR Corporate Filings API** | [RapidAPI](https://rapidapi.com/fallRainy/api/sec-edgar-corporate-filings) | `GET /v1/sec-edgar/filings` | US Gov Public Domain; zero PII | Row-metered REST |
| **ClinicalTrials.gov Studies & Trials API** | [RapidAPI](https://rapidapi.com/fallRainy/api/clinicaltrials-gov-studies-trials) | `GET /v1/clinical-trials/studies` | US Gov Public Domain (NIH/NLM); zero PII | Row-metered REST |
| **openFDA Recalls, Enforcement & Approvals API** | [RapidAPI](https://rapidapi.com/fallRainy/api/openfda-recalls-enforcement-approvals) | `GET /v1/openfda/records` | CC0 1.0 Public Domain; zero PII; drug/device/food recalls & Drugs@FDA approvals | Row-metered REST |
| **Singapore BCA Green Mark Buildings API** | [RapidAPI](https://rapidapi.com/fallRainy/api/singapore-bca-green-mark-buildings) | `GET /v1/sg-green-mark/certificates` | Singapore Open Data Licence v1.0; zero PII | Row-metered REST |

---

## 3) Cost-Capped n8n Workflows, Setup Guides & Free Samples / 限费 n8n 工作流、指南与免费样例

| Actor / 工具 | Workflow / 工作流 | Setup guide / 设置指南 | Free sample / 免费样例 | Cost cap / 限费 |
|---|---|---|---|---|
| **SEC EDGAR Corporate Filings** | [`./n8n-sec-edgar-filings-csv.json`](./n8n-sec-edgar-filings-csv.json) | [`./n8n-sec-edgar-filings-csv.md`](./n8n-sec-edgar-filings-csv.md) | — | `maxTotalChargeUsd=0.25`; 25 items ≈ `$0.10005` |
| **ClinicalTrials.gov Studies & Trials** | [`./n8n-clinical-trials-csv.json`](./n8n-clinical-trials-csv.json) | [`./n8n-clinical-trials-csv.md`](./n8n-clinical-trials-csv.md) | — | `maxTotalChargeUsd=0.25`; 25 items ≈ `$0.08755` |
| **UK Gov Tenders & Procurement** | [`./n8n-uk-gov-tenders-csv.json`](./n8n-uk-gov-tenders-csv.json) | [`./n8n-uk-gov-tenders-csv.md`](./n8n-uk-gov-tenders-csv.md) | — | `maxTotalChargeUsd=0.25`; 25 items ≈ `$0.12505` |
| **Singapore BCA Green Mark Buildings** | [`./n8n-sg-green-mark-csv.json`](./n8n-sg-green-mark-csv.json) | [`./n8n-sg-green-mark-csv.md`](./n8n-sg-green-mark-csv.md) | — | `maxTotalChargeUsd=0.25`; 25 items ≈ `$0.05005` |
| **CN Finance News & A-Share Filings** | [`./n8n-cn-finance-news-csv.json`](./n8n-cn-finance-news-csv.json) | [`./n8n-cn-finance-news-csv.md`](./n8n-cn-finance-news-csv.md) | [`./cn-finance-sample.json`](./cn-finance-sample.json) | `maxTotalChargeUsd=0.00605` |
| **ModelScope Models & Datasets** | [`./n8n-modelscope-csv.json`](./n8n-modelscope-csv.json)<br>live KVS: `https://api.apify.com/v2/key-value-stores/RdnBqv2mkrx9GM8bt/records/n8n-modelscope-csv.json` | [`./n8n-modelscope-csv.md`](./n8n-modelscope-csv.md) | — | `maxTotalChargeUsd=0.00605` |
| **TapTap Mobile Game Rankings & Reviews** | [`./n8n-taptap-rankings-csv.json`](./n8n-taptap-rankings-csv.json) | [`./n8n-taptap-rankings-csv.md`](./n8n-taptap-rankings-csv.md) | [`./taptap-sample.json`](./taptap-sample.json) | `maxTotalChargeUsd=0.00505` |
| **SMZDM Featured Deals** | [`./n8n-smzdm-deals-csv.json`](./n8n-smzdm-deals-csv.json) | [`./n8n-smzdm-deals-csv.md`](./n8n-smzdm-deals-csv.md) | [`./smzdm-deals-sample.json`](./smzdm-deals-sample.json) | `maxTotalChargeUsd=0.01005` |

---

## 4) Unified 8-Tool MCP Quickstart / 统一 8 工具 MCP 快速开始

**Scope / 范围:** This MCP config exposes all 8 live paid Global & APAC Actors.  
此 MCP 配置覆盖全部 8 个在线付费全球与亚太 Actor。

### Streamable HTTP JSON / 流式 HTTP JSON

```json
{
  "mcpServers": {
    "apify-global-apac-b2b": {
      "url": "https://mcp.apify.com/?tools=perceptive_city_af7%2Fsec-edgar-filings-scraper%2Cperceptive_city_af7%2Fclinical-trials-scraper%2Cperceptive_city_af7%2Fuk-gov-tenders-scraper%2Cperceptive_city_af7%2Fsg-green-mark-buildings%2Cperceptive_city_af7%2Fcn-finance-news-scraper%2Cperceptive_city_af7%2Fmodelscope-scraper%2Cperceptive_city_af7%2Ftaptap-scraper%2Cperceptive_city_af7%2Fsmzdm-deals-scraper"
    }
  }
}
```

### Stdio PowerShell Command / Stdio PowerShell 命令

```powershell
$env:APIFY_TOKEN = "<YOUR_APIFY_TOKEN>"
npx -y @apify/actors-mcp-server --tools "perceptive_city_af7/sec-edgar-filings-scraper,perceptive_city_af7/clinical-trials-scraper,perceptive_city_af7/uk-gov-tenders-scraper,perceptive_city_af7/sg-green-mark-buildings,perceptive_city_af7/cn-finance-news-scraper,perceptive_city_af7/modelscope-scraper,perceptive_city_af7/taptap-scraper,perceptive_city_af7/smzdm-deals-scraper"
```

**Legacy v1.0.0 4-tool MCP config / 旧版 v1.0.0 4 工具 MCP 配置:** `https://api.apify.com/v2/key-value-stores/RdnBqv2mkrx9GM8bt/records/mcp.example.json`

**Account & billing safety / 账户与计费安全:** Use your own Apify/RapidAPI account; set spend limits; prefer PPE cost caps; rotate tokens; never commit `$APIFY_TOKEN`, `Authorization: Bearer`, `X-RapidAPI-Key`, or OAuth secrets.  
使用自己的 Apify/RapidAPI 账户；设置消费限额；优先使用按事件/成本上限；轮换令牌；勿提交 `$APIFY_TOKEN`、Bearer、`X-RapidAPI-Key` 或 OAuth 密钥。