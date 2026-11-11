---
name: social-repurposing
description: Adapt an existing editable video or campaign into platform-specific Attelier variants. Use for aspect-ratio changes, duration cutdowns, alternate hooks, CTA variants, captioned social exports and coordinated multi-platform delivery.
---

# Social repurposing

## Executable workflow

1. Call `inspect_project` and `checkpoint_project` to preserve the approved master before branching edits.

```json
{"tool":"inspect_project","arguments":{"projectId":"project-id","include":["transcripts"]}}
```

```json
{"tool":"checkpoint_project","arguments":{"projectId":"project-id","action":"create","expectedRevision":20,"name":"approved master before social variants"}}
```

2. Call `compile_edit` for the platform cut and measured per-shot reframe; inspect the simulation.

```json
{"tool":"compile_edit","arguments":{"projectId":"project-id","expectedRevision":21,"calls":[{"tool":"propose_subject_reframe","arguments":{"elementId":"hero-clip-id","target":"vertical","subjectLabel":"product"}},{"tool":"trim_clip","arguments":{"elementId":"hero-clip-id","durationSeconds":9}}]}}
```

3. Call `commit_transaction`, then `review_project` and `render_frame` for that platform branch.

```json
{"tool":"commit_transaction","arguments":{"projectId":"project-id","transaction":{"id":"transaction-from-compile_edit"}}}
```

```json
{"tool":"review_project","arguments":{"projectId":"project-id","level":"gates","profile":"social-video-v1"}}
```

## Craft rules

Rebuild communication hierarchy, titles and captions per platform. Preserve master, claims and rights; aspect conversion is not one blind crop.
