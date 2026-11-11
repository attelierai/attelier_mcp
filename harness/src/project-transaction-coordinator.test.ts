import assert from "node:assert/strict";
import test from "node:test";
import type { AttelierSessionEventInput } from "@attelier/agent-schema";
import {
  AttelierUncertainProjectCommitError,
  commitExactProjectTransaction,
  simulateCommitAndRecordProjectTransaction,
} from "./project-transaction-coordinator.js";

const transaction = {
  id: "transaction-1",
  idempotencyKey: "transaction-1",
  baseRevision: 2,
  operations: [],
};

test("simulation, exact commit and revision evidence share one transaction", async () => {
  const calls: Array<{ name: string; input: Record<string, unknown> }> = [];
  const events: AttelierSessionEventInput[] = [];
  const committed = await simulateCommitAndRecordProjectTransaction({
    async callTool<T>(_runId: string, name: string, input: Record<string, unknown>) {
      calls.push({ name, input });
      return (name === "commit_transaction" ? { revision: 3 } : { valid: true }) as T;
    },
    async append(input) { events.push(input); },
  }, "run-1", "project-1", transaction);

  assert.deepEqual(committed, { revision: 3, transactionId: "transaction-1" });
  assert.deepEqual(calls.map(({ name }) => name), ["simulate_transaction", "commit_transaction"]);
  assert.equal(calls[0]?.input.transaction, calls[1]?.input.transaction);
  assert.deepEqual(events, [{
    type: "project.revision.created",
    data: { runId: "run-1", projectId: "project-1", revision: 3, transactionId: "transaction-1" },
  }]);
});

test("ambiguous commits retry only the exact transaction then stay recoverable", async () => {
  const inputs: Record<string, unknown>[] = [];
  await assert.rejects(
    commitExactProjectTransaction({
      async callTool<T>(_runId: string, _name: string, input: Record<string, unknown>) {
        inputs.push(input);
        throw new Error("connection lost");
      },
    }, "run-1", "project-1", transaction),
    AttelierUncertainProjectCommitError,
  );
  assert.equal(inputs.length, 2);
  assert.equal(inputs[0]?.transaction, transaction);
  assert.equal(inputs[1]?.transaction, transaction);
});

test("definitive client failures never retry", async () => {
  let attempts = 0;
  await assert.rejects(
    commitExactProjectTransaction({
      async callTool<T>() {
        attempts += 1;
        throw Object.assign(new Error("revision conflict"), { status: 409 });
      },
    }, "run-1", "project-1", transaction),
    /revision conflict/,
  );
  assert.equal(attempts, 1);
});
