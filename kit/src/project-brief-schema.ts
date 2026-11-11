/** Shared structured brief contract for Studio and MCP. */
export const PROJECT_BRIEF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", minLength: 1, maxLength: 500 },
    logline: { type: "string", maxLength: 2000 },
    decisions: {
      type: "array", maxItems: 200,
      description: "Explicit user decisions only. Update by stable id, mark superseded choices rejected, preserve unrelated accepted decisions. Intent only: inspect the timeline for applied sizes, positions and times.",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1, maxLength: 120 },
          aspect: { type: "string", minLength: 1, maxLength: 120 },
          instruction: { type: "string", minLength: 1, maxLength: 4000, description: "For a new accepted decision, quote the explicit current user instruction verbatim; do not add inferred placement, size or other agent choices. Retain existing accepted instructions unchanged." },
          status: { type: "string", enum: ["accepted", "rejected"] },
          assetIds: { type: "array", maxItems: 200, items: { type: "string", minLength: 1, maxLength: 500 } },
          elementIds: { type: "array", maxItems: 200, items: { type: "string", minLength: 1, maxLength: 500 } },
        },
        required: ["id", "aspect", "instruction", "status"],
      },
    },
    script: {
      type: "array", maxItems: 1000,
      items: {
        type: "object", additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1, maxLength: 120 },
          speaker: { type: "string", maxLength: 300 },
          line: { type: "string", minLength: 1, maxLength: 8000 },
          scene: { type: "string", maxLength: 500 },
        },
        required: ["id", "line"],
      },
    },
    characters: {
      type: "array", maxItems: 200,
      items: {
        type: "object", additionalProperties: false,
        properties: {
          name: { type: "string", minLength: 1, maxLength: 300 },
          role: { type: "string", minLength: 1, maxLength: 500 },
          description: { type: "string", maxLength: 2000 },
        },
        required: ["name", "role"],
      },
    },
    references: {
      type: "array", maxItems: 200,
      items: {
        type: "object", additionalProperties: false,
        properties: {
          kind: { type: "string", enum: ["image", "video", "url"] },
          assetId: { type: "string", minLength: 1, maxLength: 500 },
          url: { type: "string", minLength: 1, maxLength: 2000 },
          note: { type: "string", minLength: 1, maxLength: 2000 },
          observation: {
            type: "object", additionalProperties: false,
            properties: {
              timestampsSeconds: { type: "array", maxItems: 200, items: { type: "number", minimum: 0 } },
              observed: { type: "array", maxItems: 200, items: { type: "string", minLength: 1, maxLength: 2000 } },
              unobserved: { type: "array", maxItems: 200, items: { type: "string", minLength: 1, maxLength: 2000 } },
            },
            required: ["timestampsSeconds", "observed", "unobserved"],
          },
        },
        required: ["kind", "note"],
      },
    },
    style: {
      type: "object", additionalProperties: false,
      properties: {
        profile: { type: "string", maxLength: 300 },
        lowerThirdTemplate: { type: "string", maxLength: 300 },
        look: { type: "string", maxLength: 1000 },
      },
    },
    notes: { type: "string", maxLength: 100000 },
  },
  required: ["title", "script", "characters"],
} as const;
