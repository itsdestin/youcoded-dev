# Tasks — a full to-do list as a YouCoded page

A Todoist / Google Tasks style task manager that runs as one YouCoded page with no connections:
it only reads and writes its own saved data, so it needs no approval card and works offline.

| File | What it is |
|---|---|
| `page.html` | **built** — the whole page, one document. Never edit by hand here; run `node pages/tasks/build.mjs` |
| `page.json` | name, description, its own icon |
| `page.md` | notes the page's assistant reads: the saved-data shape and how to change tasks |
| `src/core.js` | the rules, no screen: dates, typed shortcuts ("tomorrow 5pm p1 #Home @errands every week"), repeats, the saved shape and its repair |
| `src/ui-a.js` `ui-b.js` `ui-c.js` | the screens: lists and the task panel / the add box and everything that floats / clicks, keys, drag, start-up |
| `src/styles.css`, `src/shell.html` | the page's own look (controls are the kit's `.yc-*`), and the document the build fills |
| `tests/core.test.mjs` | `node --test pages/tasks/tests/` — the rules |
| `dev/preview.mjs` | frames the page like the app does (a built-in theme + the app's real kit + a stand-in for `window.youcoded`) for a browser |
| `dev/smoke.mjs` | clicks through every main journey in a headless browser: `node pages/tasks/dev/smoke.mjs --app <youcoded checkout> [--size 390x800]` |

Built against the page kit on `session/90-pages-finish` (2026-11-13). It uses only `window.youcoded.data`,
`save` and `onData`, which every released app has.

**Installing** means copying `page.html`, `page.json` and `page.md` into a Pages folder
(`~/YouCoded/Personal/Pages/tasks/`). Destin's real folder is watched by his running app and syncs to
his other devices — install there only with his yes.

Known limits, by design of pages today: reminders show only while the page is open (a page cannot
notify when closed); no sign-in sync with Todoist or Google; one level of sub-tasks.
