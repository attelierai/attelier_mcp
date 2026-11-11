---
name: audio-mix
description: Create and validate role-aware Attelier audio mixes with dialogue cleanup, music ducking, fades, loudness and true-peak delivery. Use for dialogue, voiceover, dubbing, music, SFX or final audio QC.
---

# Audio mix

## Executable workflow

1. Call `inspect_project` with audio evidence to identify dialogue, voiceover, music, SFX and unknown roles.

```json
{"tool":"inspect_project","arguments":{"projectId":"project-id","include":["audio"]}}
```

2. Save changed sound direction in the complete brief with `set_brief`, `expectedRevision` and `expectedPlanVersion=plan.version`; reject superseded choices while preserving unrelated decisions. Resolve the exact requested asset using all identifying details (speaker, language, style/version), not a partial name match. If two assets share a speaker, inspect their names and existing evidence before selecting; do not substitute a different take. Preserve accepted assets and levels outside the correction. “Only music” supersedes narrated direction; mute/remove unwanted speech without replacing approved music. Add narration when requested, not because the output is an ad. Use `compile_edit` only for necessary roles, levels, fades or ducking; inspect the simulation.

```json
{"tool":"compile_edit","arguments":{"projectId":"project-id","expectedRevision":21,"calls":[{"tool":"set_property","arguments":{"elementId":"music-element-id","path":"audio.role","value":"music"}},{"tool":"set_property","arguments":{"elementId":"music-element-id","path":"audio.ducking","value":true}},{"tool":"set_audio_levels","arguments":{"elementId":"music-element-id","gainDb":-4,"fadeInSeconds":0.08,"fadeOutSeconds":0.08}}]}}
```

3. Call `commit_transaction`, then call `review_project` for deterministic audio defects.

```json
{"tool":"commit_transaction","arguments":{"projectId":"project-id","transaction":{"id":"transaction-from-compile_edit"}}}
```

```json
{"tool":"review_project","arguments":{"projectId":"project-id","level":"cut"}}
```

4. Quote the exact delivery render; start within existing scoped authorization and budget. Request new authorization only for an unapproved cost or scope. A text correction does not regenerate music or repay source analysis.

```json
{"tool":"quote_job","arguments":{"kind":"render","projectId":"project-id","format":"mp4","quality":"master"}}
```

## Craft rules

Follow atelier.audio.professional-mix@1 and the selected delivery profile; measure the final bus. Separate transcription, measurements and actual listening. One low-confidence word over music is not proof of narration; silence can be an intentional hold. Relate detections to timeline intervals and keep raw evidence. For text-only changes compare audio configuration and, on delivery, the encoded audio hash or decoded PCM if remuxing changes the bitstream. Do not claim listening from meters. Use a short preview when a consequential soundtrack/voice choice remains undecided.
