---
id: 45
title: Downloads: one shared downloader, with Gemma's licence shown
stage: planning
priority: P1
tags: local-models, local-models-screen, desktop, bug
release: v1.3.1
report: docs/active/investigations/2026-09-03-formalization-costs-and-risks.md
branch: 45-gemma-models-download-with-no
roadmap: local-models: Gemma models download with no licence notice, and Google's G
created: 2026-10-15
summary: Models, the engine and voice each download differently; one shared downloader should also show Google's Gemma licence terms.
area: Settings
side: screens
vision: chat.converse.local
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (local-models, status confirmed, seen on all, last checked 2026-09-03)
Gemma models download with no licence notice, and Google's Gemma terms require passing their use restrictions on to the user; Qwen and GPT-OSS are Apache-licensed and need nothing.

Merged in #46 "One shared downloader for models, engine and voice"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: yes — the old roadmap marked it blocked; see below.

Chats

From the old roadmap (local-models, status blocked, seen on desktop, last checked 2026-09-18)
The file downloader exists three times (model files, engine, voice assets) and the checksum helper four times, so a fix to one (like the disk-full crash guard) must be repeated in the others. Wanted: one download-and-verify module every caller uses, one disk-full test covering all three, and the engine manager's three direct calls going through the supervisor's tracked path (simplification phase 5, D7 and D12). Nothing changes on screen. On hold since 2026-09-18 (Destin); resumes with the rest of phase 5.
