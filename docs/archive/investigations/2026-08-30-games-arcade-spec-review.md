---
status: applied
date: 2026-08-30
tags: [games, arcade, review, spec-review]
reviews: docs/archive/specs/2026-08-30-games-arcade-design.md
---

# Review — games arcade design (2026-08-30)

> **Applied 2026-08-30.** All twelve edits in §H landed in the spec, plus a new §7
> ("While the assistant is working") recording Destin's decision that the assistant
> finishing changes nothing beyond the existing chime and status light, and a new §10
> (accessibility) covering E2. This document is the audit trail for *why* those edits
> were made; the spec is the current design.

Every claim below was checked against `youcoded` at `5018a00d`. Commands and line
numbers are quoted so nothing here has to be taken on trust.

**Verdict:** the spec is well-built and most of it verifies. Five facts are wrong or
stale, two sections contradict each other, and three pieces of work are described as
smaller than they are. One of those — the head-to-head record handoff — has a blocker
the spec does not name, and there is a simpler design that avoids it entirely.

---

## A. Factual errors

### A1. "Only 2 of 7 community themes ship a rig" — it is 4 of 7

Four community themes declare a mascot rig in their manifest:

```
$ rg -l '"rig"' wecoded-themes/themes/
halftone-dimension/manifest.json
strawberry-kitty/manifest.json
kuromi-dreamer/manifest.json
golden-sunbreak/manifest.json
```

This *strengthens* the Flappy case rather than weakening it — more than half the
community themes get a real character, not the fallback. Fix the number; it is
currently arguing against the spec's own recommendation.

### A2. Not three grey-accent themes — all four built-ins are neutral

The spec says the surface-contrast approach "holds on the three themes where the
accent is itself a grey (`light`, `dark`, `midnight`)." All four built-ins are:

| Theme | accent | on-accent |
|---|---|---|
| light | `#1A1A1A` | `#F2F2F2` |
| dark | `#D4D4D4` | `#111111` |
| midnight | `#B1BAC4` | `#0D1117` |
| creme | `#3D3229` | `#F6EEE1` |

`creme`'s accent is a desaturated brown — neutral in practice. So the "accent is a
colour you can tell from grey" assumption fails on **every theme YouCoded ships by
default**, not three of four. See §B3 for why that matters more than a typo.

### A3. `mixHex()` cannot be used as written — it is not exported

`theme-engine.ts:260` declares `function mixHex(...)`, module-private. The spec's
instruction "any color a game derives in JS should use the existing `mixHex()` helper"
is not possible today without exporting it. One-line change, but the spec presents it
as reuse of something already available.

### A4. The PartyKit code lives under `desktop/`, not the repo root

The spec writes `partykit/src/connect-four-room.ts`; the real path is
`youcoded/desktop/partykit/src/connect-four-room.ts`. Same for `partykit.json`.
Trivial, but every other path in §1 is exact, so this one reads as a different repo.

### A5. The wire already disagrees with itself about the game's name

`usePartyGame.ts:286` sends the game type as `'connect-four'` (hyphenated);
`partykit.json` names the party `'connectfour'` (no hyphen). The spec's
`GameDefinition` happens to keep `id` and `party` as separate fields, which handles
this correctly — but nobody flagged that the mismatch already exists, so whoever
implements the dispatch will hit it as a surprise. Worth one sentence in §3.

---

## B. Contradictions and weak arguments

### B1. §1 and §4.4 disagree about `GameOverlay` and `GameChat`

§1 lists `GameOverlay.tsx` as theme-blind (`text-red-400`/`text-yellow-400`).
§4.4 lists `GameOverlay` and `GameChat` as "game-agnostic already and carry over."

Both files branch on Connect 4's colours:

```
GameOverlay.tsx:27   headlineClass = winner === 'red' ? 'text-red-400' : 'text-yellow-400';
GameChat.tsx:36      return state.myColor === 'red' ? 'text-red-400' : 'text-yellow-400';
GameChat.tsx:39-40   const opponentColor = state.myColor === 'red' ? 'yellow' : 'red';
```

Neither is game-agnostic. `GameOverlay` also renders "You Win!" — which is wrong for a
solo game, where the ending is a score, not a verdict. §4.4's "what survives" list is
the spec's estimate of how much work this is, so an over-generous list here makes the
whole project look cheaper than it is.

### B2. §5.5's `color-mix` constraint contradicts a comment in the same repo

