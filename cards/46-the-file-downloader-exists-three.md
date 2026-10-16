---
id: 46
title: One shared downloader for models, engine and voice
stage: planning
priority: P1
tags: local-models, desktop
release: v1.3.1
report: docs/active/plans/2026-09-16-simplification-phases.md
branch: 46-the-file-downloader-exists-three
roadmap: local-models: The file downloader exists three times (model files, engine,
created: 2026-10-15
summary: The app has three separate file downloaders, so a fix like the disk-full guard must be repeated in each one.
area: Behind the scenes
side: behind
platform: Desktop only
paused: On hold since 2026-09-18 with the rest of the cleanup phase
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: yes — the old roadmap marked it blocked; see below.

Chats

From the old roadmap (local-models, status blocked, seen on desktop, last checked 2026-09-18)
The file downloader exists three times (model files, engine, voice assets) and the checksum helper four times, so a fix to one (like the disk-full crash guard) must be repeated in the others. Wanted: one download-and-verify module every caller uses, one disk-full test covering all three, and the engine manager's three direct calls going through the supervisor's tracked path (simplification phase 5, D7 and D12). Nothing changes on screen. On hold since 2026-09-18 (Destin); resumes with the rest of phase 5.
