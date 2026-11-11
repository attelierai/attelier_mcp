import type { MediaTime, Project, ProjectOperation } from "@attelier/project-schema";
import { secondsToTicks, ticksToSeconds } from "@attelier/project-schema";
import { activeProjectSequence } from "@atte/kit/project-tool-utils";

export class ProjectToolCompositionError extends Error {}

const flattenElements = (project: Project) =>
  project.sequences.flatMap((sequence) =>
    sequence.tracks.flatMap((track) =>
      track.elements.map((element) => ({ sequence, track, element })),
    ),
  );

const ticksOf = (seconds: number): MediaTime => secondsToTicks(seconds);

/**
 * Infer a semantic text role from the copy so titles are born machine-legible
 * (the product-ad evaluator requires an editable CTA layer — an untagged "Shop now"
 * would otherwise trip `brand.no-cta`). CTA verbs/arrows → "cta"; everything else a
 * "headline". Callers can still override the role explicitly.
 */
const inferTextRole = (text: string): "cta" | "headline" => {
  const lower = text.toLowerCase();
  if (/→|›|»|➜|➔/.test(text)) return "cta";
  if (/\b(shop|buy|order|get|grab|download|install|sign ?up|subscribe|join|register|book|start|try|learn more|see more|swipe|tap|click|claim|comprar?|compra|consigue|descarga|reg[íi]strate|su[sb]cr[íi]bete|ap[uú]ntate|empieza|pru[eé]ba(?:lo)?|reserva|pide(?:lo)?)\b/.test(lower)) {
    return "cta";
  }
  return "headline";
};

/** Keep a title clear of image overlays that are active in the same window. */
export const safeTitlePosition = (
  project: Project,
  text: string,
  atSeconds: number,
  durationSeconds: number,
  fontSize: number,
  preferred: number[] = [0.5, 0.76],
): number[] => {
  const sequence = activeProjectSequence(project);
  if (!sequence) throw new ProjectToolCompositionError("This project has no active sequence.");
  const titleStart = Math.max(0, atSeconds);
  const titleEnd = titleStart + Math.max(0.5, durationSeconds);
  const titleWidth = Math.min(0.86, text.length * fontSize * 0.65 / sequence.canvas.width);
  const titleHeight = fontSize * 1.25 / sequence.canvas.height;
  const activeOverlays = sequence.tracks.flatMap(({ elements }) => elements).filter((element) => {
    if (element.kind !== "image") return false;
    // Full-bleed stills are backgrounds, not overlays. Treating them as logo
    // obstacles rejects every requested title position and collapses layout to
    // the centre. Small/PiP images remain protected.
    if (Number(element.properties["transform.scale"] ?? 1) > 0.5) return false;
    const start = ticksToSeconds(element.timelineRange.start);
    const end = start + ticksToSeconds(element.timelineRange.duration);
    return start < titleEnd && end > titleStart;
  });
  const candidates = [preferred, [0.5, 0.76], [0.5, 0.22], [0.5, 0.5]];
  return candidates.find(([x, y]) => activeOverlays.every((overlay) => {
    const position = Array.isArray(overlay.properties["transform.position"]) ? overlay.properties["transform.position"] as number[] : [0.5, 0.5];
    const width = Number(overlay.properties["transform.scale"] ?? 0.2);
    const height = width * sequence.canvas.width / sequence.canvas.height;
    return Math.abs(Number(x) - Number(position[0])) * 2 >= titleWidth + width + 0.04
      || Math.abs(Number(y) - Number(position[1])) * 2 >= titleHeight + height + 0.04;
  })) ?? [0.5, 0.5];
};

/** Operations that place a title at a point in time, creating the text track when missing. */
export const buildTitleOperations = (
  project: Project,
  text: string,
  atSeconds: number,
  durationSeconds = 4,
  // Track ids already created earlier in the same plan pass (but not yet in
  // `project`). Without this, two add_title calls in one plan both mint
  // "track-text" and the transaction fails with a duplicate id.
  reservedTrackIds?: Set<string>,
  style?: { color?: string; fontSize?: number; position?: number[] },
): ProjectOperation[] => {
  const sequence = activeProjectSequence(project);
  if (!sequence) throw new ProjectToolCompositionError("This project has no active sequence.");
  const fontSize = style?.fontSize ?? 72;
  const preferredPosition = Array.isArray(style?.position) && style.position.length === 2 ? style.position : undefined;
  const titlePosition = safeTitlePosition(project, text, atSeconds, durationSeconds, fontSize, preferredPosition);
  const existing = sequence.tracks.find((track) => track.kind === "text" && !track.locked);
  const operations: ProjectOperation[] = [];
  let trackId = existing?.id;
  if (trackId) {
    // A title track exists already (or was created earlier in this pass) — reuse it.
    reservedTrackIds?.add(trackId);
  } else {
    trackId = "track-text";
    const taken = new Set([...sequence.tracks.map((track) => track.id), ...(reservedTrackIds ?? [])]);
    let suffix = 1;
    while (taken.has(trackId)) trackId = `track-text-${++suffix}`;
    reservedTrackIds?.add(trackId);
    operations.push({
      type: "addTrack",
      sequenceId: sequence.id,
      track: {
        id: trackId,
        name: "Titles",
        kind: "text",
        order: Math.max(-1, ...sequence.tracks.map((track) => track.order)) + 1,
        locked: false,
        muted: false,
        hidden: false,
        elements: [],
      },
    });
  }
  operations.push({
    type: "insertElement",
    trackId,
    element: {
      id: `text-${crypto.randomUUID()}`,
      name: text,
      kind: "text",
      timelineRange: {
        start: ticksOf(Math.max(0, atSeconds)),
        duration: ticksOf(Math.max(0.5, durationSeconds)),
      },
      properties: {
        "text.content": text,
        "text.role": inferTextRole(text),
        "style.color": style?.color ?? "#ffffff",
        "style.fontSize": fontSize,
        "effect.text.id": "atelier.text.readable-overlay",
        "effect.text.version": 1,
        "transform.opacity": 1,
        "transform.rotation": 0,
        "transform.scale": 1,
        // True lower-third by default: y=0.76 sits visibly below centre in 9:16
        // while staying clear of the bottom-22% band (caption/handle/progress)
        // and the top band (username/close) on TikTok/Reels/Shorts.
        "transform.position": titlePosition,
      },
      keyframes: [],
    },
  });
  return operations;
};

