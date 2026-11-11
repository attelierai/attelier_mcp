# Attelier Video Craft Guide

Version: `1.0.0`
Executable registry: `@attelier/capability-schema/craft-guide`
Discovery: `GET /v1/craft-guide`

This guide defines provider- and renderer-independent editorial intent. Skills cite rule IDs; effects declare which rules they implement; evaluators measure the same IDs. Numeric thresholds belong to delivery profiles in the executable registry, not to agent prompts.

## How to use the guide

1. Select the applicable delivery and use-case profile.
2. Resolve the relevant craft rule IDs.
3. Use effect contracts for implementation constraints.
4. Evaluate objective contract failures before perceptual or human preference.
5. Keep technical, perceptual, human and business evidence separate.

Severity means:

- `critical`: output cannot be published or execution must be blocked.
- `major`: material revision is required.
- `minor`: localized polish is required.
- `info`: a useful observation with no implied failure.

## Chapters and rules

| Chapter | Rule | Default severity | Primary evaluation |
|---|---|---:|---|
| Composition | `craft.composition.safe-area` | Major | Deterministic geometry |
| Continuity | `craft.continuity.visual` | Major | Perceptual consistency |
| Pacing | `craft.pacing.intentional` | Major | Human editorial review |
| Editing | `craft.editing.cuts` | Major | Human review + handle checks |
| Motion | `craft.motion.subtle` | Minor | Temporal signals |
| Typography | `craft.typography.readable` | Major | Contrast, reading and collision signals |
| Captions | `craft.captions.accessible` | Major | Accuracy, sync and safe area |
| Audio | `craft.audio.intelligible` | Critical | Loudness, peak and intelligibility signals |
| Color | `craft.color.match-before-look` | Major | Reference distance and clipping |
| Transitions | `craft.transitions.sparse` | Major | Handles, overlap and curve checks |
| Branding | `craft.brand.truthful` | Critical | Grounding and human fidelity review |
| Formats | `craft.formats.platform-fit` | Critical | Delivery contract |
| Delivery | `craft.delivery.qc` | Critical | Encoded-output QC |
| Rights | `craft.safety.consent` | Critical | Consent and provenance gate |

The registry stores, for every rule, intent, good use, bad use, exceptions, example, defect category, severity, evaluation kind, signals and profile overrides. Code and benchmark specifications must refer to an ID rather than restating the rule.

## Defect taxonomy

| Category | Scope |
|---|---|
| `technical` | Broken project/render, format, safe-area, codec or delivery contract |
| `visual-artifact` | Image, composite, generation or color defect |
| `temporal` | Flicker, drift, sync, freeze, discontinuity or motion defect |
| `audio` | Intelligibility, loudness, clipping, noise, silence or mix defect |
| `editorial` | Cut, continuity, selection, transition or structural craft defect |
| `narrative` | Hook, clarity, progression, pacing or persuasion defect |
| `brief-brand` | Brief, claim, product, logo, offer or brand-fidelity defect |
| `safety` | Content-policy or harmful-use defect |
| `rights` | Consent, ownership, license or provenance defect |

Root cause is recorded separately from defect category. Allowed root causes for Product Ad v1 are `tool-effect`, `default`, `skill`, `planner`, `provider-model`, `renderer` and `ambiguous-requirement`.

## Profile policy

Universal rules describe intent and critical invariants. Profiles supply thresholds. A `product-ad`, `talking-head`, narrative or platform profile may override timing, safe area, loudness or delivery values, but cannot weaken safety, rights, truthfulness or encoded-output integrity.

Any profile change requires a version bump and benchmark comparison. A profile must never silently become the default for unrelated projects.

## Evidence policy

- Deterministic checks prove schema, geometry, timing and contract invariants.
- Signal metrics are proxies and must be labeled as such.
- Perceptual judges require calibration against human ratings.
- Human preference must be blind and paired for promotions.
- Business metrics apply only after technical, rights and claim gates pass.
- A critical failure invalidates an output regardless of average score.

## Related contracts

- Effect catalog: `attelier_sdk` `contracts/capability-schema/src/effect-catalog.ts` and `GET /v1/effects`.
- Use-case rubrics: `attelier_sdk` `contracts/capability-schema/src/evaluation-specs.ts`; public Product Ad and Talking Head contracts are available at `GET /v1/evaluation-specs/{rubricId}` with public datasets at `GET /v1/benchmark-datasets/{datasetId}`. Holdout splits remain server-sealed.
- Rater workflow: `skills/product-ad/SKILL.md` and the blind-review API.
