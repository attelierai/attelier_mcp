import type { AttelierSessionEventInput } from "@attelier/agent-schema";

export type ProjectTransactionCoordinatorPort = {
  callTool<T>(runId: string, toolName: string, input: Record<string, unknown>): Promise<T>;
  append(input: AttelierSessionEventInput): Promise<unknown>;
};

export type ProjectCommitResult = {
  revision: number;
  transactionId: string;
};

const record = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} returned an invalid object.`);
  }
  return value as Record<string, unknown>;
};

const requiredString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} returned an invalid string.`);
  return value;
};

const finiteNumber = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} returned an invalid number.`);
  return value;
};

export class AttelierUncertainProjectCommitError extends Error {
  constructor(transactionId: string, cause: unknown) {
    super(
      `Attelier could not confirm whether transaction ${transactionId} committed. ` +
      "The exact transaction is preserved; run /resume before starting another edit.",
      { cause },
    );
    this.name = "AttelierUncertainProjectCommitError";
  }
}

export const definitiveProjectCommitFailure = (error: unknown): boolean => {
  if (!error || typeof error !== "object" || !("status" in error)) return false;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && status >= 400 && status < 500 && ![408, 425, 429].includes(status);
};

/** Commit one exact transaction at most twice. Both calls preserve the same
 * transaction and idempotency key; an ambiguous second response remains
 * recoverable and blocks subsequent edits. */
export const commitExactProjectTransaction = async (
  port: Pick<ProjectTransactionCoordinatorPort, "callTool">,
  runId: string,
  projectId: string,
  transaction: Record<string, unknown>,
): Promise<ProjectCommitResult> => {
  const transactionId = requiredString(transaction.id, "project transaction.id");
  const commit = async (): Promise<ProjectCommitResult> => {
    const committed = record(
      await port.callTool(runId, "commit_transaction", { projectId, transaction }),
      "commit_transaction",
    );
    return {
      revision: finiteNumber(committed.revision, "commit_transaction.revision"),
      transactionId,
    };
  };
  try {
    return await commit();
  } catch (firstError) {
    if (definitiveProjectCommitFailure(firstError)) throw firstError;
    try {
      return await commit();
    } catch (secondError) {
      if (definitiveProjectCommitFailure(secondError)) throw secondError;
      throw new AttelierUncertainProjectCommitError(transactionId, secondError);
    }
  }
};

export const recordProjectRevision = async (
  port: Pick<ProjectTransactionCoordinatorPort, "append">,
  runId: string,
  projectId: string,
  committed: ProjectCommitResult,
): Promise<void> => {
  await port.append({
    type: "project.revision.created",
    data: {
      runId,
      projectId,
      revision: committed.revision,
      transactionId: committed.transactionId,
    },
  });
};

export const simulateCommitAndRecordProjectTransaction = async (
  port: ProjectTransactionCoordinatorPort,
  runId: string,
  projectId: string,
  transaction: Record<string, unknown>,
): Promise<ProjectCommitResult> => {
  await port.callTool(runId, "simulate_transaction", { projectId, transaction });
  const committed = await commitExactProjectTransaction(port, runId, projectId, transaction);
  await recordProjectRevision(port, runId, projectId, committed);
  return committed;
};
