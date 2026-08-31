---
status: draft
date: 2026-08-30
revised: 2026-08-31
step2: chess + scores landed — see §12
decisions: docs/active/design/2026-08-30-games-arcade/decisions.md
tags: [games, arcade, social, leaderboard, themes, mascot, partykit, worker]
review: docs/active/investigations/2026-08-30-games-arcade-spec-review.md
---

# Games arcade — design (2026-08-30)

Turn the Connect 4 panel into a four-game arcade: **Connect 4, Chess, Flappy, 2048**, all
themed like the rest of the app, with friend leaderboards for the solo games and
head-to-head records for the competitive ones.

> **Revision note (2026-08-30).** This version incorporates the review in
> `docs/active/investigations/2026-08-30-games-arcade-spec-review.md`, which re-checked
> every claim against `youcoded@5018a00d`. The substantive changes: §6.2's result handoff
> is redesigned (the original had a blocker — PartyKit never learns account ids), §3 now
> names the shared game state as the primary breaking change, §4.3 commits to a separate
> remembered width, §9 is answered and became §7.

## 1. Where we're starting from

Verified against `master` (`5018a00d`) on 2026-08-30. These are load-bearing facts, not
background:

- **There is one game.** `renderer/components/game/` holds `GamePanel.tsx` (60),
  `GameLobby.tsx` (722), `ConnectFourBoard.tsx` (140), `GameChat.tsx` (87),
  `GameOverlay.tsx` (77), `friends-data.ts` (64). Rules in `renderer/game/connect-four.ts`
  (75, optimistic client copy) and `desktop/partykit/src/connect-four-room.ts` (83,
  authoritative).
- **There is no game registry, manifest, or per-game interface.** The nearest things are a
  hardcoded party name in `desktop/partykit/partykit.json` (`"connectfour"`) and a
  `gameType` string on challenge messages that **nothing ever dispatches on**
  (`game-types.ts:71`, `usePresence.ts:131/164/169`, `usePartyGame.ts:18`,
  `lobby-room.ts:106`). `GameConnection` is Connect-4-shaped — its move method is
  `makeMove(column: number)`.
- **The game state itself is Connect-4-shaped, and the whole shell reads it.**
  `GameState` (`game-types.ts:20-47`) carries `myColor: 'red' | 'yellow'`,
  `board: number[][]`, `turn`, `lastMove: { col, row }`, `winner: PlayerColor | 'draw'`,
  and `winLine: [number, number][]`. This, not `GameConnection`, is the biggest thing in
  the way (§3).
- **The only way into a game is challenging a friend.** Room codes were removed 2026-07-09
  (`usePartyGame.ts:190`). There is no solo path and no computer opponent anywhere in the app.
- **Nothing about a game is ever persisted.** No scores, wins, losses, or streaks. The sole
  persisted game value is the incognito flag, in `~/.claude/youcoded-favorites.json`
  (`main.ts:1538-1547`) — note `~/.claude`, not `~/.youcoded`.
- **Multiplayer is real and split across two services.** PartyKit
  (`youcoded-games.itsdestin.partykit.dev`) referees the board; the marketplace Worker's
  `presence-room.ts` Durable Object holds friends-only presence and relays challenges. The
  Electron main process owns the presence socket (`main/presence-socket.ts`) so the renderer
  never sees the token.
- **PartyKit knows display names; the Worker knows accounts.** `connectToRoom(code,
  playerName)` tags players by display name, and `game-types.ts:4-5` records that display
  names aren't unique. Everything on the Worker — friends, presence, D1 — is keyed by
  account id. The two services have no shared identity, no shared secret, and the rooms
  make no outbound calls at all. This shapes §6.2.
- **The game pane is hardcoded to 400px** (`App.tsx:2888`) while the artifact drawer beside
  it is user-resizable 320px–60% of window with the width remembered
  (`state/drawer-width.ts`). The game pane opts out of machinery that already works.
- **Connect 4 is theme-blind, and so are two components that look game-agnostic.**
  `ConnectFourBoard.tsx:102-126` uses raw Tailwind `bg-red-600` / `bg-yellow-500` /
  `bg-blue-600/50`. `GameOverlay.tsx:27` branches on `winner === 'red'` and renders
  "You Win!"; `GameChat.tsx:36-40` colors each speaker by `state.myColor === 'red'`.
  Identical in all 11 themes.
