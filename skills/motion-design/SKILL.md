---
name: motion-design
description: Create or correct Remotion compositions for designed motion, typography and comparisons, using a fitting format or versioned custom source. Also covers native motion treatments. Use when animation, crop, easing or motion preview matters.
---

# Motion design

## Remotion format workflow

For designed sequences, animated titles, charts or model comparisons, prefer the tested Remotion compositions when a format matches the actual brief and the local motion tools are available. Keep the creator's language, supplied facts and accepted styling; a template is a starting point, not authority to change the brief.

1. Call `motion_formats` with `summaryOnly:true`; choose by the desired structure and read only the chosen format with `format:"<id>"`. Read its complete guide and example before writing the spec. Do not invent spec keys, statistics or unavailable footage.
2. Call `style_guide` with that format and the project when known. Use `probe_media` and `contact_sheet` to inspect sources. `find_moments` suggests active windows, not the best story. Use `analyze_music` for beat estimates, then check the music against the actual pacing.
3. Save the JSON spec beside the sources. Render representative moments with `motion_render` and `stillAtSeconds` to check hierarchy, line wrapping, contrast, safe areas and subject crop. Read the returned images.
4. Render a half-size `preview:true` MP4. Inspect motion, beat alignment, text dwell time, transitions and sound. Adjust the source spec; avoid repeating full renders to repair a title that a still could have revealed.
5. Render the final MP4 (`profile:"web"` for normal delivery; `master` when further editing requires it), run `review_video` and inspect targeted `contact_sheet` samples. Review alerts in context: an intended flash is not automatically an error. Keep the source spec and import the finished output through `import_media` when working in a project.

`motion_render` supports registered formats. For a new structure use the custom composition tools below when listed. Do not substitute generic raster text animations merely because FFmpeg is available.

For a small change, reuse the current spec or timeline rather than choosing a new format. Importing a finished video preserves an MP4, not individually editable Remotion layers in Studio.

## Custom composition and correction

Use `motion_source` to list/get/save source in the project; `motion_render_source` renders an exact version. Saving requires the current project `expectedRevision` and source `expectedVersion` (0 for new). A conflict means read again, reconcile and save; never guess the new version.

Source is one TSX module exporting its React component as default. Supply width/height (even, 16–1920), fps (1–60), durationInFrames (at most 180 seconds), and JSON props. React 19.3 and Remotion 4.0.527 are pinned. Supported imports are `react`, `react-dom`, `remotion` and `@attelier/motion-kit` (exports include BlurText, useTime, useSpring, prog). No dependency installation, external URLs, host files or credentials are available.

Bind project-uploaded assets as `media:[{name:"shotA",assetId:"..."}]`. The component receives `media.shotA`, a relative public filename; use `staticFile(media.shotA)` with `OffthreadVideo`, `Img` or `Audio`. Local files must first be uploaded/imported. Source versions pin media hashes. Bundled fonts (latin, resolved with `staticFile("fonts/<file>")` and loaded with `FontFace` inside `delayRender`, as in the launch kit below):

| File | Face | Use |
| --- | --- | --- |
| `inter-latin.woff2` | Inter, variable 100–900 | UI, captions, body |
| `bricolage-grotesque-latin.woff2` | Bricolage Grotesque, variable 200–800 | Attelier display |
| `jetbrains-mono-latin.woff2` | JetBrains Mono, variable 100–800 | data, counters, code |
| `anton-latin.woff2` | Anton 400 | condensed impact headlines |
| `bebas-neue-latin.woff2` | Bebas Neue 400 | all-caps condensed titles, sport/news |
| `archivo-black-latin.woff2` | Archivo Black 400 | heavy grotesque slams |
| `space-grotesk-latin.woff2` | Space Grotesk, variable 300–700 | tech/product launches |
| `unbounded-latin.woff2` | Unbounded, variable 200–900 | wide futuristic display, crypto/web3 |
| `instrument-serif-latin.woff2` | Instrument Serif 400 | editorial/luxury serif accents |

All are SIL Open Font License 1.1. A brand font the person supplies is imported and bound as media like any other asset.

