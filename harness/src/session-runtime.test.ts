import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { CapabilityJob, CapabilityQuote, CapabilityReservation } from "@attelier/capability-schema";
import type { AttelierProjectPlan } from "@attelier/agent-schema";
import { AttelierHeadlessSession, sanitizeSessionJson, type AttelierHarnessToolClient } from "./session-runtime.js";
import { AttelierSessionStore } from "./session-store.js";

class FakeTools implements AttelierHarnessToolClient {
  readonly calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  private polls = 0;
  private renderPolls = 0;
  private analysisPolls = 0;
  private analysisCapability: "transcribe" | "analyze_audio" | "identify_music" | "reconstruct_video" = "transcribe";
  private analysisAssetId = "asset-1";
  private currentRevision = 5;
  private currentPlan: AttelierProjectPlan = {
    schemaVersion: 1,
    projectId: "project-1",
    version: 0,
    beats: [],
    updatedAt: null,
    updatedBy: null,
  };

  async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    this.calls.push({ name, args });
    if (name === "plan_edit") return {
      id: "plan-1",
      baseRevision: 4,
      summary: "Set Headline opacity to 0.5.",
      transaction: {
        id: "transaction-1",
        baseRevision: 4,
        idempotencyKey: "transaction-key-1",
        source: "agent",
        authorId: "atelier",
        goal: "opacity 0.5",
        preconditions: [],
        operations: [{ type: "setProperty", elementId: "headline", path: "transform.opacity", value: 0.5 }],
      },
    } as T;
    if (name === "simulate_transaction") return { revision: 5, alreadyApplied: false } as T;
    if (name === "commit_transaction") return { revision: 5, transactionId: "transaction-1" } as T;
    if (name === "list_project_versions") return {
      projectId: "project-1",
      currentRevision: this.currentRevision,
      versions: [],
    } as T;
    if (name === "compare_project_versions") return { ...args, elements: { added: [], removed: [], changed: ["headline"] } } as T;
    if (name === "restore_project_version") {
      this.currentRevision = Number(args.expectedCurrentRevision) + 1;
      return { revision: this.currentRevision, restoredFromRevision: args.targetRevision } as T;
    }
    if (name === "create_project_version") return {
      id: "version-1",
      projectId: "project-1",
      revision: args.expectedCurrentRevision,
      name: args.name,
      createdBy: "atelier",
      createdAt: 3,
    } as T;
    if (name === "get_project_plan") return this.currentPlan as T;
    if (name === "update_project_plan") {
      const patch = args.patch as Record<string, unknown>;
      this.currentPlan = {
        ...this.currentPlan,
        ...patch,
        version: this.currentPlan.version + 1,
        updatedAt: 4,
        updatedBy: "harness",
      } as AttelierProjectPlan;
      return this.currentPlan as T;
    }
    if (name === "quote_capability") return {
      id: "quote-1",
      capability: "basic_video_generation",
      providerId: "video-generation-policy-fixture-v2",
      provider: "fixture",
      model: "fixture-v2",
      modelVersion: "2",
      runtime: "api",
      stability: "experimental",
      rightsPolicy: "fixture",
      dataPolicy: "fixture",
      currency: "USD",
      amount: 0.12,
      credits: 12,
      reservationRequired: true,
      approvalRequired: true,
      status: "quoted",
      routingExplanation: "Selected the test fixture.",
      expiresAt: 9_999,
      createdAt: 1,
    } satisfies CapabilityQuote as T;
    if (name === "approve_capability_quote") return {
      id: "quote-1",
      capability: "basic_video_generation",
      providerId: "video-generation-policy-fixture-v2",
      provider: "fixture",
      model: "fixture-v2",
      modelVersion: "2",
      runtime: "api",
      stability: "experimental",
      rightsPolicy: "fixture",
      dataPolicy: "fixture",
      currency: "USD",
      amount: 0.12,
      credits: 12,
      reservationRequired: true,
      approvalRequired: true,
      approvedAt: 2,
      status: "quoted",
      routingExplanation: "Selected the test fixture.",
      expiresAt: 9_999,
      createdAt: 1,
    } satisfies CapabilityQuote as T;
    if (name === "reserve_capability_quote") return {
      id: "reservation-1",
      quoteId: "quote-1",
      currency: "USD",
      amount: 0.12,
      status: "reserved",
      createdAt: 2,
    } satisfies CapabilityReservation as T;
    if (name === "start_capability_job") return this.job("queued", 0) as T;
    if (name === "get_capability_job") {
      this.polls += 1;
      return this.polls === 1 ? this.job("running", 0.5) as T : this.job("complete", 1) as T;
    }
    if (name === "inspect_project") return { id: "project-1", revision: 3, title: "Fixture", format: { width: 1920, height: 1080 }, sequences: [] } as T;
    if (name === "get_craft_guide") return { version: "fixture-craft-v1", rules: [{ id: "craft.test", intent: "test" }] } as T;
    if (name === "list_effects") return { version: "fixture-effects-v1", effects: [{ effectId: "fixture.effect", version: 1 }] } as T;
    if (name === "get_brand_kit") return { version: 2, name: "Fixture brand", colors: ["#111111"], fonts: ["Inter"], logoAssetIds: [], captionStyle: "clean", glossary: {}, rules: ["No duplicate captions"] } as T;
    if (name === "list_project_elements") return [{ id: "element-product", projectId: "project-1", kind: "product", name: "Hero shoe", projectAssetId: "product-image", createdAt: 1, updatedAt: 2 }] as T;
    if (name === "upsert_project_element") return { id: "element-location", projectId: "project-1", ...(args.element as Record<string, unknown>), createdAt: 3, updatedAt: 3 } as T;
    if (name === "start_analysis_job") {
      this.analysisCapability = args.capability as typeof this.analysisCapability;
      this.analysisAssetId = String(args.assetId);
      return { id: "analysis-1", projectId: "project-1", assetId: args.assetId, capability: args.capability, status: "queued", progress: 0, updatedAt: 1 } as T;
    }
    if (name === "get_analysis_job") {
      this.analysisPolls += 1;
      return { id: "analysis-1", projectId: "project-1", assetId: this.analysisAssetId, capability: this.analysisCapability, status: "complete", progress: 1, artifactId: "artifact-1", updatedAt: 2 } as T;
    }
    if (name === "get_transcript") return { artifactId: "artifact-1", text: "hello" } as T;
    if (name === "get_video_reconstruction") return {
      schemaVersion: "atelier.video-reconstruction.v1",
      id: "reconstruction-1",
      version: 1,
      projectId: "project-1",
      assetId: this.analysisAssetId,
      provider: "ffmpeg-scene-detect-local",
      model: "scene-boundary-v2",
      createdAt: 2,
      source: { duration: "240000", width: 1920, height: 1080, frameRate: 30, hasEmbeddedAudio: true },
      shots: [
        { id: "shot-1", index: 0, sourceRange: { start: "0", duration: "120000" }, boundaryBefore: { kind: "source-start", confidence: 1 } },
        { id: "shot-2", index: 1, sourceRange: { start: "120000", duration: "120000" }, boundaryBefore: { kind: "hard-cut", confidence: 0.8 } },
      ],
      recoverability: {
        cuts: "measured",
        sourceAudio: "embedded-source-preserved",
        textLayers: "not-recovered",
        originalAssets: "not-recovered",
        effects: "not-recovered",
      },
      limitations: [],
    } as T;
    if (name === "create_upload") return { id: "upload-1", status: "uploading", nextOffset: 0, chunkSize: 3 } as T;
    if (name === "upload_chunk") return {
      nextOffset: Number(args.offset) + Buffer.from(String(args.base64), "base64").byteLength,
    } as T;
    if (name === "complete_upload") return { id: "upload-1", status: "complete", contentHash: "sha256:fixture" } as T;
    if (name === "create_workspace_asset_from_upload") return { id: "workspace-asset-1", name: args.name } as T;
    if (name === "prepare_workspace_asset_import") return {
      projectId: "project-1",
      projectAssetId: "library:workspace-asset-1",
      transaction: {
        id: "import-transaction-1",
        baseRevision: args.expectedCurrentRevision,
        idempotencyKey: "import-key-1",
        source: "agent",
        authorId: "atelier",
        goal: "Import fixture",
        preconditions: [],
        operations: [],
      },
    } as T;
    if (name === "prepare_project_asset_placement") return {
      projectId: "project-1",
      trackId: "video-1",
      createdTrack: true,
      element: { id: "element-placed-1", assetId: args.assetId },
      transaction: {
        id: "placement-transaction-1",
        baseRevision: args.expectedCurrentRevision,
        idempotencyKey: "placement-key-1",
        source: "agent",
        authorId: "atelier",
        goal: "Place fixture",
        preconditions: [],
        operations: [],
      },
    } as T;
    if (name === "quote_render") return { id: "render-quote-1", projectId: "project-1", revision: 5, format: args.format, currency: "USD", estimatedCostUsd: 0, estimatedRuntimeMs: 10, costBasis: "fixture", approvalRequired: false, expiresAt: 9_999 } as T;
    if (name === "start_render_job") return { id: "render-1", projectId: "project-1", revision: 5, format: "mp4", status: "queued", progress: 0, updatedAt: 1 } as T;
    if (name === "get_render_job") {
      this.renderPolls += 1;
      return { id: "render-1", projectId: "project-1", revision: 5, format: "mp4", status: "complete", progress: 1, updatedAt: 2, outputUrl: "/render-1.mp4" } as T;
    }
    if (name === "evaluate_render") return { passed: true, profile: args.profile } as T;
    if (name === "cancel_render_job") return { id: args.jobId, projectId: "project-1", revision: 5, format: "mp4", status: "cancelled", progress: 0.25, updatedAt: 3 } as T;
    if (name === "list_workflow_runs") return [{
      id: "workflow-1", kind: "product_ad", projectId: "project-1", state: "failed", currentStageId: "generate",
      estimatedCostUsd: 0.5, actualCostUsd: 0.2, error: "interrupted", updatedAt: 3,
    }] as T;
    if (name === "get_workflow_run") return {
      id: args.runId, kind: "product_ad", projectId: "project-1", state: "failed", currentStageId: "generate",
      estimatedCostUsd: 0.5, actualCostUsd: 0.2, error: "interrupted", updatedAt: 3,
    } as T;
    if (name === "resume_workflow_run") return {
      id: args.runId, kind: "product_ad", projectId: "project-1", state: "running", currentStageId: "generate",
      estimatedCostUsd: 0.5, actualCostUsd: 0.2, updatedAt: 4,
    } as T;
    if (name === "cancel_workflow_run") return {
      id: args.runId, kind: "product_ad", projectId: "project-1", state: "cancelled", currentStageId: "generate",
      estimatedCostUsd: 0.5, actualCostUsd: 0.2, updatedAt: 5,
    } as T;
    throw new Error(`Unexpected fake tool ${name}.`);
  }

  protected job(
    status: CapabilityJob["status"],
    progress: number,
    pricingStatus: CapabilityJob["pricing"]["status"] = status === "complete" ? "actual" : "reserved",
  ): CapabilityJob {
    return {
      id: "job-1",
      projectId: "project-1",
      capability: "basic_video_generation",
      providerId: "video-generation-policy-fixture-v2",
      quoteId: "quote-1",
      reservationId: "reservation-1",
      estimatedCredits: 12,
      status,
      lifecycleStatus: status === "complete" ? "succeeded" : status,
      progress,
      estimatedCost: 0.12,
      ...(status === "complete"
        ? { actualCost: 0.08, output: { assetId: "asset-1" } }
        : pricingStatus === "pending_reconciliation"
          ? { actualCost: 0.12 }
          : {}),
      attempt: 1,
      maxAttempts: 1,
      retryHistory: [],
      input: { projectId: "project-1", prompt: "orbit" },
      lifecycle: {
        queuedAt: 1,
        ...(status !== "queued" ? { startedAt: 2 } : {}),
        ...(status === "complete" ? { completedAt: 3 } : {}),
        elapsedMs: status === "queued" ? 0 : status === "complete" ? 2 : 1,
      },
      pricing: {
        quotedUsd: 0.12,
        ...(status === "complete" ? { actualUsd: 0.08 } : pricingStatus === "pending_reconciliation" ? { actualUsd: 0.12 } : {}),
        status: pricingStatus,
      },
      createdAt: 1,
      updatedAt: 3,
    };
  }
}

