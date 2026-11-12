---
id: 109
title: Make the app open faster
stage: planning
priority: P3
tags: perf, window-chrome, desktop, performance, polish
report: docs/archive/investigations/2026-10-04-performance-gap-review.md
branch: 109-launch-takes-about-1-3
created: 2026-10-15
summary: The app takes about 1.3 seconds to open with a blank window, partly because rarely used screens load up front.
area: Getting started
side: behind
platform: Desktop only
vision: everywhere.platforms.desktop
---
Progress
Done: Overnight 2026-11-12: tried to re-measure with the speed lab, but the computer never got quiet (load 40-128 from other sessions), so no numbers and no changes.
Next: Re-run the lab on an idle machine (startup, history, workload, terminal, artifacts, scrollback phases). See speed REPORT notes.
Blocked: the current launch time is not measured yet, so the 1.3 s figure is old.

Chats

From the old roadmap (perf, status confirmed, seen on desktop, last checked 2026-10-04)
Launch takes about 1.3 s and the single 3.19 MB main script costs roughly 0.31 s of it to evaluate. Settings, Marketplace, chess and the QR code are still inside it rather than loaded on first use, and the window sits blank about 0.45 s. Splitting means a brief first-open pause for those screens

From the 2026-10-16 document sweep
- First paint waits on a `claude auth status` call (3-second cap); check and remove the wait (unverified). Source: docs/archive/investigations/2026-08-26-perf-lab-plan-corrections.md
