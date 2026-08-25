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
