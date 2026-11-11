import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { ATTE_PUBLIC_TOOLS } from "@atte/kit/public-tools";
import { ATTE_MCP_PROTOCOL_VERSION } from "@atte/kit/mcp-contract";
import { AttelierMcpBridgeError, AttelierMcpServer, attelierMcpOptionsFromEnv } from "./server.js";
import { LOCAL_TOOLS } from "./local-tools.ts";

const binary = fileURLToPath(new URL("../bin/attelier-mcp.js", import.meta.url));

type Recorded = { authorization?: string | undefined; client?: string | undefined; body: unknown };

const pngFixture = (width: number): Buffer => {
  const crc32 = (bytes: Buffer): number => {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const name = Buffer.from(type, "ascii");
    const output = Buffer.alloc(12 + data.length);
    output.writeUInt32BE(data.length, 0); name.copy(output, 4); data.copy(output, 8);
    output.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
    return output;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.alloc(1 + width * 4))), chunk("IEND", Buffer.alloc(0))]);
};

/** A stand-in for the Attelier API's real `/mcp` HTTP route. */
const startUpstream = async (
  respond: (body: Record<string, unknown>) => Record<string, unknown>,
): Promise<{ url: string; recorded: Recorded[]; close: () => Promise<void> }> => {
  const recorded: Recorded[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      recorded.push({ authorization: request.headers.authorization, client: request.headers["x-atelier-client"] as string | undefined, body });
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(respond(body)));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    recorded,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
};

const sendLines = async (
  upstreamUrl: string,
  lines: string[],
): Promise<Array<Record<string, unknown>>> => {
  const child = spawn(process.execPath, [binary], {
    env: {
      ...process.env,
      ATTELIER_API_URL: upstreamUrl,
      ATTELIER_API_TOKEN: "test-token",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let out = "";
  let err = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => { out += chunk; });
  child.stderr.on("data", (chunk: string) => { err += chunk; });
  child.stdin.write(lines.map((line) => `${line}\n`).join(""));
  child.stdin.end();
  const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
  assert.equal(code, 0, `attelier-mcp exited with ${code}: ${err}`);
  return out.split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
};

test("the spawned server intersects Atte's public tools with the token-scoped API list", async () => {
  const readable = ATTE_PUBLIC_TOOLS.filter(({ scope }) => scope === "read");
  const upstream = await startUpstream((body) => ({
    jsonrpc: "2.0",
    id: 1,
    result: body.method === "tools/list"
      ? { tools: [...readable.map(({ name }) => ({ name })), { name: "internal_read_tool" }] }
      : { content: [] },
  }));
  try {
    const responses = await sendLines(upstream.url, [
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { clientInfo: { name: "Codex" } } }),
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    ]);
    assert.equal(responses.length, 2, "a notification must not produce a response");

    const initialize = responses[0]?.result as Record<string, unknown>;
    assert.equal(responses[0]?.id, 1);
    assert.equal(initialize.protocolVersion, ATTE_MCP_PROTOCOL_VERSION);
    assert.equal((initialize.serverInfo as Record<string, unknown>).name, "attelier-mcp");

    const listed = (responses[1]?.result as { tools: Array<{ name: string; inputSchema: unknown }> }).tools;
    // Remote tools are the token-scoped public subset; local toolkit tools follow.
    assert.deepEqual(
      listed.map(({ name }) => name),
      [...readable.map(({ name }) => name), ...LOCAL_TOOLS.map(({ name }) => name)],
    );
    // The full internal API catalog is far larger; none of it may leak here.
    assert.equal(listed.some(({ name }) => name === "commit_transaction"), false);
    assert.equal(listed.some(({ name }) => name === "get_brand_kit"), false);
    assert.equal(listed.some(({ name }) => name === "internal_read_tool"), false);
    assert.ok(listed.every(({ inputSchema }) => inputSchema && typeof inputSchema === "object"));

    assert.equal(upstream.recorded.length, 2, "initialization verifies the remote connection before listing tools");
    assert.equal(upstream.recorded[0]?.authorization, "Bearer test-token");
    assert.equal(upstream.recorded[0]?.client, "Codex");
  } finally {
    await upstream.close();
  }
});