- **Android has no games.** Two stub responders in `SessionService.kt:1238-1243` —
  `game:getIncognito` returns hardcoded `false`, `game:setIncognito` discards the value.
- **The mascot rig is unused by games**, and is far more capable than a picture (§5).

## 2. Scope

**In:** the game slot (§3), the arcade shell (§4), three new games (§5), Connect 4
retrofitted and rethemed (§5.4), solo score leaderboards and head-to-head records (§6),
a resizable game pane (§4.3).

**Out, deliberately:**

| Not doing | Why |
|---|---|
| Real-time networked games (Pong) | Needs prediction/reconciliation netcode the existing services can't do; feels bad done cheaply. Turn-based only. |
| Computer opponents | Decided against. Competitive games stay friends-only, consistent with today. |
| Android games | Android has none today; wiring the bridge is a separate project and would roughly double this one. Follow-up — but see §8 for the parity stubs this still forces. |
| New theme tokens for games | Games use the app's existing tokens (§5.5). Nothing for theme authors to do. |
| Anti-cheat on solo scores | Scores are client-reported and forgeable. Accepted for a friends-only board (§6.4). |
| Any new behavior when the assistant finishes | Decided: the existing chime and status light are the only signals (§7). |

## 3. The game slot

The single highest-value artifact here. Adding a second game today means editing ~8 files;
after this, adding one means writing one module and registering it.

A game declares what it is and how it is played:

```ts
export type GameKind = 'solo' | 'versus';

export interface GameDefinition<Move = unknown, State = unknown> {
  id: string;                   // 'connect-four' | 'chess' | 'flappy' | 'twenty-forty-eight'
  name: string;                 // shown in the picker and the challenge
  kind: GameKind;
  /** Picker tile art. Theme-token only — no game ships its own palette (§5.5). */
  Tile: React.ComponentType;
  /** The board/playfield. Solo games get `onEnd(score)`; versus games get the connection. */
  View: React.ComponentType<GameViewProps<Move, State>>;
  /** Default pane width; the user's resize wins and is remembered per game (§4.3). */
  defaultPaneWidth: number;
  /** Solo games only: how a run's result becomes a leaderboard number. */
  scoring?: { label: string; higherIsBetter: boolean };
  /** Versus games only: the PartyKit party that referees it. NOT the same string as
   *  `id` — the shipped wire value is 'connect-four' while the party is 'connectfour'
   *  (`partykit.json`). Keeping these separate fields preserves that without a migration. */
  party?: string;
  /** Versus games only: how the room's end-of-game state names a winner, for §6.2. */
  outcomeOf?: (state: State) => { winnerSeat: 0 | 1 } | { draw: true } | null;
}
```

A game is therefore one module exporting one definition, plus its registration. Nothing
outside the registry knows a game's name, rules, or shape.

### 3.1 The breaking changes, in order of size

**1. The shared game state splits in two.** This is the largest piece of work in the
project. Today one `GameState` holds both shell concerns (connection, presence, opponent,
chat, challenges, panel open) and Connect 4 concerns (`board`, `myColor`, `turn`,
`lastMove`, `winner`, `winLine`). Chess has no `winLine`; 2048 has no `turn`; Flappy has
no opponent at all. The split: **the shell owns shell state; each game owns its own state
opaquely**, exposed to the shell only through `outcomeOf`. Every component in §4.4 is
touched by this.

**2. `GameConnection` stops being Connect-4-shaped.** `makeMove(column: number)` becomes
`makeMove(move: Move)` — a chess move is not a column number. `joinGame(code: string)`
also gains a game argument, because the accepting client must know which party to connect
to.

**3. `gameType` finally gets read — in four places, not two.** The challenge already
carries it over the wire, but it is dropped on arrival:

| Step | Where | Status |
|---|---|---|
| Sent | `usePartyGame.ts:286` | hardcoded `'connect-four'` |
| Relayed | `lobby-room.ts:106` | already correct |
| Received | `usePresence.ts:131` | already correct |
| **Stored** | `game-reducer.ts:184-193` | **drops it** — stores `challengeCode`, not the game |
| **Used** | `GameLobby.tsx:391` | **`joinGame(state.challengeCode!)`** — no game argument |