§5.5 says `theme-engine.ts:506` "deliberately emits concrete `rgba()` rather than
`color-mix` for Android WebView compatibility." But `sheet-theme.ts:5-6` says the
opposite in a code comment: *"color-mix is already used elsewhere in the app's CSS and
is supported in Electron + the Android WebView."*

Both are partly right and the spec picks the scarier framing. The narrow truth is that
the **computed overlay tokens** are emitted as rgba; `color-mix` in CSS is used 27
times in `globals.css` and is fine. As written, a builder could conclude games must
avoid `color-mix` entirely, which is not the case. One of the two comments is stale
and should be fixed on sight.

### B3. The "chat already proves this works" argument does not transfer

§5.5 argues that accent-fill vs neutral-fill is safe because "if it did not, chat
itself would be unreadable."

Chat has a second cue the spec does not account for: **position**. Your messages are
right-aligned, the assistant's are left-aligned (`UserMessage.tsx:71` uses
`justify-end`; `AssistantTurnBubble.tsx:480` uses `justify-start`). Fill is
reinforcement there, not the only signal.

A chess board or a Connect 4 grid has no position cue — your piece and your opponent's
piece sit in the same grid, adjacent. Combined with A2 (every shipped theme has a
neutral accent), the discs become "slightly lighter grey" vs "slightly darker grey" in
dark themes. It may still work, but the spec's justification is doing no work and the
question deserves an actual mockup in Step 1 rather than an argument by analogy.

---

## C. Three things described as smaller than they are

### C1. The Connect 4 shape is in the shared *state*, not just `GameConnection`

§3 names one breaking change: `makeMove(column: number)` → `makeMove(move: Move)`.
The bigger one is `GameState` (`game-types.ts:20-47`), which every shell component
reads:

```ts
myColor: PlayerColor | null;          // 'red' | 'yellow'
board: number[][];
turn: PlayerColor;
lastMove: { col: number; row: number } | null;
winner: PlayerColor | 'draw' | null;
winLine: [number, number][] | null;
```

Six of these are Connect 4 concepts sitting in the state the arcade shell shares.
Chess has no `winLine`; 2048 has no `turn`; Flappy has no `opponent`. The slot needs a
**state** boundary (per-game state owned by the game module, shell state owned by the
shell) or every game ends up widening this one interface. This is the single largest
piece of work in the project and §3 does not mention it.

### C2. §4.3's "adopt the drawer's resize machinery" is not compatible with
"per-game default widths, remembered"

The drawer's resize is one global width, not a reusable widget:

- one localStorage key — `DRAWER_WIDTH_KEY = 'youcoded-drawer-width'` (`drawer-width.ts:12`)
- one CSS variable — `--drawer-width` on `<html>` (`drawer-width.ts:28`)
- state owned by ThemeProvider (`theme-context.tsx:173-188`)
- the drag handle lives *inside* `SessionDrawer.tsx:743-758`, not in a shared component

So there are two real options and the spec should pick one:

**(a) Share one width.** Cheapest. But resizing the chess board also resizes the
document drawer, and vice versa — a change the user did not ask for, in a panel they
were not looking at. This is exactly the "unexpected change I can't trace back" that
erodes trust.

**(b) Give the game pane its own width.** Make `drawer-width.ts` take a storage key,
add a handle to the game pane, add a second CSS var. Maybe 40 lines. Per-game defaults
then mean one remembered width per game, which is what §4.3 actually promises.

Recommend (b). Say so explicitly, because "adopt the existing machinery" reads as (a).

### C3. Making `gameType` work touches four places, not two

§3 says "the work is dispatching on it in `usePresence.ts` and `usePartyGame.ts`."
Verified, the path is:

1. `usePartyGame.ts:286` sends `'connect-four'` — hardcoded ✓ (spec has this)
2. `lobby-room.ts:106` relays it ✓
3. `usePresence.ts:131` receives it ✓ (spec has this)
4. **`game-reducer.ts:184-193` throws it away** — it stores `challengeCode` and the
   challenger's card, and never stores the game
5. **`GameLobby.tsx:391` accepts with `connection.joinGame(state.challengeCode!)`** —
   `joinGame` takes a code and no game

So the reducer must gain a field and `GameConnection.joinGame` must gain an argument.
Small work, but it lands in the two files the spec says are shell-stable, which is the
kind of surprise that makes an estimate wrong.

---

## D. The one real blocker — §6.2

