---
id: 170
title: Add offline next-word prediction to Swipe Keyboard
stage: build
tags: feature, swipe-keyboard
branch: 170-add-offline-next-word-prediction
finish: Reviewed next-word feature with tested correction-to-prediction transitions, safe insertion and regression coverage; exact platform package acceptance before release.
created: 2026-10-19
why: Destin requested a separate parallel feature track: after confirming a swiped word or pressing Space, reuse the suggestion bar for next-word predictions like Gboard. Keep swipe corrections distinct from insertion, on-device inference, password/focus safeguards and default-off recording. Separate from platform compatibility item168.
work: session/170-swipe-next-word, session/170-multilingual-prediction
---
Progress
Done: Native English predictions implemented and demonstrated on actual stock Plasma Keyboard6.7.5/Qt6.11.2: tapped hello+Space and swipe+Space show three real words; all three touched slots insert their displayed words. Highest-confidence centered, two internal dividers/no outer edges. Synthetic sensitive transition clears suggestions and rejects stale touch. Focused fresh freeze checks4/4, integration89 passed; packaging103 with2 fixture skips. Reviewed code has no actionable P0/P1/P2. Source363fd2aca644129c5cfbd0a44f3dc635eeed197b pushed; CI39526485965 active.
Next: Use the final CI native package to update owner keyboard preserving visibility desktop0/tablet1 and legacy record. Complete final Flatpak rendering/native package checks alongside required ARM acceptance; no current-word-prefix scope expansion.
Blocked: Owner installed keyboard is still the older56d04fa candidate; do not confuse successful private native production-module demo with installed final-package delivery. ARM correction remains separate required release blocker.

Chats
- 2026-10-21 session/170-multilingual-prediction: chat started
- 2026-10-19 session/170-swipe-next-word: chat started
- 2026-10-19 session/170-swipe-next-word: chat started
