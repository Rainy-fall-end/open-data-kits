# Export TapTap mobile game rankings to CSV in n8n

Import this workflow, add your Apify API token, execute once, and download a UTF-8 CSV of TapTap mobile game rankings. It uses only built-in nodes and is capped at two items for a low-cost test run.

[Download workflow](./n8n-taptap-rankings-csv.json) · [Free JSON sample](./taptap-sample.json) · [n8n import instructions](https://docs.n8n.io/workflows/export-import/)

## What it does

The workflow uses **Manual Trigger** + **HTTP Request** (built-in nodes). The HTTP Request node is named **Run TapTap hot rankings and download CSV**.

It fetches TapTap's public Android hot rankings with this JSON body:

```json
{"mode": "rankings", "rankingType": "hot", "platform": "android", "maxItems": 2}
```

`developer` may be empty when TapTap's ranking endpoint omits developer metadata. The Actor also supports `reserve`, `played`, and `sell` charts, `ios` platform, `game_detail` mode, and `reviews` mode by editing the JSON body.

## Setup

1. Import the workflow using the n8n import instructions above.
2. Open **Run TapTap hot rankings and download CSV**.
3. Create a **Header Auth** credential:
   - Name: `Authorization`
   - Value: `Bearer` + space + your Apify API token (`https://console.apify.com/settings/integrations`)
4. Keep the two-item cap unless you intend to spend more: `maxItems: 2`, `limit=2`, `maxTotalChargeUsd=0.00505`.

## Run and export

Execute once, open **Binary**, and download `data`. The result is a UTF-8 CSV with columns:

`kind,app_id,title,score,developer,tags,fans_count,hits_total,url,rank,ranking_type`

## Cost cap and pricing

The workflow is limited with `maxItems: 2`, `limit=2`, and `maxTotalChargeUsd=0.00505`. On the Free tier, current pricing is $0.00005 per Actor start plus $0.0025 per saved item ($2.50 / 1,000 items), so two items cost $0.00505. Paid Apify plans offer lower per-item rates: Starter $2.375/1K, Scale $2.125/1K, Business $1.875/1K.

No schedule is configured. Automatic retry is disabled (`retryOnFail: false`). If a request times out, check your Apify runs before executing again.

## Links

[TapTap Scraper Actor](https://apify.com/perceptive_city_af7/taptap-scraper) · [Actor pricing](https://apify.com/perceptive_city_af7/taptap-scraper/pricing) · [Apify API](https://docs.apify.com/api/v2/actor-run-sync-get-dataset-items-post)

## Honesty note

The workflow JSON structure was validated locally and paired with an anonymous 2-item sample from TapTap's public Android hot chart. Executing the workflow bills your own Apify account.