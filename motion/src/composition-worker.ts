// Trusted entrypoint; executed only inside the namespace/cgroup sandbox.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { compositionFrames, compositionScale, type MotionComposition, type MotionRenderMode } from "./composition.js";

const runtime = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { composition, mode, media } = JSON.parse(readFileSync("/input/request.json", "utf8")) as {
  composition: MotionComposition; mode: MotionRenderMode; media: Record<string, string>;
};
writeFileSync("/work/Composition.tsx", composition.code);
writeFileSync("/work/index.tsx", `import React from 'react'; import {Composition,registerRoot} from 'remotion'; import Scene from './Composition';
registerRoot(()=> <Composition id="Scene" component={Scene} width={${composition.width}} height={${composition.height}} fps={${composition.fps}} durationInFrames={${composition.durationInFrames}}/>);`);
const serveUrl = await bundle({
  entryPoint: "/work/index.tsx", publicDir: "/input/public", outDir: "/work/bundle", enableCaching: false,
  webpackOverride: config => ({ ...config, resolve: { ...config.resolve,
    alias: { ...config.resolve?.alias, "react": path.dirname(require.resolve("react/package.json")),
      "react-dom": path.dirname(require.resolve("react-dom/package.json")), "remotion": path.dirname(require.resolve("remotion/package.json")),
      "@attelier/motion-kit": path.join(runtime, "remotion/kit/primitives.tsx") },
    modules: [path.join(runtime, "node_modules"), "node_modules"],
  } }),
});
const inputProps = { ...composition.props, media };
const common = { serveUrl, inputProps, browserExecutable: process.env.MOTION_BROWSER!, logLevel: "error" as const, timeoutInMilliseconds: 30_000 };
const resolved = await selectComposition({ ...common, id: "Scene" });
const frames = compositionFrames(composition, mode);
if (typeof frames === "number") {
  await renderStill({ ...common, composition: resolved, frame: frames, output: "/output/result.png", imageFormat: "png" });
} else {
  await renderMedia({ ...common, composition: resolved, frameRange: frames, outputLocation: "/output/result.mp4",
    codec: "h264", crf: mode.preview ? 28 : 21, scale: compositionScale(composition, mode), concurrency: mode.preview ? 1 : 2,
    pixelFormat: "yuv420p", colorSpace: "bt709", audioCodec: "aac", audioBitrate: "192k",
    // AAC intermediates carry padding. Bound delivery to the composition clock,
    // encoding trimmed audio once more while copying the pre-encoded video.
    ffmpegOverride: ({ type, args }) => [...args.slice(0, -1), "-threads", "2",
      ...(type === "stitcher" ? ["-c:a", "aac", "-b:a", "192k", "-t", String((frames[1] - frames[0] + 1) / composition.fps)] : []),
      args.at(-1)!],
    offthreadVideoThreads: 2,
    offthreadVideoCacheSizeInBytes: 64 * 1024 * 1024, mediaCacheSizeInBytes: 64 * 1024 * 1024,
  });
}
