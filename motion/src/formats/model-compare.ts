// Format "model-compare": one prompt, four models. Pure data + timing, shared by
// the Remotion composition and the Node toolkit (validation, duration, staging).

export type CompareModel = {
  name: string;
  maker: string;
  /** Local path (toolkit input) or staged public path (inside the render). */
  video: string;
  genSeconds: number;
  costUsd: number;
  /** Where the clip is most alive, used for the grid tiles. Default 1.5 s. */
  gridFromSeconds?: number;
};

/** Output of `analyzeMusic` plus where the track starts, in beats. */
export type MusicCue = {
  src: string;
  beatSeconds: number;
  firstBeatSeconds: number;
  /** Track beat that plays at video beat 0; pick it so the drop lands on beat 16. */
  offsetBeats: number;
  volume?: number;
};

export type ModelCompareSpec = {
  fps?: 30 | 60;
  prompt: string;
  models: CompareModel[];
  music: MusicCue;
  /** Two hook lines; the first character of line 2 is accented. */
  headline?: [string, string];
  race?: { kicker?: string; title?: string };
  outro?: { title?: string; cta?: string };
  endcard?: { tagline?: string[] };
  /** Extra, unticked rows in the model picker. */
  pickerExtras?: { name: string; maker: string }[];
  sfx?: boolean;
};

/** Scene boundaries in seconds for a beat length. Authored in beats. */
export const modelCompareTimeline = (beat: number) => {
  const b = (n: number) => n * beat;
  return {
    beat,
    swap: b(1),
    headline1: b(0.25),
    headline2: b(2),
    createIn: b(3.75),
    typeStart: b(4.5),
    typeEnd: b(8.5),
    modelClick: b(9.5),
    checks: [b(10), b(10.5), b(11), b(11.5)],
    pickerClose: b(12.25),
    send: b(13),
    zoomOut: b(13),
    zoomOutLen: b(1.25),
    tilesIn: b(13.5),
    fastDone: b(14.25),
    restDone: b(15),
    showcase: b(16),
    showcaseLen: b(8),
    race: b(48),
    outro: b(57),
    endcard: b(63.5),
    end: b(70),
  };
};
export type ModelCompareTimeline = ReturnType<typeof modelCompareTimeline>;

export const modelCompareDefaults = (spec: ModelCompareSpec) => ({
  fps: spec.fps ?? 30,
  headline: spec.headline ?? (["Same prompt.", `${spec.models.length} models.`] as [string, string]),
  race: { kicker: "Time & cost to generate", title: "Same 5-second clip.", ...spec.race },
  outro: { title: "Which one wins?", cta: `Reply with your pick · 1 – ${spec.models.length}`, ...spec.outro },
  endcard: { tagline: ["Claude Opus 5.5", "Attelier API", "Attelier MCP"], ...spec.endcard },
  pickerExtras: spec.pickerExtras ?? [{ name: "Veo 3.1", maker: "Google" }, { name: "Sora 2", maker: "OpenAI" }],
  sfx: spec.sfx ?? true,
});

export const modelCompareDurationSeconds = (spec: ModelCompareSpec) => modelCompareTimeline(spec.music.beatSeconds).end;

/**
 * Structural checks an agent gets back before paying for a render.
 * `clipSeconds` (from probing) enables the per-clip length check.
 */
export const validateModelCompare = (spec: ModelCompareSpec, clipSeconds?: number[], musicSeconds?: number): string[] => {
  const errors: string[] = [];
  if (spec.models.length !== 4) errors.push(`models: the 2×2 layout needs exactly 4 models, got ${spec.models.length}.`);
  if (!spec.prompt.trim()) errors.push("prompt: required.");
  const beat = spec.music.beatSeconds;
  if (!(beat > 0.3 && beat < 0.75)) errors.push(`music.beatSeconds: ${beat} is outside 80–200 BPM.`);
  const t = modelCompareTimeline(beat);
  // Each showcase keeps its card on screen for showcaseLen + one swap.
  const needed = t.showcaseLen + t.swap;
  clipSeconds?.forEach((seconds, i) => {
    if (seconds < needed) {
      errors.push(`models[${i}].video: ${seconds.toFixed(2)} s is shorter than the ${needed.toFixed(2)} s a showcase needs at ${Math.round(60 / beat)} BPM; use a faster track (≥ ${Math.ceil((60 * 9) / seconds)} BPM).`);
    }
  });
  if (musicSeconds !== undefined) {
    const start = spec.music.firstBeatSeconds + spec.music.offsetBeats * beat;
    if (start + t.end > musicSeconds + 0.05) {
      errors.push(`music: starting at ${start.toFixed(2)} s leaves ${(musicSeconds - start).toFixed(2)} s, but the video needs ${t.end.toFixed(2)} s; lower offsetBeats or use a longer track.`);
    }
  }
  spec.models.forEach((m, i) => {
    if (!(m.genSeconds > 0)) errors.push(`models[${i}].genSeconds: must be > 0.`);
    if (!(m.costUsd >= 0)) errors.push(`models[${i}].costUsd: must be ≥ 0.`);
  });
  return errors;
};

export const MODEL_COMPARE_EXAMPLE: ModelCompareSpec = {
  prompt: "A 7-year-old girl walks through a wildflower meadow at golden hour and gently tries to catch a butterfly. Cinematic, photorealistic.",
  models: [
    { name: "Seedance 2.5", maker: "ByteDance", video: "/abs/path/seedance.mp4", genSeconds: 170, costUsd: 2.31 },
    { name: "Kling 3", maker: "Kuaishou", video: "/abs/path/kling.mp4", genSeconds: 41, costUsd: 0.56 },
    { name: "Wan 3.0", maker: "Alibaba", video: "/abs/path/wan.mp4", genSeconds: 175, costUsd: 0.25 },
    { name: "MiniMax H3", maker: "MiniMax", video: "/abs/path/h3.mp4", genSeconds: 3.7, costUsd: 0.13 },
  ],
  music: { src: "/abs/path/music.mp3", beatSeconds: 0.499, firstBeatSeconds: 0, offsetBeats: 16 },
};
