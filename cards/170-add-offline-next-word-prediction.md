---
id: 170
title: Add offline next-word prediction to Swipe Keyboard
stage: planning
tags: feature, swipe-keyboard
branch: 170-add-offline-next-word-prediction
finish: Reviewed next-word feature with tested correction-to-prediction transitions, safe insertion and regression coverage; exact platform package acceptance before release.
created: 2026-10-19
why: Destin requested a separate parallel feature track: after confirming a swiped word or pressing Space, reuse the suggestion bar for next-word predictions like Gboard. Keep swipe corrections distinct from insertion, on-device inference, password/focus safeguards and default-off recording. Separate from platform compatibility item168.
work: session/170-swipe-next-word
---
Progress
Done: Owner authorized next-word prediction as separate parallel feature track. Registered workspace170-swipe-next-word; read-only designer16915281-3150-47cd-9130-ec4fefc48e1a preparing concrete shared-core/bar-state/TDD contract. No feature code claimed.
Next: Review compact design and shared profile/generation interface, then isolate accepted current-source baseline and implement/test with single-writer coordination; Deck VM work remains separate.
Blocked: One write-capable specialist at a time; current concurrency is independent design/research. No cloud/personalization, privacy weakening, source commits or host activation approved.

Chats
- 2026-10-19 session/170-swipe-next-word: chat started
- 2026-10-19 session/170-swipe-next-word: chat started
