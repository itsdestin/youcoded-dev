---
title: Native presentation follow-up — higher-rate input and long mixed histories
status: superseded
date: 2026-09-29
---

# Results and limits

This extends `docs/archive/investigations/2026-09-29-native-presentation-feedback.md`. Destin approved proceeding with driver pacing correction and native presentation during long-history concurrent streaming/tools, including Files panels. No product code changes, package rebuild, paid calls, installs, commits or shipping in this follow-up. All launches used the preserved private package, throwaway HOME/config/runtime, dead D-Bus and the explicit native socket; the production app was not attached to or modified. Measurements were serial, without this session's tests/builds overlapping.

## Identity and method

- Package: app commit `bb939f917e3e64437825b24f3b86b02f14843825`, dirty stamp `91a1e4abb6c8`, packaged asar SHA-256 `ba61863669c1e86cbc73a044509565c95dc9abc953b7980f740162fe56649145`.
- External `wayland-info` again reported `wp_presentation` v2, CLOCK_MONOTONIC and the current2560×1600/180.000Hz output. Captures use the existing hardware renderer and protocol parser. Native association remains **conditional structural surface evidence**, not independently PID/connection-certified and not physical scanout FPS or optical latency.
- Driver bug confirmed in code: awaiting each wheel acknowledgement and then sleeping17ms caused earlier~27.8ms input cadence. New driver uses rolling monotonic deadlines, maximum two outstanding requests, a fixed~3-second dispatch window, no catch-up bursts, actual send/ack/skip accounting and bounded scroll-position event observations. Requested180Hz is **not achieved180Hz**.
- Review found a near-boundary catch-up burst; its initial repair skipped every other slot even with immediate acknowledgements (parent observed270 sent/270 skipped,11.18ms median). Rolling deadlines repaired that; repeated fractional-jitter regression and a real-clock smoke test guard the mechanism. This is a measurement-tool correction, not an app speedup.
- Existing mixed workload gained opt-in native Wayland and on/off protocol logging; finite trace/parser/marker gates are reused. Marks bracket single-stream control and whole mixed leg. **Native mixed statistics do not certify presentation or latency for each individual switch.** Deliberate1.5-second dwells, idle roles and50Hz streams do not imply continuous180Hz demand.

## Higher-rate scroll repeats

Reports: `scratch/perf-lab/presentation-paced-{debug-2,debug-3,quiet-2,quiet-3}.{json,trace.json,png,wayland.log}` (quiet logs contain ordinary stderr, not protocol). All four completed five engaged legs; two debug captures passed the structural parser and all marker pairs. Screenshots debug-2 and quiet-3 were opened and inspected: real transcript/code, two sessions, app chrome and restored viewport.

| Run | Actual wheel median, up/down | Sent inputs, up/down | Scroll presentation median / p95, both directions | Renderer ≥50ms tasks |
|---|---|---|---|---|
| debug-2 |6.156 /6.187ms|480 /477|5.556 /11.111ms|0 across five legs|
| debug-3 |6.172 /6.152ms|459 /486|5.556 /~11.112ms|0 across five legs|
| quiet-2 |6.415 /6.442ms|471 /480|not measured with logging off|0 across five legs|
| quiet-3 |6.434 /6.463ms|474 /482|not measured with logging off|one62ms task in switching; two tasks totaling458ms in viewport-resize|

Debug captures recorded1310 and1298 presented commits respectively, each with one discarded feedback, all presented flags7 (vsync+hardware clock+hardware completion). Counts include startup/boundaries; discards cannot be assigned to legs and are not a dropped-refresh count. Quiet-3's resize rAF maximum gap was422.2ms; its two task durations were not separately retained. This is an observed intermittent stall, not explained or fixed by this pass. Other runs being faster does not resolve it. Two on/off repeats show considerable task-time variation and **do not establish logging overhead or logging being free**.

### Largest interval is not automatically a stall

Debug-3 scroll-down had a649.997ms inter-presentation interval. An offline correlation (`scratch/presentation-gap-debug-3.json`) used renderer mark `args.data.startTime` and trace timestamps; begin/end anchor offsets differed by~0.101ms, so this is approximate timing, not input-to-photon evidence. There were71 wheel requests during that gap, but the scroll position had already plateaued at27312px and only a2px adjustment to27310px occurred near its end. rAF continued (leg maximum gap5.7ms), with no ≥50ms renderer task. Thus sustained wheel dispatch did **not** imply sustained visible-position changes. This is consistent with reaching a boundary, but the original observer did not record contemporaneous scrollHeight/clientHeight, so an exact bottom-boundary cause is **not proven**. Do not call this650ms of dropped animation or declare its cause resolved.

