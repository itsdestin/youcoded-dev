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
Next: Destin, 2026-11-10: change nothing yet; he wants to understand the choice first. A plain explanation with real model examples, the risks and benefits of each size and the other ways to solve it is at docs/active/investigations/2026-11-10-unknown-model-size-explained.md. Short form: today an unknown hosted model is assumed to be 250k, so models of 200k or less fail on long chats before the app summarises; lowering to 128k stops that for most models at the cost of earlier summaries on very large ones; the lasting cures are a size field when adding a model, learning from the first 'too long' error, or asking the provider more thoroughly. Where: desktop/src/main/harness/compaction.ts:11-12. Gap 2 (endpoints that word 'too long' differently) stays parked until a real endpoint's error text is captured.
Blocked: nothing; the second gap needs a real custom endpoint's error text to confirm.

Chats
