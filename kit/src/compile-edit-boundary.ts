import {
  ATTELIER_COMPILE_EDIT_OPENAI_TOOLS,
  ATTELIER_EDITOR_OPENAI_TOOLS,
} from "./tool-catalog.js";
import { assertKnownKeys, publicToolError } from "./public-boundary.js";

export type EditArgumentMapping = {
  publicKey: string;
  internalKey: string;
  unit: "seconds" | "frames" | "value";
};

const snakeToCamel = (value: string): string => value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
const unitFor = (key: string): EditArgumentMapping["unit"] => key.endsWith("_seconds") || key === "at_seconds" || key === "start_seconds"
  ? "seconds"
  : key.endsWith("_frames") || key === "frames" ? "frames" : "value";

const editorSchemas = new Map(
  [...ATTELIER_EDITOR_OPENAI_TOOLS, ...ATTELIER_COMPILE_EDIT_OPENAI_TOOLS]
    .map(({ function: definition }) => [definition.name, definition.parameters]),
);

export const EDIT_ARGUMENT_MAPPINGS: Readonly<Record<string, readonly EditArgumentMapping[]>> = Object.fromEntries(
  [...editorSchemas].map(([tool, schema]) => {
    const properties = schema.properties && typeof schema.properties === "object" ? Object.keys(schema.properties) : [];
    return [tool, properties.map((internalKey) => internalKey === "offset_frames"
      ? { publicKey: "offsetSeconds", internalKey: "offset_seconds", unit: "seconds" as const }
      : { publicKey: snakeToCamel(internalKey), internalKey, unit: unitFor(internalKey) })];
  }),
);

const EDIT_ARGUMENT_ALIASES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  add_graphic: { at: "at_seconds" },
};

export const COMPILE_EDIT_ADAPTER_KEYS: Readonly<Record<string, readonly string[]>> = {
  assemble_first_cut: ["rows", "transitions", "graphics", "holdLastFrameSeconds", "fadeOutSeconds"],
  prepare_workspace_asset_import: ["workspaceAssetId", "replaceAssetId"],
  add_lower_third: ["name", "role", "atSeconds", "durationSeconds", "preset"],
  clear_timeline: ["trackId"],
  reorder_clips: ["trackId", "elementIds", "gapSeconds"],
  trim_to_speech: ["elementId", "handleSeconds"],
  snap_cut_to_words: ["atSeconds", "handleSeconds"],
  level_dialogue: ["targetLufs", "fadeSeconds"],
  set_project_profile: ["profile"],
  set_sequence_frame_rate: ["frameRate", "sequenceId"],
  prepare_project_asset_placement: ["projectAssetId", "workspaceAssetId", "trackId", "startSeconds", "sourceStartSeconds", "durationSeconds", "audioRole"],
  plan_edit: ["prompt", "selection"],
  propose_transcript_edit: ["assetId", "elementId", "kind", "minimumSilenceSeconds", "targetSilenceSeconds", "minimumFillerConfidence", "maxWordsPerCaption", "fontSize", "position"],
  compose_social_ad: ["durationSeconds", "shots", "voice", "music", "captions"],
  propose_quality_fix: ["issueId", "profile"],
  propose_color_correction: ["elementId"],
  propose_motion_treatment: ["elementId", "kind", "strength", "frames"],
  propose_subject_reframe: ["elementId", "target", "subjectLabel"],
};

const mapNestedKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(mapNestedKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
    key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
    mapNestedKeys(nested),
  ]));
};

export const mapPublicEditArguments = (tool: string, args: Record<string, unknown>): Record<string, unknown> => {
  const mapping = EDIT_ARGUMENT_MAPPINGS[tool];
  if (!mapping) {
    const validKeys = COMPILE_EDIT_ADAPTER_KEYS[tool];
    if (!validKeys) {
      throw publicToolError("UNKNOWN_EDIT_TOOL", `Unknown compile_edit tool ${tool}.`, "calls[].tool", {
        validValues: [...Object.keys(EDIT_ARGUMENT_MAPPINGS), ...Object.keys(COMPILE_EDIT_ADAPTER_KEYS)].sort(),
        example: { tool: "trim_clip", arguments: { elementId: "clip-1", durationSeconds: 4 } },
      });
    }
    assertKnownKeys(args, validKeys, `calls[${tool}].arguments`, { tool, arguments: Object.fromEntries(validKeys.slice(0, 2).map((key) => [key, "..."])) });
    return tool === "assemble_first_cut"
      ? mapNestedKeys(args) as Record<string, unknown>
      : args;
  }
  const aliases = EDIT_ARGUMENT_ALIASES[tool] ?? {};
  const validKeys = [...mapping.map(({ publicKey }) => publicKey), ...Object.keys(aliases)];
  assertKnownKeys(args, validKeys, `calls[${tool}].arguments`, { tool, arguments: Object.fromEntries(validKeys.slice(0, 2).map((key) => [key, "..."])) });
  const byPublic = new Map(mapping.map((entry) => [entry.publicKey, entry]));
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    const aliasTarget = aliases[key];
    const entry = aliasTarget
      ? mapping.find(({ internalKey }) => internalKey === aliasTarget)!
      : byPublic.get(key)!;
    if (Object.prototype.hasOwnProperty.call(result, entry.internalKey)) {
      throw publicToolError("CONFLICTING_ARGUMENTS", `${key} duplicates another value for ${entry.publicKey}.`, `calls[${tool}].arguments.${key}`, {
        validValues: [entry.publicKey, ...Object.entries(aliases).filter(([, target]) => target === entry.internalKey).map(([alias]) => alias)],
        example: { [entry.publicKey]: value },
      });
    }
    if (entry.publicKey === "frameRate" && value && typeof value === "object" && !Array.isArray(value)) {
      const rate = value as Record<string, unknown>;
      if (typeof rate.numerator !== "number" || typeof rate.denominator !== "number" || rate.denominator === 0) {
        throw publicToolError("INVALID_FRAME_RATE", "frameRate must be a numeric fps or {numerator, denominator}.", `calls[${tool}].arguments.frameRate`, {
          example: { frameRate: { numerator: 30_000, denominator: 1_001 } },
        });
      }
      result[entry.internalKey] = rate.numerator / rate.denominator;
      continue;
    }
    result[entry.internalKey] = mapNestedKeys(value);
  }
  return result;
};

export const mapPublicEditCalls = (
  calls: readonly { tool: string; arguments?: Record<string, unknown> }[],
): Array<{ tool: string; arguments: Record<string, unknown> }> => calls.map(({ tool, arguments: args = {} }) => ({
  tool,
  arguments: mapPublicEditArguments(tool, args),
}));
