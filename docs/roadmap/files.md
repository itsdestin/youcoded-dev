# files — documents the user opens, edits or organises
Filing test: documents the user opens, edits or organises — files panel, project files, the
git surface, and the per-chat record of which files a session produced. Not here: a
workspace guidance doc (dev-workspace); the transcript itself, or how it is titled, tagged,
searched or resumed (chat-data).

- [ ] **v1.3.1 release blocker.** Searching a big project's files still stops at the first
      2,000 files and says "This folder is large — showing the first batch of files", and the
      file counts read "2,000+" (Destin, 2026-09-18: "i just want everything to work, even if
      it requires a smidge more backend work"). Browsing any folder at any depth was fixed
      first (Stages 0–1 of the spec); this is Stage 2: one shared background helper, off the
      app's main thread, that keeps a saved, disposable list of every file per project, kept
      fresh by watching for changes plus periodic re-checks, so name/type search and counts
      cover the whole project, fill in progressively, and show rough-then-exact counts. Four
      questions for Destin come first (spec "Open questions" 2–4: can excluded folders be
      searched, wording for "still looking" and rough counts, whether a home folder is
      indexed in the background by default)
      `projects` `desktop` `confirmed` `checked 2026-09-18` `v1.3.1` → docs/active/specs/2026-09-18-project-files-background-index.md

- [ ] **v1.3.1 release blocker.** Searching inside files' text in a project stops at 200
      matches (20 per file, 5 seconds) and shows "200+", with no way to see the rest.
      Stage 3 of the same spec: make that search cancellable and progressive — matches stream
      in, more load as you scroll, and an unfinished search says it is still looking instead
      of "no results". Builds on the Stage 2 item just above
      `projects` `desktop` `confirmed` `checked 2026-09-18` `v1.3.1` → docs/active/specs/2026-09-18-project-files-background-index.md

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

- [ ] A file chip in chat for a file that exists but lives outside the project folder (Claude
      named a document in Destin's notes repo) fails with "Couldn't open README.md — the file
      wasn't found in this project", and the chip shows only the bare filename so two READMEs
      look identical; the same click on a project file works (Destin, 2026-09-03)
      `chat` `desktop` `needs-verify` `checked 2026-09-03`

- [ ] Stutters when editing a file in the files pane, copying text out of a code block, or
      moving around an HTML preview (Destin, 2026-08-27) — still unmeasured; the perf-lab
      scenario for it now exists but has not been run against master
      `files-panel` `desktop` `needs-verify` `checked 2026-09-01` `performance` → docs/active/investigations/2026-09-01-artifact-viewer-spikes.md

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

- [ ] Editor tabs — open more than one file at a time in the files pane. Both hosts are strictly
      one-file-at-a-time today; the most-missed thing after syntax highlighting
      `files-panel` `all` `parked` `checked 2026-07-20`

- [ ] A real file tree in the files pane — what exists is a one-level-at-a-time folder browser.
      The data is already there (the whole-folder listing the Project View's file list reads,
      recursive with relative paths); what is missing is the tree itself
      `files-panel` `all` `parked` `checked 2026-09-16`

- [ ] Debugger / breakpoints — considered and declined (IDE table stakes, enormous effort, not this
      product's fight). On record only; revisit if the "open, personal Cowork" positioning is dropped
      `files-panel` `all` `parked` `checked 2026-07-20`

- [ ] The app held roughly a quarter of a million file watches on its own (measured 2026-08-26); a
      second instance ran the machine out of watches and file watching failed with a "no space
      left" error that has nothing to do with disk. The project watcher stopped walking nested
      repos and worktrees on 2026-09-10 (9,583 directories under this workspace alone). CAUSE
      FOUND 2026-09-16 (smoothness sweep C9): the "Home" project a fresh install seeds when no
      folder is saved watched the whole home folder six levels deep with no directory cap —
      Documents, Downloads, Pictures, every non-repo tree. MERGED 2026-09-16 (youcoded#501):
      the home folder itself is watched two levels deep (`watchDepthFor`); deeper files still
      list and open, they just do not live-refresh while Home is the project. Re-measure the
      watch count on a fresh install (or with Home as the project) after the next release,
      then close
      `desktop` `needs-verify` `checked 2026-09-16` `performance`

- [ ] Spreadsheets in the files pane are look-only: an `.xlsx` or `.csv` opens as a grid you can
      click around, but no cell can be typed into, and "Edit" on a `.csv` drops you into the raw
      comma-separated text instead of the grid (Destin expected in-grid editing, 2026-09-03;
      the promo video was filmed with the assistant doing the edits instead)
      `files-panel` `all` `confirmed` `checked 2026-09-03`
