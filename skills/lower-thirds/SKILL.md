---
name: lower-thirds
description: Build documentary lower thirds in Attelier as exact text-layer property sets — a ruled type-only preset and a translucent box preset — with positions, durations, safe-area rules for 16:9 and 9:16, and render-verified preview/export parity. Use when identifying a speaker, place or chapter on screen.
---

# Lower thirds

## Executable workflow

1. Call `inspect_project` for canvas, active sequence and current revision.

```json
{"tool":"inspect_project","arguments":{"projectId":"project-id"}}
```

2. Confirm the project contains the required Bricolage and Inter font assets and copy their project asset ids. If either is absent, import that font before styling; a system fallback is not layout parity.

3. Call `compile_edit` with `add_graphic` and the `lower-third/documentary-01` template. Copy, font assets, time and duration are explicit; after shot analysis use `snap:"shot"` so the lower third does not cross an internal cut. Inspect the returned group id and simulation.

```json
{"tool":"compile_edit","arguments":{"projectId":"project-id","expectedRevision":8,"calls":[{"tool":"add_graphic","arguments":{"template":"lower-third/documentary-01","atSeconds":12.4,"durationSeconds":6.8,"snap":"shot","slots":{"name":"ALEX RIVERA","role":"DIRECTOR","nameFontAssetId":"font-bricolage-id","roleFontAssetId":"font-inter-id"}}}]}}
```

4. Call `commit_transaction` only with the returned transaction.

```json
{"tool":"commit_transaction","arguments":{"projectId":"project-id","transaction":{"id":"transaction-from-compile_edit"}}}
```

5. Call `render_frame` once at full opacity and once near the 0.7-second fade-out. Its embedded PNG is the layout authority.

```json
{"tool":"render_frame","arguments":{"projectId":"project-id","atSeconds":13.9,"width":960}}
```

```json
{"tool":"render_frame","arguments":{"projectId":"project-id","atSeconds":18.6,"width":960}}
```

## Craft rules

Use approved copy, one identification hierarchy and the correct 16:9 or 9:16 safe area. The template owns the Bricolage 46 px name, tracked Inter 24 px gold role, 0.6 black box and 0.2/0.7 fades; do not restyle those ad hoc. Do not infer text fit from numeric box dimensions; repair collisions from rendered pixels. Remove the complete result with `remove_graphic` and its returned group id, never by deleting only one layer.
