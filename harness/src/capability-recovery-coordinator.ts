import type {
  AttelierSessionEvent,
  AttelierSessionEventInput,
  AttelierSessionProjection,
} from "@attelier/agent-schema";
import type { CapabilityJob, CapabilityReservation } from "@attelier/capability-schema";

export type CapabilityRecoveryOptions = {
  /** One probe by default; terminal clients may explicitly wait. */
  waitForTerminal?: boolean;
  pollIntervalMs?: number;
  maxPolls?: number;
  onProgress?: (job: CapabilityJob) => void;
  /** Limit recovery to exact durable runs, used by stateless UI transports. */
  runIds?: readonly string[];
};

export type CapabilityRecoveryResult = {
  projection: AttelierSessionProjection;
  jobs: CapabilityJob[];
  issues: Array<{ runId: string; message: string }>;
};

export type CapabilityRecoveryCoordinatorPort = {
  sessionId: string;
  readEvents(): Promise<AttelierSessionEvent[]>;
  projection(): Promise<AttelierSessionProjection>;
  append(input: AttelierSessionEventInput): Promise<unknown>;
  callTool<T>(runId: string, toolName: string, input: Record<string, unknown>): Promise<T>;
  /** Read a job's state without writing a tool event: polling is not evidence. */
  readJob(jobId: string): Promise<CapabilityJob>;
  sleep(milliseconds: number): Promise<void>;
  recordJob(runId: string, job: CapabilityJob): Promise<void>;
};

const requiredString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} returned an invalid string.`);
  return value;
};

const requiredRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} returned an invalid object.`);
  return value as Record<string, unknown>;
};

const spendCloseType = (
  job: Pick<CapabilityJob, "status" | "pricing">,
): "spend.settled" | "spend.reconciliation_pending" | "spend.released" =>
  job.pricing.status === "pending_reconciliation"
    ? "spend.reconciliation_pending"
    : job.status === "complete"
      ? "spend.settled"
      : "spend.released";

/** Resume only runs with an exact durable request, quote and approval.
 * Provider approval, reservation and start are replayed with their original
 * identifiers so a transport or process death cannot duplicate spend. */