The spec calls the head-to-head handoff "the riskiest piece" and it is right, but for
a reason it does not state.

**PartyKit never learns who the players are.** The rooms tag players by *display name*:

```
usePartyGame.ts:286   connectToRoom(code, playerName)     // display name
usePartyGame.ts:287   lobbyChallenge(target, 'connect-four', code)   // account id
```

And the app's own comment says display names are not unique
(`game-types.ts:4-5`: *"display name is the visible tag, account id is the stable key
(display names aren't unique)"*). The Worker keys friends, presence and D1 by account
id.

So "the referee room reports the outcome to the Worker" cannot name the winner today.
On top of that, the two room files contain **zero** references to `token`, `secret`,
`fetch` or `env` — they make no outbound calls at all. The proposed design therefore
needs: account identity plumbed into PartyKit rooms, a shared secret in PartyKit's
environment, an outbound call from a room, and a new machine-authenticated endpoint on
the Worker. Four new things, one of which (identity in the referee) is a privacy
decision, not just plumbing.

### The simpler design

**Record the result through the presence socket instead.**

The Worker's `presence-room` Durable Object already has everything the handoff needs:

```
presence-room.ts:18    interface Attachment { userId; card; status; ... }
presence-room.ts:151   case "status":   // already tracks 'idle' | 'in-game'
```

Both players are connected to it, both are authenticated, both are keyed by account
id, and it already knows they are in a game together — it relayed the challenge.

So: at game end, **both clients** report the outcome over their own presence socket.
The Worker records the result only when the two reports agree. If they disagree, or
one never arrives inside a timeout, nothing is recorded.

Why this is better here:

- **Zero new infrastructure.** No secret in PartyKit, no outbound calls from rooms, no
  new endpoint, no identity leak into the game referee.
- **Forging requires both accounts.** Faking a win means controlling your friend's
  client too. That is a very different bar from the client-reported solo scores the
  spec already accepts in §6.4.
- **The failure mode is benign.** Disagreement records nothing, which is exactly what
  §6.3 already prescribes for the both-disconnected case.
- **It is additive.** If a true referee report is wanted later, PartyKit can become a
  third voter without changing the client contract.

The honest cost: it is weaker than a referee. A player and a colluding friend can
agree on a lie. But the spec's own §6.4 accepts forgeable solo scores because the board
is friends-only — the same argument applies with more force here, since collusion needs
two people who both chose each other.

**Recommendation:** make this the default design in §6.2 and note the referee report as
a possible later upgrade. It turns the riskiest item in the project into a routine one,
and it is the single biggest simplification available.

---

## E. What the spec omits

### E1. Nothing about the assistant finishing mid-game — the core case

The whole reason this panel exists (per `CLAUDE.md`: *"play multiplayer games while
waiting for the assistant to work"*) is the interrupt. §5.2 gestures at it — 2048 "you
can stop mid-move, look away, and lose nothing" — but there is no rule anywhere:

- Does a finished turn steal focus from a Flappy run in progress?
- Does Flappy pause when the assistant needs input, or do you just die?
- Can you close the pane mid-chess-game, and what does your opponent see?
- Does the panel badge, or does the chat badge, or both?

This decides whether the arcade feels delightful or infuriating, it costs nothing to
settle in Step 1 alongside the picker, and it is expensive to retrofit into four games
that each made their own assumption. **This is the one thing I would add.**

### E2. No keyboard or accessibility line

Chess and 2048 are keyboard-native (arrow keys are literally 2048's only input).
Flappy needs a non-mouse input. The spec cites the design guide but never mentions
focus, keyboard, or reduced-motion — and `reducedEffects` already exists in the theme
engine and would obviously apply to a scrolling Flappy background.

### E3. No degraded-service states

§6.5 covers empty states but not broken ones. If the Worker is unreachable, do solo
games still play and queue the score? They should — that is §4.2's entire argument —
but nothing says so. Today `partyError` exists in state and there is a retry path
(`reconnectLobby`); the spec should say the leaderboard being down never blocks play.

### E4. Android parity is a hard test gate, not just a follow-up

§2 puts Android games out of scope, which is right. But `ipc-channels.test.ts` enforces
five-surface parity, and the existing games channels already have Kotlin stubs at
`SessionService.kt:1238-1243`. Any new score-submission channel needs a matching stub
or `verify.sh` goes red — even though no Android game exists. §8 says "any new channel
(five surfaces)" but does not connect it to the stub pattern already in the file, so
it reads as a nice-to-have instead of a build break.

---

## F. Overthought

### F1. §5.1's mascot mechanics are implementation, not design

The paragraph is the most enjoyable in the document, and it is also pre-deciding build
details — spring line numbers, `dragTargets`, `motionRef.current.vy`, pitch via an
outer transform — before the UI is signed off, which §7 Step 1 explicitly forbids
("nothing else starts until this is signed off").

Everything load-bearing fits in three lines: the rig has per-part rotation and named
limbs, poses are the extension point and reach every theme's rig for free, and rigs
without wings fall back to the default character. **This is the one thing I would
subtract** — move the mechanics to the implementation plan.

(All the underlying claims do check out: `stepSpring` is at `mascot-poses.ts:80` and is
underdamped by design; `POSES` at line 28 has `shocked` and `dizzy`; `rig-body` is the
required part per `docs/theme-spec.md:68`; `MascotRig` renders into a 100%×100% host
div, so an outer transform is clean.)

### F2. §5.2's sheet-theme reference will mislead whoever builds 2048

"`sheet-theme.ts:7-11` already builds a 5-step accent ramp — copy that approach."

Those five constants all mix toward a **fixed `#ffffff`**, on purpose: the spreadsheet
paper is deliberately light in every theme, like Excel. Copied literally, a 2048 board
is white-on-white in dark themes. The transferable half is the `color-mix` percentage
ramp; the endpoints must be theme surface tokens. Say that, or drop the reference.

---

## G. Verified without objection

For the record, these all check out exactly as written: every file and line number in
§1 (game file line counts, `gameType` at `game-types.ts:71` / `usePresence.ts:131,164,169`
/ `usePartyGame.ts:18` / `lobby-room.ts:106`, the 400px at `App.tsx:2888`, the raw
Tailwind colours in `ConnectFourBoard.tsx:102-126`, incognito at `main.ts:1538-1547`
writing to `~/.claude/youcoded-favorites.json`, the Android stubs at
`SessionService.kt:1238-1243` returning hardcoded `false` and discarding the setter);
the drawer's 320px–60% clamp; `computeOnAccent` at `theme-validator.ts:21`;
`AssistantTurnBubble.tsx:481` `bg-inset`/`text-fg` and `UserMessage.tsx:72`
`bg-accent`/`text-on-accent`; 27 `color-mix` uses in `globals.css`; the rgba comment at
`theme-engine.ts:506`; the toolbar strings at `HeaderBar.tsx:548` and
`OverflowMenu.tsx:112`; room codes removed 2026-07-09 (`usePartyGame.ts:190`);
`social/graph.ts` + `presence-room.ts` + D1 migrations on the Worker; and the test-gap
claim — `workbench-fake-party.test.ts` mentions the real modules only in comments, so
nothing covers `ConnectFourBoard`, `GameOverlay`, `GameChat`, `GamePanel`,
`party-client.ts`, `usePartyGame.ts`, or either room.

---

## H. Summary of recommended edits

| # | Section | Change |
|---|---|---|
| 1 | §5.1 | 2 of 7 → **4 of 7** community themes ship a rig |
| 2 | §5.5 | Three grey-accent themes → **all four built-ins**; drop the "chat proves it" argument and commit to mocking the two-player contrast in Step 1 |
| 3 | §5.5 | Note `mixHex()` needs exporting; narrow the rgba constraint to overlay tokens |
| 4 | §4.4 | Remove `GameOverlay` and `GameChat` from "what survives" — both are Connect-4-shaped |
| 5 | §3 | Add the `GameState` boundary as the primary breaking change; add the reducer + `joinGame` to the `gameType` work; note the `connect-four`/`connectfour` naming mismatch |
| 6 | §4.3 | Commit to a separate remembered width for the game pane, and say the drawer's width is untouched |
| 7 | §6.2 | **Replace the PartyKit→Worker referee report with mutual attestation over the presence socket** (§D above) |
| 8 | new | Add a section on what happens when the assistant finishes mid-game |
| 9 | §5.1 | Cut the mascot mechanics to three lines; move detail to the plan |
| 10 | §5.2 | Fix the sheet-theme reference — the ramp transfers, the `#ffffff` endpoint does not |
| 11 | §6.5 / §8 | Add degraded-service states; connect the five-surface parity note to the existing Kotlin stub pattern |
| 12 | §1 | Correct the `partykit/` paths to `desktop/partykit/` |
