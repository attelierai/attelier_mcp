import { createHash } from "node:crypto";
import { open, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { allowedRoots, hostRoot, isInside } from "./roots.ts";

const mimeTypes: Record<string, string> = { ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".mkv": "video/x-matroska", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".wav": "audio/wav", ".flac": "audio/flac", ".ogg": "audio/ogg", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".ttf": "font/ttf", ".otf": "font/otf", ".woff2": "font/woff2" };
type Call = (name: string, args: Record<string, unknown>) => Promise<unknown>;
const result = (value: unknown): Record<string, unknown> => {
  const envelope = value as { isError?: boolean; structuredContent?: Record<string, unknown>; content?: Array<{ text?: string }> };
  if (envelope.isError) throw new Error("Attelier rejected the upload.");
  return envelope.structuredContent ?? JSON.parse(envelope.content?.[0]?.text ?? "{}");
};

/** Only paths explicitly supplied to the tool are opened. Bytes travel directly
 * between the connector and the upload API, never through model messages. */
export const uploadLocalMedia = async (submitted: string, call: Call): Promise<string> => {
  const expanded = submitted.startsWith("~/") ? path.join(os.homedir(), submitted.slice(2)) : submitted;
  const canonical = await realpath(path.resolve(hostRoot() ?? process.cwd(), expanded));
  if (!isInside(canonical, allowedRoots())) throw new Error("The requested media is outside the connector's home and working directory.");
  const mimeType = mimeTypes[path.extname(canonical).toLowerCase()];
  if (!mimeType) throw new Error("Unsupported media extension.");
  const handle = await open(canonical, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size <= 0 || stat.size > 2 * 1024 ** 3) throw new Error("Media must be a regular file between 1 byte and 2 GiB.");
    // MCP has a 1 MiB JSON envelope limit; leave room for base64 and metadata.
    const chunk = Buffer.alloc(Math.min(stat.size, 512 * 1024));
    const hash = createHash("sha256");
    for (let offset = 0; offset < stat.size;) {
      const { bytesRead } = await handle.read(chunk, 0, Math.min(chunk.length, stat.size - offset), offset);
      if (!bytesRead) throw new Error("Media changed while hashing.");
      hash.update(chunk.subarray(0, bytesRead)); offset += bytesRead;
    }
    const created = result(await call("create_upload", { fileName: path.basename(canonical), mimeType, byteSize: stat.size, contentHash: `sha256:${hash.digest("hex")}` }));
    const uploadId = String(created.id ?? "");
    if (!uploadId) throw new Error("The upload API returned no identifier.");
    if (created.status === "complete") return uploadId;
    let offset = Number(created.nextOffset ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > stat.size) throw new Error("Invalid resume offset.");
    while (offset < stat.size) {
      const { bytesRead } = await handle.read(chunk, 0, Math.min(chunk.length, stat.size - offset), offset);
      if (!bytesRead) throw new Error("Media changed during upload.");
      const written = result(await call("upload_chunk", { uploadId, offset, base64: chunk.subarray(0, bytesRead).toString("base64") }));
      if (Number(written.nextOffset) !== offset + bytesRead) throw new Error("The upload server did not acknowledge the complete chunk.");
      offset += bytesRead;
    }
    const complete = result(await call("complete_upload", { uploadId }));
    if (complete.status !== "complete") throw new Error("Upload completion was not confirmed.");
    return uploadId;
  } finally { await handle.close(); }
};

/** A brief is the only text file the connector reads, explicitly named by the user. */
export const readLocalBrief = async (submitted: string): Promise<string> => {
  const expanded = submitted.startsWith("~/") ? path.join(os.homedir(), submitted.slice(2)) : submitted;
  if (!path.isAbsolute(expanded)) throw new Error("Brief paths must be absolute or start with ~/.");
  const canonical = await realpath(expanded);
  if (!isInside(canonical, allowedRoots()) || !/\.md$/i.test(canonical)) throw new Error("Brief must be a Markdown file in your working folder.");
  const handle = await open(canonical, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 64 * 1024) throw new Error("Brief must be a regular Markdown file up to 64 KiB.");
    return await handle.readFile("utf8");
  } finally { await handle.close(); }
};

/** A composition's TSX source, named by the agent: a text file in the working folder, at most 256 KiB. */
export const readLocalSource = async (submitted: string): Promise<string> => {
  const expanded = submitted.startsWith("~/") ? path.join(os.homedir(), submitted.slice(2)) : submitted;
  const canonical = await realpath(path.resolve(hostRoot() ?? process.cwd(), expanded));
  if (!isInside(canonical, allowedRoots()) || !/\.(tsx|jsx|ts|js)$/i.test(canonical)) throw new Error("path must be a .tsx/.jsx/.ts/.js file in your working folder.");
  const handle = await open(canonical, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 256 * 1024) throw new Error("The source must be a regular file up to 256 KiB.");
    return await handle.readFile("utf8");
  } finally { await handle.close(); }
};
