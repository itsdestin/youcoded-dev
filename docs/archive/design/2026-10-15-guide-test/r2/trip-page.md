# r2 · trip-page — builder report and guide-gap notes

## What it built
A Page "Japan trip" (Personal, unpinned). Trip card: "Phoenix to Japan" + Planning pill, fact chips (dates, nights, people, origin, route), three totals (flights, hotels, estimate), "Change details" top right. Flights: four date options with airline/stops/price/label ("Low for these dates"…); picked one shows a 30/90-day price-history line (usual range shaded, lowest marked, hover price). Cities: route as clickable stops ("maybe" stops dashed); picked city shows dates, summary, three columns (Things to see; Where to eat with ¥ and "Book ahead"; Where to stay with area, walk times, price/night, hotels). Phone: one column.
States (`?tripPage=`): none, empty (first-time form card → Start planning), loading, failed (flights card replaced by notice, Details, Try again), edit. Phone via Narrow. `openPage=page-japan-trip`.
References: Money page, Week planner, Trip board sample, Marketplace detail / Session details.
Flagged: Pages list squeezes pages at phone width (third builder to report it).

## Where the guide left it guessing (condensed)
1. Page vs built-in app screens — no rule.
2. No approved Page to copy (Money breaks the guide) → hand-rebuilt app pieces.
3. Page kit lacks pill, notice, fold, tab strip, spinner → hand-made each ("one piece, one look" broken).
4. Card-outline colour unavailable in a Page → mixed by hand.
5. Full screen: Large heading or small label over a card?
6. No heading level for a full-screen Page's top card → 16px semibold.
7. Charts: line colour, range shading, lowest point, axis text → copied Money's chart minus glow.
8. "Pick one card, rest of screen shows its details" → accent outline on the picked one.
9. "No light beside bold" vs chart legends and prices → stacked label over value.
10. Q17: one part of a full screen fails → notice under the same heading, "—" in the top card total.
11. Can a first-time card hold a form? → yes, four fields.
12. Three columns of different heights leave dead space → accepted.

## Pushed toward worse
- "No light beside bold" made legends and hotel prices two lines (vs "no dead space").
- "Flush left/right/full" left the 30/90-day switch alone on its own line on phones.

Not read: decisions.md; the page-builder skill (outside the workspace).
