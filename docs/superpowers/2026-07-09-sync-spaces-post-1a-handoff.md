# Handoff: Sync Spaces after Phase 1a — merge, import follow-up, and Plan 1b

**Date:** 2026-07-09
**From:** the Phase 1a execution session (this session executed the whole 1a plan via superpowers:subagent-driven-development)
**Supersedes:** `docs/superpowers/2026-07-08-sync-spaces-phase1a-handoff.md` (fully executed — keep for history)
**Status at handoff:** Phase 1a implementation COMPLETE and pushed. PR open, not merged. Docs branch pushed, not merged to workspace master. Zero code written for the follow-up work described below.

---

## 1. Current state (verify before trusting — the world moves)

| Thing | Where | State |
|---|---|---|
| Phase 1a implementation | youcoded repo, branch `feat/sync-spaces`, worktree `youcoded.wt/sync-spaces` | **PR #107 open** (https://github.com/itsdestin/youcoded/pull/107), rebased onto master as of 2026-07-08 evening (includes the accounts-client and artifact-viewer merges). 19 commits. Full suite 1283 tests green, tsc + `npm run build` clean, live dev-window smoke test done. |
| Workspace docs | youcoded-dev repo, branch `spec/cross-device-sync`, worktree `youcoded-dev.wt/cross-device-sync` | Pushed through `664fa1e`. Contains: spec, 1a plan (all 55 boxes checked + execution log/corrections), PITFALLS "Sync Spaces" section, knowledge-debt entry, this handoff. **Not merged to workspace master yet.** |
| `~/YouCoded/` on this machine | Destin's home dir | Removed after smoke test (was empty). The app recreates it at boot once the PR ships. |
| Dev server / ports | — | Shut down. 5223/9333/9950 free at handoff time. |

**Read in this order:** (1) this doc; (2) spec `docs/superpowers/specs/2026-07-03-cross-device-sync-design.md` — §3 import/migration (expanded 2026-07-09), §6 SyncHub, §17 phasing, §18 risks; (3) the 1a plan's **"Execution log & plan corrections"** + **"Required follow-up"** sections at the bottom of `docs/superpowers/plans/2026-07-03-sync-spaces-phase1a.md` — the corrections list is the fastest way to learn what the code actually does where it deviates from the plan's inline code; (4) `docs/PITFALLS.md → Sync Spaces` — the invariants; (5) `docs/knowledge-debt.md` → "Sync spaces: no import path for existing folders".

## 2. The work queue (in rough order)

### A. Merge PR #107 — Destin's call, then mechanical cleanup
When Destin approves/merges (remember: "merge" means merge AND push):
1. Verify the merge landed: `git branch --contains <tip-sha>` lists master in `youcoded/`.
2. Remove the code worktree + branch: `cd youcoded && git worktree remove ../youcoded.wt/sync-spaces && git branch -D feat/sync-spaces`. **No node_modules junction exists in that worktree** (it has its own real `npm ci` install), so plain `git worktree remove` is safe.
3. Merge `spec/cross-device-sync` → workspace master and push (this carries the PITFALLS section + plan + spec updates to where every future session reads them). Then remove the `youcoded-dev.wt/cross-device-sync` worktree + branch the same way.

