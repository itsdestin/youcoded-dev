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
Next: two gaps remain. A hosted custom model of unknown size still assumes 250k, which is too big for many models, and a custom endpoint that words its "too long" error differently still shows the error with no Summarise option. Plan these two fixes.
Blocked: nothing; the second gap needs a real custom endpoint's error text to confirm.

Chats
