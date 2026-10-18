---
id: 163
title: Restore Welcome back sessions quickly and safely
stage: build
tags: chat-data, desktop, performance, bug
vision: chat.converse.resume
branch: 163-restore-welcome-back-sessions-quickly
finish: Selected conversations begin restoring concurrently. A slow or failed restore does not prevent other conversations starting; existing ownership and message-integrity safeguards remain in place.
created: 2026-10-18
why: Sessions reopen one-by-one after a crash or power cut and can take a VERY long time, especially with background servers. Investigate and fix it without losing messages or introducing races.
work: session/welcome-back-recovery
---
Progress
Done: Concurrent recovery implemented; 83 focused regressions and 48 native resume/background safety tests passed. Fresh reviewer has no outstanding findings after explicit second-transfer deferral fix. Existing admission, writer ownership and transcript paths preserved.
Next: Resolve intermittent unrelated Pages Kit menu screenshot failure, then rerun final full desktop verification.
Blocked: Final verification: screenshot pair occasionally looks identical; a worker is investigating the capture-readiness race. Recovery code is local, uncommitted and unshipped.

Chats
- 2026-10-18 session/welcome-back-recovery: Investigating and fixing serial crash recovery with concurrent restore and ownership/message safety tests