test("an allowlisted call is forwarded verbatim with the bearer token", async () => {
  const upstream = await startUpstream(() => ({
    jsonrpc: "2.0",
    id: 1,
    result: { content: [{ type: "text", text: "{}" }], structuredContent: { id: "project-1" } },
  }));
  try {
    const responses = await sendLines(upstream.url, [
      JSON.stringify({
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: { name: "inspect_project", arguments: { projectId: "project-1" } },
      }),
      JSON.stringify({
        jsonrpc: "2.0",
        id: 8,
        method: "tools/call",
        params: { name: "get_brand_kit", arguments: {} },
      }),
    ]);
    assert.equal(responses[0]?.id, 7);
    assert.deepEqual(responses[0]?.result, {
      content: [{ type: "text", text: "{}" }],
      structuredContent: { id: "project-1" },
    });
    assert.equal(upstream.recorded.length, 1, "the blocked call must never reach the API");
    assert.equal(upstream.recorded[0]?.authorization, "Bearer test-token");
    assert.deepEqual(upstream.recorded[0]?.body, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "inspect_project", arguments: { projectId: "project-1" } },
    });

    const blocked = responses[1]?.error as { code: number; message: string };
    assert.equal(blocked.code, -32601);
    assert.match(blocked.message, /not part of Attelier's public tool surface/);
  } finally {
    await upstream.close();
  }
});

test("the stdio bridge preserves an MCP image block and its requested PNG width", async () => {
  const png = pngFixture(1280);
  const upstream = await startUpstream(() => ({
    jsonrpc: "2.0",
    id: 1,
    result: {
      content: [
        { type: "text", text: JSON.stringify({ width: 1280 }) },
        { type: "image", data: png.toString("base64"), mimeType: "image/png" },
      ],
      structuredContent: { width: 1280 },
    },
  }));
  try {
    const [response] = await sendLines(upstream.url, [JSON.stringify({
      jsonrpc: "2.0", id: 9, method: "tools/call",
      params: { name: "render_frame", arguments: { projectId: "project-1", atSeconds: 1, width: 1280 } },
    })]);
    const content = (response?.result as { content: Array<Record<string, unknown>> }).content;
    assert.equal(content[0]?.type, "text");
    assert.equal(content[1]?.type, "image");
    const decoded = Buffer.from(String(content[1]?.data), "base64");
    assert.equal(decoded.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(decoded.readUInt32BE(16), 1280);
  } finally {
    await upstream.close();
  }
});

test("the bridge refuses to start without a token and rejects a malformed API URL", () => {
  assert.throws(() => attelierMcpOptionsFromEnv({ ATTELIER_API_TOKEN: "" }), /ATTELIER_API_TOKEN is required/);
  for (const url of ["ftp://x", "http://api.example.com", "https://user:pass@api.example.com", "https://api.example.com/?tenant=other", "https://api.example.com/#other"]) {
    assert.throws(() => attelierMcpOptionsFromEnv({ ATTELIER_API_TOKEN: "t", ATTELIER_API_URL: url }), /HTTPS or loopback HTTP/);
  }
  assert.equal(attelierMcpOptionsFromEnv({ ATTELIER_API_TOKEN: "t", ATTELIER_API_URL: "http://127.0.0.1:8787/" }).apiUrl, "http://127.0.0.1:8787");
  assert.equal(attelierMcpOptionsFromEnv({ ATTELIER_API_TOKEN: "t" }).apiUrl, "https://api.attelier.ai");
  const options = attelierMcpOptionsFromEnv({ ATTELIER_API_TOKEN: "t", ATTELIER_API_URL: "https://api.example.com/" });
  assert.equal(options.apiUrl, "https://api.example.com");
});

test("the MCP bridge keeps API failure details and refuses authenticated redirects over HTTP", async () => {
  let targetHits = 0;
  const upstream = createServer((request, response) => {
    if (request.url === "/target") targetHits += 1;
    if (request.url === "/mcp") {
      response.statusCode = 429;
      response.setHeader("content-type", "application/json");
      response.setHeader("retry-after", "45");
      response.end(JSON.stringify({ error: "slow down" }));
      return;
    }
    response.statusCode = 302;
    response.setHeader("location", "/target");
    response.end();
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const { port } = upstream.address() as AddressInfo;
  const server = new AttelierMcpServer({ apiUrl: `http://127.0.0.1:${port}`, apiToken: "test-token" });
  try {
    await assert.rejects(
      server.handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "inspect_project", arguments: { projectId: "p" } } }),
      (error) => {
        assert.ok(error instanceof AttelierMcpBridgeError);
        assert.equal(error.message, "slow down");
        assert.deepEqual(error.data, { status: 429, retryAfter: "45" });
        return true;
      },
    );
    // Use a real redirect response. The forwarder must surface it rather than replaying the bearer request at /target.
    await assert.rejects(
      new AttelierMcpServer({ apiUrl: `http://127.0.0.1:${port}/redirect`, apiToken: "test-token" }).handle({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "inspect_project", arguments: { projectId: "p" } } }),
      /fetch failed/i,
    );
    assert.equal(targetHits, 0);
  } finally {
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});

