---
id: 96
title: Speed testing: unmeasured cases, misleading tools, other systems
stage: planning
priority: P3
tags: perf, performance, housekeeping
report: docs/active/investigations/2026-09-29-performance-status.md
branch: 96-measuring-rig-scenarios-not-yet
roadmap: perf: Measuring rig: scenarios not yet measured (5 things).
created: 2026-10-15
summary: Speed testing misses some situations, some of its tools can mislead, and fixes haven't been checked on Windows, Mac or phones.
area: Developer tools
side: behind
vision: together.workflow.perf
work: session/93-file-viewer-freezes
---
Progress
Done: nothing recorded.
Next: check it still happens.
Blocked: nothing recorded.

Chats
- 2026-10-18 session/93-file-viewer-freezes: Investigate hardware/document/HTML/path-list/watcher stall impact and extend the performance lab with representative workloads, independent thread signals, bounded execution and fail-closed results.

From the old roadmap (perf, status needs-verify, seen on all, last checked 2026-09-10)
Measuring rig: scenarios not yet measured (5 things). (a) Terminal session switching on a real graphics card, and a busy six-terminal feel check; (b) sustained terminal output together with typing; (c) file-pane edits to another file while streaming; (d) long-history chats as a recurring lane, plus the ~137 vs ~580 ms terminal-switch comparison; (e) long soak and memory slopes, giant bodies, tool churn, sync interference, effects-heavy and drag/resize cases. These are coverage gaps, not proven bugs. Update 2026-10-04: on the software-drawn rig terminal-view switching was near 0.55 s with 8 sessions open (chat view ~31 ms), a software-drawing figure, not a prediction for a real card; every open terminal re-draws its letters on a switch. A 200 MB flood lost output after ~50 MB and delayed Ctrl+C 5 s or more; flow control shipped 2026-10-08 (youcoded#616; 200 MB shows whole in 6-7 s, Ctrl+C 0.1 s); typing under a flood on a real card is still unmeasured. The 2026-10-05 session-switch lab and recorder are in the session-switching entry below.

Merged in #97 "Speed testing: eight tools that can mislead"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

See also #14: Both ask for an automatic size limit on the app's main script, which has none today.

Chats

From the old roadmap (perf, status confirmed, seen on all, last checked 2026-08-28)
Measuring rig: instruments that can mislead (8 things). (a) The blank-on-switch detector never failed on a known blank case; (b) scrollblank sampling slows the renderer it judges (millions of layout reads); (c) native-chat screenshots differ run to run because a real model replies (report: docs/active/investigations/2026-09-01-perf-rig-native-chat-nondeterministic.md); (d) the artifacts rig sometimes shows an empty files drawer, about one run in nine; (e) comparisons do not measure interference during a run, so old 16-20% "regressions" stay inconclusive (report: docs/archive/investigations/2026-09-26-performance-history-audit.md); (f) software-rendered runs cannot stand for a real high-refresh screen (report: docs/active/investigations/2026-09-26-startup-resume-real-scale.md); (g) no recurring startup and idle-CPU trend (report: docs/active/investigations/2026-09-16-simplification-audit.md); (h) fresh perf worktrees re-download ~490 MB of fixture files. Update 2026-10-04/05: the standard artifacts scenario cannot open the drawer on current master (it waits for a button title and `data-artifact-viewer` the app no longer has), so its selectors need updating before it yields numbers; the review ranks a nightly trend run plus an automatic size limit on the app bundle (none exists; the main script is 3.19 MB). The hitch recorder and `scripts/perf-lab/` (README, `realism.mjs` presets) now give real-use evidence; see the entries below.

Merged in #107 "Test speed fixes on Windows, Mac and phones"
Progress
Done: nothing recorded.
Next: check it still happens.
Blocked: nothing recorded.

See also #104: Both note the hitch recorder does not exist on phones and remote browsers and was checked on Linux only.

Chats

From the old roadmap (perf, status needs-verify, seen on all, last checked 2026-10-07)
Windows, macOS and phone verification before release: the terminal speed brake was checked by reading only on Windows (ConPTY) and macOS and a real minimise there was never measured (Chromium may slow a minimised window's timers to ~1 per second); trackpad pinch must zoom the app, not the page, on Windows and macOS; the hitch recorder and switch marks were checked on Linux only; Destin's hand trial was Linux only; phones and remote browsers have no recorder

From the 2026-10-16 document sweep
- The speed-test rig is blind to the per-token streaming path; file the rig fix. Source: docs/archive/handoffs/2026-08-27-perf-cycle-1-handoff.md
