---
status: draft
date: 2026-08-30
tags: [games, arcade, social, leaderboard, themes, mascot, partykit, worker]
---

# Games arcade — design (2026-08-30)

Turn the Connect 4 panel into a four-game arcade: **Connect 4, Chess, Flappy, 2048**, all
themed like the rest of the app, with friend leaderboards for the solo games and
head-to-head records for the competitive ones.

## 1. Where we're starting from

Verified against `master` on 2026-08-30. These are load-bearing facts, not background:

- **There is one game.** `renderer/components/game/` holds `GamePanel.tsx` (60),
  `GameLobby.tsx` (722), `ConnectFourBoard.tsx` (140), `GameChat.tsx` (87),
  `GameOverlay.tsx` (77), `friends-data.ts` (64). Rules in `renderer/game/connect-four.ts`
  (75, optimistic client copy) and `partykit/src/connect-four-room.ts` (83, authoritative).
- **There is no game registry, manifest, or per-game interface.** The nearest things are a
  hardcoded party name in `partykit/partykit.json` (`"connectfour"`) and a `gameType` string
  on challenge messages that **nothing ever dispatches on** (`game-types.ts:71`,
  `usePresence.ts:131/164/169`, `usePartyGame.ts:18`, `lobby-room.ts:106`). `GameConnection`
  is Connect-4-shaped — its move method is `makeMove(column: number)`.
- **The only way into a game is challenging a friend.** Room codes were removed 2026-07-09.
  There is no solo path and no computer opponent anywhere in the app.
- **Nothing about a game is ever persisted.** No scores, wins, losses, or streaks. The sole
  persisted game value is the incognito flag, in `~/.claude/youcoded-favorites.json`
  (`main.ts:1538-1547`) — note `~/.claude`, not `~/.youcoded`.
- **Multiplayer is real and split across two services.** PartyKit
  (`youcoded-games.itsdestin.partykit.dev`) referees the board; the marketplace Worker's
  `presence-room.ts` Durable Object holds friends-only presence and relays challenges. The
  Electron main process owns the presence socket (`main/presence-socket.ts`) so the renderer
  never sees the token.
- **The game pane is hardcoded to 400px** (`App.tsx:2888`) while the artifact drawer beside
  it is user-resizable 320px–60% of window with the width remembered
  (`state/drawer-width.ts`). The game pane opts out of machinery that already works.
- **Connect 4 is theme-blind.** `ConnectFourBoard.tsx:72-126` uses raw Tailwind
  `bg-red-600` / `bg-yellow-500` / `bg-blue-600/50`; `GameOverlay.tsx` uses
  `text-red-400` / `text-yellow-400`. Identical in all 11 themes.
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
| Android games | Android has none today; wiring the bridge is a separate project and would roughly double this one. Follow-up. |
| New theme tokens for games | Games use the app's existing tokens (§5.5). Nothing for theme authors to do. |
| Anti-cheat on solo scores | Scores are client-reported and forgeable. Accepted for a friends-only board (§6.4). |

## 3. The game slot

The single highest-value artifact here. Adding a second game today means editing ~8 files;
after this, adding one means writing one module and registering it.

A game declares what it is and how it is played:

```ts
export type GameKind = 'solo' | 'versus';

export interface GameDefinition<Move = unknown> {
  id: string;                   // 'connect-four' | 'chess' | 'flappy' | 'twenty-forty-eight'
  name: string;                 // shown in the picker and the challenge
  kind: GameKind;
  /** Picker tile art. Theme-token only — no game ships its own palette (§5.5). */
  Tile: React.ComponentType;
  /** The board/playfield. Solo games get `onEnd(score)`; versus games get the connection. */
  View: React.ComponentType<GameViewProps<Move>>;
  /** Default pane width; the user's resize wins and is remembered (§4.3). */
  defaultPaneWidth: number;
  /** Solo games only: how a run's result becomes a leaderboard number. */
  scoring?: { label: string; higherIsBetter: boolean };
  /** Versus games only: the PartyKit party that referees it. */
  party?: string;
}
```

