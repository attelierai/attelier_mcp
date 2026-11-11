import type { Project, ProjectOperation } from "@attelier/project-schema";
import type { AttelierProjectToolCall as LlmToolCall } from "@atte/kit/project-tool-utils";
import { activeProjectSequence, locateProjectElement } from "@atte/kit/project-tool-utils";

/* Degraded local fallbacks (GStreamer test patterns, Flite voice, procedural
   synth). Mirrors the server-side render gate in services/api/src/render.ts —
   the loop must never build a cut around one. */
export const PROCEDURAL_FALLBACK_MODELS = new Set([
  "procedural-motion-webm",
  "procedural-music-synth",
  "procedural-sfx-synth",
  "flite-cmu-us-slt",
]);

const MUTATING_MEDIA_TOOLS = new Set([
  "trim_clip",
  "split_clip",
  "delete_clip",
  "set_speed",
  "reverse_clip",
  "freeze_frame",
]);

const ASSET_BINDING_TOOLS = new Set([
  "place_asset",
  "insert_source_range",
  "replace_clip_media",
  "add_overlay",
]);

export type RejectedToolCall = {
  call: LlmToolCall;
  reason: string;
  owner: "harness-tool-policy";
};
export type NormalizedToolCall = {
  original: LlmToolCall;
  normalized: LlmToolCall;
  reason: string;
  owner: "harness-tool-policy";
};

/** Enforce explicit full-source preservation before operations reach the core. */
export const enforceProtectedAssetPolicy = (options: {
  calls: LlmToolCall[];
  preserveFullAssetIds: ReadonlySet<string>;
  fullDurationsSeconds?: ReadonlyMap<string, number>;
  exactPlacementArguments?: ReadonlyMap<string, Record<string, unknown>>;
  knownElementIds?: ReadonlySet<string>;
  existingAssetIds?: ReadonlySet<string>;
  proceduralAssetIds?: ReadonlySet<string>;
}): {
  accepted: LlmToolCall[];
  rejected: RejectedToolCall[];
  normalized: NormalizedToolCall[];
} => {
  const accepted: LlmToolCall[] = [];
  const rejected: RejectedToolCall[] = [];
  const normalized: NormalizedToolCall[] = [];
  const compiledUnplacedAssets = new Set<string>();
  for (const call of options.calls) {
    const elementId =
      typeof call.arguments.element_id === "string"
        ? call.arguments.element_id
        : undefined;
    const assetId =
      typeof call.arguments.asset_id === "string"
        ? call.arguments.asset_id
        : undefined;
    if (
      call.name === "edit_title" &&
      !["text", "color", "font_size", "position", "rotation"].some(
        (key) => call.arguments[key] !== undefined,
      )
    ) {
      rejected.push({
        call,
        reason: "edit_title has no requested mutation.",
        owner: "harness-tool-policy",
      });
      continue;
    }
    if (
      ASSET_BINDING_TOOLS.has(call.name) &&
      assetId &&
      options.proceduralAssetIds?.has(assetId)
    ) {
      rejected.push({
        call,
        reason: `Asset ${assetId} is a degraded procedural fallback (test pattern or synthetic voice); it may not be placed in the cut. Generate or upload real media for this beat instead.`,
        owner: "harness-tool-policy",
      });
      continue;
    }
    if (
      call.name === "place_asset" &&
      assetId &&
      options.existingAssetIds?.has(assetId)
    ) {
      rejected.push({
        call,
        reason: `Asset ${assetId} is already present; duplicate placement is not allowed.`,
        owner: "harness-tool-policy",
      });
      continue;
    }
    if (
      elementId &&
      options.knownElementIds &&
      !options.knownElementIds.has(elementId)
    ) {
      const exactPlacement = options.exactPlacementArguments?.get(elementId);
      if (
        exactPlacement &&
        !options.existingAssetIds?.has(elementId) &&
        (call.name === "move_clip" || call.name === "trim_clip")
      ) {
        const compiled: LlmToolCall = {
          ...call,
          name: "place_asset",
          arguments: { asset_id: elementId, ...exactPlacement },
        };
        normalized.push({
          original: call,
          normalized: compiled,
          reason: `Compiled pre-placement ${call.name} for supplied asset ${elementId} into its explicit placement contract.`,
          owner: "harness-tool-policy",
        });
        if (!compiledUnplacedAssets.has(elementId)) {
          accepted.push(compiled);
          compiledUnplacedAssets.add(elementId);
        }
        continue;
      }
      rejected.push({
        call,
        reason: `Unknown element_id ${elementId}; use a live timeline element id or place the supplied asset first.`,
        owner: "harness-tool-policy",
      });
      continue;
    }
    if (
      elementId &&
      options.preserveFullAssetIds.has(elementId) &&
      MUTATING_MEDIA_TOOLS.has(call.name)
    ) {
      rejected.push({
        call,
        reason: `Explicit full-source contract protects ${elementId} from ${call.name}.`,
        owner: "harness-tool-policy",
      });
      continue;
    }
    if (call.name === "place_asset" && assetId) {
      const requiredDuration = options.fullDurationsSeconds?.get(assetId);
      const requestedDuration = call.arguments.duration_seconds;
      if (
        requiredDuration !== undefined &&
        requestedDuration !== undefined &&
        (typeof requestedDuration !== "number" ||
          Math.abs(requestedDuration - requiredDuration) > 0.05)
      ) {
        rejected.push({
          call,
          reason: `Explicit full-source contract requires ${assetId} duration ${requiredDuration}s.`,
          owner: "harness-tool-policy",
        });
        continue;
      }
    }
    const exact = assetId
      ? options.exactPlacementArguments?.get(assetId)
      : undefined;
    if (call.name === "place_asset" && exact) {
      const next = { ...call, arguments: { ...call.arguments, ...exact } };
      if (JSON.stringify(next.arguments) !== JSON.stringify(call.arguments)) {
        normalized.push({
          original: call,
          normalized: next,
          reason: `Applied explicit placement literals for ${assetId}.`,
          owner: "harness-tool-policy",
        });
      }
      accepted.push(next);
      continue;
    }
    accepted.push(call);
  }
  return { accepted, rejected, normalized };
};

