---
status: draft
date: 2026-10-12
about: evaluation and rebuild of mockup.html (the management surface draft)
---

# The management surface: what it is for, how well it works, what changed

## What the page appears to be for

One page you open at the start of a work session, and again once a week, that answers three
questions without making you ask an assistant:

1. **What should I do right now?** (Today)
2. **What does the app look like, and where does a given thing live in it?** (Screens)
3. **How far along is the whole vision, and what is holding it back?** (Big picture)

Every item ends in a button for the obvious next step, so it is a launcher as well as a report.

## How clear and useful it was before

The facts were good. The arrangement was not.

- **Big picture opened first and showed everything at once:** ten areas, about 160 items
  as tinted chips with no legend, six view buttons, a "draw every dependency" checkbox and two
  summary boxes, all on one screen. This is the view you had already called "absolutely
  useless". It made a bad first impression and buried the useful tabs.
- **Today put the answer last.** The one recommendation ("Suggested next") sat at the very
  bottom, below 12 waiting items, 6 bugs and the release notes. The same piece of work
  ("Project skills & tools") showed up twice: once in "Needs you" and again in "Suggested
  next".
- **Around 30 black (main-action) buttons on Today.** Every row had one, so nothing stood out.
  The design guide allows one per view (G-4).
- **The same warning eleven times.** "No reason recorded" in yellow on every waiting row, and
  "No merge goal recorded" on every active row. That is one fact, not eleven.
- **Screens was a wall of 158 pictures**, each name printed twice, with question buttons
  wrapping onto three lines.
- **It did not look like YouCoded:** foreign section headers, a dashed banner on every tab,
  filters shaped like view switches, a Close button at the panel's bottom left.

## What I changed, and why

**What you see first, and the order** (goal 2)
- **Today is now the first tab**, then Screens, then Big picture. You picked "starting a work
  session" as the main time you'd open it.
- **Today starts with one "Start here" card**: the suggested next step, why it was picked, a
  picture of where it lands and three buttons. It has the only black button on the page
  (G-4). Its reasoning and the two alternatives are folded underneath.
- **"Project skills & tools" now appears only once**, in that card. "Needs you" shows the
  other four items.
- **The long lists are folded rows that show a count:** Waiting 12, Bugs users hit 6, Since
  the last release. Each row's one-line summary tells you whether to open it ("the oldest 76
  days; only one has a reason written down"). The notes-only branches and the automatic
  cleanup line moved inside Waiting.
- **Warnings that repeated are now one sentence on the section header** ("Neither has a merge
  goal written down yet"). The one waiting item that does have a reason (OneDrive) still shows
  it.

**Big picture: overview first, detail on request** (goals 2 and 3)
- **It opens on ten area cards.** Each shows the area's name, a plain count ("20 of 27
  exist · 5 being built"), a progress bar and the names of its sub-areas. Clicking a card
  opens that one area full-width, with its items grouped as before, and an "All areas" back
  button.
- **The four filters are now real filters.** "Not started", "Being built", "Waiting on
  something" and "Overlaps" hide everything that doesn't match instead of fading it to a
  ghost, so an answer is short. "Overlaps" uses your own question from the Oct 7 deck: "what
  overlaps or could be combined".
- **Removed:** the "draw every dependency" checkbox (a tangle of lines nobody can read), and
  the "Shipped in the last month" filter, which repeated the "Became real in the last month"
  box.
- **Status is now a dot with a legend** (exists, being built, planned, only an idea) instead
  of an unexplained background tint.

**Screens** (goals 2 and 3)
- **Each place shows six pictures**, with "Show all 36" on the right. A question pill shows
  only the matching screens, plus a one-line note with the full question and how many
  screens match.
- **The question pills are short** ("Permissions", "Talks to the AI"). The full question
  shows on hover.
- **Each tile shows its name once, in plain words**, plus the one-sentence description where
  there is one. Badges read "26 variations" (instead of "26 states") and "being changed".
- **"Building blocks" is folded at the bottom** (a first draft awaiting your answers).

**Feel native to YouCoded** (goal 1)
- **The main tabs work like the app's own Projects / Marketplace header** (G-16), with
  counts in the app's style ("Screens 158", G-19).
- **The disclaimer banner is now a small "Draft ⓘ" tag** next to the title; its full text
  shows on hover. Nothing was cut from it.
- **Small grey capital labels head each section** (G-7, the app's only section-header
  style). Filter pills use the app's filter-chip shape (G-14), and fold-open rows have their
  arrow on the right (G-29).
- **Buttons follow G-4:** one outlined button and the rest text-only in each row, actions
  on the right (G-28).
- **The side panel has the app's side-pane shape** (§4.5): title and ✕ at the top, a body
  that scrolls, buttons bottom-right. Esc closes it.
- **Theme colours only**, checked in Light, Dark, Midnight and Creme. At phone width the
  page becomes one column, and the filter pills scroll sideways instead of wrapping.

No facts were removed. Buttons still only say what they would do.

## What I'd change next but didn't

- **Fold chores into one "Housekeeping" row.** The unsaved worktrees and dependency updates
  are maintenance, not decisions.
- **Big picture area cards don't say what's next for each area.** A one-line "next up:
  …" would make each card worth reading, but the evidence files don't choose one per area,
  and I didn't want to make one up.
- **Screen names are still the screenshot tool's names** ("Add", "How", "Handle prompt").
  Several mean nothing without their place. They need real names written once, which is a
  data job, not a layout one.
- **The phone header scrolls sideways** instead of collapsing into a menu as the guide asks
  (§4.8).
- **"Overlaps" (Big picture) and "Building blocks" (Screens) answer nearly the same
  question:** where is the same thing built twice? Eventually they should become one view.

## Questions only you can answer

1. **Does Today belong first?** I moved it first because you'd open this at the start of a
   session.
2. **Is a single "Start here" recommendation helpful, or presumptuous?** The alternative is
   "Needs you" first and the suggestion second.
3. **Should chores (worktrees, dependency updates) appear at all,** or just happen on their
   own with a line saying so?
4. **For Big picture, are these ten areas the right top level?** They come from your words.
   You said earlier that five goals was the wrong grouping and you wanted to talk it through.
5. **Do you want the dependency lines at all,** or only the written "Needs first / Needed
   by" lists in the side panel?
