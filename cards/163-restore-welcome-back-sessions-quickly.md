---
id: 163
title: Restore Welcome back sessions quickly and safely
stage: merged
tags: chat-data, desktop, performance, bug
vision: chat.converse.resume
branch: 163-restore-welcome-back-sessions-quickly
finish: Selected conversations begin restoring concurrently. A slow or failed restore does not prevent other conversations starting; existing ownership and message-integrity safeguards remain in place.
created: 2026-10-18
why: Sessions reopen one-by-one after a crash or power cut and can take a VERY long time, especially with background servers. Investigate and fix it without losing messages or introducing races.
work: session/welcome-back-recovery, session/163-crash-resume-repair
---
Progress
Done: Reviewed e4d98a84f: not on master, merges clean, 1708 harness tests pass with it, 13 new tests fail without it. Recommendation: land after rebase, verify.sh and two small tests (B file)
Next: Destin's yes to land
Blocked: None for this shipped recovery work. No release/tag, installed-app modification, device-runtime or Windows/macOS execution claim.

Chats
- 2026-10-20 session/welcome-back-recovery: chat started
- 2026-10-20 session/welcome-back-recovery: chat started
- 2026-10-20 session/welcome-back-recovery: chat started
- 2026-10-20 session/welcome-back-recovery: chat started
- 2026-10-19 session/163-crash-resume-repair: chat started
- 2026-10-19 session/163-crash-resume-repair: chat started
- 2026-10-19 session/163-crash-resume-repair: chat started
- 2026-10-18 session/welcome-back-recovery: chat started
- 2026-10-18 session/welcome-back-recovery: chat started
- 2026-10-18 session/welcome-back-recovery: chat started
- 2026-10-18 session/welcome-back-recovery: chat started
- 2026-10-18 session/welcome-back-recovery: chat started
- 2026-10-18 session/welcome-back-recovery: Investigating and fixing serial crash recovery with concurrent restore and ownership/message safety tests
