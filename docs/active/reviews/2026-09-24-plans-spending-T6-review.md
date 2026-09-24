---
date: 2026-09-24
status: active
type: review
topic: specialists plans — spending backend, T6 "Service surface"
commit: 325da0edcc56c7cedb091e1c660206981f505277
---

# T6 review — service surface (design §7/§8)

Scope: `desktop/src/main/harness/plans/plan-service.ts` (setLimit, resume's limit param,
`applyLimitChange`, `pricingUnit`, `limitReachedSentence`) and the four shrunk test files.
`npx vitest run tests/plan-service.test.ts tests/plan-handoff.test.ts
tests/plan-pause-routing.test.ts tests/plan-pause.test.ts` — 155/155 pass.

- V1 accepted — fixed in 2433d08a3 with a test — [medium] — a fractional token limit can pass `applyLimitChange`'s "above what's already
  spent" check, then round down to land ON (or even below) that same spent figure, so `setLimit`
  reports success while the plan is immediately at its own limit — `plan-service.ts:215-224`. The
  check compares the raw `limit` argument (`limit <= already`), but the value actually stored for
  a token-unit plan is `Math.round(limit)` (`plan-service.ts:224`). Example: `already = 1000`,
  caller passes `limit = 1000.4` → `1000.4 <= 1000` is false, so it passes → stored
  `spendLimit.tokens = Math.round(1000.4) = 1000`, exactly equal to `already`. The very next
  `PlanSpend` write (or even the current state, if `crossedLimit`'s `>=` check runs before any
  further spend) reads `usedTokens (1000) >= limit.tokens (1000)` as already crossed — the
  "it would not be a limit, it would be an immediate pause" case the function's own comment says
  this refusal exists to prevent. Only reachable for unpriced (token-unit) plans; USD limits are
  stored unrounded (`plan.spendLimit = { usd: limit }`, no `Math.round`) so they don't have this
  gap. Not covered by any test — `plan-service.test.ts`'s token-limit test only tries the integers
  1000/1001. **Fix:** round `limit` once, up front (`const applied = unit === 'usd' ? limit :
  Math.round(limit)`), and compare `applied <= already` before storing `applied` — so the check
  and the stored value are the same number.

- V2 accepted as low — the card and service sentences are checked together at acceptance; no change — [low] — `resume`'s refusal sentence ("This plan already reached its $5.00 limit. Raise it to
  continue.", `plan-service.ts:230-233`) and the card's own pause-row sentence ("Reached your
  $5.00 limit.", `PlanCard.tsx:212-219`) are two independently-written strings for what is, from
  the user's chair, the same fact. They agree in substance (both are specific/accurate per
  `docs/error-message-standards.md`) but not in wording, and nothing pins them to match. Low
  risk — the refusal only fires on the (already-caught-by-the-card) edge case of pressing Continue
  with no new limit, or a stale card racing a sibling's spend past the limit — but worth a shared
  formatter if a future edit touches one and not the other. No fix required now.

