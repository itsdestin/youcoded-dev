---
paths:
  - "**/desktop/src/renderer/components/SessionStrip.tsx"
  - "**/desktop/src/renderer/components/header/drag-order.ts"
  - "**/desktop/src/renderer/components/header/pack-sessions.ts"
  - "**/desktop/src/renderer/components/header/pill-metrics.ts"
  - "**/desktop/src/renderer/components/header/pill-label-style.ts"
last_verified: 2026-09-03
verify:
  - path: youcoded/desktop/src/renderer/components/SessionStrip.tsx
    contains: "const [dragActive, setDragActive] = useState[(]false[)]"
  - path: youcoded/desktop/src/renderer/components/SessionStrip.tsx
    contains: "if [(]dotIdsRef.current.has[(]id[)][)] continue;"
  - path: youcoded/desktop/src/renderer/components/header/drag-order.ts
    contains: "margin: -14"
  - path: youcoded/desktop/src/renderer/components/header/pack-sessions.ts
    contains: "overflowChipWidth"
  - path: scripts/ui-review/drag-fuzz.mjs
  - test: youcoded/desktop/tests/animation-frame-budget.test.ts
  - test: youcoded/desktop/tests/drag-order.test.ts
  - test: youcoded/desktop/tests/pack-sessions.test.ts
  - test: youcoded/desktop/tests/pill-metrics.test.ts
  - test: youcoded/desktop/tests/pill-label-style.test.ts
---
# Session strip motion — the switcher's press, drag and drop

Eleven review rounds (2026-08-31 → 09-03), signed off on round 11. Every rule below has a
dated WHY comment at its edit site; the pins are `animation-frame-budget.test.ts` (source
pins on `SessionStrip.tsx`) and the header unit tests.

## The drag visuals are state until the drop lands
**Invariant:** the twin, the hidden in-flow box and the neighbours' step-aside render off
`dragActive` STATE, cleared only in `releaseVisuals` (the reorder's own render). Never read
`isDragging.current` in render.
**Why:** pointerup flips the ref before `dropResolve` returns; a hand lifting mid-motion
(touchpad, finger) rendered in that gap, snapped the pill home, then jumped it (R10).
**Guard:** `animation-frame-budget.test.ts` → "holds the drag visuals as STATE".

## A crossed dot has two images; the swap is at its centre; dots never FLIP
**Invariant:** the flow draws a covered dot at its box and at its mirror one pill-width
across, sizes summing to one; the yield (`DRAG_TUNE.margin = −14`) only swaps which is the
box; the flow runs as a layout effect on every commit that changes `overId`/`settle`; dots
are skipped in the settle's FLIP; only dot-sized pills flow or are veiled.
**Why:** a one-frame race doubled the dot (R9); a FLIP'd dot popped whole under the settling
pill (R10); a closing ex-active pill flowed as a dot drew a ghost of its name.
**Guard:** same test → "never draws a dot touching", "never glides a dot at the drop".

## The packer packs the room it has; a reserved width is a rendered width
**Invariant:** `stripBudget()` subtracts the strip's padding; `packSessions` reserves the
"+N" chip once anything overflows and reports `pillBudget`; `expandedWidth` is exactly
text + tail + chrome; a hover peek opens only into free room, after `PEEK_DWELL_MS`, never
for touch, and never after a drop until the cursor leaves the strip.
**Why:** a squeezed active name made every dot yield 25px too far (R6); a peek widened a
centred row under a drifting hand inside the settle (R8).
**Guard:** `pack-sessions.test.ts`, `pill-metrics.test.ts`, `pill-label-style.test.ts`.

## Verify motion with the sweep, not one drag
**Invariant:** before calling a release change done, run `scripts/ui-review/drag-fuzz.mjs`
(mouse AND touch, `DPR=1.5`, `UNLIMITED=1`, three seeds) and require every release clean
on all five checks. `drag-probe.mjs` is the microscope for one scenario.
**Why:** ten single-drag rounds each fixed a real fault and each missed the next; the sweep
found the one that mattered in its first 60 drags.
**Guard:** none — the sweep is the check (`scripts/ui-review/README.md` → "Drag probe and
drag sweep").

Depth: `docs/archive/specs/2026-08-31-session-strip-and-switch-motion-design.md` (§7.4),
`docs/archive/handoffs/2026-08-31-session-strip-motion-handoff.md` (every round's answer).