So the reducer gains a field and `joinGame` gains an argument. Small, but it lands in two
files §4.4 otherwise treats as stable.

Solo games touch none of this. They are a local loop plus a score submission, which is why
they can be built entirely in parallel with the versus work.

## 4. The arcade shell

### 4.1 Entry

The toolbar button stops saying "Connect 4" and becomes a games button (`HeaderBar.tsx:548`,
`OverflowMenu.tsx:112-115`). It opens a picker of four games. Each tile carries the one fact
that decides whether you click it:

- solo games — your best score
- versus games — which friends are online who could play it now

The panel answers "is there anything to do here?" before you click anything.

### 4.2 Sign-in

**Solo games play signed out.** Best scores persist locally; signing in publishes them to
the leaderboard. Nothing is lost by staying signed out except the ranking.

This reverses the current panel, which gates everything behind sign-in (`GameLobby.tsx`).
Requiring an account before someone can play Flappy is the friction that gets a panel closed
permanently.

Versus games keep the sign-in gate — they cannot work without an identity and a friend.

**The same rule covers outages.** If the Worker is unreachable, solo games still play and
the score is kept locally to publish later. The leaderboard being down never blocks play —
that is the whole argument above, applied to a second failure mode (§6.6).

### 4.3 The pane

The game pane becomes user-resizable on the same 320px–60%-of-window clamp as the artifact
drawer, **with its own remembered width — the artifact drawer's width is not touched.**

This is a deliberate choice, not the cheapest path. `drawer-width.ts` today is a single
global width: one storage key (`'youcoded-drawer-width'`), one CSS variable
(`--drawer-width` on `<html>`), state owned by ThemeProvider, and a drag handle living
inside `SessionDrawer.tsx:743-758`. Reusing it as-is would mean **resizing the chess board
also resizes your document drawer** — a change in a panel the user wasn't looking at, which
is exactly the kind of untraceable side effect that costs trust.

So: generalize `drawer-width.ts` to take a storage key, add a second CSS variable, and give
the game pane its own drag handle. Roughly 40 lines. Then per-game defaults mean one
remembered width per game, which is what this section actually promises.

Chess at 400px is ~50px squares — playable but cramped, and bad on touch, which is why the
fixed width has to go at all.

### 4.4 What survives, and what only looks like it does

**Genuinely game-agnostic, carries over unchanged:** the challenge banners, the friends
list, incognito, and the reconnect/supersede handling.

**Looks agnostic, isn't:**

- `GameOverlay.tsx` branches on `winner === 'red'` and renders "You Win!" / "You Lose!" —
  wrong for a solo game, whose ending is a score, not a verdict. It becomes two overlays,
  or one that takes its headline from the game.
- `GameChat.tsx` colors each speaker by `state.myColor === 'red'` (lines 36-40). It needs
  a seat concept instead of a Connect 4 color.

`GameLobby.tsx` (722 lines) is still the file that must be split: its sign-in, friends, and
error screens are shell; its Connect 4 assumptions are not.

## 5. The games

### 5.1 Flappy (solo)

The showcase. The theme's mascot flies; pipes and ground are theme surfaces.

**CORRECTED 2026-08-31 — the sky is always painted.** This section used to say
"where the theme ships a wallpaper, that is the sky", and it was built that way. It does not
work: the games pane is an **opaque panel**, so a wallpaper behind the app can never reach
the playfield. The result was an empty field on exactly the themes with the best art — Meadow
Mist renders a mountain range inches from what was a blank rectangle. Flappy now always paints
its own landscape (a sun, clouds, and three bands of rolling hills at three speeds), built from
the theme's accent mixed into the theme's own surfaces, so it still inherits every pack.

The mascot rig supports this directly. It is a named-part SVG with per-part pivots and
per-part rotation, driven by an underdamped spring, with velocity-trailing limbs and
existing `shocked` and `dizzy` faces. A flap rotates the arm parts; falling feeds the
existing trailing motion; `shocked` on impact, `dizzy` on death. Pitch rotates the host
element, since the rig renders into a 100%×100% container and exposes no whole-body
rotation of its own.

