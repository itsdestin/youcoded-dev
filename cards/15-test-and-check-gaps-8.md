---
id: 15
title: Eight behaviors no automatic test protects
stage: planning
priority: P3
tags: dev-workspace, tests, regression, housekeeping
branch: 15-test-and-check-gaps-8
roadmap: dev-workspace: Test and check gaps: 8 places where nothing guards a behavio
created: 2026-10-15
summary: Some features, like the Office editor and Claude Code's startup menus, have no test, so a break would only be found by users.
area: Workspace
---
Progress
Done: On branch session/workspace-tools-batch (not merged): (a) the Office editor's early script now has 20 tests that it changes only what it should; (b) the quick check now picks tests for changes outside the desktop folder (Android manifest, workflows); (d) a damaged verdicts file is tested; (e) review-tool tests no longer print ~80 warnings; (h) the daily Claude Code pop-up check had failed 3 days because Claude Code renamed a tab ('Recently denied' to 'Recently blocked') - check updated to accept both. (f) is moot (test exists).
Next: Two calls for Destin. 1) Voice-install guard: WIDEN it (recommended: users see nothing, about an hour, stops a future edit quietly needing a program a stranger's computer lacks) or LEAVE it (no work; the gap stays). 2) Mac timing issue, never reproduced: DROP it until a Mac user reports it (recommended: costs nothing) or RE-TEST on the slow Mac test machine (hours, may show nothing). Also optional: refresh the saved Claude Code pop-up recordings to the current version.
Blocked: the two calls above.

See also #11: 11(e) and 15(h) both say the recorded Claude Code screens the tests replay go stale, so a reworded prompt in a newer Claude Code breaks the app without failing a test.

Chats

From the old roadmap (dev-workspace › tests, status confirmed, seen on n/a, last checked 2026-07-22)
Test and check gaps: 8 places where nothing guards a behaviour. (a) the Office add-on's early editor script is tested only for what it blocks, not for leaving ordinary editor features working; (b) the quick local check skips tests that read files outside `desktop/` (Android manifest, workspace files), so it says "tests: none" while CI would fail; (c) on a Mac, a new file, a theme edit and a session title may miss a change made right after watching starts (audited, not reproduced; report: docs/archive/investigations/2026-09-01-sync-engine-debounce-macos-flake.md); (d) feature-flow coverage debt: contract table, verdict column, corrupt verdicts file untested; (e) review-deck tests print warnings that bury failures and never test a build failure; (f) the phone's presence client has no test harness; (g) the voice install's "runs no other program" guard misses `execSync`, `fork` and `require('child_process')`; whether to widen it is Destin's call; (h) nothing replays Claude Code's launch menus (trust folder, theme, login, model safeguard), so a reworded prompt hangs a session instead of failing a test
