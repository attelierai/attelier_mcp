import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { FORMATS, type Format, type FormatId, type MediaRef } from "./formats/index.ts";
import { probeMedia } from "./media.ts";
import { renderFormat } from "./render.ts";

const ffmpeg = (...args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args]);

/** Synthetic stand-ins for the example's media: landscape clips with sound, a long music tone, a short voice-over, a still. */
const synthesize = (dir: string, ref: MediaRef, index: number): string => {
  if (ref.kind === "video") {
    const file = path.join(dir, `clip-${index}.mp4`);
    ffmpeg("-f", "lavfi", "-i", "testsrc2=s=1280x720:r=30:d=12", "-f", "lavfi", "-i", "sine=f=330:d=12",
      "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", file);
    return file;
  }
  if (ref.kind === "audio") {
    const file = path.join(dir, `audio-${index}.wav`);
    const seconds = path.basename(ref.path).startsWith("vo") ? 3 : 90;
    ffmpeg("-f", "lavfi", "-i", `sine=f=220:sample_rate=48000:d=${seconds}`, file);
    return file;
  }
  const file = path.join(dir, `image-${index}.png`);
  ffmpeg("-f", "lavfi", "-i", "testsrc2=s=1280x720", "-frames:v", "1", file);
  return file;
};

test("every format renders a full-HD still from its own example spec and leaves no preparation files", {
  skip: process.env.ATTELIER_TEST_COMPOSITION_RENDER !== "1", timeout: 600_000,
}, async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "attelier-formats-test-"));
  try {
    for (const id of Object.keys(FORMATS) as FormatId[]) {
      const format = FORMATS[id] as unknown as Format<unknown>;
      const mapping = new Map<string, string>();
      format.mediaOf(format.example).forEach((ref, index) => {
        if (!mapping.has(ref.path)) mapping.set(ref.path, synthesize(dir, ref, index));
      });
      const spec = format.withMedia(format.example, (file) => mapping.get(file) ?? file);
      const output = path.join(dir, `${id}.png`);
      const result = await renderFormat({ format: id, spec, output, stillAtSeconds: format.durationSeconds(spec) / 2 });
      assert.ok(result.durationSeconds > 0, id);
      const still = probeMedia(output).video;
      assert.equal(still?.width, 1920, id);
      assert.equal(still?.height, 1080, id);
    }
    const prepRoot = path.join(os.tmpdir(), "attelier-motion");
    const leftovers = existsSync(prepRoot) ? readdirSync(prepRoot).filter((name) => name.startsWith(`prep-${process.pid}-`)) : [];
    assert.deepEqual(leftovers, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