class ReconstructionTools extends FakeTools {
  override async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    if (name !== "inspect_project") return super.callTool(name, args);
    this.calls.push({ name, args });
    return {
      schemaVersion: 3,
      id: "project-1",
      name: "Fixture",
      revision: 3,
      activeSequenceId: "sequence-1",
      assets: [{
        id: "asset-1",
        name: "Flattened source",
        mediaType: "video",
        role: "original",
        mimeType: "video/mp4",
        duration: "240000",
        width: 1920,
        height: 1080,
        storage: [],
        provenance: {
          origin: "uploaded",
          settings: {},
          rights: { license: "fixture", publishable: false },
          createdAt: 1,
        },
      }],
      sequences: [{
        id: "sequence-1",
        name: "Main",
        canvas: { width: 1920, height: 1080 },
        frameRate: { numerator: 30, denominator: 1 },
        tracks: [{ id: "video-1", name: "Video", kind: "video", order: 0, locked: false, muted: false, hidden: false, elements: [] }],
      }],
      appliedTransactionIds: [],
    } as T;
  }
}

class TimeoutTools extends FakeTools {
  private progress = 0.1;

  override async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    if (name === "get_capability_job") {
      this.calls.push({ name, args });
      this.progress += 0.2;
      return this.job("running", this.progress) as T;
    }
    if (name === "cancel_capability_job") {
      this.calls.push({ name, args });
      return this.job("cancelled", this.progress, "pending_reconciliation") as T;
    }
    return super.callTool(name, args);
  }
}

