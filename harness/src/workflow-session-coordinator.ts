import type {
  AttelierSessionEvent,
  AttelierSessionEventInput,
  AttelierSessionProjection,
} from "@attelier/agent-schema";
import type { AttelierAnalysisJob } from "./analysis-session-contracts.js";

export type AttelierWorkflowRun = {
  id: string;
  kind: string;
  projectId: string;
  state: "running" | "awaiting_approval" | "failed" | "cancelled" | "completed";
  currentStageId?: string;
  estimatedCostUsd: number;
  actualCostUsd: number;
  error?: string;
  updatedAt: number;
  branches: Array<{ projectId: string; label: string; studioUrl: string }>;
  stages: Array<{ id: string; state: string; attempt: number; error?: string }>;
  attemptHistory?: Array<{ stageId: string; attempt: number; state: string; error?: string }>;
};

export type AttelierWorkflowQuote = {
  id: string;
  kind: string;
  currency: "USD";
  estimatedCostUsd: number;
  estimatedRuntimeMs: number;
  approvalRequired: boolean;
  approvedAt?: number;
  status: "quoted" | "used" | "expired";
  expiresAt: number;
};

export type SourceVariantsRunInput = {
  assetId: string;
  count?: number;
  targetDurationSeconds?: number;
  aspectRatio?: "9:16" | "1:1" | "16:9";
  approve: (quote: AttelierWorkflowQuote) => Promise<boolean>;
  onAnalysisProgress?: (job: AttelierAnalysisJob) => void;
  onWorkflowProgress?: (run: AttelierWorkflowRun) => void;
  pollIntervalMs?: number;
  maxPolls?: number;
};

