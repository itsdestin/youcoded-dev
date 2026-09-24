---
date: 2026-09-24
status: draft
type: design
topic: specialists plans — spending rework, stage 1 (backend)
branch: feat/specialists-plans-ui
---

# Specialists plans — spending rework, stage 1: backend design

Binding: decisions 33–37 in `2026-09-05-specialists-plans/decision-log.md`. Approved UI:
`specialists-plans.spending.review.answers.json` (+ the popup/new-limit rework round). Paths are
relative to `youcoded/desktop/src`, line numbers as of `db8761b84`.

## 0. Summary

Per-request **reservation** is replaced by **recording what was spent**. A plan specialist becomes
an ordinary specialist session with two small hooks — `beforeRequest()` (an in-memory stop flag)
and `afterReply()` (records one reply's reported usage). `afterReply` prices with the SAME
`costForUsage` and price card the conversation's cost chip uses (`native-session-host.ts:5354`)
and writes it to the journal in one fenced write that also compares against the plan's optional
`spendLimit`. The model no longer predicts cost; the proposed card's estimate comes from a
cached, incrementally-updated index of the user's past specialist runs. Per-step models live on
the plan record and resolve into a per-step manifest. The `resolveManifest` setup probe is gone.

## 1. Deleted vs kept

**Deleted entirely**
- `main/harness/plans/budget-adapter.ts` (420 lines) — adapters, input bounds, prefix chains, cache windows, `setupBound`, `countedTokens`, disabled-adapter registry, `PlanChildRequestGate`.
- `main/harness/plans/plan-budget.ts` (820 lines) → replaced by a ~200-line `plan-spend.ts` (`pricingSnapshot`, `usdText` carry over).
- `harness-session.ts`: plan-child mode — `opts.planChild` (325–331), `imagesAllowed`'s plan clause (1019), `compactNow` refusal (2364), `maybeCompact` skip (3022), the turn-loop plan branch (3038–3055) and `planLimitReached` branch (3189–3204), the empty-step re-run exclusion (3339), `planWireMessages`/`planSetupRequest`/`planNextRequestBound`/`runPlanStep` (3780–3960), `runStreamOnce`'s `plan` param, `PlanBudgetStopError`, imports (190).
- `plan-host-bridge.ts`: `PLAN_MINIMUM_ADD_MARGIN_TOKENS` (54), the `probeSession` port (149) and `measurementGate` (217), the probe loop in `resolveManifest` (690–710), `launchRefusal` (743), `localPoolTokens` (767), `reportOnlyInputBound` (837), `minimumAddTokens` (882+), `addBudget` (504) and the `budget` hook (279).
- `native-session-host.ts`: `planProbeSession` (5393+), `probeSession` wiring (5217), `addPlanBudget`.
- `plan-service.ts`: `addBudget` (733–788), `PlanBudgetHooks`, `ceilingDidNotRise`, `limitChangeNotice`, the `planLimits` half of `refreeze`, `pendingAsk` map, `PLAN_LIMIT_ASK_MS`, `PENDING_ASKS_KEPT`, the `disabledAdapters` refusal in `resume` (606–611), `recommend`'s `add_budget` checks (861–868).
- `plan-handoff.ts`: `addBudgetFloor`, `addBudgetCap`, `PLAN_ADD_BUDGET_MAX_MULTIPLE`, `topUpLine`.
- `pause-routing.ts`: `BUDGET` action set, budget/ceiling kinds, `reportOnlyFundable`, the `unknown-request` cause.
- `plan-executor.ts`: `reservePause` (932–958), `minimumAddTokens`/`warmMinimum` plumbing (1496–1558), all `chargeUnresolved`/`releaseAttempt` calls (708–716, 1222, 1341, 1485–1488), runner `localPoolTokens`/`minimumAddTokens`/`launchRefusal`/`reportOnlyInputBound`, `PlanMinimumAdd`. Local-engine concurrency is already bounded by the host's specialist slots.
- `tools/recommend-plan-action.ts`: `add_budget`, `addTokens`.

**Kept:** leases/fences/heartbeats/settle-before-visible; transcript classification
(`classifyChildTranscript`) and the rule that an unanswered EXTERNAL call is never replayed;
automatic recovery; handoffs / "Ask the assistant"; Comment/revise; definition, permission,
credential and binding/price identity checks; `usedTokens`/`usedUsd`; waves (max 4 at once,
single writer); report-only retries (tools off, no funded allowance).

## 2. Data shapes

**Grammar (`schema.ts`).** Remove `budget_tokens` (COMMON_STEP_FIELDS 56, JSON_FIELD 96, Zod 215,
constants 3–8). Add optional `model` via `OPTIONAL_COMMON_STEP_FIELDS` (69, currently empty):
`{type:'string', maxLength:128, description:'Only when the user explicitly asked for a model for
this step: "budget", "frontier", or an exact model id. Otherwise omit.'}`. `validator.ts` drops
`ceilingTokens` (246/257/268/273), keeps `maximumAttempts` (decision 33.1) and `maxFanOut`.
Decision 35.3 (`of` on `map`) is stage 2, not here.

**`PlanRecord` (`types.ts`) — `PLAN_JOURNAL_VERSION` → 2.**
- Plan: remove `ceilingTokens`, `ceilingUsd`, `tranches`, `disabledAdapters`, `approximateLimit`, `PLAN_BUDGET_*`. Add `spendLimit?: {usd}|{tokens}`, `estimate?: PlanEstimate`, `stepModels?: Record<leafStepId,{providerId,modelId}>` (user overrides only). `usedUsd` → optional (absent = no priced spend yet).
- `paused`: remove `minimumAddTokens`, `warmMinimum`, `ceilingShortfall`, `reportOnlyOf`, `budgetRequests`; add `limit?: {usd}|{tokens}` (the limit hit). Handoff recommendation drops `addTokens`.
- Attempt: drop `baseTokens`, `addedTokens`, `reservedTokens`, `requestInputBound`, `requestReservedInput`, `requestPrefix`, `lastRequest`, `softLimit`, `ambiguityReported`; keep `spentTokens`; add `spentUsd?`; `phase: 'prepared'|'launched'|'committed'`.
- `ExecutionManifest` (96–119) → `specialists[id] = { definitionFingerprint }`, `steps[leafStepId] = { binding, label, pricing: PlanPricingSnapshot|null, source: 'default'|'document'|'user' }`, `permissionFingerprint`. `setupTokens`/`approximateLimit` removed.
- Pause kinds (`shared/types.ts:854`): remove `budget`, `ceiling-shortfall`, `plan-limit`, `local-pool`, `budget-refused`, `unknown-request`; add `spend-limit`. `PlanPauseAction = 'continue'|'stop'`.

**PlanView/PlanStepView (`shared/types.ts:894`, `:770–807`).** The mockup's `estimate`,
`spendLimit`, `stepModel` become real. `ceilingTokens`/`ceilingUsd` optional now, deleted in T7.
Delete `budgetTokens`, `setupTokens`, repeat `ceilingTokens`, `paused.minimumAddTokens`,
`paused.warmMinimum`, `handoff.recommendation.addTokens`. `projectPlan`
(`plan-journal.ts:260–400`): `stepModel` from `manifest.steps[id]` (`isDefault: source==='default'`,
`locked` when the step has any attempt); `estimate`/`spendLimit` from the record; per-step
`usedTokens` = Σ attempt `spentTokens`.

**Old journals.** Decision 33.4: no backward compatibility. When `v === 1`, rename the file to
`<file>.v1-retired`, start an empty v2 journal, show no failed card (old cards fall back to the
projection stored in their tool result). *(Decided — open question 7.)*

## 3. Spend accounting and the limit

**Harness hook** (replaces `planChild` in `HarnessSessionOpts`):

```ts
planSpend?: {
  beforeRequest(): Promise<string | undefined>;   // stop reason, or undefined = go
  afterReply(r: { usage: StepUsage; costUsd: number | null }): void;
};
```

- After each step's usage joins `turnUsage` (`harness-session.ts:3111–3123`):
  `afterReply({ usage: step.usage, costUsd: this.opts.free ? null : costForUsage(step.usage, this.opts.pricing) })`
  — the chip's expression per step; summed per turn it equals the chip's per-turn figure. No
  usage reported → only what `step.usage` holds, exactly as the chip. Nothing charged at a
  worst-case rate.
- Compaction's `priceSummaryUsage` also feeds `afterReply`, and `runPlanChild`'s `onEvent`
  (5317) adds `compact-summary` usage to the chip too, so both stay equal.
- `await planSpend.beforeRequest()` at the top of each step, before `streamText`. A stop reason
  ends the turn cleanly with `stopReason = 'plan_limit_reached'` (renamed from
  `PLAN_BUDGET_EXHAUSTED_STOP_REASON`). The crossing reply's tools still run; only the NEXT request
  is refused (decision 34).
- Plan children now use the ordinary request path: `withRetry`, stall re-run, empty-step re-run,
  compaction, images, reasoning.

**Implementation (`plan-spend.ts`, built per attempt in `plan-host-bridge.ts` `launch()`).**
`afterReply` chains onto a `pending` promise running ONE `journal.mutateFenced` that adds
`billedEquivalentTokens(usage)` (uncached input + cache writes + output + ⌈0.1 × cache reads⌉,
in `pricing.ts`, the same unit the estimate uses) to `attempt.spentTokens`/`plan.usedTokens`,
adds `costUsd` (when non-null) to `attempt.spentUsd`/`plan.usedUsd`, re-reads `plan.spendLimit`
and returns `crossed`. On `crossed` it sets `run.limitReached` on the executor's `ActiveRun`
(shared by siblings). `beforeRequest` awaits `pending`, then returns a stop reason if
`run.limitReached` or the write failed. The write overlaps tool execution; no `*Sync`.

**Concurrency (≤4 specialists).** Every write is under the journal file lock and re-reads
`usedUsd` and the limit — no lost update, and a mid-run limit change is honoured. The first
crossing write sets the shared flag; a sibling with a reply in flight finishes it (the accepted
one-reply overshoot per running specialist) and stops at its own `beforeRequest`.

**Executor.** `reserveAttempts` → `createAttempts` (runWave 907; retries 1261, 1321): one fenced
append of attempt records. `runWave` first checks `used ≥ limit` on the plan it loaded, so no new
wave starts past the limit. A child's `crossed` → `requestHalt({kind:'pause', why:'spend-limit',
drain:true, limit})`. With `drain`, `requestHalt` (580) doesn't abort; `settle` (1428) waits up to
`PLAN_DRAIN_DEADLINE_MS` (60 s) for children to stop at `beforeRequest`, then aborts as before
(covers a child waiting on a permission ask, which never times out).

**Crash safety.** The journal is written once per reply; a crash loses at most in-flight replies,
which the chip wouldn't have counted either. `recoverAttempt` (704) charges nothing: a `launched`
attempt goes through transcript classification — finished report → commit; unanswered call →
`toolEffect` routing; else restart. (An interrupted model request has no effect outside the
computer, so the `request-sent`/`ambiguous` phases and the `unknown-request` cause can go.)
`commitAttempt` (`plan-journal.ts:697`) stops adjusting `usedTokens`.

## 4. The estimate

**History index — `main/harness/plans/specialist-usage-history.ts`.** Cache
`~/.youcoded/specialist-usage.json` via `NativeHome` async JSON; entry `{childId, agentType,
providerId, modelId, usage:{uncached, cacheRead, cacheWrite, output}, size, mtimeMs}`. Loaded async
at host start. Background scan deferred with `setTimeout` until the first window is up:
`fs.promises.readdir` over `sessions/*/`; per `.jsonl`, read only the first line (4 KB `fh.read`)
and skip unless `sessionKind === 'specialist'`; skip unchanged size+mtime; else stream with
`readline` over `createReadStream`, summing `usage` from `turn-complete`, `user-interrupt`,
`session-error`, `compact-summary` (as `2026-09-19-specialist-usage.py`); one file at a time with
`setImmediate` between; debounced cache write. When a run ends (`reportSpecialistSpend` 1370, and
`runPlanChild`'s `finally`) `record(childId, …)` pushes the entry in memory. `snapshot()` is
synchronous over memory only — an estimate never waits on the scan.

**Computation — `plans/plan-estimate.ts`, pure `estimatePlan(document, manifest.steps, history)`.**
Per leaf step choose past runs: same `agentType` + same `provider:model` if ≥5; else all runs of
that `agentType` (token counts are roughly model-independent; the model sets the price); else a
built-in per-type default from the 2026-09-19 evidence (overall median ≈222k; worker median ≈517k,
p90 ≈2.3M; other types regenerated with the script and pinned with a dated comment). A custom
specialist with no history uses the worker default if it can write, else the reviewer default.
Price each past run's usage split at the step's frozen rates via `costForUsage` → per-run
distribution → median and p90. Runs per step: split = items; verify/combine = 1; a repeat body
counts 1 round for low and `max_iterations` for high *(decided — open question 6)*.
`lowUsd = Σ median`, `highUsd = Σ p90`. Unpriced steps (`free`/`local`/`null` snapshot) give
tokens + note: "included in your ChatGPT plan" (ChatGPT provider), "runs on your computer" (local
engine), "no published price". Mixed plans: dollar range over the priced steps; the dollar limit
counts priced spend only *(decided — open questions 2 and 4)*. Computed at `propose` (after the
manifest resolves), on `setStepModel`, and on re-freeze; stored on the record so projection stays
pure.

## 5. Per-step model override

`resolveManifest` (`plan-host-bridge.ts:668`), per leaf step: (1) `stepModels[id]` (user), else
(2) `document.model` via `resolveRequestedModel(step.model, def.modelPreference)` (assistant, only
on explicit user direction), else (3) the specialist's default through `bindingFor` (647).
`credentialReadiness`, then freeze `{binding, label, pricing}` into `manifest.steps[id]`.
`resolveDelegatedBinding` gains optional `providerId` so a model offered by two providers resolves
unambiguously. `launch()` reads `manifest.steps[input.stepId].binding`.

**"Started"** = the step record has ≥1 attempt; the lock check runs inside the same locked write
as `createAttempts`, so Plan settings changes are race-free while running. A pending step may
change while the plan runs (`launch()` reads the manifest from the journal).

`PlanService.setStepModel(sessionId, planId, stepId, model|null)` — allowed on `proposed`,
`running`, `paused`, `interrupted`; refused for an unknown leaf, a started step, or a model the
resolver refuses / whose provider isn't ready (the provider's own sentence). On success:
re-resolve that step's manifest entry, recompute `estimate`, return the view.

**Approve/Continue drift (`reconcile`, 397)** stays cheap — no probe, no session. Definition or
permission change → refuse as today. Tier/price change → silently re-freeze not-started steps and
recompute the estimate. The `confirm` notice is no longer produced (`PlanNotice` kept for stage 2).

## 6. IPC

| Change | Shape |
|---|---|
| new `plans:set-limit` | `{sessionId, planId, limit:{usd}\|{tokens}\|null}` → `PlanActionResult` |
| new `plans:set-step-model` | `{sessionId, planId, stepId, model:{providerId,modelId}\|null}` → `PlanActionResult` |
| removed `plans:add-budget` | — |
| changed `plans:get/set-auto-approve` | same names; payload `{underUsd}`; read `{ok:true, underUsd}` |

Touch points: `plan-requests.ts` (`PLAN_REQUEST_CHANNELS` 21, `PlanRequestHost` 39) + host
`setPlanLimit`/`setPlanStepModel`; `shared/types.ts` IPC constants (2494); `preload.ts` (473 +
`plans` namespace); `ipc-handlers.ts` (3714); `remote-shim.ts` (478 `'user-action'`, 784, 3154);
`remote-server.ts` case list (2320); Android `PlansBridge.kt:27` (same typed `unsupported` as the
other plan channels) and `SessionService.kt` routing; delete the two `mock-only.ts` rows (140–141;
`mock-shim-window.test.ts` enforces); `useIpc.ts` types already exist (454–464);
`plan-bridge.ts` `normalizePlanRead` → `underUsd`.

## 7. Pause/Continue at the limit; handoffs

`routePlanPause('spend-limit')` → `{route:'user', actions:['continue','stop']}` (decision 37 R-4);
`paused.limit` carries the amount for "Reached your $5 limit." `setLimit`: any unfinished plan;
refuses a value ≤ already spent in its unit ("Set a limit above the $3.10 already spent"); `null`
removes it; unit follows the plan's pricing class (dollars if any step is priced). `resume` also
refuses when `spendLimit` is set and `used ≥ limit`, for every pause kind. The card calls
`setLimit` then `resume`; optionally `plans:resume` accepts `limit` in the lease-taking write.
Handoffs: `setLimit` doesn't supersede a pending handoff (`resume`/`stop` still do). "Ask the
assistant" stays technically allowed on a spend-limit pause, hidden by the card (R-4);
recommendations are only `continue`/`stop`. Raising the limit after the halt was requested doesn't
cancel the drain — the plan pauses and the user presses Continue.

## 8. Auto-start setting

`PLAN_SETTINGS_FILE`: `autoApprove.underTokens` → `autoStart.underUsd` (finite, 0–1000, cents;
0 = off; an old `underTokens` reads as off — the safe direction). `readUnderTokens`
(`plan-service.ts:327`) → `readUnderUsd`; `setAutoApprove` (962) validates dollars. Rule in
`propose` (560): auto-start only when the estimate is in dollars and `estimate.highUsd < underUsd`
(p90 — conservative). Unpriced plans never auto-start *(pending Destin — open question 3)*. The
per-turn key cap and "never from a pause's notice turn" stay. Remove the
`SpecialistsSection.tsx:405–414` caveat.

## 9. `propose_plan` / `recommend_plan_action`

`tools/propose-plan.ts:67–79`: drop "a hard per-child token budget" → "Propose a specialist plan
for the user to approve. The proposal does not start work." Add: "Each step runs on its
specialist's default model. Set `model` on a step only when the user explicitly asked for a
particular model there." Stop passing `ceilingTokens` (131); `PlanProposal` (98) drops it.
`recommend_plan_action` → `enum:['continue','stop']`, no `addTokens`.

## 10. Tests

- **Removed:** `plan-budget.test.ts` (892), `plan-budget-adapter.test.ts` (260),
  `harness-session-plan-child.test.ts` (568 → a smaller replacement), most of
  `plan-tier-change.test.ts` (491) and `plan-card-tier-change.test.tsx`.
- **Shrink:** `plan-executor.test.ts` (reservation/ceiling/shortfall/minimum-add/request-phase
  cases), `plan-service.test.ts`, `plan-host-bridge.test.ts`, `plan-handoff.test.ts`,
  `plan-journal.test.ts`, `plan-schema.test.ts`, `plan-tool.test.ts`,
  `plan-pause-routing.test.ts`, `plans-lifecycle.integration.test.ts`, `plans-transport.test.ts`,
  `remote-shim-plans.test.ts`, `plan-chatgpt-signed-out.test.ts`, parts of
  `native-session-host.test.ts`, `fixtures/plan-card-signed-states.json`.
- **New:** `plan-spend.test.ts` (per-reply cost == `costForUsage` with the child's price card;
  missing usage adds nothing; crossing; mid-run limit change; 4 concurrent writers sum exactly;
  `setLimit` refusal); `harness-session-plan-spend.test.ts` (`afterReply` once per step;
  `beforeRequest` refusal ends with `plan_limit_reached` after the crossing reply's tools ran;
  images and compaction work); executor (drain: siblings finish their in-flight reply, plan pauses
  once; drain deadline aborts a stuck child; wave-start check; crash recovery charges nothing);
  `plan-estimate.test.ts` (fallback chain, repeat/split counts, quantiles, unpriced notes, mixed
  plans); `specialist-usage-history.test.ts` (incremental skip, malformed lines, non-specialist
  files, `record()` push; extend `main-blocking-calls.test.ts`); `plan-step-model.test.ts`
  (override, lock after start, change while running, `providerId` disambiguation); an integration
  check that the conversation's summed subagent `costUsd` equals `plan.usedUsd`;
  `ipc-channels.test.ts` and `mock-shim-window.test.ts` updates.

## 11. Tasks

1. **T1 — Shapes (first).** Schema/validator; `types.ts` v2 + v1 retirement; `shared/types.ts` (PlanView, pause kinds, actions, auto-approve read); `projectPlan`; both tools' text/schemas. Tests: schema, journal, tool.
2. **T2 — Spend core (after T1).** `plan-spend.ts`; the harness hook; remove plan-child mode; `launch()` wiring; chip parity in `runPlanChild`; delete `plan-budget.ts` and `budget-adapter.ts`.
3. **T3 — Executor (after T2).** `createAttempts` call sites; drain halt; wave-start check; recovery without request phases; runner interface cleanup.
4. **T4 — Manifest + step models (after T1, parallel with T2).** Remove the probe; `manifest.steps`; `setStepModel`; resolver `providerId`; simplified `reconcile`.
5. **T5 — History + estimate (after T1, parallel).** Usage index; `estimatePlan`; defaults table; wiring into propose / setStepModel / re-freeze.
6. **T6 — Service surface (after T3–T5).** `setLimit`; `resume` limit check; pause routing and handoff cleanup; auto-start in dollars; delete `addBudget`.
7. **T7 — IPC + renderer follow-through (after T6).** Five surfaces + Android; `mock-only.ts`; transport tests; renderer stops reading ceilings/Add budget; lifecycle integration test.

## 12. Risks and open questions

**Risks.** (1) Removing request phases changes crash recovery: protection against replaying an
external action rests entirely on transcript classification — needs explicit tests. (2)
`withRetry` may resend a failed request the provider billed without reporting usage; uncounted,
as for the chip — the plan total can sit below the provider's bill. (3) Compaction parity must
land in the same change, or the two totals diverge. (4) The first history scan is background;
early estimates may use defaults. (5) Small samples: with <10 runs "p90" ≈ max; noisy early. (6)
Drain waits on already-running tools (e.g. a long Bash) — the pause can take up to 60 s to show.

**Open questions — resolved here (technical):** 2 mixed priced/unpriced → dollar range over
priced steps + note, limit counts priced spend only; 4 a model change that leaves a dollar-limited
plan with no priced step → the limit stays in dollars and counts priced spend only; 5 report-only
turns keep a modest reply cap (2,000 tokens); 6 repeat high end assumes every round; 7 v1
journals retired silently.

**Open questions — for Destin (product):** 1 change a step's model during a run — design allows
it only for steps that haven't started; 3 auto-start for plans with no dollar price — proposed:
never.
