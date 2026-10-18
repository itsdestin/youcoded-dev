---
id: 162
title: Linux updates: show installer progress and outcome
stage: planning
tags: desktop, linux, updates, bug
branch: 162-linux-updates-show-installer-progress
created: 2026-10-18
why: On Linux, Launch installer gives no real feedback after I enter my sudo password; investigate and fix.
work: session/162-linux-update-feedback
---
Progress
Done: Implemented isolated Linux update feedback: bounded real installer output, explicit password/activity/restart states, preserved final diagnostics, retained close/reopen status, single-flight installs and truthful timeout/late outcomes. Final desktop verify passed: 5922 tests, types, knip, lint, design lint, invariants, screens and journeys; fresh reviewer found no blockers. No real privileged installer or live app change.
Next: Destin reviews the before/after deck; app changes remain uncommitted and unshipped.
Blocked: No implementation blocker. Real privileged package replacement/relaunch deliberately not exercised on the working install.

Chats
- 2026-10-18 session/162-linux-update-feedback: chat started
- 2026-10-18 session/162-linux-update-feedback: chat started
