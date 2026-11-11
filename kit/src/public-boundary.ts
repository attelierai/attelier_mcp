import { ticksToSeconds, type Asset, type Project, type TimelineElement } from "@attelier/project-schema";

export type PublicToolErrorDetail = {
  code: string;
  message: string;
  field: string;
  validValues?: readonly unknown[];
  example?: unknown;
};

export class PublicToolValidationError extends Error {
  readonly detail: PublicToolErrorDetail;

  constructor(detail: PublicToolErrorDetail) {
    super(detail.message);
    this.name = "PublicToolValidationError";
    this.detail = detail;
  }
}

export const publicToolError = (
  code: string,
  message: string,
  field: string,
  options: { validValues?: readonly unknown[]; example?: unknown },
): PublicToolValidationError => new PublicToolValidationError({ code, message, field, ...options });

export const assertKnownKeys = (
  value: Record<string, unknown>,
  validKeys: readonly string[],
  field = "arguments",
  example?: unknown,
): void => {
  const unknown = Object.keys(value).filter((key) => !validKeys.includes(key));
  if (unknown.length === 0) return;
  throw publicToolError(
    "UNKNOWN_FIELD",
    `Unknown ${field} key${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}. Valid keys: ${validKeys.join(", ")}.`,
    field,
    { validValues: validKeys, ...(example === undefined ? {} : { example }) },
  );
};

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  enum?: readonly unknown[];
  const?: unknown;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  minLength?: number;
  maxLength?: number;
  default?: unknown;
};

const exampleFor = (schema: JsonSchema): unknown => {
  if (schema.default !== undefined) return schema.default;
  if (schema.const !== undefined) return schema.const;
  if (schema.enum?.length) return schema.enum[0];
  if (schema.type === "object") return Object.fromEntries((schema.required ?? []).map((key) => [key, exampleFor(schema.properties?.[key] ?? {})]));
  if (schema.type === "array") return [exampleFor(schema.items ?? {})];
  if (schema.type === "integer" || schema.type === "number") return Math.max(schema.minimum ?? 0, typeof schema.exclusiveMinimum === "number" ? schema.exclusiveMinimum + 1 : 0);
  if (schema.type === "boolean") return true;
  return "value";
};

/** Build the same repair example used by schema validation so transport
 * adapters can turn downstream lookup/runtime failures into the public
 * teaching-error contract without inventing a second schema example. */
export const publicToolExample = (schema: Record<string, unknown>): unknown =>
  exampleFor(schema as JsonSchema);

const validateValue = (value: unknown, schema: JsonSchema, field: string): void => {
  const example = exampleFor(schema);
  if (schema.const !== undefined && value !== schema.const) {
    throw publicToolError("INVALID_VALUE", `${field} must be ${JSON.stringify(schema.const)}.`, field, { validValues: [schema.const], example });
  }
  if (schema.enum && !schema.enum.includes(value)) {
    throw publicToolError("INVALID_VALUE", `${field} must be one of: ${schema.enum.map(String).join(", ")}.`, field, { validValues: schema.enum, example });
  }
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw publicToolError("INVALID_TYPE", `${field} must be an object.`, field, { example });
    }
    const object = value as Record<string, unknown>;
    const properties = schema.properties ?? {};
    if (schema.additionalProperties === false) assertKnownKeys(object, Object.keys(properties), field, example);
    for (const required of schema.required ?? []) {
      if (object[required] === undefined) {
        throw publicToolError("REQUIRED_FIELD", `${field}.${required} is required.`, `${field}.${required}`, { example });
      }
    }
    for (const [key, nested] of Object.entries(properties)) {
      if (object[key] !== undefined) validateValue(object[key], nested, `${field}.${key}`);
    }
    return;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) throw publicToolError("INVALID_TYPE", `${field} must be an array.`, field, { example });
    if (schema.minItems !== undefined && value.length < schema.minItems) throw publicToolError("INVALID_LENGTH", `${field} needs at least ${schema.minItems} item(s).`, field, { example });
    if (schema.maxItems !== undefined && value.length > schema.maxItems) throw publicToolError("INVALID_LENGTH", `${field} accepts at most ${schema.maxItems} item(s).`, field, { example });
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) throw publicToolError("DUPLICATE_VALUE", `${field} items must be unique.`, field, { example });
    value.forEach((item, index) => validateValue(item, schema.items ?? {}, `${field}[${index}]`));
    return;
  }
  const validType = schema.type === "string" ? typeof value === "string"
    : schema.type === "boolean" ? typeof value === "boolean"
      : schema.type === "number" ? typeof value === "number" && Number.isFinite(value)
        : schema.type === "integer" ? Number.isSafeInteger(value)
          : true;
  if (!validType) throw publicToolError("INVALID_TYPE", `${field} must be ${schema.type}.`, field, { example });
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) throw publicToolError("INVALID_LENGTH", `${field} must contain at least ${schema.minLength} character(s).`, field, { example });
    if (schema.maxLength !== undefined && value.length > schema.maxLength) throw publicToolError("INVALID_LENGTH", `${field} accepts at most ${schema.maxLength} character(s).`, field, { example });
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) throw publicToolError("OUT_OF_RANGE", `${field} must be at least ${schema.minimum}.`, field, { example });
    if (schema.maximum !== undefined && value > schema.maximum) throw publicToolError("OUT_OF_RANGE", `${field} must be at most ${schema.maximum}.`, field, { example });
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) throw publicToolError("OUT_OF_RANGE", `${field} must be greater than ${schema.exclusiveMinimum}.`, field, { example });
  }
};

