---
name: color-finishing
description: Match Attelier clips and apply a coherent creative finish while protecting skin, product and brand colors. Use for exposure, white balance, source matching, look application or color-quality review.
---

# Color finishing

## Executable workflow

1. Call `get_asset_evidence` and `render_frame` for source measurements and visible reference pixels.

```json
{"tool":"get_asset_evidence","arguments":{"projectId":"project-id","assetId":"asset-id","include":["description"]}}
```

```json
{"tool":"render_frame","arguments":{"projectId":"project-id","atSeconds":6,"width":960}}
```

2. Call `compile_edit` with measured correction, inspect its simulation and leave `no-change` results untouched.

```json
{"tool":"compile_edit","arguments":{"projectId":"project-id","expectedRevision":9,"calls":[{"tool":"propose_color_correction","arguments":{"elementId":"clip-id"}}]}}
```

3. Call `commit_transaction`, then render the same frame and a short range for clipping and temporal stability.

```json
{"tool":"commit_transaction","arguments":{"projectId":"project-id","transaction":{"id":"transaction-from-compile_edit"}}}
```

```json
{"tool":"render_range","arguments":{"projectId":"project-id","startSeconds":5,"endSeconds":9,"height":540}}
```

## Craft rules

Follow atelier.color.match-and-look@1. Normalize and match before applying one look; protect skin, product and brand colors, and escalate low-confidence white balance.
