---
id: 110
title: Comparing two big, different files freezes the app
stage: merged
priority: P3
tags: perf, tool-cards, desktop, performance, bug
report: docs/archive/investigations/2026-10-04-performance-gap-review.md
branch: 110-comparing-two-large-unrelated-files
roadmap: perf: Comparing two large, unrelated files in an edit card freezes
created: 2026-10-15
summary: An edit card showing changes between two large, unrelated files can freeze the app for seconds, even when collapsed.
area: Chat
side: behind
platform: Desktop only
vision: chat.converse
work: session/93-file-viewer-freezes
---
Progress
Done: Exact off-thread comparisons merged in itsdestin/youcoded#665 as 254ff9983aa3657a937dfd65011beb3c6e6508c9. Final desktop verification: 5546 related tests passed, 36 skipped; 136 focused passed; all nine gates passed. Remote CI passed four Linux shards/four packages and Android JVM/debug/releaseTest APK builds. Historical isolated 10000-line probe retained 20000 rows and reduced typing wait from 11693 ms to 47 ms; not a new final-binary benchmark.
Next: Source integration complete. Release/installation is separate; original JPEG incident remains unresolved on #93.
Blocked: No source-integration blocker. No phone/device runtime or production-effectiveness claim.

Chats
- 2026-10-18 session/93-file-viewer-freezes: Implemented exact background comparisons with bounded small fast path, cancellation, hidden-chat handling and regression tests.

From the old roadmap (perf, status confirmed, seen on desktop, last checked 2026-10-04)
Comparing two large, unrelated files in an edit card freezes the app: 0.65 s at 2,000 lines, 4.3 s at 5,000, 19 s at 10,000 (similar files: 0.09 s), no time limit, even for collapsed cards. Rare, because both engines normally supply a ready-made comparison
