---
date: 2026-09-24
status: active
type: review
topic: code review — commit eaeb836cd ("T1 shapes — spend limits replace per-step token budgets")
---

# Review: eaeb836cd (plans spending rework, T1 "Shapes")

Commit under review: `eaeb836cd3d47819721eea48a45e08540b96e36a`, branch `feat/specialists-plans-ui`,
worktree `/home/destin/youcoded-dev/worktrees/specialists-plans`. Reviewed against
`docs/active/design/2026-09-24-specialists-plans-spending-backend-design.md` (incl. Revisions 1-3)
and decisions 33-37 in `docs/active/design/2026-09-05-specialists-plans/decision-log.md`. Read-only
review; no code changed.

## Findings

- R1 accepted — fixing now — [high] — Crash recovery's transcript safety check is dead code: an attempt's `phase` never
  leaves `'prepared'`, so `recoverAttempt` always skips straight to "just restart," even for an
  attempt that already ran and left an unanswered EXTERNAL tool call. Evidence: `createAttempts`
  creates every attempt with `phase: 'prepared'` (`desktop/src/main/harness/plans/plan-executor.ts:796`);
  the old code's only site that ever advanced phase past `'prepared'` lived in the now-deleted
  `PlanBudget.reserveAttempts`/request-gate (`attempt.phase = 'request-sent'`, confirmed absent from
  this commit via `git show eaeb836cd~1:.../plan-budget.ts` line 574); nothing in this commit — or
  anywhere in `desktop/src/main/harness/plans/*.ts` — sets `phase` to `'launched'` (repo-wide grep
  finds only the `'committed'` assignment at `plan-journal.ts:738`). Consequence:
  `recoverAttempt`'s guard `if (original.phase === 'prepared') return undefined;`
  (`plan-executor.ts:726`) fires for EVERY unfinished attempt, so `inspectTranscript`/
  `routePlanPause` (the dangling-effect/`unansweredExternal` check) never runs. This path is hit
  not just after an app crash but on every ordinary Continue-after-pause, since `drive()` calls
  `prepare()` on every run start (`plan-executor.ts:632`). Once skipped, the wave's own restart
  (`memberStart`/`launchBrief`, `plan-executor.ts:1023-1024`, `planRestartBrief` at line 69-72)
  resumes the specialist and tells it "Check the current state before repeating it" for ANY
  dangling effect, including `external` — silently resuming instead of pausing for
  Continue/Stop. This is exactly the regression decision 13 and the design's "Kept" list (§1)
  say is preserved ("the rule that an unanswered EXTERNAL call is never replayed") but is not.
  Fix: set `a.phase = 'launched'` inside the `recordChild` callback once `runner.launch()`
  resolves (`plan-executor.ts:1036-1052`), and revert it to `'prepared'` is unnecessary since
  `prepare()`/`recoverAttempt` only need to see it move off `'prepared'` once a request is
  actually in flight.