test("an upstream MCP error is relayed with its own code, not swallowed", async () => {
  const detail = {
    code: "INVALID_VALUE",
    message: "level must be cut, frames or gates.",
    field: "level",
    validValues: ["cut", "frames", "gates"],
  };
  const server = new AttelierMcpServer({
    apiUrl: "https://api.example.com",
    apiToken: "t",
    fetch: async () => new Response(
      JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: detail.message, data: detail } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  });
  await assert.rejects(
    server.handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "inspect_project", arguments: {} } }),
    (error) => {
      assert.ok(error instanceof AttelierMcpBridgeError);
      assert.equal(error.code, -32602);
      assert.equal(error.message, detail.message);
      assert.deepEqual(error.data, detail);
      return true;
    },
  );
});

test("the stdio bridge forwards structured API validation errors unchanged", async () => {
  const detail = {
    code: "REQUIRED_FIELD",
    message: "arguments.calls[0].arguments.easing is required.",
    field: "arguments.calls[0].arguments.easing",
    example: { easing: "linear" },
  };
  const upstream = await startUpstream(() => ({
    jsonrpc: "2.0",
    id: 1,
    error: { code: -32602, message: detail.message, data: detail },
  }));
  try {
    const [response] = await sendLines(upstream.url, [JSON.stringify({
      jsonrpc: "2.0", id: 10, method: "tools/call",
      params: { name: "compile_edit", arguments: { projectId: "project-1", expectedRevision: 1, calls: [] } },
    })]);
    assert.deepEqual(response?.error, { code: -32602, message: detail.message, data: detail });
  } finally {
    await upstream.close();
  }
});

test("updated connectors require the inspected brief version and forward it unchanged", async () => {
  const calls: Record<string, unknown>[] = [];
  const upstream = await startUpstream((body) => { calls.push(body); return { jsonrpc: "2.0", id: body.id, result: { saved: true } }; });
  try {
    const args = { projectId: "p", expectedRevision: 4, brief: { title: "Direction", script: [], characters: [] } };
    const [missing, pinned] = await sendLines(upstream.url, [
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "set_brief", arguments: args } }),
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "set_brief", arguments: { ...args, expectedPlanVersion: 7 } } }),
    ]);
    assert.match(JSON.stringify(missing?.error), /expectedPlanVersion/);
    assert.equal(pinned?.error, undefined);
    assert.equal(calls.length, 1);
    assert.equal((calls[0]?.params as { arguments: { expectedPlanVersion: number } }).arguments.expectedPlanVersion, 7);
  } finally { await upstream.close(); }
});


