import { PIPELINE_TOOLS } from "./pipeline-tools.js";
import { INFERENCE_TOOLS } from "./inference-tools.js";
import { CAPABILITY_BATCH_TOOLS } from "./batch-tools.js";
import { DELIVERY_TOOLS } from "./delivery-tools.js";
import { SERIES_TOOLS } from "./series-tools.js";
import { MOTION_SOURCE_TOOLS } from "./motion-source-tools.js";
import {
  atteCatalogProfilesForQualityProfile,
  SOURCE_INSPECTION_SCHEMA,
  type AtteCatalogProfile,
} from "./tool-catalog.js";

import { PROJECT_BRIEF_SCHEMA } from "./project-brief-schema.js";

const RAW_MCP_TOOLS = [
  ...MOTION_SOURCE_TOOLS,
  ...INFERENCE_TOOLS,
  ...CAPABILITY_BATCH_TOOLS,
  ...DELIVERY_TOOLS,
  ...SERIES_TOOLS,
  ...PIPELINE_TOOLS,
  {
    name: "discover_atelier",
    description: "Discover Attelier use cases, capabilities, providers, workflows and public tool entrypoints.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_craft_guide",
    description: "Read Attelier's versioned provider-independent craft rules, profile thresholds and defect taxonomy.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_effects",
    description: "Read versioned effect contracts with preconditions, safe ranges, invariants, degradation and evaluation fixtures.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_agent_skills",
    description: "Discover versioned Attelier use-case and craft discipline skills available to the harness.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_agent_skill",
    description: "Load one versioned Attelier use-case or craft discipline skill after discovery.",
    inputSchema: { type: "object", properties: { skillId: { type: "string" } }, required: ["skillId"], additionalProperties: false },
  },
  {
    name: "get_evaluation_spec",
    description: "Read a versioned benchmark rubric and rater protocol without exposing promotion holdout cases.",
    inputSchema: { type: "object", properties: { specId: { type: "string", enum: ["product-ad-rubric.v1", "talking-head-rubric.v1", "long-to-shorts-rubric.v1", "localization-rubric.v1"] } }, required: ["specId"], additionalProperties: false },
  },
  {
    name: "create_execution_trace",
    description: "Start a durable, privacy-safe execution trace that can link an agent request to edits, capability jobs, render QC, cost and provenance.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        rootKind: {
          type: "string",
          enum: ["agent-session", "studio-chat", "agent-plan", "project-transaction", "capability", "workflow", "render"],
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_execution_traces",
    description: "List recent execution-trace summaries, optionally scoped to one project. Prompt and media content are never returned.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
      additionalProperties: false,
    },
  },
  {
    name: "get_execution_trace",
    description: "Inspect the durable resource timeline, cost and versioned provenance for one execution trace without exposing prompts, secrets or media content.",
    inputSchema: {
      type: "object",
      properties: { traceId: { type: "string" } },
      required: ["traceId"],
      additionalProperties: false,
    },
  },
  {
    name: "create_session",
    description: "Create a durable Attelier harness session in the authenticated workspace. Requires mcp:write.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 1, maxLength: 160 },
        workingDirectory: { type: "string", minLength: 1, maxLength: 2000 },
        projectId: { type: "string" },
        model: { type: "object" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_sessions",
    description: "List recent durable Attelier harness sessions in the authenticated workspace.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "fork_session",
    description: "Fork one durable Attelier session at an exact sequence. The child inherits project, goal, model, media routers and remaining budget without copying history or usage. Requires mcp:write.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        expectedSequence: { type: "integer", minimum: 1 },
        title: { type: "string", minLength: 1, maxLength: 160 },
        workingDirectory: { type: "string", minLength: 1, maxLength: 2000 },
      },
      required: ["sessionId", "expectedSequence"],
      additionalProperties: false,
    },
  },
  {
    name: "get_session",
    description: "Read the canonical projection of one durable Attelier harness session.",
    inputSchema: {
      type: "object",
      properties: { sessionId: { type: "string" } },
      required: ["sessionId"],
      additionalProperties: false,
    },
  },
  {
    name: "get_session_events",
    description: "Read the ordered append-only events for a durable Attelier harness session.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        afterSequence: { type: "integer", minimum: 0, default: 0 },
        limit: { type: "integer", minimum: 1, maximum: 500, default: 500 },
      },
      required: ["sessionId"],
      additionalProperties: false,
    },
  },
  {
    name: "append_session_event",
    description: "Append one schema-validated event with optimistic sequence control to a durable Attelier session. Requires mcp:write.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        expectedSequence: { type: "integer", minimum: 1 },
        eventId: { type: "string" },
        type: { type: "string" },
        data: { type: "object" },
      },
      required: ["sessionId", "expectedSequence", "type", "data"],
      additionalProperties: false,
    },
  },
  {
    name: "evaluate_effect_parity",
    description: "Compare preview and render signals against one canonical, versioned effect intent and its executable tolerance.",
    inputSchema: {
      type: "object",
      properties: {
        effectId: { type: "string" },
        effectVersion: { type: "integer", minimum: 1 },
        preview: {
          type: "object",
          properties: { intentKey: { type: "string" }, signals: { type: "object" } },
          required: ["intentKey", "signals"],
          additionalProperties: false,
        },
        render: {
          type: "object",
          properties: { intentKey: { type: "string" }, signals: { type: "object" } },
          required: ["intentKey", "signals"],
          additionalProperties: false,
        },
      },
      required: ["effectId", "effectVersion", "preview", "render"],
      additionalProperties: false,
    },
  },
  {
    name: "route_creative_prompt",
    description: "Classify a creative creation request into the shared versioned generation, audio, format, animation and captions plan without mutating a project or spending money.",
    inputSchema: {
      type: "object",
      properties: { prompt: { type: "string" } },
      required: ["prompt"],
      additionalProperties: false,
    },
  },
  {
    name: "list_projects",
    description: "List projects owned by the authenticated workspace, newest first.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "create_project",
    description: "Create an empty editable project in the authenticated workspace with a main sequence. Requires mcp:write.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 200 },
        frameRate: { type: "number", minimum: 1, maximum: 120, default: 24 },
        width: { type: "integer", minimum: 16, maximum: 16384, default: 1920 },
        height: { type: "integer", minimum: 16, maximum: 16384, default: 1080 },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "set_brief",
    description: "Store the complete brief, preserving explicit accepted decisions and rejecting superseded choices. Updated clients must send expectedPlanVersion from inspect_project.plan.version or get_brief.planVersion as well as expectedRevision. A 409 requires re-reading; an identical update keeps its version. expectedPlanVersion remains optional for legacy clients. Pass brief, briefMarkdown or fromPath. Requires mcp:write.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", minLength: 1 },
        expectedRevision: { type: "integer", minimum: 0 },
        expectedPlanVersion: { type: "integer", minimum: 0 },
        brief: PROJECT_BRIEF_SCHEMA,
        briefMarkdown: { type: "string", maxLength: 65536 },
        fromPath: { type: "string", minLength: 1, maxLength: 4000 },
      },
      required: ["projectId", "expectedRevision"],
      additionalProperties: false,
    },
  },
  {
    name: "get_brief",
    description: "Read the project's current structured brief together with its project revision and independently versioned project-plan record.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string", minLength: 1 } },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "import_media",
    description: "Import media into the shared Library. attach:true also adds it to the project's assets (no timeline placement) so analysis and Studio see it; place:true prepares a reversible timeline placement. Motion compositions can bind the returned assetId either way. The local connector uploads paths from your computer; remote HTTP callers supply uploadIds from completed uploads. Pass exactly one of paths or uploadIds.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", minLength: 1 },
        paths: { type: "array", minItems: 1, maxItems: 100, uniqueItems: true, items: { type: "string", minLength: 1 } },
        uploadIds: { type: "array", minItems: 1, maxItems: 100, uniqueItems: true, items: { type: "string", minLength: 1 } },
        place: { type: "boolean", default: false },
        attach: { type: "boolean", default: false, description: "Add to the project's assets without placing on the timeline." },
        rights: { type: "string", enum: ["user_owned", "licensed"], default: "user_owned" },
        license: { type: "string", minLength: 1, maxLength: 1000 },
        atSeconds: { type: "number", minimum: 0 },
        expectedRevision: { type: "integer", minimum: 0 },
      },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "prepare_project",
    description: "Import local media into an existing project, optionally place it, store a Markdown brief, and queue transcription, description, color, or shot-change analysis in one operation. Poll the returned handle with get_job kind prepare. Requires mcp:write; description analysis also requires mcp:spend.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", minLength: 1 },
        paths: { type: "array", minItems: 1, maxItems: 100, items: { type: "string", minLength: 1, maxLength: 4000 } },
        uploadIds: { type: "array", minItems: 1, maxItems: 100, uniqueItems: true, items: { type: "string", minLength: 1 } },
        briefPath: { type: "string", minLength: 1, maxLength: 4000 },
        brief: PROJECT_BRIEF_SCHEMA, briefMarkdown: { type: "string", maxLength: 65536 },
        idempotencyKey: { type: "string", minLength: 8, maxLength: 160 },
        analyses: {
          type: "array", maxItems: 4, uniqueItems: true,
          items: { type: "string", enum: ["transcription", "description", "color", "shots"] },
          default: ["transcription"],
        },
        place: { type: "boolean", default: false },
      },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "inspect_project",
    description: "Read the canonical editable project snapshot, optionally focused to a timeline range with transcript or audio evidence.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        rangeSeconds: { type: "array", minItems: 2, maxItems: 2, items: { type: "number", minimum: 0 }, description: "Optional [start, end] timeline window in seconds." },
        include: { type: "array", uniqueItems: true, items: { type: "string", enum: ["transcripts", "audio", "coverage"] } },
      },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "search_project_media",
    description: "Search project-owned media and local analysis artifacts without network, credentials or spend. Results preserve exact media timestamps.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        query: { type: "string", minLength: 1, maxLength: 200 },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 30 },
      },
      required: ["projectId", "query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_brand_kit",
    description: "Read the authenticated workspace's canonical versioned Brand Kit.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_project_elements",
    description: "List canonical reusable characters, products, locations and styles for one owned project.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "upsert_project_element",
    description: "Create or update a canonical reusable project element by normalized kind and name. Requires mcp:write.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        element: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["character", "product", "location", "style", "logo", "reference"] },
            name: { type: "string", minLength: 1, maxLength: 300 },
            description: { type: "string", maxLength: 2000 },
            workspaceAssetId: { type: "string" },
            projectAssetId: { type: "string" },
            referenceBlueprintId: { type: "string" },
          },
          required: ["kind", "name"],
          additionalProperties: false,
        },
      },
      required: ["projectId", "element"],
      additionalProperties: false,
    },
  },
  {
    name: "get_project_plan",
    description: "Read the versioned creator-facing idea, script and ordered video beats without changing the timeline.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "update_project_plan",
    description: "Update selected fields of the creator-facing plan using an exact optimistic version. Requires mcp:write and never changes timeline history.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        expectedVersion: { type: "integer", minimum: 0 },
        expectedRevision: { type: "integer", minimum: 0 },
        patch: {
          type: "object",
          additionalProperties: false,
          properties: {
            brief: PROJECT_BRIEF_SCHEMA,
            logline: { type: "string", maxLength: 2000 },
            audience: { type: "string", maxLength: 500 },
            channel: { type: "string", maxLength: 300 },
            tone: { type: "string", maxLength: 500 },
            cta: { type: "string", maxLength: 1000 },
            script: { type: "string", maxLength: 50000 },
            profile: { type: "string", enum: ["general-video-v1", "social-video-v1", "product-ad-v1", "talking-head-v1", "documentary-v1"] },
            beats: {
              type: "array",
              maxItems: 24,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string", maxLength: 120 },
                  title: { type: "string", maxLength: 300 },
                  description: { type: "string", maxLength: 2000 },
                  milestone: { type: "string", maxLength: 300 },
                  purpose: { type: "string", maxLength: 500 },
                  visual: { type: "string", maxLength: 2000 },
                  durationSeconds: { type: "number", minimum: 0, maximum: 3600 },
                  assetPlan: { type: "string", maxLength: 1000 },
                },
                required: ["id", "title"],
              },
            },
          },
        },
      },
      required: ["projectId", "expectedVersion", "patch"],
      additionalProperties: false,
    },
  },
  {
    name: "analyze_reference_url",
    description: "Analyze a reference video into an evidence-linked, anti-copy Reference Blueprint and save it to the selected project. Give sourceUrl (a YouTube, Vimeo or X link, or a direct https .mp4/.webm/.mov file) or uploadId (a completed video upload), not both. Frames are taken at the real cuts and the sound is measured (tempo, loudness, energy rises, speech). This may incur model spend and requires mcp:spend.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        projectId: { type: "string" },
        sourceUrl: { type: "string", minLength: 1, maxLength: 2000 },
        uploadId: { type: "string", minLength: 1, maxLength: 200 },
        objective: { type: "string", minLength: 1, maxLength: 700 },
        rightsDeclaration: { type: "string", enum: ["user_owned", "licensed", "public_reference_only", "unknown"] },
        rightsNote: { type: "string", maxLength: 500 },
      },
      required: ["projectId"],
    },
  },
  {
    name: "request_creative_decision",
    description: "Pause for 2–4 concrete creator choices only when a subjective, high-impact, materially uncertain fork justifies interruption. The agent cannot vote. Requires mcp:write.",
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: {
        projectId: { type: "string" }, projectRevision: { type: "integer", minimum: 0 }, runId: { type: "string" }, referenceBlueprintId: { type: "string" },
        kind: { type: "string", enum: ["concept", "script", "voice", "music", "visual", "generated_shot", "rough_cut"] },
        question: { type: "string" }, context: { type: "string" },
        candidates: { type: "array", minItems: 2, maxItems: 4, items: { type: "object", additionalProperties: false, required: ["id", "label", "description", "preview"], properties: { id: { type: "string" }, label: { type: "string" }, description: { type: "string" }, rationale: { type: "string" }, preview: { type: "object", additionalProperties: false, required: ["kind"], properties: { kind: { type: "string", enum: ["text", "image", "video", "audio"] }, text: { type: "string" }, url: { type: "string" }, assetId: { type: "string" } } } } } },
        policy: { type: "object", additionalProperties: false, required: ["subjective", "impact", "uncertainty", "reversibility", "reason", "allowAgentJudgment"], properties: { subjective: { type: "boolean", const: true }, impact: { type: "string", enum: ["medium", "high"] }, uncertainty: { type: "number", minimum: 0.3, maximum: 1 }, reversibility: { type: "string", enum: ["easy", "moderate", "expensive"] }, estimatedCostUsd: { type: "number", minimum: 0 }, reason: { type: "string" }, allowAgentJudgment: { type: "boolean" } } },
        resumeState: { type: "string", enum: ["drafting", "generating", "editing", "reviewing"] },
      },
      required: ["projectId", "projectRevision", "kind", "question", "context", "candidates", "policy", "resumeState"],
    },
  },
  {
    name: "search_workspace_assets",
    description: "Search the authenticated user's Attelier media Library. Returns safe metadata and preview URLs, never storage paths.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        kind: { type: "string", enum: ["image", "video", "audio", "font"] },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "search_music_library",
    description: "Search rights-cleared music already in Attelier and, when configured, the free Jamendo catalog. This is read-only and filters out licenses that do not cover the requested use.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, maxLength: 500 },
        platform: { type: "string", maxLength: 100 },
        commercial: { type: "boolean", default: true },
        instrumental: { type: "boolean" },
        limit: { type: "integer", minimum: 1, maximum: 20, default: 6 },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "acquire_free_music_track",
    description: "Re-check and download one exact Jamendo track into the authenticated Attelier Music Library with license, attribution and provider provenance. Requires mcp:write.",
    inputSchema: {
      type: "object",
      properties: {
        trackId: { type: "string", pattern: "^(?:jamendo:)?[0-9]+$" },
        commercial: { type: "boolean", default: true },
      },
      required: ["trackId"],
      additionalProperties: false,
    },
  },
  {
    name: "get_workspace_asset",
    description: "Read one Library asset and its immutable version chain in the authenticated workspace.",
    inputSchema: {
      type: "object",
      properties: { assetId: { type: "string" } },
      required: ["assetId"],
      additionalProperties: false,
    },
  },
  {
    name: "prepare_workspace_asset_import",
    description: "Prepare, without committing, a revision-pinned project transaction that imports a Library asset with provenance and rights metadata. Optional replaceAssetId updates all uses of an existing asset from the same Library chain, preserving trim and allowing undo.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        assetId: { type: "string" },
        replaceAssetId: { type: "string" },
        expectedCurrentRevision: { type: "integer", minimum: 0 },
      },
      required: ["projectId", "assetId", "expectedCurrentRevision"],
      additionalProperties: false,
    },
  },
  {
    name: "compile_edit",
    description: "Prepare, without committing, a revision-pinned transaction from any deterministic Attelier editor tool call, including shot-aware apply_transition, punch_in and add_graphic, plus add_air, place_music, fill_room_tone, hold_last_frame, remove_graphic, freeze_frame and set_keyframe. Runs the same compiler with stored transcript, audio, color and shot-change evidence as the in-process agent, returns a ten-minute transactionRef alongside the complete transaction, and simulates the result. Public arguments are camelCase; capability tools that call a provider or spend budget are refused.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        expectedRevision: { type: "integer", minimum: 0 },
        calls: {
          type: "array",
          minItems: 1,
          maxItems: 200,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["tool"],
            properties: {
              tool: { type: "string", minLength: 1, maxLength: 80 },
              arguments: { type: "object" },
            },
          },
        },
      },
      required: ["projectId", "calls", "expectedRevision"],
      additionalProperties: false,
    },
  },
  {
    name: "add_lower_third",
    description: "Prepare, without committing, a revision-pinned transaction that adds a documentary lower third as the exact property set in the lower-thirds skill: a serif white name and a tracked gold small-caps role on two text tracks, positioned for the canvas aspect and scaled to the canvas width. Verify the result with render_frame; box sizes are pixels and are not measured for you.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        expectedCurrentRevision: { type: "integer", minimum: 0 },
        name: { type: "string", minLength: 1, maxLength: 200 },
        role: { type: "string", maxLength: 200 },
        atSeconds: { type: "number", minimum: 0, maximum: 86400 },
        durationSeconds: { type: "number", exclusiveMinimum: 0, maximum: 600, default: 6.8 },
        preset: { type: "string", enum: ["documentary-rule", "documentary-box", "minimal"] },
      },
      required: ["projectId", "name", "atSeconds", "preset", "expectedCurrentRevision"],
      additionalProperties: false,
    },
  },
  {
    name: "clear_timeline",
    description: "Prepare, without committing, a revision-pinned transaction that removes every element from the active sequence, or from one track when trackId is given. Assets stay in the project; only the timeline is emptied.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        expectedCurrentRevision: { type: "integer", minimum: 0 },
        trackId: { type: "string" },
      },
      required: ["projectId", "expectedCurrentRevision"],
      additionalProperties: false,
    },
  },
  {
    name: "reorder_clips",
    description: "Prepare, without committing, a revision-pinned transaction that re-lays one track's clips contiguously in the given order. elementIds must list every element on the track exactly once. Only start times move, so every clip keeps its source range, properties and lineage.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        expectedCurrentRevision: { type: "integer", minimum: 0 },
        trackId: { type: "string" },
        elementIds: { type: "array", minItems: 1, maxItems: 500, items: { type: "string" } },
        gapSeconds: { type: "number", minimum: 0, maximum: 60, default: 0 },
      },
      required: ["projectId", "trackId", "elementIds", "expectedCurrentRevision"],
      additionalProperties: false,
    },
  },
  {
    name: "trim_to_speech",
    description: "Prepare, without committing, a revision-pinned transaction that moves one clip's in and out points onto its own word boundaries with a handle, using the stored transcript, and shrinks any audio fade that would ramp over the first or last word. The new points stay inside the clip's current source range.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        expectedCurrentRevision: { type: "integer", minimum: 0 },
        elementId: { type: "string" },
        handleSeconds: { type: "number", minimum: 0, maximum: 2, default: 0.12 },
      },
      required: ["projectId", "elementId", "expectedCurrentRevision"],
      additionalProperties: false,
    },
  },
  {
    name: "snap_cut_to_words",
    description: "Prepare, without committing, a revision-pinned transaction that fixes one picture cut from both sides: the outgoing clip's out-point moves clear of its last word and the incoming clip's in-point clear of its first, each with a handle, using the stored transcripts.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        expectedCurrentRevision: { type: "integer", minimum: 0 },
        atSeconds: { type: "number", minimum: 0, maximum: 86400 },
        handleSeconds: { type: "number", minimum: 0, maximum: 2, default: 0.12 },
      },
      required: ["projectId", "atSeconds", "expectedCurrentRevision"],
      additionalProperties: false,
    },
  },
  {
    name: "level_dialogue",
    description: "Prepare, without committing, a revision-pinned transaction that sets each measured clip's audio.gainDb so it lands on the target loudness bed, clamped to plus or minus 12 dB and never pushing the measured true peak above -1 dBTP, and puts a short fade on the real cuts only. A split of one continuous take is not a cut and is left un-faded.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        expectedCurrentRevision: { type: "integer", minimum: 0 },
        targetLufs: { type: "number", minimum: -40, maximum: -6, default: -18 },
        fadeSeconds: { type: "number", minimum: 0, maximum: 2, default: 0.08 },
      },
      required: ["projectId", "expectedCurrentRevision"],
      additionalProperties: false,
    },
  },
  {
    name: "set_project_profile",
    description: "Prepare, without writing, a revision-pinned transaction carrying the first-class project-plan profile patch and matching delivery.qualityProfile properties; commit_transaction applies both.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        expectedCurrentRevision: { type: "integer", minimum: 0 },
        profile: { type: "string", enum: ["general-video-v1", "social-video-v1", "product-ad-v1", "talking-head-v1", "documentary-v1"] },
      },
      required: ["projectId", "profile", "expectedCurrentRevision"],
      additionalProperties: false,
    },
  },
  {
    name: "prepare_project_asset_placement",
    description: "Prepare, without committing, a revision-pinned transaction that places an existing project image, video or audio asset on the active sequence. Appends by default and creates a compatible track only when needed.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        assetId: { type: "string" },
        expectedCurrentRevision: { type: "integer", minimum: 0 },
        trackId: { type: "string" },
        startSeconds: { type: "number", minimum: 0, maximum: 86400 },
        sourceStartSeconds: { type: "number", minimum: 0, maximum: 86400 },
        durationSeconds: { type: "number", exclusiveMinimum: 0, maximum: 86400 },
        audioRole: { type: "string", enum: ["dialogue", "voiceover", "music", "sfx", "ambience"] },
      },
      required: ["projectId", "assetId", "expectedCurrentRevision"],
      additionalProperties: false,
    },
  },
  {
    name: "set_sequence_frame_rate",
    description: "Prepare, without committing, a revision-pinned transaction that sets the sequence frame rate. Match it to the dominant source footage (24 fps clips in a 29.97 fps sequence render with duplicated frames and judder).",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        expectedCurrentRevision: { type: "integer", minimum: 0 },
        frameRate: { type: "number", enum: [24, 25, 29.97, 30, 50, 60] },
        sequenceId: { type: "string" },
      },
      required: ["projectId", "expectedCurrentRevision", "frameRate"],
      additionalProperties: false,
    },
  },
  {
    name: "create_upload",
    description: "Create an authenticated, quota-checked local-media upload slot. The returned uploadId accepts sequential base64 chunks only.",
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: {
        fileName: { type: "string", minLength: 1, maxLength: 1024 },
        mimeType: { type: "string", minLength: 1, maxLength: 200 },
        byteSize: { type: "integer", minimum: 0, maximum: 2147483648 },
        contentHash: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
      },
      required: ["fileName", "mimeType", "byteSize"],
    },
  },
  {
    name: "upload_chunk",
    description: "Append one sequential base64-encoded chunk to an authenticated upload. Offset must equal the server's nextOffset.",
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: {
        uploadId: { type: "string" },
        offset: { type: "integer", minimum: 0 },
        base64: { type: "string", maxLength: 11184812 },
      },
      required: ["uploadId", "offset", "base64"],
    },
  },
  {
    name: "complete_upload",
    description: "Finalize an authenticated upload, verify its exact SHA-256 bytes and move it into canonical Attelier storage.",
    inputSchema: { type: "object", properties: { uploadId: { type: "string" } }, required: ["uploadId"], additionalProperties: false },
  },
  {
    name: "create_workspace_asset_from_upload",
    description: "Create or reuse the user's versioned Library asset for a completed upload, preserving canonical provenance and deduplication.",
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: { uploadId: { type: "string" }, name: { type: "string", maxLength: 1024 }, provenance: { type: "object", additionalProperties: true } },
      required: ["uploadId"],
    },
  },
  {
    name: "start_analysis_job",
    description: "Start one existing server-side analysis for a project asset: transcription, audio analysis or flattened-video reconstruction.",
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: {
        projectId: { type: "string" },
        assetId: { type: "string" },
        capability: { type: "string", enum: ["transcribe", "analyze_audio", "identify_music", "reconstruct_video"] },
      },
      required: ["projectId", "assetId", "capability"],
    },
  },
  {
    name: "get_analysis_job",
    description: "Read the status and progress of one server-side media analysis job.",
    inputSchema: { type: "object", properties: { jobId: { type: "string" } }, required: ["jobId"], additionalProperties: false },
  },
  {
    name: "describe_asset",
    description: "Read one project video or image asset with the vision model and store a durable, versioned description: summary, timestamped shots, what is said, mood, quality issues, a suggested story role and confidence. Evidence is a duration-adaptive contact sheet with burned source timestamps plus the clip's transcript and audio analysis when they exist. The stored description is reused on later calls; pass force to pay for a fresh reading.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { projectId: { type: "string" }, assetId: { type: "string" }, force: { type: "boolean" } },
      required: ["projectId", "assetId"],
    },
  },
  {
    name: "get_asset_description",
    description: "Read the stored vision description of one project video or image asset without paying for a new reading. Returns null when the asset has never been described.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { projectId: { type: "string" }, assetId: { type: "string" } },
      required: ["projectId", "assetId"],
    },
  },
  {
    name: "render_frame",
    description: "Render ONE frame of the project's active sequence at a timeline second through the real export pipeline (the same FFmpeg filter graph the delivery render uses), so titles, grades, fits and overlay geometry are exactly what the export will contain rather than a browser approximation. Returns JSON first and an MCP image/png content block at the requested width (default 960, maximum 1920). Frames are cached on disk per revision, time and width, so re-asking is free.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        projectId: { type: "string" },
        atSeconds: { type: "number", minimum: 0 },
        width: { type: "integer", minimum: 320, maximum: 1920, default: 960 },
      },
      required: ["projectId", "atSeconds"],
    },
  },
  {
    name: "render_range",
    description: "Render a fast H.264 preview of one stretch of the timeline (at most 30 seconds) through the real export filter graph, with audio but without the delivery master pass. Returns JSON first and an MCP resource link for the authenticated MP4. Use it to judge pacing, a transition or a cut in motion.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        projectId: { type: "string" },
        startSeconds: { type: "number", minimum: 0 },
        endSeconds: { type: "number", minimum: 0 },
        height: { type: "integer", enum: [360, 540], default: 540 },
      },
      required: ["projectId", "startSeconds", "endSeconds"],
    },
  },
  {
    name: "review_cut",
    description: "Deterministic editorial review of a timeline, free and model-free. Reports cuts that land inside a spoken word (in or out point), a line said twice across a cut, an audio fade that starts before the last word finishes, integrated-loudness jumps over 6 dB at a cut, clips whose speech is muted, titles outside the delivery safe area or held across a cut, missing editing proxies, source/sequence frame-rate mismatches, measured silences over one second and motionless tails. Each finding carries a timeline second, the element ids and, where the repair is unambiguous, the editor tool and arguments that perform it. Nothing here blocks an export.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        projectId: { type: "string" },
        startSeconds: { type: "number", minimum: 0 },
        endSeconds: { type: "number", minimum: 0 },
      },
      required: ["projectId"],
    },
  },
  {
    name: "review_frames",
    description: "Pay the vision model to LOOK at up to twelve rendered timeline frames. Frames are produced by render_frame (so the model sees the real burned-in titles and grade), tiled with the timeline timecode burned into each cell, and supplied together with what the project says should be on screen and spoken at each of those moments. Returns per-frame observations — what is on screen, the visible text and whether it is legible, problems — plus continuity notes between consecutive frames and a verdict. The spend is recorded in the ledger like describe_asset.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        projectId: { type: "string" },
        atSeconds: { type: "array", items: { type: "number", minimum: 0 }, minItems: 1, maxItems: 12 },
        everySeconds: { type: "number", exclusiveMinimum: 0 },
      },
      required: ["projectId"],
    },
  },
  {
    name: "get_transcript",
    description: "Read the latest word-level transcript artifact for one project asset, if analysis has completed.",
    inputSchema: { type: "object", properties: { projectId: { type: "string" }, assetId: { type: "string" } }, required: ["projectId", "assetId"], additionalProperties: false },
  },
  {
    name: "search_transcript",
    description: "Find exact words or phrases in a completed transcript and map every match to source and active-timeline ranges without changing the project.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        assetId: { type: "string" },
        query: { type: "string", minLength: 1, maxLength: 500 },
        elementId: { type: "string" },
      },
      required: ["projectId", "assetId", "query"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_transcript_edit",
    description: "Compile and simulate one zero-cost, reversible transcript edit. It can remove filler words, shorten long silences, remove exact adjacent repetitions or create synced captions; it never commits automatically.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        assetId: { type: "string" },
        elementId: { type: "string" },
        kind: { type: "string", enum: ["fillers", "silences", "repetitions", "captions"] },
        minimumSilenceSeconds: { type: "number", minimum: 0.1, maximum: 30 },
        targetSilenceSeconds: { type: "number", minimum: 0.08, maximum: 5 },
        minimumFillerConfidence: { type: "number", minimum: 0, maximum: 1 },
        maxWordsPerCaption: { type: "integer", minimum: 2, maximum: 7 },
        fontSize: { type: "number", minimum: 24, maximum: 96 },
        position: { type: "string", enum: ["lower-middle", "lower-third"] },
      },
      required: ["projectId", "assetId", "kind"],
      additionalProperties: false,
    },
  },
  {
    name: "get_audio_analysis",
    description: "Read the latest loudness, silence and beat analysis artifact for one project asset, if analysis has completed.",
    inputSchema: { type: "object", properties: { projectId: { type: "string" }, assetId: { type: "string" } }, required: ["projectId", "assetId"], additionalProperties: false },
  },
  {
    name: "get_music_identification",
    description: "Read the latest music-identification metadata for one project asset. Identification remains reference-only and never grants publication rights.",
    inputSchema: { type: "object", properties: { projectId: { type: "string" }, assetId: { type: "string" } }, required: ["projectId", "assetId"], additionalProperties: false },
  },
  {
    name: "get_video_reconstruction",
    description: "Read the latest measured shot reconstruction artifact for one flattened source video, if analysis has completed.",
    inputSchema: { type: "object", properties: { projectId: { type: "string" }, assetId: { type: "string" } }, required: ["projectId", "assetId"], additionalProperties: false },
  },
  {
    name: "list_project_versions",
    description: "List named project checkpoints and the current revision without mutating the project.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "compare_project_versions",
    description: "Compare two durable project revisions before proposing a restore. Returns structural editorial differences without mutation.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        leftRevision: { type: "integer", minimum: 0 },
        rightRevision: { type: "integer", minimum: 0 },
      },
      required: ["projectId", "leftRevision", "rightRevision"],
      additionalProperties: false,
    },
  },
  {
    name: "create_project_version",
    description: "Name the current project revision as a durable checkpoint. Fails if the project changed after inspection.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        name: { type: "string", minLength: 1, maxLength: 120 },
        note: { type: "string", maxLength: 1000 },
        expectedCurrentRevision: { type: "integer", minimum: 0 },
      },
      required: ["projectId", "name", "expectedCurrentRevision"],
      additionalProperties: false,
    },
  },
  {
    name: "restore_project_version",
    description: "Restore a previously inspected revision by creating a new revision. Requires an exact current-revision precondition and explicit non-destructive restore acknowledgement.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        targetRevision: { type: "integer", minimum: 0 },
        expectedCurrentRevision: { type: "integer", minimum: 0 },
        acknowledgeCreatesNewRevision: { type: "boolean", const: true },
      },
      required: ["projectId", "targetRevision", "expectedCurrentRevision", "acknowledgeCreatesNewRevision"],
      additionalProperties: false,
    },
  },
  {
    name: "plan_edit",
    description: "Turn a deterministic natural-language edit into a typed transaction and real project simulation, scoped by explicit selection.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        prompt: { type: "string" },
        selection: {
          type: "object",
          properties: {
            elementId: { type: "string" },
            assetId: { type: "string" },
            start: { type: "string" },
            end: { type: "string" },
          },
          additionalProperties: false,
        },
      },
      required: ["projectId", "prompt"],
      additionalProperties: false,
    },
  },
  {
    name: "compose_social_ad",
    description: "Compile and simulate one supplied-media vertical social ad. The harness must choose assets, order, timing, truthful copy, captions and mix; Attelier validates and returns an editable transaction without committing it.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" }, durationSeconds: { type: "number", minimum: 3, maximum: 30 },
        shots: { type: "array", minItems: 2, maxItems: 6, items: { type: "object", properties: { assetId: { type: "string" }, startSeconds: { type: "number", minimum: 0 }, durationSeconds: { type: "number", minimum: 1.25 }, headline: { type: "string" }, motion: { type: "string", enum: ["none", "slow-zoom-in", "slow-zoom-out"] } }, required: ["assetId", "startSeconds", "durationSeconds"], additionalProperties: false } },
        voice: { type: "object", properties: { assetId: { type: "string" }, startSeconds: { type: "number", minimum: 0 }, gainDb: { type: "number", minimum: -12, maximum: 6 } }, required: ["assetId", "startSeconds"], additionalProperties: false },
        music: { type: "object", properties: { assetId: { type: "string" }, startSeconds: { type: "number", minimum: 0 }, durationSeconds: { type: "number", minimum: 1 }, gainDb: { type: "number", minimum: -30, maximum: -3 }, fadeInSeconds: { type: "number", minimum: 0, maximum: 2 }, fadeOutSeconds: { type: "number", minimum: 0, maximum: 2 } }, required: ["assetId", "startSeconds", "durationSeconds", "gainDb"], additionalProperties: false },
        captions: { type: "array", minItems: 1, maxItems: 12, items: { type: "object", properties: { text: { type: "string" }, startSeconds: { type: "number", minimum: 0 }, durationSeconds: { type: "number", minimum: 0.25 } }, required: ["text", "startSeconds", "durationSeconds"], additionalProperties: false } },
      }, required: ["projectId", "durationSeconds", "shots", "voice", "music", "captions"], additionalProperties: false,
    },
  },
  {
    name: "simulate_transaction",
    description: "Validate and preview any structured project transaction without committing it, including raw addAsset and replaceElement operations.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        transaction: { type: "object" },
      },
      required: ["projectId", "transaction"],
      additionalProperties: false,
    },
  },
  {
    name: "commit_transaction",
    description: "Commit a validated Editor API transaction to the authoritative operation log. Pass exactly one of the complete transaction object or a non-expired transactionRef returned by compile_edit.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        transaction: { type: "object" },
        transactionRef: { type: "string", minLength: 1, maxLength: 200 },
      },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "evaluate_project",
    description: "Run deterministic L2 technical/editorial quality checks on the canonical project. This is not a human perceptual verdict.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        profile: { type: "string", enum: ["general-video-v1", "social-video-v1", "product-ad-v1", "talking-head-v1"], default: "general-video-v1" },
      },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_quality_fix",
    description: "Compile one current evaluator issue into canonical operations and simulate them without mutating the project.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        issueId: { type: "string" },
        profile: { type: "string", enum: ["general-video-v1", "social-video-v1", "product-ad-v1", "talking-head-v1"], default: "general-video-v1" },
      },
      required: ["projectId", "issueId"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_color_correction",
    description: "Measure representative source frames with versioned RGB/luma scopes and simulate a conservative exposure/white-balance correction without mutating the project.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        elementId: { type: "string" },
      },
      required: ["projectId", "elementId"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_motion_treatment",
    description: "Measure one bounded local global-motion window, preflight, and simulate render-only stabilization, temporal motion blur, or both without mutating the project. Refuses intentional, static/low, unreliable, or protected-detail evidence; OCR and semantic subject intent are not claimed, and a short encoded proof remains required.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        elementId: { type: "string" },
        kind: { type: "string", enum: ["stabilization", "motion-blur", "both"] },
        strength: { type: "number", minimum: 0, maximum: 1, default: 0.5 },
        frames: { type: "integer", minimum: 2, maximum: 5, default: 2 },
      },
      required: ["projectId", "elementId", "kind"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_subject_reframe",
    description: "Detect and track a real subject across sampled video frames, then simulate editable position keyframes for a target format. Fails closed when confidence, continuity or subject coverage is insufficient; it never substitutes a center crop.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        elementId: { type: "string" },
        target: { type: "string", enum: ["vertical", "square", "landscape"] },
        subjectLabel: { type: "string", minLength: 1, maxLength: 40 },
      },
      required: ["projectId", "elementId", "target"],
      additionalProperties: false,
    },
  },
  {
    name: "quote_capability",
    description: "Route a capability and return its exact provider, cost, policy and approval requirements without starting work.",
    inputSchema: {
      type: "object",
      properties: { capability: { type: "string" }, input: { type: "object" } },
      required: ["capability", "input"],
      additionalProperties: false,
    },
  },
  {
    name: "get_capability_quote",
    description: "Read the exact durable capability quote so a harness session can recover after disconnect or process restart.",
    inputSchema: {
      type: "object",
      properties: { quoteId: { type: "string" } },
      required: ["quoteId"],
      additionalProperties: false,
    },
  },
  {
    name: "approve_capability_quote",
    description: "Approve a capability quote that exceeded the per-action budget threshold. Requires mcp:spend and the token creator's current owner/admin role.",
    inputSchema: {
      type: "object",
      properties: { quoteId: { type: "string" } },
      required: ["quoteId"],
      additionalProperties: false,
    },
  },
  {
    name: "reserve_capability_quote",
    description: "Reserve an approved paid capability quote. Requires the mcp:spend scope.",
    inputSchema: {
      type: "object",
      properties: { quoteId: { type: "string" } },
      required: ["quoteId"],
      additionalProperties: false,
    },
  },
  {
    name: "start_capability_job",
    description: "Start an idempotent durable capability job from the exact quoted input. Requires mcp:spend.",
    inputSchema: {
      type: "object",
      properties: {
        capability: { type: "string" },
        input: { type: "object" },
        quoteId: { type: "string" },
        reservationId: { type: "string" },
        idempotencyKey: { type: "string", minLength: 8, maxLength: 200 },
      },
      required: ["capability", "input", "quoteId", "idempotencyKey"],
      additionalProperties: false,
    },
  },
  {
    name: "get_capability_job",
    description: "Read progress, provider lineage, cost and output for a durable capability job.",
    inputSchema: {
      type: "object",
      properties: { jobId: { type: "string" } },
      required: ["jobId"],
      additionalProperties: false,
    },
  },
  {
    name: "cancel_capability_job",
    description: "Cancel a queued/running capability job and release its reservation. Requires mcp:spend.",
    inputSchema: {
      type: "object",
      properties: { jobId: { type: "string" } },
      required: ["jobId"],
      additionalProperties: false,
    },
  },
  {
    name: "list_workflow_runs",
    description: "List durable use-case workflow runs visible to this workspace, optionally for one project.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
      additionalProperties: false,
    },
  },
  {
    name: "get_workflow_run",
    description: "Inspect workflow stages, approvals, artifacts, branches, cost and recovery state.",
    inputSchema: {
      type: "object",
      properties: { runId: { type: "string" }, stageId: { type: "string" }, reason: { type: "string", maxLength: 500 } },
      required: ["runId"],
      additionalProperties: false,
    },
  },
  {
    name: "quote_workflow",
    description: "Validate a use-case workflow request and pin its delivery promise, estimated cost and runtime without starting it.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["talking_head_enhancer", "long_form_to_shorts", "social_repurposing", "restoration", "generative_vfx", "localization", "product_ad", "create_from_brief", "talking_avatar"] },
        input: { type: "object" },
        deliveryPromise: { type: "object" },
      },
      required: ["kind", "input"],
      additionalProperties: false,
    },
  },
  {
    name: "start_workflow_run",
    description: "Start the exact quoted use-case workflow as an idempotent durable run. Requires mcp:spend.",
    inputSchema: {
      type: "object",
      properties: {
        quoteId: { type: "string" },
        idempotencyKey: { type: "string", minLength: 8, maxLength: 200 },
      },
      required: ["quoteId", "idempotencyKey"],
      additionalProperties: false,
    },
  },
  {
    name: "approve_workflow_quote",
    description: "Approve a workflow quote that exceeded the per-action budget threshold. Requires mcp:spend and owner/admin authority.",
    inputSchema: {
      type: "object",
      properties: { quoteId: { type: "string" } },
      required: ["quoteId"],
      additionalProperties: false,
    },
  },
  {
    name: "approve_workflow_run",
    description: "Approve or reject the current explicit workflow approval gate. Requires mcp:spend because approval may resume paid stages.",
    inputSchema: {
      type: "object",
      properties: {
        runId: { type: "string" },
        decision: { type: "string", enum: ["approve", "reject"] },
        note: { type: "string", maxLength: 2000 },
      },
      required: ["runId", "decision"],
      additionalProperties: false,
    },
  },
  {
    name: "resume_workflow_run",
    description: "Resume a failed durable workflow from its recorded stage. Requires mcp:spend.",
    inputSchema: {
      type: "object",
      properties: { runId: { type: "string" } },
      required: ["runId"],
      additionalProperties: false,
    },
  },
  {
    name: "cancel_workflow_run",
    description: "Cancel a running or approval-blocked workflow and its remaining stages. Requires mcp:spend.",
    inputSchema: {
      type: "object",
      properties: { runId: { type: "string" } },
      required: ["runId"],
      additionalProperties: false,
    },
  },
  {
    name: "quote_render",
    description: "Pin a project revision and return render format, runtime, metering basis, cost and approval requirements without starting work.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        format: { type: "string", enum: ["mp4", "webm", "mov", "audio", "image_sequence"], default: "mp4" },
        quality: { type: "string", enum: ["draft", "standard", "master"], default: "standard" },
      },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "approve_render_quote",
    description: "Approve a render quote that exceeded the per-action budget threshold. Requires mcp:spend and owner/admin authority.",
    inputSchema: {
      type: "object",
      properties: { quoteId: { type: "string" } },
      required: ["quoteId"],
      additionalProperties: false,
    },
  },
  {
    name: "start_render_job",
    description: "Start an idempotent render from an exact revision-pinned quote after pre-render QC. Requires mcp:spend.",
    inputSchema: {
      type: "object",
      properties: {
        quoteId: { type: "string" },
        idempotencyKey: { type: "string", minLength: 8, maxLength: 200 },
      },
      required: ["quoteId", "idempotencyKey"],
      additionalProperties: false,
    },
  },
  {
    name: "get_render_job",
    description: "Read render progress, pinned revision, technical QC and output URL.",
    inputSchema: {
      type: "object",
      properties: { jobId: { type: "string" } },
      required: ["jobId"],
      additionalProperties: false,
    },
  },
  {
    name: "cancel_render_job",
    description: "Cancel a queued or running render and terminate its active media process. Requires mcp:spend.",
    inputSchema: {
      type: "object",
      properties: { jobId: { type: "string" } },
      required: ["jobId"],
      additionalProperties: false,
    },
  },
  {
    name: "evaluate_render",
    description: "Read pinned project gates and technical post-render QC. Perceptual/human quality is explicitly reported as unevaluated.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: { type: "string" },
        profile: { type: "string", enum: ["general-video-v1", "social-video-v1", "product-ad-v1", "talking-head-v1"], default: "general-video-v1" },
      },
      required: ["jobId"],
      additionalProperties: false,
    },
  },
  {
    name: "search_media",
    description: "Search project media, workspace Library media, or both through one normalized result set.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        query: { type: "string", maxLength: 500 },
        scope: { type: "string", enum: ["project", "workspace", "all"], default: "all" },
        kind: { type: "string", enum: ["video", "audio", "image", "font", "document"] },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 30 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_asset_evidence",
    description: "Read stored transcript, audio analysis, six-frame color analysis and visual description for one project element or asset. Library-backed assets also return their immutable version chain with rights and provenance. assetId accepts either the library:<id> form returned by inspect_project or the bare id, and the response preserves the caller's form.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" }, elementId: { type: "string" }, assetId: { type: "string" },
        include: { type: "array", uniqueItems: true, items: { type: "string", enum: ["transcript", "audio", "color", "description", "postproduction", "frames"] } },
        atSeconds: { type: "array", minItems: 1, maxItems: 6, items: { type: "number", minimum: 0 }, description: "Exact source times for original-resolution frame evidence. Include frames; no vision model is called." },
        crop: { type: "object", properties: { x: { type: "integer", minimum: 0 }, y: { type: "integer", minimum: 0 }, width: { type: "integer", minimum: 1 }, height: { type: "integer", minimum: 1 } }, required: ["x", "y", "width", "height"], additionalProperties: false },
      },
      required: ["projectId"], additionalProperties: false,
    },
  },
  {
    name: "project_budget",
    description: "Read or explicitly set the shared lifetime project spending limit in USD before paid work. get always returns an object: the limit and remaining figures are null when no limit is set; spentCredits is the spend so far. Account, deployment and connection limits still apply. Setting requires mcp:write.",
    inputSchema: { type: "object", properties: { projectId: { type: "string", minLength: 1 }, action: { type: "string", enum: ["get", "set"] }, limitUsd: { type: "number", minimum: 0, maximum: 100000 } }, required: ["projectId", "action"], additionalProperties: false },
  },
  {
    name: "project_preservation",
    description: "Read, protect or explicitly release approved project material. Protect an asset, track, clip, or selected properties (e.g. fontFamily/fontSize). API commits and simulations reject changes to protected material. Protect/release require mcp:write and current project revision and preservation version from inspect_project. Release only when the creator explicitly authorizes changing that material.",
    inputSchema: { type: "object", properties: {
      projectId: { type: "string" }, action: { type: "string", enum: ["get", "protect", "release"] },
      expectedRevision: { type: "integer", minimum: 0 }, expectedVersion: { type: "integer", minimum: 0 },
      label: { type: "string", minLength: 1, maxLength: 200 }, ruleId: { type: "string" },
      target: { type: "object", properties: { kind: { type: "string", enum: ["asset", "track", "element", "properties"] }, id: { type: "string" }, keys: { type: "array", minItems: 1, maxItems: 32, items: { type: "string" } } }, required: ["kind", "id"], additionalProperties: false },
    }, required: ["projectId", "action"], additionalProperties: false },
  },
  {
    name: "editorial_plan",
    description: "Read, propose, accept or discard a shared editorial direction. Proposals contain concrete editable calls, diagnosis, reasons, outcome and cost. Acceptance applies the saved revision-bound transaction once with a checkpoint; stale brief or project revisions require recalculation. Conversations remain in each client.",
    inputSchema: { type: "object", properties: {
      projectId: { type: "string" }, action: { type: "string", enum: ["get", "propose", "accept", "discard"] },
      expectedVersion: { type: "integer", minimum: 0 }, expectedRevision: { type: "integer", minimum: 0 },
      idempotencyKey: { type: "string", minLength: 8, maxLength: 160 }, direction: { type: "string", maxLength: 4000 }, rationale: { type: "string", maxLength: 4000 },
      expectedResult: { type: "string", maxLength: 4000 }, diagnosis: { type: "string", maxLength: 4000 }, estimatedCostUsd: { type: "number", minimum: 0 },
      evidenceIds: { type: "array", maxItems: 100, items: { type: "string", maxLength: 1000 } }, pendingReview: { type: "array", maxItems: 100, items: { type: "string", maxLength: 1000 } },
      calls: { type: "array", minItems: 1, maxItems: 100, items: { type: "object", properties: { tool: { type: "string" }, arguments: { type: "object", additionalProperties: true } }, required: ["tool", "arguments"], additionalProperties: false } },
    }, required: ["projectId", "action"], additionalProperties: false },
  },
  {
    name: "inspect_visual",
    description: "Ask a cheap vision model (GPT-5.6 Luna, usually a fraction of one credit) ONE precise question about specific frames: exact source times or a short range of a project video (sampled into at most six stills of at most 720 px), a project image, or an image this project owns (a render_frame url or an Atte output under /v1/projects/<projectId>/atte/). Returns a structured answer, per-frame observations and confidence. Identical requests are cached and free. Choose visual evidence in this order: first the stored descriptions (get_asset_evidence with include description, free); for a clip that has none, analyze_asset with analysis description once (reads the whole clip and stores it for every later turn); use inspect_visual only for a precise question the stored reading does not answer, such as whether text is legible at 3.2 s, whether a logo is visible or what changes between two moments. Never describe footage that none of these has seen.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        assetId: { type: "string", description: "A project video or image asset, bare id or library:<id>." },
        imageUrl: { type: "string", maxLength: 2000, description: "Instead of assetId: an image this project owns (a render_frame url or an Atte output url)." },
        question: { type: "string", minLength: 3, maxLength: 1000 },
        atSeconds: { type: "array", minItems: 1, maxItems: 6, items: { type: "number", minimum: 0 }, description: "Exact source times of a video asset." },
        rangeSeconds: { type: "array", minItems: 2, maxItems: 2, items: { type: "number", minimum: 0 }, description: "A source range of a video asset, sampled evenly into frames stills." },
        frames: { type: "integer", minimum: 1, maximum: 6, default: 4, description: "How many stills to sample from rangeSeconds." },
      },
      required: ["projectId", "question"], additionalProperties: false,
    },
  },
  {
    name: "analyze_asset",
    description: "Start transcription (word timestamps), audio measurements, color analysis, shot detection, visual description, or a persistent background video diagnosis (15–180 seconds). Name the media by elementId, assetId (a project or Library asset; a Library asset is attached to the project first) or, on the local connector, path (a file in your working folder, imported and attached first). Postproduction returns immediately; query get_asset_evidence or get_job(kind=analysis). It never prepares edits. Use action cancel to stop. Description and postproduction vision/listening invoke budgeted paid models; technicalOnly postproduction is free. Read partial progress and observed samples with get_asset_evidence.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" }, elementId: { type: "string" }, assetId: { type: "string" },
        path: { type: "string", maxLength: 4000, description: "Local connector: a media file in the working folder." },
        analysis: { type: "string", enum: ["transcription", "audio", "color", "shots", "description", "postproduction"] }, force: { type: "boolean", default: false },
        action: { type: "string", enum: ["start", "status", "cancel"] },
        maxCostUsd: { type: "number", minimum: 0, maximum: 20, description: "Separate cumulative analysis limit; default $2. Retries retain consumed budget." },
        inspection: SOURCE_INSPECTION_SCHEMA,
        technicalOnly: { type: "boolean", default: false, description: "Run free technical stages without vision. Read partial progress with get_asset_evidence." },
      },
      required: ["projectId", "analysis"], additionalProperties: false,
    },
  },
  {
    name: "checkpoint_project",
    description: "List, create, or non-destructively restore project checkpoints through one action-based tool.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" }, action: { type: "string", enum: ["list", "create", "restore"] },
        expectedRevision: { type: "integer", minimum: 0 }, name: { type: "string", minLength: 1, maxLength: 120 },
        note: { type: "string", maxLength: 1000 }, targetRevision: { type: "integer", minimum: 0 },
        acknowledgeCreatesNewRevision: { type: "boolean", const: true },
      },
      required: ["projectId", "action"], additionalProperties: false,
    },
  },
  {
    name: "review_project",
    description: "Delivery level reviews the exact completed renderJobId with image, audio and the shared brief; cached evidence is reusable and failures require explicit retry. Review a cut or its rhythm deterministically, inspect paid rendered frames, or run profile-aware deterministic project gates through one level-based tool. Rhythm reports shot density, pauses and compile-ready repairs; equal-shot and question/reaction flags require editable timeline boundaries, and sparse-dialogue pacing requires a shot of at least 12 seconds. Documentary gates keep scene-to-scene color measurements informational and never require product-proof binding. Frame checks can request bounded eyeline/jump-cut review at cuts and return both frame URLs.",
    inputSchema: {
      type: "object",
      properties: {
        renderJobId: { type: "string", minLength: 1 }, retryFailed: { type: "boolean", default: false },
        projectId: { type: "string" }, level: { type: "string", enum: ["cut", "rhythm", "frames", "gates", "story", "delivery"] },
        rangeSeconds: { type: "array", minItems: 2, maxItems: 2, items: { type: "number", minimum: 0 } },
        atSeconds: { type: "array", minItems: 1, maxItems: 12, items: { type: "number", minimum: 0 } },
        everySeconds: { type: "number", exclusiveMinimum: 0 },
        checks: { type: "array", minItems: 1, maxItems: 2, uniqueItems: true, items: { type: "string", enum: ["eyeline", "jump"] } },
        profile: { type: "string", enum: ["general-video-v1", "social-video-v1", "product-ad-v1", "talking-head-v1", "documentary-v1"] },
      },
      required: ["projectId", "level"], additionalProperties: false,
    },
  },
  {
    name: "generate_coverage",
    description: "Create missing documentary coverage from the exact composed timeline frame at atSeconds. Quotes the existing image_to_video capability and, unless quoteOnly is true, approves when required, reserves under the MCP token spend cap, and starts a job. Poll with get_job; completion returns a generated Library asset already imported into the project but never placed on the timeline.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", minLength: 1 },
        fromElementId: { type: "string", minLength: 1 },
        atSeconds: { type: "number", minimum: 0 },
        prompt: { type: "string", minLength: 1, maxLength: 4000 },
        durationSeconds: { type: "number", minimum: 2, maximum: 10 },
        motion: { type: "string", enum: ["static", "slow-push", "handheld"], default: "static" },
        keepAudio: { type: "boolean", const: false, default: false },
        characterReferences: {
          type: "array", maxItems: 3,
          items: {
            type: "object",
            properties: {
              elementId: { type: "string", minLength: 1 },
              atSeconds: { type: "number", minimum: 0 },
            },
            required: ["elementId", "atSeconds"],
            additionalProperties: false,
          },
        },
        quoteOnly: { type: "boolean", default: false },
      },
      required: ["projectId", "fromElementId", "atSeconds", "prompt", "durationSeconds"],
      additionalProperties: false,
    },
  },
  {
    name: "localize_project",
    description: "Localize an editable project through a quoted paid job. Maps transcript dialogue into timeline time, casts distinct narration-grade target-language voices by speaker by default (or accepts an explicit cast), translates authored text slots without changing templates or names, persists the localized transcript for review, checkpoints the source edit, and places the result reversibly. Use voice clone for voice-preserving dubbing or stock for one TTS voice. With dryRun true, returns the quote without starting. Poll completion with get_job using kind capability.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", minLength: 1 },
        expectedRevision: { type: "integer", minimum: 0 },
        targetLanguage: { type: "string", pattern: "^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$", examples: ["es"] },
        sourceLanguage: { type: "string", pattern: "^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$" },
        scope: { type: "array", items: { type: "string", enum: ["dialogue", "graphics"] }, minItems: 1, maxItems: 2, uniqueItems: true, default: ["dialogue", "graphics"] },
        voice: { type: "string", enum: ["cast", "clone", "stock"], default: "cast" },
        cast: {
          type: "array", maxItems: 50,
          items: {
            type: "object", additionalProperties: false,
            properties: {
              speaker: { type: "string", minLength: 1, maxLength: 300 },
              voiceId: { type: "string", minLength: 1, maxLength: 200 },
              description: { type: "string", minLength: 1, maxLength: 1000 },
            },
            required: ["speaker"],
          },
        },
        dryRun: { type: "boolean", default: false },
      },
      required: ["projectId", "expectedRevision", "targetLanguage"],
      additionalProperties: false,
    },
  },
  {
    name: "list_voices",
    description: "List the preset narration voices: id (pass as voiceId to a voice model), name, style, accent and provider. A voice without an id is not selectable; omit voiceId for the model's default narrator.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "fetch_image",
    description: "Download one public image (PNG, JPEG, WebP or GIF, at most 20 MB) from an http(s) URL into the Library, e.g. a logo or product shot the creator linked. Private and local addresses are refused. Returns the Library assetId (bind it in a motion composition); attach:true also adds it to the project's assets. Only fetch images the creator supplied or clearly may use.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", minLength: 8, maxLength: 4000 }, projectId: { type: "string" },
        name: { type: "string", minLength: 1, maxLength: 200 }, attach: { type: "boolean", default: false },
      },
      required: ["url", "projectId"], additionalProperties: false,
    },
  },
  {
    name: "quote_job",
    description: "Quote a render, generation capability, or durable workflow without starting or spending. A priced quote says affordable and remainingCredits; start_job refuses a quote the account cannot afford.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["render", "capability", "workflow"] }, projectId: { type: "string" },
        capability: { type: "string" }, workflow: { type: "string" }, input: { type: "object" }, deliveryPromise: { type: "object" },
        format: { type: "string", enum: ["mp4", "webm", "mov", "audio", "image_sequence"], default: "mp4" },
        quality: { type: "string", enum: ["draft", "standard", "master"], default: "standard" },
      },
      required: ["kind"], additionalProperties: false,
    },
  },
  {
    name: "start_job",
    description: "Start an approved render, capability, or workflow quote idempotently; this is the spend point. In an Autopilot Studio turn, a capability job for the open project may carry place: Attelier then places the finished asset on the timeline itself when the job completes, even after this turn ends or the API restarts, with its own Undo entry and a chat line. Do not place that asset yourself. Guided mode never places automatically; the result says so.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["render", "capability", "workflow"] }, quoteId: { type: "string" },
        idempotencyKey: { type: "string", minLength: 8, maxLength: 200 },
        place: {
          type: "object",
          description: "Capability jobs in an Autopilot Studio turn only: where the finished asset goes on the active timeline.",
          properties: {
            atSeconds: { type: "number", minimum: 0 },
            durationSeconds: { type: "number", exclusiveMinimum: 0 },
            role: { type: "string", enum: ["voiceover", "music", "sound_effect"] },
          },
          required: ["atSeconds"], additionalProperties: false,
        },
      },
      required: ["kind", "quoteId", "idempotencyKey"], additionalProperties: false,
    },
  },
  {
    name: "get_job",
    description: "Poll an analysis, render, capability, workflow, or composite project-preparation job through one tool; completed render results include JSON first plus an MCP resource link for the token-fetchable outputUrl.",
    inputSchema: {
      type: "object",
      properties: { kind: { type: "string", enum: ["analysis", "render", "capability", "workflow", "prepare"] }, jobId: { type: "string" }, downloadTo: { type: "string", description: "Local connector only: save a completed render to this explicit absolute path; existing files are never overwritten." } },
      required: ["kind", "jobId"], additionalProperties: false,
    },
  },
] as const;

