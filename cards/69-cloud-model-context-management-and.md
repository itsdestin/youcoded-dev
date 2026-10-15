---
id: 69
title: Cloud model context management and cache and cost efficiency — one item so the fixes are specced together
stage: planning
priority: P2
tags: native-harness, cost, desktop
report: docs/active/handoffs/2026-09-09-cache-efficiency-followups-START-HERE.md
branch: 69-cloud-model-context-management-and
roadmap: native-harness: Cloud model context management and cache/token efficiency —
created: 2026-10-15
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (native-harness › cost, status confirmed, seen on desktop, last checked 2026-09-17)
Cloud model context management and cache/token efficiency — one item so the fixes are specced together. Native compaction shipped 2026-09-23 (youcoded#559) and closed its sub-items. Still open: (a) Cache efficiency: resumed cloud sessions drift between OpenRouter endpoints or resend a changed opening prompt; local models re-read the whole conversation each helper turn. Most breakers shipped (youcoded#461, #464); left are the Reuse chip's display of expected versus surprise misses (deck for Destin) and a measurement pass. ChatGPT is measured (a missing routing label cost a third of follow-ups; fix on a branch, 13/20 → 18/20); OpenRouter and local are unmeasured. (b) Nothing is restored after compaction; Claude Code re-reads recently used files. (c) Tool output caps are fixed numbers (Read 100k characters, others 30k), not a share of the model's window.
