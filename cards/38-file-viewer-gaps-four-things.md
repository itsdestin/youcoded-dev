---
id: 38
title: File viewer and files pane: missing file kinds and ideas
stage: planning
priority: P3
tags: files, files-panel, feature
branch: 38-file-viewer-gaps-four-things
roadmap: files: File viewer gaps: four things Office and the viewer do not c
created: 2026-10-15
summary: Some file kinds don't fully open or edit (csv grids, older Office formats, your fonts), plus ideas for the files pane and editor.
area: Files & documents
side: both
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (files, status confirmed, seen on all, last checked 2026-10-02)
File viewer gaps: four things Office and the viewer do not cover. (a) A `.csv` is look-only: no cell can be typed into, and "Edit" opens raw comma text instead of the grid (Destin expected in-grid editing, 2026-09-03); `.xlsx` is look-only on phone and remote web. (b) Office opens only .docx/.xlsx/.pptx; older .doc/.xls/.ppt, OpenDocument and .csv open in the default app or the look-only viewer (design: docs/archive/design/2026-09-27-office/office-odf.questions.json). (c) Office's editors offer only the add-on's fonts, not ones installed on the computer. (d) Office is not available on ARM Linux or Windows on ARM (no converter exists; about 1–2 days to build; Destin, 2026-10-01: ship without it for now).

Merged in #42 "Ideas for the files pane and editor (nine)"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (files, status parked, seen on all, last checked 2026-07-15)
Parked ideas: files pane and editor (nine things). (a) HTML preview: fonts and background images referenced inside a linked stylesheet do not load. (b) Git surface phase 2: branch operations, push and PR creation, repo-wide review, hunk-level staging, an error state when a review fails to refresh, plain-English text for raw error codes. (c) Go-to-definition / find-references in the code editor without a full language server. (d) Full language server (diagnostics, hover types, rename); likely desktop-only, so do (c) first. (e) Project view: a Roadmap tab that shows a project's `ROADMAP.md`. (f) Editor tabs: more than one file open at once. (g) A real file tree in the files pane, not a one-level browser. (h) Debugger / breakpoints: declined, on record only. (i) PDF editing in Office: PDFs open read-only; 2–4 days to build in (Destin, 2026-10-01: "okay we will skip pdf for now").
