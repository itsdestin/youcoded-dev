---
title: Six-session concurrent activity and switching
status: active
date: 2026-09-29
---

# Mixed-Activity Switching Implementation Plan

> For agentic workers: use subagent-driven-development with test-first implementation and independent review. No commits or publishing authorized.

**Goal:** Measure and repair switching stalls while three sessions stream, two execute real local tools, and a sixth remains idle.

**Approval:** Destin approved six sessions with those roles and continuing the measurement/fix program. This extends docs/active/plans/2026-09-28-performance-short-cycles.md.

**Architecture:** A deterministic private OpenAI-compatible provider routes requests by explicit fixture markers, not request arrival order. Six actual native sessions exercise the existing app engine, tool executor and renderer. A narrow controller drives the real session switcher, correlates producer/tool intervals with each action, and verifies exact persisted output/results before reporting a measured leg.

**Tech stack:** Existing perf-lab Node/CDP launcher, private fixture HOME, fake-provider patterns, native preload bridge, safe local Node tool fixture, Node built-in tests.

## Global constraints

- Only unique marked private fixture directories and owned app/producer processes. Never touch production CDP, user sessions/accounts or live configuration.
- Real tool execution means app-native tool calls execute through the normal executor. A provider returning prose that looks like a tool result is not coverage.
- No paid model requests, downloads, installs, persistent services or long soak. Each runtime defaults to five minutes, maximum ten including cleanup. One timed run at a time; concurrent work exists ONLY inside the scenario.
- Use the retained chrome-measurement candidate as the first current build; record exact stamp, package hash, GPU/display, focus and viewport. Preserve the earlier baseline package and all Find changes.
- No product optimization before a demonstrated cause. Background progress, exact output and first-visible content/scroll must not be sacrificed for faster timings.
- rAF/DOM timing is not displayed-frame timing. Missing tool overlap, missing output or failed cleanup yields incomplete, not fast/healthy.

## Task 1: Deterministic concurrent protocol fixture

**Create:** `scripts/perf-lab/mixed-provider.mjs`, `scripts/perf-lab/tests/mixed-provider.test.mjs`.
**Reuse:** patterns from `fake-provider.mjs` and actual tool schema from native runtime; do not destabilize existing provider consumers.

- [ ] Inspect the actual native tool names, arguments, streaming tool-call envelope and tool-result follow-up message format before emitting any calls.
- [ ] Write red tests for three concurrently routed text streams: unique marker/session text, independent pacing, exact payload, disconnect and bounded shutdown. Plans must bind at request start; later plan changes cannot alter in-flight requests.
- [ ] Implement loopback provider health/models/chat-completions handlers. Use explicit request markers for stream-1/2/3, tool-1/2 and idle; unknown/missing routes refuse rather than borrowing another request's plan.
- [ ] Write red tests for a tool round trip: streamed native tool-call arguments, finish reason, matching tool-call ID/result, then exact final acknowledgement. Refuse missing/mismatched result and repeated uncontrolled tool launches.
- [ ] Implement tool prompts that invoke only a fixture-owned Node script using the app's real Bash tool schema. Script confines all writes to its marked private root, emits numbered deterministic progress, records start/progress/end times and expected result, and has a bounded lifetime. Two distinct session directories prevent shared-state collisions. Use real harmless local work plus paced progress so tools overlap switches without CPU saturation being the only scenario.
- [ ] Test unowned root/path escape refusal, partial output, process cancellation and completion integrity. Fixture produces no shell instructions derived from arbitrary user content.

## Task 2: Six-session controller and validity gates

**Create:** `scripts/perf-lab/mixed-activity.mjs`, `scripts/perf-lab/tests/mixed-activity.test.mjs`.
**Reuse:** fixture/launch/GPU helpers, current native-session creation from input-stream/short-lifecycle and switch/content-proof patterns from gpu-theme. Do not further enlarge gpu-theme with this separate workload.

- [ ] Test CLI paths, explicit real-display option, bounded duration, package/port preflight, unique HOME and shutdown-preserves-files-on-uncertainty.
- [ ] Create six actual native sessions with stable role→session-ID mapping and private provider configuration. Verify permissions permit only the intended fixture tool scenario; no global grants or modifications outside private config. If a permission card blocks tool execution, report unengaged rather than clicking a broad real-app approval.
- [ ] Run an idle/single-stream control, then all three streams plus both tools together. Initial default stream rate is 50 deltas/sec/session for 30 seconds; record achieved rate, not only the requested rate. Tool lifetimes must cover the mixed switching phase and terminate normally; no forced truncation to meet a fast metric.
- [ ] Switch twice through the six roles in deterministic order. Require actual active session ID and visible content, focused/visible private window, action start/end timestamps and separately labelled rAF proxy. Take content/geometry integrity samples outside the timing clock. Capture long tasks, end-to-end IPC and process CPU totals/memory context; no main-only IPC attribution.
- [ ] Assess overlap using all five producer intervals covering each designated mixed action, continuous progress records through the phase and final output. Do not demand one heartbeat per millisecond-scale switch; distinguish interval overlap from progress cadence. Include switches around completion as a separately labelled phase, not failed steady-state overlap.
- [ ] Pin a pure validity contract. Example:

```js
assert.equal(assessMixed({ completed: false, reason: 'tool-2 never started' }).status, 'incomplete');
assert.equal(coversAction({start: 10, end: 40}, {start: 20, end: 30}), true);
assert.equal(coversAction({start: 10, end: 25}, {start: 20, end: 30}), false);
```

- [ ] Verify each stream's exact final persisted/displayed text and each tool's expected output/result acknowledgement. No tool-call reordering or role crossover. Close only owned sessions, stop the provider, confirm app shutdown before deleting its fixture. Save diagnostics/screenshots on failure and final screenshots after timing.

## Task 3: Review, serial shakedown, causal repair

- [ ] Independently review isolation, protocol correctness, actual tool engagement, overlap math, completeness verdict and cleanup before first runtime. Initial implementer performs offline tests only; parent owns launch decision.
- [ ] Run one current-candidate shakedown capped at five minutes; inspect real tool cards, streamed content and final screenshot. Treat first run as instrument validation, not a baseline win.
- [ ] Repair any rig defect with regression tests. Reproduce product stalls with identical workload and state before profiling; preserve partial evidence without claiming lost work is fast.
- [ ] If a product cause is established, create a narrowly tested fix, preserve a stamped before package and compare serial before/after runs. Require independent review, full desktop verification and relevant cross-platform checks before acceptance. Measure the earlier idle switching case too so mixed-load gains do not relocate the stall.

## Self-review

Six roles match user approval. Deterministic local provider avoids paid calls while real app tools still execute. The protocol fixture and controller have separate test/review boundaries. Fixed-role routing prevents concurrent completion order from silently crossing sessions. The control/mixed/transition phases prevent a single aggregate number from obscuring failed concurrency. Runtime safety and output integrity precede performance claims.
