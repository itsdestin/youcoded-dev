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
Done: Real run-dev measurements reproduced 7.44s Welcome back dismissal. Added stable recovery focus and deferred never-visited ChatViews with red/green regressions. 16-session recovery after four actual native Bash HTTP server tasks and a guarded dev crash: 1.18s dismissal/2.03s first history signal, all prior UUIDs preserved once. Sixteen copied real root histories (61.61MiB, 31,040 events): 1.65s dismissal.
Next: Complete corrected visible-history repeat sampling, slow-connector Welcome back measurement, descriptor-isolation investigation, fresh review and final verification.
Blocked: An intentionally stalled local MCP handshake makes actual per-session resume take15.06s; this exceeds the requested five-second ceiling and requires separating optional tool readiness from history availability. No production app touched or paid evaluations run.

Chats
- 2026-10-18 session/welcome-back-recovery: chat started
- 2026-10-18 session/welcome-back-recovery: Investigating and fixing serial crash recovery with concurrent restore and ownership/message safety tests
