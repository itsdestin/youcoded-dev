---
date: 2026-10-16
status: active — built on session/work-cards-20261014 (both repos), not merged (as of 2026-10-16)
type: spec
topic: Pages read and change chats, pages run approved programs, and the management page becomes Destin's own page kept true by chats
origin: Destin's goals (2026-10-16 chat) and work-cards-next.questions.answers.json; Pages scope §5/§9 (docs/archive/specs/2026-09-15-youcoded-pages-scope.md)
related: docs/active/specs/2026-10-14-work-cards.md, docs/active/design/2026-10-16-manage-page/
---

# Pages that read chats and run programs; the management page as a page

## Where it stands (2026-10-16, end of the building session)

| Part | State |
|---|---|
| Triage (goal 1) | Done: 143 → 93 open items, merged to the branch (`docs/active/design/2026-10-16-manage-page/work-items-triage.*`) |
| Approval cards for `chats` and `program` | Approved by Destin (`docs/active/design/2026-10-16-pages-chats-programs/approval-cards.review.answers.json`) |
| App: `chats` and `program` abilities | Built (youcoded `page-chats.ts`, `page-program.ts`, `03d9a79d8`); verify.sh green; tried in a dev window with a scratch HOME: approval card, chat list, Resume after a real click, Start a chat, Working, bulk edit all worked |
| Programs from a phone | Refused (desktop-only channels) — Destin's call; recommended to keep it so for now |
| Workspace: items save straight to master, `--item`, link/progress/pause | Built and tested; saving to master switches on by itself once master carries `cards/` |
| Work board page | Built (`pages/work-board/`); NOT installed in Destin's real Pages folder — waits for a release carrying the abilities and his yes |
| Big picture, Tidy up live | Built (`vision:` on items; live scan) |
| Merging an item closes it | By the merging chat (the "Merge to master" request includes `cards.mjs close`), not blindly: multi-phase items (the Android rebuild) would close early |
| Status bar branch chip names the repo | Built and unit-tested; not yet seen in a running app |
| Page-builder skill learns `chats`/`program` | Held on a marketplace branch until a release carries the abilities (see #90) |
| Not verified | GitHub facts inside a dev window (private message bus → no keyring); the same program shows them when run outside |

## Destin's three goals, in order (2026-10-16)

1. Triage every open item (done: 143 → 93, `work-items-triage.*`).
2. "make it so pages can read chat data records like chat names/dates/tags/notes/etc, so we can directly tie a
   chat record with a resume button into this or any other page (with proper permissions/approvals)".
3. Integrate the agentic workflows so sessions keep the page true as they begin/end/pause work; make it a
   YouCoded page; fix what is broken or incomplete in it (Big picture, Tidy up).

## Decided (work-cards-next deck, 2026-10-16)

| Step | Decision |
|---|---|
| Q-1 | The page names its chat scope (all chats, named projects, or a named tag); the approval card says exactly that |
| Q-2 | Pages may also change tags, notes and marks — a **separate** approval from reading |
| S-3 | The chat list gains each chat's **branch** and whether it is **open now**; "Working" comes only from open-now |
| Q-4 | Work chats join an item at start (idea-intake if none), branch named after it, record themselves; wrap-up writes the progress note; pausing records the reason; merging moves the item to Merged |
| Q-5 | Item changes save **straight to master** from one dedicated copy, no pull request |
| Q-6 | "Merge to master" opens the new-chat window with the merge request filled in |
| Q-7 | **Destin's own page** in his Pages folder, not built into the app ("I never asked for this to be built in") |
| Q-8 | It uses the same abilities any page can use; nothing tailored to this one page |
| Q-9 | Finish everything, then merge once |
| Q-10 | Big picture and Tidy up read live facts; Screens keeps its own "Pictures from Oct 12" date until #147; header date goes |
| Q-11 | Idle copies of work: Destin deals with them later |
| Chat | "anything we build should be generalizable. pages should already support reading files and using scripts/running programs (or this is at least planned) … make this work within those capabilities" |

## What gets built — all general page abilities

**A. Chats (new connection kind `chats`).** `page.json`: `{ "kind": "chats", "scope": "all" | {"projects": [...]} | {"tag": "<id>"}, "change": false|true }`.
Reading and changing are fingerprinted separately, so adding `change` re-asks. `window.youcoded.chats.list()` →
name, created/last active, tags (names + colours), note, project, model, flags, branch, open now.
`chats.resume(id)` works only from a real click, like `startSession`. With `change`: `setTag`, `setNote`, `setFlag`.
Built on the existing session browse/flag/tag/note calls (no new store), so the phone works through the same path.
Missing today and added: the branch (read from the chat file's `gitBranch`), and open-now (merge the live list).

**B. Computer programs (Pages scope §9, new connection kind `program`).** A page lists a program file inside its
own folder and the command to start it; the approval card says plainly that it runs with this computer account's
full access. Approval is tied to the program file's exact contents (a hash): edit the file and the page asks
again. `window.youcoded.program.run(name, input)` → `{ ok, output }`, with a time limit, cancel on page close, and
output size cap. Not offered to marketplace pages in this round; desktop and the paired phone run it on the
computer, never on the phone.

Folder access (scope §5) is not needed by this page and is left for Pages Phase 3.

## The management page as Destin's page

- Lives in his personal Pages folder: `page.html` (today's approved design), `page.json`
  (connections: `chats` all + change, `program` workspace helper, `session` for Start a chat), and a small
  `work-items.mjs` program: reads `cards/`, works out live facts from git and GitHub, applies bulk edits, saves and
  pushes **straight to master** from a dedicated copy of the workspace.
- Buttons: Start a chat on this / Start another chat (startSession with the item filled in); Resume latest chat
  and Go to chat (chats.resume); Merge to master (startSession with the merge request); Fix failing checks
  (startSession); Pause/Close (program: records the reason / closes per the Q-4 rules).
- Big picture and Tidy up read live facts from the program; Screens keeps its own date.

## Chats keep it true (workspace side)

- `workspace-start --item <n>`: branch `<n>-<slug>`, records the chat on the item (`work:` + chat list).
- Idea-intake when no item matches, waiting for his yes.
- Wrap-up writes the progress note (done / next / blocked); pause records the reason.
- Close-out runs `cards.mjs close` itself on merge.
- All of these save through the same dedicated master copy as the page.

## Order

1. Approval-card wording and look for chats and programs (UI first: review deck).
2. App: chats ability (+ branch, open-now), programs ability, with tests; workbench fakes; phone path checked.
3. Workspace: dedicated master copy for item saves; workspace-start / wrap-up / close-out hooks.
4. The page: move into his Pages folder with its program; buttons; live Big picture and Tidy up.
5. Status bar change: refresh packages, verify, dev-window check.
6. Bring master in, move any new roadmap entries into items, guard against roadmap files returning, verify,
   then ask "ready to merge?".

## Open

- Risk to say on the program approval card: it can do anything his account can; approval is per version.
- Whether the program ability should also be offered to project pages (not marketplace) — default yes, same card.
