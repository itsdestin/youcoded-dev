---
id: 163
title: Restore Welcome back sessions quickly and safely
stage: polish
tags: chat-data, desktop, performance, bug
vision: chat.converse.resume
branch: 163-restore-welcome-back-sessions-quickly
finish: Selected conversations begin restoring concurrently. A slow or failed restore does not prevent other conversations starting; existing ownership and message-integrity safeguards remain in place.
created: 2026-10-18
why: Sessions reopen one-by-one after a crash or power cut and can take a VERY long time, especially with background servers. Investigate and fix it without losing messages or introducing races.
work: session/welcome-back-recovery
---
Progress
Done: Concurrent crash recovery implemented and independently reviewed. Final desktop verify exited 0: 2,416 tests passed (36 skipped), types/test types, knip/lint/design lint/ast-grep, 391/391 screen captures and journeys. Separate focused recovery suites: 83 passed; native resume/background subset: 48 passed. Fixed timer-based screenshot-fixture race exposed by verification, with red/green test and visual check.
Next: User review; changes remain on local session/welcome-back-recovery, uncommitted and unshipped.
Blocked: No implementation blocker. Actual power-cut recovery on installed app and Android build were not tested; live app untouched.

Chats
- 2026-10-18 session/welcome-back-recovery: Investigating and fixing serial crash recovery with concurrent restore and ownership/message safety tests
