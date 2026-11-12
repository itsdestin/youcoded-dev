---
id: 69
title: Cut cloud model costs in long chats
stage: planning
priority: P2
tags: native-harness, cost, desktop, polish
report: docs/active/handoffs/2026-09-09-cache-efficiency-followups-START-HERE.md
branch: 69-cloud-model-context-management-and
roadmap: native-harness: Cloud model context management and cache/token efficiency —
created: 2026-10-15
summary: Resumed cloud chats miss cheaper cached pricing, nothing is reloaded after a chat is summarized, and output limits are fixed.
area: Chat
side: both
platform: Desktop only
vision: chat.harness.tokens, chat.harness.compaction
---
Progress
Done: Cache fixes shipped in Sept 2026 (youcoded #461, #464, #553, #554). Native compaction with durable restore shipped 2026-09-24 (youcoded #559). Reuse chip counting fixed (#405). A 500k cloud context option shipped (#652). Per-provider output caps shipped (#670). 2026-11-11 chat-engine batch: cache reuse measured free from saved chats (docs/active/investigations/2026-11-11-cache-reuse-measured/README.md). ChatGPT unexplained misses about 4 percent since the September fixes, Anthropic 1 percent, OpenRouter 18 percent of quick follow-ups (small sample, about 11 percent of the input bill); time away costs, not reopening; a model switch always re-reads the whole chat. The ChatGPT routing-label fix SHIPPED in app PR #553 (the Blocked line was out of date).
Next: DECIDED by Destin on the wave-2 deck 2026-11-12 (docs/active/design/2026-11-12-wave-2): no paid OpenRouter run yet. His words: i think i want to more thoroughly investigate the initial chats and commit history relating to these. i thought i had some memory of doing work on this front already. i also would want to better understand how we would actually be testing. Next: a free history review (past chats, commits) of OpenRouter cache misses and a plain write-up of how the paid test would work, then ask again.
Blocked: Nothing recorded. The ChatGPT routing-label branch and the Reuse-chip deck need confirming before they can be tracked.

Chats

From the old roadmap (native-harness › cost, status confirmed, seen on desktop, last checked 2026-09-17)
Cloud model context management and cache/token efficiency — one item so the fixes are specced together. Native compaction shipped 2026-09-23 (youcoded#559) and closed its sub-items. Still open: (a) Cache efficiency: resumed cloud sessions drift between OpenRouter endpoints or resend a changed opening prompt; local models re-read the whole conversation each helper turn. Most breakers shipped (youcoded#461, #464); left are the Reuse chip's display of expected versus surprise misses (deck for Destin) and a measurement pass. ChatGPT is measured (a missing routing label cost a third of follow-ups; fix on a branch, 13/20 → 18/20); OpenRouter and local are unmeasured. (b) Nothing is restored after compaction; Claude Code re-reads recently used files. (c) Tool output caps are fixed numbers (Read 100k characters, others 30k), not a share of the model's window.

From the 2026-10-16 document sweep
- Warn in the model picker that switching models re-reads the whole conversation (slow or costly), and offer to compact first. Source: docs/active/investigations/2026-09-05-model-switch-invalidates-prompt-cache.md
- Helpers starting from the parent chat's cached opening (item 8; likely dropped). Source: docs/archive/investigations/2026-09-23-chatgpt-cache-affinity.md