export const recoverCapabilityJobs = async (
  port: CapabilityRecoveryCoordinatorPort,
  options: CapabilityRecoveryOptions = {},
): Promise<CapabilityRecoveryResult> => {
  const initialEvents = await port.readEvents();
  // Every terminal outcome closes a run: appending a second one is rejected by
  // the projection, so an interrupted or cancelled run is never resumed here.
  const terminalRunIds = new Set(initialEvents.flatMap((event) =>
    event.type === "run.completed" || event.type === "run.failed" ||
    event.type === "run.interrupted" || event.type === "run.cancelled"
      ? [event.data.runId]
      : []));
  const requestedRunIds = options.runIds
    ? new Set(options.runIds.map((runId) => runId.trim()).filter(Boolean))
    : null;
  const runIds = [...new Set(initialEvents.flatMap((event) =>
    event.type === "run.started" && event.data.kind === "capability" && !terminalRunIds.has(event.data.runId)
      ? [event.data.runId]
      : []))].filter((runId) => requestedRunIds === null || requestedRunIds.has(runId));
  const jobs: CapabilityJob[] = [];
  const issues: CapabilityRecoveryResult["issues"] = [];

  for (const runId of runIds) {
    try {
      const events = await port.readEvents();
      const requestedEvent = [...events].reverse().find((event) =>
        event.type === "capability.requested" && event.data.runId === runId);
      const legacyQuoteCall = [...events].reverse().find((event) =>
        event.type === "tool.started" && event.data.runId === runId && event.data.toolName === "quote_capability");
      const quoted = [...events].reverse().find((event) =>
        event.type === "capability.quoted" && event.data.runId === runId);
      if (!quoted || quoted.type !== "capability.quoted") {
        await port.append({
          eventId: `capability-recovery-failed:${runId}:before-quote`,
          type: "run.failed",
          data: { runId, error: "Capability request was interrupted before an exact quote was recorded; no job was resumed." },
        });
        continue;
      }
      const approval = [...events].reverse().find((event) =>
        event.type === "approval.resolved" && event.data.runId === runId && event.data.quoteId === quoted.data.quoteId);
      if (!approval || approval.type !== "approval.resolved") {
        await port.append({
          eventId: `capability-recovery-failed:${runId}:before-approval`,
          type: "run.failed",
          data: { runId, error: "Capability request was interrupted before creator approval; no reservation or job was resumed." },
        });
        continue;
      }
      if (approval.data.decision !== "approved") {
        await port.append({
          eventId: `capability-recovery-closed:${runId}:${approval.data.decision}`,
          type: "run.completed",
          data: { runId, summary: `Capability request remained ${approval.data.decision}; no job was started.` },
        });
        continue;
      }

      const request = requestedEvent?.type === "capability.requested"
        ? {
            capability: requestedEvent.data.capability,
            input: requestedEvent.data.input as Record<string, unknown>,
            idempotencyKey: requestedEvent.data.idempotencyKey,
          }
        : legacyQuoteCall?.type === "tool.started"
          ? {
              capability: requiredString(legacyQuoteCall.data.input.capability, "legacy capability request"),
              input: requiredRecord(legacyQuoteCall.data.input.input, "legacy capability input"),
              idempotencyKey: `atelier-session-${port.sessionId}-${runId}`,
            }
          : undefined;
      const latestJobEvent = [...events].reverse().find((event) =>
        event.type === "capability.job.updated" && event.data.runId === runId);
      const completedStart = [...events].reverse().find((event) =>
        event.type === "tool.completed" && event.data.runId === runId && event.data.toolName === "start_capability_job");
      const completedStartOutput = completedStart?.type === "tool.completed" && completedStart.data.output &&
        typeof completedStart.data.output === "object" && !Array.isArray(completedStart.data.output)
        ? completedStart.data.output as Record<string, unknown>
        : undefined;
      let jobId = latestJobEvent?.type === "capability.job.updated"
        ? latestJobEvent.data.jobId
        : typeof completedStartOutput?.id === "string"
          ? completedStartOutput.id
          : undefined;
      if (!request && !jobId) {
        throw new Error("This legacy capability run has neither a durable request nor a recoverable job ID.");
      }

      const providerApprovalCompleted = events.some((event) =>
        event.type === "tool.completed" &&
        event.data.runId === runId &&
        event.data.toolName === "approve_capability_quote");
      if (quoted.data.approvalRequired && !providerApprovalCompleted) {
        await port.callTool(runId, "approve_capability_quote", { quoteId: quoted.data.quoteId });
      }
      let reserved = [...events].reverse().find((event) =>
        event.type === "spend.reserved" && event.data.runId === runId && event.data.quoteId === quoted.data.quoteId);
      if (quoted.data.reservationRequired && (!reserved || reserved.type !== "spend.reserved")) {
        const reservation = await port.callTool<CapabilityReservation>(runId, "reserve_capability_quote", { quoteId: quoted.data.quoteId });
        await port.append({
          eventId: `spend-reserved:${runId}:${reservation.id}`,
          type: "spend.reserved",
          data: {
            runId,
            reservationId: reservation.id,
            quoteId: reservation.quoteId,
            currency: reservation.currency,
            amount: reservation.amount,
          },
        });
        const refreshed = await port.readEvents();
        reserved = [...refreshed].reverse().find((event) =>
          event.type === "spend.reserved" && event.data.runId === runId && event.data.quoteId === quoted.data.quoteId);
      }

      let job: CapabilityJob;
      if (jobId) {
        job = await port.callTool<CapabilityJob>(runId, "get_capability_job", { jobId });
      } else {
        if (!request) throw new Error("Capability request metadata is unavailable for idempotent restart.");
        job = await port.callTool<CapabilityJob>(runId, "start_capability_job", {
          capability: request.capability,
          input: request.input,
          quoteId: quoted.data.quoteId,
          ...(reserved?.type === "spend.reserved" ? { reservationId: reserved.data.reservationId } : {}),
          idempotencyKey: request.idempotencyKey,
        });
        jobId = job.id;
      }
      await port.recordJob(runId, job);
      options.onProgress?.(job);
      const maxPolls = options.waitForTerminal ? options.maxPolls ?? 1_200 : 0;
      for (let attempt = 0; ["queued", "running"].includes(job.status) && attempt < maxPolls; attempt += 1) {
        await port.sleep(options.pollIntervalMs ?? 500);
        // Every poll used to append tool.started/tool.completed: a five-minute
        // provider queue left 1,300 events on the session. A quiet read keeps
        // the session's story to what changed.
        job = await port.readJob(job.id);
        await port.recordJob(runId, job);
        options.onProgress?.(job);
      }
      jobs.push(job);
      if (["queued", "running"].includes(job.status)) continue;

      if (reserved?.type === "spend.reserved") {
        await port.append({
          eventId: `spend-close:${runId}:${reserved.data.reservationId}`,
          type: spendCloseType(job),
          data: {
            runId,
            reservationId: reserved.data.reservationId,
            currency: reserved.data.currency,
            amount: reserved.data.amount,
          },
        });
      }
      const actualAmount = job.pricing.status === "pending_reconciliation"
        ? 0
        : typeof job.actualCost === "number" && Number.isFinite(job.actualCost)
          ? job.actualCost
          : job.status === "complete"
            ? job.estimatedCost
            : 0;
      await port.append({
        eventId: `usage:${runId}:${job.id}`,
        type: "usage.recorded",
        data: {
          runId,
          resourceType: "capability",
          resourceId: job.id,
          providerId: job.providerId,
          model: quoted.data.model,
          currency: "USD",
          estimatedAmount: job.estimatedCost,
          actualAmount,
        },
      });
      if (job.status === "complete") {
        await port.append({
          eventId: `capability-run:${runId}:${job.id}:complete`,
          type: "run.completed",
          data: { runId, summary: `${job.capability} completed as job ${job.id}.` },
        });
      } else {
        await port.append({
          eventId: `capability-run:${runId}:${job.id}:${job.status}`,
          type: "run.failed",
          data: { runId, error: job.error || `Capability job ${job.id} ended ${job.status}.` },
        });
      }
    } catch (error) {
      issues.push({ runId, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { projection: await port.projection(), jobs, issues };
};
