import assert from "node:assert/strict";
import test from "node:test";
import type { AttelierSessionEvent } from "@attelier/agent-schema";
import { projectAttelierSessionEvents } from "./session-projection.js";

const event = (sequence: number, type: AttelierSessionEvent["type"], data: Record<string, unknown>): AttelierSessionEvent => ({
  schemaVersion: 1,
  eventId: `event-${sequence}`,
  sessionId: "11111111-1111-4111-8111-111111111111",
  sequence,
  createdAt: 1_000 + sequence,
  type,
  data,
} as AttelierSessionEvent);

test("session projection keeps goal, route, project revision and spend as separate state", () => {
  const events = [
    event(1, "session.created", {
      title: "Product orbit",
      workingDirectory: "/workspace",
      model: { mode: "auto", policy: "balanced" },
      projectId: "project-1",
    }),
    event(2, "goal.changed", {
      action: "set",
      goal: { objective: "Make one orbit shot", status: "active", createdAt: 1_002, updatedAt: 1_002 },
    }),
    event(3, "model.changed", { selection: { mode: "pinned", modelId: "wan/ti2v-5b" } }),
    event(4, "run.started", { runId: "run-1", kind: "edit", summary: "Opacity" }),
    event(5, "plan.updated", {
      runId: "run-1",
      planId: "plan-1",
      projectId: "project-1",
      baseRevision: 4,
      summary: "Set opacity",
      transaction: { id: "tx-1", baseRevision: 4, operations: [] },
    }),
    event(6, "project.revision.created", {
      runId: "run-1",
      projectId: "project-1",
      revision: 5,
      transactionId: "tx-1",
    }),
    event(7, "run.completed", { runId: "run-1", summary: "Applied" }),
    event(8, "capability.quoted", {
      runId: "run-2",
      quoteId: "quote-1",
      capability: "basic_video_generation",
      providerId: "fixture",
      model: "fixture-v1",
      currency: "USD",
      amount: 0.12,
      approvalRequired: true,
      reservationRequired: true,
    }),
    event(9, "spend.reserved", {
      runId: "run-2",
      reservationId: "reservation-1",
      quoteId: "quote-1",
      currency: "USD",
      amount: 0.12,
    }),
    event(10, "spend.settled", {
      runId: "run-2",
      reservationId: "reservation-1",
      currency: "USD",
      amount: 0.12,
    }),
    event(11, "usage.recorded", {
      runId: "run-2",
      resourceType: "capability",
      resourceId: "job-1",
      providerId: "fixture",
      model: "fixture-v1",
      currency: "USD",
      estimatedAmount: 0.12,
      actualAmount: 0.08,
    }),
  ];

  const projection = projectAttelierSessionEvents(events);
  assert.equal(projection.goal?.objective, "Make one orbit shot");
  assert.deepEqual(projection.model, { mode: "pinned", modelId: "wan/ti2v-5b" });
  assert.equal(projection.projectRevision, 5);
  assert.equal(projection.pendingPlan, null);
  assert.equal(projection.lastRun?.status, "complete");
  assert.equal(projection.usage.quotedAmount, 0.12);
  assert.equal(projection.usage.reservedAmount, 0);
  assert.equal(projection.usage.pendingReconciliationAmount, 0);
  assert.equal(projection.usage.actualAmount, 0.08);
});

test("session projection retains the latest durable capability job observation", () => {
  const projection = projectAttelierSessionEvents([
    event(1, "session.created", {
      title: "Recoverable generation",
      workingDirectory: "/workspace",
      model: { mode: "auto", policy: "balanced" },
      projectId: "project-1",
    }),
    event(2, "run.started", { runId: "run-1", kind: "capability", summary: "Generate" }),
    event(3, "capability.requested", {
      runId: "run-1",
      capability: "text_to_video",
      input: { projectId: "project-1", prompt: "orbit" },
      idempotencyKey: "atelier-session-run-1",
    }),
    event(4, "capability.job.updated", {
      runId: "run-1",
      jobId: "job-1",
      capability: "text_to_video",
      providerId: "fixture",
      status: "queued",
      progress: 0,
    }),
    event(5, "capability.job.updated", {
      runId: "run-1",
      jobId: "job-1",
      capability: "text_to_video",
      providerId: "fixture",
      status: "running",
      progress: 0.4,
    }),
  ]);

  assert.deepEqual(projection.capabilityJobs, [{
    runId: "run-1",
    jobId: "job-1",
    capability: "text_to_video",
    providerId: "fixture",
    status: "running",
    progress: 0.4,
    updatedAt: 1_005,
  }]);
});

test("session projection closes an interrupted run without treating it as failed", () => {
  const projection = projectAttelierSessionEvents([
    event(1, "session.created", {
      title: "Restarted review",
      workingDirectory: "/workspace",
      model: { mode: "auto", policy: "balanced" },
      projectId: "project-1",
    }),
    event(2, "run.started", { runId: "run-review", kind: "inspect", summary: "Review the cut" }),
    event(3, "run.interrupted", {
      runId: "run-review",
      message: "Atte was interrupted by a server restart. Send the request again.",
    }),
  ]);

  assert.equal(projection.activeRun, null);
  assert.deepEqual(projection.lastRun, {
    id: "run-review",
    kind: "inspect",
    status: "interrupted",
    summary: "Atte was interrupted by a server restart. Send the request again.",
  });
});

