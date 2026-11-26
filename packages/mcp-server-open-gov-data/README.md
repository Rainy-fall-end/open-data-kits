# mcp-server-open-gov-data

Version 0.2.0 is a zero-third-party-dependency MCP server for twelve fixed, live public-data integrations: eight public Apify Actors and four RapidAPI endpoints. It runs on Node.js 20+ and speaks newline-delimited JSON-RPC 2.0 over stdio.

The server never accepts an Actor ID, hostname, URL, or credential as a tool argument. Production destinations are pinned in source, redirects are rejected, responses are size-limited, and configured credentials are redacted even if an upstream response echoes one. No private Actors are included.

## Tools

| MCP tool | Fixed live source |
|---|---|
| `apify_ats_jobs_hiring_signals` | Apify Actor `CRulq5dak4mqAUmMn` |
| `apify_sec_edgar_intelligence` | Apify Actor `8LFIbRbidiHPknMz5`; modes `form_d_funding`, `xbrl_financials`, `filings` |
| `apify_global_public_tenders` | Apify Actor `ZlabhlvEIyRVdtKiQ` |
| `apify_pharma_pipeline_intelligence` | Apify Actor `re8aRvtqBonP5HMuY` |
| `apify_usaspending_contracts` | Apify Actor `eQQ2beomyLlW4DTGM` |
| `apify_clinical_trials` | Apify Actor `KchE3qKKrwU0rCe9f` |
| `apify_uk_gov_tenders` | Apify Actor `txnvyTckeQx4hVBc6` |
| `apify_sg_green_mark` | Apify Actor `Z3ioK0wOAeczj6nCx` |
| `rapidapi_sec_edgar` | `sec-edgar-corporate-filings` / `GET /v1/sec-edgar/filings` |
| `rapidapi_clinical_trials` | `clinicaltrials-gov-studies-trials` / `GET /v1/clinical-trials/studies` |
| `rapidapi_openfda` | `openfda-recalls-enforcement-approvals` / `GET /v1/openfda/records` |
| `rapidapi_sg_green_mark` | `singapore-bca-green-mark-buildings` / `GET /v1/sg-green-mark/certificates` |

Every tool uses a closed `inputSchema` (`additionalProperties: false`). The eight Actor schemas preserve the field names, types, enums, and numeric bounds in the repository's real `.actor/input_schema.json` contracts. The four RapidAPI schemas mirror their checked OpenAPI operations.

## Run locally

There is no install or build step:

```powershell
$env:APIFY_TOKEN = '<your Apify token>'
$env:RAPIDAPI_KEY = '<your RapidAPI key>'
node .\bin\mcp-server-open-gov-data.js
```

Only the credential for the tool being called is required. Keep credentials in each client's local secret configuration and never commit a populated configuration.

## Claude Desktop

Open Claude Desktop's developer settings and merge this entry into `claude_desktop_config.json`. Replace the path and the two placeholder values locally.

```json
{
  "mcpServers": {
    "open-gov-data": {
      "command": "node",
      "args": ["C:/absolute/path/mcp-server-open-gov-v2/bin/mcp-server-open-gov-data.js"],
      "env": {
        "APIFY_TOKEN": "<local-apify-token>",
        "RAPIDAPI_KEY": "<local-rapidapi-key>"
      }
    }
  }
}
```

## Cursor

Save the following as `.cursor/mcp.json` in your project, replacing the path and local secret placeholders:

```json
{
  "mcpServers": {
    "open-gov-data": {
      "command": "node",
      "args": ["C:/absolute/path/mcp-server-open-gov-v2/bin/mcp-server-open-gov-data.js"],
      "env": {
        "APIFY_TOKEN": "<local-apify-token>",
        "RAPIDAPI_KEY": "<local-rapidapi-key>"
      }
    }
  }
}
```

## Windsurf

Merge this into Windsurf's `mcp_config.json`, replacing the path and local secret placeholders:

```json
{
  "mcpServers": {
    "open-gov-data": {
      "command": "node",
      "args": ["C:/absolute/path/mcp-server-open-gov-v2/bin/mcp-server-open-gov-data.js"],
      "env": {
        "APIFY_TOKEN": "<local-apify-token>",
        "RAPIDAPI_KEY": "<local-rapidapi-key>"
      }
    }
  }
}
```

## Cost and network safeguards

- Every Apify call always includes `maxTotalChargeUsd` in the query string. The per-call default and default process ceiling are both USD `0.25`.
- `MCP_APIFY_MAX_TOTAL_CHARGE_USD` can lower or raise the process ceiling (up to USD 100), but a tool call can never exceed it. Amounts have at most six decimal places.
- User-supplied `maxTotalChargeUsd` is removed from the Actor input body, and omitted `maxItems` defaults to 10.
- RapidAPI tools perform exactly one request with `limit` constrained by the checked contract. RapidAPI does not offer an equivalent per-request dollar-cap parameter.
- Requests are not retried automatically. Redirects are blocked, decoded responses are capped at 2 MiB, and the timeout defaults to 30 seconds.
- HTTP loopback overrides are accepted only with `NODE_ENV=test`, only for `127.0.0.1`, `localhost`, or `::1`, and only with an explicit port. They exist solely for offline verification.
- stdout contains protocol messages only. Error bodies and malformed upstream payloads are never reflected in MCP errors.

## Protocol and verification

The server implements `initialize`, `notifications/initialized`, `ping`, `tools/list`, and `tools/call`. Calls are processed sequentially. Invalid arguments receive JSON-RPC `-32602`; upstream failures are returned as MCP tool results with `isError: true`.

Verification is local and makes no external request. It starts an ephemeral `127.0.0.1` HTTP server, spawns the real stdio executable, calls all twelve tools, checks missing credentials and validation failures, previews the npm package, and writes `evidence.json`.

```powershell
npm run verify
```

The workflow performs `npm pack --dry-run`; it does not publish the package.

## License

MIT
