---
date: 2026-10-14
status: draft
type: review
topic: Independent review of the management page's Today tab — where row buttons come from, several conversations on one piece of work, copy, layout
reviewed: docs/active/design/2026-10-12-management-surface/mockup.html (build.py, tooltips.py), screenshot /tmp/claude-1000/today-review/top.png (all folds open, 1440 wide)
---

# Today tab — independent review

## What I found

1. **Buttons come from the section, not from the work's situation.** Every In progress row gets
   "See its screens / Open its conversation / Write its finish line / Set aside"; every Waiting row
   gets "See its screens / Open its conversation / Wrap up", whatever state it is in. Needs you rows
   are hand-written one by one. So a Waiting row whose checks fail (OneDrive files) offers the same
   buttons as one that only needs a look (Model picker).
2. **Five words for "stop or park this":** "Set aside", "Hold", "Wrap up", "Drop it" / "Drop them",
   "Archive". Their hover hints differ in small ways (move to Waiting / leave it / clear the copy /
   give up / file away) that a reader cannot guess from the label.
3. **"Wrap up" means two things.** In Destin's workspace it means "close out a conversation"; here it
   means "check nothing is lost, then clear the copy away" (tooltips.py `today.wrapup`).
4. **No row has a filled main button.** The only filled button is the hero's "Open its review deck".
   The design guide allows one filled button per row in a list of actions; without it, "Put it in
   the app" (a big, final step) looks exactly as weighty as "Hold".
