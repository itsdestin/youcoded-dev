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
work: session/welcome-back-recovery, session/163-crash-resume-repair
---
Progress
Done: Recovery readiness, approved shared blur, post-crash storage/claim/steer safety and operation-scoped local/remote adoption fixes complete on isolated source. Final desktop verification: 10277 tests, 36 skips, 400 screens and 7 journeys green; Android shared backend packaged and 108 unit tests green. Focused durability/App reviews clear.
Next: Reconcile current app master overlaps/conflicts in an explicitly authorized integration pass, then review and verify the combined tree before publishing/closing.
Blocked: No commit/merge/push permission; source remains uncommitted. Read-only probe against app origin/master 2cbea2563: 95 incoming commits, 27 overlaps, 11 text conflicts. Previous runtime timings predate final safety follow-up; full native-runtime/device build not verified.

Chats
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
