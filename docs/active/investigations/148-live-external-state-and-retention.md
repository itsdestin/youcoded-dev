---
status: active
work_item: 148
---
# Live external-state validation and retention controls

## Verified external-state results

Recovered the completed sequential run after an interrupted result-collection call. `scratch/harness-lab/state-check-v1/results.json` is now written from Harbor's controller-owned `agent_result.metadata.scenario` and independent final file verifier, not merely agent-written output logs.

All five clients passed `between-turn-user-revision` on `anthropic/claude-haiku-5.5`, pinned to first-party `anthropic`:

| Client | Physical requests | Controller receipt and final files |
|---|---:|---|
| YouCoded | 5 | Passed |
| Claude Code | 5 | Passed |
| Pi | 5 | Passed |
| Hermes | 7 | Passed |
| OpenCode | 6 | Passed |

Every request returned cost telemetry. Final accounted exposure after these trials: USD0.5929722775 including prior estimates. No pending requests remain. Gateway container was absent when checked and its idle dedicated network was removed.

This measures preservation of an intervening external edit BETWEEN completed user turns. It does not establish synchronized within-turn stale-write protection, broad safety, statistical superiority or timing efficiency. Client reasoning/output settings are not yet standardized, even though model and provider route match. The changed accessibility note, destination, unrelated file and requested numeric updates were independently checked; controller before/after hashes were required.

## Retention gate

The context investigation did not establish equivalent 200000-token client windows or automatic-compaction thresholds across all five current adapters. This is an inspection gap, not proof that competitors lack such settings. Gateway context ceilings are not client-side compaction controls.

The subsequently completed native-only infrastructure/retention probe below followed this qualification contract: explicitly record a lab-controlled window, verify the resolved session context through actual runtime evidence, retain per-request usage and runtime compaction events, and independently verify the final record/protected file. A deterministic generated long history is not itself evidence of actual token occupancy or compaction. No matched long-context comparison is claimed and the full paid suite remains gated.

The dev-only context controls were implemented, independently tested (41 native lab tests and desktop verification passed), and reviewed before the single paid probe. No production runtime source change, live-app modification, merge or source commit was made.

## Completed native-only retention probe

`retention-live-v1/results.json` records the independent qualification. All 15 declared user steps completed; the final file verifier passed, including exact amended constraints and unchanged protected.txt. Requested and runtime-observed windows were both 200000 tokens, explicitly labeled a lab-controlled override rather than a provider limit. Gateway peak single-request input was 182920 tokens, exceeding the declared 70% qualification threshold.

One native `compact-summary` event (`39870aa4-ec9f-4221-be08-a943b5b837ae`) carried `autoCompaction: true`, contextUsedBefore 182196 and contextUsedAfter 25200. There were no manual compact steps. The native source identifies this flag with its automatic threshold-driven path; the after-context figure is runtime-estimated, not independently measured provider occupancy. The real-model run therefore demonstrates retention after automatic compaction for this controlled workload, not general memory quality or parity with competitors.

18 upstream requests all reported billed costs, totaling USD0.26458773. Accounted ledger exposure after the run was USD0.8575600075, including earlier estimates; no reservations remained. Gateway container and network were absent on the post-run check. Both comparison and competitor context qualification remained open at that checkpoint. Bounded competitor retention qualification subsequently completed; see `148-competitor-retention-qualification.md`. Current completed/partial comparison coverage is recorded in `../plans/148-current-state.md`.