5. **"Open its conversation" is always singular.** The data already shows work with several
   conversations: Helper agents has "Three lines of work" and three leftover copies
   (specialists-plans, -wrapup, -decisions); Project skills has two changes waiting (#571, #203).
   The page cannot show who worked on it, in what order, or whether two are working right now.
6. **The same work appears in more than one place.** "10 unfinished copies with unsaved changes"
   (Needs you) lists copies of Project skills, Helper agents, Model picker and Bundled skill content,
   which also have their own rows (hero, Waiting). Fixing one row does not visibly change the other.
7. **Sections sort by "days since touched", not by what to do.** In progress = touched ≤7 days;
   Waiting = everything older, including "Paused on purpose" (OneDrive) and "nothing built yet"
   (Offline use). "Only one says why" is a complaint about the data, not help.
8. **Housekeeping sits beside product decisions.** Seven failing automatic updates and ten unsaved
   copies sit in Needs you next to "Sync safety"; notes-only copies sit inside Waiting; "Reports from
   other people" takes a heading to say there are none.
9. **Copy repeats itself.** OneDrive says paused twice ("Paused on purpose… A hand-off note says where
   it stopped." then "Waiting on: Known regressions; paused with a handoff"). Dates are written three
   ways ("Untouched 31 days", "31 days ago", "Last touched 37 days ago"). The meta line ends in a bare
   "both".
10. **"See its screens" silently vanishes** on rows with no screens (flaky test, Faster type checks),
    so button columns shift row to row and the buttons do not line up.

## Proposals

### P1 — Every row's buttons come from one short list of states

- **Today:** Buttons depend on which section a row sits in (In progress gets "Write its finish line",
  Waiting gets "Wrap up") or are hand-picked (Needs you). Nothing on the page says why.
- **Problem:** Destin can't predict what a row will offer or trust that the offer fits the situation;
  two rows in the same situation can offer different things.
- **Proposal:** Each piece of work has exactly one state, shown as a tinted pill beside its title.
  The state picks one filled main button (right end of the row); every row also has an outlined
  "Open" and a "⋯" menu holding the rarely used actions. The state's hover hint says what it means and
  why that button is offered.

  | State (pill) | Means | Filled main button | In "⋯" |
  |---|---|---|---|
  | **No finish line** (grey) | Nobody wrote down when it counts as done | Write finish line | Pause…, Close… |
  | **Working** (blue, live dot) | A conversation is working on it right now | Watch | Pause…, Close… |
  | **Needs your look** (amber) | Pictures are ready for you to approve | Review | Pause…, Close… |
  | **Checks failing** (red) | The automatic checks fail | Fix it | Pause…, Close… |
  | **Ready to add** (green) | Approved and checks pass | Add to the app | Pause…, Close… |
  | **Paused** (grey) | Stopped on purpose, with a reason | Resume | Close… |
  | **Idle** (grey) | Untouched 14+ days, no reason given | Continue | Pause…, Close… |

  ```
  Sync safety: backup choice fix  [Ready to add]          Open  ⋯  [Add to the app]
  Approved Sept 9; checks pass. Never added.                       #118 · Sync · 1 chat · Sept 11
  ```
- **Options:**
  1. *State table above (recommended).* Pro: same situation → same button everywhere; a hover on the
     pill explains the button. Con: a row that is in two situations (needs a look and checks fail)
     shows only the more urgent one.
  2. *Keep sections, standardise buttons per section.* Pro: smallest change. Con: still wrong for
     mixed rows like OneDrive; the "why these buttons" question stays.
  3. *No buttons on rows; click a row to open a detail panel with all actions.* Pro: calmest list.
     Con: one more click for every action, and the list stops telling you what to do.
- **Recommendation:** Option 1. It answers "where do these buttons come from" with one sentence:
  *the pill decides the button.* The order of urgency when two apply: Checks failing → Needs your
  look → Ready to add → No finish line → Working → Idle → Paused.

### P2 — Two words for stopping work: "Pause…" and "Close…"

- **Today:** "Set aside", "Hold", "Wrap up", "Drop it", "Drop them", "Archive" — six labels, each with
  a slightly different hover hint.
- **Problem:** Destin has to hover each one to learn whether it deletes anything; "Wrap up" collides
  with his everyday word for ending a conversation.
- **Proposal:** Only two, both in the "⋯" menu. **Pause…** — "Keep it, stop showing it as active. Asks
  you why." **Close…** — "Stop this work. Nothing is erased; its unsaved changes are saved first.
  Asks you why." Both ask one question and the answer becomes the row's "Why paused" line.
- **Options:**
  1. *Pause… / Close… in the "⋯" menu (recommended).* Pro: two meanings, two words; nothing final sits
     one click from the list. Con: one extra click.
  2. *Same two words as visible outlined buttons.* Pro: no hidden menu. Con: every row grows to three
     or four buttons again.
  3. *Keep current words, fix hover hints only.* Pro: no layout change. Con: the confusion is in the
     labels, which hints do not fix.
- **Recommendation:** Option 1.

### P3 — Show every conversation that worked on a piece of work, and let him join one

- **Today:** One button, "Open its conversation", as if each piece of work had exactly one chat.
- **Problem:** Work like Helper agents had three conversations over time (plan, decisions, wrap-up),
  and two can run at once. Destin can't see who did what, which is still running, or join the right
  one — and a new chat may start the same work again from scratch.
- **Proposal:** Each row is one **work card** (the draft work-cards plan: one card, one numbered
  separate copy of the work, done when that copy goes into the app). The row's chip line shows
  "3 chats · 1 working now". "Open" expands the row into a short timeline of its conversations,
  newest first, each with its own live pill and a one-line result; the card's progress note
  (done / next / blocked) sits on top.

  ```
  #142 Project skills & tools  [Needs your look]                 Open  ⋯  [Review]
  Next: approve the project screens. Blocked: nothing.       #142 · Projects · 3 chats · Sept 24
  ┌ Conversations ────────────────────────────────────────────────────────────────┐
  │ [Working] Fix the marketplace list         started 10 min ago      Open chat  │
  │ Sept 24   Screens drawn, review deck made  "4 of 6 approved"       Open chat  │
  │ Sept 19   First plan and questions          "answers recorded"      Open chat  │
  │                                         Start another chat on this card        │
  └────────────────────────────────────────────────────────────────────────────────┘
  ```
  "Start another chat on this card" opens a new conversation already given the card's finish line and
  progress note. When any new chat is about to begin work that matches an open card, it says "This is
  already card #142 — join it?" instead of starting a duplicate.
- **Options:**
  1. *Card row with a conversations timeline (recommended).* Pro: sequential and simultaneous work
     both read naturally; a live pill shows what is running; joining is one click. Con: depends on the
     work-cards plan being built first; until then the page can only guess which chats belong together.
  2. *"Open its conversation" becomes a small menu listing the chats.* Pro: tiny change, no new layout.
     Con: no order, no results, no sign of what is running now.
  3. *A separate "Conversations" section listing all chats, each tagged with its card.* Pro: shows
     everything running at once. Con: the same work appears twice again (the problem in finding 6).
- **Recommendation:** Option 1, with option 2 as the stop-gap until cards exist. Show "1 working now"
  only from a live signal, never a guess.

### P4 — Reorganise Today by what needs doing, not by how long ago

- **Today:** Hero → Needs you (4) → In progress (touched ≤7 days) → Waiting (12, folded, everything
  older, with notes-only rows inside) → Bugs → Since the last release.
- **Problem:** Paused-on-purpose work, never-started work and stale work all land in one folded
  "Waiting" pile; product decisions sit next to clean-up chores.
- **Proposal:** Four groups, each a list of cards whose pill decides its place:

  ```
  Start here          one suggested card (unchanged idea, P7)
  Needs you      3    Needs your look · Ready to add · Checks failing
  Being worked on 2   Working · touched this week
  Everything else 13  ▸ folded: Idle, No finish line, Paused (paused last, with their reason)
  Tidy up         4   ▸ folded: failing automatic updates, unsaved copies with no card, notes-only copies
  Bugs users hit  6   ▸ folded (unchanged)
  Since the last release ▸ folded (unchanged)
  ```
  The 10 unsaved copies are no longer one row: each copy that belongs to a card shows as a pill on that
  card ("Unsaved changes"); only copies with no card go to Tidy up. "Reports from other people"
  appears only when there is an open report (as a Needs you row).
- **Options:**
  1. *Group by state (recommended).* Pro: the top of the page is exactly what needs Destin; clean-up
     never competes with product work. Con: a row may jump groups when its state changes, which can
     surprise.
  2. *Keep the current groups, move only housekeeping to Tidy up.* Pro: smaller change. Con: the
     Waiting pile still mixes paused, stale and never-started work.
  3. *One flat list sorted by urgency, with filter pills by state.* Pro: one place to look. Con: long,
     and the "what needs me" list is no longer visibly separate.
- **Recommendation:** Option 1.

### P5 — One row layout for every card

- **Today:** Rows vary: title + one hint (Needs you), title + hint + "Lands in … · changes what you
  see" (In progress), plus a picture only on some rows; "See its screens" appears on some rows only.
- **Problem:** The eye has to re-learn each row; buttons don't line up; "both" alone means nothing.
- **Proposal:** Guide's card text order: **title + state pill** on line 1; **one line** "Next: …" or
  "Paused because: …"; a **chip row** (card number · area tags · "3 chats" · "Unsaved changes" if any);
  **date at bottom right**. Buttons always in the same order at the right: Open · ⋯ · filled main.
  The screens picture moves into "Open" (with "See its screens" there), so every row is the same
  height. "Changes what you see / how it works" becomes a chip: "On screen" / "Behind the scenes".
- **Options:**
  1. *Fixed row anatomy, picture inside Open (recommended).* Pro: scannable, buttons line up. Con: you
     lose the at-a-glance thumbnail on the list.
  2. *Same, but keep a small thumbnail on rows that change screens.* Pro: keeps the picture. Con: rows
     of two heights again.
- **Recommendation:** Option 1; the hero keeps its picture.

### P6 — Plainer, shorter words (before → after)

- **Today / Problem:** Several lines explain the data instead of the work, repeat themselves, or use
  three date styles. Destin reads more to learn less.
- **Proposal:**

  | Before | After |
  |---|---|
  | Sync safety: backup-target selection fix | Sync: picks the right backup place |
  | Reviewed and passing its checks on Sept 9, but never put in the app. Untouched 31 days. | Approved Sept 9; checks pass. Never added. |
  | Sync: acknowledge retry attempts | Sync: says when it tries again |
  | Waiting for review since Sept 8; its automatic checks fail. Nobody has looked. | Checks fail. Waiting for a look since Sept 8. |
  | 7 automatic updates to code the app borrows, all failing their checks | 7 automatic updates fail their checks |
  | 10 unfinished copies with unsaved changes, untouched for two weeks or more | (removed — becomes "Unsaved changes" pills on each card, P4) |
  | Put it in the app | Add to the app |
  | Fix the failing checks | Fix it |
  | Apply all seven and check them | Try all seven |
  | Write its finish line | Write finish line |
  | Open its conversation | Open (then a chat list, P3) |
  | Touched in the last 7 days. Neither has a finish line yet. | Worked on this week. |
  | Untouched for a week or more. Only one says why. | Idle, not started, or paused. |
  | Only you can decide these. | (keep) |
  | Other options: the two in-progress items below, or anything in Waiting. | (remove) |
  | Paused on purpose… Waiting on: Known regressions; paused with a handoff | Paused because: known problems; a hand-off note says where it stopped. |
  | Lands in Marketplace · Projects · Chat · Social · changes what you see | Chips: Marketplace · Projects · Chat · Social · On screen |
  | "31 days ago" / "Untouched 31 days" / "Last touched 37 days ago" | One date, bottom right: "Sept 11" (hover: "31 days ago") |

- **Options:**
  1. *Apply the whole table (recommended).* Pro: about a third fewer words, one date style. Con: short
     titles drop some detail; the hover hint carries it.
  2. *Only fix repeats and dates.* Pro: titles stay recognisable to the people who named the work.
     Con: long titles still wrap and push buttons down.
- **Recommendation:** Option 1. Titles should come from the card's own name once cards exist.

### P7 — The "Start here" card follows the same rule as the rows

- **Today:** The hero offers "Set aside", "Open its conversation" and a filled "Open its review deck",
  then a "Why this one" fold and an "Other options" line.
- **Problem:** Its buttons are a third, separate set; the suggested work then disappears from the list
  below, so if Destin sets it aside he can't see where it went.
- **Proposal:** The hero is simply the top card, drawn large: same pill ("Needs your look"), same main
  button ("Review", filled — the page's one filled button outside the lists), same Open and "⋯". Keep
  "Why this one". Remove "Other options". Its row in Needs you shows a quiet "Suggested above" chip
  instead of disappearing.
- **Options:**
  1. *Hero = top card, same buttons (recommended).* Pro: one rule everywhere; nothing vanishes. Con:
     the card appears twice (large and as a one-line row).
  2. *Drop the hero; the first Needs you row gets a "Suggested" chip.* Pro: no repeat at all, shorter
     page. Con: loses the picture and the "why" that made the page feel calm on opening.
- **Recommendation:** Option 1; the one-line row is a pointer, not a second copy of the details.

### P8 — Say on the page how the buttons are chosen

- **Today:** Nothing explains why a row offers what it offers; hover hints describe each button
  alone.
- **Problem:** Destin's first question — "where do these come from, why do they differ" — has no
  answer on the page itself.
- **Proposal:** Each state pill's hover reads "**Needs your look** — pictures are ready to approve.
  That's why this row offers Review." Under the Needs you heading, a single muted line: "The coloured
  label on each row decides its main button." A disabled main button says why next to it (guide rule),
  e.g. "Add to the app — waiting for checks to finish".
- **Options:**
  1. *Pill hover + one heading line (recommended).* Pro: the rule is discoverable where it applies.
     Con: one more line of text.
  2. *A "How this page works" fold at the top.* Pro: full explanation once. Con: few read it, and it
     grows stale.
- **Recommendation:** Option 1.

## What I would NOT change

- Opening on Today with one suggested next step and a "Why this one" fold.
- Folding the long lists (Bugs, Since the last release) with a count.
- Hover hints on every control, kept in one file (tooltips.py), and the click toast reusing them.
- "Nothing is erased from the history" reassurance on every stopping action.
- Plain-word replacements already made ("automatic checks", "code the app borrows" → now shorter).
- The cross-link from a row to its screens in the Screens tab (moved inside Open, not removed).
