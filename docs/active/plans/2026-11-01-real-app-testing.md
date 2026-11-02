---
status: draft
date: 2026-11-01
---
# Plan: test the app the way users use it

**Decisions this rests on:** Destin's answers in
`docs/active/design/2026-11-01-test-rethink/test-rethink.questions.answers.json`, plus chat on 2026-11-01:

- never pin wording or styling;
- check looks by eye with a "what changed" button;
- add a whole-app walk-through that acts like a real user;
- cut tests that guard a small piece when testing the bigger feature would catch the same break.

**Evidence:**

- `docs/active/investigations/2026-11-01-android-ux-test/report.md`, on branch `session/android-ux-test`: six show-stoppers no test caught.
- Two sorts of a random 150 of the 1,255 desktop test files (method and numbers in "The cleanup" below).
- A fact sweep of the code. The `file:line` facts below came from it.

**Overlapping cards:** #13 (unreliable tests), #15 (behaviours nothing protects), #16 (first-run untested), #29
(release pipeline), #209 (script to drive a real Claude Code chat).

---

## What changes for Destin

- **Every release gets a short report:** "these N things were tried on freshly installed copies of the real app, on
  Windows, Mac, Linux and Android, and worked." If one fails, the release stops unless you write down why it
  should ship anyway.
- **Every morning, two automatic checks report:**
  - does the real app's engine still start on computer and phone hardware;
  - do the outside services the app needs (marketplace, sign-in, sync hub, games server…) still answer.

  A failure emails you, like today's other nightly checks.
- **A "What changed since last release" button on the work board** shows only the screens that changed, in the
  YouCoded and YouCoded Night themes, with the change highlighted. Approving them (Keep / Not this) becomes a
  release step.
- **Everyday code changes get no slower.** Nothing new runs on each change.
- **The test suite shrinks by roughly a third** (about 90,000–130,000 of 293,000 lines). Rewording a button
  or restyling a screen stops breaking tests.

## The six show-stoppers, and which new check would have caught each

| Show-stopper (2026-11-01) | Caught by |
|---|---|
| Phone assistant can't start (missing language data) | Morning engine check, phone hardware |
| Sync always fails on the phone | Morning engine check (phone) + release walk-through, sync step |
| Online games down everywhere | Morning outside-services check |
| Attach file does nothing on the phone | Release walk-through, phone part (needs a real phone, see Phase 3) |
| New user's first Claude Code chat stuck behind hidden setup | Release walk-through, first chat step |
| Phone app thinks it's a browser (gets computer screens) | Release walk-through, phone part |

---

## Phase 0: settle the unknowns (small, cheap, first)

Each of these is a single trial that decides how later phases are built.

1. **Can GitHub's free phone-chip Linux machines run the phone app's own engine?** The phone's programs are ordinary
   Linux programs built for phone chips (`app/runtime/build-runtime.sh`). They expect to live at the phone's
   folder path (`/data/data/<app>/files`), which a script can recreate on a GitHub machine. Untried. A short trial
   run settles it.
2. **Can those machines run a pretend phone?** The evidence found points to no. Ordinary GitHub machines can run a
   pretend phone, but it can't run our programs (seen 2026-11-01). A 5-minute check settles it.
   - If no: the phone *screens* (attach file, Back button, notifications, "thinks it's a browser") still need a real
     phone at release time. The phone-engine part (crashes, sync) runs free in the cloud either way.
