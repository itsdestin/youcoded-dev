---
title: Performance first batch — measured results and current execution state
status: superseded
date: 2026-09-27
---

# First-batch results

## Accepted tooling change, not shipped

The perf-lab comparator now checks report completion, machine identity, renderer/compositing and all recorded GPU feature statuses, pre-boot noise bounds, and matching scenario descriptions. Incomparable reports cannot receive KEEP; CLI exits nonzero and says INCONCLUSIVE before attempting screenshot I/O. This does not measure midrun interference. Red tests demonstrated the missing checks. After independent review corrections, controller verification passed 113 named tests. No commits or pushes.

## Unchanged-app baseline

`perf-reports/2026-09-27-2327-bb939f9-audit-baseline.{json,md}`:
- App `bb939f917e3e64437825b24f3b86b02f14843825`, private fixture HOME, packaged Electron, llvmpipe software rendering.
- History stable medians: small617ms, medium623ms, huge577ms; three repeats each.
- Native stream visible busy: 7395.5/8687.6/9811.9ms over approximately20s; median43.3% busy.
- Stream switching median101.6ms and per-report rollup p95 141.3ms.
- All recorded app errors0, `incomplete: []`; self-comparability succeeds.
- Twelve quiet-machine polls discarded; large repeat variation. No small-effect confidence claim.

## Timestamp experiment — NOT accepted as a performance win

Two diagnostic CPU profiles (`scratch/perf-lab/profiles/audit-diagnostic-visible-*.cpuprofile`) attributed272.937/305.275ms self samples to `formatBubbleTime` (minified Qj, resolved against the built bundle). The profile summary's V8/runtime bucket includes idle; it must not be called GC cost. Bundled dependency code is also included in its app-code bucket.

Candidate: reuse the displayed assistant timestamp across content changes; invalidate on timestamp/show flag and cheap timezone-offset/browser-language keys. A new component test failed with40 formatter calls for40 streaming changes; passed after memoization. Reviewer spotted environmental invalidation, prompting the timezone regression. Full `verify.sh` passed types, related tests, knip, lint, design lint, ast-grep, screen open and journeys after an optional-timestamp type error was fixed.

After report: `perf-reports/2026-09-27-2351-bb939f9-timestamp-after.{json,md}`. Target renderer busy8687.6→8401.6ms (-3.3%), switching median101.6→88.5ms. History medium623→781ms, huge legacy-last10 IPC143→272ms. Comparator **REJECT**: target below5% and other primary regressions. Different ongoing machine activity is a hypothesis, not established attribution. Do not call this a measured overall improvement.

Candidate was removed from the app source after the REJECT; complete patch saved to `scratch/timestamp-rejected-candidate.patch`. Do not silently include it in an accepted fix. The initial Find diagnostics used the candidate build, so capture a fresh unchanged-source baseline before comparing the Find fix.

## Long-chat Find — large stall reproduced

New `scripts/perf-lab/find-diagnostic.mjs` resumes synthetic huge history via IPC, selects its actual session pill, loads pages through the scroll sentinel, requires folding engagement, then opens Find and types via CDP into the isolated app. It records renderer metrics, bounded long-task/rAF-gap samples, GPU identity, viewport and a screenshot outside timing. It measures DOM-ready plus two rAF callbacks, **not presentation time**. This remains diagnostic tooling, not yet an integrated recurring performance gate.

The first shakedown failed correctly because its search term `Question` did not occur in the realistic fixture. Its screenshot showed0/0. Corrected to `Turn `, visibly present in user prompts. Do not treat the failed30s search wait as app latency.

| Diagnostic | Acceleration | Entries / folded before | Find DOM-ready | Renderer script while opening | Worst opening long task |
|---|---|---|---|---|---|
| `find-shakedown-confirmed.json` | software llvmpipe |1020 /1015|1925ms|1558.3ms|1554ms|
| `find-gpu-shakedown.json` | hardware Radeon8060S, compositing and rasterization enabled |1020 /1015|1982ms|1594.9ms|1570ms|

