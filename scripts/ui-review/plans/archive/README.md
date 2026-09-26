# Archived screenshot plans

One-off plans from past design rounds: before/after captures, numbered review rounds
(`-r2`…`-r6`), design variants that were decided (`games-board-*`, `games-chess-*`,
`pages-floating`, `pages-layouts`), and plans that duplicated a screen another plan owns.
Archived 2026-09-26 with Destin's approval (docs/active/specs/2026-09-24-shoot-and-explore.md).

The rest of the old sweep's plans joined them when that sweep was retired (2026-09-26, spec
phase 6): every screen they photographed is a named screen now (`shoot --list`), and the paths
that mattered are journeys (`youcoded/desktop/tests/journeys/`). Only `plans/site-gallery.json`
still runs, for the landing page's gallery (`site-assets.sh`). Nothing here runs by default. Any one still
runs by name: `node scripts/ui-review/shot.mjs scripts/ui-review/plans/archive/<name>.json <out>/shots-<name>`.
Screens that are still wanted live on the app's screen list instead (`shoot --list`).
