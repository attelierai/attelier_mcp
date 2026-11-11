---
name: assemble-from-brief
description: Assemble a first editable cut from a structured Attelier brief and existing footage by measuring script coverage, ordering sourced dialogue, adding first-appearance character graphics, reviewing story order, and exporting. Use when a brief already defines the story and the task is to turn available clips into a cut rather than invent a concept.
---

# Assemble from brief

Build only from the stored brief and measured asset evidence. A line that has no transcript match is `notShot`; do not hide it with unrelated footage or generate replacement media unless the user separately authorizes generation.

## Executable workflow

1. Read the canonical stored brief. If the user supplied a Markdown brief that has not been stored yet, import it before entering the assembly workflow, then read it back.

```json
{"tool":"get_brief","arguments":{"projectId":"project-id"}}
```

2. Inspect the project and analyse every video or dialogue asset that lacks transcript or shot evidence. Poll each analysis job before asking for coverage.

```json
{"tool":"inspect_project","arguments":{"projectId":"project-id","include":["transcripts","audio"]}}
```

```json
{"tool":"analyze_asset","arguments":{"projectId":"project-id","assetId":"asset-id","analysis":"transcription"}}
```

```json
{"tool":"get_job","arguments":{"kind":"analysis","jobId":"analysis-job-id"}}
```

3. Request coverage. For every script line, use only matches at or above the reported 0.75 token-similarity threshold and preserve the returned source timecodes. Treat `notShot` as a production gap that does not block assembly of the available rows.

```json
{"tool":"inspect_project","arguments":{"projectId":"project-id","include":["coverage"]}}
```

4. Write one plan table with one row per approved beat: script index, speaker, chosen asset or clip label, source in/out, proposed timeline in/out, placement state, and `notShot`. Keep the brief's line order. Do not start placing while the table is incomplete.

5. The first editing mutation is exactly one `assemble_first_cut` call nested in `compile_edit`. Send the complete table in that call. A Markdown `Timeline | Source | Beat` row can be copied directly with `timeline`, `source`, and `beat`; a structured row can instead use `assetId`, `sourceStartSeconds`, `sourceEndSeconds`, and `timelineStartSeconds`. Put all known first-appearance graphics and the ending treatment in the same call. Never issue one insertion per round.

```json
{"tool":"compile_edit","arguments":{"projectId":"project-id","expectedRevision":12,"calls":[{"tool":"assemble_first_cut","arguments":{"rows":[{"timeline":"0.00–23.05","source":"clip 4 · 0.0–23.05","beat":"Owner intro; dissolve 0.40 out"},{"timeline":"22.65–30.70","source":"clip 6 · 0.0–8.05","beat":"Son in Ibiza; cut"}],"transitions":"fit-speech","graphics":[{"template":"lower-third/documentary-01","atSeconds":0,"durationSeconds":6.8,"slots":{"name":"Frank Whitmore","role":"Founder & CEO"}},{"template":"title-card/plain","atSeconds":23.05,"durationSeconds":4,"slots":{"title":"His son"}}],"holdLastFrameSeconds":3,"fadeOutSeconds":0.7}}]}}
```

The compiler resolves clip labels against project asset names, expands source rows to `insert_source_range` (or whole assets to `place_asset`), authors every requested transition with `fit:"speech"` and `snap:"shot"`, expands graphics, and adds the final hold/fade. It returns the produced seconds-based timeline table with the single revision-pinned transaction.

6. Inspect the simulation and commit that exact transaction once.

```json
{"tool":"commit_transaction","arguments":{"projectId":"project-id","transaction":{"id":"transaction-from-compile-edit"}}}
```

7. Re-inspect and run story review first. Resolve missing placed beats and out-of-order beats, then run cut review and inspect rendered ranges. A declared `notShot` line stays reported as a production gap; it is not a reason to discard an otherwise complete available-footage first cut.

```json
{"tool":"review_project","arguments":{"projectId":"project-id","level":"story"}}
```

```json
{"tool":"review_project","arguments":{"projectId":"project-id","level":"cut"}}
```

```json
{"tool":"render_range","arguments":{"projectId":"project-id","startSeconds":0,"endSeconds":20,"height":540}}
```

8. Make only targeted, evidence-backed fixes after review. Batch independent fixes in one revision-pinned transaction; do not rebuild or reinsert the first cut row by row.

```json
{"tool":"compile_edit","arguments":{"projectId":"project-id","expectedRevision":13,"calls":[{"tool":"trim_to_speech","arguments":{"elementId":"owner-intro-element","handleSeconds":0.08}},{"tool":"trim_to_speech","arguments":{"elementId":"closing-element","handleSeconds":0.08}}]}}
```

9. When story and cut reviews pass apart from explicitly declared `notShot` production gaps, run delivery gates, quote the export, start it only with spend authority, and poll to completion.

```json
{"tool":"review_project","arguments":{"projectId":"project-id","level":"gates","profile":"documentary-v1"}}
```

```json
{"tool":"quote_job","arguments":{"kind":"render","projectId":"project-id","format":"mp4","quality":"standard"}}
```

```json
{"tool":"start_job","arguments":{"kind":"render","quoteId":"render-quote-id","idempotencyKey":"assemble-brief-export-1"}}
```

```json
{"tool":"get_job","arguments":{"kind":"render","jobId":"render-job-id"}}
```

## Craft rules

The brief owns story order, character names and approved style. Transcript timecodes own dialogue trims. A clip match does not mean the line is on the timeline: check `placedOnTimeline`. Add a character graphic only on the first shot where that person is clearly visible, keep speech clear of transition ramps, and never call the cut complete while a shot beat is missing or out of order.

Ending: when the last clip carries a visual payoff after the last line (establishing/wide, building, reaction of the group), keep it to the clip's end and hold; never end on a mid-reaction close-up when a wide follows within the clip. Use shot markers to find the last shot.
