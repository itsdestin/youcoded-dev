---
id: 178
title: Made-up demo chats show "Jul 29, 2025" under every message
stage: planning
priority: P3
tags: dev-workspace, website, workbench
related: 2
branch: 178-practice-chats-show-a-2025
finish: Workbench chat screenshots show a time like '7:40 AM', not a date; site-assets regeneration shows times; shoot pictures stay byte-identical across days
created: 2026-10-22
why: Since message times name the day (card #2), the workbench's made-up chats are dated 29 July 2025, so every screenshot and, once regenerated, the website's demo clips read 'Jul 29, 2025' under each bubble instead of a time. The fixed base time is copied in about six workbench files plus fixture lines (fixture-loader.ts, scenarios.ts, reply-script.ts, permissions.ts, sessions.ts, mock-shim.ts, claude-code.jsonl). Wanted: one shared base that is today at the same clock time, so pictures stay identical day to day and still read as today.
---
Progress
Done: Landed on master 2026-11-10 (app PR #727): made-up chats are dated today at 7:40 AM from one shared place, and the workbench's own clock always starts at 8:00 AM, so pictures read '7:40 AM' and '20m ago' at any hour on any day. The real app is unaffected (confirmed by building the shipped version: the clock code is not in it). The website's live demo will show the same times.
Next: Pictures are not byte-identical between runs because of looping animations (spinner dots, pulsing stop button) - that was already true before; freezing them is a change to the shoot tool, which another session is rewriting. 143 saved website pictures and clips will differ when next regenerated.
Blocked: nothing.

Chats
