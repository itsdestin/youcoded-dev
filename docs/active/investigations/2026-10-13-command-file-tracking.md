---
title: Files made, changed or deleted by commands never reach "made by Claude"
status: active
date: 2026-10-13
---

# What happens today

A Word file Claude built by running a script (Bash → `node make.js`) never appeared in the session's
files list and was not marked as Claude's. The per-chat record is fed only by file-tool calls:

<!-- claim: {"path": "youcoded/desktop/src/renderer/state/artifact-tool-use-tracker.ts", "contains": "TRACKED_TOOLS"} -->
- `renderer/state/artifact-tool-use-tracker.ts` — `TRACKED_TOOLS` is Write/Edit/MultiEdit/Read/SendUserFile;
  Bash is never inspected (NotebookEdit is not tracked either).
- `main/artifacts/project-watcher.ts` sees every add/edit/remove but labels all of it `by: 'external'` on
  purpose — it cannot tell who wrote a file. Its events only make the drawer reload the tracked list.
- Office files (docx/xlsx/pptx/pdf) are almost always produced this way, so the gap hits documents hardest.

# Options weighed (none chosen — Destin parked it 2026-10-13)

1. **Command time window.** The app knows when each command starts and ends; credit watcher changes inside
   that window. All platforms, both runtimes, catches deletions. Weak: the user's own saves during the
   window, programs that keep writing after the command, folders outside the watch (home folder is
   watched only 2 levels deep), and install clutter (needs filtering). Honest label: "changed while
   Claude was working", not "made by Claude".
2. **Wrap every command and record what its programs touch.** Claude Code has `CLAUDE_CODE_SHELL_PREFIX`
   (present in the installed binary, 2026-10-13); the native runtime runs Bash itself
   (`main/harness/tools/bash.ts`). Exact attribution anywhere on disk. Cost: slower commands (installs
   noticeably); precise tracing is practical on Linux only — macOS blocks it for system binaries, Windows
   needs admin tooling; Android unchecked.
3. **OS-level monitoring** (fanotify/eBPF, macOS Endpoint Security, Windows minifilter) — needs root,
   admin or Apple entitlement; not viable for a downloaded app.

Recommendation at the time: 1 everywhere with the honest label and helper-folder filtering, 2 on Linux later.
New feature, so it goes through the feature flow (questions deck first: label wording, what to filter).
