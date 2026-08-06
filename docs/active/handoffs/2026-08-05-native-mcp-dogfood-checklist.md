---
status: active
branch: feat/native-mcp-phase1
created: 2026-08-05
---

# Native MCP phase 1 — dogfood checklist

The dev window is **"YouCoded - Native MCP"** (Vite 5243, profile `youcoded-mcp`). It is a
separate Electron instance from your live app — the live app is untouched and still running.

> **Launch gotcha, for whoever runs this worktree next.** `worktrees/native-mcp/desktop/node_modules`
> has an `electron` package with no `dist/` and no `path.txt` — the postinstall never ran there — so
> plain `run-dev.sh` dies with *"Electron failed to install correctly."* The main checkout has the
> same version (41.10.3) already downloaded, so the fix is one env var, no file changes:
> ```bash
> export ELECTRON_OVERRIDE_DIST_PATH=/home/destin/youcoded-dev/youcoded/desktop/node_modules/electron/dist
> bash scripts/run-dev.sh native-mcp --label "Native MCP" --offset 70 --profile mcp
> ```

## What I set up for you

**A local test MCP server**, at
`/tmp/claude-1000/-home-destin-youcoded-dev/fb4c5ef0-8281-4ce4-a607-517eff19146c/scratchpad/sandbox-mcp-server.js`.
It is deliberately offline — no `npx`, no network — so what you're testing is our code, not
someone else's server. I smoke-tested it against the real SDK client before wiring it up:
`tools: echo, add_numbers, slow_echo` / `echo -> "sandbox echo: hello"` / `add -> "42"`.

**`~/.youcoded/mcp.json`** — this file did not exist before; I created it with three servers:

| id | enabled | what it's for |
|---|---|---|
| `sandbox` | yes | Three small tools: `echo`, `add_numbers`, `slow_echo`. The happy path. |
| `bulky` | yes | 20 padded filler tools, ≈5,400 schema tokens. Exists only to make the budget gate observable. |
| `broken` | **no** | Points at `definitely-not-a-real-command`. Flip it on for step 6. |

> ⚠️ Two things to know before you start. `~/.youcoded/` is your **real, synced** native home —
> `mcp.json` will sync to your other devices until you delete it (cleanup at the bottom). And step 7
> makes the app write your **real `~/.claude.json`** (59 top-level keys). I backed it up first to
> `…/scratchpad/claude.json.backup-20260805-211932`. That backup is the whole reason step 7 is safe
> to run at all.

---

## The checklist

### 1. Tools appear, and one call returns a real result
Start a native session on a **frontier cloud model** (Sonnet/Opus — the 20,000-token tool budget
tier). Ask it to echo something via the sandbox server.

- [ ] The model has `echo`, `add_numbers`, `slow_echo` available
- [ ] A call comes back with `sandbox echo: <your text>` — a real round trip, not a hallucinated one
- [ ] `add_numbers` with 2 and 40 returns `42`

**Why frontier:** on a small model the `bulky` server eats the budget and you won't be testing what
you think you are.

### 2. The tool card reads "Server: Action"
- [ ] The card renders something like **Sandbox: Echo**, not the raw `mcp__sandbox__echo`

This is `ToolCard.tsx:224` parsing the `mcp__{server}__{tool}` name. If it shows the raw string, the
naming contract broke.

### 3. Permission is per-tool, not per-server
- [ ] The **first** `echo` call prompts for permission
- [ ] Choose **Always allow**
- [ ] A **second** `echo` call does **not** prompt
- [ ] Now ask for `add_numbers` — **it must prompt again**

That last line is the actual test. The grant is an exact tool-string match, so one "always allow"
covers exactly one namespaced tool. If `add_numbers` sails through, the grant is too broad and that's
a security bug, not a convenience.

### 4. The budget gate drops a server on a small model
Swap to a **local model** (llama-server / Ollama / LM Studio — anything with a small context window).
Skip this step if you don't have one running; it's the one step with an external dependency.

- [ ] `sandbox`'s three tools are still there
- [ ] **`bulky`'s 20 `filler_*` tools are gone**

`bulky` is ~5,400 tokens against a 750- or 4,000-token budget, so it can't fit; `sandbox` is ~100
tokens and always fits. The walk stops at the first server that doesn't fit rather than skipping past
it, so the drop is all-or-nothing per server.

### 5. A broken server names the real failure
Edit `~/.youcoded/mcp.json`, set `broken`'s `"enabled"` to `true`, and start a **new** session.

- [ ] Something surfaces about the `broken` server failing
- [ ] The message names the **real** spawn failure (an ENOENT / "command not found" for
      `definitely-not-a-real-command`) — **not** a generic "MCP server failed to start"
- [ ] `sandbox` still works in that same session — one broken server must not take the others down

Set it back to `false` when you're done.

### 6. Projection into Claude Code — ✅ already verified, nothing for you to do

The dev app's startup reconcile ran and I diffed the result against the backup:

```
original keys: 59 -> now: 61
LOST: []
ADDED: ['mcpServers', '_youcodedOwnedMcpServers']
mcpServers: ['sandbox', 'bulky']
owned:      ['sandbox', 'bulky']
```

Nothing lost, nothing overwritten, and `broken` correctly excluded because it's disabled. (Seven
other keys did change — `numStartups`, `tipsHistory`, `pluginUsage` and friends — but those are
Claude Code's own churn from my running session, not the reconciler.) This is the step that could
have destroyed the file, so it's the one I checked myself rather than handing you.

If you want the end-to-end version: open a **new** Claude Code session and run `/mcp` — `sandbox`
and `bulky` should be listed there.

### 7. Optional — the call timeout
Ask the model to call `slow_echo` with `delay_seconds: 130` (over the 120s call timeout).

- [ ] After ~2 minutes the tool result reads *"Sandbox did not respond within 120000ms."* and the
      session keeps going rather than hanging forever

Slow and boring; skip it unless you want to see it. It's the defect that no test could catch, so
seeing it work once has some value.

---

## Both known issues are now FIXED on the branch (commit `3a0bd853`)

They were filed as ROADMAP follow-ups and then fixed before merge, so the two caveats that used to
live here no longer apply. **The dev instance you tested against predates the fix** — it was
launched before those commits, so if you want to re-check these two specifically, relaunch.

- ~~Resuming a session breaks its MCP tools.~~ `acquire()` now returns a lease instead of keying
  holders by session id, so two generations of one resumed session can't release each other's
  connections. Mutation-tested.
- ~~Cmd+Q leaves the MCP subprocess running.~~ Teardown now runs on all three quit routes
  (`window-all-closed`, `before-quit`, `SIGTERM`/`SIGINT`) instead of only the first.

**Two worth re-checking by hand**, because no automated test can cover them: resume a session with
MCP tools and confirm a tool call still works; and quit with Cmd+Q (or close the window) and confirm
`pgrep -f sandbox-mcp-server.js` finds nothing afterward.

## Cleanup when you're done

```bash
rm ~/.youcoded/mcp.json
pkill -f sandbox-mcp-server.js          # in case any survived a quit
```

Then start a native session once (or a Claude Code session) so the reconciler drops the now-unowned
entries back out of `~/.claude.json`. If anything looks wrong with that file, restore the backup:

```bash
cp /tmp/claude-1000/-home-destin-youcoded-dev/fb4c5ef0-8281-4ce4-a607-517eff19146c/scratchpad/claude.json.backup-20260805-211932 ~/.claude.json
```

The dev window shuts down on its own when you close it; tell me and I'll stop the Vite server on
5243 too.
