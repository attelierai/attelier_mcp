import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { compositionFrames, compositionScale, validateComposition } from "./composition.js";
import { renderComposition } from "./composition-sandbox.js";

const scene = { code: 'import React from "react"; import {AbsoluteFill,useCurrentFrame} from "remotion"; export default function Scene(){return <AbsoluteFill style={{background:useCurrentFrame()<12?"red":"blue"}}/>}', width: 320, height: 180, fps: 24, durationInFrames: 24, props: {} };
test("composition times use exclusive range ends and valid encoding dimensions", () => {
  const composition = validateComposition(scene);
  assert.deepEqual(compositionFrames(composition, { rangeSeconds: [0.5, 1] }), [12, 23]);
  assert.equal(compositionFrames(composition, { stillAtSeconds: 0.5 }), 12);
  assert.equal(compositionScale({ ...scene, width: 322 }, { preview: true }), 1);
  for (const value of [{ ...scene, width: 321 }, { ...scene, durationInFrames: 5000 }, { ...scene, props: { media: {} } }]) assert.throws(() => validateComposition(value));
  for (const mode of [{ stillAtSeconds: 1 }, { rangeSeconds: [0, 2] as [number, number] }, { stillAtSeconds: 0, rangeSeconds: [0, 1] as [number, number] }]) assert.throws(() => compositionFrames(composition, mode));
});