```tsx
import React from "react";
import {AbsoluteFill, Img, staticFile, useCurrentFrame, interpolate} from "remotion";
export default function Scene({media, title}) {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{background:"#111"}}>
    <Img src={staticFile(media.cover)} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
    <div style={{position:"absolute",left:64,bottom:64,color:"white",fontSize:56,
      opacity:interpolate(frame,[0,15],[0,1],{extrapolateRight:"clamp"})}}>{title}</div>
  </AbsoluteFill>;
}
```

Drive animation from frames, never wall-clock timers or unseeded randomness. Use Sequence for timing and media offsets deliberately. Keep typography, pacing and narrative motivated by the brief; the example only illustrates the API.

Render representative stills with `stillAtSeconds`, then an affected `rangeSeconds:[start,end]` (end exclusive) and `preview:true`. Inspect the returned still and downloaded motion/audio. Finally render the full version. The connector's absolute `downloadTo` writes to its local workspace: `generated/` for candidates; `out/` for the final user-visible file. Without it the receipt still gives a private output URL. Render requests are free of provider charges, bounded to five minutes for stills and previews and fifteen for a final video, and cached by source version, runtime and mode; model calls still cost tokens.

For corrections, get the version linked to the approved video, read the head, edit only the requested code/props and save a new version. Render a full-length candidate with unchanged geometry/fps/duration. When a scoped revision provides `finalize_video_revision`, download to generated/ and use it to preserve baseline frames/audio outside the allowed interval. Previewing only the changed range does not verify preservation. Keep the baseline and prior source versions; do not claim imported MP4s are native editable layers.

### Frame rate and judder

Set the composition fps to the footage's: generated clips are often 24 fps, so a cut made mostly of them is a 24 fps composition. Dropping 24 fps clips into a 30 fps composition repeats every fifth frame and the motion stutters (judder); slowing a clip with `playbackRate` below 1 repeats frames the same way. When a 30 fps (or 60 fps) delivery is required, conform the clip first with frame blending in Bash (`ffmpeg -i in.mp4 -vf "minterpolate=fps=30:mi_mode=blend" generated/clip-30.mp4`, or `mi_mode=mci` for smoother motion on simple shots) and import that file. For slow motion, generate it slow or conform with `minterpolate` at the slowed rate instead of playbackRate. `review_video` reports repeated frames in moving shots as judder; fix it before delivering.

### Launch kit

Compositions are one TSX module, so copy what you need into it and adapt sizes, colours and timing to the brief. All of it is frame-driven and uses only `react` and `remotion`.

