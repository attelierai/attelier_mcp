---
name: prompting
description: Write generation prompts that video and image models follow (subject, action, camera, lens, light, motion, duration, what to avoid, reference images), and brief a code-built motion video precisely (duration, beats with timings, style, constraints, deliverable). Use before every quote or generation, and before writing a custom motion composition.
---

# Prompting

A prompt describes one shot as a camera would see it. Write it in plain English
whatever language the person uses; keep their supplied facts, names and copy exact.

## Generation prompts

Build every video or image prompt from these parts, in this order, in one or two
sentences:

1. **Subject**: who or what, with the details that must be right (colour, material,
   brand-free description of a product).
2. **Action**: one clear thing happening, with a verb (drifts, pours, turns to camera).
3. **Setting and time**: place, weather, time of day.
4. **Camera**: shot size (wide, medium, close-up, macro), angle (low, eye level,
   top-down) and movement (static, slow push-in, tracking, orbit, handheld).
5. **Lens and light**: focal feel (wide 24 mm, tight 85 mm, shallow depth of field)
   and light (golden hour, soft window light, hard rim light, neon).
6. **Style**: photographic, cinematic, 3D render, illustration, with one reference
   style at most.

Then set duration and aspect ratio as parameters, not in the text. Keep one shot per
prompt: two actions or a cut inside one prompt usually fail.

Example (video, 5 s, 16:9):

    A white rally car drifts through a dusty pine-forest bend, gravel spraying
    behind it. Low tracking shot alongside the car, wide lens, golden-hour backlight
    through the trees, cinematic.

Example (image, product still):

    A matte sage-green ceramic mug on a raw oak table, steam rising, soft morning
    window light from the left, shallow depth of field, clean negative space on the
    right for a title.

### Avoid lists and negatives

State what must not appear only when it is a real risk (text in the frame, extra
fingers, a logo). Use the model's negative prompt parameter when the catalogue lists
one; otherwise phrase it positively ("clean label with no lettering").

### Image-to-video

Describe only the motion and the camera; the image already fixes the look. Upload
the still with `upload_inference` and pass its `/v1/uploads/<id>/content` URL.
Example: "Slow push-in, steam drifts upward, light flickers softly."

### Check before spending

Quote the exact prompt and parameters, and test a look on the cheapest model when
the shot is uncertain (see the model-selection skill).

```json
{"tool":"quote_inference","arguments":{"model":"model-id-from-list_models","parameters":{"prompt":"A matte sage-green ceramic mug on a raw oak table, steam rising, soft morning window light, shallow depth of field","aspectRatio":"1:1"}}}
```

## Briefing a code-built motion video

When a video is designed in code (a custom composition), write the brief to yourself
before any code, and keep it with the source:

- **Deliverable**: duration in seconds, aspect ratio, frame rate, with or without
  sound, where it will be posted.
- **Beats with timings**: one line per beat, `0.0–2.5 s hook: …`, so every element
  has a start, a hold long enough to read and an exit.
- **Copy**: the exact on-screen words per beat, checked against the person's text.
- **Style**: palette (3–5 colours with hex values), type pairing, a grid, the motion
  character (snappy, elastic, calm) and one or two style references.
- **Constraints**: reading time (about 3 words per second on screen), safe areas,
  brand rules, what to avoid.
- **Sound**: music bed and hits on the beat boundaries; house effects first.

Render stills at each beat boundary and read them before rendering the whole video.

## Motion design in code

Use a tested format when `motion_formats` lists one that fits the brief (model
comparison, shoot-out, evolution, making-of, newscast). Write a custom composition
with `motion_source` and `motion_render_source` for any other structure; the
motion-design skill has the save/render workflow. These rules come from a review of
475 short videos that a model made in code: they mark what the best ones shared and
what the weak ones got wrong.

### Fit the sandbox

- One TSX module, default export. Imports: `react`, `react-dom`, `remotion` and
  `@attelier/motion-kit` (`BlurText`, `useTime`, `useSpring`, `prog`, the easings
  `easeInOut`, `easeOut`, `easeIn`, `clamp`, and `lerpRect`, `Frame`, `Clip`).
  Limits: even sizes up to 1920 px, 1–60 fps, 180 s, 256 KiB of code, 64 KiB of
  props, 32 media bindings.
- Fonts: Inter, Bricolage Grotesque, JetBrains Mono. There is no serif: mark an
  accent word with the accent colour or another Bricolage weight.
- No Three.js: build 3D with CSS (`perspective`, `rotateX/Y`, `translateZ`) or 2D
  projection on a `<canvas>` drawn from the current frame.
- Every frame is a pure function of `useCurrentFrame()`. Seed randomness with
  `random("seed" + i)` from `remotion`; never `Math.random`, `Date` or
  `requestAnimationFrame`.
- Sound effects: take a path from `sfx_library`, bring it in with `import_media` and
  bind it under `media`, like any other asset.
- Stills and previews stop after five minutes, other video renders after fifteen. A
  stopped render with no error log is a resource limit: try a smaller preview before
  changing the code.

### Set the system before animating

- **Palette:** a `theme` with `ink`, `paper` (an off-white such as #F2EDE4 rather
  than pure white), one `accent` and at most one secondary colour. Every scene reads
  from it. The accent marks only the key word, key number, logo and focal object, one
  per headline.
- **Type roles:** display in Bricolage Grotesque (120–260 px at 1080p, tracking
  −0.04 em, line height 0.85–0.95), body in Inter, labels in JetBrains Mono. No text
  under 3 % of frame height (about 32 px at 1080p, more in 9:16); smaller text is
  texture, not information. This was the most common flaw, even in the best videos.
