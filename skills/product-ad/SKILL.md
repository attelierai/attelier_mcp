---
name: product-ad
description: Create, revise or evaluate an editable product advertisement in Attelier from an approved brief and assets. Use for commercials, performance ads, product launches, app demos, retail promotions, local-service ads and Product Ad benchmark cases.
---

# Product ad

## Workflow

Every step below is executable through the public MCP catalog.

1. Call `discover_atelier`, then `inspect_project`; lock approved product facts, offer, audience, CTA, duration and profile before spending.

```json
{"tool":"discover_atelier","arguments":{}}
```

```json
{"tool":"inspect_project","arguments":{"projectId":"project-id"}}
```

2. Call `compile_edit` for a deterministic hook-benefit-proof-CTA assembly. Read `simulation` and preserve product identity.

```json
{"tool":"compile_edit","arguments":{"projectId":"project-id","expectedRevision":6,"calls":[{"tool":"compose_social_ad","arguments":{"durationSeconds":15,"shots":[{"assetId":"product-shot-id","startSeconds":0,"durationSeconds":5}],"voice":{"assetId":"voice-id","startSeconds":0,"durationSeconds":15,"gainDb":0},"music":{"assetId":"music-id","startSeconds":0,"durationSeconds":15,"gainDb":-8},"captions":[{"text":"Approved product claim","startSeconds":1,"durationSeconds":3}]}}]}}
```

3. Call `commit_transaction`, then call `render_frame` for the product and CTA moments.

```json
{"tool":"commit_transaction","arguments":{"projectId":"project-id","transaction":{"id":"transaction-from-compile_edit"}}}
```

```json
{"tool":"render_frame","arguments":{"projectId":"project-id","atSeconds":12,"width":960}}
```

4. Call `review_project` with `product-ad-v1`. Quote delivery only after gates pass.

```json
{"tool":"review_project","arguments":{"projectId":"project-id","level":"gates","profile":"product-ad-v1"}}
```

```json
{"tool":"quote_job","arguments":{"kind":"render","projectId":"project-id","format":"mp4","quality":"master"}}
```

## Craft rules

Follow atelier.color.match-and-look@1. Use only supplied product evidence and approved claims; prioritize a legible hook, proof and CTA, and separate technical gates from human taste.
