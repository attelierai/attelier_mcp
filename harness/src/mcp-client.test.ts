import assert from "node:assert/strict";
import test from "node:test";
import { AttelierMcpClient } from "./mcp-client.js";

test("MCP client authenticates and unwraps structured tool results", async () => {
  let authorization = "";
  let traceId = "";
  const fakeFetch: typeof fetch = async (_input, init) => {
    const headers = new Headers(init?.headers);
    authorization = headers.get("authorization") ?? "";
    traceId = headers.get("x-atelier-trace-id") ?? "";
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { structuredContent: { ok: true } } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const client = new AttelierMcpClient("http://atelier.test/", "token-value", fakeFetch, "0123456789abcdef0123456789abcdef");
  assert.deepEqual(await client.callTool("discover_atelier", {}), { ok: true });
  assert.equal(client.endpoint, "http://atelier.test/mcp");
  assert.equal(authorization, "Bearer token-value");
  assert.equal(traceId, "0123456789abcdef0123456789abcdef");
  assert.throws(() => new AttelierMcpClient("http://atelier.test", "token-value", fakeFetch, "not-a-trace"), /W3C trace ID/);
});