## Long-history mixed activity

Same bounded-turn histories as earlier: six200-turn/400-authored-message seeds, ≥240 authored rows actually loaded per chat, many folded bodies. Three streams each completed1500 deltas at intended50/sec; two actual private40-second Bash/Node tools progressed concurrently; one idle conversation. Every successful run verified exact final stream/tool output, immutable seed histories, continued background progress, visible latest content and session-specific Files restoration. Twelve mixed switches span about17seconds.

| Run | Overall verdict | Click→rAF proxy range (not presentation latency) | ≥50ms renderer tasks in mixed phase | Whole mixed-leg native evidence |
|---|---|---|---|---|
| `presentation-mixed-open-drained-1.json` |measured, finalized receipt error=null|8–81ms (median16ms)|4, maximum75ms|1669 commits; interval median5.556ms, p9533.332ms, max55.556ms|
| `presentation-mixed-closed-foreground-1.json` |measured after user-approved uninterrupted foreground window; receipt error=null|8–28ms|0|1658 commits; median5.556ms, p9527.778ms, max66.668ms|
| `presentation-mixed-open-quiet-1.json` |measured control; receipt error=null|8–20ms|0|logging off: no native presentation verdict|
| `presentation-mixed-closed-drained-1.json` |incomplete native evidence: raw feedback lifetimes invalid|25–208ms (median77ms)|82, maximum146ms|unsupported; do not use parsed counts as validated evidence|
| `presentation-mixed-closed-drained-2.json` |incomplete workload: all12 switches unfocused|8–30ms|0|structural parser passed, but uncontrolled focus disqualifies comparison|

The valid Files-open debug capture has flags7, complete trace/marker pairs, and an immutable finalized receipt without error/truncation. Whole-capture count4085 presented/3 discarded/3 pending includes setup, completion and boundaries, not only the mixed interval. No refresh-loss percentage is inferred. **The subsequent user-approved foreground run supplies the missing valid Files-closed capture.** Both it and open-drained-1 use the same package, native capture implementation and workload parameters except Files state. They are not an interleaved/repeated controlled A/B pair: earlier variability remains, and these captures do not establish a causal Files-panel cost, statistical equivalence, logging overhead or universal smoothness acceptance.

Earlier `presentation-mixed-closed-1.json` (7–19ms, no ≥50ms tasks) and `presentation-mixed-open-2.json` (9–23ms, no such tasks) said `measured`, but final review found their serialized protocol receipts contained `Error: protocol sink closed`. Their workload/output observations remain recorded, while their **native-capture completeness claims are withdrawn**. Do not use their native counts/intervals as valid results. Raw reports were not rewritten.

Opened/inspected both open-2 and the final open-drained-1 stream-1/tool-1 screenshots: matching file names in each Files panel, visible final stream marker1499, final tool acknowledgment and completed command card. The earlier closed tool-2 screenshot has visible acknowledgment/card but captures the finite session-arrival fade; it is not a settled visual-quality comparison.

## Failed evidence is retained, not rewritten

