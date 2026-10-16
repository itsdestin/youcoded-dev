---
id: 108
title: Lag with 17 or more Claude Code sessions open
stage: planning
priority: P3
tags: perf, terminal, desktop, performance
report: docs/archive/investigations/2026-10-04-performance-gap-review.md
branch: 108-with-17-or-more-claude
roadmap: perf: With 17 or more Claude Code sessions open, terminals fight o
created: 2026-10-15
summary: Past 16 Claude Code sessions, terminals lose graphics speed and switching chats can freeze briefly.
area: Chat
side: behind
platform: Desktop only
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (perf, status confirmed, seen on desktop, last checked 2026-10-04)
With 17 or more Claude Code sessions open, terminals fight over graphics. Every session builds a graphics-accelerated terminal at start even if you never leave chat view, and the system allows only 16. At 20 sessions (software-drawn rig, one run) 4 terminals ended with no working graphics and chat switching showed 12 freezes (worst 173 ms). Fine up to 16. Options: build the terminal only when first shown, or share one
