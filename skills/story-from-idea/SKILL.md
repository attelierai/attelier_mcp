---
name: story-from-idea
description: Turn a one-line idea into a finished, editable short film in Attelier through a durable staged pipeline — script, storyboard, animation, voice, music, assembly and review. Use when the creator brings an idea or a logline and no footage.
---

# Story from idea

## Stages

This skill is the playbook behind the durable story pipeline. The server owns
the stages and their artifacts; you fill each stage with craft.

1. **script** — choose visual storytelling, dialogue or narration from the brief.
   If narration is requested, fit it at about 2.5 words per second. One idea per beat, a truthful hook in the first beat,
   and a closing line that resolves it. No stage directions inside spoken lines.
2. **storyboard** — split the script into beats. Each beat carries one shot
   description that a text-to-image model can render: subject, setting, lens,
   light, mood. Keep a consistent look sentence across every beat so the film
   does not drift.
3. **animate** — turn each approved board image into motion with
   `generate_coverage`. Ask for the smallest motion that serves the beat; large
   camera moves on a generated still read as warping.
4. **voice** — only for requested narration: one `voice_generation` quote per beat, using its script
   line, so a rewritten beat costs one line and not the whole film.
5. **music** — reuse accepted music first; quote missing authorized music, described by
   mood and instrumentation, never by an artist's name.
6. **assemble** — place beats in order with `compile_edit`, then level the bed
   according to its roles and add captions only when the brief calls for them.
7. **review** — call `review_project` and fix evidenced defects relevant to the brief before quoting a
   delivery.

## Executable workflow

1. Call `inspect_project` before spending, to read what the project already has.

```json
{"tool":"inspect_project","arguments":{"projectId":"project-id"}}
```

2. Record the agreed script as the project brief, so every stage re-runs from
the same spoken text.

```json
{"tool":"set_brief","arguments":{"projectId":"project-id","expectedRevision":0,"expectedPlanVersion":0,"brief":{"title":"Story title","script":[{"id":"beat-1","line":"The workshop opens before the town wakes."}],"characters":[]}}}
```

3. Quote each beat's generation before it runs, and start it only once the
quote fits the agreed budget.

```json
{"tool":"quote_job","arguments":{"kind":"capability","projectId":"project-id","capability":"text_to_image","input":{"prompt":"Wide dawn shot of an empty workshop, warm rim light, 35mm"}}}
```

```json
{"tool":"start_job","arguments":{"kind":"capability","quoteId":"quote-id","idempotencyKey":"story-beat-1-image"}}
```

4. Animate an approved board image from the timeline clip it became.

```json
{"tool":"generate_coverage","arguments":{"projectId":"project-id","fromElementId":"clip-id","atSeconds":0,"prompt":"Slow push in on the workshop bench","durationSeconds":4,"motion":"slow-push"}}
```

5. Assemble the beats in order and review the cut.

```json
{"tool":"compile_edit","arguments":{"projectId":"project-id","expectedRevision":3,"calls":[{"tool":"prepare_project_asset_placement","arguments":{"projectAssetId":"asset-id","trackId":"video-track-id","startSeconds":0,"durationSeconds":4}}]}}
```

```json
{"tool":"commit_transaction","arguments":{"projectId":"project-id","transaction":{"id":"transaction-from-compile_edit"}}}
```

```json
{"tool":"review_project","arguments":{"projectId":"project-id","level":"gates","profile":"social-video-v1"}}
```

## Craft rules

Re-run one stage, not the film: a changed script line only invalidates the
beats it touches. Never claim a fact about a real person or product that the
creator did not supply. Keep every stage's artifacts addressable so the
creator can approve them one at a time.
