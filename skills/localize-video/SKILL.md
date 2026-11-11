---
name: localize-video
description: Localize an existing editable Attelier project with translated dialogue and authored on-screen text, then verify the language version and export it. Use when the requested result is a dubbed or translated project variant rather than a source-language edit.
---

# Localize video

Inspect the current project revision and confirm that placed dialogue assets have stored transcripts. Use `localize_project` with that exact `expectedRevision`, a BCP-47 target language, the requested scope, and `voice:"cast"` by default. Use `voice:"clone"` only for authorized voice-preserving dubbing and `voice:"stock"` for a single generic voice. The optional `cast` array pins a speaker to a `voiceId` or adds age, gender, tone, and delivery direction through `description`. Use `dryRun:true` when approval or budget review is still needed.

```json
{"tool":"localize_project","arguments":{"projectId":"project-id","expectedRevision":12,"targetLanguage":"es","scope":["dialogue","graphics"],"voice":"cast","cast":[{"speaker":"Narrator","description":"mature, warm, authoritative"}]}}
```

Poll the returned `jobId` with `get_job {kind:"capability"}`. A completed job must identify the method (`cast`, `dubbing`, or `tts`), provider costs, checkpoint, resulting revision, the speaker-to-voice map, a dedicated `Dialogue (<language>)` track, its timeline-aligned localized transcript, and translated graphic elements. The operation is reversible through the named pre-localization checkpoint.

Do not translate proper-name slots or restyle text. Preserve templates, fonts, timing, music, ambience, claims, and numeric facts. Voice-preserving dubbing may fall back to timed multilingual TTS only when the provider rejects dubbing for a plan or quota limitation; report which method actually ran.

The placed stem uses the pinned delivery treatment `atelier.audio.professional-mix@1`.

Before export, inspect the project with `include:["transcripts"]`, render a frame inside every changed graphic, run `review_project {level:"cut"}`, and listen-check one representative range per principal speaker. Export only after the localized track is audible, its transcript is present, original dialogue is substitution-covered rather than reported as missing, non-dialogue audio remains intact, and review has no errors.