class CompletePendingTools extends FakeTools {
  override async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    if (name === "get_capability_job") {
      this.calls.push({ name, args });
      return this.job("complete", 1, "pending_reconciliation") as T;
    }
    return super.callTool(name, args);
  }
}

class DroppedStartResponseTools extends FakeTools {
  private dropped = false;

  override async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    if (name === "start_capability_job" && !this.dropped) {
      this.calls.push({ name, args });
      this.dropped = true;
      throw new Error("start response dropped");
    }
    return super.callTool(name, args);
  }
}

test("headless runtime plans, simulates and commits one deterministic edit", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-runtime-edit-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const session = await store.create({ projectId: "project-1" });
  const tools = new FakeTools();
  const runtime = new AttelierHeadlessSession({ sessionId: session.id, store, client: tools });

  const result = await runtime.planEdit({ prompt: "opacity 0.5", selection: { elementId: "headline" }, commit: true });

  assert.equal(result.committedRevision, 5);
  assert.equal(result.projection.projectRevision, 5);
  assert.equal(result.projection.pendingPlan, null);
  assert.deepEqual(tools.calls.map(({ name }) => name), ["plan_edit", "simulate_transaction", "commit_transaction"]);
  const events = await store.read(session.id);
  assert.ok(events.some(({ type }) => type === "plan.updated"));
  assert.ok(events.some(({ type }) => type === "project.revision.created"));
  assert.equal(result.projection.usage.actualAmount, 0);
});

test("headless runtime records quote, user approval, reservation, progress and actual usage", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-runtime-generation-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const session = await store.create({ projectId: "project-1" });
  const tools = new FakeTools();
  const runtime = new AttelierHeadlessSession({
    sessionId: session.id,
    store,
    client: tools,
    sleep: async () => undefined,
  });
  const statuses: string[] = [];

  const result = await runtime.runCapability({
    capability: "basic_video_generation",
    input: { projectId: "project-1", prompt: "orbit" },
    approve: async () => true,
    onProgress: ({ status }) => statuses.push(status),
    pollIntervalMs: 0,
  });

  assert.equal(result.approved, true);
  assert.equal(result.job?.status, "complete");
  assert.deepEqual(statuses, ["queued", "running", "complete"]);
  const projection = await runtime.projection();
  assert.equal(projection.usage.quotedAmount, 0.12);
  assert.equal(projection.usage.reservedAmount, 0);
  assert.equal(projection.usage.actualAmount, 0.08);
  const events = await store.read(session.id);
  assert.ok(events.some((event) => event.type === "approval.resolved" && event.data.decision === "approved"));
  assert.ok(events.some(({ type }) => type === "spend.settled"));
  assert.ok(events.some(({ type }) => type === "usage.recorded"));
});

test("locking AI while creator approval is pending wins before reservation or provider start", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-runtime-lock-during-approval-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const session = await store.create({ projectId: "project-1" });
  const tools = new FakeTools();
  const runtime = new AttelierHeadlessSession({ sessionId: session.id, store, client: tools });

  await assert.rejects(() => runtime.runCapability({
    capability: "basic_video_generation",
    input: { projectId: "project-1", prompt: "orbit" },
    approve: async () => {
      await runtime.changeAiLock(true);
      return true;
    },
  }), /locked to editing-only mode/i);

  assert.deepEqual(tools.calls.map(({ name }) => name), ["quote_capability"]);
  const projection = await runtime.projection();
  assert.equal(projection.aiLocked, true);
  assert.equal(projection.usage.reservedAmount, 0);
  assert.equal(projection.usage.actualAmount, 0);
});

test("stateless UI prepare and continue use one durable harness-owned capability run", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-runtime-prepared-generation-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const session = await store.create({ projectId: "project-1" });
  const tools = new FakeTools();
  const runtime = new AttelierHeadlessSession({ sessionId: session.id, store, client: tools, sleep: async () => undefined });
  const request = {
    capability: "basic_video_generation",
    input: { projectId: "project-1", prompt: "orbit" },
    runId: "studio-operation-1",
    idempotencyKey: "studio-capability-operation-1",
  };

  const prepared = await runtime.prepareCapability(request);
  const replayed = await runtime.prepareCapability(request);
  assert.equal(prepared.runId, request.runId);
  assert.equal(replayed.quote.id, prepared.quote.id);
  assert.equal(tools.calls.filter(({ name }) => name === "quote_capability").length, 1);
  assert.deepEqual(tools.calls[0]?.args.input, {
    projectId: "project-1",
    prompt: "orbit",
    routingTier: "final",
  });

  const queued = await runtime.continueCapability({ runId: request.runId, approved: true, actor: "user" });
  const running = await runtime.continueCapability({ runId: request.runId });
  const completed = await runtime.continueCapability({ runId: request.runId });

  assert.equal(queued.job?.status, "queued");
  assert.equal(running.job?.status, "running");
  assert.equal(completed.job?.status, "complete");
  assert.equal(tools.calls.filter(({ name }) => name === "reserve_capability_quote").length, 1);
  assert.equal(tools.calls.filter(({ name }) => name === "start_capability_job").length, 1);
  assert.equal(completed.projection.usage.actualAmount, 0.08);
});