test("session projection ignores a second terminal event for one run", () => {
  // A retried story stage re-uses its runId, so a session can genuinely hold a
  // completion followed by a watchdog interruption. The first terminal event is
  // the evidence; later ones are ignored rather than poisoning the projection.
  const projection = projectAttelierSessionEvents([
    event(1, "session.created", {
      title: "Exactly once",
      workingDirectory: "/workspace",
      model: { mode: "auto", policy: "balanced" },
      projectId: "project-1",
    }),
    event(2, "run.started", { runId: "run-1", kind: "analysis", summary: "Review" }),
    event(3, "run.completed", { runId: "run-1", summary: "Done" }),
    event(4, "run.failed", { runId: "run-1", error: "Late failure" }),
    event(5, "run.interrupted", { runId: "run-1", message: "Even later" }),
    event(6, "run.cancelled", { runId: "run-1", summary: "Later still" }),
  ]);
  assert.equal(projection.activeRun, null);
  assert.equal(projection.lastRun?.status, "complete");
  assert.equal(projection.lastRun?.summary, "Done");
});

test("session projection does not let a stale concurrent poll reopen a terminal job", () => {
  const projection = projectAttelierSessionEvents([
    event(1, "session.created", {
      title: "Concurrent recovery",
      workingDirectory: "/workspace",
      model: { mode: "auto", policy: "balanced" },
      projectId: "project-1",
    }),
    event(2, "run.started", { runId: "run-1", kind: "capability", summary: "Generate" }),
    event(3, "capability.job.updated", {
      runId: "run-1",
      jobId: "job-1",
      capability: "text_to_video",
      providerId: "fixture",
      status: "complete",
      progress: 1,
      jobUpdatedAt: 200,
    }),
    event(4, "capability.job.updated", {
      runId: "run-1",
      jobId: "job-1",
      capability: "text_to_video",
      providerId: "fixture",
      status: "running",
      progress: 0.8,
      jobUpdatedAt: 150,
    }),
  ]);

  assert.deepEqual(projection.capabilityJobs[0], {
    runId: "run-1",
    jobId: "job-1",
    capability: "text_to_video",
    providerId: "fixture",
    status: "complete",
    progress: 1,
    updatedAt: 200,
  });
});

test("session projection rejects gaps instead of silently rewriting history", () => {
  assert.throws(() => projectAttelierSessionEvents([
    event(1, "session.created", {
      title: "Broken",
      workingDirectory: "/workspace",
      model: { mode: "auto", policy: "balanced" },
      projectId: null,
    }),
    event(3, "session.resumed", { workingDirectory: "/workspace", client: "terminal" }),
  ]), /sequence gap/i);
});

test("session parser rejects invalid discriminated payloads before projection", () => {
  assert.throws(() => projectAttelierSessionEvents([
    event(1, "session.created", {
      title: "Broken spend",
      workingDirectory: "/workspace",
      model: { mode: "auto", policy: "balanced" },
      projectId: null,
    }),
    event(2, "usage.recorded", {
      runId: "run-1",
      resourceType: "capability",
      resourceId: "job-1",
      providerId: "fixture",
      model: null,
      currency: "USD",
      estimatedAmount: 1,
      actualAmount: -1,
    }),
  ]), /actualAmount must be non-negative/i);
});

test("restore state moves forward while retaining the historical target for redo", () => {
  const projection = projectAttelierSessionEvents([
    event(1, "session.created", {
      title: "Versions",
      workingDirectory: "/workspace",
      model: { mode: "auto", policy: "balanced" },
      projectId: "project-1",
    }),
    event(2, "project.revision.restored", {
      runId: "run-1",
      projectId: "project-1",
      intent: "undo",
      previousRevision: 5,
      targetRevision: 4,
      revision: 6,
    }),
  ]);
  assert.equal(projection.projectRevision, 6);
  assert.deepEqual(projection.lastRestore, {
    intent: "undo",
    previousRevision: 5,
    targetRevision: 4,
    revision: 6,
  });
});

test("project plan versions advance independently and reset when the session selects another project", () => {
  const projection = projectAttelierSessionEvents([
    event(1, "session.created", {
      title: "Shared plan",
      workingDirectory: "/workspace",
      model: { mode: "auto", policy: "balanced" },
      projectId: "project-1",
    }),
    event(2, "project.plan.updated", {
      runId: "run-plan",
      projectId: "project-1",
      version: 3,
      changedFields: ["script", "beats"],
    }),
  ]);
  assert.equal(projection.projectPlanVersion, 3);

  const switched = projectAttelierSessionEvents([
    ...[
      event(1, "session.created", {
        title: "Shared plan",
        workingDirectory: "/workspace",
        model: { mode: "auto", policy: "balanced" },
        projectId: "project-1",
      }),
      event(2, "project.plan.updated", {
        runId: "run-plan",
        projectId: "project-1",
        version: 3,
        changedFields: ["script"],
      }),
    ],
    event(3, "project.selected", { projectId: "project-2" }),
  ]);
  assert.equal(switched.projectPlanVersion, null);
});