- `presentation-paced-debug-1.*`: workload and trace markers complete, but raw protocol cannot establish feedback lifetimes. At raw log10634, `#66.presented` has no new request after its previous completion at10626; `#64` requests at10629 and10636 lack an intervening commit/terminal event. The acquire-point counter jumps833→854 across the gap. Root cause of the missing raw sequence is unproven; unchanged parser passed later captures. This original remains **unsupported/incomplete**, never repaired by later counts.
- `presentation-paced-quiet-1.*`: scroll-up engagement failed and the old report discarded partial workload details. A measurement-tool repair now attaches report.workload before execution and retains failed leg/input/scroll/focus diagnostics plus specific reasons. The original cannot establish which engagement condition failed and remains incomplete.
- `presentation-mixed-open-1.json`: outputs/history/drawers completed, but overall report failed because it captured startup focus=false before bringing its private target forward. Actual calibration/switch samples were focused. Future sampling is ordered after private focus, preserves startup snapshot and checks observed focus throughout the mixed phase and at end. The original is unchanged/incomplete. It also recorded a62ms mixed-phase task; that observation is retained, not erased by a faster repeat.
- Final review exposed a separate shutdown race affecting earlier mixed debug captures: process sweep could finish before buffered stderr data arrived, then the sink closed. A live-getter receipt changed from error=null during parsing to `protocol sink closed` at later JSON serialization. Repaired with a bounded1200ms stderr end/close drain after owned-process sweep and an immutable finalized receipt. Timeout/premature close/error/truncation cannot pass the mixed native or quiet gate. Regression tests cover delayed tail bytes, inherited-pipe timeout, premature close and immutable receipt.
- `presentation-mixed-closed-drained-1.json` now has a clean finalized receipt, but raw lifetime validation still fails (unscoped presented/reused feedback ID). This proves the shutdown repair does **not** resolve all raw-log validity failures. Its82 renderer tasks and25–208ms switching proxies are real retained observations with focused/visible samples and intact outputs; the cause is unassigned, not necessarily a logging or app-code cause.
- `presentation-mixed-closed-drained-2.json` passed raw/trace gates but was unfocused at every mixed switch/cadence sample and at phase end. It is not a valid foreground comparison, and does not explain the older~1Hz episode. After two unsuccessful Files-closed acceptance attempts, no further blind retry was run. Further controlled causal profiling needs an uninterrupted private foreground window; the source of focus loss is not attributed to the user or the app.

## Approved uninterrupted foreground follow-up

After Destin agreed to leave the private window foreground for about two minutes, `presentation-mixed-closed-foreground-1.json` completed without a code or package change. All12 switches, cadence samples and phase end were focused/visible; all existing workload/native validity gates passed, including the finalized stderr receipt, raw lifetimes, finite trace and clock markers. All three1500-delta streams, both tool results, six240-row loaded histories, latest arrivals and owned cleanup passed. Mixed phase lasted16.956seconds with no ≥50ms renderer tasks; click→rAF proxies ranged8–28ms. Conditional presentation statistics appear in the table above; deliberate dwells remain, so longer intervals are not classified as drops.

The tool-1 screenshot was inspected: real history, final acknowledgment and completed card visible, Files closed; it catches the finite arrival fade, not a settled visual comparison. The private app closed and an external package-process check found no remaining private process. No tests/builds overlapped this run. This is a focused reproduction attempt with existing timing/native trace instrumentation, **not a JavaScript CPU profile or causal attribution**: the prior208ms switching/82-task episode did not recur, and its cause remains unassigned. The user's cooperation is not proof that earlier focus loss or task stalls were caused by user activity.

## Verification and next scope

Scoped independent reviews cleared pacing after repairs, late trace ownership, whole-leg evidence wording, staged focus sampling and failed-leg retention. Parent final verification after the shutdown repair:123 scoped presentation/launcher/GPU/mixed tests passed (`scratch/presentation-followup-drained-final-tests.log`); edited measurement modules passed `node --check`, and `git diff --check` exited0. `bash scripts/verify.sh "$PWD/youcoded"` exited0: desktop types, related tests+source guards, knip, lint/design lint, ast-grep, named screens and journeys passed (`scratch/presentation-followup-desktop-verify.log`). This was not `--full`, and Android/Worker were not rerun. Final external package-process refusal check found no remaining private package processes. Successful mixed reports confirm six sessions closed and owned app stopped; failed originals/fixtures remain evidence rather than being overwritten.

Mechanical doc audit passed531/531 anchors and834/834 MAP paths, with unrelated quiet-worktree/workbench-documentation/rule-budget warnings. Read-only close-out mislabels unchanged ancestral branch tips as shipped despite this session's uncommitted work (a previously recorded tooling limitation); no deletion/archive/shipped-roadmap action was taken. Both workspace and app worktrees are retained, uncommitted and unshipped. Other sessions' leftovers were not modified.

No new app optimization is justified by these observations. Next targeted investigation is intermittent switch/viewport task stalls with causal profiling; do not assume they are compositor misses, the older~1Hz callback episode, or the known hidden-history construction cause. Native OS drag-resizing (these are viewport overrides), heavy-theme presentation, certified connection attribution, exact per-switch presentation demand, giant bodies and device/remote smoothness remain uncovered. Hidden-history Markdown construction remains the previously reproduced unresolved app stall. Sync-watcher work stays outside this session.
