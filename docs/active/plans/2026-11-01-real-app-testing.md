---
status: active
date: 2026-11-01
updated: 2026-11-09
---
# Plan: test the app the way users use it

**Decisions this rests on:** Destin's answers in
`docs/active/design/2026-11-01-test-rethink/test-rethink.questions.answers.json`, plus chat:

- never pin wording or styling in tests (2026-11-01);
- check looks by eye, against the last release, on the work board (2026-11-01; 2026-11-04: inside the existing
  Screens tab, not a page of its own; 2026-11-08: only screens that ship, and a release picture of every one);
- add a whole-app walk-through that acts like a real user;
- cut tests that guard a small piece when testing the bigger feature would catch the same break.

**Evidence:** the Android test report (`docs/active/investigations/2026-11-01-android-ux-test/report.md`, branch
`session/android-ux-test`: six show-stoppers no test caught); two sorts of 150 random desktop test files; a fact sweep.

**Overlapping cards:** #13 (unreliable tests), #15 (behaviours nothing protects), #16 (first-run untested), #29
(release pipeline), #209 (driving a real Claude Code chat), #213 (Android findings; two steps here wait for it).

**Branches (nothing merged yet; merge only on Destin's word):** `session/test-suite-rethink` in youcoded-dev (this
plan, the shoot / what-changed tools, the work board), youcoded (workflows, walk-through, test cleanup, screen list)
and youcoded-admin (release gate). **Merge order:** youcoded first — the admin contract test reads its
`release-walkthrough.yml`.

---

## Where things stand (2026-11-09)

| Part | State |
|---|---|
| 0 Unknowns | Done (results below) |
| 1 Morning engine check | Built; runs only once on master |
| 2 Outside-services check | Built; runs only once on master |
| 3 Release walk-through | 19 of 20 steps pass on Linux, Windows, Mac; 4 planned steps not built |
| 4 Release gate | Built (youcoded-admin) |
| 5 What changed since last release | Built in the work board's Screens tab; first full run against v1.3.3 done |
| Test cleanup | Done: ~9% of test lines, not the third first estimated; guard against new wording pins |

**What Destin will see once merged:** a red/green report each morning (engine starts; outside services answer); a
walk-through report in every release's go/no-go, which blocks the release unless he writes a reason; and a "Changed
since / New since <release>" view in the work board's Screens tab.

