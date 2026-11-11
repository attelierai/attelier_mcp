# Attelier Agent

## Connect Claude Code or Codex

Clone this repository into a permanent folder. Use **Node.js 22.18+** and
the pinned pnpm version below; SDK packages are included, so no other Attelier
repository or private package registry is required.

```sh
git clone https://github.com/attelierai/attelier_agent.git
cd attelier_agent
corepack pnpm@10.33.4 install --frozen-lockfile
corepack pnpm@10.33.4 build
node mcp/bin/attelier-mcp.js setup codex
# Or: node mcp/bin/attelier-mcp.js setup claude
node mcp/bin/attelier-mcp.js login
node mcp/bin/attelier-mcp.js doctor
```

If Corepack is not installed, replace `corepack pnpm@10.33.4` with
`npx --yes pnpm@10.33.4`. Login asks for your App key (`dir_`) without echoing
it and stores it in an owner-only file, outside this repository. Never put the
key in a prompt, command argument or source file. Restart your client, check
`/mcp`, and ask it to list your Attelier projects before spending credits.

Create your own key in [Account → API Keys](https://app.attelier.ai): enable
MCP read, write for editing, and spend only for paid work; choose a cap and
expiry. API Console `atai_` keys do not work here. FFmpeg/ffprobe are optional
for connecting and uploading, and required for local media inspection.
The terminal workflow is tested on Linux; on Windows use WSL2.

The [installation guide](mcp/INSTALL.md) covers the optional prebuilt archive,
rotation and removal. [Public docs](https://docs.attelier.ai/mcp/) explain the
media workflow. Corepack/pnpm are build tools; the `private` fields in package
metadata prevent accidental npm publication, not GitHub cloning.

## Repository layout

Atte runtime: `kit/` contains provider-neutral tools, policies and skill
registry; `harness/` contains the conversation and execution runtime the app's Studio uses; `mcp/` exposes the
scoped stdio bridge; `motion/` holds the Remotion formats and media toolkit; `cli/` is the `attelier` API
client; `skills/` contains authored workflows. The app's HTTP API
retains ownership, persistence, revision and budget authority.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm generate:mcp-docs
pnpm pack:release
```

Use Node 22 and pnpm 10.33.4. No Rust compiler or app checkout is required.
SDK dependencies are versioned, hashed archives in `vendor/`. Import a reviewed
SDK release with `node scripts/import-release.mjs /path/to/release`, then install
and test. The kit packages authored skills during build; installed consumers do
not reach outside the package to load them. MCP runs compiled JavaScript.

Connect to a configured backend using Studio's short-lived scoped access token.
Never commit that token. Tests use local fixtures and never paid provider calls.
See [kit and MCP contracts](docs/ATTE_KIT.md) and [development](docs/DEVELOPMENT.md).

Motion exports default to the `web` profile (H.264 CRF 21, mastered audio,
MP4 fast start). Set `profile: "master"` on `motion_render` to retain CRF 17.
`shootout` accepts clips without generation metrics: unknown counters stay
hidden and the race is omitted unless every clip supplies both metrics.
`beats.race: 0` explicitly omits it. Pass a JSON object as `spec` and an array
of strings as `endcard.tagline`; invalid nested values fail before probing
shootout media. Media import paths may be relative to the working folder and
retain the connector's existing symlink/confinement checks.
