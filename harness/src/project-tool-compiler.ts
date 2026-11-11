import type {
  Asset,
  Keyframe,
  MediaTime,
  Project,
  ProjectOperation,
  TimelineElement,
  TransitionKind,
} from "@attelier/project-schema";
import type { ColorAnalysisArtifact } from "@attelier/analysis-schema";
import { secondsToTicks, ticksToSeconds } from "@attelier/project-schema";
import {
  assessMotionTreatment,
  type MotionTreatmentKind,
} from "@attelier/capability-schema/motion-treatment";
import { compileEditorialEdit } from "@attelier/capability-schema/editorial-editing";
import {
  activeProjectSequence,
  locateProjectElement as locateElement,
  nextProjectSplitElementId as nextSplitElementId,
} from "@atte/kit/project-tool-utils";
import { buildTransitionOperations } from "./transition-tools.js";
import {
  buildSplitEditOperations,
  type SplitEditKind,
} from "./split-edit-tools.js";
import { buildMeasuredColorMatchOperations } from "./color-match-tools.js";
import {
  buildExistingAssetPlacementOperations,
  buildTitleOperations,
  safeTitlePosition,
} from "./composition-tools.js";
import { buildMotionOperations, type MotionPreset } from "./motion-tools.js";
import {
  ATTELIER_ACTION_TOOL_NAMES as ACTION_TOOL_NAMES,
  GRAPHIC_TEMPLATE_IDS,
  graphicTemplate,
} from "@atte/kit/tool-catalog";
import { compileSourceEdit } from "./source-edit.js";
import {
  findLinkGroupForElement,
  planLinkedDelete,
  planLinkedMove,
  planLinkedTrim,
} from "./linked-edits.js";
import { compileMulticamSwitchPlan } from "./multicam.js";
import { resolveTransitionPair } from "./transition-tools.js";

export type AttelierProjectToolCall = {
  name: string;
  arguments: Record<string, unknown>;
};

export type ProjectToolSpeechWord = {
  text?: string;
  startSeconds: number;
  endSeconds: number;
};

export type ProjectToolCompilerEvidence = {
  transcriptWordsForAsset?: (
    assetId: string,
  ) => readonly ProjectToolSpeechWord[] | undefined;
  audioAnalysisForAsset?: (
    assetId: string,
  ) => { silenceRanges: readonly { start: MediaTime; end: MediaTime }[] } | undefined;
  colorAnalysisForAsset?: (assetId: string) => ColorAnalysisArtifact | undefined;
  shotChangesForAsset?: (
    assetId: string,
  ) => readonly { atSourceSeconds: number; score: number }[] | undefined;
};

export type LocalizationGraphicTranslation = {
  elementId: string;
  translatedText: string;
};

/** Compile the single reversible project mutation for a completed localization.
 * Provider calls stay outside the deterministic compiler; this function only
 * places their imported result and updates existing authored text layers. */
