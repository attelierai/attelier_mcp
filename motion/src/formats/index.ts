import {
  MODEL_COMPARE_EXAMPLE,
  type ModelCompareSpec,
  modelCompareDurationSeconds,
  validateModelCompare,
} from "./model-compare.ts";
import { EVOLUTION_EXAMPLE, type EvolutionSpec, evolutionDurationSeconds, evolutionTimelineFor, sweepCutoffs, validateEvolution } from "./evolution.ts";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { probeMedia } from "../media.ts";
import { MAKING_OF_EXAMPLE, type MakingOfSpec, makingOfDurationSeconds, validateMakingOf } from "./making-of.ts";
import { SHOOTOUT_EXAMPLE, type ShootoutSpec, shootoutDurationSeconds, validateShootout } from "./shootout.ts";
import { NEWSCAST_EXAMPLE, type NewscastSpec, newscastDurationSeconds, newscastPanelMedia, validateNewscast } from "./newscast.ts";
import { validateShootoutShape } from "./spec-shape.ts";
import { ATTELIER_OUTRO_EXAMPLE, type AttelierOutroSpec, attelierOutroDurationSeconds, validateAttelierOutro } from "./attelier-outro.ts";

export type MediaRef = { kind: "video" | "audio" | "image"; path: string };

/** A format is a Remotion composition plus everything an agent needs to fill it. */
export type Format<Spec> = {
  composition: string;
  summary: string;
  example: Spec;
  /** Plain-language guide for choosing values: what each field does on screen. */
  guide: string[];
  parse: (value: unknown) => Spec;
  validate: (spec: Spec, clipSeconds?: number[], musicSeconds?: number) => string[];
  durationSeconds: (spec: Spec) => number;
  mediaOf: (spec: Spec) => MediaRef[];
  /** Return a copy with every local media path replaced by `map(path)`. */
  withMedia: (spec: Spec, map: (file: string) => string) => Spec;
  /** Optional media preparation before staging (probing, derived audio). */
  prepare?: (spec: Spec, workDir: string) => Spec;
};

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

const modelCompare: Format<ModelCompareSpec> = {
  composition: "model-compare",
  summary: "Same prompt, four models: hook headline → Attelier Create demo (prompt typed, 4 models ticked) → results generate in the library → each model full-screen with time and cost → time & cost race → vote grid → brand end card. 16:9, ~35 s at 120 BPM.",
  example: MODEL_COMPARE_EXAMPLE,
  guide: [
    "models: exactly 4, in reveal order; put the strongest last. genSeconds and costUsd drive the counters, the race and the '×faster · ×cheaper' badge.",
    "music: run analyze_music with needSeconds ≈ 70 beats (≈35 s at 120 BPM) and copy beatSeconds, firstBeatSeconds and suggestedOffsetBeats, so the drop lands on the first full-screen reveal.",
    "The whole timeline is authored in beats: a faster track makes a shorter, punchier video. Each model shows for 8 beats + a 1-beat swap, so clips must last ≥ 9 beats.",
    "headline: two short lines; the first character of line 2 is accented (e.g. ['Same prompt.', '4 models.']).",
    "endcard.tagline: 2–3 short parts joined with accent pluses.",
  ],
  parse: (value) => {
    if (!isObject(value) || !Array.isArray(value.models) || !isObject(value.music) || typeof value.prompt !== "string") {
      throw new Error("model-compare spec needs prompt (string), models (array) and music (object). Call motion_formats for the example.");
    }
    return value as unknown as ModelCompareSpec;
  },
  validate: validateModelCompare,
  durationSeconds: modelCompareDurationSeconds,
  mediaOf: (spec) => [...spec.models.map((m) => ({ kind: "video" as const, path: m.video })), { kind: "audio", path: spec.music.src }],
  withMedia: (spec, map) => ({ ...spec, models: spec.models.map((m) => ({ ...m, video: map(m.video) })), music: { ...spec.music, src: map(spec.music.src) } }),
};