### B. Import-existing-folders follow-up (REQUIRED before the rebuild is "complete")
Decided with Destin 2026-07-09. Full requirements live in **spec §3** (expanded) and the knowledge-debt entry; §17 assigns it as "Phase 1-followup." Summary:
- **Flow 1 — convert existing project:** "Sync this project" on existing saved-folder rows (session picker and/or Project View) → plain-language confirm ("YouCoded will move this folder to `~/YouCoded/Projects/<name>/` so it can sync across your devices. Is this okay?") → MOVE the folder → update `~/.claude/youcoded-folders.json` → init the space.
- **Flow 2 — folder-picker import:** in the new-project flow, "choose an existing folder" via the native picker (`dialog.openFolder` IPC already exists) → same consent + move treatment.
- **Move, not copy, is the default** (copy silently forks the user's work). Name via `validateSyncName`. Existing git repos inside are fine (hidden GIT_DIR; `.git/` ignored). Huge trees → §18 watcher-scale guardrail, not a hang.
- **Integrity work is the real substance:** artifact sidecars live INSIDE the folder (`.youcoded/` travels with the move — fine), but the artifact **central index** and saved-folders entries key on canonical ABSOLUTE paths (`canonicalize()` — see PITFALLS → Artifact Viewer), and conversation/cwd associations reference the old path. Enumerate every path-keyed store and decide remap-vs-degrade per store. Block (or warn hard) if a live session has the folder as cwd. Windows: moving a folder another process has open fails — handle EBUSY/EPERM with a clear message.
- Process: this needs its own plan (superpowers:writing-plans → subagent-driven execution). It's small — likely 4–6 tasks. Requirements are firm enough that brainstorming is optional; go straight to a plan unless something surprises you.

### C. Plan 1b — SyncHub (instant sync signals)
Unblocked on identity (platform session token per spec §6) but **blocked on coordination**: the platform Worker has no Durable Object / WebSocket infrastructure, and the accounts track's `PresenceRoom` (their Phase 2) needs the same foundation. Whoever lands the first DO sets the `wrangler.toml` `[[durable_objects]]` + migrations + WS-upgrade pattern. **Do not start 1b without checking what the accounts track has landed** (`cd wecoded-marketplace && git fetch && git log origin/master` — look for PresenceRoom/DO work). Needs its own plan either way.

### D. Phase 2 — conversations + handoff (later)
Conversation Store, session leases, warm handoff, GitHub-backup migration, legacy sync-service deletions. Spec §9/§10/§11/§12. Don't touch the legacy `sync-service.ts` until this phase.

## 3. How 1a was executed (repeat this for B)

- **superpowers:subagent-driven-development**: fresh implementer subagent per task, then a spec-compliance reviewer, then a code-quality reviewer, ALL on Opus (Destin's standing preference — Sonnet shipped prod bugs before). Review loops until approved; the loops were not ceremony — they caught **9 real bugs** in the plan's own code (silent second-device failures, conflict-copy data loss, secret leaks into backups, a main-process crash, a repo-name collision that cross-syncs distinct projects). Details in the plan's execution log.
- Implementers get the FULL task text pasted in (never "read the plan file"), the worktree path, and the sharp edges below.
- Check plan checkboxes in the workspace repo as tasks complete; commit docs at milestones.
- Every non-trivial edit gets a WHY comment (Destin is a non-developer — hard rule).

## 4. Sharp edges learned this session (will bite you too)

- **`npm test` runs vitest in WATCH mode and hangs agents.** Always `npx vitest run <file>` from `desktop/`.
- **Env contamination breaks tests falsely:** shells that ran a dev server carry `YOUCODED_PORT_OFFSET`/`YOUCODED_PROFILE`, which make `remote-config.test.ts` / `ipc-handlers.test.ts` fail with bizarre port/`app.setPath` errors. Run full suites as `env -u YOUCODED_PROFILE -u YOUCODED_PORT_OFFSET npx vitest run`. (An earlier session mislabeled these as "pre-existing flaky failures" — they are not; the suite is genuinely 100% green.)
- **The transport contract suite owns its own 30s timeout** (`vi.setConfig` inside `tests/sync-transport-contract.ts`). Don't raise the global vitest timeout; don't strip the suite-local one. Real-git tests take 45–85s total on this machine — that's normal.
- **After any rebase onto master, re-run `npm ci` in `desktop/`** — parallel tracks keep adding deps (artifact-viewer added pdfjs-dist/exceljs/ulid mid-session and tsc broke until reinstall).
- **`tests/ipc-channels.test.ts` is the adjacency-conflict magnet.** Every parallel track appends a describe at the end of the file. On rebase conflict: keep BOTH describes; both sides share the trailing `});\n});` closers, so the resolution needs the HEAD block re-closed before inserting ours (this session's resolution: HEAD content + `  });\n});` + our block + shared closers). Run the file after — it should pass with everyone's tests (95 at handoff time).
- **Port 5223 orphans:** a dead Vite server from a June session held 5223. Check `netstat -ano | grep :5223`, verify the PID's CommandLine points at a youcoded vite.js (NOT Destin's built app), then kill.
- **Smoke-testing a WORKTREE branch:** `scripts/run-dev.sh` cds into the MAIN `youcoded/` checkout — useless for branch verification. Replicate it manually from the worktree: export `YOUCODED_PORT_OFFSET=50 YOUCODED_PROFILE=dev`, unset the CC session markers (list in run-dev.sh), start `npm run dev:renderer` (background), `npx wait-on http://localhost:5223`, then `npx tsc -p tsconfig.json && node -e "require('fs').cpSync('src/main/pty-worker.js','dist/main/pty-worker.js')" && npx electron . --remote-debugging-port=9333` (background). Verify via CDP: copy `scripts/cdp-eval.mjs` INTO `desktop/` first (it imports `ws`, which resolves relative to the script file, not cwd). Kill the electron+node PIDs directly afterward — TaskStop on the shell does not kill Windows child processes; confirm 5223/9333 freed. Probing the dev window is sanctioned; **never** touch Destin's live built app (`.claude/rules/live-app-safety.md` overrides everything).
- **Watch your cwd across Bash calls** — this session twice created stray files by running heredoc appends in the wrong worktree (the shells persist cwd, and compound commands that `cd` then fail leave you somewhere unexpected). `pwd` before writes that use relative paths.
- **Transient `ConnectionRefused` API errors killed two subagents mid-flight** this session. Their work survives on disk/in-transcript: check `git status` in the worktree, read the task output file, verify + commit inline rather than re-dispatching blind.

## 5. Decisions already made — do NOT re-litigate

Everything in the 2026-07-08 handoff §6 still stands (GIT_DIR env never separate-git-dir; nothing written into the user's tree; remote-wins-canonical convergent conflicts; contract suite = transport boundary; legacy sync-service untouched in 1a; Personal = `~/YouCoded/Personal/**` only in 1a; no status glyphs — plain words). New decisions from 1a execution + 2026-07-09:

- **`* -text` in info/attributes, NOT `* text=auto`** (empirically: text=auto overrides autocrlf=false and CRLF-mangles Windows checkouts; byte-fidelity is pinned by contract tests).
- **`repoNameForSpace` = slug + sha1(lowercased id) suffix.** The hash is load-bearing (collision/empty-slug safety); lowercasing is load-bearing (same folder name in different case across devices must map to one repo).
- **Already-existing GitHub repo = provisioning success** (per-device state file; device 2 must reuse device 1's repos).
- **Import flows (spec §3) are a completion prerequisite** — same tier as the Connect-GitHub modal. **Move, not copy.**
- **Android has NO syncspaces Kotlin handlers in 1a by design** — shim's 30s invoke timeout + renderer rejection handling carry it; add `not-implemented-on-mobile` stubs when the mobile phase starts.
- The full invariant list lives in `docs/PITFALLS.md → Sync Spaces` — read it before touching `desktop/src/main/sync-spaces/`.

## 6. Concurrency — parallel tracks are STILL active

- The **accounts track** merged `feat/accounts-client` to youcoded master mid-session and is likely building Phase 2 (friends/presence/PresenceRoom DO). Rules from the previous handoff stand: don't touch `marketplace-auth-store.ts` / `marketplace-api-*` / `account:*` IPC / `wecoded-marketplace` at all; rebase before touching shared files (`shared/types.ts`, `preload.ts`, `remote-shim.ts`, `ipc-handlers.ts`, `main.ts`, `tests/ipc-channels.test.ts`); expect adjacency conflicts there and resolve keep-both.
- Other worktrees under `youcoded.wt/` (`artifact-viewer`, `accounts-client`, `opencode-mvp`) are not yours to clean up.
- Only one dev instance can hold port 5223 — check before smoke tests.

## 7. Definition of done for the next session (work item B)

1. Plan written for the import flows (workspace repo, `docs/superpowers/plans/`), reviewed against spec §3.
2. Executed task-by-task with Opus implementers + two-stage review; all tests green (`env -u ...` form), tsc + build clean.
3. Live dev-window verification: move a scratch folder in via BOTH flows; confirm files land in `~/YouCoded/Projects/<name>/`, the picker updates, artifacts/conversations for the moved project still resolve, and a live-session guard fires when applicable.
4. PR on `itsdestin/youcoded`; PITFALLS additions if new invariants emerged; knowledge-debt entry resolved (delete it); plan checkboxes + docs pushed.
5. Dev server shut down, ports freed, no stray files (check `git status` in BOTH worktrees and `pwd` discipline).
