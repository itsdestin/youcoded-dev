---
id: 226
title: Local engine fixes and improvements
stage: polish
tags: local-models, settings/local-models, native-harness, performance, desktop, bug
related: 176
vision: chat.converse.local, yours.model.localsettings
branch: 226-local-engine-fixes-and-improvements
finish: On session/local-model-hardening: MTP on per model where the file supports it; tool results sized to the room left; junk summaries refused; no request left counted as running; no local-engine entries for cloud models; one consistent too-long error with Summarize; ROCm wording matches the measurements; measured, tested, verify.sh green
created: 2026-11-09
why: Destin 2026-11-08: one workstream for the local engine — the context faults found on the desktop plus everything we know about making any one model run as fast as it can on the user's hardware; to be finished in the local-model-hardening session. Reference: docs/active/investigations/2026-11-08-local-model-speed-and-context-faults.md
priority: P3
work: session/local-model-hardening
---
Progress
Done: 2026-11-12: both review decks answered and everything decided is built and pushed (64k default, helper slots, come-back re-read, long results keep both ends + saved whole, app-written note when a full chat cannot be summarised, faster-writing safety net). Branch updated to master twice; full verify passes. Desktop test: 64k fits the 12 GB card (8.2 GB), replies 54-65 tokens/s.
Next: Independent code review findings, then Destin's word to ship. Remove ~/yc-test-226 from the desktop once it accepts logins again. File the follow-up card for wide real-world testing after his OK.
Blocked: Nothing. Backed up to GitHub 2026-11-10 (app and workspace branches session/local-model-hardening) after Destin allowed the secrets-scan exception for a model settings name in a test. Waits for his review and testing before landing.

Chats
- 2026-11-09 session/local-model-hardening: speed work (warm-up, per-chat slots) built; context faults and MTP to fix here

Merged in #48 "Local models: open decisions, faults and ideas"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (local-models, status decision, seen on desktop, last checked 2026-09-06)
Local engine: 3 open decisions. (a) Two large models loaded together took the whole machine down (Qwen3.5-122B plus Qwen3.6-35B, 2026-08-16). The warning is fixed with honest numbers; still open is what to do when two cannot fit — Destin: warn and let me choose (report: docs/active/investigations/2026-08-16-dual-model-oom-desktop-crash.md). (b) Three faster engine builds upstream ships are not offered (Intel SYCL, newer CUDA, Android); time BOTH reading and writing on the target machine first, since ROCm wrote replies 24-46% slower. (c) Parity with LM Studio / Ollama / Jan: still missing are unloading a model by hand, embeddings for local search, a draft-model picker and a real hardware page (report: docs/active/investigations/2026-09-04-local-model-runner-audit.md).

Merged in #49 "Local models screen: three small faults"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (local-models, status confirmed, seen on all, last checked 2026-09-05)
Local models screen: 3 small faults. (a) Installing the engine asks the computer to unpack the download with a program the app does not ship, so a machine without it fails at a step the user didn't know existed. (b) On a computer whose models were downloaded earlier, Model Providers shows no "Add vision" links until you close and reopen the screen, so a user may never be offered vision; the fix needs a new push from the main process (desktop, Android and remote parity). (c) Auto-sleep (15 min idle) and engine shutdown (25 min idle) are fixed; they should be settable in the Assistant settings panel.

Merged in #50 "Ideas for local models (two)"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (local-models, status parked, seen on desktop, last checked 2026-07-13)
Parked ideas: 2 local-model ideas. (a) A "Run in background" option keeping downloaded models serving other tools after the YouCoded window closes; only if real demand shows. (b) DiffusionGemma support; revisit when mainline llama.cpp can serve it.
