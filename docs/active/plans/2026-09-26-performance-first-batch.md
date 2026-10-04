---
title: Performance first batch — trustworthy comparisons and measured desktop fixes
status: active
date: 2026-09-26
---

# Performance First Batch Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve the existing lab's ability to distinguish a real improvement from measurement error, establish current desktop baselines, and fix the largest demonstrated bottleneck with before/after evidence.

**Architecture:** Extend perf-lab rather than create a competing framework. Measurement validity, scenario coverage and product changes are separate steps; retain raw samples and explicit scope. Select the product change only after a reproducer identifies meaningful cost.

**Tech Stack:** Node built-in test runner, existing packaged Electron fixture/CDP runner, shared React renderer, existing Vitest/verification tooling.

## Approval and constraints

Destin approved the proposed first batch and repeated isolated real-display benchmark windows with “okay, proceed” after receiving `docs/active/investigations/2026-09-26-performance-history-audit.md`. That report is the design and evidence register for this batch. No appearance/behavior simplification, paid provider calls or scheduled service installation is included. Nothing is committed or pushed by this plan.

Preserve existing functionality, data integrity and visuals. Software rendering and real-GPU results are different lanes. CPU work is not frame presentation; a callback count cannot be called displayed FPS. Product changes require a demonstrated bottleneck, a failing regression test, matched before/after measurements and verification.

## Task 1: Comparable versus inconclusive reports

**Files:** create `scripts/perf-lab/comparability.mjs`; modify `scripts/perf-lab/compare.mjs`, `scripts/perf-lab/tests/compare.test.mjs`; create `scripts/perf-lab/tests/comparability.test.mjs`; update the comparison section of `scripts/perf-lab/README.md`.

**Interface:** `assessComparability(baseline, candidate)` returns `{ comparable: boolean, reasons: string[], warnings: string[] }`. `verdict()` retains `keep` for callers and adds `status: 'keep' | 'reject' | 'inconclusive'` plus `comparability`. Inconclusive always has `keep: false`; the CLI prints INCONCLUSIVE and exits nonzero.

- [ ] Add red tests for CPU/kernel/Node/RAM or renderer differences; missing identifying data; software versus accelerated rendering; malformed/failed GPU info; aborted/incomplete input; and mismatched overlapping scenario descriptors. Use the actual `machine` and `measures` shapes from `run.mjs`, not invented fields.
- [ ] Add red tests showing matched reports remain comparable, missing measurements never become zero, and app CPU reduction itself is not treated as mismatched background load.
- [ ] Implement a pure validator. Required machine fields: nonblank `cpu`, `kernel`, `node`, positive finite `ramGb`, and a successful renderer identity containing nonblank `glRenderer`, boolean `accelerated`, and a known compositing mode. Exact mismatches are inconclusive; do not guess equivalence between driver/runtime revisions. Require both reports' existing pre-boot noise summary to be valid and inside the runner's existing limits (<4 load average, <10% busy). Warn explicitly that pre-boot samples do not prove absence of interference during measurement. Do not infer external interference from the app's own `cpuDuringPct`.
- [ ] Integrate at `verdict()` and CLI level; update successful test fixtures with real-shaped metadata instead of bypassing the validator. Existing missing-primary/zero-baseline/screens/errors/spread tests must still exercise their original failure paths.
- [ ] Run `node --test scripts/perf-lab/tests/comparability.test.mjs scripts/perf-lab/tests/compare.test.mjs scripts/perf-lab/tests/run-report.test.mjs`. Include an executable CLI test that mismatched renderers cannot print KEEP.
- [ ] Document the new status and explicit limitations. Historical reports missing provenance remain readable but cannot prove KEEP.

Example invariant:
```js
const result = verdict(before, { ...after, machine: { ...after.machine, cpu: 'different CPU' } }, { target });
assert.equal(result.keep, false);
assert.equal(result.status, 'inconclusive');
assert.match(result.comparability.reasons.join(' '), /cpu/i);
```

## Task 2: Probe overhead and sensitivity

