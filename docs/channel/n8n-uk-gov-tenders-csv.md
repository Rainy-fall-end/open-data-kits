# UK Gov Tenders & Procurement — Contracts Finder OCDS CSV Quickstart

**English:** Production quickstart for `perceptive_city_af7~uk-gov-tenders-scraper` (Actor ID `txnvyTckeQx4hVBc6`). Import the n8n workflow, call the Apify synchronous REST endpoint with a hard `$0.25` spend cap, append structured tender notices to Google Sheets, or convert them to CSV. Built for UK public-sector tender monitoring and B2G lead generation.

**中文摘要：** 本指南用于 `perceptive_city_af7~uk-gov-tenders-scraper`（Actor ID `txnvyTckeQx4hVBc6`）。通过 n8n 导入工作流，同步调用 Apify REST 接口，硬性限制 `$0.25` 费用，将结构化招标数据写入 Google Sheets 或转换为 CSV，适用于英国政府招标监控与 B2G 线索生成。

## Quick links / 快速链接

- **Apify Store:** `https://apify.com/perceptive_city_af7/uk-gov-tenders-scraper`
- **Apify Pricing:** `https://apify.com/perceptive_city_af7/uk-gov-tenders-scraper/pricing`
- **Workflow JSON:** [Download workflow](./n8n-uk-gov-tenders-csv.json)
- **Sync API endpoint:** `https://api.apify.com/v2/acts/txnvyTckeQx4hVBc6/run-sync-get-dataset-items?maxTotalChargeUsd=0.25`
- **Asset:** `perceptive_city_af7~uk-gov-tenders-scraper`
- **Actor ID:** `txnvyTckeQx4hVBc6`

### Input parameters / 输入参数

| Parameter | Meaning |
|---|---|
| `keyword` | Search keyword / 搜索关键词 |
| `stages` | `tender`, `planning`, `award`, or `planning,tender,award` |
| `minValue` | GBP minimum contract value / 最低合同金额（英镑） |
| `publishedFrom` | ISO 8601 date, e.g. `2026-11-01` |
| `maxItems` | 1–2000 items / 返回条数上限 |

Valid input JSON used in the workflow:

```json
{"keyword":"software","stages":"tender","minValue":50000,"maxItems":25}
```

### Output fields / 输出字段

`ocid, releaseId, tenderId, title, stage, status, publishedDate, deadlineDate, valueAmount, minValueAmount, currency, procurementCategory, cpvCode, cpvDescription, smeSuitable, buyerId, buyerName, buyerLocality, buyerCountry, noticeUrl, sourceDataset, sourcePublisher, sourceUrl, accessedOn, licenceName, licenceUrl, attribution`

---

## 2. n8n Import & Google Sheets / CSV Setup | n8n 导入与 Google Sheets / CSV 设置

1. Import `[Download workflow](./n8n-uk-gov-tenders-csv.json)` into n8n.
2. Configure authentication safely:
   - Preferred: set the `APIFY_TOKEN` environment variable in n8n and reference it in the HTTP Request node.
   - Alternative: use an n8n **Header Auth** credential with `Authorization: Bearer <APIFY_TOKEN>`.
   - **NEVER hardcode tokens** in workflow JSON, node parameters, or exported files.
3. Confirm the HTTP Request node calls the synchronous endpoint with the hard cap:
   - `https://api.apify.com/v2/acts/txnvyTckeQx4hVBc6/run-sync-get-dataset-items?maxTotalChargeUsd=0.25`
4. Keep the workflow body as the validated input:

```json
{"keyword":"software","stages":"tender","minValue":50000,"maxItems":25}
```

5. The HTTP Request node outputs structured JSON items ready for **Google Sheets Append Row** and feeds **Convert to CSV**.
6. Map output fields to sheet columns. Keep `licenceName`, `licenceUrl`, and `attribution` when redistributing.
7. For CSV export, connect HTTP Request → Convert to CSV → your storage node, e.g. Google Drive or Write Binary File.
8. Keep `retryOnFail: false` to avoid unintended duplicate charges. Personal `contactPoint` details are excluded from the source output, so the dataset is zero-PII for this integration.

