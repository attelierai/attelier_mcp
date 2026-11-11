import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, realpathSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FORMATS, type Format, type FormatId } from "./formats/index.ts";
import { masterAudio, probeMedia } from "./media.ts";
import { validateCommonShape } from "./formats/spec-shape.ts";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let bundlePromise: Promise<string> | undefined;
/** Bundle the Remotion project once per process (≈10–20 s); renders reuse it. */
const bundleOnce = () => {
  bundlePromise ??= (async () => {
    const { bundle } = await import("@remotion/bundler");
    const outDir = path.join(os.tmpdir(), `attelier-motion-bundle-${process.pid}`);
    // The bundle and the media staged into it are per process; do not leave hundreds of MB in tmp.
    process.once("exit", () => rmSync(outDir, { recursive: true, force: true }));
    return bundle({
      entryPoint: path.join(packageRoot, "remotion", "index.ts"),
      publicDir: path.join(packageRoot, "assets"),
      outDir,
      onProgress: () => undefined,
    });
  })();
  return bundlePromise;
};

/** Copy one local media file into the bundle's public dir; returns its staticFile path.
 *  With roots, the file must really sit inside one of them (symlinks resolved). */
const stage = (serveUrl: string, file: string, roots?: readonly string[]) => {
  const absolute = path.resolve(file);
  if (!existsSync(absolute)) throw new Error(`Media not found: ${absolute}`);
  if (roots) {
    const actual = realpathSync(absolute);
    if (!roots.some((root) => { const real = realpathSync(root); return actual === real || actual.startsWith(real + path.sep); })) throw new Error(`Media ${file} is outside the working folder.`);
  }
  const { size, mtimeMs } = statSync(absolute);
  const key = createHash("sha1").update(`${absolute}:${size}:${mtimeMs}`).digest("hex").slice(0, 16);
  const rel = `media/${key}${path.extname(absolute).toLowerCase()}`;
  const target = path.join(serveUrl, "public", rel);
  if (!existsSync(target)) {
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(absolute, target);
  }
  return rel;
};

export type RenderRequest = {
  format: FormatId;
  spec: unknown;
  output: string;
  /** Render a single frame at this time instead of the video. */
  stillAtSeconds?: number;
  /** Fast review render: scale 0.5, no mastering. */
  preview?: boolean;
  /** Web delivery by default; master retains the original high bitrate profile. */
  profile?: "web" | "master";
  /** Folders the spec's media must sit in (a hosted agent's working folder); unset reads any path. */
  mediaRoots?: readonly string[];
};

export type RenderResult = {
  output: string;
  durationSeconds: number;
  frames?: number;
  loudness?: { lufs: number; truePeakDb: number };
  warnings: string[];
};

/**
 * Attelier taste a spec can break without being invalid, reported as render
 * warnings. Titles are the short on-screen strings under title-like keys.
 */
export const tasteWarnings = (spec: unknown): string[] => {
  const warnings: string[] = [];
  const visit = (value: unknown, key: string, where: string) => {
    if (typeof value === "string") {
      // No full stop after a year or a short title ("Quita el punto después de 2026").
      if (/title|heading|overline|kicker|label|name|tag|cta|year/i.test(key) && value.length <= 60 && /[^.]\.$/.test(value.trim())) warnings.push(`${where}: "${value}" ends with a full stop; titles don't.`);
      return;
    }
    if (Array.isArray(value)) value.forEach((item, i) => visit(item, key, `${where}[${i}]`));
    else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) visit(v, k, where ? `${where}.${k}` : k);
  };
  visit(spec, "", "");
  return warnings;
};

