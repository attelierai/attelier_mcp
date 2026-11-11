---
name: edit-cutting
description: Plan and apply precise deterministic timeline edits in Attelier, including trim, split, move, delete, ripple delete, slip, roll, slide and source-handle-aware split edits. Use when improving structure, performance, continuity or pacing without generating new media.
---

# Edit cutting

## Executable workflow

1. Call `inspect_project` with transcript evidence for exact timeline/source ranges and revision.

```json
{"tool":"inspect_project","arguments":{"projectId":"project-id","include":["transcripts"]}}
```

2. Call `compile_edit` with the smallest typed cut operation and inspect source bounds, collisions and ripple in `simulation`.

```json
{"tool":"compile_edit","arguments":{"projectId":"project-id","expectedRevision":17,"calls":[{"tool":"split_clip","arguments":{"elementId":"clip-id","atSeconds":3.25}},{"tool":"move_clip","arguments":{"elementId":"clip-part-id","startSeconds":9.5}}]}}
```

3. Call `commit_transaction`, then `review_project` and `render_range` around changed boundaries.

```json
{"tool":"commit_transaction","arguments":{"projectId":"project-id","transaction":{"id":"transaction-from-compile_edit"}}}
```

```json
{"tool":"render_range","arguments":{"projectId":"project-id","startSeconds":8.8,"endSeconds":10.3,"height":540}}
```

## Craft rules

Follow atelier.retime.speed@1 when retiming. Preserve handles and meaning; use J/L cuts deliberately and escalate ambiguous editorial choices.
