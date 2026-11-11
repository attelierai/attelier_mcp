---
name: review-cut
description: Inspect an assembled Attelier cut and report what is actually wrong with it — mid-word cuts, repeated lines, dialogue level jumps, continuity breaks, safe-area collisions, static tails and proxy/preview mismatches — with timecodes and no invented confidence. Use before every render and before calling an edit finished.
---

# Review a cut

## Executable workflow

1. Call `inspect_project` with transcript and audio evidence for the range under review.

```json
{"tool":"inspect_project","arguments":{"projectId":"project-id","rangeSeconds":[0,30],"include":["transcripts","audio"]}}
```

2. Call `review_project` at `cut` level. Record every finding with timecode, affected IDs and supplied deterministic repair.

```json
{"tool":"review_project","arguments":{"projectId":"project-id","level":"cut","rangeSeconds":[0,30]}}
```

3. Call `review_project` at `rhythm` level. Use its per-shot duration, words/s and before/after-cut pauses; treat flags as review evidence. Its top three suggestions already contain public camelCase `compile_edit.calls` arrays, including `add_air { atCutSeconds, seconds, mode? }` for missing breathing room, so preview only the repairs that match the intended pacing.

```json
{"tool":"review_project","arguments":{"projectId":"project-id","level":"rhythm","rangeSeconds":[0,30]}}
```

4. Call `render_frame` around each important boundary and use the embedded PNG for safe-area and continuity evidence.

```json
{"tool":"render_frame","arguments":{"projectId":"project-id","atSeconds":12.4,"width":960}}
```

5. When a finding depends on what a source clip shows, follow the evidence order. What clips show comes from evidence, never from guesses: use the stored descriptions first (`get_asset_evidence` with `include: ["description"]`, free); for a clip without one, run `analyze_asset` with `analysis: "description"` once, which reads the whole clip and stores the reading for later turns; use `inspect_visual` only for one precise question about specific frames that the stored reading does not answer (a small paid Luna call, cached). Ask exactly the question that decides the finding.

```json
{"tool":"inspect_visual","arguments":{"projectId":"project-id","assetId":"asset-id","question":"Is the product name on the box legible?","atSeconds":[3.2,3.6]}}
```

6. If perceptual frame review is justified, call `review_project` at `frames`; this is a spend point. `checks` samples the last frame before and first frame after each cut and makes one Luna call per cut, capped at 12. Use `rangeSeconds` to bound long sequences. Otherwise call `render_range` for a free motion/audio preview.

```json
{"tool":"review_project","arguments":{"projectId":"project-id","level":"frames","atSeconds":[12.2,12.4,12.6]}}
```

```json
{"tool":"review_project","arguments":{"projectId":"project-id","level":"frames","rangeSeconds":[0,30],"checks":["eyeline","jump"]}}
```

```json
{"tool":"render_range","arguments":{"projectId":"project-id","startSeconds":11.9,"endSeconds":13,"height":540}}
```

## Craft rules

Report pass, fail or not checked for word boundaries, repetition, levels, rhythm, continuity, safe area, static tails, timebase, gaps and overlaps. A rhythm flag is deterministic timing evidence, not an enforced edit. An eyeline or jump-cut warning must retain both returned frame URLs. Never claim a visual or audio judgment without corresponding media/evidence.

For a targeted correction compare the proposed transaction and actual result with that correction; preserve accepted assets and unrelated properties. Reuse evidence only when its asset/version and sampled range still match. A text edit does not invalidate source analysis. Inspect text as rendered glyphs, checking alignment, frame-relative size, contrast, clipping and duplicate captions. Preserve reference timestamps and unknown traits. A low-confidence transcript over music is not evidence of narration; measurements are not listening. Intentional black cards and quiet holds require interval-based interpretation, retaining detector warnings.

## Source video diagnosis
For understanding/diagnosis of a source video (15–180 seconds), start `analyze_postproduction` and return the persisted job state. It runs outside the chat deadline with its own limit. Do not busy-poll or prepare an editorial plan unless an edit was requested. Later read `action: status` (MCP: `get_asset_evidence`); summarize understanding, scenes, strengths, problems and up to five priorities with evidence/time references. Preserve uncertainty and disagreements between listening/transcription/measurements. No brief means conditional purpose-dependent recommendations, not an invented accepted intent. Missing narration/music/captions/CTA is not a universal defect. A new brief reuses the source reading. At most three directed inspections may resolve material doubts. Failed or interrupted stages require explicit retry; technical-only and legacy reads never silently start paid upgrades.
