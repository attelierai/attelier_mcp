// Format "evolution": the same idea rendered by successive model generations,
// worst to best. Each era is shown at its native resolution so the frame itself
// grows with quality; the music opens up era by era. Pure data + timing.
import type { MusicCue } from "./model-compare.ts";

export type EvolutionEra = {
  /** e.g. "WAN 2.1 · 1.3B" */
  model: string;
  /** Release date shown huge on screen, e.g. "2026" or "FEB 2025". */
  year: string;
  /** Short facts, e.g. ["480p", "16 fps", "RTX 4090 · local"]. */
  specs: string[];
  video: string;
  fromSeconds: number;
  /** Native size, filled in by the toolkit from probing; drives the on-screen frame size. */
  width?: number;
  height?: number;
};

export type EvolutionSpec = {
  fps?: 30 | 60;
  /** Oldest first; the last era is the hook. */
  eras: EvolutionEra[];
  music: MusicCue & {
    /** Low-pass the track per era (radio → full range) so the sound evolves too. Default true. */
    sweep?: boolean;
  };
  /** Slam texts; wrap words in [brackets] to highlight them in brand orange with an underline. */
  hook?: { title?: string; twist?: string };
  finale?: { title?: string; subtitle?: string };
  /** Statement before the end card, one line per beat pair. Set false to skip. */
  closing?: { lines?: string[]; subtitle?: string } | false;
  /** credits: what made the video, e.g. [{ label: "Video", items: [{ text: "Attelier API", logo: "/abs/logo.svg" }] }]. */
  endcard?: { tagline?: string[]; credits?: { label: string; items: { text: string; logo?: string }[] }[] };
  beats?: { hook?: number; rewind?: number; era?: number; finale?: number; closing?: number; endcard?: number };
};

export const EVOLUTION_BEATS = { hook: 8, rewind: 8, era: 12, finale: 8, closing: 10, endcard: 8 };

export const evolutionTimeline = (beat: number, eras: number, beats: EvolutionSpec["beats"] = {}, closing = true) => {
  const n = { ...EVOLUTION_BEATS, ...beats };
  const b = (x: number) => x * beat;
  const erasStart = n.hook + n.rewind;
  const finale = erasStart + eras * n.era;
  const closingAt = finale + n.finale;
  const endcard = closingAt + (closing ? n.closing : 0);
  return {
    beat,
    b,
    rewind: b(n.hook),
    era: (i: number) => b(erasStart + i * n.era),
    eraLen: b(n.era),
    finale: b(finale),
    closing: b(closingAt),
    endcard: b(endcard),
    end: b(endcard + n.endcard),
  };
};

export const evolutionDefaults = (spec: EvolutionSpec) => {
  const newest = spec.eras.at(-1)!;
  return {
    fps: spec.fps ?? 60,
    hook: { title: `AI VIDEO IN [${/\d{4}/.exec(newest.year)?.[0] ?? newest.year}]`, twist: "LESS THAN [2 YEARS] AGO…", ...spec.hook },
    finale: { title: `${spec.eras.length} GENERATIONS. [UNDER 2 YEARS.]`, subtitle: spec.eras.map((e) => e.model).join("  →  "), ...spec.finale },
    closing: spec.closing === false ? undefined : { lines: ["THIS IS THE WORST", "[IT WILL EVER BE.]"], subtitle: "And it's only getting better.", ...spec.closing },
    endcard: { tagline: ["Claude Opus 5.5", "Attelier MCP"], credits: [] as NonNullable<NonNullable<EvolutionSpec["endcard"]>["credits"]>, ...spec.endcard },
    sweep: spec.music.sweep ?? true,
  };
};

/** Timeline for a spec (the closing section is on unless closing is false). */
export const evolutionTimelineFor = (spec: EvolutionSpec) => evolutionTimeline(spec.music.beatSeconds, spec.eras.length, spec.beats, spec.closing !== false);

export const evolutionDurationSeconds = (spec: EvolutionSpec) => evolutionTimelineFor(spec).end;

/** Low-pass cutoff per era, radio-thin first, full range for the newest. */
export const sweepCutoffs = (eras: number) => Array.from({ length: eras }, (_, i) => (i === eras - 1 ? 20000 : Math.round(700 * Math.pow(6, i))));

export const validateEvolution = (spec: EvolutionSpec, clipSeconds?: number[], musicSeconds?: number): string[] => {
  const errors: string[] = [];
  if (spec.eras.length < 2 || spec.eras.length > 5) errors.push(`eras: 2–5 generations, got ${spec.eras.length}.`);
  const beat = spec.music.beatSeconds;
  if (!(beat > 0.3 && beat < 0.6)) errors.push(`music.beatSeconds: ${beat} is outside 100–200 BPM.`);
  const t = evolutionTimelineFor(spec);
  clipSeconds?.forEach((seconds, i) => {
    const era = spec.eras[i]!;
    if (era.fromSeconds + t.eraLen > seconds + 0.02) errors.push(`eras[${i}].fromSeconds: ${era.fromSeconds} + ${t.eraLen.toFixed(2)} s exceeds the ${seconds.toFixed(2)} s clip; start at ≤ ${Math.max(0, seconds - t.eraLen).toFixed(2)} or shorten beats.era.`);
  });
  if (musicSeconds !== undefined) {
    const start = spec.music.firstBeatSeconds + spec.music.offsetBeats * beat;
    if (start + t.end > musicSeconds + 0.05) errors.push(`music: starting at ${start.toFixed(2)} s leaves ${(musicSeconds - start).toFixed(2)} s, the video needs ${t.end.toFixed(2)} s.`);
  }
  return errors;
};

export const EVOLUTION_EXAMPLE: EvolutionSpec = {
  eras: [
    { model: "WAN 2.1 · 1.3B", year: "2025", specs: ["480p", "16 fps", "RTX 4090 · local"], video: "/abs/path/wan21.mp4", fromSeconds: 0 },
    { model: "WAN 2.5", year: "2025", specs: ["1080p", "24 fps"], video: "/abs/path/wan25.mp4", fromSeconds: 0 },
    { model: "WAN 3.0", year: "2026", specs: ["1080p", "30 fps"], video: "/abs/path/wan30.mp4", fromSeconds: 0 },
  ],
  music: { src: "/abs/path/track.mp3", beatSeconds: 0.4007, firstBeatSeconds: 0.17, offsetBeats: 16 },
};
