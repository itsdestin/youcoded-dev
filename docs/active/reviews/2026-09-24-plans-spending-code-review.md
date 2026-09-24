---
date: 2026-09-24
status: active
type: review
topic: code review — specialists plans, spending rework stage 1 (ce2f500a6..HEAD), cross-task integration
---

# Review: specialists plans — spending rework, stage 1 (`ce2f500a6..HEAD`)

Fresh review, no context from the implementing sessions. Scope: the range `ce2f500a6..HEAD` on
`feat/specialists-plans-ui` (T1–T7 plus the UI mockup round), read against
`docs/active/design/2026-09-24-specialists-plans-spending-backend-design.md` (incl. Revisions
1–3) and decisions 33–37 in `docs/active/design/2026-09-05-specialists-plans/decision-log.md`.
Per-task reviews T1–T6 already read and not repeated here except where a cross-task angle they
couldn't see is involved. Focus per brief: cross-task integration (T7 wiring, chip-vs-total,
resume(limit) end to end, the full propose→…→complete flow), leftovers, performance, and
contradictions with the decisions.

## Verify summary

`bash scripts/verify.sh worktrees/specialists-plans` (full suite — test infra changed):

```
PASS  types (tsgo --noEmit)
PASS  types in tests/ (tsgo --noEmit, 47 file(s) still excluded)
PASS  tests (full suite)
PASS  dead code (knip)
PASS  lint (oxlint)
PASS  design lint (oxlint --max-warnings ratchet)
FAIL  invariants (ast-grep) — rule app-prompt-show-starts-only-on-ready, App.tsx:1853
```

The ast-grep failure is **not caused by this branch**: `git diff ce2f500a6..HEAD --
desktop/src/renderer/App.tsx` touches only the `planEvent` handler (removes the `markPlanReceived`
call and its import) and never touches the `promptShow` handler the rule flags. The flagged
`setInitializedSessions` call at line 1853 is byte-for-byte present in `App.tsx` at `ce2f500a6`
already (confirmed via `git show ce2f500a6:desktop/src/renderer/App.tsx`, same call site, same
surrounding code). This is pre-existing breakage on the branch's own merge base, unrelated to the
spending rework; not itself a finding against this feature. Android: T7's commit message reports
`./gradlew test -x bundleWebUi` — 954 tests, 0 failures — not re-run here (read-only review,
budget).

## Findings

- F1 [accepted — fixed] — `desktop/src/main/harness/plans/pause-routing.ts:30` and `desktop/src/main/harness/plans/types.ts:83` — `PlanRecoveryCause`'s `'unknown-request'` value is dead: nothing in production code ever assigns it, contradicting the design's explicit instruction to remove it — how confirmed: `grep -n "cause:" desktop/src/main/harness/plans/plan-executor.ts desktop/src/main/harness/plans/plan-journal.ts` finds only three assignment sites for a `PlanRecoveryCause` (`plan-executor.ts:916` `'unknown-outcome'`, `:1471` `'launch-failed'|'specialist-error'`, plus `invalid-report` inside `reportOnlyRetry`); `'unknown-request'` appears nowhere as an assignment, only as a type-level union member (`pause-routing.ts:30`, `types.ts:83`) and inside a hand-built journal fixture in `desktop/tests/plan-service.test.ts:290,304` that simulates an old-style recovery record. The design says explicitly (§3 "Crash safety"): "the `request-sent`/`ambiguous` phases and the `unknown-request` cause can go," and lists it again under `pause-routing.ts`'s "Deleted entirely" in §1. Since decision 33.4 retires every v1 journal outright (renamed to `.v1-retired`, a fresh empty v2 journal started), a v2-era plan can never legitimately contain an `'unknown-request'` recovery either, so the value is unreachable in both directions — it survives only because one test still constructs it by hand. Not a functional bug (nothing crashes; the value is simply never produced), but it's exactly the "grammar tightens IN PLACE" cleanup decision 33.4 asked for and one enum member of it wasn't done.

