import { spawn } from "node:child_process";
import { closeSync, constants, copyFileSync, existsSync, fstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { ensureBrowser } from "@remotion/renderer";
const OUTRO_ASPECTS = ["16x9", "9x16", "1x1"] as const;
import { compositionFrames, compositionScale, validateComposition, type MotionComposition, type MotionRenderMode } from "./composition.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_BYTES = 512 * 1024 * 1024;
const dependencyFile = fileURLToPath(import.meta.resolve("@remotion/renderer"));
const store = dependencyFile.split(`${path.sep}.pnpm${path.sep}`)[0] + `${path.sep}.pnpm`;

export type CompositionRenderRequest = {
  composition: MotionComposition; mode?: MotionRenderMode; output: string;
  media?: Array<{ name: string; file: string; extension?: string }>;
  signal?: AbortSignal; browserExecutable?: string;
};

/** Generated code sees only this render's snapshot, public dependencies and a
 * writable scratch directory. No host HOME, credentials, project tree or network. */
export const renderComposition = async (request: CompositionRenderRequest) => {
  const composition = validateComposition(request.composition), mode = request.mode ?? {};
  const frames = compositionFrames(composition, mode);
  if (request.signal?.aborted) throw new Error("Render cancelled.");
  if (!existsSync("/usr/bin/bwrap") || !existsSync("/usr/bin/systemd-run") || !existsSync(store)) throw new Error("Custom Remotion needs bubblewrap, a systemd user manager and the pinned pnpm runtime.");
  const browser = await ensureBrowser({ ...(request.browserExecutable ? { browserExecutable: request.browserExecutable } : {}), logLevel: "error" });
  if (!("path" in browser)) throw new Error("A headless Remotion browser must be installed before rendering.");
  const browserFile = realpathSync(browser.path), browserDirectory = path.dirname(browserFile);
  if (request.signal?.aborted) throw new Error("Render cancelled.");
  if ((request.media?.length ?? 0) > 32) throw new Error("At most 32 media bindings are supported.");
  const scratch = mkdtempSync(path.join(tmpdir(), "attelier-composition-"));
  const input = path.join(scratch, "input"), output = path.join(scratch, "output");
  mkdirSync(path.join(input, "public"), { recursive: true }); mkdirSync(output);
  const media: Record<string, string> = {};
  try {
    let total = 0;
    for (const item of request.media ?? []) {
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(item.name) || Object.hasOwn(media, item.name)) throw new Error("Media bindings need unique names (letters, digits, dashes, underscores).");
      const file = realpathSync(item.file), stat = statSync(file);
      total += stat.size;
      if (!stat.isFile() || total > 2 * 1024 ** 3) throw new Error("Composition media must be regular files totalling at most 2 GiB.");
      const extension = item.extension ?? path.extname(file).toLowerCase();
      if (!/^\.(mp4|mov|webm|png|jpe?g|webp|mp3|wav|m4a|ogg|woff2?|ttf|otf)$/.test(extension)) throw new Error("Unsupported composition media type.");
      const name = `${item.name}${extension}`; copyFileSync(file, path.join(input, "public", name)); media[item.name] = name;
    }
    // Prepared fonts have fixed names, independent of the author's filesystem.
    mkdirSync(path.join(input, "public", "fonts"));
    for (const name of readdirSync(path.join(root, "assets/brand/fonts")).filter(name => name.endsWith(".woff2"))) copyFileSync(path.join(root, "assets/brand/fonts", name), path.join(input, "public/fonts", name));
    // Attelier's own sign-off (attelier-outro skill): the outro per aspect ratio and the white logo, as staticFile("brand/…").
    mkdirSync(path.join(input, "public", "brand"));
    for (const name of [...OUTRO_ASPECTS.map(aspect => `attelier-outro-${aspect}.mp4`), "attelier-logo-white.png"]) copyFileSync(path.join(root, "assets/brand", name), path.join(input, "public/brand", name));
    writeFileSync(path.join(input, "request.json"), JSON.stringify({ composition, mode, media }), { mode: 0o600 });
    writeFileSync(path.join(input, "hosts"), "127.0.0.1 localhost\n::1 localhost\n");
    writeFileSync(path.join(input, "nsswitch.conf"), "hosts: files\n");
    const mounts = [...new Set([root, store, browserDirectory])].flatMap(folder => ["--ro-bind", folder, folder]);
    // A full-quality video render (no preview, no still) gets room for a 30-second 1080p cut with video layers;
    // stills and previews keep the tight limits that keep iteration snappy and the server responsive.
    const finalVideo = typeof frames !== "number" && !mode.preview;
    const limits = finalVideo ? { memory: "4G", cpuQuota: "400%", cpuSeconds: 2400, wallMs: 900_000 } : { memory: "2G", cpuQuota: "200%", cpuSeconds: 300, wallMs: 300_000 };
    const args = ["--user", "--scope", "--quiet", "--collect", `--unit=attelier-motion-${randomUUID()}`,
      "-p", `MemoryMax=${limits.memory}`, "-p", "MemorySwapMax=0", "-p", "TasksMax=256", "-p", `CPUQuota=${limits.cpuQuota}`,
      "/usr/bin/bwrap", "--ro-bind", "/usr", "/usr", "--symlink", "usr/bin", "/bin", "--symlink", "usr/lib", "/lib", "--symlink", "usr/lib64", "/lib64",
      ...(existsSync("/etc/fonts") ? ["--ro-bind", "/etc/fonts", "/etc/fonts"] : []), ...mounts,
      "--ro-bind", process.execPath, "/runtime-node", "--ro-bind", input, "/input", "--bind", output, "/output",
      "--ro-bind", path.join(input, "hosts"), "/etc/hosts", "--ro-bind", path.join(input, "nsswitch.conf"), "/etc/nsswitch.conf",
      "--tmpfs", "/work", "--tmpfs", "/tmp", "--proc", "/proc", "--dev", "/dev", "--chdir", "/work",
      "--unshare-all", "--die-with-parent", "--new-session", "--clearenv", "--setenv", "HOME", "/work", "--setenv", "PATH", "/usr/bin",
      "--setenv", "LANG", "C.UTF-8", "--setenv", "MOTION_BROWSER", browserFile,
      "/usr/bin/prlimit", `--fsize=${MAX_BYTES}`, `--cpu=${limits.cpuSeconds}`, "--", "/runtime-node", "--max-old-space-size=512", path.join(root, "dist/composition-worker.js")];
    await new Promise<void>((resolve, reject) => {
      const child = spawn("/usr/bin/systemd-run", args, { detached: true, stdio: ["ignore", "pipe", "pipe"] });
      let logs = "", stopped = false;
      const stop = () => { stopped = true; if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch {} } };
      const timer = setTimeout(stop, limits.wallMs);
      request.signal?.addEventListener("abort", stop, { once: true });
      if (request.signal?.aborted) stop();
      const record = (chunk: Buffer) => { logs = (logs + chunk.toString()).slice(-12_000); };
      child.stdout.on("data", record); child.stderr.on("data", record);
      child.once("error", error => { clearTimeout(timer); request.signal?.removeEventListener("abort", stop); reject(error); });
      child.once("close", (code, signal) => { clearTimeout(timer); request.signal?.removeEventListener("abort", stop);
        if (stopped) reject(new Error(request.signal?.aborted ? "Render cancelled." : finalVideo ? "Render exceeded its fifteen-minute limit." : "Render exceeded its five-minute limit."));
        else if (code !== 0) {
          for (const location of [browserDirectory, store, root]) logs = logs.split(location).join("/runtime");
          if (!logs.trim()) logs = `Worker exited with code ${code}, signal ${signal ?? "none"}. A runtime resource limit may have stopped it. Try a smaller preview; do not assume the source code is invalid.`;
          reject(new Error(`Composition could not render. Fix the source or runtime error:\n${logs}`));
        }
        else resolve();
      });
    });
    const result = path.join(output, typeof frames === "number" ? "result.png" : "result.mp4");
    // Treat every sandbox output as untrusted, including filesystem metadata.
    // Never follow a worker-created symlink back into the parent filesystem.
    let bytes: number;
    const fd = openSync(result, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = fstatSync(fd); bytes = stat.size;
      if (!stat.isFile() || !bytes || bytes >= MAX_BYTES) throw new Error("Incomplete render, non-regular output or 512 MiB output limit reached.");
      if (request.signal?.aborted) throw new Error("Render cancelled.");
      copyFileSync(`/proc/self/fd/${fd}`, request.output, constants.COPYFILE_EXCL);
    } finally { closeSync(fd); }
    const scale = typeof frames === "number" ? 1 : compositionScale(composition, mode);
    return { output: request.output, bytes, frames, width: composition.width * scale,
      height: composition.height * scale, fps: composition.fps };
  } finally { rmSync(scratch, { recursive: true, force: true }); }
};
