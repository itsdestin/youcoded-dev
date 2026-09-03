---
date: 2026-09-01
status: active
type: investigation
topic: native-harness cost — the session-level cost self-check sums across models, so a per-model pricing error is diluted below its threshold
---

# The cost self-check dilutes a per-model error across a model swap

**History:** added 2026-08-27 (old ROADMAP.md L159). Re-verified against `origin/master` 2026-09-01.

## Symptom

A model whose rate card is wrong in our catalog can run for a whole session without the
cost self-check ever logging a warning — provided the session also ran a correctly-priced
model for most of its turns.

## Mechanism

The session-level self-check (Task 30, 2026-08-27) exists because the per-turn check is
silent on cheap models: a single cheap turn is always below the comparison floor. So the
session check accumulates our figure and OpenRouter's own reported figure across every
comparable turn and compares the two sums once they cross the floor.

But the sums are **not keyed by model**. `SessionCostTotals` (`youcoded/desktop/src/main/harness/pricing.ts`)
holds exactly three numbers — `ourUsd`, `theirUsd`, `turns` — and `addComparableTurn`
folds every turn into them regardless of which model ran it.
<!-- claim: {"path": "youcoded/desktop/src/main/harness/pricing.ts", "contains": "export interface SessionCostTotals"} -->

Consequence: 100 correctly-priced turns on model A plus 2 badly-priced turns on cheap
model B keeps the overall ratio under the 5% threshold (`COST_DISAGREEMENT_THRESHOLD`),
so the fault on B is never reported.

The emit site in `harness-session.ts` (`this.sessionCostTotals = addComparableTurn(...)`,
~L2139) acknowledges the related *naming* problem — the warning logs the model of the
latest turn, since the sums can span a swap — but not the dilution itself.

## Fix shape

Key `SessionCostTotals` by model id and compare per model, keeping the whole-session sum
as well (the session sum is still the thing that crosses the floor first on a single
cheap model).

## Inherent residual (worth recording either way)

A systematic error that occurs only inside *partially-reporting* turns is checked at
neither the turn nor the session level — those turns are deliberately dropped from both
sides (`providerCostUsd` is published only when every counted step reported one) to keep
the comparison honest.
