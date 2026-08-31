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
| `youcoded` | `feat/games-arcade-shell` | 12 commits, merged up to `master`, `verify.sh --full` green, Android 200 green, 15/15 workbench routes boot |
| `wecoded-marketplace` | `feat/games-arcade-scores` | 2 commits, 298 worker tests green |

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

## What is left

### 1. Head-to-head records
Built and tested on the Worker; no client has ever sent a report. Needs the
attestation message from the game-end path. Chess and Connect 4 both now have
one, so this is finally reachable.

### 2. The chess room relays, it does not validate
§5.3 says the room validates. Both clients re-validate with `chess.js`, so a
cheating client cannot corrupt its peer's board — only waste its peer's time.
Making the room authoritative means adding `chess.js` to `partykit/`'s own
dependencies. **Either do it or correct §5.3; do not leave the spec claiming
something the code does not do.**

### 3. Two visual questions for Destin, both measured
The board's squares barely alternate (1.05–1.40 contrast, versus ~2.5–3 on a
physical board) and the a–h/1–8 coordinates sit at 2.0–2.8. Numbers and method
are in the spec's §12. Both were signed off when the board was a still image;
chess must now be READ to be played, which is why they are worth re-deciding.

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

- **Is Flappy's pipe gap fair?** Tuned against a bot, never confirmed by a
  human. The first pass was unplayable and the bot is what caught it — so it is
  a proxy, not a substitute. Ask him to play a few rounds.
- **The two chess contrast numbers** in §3 above.

## Decisions already taken — do not re-ask

- **`chess.js` is approved** (2026-08-31, Destin: "chess is good to pull in
  external rules library"). Pinned exact at 1.4.0. Do not hand-roll chess rules.
- **Piece treatment is `outline`** (deck G-8). `?chess=disc|fill` still renders
  the rejected treatments for a future comparison; it is a workbench switch,
  never a user setting.
- **Nothing happens when the assistant finishes** beyond the existing sound and
  status light. No auto-surfacing, no toast, no panel change.

## One more trap, learned this session

**A fixture can hide a permanently wrong answer.** The picker's "Jake is online"
came from an arcade fixture, so the workbench showed the healthy state forever
while the shipped app could only ever have said "No friends online" — the status
channel had no presence data and never would. The rule: when a screen's fact has
a live source, the mock must fake the LIVE SOURCE, not the screen's answer. The
degraded scenario now pushes a real `error` presence frame for the same reason.

**And `npm install <pkg>` writes `node_modules/.package-lock.json` IN PLACE**, so
it reaches every hardlinked worktree. Measured and written up in
`docs/PITFALLS.md`; recovery recipe is there too.
