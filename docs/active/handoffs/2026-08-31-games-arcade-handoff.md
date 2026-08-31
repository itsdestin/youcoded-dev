---
status: active
date: 2026-08-31
tags: [games, arcade, handoff]
spec: docs/active/specs/2026-08-30-games-arcade-design.md
decisions: docs/active/design/2026-08-30-games-arcade/decisions.md
---

# Games arcade — handoff

Written before compacting context. Everything needed to resume cold.

## Where the code is

| Repo | Branch | State |
|---|---|---|
| `youcoded` | `feat/games-arcade-shell` | 10 commits, merged up to `master`, full suite green, 15/15 workbench routes boot |
| `wecoded-marketplace` | `feat/games-arcade-scores` | 1 commit, 292 worker tests green |

**Nothing merged, pushed, or deployed.** The worktree is
`worktrees/games-arcade`. The Worker deploys automatically from `master` — never
run `wrangler deploy`.

## Read these first, in this order

1. `docs/active/specs/2026-08-30-games-arcade-design.md` — **§12 is the status
   table**; the rest is the design, with two sections corrected in place where
   building disproved them.
2. `docs/active/design/2026-08-30-games-arcade/decisions.md` — every decision
   Destin has taken, and why. Includes the ten from Step 2 that came from him
   using the dev build rather than from a review deck.
3. `docs/active/investigations/2026-08-30-games-arcade-spec-review.md` — the
   original review of the spec. Historical, but explains why §6.2 looks the way
   it does.

## The three things left, in the order I would do them

### 1. Wire the app to the scores backend
The Worker half is built and tested. Missing: renderer → main → Worker for
`arcade.status`, `arcade.leaderboard`, `arcade.submitScore`, all three currently
registered in `desktop/src/renderer/dev/workbench/mock-only.ts` as deliberately
unbuilt. Five surfaces each, **including a Kotlin stub in `SessionService.kt`** —
without it `ipc-channels.test.ts` fails and `verify.sh` goes red, even though
Android has no games. Delete the `mock-only.ts` rows as each lands; keep the
fakes in `mock-shim.ts` so the workbench can still show the empty and stale
states.

### 2. Chess
The board, the piece treatment (`outline`, chosen by Destin) and the pane width
are settled. Missing: a rules library, move input, and the PartyKit room.

**This needs Destin's decision first** — it adds a third-party dependency to his
app. Flagged to him, not yet taken. Do not hand-write the rules: an
illegal-move bug is the most visible way this project could embarrass itself.

### 3. Head-to-head records
Built and tested on the Worker; no client has ever sent a report. Needs the
attestation message from the game-end path.

## Things that will bite you

- **Playing it found two bugs that testing did not** — the best score never
  reaching the picker, and the end-of-run card never rendering. Both had every
  unit test green. The shape both times: **a state that only exists in the real
  app, because the workbench always has fixtures loaded.** Look for that class
  directly.
- **Get it into Destin's hands at each stage**, not at the end. Both bugs above
  were found in about thirty seconds of him playing.
- `verify.sh` covers `youcoded/desktop` only. The Worker needs its own
  `npx vitest run` in `wecoded-marketplace/worker`.
- The guards in `tests/arcade-authority.test.ts` and `tests/run-over-card.test.ts`
  read SOURCE, not behaviour, on purpose — behaviour tests are what missed these.
  If one fails, it is likely right.
- Review plans for every arcade surface live in `scripts/ui-review/plans/games-*.json`.
  `games-death.json` plays until the bird hits the ground, which is how the
  end-of-run card gets verified.

## Open questions for Destin

- **Is Flappy's pipe gap fair?** Tuned against a bot, never confirmed by a human.
  The first pass was unplayable and the bot is what caught it — so it is a proxy,
  not a substitute. Ask him to play a few rounds.
- **The chess rules library** — adding a dependency to his app.
- The picked-up square is too faint, so the legal-move dots read as causeless.
  Deferred until the board is clickable, because a selection highlight is
  feedback and cannot be judged on a still image.