Add a `flap` entry to the shared `POSES` table rather than a bespoke animation path. Poses
are the intended extension point and **apply to every existing rig, including ones
published later, with no work from theme authors.**

*(Mechanics — spring parameters, `dragTargets`, `motionRef`, the exact transform site —
belong in the implementation plan, not here. Nothing in §7 Step 1 depends on them.)*

**Two gaps to handle:** only `rig-body` is guaranteed by the authoring contract
(`docs/theme-spec.md:68`), so a body-only rig has no wings — fall back to
`default-buddy-rig.ts`, which has the full part set. And **4 of the 7 community themes
ship a rig today** (golden-sunbreak, halftone-dimension, kuromi-dreamer, strawberry-kitty);
the other three already fall back to the default character everywhere else in the app.

**Score:** distance / pipes cleared. Higher is better.

### 5.2 2048 (solo)

The game you can actually play while the assistant works — you can stop mid-move, look away,
and lose nothing. Reflex games cannot make that claim, which is why the lineup needs one of
each. Given §7, this is the one that fits the panel's stated purpose best.

Tiles ramp from a neutral surface toward the accent as the value climbs, built with
`color-mix` percentage steps.

**Do not copy `sheet-theme.ts` literally.** Its five constants (`PAPER`, `GUTTER_BG`,
`FBAR_BG`, `TAB_BG`, `GRID`) all mix toward a fixed `#ffffff`, deliberately — the
spreadsheet paper stays light in every theme, like Excel. Copied as-is, a 2048 board is
white-on-white in the dark themes. **The percentage-ramp technique transfers; the endpoints
must be theme surface tokens.**

Adjacent steps need not be sharply distinct: the number on the tile is the information, the
color is reinforcement.

**Score:** points. Higher is better.

### 5.3 Chess (versus)

**Do not hand-write the rules.** Legality, castling, en passant, promotion, check, stalemate,
threefold repetition and the fifty-move rule go to a long-established, heavily tested rules
library. A chess player finds an illegal-move bug in one game; this is the single most
visible correctness surface in the project, and it is somebody else's solved problem.

The work we own is the board, the pieces, move input, and the PartyKit room. The room stays
authoritative — it validates each move with the same library before broadcasting, exactly as
`connect-four-room.ts` does today.

Board squares are two of the theme's four surface shades; pieces are accent-filled versus
neutral (§5.5). Legal-move and check highlights are accent and `--destructive` washes.

Chess needs the widest default pane (§4.3).

### 5.4 Connect 4 (versus, retrofitted)

Moves into the game slot and is rethemed off its hardcoded red/yellow/blue. This is a visible
change to a game already in daily use, so it ships behind a before/after review deck (§7).

### 5.5 Theming — games use the app's tokens, unchanged

Games speak the app's existing design language. **No new tokens, no new theme-format keys,
nothing for theme authors to do.**

The app's answer to "two peers you must tell apart" already exists in chat:

| | Fill | Text | Position |
|---|---|---|---|
| You (`UserMessage.tsx:71-72`) | `bg-accent` | `text-on-accent` | right-aligned |
| Assistant (`AssistantTurnBubble.tsx:480-481`) | `bg-inset` | `text-fg` | left-aligned |

Games use the same **fill** treatment: your pieces accent-filled, your opponent's on a
neutral surface. `on-accent` is computed per theme to be legible on that accent
(`computeOnAccent`, `theme-validator.ts:21`).

**SETTLED 2026-08-31, and the answer is not what this section first assumed.** It was
mocked up and it FAILED: in the dark theme your pieces (`accent`, `#D4D4D4`) and your
opponent's (`fg-muted`, `#898989`) sit adjacent in one grid and are not tellable apart.

The argument from chat was wrong because chat has a second cue a board does not:
**position**. Your bubbles are right-aligned, the assistant's left — fill is reinforcement
there, not the only signal. On a board both players' pieces sit in the same grid.

