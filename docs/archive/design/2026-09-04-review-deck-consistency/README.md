# Review deck consistency — what Destin decided, round by round

Four rounds on 2026-09-05/06, all on the deck's own appearance. Each `roundN.json` is the deck
he was shown and `roundN.answers.json` is what he answered. The specs are a record: their
pictures came from scratch folders that no longer exist.

| Round | What it showed | What he said |
|---|---|---|
| 1 | `selfie` output, generated with no descriptions | Rejected outright: "no idea what i'm supposed to be looking at", "descriptions? what did you change", "this is a waste of my time". `selfie` now refuses to serve a deck whose steps have no description. |
| 2 | The old plain questions page against the new deck | "too hard to quickly navigate between questions and tell them apart"; "difficult to differentiate the different explanations section card from the available/selectable options"; "strange left/right margins". |
| 3 | Numbered questions, flattened explanations, one left edge | "that's worse somehow. do 3 cards side-by-side horizonally, then add big ass clear 'Option A. Option B.' headers"; and — correctly — "did you even change anything?", because the second step's picture had been rendered from a build that predated the change. |
| 4 | Three explanations across, Option A/B/C headings, boxes restored, the scroll fade | **Yes to both steps.** |

Two defects this branch had shipped were found by him, not by its tests: a header that reserved
118px for the word "Home" and so truncated a subtitle that used to fit, and a contract table
whose fixed column widths broke a guard path into five slivers. Both are fixed and measured.

The lasting rules that came out of it are in `.claude/rules/review-deck.md`; the field-by-field
detail is `scripts/ui-review/deck/AUTHORING.md`.
