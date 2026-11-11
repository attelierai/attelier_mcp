import { deepStrictEqual, throws } from "node:assert/strict";
import test from "node:test";
import { assertKnownKeys, PublicToolValidationError, publicToolError, validatePublicArguments, validatePublicTransaction } from "./public-boundary.js";

test("the public error helper returns the teachable contract", () => {
  const error = publicToolError("INVALID_VALUE", "level is invalid.", "level", { validValues: ["cut", "frames"], example: { level: "cut" } });
  deepStrictEqual(error.detail, { code: "INVALID_VALUE", message: "level is invalid.", field: "level", validValues: ["cut", "frames"], example: { level: "cut" } });
});

test("unknown keys report valid keys and an example", () => {
  throws(() => assertKnownKeys({ project_id: "p" }, ["projectId"], "arguments", { projectId: "p" }), (error: unknown) =>
    error instanceof PublicToolValidationError
      && error.detail.field === "arguments"
      && error.detail.validValues?.[0] === "projectId"
      && error.detail.example !== undefined);
});

test("public schemas return structured errors for nested types, enums and required fields", () => {
  const schema = {
    type: "object", additionalProperties: false, required: ["kind", "rangeSeconds"],
    properties: {
      kind: { type: "string", enum: ["cut", "frames"] },
      rangeSeconds: { type: "array", minItems: 2, maxItems: 2, items: { type: "number", minimum: 0 } },
    },
  };
  throws(() => validatePublicArguments({ kind: "other", rangeSeconds: [0, 1] }, schema), (error: unknown) =>
    error instanceof PublicToolValidationError && error.detail.code === "INVALID_VALUE" && error.detail.field === "arguments.kind");
  throws(() => validatePublicArguments({ kind: "cut", rangeSeconds: ["zero", 1] }, schema), (error: unknown) =>
    error instanceof PublicToolValidationError && error.detail.code === "INVALID_TYPE" && error.detail.field === "arguments.rangeSeconds[0]");
  throws(() => validatePublicArguments({ kind: "cut" }, schema), (error: unknown) =>
    error instanceof PublicToolValidationError && error.detail.code === "REQUIRED_FIELD" && error.detail.example !== undefined);
});

test("the full-object commit path still rejects partial transaction objects", () => {
  throws(() => validatePublicTransaction({ id: "tx-only" }), (error: unknown) =>
    error instanceof PublicToolValidationError
      && error.detail.code === "INCOMPLETE_TRANSACTION"
      && error.detail.field === "transaction"
      && /baseRevision/.test(error.message)
      && error.detail.example !== undefined);
});
