---
paths:
  - "**/desktop/src/renderer/**"
last_verified: 2026-09-01
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
2026-07-20 pass **four breakpoints disagreed** (700 CSS collapse / 640 game
button / 560 header labels / 480 drawer) and nothing below 700px reached
components' own Tailwind widths, leaving several features **unreachable**.

**640px is the breakpoint; `useNarrowViewport()` is the source of truth.**
Use the hook when the DOM structure branches, Tailwind's `max-sm:`/`sm:` when
only classes change. Don't introduce a new number. (One survivor: the structural
collapse in `globals.css` is still `@media (max-width: 700px)` — pre-pass, not a licence.) · why: four competing values
is what produced the unreachable states · guard: `use-narrow-viewport.ts`
(`639.98px`), `OverflowMenu.test.tsx`.

**Never hide a control as the narrow "fix" unless another entry point exists.**
`hidden sm:block` on the gamepad made Connect 4 unreachable below 640px —
`TOGGLE_PANEL` had one caller in the whole renderer then (three today), so an incoming
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
`framed-shell` has two `.frame-edge` children, `TerminalRightSlot`'s clone has one,
so the spacer route fixes chat view and leaves terminal view broken.

**A test that renders a viewport-branching component must DECLARE the viewport.**
jsdom has no `matchMedia`, and the hook reads its absence as wide — so such a test
silently exercises whichever branch the environment hands it. Two ResumeBrowser
suites had been pinning the narrow layout's behaviour from the wide branch, and
only said so when the wide branch changed under them. Stub `matchMedia` with the
`NARROW_VIEWPORT_QUERY` answer you mean. · guard: none — candidate.

**Hover-only affordances have no touch path.** `opacity-0 group-hover:` never
resolves on the bundle phones actually run. Add `.touch-reveal` (visible under
`pointer: coarse`) and `.coarse-hit` for a 44px target. `title=` tooltips also
never fire on touch — don't put load-bearing copy there.

**The chat/terminal toggle shows the view you'd switch TO** on narrow, not the
current one — reads correct either way in source, wrong only in the running app.
· guard: `NarrowViewToggle.test.tsx`.

Remote trap: the server sends `platform: 'desktop'` and the shim adopts it unless
`preservePlatform` is set (`remote-shim.ts`), so `isTouchDevice()` is false in a phone
browser. Feature-detect — but not with `pointer: coarse`, see below. ·
`docs/roadmap/remote-access.md`.

**`pointer: coarse` is the PRIMARY pointer only — false on a touchscreen laptop.**
Chromium reports "fine" whenever any touchpad or mouse-like device exists (the Z13
read `pointer: fine`, `any-pointer: coarse` with its cover detached, 2026-09-10).
For "is the user touching right now", follow the last `pointerdown`'s `pointerType`. ·
guard: `InputBar.test.tsx` ("idle unfocus vs the on-screen keyboard").
