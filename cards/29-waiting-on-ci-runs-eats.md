---
id: 29
title: Release pipeline: faster test runs, bug-fix releases, build upkeep
stage: planning
priority: P1
tags: dev-workspace, release, housekeeping
branch: 29-waiting-on-ci-runs-eats
roadmap: dev-workspace: Waiting on CI runs eats whole sessions. Destin, 2026-09-20:
created: 2026-10-15
summary: Releases: test runs take an hour for small fixes, bug-fix releases can't ship on their own, and six build loose ends remain.
area: Workspace
vision: everywhere.added.update
work: session/release-1-3-2, session/29-beta-counter-reset, session/29-ci-fastpaths, session/29-linux-build-bench, session/29-android-build-bench, session/29-linux-ci-winner, session/29-android-paired-bench, session/29-full-ci-five-minute
---
Progress
Done: CI first pass implemented locally: fail-closed desktop classifier, cheap preflight, parallel full test/installer jobs, stable completion gates, PR-only stale-run cancellation, candidate-root whole-graph card-only workspace lane. Independent task and final reviews approved. Local445 workspace tests,26 app policy/beta tests,9 workflow guards and required desktop verify pass.
Next: Authorize implementation commits/candidate pushes and GitHub CI validation without merging, to prove actual status/scheduling/fresh packaging and measure timing. Broader selectors/sharding/caches/protection migration remain deferred.
Blocked: No local implementation blocker; remote acceptance awaits candidate-publication authorization.

Chats
- 2026-10-19 session/29-full-ci-five-minute: chat started
- 2026-10-19 session/29-android-paired-bench: chat started
- 2026-10-19 session/29-linux-ci-winner: chat started
- 2026-10-19 session/29-linux-ci-winner: chat started
- 2026-10-19 session/29-linux-build-bench: chat started
- 2026-10-19 session/29-android-build-bench: chat started
- 2026-10-18 session/29-android-build-bench: chat started
- 2026-10-18 session/29-android-build-bench: chat started
- 2026-10-18 session/29-linux-build-bench: chat started
- 2026-10-18 session/29-linux-build-bench: chat started
- 2026-10-18 session/29-ci-fastpaths: chat started
- 2026-10-18 session/29-ci-fastpaths: chat started
- 2026-10-18 session/29-ci-fastpaths: chat started
- 2026-10-18 session/29-beta-counter-reset: chat started
- 2026-10-18 session/29-beta-counter-reset: chat started
- 2026-10-18 session/release-1-3-2: 1.3.1 preflight: cross-platform test repairs, exact reusable dependency source and Android source/notices pipeline; candidate branch only, no release.

From the old roadmap (dev-workspace › release, status confirmed, seen on n/a, last checked 2026-09-20)
Waiting on CI runs eats whole sessions. Destin, 2026-09-20: "just fixing a few minor test issues and such has seemingly eaten over an hour of our time today just waiting around on runs. is there any way we could improve this in the future for better/faster iteration and fixes?" Two answers he liked, neither built: (1) a NIGHTLY rehearsal build from master that publishes nothing and notifies on failure (the launch check runs in no other workflow and sat broken from 2026-09-16); (2) a way to run ONE test file on ONE OS instead of a ~15-minute three-OS matrix

Merged in #30 "Let small bug-fix releases ship on their own"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (dev-workspace › release, status confirmed, seen on n/a, last checked 2026-09-03)
Re-work the release method: releases tag master directly, so each ships all ~3,200 commits since v1.2.4 and bug-fix minors cannot go out alone. Goal: cut `release/vX.Y.x` branches off the last tag and cherry-pick fixes, so a minor ships while the next major is blocked. Caveats: a "goes in the minor?" decision per fix, and one-tag-both-platforms means an Android versionCode bump and paired Android build. A 1.3 blocker since 2026-09-03; off 1.3.1 in Destin's triage 2026-09-23

Merged in #32 "Release and build upkeep: six loose ends"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

See also #70: Both want the app's list of recommended models kept current instead of going stale (32a a scheduled check, 70b one maintained recommendation system).

Chats

From the old roadmap (dev-workspace › release, status confirmed, seen on n/a, last checked 2026-09-01)
Release and build upkeep: 6 loose ends. (a) wanted: a scheduled check that every id in the model switcher's recommended list is still current, reporting renames and new "latest" aliases (Destin 2026-09-20: roadmapped, not built); (b) a one-line `announcements.txt` change runs the full ~20-minute Linux build; widen the skip gate to files no build step reads; (c) installers ship test and workbench files (47 + 19 in 1.2.4; weight only; report: docs/active/investigations/2026-09-01-asar-ships-tests.md); (d) PDF reading needs one smoke test in a packaged build; (e) dependency majors that are real work: TypeScript 7, okhttp 5.5, org.json; (f) Android toolchain: AGP 9.4 and compose-bom 2026.08 are open and red; re-run them together now that Kotlin is in

From the 2026-10-16 document sweep
- Phase 2 of retiring youcoded-core: delete the app's dead youcoded-core branches in 1.3.1. Source: docs/active/plans/2026-04-21-deprecate-youcoded-core.md

2026-10-18 release scope decision — Destin explicitly chose to release the current built app as 1.3.1. Unfinished planned features, refactoring and cleanup are future work, not gates for this release. This does not waive test failures, actual security/licensing requirements, Apple Developer ID signing/notarization or final publication approval. No item is marked fixed or shipped by this decision.
