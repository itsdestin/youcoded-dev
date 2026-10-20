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
Done: Merged/pushed app PR #662 as a6c47f79ae4120aea48e0e5c514a420ce81d5de7 and archive/workspace PR #287 as b5237db37185db1cd60856be186bd49e8df28257. Both CI gates passed. Source merged tree matches verified candidate; archived records match checked candidate, with one unrelated concurrent #93 bookkeeping entry preserved. Evidence is privately retained outside disposable worktrees.
Next: Complete. Independent stronger report-acceptance protocol boundary remains under #71, and close-out-tool false positives under #22; those cards stay open.
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
