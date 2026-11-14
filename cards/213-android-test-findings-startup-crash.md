---
id: 213
title: Android test findings: startup crash, sync, attach, phone screens and polish
stage: merged
tags: android, bug, release-blocker, user-interface
branch: 213-android-test-findings-startup-crash
finish: Every yes in findings.questions.answers.json is fixed and verified on a real phone; report at docs/active/investigations/2026-11-01-android-ux-test/report.md
created: 2026-11-02
why: A hands-on phone test on 2026-11-01 found the Android app can't start its assistant, sync never works, attach file is dead, a new user's first Claude chat sticks on hidden setup screens, and the phone shows computer screens. Destin answered every finding on docs/active/design/2026-11-01-android-findings/findings.questions.json; fix all, release together with other workstreams. Related: #1, #133, #139, #177.
work: session/android-ux-test
---
Progress
Done: Final review round finished 2026-11-10 and tested by Destin on his Flip (Dev copy, updated in place). Built from his decisions: computer terminal for a laptop browser, one terminal scroll bar, first-run Claude questions as cards, sign-ins return to the app, auto mode from the first second, attachments kept 7 days, lock-screen privacy; independent three-reviewer pass with fixes. From his Flip test the same day: the Connect to Desktop Tailscale warning is real, stands alone and blocks connecting while off; plain-words can't-connect message; fullscreen tip removed; arrow buttons no longer shift sideways. Build: one Android test copy. The Dev copy is R8-shrunk like the release and the releaseTest build type is removed from Gradle, CI and docs (android-ci.yml passed on the branch, runs 42927034977 and 42929761860; Dev 1.4.0-beta.8 starts on his Flip). Checks: desktop verify.sh passes, 60 Android unit tests, worker tests pass. Nothing merged: app, workspace and marketplace branches session/android-ux-test, all pushed.
Next: Destin's merge decision (server first, then app, then his retest of two-player games and sync). Not testable before that: phone to computer (his computer app 1.3.3 refuses the new phone page address; anyone who updates the phone before the computer sees the can't-connect message), games, sync between two Dev copies. Open: bundled Claude Code is 2.1.300 (2.1.322 available); NTFY_TOPIC secret and 'allow Actions to create PRs' on the app repo unchecked; an unexplained page restart in the phone log at 14:09:40 on 2026-11-10 after two refused connections; today's Flip fixes had no independent review; install test copies with scripts/android-install-test-copy.sh.
Blocked: nothing

Chats
- 2026-11-11 session/android-ux-test: chat started
- 2026-11-10 session/android-ux-test: chat started
- 2026-11-02 session/android-ux-test: Fixing all Android test findings from the 2026-11-01 deck
