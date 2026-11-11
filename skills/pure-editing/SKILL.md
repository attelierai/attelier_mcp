---
name: pure-editing
description: Perform precise deterministic video editing in Attelier without unnecessary generative media. Use for trims, splits, moves, retime, composition, keyframes, titles, captions, transitions, audio, color and delivery from supplied assets.
---

# Pure editing

## Executable workflow

1. Call `inspect_project` and `get_asset_evidence`; resolve exact IDs, ranges and handles before planning.

```json
{"tool":"inspect_project","arguments":{"projectId":"project-id","include":["transcripts","audio"]}}
```

2. Call `compile_edit` for the smallest deterministic change and inspect its simulation.

```json
{"tool":"compile_edit","arguments":{"projectId":"project-id","expectedRevision":3,"calls":[{"tool":"ripple_trim_clip","arguments":{"elementId":"clip-id","edge":"end","offsetSeconds":-2}}]}}
```

3. Call `commit_transaction`, then prove affected pixels/motion with `render_frame` or `render_range` and run `review_project`.

```json
{"tool":"commit_transaction","arguments":{"projectId":"project-id","transaction":{"id":"transaction-from-compile_edit"}}}
```

```json
{"tool":"render_range","arguments":{"projectId":"project-id","startSeconds":3,"endSeconds":8,"height":540}}
```

```json
{"tool":"review_project","arguments":{"projectId":"project-id","level":"cut"}}
```

## Craft rules

Use only supplied or approved Library media, keep mutations reversible and never generate media to conceal an editing failure.
