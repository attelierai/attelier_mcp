import { deepStrictEqual, ok, strictEqual, throws } from "node:assert/strict";
import { test } from "node:test";
import {
  ATTE_PUBLIC_TOOLS,
  ATTE_PUBLIC_TOOL_NAMES,
  attePublicTool,
} from "./public-tools.js";
import { validatePublicArguments } from "./public-boundary.js";
import { toMcpTools } from "./tool-adapters.js";

test("the public surface is the exact golden path and every definition carries metadata", () => {
  deepStrictEqual(ATTE_PUBLIC_TOOL_NAMES, [
    "motion_source", "motion_render_source",
    "quote_capability_batch", "start_capability_batch", "get_capability_batch", "cancel_capability_batch",
    "delivery_pack", "render_review", "outcome_evidence",
    "read_series", "save_series", "plan_episodes", "make_episode",
    "list_models", "get_model", "get_usage", "list_inference_requests", "upload_inference", "quote_inference", "start_inference", "get_inference", "cancel_inference", "download_inference",
    "list_pipelines", "get_pipeline", "create_pipeline", "update_pipeline", "version_pipeline", "undo_pipeline", "pin_pipeline", "schedule_pipeline", "list_pipeline_runs", "cancel_workflow_run", "resume_workflow_run",
    "discover_atelier", "list_agent_skills", "get_agent_skill", "list_projects", "create_project", "set_brief", "get_brief", "import_media", "prepare_project", "inspect_project", "search_media", "get_asset_evidence",
    "analyze_asset", "inspect_visual", "project_budget", "project_preservation", "editorial_plan", "compile_edit", "simulate_transaction", "commit_transaction", "checkpoint_project", "render_frame",
    "render_range", "review_project", "generate_coverage", "localize_project", "quote_job", "start_job", "get_job",
    "list_voices", "fetch_image",
  ]);
  strictEqual(new Set(ATTE_PUBLIC_TOOL_NAMES).size, ATTE_PUBLIC_TOOLS.length);
  const importMedia = ATTE_PUBLIC_TOOLS.find(({ name }) => name === "import_media");
  strictEqual(importMedia?.audience, "public");
  strictEqual(importMedia?.category, "edit");
  strictEqual(importMedia?.scope, "write");
  strictEqual(attePublicTool("simulate_transaction")?.scope, "read");
  for (const tool of ATTE_PUBLIC_TOOLS) {
    ok(/^[a-z][a-z0-9_]{2,63}$/.test(tool.name), `${tool.name} is not a valid tool name`);
    ok(tool.description.length > 10, `${tool.name} has no usable description`);
    ok(tool.summary.length > 10, `${tool.name} has no summary`);
    strictEqual(tool.inputSchema.type, "object");
    strictEqual(tool.inputSchema.additionalProperties, false);
    strictEqual(tool.audience, "public");
    deepStrictEqual(tool.profiles, ["shared"]);
    ok(["discover", "read", "edit", "review", "render", "generate", "admin"].includes(tool.category));
    strictEqual(typeof tool.spends, "boolean");
  }
});

test("every scope is represented and read tools never mutate or spend", () => {
  for (const scope of ["read", "write", "spend"] as const) {
    ok(ATTE_PUBLIC_TOOLS.some((tool) => tool.scope === scope), `no ${scope} tool`);
  }
  const spend = ATTE_PUBLIC_TOOLS.filter(({ scope }) => scope === "spend").map(({ name }) => name);
  deepStrictEqual(spend, ["start_capability_batch", "cancel_capability_batch", "make_episode", "start_inference", "schedule_pipeline", "cancel_workflow_run", "resume_workflow_run", "inspect_visual", "generate_coverage", "localize_project", "start_job"]);
  deepStrictEqual(ATTE_PUBLIC_TOOLS.filter(({ spends }) => spends).map(({ name }) => name), ["start_capability_batch", "delivery_pack", "make_episode", "start_inference", "resume_workflow_run", "prepare_project", "analyze_asset", "inspect_visual", "review_project", "generate_coverage", "localize_project", "start_job"]);
});

test("review_project publicly accepts rhythm and bounded continuity checks", () => {
  const review = attePublicTool("review_project");
  ok(review);
  validatePublicArguments({ projectId: "project", level: "rhythm", rangeSeconds: [0, 30] }, review.inputSchema);
  validatePublicArguments({ projectId: "project", level: "frames", checks: ["eyeline", "jump"], rangeSeconds: [0, 30] }, review.inputSchema);
  throws(
    () => validatePublicArguments({ projectId: "project", level: "frames", checks: ["faces"] }, review.inputSchema),
    /must be one of: eyeline, jump/,
  );
});

test("new project and preparation tools validate the compact golden path", () => {
  const create = attePublicTool("create_project");
  const prepare = attePublicTool("prepare_project");
  const coverage = attePublicTool("generate_coverage");
  ok(create && prepare && coverage);
  validatePublicArguments({ name: "Mirror", frameRate: 24, width: 1920, height: 1080 }, create.inputSchema);
  validatePublicArguments({ projectId: "project", paths: ["/tmp/clip.mp4"], analyses: ["transcription", "description", "color", "shots"], place: true }, prepare.inputSchema);
  validatePublicArguments({ projectId: "project", assetId: "clip", analysis: "shots" }, attePublicTool("analyze_asset")!.inputSchema);
  validatePublicArguments({
    projectId: "project", fromElementId: "clip", atSeconds: 2, prompt: "Reaction", durationSeconds: 4,
    characterReferences: [{ elementId: "clip", atSeconds: 2.5 }],
  }, coverage.inputSchema);
});

test("localize_project validates its public camelCase contract and teaches unknown keys", () => {
  const localize = attePublicTool("localize_project");
  ok(localize);
  validatePublicArguments({ projectId: "project", expectedRevision: 7, targetLanguage: "es", scope: ["dialogue", "graphics"], voice: "clone" }, localize.inputSchema);
  validatePublicArguments({ projectId: "project", expectedRevision: 7, targetLanguage: "es", voice: "cast", cast: [{ speaker: "Frank", description: "mature warm male" }] }, localize.inputSchema);
  throws(
    () => validatePublicArguments({ projectId: "project", expectedRevision: 7, targetLanguage: "es", target_language: "es" }, localize.inputSchema),
    /valid keys.*projectId.*expectedRevision.*targetLanguage.*sourceLanguage.*scope.*voice.*cast.*dryRun/i,
  );
});

test("the MCP adapter emits the whole public catalog, filters by scope and rejects an unknown name", () => {
  deepStrictEqual(toMcpTools().map(({ name, inputSchema }) => ({ name, inputSchema })), ATTE_PUBLIC_TOOLS.map(({ name, inputSchema }) => ({ name, inputSchema })));
  const readOnly = toMcpTools({ scopes: ["read"] });
  ok(readOnly.every(({ name }) => attePublicTool(name)?.scope === "read"));
  throws(() => toMcpTools({ names: ["not_a_tool"] }), /not an Atte public tool/);
  throws(() => toMcpTools({ scopes: ["read"], names: ["start_job"] }), /not an Atte public tool/);
});
