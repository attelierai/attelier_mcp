---
name: localization
description: Localize and dub editable Attelier projects while preserving meaning, timing, brand terminology and authorized identity. Use for translated captions, subtitles, voiceover, dubbing, multilingual variants and consent-gated lip sync.
---

# Localization

## Executable workflow

1. Call `get_asset_evidence` for the approved source transcript and timing.

```json
{"tool":"get_asset_evidence","arguments":{"projectId":"project-id","assetId":"dialogue-asset-id","include":["transcript","audio"]}}
```

2. Call `quote_job` for the localization workflow. Review language, glossary, speaker mapping and quote; `start_job` is the spend point.

```json
{"tool":"quote_job","arguments":{"kind":"workflow","workflow":"localization","input":{"projectId":"project-id","targetLocale":"es-ES","glossary":{"Attelier":"Attelier"}}}}
```

```json
{"tool":"start_job","arguments":{"kind":"workflow","quoteId":"approved-quote-id","idempotencyKey":"localize-project-es"}}
```

3. Call `get_job` until terminal status, then `review_project` and `render_range` on the localized branch.

```json
{"tool":"get_job","arguments":{"kind":"workflow","jobId":"workflow-job-id"}}
```

```json
{"tool":"review_project","arguments":{"projectId":"project-id","level":"gates","profile":"general-video-v1"}}
```

## Craft rules

Lock names, numbers, claims and glossary; preserve speaker identity and timing. Lip sync requires verified scoped consent, and provider output requires bilingual review.