test("prepared capability decline is durable and never reaches provider execution", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-runtime-prepared-decline-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const session = await store.create({ projectId: "project-1" });
  const tools = new FakeTools();
  const runtime = new AttelierHeadlessSession({ sessionId: session.id, store, client: tools });
  await runtime.prepareCapability({
    capability: "basic_video_generation",
    input: { projectId: "project-1", prompt: "orbit" },
    runId: "studio-decline-1",
    idempotencyKey: "studio-capability-decline-1",
  });

  const declined = await runtime.continueCapability({ runId: "studio-decline-1", approved: false, actor: "user" });
  const replayed = await runtime.continueCapability({ runId: "studio-decline-1", approved: false, actor: "user" });

  assert.equal(declined.reason, "declined");
  assert.equal(replayed.reason, "declined");
  assert.deepEqual(tools.calls.map(({ name }) => name), ["quote_capability"]);
});

test("process-death recovery replays an approved start idempotently and settles it once", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-runtime-recovery-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const session = await store.create({ projectId: "project-1" });
  await store.append(session.id, { type: "run.started", data: { runId: "crashed-run", kind: "capability", summary: "Generate video" } });
  await store.append(session.id, {
    type: "capability.requested",
    data: {
      runId: "crashed-run",
      capability: "basic_video_generation",
      input: { projectId: "project-1", prompt: "orbit", routingTier: "final" },
      idempotencyKey: "atelier-session-crashed-run",
    },
  });
  await store.append(session.id, {
    type: "capability.quoted",
    data: {
      runId: "crashed-run",
      quoteId: "quote-1",
      capability: "basic_video_generation",
      providerId: "video-generation-policy-fixture-v2",
      model: "fixture-v2",
      currency: "USD",
      amount: 0.12,
      approvalRequired: true,
      reservationRequired: true,
    },
  });
  await store.append(session.id, {
    type: "approval.resolved",
    data: { runId: "crashed-run", quoteId: "quote-1", decision: "approved", actor: "user" },
  });
  const tools = new FakeTools();
  const runtime = new AttelierHeadlessSession({ sessionId: session.id, store, client: tools, sleep: async () => undefined });

  const queued = await runtime.recoverCapabilityJobs();
  const running = await runtime.recoverCapabilityJobs();
  const completed = await runtime.recoverCapabilityJobs();
  const replay = await runtime.recoverCapabilityJobs();

  assert.equal(queued.jobs[0]?.status, "queued");
  assert.equal(running.jobs[0]?.status, "running");
  assert.equal(completed.jobs[0]?.status, "complete");
  assert.deepEqual(replay.jobs, []);
  assert.deepEqual(completed.issues, []);
  assert.equal(tools.calls.filter(({ name }) => name === "approve_capability_quote").length, 1);
  assert.equal(tools.calls.filter(({ name }) => name === "reserve_capability_quote").length, 1);
  assert.equal(tools.calls.filter(({ name }) => name === "start_capability_job").length, 1);
  const projection = await runtime.projection();
  assert.equal(projection.capabilityJobs[0]?.status, "complete");
  assert.equal(projection.usage.reservedAmount, 0);
  assert.equal(projection.usage.actualAmount, 0.08);
  const events = await store.read(session.id);
  assert.equal(events.filter(({ eventId }) => eventId === "spend-close:crashed-run:reservation-1").length, 1);
  assert.equal(events.filter(({ eventId }) => eventId === "usage:crashed-run:job-1").length, 1);
  assert.equal(events.filter(({ eventId }) => eventId === "capability-run:crashed-run:job-1:complete").length, 1);
});

test("editing-only lock prevents recovery from reserving or starting an approved capability", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-runtime-locked-recovery-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const session = await store.create({ projectId: "project-1" });
  await store.append(session.id, { type: "run.started", data: { runId: "approved-run", kind: "capability", summary: "Generate video" } });
  await store.append(session.id, {
    type: "capability.requested",
    data: {
      runId: "approved-run",
      capability: "basic_video_generation",
      input: { projectId: "project-1", prompt: "orbit" },
      idempotencyKey: "atelier-session-approved-run",
    },
  });
  await store.append(session.id, {
    type: "capability.quoted",
    data: {
      runId: "approved-run",
      quoteId: "quote-1",
      capability: "basic_video_generation",
      providerId: "video-generation-policy-fixture-v2",
      model: "fixture-v2",
      currency: "USD",
      amount: 0.12,
      approvalRequired: true,
      reservationRequired: true,
    },
  });
  await store.append(session.id, {
    type: "approval.resolved",
    data: { runId: "approved-run", quoteId: "quote-1", decision: "approved", actor: "user" },
  });
  const tools = new FakeTools();
  const runtime = new AttelierHeadlessSession({ sessionId: session.id, store, client: tools });
  await runtime.changeAiLock(true);

  await assert.rejects(() => runtime.recoverCapabilityJobs(), /locked to editing-only mode/i);
  assert.deepEqual(tools.calls, []);
  const projection = await runtime.projection();
  assert.equal(projection.usage.reservedAmount, 0);
  assert.equal(projection.usage.actualAmount, 0);
});

test("an ambiguous start response stays resumable and replays the exact idempotency key", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-runtime-dropped-start-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const session = await store.create({ projectId: "project-1" });
  const tools = new DroppedStartResponseTools();
  const runtime = new AttelierHeadlessSession({ sessionId: session.id, store, client: tools, sleep: async () => undefined });

  await assert.rejects(() => runtime.runCapability({
    capability: "basic_video_generation",
    input: { projectId: "project-1", prompt: "orbit" },
    approve: async () => true,
  }), /start response dropped/);
  assert.equal((await runtime.projection()).activeRun?.status, "running");

  await runtime.recoverCapabilityJobs();
  await runtime.recoverCapabilityJobs();
  const completed = await runtime.recoverCapabilityJobs();

  assert.equal(completed.jobs[0]?.status, "complete");
  const starts = tools.calls.filter(({ name }) => name === "start_capability_job");
  assert.equal(starts.length, 2);
  assert.equal(starts[0]?.args.idempotencyKey, starts[1]?.args.idempotencyKey);
  assert.equal(completed.projection.usage.actualAmount, 0.08);
});

