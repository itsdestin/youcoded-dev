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
Done: Owner confirmed installed native English predictions are now working after normal package update/login refresh. Current-word completion already uses EN/ES/FR/DE profile dictionaries. Corrective source160588b remains frozen/CIgreen on165; installed package/source preserved. New isolated feature/170-multilingual-prediction branch created from160588b for owner-requested other-language suggestions.
Next: Destin (2026-10-22) approved: own fully open ~5M-parameter next-word models trained on existing open data only (FineWeb-2 plus a filtered casual slice, Common Voice CC0, OpenAssistant Apache; Tatoeba as test set). Spanish pilot first on rented 8x RTX 4090 with a 10-15 dollar prepaid budget; setup is built and tested free on the Z13 first. Gemma/Qwen-class downloads dropped.
Blocked: Non-English contextual model/vocabulary assets do not currently exist in pinned packs; wordfreq frequencies alone are not contextual predictions. Data/model provenance and real language-specific behavior must be implemented, not only capability flags. Existing ARM/finalFlatpak release acceptance remains tracked separately on165.

Chats
- 2026-10-21 session/170-multilingual-prediction: chat started
- 2026-10-21 session/170-multilingual-prediction: chat started
- 2026-10-21 session/170-multilingual-prediction: chat started
- 2026-10-21 session/170-multilingual-prediction: chat started
- 2026-10-19 session/170-swipe-next-word: chat started
- 2026-10-19 session/170-swipe-next-word: chat started
