---
id: 47
title: Model picker: empty on new devices, and speed/cost tags
stage: planning
priority: P2
tags: local-models, model-picker, performance, user-interface, sync, bug
branch: 47-the-model-list-says-whether
roadmap: local-models: The model list says whether a model FITS and nothing about w
created: 2026-10-15
summary: The model picker can be empty on a new or second device, and its rows don't say how fast, costly or smart a model is.
area: Chat
side: screens
work: session/model-picker-tags
vision: yours.model.tags, yours.model.any
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

Merged in #128 "Model picker is empty on a new or second device"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (sync, status confirmed, seen on all, last checked 2026-09-06)
Starring a model as a favourite on one device leaves the model picker on your other device empty until you type, since favourites never leave the device (youcoded#279, 2026-07-31). Same empty list, second cause (2026-09-06): a FRESH install has no favourites, so the picker offers nothing — not downloaded local models, not even a Claude one — until you guess a name. Destin read it as "local models are missing". A fix must cover both: syncing helps the second device, not first run.