const shootout: Format<ShootoutSpec> = {
  composition: "shootout",
  summary: "High-energy model shoot-out: dark HUD look at 60 fps. Hook slams → model name flashes → 3·2·1 → per shot a round title, each model full-screen for 3 beats with whip cuts, punch-ins and GEN/COST readouts, then a 2×2 grid → accumulated time & cost race → vote grid → brand end card. Everything cuts on the beat.",
  example: SHOOTOUT_EXAMPLE,
  guide: [
    "Music is optional but makes it: pick an energetic track (≥ 120 BPM). Without music the cut runs on a 120 BPM grid with the clips' own sound (clipAudio 0.8). With a track, analyze_music → copy beatSeconds, firstBeatSeconds and suggestedOffsetBeats; the first drop should land on video beat 16 (end of the countdown). With the default beats, 2 shots fill beats 16–64 and the race sits on 64–80, ideal when the track breaks down there.",
    "shots: 1–3 rounds (2 is the sweet spot: each model gets 5 beats to be appreciated), one clip per model in models order. fromSeconds: run find_moments with windowSeconds = the solo length in seconds (5 beats) and use bestStart, then check it with contact_sheet.",
    "beats: optional section lengths { solo 5, grid 4, race 16, vote 12, endcard 8 }; shorten vote/endcard for a tighter cut.",
    "The white flashes on the hook slams, round starts and grids are part of the format; review_video reports them, so only fix flashes elsewhere.",
    "genSeconds/costUsd are optional factual metrics from generation history. Omit unknown values: only supplied counters appear. The race is omitted automatically unless every clip has both metrics; beats.race: 0 also disables it. Never drop a requested shot just because its metrics are missing.",
    "endcard.tagline must be an array of short strings (e.g. ['Your idea', 'Attelier']). Render a still or preview and inspect it before the full export. The default web profile is H.264 CRF 21; choose profile: 'master' for CRF 17.",
    "On-screen text: hook is the list of slam lines (e.g. ['SAME PROMPT', '4 MODELS', 'ONE SHOT']); vote.title is the closing question (default 'WHICH ONE IS BETTER?') and vote.cta the line under it (default 'Reply 1–4 with your favourite'); vote.shot picks which round fills the final grid (default: the last).",
  ],
  parse: (value) => {
    if (!isObject(value) || !Array.isArray(value.models) || !Array.isArray(value.shots) || (value.music !== undefined && !isObject(value.music))) {
      throw new Error("shootout spec needs models (array) and shots (array); music, when given, is an object. Call motion_formats for the example.");
    }
    validateShootoutShape(value);
    return value as unknown as ShootoutSpec;
  },
  validate: validateShootout,
  durationSeconds: shootoutDurationSeconds,
  mediaOf: (spec) => [...spec.shots.flatMap((shot) => shot.clips.map((c) => ({ kind: "video" as const, path: c.video }))), ...(spec.music ? [{ kind: "audio" as const, path: spec.music.src }] : [])],
  withMedia: (spec, map) => ({ ...spec, shots: spec.shots.map((shot) => ({ ...shot, clips: shot.clips.map((c) => ({ ...c, video: map(c.video) })) })), ...(spec.music ? { music: { ...spec.music, src: map(spec.music.src) } } : {}) }),
};

