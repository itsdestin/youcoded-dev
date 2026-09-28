---
date: 2026-09-27
status: active
type: prototype
topic: Throwaway trial rig for the office-suite investigation — OnlyOffice editors (via ranuts/document) framed cross-origin, opened/saved real files, timed, themed, and run under YouCoded's Electron
---

# Office trial rig (throwaway)

Results live in `docs/active/investigations/2026-09-24-office-suite.md` → "Trial results".
These scripts are kept so the real build can re-run the same checks against its own add-on.

**Setup used:** `ranuts/document` at `1301bb8` (2026-09-12), built with `pnpm run build`,
served by `vite preview` on 127.0.0.1:4717; `host.html` served on 127.0.0.1:4718 (a second
origin, standing in for the app). Browser: Playwright's Chromium 1243. Electron 41.10.7
(YouCoded's) for `electron-main.cjs`, hidden window, throwaway `userData`.
Paths inside the scripts point at the session scratchpad; change `S` to re-run.

| Script | Checks |
|---|---|
| `host.html` | The stand-in app page: frames the editor from another origin; postMessage only |
| `trial.mjs` | Open → type a marker → save each sample; writes saved copies |
| `compare.py` | Original vs saved: paragraphs, tables, images, formulas, every numeric value, slides |
| `measure.mjs` | Time until the document is visible; memory above an empty browser |
| `theme.mjs` | Repaints the editor with a YouCoded theme's tokens (`--background-toolbar` etc.); phone size with `390x844` |
| `electron-main.cjs` | Serves the editor from a private `office://` scheme under YouCoded's Electron |

The sample files were copies of Destin's own documents and are NOT in the repo.
