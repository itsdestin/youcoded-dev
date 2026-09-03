---
status: settled
updated: 2026-08-31
date: 2026-08-31
tags: [games, arcade, review, decisions]
spec: docs/archive/specs/2026-08-30-games-arcade-design.md
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

---

## D-11 — chess.js, pinned exact (2026-08-31)

**Destin:** *"chess is good to pull in external rules library."*

The alternative offered was hand-writing the rules: no third-party dependency,
but realistically a week and guaranteed edge-case bugs — castling out of check,
en passant, threefold repetition — that only surface when a friend hits them
mid-game. `chess.js@1.4.0` is pinned exact (`--save-exact`, not a `^` range) so
it cannot move under him.

**Why this is worth writing down:** an illegal-move bug is the most visible way
this project could embarrass itself. If a future session is tempted to drop the
dependency and hand-roll, this is the decision it would be reversing.

## D-12 — the versus tiles read presence, not a server field (2026-08-31)

Not Destin's call — a defect found while wiring the backend, recorded because
the surprising part is worth remembering.

"Who is online" was being served by the arcade's *status* fixture. The workbench
therefore showed "Jake is online" forever, while the shipped app had no presence
data on that channel and never would: outside the workbench every versus tile
would have said "No friends online" permanently. It now reads
`state.onlineUsers`, the live lobby list, and the workbench's degraded scenario
pushes a real `error` presence frame instead of a hardcoded string.

**The rule this yields:** when a screen's fact has a live source, the mock must
fake the LIVE SOURCE, not the screen's answer. A mock that fakes the answer will
show the healthy state forever and prove nothing.

## D-13 — the board's squares go to full strength, neutral (2026-08-31, SETTLED)

**Destin picked `contrast` from the `board-contrast` deck** — full strength,
built from the theme's text colour rather than its accent.

**This started as a taste question and turned out to be a bug.** The board said
`bg-inset bg-accent/[0.07]` — two background utilities on one element. They do
not blend; one wins. So the intended tint never painted, and the two squares
were the raw surface values one depth-ladder rung apart: measured #D7D7D7 vs
#F9F9F9 in light and #222222 vs #1C1C1C in dark. Square-to-square contrast was
1.05–1.40 where a physical board is nearer 2.5–3, which made a bishop's colour
unreadable in three of the six themes. The design that was signed off is not the
design that rendered.

**What shipped**, measured on the default path in all six themes:
creme 2.01 · light 2.16 · meadow-mist 2.24 · midnight 2.51 · dark 2.77 ·
halftone-dimension 2.97.

**Why neutral beat the prettier option.** `wood` takes the theme's own accent
and looks markedly better in four themes — creme becomes a cream-and-brown board
that reads like real wood. But it depends on a colour a THEME AUTHOR chose: pure
accent measured 1.40 on halftone-dimension and 1.44 on meadow-mist, whose
accents sit close to their own surfaces, and even blended toward `--fg` it only
reached 1.80. `contrast` is built from `--fg`, which contrasts with its own
surface by definition or the theme would be unreadable — so it cannot be
defeated by a community theme nobody has reviewed, and those ship constantly.
The rejected three stay behind `?board=`, because every future board-shaped game
asks this same question.

The a–h / 1–8 coordinates moved off `fg-faint` in the same change (2.01 → 3.96);
they would have vanished entirely on a stronger square.

**The lesson, and where it now lives.** A background that loses to another
background is invisible at every gate we own — it type-checks, lints, renders,
and passes a component test; you get a background, just not the one requested.
So this became a tree-wide pinning test rather than a note:
`desktop/tests/background-layer-authority.test.ts` fails the build on two
unprefixed `bg-*` utilities in one class string, allows state variants like
`hover:bg-*`, and self-checks against the real offending string so it cannot
read green while matching nothing.

**A second tool bug fell out of it.** `contrast.md` was reporting the
coordinates' OLD colour after they had been fixed — pixels proved the fix, the
report disagreed. Cause: `scripts/ui-review/contrast-report.mjs` unioned EVERY
manifest in an output directory, including runs superseded minutes earlier, with
no recency filter (the deck's crop resolver already had one). Fixed to take the
newest manifest per theme and surface. Worth knowing because that report is
meant to be trusted: before the fix it could tell a session its fix had failed.

## D-14 — head-to-head records ship; the record reads "4W - 2L" in a badge (2026-08-31)

**Deck `head-to-head`: both steps yes.** The score shows on each friend's row in
the lobby, and on the card at the end of a match. Destin's note on H-1: *"put in
a pill, 4W - 2L"*.

**He was right about the wording and I had argued the other way.** My first pass
was "4–2", the convention. It relies on the reader knowing YOUR number comes
first — and read backwards it is still a perfectly plausible record, so nothing
tips you off that you have it wrong. "4W - 2L" removes the guess: the letters
are not notation to learn, they are the labels themselves.

**"Pill" became a badge, deliberately.** `rounded-sm`, not `rounded-full`: the
guide (G-3) reserves the fully-round shape for the send/stop circle, avatars,
toggles and the pill-shaped FILTER chips — all things you click. A round static
label reads as a button that does nothing. Worth stating because it is a visible
departure from the word he used.

**Three things that made this a day rather than an hour**, all recorded so a
future session does not re-derive them:

1. The app knew the opponent's DISPLAY NAME, never their account. Two friends
   with the same display name would have shared one record. Both players know
   the account but by different routes (challenger knows who they challenged;
   accepter knows who challenged them).
2. **A rematch reuses the room.** Verified, not assumed. With the room code as
   the match identity, the second game would have reached the server looking
   like a duplicate and been silently discarded — you would win twice and see
   one win.
3. Two workbench surfaces were UNREACHABLE, which is how they stayed unexamined:
   autoplay fires the moment presence connects (so the friend list could not be
   photographed while signed in), and the fake opponent plays randomly (so no
   fixed click sequence could finish a game, leaving the entire end-of-match
   card unphotographed). `?autoplay=0` and `?bot=passive` fix both.

**The rule the third one yields, and it is the same shape as D-12:** a surface
that cannot be captured is a surface nobody reviews. When a state is only
reachable through timing or chance, add the switch that makes it reachable —
otherwise it is reviewed once, by hand, and never again.
