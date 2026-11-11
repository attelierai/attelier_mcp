import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

/** ffmpeg writes filter logs to stderr. */
const ffmpegLog = (args: string[]) => spawnSync("ffmpeg", args, { encoding: "utf8", maxBuffer: 1 << 28 }).stderr;

export type MediaProbe = {
  durationSeconds: number;
  video?: { width: number; height: number; fps: number; codec: string };
  audio?: { codec: string; sampleRate: number };
  /** Hard cuts (scene score > 0.3), seconds. Video only. */
  sceneCuts: number[];
  /** Integrated loudness and true peak, when the file has audio. */
  loudness?: { lufs: number; truePeakDb: number };
};

const ratio = (value: string) => {
  const [n, d] = value.split("/").map(Number);
  return d ? n! / d : n!;
};

export const probeMedia = (file: string): MediaProbe => {
  const info = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]).toString()) as {
    streams: { codec_type: string; codec_name: string; width?: number; height?: number; r_frame_rate?: string; sample_rate?: string }[];
    format: { duration?: string };
  };
  const v = info.streams.find((s) => s.codec_type === "video");
  const a = info.streams.find((s) => s.codec_type === "audio");
  const probe: MediaProbe = { durationSeconds: Number(info.format.duration ?? 0), sceneCuts: [] };
  if (v?.width && v.height) probe.video = { width: v.width, height: v.height, fps: +ratio(v.r_frame_rate ?? "0/1").toFixed(3), codec: v.codec_name };
  if (a) probe.audio = { codec: a.codec_name, sampleRate: Number(a.sample_rate ?? 0) };
  if (probe.video) {
    const log = ffmpegLog(["-i", file, "-vf", "select='gt(scene,0.3)',showinfo", "-f", "null", "-"]);
    probe.sceneCuts = [...log.matchAll(/pts_time:([\d.]+)/g)].map((m) => +Number(m[1]).toFixed(3));
  }
  if (probe.audio) probe.loudness = measureLoudness(file);
  return probe;
};

export const measureLoudness = (file: string) => {
  const log = ffmpegLog(["-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"]);
  const summary = log.slice(log.lastIndexOf("Summary:"));
  const lufs = Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1] ?? NaN);
  const truePeakDb = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(summary)?.[1] ?? NaN);
  return { lufs, truePeakDb };
};

/**
 * A grid of frames: either `everySeconds` apart or at explicit `atSeconds`.
 * Returns the PNG path; agents read it as an image to review a video in one look.
 */
export const contactSheet = (file: string, out: string, options: { everySeconds?: number; atSeconds?: number[]; columns?: number; tileWidth?: number } = {}) => {
  const columns = options.columns ?? 6;
  const tileWidth = options.tileWidth ?? 320;
  mkdirSync(path.dirname(out), { recursive: true });
  if (options.atSeconds?.length) {
    const times = options.atSeconds;
    const select = times.map((s) => `lt(prev_pts*TB\\,${s})*gte(pts*TB\\,${s})`).join("+");
    const rows = Math.ceil(times.length / columns);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", file, "-vf", `select='${select}',scale=${tileWidth}:-2,tile=${columns}x${rows}`, "-fps_mode", "vfr", "-frames:v", "1", out]);
  } else {
    const duration = probeDuration(file);
    const every = options.everySeconds ?? Math.max(0.5, duration / 24);
    const rows = Math.ceil(duration / every / columns);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", file, "-vf", `fps=1/${every},scale=${tileWidth}:-2,tile=${columns}x${rows}`, "-frames:v", "1", out]);
  }
  return out;
};

const probeDuration = (file: string) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());

/**
 * Social-ready master without touching the video stream: loudness-normalise to
 * `lufs` with a true-peak ceiling (loudnorm limits inter-sample peaks, which a
 * plain sample limiter misses once AAC is encoded).
 */
export const masterAudio = (input: string, output: string, ceilingDb = -1.5, lufs = -14) => {
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", input, "-c:v", "copy", "-af", `loudnorm=I=${lufs}:TP=${ceilingDb}:LRA=11,aresample=48000`, "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", output]);
  return { output, ...measureLoudness(output) };
};

export type MomentAnalysis = {
  /** Mean frame-to-frame change per `stepSeconds`, 0–1 scaled to the clip's own max. */
  motion: { at: number; value: number }[];
  /** Start of the `windowSeconds` span with the most motion. */
  bestStart: number;
  windowSeconds: number;
};