export const compileLocalizationOperations = (input: {
  project: Project;
  targetLanguage: string;
  audioAsset?: Asset;
  dialogueElementIds: readonly string[];
  graphics: readonly LocalizationGraphicTranslation[];
}): ProjectOperation[] => {
  const sequence = input.project.sequences.find(({ id }) => id === input.project.activeSequenceId);
  if (!sequence) throw new Error("The project has no active sequence.");
  const operations: ProjectOperation[] = [];
  if (input.audioAsset) {
    const existingIds = new Set(sequence.tracks.map(({ id }) => id));
    const baseId = `dialogue-${input.targetLanguage.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    let trackId = baseId;
    let suffix = 2;
    while (existingIds.has(trackId)) trackId = `${baseId}-${suffix++}`;
    const durationSeconds = Math.max(0, ...sequence.tracks.flatMap(({ elements }) => elements.map((element) =>
      ticksToSeconds(element.timelineRange.start) + ticksToSeconds(element.timelineRange.duration))));
    operations.push({ type: "addAsset", asset: input.audioAsset });
    operations.push({
      type: "addTrack",
      sequenceId: sequence.id,
      track: {
        id: trackId,
        name: `Dialogue (${input.targetLanguage})`,
        kind: "audio",
        order: Math.max(-1, ...sequence.tracks.map(({ order }) => order)) + 1,
        locked: false,
        muted: false,
        hidden: false,
        elements: [],
      },
    });
    operations.push({
      type: "insertElement",
      trackId,
      element: {
        id: `localized-dialogue-${input.targetLanguage}-${crypto.randomUUID()}`,
        name: `Dialogue (${input.targetLanguage})`,
        kind: "audio",
        assetId: input.audioAsset.id,
        timelineRange: { start: secondsToTicks(0), duration: secondsToTicks(durationSeconds) },
        sourceRange: { start: secondsToTicks(0), duration: secondsToTicks(durationSeconds) },
        properties: {
          "audio.role": "dialogue",
          "audio.gainDb": 0,
          "audio.normalizeLufs": -14,
          "audio.cleanup": true,
          "effect.audio.id": "atelier.audio.professional-mix",
          "effect.audio.version": 1,
        },
        keyframes: [],
      },
    });
    for (const elementId of new Set(input.dialogueElementIds)) {
      operations.push({ type: "setProperty", elementId, path: "audio.muted", value: true });
    }
  }
  for (const graphic of input.graphics) {
    operations.push({ type: "setProperty", elementId: graphic.elementId, path: "text.content", value: graphic.translatedText });
  }
  return operations;
};

export type ProjectToolPreparedResult =
  | {
      tool: "assemble_first_cut";
      timeline: Array<{
        index: number;
        elementId: string;
        assetId: string;
        clip: string;
        sourceStartSeconds: number;
        sourceEndSeconds: number;
        timelineStartSeconds: number;
        timelineEndSeconds: number;
        requestedTimelineStartSeconds?: number;
        beat?: string;
      }>;
      durationSeconds: number;
      transitions: "fit-speech" | "none";
      expandedCalls: Array<{ tool: string; arguments: Record<string, unknown> }>;
    }
  | {
      tool: "apply_transition";
      outgoingElementId: string;
      incomingElementId: string;
      appliedDurationSeconds: number;
      extendedOutgoingSeconds: number;
      extendedIncomingSeconds: number;
      clampedBy: string[];
      /** Present when `fit:"speech"` was asked for without any word evidence:
       *  the transition was fitted to time instead of being refused. */
      fitFallback?: "time";
      snappedFrom?: number;
      snappedTo?: number;
    }
  | {
      tool: "add_graphic";
      template: string;
      groupId: string;
      elementIds: string[];
      snappedFrom?: number;
      snappedTo?: number;
    }
  | {
      tool: "punch_in";
      elementId: string;
      snappedFrom?: number;
      snappedTo?: number;
    }
  | {
      tool: "add_air";
      atCutSeconds: number;
      seconds: number;
      mode: "extend" | "freeze" | "room-tone";
      extendedOutgoingSeconds: number;
      extendedIncomingSeconds: number;
      freezeSeconds: number;
      roomToneSeconds: number;
      rippledBySeconds: number;
    }
  | { tool: "remove_graphic"; groupId: string; elementIds: string[] }
  | {
      tool: "match_clip_color";
      targetElementId: string;
      referenceElementId: string;
      strength: number;
      distanceBefore: number;
      distanceAfter: number;
    }
  | {
      tool: "apply_look";
      look: "documentary-warm" | "clean-neutral" | "cool-corporate";
      strength: number;
      elementIds: string[];
    };

export type CompiledProjectToolCalls = {
  operations: ProjectOperation[];
  prepared: ProjectToolPreparedResult[];
};

const num = (value: unknown, name: string): number => {
  const parsed =
    typeof value === "string" ? Number.parseFloat(value) : (value as number);
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
    throw new Error(`Tool argument ${name} must be a number.`);
  }
  return parsed;
};

/** Exact rationals for the supported sequence frame rates. 24 is 24/1, never 24000/1001. */
const SEQUENCE_FRAME_RATES = new Map<number, { numerator: number; denominator: number }>([
  [24, { numerator: 24, denominator: 1 }],
  [25, { numerator: 25, denominator: 1 }],
  [29.97, { numerator: 30_000, denominator: 1001 }],
  [30, { numerator: 30, denominator: 1 }],
  [50, { numerator: 50, denominator: 1 }],
  [60, { numerator: 60, denominator: 1 }],
]);

const str = (value: unknown, name: string): string => {
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`Tool argument ${name} must be a string.`);
  return value;
};

const trackedMirrorRole = (value: string): string => value
  .trim()
  .toUpperCase()
  .split(/\s+/)
  .filter(Boolean)
  .map((word) => Array.from(word).join("\u2009"))
  .join("\u2003");

const keyframeValue = (path: string, value: unknown): number | number[] => {
  const finite = (candidate: unknown): candidate is number =>
    typeof candidate === "number" && Number.isFinite(candidate);
  const numeric = finite(value) ? value : undefined;
  const array = Array.isArray(value) && value.length > 0 && value.length <= 4 && value.every(finite)
    ? value as number[]
    : undefined;
  if (path === "transform.position") {
    if (!array || array.length !== 2 || array.some((item) => item < -1 || item > 2)) {
      throw new Error("transform.position keyframes require a two-number normalized position.");
    }
    return array;
  }
  if (path === "mask.region.center") {
    if (!array || array.length !== 2 || array.some((item) => item < 0 || item > 1)) {
      throw new Error("mask.region.center keyframes require a two-number normalized centre.");
    }
    return array;
  }
  if (path === "transform.crop") {
    if (!array || array.length !== 4 || array.some((item) => item < 0 || item > 0.8)) {
      throw new Error("transform.crop keyframes require four fractions between 0 and 0.8.");
    }
    return array;
  }
  if (numeric === undefined) {
    throw new Error(`${path} keyframes require a finite numeric value.`);
  }
  if (path === "transform.scale" && (numeric < 0 || numeric > 10)) {
    throw new Error("transform.scale keyframes must be between 0 and 10.");
  }
  if (path === "transform.opacity" && (numeric < 0 || numeric > 1)) {
    throw new Error("transform.opacity keyframes must be between 0 and 1.");
  }
  if (path === "audio.gainDb" && (numeric < -60 || numeric > 12)) {
    throw new Error("audio.gainDb keyframes must be between -60 and 12.");
  }
  return numeric;
};

/** Map validated tool calls onto canonical operations. Throws with a model-readable message. */
export const compileProjectToolCallsPrepared = (
  project: Project,
  calls: AttelierProjectToolCall[],
  evidence: ProjectToolCompilerEvidence = {},
): CompiledProjectToolCalls => {
  const operations: ProjectOperation[] = [];
  const prepared: ProjectToolPreparedResult[] = [];
  // Track title-track ids minted during this pass so multiple add_title calls in
  // one plan don't each create the same "track-text" (duplicate id on apply).
  const reservedTrackIds = new Set<string>();
  const activeSequence = activeProjectSequence(project);
  // Source-edit compilation validates tracks against the supplied snapshot.
  // Keep a private planning snapshot current so a later call in the same batch
  // can reuse a track created by an earlier source-range insertion.
  const sourceEditProject = structuredClone(project);
  const sourceEditSequence = activeProjectSequence(sourceEditProject);
  // Transition operations replace a whole track. Keep their private planning
  // snapshot current so adjacent transitions in one batch compose instead of
  // each rebuilding the track from the original project and overwriting the
  // preceding boundary at commit time.
  const transitionProject = structuredClone(project);
  // Ripple edits move later clips. Keep the planning snapshot current so each
  // call in a batch resolves against the timeline produced by its predecessor.
  const rippleEditProject = structuredClone(project);
  const offsetFrames = (args: Record<string, unknown>): number => {
    if (args.offset_seconds === undefined) return num(args.offset_frames, "offset_frames");
    if (!activeSequence) throw new Error("The project has no active sequence for a seconds-based frame offset.");
    const seconds = num(args.offset_seconds, "offset_seconds");
    return Math.round(seconds * activeSequence.frameRate.numerator / activeSequence.frameRate.denominator);
  };
  const existingIds = new Set([
    ...project.sequences.flatMap((sequence) => [
      ...sequence.tracks.map(({ id }) => id),
      ...sequence.tracks.flatMap(({ elements }) => elements.map(({ id }) => id)),
      ...sequence.tracks.flatMap(({ elements }) => elements.flatMap(({ keyframes }) =>
        keyframes.flatMap((channel) => channel.keyframes.map(({ id }) => id))
      )),
      ...(sequence.markers ?? []).map(({ id }) => id),
      ...(sequence.linkGroups ?? []).map(({ id }) => id),
      ...sequence.tracks.flatMap(({ elements }) => elements.flatMap(({ properties }) =>
        typeof properties["group.id"] === "string" ? [properties["group.id"] as string] : []
      )),
    ]),
  ]);
  const nextId = (prefix: string): string => {
    let index = 1;
    while (existingIds.has(`${prefix}-${index}`)) index += 1;
    const id = `${prefix}-${index}`;
    existingIds.add(id);
    return id;
  };
  const nextGraphicGroupId = (): string => {
    const maximum = [...existingIds].reduce((current, id) => {
      const match = /^graphic-group-(\d+)$/.exec(id);
      return match ? Math.max(current, Number(match[1])) : current;
    }, 0);
    const id = `graphic-group-${maximum + 1}`;
    existingIds.add(id);
    return id;
  };
  const plannedBusTracks = new Map<string, string>();
  const busTrack = (bus: "music" | "ambience"): string => {
    if (!activeSequence) throw new Error("The project has no active sequence.");
    const planned = plannedBusTracks.get(bus);
    if (planned) return planned;
    const existing = activeSequence.tracks.find((track) =>
      track.id === bus || track.name.trim().toLowerCase() === bus
    );
    if (existing) {
      if (existing.kind !== "audio") throw new Error(`The ${bus} track must be an audio track.`);
      if (existing.locked) throw new Error(`The ${bus} track is locked.`);
      plannedBusTracks.set(bus, existing.id);
      return existing.id;
    }
    const trackId = existingIds.has(bus) ? nextId(`${bus}-track`) : bus;
    existingIds.add(trackId);
    reservedTrackIds.add(trackId);
    operations.push({
      type: "addTrack",
      sequenceId: activeSequence.id,
      track: {
        id: trackId,
        name: bus === "music" ? "Music" : "Ambience",
        kind: "audio",
        order: Math.max(-1, ...activeSequence.tracks.map(({ order }) => order)) + plannedBusTracks.size + 1,
        locked: false,
        muted: false,
        hidden: false,
        elements: [],
      },
    });
    plannedBusTracks.set(bus, trackId);
    return trackId;
  };
  const sequenceDurationSeconds = (): number => !activeSequence ? 0 : Math.max(
    0,
    ...activeSequence.tracks.flatMap(({ elements }) => elements.map((element) =>
      ticksToSeconds(element.timelineRange.start) + ticksToSeconds(element.timelineRange.duration)
    )),
  );
  // Placement calls in one compile request form a small assembly queue. An
  // omitted start follows the preceding placement (or the current sequence
  // tail for the first one); an explicit start resets the cursor for the next
  // queued placement. This is preparation only and remains one atomic commit.
  let sequentialPlacementEndSeconds = sequenceDurationSeconds();
  const placementStart = (value: unknown, name: string): number => {
    const start = value === undefined ? sequentialPlacementEndSeconds : num(value, name);
    if (start < 0) throw new Error(`${name} must be zero or positive.`);
    return start;
  };
  const advancePlacementCursor = (start: number, duration: number): void => {
    sequentialPlacementEndSeconds = start + duration;
  };
  const operationKeyframe = (
    element: Pick<TimelineElement, "id" | "keyframes">,
    path: string,
    at: MediaTime,
    value: number | number[],
    easing: Keyframe["easing"],
  ): ProjectOperation => {
    const existing = element.keyframes
      .find((channel) => channel.path === path)
      ?.keyframes.find((candidate) => candidate.at === at);
    const keyframe: Keyframe = {
      id: existing?.id ?? nextId("keyframe-agent"),
      at,
      value,
      easing,
    };
    return existing
      ? { type: "updateKeyframe", elementId: element.id, path, keyframe }
      : { type: "addKeyframe", elementId: element.id, path, keyframe };
  };
  const freezeTailOperations = (
    element: TimelineElement,
    input: {
      atTimelineSeconds?: number;
      holdSeconds: number;
      fadeOutSeconds?: number;
      audioFadeOutSeconds?: number;
      muteAudio: boolean;
    },
  ): ProjectOperation[] => {
    if (element.kind !== "video") {
      throw new Error("freeze_frame targets a video clip (an image is already a still).");
    }
    if (!activeSequence) throw new Error("The project has no active sequence.");
    if (!Number.isFinite(input.holdSeconds) || input.holdSeconds <= 0) {
      throw new Error("hold_seconds must be positive.");
    }
    const start = ticksToSeconds(element.timelineRange.start);
    const duration = ticksToSeconds(element.timelineRange.duration);
    const end = start + duration;
    const frameSeconds = activeSequence.frameRate.denominator /
      Math.max(1, activeSequence.frameRate.numerator);
    const requestedAt = input.atTimelineSeconds ?? end;
    if (!Number.isFinite(requestedAt) || requestedAt < start || requestedAt > end) {
      throw new Error("at_timeline_seconds must fall inside the target clip.");
    }
    // A split exactly at the exclusive clip end has no right-hand element.
    // Use the start of the final sequence frame so the frozen segment samples
    // the actual tail while every earlier frame remains untouched.
    const freezeAt = Math.min(requestedAt, Math.max(start, end - frameSeconds));
    const localAt = freezeAt - start;
    const rightId = nextId(`${element.id}-freeze`);
    const frozen = structuredClone(element);
    frozen.id = rightId;
    frozen.name = `${element.name} freeze`;
    frozen.timelineRange = {
      start: secondsToTicks(freezeAt),
      duration: secondsToTicks(input.holdSeconds),
    };
    if (element.sourceRange) {
      frozen.sourceRange = {
        start: String(Number(element.sourceRange.start) + Number(secondsToTicks(localAt))) as MediaTime,
        duration: secondsToTicks(frameSeconds),
      };
    }
    frozen.properties["playback.freeze"] = true;
    delete frozen.properties["playback.reverse"];
    if (input.muteAudio) frozen.properties["audio.muted"] = true;
    if (input.audioFadeOutSeconds !== undefined && input.audioFadeOutSeconds > 0) {
      // The keyframes retain editable intent. The existing audio renderer also
      // consumes this static envelope while animated gain rendering catches up.
      frozen.properties["audio.fadeOutSeconds"] = input.audioFadeOutSeconds;
    }
    frozen.keyframes = [];

    const result: ProjectOperation[] = [];
    if (freezeAt > start) {
      result.push({
        type: "splitElement",
        elementId: element.id,
        at: secondsToTicks(freezeAt),
        rightElementId: rightId,
      });
      result.push({ type: "replaceElement", elementId: rightId, element: frozen });
    } else {
      frozen.id = element.id;
      result.push({ type: "replaceElement", elementId: element.id, element: frozen });
    }

    const targetId = frozen.id;
    const target = { ...frozen, id: targetId };
    const addFade = (
      path: string,
      fadeSeconds: number | undefined,
      from: number,
      to: number,
    ) => {
      if (fadeSeconds === undefined) return;
      if (!Number.isFinite(fadeSeconds) || fadeSeconds < 0 || fadeSeconds > input.holdSeconds) {
        throw new Error(`${path === "transform.opacity" ? "fade_out_seconds" : "audio_fade_out_seconds"} must be between 0 and hold_seconds.`);
      }
      if (fadeSeconds === 0) return;
      const fadeStart = Math.max(0, input.holdSeconds - fadeSeconds);
      result.push(
        operationKeyframe(target, path, secondsToTicks(fadeStart), from, "linear"),
        operationKeyframe(target, path, secondsToTicks(input.holdSeconds), to, "linear"),
      );
    };
    addFade("transform.opacity", input.fadeOutSeconds, 1, 0);
    addFade(
      "audio.gainDb",
      input.audioFadeOutSeconds,
      typeof element.properties["audio.gainDb"] === "number"
        ? element.properties["audio.gainDb"] as number
        : 0,
      -60,
    );
    return result;
  };
  const playbackRate = (element: TimelineElement): number => {
    const authored = element.properties["playback.rate"];
    if (typeof authored === "number" && Number.isFinite(authored) && authored > 0) return authored;
    if (!element.sourceRange) return 1;
    const timelineDuration = ticksToSeconds(element.timelineRange.duration);
    return timelineDuration > 0 ? ticksToSeconds(element.sourceRange.duration) / timelineDuration : 1;
  };
  const timelineShotChanges = (element: TimelineElement): number[] => {
    if (!element.assetId || !element.sourceRange) return [];
    const markers = evidence.shotChangesForAsset?.(element.assetId);
    if (!markers) return [];
    const sourceStart = ticksToSeconds(element.sourceRange.start);
    const sourceEnd = sourceStart + ticksToSeconds(element.sourceRange.duration);
    const timelineStart = ticksToSeconds(element.timelineRange.start);
    const rate = playbackRate(element);
    return markers
      .map(({ atSourceSeconds }) => atSourceSeconds)
      .filter((at) => Number.isFinite(at) && at > sourceStart + 1e-6 && at < sourceEnd - 1e-6)
      .map((at) => timelineStart + (at - sourceStart) / rate)
      .sort((left, right) => left - right);
  };
  const snapWindowToShot = (
    element: TimelineElement,
    from: number,
    to: number,
    snap: unknown,
  ): { from: number; to: number; snapped: boolean } => {
    if (snap !== undefined && snap !== "shot") throw new Error("snap must be shot.");
    const markers = timelineShotChanges(element);
    if (markers.length === 0) return { from, to, snapped: false };
    const next = markers.find((at) => at > from + 1e-6);
    return { from, to: next === undefined ? to : Math.min(to, next), snapped: true };
  };
  const plannedLinkedElementIds = new Set(
    (activeSequence?.linkGroups ?? []).flatMap(({ elementIds }) => elementIds),
  );
  for (const call of calls) {
    // Action tools (AI generation, format, polish) are dispatched client-side.
    if (ACTION_TOOL_NAMES.has(call.name)) continue;
    const args = call.arguments;
    const locate = (id: string) => {
      const located = locateElement(project, id);
      if (!located)
        throw new Error(
          `Unknown element_id "${id}". Use the ids from the project snapshot.`,
        );
      return located;
    };
    switch (call.name) {
      case "assemble_first_cut": {
        if (!activeSequence) throw new Error("The project has no active sequence.");
        if (!Array.isArray(args.rows) || args.rows.length === 0) {
          throw new Error("rows must contain the complete first-cut table.");
        }
        if (args.rows.length > 200) throw new Error("rows cannot contain more than 200 entries.");
        if (activeSequence.tracks.some(({ elements }) => elements.some(({ kind }) => kind === "video" || kind === "image"))) {
          throw new Error("assemble_first_cut requires an empty visual timeline. Clear it or use targeted edit tools for an existing cut.");
        }
        const transitionMode = args.transitions === undefined ? "fit-speech" : str(args.transitions, "transitions");
        if (transitionMode !== "fit-speech" && transitionMode !== "none") {
          throw new Error("transitions must be fit-speech or none.");
        }
        const rangeFrom = (value: unknown, name: string): { start: number; end: number } | undefined => {
          if (value === undefined) return undefined;
          if (typeof value !== "string") throw new Error(`${name} must be a string range.`);
          const match = /(-?\d+(?:\.\d+)?)\s*(?:–|—|-)\s*(-?\d+(?:\.\d+)?)/u.exec(value);
          if (!match) throw new Error(`${name} must contain a seconds range such as 0.0–23.05.`);
          const start = Number(match[1]);
          const end = Number(match[2]);
          if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
            throw new Error(`${name} must have a non-negative start and a greater end.`);
          }
          return { start, end };
        };
        const sourceCell = (value: string): { selector: string; range?: { start: number; end: number } } => {
          const separator = value.search(/[·|]/u);
          const selector = (separator < 0 ? value : value.slice(0, separator)).trim();
          const range = rangeFrom(separator < 0 ? undefined : value.slice(separator + 1), "rows[].source");
          return { selector, ...(range ? { range } : {}) };
        };
        const normalizedAssetKey = (value: string): string => value
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/\.[a-z0-9]{1,8}$/i, "")
          .toLocaleLowerCase("en")
          .replace(/[^a-z0-9]+/g, "");
        const assetForSelector = (selector: string, rowIndex: number) => {
          const exact = project.assets.filter(({ id, name }) => id === selector || name.toLocaleLowerCase("en") === selector.toLocaleLowerCase("en"));
          if (exact.length === 1) return exact[0]!;
          const clipNumber = /^clip\s*0*(\d+)$/i.exec(selector.trim())?.[1];
          const key = normalizedAssetKey(selector);
          const matches = project.assets.filter(({ id, name }) => {
            if (clipNumber) {
              const pattern = new RegExp(`(?:^|[^a-z0-9])clip[^0-9]*0*${Number(clipNumber)}(?:[^0-9]|$)`, "i");
              if (pattern.test(id) || pattern.test(name)) return true;
            }
            const idKey = normalizedAssetKey(id);
            const nameKey = normalizedAssetKey(name);
            return key.length > 0 && (idKey === key || nameKey === key || nameKey.includes(key));
          });
          if (matches.length === 0) {
            throw new Error(`rows[${rowIndex}] clip "${selector}" did not match a project asset.`);
          }
          if (matches.length > 1) {
            throw new Error(`rows[${rowIndex}] clip "${selector}" is ambiguous: ${matches.map(({ id, name }) => `${id} (${name})`).join(", ")}. Pass assetId.`);
          }
          return matches[0]!;
        };
        type FirstCutRow = {
          assetId: string;
          clip: string;
          sourceStartSeconds: number;
          sourceEndSeconds: number;
          requestedTimelineStartSeconds?: number;
          beat?: string;
          useSourceRange: boolean;
        };
        const rows: FirstCutRow[] = args.rows.map((value, index) => {
          if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new Error(`rows[${index}] must be an object.`);
          }
          const row = value as Record<string, unknown>;
          const clipValue = row.source ?? row.clip;
          const assetIdValue = row.asset_id;
          if (clipValue !== undefined && typeof clipValue !== "string") throw new Error(`rows[${index}].clip/source must be a string.`);
          if (assetIdValue !== undefined && typeof assetIdValue !== "string") throw new Error(`rows[${index}].asset_id must be a string.`);
          if (clipValue === undefined && assetIdValue === undefined) {
            throw new Error(`rows[${index}] requires clip/source or assetId.`);
          }
          const parsedSource = typeof clipValue === "string" ? sourceCell(clipValue) : undefined;
          const selector = typeof assetIdValue === "string" ? assetIdValue : parsedSource!.selector;
          const asset = assetForSelector(selector, index);
          if (asset.mediaType !== "video" && asset.mediaType !== "image") {
            throw new Error(`rows[${index}] resolves to ${asset.mediaType}; first-cut rows must be video or image assets.`);
          }
          const explicitStart = row.source_start_seconds === undefined ? undefined : num(row.source_start_seconds, `rows[${index}].source_start_seconds`);
          const explicitEnd = row.source_end_seconds === undefined ? undefined : num(row.source_end_seconds, `rows[${index}].source_end_seconds`);
          if ((explicitStart === undefined) !== (explicitEnd === undefined)) {
            throw new Error(`rows[${index}] must pass sourceStartSeconds and sourceEndSeconds together.`);
          }
          const sourceRange = explicitStart === undefined
            ? parsedSource?.range
            : { start: explicitStart, end: explicitEnd! };
          const assetDuration = asset.duration === undefined ? undefined : ticksToSeconds(asset.duration);
          const sourceStartSeconds = sourceRange?.start ?? 0;
          const sourceEndSeconds = sourceRange?.end ?? assetDuration;
          if (sourceEndSeconds === undefined) {
            throw new Error(`rows[${index}] asset ${asset.id} has no duration; pass a source range.`);
          }
          if (sourceStartSeconds < 0 || sourceEndSeconds <= sourceStartSeconds) {
            throw new Error(`rows[${index}] source end must be greater than its non-negative start.`);
          }
          if (assetDuration !== undefined && sourceEndSeconds > assetDuration + 0.001) {
            throw new Error(`rows[${index}] source range ends at ${sourceEndSeconds}s but ${asset.name} is only ${assetDuration.toFixed(3)}s.`);
          }
          const timelineRange = rangeFrom(row.timeline, `rows[${index}].timeline`);
          const requestedTimelineStartSeconds = row.timeline_start_seconds === undefined
            ? timelineRange?.start
            : num(row.timeline_start_seconds, `rows[${index}].timeline_start_seconds`);
          if (requestedTimelineStartSeconds !== undefined && requestedTimelineStartSeconds < 0) {
            throw new Error(`rows[${index}].timeline_start_seconds must be zero or positive.`);
          }
          const beat = row.beat === undefined ? undefined : str(row.beat, `rows[${index}].beat`).trim();
          return {
            assetId: asset.id,
            clip: parsedSource?.selector ?? asset.name,
            sourceStartSeconds,
            sourceEndSeconds,
            ...(requestedTimelineStartSeconds === undefined ? {} : { requestedTimelineStartSeconds }),
            ...(beat ? { beat } : {}),
            useSourceRange: sourceRange !== undefined,
          };
        });
        const transitionAfter = (beat: string | undefined): { kind: TransitionKind; durationSeconds: number } | undefined => {
          if (transitionMode === "none") return undefined;
          const dip = beat && /\bdip(?:-to-|\s+to\s+)(black|white)(?:\s+([0-9]+(?:\.[0-9]+)?))?/i.exec(beat);
          if (dip) return { kind: dip[1]!.toLowerCase() === "white" ? "dip-to-white" : "dip-to-black", durationSeconds: dip[2] ? Number(dip[2]) : 0.4 };
          const dissolve = beat && /\b(?:cross[-\s]?)?dissolve(?:\s+([0-9]+(?:\.[0-9]+)?))?/i.exec(beat);
          if (dissolve) return { kind: "cross-dissolve", durationSeconds: dissolve[1] ? Number(dissolve[1]) : 0.4 };
          // An editorial note can mention a hard-comedy cut while still ending
          // with an explicit transition instruction. Explicit transition syntax
          // is authoritative; only treat cut as the instruction when neither a
          // dip nor a dissolve was authored.
          if (beat && /\b(?:hard\s+)?cut(?:\s+out)?\b/i.test(beat)) return undefined;
          return { kind: "cross-dissolve", durationSeconds: 0.4 };
        };
        const hardCutAfter = (beat: string | undefined): boolean =>
          transitionMode !== "none" && transitionAfter(beat) === undefined &&
          Boolean(beat && /\b(?:hard\s+)?cut(?:\s+out)?\b/i.test(beat));
        const planningProject = structuredClone(project);
        const applyPlanningOperations = (plannedOperations: readonly ProjectOperation[]): void => {
          const sequence = activeProjectSequence(planningProject);
          if (!sequence) throw new Error("The planning project lost its active sequence.");
          for (const operation of plannedOperations) {
            if (operation.type === "addTrack") {
              if (!sequence.tracks.some(({ id }) => id === operation.track.id)) sequence.tracks.push(structuredClone(operation.track));
              continue;
            }
            if (operation.type === "insertElement" || operation.type === "insertOverwrite") {
              const track = sequence.tracks.find(({ id }) => id === operation.trackId);
              if (!track) throw new Error(`First-cut planning track "${operation.trackId}" does not exist.`);
              track.elements.push(structuredClone(operation.element));
              continue;
            }
            if (operation.type === "replaceTrackElements") {
              const track = sequence.tracks.find(({ id }) => id === operation.trackId);
              if (!track) throw new Error(`First-cut planning track "${operation.trackId}" does not exist.`);
              track.elements = structuredClone(operation.elements);
            }
          }
        };
        const expandedCalls: Array<{ tool: string; arguments: Record<string, unknown> }> = [];
        const elementIds: string[] = [];
        const visualTailSeconds = (): number => {
          const sequence = activeProjectSequence(planningProject);
          return Math.max(0, ...sequence?.tracks.flatMap(({ elements }) => elements
            .filter(({ kind }) => kind === "video" || kind === "image")
            .map(({ timelineRange }) => ticksToSeconds(timelineRange.start) + ticksToSeconds(timelineRange.duration))) ?? []);
        };
        for (const [index, row] of rows.entries()) {
          const precedingBeat = rows[index - 1]?.beat;
          const precedingTransition = index > 0 ? transitionAfter(precedingBeat) : undefined;
          const precedingHardCut = index > 0 && hardCutAfter(precedingBeat);
          const requested = row.requestedTimelineStartSeconds;
          const tail = visualTailSeconds();
          const atSeconds = index === 0
            ? requested ?? 0
            : precedingTransition || precedingHardCut
              ? tail
              : requested !== undefined && Math.abs(requested - tail) > 0.05 ? requested : tail;
          const placementCall: AttelierProjectToolCall = row.useSourceRange
            ? {
                name: "insert_source_range",
                arguments: {
                  asset_id: row.assetId,
                  source_in_seconds: row.sourceStartSeconds,
                  source_out_seconds: row.sourceEndSeconds,
                  timeline_start_seconds: atSeconds,
                  mode: "overwrite",
                },
              }
            : {
                name: "place_asset",
                arguments: {
                  asset_id: row.assetId,
                  at_seconds: atSeconds,
                  duration_seconds: row.sourceEndSeconds - row.sourceStartSeconds,
                },
              };
          const placement = compileProjectToolCallsPrepared(planningProject, [placementCall], evidence);
          const inserted = placement.operations.find((operation) => operation.type === "insertElement" || operation.type === "insertOverwrite");
          if (!inserted || (inserted.type !== "insertElement" && inserted.type !== "insertOverwrite")) {
            throw new Error(`rows[${index}] produced no timeline element.`);
          }
          operations.push(...placement.operations);
          prepared.push(...placement.prepared);
          expandedCalls.push({ tool: placementCall.name, arguments: placementCall.arguments });
          applyPlanningOperations(placement.operations);
          elementIds.push(inserted.element.id);
          if (!precedingTransition) continue;
          const transitionCall: AttelierProjectToolCall = {
            name: "apply_transition",
            arguments: {
              outgoing_element_id: elementIds[index - 1],
              incoming_element_id: inserted.element.id,
              kind: precedingTransition.kind,
              duration_seconds: precedingTransition.durationSeconds,
              fit: "speech",
              snap: "shot",
            },
          };
          const compiled = compileProjectToolCallsPrepared(planningProject, [transitionCall], evidence);
          operations.push(...compiled.operations);
          prepared.push(...compiled.prepared);
          expandedCalls.push({ tool: transitionCall.name, arguments: transitionCall.arguments });
          applyPlanningOperations(compiled.operations);
        }
        const timeline = rows.map((row, index) => {
          const located = locateElement(planningProject, elementIds[index]!);
          if (!located) throw new Error(`First-cut element ${elementIds[index]} disappeared during transition planning.`);
          const timelineStartSeconds = ticksToSeconds(located.element.timelineRange.start);
          const timelineEndSeconds = timelineStartSeconds + ticksToSeconds(located.element.timelineRange.duration);
          return {
            index: index + 1,
            elementId: located.element.id,
            assetId: row.assetId,
            clip: row.clip,
            sourceStartSeconds: row.sourceStartSeconds,
            sourceEndSeconds: row.sourceEndSeconds,
            timelineStartSeconds: Number(timelineStartSeconds.toFixed(6)),
            timelineEndSeconds: Number(timelineEndSeconds.toFixed(6)),
            ...(row.requestedTimelineStartSeconds === undefined ? {} : { requestedTimelineStartSeconds: row.requestedTimelineStartSeconds }),
            ...(row.beat ? { beat: row.beat } : {}),
          };
        });
        if (args.graphics !== undefined) {
          if (!Array.isArray(args.graphics)) throw new Error("graphics must be an array.");
          for (const [index, value] of args.graphics.entries()) {
            if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`graphics[${index}] must be an object.`);
            const graphic = value as Record<string, unknown>;
            const graphicSlots = graphic.slots && typeof graphic.slots === "object" && !Array.isArray(graphic.slots)
              ? graphic.slots as Record<string, unknown>
              : {};
            const defaultTemplate = typeof graphicSlots.title === "string" && graphicSlots.title.trim()
              ? "title-card/documentary-01"
              : undefined;
            const graphicCall: AttelierProjectToolCall = {
              name: "add_graphic",
              arguments: {
                template: graphic.template ?? defaultTemplate,
                at_seconds: graphic.at_seconds,
                duration_seconds: graphic.duration_seconds,
                slots: graphic.slots,
                snap: "shot",
              },
            };
            const compiled = compileProjectToolCallsPrepared(planningProject, [graphicCall], evidence);
            operations.push(...compiled.operations);
            prepared.push(...compiled.prepared);
            expandedCalls.push({ tool: graphicCall.name, arguments: graphicCall.arguments });
            applyPlanningOperations(compiled.operations);
          }
        }
        const holdSeconds = args.hold_last_frame_seconds === undefined
          ? undefined
          : num(args.hold_last_frame_seconds, "hold_last_frame_seconds");
        const fadeSeconds = args.fade_out_seconds === undefined
          ? undefined
          : num(args.fade_out_seconds, "fade_out_seconds");
        if (fadeSeconds !== undefined && holdSeconds === undefined) {
          throw new Error("fadeOutSeconds requires holdLastFrameSeconds.");
        }
        if (holdSeconds !== undefined) {
          const holdCall: AttelierProjectToolCall = {
            name: "hold_last_frame",
            arguments: {
              element_id: elementIds.at(-1),
              hold_seconds: holdSeconds,
              ...(fadeSeconds === undefined ? {} : {
                fade_out_seconds: fadeSeconds,
                audio_fade_out_seconds: fadeSeconds,
              }),
            },
          };
          const compiled = compileProjectToolCallsPrepared(planningProject, [holdCall], evidence);
          operations.push(...compiled.operations);
          prepared.push(...compiled.prepared);
          expandedCalls.push({ tool: holdCall.name, arguments: holdCall.arguments });
        }
        const frameSeconds = activeSequence.frameRate.denominator / Math.max(1, activeSequence.frameRate.numerator);
        const placedEnd = Math.max(0, ...timeline.map(({ timelineEndSeconds }) => timelineEndSeconds));
        prepared.push({
          tool: "assemble_first_cut",
          timeline,
          durationSeconds: Number((placedEnd + (holdSeconds === undefined ? 0 : holdSeconds - frameSeconds)).toFixed(6)),
          transitions: transitionMode,
          expandedCalls,
        });
        break;
      }
      case "trim_clip": {
        const { element } = locate(str(args.element_id, "element_id"));
        const target = num(args.duration_seconds, "duration_seconds");
        if (target <= 0) throw new Error("duration_seconds must be positive.");
        const nextDuration = secondsToTicks(target);
        const fromStart = args.from_start === true;
        const delta =
          Number(element.timelineRange.duration) - Number(nextDuration);
        const timelineRange = {
          start: fromStart
            ? (String(Number(element.timelineRange.start) + delta) as MediaTime)
            : element.timelineRange.start,
          duration: nextDuration,
        };
        const sourceRange = element.sourceRange
          ? {
              start: fromStart
                ? (String(Number(element.sourceRange.start) + delta) as MediaTime)
                : element.sourceRange.start,
              duration: nextDuration,
            }
          : undefined;
        const linked = activeSequence
          ? findLinkGroupForElement(activeSequence, element.id)
          : undefined;
        operations.push(
          ...(linked && activeSequence
            ? planLinkedTrim(activeSequence, element.id, {
                timelineRange,
                ...(sourceRange ? { sourceRange } : {}),
              })
            : [{
                type: "trimElement" as const,
                elementId: element.id,
                timelineRange,
                ...(sourceRange ? { sourceRange } : {}),
              }]),
        );
        break;
      }
      case "split_clip": {
        const { element } = locate(str(args.element_id, "element_id"));
        operations.push({
          type: "splitElement",
          elementId: element.id,
          at: secondsToTicks(num(args.at_seconds, "at_seconds")),
          rightElementId: nextSplitElementId(project, element.id),
        });
        break;
      }
      case "move_clip": {
        const { element } = locate(str(args.element_id, "element_id"));
        const start = secondsToTicks(
          Math.max(0, num(args.start_seconds, "start_seconds")),
        );
        const linked = activeSequence
          ? findLinkGroupForElement(activeSequence, element.id)
          : undefined;
        operations.push(
          ...(linked && activeSequence
            ? planLinkedMove(activeSequence, element.id, start)
            : [{ type: "moveElement" as const, elementId: element.id, start }]),
        );
        break;
      }
      case "slip_clip": {
        const { element } = locate(str(args.element_id, "element_id"));
        const plan = compileEditorialEdit(project, {
          kind: "slip",
          elementId: element.id,
          offsetFrames: offsetFrames(args),
        });
        operations.push(...plan.operations);
        break;
      }
      case "roll_edit": {
        const outgoingId = str(args.outgoing_element_id, "outgoing_element_id");
        const incomingId = str(args.incoming_element_id, "incoming_element_id");
        locate(outgoingId);
        locate(incomingId);
        const plan = compileEditorialEdit(project, {
          kind: "roll",
          outgoingElementId: outgoingId,
          incomingElementId: incomingId,
          offsetFrames: offsetFrames(args),
        });
        operations.push(...plan.operations);
        break;
      }
      case "slide_clip": {
        const { element } = locate(str(args.element_id, "element_id"));
        const plan = compileEditorialEdit(project, {
          kind: "slide",
          elementId: element.id,
          offsetFrames: offsetFrames(args),
        });
        operations.push(...plan.operations);
        break;
      }
      case "ripple_trim_clip": {
        const elementId = str(args.element_id, "element_id");
        const located = locateElement(rippleEditProject, elementId);
        if (!located) {
          throw new Error(`Unknown element_id "${elementId}". Use the ids from the project snapshot.`);
        }
        const { element } = located;
        const edge = str(args.edge, "edge");
        if (edge !== "start" && edge !== "end") throw new Error("edge must be start or end.");
        const plan = compileEditorialEdit(rippleEditProject, {
          kind: "ripple-trim",
          elementId: element.id,
          edge,
          offsetFrames: offsetFrames(args),
        });
        operations.push(...plan.operations);
        for (const operation of plan.operations) {
          if (operation.type !== "trimElement" && operation.type !== "moveElement") continue;
          const planned = locateElement(rippleEditProject, operation.elementId);
          if (!planned) continue;
          if (operation.type === "trimElement") {
            planned.element.timelineRange = structuredClone(operation.timelineRange);
            if (operation.sourceRange) planned.element.sourceRange = structuredClone(operation.sourceRange);
          } else if (operation.type === "moveElement") {
            planned.element.timelineRange.start = operation.start;
          }
        }
        break;
      }
      case "set_speed": {
        const { element } = locate(str(args.element_id, "element_id"));
        const rate = num(args.rate, "rate");
        if (rate < 0.25 || rate > 4)
          throw new Error("rate must be between 0.25 and 4.");
        const previousRate =
          typeof element.properties["playback.rate"] === "number"
            ? Number(element.properties["playback.rate"])
            : 1;
        const sourceDuration = element.sourceRange
          ? Number(element.sourceRange.duration)
          : Math.round(Number(element.timelineRange.duration) * previousRate);
        const draft = structuredClone(element);
        draft.timelineRange.duration = String(
          Math.max(1, Math.round(sourceDuration / rate)),
        ) as MediaTime;
        draft.properties["playback.rate"] = rate;
        draft.properties["audio.preservePitch"] = true;
        operations.push({
          type: "replaceElement",
          elementId: element.id,
          element: draft,
        });
        break;
      }
      case "set_property": {
        const { element } = locate(str(args.element_id, "element_id"));
        operations.push({
          type: "setProperty",
          elementId: element.id,
          path: str(args.path, "path"),
          value: args.value as never,
        });
        break;
      }
      case "set_keyframe": {
        const { element } = locate(str(args.element_id, "element_id"));
        const path = str(args.path, "path");
        const allowed = new Set([
          "transform.scale",
          "transform.position",
          "transform.rotation",
          "transform.opacity",
          "transform.crop",
          "audio.gainDb",
          "mask.region.center",
        ]);
        if (!allowed.has(path)) throw new Error(`Unsupported keyframe path "${path}".`);
        const easing = args.easing === undefined
          ? "linear"
          : typeof args.easing === "string"
            ? args.easing
            : "";
        if (![
          "linear",
          "easeIn",
          "easeOut",
          "easeInOut",
          "hold",
        ].includes(easing)) {
          throw new Error("Invalid easing. Valid values: linear, easeIn, easeOut, easeInOut, hold.");
        }
        const absolute = secondsToTicks(
          num(args.at_timeline_seconds, "at_timeline_seconds"),
        );
        const localTicks = Number(absolute) - Number(element.timelineRange.start);
        if (
          localTicks < 0 ||
          localTicks > Number(element.timelineRange.duration)
        ) {
          throw new Error("Keyframe time must fall inside the target clip.");
        }
        const at = String(localTicks) as MediaTime;
        const existing = element.keyframes
          .find((channel) => channel.path === path)
          ?.keyframes.find((keyframe) => keyframe.at === at);
        const value = keyframeValue(path, args.value);
        if (path === "mask.region.center") {
          if (element.properties["effect.regionMask.id"] !== "atelier.region.blur") {
            throw new Error("Mask tracking requires an active editable region blur.");
          }
          const rect = element.properties["mask.region.rect"];
          if (!Array.isArray(rect) || rect.length < 4) throw new Error("Mask tracking requires a valid region rectangle.");
          const width = typeof rect[2] === "number" ? rect[2] : Number.NaN;
          const height = typeof rect[3] === "number" ? rect[3] : Number.NaN;
          const [centerX, centerY] = value as number[];
          if (
            !Number.isFinite(width) || !Number.isFinite(height) ||
            centerX! < width / 2 || centerX! > 1 - width / 2 ||
            centerY! < height / 2 || centerY! > 1 - height / 2
          ) {
            throw new Error("A tracked mask centre must keep the complete blur rectangle inside the source frame.");
          }
        }
        const keyframe: Keyframe = {
          id: existing?.id ?? nextId("keyframe-agent"),
          at,
          value,
          easing: easing as Keyframe["easing"],
        };
        operations.push(
          existing
            ? { type: "updateKeyframe", elementId: element.id, path, keyframe }
            : { type: "addKeyframe", elementId: element.id, path, keyframe },
        );
        break;
      }
      case "apply_region_blur": {
        const { element } = locate(str(args.element_id, "element_id"));
        if (element.kind !== "video" && element.kind !== "image") {
          throw new Error("apply_region_blur requires an image or video clip.");
        }
        const x = num(args.x, "x");
        const y = num(args.y, "y");
        const width = num(args.width, "width");
        const height = num(args.height, "height");
        const strength = args.strength === undefined ? 18 : num(args.strength, "strength");
        if (
          x < 0 || y < 0 || width < 0.02 || height < 0.02 ||
          x + width > 1 || y + height > 1
        ) {
          throw new Error("The region blur rectangle must stay inside the clip and cover at least 2% on each axis.");
        }
        if (strength < 1 || strength > 40) {
          throw new Error("Region blur strength must be between 1 and 40.");
        }
        operations.push(
          { type: "setProperty", elementId: element.id, path: "effect.regionMask.id", value: "atelier.region.blur" },
          { type: "setProperty", elementId: element.id, path: "effect.regionMask.version", value: 1 },
          { type: "setProperty", elementId: element.id, path: "mask.region.rect", value: [x, y, width, height] },
          { type: "setProperty", elementId: element.id, path: "mask.region.center", value: [x + width / 2, y + height / 2] },
          { type: "setProperty", elementId: element.id, path: "mask.region.strength", value: strength },
        );
        break;
      }
      case "create_multicam_cut": {
        if (!Array.isArray(args.angles) || !Array.isArray(args.switches)) {
          throw new Error("create_multicam_cut requires angle and switch arrays.");
        }
        const angles = args.angles.map((value, index) => {
          if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new Error(`angles[${index}] must be an object.`);
          }
          const angle = value as Record<string, unknown>;
          return {
            id: str(angle.angle_id, `angles[${index}].angle_id`),
            elementId: str(angle.element_id, `angles[${index}].element_id`),
          };
        });
        const switches = args.switches.map((value, index) => {
          if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new Error(`switches[${index}] must be an object.`);
          }
          const item = value as Record<string, unknown>;
          return {
            at: secondsToTicks(num(item.at_seconds, `switches[${index}].at_seconds`)),
            angleId: str(item.angle_id, `switches[${index}].angle_id`),
          };
        });
        operations.push(...compileMulticamSwitchPlan(project, {
          groupId: str(args.group_id, "group_id"),
          angles,
          switches,
          audioAngleId: str(args.audio_angle_id, "audio_angle_id"),
        }).operations);
        break;
      }
      case "clear_region_mask": {
        const { element } = locate(str(args.element_id, "element_id"));
        const paths = [
          "effect.regionMask.id",
          "effect.regionMask.version",
          "mask.region.rect",
          "mask.region.center",
          "mask.region.strength",
        ];
        const clearOperations: ProjectOperation[] = [
          ...paths
            .filter((path) => element.properties[path] !== undefined)
            .map((path) => ({ type: "removeProperty" as const, elementId: element.id, path })),
          ...element.keyframes
            .filter(({ path }) => path === "mask.region.center")
            .flatMap((channel) => channel.keyframes.map((keyframe) => ({
              type: "removeKeyframe" as const,
              elementId: element.id,
              path: channel.path,
              keyframeId: keyframe.id,
            }))),
        ];
        if (clearOperations.length === 0) throw new Error("This clip has no editable region mask.");
        operations.push(...clearOperations);
        break;
      }
      case "delete_keyframe": {
        const { element } = locate(str(args.element_id, "element_id"));
        const path = str(args.path, "path");
        const absolute = secondsToTicks(
          num(args.at_timeline_seconds, "at_timeline_seconds"),
        );
        const at = String(
          Number(absolute) - Number(element.timelineRange.start),
        ) as MediaTime;
        const existing = element.keyframes
          .find((channel) => channel.path === path)
          ?.keyframes.find((keyframe) => keyframe.at === at);
        if (!existing) {
          throw new Error(`No ${path} keyframe exists at that timeline position.`);
        }
        operations.push({
          type: "removeKeyframe",
          elementId: element.id,
          path,
          keyframeId: existing.id,
        });
        break;
      }
      case "crop_product_proof": {
        const { element } = locate(str(args.element_id, "element_id"));
        if (element.kind !== "image" || !element.assetId)
          throw new Error("crop_product_proof requires an image clip with a source asset.");
        const asset = project.assets.find(({ id }) => id === element.assetId);
        if (!asset?.width || !asset.height)
          throw new Error("crop_product_proof requires decoded source dimensions.");
        const left = num(args.left, "left");
        const top = num(args.top, "top");
        const right = num(args.right, "right");
        const bottom = num(args.bottom, "bottom");
        const values = [left, top, right, bottom];
        if (values.some((value) => value < 0 || value > 0.8) || left + right >= 0.85 || top + bottom >= 0.85)
          throw new Error("Crop fractions must stay within the source and preserve at least 15% on each axis.");
        const croppedWidth = asset.width * (1 - left - right);
        const croppedHeight = asset.height * (1 - top - bottom);
        if (croppedWidth < 480 || croppedHeight < 480)
          throw new Error(`The proposed crop leaves only ${Math.round(croppedWidth)}×${Math.round(croppedHeight)} source pixels; preserve at least 480×480.`);
        const evidence = str(args.evidence, "evidence").trim();
        if (evidence.length < 8)
          throw new Error("evidence must name the specific visible product/UI detail retained by the crop.");
        operations.push(
          { type: "setProperty", elementId: element.id, path: "transform.crop", value: values },
          { type: "setProperty", elementId: element.id, path: "transform.fit", value: "contain" },
          { type: "setProperty", elementId: element.id, path: "transform.scale", value: 0.94 },
          { type: "setProperty", elementId: element.id, path: "media.fitness", value: "portrait-detail-crop" },
          { type: "setProperty", elementId: element.id, path: "proof.cropEvidence", value: evidence },
        );
        break;
      }
      case "add_title": {
        const color =
          typeof args.color === "string" ? args.color.toLowerCase() : undefined;
        const fontSize =
          typeof args.font_size === "number" ? args.font_size : undefined;
        const requestedPosition =
          Array.isArray(args.position) &&
          args.position.length === 2 &&
          args.position.every(
            (value) => typeof value === "number" && Number.isFinite(value),
          )
            ? (args.position as number[])
            : undefined;
        if (color !== undefined && !/^#[0-9a-f]{6}$/.test(color))
          throw new Error("color must be a six-digit hex value.");
        if (
          fontSize !== undefined &&
          (!Number.isFinite(fontSize) || fontSize < 8 || fontSize > 512)
        )
          throw new Error("font_size must be between 8 and 512.");
        operations.push(
          ...buildTitleOperations(
            project,
            str(args.text, "text"),
            num(args.at_seconds, "at_seconds"),
            typeof args.duration_seconds === "number"
              ? args.duration_seconds
              : 4,
            reservedTrackIds,
            {
              ...(color === undefined ? {} : { color }),
              ...(fontSize === undefined ? {} : { fontSize }),
              ...(requestedPosition === undefined
                ? {}
                : { position: requestedPosition }),
            },
          ),
        );
        break;
      }
      case "place_asset": {
        const role = args.role;
        if (
          role !== undefined &&
          role !== "voiceover" &&
          role !== "music" &&
          role !== "dialogue" &&
          role !== "sound_effect"
        ) {
          throw new Error(
            "role must be voiceover, music, dialogue or sound_effect.",
          );
        }
        const assetId = str(args.asset_id, "asset_id");
        const asset = project.assets.find(({ id }) => id === assetId);
        const requestedDuration = args.duration_seconds === undefined
          ? asset?.duration === undefined ? undefined : ticksToSeconds(asset.duration)
          : num(args.duration_seconds, "duration_seconds");
        if (requestedDuration === undefined) {
          throw new Error("The asset has no usable duration; pass duration_seconds explicitly.");
        }
        const atSeconds = placementStart(args.at_seconds, "at_seconds");
        const placementOperations = buildExistingAssetPlacementOperations(
            project,
            {
              assetId,
              atSeconds,
              ...(args.duration_seconds === undefined
                ? {}
                : {
                    durationSeconds: requestedDuration,
                  }),
              ...(role === undefined ? {} : { audioRole: role }),
              ...(args.gain_db === undefined
                ? {}
                : { gainDb: num(args.gain_db, "gain_db") }),
              ...(args.fade_in_seconds === undefined
                ? {}
                : {
                    fadeInSeconds: num(args.fade_in_seconds, "fade_in_seconds"),
                  }),
              ...(args.fade_out_seconds === undefined
                ? {}
                : {
                    fadeOutSeconds: num(
                      args.fade_out_seconds,
                      "fade_out_seconds",
                    ),
                  }),
            },
            reservedTrackIds,
          );
        for (const operation of placementOperations) {
          if (operation.type !== "insertElement") continue;
          if (existingIds.has(operation.element.id)) {
            operation.element.id = nextId(`${operation.element.id}-placement`);
          } else {
            existingIds.add(operation.element.id);
          }
        }
        operations.push(...placementOperations);
        advancePlacementCursor(atSeconds, requestedDuration);
        break;
      }
      case "place_music": {
        if (!activeSequence) throw new Error("The project has no active sequence.");
        const assetId = str(args.asset_id, "asset_id");
        const asset = project.assets.find((candidate) => candidate.id === assetId);
        if (!asset) throw new Error(`Unknown asset_id "${assetId}". Use an audio asset id from the snapshot.`);
        if (asset.mediaType !== "audio" || !asset.channels) {
          throw new Error("place_music needs an audio asset with an audio stream.");
        }
        const atSeconds = args.at_seconds === undefined ? 0 : num(args.at_seconds, "at_seconds");
        if (atSeconds < 0) throw new Error("at_seconds must be zero or positive.");
        const assetDuration = asset.duration === undefined ? undefined : ticksToSeconds(asset.duration);
        const defaultEnd = sequenceDurationSeconds() > atSeconds
          ? sequenceDurationSeconds()
          : assetDuration === undefined ? undefined : atSeconds + assetDuration;
        if (args.end_seconds === undefined && defaultEnd === undefined) {
          throw new Error("end_seconds is required when neither the sequence nor the asset has a known duration.");
        }
        const endSeconds = args.end_seconds === undefined ? defaultEnd! : num(args.end_seconds, "end_seconds");
        const durationSeconds = endSeconds - atSeconds;
        if (durationSeconds <= 0) throw new Error("end_seconds must be greater than at_seconds.");
        if (assetDuration !== undefined && durationSeconds > assetDuration + 1e-6) {
          throw new Error(`The requested music range is ${durationSeconds.toFixed(3)}s but the asset is only ${assetDuration.toFixed(3)}s.`);
        }
        const gainDb = args.gain_db === undefined ? undefined : num(args.gain_db, "gain_db");
        if (gainDb !== undefined && (gainDb < -60 || gainDb > 12)) throw new Error("gain_db must be between -60 and 12.");
        const duckEnabled = args.duck_under_dialogue === undefined ? true : args.duck_under_dialogue;
        if (typeof duckEnabled !== "boolean") throw new Error("duck_under_dialogue must be a boolean.");
        const duckDepthLu = args.duck_depth_lu === undefined ? 6 : num(args.duck_depth_lu, "duck_depth_lu");
        const duckAttackMs = args.duck_attack_ms === undefined ? 80 : num(args.duck_attack_ms, "duck_attack_ms");
        const duckReleaseMs = args.duck_release_ms === undefined ? 300 : num(args.duck_release_ms, "duck_release_ms");
        if (duckDepthLu < 0 || duckDepthLu > 30) throw new Error("duck_depth_lu must be between 0 and 30.");
        if (duckAttackMs < 1 || duckAttackMs > 2000) throw new Error("duck_attack_ms must be between 1 and 2000.");
        if (duckReleaseMs < 1 || duckReleaseMs > 5000) throw new Error("duck_release_ms must be between 1 and 5000.");
        const fadeInSeconds = args.fade_in_seconds === undefined ? undefined : num(args.fade_in_seconds, "fade_in_seconds");
        const fadeOutSeconds = args.fade_out_seconds === undefined ? undefined : num(args.fade_out_seconds, "fade_out_seconds");
        for (const [name, value] of [["fade_in_seconds", fadeInSeconds], ["fade_out_seconds", fadeOutSeconds]] as const) {
          if (value !== undefined && (value < 0 || value > durationSeconds)) {
            throw new Error(`${name} must be between 0 and the music range duration.`);
          }
        }
        operations.push({
          type: "insertElement",
          trackId: busTrack("music"),
          element: {
            id: nextId("music-bed"),
            name: asset.name || "Music bed",
            kind: "audio",
            assetId,
            timelineRange: { start: secondsToTicks(atSeconds), duration: secondsToTicks(durationSeconds) },
            sourceRange: { start: secondsToTicks(0), duration: secondsToTicks(durationSeconds) },
            properties: {
              "audio.bus": "music",
              "audio.role": "music",
              "audio.duck.enabled": duckEnabled,
              "audio.duck.depthLu": duckDepthLu,
              "audio.duck.attackMs": duckAttackMs,
              "audio.duck.releaseMs": duckReleaseMs,
              "audio.ducking": duckEnabled,
              "effect.audio.id": "atelier.audio.professional-mix",
              "effect.audio.version": 1,
              ...(gainDb === undefined ? {} : { "audio.gainDb": gainDb }),
              ...(fadeInSeconds === undefined ? {} : { "audio.fadeInSeconds": fadeInSeconds }),
              ...(fadeOutSeconds === undefined ? {} : { "audio.fadeOutSeconds": fadeOutSeconds }),
            },
            keyframes: [],
          },
        });
        break;
      }
      case "fill_room_tone": {
        if (!activeSequence) throw new Error("The project has no active sequence.");
        const fromSeconds = num(args.from_seconds, "from_seconds");
        const toSeconds = num(args.to_seconds, "to_seconds");
        if (fromSeconds < 0 || toSeconds <= fromSeconds) {
          throw new Error("to_seconds must be greater than from_seconds, and both must be non-negative.");
        }
        const requestedSourceId = args.source_element_id === undefined
          ? undefined
          : str(args.source_element_id, "source_element_id");
        type SilenceCandidate = { element: TimelineElement; startSeconds: number; endSeconds: number };
        const candidates: SilenceCandidate[] = [];
        for (const track of activeSequence.tracks) {
          for (const element of track.elements) {
            if (requestedSourceId && element.id !== requestedSourceId) continue;
            if ((element.kind !== "audio" && element.kind !== "video") || !element.assetId) continue;
            const analysis = evidence.audioAnalysisForAsset?.(element.assetId);
            if (!analysis) continue;
            const asset = project.assets.find(({ id }) => id === element.assetId);
            const sourceStart = element.sourceRange ? ticksToSeconds(element.sourceRange.start) : 0;
            const sourceEnd = element.sourceRange
              ? sourceStart + ticksToSeconds(element.sourceRange.duration)
              : asset?.duration === undefined ? analysis.silenceRanges.reduce((end, range) => Math.max(end, ticksToSeconds(range.end)), 0) : ticksToSeconds(asset.duration);
            for (const silence of analysis.silenceRanges) {
              const startSeconds = Math.max(sourceStart, ticksToSeconds(silence.start));
              const endSeconds = Math.min(sourceEnd, ticksToSeconds(silence.end));
              if (endSeconds - startSeconds >= 0.12) candidates.push({ element, startSeconds, endSeconds });
            }
          }
        }
        if (requestedSourceId && !activeSequence.tracks.some(({ elements }) => elements.some(({ id }) => id === requestedSourceId))) {
          throw new Error(`Unknown source_element_id "${requestedSourceId}" in the active sequence.`);
        }
        const source = candidates.sort((left, right) =>
          (right.endSeconds - right.startSeconds) - (left.endSeconds - left.startSeconds)
          || left.element.id.localeCompare(right.element.id)
        )[0];
        if (!source) {
          throw new Error(requestedSourceId
            ? `${requestedSourceId} has no stored measured silence of at least 120 ms. Run analyze_audio or choose another clip.`
            : "No timeline clip has stored measured silence of at least 120 ms. Run analyze_audio first or pass source_element_id for an analyzed clip.");
        }
        const gainDb = args.gain_db === undefined ? -30 : num(args.gain_db, "gain_db");
        if (gainDb < -60 || gainDb > 12) throw new Error("gain_db must be between -60 and 12.");
        const durationSeconds = toSeconds - fromSeconds;
        operations.push({
          type: "insertElement",
          trackId: busTrack("ambience"),
          element: {
            id: nextId("room-tone"),
            name: `Room tone — ${source.element.name}`,
            kind: "audio",
            assetId: source.element.assetId!,
            timelineRange: { start: secondsToTicks(fromSeconds), duration: secondsToTicks(durationSeconds) },
            sourceRange: {
              start: secondsToTicks(source.startSeconds),
              duration: secondsToTicks(source.endSeconds - source.startSeconds),
            },
            properties: {
              "audio.bus": "ambience",
              "audio.role": "ambience",
              "audio.gainDb": gainDb,
              "audio.fadeInSeconds": Math.min(0.06, durationSeconds / 2),
              "audio.fadeOutSeconds": Math.min(0.06, durationSeconds / 2),
              "audio.loop": true,
              "audio.roomTone.sourceElementId": source.element.id,
              "effect.audio.id": "atelier.audio.professional-mix",
              "effect.audio.version": 1,
            },
            keyframes: [],
          },
        });
        break;
      }
      case "insert_source_range": {
        const sourceIn = num(args.source_in_seconds, "source_in_seconds");
        const sourceOut = num(args.source_out_seconds, "source_out_seconds");
        if (sourceIn < 0 || sourceOut <= sourceIn) {
          throw new Error("source_out_seconds must be greater than source_in_seconds.");
        }
        const mode = str(args.mode, "mode");
        if (mode !== "insert" && mode !== "overwrite") {
          throw new Error("mode must be insert or overwrite.");
        }
        let prefix = nextId("source-edit");
        while (
          existingIds.has(`${prefix}-element`) ||
          existingIds.has(`${prefix}-track`)
        ) {
          prefix = nextId("source-edit");
        }
        existingIds.add(`${prefix}-element`);
        existingIds.add(`${prefix}-track`);
        const timelineStartSeconds = placementStart(args.timeline_start_seconds, "timeline_start_seconds");
        const plan = compileSourceEdit(sourceEditProject, {
          assetId: str(args.asset_id, "asset_id"),
          sourceRange: {
            start: secondsToTicks(sourceIn),
            duration: secondsToTicks(sourceOut - sourceIn),
          },
          timelineStart: secondsToTicks(
            timelineStartSeconds,
          ),
          mode,
          idPrefix: prefix,
          ...(typeof args.target_track_id === "string"
            ? { targetTrackId: str(args.target_track_id, "target_track_id") }
            : {}),
        });
        operations.push(...plan.operations);
        if (sourceEditSequence) {
          for (const operation of plan.operations) {
            if (operation.type === "addTrack") {
              sourceEditSequence.tracks.push(structuredClone(operation.track));
            } else if (operation.type === "insertOverwrite") {
              sourceEditSequence.tracks
                .find(({ id }) => id === operation.trackId)
                ?.elements.push(structuredClone(operation.element));
            }
          }
        }
        advancePlacementCursor(timelineStartSeconds, sourceOut - sourceIn);
        break;
      }
      case "add_marker": {
        if (!activeSequence) throw new Error("The project has no active sequence.");
        const name = str(args.name, "name").trim();
        if (!name) throw new Error("name must not be blank.");
        const color = args.color;
        if (
          color !== undefined &&
          (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color))
        ) {
          throw new Error("color must be a six-digit hex value.");
        }
        operations.push({
          type: "addMarker",
          sequenceId: activeSequence.id,
          marker: {
            id: nextId("marker-agent"),
            name,
            at: secondsToTicks(Math.max(0, num(args.at_seconds, "at_seconds"))),
            ...(typeof color === "string" ? { color: color.toLowerCase() } : {}),
          },
        });
        break;
      }
      case "set_sequence_frame_rate": {
        if (!activeSequence) throw new Error("The project has no active sequence.");
        const fps = num(args.frame_rate, "frame_rate");
        const rate = SEQUENCE_FRAME_RATES.get(fps);
        if (!rate) {
          throw new Error(
            `frame_rate must be one of ${[...SEQUENCE_FRAME_RATES.keys()].join(", ")}.`,
          );
        }
        operations.push({
          type: "setSequenceFrameRate",
          sequenceId: activeSequence.id,
          frameRate: rate,
        });
        break;
      }
      case "delete_marker": {
        if (!activeSequence) throw new Error("The project has no active sequence.");
        const markerId = str(args.marker_id, "marker_id");
        if (!(activeSequence.markers ?? []).some(({ id }) => id === markerId)) {
          throw new Error(`Unknown marker_id "${markerId}".`);
        }
        operations.push({
          type: "deleteMarker",
          sequenceId: activeSequence.id,
          markerId,
        });
        break;
      }
      case "link_clips": {
        if (!activeSequence) throw new Error("The project has no active sequence.");
        if (!Array.isArray(args.element_ids)) {
          throw new Error("element_ids must be an array.");
        }
        const elementIds = args.element_ids.map((value, index) =>
          str(value, `element_ids[${index}]`),
        );
        if (elementIds.length < 2 || new Set(elementIds).size !== elementIds.length) {
          throw new Error("element_ids must contain at least two unique clip ids.");
        }
        const activeElementIds = new Set(
          activeSequence.tracks.flatMap(({ elements }) => elements.map(({ id }) => id)),
        );
        for (const elementId of elementIds) {
          if (!activeElementIds.has(elementId)) {
            throw new Error(`Unknown active-sequence element_id "${elementId}".`);
          }
          if (plannedLinkedElementIds.has(elementId)) {
            throw new Error(`Element "${elementId}" already belongs to a link group.`);
          }
        }
        elementIds.forEach((elementId) => plannedLinkedElementIds.add(elementId));
        operations.push({
          type: "addLinkGroup",
          sequenceId: activeSequence.id,
          linkGroup: { id: nextId("link-agent"), elementIds },
        });
        break;
      }
      case "unlink_clips": {
        if (!activeSequence) throw new Error("The project has no active sequence.");
        const elementId = str(args.element_id, "element_id");
        const group = findLinkGroupForElement(activeSequence, elementId);
        if (!group) throw new Error(`Element "${elementId}" is not linked.`);
        group.elementIds.forEach((memberId) => plannedLinkedElementIds.delete(memberId));
        operations.push({
          type: "deleteLinkGroup",
          sequenceId: activeSequence.id,
          linkGroupId: group.id,
        });
        break;
      }
      case "delete_clip": {
        const { element } = locate(str(args.element_id, "element_id"));
        const linked = activeSequence
          ? findLinkGroupForElement(activeSequence, element.id)
          : undefined;
        if (linked && args.ripple === true) {
          throw new Error("Unlink synchronized clips before a ripple delete.");
        }
        operations.push(
          ...(linked && activeSequence
            ? planLinkedDelete(activeSequence, element.id)
            : [
                args.ripple === true
                  ? { type: "rippleDeleteElement" as const, elementId: element.id }
                  : { type: "deleteElement" as const, elementId: element.id },
              ]),
        );
        break;
      }
      case "apply_transition": {
        const outgoingId = str(args.outgoing_element_id, "outgoing_element_id");
        const incomingId = str(args.incoming_element_id, "incoming_element_id");
        if (!locateElement(transitionProject, outgoingId)) {
          throw new Error(`Unknown element_id "${outgoingId}". Use the ids from the project snapshot.`);
        }
        if (!locateElement(transitionProject, incomingId)) {
          throw new Error(`Unknown element_id "${incomingId}". Use the ids from the project snapshot.`);
        }
        const kind = str(args.kind, "kind");
        if (
          kind !== "cross-dissolve" &&
          kind !== "dip-to-black" &&
          kind !== "dip-to-white"
        ) {
          throw new Error(
            "kind must be cross-dissolve, dip-to-black or dip-to-white.",
          );
        }
        const requestedDuration = num(args.duration_seconds, "duration_seconds");
        const pair = resolveTransitionPair(transitionProject, outgoingId, incomingId);
        if (args.snap !== undefined && args.snap !== "shot") throw new Error("snap must be shot.");
        const outgoingShotChanges = timelineShotChanges(pair.outgoing);
        const incomingShotChanges = timelineShotChanges(pair.incoming);
        const shotSnapping = outgoingShotChanges.length > 0 || incomingShotChanges.length > 0;
        const outgoingEndAtCut = ticksToSeconds(pair.outgoing.timelineRange.start) +
          ticksToSeconds(pair.outgoing.timelineRange.duration);
        const incomingStartAtCut = ticksToSeconds(pair.incoming.timelineRange.start);
        const outgoingShotMaximum = outgoingShotChanges.length > 0
          ? outgoingEndAtCut - outgoingShotChanges.at(-1)!
          : Number.POSITIVE_INFINITY;
        const incomingShotMaximum = incomingShotChanges.length > 0
          ? incomingShotChanges[0]! - incomingStartAtCut
          : Number.POSITIVE_INFINITY;
        const outgoingWords = pair.outgoing.assetId
          ? evidence.transcriptWordsForAsset?.(pair.outgoing.assetId)
          : undefined;
        const incomingWords = pair.incoming.assetId
          ? evidence.transcriptWordsForAsset?.(pair.incoming.assetId)
          : undefined;
        if (args.fit !== undefined && args.fit !== "speech") {
          throw new Error("fit must be speech.");
        }
        const hasWordEvidence = outgoingWords !== undefined || incomingWords !== undefined;
        const speechFit = hasWordEvidence && (args.fit === "speech" || args.fit === undefined);
        // Asking for a speech-fitted transition between two clips nobody has
        // transcribed is not an error: there is simply no speech to keep clear
        // of. The transition is fitted to time instead, and says so.
        const fitFallback = args.fit === "speech" && !hasWordEvidence;
        const maxHandle = args.max_handle_seconds === undefined
          ? 0.5
          : num(args.max_handle_seconds, "max_handle_seconds");
        if (maxHandle < 0 || maxHandle > 2) {
          throw new Error("max_handle_seconds must be between 0 and 2.");
        }

        const draftProject = structuredClone(transitionProject);
        const draftPair = resolveTransitionPair(draftProject, outgoingId, incomingId);
        const sourceMargin = (
          element: typeof draftPair.outgoing,
          words: readonly ProjectToolSpeechWord[] | undefined,
          edge: "start" | "end",
        ): number => {
          if (words === undefined || !element.sourceRange) return Number.POSITIVE_INFINITY;
          const sourceStart = ticksToSeconds(element.sourceRange.start);
          const sourceEnd = sourceStart + ticksToSeconds(element.sourceRange.duration);
          const overlapping = words.filter((word) =>
            Number.isFinite(word.startSeconds) && Number.isFinite(word.endSeconds) &&
            word.endSeconds > sourceStart && word.startSeconds < sourceEnd,
          );
          if (overlapping.length === 0) return sourceEnd - sourceStart;
          return edge === "start"
            ? Math.max(0, Math.min(...overlapping.map(({ startSeconds }) => startSeconds)) - sourceStart)
            : Math.max(0, sourceEnd - Math.max(...overlapping.map(({ endSeconds }) => endSeconds)));
        };
        const assetFor = (element: typeof draftPair.outgoing) =>
          element.assetId ? draftProject.assets.find(({ id }) => id === element.assetId) : undefined;
        let extendedOutgoingSeconds = 0;
        let extendedIncomingSeconds = 0;
        if (speechFit) {
          const toleratedOverlap = 0.08;
          const extendOutgoing = Math.max(
            0,
            requestedDuration - toleratedOverlap - sourceMargin(draftPair.outgoing, outgoingWords, "end"),
          );
          const outgoingAsset = assetFor(draftPair.outgoing);
          if (draftPair.outgoing.sourceRange && outgoingAsset?.duration) {
            const sourceEnd = Number(draftPair.outgoing.sourceRange.start) + Number(draftPair.outgoing.sourceRange.duration);
            const nextShot = draftPair.outgoing.assetId
              ? evidence.shotChangesForAsset?.(draftPair.outgoing.assetId)
                ?.map(({ atSourceSeconds }) => atSourceSeconds)
                .filter((at) => at > ticksToSeconds(String(sourceEnd) as MediaTime) + 1e-6)
                .sort((left, right) => left - right)[0]
              : undefined;
            const available = Math.max(0, Math.min(
              ticksToSeconds(String(Number(outgoingAsset.duration) - sourceEnd) as MediaTime),
              nextShot === undefined ? Number.POSITIVE_INFINITY : nextShot - ticksToSeconds(String(sourceEnd) as MediaTime),
            ));
            extendedOutgoingSeconds = Math.min(maxHandle, extendOutgoing, available);
            if (extendedOutgoingSeconds > 0) {
              draftPair.outgoing.sourceRange.duration = String(
                Number(draftPair.outgoing.sourceRange.duration) + Number(secondsToTicks(extendedOutgoingSeconds)),
              ) as MediaTime;
              draftPair.outgoing.timelineRange.duration = String(
                Number(draftPair.outgoing.timelineRange.duration) + Number(secondsToTicks(extendedOutgoingSeconds)),
              ) as MediaTime;
            }
          }

          const extendIncoming = Math.max(
            0,
            requestedDuration - toleratedOverlap - sourceMargin(draftPair.incoming, incomingWords, "start"),
          );
          if (draftPair.incoming.sourceRange) {
            const sourceAvailable = ticksToSeconds(draftPair.incoming.sourceRange.start);
            const previousShot = draftPair.incoming.assetId
              ? evidence.shotChangesForAsset?.(draftPair.incoming.assetId)
                ?.map(({ atSourceSeconds }) => atSourceSeconds)
                .filter((at) => at < sourceAvailable - 1e-6)
                .sort((left, right) => right - left)[0]
              : undefined;
            const shotAvailable = previousShot === undefined ? Number.POSITIVE_INFINITY : sourceAvailable - previousShot;
            const timelineAvailable = ticksToSeconds(draftPair.incoming.timelineRange.start);
            extendedIncomingSeconds = Math.min(maxHandle, extendIncoming, sourceAvailable, shotAvailable, timelineAvailable);
            if (extendedIncomingSeconds > 0) {
              const delta = Number(secondsToTicks(extendedIncomingSeconds));
              draftPair.incoming.sourceRange.start = String(Number(draftPair.incoming.sourceRange.start) - delta) as MediaTime;
              draftPair.incoming.sourceRange.duration = String(Number(draftPair.incoming.sourceRange.duration) + delta) as MediaTime;
              draftPair.incoming.timelineRange.start = String(Number(draftPair.incoming.timelineRange.start) - delta) as MediaTime;
              draftPair.incoming.timelineRange.duration = String(Number(draftPair.incoming.timelineRange.duration) + delta) as MediaTime;
            }
          }
        }

        const clampedBy: string[] = [];
        const clipMaximum = Math.min(
          2,
          ticksToSeconds(draftPair.outgoing.timelineRange.duration) / 2,
          ticksToSeconds(draftPair.incoming.timelineRange.duration) / 2,
        );
        let appliedDuration = Math.min(requestedDuration, clipMaximum);
        if (appliedDuration < requestedDuration - 0.000_001) clampedBy.push("clip-duration");
        if (speechFit) {
          const outgoingMaximum = sourceMargin(draftPair.outgoing, outgoingWords, "end") + 0.08;
          const incomingMaximum = sourceMargin(draftPair.incoming, incomingWords, "start") + 0.08;
          if (outgoingMaximum < appliedDuration - 0.000_001) clampedBy.push("outgoing-speech");
          if (incomingMaximum < appliedDuration - 0.000_001) clampedBy.push("incoming-speech");
          appliedDuration = Math.min(appliedDuration, outgoingMaximum, incomingMaximum);
        }
        if (shotSnapping) {
          const shotMaximum = Math.min(outgoingShotMaximum, incomingShotMaximum);
          if (shotMaximum < appliedDuration - 0.000_001) clampedBy.push("shot-change");
          appliedDuration = Math.min(appliedDuration, shotMaximum);
        }
        if (!Number.isFinite(appliedDuration) || appliedDuration < 0.1) {
          throw new Error("Speech margins leave less than 0.1 seconds for this transition. Move the cut or add handles first.");
        }
        const transitionOperations = buildTransitionOperations(
          draftProject,
          outgoingId,
          incomingId,
          kind as TransitionKind,
          appliedDuration,
        );
        operations.push(...transitionOperations);
        for (const operation of transitionOperations) {
          if (operation.type !== "replaceTrackElements") continue;
          const planningSequence = activeProjectSequence(transitionProject);
          const planningTrack = planningSequence?.tracks.find(({ id }) => id === operation.trackId);
          if (!planningTrack) throw new Error(`Transition planning track "${operation.trackId}" no longer exists.`);
          planningTrack.elements = structuredClone(operation.elements);
        }
        const rounded = (value: number) => Number(value.toFixed(6));
        prepared.push({
          tool: "apply_transition",
          outgoingElementId: outgoingId,
          incomingElementId: incomingId,
          appliedDurationSeconds: rounded(appliedDuration),
          extendedOutgoingSeconds: rounded(extendedOutgoingSeconds),
          extendedIncomingSeconds: rounded(extendedIncomingSeconds),
          clampedBy,
          ...(fitFallback ? { fitFallback: "time" as const } : {}),
          ...(shotSnapping ? {
            snappedFrom: rounded(outgoingEndAtCut - appliedDuration),
            snappedTo: rounded(outgoingEndAtCut + appliedDuration),
          } : {}),
        });
        break;
      }
      case "apply_split_edit": {
        const outgoingId = str(args.outgoing_element_id, "outgoing_element_id");
        const incomingId = str(args.incoming_element_id, "incoming_element_id");
        locate(outgoingId);
        locate(incomingId);
        const kind = str(args.kind, "kind");
        if (kind !== "j-cut" && kind !== "l-cut") {
          throw new Error("kind must be j-cut or l-cut.");
        }
        operations.push(
          ...buildSplitEditOperations(
            project,
            outgoingId,
            incomingId,
            kind as SplitEditKind,
            num(args.duration_seconds, "duration_seconds"),
          ),
        );
        break;
      }
      case "match_clip_color": {
        const targetId = str(args.target_element_id, "target_element_id");
        const referenceId = str(
          args.reference_element_id,
          "reference_element_id",
        );
        locate(targetId);
        locate(referenceId);
        const strength = args.strength === undefined ? 0.8 : num(args.strength, "strength");
        if (strength < 0 || strength > 1) throw new Error("strength must be between 0 and 1.");
        if (!evidence.colorAnalysisForAsset) {
          throw new Error("match_clip_color needs stored six-frame color measurements. Wait for asset analysis before matching.");
        }
        const match = buildMeasuredColorMatchOperations(
          project, targetId, referenceId, strength, evidence.colorAnalysisForAsset,
        );
        operations.push(...match.operations);
        prepared.push({
          tool: "match_clip_color",
          targetElementId: match.targetElementId,
          referenceElementId: match.referenceElementId,
          strength: match.strength,
          distanceBefore: match.distanceBefore,
          distanceAfter: match.distanceAfter,
        });
        break;
      }
      case "apply_motion_treatment": {
        const { element } = locate(str(args.element_id, "element_id"));
        if (element.kind !== "video")
          throw new Error("Motion treatment requires a video element.");
        const kind = str(args.kind, "kind");
        if (
          kind !== "stabilization" &&
          kind !== "motion-blur" &&
          kind !== "both"
        )
          throw new Error("kind must be stabilization, motion-blur or both.");
        const preflight = assessMotionTreatment({
          kind: kind as MotionTreatmentKind,
          properties: element.properties,
        });
        if (preflight.status === "needs-action")
          throw new Error(preflight.reasons.join(" "));
        const strength = Math.max(
          0,
          Math.min(
            1,
            args.strength === undefined ? 0.5 : num(args.strength, "strength"),
          ),
        );
        const frames = Math.max(
          2,
          Math.min(
            5,
            Math.round(
              args.frames === undefined ? 2 : num(args.frames, "frames"),
            ),
          ),
        );
        if (kind === "stabilization" || kind === "both")
          operations.push(
            {
              type: "setProperty",
              elementId: element.id,
              path: "effect.stabilization.id",
              value: "atelier.motion.stabilization",
            },
            {
              type: "setProperty",
              elementId: element.id,
              path: "effect.stabilization.version",
              value: 1,
            },
            {
              type: "setProperty",
              elementId: element.id,
              path: "motion.stabilization.enabled",
              value: true,
            },
            {
              type: "setProperty",
              elementId: element.id,
              path: "motion.stabilization.strength",
              value: strength,
            },
          );
        if (kind === "motion-blur" || kind === "both")
          operations.push(
            {
              type: "setProperty",
              elementId: element.id,
              path: "effect.motionBlur.id",
              value: "atelier.motion.motion-blur",
            },
            {
              type: "setProperty",
              elementId: element.id,
              path: "effect.motionBlur.version",
              value: 1,
            },
            {
              type: "setProperty",
              elementId: element.id,
              path: "motion.blur.enabled",
              value: true,
            },
            {
              type: "setProperty",
              elementId: element.id,
              path: "motion.blur.frames",
              value: frames,
            },
          );
        break;
      }
      case "animate_motion": {
        const { element } = locate(str(args.element_id, "element_id"));
        if (element.kind !== "image" && element.kind !== "video") {
          throw new Error(
            "animate_motion targets a visual clip (image or video).",
          );
        }
        const preset = str(args.preset, "preset") as MotionPreset;
        const duration =
          typeof args.duration_seconds === "number" && args.duration_seconds > 0
            ? args.duration_seconds
            : ticksToSeconds(element.timelineRange.duration);
        operations.push(...buildMotionOperations(element, preset, duration));
        break;
      }
      case "adjust_color": {
        const { element } = locate(str(args.element_id, "element_id"));
        const before = operations.length;
        const set = (path: string, value: unknown) => {
          if (typeof value === "number")
            operations.push({
              type: "setProperty",
              elementId: element.id,
              path,
              value,
            });
        };
        set("color.adjust.brightness", args.brightness);
        set("color.adjust.contrast", args.contrast);
        set("color.adjust.saturation", args.saturation);
        if (operations.length === before)
          throw new Error(
            "adjust_color needs at least one of brightness, contrast or saturation.",
          );
        break;
      }
      case "apply_look": {
        if (!activeSequence) throw new Error("The project has no active sequence.");
        const look = str(args.look, "look");
        if (look !== "documentary-warm" && look !== "clean-neutral" && look !== "cool-corporate") {
          throw new Error("look must be documentary-warm, clean-neutral or cool-corporate.");
        }
        const strength = args.strength === undefined ? 1 : num(args.strength, "strength");
        if (strength < 0 || strength > 1) throw new Error("strength must be between 0 and 1.");
        const visuals = activeSequence.tracks
          .filter(({ hidden }) => !hidden)
          .flatMap(({ elements }) => elements)
          .filter(({ kind }) => kind === "video" || kind === "image");
        if (visuals.length === 0) throw new Error("apply_look needs at least one visual clip.");
        for (const element of visuals) {
          operations.push(
            { type: "setProperty", elementId: element.id, path: "plan.look", value: look },
            { type: "setProperty", elementId: element.id, path: "plan.lookStrength", value: strength },
          );
        }
        prepared.push({
          tool: "apply_look",
          look,
          strength,
          elementIds: visuals.map(({ id }) => id),
        });
        break;
      }
      case "duplicate_clip": {
        const { element, track } = locate(str(args.element_id, "element_id"));
        const clone = structuredClone(element);
        clone.id = `${element.id}-copy-${crypto.randomUUID()}`;
        clone.name = `${element.name} copy`;
        // Place the copy just after the original (a 0.25s gap), keeping effects/keyframes.
        clone.timelineRange.start = String(
          Number(element.timelineRange.start) +
            Number(element.timelineRange.duration) +
            30_000,
        ) as MediaTime;
        clone.keyframes = clone.keyframes.map((channel) => ({
          ...channel,
          keyframes: channel.keyframes.map((keyframe) => ({
            ...keyframe,
            id: `keyframe-${crypto.randomUUID()}`,
          })),
        }));
        operations.push({
          type: "insertElement",
          trackId: track.id,
          element: clone,
        });
        break;
      }
      case "set_audio_levels": {
        const before = operations.length;
        const { element } = locate(str(args.element_id, "element_id"));
        if (element.kind !== "audio" && element.kind !== "video") {
          throw new Error("set_audio_levels targets an audio or video clip.");
        }
        const set = (path: string, value: unknown) => {
          if (typeof value === "number")
            operations.push({
              type: "setProperty",
              elementId: element.id,
              path,
              value,
            });
        };
        set("audio.gainDb", args.gain_db);
        set("audio.fadeInSeconds", args.fade_in_seconds);
        set("audio.fadeOutSeconds", args.fade_out_seconds);
        if (typeof args.mute === "boolean") {
          operations.push({
            type: "setProperty",
            elementId: element.id,
            path: "audio.muted",
            value: args.mute,
          });
        }
        if (operations.length === before) {
          throw new Error(
            "set_audio_levels needs at least one of gain_db, fade_in_seconds, fade_out_seconds or mute.",
          );
        }
        break;
      }
      case "edit_title": {
        const before = operations.length;
        const { element } = locate(str(args.element_id, "element_id"));
        if (element.kind !== "text") {
          throw new Error(
            "edit_title targets a text/title clip. To add a new title use add_title.",
          );
        }
        const push = (path: string, value: unknown) =>
          operations.push({
            type: "setProperty",
            elementId: element.id,
            path,
            value,
          });
        if (typeof args.text === "string" && args.text.length > 0)
          push("text.content", args.text);
        if (typeof args.color === "string" && args.color.length > 0)
          push("style.color", args.color);
        if (typeof args.font_size === "number")
          push("style.fontSize", args.font_size);
        if (
          Array.isArray(args.position) &&
          args.position.length === 2 &&
          args.position.every((coord) => typeof coord === "number")
        ) {
          const nextText =
            typeof args.text === "string" && args.text.length > 0
              ? args.text
              : String(element.properties["text.content"] ?? element.name);
          const nextFontSize =
            typeof args.font_size === "number"
              ? args.font_size
              : Number(element.properties["style.fontSize"] ?? 72);
          push(
            "transform.position",
            safeTitlePosition(
              project,
              nextText,
              ticksToSeconds(element.timelineRange.start),
              ticksToSeconds(element.timelineRange.duration),
              nextFontSize,
              args.position,
            ),
          );
        }
        if (typeof args.rotation === "number")
          push("transform.rotation", args.rotation);
        if (operations.length === before) {
          throw new Error(
            "edit_title needs at least one of text, color, font_size, position or rotation.",
          );
        }
        break;
      }
      case "add_overlay": {
        const assetId = str(args.asset_id, "asset_id");
        const asset = project.assets.find(
          (candidate) => candidate.id === assetId,
        );
        if (!asset)
          throw new Error(
            `Unknown asset_id "${assetId}". Use an image asset id from the snapshot.`,
          );
        if (asset.mediaType !== "image")
          throw new Error(
            "add_overlay needs an image asset (a logo or picture).",
          );
        const sequence = activeProjectSequence(project);
        if (!sequence)
          throw new Error("The project has no sequence to overlay onto.");
        const corner = typeof args.corner === "string" ? args.corner : "tr";
        const scale = typeof args.scale === "number" ? args.scale : 0.14;
        // Keep the overlay clear of platform chrome: inset corners to 0.12/0.88.
        const cx = corner === "tr" || corner === "br" ? 0.88 : 0.12;
        const cy = corner === "bl" || corner === "br" ? 0.84 : 0.16;
        const spanEndTicks = Math.max(
          Number(secondsToTicks(3)),
          ...sequence.tracks.flatMap((track) =>
            track.elements.map(
              (el) =>
                Number(el.timelineRange.start) +
                Number(el.timelineRange.duration),
            ),
          ),
        );
        const existing = new Set([
          ...sequence.tracks.map((track) => track.id),
          ...reservedTrackIds,
        ]);
        let index = 1;
        while (existing.has(`overlay-track-${index}`)) index += 1;
        const overlayTrackId = `overlay-track-${index}`;
        reservedTrackIds.add(overlayTrackId);
        const order =
          Math.max(0, ...sequence.tracks.map((track) => track.order)) +
          reservedTrackIds.size;
        operations.push({
          type: "addTrack",
          sequenceId: sequence.id,
          track: {
            id: overlayTrackId,
            name: "Overlay",
            kind: "video",
            order,
            locked: false,
            muted: false,
            hidden: false,
            elements: [],
          },
        });
        operations.push({
          type: "insertElement",
          trackId: overlayTrackId,
          element: {
            id: `overlay-${index}-${crypto.randomUUID()}`,
            name: asset.name || "Overlay",
            kind: "image",
            assetId: asset.id,
            timelineRange: {
              start: secondsToTicks(0),
              duration: String(Math.round(spanEndTicks)) as MediaTime,
            },
            properties: {
              "transform.scale": scale,
              "transform.position": [cx, cy],
            },
            keyframes: [],
          },
        });
        break;
      }
      case "punch_in": {
        const { element } = locate(str(args.element_id, "element_id"));
        if (element.kind !== "video" && element.kind !== "image") {
          throw new Error("punch_in targets a video or image clip.");
        }
        const factor = num(args.factor, "factor");
        if (factor < 1.05 || factor > 1.5) {
          throw new Error("factor must be between 1.05 and 1.5.");
        }
        const asset = element.assetId
          ? project.assets.find(({ id }) => id === element.assetId)
          : undefined;
        if (
          factor > 1.35 && asset?.width !== undefined && asset.height !== undefined &&
          Math.min(asset.width, asset.height) <= 1080
        ) {
          throw new Error(
            `factor ${factor} is too large for the ${asset.width}×${asset.height} source. Keep sources at 1080p or below at 1.35× or less; import a higher-resolution source for a tighter punch-in.`,
          );
        }
        let atSeconds = num(args.at_timeline_seconds, "at_timeline_seconds");
        let durationSeconds = num(args.duration_seconds, "duration_seconds");
        if (durationSeconds <= 0) throw new Error("duration_seconds must be positive.");
        const elementStart = ticksToSeconds(element.timelineRange.start);
        const elementEnd = elementStart + ticksToSeconds(element.timelineRange.duration);
        if (atSeconds < elementStart || atSeconds + durationSeconds > elementEnd + 0.000_001) {
          throw new Error("The punch_in window must stay inside the target clip.");
        }
        const snapped = snapWindowToShot(element, atSeconds, atSeconds + durationSeconds, args.snap);
        atSeconds = snapped.from;
        durationSeconds = snapped.to - snapped.from;
        if (durationSeconds <= 0) throw new Error("The measured shot leaves no room for this punch_in window.");
        const anchor = args.anchor === undefined ? [0.5, 0.4] : args.anchor;
        if (
          !Array.isArray(anchor) || anchor.length !== 2 ||
          anchor.some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)
        ) {
          throw new Error("anchor must be a normalized [x,y] pair between 0 and 1.");
        }
        const ease = args.ease === undefined ? "inOut" : str(args.ease, "ease");
        const easing = ease === "in" ? "easeIn" : ease === "out" ? "easeOut" : ease === "inOut" ? "easeInOut" : undefined;
        if (!easing) throw new Error("ease must be in, out or inOut.");
        const initialScale = typeof element.properties["transform.scale"] === "number"
          ? element.properties["transform.scale"] as number
          : 1;
        const initialPosition = Array.isArray(element.properties["transform.position"]) &&
          element.properties["transform.position"].length === 2 &&
          element.properties["transform.position"].every((value) => typeof value === "number")
          ? element.properties["transform.position"] as number[]
          : [0.5, 0.5];
        const scaleDelta = factor - initialScale;
        const finalPosition = [
          initialPosition[0]! + (0.5 - anchor[0]!) * scaleDelta,
          initialPosition[1]! + (0.5 - anchor[1]!) * scaleDelta,
        ];
        const localStart = secondsToTicks(atSeconds - elementStart);
        const localEnd = secondsToTicks(atSeconds + durationSeconds - elementStart);
        operations.push(
          operationKeyframe(element, "transform.scale", localStart, initialScale, easing),
          operationKeyframe(element, "transform.scale", localEnd, factor, "linear"),
          operationKeyframe(element, "transform.position", localStart, initialPosition, easing),
          operationKeyframe(element, "transform.position", localEnd, finalPosition, "linear"),
        );
        prepared.push({
          tool: "punch_in",
          elementId: element.id,
          ...(snapped.snapped ? {
            snappedFrom: Number(snapped.from.toFixed(6)),
            snappedTo: Number(snapped.to.toFixed(6)),
          } : {}),
        });
        break;
      }
      case "add_graphic": {
        if (!activeSequence) throw new Error("The project has no active sequence.");
        const templateId = str(args.template, "template");
        const template = graphicTemplate(templateId);
        if (!template) {
          throw new Error(`Unknown graphic template "${templateId}". Valid values: ${GRAPHIC_TEMPLATE_IDS.join(", ")}.`);
        }
        if (!args.slots || typeof args.slots !== "object" || Array.isArray(args.slots)) {
          throw new Error("slots must be an object.");
        }
        const slots = args.slots as Record<string, unknown>;
        let at = num(args.at_seconds ?? args.at, "at_seconds");
        let duration = args.duration_seconds === undefined
          ? template.defaultDurationSeconds
          : num(args.duration_seconds, "duration_seconds");
        if (at < 0) throw new Error("at_seconds must be zero or positive.");
        if (duration < 0.5) throw new Error("duration_seconds must be at least 0.5.");
        const underlying = [...activeSequence.tracks]
          .sort((left, right) => right.order - left.order)
          .flatMap(({ elements }) => elements)
          .find((element) => (element.kind === "video" || element.kind === "image") &&
            ticksToSeconds(element.timelineRange.start) <= at + 1e-6 &&
            ticksToSeconds(element.timelineRange.start) + ticksToSeconds(element.timelineRange.duration) > at + 1e-6);
        const snapped = underlying
          ? snapWindowToShot(underlying, at, at + duration, args.snap)
          : { from: at, to: at + duration, snapped: false };
        at = snapped.from;
        duration = snapped.to - snapped.from;
        if (duration < 0.5) {
          throw new Error("The measured shot leaves less than 0.5 seconds for this graphic window.");
        }
        const projectFonts = project.assets.filter(({ mediaType }) => mediaType === "font");
        const normalizedFontName = (value: string): string => value
          .replace(/\.(?:otf|ttf|ttc|woff2?)$/i, "")
          .toLocaleLowerCase()
          .replace(/[^a-z0-9]+/g, "");
        const slotValue = (slot: string): unknown => {
          const camelSlot = slot.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
          return slots[camelSlot] ?? slots[slot];
        };
        const resolveFont = (layer: Extract<typeof template.layers[number], { kind: "text" }>) => {
          const override = slotValue(layer.fontSlot);
          if (override !== undefined) {
            if (typeof override !== "string" || override.length === 0) {
              throw new Error(`slots.${layer.fontSlot} must be a non-empty project font asset id.`);
            }
            const explicit = projectFonts.find(({ id }) => id === override);
            if (!explicit) {
              throw new Error(`Font override "${override}" is not a project font asset. Available project fonts: ${projectFonts.map(({ id, name }) => `${id} (${name})`).join(", ") || "none"}.`);
            }
            const assetKey = normalizedFontName(explicit.name);
            const family = layer.fontFamilyPreferences.find((candidate) => {
              const candidateKey = normalizedFontName(candidate);
              return assetKey === candidateKey || assetKey.includes(candidateKey) || candidateKey.includes(assetKey);
            }) ?? explicit.name.replace(/\.(?:otf|ttf|ttc|woff2?)$/i, "");
            return { font: explicit, family };
          }
          for (const family of layer.fontFamilyPreferences) {
            const familyKey = normalizedFontName(family);
            const font = projectFonts.find(({ name }) => {
              const assetKey = normalizedFontName(name);
              return assetKey === familyKey || assetKey.includes(familyKey) || familyKey.includes(assetKey);
            });
            if (font) return { font, family };
          }
          throw new Error(
            `Template ${template.id} needs a project font matching ${layer.fontFamilyPreferences.join(", ")}. Available project fonts: ${projectFonts.map(({ id, name }) => `${id} (${name})`).join(", ") || "none"}.`,
          );
        };
        type TextLayer = Extract<typeof template.layers[number], { kind: "text" }>;
        const resolvedFonts = new Map<TextLayer, ReturnType<typeof resolveFont>>();
        const validationErrors: string[] = [];
        for (const layer of template.layers) {
          if (layer.kind === "text") {
            const content = slots[layer.slot];
            if (typeof content !== "string" || content.trim().length === 0) {
              if (!layer.optional) validationErrors.push(`slots.${layer.slot} must be non-empty`);
              continue;
            }
            try {
              resolvedFonts.set(layer, resolveFont(layer));
            } catch (error) {
              validationErrors.push(`${layer.slot}: ${error instanceof Error ? error.message : String(error)} Provide slots.${layer.fontSlot.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())}.`);
            }
            continue;
          }
          const assetId = slotValue(layer.assetSlot);
          if (typeof assetId !== "string" || assetId.length === 0) {
            validationErrors.push(`slots.${layer.assetSlot.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())} must name a project image asset`);
            continue;
          }
          const asset = project.assets.find(({ id }) => id === assetId);
          if (!asset || asset.mediaType !== "image") {
            validationErrors.push(`slots.${layer.assetSlot.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())} references "${assetId}", which is not a project image asset`);
          }
        }
        if (validationErrors.length > 0) {
          throw new Error(`Template ${template.id} cannot be added. Fix all missing or invalid dependencies: ${validationErrors.join("; ")}.`);
        }
        const groupId = nextGraphicGroupId();
        const elementIds: string[] = [];
        let graphicTrackCount = 0;
        const trackFor = (kind: "text" | "video"): string => {
          const trackId = nextId(`graphic-${kind}-track`);
          const order = Math.max(-1, ...activeSequence.tracks.map(({ order: value }) => value)) + graphicTrackCount + 1;
          graphicTrackCount += 1;
          operations.push({
            type: "addTrack",
            sequenceId: activeSequence.id,
            track: {
              id: trackId,
              name: kind === "text" ? "Graphic text" : "Graphic images",
              kind,
              order,
              locked: false,
              muted: false,
              hidden: false,
              elements: [],
            },
          });
          return trackId;
        };
        const animation = (): TimelineElement["keyframes"] => {
          const fadeIn = Math.min(template.fadeInSeconds, duration / 2);
          const fadeOut = Math.min(template.fadeOutSeconds, duration / 2);
          return [{
            path: "transform.opacity",
            keyframes: [
              { id: nextId("keyframe-agent"), at: secondsToTicks(0), value: 0, easing: "linear" },
              { id: nextId("keyframe-agent"), at: secondsToTicks(fadeIn), value: 1, easing: "linear" },
              { id: nextId("keyframe-agent"), at: secondsToTicks(duration - fadeOut), value: 1, easing: "linear" },
              { id: nextId("keyframe-agent"), at: secondsToTicks(duration), value: 0, easing: "linear" },
            ],
          }];
        };
        for (const layer of template.layers) {
          if (layer.kind === "text") {
            const content = slots[layer.slot];
            if (typeof content !== "string" || content.trim().length === 0) {
              if (layer.optional) continue;
              throw new Error(`Template ${template.id} requires a non-empty slots.${layer.slot}.`);
            }
            const elementId = nextId("graphic-text");
            elementIds.push(elementId);
            const { font, family } = resolvedFonts.get(layer)!;
            const text = template.id === "lower-third/documentary-01" && layer.slot === "role"
              ? trackedMirrorRole(content)
              : content.trim();
            operations.push({
              type: "insertElement",
              trackId: trackFor("text"),
              element: {
                id: elementId,
                name: text,
                kind: "text",
                timelineRange: { start: secondsToTicks(at), duration: secondsToTicks(duration) },
                properties: {
                  ...layer.properties,
                  "text.content": text,
                  "style.fontAssetId": font.id,
                  "style.fontFamily": family,
                  "style.fadeSeconds": template.fadeOutSeconds,
                  "style.fadeInSeconds": template.fadeInSeconds,
                  "style.fadeOutSeconds": template.fadeOutSeconds,
                  "group.id": groupId,
                  "group.template": template.id,
                  "group.slot": layer.slot,
                  "graphic.template": template.id,
                },
                keyframes: animation(),
              },
            });
          } else {
            const assetId = slotValue(layer.assetSlot);
            if (typeof assetId !== "string" || assetId.length === 0) {
              throw new Error(`Template ${template.id} requires slots.${layer.assetSlot} with a project image asset id.`);
            }
            const asset = project.assets.find(({ id }) => id === assetId);
            if (!asset || asset.mediaType !== "image") {
              throw new Error(`Image asset "${assetId}" is missing from this project. Import the logo image and pass its project asset id in slots.${layer.assetSlot}.`);
            }
            const elementId = nextId("graphic-image");
            elementIds.push(elementId);
            operations.push({
              type: "insertElement",
              trackId: trackFor("video"),
              element: {
                id: elementId,
                name: asset.name,
                kind: "image",
                assetId: asset.id,
                timelineRange: { start: secondsToTicks(at), duration: secondsToTicks(duration) },
                properties: {
                  ...layer.properties,
                  "group.id": groupId,
                  "group.template": template.id,
                  "group.slot": layer.assetSlot,
                  "graphic.template": template.id,
                },
                keyframes: animation(),
              },
            });
          }
        }
        prepared.push({
          tool: "add_graphic",
          template: template.id,
          groupId,
          elementIds,
          ...(snapped.snapped ? {
            snappedFrom: Number(snapped.from.toFixed(6)),
            snappedTo: Number(snapped.to.toFixed(6)),
          } : {}),
        });
        break;
      }
      case "remove_graphic": {
        if (!activeSequence) throw new Error("The project has no active sequence.");
        const groupId = str(args.group_id, "group_id");
        const members = activeSequence.tracks.flatMap(({ elements }) =>
          elements.filter((element) => element.properties["group.id"] === groupId),
        );
        if (members.length === 0) {
          throw new Error(`No graphic group "${groupId}" exists on the active sequence.`);
        }
        operations.push(...members.map(({ id }) => ({ type: "deleteElement" as const, elementId: id })));
        prepared.push({ tool: "remove_graphic", groupId, elementIds: members.map(({ id }) => id) });
        break;
      }
      case "freeze_frame": {
        const { element } = locate(str(args.element_id, "element_id"));
        operations.push(...freezeTailOperations(element, {
          ...(args.at_timeline_seconds === undefined
            ? {}
            : { atTimelineSeconds: num(args.at_timeline_seconds, "at_timeline_seconds") }),
          holdSeconds: args.hold_seconds === undefined
            ? ticksToSeconds(element.timelineRange.duration)
            : num(args.hold_seconds, "hold_seconds"),
          muteAudio: true,
        }));
        break;
      }
      case "add_air": {
        if (!activeSequence) throw new Error("The project has no active sequence.");
        const atCutSeconds = num(args.at_cut_seconds, "at_cut_seconds");
        const seconds = num(args.seconds, "seconds");
        if (atCutSeconds < 0) throw new Error("at_cut_seconds must be zero or positive.");
        if (seconds < 0.1 || seconds > 2) throw new Error("seconds must be between 0.1 and 2.");
        const requestedMode = args.mode === undefined ? "auto" : str(args.mode, "mode");
        if (!["auto", "extend", "freeze", "room-tone"].includes(requestedMode)) {
          throw new Error("mode must be auto, extend, freeze or room-tone.");
        }
        const frameSeconds = activeSequence.frameRate.denominator /
          Math.max(1, activeSequence.frameRate.numerator);
        const tolerance = frameSeconds / 2 + 1e-6;
        const candidates = activeSequence.tracks.flatMap((track) => {
          const ordered = [...track.elements].sort((left, right) =>
            Number(left.timelineRange.start) - Number(right.timelineRange.start));
          return ordered.slice(0, -1).flatMap((outgoing, index) => {
            const incoming = ordered[index + 1]!;
            const outgoingEnd = ticksToSeconds(outgoing.timelineRange.start) +
              ticksToSeconds(outgoing.timelineRange.duration);
            const incomingStart = ticksToSeconds(incoming.timelineRange.start);
            return Math.abs(outgoingEnd - atCutSeconds) <= tolerance &&
              Math.abs(incomingStart - atCutSeconds) <= tolerance
              ? [{ track, outgoing, incoming }]
              : [];
          });
        }).sort((left, right) => {
          const leftVisual = left.outgoing.kind === "video" || left.outgoing.kind === "image" ? 1 : 0;
          const rightVisual = right.outgoing.kind === "video" || right.outgoing.kind === "image" ? 1 : 0;
          return rightVisual - leftVisual || right.track.order - left.track.order;
        });
        const pair = candidates[0];
        if (!pair) {
          throw new Error(`No adjacent cut exists at ${atCutSeconds}s. Use the exact cut position from inspect_project.`);
        }
        const sourceHandle = (element: TimelineElement, edge: "start" | "end"): number => {
          if (!element.assetId || !element.sourceRange) return 0;
          const asset = project.assets.find(({ id }) => id === element.assetId);
          const sourceStart = ticksToSeconds(element.sourceRange.start);
          const sourceEnd = sourceStart + ticksToSeconds(element.sourceRange.duration);
          const mediaAvailable = edge === "start"
            ? sourceStart
            : Math.max(0, ticksToSeconds(asset?.duration ?? secondsToTicks(sourceEnd)) - sourceEnd);
          const words = evidence.transcriptWordsForAsset?.(element.assetId);
          const cutsSpeech = words?.some(({ startSeconds, endSeconds }) =>
            startSeconds < (edge === "start" ? sourceStart : sourceEnd) - 1e-6 &&
            endSeconds > (edge === "start" ? sourceStart : sourceEnd) + 1e-6) ?? false;
          const speechAvailable = cutsSpeech
            ? 0
            : words === undefined
            ? Number.POSITIVE_INFINITY
            : edge === "start"
              ? sourceStart - Math.max(0, ...words.filter(({ endSeconds }) => endSeconds <= sourceStart + 1e-6).map(({ endSeconds }) => endSeconds))
              : Math.min(
                  Number.POSITIVE_INFINITY,
                  ...words.filter(({ startSeconds }) => startSeconds >= sourceEnd - 1e-6).map(({ startSeconds }) => startSeconds - sourceEnd),
                );
          const shots = evidence.shotChangesForAsset?.(element.assetId)?.map(({ atSourceSeconds }) => atSourceSeconds) ?? [];
          const shotAvailable = edge === "start"
            ? sourceStart - Math.max(0, ...shots.filter((at) => at < sourceStart - 1e-6))
            : Math.min(Number.POSITIVE_INFINITY, ...shots.filter((at) => at > sourceEnd + 1e-6).map((at) => at - sourceEnd));
          return Math.max(0, Math.min(mediaAvailable, speechAvailable, shotAvailable)) / playbackRate(element);
        };
        const mayExtend = requestedMode === "auto" || requestedMode === "extend";
        const outgoingAvailable = mayExtend ? sourceHandle(pair.outgoing, "end") : 0;
        const incomingAvailable = mayExtend ? sourceHandle(pair.incoming, "start") : 0;
        const extendedOutgoingSeconds = Math.min(seconds, outgoingAvailable);
        const extendedIncomingSeconds = Math.min(
          seconds - extendedOutgoingSeconds,
          incomingAvailable,
        );
        let remainder = seconds - extendedOutgoingSeconds - extendedIncomingSeconds;
        if (requestedMode === "extend" && remainder > 1e-6) {
          throw new Error(
            `Only ${(extendedOutgoingSeconds + extendedIncomingSeconds).toFixed(3)}s of speech-safe source handles are available at this cut. Use mode:auto, freeze or room-tone.`,
          );
        }
        let freezeSeconds = 0;
        let roomToneSeconds = 0;
        if (requestedMode === "freeze") {
          remainder = seconds;
          if (pair.outgoing.kind !== "video" && pair.outgoing.kind !== "image") {
            throw new Error("mode:freeze needs a visual outgoing clip at the cut.");
          }
          freezeSeconds = remainder;
        } else if (requestedMode === "room-tone") {
          remainder = seconds;
          roomToneSeconds = remainder;
        } else if (remainder > 1e-6 && requestedMode === "auto") {
          if (pair.outgoing.kind === "video" || pair.outgoing.kind === "image") freezeSeconds = remainder;
          else roomToneSeconds = remainder;
        }

        type RoomToneSource = { element: TimelineElement; start: number; end: number };
        const roomToneSource = (): RoomToneSource | undefined => activeSequence.tracks
          .flatMap(({ elements }) => elements)
          .flatMap((element): RoomToneSource[] => {
            if (!element.assetId || (element.kind !== "video" && element.kind !== "audio")) return [];
            const analysis = evidence.audioAnalysisForAsset?.(element.assetId);
            if (!analysis) return [];
            const sourceStart = element.sourceRange ? ticksToSeconds(element.sourceRange.start) : 0;
            const sourceEnd = element.sourceRange
              ? sourceStart + ticksToSeconds(element.sourceRange.duration)
              : Number.POSITIVE_INFINITY;
            return analysis.silenceRanges.flatMap((range) => {
              const start = Math.max(sourceStart, ticksToSeconds(range.start));
              const end = Math.min(sourceEnd, ticksToSeconds(range.end));
              return end - start >= 0.12 ? [{ element, start, end }] : [];
            });
          })
          .sort((left, right) => (right.end - right.start) - (left.end - left.start))[0];
        const roomSource = roomToneSeconds > 0 ? roomToneSource() : undefined;
        if (roomToneSeconds > 0 && !roomSource) {
          throw new Error("No measured room tone is available. Run analyze_audio, or use mode:freeze on a visual cut.");
        }

        const outgoingId = pair.outgoing.id;
        const incomingId = pair.incoming.id;
        const affectedTracks = activeSequence.tracks.filter((track) =>
          track.elements.some((element) =>
            ticksToSeconds(element.timelineRange.start) >= atCutSeconds - tolerance ||
            element.id === outgoingId || element.id === incomingId));
        const locked = affectedTracks.find(({ locked }) => locked);
        if (locked) throw new Error(`Track “${locked.name}” is locked; add_air cannot ripple it.`);
        for (const track of affectedTracks) {
          const elements = track.elements.map((source) => {
            const element = structuredClone(source);
            const startsAfterCut = ticksToSeconds(source.timelineRange.start) >= atCutSeconds - tolerance;
            if (startsAfterCut) {
              element.timelineRange.start = secondsToTicks(ticksToSeconds(source.timelineRange.start) + seconds);
            }
            if (source.id === outgoingId && extendedOutgoingSeconds > 0 && element.sourceRange) {
              element.timelineRange.duration = secondsToTicks(
                ticksToSeconds(element.timelineRange.duration) + extendedOutgoingSeconds,
              );
              element.sourceRange.duration = secondsToTicks(
                ticksToSeconds(element.sourceRange.duration) + extendedOutgoingSeconds * playbackRate(element),
              );
            }
            if (source.id === incomingId && extendedIncomingSeconds > 0 && element.sourceRange) {
              const sourceDelta = extendedIncomingSeconds * playbackRate(element);
              element.timelineRange.start = secondsToTicks(
                ticksToSeconds(element.timelineRange.start) - extendedIncomingSeconds,
              );
              element.timelineRange.duration = secondsToTicks(
                ticksToSeconds(element.timelineRange.duration) + extendedIncomingSeconds,
              );
              element.sourceRange.start = secondsToTicks(ticksToSeconds(element.sourceRange.start) - sourceDelta);
              element.sourceRange.duration = secondsToTicks(ticksToSeconds(element.sourceRange.duration) + sourceDelta);
            }
            return element;
          });
          if (track.id === pair.track.id && freezeSeconds > 0) {
            const outgoing = elements.find(({ id }) => id === outgoingId)!;
            const frozen = structuredClone(outgoing);
            frozen.id = nextId(`${outgoingId}-air-freeze`);
            frozen.name = `${outgoing.name} air`;
            frozen.timelineRange = {
              start: secondsToTicks(atCutSeconds + extendedOutgoingSeconds),
              duration: secondsToTicks(freezeSeconds),
            };
            if (outgoing.sourceRange) {
              const sampleDuration = frameSeconds * playbackRate(outgoing);
              const sourceEnd = ticksToSeconds(outgoing.sourceRange.start) + ticksToSeconds(outgoing.sourceRange.duration);
              frozen.sourceRange = {
                start: secondsToTicks(Math.max(0, sourceEnd - sampleDuration)),
                duration: secondsToTicks(sampleDuration),
              };
            }
            frozen.properties["playback.freeze"] = true;
            frozen.properties["audio.muted"] = true;
            frozen.keyframes = [];
            elements.push(frozen);
          }
          operations.push({
            type: "replaceTrackElements",
            trackId: track.id,
            elements: elements.sort((left, right) => Number(left.timelineRange.start) - Number(right.timelineRange.start)),
          });
        }
        if (roomToneSeconds > 0 && roomSource) {
          operations.push({
            type: "insertElement",
            trackId: busTrack("ambience"),
            element: {
              id: nextId("room-tone-air"),
              name: `Room tone — ${roomSource.element.name}`,
              kind: "audio",
              assetId: roomSource.element.assetId!,
              timelineRange: {
                start: secondsToTicks(atCutSeconds + extendedOutgoingSeconds),
                duration: secondsToTicks(roomToneSeconds),
              },
              sourceRange: { start: secondsToTicks(roomSource.start), duration: secondsToTicks(roomSource.end - roomSource.start) },
              properties: {
                "audio.bus": "ambience", "audio.role": "ambience", "audio.gainDb": -30,
                "audio.fadeInSeconds": Math.min(0.06, roomToneSeconds / 2),
                "audio.fadeOutSeconds": Math.min(0.06, roomToneSeconds / 2),
                "audio.loop": true,
                "audio.roomTone.sourceElementId": roomSource.element.id,
                "effect.audio.id": "atelier.audio.professional-mix", "effect.audio.version": 1,
              },
              keyframes: [],
            },
          });
        }
        const actualMode = roomToneSeconds > 0 ? "room-tone" : freezeSeconds > 0 ? "freeze" : "extend";
        const rounded = (value: number): number => Number(value.toFixed(6));
        prepared.push({
          tool: "add_air",
          atCutSeconds: rounded(atCutSeconds),
          seconds: rounded(seconds),
          mode: actualMode,
          extendedOutgoingSeconds: rounded(extendedOutgoingSeconds),
          extendedIncomingSeconds: rounded(extendedIncomingSeconds),
          freezeSeconds: rounded(freezeSeconds),
          roomToneSeconds: rounded(roomToneSeconds),
          rippledBySeconds: rounded(seconds),
        });
        break;
      }
      case "hold_last_frame": {
        const { element } = locate(str(args.element_id, "element_id"));
        operations.push(...freezeTailOperations(element, {
          holdSeconds: num(args.hold_seconds, "hold_seconds"),
          ...(args.fade_out_seconds === undefined
            ? {}
            : { fadeOutSeconds: num(args.fade_out_seconds, "fade_out_seconds") }),
          ...(args.audio_fade_out_seconds === undefined
            ? {}
            : { audioFadeOutSeconds: num(args.audio_fade_out_seconds, "audio_fade_out_seconds") }),
          muteAudio: false,
        }));
        break;
      }
      case "reverse_clip": {
        const { element } = locate(str(args.element_id, "element_id"));
        if (element.kind !== "video")
          throw new Error("reverse_clip targets a video clip.");
        const sourceSeconds = element.sourceRange
          ? ticksToSeconds(element.sourceRange.duration)
          : ticksToSeconds(element.timelineRange.duration);
        if (sourceSeconds > 20)
          throw new Error(
            "reverse_clip supports clips up to 20 seconds (reversing buffers the whole clip).",
          );
        const draft = structuredClone(element);
        draft.properties["playback.reverse"] = true;
        delete draft.properties["playback.freeze"];
        operations.push({
          type: "replaceElement",
          elementId: element.id,
          element: draft,
        });
        break;
      }
      case "replace_clip_media": {
        const { element } = locate(str(args.element_id, "element_id"));
        const assetId = str(args.asset_id, "asset_id");
        const asset = project.assets.find(
          (candidate) => candidate.id === assetId,
        );
        if (!asset)
          throw new Error(
            `Unknown asset_id "${assetId}". Use an asset id from the snapshot.`,
          );
        const draft = structuredClone(element);
        draft.assetId = asset.id;
        // Repoint to the head of the new media, keeping the clip's timeline
        // length; simulation clamps the source window if the new asset is shorter.
        if (draft.sourceRange) {
          draft.sourceRange = {
            start: secondsToTicks(0),
            duration: draft.sourceRange.duration,
          };
        }
        operations.push({
          type: "replaceElement",
          elementId: element.id,
          element: draft,
        });
        break;
      }
      default:
        throw new Error(`Unknown tool "${call.name}".`);
    }
  }
  return { operations, prepared };
};

export const compileProjectToolCalls = (
  project: Project,
  calls: AttelierProjectToolCall[],
  evidence: ProjectToolCompilerEvidence = {},
): ProjectOperation[] => compileProjectToolCallsPrepared(project, calls, evidence).operations;