test("inference downloads preserve the configured App API subpath and write exclusively", async()=>{
 const dir=mkdtempSync(path.join(process.cwd(),'.mcp-download-'));
 const requests:string[]=[];
 const fetchImpl:typeof fetch=async(input,init)=>{
  const url=String(input);requests.push(url);assert.equal(new Headers(init?.headers).get('authorization'),'Bearer fixture-only');
  if(url.endsWith('/mcp'))return Response.json({jsonrpc:'2.0',id:1,result:{structuredContent:{outputUrl:'/v1/inference/requests/fixture/content'},content:[]}});
  assert.equal(url,'https://api.example.test/atelier/v1/inference/requests/fixture/content');return new Response('synthetic image');
 };
 try{
  const server=new AttelierMcpServer({apiUrl:'https://api.example.test/atelier',apiToken:'fixture-only',fetch:fetchImpl});
  const request={jsonrpc:'2.0' as const,id:1,method:'tools/call',params:{name:'download_inference',arguments:{requestId:'fixture',downloadTo:path.join(dir,'result.png')}}};
  await server.handle(request);assert.equal(readFileSync(path.join(dir,'result.png'),'utf8'),'synthetic image');
  await assert.rejects(server.handle(request),/EEXIST/);assert.ok(requests.includes('https://api.example.test/atelier/mcp'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test("composition downloads keep source receipt and images, strip local paths and preserve API subpaths", async () => {
  const dir = mkdtempSync(path.join(process.cwd(), ".mcp-composition-"));
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/mcp")) {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.params.arguments.downloadTo, undefined);
      return Response.json({ jsonrpc: "2.0", id: 1, result: { structuredContent: { version: 2, outputUrl: "/v1/projects/fixture/motion-renders/key/content" },
        content: [{ type: "image", mimeType: "image/png", data: "fixture" }] } });
    }
    assert.equal(url, "https://api.example.test/atelier/v1/projects/fixture/motion-renders/key/content");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fixture-only");
    return new Response("synthetic composition");
  };
  try {
    const server = new AttelierMcpServer({ apiUrl: "https://api.example.test/atelier", apiToken: "fixture-only", fetch: fetchImpl });
    const request = { jsonrpc: "2.0" as const, id: 1, method: "tools/call", params: { name: "motion_render_source", arguments: {
      projectId: "fixture", sourceId: "custom", version: 2, downloadTo: path.join(dir, "still.png"),
    } } };
    const result = await server.handle(request) as { structuredContent: { version: number }; content: Array<{ type: string }> };
    assert.equal(result.structuredContent.version, 2);
    assert.ok(result.content.some(item => item.type === "image"));
    assert.equal(readFileSync(path.join(dir, "still.png"), "utf8"), "synthetic composition");
    await assert.rejects(server.handle(request), /EEXIST/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("local toolkit tools run in the bridge without calling the API", async () => {
  const upstream = await startUpstream(() => ({ jsonrpc: "2.0", id: 1, result: {} }));
  try {
    const responses = await sendLines(upstream.url, [
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "motion_formats", arguments: {} } }),
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "sfx_library", arguments: {} } }),
      JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "probe_media", arguments: { path: "/does/not/exist.mp4" } } }),
      JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "motion_formats", arguments: { summaryOnly: true } } }),
      JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "motion_formats", arguments: { format: "shootout" } } }),
      JSON.stringify({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "motion_formats", arguments: { format: "invented-format" } } }),
      JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "motion_formats", arguments: { summaryOnly: "false" } } }),
    ]);
    // structuredContent must be an object, so lists arrive as { items }.
    const formats = (responses[0]?.result as { structuredContent: { items: Array<{ id: string; example: unknown }> } }).structuredContent.items;
    assert.ok(formats.length > 0, "the format catalog remains discoverable");
    assert.equal(new Set(formats.map(({ id }) => id)).size, formats.length, "format IDs remain unique");
    const shootout = formats.find(({ id }) => id === "shootout");
    assert.ok(shootout?.example, "the advertised shootout format remains runnable");
    const sfx = (responses[1]?.result as { structuredContent: { sounds: Array<{ id: string; path: string }> } }).structuredContent;
    assert.ok(sfx.sounds.some(({ id, path }) => id === "logo-sting" && path.endsWith("logo-sting.mp3")));
    const probe = responses[2]?.result as { isError?: boolean };
    assert.equal(probe.isError, true, "a local failure is a tool error, not a transport error");
    const summaries = (responses[3]?.result as { structuredContent: { items: Array<Record<string, unknown>> } }).structuredContent.items;
    assert.deepEqual(summaries.map(({ id }) => id), formats.map(({ id }) => id));
    assert.ok(summaries.every((entry) => Object.keys(entry).sort().join(",") === "id,summary"));
    const selected = (responses[4]?.result as { structuredContent: { items: typeof formats } }).structuredContent.items;
    assert.deepEqual(selected, formats.filter(({ id }) => id === "shootout"), "the selected guide remains complete and matches the backward-compatible full list");
    assert.equal((responses[5]?.result as { isError?: boolean }).isError, true);
    assert.equal((responses[6]?.result as { isError?: boolean }).isError, true);
    assert.equal(upstream.recorded.length, 0);
  } finally {
    await upstream.close();
  }
});

