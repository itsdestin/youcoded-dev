---
id: 47
title: The model list says whether a model FITS and nothing about whether it will be fast
stage: planning
priority: P2
tags: local-models, model-picker, performance, user-interface
branch: 47-the-model-list-says-whether
roadmap: local-models: The model list says whether a model FITS and nothing about w
created: 2026-10-15
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (local-models, status confirmed, seen on all, last checked 2026-09-06)
The model list says whether a model FITS and nothing about whether it will be fast. Destin picked a 27B on size and got 3 tokens a second; on the Strix Halo Qwen3.8-27B (29.3 GB) writes 5.3 tokens a second while Qwen3.6-35B-A3B (the same size on disk) writes 31. Wanted: an estimated tokens-per-second tag with a red / yellow / green colour, beside the cost and intelligence tags Destin wants in the model selector. Inputs exist (the file's active-parameter count; the engine's measured rate of the last reply). Undecided: what the colours mean (bands are hardware-relative), how an unrun model is estimated, whether hosted models get the tag.

Merged in #136 "Model rows in the picker carry no cost or intelligence tags, so choosing means knowing the names" (Destin, roadmap-move deck, 2026-10-15)
From the old roadmap (user-interface, status confirmed, seen on all, last checked 2026-09-06)
Model rows in the picker carry no cost or intelligence tags, so choosing means knowing the names. Destin 2026-09-06: "the cost/intelligence tags i want to eventually build in the model selector". The tokens-per-second tag from local-models is meant to sit in the same strip. Undesigned: where the numbers come from (pricing is published, "intelligence" is not), what a local model shows for cost, and whether three tags fit a row with a name, source and favourite star. Destin 2026-10-05 triage (roadmap-triage-2026-10-05#11): postponed — "but a significant priority for 1.3.2/1.3.3"
