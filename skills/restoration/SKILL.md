---
name: restoration
description: Diagnose and improve damaged, noisy, low-resolution or visually inconsistent media in Attelier. Use for dialogue cleanup, stabilization, background cleanup, regional repair, whole-video upscale or compression, color normalization and restoration delivery.
---

# Restoration and cleanup

## Executable workflow

1. Call `checkpoint_project` and `get_asset_evidence` to preserve the source and inventory measurable defects.

```json
{"tool":"checkpoint_project","arguments":{"projectId":"project-id","action":"create","expectedRevision":5,"name":"untouched restoration source"}}
```

```json
{"tool":"get_asset_evidence","arguments":{"projectId":"project-id","assetId":"damaged-asset-id","include":["audio","description"]}}
```

2. Call `compile_edit` for the least destructive deterministic correction and inspect its simulation.

```json
{"tool":"compile_edit","arguments":{"projectId":"project-id","expectedRevision":6,"calls":[{"tool":"propose_color_correction","arguments":{"elementId":"damaged-element-id"}},{"tool":"propose_motion_treatment","arguments":{"elementId":"damaged-element-id","kind":"stabilization","strength":0.3,"frames":5}}]}}
```

3. For an available Vidaio whole-video operation, keep the source unchanged; save a project version when working in a project, then use the generic inference route. `upscale_clip` is image-only; it does not upscale a whole video. `quote_inference` does not spend; `start_inference` does only after approval. The API probes actual video dimensions and duration server-side.

```json
{"tool":"list_models","arguments":{}}
```

```json
{"tool":"upload_inference","arguments":{"path":"/absolute/path/to/source.mp4"}}
```

Only use a Vidaio id returned by `list_models`/`get_model`. `upload_inference`
returns `{id,mimeType,bytes,sha256}`; compose the internal
`videoUploadUrl` as `/v1/uploads/<id>/content` from that `id`. Do not give
Vidaio a public, guessed or hand-made media URL.

```json
{"tool":"quote_inference","arguments":{"model":"vidaio/upscale/standard","parameters":{"videoUploadUrl":"/v1/uploads/upload-id/content","upscaleFactor":2}}}
```

For smaller delivery files while preserving source resolution, quote
`vidaio/compress/standard` or `vidaio/compress/premium` with
`compressionLevel` exactly `Low`, `Medium` or `High`: Low favors smaller files,
Medium balances size and quality, and High preserves more quality. Standard/Premium
is part of the model id, not a parameter. Do not infer prices, availability or a
provider cancellation action: the live model and quote response decide the
first two, and Attelier's normal inference lifecycle owns cancellation.

4. Start the approved quote once with an idempotency key, poll
`get_inference`, then `download_inference` to a new explicit path. Import the
completed output through `import_media` as a separate Library asset and retain
the source; compare representative frames and delivery/file-size evidence
before replacing any timeline use.

For a video already in the Library, do not confuse its `source.url` with an
inference upload. First call `discover_atelier` and prefer the returned
`video_upscale` or `video_compress` capability descriptor, quoting it with the
existing asset URL, its descriptor `providerId`, and `routingTier: "manual"`:

```json
{"tool":"quote_job","arguments":{"kind":"capability","projectId":"project-id","capability":"video_upscale","input":{"videoUploadUrl":"source.url-from-library-asset","providerId":"descriptor.id","routingTier":"manual","upscaleFactor":2}}}
```

Use `video_compress` with `compressionLevel` `Low`, `Medium` or `High` for the
same route, with the same Low/smaller-file, Medium/balanced, High/more-quality
meaning. If no matching descriptor is discoverable, download the Library
asset locally and follow the inference upload route above; do not pass its
Library URL as an inference-upload URL.

## Craft rules

Follow atelier.region.blur@1. Preserve an untouched comparison, protect identity/product detail and never describe generated texture as recovered original detail. Vidaio does not expose standalone denoise or restoration; use its documented upscale/compression operations only.