A game is therefore one module exporting one definition, plus its registration. Nothing
outside the registry knows a game's name, rules, or shape.

Two consequences that shape everything downstream:

- **`GameConnection` stops being Connect-4-shaped.** `makeMove(column: number)` becomes
  `makeMove(move: Move)` — a chess move is not a column number. This is a breaking change to
  a shipping interface and touches every existing game component.
- **`gameType` finally gets read.** The challenge path already carries it end to end; the
  work is dispatching on it in `usePresence.ts` and `usePartyGame.ts` rather than hardcoding
  `party: 'connectfour'`.

Solo games do not touch `GameConnection` at all. They are a local loop plus a score
submission, which is why they can be built entirely in parallel with the versus work.

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

### 4.3 The pane

The game pane adopts the artifact drawer's existing resize machinery (`drawer-width.ts`:
320px–60% of window, remembered) instead of its hardcoded 400px. Chess at 400px is ~50px
squares — playable but cramped, and bad on touch. Per-game default widths; the user's
resize wins and is remembered.

### 4.4 What survives

`GameChat`, `GameOverlay`, the challenge banners, the friends list, incognito, and the
reconnect/supersede handling are all game-agnostic already and carry over. `GameLobby.tsx`
(722 lines) is the file that must be split: its sign-in, friends, and error screens are
shell; its Connect 4 assumptions are not.

## 5. The games

### 5.1 Flappy (solo)

The showcase. The theme's mascot flies; pipes and ground are theme surfaces; where the theme
ships a wallpaper, that is the sky.

The mascot rig supports this directly — it is a named-part SVG with per-part pivots and
per-part rotation, driven by an underdamped spring (`mascot-poses.ts:80`), with
velocity-trailing limbs (`dragTargets`) and existing `shocked` and `dizzy` faces.

- A flap drives `rig-arm-left` / `rig-arm-right` on a wing-beat; fall speed feeds
  `motionRef.current.vy` so the body trails naturally; `shocked` on impact, `dizzy` on death.
- Pitch (nose-up/nose-down) rotates the container element — `MascotRig` renders into a
  100%×100% SVG, so an outer transform is clean. The rig exposes no whole-body rotation.
- Add a `flap` entry to the shared `POSES` table rather than a bespoke animation path. Poses
  are the intended extension point and **apply to every existing rig, including ones
  published later, with no work from theme authors.**

**Two gaps to handle:** only `rig-body` is guaranteed by the contract, so a body-only rig has
no wings — fall back to `default-buddy-rig.ts`, which has the full part set. And only 2 of 7
community themes ship a rig today; the rest already fall back to the default character.

**Score:** distance / pipes cleared. Higher is better.

### 5.2 2048 (solo)

The game you can actually play while the assistant works — you can stop mid-move, look away,
and lose nothing. Reflex games cannot make that claim, which is why the lineup needs one of
each.

Tiles ramp from a neutral surface toward the accent as the value climbs. `sheet-theme.ts:7-11`
already builds a 5-step accent ramp for the spreadsheet viewer — copy that approach. Adjacent
steps need not be sharply distinct: the number on the tile is the information, the color is
reinforcement.

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

| | Fill | Text |
|---|---|---|
| You (`UserMessage.tsx:72`) | `bg-accent` | `text-on-accent` |
| Assistant (`AssistantTurnBubble.tsx:481`) | `bg-inset` | `text-fg` |

Games use the same treatment: **your** pieces accent-filled, your **opponent's** on a neutral
surface. This is a surface/value contrast, not a hue one, so it holds on the three themes
where the accent is itself a grey (`light`, `dark`, `midnight`) — if it did not, chat itself
would be unreadable. `on-accent` is computed per theme to be legible on that accent
(`theme-validator.ts:21`).

