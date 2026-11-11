/**
 * `attelier-mcp` — Attelier's public stdio MCP server.
 *
 * It is a deliberately thin bridge: JSON-RPC over stdin/stdout in, one HTTP
 * POST to the Attelier API's existing `/mcp` route out. The API keeps owning
 * authentication, budgets, idempotency and durable state, and its internal
 * HTTP MCP transport is untouched. The only thing this process adds is the
 * public boundary — `tools/list` intersects the token-scoped API catalog with
 * `ATTE_PUBLIC_TOOLS`, and `tools/call` refuses any name outside that allowlist
 * before a request ever leaves the machine.
 */
import type { Readable, Writable } from "node:stream";
import {
  ATTELIER_MCP_SERVER_NAME,
  ATTE_MCP_PROTOCOL_VERSION,
  ATTE_MCP_SERVER_VERSION,
} from "@atte/kit/mcp-contract";
import { ATTE_PUBLIC_TOOLS, attePublicTool } from "@atte/kit/public-tools";
import { ATTE_EDITING_GUIDANCE } from "@atte/kit/editing-guidance";
import { toMcpTools } from "@atte/kit/tool-adapters";
import { uploadLocalMedia, readLocalBrief, readLocalSource } from "./local-upload.ts";
import { downloadRender } from "./local-download.ts";
import { LOCAL_TOOLS, localTool, runLocalTool, type LocalApi } from "./local-tools.ts";
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

export type AttelierMcpFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type AttelierMcpServerOptions = {
  /** Attelier API base URL. */
  apiUrl: string;
  /** API bearer token with at least `mcp:read`. */
  apiToken: string;
  fetch?: AttelierMcpFetch;
  /** Fail a forwarded call rather than hanging a client's turn. */
  requestTimeoutMs?: number;
};

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc?: unknown;
  id?: JsonRpcId;
  method?: unknown;
  params?: unknown;
};

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const UPSTREAM_ERROR = -32010;

export class AttelierMcpBridgeError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "AttelierMcpBridgeError";
    this.code = code;
    if (data !== undefined) this.data = data;
  }
}

const asObject = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;

const validateApiUrl = (value: string): string => {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("ATTELIER_API_URL must be an absolute HTTPS URL (HTTP is allowed only on loopback)."); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) {
    throw new Error("ATTELIER_API_URL requires HTTPS or loopback HTTP, without credentials, query or fragment.");
  }
  return value.replace(/\/+$/, "");
};

/** Config read once at startup so a mid-session environment change cannot
 * silently repoint the bridge at another workspace. */
export const attelierMcpOptionsFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
): AttelierMcpServerOptions => {
  const apiUrl = validateApiUrl(env.ATTELIER_API_URL?.trim() || "https://api.attelier.ai");
  const apiToken = env.ATTELIER_API_TOKEN?.trim() ?? "";
  if (!apiToken) {
    throw new Error("ATTELIER_API_TOKEN is required: attelier-mcp never calls the Attelier API unauthenticated.");
  }
  return { apiUrl: apiUrl.replace(/\/+$/, ""), apiToken };
};

export class AttelierMcpServer {
  private readonly fetchImpl: AttelierMcpFetch;
  private declaredClient: string | undefined;
  private readonly options: AttelierMcpServerOptions;

