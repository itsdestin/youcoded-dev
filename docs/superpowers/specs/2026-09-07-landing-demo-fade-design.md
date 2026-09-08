---
status: draft
date: 2026-09-07
owner: Destin (decisions) / YouCoded Assistant (draft)
repo: youcoded
---

# Landing demo activation and fade design

## Goal

Keep the landing page's intentional blended lower edge on the live demo while it is passive. When a visitor chooses to use the demo, make the complete app window visible immediately and scroll it to the vertical center of the browser viewport. During ordinary downward page scrolling, restore the full window substantially sooner than the current reveal.

## Scope

`youcoded/docs/index.html` only. The existing same-origin iframe, its one-click pointer gate, the SVG-plus-gradient mask technique, and the floating download controls remain in use.

## Interaction

1. Before activation on wide screens, the demo retains its variant-selected lower-edge dissolve and the iframe remains non-interactive.
2. The first activation click, whether through the Try Demo control or the demo's click-through overlay:
   - permanently overrides the mask fade to 100% visible for that page visit;
   - enables the iframe's pointer events;
   - retains the existing behavior that moves the floating download row out of the way;
   - scrolls the document so the demo's vertical midpoint aligns with the viewport midpoint.
3. Centering uses smooth scroll unless `prefers-reduced-motion: reduce` is active, in which case it scrolls instantly.
4. Repeat clicks do not initiate another centering scroll.
5. On phone/narrow layouts, the existing no-fade presentation remains. Activation enables the demo without forced recentering because the layout is flow-based and the interaction should not create a disruptive jump.

## Scroll reveal

The current animation-frame-throttled calculation remains the scroll path. Its interpolation range is reduced from the dissolved band's full height to a deliberately shorter fraction of that band, so the visible window reaches a 100% fade stop earlier as the visitor scrolls downward. The exact fraction is a named constant and has a WHY comment explaining that it corrects the prolonged partially-invisible state without reintroducing per-scroll mask rebuilds.

## Implementation boundaries

- Continue using the existing SVG rounded-rectangle mask intersected with a CSS gradient. Do not use `overflow: hidden`, `clip-path`, or a painted overlay over the iframe: those have caused Chromium to smear framed-theme glass blur.
- Preserve the one-frame scroll scheduling and the sub-pixel-write threshold used by the existing fade calculation.
- Do not modify demo fixtures, generated site media, iframe source, or product renderer code.

## Validation

- A focused static/page-level test asserts the activation path makes the fade fully visible, scrolls to the calculated vertical center only on wide layouts, and selects smooth versus instant scrolling according to reduced-motion preference.
- The same test asserts ordinary scroll uses the named shorter reveal span.
- Capture and inspect an isolated before/after motion clip showing both: activation clears the dissolve and centers the demo; a downward scroll clears the fade sooner.
- Run the relevant landing-page/workbench checks. The desktop verification command is run before claiming the website change complete.

## Out of scope

Redesigning the download controls, changing the demo content, revising desktop or phone breakpoints, or changing the page's visual theme system.
