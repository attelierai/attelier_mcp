---
name: create-from-brief
description: Turn an approved creative brief into a complete editable video in Attelier. Use when the user wants a video from an objective, audience, message, assets and delivery constraints rather than a specific timeline edit.
---

# Create from brief

## Executable workflow

1. Call `discover_atelier` and `search_media` after the brief is approved; reuse project/Library assets first.

```json
{"tool":"discover_atelier","arguments":{}}
```

```json
{"tool":"search_media","arguments":{"projectId":"project-id","query":"brief-approved hero media","scope":"all","limit":20}}
```

2. Call `quote_job` only for missing semantic generation. Review cost and approval; `start_job` is the spend point.

```json
{"tool":"quote_job","arguments":{"kind":"workflow","workflow":"create_from_brief","input":{"projectId":"project-id","objective":"Approved objective","durationSeconds":30}}}
```

```json
{"tool":"start_job","arguments":{"kind":"workflow","quoteId":"approved-quote-id","idempotencyKey":"create-brief-project"}}
```

3. Call `get_job`, then `inspect_project`, `review_project` and `render_frame` on the editable result.

```json
{"tool":"get_job","arguments":{"kind":"workflow","jobId":"workflow-job-id"}}
```

```json
{"tool":"review_project","arguments":{"projectId":"project-id","level":"gates","profile":"general-video-v1"}}
```

## Craft rules

Require objective, audience, proof, CTA, format, duration, tone, rights and budget. Preserve concept choices for human direction and never invent claims.
