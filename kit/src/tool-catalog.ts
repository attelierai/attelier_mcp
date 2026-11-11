import { PIPELINE_TOOLS, PIPELINE_JOB_TOOLS } from "./pipeline-tools.js";
import { PROJECT_BRIEF_SCHEMA } from "./project-brief-schema.js";
import { GRAPHIC_TEMPLATE_IDS } from "./graphic-templates.js";

export const SOURCE_INSPECTION_SCHEMA = {
  type: "object", additionalProperties: false, required: ["question", "atSeconds"],
  properties: {
    question: { type: "string", minLength: 1, maxLength: 1200, description: "One specific ambiguity this additional inspection will resolve." },
    atSeconds: { type: "array", minItems: 1, maxItems: 9, items: { type: "number", minimum: 0 } },
    crop: { type: "object", additionalProperties: false, required: ["x", "y", "width", "height"], properties: {
      x: { type: "integer", minimum: 0 }, y: { type: "integer", minimum: 0 }, width: { type: "integer", minimum: 1 }, height: { type: "integer", minimum: 1 },
    } },
  },
} as const;

export {
  GRAPHIC_TEMPLATE_IDS,
  GRAPHIC_TEMPLATES,
  graphicTemplate,
  type GraphicLayerTemplate,
  type GraphicTemplate,
  type GraphicTemplateId,
} from "./graphic-templates.js";

export const ATTELIER_TOOL_CATALOG_VERSION = "atelier.editor-tools.v6" as const;

export type AtteCatalogProfile =
  | "documentary"
  | "ad"
  | "shorts"
  | "shared"
  | "admin";

/** Project quality profiles select catalog capabilities, not UI surfaces. */
export const atteCatalogProfilesForQualityProfile = (
  qualityProfile: string | undefined,
): readonly AtteCatalogProfile[] => {
  if (qualityProfile === "documentary-v1") return ["documentary", "shared"];
  if (qualityProfile === "product-ad" || qualityProfile === "product-ad-v1") return ["ad", "shared"];
  if (qualityProfile === "social-video-v1") return ["shorts", "shared"];
  return ["shared"];
};

export type AttelierToolProfile =
  | "studio"
  | "studio-agentic"
  | "generate"
  | "asset-image"
  | "asset-audio"
  | "creative-brief";

