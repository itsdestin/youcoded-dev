---
id: 48
title: Local models: three open decisions
stage: explore
priority: P3
tags: local-models, settings/local-models, desktop, performance
branch: 48-local-engine-3-open-decisions
roadmap: local-models: Local engine: 3 open decisions.
created: 2026-10-15
summary: What to do when two big models won't fit together, whether to offer faster engine versions, and features other local-model apps have.
area: Settings
side: both
platform: Desktop only
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (local-models, status decision, seen on desktop, last checked 2026-09-06)
Local engine: 3 open decisions. (a) Two large models loaded together took the whole machine down (Qwen3.5-122B plus Qwen3.6-35B, 2026-08-16). The warning is fixed with honest numbers; still open is what to do when two cannot fit — Destin: warn and let me choose (report: docs/active/investigations/2026-08-16-dual-model-oom-desktop-crash.md). (b) Three faster engine builds upstream ships are not offered (Intel SYCL, newer CUDA, Android); time BOTH reading and writing on the target machine first, since ROCm wrote replies 24-46% slower. (c) Parity with LM Studio / Ollama / Jan: still missing are unloading a model by hand, embeddings for local search, a draft-model picker and a real hardware page (report: docs/active/investigations/2026-09-04-local-model-runner-audit.md).
