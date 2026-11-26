# Open Gov Connectors for Google Sheets + Excel / Power BI

Zero-dependency analyst connectors for exactly eight public data products. Credentials are read at runtime and are never stored in these files.

面向分析师的零依赖连接器，仅覆盖下列八个公开数据产品。凭证只在运行时读取，文件中不保存密钥。

| Function / 函数 | Provider / 平台 | Public product / 公开产品 |
|---|---|---|
| `RAPIDAPI_SEC_EDGAR` | RapidAPI | `sec-edgar-corporate-filings` |
| `RAPIDAPI_CLINICAL_TRIALS` | RapidAPI | `clinicaltrials-gov-studies-trials` |
| `RAPIDAPI_OPENFDA` | RapidAPI | `openfda-recalls-enforcement-approvals` |
| `RAPIDAPI_SG_GREEN_MARK` | RapidAPI | `singapore-bca-green-mark-buildings` |
| `APIFY_SEC_EDGAR` | Apify | `8LFIbRbidiHPknMz5` |
| `APIFY_CLINICAL_TRIALS` | Apify | `KchE3qKKrwU0rCe9f` |
| `APIFY_UK_TENDERS` | Apify | `txnvyTckeQx4hVBc6` |
| `APIFY_SG_GREEN_MARK` | Apify | `Z3ioK0wOAeczj6nCx` |

## Google Sheets / 谷歌表格

1. Open a Sheet, choose **Extensions → Apps Script**, replace the editor contents with [`google-sheets/OpenGovConnectors.gs`](google-sheets/OpenGovConnectors.gs), and save. / 打开表格，进入 **扩展程序 → Apps Script**，粘贴该文件并保存。
2. In Apps Script, open **Project Settings → Script properties** and add `RAPIDAPI_KEY` and/or `APIFY_TOKEN`. Paste only your own values into the settings UI. / 在 **项目设置 → 脚本属性** 中添加对应名称，并仅在设置界面粘贴自己的值。
3. Reload the Sheet and use **Open Gov Connectors** for safe defaults, or enter a formula below. The first run asks for authorization. Results spill into adjacent cells. / 刷新表格后使用菜单，或输入以下公式；首次运行需授权，结果会自动展开。

```text
=RAPIDAPI_SEC_EDGAR("company","","10-K,10-Q,8-K","","AAPL","","",10)
=RAPIDAPI_CLINICAL_TRIALS("diabetes","","RECRUITING","","",10)
=RAPIDAPI_OPENFDA("drug_enforcement","","Class I","Ongoing",10)
=RAPIDAPI_SG_GREEN_MARK("Platinum",10)
=APIFY_SEC_EDGAR("company","","10-K,10-Q,8-K","","AAPL","","",10)
=APIFY_CLINICAL_TRIALS("diabetes","","RECRUITING","","",10)
=APIFY_UK_TENDERS("software","tender","","",10)
=APIFY_SG_GREEN_MARK("","Platinum","",10)
```

Nested records become dotted columns; arrays remain JSON text. Strings beginning with `=`, `+`, `-`, `@`, tab, or carriage return receive a leading apostrophe before being returned to a cell. Every Apify request includes the server-side `maxTotalChargeUsd=0.25` limit. / 嵌套对象展开为点号列名，数组保留为 JSON；危险公式前缀会自动添加英文单引号。所有 Apify 请求均带有服务端 0.25 美元硬上限。

## Excel / Power BI Power Query

1. Open **Power Query Editor → Manage Parameters → New Parameter**. Create `RapidApiKey` and/or `ApifyToken` as **Text** parameters and enter your own value there. / 在 **Power Query 编辑器 → 管理参数 → 新建参数** 中创建文本参数 `RapidApiKey` 和/或 `ApifyToken`。
2. Choose **New Source → Blank Query → Advanced Editor**, paste one `.pq` file from [`power-query/`](power-query/), then select **Done**. / 新建空白查询，在高级编辑器中粘贴所需 `.pq` 文件。
3. When prompted for web credentials, choose **Anonymous** for the API host; the query supplies the runtime header. Adjust only the `QueryAll` record (RapidAPI) or `Input` record (Apify) near the top, then refresh. / Web 凭证方式选择 **匿名**；筛选条件只需修改文件顶部的 `QueryAll` 或 `Input` 记录，然后刷新。

The folder contains four `rapidapi-*.pq` and four `apify-*.pq` modules. Each produces a table, checks HTTP/JSON shape, recursively flattens records, preserves arrays as JSON text, and neutralizes dangerous text prefixes. Apify modules all enforce `maxTotalChargeUsd = "0.25"`. / 目录包含四个 RapidAPI 与四个 Apify 模块；每个模块都进行错误检查、递归展开和文本安全处理，Apify 模块统一强制 0.25 美元上限。

## Offline verification / 离线验证

With Node.js 20 or newer:

```text
node verify.mjs
```

The verifier uses only Node built-ins. It runs the Apps Script in a sandbox with mocked Apps Script services backed by a real `127.0.0.1` server, makes no external network calls, validates the eight Power Query modules plus the repository contracts, and writes `evidence.json`. / 验证器只使用 Node 内置模块，通过本机回环服务器测试全部连接器，不访问外网，并生成 `evidence.json`。
