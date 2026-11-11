import type { Project, ProjectOperation, TimelineElement } from "@attelier/project-schema";
import { referencedFontAssetId, secondsToTicks, ticksToSeconds } from "@attelier/project-schema";

/** One transcript word, in SOURCE seconds of the asset it belongs to. The
 * critic never reads analysis storage itself; the caller supplies whatever
 * transcripts it already has, so the same rules run in the API, the CLI and
 * the browser. */
export type CriticSpeechWord = {
  text: string;
  startSeconds: number;
  endSeconds: number;
};

export type CriticSpeechSource = {
  assetId: string;
  words: readonly CriticSpeechWord[];
};

export type ProjectCriticContext = {
  speech?: readonly CriticSpeechSource[];
  qualityProfile?: string;
};

export type ProjectCriticIssue = {
  severity: "error" | "warning";
  code:
    | "transition_missing_overlap"
    | "title_overlay_collision"
    | "duplicate_overlay"
    | "asset_not_publishable"
    | "font_asset_missing"
    | "asset_resolution_low"
    | "primary_visual_too_small"
    | "duplicate_voiceover"
    | "primary_visual_reused"
    | "vertical_canvas_not_filled"
    | "portrait_proof_unreadable"
    | "logo_resolution_low"
    | "title_outside_safe_area"
    | "static_tail"
    | "voice_ends_too_late"
    | "narration_visual_gap"
    | "mechanical_pacing"
    | "repeated_motion_preset"
    | "style_drift"
    | "voice_on_cut"
    | "cut_mid_word"
    | "repeated_line"
    | "background_carries_video";
  elementIds: string[];
  message: string;
};

/** A cut lands "on" a boundary within one frame of the fastest common rate;
 * anything closer than this is exact-time rounding, not a mistake. */
const CUT_TOLERANCE_SECONDS = 1 / 24;

const elementRate = (element: TimelineElement): number => {
  const rate = element.properties["playback.rate"];
  return typeof rate === "number" && Number.isFinite(rate) ? Math.max(0.25, Math.min(4, rate)) : 1;
};

const normalizeSpokenWord = (text: string): string =>
  text.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, "");

type SourceWindow = { startSeconds: number; endSeconds: number };

const sourceWindow = (element: TimelineElement): SourceWindow | undefined => {
  if (!element.sourceRange) return undefined;
  const start = ticksToSeconds(element.sourceRange.start);
  return { startSeconds: start, endSeconds: start + ticksToSeconds(element.sourceRange.duration) };
};

/** Timeline second at which a source second of this element is heard. */
const toTimelineSeconds = (element: TimelineElement, sourceSeconds: number): number => {
  const window = sourceWindow(element);
  if (!window) return ticksToSeconds(element.timelineRange.start);
  return ticksToSeconds(element.timelineRange.start) + (sourceSeconds - window.startSeconds) / elementRate(element);
};

/** Elements in timeline order, per track, so "the next clip" is well defined. */
const orderedTracks = (project: Project): TimelineElement[][] =>
  project.sequences.flatMap((sequence) =>
    sequence.tracks.map((track) =>
      [...track.elements].sort(
        (left, right) => ticksToSeconds(left.timelineRange.start) - ticksToSeconds(right.timelineRange.start),
      ),
    ),
  );

/** Two placements of the same asset whose source windows join edge to edge are
 * one continuous performance split for editing convenience. The join is not a
 * cut and speech running across it was never interrupted. */
const isContinuationOf = (previous: TimelineElement, next: TimelineElement): boolean => {
  if (!previous.assetId || previous.assetId !== next.assetId) return false;
  const left = sourceWindow(previous);
  const right = sourceWindow(next);
  if (!left || !right) return false;
  const timelineJoined = Math.abs(
    ticksToSeconds(previous.timelineRange.start) + ticksToSeconds(previous.timelineRange.duration)
      - ticksToSeconds(next.timelineRange.start),
  ) < CUT_TOLERANCE_SECONDS;
  return timelineJoined && Math.abs(left.endSeconds - right.startSeconds) < CUT_TOLERANCE_SECONDS;
};

