---
id: 32
title: Release and build upkeep: 6 loose ends
stage: planning
priority: P3
tags: dev-workspace, release
branch: 32-release-and-build-upkeep-6
roadmap: dev-workspace: Release and build upkeep: 6 loose ends.
created: 2026-10-15
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

See also #70: Both want the app's list of recommended models kept current instead of going stale (32a a scheduled check, 70b one maintained recommendation system).

Chats

From the old roadmap (dev-workspace › release, status confirmed, seen on n/a, last checked 2026-09-01)
Release and build upkeep: 6 loose ends. (a) wanted: a scheduled check that every id in the model switcher's recommended list is still current, reporting renames and new "latest" aliases (Destin 2026-09-20: roadmapped, not built); (b) a one-line `announcements.txt` change runs the full ~20-minute Linux build; widen the skip gate to files no build step reads; (c) installers ship test and workbench files (47 + 19 in 1.2.4; weight only; report: docs/active/investigations/2026-09-01-asar-ships-tests.md); (d) PDF reading needs one smoke test in a packaged build; (e) dependency majors that are real work: TypeScript 7, okhttp 5.5, org.json; (f) Android toolchain: AGP 9.4 and compose-bom 2026.08 are open and red; re-run them together now that Kotlin is in
