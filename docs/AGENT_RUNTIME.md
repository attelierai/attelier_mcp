# Attelier agent runtime

Attelier separates the model from the harness that makes it useful and safe.

## Versioned boundary

`harness` is the canonical runtime contract. A harness version pins:

- planner and system-prompt versions;
- deterministic fallback version;
- model-registry version and selected model provenance;
- product-catalog version;
- MCP protocol/server versions;
- inspect/simulate/approval/idempotency policy.

Any behavioral change to those fields must bump the relevant component version. A breaking tool or provenance change bumps the harness major version; compatible planner/prompt behavior bumps minor; implementation-only fixes bump patch. Benchmark runs persist `modelVersion`, `harnessVersion`, `plannerVersion` and Git revision so baseline/candidate changes remain attributable.

## Atte, the one agent

Attelier has one agent, Atte, and it runs in the app's API (`attelier_app/backend/src/atte-light-harness.ts`,
`atte-model-providers.ts`), not in this package. Each turn is a small tool loop:
Claude Code-style file and shell tools confined to a per-project (or per-Library-asset) working
directory, plus every public Attelier MCP tool through the `attelier-mcp` stdio bridge. The loop asks a
model provider for each step: Anthropic (Claude Opus 5.5 by default, Sonnet 5) or OpenAI's Responses API
(GPT-5.6 Sol, Terra, Luna). A chat runs the model chosen with `/model`, else the deployment default, and
the provider's key must be configured. Atte's own spend caps and credits live in `atte-budget.ts`.

This package keeps what Atte and external agents share: the project tool compiler and transactions, the
session store, projection and command surface (slash commands and AI-locked deterministic edits), the MCP
contract, critics and the media model routers.

## Family-scoped media routing

`routeAttelierMediaModel` is instantiated independently
for `video`, `image`, `voice`, `music` and `effects`; a capability maps to exactly one family and candidates
from another family are ineligible. Each media router can use automatic balanced/quality/cost policy or
an exact manual pin. Tenant policy filters candidates before selection. The chosen provider, candidate
set, policy, reason, registry version and any admitted media fallback are stored on the quote, and the
job executes that exact quoted provider. Current media `quality` policy means curated tier eligibility
plus technical reliability, not measured perceptual superiority.

The next media extension seam is a provider plugin/registry SDK. Today adapters are pluggable at the API
boundary, but the built-in media provider catalog still lives in the API service; arbitrary remote media
providers are not yet hot-loaded from configuration alone.

## Clients

The harness is a library, not a program: the app's API runs the Studio turn in-process and external
agents reach the same tools through the Attelier MCP (`mcp/`). Both load the same durable project revision,
media, jobs and session projection; the backend stays the authority for mutation, budget and revision.

API tokens are created by an owner/admin at `POST /v1/workspaces/{workspaceId}/api-tokens`; names must contain 1–80 characters and scopes are restricted to `mcp:read`, `mcp:write`, `mcp:spend`, or `*`. Use the minimum scope. `GET` on the same collection lists IDs, names, scopes, timestamps and active/revoked state but never returns a bearer or hash. Revoke temporary or compromised credentials with `DELETE /v1/workspaces/{workspaceId}/api-tokens/{tokenId}`. Revocation is immediate and idempotent, stores one chained audit event and never requires resending the bearer value.

### Claude Code / external coding agents

The repository ships `.mcp.json`, which registers the `attelier-mcp` stdio bridge (`node mcp/bin/attelier-mcp.js`, API at `https://api.attelier.ai`) for Claude Code sessions opened in this workspace; export `ATTELIER_API_TOKEN` before launching so the variable expands. The project skill `.claude/skills/atelier-harness/SKILL.md` documents the driving loop (inspect → plan → simulate → commit, quote-first generation, quality evaluation) so a coding agent works over the same public MCP contract as Atte. Any MCP-capable agent (Codex, etc.) can connect the same way: standard `initialize`/`tools/list`/`tools/call` JSON-RPC over POST with a bearer token.

`runAttelierAgentConformance` (`@attelier/agent-harness/conformance`) is the executable external-agent contract; it takes any MCP client and no binary in this repository runs it. It requires `mcp:read`, uses only public MCP calls and validates transport/catalog versions, required tools, progressive skill loading, all effect contracts, project inspection, deterministic planning, real transaction simulation, and objective quality/parity evaluation. It creates no project commit and starts no paid provider work.

