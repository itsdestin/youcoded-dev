---
paths:
  - "**/desktop/src/renderer/components/StatusBar.tsx"
  - "**/desktop/src/renderer/components/UsageCard.tsx"
  - "**/desktop/src/renderer/state/status-widgets.ts"
  - "**/desktop/src/renderer/state/session-totals.ts"
  - "**/desktop/src/renderer/state/usage-snapshot.ts"
  - "**/desktop/src/main/harness/pricing.ts"
last_verified: 2026-09-16
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
  - test: youcoded/desktop/tests/context-gauge-after-rewrite.test.ts
  - test: youcoded/desktop/tests/abandoned-turn-usage.test.ts
  - test: youcoded/desktop/tests/native-context-occupancy.test.ts
---
# Status-bar numbers say what they count (shipped 2026-08-27, PR #340)

## A chip with no value renders nothing — never `--`, never a fabricated `0`
**Invariant:** a native zero collapses to `null` upstream (nothing measured yet → hide); a
Claude Code statusline zero RENDERS (a cold cache genuinely reads 0). · why: `--` and
`$0.00` are claims; shipped twice as a defect · guard:
`statusbar-session-relevance.test.tsx`.

## The menu gate is the CHIP'S OWN render condition
**Invariant:** `widgetUnavailableReason` asks "does the chip draw anything?", not "is there
priced work?". One-way: **chip drawn ⟹ row is a live switch** (`git-branch` is the benign
reverse). · why: written separately, the two drifted and the bar showed a chip nobody could
turn off · guard: the agreement table in `statusbar-widget-menu.test.tsx`.

## Totals include specialists; free ≠ unpriced ≠ absent
**Invariant:** `addUsage` is the ONE assignment site for `anyUnpriced` and requires
`u.free !== true` — `costUsd === null` has two causes, only the metered one unpriced.
`anyFree` is a latch, which lets the no-op short-circuit keep object identity (a
`useSyncExternalStore` snapshot must not churn). · why: conflated, every local session drew
`Cost: not listed` over a tooltip saying the provider bills you · guard:
`session-totals.test.ts` plus the end-to-end render in
`statusbar-session-relevance.test.tsx` — each side's unit tests passed while the pair was
broken.

## A reason string must be TRUE, or absent
**Invariant:** no reason for `git-branch` (missing feed, not inapplicable); none for a
session that has simply measured nothing yet. · why: "No published price for this model" was
shown to new sessions on ordinary metered models · guard: `status-widgets.test.ts` asserts
every string byte-for-byte.

## Context is REMAINING, everywhere
**Invariant:** `statusline.sh` writes `remaining_percentage`; `contextPct` is
`(len - used)/len`. The two colour scales are deliberately OPPOSITE — `utilizationColor`
(high is bad) vs `contextRemainingColor` (high is good). Do not unify them. · why: the card
said "Context used" over a remaining figure, so 90% free drew red · guard:
`statusline-context-remaining.test.ts` (the real script), `usage-card-native.test.tsx`.

## A rewrite outside a turn re-bases the gauge; a completed turn wins
**Invariant:** `/compact` and `/clear` run no turn, so the harness re-bases occupancy
(`reprojectContextUsed`: subtract the ESTIMATED size of what was removed from the last
MEASURED reading — never re-estimate the window) and ships `contextUsedAfter`;
`selectNativeStatusChips` prefers it, `TRANSCRIPT_TURN_COMPLETE` clears it. · why: the gauge
reads the last COMPLETED turn · guard: `native-context-occupancy.test.ts`,
`context-gauge-after-rewrite.test.ts`.

## turn-complete is NOT the only thing that spends tokens
**Invariant:** the summarize call, an abandoned turn (whole steps only), a specialist's own
compactions, and `subagent-usage` on page replay all reach `addTurnUsage` — each deduped on
its event uuid (all of them re-deliver). · why: four silent
undercounts · guard: `abandoned-turn-usage.test.ts`, `context-gauge-after-rewrite.test.ts`,
`subagent-usage-event.test.ts`.

## Cached reads AND writes leave the prompt before their own rate applies
**Invariant:** `inputTokens` is the SDK's `inputTokens.total` (noCache + cacheRead +
cacheWrite), so `costForUsage` subtracts both priced portions; an unpublished rate leaves
that portion at the input rate. · why: reads alone were subtracted, billing a written token
at the input rate AND the write premium · guard:
`harness-pricing.test.ts`.

## Cost is checked against the provider, never asserted at the user
**Invariant:** priced in main at the model that ran the turn; OpenRouter's own figure is
compared per turn AND per session (only the sum clears the floor on a cheap model) as a DEV
DIAGNOSTIC. A missing provider figure is an absent key, never `0`. · why: a disagreement is
our bug, and silence must never read as "we checked and it matched" · guard:
`provider-cost-check.test.ts`.

**Known gaps** are tracked in `docs/roadmap/native-harness.md`, not here.

Depth: `docs/archive/specs/2026-08-25-status-bar-session-relevance-design.md`.
