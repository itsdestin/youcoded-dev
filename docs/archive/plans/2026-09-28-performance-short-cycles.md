---
title: Performance next phase — short cycles for interaction, lifecycle, bursts and GPU
status: superseded
date: 2026-09-28
---

# Short-Cycle Performance Implementation Plan

> For agentic workers: use subagent-driven-development/executing-plans with TDD and independent review. No commits or pushes are authorized.

**Goal:** Find and fix user-visible stalls and resource accumulation in four selected areas using short, reproducible workloads.

**Approval:** Destin selected streaming/input, memory/lifecycle, terminal/watcher/sync bursts, and GPU/theme/high-refresh smoothness. After the staged design was presented, he chose **short 5–10 minute cycles first; defer the 45–60 minute soak**. No long soak will be started in this phase.

**Architecture:** Extend existing perf-lab fixture, packaged launcher, deterministic provider, process sampler, IPC probe and scenario helpers. Keep natural-GC latency measurements separate from post-GC retention diagnostics. Hardware/display and software-rendered lanes have separate reports. One timed workload runs at a time; no competing builds/tests from this session.

**Tech stack:** Existing Node built-in test runner/CDP tools, packaged Electron/React, private fake-provider and PTY fixtures. No paid model calls, dependency installation, live configuration changes or new persistent services.

## Global constraints

- All state lives in private fixture homes. Never attach to or modify the production app.
- Preserve the uncommitted Find implementation and its measured baseline; record exact build identity. No rebasing upstream app changes into a comparison without rebaselining.
- Initial cycles last at most10 minutes including bounded waiting/cleanup; no overnight or hour-long runs.
- Do not change visuals, drop terminal bytes/file events, or publish partial results to achieve faster timings.
- Scope failures, unsupported measurements, disconnected probes and unengaged workloads are explicit, never zero/healthy.
- No absolute speed or memory threshold is invented before calibration; deterministic tests pin mechanisms and measurement validity.

## Task 1: Short lifecycle cycles (first deliverable)

**Create:** `scripts/perf-lab/short-lifecycle.mjs`, `scripts/perf-lab/tests/short-lifecycle.test.mjs`.
**Reuse:** `build.mjs`, `fixture.mjs`, `launch.mjs`, `fake-provider.mjs`, `procs.mjs`, `scenario-native-stream.mjs` helpers where applicable.

CLI: `node scripts/perf-lab/short-lifecycle.mjs --checkout <absolute app> --cycles 5 --max-minutes 10 --out <report.json>`; virtual display default, no real-display popups in this first scenario. Explicit `--app-dir` selects a preserved package with a build stamp, matching the Find diagnostic pattern. Fresh app boot ONCE for all cycles—restarting per cycle would erase the lifetime problem.

Each cycle uses a fixed-sized workload: create native conversations bound only to the fixture fake provider, stream deterministic short replies, optionally exercise an existing fake PTY output fixture where safely reusable, switch between them, destroy exactly the sessions that cycle created, and wait for the actual session list and mounted chat count to return to the pre-cycle state. Do not resume and mutate the same seeded transcript repeatedly or delete sessions that predate this scenario. Keep first-cycle warmup distinct from later observations.

Report each cycle's lifecycle success, created/closed identifiers, actual provider output counts, session/DOM cleanup, cumulative Performance metrics, process-family PSS and JS heap/DOM/listener counts. Sample naturally after close, then a separate opt-in/labelled post-GC diagnostic observation. PSS not falling is not itself a leak. Saved conversation records may legitimately accumulate; track persisted-record growth/context and distinguish it from active UI/session resources. Do not claim all files/previews are covered by the initial chat lifecycle case.

Interfaces: pure `summariseCycles(cycles)` produces raw sample count, per-cycle deltas and `measured|incomplete` plus reasons; it never labels an observed slope a proven leak. Runtime `runCycles(app, fixture, options)` drives existing bridge contracts with external timeouts and always destroys owned cycle sessions in `finally`.

- [ ] Red tests for incomplete cleanup, no output/no active sessions, missing/nonfinite counters, warmup excluded from trend summaries, and failed GC remaining unmeasured (not0).
- [ ] Implement helpers and runtime cycle; first runtime is a shakedown, not baseline.
- [ ] Inspect initial and post-close screen/state; confirm this is a real exercised lifecycle.
- [ ] Run5 cycles and inspect resource growth. If growth persists, identify retainers/resource owners before proposing a fix.

Example guard contract:
```js
assert.equal(summariseCycles([{ completed: false, reason: 'session still active' }]).status, 'incomplete');
```

## Task 2: Input responsiveness during streaming

**Create:** focused scenario/probe under `scripts/perf-lab/`, tests beside existing scenario tests. Prefer extending a helper rather than duplicating the native-stream runner.

Reuse deterministic fake replies at the existing150 deltas/s. Drive text input via CDP keyboard events into the visible composer WITHOUT submitting additional requests. Verify the resulting draft exactly, then clear it via user-equivalent input. Alternate typing, switching and scrolling in separately marked legs. Capture input dispatch-to-DOM-update proxy, long-task trace, main IPC response and context; do not call rAF callbacks presented frames. Retain sampled timelines and diagnose worst interactions, not only medians. At least20 interactions before a p95 is described as informative; no p99 claim from tiny samples.

- [ ] Red integrity tests for missing composer, dropped characters, no stream engagement and invalid metrics.
- [ ] Calibrate observer overhead with a deterministic no-stream control.
- [ ] Run short stream+input and control cycles; profile only a reproduced spike in a separate diagnostic run.
- [ ] Fix only a demonstrated cause, add a red/green regression, and rerun identical before/after plus lifecycle check.

### Task 2 measured experiment: hidden first-page construction

