---
id: 97
title: Speed testing: eight tools that can mislead
stage: planning
priority: P3
tags: perf, performance
branch: 97-measuring-rig-instruments-that-can
roadmap: perf: Measuring rig: instruments that can mislead (8 things).
created: 2026-10-15
summary: Several speed-testing tools can give false or noisy results, so their numbers can't yet be trusted.
area: Developer tools
side: behind
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

See also #14: Both ask for an automatic size limit on the app's main script, which has none today.

Chats

From the old roadmap (perf, status confirmed, seen on all, last checked 2026-08-28)
Measuring rig: instruments that can mislead (8 things). (a) The blank-on-switch detector never failed on a known blank case; (b) scrollblank sampling slows the renderer it judges (millions of layout reads); (c) native-chat screenshots differ run to run because a real model replies (report: docs/active/investigations/2026-09-01-perf-rig-native-chat-nondeterministic.md); (d) the artifacts rig sometimes shows an empty files drawer, about one run in nine; (e) comparisons do not measure interference during a run, so old 16-20% "regressions" stay inconclusive (report: docs/archive/investigations/2026-09-26-performance-history-audit.md); (f) software-rendered runs cannot stand for a real high-refresh screen (report: docs/active/investigations/2026-09-26-startup-resume-real-scale.md); (g) no recurring startup and idle-CPU trend (report: docs/active/investigations/2026-09-16-simplification-audit.md); (h) fresh perf worktrees re-download ~490 MB of fixture files. Update 2026-10-04/05: the standard artifacts scenario cannot open the drawer on current master (it waits for a button title and `data-artifact-viewer` the app no longer has), so its selectors need updating before it yields numbers; the review ranks a nightly trend run plus an automatic size limit on the app bundle (none exists; the main script is 3.19 MB). The hitch recorder and `scripts/perf-lab/` (README, `realism.mjs` presets) now give real-use evidence; see the entries below.