export type MidWordCut = {
  elementId: string;
  /** `in` — the clip starts partway through a word already in progress.
   *  `out` — the clip is cut away partway through a word still being said. */
  edge: "in" | "out";
  atSeconds: number;
  sourceSeconds: number;
  word: string;
  wordStartSeconds: number;
  wordEndSeconds: number;
  /** Seconds of the word that survive (`in`) or are lost (`out`). */
  clippedSeconds: number;
};

/**
 * Cuts that land inside a spoken word.
 *
 * This is the defect an editor hears immediately and a waveform hides: the
 * outgoing clip is cut away mid-syllable, or the incoming clip opens on the
 * tail of a word whose start was left behind. It is checked against the source
 * in/out points, never against timeline position, because that is where the
 * decision was actually made.
 */
export const findMidWordCuts = (
  project: Project,
  speech: readonly CriticSpeechSource[],
): MidWordCut[] => {
  const wordsByAsset = new Map(speech.map((source) => [source.assetId, source.words]));
  const cuts: MidWordCut[] = [];
  for (const elements of orderedTracks(project)) {
    elements.forEach((element, index) => {
      if (!element.assetId || element.properties["audio.muted"] === true) return;
      const words = wordsByAsset.get(element.assetId);
      const window = sourceWindow(element);
      if (!words?.length || !window) return;
      const previous = elements[index - 1];
      const next = elements[index + 1];
      const edges: Array<{ edge: "in" | "out"; sourceSeconds: number }> = [];
      if (!(previous && isContinuationOf(previous, element))) {
        edges.push({ edge: "in", sourceSeconds: window.startSeconds });
      }
      if (!(next && isContinuationOf(element, next))) {
        edges.push({ edge: "out", sourceSeconds: window.endSeconds });
      }
      for (const { edge, sourceSeconds } of edges) {
        for (const word of words) {
          if (
            sourceSeconds <= word.startSeconds + CUT_TOLERANCE_SECONDS ||
            sourceSeconds >= word.endSeconds - CUT_TOLERANCE_SECONDS
          ) continue;
          cuts.push({
            elementId: element.id,
            edge,
            atSeconds: Number(toTimelineSeconds(element, sourceSeconds).toFixed(3)),
            sourceSeconds: Number(sourceSeconds.toFixed(3)),
            word: word.text,
            wordStartSeconds: Number(word.startSeconds.toFixed(3)),
            wordEndSeconds: Number(word.endSeconds.toFixed(3)),
            clippedSeconds: Number(
              (edge === "out" ? word.endSeconds - sourceSeconds : sourceSeconds - word.startSeconds).toFixed(3),
            ),
          });
          break;
        }
      }
    });
  }
  return cuts;
};

export type RepeatedLine = {
  elementIds: [string, string];
  atSeconds: number;
  text: string;
  firstAtSeconds: number;
  secondAtSeconds: number;
  gapSeconds: number;
};

/**
 * The same words said twice across one cut.
 *
 * Assembling from overlapping selects leaves the tail of the outgoing take and
 * the head of the incoming take carrying the same phrase, so the speaker
 * appears to stutter across the edit. Only adjacent clips are compared, and
 * only phrases of at least two words, so an ordinary repeated article is not a
 * finding.
 */
