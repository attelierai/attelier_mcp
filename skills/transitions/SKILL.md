---
name: transitions
description: Choose, author and validate Attelier transitions with real overlap, valid handles and explicit audio treatment. Use for cross-dissolve, dip transitions or transition-quality review.
---

# Transitions

## Executable workflow

1. Call `inspect_project` for adjacent source handles and current revision.

```json
{"tool":"inspect_project","arguments":{"projectId":"project-id","rangeSeconds":[9,12]}}
```

2. After `analyze_asset { analysis: "shots" }`, call `compile_edit` with the selected transition and duration. Use `snap:"shot"` to keep both ramps within measured source shots, then inspect overlap/ripple and `prepared.clampedBy`.

```json
{"tool":"compile_edit","arguments":{"projectId":"project-id","expectedRevision":13,"calls":[{"tool":"apply_transition","arguments":{"outgoingElementId":"clip-a","incomingElementId":"clip-b","kind":"cross-dissolve","durationSeconds":0.5,"snap":"shot"}}]}}
```

3. Call `commit_transaction`, then `render_range` across the whole curve with audio.

```json
{"tool":"commit_transaction","arguments":{"projectId":"project-id","transaction":{"id":"transaction-from-compile_edit"}}}
```

```json
{"tool":"render_range","arguments":{"projectId":"project-id","startSeconds":9.5,"endSeconds":11.5,"height":540}}
```

## Craft rules

Follow atelier.transition.cross-dissolve@1, atelier.transition.dip-to-black@1 or atelier.transition.dip-to-white@1. Use transitions sparsely and preserve the clean cut when handles are insufficient.
