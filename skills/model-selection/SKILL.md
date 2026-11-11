---
name: model-selection
description: Choose the Attelier model for each generation job (image, text-to-video, image-to-video, voice, music, sound) by what the shot needs, how long it may take and what it costs. Use before quoting any paid generation, when comparing models, or when a person asks which model to use.
---

# Model selection

Every model runs on the Attelier API. Name a model by its product name and maker
(Seedance 2.5 by ByteDance, Kling 3 by Kuaishou, Wan 3.0 by Alibaba, MiniMax H3,
LTX Video by Lightricks, FLUX by Black Forest Labs), never by a hosting route or a
provider id. Tell people prices in credits (1 credit = $0.01), never in dollars.

## Workflow

1. Read the live catalogue. It is the only source for what is available now, each
   model's task (text-to-image, image-to-video…), its limits and its price in
   credits. A model that is locked as premium stays off unless the person unlocks it.

```json
{"tool":"list_models","arguments":{}}
```

2. Decide what the shot needs (below), shortlist one or two models, and quote the
   exact job. The quote is the price; never estimate one from memory.

```json
{"tool":"quote_inference","arguments":{"model":"model-id-from-list_models","parameters":{"prompt":"A white rally car drifts through a dusty pine-forest bend at golden hour, low tracking shot","durationSeconds":5}}}
```

3. Put the choice, the reason and the quoted credits in the plan, and wait for the
   person's go-ahead before starting paid work.

## What the shot needs

- **Cheap exploration first.** Draft looks, compositions and storyboards on the
  cheapest model that shows the idea, then spend on the hero shots only.
- **Realism and physical motion** (vehicles, liquids, people moving): the premium
  video models. In the rally shootout, Seedance 2.5 and Kling 3 held motion and
  detail best; Wan 3.0 was close at a lower price.
- **Speed** (many variations, a live demo, a tight loop): MiniMax H3 was by far the
  fastest in the shootout.
- **Text inside the picture** (signs, packaging, UI): generate the image without
  text and add the words as typography in the edit; generated letters are rarely
  exact. Check with a still before relying on any model's text.
- **Consistency across shots** (same product, same character): image-to-video from
  one approved still beats separate text prompts. Upload the reference with
  `upload_inference` and pass the returned `/v1/uploads/<id>/content` URL, never a
  local path or an `upload://` reference.
- **Voice**: use a `voiceId` from the catalogue, never a voice name. If no listed
  voice fits, leave `voiceId` out and let the default apply.
- **Music and sound**: generate a bed or effects only when the house library
  (`sfx/`, `sfx_library`) has nothing that fits.

## Measured reference: rally shootout (same prompt, one 5 s shot each)

| Model | Generation time | Cost of the shot |
| --- | --- | --- |
| MiniMax H3 | about 2–4 s | about $0.06–0.13 |
| Kling 3 | about 40 s | about $0.56 |
| Wan 3.0 | about 68 s | about $0.25 |
| Seedance 2.5 | about 68 s to 3 m 49 s | about $2.34 |

These are one measurement on one prompt. Prices change: always quote, and report
real times and costs from the finished jobs (`get_inference`), never from this
table. Anything not measured here, such as how a model handles faces, hands or a
specific style, is checked with a quote and a cheap test, not assumed.

## Rules

- One model per need, not one model for everything: a cheap model for drafts and a
  premium one for the hero shot is normal.
- Never start a premium model the person has locked, and never pick one silently
  when a cheaper one meets the brief.
- When comparing models for the person, use identical prompts, durations and
  aspect ratios, and show the real numbers from each job (house taste `real-numbers`).
