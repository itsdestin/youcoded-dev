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
last_verified: 2026-09-05
verify:
  - path: scripts/verify.sh
  - path: scripts/ast-grep/check.sh
  - path: youcoded/desktop/tests/ipc-channels.test.ts
---

# Searching large files

**Search the working branch, then read only the relevant range.** Use the absolute
worktree paths returned by `workspace-start` for file tools and run shell queries from
that worktree. A result from another checkout is not evidence about this branch.

| Question | Tool |
|---|---|
| "Where is this name / IPC channel / CSS class?" | Branch-local Grep (`literal: true`) or `rg -n -F 'exact text' <repo>` |
| "Where does this call / declaration / implementation shape occur?" | `ast-grep` with the appropriate language and worktree root |
| "What does this function do?" | Locate it with Grep/`rg`, then focused Read (`offset` + `limit`) |
| "Who calls this?" | Search the name and imports repo-wide, inspect candidate call sites; follow aliases/re-exports rather than treating text hits as a resolved call graph |
| "Is it dead / correctly typed / in parity?" | Verdict tools: `npm run knip`, `tsc --noEmit`, `ipc-channels.test.ts` |

Stop as soon as the question is answered. Whole-file reads are for files you need to
edit, not initial orientation; even before editing a large file, prefer focused ranges.
Delegate broad sweeps to a read-only search subagent and ask for paths and evidence,
not full-file dumps.

## Search scope is part of the answer

- Search repo-wide before narrowing. For cross-platform questions include both
  `desktop/` and `app/`; for cross-repo questions search each relevant sub-repo explicitly
  (the workspace ignores its sub-repo directories).
- Quote shell patterns and globs. Default ignores and hidden-file filtering can hide a
  relevant file; use explicit paths or deliberate `--hidden`/`--no-ignore` scope when needed.
- Text hits include comments and strings, and miss renamed imports or dynamic calls.
  A zero-hit query is not proof of dead code or an absent Android mirror. Verify the
  search scope, inspect candidates, and use the relevant verdict tool.
- Run `bash scripts/verify.sh <app-worktree>` for desktop branch verification
  (types, related tests and guards, knip, lint, ast-grep). Read its output: a green
  exit does not erase warnings, and Android/worker need their own verification.

Search recipes and executable invariants: `docs/code-intelligence.md`.
