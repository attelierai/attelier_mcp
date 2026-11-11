---
name: attelier-outro
description: Close a video with Attelier's own logo outro (black, warm glow, logo resolving from blur to sharp, 1.8 s). Use only when the person explicitly asks for the Attelier outro or Attelier branding at the end; a client's video ends on the client's brand.
---

# Attelier outro

Only when asked. The end of a client's video belongs to the client's brand (their logo, their call to action). Add the Attelier outro only when the person asks for it ("add the Attelier outro", "end with the Attelier logo") or the video is Attelier's own. Never add it on your own initiative, and never replace the client's end card with it.

## What is available

The composition runtime stages these files; use them with `staticFile`, no media binding needed:

| File | Size | Use for |
| --- | --- | --- |
| `brand/attelier-outro-16x9.mp4` | 1920×1080 | landscape (width/height ≥ 1.3) |
| `brand/attelier-outro-9x16.mp4` | 1080×1920 | vertical (width/height ≤ 0.77) |
| `brand/attelier-outro-1x1.mp4` | 1080×1080 | square and 4:5 |
| `brand/attelier-logo-white.png` | 1600×470, transparent | the white logo, if a bespoke closing needs it |

Each outro lasts 1.8 s at 30 fps (54 frames), black throughout, with a short dark logo sting that is already mastered; it ends on black.

## Append it to a custom composition

1. Read the current source and keep everything else unchanged.

```json
{"tool":"motion_source","arguments":{"action":"get","projectId":"project-id","sourceId":"launch"}}
```

2. Pick the file by the composition's aspect ratio (table above).
3. Extend `durationInFrames` by `Math.round(1.8 * fps)` and append the outro as the last Sequence, after the client's end card or final shot:

```tsx
const outroFrames = Math.round(1.8 * fps); // fps of this composition
// ...inside the root AbsoluteFill, after everything else:
<Sequence from={durationInFrames - outroFrames} durationInFrames={outroFrames}>
  <OffthreadVideo src={staticFile("brand/attelier-outro-16x9.mp4")} style={{width: "100%", height: "100%", objectFit: "cover"}} />
</Sequence>
```

4. Fade the music out under the outro (about 0.5 s into it, reaching 0 at the end) so the sting reads; keep voice and captions out of it.
5. Save a new version, render a still about 1 s into the outro, then the full video, and run `review_video` on it.

```json
{"tool":"motion_render_source","arguments":{"projectId":"project-id","sourceId":"launch","version":4,"stillAtSeconds":31.0}}
```

For a video that is not a custom composition (an imported or native-timeline cut), render the `attelier-outro` motion format with the matching `aspect` and append that file, or import it and place it at the end of the timeline.