const evolution: Format<EvolutionSpec> = {
  composition: "evolution",
  summary: "Quality evolution of a model family, worst to best: the newest clip as hook ('AI VIDEO IN 2026.') → real rewind with VHS glitch and a year counter ('LESS THAN 2 YEARS AGO…') → each generation for 12 beats in a frame that grows with quality, with date, model and specs → all generations side by side → closing statement ('THIS IS THE WORST IT WILL EVER BE.') → brand end card. The music is low-passed per era and opens up at the newest. Dark, 60 fps.",
  example: EVOLUTION_EXAMPLE,
  guide: [
    "eras: oldest first, 2–5 generations; year, model and specs are shown on screen, so only use facts you know. The last era is also the hook.",
    "fromSeconds: each era shows 12 beats (≈4.8 s at 150 BPM), so clips usually start near 0; find_moments with that window picks the best start.",
    "music: analyze_music with needSeconds ≈ duration and alignBeat 16 so the drop lands on the first era; music.sweep (default true) makes the track sound thin for old eras and full for the newest.",
  ],
  parse: (value) => {
    if (!isObject(value) || !Array.isArray(value.eras) || !isObject(value.music)) throw new Error("evolution spec needs eras (array) and music (object). Call motion_formats for the example.");
    return value as unknown as EvolutionSpec;
  },
  validate: validateEvolution,
  durationSeconds: evolutionDurationSeconds,
  mediaOf: (spec) => [
    ...spec.eras.map((e) => ({ kind: "video" as const, path: e.video })),
    { kind: "audio" as const, path: spec.music.src },
    ...(spec.endcard?.credits ?? []).flatMap((row) => row.items.flatMap((item) => (item.logo ? [{ kind: "image" as const, path: item.logo }] : []))),
  ],
  withMedia: (spec, map) => ({
    ...spec,
    eras: spec.eras.map((e) => ({ ...e, video: map(e.video) })),
    music: { ...spec.music, src: map(spec.music.src) },
    ...(spec.endcard ? { endcard: { ...spec.endcard, ...(spec.endcard.credits ? { credits: spec.endcard.credits.map((row) => ({ ...row, items: row.items.map((item) => (item.logo ? { ...item, logo: map(item.logo) } : item)) })) } : {}) } } : {}),
  }),
  prepare: (spec, workDir) => {
    const eras = spec.eras.map((era) => {
      const v = probeMedia(era.video).video;
      return v ? { ...era, width: v.width, height: v.height } : era;
    });
    if (spec.music.sweep === false) return { ...spec, eras };
    // Trim the track to the video start, then switch a low-pass cutoff at each era.
    const t = evolutionTimelineFor(spec);
    const start = spec.music.firstBeatSeconds + spec.music.offsetBeats * spec.music.beatSeconds;
    const cutoffs = sweepCutoffs(eras.length);
    const commands = [`${t.rewind.toFixed(3)} lowpass@lp f ${cutoffs[0]}`, ...cutoffs.map((hz, i) => `${t.era(i).toFixed(3)} lowpass@lp f ${hz}`)].join(";");
    const out = path.join(workDir, "evolution-music.wav");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(start), "-t", String(t.end + 1), "-i", spec.music.src, "-af", `asendcmd=c='${commands}',lowpass@lp=f=20000`, out]);
    return { ...spec, eras, music: { ...spec.music, src: out, firstBeatSeconds: 0, offsetBeats: 0 } };
  },
};

const makingOf: Format<MakingOfSpec> = {
  composition: "making-of",
  summary: "How a video was made, driven by voice-over: the finished video as hook ('HOW WE MADE THIS') → a real screen recording of the process, sped up per segment with a camera that follows the action, big section titles, an elapsed clock and captions → optional result card with its numbers → brand end card.",
  example: MAKING_OF_EXAMPLE,
  guide: [
    "voice: record or generate each line separately and place it with at (output seconds); the toolkit probes its length and the music ducks under it. Lay out the sections around the voice, not the other way round.",
    "screen.segments: cut the recording into moments (generate, brief sent, clips inspected, stills, render, download). seconds sets how long each lasts on screen, so a 3-minute wait can pass in 5 s; the ▶▶ badge shows the real speed and, with clockZero, a clock shows the real elapsed time.",
    "Introduce each product screen whole first (no focus, with title, e.g. 'Attelier Studio'), then zoom: focus is a source-pixel rect to frame and consecutive segments ease the camera between rects.",
    "finale (optional): 2–4 short facts over the result, the first highlighted. End on the product itself when the recording already shows the result.",
  ],
  parse: (value) => {
    if (!isObject(value) || !isObject(value.result) || !isObject(value.screen) || !Array.isArray(value.voice) || !isObject(value.music)) {
      throw new Error("making-of spec needs result, screen, voice and music. Call motion_formats for the example.");
    }
    const spec = value as unknown as MakingOfSpec;
    // Voice lengths drive ducking and overlap checks.
    return { ...spec, voice: spec.voice.map((v) => ({ ...v, seconds: v.seconds ?? probeMedia(v.src).durationSeconds })) };
  },
  validate: validateMakingOf,
  durationSeconds: makingOfDurationSeconds,
  mediaOf: (spec) => [
    { kind: "video", path: spec.result.video },
    { kind: "video", path: spec.screen.video },
    { kind: "audio", path: spec.music.src },
    ...spec.voice.map((v) => ({ kind: "audio" as const, path: v.src })),
    ...(spec.endcard?.credits ?? []).flatMap((row) => row.items.flatMap((item) => (item.logo ? [{ kind: "image" as const, path: item.logo }] : []))),
  ],
  withMedia: (spec, map) => ({
    ...spec,
    result: { ...spec.result, video: map(spec.result.video) },
    screen: { ...spec.screen, video: map(spec.screen.video) },
    voice: spec.voice.map((v) => ({ ...v, src: map(v.src) })),
    music: { ...spec.music, src: map(spec.music.src) },
    ...(spec.endcard?.credits ? { endcard: { ...spec.endcard, credits: spec.endcard.credits.map((row) => ({ ...row, items: row.items.map((item) => (item.logo ? { ...item, logo: map(item.logo) } : item)) })) } } : {}),
  }),
};

