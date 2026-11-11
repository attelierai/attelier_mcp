import type {
  AttelierSessionEventInput,
  AttelierSessionProjection,
} from "@attelier/agent-schema";

export type AttelierRenderFormat = "mp4" | "webm" | "mov" | "audio" | "image_sequence";

export type AttelierRenderQuote = {
  id: string;
  projectId: string;
  revision: number;
  format: AttelierRenderFormat;
  currency: "USD";
  estimatedCostUsd: number;
  estimatedRuntimeMs: number;
  costBasis: string;
  approvalRequired: boolean;
  expiresAt: number;
};

export type AttelierRenderJob = {
  id: string;
  projectId: string;
  revision: number;
  format: AttelierRenderFormat;
  status: "queued" | "running" | "complete" | "failed" | "cancelled" | "rejected";
  progress: number;
  updatedAt: number;
  outputUrl?: string;
  error?: string;
  qc?: unknown;
};

export type RenderRunInput = {
  format?: AttelierRenderFormat;
  approve: (quote: AttelierRenderQuote) => Promise<boolean>;
  onStarted?: (job: AttelierRenderJob) => void;
  onProgress?: (job: AttelierRenderJob) => void;
  pollIntervalMs?: number;
  maxPolls?: number;
};

export type RenderRunResult = {
  quote: AttelierRenderQuote;
  approved: boolean;
  reason?: "declined" | "budget";
  job?: AttelierRenderJob;
  evaluation?: unknown;
};

export type RenderRecoveryResult = {
  projection: AttelierSessionProjection;
  jobs: AttelierRenderJob[];
  issues: Array<{ jobId: string; message: string }>;
};

const RENDER_FORMATS: readonly AttelierRenderFormat[] = ["mp4", "webm", "mov", "audio", "image_sequence"];
const RENDER_STATUSES: readonly AttelierRenderJob["status"][] = ["queued", "running", "complete", "failed", "cancelled", "rejected"];

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

export const parseRenderQuote = (value: unknown): AttelierRenderQuote => {
  const item = record(value, "render quote");
  const format = string(item.format, "render quote format") as AttelierRenderFormat;
  if (!RENDER_FORMATS.includes(format)) throw new Error(`render quote returned unsupported format ${format}.`);
  if (item.currency !== "USD") throw new Error("render quote returned unsupported currency.");
  return {
    id: string(item.id, "render quote id"),
    projectId: string(item.projectId, "render quote projectId"),
    revision: finiteNumber(item.revision, "render quote revision"),
    format,
    currency: "USD",
    estimatedCostUsd: finiteNumber(item.estimatedCostUsd, "render quote estimatedCostUsd"),
    estimatedRuntimeMs: finiteNumber(item.estimatedRuntimeMs, "render quote estimatedRuntimeMs"),
    costBasis: string(item.costBasis, "render quote costBasis"),
    approvalRequired: item.approvalRequired === true,
    expiresAt: finiteNumber(item.expiresAt, "render quote expiresAt"),
  };
};

export const parseRenderJob = (value: unknown): AttelierRenderJob => {
  const item = record(value, "render job");
  const format = string(item.format, "render job format") as AttelierRenderFormat;
  const status = string(item.status, "render job status") as AttelierRenderJob["status"];
  if (!RENDER_FORMATS.includes(format)) throw new Error(`render job returned unsupported format ${format}.`);
  if (!RENDER_STATUSES.includes(status)) throw new Error(`render job returned unsupported status ${status}.`);
  const progress = finiteNumber(item.progress, "render job progress");
  if (progress < 0 || progress > 1) throw new Error("render job progress must be from 0 to 1.");
  return {
    id: string(item.id, "render job id"),
    projectId: string(item.projectId, "render job projectId"),
    revision: finiteNumber(item.revision, "render job revision"),
    format,
    status,
    progress,
    updatedAt: finiteNumber(item.updatedAt, "render job updatedAt"),
    ...(typeof item.outputUrl === "string" ? { outputUrl: item.outputUrl } : {}),
    ...(typeof item.error === "string" ? { error: item.error } : {}),
    ...(item.qc === undefined ? {} : { qc: item.qc }),
  };
};

export type RenderSessionCoordinatorPorts = {
  sessionId: string;
  createId: () => string;
  sleep: (milliseconds: number) => Promise<void>;
  projection: () => Promise<AttelierSessionProjection>;
  append: (input: AttelierSessionEventInput) => Promise<unknown>;
  callTool: <T = unknown>(runId: string, toolName: string, input: Record<string, unknown>) => Promise<T>;
};

export class RenderSessionCoordinator {
  constructor(private readonly ports: RenderSessionCoordinatorPorts) {}

  private async recordJob(runId: string, job: AttelierRenderJob): Promise<void> {
    await this.ports.append({
      type: "render.job.updated",
      data: {
        runId,
        jobId: job.id,
        projectId: job.projectId,
        revision: job.revision,
        format: job.format,
        status: job.status,
        progress: job.progress,
        jobUpdatedAt: job.updatedAt,
      },
    });
  }

