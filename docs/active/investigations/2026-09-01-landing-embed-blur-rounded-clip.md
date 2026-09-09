---
date: 2026-09-01
status: active
type: investigation
topic: Landing-page live embed goes fully blurred under framed wallpaper themes — a rounded clip on the iframe defeats the chrome-glass clip-path
---

# Landing-page live embed blurs the whole window under framed wallpaper themes

**Symptom.** On the live public page (`youcoded/docs/index.html`), start the embed, open its theme
button, pick Meadow Mist: the whole app window becomes one blur. Golden Sunbreak (floating chrome)
is fine. Only meadow-mist among the vendored packs triggers it today, and the embed boots in
Midnight, so exposure is small — but the landing redesign makes theme switching a primary
interaction, so this must ship with it.

**Mechanism (isolated 2026-08-30 by stripping styles one at a time in a live instance).** Any
*rounded clip* on the iframe or an ancestor makes Chrome ignore the `clip-path` cutout on the app's
single `chrome-glass` `backdrop-filter` surface, so the glass blurs the entire window instead of the
chrome donut. `.embed-frame`'s `border-radius` + `overflow: hidden` is that rounded clip;
`clip-path: inset(round)` and a rounded iframe reproduce it too.

The wrapper still carries the clip on master today:
<!-- claim: {"path": "youcoded/docs/index.html", "contains": "\\.embed-frame \\{ border-radius: 16px; overflow: hidden"} -->

**Verified fix — SHIPPED to a branch 2026-09-03** (`youcoded fix/embed-blur-rounded-clip`, `81ce5851`).
Drop `overflow: hidden` from the wrapper (keep `border-radius` for the border/shadow shape — safe
without the clip) and round the content with a **mask** instead: an SVG rounded rect as
`mask-image`, rebuilt on resize because one scaled rect stretches its corners when the box's aspect
ratio changes. A mask does not trigger the bug; a clip always does.

**Correction (2026-09-03).** This paragraph previously said to round the corners from *inside* the
iframe. That is wrong, and it is not what the mockups do: `build.py`'s own comment above `maskEmbed()`
records that rounding from inside the app hits the same bug one level down, and the mockups use the
two-layer mask (rounded rect ∩ fade gradient). Verified by reading `build.py` lines 731–783 and by
reproducing both states headless against `docs/index.html` — before: the whole window smeared under
Meadow Mist; after: sharp, with Midnight pixel-wise unchanged.

**Related — COMMITTED 2026-09-03** as `youcoded feat/embed-community-themes` (`2b2b83d8`), replayed onto
current master rather than its 133-commits-stale base. It vendors the four missing community
packs (cotton-candy-sky, devils-garden, kuromi-dreamer, strawberry-kitty, ~6.5 MB) into
`desktop/src/renderer/dev/workbench/fixtures/themes/` so the embed knows all seven —
`__workbenchAppearanceSync({theme})` silently ignores a slug it does not have. The fixture-pinning
tests (`workbench-shim-semantics`, `workbench-channels`) assert only the original three slugs, so
adding packs breaks none of them.

**History.** Filed 2026-08-30 while building the redesign mockups; re-verified against master 2026-09-01.
