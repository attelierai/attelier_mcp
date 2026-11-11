---
name: project-brief
description: Read and update explicit creative decisions in an Attelier project when capturing a brief, changing direction or preserving an approved reference, style or asset across edits and clients.
---

# Project brief

## Executable workflow

1. Call `inspect_project` to read the timeline revision, `plan.version`, existing brief and current editorial direction. The timeline owns applied sizes, positions and times; the brief owns intent. Superseded editorial plans retain their application history but are not instructions for this edit.

```json
{"tool":"inspect_project","arguments":{"projectId":"project-id"}}
```

2. Store only explicit user decisions, retaining the rest of the complete brief. For a new accepted decision, quote the user's instruction verbatim; agent-chosen implementation details belong to the timeline. Send `expectedRevision` and `expectedPlanVersion`; on 409 re-read and reconcile. An identical update keeps its version. Keep stable decision IDs with `aspect`, `instruction`, `status` (`accepted` or `rejected`) and optional `assetIds`/`elementIds`. An agent suggestion is not an accepted decision. Mark the old narrated direction rejected when the creator asks for music only; preserve the exact music asset when they say they like it. A position correction does not discard font, size or sound. For Markdown imports use `fromPath`; unknown sections remain notes.

```json
{"tool":"set_brief","arguments":{"projectId":"project-id","expectedRevision":4,"expectedPlanVersion":2,"brief":{"title":"Approved piece","script":[],"characters":[],"decisions":[{"id":"soundtrack","aspect":"audio","instruction":"Music only; keep the chosen track","status":"accepted","assetIds":["approved-music-id"]}]}}}
```

```json
{"tool":"get_brief","arguments":{"projectId":"project-id"}}
```

3. Compile the requested edit and inspect its simulation. A clear correction needs no new brief ceremony. Use `set_project_profile` only when changing the selected delivery contract.

```json
{"tool":"compile_edit","arguments":{"projectId":"project-id","expectedRevision":4,"calls":[{"tool":"set_project_profile","arguments":{"profile":"documentary-v1"}}]}}
```

4. Call `commit_transaction` with the returned transaction, then create a named brief checkpoint.

```json
{"tool":"commit_transaction","arguments":{"projectId":"project-id","transaction":{"id":"transaction-from-compile_edit"}}}
```

```json
{"tool":"checkpoint_project","arguments":{"projectId":"project-id","action":"create","expectedRevision":5,"name":"brief approved","note":"Objective, audience, channel, tone, CTA and delivery profile approved."}}
```

## Craft rules

Explicit instructions override generic playbooks. Ask only about a missing decision that materially changes the result; integrate one representative frame or short voice/music sample into the existing proposal. Inspect accessible references and save `references[].observation` with `timestampsSeconds`, `observed` and `unobserved`. If samples show no captions, their style remains unknown. Existing scoped budget approval persists; a brief write alone does not authorize new spending.
