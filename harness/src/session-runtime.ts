import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import path from "node:path";
import type {
  AttelierJsonObject,
  AttelierGoalStatus,
  AttelierMediaFamily,
  AttelierModelSelection,
  AttelierProjectPlan,
  AttelierProjectPlanPatch,
  AttelierRoutingPolicy,
  AttelierSessionEvent,
  AttelierSessionEventInput,
  AttelierSessionGoal,
  AttelierSessionProjection,
} from "@attelier/agent-schema";
import type { CapabilityJob, CapabilityQuote, CapabilityReservation } from "@attelier/capability-schema";
import {
  buildVideoReconstructionOperations,
  type VideoReconstructionArtifact,
} from "@attelier/analysis-schema";
import type { Project, ProjectTransaction } from "@attelier/project-schema";
import type { AttelierSessionRepository } from "./session-store.js";
import { ATTELIER_ROUTE_EVIDENCE_VERSION, mediaFamilyForCapability } from "./model-router.js";
import type { ProjectElement, ProjectElementInput } from "@attelier/workflow-schema";
import { sanitizeSessionJson } from "./session-json.js";
export { sanitizeSessionJson } from "./session-json.js";
import {
  AttelierUncertainProjectCommitError,
  commitExactProjectTransaction,
  recordProjectRevision,
  simulateCommitAndRecordProjectTransaction,
} from "./project-transaction-coordinator.js";
import {
  recoverCapabilityJobs as coordinateCapabilityRecovery,
  type CapabilityRecoveryOptions,
  type CapabilityRecoveryResult,
} from "./capability-recovery-coordinator.js";
export type {
  CapabilityRecoveryOptions,
  CapabilityRecoveryResult,
} from "./capability-recovery-coordinator.js";
import {
  RenderSessionCoordinator,
  type AttelierRenderJob,
  type RenderRecoveryResult,
  type RenderRunInput,
  type RenderRunResult,
} from "./render-session-coordinator.js";
export type {
  AttelierRenderFormat,
  AttelierRenderJob,
  AttelierRenderQuote,
  RenderRecoveryResult,
  RenderRunInput,
  RenderRunResult,
} from "./render-session-coordinator.js";
import {
  WorkflowSessionCoordinator,
  type AttelierWorkflowRun,
  type SourceVariantsRunInput,
  type SourceVariantsRunResult,
} from "./workflow-session-coordinator.js";
export type {
  AttelierWorkflowQuote,
  AttelierWorkflowRun,
  SourceVariantsRunInput,
  SourceVariantsRunResult,
} from "./workflow-session-coordinator.js";
import {
  parseAnalysisJob as analysisJob,
  type AttelierAnalysisCapability,
  type AttelierAnalysisJob,
  type AnalysisRunResult,
} from "./analysis-session-contracts.js";
import {
  assertMusicAssetPublishable,
  suggestMusicMoments,
  type MusicMoment,
  type MusicUseContext,
} from "./music-workflow.js";
export type {
  AttelierAnalysisCapability,
  AttelierAnalysisJob,
  AnalysisRunResult,
} from "./analysis-session-contracts.js";

const jsonObject = (value: unknown, label: string): AttelierJsonObject => {
  const sanitized = sanitizeSessionJson(value);
  if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) {
    throw new Error(`${label} must be an object.`);
  }
  return sanitized;
};

const record = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} returned an invalid object.`);
  return value as Record<string, unknown>;
};

const string = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} returned an invalid string.`);
  return value;
};

