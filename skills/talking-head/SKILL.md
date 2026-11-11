---
name: talking-head
description: Edit, clean and finish an editable presenter or interview video in Attelier. Use for talking heads, expert explainers, testimonials, interviews, podcasts with camera, direct-to-camera social videos and presenter-led lessons.
---

# Talking head

## Executable workflow

1. Call `inspect_project` with transcript/audio evidence, then call `analyze_asset` for any missing artifact.

```json
{"tool":"inspect_project","arguments":{"projectId":"project-id","include":["transcripts","audio"]}}
```

```json
{"tool":"analyze_asset","arguments":{"projectId":"project-id","assetId":"speaker-asset-id","analysis":"transcription"}}
```

2. Call `compile_edit` for word-mapped cleanup, captions and any measured subject reframe; inspect the simulation.

```json
{"tool":"compile_edit","arguments":{"projectId":"project-id","expectedRevision":18,"calls":[{"tool":"propose_transcript_edit","arguments":{"assetId":"speaker-asset-id","elementId":"speaker-element-id","kind":"fillers","minimumFillerConfidence":0.9}},{"tool":"propose_subject_reframe","arguments":{"elementId":"speaker-element-id","target":"vertical","subjectLabel":"speaker"}}]}}
```

3. Call `commit_transaction`, then `review_project` with the talking-head profile and `render_range` around repaired cuts.

```json
{"tool":"commit_transaction","arguments":{"projectId":"project-id","transaction":{"id":"transaction-from-compile_edit"}}}
```

```json
{"tool":"review_project","arguments":{"projectId":"project-id","level":"gates","profile":"talking-head-v1"}}
```

```json
{"tool":"render_range","arguments":{"projectId":"project-id","startSeconds":4,"endSeconds":10,"height":540}}
```

## Craft rules

Preserve meaning, names, claims, breaths and source sync. Reject unsafe crops, unreadable captions, fabricated speech and destructive cleanup.
