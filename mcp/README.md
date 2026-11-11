# attelier-mcp

Attelier's public stdio MCP server. It gives an external agent — Claude Code,
Codex, or any MCP client — the same high-level tools Atte uses, without giving
it the whole internal editor surface.

## Quick start for users

Clone the public repository and follow its [quick start](../README.md#connect-claude-code-or-codex).
If you received a prebuilt **Attelier MCP installer**, follow [INSTALL.md](INSTALL.md).
It contains compiled connector packages and a dependency lockfile; users need
Node 22.18+ with npm, but no developer checkout or pnpm. Run `node setup.mjs claude`
or `node setup.mjs codex`, then `node setup.mjs login` and `node setup.mjs doctor`.
The public step-by-step guide is https://docs.attelier.ai/mcp/.

From this source checkout after building, the equivalent commands are
`node mcp/bin/attelier-mcp.js setup claude` (or `setup codex`),
`login` and `doctor`. Login stores a verified App key in an owner-only file;
setup registers only its path. Existing registrations are preserved.

Operators build an installer with `corepack pnpm@10.33.4 bundle:mcp`.
This creates a new archive and SHA-256 file in `.releases/`, without publishing
or tagging anything. Its manifest records the source revision and dirty state.
Distribute only a reviewed archive; never include local credentials or runtime data. Install-time npm resolves public runtime dependencies from
the included lockfile for the recipient's platform.

## What it is

A thin, allowlisted bridge:

```
Claude Code ── stdio JSON-RPC ──▶ attelier-mcp ── HTTP POST /mcp ──▶ Attelier API
```

- `tools/list` intersects `ATTE_PUBLIC_TOOLS` with the API's token-scoped list,
  so only curated tools the token may call are visible. The API's much larger
  internal catalog is not reachable through this transport.
- `tools/call` checks the name against that same allowlist and then forwards the
  request to the API's `/mcp` route. Explicit local media paths are streamed through the existing chunk upload API and replaced with upload references. Explicit Markdown briefs are read locally. The API owns authentication, budgets, idempotency and durable state.
- Direct HTTP callers submit completed upload references; filesystem paths belong to the local connector.

Scopes come from the API token, not from this process.

## Local motion toolkit

For creative work, load `get_agent_skill {skillId:"video-craft"}` and then only
the relevant discipline, such as `motion-design`. `list_agent_skills` discovers
the versioned library; both require only `mcp:read`. Studio and external clients
receive the same route-selection guidance. Prefer supported Remotion formats
for designed motion, native operations for editable timeline changes, and
FFmpeg for appropriate technical work. `motion_render` accepts registered formats. `motion_source` and
`motion_render_source` manage and render custom compositions through the API
sandbox; inspect their schemas and project revision before writing.

Use `motion_formats {summaryOnly:true}` to choose a format, then
`motion_formats {format:"shootout"}` to load only its full guide and example.
The no-argument call retains the complete list for existing clients.

These media tools run inside the bridge process, next to the agent, with no API call
(package `@attelier/motion`, which needs FFmpeg on the PATH):

| Tool | Returns |
|---|---|
| `motion_formats` | Finished video formats with a guide and a complete example spec |
| `motion_render` | A format rendered from a spec of local paths: one PNG (`stillAtSeconds`, returned as an image), a half-size preview, or a 1080p MP4 with mastered audio |
| `analyze_music` | Tempo, beat grid, drops/breaks and the offset that lands a drop on the first reveal |
| `probe_media` | Specs, hard cuts and loudness of a file |
| `find_moments` | Motion curve of a clip and the start of its most active window |
| `contact_sheet` | A frame grid of a video, returned as an image |
| `review_video` | The automatic check of a render: flashes at transitions, black spans, audio clipping, as issues to fix |
| `sfx_library` | The curated sound effects shipped with the formats |

## Taste

Two tools carry Attelier's taste, so every video starts from what already worked:

| Tool | Returns |
|---|---|
| `style_guide` | The lessons to apply, for a format (`format`) and project: the person's own first (from `/v1/taste`), then Attelier's house taste (`@atte/kit/taste`) by category, rules marked |
| `record_preference` | Keeps a lesson the person just taught by correcting a video (`statement`, `category`, their words as `evidence`, optional `format`/`projectId`), for every later video on the web, Claude Code or Codex |

Stdout carries JSON-RPC only; library logs from these tools go to stderr.

## Fetching the bytes a tool hands back

`render_frame` returns JSON followed by an embedded MCP `image/png` block.
`render_range`, frame-review evidence, asset proxies/posters and completed
render outputs return JSON followed by MCP `resource_link` blocks rather
than with megabytes of base64. Those URLs are on the API, and the same
`ATTELIER_API_TOKEN` opens them — a `mcp:read` token is accepted on these
read-only byte routes:

```
GET /v1/projects/:projectId/frames/:key
GET /v1/projects/:projectId/previews/:key
GET /v1/uploads/:uploadId/proxy
GET /v1/uploads/:uploadId/poster
GET /v1/render-jobs/:jobId/output
GET /v1/projects/:projectId/motion-renders/:key/content
```

```bash
curl -sS -o frame.png \
  -H "Authorization: Bearer $ATTELIER_API_TOKEN" \
  "$ATTELIER_API_URL/v1/projects/$PROJECT_ID/frames/12-4000-960.png"
```

These routes retain ownership checks. Other supported app REST routes require
the corresponding `api:read`, `api:write` or `api:spend` scope; administrative
operations remain session-only. An API key is not an administrator credential.
See [authentication](https://docs.attelier.ai/authentication/) for the scope matrix.

## Shared postproduction

1. Set `project_budget` before paid analysis; every client shares this allocation and the account/connection caps still apply.
2. `prepare_project` or `import_media` accepts explicit absolute `paths` on the connector's machine, or `uploadIds` already on the API. Uploads resume by content hash; use an idempotency key for preparation.
3. `analyze_asset` with `analysis: "postproduction"` persists progress and source/config evidence. `technicalOnly: true` avoids provider calls. Failures remain visible and require `force: true` to retry; completed visual batches are reused.
   For an ambiguity that can change the edit, add `inspection: { question, atSeconds, crop? }`: at most nine ordered samples, with an optional original-pixel `{ x, y, width, height }` crop. This bounded paid reading has its own durable cache and does not repeat the initial analysis.
4. `get_asset_evidence` returns transcript confidence, technical evidence and partial analysis. Request original `frames` with timestamps and an optional pixel crop to inspect them directly as MCP images.
5. `inspect_project` includes the brief, editorial proposal, accepted direction and available evidence. `editorial_plan` proposes concrete edits against the current project and plan versions, then accepts or discards them. Acceptance uses ordinary reversible transactions and a checkpoint.
   Its `calls` use the same camelCase editor arguments as `compile_edit`.
6. Quote/start a render and poll `get_job`. With `kind: "render"`, the connector accepts `downloadTo` to stream the export directly to an explicitly named local file, without overwriting existing files. `review_project` with `level: "delivery"` and `renderJobId` reviews the exact completed current-revision export against the brief; results and unobserved dimensions remain explicit.

## Whole-video upscale and compression

The generic inference tools also carry provider-backed whole-video operations.
Call `list_models` and `get_model` first: Vidaio models appear only when their
operator-configured server-side rates make them available. Do not assume an id,
price or cancellation action from this document.

For an available model, keep the original unchanged and save a project version
when working in a project, then call `upload_inference` for the local source. It returns `{id,mimeType,bytes,sha256}`;
compose `videoUploadUrl` as the internal `/v1/uploads/<id>/content` path from
that id and pass it to `quote_inference`. The canonical model ids and parameters
are:

| Operation | Model | Required parameters |
|---|---|---|
| Upscale | `vidaio/upscale/standard` or `vidaio/upscale/premium` | `videoUploadUrl`, `upscaleFactor: 2` or `4` |
| Compress | `vidaio/compress/standard` or `vidaio/compress/premium` | `videoUploadUrl`, `compressionLevel`: Low favors smaller files; Medium balances size and quality; High preserves more quality |

`quote_inference` reveals no media and does not spend. Start exactly the saved
quote with `start_inference` and an idempotency key only with `mcp:spend`, poll
`get_inference`, download the completed output to a new explicit path, then use
`import_media` to retain it as a separate Library asset. Keep the original and
compare the result before changing a timeline. Vidaio has no standalone denoise
or restoration endpoint: upscaling changes resolution and compression changes
encoding; neither proves missing source detail was recovered.

An existing Library asset is not an inference upload. Start with
`discover_atelier`; when it advertises `video_upscale` or `video_compress`,
prefer `quote_job { kind: "capability", capability, input }` using that asset's
authoritative `source.url`, the discovered descriptor's `providerId`, and
`routingTier: "manual"`. If no matching descriptor is available, download the
Library asset locally and use `upload_inference`; never reinterpret its Library
URL as `/v1/uploads/<id>/content`.

In Studio, Account → API keys creates a revocable connection and shows its scopes, limit, verified handshake and recent activity. No conversation transcript is copied between clients.

## Configuration

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `ATTELIER_API_URL` | no | `https://api.attelier.ai` | Attelier API base URL |
| `ATTELIER_API_TOKEN` | no | — | Explicit bearer token; takes precedence over the saved file |
| `ATTELIER_API_TOKEN_FILE` | no | `~/.config/attelier/mcp-token` | Owner-only token file, written by `login`; implicit default is used only for the production URL |

## Claude Code plugin

`plugin/` is the Attelier plugin for Claude Code: this MCP server (as
`attelier`) plus the `make-video` skill, which carries the process that made
the rally shootout (taste first, plan before spending, generate, edit with a
format, review, deliver, learn). The repository root is its marketplace.

```bash
pnpm install --frozen-lockfile && pnpm build          # the plugin runs mcp/dist
# Supply ATTELIER_API_TOKEN through your local secret manager.
# ATTELIER_API_URL defaults to https://api.attelier.ai
claude plugin marketplace add /absolute/path/to/attelier_agent
claude plugin install attelier@attelier
```

For a quick try without installing: `claude --plugin-dir /absolute/path/to/attelier_agent/plugin`.

## Claude Code (MCP only)

From a fresh clone, install, build the kit dependency, export the token, and
launch the same bridge command used by `.mcp.json`:

```bash
pnpm install --frozen-lockfile && pnpm build
node mcp/bin/attelier-mcp.js
```

The bridge runs compiled JavaScript in `mcp/dist/`; run the root build before starting it.

```bash
claude mcp add attelier \
  --env ATTELIER_API_URL=https://api.attelier.ai \
  -- node /absolute/path/to/attelier_agent/mcp/bin/attelier-mcp.js
```

Launch the client with `ATTELIER_API_TOKEN` available in its environment.
Then check it with `/mcp` inside Claude Code.

## Codex

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.attelier]
command = "node"
args = ["/absolute/path/to/attelier_agent/mcp/bin/attelier-mcp.js"]
env_vars = ["ATTELIER_API_TOKEN"]
tool_timeout_sec = 600

[mcp_servers.attelier.env]
ATTELIER_API_URL = "https://api.attelier.ai"
```

Codex reads the same skill as Claude Code; link it into your Codex skills:

```bash
ln -s /absolute/path/to/attelier_agent/plugin/skills/make-video ~/.codex/skills/attelier-make-video
```

## Requirements

Node 22.18 or newer. Production URLs require HTTPS; explicit loopback HTTP
is supported for local development. URLs with credentials, a query or fragment
are rejected, as are authenticated redirects. The server reads credentials from
the environment; keep them out of command history and committed configuration.

## Tests

```bash
pnpm --filter attelier-mcp test
```

The suite spawns the real binary over stdio, sends `initialize` and
`tools/list`, asserts the public tools are exactly what is listed, and asserts
that a non-public tool name is rejected before any request reaches the API.
