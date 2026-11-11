---
name: assemble-from-clips
description: Turn a folder or Library of raw camera/generated clips into a reviewable first cut in Attelier — import, transcribe, describe, set the sequence timebase from the sources, order by story, place with source ranges, checkpoint, render and review. Use when the request is "cut these clips into a film" rather than generating new media.
---

# Assemble from clips

## Executable workflow

1. Call `inspect_project` and use its `revision`, canvas, frame rate, assets and element IDs as authority.

```json
{"tool":"inspect_project","arguments":{"projectId":"project-id","include":["transcripts","audio"]}}
```

2. If clips are local, call `import_media` with `place:true`, inspect its simulation, and commit only the returned transaction. This imports and places the files through the same Library pipeline as Studio. Re-inspect after the commit. CLI fallback only: `atte import ...`.

```json
{"tool":"import_media","arguments":{"projectId":"project-id","paths":["~/Descargas/clip-a.mp4","~/Descargas/clip-b.mp4"],"place":true,"rights":"user_owned","expectedRevision":12}}
```

3. For missing evidence call `analyze_asset` once per asset. Transcription and audio are free; description is a spend point, stored once and reused. What clips show comes from evidence, never from guesses: use the stored descriptions first (`get_asset_evidence` with `include: ["description"]`, free); for a clip without one, run `analyze_asset` with `analysis: "description"` once, which reads the whole clip and stores the reading for later turns; use `inspect_visual` only for one precise question about specific frames that the stored reading does not answer (a small paid Luna call, cached).

```json
{"tool":"analyze_asset","arguments":{"projectId":"project-id","assetId":"asset-id","analysis":"transcription"}}
```

4. Call `compile_edit` with the inspected revision. Set the source-derived timebase first, then place explicit source ranges. Size transitions with `fit:"speech"`; it uses source handles up to 0.5 seconds before clamping and reports the applied duration and reason. Use `add_graphic` for designed titles and `hold_last_frame` for an ending beat instead of hand-authoring layers, splits or fades. Read `simulation`; do not commit on a revision conflict or invalid source bounds.

```json
{"tool":"compile_edit","arguments":{"projectId":"project-id","expectedRevision":12,"calls":[{"tool":"set_sequence_frame_rate","arguments":{"frameRate":{"numerator":24000,"denominator":1001}}},{"tool":"prepare_project_asset_placement","arguments":{"projectAssetId":"asset-id","trackId":"video-track-id","startSeconds":0,"sourceStartSeconds":4.2,"durationSeconds":6.8,"audioRole":"dialogue"}}]}}
```

```json
{"tool":"compile_edit","arguments":{"projectId":"project-id","expectedRevision":13,"calls":[{"tool":"apply_transition","arguments":{"outgoingElementId":"clip-a","incomingElementId":"clip-b","kind":"cross-dissolve","durationSeconds":0.5,"fit":"speech","maxHandleSeconds":0.5}},{"tool":"add_graphic","arguments":{"template":"locator/place-date","at":0.8,"durationSeconds":3.5,"slots":{"place":"MADRID","date":"SEPTEMBER 2026","fontAssetId":"font-inter-id"}}},{"tool":"hold_last_frame","arguments":{"elementId":"final-clip","holdSeconds":2.5,"fadeOutSeconds":0.7,"audioFadeOutSeconds":0.5}}]}}
```

5. Call `commit_transaction` only with the exact `transaction` returned by `compile_edit`, then create a named checkpoint from the new revision.

```json
{"tool":"commit_transaction","arguments":{"projectId":"project-id","transaction":{"id":"transaction-from-compile_edit"}}}
```

```json
{"tool":"checkpoint_project","arguments":{"projectId":"project-id","action":"create","expectedRevision":13,"name":"story order locked"}}
```

6. Call `review_project`, then `render_range` for motion/audio proof. Resolve errors before quoting delivery.

```json
{"tool":"review_project","arguments":{"projectId":"project-id","level":"cut"}}
```

```json
{"tool":"render_range","arguments":{"projectId":"project-id","startSeconds":0,"endSeconds":12,"height":540}}
```

## Craft rules

Brief before styling; story order comes from evidence, not filenames. Keep word-boundary handles, inspect the prepared transition sizing before commit, level dialogue before titles, and never generate replacement media for a defect a deterministic edit solves.
