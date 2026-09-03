---
status: shipped
shipped: 2026-08-31
repos: [youcoded]
commits: [992f7228, 13f6e356]
---

# Brand-aware model surfaces

Rolling the status-bar chip's company-mark treatment out to the rest of the app,
and fixing the brand colour set for themes the built-in CSS blocks never matched.

## Where it started

The chip was the only surface in the app that knew which company made the model
it named. An inventory found **15 places** a model is picked or displayed:
7 where you choose one, 8 where one is shown. Exactly one — the chip — carried a
mark or a colour.

Two structural findings came out of that inventory, both more valuable than the
styling question:

1. **Two competing model lists.** Five pick surfaces shared `model/ModelPicker`
   (search, favourites, source filters). The chip opened `ModelPickerPopup`'s own
   hand-built list instead — four fixed buttons for Claude Code, a separate
   grouped list again for native — so the app's most-used model control had the
   weakest list. `ModelPicker`'s header comment already claimed to have replaced
   it; the branch was still live at `App.tsx:3491`.
2. **Brand colours were slug-scoped.** `--brand-*` lived only inside the four
   `[data-theme="<slug>"]` blocks, so every community theme inherited `:root`
   (light) regardless of how dark it was.

## The review deck

`scripts/ui-review/plans/model-brand.json` captured before/after in midnight,
halftone-dimension and light. Deck spec + answers were built with
`review-cards.py`; six steps, all answered 2026-08-31.

| # | Question | Answer |
|---|---|---|
| MB-1 | Brand colours follow the theme's own dark/light flag | **Yes** |
| MB-2 | How far colour spreads in the model list — marks / marks+current / every row | **Marks only** |
| MB-3 | Chip opens the shared list instead of its own | **Yes** |
| MB-4 | Company marks on Resume Browser cards | **Yes** |
| MB-5 | Provider rows in Settings — draw service marks / direct keys only / leave alone | **Leave alone** |
| MB-6 | Company marks on local-model rows | **Yes**, mark top-left in line with the name |

MB-2's losing options: *marks + current model coloured* (colour would mean "the
one you're running", matching the chip) and *every row coloured* (most scannable,
loudest). Destin picked marks-only — a list of tinted names reads as decoration.

MB-5 became a DECIDE step mid-build: the change was written, then the screenshots
showed it does nothing on a real machine. The brand set covers model **makers**;
the providers people connect **through** (OpenRouter, Ollama, LM Studio) have no
mark. Reverted rather than shipped invisible.

## Consequences worth remembering

- **Colour on text now exists in exactly one place** — the status-bar chip.
  Everywhere else colour lives only in the mark. Coherent as a rule ("colour
  means: the model you're running"), but it is a rule, not something visible at a
  glance. Flagged to Destin at close-out; left as-is.
- **The chip opens an empty list on a fresh install.** The shared list shows
  favourites first and a new device has none, so the chip now says "No favourites
  yet" until you search. The four buttons were always there. Accepted under MB-3.
- **The mark narrows local-model rows** by ~20px, so a long description wraps one
  line further. Accepted under MB-6.
- **Model-name formatters were NOT consolidated.** Four exist (`nativeModelLabel`,
  `formatModelId`, `friendlyName`, `displayName`) and they look like duplicates,
  but each strips something different on purpose — the Resume card deliberately
  keeps the raw `claude-sonnet-4-5` because the card is a record, while the chip
  prettifies to `Sonnet 5`. Collapsing them would silently change text on three
  screens.

## Bug found by building the mockup, not by reading code

The chip's dialog read **"Choose a model…"** on a native session that plainly had
one: the first version required the live model id and the stored binding to
agree, and they don't always. It now resolves the provider from the catalog and
falls back to printing the raw id. Only surfaced because a screenshot of a native
session was needed for the deck.

## What the contrast fix actually repaired

Measured 2026-08-31, 11 brands x 7 published community themes = 70 combinations:
**55 unreadable before, 25 after.** The 30 repaired are all the DARK themes. The
25 remaining are the four LIGHT community themes, which were never mis-served —
their panels are just pale and tinted, and the light values were tuned against
the built-in Light theme's `#EAEAEA`.

The merge message for `992f7228` reads as if it covered all seven; `13f6e356`
carries the correction, and the residue is a ROADMAP bug. Guarded by
`desktop/tests/brand-colour-modes.test.ts`.

Nothing caught the original bug because `scripts/audit-theme-contrast.mjs` audits
foreground/background token pairs and has no idea brand colours exist.
