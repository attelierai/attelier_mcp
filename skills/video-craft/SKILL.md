---
name: video-craft
description: Apply Attelier's provider-independent audiovisual craft rules when planning, editing, generating, reviewing or delivering video. Use for any task that makes creative or quality decisions across composition, continuity, pacing, motion, typography, captions, audio, color, transitions, branding, formats or delivery.
---

# Video craft

## Choose the working method

Start from the brief, the material and the current source. The tool choice should make a good edit easier to achieve, without dictating the story or changing approved decisions.

- **Designed motion, animated typography, comparisons:** load `motion-design`. When the local motion toolkit is listed, prefer its tested Remotion formats if one fits the brief. Discover summaries first, then the chosen guide/spec. Keep that spec as the editable source.
- **Existing Studio timeline, trims, sequencing, clip placement:** use the native transaction workflow below; load `assemble-from-clips` or `edit-cutting` when needed. Preserve native layers and source ranges.
- **Technical preparation or a simple file operation:** use the available FFmpeg tools for probing, trimming, resampling, muxing and compression. Do not rebuild animated typography as a pile of raster frames when a supported Remotion format fits.
- **No fitting format:** keep the brief intact. When `motion_source` and `motion_render_source` are listed, load `motion-design` and author a custom Remotion composition with the pinned runtime. These tools share versioned source and media with the project. Otherwise use supported native operations or report the material capability gap.

Only load the disciplines needed for this task through `get_agent_skill`; `list_agent_skills` discovers their ids. For example:

```json
{"tool":"get_agent_skill","arguments":{"skillId":"motion-design"}}
```

## Inspect, preview, finish

Read the current brief/approved decisions and relevant `style_guide` when available. Inspect clips and source ranges before choosing their order. What clips show comes from evidence, never from guesses: use the stored descriptions first (`get_asset_evidence` with `include: ["description"]`, free); for a clip without one, run `analyze_asset` with `analysis: "description"` once, which reads the whole clip and stores the reading for later turns; use `inspect_visual` only for one precise question about specific frames that the stored reading does not answer (a small paid Luna call, cached). `find_moments` measures motion energy, not narrative importance; verify its suggestions with `contact_sheet`. Inspect sound as well as loudness; `analyze_music` offers beat/drop estimates to audition, not proof of musical fit. Reuse valid evidence.

Render representative stills for layout first, then a short motion/audio preview for rhythm, transitions and readability. For local formats use `motion_render` with `stillAtSeconds`, then `preview:true`; use the normal final render only after addressing observed defects. Stills cannot establish timing or audio quality.

Check the exact final output, not only its preview. Use `review_video` for technical issues and `contact_sheet` for targeted visual inspection when those tools exist. Evaluate whether the result meets the brief separately; black/flashes/clipping checks do not prove taste, narrative or a good mix. Report checks not performed.

For a correction, reopen the existing timeline/spec/source, change only the requested target and reuse approved footage, music, timing and styling. Verify both the requested change and preservation of the rest; do not reroute a narrow correction into a new template or rebuild.

Keep the spec/source and its media references with rendered compositions. A rendered MP4 imported into Assets is not a native editable timeline. Use native operations when the creator needs to adjust layers in Studio; report editability accurately.

## Native timeline workflow

1. Call `discover_atelier` for current capabilities and public entrypoints, then `inspect_project` for the pinned project state.

```json
{"tool":"discover_atelier","arguments":{}}
```

```json
{"tool":"inspect_project","arguments":{"projectId":"project-id","include":["transcripts","audio"]}}
```

2. Call `compile_edit` for deterministic work. Read `baseRevision`, `transaction`, `simulation` and `next`; recover revision conflicts by re-inspecting, never by forcing.

```json
{"tool":"compile_edit","arguments":{"projectId":"project-id","expectedRevision":10,"calls":[{"tool":"trim_clip","arguments":{"elementId":"clip-id","durationSeconds":4}}]}}
```

3. Call `commit_transaction` only at the approved commit point.

```json
{"tool":"commit_transaction","arguments":{"projectId":"project-id","transaction":{"id":"transaction-from-compile_edit"}}}
```

4. Call `render_frame`, `render_range` and `review_project` in proportion to the affected visual, motion, audio and delivery risks.

```json
{"tool":"render_frame","arguments":{"projectId":"project-id","atSeconds":3,"width":960}}
```

```json
{"tool":"review_project","arguments":{"projectId":"project-id","level":"gates","profile":"general-video-v1"}}
```

5. Call `quote_job` before generation, workflow or render work. `start_job` is the spend point; poll the returned resource with `get_job`.

```json
{"tool":"quote_job","arguments":{"kind":"render","projectId":"project-id","format":"mp4","quality":"standard"}}
```

```json
{"tool":"start_job","arguments":{"kind":"render","quoteId":"approved-quote-id","idempotencyKey":"render-project-v10"}}
```

```json
{"tool":"get_job","arguments":{"kind":"render","jobId":"render-job-id"}}
```

## Craft rules

Use current provider-independent contracts; prefer reversible deterministic edits, quote before spend, and report technical checks, perceptual proxies and human judgment separately.
