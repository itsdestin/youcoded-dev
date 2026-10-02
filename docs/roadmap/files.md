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

- [ ] Comment times are only relative ("5h ago"): hovering one could show the exact date and
      time, a resolved comment could say when it was resolved (not possible for Word/Excel,
      which don't record it), and the assistant could see comment times when it reads them.
      Offered 2026-09-28, not chosen for the first version
      `files-panel` `all` `decision` `checked 2026-09-28`

- [ ] On the phone, an open comments panel does not update by itself when the file's comments
      change somewhere else (the assistant, another device, another app); reopening the file shows
      the change. Desktop and the web version update live. Destin: fine for now (2026-09-28)
      `files-panel` `android` `confirmed` `checked 2026-09-28`

- [ ] Saving a comment into a Word or Excel file keeps one backup copy per file, and those
      copies are never cleared out, so they pile up for every document ever commented on
      (re-checked 2026-10-02: still one rolling copy per file, kept in the app's backup folder
      under the user's home)
      `files-panel` `all` `confirmed` `checked 2026-10-02`

- [ ] "This file looks open in another app" (shown before a comment is saved into a Word or
      Excel file) can keep appearing for a file that is actually closed, after Word or Excel
      crashes and leaves its hidden marker file behind. (Long file names, whose marker Word names
      differently, are now recognised — fixed 2026-09-28.) Still true 2026-10-02: the code
      names a stale marker as a known, accepted limit
      `files-panel` `desktop` `confirmed` `checked 2026-10-02`

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
      list and open, they just do not live-refresh while Home is the project. SECOND CAUSE
      2026-09-29: sync's own watcher watched every file in folders that never sync (~249k on one
      Python project) — MERGED 2026-09-29 (youcoded#590). Re-measure the watch count on a
      fresh install (or with Home as the project) after both ship, then close
      `desktop` `needs-verify` `checked 2026-09-29` `performance`

- [ ] A `.csv` in the files pane is still look-only: it opens as a grid you can click around, but
      no cell can be typed into, and "Edit" drops you into the raw comma-separated text instead
      of the grid (Destin expected in-grid editing, 2026-09-03). An `.xlsx` is now edited in the
      Office editor on desktop once the add-on is installed (checked in code 2026-10-02: Edit
      hands `.xlsx`/`.docx`/`.pptx` to Office); on the phone and remote web it is still look-only
      `files-panel` `all` `confirmed` `checked 2026-10-02`

- [ ] A full office suite inside the app — Word/Excel/PowerPoint-class editing of documents,
      spreadsheets and slides, "almost on par with OnlyOffice or Microsoft Office", as its own
      pinned Office page, with the session and Project View file viewers getting a slimmer
      editor that can hand a file over to the full one (Destin, 2026-09-24). Investigation
      recommends borrowing OnlyOffice/Euro-Office's editors whole as a download-on-first-use
      add-on; licence route decided 2026-09-24: the app stays MIT and the editors ship as a
      separate AGPL add-on (Option A). Trial done 2026-09-27: all six real files opened and
      saved with nothing lost, themed cleanly, ran in the app's Electron; gaps are memory, a
      font bug and the phone layout. Next: design decks
      Would also resolve the look-only spreadsheet item above
      `files-panel` `all` `decision` `checked 2026-09-24` → docs/archive/investigations/2026-09-24-office-suite.md

- [ ] Office's Home tab can show an out-of-date Recent list: open a document, switch back to
      the Home tab without leaving the Office page, and the file you just opened is not yet
      listed — it appears only after leaving the page and coming back. Accepted for now in
      the Office build (the lists refresh each time the page is shown, not on a tab switch)
      `files-panel` `desktop` `confirmed` `checked 2026-10-02`

- [ ] Office isn't available on ARM Linux (Raspberry Pi, some newer Linux laptops) or on
      Windows on ARM: Word, Excel and PowerPoint files open with the default app there instead.
      The add-on is published for Linux x64, Mac (Intel and Apple silicon) and Windows x64 only
      (checked in the app's add-on pin 2026-10-02). No ready-made converter (x2t) exists for
      linux-arm64, so it would have to be built from Euro-Office/core source (about 1–2 days of
      build setup; Destin, 2026-10-01: ship without it for now, record the follow-up)
      `files-panel` `desktop` `confirmed` `checked 2026-10-02`

- [ ] On Mac and Windows, saving or opening an Office document that holds a picture given as a
      web address can still make the converter download it, outside the app's own picture checks
      (public addresses only, size cap). Linux blocks this by running the converter with no
      network (unshare); the converter ignores proxy settings, so Mac/Windows need their own
      no-network wrapper (macOS sandbox-exec is a candidate; Windows has no simple equivalent).
      Still true 2026-10-02: the no-network wrapper is Linux-only in the code
      `files-panel` `desktop` `confirmed` `checked 2026-10-02` `security`

- [ ] When the app quits or crashes in the middle of an Office save, a hidden leftover folder
      holding a copy of the document can stay beside it; it is cleaned up only by that file's
      next save, and only once it is over an hour old — opening the file does not clean it
      `files-panel` `desktop` `confirmed` `checked 2026-10-02`

- [ ] On Windows, the private folders an Office save and the editor's temporary files use
      rely on the parent folder's inherited permissions (the code sets no Windows-specific
      protection), so another account on the PC might read a document while it is being saved.
      Windows builds of Office now ship; whether another account can really read them is untested
      `files-panel` `desktop` `needs-verify` `checked 2026-10-02` `security`

- [ ] An unsaved text-file draft parked in a window that is not the last one open is lost
      without a question when that window is closed with its X (the unsaved-files question is
      only asked for the last window — checked in the close handler 2026-10-02)
      `files-panel` `desktop` `confirmed` `checked 2026-10-02`

- [ ] Restoring a kept version of an Office document that is open copies all of the document's
      pictures every time, even when nobody kept typing in the old version, which makes
      restores of picture-heavy files slower than they need to be
      `files-panel` `desktop` `confirmed` `checked 2026-10-02` `performance`

- [ ] In a rare case, a copy saved from an Office tab that was kept open across a restore can
      come out missing some of its pictures
      `files-panel` `desktop` `needs-verify` `checked 2026-10-02`

- [ ] Letting go of an Office tab's kept typing after a restore is done straight away instead
      of waiting its turn behind that document's other work, so it could remove pictures a
      "Save a copy…" still in progress needs (checked in code 2026-10-02: the release is not
      queued)
      `files-panel` `desktop` `confirmed` `checked 2026-10-02`

- [ ] If one project's file list hangs while loading on the Office page, pressing New can use up
      both of the page's file-list slots, so the next project's list can't load until the first
      finishes
      `files-panel` `desktop` `needs-verify` `checked 2026-10-02`

- [ ] When the Office page gives up listing a very large project's files, the "In <project>"
      section looks the same as a project with no Office files at all
      `files-panel` `desktop` `needs-verify` `checked 2026-10-02`

- [ ] Reloading the app window, or a crash of its page, leaves that page's open Office documents
      open in the background until the window itself closes (documents are let go only when the
      window is destroyed, not on a reload)
      `files-panel` `desktop` `needs-verify` `checked 2026-10-02`

- [ ] An error line from the Office editor can copy up to 300 characters of the document's text
      into the app's log file (checked in code 2026-10-02: the editor's error message is cut at
      300 characters, not cleaned)
      `files-panel` `desktop` `confirmed` `checked 2026-10-02` `security`

- [ ] Dropping a picture into an Office document from a web address is checked to be a public
      address first, but the download looks the address up a second time, so a site that
      answers the check with a public address and the download with a home-network one is not
      fully stopped; one disguise for private addresses (Teredo) is not unwrapped either
      (both noted in the code, 2026-10-02)
      `files-panel` `desktop` `confirmed` `checked 2026-10-02` `security`

- [ ] When the assistant adds, edits or deletes a comment in a Word or Excel file while that
      file's Office editor is not ready yet, the change waits and retries, but after 10 minutes
      (or 50 waiting changes for one file) it is thrown away with no message to anyone
      `files-panel` `desktop` `confirmed` `checked 2026-10-02`

- [ ] On a big Excel workbook (a 20 MB test sheet) typing freezes for about 2 seconds at each
      automatic save, and big documents hold their autosave back 3–20 seconds so typing
      doesn't stutter; the "Edited" label shows meanwhile. A crash in that window loses nothing
      (the recovery journal replays it), but the freeze itself was left as is
      `files-panel` `desktop` `needs-verify` `checked 2026-10-02` `performance`

- [ ] Pressing Ctrl+S while an automatic save is running can make the Office save label say
      "Saved" a moment before the file is really written (label only; found in the 2026-09-28
      review, not re-checked since the label became "Edited")
      `files-panel` `desktop` `needs-verify` `checked 2026-10-02`

- [ ] Printing or saving an Office document as a PDF goes through a different layout engine
      than the editor's page view, so a page can break in a different place than on screen
      (Word, PowerPoint); a PDF made from a spreadsheet can come out with blank pages past the
      page range chosen. Reported in the 2026-09-29/30 reviews, never re-measured
      `files-panel` `desktop` `needs-verify` `checked 2026-10-02`

- [ ] The Office editor's File tab sometimes lacks its Export entry right after a document
      opens (seen once in review, 2026-09-30)
      `files-panel` `desktop` `needs-verify` `checked 2026-10-02` `needs-repro`

- [ ] Dropping several pictures at once into an Excel sheet or a PowerPoint slide may stack them
      on top of each other; only Word was tried (2026-09-29)
      `files-panel` `desktop` `needs-verify` `checked 2026-10-02`

- [ ] In the Office editor, after applying Heading 1, the style gallery's dark tiles sometimes
      showed empty (seen in the dark theme once, 2026-10-01; not reproduced)
      `files-panel` `desktop` `needs-verify` `checked 2026-10-02` `needs-repro`

- [ ] PDF editing in Office: Euro-Office has a PDF editor (its sources include `pdfeditor` and
      `sdkjs/pdf`), but the trimmed build the add-on uses (euro-office-lite) does not build it,
      so PDFs still open read-only in the viewer. Destin, 2026-10-01: "can we add pdfs? i
      didn't realize onlyoffice/eurooffice already had pdf support", then "okay we will skip
      pdf for now". Estimated 2–4 days (build the PDF editor into the add-on, route `.pdf`
      through it, version history and saving)
      `files-panel` `desktop` `parked` `checked 2026-10-02`

