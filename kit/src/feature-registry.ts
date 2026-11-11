import { PIPELINE_TOOLS, PIPELINE_JOB_TOOLS } from "./pipeline-tools.js";
import {
  ATTELIER_ACTION_TOOL_NAMES,
  ATTELIER_EDITOR_OPENAI_TOOLS,
} from "@atte/kit/tool-catalog";

export const ATTELIER_FEATURE_REGISTRY_VERSION = "atelier.features.v1" as const;

export type AttelierFeatureFamily =
  | "edit"
  | "timeline"
  | "composition"
  | "motion"
  | "text"
  | "audio"
  | "color-vfx"
  | "media-ai"
  | "library"
  | "delivery"
  | "creative-control";

export type AttelierFeatureExecution =
  | "deterministic-project"
  | "capability-action"
  | "harness-control";

export type AttelierFeature = {
  toolName: string;
  family: AttelierFeatureFamily;
  execution: AttelierFeatureExecution;
  description: string;
};

const FAMILY_TOOLS = {
  edit: [
    "trim_clip", "split_clip", "slip_clip", "roll_edit", "slide_clip",
    "ripple_trim_clip", "set_speed", "delete_clip", "duplicate_clip",
    "freeze_frame", "reverse_clip", "replace_clip_media", "reconstruct_video",
  ],
  timeline: [
    "move_clip", "insert_source_range", "add_marker", "delete_marker",
    "link_clips", "unlink_clips", "create_multicam_cut", "apply_transition",
    "apply_split_edit",
    "set_sequence_frame_rate",
  ],
  composition: [
    "set_property", "place_asset", "set_format", "add_overlay",
    "crop_product_proof", "reframe_subject",
  ],
  motion: [
    "set_keyframe", "delete_keyframe", "apply_motion_treatment",
    "animate_clip", "animate_motion",
  ],
  text: ["add_title", "edit_title", "add_captions"],
  audio: [
    "generate_voiceover", "search_music_library", "place_music",
    "generate_music", "generate_sound_effect", "clean_audio", "dub",
    "lip_sync", "set_audio_levels",
  ],
  "color-vfx": [
    "apply_region_blur", "clear_region_mask", "match_clip_color", "apply_look",
    "remove_background", "adjust_color", "generate_background",
  ],
  "media-ai": ["generate_image", "generate_video", "upscale_clip"],
  library: [
    "use_web_image", "search_stock", "place_stock", "remember_ingredient",
  ],
  delivery: ["polish_quality", "export_video", "critique_project"],
  "creative-control": ["set_brief", "request_creative_decision", ...[...PIPELINE_TOOLS, ...PIPELINE_JOB_TOOLS].map(t => t.name)],
} as const satisfies Record<AttelierFeatureFamily, readonly string[]>;

const HARNESS_CONTROL_TOOLS = new Set([
  ...[...PIPELINE_TOOLS, ...PIPELINE_JOB_TOOLS].map(t => t.name),
  "critique_project",
  "remember_ingredient",
  "set_brief",
  "request_creative_decision",
]);

const familyByTool = new Map<string, AttelierFeatureFamily>();
for (const [family, names] of Object.entries(FAMILY_TOOLS) as Array<
  [AttelierFeatureFamily, readonly string[]]
>) {
  for (const name of names) {
    if (familyByTool.has(name)) {
      throw new Error(`Attelier feature ${name} belongs to more than one family.`);
    }
    familyByTool.set(name, family);
  }
}

const catalogByName = new Map(
  ATTELIER_EDITOR_OPENAI_TOOLS.map(({ function: definition }) => [
    definition.name,
    definition,
  ]),
);

const catalogNames: Set<string> = new Set(catalogByName.keys());
const unclassified = [...catalogNames].filter((name) => !familyByTool.has(name));
const unknown = [...familyByTool.keys()].filter((name) => !catalogNames.has(name));
if (unclassified.length > 0 || unknown.length > 0) {
  throw new Error(
    `Attelier feature registry is out of sync (unclassified: ${unclassified.join(", ") || "none"}; unknown: ${unknown.join(", ") || "none"}).`,
  );
}

export const ATTELIER_FEATURES: readonly AttelierFeature[] = Object.freeze(
  ATTELIER_EDITOR_OPENAI_TOOLS.map(({ function: definition }) => ({
    toolName: definition.name,
    family: familyByTool.get(definition.name)!,
    execution: HARNESS_CONTROL_TOOLS.has(definition.name)
      ? "harness-control" as const
      : ATTELIER_ACTION_TOOL_NAMES.has(definition.name)
        ? "capability-action" as const
        : "deterministic-project" as const,
    description: definition.description,
  })),
);

export const ATTELIER_FEATURE_FAMILIES = Object.freeze(
  Object.keys(FAMILY_TOOLS) as AttelierFeatureFamily[],
);