- V3 accepted as low — defensive fallback kept; no change — [low] — `pricingUnit`/`estimateFor` (`plan-service.ts:201-203`, `:456-461`) fall back to
  `'tokens'` when `plan.estimate` is absent, and the schema keeps `estimate` `.optional()`
  (`types.ts:279`). Traced every write path: the only place a `PlanRecord` is constructed
  (`propose`, `plan-service.ts:527-544`) sets `estimate: this.estimateFor(...)` in the SAME write
  as the rest of the record, and `estimatePlan` (`plan-estimate.ts:215-260`) has no branch that
  returns `undefined` — it always returns either `{lowUsd,highUsd}` or `{tokens,unpricedNote}`.
  With decision 33.4's "no backward compatibility" (a v1 journal is retired and a fresh, empty v2
  journal started), there is no real record a v2-era `setLimit`/`resume` can ever see with
  `estimate` absent. The fallback is a safe, correctly-chosen default (tokens, same direction as
  `readUnderUsd`'s own safe default) for a state the schema still technically allows but the code
  never produces — dead but harmless, not a wrong-unit bug. No fix required; a future cleanup
  could drop the schema's `.optional()` or add a comment noting it is defensive-only.

- V4 already handled — verified correct — [none — verified correct] — setLimit/resume atomicity (task's concern 1). `resume`'s optional
  `limit` is applied and its post-change refusal check both run inside the SAME `onStart` callback
  passed to `journal.acquireLease` (`plan-service.ts:662-671`), which itself runs inside ONE
  `PlanJournal.mutate` call (`plan-journal.ts:587-624`) — `mutate` runs `fn` against a
  `structuredClone` of the file (`plan-journal.ts:165-166`) and a throw inside `fn` (here,
  `PlanActionRefused` from `applyLimitChange` or the limit-reached check) aborts with **nothing
  written** (confirmed by `mutate`'s own doc comment and by `applyMutation`'s clone-then-discard
  structure). So there is no window where a raised limit lands but the resume/lease-take fails —
  either both happen in the one write, or neither does. `setLimit` (`plan-service.ts:734-746`)
  uses the same `journal.mutate` chokepoint directly. Concurrency with a running plan's spend
  writes: `PlanSpend.afterReply` writes through `journal.mutateFenced` → `mutate`
  (`plan-spend.ts`, `plan-journal.ts:701-703`), the identical lock/re-read-under-lock path, and
  `crossedLimit` (`plan-spend.ts:96-100`) reads `plan.spendLimit`/`usedUsd`/`usedTokens` fresh from
  that write's own loaded copy — so a `setLimit` landing mid-run is picked up by the very next
  spend write, never lost, never read stale. Test evidence: "an optional new limit lands in the
  SAME lease-taking write, lifting the refusal atomically" and "rejects a non-positive new limit
  before touching the journal" (`plan-service.test.ts`) both assert `seq` moves by exactly one (or
  not at all) and match this.

- V5 already handled — verified correct — [none — verified correct] — unit selection (concern 2). `'highUsd' in plan.estimate` is a
  correct discriminant of the `PlanEstimateSchema` union (`types.ts:252-255`): the dollar variant
  is `{lowUsd,highUsd}` strict, the token variant `{tokens,unpricedNote}` strict, so the two can
  never overlap. `estimatePlan` itself derives "dollars if any step is priced" straight from
  `manifestSteps[...].pricing` (`plan-estimate.ts:229-249`, `pricedSteps++` when `rates` is
  non-null), matching the design's "unit follows the plan's pricing class... from the MANIFEST's
  per-step pricing" (§7) — `pricingUnit` reads that classification off the stored `estimate`
  rather than re-deriving it, which is the single-source-of-truth choice T5's own comment
  (`plan-service.ts:447-454`) explains. No path picks tokens for a plan that has any priced step,
  or dollars for a fully unpriced one.

- V6 already handled — verified correct — [none — verified correct] — refusal wording and coverage (concern 3). `resume`'s spend-limit
  check (`plan-service.ts:667-671`) is unconditional on `p.spendLimit` being set and
  `used >= cap` — it does NOT gate on `paused.kind === 'spend-limit'`, so it fires for every pause
  kind, exactly as design §7 specifies ("for every pause kind"). Test
  `resume refuses at an already-reached limit, for any pause kind...` parametrizes over
  `['spend-limit', 'specialist-error', 'unexpected-error']` and passes. Both refusal sentences
  (`limitReachedSentence`, `applyLimitChange`'s "Set a limit above the $X already spent.") state
  the real, current spent/limit figures — no invented cause, satisfying
  `docs/error-message-standards.md`'s "specific and accurate" bar.

- V7 already handled — verified correct — [none — verified correct] — auto-start bounds (concern 4), spot-checked though untouched by
  this diff: `readUnderUsd` reads an old `autoApprove.underTokens` shape as `0` (off) —
  `plan-service.ts:354-362` — and `setAutoApprove` validates `0 <= underUsd <= 1000`
  (`plan-service.ts:1024-1026`). `propose`'s auto-start gate
  (`plan-service.ts:591`: `record.estimate && 'highUsd' in record.estimate &&
  record.estimate.highUsd < settings.underUsd`) requires a DOLLAR estimate — an unpriced
  (`tokens`-shaped) estimate can never satisfy `'highUsd' in record.estimate` and so never
  auto-starts, matching "unpriced plans never auto-start". Not modified by this commit; not
  regressed.

- V8 already handled — verified correct — [none — verified correct] — test deletions (concern 5). Diffed every removed test in
  `plan-handoff.test.ts`/`plan-pause-routing.test.ts`/`plan-pause.test.ts` against what the
  design's §1/§10 actually deletes (`budget`/`ceiling-shortfall`/`plan-limit`/`local-pool`/
  `budget-refused`/`unknown-request` pause kinds, `add_budget`, `budget-adapter.ts`,
  `PLAN_ADD_BUDGET_MAX_MULTIPLE`) — every removal traces to a genuinely deleted feature, none to
  still-live behavior. One test that dropped real executor coverage ("an assistant-routed pause
  settles with its default buttons and no handoff", `plan-handoff.test.ts`, old version instantiated
  a real `PlanExecutor` + fake `Runner`) was replaced by a synthetic state check plus a
  type-only (`@ts-expect-error`) check — but the equivalent real-executor coverage for a
  `spend-limit` pause's default actions exists in `plan-executor.test.ts:1835-1982` (untouched by
  this commit), so nothing was actually lost, only relocated to where T3 already tests it.

- V9 already handled — verified correct — [none — verified correct] — M1 (`plan-service.test.ts`, "setStepModel races createAttempts'
  own locked write") drives the real `PlanJournal` (not a mock): it appends an attempt via the
  exact `journal.mutateFenced` shape `createAttempts` uses, then proves `setStepModel('s1', ...)`
  refuses ("already started") while `setStepModel('s2', ...)` on the untouched sibling succeeds,
  checking both the returned view and the persisted `manifest.steps[...].source`. This is a real
  race-shaped test, not a renamed unit test.

- V10 already handled — verified correct — [none — verified correct] — M2 ("the re-frozen estimate reflects the MERGED manifest") is
  a genuine merge test: it starts step `s1` (attempt present), diverges BOTH steps' prices at
  Continue time, resumes, and asserts (a) `manifest.steps.s1` is byte-identical to the frozen
  pre-Continue entry (never repriced), (b) `manifest.steps.s2` takes the new entry, and (c) the
  stored `estimate` equals `estimatePlan` computed over the actual merged `{s1: frozen, s2: new}`
  shape and explicitly differs from the naive all-new computation — pinned against `refreeze`
  (`plan-service.ts:343-351`), which does exactly this merge before calling `estimateOf(steps)`.

**Verdict:** T6 is sound on its highest-risk claim — the setLimit/resume atomicity and its
interaction with concurrent `PlanSpend` writes really is race-free, all through one journal lock
that every writer (service actions and per-reply spend writes alike) shares and re-reads under.
Unit selection, refusal wording/coverage, auto-start gating and the shrunk test suites all check
out against the design and decisions 34/37. The one real bug (V1) is a narrow but genuine
rounding gap: a fractional token-unit limit can be accepted as "above what's spent" and then
silently round down to equal it, producing an immediately-repaused plan the user just tried to
un-pause — worth a one-line fix (round before comparing, not after) before this ships, since the
service's own type signature (`limit: number`) invites a caller to pass a non-integer and nothing
upstream currently guarantees whole tokens.
