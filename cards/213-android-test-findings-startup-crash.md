---
id: 213
title: Android test findings: startup crash, sync, attach, phone screens and polish
stage: polish
tags: android, bug, release-blocker, user-interface
branch: 213-android-test-findings-startup-crash
finish: Every yes in findings.questions.answers.json is fixed and verified on a real phone; report at docs/active/investigations/2026-11-01-android-ux-test/report.md
created: 2026-11-02
why: A hands-on phone test on 2026-11-01 found the Android app can't start its assistant, sync never works, attach file is dead, a new user's first Claude chat sticks on hidden setup screens, and the phone shows computer screens. Destin answered every finding on docs/active/design/2026-11-01-android-findings/findings.questions.json; fix all, release together with other workstreams. Related: #1, #133, #139, #177.
work: session/android-ux-test
---
Progress
Done: All 34 findings from the 2026-11-01 phone test are answered or fixed. Fullscreen mode and No folder on the phone were confirmed by Destin on 2026-11-09. Terminal direct-typing was tried and reverted, so it is not in the app. Nothing is merged to master yet: the work sits on three unmerged branches (app: 60 commits; workspace; marketplace: 1 commit). Full status: docs/active/investigations/2026-11-01-android-ux-test/report.md on branch session/android-ux-test.
Next: Destin's merge decision. The Worker (marketplace branch) must deploy with the app, or game rooms break. Release with other workstreams.
Blocked: nothing

Chats
- 2026-11-02 session/android-ux-test: Fixing all Android test findings from the 2026-11-01 deck
