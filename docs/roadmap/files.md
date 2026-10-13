# files — documents the user opens, edits or organises
Filing test: documents the user opens, edits or organises — files panel, project files, the
git surface, and the per-chat record of which files a session produced. Not here: a
workspace guidance doc (dev-workspace); the transcript itself, or how it is titled, tagged,
searched or resumed (chat-data).

- [ ] v1.3.1 release blocker: searching a big project stops early, for file names and for text inside files.
      (a) File search stops at the first 2,000 files with "This folder is large — showing the first batch of
      files", and counts read "2,000+" (Destin, 2026-09-18: "i just want everything to work, even if it
      requires a smidge more backend work"). Folder browsing at any depth is already fixed; the remaining work
      is one background helper that keeps a list of every file per project, kept fresh, so search and counts
      cover everything and fill in progressively. Four questions for Destin come first (spec "Open questions"
      2–4: excluded folders, "still looking" wording, background indexing of a home folder).
      (b) Text search inside files stops at 200 matches ("200+") with no way to see the rest. Wanted: matches
      stream in, more load as you scroll, and an unfinished search says it is still looking, not "no results".
      `projects` `desktop` `confirmed` `P1` `checked 2026-09-18` `v1.3.1` → docs/active/specs/2026-09-18-project-files-background-index.md

- [ ] Files: five ways work can be silently lost.
      (a) An unsaved text-file draft in a window that is not the last one open is lost without a question when
      that window is closed with its X. (b) If the assistant or another program changes a Word/Excel/PowerPoint
      file while it is open in Office, Office's next autosave writes over the change without asking; the planned
      fix was never written (design: docs/archive/specs/2026-09-28-office-build-design.md §4a).
      (c) When the assistant adds, edits or deletes a comment in a Word/Excel file while Office is not ready,
      the change is thrown away after 10 minutes (or 50 waiting changes) with no message.
      (d) Closing an Office tab's kept typing after a restore can remove pictures a "Save a copy…" still in
      progress needs. (e) In a rare case, a copy saved from an Office tab kept open across a restore comes out
      missing some pictures (not yet confirmed).
      `desktop` `confirmed` `P1` `checked 2026-10-02`

- [ ] Office: four safety and privacy edge cases.
      (a) On Mac and Windows, an Office document holding a picture given as a web address can make the converter
      download it outside the app's own checks; only Linux blocks this. (b) On Windows, the private folders for
      saving and temporary files rely on inherited permissions, so another account on the PC might read a
      document mid-save (untested). (c) An Office editor error line can copy up to 300 characters of the
      document's text into the app's log. (d) A picture dropped from a web address is checked as public, but the
      download looks it up again, so a site could still point it at a home-network address; one disguise
      (Teredo) is not unwrapped either.
      `files-panel` `desktop` `confirmed` `P2` `checked 2026-10-02` `security`

- [ ] Office editor: seven small faults.
      (a) The Home tab's Recent list is out of date until you leave the Office page and return. (b) When the
      Office page gives up listing a very large project's files, "In <project>" looks like a project with no
      Office files. (c) Ctrl+S during an automatic save can make the label say "Saved" a moment early. (d) A
      printed or PDF-saved document can break pages differently than on screen; a spreadsheet PDF can have blank
      pages past the chosen range. (e) The File tab sometimes lacks its Export entry just after opening (seen
      once). (f) Dropping several pictures at once into Excel or PowerPoint may stack them (only Word tried).
      (g) After applying Heading 1, the style gallery's dark tiles once showed empty (seen once).
      `files-panel` `desktop` `confirmed` `P3` `checked 2026-10-02` `needs-repro`

- [ ] Office saving: four leftovers and stale warnings.
      (a) Saving a comment into a Word/Excel file keeps one backup per file, never cleared, so they pile up.
      (b) "This file looks open in another app" can keep appearing for a closed file after Word or Excel crashes
      and leaves its hidden marker (accepted limit). (c) If the app quits mid-save, a hidden leftover folder with
      a copy of the document stays beside it until that file's next save, and only once over an hour old.
      (d) Reloading the app window, or a crash of its page, leaves its open Office documents open in the
      background until the window closes.
      `files-panel` `all` `confirmed` `P3` `checked 2026-10-02`

- [ ] File viewer gaps: four things Office and the viewer do not cover.
      (a) A `.csv` is look-only: no cell can be typed into, and "Edit" opens raw comma text instead of the grid
      (Destin expected in-grid editing, 2026-09-03); `.xlsx` is look-only on phone and remote web.
      (b) Office opens only .docx/.xlsx/.pptx; older .doc/.xls/.ppt, OpenDocument and .csv open in the default
      app or the look-only viewer (design: docs/archive/design/2026-09-27-office/office-odf.questions.json).
      (c) Office's editors offer only the add-on's fonts, not ones installed on the computer.
      (d) Office is not available on ARM Linux or Windows on ARM (no converter exists; about 1–2 days to build;
      Destin, 2026-10-01: ship without it for now).
      `files-panel` `all` `confirmed` `P3` `checked 2026-10-02`

- [ ] Document comments: two gaps.
      (a) Comment times are only relative ("5h ago"): hovering could show the exact time, a resolved comment
      could say when it was resolved (not possible for Word/Excel), and the assistant could see comment times
      (offered 2026-09-28, not chosen for the first version). (b) On the phone, an open comments panel does not
      update when comments change elsewhere; reopening the file shows them (Destin: fine for now).
      `files-panel` `all` `confirmed` `P3` `checked 2026-09-28`

- [ ] A file chip in chat for a file outside the project folder fails with "Couldn't open README.md — the file
      wasn't found in this project", and the chip shows only the bare filename so two READMEs look identical.
      The same click on a project file works (Destin, 2026-09-03, a document in his notes repo).
      `chat` `desktop` `needs-verify` `P3` `checked 2026-09-03`

- [ ] Parked ideas: files pane and editor (nine things).
      (a) HTML preview: fonts and background images referenced inside a linked stylesheet do not load.
      (b) Git surface phase 2: branch operations, push and PR creation, repo-wide review, hunk-level staging, an
      error state when a review fails to refresh, plain-English text for raw error codes.
      (c) Go-to-definition / find-references in the code editor without a full language server. (d) Full language
      server (diagnostics, hover types, rename); likely desktop-only, so do (c) first. (e) Project view: a
      Roadmap tab that shows a project's `ROADMAP.md`. (f) Editor tabs: more than one file open at once.
      (g) A real file tree in the files pane, not a one-level browser. (h) Debugger / breakpoints: declined,
      on record only. (i) PDF editing in Office: PDFs open read-only; 2–4 days to build in (Destin, 2026-10-01:
      "okay we will skip pdf for now").
      `all` `parked` `P3` `checked 2026-07-15`
