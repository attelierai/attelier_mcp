---
name: dialogue-levelling
description: Level dialogue from mixed sources onto one bed in Attelier — per-clip gain to −18 LUFS, 80 ms cut fades, a −14 LUFS web master — and decide between normalization and manual gain from measured asset evidence. Use when speech level or tone jumps between clips.
---

# Dialogue levelling

## Executable workflow

1. Call `get_asset_evidence` for measured loudness, true peak, range and silence for each speech asset.

```json
{"tool":"get_asset_evidence","arguments":{"projectId":"project-id","assetId":"asset-id","include":["audio"]}}
```

2. If audio evidence is absent, call `analyze_asset` with `audio` and poll the returned analysis job with `get_job`.

```json
{"tool":"analyze_asset","arguments":{"projectId":"project-id","assetId":"asset-id","analysis":"audio"}}
```

```json
{"tool":"get_job","arguments":{"kind":"analysis","jobId":"analysis-job-id"}}
```

3. Call `compile_edit` using measured per-clip gain and 80 ms fades. Inspect the simulation before commit.

```json
{"tool":"compile_edit","arguments":{"projectId":"project-id","expectedRevision":9,"calls":[{"tool":"set_audio_levels","arguments":{"elementId":"dialogue-element-id","gainDb":-3.4,"fadeInSeconds":0.08,"fadeOutSeconds":0.08}}]}}
```

4. Call `commit_transaction`, then re-run cut review for remaining jumps.

```json
{"tool":"commit_transaction","arguments":{"projectId":"project-id","transaction":{"id":"transaction-from-compile_edit"}}}
```

```json
{"tool":"review_project","arguments":{"projectId":"project-id","level":"cut"}}
```

## Craft rules

Target the dialogue bed before the master; prefer measured reversible gain over blind normalization. Protect consonants, authored silence and headroom, and never normalize clipping into a limiter.
