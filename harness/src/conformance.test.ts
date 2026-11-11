import assert from "node:assert/strict";
import test from "node:test";
import { EFFECT_CATALOG } from "@attelier/capability-schema/effect-catalog";
import {
  ATTELIER_AGENT_CONFORMANCE_TOOLS,
  runAttelierAgentConformance,
} from "./conformance.js";
import {
  ATTELIER_AGENT_HARNESS,
  ATTELIER_MCP_PROTOCOL_VERSION,
  ATTELIER_MCP_SERVER_VERSION,
} from "./index.js";

test("external conformance exercises the agent contract through MCP without commit or spend", async () => {
  const calls: string[] = [];
  const traceId = "0123456789abcdef0123456789abcdef";
  const transaction = {
    id: "tx-conformance",
    idempotencyKey: "tx-conformance-key",
    baseRevision: 7,
    source: "agent",
    authorId: "agent",
    preconditions: [{ type: "elementExists", elementId: "clip-1" }],
    operations: [{ type: "setProperty", elementId: "clip-1", path: "transform.opacity", value: 0.5 }],
  };
  const responses: Record<string, unknown> = {
    discover_atelier: {
      catalogVersion: ATTELIER_AGENT_HARNESS.catalogVersion,
      agentHarness: { version: ATTELIER_AGENT_HARNESS.version },
      useCases: [{ id: "product-ad" }],
      capabilities: [{ id: "text-to-image" }],
      audioDelivery: { profiles: [{ id: "web" }, { id: "broadcast" }, { id: "podcast" }] },
    },
    get_craft_guide: { version: "1.0.0", rules: [{ id: "craft.test" }] },
    list_effects: { effects: EFFECT_CATALOG },
    list_agent_skills: { skills: [{ id: "video-craft", version: "1.2.0" }] },
    get_agent_skill: { id: "video-craft", version: "1.2.0", body: "fixture" },
    inspect_project: {
      id: "project-1",
      revision: 7,
      sequences: [{ tracks: [{ elements: [{ id: "clip-1" }] }] }],
    },
    list_project_versions: { projectId: "project-1", currentRevision: 7, versions: [] },
    list_execution_traces: [{ id: traceId }],
    get_execution_trace: {
      id: traceId,
      events: [{ id: "event-1", name: "agent.plan.ready", provenance: { harnessVersion: ATTELIER_AGENT_HARNESS.version } }],
    },
    route_creative_prompt: { plan: { routerVersion: "1.0.0", resolutionId: "9:16" } },
    plan_edit: {
      traceId,
      baseRevision: 7,
      provider: "deterministic-local-v1",
      provenance: { harnessVersion: ATTELIER_AGENT_HARNESS.version },
      transaction,
    },
    simulate_transaction: { revision: 8, alreadyApplied: false, affectedScopes: ["sequence"] },
    evaluate_project: { profile: "general-video-v1", score: 84, passedGates: true },
    evaluate_effect_parity: { effectId: "atelier.transition.cross-dissolve", status: "pass" },
    get_evaluation_spec: { rubric: { id: "product-ad-rubric.v1" } },
  };
  const client = {
    initialize: async () => ({
      protocolVersion: ATTELIER_MCP_PROTOCOL_VERSION,
      serverInfo: { name: "atelier", version: ATTELIER_MCP_SERVER_VERSION },
    }),
    listTools: async () => ATTELIER_AGENT_CONFORMANCE_TOOLS.map((name) => ({ name, inputSchema: {} })),
    callTool: async <T = unknown>(name: string, args: Record<string, unknown>): Promise<T> => {
      calls.push(name);
      if (name === "simulate_transaction") assert.deepEqual(args.transaction, transaction);
      return responses[name] as T;
    },
  };

  const report = await runAttelierAgentConformance(client, "project-1");
  assert.equal(report.passed, true);
  assert.equal(report.execution, "mcp-only");
  assert.equal(report.projectMutation, "none");
  assert.equal(report.providerSpendUsd, 0);
  assert.equal(report.steps.length, 13);
  assert.ok(calls.includes("list_execution_traces"));
  assert.ok(calls.includes("get_execution_trace"));
  assert.ok(!calls.includes("list_human_review_sessions"), "research tools are not part of the product surface");
  assert.ok(calls.includes("list_project_versions"));
  assert.ok(calls.includes("plan_edit"));
  assert.ok(calls.includes("simulate_transaction"));
  assert.ok(!calls.includes("commit_transaction"));
  assert.ok(!calls.some((name) => name.startsWith("start_") || name.startsWith("reserve_")));
});
