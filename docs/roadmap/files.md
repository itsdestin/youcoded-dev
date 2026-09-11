# files — documents the user opens, edits or organises
Filing test: documents the user opens, edits or organises — files panel, project files, the
git surface, and the per-chat record of which files a session produced. Not here: a
workspace guidance doc (dev-workspace); the transcript itself, or how it is titled, tagged,
searched or resumed (chat-data).

- [ ] A very large Markdown file still takes ~0.9 s to open — better than the ~1.5 s it was,
      but still a visible pause. What is left is the sheer number of elements syntax
      highlighting produces: the perf rig's 394 KB / 699-fence fixture renders as 108,576
      elements against 7,056 unhighlighted, and building them is now the whole cost
      (measured 2026-09-10 with `scripts/perf-lab/profile-open.mjs`). Skipping layout for
      off-screen code blocks and short-circuiting the path detector already took 1,487 ms →
      939 ms with nothing visibly changed. The remaining lever DOES change what the user
      sees, so it is Destin's call: stop colouring code in very large documents (est.
      ~300-400 ms, but a huge file's code reads as plain text while a normal file's stays
      coloured), or colour each block only as it scrolls into view (keeps colour everywhere;
      harder, because the filepath chips inside code blocks are added AFTER highlighting and
      a naive lazy pass would destroy them). Shared with the chat transcript, so any change
      has to be checked there too.
      NOTE for whoever picks this up: the old "a small Markdown file costs 570 ms" claim was
      WRONG and is withdrawn — that number was the rig's own probe forcing a layout on every
      poll. An ordinary Markdown file opens in ~60 ms
      `desktop` `confirmed` `checked 2026-09-10` `performance`

- [ ] The git badge under an open file can go stale the first time the assistant writes to
      a file that was opened straight from a path rather than picked out of the file list.
      Such a file is known by its path until the first write, which gives it a permanent id
      — and the change announcement carries the NEW id while the pane still holds the old
      one, so the footer treats its own file as somebody else's and skips the refresh.
      Found by review 2026-09-10 while narrowing which changes the footer listens to. Mostly
      hidden today behind a louder existing bug: the pane usually reloads wholesale a moment
      later and kicks the user back to the file list, which is the thing they would report.
      Fix the two together — the footer needs to learn a file's id can change under it
      `desktop` `confirmed` `checked 2026-09-10`

- [ ] Git view: a file whose name has a quote, a backslash or an accent (an accented filename
      is the common case) shows no status at all, whatever was changed; a filename containing
      a literal " => " displays as a rename
      `files-panel` `desktop` `needs-verify` `checked 2026-09-01` `v1.3.1` → docs/active/investigations/2026-09-01-git-status-quoted-paths.md

- [ ] Git review: after amending or rebasing while "Show more" pages are open, the next "Show
      more" can silently skip commits until the review is reopened
      `files-panel` `desktop` `confirmed` `checked 2026-09-01` `v1.3.1` → docs/active/investigations/2026-09-01-git-review-show-more-after-rewrite.md

- [ ] Chat file chips: paste `/tmp/x.log` and `/tmp/x.txt` — only the second becomes a chip;
      `.log` `.sh` `.env` `.sql` `.toml` `Dockerfile` etc. render as dead grey text although the
      files pane opens them fine (Destin saw 3 of 8 test files miss, 2026-08-25)
      `chat` `all` `needs-verify` `checked 2026-09-01` → docs/active/investigations/2026-09-01-chat-file-chip-allowlist.md

- [ ] A file chip in chat for a file that exists but lives outside the project folder (Claude
      named a document in Destin's notes repo) fails with "Couldn't open README.md — the file
      wasn't found in this project", and the chip shows only the bare filename so two READMEs
      look identical; the same click on a project file works (Destin, 2026-09-03)
      `chat` `desktop` `needs-verify` `checked 2026-09-03`

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
