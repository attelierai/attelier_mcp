---
name: authorized-avatar
description: Create or localize an editable avatar, face or voice performance in Attelier only with verified scoped consent. Use for approved digital presenters, authorized dubbing, consented lip sync and traceable identity edits; never for deceptive impersonation.
---

# Authorized avatar

## Executable workflow

1. Call `discover_atelier` and stop unless an active consent record and current workspace evidence confirm identity, modality, purpose, audience, territory, duration and revocation scope.

```json
{"tool":"discover_atelier","arguments":{}}
```

2. Call `quote_job` only for the consent-covered capability. Review provider/data policy and cost; `start_job` is the spend point.

```json
{"tool":"quote_job","arguments":{"kind":"capability","capability":"authorized_lip_sync","input":{"projectId":"project-id","identityId":"consented-identity-id","scriptAssetId":"approved-script-id"}}}
```

```json
{"tool":"start_job","arguments":{"kind":"capability","quoteId":"approved-quote-id","idempotencyKey":"avatar-consented-take-1"}}
```

3. Call `get_job`, then `review_project` and `render_range`; keep human identity review unresolved until a person approves it.

```json
{"tool":"get_job","arguments":{"kind":"capability","jobId":"capability-job-id"}}
```

```json
{"tool":"review_project","arguments":{"projectId":"project-id","level":"gates","profile":"talking-head-v1"}}
```

## Craft rules

Follow atelier.identity.lip-sync@1 and atelier.audio.professional-mix@1. Never infer consent from possession, continue after revocation or present a synthetic identity without disclosure and lineage.