**中文要点：** 导入工作流后，用环境变量或 Header Auth 管理 `APIFY_TOKEN`，禁止硬编码。HTTP Request 返回结构化 JSON，可直接写入 Google Sheets 或转为 CSV。保留许可证与署名列，保持 `retryOnFail: false`。

---

## 3. `curl` Quickstart | `curl` 快速开始

```bash
export APIFY_TOKEN="<your-apify-token>"

curl --fail-with-body -sS -X POST \
  "https://api.apify.com/v2/acts/txnvyTckeQx4hVBc6/run-sync-get-dataset-items?maxTotalChargeUsd=0.25" \
  -H "Authorization: Bearer $APIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"keyword":"software","stages":"tender","minValue":50000,"maxItems":25}'
```

**中文要点：** 使用 `$APIFY_TOKEN` 环境变量，不把令牌写入命令历史或脚本。`maxTotalChargeUsd=0.25` 为硬性费用上限。

---

## 4. Python Quickstart | Python 快速开始

```python
import os
import httpx

APIFY_TOKEN = os.environ["APIFY_TOKEN"]

url = (
    "https://api.apify.com/v2/acts/txnvyTckeQx4hVBc6/"
    "run-sync-get-dataset-items?maxTotalChargeUsd=0.25"
)

payload = {
    "keyword": "software",
    "stages": "tender",
    "minValue": 50000,
    "maxItems": 25,
}

headers = {
    "Authorization": f"Bearer {APIFY_TOKEN}",
    "Content-Type": "application/json",
}

response = httpx.post(url, json=payload, headers=headers, timeout=120.0)
response.raise_for_status()

items = response.json()
print(f"Returned {len(items)} notice(s)")
```

**中文要点：** 使用 `os.environ["APIFY_TOKEN"]` 读取令牌，使用同步接口并保持 `maxTotalChargeUsd=0.25`。返回 JSON 数组可直接写入表格、数据库或 CSV。

---

## 5. REST & AI Agent (MCP) Integration Option | REST 与 AI Agent（MCP）集成选项

Use Apify’s synchronous REST endpoint above for deterministic workflows, scripts, and n8n HTTP Request nodes.

For AI B2G lead-gen agents, connect via the Apify MCP Server:

`https://mcp.apify.com/?tools=perceptive_city_af7%2Fuk-gov-tenders-scraper`

See `BUYER_CATALOG.md` for our full Apify + RapidAPI Hub catalog.

**中文要点：** 同步 REST 适合自动化流程与脚本；AI Agent 可通过 Apify MCP Server 接入。完整目录见 `BUYER_CATALOG.md`。

---

## 6. Cost Cap, Pricing & Open Government Licence v3.0 Attribution | 费用上限、定价与 OGL v3.0 署名

### Pricing / 定价

- Pay-per-event (PPE):
  - `$0.00005` per Actor start
  - `$0.005` per saved notice
  - Equivalent to `$5.00 / 1,000 notices`
- 25 notices ≈ `$0.12505`
- Hard cap: `maxTotalChargeUsd=0.25`
- Workflow setting: `retryOnFail: false`

### Licence & attribution / 许可证与署名

Source: **Cabinet Office UK Government Contracts Finder OCDS API**, licensed under the **Open Government Licence v3.0**:

`http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/`

Commercial reuse is permitted with attribution. Required attribution text:

> Contains public sector information licensed under the Open Government Licence v3.0.

Personal `contactPoint` details are excluded (zero PII). Keep `licenceName`, `licenceUrl`, and `attribution` columns when redistributing.

**中文要点：** 按事件付费，`$0.005/条`，25 条约 `$0.12505`，硬性上限 `$0.25`。数据来自 Cabinet Office Contracts Finder OCDS API，采用 Open Government Licence v3.0；商用需署名，再分发时保留许可证与署名列。

---

## 7. Honest Validation Note | 真实验证说明

The workflow JSON was validated locally against the real Actor `input_schema.json`. Executing the workflow calls the Apify API and bills your own Apify account.

**中文说明：** 工作流 JSON 已在本地依据真实 Actor 的 `input_schema.json` 验证。实际执行会调用 Apify API，并计入你自己的 Apify 账户费用。