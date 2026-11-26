# ClinicalTrials.gov Studies & Trials → n8n → CSV / Google Sheets Quickstart
**中文标题：ClinicalTrials.gov 研究数据 → n8n → CSV / Google Sheets 快速入门**

**English overview:** Production quickstart for importing the n8n workflow that calls Apify Actor `KchE3qKKrwU0rCe9f` via the sync API, caps spend at `maxTotalChargeUsd=0.25`, and emits 17 normalized JSON fields for Google Sheets Append Row or Convert to CSV.

**中文摘要：** 本指南说明如何导入 n8n 工作流，通过 Apify 同步 API 抓取 ClinicalTrials.gov 研究数据，输出 17 个规范化字段，供 Google Sheets 追加行或转换为 CSV；费用上限 `maxTotalChargeUsd=0.25`，切勿硬编码 token。

| Quick link | Value |
|---|---|
| Asset | ClinicalTrials.gov Studies & Trials (`perceptive_city_af7~clinical-trials-scraper`) |
| Actor ID | `KchE3qKKrwU0rCe9f` |
| Apify Store URL | `https://apify.com/perceptive_city_af7/clinical-trials-scraper` |
| Apify Pricing URL | `https://apify.com/perceptive_city_af7/clinical-trials-scraper/pricing` |
| Workflow JSON | [Download workflow](./n8n-clinical-trials-csv.json) |
| Sync API endpoint | `https://api.apify.com/v2/acts/KchE3qKKrwU0rCe9f/run-sync-get-dataset-items?maxTotalChargeUsd=0.25` |
| RapidAPI Hub Live URL | `https://rapidapi.com/fallRainy/api/clinicaltrials-gov-studies-trials` |
| RapidAPI REST endpoint | `GET /v1/clinical-trials/studies` |

## 2. n8n Import & Google Sheets / CSV Setup（导入与表格/CSV 设置）

**English:** Import `[Download workflow](./n8n-clinical-trials-csv.json)` into n8n via **Workflows → Import from File**. Configure auth with an `APIFY_TOKEN` environment variable or an n8n **Header Auth** credential. **NEVER hardcode tokens** in nodes, workflow JSON, docs, or source control.

- Preferred env-var pattern where enabled: `Authorization: Bearer {{$env.APIFY_TOKEN}}`.
- Header Auth alternative: create an n8n Header Auth credential with header name `Authorization` and value `Bearer <your APIFY_TOKEN>`; reference the credential from the HTTP Request node.
- The HTTP Request node calls the sync endpoint with JSON body and `retryOnFail: false`.
- The HTTP Request node returns structured JSON items ready for **Google Sheets Append Row**; map the 17 fields below to sheet columns. The same items feed **Convert to CSV** for file export.
- Keep the `attribution` field in Sheets/CSV output.

**Input JSON used in the workflow:**
```json
{"condition":"type 2 diabetes","status":"RECRUITING","queryTerm":"GLP-1","maxItems":25}
```

**Supported optional filters from `input_schema.json`:**

| Filter | Notes |
|---|---|
| `condition` | Optional condition filter |
| `intervention` | Optional intervention filter |
| `status` | Single enum, e.g. `RECRUITING`, `COMPLETED`, `ACTIVE_NOT_RECRUITING` |
| `sponsor` | Optional sponsor filter |
| `queryTerm` | Optional free-text query |
| `maxItems` | `1–5000` |

**Output fields (17 normalized fields):**
`nctId, briefTitle, officialTitle, overallStatus, phases, studyType, conditions, interventions, sponsorName, sponsorClass, enrollmentCount, startDate, primaryCompletionDate, lastUpdatePostDate, locationsCountries, studyUrl, attribution`

**中文摘要：** 导入 JSON；使用 `APIFY_TOKEN` 环境变量或 Header Auth 凭证；不要硬编码 token；HTTP Request 输出结构化 JSON，可直接接 Google Sheets Append Row，也可接 Convert to CSV。

## 3. curl Quickstart（curl 快速开始）