- F2 [accepted — fixed] — `desktop/src/renderer/components/plans/PlanCard.tsx:30-51` — the file's top-of-file doc comment still states the DELETED per-step ceiling/budget model as current, verbatim-contradicting behavior confirmed elsewhere in this same diff — how confirmed: line 45-46 reads "Q-6 A plan that hits its ceiling pauses IN PLACE: finished work stays, the stuck step says why, Add budget / Stop," and lines 49-51 read "Settled by the spec (§4), not up for re-derivation: budgets are hard stops, the ceiling is Σ(step cap × fan-out) priced per model, dollars appear only when the model has a published price — tokens always do." Both sentences describe the exact mechanism `budget-adapter.ts`/`plan-budget.ts` implemented and this range deletes in full (`git show ce2f500a6:desktop/src/main/harness/plans/plan-budget.ts` exists, 820 lines; absent at `HEAD`). The current, correct behavior two lines up in the SAME function's neighbourhood (`planIcon`, line 76) is "Add budget / Continue are right there" in an inline comment that is itself stale in the same way — a `spend-limit` pause today offers Continue/Stop only (`routePlanPause('spend-limit')` → `{route:'user', actions:['continue','stop']}`, confirmed in `plan-service.ts` per T6's review V6, and no `Add budget` button exists anywhere in this file per `grep -in "add budget" PlanCard.tsx`, which returns only WHY-comments explaining its absence). A reader who opens this file cold — exactly the position a future session or reviewer is in — is told the wrong mental model before reading a single line of real logic below it.

- F3 [accepted as plausible — watch in Destin's live test; no change without evidence] — PLAUSIBLE — `desktop/src/main/harness/plans/plan-spend.ts:142` / `desktop/src/main/harness/plans/plan-journal.ts:625-635` — every `afterReply` journal write (one per model reply within a plan specialist's turn, not one per plan step) fires a `plans:event` push to every window and every remote client via `PlanHostBridge`'s `onEvent` → `port.emit` → `nativeHost.emit('plans-event', …)` → `sendForSession`/`remoteServer.broadcast` (`ipc-handlers.ts:3239-3240`), and the renderer's `chat-reducer.ts` `PLAN_CHANGED` case allocates a fresh `toolCalls` Map and a fresh session-state object on every one of these (`chat-reducer.ts:2987-3011`), which is the app's standard live-update pattern for frequently-updating cards (mirrors `SHELL_RUN_CHANGED`/`SPECIALIST_RUN_CHANGED` immediately below it) rather than something new to this branch. I did not find a `React.memo` wrapper on `PlanCard`'s exported component (`grep -n "React.memo\|memo(" PlanCard.tsx` — no match), so a `PLAN_CHANGED` dispatch re-renders whatever reads that session's `toolCalls` map, same as it always has for shell/specialist events. This is very likely NOT a regression — the OLD per-request reservation system (`plan-budget.ts` at `ce2f500a6`) wrote to the journal via `mutateFenced` TWICE per reply (`reserve` at line 529, `settle` at line 593), so the new one-write-per-reply `afterReply` is if anything less frequent than before — but I could not fully verify the OLD system's write frequency mapped 1:1 to a `plans:event` push (its `onEvent` wiring predates this diff and I did not trace it back further), so I'm marking this PLAUSIBLE rather than asserting no regression. Worth a stress check (a plan step generating many short replies quickly, e.g. a fast local model doing dozens of tool calls) if this hasn't been profiled — not something I could confirm or rule out from static reading alone within budget.

- F4 [already handled — confirms correct wiring] — already covered by T2/T3 review, re-confirmed correct, no new issue — the chip-vs-journal single-source design (Revision 3 F1/F2: one `PlanSpend` object built in `startPlanChild`, attached via `buildSpecialistSession`'s `extra.plan` and `wireChildLive`'s `opts`, `commitReport` awaiting `handle.spendSettled()` on all three of its call sites) is implemented exactly as designed — confirmed by direct code read of `native-session-host.ts:3576-3822,5326-5477` and `plan-executor.ts:1580-1596` (the three `commitReport` call sites at `897`, `1384`, `1750` all route through the one function that awaits `spendSettled()` and checks `run.spendWriteFailed` before committing). Not a new finding — listing only to record that the highest cross-task integration risk in this branch (does the chip ever diverge from the journal total) checked out under direct reading, not just the T2 review's own tests.

## Cross-task areas checked, no issue found

- **T7 wiring across every surface.** `preload.ts`, `ipc-handlers.ts`, `remote-shim.ts`,
  `remote-server.ts`, `plan-requests.ts` (the one shared handler both desktop IPC and the remote
  WebSocket call), and Android's `PlansBridge.kt`/`SessionService.kt` all carry the identical
  channel set (`plans:set-limit`, `plans:set-step-model` in place of `plans:add-budget`;
  `plans:resume` now takes an optional `limit`; `plans:set-auto-approve` takes `underUsd`). Traced
  each file's diff directly rather than trusting the commit message. `android-honest-build.test.ts`
  mechanically pins the Kotlin side's channel list against the same array.
- **`resume(limit)` end to end.** `PlanCard.tsx`'s `continueWithNewLimit` (line 390-395) sends
  `{tokens}` or `{usd}` based on the plan's own `unpriced()` classification, matching the server's
  independent classification in `plan-service.ts`'s `pricingUnit()` (`'highUsd' in plan.estimate`)
  — both sides agree, though the wire object's unit KEY is actually ignored server-side by design
  (`NativeSessionHost.limitNumber` unwraps either key to a bare number; `plan-service.ts`'s
  `applyLimitChange` derives the unit itself from `plan.estimate`, never from the caller) — a
  deliberate, documented choice (`plan-service.ts:190-203`'s comment), not a bug.
  `plans-lifecycle.integration.test.ts`'s "a spend limit reached mid-run pauses the plan; Continue
  is refused until the SAME call raises it, then finishes without re-running the finished step"
  exercises the real propose→approve→run→limit→continue→complete flow against a real host, and
  passes under `verify.sh`'s full run.
- **`PlanView` fields removed but still read.** Grepped the whole of `desktop/src`/`app/src` for
  property-access forms (`.ceilingTokens`, `.ceilingUsd`, `.budgetTokens`, `.addBudget(`,
  `.warmMinimum`, `.minimumAddTokens`, `.setupTokens`, `.approximateLimit`, `.disabledAdapters`,
  `.underTokens`) — every hit outside comments is gone; the only surviving hits are WHY-comments
  explaining the removal, and one unrelated `readUnderTokens`-adjacent comment
  (`plan-service.ts:358`) documenting the rename.
- **Auto-start settings row (`SpecialistsSection.tsx`).** Reads `r.underUsd` (not the old
  `r.underTokens`), default draft `'5'` (dollars, matching the new "$" prefix in the UI), and the
  design's required caveat removal is done — no leftover mockup-era text.
- **Main-process blocking.** `plan-spend.ts`'s `afterReply` chains through `journal.mutateFenced`
  (async, no `*Sync`), never awaited by the caller (fire-and-forget with a `.catch`), matching
  design §3's "no `*Sync`" and performance rule 1.

## Not covered

- Did not independently re-verify T1–T6's own already-accepted findings (R1-R7, S1-S3, X1-X5,
  M1-M3, H1-H4, V1-V10) — trusted their review files per the brief.
- Did not run the Android test suite myself (read-only on the worktree; a dev instance and
  possibly another agent are active there); relied on T7's commit-message-reported run.
- Did not stress-test F3 (rapid-reply plan specialist re-render cost) — flagged as PLAUSIBLE
  rather than confirmed or ruled out; would need either a live profiling run or a targeted
  render-count test (`busy-app-render-budget.test.tsx`-style) against a plan card receiving many
  `PLAN_CHANGED` events in quick succession.
- Did not deep-read `plan-card-signed-states.json` (2,455-line fixture) beyond grepping it for
  retired field names; a manual visual pass on its rendered output is out of scope for a code
  review.
- Did not re-review the pre-existing (non-spending-rework) plan mechanics this branch didn't
  touch — verify/combine dependency chaining, repeat-round logic, permission broker wiring — since
  the design doc and decisions 33-37 don't ask this range to change them and I found no evidence
  it did.
