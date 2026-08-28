---
paths:
  - "youcoded/desktop/src/renderer/components/StatusBar.tsx"
  - "youcoded/desktop/src/renderer/components/UsageCard.tsx"
  - "youcoded/desktop/src/renderer/state/status-widgets.ts"
  - "youcoded/desktop/src/renderer/state/session-totals.ts"
  - "youcoded/desktop/src/renderer/state/usage-snapshot.ts"
  - "youcoded/desktop/src/main/harness/pricing.ts"
last_verified: 2026-08-27
verify:
  - path: youcoded/desktop/src/renderer/state/status-widgets.ts
    contains: "anyUnpriced"
  - path: youcoded/desktop/src/renderer/state/session-totals.ts
    contains: "anyFree"
  - path: youcoded/desktop/src/main/harness/pricing.ts
    contains: "isFreePricing"
  - path: youcoded/desktop/src/main/harness/pricing.ts
    contains: "COST_COMPARE_FLOOR_USD"
  - test: youcoded/desktop/tests/status-widgets.test.ts
  - test: youcoded/desktop/tests/session-totals.test.ts
  - test: youcoded/desktop/tests/statusbar-session-relevance.test.tsx
  - test: youcoded/desktop/tests/statusbar-widget-menu.test.tsx
  - test: youcoded/desktop/tests/usage-snapshot.test.ts
  - test: youcoded/desktop/tests/provider-cost-check.test.ts
  - test: youcoded/desktop/tests/statusline-context-remaining.test.ts
---
# Status-bar numbers say what they count (shipped 2026-08-27, PR #340)

## A chip with no value renders nothing — never `--`, never a fabricated `0`
**Invariant:** a native zero collapses to `null` upstream (nothing measured yet → hide); a
Claude Code statusline zero RENDERS (a cold cache genuinely reads 0). The asymmetry is
deliberate and has WHY comments at all three gates.
**Why:** `--` and `$0.00` are claims. Shipped twice as a defect during this work — once
fabricating zeros, once hiding real ones.
**Guard:** `statusbar-session-relevance.test.tsx`.

## The menu gate is the CHIP'S OWN render condition
**Invariant:** `widgetUnavailableReason` asks "does the chip draw anything?", not "is there
priced work?". One-way invariant: **chip drawn ⟹ row is a live switch.** The reverse is
allowed and benign (`git-branch` is the precedent).
**Why:** written separately, the two conditions drifted and the bar showed a chip the user
could not turn off.
**Guard:** the agreement table in `statusbar-widget-menu.test.tsx` pins BOTH surfaces per
session shape, so changing either alone goes red.

## Totals include specialists; free ≠ unpriced ≠ absent
**Invariant:** `addUsage` is the ONE assignment site for `anyUnpriced`, and it requires
`u.free !== true` — `costUsd === null` has two causes and only the metered one is unpriced.
`anyFree` is a latch, which is what lets the no-op short-circuit keep object identity (a
`useSyncExternalStore` snapshot must not churn).
**Why:** conflating them made every local session draw `Cost: not listed` with a tooltip
saying the provider bills you.
**Guard:** `session-totals.test.ts`; the end-to-end render in
`statusbar-session-relevance.test.tsx` is what catches it — unit tests on each side passed
while the pair was broken.

## A reason string must be TRUE, or absent
**Invariant:** no reason for `git-branch` (missing feed, not inapplicable); none for a
session that has simply measured nothing yet.
**Why:** "No published price for this model" was shown to brand-new sessions on ordinary
metered models, where it is false.
**Guard:** `status-widgets.test.ts` asserts every string byte-for-byte with `toBe`.

## Context is REMAINING, everywhere
**Invariant:** `statusline.sh` writes `remaining_percentage`; `contextPct` computes
`(len - used)/len`. Bar and card both say "remaining", and the two colour scales are
deliberately OPPOSITE — `utilizationColor` (high is bad) vs `contextRemainingColor`
(high is good). Do not unify them.
**Why:** the card said "Context used" over a remaining figure, so 90% free drew as a red,
nearly-full bar.
**Guard:** `statusline-context-remaining.test.ts` runs the real script; boundary cases in
`usage-card-native.test.tsx`.

## Cost is checked against the provider, never asserted at the user
**Invariant:** `costForUsage` is priced in main at the model that ran the turn. OpenRouter's
own per-request cost is compared to ours per turn AND per session (the session sum is the
only thing that ever clears the floor on a cheap model) — as a DEV DIAGNOSTIC. A missing
provider figure is an absent key, never `0`; `costDisagreement` returns `null`, never a
number, when there is nothing to compare.
**Why:** a disagreement is our bug, not a message for the user. And silence must never read
as "we checked and it matched".
**Guard:** `provider-cost-check.test.ts`, `harness-pricing.test.ts`.

**Known gaps, tracked in `ROADMAP.md`, not defects of this code:** the chip runs ~25% low
once a session compacts (the summarize call's tokens are counted by neither side, so the
comparison stays honest but a clean bill ≠ matching the invoice); a mid-turn model swap
re-prices the whole turn; the session sum can average a bad model away across a swap.

Depth: `docs/archive/specs/2026-08-25-status-bar-session-relevance-design.md`.
