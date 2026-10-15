---
id: 100
title: Theme and animation costs on screen (3 things)
stage: planning
priority: P3
tags: perf, performance, themes-screen
branch: 100-theme-and-animation-costs-on
roadmap: perf: Theme and animation costs on screen (3 things).
created: 2026-10-15
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (perf, status confirmed, seen on all, last checked 2026-07-31)
Theme and animation costs on screen (3 things). (a) Theme mascot companions may animate at full display refresh rate, unmeasured (report: docs/active/investigations/2026-09-26-startup-resume-real-scale.md); (b) community CSS may keep an always-visible animation running at full rate when Reduced Effects is off (report: docs/active/investigations/2026-09-01-theme-css-animation-unsanitized.md); (c) other card grids may repeat the per-tile blur cost found in the command drawer. Update 2026-10-05: `scripts/perf-lab/gpu-cost.mjs` measures per-process GPU time with no visible window (companion theme and card-grid scenes not yet built). Findings are in the theme-GPU entry below.

Merged in #105 "Themes may cost more graphics work than they should; all found by reading except the first real-GPU readings…" (Destin, roadmap-move deck, 2026-10-15)
From the old roadmap (perf, status decision, seen on all, last checked 2026-10-05)
Themes may cost more graphics work than they should; all found by reading except the first real-GPU readings of 2026-10-05, and all need a real graphics card: particle themes make every glass chat bubble re-blur 30 times a second (6 of 8 registry themes); two registry wallpapers are 8K (~132 MB each decoded); theme fonts download after the app shows; Reduce Visual Effects does not touch wallpaper size, custom blur or the buddy breathing loop. Readings: particle plus glass themes ~4% of the chip idle, glass themes 11-15% while streaming vs 2.4% plain; Reduce Visual Effects returns both to plain cost. Owner decision: the default for particle/glass effects on weaker hardware
