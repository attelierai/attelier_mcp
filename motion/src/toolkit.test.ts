import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { analyzeMusic } from "./audio.ts";
import { MODEL_COMPARE_EXAMPLE, validateModelCompare } from "./formats/model-compare.ts";
import { contactSheet, probeMedia, reviewVideo } from "./media.ts";

const dir = mkdtempSync(path.join(os.tmpdir(), "attelier-motion-test-"));
after(() => rmSync(dir, { recursive: true, force: true }));

/** 8 bars of quiet clicks, then 12 loud bars, at 120 BPM (beat 0.5 s). */
const clickTrack = () => {
  const file = path.join(dir, "clicks.wav");
  const kick = (v: number) => `${v}*sin(2*PI*60*t)*exp(-30*mod(t,0.5))*lt(mod(t,0.5),0.15)`;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `aevalsrc='if(lt(t,16),${kick(0.08)},${kick(0.8)})':s=22050:d=40`, file]);
  return file;
};

test("analyzeMusic finds tempo, phase and the drop, and aligns it to beat 16", () => {
  const music = analyzeMusic(clickTrack(), { needSeconds: 20 });
  assert.ok(Math.abs(music.bpm - 120) <= 1, `bpm ${music.bpm}`);
  assert.ok(music.firstBeatSeconds < 0.06, `first beat ${music.firstBeatSeconds}`);
  assert.equal(music.drops.length, 1);
  assert.ok(Math.abs(music.drops[0]! - 16) < 0.3, `drop ${music.drops[0]}`);
  // Drop is track beat 32 → start 16 beats in so it lands on video beat 16.
  assert.equal(music.suggestedOffsetBeats, 16);
});

test("analyzeMusic refuses an offset that runs out of music", () => {
  const music = analyzeMusic(clickTrack(), { needSeconds: 60 });
  assert.equal(music.suggestedOffsetBeats, 0);
});

test("model-compare validation explains what to change", () => {
  assert.deepEqual(validateModelCompare(MODEL_COMPARE_EXAMPLE, [5, 5, 5, 5], 60), []);
  const slow = { ...MODEL_COMPARE_EXAMPLE, music: { ...MODEL_COMPARE_EXAMPLE.music, beatSeconds: 0.6 } };
  const [clip] = validateModelCompare(slow, [5, 5, 5, 5]);
  assert.match(clip!, /shorter than the 5\.40 s a showcase needs at 100 BPM; use a faster track \(≥ 108 BPM\)/);
  const short = validateModelCompare(MODEL_COMPARE_EXAMPLE, [5, 5, 5, 5], 30);
  assert.match(short[0]!, /music: starting at 7\.98 s leaves 22\.02 s/);
  const three = validateModelCompare({ ...MODEL_COMPARE_EXAMPLE, models: MODEL_COMPARE_EXAMPLE.models.slice(0, 3) });
  assert.match(three[0]!, /exactly 4 models, got 3/);
});

test("probeMedia and contactSheet read a generated clip", () => {
  const clip = path.join(dir, "clip.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=24:d=4", "-f", "lavfi", "-i", "sine=f=440:d=4", "-shortest", clip]);
  const probe = probeMedia(clip);
  assert.equal(probe.video?.width, 640);
  assert.equal(probe.video?.fps, 24);
  assert.ok(Math.abs(probe.durationSeconds - 4) < 0.1);
  assert.ok(Number.isFinite(probe.loudness?.lufs));
  const sheet = contactSheet(clip, path.join(dir, "sheet.png"), { atSeconds: [0.5, 1.5, 2.5, 3.5], columns: 2 });
  assert.ok(existsSync(sheet));
});

test("shootout timeline puts rounds, race and vote on the beat grid", async () => {
  const { shootoutTimeline, validateShootout, SHOOTOUT_EXAMPLE, shootoutTotals } = await import("./formats/shootout.ts");
  // 4 models × 5 solo beats + 4 grid beats = 24-beat rounds.
  const t = shootoutTimeline(0.5, 2);
  assert.equal(t.roundsStart, 8);
  assert.equal(t.solo(1, 2), (16 + 24 + 10) * 0.5);
  assert.equal(t.race, 32);
  assert.equal(t.vote, 40);
  assert.equal(t.end, 50);
  assert.equal(shootoutTimeline(0.5, 2, 4, { vote: 20 }).end, 54);
  assert.deepEqual(validateShootout(SHOOTOUT_EXAMPLE, [5, 5, 5, 5], 60), []);
  const late = { ...SHOOTOUT_EXAMPLE, shots: [{ ...SHOOTOUT_EXAMPLE.shots[0]!, clips: SHOOTOUT_EXAMPLE.shots[0]!.clips.map((c) => ({ ...c, fromSeconds: 4 })) }] };
  assert.match(validateShootout(late, [5, 5, 5, 5])[0]!, /exceeds the 5\.00 s clip; start at ≤ 2\.85/);
  assert.equal(shootoutTotals(SHOOTOUT_EXAMPLE)[0]!.genSeconds, 60);
});

