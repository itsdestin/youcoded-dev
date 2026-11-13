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
Done: Destin, overnight deck 2026-11-13 C-7: "claude and deepseek and such definitely support higher contexts? i think 250k is good to keep, but we should ensure we handle hte potential failure cases." So: keep the 250k assumption; make the failure cases recoverable.
Next: Recognise other providers too-long refusals so Summarise is offered; consider learning a size from the first refusal; show him anything visible.
Blocked: nothing; the second gap needs a real custom endpoint's error text to confirm.

Chats
