# Work board — Destin's own YouCoded page for every piece of work

The management page (Today, Screens, Big picture) as a YouCoded Page in Destin's personal Pages folder.
Decided 2026-10-16 (`docs/active/design/2026-10-16-manage-page/work-cards-next.questions.answers.json`):
his own page, not built into the app, using only abilities any page can ask for.

| File | What it is |
|---|---|
| `page.json` | name, icon, and the three permissions: see and change chats, run `work-items.mjs`, start a conversation |
| `page.html` | a shell: asks the program for the page and puts it in place |
| `work-items.mjs.template` | the program; `scripts/install-work-board.mjs` writes it as `work-items.mjs` with this workspace's path |
| `renderer/` | draws the page (`build.py --page-mode`), from the items in `cards/`; the design record (decks, answers, reviews) stays in `docs/active/design/2026-10-12-management-surface/` |

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

Without the app (`node scripts/manage.mjs`), the same page runs in a browser with the Oct 12 snapshot for
Tidy up and the guessed "Working" marker.
