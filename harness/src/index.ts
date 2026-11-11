import harnessPackage from "../package.json" with { type: "json" };
import {
  ATTELIER_SESSION_SCHEMA_VERSION,
  type AgentRunProvenance,
} from "@attelier/agent-schema";
import { ATTELIER_CATALOG_VERSION } from "@attelier/capability-schema/product-catalog";
import { ATTELIER_CRAFT_GUIDE_VERSION } from "@attelier/capability-schema/craft-guide";
import {
  EFFECT_CATALOG,
  ATTELIER_EFFECT_CATALOG_VERSION,
  type EffectId,
} from "@attelier/capability-schema/effect-catalog";
import { ATTELIER_TOOL_CATALOG_VERSION } from "@atte/kit/tool-catalog";
import { ATTE_MCP_PROTOCOL_VERSION, ATTE_MCP_SERVER_VERSION } from "@atte/kit/mcp-contract";
import { CONNECTOR_CONTRACT_VERSION, SEARCH_PROJECT_MEDIA_CONNECTOR } from "./connectors.js";
import { ATTELIER_SKILLS, ATTELIER_SKILL_REGISTRY_VERSION } from "@atte/kit/skill-registry";
import { ATTELIER_USE_CASES, ATTELIER_USE_CASE_REGISTRY_VERSION } from "@atte/kit/use-case-registry";

export * from "@atte/kit/tool-catalog";
export {
  ATTE_STUDIO_SYSTEM_PROMPT,
  ATTE_CREATE_SYSTEM_PROMPT,
  atteCreateSystemPrompt,
  atteStudioSystemPromptForQualityProfile,
  type AtteTurnMode,
  ATTELIER_PLANNER_SYSTEM_PROMPT,
  ATTELIER_GENERATE_SYSTEM_PROMPT,
} from "@atte/kit/system-prompts";
export * from "@atte/kit/feature-registry";
export * from "@atte/kit/skill-registry";
export * from "@atte/kit/use-case-registry";
export * from "./source-edit.js";
export * from "./linked-edits.js";
export * from "./connectors.js";
export * from "./multicam.js";
export * from "./editor-tool-surface.js";
export * from "./tool-scheduler.js";
export * from "./postcondition-verifier.js";
export * from "./voice-led-timing.js";
export * from "./music-workflow.js";
export * from "./project-critic.js";
export * from "./project-transactions.js";
export * from "./project-transaction-coordinator.js";
export * from "./delivery-repair-policy.js";
export * from "./capability-recovery-coordinator.js";
export * from "./local-planner.js";

export const AGENT_HARNESS_SCHEMA_VERSION = 1 as const;
/** The package version, so provenance names the release that actually ran. */
export const ATTELIER_AGENT_HARNESS_VERSION: string = harnessPackage.version;
export const ATTELIER_MODEL_REGISTRY_VERSION = "2.0.0";
/** Re-exported from the kit so every Atte surface pins one MCP contract. */
export const ATTELIER_MCP_PROTOCOL_VERSION = ATTE_MCP_PROTOCOL_VERSION;
export const ATTELIER_MCP_SERVER_VERSION = ATTE_MCP_SERVER_VERSION;

export const ATTELIER_AGENT_HARNESS = {
  schemaVersion: AGENT_HARNESS_SCHEMA_VERSION,
  id: "atelier-agent",
  name: "atte",
  version: ATTELIER_AGENT_HARNESS_VERSION,
  sessionProtocolVersion: ATTELIER_SESSION_SCHEMA_VERSION,
  product: "Attelier",
  catalogVersion: ATTELIER_CATALOG_VERSION,
  craftGuideVersion: ATTELIER_CRAFT_GUIDE_VERSION,
  effectCatalogVersion: ATTELIER_EFFECT_CATALOG_VERSION,
  toolCatalogVersion: ATTELIER_TOOL_CATALOG_VERSION,
  connectorContractVersion: CONNECTOR_CONTRACT_VERSION,
  connectors: [SEARCH_PROJECT_MEDIA_CONNECTOR],
  skillRegistryVersion: ATTELIER_SKILL_REGISTRY_VERSION,
  useCaseRegistryVersion: ATTELIER_USE_CASE_REGISTRY_VERSION,
  planner: {
    id: "atelier-tool-planner",
    version: "1.2.0",
    promptVersion: "atelier-tool-planner.v22",
    runtimeContractVersion: "atelier-llm-runtime.v2",
    providerNeutral: true,
    activeProviderIds: ["openai"],
    deterministicFallback: {
      id: "atelier-deterministic-planner",
      version: "1.3.0",
    },
  },
  modelRegistryVersion: ATTELIER_MODEL_REGISTRY_VERSION,
  transport: {
    kind: "mcp",
    endpoint: "/mcp",
    protocolVersion: ATTELIER_MCP_PROTOCOL_VERSION,
    serverVersion: ATTELIER_MCP_SERVER_VERSION,
  },
  benchmark: {
    registryId: "atelier-benchmarks-v1",
    agentSuiteId: "atelier-agent-edit.v1",
  },
  executionPolicy: {
    inspectBeforeMutation: true,
    simulateBeforeCommit: true,
    explicitApprovalForSpend: true,
    idempotencyForAsyncMutation: true,
    preflightBeforeDestructiveOrPaidEffects: true,
    postconditionsAfterMaterialOperations: true,
    consentRevalidatedAtDelivery: true,
    independentConsentVerification: true,
  },
  skills: ATTELIER_SKILLS,
  useCases: ATTELIER_USE_CASES,
} as const;