test("style_guide puts the person's own taste before the house's, and record_preference keeps a new lesson", async () => {
  const calls: Array<{ method: string; url: string; body?: unknown; authorization?: string | null }> = [];
  const server = new AttelierMcpServer({
    apiUrl: "https://api.example.com",
    apiToken: "t",
    fetch: async (input, init) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      calls.push({ method: init?.method ?? "GET", url, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}), authorization: headers.get("authorization") });
      if (url.includes("/v1/taste") && (init?.method ?? "GET") === "GET") {
        return new Response(JSON.stringify({ lessons: [{ id: "taste-1", category: "copy", statement: "Never use exclamation marks.", format: "shootout" }] }), { status: 200 });
      }
      if (url.endsWith("/v1/taste")) return new Response(JSON.stringify({ id: "taste-2", ...(JSON.parse(String(init?.body)) as object) }), { status: 201 });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return new Response("{}", { status: 404 });
    },
  });
  const guide = await server.handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "style_guide", arguments: { format: "shootout" } } }) as { content: Array<{ text: string }>; structuredContent: { person: unknown[]; house: Array<{ id: string }> } };
  const text = guide.content[0]!.text;
  assert.ok(text.indexOf("Never use exclamation marks.") < text.indexOf("Let each shot breathe"), "the person's lesson leads");
  assert.equal(guide.structuredContent.person.length, 1);
  assert.ok(guide.structuredContent.house.some(({ id }) => id === "let-it-breathe"));
  assert.ok(!guide.structuredContent.house.some(({ id }) => id === "screen-recordings"), "other formats' lessons stay out");
  assert.equal(calls[0]!.url, "https://api.example.com/v1/taste?format=shootout");
  assert.equal(calls[0]!.authorization, "Bearer t");

  const recorded = await server.handle({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "record_preference", arguments: { statement: "Keep titles in sentence case.", category: "typography", evidence: "no me gustan las mayúsculas" } } }) as { structuredContent: { id: string } };
  assert.equal(recorded.structuredContent.id, "taste-2");
  assert.deepEqual(calls.at(-1), { method: "POST", url: "https://api.example.com/v1/taste", body: { statement: "Keep titles in sentence case.", category: "typography", evidence: "no me gustan las mayúsculas" }, authorization: "Bearer t" });
  // The guide shows the person's lesson ids, so a sharper lesson replaces the old one instead of duplicating it.
  assert.match(text, /Never use exclamation marks\. _\(for shootout, id taste-1\)_/);
  await server.handle({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "record_preference", arguments: { statement: "Never use exclamation marks or question marks in titles.", category: "copy", evidence: "tampoco interrogaciones", replaces: "taste-1" } } });
  assert.deepEqual(calls.slice(-2).map(({ method, url, body }) => ({ method, url, replaces: (body as { replaces?: unknown } | undefined)?.replaces })), [
    { method: "POST", url: "https://api.example.com/v1/taste", replaces: undefined },
    { method: "DELETE", url: "https://api.example.com/v1/taste/taste-1", replaces: undefined },
  ]);
});

test("upload_inference reads a local file inline and names its type from the extension", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = mkdtempSync(join(tmpdir(), "mcp-upload-"));
  const file = join(directory, "still.png");
  writeFileSync(file, Buffer.from("89504e470d0a1a0a", "hex"));
  const forwarded: Array<Record<string, unknown>> = [];
  const server = new AttelierMcpServer({ apiUrl: "https://attelier.test", apiToken: "token", fetch: async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    forwarded.push(body.params?.arguments ?? {});
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: "{}" }], structuredContent: {} } }), { status: 200, headers: { "content-type": "application/json" } });
  } });
  await server.handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "upload_inference", arguments: { path: file } } });
  assert.equal(forwarded[0]?.mimeType, "image/png");
  assert.equal(typeof forwarded[0]?.dataBase64, "string");
  assert.equal(forwarded[0]?.path, undefined);
});