  async run(input: RenderRunInput): Promise<RenderRunResult> {
    const current = await this.ports.projection();
    if (!current.projectId) throw new Error("Select a project with /project before rendering.");
    const format = input.format ?? "mp4";
    if (!RENDER_FORMATS.includes(format)) throw new Error(`Unsupported render format ${format}.`);
    const runId = this.ports.createId();
    const idempotencyKey = `atelier-render-${this.ports.sessionId}-${runId}`;
    let quote: AttelierRenderQuote | undefined;
    let job: AttelierRenderJob | undefined;
    try {
      await this.ports.append({ type: "run.started", data: { runId, kind: "render", summary: `Render ${format}` } });
      quote = parseRenderQuote(await this.ports.callTool(runId, "quote_render", { projectId: current.projectId, format }));
      const committed = Math.max(current.usage.actualAmount, current.usage.estimatedAmount) +
        current.usage.reservedAmount + current.usage.pendingReconciliationAmount;
      if (current.budgetUsd !== null && committed + quote.estimatedCostUsd > current.budgetUsd) {
        await this.ports.append({ type: "approval.resolved", data: { runId, quoteId: quote.id, decision: "blocked", actor: "harness" } });
        await this.ports.append({ type: "run.completed", data: { runId, summary: "Render blocked by the session budget before start." } });
        return { quote, approved: false, reason: "budget" };
      }
      const approved = await input.approve(quote);
      await this.ports.append({
        type: "approval.resolved",
        data: { runId, quoteId: quote.id, decision: approved ? "approved" : "declined", actor: "user" },
      });
      if (!approved) {
        await this.ports.append({ type: "run.completed", data: { runId, summary: "Render declined before start." } });
        return { quote, approved: false, reason: "declined" };
      }
      if (quote.approvalRequired) await this.ports.callTool(runId, "approve_render_quote", { quoteId: quote.id });
      job = parseRenderJob(await this.ports.callTool(runId, "start_render_job", { quoteId: quote.id, idempotencyKey }));
      await this.recordJob(runId, job);
      input.onStarted?.(job);
      input.onProgress?.(job);
      for (let attempt = 0; ["queued", "running"].includes(job.status) && attempt < (input.maxPolls ?? 3_600); attempt += 1) {
        await this.ports.sleep(input.pollIntervalMs ?? 1_000);
        job = parseRenderJob(await this.ports.callTool(runId, "get_render_job", { jobId: job.id }));
        await this.recordJob(runId, job);
        input.onProgress?.(job);
      }
      if (["queued", "running"].includes(job.status)) {
        throw new Error(`Render job ${job.id} did not reach a terminal state before the polling limit.`);
      }
      const evaluation = job.status === "complete"
        ? await this.ports.callTool(runId, "evaluate_render", { jobId: job.id, profile: "general-video-v1" })
        : undefined;
      await this.ports.append({
        eventId: `usage:${runId}:${job.id}`,
        type: "usage.recorded",
        data: {
          runId,
          resourceType: "render",
          resourceId: job.id,
          providerId: "atelier-local",
          model: "native-renderer",
          currency: "USD",
          estimatedAmount: quote.estimatedCostUsd,
          actualAmount: 0,
          pricingStatus: quote.estimatedCostUsd > 0 ? "estimated" : "actual",
        },
      });
      if (job.status !== "complete") throw new Error(job.error || `Render job ${job.id} ended ${job.status}.`);
      await this.ports.append({ type: "run.completed", data: { runId, summary: `Render ${job.id} completed and passed through delivery QC.` } });
      return { quote, approved: true, job, ...(evaluation === undefined ? {} : { evaluation }) };
    } catch (error) {
      await this.ports.append({ type: "run.failed", data: { runId, error: error instanceof Error ? error.message : String(error) } });
      throw error;
    }
  }

  async recover(options: {
    waitForTerminal?: boolean;
    pollIntervalMs?: number;
    maxPolls?: number;
    onProgress?: (job: AttelierRenderJob) => void;
  } = {}): Promise<RenderRecoveryResult> {
    const before = await this.ports.projection();
    const active = before.renderJobs.filter(({ status }) => status === "queued" || status === "running");
    const jobs: AttelierRenderJob[] = [];
    const issues: Array<{ jobId: string; message: string }> = [];
    for (const projected of active) {
      const runId = this.ports.createId();
      try {
        await this.ports.append({ type: "run.started", data: { runId, kind: "render", summary: `Recover render ${projected.jobId}` } });
        let job = parseRenderJob(await this.ports.callTool(runId, "get_render_job", { jobId: projected.jobId }));
        await this.recordJob(runId, job);
        options.onProgress?.(job);
        const maxPolls = options.waitForTerminal ? options.maxPolls ?? 3_600 : 0;
        for (let attempt = 0; ["queued", "running"].includes(job.status) && attempt < maxPolls; attempt += 1) {
          await this.ports.sleep(options.pollIntervalMs ?? 1_000);
          job = parseRenderJob(await this.ports.callTool(runId, "get_render_job", { jobId: job.id }));
          await this.recordJob(runId, job);
          options.onProgress?.(job);
        }
        jobs.push(job);
        await this.ports.append({ type: "run.completed", data: { runId, summary: `Render ${job.id} is ${job.status}.` } });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        issues.push({ jobId: projected.jobId, message });
        await this.ports.append({ type: "run.failed", data: { runId, error: message } });
      }
    }
    return { projection: await this.ports.projection(), jobs, issues };
  }

  async cancel(jobId: string): Promise<{ projection: AttelierSessionProjection; job: AttelierRenderJob }> {
    const normalized = jobId.trim();
    if (!normalized) throw new Error("A render job ID is required.");
    const runId = this.ports.createId();
    await this.ports.append({ type: "run.started", data: { runId, kind: "render", summary: `Cancel render ${normalized}` } });
    try {
      const job = parseRenderJob(await this.ports.callTool(runId, "cancel_render_job", { jobId: normalized }));
      await this.recordJob(runId, job);
      await this.ports.append({ type: "run.completed", data: { runId, summary: `Render ${job.id} is ${job.status}.` } });
      return { projection: await this.ports.projection(), job };
    } catch (error) {
      await this.ports.append({ type: "run.failed", data: { runId, error: error instanceof Error ? error.message : String(error) } });
      throw error;
    }
  }
}
