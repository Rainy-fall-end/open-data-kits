# Singapore BCA Green Mark Buildings → n8n → Google Sheets / CSV
## 新加坡 BCA Green Mark 建筑 → n8n → Google Sheets / CSV 快速入门

**English overview:** Import the n8n workflow, call the Apify Actor for normalized Singapore BCA Green Mark certificate data, append rows to Google Sheets, and/or convert items to CSV. Use `maxTotalChargeUsd=0.25` as a hard budget cap and never hardcode tokens.

**中文摘要：** 导入 n8n 工作流，调用 Apify Actor 获取新加坡 BCA Green Mark 证书结构化数据，写入 Google Sheets 或转换为 CSV。使用 `maxTotalChargeUsd=0.25` 限制费用，禁止硬编码 Token。

**Quick links / 快速链接**
- Asset: Singapore BCA Green Mark Buildings (`perceptive_city_af7~sg-green-mark-buildings`)
- Actor ID: `Z3ioK0wOAeczj6nCx`
- Apify Store: https://apify.com/perceptive_city_af7/sg-green-mark-buildings
- Apify Pricing: https://apify.com/perceptive_city_af7/sg-green-mark-buildings/pricing
- Workflow JSON: [Download workflow](./n8n-sg-green-mark-csv.json)
- Sync API endpoint: `https://api.apify.com/v2/acts/Z3ioK0wOAeczj6nCx/run-sync-get-dataset-items?maxTotalChargeUsd=0.25`
- RapidAPI Hub Live: https://rapidapi.com/fallRainy/api/singapore-bca-green-mark-buildings

---

## 2. n8n Import & Google Sheets / CSV Setup
## n8n 导入与 Google Sheets / CSV 配置

1. Download the workflow JSON: [Download workflow](./n8n-sg-green-mark-csv.json).
2. In n8n: **Workflows → Import from File** and select the JSON.
3. Configure Apify auth safely — **NEVER hardcode tokens**:
   - Use a **Header Auth credential** with `Authorization: Bearer <APIFY_TOKEN>`, or
   - Reference the `APIFY_TOKEN` environment variable from your n8n deployment.
4. Confirm the HTTP Request node calls:
   `https://api.apify.com/v2/acts/Z3ioK0wOAeczj6nCx/run-sync-get-dataset-items?maxTotalChargeUsd=0.25`
5. Confirm the body uses the validated workflow input:
   `{"query":"Plaza","rating":"Platinum","maxItems":25}`
6. The HTTP Request node outputs structured JSON items ready for **Google Sheets Append Row** and feeds **Convert to CSV**.
7. For Google Sheets: create a sheet with the 12 output columns, then map fields by name in **Append Row**.
8. For CSV: connect the HTTP Request output to **Convert to CSV**, include headers, and keep all attribution columns.

**中文摘要：** 导入 JSON 后，用 Header Auth 或 `APIFY_TOKEN` 环境变量配置认证；HTTP Request 输出结构化 JSON，可直接追加到 Google Sheets，或交给 Convert to CSV 生成 CSV。

**Supported inputs / 支持参数**

| Parameter | Values / notes |
|---|---|
| `query` | Project name or certificate reference; Chinese rating keywords like `白金级` also work when `rating` is empty |
| `rating` | `""`, `Platinum`, `Goldplus`, `Gold`, `Certified` |
| `expiresWithinDays` | `0`–`3650`; optional rolling expiry window for retrofit lead-gen |
| `maxItems` | `1`–`1000` |

**Output fields / 输出字段 (12 normalized fields):**  
`referenceNo, projectName, projectType, rating, certifiedOn, expiresOn, sourceDataset, sourcePublisher, sourceUrl, accessedOn, licenceUrl, attribution`

---

## 3. `curl` Quickstart
## curl 快速开始

