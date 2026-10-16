# r2 · reading-list — builder report and guide-gap notes

## What it built
New top-bar open-book button after Projects → full screen "Saved for later" (count line, outlined "+ Save a link or file", search + tag filter chips). Cards: name (+ amber "File missing" pill), fact chips (site · kind · read time), two-line summary, tags, "Saved 2h ago" + filled "Ask about this" bottom right, tag icon + bin top right. Click opens the item. Tag icon → "Link details"/"File details" popup reusing Session details' Tags card (shared tag registry). Bin removes at once with an Undo toast. Ask about this → existing "Ask your assistant" popup with a pre-filled, unsent prompt. Save for later popup: one link box + "Choose a file instead…"; failure replaces buttons ("This link couldn't be saved. What you typed is still here." Details, Cancel/Try again). First-time card, full-screen error, no-matches with Clear search; phone via ||| row.
Live switches (`?reading=`): open, add, add-failed, details, details-missing, ask; `scenario=empty`; `fail=readingList.list`; `readingTag=idea`; `readingSearch=…`; `scenario=stress` (1,200 items).
References: Your library, Projects → Conversations, Pages' first-time card, Session details, Projects → Files' "Ask your assistant".
Did not run full verify (machine load).

## Where the guide left it guessing (condensed)
1. Where a card's own main button goes (put it after the date, bottom right).
2. Is a grid of cards "a list of actions" (one filled per card)? → yes, every card filled; the screen's Save became outlined.
3. Whether/how many permanent top-bar buttons a feature may add.
4. Row action "appears where the pointer is" — lists only; cards? → bin always visible.
5. Removing: ask first or Undo? → instant + Undo toast (no reference screen does this).
6. Detail page for the user's own item (not marketplace) → copied Session details.
7. One shared tag set or the feature's own → shared registry.
8. Status pill when the name wraps → pill flows after the last word.
9. Tag chips inside filter chips; two tags = any or all → "any".
10. Where the first-time card sits → copied PagesEmptyCard.
11. Filtered count format → "**3** of 7 shown".
12. A saved file gone missing → amber pill, no Ask, notice with red-outlined Remove (copied "Folder missing").

## Pushed toward worse
- "One filled per row in a list of actions" → seven bright buttons, loud.
- "Top-bar button opens a side panel or full screen" → a fourth permanent header icon was the only way in; a tab in Your library might be better.
- "No bare number right of a right control" + "date bottom right" squeeze the date against the button.

Not read: decisions.md, error-message-standards, PITFALLS, MAP, review-deck, workspace-workflows.
