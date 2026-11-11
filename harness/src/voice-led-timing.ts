import type { TranscriptArtifact } from "@attelier/analysis-schema";
import type { Project } from "@attelier/project-schema";
import { ticksToSeconds } from "@attelier/project-schema";
import type { LlmToolCall } from "./editor-tool-surface.js";

export type VoiceBeatTiming = {
  cuts: number[];
  ctaStart: number;
  ctaEnd: number;
  sourceGaps: Array<{ start: number; end: number }>;
};

/**
 * Derive N voice-led beats from observable word intervals. For three beats,
 * the two largest internal word-free gaps are the least ambiguous technical
 * cut points. No semantic label or benchmark answer is consulted.
 */
export const deriveVoiceBeatTiming = (
  transcript: TranscriptArtifact,
  voiceTimelineStart: number,
  beatCount = 3,
  options: { minimumGapSeconds?: number; ctaWordCount?: number } = {},
): VoiceBeatTiming | undefined => {
  const words = [...transcript.words].sort(
    (left, right) => Number(left.start) - Number(right.start),
  );
  if (words.length < beatCount || beatCount < 2) return undefined;
  const candidates = words.slice(0, -1).map((word, index) => {
    const next = words[index + 1]!;
    const start = ticksToSeconds(word.end);
    const end = ticksToSeconds(next.start);
    return { index, start, end, duration: end - start };
  });
  const selected = candidates
    .filter(({ duration }) => duration >= (options.minimumGapSeconds ?? 0.12))
    .sort(
      (left, right) =>
        right.duration - left.duration || left.index - right.index,
    )
    .slice(0, beatCount - 1)
    .sort((left, right) => left.index - right.index);
  if (selected.length !== beatCount - 1) return undefined;
  const lastGap = selected.at(-1)!;
  const ctaFirstWord =
    options.ctaWordCount && options.ctaWordCount <= words.length
      ? words.at(-options.ctaWordCount)!
      : words[lastGap.index + 1]!;
  return {
    cuts: selected.map(
      ({ start, end }) => voiceTimelineStart + (start + end) / 2,
    ),
    ctaStart: voiceTimelineStart + ticksToSeconds(ctaFirstWord.start),
    ctaEnd: voiceTimelineStart + ticksToSeconds(words.at(-1)!.end),
    sourceGaps: selected.map(({ start, end }) => ({ start, end })),
  };
};

export const planVoiceLedTimingRepairs = (options: {
  project: Project;
  transcript: TranscriptArtifact;
  voiceTimelineStart: number;
  outputDurationSeconds: number;
  ctaText: string;
  visualCount?: number;
  minimumGapSeconds?: number;
}): { timing: VoiceBeatTiming; calls: LlmToolCall[] } | undefined => {
  const visualCount = options.visualCount ?? 3;
  const timing = deriveVoiceBeatTiming(
    options.transcript,
    options.voiceTimelineStart,
    visualCount,
    {
      ...(options.minimumGapSeconds === undefined
        ? {}
        : { minimumGapSeconds: options.minimumGapSeconds }),
      ctaWordCount:
        options.ctaText.match(/[A-Za-z0-9]+/g)?.length ?? 1,
    },
  );
  if (!timing) return undefined;
  const sequence =
    options.project.sequences.find(
      ({ id }) => id === options.project.activeSequenceId,
    ) ?? options.project.sequences[0];
  if (!sequence) return undefined;
  const elements = sequence.tracks.flatMap((track) => track.elements);
  const visuals = elements
    .filter(({ kind }) => kind === "image" || kind === "video")
    .sort(
      (left, right) =>
        Number(left.timelineRange.start) - Number(right.timelineRange.start),
    );
  if (visuals.length !== visualCount) return undefined;
  const starts = [0, ...timing.cuts];
  const ends = [...timing.cuts, options.outputDurationSeconds];
  const calls: LlmToolCall[] = [];
  for (const [index, visual] of visuals.entries()) {
    const start = starts[index]!;
    const duration = ends[index]! - start;
    const currentStart = ticksToSeconds(visual.timelineRange.start);
    const currentDuration = ticksToSeconds(visual.timelineRange.duration);
    if (Math.abs(currentStart - start) > 0.05)
      calls.push({
        name: "move_clip",
        arguments: { element_id: visual.id, start_seconds: start },
      });
    if (Math.abs(currentDuration - duration) > 0.05)
      calls.push({
        name: "trim_clip",
        arguments: { element_id: visual.id, duration_seconds: duration },
      });
  }
  const title = elements.find(
    (element) =>
      element.kind === "text" &&
      element.properties["text.content"] === options.ctaText,
  );
  if (title) {
    const currentStart = ticksToSeconds(title.timelineRange.start);
    const currentEnd =
      currentStart + ticksToSeconds(title.timelineRange.duration);
    if (
      Math.abs(currentStart - timing.ctaStart) > 0.05 ||
      Math.abs(currentEnd - timing.ctaEnd) > 0.05
    ) {
      calls.push({
        name: "delete_clip",
        arguments: { element_id: title.id, ripple: false },
      });
      calls.push({
        name: "add_title",
        arguments: {
          text: options.ctaText,
          at_seconds: timing.ctaStart,
          duration_seconds: timing.ctaEnd - timing.ctaStart,
          color: String(title.properties["style.color"] ?? "#ffffff"),
          font_size: Number(title.properties["style.fontSize"] ?? 72),
          position: Array.isArray(title.properties["transform.position"])
            ? title.properties["transform.position"]
            : [0.5, 0.75],
        },
      });
    }
  } else {
    for (const staleTitle of elements.filter(({ kind }) => kind === "text"))
      calls.push({
        name: "delete_clip",
        arguments: { element_id: staleTitle.id, ripple: false },
      });
    calls.push({
      name: "add_title",
      arguments: {
        text: options.ctaText,
        at_seconds: timing.ctaStart,
        duration_seconds: timing.ctaEnd - timing.ctaStart,
        color: "#ffffff",
        font_size: 72,
        position: [0.5, 0.75],
      },
    });
  }
  return { timing, calls };
};
