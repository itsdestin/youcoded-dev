# Project-detail overlay — post-implementation review

The approved 16px medium title, 8% contained line and 42px/4%-side unpainted content mask are scoped to `ProjectDetailOverlay`; its optional metadata border and other custom popups were not changed.

## Independent UX tester

The isolated Workbench Project comparison was captured at top, middle and end for Selected and Today in Meadow Mist and Halftone Dimension, at 1024×768 and 1440×900: 24 verified captures, zero contrast failures. The tester visually inspected Selected at both sizes. Its header stayed visible, the final Note 16 was visible at the scroll end, and edge text was visibly faded. This repeats the **disclosed** pre-approval trade-off: the last visible lines grow faint until scrolled into the clear region. No other clear regression observed. Today's contact sheets were captured but not visually assessed in the tester's post-build pass.

## Fresh code review

- Reviewer warned that `globals.css` documents historical `mask-image` repaint/clipping failures inside some `.layer-surface` overlays. **Triaged on this surface:** the independent screenshot pass saw the Project fade at top/middle/end in both tested themes/sizes, and the browser computed style reported the two-layer mask; there is no observed Project failure to fix. Keep the caveat for future overlay shells and do not generalize this rule without their own browser check.
- Reviewer noted test asserted initial attributes and static CSS but not live scroll transitions. Added a targeted test for top/middle/end data-attribute updates; it complements the independent screenshot captures, which verify rendered masks.

No acceptance or permission to apply this treatment to Marketplace, Tags, Context, or other custom popups is inferred from the Project decision.
