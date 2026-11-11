import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { downloadRender } from "./local-download.ts";

test("render downloads authenticate once, preserve bytes and refuse overwrite or another origin", async () => {
  const directory = await mkdtemp(path.join(process.cwd(), ".download-test-"));
  const file = path.join(directory, "export.mp4"); let calls = 0;
  const options = { apiUrl: "https://api.example.test/atelier", apiToken: "fixture", fetch: (async (_url, init) => {
    calls++; assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fixture"); assert.equal(init?.redirect, "error");
    return new Response(Buffer.from("encoded video"), { headers: { "content-length": "13" } });
  }) as typeof fetch };
  try {
    const result = await downloadRender(file, "https://api.example.test/atelier/v1/render-jobs/job/output", options);
    assert.equal(result.byteSize, 13); assert.equal(await readFile(file, "utf8"), "encoded video"); assert.equal((await stat(file)).mode & 0o777, 0o600);
    await assert.rejects(downloadRender(file, "https://api.example.test/atelier/v1/render-jobs/job/output", options), /EEXIST/);
    await assert.rejects(downloadRender(path.join(directory, "second.mp4"), "https://foreign.example.test/v1/render-jobs/job/output", options), /configured Attelier/);
    assert.equal(calls, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
