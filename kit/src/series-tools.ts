const text = { type: "string", minLength: 1 };
const revision = { type: "integer", minimum: 0 };
export const SERIES_TOOLS = [
  { name: "read_series", description: "Read owned Series, frozen pilot recipes, planned episodes, their exact renders/approval and current calendar-month credit commitments (UTC). Planning never starts schedules.", inputSchema: { type: "object", additionalProperties: false, properties: { seriesId: text } } },
  { name: "save_series", description: "Save a reusable recipe only after creator approval of the exact finished pilot and recipe. Freezes its motion spec or editable template and generation steps. Requires an explicit monthly credit cap. Changes apply to future plans; planned episodes retain their original version. No social publication or automatic schedule activation.", inputSchema: { type: "object", additionalProperties: false, properties: {
    seriesId: text, expectedRevision: revision, idempotencyKey: { type: "string", minLength: 8, maxLength: 200 }, name: { type: "string", minLength: 1, maxLength: 160 },
    pilotRenderId: text, approvedPilot: { type: "boolean", enum: [true] }, monthlyCredits: { type: "number", minimum: 0, maximum: 10000000 }, recipe: { type: "object" },
  }, required: ["name", "pilotRenderId", "approvedPilot", "monthlyCredits", "recipe"] } },
  { name: "plan_episodes", description: "Plan 1–50 dated topics and inputs against the current Series revision, without spending. Reuse each episode key after interruption. Replanning needs the episode revision and is allowed only before quoting; make_episode(action=skip) skips an unstarted episode.", inputSchema: { type: "object", additionalProperties: false, properties: {
    seriesId: text, expectedRevision: revision, episodes: { type: "array", minItems: 1, maxItems: 50, items: { type: "object", additionalProperties: false, properties: {
      key: { type: "string", pattern: "^[a-zA-Z0-9_-]{1,80}$" }, topic: { type: "string", minLength: 1, maxLength: 500 }, scheduledAt: { type: "integer", minimum: 0 }, inputs: { type: "object" }, expectedRevision: revision,
    }, required: ["key", "topic", "scheduledAt", "inputs"] } },
  }, required: ["seriesId", "expectedRevision", "episodes"] } },
  { name: "make_episode", description: "Generate one planned episode under its explicit maximumCredits and Series monthly cap. Same episode always reuses its durable run. Budget approval may return quoteId before starting. Read status with read_series. Approve only the exact checked render after creator review; approval is never automatic. make/resume/cancel need spend, approve/skip need write.", inputSchema: { type: "object", additionalProperties: false, properties: {
    episodeId: text, action: { type: "string", enum: ["make", "resume", "cancel", "approve", "skip"] }, maximumCredits: { type: "number", minimum: 0 }, renderJobId: text, expectedRevision: revision,
  }, required: ["episodeId", "action"] } },
] as const;