**The rule for every two-player game is therefore: the two sides must differ in SHAPE, not
only in shade.** (Generalised 2026-08-31: any surface where two things sit in ONE grid with no
positional difference needs a second cue. Chat is exempt because it has position; a board is not.) Chess ships the traditional solid-for-you / hollow-for-them pieces
(Destin's pick from three treatments, deck step G-8). Connect 4 keeps accent-vs-neutral
discs because there the two sides *also* differ by column position and by whose turn the
label names — but a third game must clear the shape bar, not cite Connect 4.

And the accent is neutral in **all four built-in themes**, not three:

| Theme | accent | on-accent |
|---|---|---|
| light | `#1A1A1A` | `#F2F2F2` |
| dark | `#D4D4D4` | `#111111` |
| midnight | `#B1BAC4` | `#0D1117` |
| creme | `#3D3229` | `#F6EEE1` |

Value contrast between `bg-accent` and `bg-inset` was real but **not sufficient on a
board** — which is exactly why this was a Step 1 mockup item across all six themes rather
than an assumption carried into four games. It cost one screenshot to find and would have
cost four games to fix later.

Everything else maps onto tokens that exist: board and square shades from
`canvas / panel / inset / well`, borders from `edge / edge-dim`, five text weights, accent
washes via `color-mix` (used 27 times in `globals.css` already), and `--destructive`
for check and forfeits.

**Two implementation notes:**

- `color-mix` in CSS is fine — it is already used throughout, including in the Android
  WebView (`sheet-theme.ts:5-6`). The `rgba()` at `theme-engine.ts:506` is narrower than it
  looks: it applies to the **computed overlay tokens** written from JS, not to `color-mix`
  generally. Games should not read that line as a ban.
- A game that derives a color in **JavaScript** should use `mixHex()` rather than inventing
  a second path — but note it is currently module-private (`theme-engine.ts:260`) and needs
  exporting first.

## 6. Scores and records

### 6.1 Solo leaderboards

Per game: your best, ranked against your friends' bests. Lives on the marketplace Worker,
which already owns identity, the friends graph (`social/graph.ts`), and D1. New table, new
endpoints, submitted by the client at run end.

### 6.2 Head-to-head records — mutual attestation over the presence socket

Each friend row picks up your running record against them, per game — *you vs Jake, 7–2 at
chess*.

**The obvious design does not work.** "The referee room reports the outcome to the Worker
over an authenticated server-to-server call" runs into a hard blocker: **PartyKit never
learns who the players are.** Rooms tag players by display name (`connectToRoom(code,
playerName)`), display names are not unique by the app's own admission
(`game-types.ts:4-5`), and the Worker keys every record by account id. On top of that the
room files contain no `env`, `secret`, `token` or `fetch` — they make no outbound calls at
all. That path costs four new things, one of which is pushing account identity into the game
referee, which is a privacy decision and not just plumbing.

**Instead: both clients report, and the Worker records only when they agree.**

The Worker's `presence-room` Durable Object already has everything needed. Both players are
connected to it, both authenticated, both keyed by account id, and it already knows they are
in a game together — it relayed the challenge, and it tracks `status: 'idle' | 'in-game'`
(`presence-room.ts:14-18, 151-159`).

So at game end, each client sends its own outcome over its own presence socket. The Worker:

- records the result when **both reports arrive and agree**;
- records **nothing** on disagreement, or when the second report never arrives inside a
  timeout;
- treats a disagreement as a signal worth logging, not a dispute to adjudicate.

Why this is the right trade:

- **No new infrastructure.** No secret in PartyKit, no outbound calls from rooms, no new
  machine-auth endpoint, no account identity leaking into the referee.
- **Forging a win requires both accounts.** That is a far higher bar than the client-reported
  solo scores §6.4 already accepts.
- **The failure mode is benign and already precedented.** "Record nothing" is exactly what
  §6.3 prescribes when both players disconnect.
- **It is additive.** If a true referee report is ever wanted, PartyKit can become a third
  voter later without changing the client contract.

The honest cost: two colluding friends can agree on a lie. Given the board is friends-only —
people who each chose the other — that is an acceptable residue, and the same reasoning §6.4
already applies to solo scores.

This is still the piece most worth designing before building, but it is now a routine
design rather than a cross-service auth project.

### 6.3 Forfeits

Disconnecting and failing to return within the existing reconnect window is a recorded loss.
This is how online chess universally works; the alternative lets players protect a record by
quitting, which makes the record worthless. If both players disconnect, nothing is recorded.

Under §6.2 this needs one addition: the **surviving** client reports the forfeit, and the
Worker accepts a single report *only* when the presence room independently observes the
other player's socket as gone. That is state the DO already holds, so no new signal is
needed — but it must be stated, because it is the one case where two agreeing reports
cannot exist.

### 6.4 Cheating

Solo scores are client-reported and therefore forgeable by anyone technical. Accepted: the
board is friends-only, among people you chose. Head-to-head records require both players'
clients to agree (§6.2), which is a meaningfully higher bar — a fakeable win/loss record
would be worse than none.

### 6.5 Empty states

The leaderboard's most common state early on is "you, alone." It must read as an invitation,
not a failure. Same for a picker showing no friends online. Both get designed in the deck,
not discovered at integration.

### 6.6 Degraded states

Designed alongside the empty states, not after:

- **Worker unreachable** — solo games play, the score is held locally and published on the
  next successful connection. The leaderboard shows its last known values, marked stale.
- **PartyKit unreachable** — versus games are unavailable with a specific reason; solo games
  are unaffected and the picker says so rather than looking broken.
- **Signed out** — §4.2. Solo plays, versus is gated, nothing else changes.

The existing `partyError` state and the `reconnectLobby` retry path are the starting point;
what is new is that a failure in one service must not present as the whole panel being dead.

## 7. While the assistant is working

**Decided: nothing new happens when the assistant finishes.** The two existing signals are
the only ones, and neither changes:

- the **ready chime** — `playSound('ready')`, fired on any session's thinking→false
  transition (`App.tsx:823`);
- the **status light** in the header bar (`sessionStatuses`, `App.tsx:766`).

Both already work with the game pane open, because the game pane is a *side* pane and the
header bar is always visible. **No work is required to preserve this — the requirement is
that no game adds to it.** Specifically:

| Event | What happens |
|---|---|
| Assistant finishes a turn | Chime + status light. Nothing else. |
| Assistant needs approval | The existing attention chime + red dot. Nothing else. |
| — | No game pauses, no overlay, no focus change, no new badge on the games button, no toast. |
| Closing the game pane mid-game | Always allowed; nothing blocks it. |

**Accepted consequence:** Flappy is a reflex game, so a player who looks away at the chime
will lose the run. That is the intended behavior — the alternative (auto-pausing a game the
user didn't ask to pause) is a bigger surprise than losing a Flappy run, and 2048 exists in
the lineup precisely because it is the game you *can* walk away from mid-move (§5.2).

**Unchanged and not covered by this rule:** an incoming *challenge from a friend* still
forces the panel open (`game-reducer.ts:191` sets `panelOpen: true`). That is a person
waiting on you, not the assistant finishing, and it predates this design.

## 8. Build order

**Step 1 — UI first, alone. DONE 2026-08-31** (branch `feat/games-arcade-shell`,
commit `3623bcd5`; ledger in `docs/active/design/2026-08-30-games-arcade/decisions.md`). Build the picker, a leaderboard, chess sizing, the empty
states and the degraded states in the UI Workbench against fake data. **Include a two-player
board mockup in all six review themes (§5.5)** — that is a real open question, not a
formality. Hand Destin a review deck (`scripts/ui-review/review-cards.py`). Nothing else
starts until this is signed off: the shell's shape is what the games must fit into, and the
game slot (§3) cannot be finalized before it.

**Step 2 — parallel.** With the slot fixed, four games in separate worktrees plus the Worker
scores/records work in `wecoded-marketplace`, concurrently. Each game only has to satisfy the
slot, so they do not block each other.

Two items start first within this step, because they are the ones most likely to force a
rethink: **the state split (§3.1 item 1)**, since every game depends on where the boundary
lands, and **the §6.2 attestation flow**, since it is the only cross-service piece.

**Step 3 — integration.** Wire the games in, then a second review deck: before/after for
Connect 4's retheme (§5.4), since that changes a game already in use.

## 9. Testing

Existing coverage: `game-reducer.test.ts`, `friends-data.test.ts`, `friends-screen.test.tsx`,
`presence-socket.test.ts`, `use-presence.test.tsx`, `workbench-fake-party.test.ts`. **Nothing
covers `ConnectFourBoard`, `GameOverlay`, `GameChat`, `GamePanel`, `party-client.ts`,
`usePartyGame.ts`, or either PartyKit room** — `workbench-fake-party.test.ts` names several
of them, but only in comments; it tests the workbench mock, not the real modules.

New work must pin:

- The game slot: every registered game satisfies the definition; `gameType` dispatch reaches
  the right party, through all five steps in §3.1's table.
- The state split: no shell component reads a game-specific field.
- Chess: legality delegated to the library, and the room rejects an illegal move rather than
  broadcasting it.
- §6.2: two agreeing reports record; disagreement records nothing; a single report without a
  corroborating disconnect records nothing.
- Forfeit semantics, including the both-disconnected case (§6.3).
- Score submission and leaderboard ranking, including the you-alone empty state.
- §7: the games do not register any handler on turn completion. A test that asserts an
  *absence* is unusual, but this is a rule four separate game modules could each quietly
  break.
- `ipc-channels.test.ts` parity for any new channel (five surfaces). **This is a build
  break, not a follow-up:** score submission needs a Kotlin stub in `SessionService.kt`
  alongside the existing `game:getIncognito` / `game:setIncognito` stubs at lines 1238-1243,
  even though no Android game exists. Without it `verify.sh` goes red.
- `workbench-boot-check.mjs` after any mock-shim change — the unit suite has passed while the
  app crashed at boot.

Existing suites that will need updating rather than extending: `game-reducer.test.ts` (the
state split rewrites its subject) and anything asserting the toolbar says "Connect 4"
(`OverflowMenu.test.tsx`).

## 10. Accessibility

Not optional here, because two of the four games are keyboard-native by nature:

- **2048** — arrow keys are the only input. Keyboard is the primary interface, not an
  accommodation.
- **Chess** — keyboard square selection and move entry; the board must be traversable
  without a pointer.
- **Flappy** — a single non-pointer input (space/enter) must work.
- **Focus** — opening the game pane must not trap focus away from the chat input, given §7
  says the assistant's completion changes nothing about where you are.
- **Reduced motion** — `reducedEffects` already exists in the theme engine and gates the
  mascot's idle loops. Flappy's scrolling background and 2048's tile slides must honor it.

Judged against `docs/active/design/2026-08-25-ui-design-guide.md` in the Step 1 deck.

## 11. Open items

- The exact chess rules library, pinned by version.
- Whether solo runs record a history or only a best.
- The disagreement-logging shape in §6.2 — what, if anything, is surfaced to the players.
- **The picked-up square is too faint** — the legal-move dots read as causeless
  (Destin, deck step S-2). Deliberately deferred: a selection highlight is a feedback cue
  and cannot be judged on a still of a board that is not yet clickable.
- Chess is vertically centred only until it has game chat; then it goes top-aligned like
  Connect 4.
- Android games (out of scope; follow-up — but see §9 for the parity stubs it still forces).

**Closed by Step 1:** the two-player contrast rule (§5.5), per-game pane widths (§4.3 —
built, with the games pane keeping its own remembered width), and the picker/leaderboard/
empty/degraded shapes (§4.1, §6.5, §6.6).


---

## 12. Status (2026-08-31)

Branch `feat/games-arcade-shell` in `youcoded`, merged up to `master`. Branch
`feat/games-arcade-scores` in `wecoded-marketplace`.
**Nothing merged, pushed, or deployed.**

Green: `verify.sh --full` (types, full suite, knip, eslint, ast-grep) ·
Android `./gradlew test` 200 · worker 298 · 15/15 workbench routes ·
11 arcade surfaces captured in six themes, 0 missed.

### Done

| Piece | State |
|---|---|
| The arcade shell (§4) | Built, reviewed, signed off (deck `step1-review`) |
| The state split (§3.1) | Shell holds seat/turnSeat/outcome; games own `play` |
| `gameType` end to end (§3.1 item 3) | The reducer keeps it; Accept opens the right game |
| Connect 4 retheme (§5.4) | Done, signed off |
| Flappy (§5.1) | Playable. Mascot flies, landscape sky, end-of-run card |
| 2048 (§5.2) | Playable. Keyboard-first, end-of-run card |
| **Chess (§5.3)** | **Playable.** `chess.js@1.4.0` pinned exact, own room, own client, promotion picker, S-2 selection fix |
| End-of-run screen | Shared `RunOverCard` — one ending for every solo game |
| Local best (§4.2) | Persists per game, survives closing the panel |
| Pane resize (§4.3) | Own remembered width, per-game defaults |
| Scores backend (§6.1) | Worker routes + `GET /games/scores` (all bests in one call) |
| **Scores WIRED to the app** | **All five surfaces**, Android included with real arms, not stubs |

### Settled while building

- **Scores cross every boundary as raw numbers.** A game's wording lives only in
  `game-registry.ts`. Mechanically enforced: `arcade-authority.test.ts` fails the
  build if a main-process file speaks a game id, `pipes`, or `toLocaleString`.
- **Your best is the max of the server's and this computer's.** Either can lead
  legitimately (another device vs. an offline run). Max is the only rule that
  never shows a number lower than one already seen.
- **Presence is a socket fact, not an HTTP one.** `friendsOnline` moved off the
  status channel onto the live lobby list. It had been served from a fixture, so
  outside the workbench the versus tiles would have read "No friends online"
  permanently.
- **An unreachable board is labelled, never emptied** — with WHEN, never WHY.
  401 is the exception: sign-out drops the cache so the next user on the machine
  is never shown the previous one's friends.

### Not done

1. **Head-to-head records are unexercised.** The attestation flow (§6.2) is built
   and tested on the Worker; no client has ever sent a report.
2. **The chess room relays, it does not validate.** §5.3 says the room validates.
   Both clients re-validate with `chess.js`, so a cheating client cannot corrupt
   its peer's board — it can only waste its peer's time. Making the room
   authoritative needs `chess.js` added to `partykit/`'s own dependencies.
   **§5.3 should be corrected to match, or the work scheduled.**

### Open, for Destin

- ~~Is Flappy's pipe gap fair?~~ **SETTLED 2026-08-31** (Destin: "flappy pipes
  are fine"). The gap was tuned against a bot; the bot caught an unplayable
  first pass, and a human has now confirmed the result. Do not re-tune it
  without asking — it is a signed-off feel, not a number to optimise.
- Chess is vertically centred only until it has game chat.
- Whether solo runs record a history or only a best (§11).

### Settled 2026-08-31: the board's squares (D-13)

The two contrast numbers that were open here turned out to be a **bug**, not a
matter of taste: the board asked for a tinted square and a plain one, but two
background utilities on one element do not blend — one wins — so the tint never
painted and both squares were raw surface values one ladder rung apart.

Destin picked `contrast` (full strength, neutral) from the `board-contrast`
deck. Shipped, measured in all six themes: creme 2.01 · light 2.16 ·
meadow-mist 2.24 · midnight 2.51 · dark 2.77 · halftone-dimension 2.97, against
1.05–1.40 before. Coordinates went 2.01 → 3.96. Full reasoning, including why
the prettier theme-coloured option lost, is in decisions.md D-13.

### Four lessons worth keeping

**Playing it found what testing could not, twice.** The best score never reached
the picker, and the end-of-run card never rendered because the shell unmounted
the game — both with every unit test green. Both are now guarded by tests that
read source rather than behaviour, because the behaviour tests were the ones
that missed it.

**Two spec sentences were disproved by building them** (§5.1's wallpaper sky,
§5.5's fill-only contrast), and a third is disproved above (§5.3's validating
room). A spec claim that survives only because nobody built it is not verified.

**A design that was approved is not necessarily a design that rendered.** The
board's squares were signed off twice by eye while the code's actual output was
two raw surface values — the tint it asked for lost a fight with another
background and never painted. Nothing in the toolchain could see it: it
type-checks, lints, renders, and passes a component test, because you DO get a
background, just not the one requested. Only measuring pixels found it. That is
now a tree-wide pinning test (`background-layer-authority.test.ts`) rather than
a paragraph, and the general form is worth carrying: **when a visual property is
load-bearing, measure it — do not review it by eye alone.**

**A fixture can hide a permanent wrong answer.** The versus tiles' "Jake is
online" came from an arcade fixture, so the workbench showed the healthy state
forever while the shipped app could only ever have said "No friends online".
When a screen's fact has a live source, the mock must fake the LIVE SOURCE, not
the screen's answer.
