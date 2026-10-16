---
id: 13
title: Nine unreliable automatic tests
stage: planning
priority: P3
tags: dev-workspace, tests, regression
branch: 13-flaky-and-load-sensitive-tests
roadmap: dev-workspace: Flaky and load-sensitive tests: 9 that fail on CI or only in
created: 2026-10-15
summary: Nine automatic checks fail at random or only under load, which can block good changes and waste time re-running them.
area: Workspace
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (dev-workspace › tests, status confirmed, seen on n/a, last checked 2026-09-02)
Flaky and load-sensitive tests: 9 that fail on CI or only in full-suite runs. (a) Windows CI: two import-file "failed copy rollback" cases sometimes report "skipped" instead of failing; one green re-run so far; (b) the specialist background-completion test timed out once on Windows (15 s budget); (c) two tests failed only under full-suite load (waiting line clears; resume pre-fills last model); (d) the shell-registry "still-running marks" test goes red on every run on this machine because it counts real milliseconds; (e) three different step-guard-row tests flaked in full runs only, on four unrelated branches; (f) three suites fail their own cleanup on macOS/Ubuntu CI ("ENOTEMPTY") after passing, which can block a good PR; (g) macOS-only: a finished background command's notice arrives without its output; if real, a slow machine shows "finished" with nothing; (h) the desktop CI job exits red with every test passing ("Closing rpc" error); (i) subagent-view and mcp-startup-wiring never failed in 27 local runs: trigger unknown, or already fixed