test("findMoments locates the busiest window", async () => {
  const { findMoments } = await import("./media.ts");
  const clip = path.join(dir, "still-then-moving.mp4");
  // 2 s of a still frame, then 2 s of moving noise.
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=gray:s=320x180:r=24:d=2", "-f", "lavfi", "-i", "nullsrc=s=320x180:r=24:d=2,geq=random(1)*255:128:128", "-filter_complex", "[0][1]concat=n=2:v=1", clip]);
  const moments = findMoments(clip, 1);
  assert.ok(moments.bestStart >= 1.9, `bestStart ${moments.bestStart}`);
});

test("evolution timeline, sweep and validation", async () => {
  const { evolutionTimeline, sweepCutoffs, validateEvolution, EVOLUTION_EXAMPLE } = await import("./formats/evolution.ts");
  const t = evolutionTimeline(0.5, 3);
  assert.equal(t.rewind, 4);
  assert.equal(t.era(0), 8);
  assert.equal(t.era(2), 20);
  assert.equal(t.finale, 26);
  assert.equal(t.closing, 30);
  assert.equal(t.end, 39);
  assert.equal(evolutionTimeline(0.5, 3, {}, false).end, 34);
  assert.deepEqual(sweepCutoffs(3), [700, 4200, 20000]);
  assert.deepEqual(validateEvolution(EVOLUTION_EXAMPLE, [5, 5, 5], 60), []);
  assert.match(validateEvolution({ ...EVOLUTION_EXAMPLE, eras: EVOLUTION_EXAMPLE.eras.map((e) => ({ ...e, fromSeconds: 1 })) }, [5, 5, 5])[0]!, /start at ≤ 0\.19/);
});

test("reviewVideo finds a two-frame flash and a black span, and leaves a steady picture alone", () => {
  const file = path.join(dir, "flash.mp4");
  // 3 s of mid grey at 30 fps; frames 45–46 flash white; 2.0–2.3 s dips to black.
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x606060:s=320x180:r=30:d=3",
    "-vf", "drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='between(n,45,46)',drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='between(t,2,2.3)'",
    "-pix_fmt", "yuv420p", file]);
  const review = reviewVideo(file);
  assert.equal(review.flashes.length, 1, JSON.stringify(review.flashes));
  assert.ok(Math.abs(review.flashes[0]!.atSeconds - 1.5) < 0.05, `flash at ${review.flashes[0]!.atSeconds}`);
  assert.equal(review.flashes[0]!.frames, 2);
  assert.equal(review.blackSpans.length, 1);
  assert.ok(Math.abs(review.blackSpans[0]!.startSeconds - 2) < 0.05);
  assert.match(review.issues[0]!, /^Flash at 1\.50 s \(2 frames/);

  const steady = path.join(dir, "steady.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x606060:s=320x180:r=30:d=2", "-pix_fmt", "yuv420p", steady]);
  assert.deepEqual(reviewVideo(steady).issues, []);
});

test("reviewVideo flags 24 → 30 fps judder and passes native 30 fps motion", () => {
  const encode = (source: string, filter: string, out: string) => {
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", source, ...(filter ? ["-vf", filter] : []), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", out]);
    return out;
  };
  // A moving 24 fps shot conformed to 30 fps by repeating frames, as a 24 fps clip dropped into a 30 fps edit.
  const judder = reviewVideo(encode("testsrc2=s=640x360:r=24:d=4", "fps=30", path.join(dir, "judder.mp4")));
  assert.equal(judder.cadence.judder, true, JSON.stringify(judder.cadence));
  assert.equal(judder.cadence.period, 5);
  assert.ok(judder.issues.some((issue) => /^Judder: .*24 fps material in a 30 fps edit/.test(issue)), judder.issues.join("\n"));
  const native = reviewVideo(encode("testsrc2=s=640x360:r=30:d=4", "", path.join(dir, "native.mp4")));
  assert.equal(native.cadence.judder, false, JSON.stringify(native.cadence));
  assert.ok(native.cadence.movingFrames > 100);
  assert.deepEqual(native.issues, []);
});

test("tasteWarnings flags a full stop after a title, not after a sentence or an ellipsis", async () => {
  const { tasteWarnings } = await import("./render.ts");
  assert.deepEqual(tasteWarnings({ title: "Four models, one prompt.", intro: { overline: "2026." }, voiceover: "This sentence ends normally.", end: { cta: "Try it..." } }), [
    'title: "Four models, one prompt." ends with a full stop; titles don\'t.',
    'intro.overline: "2026." ends with a full stop; titles don\'t.',
  ]);
});

test("shootout works without music: a 120 BPM grid, the clips' own sound, no audio track to stage", async () => {
  const { FORMATS } = await import("./formats/index.ts");
  const { SHOOTOUT_EXAMPLE, shootoutDefaults, shootoutDurationSeconds, validateShootout } = await import("./formats/shootout.ts");
  const { music: _music, ...silent } = SHOOTOUT_EXAMPLE;
  const spec = FORMATS.shootout.parse(silent);
  assert.deepEqual(validateShootout(spec), []);
  assert.equal(shootoutDefaults(spec).clipAudio, 0.8);
  assert.equal(shootoutDurationSeconds(spec), (16 + 4 * 5 + 4 + 16 + 12 + 8) * 0.5);
  assert.ok(FORMATS.shootout.mediaOf(spec).every((m) => m.kind === "video"));
});
