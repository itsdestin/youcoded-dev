---
id: 101
title: Files and Office editors: slow cases
stage: planning
priority: P3
tags: perf, files-panel, desktop, performance, polish
branch: 101-files-and-office-editors-slow
roadmap: perf: Files and Office editors: slow and memory-hungry cases (6 th
created: 2026-10-15
summary: Huge files can pause on open, big spreadsheets freeze while saving, and each open Office file keeps using memory.
area: Files & documents
side: behind
platform: Desktop only
vision: chat.files.office
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (perf, status confirmed, seen on desktop, last checked 2026-09-01)
Files and Office editors: slow and memory-hungry cases (6 things). (a) A very large Markdown file pauses ~939 ms on open; plain code versus lazy colouring is a product call; (b) editing a file, copying code or navigating an HTML preview can stutter, unmeasured (report: docs/active/investigations/2026-09-01-artifact-viewer-spikes.md); (c) restoring a kept Office version copies all pictures needlessly; (d) one hung project file list can block the next project's list; (e) on a 20 MB Excel sheet typing freezes ~2 s at each autosave; (f) every open Office document keeps its editor loaded, so memory grows per tab.
