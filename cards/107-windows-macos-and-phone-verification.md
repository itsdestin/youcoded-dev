---
id: 107
title: Test speed fixes on Windows, Mac and phones
stage: planning
priority: P3
tags: perf, performance
report: docs/archive/investigations/2026-10-04-performance-gap-review.md
branch: 107-windows-macos-and-phone-verification
roadmap: perf: Windows, macOS and phone verification before release: the te
created: 2026-10-15
summary: Recent speed fixes were only hand-tested on Linux; check them on Windows, Mac and phones before release.
area: Behind the scenes
side: behind
---
Progress
Done: nothing recorded.
Next: check it still happens.
Blocked: nothing recorded.

See also #104: Both note the hitch recorder does not exist on phones and remote browsers and was checked on Linux only.

Chats

From the old roadmap (perf, status needs-verify, seen on all, last checked 2026-10-07)
Windows, macOS and phone verification before release: the terminal speed brake was checked by reading only on Windows (ConPTY) and macOS and a real minimise there was never measured (Chromium may slow a minimised window's timers to ~1 per second); trackpad pinch must zoom the app, not the page, on Windows and macOS; the hitch recorder and switch marks were checked on Linux only; Destin's hand trial was Linux only; phones and remote browsers have no recorder
