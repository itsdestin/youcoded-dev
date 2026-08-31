---
status: settled
date: 2026-08-31
tags: [games, arcade, review, decisions]
spec: docs/active/specs/2026-08-30-games-arcade-design.md
---

# Games arcade — Step 1 decision ledger

What Destin approved, in the two review decks of 2026-08-30/31. This is the
record: the first deck's server was killed before it wrote its answers file, so
these were captured from his reply in session. The second deck's answers file
survives at `step1-sizing.answers.json`.

Branch: `feat/games-arcade-shell`, commit `3623bcd5`. Nothing merged or pushed.

## Deck 1 — the shell (`step1-review.json`)

7 yes · 0 no · 1 pick.

| # | Decision | Verdict |
|---|---|---|
| G-1 | The toolbar button opens a four-game picker; every card carries the one fact that decides whether you open it | approved |
| G-2 | Solo games play signed out; the old sign-in wall is reversed | approved |
| G-3 | A brand-new install states every card rather than going blank | approved |
| G-4 | A game-server outage dims only the two versus cards; solo keeps working | approved |
| G-5 | Solo leaderboard with your row accent-filled, column labelled with the game's own word | approved |
| G-6 | "You, alone" renders a real ranked row plus an invitation, never a "no data" panel | approved |
| G-7 | Connect 4 rethemed off red/yellow/blue | approved, **with a sizing complaint** — "this sizing is also kinda jank… it just sits in the panel funny" |
| G-8 | Chess piece treatment | **picked `outline`** |

### G-8 in full — why this one existed

The spec (§5.5) argued that fill alone would separate the players, because chat
already tells you from the assistant that way. Built and screenshotted, it
**failed**: in the dark theme your pieces (`accent`, `#D4D4D4`) and your
opponent's (`fg-muted`, `#898989`) sit adjacent in one grid and are not tellable
apart. The spec's argument missed that chat also has **position** — your
messages right, the assistant's left. A board has no second cue.

Three treatments were shown over the same position:

| Option | Outcome |
|---|---|
| `outline` — solid pieces for you, hollow for them | **CHOSEN.** The two sides differ in shape as well as shade, so it survives the four built-in themes whose accent is itself a grey |
| `disc` — your piece on a filled accent circle | rejected: strongest separation but too busy — 16 filled circles at the opening position |
| `fill` — colour only | rejected; this was the failure the step existed to show |

The rejected two stay reachable behind a workbench-only `?chess=` switch, never
as a user setting — one rule per app, or the games stop teaching each other.
**This rule now governs every two-player game we add.**

## Deck 2 — the sizing fix (`step1-sizing.json`)

2 yes · 0 no.

| # | Decision | Verdict |
|---|---|---|
| S-1 | Connect 4 board fills the pane's width at a 7:6 ratio; the chat fills the height beneath it | approved |
| S-2 | Chess in the chosen `outline` treatment, board centred | approved, with a question (below) |

G-7's complaint, diagnosed: the pieces were locked to 36 px regardless of pane
width, so the board sat at 276 px inside a 420 px pane and left ~330 px of dead
space below the chat — and the pane had just become draggable, so dragging
wider would only have added more emptiness. Fixed by making the board
width-driven and letting the chat take the remaining height.

Two things fixed alongside it, both found in the capture rather than by review:

- The empty holes were one step from the board frame on the depth ladder and
  nearly invisible in the dark themes. A hole now reads as the surface *behind*
  the board (`canvas` in an `inset` frame).
- The picker cards and leaderboard rows were `inset` on an `inset` pane — they
  had no visible edge in any of the six themes.

## Open, carried into Step 2

- **The picked-up square is too faint.** Destin, on S-2: *"what are the little
  dots there that arent pieces?"* They are the standard legal-move dots, but
  the selected square's `accent/25` wash does not read strongly enough for the
  dots to have a visible cause. Deliberately NOT fixed in Step 1: a selection
  highlight is a *feedback* cue and cannot be judged honestly on a still of a
  board that is not yet clickable. Re-judge interactively once move input works.
- Chess is vertically centred only because it has no game chat yet. When chat
  lands it goes top-aligned like Connect 4 — the `justify-center` sits on the
  wrapper, not the board, so this is a one-line change.
- `Play` on the solo screens is inert; the games themselves are Step 2.
