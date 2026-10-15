---
id: 105
title: Themes may cost more graphics work than they should; all found by reading except the first real-GPU readings…
stage: explore
priority: P3
tags: perf, themes-screen, performance
report: docs/archive/investigations/2026-10-05-theme-gpu-measurement.md
branch: 105-themes-may-cost-more-graphics
roadmap: perf: Themes may cost more graphics work than they should; all fou
created: 2026-10-15
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (perf, status decision, seen on all, last checked 2026-10-05)
Themes may cost more graphics work than they should; all found by reading except the first real-GPU readings of 2026-10-05, and all need a real graphics card: particle themes make every glass chat bubble re-blur 30 times a second (6 of 8 registry themes); two registry wallpapers are 8K (~132 MB each decoded); theme fonts download after the app shows; Reduce Visual Effects does not touch wallpaper size, custom blur or the buddy breathing loop. Readings: particle plus glass themes ~4% of the chip idle, glass themes 11-15% while streaming vs 2.4% plain; Reduce Visual Effects returns both to plain cost. Owner decision: the default for particle/glass effects on weaker hardware
