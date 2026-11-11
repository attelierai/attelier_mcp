# attelier

Deterministic Node 22 client for the Attelier and inference APIs; Atte lives in Studio and the MCP. Install
the private package archive or run `node cli/bin/attelier.mjs --help` from this
repository. No model or accounting runs in the CLI.

Configure `ATTELIER_API_TOKEN`, `ATTELIER_API_URL` (App API, normally
`https://api.attelier.ai`) and `ATTELIER_INFERENCE_URL`
(`https://inference.attelier.ai`). The same key needs explicit scopes for each surface:
`api:read` for usage/projects, `inference:read` for discovery/results,
`inference:write` for uploads/quotes/cancel, and `inference:spend` to start.

For an older installed archive, set both base-URL variables explicitly to these
domains. The previous `api.attelier.ai` inference hostname now serves the app API;
the app's `https://app.attelier.ai/atelier` route remains compatible.

```sh
attelier models --json
attelier models attelier/h3 --json
attelier upload reference.png --mime image/png --json
attelier quote --model attelier/h3 --input parameters.json --json
# After reviewing the returned price and authorizing the generation:
attelier run --quote QUOTE_ID --idempotency-key MY_STABLE_KEY --wait --timeout 600 --json
attelier jobs REQUEST_ID --json
attelier jobs --limit 20 --cursor LAST_REQUEST_ID --json
attelier cancel REQUEST_ID --json
attelier download REQUEST_ID --output result.mp4 --json
attelier usage --json
attelier projects --json
```

`--input` is a JSON file containing the model's effective parameters from its
catalog entry. Each request creates one output; for a batch quote and start each
item separately with its own stable identity. The returned credit quote is the user price; do not infer it from provider costs.

Exit 0 means the command succeeded; `run --wait` returns 1 for a failed or cancelled
request. Errors are JSON on stderr with a message and, when available, HTTP status,
code, request ID and `retryAfter`. Exit 2 means only that local waiting timed out. Poll the printed request ID;
never make another quote to recover a lost response. An ambiguous submission is
not retried automatically. A caller can replay the *same* quote/key. Downloads
are exclusive, authenticated, same-origin and checksum-checked. Existing files
are never overwritten. Credentials are read from the environment, never flags.
