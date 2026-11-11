/** Durable multi-model generation shares the API's existing quotes and jobs. */
export const CAPABILITY_BATCH_TOOLS = [
  {
    name: "quote_capability_batch",
    description: "Quote 1–16 named generations together under an explicit total credit ceiling. Returns per-item prices or errors without starting media generation. A blocked batch cannot run; resolve its errors or ceiling and quote again.",
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: {
        maximumCredits: { type: "number", minimum: 0 },
        items: { type: "array", minItems: 1, maxItems: 16, items: {
          type: "object", additionalProperties: false,
          properties: { id: { type: "string", pattern: "^[a-zA-Z0-9_-]{1,80}$" }, capability: { type: "string", minLength: 1, maxLength: 100 }, input: { type: "object" } },
          required: ["id", "capability", "input"],
        } },
      }, required: ["maximumCredits", "items"],
    },
  },
  {
    name: "start_capability_batch",
    description: "Start an exact saved batch after its quote approvals. All local jobs and reservations are admitted together or none are. Reuse the same idempotency key after interruption; poll get_capability_batch and never re-quote uncertain paid work.",
    inputSchema: { type: "object", additionalProperties: false,
      properties: { batchId: { type: "string" }, idempotencyKey: { type: "string", minLength: 8, maxLength: 200 } }, required: ["batchId", "idempotencyKey"] },
  },
  {
    name: "get_capability_batch",
    description: "Read a generation batch's exact quotes, jobs, outputs, settled/pending credits and partial failures. A successful item stays available even when another item fails.",
    inputSchema: { type: "object", additionalProperties: false, properties: { batchId: { type: "string" } }, required: ["batchId"] },
  },
  {
    name: "cancel_capability_batch",
    description: "Request cancellation of the unfinished jobs in a batch. Completed outputs are preserved; unknown provider charges retain their reservations until reconciliation.",
    inputSchema: { type: "object", additionalProperties: false, properties: { batchId: { type: "string" } }, required: ["batchId"] },
  },
] as const;