export type McpToolAudience = "public" | "internal";
export type McpToolCategory = "discover" | "read" | "edit" | "review" | "render" | "generate" | "admin";
export type McpToolScope = "read" | "write" | "spend";
export type McpToolDefinition = {
  name: string;
  description: string;
  summary: string;
  inputSchema: Record<string, unknown>;
  audience: McpToolAudience;
  category: McpToolCategory;
  scope: McpToolScope;
  spends: boolean;
  profiles: readonly AtteCatalogProfile[];
};

const PUBLIC_TOOL_NAMES = [
  ...MOTION_SOURCE_TOOLS.map(t => t.name),
  ...CAPABILITY_BATCH_TOOLS.map(t => t.name),
  ...DELIVERY_TOOLS.map(t => t.name),
  ...SERIES_TOOLS.map(t => t.name),
  ...INFERENCE_TOOLS.map(t=>t.name),
  ...PIPELINE_TOOLS.map(t => t.name), "cancel_workflow_run", "resume_workflow_run",
  "discover_atelier", "list_agent_skills", "get_agent_skill", "list_projects", "create_project", "set_brief", "get_brief", "import_media", "prepare_project", "inspect_project", "search_media", "get_asset_evidence",
  "analyze_asset", "inspect_visual", "project_budget", "project_preservation", "editorial_plan", "compile_edit", "simulate_transaction", "commit_transaction", "checkpoint_project", "render_frame",
  "render_range", "review_project", "generate_coverage", "localize_project", "quote_job", "start_job", "get_job",
  "list_voices", "fetch_image",
] as const;
const PUBLIC_TOOL_NAME_SET = new Set<string>(PUBLIC_TOOL_NAMES);