```bash
export APIFY_TOKEN="replace-with-your-token"  # do not commit

curl --fail-with-body -X POST \
  "https://api.apify.com/v2/acts/KchE3qKKrwU0rCe9f/run-sync-get-dataset-items?maxTotalChargeUsd=0.25" \
  -H "Authorization: Bearer $APIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"condition":"type 2 diabetes","status":"RECRUITING","queryTerm":"GLP-1","maxItems":25}'
```

**中文摘要：** 使用 `$APIFY_TOKEN` 调用同步 API，并在 URL 中设置 `maxTotalChargeUsd=0.25`。

## 4. Python Quickstart（Python 快速开始）

```python
import os
import httpx

payload = {
    "condition": "type 2 diabetes",
    "status": "RECRUITING",
    "queryTerm": "GLP-1",
    "maxItems": 25,
}

url = "https://api.apify.com/v2/acts/KchE3qKKrwU0rCe9f/run-sync-get-dataset-items"
params = {"maxTotalChargeUsd": "0.25"}
headers = {
    "Authorization": f"Bearer {os.environ['APIFY_TOKEN']}",
    "Content-Type": "application/json",
}

with httpx.Client(timeout=120) as client:
    resp = client.post(url, params=params, headers=headers, json=payload)
    resp.raise_for_status()
    studies = resp.json()

print(f"studies: {len(studies)}")
print(studies[0] if studies else "no records")
```

Swap `httpx` for `requests` if preferred. Keep `maxTotalChargeUsd=0.25` in the request params.

**中文摘要：** 使用 `os.environ["APIFY_TOKEN"]` 与 `httpx`/`requests` 调用同步 API，费用上限仍为 `maxTotalChargeUsd=0.25`。

## 5. RapidAPI Hub REST Alternative（RapidAPI REST 备选）

Use the RapidAPI Hub Live URL `https://rapidapi.com/fallRainy/api/clinicaltrials-gov-studies-trials` and call the REST endpoint `GET /v1/clinical-trials/studies`. Copy the live base URL and required RapidAPI auth headers from the Hub page. Query parameters mirror the supported filters: `condition`, `intervention`, `status`, `sponsor`, `queryTerm`, `maxItems`. This path uses RapidAPI credentials, **not** `APIFY_TOKEN`.

**中文摘要：** 也可通过 RapidAPI Hub 使用 `GET /v1/clinical-trials/studies`；认证使用 RapidAPI key，不使用 Apify token。

## 6. Cost Cap, Pricing & License Attribution（费用上限、定价与许可署名）

- **Pricing model:** Pay-per-event (PPE).
- **Price:** `$0.00005` per Actor start + `$0.0035` per saved study (`$3.50 / 1,000 records`).
- **Example:** 25 studies ≈ `$0.08755`.
- **Cap:** hard-capped at `maxTotalChargeUsd=0.25` in the sync API URL.
- **Workflow retry setting:** `retryOnFail: false`.
- **Pricing reference:** `https://apify.com/perceptive_city_af7/clinical-trials-scraper/pricing`
- **License & attribution:** ClinicalTrials.gov (U.S. National Library of Medicine, NIH) — US Government Public Domain, institutional study metadata only, zero PII. Keep the `attribution` field when redistributing.

**中文摘要：** PPE 计费：每次启动 `$0.00005` + 每条保存研究 `$0.0035`（`$3.50/1,000`）；25 条约 `$0.08755`；硬上限 `maxTotalChargeUsd=0.25`；保留 `attribution` 字段。

## 7. Honest Validation Note（真实验证说明）

The workflow JSON was validated locally against the real Actor `input_schema.json`. Executing the workflow, curl, or Python calls runs against Apify and bills your own Apify account. Test with `maxItems: 25` and `maxTotalChargeUsd=0.25` before scaling.

**中文摘要：** 工作流 JSON 已基于真实 `input_schema.json` 本地验证；实际执行会计费到你的 Apify 账户，建议先用 25 条与 `0.25` 上限测试。