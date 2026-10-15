---
id: 96
title: Measuring rig: scenarios not yet measured (5 things)
stage: planning
priority: P3
tags: perf, performance
report: docs/active/investigations/2026-09-29-performance-status.md
branch: 96-measuring-rig-scenarios-not-yet
roadmap: perf: Measuring rig: scenarios not yet measured (5 things).
created: 2026-10-15
---
Progress
Done: nothing recorded.
Next: check it still happens.
Blocked: nothing recorded.

Chats

From the old roadmap (perf, status needs-verify, seen on all, last checked 2026-09-10)
Measuring rig: scenarios not yet measured (5 things). (a) Terminal session switching on a real graphics card, and a busy six-terminal feel check; (b) sustained terminal output together with typing; (c) file-pane edits to another file while streaming; (d) long-history chats as a recurring lane, plus the ~137 vs ~580 ms terminal-switch comparison; (e) long soak and memory slopes, giant bodies, tool churn, sync interference, effects-heavy and drag/resize cases. These are coverage gaps, not proven bugs. Update 2026-10-04: on the software-drawn rig terminal-view switching was near 0.55 s with 8 sessions open (chat view ~31 ms), a software-drawing figure, not a prediction for a real card; every open terminal re-draws its letters on a switch. A 200 MB flood lost output after ~50 MB and delayed Ctrl+C 5 s or more; flow control shipped 2026-10-08 (youcoded#616; 200 MB shows whole in 6-7 s, Ctrl+C 0.1 s); typing under a flood on a real card is still unmeasured. The 2026-10-05 session-switch lab and recorder are in the session-switching entry below.
