---
id: 176
title: Custom providers: models with an unknown conversation size hit 'too long' errors Summarize can't fix
stage: explore
tags: providers, native-runtime, bug, known-issue
branch: 176-custom-providers-models-with-an
finish: A custom-provider model of unknown size either plans with a safe size or recovers through Summarize and continue when the provider says the conversation is too long
created: 2026-10-21
why: Known issue shipped in 1.3.2 (release review 2026-10-21). An unknown cloud model window is assumed 250k (harness/compaction.ts UNKNOWN_CLOUD_WINDOW); custom endpoints' model lists live in memory only, and many /models answers omit context size. A 64k/128k model then gets over-limit requests, and recovery only recognises code context_length_exceeded (providers/context-overflow.ts), so other wording shows the red card with no Summarize and continue.
---
Progress
Done: nothing yet.
Next: plan it.
Blocked: nothing.

Chats
