import type { Project } from "@attelier/project-schema";
import { ticksToSeconds } from "@attelier/project-schema";
import { summarizeProjectCriticIssues } from "./project-critic.js";
import type { TranscriptArtifact } from "@attelier/analysis-schema";
import {
  ATTELIER_ACTION_TOOL_NAMES,
  ATTELIER_EDITOR_OPENAI_TOOLS,
} from "@atte/kit/tool-catalog";
import {
  compileProjectToolCalls,
  type AttelierProjectToolCall,
} from "./project-tool-compiler.js";

/**
 * The tool surface exposed to the LLM planner. Each tool maps 1:1 onto
 * canonical engine operations; the model never invents op payloads directly,
 * so every call stays inside the deterministic contract and still passes
 * through simulation before anything applies.
 */

export type LlmToolCall = AttelierProjectToolCall;

export const AGENT_TOOLS = ATTELIER_EDITOR_OPENAI_TOOLS;
export const ACTION_TOOL_NAMES = ATTELIER_ACTION_TOOL_NAMES;
/** Compact word timing context for voice-led editing. Times are source-relative. */
export const summarizeTranscriptTimings = (
  transcripts: TranscriptArtifact[],
): string => {
  const lines = transcripts.flatMap((transcript) => {
    const words = [...transcript.words]
      .sort((left, right) => Number(left.start) - Number(right.start))
      .slice(0, 80);
    if (words.length === 0) return [];
    const timing = words
      .map(
        (word) =>
          `${JSON.stringify(word.text)} ${ticksToSeconds(word.start).toFixed(2)}-${ticksToSeconds(word.end).toFixed(2)}`,
      )
      .join(" | ");
    return [
      `voice timing — asset=${transcript.assetId} provider=${transcript.provider} model=${transcript.model}; source-relative word intervals (s): ${timing}. Place cuts only between word intervals; add the voice element's timeline start to convert these to absolute timeline seconds.`,
    ];
  });
  return lines.join("\n");
};

/** Compact, model-readable snapshot of the project. */
export const summarizeProject = (
  project: Project,
  selectedElementId: string | undefined,
  playheadSeconds: number,
  /** Pre-summarized project resources (universe/brief) — see summarizeResources. */
  resourcesSummary?: string,
): string => {
  const lines: string[] = [
    `project revision r${project.revision}`,
    selectedElementId
      ? `selected target clip: ${selectedElementId} (selection overrides playhead)`
      : "no clip selected; use the playhead only to choose a target clip",
    `playhead=${playheadSeconds.toFixed(2)}s (target fallback only; never an arithmetic origin for relative edits)`,
    "tracks:",
  ];
  const musicSyncLines: string[] = [];
  for (const sequence of project.sequences) {
    for (const track of sequence.tracks) {
      lines.push(`- ${track.name} (${track.kind}, id ${track.id})`);
      for (const element of track.elements) {
        const start = ticksToSeconds(element.timelineRange.start);
        const duration = ticksToSeconds(element.timelineRange.duration);
        const beats = element.properties["audio.beats"];
        if (Array.isArray(beats) && beats.length > 1) {
          // Absolute timeline seconds, clipped to the clip's window, capped so the
          // snapshot stays small. The planner cuts visuals ON these times.
          const sourceStart = element.sourceRange
            ? ticksToSeconds(element.sourceRange.start)
            : 0;
          const absolute = beats
            .filter(
              (beat): beat is number =>
                typeof beat === "number" && Number.isFinite(beat),
            )
            .map((beat) => start + beat - sourceStart)
            .filter((at) => at >= start - 1e-6 && at <= start + duration + 1e-6)
            .slice(0, 24)
            .map((at) => at.toFixed(2));
          if (absolute.length > 1) {
            const bpm = element.properties["audio.bpm"];
            musicSyncLines.push(
              `music sync — clip ${element.id}${typeof bpm === "number" ? ` (~${bpm} BPM)` : ""} beats at (absolute s): ${absolute.join(", ")} — land visual cuts ON these times (±0.15s).`,
            );
          }
        }
        const extras = [
          element.properties["playback.rate"]
            ? `${element.properties["playback.rate"]}x`
            : undefined,
          element.properties["audio.muted"] === true ? "muted" : undefined,
          element.properties["effect.regionMask.id"] === "atelier.region.blur"
            ? `region blur mask=${JSON.stringify(element.properties["mask.region.rect"] ?? null)} strength=${String(element.properties["mask.region.strength"] ?? "default")} tracked-keyframes=${element.keyframes
                .filter(({ path }) => path.startsWith("mask.region."))
                .reduce((total, channel) => total + channel.keyframes.length, 0)}`
            : undefined,
        ].filter(Boolean);
        const role = element.properties["text.role"];
        const kindTag =
          element.kind === "text" && role
            ? `${element.kind}/${role}`
            : element.kind;
        lines.push(
          `  · id=${element.id} kind=${kindTag}${element.assetId ? ` asset=${element.assetId}` : ""} "${element.name}" timeline.start=${start.toFixed(2)}s timeline.end=${(start + duration).toFixed(2)}s timeline.duration=${duration.toFixed(2)}s${extras.length ? ` [${extras.join(", ")}]` : ""}`,
        );
      }
    }
    if ((sequence.markers ?? []).length > 0) {
      lines.push(
        `markers: ${(sequence.markers ?? [])
          .map((marker) => `${marker.id} "${marker.name}" @${ticksToSeconds(marker.at).toFixed(2)}s`)
          .join("; ")}`,
      );
    }
    if ((sequence.linkGroups ?? []).length > 0) {
      lines.push(
        `linked clips: ${(sequence.linkGroups ?? [])
          .map((group) => `${group.id}=[${group.elementIds.join(",")}]`)
          .join("; ")}`,
      );
    }
  }
  lines.push(...musicSyncLines);
  lines.push(...summarizeProjectCriticIssues(project));
  if (project.assets.length > 0) {
    // Include generation memory (prompt/seed/model) for generated assets so the
    // agent can keep shots consistent and reference or regenerate them.
    lines.push(
      "assets: " +
        project.assets
          .map((asset) => {
            const provenance = asset.provenance;
            const sourceDuration = asset.duration
              ? ` duration=${ticksToSeconds(asset.duration).toFixed(2)}s`
              : "";
            const shot =
              provenance?.origin === "generated"
                ? ` {${[
                    provenance.prompt
                      ? `prompt="${provenance.prompt.slice(0, 70)}"`
                      : undefined,
                    provenance.model ? `model=${provenance.model}` : undefined,
                    provenance.seed !== undefined
                      ? `seed=${provenance.seed}`
                      : undefined,
                  ]
                    .filter(Boolean)
                    .join(" ")}}`
                : "";
            return `${asset.id} "${asset.name}" (${asset.mediaType}${sourceDuration})${shot}`;
          })
          .join("; "),
    );
  }
  if (resourcesSummary && resourcesSummary.trim()) {
    lines.push(resourcesSummary.trim());
  }
  return lines.join("\n");
};

/** Compile validated calls through the shared harness authority. */
export const mapToolCalls = compileProjectToolCalls;
