---
date: 2026-09-01
status: active
type: investigation
topic: `FieldError` has one caller while ~30 sites hand-roll its markup — and the sizes disagree
---

# Adopt the `FieldError` primitive

`FieldError` shipped in UI-consistency tranche 0. On 2026-09-01 it has **one** caller
(`SpecialistsSection.tsx`, added 2026-08-16) while **30 sites** still write its markup by hand
as `<p className="text-{2,3}xs text-destructive-fg">{error}</p>` (found by
`rg 'text-[23]xs text-destructive-fg'` over `desktop/src/renderer`; 25 sites on 2026-07-26).

## Why it is not a blind swap

The primitive hardcodes `text-3xs`; a share of the hand-rolled sites use `text-2xs`.
<!-- claim: {"path": "youcoded/desktop/src/renderer/components/ui/states.tsx", "contains": "text-3xs text-destructive-fg"} -->

So either the larger ones shrink (a visible change Destin has not seen) or the primitive
gains a size prop. Pick one deliberately, then migrate.

## Guard state

`desktop/tests/primitive-adoption.test.ts` removed `FieldError` from `INTENTIONALLY_UNADOPTED`
on 2026-08-16 (the exemption was an oversight, not a decision) — the test no longer tracks
this migration; the roadmap does.

## History
Filed 2026-07-26 (found by widening the tranche-8 adoption guard, youcoded #255).
Re-counted 2026-09-01.