const SPEND_SCOPE_TOOLS = new Set([
  "make_episode",
  "start_capability_batch", "cancel_capability_batch",
  "start_inference",
  "schedule_pipeline",
  "reserve_capability_quote", "approve_capability_quote", "start_capability_job", "cancel_capability_job",
  "start_workflow_run", "approve_workflow_quote", "approve_workflow_run", "resume_workflow_run", "cancel_workflow_run",
  "start_render_job", "approve_render_quote", "cancel_render_job", "analyze_reference_url", "describe_asset",
  "review_frames", "inspect_visual", "start_job",
  "generate_coverage",
  "localize_project",
]);
const WRITE_SCOPE_TOOLS = new Set([
  "motion_render_source",
  "save_series", "plan_episodes",
  "quote_capability_batch",
  "quote_inference", "upload_inference", "cancel_inference",
  "create_pipeline", "update_pipeline", "version_pipeline", "undo_pipeline", "pin_pipeline",
  "create_execution_trace", "create_session", "fork_session", "append_session_event",
  "upsert_project_element", "update_project_plan", "commit_transaction",
  "create_project_version", "restore_project_version", "request_creative_decision",
  "start_analysis_job", "create_upload", "upload_chunk", "complete_upload",
  "create_workspace_asset_from_upload", "acquire_free_music_track", "analyze_asset",
  "import_media", "prepare_project", "create_project", "set_brief", "fetch_image",
]);
const ACTUALLY_SPENDS = new Set([
  "delivery_pack",
  "make_episode",
  "start_capability_batch",
  "start_inference",
  "resume_workflow_run",
  "start_capability_job", "start_workflow_run", "start_render_job", "analyze_reference_url", "describe_asset",
  "review_frames", "inspect_visual", "analyze_asset", "prepare_project", "review_project", "start_job",
  "generate_coverage",
  "localize_project",
]);

