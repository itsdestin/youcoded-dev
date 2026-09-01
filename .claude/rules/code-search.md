---
paths:
  - "**/desktop/src/main/ipc-handlers.ts"
  - "**/desktop/src/main/remote-server.ts"
  - "**/desktop/src/main/main.ts"
  - "**/desktop/src/main/preload.ts"
  - "**/desktop/src/main/harness/harness-session.ts"
  - "**/desktop/src/renderer/App.tsx"
  - "**/desktop/src/renderer/remote-shim.ts"
  - "**/desktop/src/renderer/state/chat-reducer.ts"
  - "**/desktop/src/renderer/components/SettingsPanel.tsx"
  - "**/desktop/src/renderer/components/SyncPanel.tsx"
  - "**/desktop/src/renderer/components/ResumeBrowser.tsx"
  - "**/desktop/src/renderer/components/StatusBar.tsx"
  - "**/desktop/src/shared/types.ts"
last_verified: 2026-08-05
verify:
  - path: youcoded/.serena/project.yml
    contains: "read_only: true"
  - path: .mcp.json
    contains: "youcoded-dev/youcoded"
  - path: youcoded/desktop/tests/tsconfig.json
    contains: "include"
---

# Searching the god-files

You are touching one of the 13 files over ~1,300 lines. Reading one whole costs **~10x
the entire always-on CLAUDE.md** (`ipc-handlers.ts` is 3,906 lines, `App.tsx` 3,679).

**Query the symbol, don't read the file.** Serena returns one function body or a file's
shape instead of 4,000 lines · Reading is the dominant cost of every task here · guard:
none — candidate.

| Question | Tool |
|---|---|
| "What's in this file?" | `get_symbols_overview` |
| "Show me one function" | `find_symbol` (`name_path_pattern`, `depth: 0`) |
| **"Who calls this?"** | `find_referencing_symbols` — resolved, no comment/string noise |
| "Who implements this interface?" | `find_implementations` |
| "Type errors in just this file?" | `get_diagnostics_for_file` |

Whole-file reads are for files you are about to **edit**, not files you are trying to
**understand**.

## Serena answers about `master`, not your branch

The server is pinned to `--project youcoded-dev/youcoded` — the **main checkout** — and
resolves every `relative_path` against that one root (`project.py:230`), rejecting paths
outside it. Your worktree is invisible to it. A query for `desktop/src/foo.ts` while you
work in `worktrees/chatsearch/` silently returns **master's copy**.

So: **use it for orientation and reference-finding on code that already exists on
master. Never to check your own branch's changes.** For branch truth use
`bash scripts/verify.sh` (tsc + vitest + knip + ast-grep) — that reads the real tree.

It is **read-only** (`read_only: true`, 7 tools exposed). That is deliberate: an edit
tool would have written to the main checkout while you believed you were in a worktree.
Edit with the normal Edit tool · why: see the WHY block in `youcoded/.serena/project.yml`.

## When it is the wrong tool

- **Kotlin / `app/**`** — not indexed at all (Kotlin LS is off; a failure would disable
  *every* Serena tool). Cross-platform parity is `desktop/tests/ipc-channels.test.ts`.
- **String-keyed things** — IPC channel names, CSS classes, theme tokens. `ipcMain.handle('foo')`
  has no symbol named `foo`. Use `rg`. Never `find_symbol` with `depth: 1` on
  `registerIpcHandlers` — it returns ~250 anonymous callbacks and a large bill.
- **Other sub-repos** — `wecoded-marketplace/`, `wecoded-themes/`, `youcoded-core/` are
  unreachable (no `activate_project` in this build). `rg`/`ast-grep` only.
- **"Is this dead?"** — prefer `npm run knip`, which returns a verdict and reads its own
  config. Serena reports "no references" identically whether it searched or never looked;
  a file outside a `tsconfig.json` program is a **silent false negative**.

Depth, install recipe, and the full boundary list: `docs/code-intelligence.md`.

## When Serena is and is not the right tool
Measured 0 uses across 46 sessions while this lived in `CLAUDE.md` (2026-08-28 study §3),
so it moved here, where it loads only when you are in a file that raises the question.

- **Pinned to the main checkout (`youcoded/`), resolving every path against that root — it CANNOT see your worktree** and will silently answer with master's copy. Never use it to check your own branch; branch truth is `bash scripts/verify.sh`.
- **Read-only on purpose** — an edit tool would have written to the main checkout mid-worktree.
- **Not for:** Kotlin / `app/**` (unindexed), other sub-repos (unreachable), string-keyed things like IPC channels or CSS classes (use `rg`), or "is this dead" — `npm run knip`, because Serena reports "no references" identically whether it searched or never looked.
- Depth: `docs/code-intelligence.md`.
