---
id: 200
title: Swipe Keyboard: test builds in under 10 minutes, releases in under 15
stage: planning
tags: swipe-keyboard, release, performance, housekeeping
related: 165
branch: 200-swipe-keyboard-test-builds-in
finish: A change to an installable test build takes under 10 minutes (only what changed is rebuilt and tested; full accuracy measuring runs once before a release, not every round). Publishing a release takes under 15 minutes by reusing packages already built and tested for that exact code. Times measured and written down; each skipped check names what it could let slip.
created: 2026-10-24
why: each iteration seemingly takes me an hour or two of just sitting around, which is very frustrating when im just trying to quickly test and iterate
---
Progress
Done: Investigated 2026-10-24 (read-only). Laptop: compile ~30 s (incremental Ninja), all 49 tests ~2 min, packaging ~1 min; the 76-98 min cycles were the run-everything routine (benchmarks, both KDE front ends, extra suites) done serially, with benchmarks racing tests at load 47-65. Release CI: tag runs rebuild cold by design (scripts/ci-cache.py:44-55, docs/releasing.md:48 no cross-run promotion); same commit built 3x (PR, main, tag); flatpak 26 min is the critical path; 1.9 min wasted freeing disk in prepare; one 212-min run was 3 h queued.
Next: Plan: A quick-test-build.sh (incremental build, tests for changed areas only, package; 3-8 min); B hand over package first, verify after at nice 19; C benchmarks only for what changed; D one full verify lane before release (~15-25 min, quiet machine); E tag reuses main run's built+tested packages for same SHA with hash checks (~10 min, reverses no-promotion rule: owner decision) or F restore Flatpak dependency cache on tags (~22-25 min); G trim prepare overhead; H skip main backstop when tree equals passed PR; I cancel superseded PR runs.
Blocked: nothing.

Chats
