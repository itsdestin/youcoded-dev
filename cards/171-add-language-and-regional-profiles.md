---
id: 171
title: Add language and regional profiles to Swipe Keyboard
stage: planning
tags: feature, swipe-keyboard
branch: 171-add-language-and-regional-profiles
finish: Reviewed language/profile foundation and explicit per-locale supported or blocked matrix with Unicode/layout/model/dictionary compatibility and tests; no unsupported-language claims.
created: 2026-10-19
why: Destin requested a separate parallel multi-language/multi-region feature track. Include US/UK English and prioritize Spanish, French and German. Use real compatible licensed language assets and region-aware preferences, not a dictionary picker that falsely implies recognition/model support. Separate from platform compatibility item168.
work: session/171-swipe-languages
---
Progress
Done: Owner authorized language/region support as separate parallel feature track and chose Spanish,French,German plus US/UKEnglish. Registered workspace171-swipe-languages; read-only designer4d16a62f-0041-4d9a-8b05-8919170c2f44 assessing actual asset availability and Unicode/profile contract. No language support falsely claimed.
Next: Review initial locale/data/model contract coordinated with prediction track; implement isolated source after compact approval. Require actual compatible licensed assets and per-language quality checks, not layout-only claims.
Blocked: Non-English compatible model availability not yet established; existing English assets/ASCII wrapper are not multilingual. Code worker scheduling must respect one-writer limit.

Chats
- 2026-10-19 session/171-swipe-languages: chat started
- 2026-10-19 session/171-swipe-languages: chat started
