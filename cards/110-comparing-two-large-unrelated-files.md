---
id: 110
title: Comparing two big, different files freezes the app
stage: planning
priority: P3
tags: perf, tool-cards, desktop, performance
report: docs/archive/investigations/2026-10-04-performance-gap-review.md
branch: 110-comparing-two-large-unrelated-files
roadmap: perf: Comparing two large, unrelated files in an edit card freezes
created: 2026-10-15
summary: An edit card showing changes between two large, unrelated files can freeze the app for seconds, even when collapsed.
area: Chat
side: behind
platform: Desktop only
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (perf, status confirmed, seen on desktop, last checked 2026-10-04)
Comparing two large, unrelated files in an edit card freezes the app: 0.65 s at 2,000 lines, 4.3 s at 5,000, 19 s at 10,000 (similar files: 0.09 s), no time limit, even for collapsed cards. Rare, because both engines normally supply a ready-made comparison