const AD_MCP_TOOLS = new Set([
  "get_evaluation_spec",
  "get_brand_kit",
  "list_project_elements",
  "upsert_project_element",
  "analyze_reference_url",
  "request_creative_decision",
  "compose_social_ad",
  "propose_quality_fix",
]);

const DOCUMENTARY_MCP_TOOLS = new Set([
  "add_lower_third",
  "trim_to_speech",
  "snap_cut_to_words",
  "level_dialogue",
]);

const SHORTS_MCP_TOOLS = new Set(["propose_subject_reframe"]);

const ADMIN_MCP_TOOLS = new Set([
  "create_execution_trace",
  "list_execution_traces",
  "get_execution_trace",
  "create_session",
  "list_sessions",
  "fork_session",
  "get_session",
  "get_session_events",
  "append_session_event",
]);

const mcpProfilesFor = (name: string): readonly AtteCatalogProfile[] => {
  if (PUBLIC_TOOL_NAME_SET.has(name)) return ["shared"];
  if (AD_MCP_TOOLS.has(name)) return ["ad"];
  if (DOCUMENTARY_MCP_TOOLS.has(name)) return ["documentary"];
  if (SHORTS_MCP_TOOLS.has(name)) return ["ad", "shorts"];
  if (ADMIN_MCP_TOOLS.has(name)) return ["admin"];
  return ["shared"];
};

