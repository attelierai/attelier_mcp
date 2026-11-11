import { createHash } from "node:crypto";
import { open, realpath, unlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { allowedRoots, isInside } from "./roots.ts";

/** A caller-named destination, exclusive creation and same-origin media only.
 * Encoded media goes directly to disk, never into a model's context. */
export async function downloadRender(destination: string, outputUrl: string, options: {
  apiUrl: string; apiToken: string; fetch: typeof fetch;
}) {
  const expanded = destination.startsWith("~/") ? path.join(os.homedir(), destination.slice(2)) : destination;
  if (!path.isAbsolute(expanded)) throw new Error("downloadTo must be an absolute path or start with ~/.");
  const directory = await realpath(path.dirname(expanded));
  if (!isInside(directory, allowedRoots())) throw new Error("Download destination must be under your home or working directory.");
  const url = new URL(outputUrl, options.apiUrl);
  const base = new URL(options.apiUrl);
  if (url.origin !== base.origin || !url.pathname.startsWith(`${base.pathname.replace(/\/$/, "")}/v1/`) || url.username || url.password) throw new Error("The render URL must belong to the configured Attelier API.");
  const file = path.join(directory, path.basename(expanded));
  const handle = await open(file, "wx", 0o600);
  let complete = false;
  try {
    const response = await options.fetch(url, { headers: { authorization: `Bearer ${options.apiToken}` }, redirect: "error", signal: AbortSignal.timeout(600_000) });
    if (!response.ok || !response.body) throw new Error(`Render download failed (${response.status}).`);
    const hash = createHash("sha256"); let byteSize = 0;
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      byteSize += chunk.byteLength;
      if (byteSize > 2 * 1024 ** 3) throw new Error("Render exceeds the 2 GiB connector download limit.");
      hash.update(chunk); await handle.writeFile(chunk);
    }
    const expected = Number(response.headers.get("content-length"));
    if (!byteSize || (expected > 0 && expected !== byteSize)) throw new Error("Render download was incomplete.");
    await handle.sync(); complete = true;
    return { localPath: file, byteSize, contentHash: `sha256:${hash.digest("hex")}` };
  } finally { await handle.close(); if (!complete) await unlink(file); }
}
