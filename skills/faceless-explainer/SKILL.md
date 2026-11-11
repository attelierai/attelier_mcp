---
name: faceless-explainer
description: Build a narrated explainer video with no presenter on camera, over generated images, motion and on-screen text in Attelier. Use for how-it-works videos, product explainers, educational shorts and listicles.
---

# Faceless explainer

## Executable workflow

1. Call `inspect_project`, then agree the explanation's spine: one claim per
section, in the order a newcomer needs them.

```json
{"tool":"inspect_project","arguments":{"projectId":"project-id"}}
```

2. Record the narration as the project brief, one script line per section.

```json
{"tool":"set_brief","arguments":{"projectId":"project-id","expectedRevision":0,"expectedPlanVersion":0,"brief":{"title":"How rendering works","script":[{"id":"section-1","line":"Every render starts from a single canonical timeline."}],"characters":[]}}}
```

3. Quote the narration and the illustration for each section before spending.

```json
{"tool":"quote_job","arguments":{"kind":"capability","projectId":"project-id","capability":"voice_generation","input":{"text":"Every render starts from a single canonical timeline."}}}
```

```json
{"tool":"quote_job","arguments":{"kind":"capability","projectId":"project-id","capability":"text_to_image","input":{"prompt":"Flat vector diagram of a timeline with three stacked tracks, single accent colour"}}}
```

```json
{"tool":"start_job","arguments":{"kind":"capability","quoteId":"quote-id","idempotencyKey":"explainer-section-1-image"}}
```

4. Place the sections with a readable text overlay for each claim, then review.

```json
{"tool":"compile_edit","arguments":{"projectId":"project-id","expectedRevision":2,"calls":[{"tool":"prepare_project_asset_placement","arguments":{"projectAssetId":"asset-id","trackId":"video-track-id","startSeconds":0,"durationSeconds":6}}]}}
```

```json
{"tool":"commit_transaction","arguments":{"projectId":"project-id","transaction":{"id":"transaction-from-compile_edit"}}}
```

```json
{"tool":"review_project","arguments":{"projectId":"project-id","level":"gates","profile":"social-video-v1"}}
```

## Craft rules

The voice carries the explanation and the picture carries the attention; never
make the viewer read and listen to different sentences at once. Keep one
visual system for the whole video. State only what the creator's source
material supports, and keep every on-screen number traceable to it.