export const findRepeatedLines = (
  project: Project,
  speech: readonly CriticSpeechSource[],
  withinSeconds = 3,
): RepeatedLine[] => {
  const wordsByAsset = new Map(speech.map((source) => [source.assetId, source.words]));
  const spokenWithin = (element: TimelineElement) => {
    const window = sourceWindow(element);
    const words = element.assetId ? wordsByAsset.get(element.assetId) : undefined;
    if (!window || !words) return [];
    return words
      .filter((word) => word.startSeconds >= window.startSeconds - CUT_TOLERANCE_SECONDS
        && word.endSeconds <= window.endSeconds + CUT_TOLERANCE_SECONDS)
      .map((word) => ({
        normalized: normalizeSpokenWord(word.text),
        text: word.text,
        atSeconds: toTimelineSeconds(element, word.startSeconds),
      }))
      .filter((word) => word.normalized.length > 0);
  };
  const found: RepeatedLine[] = [];
  const WINDOW_WORDS = 8;
  const MINIMUM_PHRASE_WORDS = 2;
  for (const elements of orderedTracks(project)) {
    for (let index = 0; index + 1 < elements.length; index += 1) {
      const outgoing = elements[index]!;
      const incoming = elements[index + 1]!;
      if (outgoing.properties["audio.muted"] === true || incoming.properties["audio.muted"] === true) continue;
      if (isContinuationOf(outgoing, incoming)) continue;
      const tail = spokenWithin(outgoing).slice(-WINDOW_WORDS);
      const head = spokenWithin(incoming).slice(0, WINDOW_WORDS);
      let best: RepeatedLine | undefined;
      for (let left = 0; left < tail.length; left += 1) {
        for (let right = 0; right < head.length; right += 1) {
          let length = 0;
          while (
            left + length < tail.length && right + length < head.length &&
            tail[left + length]!.normalized === head[right + length]!.normalized
          ) length += 1;
          if (length < MINIMUM_PHRASE_WORDS) continue;
          const firstAt = tail[left]!.atSeconds;
          const secondAt = head[right]!.atSeconds;
          const gap = secondAt - firstAt;
          if (gap < 0 || gap > withinSeconds) continue;
          const candidate: RepeatedLine = {
            elementIds: [outgoing.id, incoming.id],
            atSeconds: Number(secondAt.toFixed(3)),
            text: tail.slice(left, left + length).map((word) => word.text).join(" "),
            firstAtSeconds: Number(firstAt.toFixed(3)),
            secondAtSeconds: Number(secondAt.toFixed(3)),
            gapSeconds: Number(gap.toFixed(3)),
          };
          if (!best || candidate.text.length > best.text.length) best = candidate;
        }
      }
      if (best) found.push(best);
    }
  }
  return found;
};

const activeTogether = (left: TimelineElement, right: TimelineElement): boolean => {
  const leftStart = ticksToSeconds(left.timelineRange.start);
  const rightStart = ticksToSeconds(right.timelineRange.start);
  return leftStart < rightStart + ticksToSeconds(right.timelineRange.duration)
    && rightStart < leftStart + ticksToSeconds(left.timelineRange.duration);
};

