---
id: 109
title: Make the app open faster
stage: planning
priority: P3
tags: perf, window-chrome, desktop, performance, polish
report: docs/archive/investigations/2026-10-04-performance-gap-review.md
branch: 109-launch-takes-about-1-3
roadmap: perf: Launch takes about 1.3 s and the single 3.19 MB main script
created: 2026-10-15
summary: The app takes about 1.3 seconds to open with a blank window, partly because rarely used screens load up front.
area: Getting started
side: behind
platform: Desktop only
vision: everywhere.platforms.desktop
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (perf, status confirmed, seen on desktop, last checked 2026-10-04)
Launch takes about 1.3 s and the single 3.19 MB main script costs roughly 0.31 s of it to evaluate. Settings, Marketplace, chess and the QR code are still inside it rather than loaded on first use, and the window sits blank about 0.45 s. Splitting means a brief first-open pause for those screens