export const ATTELIER_PLANNER_MODELS = {
  registryVersion: ATTELIER_MODEL_REGISTRY_VERSION,
  roles: {
    harnessPlanner: {
      default: {
        provider: "openai",
        id: "gpt-5.6-luna",
        version: "responses-api",
      },
      candidates: ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"],
      compatibility: "Attelier provider-neutral typed function calling",
      overridePolicy: "automatic-or-exact-provider-model-pin",
    },
    planner: {
      default: {
        provider: "openai",
        id: "gpt-4o-mini",
        version: "provider-managed",
      },
      compatibility: "Legacy OpenAI-compatible chat-completions tool calling",
      overridePolicy: "environment-or-user",
    },
    deterministicFallback: {
      default: {
        provider: "atelier",
        id: "deterministic-local",
        version: ATTELIER_AGENT_HARNESS.planner.deterministicFallback.version,
      },
      compatibility: "typed project operations",
      overridePolicy: "none",
    },
  },
} as const;

const baseRunContext = () => ({
  craftGuideVersion: ATTELIER_CRAFT_GUIDE_VERSION,
  effectCatalogVersion: ATTELIER_EFFECT_CATALOG_VERSION,
  toolCatalogVersion: ATTELIER_CATALOG_VERSION,
  tools: [{ id: "prompt", version: ATTELIER_CATALOG_VERSION }],
  skills: ATTELIER_SKILLS.filter(({ id }) => id === "video-craft").map(({ id, version }) => ({ id, version })),
  effects: [],
});

/** SemVer 2.0.0, including legitimate prerelease/build release provenance. */
const SEMVER_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export type PlannerToolCall = {
  name: string;
  arguments?: Record<string, unknown>;
};

const TOOL_CONTEXT: Record<string, { skills: string[]; effect?: EffectId }> = {
  trim_clip: { skills: ["edit-cutting"] },
  split_clip: { skills: ["edit-cutting"] },
  move_clip: { skills: ["edit-cutting"] },
  slip_clip: { skills: ["edit-cutting"] },
  roll_edit: { skills: ["edit-cutting"] },
  slide_clip: { skills: ["edit-cutting"] },
  ripple_trim_clip: { skills: ["edit-cutting"] },
  delete_clip: { skills: ["edit-cutting"] },
  set_property: { skills: ["pure-editing"] },
  set_keyframe: { skills: ["pure-editing", "motion-design"] },
  delete_keyframe: { skills: ["pure-editing", "motion-design"] },
  apply_region_blur: {
    skills: ["restoration", "pure-editing"],
    effect: "atelier.region.blur",
  },
  clear_region_mask: { skills: ["restoration", "pure-editing"] },
  create_multicam_cut: { skills: ["edit-cutting", "audio-mix", "pure-editing"] },
  set_speed: { skills: ["edit-cutting"], effect: "atelier.retime.speed" },
  add_title: { skills: ["typography"], effect: "atelier.text.readable-overlay" },
  place_asset: {
    skills: ["pure-editing", "audio-mix"],
    effect: "atelier.audio.professional-mix",
  },
  apply_transition: { skills: ["transitions"] },
  apply_split_edit: { skills: ["edit-cutting", "audio-mix"] },
  match_clip_color: {
    skills: ["color-finishing"],
    effect: "atelier.color.match-and-look",
  },
  apply_motion_treatment: { skills: ["motion-design"] },
  propose_motion_treatment: { skills: ["motion-design"] },
};

