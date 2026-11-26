# n8n USAspending.gov Contracts Scraper Quickstart | n8n USAspending.gov 合同抓取器快速开始

Import and run the n8n workflow for Apify Actor `usaspending-gov-contracts-scraper` to fetch USAspending.gov contracts, grants, or IDVs and write normalized results to Google Sheets or CSV through Apify’s sync API.

本指南说明如何导入并运行 n8n 工作流，通过 Apify 同步 API 获取 USAspending.gov 合同/拨款/IDV 数据，并写入 Google Sheets 或 CSV。

## 1. Quick Links | 快速链接

- Apify Store: `https://apify.com/perceptive_city_af7/usaspending-gov-contracts-scraper`
- Apify Pricing: `https://apify.com/perceptive_city_af7/usaspending-gov-contracts-scraper/pricing`
- Workflow JSON: [Download workflow](./n8n-usaspending-contracts-csv.json)
- Sync API endpoint: `https://api.apify.com/v2/acts/eQQ2beomyLlW4DTGM/run-sync-get-dataset-items?maxTotalChargeUsd=0.25`
- Asset: `perceptive_city_af7~usaspending-gov-contracts-scraper`
- Actor ID: `eQQ2beomyLlW4DTGM`

### Input Parameters | 输入参数

| Field | Type | Notes |
|---|---|---|
| `keyword` | string | Search keyword |
| `awardCategory` | string | `contracts`, `grants`, `idvs` |
| `startDate` | string | `YYYY-MM-DD` |
| `endDate` | string | `YYYY-MM-DD` |
| `awardingAgency` | string | Agency filter |
| `minAwardAmount` | number | Minimum award amount |
| `naicsCode` | string | NAICS code filter |
| `sortOrder` | string | `desc`, `asc` |
| `maxItems` | integer | 1–5000 |

### Valid Workflow Input | 工作流有效输入

```json
{"keyword":"artificial intelligence","awardCategory":"contracts","startDate":"2025-01-01","endDate":"2026-12-31","sortOrder":"desc","maxItems":25}
```

### Output Fields | 输出字段

`generatedInternalId, awardId, awardCategory, recipientName, awardAmount, startDate, endDate, awardingAgency, awardingSubAgency, awardType, description, placeOfPerformanceCityCode, placeOfPerformanceStateCode, placeOfPerformanceCountryCode, naicsCode, naicsDescription, awardUrl, attribution`

## 2. n8n Import & Google Sheets / CSV Setup | n8n 导入与 Google Sheets / CSV 设置

- Import `./n8n-usaspending-contracts-csv.json` into n8n.
- Configure `APIFY_TOKEN` via environment variable or Header Auth credential. **NEVER hardcode tokens.**
- Verify the HTTP Request node uses `maxTotalChargeUsd=0.25` and `retryOnFail: false`.
- Google Sheets Append Row: map all 18 output fields in the listed order to matching columns; `generatedInternalId` is the stable row key.
- Convert to CSV: export the same 18 fields with a header row; keep the `attribution` column.
- 中文要点：导入工作流；用环境变量或 Header Auth 配置 `APIFY_TOKEN`，严禁硬编码；确认 `maxTotalChargeUsd=0.25` 与 `retryOnFail: false`；Google Sheets 追加行/CSV 转换映射全部 18 个字段并保留 `attribution`。

## 3. `curl` Quickstart | `curl` 快速开始

```bash
export APIFY_TOKEN="<your-apify-token>"

curl --request POST \
  "https://api.apify.com/v2/acts/eQQ2beomyLlW4DTGM/run-sync-get-dataset-items?maxTotalChargeUsd=0.25" \
  --header "Authorization: Bearer $APIFY_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{"keyword":"artificial intelligence","awardCategory":"contracts","startDate":"2025-01-01","endDate":"2026-12-31","sortOrder":"desc","maxItems":25}'
```

## 4. Python Quickstart | Python 快速开始

```python
import os
import httpx

token = os.environ["APIFY_TOKEN"]
url = "https://api.apify.com/v2/acts/eQQ2beomyLlW4DTGM/run-sync-get-dataset-items?maxTotalChargeUsd=0.25"
headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json",
}
payload = {"keyword":"artificial intelligence","awardCategory":"contracts","startDate":"2025-01-01","endDate":"2026-12-31","sortOrder":"desc","maxItems":25}

response = httpx.post(url, headers=headers, json=payload, timeout=120)
response.raise_for_status()
print(response.json())
```

## 5. REST & AI Agent (MCP) Integration Option | REST 与 AI Agent（MCP）集成选项

- Apify sync REST: `POST https://api.apify.com/v2/acts/eQQ2beomyLlW4DTGM/run-sync-get-dataset-items?maxTotalChargeUsd=0.25`
- Apify MCP Server: `https://mcp.apify.com/?tools=perceptive_city_af7%2Fusaspending-gov-contracts-scraper`

## 6. Cost Cap, Pricing & License Attribution | 费用上限、定价与许可归属

- Pay-per-event (PPE): `$0.00005` per Actor start + `$0.005` per saved record (`$5.00 / 1,000 records`).
- 25 records ≈ `$0.12505` (`0.00005 + 25 * 0.005`). Hard cap: `maxTotalChargeUsd=0.25`; set `retryOnFail: false`.
- License & attribution: U.S. Treasury USAspending.gov Official Public API v2 (`https://api.usaspending.gov/api/v2/search/spending_by_award/`), **US Government Public Domain (17 U.S.C. § 105)**. Commercial reuse allowed; zero PII. Keep the `attribution` column when redistributing.
- 中文要点：PPE 计费；25 条约 `$0.12505`；硬上限 `$0.25`；数据来自 USAspending.gov 公共 API，公共领域，可商用，无 PII，转发时保留 `attribution`。

## 7. Honest Validation Note | 真实验证说明

Validated locally against the real Actor `input_schema.json`. Executing the workflow calls the Apify API and bills your own Apify account.

已基于真实 Actor 的 `input_schema.json` 在本地验证；运行工作流会调用 Apify API 并计入你自己的 Apify 账户费用。