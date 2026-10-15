---
id: 100
title: Theme and animation costs on screen (3 things)
stage: planning
priority: P3
tags: perf, performance
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
