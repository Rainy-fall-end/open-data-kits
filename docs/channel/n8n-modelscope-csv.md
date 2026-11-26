# Export ModelScope results to CSV in n8n

1. [Download the workflow JSON](https://api.apify.com/v2/key-value-stores/RdnBqv2mkrx9GM8bt/records/n8n-modelscope-csv.json) and import it from a new workflow's menu in n8n. It uses only the built-in Manual Trigger and HTTP Request nodes. [n8n import instructions](https://docs.n8n.io/workflows/export-import/)
2. Open **Run ModelScope and download CSV**. Create or select a **Header Auth** credential. Set **Name** to `Authorization`. For **Value**, enter `Bearer` followed by a space and your own Apify API token. Save it in the n8n credential editor. [Apify account settings](https://console.apify.com/settings/integrations)
3. Click **Execute workflow** once. In the HTTP Request output, open **Binary**, then download the `data` file. It is a UTF-8 CSV with up to three Qwen model rows and columns for model ID, name, license, downloads, likes, and URL.

The manual workflow sends one POST to Apify. That request starts the ModelScope Actor, waits for its dataset, and returns the selected records as a CSV attachment. The request caps both saved and returned items at three and sets a maximum Actor event charge of $0.00605, the current price of one start plus three records. Automatic retry is disabled. If a request times out, check your Apify runs before clicking Execute again. [ModelScope Actor](https://apify.com/perceptive_city_af7/modelscope-scraper) · [Apify pricing](https://apify.com/perceptive_city_af7/modelscope-scraper/pricing) · [Apify API](https://docs.apify.com/api/v2/actor-run-sync-get-dataset-items-post)

## Template distribution

n8n accepts workflow templates through its Creator Dashboard for review. This template is available here for direct import. Apify handles Actor execution, credits, and charges on the user's own account. n8n's affiliate program applies separately to eligible n8n Cloud subscriptions. [n8n template submission guide](https://docs.n8n.io/workflows/templates/) · [n8n affiliate program](https://n8n.io/affiliates/)

The workflow was imported into n8n 1.80.5 and run against a local test server that required the Authorization header. It produced a downloadable CSV with three rows. A separate live Apify API request verified three rows and the $0.00605 cap. The local n8n test used a test credential.
