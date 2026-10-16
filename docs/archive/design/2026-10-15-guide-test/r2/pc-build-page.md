# r2 · pc-build-page — builder report and guide-gap notes (second attempt at this page; r1 in ../r1/)

## What it built
A Page "PC build planner" (Personal, unpinned). Top line: builds as tabs ("All new", "Used graphics card", "Mostly used") + dashed "+ New build"; right: "Prices checked 2 days ago" + outlined "Check prices". Parts (left): 8 rows, name first with a grey line under it ("Graphics card · Used, eBay average of 23 sales"), price, New/Used segmented switch flush right. This build (right): total, est. fps, "$288 less than All new, 12% slower.", grey estimate note. Compare builds: row per build with price, fps, fps per $100 bar, green "Best value" pill. Phone: one column, total above parts.
States (`?pcBuild=`): none (normal), empty, checking, failed (red notice under tabs, Details, filled Try again). `&openPage=page-pc-build` already exists in PageHost (untested by builder).
It explicitly avoided round 1's critiqued mistakes (the guide now cites them).
Flagged an existing app problem: at phone width the Pages screen keeps the pages list beside the page and squeezes every page.

## Where the guide left it guessing (condensed)
1. Nothing says a Page is the home for a personal tool.
2. Page kit lacks notice, pill, segmented switch, Details fold; "never restyle kit classes" → hand-wrote them from app pieces.
3. Card outline token: pages only have edge / edge-dim.
4. Does a Page repeat the title already in the band?
5. A switch on every row: eight lit choices is a lot of filled colour.
6. Main figures (big stat boxes) not covered.
7. Q18 bar fill colour → accent.
8. Page-wide action failing in the top line → full-width notice under the tabs.
9. Q16: does a short background check need Stop? → no.
10. Bullet list in a first-time card?
11. Phone width on the Pages screen squeezes the page.
12. Dashed "+ New" pill only ruled among tags; used among build tabs.

## Pushed toward worse
- One filled per view vs "selection is accent-filled" → 8 filled switches + a filled tab: loud.
- "Flush left/right/full" stopped putting the price inside its New/Used choice.
- "No light beside bold" made each row taller (type under the name).

Not read: error-message-standards, MAP, PITFALLS, review-deck.