- R2 accepted — fixing now — [medium] — Even after R1 is fixed, Continue has no working "explicit recovery" for an
  unknown-outcome/external pause: the old `ambiguityReported`/"acknowledged" flag that let a
  user's Continue press pick the attempt back up is deleted with no replacement (schema:
  `desktop/src/main/harness/plans/types.ts` — `ATTEMPT_PHASES` shrunk to
  `['prepared','launched','committed']`, dropping `ambiguous`). The implementer's own comment
  admits it: "an unanswered-external pause may re-pause once more on Continue instead of
  relaunching" (`plan-executor.ts:726-733`, doc-comment above `recoverAttempt`). This is flagged
  in code but not filed as a roadmap item or a named test (Revision 1 D6 promised a test — "after
  a crash, a launched attempt whose transcript ends in an unanswered EXTERNAL tool call is never
  re-run automatically" — not present in this commit's test file list). Once R1 ships, this
  becomes the next visible symptom: Continue on that specific pause kind re-pauses immediately
  instead of resuming, with no user-facing explanation of why the button appears to do nothing.

- R3 accepted — fixing now — [medium] — `plan-executor.ts` underwent a ~700-line behavioral rewrite (recoverAttempt,
  createAttempts, runWave, restartAfter, reportOnlyRetry, commitReport, settle) but
  `desktop/tests/plan-executor.test.ts` was not touched by this commit (absent from `git show
  --stat eaeb836cd`'s file list) and still references the deleted `PlanBudget`/reservation API, so
  it cannot currently compile or run. The commit message concedes "several later-task test files
  are left red." Combined with R1, this means the exact code path with the crash-safety
  regression currently has zero passing automated coverage, and nothing will catch a regression
  or a fix here until T3 revisits this file.

- R4 accepted as planned — T4 wires the per-step model — [low] — Scope: `resolveManifest` (`desktop/src/main/harness/plans/plan-host-bridge.ts:577-637`)
  and `reconcile()`/`refreeze()` (`desktop/src/main/harness/plans/plan-service.ts`) were rewritten
  in this commit even though the design's task order assigns per-step model resolution to T4 and
  the reconcile/auto-start rework to T4/T6, not T1 ("Shapes"). What's here is internally
  consistent — the schema now accepts a per-step `model` field and `stepModels` overrides, but
  `resolveManifest` ignores both and freezes every leaf step to its specialist's plain default
  (`plan-host-bridge.ts:622-629`, doc-comment above `resolveManifest` at ~562 admits this
  explicitly) — so a plan document naming an explicit `model` will silently run on the default
  model instead, with no error or notice, until T4 lands. Worth flagging because it's scope creep
  with no matching task-level test coverage (same gap as R3), not because the current behavior is
  wrong for T1's stated scope.

- R5 accepted — fixing now — [low] — Dead code left behind: `estimateUsd()` (`desktop/src/renderer/components/plans/PlanCard.tsx:105-107`)
  is defined but never called anywhere in the file (grep confirms) — its only caller was the
  deleted Add-budget token-to-dollar conversion. Harmless (no runtime effect), but `npm run knip`
  should catch it; worth deleting in T7's renderer pass rather than carrying it forward.

- R6 already handled — checked correct — [low] — Confirmed correct, no fix needed: v1 journal retirement
  (`plan-journal.ts:498-535`, `readRawRetiringV1`) is fully async (`NativeHome.readRawBytesAsync`,
  `createFileExclusive`, `fs.promises.unlink`), handles the `ENOENT` race from a concurrent
  retirement, and is idempotent — no main-thread blocking, no data loss beyond the explicitly
  accepted v1-plan loss (decision 33.4).

- R7 already handled — checked correct — [low] — Confirmed correct, no fix needed: the `model` field's JSON-schema description
  ("Only when the user explicitly asked for a model for this step...", `schema.ts:328`) and
  `propose_plan`'s tool description ("Set `model` on a step only when the user explicitly asked
  for a particular model there.", `tools/propose-plan.ts:66-68`) both match decision 35.4's
  "the assistant changes a step's model ONLY when the user explicitly asks" verbatim in spirit.

## Verdict

The T1 diff itself — schema/validator/journal-v2/shared-types/tool-text — is a faithful, careful
implementation of design §§2, 6, 8-9 and decisions 33-37, and the v1 journal retirement (R6) and
model-field wording (R7) are both correct. The renderer changes (`PlanCard.tsx` and friends) are
internally consistent with the new `PlanView` shape and introduce no stale-field/`undefined`/`NaN`
risk. However, the commit's admitted scope creep into `plan-executor.ts` — meant to be
"minimum compile-fixing edits" cascading from the `plan-budget.ts`/`budget-adapter.ts` deletion —
introduced one real, high-severity regression (R1): the removal of the old request-gate's
`phase = 'request-sent'` transition, with nothing added to replace it, silently disables the
crash-recovery/Continue-after-pause safety check that is supposed to stop an unanswered EXTERNAL
tool call from ever being auto-resumed — the one invariant this review was specifically asked to
confirm. It is compounded by R2 (Continue has no working explicit-recovery path even once R1 is
fixed) and R3 (the file that needs to prove both is currently untested and won't compile). No spend
tracking exists yet — confirmed nothing crashes and a plan still runs to completion, since
`planSpend` is unwired everywhere (only referenced in WHY comments) and `attempt.spentTokens`/
`plan.usedTokens` simply stay at 0 throughout T1. Recommend fixing R1 before this branch
continues past T1 — it's a small, isolated fix (set `phase = 'launched'` in the existing
`recordChild` write) — and filing R2 as an explicit T3 task rather than leaving it as an
undiscoverable code comment.
