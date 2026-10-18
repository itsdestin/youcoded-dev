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
Done: Reproduced Resume all serial barrier (only one of three creates starts while first is blocked); implemented concurrent independent restores, FIFO ownership prompts and history-isolation tests. Existing native resume/background safety subset: 48 passed.
Next: Finish fresh-review transfer-deferral regression and final desktop verification; changes remain local and unshipped.
Blocked: No live-app testing or deployment performed.

Chats
- 2026-10-18 session/welcome-back-recovery: Investigating and fixing serial crash recovery with concurrent restore and ownership/message safety tests