export const proceduralFallbackAssetIds = (project: Project): Set<string> =>
  new Set(project.assets.flatMap((asset) =>
    asset.provenance?.model && PROCEDURAL_FALLBACK_MODELS.has(asset.provenance.model)
      ? [asset.id]
      : [],
  ));

/** Protect readable landscape product evidence when a portrait project is
 * authored through any harness client. This is an engine-facing safety policy,
 * not a browser-only repair. */
export const protectPortraitComposition = (
  project: Project,
  operations: ProjectOperation[],
): ProjectOperation[] => {
  const sequence = activeProjectSequence(project);
  if (!sequence || sequence.canvas.width >= sequence.canvas.height) return operations;
  const landscapeInPortrait = (elementId: string): boolean => {
    const located = locateProjectElement(project, elementId);
    const asset = located?.element.assetId
      ? project.assets.find(({ id }) => id === located.element.assetId)
      : undefined;
    return Boolean(asset?.width && asset.height && asset.width > asset.height);
  };
  return operations.map((operation): ProjectOperation => {
    if (operation.type === "setProperty" && landscapeInPortrait(operation.elementId)) {
      if (operation.path === "transform.fit" && operation.value === "cover") {
        return { ...operation, value: "contain" };
      }
      if (operation.path === "transform.scale" && Number(operation.value) > 1) {
        return { ...operation, value: 1 };
      }
    }
    if (
      (operation.type === "addKeyframe" || operation.type === "updateKeyframe") &&
      operation.path === "transform.scale" &&
      landscapeInPortrait(operation.elementId) &&
      Number(operation.keyframe.value) > 1
    ) {
      return {
        ...operation,
        keyframe: { ...operation.keyframe, value: 1 },
      };
    }
    if (operation.type === "replaceElement" && landscapeInPortrait(operation.elementId)) {
      const element = structuredClone(operation.element);
      element.properties["transform.fit"] = "contain";
      if (Number(element.properties["transform.scale"] ?? 1) > 1) {
        element.properties["transform.scale"] = 1;
      }
      element.keyframes = element.keyframes.map((channel) =>
        channel.path !== "transform.scale"
          ? channel
          : {
              ...channel,
              keyframes: channel.keyframes.map((keyframe) =>
                Number(keyframe.value) > 1
                  ? { ...keyframe, value: 1 }
                  : keyframe,
              ),
            },
      );
      return { ...operation, element };
    }
    return operation;
  });
};