/** Bind the actual selected planner primitives, skills and effects to one run. */
export const enrichPlannerProvenance = (
  provenance: AgentRunProvenance,
  calls: readonly PlannerToolCall[],
  decisions: readonly string[] = [],
): AgentRunProvenance => {
  const toolIds = [...new Set(calls.map(({ name }) => name).filter(Boolean))];
  const skillIds = new Set(provenance.skills.map(({ id }) => id));
  const effectIds = new Set(provenance.effects.map(({ id }) => id));
  for (const call of calls) {
    const context = TOOL_CONTEXT[call.name];
    for (const skillId of context?.skills ?? []) skillIds.add(skillId);
    if (context?.effect) effectIds.add(context.effect);
    if (call.name === "apply_transition") {
      const kind = call.arguments?.kind;
      if (kind === "cross-dissolve")
        effectIds.add("atelier.transition.cross-dissolve");
      if (kind === "dip-to-black")
        effectIds.add("atelier.transition.dip-to-black");
      if (kind === "dip-to-white")
        effectIds.add("atelier.transition.dip-to-white");
    }
    if (
      call.name === "apply_motion_treatment" ||
      call.name === "propose_motion_treatment"
    ) {
      const kind = call.arguments?.kind;
      if (kind === "stabilization" || kind === "both")
        effectIds.add("atelier.motion.stabilization");
      if (kind === "motion-blur" || kind === "both")
        effectIds.add("atelier.motion.motion-blur");
    }
  }
  const skills = [...skillIds].map((id) => {
    const manifest = ATTELIER_SKILLS.find((candidate) => candidate.id === id);
    if (!manifest) throw new Error(`Planner referenced unknown skill ${id}.`);
    return { id, version: manifest.version };
  });
  const effects = [...effectIds].map((id) => {
    const contract = EFFECT_CATALOG.find(({ effectId }) => effectId === id);
    if (!contract) throw new Error(`Planner referenced unknown effect ${id}.`);
    return { id, version: contract.version };
  });
  return {
    ...provenance,
    tools: [
      ...provenance.tools,
      ...toolIds
        .filter(
          (id) => !provenance.tools.some((tool) => tool.id === `planner.${id}`),
        )
        .map((id) => ({ id: `planner.${id}`, version: "1.0.0" })),
    ],
    skills,
    effects,
    decisions: [
      ...provenance.decisions,
      ...(toolIds.length
        ? [`Selected planner primitives: ${toolIds.join(", ")}.`]
        : ["Planner selected no mutating primitive."]),
      ...decisions,
    ],
  };
};

export const deterministicPlannerProvenance = (): AgentRunProvenance => ({
  harnessId: ATTELIER_AGENT_HARNESS.id,
  harnessVersion: ATTELIER_AGENT_HARNESS.version,
  plannerId: ATTELIER_AGENT_HARNESS.planner.deterministicFallback.id,
  plannerVersion: ATTELIER_AGENT_HARNESS.planner.deterministicFallback.version,
  promptVersion: "deterministic-rules.v1",
  catalogVersion: ATTELIER_AGENT_HARNESS.catalogVersion,
  ...baseRunContext(),
  decisions: [
    "Use the deterministic planner for a typed project-operation request.",
  ],
  modelRegistryVersion: ATTELIER_MODEL_REGISTRY_VERSION,
  model: {
    provider: ATTELIER_PLANNER_MODELS.roles.deterministicFallback.default.provider,
    id: ATTELIER_PLANNER_MODELS.roles.deterministicFallback.default.id,
    version: ATTELIER_PLANNER_MODELS.roles.deterministicFallback.default.version,
  },
});

export const validateAgentHarness = (): string[] => {
  const issues: string[] = [];
  if (ATTELIER_AGENT_HARNESS.schemaVersion !== AGENT_HARNESS_SCHEMA_VERSION)
    issues.push("schema version drift");
  if (ATTELIER_AGENT_HARNESS.catalogVersion !== ATTELIER_CATALOG_VERSION)
    issues.push("catalog version drift");
  if (!SEMVER_VERSION.test(ATTELIER_AGENT_HARNESS.version))
    issues.push("harness version is not semver");
  if (!ATTELIER_AGENT_HARNESS.planner.promptVersion)
    issues.push("planner prompt is unversioned");
  if (!ATTELIER_AGENT_HARNESS.planner.providerNeutral || !ATTELIER_AGENT_HARNESS.planner.runtimeContractVersion)
    issues.push("planner LLM runtime contract is missing");
  const activeProviderIds: readonly string[] = ATTELIER_AGENT_HARNESS.planner.activeProviderIds;
  if (activeProviderIds.length === 0)
    issues.push("planner has no active LLM provider");
  if (!ATTELIER_AGENT_HARNESS.benchmark.registryId)
    issues.push("benchmark registry is missing");
  if (new Set(ATTELIER_SKILLS.map(({ id }) => id)).size !== ATTELIER_SKILLS.length)
    issues.push("skill registry contains duplicate ids");
  if (
    !ATTELIER_AGENT_HARNESS.craftGuideVersion ||
    !ATTELIER_AGENT_HARNESS.effectCatalogVersion
  )
    issues.push("craft/effect contracts are unversioned");
  const skillEffectIds = new Set(
    ATTELIER_SKILLS.flatMap(({ effects }) => effects.map(({ id }) => id)),
  );
  for (const effect of EFFECT_CATALOG) {
    if (!skillEffectIds.has(effect.effectId))
      issues.push(`${effect.effectId} is not owned by a versioned skill`);
  }
  for (const context of Object.values(TOOL_CONTEXT)) {
    if (
      context.effect &&
      !EFFECT_CATALOG.some(({ effectId }) => effectId === context.effect)
    ) {
      issues.push(`planner tool references unknown effect ${context.effect}`);
    }
  }
  return issues;
};
