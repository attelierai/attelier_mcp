---
name: brand-compliance
description: Protect supplied brand identity, product facts, approved claims, offers and visual assets in Attelier. Use for advertisements, branded content, generated product media or final commercial review.
---

# Brand compliance

## Executable workflow

1. Call `inspect_project` to resolve supplied brand assets and current decisions. Search only if the exact asset is missing. Before adding or changing brand presentation, save the explicit instruction and original asset ID in the complete brief with `set_brief`, `expectedRevision` and `expectedPlanVersion=plan.version`; preserve other decisions. Keep the accepted instruction faithful to the user's words: an agent-chosen corner, size or animation belongs to the applied timeline, not to an accepted creative decision unless the user requested it. A direct request to add the supplied logo is authorization for that edit, and needs no separate approval.

```json
{"tool":"inspect_project","arguments":{"projectId":"project-id"}}
```

```json
{"tool":"search_media","arguments":{"projectId":"project-id","query":"approved logo and product references","scope":"all","kind":"image","limit":20}}
```

2. Call `render_frame` for each logo, product, price, offer and CTA moment; compare visible pixels/copy with approved inputs.

```json
{"tool":"render_frame","arguments":{"projectId":"project-id","atSeconds":12,"width":960}}
```

3. Call `review_project` with the relevant delivery profile and keep brand approval separate from technical gates.

```json
{"tool":"review_project","arguments":{"projectId":"project-id","level":"gates","profile":"product-ad-v1"}}
```

## Craft rules

Build explicit approved/forbidden claim lists. Wrong identity, logo, price or unsupported claim blocks publication; missing information is never permission to invent.

“The full logo” means the supplied symbol and wordmark, not an improvised icon or text recreation. Resolve the exact original asset, preserve its aspect and use contain when cropping would lose any part. Inspect its rendered entry, hold and exit. Preserve approved music and typography during a logo-only correction. Supplied copy such as “Price matters” is a creative phrase, not permission to invent a numeric price or proof claim.