export type AttelierOpenAiFunctionTool = {
  type: "function";
  profiles: readonly AtteCatalogProfile[];
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

const RAW_ATTELIER_ALL_EDITOR_OPENAI_TOOLS = [
  ...[...PIPELINE_TOOLS, ...PIPELINE_JOB_TOOLS].map(t => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.inputSchema } })),
  {
    type: "function" as const,
    function: {
      name: "trim_clip",
      description:
        "Change a clip's duration (trim from the end, or from the start when from_start).",
      parameters: {
        type: "object",
        properties: {
          element_id: { type: "string", description: "Target clip id" },
          duration_seconds: {
            type: "number",
            description: "New duration in seconds",
          },
          from_start: {
            type: "boolean",
            description: "Trim from the start instead of the end",
          },
        },
        required: ["element_id", "duration_seconds"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "split_clip",
      description:
        "Cut a clip in two at an absolute timeline position (seconds).",
      parameters: {
        type: "object",
        properties: {
          element_id: { type: "string" },
          at_seconds: {
            type: "number",
            description: "Absolute timeline position inside the clip",
          },
        },
        required: ["element_id", "at_seconds"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "move_clip",
      description:
        "Move a clip so it starts at a new absolute timeline position. For relative requests, calculate from the clip's current start shown in the snapshot, never from the playhead.",
      parameters: {
        type: "object",
        properties: {
          element_id: { type: "string" },
          start_seconds: { type: "number", minimum: 0 },
        },
        required: ["element_id", "start_seconds"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "slip_clip",
      description:
        "Slip a source-backed clip by an exact whole number of source frames while preserving its timeline position and duration. Positive frames reveal later source media; negative frames reveal earlier media. Requires valid source handles.",
      parameters: {
        type: "object",
        properties: {
          element_id: { type: "string" },
          offset_frames: { type: "integer", minimum: -10000, maximum: 10000 },
        },
        required: ["element_id", "offset_frames"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "roll_edit",
      description:
        "Roll one exact cut between adjacent source-backed clips without changing total sequence duration. Positive frames move the cut later; negative frames move it earlier.",
      parameters: {
        type: "object",
        properties: {
          outgoing_element_id: { type: "string" },
          incoming_element_id: { type: "string" },
          offset_frames: { type: "integer", minimum: -10000, maximum: 10000 },
        },
        required: ["outgoing_element_id", "incoming_element_id", "offset_frames"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "slide_clip",
      description:
        "Slide a clip between touching neighbors by exact sequence frames. Its own source and duration stay fixed while the neighboring source windows compensate.",
      parameters: {
        type: "object",
        properties: {
          element_id: { type: "string" },
          offset_frames: { type: "integer", minimum: -10000, maximum: 10000 },
        },
        required: ["element_id", "offset_frames"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "ripple_trim_clip",
      description:
        "Ripple-trim one clip edge and shift every later clip on that track by the resulting duration change. The public compile_edit boundary accepts offsetSeconds and rounds it to the sequence frame grid; the internal editor schema uses offset_frames. Positive start offsets remove source from the head; positive end offsets extend the tail.",
      parameters: {
        type: "object",
        properties: {
          element_id: { type: "string" },
          edge: { type: "string", enum: ["start", "end"] },
          offset_frames: { type: "integer", minimum: -10000, maximum: 10000 },
        },
        required: ["element_id", "edge", "offset_frames"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_speed",
      description:
        "Set playback speed of a video/audio clip (0.25–4). Timeline duration adjusts.",
      parameters: {
        type: "object",
        properties: {
          element_id: { type: "string" },
          rate: { type: "number", minimum: 0.25, maximum: 4 },
        },
        required: ["element_id", "rate"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_property",
      description:
        "Set a STATIC property on a clip (not animated over time — for animated motion use animate_motion). Paths include transform.fit (contain preserves the whole source; cover fills the canvas and crops overflow), transform.scale (0–10), transform.opacity (0–1), transform.rotation (deg), color.look (cinematic|warm|cold|vibrant|muted|bw — a colour grade on that clip), audio.muted (bool), audio.gainDb (dB), audio.fadeInSeconds, audio.fadeOutSeconds, audio.deliveryProfile (web|broadcast|podcast), text.content, text.role (headline|label|cta), style.color, style.fontSize, style.fontAssetId (the id of an imported project font asset; also set style.fontFamily to its readable label), and evidence-backed motion safety annotations motion.intent (intentional|unintentional), motion.level (static|low|moderate|high), content.essentialDetail (bool).",
      parameters: {
        type: "object",
        properties: {
          element_id: { type: "string" },
          path: { type: "string" },
          value: {
            description: "Number, string or boolean depending on the path",
          },
        },
        required: ["element_id", "path", "value"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_keyframe",
      description:
        "Add or replace a keyframe at an absolute timeline position on a clip. Use this for custom animation curves; the harness converts timeline time to clip-local exact media time.",
      parameters: {
        type: "object",
        properties: {
          element_id: { type: "string" },
          path: {
            type: "string",
            enum: [
              "transform.scale",
              "transform.position",
              "transform.rotation",
              "transform.opacity",
              "transform.crop",
              "audio.gainDb",
              "mask.region.center",
            ],
          },
          at_timeline_seconds: { type: "number", minimum: 0 },
          value: { description: "A number or normalized numeric array appropriate for the property." },
          easing: {
            type: "string",
            enum: ["linear", "easeIn", "easeOut", "easeInOut", "hold"],
            default: "linear",
            description: "Interpolation from this keyframe to the next. Defaults to linear.",
          },
        },
        required: ["element_id", "path", "at_timeline_seconds", "value"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_keyframe",
      description:
        "Delete the keyframe on one property at an exact absolute timeline position.",
      parameters: {
        type: "object",
        properties: {
          element_id: { type: "string" },
          path: { type: "string" },
          at_timeline_seconds: { type: "number", minimum: 0 },
        },
        required: ["element_id", "path", "at_timeline_seconds"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "apply_region_blur",
      description:
        "Apply an editable rectangular privacy blur to an image or video clip. Coordinates are normalized to the visible clip. The mask stays in project history and can be tracked by keyframing mask.region.center.",
      parameters: {
        type: "object",
        properties: {
          element_id: { type: "string" },
          x: { type: "number", minimum: 0, maximum: 1 },
          y: { type: "number", minimum: 0, maximum: 1 },
          width: { type: "number", minimum: 0.02, maximum: 1 },
          height: { type: "number", minimum: 0.02, maximum: 1 },
          strength: { type: "number", minimum: 1, maximum: 40 },
        },
        required: ["element_id", "x", "y", "width", "height"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_multicam_cut",
      description:
        "Create a real editable program cut from two or more video angles that are already aligned on the timeline. This does not synchronize footage: only use it when every angle has the exact same start and duration.",
      parameters: {
        type: "object",
        properties: {
          group_id: { type: "string", minLength: 1, maxLength: 120 },
          angles: {
            type: "array",
            minItems: 2,
            maxItems: 16,
            items: {
              type: "object",
              properties: {
                angle_id: { type: "string", minLength: 1, maxLength: 120 },
                element_id: { type: "string", minLength: 1, maxLength: 200 },
              },
              required: ["angle_id", "element_id"],
              additionalProperties: false,
            },
          },
          switches: {
            type: "array",
            minItems: 1,
            maxItems: 200,
            description: "Strictly increasing absolute timeline positions. The first switch must equal the aligned clips' start.",
            items: {
              type: "object",
              properties: {
                at_seconds: { type: "number", minimum: 0 },
                angle_id: { type: "string", minLength: 1, maxLength: 120 },
              },
              required: ["at_seconds", "angle_id"],
              additionalProperties: false,
            },
          },
          audio_angle_id: { type: "string", minLength: 1, maxLength: 120 },
        },
        required: ["group_id", "angles", "switches", "audio_angle_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "clear_region_mask",
      description: "Remove the editable region blur and its tracking keyframes from one clip.",
      parameters: {
        type: "object",
        properties: { element_id: { type: "string" } },
        required: ["element_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "crop_product_proof",
      description:
        "Create a non-destructive, evidence-bound detail crop from a landscape product screenshot so its real UI remains readable in a portrait video. Use visual inspection to choose the exact region. Never use this for a blind center crop, a logo, or decorative footage.",
      parameters: {
        type: "object",
        properties: {
          element_id: { type: "string", description: "Image clip containing the real product screen." },
          left: { type: "number", minimum: 0, maximum: 0.8, description: "Fraction removed from the left edge." },
          top: { type: "number", minimum: 0, maximum: 0.8, description: "Fraction removed from the top edge." },
          right: { type: "number", minimum: 0, maximum: 0.8, description: "Fraction removed from the right edge." },
          bottom: { type: "number", minimum: 0, maximum: 0.8, description: "Fraction removed from the bottom edge." },
          evidence: { type: "string", description: "Specific visible UI or product evidence retained by this crop." },
        },
        required: ["element_id", "left", "top", "right", "bottom", "evidence"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_title",
      description:
        "Add a text title at a timeline position (creates the Titles track when missing).",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string" },
          at_seconds: { type: "number", minimum: 0 },
          duration_seconds: { type: "number", minimum: 0.5 },
          color: {
            type: "string",
            pattern: "^#[0-9A-Fa-f]{6}$",
            description:
              "Optional title colour as a six-digit hex value, e.g. #ffcc00.",
          },
          font_size: {
            type: "number",
            minimum: 8,
            maximum: 512,
            description: "Optional title size in pixels.",
          },
          position: {
            type: "array",
            items: { type: "number", minimum: 0, maximum: 1 },
            minItems: 2,
            maxItems: 2,
            description:
              "Optional exact normalized [x,y] centre position. It is collision-checked before insertion.",
          },
        },
        required: ["text", "at_seconds"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "place_asset",
      description:
        "Place an EXISTING supplied project asset on the timeline without generating new media. Use for adding an uploaded voiceover, music bed, video or image from the assets list. Audio roles are functional: separate voiceover/dialogue and music elements automatically use Attelier's professional sidechain ducking and delivery master, so do NOT split or manually lower music to create ducking unless the user explicitly requests a custom envelope. Preserve every explicitly requested audio duration, role, gain and fade in this call, including zero values such as gain_db=0; omission keeps an editor default and does not satisfy an explicit request. duration_seconds controls only the placed asset and must never exceed that asset's source duration; omit it only when the complete source was requested without an explicit duration. Keeping the main video/project at full length does NOT require duration_seconds.",
      parameters: {
        type: "object",
        properties: {
          asset_id: {
            type: "string",
            description: "Existing asset id from the project snapshot.",
          },
          at_seconds: {
            type: "number",
            minimum: 0,
            description: "Absolute timeline start in seconds.",
          },
          duration_seconds: {
            type: "number",
            minimum: 0.04,
            description:
              "Optional duration of this asset only; omit for its complete source. Never use the main video's duration here and never exceed the asset source duration.",
          },
          role: {
            type: "string",
            enum: ["voiceover", "music", "dialogue", "sound_effect"],
            description: "Semantic role for audio assets.",
          },
          gain_db: { type: "number", minimum: -60, maximum: 12 },
          fade_in_seconds: { type: "number", minimum: 0, maximum: 30 },
          fade_out_seconds: { type: "number", minimum: 0, maximum: 30 },
        },
        required: ["asset_id", "at_seconds"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "insert_source_range",
      description:
        "Perform a precise three-point edit from an existing source asset. Select source in/out, then insert (ripple later material) or overwrite (replace only the covered range) at an exact timeline position.",
      parameters: {
        type: "object",
        properties: {
          asset_id: { type: "string", description: "Existing video, image or audio asset id." },
          source_in_seconds: { type: "number", minimum: 0 },
          source_out_seconds: { type: "number", minimum: 0.04 },
          timeline_start_seconds: { type: "number", minimum: 0 },
          mode: { type: "string", enum: ["insert", "overwrite"] },
          target_track_id: {
            type: "string",
            description: "Optional compatible unlocked target track. Omit to use or create the first compatible track.",
          },
        },
        required: [
          "asset_id",
          "source_in_seconds",
          "source_out_seconds",
          "timeline_start_seconds",
          "mode",
        ],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_marker",
      description:
        "Add a named sequence marker at an exact timeline position for beats, review notes, chapters or edit milestones.",
      parameters: {
        type: "object",
        properties: {
          at_seconds: { type: "number", minimum: 0 },
          name: { type: "string" },
          color: {
            type: "string",
            pattern: "^#[0-9A-Fa-f]{6}$",
            description: "Optional six-digit marker colour.",
          },
        },
        required: ["at_seconds", "name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_sequence_frame_rate",
      description:
        "Set the sequence frame rate. Match it to the dominant source footage (for example 24 for 24 fps clips) so rendering does not duplicate frames or judder.",
      parameters: {
        type: "object",
        properties: {
          frame_rate: {
            type: "number",
            enum: [24, 25, 30, 29.97, 50, 60],
            description: "Frames per second. 29.97 means the exact 30000/1001 rate.",
          },
        },
        required: ["frame_rate"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_marker",
      description: "Delete one sequence marker by its marker id.",
      parameters: {
        type: "object",
        properties: { marker_id: { type: "string" } },
        required: ["marker_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "link_clips",
      description:
        "Link two or more timeline clips so later move, trim and delete edits preserve their synchronization.",
      parameters: {
        type: "object",
        properties: {
          element_ids: {
            type: "array",
            items: { type: "string" },
            minItems: 2,
            uniqueItems: true,
          },
        },
        required: ["element_ids"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "unlink_clips",
      description: "Remove the one link group containing the supplied timeline clip.",
      parameters: {
        type: "object",
        properties: { element_id: { type: "string" } },
        required: ["element_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_clip",
      description: "Remove a clip. ripple=true closes the gap it leaves.",
      parameters: {
        type: "object",
        properties: {
          element_id: { type: "string" },
          ripple: { type: "boolean" },
        },
        required: ["element_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "apply_transition",
      description:
        "Join two adjacent visual clips with a real cross-dissolve overlap or a controlled dip to black/white. The tool creates the required overlap/ripple itself; do NOT trim or move already-adjacent clips merely to prepare the transition unless the user separately requested different clip timing.",
      parameters: {
        type: "object",
        properties: {
          outgoing_element_id: {
            type: "string",
            description: "Clip before the transition",
          },
          incoming_element_id: {
            type: "string",
            description: "Adjacent clip after the transition",
          },
          kind: {
            type: "string",
            enum: ["cross-dissolve", "dip-to-black", "dip-to-white"],
          },
          duration_seconds: { type: "number", minimum: 0.1, maximum: 2 },
          fit: {
            type: "string",
            enum: ["speech"],
            description: "Keep each transition ramp clear of transcript words, allowing at most 80 ms overlap. Applied by default when either clip has word evidence; omit it when the clips have no transcript. Asking for it without word evidence is not an error — the transition is fitted to time instead.",
          },
          max_handle_seconds: {
            type: "number",
            minimum: 0,
            maximum: 2,
            default: 0.5,
            description: "Maximum source handle to extend on either side before speech-fitting clamps the transition.",
          },
          snap: {
            type: "string",
            enum: ["shot"],
            description: "Keep both transition ramps inside their measured source shots. Applied by default when shot-change evidence exists.",
          },
        },
        required: [
          "outgoing_element_id",
          "incoming_element_id",
          "kind",
          "duration_seconds",
        ],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "apply_split_edit",
      description:
        "Create a professional J-cut (incoming audio starts early) or L-cut (outgoing audio continues) using available source handles.",
      parameters: {
        type: "object",
        properties: {
          outgoing_element_id: { type: "string" },
          incoming_element_id: { type: "string" },
          kind: { type: "string", enum: ["j-cut", "l-cut"] },
          duration_seconds: { type: "number", minimum: 0.1, maximum: 2 },
        },
        required: [
          "outgoing_element_id",
          "incoming_element_id",
          "kind",
          "duration_seconds",
        ],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "match_clip_color",
      description:
        "Match a target clip to a reference from their stored six-frame color measurements. Returns measured distance before and predicted after correction.",
      parameters: {
        type: "object",
        properties: {
          target_element_id: { type: "string" },
          reference_element_id: { type: "string" },
          strength: { type: "number", minimum: 0, maximum: 1, description: "Blend from identity (0) to the measured correction (1). Defaults to 0.8." },
        },
        required: ["target_element_id", "reference_element_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "apply_look",
      description:
        "Apply one measured-safe finishing look to the final project composite after per-clip matching.",
      parameters: {
        type: "object",
        properties: {
          look: { type: "string", enum: ["documentary-warm", "clean-neutral", "cool-corporate"] },
          strength: { type: "number", minimum: 0, maximum: 1, description: "Look intensity. Defaults to 1." },
        },
        required: ["look"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "apply_motion_treatment",
      description:
        "Preflight and propose bounded render-only stabilization, temporal motion blur, or both. Respect intentional-motion, low-motion, and protected-detail annotations; browser preview does not show the treatment and a short encoded proof is required.",
      parameters: {
        type: "object",
        properties: {
          element_id: { type: "string" },
          kind: {
            type: "string",
            enum: ["stabilization", "motion-blur", "both"],
          },
          strength: { type: "number", minimum: 0, maximum: 1 },
          frames: { type: "integer", minimum: 2, maximum: 5 },
        },
        required: ["element_id", "kind"],
      },
    },
  },
  // ---- ACTION tools: these trigger real work (AI generation jobs, format,
  // quality pass) instead of returning a timeline operation. They are dispatched
  // client-side to the capability providers, each with its own spend preflight. ----
  {
    type: "function" as const,
    function: {
      name: "generate_image",
      description:
        "Generate a NEW image from a text prompt with an AI model (FLUX) and place it on the timeline. Use for 'generate/create an image of…'.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "What to depict" },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "generate_video",
      description:
        "Generate a NEW video clip from a text prompt with an AI model and place it on the timeline. Keep generate_audio false when the edit has or plans separate voiceover/music; set it true only when native scene audio is explicitly required. When the user asks for Attelier API, H3 or the RTX 5090, pin provider_id=attelier-h3-text-to-video, use 5/10/15 seconds, 480p/768p/1080p and generate_audio=true. The server checks availability and licensing; never substitute another provider if unavailable.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          duration_seconds: { type: "number", minimum: 4, maximum: 15 },
          generate_audio: { type: "boolean", description: "Generate native scene audio. False for externally narrated or scored edits." },
          provider_id: { type: "string", description: "Explicit provider selection; Attelier H3: attelier-h3-text-to-video." },
          resolution: { type: "string", description: "Requested native output size; H3 supports 480p, 768p or 1080p." },
          aspect_ratio: { type: "string", enum: ["16:9", "9:16"] },
          seed: { type: "number", minimum: 0, maximum: 4294967295 },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "animate_clip",
      description:
        "Bring an existing IMAGE clip to life as an AI-generated motion video (image-to-video). Different from animate_motion (which is free keyframes). Use when the user wants real generated movement/cinematics from a still. For Attelier H3 / RTX 5090, pin provider_id=attelier-h3-image-to-video and generate_audio=true; availability and licensing are checked by the server with no fallback.",
      parameters: {
        type: "object",
        properties: {
          element_id: {
            type: "string",
            description:
              "The image clip to animate; omit to use the selected clip",
          },
          motion: {
            type: "string",
            description:
              "Described camera/subject motion, e.g. 'slow cinematic push-in'",
          },
          provider_id: { type: "string", description: "Explicit provider; Attelier H3: attelier-h3-image-to-video." },
          duration_seconds: { type: "number", minimum: 4, maximum: 15 },
          resolution: { type: "string" },
          aspect_ratio: { type: "string", enum: ["16:9", "9:16"] },
          generate_audio: { type: "boolean" },
          seed: { type: "number", minimum: 0, maximum: 4294967295 },
        },
        required: ["motion"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "generate_voiceover",
      description:
        "Generate a spoken voiceover and add it to the timeline. When a provider won a voice audition, pin that exact provider so accent, tone and timing decisions remain auditable.",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "Exactly what the narrator says",
          },
          provider_id: {
            type: "string",
            enum: [
              "fish-audio-s1",
              "elevenlabs-multilingual-v2",
              "elevenlabs-flash-v2.5",
              "voice-flite-local-v1",
            ],
            description:
              "Optional provider selected by an audition or explicit user choice.",
          },
          fish_voice_preset: {
            type: "string",
            enum: ["professional-english-slax"],
            description:
              "Optional audited Fish public voice preset. Use professional-english-slax for a polished English commercial voice; valid only with fish-audio-s1.",
          },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_music_library",
      description:
        "Search the user's rights-aware Music Library BEFORE generating music. Returns matching tracks with genre, mood, BPM, duration, exact licence and asset identifiers. It does not place media or spend money; import the chosen result when needed, then call place_music with its project asset id. For ads/commercial work, commercial must remain true.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Genre, mood, energy or instrumentation, e.g. 'upbeat electronic instrumental'." },
          commercial: { type: "boolean", description: "Whether the output is promotional, monetized or otherwise commercial. Defaults to true." },
          instrumental: { type: "boolean", description: "Prefer instrumental or vocal music." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "place_music",
      description:
        "Place one existing project audio asset as a real music bed. Creates or reuses the music track and authors explicit sidechain ducking under dialogue; fades are only applied when requested.",
      parameters: {
        type: "object",
        properties: {
          asset_id: { type: "string", minLength: 1, description: "Existing project audio asset id." },
          at_seconds: { type: "number", minimum: 0 },
          end_seconds: { type: "number", minimum: 0 },
          gain_db: { type: "number", minimum: -60, maximum: 12 },
          duck_under_dialogue: { type: "boolean", description: "Defaults to true." },
          duck_depth_lu: { type: "number", minimum: 0, maximum: 30, description: "Dialogue-to-music separation while speech is active. Defaults to 6 LU." },
          duck_attack_ms: { type: "number", minimum: 1, maximum: 2000, description: "Sidechain attack. Defaults to 80 ms." },
          duck_release_ms: { type: "number", minimum: 1, maximum: 5000, description: "Sidechain release. Defaults to 300 ms." },
          fade_in_seconds: { type: "number", minimum: 0, maximum: 30 },
          fade_out_seconds: { type: "number", minimum: 0, maximum: 30 },
        },
        required: ["asset_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "fill_room_tone",
      description:
        "Fill one timeline gap with a loop of measured silence from an existing clip. Uses the chosen clip's longest stored silence, or auto-picks the longest measured silence in the project, and places it on the ambience track at -30 dB with 60 ms fades.",
      parameters: {
        type: "object",
        properties: {
          from_seconds: { type: "number", minimum: 0 },
          to_seconds: { type: "number", minimum: 0 },
          source_element_id: { type: "string", minLength: 1 },
          gain_db: { type: "number", minimum: -60, maximum: 12 },
        },
        required: ["from_seconds", "to_seconds"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "generate_music",
      description:
        "Generate an original background music track only after search_music_library returned no suitable rights-cleared match, or when the user explicitly asks for original/generated music.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "Mood/genre/energy of the track",
          },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "generate_sound_effect",
      description:
        "Generate a sound effect from a text description with an AI model and add it to the timeline.",
      parameters: {
        type: "object",
        properties: { prompt: { type: "string" } },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_format",
      description:
        "Set the project's aspect ratio / canvas. Use for 'make it vertical/9:16', 'square', 'widescreen'.",
      parameters: {
        type: "object",
        properties: {
          aspect: { type: "string", enum: ["9:16", "16:9", "1:1", "4:5"] },
        },
        required: ["aspect"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "remove_background",
      description:
        "AI-remove the background of an image clip (cut-out). Omit element_id to use the selected clip.",
      parameters: {
        type: "object",
        properties: { element_id: { type: "string" } },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "upscale_clip",
      description:
        "AI-upscale an image clip to higher resolution. Omit element_id to use the selected clip.",
      parameters: {
        type: "object",
        properties: { element_id: { type: "string" } },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "polish_quality",
      description:
        "Run the automatic technical/editorial quality pass (safe-area, loudness, ducking, look, ken-burns). It can clear objective defects but cannot certify subjective publishability. Use for 'polish' or 'fix the quality'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_captions",
      description:
        "Transcribe a video or voice clip and add editable, phrase-level synced subtitles on a real caption track. Use for 'add subtitles' or 'add captions'. Omit element_id to use the selected or currently playing clip.",
      parameters: {
        type: "object",
        properties: {
          element_id: { type: "string" },
          max_words_per_caption: { type: "integer", minimum: 2, maximum: 7, description: "Maximum words visible at once; default 5." },
          font_size: { type: "number", minimum: 24, maximum: 96, description: "Caption font size in pixels; default 48." },
          position: { type: "string", enum: ["lower-middle", "lower-third"], description: "Safe vertical caption placement; default lower-middle." },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "clean_audio",
      description:
        "Clean up spoken audio by removing dead air, filler words, or repeated sentences (transcript-driven). Use for 'remove the silences', 'quita las muletillas', 'cut the repetitions'.",
      parameters: {
        type: "object",
        properties: {
          what: {
            type: "string",
            enum: ["silences", "fillers", "repetitions"],
          },
          element_id: { type: "string" },
        },
        required: ["what"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "dub",
      description:
        "Dub or translate a clip's spoken audio into another language (transcribe → translate → re-voice). Use for requests such as 'dub into English'.",
      parameters: {
        type: "object",
        properties: {
          language: {
            type: "string",
            description:
              "Target language name or ISO code, e.g. 'English' / 'en'.",
          },
          element_id: { type: "string" },
        },
        required: ["language"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "generate_background",
      description:
        "Place a background on a new lowest track behind everything. For a SOLID/PLAIN color background ('fondo blanco', 'black background') pass ONLY `color` (name or hex) — it is rendered locally, instantly and free, never through a provider. Pass `prompt` only for a real scene ('add a beach background', 'pon un fondo de estudio oscuro').",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          color: {
            type: "string",
            description:
              "solid color name or hex — use INSTEAD of prompt for plain backgrounds",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "use_web_image",
      description:
        "Import a REAL image from the web (a brand's actual logo, product shot, or hero image surfaced by research) and place it on the timeline — instead of generating a look-alike. Prefer this for a company's logo and any real product/brand imagery. Use the exact URLs from the researched brand assets. Prefer .png/.jpg/.webp; do NOT pass .svg. role='logo' places it small in a safe corner as a branding overlay; role='shot' places it full-frame as a scene.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description:
              "Direct URL of the raster image (from the researched brand assets).",
          },
          role: {
            type: "string",
            enum: ["logo", "shot"],
            description: "logo = small corner overlay; shot = full-frame clip.",
          },
          at_seconds: {
            type: "number",
            description:
              "Where on the timeline to place it (seconds). Defaults to the playhead.",
          },
        },
        required: ["url", "role"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "lip_sync",
      description:
        "Lip-sync a talking video to a voice/dialogue track so the mouth matches the audio. Omit element_id to use the selected video.",
      parameters: {
        type: "object",
        properties: { element_id: { type: "string" } },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "adjust_color",
      description:
        "Colour-correct the composite: brightness, contrast and/or saturation (a real grade in the render, distinct from the color.look presets). Use for 'make it brighter/darker', 'more/less saturated', 'punch up the contrast'. Only pass the values the user asked for.",
      parameters: {
        type: "object",
        properties: {
          element_id: {
            type: "string",
            description:
              "Any visual clip to carry the grade; the adjustment applies to the whole composite.",
          },
          brightness: {
            type: "number",
            minimum: -1,
            maximum: 1,
            description: "-1 dark … 0 neutral … 1 bright",
          },
          contrast: {
            type: "number",
            minimum: 0.5,
            maximum: 2,
            description: "1 = neutral, >1 more contrast",
          },
          saturation: {
            type: "number",
            minimum: 0,
            maximum: 2,
            description: "1 = neutral, 0 = grayscale, >1 more saturated",
          },
        },
        required: ["element_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "duplicate_clip",
      description:
        "Duplicate a clip — an identical copy placed right after it on the same track, keeping its effects and keyframes. Use for 'duplicate this', 'haz una copia del clip'.",
      parameters: {
        type: "object",
        properties: { element_id: { type: "string" } },
        required: ["element_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "reframe_subject",
      description:
        "Reframe a VIDEO clip to a new aspect ratio while tracking a subject so it stays in frame (a measured crop, not a blind centre crop). Use for 'make it vertical keeping the person centred', 'reencuadra a 9:16 siguiendo al sujeto'. For a plain aspect change with no subject, use set_format instead.",
      parameters: {
        type: "object",
        properties: {
          aspect: {
            type: "string",
            enum: ["vertical", "square", "landscape"],
            description: "vertical = 9:16, square = 1:1, landscape = 16:9",
          },
          subject: {
            type: "string",
            description: "What to keep in frame, e.g. 'the person', 'the car'.",
          },
          element_id: {
            type: "string",
            description: "The video clip; omit to use the selected clip.",
          },
        },
        required: ["aspect"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "export_video",
      description:
        "Render and export the project to an MP4, including delivery preparation and QC. Use for 'export', 'render the video', or 'download the MP4'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "animate_motion",
      description:
        "Animate a visual clip over time with a keyframe motion preset — free, no model. Use this (not set_property) whenever the user wants movement: a 360° spin, Ken Burns drift, zoom in/out, a punch, camera shake, a slide-in, or a fade in/out. Duration defaults to the clip's own length.",
      parameters: {
        type: "object",
        properties: {
          element_id: {
            type: "string",
            description: "Target visual clip id (image or video)",
          },
          preset: {
            type: "string",
            enum: [
              "ken-burns",
              "zoom-in",
              "zoom-out",
              "punch",
              "shake",
              "fade-in",
              "fade-out",
              "fade",
              "slide-in",
              "spin",
            ],
          },
          duration_seconds: {
            type: "number",
            minimum: 0.3,
            description:
              "How long the motion runs; defaults to the clip duration",
          },
        },
        required: ["element_id", "preset"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_audio_levels",
      description:
        "Adjust a clip's audio: volume (gain in dB — 0 = unchanged, -6 ≈ half as loud), fade-in, fade-out, or mute. Only pass the properties requested by the user.",
      parameters: {
        type: "object",
        properties: {
          element_id: {
            type: "string",
            description: "The audio or video clip to adjust.",
          },
          gain_db: {
            type: "number",
            minimum: -60,
            maximum: 12,
            description: "Volume change in dB. 0 = unchanged.",
          },
          fade_in_seconds: {
            type: "number",
            minimum: 0,
            maximum: 30,
            description:
              "Fade the audio up over this many seconds from the clip start.",
          },
          fade_out_seconds: {
            type: "number",
            minimum: 0,
            maximum: 30,
            description:
              "Fade the audio down over this many seconds to the clip end.",
          },
          mute: {
            type: "boolean",
            description: "true to silence the clip, false to unmute.",
          },
        },
        required: ["element_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "edit_title",
      description:
        "Change an existing text or title clip: words, colour, size, on-screen position, or rotation. To add a new title, use add_title instead.",
      parameters: {
        type: "object",
        properties: {
          element_id: {
            type: "string",
            description: "The text/title clip to edit.",
          },
          text: { type: "string", description: "New text content." },
          color: { type: "string", description: "Hex colour like #ffcc00." },
          font_size: {
            type: "number",
            minimum: 8,
            maximum: 400,
            description: "Font size in px.",
          },
          position: {
            type: "array",
            items: { type: "number" },
            description:
              "[x, y] normalized 0..1 on the canvas (0.5,0.5 = centre; y increases downward).",
          },
          rotation: {
            type: "number",
            minimum: -180,
            maximum: 180,
            description: "Rotation in degrees.",
          },
        },
        required: ["element_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_overlay",
      description:
        "Overlay an existing image asset (a logo, watermark or picture-in-picture) on top of the video in a chosen corner. Use for 'pon mi logo en la esquina', 'add a watermark'. The image must already be an asset in the project — see the assets list in the snapshot.",
      parameters: {
        type: "object",
        properties: {
          asset_id: {
            type: "string",
            description:
              "The image asset id to overlay (from the assets list).",
          },
          corner: {
            type: "string",
            enum: ["tl", "tr", "bl", "br"],
            description:
              "Corner: top-left, top-right, bottom-left, bottom-right. Default tr.",
          },
          scale: {
            type: "number",
            minimum: 0.03,
            maximum: 1,
            description:
              "Size as a fraction of the canvas width. Default 0.14.",
          },
        },
        required: ["asset_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "replace_clip_media",
      description:
        "Replace the source media behind ONE clip with a different existing asset, keeping its place and length on the timeline. Use for 'reemplaza este clip por X', 'cambia el vídeo de este clip'. Both the clip and the replacement asset must exist in the snapshot.",
      parameters: {
        type: "object",
        properties: {
          element_id: {
            type: "string",
            description: "The clip whose media to replace.",
          },
          asset_id: {
            type: "string",
            description: "The replacement asset id (from the assets list).",
          },
        },
        required: ["element_id", "asset_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "freeze_frame",
      description:
        "Freeze a video frame without replacing the preceding clip. By default it splits at the clip's final frame; at_timeline_seconds pauses on an explicit frame.",
      parameters: {
        type: "object",
        properties: {
          element_id: {
            type: "string",
            description: "The video clip to freeze.",
          },
          hold_seconds: {
            type: "number",
            minimum: 0.2,
            maximum: 30,
            description:
              "How long to hold the frozen frame; defaults to the clip's current length.",
          },
          at_timeline_seconds: {
            type: "number",
            minimum: 0,
            description: "Optional absolute timeline position to freeze. Defaults to the final frame of the clip.",
          },
        },
        required: ["element_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_air",
      description:
        "Add 0.1–2 seconds of breathing room at an exact cut and ripple the later timeline. Auto uses speech-safe source handles first, then an outgoing-frame freeze, then measured room tone.",
      parameters: {
        type: "object",
        properties: {
          at_cut_seconds: { type: "number", minimum: 0 },
          seconds: { type: "number", minimum: 0.1, maximum: 2 },
          mode: {
            type: "string",
            enum: ["auto", "extend", "freeze", "room-tone"],
            default: "auto",
          },
        },
        required: ["at_cut_seconds", "seconds"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "hold_last_frame",
      description:
        "Split a video's final frame into an editable frozen tail, hold it for an exact duration, and optionally fade picture and audio. Compiles as one transaction.",
      parameters: {
        type: "object",
        properties: {
          element_id: { type: "string", description: "Video clip whose final frame should hold." },
          hold_seconds: { type: "number", minimum: 0.2, maximum: 30 },
          fade_out_seconds: { type: "number", minimum: 0, maximum: 30 },
          audio_fade_out_seconds: { type: "number", minimum: 0, maximum: 30 },
        },
        required: ["element_id", "hold_seconds"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "punch_in",
      description:
        "Author a slow digital push with scale and anchor-aware position keyframes. Sources at 1080p or below are limited to 1.35×.",
      parameters: {
        type: "object",
        properties: {
          element_id: { type: "string" },
          factor: { type: "number", minimum: 1.05, maximum: 1.5 },
          at_timeline_seconds: { type: "number", minimum: 0 },
          duration_seconds: { type: "number", exclusiveMinimum: 0 },
          anchor: {
            type: "array",
            items: { type: "number", minimum: 0, maximum: 1 },
            minItems: 2,
            maxItems: 2,
            default: [0.5, 0.4],
          },
          ease: { type: "string", enum: ["in", "out", "inOut"], default: "inOut" },
          snap: {
            type: "string",
            enum: ["shot"],
            description: "Clamp the motion window to one measured source shot. Applied by default when shot-change evidence exists.",
          },
        },
        required: ["element_id", "factor", "at_timeline_seconds", "duration_seconds"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_graphic",
      description:
        "Expand a named data template into editable text/image elements sharing one group id. Fonts resolve automatically from the template's family preferences and project font assets; explicit font asset overrides remain optional.",
      parameters: {
        type: "object",
        properties: {
          template: {
            type: "string",
            enum: [...GRAPHIC_TEMPLATE_IDS],
          },
          at_seconds: { type: "number", minimum: 0, description: "Absolute timeline position in seconds. Public name: atSeconds; legacy at remains accepted." },
          duration_seconds: { type: "number", minimum: 0.5, maximum: 120 },
          snap: {
            type: "string",
            enum: ["shot"],
            description: "Clamp the graphic window to one measured underlying shot. Applied by default when shot-change evidence exists.",
          },
          slots: {
            type: "object",
            description: "Template copy plus optional project asset overrides. Fonts auto-resolve by family; use camelCase nameFontAssetId/roleFontAssetId/fontAssetId to override. Legacy snake_case aliases remain accepted.",
            properties: {
              name: { type: "string" },
              role: { type: "string" },
              title: { type: "string" },
              subtitle: { type: "string" },
              line: { type: "string" },
              url: { type: "string" },
              place: { type: "string" },
              date: { type: "string" },
              nameFontAssetId: { type: "string" },
              roleFontAssetId: { type: "string" },
              fontAssetId: { type: "string" },
              logoAssetId: { type: "string" },
              name_font_asset_id: { type: "string" },
              role_font_asset_id: { type: "string" },
              font_asset_id: { type: "string" },
              logo_asset_id: { type: "string" },
            },
            additionalProperties: false,
          },
        },
        required: ["template", "at_seconds", "slots"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "remove_graphic",
      description: "Delete every editable element carrying the supplied graphic group id as one transaction.",
      parameters: {
        type: "object",
        properties: { group_id: { type: "string" } },
        required: ["group_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "reverse_clip",
      description:
        "Play a video clip backwards with both video and audio reversed. Supported on clips up to 20 seconds.",
      parameters: {
        type: "object",
        properties: {
          element_id: {
            type: "string",
            description: "The video clip to reverse.",
          },
        },
        required: ["element_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "reconstruct_video",
      description:
        "Analyze one flattened source video and rebuild measured scene and graphic-card boundaries as editable, source-linked clips on an empty timeline. Attelier approximates fade-to-black, dip-to-black, black-plate and graphic-reveal phases from decoded luma, including duration, hold, curve and confidence metadata; these remain inferred evidence rather than recovered native source parameters. This preserves the embedded source audio but does not claim to recover original assets, burned-in text layers or separate stems. Use when the user asks to reverse-engineer, deconstruct or rebuild a finished video in the editor.",
      parameters: {
        type: "object",
        properties: {
          asset_id: {
            type: "string",
            description:
              "Video asset id. Omit only when there is exactly one obvious video source in Project Media.",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_stock",
      description:
        "Search REAL stock footage/photos for realistic generic b-roll (people, streets, nature, food, workplaces). Prefer this over generate_video/generate_image for anything a stock library carries — real footage looks better and costs nothing. It does NOT place anything: the result lists up to 4 candidates (index, title, dimensions, duration). READ them, pick the best fit, and call place_stock with its index. If none fits, search again with a different query or generate. Falls back to generation only when the library returns nothing.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "English stock-search query, 3-6 concrete words, e.g. 'runner city sunrise slow motion'.",
          },
          duration_seconds: {
            type: "number",
            minimum: 0.5,
            description:
              "Target clip length in seconds (used to judge candidate coverage and for the generation fallback).",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "place_stock",
      description:
        "Download and place ONE candidate from the most recent search_stock results onto the timeline. Choose the candidate whose title/dimensions best match the requested subject; avoid candidates whose titles suggest visible text, signs, letters, watermarks or brand logos.",
      parameters: {
        type: "object",
        properties: {
          index: {
            type: "integer",
            minimum: 0,
            maximum: 3,
            description:
              "Index of the chosen candidate from the search_stock result list.",
          },
          query: {
            type: "string",
            description:
              "The query of the search whose candidate you are placing; defaults to the most recent search.",
          },
          at_seconds: {
            type: "number",
            minimum: 0,
            description: "Where to place the clip; defaults to the playhead.",
          },
          duration_seconds: {
            type: "number",
            minimum: 0.5,
            description: "Target clip length in seconds.",
          },
        },
        required: ["index"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "critique_project",
      description:
        "Convene the review panel: LLM judges inspect the current cut against the brief and craft rules, plus deterministic sequence checks that return measured, actionable fixes. Use for 'how does it look' or 'review this', and always after assembling a multi-shot montage.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "remember_ingredient",
      description:
        "Save a reusable element to the project's visual universe so future shots stay consistent — a character, product, location or style, with its defining description and optionally a reference asset. Use when the user introduces something recurring ('the hero is a coral running shoe', 'keep this look', 'the spokesperson is Ana') or after generating a hero asset worth reusing. These are shown back to you in the snapshot's 'universe' section.",
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["character", "product", "location", "style"],
          },
          name: {
            type: "string",
            description: "Short name, e.g. 'Coral runner', 'Ana', 'Attelier look'.",
          },
          description: {
            type: "string",
            description:
              "The reusable creative description / prompt fragment that defines it.",
          },
          asset_id: {
            type: "string",
            description:
              "Optional reference asset id (a hero/reference image already in the project).",
          },
        },
        required: ["kind", "name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_brief",
      description:
        "Save explicit creator direction. Read inspect_project first and send expectedRevision and expectedPlanVersion=plan.version. Patch only agreed fields. brief is a complete structured brief: retain unrelated accepted decisions and mark superseded choices rejected. Suggestions are not accepted decisions; timeline facts remain in the timeline. On conflict re-read before retrying.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          expectedRevision: { type: "integer", minimum: 0 },
          expectedPlanVersion: { type: "integer", minimum: 0 },
          brief: PROJECT_BRIEF_SCHEMA,
          logline: { type: "string" },
          audience: { type: "string" },
          channel: {
            type: "string",
            description: "e.g. Instagram, TikTok, YouTube.",
          },
          tone: { type: "string" },
          cta: { type: "string" },
          script: {
            type: "string",
            description: "The editable working script or voiceover, if the user supplied one.",
          },
          beats: {
            type: "array",
            maxItems: 24,
            description: "Ordered lightweight video beats or milestones. Keep these concrete and brief.",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                description: { type: "string" },
                milestone: { type: "string" },
                visual: { type: "string" },
                purpose: { type: "string" },
                duration_seconds: { type: "number", minimum: 0 },
                asset_plan: { type: "string" },
              },
              required: ["title"],
            },
          },
        },
        required: ["expectedRevision", "expectedPlanVersion"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "request_creative_decision",
      description:
        "Pause the durable creative run and ask the creator to compare 2–4 concrete options. Use only for a genuinely subjective, high-impact choice with material uncertainty (for example concept, script hook, voice, music, hero visual or rough cut), especially before paid or expensive-to-reverse work. Do not use for objective defects, low-impact details or choices you can safely make yourself. Attelier records A/B/neither/use-your-judgment as contextual preference data and resumes after the answer.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { type: "string", enum: ["concept", "script", "voice", "music", "visual", "generated_shot", "rough_cut"] },
          question: { type: "string", minLength: 1, maxLength: 500 },
          context: { type: "string", minLength: 1, maxLength: 1200 },
          candidates: {
            type: "array", minItems: 2, maxItems: 4,
            items: {
              type: "object", additionalProperties: false, required: ["id", "label", "description", "preview"],
              properties: {
                id: { type: "string", minLength: 1, maxLength: 80 },
                label: { type: "string", minLength: 1, maxLength: 120 },
                description: { type: "string", minLength: 1, maxLength: 600 },
                rationale: { type: "string", maxLength: 600 },
                preview: {
                  type: "object", additionalProperties: false, required: ["kind"],
                  properties: {
                    kind: { type: "string", enum: ["text", "image", "video", "audio"] },
                    text: { type: "string", maxLength: 3000 },
                    url: { type: "string", maxLength: 2000 },
                    asset_id: { type: "string", maxLength: 200 },
                  },
                },
              },
            },
          },
          impact: { type: "string", enum: ["medium", "high"] },
          uncertainty: { type: "number", minimum: 0.3, maximum: 1 },
          reversibility: { type: "string", enum: ["easy", "moderate", "expensive"] },
          estimated_cost_usd: { type: "number", minimum: 0 },
          reason: { type: "string", minLength: 1, maxLength: 600 },
          allow_agent_judgment: { type: "boolean" },
          resume_state: { type: "string", enum: ["drafting", "generating", "editing", "reviewing"] },
        },
        required: ["kind", "question", "context", "candidates", "impact", "uncertainty", "reversibility", "reason", "allow_agent_judgment", "resume_state"],
      },
    },
  },
] as const;

const AD_EDITOR_TOOL_NAMES = new Set([
  "crop_product_proof",
  "generate_image",
  "generate_video",
  "animate_clip",
  "generate_voiceover",
  "generate_music",
  "generate_sound_effect",
  "polish_quality",
  "generate_background",
  "use_web_image",
  "lip_sync",
]);

const DOCUMENTARY_EDITOR_TOOL_NAMES = new Set(["create_multicam_cut"]);
const SHORTS_EDITOR_TOOL_NAMES = new Set(["reframe_subject"]);

const editorProfilesFor = (name: string): readonly AtteCatalogProfile[] => {
  if (AD_EDITOR_TOOL_NAMES.has(name)) return ["ad"];
  if (DOCUMENTARY_EDITOR_TOOL_NAMES.has(name)) return ["documentary"];
  if (SHORTS_EDITOR_TOOL_NAMES.has(name)) return ["ad", "shorts"];
  return ["shared"];
};

const ATTELIER_ALL_EDITOR_OPENAI_TOOLS: readonly AttelierOpenAiFunctionTool[] =
  RAW_ATTELIER_ALL_EDITOR_OPENAI_TOOLS.map((entry) => ({
    ...entry,
    profiles: editorProfilesFor(entry.function.name),
  }));

/**
 * Recipes accepted inside compile_edit but intentionally not exposed as
 * top-level single-turn Studio tools. Their transaction is prepared by the
 * compiler, then simulated and committed through the public boundary.
 */
const COMPILE_EDIT_ONLY_TOOL_NAMES = new Set([
  "hold_last_frame",
  "add_air",
  "punch_in",
  "add_graphic",
  "remove_graphic",
  "fill_room_tone",
]);

export const ATTELIER_COMPILE_EDIT_OPENAI_TOOLS: readonly AttelierOpenAiFunctionTool[] =
  ATTELIER_ALL_EDITOR_OPENAI_TOOLS.filter(({ function: definition }) =>
    COMPILE_EDIT_ONLY_TOOL_NAMES.has(definition.name));

export const ATTELIER_EDITOR_OPENAI_TOOLS = ATTELIER_ALL_EDITOR_OPENAI_TOOLS.filter(
  ({ function: definition }) => !COMPILE_EDIT_ONLY_TOOL_NAMES.has(definition.name),
);

/**
 * Tools that trigger real work (AI generation, format, quality pass) rather than
 * a deterministic timeline operation. The client dispatches these to the
 * capability handlers; mapToolCalls ignores them.
 */
export const ATTELIER_ACTION_TOOL_NAMES = new Set([
  "generate_image",
  "generate_video",
  "animate_clip",
  "generate_voiceover",
  "search_music_library",
  "generate_music",
  "generate_sound_effect",
  "set_format",
  "remove_background",
  "upscale_clip",
  "polish_quality",
  "add_captions",
  "clean_audio",
  "dub",
  "generate_background",
  "use_web_image",
  "lip_sync",
  "reframe_subject",
  "export_video",
  "search_stock",
  "place_stock",
  "critique_project",
  "remember_ingredient",
  "set_brief",
  "request_creative_decision",
  "reconstruct_video",
]);

/**
 * The tool subset the /generate hub's assistant exposes: pure media generation,
 * no timeline/project editing. Same definitions as the full studio set — the
 * two assistants are one planner with different tools.
 */
const GENERATE_TOOL_NAMES = new Set([
  "generate_image",
  "generate_video",
  "generate_voiceover",
  "generate_music",
  "generate_sound_effect",
  "use_web_image",
]);
/**
 * The editor tools `compileProjectToolCalls` turns into canonical project
 * operations: every catalog tool that is NOT an action tool. Action tools
 * (generation, format, polish, brief) are dispatched client-side and compile
 * to no timeline operation, so a transaction-producing caller must refuse them
 * rather than return an empty transaction.
 *
 * Derived from the catalog itself so it cannot drift from the compiler; the
 * compiler's own test asserts the two sets are equal.
 */
export const ATTELIER_DETERMINISTIC_TOOL_NAMES: ReadonlySet<string> = Object.freeze(
  new Set(
    ["assemble_first_cut", ...[...ATTELIER_EDITOR_OPENAI_TOOLS, ...ATTELIER_COMPILE_EDIT_OPENAI_TOOLS]
      .map(({ function: fn }) => fn.name)
      .filter((name) => !ATTELIER_ACTION_TOOL_NAMES.has(name))],
  ),
) as ReadonlySet<string>;

export const ATTELIER_GENERATE_OPENAI_TOOLS = ATTELIER_EDITOR_OPENAI_TOOLS.filter((tool) =>
  GENERATE_TOOL_NAMES.has(tool.function.name),
);

const tool = (
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[] = [],
  profiles: readonly AtteCatalogProfile[] = ["shared"],
): AttelierOpenAiFunctionTool => ({
  type: "function",
  profiles,
  function: {
    name,
    description,
    parameters: {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    },
  },
});

export const ATTELIER_ASSET_IMAGE_OPENAI_TOOLS = [
  tool("remove_background", "Remove the image background, leaving the subject on transparency.", {}),
  tool("upscale", "Upscale the image 2x with detail enhancement.", {}),
  tool("image_to_image", "Transform the image with a text prompt (style change, variation, add/replace content).", {
    prompt: { type: "string", description: "How to transform the image, in English, vivid and concrete." },
  }, ["prompt"]),
  tool("adjust_color", "Adjust brightness / contrast / saturation. 100 means unchanged; range 40–180.", {
    brightness: { type: "number", description: "Percent, 100 = unchanged." },
    contrast: { type: "number", description: "Percent, 100 = unchanged." },
    saturation: { type: "number", description: "Percent, 100 = unchanged. 0 would be grayscale but minimum is 40." },
  }),
  tool("crop", "Center-crop the image to an aspect ratio.", {
    aspect: { type: "string", enum: ["1:1", "4:5", "9:16", "16:9"], description: "Target aspect ratio." },
  }, ["aspect"]),
] as const;

export const ATTELIER_ASSET_AUDIO_OPENAI_TOOLS = [
  tool("trim", "Keep only the window between start_seconds and end_seconds.", {
    start_seconds: { type: "number", description: "Window start, seconds from 0." },
    end_seconds: { type: "number", description: "Window end, seconds." },
  }, ["start_seconds", "end_seconds"]),
  tool("gain", "Apply gain in dB (-12 to +12).", {
    db: { type: "number", description: "Gain in decibels; negative attenuates." },
  }, ["db"]),
  tool("normalize", "Normalize the peak level to -1 dBFS.", {}),
  tool("fades", "Apply linear fade in and/or fade out, in seconds.", {
    fade_in_seconds: { type: "number", description: "Fade-in length, 0 for none." },
    fade_out_seconds: { type: "number", description: "Fade-out length, 0 for none." },
  }),
  tool("regenerate_voice", "Re-synthesize the narration with new text (voice generation).", {
    text: { type: "string", description: "What the narrator should say." },
  }, ["text"]),
] as const;

export const ATTELIER_CREATIVE_BRIEF_OPENAI_TOOLS = [
  tool(
    "submit_creative_brief",
    "Submit only the discovery fields needed to start a versioned Creative Brief workflow.",
    {
      objective: { type: "string" },
      audience: { type: "string" },
      cta: { type: "string" },
      channel: { type: "string" },
      aspectRatio: { type: "string", enum: ["9:16", "16:9", "1:1", "4:5"] },
      durationSeconds: { type: "number", minimum: 6, maximum: 24 },
      language: { type: "string" },
      voice: { type: "string" },
      tone: { type: "string" },
      visualDirection: { type: "string" },
      musicDirection: { type: "string" },
    },
    [
      "objective",
      "audience",
      "cta",
      "channel",
      "aspectRatio",
      "durationSeconds",
      "language",
      "voice",
      "tone",
      "visualDirection",
      "musicDirection",
    ],
  ),
] as const;

/**
 * The tools the server-side agentic loop executes for the model.
 *
 * The studio editor set is deliberately mutation-shaped: it says how to change
 * a timeline, not how to find out what is on it. A loop that can only mutate
 * guesses. These are the read, review and recipe instruments the loop runs
 * itself — every one of them already exists on the Attelier MCP surface, so
 * this declaration adds a caller, not a capability.
 */
export const ATTELIER_LOOP_OPENAI_TOOLS = [
  tool("describe_edit_tools", "Read the exact argument schemas for up to three deterministic edit tools before including them in compile_edit. Use this when a batch tool's arguments are not in your current tool list. This is documentation only; it never changes the project.", { names: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" } } }, ["names"]),
  tool("compile_edit", "Prepare one coherent batch of deterministic timeline edits as a single reviewable proposal. Use this for more than four edits or a complete repair. Every call runs against the preceding draft; all changes are simulated and applied together. Library asset references are imported in this same proposal. Do not include generation, set_brief or remember_ingredient here.", {
    calls: { type: "array", minItems: 1, maxItems: 200, items: { type: "object", additionalProperties: false,
      properties: { tool: { type: "string", enum: [...ATTELIER_DETERMINISTIC_TOOL_NAMES] }, arguments: { type: "object" } }, required: ["tool", "arguments"] } },
  }, ["calls"]),
  tool("assemble_first_cut", "Assemble the complete supplied-media first cut in one revision-pinned compile_edit transaction. Pass every approved Timeline | Source | Beat row at once; clip/source strings such as 'clip 4 · 0.0–23.05' and timeline ranges such as '0.00–23.05' are parsed directly. The compiler resolves project assets, places every source range, fits authored transitions to speech and shots, adds explicit graphics, and can hold/fade the last frame. Use this as the first editing mutation for a brief-driven assembly; never place one row per round.", {
    rows: {
      type: "array", minItems: 1, maxItems: 200,
      items: {
        type: "object", additionalProperties: false,
        properties: {
          clip: { type: "string", minLength: 1, description: "Clip label or a Source cell such as 'clip 4 · 0.0–23.05'. Use either clip/source or assetId." },
          assetId: { type: "string", minLength: 1, description: "Exact project asset id. Use either assetId or clip/source." },
          source: { type: "string", minLength: 1, description: "Verbatim Source table cell; alias for clip." },
          timeline: { type: "string", minLength: 1, description: "Verbatim Timeline table cell such as '22.65–30.70'." },
          sourceStartSeconds: { type: "number", minimum: 0 },
          sourceEndSeconds: { type: "number", exclusiveMinimum: 0 },
          timelineStartSeconds: { type: "number", minimum: 0 },
          beat: { type: "string", maxLength: 4000 },
        },
      },
    },
    transitions: { type: "string", enum: ["fit-speech", "none"], default: "fit-speech", description: "fit-speech parses explicit dissolve/dip/cut directions from each Beat; otherwise it uses a 0.4s cross-dissolve. Every authored transition uses fit=speech and snap=shot." },
    graphics: {
      type: "array", maxItems: 100,
      items: {
        type: "object", additionalProperties: false, required: ["atSeconds", "durationSeconds", "slots"],
        properties: {
          template: { type: "string", enum: [...GRAPHIC_TEMPLATE_IDS], description: "Optional for title slots; assemble_first_cut defaults slots.title to title-card/documentary-01." },
          atSeconds: { type: "number", minimum: 0 },
          durationSeconds: { type: "number", minimum: 0.5, maximum: 120 },
          slots: { type: "object" },
        },
      },
    },
    holdLastFrameSeconds: { type: "number", minimum: 0.2, maximum: 30 },
    fadeOutSeconds: { type: "number", minimum: 0, maximum: 30 },
  }, ["rows"]),
  tool("inspect_project", "Read the canonical project snapshot: sequences, tracks, elements, assets, source ranges and the sequence frame rate, with human-readable seconds beside every tick value. Call this first when you need current structure.", {}),
  tool("search_workspace_assets", "Search the creator's Library, including saved Create generations and uploads outside this project. Returns exact version IDs, measured metadata and rights. Use the returned projectAssetId with place_asset, insert_source_range or assemble_first_cut: the Library version is imported in the same proposal. No generation or project change occurs during search.", {
    query: { type: "string", maxLength: 500, description: "Words in the asset name or provenance. Omit to browse recent media." },
    kind: { type: "string", enum: ["image", "video", "audio", "font"] },
    limit: { type: "integer", minimum: 1, maximum: 50, description: "Maximum results, default 12." },
  }),
  tool("get_project_plan", "Read the project's versioned creative plan: brief, profile, script and beats.", {}),
  tool("get_transcript", "Read the stored transcript of one project asset. Returns spoken segments as [startSeconds, endSeconds, text] by default; ask for words:true or a startSeconds/endSeconds window when you need word-level boundaries.", {
    assetId: { type: "string", description: "The asset id from the snapshot." },
    words: { type: "boolean", description: "Return word-level timings as well as segments. Costs roughly ten times the context, so ask only when a boundary verdict needs it." },
    startSeconds: { type: "number", description: "Optional source-time window start. Implies word-level timings for that window only." },
    endSeconds: { type: "number", description: "Optional source-time window end." },
  }, ["assetId"]),
  tool("search_transcript", "Find where a phrase is spoken in one asset's transcript, with word-level timings.", {
    assetId: { type: "string", description: "The asset id from the snapshot." },
    query: { type: "string", description: "The words to find." },
    elementId: { type: "string", description: "Optional: restrict to the source range of one timeline element." },
  }, ["assetId", "query"]),
  tool("get_audio_analysis", "Read the stored loudness and peak analysis of one project asset (integrated LUFS, true peak, silences). Returns null when the asset has never been analyzed.", {
    assetId: { type: "string", description: "The asset id from the snapshot." },
  }, ["assetId"]),
  tool("get_asset_description", "Read the stored visual reading of one clip. Free, and returns null when nothing has been stored yet.", {
    assetId: { type: "string", description: "The asset id from the snapshot." },
  }, ["assetId"]),
  tool("analyze_audio", "Measure source audio levels, peaks and silences locally when get_audio_analysis returned null. No model charge and no timeline edits; measurements are saved for later reviews. This does not transcribe speech or listen to musical quality.", {
    assetId: { type: "string", description: "An audio or video asset already saved in this project." },
  }, ["assetId"]),
  tool("describe_asset", "Pay once to read a clip that has no stored description: samples a contact sheet and stores the reading for every later call. Use only after get_asset_description returned null.", {
    assetId: { type: "string", description: "The asset id from the snapshot." },
  }, ["assetId"]),
  tool("analyze_postproduction", "Start or inspect an independent background diagnosis for a 15–180 second video. Persists shots, scene understanding, speech transcription, automatic audio quality with measurements and listening, evidence references and up to five contextual priorities. Human listening is not required. Returns immediately with job status; use action status later, never poll in a chat loop. No editing or media generation. Changing the brief reuses valid source evidence. Project/account limits and a separate analysis cap apply; failed work needs explicit retry.", {
    assetId: { type: "string" }, action: { type: "string", enum: ["start", "status", "cancel"] },
    maxCostUsd: { type: "number", minimum: 0, maximum: 20, description: "Separate cumulative analysis limit, default $2; does not increase conversation or project budgets." },
    technicalOnly: { type: "boolean" }, retryFailed: { type: "boolean", description: "Explicit retry; completed evidence and cumulative job spend are retained." },
    inspection: SOURCE_INSPECTION_SCHEMA,
  }, ["assetId"]),
  tool("editorial_plan", "Read or propose an editorial direction for creator acceptance. Saves one ordinary reversible edit proposal for Studio and external clients. Propose concrete changes with reasons, expected result, cost and known review gaps; never claims they are already applied. expectedVersion comes from inspect_project.editorialVersion, including when the earlier direction is superseded.", {
    action: { type: "string", enum: ["get", "propose"] }, expectedVersion: { type: "integer" }, expectedRevision: { type: "integer" },
    idempotencyKey: { type: "string" }, direction: { type: "string" }, rationale: { type: "string" }, expectedResult: { type: "string" }, diagnosis: { type: "string" },
    estimatedCostUsd: { type: "number" }, evidenceIds: { type: "array", items: { type: "string" } }, pendingReview: { type: "array", items: { type: "string" } },
    calls: { type: "array", items: { type: "object", properties: { tool: { type: "string" }, arguments: { type: "object", additionalProperties: true } }, required: ["tool", "arguments"], additionalProperties: false } },
  }, ["action"]),
  tool("review_cut", "Run the deterministic cut review over the timeline: mid-word in/out points, dialogue level jumps, gaps, timebase problems. This is evidence with timecodes, not a verdict — read it and decide yourself.", {
    startSeconds: { type: "number", description: "Optional window start in timeline seconds." },
    endSeconds: { type: "number", description: "Optional window end in timeline seconds." },
  }),
  tool("review_frames", "Pay to look at real rendered frames of the timeline as one contact sheet and report what is visible. Use when the request depends on appearance, not structure.", {
    atSeconds: { type: "array", description: "Timeline seconds to look at (at most 12).", items: { type: "number" } },
    everySeconds: { type: "number", description: "Alternative to atSeconds: sample the timeline at this interval." },
  }),
  tool("render_frame", "Render ONE frame of the timeline through the real export pipeline and return its url. This is the arbiter of what the export looks like; the preview is not.", {
    atSeconds: { type: "number", description: "Timeline second to render." },
    width: { type: "integer", description: "Optional pixel width, 320-1920." },
  }, ["atSeconds"]),
  tool("render_range", "Render a short interval of the timeline with sound and return its url. At most 30 seconds.", {
    startSeconds: { type: "number", description: "Timeline second to start at." },
    endSeconds: { type: "number", description: "Timeline second to end at." },
  }, ["startSeconds", "endSeconds"]),
  tool("list_project_versions", "List the project's named checkpoint versions and the current revision.", {}),
  tool("evaluate_project", "Run the deterministic quality evaluation for the project's delivery profile and return the gate results.", {}),
  tool("create_project_version", "Create a named checkpoint of the current revision before a multi-step change, so it can be restored.", {
    name: { type: "string", description: "What this checkpoint captures, in a few words." },
    note: { type: "string", description: "Optional longer note." },
  }, ["name"]),
  tool("trim_to_speech", "Recipe: move one element's in and out points to the nearest word boundaries in its transcript, keeping handles. Prefer this over hand-computed trim_clip for a mid-word cut.", {
    elementId: { type: "string", description: "The element whose boundaries land mid-word." },
    handleSeconds: { type: "number", description: "Handle to keep either side, default 0.12." },
  }, ["elementId"]),
  tool("snap_cut_to_words", "Recipe: move one shared cut between two clips to the nearest word boundaries on both sides.", {
    atSeconds: { type: "number", description: "The timeline second of the cut." },
    handleSeconds: { type: "number", description: "Handle to keep either side, default 0.12." },
  }, ["atSeconds"]),
  tool("level_dialogue", "Recipe: set per-clip gain so every dialogue clip lands on one loudness bed and add short cut fades. Prefer this over hand-computed set_audio_levels for a level jump.", {
    targetLufs: { type: "number", description: "Target integrated loudness per clip, default -18." },
    fadeSeconds: { type: "number", description: "Cut fade length, default 0.08." },
  }),
  tool("add_lower_third", "Recipe: build a documentary identification title as an exact property set.", {
    name: { type: "string", description: "The person or place being identified." },
    role: { type: "string", description: "Optional second line." },
    atSeconds: { type: "number", description: "Timeline second the title appears." },
    durationSeconds: { type: "number", description: "How long it stays, default 4." },
    preset: { type: "string", enum: ["documentary-rule", "documentary-box", "minimal"], description: "Typographic preset." },
  }, ["name", "atSeconds", "preset"], ["documentary"]),
  tool("reorder_clips", "Recipe: lay out the given elements on one track in this exact order, closing gaps.", {
    trackId: { type: "string", description: "The track to reorder." },
    elementIds: { type: "array", description: "Element ids in their new order.", items: { type: "string" } },
    gapSeconds: { type: "number", description: "Gap to leave between clips, default 0." },
  }, ["trackId", "elementIds"]),
  tool("set_project_profile", "Set the project's delivery quality profile, which chooses the gates an export is judged by.", {
    profile: { type: "string", description: "A quality profile id, for example documentary-v1 or social-video-v1." },
  }, ["profile"]),
] as const;

/**
 * The studio set plus the loop's own read, review and recipe instruments. This
 * is the profile the server-side agentic loop uses; `studio` stays exactly as
 * it is for the single-completion surfaces that still dispatch client-side.
 */
/**
 * The outside world, read-only. `web_search` costs a little (a hosted search
 * plus a small model summary, budgeted inside the turn); `fetch_url` is a
 * plain server-side read of one public page. Neither changes the project.
 */
export const ATTELIER_WEB_OPENAI_TOOLS = [
  tool("web_search", "Search the public web for facts the brief needs from the outside world: a brand, a product, a place, a person, a date, a current event, a competitor. Returns up to 5 results (title, url, snippet) and a short factual summary with the sources it came from. Costs a few cents per call and is budgeted inside this turn: search at most three times per turn, only when the answer is not in the project or the brief, never for creative choices.", {
    query: { type: "string", minLength: 2, maxLength: 300, description: "What to look up, as a search engine query." },
    maxResults: { type: "integer", minimum: 1, maximum: 5, description: "How many results to return (default 5)." },
  }, ["query"]),
  tool("fetch_url", "Read one public web page as plain text (scripts, styles and markup removed). Use it after web_search to read a source in full, or when the creator gives you a URL. Public http(s) pages only; private networks are refused. Free.", {
    url: { type: "string", minLength: 8, maxLength: 2048, description: "The absolute http(s) URL to read." },
    maxChars: { type: "integer", minimum: 500, maximum: 12000, description: "How much text to return (default 6000)." },
  }, ["url"]),
];

/**
 * The judge: the rendered cut, watched and listened to by a model against the
 * brief, returned as a verdict with timecoded findings. Paid; its result is
 * stored per revision so a second look at the same cut is free.
 */
export const ATTELIER_JUDGE_OPENAI_TOOLS = [
  tool("judge_cut", "Pay to have the CURRENT cut rendered and judged as a viewer would see it: real frames across the whole piece plus the final mixed audio and its transcript, against the brief. Returns a verdict (score 0–10, summary) and findings with timecodes, each tagged visual, audio, text, pacing or story, with a suggested fix. Use it when the cut is assembled and you need to know what is wrong before fixing; never on an empty timeline. One judgment per revision is kept: call get_cut_judgment first.", {
    focus: { type: "string", maxLength: 400, description: "What to pay special attention to, if anything (e.g. 'the captions', 'the ending')." },
  }),
  tool("get_cut_judgment", "Read the stored judgment of the current revision, or the latest one, without paying. Returns null when the cut has not been judged.", {
    revision: { type: "integer", minimum: 0, description: "A specific revision; defaults to the latest judgment." },
  }),
];

export const ATTELIER_STUDIO_AGENTIC_OPENAI_TOOLS: readonly AttelierOpenAiFunctionTool[] = [
  ...ATTELIER_LOOP_OPENAI_TOOLS,
  ...ATTELIER_WEB_OPENAI_TOOLS,
  ...ATTELIER_JUDGE_OPENAI_TOOLS,
  ...ATTELIER_EDITOR_OPENAI_TOOLS,
];

export const ATTELIER_TOOL_PROFILES: Readonly<Record<AttelierToolProfile, readonly AttelierOpenAiFunctionTool[]>> = {
  studio: ATTELIER_EDITOR_OPENAI_TOOLS,
  "studio-agentic": ATTELIER_STUDIO_AGENTIC_OPENAI_TOOLS,
  generate: ATTELIER_GENERATE_OPENAI_TOOLS,
  "asset-image": ATTELIER_ASSET_IMAGE_OPENAI_TOOLS,
  "asset-audio": ATTELIER_ASSET_AUDIO_OPENAI_TOOLS,
  "creative-brief": ATTELIER_CREATIVE_BRIEF_OPENAI_TOOLS,
};

/**
 * How the agentic loop treats a tool call.
 *
 * `read` is executed by whoever runs the loop and its result goes back to the
 * model. `mutation` is compiled and simulated into a proposal. `gated` is a
 * paid capability that keeps its quote/approval lifecycle and is handed to the
 * client untouched. One declaration so the API loop and the terminal loop
 * cannot disagree about what is safe to run unattended.
 */
export type AtteAgenticToolKind = "read" | "mutation" | "gated";

export const ATTE_LOOP_READ_TOOL_NAMES: ReadonlySet<string> = Object.freeze(new Set([
  ...[...PIPELINE_TOOLS, ...PIPELINE_JOB_TOOLS].map(t => t.name),
  "describe_edit_tools",
  "editorial_plan",
  "fetch_url",
  "get_cut_judgment",
  "inspect_project",
  "search_workspace_assets",
  "get_project_plan",
  "get_transcript",
  "search_transcript",
  "get_audio_analysis",
  "analyze_audio",
  "get_asset_description",
  "review_cut",
  "render_frame",
  "render_range",
  "list_project_versions",
  "evaluate_project",
])) as ReadonlySet<string>;

/** Bounded paid reads: one vision call each, metered against the turn cap. */
export const ATTE_LOOP_PAID_READ_TOOL_NAMES: ReadonlySet<string> = Object.freeze(
  new Set(["describe_asset", "analyze_postproduction", "review_frames", "web_search", "judge_cut"]),
) as ReadonlySet<string>;

export const ATTE_LOOP_RECIPE_TOOL_NAMES: ReadonlySet<string> = Object.freeze(new Set([
  "trim_to_speech",
  "snap_cut_to_words",
  "level_dialogue",
  "add_lower_third",
  "reorder_clips",
  "clear_timeline",
  "set_project_profile",
])) as ReadonlySet<string>;

export const ATTE_LOOP_CHECKPOINT_TOOL_NAME = "create_project_version";

export const atteAgenticToolKind = (name: string): AtteAgenticToolKind => {
  if (name === "set_brief" || name === "remember_ingredient") return "mutation";
  if (ATTE_LOOP_READ_TOOL_NAMES.has(name) || ATTE_LOOP_PAID_READ_TOOL_NAMES.has(name)) return "read";
  if (name === ATTE_LOOP_CHECKPOINT_TOOL_NAME || ATTE_LOOP_RECIPE_TOOL_NAMES.has(name)) return "mutation";
  if (name === "compile_edit" || ATTELIER_DETERMINISTIC_TOOL_NAMES.has(name)) return "mutation";
  return "gated";
};

export const attelierToolNamesForProfile = (profile: AttelierToolProfile): string[] =>
  ATTELIER_TOOL_PROFILES[profile].map(({ function: fn }) => fn.name);
