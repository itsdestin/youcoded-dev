# Handoff: Execute Cross-Device Sync Phase 1a (Sync Spaces Foundation)

**Date:** 2026-07-08
**From:** the cross-device-sync design session (worktree `youcoded-dev.wt/cross-device-sync`, branch `spec/cross-device-sync`)
**For:** a fresh session executing the implementation via **superpowers:subagent-driven-development**
**Status at handoff:** spec + plan approved, committed, and pushed. **Zero implementation code written.** No worktree for the code exists yet.

---

## 1. What you're building (30 seconds)

YouCoded is getting true cross-device sync. Phase 1a is the desktop foundation: a managed `~/YouCoded/` folder (`Projects/` — offered in the new-session picker — and `Personal/`), where every project and the Personal folder is a "sync space" backed by a **hidden git repo** (`GIT_DIR` env at `<root>/.youcoded/sync.git`, never a `.git` in the user's tree) pushed to auto-created private GitHub repos. A chokidar watcher debounce-commits; a 2-minute poll pulls; conflicts resolve convergently (remote wins the canonical filename, local content preserved as a visible `name (from Laptop, 2026-07-08).md` copy). Plus a once-daily dated backup of all spaces to Drive/iCloud and a minimal UI (picker integration + SyncPanel section).

## 2. Read these, in this order

1. **The plan (your task list):** `docs/superpowers/plans/2026-07-03-sync-spaces-phase1a.md` — 11 tasks, full TDD steps with complete code. Its "Scope notes" and "Worktree setup" sections are load-bearing.
2. **The spec (the why):** `docs/superpowers/specs/2026-07-03-cross-device-sync-design.md` — especially §3 (user model), §6–§8 (SyncHub/transport/engine), §11 (backup), §17 (phasing), §18 (risks).
3. **Coordination background (skim):** `docs/superpowers/investigations/2026-07-03-sync-accounts-coordination.md` and `docs/superpowers/specs/2026-07-03-youcoded-accounts-friendship-consolidated-design.md` — the parallel accounts workstream this plan was reconciled against (twice: once from the memo, once against the actually-landed code on 2026-07-08).
4. `docs/PITFALLS.md` — general workspace invariants (IPC parity, live-app safety). Task 11 adds a new Sync Spaces section to it.

All of the above are on branch **`spec/cross-device-sync`** of the workspace repo (`youcoded-dev`), pushed to origin. Work from the existing worktree `youcoded-dev.wt/cross-device-sync` for workspace-doc commits (plan checkboxes, PITFALLS), or merge that branch to workspace master first if preferred — but don't duplicate the docs elsewhere.

## 3. Where the code goes

**All implementation code goes to the `youcoded` sub-repo, never the workspace repo.** The plan's "Worktree setup" section is the first thing to run:

```bash
cd /c/Users/desti/youcoded-dev/youcoded
git fetch origin && git worktree add ../youcoded.wt/sync-spaces -b feat/sync-spaces origin/master
cd ../youcoded.wt/sync-spaces/desktop && npm ci
```

New module tree: `desktop/src/main/sync-spaces/` (all new files, Tasks 1–6). Shared-file modifications (IPC constants, preload/remote-shim/remote-server/ipc-handlers/main.ts, two renderer components) are confined to Tasks 7–9.

## 4. How to execute

- Use **superpowers:subagent-driven-development**: fresh implementer subagent per task, review between tasks.
- **Implementer subagents must run on Opus** — standing preference from Destin after Sonnet shipped multiple production bugs on a previous plan. Reviewer passes too.
- The plan is TDD with exact commands and expected outcomes per step; subagents should follow steps literally, not "improve" them. Every non-trivial edit needs a WHY comment (Destin is a non-developer; this is a hard workspace rule).
- Commit per task as the plan specifies. Check off plan checkboxes (in the workspace-repo plan file) as tasks complete.
- Task 10 includes a live smoke test via `bash scripts/run-dev.sh` — **never test against Destin's running built YouCoded app** (see `.claude/rules/live-app-safety.md`; this rule overrides everything).
- Task 11 opens the PR on `itsdestin/youcoded` and adds the PITFALLS section in the workspace repo.

## 5. Concurrency caveats — the accounts workstream is ACTIVE

A parallel session is building the accounts/friendship platform (Phase 1 — identity substrate — already landed on `wecoded-marketplace` master as `8d18246`; Phase 2 — friends/presence/PresenceRoom DO — likely in flight). Rules of the road, agreed with Destin on 2026-07-08:

1. **Do not touch `wecoded-marketplace` at all.** Nothing in Plan 1a needs it. SyncHub (the Worker module) is **Plan 1b, out of scope** — deliberately, because the Worker has no Durable Object / WebSocket infrastructure yet and whichever track lands its first DO sets the pattern. If you finish 1a and are tempted to start 1b: STOP and coordinate with the accounts track first (spec §6/§17).
2. **Do not touch** `marketplace-auth-store.ts`, `marketplace-api-handlers.ts`, `marketplace-api-client.ts`, or any `marketplace:auth:*` IPC — that's the accounts track's client surface. Plan 1a doesn't need them (SyncHub auth via the platform session token is a 1b concern).
3. **Rebase before Task 7.** Tasks 1–6 create only new files (conflict-impossible). Tasks 7–9 append to files both tracks touch (`shared/types.ts`, `preload.ts`, `remote-shim.ts`, `ipc-handlers.ts`, `main.ts`, `tests/ipc-channels.test.ts`). Between Task 6 and Task 7, run `git fetch origin && git rebase origin/master` in the code worktree so those edits apply against whatever accounts work has merged. Expect at worst trivial adjacency conflicts in constant lists. Same again right before opening the PR.
4. **Dev-server exclusivity:** only one `run-dev.sh` instance can hold port 5223. If the accounts session (or anything else) has one running, wait or coordinate before the Task 10 smoke test. Orphaned Vite servers on 5223 are a known footgun — if launch fails, check for one.
5. **Other worktrees exist under `youcoded.wt/`** (e.g. `artifact-viewer` with uncommitted work; possibly `games-identity`, now merged). Don't clean up or modify worktrees you didn't create.
6. **The gh-CLI paths you reuse are stable:** `sync-setup-handlers.ts` `createGithubRepo` (~lines 293–320) was verified untouched by the accounts merges (checked at youcoded `4eaeb621`). gh remains the auth channel for the *git transport*; the accounts track deliberately keeps it separate from platform sign-in.

## 6. Decisions already made — do NOT re-litigate

- **`GIT_DIR` env, never `--separate-git-dir`** (which writes a `.git` FILE that collides with a developer's own repo). All git calls set `GIT_DIR` + `GIT_WORK_TREE`.
- **Nothing of ours is ever written into the user's tree** — ignores go in `$GIT_DIR/info/exclude`, attributes in `$GIT_DIR/info/attributes`.
- **Convergent conflict policy: remote wins canonical, local becomes the conflict copy.** Local-wins does not converge (devices re-conflict forever). Pinned by the transport contract suite.
- **`tests/sync-transport-contract.ts` is the transport compatibility boundary** — YouCoded Cloud (future paid transport, spec §16) must pass it unchanged.
- **The legacy `sync-service.ts` is completely untouched in 1a.** GitHub-backup migration and the spec-§12 deletions are Phase 2 (when conversations move into the personal space) — doing them earlier regresses conversation-backup freshness to 24h.
- **Personal space in 1a = `~/YouCoded/Personal/**` only** (skills/memory/settings/conversations join in Phase 2).
- **No status glyphs (●◐○) anywhere in UI** — plain words only ("synced project", "local only"). Firm user preference.
- Line endings stored byte-faithful (`core.autocrlf=false`) + `* text=auto` in `info/attributes`.

## 7. Known sharp edges for implementers

- **`npm test` runs vitest in watch mode** — subagents must use `npx vitest run <file>` (one-shot), or they'll hang.
- The git-transport and two-device tests shell to **real git** (local bare repos as remotes) — allow 30s timeouts; git must be on PATH (it is, on this machine and CI).
- The IPC parity test (`tests/ipc-channels.test.ts`) compares the `IPC` const objects in `shared/types.ts` and `preload.ts` **by value** — the new `syncspaces:*` strings must be byte-identical in both, and `preload.ts` inlines them (sandboxed preload can't import). Task 7's parity describe stays red until Task 8 wires handlers — the plan says commit Tasks 7+8 together; don't commit a red test alone.
- `remote-shim.ts` must gain the same `window.claude.syncSpaces` shape as `preload.ts` or React crashes on remote/Android (PITFALLS cross-platform rule #1). Android Kotlin handlers are NOT required in 1a (desktop-first phase) — remote-shim + remote-server passthrough is sufficient.
- Task 8's `service.ts` code block contains one flagged expression with explicit replacement instructions directly beneath it (module-level `logFn`) — apply them.
- Don't enable sync against real GitHub during the smoke test unless using a throwaway account; engine behavior is fully covered by the two-device integration test.

## 8. Definition of done

1. All 11 plan tasks checked off; every commit made per plan.
2. `cd desktop && npx vitest run` fully green and `npm run build` clean in the code worktree.
3. Dev-window smoke test done (picker shows managed projects; "New project" creates one; SyncPanel section renders).
4. PR open on `itsdestin/youcoded` from `feat/sync-spaces` (Task 11 has the body).
5. PITFALLS "Sync Spaces" section committed in the workspace repo; plan checkboxes updated; both pushed.
6. If a dev server was started, it's shut down after the PR is up ("pushing to master green-lights closing the dev server" — and don't leave 5223 held).
7. Report back: anything the plan got wrong (file moved, line drifted, API changed) goes into the plan file as a correction commit, and durable lessons into `docs/PITFALLS.md` or `docs/knowledge-debt.md`.

## 9. After 1a (context, not your job)

- **Plan 1b (SyncHub):** unblocked on identity (accounts Phase 1 landed; auth = platform session token per spec §6) but requires the DO-coordination conversation above. Needs its own plan.
- **Phase 2:** conversation store, session leases + handoff, personal-space expansion, backup simplification + GitHub-backup migration, legacy deletions.
- **"Connect GitHub" modal** is a GA prerequisite for making Sync the default onboarding path (spec §18) — not a 1a blocker, but don't ship marketing copy implying zero-setup sync until it exists.