**Files:** `scripts/perf-lab/late-content.mjs`, `scripts/perf-lab/tests/late-content.test.mjs`; only extend these after checking whether the upcoming baseline actually needs the late-content probe.

**Existing interface:** `scrollAndCount(cdp, options)` and `summariseLateContent(raw)` remain stable. Added diagnostic fields must not silently change old metric definitions.

- [ ] Exercise the existing browser-level eager-versus-delayed-unfolding proof. An unavailable browser is an unverified check, not a pass.
- [ ] When using this instrument, replace per-frame full-document geometry scans with a pane-rooted observed visible set; use initial/boundary inventory outside the timed pass for folding engagement. Preserve eager/late/no-folding/blank-at-rest distinctions and explicitly document asynchronous observation limits.
- [ ] Add a deterministic test that a per-frame sample does not call geometry APIs for every offscreen entry, plus disposal and missing-observer coverage. Deliberately break the guarded mechanism and record the targeted red test.
- [ ] Run probe-on/off calibration on the same deterministic content; do not use a faster new probe to claim a product improvement. If sensitivity regresses, do not adopt it as a gate.

## Task 3: Current baseline and bottleneck attribution

**Files:** use `scripts/perf-lab/run.mjs`, `scenario-native-stream.mjs`, `scenario-history.mjs`, `scenario-scrollback.mjs`, `fixture.mjs`, `launch.mjs`, `gpu.mjs`; reports under `perf-reports/` and diagnostic captures under `scratch/perf-lab/`.

- [ ] Verify the build/fixture prerequisites, owned ports and private HOME; perform `run.mjs --dry-run` with explicit checkout and label.
- [ ] Run selected unchanged-app phases (`history,native-stream` initially) with at least three repeats. Reuse cached engine/model downloads by copying immutable assets into the worktree, never pointing runtime state at the live app.
- [ ] After the shakedown succeeds, retain the baseline JSON, environment metadata, errors and sample arrays. Do not run other work during sampling.
- [ ] Add a focused long-chat Find diagnostic using the existing paged history and isolated launcher if ordinary phase numbers do not identify the largest cost. Assert that the intended number of entries is loaded and folding engaged before opening Find. Capture scripting/layout, DOM growth, first-input delay and a screenshot outside the timed interval.
- [ ] Use one diagnostic profile to attribute a surprising number; do not compare a profiled run against an unprofiled baseline.
- [ ] Repeat a bounded visual journey using `launchApp({display: process.env.DISPLAY, ...})` with its private HOME and bus isolation. Record `readRendererInfo` and screen/viewport/scale; gather Chromium trace evidence for presentation separately from rAF proxy metrics. Unsupported trace metrics are unmeasured, not zero.

## Task 4: First demonstrated product fix

**Files:** determined by Task 3's causal profile, constrained to the selected bottleneck. Candidate sites are listed with exact paths in the audit. This is an evidence gate, not authorization to change every static suspect.

- [ ] Record the symptom, measured scale and mechanism before editing; use systematic debugging and a behavior/scaling regression test that fails on current code.
- [ ] Implement the smallest behavior-preserving fix with a WHY comment. Prefer removing work over delaying it; if using bounded concurrency, measure throughput and responsiveness together.
- [ ] Run the targeted test and full applicable verification. Before/after use the same instruments, fixture, build mode and selected phases; repeat the baseline when external load changed.
- [ ] Obtain a fresh code review. Repair findings and repeat affected verification/measurement.
- [ ] Retain only an evidenced improvement without an unexplained important regression. Report raw values/spread, scope and inconclusive metrics; keep current visuals. If the useful fix requires a behavior/UX decision, stop at that specific decision.

## Execution checkpoints

Task 1 is independently deliverable. Tasks 2–3 may expose instrument failures; fix those before baselining. Task 4 cannot honestly be specified as a concrete code patch until Task 3 establishes the culprit. The full audit's Android, remote, soak and scheduled runner program remains subsequent work, not silently claimed complete by this first batch.

Self-review: this plan covers the approved first batch, not the entire multi-platform program. It names measurable entry conditions and explicitly defers product-patch selection to evidence rather than prescribing a speculative optimization.
