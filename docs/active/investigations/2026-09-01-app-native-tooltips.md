---
date: 2026-09-01
status: active
type: investigation
topic: App-native hover tooltips — replacing browser `title=` hints on the surfaces users watch
---

# App-native hover tooltips

**Symptom (Destin, 2026-07-28):** browser-default tooltips (the OS-drawn `title=` bubble)
look foreign to the app. First noticed on the `/clear` hint ("Cleared — still here to read,
but not in Claude's context").

## Why this is a decision, not just work

The ask **reverses a documented policy.** `AnchorTip.tsx`'s header states that native
`title=` hints are deliberately NOT that component and stay as they are.
<!-- claim: {"path": "youcoded/desktop/src/renderer/components/ui/AnchorTip.tsx", "contains": "Native .title=. hover hints are NOT this component"} -->

Re-counted 2026-09-01: **354 `title=` sites across 104 files** in
`youcoded/desktop/src/renderer` (245 on 2026-07-28, 267 on 2026-08-12 — it keeps growing,
because the policy tells every new surface to use it). No `Tooltip` component exists in
`components/ui/` today; `AnchorTip.tsx` is the only hover/info primitive.

## What the new thing has to be

- `AnchorTip` cannot be reused as-is: it renders its own (i) glyph as the trigger, so it is
  an info button, not a wrapper. The new primitive is a `<Tooltip>` that wraps arbitrary
  children.
- It should reuse AnchorTip's already-solved hard parts: portal into the L4 Overlay layer
  (so it is not trapped behind the panel it describes), capture-phase reposition on
  scroll/resize, and Esc via the shared `useEscClose` LIFO stack.

## Scope recommendation: NOT all 354

Migrating everything is about a day plus a visual pass, and each swap turns an attribute into
a wrapper element, which can perturb flex/grid — status-bar chips and header buttons
especially. Do the surfaces in constant view (status bar, header bar, chat timeline) and leave
settings/marketplace on `title=` until touched anyway.

**Tradeoff to preserve:** `title=` is free accessibility, cannot overflow or be clipped, and
survives the window losing focus. A custom tooltip has to earn all three back, and these
triggers are dense (the status bar sits at the screen edge; the timeline scrolls).

Deliberately kept out of the native-runtime branch: a 100-file migration inside a 50-commit
branch would have made its review materially harder.

## History
Filed 2026-07-28 (v1.3.1 polish section). Re-verified 2026-08-12 and 2026-09-01.