export const critiqueProjectDeterministically = (
  project: Project,
  context: ProjectCriticContext = {},
): ProjectCriticIssue[] => {
  const issues: ProjectCriticIssue[] = [];
  const documentary = context.qualityProfile === "documentary-v1";
  const productAd = context.qualityProfile === "product-ad-v1";
  // Speech-aware checks are warnings, never export blockers: a mid-word cut can
  // be a deliberate hard cut, and only the editor knows which.
  for (const cut of findMidWordCuts(project, context.speech ?? [])) {
    issues.push({
      severity: "warning",
      code: "cut_mid_word",
      elementIds: [cut.elementId],
      message: cut.edge === "out"
        ? `Clip ${cut.elementId} is cut away ${cut.clippedSeconds.toFixed(2)}s into “${cut.word}” (${cut.atSeconds.toFixed(2)}s). Extend the out-point to ${cut.wordEndSeconds.toFixed(2)}s of the source, or move the cut before ${cut.wordStartSeconds.toFixed(2)}s.`
        : `Clip ${cut.elementId} starts ${cut.clippedSeconds.toFixed(2)}s inside “${cut.word}” (${cut.atSeconds.toFixed(2)}s), so the word is heard half-said. Move the in-point back to ${cut.wordStartSeconds.toFixed(2)}s of the source, or past ${cut.wordEndSeconds.toFixed(2)}s.`,
    });
  }
  for (const repeat of findRepeatedLines(project, context.speech ?? [])) {
    issues.push({
      severity: "warning",
      code: "repeated_line",
      elementIds: [...repeat.elementIds],
      message: `“${repeat.text}” is said twice ${repeat.gapSeconds.toFixed(2)}s apart across the cut at ${repeat.atSeconds.toFixed(2)}s. Trim the tail of ${repeat.elementIds[0]} or the head of ${repeat.elementIds[1]} so the line lands once.`,
    });
  }
  for (const sequence of project.sequences) {
    const elements = sequence.tracks.flatMap(({ elements: trackElements }) => trackElements);
    const assets = new Map(project.assets.map((asset) => [asset.id, asset]));
    const byId = new Map(elements.map((element) => [element.id, element]));
    for (const outgoing of elements) {
      const incomingId = outgoing.properties["transition.out.toElementId"];
      const duration = Number(outgoing.properties["transition.out.durationSeconds"] ?? 0);
      if (typeof incomingId !== "string" || duration <= 0) continue;
      const incoming = byId.get(incomingId);
      const overlap = incoming
        ? ticksToSeconds(outgoing.timelineRange.start) + ticksToSeconds(outgoing.timelineRange.duration) - ticksToSeconds(incoming.timelineRange.start)
        : 0;
      if (!incoming || overlap < duration - 0.02) issues.push({
        severity: "error",
        code: "transition_missing_overlap",
        elementIds: [outgoing.id, incomingId],
        message: `Transition ${outgoing.id} → ${incomingId} needs ${duration.toFixed(2)}s overlap but has ${Math.max(0, overlap).toFixed(2)}s. Use apply_transition on the adjacent clips; do not trim away its ripple overlap.`,
      });
    }

    const overlays = elements.filter((element) => {
      if (element.kind !== "image") return false;
      const asset = element.assetId ? assets.get(element.assetId) : undefined;
      const scale = Number(element.properties["transform.scale"] ?? 1);
      return (
        scale < 0.5 ||
        /logo|icon|mark|overlay/i.test(`${asset?.name ?? ""} ${element.name}`)
      );
    });
    const titles = elements.filter((element) => element.kind === "text");
    const textElements = elements.filter((element) => element.kind === "text" || element.kind === "caption");
    const visuals = elements.filter((element) => element.kind === "image" || element.kind === "video");
    const assetUses = new Map<string, TimelineElement[]>();
    for (const text of textElements) {
      const fontAssetId = referencedFontAssetId(text.properties);
      if (!fontAssetId) continue;
      const font = assets.get(fontAssetId);
      if (!font || font.mediaType !== "font") {
        issues.push({
          severity: "error",
          code: "font_asset_missing",
          elementIds: [text.id],
          message: `${text.name} references a missing project font. Choose an available font or restore the font asset.`,
        });
      } else if (font.provenance?.rights?.publishable === false) {
        issues.push({
          severity: "error",
          code: "asset_not_publishable",
          elementIds: [text.id],
          message: `${font.name} is not cleared for publication or embedding. Verify its font license or choose a cleared font.`,
        });
      }
    }
    for (const visual of visuals) {
      if (!visual.assetId) continue;
      assetUses.set(visual.assetId, [...(assetUses.get(visual.assetId) ?? []), visual]);
      const asset = assets.get(visual.assetId);
      if (asset?.provenance?.rights?.publishable === false) issues.push({
        severity: "error", code: "asset_not_publishable", elementIds: [visual.id],
        message: `${visual.name} is not cleared for publication. Replace it with an owned, licensed or generated asset.`,
      });
      if (asset?.width && asset?.height) {
        const scale = Number(visual.properties["transform.scale"] ?? 1);
        const overlayLike = scale < 0.5 || /logo|icon|mark|overlay/i.test(`${asset.name} ${visual.name}`);
        if (overlayLike && /logo|icon|mark/i.test(`${asset.name} ${visual.name}`) && (
          Math.min(asset.width, asset.height) < 128 || asset.width * asset.height < 16_384
        )) issues.push({
          severity: "error", code: "logo_resolution_low", elementIds: [visual.id],
          message: `${visual.name} is only ${asset.width}×${asset.height}. Use a real high-resolution logo (at least 128 px on its shortest side) or omit the mark; never promote a favicon into the video.`,
        });
        if (!overlayLike && asset.width * asset.height < 230_400) issues.push({
          severity: "error", code: "primary_visual_too_small", elementIds: [visual.id],
          message: `${visual.name} is only ${asset.width}×${asset.height}; a thumbnail, icon or favicon cannot be enlarged into a primary shot.`,
        });
        const requiredWidth = sequence.canvas.width / Math.max(0.01, scale);
        const requiredHeight = sequence.canvas.height / Math.max(0.01, scale);
        if (!overlayLike && (asset.width < requiredWidth * 0.72 || asset.height < requiredHeight * 0.72)) issues.push({
          severity: "warning", code: "asset_resolution_low", elementIds: [visual.id],
          message: `${visual.name} (${asset.width}×${asset.height}) is undersized for the ${sequence.canvas.width}×${sequence.canvas.height} frame at its current scale.`,
        });
        const canvasAspect = sequence.canvas.width / sequence.canvas.height;
        const crop = Array.isArray(visual.properties["transform.crop"])
          ? visual.properties["transform.crop"] as number[]
          : [0, 0, 0, 0];
        const croppedWidth = asset.width * Math.max(0.01, 1 - Number(crop[0] ?? 0) - Number(crop[2] ?? 0));
        const croppedHeight = asset.height * Math.max(0.01, 1 - Number(crop[1] ?? 0) - Number(crop[3] ?? 0));
        const assetAspect = croppedWidth / croppedHeight;
        const vertical = canvasAspect < 0.8;
        const fit = visual.properties["transform.fit"];
        const coverScale = Math.max(canvasAspect / assetAspect, assetAspect / canvasAspect);
        const containHeightFraction = assetAspect > canvasAspect
          ? canvasAspect / assetAspect * scale
          : scale;
        const isScreenProof = visual.properties["media.fitness"] === "portrait-proof-panel"
          || visual.properties["media.fitness"] === "portrait-detail-crop"
          || visual.properties["creative.treatment"] === "screen_proof";
        if (vertical && isScreenProof && assetAspect > 1.15 && fit !== "cover" && containHeightFraction < 0.42) issues.push({
          severity: "error", code: "portrait_proof_unreadable", elementIds: [visual.id],
          message: `${visual.name} occupies only about ${Math.round(containHeightFraction * 100)}% of the portrait frame height, so product UI will not be readable on a phone. Use a responsive/mobile capture or an evidence-bound detail crop in a designed portrait composition; never stretch the source.`,
        });
        const hasDesignedBackground = visuals.some((candidate) => {
          if (candidate.id === visual.id || !activeTogether(candidate, visual)) return false;
          const candidateAsset = candidate.assetId ? assets.get(candidate.assetId) : undefined;
          const candidateScale = Number(candidate.properties["transform.scale"] ?? 1);
          const candidateFit = candidate.properties["transform.fit"];
          return candidate.properties["visual.role"] === "background" || candidate.name.toLowerCase().includes("background") || Boolean(
            candidateAsset?.width && candidateAsset.height && candidateAsset.height >= candidateAsset.width &&
            (candidateFit === "cover" || candidateScale >= 0.9),
          );
        });
        if (vertical && !overlayLike && fit !== "cover" && scale < coverScale - 0.03 && !hasDesignedBackground) issues.push({
          severity: "error", code: "vertical_canvas_not_filled", elementIds: [visual.id],
          message: `${visual.name} leaves unused canvas in the vertical edit. Use cover framing or a purpose-built portrait source.`,
        });
      }
    }
    const voices = elements.filter((element) => element.kind === "audio" && (
      element.properties["audio.role"] === "voiceover" || typeof element.properties["voice.transcript"] === "string"
    ));
    for (let left = 0; left < voices.length; left += 1) {
      for (let right = left + 1; right < voices.length; right += 1) {
        if (!activeTogether(voices[left]!, voices[right]!)) continue;
        issues.push({
          severity: "error",
          code: "duplicate_voiceover",
          elementIds: [voices[left]!.id, voices[right]!.id],
          message: `Voiceovers ${voices[left]!.name} and ${voices[right]!.name} overlap. Keep exactly one narration performance unless explicit dialogue was requested.`,
        });
      }
    }
    for (const [assetId, uses] of assetUses) {
      const primaryUses = uses.filter((element) => Number(element.properties["transform.scale"] ?? 1) >= 0.7);
      if (primaryUses.length > 1 && !primaryUses.every((element) => element.properties["product.bookend"] === true)) issues.push({
        severity: "warning", code: "primary_visual_reused", elementIds: primaryUses.map(({ id }) => id),
        message: `Primary visual ${assetId} is reused across ${primaryUses.length} shots. Give each argument beat distinct evidence unless this is an intentional bookend.`,
      });
    }
    const visualShotIds = new Set(visuals.map((element) => element.properties["product.shotId"]).filter((value): value is string => typeof value === "string"));
    for (const title of productAd ? titles : []) {
      const role = title.properties["text.role"];
      const shotId = title.properties["product.shotId"];
      if (["headline", "proof", "cta"].includes(String(role)) && (typeof shotId !== "string" || !visualShotIds.has(shotId))) issues.push({
        severity: "error", code: "narration_visual_gap", elementIds: [title.id],
        message: `${String(role)} beat “${String(title.properties["text.content"] ?? title.name)}” has no bound visual proof interval.`,
      });
    }
    for (const title of titles) {
      const text = String(title.properties["text.content"] ?? title.name);
      const fontSize = Number(title.properties["style.fontSize"] ?? 72);
      const titlePosition = Array.isArray(title.properties["transform.position"]) ? title.properties["transform.position"] as number[] : [0.5, 0.76];
      const titleWidth = Math.min(0.86, text.length * fontSize * 0.65 / sequence.canvas.width);
      const titleHeight = fontSize * 1.25 / sequence.canvas.height;
      const x = Number(titlePosition[0]);
      const y = Number(titlePosition[1]);
      // `text.align` anchors the authored x on the text edge instead of its centre.
      const align = title.properties["text.align"];
      const left = align === "left" ? x : align === "right" ? x - titleWidth : x - titleWidth / 2;
      const right = left + titleWidth;
      const safe = documentary
        ? { left: 0.05, right: 0.95, top: 0.05, bottom: 0.95 }
        : { left: 0.06, right: 0.94, top: 0.08, bottom: 0.88 };
      if (left < safe.left || right > safe.right || y - titleHeight / 2 < safe.top || y + titleHeight / 2 > safe.bottom) issues.push({
        severity: "error", code: "title_outside_safe_area", elementIds: [title.id],
        message: documentary
          ? `Title ${title.id} falls outside the 5% documentary delivery-safe area. Reposition or shorten it.`
          : `Title ${title.id} falls outside the 6% horizontal / 8–12% vertical delivery-safe area. Reposition or shorten it.`,
      });
      for (const overlay of overlays) {
        if (!activeTogether(title, overlay)) continue;
        const overlayPosition = Array.isArray(overlay.properties["transform.position"]) ? overlay.properties["transform.position"] as number[] : [0.5, 0.5];
        const overlayWidth = Number(overlay.properties["transform.scale"] ?? 0.2);
        const overlayHeight = overlayWidth * sequence.canvas.width / sequence.canvas.height;
        const collision = Math.abs(Number(titlePosition[0]) - Number(overlayPosition[0])) * 2 < titleWidth + overlayWidth + 0.04
          && Math.abs(Number(titlePosition[1]) - Number(overlayPosition[1])) * 2 < titleHeight + overlayHeight + 0.04;
        if (collision) issues.push({
          severity: "error",
          code: "title_overlay_collision",
          elementIds: [title.id, overlay.id],
          message: `Title ${title.id} overlaps image overlay ${overlay.id}. Move the title to a clear safe area before polishing or exporting.`,
        });
      }
    }

    for (let left = 0; left < overlays.length; left += 1) {
      for (let right = left + 1; right < overlays.length; right += 1) {
        const a = overlays[left]!;
        const b = overlays[right]!;
        if (a.assetId && a.assetId === b.assetId && activeTogether(a, b)) issues.push({
          severity: "warning",
          code: "duplicate_overlay",
          elementIds: [a.id, b.id],
          message: `The same overlay asset ${a.assetId} appears twice during the same time window. Remove the unintended duplicate.`,
        });
      }
    }

    const sequenceEnd = Math.max(0, ...elements.map((element) => ticksToSeconds(element.timelineRange.start) + ticksToSeconds(element.timelineRange.duration)));
    for (const visual of visuals) {
      const start = ticksToSeconds(visual.timelineRange.start);
      const duration = ticksToSeconds(visual.timelineRange.duration);
      const endsAtCut = Math.abs(start + duration - sequenceEnd) < 0.08;
      const hasMotion = visual.keyframes.some((channel) => channel.path.startsWith("transform."));
      if (endsAtCut && duration > 4 && Number(visual.properties["transform.scale"] ?? 1) >= 0.7 && !hasMotion) issues.push({
        severity: "warning", code: "static_tail", elementIds: [visual.id],
        message: `The final visual holds motionless for ${duration.toFixed(1)}s. Add a restrained push, crop change or shorter CTA hold.`,
      });
    }
    /* A solid canvas background is scaffolding, not footage. If most of the
       piece shows only the background (no real shot above it), the "video" is
       text cards on a color — flag it before anyone pays to render that. */
    const backgrounds = visuals.filter((element) => {
      const asset = element.assetId ? assets.get(element.assetId) : undefined;
      return asset?.provenance?.provider === "local-canvas";
    });
    if (backgrounds.length > 0) {
      const realShots = visuals.filter((element) => !backgrounds.includes(element) && Number(element.properties["transform.scale"] ?? 1) >= 0.7);
      const step = 0.25;
      let bareSeconds = 0;
      for (let at = 0; at < sequenceEnd; at += step) {
        const covered = (list: TimelineElement[]) => list.some((element) => {
          const start = ticksToSeconds(element.timelineRange.start);
          return at >= start && at < start + ticksToSeconds(element.timelineRange.duration);
        });
        if (covered(backgrounds) && !covered(realShots)) bareSeconds += step;
      }
      if (sequenceEnd > 0 && bareSeconds / sequenceEnd > 0.35) issues.push({
        severity: "error", code: "background_carries_video", elementIds: backgrounds.map(({ id }) => id),
        message: `${bareSeconds.toFixed(1)}s of ${sequenceEnd.toFixed(1)}s show only a solid background with no real footage. Source stock or generated shots for those beats — text cards on a color are not a commercial.`,
      });
    }
    /* Style drift: primary shots generated by different models read as different
       art styles cut together. Deterministic proxy for embedding similarity —
       mixed generation models demand one unifying color.look on every shot. */
    const generatedPrimaries = visuals.filter((element) => {
      if (Number(element.properties["transform.scale"] ?? 1) < 0.7) return false;
      const asset = element.assetId ? assets.get(element.assetId) : undefined;
      return asset?.role === "generated" && Boolean(asset.provenance?.model);
    });
    const generationModels = new Set(
      generatedPrimaries.map((element) => assets.get(element.assetId!)?.provenance?.model ?? ""),
    );
    if (generationModels.size > 1 && !generatedPrimaries.every((element) => typeof element.properties["color.look"] === "string" && element.properties["color.look"])) {
      issues.push({
        severity: "warning", code: "style_drift",
        elementIds: generatedPrimaries.map(({ id }) => id),
        message: `Primary shots come from ${generationModels.size} different generation models with no unifying grade. Apply one color.look to every visual (or regenerate the outliers with the anchor shot as reference) so the piece reads as one style.`,
      });
    }
    /* Mechanical pacing: three or more consecutive primary shots with nearly
       identical durations read machine-cut. Vary length with information density. */
    const primaryTimeline = visuals
      .filter((element) => Number(element.properties["transform.scale"] ?? 1) >= 0.7)
      .sort((a, b) => ticksToSeconds(a.timelineRange.start) - ticksToSeconds(b.timelineRange.start));
    for (let index = 0; index + 2 < primaryTimeline.length; index += 1) {
      const durations = [0, 1, 2].map((offset) => ticksToSeconds(primaryTimeline[index + offset]!.timelineRange.duration));
      if (Math.max(...durations) - Math.min(...durations) < 0.25) {
        issues.push({
          severity: "warning", code: "mechanical_pacing",
          elementIds: [0, 1, 2].map((offset) => primaryTimeline[index + offset]!.id),
          message: `Three consecutive shots run ${durations[0]!.toFixed(1)}s each. Vary shot length with information density — equal slots read machine-cut.`,
        });
        break;
      }
    }
    /* Motion monotony: consecutive animated shots repeating the same preset
       (e.g. the same Ken Burns drift on every still) flatten the piece. */
    for (let index = 0; index + 1 < primaryTimeline.length; index += 1) {
      const presetOf = (element: (typeof primaryTimeline)[number]) => String(element.properties["motion.preset"] ?? "");
      const preset = presetOf(primaryTimeline[index]!);
      if (preset && preset === presetOf(primaryTimeline[index + 1]!)) {
        issues.push({
          severity: "warning", code: "repeated_motion_preset",
          elementIds: [primaryTimeline[index]!.id, primaryTimeline[index + 1]!.id],
          message: `Consecutive shots repeat the “${preset}” motion. Alternate direction or preset between neighboring shots.`,
        });
        break;
      }
    }
    for (const voice of elements.filter((element) => element.kind === "audio" && element.properties["audio.role"] === "voiceover")) {
      const voiceStart = ticksToSeconds(voice.timelineRange.start);
      const cutPoints = [0, ...visuals.map((visual) => ticksToSeconds(visual.timelineRange.start))];
      if (cutPoints.some((cut) => Math.abs(voiceStart - cut) < 0.15)) issues.push({
        severity: "warning", code: "voice_on_cut", elementIds: [voice.id],
        message: `Narration starts exactly on a visual cut (${voiceStart.toFixed(2)}s). Delay the voice ~0.3s after the cut so the shot lands before the line begins.`,
      });
    }
    for (const voice of elements.filter((element) => element.kind === "audio" && typeof element.properties["voice.transcript"] === "string")) {
      const voiceEnd = ticksToSeconds(voice.timelineRange.start) + ticksToSeconds(voice.timelineRange.duration);
      if (sequenceEnd - voiceEnd < 0.6) issues.push({
        severity: "warning", code: "voice_ends_too_late", elementIds: [voice.id],
        message: `Narration ends only ${Math.max(0, sequenceEnd - voiceEnd).toFixed(1)}s before cut. Leave at least 0.6s for the CTA to breathe.`,
      });
    }
  }
  return issues;
};

