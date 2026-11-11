export const DELIVERY_TOOLS = [{
  name: "delivery_pack",
  description: "Prepare revision-pinned editable format variants and render quotes under one credit ceiling. Explicit contain preserves framing; cover applies a centered crop that needs review. Source stays unchanged. Use start after quote approvals; retries reuse jobs and preserve partial outputs. artifacts creates cover PNGs and returns saved SRT/VTT. get is read-only; prepare/artifacts need write; start/cancel need spend. No social publication.",
  inputSchema: { type: "object", additionalProperties: false, properties: {
    action: { type: "string", enum: ["prepare", "get", "start", "cancel", "artifacts"] },
    projectId: { type: "string" }, expectedRevision: { type: "integer", minimum: 0 }, packId: { type: "string" },
    idempotencyKey: { type: "string", minLength: 8, maxLength: 200 }, maximumCredits: { type: "number", minimum: 0 }, coverAtSeconds: { type: "number", minimum: 0 },
    variants: { type: "array", minItems: 1, maxItems: 6, items: { type: "object", additionalProperties: false, properties: {
      name: { type: "string", pattern: "^[a-zA-Z0-9_-]{1,60}$" }, width: { type: "integer", minimum: 128, maximum: 3840 }, height: { type: "integer", minimum: 128, maximum: 3840 },
      format: { type: "string", enum: ["mp4", "webm"] }, fit: { type: "string", enum: ["contain", "cover"] },
    }, required: ["name", "width", "height", "format", "fit"] } },
  }, required: ["action"] },
}, {
  name: "render_review",
  description: "Invite review of an exact completed render, read timestamped feedback as edit context, or revoke an invitation. Links expire in 1–30 days; comments only unless allowApproval is explicit. Create/revoke require write; context requires read. Feedback never authorizes edits or spending. Returned links grant access; share them only with the creator's intended reviewer.",
  inputSchema: { type: "object", additionalProperties: false, properties: {
    action: { type: "string", enum: ["create", "context", "revoke"] }, renderJobId: { type: "string" }, projectId: { type: "string" }, reviewId: { type: "string" },
    expectedRevision: { type: "integer", minimum: 0 }, label: { type: "string", minLength: 1, maxLength: 200 }, allowApproval: { type: "boolean" }, expiresInDays: { type: "integer", minimum: 1, maximum: 30 },
  }, required: ["action"] },
}, {
  name: "outcome_evidence",
  description: "Read workspace delivery outcomes, exact revision approvals, queue-to-completion time, bounded generation credit coverage and the running backend's build/dependency hashes. Missing observations yield null rates. Technical success is not creator approval, and fixture results do not prove production media quality.",
  inputSchema: { type: "object", additionalProperties: false, properties: { days: { type: "integer", minimum: 1, maximum: 365 } } },
}] as const;