const categoryFor = (name: string): McpToolCategory => {
  if (name === "delivery_pack") return "render";
  if (["save_series", "plan_episodes", "project_preservation"].includes(name)) return "edit";
  if (name === "make_episode") return "generate";
  if (name === "discover_atelier" || name.startsWith("list_agent_skill") || name.startsWith("get_agent_skill") || name === "get_craft_guide" || name === "list_effects") return "discover";
  if (name.includes("render") || name === "render_frame" || name === "render_range") return "render";
  if (name === "inspect_visual" || name.includes("review") || name.includes("evaluate") || name.includes("benchmark") || name === "review_project") return "review";
  if (name.includes("capability") || name.includes("workflow") || name.includes("analysis") || name.includes("asset_description") || name === "describe_asset" || name === "analyze_asset" || name === "generate_coverage" || name === "localize_project" || name === "quote_job" || name === "start_job" || name === "get_job") return "generate";
  if (name.includes("transaction") || name.includes("edit") || name.startsWith("propose_") || name.startsWith("prepare_") || ["create_project", "import_media", "fetch_image", "set_brief", "add_lower_third", "clear_timeline", "reorder_clips", "trim_to_speech", "snap_cut_to_words", "level_dialogue", "set_project_profile", "set_sequence_frame_rate", "checkpoint_project"].includes(name)) return "edit";
  if (name.includes("session") || name.includes("upload") || name.includes("brand_kit") || name.includes("execution_trace")) return "admin";
  return "read";
};

