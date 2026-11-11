import assert from "node:assert/strict";
import test from "node:test";
import {
  BuiltinConnectorRegistry,
  ConnectorError,
  SEARCH_PROJECT_MEDIA_CONNECTOR,
  type BuiltinConnectorDeclaration,
} from "./connectors.js";

const fixture = (overrides: Partial<BuiltinConnectorDeclaration<{ value: string }, string>> = {}) => ({
  schemaVersion: "atelier.connector.v1" as const,
  id: "fixture.echo",
  capability: "fixture.echo",
  sideEffect: "read-only" as const,
  input: {
    type: "object" as const,
    properties: { value: { type: "string" as const, minLength: 1 } },
    required: ["value"],
    additionalProperties: false,
  },
  output: { type: "string" as const },
  provenance: { source: "builtin" as const, provider: "fixture", version: "1.0.0", network: false as const, credentials: false as const, spendUsd: 0 as const },
  timeoutMs: 100,
  builtin: "fixture.echo",
  ...overrides,
});

test("builtin declaration becomes an executable typed invocation", async () => {
  const registry = new BuiltinConnectorRegistry();
  registry.register(fixture(), ({ value }) => value.toUpperCase());
  assert.equal(await registry.execute<{ value: string }, string>({ id: "fixture.echo", capability: "fixture.echo", input: { value: "ok" } }), "OK");
  assert.equal(registry.declaration("fixture.echo")?.sideEffect, "read-only");
  assert.equal(registry.list().length, 1);
});

test("connector schema and capability are rejected before the builtin runs", async () => {
  let invoked = false;
  const registry = new BuiltinConnectorRegistry();
  registry.register(fixture(), () => { invoked = true; return "nope"; });
  await assert.rejects(() => registry.execute({ id: "fixture.echo", capability: "wrong", input: { value: "ok" } }), (error: unknown) => error instanceof ConnectorError && error.code === "capability");
  await assert.rejects(() => registry.execute({ id: "fixture.echo", input: { value: "" } }), (error: unknown) => error instanceof ConnectorError && error.code === "invalid_input");
  assert.equal(invoked, false);
});

test("connector execution times out and the project media declaration is local and free", async () => {
  const registry = new BuiltinConnectorRegistry();
  registry.register(fixture({ timeoutMs: 10 }), async () => new Promise(() => undefined));
  await assert.rejects(() => registry.execute({ id: "fixture.echo", input: { value: "wait" } }), (error: unknown) => error instanceof ConnectorError && error.code === "timeout");
  assert.equal(SEARCH_PROJECT_MEDIA_CONNECTOR.sideEffect, "read-only");
  assert.equal(SEARCH_PROJECT_MEDIA_CONNECTOR.provenance.network, false);
  assert.equal(SEARCH_PROJECT_MEDIA_CONNECTOR.provenance.credentials, false);
  assert.equal(SEARCH_PROJECT_MEDIA_CONNECTOR.provenance.spendUsd, 0);
});

test("connector output is validated before it crosses the harness boundary", async () => {
  const registry = new BuiltinConnectorRegistry();
  registry.register(fixture(), () => 42 as never);
  await assert.rejects(
    () => registry.execute({ id: "fixture.echo", input: { value: "ok" } }),
    (error: unknown) =>
      error instanceof ConnectorError &&
      error.code === "execution" &&
      /invalid result/.test(error.message),
  );
});
