import type { SmartMediaSearchInput, SmartMediaSearchResponse } from "@attelier/analysis-schema";

/** Versioned contract for executable, provider-neutral local connectors. */
export const CONNECTOR_CONTRACT_VERSION = "atelier.connector.v1" as const;

export type ConnectorSideEffect = "read-only";

export type ConnectorJsonSchema = {
  type: "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";
  properties?: Readonly<Record<string, ConnectorJsonSchema>>;
  required?: readonly string[];
  items?: ConnectorJsonSchema;
  additionalProperties?: boolean;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
};

export type ConnectorProvenance = {
  source: "builtin";
  provider: string;
  version: string;
  network: false;
  credentials: false;
  spendUsd: 0;
};

export type BuiltinConnectorDeclaration<Input, Output> = {
  schemaVersion: typeof CONNECTOR_CONTRACT_VERSION;
  id: string;
  capability: string;
  sideEffect: ConnectorSideEffect;
  input: ConnectorJsonSchema;
  output: ConnectorJsonSchema;
  provenance: ConnectorProvenance;
  timeoutMs: number;
  builtin: string;
  /** Type-only links make declarations useful to callers without serializing types. */
  readonly __input?: Input;
  readonly __output?: Output;
};

export type ConnectorHandler<Input, Output> = (input: Input) => Output | Promise<Output>;

export type ConnectorExecutionRequest<Input> = {
  id: string;
  capability?: string;
  input: Input;
  timeoutMs?: number;
};

