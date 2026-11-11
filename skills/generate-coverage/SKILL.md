---
name: generate-coverage
description: Generate a continuity-matched AI coverage shot from an exact project frame when an edit lacks a reverse shot, reaction, insert, or visual beat for a script line. Use only after supplied and Library media cannot cover the beat; the result stays editable and is not placed automatically.
---

# Generate Coverage

Use `atelier.generate.image-to-video@1` for a genuinely missing shot, not to replace usable recorded coverage. Confirm the chosen video element is visible at the timeline second and that its rights permit the derivative.

## Prompt the missing beat

Build the prompt from the scene description and the exact script line or beat:

- Name the shot purpose first: reverse shot, listener reaction, insert, or missing line coverage.
- Carry visible continuity: people, wardrobe, set, time of day, lighting, lens/framing, eyeline, and screen direction.
- Translate the script line into observable performance. For “Selling?” prefer “the listener pauses, skeptical, then looks back to the speaker” over asking the model to draw the word.
- Request one continuous shot with no cuts, text, logos, new people, or unrequested identity changes. Choose only the needed camera motion.

## Executable workflow

1. Inspect the scene around the missing beat and select the exact source video element, not its asset id.

```json
{"tool":"inspect_project","arguments":{"projectId":"project-id","rangeSeconds":[18,24],"include":["transcripts"]}}
```

2. Call `generate_coverage`. Use `quoteOnly: true` when approval is still needed; otherwise the call quotes, approves when required, reserves against the MCP token cap, and starts the job. It returns top-level `jobId`, `jobKind: "capability"`, and `quote`; it never places the result on the timeline.

```json
{"tool":"generate_coverage","arguments":{"projectId":"project-id","fromElementId":"source-video-element-id","atSeconds":20.5,"prompt":"Reverse shot in the same dim boardroom: the listener in the navy jacket hears the line 'Selling?', pauses with a skeptical expression, then looks back toward the off-screen speaker on camera left. Match the warm practical lighting, shallow depth of field, seated eyeline, wardrobe, and screen direction. One continuous shot, no text or new people.","durationSeconds":5,"motion":"slow-push","keepAudio":false}}
```

When identity continuity depends on people who are not clear in the main frame, add at most three exact project frames with `characterReferences`. Attelier routes these calls only to a multi-reference provider; a single-image-only configuration returns a teaching error naming the supported provider IDs.

```json
{"tool":"generate_coverage","arguments":{"projectId":"project-id","fromElementId":"source-video-element-id","atSeconds":20.5,"characterReferences":[{"elementId":"listener-closeup-element-id","atSeconds":12.2},{"elementId":"speaker-closeup-element-id","atSeconds":17.8}],"prompt":"Reverse shot in the same dim boardroom: the listener in the navy jacket pauses skeptically, then looks toward the off-screen speaker on camera left. Preserve both referenced identities, wardrobe, eyelines and warm practical lighting. One continuous shot, no text or new people.","durationSeconds":5,"motion":"slow-push","keepAudio":false}}
```

3. Poll top-level `jobId` with `get_job {kind:"capability"}`. Completion returns status, lifecycle status, progress, actual cost, `assetId`, provenance and any error. The project asset exists but no timeline element has been added.

```json
{"tool":"get_job","arguments":{"kind":"capability","jobId":"coverage-job-id"}}
```

4. Inspect stored evidence and the returned Library version chain before using the result. Confirm `origin: generated`, the exact `derivedFrom` frame, prompt, provider/model, and carried source rights. A missing visual description is `not checked`, not a quality pass.

```json
{"tool":"get_asset_evidence","arguments":{"projectId":"project-id","assetId":"library:coverage-asset-id","include":["description"]}}
```

5. Place the returned project `assetId` with `compile_edit` → `place_asset`, inspect its simulation, then commit the complete returned transaction. Do not add or replace timeline media outside this explicit edit gate.

```json
{"tool":"compile_edit","arguments":{"projectId":"project-id","expectedRevision":12,"calls":[{"tool":"place_asset","arguments":{"assetId":"returned-project-asset-id","atSeconds":20.5,"durationSeconds":5}}]}}
```

```json
{"tool":"commit_transaction","arguments":{"projectId":"project-id","transaction":{"id":"transaction-from-compile_edit"}}}
```

6. Render a frame from the placed new clip and review continuity against the surrounding cut. Reject identity drift, eyeline reversal, lighting/wardrobe changes, frozen motion, or invented objects; remove or replace the timeline element if it fails.

```json
{"tool":"render_frame","arguments":{"projectId":"project-id","atSeconds":22,"width":960}}
```