```tsx
import React from "react";
import {AbsoluteFill, Sequence, continueRender, delayRender, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing} from "remotion";

const clamp = {extrapolateLeft: "clamp", extrapolateRight: "clamp"} as const;

// Load bundled faces before the first frame renders.
const useFonts = (faces: Array<[family: string, file: string]>) => {
  const [handle] = React.useState(() => delayRender("fonts"));
  React.useEffect(() => {
    Promise.all(faces.map(([family, file]) => new FontFace(family, `url(${staticFile(`fonts/${file}`)})`).load().then(f => document.fonts.add(f))))
      .then(() => continueRender(handle));
  }, []);
};

// Words rise and unblur one after another (headline reveal).
const WordReveal: React.FC<{text: string; from?: number; stagger?: number; style?: React.CSSProperties}> = ({text, from = 0, stagger = 3, style}) => {
  const frame = useCurrentFrame(), {fps} = useVideoConfig();
  return <div style={{display: "flex", flexWrap: "wrap", gap: "0 0.25em", ...style}}>
    {text.split(" ").map((word, i) => {
      const p = spring({frame: frame - from - i * stagger, fps, config: {damping: 16, stiffness: 160}});
      return <span key={i} style={{display: "inline-block", opacity: p, transform: `translateY(${(1 - p) * 40}px)`, filter: `blur(${(1 - p) * 10}px)`}}>{word}</span>;
    })}
  </div>;
};

// Number that counts up with an ease-out and tabular digits (stats, prices, users).
const Counter: React.FC<{to: number; from?: number; start?: number; frames?: number; prefix?: string; suffix?: string; decimals?: number; style?: React.CSSProperties}> =
  ({to, from = 0, start = 0, frames = 30, prefix = "", suffix = "", decimals = 0, style}) => {
  const frame = useCurrentFrame();
  const value = interpolate(frame, [start, start + frames], [from, to], {...clamp, easing: Easing.out(Easing.cubic)});
  return <span style={{fontVariantNumeric: "tabular-nums", ...style}}>{prefix}{value.toLocaleString("en-US", {minimumFractionDigits: decimals, maximumFractionDigits: decimals})}{suffix}</span>;
};

// Hard-edged wipe that reveals the next scene; put it on the incoming Sequence.
const Wipe: React.FC<{frames?: number; children: React.ReactNode}> = ({frames = 12, children}) => {
  const p = interpolate(useCurrentFrame(), [0, frames], [0, 1], {...clamp, easing: Easing.inOut(Easing.cubic)});
  return <AbsoluteFill style={{clipPath: `polygon(0 0, ${p * 120}% 0, ${p * 120 - 20}% 100%, 0 100%)`}}>{children}</AbsoluteFill>;
};

// Zoom-through: outgoing scene punches in and blurs while the next one settles from slightly large.
const ZoomIn: React.FC<{frames?: number; children: React.ReactNode}> = ({frames = 10, children}) => {
  const p = interpolate(useCurrentFrame(), [0, frames], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
  return <AbsoluteFill style={{transform: `scale(${1.25 - 0.25 * p})`, filter: `blur(${(1 - p) * 12}px)`, opacity: p}}>{children}</AbsoluteFill>;
};

export default function Launch({title}: {title: string}) {
  useFonts([["Anton", "anton-latin.woff2"], ["Inter", "inter-latin.woff2"]]);
  return <AbsoluteFill style={{background: "#0b0b0a", color: "white", fontFamily: "Inter"}}>
    <Sequence durationInFrames={60}>
      <AbsoluteFill style={{alignItems: "center", justifyContent: "center"}}>
        <WordReveal text={title} style={{fontFamily: "Anton", fontSize: 140, textTransform: "uppercase", justifyContent: "center"}} />
      </AbsoluteFill>
    </Sequence>
    <Sequence from={54} durationInFrames={60}>
      <Wipe><AbsoluteFill style={{background: "#ff8f44", alignItems: "center", justifyContent: "center"}}>
        <Counter to={12480} start={6} suffix="+" style={{fontFamily: "Anton", fontSize: 220, color: "#0b0b0a"}} />
      </AbsoluteFill></Wipe>
    </Sequence>
  </AbsoluteFill>;
}
```

Overlap the incoming Sequence a few frames with the outgoing one (as above) so a transition never shows an empty frame, and land each transition's midpoint on a beat.

## Native timeline workflow

1. Call `render_frame` for the start/end composition and `inspect_project` for the target element/revision.

```json
{"tool":"render_frame","arguments":{"projectId":"project-id","atSeconds":5,"width":960}}
```

2. Call `compile_edit` with a bounded motion treatment or subject reframe; inspect the simulation and returned confidence.

```json
{"tool":"compile_edit","arguments":{"projectId":"project-id","expectedRevision":12,"calls":[{"tool":"propose_motion_treatment","arguments":{"elementId":"still-id","kind":"ken-burns","strength":0.25,"frames":4}}]}}
```

3. Call `commit_transaction`, then `render_range` to judge crop, easing and temporal stability.

```json
{"tool":"commit_transaction","arguments":{"projectId":"project-id","transaction":{"id":"transaction-from-compile_edit"}}}
```

```json
{"tool":"render_range","arguments":{"projectId":"project-id","startSeconds":5,"endSeconds":10,"height":540}}
```

## Craft rules

Follow atelier.motion.ken-burns@1, atelier.motion.stabilization@1 and atelier.motion.motion-blur@1. Motion must be motivated, preserve subject crop and remain reviewable in rendered evidence.
