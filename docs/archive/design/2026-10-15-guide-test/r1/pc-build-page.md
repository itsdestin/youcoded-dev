# r1 · pc-build-page — builder report and guide-gap notes

## What it built
A YouCoded **Page** (not a built-in screen): build card (name, "5 of 8 parts used", four numbers — total, est. fps, $/fps, saved vs new; 1080p/1440p/4K switch), Parts card (row per part, name opens a picker, New/Used switch, price, grey source line, amber "Riskier used" pill with reason), Compare builds (price × fps chart, current dot in accent, list), empty card with "Start with a typical gaming build" + grey "or ask your assistant" line, failed price check (top bar "Couldn't update · 3d", red notice in Parts with Try again), phone single column.
Screens: `pages/page/page-pc-build`, `#empty`, `#picker`, `#failed`, `pages/focus/page-pc-build#phone`.
References named: Money page, Trip board, Settings boxed rows, the app's Menu.

## Where the guide left it guessing (builder's own words, condensed)
1. Built-in screen vs a Page — no section says.
2. "Building a Page" is three lines; the kit lacks segmented switch, pill, notice, menu, chart, nested boxes → hand-built from tokens.
3. Which recipe a Page's own content follows ("Full screens" = frame only; "Card levels" = popups/panels).
4. Nested boxes inside a Page card (CARD_LEVEL_2 is app-only).
5. Charts: nothing (axes, ticks, colours, accent for "current"?).
6. Current item in a compare list (half switcher, half list).
7. Stale-but-usable data after a failed refresh (near Q17): notice inside card vs top bar only.
8. Big summary numbers vs the 16px heading cap.
9. Empty state whose real start is "ask in chat".
10. "Never a button that does nothing" vs ui-mockup skill "unbuilt actions render enabled".
11. A view with no filled button — allowed?
12. One disabled option inside a segmented switch — where the why goes.
13. Money formatting.
14. Pill reason inline vs behind (i) (open Q4).
15. Card padding: kit 16px vs guide 12px.
16. Learned only from code: per-state screen names; `pages/focus/…` for phone; 639.98px.

## Where the guide pushed it toward worse
- "Copy references" → nearest reference (Money page) breaks the guide (spaced caps labels, coloured warning text, own pill buttons).
- Page kit contradicts the guide (ghost text button; 18px h1; cites retired G-3/G-4; flat card without the guide's shadow) while the guide's Page advice is "use the kit".
- Pill corners: principle 2 vs "Tags pill-shaped" vs kit's hard-coded full pills.
