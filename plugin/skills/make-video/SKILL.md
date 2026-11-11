---
name: make-video
description: Make or edit a finished video with Attelier (generate clips and music, edit with a motion format, review, deliver to the Attelier Library), applying Attelier's taste and learning the person's. Use when the person asks for a video, an edit, a comparison of models, a social post or a change to a video made this way.
---

# Make a video with Attelier

You work through the `attelier` MCP tools (`mcp__attelier__*`) and your own file
and shell tools. The tools do the plumbing; you make the creative decisions.

## 1. Taste first

Call `style_guide` before planning (again with `format` once you have chosen
one) and follow it. The person's own lessons come first and win any conflict;
**Rule** lessons hold unless the person asks otherwise. Read it once more
before you deliver.

Then load the craft you will need with `get_agent_skill`: `model-selection`
(which model for each shot, and its quote) and `prompting` (how to write each
generation prompt, and the brief for a designed motion video).

## 1b. Start from a template's reference when one fits

When the request matches an Attelier template (product ad, explainer, model
shootout, subnet launch…) or the person points at a reference video, use its
reference: reproduce its structure, pacing and style patterns, adapt the content
to the person's facts, and avoid what the reference analysis says not to copy.
Never copy third-party footage, music or copy. A YouTube or public video link can
be analysed with `analyze_reference_url` inside the person's project.

## 2. Agree the plan before spending

When the video needs new material, reply with a short plan and wait for a
go-ahead: the idea and structure, the generation prompt(s), which models and
why, the music brief, the format, and the cost from `quote_inference` in
credits (1 credit = $0.01). Paid generation always needs the person's explicit
yes. Edits of existing media can start straight away.

Work in an Attelier project from the start (`list_projects`, or `create_project`
with a clear name), so every import, edit and version keeps its history and the
person can open it in Studio.

## 3. Generate

`list_models` → `quote_inference` → `start_inference` (a fresh
`idempotencyKey` per job: letters, digits, dashes) for each clip and the
music → poll `get_inference` → `download_inference` with `downloadTo` into a
`generated/` folder, one clear file name per model (`seedance-2.5.mp4`).
Wait in the foreground (`sleep 30` between polls) until every job has
finished. Report each model's real generation time and cost from the job
results.

For an available Vidaio whole-video upscale or compression job, first preserve
the source in a project version. Use `upload_inference` on the original video,
then compose `videoUploadUrl` as `/v1/uploads/<id>/content` from its returned
`{id,mimeType,bytes,sha256}` receipt and pass that internal path to a quote:
`vidaio/upscale/standard|premium` with `upscaleFactor: 2|4`, or
`vidaio/compress/standard|premium` with `compressionLevel: "Low" | "Medium" | "High"`.
Only select ids returned by `list_models`/`get_model`; their quote is the sole
source for availability and cost. Download to a new path and `import_media` it
as a separate Library asset. `upscale_clip` is for image clips, and Vidaio does
not offer standalone denoise/restoration or a documented cancellation endpoint.
For an existing Library video, discover a `video_upscale`/`video_compress`
capability first and quote that capability with its authoritative `source.url`,
the discovered `providerId`, and `routingTier: "manual"`; otherwise download it
locally before the inference-upload flow. A Library URL is not an inference
upload URL.

## 4. Edit with a format

Never write video code when a format fits.

1. `motion_formats`: pick a format, read its guide and example spec.
2. Inspect the material: `probe_media` (specs), `find_moments` (the best
   window of each clip), `contact_sheet` (look at the clips),
   `analyze_music` (tempo, drops, the music offset), `list_inference_requests`
   when a clip's model, time or cost is unknown.
3. Write the spec as a JSON file. Render key moments with `motion_render`
   `stillAtSeconds` and look at them; fix; then render the final MP4.

## 5. Review, then deliver

Run `review_video` on the final render and fix every issue it lists (flashes
at transitions, black spans, clipping). Then look at it with `contact_sheet`
(every transition, the titles, the end card) and check it against the style
guide: music out before any voice, every shot long enough to judge. Fix what fails
and render again. Then deliver it as a project version, not a loose file:

1. `import_media` with the project id and the render path (and the source
   clips you generated), so it lands in the project and the Library.
2. `checkpoint_project` with `action: "create"` and a short name ("First cut",
   "Shorter ending"), so the person can return to this version.
3. Show the result with the Studio link `https://app.attelier.ai/project/<projectId>`.
4. End with the real cost: add up the finished jobs (`get_inference`,
   `list_inference_requests`) and state it in credits, with each model's real
   generation time. Never estimate it.

## 6. Learn

When the person corrects how the video looks, sounds, reads or is paced,
change only what they asked, re-render, and call `record_preference` with the
lesson as one imperative sentence, their words as `evidence`, the category and
the format. Facts, bugs and one-off content choices are not taste.

State real numbers only (times, costs, specs) from tool results.
