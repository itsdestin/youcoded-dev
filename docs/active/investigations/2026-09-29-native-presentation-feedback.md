---
title: Native Wayland high-refresh presentation-feedback first pass
status: active
date: 2026-09-29
---

# Native presentation feedback — first measured capability/workload

User explicitly requested actual displayed-frame/high-refresh investigation. This pass used only isolated real-display apps. No live-app attachment/state changes, product code changes, package rebuild, dependency installation or commits. The sync-watcher issue remains skipped by user instruction.

## What is now measured

The compositor advertises `wp_presentation` v2 and its native output reports 2560×1600 at 180.000 Hz (`wayland-info`; XRandR is Xwayland and reports 179.89). New opt-in launcher mode uses the explicit absolute Wayland socket while retaining private HOME/config/cache/runtime and dead D-Bus. Existing default X11 behavior is unchanged and regression-tested.

Exact runtime: Electron41.10.7 / Chromium146.0.7680.216, AMD Radeon8060S through hardware-accelerated ANGLE. Exact-version Chromium and Wayland protocol research is in `scratch/frame-presentation-method.md` and `scratch/frame-presentation-research/`. A Wayland `presented` callback is compositor-reported content presentation, unlike rAF. Flags7 mean vsync, hardware clock and hardware completion. This is hardware-qualified compositor feedback, NOT an optical input-to-photon measurement.

## Captures and provenance

- `scratch/perf-lab/presentation-native-1.*`: first capability capture, complete trace and protocol, but old inventory incorrectly expected `@` instead of actual `#` object syntax. Raw evidence retained; parser corrected.
- `presentation-workload-debug-1.*` and `debug-2.*`: workload engaged, protocol complete, but auxiliary traces hit the 80,000-event cap. Reports remain incomplete. Counting per-frame cc/DevTools activity was unnecessary for the native feedback question.
- `presentation-workload-debug-3.*`: one complete native workload with raw protocol logging, exclusive/capped log 705,733 bytes and loss-free 13,592-event trace (`wayland,blink.user_timing`). Two real resumed chats; real paced wheel inputs, eight pill switches, eight viewport overrides, idle context. Screenshots inspected: real transcript/code, two pills, correct app theme, restored viewport.
- `presentation-workload-quiet-1.*`: same actions without protocol logging, complete 13,213-event trace. Quiet control has renderer observations ONLY, not a native presentation verdict. Screenshot inspected alongside debug run.

There was a final metadata-validation bug: workload used `performance.mark`, but the report still searched `TimeStamp`. The raw traces contain all five begin/end marker pairs. The checker now requires unique `blink.user_timing` instants on the known renderer main thread, ordered and bracketing each Node monotonic interval. Original reports were not rewritten. Corrected read-only, hash-referenced audits are `scratch/frame-presentation-derived-debug-3.json` and `scratch/frame-presentation-derived-quiet-1.json`, both with five verified pairs. These are reanalyses of the existing runs, NOT new timed repeats.

Protocol attribution is **conditional/structural**, not PID-certified: inherited stderr can mix connections. This capture has one presentation binding and one matching titled YouCoded toplevel surface, with request/commit/feedback lifetimes, queue labels and timestamp checks. The parser rejects ambiguous bindings/surfaces and never joins rounded >2^53 Graphics.Pipeline IDs. This structural proof is stronger than raw event counting but does not independently establish per-line PID/connection provenance.

## Initial observations — not FPS or a drop-rate verdict

Debug capture recorded 778 feedback requests: 777 presented distinct surface commits, one discarded, all presented flags7, CLOCK_MONOTONIC. Counts include startup/boundaries; the discarded event has no presentation timestamp and is NOT assigned to a workload leg. Multiple feedback objects for one commit are deduplicated; pending objects are not counted as drops. Output retrace sequence is zero, so refresh-count gaps cannot be used.

Original Node-boundary summaries (validated trace markers bracket them by fractions of a millisecond; derived audits use the trace boundaries):

| Leg | Presented commits in leg | Median interval | p95 interval | Largest interval | Important qualification |
|---|---:|---:|---:|---:|---|
| Scroll up | 237 | 27.777 ms | 33.333 ms | 38.890 ms | actual wheel dispatch median 27.828ms despite requested17ms; input-limited, not an180Hz saturation test |
| Scroll down | 157 | 27.778 ms | 33.331 ms | 94.443 ms | input median27.788ms; isolated long gap needs causal demand analysis, not an automatic drop claim |
| Switching | 298 | 5.556 ms | 5.558 ms | 111.110 ms | eight switches include deliberate270ms waits; animated segments show180Hz cadence, longer idle gaps are not necessarily misses |
| Viewport resizing | 18 | 55.555 ms | 277.776 ms | 277.776 ms | eight deliberately spaced viewport changes, NOT native OS window dragging or continuous180Hz resizing |
| Idle | 2 | — | — | — | no change may require no new surface submission; never call this low FPS |

Neither debug nor quiet workload recorded a renderer long task of50ms or more. Per-leg renderer TaskDuration differs between the single runs (for example scroll-up .696s debug versus .483s quiet); do not declare logging free or infer a statistically established overhead ratio from one pair. A callback loop around180Hz alone was never treated as displayed content.

## Verification and next limits

Final parent command: `node --test scripts/perf-lab/tests/presentation-capture.test.mjs scripts/perf-lab/tests/launch.test.mjs scripts/perf-lab/tests/gpu-theme.test.mjs`, syntax checks for capture/protocol/workload/launcher, and `git diff --check` all exited0 (`scratch/presentation-final-tests.log`;69 tests). Fresh scoped review resolved the marker blocker and found no further blocking issue. External process inspection found no remaining private package process.

This establishes hardware-qualified presentation feedback capability and a first short workload—not whole-app smoothness acceptance. Subsequent higher-rate input and native long-history mixed/Files measurements are recorded separately in `2026-09-29-presentation-followup-results.md`; originals below are not rewritten by those results. Remaining work at the end of this first pass:
- stronger PID/connection-to-window attribution if certified per-window metrics are needed;
- precise presentation-demand correlation to distinguish a genuine missed update from no requested change;
- continuous-input pacing without controller round-trip drift, repeat runs and better overhead calibration;
- native OS resizing, long mixed-activity/Files-open workloads and effects-heavy themes on this presentation lane;
- optical/input-to-photon latency is not measured; the older1Hz callback issue is not reproduced or explained by this result.
