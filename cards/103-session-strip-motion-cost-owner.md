---
id: 103
title: Session-strip motion cost (owner decision): the session pill resizing and the chat-arrival fade run style and…
stage: explore
priority: P3
tags: perf, chat, desktop, performance
report: docs/archive/investigations/2026-10-05-session-switch-fix.md
branch: 103-session-strip-motion-cost-owner
roadmap: perf: Session-strip motion cost (owner decision): the session pill
created: 2026-10-15
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

See also #21: Both are about the motion of the session strip when switching sessions: 21 redesigns how it is reviewed, 103 asks whether a cheaper-looking version is acceptable.

Chats

From the old roadmap (perf, status decision, seen on desktop, last checked 2026-10-08)
Session-strip motion cost (owner decision): the session pill resizing and the chat-arrival fade run style and layout work every frame of a switch (about 27 style recalcs, 20 layouts, ~80 "Animation"-reason recalcs). A transform-based version is not pixel-identical, so nothing changed. Decide whether a cheaper look is acceptable; the rules in `.claude/rules/session-strip-motion.md` forbid changing the motion otherwise