3. **Can a real Claude Code chat run with nobody there?** Today a brand-new Claude Code stops at several hidden
   first-run screens (text style, security notes, "trust this folder"), and typed messages sometimes stick in its
   box (card #209). The trial uses a dedicated, spend-capped test account (decision needed, below).
4. **Can GitHub's free Windows and Mac machines install and open the real installer?** The existing
   "window isn't blank" check already opens the app there (`desktop/scripts/smoke-test.js`, run in
   `desktop-release.yml:248`), but from an unpacked copy, not a real install. A trial install settles it.
   - These machines start clean each time, like a new user's computer. For that reason they're the recommended
     home for the computer walk-through, ahead of the local test virtual machines (`scripts/vm/`). The local Mac one
     is an old Intel-style Mac and is slow to drive.

### Phase 0 results (2026-11-01, released v1.3.3 downloads)

The trials live in `youcoded/.github/workflows/probe-phase0.yml` and `.github/probes/`, on branch `session/test-suite-rethink` only.

- **0.1 Phone engine on a free arm64 machine: works.** It reproduced both shipped phone show-stoppers with no phone:
  - `TypeError: Internal error. Icu error.` at `pages-types.js:37` when the engine starts;
  - git making repos without `.git/info` (the sync failure).

  Bundled Node in 1.3.3 is v24.18.1. Script: `.github/probes/android-engine.sh`.
- **0.2 Pretend phone on free arm64: not possible.** `/dev/kvm` is absent. The phone *screens* need a real phone at
  release time.
- **0.3 Claude Code with the test key: works, unattended.** First-run screens in 2.1.300:
  1. text style (Enter);
  2. "use this API key?", where the default is **No**: test-only, answer Yes;
  3. security notes (Enter);
  4. "trust this folder?", where the default is **"No, exit"**;
  5. the message box, with **auto mode on by default** (why card #209 saw AUTO).

  The message was sent. The reply was "Credit balance too low": the test workspace had a monthly limit but no
  prepaid credit yet. Script: `.github/probes/claude-first-run.py`. It hides key-shaped text, because Claude Code's
  API-key screen shows the key's last 20 characters and these logs are public.
- **0.4 Real installers on free Windows and Mac machines: work.** A silent install of the 1.3.3 installer / dmg drew
  its first screen in about 6–7 seconds.

### Phase 1 and 2 status (2026-11-01)

Both are built on youcoded branch `session/test-suite-rethink`, and both ran green as checks: they flag what is
truly broken.

- **Morning check:** `.github/workflows/nightly-real-app.yml`. Run on nightly 41315939585's builds, the Linux app
  opened. The phone engine failed: master still has the ICU crash and the git `info/` bug.
- **Outside-services check:** `.github/workflows/daily-outside-services.yml`. 15 of 16 services answer. Online games
  is down: the app still points at `youcoded-games.itsdestin.partykit.dev` (`party-client.ts:8`), which no longer
  resolves. The Worker's `games/` routes are only leaderboards and records, not the live game rooms.
- **Not live yet:** both start running on their schedule only once they're on master. GitHub ignores schedules on
  other branches. Before merge, remove their development-only `push:` triggers. Both will stay red each morning
  until the phone and games show-stoppers are fixed (separate work).
- **Not yet checked:** the phone check's "engine answers the screen" step can't be checked against a passing engine
  until the ICU fix exists. Check it against the first build with that fix.

### Phase 3 progress (2026-11-02)

- **Where it lives:** `youcoded/.github/workflows/release-walkthrough.yml` and
  `.github/real-app/walkthrough/walkthrough.mjs`. It is Linux only so far, and uses the nightly packaged app.
- **How it drives the app:** Chromium's `--remote-debugging-port` switch plus `playwright-core`. The app needs no
  changes. Every on-screen word it relies on is listed in one `WORDS` table.
- **Passing:** (1) the app opens; (2) a brand-new user signs in by pasting the test key. To get there, the machine
  needed:
  - a keyring;
  - the Chrome sandbox set up the way the `.deb` installer does it;
  - to present itself as a GNOME desktop.
- **Failing: (3) the first chat with the default choices. Cause confirmed (2026-11-02):** on the API-key route,
  Claude Code is never installed (no `claude` on PATH or in the home folder). Yet the welcome form defaults to
  Claude Code, and `session:create` for a missing Claude Code answers "active" and then nothing appears: no chat,
  no error. Two app faults: the wrong default, and the silent start. The original investigation notes follow.
- **Original notes:** (3) the first chat with the default choices. Pressing "Start session" folds
  the form back to "New session". No session is created and no error shows. Calling `window.claude.session.create`
  directly does create a Claude Code session, so the backend works. Still to establish: does the button never send
  the request (an app bug), or is the walk-through's click wrong?
- **Passing too (2026-11-02):** (4) a first chat with the app's own assistant: Haiku 4.5 replied "42";
  (5) the assistant saves a file the user asked for, checked on disk. Step (3), the default choices, is recorded as a
  known failure and doesn't stop the run. Its fix (install Claude Code on Start, a route-matching default and a
  key-choice screen) waits for card #213 to merge, then follows the short UI route (Destin, 2026-11-02).
- **Session steps passing (2026-11-02):**
  - rename, tag and note a chat;
  - close and reopen the app: the "Welcome back" panel offers the chat with its name and tag;
  - resume: earlier messages are back and it answers again ("56");
  - the note is still there;
  - close the chat from All sessions;
  - search the Resume list: finds it by "taco", not by nonsense.
- **More findings from these steps (not yet filed):**
  - The buddy's tip bubble sits on top of the "Close session" prompt's confirm button. A user must dismiss the
    tip first.
  - The "All sessions" arrow and each row's close ✕ have no accessible name until hovered (the tooltip names them
    only then). A screen reader can't find them.
  - With the only chat already open, the Resume list says "No previous sessions found" while the tip beside it
    says "You have a session from earlier".
