import { execFileSync } from "node:child_process";

export type MusicAnalysis = {
  durationSeconds: number;
  bpm: number;
  beatSeconds: number;
  firstBeatSeconds: number;
  /** RMS level per 4-beat bar, dBFS. */
  bars: { start: number; db: number }[];
  /** Bar starts where the track enters its loud section (drops) or falls away from it (breaks). */
  drops: number[];
  breaks: number[];
  /**
   * Track beat to start from so a drop lands on video beat `alignBeat` while
   * `needSeconds` of music remain; 0 when no drop qualifies.
   */
  suggestedOffsetBeats: number;
};

const SAMPLE_RATE = 22050;
const HOP = 128;
const WINDOW = 1024;

const decodeMono = (file: string, seconds: number): Float32Array => {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-t", String(seconds), "-i", file, "-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "f32le", "-"], { maxBuffer: 1 << 30 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
};

/** Spectral-flux-style onset envelope from a crude low/high band split, plus RMS. */
const envelopes = (x: Float32Array) => {
  const frames = Math.max(0, Math.floor((x.length - WINDOW) / HOP));
  const onset = new Float32Array(frames), rms = new Float32Array(frames);
  let prevLow = 0, prevHigh = 0;
  for (let f = 0; f < frames; f++) {
    let low = 0, high = 0, lp = 0, energy = 0;
    for (let i = 0; i < WINDOW; i++) {
      const s = x[f * HOP + i]!;
      lp += 0.08 * (s - lp); // one-pole low-pass ≈ 280 Hz
      low += lp * lp; high += (s - lp) * (s - lp); energy += s * s;
    }
    onset[f] = Math.max(0, Math.log1p(low * 50) - Math.log1p(prevLow * 50)) * 1.5 + Math.max(0, Math.log1p(high * 50) - Math.log1p(prevHigh * 50));
    prevLow = low; prevHigh = high;
    rms[f] = Math.sqrt(energy / WINDOW);
  }
  return { onset, rms, frameRate: SAMPLE_RATE / HOP };
};

/** Tempo by autocorrelating the onset envelope with fractional lags (70–180 BPM). */
export const estimateTempo = (onset: Float32Array, frameRate: number): number => {
  const at = (p: number) => { const i = Math.floor(p), r = p - i; return (onset[i] ?? 0) * (1 - r) + (onset[i + 1] ?? 0) * r; };
  let best = { bpm: 120, score: -1 };
  for (let bpm = 70; bpm <= 180; bpm += 0.25) {
    const lag = (60 / bpm) * frameRate;
    let score = 0;
    for (let f = 0; f + lag * 4 + 1 < onset.length; f++) score += onset[f]! * (at(f + lag) + 0.5 * at(f + 2 * lag) + 0.25 * at(f + 4 * lag));
    if (score > best.score) best = { bpm, score };
  }
  return best.bpm;
};

export type AnalyzeOptions = { maxSeconds?: number; alignBeat?: number; needSeconds?: number };

export const analyzeMusic = (file: string, options: AnalyzeOptions = {}): MusicAnalysis => {
  const { maxSeconds = 120, alignBeat = 16, needSeconds = 0 } = options;
  const x = decodeMono(file, maxSeconds);
  const { onset, rms, frameRate } = envelopes(x);
  const bpm = estimateTempo(onset, frameRate);
  const beat = 60 / bpm;
  let phase = { t: 0, s: -1 };
  for (let o = 0; o < beat; o += 0.005) {
    let s = 0;
    for (let t = o; t < onset.length / frameRate; t += beat) s += onset[Math.round(t * frameRate)] ?? 0;
    if (s > phase.s) phase = { t: o, s };
  }
  const bars: MusicAnalysis["bars"] = [];
  for (let start = phase.t; start < onset.length / frameRate; start += beat * 4) {
    let sum = 0, n = 0;
    for (let f = Math.round(start * frameRate); f < Math.min(rms.length, Math.round((start + beat * 4) * frameRate)); f++) { sum += rms[f]!; n++; }
    if (n) bars.push({ start: +start.toFixed(3), db: +(20 * Math.log10(sum / n + 1e-9)).toFixed(1) });
  }
  // "Loud" is relative to the track's own peak bar, so quiet mixes still work.
  const loud = Math.max(...bars.map((b) => b.db)) - 2.5;
  const drops: number[] = [], breaks: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1]!.db, cur = bars[i]!.db;
    if (cur >= loud && prev < loud) drops.push(bars[i]!.start);
    if (prev >= loud && cur < loud - 5.5) breaks.push(bars[i]!.start);
  }
  const duration = x.length / SAMPLE_RATE;
  const offsets = drops
    .map((d) => Math.round((d - phase.t) / beat) - alignBeat)
    .filter((offset) => offset >= 0 && phase.t + offset * beat + needSeconds <= duration);
  return {
    durationSeconds: +(x.length / SAMPLE_RATE).toFixed(3),
    bpm,
    beatSeconds: +beat.toFixed(4),
    firstBeatSeconds: +phase.t.toFixed(3),
    bars,
    drops,
    breaks,
    suggestedOffsetBeats: offsets[0] ?? 0,
  };
};
