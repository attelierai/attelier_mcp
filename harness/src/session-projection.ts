import {
  ATTELIER_MEDIA_FAMILIES,
  ATTELIER_SESSION_SCHEMA_VERSION,
  type AttelierMediaRouters,
  type AttelierModelSelection,
  type AttelierRoutingPolicy,
  type AttelierSessionEvent,
  type AttelierSessionProjection,
  type AttelierSessionRunProjection,
} from "@attelier/agent-schema";

const EVENT_TYPES = new Set<AttelierSessionEvent["type"]>([
  "history.cleared",
  "action.updated", "review.created", "tool.policy.changed", "turn.requested", "turn.finished", "proposal.created", "proposal.resolved",
  "session.created",
  "session.resumed",
  "message.appended",
  "goal.changed",
  "model.changed",
  "ai.lock.changed",
  "media_routing.changed",
  "media_router.changed",
  "routing.decision.recorded",
  "planner.thread.bound",
  "budget.changed",
  "project.selected",
  "project.plan.updated",
  "run.started",
  "run.completed",
  "run.failed",
  "run.waiting", "run.interrupted", "run.cancelled", "run.stop_requested",
  "tool.started",
  "tool.completed",
  "tool.failed",
  "plan.updated",
  "project.revision.created",
  "project.revision.restored",
  "capability.requested",
  "capability.quoted",
  "approval.resolved",
  "spend.reserved",
  "spend.released",
  "spend.settled",
  "spend.reconciliation_pending",
  "capability.job.updated",
  "render.job.updated",
  "usage.recorded",
]);

const object = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
};

const string = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value;
};

const finiteNumber = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  return value;
};

const nonNegativeNumber = (value: unknown, label: string): number => {
  const parsed = finiteNumber(value, label);
  if (parsed < 0) throw new Error(`${label} must be non-negative.`);
  return parsed;
};

const revision = (value: unknown, label: string): number => {
  const parsed = nonNegativeNumber(value, label);
  if (!Number.isInteger(parsed)) throw new Error(`${label} must be an integer.`);
  return parsed;
};

