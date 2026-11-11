import type {
  ElementKind,
  MediaTime,
  Project,
  ProjectOperation,
  TimelineElement,
  Track,
  TrackKind,
} from "@attelier/project-schema";

export class SourceEditError extends Error {}

export type SourceEditRequest = {
  assetId: string;
  sourceRange: { start: MediaTime; duration: MediaTime };
  timelineStart: MediaTime;
  mode: "insert" | "overwrite";
  idPrefix: string;
  targetTrackId?: string;
};

export type SourceEditPlan = {
  sequenceId: string;
  trackId: string;
  elementId: string;
  operations: ProjectOperation[];
};

const compatibility = (mediaType: string): { track: TrackKind; element: ElementKind } | undefined => {
  if (mediaType === "video") return { track: "video", element: "video" };
  if (mediaType === "image") return { track: "video", element: "image" };
  if (mediaType === "audio") return { track: "audio", element: "audio" };
  return undefined;
};

const positiveTicks = (value: MediaTime, label: string): number => {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    throw new SourceEditError(`${label} must be a positive exact media time.`);
  }
  return numeric;
};

const nonNegativeTicks = (value: MediaTime, label: string): number => {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new SourceEditError(`${label} must be a non-negative exact media time.`);
  }
  return numeric;
};

const trackAccepts = (track: Track, kind: TrackKind): boolean =>
  track.kind === kind && !track.locked;

/**
 * Compile an exact three-point source edit into the project core operation.
 * This module is UI-independent so terminal, API, MCP and Studio callers all
 * share the same source-range and target-track rules.
 */
export const compileSourceEdit = (
  project: Project,
  request: SourceEditRequest,
): SourceEditPlan => {
  const sequence = project.sequences.find(({ id }) => id === project.activeSequenceId);
  if (!sequence) throw new SourceEditError(`Active sequence ${project.activeSequenceId} is missing.`);
  const asset = project.assets.find(({ id }) => id === request.assetId);
  if (!asset) throw new SourceEditError(`Unknown asset ${request.assetId}.`);
  const compatible = compatibility(asset.mediaType);
  if (!compatible) throw new SourceEditError(`${asset.mediaType} assets cannot be source-edited.`);
  if (!request.idPrefix.trim()) throw new SourceEditError("idPrefix is required.");

  const sourceStart = nonNegativeTicks(request.sourceRange.start, "sourceRange.start");
  const sourceDuration = positiveTicks(request.sourceRange.duration, "sourceRange.duration");
  nonNegativeTicks(request.timelineStart, "timelineStart");
  if (
    asset.mediaType !== "image" &&
    asset.duration !== undefined &&
    sourceStart + sourceDuration > Number(asset.duration)
  ) {
    throw new SourceEditError("The selected source range exceeds the asset duration.");
  }

  const operations: ProjectOperation[] = [];
  let track = request.targetTrackId
    ? sequence.tracks.find(({ id }) => id === request.targetTrackId)
    : sequence.tracks
      .filter((candidate) => trackAccepts(candidate, compatible.track))
      .sort((left, right) => left.order - right.order)[0];
  if (track && !trackAccepts(track, compatible.track)) {
    throw new SourceEditError(`Track ${track.id} is locked or incompatible with ${asset.mediaType}.`);
  }
  if (request.targetTrackId && !track) {
    throw new SourceEditError(`Target track ${request.targetTrackId} does not exist.`);
  }
  if (!track) {
    const trackId = `${request.idPrefix}-track`;
    if (sequence.tracks.some(({ id }) => id === trackId)) {
      throw new SourceEditError(`Generated track id ${trackId} already exists.`);
    }
    track = {
      id: trackId,
      name: compatible.track === "audio" ? "Audio" : "Video",
      kind: compatible.track,
      order: Math.max(-1, ...sequence.tracks.map(({ order }) => order)) + 1,
      locked: false,
      muted: false,
      hidden: false,
      elements: [],
    };
    operations.push({ type: "addTrack", sequenceId: sequence.id, track });
  }

  const elementId = `${request.idPrefix}-element`;
  if (sequence.tracks.some(({ elements }) => elements.some(({ id }) => id === elementId))) {
    throw new SourceEditError(`Generated element id ${elementId} already exists.`);
  }
  const element: TimelineElement = {
    id: elementId,
    name: asset.name,
    kind: compatible.element,
    assetId: asset.id,
    timelineRange: {
      start: request.timelineStart,
      duration: request.sourceRange.duration,
    },
    ...(asset.mediaType === "image" ? {} : { sourceRange: request.sourceRange }),
    properties: asset.mediaType === "video" || asset.mediaType === "image"
      ? { "transform.fit": "contain" }
      : {},
    keyframes: [],
  };
  operations.push({
    type: "insertOverwrite",
    trackId: track.id,
    element,
    mode: request.mode,
    generatedIdPrefix: `${request.idPrefix}-split`,
  });
  return {
    sequenceId: sequence.id,
    trackId: track.id,
    elementId,
    operations,
  };
};
