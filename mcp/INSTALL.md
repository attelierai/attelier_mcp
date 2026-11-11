# Connect Attelier to Claude Code or Codex

This is the **Attelier MCP connector**. To install directly from GitHub,
follow the quick start in the repository README at
https://github.com/attelierai/attelier_agent. The steps below apply to a
prebuilt installer archive supplied separately. You do not need that repository, pnpm,
or a TypeScript build. Keep this folder somewhere permanent: your client will
start the connector from here. Internet access is needed for the first install.

1. Install Node.js **22.18+** (includes npm) and Claude Code or Codex.
   Windows users: use WSL2 for the documented and tested terminal workflow.
2. In https://app.attelier.ai → Account → API Keys, create an **App** key
   (`dir_`) with MCP read permission; add write for edits and spend only for
   paid jobs. Choose a credit cap and expiry. API Console `atai_` keys do not work.
3. Open a terminal in this extracted folder and run the command for your client:

   ```sh
   node setup.mjs claude
   # OR
   node setup.mjs codex
   ```

4. Save the key once, then check the connection:

   ```sh
   node setup.mjs login
   node setup.mjs doctor
   ```

   Paste the key at the hidden prompt. Login verifies it before saving it in
   `~/.config/attelier/mcp-token` (owner-only permissions). It replaces the
   previously saved key. Client configuration contains the file path, not the
   secret. Both clients can use the saved key without exporting it each time.
5. Restart your client and check `/mcp`. Ask: **“Use Attelier to list my projects.
   Do not generate, render or spend credits.”**

For local media analysis/rendering, also install FFmpeg (including ffprobe).
Doctor tells you whether they are present. Uploading an existing file and
remote MCP tools do not require local FFmpeg. Native local rendering may have
additional platform requirements; use server rendering for the simplest flow.

To use a clip: **“Use Attelier to import /absolute/path/clip.mp4 into a new
project. Inspect it technically and propose an edit. Ask before paid analysis,
generation or rendering.”** Paths refer to the machine running this connector.

## Manage the connection

- New key or expired key: revoke the old key in Account → API Keys and run
  `node setup.mjs login` again. No reconfiguration is needed.
- Existing `attelier` entry: setup preserves it and stops. Inspect it with
  `claude mcp get attelier` or `codex mcp get attelier`. If replacing it, remove
  only that entry (`claude mcp remove --scope user attelier` or
  `codex mcp remove attelier`), then rerun setup.
- An older project `.mcp.json` can override Claude's user entry. Inspect `/mcp`
  in that project and remove only the obsolete Attelier entry.
- Update: extract the new version into a new permanent folder, then replace
  the client entry as above. The saved key is reused.
- Uninstall: remove the client entry, revoke its key in the app, and delete the
  connector folder. Delete the token file only if no other client uses it.
- Multiple accounts: set `ATTELIER_API_TOKEN_FILE` to a separate absolute path
  before login and setup. Setup records that path. `ATTELIER_API_TOKEN` from
  your secret manager overrides the saved file when inherited by the process.

Never paste keys into chat, source code or command arguments. A key's cap is a
cumulative limit against the account's existing credits, not a credit grant.
Complete guide: https://docs.attelier.ai/mcp/