export type SourceVariantsRunResult = {
  quote: AttelierWorkflowQuote;
  approved: boolean;
  transcriptCreated: boolean;
  reason?: "declined" | "budget";
  workflow?: AttelierWorkflowRun;
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

const WORKFLOW_STATES: readonly AttelierWorkflowRun["state"][] = [
  "running",
  "awaiting_approval",
  "failed",
  "cancelled",
  "completed",
];

export const parseWorkflowRun = (value: unknown): AttelierWorkflowRun => {
  const item = record(value, "workflow run");
  const state = string(item.state, "workflow run state") as AttelierWorkflowRun["state"];
  if (!WORKFLOW_STATES.includes(state)) throw new Error(`workflow run returned unsupported state ${state}.`);
  const branches = (Array.isArray(item.branches) ? item.branches : []).map((value, index) => {
    const branch = record(value, `workflow branch ${index + 1}`);
    return {
      projectId: string(branch.projectId, `workflow branch ${index + 1} projectId`),
      label: string(branch.label, `workflow branch ${index + 1} label`),
      studioUrl: string(branch.studioUrl, `workflow branch ${index + 1} studioUrl`),
    };
  });
  const stages = (Array.isArray(item.stages) ? item.stages : []).map((value, index) => {
    const stage = record(value, `workflow stage ${index + 1}`);
    return {
      id: string(stage.id, `workflow stage ${index + 1} id`),
      state: string(stage.state, `workflow stage ${index + 1} state`),
      attempt: finiteNumber(stage.attempt, `workflow stage ${index + 1} attempt`),
      ...(typeof stage.error === "string" ? { error: stage.error } : {}),
    };
  });
  return {
    id: string(item.id, "workflow run id"),
    kind: string(item.kind, "workflow run kind"),
    projectId: string(item.projectId, "workflow run projectId"),
    state,
    ...(typeof item.currentStageId === "string" ? { currentStageId: item.currentStageId } : {}),
    estimatedCostUsd: finiteNumber(item.estimatedCostUsd, "workflow run estimatedCostUsd"),
    actualCostUsd: finiteNumber(item.actualCostUsd, "workflow run actualCostUsd"),
    ...(typeof item.error === "string" ? { error: item.error } : {}),
    updatedAt: finiteNumber(item.updatedAt, "workflow run updatedAt"),
    branches,
    stages,
    ...(Array.isArray(item.attemptHistory) ? {
      attemptHistory: item.attemptHistory.map((value) => {
        const attempt = record(value, "workflow stage attempt");
        return {
          stageId: string(attempt.stageId, "workflow stage attempt stageId"),
          attempt: finiteNumber(attempt.attempt, "workflow stage attempt attempt"),
          state: string(attempt.state, "workflow stage attempt state"),
          ...(typeof attempt.error === "string" ? { error: attempt.error } : {}),
        };
      }),
    } : {}),
  };
};

export const parseWorkflowQuote = (value: unknown): AttelierWorkflowQuote => {
  const item = record(value, "workflow quote");
  const status = string(item.status, "workflow quote status") as AttelierWorkflowQuote["status"];
  if (!(["quoted", "used", "expired"] as const).includes(status)) {
    throw new Error(`workflow quote returned unsupported status ${status}.`);
  }
  if (item.currency !== "USD") throw new Error("workflow quote returned unsupported currency.");
  return {
    id: string(item.id, "workflow quote id"),
    kind: string(item.kind, "workflow quote kind"),
    currency: "USD",
    estimatedCostUsd: finiteNumber(item.estimatedCostUsd, "workflow quote estimatedCostUsd"),
    estimatedRuntimeMs: finiteNumber(item.estimatedRuntimeMs, "workflow quote estimatedRuntimeMs"),
    approvalRequired: item.approvalRequired === true,
    ...(typeof item.approvedAt === "number" ? { approvedAt: finiteNumber(item.approvedAt, "workflow quote approvedAt") } : {}),
    status,
    expiresAt: finiteNumber(item.expiresAt, "workflow quote expiresAt"),
  };
};

export type WorkflowSessionCoordinatorPorts = {
  sessionId: string;
  createId: () => string;
  sleep: (milliseconds: number) => Promise<void>;
  projection: () => Promise<AttelierSessionProjection>;
  readEvents: () => Promise<AttelierSessionEvent[]>;
  append: (input: AttelierSessionEventInput) => Promise<unknown>;
  appendMessage: (role: "user" | "assistant" | "system", content: string) => Promise<AttelierSessionProjection>;
  callTool: <T = unknown>(runId: string, toolName: string, input: Record<string, unknown>) => Promise<T>;
  requireAiUnlocked: () => Promise<void>;
  ensureTranscript: (runId: string, projectId: string, assetId: string, options: SourceVariantsRunInput) => Promise<boolean>;
};

export class WorkflowSessionCoordinator {
  constructor(private readonly ports: WorkflowSessionCoordinatorPorts) {}

  private async recordUsage(runId: string, workflow: AttelierWorkflowRun): Promise<void> {
    if (!["completed", "failed", "cancelled"].includes(workflow.state)) return;
    const events = await this.ports.readEvents();
    const prior = events.filter((event) =>
      event.type === "usage.recorded" && event.data.resourceType === "workflow" && event.data.resourceId === workflow.id);
    const previousEstimated = prior.reduce((sum, event) =>
      sum + (event.type === "usage.recorded" ? event.data.estimatedAmount : 0), 0);
    const previousActual = prior.reduce((sum, event) =>
      sum + (event.type === "usage.recorded" ? event.data.actualAmount : 0), 0);
    const estimatedAmount = Math.max(0, workflow.estimatedCostUsd - previousEstimated);
    const actualAmount = Math.max(0, workflow.actualCostUsd - previousActual);
    if (estimatedAmount <= Number.EPSILON && actualAmount <= Number.EPSILON) return;
    await this.ports.append({
      eventId: `workflow-usage:${workflow.id}:${workflow.updatedAt}`,
      type: "usage.recorded",
      data: {
        runId,
        resourceType: "workflow",
        resourceId: workflow.id,
        providerId: "atelier-workflow",
        model: null,
        currency: "USD",
        estimatedAmount,
        actualAmount,
        pricingStatus: "actual",
      },
    });
  }

  private async waitForRun(
    runId: string,
    initial: AttelierWorkflowRun,
    options: Pick<SourceVariantsRunInput, "onWorkflowProgress" | "pollIntervalMs" | "maxPolls"> = {},
  ): Promise<AttelierWorkflowRun> {
    let workflow = initial;
    options.onWorkflowProgress?.(workflow);
    for (let attempt = 0; workflow.state === "running" && attempt < (options.maxPolls ?? 240); attempt += 1) {
      await this.ports.sleep(options.pollIntervalMs ?? 250);
      workflow = parseWorkflowRun(await this.ports.callTool(runId, "get_workflow_run", { runId: workflow.id }));
      options.onWorkflowProgress?.(workflow);
    }
    await this.recordUsage(runId, workflow);
    return workflow;
  }

  async runSourceToVariants(input: SourceVariantsRunInput): Promise<SourceVariantsRunResult> {
    await this.ports.requireAiUnlocked();
    const current = await this.ports.projection();
    if (!current.projectId) throw new Error("Select a project with /project before creating source variants.");
    const assetId = input.assetId.trim();
    if (!assetId) throw new Error("A source asset ID is required.");
    const count = input.count ?? 3;
    const targetDurationSeconds = input.targetDurationSeconds ?? 30;
    const aspectRatio = input.aspectRatio ?? "9:16";
    if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error("Variant count must be an integer from 1 to 10.");
    if (!Number.isFinite(targetDurationSeconds) || targetDurationSeconds < 5 || targetDurationSeconds > 180) {
      throw new Error("Variant duration must be from 5 to 180 seconds.");
    }
    if (!["9:16", "1:1", "16:9"].includes(aspectRatio)) throw new Error("Variant aspect ratio must be 9:16, 1:1 or 16:9.");
    const runId = this.ports.createId();
    await this.ports.append({ type: "run.started", data: { runId, kind: "workflow", summary: `Create ${count} source-led variant(s) from ${assetId}` } });
    try {
      const transcriptCreated = await this.ports.ensureTranscript(runId, current.projectId, assetId, input);
      const quote = parseWorkflowQuote(await this.ports.callTool(runId, "quote_workflow", {
        kind: "long_form_to_shorts",
        input: { projectId: current.projectId, assetId, count, targetDurationSeconds, aspectRatio },
      }));
      const beforeApproval = await this.ports.projection();
      const committedExposure = Math.max(beforeApproval.usage.actualAmount, beforeApproval.usage.estimatedAmount) +
        beforeApproval.usage.reservedAmount + beforeApproval.usage.pendingReconciliationAmount;
      if (beforeApproval.budgetUsd !== null && committedExposure + quote.estimatedCostUsd > beforeApproval.budgetUsd + Number.EPSILON) {
        await this.ports.append({ type: "approval.resolved", data: { runId, quoteId: quote.id, decision: "blocked", actor: "harness" } });
        await this.ports.appendMessage("assistant", `Source-to-variants was blocked before execution: the $${quote.estimatedCostUsd.toFixed(4)} workflow quote exceeds this session's remaining budget.`);
        await this.ports.append({ type: "run.completed", data: { runId, summary: "Source-to-variants blocked before workflow execution by the session budget." } });
        return { quote, approved: false, transcriptCreated, reason: "budget" };
      }
      const approved = await input.approve(quote);
      await this.ports.append({ type: "approval.resolved", data: { runId, quoteId: quote.id, decision: approved ? "approved" : "declined", actor: "user" } });
      if (!approved) {
        await this.ports.append({ type: "run.completed", data: { runId, summary: "Source-to-variants declined before workflow execution." } });
        return { quote, approved: false, transcriptCreated, reason: "declined" };
      }
      if (quote.approvalRequired && !quote.approvedAt) {
        parseWorkflowQuote(await this.ports.callTool(runId, "approve_workflow_quote", { quoteId: quote.id }));
      }
      let workflow = parseWorkflowRun(await this.ports.callTool(runId, "start_workflow_run", {
        quoteId: quote.id,
        idempotencyKey: `atelier-variants-${this.ports.sessionId}-${runId}`,
      }));
      workflow = await this.waitForRun(runId, workflow, input);
      const summary = workflow.state === "awaiting_approval"
        ? `Source-to-variants ${workflow.id} is ready for creator review at ${workflow.currentStageId ?? "the next gate"}.`
        : workflow.state === "completed"
          ? `Source-to-variants ${workflow.id} created ${workflow.branches.length} editable branch(es).`
          : workflow.state === "running"
            ? `Source-to-variants ${workflow.id} continues durably in the backend.`
            : `Source-to-variants ${workflow.id} is ${workflow.state}${workflow.error ? `: ${workflow.error}` : "."}`;
      await this.ports.appendMessage("assistant", summary);
      await this.ports.append({ type: "run.completed", data: { runId, summary } });
      return { quote, approved: true, transcriptCreated, workflow };
    } catch (error) {
      await this.ports.append({ type: "run.failed", data: { runId, error: error instanceof Error ? error.message : String(error) } });
      throw error;
    }
  }

  async approveRun(
    workflowRunId: string,
    note = "Approved after creator review in the Attelier terminal.",
    options: Pick<SourceVariantsRunInput, "onWorkflowProgress" | "pollIntervalMs" | "maxPolls"> = {},
  ): Promise<AttelierWorkflowRun> {
    await this.ports.requireAiUnlocked();
    const normalized = workflowRunId.trim();
    if (!normalized) throw new Error("A workflow run ID is required.");
    const runId = this.ports.createId();
    await this.ports.append({ type: "run.started", data: { runId, kind: "workflow", summary: `Approve workflow ${normalized}` } });
    try {
      let workflow = parseWorkflowRun(await this.ports.callTool(runId, "approve_workflow_run", { runId: normalized, decision: "approve", note }));
      workflow = await this.waitForRun(runId, workflow, options);
      const summary = workflow.state === "awaiting_approval"
        ? `Workflow ${workflow.id} advanced to creator review at ${workflow.currentStageId ?? "the next gate"}.`
        : workflow.state === "completed"
          ? `Workflow ${workflow.id} completed with ${workflow.branches.length} editable branch(es).`
          : `Workflow ${workflow.id} is ${workflow.state}${workflow.error ? `: ${workflow.error}` : "."}`;
      await this.ports.appendMessage("assistant", summary);
      await this.ports.append({ type: "run.completed", data: { runId, summary } });
      return workflow;
    } catch (error) {
      await this.ports.append({ type: "run.failed", data: { runId, error: error instanceof Error ? error.message : String(error) } });
      throw error;
    }
  }

  async listRuns(projectId?: string): Promise<AttelierWorkflowRun[]> {
    const current = await this.ports.projection();
    const selectedProjectId = projectId?.trim() || current.projectId || undefined;
    const runId = this.ports.createId();
    await this.ports.append({ type: "run.started", data: { runId, kind: "workflow", summary: "List durable workflows" } });
    try {
      const result = await this.ports.callTool<unknown>(runId, "list_workflow_runs", {
        ...(selectedProjectId ? { projectId: selectedProjectId } : {}),
        limit: 100,
      });
      if (!Array.isArray(result)) throw new Error("list_workflow_runs returned an invalid list.");
      const runs = result.map(parseWorkflowRun);
      await this.ports.append({ type: "run.completed", data: { runId, summary: `Found ${runs.length} durable workflow run(s).` } });
      return runs;
    } catch (error) {
      await this.ports.append({ type: "run.failed", data: { runId, error: error instanceof Error ? error.message : String(error) } });
      throw error;
    }
  }

  async getRun(workflowRunId: string): Promise<AttelierWorkflowRun> {
    const normalized = workflowRunId.trim();
    if (!normalized) throw new Error("A workflow run ID is required.");
    const runId = this.ports.createId();
    await this.ports.append({ type: "run.started", data: { runId, kind: "workflow", summary: `Inspect workflow ${normalized}` } });
    try {
      const workflow = parseWorkflowRun(await this.ports.callTool(runId, "get_workflow_run", { runId: normalized }));
      await this.ports.append({ type: "run.completed", data: { runId, summary: `Workflow ${workflow.id} is ${workflow.state}.` } });
      return workflow;
    } catch (error) {
      await this.ports.append({ type: "run.failed", data: { runId, error: error instanceof Error ? error.message : String(error) } });
      throw error;
    }
  }

  async mutateRun(
    toolName: "resume_workflow_run" | "cancel_workflow_run",
    workflowRunId: string,
    action: string,
    args: Record<string, unknown> = {},
  ): Promise<AttelierWorkflowRun> {
    const normalized = workflowRunId.trim();
    if (!normalized) throw new Error("A workflow run ID is required.");
    const runId = this.ports.createId();
    await this.ports.append({ type: "run.started", data: { runId, kind: "workflow", summary: `${action} workflow ${normalized}` } });
    try {
      const workflow = parseWorkflowRun(await this.ports.callTool(runId, toolName, { runId: normalized, ...args }));
      await this.ports.append({ type: "run.completed", data: { runId, summary: `Workflow ${workflow.id} is ${workflow.state}.` } });
      return workflow;
    } catch (error) {
      await this.ports.append({ type: "run.failed", data: { runId, error: error instanceof Error ? error.message : String(error) } });
      throw error;
    }
  }
}