test("process-death recovery never invents approval after an interrupted quote", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-runtime-recovery-approval-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const session = await store.create({ projectId: "project-1" });
  await store.append(session.id, { type: "run.started", data: { runId: "unapproved-run", kind: "capability", summary: "Generate video" } });
  await store.append(session.id, {
    type: "capability.requested",
    data: {
      runId: "unapproved-run",
      capability: "basic_video_generation",
      input: { projectId: "project-1", prompt: "orbit" },
      idempotencyKey: "atelier-session-unapproved-run",
    },
  });
  await store.append(session.id, {
    type: "capability.quoted",
    data: {
      runId: "unapproved-run",
      quoteId: "quote-1",
      capability: "basic_video_generation",
      providerId: "video-generation-policy-fixture-v2",
      model: "fixture-v2",
      currency: "USD",
      amount: 0.12,
      approvalRequired: true,
      reservationRequired: true,
    },
  });
  const tools = new FakeTools();
  const runtime = new AttelierHeadlessSession({ sessionId: session.id, store, client: tools });

  const recovered = await runtime.recoverCapabilityJobs();

  assert.deepEqual(recovered.jobs, []);
  assert.deepEqual(tools.calls, []);
  assert.equal(recovered.projection.lastRun?.status, "failed");
  assert.equal(recovered.projection.usage.reservedAmount, 0);
  assert.equal(recovered.projection.usage.actualAmount, 0);
});

test("declining a quote stops before approval, reservation and start", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-runtime-decline-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const session = await store.create({ projectId: "project-1" });
  const tools = new FakeTools();
  const runtime = new AttelierHeadlessSession({ sessionId: session.id, store, client: tools });

  const result = await runtime.runCapability({
    capability: "basic_video_generation",
    input: { projectId: "project-1", prompt: "orbit" },
    approve: async () => false,
  });

  assert.equal(result.approved, false);
  assert.deepEqual(tools.calls.map(({ name }) => name), ["quote_capability"]);
  assert.equal((await runtime.projection()).usage.actualAmount, 0);
});

test("session budget blocks a quote before user approval, reservation or spend", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-runtime-budget-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const session = await store.create({ projectId: "project-1" });
  const tools = new FakeTools();
  const runtime = new AttelierHeadlessSession({ sessionId: session.id, store, client: tools });
  await runtime.changeBudget(0.1);
  let asked = false;

  const result = await runtime.runCapability({
    capability: "basic_video_generation",
    input: { projectId: "project-1", prompt: "orbit" },
    approve: async () => {
      asked = true;
      return true;
    },
  });

  assert.equal(result.approved, false);
  assert.equal(result.reason, "budget");
  assert.equal(asked, false);
  assert.deepEqual(tools.calls.map(({ name }) => name), ["quote_capability"]);
  const projection = await runtime.projection();
  assert.equal(projection.budgetUsd, 0.1);
  assert.equal(projection.usage.reservedAmount, 0);
  assert.equal(projection.usage.actualAmount, 0);
});

test("pinned /route is applied to the exact capability quote input without changing the planner model", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-runtime-route-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const session = await store.create({ projectId: "project-1" });
  const tools = new FakeTools();
  const runtime = new AttelierHeadlessSession({ sessionId: session.id, store, client: tools });
  await runtime.changeModel({ mode: "pinned", modelId: "gpt-5.6-sol" });
  await runtime.changeMediaRouter("video", { mode: "pinned", modelId: "video-generation-policy-fixture-v2" });

  await runtime.runCapability({
    capability: "basic_video_generation",
    input: { projectId: "project-1", prompt: "orbit" },
    approve: async () => false,
  });

  assert.deepEqual((tools.calls[0]?.args.input as Record<string, unknown>), {
    projectId: "project-1",
    prompt: "orbit",
    routingTier: "manual",
    providerId: "video-generation-policy-fixture-v2",
  });
  assert.deepEqual((await runtime.projection()).model, { mode: "pinned", modelId: "gpt-5.6-sol" });
});

test("polling timeout cancels the remote job and keeps uncertain billing in reconciliation", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-runtime-timeout-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const session = await store.create({ projectId: "project-1" });
  const tools = new TimeoutTools();
  const runtime = new AttelierHeadlessSession({ sessionId: session.id, store, client: tools, sleep: async () => undefined });
  const progress: number[] = [];

  await assert.rejects(() => runtime.runCapability({
    capability: "basic_video_generation",
    input: { projectId: "project-1", prompt: "orbit" },
    approve: async () => true,
    onProgress: (job) => progress.push(job.progress),
    maxPolls: 2,
    pollIntervalMs: 0,
  }), /polling limit/i);

  assert.ok(tools.calls.some(({ name }) => name === "cancel_capability_job"));
  assert.deepEqual(progress, [0, 0.30000000000000004, 0.5, 0.5]);
  const projection = await runtime.projection();
  assert.equal(projection.usage.reservedAmount, 0);
  assert.equal(projection.usage.pendingReconciliationAmount, 0.12);
  assert.equal(projection.usage.actualAmount, 0);
});

test("a completed output with unresolved provider billing remains in reconciliation", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-runtime-complete-reconciliation-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const session = await store.create({ projectId: "project-1" });
  const runtime = new AttelierHeadlessSession({
    sessionId: session.id,
    store,
    client: new CompletePendingTools(),
    sleep: async () => undefined,
  });

  const result = await runtime.runCapability({
    capability: "basic_video_generation",
    input: { projectId: "project-1", prompt: "orbit" },
    approve: async () => true,
    pollIntervalMs: 0,
  });

  assert.equal(result.job?.status, "complete");
  const projection = await runtime.projection();
  assert.equal(projection.usage.reservedAmount, 0);
  assert.equal(projection.usage.pendingReconciliationAmount, 0.12);
  assert.equal(projection.usage.actualAmount, 0);
});

