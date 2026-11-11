import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runAttelierSessionInput } from "./session-command.js";
import { AttelierHeadlessSession, type AttelierHarnessToolClient } from "./session-runtime.js";
import { AttelierSessionStore } from "./session-store.js";

const withSession = async (run: (runtime: AttelierHeadlessSession) => Promise<void>) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "atelier-session-command-"));
  try {
    const store = new AttelierSessionStore({ rootDir: directory });
    const projection = await store.create({ title: "Shared Attelier", workingDirectory: "terminal" });
    await run(new AttelierHeadlessSession({ sessionId: projection.id, store }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

test("plain-language input is Atte's; this surface refuses it unless AI is locked", async () => {
  await withSession(async (runtime) => {
    await assert.rejects(() => runAttelierSessionInput(runtime, "Make the opening tighter"), /Ask Atte/);
  });
});

test("shared slash commands mutate the same projection used by conversation", async () => {
  await withSession(async (runtime) => {
    const goal = await runAttelierSessionInput(runtime, "/goal Build a 30 second launch cut");
    assert.equal(goal.projection.goal?.objective, "Build a 30 second launch cut");
    const model = await runAttelierSessionInput(runtime, "/model openai:gpt-5.6-terra");
    assert.deepEqual(model.projection.model, { mode: "pinned", modelId: "openai:gpt-5.6-terra" });
    const lock = await runAttelierSessionInput(runtime, "/lock");
    assert.equal(lock.projection.aiLocked, true);
    const status = await runAttelierSessionInput(runtime, "/status");
    assert.match(status.message, /Build a 30 second launch cut/);
    assert.match(status.message, /editing-only/);
    const route = await runAttelierSessionInput(runtime, "/route video auto quality");
    assert.deepEqual(route.projection.mediaRouters.video, { mode: "auto", policy: "quality" });
    const usage = await runAttelierSessionInput(runtime, "/usage");
    assert.match(usage.message, /actual/);
    const history = await runAttelierSessionInput(runtime, "/history 3");
    assert.match(history.message, /video route/);
  });
});

test("editing-only mode executes deterministic chat edits without calling the model", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "atelier-session-command-edit-"));
  try {
    const store = new AttelierSessionStore({ rootDir: directory });
    const created = await store.create({ title: "Locked edit", workingDirectory: "terminal", projectId: "project-1" });
    const tools: AttelierHarnessToolClient = {
      async callTool<T>(name: string) {
        if (name === "plan_edit") return {
          id: "plan-1",
          baseRevision: 0,
          summary: "Trimmed the opening by two frames.",
          transaction: {
            id: "transaction-1",
            baseRevision: 0,
            idempotencyKey: "transaction-1",
            source: "agent",
            authorId: "atelier",
            goal: "Trim opening",
            preconditions: [],
            operations: [{ type: "deleteElement", elementId: "clip-1" }],
          },
        } as T;
        if (name === "simulate_transaction") return { revision: 1, alreadyApplied: false } as T;
        if (name === "commit_transaction") return { revision: 1, transactionId: "transaction-1" } as T;
        throw new Error(`Unexpected tool ${name}`);
      },
    };
    const runtime = new AttelierHeadlessSession({ sessionId: created.id, store, client: tools });
    await runtime.changeAiLock(true);
    const result = await runAttelierSessionInput(runtime, "Trim the opening by two frames");
    assert.equal(result.projection.projectRevision, 1);
    assert.match(result.message, /Revision 1/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("shared plan, edit, checkpoint and versions commands use the headless project authority", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "atelier-session-command-project-"));
  try {
    const store = new AttelierSessionStore({ rootDir: directory });
    const created = await store.create({ title: "Project commands", workingDirectory: "terminal", projectId: "project-1" });
    let revision = 0;
    const versions: Array<Record<string, unknown>> = [];
    const tools: AttelierHarnessToolClient = {
      async callTool<T>(name: string, args: Record<string, unknown>) {
        if (name === "plan_edit") return {
          id: `plan-${revision}`,
          baseRevision: revision,
          summary: "Tightened the opening.",
          transaction: {
            id: `transaction-${revision}`,
            baseRevision: revision,
            idempotencyKey: `transaction-${revision}`,
            source: "agent",
            authorId: "atelier",
            goal: "Tighten opening",
            preconditions: [],
            operations: [{ type: "deleteElement", elementId: "clip-1" }],
          },
        } as T;
        if (name === "simulate_transaction") return { revision: revision + 1, alreadyApplied: false } as T;
        if (name === "commit_transaction") {
          revision += 1;
          return { revision, transactionId: String((args.transaction as { id?: unknown }).id) } as T;
        }
        if (name === "list_project_versions") return { projectId: "project-1", currentRevision: revision, versions } as T;
        if (name === "create_project_version") {
          const checkpoint = { id: "version-1", name: args.name, revision };
          versions.push(checkpoint);
          return checkpoint as T;
        }
        throw new Error(`Unexpected tool ${name}`);
      },
    };
    const runtime = new AttelierHeadlessSession({ sessionId: created.id, store, client: tools });
    const planned = await runAttelierSessionInput(runtime, "/plan --element clip-1 trim two frames");
    assert.match(planned.message, /Simulated/);
    const edited = await runAttelierSessionInput(runtime, "/edit --element clip-1 trim two frames");
    assert.equal(edited.projection.projectRevision, 1);
    const checkpoint = await runAttelierSessionInput(runtime, "/checkpoint Opening approved");
    assert.match(checkpoint.message, /Opening approved/);
    const listed = await runAttelierSessionInput(runtime, "/versions");
    assert.match(listed.message, /r1 · Opening approved/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("shared Library commands search and import through the harness authority", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "atelier-session-command-library-"));
  try {
    const store = new AttelierSessionStore({ rootDir: directory });
    const created = await store.create({ title: "Library commands", workingDirectory: "terminal", projectId: "project-1" });
    const calls: string[] = [];
    const tools: AttelierHarnessToolClient = {
      async callTool<T>(name: string) {
        calls.push(name);
        if (name === "search_workspace_assets") return {
          assets: [{ id: "workspace-video-1", kind: "video", name: "Forest master" }],
        } as T;
        if (name === "prepare_workspace_asset_import") return {
          projectAssetId: "library:workspace-video-1",
          transaction: {
            id: "transaction-library-1",
            baseRevision: 0,
            idempotencyKey: "transaction-library-1",
            source: "agent",
            authorId: "atelier",
            goal: "Import Library asset",
            preconditions: [],
            operations: [],
          },
        } as T;
        if (name === "simulate_transaction") return { revision: 1, alreadyApplied: false } as T;
        if (name === "commit_transaction") return { revision: 1, transactionId: "transaction-library-1" } as T;
        throw new Error(`Unexpected tool ${name}`);
      },
    };
    const runtime = new AttelierHeadlessSession({ sessionId: created.id, store, client: tools });
    const searched = await runAttelierSessionInput(runtime, "/library forest");
    assert.match(searched.message, /workspace-video-1 · video · Forest master/);
    const imported = await runAttelierSessionInput(runtime, "/library import workspace-video-1");
    assert.match(imported.message, /library:workspace-video-1.*revision 1/);
    assert.deepEqual(calls, [
      "search_workspace_assets",
      "prepare_workspace_asset_import",
      "simulate_transaction",
      "commit_transaction",
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