Causal trace (corrected session IDs): hidden resumed cc-1/cc-2 first pages arrive, then the1s paused store catch-up mounts~42–43 Markdown bodies in single150–275ms renderer tasks. Fresh-only control removes the work; delayed typing only shifts it. App trace removed after diagnosis.

Experiment: leave reducer/page contents and paused catch-up policy unchanged; budget ONLY first construction of a hidden history page, newest rows first, a small number of Markdown-bearing rows per macrotask. A dedicated hook tracks construction keys/session/page identity without resetting per streamed word. Do not reuse card-list50-item/intersection semantics. Hidden incomplete rows may be omitted ONLY while hidden; no guessed-height visible placeholders. Suppress extra history-sentinel loads caused by a shortened hidden construction tree. Existing visible-page and later-prepend behavior stays unchanged.

Activation must show the complete intended first frame; synchronous remaining-work fallback is acceptable only if measured immediate-switch costs do not regress materially. A settled-queue-only switch test is insufficient. Red tests must cover small construction batches, cancellation/session change, first page arriving visible, rapid show mid-queue, ordinary later-page prepend anchors and Find. Runtime acceptance requires matched unprofiled input/control (worst keys+longtasks), fast-switch and settled-switch measurements, and exact visible Find result. If activation simply relocates the original stall, reject the experiment and evaluate a larger parsing/preparation design or ask for a visible-scope decision—never claim success by hiding the hitch.

## Added coverage: concurrent background activity and session switching

**User request:** add several background sessions streaming, simultaneous tools, and switching between those sessions to performance measurements, regression tests and fixes. This expands the earlier single-stream navigation case; idle-only switching results cannot satisfy it.

Required coverage:
- Several sessions genuinely streaming concurrently, including while hidden; switch repeatedly among them and an idle conversation.
- Several sessions executing tools concurrently, plus a mixed case with streaming sessions and tool-running sessions. Exercise actual local tool execution and result delivery in private fixture directories, not only fabricated activity indicators.
- Switch in both directions during activity and around completion transitions. Confirm activity overlaps each measured switch using producer/tool start, progress and completion records.
- Compare against idle and single-active-session controls using matched content, fold state, viewport and focus. Keep construction/folding state explicit rather than confusing less live content with an optimization.
- Measure switching responsiveness, renderer long tasks, IPC round trips and total CPU/memory context. Verify every stream's final output and each tool result, stable session identity, continued background progress, visible content and scroll correctness, and owned-session/process cleanup. Missing output, serialized instead of overlapping work, stopped background progress or unengaged tools make the affected result incomplete.
- Any retained product fix needs a regression test and matched before/after checks of the mixed-activity workload, not only the idle case. Do not infer presented-frame performance from rAF callbacks.

Implementation design is pending: reuse the private fake-provider/launcher and extend protocol fixtures as necessary for real local tool calls. Begin with a modest several-session workload and scale only after correctness is established; exact concurrency/rates are configuration to settle during design. No paid model calls, live accounts, production-app access, long soak or persistent services. Timed runs remain serial with respect to other benchmarks/builds/tests; concurrency is deliberate INSIDE this workload. Preserve the current focused style-cause investigation; queue this expanded coverage rather than running it simultaneously.

## Task 3: Burst interference, one producer at a time

**Reuse/extend:** `scenario-terminal.mjs`, `fake-claude.cjs`, `scenario-projects.mjs`, fixture project data. New narrow scenario files/tests are acceptable if existing modules would become unwieldy.

Terminal: reuse numbered/glyph output but measure WHILE output arrives, with a final sentinel and integrity evidence. Watcher: deterministic create/edit/delete burst in a fixture project, verify final state and notification convergence while input remains responsive. Sync: only a private local test remote/fixture, never actual personal sync or production network state. Separate producer legs before combined stress.

- [ ] Pin expected byte/line/event integrity and nonempty workloads before timing.
- [ ] Record queue/backlog where existing observability permits, main-loop/IPC delay, total work and foreground input delay.
- [ ] Do not confuse throughput improvements with better responsiveness; measure both.
- [ ] Keep coalescing/backpressure fixes only if final state/output and ordering remain correct.

## Task 4: Hardware GPU and high-refresh lane

**Reuse:** isolated `launchApp`, `gpu.mjs`, `resize-bench.mjs`, theme fixtures and short CDP traces. Real-display windows were authorized; label/report them and always close owned windows.

Select a plain stock theme and representative effects-heavy themes from existing fixtures; use the same viewport, scale and display per pair. Run short scroll/resize/switch/idle legs independently of CPU tests. Record actual compositor/renderer identity, display conditions and supported trace events. Validate any presented-frame metric against Chromium's emitted data before using it; rAF/LoAF alone is insufficient. Unsupported presentation evidence is reported as unsupported, not no drops. No disabling effects without an explicit product decision.

- [ ] Reuse recorded paths and deterministic fixtures; capture trace validity and engagement checks.
- [ ] Measure presented-frame evidence, CPU/GPU activity and visual correctness on representative workloads.
- [ ] Keep a measured fix only if it improves hardware behavior and preserves appearance/interaction; show the prescribed review if appearance changes.

## Stage gates and bounds

Work through Task1 then Task2, use evidence to order their product fixes, then Task3 and Task4. Each deliverable may be reviewed independently. Short lifecycle cycles cannot rule out hours-long leaks; long soak stays deferred. Android and remote-device baselines remain separate follow-up scope, not implied by desktop/shared-renderer checks.

Self-review: these four tracks match the user's confirmed selection, short-cycle constraint and preserved-visual requirement. The plan specifies measurement infrastructure before product edits; actual fix files are selected only after causal evidence, rather than speculative patches. No scheduling service, release or paid evaluation is included.
