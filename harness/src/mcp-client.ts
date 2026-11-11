import { ATTELIER_AGENT_HARNESS_VERSION, ATTELIER_MCP_PROTOCOL_VERSION } from "./index.js";
import { randomUUID } from "node:crypto";
import type { AttelierSessionProjection } from "@attelier/agent-schema";

export type AtteSessionTurnResult = { kind: "command" | "conversation"; message: string; projection: AttelierSessionProjection; pending?: boolean };

export type McpTool = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
};

type JsonRpcResponse<T> = {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
};

const TRACE_ID = /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/i;

export class AttelierMcpError extends Error {
  readonly status: number | undefined;
  readonly code: number | undefined;

  constructor(message: string, status?: number, code?: number) {
    super(message);
    this.name = "AttelierMcpError";
    this.status = status;
    this.code = code;
  }
}

export class AttelierMcpClient {
  private requestId = 0;
  readonly endpoint: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly traceId: string | undefined;

  constructor(
    baseUrl: string,
    token: string,
    fetchImpl: typeof fetch = fetch,
    traceId?: string,
  ) {
    this.endpoint = `${baseUrl.replace(/\/$/, "")}/mcp`;
    this.token = token;
    this.fetchImpl = fetchImpl;
    this.traceId = traceId?.trim().toLowerCase() || undefined;
    if (this.traceId && !TRACE_ID.test(this.traceId)) {
      throw new AttelierMcpError("--trace must be a 32-character W3C trace ID or UUID.");
    }
  }

  private async request<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.token.trim()) throw new AttelierMcpError("ATTELIER_API_TOKEN or --token is required for MCP commands.");
    const id = ++this.requestId;
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-atelier-client": "Atte Terminal",
        authorization: `Bearer ${this.token}`,
        ...(this.traceId ? { "x-atelier-trace-id": this.traceId } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }),
    });
    const payload = (await response.json()) as JsonRpcResponse<T>;
    if (!response.ok) throw new AttelierMcpError(payload.error?.message ?? `Attelier API returned ${response.status}.`, response.status);
    if (payload.error) throw new AttelierMcpError(payload.error.message, response.status, payload.error.code);
    if (payload.result === undefined) throw new AttelierMcpError("Attelier MCP returned no result.", response.status);
    return payload.result;
  }

  initialize() {
    return this.request<{
      protocolVersion: string;
      serverInfo: { name: string; version: string };
    }>("initialize", {
      protocolVersion: ATTELIER_MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "atelier-agent-cli", version: ATTELIER_AGENT_HARNESS_VERSION },
    });
  }

  private async sessionRequest<T>(path: string, body?: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.endpoint.slice(0, -4)}/v1/sessions/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json", "x-atelier-client": "Atte Terminal" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json() as T & { message?: string; error?: string };
    if (!response.ok) throw new AttelierMcpError(payload.message ?? payload.error ?? `Atte session request failed (${response.status}).`, response.status);
    return payload;
  }

  async sessionTurn(sessionId: string, input: string, workingDirectory: string, idempotencyKey: string = randomUUID()): Promise<AtteSessionTurnResult> {
    const path = `${encodeURIComponent(sessionId)}/turns`;
    let result: AtteSessionTurnResult;
    try {
      result = await this.sessionRequest(path, { input, workingDirectory, idempotencyKey });
    } catch (error) {
      if (error instanceof AttelierMcpError) throw error;
      // An ambiguous disconnect only reads the existing receipt; it cannot start inference again.
      result = await this.sessionRequest(`${path}/${encodeURIComponent(idempotencyKey)}`);
    }
    while (result.pending) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      result = await this.sessionRequest(`${path}/${encodeURIComponent(idempotencyKey)}`);
    }
    return result;
  }

  resolveSessionProposal(sessionId: string, proposalId: string, action: "apply" | "discard"): Promise<{ projection: AttelierSessionProjection }> {
    return this.sessionRequest(`${encodeURIComponent(sessionId)}/proposals/${encodeURIComponent(proposalId)}/${action}`, {});
  }

  async listTools(): Promise<McpTool[]> {
    const result = await this.request<{ tools: McpTool[] }>("tools/list");
    return result.tools;
  }

  async callTool<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
    const result = await this.request<{ structuredContent?: T; content?: Array<{ type: string; text?: string }> }>(
      "tools/call",
      { name, arguments: args },
    );
    if (result.structuredContent !== undefined) return result.structuredContent;
    const text = result.content?.find((entry) => entry.type === "text")?.text;
    if (text === undefined) throw new AttelierMcpError(`Tool ${name} returned no structured content.`);
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }
}