- **File steps passing (2026-11-02):**
  - open the saved file from the Files panel;
  - edit and save it in the viewer, with the change confirmed on disk;
  - open the user's own spreadsheet from Projects, with the SUM formula's total shown;
  - open the user's own Word document.

  Sample files: `youcoded/.github/real-app/walkthrough/fixtures/`.
- **More findings (not yet filed):**
  - The viewer's floating Edit button is hidden while the file list is open beside the file
    (`SessionDrawer.tsx`, opacity-0 unless `!showList`).
  - Projects → Files for the Home folder lists hidden setup folders (`.cache`, `.claude`, `.config`, `.youcoded`
    with `providers.json`) as "Project files". The Android report saw the same.
  - Possible: once, Enter right after a new chat opened left the message in the box with no feedback. The
    walk-through now retries and reports any wait.
  - Unconfirmed: Escape didn't close the Word preview in the walk-through; its ✕ does.
- **Attach passing (2026-11-02):** a file picked through the system file chooser reaches the assistant, which
  answers from it. The walk-through answers the chooser through Electron's `--inspect` main-process hook
  (`answerFilePicker`).
- **Marketplace steps (in progress):** install Civic Report (checked on disk) and install and apply Golden
  Sunbreak (checked by the page's `data-theme`). The last run's result was unread when GitHub's request limit was
  hit, at about 10:47 UTC.
- **Finding:** with no chat open there is no way into the skills marketplace. It's only reachable from the compass
  in a chat's message bar; Settings has no entry. The Android report noted the same.
- **Tooling note:** `gh run watch` at its default interval, plus many runs, hit GitHub's request limit, which is
  shared with other sessions. Use `-i 30`.
- **Seen, not yet checked:** a fresh Linux desktop install with sync never set up shows a red "Sync failing" badge.
  The Android report saw the same on phones. The sync step should check this.
- **Findings to report (not yet filed):**
  - **Fixed on `session/first-run-fixes` (8b591a362):** when no secure storage backend is found, the keychain helper showed "could not start or receive the request".
    `keychain-client.ts` swallows the real reason (`keychain-launch.ts`: "A secure storage backend is not
    available"). Users on less common Linux desktops would get a misleading message.
  - After a new user signs in with an Anthropic API key, which powers the app's own assistant, the first-session
    form defaults to "Sonnet · Claude Code". Claude Code was never signed in or installed on that route.

## Phase 1: the morning engine check

- **What:** each night, on free GitHub machines, start the real app engine:
  - the computer build on Linux;
  - the phone's own engine on a phone-chip machine, if Phase 0.1 works.

  Then ask it to make a session and list things back. No assistant is needed, so it costs nothing.
- **How:** the engine already runs without a window (`desktop/src/main/headless/headless-main.ts`). It signals
  ready with a line (`YOUCODED_HEADLESS_READY <port>`) and takes requests over a local connection. A small new script
  connects, makes a session and checks the replies. It joins the existing nightly slot in `desktop-ci.yml`.
- **Catches:** any crash at start-up on either platform (the 1.3.1–1.3.3 phone failure), broken sync set-up,
  missing bundled files.
- **Cost:** free; about 5–10 minutes overnight. Adds nothing to everyday changes.
- **Note:** GitHub runs nightly jobs late, often hours after the set time. "Morning" means "by midday".

## Phase 2: the daily outside-services check

- **What:** each day, visit every outside service the app relies on and check it answers.
  - `api.youcoded.ai/health`: sign-in, marketplace, friends, the sync hub.
  - The marketplace and theme lists.
  - The update check.
  - The games server.
  - npm, which first-time setup needs.
  - **Other sign-in routes (Destin, 2026-11-01):** the walk-through chats only through the one Anthropic test key,
    for both Claude Code and the app's own assistant. OpenRouter and ChatGPT are covered here instead. The check
    confirms their sign-in pages load and their free addresses (e.g. OpenRouter's model list) answer. The ChatGPT
    route is already watched (`chatgpt-route-watch.yml`).
- **First:** confirm where online games really live now. The old games address is gone, but the marketplace
  server has a games section, so games may have moved there. Trace this before writing the check, so it watches
  the right address.
- **Catches:** a vanished games server, a renamed marketplace file, a dead sign-in page, all on the day it happens.
- **Cost:** free; under a minute a day.

## Phase 3: the release walk-through

- **Where:**
  - **Computer:** free GitHub Windows, Mac and Linux machines. Each install is fresh from the real
    installer, and the machine starts clean.
  - **Phone engine:** the phone-chip machine.
  - **Phone screens:** a real phone, unless Phase 0.2 finds a free pretend phone. See the decision below.
- **How:** a new script drives the installed app like a person: it clicks, types and reads the screen. Each step
  passes on an *outcome*, never on wording:
  - the file exists and reopens unchanged;
  - the Page appears in the Pages list;
  - the reply arrived;
  - the theme's colours applied;
  - the session's new name survives a restart.

  It builds on the existing click-through format (`desktop/tests/journeys/`) and the existing tool that drives
  a real window (`scripts/shoot/explore.mjs --dev`). Neither works against a real install yet.
- **Steps (your picks):**
  1. Install and open.
  2. Sign in and have a first chat, with both Claude Code and the app's own assistant.
  3. Real chat tasks:
     - save a file;
     - research online;
     - run a command;
     - build a Page;
     - a long task with the app in the background.
  4. Files:
     - open, edit and save text, Word and spreadsheet files;
     - attach a file to a message.
  5. Manage sessions:
     - rename one;
     - add tags and notes;
     - resume after a restart;
     - search.
  6. Backup and sync between two copies.
  7. The assistant's browser, on a page we control.
  8. Install a skill and a theme from the marketplace.
- **Real assistant, capped:** the app's own assistant uses a dedicated OpenRouter key with a hard spending cap.
  The capped-spend tool already exists (`--max-spend`, `.claude/rules/harness-evaluator.md`). Claude Code uses the
  dedicated test account (decision below).
- **Telling an outage from a bug:** the walk-through checks the outside services first. If one is down, the report
  says "couldn't test X: service down" instead of a false failure.
- **Cost:** about $1–3 in assistant usage per release (rough; measured on the first run). Free machines. Roughly
  30–60 minutes per release, unattended, except for the phone screens if those need a real phone.

## Phase 4: the release gate

- **Where:** the release steps (`youcoded-admin/skills/release/SKILL.md`), between "the candidate's checks are
  green" and your "Final go/no-go".
- **What:** the walk-through report goes into the go/no-go summary, along with the list of changed screens from the
  "What changed" button.
- **Override:** the release stops on any failure unless you give a written reason. That reason is saved with the
  release record, so later you can see why it shipped.

## Phase 5: the "What changed since last release" button

- **What it does:**
  - photographs every screen (about 420 today) at the last release and at the latest code, in YouCoded and
    YouCoded Night;
  - keeps only the screens whose pixels differ;
  - draws a box around what changed;
  - lists them on the work board with Keep / Not this.
- **What exists:** the screenshot tool already photographs any version side by side (`scripts/shoot/shoot.mjs
  --before/--after`). It already knows when two pictures differ (`shoot.mjs:356`).
- **What's new:**
  - point it at a release instead of a work folder;
  - show only changed screens, with highlights;
  - a button and a progress bar on the work board, since a run takes several minutes.
- **Caveat:** the work board runs inside your real app, so its update goes through the usual install step with
  your yes. Built last for that reason.
- **Note:** the screenshots use the app's screens with a pretend engine. That's fine here, because this button is
  about *looks and wording*. The walk-through covers *does it work*.

## The cleanup (after the real checks exist)

**What the two sorts of 150 random tests found.** Percentages are of the sample; the suite-wide numbers scale them.

| Verdict | Share of tests | What happens |
|---|---|---|
| Keep | ~37% | Stays. Mostly protections a walk-through would never trigger: a crash mid-save, the assistant reading your password files, odd folder names. |
| Drop | ~23% (≈290 files) | Deleted. Wording and styling checks, tests of our own developer tools, tests of your personal pages, restated tables. |
| Merge | ~20% | Several small tests of one feature become one test of that feature. Examples: status bar (5 files), moving a chat between computers (3), two windows + phone following a chat (3). |
| Shrink | ~14% | Real protection, but bloated (mostly setup or near-identical cases). Cut roughly in half. |
| Loosen | ~5% | Keep the behaviour check; delete the exact-wording checks. |

**Order:**

1. **Move your personal pages' tests** into their own folder. They're your pages, not the app.
2. **Drop and loosen.** A text search finds 181 likely candidates. In the sample, 3 in 4 of those were right to cut,
   but some were important (e.g. a check that the phone and computer handle requests the same way). So every file
   gets a look before deletion, not a blind delete. A second, wording-focused search finds about 200 more files to
   review.
3. **Merge and shrink**, one feature at a time. Each starts with writing the bigger test, then removing the small
   ones it covers.

**A rule going forward:** no new test may check exact wording or a style name. A new test that reads app code as text
is allowed only for the narrow case the existing rule already names: keeping the phone and computer halves in step
(`.claude/rules/test-suite-hygiene.md` → "A new source-text guard needs a reason a rule cannot express"). An
automatic check will flag new ones, and the rule note gets a line saying why.

**Honest uncertainty:**

- Only about 25 of the 150 sampled tests were read line by line.
- "Shrink" savings are the shakiest guess.
- Duplicates between tests can't be measured from a sample.
- Expect the real total to land anywhere from a quarter to two-fifths of the suite.

---

## Decisions needed from Destin before building

1. ~~A test Claude account / OpenRouter key.~~ **Done 2026-11-01:** one Anthropic API key for both Claude Code and
   the app's own assistant. It lives in a separate "testing" workspace with a $15 monthly limit. It's stored in
   GitHub as the secret `YOUCODED_TEST_ANTHROPIC_KEY`, and locally in `~/.config/youcoded-test/anthropic.key`
   (readable only by Destin's account).
2. **The phone screens,** decided after Phase 0.2. If no free pretend phone works, the choices are your Flip7 per
   release (~20–40 minutes plugged in) or a cheap dedicated phone (~$150–250).

## Rough size

| Phase | Size | Can start |
|---|---|---|
| 0 Unknowns | small, 1 session | now |
| 1 Morning engine check | small–medium | after 0.1 |
| 2 Outside-services check | small | now |
| 3 Release walk-through | large (several sessions) | after 0 and the accounts |
| 4 Release gate | small | after 3 |
| 5 What-changed button | medium | any time; ships last |
| Cleanup | medium–large, spread out | after 3, except personal pages (now) |