test("Vidaio whole-video inference composes the internal upload path and retains the downloaded result for Library import", async () => {
  const { writeFileSync } = await import("node:fs");
  const directory = mkdtempSync(path.join(process.cwd(), "mcp-vidaio-"));
  const source = path.join(directory, "source.mp4");
  const output = path.join(directory, "upscaled.mp4");
  writeFileSync(source, Buffer.from("source-video"));
  const calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  const server = new AttelierMcpServer({ apiUrl: "https://attelier.test", apiToken: "token", fetch: async (url, init) => {
    if (init?.body === undefined) {
      assert.equal(String(url), "https://attelier.test/v1/inference/requests/vidaio-request/content");
      return new Response(Buffer.from("upscaled-video"), { headers: { "content-length": "14" } });
    }
    const request = JSON.parse(String(init?.body));
    const name = request.params.name as string;
    const arguments_ = request.params.arguments as Record<string, unknown>;
    calls.push({ name, arguments: arguments_ });
    const content = name === "upload_inference"
      ? { id: "inference-upload-1", mimeType: "video/mp4", bytes: 12, sha256: "sha256:source" }
      : name === "quote_inference"
        ? { quoteId: "vidaio-quote", affordable: true }
        : name === "start_inference"
          ? { requestId: "vidaio-request" }
          : name === "get_inference"
            ? { requestId: "vidaio-request", status: "complete" }
            : name === "download_inference"
              ? { outputUrl: "/v1/inference/requests/vidaio-request/content" }
              : name === "create_upload"
                ? { id: "library-upload-1", status: "complete" }
                : name === "import_media"
                  ? { assetIds: ["library:upscaled"] }
                  : {};
    return Response.json({ jsonrpc: "2.0", id: request.id, result: { content: [{ type: "text", text: JSON.stringify(content) }], structuredContent: content } });
  } });
  const call = async (id: number, name: string, arguments_: Record<string, unknown>) =>
    server.handle({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: arguments_ } }) as Promise<{ structuredContent: Record<string, unknown> }>;
  try {
    const uploaded = await call(1, "upload_inference", { path: source });
    const uploadId = String(uploaded.structuredContent.id);
    assert.equal(uploadId, "inference-upload-1");
    await call(2, "quote_inference", { model: "vidaio/upscale/standard", parameters: { videoUploadUrl: `/v1/uploads/${uploadId}/content`, upscaleFactor: 2 } });
    await call(3, "start_inference", { quoteId: "vidaio-quote", idempotencyKey: "vidaio-upscale-1" });
    await call(4, "get_inference", { requestId: "vidaio-request" });
    await call(5, "download_inference", { requestId: "vidaio-request", downloadTo: output });
    await call(6, "import_media", { projectId: "project-1", paths: [output], attach: true });

    assert.deepEqual(calls.find(({ name }) => name === "quote_inference")?.arguments, {
      model: "vidaio/upscale/standard",
      parameters: { videoUploadUrl: "/v1/uploads/inference-upload-1/content", upscaleFactor: 2 },
    });
    assert.deepEqual(calls.find(({ name }) => name === "start_inference")?.arguments, { quoteId: "vidaio-quote", idempotencyKey: "vidaio-upscale-1" });
    assert.deepEqual(calls.find(({ name }) => name === "import_media")?.arguments, { projectId: "project-1", uploadIds: ["library-upload-1"], attach: true });
    assert.deepEqual(readFileSync(output), Buffer.from("upscaled-video"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("motion_source sends a working-folder TSX file as the composition code and refuses files outside it", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const root = mkdtempSync(path.join(tmpdir(), "mcp-source-"));
  const outside = mkdtempSync(path.join(tmpdir(), "mcp-outside-"));
  writeFileSync(path.join(root, "Cut.tsx"), "export default () => null;\n");
  writeFileSync(path.join(outside, "Other.tsx"), "export default () => null;\n");
  const forwarded: Array<Record<string, unknown>> = [];
  const server = new AttelierMcpServer({ apiUrl: "https://attelier.test", apiToken: "token", fetch: async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    forwarded.push(body.params?.arguments ?? {});
    return Response.json({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: "{}" }], structuredContent: { version: 1 } } });
  } });
  const previous = process.env.ATTELIER_MCP_ROOT;
  process.env.ATTELIER_MCP_ROOT = root;
  try {
    const call = (args: Record<string, unknown>) => server.handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "motion_source", arguments: { action: "save", projectId: "p", sourceId: "cut", expectedVersion: 1, expectedRevision: 3, ...args } } });
    await call({ path: "Cut.tsx", composition: { fps: 30 } });
    assert.deepEqual(forwarded[0]?.composition, { fps: 30, code: "export default () => null;\n" });
    assert.equal(forwarded[0]?.path, undefined);
    await assert.rejects(call({ path: path.join(outside, "Other.tsx") }), /working folder/);
    await assert.rejects(call({ path: "Cut.tsx", patch: "@@" }), /one way/);
    assert.equal(forwarded.length, 1);
  } finally {
    if (previous === undefined) delete process.env.ATTELIER_MCP_ROOT; else process.env.ATTELIER_MCP_ROOT = previous;
    rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true });
  }
});