export const buildDeterministicCriticRepairs = (
  project: Project,
  issues: ProjectCriticIssue[],
): ProjectOperation[] => {
  const elements = project.sequences.flatMap((sequence) =>
    sequence.tracks.flatMap((track) => track.elements),
  );
  const byId = new Map(elements.map((element) => [element.id, element]));
  return issues.flatMap((issue): ProjectOperation[] => {
    if (issue.code === "voice_on_cut") {
      const voice = issue.elementIds[0] ? byId.get(issue.elementIds[0]) : undefined;
      if (!voice) return [];
      const start = ticksToSeconds(voice.timelineRange.start);
      return [{ type: "moveElement", elementId: voice.id, start: secondsToTicks(start + 0.3) }];
    }
    if (issue.code !== "title_overlay_collision") return [];
    const [titleId, overlayId] = issue.elementIds;
    const title = titleId ? byId.get(titleId) : undefined;
    const overlay = overlayId ? byId.get(overlayId) : undefined;
    if (!title || !overlay || title.kind !== "text") return [];
    const titlePosition = Array.isArray(title.properties["transform.position"])
      ? title.properties["transform.position"] as number[]
      : [0.5, 0.76];
    const overlayPosition = Array.isArray(overlay.properties["transform.position"])
      ? overlay.properties["transform.position"] as number[]
      : [0.5, 0.5];
    return [{
      type: "setProperty",
      elementId: title.id,
      path: "transform.position",
      value: [Number(titlePosition[0] ?? 0.5), Number(overlayPosition[1] ?? 0.5) < 0.5 ? 0.76 : 0.22],
    }];
  });
};

export const summarizeProjectCriticIssues = (project: Project): string[] => {
  const issues = critiqueProjectDeterministically(project);
  if (issues.length === 0) return [];
  return ["PRE-RENDER CHECKS (fix errors before polish/export):", ...issues.map((issue) => `- ${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}`)];
};
