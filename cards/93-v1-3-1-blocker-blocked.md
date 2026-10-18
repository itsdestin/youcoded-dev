---
id: 93
title: Background freezes, memory growth and whole-file reads
stage: planning
priority: P1
tags: perf, chat, desktop, performance, needs-repro, bug
report: docs/active/plans/2026-09-16-simplification-phases.md
branch: 93-v1-3-1-blocker-blocked
roadmap: perf: **v1.3.1 blocker, blocked on simplification phase 5:** lefto
created: 2026-10-15
summary: Some spots still read whole files or keep data too long, causing background freezes and memory growth on huge chats; needed before 1.3.1.
area: Chat
side: behind
platform: Desktop only
vision: chat.converse
work: session/93-session-freezes
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: yes — the old roadmap marked it blocked; see below.

Chats
- 2026-10-18 session/93-session-freezes: chat started

From the old roadmap (perf, status blocked, seen on desktop, last checked 2026-09-26)
**v1.3.1 blocker, blocked on simplification phase 5:** leftover whole-file reads and memory waste. Two small reads still take whole files; catalog fetches can repeat; per-session file tracking outlives its session; an unused whole-history parser can turn a 112 MB file into a 224 MB string. The Resume caches already shipped (open time 1.7 s down to 0.3 s). Replayed-turn type ambiguity (D11) stays in chat-data.

Merged in #95 "Background freezes and memory growth"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

See also #14: Both work from the same report on blocking calls in the app's main process: 14 sorts them in a test, 95 fixes the ones that freeze windows.

Chats

From the old roadmap (perf, status confirmed, seen on desktop, last checked 2026-09-01)
Main process: freezes and resource growth that can hit every window (5 things). (a) Remaining blocking work in session/home, locked conversation writes, chat search indexing, git/sync transport, catalog reads, the project watcher and theme glass slider writes can interrupt every window (see docs/active/investigations/2026-09-24-main-blocking-calls-triage.md); (b) starring, tagging or renaming a chat triggers a later full search rebuild that may stall the app; (c) after 73 minutes with ~15 helpers changing files a dev instance reached ~2.8 GB and ran out of memory, not rechecked; (d) a file's git refresh can start up to three git processes per change; (e) the old ~250,000 file-watch count ran out of watches when a second instance opened, so remeasure on a fresh install. Update 2026-10-04 (read from code, not measured): with phone access on, memory kept for a phone that may not be connected is capped by count, not size; terminal text is ~4-8 MB per session and hook events (capped at 10,000, whole tool results) are roughly 10-150 MB for realistic long sessions. A plausible contributor for phone-access users only.

2026-10-18 release scope decision — deferred from 1.3.1 by Destin; see #29 for the current-build release scope and requirements that remain mandatory. This item stays open and is not marked fixed or shipped.
