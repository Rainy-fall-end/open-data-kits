# Recruiting type 2 diabetes studies from ClinicalTrials.gov with n8n

Find up to five type 2 diabetes studies whose registry status is `RECRUITING`. Compare sponsors, study phase, enrollment and the last registry update.

默认查找最多五项正在招募的 2 型糖尿病研究，可比较申办方、研究分期和最近更新时间。工作流只需在 n8n 中绑定一次 Header Auth 凭证。可直接下载 CSV，或把结果逐行追加到 Google Sheets。

## Run the five-record example

1. Download the JSON and choose **Import from File** in the menu of a new n8n workflow. [Download workflow JSON](https://api.apify.com/v2/key-value-stores/RdnBqv2mkrx9GM8bt/records/n8n-clinical-trials-csv.json) · [n8n import guide](https://docs.n8n.io/workflows/export-import/)
2. Open **Fetch ClinicalTrials.gov Studies (Apify)**. Under **Generic Credential Type → Header Auth**, create or select a credential. For a new credential set **Name** to `Authorization`, and **Value** to `Bearer` followed by one space and your Apify API token. Save the credential in n8n. [Apify token settings](https://console.apify.com/settings/integrations) · [n8n Header Auth](https://docs.n8n.io/integrations/builtin/credentials/httprequest/)
3. Choose **Execute workflow** once. The HTTP Request output contains one JSON item per returned record. Open **Convert to CSV (Google Sheets Ready) → Binary → data** to download `clinical-trials-studies.csv`.
4. To send the same JSON items to a spreadsheet, connect **Google Sheets → Append Row** directly to the HTTP Request output. Select your spreadsheet, create the desired column headings, and map the fields by name. [Google Sheets node](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlesheets/)

在 HTTP Request 节点选择 Header Auth 凭证，执行一次后可在 CSV 节点的 **Binary → data** 中下载文件。写入表格时，请把 Google Sheets 接到 HTTP Request 节点。

## Input and fields

The HTTP Request node posts this input to the Actor. [Actor input](https://apify.com/perceptive_city_af7/clinical-trials-scraper/input)

```json
{
  "condition": "type 2 diabetes",
  "status": "RECRUITING",
  "maxItems": 5
}
```

For a first sheet, use `nctId`, `briefTitle`, `overallStatus`, `phases`, `sponsorName`, `enrollmentCount`, `lastUpdatePostDate`, `studyUrl`, `attribution`. Use `nctId` as the record identifier. `overallStatus` applies to the study as a whole. Open `studyUrl` to check site-level availability and the current registry entry. For a different cohort, change `condition` or `status` in the JSON body.

## Cost per run

The included manual workflow requests up to five records. At the Free plan rate, five saved records cost **$0.01755** in Actor event charges, based on one **$0.00005** start event plus **$0.0035** per saved record. The request sets `maxTotalChargeUsd=0.05` and disables automatic HTTP retries. If the HTTP request times out, check the Actor run in Apify before executing again. [Actor pricing](https://apify.com/perceptive_city_af7/clinical-trials-scraper/pricing)

首次运行上限为五条，生成五条时的 Free 档事件费用为 **$0.01755**。每次运行设置 **$0.05** 的 Actor 计费上限，HTTP 节点已关闭自动重试。

The workflow imported into n8n 1.80.5. With a local test endpoint and a test Header Auth credential, one manual execution sent one POST and returned two sample JSON items and a downloadable two-row CSV. Executing the workflow against Apify uses your account.

## Using the same input from the API

For the shell and Python examples, set `APIFY_TOKEN` in your own shell. Each command starts a separate billable run. [Apify sync endpoint](https://docs.apify.com/api/v2/actor-run-sync-get-dataset-items-post)

```bash
curl --fail-with-body -X POST \
  'https://api.apify.com/v2/acts/KchE3qKKrwU0rCe9f/run-sync-get-dataset-items?maxTotalChargeUsd=0.05&timeout=120&format=json&clean=true' \
  -H "Authorization: Bearer $APIFY_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"condition":"type 2 diabetes","status":"RECRUITING","maxItems":5}'
```

```python
import os

import requests

payload = {
    "condition": "type 2 diabetes",
    "status": "RECRUITING",
    "maxItems": 5
}
response = requests.post(
    "https://api.apify.com/v2/acts/KchE3qKKrwU0rCe9f/run-sync-get-dataset-items",
    params={"maxTotalChargeUsd": "0.05", "timeout": "120", "format": "json", "clean": "true"},
    headers={"Authorization": f"Bearer {os.environ['APIFY_TOKEN']}"},
    json=payload,
    timeout=150,
)
response.raise_for_status()
print(len(response.json()))
```

[ClinicalTrials.gov Studies & Trials on RapidAPI](https://rapidapi.com/fallRainy/api/clinicaltrials-gov-studies-trials) offers a separate integration with its own credentials and pricing.

## Source and attribution

Keep `attribution` and `studyUrl` with exported records. Registry sponsors and investigators provide the study information. [ClinicalTrials.gov terms](https://clinicaltrials.gov/about-site/terms-conditions)
