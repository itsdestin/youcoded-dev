# UI audit 2026-08-25 — screenshot evidence

- `gallery.html` — every captured surface, all themes side by side. Open the file in the
  app's file viewer or a browser. Names are `<batch>-<surface>`; the findings doc cites them.
- `images/` — the JPEG sheets the gallery shows (~15 MB, **git-ignored** on purpose, same
  convention as the perf-lab screenshots; they exist on the machine that ran the audit).
- Full-resolution PNG originals (~600, 1440×900 and 390×844) and the capture tooling live in
  `scratch/ui-audit-2026-08-25/` (git-ignored): `tools/shot.mjs` (raw-CDP screenshot
  driver; works against the UI Workbench or an Electron instance via `ATTACH_PORT`),
  `tools/plan*.json` (what was clicked), `tools/montage.sh`, `tools/contrast-report.mjs`
  (painted-pixel contrast probe), `tools/contrast-report.md` (its output).

Regenerate: `bash scripts/run-workbench.sh <worktree>` in one terminal, then
`CDP_PORT=9981 node scratch/ui-audit-2026-08-25/tools/shot.mjs <plan.json> <outDir> midnight,light,...`
and `bash tools/montage.sh <outDir> <montageDir>`. Batches: `plan.json` (main surfaces),
`plan2.json`/`plan3.json`/`plan6.json` (deeper + composer-driven), `plan-narrow3.json`
(phone width), `plan-tall.json` (full tool gallery), `plan-lat.json` (loading states),
`plan-e.json` (real Electron instance — launch it yourself with `--remote-debugging-port`).

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
