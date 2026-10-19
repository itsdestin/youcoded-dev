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
Done: Runtime-tested rendering fixes independently reviewed and desktop verify passed: 2,491 tests (36 skipped), all391screens/journeys/types/lint/knip/ast-grep. Corrected repeats: 16 copied real native chats61.61MiB leave WelcomeBack1.51–1.53s; four actual background-Bash server crash histories1.23s. Mixed13native+3actualClaudeCLI over164.37MiB: 1.88–2.36s dismissal across3runs; CLI resume hooks by1.46s. Synthetic precrashUUIDs and real/transcript counts/prefix hashes preserved. All test instances stopped and temporary auth removed.
Next: User decision/design contract for decoupling optional tool readiness from admitted chat/history availability. Source remains local, uncommitted and unshipped; full report in docs/active/investigations/2026-10-18-welcome-back-runtime-measurements.md.
Blocked: A deliberately stalled MCP connector still holds actual WelcomeBack16.73s. Not configured in the installed native registry, but the unconditional five-second goal is not met for that failure case. Generic spawn FD rewrite rejected as unproven/unsafe; diagnostic retained privately with original scoped tests green.

Chats
- 2026-10-19 session/163-crash-resume-repair: chat started
- 2026-10-19 session/163-crash-resume-repair: chat started
- 2026-10-18 session/welcome-back-recovery: chat started
- 2026-10-18 session/welcome-back-recovery: chat started
- 2026-10-18 session/welcome-back-recovery: chat started
- 2026-10-18 session/welcome-back-recovery: chat started
- 2026-10-18 session/welcome-back-recovery: chat started
- 2026-10-18 session/welcome-back-recovery: Investigating and fixing serial crash recovery with concurrent restore and ownership/message safety tests
