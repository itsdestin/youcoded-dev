---
id: 110
title: Comparing two big, different files freezes the app
stage: planning
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
Done: Implemented and independently reviewed on session/93-file-viewer-freezes; not committed or installed. Isolated Electron 10,000-line comparison: typing wait 11,693 ms before versus 47 ms while worker computation continued; complete 20,000-row result retained. All desktop verification passed: 5,306 tests passed, 36 skipped; worker production asset executed successfully.
Next: Owner review and separately authorized publication/release. Keep the original image-opening incident distinct; its cause remains unconfirmed.
Blocked: No implementation blocker. Installed app is unchanged; Windows/macOS and phone runtime have not been exercised here.

Chats
- 2026-10-18 session/93-file-viewer-freezes: Implemented exact background comparisons with bounded small fast path, cancellation, hidden-chat handling and regression tests.

From the old roadmap (perf, status confirmed, seen on desktop, last checked 2026-10-04)
Comparing two large, unrelated files in an edit card freezes the app: 0.65 s at 2,000 lines, 4.3 s at 5,000, 19 s at 10,000 (similar files: 0.09 s), no time limit, even for collapsed cards. Rare, because both engines normally supply a ready-made comparison
