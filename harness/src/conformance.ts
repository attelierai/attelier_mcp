import { EFFECT_CATALOG } from "@attelier/capability-schema/effect-catalog";
import { AUDIO_DELIVERY_PROFILES } from "@attelier/capability-schema/delivery-profiles";
import { ATTELIER_AGENT_HARNESS, ATTELIER_MCP_PROTOCOL_VERSION, ATTELIER_MCP_SERVER_VERSION } from "./index.js";
import type { AttelierMcpClient, McpTool } from "./mcp-client.js";

export const ATTELIER_AGENT_CONFORMANCE_VERSION = "1.7.0";

export const ATTELIER_AGENT_CONFORMANCE_TOOLS = [
  "discover_atelier",
  "get_craft_guide",
  "list_effects",
  "list_agent_skills",
  "get_agent_skill",
  "get_evaluation_spec",
  "route_creative_prompt",
  "inspect_project",
  "list_project_versions",
  "list_execution_traces",
  "get_execution_trace",
  "plan_edit",
  "simulate_transaction",
  "evaluate_project",
  "propose_color_correction",
  "propose_motion_treatment",
  "propose_subject_reframe",
  "evaluate_effect_parity",
  "quote_capability",
  "approve_capability_quote",
  "reserve_capability_quote",
  "start_capability_job",
  "get_capability_job",
  "cancel_capability_job",
  "quote_workflow",
  "approve_workflow_quote",
  "start_workflow_run",
  "get_workflow_run",
  "cancel_workflow_run",
  "quote_render",
  "approve_render_quote",
  "start_render_job",
  "get_render_job",
  "cancel_render_job",
] as const;

type ConformanceClient = Pick<AttelierMcpClient, "initialize" | "listTools" | "callTool">;

export type AttelierAgentConformanceStep = {
  id: string;
  status: "pass";
  evidence: Record<string, unknown>;
};

export type AttelierAgentConformanceReport = {
  conformanceVersion: string;
  harnessVersion: string;
  catalogVersion: string;
  mcpServerVersion: string;
  projectId: string;
  projectRevision: number;
  execution: "mcp-only";
  projectMutation: "none";
  providerSpendUsd: 0;
  passed: true;
  steps: AttelierAgentConformanceStep[];
};

const object = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} returned an invalid object.`);
  return value as Record<string, unknown>;
};

const array = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${label} returned an invalid array.`);
  return value;
};

const string = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value) throw new Error(`${label} returned an invalid string.`);
  return value;
};

