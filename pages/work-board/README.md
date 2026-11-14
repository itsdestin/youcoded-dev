# Work board — Destin's own YouCoded page for every piece of work

The management page (Today, Screens, Big picture) as a YouCoded Page in Destin's personal Pages folder.
Decided 2026-10-16 (`docs/archive/design/2026-10-16-manage-page/work-cards-next.questions.answers.json`):
his own page, not built into the app, using only abilities any page can ask for.

| File | What it is |
|---|---|
| `page.json` | name, icon, and the three permissions: see and change chats, run `work-items.mjs`, start a conversation |
| `page.html` | a shell: asks the program for the page and puts it in place |
| `work-items.mjs.template` | the program; `scripts/install-work-board.mjs` writes it as `work-items.mjs` with this workspace's path |
| `renderer/` | draws the page (`build.py --page-mode`), from the items in `cards/`; the design record (decks, answers, reviews) stays in `docs/archive/design/2026-10-12-management-surface/` |

The program's logic is `scripts/work-items-program.mjs` (tests beside it): draws the page, saves bulk edits
and pauses straight to master once master carries the items (`scripts/cards-master.mjs`), and hands the page
its pictures. The app side is the `chats` and `program` page abilities (youcoded `desktop/src/main/pages/page-program.ts`,
`desktop/src/renderer/components/pages/page-chats.ts`).

**Installing** writes into a Pages folder and is never guessed:
`node scripts/install-work-board.mjs --pages <folder>`. Destin's real folder is `~/YouCoded/Personal/Pages`,
which his running app watches and which syncs to his other devices — install there only with his yes, and
only once his installed app is a release that carries the `chats` and `program` abilities.

**Testing in a dev window**: a dev instance shares `~/YouCoded` and `~/.claude` with the real app, so the page
was tried with `HOME` pointed at a scratch folder (see `cards/19-*.md` for the setup traps found).

Without the app (`node scripts/manage.mjs`), the same page runs in a browser. Its facts are the same live ones
(Tidy up, Since the last release); only the guessed "Working" marker differs, and buttons that need the app show a note.

**Since the last release** is worked out each time the page is drawn by `scripts/release-view.mjs` (tests beside it):
the newest `vX.Y.Z` tag of the app repo that its master contains, plus every merge after it, grouped and linked to
work items. It asks GitHub first through a small cache folder (`~/.cache/youcoded-work-board/app-refs.git`) and never
fetches into the shared `youcoded/` checkout; offline it says it is using the last copy. Nothing about a release is typed in.

**How a change reaches the installed board:** the installed `work-items.mjs` imports `scripts/work-items-program.mjs`
from the shared workspace folder (the path written at install time), and that program draws the page with
`renderer/`. So code changes arrive when the shared checkout of master updates (merge, then workspace sync or
`git pull`), with no re-install, and the page picks them up the next time it is opened. Only a change to
`page.json`, `page.html` or `work-items.mjs.template` needs `install-work-board.mjs` again (and a fresh approval).
