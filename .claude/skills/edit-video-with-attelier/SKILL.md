---
name: edit-video-with-attelier
description: Edit a video project in Attelier end to end from Claude Code using only the public `atelier` MCP surface (23 tools), starting from a stored brief and measured story coverage. Use when the user asks to cut, extend, fix, localize or export a project, or to bring new clips into it.
---

# Edit a video with Attelier

You are the editor of an Attelier project. You work ONLY through the `atelier` MCP server
(`discover_atelier`, `list_projects`, `create_project`, `set_brief`, `get_brief`, `import_media`, `prepare_project`, `inspect_project`, `search_media`, `get_asset_evidence`,
`analyze_asset`, `compile_edit`, `simulate_transaction`, `commit_transaction`, `checkpoint_project`, `render_frame`,
`render_range`, `review_project`, `generate_coverage`, `localize_project`, `quote_job`, `start_job`, `get_job`). You do not edit harness code. If a tool fails or something is missing,
write the exact call and error to `notes/<project>-session-findings.md` and continue another way.

## Arguments

`$ARGUMENTS` = `<project name> [--brief <path>] [--clips <path>...] [--quality draft|standard|master] [--out <path>]`

- `--brief`: script, clip audit and references. Read it entirely before touching anything. If absent, ask for one before styling anything (titles, lower thirds, colour).
- `--clips`: local files to import (HEVC 10-bit from Higgsfield is fine; the server makes proxies).
- `--quality`: export tier, default `standard` (`master` is HEVC 10-bit for archive/YouTube; `draft` for review).
- `--out`: where to download the export; default `deliverables/<project>/<project>-cut-<next version>.mp4`.

## Setup check

1. `/mcp` must list `atelier` with 23 tools. If it does not: `.mcp.json` launches
   `node mcp/bin/attelier-mcp.js` and needs `ATTELIER_API_TOKEN` exported before Claude Code
   started (`export ATTELIER_API_TOKEN=$(grep '^ATTELIER_API_TOKEN=' .env | cut -d= -f2-)`). Never print
   the token, never write it to a file or the conversation.
2. `discover_atelier` once, then `list_projects`. If the named project does not exist, create it with `create_project {name, frameRate?, width?, height?}`; then run the first `inspect_project`.
   Note `revision`, frame rate, profile, duration and the elements with their `timelineRange` in seconds.
3. Start the editorial session with `set_brief` pinned to that revision (`fromPath` for `--brief`), then
   verify the canonical object with `get_brief`.
4. Call `inspect_project` with `include:["coverage"]` before planning any edit. Record every
   script line's matching source timecodes, `placedOnTimeline`, and `notShot` gaps.
5. `checkpoint_project` `{action:"create", name:"before <today> session"}`.

## Procedure

### 1. Bring in and understand material
- The project brief and coverage are the story authority. Re-run coverage after transcripts finish and
  after each story-order edit; do not substitute a guessed clip for a `notShot` line.
- Prefer one `prepare_project {projectId, paths, briefPath?, analyses?, place?}` call for a new batch. It imports the files into Library and Project Media, optionally places them, stores the brief, and queues the requested analyses. Poll its returned `jobId` with `get_job {kind:"prepare"}`. Use the lower-level steps below only when a partial or custom import is needed.
- Import local video, image, audio and font files with `import_media` (`.ttf`, `.otf` and `.woff2`
  are font assets). Then use one `compile_edit` request containing one
  `prepare_workspace_asset_import` call per returned `workspaceAssetId`; the calls are batched into
  one simulated transaction. Fonts enter Project Media as `mediaType:"font"` and are referenced by
  text styles through `style.fontAssetId`; they are not placed on a timeline.

```json
{"tool":"import_media","arguments":{"projectId":"project-id","paths":["~/Descargas/clip.mp4"],"rights":"user_owned"}}
```

- CLI fallback only: `atte import <file>... --project <projectId> --token "$ATTELIER_API_TOKEN"`.
- For every new video asset not already covered by `prepare_project`: `analyze_asset` with `transcription`, `description`, and `shots`; poll `get_job`
  (kind `analysis`); then `get_asset_evidence` with `include:["transcript","description","audio"]`. Shot-change analysis is persisted for the compiler even though it is not returned by `get_asset_evidence`.