/**
 * Where a clip is most alive: frame-difference energy (downscaled luma), then
 * the window with the highest mean. Skips `skipSeconds` of model warm-up.
 */
export const findMoments = (file: string, windowSeconds: number, options: { stepSeconds?: number; skipSeconds?: number } = {}): MomentAnalysis => {
  const step = options.stepSeconds ?? 0.1;
  const skip = options.skipSeconds ?? 0.2;
  const log = ffmpegLog(["-i", file, "-vf", "scale=160:-2,format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-an", "-f", "null", "-"]);
  const times = [...log.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
  const values = [...log.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
  const buckets = new Map<number, { sum: number; n: number }>();
  times.forEach((t, i) => {
    const key = Math.floor(t / step);
    const b = buckets.get(key) ?? { sum: 0, n: 0 };
    b.sum += values[i] ?? 0; b.n += 1;
    buckets.set(key, b);
  });
  const raw = [...buckets.entries()].sort(([a], [b]) => a - b).map(([k, b]) => ({ at: +(k * step).toFixed(3), value: b.sum / b.n }));
  const max = Math.max(1e-9, ...raw.map((r) => r.value));
  const motion = raw.map((r) => ({ at: r.at, value: +(r.value / max).toFixed(3) }));
  const span = Math.max(1, Math.round(windowSeconds / step));
  let best = { start: skip, score: -1 };
  for (let i = 0; i + span <= motion.length; i++) {
    if (motion[i]!.at < skip) continue;
    let score = 0;
    for (let j = i; j < i + span; j++) score += motion[j]!.value;
    if (score > best.score) best = { start: motion[i]!.at, score };
  }
  return { motion, bestStart: best.start, windowSeconds };
};

export type VideoReview = {
  durationSeconds: number;
  /** One or a few frames much brighter than the frames around them, then back: the flash at a bad transition. */
  flashes: { atSeconds: number; frames: number; lumaJump: number }[];
  /** Spans of (near) black picture; a deliberate dip to black shows up here too, so judge each one. */
  blackSpans: { startSeconds: number; endSeconds: number }[];
  loudness?: { lufs: number; truePeakDb: number };
  /** Frame cadence in moving picture: repeated frames between moving ones (a 24 fps clip placed in a 30 fps
   *  edit repeats every 5th frame and judders). Holds and still titles are not counted. */
  cadence: CadenceReview;
  /** Plain-language problems to fix before delivering; empty when none were found. */
  issues: string[];
};

export type CadenceReview = {
  /** Frames compared while the picture moves. */
  movingFrames: number;
  /** Frames that repeat the previous one although the frames around them move. */
  repeatedFrames: number;
  /** repeatedFrames / movingFrames. */
  repeatRatio: number;
  /** Most common distance in frames between repeats (5 = 24 fps material in a 30 fps edit). */
  period?: number;
  /** Where the repeats cluster, so the offending clip can be found. */
  spans: { startSeconds: number; endSeconds: number; repeats: number }[];
  judder: boolean;
};

/** Per-frame picture change (downscaled luma difference to the previous frame); index i compares frames i and i+1. */
const frameDifferences = (file: string) => {
  const log = ffmpegLog(["-i", file, "-vf", "scale=160:-2,format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-an", "-f", "null", "-"]);
  return [...log.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
};

/**
 * Cadence check: a repeated frame is one whose change from the previous frame is a small fraction of
 * the change around it while the picture moves. Regular repeats in a moving shot are judder: frame-rate
 * mismatch (24 → 30 fps duplicates every 5th frame) or a slowed clip without frame blending.
 */
export const reviewCadence = (file: string, fps: number, differences = frameDifferences(file)): CadenceReview => {
  const moving = (value: number | undefined) => value !== undefined && value >= 0.8;
  const repeats: number[] = [];
  let movingFrames = 0;
  for (let i = 1; i + 1 < differences.length; i++) {
    const before = differences[i - 1], after = differences[i + 1], here = differences[i]!;
    if (!moving(before) || !moving(after)) continue;
    movingFrames += 1;
    if (here < 0.2 * Math.min(before!, after!)) repeats.push(i + 1);
  }
  const gaps = new Map<number, number>();
  repeats.slice(1).forEach((frame, i) => { const gap = frame - repeats[i]!; if (gap <= 12) gaps.set(gap, (gaps.get(gap) ?? 0) + 1); });
  const [period, periodCount] = [...gaps.entries()].sort((a, b) => b[1] - a[1])[0] ?? [undefined, 0];
  const spans: CadenceReview["spans"] = [];
  for (const frame of repeats) {
    const last = spans.at(-1);
    const at = frame / fps;
    if (last && at - last.endSeconds <= 0.5) { last.endSeconds = +at.toFixed(3); last.repeats += 1; }
    else spans.push({ startSeconds: +at.toFixed(3), endSeconds: +at.toFixed(3), repeats: 1 });
  }
  const repeatRatio = movingFrames ? +(repeats.length / movingFrames).toFixed(3) : 0;
  // Judder is a regular pattern, not the odd encoder repeat: at least ~1 in 12 moving frames, mostly at one interval.
  const judder = repeats.length >= 4 && repeatRatio >= 0.08 && periodCount >= Math.max(2, (repeats.length - 1) * 0.5);
  return { movingFrames, repeatedFrames: repeats.length, repeatRatio, ...(period ? { period } : {}), spans: spans.filter((span) => span.repeats >= 2), judder };
};

/**
 * The automatic part of reviewing a render (Attelier taste: "check every
 * transition for flashes"): per-frame brightness finds short flashes, ffmpeg's
 * blackdetect finds black spans, repeated frames in moving picture reveal judder, and the audio is
 * measured for clipping.
 */
export const reviewVideo = (file: string, options: { flashJump?: number } = {}): VideoReview => {
  const probe = probeMedia(file);
  const fps = probe.video?.fps || 30;
  const jump = options.flashJump ?? 40;
  const log = ffmpegLog(["-i", file, "-vf", "scale=160:-2,format=gray,signalstats,metadata=print:key=lavfi.signalstats.YAVG,blackdetect=d=0.05:pix_th=0.08", "-an", "-f", "null", "-"]);
  const luma = [...log.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
  // A frame is part of a flash when it stands `jump` above the picture a few frames before and after, and the picture returns to that level.
  const reach = Math.max(2, Math.round(fps / 10));
  const flashes: VideoReview["flashes"] = [];
  for (let i = reach; i + reach < luma.length; i++) {
    const before = luma[i - reach]!, after = luma[i + reach]!, here = luma[i]!;
    if (here - Math.max(before, after) < jump || Math.abs(before - after) > jump / 2) continue;
    const last = flashes.at(-1);
    const at = +(i / fps).toFixed(3);
    if (last && i - Math.round(last.atSeconds * fps) - last.frames < reach) { last.frames += 1; last.lumaJump = Math.max(last.lumaJump, Math.round(here - Math.max(before, after))); }
    else flashes.push({ atSeconds: at, frames: 1, lumaJump: Math.round(here - Math.max(before, after)) });
  }
  const cadence = reviewCadence(file, fps);
  const blackSpans = [...log.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => ({ startSeconds: +Number(m[1]).toFixed(3), endSeconds: +Number(m[2]).toFixed(3) }));
  const issues = [
    // A format may flash on purpose (the shootout's slams and round starts); only a flash nobody designed is a defect.
    ...flashes.map((f) => `Flash at ${f.atSeconds.toFixed(2)} s (${f.frames} frame${f.frames > 1 ? "s" : ""}, brightness +${f.lumaJump}): unless the format flashes there on purpose, look at it with contact_sheet atSeconds and fix the transition.`),
    ...(cadence.judder ? [`Judder: ${cadence.repeatedFrames} of ${cadence.movingFrames} moving frames repeat the previous one${cadence.period ? ` (every ${cadence.period} frames${cadence.period === 5 && Math.round(fps) === 30 ? ", 24 fps material in a 30 fps edit" : ""})` : ""}, at ${cadence.spans.slice(0, 4).map((span) => `${span.startSeconds.toFixed(1)}–${span.endSeconds.toFixed(1)} s`).join(", ") || "several places"}. Match the composition's fps to the source, or conform the clip with frame blending (ffmpeg minterpolate or framerate filter) instead of repeating frames; don't slow clips without blending.`] : []),
    ...(probe.loudness && probe.loudness.truePeakDb > -1 ? [`Audio true peak ${probe.loudness.truePeakDb} dBTP clips on social platforms: master it to -1.5 dBTP.`] : []),
  ];
  return { durationSeconds: probe.durationSeconds, flashes, blackSpans, ...(probe.loudness ? { loudness: probe.loudness } : {}), cadence, issues };
};
