---
status: active
date: 2026-11-01
---
# Handoff: rethink what our tests test

**For:** a new session working *with Destin*. This is an exploration and a decision, not a coding task.
Destin directs; you lay out options in plain words and recommend one. Do not start rewriting tests until he has
picked a direction.

## Why this exists (Destin, 2026-11-01)

A hands-on test of the Android app on master found it **cannot start its assistant at all**. The released 1.3.3
very likely can't either. Five more show-stoppers turned up in about an hour of ordinary use:

- Sync always fails on Android.
- Online games are down on every platform.
- Attach file does nothing.
- A new user's first Claude Code chat is stuck behind a hidden setup screen.
- The phone app runs as "browser", so the phone gets computer screens.

Full findings and screenshots: `docs/active/investigations/2026-11-01-android-ux-test/report.md`.

In Destin's words: *"a lot of our test infrastructure is kinda broken and tests for very narrow/specific things
that don't really matter while leaving out real test of actual functionality and user experience. it seems
implausible to me that we let a release through without ever noticing that the app wouldn't even start
properly."* He wants tests that check **what matters in each release**. He does not want tests that pin
strings of code he'd reasonably change between releases.

## How it slipped through (checked 2026-11-01, master `573fab4c6`)

- **Nothing in CI or the release ever opens the Android app.** `youcoded/.github/workflows/android-ci.yml`
  does three things:
  - runs Python fixture tests for the runtime's licence/redistribution bookkeeping;
  - runs Gradle unit tests;
  - **builds** the APK and checks build-input "evidence".

  It never installs or starts the APK, and never starts the bundled backend, even once on a Linux runner.
- **The release procedure is reading, not using.** `youcoded-admin/skills/release/SKILL.md` sends eight review
  agents to read the diff (docs, platform, conflicts, compliance…), then runs `scripts/verify.sh`, which is
  desktop-only. It then checks that the right files are attached to the GitHub release. No step installs a
  build and uses it.
- **Saved click-paths (journeys) and screenshots run against a fake backend.** `youcoded/desktop/tests/journeys/`
  holds 10 journeys plus 4 check scripts. The `scripts/shoot/` tools drive the **workbench** (real screens,
  pretend backend). A crash in the real backend can't show up there.
  - Android screenshots force `?platform=android`, which hides the "phone thinks it's a browser" bug.
- **The bundled programs drift silently.** `app/runtime/pins.env` pins the Alpine branch, but not the package
  versions inside it: Node moved from 24.18 (1.3.3) to 24.22 (now) with no change in our repo. The rule
  "bumping a pin is a phone test" never fires, because nothing is bumped.
- **Last known on-phone use** was a dev build installed 2026-10-15. The line that crashes startup
  (`desktop/src/shared/pages-types.ts:184`) reached master 2026-10-14 22:20; v1.3.1 was tagged 10-17. There is
  no record in `docs/wrap-ups.md` of anyone opening a 1.3.1–1.3.3 build on a phone. Whether that Oct 15 build
  contained the line is unconfirmed.

## What the suite looks like today (rough counts; check them before quoting)

- `youcoded/desktop/tests/`: **1,137** test files. A recent full run reported ~6,300 tests.
- **39** of those files read app source files as text and look for strings in them ("source-scanning guards").
- **565** use text-matching checks (`toContain('…')` / `toMatch(/…/)`). This is a crude signal (it also catches
  ordinary checks), but it is where to look for "pins random strings".
- Also part of the workload: ast-grep rules, knip, lint, `shoot --check`, journeys, CI evidence scripts
  (`scripts/ci-*.mjs`), and Android unit tests.
- Existing cards that overlap (link, don't duplicate; `node scripts/cards.mjs index`):
  - #13 Unreliable tests and test cleanup
  - #15 Eight behaviors no automatic test protects
  - #16 First-time setup untested on Linux, Windows, Mac
  - #17 Test copies of the app can change the real one
  - #29 Release pipeline: faster test runs…
  - #209 Script to drive a real dev window's Claude Code chat

## What to explore with Destin

1. **List what must never break.** Build the list *with him*, from a user's point of view. Starting candidates:
   - the app opens and the assistant starts (each platform);
   - a first chat works for a new user (Claude Code and the app's own assistant);
   - a file can be made and opened;
   - sync works;
   - install a skill/theme;
   - a Page works;
   - games load;
   - attach a file;
   - the app keeps working in the background.

   Each item should name **who would notice and how bad it is**.
2. **For each item, what is the cheapest *real* check?** Look at what can actually run:
   - Start the real headless backend (`desktop/src/main/headless/`) in CI on Linux and send it one chat. That alone
     would have caught the ICU crash on desktop-linux Node; the Android Node needs an arm64 runner or a phone.
   - CI on an **arm64 Linux runner** (GitHub has them) running the APK's own bundled `node` against the backend,
     with no emulator needed. The x86 Android emulator **cannot** run our musl programs (seen 2026-11-01:
     "TLS segment underaligned").
   - A **real-phone smoke test** before every release. Destin's Flip7 over USB worked well. A scripted run is
     possible: install the `.releasetest` APK, launch, read the WebView over `adb forward`, then send one message.
     Recipe pieces: `scripts/cdp-eval.mjs`, `youcoded/docs/android-runtime.md` → Developing, and the report's
     developer notes (two displays on the flip phone; `YOUCODED_APK_VERSION` for local builds).
   - Real-backend journeys on desktop (`run-dev.sh` rather than the workbench) for the top few user paths.
   - External services the app depends on (games server, marketplace, OpenRouter/Claude sign-in endpoints): a
     daily "is it still there" check. The games server vanished and nobody knew.
3. **What to remove or simplify.** Have Destin decide by category, not file by file. Sort tests into:
   - protects a user-visible behaviour;
   - pins wording/structure he might change;
   - duplicates another check;
   - checks our own tooling.

   Propose deleting or loosening the second and third groups, with examples. Use verdicts, not guesses: say
   how you classified, and sample to check the classifier.
4. **A release gate he can understand.** One short checklist or report that says, in plain words, "these N
   things were tried on a real build and worked". It should run by itself where possible; when it needs Destin's
   phone, say exactly what it needs from him.
5. **Cost and speed.** Real-device and real-backend checks are slower and some cost money (model calls).
   Give rough time/cost per release for each option, and recommend.

## How to run the session

- This is a big decision with many questions: use a **questions deck**, not chat. Every option gets user-facing
  pros and cons. Destin isn't a developer; explain by what a user would experience.
- Start by showing him the "how it slipped through" list above. Ask whether it matches his sense of the problem
  before proposing anything.
- Prefer one or two strong real checks over many weak ones. Every proposal should answer: *"what bug, of
  the kind we just shipped, would this have caught?"* Use the 2026-11-01 report's six show-stoppers as the test
  of every option.
- Fixing those six show-stoppers is **separate work**. Don't fold it in here. If Destin wants them filed, use the
  idea-intake skill; the report has the causes and the proven ICU fix.
- Testing on Destin's phone means installing only the side-by-side `.dev` / `.releasetest` builds, never his real
  `com.youcoded.app`. Ask before changing phone settings; on 2026-11-01 he approved a longer screen timeout,
  which was restored afterwards.
