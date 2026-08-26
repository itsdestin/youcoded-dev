# UI audit 2026-08-25 — screenshot evidence

- `gallery.html` — every captured surface, all themes side by side. Open the file in the
  app's file viewer or a browser. Names are `<plan>-<surface>` (`main-`, `overlays-`,
  `narrow-`, `tall-`, `latency-`, `marketplace-` from the workbench sweep; `live-` and
  `e-` from the real app); the findings doc cites them. `marketplace-*` exists because
  youcoded PR #326 gave the workbench registry data — before that those surfaces were
  empty in every theme.
- `coverage.md` — machine-generated: which planned surfaces were verified in which themes
  (103 of 104; "Known Issues" opens an external link). `contrast.md` — the painted-pixel
  contrast probe's raw output (over-reports on glass themes; read, don't paste).
- `images/` — the JPEG sheets the gallery shows (~13 MB, **git-ignored** on purpose, same
  convention as the perf-lab screenshots; they exist on the machine that ran the audit).
- Full-resolution PNG originals live in `scratch/ui-review-2026-08-25/` (workbench sweep)
  and `scratch/ui-audit-2026-08-25/shots-e*/` (real app), both git-ignored.

**Regenerate everything:** `bash scripts/ui-review/run-review.sh <worktree>` (≈15 min), then
copy `sheets/*.jpg` here and run `python3 scripts/ui-review/make-gallery.py images gallery.html`.
The real-app plans need the dev instance described in `scripts/ui-review/README.md`.

## Second pass (later on 2026-08-25)

The capture driver was rebuilt to verify itself (`scripts/ui-review/shot.mjs`); every
surface listed below as "not captured" was then captured and verified in all six themes —
the `overlays-*` sheets — and a live session on the real app produced the `live-*` sheets.
`coverage-second-pass.md` is the machine-generated record (39 covered, 2 real-app shots
that had nothing to open). The section below is kept as history.

## Not captured by the FIRST rig (pulled from the gallery 2026-08-25)

A pixel-diff found sheets that were really just the parent screen because the click or
keystroke missed. They were removed so nothing here is mislabelled. **No finding rests on
them.** Surfaces still unreviewed as a result: right-click context menus (chat, session tab,
composer, file row); close-session prompt; expanded "thinking" block; Shift session switcher;
composer attachments; context pill; theme-cycle editor; first-run wizard; a permission prompt
inside a chat transcript; the stalled-turn card; Projects "Add project" and project-detail
overlays; Development → Report a bug / Contribute sub-screens; Model Providers → OpenRouter
and Local tabs (the dialog itself was captured); workbench Marketplace detail/filter overlays
(the real-app pass covers plugin detail). The `scenario-refused/no-providers/stress` sheets
were also dropped — those scenarios change resume/permissions data, not the transcript, so
they are identical to home by design. The Terminal view is blank in the workbench (no PTY)
and is not a finding.
