// Format "shootout": several shots rendered by four models, cut on the beat.
// Dark, high-energy, 60 fps. Pure data + timing shared by Remotion and Node.
import type { MusicCue } from "./model-compare.ts";

export type ShootoutModel = { name: string; maker: string };

export type ShootoutShot = {
  /** Round title, e.g. "DRIFT". */
  title: string;
  /** One clip per model, same order as `models`. */
  clips: {
    video: string;
    /** Where the clip is most alive (find_moments bestStart). */
    fromSeconds: number;
    /** Optional factual generation metrics. Omit unknown values. */
    genSeconds?: number;
    costUsd?: number;
  }[];
};

export type ShootoutSpec = {
  fps?: 30 | 60;
  models: ShootoutModel[];
  /** 1–3 rounds (2 recommended); each is models × solo + grid beats. */
  shots: ShootoutShot[];
  /** Optional: without a track the cut runs on a 120 BPM grid and the clips' own sound carries it. */
  music?: MusicCue;
  /** Intro slams, e.g. ["SAME PROMPT", "4 MODELS", "2 SHOTS"]. */
  hook?: string[];
  vote?: { title?: string; cta?: string; shot?: number };
  endcard?: { tagline?: string[] };
  /** Level of the clips' own audio, 0–1 (default 0.15 under music, 0.8 without). */
  clipAudio?: number;
  /** Beats per section; defaults keep two rounds inside one 48-beat drop. */
  beats?: { solo?: number; grid?: number; race?: number; vote?: number; endcard?: number };
};

export const SHOOTOUT_BEATS = { solo: 5, grid: 4, race: 16, vote: 12, endcard: 8 };

/** Seconds per beat: the track's, or a 120 BPM grid when there is no music. */
export const shootoutBeat = (spec: ShootoutSpec) => spec.music?.beatSeconds ?? 0.5;

/**
 * Sections in beats: 16-beat intro, then per round every model solo for
 * `solo` beats and a `grid`-beat 2×2, then race, vote and end card.
 */
export const shootoutTimeline = (beat: number, rounds: number, models = 4, beats: ShootoutSpec["beats"] = {}) => {
  const n = { ...SHOOTOUT_BEATS, ...beats };
  const b = (x: number) => x * beat;
  const roundsStart = 16;
  const round = models * n.solo + n.grid;
  const race = roundsStart + rounds * round;
  const vote = race + n.race;
  const endcard = vote + n.vote;
  return {
    beat,
    b,
    intro: 0,
    roundsStart: b(roundsStart),
    round: (r: number) => b(roundsStart + r * round),
    solo: (r: number, i: number) => b(roundsStart + r * round + i * n.solo),
    soloLen: b(n.solo),
    grid: (r: number) => b(roundsStart + r * round + models * n.solo),
    gridLen: b(n.grid),
    race: b(race),
    vote: b(vote),
    endcard: b(endcard),
    end: b(endcard + n.endcard),
  };
};
export type ShootoutTimeline = ReturnType<typeof shootoutTimeline>;

export const shootoutDefaults = (spec: ShootoutSpec) => ({
  fps: spec.fps ?? 60,
  hook: spec.hook ?? ["SAME PROMPT", `${spec.models.length} MODELS`, spec.shots.length === 1 ? "ONE SHOT" : `${spec.shots.length} SHOTS`],
  vote: { title: "WHICH ONE IS BETTER?", cta: `Reply 1–${spec.models.length} with your favourite`, shot: spec.shots.length - 1, ...spec.vote },
  endcard: { tagline: ["Claude Opus 5.5", "Attelier API", "Attelier MCP"], ...spec.endcard },
  clipAudio: spec.clipAudio ?? (spec.music ? 0.15 : 0.8),
});

export const shootoutHasMetrics = (spec: ShootoutSpec) => spec.shots.length > 0 && spec.shots.every((shot) =>
  shot.clips.length === spec.models.length && shot.clips.every((clip) => clip.genSeconds !== undefined && clip.costUsd !== undefined));

/** Unknown metrics never become zero-valued race results. */
export const shootoutTimelineFor = (spec: ShootoutSpec) => shootoutTimeline(shootoutBeat(spec), spec.shots.length, spec.models.length,
  { ...spec.beats, ...(!shootoutHasMetrics(spec) ? { race: 0 } : {}) });

export const shootoutDurationSeconds = (spec: ShootoutSpec) => shootoutTimelineFor(spec).end;