Everything else maps onto tokens that exist: board and square shades from
`canvas / panel / inset / well`, borders from `edge / edge-dim`, five text weights, accent
washes via `color-mix` (used in ~27 places in `globals.css` already), and `--destructive`
for check and forfeits.

**One constraint:** `theme-engine.ts:506` deliberately emits concrete `rgba()` rather than
`color-mix` for Android WebView compatibility. Games are desktop-only here, but any color a
game derives in JS should use the existing `mixHex()` helper rather than inventing a second
path.

## 6. Scores and records

### 6.1 Solo leaderboards

Per game: your best, ranked against your friends' bests. Lives on the marketplace Worker,
which already owns identity, the friends graph (`social/graph.ts`), and D1. New table, new
endpoints, submitted by the client at run end.

### 6.2 Head-to-head records

Each friend row picks up your running record against them, per game — *you vs Jake, 7–2 at
chess*.

**This is the riskiest piece in the project and the only one with no existing pattern.** The
result is known by PartyKit; the record lives on the Worker. Those are separate services, and
the handoff must be trustworthy — a client-reported win is a client-claimed win. The referee
room must report the outcome to the Worker over an authenticated server-to-server call. Design
this before building it; it is the one item where discovering the shape late is expensive.

### 6.3 Forfeits

Disconnecting and failing to return within the existing reconnect window is a recorded loss.
This is how online chess universally works; the alternative lets players protect a record by
quitting, which makes the record worthless. If both players disconnect, nothing is recorded.

### 6.4 Cheating

Solo scores are client-reported and therefore forgeable by anyone technical. Accepted: the
board is friends-only, among people you chose. Head-to-head records are **not** in this
category — they are server-reported precisely because a fakeable win/loss record is worse
than none.

### 6.5 Empty states

The leaderboard's most common state early on is "you, alone." It must read as an invitation,
not a failure. Same for a picker showing no friends online. Both get designed in the deck,
not discovered at integration.

## 7. Build order

**Step 1 — UI first, alone.** Build the picker, a leaderboard, chess sizing, and the empty
states in the UI Workbench against fake data. Hand Destin a review deck
(`scripts/ui-review/review-cards.py`). Nothing else starts until this is signed off: the
shell's shape is what the games must fit into, and the game slot (§3) cannot be finalized
before it.

**Step 2 — parallel.** With the slot fixed, four games in separate worktrees plus the Worker
scores/records work in `wecoded-marketplace`, concurrently. Each game only has to satisfy the
slot, so they do not block each other. The head-to-head handoff (§6.2) starts first within
this step, since it is the item most likely to force a rethink.

**Step 3 — integration.** Wire the games in, then a second review deck: before/after for
Connect 4's retheme (§5.4), since that changes a game already in use.

## 8. Testing

Existing coverage: `game-reducer.test.ts`, `friends-data.test.ts`, `friends-screen.test.tsx`,
`presence-socket.test.ts`, `use-presence.test.tsx`, `workbench-fake-party.test.ts`. **Nothing
covers `ConnectFourBoard`, `GameOverlay`, `GameChat`, `GamePanel`, `party-client.ts`,
`usePartyGame.ts`, or either PartyKit room.**

New work must pin:

- The game slot: every registered game satisfies the definition; `gameType` dispatch reaches
  the right party.
- Chess: legality delegated to the library, and the room rejects an illegal move rather than
  broadcasting it.
- Forfeit semantics, including the both-disconnected case.
- Score submission and leaderboard ranking, including the you-alone empty state.
- `ipc-channels.test.ts` parity for any new channel (five surfaces).
- `workbench-boot-check.mjs` after any mock-shim change — the unit suite has passed while the
  app crashed at boot.

Existing suites that will need updating rather than extending: `game-reducer.test.ts` and
anything asserting the toolbar says "Connect 4" (`OverflowMenu.test.tsx`).

## 9. Open items

- The exact chess rules library, pinned by version.
- Default pane width per game.
- Whether solo runs record a history or only a best.
- Android games (out of scope; follow-up).