```bash
curl -sS -X POST \
  "https://api.apify.com/v2/acts/Z3ioK0wOAeczj6nCx/run-sync-get-dataset-items?maxTotalChargeUsd=0.25" \
  -H "Authorization: Bearer $APIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"Plaza","rating":"Platinum","maxItems":25}'
```

**中文摘要：** 使用 `$APIFY_TOKEN` 调用同步接口，并通过 URL 参数 `maxTotalChargeUsd=0.25` 限制费用。

---

## 4. `Python` Quickstart
## Python 快速开始

```python
import os
import requests

ACTOR_ID = "Z3ioK0wOAeczj6nCx"
url = f"https://api.apify.com/v2/acts/{ACTOR_ID}/run-sync-get-dataset-items"
token = os.environ["APIFY_TOKEN"]

payload = {
    "query": "Plaza",
    "rating": "Platinum",
    "maxItems": 25,
}

resp = requests.post(
    url,
    params={"maxTotalChargeUsd": "0.25"},
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    },
    json=payload,
    timeout=120,
)
resp.raise_for_status()
items = resp.json()

print(len(items), "certificates")
for row in items:
    print(row["referenceNo"], row["projectName"], row["rating"])
```

**中文摘要：** 使用 `os.environ["APIFY_TOKEN"]` 读取 Token，并通过 `maxTotalChargeUsd=0.25` 限制单次运行费用。

---

## 5. RapidAPI Hub REST Alternative
## RapidAPI Hub REST 替代方式

Use the RapidAPI Hub page for credentials and host details:  
https://rapidapi.com/fallRainy/api/singapore-bca-green-mark-buildings

REST endpoint:

```text
GET /v1/sg-green-mark/certificates
```

Example shape — use the exact host and key shown on your RapidAPI Hub page:

```bash
curl -sS "https://<RAPIDAPI_HOST>/v1/sg-green-mark/certificates?query=Plaza&rating=Platinum&maxItems=25" \
  -H "X-RapidAPI-Key: $RAPIDAPI_KEY" \
  -H "X-RapidAPI-Host: <RAPIDAPI_HOST>"
```

**中文摘要：** 也可通过 RapidAPI Hub 调用 `GET /v1/sg-green-mark/certificates`；Host 与 Key 以 Hub 页面为准。

---

## 6. Cost Cap, Pricing & Singapore Open Data Licence v1.0 Attribution
## 费用上限、定价与新加坡开放数据许可 v1.0 署名

- Pricing model: **Pay-per-event (PPE)**.
- Cost: `$0.00005` per Actor start + `$0.002` per saved certificate (`$2.00 / 1,000 records`).
- Example: 25 certificates ≈ `$0.05005`.
- Hard cap used here: `maxTotalChargeUsd=0.25`.
- The workflow uses `retryOnFail: false` to avoid unintended paid retries.

**License & attribution / 许可与署名**

Contains information from **Green Mark Buildings** by the **Building and Construction Authority (BCA), Singapore**, obtained from `data.gov.sg`  
(https://data.gov.sg/datasets/d_c4bd082b48fa7611713f39e23d250c27/view)  
under the **Singapore Open Data Licence version 1.0**  
(https://developers.data.gov.sg/open-data-licence).

Zero PII. Independent tool with no BCA endorsement. Keep `sourceUrl`, `accessedOn`, `licenceUrl`, and `attribution` columns when redistributing.

**中文摘要：** 按事件计费，25 条约 `$0.05005`，硬性上限 `maxTotalChargeUsd=0.25`；再分发时保留 `sourceUrl`、`accessedOn`、`licenceUrl`、`attribution`。

---

## 7. Validation Note
## 验证说明

The workflow JSON was validated locally against the real Actor `input_schema.json`. Executing the workflow or API calls bills your own Apify account.

**中文摘要：** 工作流 JSON 已在本地对照真实 Actor 的 `input_schema.json` 验证；实际执行会从你自己的 Apify 账户计费。