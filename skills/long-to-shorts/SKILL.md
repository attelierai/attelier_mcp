---
name: long-to-shorts
description: Turn long-form source material into multiple editable short-form videos in Attelier. Use for podcast clips, interview highlights, webinar excerpts, stream highlights, lessons, speeches and social cutdowns.
---

# Long to shorts

## Executable workflow

1. Call `inspect_project` with transcripts and identify complete ideas with source-time evidence.

```json
{"tool":"inspect_project","arguments":{"projectId":"project-id","include":["transcripts"]}}
```

2. Call `compile_edit` for a selected source range and per-shot vertical reframe; inspect each branch simulation.

```json
{"tool":"compile_edit","arguments":{"projectId":"project-id","expectedRevision":11,"calls":[{"tool":"prepare_project_asset_placement","arguments":{"projectAssetId":"asset-id","trackId":"video-track-id","startSeconds":0,"sourceStartSeconds":82.4,"durationSeconds":24,"audioRole":"dialogue"}},{"tool":"propose_subject_reframe","arguments":{"elementId":"clip-id","target":"vertical","subjectLabel":"speaker"}}]}}
```

3. Call `commit_transaction`, then `review_project` and `render_frame` for the vertical safe area.

```json
{"tool":"commit_transaction","arguments":{"projectId":"project-id","transaction":{"id":"transaction-from-compile_edit"}}}
```

```json
{"tool":"review_project","arguments":{"projectId":"project-id","level":"gates","profile":"social-video-v1"}}
```

```json
{"tool":"render_frame","arguments":{"projectId":"project-id","atSeconds":2,"width":960}}
```

## Craft rules

Select complete ideas and truthful hooks, recut instead of blindly cropping, and evaluate every short independently.
