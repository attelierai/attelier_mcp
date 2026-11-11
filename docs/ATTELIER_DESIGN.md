# How Attelier fits together

The design every surface, service and agent follows. It
answers one question: how does Attelier make videos that are good, beautiful
and made with taste, from the web, the API, Claude Code or Codex, without
reinventing what a strong model already does well?

## The idea

Claude Opus 5.5, given good hands and good taste, edits video remarkably well
(the rally shootout was made that way). So Attelier does not build a smarter
agent. It builds the three things around any agent:

1. **Hands** — one catalogue of tools over Attelier's services.
2. **Taste** — house lessons, each person's lessons, formats and skills.
3. **Surfaces** — the web, the API/CLI and MCP, all using the same hands and taste.

```
Surfaces    Create   Studio   Templates   Pipelines   API/CLI   MCP (Claude Code, Codex)
               │        │         │           │          │          │
Brains         │     Atte (web runtime)   Pipeline runner   code    the person's own agent
               │        └─────────┴───────────┴──────────┬──────────┘
Taste          │   house taste · person taste · formats · skills · templates
               │                                          │
Hands       ───┴─────────── Attelier tools (one catalogue) ─────────────
                                                          │
Services    Inference · Library · Projects (timeline, revisions) · Motion · Credits
```

## Services: the authority

Inference (quotes, jobs, providers), Library (everything generated or uploaded),
Projects (the timeline with revisions and undo), Motion (analysis, formats,
rendering with Remotion) and Credits (prices, limits, charges). They validate
everything and know nothing about agents. An agent can be wrong; a service
never lets that turn into a lost edit or an unexpected charge.

## Hands: one catalogue of tools

Each operation is defined once, with its schema, price behaviour and scopes, in
`kit/src/mcp-tool-catalog.ts`; OpenAI, Anthropic and MCP declarations are
derived from it (`kit/src/tool-adapters.ts`). Tools that must run next to the
agent (motion rendering, media analysis, taste) live in `mcp/src/local-tools.ts`.

Rules for a tool:

- Abstract the plumbing (queues, waiting, uploads, file formats, spending
  permission), never the creative decision. The model chooses; the tool does.
- Small and composable. The rally used `list_models`, `quote_inference`,
  `start_inference`, `get_inference`, `download_inference`, `motion_formats`,
  `probe_media`, `find_moments`, `analyze_music`, `contact_sheet`,
  `motion_render` and `import_media`. That set is the baseline; a tool is added
  only when a real brief fails without it.
- The same tools for the web agent and for the person's agent. Improving one
  improves both.

## Taste: what makes Attelier's videos Attelier's

Four kinds of knowledge, all data rather than code paths:

| Kind | What it is | Where |
|---|---|---|
| Formats | Finished, tested edits that render (shootout, making-of, evolution) | `motion/src/formats` |
| Skills | Procedures and craft for a kind of work (product ad, typography, review) | `skills/*/SKILL.md` (packaged into the kit at build) |
| House taste | Short lessons learned from real feedback, each with the words that taught it | `kit/src/taste.ts` |
| Person taste | Each account's own lessons, recorded when that person corrects a video | Attelier API `/v1/taste` |

A **template** is a format or skill plus defaults plus a real example it made
(Studio refuses a template without one). A **pipeline** is a template plus
variable inputs plus a schedule.

### The taste loop

1. **Read.** Before planning, the agent calls `style_guide` with the format; it
   gets the person's lessons first (they win a conflict), then the house
   lessons by category, rules marked. It reads it again before delivering.
2. **Record.** When the person corrects how the video looks, sounds, reads or
   is paced, the agent calls `record_preference` with one imperative rule and
   the person's words. Facts, bugs and one-off content choices are not taste.
3. **Curate.** The team reviews recorded lessons. One that several people teach,
   or that the team agrees is simply better, is promoted into the house taste
   by a reviewed change, with its evidence.
4. **Graduate.** A lesson that keeps being applied becomes a format default or
   a check (`enforcedBy` records it): "real numbers" became required fields of
   the shootout format; "check transitions for flashes" became `review_video`
   (flashes, black spans, clipping); "no full stop in titles" became a
   `motion_render` warning. Graduated lessons stop costing prompt space.
5. **Measure.** A fixed set of real briefs is re-run after every change to
   tools, formats or taste, and scored for quality, time, cost and failures
   (`attelier_app/eval/scripts/atte-bench.mjs` with `atte-briefs.json`).

What the first lessons came from: every correction in the rally shootout, the
model-evolution video and the making-of sessions — pacing that
let each model breathe, music that clears the voice, neutral questions,
highlights without boxes, pronunciation, end cards, transitions without
flashes, calm screen recordings. They are in `kit/src/taste.ts` with quotes.

## Brains

- **The person's own agent** (Claude Code, Codex): connects to the MCP server,
  pays for its own model, and uses the same tools and taste. The Claude Code
  plugin (`plugin/`: the MCP server and the `make-video` skill) installs both;
  Codex uses the same MCP server and links the same skill.
- **Atte, the web runtime**: runs server-side for a person on attelier.ai, one
  session and working folder per project, with a spending key per turn. It is
  the light harness (`attelier_app/backend/src/atte-light-harness.ts`): Claude
  Code's loop on the model provider's API with its file and shell tools, the MCP
  tools, adaptive thinking, prompt caching, server-side compaction and a saved
  thread. A Claude subscription cannot serve other people, so the web pays the
  API.
- **Pipelines** run the same runtime unattended, from a template and its
  inputs, and deliver into the Library.

## How the sections relate

| Section | Role | Brain |
|---|---|---|
| Create | Direct generation with price shown; results land in the Library | none |
| Studio | A project with its timeline and Atte beside it | Atte |
| Templates | Proven recipes with the video they made; "use" opens Studio | Atte |
| Pipelines | A template repeated on a schedule with new inputs | Atte, unattended |
| API / CLI | The same tools for developers | their code |
| MCP | The same tools and taste for Claude Code and Codex | their agent |

Create generates, Studio edits, a template captures what worked in Studio, a
pipeline repeats it. Everything ends in the same Library and is paid in the
same credits.

## Principles

- Authority lives in the services, never in an agent.
- Tools do not decide for the model; taste informs it.
- No template without a real example; no house lesson without its evidence.
- Nothing in services or tools is specific to one brain.