export const renderFormat = async (request: RenderRequest): Promise<RenderResult> => {
  validateCommonShape(request.spec);
  if (request.stillAtSeconds !== undefined && (!Number.isFinite(request.stillAtSeconds) || request.stillAtSeconds < 0)) throw new Error("stillAtSeconds: expected a finite non-negative number.");
  if (request.profile !== undefined && request.profile !== "web" && request.profile !== "master") throw new Error("profile: expected web or master.");
  const format = FORMATS[request.format] as unknown as Format<unknown> | undefined;
  if (!format) throw new Error(`Unknown format ${request.format}. Known: ${Object.keys(FORMATS).join(", ")}.`);
  const spec = format.parse(request.spec);
  const shapeErrors = request.format === "shootout" ? format.validate(spec) : [];
  if (shapeErrors.length) throw new Error(`Spec is invalid:\n- ${shapeErrors.join("\n- ")}`);
  const media = format.mediaOf(spec);
  // Validate confinement before probing, as well as when staging derived files.
  if (request.mediaRoots) for (const file of media) {
    const actual = realpathSync(file.path);
    if (!request.mediaRoots.some((root) => { const real = realpathSync(root); return actual === real || actual.startsWith(real + path.sep); })) throw new Error(`Media ${file.path} is outside the working folder.`);
  }
  const videos = media.filter((m) => m.kind === "video").map((m) => ({ path: m.path, probe: probeMedia(m.path) }));
  const audio = media.find((m) => m.kind === "audio");
  const errors = format.validate(spec, videos.map((v) => v.probe.durationSeconds), audio ? probeMedia(audio.path).durationSeconds : undefined);
  // Formats are 16:9; a portrait or square clip would be cropped to a sliver.
  for (const { path: file, probe } of videos) {
    const v = probe.video;
    if (v && v.width / v.height < 1.5) errors.push(`${file}: ${v.width}×${v.height} is not landscape; regenerate it at 16:9 (e.g. aspect_ratio "16:9") — cover-cropping would lose most of the frame.`);
  }
  if (errors.length) throw new Error(`Spec is invalid:\n- ${errors.join("\n- ")}`);
  const taste = tasteWarnings(spec);

  const workDir = path.join(os.tmpdir(), "attelier-motion", `prep-${process.pid}-${Date.now()}`);
  mkdirSync(workDir, { recursive: true });
  try {
    const prepared = format.prepare ? format.prepare(spec, workDir) : spec;
    const serveUrl = await bundleOnce();
    const staged = format.withMedia(prepared, (file) => stage(serveUrl, file, request.mediaRoots ? [...request.mediaRoots, workDir] : undefined));
    const { selectComposition, renderMedia, renderStill } = await import("@remotion/renderer");
    // Remotion merges input props over the composition's default props (the format's example), so an optional
    // field the spec leaves out would silently take the example's value; send it as null instead.
    const inputProps = { ...Object.fromEntries(Object.keys(format.example as object).map((key) => [key, null])), ...(staged as Record<string, unknown>) };
    const logLevel = "error" as const;
    const composition = await selectComposition({ serveUrl, id: format.composition, inputProps, logLevel });
    mkdirSync(path.dirname(path.resolve(request.output)), { recursive: true });
    const durationSeconds = composition.durationInFrames / composition.fps;

    if (request.stillAtSeconds !== undefined) {
      const frame = Math.min(composition.durationInFrames - 1, Math.max(0, Math.round(request.stillAtSeconds * composition.fps)));
      await renderStill({ composition, serveUrl, output: request.output, frame, inputProps, imageFormat: "png", logLevel });
      return { output: request.output, durationSeconds, warnings: taste };
    }

    const raw = request.preview ? request.output : `${request.output}.raw.mp4`;
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: raw,
      inputProps,
      crf: request.preview ? 28 : request.profile === "master" ? 17 : 21,
      // Large screen recordings (4K, long seeks) can take longer than the 30 s default per frame.
      timeoutInMilliseconds: 180_000,
      scale: request.preview ? 0.5 : 1,
      concurrency: Math.max(1, Math.min(12, os.cpus().length - 2)),
      logLevel,
    });
    if (request.preview) return { output: raw, durationSeconds, frames: composition.durationInFrames, warnings: taste };
    // A format without any sound (attelier-outro with sting: false) has no audio to master.
    if (!probeMedia(raw).audio) {
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", raw, "-c", "copy", "-movflags", "+faststart", request.output]);
      rmSync(raw, { force: true });
      return { output: request.output, durationSeconds, frames: composition.durationInFrames, warnings: taste };
    }
    const mastered = masterAudio(raw, request.output, -1.5);
    rmSync(raw, { force: true });
    const warnings = [...taste, ...(mastered.truePeakDb > -1 ? [`True peak ${mastered.truePeakDb} dBFS after limiting.`] : [])];
    return { output: request.output, durationSeconds, frames: composition.durationInFrames, loudness: { lufs: mastered.lufs, truePeakDb: mastered.truePeakDb }, warnings };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
};
