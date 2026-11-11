---
name: media-sourcing
description: Reuse Attelier Library media and source rights-safe stock, web, or declared dataset assets before generating new media.
---

# Media sourcing

## Executable workflow

1. Call `search_media` across project and workspace scope; preserve exact IDs, versions, proxy/poster resource links and rights metadata.

```json
{"tool":"search_media","arguments":{"projectId":"project-id","query":"approved establishing shot","scope":"all","kind":"video","limit":20}}
```

2. Call `get_asset_evidence` for the selected project asset before placement.

```json
{"tool":"get_asset_evidence","arguments":{"projectId":"project-id","assetId":"asset-id","include":["transcript","audio","description"]}}
```

3. Call `compile_edit` to import or place the chosen asset, inspect `simulation`, then use `commit_transaction` at the approved commit point.

```json
{"tool":"compile_edit","arguments":{"projectId":"project-id","expectedRevision":7,"calls":[{"tool":"prepare_workspace_asset_import","arguments":{"workspaceAssetId":"workspace-asset-id"}}]}}
```

```json
{"tool":"commit_transaction","arguments":{"projectId":"project-id","transaction":{"id":"transaction-from-compile_edit"}}}
```

## Craft rules

Project and Library media come first; generation is last. A reachable URL is not rights evidence, and asset provenance/version must survive import.
