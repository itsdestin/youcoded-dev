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
Done: Integrated recovery/readiness/draft/claim fixes and approved blur with app master 2cbea2563; all conflicts resolved. Combined verify: 10606 tests, 36 skips, 422 screens, 8 journeys plus all gates; Android shared backend package and 108 unit tests green; fresh focused integration reviews clear. Actual 16-history stalled-tool recovery visible in 2.96s, prefixes unchanged. Superseded records archived; current record docs/active/plans/welcome-back-tools-readiness.md.
Next: On explicit shipping authorization, create/review feature commits, run public-repo secret scan and remote/CI gates, publish/merge, then archive the current plan/design, close #163 with the actual remote ref and clean only confirmed merged session worktrees.
Blocked: No remaining known integration finding in reviewed scope. Source/docs are local and staged, not feature-committed or published. Full native-runtime/device packaging and universal crash/disk-full exactly-once guarantees are not claimed.

Chats
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