test("isolated custom source renders real frames/ranges; blocks host files/network and cancels", {
  skip: process.env.ATTELIER_TEST_COMPOSITION_RENDER !== "1", timeout: 180_000,
}, async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "attelier-motion-test-"));
  const browserExecutable = process.env.ATTELIER_REMOTION_BROWSER;
  const run = (overrides: Partial<Parameters<typeof renderComposition>[0]> = {}) => renderComposition({ composition: scene, output: path.join(directory, "test.png"), mode: { stillAtSeconds: 0 }, browserExecutable, ...overrides });
  let hits = 0;
  const server = createServer((_request, response) => { hits++; response.setHeader("Access-Control-Allow-Origin", "*"); response.end("host"); });
  await new Promise<void>(resolve => server.listen(0, "0.0.0.0", resolve));
  try {
    const still = await run();
    assert.equal(still.width, 320); assert.ok(still.bytes > 100);
    const before = readFileSync(still.output);
    await assert.rejects(run(), /EEXIST/); assert.deepEqual(readFileSync(still.output), before);
    const range = await run({ output: path.join(directory, "range.mp4"), mode: { rangeSeconds: [0.5, 1], preview: true } });
    const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", range.output], { encoding: "utf8" }));
    assert.equal(probe.streams[0].width, 160); assert.equal(Number(probe.streams[0].nb_frames), 12);
    const tone = path.join(directory, "tone.wav");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1", tone]);
    const withAudio = await run({ output: path.join(directory, "audio.mp4"), mode: {}, media: [{ name: "music", file: tone }],
      composition: { ...scene, code: 'import React from "react";import {AbsoluteFill,Audio,staticFile} from "remotion";export default function Scene({media}){return <AbsoluteFill style={{background:"red"}}><Audio src={staticFile(media.music)}/></AbsoluteFill>}' } });
    const audioProbe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", withAudio.output], { encoding: "utf8" }));
    assert.ok(audioProbe.streams.some((stream: { codec_type: string }) => stream.codec_type === "audio"));
    const videoStream = audioProbe.streams.find((stream: { codec_type: string }) => stream.codec_type === "video");
    assert.equal(videoStream.pix_fmt, "yuv420p"); assert.equal(Number(videoStream.start_time), 0);
    for (const stream of audioProbe.streams) assert.equal(Number(stream.duration), 1);
    // The staged house assets: the Attelier outro appended as the last sequence and a bundled display font.
    const outro = await run({ output: path.join(directory, "outro.png"), mode: { stillAtSeconds: 1.5 },
      composition: { ...scene, fps: 30, durationInFrames: 60, code: `import React from "react";import {AbsoluteFill,OffthreadVideo,Sequence,staticFile,delayRender,continueRender,cancelRender} from "remotion";
        export default function Scene(){ const [handle]=React.useState(()=>delayRender("font"));
          React.useEffect(()=>{new FontFace("Anton",\`url(\${staticFile("fonts/anton-latin.woff2")})\`).load().then(f=>{document.fonts.add(f);continueRender(handle);},e=>cancelRender(e));},[]);
          return <AbsoluteFill style={{background:"red"}}><div style={{fontFamily:"Anton"}}>LAUNCH</div><Sequence from={6} durationInFrames={54}><OffthreadVideo src={staticFile("brand/attelier-outro-16x9.mp4")}/></Sequence></AbsoluteFill>;}` } });
    const outroPixel = execFileSync("ffmpeg", ["-v", "error", "-i", outro.output, "-vf", "crop=1:1:0:0", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
    assert.ok(outroPixel[0]! < 40, "the outro's black picture covers the frame");
    const clip = path.join(directory, "clip.mp4");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=720x1280:rate=24:duration=3",
      "-c:v", "libx264", "-preset", "ultrafast", "-threads", "2", "-pix_fmt", "yuv420p", clip]);
    const long = await run({ output: path.join(directory, "portrait.mp4"), mode: {}, media: [{ name: "clip", file: clip }],
      composition: { ...scene, width: 720, height: 1280, durationInFrames: 336,
        code: 'import React from "react";import {AbsoluteFill,OffthreadVideo,Sequence,staticFile} from "remotion";export default function Scene({media}){return <AbsoluteFill>{[0,96,192].map(from=><Sequence key={from} from={from} durationInFrames={144}><OffthreadVideo src={staticFile(media.clip)} playbackRate={0.5}/></Sequence>)}</AbsoluteFill>}' } });
    const longProbe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", long.output], { encoding: "utf8" }));
    assert.equal(longProbe.streams[0].width, 720); assert.equal(longProbe.streams[0].height, 1280);
    assert.equal(Number(longProbe.streams[0].nb_frames), 336); assert.equal(Number(longProbe.streams[0].duration), 14);
    const canary = path.join(directory, "host-canary.js"); writeFileSync(canary, 'export default "PRIVATE_CANARY";');
    await assert.rejects(run({ output: path.join(directory, "forbidden.png"), composition: { ...scene, code: `import value from ${JSON.stringify(canary)}; export default ()=> value;` } }), error => {
      assert.match((error as Error).message, /resolve|not found/i);
      assert.doesNotMatch((error as Error).message, /PRIVATE_CANARY/); return true;
    });
    // Even a bundler loader executing inside the sandbox cannot export a host symlink.
    const loader = path.join(directory, "loader.ttf");
    writeFileSync(loader, `module.exports=function(){require("node:fs").symlinkSync(${JSON.stringify(canary)},"/output/result.png");process.exit(0);}`);
    await assert.rejects(run({ output: path.join(directory, "escaped.png"), media: [{ name: "loader", file: loader }],
      composition: { ...scene, code: 'import "!!/input/public/loader.ttf!/work/Composition.tsx"; export default ()=>null;' } }), /ELOOP|symbolic link/);
    assert.equal(existsSync(path.join(directory, "escaped.png")), false);
    const port = (server.address() as { port: number }).port;
    await run({ output: path.join(directory, "network.png"), composition: { ...scene, code: `
      import React from "react"; import {AbsoluteFill,delayRender,continueRender,cancelRender} from "remotion";
      export default function Scene(){ const [handle]=React.useState(()=>delayRender());
        React.useEffect(()=>{fetch("http://127.0.0.1:${port}").then(()=>cancelRender(new Error("Host network exposed")),()=>continueRender(handle));},[]);
        return <AbsoluteFill style={{background:"green"}}/>;}` } });
    assert.equal(hits, 0);
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 1500);
    try { await assert.rejects(run({ output: path.join(directory, "cancel.png"), signal: abort.signal,
      composition: { ...scene, code: 'import React from "react"; import {delayRender} from "remotion"; export default function Scene(){React.useState(()=>delayRender("test cancellation"));return null;}' } }), /cancelled/); }
    finally { clearTimeout(timer); }
    assert.equal(existsSync(path.join(directory, "cancel.png")), false);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); rmSync(directory, { recursive: true, force: true }); }
});
