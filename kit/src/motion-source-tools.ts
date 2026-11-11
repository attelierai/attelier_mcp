export const MOTION_SOURCE_TOOLS = [
  {
    name: "motion_source",
    description: "List, read or save an immutable custom Remotion composition in the shared project. Save with expectedVersion (0 for new) and expectedRevision from inspect_project; a save returns only {sourceId, version, sha256, bytes}. Give the TSX one way: composition.code, path (a .tsx file in your working folder, local connector), or patch (a unified diff against the current version's code). On a later version, omitted composition fields and media are kept from the current version. Media bind project assets or Library assets (the assetId import_media returns). Use get only when you need the stored code back. Sources are one default-export TSX component, JSON props and asset bindings. Load motion-design for the pinned runtime and workflow.",
    inputSchema: { type: "object", additionalProperties: false, required: ["action", "projectId"], properties: {
      action: { type: "string", enum: ["list", "get", "save"] }, projectId: { type: "string" },
      sourceId: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_-]{0,63}$" },
      version: { type: "integer", minimum: 1 }, expectedVersion: { type: "integer", minimum: 0 }, expectedRevision: { type: "integer", minimum: 0 },
      path: { type: "string", maxLength: 4000, description: "Local connector: a .tsx file in the working folder whose text becomes composition.code." },
      patch: { type: "string", maxLength: 262144, description: "A unified diff (---/+++/@@ hunks) applied to the current version's code." },
      composition: { type: "object", additionalProperties: false, properties: {
        code: { type: "string", maxLength: 262144 }, width: { type: "integer", minimum: 16, maximum: 1920 }, height: { type: "integer", minimum: 16, maximum: 1920 },
        fps: { type: "integer", minimum: 1, maximum: 60 }, durationInFrames: { type: "integer", minimum: 1, maximum: 10800 }, props: { type: "object", additionalProperties: true },
      } },
      media: { type: "array", maxItems: 32, items: { type: "object", additionalProperties: false, required: ["name", "assetId"], properties: {
        name: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_-]{0,63}$" }, assetId: { type: "string" },
      } } },
    } },
  },
  {
    name: "motion_render_source",
    description: "Render one exact saved Remotion source version in an isolated, bounded runtime. Choose stillAtSeconds, rangeSeconds [start,end), preview:true, or final. Cached outputs retain source/media lineage. The local connector can downloadTo an explicit absolute file (generated/ for candidates; out/ to show a creator). Repeated same-version requests reuse the result. No paid model/provider call.",
    inputSchema: { type: "object", additionalProperties: false, required: ["projectId", "sourceId", "version"], properties: {
      projectId: { type: "string" }, sourceId: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_-]{0,63}$" }, version: { type: "integer", minimum: 1 },
      stillAtSeconds: { type: "number", minimum: 0 }, rangeSeconds: { type: "array", minItems: 2, maxItems: 2, items: { type: "number", minimum: 0 } },
      preview: { type: "boolean" }, downloadTo: { type: "string", description: "Connector-local absolute destination; never a path on the API host." },
    } },
  },
] as const;
