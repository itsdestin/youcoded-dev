# Ledger: dev-workspace (99 entries to 20)

Short names for new entries: FLAKY = "Flaky and load-sensitive tests"; CLEANUP = "Test-suite cleanup work"; GAPS = "Test and check gaps"; XPLAT = "Cross-platform first-run testing"; DEVINST = "Dev instance: 11 faults"; SHOOT = "Screenshot, review-deck and workbench tooling"; FRICTION = "Workspace tooling friction"; LOST = "Session work lost or stranded"; DRIFT = "Roadmap and docs drift"; RULES = "Path-scoped rules not reaching sessions"; PARKED = "Parked ideas: 10"; UPKEEP = "Release and build upkeep"; MAC = "Mac installers: nothing is signed or notarized".

| # | original first ~70 characters | new entry |
|---|---|---|
| 1 | The Office add-on's early editor script (the one that silences external-link | GAPS (a) |
| 2 | The review-page before-and-after check (review-cards.py selfie) renders a fixed | SHOOT (a) |
| 3 | A headless page check (scripts/ui-probe.mjs) shows Word, Excel, PDF and image | SHOOT (b) |
| 4 | The main-process blocking-call test's classification still has ~330 | CLEANUP (a) |
| 5 | Finish Plan C (test files by feature) | CLEANUP (b) |
| 6 | tests/artifacts/import-file.test.ts — the two failed copy rollback cases | FLAKY (a) |
| 7 | tests/specialist-run.test.ts "a background completion is injected as a user-role | FLAKY (b) |
| 8 | Two cases failed only under full-suite load and passed alone | FLAKY (c) |
| 9 | tests/shell-registry.test.ts fails on this machine in ISOLATION | FLAKY (d) |
| 10 | Stopping a dev instance lists its own claude children without marking them | DEVINST (g) |
| 11 | step-guard-row.test.tsx → "does not drop a newer intent when the in-flight write | FLAKY (e) |
| 12 | A test that only reads files outside desktop/ never runs in the fast local check | GAPS (b) |
| 13 | native-session-host can fail its own CLEANUP on the macOS CI leg | FLAKY (f) |
| 14 | On a Mac, three things can miss a change made in the split second after they | GAPS (c) |
| 15 | native-session-host "a finished run is injected ONCE as a user turn" macOS leg | FLAKY (g) |
| 16 | Coverage debt from the feature-flow build | GAPS (d) |
| 17 | 102 fixed sleeps still stand in for real signals | CLEANUP (c) |
| 18 | 57 test files are excluded from the test typecheck | CLEANUP (d) |
| 19 | The desktop CI job fails while every test passes — EnvironmentTeardownError | FLAKY (h) |
| 20 | subagent-view and mcp-startup-wiring were filed as suites that flake | FLAKY (i) |
| 21 | A whole session edited files that a path-scoped rule covers and the rule never | RULES (a) |
| 22 | The lint gate only enables rules already at zero | CLEANUP (e) |
| 23 | VM first-run testing is provisioned (Windows 11, Ubuntu 24.04, macOS 26 Tahoe) | XPLAT (a) |
| 24 | Nothing tests a new user's whole path — download from youcoded.ai, install | PARKED (a) |
| 25 | YouCoded's page in the Linux app catalog (appimage.github.io, request #8053) | XPLAT (c) |
| 26 | Linux downloads: the AppImage needs libfuse2 | XPLAT (b) |
| 27 | Visual-regression harness for the renderer's chrome invariants | PARKED (b) |
| 28 | Review-deck test hygiene: bare open() in the Python deck tests | GAPS (e) |
| 29 | The phone's presence client (ping loop, reconnect state machine) has no test | GAPS (f) |
| 30 | The voice install's "runs no other program" guard does not ban every way | GAPS (g) |
| 31 | Source-grep sweep, round 2: tests the 2026-09 inventory missed | CLEANUP (f) |
| 32 | Three growth checks the 2026-09-16 simplification audit named | CLEANUP (g) |
| 33 | Nothing tests the menus Claude Code shows AT SESSION LAUNCH | GAPS (h) |
| 34 | Tidy-up left over after the one-core work (simplification Phase 5) | CLEANUP (h) |
| 35 | A dev instance writes its pinned-pages list into the real ~/YouCoded/Personal | DEVINST (a) |
| 36 | Two screenshot runs of Office screens from the same checkout at the same time | SHOOT (c) |
| 37 | The VM helper's load step is rough for Mac | XPLAT (d) |
| 38 | The macOS 26 (Tahoe) test VM has no saved "ready" state | XPLAT (e) |
| 39 | Let a dev instance start already signed in with the real app's API keys | DEVINST (f) |
| 40 | Removing a provider in a dev instance also removes it from the real app | DEVINST (b) |
| 41 | review-cards.py preview builds a deck whose What changed / You'll notice / Risk | SHOOT (d) |
| 42 | Destin asked to "optimize tf out of our workspace" (2026-09-14) | FRICTION (a) |
| 43 | scripts/ci-red-vs-master.sh listed seventeen Windows-only test names | FRICTION (b) |
| 44 | A dev instance shares the live app's saved theme choice | DEVINST (c) |
| 45 | The deck builder accepts two specs in one feature folder with the same key | SHOOT (e) |
| 46 | The drag sweep prints its scores and then CRASHES writing the frame dump | SHOOT (f) |
| 47 | A session needing Destin to approve a set of concrete text changes rebuilds | SHOOT (g) |
| 48 | A dev instance still shares one file with Destin's live app: sync-spaces.json | DEVINST (d) |
| 49 | A dev instance silently changed the engine settings of Destin's real app | DEVINST (e) |
| 50 | The screenshot drivers behind the review rig and the new UX tester emulate a mouse | SHOOT (h) |
| 51 | Three copies of "which youcoded checkout do you mean?" exist | DEVINST (j) |
| 52 | Measure the feature flow's two reviewers | PARKED (c) |
| 53 | A 526-line conversation-triage script for the test engine exists only on branch | FRICTION (c) |
| 54 | Committing a workspace doc takes six manual steps every time | FRICTION (d) |
| 55 | The app's log is in a folder nobody would guess | FRICTION (e) |
| 56 | The feature flow — a questions deck before anything is drawn — never run end to end | The feature flow ... never run end to end (standalone, in-flight) |
| 57 | Harness evaluator: no CI gate yet, and the four eval cases were hand-written | FRICTION (f) |
| 58 | Workbench serves community theme folders (theme-asset://) | PARKED (d) |
| 59 | Attach your own screenshot to a review-deck step | PARKED (e) |
| 60 | Re-author the session-strip motion review as live pick-one steps | Session-strip motion review (standalone, in-flight) |
| 61 | Terminal text wraps about two-thirds ... of the way across the pane | SHOOT (j) |
| 62 | run-dev.sh has no way to stop what it started | DEVINST (h) |
| 63 | RECURRENCE, 2026-09-20, with the mechanism the entry above was missing | DEVINST (h) |
| 64 | workbench-boot-check.mjs boots sixteen routes | SHOOT (i) |
| 65 | run-dev.sh --offset N fails with a bare Vite "Port 5233 is already in use" | DEVINST (i) |
| 66 | A finished session's worktree manifest is never removed | LOST (a) |
| 67 | A session worktree disappeared mid-session and took the only copy of the work | LOST (b) |
| 68 | Nine roadmap items point at reports whose proof no longer matches the code | DRIFT (a) |
| 69 | A Worker setting the code reads can exist only as a test value | DRIFT (b) |
| 70 | workspace-start will not resume a session after the documented post-merge cleanup | LOST (c) |
| 71 | We can see how many people open the app and nothing else | "We can see how many people open the app and nothing else" (standalone) |
| 72 | A fresh worktree came up missing a package its own lockfile names (dompurify) | LOST (d) |
| 73 | The UI design guide has TWO rules numbered G-22 | DRIFT (c) |
| 74 | Close-out can say "the work landed" for a new branch whose edits are uncommitted | LOST (e) |
| 75 | Recheck the old cleanup handoff's remaining unused-code and bug-hunt ideas | DRIFT (d) |
| 76 | Planning, design, review and wrap-up instructions can send an assistant down | PARKED (f) |
| 77 | roadmap-check verifies a report's claim against whatever copy of the sub-repo | DRIFT (e) |
| 78 | Every branch that files a roadmap item conflicts on the generated area table | DRIFT (f) |
| 79 | Path-scoped rules never reach a session that edits through the Bash tool | RULES (b) |
| 80 | Every plan, spec and investigation is stamped with a one-word state | PARKED (g) |
| 81 | Nobody knows whether a third round of adversarial design review improves | PARKED (h) |
| 82 | Work keeps existing on one disk only | LOST (f) |
| 83 | Two guardrails from the 2026-07-28 retrospective are still unshipped | DRIFT (g) |
| 84 | Workspace friction from the 2026-08-28 session-opening study still open | DRIFT (h) |
| 85 | youcoded/desktop/docs/ is down to two spec files | PARKED (i) |
| 86 | Deferred clean-ups from the 2026-07-10 master review | PARKED (j) |
| 87 | youcoded-core's status line and write-guard still reference the deleted script | DRIFT (i) |
| 88 | The public Office add-on repo (itsdestin/youcoded-office) once held a personal | "The public Office add-on repo (youcoded-office) once held ..." (standalone) |
| 89 | A scheduled check that every id in the model switcher's recommended list | UPKEEP (a) |
| 90 | Waiting on CI runs eats whole sessions | "Waiting on CI runs eats whole sessions" (standalone, P1) |
| 91 | A one-line change to announcements.txt runs the full Linux build | UPKEEP (b) |
| 92 | Every macOS download since 2026-07-23 is unopenable | MAC (merged with 98) |
| 93 | Re-work the release method: releases tag master directly | "Re-work the release method" (standalone) |
| 94 | Every compiled file ships inside the installer, tests included | UPKEEP (c) |
| 95 | PDF reading needs one smoke test in a packaged build | UPKEEP (d) |
| 96 | Dependency majors that are real work, not bumps | UPKEEP (e) |
| 97 | Android toolchain migration: Kotlin 2.4.10 + Gradle 9.7.1 landed | UPKEEP (f) |
| 98 | macOS installers still hit the security wall — nothing is signed or notarized | MAC (merged with 92) |
| 99 | No Google Play listing — Android installs only from a GitHub APK | "No Google Play listing" (standalone, P2, v1.3.2) |