const finiteNumber = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} returned an invalid number.`);
  return value;
};

const step = (id: string, evidence: Record<string, unknown>): AttelierAgentConformanceStep => ({ id, status: "pass", evidence });

const firstTimelineElementId = (project: Record<string, unknown>): string => {
  for (const sequenceValue of array(project.sequences, "inspect_project.sequences")) {
    const sequence = object(sequenceValue, "inspect_project.sequence");
    for (const trackValue of array(sequence.tracks, "inspect_project.sequence.tracks")) {
      const track = object(trackValue, "inspect_project.track");
      const candidate = array(track.elements, "inspect_project.track.elements")[0];
      if (candidate) return string(object(candidate, "inspect_project.element").id, "inspect_project.element.id");
    }
  }
  throw new Error("Agent conformance requires at least one timeline element to test planning and simulation.");
};

/**
 * Execute the public agent contract exclusively over MCP. The suite only reads,
 * plans and simulates: it never commits a project mutation or starts paid work.
 */
export const runAttelierAgentConformance = async (
  client: ConformanceClient,
  projectId: string,
): Promise<AttelierAgentConformanceReport> => {
  if (!projectId.trim()) throw new Error("A project id is required for agent conformance.");
  const steps: AttelierAgentConformanceStep[] = [];

  const initialized = await client.initialize();
  if (initialized.protocolVersion !== ATTELIER_MCP_PROTOCOL_VERSION) throw new Error("MCP protocol version drift.");
  if (initialized.serverInfo.version !== ATTELIER_MCP_SERVER_VERSION) throw new Error("MCP server version drift.");
  steps.push(step("transport", { protocolVersion: initialized.protocolVersion, serverVersion: initialized.serverInfo.version }));

  const tools: McpTool[] = await client.listTools();
  const names = new Set(tools.map(({ name }) => name));
  const missingTools = ATTELIER_AGENT_CONFORMANCE_TOOLS.filter((name) => !names.has(name));
  if (missingTools.length > 0) throw new Error(`MCP is missing conformance tools: ${missingTools.join(", ")}.`);
  steps.push(step("tool-discovery", { toolCount: tools.length, requiredToolCount: ATTELIER_AGENT_CONFORMANCE_TOOLS.length }));

  const discovery = object(await client.callTool("discover_atelier", {}), "discover_atelier");
  if (discovery.catalogVersion !== ATTELIER_AGENT_HARNESS.catalogVersion) throw new Error("Catalog version drift between harness and MCP.");
  const remoteHarness = object(discovery.agentHarness, "discover_atelier.agentHarness");
  if (remoteHarness.version !== ATTELIER_AGENT_HARNESS.version) throw new Error("Harness version drift between CLI and MCP.");
  const audioDelivery = object(discovery.audioDelivery, "discover_atelier.audioDelivery");
  const audioProfiles = array(audioDelivery.profiles, "discover_atelier.audioDelivery.profiles")
    .map((value) => string(object(value, "discover_atelier.audioDelivery.profile").id, "discover_atelier.audioDelivery.profile.id"));
  const missingAudioProfiles = Object.keys(AUDIO_DELIVERY_PROFILES).filter((id) => !audioProfiles.includes(id));
  if (missingAudioProfiles.length > 0) throw new Error(`MCP is missing audio delivery profiles: ${missingAudioProfiles.join(", ")}.`);
  steps.push(step("product-discovery", {
    catalogVersion: discovery.catalogVersion,
    useCases: array(discovery.useCases, "discover_atelier.useCases").length,
    capabilities: array(discovery.capabilities, "discover_atelier.capabilities").length,
    audioProfiles: audioProfiles.length,
  }));

  const craft = object(await client.callTool("get_craft_guide", {}), "get_craft_guide");
  const effects = object(await client.callTool("list_effects", {}), "list_effects");
  const skills = object(await client.callTool("list_agent_skills", {}), "list_agent_skills");
  const effectIds = array(effects.effects, "list_effects.effects")
    .map((value) => string(object(value, "list_effects.effect").effectId, "list_effects.effect.effectId"));
  const missingEffects = EFFECT_CATALOG.map(({ effectId }) => effectId).filter((effectId) => !effectIds.includes(effectId));
  if (missingEffects.length > 0) throw new Error(`MCP is missing effect contracts: ${missingEffects.join(", ")}.`);
  const skillManifests = array(skills.skills, "list_agent_skills.skills");
  const foundation = skillManifests
    .map((value) => object(value, "list_agent_skills.skill"))
    .find(({ id }) => id === "video-craft");
  if (!foundation) throw new Error("MCP is missing the video-craft foundation skill.");
  const loadedSkill = object(await client.callTool("get_agent_skill", { skillId: "video-craft" }), "get_agent_skill");
  if (loadedSkill.id !== "video-craft") throw new Error("Progressive skill loading returned the wrong skill.");
  steps.push(step("craft-contracts", {
    craftVersion: craft.version,
    rules: array(craft.rules, "get_craft_guide.rules").length,
    effects: effectIds.length,
    skills: skillManifests.length,
  }));

  const project = object(await client.callTool("inspect_project", { projectId }), "inspect_project");
  if (project.id !== projectId) throw new Error("inspect_project returned a different project.");
  const projectRevision = finiteNumber(project.revision, "inspect_project.revision");
  const elementId = firstTimelineElementId(project);
  steps.push(step("project-inspection", { projectId, projectRevision, selectedElementId: elementId }));

  const history = object(await client.callTool("list_project_versions", { projectId }), "list_project_versions");
  if (history.projectId !== projectId || history.currentRevision !== projectRevision) {
    throw new Error("Project history does not match the inspected project revision.");
  }
  steps.push(step("project-history", {
    currentRevision: history.currentRevision,
    checkpointCount: array(history.versions, "list_project_versions.versions").length,
  }));

  const routed = object(await client.callTool("route_creative_prompt", {
    prompt: "Create a 9:16 campaign video with captions and music",
  }), "route_creative_prompt");
  const routedPlan = object(routed.plan, "route_creative_prompt.plan");
  if (routedPlan.routerVersion !== "1.0.0") throw new Error("Creative router version drift.");
  steps.push(step("creative-routing", { routerVersion: routedPlan.routerVersion, resolutionId: routedPlan.resolutionId }));

  const planned = object(await client.callTool("plan_edit", {
    projectId,
    prompt: "opacity 0.5",
    selection: { elementId },
  }), "plan_edit");
  if (planned.baseRevision !== projectRevision) throw new Error("Planner did not pin the inspected project revision.");
  const transaction = object(planned.transaction, "plan_edit.transaction");
  const operations = array(transaction.operations, "plan_edit.transaction.operations");
  if (operations.length !== 1) throw new Error("Deterministic conformance edit must contain exactly one operation.");
  const operation = object(operations[0], "plan_edit.transaction.operation");
  if (operation.type !== "setProperty" || operation.elementId !== elementId || operation.path !== "transform.opacity" || operation.value !== 0.5) {
    throw new Error("Deterministic planner produced an unexpected opacity operation.");
  }
  const provenance = object(planned.provenance, "plan_edit.provenance");
  if (provenance.harnessVersion !== ATTELIER_AGENT_HARNESS.version) throw new Error("Planner provenance does not pin the active harness.");
  steps.push(step("deterministic-planning", { baseRevision: planned.baseRevision, operationType: operation.type, provider: planned.provider }));

  const traceId = string(planned.traceId, "plan_edit.traceId");
  const traces = array(await client.callTool("list_execution_traces", { projectId, limit: 5 }), "list_execution_traces");
  if (!traces.some((value) => object(value, "list_execution_traces.trace").id === traceId)) {
    throw new Error("The plan execution trace was not discoverable by project.");
  }
  const trace = object(await client.callTool("get_execution_trace", { traceId }), "get_execution_trace");
  const serializedTrace = JSON.stringify(trace);
  if (/"(?:authorization|cookie|secret|password|apiKey|accessToken|refreshToken|token|prompt|script|content|email|input|output|text)"\s*:/i.test(serializedTrace)) {
    throw new Error("Execution-trace detail exposed a sensitive field.");
  }
  steps.push(step("execution-observability", {
    traceCount: traces.length,
    eventCount: array(trace.events, "get_execution_trace.events").length,
    sensitiveFields: "none",
  }));

  const simulation = object(await client.callTool("simulate_transaction", { projectId, transaction }), "simulate_transaction");
  if (simulation.revision !== projectRevision + 1) throw new Error("Simulation did not advance exactly one revision.");
  if (simulation.alreadyApplied !== false) throw new Error("Fresh conformance simulation was unexpectedly already applied.");
  steps.push(step("transaction-simulation", { revision: simulation.revision, affectedScopes: array(simulation.affectedScopes, "simulate_transaction.affectedScopes").length }));

  const quality = object(await client.callTool("evaluate_project", { projectId, profile: "general-video-v1" }), "evaluate_project");
  if (typeof quality.passedGates !== "boolean") throw new Error("Project evaluation did not return gate status.");
  steps.push(step("objective-evaluation", { profile: quality.profile, score: quality.score, passedGates: quality.passedGates }));

  const intentKey = "atelier.transition.cross-dissolve@1:{\"durationSeconds\":0.5}";
  const parity = object(await client.callTool("evaluate_effect_parity", {
    effectId: "atelier.transition.cross-dissolve",
    effectVersion: 1,
    preview: { intentKey, signals: { envelopeOpacity: 0.5, timingFrames: 15 } },
    render: { intentKey, signals: { envelopeOpacity: 0.5, timingFrames: 15 } },
  }), "evaluate_effect_parity");
  if (parity.status !== "pass") throw new Error("Effect parity evaluator rejected matching evidence.");
  steps.push(step("effect-parity", { effectId: parity.effectId, status: parity.status }));

  const rubric = object(await client.callTool("get_evaluation_spec", { specId: "product-ad-rubric.v1" }), "get_evaluation_spec");
  if (!rubric.rubric) throw new Error("The evaluation rubric is missing.");
  steps.push(step("evaluation-spec", { specId: "product-ad-rubric.v1" }));

  return {
    conformanceVersion: ATTELIER_AGENT_CONFORMANCE_VERSION,
    harnessVersion: ATTELIER_AGENT_HARNESS.version,
    catalogVersion: ATTELIER_AGENT_HARNESS.catalogVersion,
    mcpServerVersion: ATTELIER_MCP_SERVER_VERSION,
    projectId,
    projectRevision,
    execution: "mcp-only",
    projectMutation: "none",
    providerSpendUsd: 0,
    passed: true,
    steps,
  };
};
