---
id: 170
title: Add offline next-word prediction to Swipe Keyboard
stage: build
tags: feature, swipe-keyboard
branch: 170-add-offline-next-word-prediction
finish: Reviewed next-word feature with tested correction-to-prediction transitions, safe insertion and regression coverage; exact platform package acceptance before release.
created: 2026-10-19
why: Destin requested a separate parallel feature track: after confirming a swiped word or pressing Space, reuse the suggestion bar for next-word predictions like Gboard. Keep swipe corrections distinct from insertion, on-device inference, password/focus safeguards and default-off recording. Separate from platform compatibility item168.
work: session/170-swipe-next-word
---
Progress
Done: Reopened: prior Deck-only next-word delivery did NOT fulfill the owner requirement for working native CachyOS predictions. Models and worker exist, but the custom raw-policy bridge gate disables stock native backends. Owner explicitly instructed fixing this, without replacing the system backend.
Next: Implement distinct native keyboard-owned-history prediction for confirmed swipe AND tap words, retaining live/cached sensitive/restricted/preedit guards, exact-echo async invalidation and insertion-only selection. Strict bridge denial never falls back. Test actual stock native backend, update installed package only after passing. No full backend/library swap or visibility-policy change.
Blocked: Native next-word predictions are currently not working on the installed keyboard; must not call this feature complete. Stock backend hides some raw application completion preferences; native diagnostics/copy must report unknown raw policy rather than fake affirmative bridge permission. Worker135a425a owns implementation after ARM probe cleanup.

Chats
- 2026-10-19 session/170-swipe-next-word: chat started
- 2026-10-19 session/170-swipe-next-word: chat started
