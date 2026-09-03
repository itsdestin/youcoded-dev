# files — documents the user opens, edits or organises
Filing test: documents the user opens, edits or organises — files panel, project files, the
git surface, and the per-chat record of which files a session produced. Not here: a
workspace guidance doc (dev-workspace); the transcript itself, or how it is titled, tagged,
searched or resumed (chat-data).

- [ ] Git view: a file whose name has a quote, a backslash or an accent (an accented filename
      is the common case) shows no status at all, whatever was changed; a filename containing
      a literal " => " displays as a rename
      `files-panel` `desktop` `confirmed` `checked 2026-09-01` `v1.3.1` → docs/active/investigations/2026-09-01-git-status-quoted-paths.md

- [ ] Git review: after amending or rebasing while "Show more" pages are open, the next "Show
      more" can silently skip commits until the review is reopened
      `files-panel` `desktop` `confirmed` `checked 2026-09-01` `v1.3.1` → docs/active/investigations/2026-09-01-git-review-show-more-after-rewrite.md

- [ ] Chat file chips: paste `/tmp/x.log` and `/tmp/x.txt` — only the second becomes a chip;
      `.log` `.sh` `.env` `.sql` `.toml` `Dockerfile` etc. render as dead grey text although the
      files pane opens them fine (Destin saw 3 of 8 test files miss, 2026-08-25)
      `chat` `all` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-chat-file-chip-allowlist.md

- [ ] Resume a Claude Code conversation: its files list has nothing from before the resume,
      only files the new turns touch (until 2026-08-27 the same defect showed as every resume
      re-recording all the files instead); native conversations are fine
      `files-panel` `desktop` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-resumed-cc-session-files-drawer.md

- [ ] Stutters when editing a file in the files pane, copying text out of a code block, or
      moving around an HTML preview (Destin, 2026-08-27) — still unmeasured; the perf-lab
      scenario for it now exists but has not been run against master
      `files-panel` `desktop` `needs-verify` `checked 2026-09-01` `performance` → docs/active/investigations/2026-09-01-artifact-viewer-spikes.md

- [ ] A file the agent wrote outside the project through a `../` path shows in the files list
      but can never be opened — refused as an orphan on every platform, never repaired
      `files-panel` `all` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-dotdot-artifact-records-unrepaired.md

- [ ] The per-project file-history record (`.youcoded/artifacts.json`) only ever grows — the
      workspace's own went 4.4 MB → 6.4 MB in twelve days — and a long-lived project gets
      slower to record and list files; two out-of-memory crashes were reachable through it
      `all` `confirmed` `checked 2026-09-01` `performance` → docs/active/investigations/2026-09-01-sidecar-versions-unbounded.md

- [ ] Files panel opens after a reply delivers a file but the file is not selected — the list
      shows instead; cosmetic, never data loss (one instance fixed 2026-08-25, the class remains)
      `files-panel` `all` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-artifact-list-replace-orphans-selection.md

- [ ] A dev instance's main process ran out of memory (~2.8 GB) after 73 minutes on 2026-08-26
      while ~15 subagents were rewriting files in the project it was watching; cause never
      determined. The same crash signature was diagnosed from a core dump the next day and
      fixed in youcoded PR #335, which probably covers this — not re-checked under that load
      `desktop` `needs-verify` `checked 2026-09-01` `needs-repro`

- [ ] HTML preview: fonts and background images referenced by `url()` inside a linked
      stylesheet do not load (the stylesheet itself is inlined; what it points at is not — a
      deliberate first-version cut, still in place)
      `files-panel` `all` `parked` `checked 2026-09-01`

- [ ] Git surface phase 2 — branch operations, push and PR creation, repo-wide review,
      hunk-level staging, an error state when a review fails to refresh, and plain-English
      text for raw error codes like `path-outside-project` (deferred from the per-file MVP)
      `files-panel` `desktop` `parked` `checked 2026-09-01`

- [ ] Git surface profiling checkpoint before it reaches Android or multi-window: a refresh
      spawns up to three git processes and re-runs on every file change in the project and
      every git change from any repo; plus fold the five copies of the "outside the project /
      not a repo" check into one helper (still five as of 2026-09-01)
      `files-panel` `desktop` `parked` `checked 2026-09-01` `performance`

- [ ] Go-to-definition / find-references in the code editor without a full language server
      (tree-sitter or ctags-grade indexing; runs in the Android WebView too, so desktop and
      phone stay the same) — the cheap alternative to the full LSP idea below
      `files-panel` `all` `parked` `checked 2026-07-20`

- [ ] Full language server — real diagnostics, hover types, rename-symbol. Almost certainly
      desktop-only (a phone cannot host language servers), which would fork the shared UI;
      do the tree-sitter item above first and see whether the remaining gap is worth it
      `files-panel` `desktop` `parked` `checked 2026-07-20`

- [ ] Project view: a Roadmap tab that renders any project's `ROADMAP.md`, discovered the
      same way as context files
      `projects` `all` `parked` `checked 2026-07-15`

- [ ] Saving from the files pane writes straight to disk and skips the same-machine write lock that
      Claude Code's Write/Edit go through — so a save from the pane can clobber a file another live
      session is editing, and vice versa
      `files-panel` `desktop` `needs-verify` `checked 2026-07-20`

- [ ] The Git Branch chip in the status bar is empty in native sessions — Claude Code's own status line
      is its only feed, so a native coder session in a repo shows nothing (Destin, 2026-08-25)
      `status-bar` `desktop` `needs-verify` `checked 2026-08-25`

- [ ] Editor tabs — open more than one file at a time in the files pane. Both hosts are strictly
      one-file-at-a-time today; the most-missed thing after syntax highlighting
      `files-panel` `all` `parked` `checked 2026-07-20`

- [ ] A real file tree in the files pane — what exists is a one-level-at-a-time folder browser; a
      tree also needs a directory-listing channel that does not exist yet
      `files-panel` `all` `parked` `checked 2026-07-20`

- [ ] Debugger / breakpoints — considered and declined (IDE table stakes, enormous effort, not this
      product's fight). On record only; revisit if the "open, personal Cowork" positioning is dropped
      `files-panel` `all` `parked` `checked 2026-07-20`

- [ ] The app holds roughly a quarter of a million file watches on its own; a second instance runs the
      machine out of watches and file watching fails with a "no space left" error that has nothing to
      do with disk. Which watcher is the greedy one is unconfirmed (project watcher is the recursive
      one). Worked around on Destin's machine only
      `desktop` `needs-verify` `checked 2026-08-26` `performance`

- [ ] Spreadsheets in the files pane are look-only: an `.xlsx` or `.csv` opens as a grid you can
      click around, but no cell can be typed into, and "Edit" on a `.csv` drops you into the raw
      comma-separated text instead of the grid (Destin expected in-grid editing, 2026-09-03;
      the promo video was filmed with the assistant doing the edits instead)
      `files-panel` `all` `confirmed` `checked 2026-09-03`