test("explicit job cancellation reconciles a resumed session idempotently", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-runtime-cancel-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const session = await store.create({ projectId: "project-1" });
  await store.append(session.id, { type: "run.started", data: { runId: "original-run", kind: "capability", summary: "Generate" } });
  await store.append(session.id, {
    type: "capability.quoted",
    data: {
      runId: "original-run",
      quoteId: "quote-1",
      capability: "basic_video_generation",
      providerId: "video-generation-policy-fixture-v2",
      model: "fixture-v2",
      currency: "USD",
      amount: 0.12,
      approvalRequired: true,
      reservationRequired: true,
    },
  });
  await store.append(session.id, {
    type: "spend.reserved",
    data: { runId: "original-run", reservationId: "reservation-1", quoteId: "quote-1", currency: "USD", amount: 0.12 },
  });
  await store.append(session.id, {
    type: "capability.job.updated",
    data: {
      runId: "original-run",
      jobId: "job-1",
      capability: "basic_video_generation",
      providerId: "video-generation-policy-fixture-v2",
      status: "running",
      progress: 0.5,
    },
  });
  const runtime = new AttelierHeadlessSession({ sessionId: session.id, store, client: new TimeoutTools() });

  await store.append(session.id, { type: "run.interrupted", data: { runId: "original-run", message: "Server restarted while the provider job was running." } });
  const first = await runtime.cancelCapabilityJob("job-1");
  const second = await runtime.cancelCapabilityJob("job-1");

  assert.equal(first.job.status, "cancelled");
  assert.equal(second.projection.usage.reservedAmount, 0);
  assert.equal(second.projection.usage.pendingReconciliationAmount, 0.12);
  assert.equal(second.projection.usage.actualAmount, 0);
  const events = await store.read(session.id);
  assert.equal(events.filter(({ eventId }) => eventId === "spend-close:original-run:reservation-1").length, 1);
  assert.equal(events.filter(({ eventId }) => eventId === "usage:original-run:job-1").length, 1);
  assert.equal(events.filter((event) => (event.type === "run.failed" || event.type === "run.interrupted" || event.type === "run.completed" || event.type === "run.cancelled") && event.data.runId === "original-run").length, 1, "recovery preserves the original terminal event");
});

test("undo and redo restore historical content by creating forward revisions", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-runtime-version-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const session = await store.create({ projectId: "project-1" });
  const tools = new FakeTools();
  const runtime = new AttelierHeadlessSession({ sessionId: session.id, store, client: tools });

  const undone = await runtime.restoreProjectRevision("previous");
  assert.deepEqual({ target: undone.targetRevision, revision: undone.revision }, { target: 4, revision: 6 });
  const redone = await runtime.restoreProjectRevision("redo");
  assert.deepEqual({ target: redone.targetRevision, revision: redone.revision }, { target: 5, revision: 7 });
  assert.equal(redone.projection.projectRevision, 7);
  assert.equal(redone.projection.lastRestore?.intent, "redo");
  assert.equal(tools.calls.filter(({ name }) => name === "restore_project_version").length, 2);
});

test("headless runtime reads and updates the same optimistic project plan used by Studio", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-runtime-project-plan-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const session = await store.create({ projectId: "project-1" });
  const tools = new FakeTools();
  const runtime = new AttelierHeadlessSession({ sessionId: session.id, store, client: tools });

  const saved = await runtime.updateProjectPlan({
    script: "Open on the empty world.",
    beats: [{ id: "hook", title: "Hook", durationSeconds: 3 }],
  });

  assert.equal(saved.version, 1);
  assert.equal(saved.script, "Open on the empty world.");
  assert.deepEqual(tools.calls.slice(-2).map(({ name }) => name), ["get_project_plan", "update_project_plan"]);
  const projection = await runtime.projection();
  assert.equal(projection.projectPlanVersion, 1);
  const events = await store.read(session.id);
  assert.ok(events.some((event) => event.type === "project.plan.updated" && event.data.version === 1));
});

test("analyzeAsset starts, polls and retrieves the capability artifact", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-runtime-analysis-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const session = await store.create({ projectId: "project-1" });
  const tools = new FakeTools();
  const runtime = new AttelierHeadlessSession({ sessionId: session.id, store, client: tools, sleep: async () => undefined });
  const result = await runtime.analyzeAsset("transcribe", "asset-1", { maxPolls: 1, pollIntervalMs: 0 });
  assert.equal(result.job.status, "complete");
  assert.deepEqual(result.artifact, { artifactId: "artifact-1", text: "hello" });
  assert.deepEqual(tools.calls.map(({ name }) => name).slice(-3), ["start_analysis_job", "get_analysis_job", "get_transcript"]);
});

test("reconstructVideo analyzes then commits source-linked shots through the headless authority", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-runtime-reconstruction-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const session = await store.create({ projectId: "project-1" });
  const tools = new ReconstructionTools();
  const runtime = new AttelierHeadlessSession({ sessionId: session.id, store, client: tools, sleep: async () => undefined });

  const result = await runtime.reconstructVideo("asset-1", { maxPolls: 1, pollIntervalMs: 0 });

  assert.equal(result.shotCount, 2);
  assert.equal(result.trackId, "video-1");
  assert.equal(result.revision, 5);
  assert.deepEqual(tools.calls.map(({ name }) => name), [
    "start_analysis_job",
    "get_analysis_job",
    "get_video_reconstruction",
    "inspect_project",
    "simulate_transaction",
    "commit_transaction",
  ]);
  const transaction = tools.calls.find(({ name }) => name === "simulate_transaction")?.args.transaction as Record<string, unknown>;
  const operations = transaction.operations as Array<Record<string, unknown>>;
  assert.equal(operations.filter(({ type }) => type === "insertElement").length, 2);
  assert.equal((await runtime.projection()).projectRevision, 5);
});

test("importLocalMedia streams bytes through backend authority and commits one project revision", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-runtime-import-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const mediaPath = path.join(temporary, "shot one.mp4");
  await writeFile(mediaPath, Buffer.from("fixture-video"));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const session = await store.create({ projectId: "project-1" });
  const tools = new FakeTools();
  const runtime = new AttelierHeadlessSession({ sessionId: session.id, store, client: tools });

  const result = await runtime.importLocalMedia(mediaPath);

  assert.equal(result.fileName, "shot one.mp4");
  assert.equal(result.mimeType, "video/mp4");
  assert.equal(result.workspaceAssetId, "workspace-asset-1");
  assert.equal(result.projectAssetId, "library:workspace-asset-1");
  assert.equal(result.revision, 5);
  assert.equal(result.deduplicated, false);
  assert.match(result.contentHash, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(tools.calls.map(({ name }) => name), [
    "inspect_project",
    "create_upload",
    "upload_chunk",
    "upload_chunk",
    "upload_chunk",
    "upload_chunk",
    "upload_chunk",
    "complete_upload",
    "create_workspace_asset_from_upload",
    "prepare_workspace_asset_import",
    "simulate_transaction",
    "commit_transaction",
  ]);
  const events = await store.read(session.id);
  const chunkStarts = events.flatMap((event) =>
    event.type === "tool.started" && event.data.toolName === "upload_chunk" ? [event] : []);
  assert.equal(chunkStarts.length, 5);
  assert.ok(chunkStarts.every((event) => !("base64" in event.data.input) && typeof event.data.input.byteSize === "number"));
  assert.equal((await runtime.projection()).projectRevision, 5);
});