/** Validate the JSON-schema subset used by the public MCP catalog and return
 * one structured, repairable boundary error instead of a downstream failure. */
export const validatePublicArguments = (value: Record<string, unknown>, schema: Record<string, unknown>): void =>
  validateValue(value, schema as JsonSchema, "arguments");

const TRANSACTION_REQUIRED_FIELDS = [
  "id", "baseRevision", "idempotencyKey", "source", "authorId", "preconditions", "operations",
] as const;

/** Reject transaction handles and partial copies before the project core sees
 * them. A compiled transaction is an immutable preview artifact, not an id
 * that can be looked up later. */
export const validatePublicTransaction = (value: Record<string, unknown>): void => {
  const missing = TRANSACTION_REQUIRED_FIELDS.filter((field) => value[field] === undefined);
  if (missing.length === 0) return;
  throw publicToolError(
    "INCOMPLETE_TRANSACTION",
    `transaction is incomplete; pass the complete object returned by compile_edit or simulate_transaction. Missing fields: ${missing.join(", ")}.`,
    "transaction",
    {
      example: {
        id: "transaction-id",
        baseRevision: 12,
        idempotencyKey: "edit:project-id:12:unique-key",
        source: "agent",
        authorId: "agent",
        preconditions: [],
        operations: [],
      },
    },
  );
};

export type CoverageVideoSource = {
  element: TimelineElement;
  asset: Asset;
};

/** Resolve the explicitly selected video at one timeline instant. Coverage is
 * generated from the composed frame, but its rights and lineage come from this
 * source clip, so a nearby or hidden asset must never be guessed. */
export const coverageVideoSourceAt = (
  project: Project,
  fromElementId: string,
  atSeconds: number,
): CoverageVideoSource => {
  const sequence = project.sequences.find(({ id }) => id === project.activeSequenceId);
  const element = sequence?.tracks
    .flatMap(({ elements }) => elements)
    .find(({ id }) => id === fromElementId);
  const startsAt = element ? ticksToSeconds(element.timelineRange.start) : Number.NaN;
  const endsAt = element ? startsAt + ticksToSeconds(element.timelineRange.duration) : Number.NaN;
  const asset = element?.assetId
    ? project.assets.find(({ id }) => id === element.assetId)
    : undefined;
  if (
    !element ||
    element.kind !== "video" ||
    !asset ||
    asset.mediaType !== "video" ||
    atSeconds < startsAt ||
    atSeconds >= endsAt
  ) {
    throw publicToolError(
      "UNSUPPORTED_SOURCE",
      `generate_coverage needs fromElementId to name a video clip visible at timeline second ${atSeconds}. Inspect the project around that time and choose the video element, not its asset id.`,
      "fromElementId",
      { example: { projectId: project.id, fromElementId: "video-element-1", atSeconds } },
    );
  }
  return { element, asset };
};
