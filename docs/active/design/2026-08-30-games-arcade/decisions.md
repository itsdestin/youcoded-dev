---
status: settled
updated: 2026-08-31
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


---

## Decisions taken during Step 2 (2026-08-31)

Not from a deck — these came out of Destin using the dev build, so they are
recorded here rather than in an answers file.

| # | Decision | Why |
|---|---|---|
| D-1 | **The sky is always painted.** §5.1's "the wallpaper is the sky" is deleted, not worked around | The games pane is opaque, so a wallpaper behind the app never reaches the playfield. It produced a blank field on exactly the themes with the best art |
| D-2 | Flappy's sky is a **landscape** — sun, clouds, three hill bands at three speeds | "the art kinda sucks". Blobs and stripes read as a pattern; a horizon reads as a place. The differing speeds are what create distance |
| D-3 | **Every solo game shares one end-of-run screen** (`RunOverCard`) | Destin asked for it for "single-player/high-score games", not just Flappy — and the two had already drifted: Flappy celebrated a new best, 2048 silently did not |
| D-4 | The end card **leads with the score**, not the failure | A high-score game asks you to beat a number, so the number is the headline and the cause is a footnote |
| D-5 | Falling short shows **the best you fell short of** | A target, not a scolding — it is the reason to press again |
| D-6 | **A zero is never an achievement** | "Your best: 0 pipes" is a slightly insulting way of saying nothing |
| D-7 | Flappy retries on **Space**, with a 450 ms lockout on the KEY path only | Destin asked for press-again-to-retry. Without the lockout the tap already in the air when you die restarts instantly and you never see your score. A click is deliberate in a way a held rhythm is not |
| D-8 | 2048 retries on **Enter**, deliberately NOT on the arrows | On a dead board an arrow press is the reflex of someone still trying to move, not a decision to start over |
| D-9 | **A run ending does not end the game** — the shell must not unmount it | The shell's `endRun` called `setPlaying(false)`, so the end card rendered for zero frames. A run ending is the game's moment; leaving is the player's choice |
| D-10 | Best scores **persist to disk**, per game | §4.2 promised it; the first pass kept them in component state and forgot them when the panel closed |

### The two bugs that only playing found

Both had every unit test passing, and both are now guarded by tests that read
SOURCE rather than behaviour — because behaviour tests are precisely what missed
them:

- **The best score never reached the picker or the board.** The workbench always
  had fixture rows loaded, so the empty-board path — the only path that exists in
  the real app today — was never exercised.
- **The end-of-run card never rendered.** The shell threw the game away the
  instant the run ended.

The pattern is the same both times: a state that only occurs in the real app,
never in the workbench. Worth checking for directly rather than waiting to be
told.