- [ ] If the assistant or another program changes a Word/Excel/PowerPoint file while it is open
      in Office, Office's next autosave writes over that change without asking — Office does
      not watch the open file (only comments are routed into the open editor). Designed as the
      "on-disk-change conflict" (design §4a) and put off by the build plan to its own plan,
      which was never written
      `files-panel` `desktop` `confirmed` `checked 2026-10-02` → docs/archive/specs/2026-09-28-office-build-design.md

- [ ] Office opens only .docx, .xlsx and .pptx. Older .doc/.xls/.ppt files, OpenDocument
      (.odt/.ods/.odp) and .csv still open in the default app or the look-only viewer, though
      Save As can already write those formats. Designed (R21–R24, and the office-odf questions
      deck) and put off by the build plan to its own plan, never written
      `files-panel` `desktop` `confirmed` `checked 2026-10-02` → docs/archive/design/2026-09-27-office/office-odf.questions.json

- [ ] Every open Office document keeps its editor loaded, so memory grows with each one left
      open in a tab. The design's "tabs sleep after 20 minutes" (R8) was put off by the build
      plan and never built (the `asleep` flag is only set by screenshots)
      `files-panel` `desktop` `confirmed` `checked 2026-10-02` `performance`

- [ ] Office's editors only offer the fonts that ship with the add-on; fonts installed on the
      computer are not listed (only PDF export uses them). The design's user-fonts overlay was
      put off by the build plan and never built
      `files-panel` `desktop` `confirmed` `checked 2026-10-02`
