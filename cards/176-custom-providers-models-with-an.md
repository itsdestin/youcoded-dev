---
id: 176
title: Custom AI models: long chats fail, and the app can't offer to shorten them
stage: explore
tags: providers, native-runtime, bug, known-issue
branch: 176-custom-providers-models-with-an
finish: A custom-provider model of unknown size either plans with a safe size or recovers through Summarize and continue when the provider says the conversation is too long
created: 2026-10-21
why: Known issue shipped in 1.3.2 (release review 2026-10-21). An unknown cloud model window is assumed 250k (harness/compaction.ts UNKNOWN_CLOUD_WINDOW); custom endpoints' model lists live in memory only, and many /models answers omit context size. A 64k/128k model then gets over-limit requests, and recovery only recognises code context_length_exceeded (providers/context-overflow.ts), so other wording shows the red card with no Summarize and continue.
---
Progress
Done: Most of this shipped on 2026-10-21 in PR #668 (custom providers). Models with unknown size now assume a smaller working size when they run on this computer (32k), and custom endpoints that send the standard "too long" code now get the Summarise option.
Next: DESTIN'S CHOICE (gap 1, nothing changed yet; written 2026-11-10 by the release-safety session). Today: when a hosted custom model's size is unknown the app plans for 250k and summarises a long chat at about 231k. You cannot type a size when adding a model, and the app never remembers a size from an error. A smaller model (32k, 128k) fails on a long chat before any summary; Summarise appears only if the provider sends the standard 'too long' code. OPTION A, keep 250k: big-model chats keep full detail longest and nothing changes for anyone; models of 200k or less still fail on long chats. OPTION B, lower it to 128k (summaries start near 111k): removes the failure for the most common hosted size; models of 200k to 1M get summarised earlier than needed, so they lose detail sooner and wait for more summaries; 64k and 32k models still fail; applies to every unknown hosted custom model, including ones already saved, from its next chat. Recommended: B, because a failed long chat is worse than an early summary. Bigger alternative that fixes the cause (a design change, not part of this card's note): ask for the size when adding a model, or learn it from the first 'too long' error. Where: desktop/src/main/harness/compaction.ts:11-12. Gap 2 (endpoints that word 'too long' differently) stays parked until a real endpoint's error text is captured.
Blocked: nothing; the second gap needs a real custom endpoint's error text to confirm.

Chats
