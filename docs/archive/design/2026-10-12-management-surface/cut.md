---
status: active
date: 2026-10-13
---

# Round 3: the cut, plus plain-word hover hints

Feedback (verbatim, 2026-10-13): "this is a confusing fucking disaster to navigate.... just wayyy
too many controls. i also think i want hover tooltips that elaborate on various buttons/pages/popups
etc in laymans terms. some of the button terminology is unclear, like 'trace its path' in page
popups. what that mean?"

Rebuild with `python3 build.py`. It now **refuses to write the page** if any button, dropdown, search
box, fold header, filter pill, badge, status pill, count or status dot lacks a hint. It also refuses
any `title=` attribute, because the operating system draws those as its own grey box. Screenshots are
in `proof/round3/`, all with no console errors (`ui-probe --fail-on-error`).

## Controls per tab (visible on first open at 1400 wide; header and tab buttons not counted)

| Tab | Before | After |
|---|---|---|
| Today | 23 | 23 (same layout; only the words changed) |
| Screens, fixed control row | 24 | **7**: search, 5 pills, "Show me…" |
| Screens, whole tab | 31 + 97 pictures | 17 + 65 pictures (six per place, then "Show all N") |
| Big picture | 20 (6 in a control row) | 17 (3 text links + the 14 rows in the two boxes) |
| Screen popup | 14 | 12 (3 header icons, the picture, up to 4 situations, 4 footer buttons) |

## Removed
- **Header:** nothing was removed except the words "· the main copy". It now holds the three tabs,
  the theme menu, the Draft tag and the date.
- **Screens:**
  - the Pictures / Tree / Trail switch
  - Group by (Place / Kind / Clicks in / Work)
  - the sort menu
  - the pills Full screens, Slide-ins, Bars & tips, Text box, Problems and Since release
  - the four question pills, which became the one "Show me…" dropdown
  - the Clear button. Pills turn off when you click them again. When nothing matches, the empty
    message has one "Show every screen" button.
  - The Tree view and the Trail page are deleted, along with their code and styles. The page is
    always grouped by place, in click order, six per place.
- **Screen popup:**
  - the Close up / In the window switch. The close-up shows first. Click the picture to see the
    whole window, and click again to zoom back in. A line under the picture says so.
  - the clickable path links and the "Opens from here" chip buttons. The path is now plain text,
    and the screens that open from here appear as pictures inside "How do I get here?".
  - "Also opens from <parent>".
- **Big picture:**
  - the By area / By track switch
  - the four lens pills
  - the five track cards and the whole By-track view
  - the per-track lanes inside an opened area. Each item now carries a small track word instead.
  - the connecting lines that the Waiting and Built twice lenses drew. Lines still appear when you
    pick an item inside an opened area.
  - "See all N on Screens" in the side panel. It now reads "Showing 6 of N."

## Added (only what the brief listed)
- **"How do I get here?"** in the popup. It opens a section inside the popup:
  - "How you get here": The main window → each screen on the way → this screen (outlined), as
    pictures from left to right.
  - "What opens from here": the screens that open from this one, as pictures.
  - Clicking any of those pictures opens that screen. The button then reads "Hide the way here".
  The arrow keys, Esc and ✕ still work.
- **Three links under the mission card:** What's blocked (18 items) · Built twice (80) · Shipped
  this month (10, since Oct 1). Each one shows a flat list under its heading, with a count, one line
  saying what the list means, and "Show everything" to go back. Clicking a row opens its side panel
  without leaving the list. Clicking the active link again also goes back.
- **Hover hints everywhere:** `tooltips.py`, one dictionary `TIP` with **158 entries**. The bubble
  copies the app's `Tooltip.tsx` from the UI-consistency branch:
  - the look: the layer surface, `px-2 py-1`, 11px text in `fg-2`, at most 20rem wide
  - the timing: 800 ms before the first hint, 130 ms for a neighbour within 400 ms, a 110 ms fade
  - the position: below the control, flipped above when there is no room, and kept 12px inside the
    window so it is never cut off
  - it also appears on keyboard focus, and hides on click, scroll or Esc
  - **The click toast is built from the same hint text** ("Not built yet. In the real version,
    clicking it …"), so the hover and the toast cannot disagree.

## Renames (labels a college student would have had to guess)
| Was | Now | Where |
|---|---|---|
| Trace its path | How do I get here? | popup |
| See before and after | What changed last time | popup |
| Ask about this | Ask the assistant about it | popup |
| Comment | Leave a note | popup |
| Click path | Where it is (and the path starts with "The main window") | popup |
| Clicks in | Clicks to reach | popup |
| Shown only on first launch | Shown only before you have used the app | popup |
| Has a picture of a problem | Has a picture of something going wrong | popup |
| phone width | phone size | popup |
| changing | being changed | screen tiles |
| Changes its behaviour | Changes how it behaves | Show me… |
| Most things are waiting on | What most things are waiting on | Big picture |
| ‹ Back | ‹ Back to all areas | Big picture |
| track badges on area cards | "Track: X" or "Mixes: X · Y" as a line of text | Big picture |
| As of Oct 12 · the main copy | Facts as of Oct 12 | header |
| Fix the failing tests | Fix the failing checks | Today |
| 7 automatic library updates, all with failing tests | 7 automatic updates to code the app borrows, all failing their checks | Today |
| Apply all seven and test | Apply all seven and check them | Today |
| 10 working copies with unsaved changes… | 10 unfinished copies with unsaved changes… | Today |
| tests pass / tests fail (review status) | checks pass / checks fail | Today |
| What should be configurable | What should be adjustable | Today, "Why this one" |
| test release went out | test version went out | Today, release fold |

## Unsure; worth Destin's eye
1. **Six per place** leaves 1½ rows at 1400 wide (four pictures across). Eight would fill two rows
   evenly. The brief said six, so it is six.
2. **The situations strip stayed in the popup** (up to four small pictures you click to see the
   screen empty, full, with an error…). The brief did not list it. It is how a screen's other
   situations are reached, so cutting it would hide pictures.
3. **"Which parts are set in more than one place"** (the table at the bottom of Screens) stayed.
   It is content, not a control, but it is one more fold on that tab.
4. **The track word on every chip** ("· App", "· Add-ons", "· Engine", "· Installs", "· Workshop")
   adds a little noise inside an opened area. "Workshop" is my short word for the "How it gets
   built" track, and he may want another. The hint gives the full name.
5. **"Show me…" is a native dropdown**, so its four choices cannot carry their own hints. The
   dropdown's one hint covers them.
6. **"Open its review deck"** was kept. "Review deck" is Destin's own word, and the hint explains it.
7. **Hints on every picture tile** show the screen's one-line description (or "Opens a bigger
   picture…"). That is useful, but across a wall of 65 pictures it may feel chatty.
8. **"Built twice" lists 80 items.** That is what the evidence says. As a flat list it is long.
9. The kind, text-box and problem facts are still worked out (the popup's "Kind" and "Also" lines
   use them), even though their pills are gone.
10. In a few headless screenshots the tab pill looks half-highlighted. This is the probe's known
    stale-paint problem (see `scripts/ui-probe.mjs`), not the page. The DOM state is correct.
