# Editing with Atte

An operator guide for driving an Attelier project as an editor — from an external
agent over the Attelier MCP, from the terminal, or from Studio. It covers the
working loop, the editing skills, the delivery-profile switch and what the system
still cannot do.

## The loop

Every edit iteration is the same five moves. Skipping one is how a cut ends up
with mid-word edits, invented typography and an export blocked by a gate that
does not apply to it.

```
inspect_project  →  review_project  →  render_frame  →  edit  →  checkpoint_project  →  start_job
```

1. **Inspect.** `inspect_project` for structure, source ranges and the sequence
   frame rate. Per clip: `get_transcript`, `get_asset_description` (free, may be
   null) before `describe_asset` (pays once, stores the reading), and
   `get_audio_analysis` for loudness and peaks. A precise question about
   specific frames that the stored reading does not answer goes to
   `inspect_visual` (one cached Luna call on at most six stills of 720 px).
2. **Review.** `review_project { level: "cut" }` for cut defects and
   `review_project { level: "rhythm" }` for per-shot duration, words/s, pauses,
   question/reaction flags and up to three compile-ready suggestions. Use
   `level: "frames", checks: ["eyeline", "jump"]` only for perceptual
   continuity: it renders the last/first frame at each cut, spends one Luna call
   per cut and returns warnings with both frame URLs. Bound long pieces with
   `rangeSeconds`; one request accepts at most 12 cuts.
3. **Prove one frame.** `render_frame` is the arbiter of what the export looks
   like. The editor preview is not; a text box that fits in preview can clip in
   the master. `render_range` does the same for a short interval with sound.
4. **Edit.** `compile_edit` is the general instrument: it takes any list of
   deterministic editor tool calls (`add_title`, `apply_transition`, `place_asset`,
   `insert_source_range`, `trim_clip`, `ripple_trim_clip`, `split_clip`,
   `move_clip`, `delete_clip`, `set_audio_levels`, `set_property`, `set_speed`,
   `animate_motion`, `set_sequence_frame_rate`, …), compiles them with the same
   compiler the in-process agent uses, simulates, and returns a revision-pinned
   transaction to `commit_transaction`. Text properties, per-clip gain and
   split-edit metadata no longer need hand-authored operations. `plan_edit` still
   turns an instruction into a typed edit, and `prepare_project_asset_placement`
   still places with explicit `sourceStartSeconds` / `sourceDurationSeconds`. Raw
   `simulate_transaction` / `commit_transaction` remains for anything the catalog
   genuinely does not cover. Always read the simulation before committing.

   Capability tools are refused by `compile_edit` on purpose: generation spends
   money and is dispatched through `quote_capability` / `start_capability_job`.
5. **Checkpoint.** `create_project_version { name: "..." }` with a name that says
   what changed, before levelling, before styling and before every export attempt.
6. **Evaluate and render.** `evaluate_project` under the right profile, then
   `quote_render` and `start_render_job`.

Set the sequence timebase from the sources **before** placing anything:
`set_sequence_frame_rate`. A 29.97 fps sequence over 24 fps sources judders in
the master, and re-setting it later re-quantizes every edit already made.

## The skills

Load these from the kit (`loadSkill(id)`), or read `skills/<id>/SKILL.md`.

| Skill | Kind | Use it for |
|---|---|---|
| `project-brief` | discipline | Capturing references, fonts, palette, tone and the profile **before** styling. Ask for a reference; never invent one. |
| `assemble-from-clips` | use-case | Folder or Library of raw clips → reviewable first cut. |
| `fix-cut-boundaries` | discipline | Moving in/out points to word boundaries with 120 ms handles; J and L cuts. |
| `dialogue-levelling` | discipline | Per-clip gain to a −18 LUFS bed, 80 ms cut fades, −14 LUFS web master. |
| `lower-thirds` | discipline | Documentary identification titles as exact property sets, verified with `render_frame`. |
| `review-cut` | discipline | The pre-render checklist and how to report findings honestly with timecodes. |

They compose in that order for a documentary: brief → assemble → boundaries →
levels → lower thirds → review.

Five of them have a tool that performs the recipe directly, each returning a
prepared transaction the same way `compile_edit` does:

| Skill | Tool |
|---|---|
| `fix-cut-boundaries` | `trim_to_speech { elementId, handleSeconds? }`, `snap_cut_to_words { atSeconds, handleSeconds? }` |
| `dialogue-levelling` | `level_dialogue { targetLufs?, fadeSeconds? }` |
| `lower-thirds` | `add_lower_third { name, role?, atSeconds, durationSeconds?, preset }` |
| `project-brief` | `set_project_profile { profile }` |
| `edit-cutting` | `reorder_clips { trackId, elementIds, gapSeconds? }`, `clear_timeline { trackId? }` |

