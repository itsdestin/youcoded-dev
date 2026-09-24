---
date: 2026-09-24
status: draft
type: review
topic: specialists plans — spending rework T5 (history + estimate), commit b84d5d1ac
---

# Review — T5 "History + estimate" (commit `b84d5d1ac`)

Diff vs parent `905021fe4`. Design: `docs/active/design/2026-09-24-specialists-plans-spending-backend-design.md` §4,
Revision 1 D7. Decision 34 Q-4/Q-5 (`2026-09-05-specialists-plans/decision-log.md`).

- H1 accepted — service-wiring test added with T4 (same file) — [medium] — the wiring that actually makes `plan.estimate` real (`PlanService.estimateFor`,
  `desktop/src/main/harness/plans/plan-service.ts:364`, called from `propose` at `:449` and both
  `refreeze` call sites at `:532`/`:562`; `PlanHostBridge`'s new `history`/`specialistCanWrite` port
  wiring at `desktop/src/main/harness/plans/plan-host-bridge.ts:309,316`) has no test coverage in
  this commit or in the existing suite — evidence: `git show b84d5d1ac --stat` touches only
  `plan-estimate.test.ts` and `specialist-usage-history.test.ts` (both pure-function tests); `grep -n
  estimate desktop/tests/plan-service.test.ts` and the same for `specialistCanWrite|history` in
  `plan-host-bridge.test.ts` both return nothing. Only the math (`estimatePlan`) and the disk scan
  (`SpecialistUsageHistory`) are verified; whether `propose`/`resume`/re-freeze actually store a
  populated `estimate` on the journal record, or that a missing `history` dep degrades to defaults
  instead of throwing, is unverified by any test. Fix: add a `plan-service.test.ts` case that
  proposes a plan with a fake `history` dep and asserts `record.estimate` is populated, plus a
  resume/re-freeze case asserting it's recomputed.

- H2 accepted as low — a rebuildable cache; a torn/clobbered file self-heals on the next scan; no change — [low] — cache safety across processes. `flush()` (`specialist-usage-history.ts:278-279`) writes
  `~/.youcoded/specialist-usage.json` with plain `fs.promises.writeFile`, bypassing
  `NativeHome.mutateJson`'s cross-process lock, per an explicit, well-reasoned WHY comment
  (`specialist-usage-history.ts:15-27`) citing D7: this file is a pure, fully rebuildable cache, so a
  torn write costs at most a stale/corrupt cache, and `loadCache()`'s corrupt-read path
  (`specialist-usage-history.ts:~drop to empty on JSON.parse failure`) is tested
  (`specialist-usage-history.test.ts` "a corrupt cache file reads as empty rather than throwing").
  This tradeoff is sound. The one gap: with the live app and a dev instance (or two windows/processes)
  both scanning `~/.youcoded/sessions` and both debounce-flushing this same file, an interleaved
  write from one process can be silently clobbered by the other (last-writer-wins, no corruption
  necessarily — just staleness) with no test exercising two writers. Self-heals on the next scan or
  `record()`, so this stays low severity, but it's the one scenario D7's own reasoning doesn't name
  explicitly. No fix required before ship; worth a one-line test or a note if this file is revisited.

- H3 accepted — drop session-error from the scan list, with T4 — [low] — `USAGE_EVENT_TYPES` (`specialist-usage-history.ts:52`) includes `'session-error'`, but
  `session-error` is never persisted to a session's `.jsonl` file — `session-store.ts`'s `append()`
  explicitly short-circuits it ("`'session-error'` is display-only and never persisted", module
  comment at `session-store.ts:4-5`, enforced at `session-store.ts:183-186`). So the background SCAN
  (which reads transcripts off disk) can never actually observe that branch — a run whose final reply
  ended in a provider error never contributes that reply's usage when its history entry is later
  rebuilt from disk (e.g. after an app restart before `record()` ran, or for a pre-existing session
  the live path never saw). The LIVE `record()` calls (`reportSpecialistSpend` /
  `runPlanChild`'s `finally`) are unaffected — they use the harness's own in-memory usage totals, not
  a transcript re-parse, so an error-terminated run IS captured correctly the first time. This mirrors
  the evidence script's own limitation (`2026-09-19-specialist-usage.py` reads the same on-disk files)
  and is not a regression, but the design text's phrasing ("summing usage from turn-complete,
  user-interrupt, session-error, compact-summary") reads as though all four are live branches on disk;
  one is dead code for the scan path. Low impact (estimates skew very slightly low only for
  scan-recovered, error-terminated runs); worth a one-line comment correcting the expectation, not a
  behavior change.

- H4 accepted — copy nit fixed with T4 — [low] — copy nit, not correctness: `composeUnpricedNote` (`plan-estimate.ts`) joins 2 notes with
  `' and '` (tested, matches decision 34 Q-5's "runs on your computer and included in your ChatGPT
  plan"), but a 3-way mix (local + ChatGPT + no-published-price all in one plan) would render as
  "X and Y and Z" — grammatically odd, not Oxford-comma'd. Untested (only 1- and 2-note cases have
  test coverage) and probably a rare real-world case; flagging for awareness, not a blocker.

**Verdict.** No main-process blocking found — `SpecialistUsageHistory`'s constructor, cache load, and
background scan are entirely async (`fs.promises`/`readline`+`createReadStream`), correctly deferred
with an `.unref()`'d `setTimeout`, and the scan yields per-file via `setImmediate`, keeping memory
bounded to one open stream regardless of session count. The `~/.youcoded/mutateJson` bypass is a
deliberate, tested, and reasonable tradeoff for a rebuildable cache (H2 is a residual multi-process
edge case, not a defect). No double-entry between the live `record()` calls and the background scan —
both key the same `Map<childId, …>`, so a scan reaching an already-`record()`-ed session merely
overwrites the placeholder `size: 0` entry with real stat numbers, and plan children never also go
through `reportSpecialistSpend`'s `runDelegation` path (verified: `startPlanChild`/`runPlanChild`
drive the child directly via `send()`/`sendTurn`, not `runDelegation`). Estimate math (fallback chain,
run counts, quantiles, unpriced note wording, mixed-plan dollar range) matches design §4 and decision
34 exactly, with 58 passing unit tests exercising real values (not tautological assertions) against
temp-dir fixtures rather than `~/.youcoded`. The one real gap is H1: the propose/resume/re-freeze
wiring that turns the tested math into a stored `plan.estimate` is itself untested, which is where a
future regression (e.g., a dropped `estimate:` field, or a `history` dep silently wired to nothing) is
most likely to go unnoticed by CI.
