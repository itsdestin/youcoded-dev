---
status: shipped
created: 2026-08-11
type: handoff
program: docs/archive/plans/2026-08-11-native-sessions-remaining-work.md
---

# Handoff — Native sessions, next up: M5 permissions maturity

Paste the block at the bottom into a fresh session, or just read this file.

## Where things stand

The native-sessions program doc is `docs/archive/plans/2026-08-11-native-sessions-remaining-work.md`. It is **current as of 2026-08-11** — §1 describes the shipped end state, §2 lists the remaining work in order. Step 1 is done. **Next unfinished step is Step 2, M5 permissions maturity.**

`master` on `youcoded` was `6d3390bc` at the time of writing and is moving fast — several sessions landed work today. **Pull before doing anything.**

### What shipped today that you should know about

- **One path vocabulary across platforms** (PR #291, merge `71c4014a`). Harness tools emit forward slashes for file and target paths; Bash reports its cwd in the workspace root's own spelling. This fixed four tests that had `master` red on Windows and macOS for two days. Spec + plan: `docs/archive/{specs,plans}/2026-08-11-harness-cross-platform-path-vocabulary.md`. Invariant recorded in `.claude/rules/native-runtime.md`.
- **Bash `persistent_env`** — opt-in, an `export` carries to the next call, filtered against the spawn baseline so ambient credentials never persist.
- **Two-way cwd miss hints** — a file tool that misses names the Bash cwd if the file is really there, and Bash names the workspace root in the same situation. Each confirms the alternative exists on disk before naming it; neither guesses.

### `master` is RED on Windows right now, and it is not the above

Seven failures, all inherited from two PRs merged onto an already-red matrix on 2026-08-11: `43a9c43a` (six `harness-review-runner.test.ts > wrap-up turn` cases) and `a2b0e35f` (one `persistent_env` case). Tracked in `ROADMAP.md` → Bugs. Measured, not inferred: master had 11 Windows / 4 macOS failures; #291 cut it to 7 / 0.

**Do not read a green `verify.sh` as a green build.** It runs on Linux only. That exact gap produced three separate Windows/macOS breaks in two days. The three-platform matrix on the PR is the real gate.

## Your task: Step 2 — M5 permissions maturity

Read Step 2 in the program doc for the full statement. Summary:

**2a. Permissions management UI — do this first.** There is no way to undo an "Always allow." `desktop/src/main/harness/permission-store.ts` has exactly two methods: `rulesFor(cwd)` at `:32` and `remember(cwd, rule)` at `:41`. No list, no remove, no IPC, no renderer reader. Its own header documents unbounded growth pending this UI. A user who grants "always" to something they misread cannot take it back — and the 2026-08-10 dogfood found a consent bug on this surface where a card named one tool while its buttons approved another, so the missing revocation path is worse than a nicety.

Scope: `list()` / `remove(cwd, rule)`, an IPC pair with four-surface parity, and a Settings surface grouped by project (worktrees count as separate projects).

**2b. Full Auto prompt coherence.** Full Auto still shows a two-button "Nevermind, allow once / Allow Always" prompt, which is nonsense when the mode means approve-everything. Decide between auto-approve-plus-log or a single acknowledge card.

**2c. Bash always-allow rule shape.** Bash's permission subject is the literal full command string, anchored, so "always allow `git push origin main`" grants nothing for `git push origin dev`. Needs a real design: prefix rules, argv-head matching, or a user-editable pattern at confirm time.

**2c is strictly after 2a and the ordering is load-bearing.** Remembered rules are the last layer and outrank the destructive deny-list. Their accidental narrowness is currently the only thing limiting blast radius. Do not widen grants before revocation exists.

**Done when:** a user can see every rule they have granted, remove any of them, and Full Auto no longer asks questions it has already answered.

## Constraints and traps specific to this work

- **Never canonicalize `ctx.cwd`.** The permission store is keyed by cwd (`rulesFor(cwd)` / `remember(cwd, rule)`), so changing its spelling silently orphans every remembered grant a user has. This was considered and rejected during the path-vocabulary work for exactly this reason — read the "Rejected alternative" section of `docs/archive/specs/2026-08-11-harness-cross-platform-path-vocabulary.md` before you design the project grouping, since it decides how worktrees group.
- **youcoded #278 is NOT this work.** It is a permissions PR, but on the *Claude Code* hook-relay path (relay scripts, Ink parser, both platforms), stale since 2026-07-31, with merge conflicts. Its worktree `worktrees/perm-timeout` on `feat/permission-ask-timeout` is still on disk. Judge it separately; it does not gate M5.
- **Four-surface IPC parity is a real gate**, pinned by `desktop/tests/ipc-channels.test.ts`. A `permissions:*` channel missing from `remote-shim.ts` or `SessionService.kt` fails there.
- **Android has none of the native runtime.** M5's Android parity belongs to M8, not here.

## Do not collide

Live worktrees at time of writing — check `git worktree list` first, this moves:

- ~~`youcoded/worktrees/native-images` on `feat/native-image-delivery`~~ — **SHIPPED 2026-08-11** (youcoded#293, merge `f65fed18`). Worktree and branch are gone; the item is done. Plan and spec archived to `docs/archive/plans/2026-08-11-native-image-delivery-plan.md` and `docs/archive/specs/2026-08-11-native-image-handling.md`.
- `worktrees/perm-timeout` (`feat/permission-ask-timeout`) — the CC-path permissions PR above.
- `worktrees/ask-reference`, `worktrees/project-description`, `worktrees/session-switch-animation`, `worktrees/xwayland-floater` — older, unrelated.

Also live: `.superpowers/sdd/progress.md` is a **different** SDD workstream (review-runner-resilience) still marked IN PROGRESS with two tasks "review IN FLIGHT," despite `43a9c43a` having merged. Don't reuse that ledger file; make your own.

## Workspace hygiene worth knowing

`youcoded-dev`'s own CI is red and has been for a while — `scripts/audit-anchors.mjs` exits 1 on rule word-budget violations (eight rule files plus `PITFALLS.md`). Tracked twice in `ROADMAP.md` (an entry from 2026-07-30 near line 499 and a newer duplicate added 2026-08-11 — worth collapsing). It means the daily anchor-drift cron is not being read, so verify anchors yourself rather than trusting the check.

---

## Paste-into-a-new-session prompt

> Continue the YouCoded native-sessions program. Start by reading
> `docs/active/handoffs/2026-08-11-native-sessions-next-m5-permissions.md`, then
> `docs/archive/plans/2026-08-11-native-sessions-remaining-work.md` §2 Step 2.
>
> The task is **M5 permissions maturity, item 2a: the permissions management UI** —
> there is currently no way for a user to undo an "Always allow." Brainstorm and spec
> it before writing code; the handoff lists the constraints that have already been
> decided (notably: never canonicalize `ctx.cwd`, because the permission store is
> keyed by it).
>
> Before anything: `cd youcoded && git fetch origin && git pull origin master` —
> master moved several times on 2026-08-11. Note that master is currently RED on
> Windows from unrelated work, and `scripts/verify.sh` runs on Linux only, so it
> cannot see that class of break.
>
> Use a worktree. Check `git worktree list` first — other branches in this program
> may be in flight. (`feat/native-image-delivery` shipped 2026-08-11 and is gone.)