**Both morning checks will be red from day one** until the phone ICU crash, the phone git `info/` bug and the dead
games address are fixed (separate work, #213 and below).

## Left to do

1. **Walk-through steps not built:** build a Page; a long task with the app in the background; backup and sync
   between two copies (needs a dedicated test YouCoded/GitHub account — propose after #213 merges); the phone
   screens (need a real phone — decision 2 below).
2. **The first-chat failure** (step 3): fix on `session/first-run-fixes` (install Claude Code on Start, a
   route-matching default, a key-choice screen) waits for #213 to merge, then the short UI route.
3. **Findings not yet filed as cards** (file through idea-intake, with Destin's yes): see "Findings" below.
4. **What changed, rough edges:** one change can still read as several moved/scrolled rows (the browser card cascade;
   the sessions list shows 7 moved rows); the same change is sometimes classified differently in the two themes; some
   new situations show the new part small in a corner (the sentence names it). Coverage gaps a reviewer found: the
   small buddy question card, streaming replies, spreadsheet / Word / web previews.
5. **What changed, housekeeping (each needs Destin's yes):** delete the superseded stand-alone viewer
   (`scripts/shoot/what-changed/viewer/`, `serve.mjs`, `tests/what-changed-viewer.test.mjs`); delete old run folders
   `scratch/what-changed/v1.3.3-full` … `run8` (~12 GB; run9 is current); install the updated work board into his
   real Pages folder (`scripts/install-work-board.mjs`).
6. **Release skill:** the go/no-go now names how to produce the "What changed" list (youcoded-admin, this branch).
7. **Phase 1 check against a passing engine:** its "engine answers the screen" step is unproven until the first build
   with the ICU fix.

## Decisions needed from Destin

1. ~~A test account / key.~~ **Done 2026-11-01:** one Anthropic API key for Claude Code and the app's own assistant,
   in a "testing" workspace with a $15 monthly limit; GitHub secret `YOUCODED_TEST_ANTHROPIC_KEY`, locally
   `~/.config/youcoded-test/anthropic.key` (mode 600).
2. **The phone screens:** no free pretend phone works (0.2). Choices: his Flip7 per release (~20–40 minutes plugged
   in) or a cheap dedicated phone (~$150–250).
3. **A sync test account** (after #213).

---

## The six show-stoppers, and which check catches each

| Show-stopper (2026-11-01) | Caught by |
|---|---|
| Phone assistant can't start (missing language data) | Morning engine check, phone engine |
| Sync always fails on the phone | Morning engine check (phone) + walk-through sync step (not built) |
| Online games down everywhere | Outside-services check |
| Attach file does nothing on the phone | Walk-through, phone part (needs a real phone) |
| New user's first Claude Code chat stuck behind hidden setup | Walk-through, first chat step (fails today, as it should) |
| Phone app thinks it's a browser (gets computer screens) | Walk-through, phone part (needs a real phone) |

## Phase 0: the unknowns (done 2026-11-01, against v1.3.3 downloads)

Trials: `youcoded/.github/workflows/probe-phase0.yml` and `.github/probes/`.

- **0.1 Phone engine on a free arm64 GitHub machine: works.** It reproduced both shipped phone show-stoppers with no
  phone: `TypeError: Internal error. Icu error.` at `pages-types.js:37`, and git making repos without `.git/info`.
  Script: `.github/probes/android-engine.sh`.
- **0.2 Pretend phone on free arm64: not possible** (`/dev/kvm` absent).
- **0.3 Claude Code with the test key runs unattended.** First-run screens in 2.1.300: text style; "use this API
  key?" (default **No**); security notes; "trust this folder?" (default **"No, exit"**); then the message box with
  auto mode on. Script: `.github/probes/claude-first-run.py`; it hides key-shaped text, because Claude Code shows
  the key's last 20 characters and these logs are public.
- **0.4 Real installers on free Windows and Mac machines: work** (first screen in about 6–7 seconds).

## Phase 1: the morning engine check

`youcoded/.github/workflows/nightly-real-app.yml`. Starts the real engine without a window
(`headless-main.ts`, `YOUCODED_HEADLESS_READY <port>`) on Linux and the phone's engine on arm64, makes a session and
checks the replies. Free, ~5–10 minutes overnight. GitHub runs nightly jobs late: "morning" means "by midday".
Run on nightly 41315939585: the Linux app opened; the phone engine failed (master still has the ICU crash and the git
`info/` bug).

## Phase 2: the daily outside-services check

`youcoded/.github/workflows/daily-outside-services.yml`: `api.youcoded.ai/health`, the marketplace and theme lists,
the update check, the games server, npm, OpenRouter's sign-in and model list (ChatGPT is watched by
`chatgpt-route-watch.yml`). 15 of 16 answer. **Online games is down:** the app points at
`youcoded-games.itsdestin.partykit.dev` (`party-client.ts:8`), which no longer resolves; the Worker's `games/` routes
are only leaderboards and records, not the live game rooms.

## Phase 3: the release walk-through

`youcoded/.github/workflows/release-walkthrough.yml` and `.github/real-app/walkthrough/walkthrough.mjs`. Linux uses
the nightly packaged app; Windows and Mac silently install the real installer (Windows `/S`; Mac copies the .app out of
the dmg), from a Desktop Test Build run (`installers` input) or else the latest release. It drives the app with
Chromium's `--remote-debugging-port` plus `playwright-core`; the app needs no changes. Every on-screen word it relies
on is in one `WORDS` table. Each step passes on an outcome (file on disk, reply arrived, theme applied), never on
wording. The system file chooser is answered through Electron's `--inspect` hook (`answerFilePicker`).

**Steps (run 41573958801, all three systems: 19 of 20 pass):** open; sign in by pasting the test key; first chat with
the default choices (**known failure**, below); chat with the app's own assistant; it saves a real file; rename, tag
and note a chat; restart keeps them; resume answers again; note kept; open the file from the Files panel; edit and
save it; attach a file and the assistant reads it; run a command (sha256 of a word made up that run); the assistant's
browser reads a page the test serves with a made-up code word; install a skill; install and apply a theme; close the
chat; search finds it; open the user's own spreadsheet (SUM total shown) and Word file from Projects. Sample files:
`.github/real-app/walkthrough/fixtures/`. The Linux machine needed a keyring, the `.deb`'s Chrome sandbox setup and to
present itself as GNOME. Windows restart took 24s against 7s elsewhere — watch it.

**Known failure, cause confirmed:** on the API-key route Claude Code is never installed, yet the welcome form
defaults to Claude Code, and `session:create` for a missing Claude Code answers "active" and then nothing appears.
Two app faults: the wrong default and the silent start. Fix waits for #213 (Left to do, 2).

**Cost:** about $1–3 of test-key usage per release; free machines; ~30–60 minutes unattended.

**Tooling note:** `gh run watch` at its default interval hit GitHub's request limit, which other sessions share. Use
`-i 30`.

### Findings (not yet filed)

- The buddy's tip bubble covers the "Close session" prompt's confirm button.
- The "All sessions" arrow and each row's close ✕ have no accessible name until hovered.
- With the only chat already open, the Resume list says "No previous sessions found" while the tip beside it says
  "You have a session from earlier".
- The viewer's floating Edit button is hidden while the file list is open beside the file (`SessionDrawer.tsx`,
  opacity-0 unless `!showList`).
- Projects → Files for the Home folder lists hidden setup folders (`.cache`, `.claude`, `.config`, `.youcoded` with
  `providers.json`) as "Project files" (the Android report saw the same).
- With no chat open there is no way into the skills marketplace (only the compass in a chat's message bar).
- A fresh Linux install with sync never set up shows a red "Sync failing" badge (Android too). Unchecked.
- Possible: Enter right after a new chat opened once left the message in the box (the walk-through retries and
  reports any wait). Unconfirmed: Escape didn't close the Word preview.
- **Fixed** on `session/first-run-fixes` (8b591a362): with no secure storage backend, the keychain helper showed
  "could not start or receive the request" instead of the real reason.

## Phase 4: the release gate

youcoded-admin `session/test-suite-rethink`: release skill section 3 step 5 "Real-app gate", between "the candidate's
checks are green" and "Final go/no-go". The walk-through reports go into the go/no-go summary with the "What changed"
list. Any failure stops the release unless Destin gives a written reason, saved in `skills/release/data/release-overrides.md`
(private repo). A contract test fails if the gate is weakened (proved red with "blocks" changed to "advisory").

## Phase 5: what changed since the last release

**How to run and read it:** `scripts/shoot/README.md` → "What changed since the last release". Format of a run:
`scripts/shoot/what-changed/FORMAT.md`.

- **Pictures:** every shipping screen and situation (680 in the v1.3.3 run), at the release and now, in Meadow Mist
  and Halftone Dimension, steadied (`--freeze`) and each changed picture taken twice per side so flicker is dropped.
  The release side is its **photo copy**: the release's own app code with today's photo-only screen list laid over
  it, so 1.3.3 has a picture of everything today's list knows; a screen the release cannot open says so.
- **Comparison:** every visible button, field, word and picture is recorded with its box, so the list names what was
  added, removed, reworded, moved, scrolled or restyled, plus changed pixels nothing explains.
- **Where Destin sees it:** the work board's Screens tab (`make_changes.py <run>`, `manage.mjs --changes <run>`).
  "Changed since <release>" and "New since <release>" filters; tiles say how many of a screen's situations changed or
  are new, and name them; the popup compares both sides with Git-review red/green marks and a plain list. A new
  situation leads with one sentence of what to look for, kept in the app's screen list
  (`screens/whats-new.ts`, enforced by `tests/shoot-screens.test.ts`). `newIn: 'after'` marks only what is new since
  the last release; clear both after the next release ships.
- **Not built, by decision:** Keep / Not this approvals (the superseded stand-alone viewer had them; the board shows
  the comparison only).
- **v1.3.3 run (`scratch/what-changed/v1.3.3-run9`):** 96 changed pictures (48 situations, 12 screens on the
  board), 1,138 unchanged, 78 new (39 new situations on 13 older screens; no wholly new screen), 48 with no release
  picture (24 situations the release cannot open), 0 failed. 55 packages differ since 1.3.3, Electron among them (`run.json`):
  both sides use today's, so a look change from a package update alone does not show.
- **Limits:** the pictures use the app's screens with a pretend engine — looks and wording only; the walk-through
  covers "does it work". The work board runs inside Destin's real app, so the board update reaches it only through
  the install step, with his yes.

## Test cleanup (done)

- **Personal pages moved:** 43 files to `desktop/tests/personal-pages/`, out of the app's run
  (`npm run test:personal-pages`).
- **Source-text readers:** all 314 sorted (`docs/active/design/2026-11-01-test-rethink/source-reader-verdicts.tsv`);
  14 look/wording files dropped, 31 trimmed, 4 review-mockup tests dropped. Kept on purpose, each the only guard of
  something real: `app-restart`, `askpass-server`, `command-drawer-slash-filter`, `office-frame-guard`,
  `rocm-prereqs`, `remote-recovery`, `reduced-effects-animations`, `wallpaper-header-runtime`, `dialog-shell`.
  Now guarded only by screenshot review: terminal background variants, built-in theme JSON vs the first-paint copy in
  `globals.css`, float-chrome style rules.
- **Wording pins:** ~217 whole-sentence checks in 92 files loosened to the facts they carry (youcoded 7ae64911a);
  ~265 class/style assertions reviewed, look-only ones deleted. Guard: `tests/no-sentence-pins.test.ts`.
- **Two line pins replaced** with behaviour tests (fa7152b68), which **found and fixed a real bug**: a taken remote
  port hung the Settings switch.
- **Merge and shrink:** app test lines 293k → 265k (~9%). **The "a third" estimate was wrong:** most large files are
  distinct behaviours; the honest cuts were shared setup, case tables and history comments. Files under 450 lines
  were not swept. A scratch-only coverage recorder compared what each file's tests ran before and after; it caught six
  dropped inputs, all restored.
- **Rule going forward** (`.claude/rules/test-suite-hygiene.md` → "Never pin wording or styling"): no new test checks
  exact wording or a style name; a new source-text test needs a reason a rule cannot express.