  constructor(options: AttelierMcpServerOptions) {
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) throw new Error("No fetch implementation is available for attelier-mcp.");
    this.fetchImpl = fetchImpl;
    this.options = { ...options, apiUrl: validateApiUrl(options.apiUrl) };
    if (!options.apiToken.trim()) throw new Error("ATTELIER_API_TOKEN is required.");
  }

  /** The signed-in REST API for local tools that keep the person's data (taste). */
  private localApi(): LocalApi {
    const call = async (method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<unknown> => {
      const response = await this.fetchImpl(`${this.options.apiUrl.replace(/\/+$/, "")}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.options.apiToken}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "error",
        signal: AbortSignal.timeout(this.options.requestTimeoutMs ?? 30_000),
      });
      const text = await response.text();
      let value: unknown = {};
      try { value = text ? JSON.parse(text) as unknown : {}; }
      catch { throw new AttelierMcpBridgeError(UPSTREAM_ERROR, `Attelier API returned an unreadable HTTP ${response.status} response.`); }
      if (!response.ok) {
        const envelope = asObject(value), failure = asObject(envelope?.error);
        const message = typeof failure?.message === "string" ? failure.message : typeof envelope?.message === "string" ? envelope.message : typeof envelope?.error === "string" ? envelope.error : `HTTP ${response.status}`;
        throw new AttelierMcpBridgeError(UPSTREAM_ERROR, message, { status: response.status, ...failure, retryAfter: response.headers.get("retry-after") ?? undefined });
      }
      return value;
    };
    return { get: (path) => call("GET", path), post: (path, body) => call("POST", path, body), delete: (path) => call("DELETE", path) };
  }

  /** Forward one request to the authenticated API MCP transport. */
  private async forwardRequest(method: "initialize" | "tools/list" | "tools/call", params?: Record<string, unknown>): Promise<unknown> {
    const timeoutMs = this.options.requestTimeoutMs ?? 600_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.options.apiUrl.replace(/\/+$/, "")}/mcp`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiToken}`,
          "Content-Type": "application/json",
          ...(this.declaredClient ? { "x-atelier-client": this.declaredClient } : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method,
          ...(params ? { params } : {}),
        }),
        signal: controller.signal,
        redirect: "error",
      });
    } catch (error) {
      throw new AttelierMcpBridgeError(
        UPSTREAM_ERROR,
        error instanceof Error ? `Attelier API request failed: ${error.message}` : "Attelier API request failed.",
      );
    } finally {
      clearTimeout(timer);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new AttelierMcpBridgeError(UPSTREAM_ERROR, `Attelier API returned an unreadable HTTP ${response.status} response.`);
    }
    const envelope = asObject(body);
    if (!response.ok) {
      const errorField = envelope?.error;
      const errorObject = asObject(errorField);
      const message = typeof errorObject?.message === "string" ? errorObject.message
        : typeof envelope?.message === "string" ? envelope.message
          : typeof errorField === "string" ? errorField : `Attelier API returned HTTP ${response.status}.`;
      throw new AttelierMcpBridgeError(UPSTREAM_ERROR, message, { status: response.status, ...errorObject, retryAfter: response.headers.get("retry-after") ?? undefined });
    }
    const failure = asObject(envelope?.error);
    if (failure) {
      const code = typeof failure.code === "number" ? failure.code : UPSTREAM_ERROR;
      throw new AttelierMcpBridgeError(
        code,
        typeof failure.message === "string" ? failure.message : "Attelier API rejected the tool call.",
        failure.data,
      );
    }
    if (envelope?.result === undefined) {
      throw new AttelierMcpBridgeError(UPSTREAM_ERROR, "Attelier API returned no MCP result.");
    }
    return envelope.result;
  }

  /** Forward one allowlisted `tools/call` without rewriting its arguments. */
  private forward(name: string, args: unknown): Promise<unknown> {
    return this.forwardRequest("tools/call", { name, arguments: args ?? {} });
  }

  async handle(request: JsonRpcRequest): Promise<unknown> {
    if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
      throw new AttelierMcpBridgeError(INVALID_REQUEST, "Invalid JSON-RPC request.");
    }
    if (request.method === "initialize") {
      const client = asObject(asObject(request.params)?.clientInfo)?.name;
      this.declaredClient = typeof client === "string" && client.length <= 100 && !/[\x00-\x1f\x7f]/.test(client) ? client : undefined;
      await this.forwardRequest("initialize", asObject(request.params));
      return {
        instructions: `${ATTE_EDITING_GUIDANCE}\nFor durable taste corrections call record_preference with the person's evidence. For generation without a project use list_models, quote_inference, start_inference with an explicit idempotencyKey, then get_inference and download_inference. Conversations stay in your application.`,
        protocolVersion: ATTE_MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: ATTELIER_MCP_SERVER_NAME, version: ATTE_MCP_SERVER_VERSION },
      };
    }
    if (request.method === "notifications/initialized") return {};
    if (request.method === "ping") return {};
    // The API filters by the token's scopes; intersect that authenticated list
    // with the local public allowlist so neither internal nor unauthorized
    // tools become visible through the bridge.
    if (request.method === "tools/list") {
      const upstream = asObject(await this.forwardRequest("tools/list"));
      const listed = Array.isArray(upstream?.tools) ? upstream.tools : [];
      const visibleNames = new Set(listed.flatMap((tool) => {
        const name = asObject(tool)?.name;
        return typeof name === "string" ? [name] : [];
      }));
      const remote = toMcpTools().filter(({ name }) => visibleNames.has(name)).map((tool) => tool.name === "set_brief"
        ? { ...tool, inputSchema: { ...tool.inputSchema, required: ["projectId", "expectedRevision", "expectedPlanVersion"] } }
        : tool);
      return { tools: [...remote, ...LOCAL_TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))] };
    }
    if (request.method !== "tools/call") {
      throw new AttelierMcpBridgeError(METHOD_NOT_FOUND, `Unknown MCP method ${request.method}.`);
    }
    const params = asObject(request.params);
    const name = typeof params?.name === "string" ? params.name : "";
    if (!name) throw new AttelierMcpBridgeError(INVALID_PARAMS, "A tool name is required.");
    const local = localTool(name);
    if (local) {
      const localArgs = params?.arguments === undefined ? {} : asObject(params.arguments);
      if (!localArgs) throw new AttelierMcpBridgeError(INVALID_PARAMS, "Tool arguments must be an object.");
      return runLocalTool(local, localArgs, this.localApi());
    }
    if (!attePublicTool(name)) {
      throw new AttelierMcpBridgeError(
        METHOD_NOT_FOUND,
        `${name} is not part of Attelier's public tool surface. Call tools/list for the ${ATTE_PUBLIC_TOOLS.length + LOCAL_TOOLS.length} available tools.`,
      );
    }
    const args = params?.arguments === undefined ? {} : params.arguments;
    if (!asObject(args)) throw new AttelierMcpBridgeError(INVALID_PARAMS, "Tool arguments must be an object.");
    const input = { ...asObject(args)! };
    if (name === "motion_render_source" && input.downloadTo !== undefined) {
      if (typeof input.downloadTo !== "string") throw new AttelierMcpBridgeError(INVALID_PARAMS, "downloadTo must be a path.");
      const { downloadTo, ...remote } = input;
      const result = asObject(await this.forward(name, remote))!;
      if (result.isError) return result;
      const value = asObject(result.structuredContent)!;
      if (typeof value.outputUrl !== "string") throw new AttelierMcpBridgeError(UPSTREAM_ERROR, "Composition has no output URL.");
      const downloaded = await downloadRender(downloadTo, this.options.apiUrl.replace(/\/$/, "") + value.outputUrl, { ...this.options, fetch: this.fetchImpl as typeof fetch });
      const data = { ...value, ...downloaded };
      return { ...result, structuredContent: data, content: [{ type: "text", text: JSON.stringify(data) },
        ...(Array.isArray(result.content) ? result.content.filter(item => asObject(item)?.type === "image") : [])] };
    }
    if(name==='upload_inference' && typeof input.path==='string') {
      const bytes=await readFile(input.path);
      if(bytes.length>512*1024)throw new AttelierMcpBridgeError(INVALID_PARAMS,"Inline MCP uploads are limited to 512 KiB. Upload a smaller copy, e.g. ffmpeg -i in.jpg -vf scale=1280:-2 -q:v 4 small.jpg.");
      // The type follows the file unless the caller named one.
      const types:Record<string,string>={".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".wav":"audio/wav",".mp3":"audio/mpeg",".m4a":"audio/mp4",".mp4":"video/mp4"};
      if(typeof input.mimeType!=='string'){const type=types[extname(input.path).toLowerCase()];if(type)input.mimeType=type;}
      delete input.path;input.dataBase64=bytes.toString('base64');
    }
    if(name==='download_inference' && typeof input.downloadTo==='string') {
      const {downloadTo,...remote}=input;
      const result=asObject(await this.forward(name,remote))!;
      if(result.isError)return result;
      const value=asObject(result.structuredContent)!;
      if(typeof value.outputUrl!=='string')throw new AttelierMcpBridgeError(UPSTREAM_ERROR,'Result has no download URL.');
      const downloadUrl=value.outputUrl.startsWith("/v1/inference/") ? this.options.apiUrl.replace(/\/+$/,"")+value.outputUrl : value.outputUrl;
      const downloaded=await downloadRender(downloadTo,downloadUrl,{...this.options,fetch:this.fetchImpl as typeof fetch});
      const data={...value,...downloaded};return {...result,structuredContent:data,content:[{type:'text',text:JSON.stringify(data)}]};
    }
    if (name === "motion_source" && input.path !== undefined) {
      if (typeof input.path !== "string" || input.patch !== undefined || asObject(input.composition)?.code !== undefined) throw new AttelierMcpBridgeError(INVALID_PARAMS, "Give the code one way: path, patch or composition.code.");
      const { path: sourcePath, ...remote } = input;
      return this.forward(name, { ...remote, composition: { ...asObject(input.composition), code: await readLocalSource(sourcePath) } });
    }
    if (name === "analyze_asset" && input.path !== undefined) {
      if (typeof input.path !== "string" || input.assetId !== undefined || input.elementId !== undefined) throw new AttelierMcpBridgeError(INVALID_PARAMS, "Name the media one way: path, assetId or elementId.");
      const uploadId = await uploadLocalMedia(input.path, (tool, values) => this.forward(tool, values));
      const imported = asObject(await this.forward("import_media", { projectId: input.projectId, uploadIds: [uploadId], attach: true }))!;
      const value = asObject(imported.structuredContent) ?? JSON.parse((imported.content as Array<{ text: string }>)[0]!.text);
      const assetId = asObject((value.imported as unknown[] | undefined)?.[0])?.assetId;
      if (typeof assetId !== "string") throw new AttelierMcpBridgeError(UPSTREAM_ERROR, "The file was not imported.");
      const { path: _path, ...remote } = input;
      return this.forward(name, { ...remote, assetId });
    }
    if (name === "set_brief" && (!Number.isSafeInteger(input.expectedPlanVersion) || Number(input.expectedPlanVersion) < 0)) {
      throw new AttelierMcpBridgeError(INVALID_PARAMS, "This connector requires expectedPlanVersion from inspect_project.plan.version or get_brief.planVersion. Re-read before updating the brief.");
    }
    if (name === "get_job" && input.downloadTo !== undefined) {
      if (input.kind !== "render" || typeof input.downloadTo !== "string") throw new AttelierMcpBridgeError(INVALID_PARAMS, "downloadTo requires a render job and a local destination path.");
      const { downloadTo, ...remote } = input;
      const result = asObject(await this.forward(name, remote))!;
      if (result.isError) return result;
      const value = asObject(result.structuredContent) ?? JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
      if (value.status !== "complete" || typeof value.outputUrl !== "string") throw new AttelierMcpBridgeError(INVALID_PARAMS, "Finish the render before downloading it.");
      const downloaded = await downloadRender(downloadTo, value.outputUrl, { ...this.options, fetch: this.fetchImpl as typeof fetch });
      return { ...result, structuredContent: { ...value, ...downloaded }, content: [{ type: "text", text: JSON.stringify({ ...value, ...downloaded }) }, ...(result.content as unknown[]).slice(1)] };
    }
    const briefPath = name === "prepare_project" ? input.briefPath : name === "set_brief" ? input.fromPath : undefined;
    if (briefPath !== undefined) {
      if (typeof briefPath !== "string" || input.brief !== undefined || input.briefMarkdown !== undefined) throw new AttelierMcpBridgeError(INVALID_PARAMS, "Pass one brief source.");
      input.briefMarkdown = await readLocalBrief(briefPath);
      delete input.briefPath; delete input.fromPath;
    }
    if ((name === "import_media" || name === "prepare_project") && input.paths !== undefined) {
      if (!Array.isArray(input.paths) || !input.paths.length || input.paths.length > 100 || input.paths.some((item) => typeof item !== "string")) {
        throw new AttelierMcpBridgeError(INVALID_PARAMS, "paths must contain 1–100 media paths.");
      }
      if (input.uploadIds !== undefined) throw new AttelierMcpBridgeError(INVALID_PARAMS, "Use paths or uploadIds, not both.");
      const uploadIds: string[] = [];
      for (const mediaPath of input.paths as string[]) uploadIds.push(await uploadLocalMedia(mediaPath, (tool, values) => this.forward(tool, values)));
      const { paths: _paths, ...remote } = input;
      return this.forward(name, { ...remote, uploadIds });
    }
    return this.forward(name, input);
  }
}

