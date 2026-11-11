import type {
  Project,
  ProjectOperation,
  ProjectTransaction,
} from "@attelier/project-schema";

let transactionSequence = 0;

export const createTransaction = (
  project: Project,
  operations: ProjectOperation[],
  goal: string,
  source: ProjectTransaction["source"] = "ui",
): ProjectTransaction => {
  transactionSequence += 1;
  const id = `tx-${Date.now()}-${transactionSequence}`;
  return {
    id,
    baseRevision: project.revision,
    idempotencyKey: id,
    source,
    authorId: "local-user",
    goal,
    preconditions: [],
    operations,
  };
};
