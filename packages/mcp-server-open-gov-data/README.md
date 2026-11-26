# mcp-server-open-gov-data

A zero-third-party-dependency local MCP server for eight allowlisted paid, read-only open-government-data tools. It implements JSON-RPC 2.0 over newline-delimited stdio on Node.js 20+ and never accepts an arbitrary Actor ID, host, URL, or credential in tool arguments.

中文摘要：这是一个仅使用 Node.js 20+ 内置模块的本地 MCP stdio Server。它固定暴露 4 个 RapidAPI 付费查询工具和 4 个欧美/新加坡 Apify 付费 Actor 工具；不包含两款私有香港 Actor，不从参数读取密钥，并对每次 Apify 调用强制附加不可绕过的 `maxTotalChargeUsd` 服务端限费参数。

## Tools

| MCP tool | Provider | Fixed source |
|---|---|---|
| `rapidapi_sec_edgar_filings` | RapidAPI | `sec-edgar-corporate-filings` · `GET /v1/sec-edgar/filings` |
| `rapidapi_clinical_trials` | RapidAPI | `clinicaltrials-gov-studies-trials` · `GET /v1/clinical-trials/studies` |
| `rapidapi_openfda_records` | RapidAPI | `openfda-recalls-enforcement-approvals` · `GET /v1/openfda/records` |
| `rapidapi_singapore_green_mark` | RapidAPI | `singapore-bca-green-mark-buildings` · `GET /v1/sg-green-mark/certificates` |
| `apify_sec_edgar_filings` | Apify | Actor `8LFIbRbidiHPknMz5` |
| `apify_clinical_trials` | Apify | Actor `KchE3qKKrwU0rCe9f` |
| `apify_uk_gov_tenders` | Apify | Actor `txnvyTckeQx4hVBc6` |
| `apify_singapore_green_mark` | Apify | Actor `Z3ioK0wOAeczj6nCx` |

Every `inputSchema` is closed with `additionalProperties: false`. The schemas enforce provider-specific enums, lengths, calendar dates, numeric ranges, row limits, and the active Apify hard cost ceiling before any HTTP request starts.

## Run locally

No install or build step is required:

```powershell
$env:APIFY_TOKEN = '<your Apify token>'
$env:RAPIDAPI_KEY = '<your RapidAPI key>'
node .\bin\mcp-server-open-gov-data.js
```

After installing the package, use the `mcp-server-open-gov-data` executable. Configure only the credential needed by the tools you intend to call. Credentials are read from the process environment, are never tool arguments, and are never included in successful metadata or error messages.

Example MCP client entry when running this checkout (replace the path with an absolute local path):

```json
{
  "mcpServers": {
    "open-gov-data": {
      "command": "node",
      "args": ["C:/path/to/mcp-server-open-gov-data/bin/mcp-server-open-gov-data.js"],
      "env": {
        "APIFY_TOKEN": "${APIFY_TOKEN}",
        "RAPIDAPI_KEY": "${RAPIDAPI_KEY}"
      }
    }
  }
}
```

Environment interpolation depends on the MCP client. If unsupported, inject secrets using that client's credential mechanism rather than committing them to a shared configuration file.

## Cost and network safeguards

- `MCP_APIFY_MAX_TOTAL_CHARGE_USD` is the immutable process-level hard ceiling for one Apify run. It defaults to `0.25`, accepts at most six decimal places, and is capped at USD 100 during configuration validation.
- An omitted per-call `maxTotalChargeUsd` defaults to USD `0.25`, or to the environment ceiling when that ceiling is lower. A call can lower the cap but cannot raise it above the environment ceiling.
- Apify requests always use `POST /v2/acts/{fixed-id}/run-sync-get-dataset-items?maxTotalChargeUsd=...&clean=true`. User-supplied cost fields are removed from the Actor input body.
- RapidAPI has no server-side per-request dollar cap. Each tool performs exactly one request, never retries automatically, and constrains `limit` to `1..20`.
- Redirects are handled in `manual` mode and rejected. Responses are streamed through a 2 MiB decoded-body limit; oversized `Content-Length` values are rejected before parsing.
- `MCP_HTTP_TIMEOUT_MS` defaults to 30000 and may be set from 100 through 120000 milliseconds.
- Production destinations are hard-coded HTTPS origins. Loopback overrides exist only for the test suite, require `NODE_ENV=test`, and accept only explicit-port HTTP loopback origins.
- HTTP error bodies and invalid JSON bodies are never copied into MCP errors. stdout is reserved for protocol messages; startup failure text is generic and contains no configuration values.

## Protocol behavior

The server implements `initialize`, `notifications/initialized`, `ping`, `tools/list`, and `tools/call`. It emits one JSON-RPC 2.0 object per stdout line, processes calls sequentially, returns standard parse/request/method/parameter errors, and represents upstream tool failures as MCP tool results with `isError: true`.

## Offline verification

All verification is local. The HTTP integration tests start an ephemeral `127.0.0.1` server and drive the real executable as a child process over stdio. They do not contact Apify, RapidAPI, npm registry, or any other external service.

```powershell
node --test
npm pack --dry-run --json
node verify.mjs
```

`node verify.mjs` reruns the tests and pack preview, performs zero-dependency/allowlist/static import checks, and writes `evidence.json`. This repository workflow does not run `npm publish`.

## License

MIT
