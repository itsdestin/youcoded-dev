---
status: shipped
---

# Handoff: Execute Accounts Phase 1 (Subagent-Driven)

**Date:** 2026-07-07
**From:** the accounts/friendship consolidation session (design + Phase 0 complete)
**For:** a fresh session executing Phase 1
**First action for the executing session:** read this file, then invoke the **superpowers:subagent-driven-development** skill and execute the two plans below IN ORDER.

---

## 1. What you are executing

Two approved, self-review-passed implementation plans (both on `youcoded-dev` master, commit `ddf5db2`):

1. **`docs/superpowers/plans/2026-07-07-accounts-phase1-worker.md`** — FIRST. Repo: `wecoded-marketplace`. The D1 identity rebuild + account endpoints. Must be merged AND CI-deployed before plan 2's final verification.
2. **`docs/superpowers/plans/2026-07-07-accounts-phase1-client.md`** — SECOND. Repo: `youcoded`. The `account:*` IPC rename + Settings Account UI + handle prompt. Tasks 1–8 can build against mocks before the Worker deploys; Task 9 (runtime pass) cannot.

Authoritative design: `docs/superpowers/specs/2026-07-03-youcoded-accounts-friendship-consolidated-design.md` (read §1, §5, §6, §7 before starting; the plans reference it by section).

## 2. State of the world (verified 2026-07-07)

- **Phase 0 (games → marketplace identity) is MERGED and runtime-verified:** youcoded master `10eac9ca`. The games lobby uses `useMarketplaceAuth().user.login`; the `github:auth` IPC is gone.
- **Worker has two recent auth additions already live** (shipped mid-Phase-0, PR wecoded-marketplace#17): the poll `complete` response includes a `user` object, and `GET /auth/me` exists. Plan 1's Task 1 REBUILDS both onto the new schema — they're in `src/auth/routes.ts` (`fetchMe`, the poll handler tail).
- **Desktop stores token + profile now, with a lazy `/auth/me` heal** in `marketplace-api-handlers.ts` (`marketplace:auth:user` handler). Plan 2 renames + extends this — don't duplicate the heal.
- **Prior-session bug context you may hit:** before #17, sign-in stored ONLY the token (`user` stayed null forever). Destin's dev profiles may still contain token-only stores; the heal fixes them on first `user()` read.
- **Deliberate consequence of plan 1:** the migration drops all `sessions` rows. Every existing sign-in (~4 users) dies; users sign in again once. Expected, not a bug. There is also a known seconds-long error window between CI's migration step and code deploy — don't merge plan 1 mid-demo.

## 3. Standing workspace rules that bit us this session (obey them)

- **Worktrees for everything.** Plans specify exact `git worktree add` commands and the `<repo>.wt/<name>` convention. `node_modules` in worktrees: real `npm ci`, never junctions.
- **Never `wrangler deploy`.** Worker ships via PR → merge → CI (test → migrate → deploy → secrets).
- **Pre-existing desktop test failures on youcoded master:** `tests/ipc-handlers.test.ts` (electron mock crash, 0 tests run) and 3 tests in `tests/remote-config.test.ts`. NOT yours. Anything beyond those: your regression. Verify by running the same files on a clean master checkout — and run the suite with NO dev instance running from the same worktree (a live dev app contaminated one run with 4 phantom failures this session).
- **Dev-instance ports:** 5223 is held by a long-orphaned Vite (main checkout, June 17 — killable); 5273 belongs to the artifact-viewer session's LIVE dev instance (June 22 — do NOT kill). Use `YOUCODED_PORT_OFFSET=150` / `YOUCODED_PROFILE=dev2` (port 5323) like Phase 0 did, and check `netstat` first. When launching dev from a Claude session, unset the `CLAUDECODE*`/`CLAUDE_*` env vars (see `scripts/run-dev.sh` lines 24–26).
- **Marketplace auth store location:** Electron `userData` (`%APPDATA%/youcoded-<profile>/marketplace-auth.json`), NOT `~/.claude`. Each profile has its own sign-in. Android: SharedPreferences `"marketplace_auth"`.
- **Use Opus subagents for implementation tasks** (Destin's standing preference — Sonnet shipped production bugs before).
- **Destin is a non-developer:** WHY comments on non-trivial edits; report to him in plain language.

## 4. Human-in-the-loop steps (cannot be done by agents)

1. **Worker plan Task 7 Step 4:** the `ADMIN_USER_IDS` repo secret (wecoded-marketplace → Settings → Secrets → Actions) must change from `github:<id>` format to Destin's bare numeric GitHub id (`gh api user --jq .id`) BEFORE merging plan 1. Ask Destin to do it or do it via gh if permissions allow.
2. **Client plan Task 9 Step 3:** runtime verification needs Destin at the keyboard (browser sign-in, handle prompt, Settings Account pass). Coordinate before starting that task.
3. After plan 1 deploys, Destin's app sessions are signed out — tell him that's expected when it happens.

## 5. Adjacent in-flight work (don't collide)

- **Cross-device sync session** (worktree `youcoded-dev.wt/cross-device-sync`): its SyncHub work is REQUIRED to wait for this Phase 1 and to key sync groups by account id — coordination memo at `docs/superpowers/investigations/2026-07-03-sync-accounts-coordination.md`. Both tracks touch `wecoded-marketplace/worker/auth/` and `wrangler.toml`: land plan 1's migration as `0003_*` and expect the sync session to rebase on it.
- **artifact-viewer session:** live dev instance + uncommitted worktree `youcoded.wt/artifact-viewer`. No file overlap with Phase 1; just don't kill its processes or ports.
- **Two-user lobby verification** (Phase 0 leftover): whenever a second real user is available, confirm two marketplace-signed-in users see each other in the games lobby. Not a Phase 1 blocker; it's the Phase 2 presence gate.

## 6. After both plans land

- Update the spec's Status line (Phase 1 merged, shas) — plan 2 Task 9 Step 5 covers this.
- Report completion + any deviations back to Destin.
- Next up per the spec's §7: **Phase 2 (friends + presence + games)** — needs its own implementation plan (writing-plans skill) against spec §2/§3; do NOT start it without Destin's go-ahead.

## 7. Artifact index

| Artifact | Where |
|---|---|
| Consolidated design spec | `docs/superpowers/specs/2026-07-03-youcoded-accounts-friendship-consolidated-design.md` |
| Worker plan (execute 1st) | `docs/superpowers/plans/2026-07-07-accounts-phase1-worker.md` |
| Client plan (execute 2nd) | `docs/superpowers/plans/2026-07-07-accounts-phase1-client.md` |
| Sync coordination memo | `docs/superpowers/investigations/2026-07-03-sync-accounts-coordination.md` |
| Phase 0 spec (executed) | `docs/superpowers/specs/2026-06-13-games-marketplace-identity-design.md` |
| Superseded session docs (history only) | `docs/superpowers/2026-07-01-friendship-model-session-status.md`, `docs/superpowers/investigations/2026-07-01-github-auth-consolidation-status.md` |
| Worker auth fix that unblocked Phase 0 | wecoded-marketplace PR #17 (`bd33c3c` on its master) |
