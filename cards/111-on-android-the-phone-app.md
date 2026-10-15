---
id: 111
title: On Android the phone app may be slow while a reply streams, and phones get full glass blur by default with nothing tu…
stage: planning
priority: P3
tags: perf, android, performance
report: docs/archive/investigations/2026-10-04-performance-gap-review.md
branch: 111-on-android-the-phone-app
roadmap: perf: On Android the phone app may be slow while a reply streams,
created: 2026-10-15
---
Progress
Done: nothing recorded.
Next: check it still happens.
Blocked: nothing recorded.

Chats

From the old roadmap (perf, status needs-verify, seen on android, last checked 2026-10-04)
On Android the phone app may be slow while a reply streams, and phones get full glass blur by default with nothing turning it down. Both found by reading code, not measured: each session runs two terminals and rebuilds the whole 2,000-line scrollback as text on every screen update on the touch thread, plus a once-a-second scan per session; output can be dropped when the screen falls behind; the phone is kept awake whenever a session exists and four polling loops per session never pause in the background; blur is the costliest effect on phone chips. Feel: hitches, a terminal that looks frozen then jumps, battery drain
