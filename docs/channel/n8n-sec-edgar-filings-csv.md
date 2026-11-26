# SEC EDGAR Corporate Filings → CSV with n8n / SEC EDGAR 公司披露 → CSV（n8n 快速入门）

**English overview:** Production quickstart for importing the n8n workflow that calls Apify Actor `perceptive_city_af7~sec-edgar-filings-scraper` (`8LFIbRbidiHPknMz5`), retrieves normalized SEC EDGAR filing rows, and writes them to Google Sheets or CSV.

**中文摘要：** 本指南说明如何导入 n8n 工作流、安全配置 Apify Token、调用 SEC EDGAR Actor，将 18 个标准化字段写入 Google Sheets 或 CSV；包含 curl、Python、RapidAPI 示例、费用上限与许可归属说明。

**Quick links / 快速链接**
- Asset: `perceptive_city_af7~sec-edgar-filings-scraper`
- Actor ID: `8LFIbRbidiHPknMz5`
- Apify Store: `https://apify.com/perceptive_city_af7/sec-edgar-filings-scraper`
- Apify Pricing: `https://apify.com/perceptive_city_af7/sec-edgar-filings-scraper/pricing`
- RapidAPI Hub Live URL: `https://rapidapi.com/fallRainy/api/sec-edgar-corporate-filings`
- Workflow JSON: [Download workflow](./n8n-sec-edgar-filings-csv.json)
- Sync API endpoint: `https://api.apify.com/v2/acts/8LFIbRbidiHPknMz5/run-sync-get-dataset-items?maxTotalChargeUsd=0.25`

## 2. n8n Import & Google Sheets / CSV Setup / n8n 导入与 Google Sheets / CSV 设置

1. Import [Download workflow](./n8n-sec-edgar-filings-csv.json) into n8n.
2. Configure authentication securely:
   - Set `APIFY_TOKEN` as an n8n environment variable and reference it in the HTTP Request node header, **or**
   - Use an n8n **Header Auth** credential with `Authorization: Bearer <APIFY_TOKEN>`.
   - **NEVER hardcode tokens** in workflow JSON, node fields, code, or docs.
3. The HTTP Request node calls the sync endpoint with a hard cap:
   `https://api.apify.com/v2/acts/8LFIbRbidiHPknMz5/run-sync-get-dataset-items?maxTotalChargeUsd=0.25`
4. Keep `retryOnFail: false` to avoid duplicate billed runs.
5. The HTTP Request outputs structured JSON items ready for a **Google Sheets Append Row** node, and feeds directly into **Convert to CSV**.
6. For Google Sheets, create headers matching the 18 normalized fields below; map each field into Append Row.
7. For CSV, connect the HTTP Request output directly to the Convert to CSV node.

**Valid input JSON used in the workflow:**

```json
{"mode":"search","query":"artificial intelligence","forms":"10-K,10-Q,8-K","startDate":"2025-01-01","maxItems":25}
```

**Company-mode example / 公司模式示例:**

```json
{"mode":"company","ticker":"AAPL","forms":"10-K,10-Q,8-K,4"}
```

**Output fields (18 normalized fields):** `accessionNumber, cik, companyName, tickers, form, filingDate, reportDate, fileNumber, items, documentType, documentDescription, sic, sicDescription, stateOfIncorporation, businessLocation, filingUrl, documentUrl, attribution`

## 3. `curl` Quickstart / curl 快速开始

```bash
export APIFY_TOKEN="<your_apify_token>"  # never commit real tokens

curl -sS --fail \
  -X POST \
  "https://api.apify.com/v2/acts/8LFIbRbidiHPknMz5/run-sync-get-dataset-items?maxTotalChargeUsd=0.25" \
  -H "Authorization: Bearer $APIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mode":"search","query":"artificial intelligence","forms":"10-K,10-Q,8-K","startDate":"2025-01-01","maxItems":25}'
```

The sync endpoint returns a JSON array of structured filing items.

## 4. `Python` Quickstart / Python 快速开始

```python
import os
import httpx

APIFY_TOKEN = os.environ["APIFY_TOKEN"]  # do not hardcode

url = "https://api.apify.com/v2/acts/8LFIbRbidiHPknMz5/run-sync-get-dataset-items"
params = {"maxTotalChargeUsd": "0.25"}

payload = {
    "mode": "search",
    "query": "artificial intelligence",
    "forms": "10-K,10-Q,8-K",
    "startDate": "2025-01-01",
    "maxItems": 25,
}

headers = {
    "Authorization": f"Bearer {APIFY_TOKEN}",
    "Content-Type": "application/json",
}

with httpx.Client(timeout=120) as client:
    response = client.post(url, params=params, headers=headers, json=payload)
    response.raise_for_status()
    items = response.json()

print(f"records={len(items)}")
print(items[:1])
```

You can use `requests` or `urllib` similarly; keep the token in `os.environ["APIFY_TOKEN"]` and keep `maxTotalChargeUsd=0.25` in the request.

## 5. RapidAPI Hub REST Alternative / RapidAPI REST 替代方案

- RapidAPI Hub Live URL: `https://rapidapi.com/fallRainy/api/sec-edgar-corporate-filings`
- REST endpoint: `GET /v1/sec-edgar/filings`

Use the RapidAPI dashboard to obtain the required `X-RapidAPI-Key` and `X-RapidAPI-Host` headers. Do not hardcode RapidAPI keys in code or workflow exports. Use the dashboard’s generated request example for the exact host and authentication headers.

## 6. Cost Cap, Pricing & License Attribution / 费用上限、定价与许可归属

- Pricing model: Pay-per-event (PPE).
- Cost: `$0.00005` per Actor start + `$0.004` per saved record (`$4.00 / 1,000 records`).
- 25 records ≈ `$0.10005`.
- Hard cap in this guide/workflow: `maxTotalChargeUsd=0.25`.
- Workflow setting: `retryOnFail: false`.
- License & attribution: U.S. Securities and Exchange Commission (SEC EDGAR) — US Government Public Domain, zero PII, SEC Fair Access compliant.
- Keep the `attribution` field when redistributing results.

## 7. Honest Validation Note / 验证说明

The workflow JSON was validated locally against the real Actor `input_schema.json`; executing the workflow bills your own Apify account.