const boolean = (value: unknown, label: string): boolean => {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean.`);
  return value;
};

const oneOf = <Value extends string>(value: unknown, label: string, values: readonly Value[]): Value => {
  if (typeof value !== "string" || !values.includes(value as Value)) {
    throw new Error(`${label} must be one of ${values.join(", ")}.`);
  }
  return value as Value;
};

const nullableString = (value: unknown, label: string): string | null =>
  value === null ? null : string(value, label);

const isJsonValue = (value: unknown): boolean => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return Boolean(value) && typeof value === "object" && Object.entries(value as Record<string, unknown>)
    .every(([key, entry]) => Boolean(key) && isJsonValue(entry));
};

const validateGoal = (value: unknown): void => {
  if (value === null) return;
  const goal = object(value, "session goal");
  string(goal.objective, "session goal.objective");
  oneOf(goal.status, "session goal.status", ["active", "paused", "blocked", "complete"] as const);
  nonNegativeNumber(goal.createdAt, "session goal.createdAt");
  nonNegativeNumber(goal.updatedAt, "session goal.updatedAt");
};

const validateSpend = (data: Record<string, unknown>, label: string): void => {
  string(data.runId, `${label}.runId`);
  string(data.reservationId, `${label}.reservationId`);
  oneOf(data.currency, `${label}.currency`, ["USD"] as const);
  nonNegativeNumber(data.amount, `${label}.amount`);
};

const validateEventData = (type: AttelierSessionEvent["type"], value: unknown): void => {
  const data = object(value, `session event ${type}.data`);
  switch (type) {
    case "review.created": {
      for (const key of ["reviewId", "runId", "projectId"]) string(data[key], `review.${key}`);
      revision(data.revision, "review.revision");
      if (data.kind !== undefined) oneOf(data.kind, "review.kind", ["cut", "visual"] as const);
      for (const key of ["model", "verdict"]) if (data[key] !== undefined) string(data[key], `review.${key}`);
      const range = object(data.range, "review.range");
      nonNegativeNumber(range.startSeconds, "review.startSeconds");
      nonNegativeNumber(range.endSeconds, "review.endSeconds");
      const counts = object(data.counts, "review.counts");
      for (const key of ["errors", "warnings", "infos"]) revision(counts[key], `review.counts.${key}`);
      const coverage = object(data.coverage, "review.coverage");
      for (const key of ["clipsWithTranscript", "clipsWithAudioAnalysis"]) revision(coverage[key], `review.coverage.${key}`);
      if (coverage.framesReviewed !== undefined) revision(coverage.framesReviewed, "review.framesReviewed");
      if (data.frames !== undefined) {
        if (!Array.isArray(data.frames) || data.frames.length > 36) throw new Error("Invalid review frames.");
        for (const value of data.frames) { const frame = object(value, "review.frame"); nonNegativeNumber(frame.atSeconds, "review.frame.atSeconds"); string(frame.url, "review.frame.url"); }
      }
      if (!Array.isArray(data.issues) || data.issues.length > 100) throw new Error("Invalid review findings.");
      for (const value of data.issues) {
        const issue = object(value, "review.issue");
        oneOf(issue.severity, "review.severity", ["error", "warning", "info"] as const);
        string(issue.code, "review.code"); string(issue.message, "review.message");
        nonNegativeNumber(issue.atSeconds, "review.atSeconds");
        for (const key of ["elementIds", "elementNames"]) if (!Array.isArray(issue[key]) || !(issue[key] as unknown[]).every((entry) => typeof entry === "string")) throw new Error(`Invalid review ${key}.`);
      }
      return;
    }
    case "action.updated":
      for (const key of ["actionId", "runId", "projectId", "toolName"]) string(data[key], `action.${key}`);
      object(data.input, "action.input");
      if (data.placementProposalId !== undefined) string(data.placementProposalId, "action.placementProposalId");
      if (!isJsonValue(data.input)) throw new Error("action.input must be JSON.");
      oneOf(data.status, "action.status", ["pending", "quoted", "running", "complete", "discarded"] as const);
      if (data.quote !== undefined && !isJsonValue(data.quote)) throw new Error("action.quote must be JSON.");
      return;
    case "tool.policy.changed":
      if (!Array.isArray(data.disabledTools) || data.disabledTools.length > 200 || !data.disabledTools.every((name) => typeof name === "string" && name.length < 160)) throw new Error("Invalid disabled tools.");
      return;
    case "history.cleared": return;
    case "turn.requested":
      string(data.runId, "turn.runId");
      string(data.fingerprint, "turn.fingerprint");
      if (data.reservedUsd !== undefined) nonNegativeNumber(data.reservedUsd, "turn.reservedUsd");
      return;
    case "turn.finished":
      string(data.runId, "turn.runId");
      revision(data.status, "turn.status");
      object(data.result, "turn.result");
      if (!isJsonValue(data.result)) throw new Error("turn.result must be JSON.");
      return;
    case "proposal.created":
      for (const key of ["proposalId", "runId", "projectId", "toolName", "explanation"]) string(data[key], `proposal.${key}`);
      revision(data.baseRevision, "proposal.baseRevision");
      object(data.transaction, "proposal.transaction");
      object(data.simulation, "proposal.simulation");
      if (!isJsonValue(data.transaction) || !isJsonValue(data.simulation)) throw new Error("proposal must contain JSON.");
      return;
    case "proposal.resolved":
      string(data.proposalId, "proposal.proposalId");
      oneOf(data.status, "proposal.status", ["applied", "discarded", "invalidated"] as const);
      if (data.revision !== undefined) revision(data.revision, "proposal.revision");
      return;
    case "session.created":
      string(data.title, "session.created.title");
      string(data.workingDirectory, "session.created.workingDirectory");
      modelSelection(data.model);
      if (data.mediaRouting !== undefined) modelSelection(data.mediaRouting);
      if (data.mediaRouters !== undefined) {
        const routers = object(data.mediaRouters, "session.created.mediaRouters");
        for (const [family, selection] of Object.entries(routers)) {
          oneOf(family, "session.created.mediaRouters family", ATTELIER_MEDIA_FAMILIES);
          modelSelection(selection);
        }
      }
      nullableString(data.projectId, "session.created.projectId");
      if (data.pipelineId !== undefined) string(data.pipelineId, "session.created.pipelineId");
      if (data.forkedFrom !== undefined) {
        const forkedFrom = object(data.forkedFrom, "session.created.forkedFrom");
        string(forkedFrom.sessionId, "session.created.forkedFrom.sessionId");
        const forkSequence = revision(forkedFrom.sequence, "session.created.forkedFrom.sequence");
        if (forkSequence < 1) throw new Error("session.created.forkedFrom.sequence must be positive.");
      }
      if (data.budgetUsd !== undefined && data.budgetUsd !== null) {
        nonNegativeNumber(data.budgetUsd, "session.created.budgetUsd");
      }
      if (data.goal !== undefined) validateGoal(data.goal);
      if (data.aiLocked !== undefined) boolean(data.aiLocked, "session.created.aiLocked");
      return;
    case "session.resumed":
      string(data.workingDirectory, "session.resumed.workingDirectory");
      oneOf(data.client, "session.resumed.client", ["terminal", "studio", "api"] as const);
      return;
    case "message.appended":
      oneOf(data.role, "message.appended.role", ["user", "assistant", "system"] as const);
      string(data.content, "message.appended.content");
      oneOf(data.audience, "message.appended.audience", ["model", "ui", "both"] as const);
      return;
    case "goal.changed":
      oneOf(data.action, "goal.changed.action", ["set", "edit", "pause", "resume", "block", "complete", "clear"] as const);
      validateGoal(data.goal);
      return;
    case "model.changed":
      modelSelection(data.selection);
      return;
    case "ai.lock.changed":
      boolean(data.locked, "ai.lock.changed.locked");
      return;
    case "media_routing.changed":
      modelSelection(data.selection);
      return;
    case "media_router.changed":
      oneOf(data.family, "media_router.changed.family", ATTELIER_MEDIA_FAMILIES);
      modelSelection(data.selection);
      return;
    case "routing.decision.recorded":
      string(data.runId, "routing.decision.recorded.runId");
      oneOf(data.target, "routing.decision.recorded.target", ["planner", "capability", ...ATTELIER_MEDIA_FAMILIES] as const);
      string(data.intent, "routing.decision.recorded.intent");
      oneOf(data.policy, "routing.decision.recorded.policy", ["balanced", "quality", "cost", "manual"] as const);
      string(data.selectedId, "routing.decision.recorded.selectedId");
      if (!Array.isArray(data.candidateIds) || data.candidateIds.some((candidate) => typeof candidate !== "string" || !candidate.trim())) {
        throw new Error("routing.decision.recorded.candidateIds must be an array of non-empty strings.");
      }
      string(data.reason, "routing.decision.recorded.reason");
      string(data.registryVersion, "routing.decision.recorded.registryVersion");
      boolean(data.fallback, "routing.decision.recorded.fallback");
      return;
    case "planner.thread.bound":
      string(data.providerId, "planner.thread.bound.providerId");
      string(data.modelId, "planner.thread.bound.modelId");
      string(data.threadId, "planner.thread.bound.threadId");
      return;
    case "budget.changed":
      if (data.budgetUsd !== null) nonNegativeNumber(data.budgetUsd, "budget.changed.budgetUsd");
      return;
    case "project.selected":
      nullableString(data.projectId, "project.selected.projectId");
      return;
    case "project.plan.updated":
      string(data.runId, "project.plan.updated.runId");
      string(data.projectId, "project.plan.updated.projectId");
      revision(data.version, "project.plan.updated.version");
      if (!Array.isArray(data.changedFields) || data.changedFields.some((field) => typeof field !== "string" || !field.trim())) {
        throw new Error("project.plan.updated.changedFields must be an array of non-empty strings.");
      }
      return;
    case "run.started":
      string(data.runId, "run.started.runId");
      oneOf(data.kind, "run.started.kind", ["plan", "edit", "analysis", "capability", "render", "workflow", "version", "inspect"] as const);
      string(data.summary, "run.started.summary");
      if (data.cancellable !== undefined) boolean(data.cancellable, "run.started.cancellable");
      return;
    case "run.stop_requested":
      string(data.runId, "run.stop_requested.runId");
      break;
    case "run.cancelled":
    case "run.completed":
      string(data.runId, "run.completed.runId");
      string(data.summary, "run.completed.summary");
      return;
    case "run.failed":
      string(data.runId, "run.failed.runId");
      string(data.error, "run.failed.error");
      return;
    case "run.waiting":
      string(data.runId, "run.waiting.runId");
      string(data.summary, "run.waiting.summary");
      return;
    case "run.interrupted":
      string(data.runId, "run.interrupted.runId");
      string(data.message, "run.interrupted.message");
      return;
    case "tool.started":
      string(data.runId, "tool.started.runId");
      string(data.callId, "tool.started.callId");
      string(data.toolName, "tool.started.toolName");
      object(data.input, "tool.started.input");
      if (!isJsonValue(data.input)) throw new Error("tool.started.input must be JSON.");
      return;
    case "tool.completed":
      string(data.runId, "tool.completed.runId");
      string(data.callId, "tool.completed.callId");
      string(data.toolName, "tool.completed.toolName");
      if (!("output" in data) || !isJsonValue(data.output)) throw new Error("tool.completed.output must be JSON.");
      return;
    case "tool.failed":
      string(data.runId, "tool.failed.runId");
      string(data.callId, "tool.failed.callId");
      string(data.toolName, "tool.failed.toolName");
      string(data.error, "tool.failed.error");
      return;
    case "plan.updated":
      string(data.runId, "plan.updated.runId");
      string(data.planId, "plan.updated.planId");
      string(data.projectId, "plan.updated.projectId");
      revision(data.baseRevision, "plan.updated.baseRevision");
      string(data.summary, "plan.updated.summary");
      object(data.transaction, "plan.updated.transaction");
      if (!isJsonValue(data.transaction)) throw new Error("plan.updated.transaction must be JSON.");
      return;
    case "project.revision.created":
      string(data.runId, "project.revision.created.runId");
      string(data.projectId, "project.revision.created.projectId");
      revision(data.revision, "project.revision.created.revision");
      string(data.transactionId, "project.revision.created.transactionId");
      return;
    case "project.revision.restored":
      string(data.runId, "project.revision.restored.runId");
      string(data.projectId, "project.revision.restored.projectId");
      oneOf(data.intent, "project.revision.restored.intent", ["undo", "redo", "restore"] as const);
      revision(data.previousRevision, "project.revision.restored.previousRevision");
      revision(data.targetRevision, "project.revision.restored.targetRevision");
      revision(data.revision, "project.revision.restored.revision");
      return;
    case "capability.requested":
      string(data.runId, "capability.requested.runId");
      string(data.capability, "capability.requested.capability");
      object(data.input, "capability.requested.input");
      if (!isJsonValue(data.input)) throw new Error("capability.requested.input must be JSON.");
      const idempotencyKey = string(data.idempotencyKey, "capability.requested.idempotencyKey");
      if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
        throw new Error("capability.requested.idempotencyKey must contain 8 to 200 characters.");
      }
      return;
    case "capability.quoted":
      string(data.runId, "capability.quoted.runId");
      string(data.quoteId, "capability.quoted.quoteId");
      string(data.capability, "capability.quoted.capability");
      string(data.providerId, "capability.quoted.providerId");
      string(data.model, "capability.quoted.model");
      oneOf(data.currency, "capability.quoted.currency", ["USD"] as const);
      nonNegativeNumber(data.amount, "capability.quoted.amount");
      boolean(data.approvalRequired, "capability.quoted.approvalRequired");
      boolean(data.reservationRequired, "capability.quoted.reservationRequired");
      return;
    case "approval.resolved":
      string(data.runId, "approval.resolved.runId");
      string(data.quoteId, "approval.resolved.quoteId");
      oneOf(data.decision, "approval.resolved.decision", ["approved", "declined", "blocked"] as const);
      oneOf(data.actor, "approval.resolved.actor", ["user", "harness"] as const);
      return;
    case "spend.reserved":
      validateSpend(data, "spend.reserved");
      string(data.quoteId, "spend.reserved.quoteId");
      return;
    case "spend.released":
    case "spend.settled":
    case "spend.reconciliation_pending":
      validateSpend(data, type);
      return;
    case "capability.job.updated": {
      string(data.runId, "capability.job.updated.runId");
      string(data.jobId, "capability.job.updated.jobId");
      string(data.capability, "capability.job.updated.capability");
      string(data.providerId, "capability.job.updated.providerId");
      oneOf(data.status, "capability.job.updated.status", ["queued", "running", "complete", "failed", "cancelled"] as const);
      const progress = finiteNumber(data.progress, "capability.job.updated.progress");
      if (progress < 0 || progress > 1) {
        throw new Error("capability.job.updated.progress must be between 0 and 1.");
      }
      if (data.jobUpdatedAt !== undefined) nonNegativeNumber(data.jobUpdatedAt, "capability.job.updated.jobUpdatedAt");
      return;
    }
    case "render.job.updated": {
      string(data.runId, "render.job.updated.runId");
      string(data.jobId, "render.job.updated.jobId");
      string(data.projectId, "render.job.updated.projectId");
      revision(data.revision, "render.job.updated.revision");
      oneOf(data.format, "render.job.updated.format", ["mp4", "webm", "mov", "audio", "image_sequence"] as const);
      oneOf(data.status, "render.job.updated.status", ["queued", "running", "complete", "failed", "cancelled", "rejected"] as const);
      const progress = finiteNumber(data.progress, "render.job.updated.progress");
      if (progress < 0 || progress > 1) throw new Error("render.job.updated.progress must be between 0 and 1.");
      if (data.jobUpdatedAt !== undefined) nonNegativeNumber(data.jobUpdatedAt, "render.job.updated.jobUpdatedAt");
      return;
    }
    case "usage.recorded":
      string(data.runId, "usage.recorded.runId");
      oneOf(data.resourceType, "usage.recorded.resourceType", ["model", "capability", "effect", "render", "workflow"] as const);
      string(data.resourceId, "usage.recorded.resourceId");
      string(data.providerId, "usage.recorded.providerId");
      if (data.model !== null) string(data.model, "usage.recorded.model");
      oneOf(data.currency, "usage.recorded.currency", ["USD"] as const);
      nonNegativeNumber(data.estimatedAmount, "usage.recorded.estimatedAmount");
      nonNegativeNumber(data.actualAmount, "usage.recorded.actualAmount");
      if (data.pricingStatus !== undefined) oneOf(data.pricingStatus, "usage.recorded.pricingStatus", ["actual", "estimated", "unavailable"] as const);
      for (const field of ["inputTokens", "outputTokens", "cachedInputTokens", "cacheWriteInputTokens", "reasoningTokens"] as const) {
        if (data[field] !== undefined) revision(data[field], `usage.recorded.${field}`);
      }
      return;
  }
};

const modelSelection = (value: unknown): AttelierModelSelection => {
  const candidate = object(value, "session model");
  if (candidate.mode === "auto" && ["balanced", "quality", "cost"].includes(String(candidate.policy))) {
    return { mode: "auto", policy: candidate.policy as AttelierRoutingPolicy };
  }
  if (candidate.mode === "pinned") return { mode: "pinned", modelId: string(candidate.modelId, "session model.modelId") };
  throw new Error("session model is invalid.");
};

const defaultMediaRouters = (selection: AttelierModelSelection = { mode: "auto", policy: "balanced" }): AttelierMediaRouters =>
  Object.fromEntries(ATTELIER_MEDIA_FAMILIES.map((family) => [family, { ...selection }])) as AttelierMediaRouters;

const mediaRouters = (
  value: unknown,
  legacy: AttelierModelSelection | undefined,
): AttelierMediaRouters => {
  const result = defaultMediaRouters(legacy);
  if (value === undefined) return result;
  const candidate = object(value, "session media routers");
  for (const family of ATTELIER_MEDIA_FAMILIES) {
    if (candidate[family] !== undefined) result[family] = modelSelection(candidate[family]);
  }
  return result;
};

export const parseAttelierSessionEvent = (value: unknown): AttelierSessionEvent => {
  const candidate = object(value, "session event");
  if (candidate.schemaVersion !== ATTELIER_SESSION_SCHEMA_VERSION) {
    throw new Error(`Unsupported Attelier session schema ${String(candidate.schemaVersion)}.`);
  }
  string(candidate.eventId, "session event.eventId");
  string(candidate.sessionId, "session event.sessionId");
  const sequence = finiteNumber(candidate.sequence, "session event.sequence");
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error("session event.sequence must be a positive integer.");
  finiteNumber(candidate.createdAt, "session event.createdAt");
  if (typeof candidate.type !== "string" || !EVENT_TYPES.has(candidate.type as AttelierSessionEvent["type"])) {
    throw new Error(`Unknown Attelier session event type ${String(candidate.type)}.`);
  }
  validateEventData(candidate.type as AttelierSessionEvent["type"], candidate.data);
  return candidate as AttelierSessionEvent;
};

const completedRun = (
  active: AttelierSessionRunProjection | null,
  runId: string,
  knownKind: AttelierSessionRunProjection["kind"] | undefined,
  status: "complete" | "failed" | "interrupted" | "cancelled",
  summary: string,
  error?: string,
): AttelierSessionRunProjection => ({
  id: runId,
  kind: active?.id === runId ? active.kind : knownKind ?? "plan",
  status,
  summary,
  ...(error ? { error } : {}),
});

export const projectAttelierSessionEvents = (input: readonly AttelierSessionEvent[]): AttelierSessionProjection => {
  if (input.length === 0) throw new Error("A Attelier session requires at least one event.");
  const events = input.map(parseAttelierSessionEvent);
  const first = events[0];
  if (!first || first.type !== "session.created" || first.sequence !== 1) {
    throw new Error("The first Attelier session event must be session.created at sequence 1.");
  }

  const sessionId = first.sessionId;
  const eventIds = new Set<string>();
  for (const [index, event] of events.entries()) {
    if (event.sessionId !== sessionId) throw new Error("A Attelier session log cannot mix session IDs.");
    if (event.sequence !== index + 1) throw new Error(`Attelier session sequence gap at ${index + 1}.`);
    if (eventIds.has(event.eventId)) throw new Error(`Duplicate Attelier session event ${event.eventId}.`);
    eventIds.add(event.eventId);
  }

  const projection: AttelierSessionProjection = {
    schemaVersion: ATTELIER_SESSION_SCHEMA_VERSION,
    id: sessionId,
    title: string(first.data.title, "session title"),
    workingDirectory: string(first.data.workingDirectory, "session workingDirectory"),
    createdAt: first.createdAt,
    updatedAt: first.createdAt,
    lastSequence: 1,
    forkedFrom: first.data.forkedFrom ? { ...first.data.forkedFrom } : null,
    projectId: first.data.projectId === null ? null : string(first.data.projectId, "session projectId"),
    ...(first.data.pipelineId ? { pipelineId: string(first.data.pipelineId, "session pipelineId") } : {}),
    projectPlanVersion: null,
    model: modelSelection(first.data.model),
    mediaRouters: mediaRouters(
      first.data.mediaRouters,
      first.data.mediaRouting ? modelSelection(first.data.mediaRouting) : undefined,
    ),
    aiLocked: first.data.aiLocked ?? false,
    budgetUsd: first.data.budgetUsd ?? null,
    goal: first.data.goal ?? null,
    messages: [],
    activeRun: null,
    lastRun: null,
    pendingPlan: null,
    proposals: [],
    actions: [],
    reviews: [],
    disabledTools: [],
    projectRevision: null,
    lastRestore: null,
    lastRoutingDecision: null,
    plannerThread: null,
    capabilityJobs: [],
    renderJobs: [],
    usage: {
      currency: "USD",
      quotedAmount: 0,
      reservedAmount: 0,
      pendingReconciliationAmount: 0,
      estimatedAmount: 0,
      actualAmount: 0,
      modelInputTokens: 0,
      modelOutputTokens: 0,
      modelCachedInputTokens: 0,
      modelCacheWriteInputTokens: 0,
      modelReasoningTokens: 0,
      unpricedModelTurns: 0,
    },
  };
  const runKinds = new Map<string, AttelierSessionRunProjection["kind"]>();
  const activeRuns = new Map<string, AttelierSessionRunProjection>();
  const terminalRunIds = new Set<string>();
  const capabilityJobs = new Map<string, AttelierSessionProjection["capabilityJobs"][number]>();
  const renderJobs = new Map<string, AttelierSessionProjection["renderJobs"][number]>();

  for (const event of events.slice(1)) {
    projection.updatedAt = event.createdAt;
    projection.lastSequence = event.sequence;
    switch (event.type) {
      case "session.created":
        throw new Error("A Attelier session can contain only one session.created event.");
      case "session.resumed":
        projection.workingDirectory = string(event.data.workingDirectory, "session resume workingDirectory");
        break;
      case "history.cleared":
        projection.messages = [];
        projection.lastRun = null;
        break;
      case "message.appended":
        projection.messages.push({
          eventId: event.eventId,
          role: event.data.role,
          content: event.data.content,
          createdAt: event.createdAt,
        });
        break;
      case "goal.changed":
        projection.goal = event.data.goal;
        break;
      case "model.changed":
        projection.model = modelSelection(event.data.selection);
        break;
      case "ai.lock.changed":
        projection.aiLocked = event.data.locked;
        break;
      case "media_routing.changed":
        projection.mediaRouters = defaultMediaRouters(modelSelection(event.data.selection));
        break;
      case "media_router.changed":
        projection.mediaRouters[event.data.family] = modelSelection(event.data.selection);
        break;
      case "routing.decision.recorded":
        projection.lastRoutingDecision = { ...event.data };
        break;
      case "planner.thread.bound":
        projection.plannerThread = { ...event.data };
        break;
      case "budget.changed":
        projection.budgetUsd = event.data.budgetUsd;
        break;
      case "project.selected":
        projection.projectId = event.data.projectId;
        projection.projectPlanVersion = null;
        projection.projectRevision = null;
        projection.pendingPlan = null;
        projection.lastRestore = null;
        break;
      case "project.plan.updated":
        if (projection.projectId && projection.projectId !== event.data.projectId) {
          throw new Error("A Attelier session project plan cannot switch projects without project.selected.");
        }
        if (projection.projectPlanVersion !== null && projection.projectPlanVersion !== undefined && event.data.version < projection.projectPlanVersion) {
          throw new Error("A Attelier session cannot regress the project plan version.");
        }
        projection.projectId = event.data.projectId;
        projection.projectPlanVersion = event.data.version;
        break;
      case "run.started":
        // A run that already settled stays settled. A retried story stage
        // re-uses its runId; reopening it here would show a run as running
        // forever, because the watchdog refuses to write a second terminal
        // event for it.
        if (terminalRunIds.has(event.data.runId)) break;
        runKinds.set(event.data.runId, event.data.kind);
        projection.activeRun = {
          id: event.data.runId,
          kind: event.data.kind,
          status: "running",
          summary: event.data.summary,
          ...(event.data.cancellable === undefined ? {} : { cancellable: event.data.cancellable }),
        };
        activeRuns.set(event.data.runId, projection.activeRun);
        break;
      case "run.waiting": {
        const run = activeRuns.get(event.data.runId);
        if (run) projection.lastRun = { ...run, status: "waiting", summary: event.data.summary };
        activeRuns.delete(event.data.runId);
        projection.activeRun = [...activeRuns.values()].at(-1) ?? null;
        break;
      }
      case "run.stop_requested": {
        const run = activeRuns.get(event.data.runId);
        if (run) activeRuns.set(run.id, { ...run, status: "stopping" });
        projection.activeRun = [...activeRuns.values()].at(-1) ?? null;
        break;
      }
      case "run.cancelled":
      case "run.completed": {
        // A second terminal event for the same run is ignored, not fatal. A
        // retried stage re-uses its runId, so a watchdog sweep or a duplicate
        // completion could otherwise poison a whole session's projection.
        if (terminalRunIds.has(event.data.runId)) break;
        terminalRunIds.add(event.data.runId);
        const run = completedRun(projection.activeRun, event.data.runId, runKinds.get(event.data.runId), event.type === "run.cancelled" ? "cancelled" : "complete", event.data.summary);
        projection.lastRun = run;
        activeRuns.delete(event.data.runId);
        projection.activeRun = [...activeRuns.values()].at(-1) ?? null;
        runKinds.delete(event.data.runId);
        break;
      }
      case "run.failed": {
        if (terminalRunIds.has(event.data.runId)) break;
        terminalRunIds.add(event.data.runId);
        const run = completedRun(projection.activeRun, event.data.runId, runKinds.get(event.data.runId), "failed", "Run failed", event.data.error);
        projection.lastRun = run;
        activeRuns.delete(event.data.runId);
        projection.activeRun = [...activeRuns.values()].at(-1) ?? null;
        runKinds.delete(event.data.runId);
        break;
      }
      case "run.interrupted": {
        if (terminalRunIds.has(event.data.runId)) break;
        terminalRunIds.add(event.data.runId);
        const run = completedRun(projection.activeRun, event.data.runId, runKinds.get(event.data.runId), "interrupted", event.data.message);
        projection.lastRun = run;
        activeRuns.delete(event.data.runId);
        projection.activeRun = [...activeRuns.values()].at(-1) ?? null;
        runKinds.delete(event.data.runId);
        break;
      }
      case "plan.updated":
        if (projection.projectId && projection.projectId !== event.data.projectId) {
          throw new Error("A Attelier session plan cannot switch projects without project.selected.");
        }
        if (projection.projectRevision !== null && event.data.baseRevision < projection.projectRevision) {
          throw new Error("A Attelier session plan cannot regress the project revision.");
        }
        projection.projectId = event.data.projectId;
        projection.pendingPlan = {
          runId: event.data.runId,
          planId: event.data.planId,
          projectId: event.data.projectId,
          baseRevision: event.data.baseRevision,
          summary: event.data.summary,
          transaction: event.data.transaction,
        };
        projection.projectRevision = event.data.baseRevision;
        break;
      case "tool.policy.changed":
        projection.disabledTools = event.data.disabledTools;
        break;
      case "review.created": {
        const { reviewId, ...review } = event.data;
        projection.reviews = [...(projection.reviews ?? []).filter((item) => item.id !== reviewId), { id: reviewId, ...review }];
        break;
      }
      case "action.updated": {
        const { actionId, ...action } = event.data;
        projection.actions = [...(projection.actions ?? []).filter((a) => a.id !== actionId), { ...action, id: actionId }];
        break;
      }
      case "proposal.created": {
        if (projection.proposals!.some(({ id }) => id === event.data.proposalId)) throw new Error("Duplicate proposal.");
        const { proposalId, ...proposal } = event.data;
        projection.proposals!.push({ ...proposal, id: proposalId, status: "pending" });
        break;
      }
      case "proposal.resolved": {
        const proposal = projection.proposals!.find(({ id }) => id === event.data.proposalId);
        if (!proposal || proposal.status !== "pending") throw new Error("Proposal is not pending.");
        proposal.status = event.data.status;
        if (event.data.revision !== undefined) {
          proposal.revision = event.data.revision;
          if (projection.projectId === proposal.projectId) projection.projectRevision = Math.max(projection.projectRevision ?? 0, event.data.revision);
        }
        break;
      }
      case "project.revision.created":
        if (projection.projectId && projection.projectId !== event.data.projectId) {
          throw new Error("A Attelier session revision cannot switch projects without project.selected.");
        }
        if (projection.projectRevision !== null && event.data.revision < projection.projectRevision) {
          throw new Error("A Attelier session cannot regress the committed project revision.");
        }
        projection.projectId = event.data.projectId;
        projection.projectRevision = event.data.revision;
        projection.lastRestore = null;
        if (projection.pendingPlan?.transaction.id === event.data.transactionId) projection.pendingPlan = null;
        break;
      case "project.revision.restored":
        if (projection.projectId && projection.projectId !== event.data.projectId) {
          throw new Error("A Attelier session restore cannot switch projects without project.selected.");
        }
        if (projection.projectRevision !== null && event.data.previousRevision < projection.projectRevision) {
          throw new Error("A Attelier session restore cannot start from an older project revision.");
        }
        if (event.data.revision <= event.data.previousRevision) {
          throw new Error("A Attelier restore must create a new forward revision.");
        }
        projection.projectId = event.data.projectId;
        projection.projectRevision = event.data.revision;
        projection.pendingPlan = null;
        projection.lastRestore = {
          intent: event.data.intent,
          previousRevision: event.data.previousRevision,
          targetRevision: event.data.targetRevision,
          revision: event.data.revision,
        };
        break;
      case "capability.requested":
        break;
      case "capability.quoted":
        projection.usage.quotedAmount += event.data.amount;
        break;
      case "spend.reserved":
        projection.usage.reservedAmount += event.data.amount;
        break;
      case "spend.released":
      case "spend.settled":
        projection.usage.reservedAmount = Math.max(0, projection.usage.reservedAmount - event.data.amount);
        break;
      case "spend.reconciliation_pending":
        projection.usage.reservedAmount = Math.max(0, projection.usage.reservedAmount - event.data.amount);
        projection.usage.pendingReconciliationAmount += event.data.amount;
        break;
      case "usage.recorded":
        projection.usage.estimatedAmount += event.data.estimatedAmount;
        projection.usage.actualAmount += event.data.actualAmount;
        projection.usage.modelInputTokens += event.data.inputTokens ?? 0;
        projection.usage.modelOutputTokens += event.data.outputTokens ?? 0;
        projection.usage.modelCachedInputTokens += event.data.cachedInputTokens ?? 0;
        projection.usage.modelCacheWriteInputTokens += event.data.cacheWriteInputTokens ?? 0;
        projection.usage.modelReasoningTokens += event.data.reasoningTokens ?? 0;
        if (event.data.resourceType === "model" && event.data.pricingStatus === "unavailable") {
          projection.usage.unpricedModelTurns += 1;
        }
        break;
      case "capability.job.updated":
        {
          const previous = capabilityJobs.get(event.data.jobId);
          const updatedAt = event.data.jobUpdatedAt ?? event.createdAt;
          const terminal = (status: string) => ["complete", "failed", "cancelled"].includes(status);
          const statusRank = (status: string) => status === "queued" ? 0 : status === "running" ? 1 : 2;
          const stale = previous && (
            terminal(previous.status) ||
            updatedAt < previous.updatedAt ||
            (updatedAt === previous.updatedAt && (
              statusRank(event.data.status) < statusRank(previous.status) ||
              (event.data.status === previous.status && event.data.progress < previous.progress)
            ))
          );
          if (!stale) {
            capabilityJobs.set(event.data.jobId, {
              runId: event.data.runId,
              jobId: event.data.jobId,
              capability: event.data.capability,
              providerId: event.data.providerId,
              status: event.data.status,
              progress: event.data.progress,
              updatedAt,
            });
          }
        }
        projection.capabilityJobs = [...capabilityJobs.values()];
        break;
      case "render.job.updated":
        {
          const previous = renderJobs.get(event.data.jobId);
          const updatedAt = event.data.jobUpdatedAt ?? event.createdAt;
          const terminal = (status: string) => ["complete", "failed", "cancelled", "rejected"].includes(status);
          const statusRank = (status: string) => status === "queued" ? 0 : status === "running" ? 1 : 2;
          const stale = previous && (
            terminal(previous.status) ||
            updatedAt < previous.updatedAt ||
            (updatedAt === previous.updatedAt && (
              statusRank(event.data.status) < statusRank(previous.status) ||
              (event.data.status === previous.status && event.data.progress < previous.progress)
            ))
          );
          if (!stale) {
            renderJobs.set(event.data.jobId, {
              runId: event.data.runId,
              jobId: event.data.jobId,
              projectId: event.data.projectId,
              revision: event.data.revision,
              format: event.data.format,
              status: event.data.status,
              progress: event.data.progress,
              updatedAt,
            });
          }
        }
        projection.renderJobs = [...renderJobs.values()];
        break;
      case "tool.started":
      case "tool.completed":
      case "tool.failed":
      case "approval.resolved":
        break;
    }
  }

  return projection;
};
