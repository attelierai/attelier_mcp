import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("a host root keeps every local file tool inside the working folder, symlinks included", async () => {
  const base = mkdtempSync(path.join(os.tmpdir(), "mcp-root-"));
  const root = path.join(base, "turn"), outside = path.join(base, "other-tenant");
  mkdirSync(root); mkdirSync(outside);
  writeFileSync(path.join(outside, "private.mp4"), "not yours");
  symlinkSync(outside, path.join(root, "escape"));
  const previous = process.env.ATTELIER_MCP_ROOT;
  process.env.ATTELIER_MCP_ROOT = root;
  try {
    const { localTool, runLocalTool } = await import("./local-tools.ts");
    const { uploadLocalMedia } = await import("./local-upload.ts");
    for (const file of [path.join(outside, "private.mp4"), path.join(root, "escape", "private.mp4"), "../other-tenant/private.mp4"]) {
      const probed = await runLocalTool(localTool("probe_media")!, { path: file });
      assert.equal(probed.isError, true, file);
      assert.match((probed.content[0] as { text: string }).text, /outside the working folder/);
    }
    const written = await runLocalTool(localTool("contact_sheet")!, { path: path.join(root, "a.mp4"), output: path.join(outside, "sheet.png") });
    assert.equal(written.isError, true);
    for (const file of ["escape/private.mp4", "../other-tenant/private.mp4"]) {
      await assert.rejects(uploadLocalMedia(file, async () => { throw new Error("must not upload"); }), /outside/);
    }
    mkdirSync(path.join(root, "out"));
    writeFileSync(path.join(root, "out", "final.mp4"), "fixture bytes");
    const calls: string[] = [];
    assert.equal(await uploadLocalMedia("out/final.mp4", async (name, args) => {
      calls.push(name);
      assert.equal(args.fileName, "final.mp4");
      return { structuredContent: { id: "upload-relative", status: "complete" } };
    }), "upload-relative");
    assert.deepEqual(calls, ["create_upload"]);
  } finally {
    if (previous === undefined) delete process.env.ATTELIER_MCP_ROOT; else process.env.ATTELIER_MCP_ROOT = previous;
    rmSync(base, { recursive: true, force: true });
  }
});