/** Serve JSON-RPC framed as newline-delimited JSON on stdio, the framing every
 * current MCP stdio client uses. */
export const runAttelierMcpStdio = async (
  options: AttelierMcpServerOptions,
  streams: { input: Readable; output: Writable } = { input: process.stdin, output: process.stdout },
): Promise<void> => {
  const server = new AttelierMcpServer(options);
  // stdout carries JSON-RPC only. Libraries used by local tools (Remotion's
  // browser download, progress logs) print to stdout, so everything except
  // our own frames is diverted to stderr.
  let emit = (line: string) => { streams.output.write(line); };
  if (streams.output === process.stdout) {
    const stdoutWrite = process.stdout.write.bind(process.stdout);
    emit = (line) => { stdoutWrite(line); };
    process.stdout.write = process.stderr.write.bind(process.stderr) as typeof process.stdout.write;
  }
  const write = (payload: unknown) => {
    emit(`${JSON.stringify(payload)}\n`);
  };
  let buffer = "";
  streams.input.setEncoding("utf8");
  await new Promise<void>((resolve, reject) => {
    const dispatch = async (line: string) => {
      if (!line.trim()) return;
      let request: JsonRpcRequest;
      try {
        request = JSON.parse(line) as JsonRpcRequest;
      } catch {
        write({ jsonrpc: "2.0", id: null, error: { code: PARSE_ERROR, message: "Invalid JSON." } });
        return;
      }
      const id = request.id ?? null;
      try {
        const result = await server.handle(request);
        // A JSON-RPC notification carries no id and takes no response.
        if (request.id === undefined) return;
        write({ jsonrpc: "2.0", id, result });
      } catch (error) {
        if (request.id === undefined) return;
        const code = error instanceof AttelierMcpBridgeError ? error.code : UPSTREAM_ERROR;
        write({
          jsonrpc: "2.0",
          id,
          error: {
            code,
            message: error instanceof Error ? error.message : "attelier-mcp failed.",
            ...(error instanceof AttelierMcpBridgeError && error.data !== undefined ? { data: error.data } : {}),
          },
        });
      }
    };
    // Requests are handled in arrival order so a client's tool sequence is
    // never reordered by the bridge.
    let queue: Promise<void> = Promise.resolve();
    streams.input.on("data", (chunk: string) => {
      buffer += chunk;
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        queue = queue.then(() => dispatch(line));
        newline = buffer.indexOf("\n");
      }
    });
    streams.input.on("error", reject);
    streams.input.on("end", () => {
      queue.then(() => resolve(), reject);
    });
  });
};
