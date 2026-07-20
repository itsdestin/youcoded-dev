---
paths:
  - "youcoded/desktop/src/renderer/**"
last_verified: 2026-07-20
verify:
  - path: youcoded/desktop/src/renderer/hooks/use-narrow-viewport.ts
    contains: "max-width: 639.98px"
  - path: youcoded/desktop/src/renderer/components/OverflowMenu.tsx
  - path: youcoded/desktop/src/renderer/components/NarrowViewToggle.tsx
  - path: youcoded/desktop/src/renderer/styles/globals.css
    contains: "touch-reveal"
  - test: youcoded/desktop/src/renderer/components/OverflowMenu.test.tsx
  - test: youcoded/desktop/src/renderer/components/NarrowViewToggle.test.tsx
---

# Narrow viewport (phone / remote browser)

The renderer runs unchanged in a phone browser over remote access. Before the
2026-07-20 pass it had **four disagreeing breakpoints** — a 700px CSS collapse,
a 640px game button, 560px header labels, a 480px hard-pinned drawer — and
nothing below 700px propagated into components' own Tailwind widths. Several
features were not merely cramped but **unreachable**.

**640px is the breakpoint; `useNarrowViewport()` is the source of truth.**
Use the hook when the DOM structure branches, Tailwind's `max-sm:`/`sm:` when
only classes change. Don't introduce a new number. · why: four competing values
is what produced the unreachable states · guard: `use-narrow-viewport.ts`
(`639.98px`), `OverflowMenu.test.tsx`.

**Never hide a control as the narrow "fix" unless another entry point exists.**
`hidden sm:block` on the gamepad made Connect 4 unreachable below 640px —
`TOGGLE_PANEL` had exactly one caller in the whole renderer, so an incoming
challenge could never be answered. Collapse into the `|||` menu instead. ·
guard: `OverflowMenu.test.tsx` (deleting a row fails it).

**A collapsed control's badge must move with it.** Settings danger/info dots and
the pending-challenge pulse re-surface on the `|||` button, else collapsing the
header silently swallows "something needs attention". · guard:
`OverflowMenu.test.tsx`.

**Narrow accommodations stay narrow-only.** Gate on `useNarrowViewport()`, not
unconditionally — an earlier version of the ProjectView hero cog and the
page-scroll model applied at all widths and had to be reverted. Desktop has the
room; collapsing there only costs a click. · guard: `ProjectHero.test.tsx`
(`ProjectHero on desktop`).

**A parent collapsing to 100% does not resize its children.** `.drawer-pane`
went full-width under the media query while its child `<aside>` kept
`w-[--right-pane-width]` (480px), so ~90px — including the drawer's toolbar —
hung outside an `overflow:hidden` box on a 390px screen. Check the child too.

**`.drawer-pane` is `z-index: 11`, above `chrome-glass` (`z:10`).** The visible
frame border is painted by chrome-glass, NOT by the `.frame-edge` elements
(those are flex spacers). Hide the spacers and the pane paints over the border.
Inset the pane with **margins**, not by un-hiding spacers: `ChatView`'s
`framed-shell` has `.frame-edge` children, `TerminalRightSlot`'s clone has none,
so the spacer route fixes chat view and leaves terminal view broken.

**Hover-only affordances have no touch path.** `opacity-0 group-hover:` never
resolves on the bundle phones actually run. Add `.touch-reveal` (visible under
`pointer: coarse`) and `.coarse-hit` for a 44px target. `title=` tooltips also
never fire on touch — don't put load-bearing copy there.

**The chat/terminal toggle shows the view you'd switch TO** on narrow, not the
current one. Reads correct either way in source; only obviously wrong in the
running app. · guard: `NarrowViewToggle.test.tsx`.

Remote-specific trap: the shim overwrites `__PLATFORM__` with the **host's**
platform, so `isTouchDevice()` is false on a phone. Feature-detect
(`matchMedia('(pointer: coarse)')`) rather than trusting the platform string —
see the open ROADMAP bug.
