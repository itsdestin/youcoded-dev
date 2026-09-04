---
status: shipped
created: 2026-09-03
shipped: 2026-09-03
owner: youcoded PR #414, merge 2c1dd2a3 (branch site/mobile-narrow, deleted)
---

# youcoded.ai phone pass — what Destin decided

The two review decks were answered in-session, not through the deck's own
submit (both read "not submitted", so no `*.answers.json` was ever written and
this file is the only record). Deck specs are beside it; the screenshot runs
under `runs/` and `runs2/` are regenerable and deliberately NOT committed.

## Deck 1 — `site-mobile.json` (8 steps): 7 yes, 1 other

| | Point | Answer |
|---|---|---|
| M-1 | Feature cards become plain stacked blocks | yes |
| M-2 | Download buttons become a two-across card | yes — *"the selected one should always be at the top as the first option"* |
| M-3 | The bar at the top goes opaque | yes |
| M-4 | The live demo waits for a tap | **other** — *"kinda confused. i think it's fine if the user has to click to start, but 1) the unstarted window should still be an image with the correct/current webpage theme applied. we may also want to mess with scaling so the demo is actually usable on mobile"* |
| M-5 | Roadmap diagram stops overlapping itself | yes |
| M-6 | Footer stacks | yes — *"i think i want the 'open source' pill to move so it's in-line with youcoded. we should also change 'not officially supported by anthropic' to also mention openai/openrouter"* |
| M-7 | A floating Download button follows you down | yes |
| M-8 | Service chips fit more per row | yes |

## Deck 2 — `site-mobile-2.json` (6 steps): 6 yes

R-1 platform first · R-2 themed, phone-shaped demo · R-3 footer badge + licence
wording · R-4 phone held sideways · R-5 the floating button hides while reading
down · R-6 roadmap words before the drawing.

R-2 carried one note, marked *[just noting]* and done anyway: *"but can we hide
the minimize/maximize/exit icons?"*

## Decided against, with the reason

- **"Supports all M-series chips"** for the Mac picker, which is what Destin
  suggested. Shipped as **"Apple silicon — M1 or newer"** instead: the label's
  job is to pick between two installers that will not run on each other's
  hardware, and open-ended still tells an Intel owner they are not in that
  option. The hint gained "beginning with **Apple**" so the test needs no model
  number at all.
- **Preloading the wallpaper** (`fetchpriority=high`) to paint sooner. Measured
  on a throttled phone link over three runs each: ~300ms WORSE first paint and
  ~900ms worse largest paint, because it took bandwidth from the render-blocking
  stylesheet. Not shipped.
- **`?platform=android` on the demo embed** to kill the window buttons for free.
  `isAndroid()` has 31 call sites in the renderer, so it would have changed the
  whole demo rather than three buttons. A one-rule stylesheet injected into the
  same-origin iframe does only the three.

## Left open — Destin's call, none of it started

(Filed as roadmap items the same session; see `docs/roadmap/dev-workspace.md`.)

1. **The feature clips are desktop recordings shrunk to phone width**, so the
   app's own writing inside them is 2–4px. You can see there is an app; you
   cannot see what it is doing. Fixing it means re-filming framed for a phone.
2. **`#about` and `#story` run ~3 and ~2 phone screens** of unbroken text. A
   fresh reader also flagged the third About paragraph ("outpace development of
   competing closed agents") as strategy talk with no reason to be there.
3. **The asterisk on the iOS button has no footnote near it** — the explanation
   is about 10,000px further down the page.

## Never verified by a human on real hardware

Every check in this pass was headless Chrome with touch emulation. Nothing here
has been touched by an actual thumb: the tap that starts the demo, the gallery
swipe, opening a FAQ row, and the scroll-up that reveals the download button are
all verified programmatically only.