/** Totals per model across shots, for the race. */
export const shootoutTotals = (spec: ShootoutSpec) => {
  if (!shootoutHasMetrics(spec)) throw new Error("The race needs complete generation metrics; omit the race when values are unknown.");
  return spec.models.map((model, i) => ({
    ...model,
    genSeconds: spec.shots.reduce((sum, shot) => sum + (shot.clips[i]?.genSeconds ?? 0), 0),
    costUsd: spec.shots.reduce((sum, shot) => sum + (shot.clips[i]?.costUsd ?? 0), 0),
  }));
};

export const validateShootout = (spec: ShootoutSpec, clipSeconds?: number[], musicSeconds?: number): string[] => {
  const errors: string[] = [];
  if (spec.models.length !== 4) errors.push(`models: the 2×2 grid needs exactly 4 models, got ${spec.models.length}.`);
  if (spec.shots.length < 1 || spec.shots.length > 3) errors.push(`shots: 1–3 rounds, got ${spec.shots.length}.`);
  const beat = shootoutBeat(spec);
  if (spec.music && !(beat > 0.3 && beat < 0.6)) errors.push(`music.beatSeconds: ${beat} is outside 100–200 BPM; shootout wants an energetic track.`);
  const t = shootoutTimelineFor(spec);
  spec.shots.forEach((shot, r) => {
    if (shot.clips.length !== spec.models.length) errors.push(`shots[${r}].clips: need one clip per model (${spec.models.length}), got ${shot.clips.length}.`);
    shot.clips.forEach((clip, i) => {
      if (clip.genSeconds !== undefined && (!Number.isFinite(clip.genSeconds) || clip.genSeconds <= 0)) errors.push(`shots[${r}].clips[${i}].genSeconds: use a real positive value or omit it.`);
      if (clip.costUsd !== undefined && (!Number.isFinite(clip.costUsd) || clip.costUsd < 0)) errors.push(`shots[${r}].clips[${i}].costUsd: use a real non-negative value or omit it.`);
      if (!Number.isFinite(clip.fromSeconds) || clip.fromSeconds < 0) errors.push(`shots[${r}].clips[${i}].fromSeconds: must be finite and non-negative.`);
    });
  });
  // A clip plays its solo slot and the round grid from fromSeconds.
  const needed = Math.max(t.soloLen, t.gridLen);
  let k = 0;
  spec.shots.forEach((shot, r) => shot.clips.forEach((clip, i) => {
    const seconds = clipSeconds?.[k++];
    if (seconds !== undefined && clip.fromSeconds + needed > seconds + 0.02) {
      errors.push(`shots[${r}].clips[${i}].fromSeconds: ${clip.fromSeconds} + ${needed.toFixed(2)} s exceeds the ${seconds.toFixed(2)} s clip; start at ≤ ${(seconds - needed).toFixed(2)}.`);
    }
  }));
  // The vote replays clips from 0 at 0.85× until the end card's wipe is done (+0.7 s).
  const voteMedia = (t.endcard - t.vote + 0.7) * 0.85;
  const voteShot = spec.vote?.shot ?? spec.shots.length - 1;
  clipSeconds?.forEach((seconds, i) => {
    if (Math.floor(i / spec.models.length) !== voteShot) return;
    if (seconds < voteMedia) errors.push(`clip ${i}: ${seconds.toFixed(2)} s is shorter than the ${voteMedia.toFixed(2)} s the vote replays; shorten beats.vote.`);
  });
  if (spec.music && musicSeconds !== undefined) {
    const start = spec.music.firstBeatSeconds + spec.music.offsetBeats * beat;
    if (start + t.end > musicSeconds + 0.05) errors.push(`music: starting at ${start.toFixed(2)} s leaves ${(musicSeconds - start).toFixed(2)} s, the video needs ${t.end.toFixed(2)} s.`);
  }
  return errors;
};

export const SHOOTOUT_EXAMPLE: ShootoutSpec = {
  models: [
    { name: "Seedance 2.5", maker: "ByteDance" },
    { name: "Kling 3", maker: "Kuaishou" },
    { name: "Wan 3.0", maker: "Alibaba" },
    { name: "MiniMax H3", maker: "MiniMax" },
  ],
  shots: [
    { title: "DRIFT", clips: ["seedance", "kling", "wan", "h3"].map((m) => ({ video: `/abs/path/${m}-drift.mp4`, fromSeconds: 1.2, genSeconds: 60, costUsd: 0.5 })) },
  ],
  music: { src: "/abs/path/track.mp3", beatSeconds: 0.4293, firstBeatSeconds: 0.405, offsetBeats: 0 },
};
