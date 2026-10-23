---
id: 170
title: Add offline next-word prediction to Swipe Keyboard
stage: build
tags: feature, swipe-keyboard
branch: 170-add-offline-next-word-prediction
finish: Reviewed next-word feature with tested correction-to-prediction transitions, safe insertion and regression coverage; exact platform package acceptance before release.
created: 2026-10-19
why: Destin requested a separate parallel feature track: after confirming a swiped word or pressing Space, reuse the suggestion bar for next-word predictions like Gboard. Keep swipe corrections distinct from insertion, on-device inference, password/focus safeguards and default-off recording. Separate from platform compatibility item168.
work: session/170-swipe-next-word, session/170-multilingual-prediction, feature/170-open-nextword
---
Progress
Done: Gboard (14.2, emulator, learning off) vs ours measured on ES/FR/DE everyday text: ours roughly even; new ES file ahead
Next: Phase 1 of the roadmap: FR/DE/EN files
Blocked: Non-English contextual model/vocabulary assets do not currently exist in pinned packs; wordfreq frequencies alone are not contextual predictions. Data/model provenance and real language-specific behavior must be implemented, not only capability flags. Existing ARM/finalFlatpak release acceptance remains tracked separately on165.

Chats
- 2026-10-22 feature/170-open-nextword: Spanish pilot: scoring tool, fair test sets, FineWeb-2 n-gram, then own 5M model
- 2026-10-21 session/170-multilingual-prediction: chat started
- 2026-10-21 session/170-multilingual-prediction: chat started
- 2026-10-21 session/170-multilingual-prediction: chat started
- 2026-10-21 session/170-multilingual-prediction: chat started
- 2026-10-19 session/170-swipe-next-word: chat started
- 2026-10-19 session/170-swipe-next-word: chat started