const newscast: Format<NewscastSpec> = {
  composition: "newscast",
  summary: "Cable-news bulletin from clips where presenters already speak their lines (e.g. H3 image-to-video): title sequence with a bundled news theme → each clip with its own sound, full frame or split like a news channel (presenter box left, the story's material right: PR, chart, figures, post, podcast, list, quote, image or clip), a headline band with desk tab, LIVE, show logo and on-air clock, a ticker, graphic wipes between segments → closing card with its sting. 16:9, 30 fps; length = 5.5 s titles + clips + card.",
  example: NEWSCAST_EXAMPLE,
  guide: [
    "segments: one clip per presenter line, in order. Each plays with its own audio for its full length; set fromSeconds/seconds only to trim silence you checked with probe_media or contact_sheet — never cut into speech.",
    "layout 'full' for greetings and sign-offs; 'split' for stories: the presenter's clip is cropped into a portrait box on the left, so use a centred chest-up shot.",
    "desk: the tab over the band (TECH, MARKETS, SOCIAL); presenter: the name under the headline; title: the headline, under 70 characters, digits and symbols allowed.",
    "material (split): 1–4 panels shown in turn, in the order the presenter mentions them. Kinds: pr {repo, number, title, author, state, additions, deletions, files, note}, chart {label, series[], value, note}, stats {title, items[{value,label}]}, post {author, handle, text, likes, reposts, time}, podcast {show, episode, quote, minute}, list {title, items[]}, quote {text, source}, image {src, caption}, video {src, caption, fromSeconds} (muted). Mark simulated values with illustrative: true — the panel says so on screen.",
    "ticker: 2–4 short UPPERCASE headlines. show.date is shown as written (e.g. 'SEPTEMBER 24, 2026').",
  ],
  parse: (value) => {
    if (!isObject(value) || !isObject(value.show) || !Array.isArray(value.segments)) throw new Error("newscast spec needs show (object) and segments (array). Call motion_formats for the example.");
    return value as unknown as NewscastSpec;
  },
  validate: validateNewscast,
  durationSeconds: newscastDurationSeconds,
  mediaOf: (spec) => [...spec.segments.map((s) => ({ kind: "video" as const, path: s.video })), ...newscastPanelMedia(spec)],
  withMedia: (spec, map) => ({ ...spec, segments: spec.segments.map((s) => ({ ...s, video: map(s.video), ...(s.material ? { material: s.material.map((p) => (p.kind === "image" || p.kind === "video" ? { ...p, src: map(p.src) } : p)) } : {}) })) }),
  // Segment lengths come from the clips, so the composition knows its duration.
  prepare: (spec) => ({ ...spec, segments: spec.segments.map((s) => ({ ...s, seconds: s.seconds ?? Math.max(0.5, probeMedia(s.video).durationSeconds - (s.fromSeconds ?? 0)) })) }),
};

const attelierOutro: Format<AttelierOutroSpec> = {
  composition: "attelier-outro",
  summary: "Attelier's own logo sign-off, only when the person asks for it: black picture, warm glow, the logo resolving from blur to sharp, an optional dark logo sting. Logo only, no tagline. 16x9, 9x16 or 1x1; 1.8 s by default. Rendered copies sit in the composition runtime as brand/attelier-outro-<aspect>.mp4 (attelier-outro skill).",
  example: ATTELIER_OUTRO_EXAMPLE,
  guide: [
    "aspect: match the video it closes (16x9, 9x16 or 1x1).",
    "Use it only when the person asks for the Attelier outro; a client's video ends on the client's brand.",
    "Inside a custom composition, append the staged mp4 instead of rendering this format (see the attelier-outro skill).",
  ],
  parse: (value) => {
    if (!isObject(value)) throw new Error("attelier-outro spec is an object such as { aspect: '16x9' }.");
    return value as AttelierOutroSpec;
  },
  validate: (spec) => validateAttelierOutro(spec),
  durationSeconds: attelierOutroDurationSeconds,
  mediaOf: () => [],
  withMedia: (spec) => spec,
};

export const FORMATS = { "model-compare": modelCompare, shootout, evolution, "making-of": makingOf, newscast, "attelier-outro": attelierOutro } as const;
export type FormatId = keyof typeof FORMATS;
