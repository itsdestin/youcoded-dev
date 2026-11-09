---
id: 213
title: Android test findings: startup crash, sync, attach, phone screens and polish
stage: build
tags: android, bug, release-blocker, user-interface
branch: 213-android-test-findings-startup-crash
finish: Every yes in findings.questions.answers.json is fixed and verified on a real phone; report at docs/active/investigations/2026-11-01-android-ux-test/report.md
created: 2026-11-02
why: A hands-on phone test on 2026-11-01 found the Android app can't start its assistant, sync never works, attach file is dead, a new user's first Claude chat sticks on hidden setup screens, and the phone shows computer screens. Destin answered every finding on docs/active/design/2026-11-01-android-findings/findings.questions.json; fix all, release together with other workstreams. Related: #1, #133, #139, #177.
work: session/android-ux-test
---
Progress
Done: All 34 findings answered or fixed; phone layout, keyboard, terminal, density and polish rounds; fullscreen display mode and No folder on the phone, both checked by Destin 2026-11-09. Direct terminal typing tried and reverted (branch experiment/phone-terminal-typing). Status: docs/active/investigations/2026-11-01-android-ux-test/report.md on the branch
Next: Destin's merge decision; app, workspace and wecoded-marketplace branches session/android-ux-test (Worker must deploy with the app for game rooms). Release with other workstreams
Blocked: nothing

Chats
- 2026-11-02 session/android-ux-test: Fixing all Android test findings from the 2026-11-01 deck
