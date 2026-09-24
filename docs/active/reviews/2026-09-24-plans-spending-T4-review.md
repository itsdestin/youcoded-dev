---
date: 2026-09-24
status: active
type: review
topic: code review — commit 3bc0baf44 ("T4 — manifest + step models (design §5) + T5 review fold-ins")
---

# Review: 3bc0baf44 (plans spending rework, T4 "Manifest + step models")

Commit under review: `3bc0baf44c3e65c9b1216cb540216190d9376f42`, branch `feat/specialists-plans-ui`,
worktree `/home/destin/youcoded-dev/worktrees/specialists-plans`. Reviewed against
`docs/active/design/2026-09-24-specialists-plans-spending-backend-design.md` §5 and decisions 25,
27, 35 in `docs/active/design/2026-09-05-specialists-plans/decision-log.md`. Read-only review; no
code changed. `npx vitest run tests/plan-step-model.test.ts tests/plan-host-bridge.test.ts
tests/plan-tier-change.test.ts` (from `desktop/`): 59/59 passed. Also ran
`tests/plan-estimate.test.ts tests/specialist-usage-history.test.ts` (H3/H4 fold-ins): 33/33 passed.

## Findings

- M1 accepted — interleaving test added with T6 — [low] — `setStepModel`'s "started" lock is race-free by construction, but no test exercises the
  actual concurrent race (a `resolveStep` in flight while `createAttempts` commits before the
  write lands) — every "lock after start" test simulates the started state by mutating the journal
  first, then calling `setStepModel` synchronously after. Evidence: `desktop/tests/plan-step-model.test.ts:137-155`
  ("refuses a step with ≥1 attempt") writes the attempt via `bridge.journal.mutate` and only then
  calls `setStepModel` — no interleaving. The correctness argument holds on inspection: both
  `PlanJournal.mutate` (`desktop/src/main/harness/plans/plan-journal.ts:587`) and `mutateFenced`
  (`plan-journal.ts:701`, used by `createAttempts` at `plan-executor.ts:938-965`) funnel through the
  same `home.mutateText` → `mutateFileUnderLock` chokepoint (`desktop/src/main/native-home.ts:146-161`,
  `artifacts/cas-write.ts`), and `PlanService.setStepModel`'s started check reads the fresh `p` from
  inside that same locked callback (`plan-service.ts:637`: `const started = (p.steps.find(...)...)`,
  not the outer `plan` from `loadPlan`). `createAttempts` also writes its attempt record *before*
  `launch()` re-reads the manifest fresh from the journal (`plan-host-bridge.ts:942`: `const plan =
  await this.journal.get(ref, input.planId)` inside `launch()`, called after `createAttempts`
  returns at `plan-executor.ts:1118`/`1148`). So the ordering is airtight by construction, but a
  dedicated integration test that actually races the two calls (e.g. via a delayed `resolveStep`
  mock plus a real `createAttempts` firing mid-resolution) would pin this instead of leaving it as
  an inference from separately-passing unit tests. Fix (optional, low priority): add one test in
  `plan-step-model.test.ts` that starts `setStepModel` with an artificially slow `resolveStep`,
  fires a real `createAttempts`-equivalent write while it's pending, and asserts `setStepModel`
  loses cleanly.

- M2 accepted — merged-estimate assertion added with T6 — [low] — The merge-specific reconcile test doesn't assert the estimate is computed from the
  *merged* steps (started step's old price, not the new one). Evidence:
  `desktop/tests/plan-tier-change.test.ts:142-172` ("a NOT-STARTED step re-freezes... an
  ALREADY-STARTED one keeps its frozen entry") asserts `rec.manifest.steps.s1`/`.s2` but never reads
  `rec.estimate`, so nothing pins that `refreeze`'s `estimateOf(steps)` call
  (`plan-service.ts:290`, `steps` being the merged object, not `current.steps`) actually used the
  merged set in a case where the started step's frozen price differs from its freshly-resolved
  price. The only estimate-recompute assertion (`plan-tier-change.test.ts:126`, "recomputes the
  estimate") uses a single-step doc with no started step, so it can't distinguish "estimate from
  merged steps" from "estimate from current.steps" — both would look identical there. Code
  inspection (`plan-service.ts:283-292`) confirms the merge happens before `estimateOf` is called,
  so this is very likely correct, just not pinned. Fix (optional): extend the existing
  two-step/one-started test to also assert `rec.estimate` differs from what a naive
  `estimateOf(current.steps)` (ignoring the merge) would have produced — e.g. give the started
  step's frozen entry a very different price than its fresh one and check the estimate reflects
  the frozen (cheap) price, not the fresh (`new-model`) one.

- M3 rejected — the sentence is the provider's own plus a true outcome ("The plan wasn't created."); nothing invented — [low] — `resolveManifest`'s per-step error wrapping (`plan-host-bridge.ts:797-804`: `catch (e) {
  throw new PlanProposalError(\`${(e as Error).message} The plan wasn't created.\`); }`) always
  appends "The plan wasn't created." even when `e` is already a complete, human-facing sentence from
  `DelegatedModelRefused` (e.g. "Refused: \"x\" is available from multiple providers..."). This
  produces a grammatically fine but slightly redundant two-sentence refusal ("Refused: ... Use
  \"budget\"/\"frontier\"... The plan wasn't created."), not a wrong or invented cause — consistent
  with decision 25/26's "provider's own sentence, plus our own ending" pattern used elsewhere in
  this file (e.g. `providerNotReady`'s callers). Not a functional bug; flagging only because the
  design's "never invent a cause" language could be read as "never add anything to it" — worth a
  one-line confirmation from Destin that the appended ending is intentional here, matching the
  existing not-ready-specialist refusal shape.

## Verdict

This commit is solid. The three highest-risk items in the task brief all check out under direct
evidence: (1) `setStepModel`'s started-step lock is genuinely race-free with `createAttempts`
because both go through the same per-file `mutateFileUnderLock` chokepoint and both re-check fresh
disk state inside that lock (confirmed by code path, not just by passing tests — M1 flags only that
no test directly exercises the interleaving); (2) `reconcile`'s `refreeze` correctly merges
frozen-for-started / fresh-for-not-started per step and recomputes the estimate from the merged set
(pinned by `plan-tier-change.test.ts`'s dedicated merge test, modulo M2's estimate-assertion gap);
credential readiness is checked per leaf-step binding for every source including user overrides
(`readyFor`/`resolveStep` both call `port.credentialReadiness` unconditionally), and
`resolveDelegatedBinding`'s new `providerId` parameter is opt-in (`providerId === undefined` keeps
prior behavior identical), so ordinary non-plan delegation is unaffected — confirmed by the
disambiguation tests in `plan-host-bridge.test.ts` and `plan-step-model.test.ts`. No probe, session,
network, or blocking work was found anywhere in the propose/approve/continue paths;
`credentialReadiness`/`catalog` are documented and structurally the same cached/local lookups used
by pre-existing (non-plan) specialist delegation. The H1 estimate-storage test genuinely exercises
the real `PlanHostBridge`/`PlanService` wiring rather than pure-function math, and the H3/H4 fold-ins
(`session-error` removal, 3+-item list joining) are both correctly implemented and verified against
their stated evidence (`session-store.ts`'s `append()` short-circuit). All 92 relevant tests pass.
Findings above are all low-severity test-coverage gaps or a cosmetic wording question, not
correctness bugs; nothing here blocks the commit.