export type ExistingAssetPlacement = {
  assetId: string;
  atSeconds: number;
  durationSeconds?: number;
  audioRole?: "voiceover" | "music" | "dialogue" | "sound_effect";
  gainDb?: number;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
};

/** Place supplied project media on an editable track; no provider call is involved. */
export const buildExistingAssetPlacementOperations = (
  project: Project,
  placement: ExistingAssetPlacement,
  reservedTrackIds: Set<string> = new Set(),
): ProjectOperation[] => {
  const sequence = activeProjectSequence(project);
  if (!sequence) throw new ProjectToolCompositionError("This project has no active sequence.");
  const asset = project.assets.find(({ id }) => id === placement.assetId);
  if (!asset) throw new ProjectToolCompositionError(`Unknown asset_id "${placement.assetId}".`);
  if (asset.mediaType !== "audio" && asset.mediaType !== "video" && asset.mediaType !== "image") {
    throw new ProjectToolCompositionError("Only audio, video or image assets can be placed on the timeline.");
  }
  const kind = asset.mediaType;
  const trackKind = kind === "audio" ? "audio" : "video";
  const sourceDuration = asset.duration ? ticksToSeconds(asset.duration) : undefined;
  const durationSeconds = placement.durationSeconds ?? sourceDuration;
  if (durationSeconds === undefined || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new ProjectToolCompositionError("The asset has no usable duration; pass duration_seconds explicitly.");
  }
  if (sourceDuration !== undefined && durationSeconds > sourceDuration + 0.001 && kind !== "image") {
    throw new ProjectToolCompositionError(`duration_seconds exceeds the ${sourceDuration.toFixed(3)}s source duration.`);
  }
  if (!Number.isFinite(placement.atSeconds) || placement.atSeconds < 0) {
    throw new ProjectToolCompositionError("at_seconds must be zero or positive.");
  }
  const operations: ProjectOperation[] = [];
  // Audio lanes are chosen by role, not by "the first audio track". Stacking a
  // voiceover, a music bed and a sound effect on one lane at 0s is what the
  // creator sees as a broken mix, and it hides every later level decision.
  const audioRole = kind === "audio" ? placement.audioRole ?? "dialogue" : undefined;
  const audioLaneName = audioRole === "music"
    ? "Music"
    : audioRole === "sound_effect" ? "Sound" : "Dialogue";
  const laneMatches = (candidate: { kind: string; name: string; locked: boolean }): boolean =>
    candidate.kind === trackKind
    && !candidate.locked
    && (trackKind !== "audio" || candidate.name.trim().toLowerCase() === audioLaneName.toLowerCase());
  const track = sequence.tracks.find(laneMatches);
  let trackId = track?.id;
  if (!trackId) {
    const taken = new Set([...sequence.tracks.map(({ id }) => id), ...reservedTrackIds]);
    trackId = trackKind === "audio" ? `track-audio-${audioLaneName.toLowerCase()}` : `track-${trackKind}`;
    if (!reservedTrackIds.has(trackId)) {
      const base = trackId;
      let suffix = 1;
      while (taken.has(trackId)) trackId = `${base}-${++suffix}`;
      reservedTrackIds.add(trackId);
      operations.push({
        type: "addTrack",
        sequenceId: sequence.id,
        track: {
          id: trackId,
          name: trackKind === "audio" ? audioLaneName : "Video",
          kind: trackKind,
          order: Math.max(-1, ...sequence.tracks.map(({ order }) => order)) + 1,
          locked: false,
          muted: false,
          hidden: false,
          elements: [],
        },
      });
    }
  }
  const existingIds = new Set(flattenElements(project).map(({ element }) => element.id));
  let elementId = asset.id;
  if (existingIds.has(elementId)) elementId = `${asset.id}-${crypto.randomUUID()}`;
  const properties: Record<string, unknown> = {};
  if (kind === "audio") {
    properties["audio.role"] = audioRole!;
    properties["effect.audio.id"] = "atelier.audio.professional-mix";
    properties["effect.audio.version"] = 1;
    if (audioRole === "dialogue") properties["audio.cleanup"] = true;
    if (placement.gainDb !== undefined) properties["audio.gainDb"] = placement.gainDb;
    if (placement.fadeInSeconds !== undefined) properties["audio.fadeInSeconds"] = placement.fadeInSeconds;
    if (placement.fadeOutSeconds !== undefined) properties["audio.fadeOutSeconds"] = placement.fadeOutSeconds;
  }
  operations.push({
    type: "insertElement",
    trackId,
    element: {
      id: elementId,
      name: asset.name,
      kind,
      assetId: asset.id,
      timelineRange: { start: ticksOf(placement.atSeconds), duration: ticksOf(durationSeconds) },
      ...(kind === "image" ? {} : { sourceRange: { start: ticksOf(0), duration: ticksOf(durationSeconds) } }),
      properties,
      keyframes: [],
    },
  });
  return operations;
};