## Execution traces

An agent should create one execution trace for a user intent, then propagate the returned 32-character ID as `x-atelier-trace-id` through planning, commit, capability, workflow and render calls. `AttelierMcpClient` sends it when constructed with a trace ID; any MCP client can send the same header. Quotes and jobs retain that ID automatically. `create_execution_trace` requires `mcp:write`; list/detail use `mcp:read`.

The trace ledger is operational metadata, not conversation storage. It keeps resource IDs, state transitions, cost, provider/model and safe version/hash lineage. It strips prompts, scripts, text/media content, input/output payloads, tokens, credentials and email-like PII before persistence. Workflow aggregate cost is excluded when itemized capability jobs exist, so a trace never reports the same spend twice. Trace recording is best-effort: observability failure cannot turn a completed paid job, committed edit or render into an application failure.

## MCP safety model

- `mcp:read`: discovery, inspection, planning, simulation and evaluation.
- `mcp:write`: commits validated project transactions.
- `mcp:spend`: approves/reserves/starts/cancels paid or policy-sensitive capabilities, workflows and renders.

Agents inspect before mutation, simulate before commit and never bypass quote/consent/policy checks. The catalog exposes one enforced lifecycle for every durable product action:

Color finishing preserves the same boundary. `propose_color_correction` is an `mcp:read` analysis tool: it samples one image frame or three representative video frames, returns versioned scopes/confidence plus a simulated transaction, and never commits or stores raw frames. A `no-change` recommendation must remain untouched. A returned transaction still requires normal user approval and `commit_transaction` with `mcp:write`. Reference-frame matching is a separate operation from neutral exposure/white-balance assistance.

1. Quote the exact capability input, workflow delivery promise or revision-pinned render.
2. If `approvalRequired` is true, call the corresponding approval primitive with `mcp:spend` authority; capabilities may additionally require reservation.
3. Start from that quote with an 8–200 character idempotency key. Replaying the same key and arguments returns the original resource; changing the arguments returns `409`.
4. Poll the returned job/run ID and cancel that same resource if the request is abandoned.

HTTP and MCP implement the same lifecycle. Workflow and render job endpoints reject unquoted starts and missing idempotency keys. Render quotes pin the project revision, format, runtime estimate, cost and metering basis; a project edit invalidates the old quote. Idempotency is isolated per workspace. Render batches accept only pre-created quotes, are themselves idempotent and cancel all unfinished child jobs. The Rust project core remains the mutation authority; models only propose typed operations.

## Proposal-only analysis

`propose_motion_treatment` is proposal-only and requires `mcp:read`. Motion analysis 1.0 decodes at most 24 grayscale frames from one bounded representative source window when the selected clip has a completed local upload. It reports global-translation level, path efficiency, direction consistency, match confidence and explicit limitations; no raw pixels are retained. Motion preflight 1.0 then merges that evidence conservatively with project annotations: `motion.intent=intentional` blocks stabilization; `motion.level=static|low` blocks either temporal treatment; unreliable analysis blocks treatment; and `content.essentialDetail=true` or `motion.protectedDetail=true` blocks temporal blur. Explicit safety annotations cannot be overridden by a sampled measurement. A blocked request returns `needs-action` with reason codes and null transaction/simulation. If decoding is unavailable, Attelier discloses the fallback to annotations rather than claiming analysis. OCR, subject motion, rotation, zoom, parallax and semantic intent remain unmeasured. Strength is clamped to 0–1, blur to 2–5 frames, and a short encoded proof plus approval before commit remain mandatory; cadence/duration correctness does not prove perceptual quality.

`propose_subject_reframe` is also proposal-only. A local open-weight TorchVision detector samples seven source frames, selects a continuous subject track and returns ordinary editable position keyframes only when detection ratio, confidence, continuity and minimum subject coverage pass the versioned contract. Weak or unsafe tracks return `needs-action` with a null transaction and preserve the original framing; Attelier never substitutes a blind center crop. The API runs it; install its pinned runtime from `attelier_app` with `.venv/bin/python -m pip install -r requirements/subject-reframe.txt`; `ATTELIER_PYTHON` selects the interpreter and `ATTELIER_SUBJECT_REFRAME_DEVICE` defaults to `cpu`. The public five-case synthetic corpus is a deterministic contract gate, not a perceptual composition claim.
