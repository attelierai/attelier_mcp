---
name: typography
description: Author or review readable Attelier titles, claims, calls to action and captions. Use when adding text, styling captions, checking reading time, contrast, hierarchy, collision or platform safe areas.
---

# Video typography

## Executable workflow

1. Call `inspect_project` for canvas, profile, approved copy, duration and revision.

```json
{"tool":"inspect_project","arguments":{"projectId":"project-id"}}
```

2. Save a new explicit typography/copy/layout instruction in the complete brief with `set_brief`, `expectedRevision` and `expectedPlanVersion=plan.version`; retain other decisions and skip identical intent. Distinguish titles/end phrases from running captions. Use `edit_title` on an existing element to avoid duplicates. For a centering correction change only the requested axis; retain approved font, size, copy, timing, montage and audio. Inspect the transaction for unrelated operations before committing.

```json
{"tool":"compile_edit","arguments":{"projectId":"project-id","expectedRevision":7,"calls":[{"tool":"edit_title","arguments":{"elementId":"existing-title-id","text":"Approved title"}}]}}
```

3. Call `commit_transaction`, then inspect the embedded `render_frame` pixels at both title times and worst-case contrast. Check rendered glyph/ink bounds as well as position: x=0.5 alone does not prove optical centering. Check size relative to the frame, clipping, contrast and duplicate captions. A preview URL alone is not visual evidence.

```json
{"tool":"commit_transaction","arguments":{"projectId":"project-id","transaction":{"id":"transaction-from-compile_edit"}}}
```

```json
{"tool":"render_frame","arguments":{"projectId":"project-id","atSeconds":3,"width":960}}
```

## Craft rules

Follow atelier.text.readable-overlay@1 while respecting the explicit brief. There is no universal title size: choose hierarchy for role, canvas and inspected references. Compare literal copy character-for-character with the user's supplied phrase before committing and after inspecting the result: preserve capitalization, punctuation and the absence of punctuation. Do not add a full stop or otherwise polish supplied copy. A readable render of altered wording still fails that correction. Storybook style and an ornamental font are project preferences only. If typography is undecided, show one representative frame within the proposal. Record reference timestamps and visible traits; do not claim a caption match when the samples have none.
