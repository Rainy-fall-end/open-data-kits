# USAspending FY2026 software contract activity with n8n

Find up to five federal contract awards matching `software` with activity in US fiscal year 2026, October 1, 2025 through September 30, 2026. Results sort by award amount descending.

默认查询 2025 年 10 月 1 日至 2026 年 9 月 30 日之间有活动的软件合同，按授标金额降序。返回合同的起始日期可能早于该财年。工作流只需在 n8n 中绑定一次 Header Auth 凭证。可直接下载 CSV，或把结果逐行追加到 Google Sheets。

## Run the five-record example

1. Download the JSON and choose **Import from File** in the menu of a new n8n workflow. [Download workflow JSON](https://api.apify.com/v2/key-value-stores/RdnBqv2mkrx9GM8bt/records/n8n-usaspending-contracts-csv.json) · [n8n import guide](https://docs.n8n.io/workflows/export-import/)
2. Open **Fetch USASpending Awards (Apify)**. Under **Generic Credential Type → Header Auth**, create or select a credential. For a new credential set **Name** to `Authorization`, and **Value** to `Bearer` followed by one space and your Apify API token. Save the credential in n8n. [Apify token settings](https://console.apify.com/settings/integrations) · [n8n Header Auth](https://docs.n8n.io/integrations/builtin/credentials/httprequest/)
3. Choose **Execute workflow** once. The HTTP Request output contains one JSON item per returned record. Open **Convert to CSV (Google Sheets Ready) → Binary → data** to download `usaspending-gov-contracts.csv`.
4. To send the same JSON items to a spreadsheet, connect **Google Sheets → Append Row** directly to the HTTP Request output. Select your spreadsheet, create the desired column headings, and map the fields by name. [Google Sheets node](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlesheets/)

在 HTTP Request 节点选择 Header Auth 凭证，执行一次后可在 CSV 节点的 **Binary → data** 中下载文件。写入表格时，请把 Google Sheets 接到 HTTP Request 节点。

## Input and fields

The HTTP Request node posts this input to the Actor. [Actor input](https://apify.com/perceptive_city_af7/usaspending-gov-contracts-scraper/input)

```json
{
  "awardCategory": "contracts",
  "keyword": "software",
  "startDate": "2025-10-01",
  "endDate": "2026-09-30",
  "sortOrder": "desc",
  "maxItems": 5
}
```

For a first sheet, use `generatedInternalId`, `awardId`, `recipientName`, `awardingAgency`, `awardAmount`, `startDate`, `endDate`, `description`, `awardUrl`, `attribution`. Use `generatedInternalId` as the record identifier. The input dates select award activity during FY2026. A returned award can have an earlier `startDate`. `awardAmount` is an award-level amount. Consult `awardUrl` for transaction details when calculating spending within the fiscal year.

## Cost per run

The included manual workflow requests up to five records. At the Free plan rate, five saved records cost **$0.02505** in Actor event charges, based on one **$0.00005** start event plus **$0.005** per saved record. The request sets `maxTotalChargeUsd=0.05` and disables automatic HTTP retries. If the HTTP request times out, check the Actor run in Apify before executing again. [Actor pricing](https://apify.com/perceptive_city_af7/usaspending-gov-contracts-scraper/pricing)

首次运行上限为五条，生成五条时的 Free 档事件费用为 **$0.02505**。每次运行设置 **$0.05** 的 Actor 计费上限，HTTP 节点已关闭自动重试。

The workflow imported into n8n 1.80.5. With a local test endpoint and a test Header Auth credential, one manual execution sent one POST and returned two sample JSON items and a downloadable two-row CSV. Executing the workflow against Apify uses your account.

## Using the same input from the API

For the shell and Python examples, set `APIFY_TOKEN` in your own shell. Each command starts a separate billable run. [Apify sync endpoint](https://docs.apify.com/api/v2/actor-run-sync-get-dataset-items-post)

```bash
curl --fail-with-body -X POST \
  'https://api.apify.com/v2/acts/eQQ2beomyLlW4DTGM/run-sync-get-dataset-items?maxTotalChargeUsd=0.05&timeout=120&format=json&clean=true' \
  -H "Authorization: Bearer $APIFY_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"awardCategory":"contracts","keyword":"software","startDate":"2025-10-01","endDate":"2026-09-30","sortOrder":"desc","maxItems":5}'
```

```python
import os

import requests

payload = {
    "awardCategory": "contracts",
    "keyword": "software",
    "startDate": "2025-10-01",
    "endDate": "2026-09-30",
    "sortOrder": "desc",
    "maxItems": 5
}
response = requests.post(
    "https://api.apify.com/v2/acts/eQQ2beomyLlW4DTGM/run-sync-get-dataset-items",
    params={"maxTotalChargeUsd": "0.05", "timeout": "120", "format": "json", "clean": "true"},
    headers={"Authorization": f"Bearer {os.environ['APIFY_TOKEN']}"},
    json=payload,
    timeout=150,
)
response.raise_for_status()
print(len(response.json()))
```

In an authenticated MCP client, connect to the [Apify MCP server](https://mcp.apify.com/?tools=perceptive_city_af7%2Fusaspending-gov-contracts-scraper).

## Source and attribution

Keep `attribution` and `awardUrl` with exported records so readers can trace them to the U.S. Treasury source. [USAspending award search](https://www.usaspending.gov/search)
