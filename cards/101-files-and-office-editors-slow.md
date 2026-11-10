---
id: 101
title: Files and Office editors: slow cases
stage: planning
priority: P3
tags: perf, files-panel, desktop, performance, polish
branch: 101-files-and-office-editors-slow
created: 2026-10-15
summary: Huge files can pause on open, big spreadsheets freeze while saving, and each open Office file keeps using memory.
area: Files & documents
side: behind
platform: Desktop only
vision: chat.files.office
---
Progress
Done: Large spreadsheets and big Word files now open without freezing the window (merged to master 2026-10-24, PR youcoded#695, commit 8ce7e709f). Opening a 200,000-row spreadsheet went from a 1.7-second freeze to 0.46 seconds (per card 93). Background sleeping for Office documents is already in place (office-store.ts:16). Not yet released: the last release was v1.3.3 on 2026-10-23.
Next: Re-measure the remaining cases in a dev instance: a large Markdown file opening in the Files viewer, saving a 20 MB spreadsheet while typing, restoring an old Office version, and memory with several Office tabs open. Then decide which 2 to 3 items to keep.
Blocked: Windows and Mac are not measured. Each remaining case needs a real run to confirm.

Chats

From the old roadmap (perf, status confirmed, seen on desktop, last checked 2026-09-01)
Files and Office editors: slow and memory-hungry cases (6 things). (a) A very large Markdown file pauses ~939 ms on open; plain code versus lazy colouring is a product call; (b) editing a file, copying code or navigating an HTML preview can stutter, unmeasured (report: docs/active/investigations/2026-09-01-artifact-viewer-spikes.md); (c) restoring a kept Office version copies all pictures needlessly; (d) one hung project file list can block the next project's list; (e) on a 20 MB Excel sheet typing freezes ~2 s at each autosave; (f) every open Office document keeps its editor loaded, so memory grows per tab.