export class ConnectorError extends Error {
  constructor(message: string, readonly code: "not_found" | "invalid_input" | "capability" | "timeout" | "execution" = "execution") {
    super(message);
    this.name = "ConnectorError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const validateSchema = (schema: ConnectorJsonSchema, value: unknown, path = "input"): string[] => {
  const issues: string[] = [];
  const actual = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
  if (schema.type === "integer" && (actual !== "number" || !Number.isInteger(value))) {
    issues.push(`${path} must be an integer`);
    return issues;
  }
  if (schema.type !== "integer" && actual !== schema.type) {
    issues.push(`${path} must be a ${schema.type}`);
    return issues;
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) issues.push(`${path} is shorter than ${schema.minLength} characters`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) issues.push(`${path} is longer than ${schema.maxLength} characters`);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) issues.push(`${path} must be finite`);
    if (schema.minimum !== undefined && value < schema.minimum) issues.push(`${path} must be at least ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) issues.push(`${path} must be at most ${schema.maximum}`);
  }
  if (schema.type === "object" && isRecord(value)) {
    for (const required of schema.required ?? []) if (!(required in value)) issues.push(`${path}.${required} is required`);
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!schema.properties?.[key]) issues.push(`${path}.${key} is not allowed`);
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (key in value) issues.push(...validateSchema(child, value[key], `${path}.${key}`));
    }
  }
  if (schema.type === "array" && Array.isArray(value) && schema.items) {
    value.forEach((item, index) => issues.push(...validateSchema(schema.items!, item, `${path}[${index}]`)));
  }
  return issues;
};

const assertDeclaration = <Input, Output>(declaration: BuiltinConnectorDeclaration<Input, Output>): void => {
  if (declaration.schemaVersion !== CONNECTOR_CONTRACT_VERSION) throw new ConnectorError(`Unsupported connector schema ${String(declaration.schemaVersion)}.`, "invalid_input");
  if (!declaration.id.trim() || !declaration.capability.trim() || !declaration.builtin.trim()) throw new ConnectorError("Connector id, capability and builtin are required.", "invalid_input");
  if (declaration.sideEffect !== "read-only") throw new ConnectorError(`Connector ${declaration.id} must be read-only.`, "invalid_input");
  if (!Number.isSafeInteger(declaration.timeoutMs) || declaration.timeoutMs < 1 || declaration.timeoutMs > 30_000) throw new ConnectorError(`Connector ${declaration.id} has an invalid timeout.`, "invalid_input");
  if (declaration.provenance.network || declaration.provenance.credentials || declaration.provenance.spendUsd !== 0) throw new ConnectorError(`Connector ${declaration.id} is not zero-spend and local.`, "invalid_input");
};

export class BuiltinConnectorRegistry {
  private readonly entries = new Map<string, { declaration: BuiltinConnectorDeclaration<unknown, unknown>; handler: ConnectorHandler<unknown, unknown> }>();

  register<Input, Output>(declaration: BuiltinConnectorDeclaration<Input, Output>, handler: ConnectorHandler<Input, Output>): this {
    assertDeclaration(declaration);
    if (this.entries.has(declaration.id)) throw new ConnectorError(`Connector ${declaration.id} is already registered.`, "invalid_input");
    this.entries.set(declaration.id, { declaration: declaration as BuiltinConnectorDeclaration<unknown, unknown>, handler: handler as ConnectorHandler<unknown, unknown> });
    return this;
  }

  registerBuiltin<Input, Output>(declaration: BuiltinConnectorDeclaration<Input, Output>, handler: ConnectorHandler<Input, Output>): this {
    return this.register(declaration, handler);
  }

  declaration(id: string): BuiltinConnectorDeclaration<unknown, unknown> | undefined {
    return this.entries.get(id)?.declaration;
  }

  list(): readonly BuiltinConnectorDeclaration<unknown, unknown>[] {
    return [...this.entries.values()].map(({ declaration }) => declaration);
  }

  async execute<Input, Output>(request: ConnectorExecutionRequest<Input>): Promise<Output> {
    const entry = this.entries.get(request.id);
    if (!entry) throw new ConnectorError(`Connector ${request.id} is not registered.`, "not_found");
    if (request.capability !== undefined && request.capability !== entry.declaration.capability) {
      throw new ConnectorError(`Connector ${request.id} does not provide capability ${request.capability}.`, "capability");
    }
    const inputIssues = validateSchema(entry.declaration.input, request.input);
    if (inputIssues.length > 0) throw new ConnectorError(inputIssues.join("; "), "invalid_input");
    const timeoutMs = request.timeoutMs ?? entry.declaration.timeoutMs;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > entry.declaration.timeoutMs) throw new ConnectorError(`Requested timeout must be between 1 and ${entry.declaration.timeoutMs}ms.`, "invalid_input");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        Promise.resolve(entry.handler(request.input as unknown)).then((value) => ({ ok: true as const, value })),
        new Promise<{ ok: false; error: ConnectorError }>((resolve) => {
          timer = setTimeout(() => resolve({ ok: false, error: new ConnectorError(`Connector ${request.id} exceeded ${timeoutMs}ms.`, "timeout") }), timeoutMs);
        }),
      ]);
      if (!result.ok) throw result.error;
      const outputIssues = validateSchema(entry.declaration.output, result.value, "output");
      if (outputIssues.length > 0) {
        throw new ConnectorError(
          `Connector ${request.id} returned an invalid result: ${outputIssues.join("; ")}`,
          "execution",
        );
      }
      return result.value as Output;
    } catch (error) {
      if (error instanceof ConnectorError) throw error;
      throw new ConnectorError(`Connector ${request.id} failed: ${error instanceof Error ? error.message : String(error)}`, "execution");
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  executeBuiltin<Input, Output>(request: ConnectorExecutionRequest<Input>): Promise<Output> {
    return this.execute<Input, Output>(request);
  }
}

export type SearchProjectMediaConnectorInput = SmartMediaSearchInput & { projectId: string };
export type SearchProjectMediaConnectorOutput = SmartMediaSearchResponse;

export const SEARCH_PROJECT_MEDIA_CONNECTOR: BuiltinConnectorDeclaration<SearchProjectMediaConnectorInput, SearchProjectMediaConnectorOutput> = {
  schemaVersion: CONNECTOR_CONTRACT_VERSION,
  id: "search_project_media",
  capability: "project.media.search",
  sideEffect: "read-only",
  input: {
    type: "object",
    properties: {
      projectId: { type: "string", minLength: 1, maxLength: 200 },
      query: { type: "string", minLength: 1, maxLength: 200 },
      limit: { type: "integer", minimum: 1, maximum: 100 },
    },
    required: ["projectId", "query"],
    additionalProperties: false,
  },
  output: { type: "object" },
  provenance: {
    source: "builtin",
    provider: "atelier-local",
    version: "1.0.0",
    network: false,
    credentials: false,
    spendUsd: 0,
  },
  timeoutMs: 5_000,
  builtin: "services/api/smart-media-search",
};