test("placeProjectAsset prepares, simulates and commits one visible timeline placement", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-runtime-place-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const session = await store.create({ projectId: "project-1" });
  const tools = new FakeTools();
  const runtime = new AttelierHeadlessSession({ sessionId: session.id, store, client: tools });

  const placed = await runtime.placeProjectAsset({
    assetId: "library:workspace-asset-1",
    startSeconds: 2,
    durationSeconds: 4,
  });

  assert.deepEqual(placed, {
    assetId: "library:workspace-asset-1",
    elementId: "element-placed-1",
    trackId: "video-1",
    createdTrack: true,
    revision: 5,
  });
  assert.deepEqual(tools.calls.map(({ name }) => name), [
    "inspect_project",
    "prepare_project_asset_placement",
    "simulate_transaction",
    "commit_transaction",
  ]);
  const prepared = tools.calls.find(({ name }) => name === "prepare_project_asset_placement");
  assert.equal(prepared?.args.startSeconds, 2);
  assert.equal(prepared?.args.durationSeconds, 4);
  assert.equal((await runtime.projection()).projectRevision, 5);
});

test("placeProjectAsset replays the exact transaction after a lost commit response", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-runtime-place-retry-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const session = await store.create({ projectId: "project-1" });
  class LostResponseTools extends FakeTools {
    private lost = false;

    override async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
      if (name !== "commit_transaction") return super.callTool<T>(name, args);
      this.calls.push({ name, args });
      if (!this.lost) {
        this.lost = true;
        throw new TypeError("response stream closed");
      }
      return { revision: 5, transactionId: "placement-transaction-1" } as T;
    }
  }
  const tools = new LostResponseTools();
  const runtime = new AttelierHeadlessSession({ sessionId: session.id, store, client: tools });

  const placed = await runtime.placeProjectAsset({ assetId: "library:workspace-asset-1" });

  assert.equal(placed.revision, 5);
  const commits = tools.calls.filter(({ name }) => name === "commit_transaction");
  assert.equal(commits.length, 2);
  assert.deepEqual(commits[0]?.args, commits[1]?.args);
  assert.equal(tools.calls.filter(({ name }) => name === "prepare_project_asset_placement").length, 1);
  assert.equal((await store.read(session.id)).filter((event) => event.type === "project.revision.created").length, 1);
});

test("an uncertain project commit blocks new edits until resume replays the durable transaction", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-runtime-place-recovery-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const session = await store.create({ projectId: "project-1" });
  class AmbiguousCommitTools extends FakeTools {
    private failuresRemaining = 2;

    override async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
      if (name !== "commit_transaction") return super.callTool<T>(name, args);
      this.calls.push({ name, args });
      if (this.failuresRemaining > 0) {
        this.failuresRemaining -= 1;
        throw new TypeError("connection lost after dispatch");
      }
      return { revision: 5, transactionId: "placement-transaction-1" } as T;
    }
  }
  const tools = new AmbiguousCommitTools();
  const runtime = new AttelierHeadlessSession({ sessionId: session.id, store, client: tools });

  await assert.rejects(
    runtime.placeProjectAsset({ assetId: "library:workspace-asset-1" }),
    /could not confirm whether transaction placement-transaction-1 committed/i,
  );
  await assert.rejects(
    runtime.placeProjectAsset({ assetId: "library:workspace-asset-1" }),
    /unfinished.*\/resume/i,
  );
  assert.equal(tools.calls.filter(({ name }) => name === "prepare_project_asset_placement").length, 1);

  const recovered = await runtime.recoverProjectCommits();

  assert.equal(recovered.issues.length, 0);
  assert.deepEqual(recovered.commits.map(({ transactionId, revision }) => ({ transactionId, revision })), [
    { transactionId: "placement-transaction-1", revision: 5 },
  ]);
  const commits = tools.calls.filter(({ name }) => name === "commit_transaction");
  assert.equal(commits.length, 3);
  assert.deepEqual(commits[0]?.args, commits[1]?.args);
  assert.deepEqual(commits[1]?.args, commits[2]?.args);
  assert.equal((await runtime.projection()).activeRun, null);
  assert.equal((await runtime.projection()).projectRevision, 5);
});

test("project commit recovery refuses a revision from a different durable transaction", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-runtime-place-mismatch-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const session = await store.create({ projectId: "project-1" });
  const tools = new FakeTools();
  const runtime = new AttelierHeadlessSession({ sessionId: session.id, store, client: tools });
  const transaction = {
    id: "expected-transaction",
    baseRevision: 4,
    idempotencyKey: "expected-key",
    source: "agent",
    authorId: "atelier",
    goal: "Place fixture",
    preconditions: [],
    operations: [],
  };
  await store.append(session.id, {
    type: "run.started",
    data: { runId: "mismatched-run", kind: "edit", summary: "Place fixture" },
  });
  await store.append(session.id, {
    type: "tool.started",
    data: {
      runId: "mismatched-run",
      callId: "commit-call",
      toolName: "commit_transaction",
      input: { projectId: "project-1", transaction },
    },
  });
  await store.append(session.id, {
    type: "project.revision.created",
    data: { runId: "mismatched-run", projectId: "project-1", revision: 5, transactionId: "different-transaction" },
  });

  const recovered = await runtime.recoverProjectCommits();

  assert.equal(recovered.commits.length, 0);
  assert.match(recovered.issues[0]?.message ?? "", /do not identify the same project transaction/i);
  assert.equal(tools.calls.filter(({ name }) => name === "commit_transaction").length, 0);
  assert.equal((await runtime.projection()).activeRun?.id, "mismatched-run");
});

test("runRender quotes, approves, polls and evaluates without provider spend", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-runtime-render-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const session = await store.create({ projectId: "project-1" });
  const tools = new FakeTools();
  const runtime = new AttelierHeadlessSession({ sessionId: session.id, store, client: tools, sleep: async () => undefined });
  const result = await runtime.runRender({ format: "mp4", approve: async () => true, maxPolls: 1, pollIntervalMs: 0 });
  assert.equal(result.approved, true);
  assert.equal(result.job?.status, "complete");
  assert.deepEqual(result.evaluation, { passed: true, profile: "general-video-v1" });
  assert.equal((await runtime.projection()).renderJobs[0]?.status, "complete");
  assert.equal((await runtime.projection()).usage.actualAmount, 0);
});

