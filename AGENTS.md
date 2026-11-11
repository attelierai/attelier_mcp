# Working agreements

- Read README and docs/DEVELOPMENT before changes; follow the current user scope.
- Subagents are allowed; by default they run exactly the parent's model (same vendor and tier). Cross-vendor (Claude↔Codex) or any other tier, especially a lower one (Astra→Sol, Sol→Terra, Opus→Sonnet), only with the user's explicit permission asked first.
- Preserve other writers, runtime state and original media. No broad cleanup.
- Use Node 22, the committed pnpm version and lockfile. Run build, typecheck, lint and tests.
- Keep dependencies repository-local or pinned releases; never rely on a sibling checkout.
- Do not add database authority to the agent/SDK; the app API owns revisions, budgets and jobs.
- Never start paid jobs or schedules during checks. Use isolated data and fixtures.
- Keep secrets, uploads, weights, evidence and generated builds ignored. Only sanitized env examples are tracked.
- Keep one ignored .codex/current.md for continuity when needed; do not overwrite another writer's note.
- Source publication and runtime deployment require separate authority. Use the approved repository identity and publication checks; verify the destination and its authorized visibility.

## Tests

- Only integration and end-to-end tests. They exercise real behaviour through real
  boundaries: HTTP, database, filesystem, processes, browser, published contracts or
  golden outputs.
- No unit tests of internal helpers, no mocks of internal modules, and no tests that
  freeze data, wording, markup or implementation details.
- Fake only what is external and paid or unavailable (model providers, chains, GPUs),
  at the network boundary.
- A fix or a behaviour that matters gets a test; extend an existing integration test
  before adding a new file. Delete a test that blocks a refactor without protecting
  behaviour.

## Commits and pushes

- Commit without asking the owner for permission: run the commit gate
  configured for the current workspace and commit.
- Pushing to a remote still needs the owner's explicit OK in the conversation.
