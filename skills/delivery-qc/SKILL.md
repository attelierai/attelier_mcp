---
name: delivery-qc
description: Validate a pinned Attelier render before publication. Use for final delivery, codec and format checks, black/frozen frames, silence, clipping, captions, provenance or publish-readiness gates.
---

# Delivery QC

## Executable workflow

1. Call `inspect_project` and `review_project` on the exact revision/profile before rendering.

```json
{"tool":"inspect_project","arguments":{"projectId":"project-id","include":["transcripts","audio"]}}
```

```json
{"tool":"review_project","arguments":{"projectId":"project-id","level":"gates","profile":"general-video-v1"}}
```

2. Call `quote_job`; confirm pinned revision, format, quality and cost. Call `start_job` within existing scoped authorization and budget; do not require repeated approval for already authorized operations.

```json
{"tool":"quote_job","arguments":{"kind":"render","projectId":"project-id","format":"mp4","quality":"master"}}
```

```json
{"tool":"start_job","arguments":{"kind":"render","quoteId":"approved-quote-id","idempotencyKey":"delivery-project-master"}}
```

3. Call `get_job` until complete. Use its technical QC and MCP output resource; do not infer publish readiness from encode success alone.

```json
{"tool":"get_job","arguments":{"kind":"render","jobId":"render-job-id"}}
```

## Craft rules

Pin revision, format and profile; check duration, dimensions, codec, frame rate, black/frozen frames, silence, clipping, captions, integrity, lineage, rights and consent. Keep technical, perceptual and human judgments separate.

Review the exact encoded output, not just timeline previews or an older render. Sample each changed title and the full logo; verify glyph alignment, no duplicate captions and no cropped wordmark. On text-only corrections verify the audio bitstream or decoded PCM is unchanged. Match black/silence detections to intentional timeline intervals and retain the original warnings; encode success alone is not a quality verdict. Reference traits not present in observed samples remain unknown. Keep transcription, measurement and listening separate, and state what was not checked. Reuse a valid cached review for the same encoded bytes and brief instead of paying again.