test("recoverRenderJobs and cancelRenderJob reconcile durable render state", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-runtime-render-recovery-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const session = await store.create({ projectId: "project-1" });
  const tools = new FakeTools();
  const runtime = new AttelierHeadlessSession({ sessionId: session.id, store, client: tools, sleep: async () => undefined });
  await store.append(session.id, { type: "render.job.updated", data: { runId: "run-1", jobId: "render-1", projectId: "project-1", revision: 5, format: "mp4", status: "running", progress: 0.5, jobUpdatedAt: 1 } });
  const recovered = await runtime.recoverRenderJobs({ waitForTerminal: true, maxPolls: 1, pollIntervalMs: 0 });
  assert.equal(recovered.jobs[0]?.status, "complete");
  const cancelled = await runtime.cancelRenderJob("render-1");
  assert.equal(cancelled.job.status, "cancelled");
});

test("headless workflow inspection, explicit retry and cancellation use durable MCP authority", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-runtime-workflows-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const session = await store.create({ projectId: "project-1" });
  const tools = new FakeTools();
  const runtime = new AttelierHeadlessSession({ sessionId: session.id, store, client: tools });

  const listed = await runtime.listWorkflowRuns();
  const inspected = await runtime.getWorkflowRun("workflow-1");
  const resumed = await runtime.resumeWorkflowRun("workflow-1");
  const cancelled = await runtime.cancelWorkflowRun("workflow-1");

  assert.equal(listed[0]?.state, "failed");
  assert.equal(inspected.currentStageId, "generate");
  assert.equal(resumed.state, "running");
  assert.equal(cancelled.state, "cancelled");
  assert.deepEqual(tools.calls.slice(-4).map(({ name }) => name), [
    "list_workflow_runs",
    "get_workflow_run",
    "resume_workflow_run",
    "cancel_workflow_run",
  ]);
  assert.equal((await runtime.projection()).lastRun?.kind, "workflow");
});

test("source-to-variants creates a real transcript, stops for review and exposes editable branches", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-runtime-source-variants-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const session = await store.create({ projectId: "project-1", budgetUsd: 1 });
  class SourceVariantTools extends FakeTools {
    private transcriptReads = 0;

    override async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
      if (name === "get_transcript") {
        this.calls.push({ name, args });
        this.transcriptReads += 1;
        return (this.transcriptReads === 1 ? null : { id: "transcript-1", text: "Real fixture transcript" }) as T;
      }
      if (name === "quote_workflow") {
        this.calls.push({ name, args });
        return {
          id: "workflow-quote-1",
          kind: "long_form_to_shorts",
          currency: "USD",
          estimatedCostUsd: 0.05,
          estimatedRuntimeMs: 1_000,
          approvalRequired: false,
          status: "quoted",
          expiresAt: Date.now() + 10_000,
        } as T;
      }
      if (name === "start_workflow_run") {
        this.calls.push({ name, args });
        return {
          id: "workflow-variants-1",
          kind: "long_form_to_shorts",
          projectId: "project-1",
          state: "awaiting_approval",
          currentStageId: "select",
          estimatedCostUsd: 0.05,
          actualCostUsd: 0,
          updatedAt: 3,
          branches: [],
        } as T;
      }
      if (name === "approve_workflow_run") {
        this.calls.push({ name, args });
        return {
          id: "workflow-variants-1",
          kind: "long_form_to_shorts",
          projectId: "project-1",
          state: "running",
          currentStageId: "edit",
          estimatedCostUsd: 0.05,
          actualCostUsd: 0,
          updatedAt: 4,
          branches: [],
        } as T;
      }
      if (name === "get_workflow_run" && args.runId === "workflow-variants-1") {
        this.calls.push({ name, args });
        return {
          id: "workflow-variants-1",
          kind: "long_form_to_shorts",
          projectId: "project-1",
          state: "completed",
          estimatedCostUsd: 0.05,
          actualCostUsd: 0.02,
          updatedAt: 5,
          branches: [{ projectId: "variant-1", label: "Short 1", studioUrl: "/?project=variant-1" }],
        } as T;
      }
      return super.callTool<T>(name, args);
    }
  }
  const tools = new SourceVariantTools();
  const runtime = new AttelierHeadlessSession({ sessionId: session.id, store, client: tools, sleep: async () => undefined });

  const prepared = await runtime.runSourceToVariants({
    assetId: "asset-1",
    count: 2,
    targetDurationSeconds: 20,
    aspectRatio: "9:16",
    approve: async () => true,
    maxPolls: 1,
    pollIntervalMs: 0,
  });
  assert.equal(prepared.transcriptCreated, true);
  assert.equal(prepared.workflow?.state, "awaiting_approval");
  const quoted = tools.calls.find(({ name }) => name === "quote_workflow");
  assert.deepEqual(quoted?.args.input, {
    projectId: "project-1",
    assetId: "asset-1",
    count: 2,
    targetDurationSeconds: 20,
    aspectRatio: "9:16",
  });

  const completed = await runtime.approveWorkflowRun("workflow-variants-1", "Creator approved", {
    maxPolls: 1,
    pollIntervalMs: 0,
  });
  assert.equal(completed.state, "completed");
  assert.equal(completed.branches[0]?.studioUrl, "/?project=variant-1");
  const projection = await runtime.projection();
  assert.equal(projection.usage.actualAmount, 0.02);
  assert.ok(projection.messages.some(({ content }) => /ready for creator review/.test(content)));
  assert.ok(projection.messages.some(({ content }) => /completed with 1 editable branch/.test(content)));
});

test("session JSON redacts credential-shaped fields before persistence", () => {
  assert.deepEqual(sanitizeSessionJson({
    prompt: "keep",
    authorization: "Bearer secret",
    tokenCount: 42,
    token: "secret",
    nested: { apiKey: "secret", bearerToken: "secret", id_token: "secret" },
  }), {
    prompt: "keep",
    authorization: "[REDACTED]",
    tokenCount: 42,
    token: "[REDACTED]",
    nested: { apiKey: "[REDACTED]", bearerToken: "[REDACTED]", id_token: "[REDACTED]" },
  });
});
