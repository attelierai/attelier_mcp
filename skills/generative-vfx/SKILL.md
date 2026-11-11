---
name: generative-vfx
description: Plan, generate and composite editable AI-assisted visual effects in Attelier. Use for regional replacements, background changes, product cutouts, generated inserts, image-to-video shots, cleanup and stylized VFX with controlled scope.
---

# Generative VFX

## Executable workflow

1. Call `inspect_project` and `render_frame` to pin the source shot, protected region and adjacent continuity.

```json
{"tool":"inspect_project","arguments":{"projectId":"project-id","rangeSeconds":[8,14]}}
```

```json
{"tool":"render_frame","arguments":{"projectId":"project-id","atSeconds":10,"width":960}}
```

2. Call `quote_job` for the narrowest capability. Review scope/cost; `start_job` is the spend point.

```json
{"tool":"quote_job","arguments":{"kind":"capability","capability":"regional_inpaint","input":{"projectId":"project-id","elementId":"shot-id","maskAssetId":"mask-id","instruction":"Remove only the marked object"}}}
```

```json
{"tool":"start_job","arguments":{"kind":"capability","quoteId":"approved-quote-id","idempotencyKey":"vfx-shot-10-inpaint"}}
```

3. Call `get_job`, place the returned asset through `compile_edit`, then review the boundary in motion.

```json
{"tool":"get_job","arguments":{"kind":"capability","jobId":"capability-job-id"}}
```

```json
{"tool":"render_range","arguments":{"projectId":"project-id","startSeconds":8,"endSeconds":14,"height":540}}
```

## Craft rules

Follow atelier.composite.subject-cutout@1, atelier.region.inpaint@1 and atelier.generate.image-to-video@1. Keep source and generated layers separate; protect identity and all pixels outside the declared mask.