- **Beat grid:** `framesPerBeat = fps * 60 / bpm` (30 fps at 120 bpm = 15). Start
  every `<Sequence>` on a multiple of it and place sounds from the same `beats[]`
  array; take the tempo from `analyze_music`. Break the grid once, for emphasis.
- **Script as data:** `scenes = [{id, from, dur, idea, focal}]`, one idea and one
  focal change per scene, at least 2–2.5 s each. A 30 s piece holds 8–10 scenes.
  Fewer things for longer beats many things briefly.

### Structure

- **Hook in the first second:** the boldest, most legible frame (a huge number, a
  struck-out old word, the end state), never a fade-in from empty.
- **Ad arc:** hook (0–3 s) → concrete problem → quantified → product → 2–3 proofs,
  one beat each → payoff line → call to action.
- **Capabilities arc:** 6–8 numbered chapters of 2–4 s, each showing what its label
  says (a TIMING chapter shows a curve).
- **Escalation:** vary scene lengths and give the payoff the longest moment. Before
  the end card, a burst of 6–12 shots shrinking 8→6→4→4→2→2 frames, then a calm
  resolve. A flash frame stays under 3 frames.
- **End card:** elements enter with a 5-frame stagger, then nothing moves for at
  least the last 30 frames, and the card holds 2 s or more. Its content follows the
  house taste.
- **Variety and joins:** change layout, scale or camera every two or three beats.
  Join chapters with a match cut, a shape morph or a carried object. Give long holds
  ambient motion (drift, parallax, slow push-in). Ending on frame 0's state loops
  cleanly.

### Techniques that worked

- **Frame system:** a HUD rendered last in the root `AbsoluteFill`, above every
  `Sequence`, so it never cuts: 48 px inset, thin corner ticks, timecode from the
  frame, chapter `03 / 07 NAME` from `scenes`, a 2 px progress bar at
  `frame / durationInFrames`. Its labels still obey the 3 % minimum. This was the
  most consistent trait of the top work.
- **Kinetic headline:** 2–6 words in one position and size across scenes; words rise
  40→0 px from opacity 0 with a 3-frame stagger on `Easing.out(Easing.cubic)`; the
  accent word lands last. Slam: scale 1.4→1 on
  `spring({damping: 12, stiffness: 200})`. Clear the outgoing headline before the
  next lands; never cross-fade two text blocks at equal weight. Finish every typing,
  scramble or count-up early and hold it legible for at least 1 s.
- **Strike-through:** a bar through the word, `scaleX` 0→1 from the left over 8–10
  frames, then the word fades to 40 %. Highlight with colour and size, not a box.
- **Chapter flips:** backgrounds cycle ink → paper → accent with a hard cut on the
  beat, a `clipPath: circle()` 0→150 % over 8–12 frames, or a bar wipe on
  `Easing.inOut(Easing.exp)`.
- **Morph:** one container stays mounted and interpolates its rect, radius and colour
  (`lerpRect`, `Frame`) on `spring({damping: 20, stiffness: 170})`; inner content
  overlaps by 6 frames.
- **Product UI in code:** rebuild the interface with its real fonts, colours and data,
  one running example throughout. Panels enter with a 4-frame stagger (y 24→0). Push
  in with a camera wrapper (`scale(2.2)` over 20 frames on
  `Easing.inOut(Easing.cubic)`) until the named element fills a third of the frame.
  Cursor: travels 14–20 frames on `Easing.bezier(0.33, 0, 0.2, 1)`, clicks 1→0.85→1
  over 6 frames, and the state changes 2 frames after the click. Typing: one
  character every 2 frames.
- **Counters and charts:** count with `interpolate(frame, [s, s + 45], [0, target],
  {easing: Easing.out(Easing.exp), extrapolateRight: "clamp"})`, `Intl.NumberFormat`
  and `tabular-nums`. Charts build in layers: axes by `strokeDashoffset`, bars
  `scaleY` from the base with a 3-frame stagger, labels, then the call-out; unfocused
  series at 20 % opacity. Every number is true.
- **Particles:** always morph towards a clear target shape (sampled text, a sphere);
  `lerp(A[i], B[i], ease(p))` with a delay of `i / N × 15` frames. Formless noise was
  a common failure.
- **Motif:** one accent dot or glyph appears in every scene and ends as part of the
  logo, travelling on `easeInOut` and landing on `spring({damping: 10})`.
- **3D:** exploded CSS layers whose `translateZ` grows with a 3-frame stagger; a
  scripted camera path that holds at each label; warm key light against a cool rim.
  Never a free orbit or jittery look-around.
- **Sound:** a music bed plus hits on cuts, impacts and UI events, from `beats[]`.
  Videos with sound scored higher than silent ones. Each effect lasts as long as its
  motion; music fades out before any voice. Aim for about −14 LUFS.

### Verify mechanically

The model's own look at a render missed small text, empty frames and the wrong
resolution, so check them deliberately:

1. Stills (`stillAtSeconds`) at each beat boundary and transition midpoint, then a
   `contact_sheet` of the preview with `everySeconds: 0.5`. In each frame: no text
   under 3 % of height, all text inside a 5 % margin (also during camera moves and
   wipes), the focal element filling 40–60 % of the frame, nothing half-written,
   blank, blurred or placeholder, and the copy exactly as supplied.
2. `probe_media` on the final file: width, height, fps and duration as briefed (a
   preview is half size), an audio stream, and its loudness.
3. `review_video` for flashes, black spans and audio clipping. It does not check
   text, fill or framing; step 1 does.