const finiteNumber = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} returned an invalid number.`);
  return value;
};

const MEDIA_MIME_TYPES: Readonly<Record<string, string>> = {
  ".aac": "audio/aac",
  ".avif": "image/avif",
  ".flac": "audio/flac",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".m4a": "audio/mp4",
  ".m4v": "video/mp4",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".opus": "audio/opus",
  ".png": "image/png",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webp": "image/webp",
};

const mediaMimeType = (filePath: string): string => {
  const extension = path.extname(filePath).toLowerCase();
  const mimeType = MEDIA_MIME_TYPES[extension];
  if (!mimeType) {
    throw new Error(`Unsupported local media extension ${extension || "(none)"}. Import an image, video or audio file.`);
  }
  return mimeType;
};

const sha256File = async (filePath: string): Promise<string> => {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) digest.update(chunk as Uint8Array);
  return `sha256:${digest.digest("hex")}`;
};

const capabilitySpendCloseType = (
  job: Pick<CapabilityJob, "status" | "pricing">,
): "spend.settled" | "spend.reconciliation_pending" | "spend.released" =>
  job.pricing.status === "pending_reconciliation"
    ? "spend.reconciliation_pending"
    : job.status === "complete"
      ? "spend.settled"
      : "spend.released";

const qualityCapabilityParameters = (
  capability: string,
  input: Record<string, unknown>,
): Record<string, unknown> => {
  if (capability === "text_to_image") {
    const width = Number(input.width);
    const height = Number(input.height);
    const aspectRatio = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
      ? height > width ? "9:16" : height === width ? "1:1" : "16:9"
      : "16:9";
    return { aspectRatio, resolution: "4K", outputFormat: "png" };
  }
  if (capability === "text_to_video" || capability === "image_to_video" || capability === "reference_to_video") {
    return {
      resolution: "1080p",
      bitrateMode: "high",
      generateAudio: typeof input.generateAudio === "boolean" ? input.generateAudio : true,
    };
  }
  return {};
};

export interface AttelierHarnessToolClient {
  callTool<T = unknown>(name: string, args: Record<string, unknown>): Promise<T>;
}

export type PlanEditInput = {
  prompt: string;
  selection?: {
    elementId?: string;
    assetId?: string;
    start?: string;
    end?: string;
  };
  commit?: boolean;
};

export type CapabilityRunInput = {
  capability: string;
  input: Record<string, unknown>;
  approve: (quote: CapabilityQuote) => Promise<boolean>;
  onStarted?: (job: CapabilityJob) => void;
  onProgress?: (job: CapabilityJob) => void;
  pollIntervalMs?: number;
  maxPolls?: number;
};

export type CapabilityPrepareInput = {
  capability: string;
  input: Record<string, unknown>;
  /** Stable UI/transport operation ID. Retrying it returns the same run. */
  runId?: string;
  /** Stable provider idempotency key retained across process or client death. */
  idempotencyKey?: string;
};

export type CapabilityPrepareResult = {
  runId: string;
  quote: CapabilityQuote;
  readyForApproval: boolean;
  reason?: "budget";
};

export type CapabilityContinueInput = {
  runId: string;
  /** Required only until an approval decision is durable. */
  approved?: boolean;
  actor?: "user" | "harness";
  /** One server probe by default; callers may poll without holding a request. */
  waitForTerminal?: boolean;
  pollIntervalMs?: number;
  maxPolls?: number;
  onProgress?: (job: CapabilityJob) => void;
};

/** One-line note shown in chat when a capability run can never be continued. */
export const CAPABILITY_RUN_INTERRUPTED_MESSAGE = "This generation was interrupted before it started; ask again.";

/** A capability run whose durable request or quote is missing can never be
 * continued, so callers must stop retrying instead of treating it as a fault. */
export class CapabilityRunNotPreparedError extends Error {
  readonly code = "capability_run_not_prepared";
  constructor(readonly runId: string) {
    super(`Capability run ${runId} is not prepared.`);
    this.name = "CapabilityRunNotPreparedError";
  }
}

export type CapabilityRunResult = {
  quote: CapabilityQuote;
  approved: boolean;
  reason?: "declined" | "budget";
  reservation?: CapabilityReservation;
  job?: CapabilityJob;
};

export type CapabilityContinueResult = CapabilityRunResult & {
  runId: string;
  projection: AttelierSessionProjection;
};

export type VideoReconstructionRunResult = {
  analysisJobId: string;
  artifactId: string;
  assetId: string;
  shotCount: number;
  trackId: string;
  revision: number;
};

export type LocalMediaImportResult = {
  fileName: string;
  mimeType: string;
  byteSize: number;
  contentHash: string;
  uploadId: string;
  workspaceAssetId: string;
  projectAssetId: string;
  revision: number;
  deduplicated: boolean;
};

export type WorkspaceLibraryImportResult = {
  workspaceAssetId: string;
  projectAssetId: string;
  revision: number;
};

export type ProjectAssetPlacementInput = {
  assetId: string;
  trackId?: string;
  startSeconds?: number;
  sourceStartSeconds?: number;
  durationSeconds?: number;
  audioRole?: "dialogue" | "voiceover" | "music" | "sfx" | "ambience";
};

export type MusicExcerptPlacementInput = MusicUseContext & {
  assetId: string;
  sourceStartSeconds: number;
  durationSeconds: number;
  timelineStartSeconds?: number;
  trackId?: string;
};

export type ProjectAssetPlacementResult = {
  assetId: string;
  elementId: string;
  trackId: string;
  createdTrack: boolean;
  revision: number;
};

export type ProjectCommitRecoveryResult = {
  projection: AttelierSessionProjection;
  commits: Array<{
    runId: string;
    projectId: string;
    transactionId: string;
    revision: number;
  }>;
  issues: Array<{ runId: string; message: string }>;
};

export const parseModelSelection = (value: string): AttelierModelSelection => {
  const normalized = value.trim();
  if (!normalized || normalized === "auto" || normalized.startsWith("auto ")) {
    throw new Error("Attelier uses one explicit coordinator LLM. Choose it with /model MODEL_ID.");
  }
  const [first] = normalized.split(/\s+/, 1);
  const modelId = first === "pin" ? normalized.slice(3).trim() : normalized;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,159}$/.test(modelId)) {
    throw new Error("Pinned model IDs may contain letters, numbers, dot, underscore, colon, slash and dash.");
  }
  return { mode: "pinned", modelId };
};

export const parseMediaRoutingSelection = (value: string): AttelierModelSelection => {
  const normalized = value.trim();
  if (!normalized || normalized === "auto") return { mode: "auto", policy: "balanced" };
  const [first, second] = normalized.split(/\s+/, 2);
  if (first === "auto") {
    if (!["balanced", "quality", "cost"].includes(second ?? "balanced")) {
      throw new Error("Automatic media policy must be balanced, quality or cost.");
    }
    return { mode: "auto", policy: (second ?? "balanced") as AttelierRoutingPolicy };
  }
  const modelId = first === "pin" ? normalized.slice(3).trim() : normalized;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,159}$/.test(modelId)) {
    throw new Error("Pinned provider IDs may contain letters, numbers, dot, underscore, colon, slash and dash.");
  }
  return { mode: "pinned", modelId };
};

const videoReconstructionArtifact = (value: unknown): VideoReconstructionArtifact => {
  const artifact = record(value, "video reconstruction artifact");
  if (artifact.schemaVersion !== "atelier.video-reconstruction.v1") {
    throw new Error("Video reconstruction returned an unsupported schema version.");
  }
  string(artifact.id, "video reconstruction artifact.id");
  string(artifact.projectId, "video reconstruction artifact.projectId");
  string(artifact.assetId, "video reconstruction artifact.assetId");
  const source = record(artifact.source, "video reconstruction artifact.source");
  string(source.duration, "video reconstruction artifact.source.duration");
  if (!Array.isArray(artifact.shots)) {
    throw new Error("Video reconstruction returned no measured shots array.");
  }
  return artifact as unknown as VideoReconstructionArtifact;
};

export class AttelierHeadlessSession {
  readonly sessionId: string;
  private readonly store: AttelierSessionRepository;
  private readonly client: AttelierHarnessToolClient | undefined;
  private readonly now: () => number;
  private readonly createId: () => string;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(options: {
    sessionId: string;
    store: AttelierSessionRepository;
    client?: AttelierHarnessToolClient;
    now?: () => number;
    createId?: () => string;
    sleep?: (milliseconds: number) => Promise<void>;
  }) {
    this.sessionId = options.sessionId;
    this.store = options.store;
    this.client = options.client;
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? randomUUID;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  private append(input: AttelierSessionEventInput) {
    return this.store.append(this.sessionId, input);
  }

  private requireClient(): AttelierHarnessToolClient {
    if (!this.client) throw new Error("This command requires ATTELIER_API_TOKEN or --token and a reachable Attelier API.");
    return this.client;
  }

  async projection(): Promise<AttelierSessionProjection> {
    return this.store.project(this.sessionId);
  }

  async history(limit = 20): Promise<AttelierSessionEvent[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Session history limit must be an integer from 1 to 100.");
    }
    return (await this.store.read(this.sessionId)).slice(-limit);
  }

  private async requireAiUnlocked(): Promise<void> {
    if ((await this.projection()).aiLocked) {
      throw new Error("This Attelier session is locked to editing-only mode. Run /unlock before using a model or media capability.");
    }
  }

  async changeAiLock(locked: boolean): Promise<AttelierSessionProjection> {
    await this.append({ type: "ai.lock.changed", data: { locked } });
    return this.projection();
  }

  async resume(workingDirectory = process.cwd()): Promise<AttelierSessionProjection> {
    await this.append({
      type: "session.resumed",
      data: { workingDirectory, client: "terminal" },
    });
    return this.projection();
  }

  async appendMessage(role: "user" | "assistant" | "system", content: string): Promise<AttelierSessionProjection> {
    const normalized = content.trim();
    if (!normalized) throw new Error("Session messages cannot be empty.");
    await this.append({ type: "message.appended", data: { role, content: normalized, audience: "both" } });
    return this.projection();
  }

  async changeModel(selection: AttelierModelSelection): Promise<AttelierSessionProjection> {
    await this.append({ type: "model.changed", data: { selection } });
    return this.projection();
  }

  async getProjectPlan(): Promise<AttelierProjectPlan> {
    const current = await this.projection();
    if (!current.projectId) throw new Error("Select a project with /project before reading its creative plan.");
    const runId = this.createId();
    await this.append({ type: "run.started", data: { runId, kind: "inspect", summary: "Read project creative plan" } });
    try {
      const plan = await this.callTool<AttelierProjectPlan>(runId, "get_project_plan", { projectId: current.projectId });
      await this.append({ type: "run.completed", data: { runId, summary: `Project plan v${plan.version} inspected.` } });
      return plan;
    } catch (error) {
      await this.append({ type: "run.failed", data: { runId, error: error instanceof Error ? error.message : String(error) } });
      throw error;
    }
  }

  async updateProjectPlan(patch: AttelierProjectPlanPatch): Promise<AttelierProjectPlan> {
    const current = await this.projection();
    if (!current.projectId) throw new Error("Select a project with /project before updating its creative plan.");
    if (!patch || typeof patch !== "object" || Array.isArray(patch) || Object.keys(patch).length === 0) {
      throw new Error("A non-empty project plan patch is required.");
    }
    const runId = this.createId();
    await this.append({ type: "run.started", data: { runId, kind: "plan", summary: "Update project creative plan" } });
    try {
      const before = await this.callTool<AttelierProjectPlan>(runId, "get_project_plan", { projectId: current.projectId });
      const plan = await this.callTool<AttelierProjectPlan>(runId, "update_project_plan", {
        projectId: current.projectId,
        expectedVersion: before.version,
        patch: jsonObject(patch, "project plan patch"),
      });
      const changedFields = Object.keys(patch);
      await this.append({
        type: "project.plan.updated",
        data: { runId, projectId: current.projectId, version: plan.version, changedFields },
      });
      await this.append({ type: "run.completed", data: { runId, summary: `Project plan updated to v${plan.version}: ${changedFields.join(", ")}.` } });
      return plan;
    } catch (error) {
      await this.append({ type: "run.failed", data: { runId, error: error instanceof Error ? error.message : String(error) } });
      throw error;
    }
  }

  async upsertProjectElement(element: ProjectElementInput): Promise<ProjectElement> {
    const current = await this.projection();
    if (!current.projectId) throw new Error("Select a project with /project before saving a reusable project element.");
    const runId = this.createId();
    await this.append({ type: "run.started", data: { runId, kind: "plan", summary: `Save reusable ${element.kind}: ${element.name}` } });
    try {
      const saved = await this.callTool<ProjectElement>(runId, "upsert_project_element", {
        projectId: current.projectId,
        element: jsonObject(element, "project element"),
      });
      await this.append({ type: "run.completed", data: { runId, summary: `Reusable ${saved.kind} ${saved.name} saved.` } });
      return saved;
    } catch (error) {
      await this.append({ type: "run.failed", data: { runId, error: error instanceof Error ? error.message : String(error) } });
      throw error;
    }
  }

  async changeMediaRouter(family: AttelierMediaFamily, selection: AttelierModelSelection): Promise<AttelierSessionProjection> {
    await this.append({ type: "media_router.changed", data: { family, selection } });
    return this.projection();
  }

  async changeBudget(budgetUsd: number | null): Promise<AttelierSessionProjection> {
    if (budgetUsd !== null && (!Number.isFinite(budgetUsd) || budgetUsd < 0)) {
      throw new Error("Session budget must be a non-negative USD amount.");
    }
    await this.append({ type: "budget.changed", data: { budgetUsd } });
    return this.projection();
  }

  async selectProject(projectId: string | null): Promise<AttelierSessionProjection> {
    const normalized = projectId?.trim() || null;
    await this.append({ type: "project.selected", data: { projectId: normalized } });
    return this.projection();
  }

  async setGoal(objective: string, action: "set" | "edit" = "set"): Promise<AttelierSessionProjection> {
    const normalized = objective.trim();
    if (!normalized) throw new Error("Goal objective cannot be empty.");
    if (normalized.length > 4_000) throw new Error("Goal objective cannot exceed 4,000 characters.");
    const current = (await this.projection()).goal;
    const timestamp = this.now();
    const goal: AttelierSessionGoal = {
      objective: normalized,
      status: "active",
      createdAt: current?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    await this.append({ type: "goal.changed", data: { action, goal } });
    return this.projection();
  }

  async changeGoalStatus(action: "pause" | "resume" | "block" | "complete" | "clear"): Promise<AttelierSessionProjection> {
    const current = (await this.projection()).goal;
    if (action !== "clear" && !current) throw new Error("This Attelier session has no goal.");
    const status: AttelierGoalStatus = action === "pause" ? "paused" : action === "resume" ? "active" : action === "block" ? "blocked" : "complete";
    const goal = action === "clear" || !current ? null : { ...current, status, updatedAt: this.now() };
    await this.append({ type: "goal.changed", data: { action, goal } });
    return this.projection();
  }

  private async callTool<T>(
    runId: string,
    toolName: string,
    input: Record<string, unknown>,
    recordedInput: Record<string, unknown> = input,
  ): Promise<T> {
    const callId = this.createId();
    await this.append({
      type: "tool.started",
      data: { runId, callId, toolName, input: jsonObject(recordedInput, `${toolName} input`) },
    });
    try {
      const output = await this.requireClient().callTool<T>(toolName, input);
      await this.append({
        type: "tool.completed",
        data: { runId, callId, toolName, output: sanitizeSessionJson(output) },
      });
      return output;
    } catch (error) {
      await this.append({
        type: "tool.failed",
        data: { runId, callId, toolName, error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  private async assertNoUnresolvedProjectEdit(): Promise<void> {
    const events = await this.store.read(this.sessionId);
    const terminalRunIds = new Set(events.flatMap((event) =>
      event.type === "run.completed" || event.type === "run.failed" ? [event.data.runId] : []));
    const unresolved = [...events].reverse().find((event) =>
      event.type === "run.started" && event.data.kind === "edit" && !terminalRunIds.has(event.data.runId));
    if (unresolved?.type === "run.started") {
      throw new Error(`Edit run ${unresolved.data.runId} is unfinished. Run /resume before starting another project edit.`);
    }
  }

  /** Commit an exact transaction at most twice. Replaying the same transaction
   * ID is safe because the backend operation log returns the original result. */
  private async commitProjectTransaction(
    runId: string,
    projectId: string,
    transaction: Record<string, unknown>,
  ): Promise<{ revision: number; transactionId: string }> {
    return commitExactProjectTransaction({
      callTool: <T>(targetRunId: string, toolName: string, input: Record<string, unknown>) =>
        this.callTool<T>(targetRunId, toolName, input),
    }, runId, projectId, transaction);
  }

  private async simulateCommitAndRecord(
    runId: string,
    projectId: string,
    transaction: Record<string, unknown>,
  ): Promise<{ revision: number; transactionId: string }> {
    return simulateCommitAndRecordProjectTransaction({
      callTool: <T>(targetRunId: string, toolName: string, input: Record<string, unknown>) =>
        this.callTool<T>(targetRunId, toolName, input),
      append: (input) => this.append(input),
    }, runId, projectId, transaction);
  }

  private async recordProjectEditFailure(runId: string, error: unknown): Promise<void> {
    if (error instanceof AttelierUncertainProjectCommitError) return;
    await this.append({ type: "run.failed", data: { runId, error: error instanceof Error ? error.message : String(error) } });
  }

  /** Recover only exact, durable project transactions from interrupted edit
   * runs. Nothing new is planned or generated during recovery. */
  async recoverProjectCommits(): Promise<ProjectCommitRecoveryResult> {
    this.requireClient();
    const initialEvents = await this.store.read(this.sessionId);
    const terminalRunIds = new Set(initialEvents.flatMap((event) =>
      event.type === "run.completed" || event.type === "run.failed" ? [event.data.runId] : []));
    const runIds = [...new Set(initialEvents.flatMap((event) =>
      event.type === "run.started" && event.data.kind === "edit" && !terminalRunIds.has(event.data.runId)
        ? [event.data.runId]
        : []))];
    const commits: ProjectCommitRecoveryResult["commits"] = [];
    const issues: ProjectCommitRecoveryResult["issues"] = [];

    for (const runId of runIds) {
      const events = await this.store.read(this.sessionId);
      const commitStarted = [...events].reverse().find((event) =>
        event.type === "tool.started" && event.data.runId === runId && event.data.toolName === "commit_transaction");
      const revisionEvent = [...events].reverse().find((event) =>
        event.type === "project.revision.created" && event.data.runId === runId);
      if (!commitStarted || commitStarted.type !== "tool.started") {
        const message = revisionEvent?.type === "project.revision.created"
          ? "The edit log contains a project revision without its durable commit request; recovery stopped without guessing."
          : "The edit was interrupted before a project commit was attempted; no project mutation was resumed.";
        if (revisionEvent?.type !== "project.revision.created") {
          await this.append({
            eventId: `project-commit-recovery-failed:${runId}:before-commit`,
            type: "run.failed",
            data: { runId, error: message },
          });
        }
        issues.push({ runId, message });
        continue;
      }

      let projectId: string;
      let transaction: Record<string, unknown>;
      let transactionId: string;
      try {
        projectId = string(commitStarted.data.input.projectId, "recovered commit projectId");
        transaction = record(commitStarted.data.input.transaction, "recovered commit transaction");
        transactionId = string(transaction.id, "recovered commit transaction.id");
      } catch (error) {
        issues.push({ runId, message: error instanceof Error ? error.message : String(error) });
        continue;
      }

      if (revisionEvent?.type === "project.revision.created") {
        if (revisionEvent.data.projectId !== projectId || revisionEvent.data.transactionId !== transactionId) {
          issues.push({
            runId,
            message: "The durable commit request and recorded project revision do not identify the same project transaction; recovery stopped without guessing.",
          });
          continue;
        }
        await this.append({
          eventId: `project-commit-recovery-complete:${runId}:${transactionId}`,
          type: "run.completed",
          data: { runId, summary: `Recovered project transaction ${transactionId} at revision ${revisionEvent.data.revision}.` },
        });
        commits.push({
          runId,
          projectId,
          transactionId,
          revision: revisionEvent.data.revision,
        });
        continue;
      }

      try {
        const recovered = await this.commitProjectTransaction(runId, projectId, transaction);
        await this.append({
          eventId: `project-revision-recovered:${runId}:${recovered.transactionId}`,
          type: "project.revision.created",
          data: { runId, projectId, revision: recovered.revision, transactionId: recovered.transactionId },
        });
        await this.append({
          eventId: `project-commit-recovery-complete:${runId}:${recovered.transactionId}`,
          type: "run.completed",
          data: { runId, summary: `Recovered project transaction ${recovered.transactionId} at revision ${recovered.revision}.` },
        });
        commits.push({ runId, projectId, ...recovered });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!(error instanceof AttelierUncertainProjectCommitError)) {
          await this.append({
            eventId: `project-commit-recovery-failed:${runId}:definitive`,
            type: "run.failed",
            data: { runId, error: message },
          });
        }
        issues.push({ runId, message });
      }
    }
    return { projection: await this.projection(), commits, issues };
  }

  async planEdit(input: PlanEditInput): Promise<{ projection: AttelierSessionProjection; plan: Record<string, unknown>; committedRevision?: number }> {
    const prompt = input.prompt.trim();
    if (!prompt) throw new Error("An edit instruction is required.");
    await this.assertNoUnresolvedProjectEdit();
    const current = await this.projection();
    if (!current.projectId) throw new Error("Select a project with /project before planning an edit.");
    const runId = this.createId();
    await this.append({
      type: "run.started",
      data: { runId, kind: input.commit ? "edit" : "plan", summary: prompt },
    });
    try {
      const plan = record(await this.callTool(runId, "plan_edit", {
        projectId: current.projectId,
        prompt,
        ...(input.selection ? { selection: input.selection } : {}),
      }), "plan_edit");
      const planId = string(plan.id, "plan_edit.id");
      const baseRevision = finiteNumber(plan.baseRevision, "plan_edit.baseRevision");
      const summary = string(plan.summary, "plan_edit.summary");
      const transaction = record(plan.transaction, "plan_edit.transaction");
      await this.callTool(runId, "simulate_transaction", { projectId: current.projectId, transaction });
      await this.append({
        type: "plan.updated",
        data: {
          runId,
          planId,
          projectId: current.projectId,
          baseRevision,
          summary,
          transaction: jsonObject(transaction, "plan transaction"),
        },
      });

      let committedRevision: number | undefined;
      if (input.commit) {
        const committed = await this.commitProjectTransaction(runId, current.projectId, transaction);
        committedRevision = committed.revision;
        await recordProjectRevision({ append: (event) => this.append(event) }, runId, current.projectId, committed);
      }
      await this.append({
        type: "run.completed",
        data: { runId, summary: input.commit ? `${summary} Applied at revision ${committedRevision}.` : `${summary} Simulated only.` },
      });
      return { projection: await this.projection(), plan, ...(committedRevision === undefined ? {} : { committedRevision }) };
    } catch (error) {
      await this.recordProjectEditFailure(runId, error);
      throw error;
    }
  }

  async applyPendingPlan(): Promise<AttelierSessionProjection> {
    await this.assertNoUnresolvedProjectEdit();
    const current = await this.projection();
    const pending = current.pendingPlan;
    if (!pending) throw new Error("This Attelier session has no pending simulated plan.");
    if (current.projectId !== pending.projectId) throw new Error("The pending plan belongs to a different project.");
    const runId = this.createId();
    await this.append({ type: "run.started", data: { runId, kind: "edit", summary: pending.summary } });
    try {
      const transaction = pending.transaction as Record<string, unknown>;
      const committed = await this.commitProjectTransaction(runId, pending.projectId, transaction);
      const revision = committed.revision;
      await recordProjectRevision({ append: (event) => this.append(event) }, runId, pending.projectId, committed);
      await this.append({ type: "run.completed", data: { runId, summary: `${pending.summary} Applied at revision ${revision}.` } });
      return this.projection();
    } catch (error) {
      await this.recordProjectEditFailure(runId, error);
      throw error;
    }
  }

  async inspectTool<T = unknown>(toolName: string, args: Record<string, unknown>, summary: string): Promise<T> {
    const runId = this.createId();
    await this.append({ type: "run.started", data: { runId, kind: "inspect", summary } });
    try {
      const result = await this.callTool<T>(runId, toolName, args);
      await this.append({ type: "run.completed", data: { runId, summary } });
      return result;
    } catch (error) {
      await this.append({ type: "run.failed", data: { runId, error: error instanceof Error ? error.message : String(error) } });
      throw error;
    }
  }

  async searchLibrary(input: {
    query?: string;
    kind?: "image" | "video" | "audio";
    limit?: number;
  } = {}): Promise<Record<string, unknown>> {
    return this.inspectTool<Record<string, unknown>>(
      "search_workspace_assets",
      {
        ...(input.query?.trim() ? { query: input.query.trim() } : {}),
        ...(input.kind ? { kind: input.kind } : {}),
        ...(input.limit === undefined ? {} : { limit: input.limit }),
      },
      input.query?.trim() ? `Search Library for ${input.query.trim()}` : "Browse media Library",
    );
  }

  async importWorkspaceAsset(workspaceAssetId: string): Promise<WorkspaceLibraryImportResult> {
    await this.assertNoUnresolvedProjectEdit();
    const current = await this.projection();
    if (!current.projectId) throw new Error("Select a project before importing Library media.");
    const normalizedId = workspaceAssetId.trim();
    if (!normalizedId) throw new Error("A Library asset ID is required.");
    const runId = this.createId();
    await this.append({ type: "run.started", data: { runId, kind: "edit", summary: `Import Library asset ${normalizedId}` } });
    try {
      const prepared = record(await this.callTool(runId, "prepare_workspace_asset_import", {
        projectId: current.projectId,
        assetId: normalizedId,
        expectedCurrentRevision: current.projectRevision ?? 0,
      }), "prepare_workspace_asset_import");
      const projectAssetId = string(prepared.projectAssetId, "prepare_workspace_asset_import.projectAssetId");
      const transaction = record(prepared.transaction, "prepare_workspace_asset_import.transaction");
      const committed = await this.simulateCommitAndRecord(runId, current.projectId, transaction);
      await this.append({
        type: "run.completed",
        data: { runId, summary: `${normalizedId} imported as ${projectAssetId} at revision ${committed.revision}.` },
      });
      return { workspaceAssetId: normalizedId, projectAssetId, revision: committed.revision };
    } catch (error) {
      await this.recordProjectEditFailure(runId, error);
      throw error;
    }
  }

  async analyzeReferenceUrl(sourceUrl: string, objective?: string): Promise<Record<string, unknown>> {
    const normalizedUrl = sourceUrl.trim();
    if (!normalizedUrl) throw new Error("A public reference URL is required.");
    const current = await this.projection();
    if (!current.projectId) throw new Error("Select a project with /project before analyzing a reference URL.");
    const runId = this.createId();
    await this.append({ type: "run.started", data: { runId, kind: "analysis", summary: `Analyze reference ${normalizedUrl}` } });
    try {
      const result = record(await this.callTool(runId, "analyze_reference_url", {
        projectId: current.projectId,
        sourceUrl: normalizedUrl,
        ...(objective?.trim() ? { objective: objective.trim() } : {}),
        rightsDeclaration: "public_reference_only",
        rightsNote: "Analyze structure and craft only. Do not reuse source media or treat this reference as training consent.",
      }), "analyze_reference_url");
      const draft = result.draft && typeof result.draft === "object" && !Array.isArray(result.draft)
        ? result.draft as Record<string, unknown>
        : {};
      const analysis = draft.analysis && typeof draft.analysis === "object" && !Array.isArray(draft.analysis)
        ? draft.analysis as Record<string, unknown>
        : {};
      const cost = analysis.cost && typeof analysis.cost === "object" && !Array.isArray(analysis.cost)
        ? analysis.cost as Record<string, unknown>
        : {};
      const estimatedAmount = typeof cost.estimatedUsd === "number" && Number.isFinite(cost.estimatedUsd)
        ? Math.max(0, cost.estimatedUsd)
        : 0;
      const model = typeof analysis.model === "string" ? analysis.model : null;
      const blueprint = result.blueprint && typeof result.blueprint === "object" && !Array.isArray(result.blueprint)
        ? result.blueprint as Record<string, unknown>
        : {};
      await this.append({
        eventId: `usage:${runId}:${String(blueprint.id ?? runId)}`,
        type: "usage.recorded",
        data: {
          runId,
          resourceType: "model",
          resourceId: String(blueprint.id ?? runId),
          providerId: "openai",
          model,
          currency: "USD",
          estimatedAmount,
          actualAmount: 0,
          pricingStatus: estimatedAmount > 0 ? "estimated" : "unavailable",
        },
      });
      await this.append({ type: "run.completed", data: { runId, summary: `Reference Blueprint ${String(blueprint.id ?? "saved")} is ready.` } });
      return result;
    } catch (error) {
      await this.append({ type: "run.failed", data: { runId, error: error instanceof Error ? error.message : String(error) } });
      throw error;
    }
  }

  async importLocalMedia(filePath: string): Promise<LocalMediaImportResult> {
    await this.assertNoUnresolvedProjectEdit();
    const current = await this.projection();
    if (!current.projectId) throw new Error("Select a project with /project before importing local media.");
    const resolvedPath = path.resolve(filePath.trim());
    const file = await stat(resolvedPath);
    if (!file.isFile()) throw new Error(`${resolvedPath} is not a regular file.`);
    if (!Number.isSafeInteger(file.size) || file.size <= 0) throw new Error("Local media must be a non-empty file with a safe byte size.");
    const fileName = path.basename(resolvedPath);
    const mimeType = mediaMimeType(resolvedPath);
    const contentHash = await sha256File(resolvedPath);
    const runId = this.createId();
    await this.append({ type: "run.started", data: { runId, kind: "edit", summary: `Import local media ${fileName}` } });
    try {
      const project = record(await this.callTool(runId, "inspect_project", { projectId: current.projectId }), "inspect_project");
      const baseRevision = finiteNumber(project.revision, "inspect_project.revision");
      const created = record(await this.callTool(runId, "create_upload", {
        fileName,
        mimeType,
        byteSize: file.size,
        contentHash,
      }), "create_upload");
      const uploadId = string(created.id, "create_upload.id");
      const deduplicated = created.deduplicated === true || created.status === "complete";
      if (created.status !== "complete") {
        let offset = finiteNumber(created.nextOffset ?? 0, "create_upload.nextOffset");
        const requestedChunkSize = finiteNumber(created.chunkSize ?? 8 * 1024 * 1024, "create_upload.chunkSize");
        const chunkSize = Math.max(1, Math.min(8 * 1024 * 1024, Math.trunc(requestedChunkSize)));
        const handle = await open(resolvedPath, "r");
        try {
          const buffer = Buffer.allocUnsafe(chunkSize);
          while (offset < file.size) {
            const length = Math.min(chunkSize, file.size - offset);
            const { bytesRead } = await handle.read(buffer, 0, length, offset);
            if (bytesRead <= 0) throw new Error(`Local media ended unexpectedly at byte ${offset}.`);
            const bytes = buffer.subarray(0, bytesRead);
            const uploaded = record(await this.callTool(runId, "upload_chunk", {
              uploadId,
              offset,
              base64: bytes.toString("base64"),
            }, {
              uploadId,
              offset,
              byteSize: bytesRead,
              contentHash,
            }), "upload_chunk");
            const nextOffset = finiteNumber(uploaded.nextOffset, "upload_chunk.nextOffset");
            if (nextOffset !== offset + bytesRead) throw new Error(`Upload authority returned an unexpected offset ${nextOffset}.`);
            offset = nextOffset;
          }
        } finally {
          await handle.close();
        }
        await this.callTool(runId, "complete_upload", { uploadId });
      }
      const workspaceAsset = record(await this.callTool(runId, "create_workspace_asset_from_upload", {
        uploadId,
        name: fileName,
        provenance: {
          origin: "upload",
          source: "atelier-headless",
          contentHash,
          rights: {
            declaration: "user_owned",
            license: "user-owned local media",
            publishable: true,
            ownershipConfirmed: true,
          },
        },
      }), "create_workspace_asset_from_upload");
      const workspaceAssetId = string(workspaceAsset.id, "create_workspace_asset_from_upload.id");
      const prepared = record(await this.callTool(runId, "prepare_workspace_asset_import", {
        projectId: current.projectId,
        assetId: workspaceAssetId,
        expectedCurrentRevision: baseRevision,
      }), "prepare_workspace_asset_import");
      const projectAssetId = string(prepared.projectAssetId, "prepare_workspace_asset_import.projectAssetId");
      const transaction = record(prepared.transaction, "prepare_workspace_asset_import.transaction");
      const committed = await this.simulateCommitAndRecord(runId, current.projectId, transaction);
      const revision = committed.revision;
      await this.append({ type: "run.completed", data: { runId, summary: `${fileName} imported at project revision ${revision}.` } });
      return {
        fileName,
        mimeType,
        byteSize: file.size,
        contentHash,
        uploadId,
        workspaceAssetId,
        projectAssetId,
        revision,
        deduplicated,
      };
    } catch (error) {
      await this.recordProjectEditFailure(runId, error);
      throw error;
    }
  }

  async placeProjectAsset(input: ProjectAssetPlacementInput): Promise<ProjectAssetPlacementResult> {
    await this.assertNoUnresolvedProjectEdit();
    const current = await this.projection();
    if (!current.projectId) throw new Error("Select a project with /project before placing media.");
    const assetId = input.assetId.trim();
    if (!assetId) throw new Error("A project asset ID is required.");
    const runId = this.createId();
    await this.append({ type: "run.started", data: { runId, kind: "edit", summary: `Place project asset ${assetId}` } });
    try {
      const project = record(await this.callTool(runId, "inspect_project", { projectId: current.projectId }), "inspect_project");
      const baseRevision = finiteNumber(project.revision, "inspect_project.revision");
      const prepared = record(await this.callTool(runId, "prepare_project_asset_placement", {
        projectId: current.projectId,
        assetId,
        expectedCurrentRevision: baseRevision,
        ...(input.trackId ? { trackId: input.trackId } : {}),
        ...(input.startSeconds === undefined ? {} : { startSeconds: input.startSeconds }),
        ...(input.sourceStartSeconds === undefined ? {} : { sourceStartSeconds: input.sourceStartSeconds }),
        ...(input.durationSeconds === undefined ? {} : { durationSeconds: input.durationSeconds }),
        ...(input.audioRole ? { audioRole: input.audioRole } : {}),
      }), "prepare_project_asset_placement");
      const transaction = record(prepared.transaction, "prepare_project_asset_placement.transaction");
      const element = record(prepared.element, "prepare_project_asset_placement.element");
      const committed = await this.simulateCommitAndRecord(runId, current.projectId, transaction);
      const revision = committed.revision;
      const trackId = string(prepared.trackId, "prepare_project_asset_placement.trackId");
      const elementId = string(element.id, "prepare_project_asset_placement.element.id");
      await this.append({ type: "run.completed", data: { runId, summary: `${assetId} placed as ${elementId} at project revision ${revision}.` } });
      return { assetId, elementId, trackId, createdTrack: prepared.createdTrack === true, revision };
    } catch (error) {
      await this.recordProjectEditFailure(runId, error);
      throw error;
    }
  }

  async searchMusicLibrary(input: {
    query: string;
    platform?: string;
    commercial?: boolean;
    instrumental?: boolean;
    limit?: number;
  }): Promise<Record<string, unknown>> {
    const query = input.query.trim();
    if (!query) throw new Error("A song title, artist, genre or mood is required.");
    return this.inspectTool<Record<string, unknown>>(
      "search_music_library",
      {
        query,
        ...(input.platform?.trim() ? { platform: input.platform.trim() } : {}),
        ...(input.commercial === undefined ? {} : { commercial: input.commercial }),
        ...(input.instrumental === undefined ? {} : { instrumental: input.instrumental }),
        ...(input.limit === undefined ? {} : { limit: input.limit }),
      },
      `Search rights-cleared music for ${query}`,
    );
  }

  async acquireFreeMusicTrack(trackId: string, commercial = true): Promise<Record<string, unknown>> {
    const normalizedId = trackId.trim();
    if (!/^(?:jamendo:)?\d+$/.test(normalizedId)) throw new Error("Use an exact Jamendo track ID returned by music search.");
    const runId = this.createId();
    await this.append({ type: "run.started", data: { runId, kind: "edit", summary: `Acquire free music ${normalizedId}` } });
    try {
      const result = await this.callTool<Record<string, unknown>>(runId, "acquire_free_music_track", {
        trackId: normalizedId,
        commercial,
      });
      const asset = record(result.asset, "acquire_free_music_track.asset");
      const assetId = string(asset.id, "acquire_free_music_track.asset.id");
      await this.append({ type: "run.completed", data: { runId, summary: `${normalizedId} saved to the Music Library as ${assetId}.` } });
      return result;
    } catch (error) {
      await this.append({ type: "run.failed", data: { runId, error: error instanceof Error ? error.message : String(error) } });
      throw error;
    }
  }

  async suggestMusicAssetMoments(assetId: string, durationSeconds = 12): Promise<MusicMoment[]> {
    const analysis = await this.analyzeAsset("analyze_audio", assetId);
    if (!analysis.artifact) throw new Error("Audio analysis completed without an artifact.");
    return suggestMusicMoments(analysis.artifact as Parameters<typeof suggestMusicMoments>[0], durationSeconds);
  }

  async placeMusicExcerpt(input: MusicExcerptPlacementInput): Promise<ProjectAssetPlacementResult> {
    const current = await this.projection();
    if (!current.projectId) throw new Error("Select a project before placing music.");
    const project = await this.inspectTool<Project>("inspect_project", { projectId: current.projectId }, `Inspect music asset ${input.assetId}`);
    const asset = project.assets.find(({ id }) => id === input.assetId);
    if (!asset) throw new Error(`Project asset ${input.assetId} not found.`);
    assertMusicAssetPublishable(asset, input);
    return this.placeProjectAsset({
      assetId: input.assetId,
      ...(input.trackId ? { trackId: input.trackId } : {}),
      ...(input.timelineStartSeconds === undefined ? {} : { startSeconds: input.timelineStartSeconds }),
      sourceStartSeconds: input.sourceStartSeconds,
      durationSeconds: input.durationSeconds,
      audioRole: "music",
    });
  }

  async analyzeAsset(
    capability: AttelierAnalysisCapability,
    assetId: string,
    options: { pollIntervalMs?: number; maxPolls?: number; onProgress?: (job: AttelierAnalysisJob) => void } = {},
  ): Promise<AnalysisRunResult> {
    await this.requireAiUnlocked();
    const current = await this.projection();
    if (!current.projectId) throw new Error("Select a project with /project before analyzing media.");
    const normalizedAssetId = assetId.trim();
    if (!normalizedAssetId) throw new Error("An asset ID is required for media analysis.");
    const runId = this.createId();
    await this.append({ type: "run.started", data: { runId, kind: "analysis", summary: `${capability} ${normalizedAssetId}` } });
    try {
      let job = analysisJob(await this.callTool(runId, "start_analysis_job", {
        projectId: current.projectId,
        assetId: normalizedAssetId,
        capability,
      }));
      options.onProgress?.(job);
      for (let attempt = 0; ["queued", "running"].includes(job.status) && attempt < (options.maxPolls ?? 1_200); attempt += 1) {
        await this.sleep(options.pollIntervalMs ?? 500);
        job = analysisJob(await this.callTool(runId, "get_analysis_job", { jobId: job.id }));
        options.onProgress?.(job);
      }
      if (["queued", "running"].includes(job.status)) throw new Error(`Analysis job ${job.id} did not finish before the polling limit.`);
      if (job.status !== "complete") throw new Error(job.error || `Analysis job ${job.id} failed.`);
      const artifactTool = capability === "transcribe"
        ? "get_transcript"
        : capability === "analyze_audio"
          ? "get_audio_analysis"
          : capability === "identify_music"
            ? "get_music_identification"
          : "get_video_reconstruction";
      const artifact = await this.callTool(runId, artifactTool, { projectId: current.projectId, assetId: normalizedAssetId });
      await this.append({ type: "run.completed", data: { runId, summary: `${capability} completed as ${job.id}.` } });
      return { job, artifact };
    } catch (error) {
      await this.append({ type: "run.failed", data: { runId, error: error instanceof Error ? error.message : String(error) } });
      throw error;
    }
  }

  /** Measure the hidden edit in a flattened source, then materialize those
   * source-linked ranges as ordinary deterministic timeline elements. The
   * analysis run finishes before the edit run begins, so interrupted commits
   * remain recoverable through the normal /resume path. */
  async reconstructVideo(
    assetId: string,
    options: { pollIntervalMs?: number; maxPolls?: number; onProgress?: (job: AttelierAnalysisJob) => void } = {},
  ): Promise<VideoReconstructionRunResult> {
    const normalizedAssetId = assetId.trim();
    if (!normalizedAssetId) throw new Error("An asset ID is required for video reconstruction.");
    const analysis = await this.analyzeAsset("reconstruct_video", normalizedAssetId, options);
    const artifact = videoReconstructionArtifact(analysis.artifact);
    await this.assertNoUnresolvedProjectEdit();
    const current = await this.projection();
    if (!current.projectId) throw new Error("Select a project with /project before reconstructing media.");
    if (artifact.projectId !== current.projectId || artifact.assetId !== normalizedAssetId) {
      throw new Error("Video reconstruction evidence does not match the selected project and asset.");
    }
    const runId = this.createId();
    await this.append({
      type: "run.started",
      data: { runId, kind: "edit", summary: `Materialize reconstructed shots for ${normalizedAssetId}` },
    });
    try {
      const inspected = record(
        await this.callTool(runId, "inspect_project", { projectId: current.projectId }),
        "inspect_project",
      );
      const baseRevision = finiteNumber(inspected.revision, "inspect_project.revision");
      const project = inspected as unknown as Project;
      const plan = buildVideoReconstructionOperations(project, artifact);
      const transaction: ProjectTransaction = {
        id: this.createId(),
        baseRevision,
        idempotencyKey: `reconstruct:${current.projectId}:${artifact.id}`,
        source: "agent",
        authorId: "atelier-headless",
        goal: plan.label,
        preconditions: [{ type: "assetExists", assetId: normalizedAssetId }],
        operations: plan.operations,
      };
      const committed = await this.simulateCommitAndRecord(
        runId,
        current.projectId,
        transaction as unknown as Record<string, unknown>,
      );
      await this.append({
        type: "run.completed",
        data: {
          runId,
          summary: `${plan.shotCount} source-linked shots materialized at project revision ${committed.revision}.`,
        },
      });
      return {
        analysisJobId: analysis.job.id,
        artifactId: artifact.id,
        assetId: normalizedAssetId,
        shotCount: plan.shotCount,
        trackId: plan.trackId,
        revision: committed.revision,
      };
    } catch (error) {
      await this.recordProjectEditFailure(runId, error);
      throw error;
    }
  }

  async listProjectVersions(): Promise<Record<string, unknown>> {
    const current = await this.projection();
    if (!current.projectId) throw new Error("Select a project with /project before listing versions.");
    const runId = this.createId();
    await this.append({ type: "run.started", data: { runId, kind: "version", summary: "List project versions" } });
    try {
      const versions = record(
        await this.callTool(runId, "list_project_versions", { projectId: current.projectId }),
        "list_project_versions",
      );
      await this.append({ type: "run.completed", data: { runId, summary: "Project versions inspected." } });
      return versions;
    } catch (error) {
      await this.append({ type: "run.failed", data: { runId, error: error instanceof Error ? error.message : String(error) } });
      throw error;
    }
  }

  async createCheckpoint(name: string, note?: string): Promise<Record<string, unknown>> {
    const normalizedName = name.trim();
    if (!normalizedName) throw new Error("Checkpoint name cannot be empty.");
    const current = await this.projection();
    if (!current.projectId) throw new Error("Select a project with /project before creating a checkpoint.");
    const runId = this.createId();
    await this.append({ type: "run.started", data: { runId, kind: "version", summary: `Checkpoint ${normalizedName}` } });
    try {
      const listed = record(
        await this.callTool(runId, "list_project_versions", { projectId: current.projectId }),
        "list_project_versions",
      );
      const currentRevision = finiteNumber(listed.currentRevision, "list_project_versions.currentRevision");
      const checkpoint = record(
        await this.callTool(runId, "create_project_version", {
          projectId: current.projectId,
          name: normalizedName,
          ...(note?.trim() ? { note: note.trim() } : {}),
          expectedCurrentRevision: currentRevision,
        }),
        "create_project_version",
      );
      await this.append({ type: "run.completed", data: { runId, summary: `Checkpoint ${normalizedName} saved at revision ${currentRevision}.` } });
      return checkpoint;
    } catch (error) {
      await this.append({ type: "run.failed", data: { runId, error: error instanceof Error ? error.message : String(error) } });
      throw error;
    }
  }

  async restoreProjectRevision(
    target: number | "previous" | "redo",
  ): Promise<{ projection: AttelierSessionProjection; previousRevision: number; targetRevision: number; revision: number }> {
    const current = await this.projection();
    if (!current.projectId) throw new Error("Select a project with /project before restoring a revision.");
    const intent = target === "previous" ? "undo" : target === "redo" ? "redo" : "restore";
    const runId = this.createId();
    await this.append({ type: "run.started", data: { runId, kind: "version", summary: `${intent} project revision` } });
    try {
      const listed = record(
        await this.callTool(runId, "list_project_versions", { projectId: current.projectId }),
        "list_project_versions",
      );
      const previousRevision = finiteNumber(listed.currentRevision, "list_project_versions.currentRevision");
      let targetRevision: number;
      if (target === "previous") {
        if (previousRevision <= 0) throw new Error("Project is already at its first revision.");
        targetRevision = previousRevision - 1;
      } else if (target === "redo") {
        if (!current.lastRestore || current.lastRestore.intent !== "undo" || current.lastRestore.revision !== previousRevision) {
          throw new Error("There is no uninterrupted Attelier undo to redo. Use /restore REVISION explicitly.");
        }
        targetRevision = current.lastRestore.previousRevision;
      } else {
        targetRevision = target;
      }
      if (!Number.isInteger(targetRevision) || targetRevision < 0) throw new Error("Target revision must be a non-negative integer.");
      if (targetRevision === previousRevision) throw new Error(`Project is already at revision ${targetRevision}.`);
      await this.callTool(runId, "compare_project_versions", {
        projectId: current.projectId,
        leftRevision: targetRevision,
        rightRevision: previousRevision,
      });
      const restored = record(
        await this.callTool(runId, "restore_project_version", {
          projectId: current.projectId,
          targetRevision,
          expectedCurrentRevision: previousRevision,
          acknowledgeCreatesNewRevision: true,
        }),
        "restore_project_version",
      );
      const revision = finiteNumber(restored.revision, "restore_project_version.revision");
      await this.append({
        type: "project.revision.restored",
        data: { runId, projectId: current.projectId, intent, previousRevision, targetRevision, revision },
      });
      await this.append({
        type: "run.completed",
        data: { runId, summary: `Restored revision ${targetRevision} as new revision ${revision}.` },
      });
      return { projection: await this.projection(), previousRevision, targetRevision, revision };
    } catch (error) {
      await this.append({ type: "run.failed", data: { runId, error: error instanceof Error ? error.message : String(error) } });
      throw error;
    }
  }

  /** The last state written per job, so a poll that saw nothing new writes nothing. */
  private readonly recordedJobStates = new Map<string, string>();

  private async recordRecoveredCapabilityJob(runId: string, job: CapabilityJob): Promise<void> {
    const status = job.status;
    if (!["queued", "running", "complete", "failed", "cancelled"].includes(status)) {
      throw new Error(`Capability job ${job.id} returned unsupported status ${String(status)}.`);
    }
    const progress = Math.max(0, Math.min(1, finiteNumber(job.progress, `capability job ${job.id}.progress`)));
    const updatedAt = finiteNumber(job.updatedAt, `capability job ${job.id}.updatedAt`);
    // One event per visible change: a new status, or progress moving by 5%.
    // A terminal status always lands, whatever was written before.
    const signature = `${status}:${Math.round(progress * 20)}`;
    const terminal = !["queued", "running"].includes(status);
    if (!terminal && this.recordedJobStates.get(job.id) === signature) return;
    this.recordedJobStates.set(job.id, signature);
    await this.append({
      eventId: `capability-job:${runId}:${job.id}:${updatedAt}:${status}:${Math.round(progress * 1_000_000)}`,
      type: "capability.job.updated",
      data: {
        runId,
        jobId: string(job.id, "capability job id"),
        capability: string(job.capability, "capability job capability"),
        providerId: string(job.providerId, "capability job provider"),
        status,
        progress,
        jobUpdatedAt: updatedAt,
      },
    });
  }

  private async capabilityQuoteForRun(
    events: readonly AttelierSessionEvent[],
    runId: string,
    quoteId: string,
  ): Promise<CapabilityQuote> {
    const completed = [...events].reverse().find((event) => {
      if (event.type !== "tool.completed" || event.data.runId !== runId) return false;
      if (event.data.toolName !== "quote_capability") return false;
      const output = event.data.output;
      return Boolean(output && typeof output === "object" && !Array.isArray(output) && output.id === quoteId);
    });
    if (completed?.type === "tool.completed") return completed.data.output as unknown as CapabilityQuote;

    // Legacy/shared sessions may contain the compact quote event without the
    // original tool observation. Read the exact server quote without inventing
    // provider, expiry or policy fields and without mutating the run history.
    const loaded = await this.requireClient().callTool<CapabilityQuote | undefined>("get_capability_quote", { quoteId });
    if (!loaded || loaded.id !== quoteId) throw new Error(`Capability quote ${quoteId} is unavailable.`);
    return loaded;
  }

  /**
   * Persist routing and an exact quote, but do not approve, reserve or execute.
   * A UI may disappear after this response and later continue the same run.
   */
  async prepareCapability(input: CapabilityPrepareInput): Promise<CapabilityPrepareResult> {
    await this.requireAiUnlocked();
    this.requireClient();
    const capability = input.capability.trim();
    if (!capability) throw new Error("A capability ID is required.");
    const runId = input.runId?.trim() || this.createId();
    if (!runId || runId.length > 200) throw new Error("Capability runId must contain 1 to 200 characters.");
    const idempotencyKey = input.idempotencyKey?.trim() || `atelier-session-${this.sessionId}-${runId}`;
    if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      throw new Error("Capability idempotencyKey must contain 8 to 200 characters.");
    }
    const session = await this.projection();
    const mediaFamily = mediaFamilyForCapability(capability);
    const mediaRouting = session.mediaRouters[mediaFamily];
    const routedInput = jsonObject({
      ...input.input,
      ...(mediaRouting.mode === "auto" && mediaRouting.policy === "quality"
        ? qualityCapabilityParameters(capability, input.input)
        : {}),
      ...(mediaRouting.mode === "pinned"
        ? { routingTier: "manual", providerId: mediaRouting.modelId }
        : {
            routingTier: mediaRouting.policy === "cost"
              ? "draft"
              : mediaRouting.policy === "quality"
                ? "best"
                : "final",
          }),
    }, "capability input");
    let events = await this.store.read(this.sessionId);
    const existingRequest = events.find((event) =>
      event.type === "capability.requested" && event.data.runId === runId);
    if (existingRequest?.type === "capability.requested") {
      if (
        existingRequest.data.capability !== capability ||
        existingRequest.data.idempotencyKey !== idempotencyKey ||
        JSON.stringify(existingRequest.data.input) !== JSON.stringify(routedInput)
      ) {
        throw new Error(`Capability run ${runId} was already prepared with a different request.`);
      }
      const quoted = [...events].reverse().find((event) =>
        event.type === "capability.quoted" && event.data.runId === runId);
      if (quoted?.type === "capability.quoted") {
        const decision = [...events].reverse().find((event) =>
          event.type === "approval.resolved" && event.data.runId === runId && event.data.quoteId === quoted.data.quoteId);
        return {
          runId,
          quote: await this.capabilityQuoteForRun(events, runId, quoted.data.quoteId),
          readyForApproval: !decision,
          ...(decision?.type === "approval.resolved" && decision.data.decision === "blocked" ? { reason: "budget" as const } : {}),
        };
      }
    } else {
      await this.append({
        eventId: `capability-run:${runId}:started`,
        type: "run.started",
        data: { runId, kind: "capability", summary: `Run ${capability}` },
      });
      await this.append({
        eventId: `capability-run:${runId}:requested`,
        type: "capability.requested",
        data: { runId, capability, input: routedInput, idempotencyKey },
      });
    }

    {
      const quote = await this.callTool<CapabilityQuote>(runId, "quote_capability", { capability, input: routedInput });
      await this.append({
        eventId: `capability-run:${runId}:route`,
        type: "routing.decision.recorded",
        data: {
          runId,
          target: mediaFamily,
          intent: capability,
          policy: quote.routingDecision?.policy ?? (mediaRouting.mode === "pinned" ? "manual" : mediaRouting.policy),
          selectedId: quote.routingDecision?.selectedId ?? quote.providerId,
          candidateIds: quote.routingDecision?.candidateIds ?? [quote.providerId],
          reason: quote.routingExplanation,
          registryVersion: quote.routingDecision?.registryVersion ?? ATTELIER_ROUTE_EVIDENCE_VERSION,
          fallback: quote.routingDecision?.fallback ?? false,
        },
      });
      await this.append({
        eventId: `capability-run:${runId}:quote:${quote.id}`,
        type: "capability.quoted",
        data: {
          runId,
          quoteId: quote.id,
          capability,
          providerId: quote.providerId,
          model: quote.model,
          currency: quote.currency,
          amount: quote.amount,
          approvalRequired: quote.approvalRequired,
          reservationRequired: quote.reservationRequired,
        },
      });
      const beforeApproval = await this.projection();
      const committedExposure = beforeApproval.usage.actualAmount +
        beforeApproval.usage.reservedAmount +
        beforeApproval.usage.pendingReconciliationAmount;
      if (beforeApproval.budgetUsd !== null && committedExposure + quote.amount > beforeApproval.budgetUsd + Number.EPSILON) {
        await this.append({
          eventId: `capability-run:${runId}:approval:blocked`,
          type: "approval.resolved",
          data: { runId, quoteId: quote.id, decision: "blocked", actor: "harness" },
        });
        await this.append({
          eventId: `capability-run:${runId}:budget-blocked`,
          type: "run.completed",
          data: { runId, summary: `Blocked ${capability}: the $${quote.amount.toFixed(4)} quote exceeds the session budget.` },
        });
        return { runId, quote, readyForApproval: false, reason: "budget" };
      }
      return { runId, quote, readyForApproval: true };
    }
  }

  /** Close a capability run that no prepared state backs any more so the
   * projection stops offering it, and leave one durable chat note. Idempotent:
   * a run that already has a terminal event keeps its original evidence. */
  private async settleUnpreparedCapabilityRun(events: readonly AttelierSessionEvent[], runId: string): Promise<void> {
    const terminal = events.some((event) =>
      (event.type === "run.completed" || event.type === "run.failed" ||
        event.type === "run.interrupted" || event.type === "run.cancelled") &&
      event.data.runId === runId);
    if (terminal) return;
    await this.append({
      eventId: `capability-run:${runId}:unprepared`,
      type: "run.interrupted",
      data: { runId, message: CAPABILITY_RUN_INTERRUPTED_MESSAGE },
    });
    await this.append({
      eventId: `capability-run:${runId}:unprepared-note`,
      type: "message.appended",
      data: { role: "assistant", content: CAPABILITY_RUN_INTERRUPTED_MESSAGE, audience: "ui" },
    });
  }

  /** Advance one previously prepared capability run. Repeated calls only
   * observe/replay its durable quote, reservation and idempotent provider job. */
  async continueCapability(input: CapabilityContinueInput): Promise<CapabilityContinueResult> {
    if (input.approved !== false) await this.requireAiUnlocked();
    this.requireClient();
    const runId = input.runId.trim();
    if (!runId) throw new Error("A capability runId is required.");
    let events = await this.store.read(this.sessionId);
    const request = [...events].reverse().find((event) =>
      event.type === "capability.requested" && event.data.runId === runId);
    const quoted = [...events].reverse().find((event) =>
      event.type === "capability.quoted" && event.data.runId === runId);
    if (request?.type !== "capability.requested" || quoted?.type !== "capability.quoted") {
      await this.settleUnpreparedCapabilityRun(events, runId);
      throw new CapabilityRunNotPreparedError(runId);
    }
    const quote = await this.capabilityQuoteForRun(events, runId, quoted.data.quoteId);
    let decision = [...events].reverse().find((event) =>
      event.type === "approval.resolved" && event.data.runId === runId && event.data.quoteId === quote.id);
    if (decision?.type === "approval.resolved") {
      const durableApproval = decision.data.decision === "approved";
      if (input.approved !== undefined && durableApproval !== input.approved) {
        throw new Error(`Capability run ${runId} already has a different durable approval decision.`);
      }
      if (decision.data.decision === "blocked") {
        return { runId, projection: await this.projection(), quote, approved: false, reason: "budget" };
      }
      if (decision.data.decision === "declined") {
        return { runId, projection: await this.projection(), quote, approved: false, reason: "declined" };
      }
    } else {
      if (input.approved === undefined) throw new Error(`Capability run ${runId} still requires an approval decision.`);
      decision = await this.append({
        eventId: `capability-run:${runId}:approval:${input.approved ? "approved" : "declined"}`,
        type: "approval.resolved",
        data: {
          runId,
          quoteId: quote.id,
          decision: input.approved ? "approved" : "declined",
          actor: input.actor ?? "user",
        },
      });
      if (!input.approved) {
        await this.append({
          eventId: `capability-run:${runId}:declined`,
          type: "run.completed",
          data: { runId, summary: `Declined ${request.data.capability} before reservation or execution.` },
        });
        return { runId, projection: await this.projection(), quote, approved: false, reason: "declined" };
      }
      events = await this.store.read(this.sessionId);
    }

    const recovered = await this.recoverCapabilityJobs({
      runIds: [runId],
      waitForTerminal: input.waitForTerminal ?? false,
      ...(input.pollIntervalMs === undefined ? {} : { pollIntervalMs: input.pollIntervalMs }),
      ...(input.maxPolls === undefined ? {} : { maxPolls: input.maxPolls }),
      ...(input.onProgress ? { onProgress: input.onProgress } : {}),
    });
    const issue = recovered.issues.find((candidate) => candidate.runId === runId);
    if (issue) throw new Error(issue.message);
    const job = recovered.jobs.find((candidate) => {
      const observation = recovered.projection.capabilityJobs.find(({ runId: candidateRunId, jobId }) =>
        candidateRunId === runId && jobId === candidate.id);
      return Boolean(observation);
    });
    const refreshed = await this.store.read(this.sessionId);
    const reserved = [...refreshed].reverse().find((event) =>
      event.type === "spend.reserved" && event.data.runId === runId && event.data.quoteId === quote.id);
    let reservation: CapabilityReservation | undefined;
    if (reserved?.type === "spend.reserved") {
      const completed = [...refreshed].reverse().find((event) =>
        event.type === "tool.completed" && event.data.runId === runId && event.data.toolName === "reserve_capability_quote" &&
        event.data.output && typeof event.data.output === "object" && !Array.isArray(event.data.output) &&
        event.data.output.id === reserved.data.reservationId);
      if (completed?.type === "tool.completed") reservation = completed.data.output as unknown as CapabilityReservation;
    }
    return {
      runId,
      projection: recovered.projection,
      quote,
      approved: true,
      ...(reservation ? { reservation } : {}),
      ...(job ? { job } : {}),
    };
  }

  /** Continue only capability runs whose exact request and creator approval are
   * already durable. Reservation and job start are safe to replay because both
   * retain the original quote and idempotency key. */
  async recoverCapabilityJobs(options: CapabilityRecoveryOptions = {}): Promise<CapabilityRecoveryResult> {
    await this.requireAiUnlocked();
    this.requireClient();
    return coordinateCapabilityRecovery({
      sessionId: this.sessionId,
      readEvents: () => this.store.read(this.sessionId),
      projection: () => this.projection(),
      append: (event) => this.append(event),
      callTool: <T>(runId: string, toolName: string, input: Record<string, unknown>) =>
        this.callTool<T>(runId, toolName, input),
      readJob: (jobId) => this.requireClient().callTool<CapabilityJob>("get_capability_job", { jobId }),
      sleep: (milliseconds) => this.sleep(milliseconds),
      recordJob: (runId, job) => this.recordRecoveredCapabilityJob(runId, job),
    }, options);
  }

  async cancelCapabilityJob(jobId: string): Promise<{ projection: AttelierSessionProjection; job: CapabilityJob }> {
    const normalizedJobId = jobId.trim();
    if (!normalizedJobId) throw new Error("A capability job ID is required.");
    const runId = this.createId();
    await this.append({ type: "run.started", data: { runId, kind: "capability", summary: `Cancel job ${normalizedJobId}` } });
    try {
      const job = await this.callTool<CapabilityJob>(runId, "cancel_capability_job", { jobId: normalizedJobId });
      const events = await this.store.read(this.sessionId);
      const originalUpdate = [...events].reverse().find((event) =>
        event.type === "capability.job.updated" && event.data.jobId === normalizedJobId);
      const startedJob = [...events].reverse().find((event) => {
        if (event.type !== "tool.completed" || event.data.toolName !== "start_capability_job") return false;
        const output = event.data.output;
        if (output === null || typeof output !== "object" || Array.isArray(output)) return false;
        return output.id === normalizedJobId;
      });
      const originalRunId = originalUpdate?.type === "capability.job.updated"
        ? originalUpdate.data.runId
        : startedJob?.type === "tool.completed"
          ? startedJob.data.runId
          : undefined;
      await this.append({
        type: "capability.job.updated",
        data: {
          runId: originalRunId ?? runId,
          jobId: job.id,
          capability: job.capability,
          providerId: job.providerId,
          status: job.status,
          progress: Math.max(0, Math.min(1, job.progress)),
          jobUpdatedAt: job.updatedAt,
        },
      });
      if (originalRunId && !["queued", "running"].includes(job.status)) {
        const reserved = [...events].reverse().find((event) =>
          event.type === "spend.reserved" && event.data.runId === originalRunId && event.data.reservationId === job.reservationId);
        if (reserved?.type === "spend.reserved") {
          const type = capabilitySpendCloseType(job);
          await this.append({
            eventId: `spend-close:${originalRunId}:${reserved.data.reservationId}`,
            type,
            data: {
              runId: originalRunId,
              reservationId: reserved.data.reservationId,
              currency: reserved.data.currency,
              amount: reserved.data.amount,
            },
          });
        }
        const quoted = [...events].reverse().find((event) =>
          event.type === "capability.quoted" && event.data.runId === originalRunId);
        const actualAmount = job.pricing.status === "pending_reconciliation"
          ? 0
          : typeof job.actualCost === "number" && Number.isFinite(job.actualCost)
            ? job.actualCost
            : job.status === "complete"
              ? job.estimatedCost
              : 0;
        await this.append({
          eventId: `usage:${originalRunId}:${job.id}`,
          type: "usage.recorded",
          data: {
            runId: originalRunId,
            resourceType: "capability",
            resourceId: job.id,
            providerId: job.providerId,
            model: quoted?.type === "capability.quoted" ? quoted.data.model : null,
            currency: "USD",
            estimatedAmount: job.estimatedCost,
            actualAmount,
          },
        });
        const originalTerminal = events.some((event) =>
          (event.type === "run.completed" || event.type === "run.failed" || event.type === "run.interrupted" || event.type === "run.cancelled") && event.data.runId === originalRunId);
        if (!originalTerminal) {
          await this.append({
            eventId: `run-cancelled:${originalRunId}:${job.id}`,
            type: "run.failed",
            data: { runId: originalRunId, error: `Job ${job.id} was cancelled by the user.` },
          });
        }
      }
      await this.append({
        type: "run.completed",
        data: { runId, summary: `Job ${job.id} is ${job.status}.` },
      });
      return { projection: await this.projection(), job };
    } catch (error) {
      await this.append({ type: "run.failed", data: { runId, error: error instanceof Error ? error.message : String(error) } });
      throw error;
    }
  }

  private async ensureWorkflowTranscript(
    runId: string,
    projectId: string,
    assetId: string,
    options: Pick<SourceVariantsRunInput, "onAnalysisProgress" | "pollIntervalMs" | "maxPolls">,
  ): Promise<boolean> {
    const existing = await this.callTool<unknown>(runId, "get_transcript", { projectId, assetId });
    if (existing !== null && existing !== undefined) return false;
    let job = analysisJob(await this.callTool(runId, "start_analysis_job", {
      projectId,
      assetId,
      capability: "transcribe",
    }));
    options.onAnalysisProgress?.(job);
    for (let attempt = 0; ["queued", "running"].includes(job.status) && attempt < (options.maxPolls ?? 1_200); attempt += 1) {
      await this.sleep(options.pollIntervalMs ?? 500);
      job = analysisJob(await this.callTool(runId, "get_analysis_job", { jobId: job.id }));
      options.onAnalysisProgress?.(job);
    }
    if (["queued", "running"].includes(job.status)) {
      throw new Error(`Transcription job ${job.id} did not finish before the polling limit.`);
    }
    if (job.status !== "complete") throw new Error(job.error || `Transcription job ${job.id} failed.`);
    const transcript = await this.callTool<unknown>(runId, "get_transcript", { projectId, assetId });
    if (transcript === null || transcript === undefined) {
      throw new Error(`Transcription job ${job.id} completed without a transcript artifact.`);
    }
    return true;
  }

  private workflowCoordinator(): WorkflowSessionCoordinator {
    return new WorkflowSessionCoordinator({
      sessionId: this.sessionId,
      createId: this.createId,
      sleep: this.sleep,
      projection: () => this.projection(),
      readEvents: () => this.store.read(this.sessionId),
      append: (input) => this.append(input),
      appendMessage: (role, content) => this.appendMessage(role, content),
      callTool: <T>(runId: string, toolName: string, input: Record<string, unknown>) =>
        this.callTool<T>(runId, toolName, input),
      requireAiUnlocked: () => this.requireAiUnlocked(),
      ensureTranscript: (runId, projectId, assetId, options) =>
        this.ensureWorkflowTranscript(runId, projectId, assetId, options),
    });
  }

  async runSourceToVariants(input: SourceVariantsRunInput): Promise<SourceVariantsRunResult> {
    return this.workflowCoordinator().runSourceToVariants(input);
  }

  async approveWorkflowRun(
    workflowRunId: string,
    note = "Approved after creator review in the Attelier terminal.",
    options: Pick<SourceVariantsRunInput, "onWorkflowProgress" | "pollIntervalMs" | "maxPolls"> = {},
  ): Promise<AttelierWorkflowRun> {
    return this.workflowCoordinator().approveRun(workflowRunId, note, options);
  }

  async listWorkflowRuns(projectId?: string): Promise<AttelierWorkflowRun[]> {
    return this.workflowCoordinator().listRuns(projectId);
  }

  async getWorkflowRun(workflowRunId: string): Promise<AttelierWorkflowRun> {
    return this.workflowCoordinator().getRun(workflowRunId);
  }

  async resumeWorkflowRun(workflowRunId: string, stageId?: string, reason?: string): Promise<AttelierWorkflowRun> {
    await this.requireAiUnlocked();
    return this.workflowCoordinator().mutateRun(
      "resume_workflow_run",
      workflowRunId,
      "Resume",
      { ...(stageId ? { stageId } : {}), ...(reason ? { reason } : {}) },
    );
  }

  async cancelWorkflowRun(workflowRunId: string): Promise<AttelierWorkflowRun> {
    return this.workflowCoordinator().mutateRun("cancel_workflow_run", workflowRunId, "Cancel");
  }

  private renderCoordinator(): RenderSessionCoordinator {
    return new RenderSessionCoordinator({
      sessionId: this.sessionId,
      createId: this.createId,
      sleep: this.sleep,
      projection: () => this.projection(),
      append: (input) => this.append(input),
      callTool: <T>(runId: string, toolName: string, input: Record<string, unknown>) =>
        this.callTool<T>(runId, toolName, input),
    });
  }

  async runRender(input: RenderRunInput): Promise<RenderRunResult> {
    return this.renderCoordinator().run(input);
  }

  async recoverRenderJobs(options: {
    waitForTerminal?: boolean;
    pollIntervalMs?: number;
    maxPolls?: number;
    onProgress?: (job: AttelierRenderJob) => void;
  } = {}): Promise<RenderRecoveryResult> {
    return this.renderCoordinator().recover(options);
  }

  async cancelRenderJob(jobId: string): Promise<{ projection: AttelierSessionProjection; job: AttelierRenderJob }> {
    return this.renderCoordinator().cancel(jobId);
  }

  async runCapability(input: CapabilityRunInput): Promise<CapabilityRunResult> {
    const prepared = await this.prepareCapability({
      capability: input.capability,
      input: input.input,
    });
    if (!prepared.readyForApproval) {
      return { quote: prepared.quote, approved: false, reason: prepared.reason ?? "budget" };
    }

    const approved = await input.approve(prepared.quote);
    let started = false;
    const continued = await this.continueCapability({
      runId: prepared.runId,
      approved,
      actor: "user",
      waitForTerminal: approved,
      ...(input.pollIntervalMs === undefined ? {} : { pollIntervalMs: input.pollIntervalMs }),
      ...(input.maxPolls === undefined ? {} : { maxPolls: input.maxPolls }),
      onProgress: (job) => {
        if (!started) {
          started = true;
          input.onStarted?.(job);
        }
        input.onProgress?.(job);
      },
    });
    const job = continued.job;
    if (!approved) return { quote: continued.quote, approved: false, reason: "declined" };
    if (!job) throw new Error(`Capability run ${prepared.runId} did not return a provider job.`);
    if (["queued", "running"].includes(job.status)) {
      const cancelled = await this.cancelCapabilityJob(job.id);
      input.onProgress?.(cancelled.job);
      throw new Error(`Capability job ${job.id} did not finish before the polling limit.`);
    }
    if (job.status !== "complete") {
      throw new Error(job.error || `Capability job ${job.id} ended ${job.status}.`);
    }
    return {
      quote: continued.quote,
      approved: true,
      ...(continued.reservation ? { reservation: continued.reservation } : {}),
      job,
    };
  }
}
