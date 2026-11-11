import assert from "node:assert/strict";
import { mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AttelierSessionStore } from "./session-store.js";

test("session store persists private append-only logs and resolves resumable sessions", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-session-store-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const rootDir = path.join(temporary, "sessions");
  const store = new AttelierSessionStore({ rootDir });
  const created = await store.create({ title: "Orbit", workingDirectory: "/workspace", projectId: "project-1" });
  const eventId = "goal-command-1";
  const goal = {
    objective: "Create a product orbit",
    status: "active" as const,
    createdAt: 10,
    updatedAt: 10,
  };
  const appended = await store.append(created.id, { type: "goal.changed", eventId, data: { action: "set", goal } });
  const replayed = await store.append(created.id, { type: "goal.changed", eventId, data: { action: "set", goal } });

  assert.equal(appended.eventId, replayed.eventId);
  assert.equal((await store.read(created.id)).length, 2);
  assert.equal((await store.resolve(created.id.slice(0, 8))).id, created.id);
  assert.equal((await store.resolve("Orbit")).id, created.id);
  assert.equal((await store.resolve("last")).id, created.id);
  assert.equal((await store.project(created.id)).goal?.objective, "Create a product orbit");

  if (process.platform !== "win32") {
    assert.equal((await stat(rootDir)).mode & 0o777, 0o700);
    assert.equal((await stat(path.join(rootDir, `${created.id}.jsonl`))).mode & 0o777, 0o600);
  }
});

test("session event idempotency rejects a conflicting retry", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-session-conflict-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const session = await store.create();
  await store.append(session.id, {
    type: "message.appended",
    eventId: "same-command",
    data: { role: "user", content: "first", audience: "both" },
  });
  await assert.rejects(() => store.append(session.id, {
    type: "message.appended",
    eventId: "same-command",
    data: { role: "user", content: "different", audience: "both" },
  }), /different data/i);
});

test("session fork inherits working state and only the remaining budget", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-session-fork-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const parent = await store.create({ projectId: "project-1", model: { mode: "pinned", modelId: "openai:gpt-5.6-terra" } });
  await store.append(parent.id, { type: "budget.changed", data: { budgetUsd: 1 } });
  await store.append(parent.id, {
    type: "usage.recorded",
    data: {
      runId: "run-1", resourceType: "model", resourceId: "turn-1", providerId: "openai",
      model: "gpt-5.6-terra", currency: "USD", estimatedAmount: 0.25, actualAmount: 0.2,
    },
  });
  await store.append(parent.id, {
    type: "goal.changed",
    data: { action: "set", goal: { objective: "Finish the cut", status: "active", createdAt: 10, updatedAt: 10 } },
  });

  const fork = await store.fork(parent.id, { title: "Alternate cut" });

  assert.deepEqual(fork.forkedFrom, { sessionId: parent.id, sequence: 4 });
  assert.equal(fork.projectId, "project-1");
  assert.equal(fork.goal?.objective, "Finish the cut");
  assert.equal(fork.budgetUsd, 0.75);
  assert.equal(fork.usage.actualAmount, 0);
  assert.equal(fork.messages.length, 0);
  assert.equal(fork.lastSequence, 1);
});

test("concurrent appends preserve one contiguous event sequence", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-session-concurrent-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new AttelierSessionStore({ rootDir: path.join(temporary, "sessions") });
  const session = await store.create();

  await Promise.all(Array.from({ length: 20 }, (_, index) => store.append(session.id, {
    type: "message.appended",
    eventId: `concurrent-${index}`,
    data: { role: "user", content: `message ${index}`, audience: "both" },
  })));

  const events = await store.read(session.id);
  assert.equal(events.length, 21);
  assert.deepEqual(events.map(({ sequence }) => sequence), Array.from({ length: 21 }, (_, index) => index + 1));
});

test("a stale lock is reclaimed only when its recorded owner is gone", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "atelier-session-stale-lock-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const rootDir = path.join(temporary, "sessions");
  const store = new AttelierSessionStore({ rootDir });
  const session = await store.create();
  const lockPath = path.join(rootDir, `${session.id}.lock`);
  await writeFile(lockPath, JSON.stringify({ pid: 2_147_483_647, createdAt: 1 }), { mode: 0o600 });
  const old = new Date(Date.now() - 60_000);
  await utimes(lockPath, old, old);

  await store.append(session.id, {
    type: "message.appended",
    data: { role: "user", content: "recovered", audience: "both" },
  });
  assert.equal((await store.read(session.id)).length, 2);
});