Both reports and screenshots are under `scratch/perf-lab/`. Software screenshot was opened and verified: Find shows1/1024. Query-triggered navigation also loaded another page (afterState1080), so typing's result count is not a fixed1020-entry corpus measurement. Hardware viewport1707×1016 at1.5 scale differs from software1200×800 at1 scale; these are independent reproductions, not an A/B hardware-speed comparison. No displayed-frame/drop-rate claim.

Mechanism: `ChatView.tsx` calls `useEntryFolding(!findOpen, ...)`; disabling the hook clears its folded set, remounting all loaded message bodies. `ContentFindBar` needs those bodies because it searches DOM text. Simply retaining folding would silently lose matches; simply delaying the same work moves the freeze to typing. The measured hardware reproduction confirms this is not only a software-rendering artifact.

## Next execution step

The first rendered-text index and optional folding capture/reveal support were built and passed full desktop verification (`scratch/find-groundwork-verify.log`). They were not wired to Find because disclosure state can reset on remount, making previously captured card text an unsafe source of definitive matches. Review's stale-detached-spacer finding was fixed with a coalesced removal publish and red/green key-reuse test; a real React Range-lifetime test was added.

Destin has now resolved scope: **“no reasoning/tool details, just all message content including offscreen messages.”** User and assistant message bodies are the searchable corpus; reasoning, tool inputs/results and metadata/chrome are excluded. This supersedes the old generic rendered-row/non-row capture design. Revised implementation is running under `docs/archive/plans/2026-09-27-folded-chat-find.md`'s scope amendment. The previously stated loaded-history boundary remains; older unloaded pages are not silently promised. Keep the Find bar layout unchanged and use targeted reveal/pinning rather than global unfolding.

The dedicated Find probe now rejects insufficient folding engagement (one old repeat had only110/1020 folded, so it is not an equivalent baseline). The unchanged pre-integration package is preserved under `scratch/perf-lab/find-baseline-app` with its build stamp; `find-diagnostic.mjs --app-dir` can select it without swapping source. Baselines with the tightened readiness criterion and matched after measurements are still required.

## Connected message-only implementation and provisional measurements

Message-only Find is now connected with bounded async index preparation, cancellation, sustained-stream refresh, per-body Markdown projection and targeted reveal. Generic rendered-text capture machinery was removed. Eighty focused tests and full desktop verification passed; multiple independent reviews found and prompted fixes to attachments, stale counts, pending recovery, all-mounted highlights and streaming starvation. One large Markdown body remains an indivisible parse; no universal frame budget is claimed.

Three interleaved hardware pairs (`scratch/perf-lab/find-final-{before,after}-{1,2,3}.json`) used the same Radeon renderer and1707×1016 viewport at1.5 scale,1020 loaded/1015 initially folded entries and exact query `Turn 3250:`. Provisional medians: open1831→26ms, first query112→655ms, sum of open+query1919→673ms; worst long-task median1452→0ms (zero means none meeting the50ms API threshold). All matched the expected Range text1/1. These are not accepted end-to-end results yet: screenshot inspection showed BOTH baseline and candidate at the latest messages rather than the selected earlier match. A correct Range in the registry is not proof it is visible. Suspect is automatic bottom sticking repinning after search scroll; a focused fix/regression is in progress.

The diagnostic has been strengthened again: after timings stop, it samples selected-range/viewport intersection until visible for300ms, rejecting results that were scrolled away. Geometry checks remain outside timing windows to avoid charging probe layout to the app. Earlier `find-final-*` reports lack this proof and must be labelled provisional. No frame-delivery or memory win is claimed from them.

Still outstanding in the approved batch: finish navigation correction and repeat accepted hardware evidence; reduce/measure blank-content probe overhead; hardware presentation tracing (current rAF proxy is not that); scale/memory and cross-workload measurements. Broader Android/remote/soak/scheduled runner work remains subsequent scope. No production app access, configuration changes or paid model calls occurred.