const summaryFor = (description: string): string => {
  const first = description.split(/(?<=[.!?])\s+/u)[0]?.trim() ?? description.trim();
  return first.length <= 160 ? first : `${first.slice(0, 157)}...`;
};

export const MCP_TOOLS: readonly McpToolDefinition[] = RAW_MCP_TOOLS.map((tool) => ({
  ...tool,
  summary: summaryFor(tool.description),
  audience: PUBLIC_TOOL_NAME_SET.has(tool.name) ? "public" : "internal",
  category: categoryFor(tool.name),
  scope: SPEND_SCOPE_TOOLS.has(tool.name) ? "spend" : WRITE_SCOPE_TOOLS.has(tool.name) ? "write" : "read",
  spends: ACTUALLY_SPENDS.has(tool.name),
  profiles: mcpProfilesFor(tool.name),
}));

const TOOLS_BY_NAME = new Map(MCP_TOOLS.map((tool) => [tool.name, tool]));

export const mcpTool = (name: string): McpToolDefinition | undefined => TOOLS_BY_NAME.get(name);
export const mcpToolsForAudience = (audience: McpToolAudience): McpToolDefinition[] =>
  MCP_TOOLS.filter((tool) => tool.audience === audience);

/** Public tools are invariant. Only the internal catalog is narrowed by the
 * selected project's quality profile. */
export const mcpToolsForQualityProfile = (
  qualityProfile: string | undefined,
): McpToolDefinition[] => {
  const active = new Set(atteCatalogProfilesForQualityProfile(qualityProfile));
  return MCP_TOOLS.filter((tool) =>
    tool.audience === "public" || tool.profiles.some((profile) => active.has(profile)),
  );
};

export const ATTE_PUBLIC_TOOL_NAMES: readonly string[] = PUBLIC_TOOL_NAMES;
export const ATTE_PUBLIC_TOOLS = PUBLIC_TOOL_NAMES.map((name) => {
  const tool = TOOLS_BY_NAME.get(name);
  if (!tool) throw new Error(`Public MCP tool ${name} is missing from the generated catalog.`);
  return tool as McpToolDefinition & { audience: "public" };
});
