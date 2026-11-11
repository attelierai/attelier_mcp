import {
  secondsToTicks,
  ticksToSeconds,
  type Asset,
  type Project,
  type ProjectOperation,
  type TimelineElement,
  type Track,
} from "@attelier/project-schema";
import { activeProjectSequence } from "@atte/kit/project-tool-utils";
import { resolveTransitionPair } from "./transition-tools.js";

export type SplitEditKind = "j-cut" | "l-cut";
export class SplitEditPlanError extends Error {}

const nextId = (taken: Set<string>, base: string): string => {
  let candidate = base;
  let suffix = 2;
  while (taken.has(candidate)) candidate = `${base}-${suffix++}`;
  taken.add(candidate);
  return candidate;
};

const copyAudioProperties = (element: TimelineElement): Record<string, unknown> => {
  const properties: Record<string, unknown> = {
    "audio.role": element.properties["audio.role"] ?? "dialogue",
    "audio.gainDb": element.properties["audio.gainDb"] ?? 0,
    "audio.cleanup": element.properties["audio.cleanup"] ?? true,
    "audio.preservePitch": element.properties["audio.preservePitch"] ?? true,
  };
  if (typeof element.properties["playback.rate"] === "number") {
    properties["playback.rate"] = element.properties["playback.rate"];
  }
  return properties;
};

const assertAudioSource = (
  project: Project,
  element: TimelineElement,
): { asset: Asset; sourceStart: number; sourceDuration: number; assetDuration: number } => {
  if (!element.assetId || !element.sourceRange) {
    throw new SplitEditPlanError(`“${element.name}” has no editable source range.`);
  }
  const asset = project.assets.find((candidate) => candidate.id === element.assetId);
  if (!asset || asset.mediaType !== "video" || !asset.channels || !asset.duration) {
    throw new SplitEditPlanError(`“${element.name}” has no confirmed embedded audio stream.`);
  }
  return {
    asset,
    sourceStart: ticksToSeconds(element.sourceRange.start),
    sourceDuration: ticksToSeconds(element.sourceRange.duration),
    assetDuration: ticksToSeconds(asset.duration),
  };
};

/** Build a source-handle-aware J- or L-cut using separate, linked audio elements. */
export const buildSplitEditOperations = (
  project: Project,
  outgoingId: string,
  incomingId: string | undefined,
  kind: SplitEditKind,
  requestedDurationSeconds = 0.5,
): ProjectOperation[] => {
  const sequence = activeProjectSequence(project);
  if (!sequence) throw new SplitEditPlanError("The project has no active sequence.");
  const pair = resolveTransitionPair(project, outgoingId, incomingId);
  if (sequence.tracks.some((track) => track.elements.some((element) =>
    element.properties["audio.splitFromElementId"] === pair.outgoing.id ||
    element.properties["audio.splitFromElementId"] === pair.incoming.id))) {
    throw new SplitEditPlanError("This edit already has split audio. Adjust the audio elements directly.");
  }

  const outgoingSource = assertAudioSource(project, pair.outgoing);
  const incomingSource = assertAudioSource(project, pair.incoming);
  const maximum = Math.min(
    2,
    ticksToSeconds(pair.outgoing.timelineRange.duration) / 2,
    ticksToSeconds(pair.incoming.timelineRange.duration) / 2,
  );
  const duration = Math.min(maximum, Math.max(0.1, requestedDurationSeconds));
  if (kind === "j-cut" && incomingSource.sourceStart < duration) {
    throw new SplitEditPlanError(
      `“${pair.incoming.name}” needs ${duration.toFixed(2)}s of audio handle before its source in-point.`,
    );
  }
  const outgoingTail = outgoingSource.assetDuration -
    (outgoingSource.sourceStart + outgoingSource.sourceDuration);
  if (kind === "l-cut" && outgoingTail < duration) {
    throw new SplitEditPlanError(
      `“${pair.outgoing.name}” needs ${duration.toFixed(2)}s of audio handle after its source out-point.`,
    );
  }

  const takenIds = new Set(sequence.tracks.flatMap((track) => [track.id, ...track.elements.map(({ id }) => id)]));
  const existingAudioTrack = sequence.tracks.find((track) => track.kind === "audio" && !track.locked);
  const audioTrackId = existingAudioTrack?.id ?? nextId(takenIds, "track-split-audio");
  const operations: ProjectOperation[] = [];
  if (!existingAudioTrack) {
    const track: Track = {
      id: audioTrackId,
      name: "Split audio",
      kind: "audio",
      order: Math.max(-1, ...sequence.tracks.map(({ order }) => order)) + 1,
      locked: false,
      muted: false,
      hidden: false,
      elements: [],
    };
    operations.push({ type: "addTrack", sequenceId: sequence.id, track });
  }

  const outgoingAudioId = nextId(takenIds, `audio-${pair.outgoing.id}`);
  const incomingAudioId = nextId(takenIds, `audio-${pair.incoming.id}`);
  const makeAudio = (video: TimelineElement, id: string): TimelineElement => ({
    id,
    name: `${video.name} — split audio`,
    kind: "audio",
    assetId: video.assetId!,
    timelineRange: structuredClone(video.timelineRange),
    sourceRange: structuredClone(video.sourceRange!),
    properties: {
      ...copyAudioProperties(video),
      "audio.splitFromElementId": video.id,
    },
    keyframes: video.keyframes
      .filter(({ path }) => path.startsWith("audio."))
      .map((channel) => structuredClone(channel)),
  });
  const outgoingAudio = makeAudio(pair.outgoing, outgoingAudioId);
  const incomingAudio = makeAudio(pair.incoming, incomingAudioId);
  if (kind === "j-cut") {
    incomingAudio.timelineRange.start = secondsToTicks(
      ticksToSeconds(incomingAudio.timelineRange.start) - duration,
    );
    incomingAudio.timelineRange.duration = secondsToTicks(
      ticksToSeconds(incomingAudio.timelineRange.duration) + duration,
    );
    incomingAudio.sourceRange!.start = secondsToTicks(incomingSource.sourceStart - duration);
    incomingAudio.sourceRange!.duration = secondsToTicks(incomingSource.sourceDuration + duration);
  } else {
    outgoingAudio.timelineRange.duration = secondsToTicks(
      ticksToSeconds(outgoingAudio.timelineRange.duration) + duration,
    );
    outgoingAudio.sourceRange!.duration = secondsToTicks(outgoingSource.sourceDuration + duration);
  }
  incomingAudio.properties["edit.split.kind"] = kind;
  incomingAudio.properties["edit.split.peerElementId"] = outgoingAudio.id;
  incomingAudio.properties["edit.split.durationSeconds"] = duration;

  for (const video of [pair.outgoing, pair.incoming]) {
    const muted = structuredClone(video);
    muted.properties["audio.muted"] = true;
    muted.properties["audio.splitElementId"] = video.id === pair.outgoing.id
      ? outgoingAudio.id
      : incomingAudio.id;
    operations.push({ type: "replaceElement", elementId: video.id, element: muted });
  }
  operations.push(
    { type: "insertElement", trackId: audioTrackId, element: outgoingAudio },
    { type: "insertElement", trackId: audioTrackId, element: incomingAudio },
  );
  return operations;
};
