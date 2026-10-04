---
title: Presentation follow-up — paced input and mixed histories
status: active
date: 2026-09-29
---

# Approved follow-up

Destin approved proceeding after the proposed sequence: correct controller-limited scroll pacing; repeat native presentation measurements with long histories, three streaming sessions, two actual tool workers and selected Files drawers; investigate only reproduced stalls. The hidden-history Markdown construction stall follows this investigation; sync-watcher work remains outside this session.

## Method and implementation

- Keep the exact existing package (`bb939f917e3e64437825b24f3b86b02f14843825`, dirty stamp `91a1e4abb6c8`) and all original reports. No app rebuild or product edits are needed for measurement instrumentation.
- Fix demonstrated pacing bug: acknowledgement wait followed by 17ms sleep produced about27.8ms input intervals. Use monotonic deadlines with bounded outstanding requests, no catch-up burst, recorded actual dispatch/ack timing and bounded renderer scroll observations. Inputs and scroll events are demand proxies, not presentation certificates.
- Extend the existing mixed runner, not a replacement workload: opt-in explicit native socket and on/off protocol logging; retain private homes, dead D-Bus, exact provider/tool/history/Files validations. Reuse finite browser trace and protocol parser. Mark control and mixed workload intervals; deliberate inter-switch dwells are not dropped frames.
- Compositor evidence remains structurally associated with one titled surface, not independently PID/connection-certified. Do not join trace IDs through lossy numbers, infer physical scanout FPS, or assign untimestamped discards to legs.

## Execution / acceptance

1. Test-first pacing and adapter regressions; independent scoped review before real runs.
2. Short serial on/off repeats with unique report paths, same inputs/probes/package, no tests/builds overlapping measurements. Check actual cadence and engagement; never substitute requested rates.
3. Native long-history Files-closed/open workload runs with exact outputs and background progress. Preserve failed runs as incomplete. Review final stream/tool screenshots.
4. Run relevant offline suites and syntax/diff checks after corrections. Record exact numbers, overhead limitations, unresolved issues, and confirmed owned-process cleanup. No commits, integration or deployment.

## Progress

- Workspace resumed without rebasing; current package stamp and native socket validated; no private package processes at preflight.
- Pacing/adapter/shutdown corrections passed independent scoped reviews and123 final offline tests. Parent desktop verify passed; private package-process check found no remaining owned app.
- Completed two valid paced debug repeats/two quiet controls and a valid native Files-open run with final drained receipt, plus quiet Files-open control. Actual wheel demand roughly6.2–6.5ms; conditional compositor intervals commonly5.556ms, not certified FPS.
- Earlier mixed native verdicts withdrawn after final review caught a mutable late-error log receipt; raw originals preserved. Initial Files-closed attempts were incomplete: first invalid raw lifetimes (despite clean drained receipt), then all12 switches unfocused. After Destin approved an uninterrupted foreground window, closed-foreground-1 passed every gate with8–28ms switch proxies and no ≥50ms mixed-phase tasks. Valid closed/open captures now exist, but not repeated/interleaved causal A/B evidence. The earlier large stalls did not recur; no causal CPU profile or explanation was established.
- Results and unresolved task stalls up to208ms switching proxies: `docs/active/investigations/2026-09-29-presentation-followup-results.md`. No new app fix inferred; no shipping. Evidence review caught and led to the shutdown repair, not a waived warning.
