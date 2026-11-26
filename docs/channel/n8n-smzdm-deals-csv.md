# Export SMZDM featured deals to CSV in n8n

[Download workflow](./n8n-smzdm-deals-csv.json) · [Free JSON sample](./smzdm-deals-sample.json) · [n8n import instructions](https://docs.n8n.io/workflows/export-import/)

This buyer setup guide gets you from import to CSV using only n8n built-in nodes: **Manual Trigger + HTTP Request**. It scans SMZDM (什么值得买) public featured deals (`jingxuan`) and returns a UTF-8 CSV.

## What it does

- **Manual Trigger** starts the workflow.
- **Run SMZDM deals scraper and download CSV** (HTTP Request node) calls the Actor with `{"maxItems": 2, "maxPages": 1}`.
- Extracts deal ID, title, listed price (`price_text`), merchant (`merchant`), canonical SMZDM deal URL, page number, and `history_low_label`.
- `history_low_label` is populated only when the source card displays a historical-low badge such as `历史低价`; otherwise it is null/empty.

## Before you start

You need an Apify account and API token: [Apify integrations](https://console.apify.com/settings/integrations). Executing the workflow bills your own Apify account.

## Import and configure

1. [Download the workflow](./n8n-smzdm-deals-csv.json) and import it using n8n’s [import instructions](https://docs.n8n.io/workflows/export-import/).
2. Open the HTTP Request node named **Run SMZDM deals scraper and download CSV**.
3. Set up **Header Auth**:
   - Name: `Authorization`
   - Value: `Bearer ` + your Apify API token ([Apify integrations](https://console.apify.com/settings/integrations)). Note the space after `Bearer`.
4. Keep the built-in cost cap: `maxItems: 2`, `limit=2`, and `maxTotalChargeUsd=0.01005`.

## Run and download

Click **Execute once**, open **Binary**, and download `data`. The file is UTF-8 CSV with these columns:

`deal_id,title,price_text,merchant,url,source_page,history_low_label`

## Cost cap and pricing

The workflow limits `maxItems: 2` and `limit=2` with `maxTotalChargeUsd=0.01005`. On the Free tier, current pricing is $0.00005 per Actor start plus $0.005 per saved deal ($5.00 / 1,000 items), so two items cost $0.01005. Paid Apify plans offer lower per-item rates: Starter $4.75/1K, Scale $4.25/1K, Business $3.75/1K.

There is no schedule, and automatic retry is disabled (`retryOnFail: false`). If a request times out, check your Apify runs before executing again.

## Honest validation note

The workflow JSON structure was validated locally and paired with an anonymous 2-item sample from SMZDM’s public featured page. Executing the workflow bills your own Apify account.

## Links

[SMZDM Deals Actor](https://apify.com/perceptive_city_af7/smzdm-deals-scraper) · [Actor pricing](https://apify.com/perceptive_city_af7/smzdm-deals-scraper/pricing) · [Apify API](https://docs.apify.com/api/v2/actor-run-sync-get-dataset-items-post)