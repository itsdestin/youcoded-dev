# r2 · news-page — builder report and guide-gap notes

## What it built
A **built-in Page "News"** (like Office) in the Pages list under "Built in"; pinnable to the top bar, not pinned by default. Band: "News", age ("8m"), update button. Summary line "24 stories · 4 sources" + outlined "Topics and sources". One section per topic (Technology, Politics, Finance; TabHeading + story count), story cards three across: headline, chips (site, "Also in Axios and BBC News"), two-line summary, time bottom right; click opens the story; six per topic then full-width "Show 3 more". "Topics and sources" popup (save as you go): removable topic pills, dashed "+ World" suggestions, "Add a topic" box; source switches (NYT, Politico, BBC, Axios, AP, Reuters, NPR, Guardian, WSJ, Bloomberg; paywall note).
States (`?news=`): none, first-run, source-failed (red notice, Details, Try again), offline (+`network=offline`, amber notice, older stories), failed (full-screen error), loading; `newsPin=1` (pinned → `news/focus`, phone).
References: Office home, Projects headings, Your Library / Marketplace cards, Voice vocabulary.
Flagged: Pages list squeezes pages at phone width (also r2 pc-build); two filled buttons (shell's "Create a page" + first-run's); no logos for news sites. Two flaky tests (ipc-handlers, wheel-scroll-stays-native) — being fixed.

## Where the guide left it guessing (condensed)
1. "Where something new opens from" omits a built-in Page → copied Office.
2. Built-in page body: full-screen recipe or own?
3. Where a whole-screen tool goes (only group heading rows named).
4. Large heading's shared piece not named (TabHeading in project-view).
5. "Date at the bottom right, end of the details line" — details line undefined.
6. No shared clickable grid card → copied Office's NewCard classes.
7. Scroll fade colour vs the page pane's canvas → no fade.
8. One source of several failed, grouped by topic → one notice above all sections.
9. Details-then-buttons makes a small partial failure as tall as a big one.
10. First-run filled button vs the shell's filled "Create a page".
11. Service logos for news sites: no source, trademarks.
12. No shared removable pill / dashed suggestion pill.

## Pushed toward worse
- First-run "one full-width filled button" inside Pages → two filled buttons.
- "Notice replaces the part it's about" doesn't fit a list grouped by another key → page-wide strip.
- "Date bottom right" on fixed-height grid cards → dead space.

Not read: "documented as they are today", archived guide, error-message-standards, PITFALLS, MAP.
