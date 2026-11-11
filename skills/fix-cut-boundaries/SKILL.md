---
name: fix-cut-boundaries
description: Move Attelier in and out points onto word boundaries using transcript word timings, keep 120 ms handles, and split the picture cut from the audio cut with J and L cuts. Use when a cut clips a syllable, breathes wrong, or the sound should arrive before or after the image.
---

# Fix cut boundaries

## Executable workflow

1. Call `get_asset_evidence` for word timings on both sides of the cut.

```json
{"tool":"get_asset_evidence","arguments":{"projectId":"project-id","assetId":"asset-id","include":["transcript"]}}
```

2. Call `compile_edit` with `snap_cut_to_words`, the inspected revision and a 120 ms handle. Read the simulation for source-bound violations.

```json
{"tool":"compile_edit","arguments":{"projectId":"project-id","expectedRevision":14,"calls":[{"tool":"snap_cut_to_words","arguments":{"atSeconds":23.05,"handleSeconds":0.12}}]}}
```

3. Call `commit_transaction` only with that transaction, then call `review_project` again.

```json
{"tool":"commit_transaction","arguments":{"projectId":"project-id","transaction":{"id":"transaction-from-compile_edit"}}}
```

```json
{"tool":"review_project","arguments":{"projectId":"project-id","level":"cut","rangeSeconds":[22.5,23.6]}}
```

4. Call `render_range` around the cut and listen for clipped phonemes, breaths and clicks.

```json
{"tool":"render_range","arguments":{"projectId":"project-id","startSeconds":22.5,"endSeconds":23.6,"height":540}}
```

## Craft rules

Move cuts to transcript word boundaries, preserve 120 ms handles and use J/L separation only when it improves continuity. If two readings are editorially valid, ask instead of choosing silently.
