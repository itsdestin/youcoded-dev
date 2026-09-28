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

## Serving the editors for the workbench (design stage, 2026-09-28)

The Office mockups in the app's workbench frame the real editor from `http://127.0.0.1:4717`
(`fixtures/office.ts` → `OFFICE_EDITOR_ORIGIN`). To reproduce:

1. Build ranuts/document (above) and copy `dist/` to a scratch folder, e.g. `dist-yc/`. Keep it in the
   worktree's ignored `scratch/office-editor/`, not `/tmp`: a reboot on 2026-09-28 wiped the `/tmp` copy
   mid-review.
2. Add the theme bridge: copy `yc-bridge.js` into `dist-yc/` and insert
   `<script src="./yc-bridge.js"></script>` before the module script in `dist-yc/editor.html`.
3. Fix the font catalogue's Calibri entry (it has no bold face, so bold Calibri draws garbled
   glyphs): in `dist-yc/sdkjs/common/AllFonts.js` replace `["Calibri",115,0,-1,-1,-1,-1,-1,-1]`
   with Carlito's faces, `["Calibri",115,0,114,0,112,0,113,0]`. The real add-on regenerates
   the catalogue; this is the bug it must not reintroduce.
4. Put the three neutral fixtures (`make-samples.py`-style: Garden plan.docx, Garden
   budget.xlsx, Garden talk.pptx) in `dist-yc/samples/`.
5. `python3 serve-euro.py dist-yc` (serves `/editor`, unpacks nothing, adds the `br`
   header for the brotli-packed translator and CORS on `/samples/` for the fake file reader).

The bridge (`yc-bridge.js`) is the add-on side of the theming and slim-mode contract:
theme tokens → the editor's CSS variables and light/dark base; title row hidden; slim mode
hides all editor chrome; `yc:office-loaded` when the document is really drawn;
`yc:office-cmd` presses the editor's own toolbar button of that name; `yc:office-state`
reports which are on.
