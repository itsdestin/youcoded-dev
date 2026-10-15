---
id: 93
title: **v1.3.1 blocker, blocked on simplification phase 5:** leftover whole-file reads and memory waste
stage: planning
priority: P1
tags: perf, chat, desktop, performance
release: v1.3.1
report: docs/active/plans/2026-09-16-simplification-phases.md
branch: 93-v1-3-1-blocker-blocked
roadmap: perf: **v1.3.1 blocker, blocked on simplification phase 5:** lefto
created: 2026-10-15
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: yes — the old roadmap marked it blocked; see below.

Chats

From the old roadmap (perf, status blocked, seen on desktop, last checked 2026-09-26)
**v1.3.1 blocker, blocked on simplification phase 5:** leftover whole-file reads and memory waste. Two small reads still take whole files; catalog fetches can repeat; per-session file tracking outlives its session; an unused whole-history parser can turn a 112 MB file into a 224 MB string. The Resume caches already shipped (open time 1.7 s down to 0.3 s). Replayed-turn type ambiguity (D11) stays in chat-data.
