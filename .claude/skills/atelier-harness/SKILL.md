---
name: atelier-harness
description: Drive Attelier through its curated MCP golden path to inspect media evidence, prepare and commit deterministic edits, review results, and run quoted jobs.
---

# Attelier Harness

The public MCP surface is generated from the canonical catalog and currently contains these tools:

- `motion_source` `{ action, projectId, sourceId?, version?, expectedVersion?, expectedRevision?, path?, patch?, composition?, media? }` — List, read or save an immutable custom Remotion composition in the shared project.
- `motion_render_source` `{ projectId, sourceId, version, stillAtSeconds?, rangeSeconds?, preview?, downloadTo? }` — Render one exact saved Remotion source version in an isolated, bounded runtime.
- `quote_capability_batch` `{ maximumCredits, items }` — Quote 1–16 named generations together under an explicit total credit ceiling.
- `start_capability_batch` `{ batchId, idempotencyKey }` — Start an exact saved batch after its quote approvals.
- `get_capability_batch` `{ batchId }` — Read a generation batch's exact quotes, jobs, outputs, settled/pending credits and partial failures.
- `cancel_capability_batch` `{ batchId }` — Request cancellation of the unfinished jobs in a batch.
- `delivery_pack` `{ action, projectId?, expectedRevision?, packId?, idempotencyKey?, maximumCredits?, coverAtSeconds?, variants? }` — Prepare revision-pinned editable format variants and render quotes under one credit ceiling.
- `render_review` `{ action, renderJobId?, projectId?, reviewId?, expectedRevision?, label?, allowApproval?, expiresInDays? }` — Invite review of an exact completed render, read timestamped feedback as edit context, or revoke an invitation.
- `outcome_evidence` `{ days? }` — Read workspace delivery outcomes, exact revision approvals, queue-to-completion time, bounded generation credit coverage and the running backend's build/depe...
- `read_series` `{ seriesId? }` — Read owned Series, frozen pilot recipes, planned episodes, their exact renders/approval and current calendar-month credit commitments (UTC).
- `save_series` `{ seriesId?, expectedRevision?, idempotencyKey?, name, pilotRenderId, approvedPilot, monthlyCredits, recipe }` — Save a reusable recipe only after creator approval of the exact finished pilot and recipe.
- `plan_episodes` `{ seriesId, expectedRevision, episodes }` — Plan 1–50 dated topics and inputs against the current Series revision, without spending.
- `make_episode` `{ episodeId, action, maximumCredits?, renderJobId?, expectedRevision? }` — Generate one planned episode under its explicit maximumCredits and Series monthly cap.
- `list_models` `{}` — List the models you can run now: id (the product id to pass as model), name, capability, parameters, pricing, tier (draft, standard or premium) and health.
- `get_model` `{ model }` — Inspect model parameters, limits, conditions and dated availability.
- `get_usage` `{}` — Read persisted workspace credits and cost evidence; never synchronizes provider invoices.
- `list_inference_requests` `{ limit?, cursor? }` — List workspace inference requests with cursor pagination.
- `upload_inference` `{ path?, dataBase64?, mimeType? }` — Upload a local image, audio or video for inference.
- `quote_inference` `{ model, parameters }` — Quote one effective model configuration without spending.
- `start_inference` `{ quoteId, idempotencyKey }` — Start the saved quote once.
- `get_inference` `{ requestId }` — Poll the request execution and cost reconciliation independently.
- `cancel_inference` `{ requestId }` — Request cancellation; incurred provider cost can remain billable.
- `download_inference` `{ requestId, downloadTo? }` — Get a completed result and authenticated download link, with generation_ms.
- `list_pipelines` `{}` — List the authenticated creator's reusable content pipelines.
- `get_pipeline` `{ pipelineId }` — Read a persisted pipeline draft, immutable versions, schedule and latest generations before editing.
- `create_pipeline` `{ name, templateProjectId, draft? }` — Save a reusable content recipe from an owned Studio template project.
- `update_pipeline` `{ pipelineId, expectedRevision, name?, draft? }` — Persist name or structured recipe against expectedRevision.
- `version_pipeline` `{ pipelineId, expectedRevision, activate? }` — Freeze a valid draft and its exact editable template.
- `undo_pipeline` `{ pipelineId, expectedRevision }` — Undo the last saved draft change against expectedRevision.
- `pin_pipeline` `{ pipelineId, expectedRevision, versionId, runId }` — Use a completed Economic or Closer-to-final test of the current saved draft as the production version.
- `schedule_pipeline` `{ pipelineId, expectedRevision, activeVersionId?, schedule?, limits? }` — Save a daily schedule, weekdays (0=Sunday), IANA timezone, default inputs and execution/rolling-period spend limits.
- `list_pipeline_runs` `{ pipelineId }` — Inspect generations with captured sources, content, effective profile, costs, errors, job ids and independent Studio projects.
- `cancel_workflow_run` `{ runId }` — Cancel a running or approval-blocked workflow and its remaining stages.
- `resume_workflow_run` `{ runId }` — Resume a failed durable workflow from its recorded stage.
- `discover_atelier` `{}` — Discover Attelier use cases, capabilities, providers, workflows and public tool entrypoints.
- `list_agent_skills` `{}` — Discover versioned Attelier use-case and craft discipline skills available to the harness.
- `get_agent_skill` `{ skillId }` — Load one versioned Attelier use-case or craft discipline skill after discovery.
- `list_projects` `{}` — List projects owned by the authenticated workspace, newest first.
- `create_project` `{ name, frameRate?, width?, height? }` — Create an empty editable project in the authenticated workspace with a main sequence.
- `set_brief` `{ projectId, expectedRevision, expectedPlanVersion?, brief?, briefMarkdown?, fromPath? }` — Store the complete brief, preserving explicit accepted decisions and rejecting superseded choices.
- `get_brief` `{ projectId }` — Read the project's current structured brief together with its project revision and independently versioned project-plan record.
- `import_media` `{ projectId, paths?, uploadIds?, place?, attach?, rights?, license?, atSeconds?, expectedRevision? }` — Import media into the shared Library.
- `prepare_project` `{ projectId, paths?, uploadIds?, briefPath?, brief?, briefMarkdown?, idempotencyKey?, analyses?, place? }` — Import local media into an existing project, optionally place it, store a Markdown brief, and queue transcription, description, color, or shot-change analysi...
- `inspect_project` `{ projectId, rangeSeconds?, include? }` — Read the canonical editable project snapshot, optionally focused to a timeline range with transcript or audio evidence.
- `search_media` `{ projectId?, query?, scope?, kind?, limit? }` — Search project media, workspace Library media, or both through one normalized result set.
- `get_asset_evidence` `{ projectId, elementId?, assetId?, include?, atSeconds?, crop? }` — Read stored transcript, audio analysis, six-frame color analysis and visual description for one project element or asset.
- `analyze_asset` `{ projectId, elementId?, assetId?, path?, analysis, force?, action?, maxCostUsd?, inspection?, technicalOnly? }` — Start transcription (word timestamps), audio measurements, color analysis, shot detection, visual description, or a persistent background video diagnosis (15...
- `inspect_visual` `{ projectId, assetId?, imageUrl?, question, atSeconds?, rangeSeconds?, frames? }` — Ask a cheap vision model (GPT-5.6 Luna, usually a fraction of one credit) ONE precise question about specific frames: exact source times or a short range of ...
- `project_budget` `{ projectId, action, limitUsd? }` — Read or explicitly set the shared lifetime project spending limit in USD before paid work.
- `project_preservation` `{ projectId, action, expectedRevision?, expectedVersion?, label?, ruleId?, target? }` — Read, protect or explicitly release approved project material.
- `editorial_plan` `{ projectId, action, expectedVersion?, expectedRevision?, idempotencyKey?, direction?, rationale?, expectedResult?, diagnosis?, estimatedCostUsd?, evidenceIds?, pendingReview?, calls? }` — Read, propose, accept or discard a shared editorial direction.
- `compile_edit` `{ projectId, expectedRevision, calls }` — Prepare, without committing, a revision-pinned transaction from any deterministic Attelier editor tool call, including shot-aware apply_transition, punch_in ...
- `simulate_transaction` `{ projectId, transaction }` — Validate and preview any structured project transaction without committing it, including raw addAsset and replaceElement operations.
- `commit_transaction` `{ projectId, transaction?, transactionRef? }` — Commit a validated Editor API transaction to the authoritative operation log.
- `checkpoint_project` `{ projectId, action, expectedRevision?, name?, note?, targetRevision?, acknowledgeCreatesNewRevision? }` — List, create, or non-destructively restore project checkpoints through one action-based tool.
- `render_frame` `{ projectId, atSeconds, width? }` — Render ONE frame of the project's active sequence at a timeline second through the real export pipeline (the same FFmpeg filter graph the delivery render use...
- `render_range` `{ projectId, startSeconds, endSeconds, height? }` — Render a fast H.264 preview of one stretch of the timeline (at most 30 seconds) through the real export filter graph, with audio but without the delivery mas...
- `review_project` `{ renderJobId?, retryFailed?, projectId, level, rangeSeconds?, atSeconds?, everySeconds?, checks?, profile? }` — Delivery level reviews the exact completed renderJobId with image, audio and the shared brief; cached evidence is reusable and failures require explicit retry.
- `generate_coverage` `{ projectId, fromElementId, atSeconds, prompt, durationSeconds, motion?, keepAudio?, characterReferences?, quoteOnly? }` — Create missing documentary coverage from the exact composed timeline frame at atSeconds.
- `localize_project` `{ projectId, expectedRevision, targetLanguage, sourceLanguage?, scope?, voice?, cast?, dryRun? }` — Localize an editable project through a quoted paid job.
- `quote_job` `{ kind, projectId?, capability?, workflow?, input?, deliveryPromise?, format?, quality? }` — Quote a render, generation capability, or durable workflow without starting or spending.
- `start_job` `{ kind, quoteId, idempotencyKey, place? }` — Start an approved render, capability, or workflow quote idempotently; this is the spend point.
- `get_job` `{ kind, jobId, downloadTo? }` — Poll an analysis, render, capability, workflow, or composite project-preparation job through one tool; completed render results include JSON first plus an MC...
- `list_voices` `{}` — List the preset narration voices: id (pass as voiceId to a voice model), name, style, accent and provider.
- `fetch_image` `{ url, projectId, name?, attach? }` — Download one public image (PNG, JPEG, WebP or GIF, at most 20 MB) from an http(s) URL into the Library, e.g.

## Connect

Use Studio's agent-access control to create a short-lived least-privilege command/config. It supplies the endpoint, workspace/project context and token locally. On reconnect, call `list_projects`; never depend on a copied project id. If the requested project does not exist, use `create_project` and retain its returned revision.

## Deterministic edit loop

Choose the editing method from the requested result and the current project, preserving the creator's approved choices.
- For a new edit or substantial creative work, load get_agent_skill with skillId "video-craft". Use list_agent_skills and get_agent_skill for the relevant discipline only; a small correction does not need the whole library.
- For designed motion, typography and animated comparisons, load "motion-design". Discover existing formats with motion_formats {summaryOnly:true} and read just a fitting format. When none fits, use motion_source and motion_render_source for a custom Remotion component with versioned project media. Keep the brief intact.
- For an existing editable timeline or ordinary cuts, use inspect_project, compile_edit, simulation and commit_transaction against the inspected revision. Use FFmpeg for media preparation, encoding and suitable simple edits. Keep sources/specs for rendered compositions; importing an MP4 does not create editable layers.
- For whole-video upscale or compression, first call list_models and get_model. If a Vidaio model is available, keep the source unchanged and save a project version when working in a project, upload it through upload_inference, then compose videoUploadUrl as the internal /v1/uploads/<id>/content path from the returned id, quote the exact operation, and start only with spend authority. Vidaio upscale standard/premium uses upscaleFactor 2 or 4; for compression, Low favors smaller files, Medium balances size and quality, and High preserves more quality. Poll with get_inference, download the completed video, then import it as a separate Library asset/version; never overwrite or claim it recovered missing source detail. An existing Library asset uses its own store: prefer its discovered video_upscale/video_compress capability route; otherwise download it locally and use this inference-upload flow. Availability and prices come only from the live model/quote response.
- Read the material and relevant style_guide when available. Check representative stills and a short motion/audio preview before an expensive final render. Technical QC does not prove creative quality; inspect the actual result and report unreviewed dimensions honestly.
- On a correction, reuse the current source and change only the requested scope. Check preservation separately from whether the requested change happened. Quotes, spending authority, revision checks and tool availability remain binding.

1. Call `discover_atelier`, `list_projects`, then `inspect_project`. Use `rangeSeconds` plus `include` for focused evidence.
2. Create a checkpoint with `checkpoint_project { action: "create", expectedRevision, name }` before risky edits.
3. Call `compile_edit` with camelCase arguments and seconds. Every state-dependent preparation requires `expectedRevision` and returns `{ baseRevision, prepared, transaction, transactionRef, transactionExpiresAt, simulation, next: "commit_transaction" }`. `add_air { atCutSeconds, seconds, mode? }` creates measured breathing room. `apply_transition`, `punch_in`, and `add_graphic` accept `snap: "shot"`; inspect `prepared` for the applied shot boundaries, duration, handle extensions, and clamps.
4. Inspect the returned simulation, then make the only mutation with `commit_transaction { projectId, transactionRef }` within ten minutes, or pass the complete `transaction` object. If you author a raw transaction such as `addAsset` or `replaceElement`, preview that complete transaction with `simulate_transaction` first.
5. Re-inspect, use `render_frame` or `render_range`, and call `review_project` with `cut`, `rhythm`, `frames`, or `gates`. Rhythm is deterministic; frame `checks: ["eyeline", "jump"]` spend one bounded Luna call per cut and accept `rangeSeconds`.

`compile_edit` reaches deterministic editor primitives, lower thirds, timeline recipes, transcript edits and the existing proposal tools. This includes `add_air`, `hold_last_frame`, `punch_in`, `add_graphic`, `remove_graphic`, `freeze_frame { atTimelineSeconds }`, optional-easing `set_keyframe`, and speech-aware `apply_transition { fit, maxHandleSeconds }`. Adjacent `apply_transition` calls and multiple `trim_to_speech` calls may be batched; each is recomputed after the preceding prepared change. Its nested `arguments` are camelCase; unknown keys return public valid keys and an example. Frame rate accepts a numeric fps or `{ numerator, denominator }`.

## Shared creative context

Read `inspect_project.plan` for the current brief and `editorialVersion` for optimistic editorial updates. Store explicit user decisions in `brief.decisions`; quote new accepted instructions verbatim from the user, preserving accepted assets and marking superseded choices rejected. Send `expectedPlanVersion` and `expectedRevision` with `set_brief`; on 409 re-read and reconcile. Identical updates keep their version. Timeline values remain authoritative for applied sizes, positions and times. Earlier editorial directions remain history, never current instructions.

For a clear correction, change only the requested target and inspect the resulting pixels. Centering requires rendered glyph bounds as well as position; preserve approved fonts, size, timing and audio. When a material creative choice is missing, integrate one representative frame or short sound preview into the current proposal. Explicit instructions override generic craft; ads do not require narration or a fixed minimum title size. Record reference timestamps, observed traits and unknowns; no visible captions means no supported caption-style match.

Review the exact render revision. Keep black/silence detector evidence and relate it to intentional timeline intervals. Transcription, measurements and listening are separate evidence; a low-confidence word over music is not proof of narration. Reuse valid analyses and approved assets. Existing scoped spend authority persists across operations.

## Evidence and analysis

Use `search_media` with `scope: "project" | "workspace" | "all"`. Use `get_asset_evidence` with exactly one of `elementId` or `assetId`; asset ids may be either the `library:<id>` form from `inspect_project` or the bare id. For a new local batch, prefer `prepare_project` to import, optionally place, store a Markdown brief, and queue `transcription`, `description`, `color`, or `shots` analyses in one call. Poll its handle with `get_job { kind: "prepare" }`. `analyze_asset { analysis: "shots" }` is the focused path for persisted shot boundaries used by shot-snapped edits.

`import_media` accepts video, audio, image and font files, including `.ttf`, `.otf` and `.woff2`. Batch multiple `prepare_workspace_asset_import` calls in one `compile_edit` request. Imported fonts become `mediaType: "font"` project assets for `style.fontAssetId`; they are not timeline clips.

`render_frame` returns JSON first and then an embedded `image/png` block at the requested width (default 960, maximum 1920). Range previews, frame-review evidence, proxies/posters and completed render outputs return MCP `resource_link` blocks instead of hiding media only inside JSON. Rhythm suggestions contain ready-to-run public `compile_edit.calls` arrays, including `add_air` when a cut needs breathing room; inspect them before compiling and committing.

## Jobs and spend

Use `quote_job`, show the quote and approval state, then call `start_job` only with authority to spend. Poll every render, capability, workflow or preparation through `get_job`. `generate_coverage` returns top-level `jobId`, `jobKind: "capability"`, and `quote`; a completed capability poll includes `assetId`, which is placed only through `compile_edit` → `place_asset`, followed by its `transactionRef` or complete compiled transaction in `commit_transaction`. Up to three `characterReferences` select exact project frames and require a multi-reference provider. A completed render's `outputUrl` accepts the same owning MCP token. `review_project { level: "frames" }`, `analyze_asset { analysis: "description" }`, and `prepare_project` with description analysis also spend; their other modes do not.

For an available Vidaio whole-video operation, keep the source unchanged and save a project version when working in a project. Call `upload_inference`, compose `videoUploadUrl: "/v1/uploads/<id>/content"` from its returned `id`, then start the saved quote exactly once with `start_inference`. The canonical ids are `vidaio/upscale/standard|premium` with `upscaleFactor: 2|4`, and `vidaio/compress/standard|premium` with `compressionLevel: "Low"|"Medium"|"High"` (Low favors smaller files, Medium balances size and quality, High preserves more quality). Poll/download the result and import it as a distinct Library asset; retain the source. For an existing Library asset, discover and prefer the matching `video_upscale`/`video_compress` capability with its authoritative `source.url`, descriptor `providerId`, and `routingTier: "manual"`; never use that URL as an inference upload. The live model and quote decide availability and price. No standalone Vidaio denoise/restoration or documented cancellation endpoint exists.

Validation errors are actionable objects: `{ code, message, field, validValues | example }`. Correct the named field; do not guess a second schema.
