# Tasks — a full to-do list as a YouCoded page

A full task manager that runs as one YouCoded page with no connections:
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

## Where this stands (2026-11-25)

**Finished and parked; not published.** Work item **#285** ("Fill the marketplace with ready-made
pages") owns what happens next: once the Pages work (#90) has built the improved page sharing, Tasks
is published to the marketplace through it, alongside other ready-made pages. Destin's decision
(2026-11-25): it is marketplace content, **not** a page built into the app and **not** a special
"starter page" with its own update rules; updates come from the sharing system.

- It uses only `window.youcoded.data`, `save` and `onData` and the kit's `.yc-*` classes. Checked
  against the kit on youcoded master (`4c6ac0055`) and on `session/90-pages-finish`.
- Destin has it hand-installed as a personal page (`~/YouCoded/Personal/Pages/tasks/`, copied
  2026-11-25 from this branch). That copy holds his real tasks in `data.json`; it does not update
  itself when this source changes.
- Proven: 18 rule tests; `dev/smoke.mjs` journeys at desktop and 390x800; and by hand in a dev copy
  of the app (typing a task saves to disk, outside changes to `data.json` redraw live, data survives
  page reopen, window reload and app restart, Midnight and Creme themes, 400px width). That in-app
  run used throwaway browser-debugger scripts that were not kept.
- Not proven: dragging with a real mouse or finger (simulated drag passes), the assistant editing
  tasks in a live chat, wallpaper themes, Android, two devices syncing.

**Installing** means copying `page.html`, `page.json` and `page.md` into a Pages folder. Destin's
real folder is watched by his running app and syncs to his other devices; install or re-copy there
only with his yes, and never overwrite its `data.json`.

## Known limits

- Reminders show only while the page is open (a page cannot notify when closed).
- No sync with other to-do services; no month calendar; one level of sub-tasks.
- Touch dragging is unreliable; the "Move to…" menu is the dependable way to move a task.
- A title like "Sunday roast recipe" is read as due Sunday.
- On a phone the board's header takes three lines.
- Unchecked: whether "Move to…" still offers "no section" when the board hides that empty column.

## Offered and turned down by Destin (do not re-propose without a new reason)

Quick Today/Tomorrow buttons on overdue rows; timed tasks sorted first; renaming "Filters & labels";
search match hints.

## Wording

Do not name other companies' to-do products in this page, its notes or anything public about it.
