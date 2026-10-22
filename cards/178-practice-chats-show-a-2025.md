---
id: 178
title: Practice chats show a 2025 date under every bubble
stage: planning
tags: dev-workspace, website, workbench
related: 2
branch: 178-practice-chats-show-a-2025
finish: Workbench chat screenshots show a time like '7:40 AM', not a date; site-assets regeneration shows times; shoot pictures stay byte-identical across days
created: 2026-10-22
why: Since message times name the day (card #2), the workbench's made-up chats are dated 29 July 2025, so every screenshot and, once regenerated, the website's demo clips read 'Jul 29, 2025' under each bubble instead of a time. The fixed base time is copied in about six workbench files plus fixture lines (fixture-loader.ts, scenarios.ts, reply-script.ts, permissions.ts, sessions.ts, mock-shim.ts, claude-code.jsonl). Wanted: one shared base that is today at the same clock time, so pictures stay identical day to day and still read as today.
---
Progress
Done: nothing yet.
Next: plan it.
Blocked: nothing.

Chats
