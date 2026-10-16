---
id: 13
title: Unreliable tests and test cleanup
stage: planning
priority: P3
tags: dev-workspace, tests, regression, bug
branch: 13-flaky-and-load-sensitive-tests
roadmap: dev-workspace: Flaky and load-sensitive tests: 9 that fail on CI or only in
created: 2026-10-15
summary: Nine automatic checks fail at random or under load, and eight test leftovers from the simplification need cleaning up.
area: Workspace
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (dev-workspace › tests, status confirmed, seen on n/a, last checked 2026-09-02)
Flaky and load-sensitive tests: 9 that fail on CI or only in full-suite runs. (a) Windows CI: two import-file "failed copy rollback" cases sometimes report "skipped" instead of failing; one green re-run so far; (b) the specialist background-completion test timed out once on Windows (15 s budget); (c) two tests failed only under full-suite load (waiting line clears; resume pre-fills last model); (d) the shell-registry "still-running marks" test goes red on every run on this machine because it counts real milliseconds; (e) three different step-guard-row tests flaked in full runs only, on four unrelated branches; (f) three suites fail their own cleanup on macOS/Ubuntu CI ("ENOTEMPTY") after passing, which can block a good PR; (g) macOS-only: a finished background command's notice arrives without its output; if real, a slow machine shows "finished" with nothing; (h) the desktop CI job exits red with every test passing ("Closing rpc" error); (i) subagent-view and mcp-startup-wiring never failed in 27 local runs: trigger unknown, or already fixed

Merged in #14 "Test cleanup: eight leftovers from the simplification"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

See also #97: Both ask for an automatic size limit on the app's main script, which has none today.

See also #95: Both work from the same report on blocking calls in the app's main process: 14 sorts them in a test, 95 fixes the ones that freeze windows.

Chats

From the old roadmap (dev-workspace › tests, status confirmed, seen on n/a, last checked 2026-09-01)
Test-suite cleanup work: 8 things left over from the simplification plans. (a) ~330 startup-only or rarely-used blocking calls still sit in the unreviewed bucket of the blocking-call test (report: docs/active/investigations/2026-09-24-main-blocking-calls-triage.md); (b) finish Plan C, test files grouped by feature: part doable now, part blocked until `feat/specialists-plans-ui` merges; 892 → 783 files so far (plan: docs/active/plans/2026-09-16-ci-followups-C-test-consolidation.md); (c) 102 fixed sleeps still stand in for real signals (report: docs/active/investigations/2026-09-01-fixed-sleeps-and-mcp-wiring-import.md); (d) 57 test files are excluded from the test type-check (201 errors); (e) the lint gate leaves 79 floating promises and 43 exhaustive-deps hits unguarded; (f) 26 more tests read app source as text and were never classified, plus two exemption lists that can silently disagree; (g) no bundle-size budget, no view of oversized window-to-main messages, no nightly coverage ratchet (report: docs/active/investigations/2026-09-16-simplification-audit.md); (h) duplicated chat-line listeners, a third history reader and a repeated divider test remain after the one-core work

From the 2026-10-16 document sweep
- Not done: make the main branch protected with a required check (CI health review). Source: docs/archive/investigations/2026-09-16-ci-test-health.md
- About 112 test files only search source text instead of testing behaviour; review them. Source: docs/archive/investigations/2026-09-16-ci-test-health.md
- Check whether the Android CI step that bundles the web UI still matters after the Android rebuild. Source: docs/archive/investigations/2026-09-16-ci-test-health.md
- Write down the recipe for triaging a failing CI run with a control run (unverified). Source: docs/archive/investigations/2026-08-31-session-retrospective-workspace-friction.md
