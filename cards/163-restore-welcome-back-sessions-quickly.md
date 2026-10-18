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
Done: nothing yet.
Next: plan it.
Blocked: nothing.

Chats
- 2026-10-18 session/welcome-back-recovery: Investigating and fixing serial crash recovery with concurrent restore and ownership/message safety tests