They are conveniences, not replacements for reading the skill: `add_lower_third`
still hands you box dimensions in pixels that nothing measured, so the
`render_frame` verification step in `skills/lower-thirds/SKILL.md` still applies.

## The delivery-profile switch

The deterministic gates that block an export are chosen by the project's quality
profile. `product-ad-v1` enforces ad-claim proof (`narration_visual_gap`: every
headline/proof/CTA layer must be bound to a visual evidence shot) and the social
safe area. Neither of those means anything for a 16:9 documentary, where a lower
third is identification rather than a claim and the bottom third is legal space.

`documentary-v1` (`attelier_sdk` `contracts/capability-schema/src/project-quality.ts`) therefore:

- runs **no** ad-claim proof gates and requires no CTA layer;
- uses a **5% safe area on every edge**, so lower thirds may sit in the bottom
  third instead of being pushed above a social interaction band;
- downgrades "still has no authored motion" to `info` — a documentary holds
  frames on purpose;
- reports a **dialogue level jump** above 3 dB between neighbouring clips, read
  from `audio.measuredLufs + audio.gainDb`;
- reports a **mid-word cut** on any element marked
  `edit.boundary.in.midWord` / `edit.boundary.out.midWord`.

`DOCUMENTARY_RUBRIC` (`documentary-rubric.v1`) is the matching human rubric:
story order, cut craft, dialogue consistency, visual continuity, titles,
timebase integrity, sound bed, publish readiness.

### Rhythm evidence boundaries

`review_project { level: "rhythm" }` reports only defects supported by an
editable timeline decision. A measured shot change inside one source clip is
useful density evidence, but it is not an authored cut: it cannot prove a
missing reaction and does not form an equal-shot run that Atte can repair.
Speaker ids are transcript-local, so they are compared only across adjacent
placements of the same source asset. `shot_too_long_for_density` requires at
least 12 seconds as well as low relative speech density; shorter sparse beats
may be intentional reactions, establishing shots or air. Rhythm flags remain
review evidence, never an automatic instruction to change an approved cut.

For `documentary-v1`, scene-to-scene color measurements stay visible as
informational colorist notes but cost no integrity points. Missing master
loudness and genuinely unauthored timeline overlaps still cost points. Product
proof binding remains exclusive to `product-ad-v1`.

### Setting the profile on a project

One tool does both halves:

```
set_project_profile { projectId, profile: "documentary-v1", expectedCurrentRevision }
```

It writes the first-class `profile` field on the plan and prepares a transaction
that sets `delivery.qualityProfile` on every element, so a headless evaluation
and the editor agree without a plan round-trip. The two halves are still
available separately — `update_project_plan { patch: { profile } }` for the
declaration, a raw `setProperty { path: "delivery.qualityProfile" }` for the
timeline — and `profile` is now validated against `QUALITY_PROFILE_IDS`, so an
unknown id is a rejected patch rather than a stored string.

`resolveDeliveryProfile` in `apps/web-editor/src/components/studio/delivery-prep.ts`
reads, in order: an explicit plan/brief profile, the `delivery.qualityProfile`
property, an approved product-ad brief, then inference from the canvas — a
landscape sequence with no product-ad brief resolves to `documentary-v1`, a
portrait one to `social-video-v1`. `selectBlockingExportGates` then drops
`narration_visual_gap`, `title_outside_safe_area`, `vertical_canvas_not_filled`,
`portrait_proof_unreadable` and `primary_visual_reused` for a documentary.
Rights gates (`asset_not_publishable`) never relax, under any profile.

## Known limitations

- **No tracking in text.** `drawtext` has none. Letter-space with U+2009 THIN
  SPACE between letters and U+2003 EM SPACE between words.
- **Text boxes are not measured.** `style.boxWidth` / `style.boxHeight` are
  pixels you supply. Compute a starting value, then correct it from
  `render_frame`. There is no "fit box to text".
- **`transform.position` `y` anchors the text line**, and the box is drawn
  `style.boxPadding` outside it. Two boxed lines produce two boxes; put one
  box on one element sized to cover both.
- **Preview is not export.** Proxy previews hide softness, banding and layout
  drift. Only `render_frame` / `render_range` are evidence.
- **The web app does not yet pass the plan's `profile` into
  `resolveDeliveryProfile`.** The field exists on the plan and the resolver
  already prefers it, but no caller supplies it, so in the editor the
  `delivery.qualityProfile` property that `set_project_profile` also writes is
  what actually takes effect.
- **Mid-word cuts are reported, not detected.** The deterministic evaluation
  reads `edit.boundary.*.midWord` markers written by the transcript-driven trim;
  it does not re-derive word alignment itself. Set the markers honestly.
- **Frame-rate changes are destructive to timing.** Set the timebase first.
