---
id: 45
title: Downloads: one shared downloader, with Gemma's licence shown
stage: planning
priority: P1
tags: local-models, local-models-screen, desktop, bug
report: docs/active/handoffs/2026-10-20-product-formalization-status.md
branch: 45-gemma-models-download-with-no
roadmap: local-models: Gemma models download with no licence notice, and Google's G
created: 2026-10-15
summary: Models, the engine and voice each download differently; one shared downloader should also show Google's Gemma licence terms.
area: Settings
side: screens
vision: chat.converse.local
---
Progress
Done: Downloads for the app's own models now stop safely if the disk fills up (shipped in 1.3.x, youcoded PR #497 and commit 40a01e22b). The shared download code is not yet merged: models, the engine and voice each still download in their own way. 2026-11-11 chat-engine batch: checked against code, nothing built. No licence or terms text exists on any model download screen. Gemma 4 E4B, 12B and 26B-A4B are offered in Settings, Local models; first-run setup can also pick Gemma 4 E4B by itself on computers with 12 to 16 GB of memory, so a notice is needed there too. Three downloaders and four checksum helpers: still accurate.
Next: Destin to approve the Gemma notice wording and where it shows (Local models screen, first-run setup, Add from Hugging Face). Merging the downloaders stays on hold.
Blocked: Nothing recorded as blocking. Refactor is on hold by Destin's choice since 2026-09-18.

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

2026-10-18 release scope decision — deferred from 1.3.1 by Destin; see #29 for the current-build release scope and requirements that remain mandatory. This item stays open and is not marked fixed or shipped.
