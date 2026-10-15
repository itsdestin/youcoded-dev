---
id: 95
title: Main process: freezes and resource growth that can hit every window (5 things)
stage: planning
priority: P3
tags: perf, desktop, needs-repro, performance
branch: 95-main-process-freezes-and-resource
roadmap: perf: Main process: freezes and resource growth that can hit every
created: 2026-10-15
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

See also #14: Both work from the same report on blocking calls in the app's main process: 14 sorts them in a test, 95 fixes the ones that freeze windows.

Chats

From the old roadmap (perf, status confirmed, seen on desktop, last checked 2026-09-01)
Main process: freezes and resource growth that can hit every window (5 things). (a) Remaining blocking work in session/home, locked conversation writes, chat search indexing, git/sync transport, catalog reads, the project watcher and theme glass slider writes can interrupt every window (see docs/active/investigations/2026-09-24-main-blocking-calls-triage.md); (b) starring, tagging or renaming a chat triggers a later full search rebuild that may stall the app; (c) after 73 minutes with ~15 helpers changing files a dev instance reached ~2.8 GB and ran out of memory, not rechecked; (d) a file's git refresh can start up to three git processes per change; (e) the old ~250,000 file-watch count ran out of watches when a second instance opened, so remeasure on a fresh install. Update 2026-10-04 (read from code, not measured): with phone access on, memory kept for a phone that may not be connected is capped by count, not size; terminal text is ~4-8 MB per session and hook events (capped at 10,000, whole tool results) are roughly 10-150 MB for realistic long sessions. A plausible contributor for phone-access users only.