- Summarise each clip: which script lines it covers (word timecodes), internal shots (use
  `render_frame` every 1–2 s when the description is not enough), usable in/out points, defects.
- Repeated lines across clips: pick the best take and write the reason.

### 2. Plan
- Map clips to the stored script order from coverage. Write the plan as a table (script index, clip,
  source in/out, timeline in/out, placed/not shot) before editing. Ask only if a narrative choice is genuinely ambiguous.

### 3. Edit
- Every mutation goes through `compile_edit` `{projectId, expectedRevision, calls:[...]}` then
  `commit_transaction` with the complete returned transaction object, never only its id. camelCase arguments, seconds everywhere.
  Unknown keys return the list of valid keys: read it and retry once.
- `compile_edit` already returns its simulation. For a raw transaction (for example `addAsset` or
  `replaceElement`), call `simulate_transaction` with the complete transaction and inspect the
  returned project before passing that same transaction to `commit_transaction`.
- For `apply_transition`, prefer `fit:"speech"` (it is automatic when stored transcripts exist),
  set `maxHandleSeconds` when extension must be bounded, use `snap:"shot"` after shot analysis, and inspect top-level `prepared` for the
  applied duration, handle extensions and `clampedBy` reasons before committing.
- Use `add_air {atCutSeconds, seconds, mode?}` for a measured pause at a cut; rhythm review suggestions may emit it directly.
- `hold_last_frame`, `punch_in`, `add_graphic`, `remove_graphic`, `freeze_frame` with
  `atTimelineSeconds`, and `set_keyframe` with optional `easing` all compile through this same path.
  `punch_in` and `add_graphic` also accept `snap:"shot"` to keep their authored window inside one measured source shot.
- Cuts land on word boundaries from the transcript; audio fades 0.08 s at every cut; level
  dialogue so clips sit within ±1 dB of each other; keep the sequence frame rate equal to the sources.
- Lower thirds: preset `documentary-box`, same style as the existing ones, placed on a shot where the
  person is clearly visible and never across an internal shot change; fade 0.2 s for slots under 3 s.
- Ending: when the last clip carries a visual payoff after the last line (establishing/wide, building, reaction of the group), keep it to the clip's end and hold; never end on a mid-reaction close-up when a wide follows within the clip. Use shot markers to find the last shot.
- One `checkpoint_project` per block of related changes, named after the block.

### 4. Verify (mandatory, after every block)
- `render_frame` at each new cut point and inside each new lower third; look at the image.
- `review_project` `{level:"cut"}`: zero errors and warnings before moving on; `{level:"gates"}`
  before export. Run `{level:"story"}` first and resolve missing/out-of-order beats. Use `{level:"frames"}`
  only when a visual judgement is needed (it spends).
- `render_range` around a doubtful cut to hear it.

### 5. Export
- `quote_job` `{kind:"render", projectId, format:"mp4", quality}` → `start_job` → `get_job` until
  `complete`; download `outputUrl` with the bearer token to `--out`. Probe it (duration, codec).

### 6. Report
Finish with **Goal / Done / Left / Human Feedback Needed**, then:
- final timeline table (clip, timeline in/out, script line);
- total spend in USD from the job quotes;
- MCP friction list: tool, arguments, error, what you expected. This list matters as much as the video.

## Rules
- Nothing is "done" until you looked at it (frame) and `review_project` agrees.
- `generate_coverage` returns top-level `jobId`, `jobKind:"capability"`, and `quote`; poll that id with `get_job`, then place its returned project `assetId` with `compile_edit` → `place_asset` and commit the complete transaction.
- `localize_project` (default `voice:"cast"`, or explicit `clone`/`stock`) returns top-level `jobId`, `jobKind:"capability"`, and `quote`; poll it with `get_job`. Completion checkpoints and commits the localized stem, its transcript, the speaker-to-voice map, and translated text itself, so do not place the returned audio a second time.
- Pin every preparation to the current revision; re-inspect after any failure.
- Asset arguments accept both the `library:<id>` form returned by `inspect_project` and the bare id.
- Do not restyle existing graphics without a reference; do not touch colour without being asked.
- Keep all files under the project root (`deliverables/`, `notes/`); no loose renders or PNGs.
