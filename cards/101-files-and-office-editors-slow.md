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
Done: Overnight 2026-11-12: tried to re-measure with the speed lab, but the computer never got quiet (load 40-128 from other sessions), so no numbers and no changes.
Next: Re-run the lab on an idle machine (startup, history, workload, terminal, artifacts, scrollback phases). See speed REPORT notes.
Blocked: Windows and Mac are not measured. Each remaining case needs a real run to confirm.

Chats

From the old roadmap (perf, status confirmed, seen on desktop, last checked 2026-09-01)
Files and Office editors: slow and memory-hungry cases (6 things). (a) A very large Markdown file pauses ~939 ms on open; plain code versus lazy colouring is a product call; (b) editing a file, copying code or navigating an HTML preview can stutter, unmeasured (report: docs/active/investigations/2026-09-01-artifact-viewer-spikes.md); (c) restoring a kept Office version copies all pictures needlessly; (d) one hung project file list can block the next project's list; (e) on a 20 MB Excel sheet typing freezes ~2 s at each autosave; (f) every open Office document keeps its editor loaded, so memory grows per tab.
