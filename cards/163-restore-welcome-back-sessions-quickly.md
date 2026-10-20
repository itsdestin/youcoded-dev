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
Done: Merged/pushed app PR https://github.com/itsdestin/youcoded/pull/662 as a6c47f79ae4120aea48e0e5c514a420ce81d5de7. Protected CI, four Linux test shards/packages and Android JVM/debug/releaseTest builds passed; merged tree exactly matches verified candidate. Local 10606 tests/422 screens/8 journeys; actual stalled-tool recovery 2.96s, copied prefixes unchanged. Completed records: docs/archive/plans/welcome-back-tools-readiness.md and archived blur approval.
Next: No remaining implementation for this recovery task. Workspace archive publication/cleanup is being completed; independent stronger report-acceptance protocol boundary remains on #71, and close-out tooling false positives remain on #22.
Blocked: No blocker for shipped recovery. No release/tag, installed-app modification, device-runtime or Windows/macOS execution claim.

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
