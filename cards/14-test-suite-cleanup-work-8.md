---
id: 14
title: Test-suite cleanup work: 8 things left over from the simplification plans
stage: planning
priority: P3
tags: dev-workspace, tests
branch: 14-test-suite-cleanup-work-8
roadmap: dev-workspace: Test-suite cleanup work: 8 things left over from the simplif
created: 2026-10-15
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

See also #97: Both ask for an automatic size limit on the app's main script, which has none today.

See also #95: Both work from the same report on blocking calls in the app's main process: 14 sorts them in a test, 95 fixes the ones that freeze windows.

Chats

From the old roadmap (dev-workspace › tests, status confirmed, seen on n/a, last checked 2026-09-01)
Test-suite cleanup work: 8 things left over from the simplification plans. (a) ~330 startup-only or rarely-used blocking calls still sit in the unreviewed bucket of the blocking-call test (report: docs/active/investigations/2026-09-24-main-blocking-calls-triage.md); (b) finish Plan C, test files grouped by feature: part doable now, part blocked until `feat/specialists-plans-ui` merges; 892 → 783 files so far (plan: docs/active/plans/2026-09-16-ci-followups-C-test-consolidation.md); (c) 102 fixed sleeps still stand in for real signals (report: docs/active/investigations/2026-09-01-fixed-sleeps-and-mcp-wiring-import.md); (d) 57 test files are excluded from the test type-check (201 errors); (e) the lint gate leaves 79 floating promises and 43 exhaustive-deps hits unguarded; (f) 26 more tests read app source as text and were never classified, plus two exemption lists that can silently disagree; (g) no bundle-size budget, no view of oversized window-to-main messages, no nightly coverage ratchet (report: docs/active/investigations/2026-09-16-simplification-audit.md); (h) duplicated chat-line listeners, a third history reader and a repeated divider test remain after the one-core work
