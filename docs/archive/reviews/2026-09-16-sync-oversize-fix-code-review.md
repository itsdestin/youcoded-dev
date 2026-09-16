---
status: active
branch: session/sync-oversize-fix (youcoded)
reviewer: fresh code reviewer (scripts/ui-review/code-reviewer.md)
date: 2026-09-16
---
# Code review — sync-oversize-fix

Diff: `git -C youcoded diff origin/master...HEAD` (6 commits, 15 files). No contract file, so the
five promises stated in the brief were used as the rows.

## verify.sh

```
verify: /home/destin/youcoded-dev/worktrees/sessions/sync-oversize-fix/youcoded (base origin/master)
  tests: related to 14 changed file(s) + 72 source-scanning guards

PASS  types (tsc --noEmit)
PASS  types in tests/ (tsc --noEmit, 57 file(s) still excluded)
PASS  tests (related)
PASS  dead code (knip)
PASS  lint (eslint)
PASS  invariants (ast-grep)

OK — all checks passed.
   Not covered: Android (./gradlew test), marketplace worker.
```

How the git findings were checked: throwaway vitest files that drive the real `GitTransport` /
`SpaceSyncEngine` against a local bare repo with `maxFileBytes: 10`. They were copied into
`desktop/tests/`, run once and deleted right away, so nothing is left in the worktree. Plain git
probes ran under `/tmp/claude-1000/` on git 2.55.0.

## Findings

- F1 — youcoded/desktop/src/main/sync-spaces/git-transport.ts:406 (pull's discarded `unstageOversize` result) + engine.ts:193 — a NEW (untracked) file over the cap is never reported, so promise 2 fails for that whole class of file: every engine cycle runs `pull()` first, pull's `unstageOversize` unstages the file and writes its `info/exclude` line but throws the list away, and push's `add -A` then skips the now-excluded file, so `push.oversize` is `[]`. This repeats after every relaunch, because init rewrites `exclude` and the first pull swallows the file again — confirmed with a real engine and transport: write `video.bin` (11 B > 10 B cap) and sync three times, and the events are only `synced, synced, synced`, with no `oversize` event.
- F2 — youcoded/desktop/src/main/sync-spaces/git-transport.ts:381-382 — when the over-cap file is the ONLY unpublished change, the folded commit has nothing to commit, but git words that as "no changes added to commit" (tracked file modified on disk) or "nothing added to commit but untracked files present", and `isNothingToCommit` matches neither, so `push()` throws "Sync failed … (git commit)". The user sees "Couldn't sync" with raw git text for a cycle, and the gear now turns red too; the next cycle heals. Confirmed: three scenarios all THREW — a tracked file grown past the cap and committed, a new big file committed after a first push, and a big file as the only content on the very first push. The following pull+push returned `{pushed:false, oversize:['chat.jsonl']}` with nothing oversize on the remote.
- F3 — youcoded/desktop/src/main/sync-spaces/git-transport.ts:368,377 (also the older :300 in `unstageOversize`) — over-cap paths are passed to `git reset` / `git rm` as pathspecs rather than literal names. A file whose name starts with `:` is read as pathspec magic, silently resets nothing, and its over-cap blob IS pushed, which breaks promise 1. A name with glob characters (`f[1].md`) also resets `f1.md` to its published version, so that file's local change misses this push and goes out a cycle late. Confirmed: after the fold, `:big` (11 B) reached the bare remote (largest blob 11), and remote `f1.md` stayed `v1` while local was `v2`. Fix: `--literal-pathspecs` or `GIT_LITERAL_PATHSPECS=1`.
- F4 — youcoded/desktop/src/main/sync-spaces/engine.ts:156-163 × service.ts:354,375,380-387 — `startEngine` fires `void e.syncSpace(space)` for Personal and then `await e.syncSpace(personalSpace)`. With the new mid-sync waiting, that await now lasts for the startup sync AND a full follow-up sync (before, it returned at once), and `backfillRegistry`, `runDiscovery` and the whole SyncHub socket creation sit behind it. On a device with a backlog (the incident device: 3,300 commits), instant cross-device sync and project discovery start minutes late on every launch. Confirmed by reading the call chain. The same widening applies to `pushPersonal()` (rename, stop, description IPC now wait for the in-flight run plus a follow-up).
- F5 — youcoded/desktop/src/main/sync-spaces/git-transport.ts:365-378 — `reset --soft`, `reset origin/main -- <big>`, `update-ref -d` and `rm --cached` are asserted with no `isLockContended` allowance. A live second writer holding `index.lock` between the soft reset and the path reset throws a red "Sync failed (git reset)", although this second-app-copy race is the very scenario the fold exists for. That breaks the file's own rule that every lock-taking op treats contention alike. By reading, the state left behind (main = origin/main, index and worktree intact, or an unborn main with a full index) heals on the next cycle, so this is a false error, not data loss. Confirmed by reading; the lock race itself was not reproduced. [PLAUSIBLE]
- F6 — youcoded/desktop/src/renderer/App.tsx:2349-2362 — the gear dot refreshes only on `error`/`synced` events, and turning sync off emits neither (`syncSpacesEnable(false)` → `teardownHub` + `engine.stop()` broadcast nothing). A gear that was red stays red for the rest of the launch after the user turns sync off, while the panel shows "off". Confirmed by reading service.ts:552-572 and 436-445. Separately, concurrent `load()` calls can resolve out of order, so an older status could overwrite a newer one (minor).
- F7 — youcoded/desktop/src/main/sync-spaces/git-transport.ts:348-354 — `big` is every over-cap entry in main's WHOLE tree, not just the ones the push would send. An over-cap file already on GitHub and unchanged is therefore returned in `oversize` whenever some other file triggers the fold, and the panel reports it as "too big to sync" although its published copy is current. Confirmed: the rev-list probe does not list a big blob unchanged at the remote tip, so the fold fires only because of another file, while `ls-tree` still lists the first.
- F8 — youcoded/desktop/src/main/sync-spaces/service.ts:357 (with SyncPanel.tsx:1156) — Connect GitHub now requires `errorCode === 'github-auth'`, but the enable/launch provisioning failure is broadcast WITHOUT `errorCode`, although `github-client`'s `notConnectedError` carries it. A signed-out user who turns sync on sees only "Try again" until the engine's first debounced cycle (~15 s) re-emits the coded error. Confirmed by reading the broadcast and `github-client.ts:63-72`. Whether every "not signed in" path reaches this broadcast was not traced. [PLAUSIBLE]
- F9 — youcoded/desktop/src/main/sync-spaces/service.ts:591-605, main.ts:1037 — `syncSpacesSyncNow` now waits for the sync to finish, so `syncSpacesSyncNowAwaited` is a near-duplicate (it only adds a timeout and requires a space id). Its WHY comment, and the one in main.ts, still say `syncSpacesSyncNow` is "fire-and-forget (void engine.syncSpace)", which is no longer true. Confirmed by reading.
- F10 — youcoded/desktop/src/main/sync-spaces/git-transport.ts:340-344 — `--no-object-names` needs a newer git (added around 2.2x in 2019) and is not needed: `--filter-print-omitted` prefixes omitted oids with `~` either way. On an older system or bundled git, rev-list fails, `assertLocalOk` throws, and EVERY push fails. The exact version was not verified offline. [PLAUSIBLE]
- F11 — youcoded/desktop/src/main/sync-spaces/git-transport.ts:381-383 + :283 — if the fold leaves the index equal to `origin/main` and the tree clean (the big file untracked and already in `exclude`), the "nothing to commit" branch counts as success. `git push` then answers "Everything up-to-date" with exit 0, `push()` returns `pushed:true`, and the engine's `synced{pushed:true}` sends a SyncHub signal for nothing (the rule: signal ONLY on a real push). Confirmed by reading; not run. [PLAUSIBLE]
- F12 — youcoded/desktop/src/main/sync-spaces/git-transport.ts:249,262,283 — after a fold, `commit` still holds the pre-fold sha, which is no longer on main, and the `dropped === null` return drops `commit` altogether, so `PushResult.commit` does not describe what happened. Today no caller reads it (checked with rg over engine.ts/service.ts). Low. Confirmed by reading.

## Promise check

1. Never pushes an over-cap file — holds for normal names, including the non-fast-forward retry
   path (confirmed: a peer push plus a leaked big file gave `pushed:true`, peer file received, remote
   max blob 4 B). Broken for `:`-prefixed names (F3); false error when the big file is the only
   change (F2).
2. Over-cap files shown — broken for new untracked files (F1); over-reports published files (F7).
3. Sync now / mid-sync waiting — works as described (engine test is sound; no deadlock found,
   because `onEvent` listeners never await `syncSpace` inside a chain, and `stop()` early-returns the
   follow-up). Startup side effect: F4. The remote shim's 30-min timeout is fine: a dropped
   connection rejects pending requests at once (`failRequestsCutOffByDrop`).
4. Gear dot — works; goes stale on disable (F6).
5. Button layout / Connect GitHub gating — implemented; startup gap F8.

## Not covered

- Android: `window.claude.syncSpaces.status` refuses quietly on the phone and App.tsx catches it;
  `./gradlew test` was not run (no Kotlin touched).
- An already-dirty tracked over-cap file that a peer also edits makes `merge` refuse ("local
  changes would be overwritten"), and `pull()` then throws "Sync merge could not complete" every
  cycle. That behaviour predates this branch but becomes more reachable once a fold leaves the file
  dirty. Reasoned only; not run.
- Windows specifics (Git for Windows version, path separators in `ls-tree` output feeding
  `currentOversize`'s `path.join`) were not exercised.
- `status()` cost: it adds one `statSync` per reported file plus a `roots.spaces()` call per space
  with reports. That looked cheap and was not measured.
- SyncPanel rendering (Callout collapsible, action-row alignment) was checked by reading plus the
  existing DOM test; no screenshot was taken.

One-line design note: holding a published over-cap file at its old version means peers silently
keep a stale copy while this device keeps writing. The panel copy says "other devices won't get
new changes", which is accurate, so no objection.

## Triage (implementing session)

- F1 accepted — push() now also reports over-cap files kept out through info/exclude and still over the cap (`excludedOversize`); pinned by "keeps reporting a new over-cap file after an earlier cycle excluded it".
- F2 accepted — the fold checks `diff --cached --quiet` and ends with nothing to send instead of committing; pinned by "an over-cap file that is the only unpublished change ends quietly" and "…is the whole first commit is never pushed".
- F3 accepted — every git call runs with `GIT_LITERAL_PATHSPECS=1`; exclude lines escape glob/comment characters; pinned by "holds back a file whose name starts with a colon".
- F4 accepted — startEngine no longer awaits a second Personal sync; pushPersonal no longer blocks rename/stop/description.
- F5 accepted — every fold step treats lock contention as "skip this cycle".
- F6 accepted — disabling sync broadcasts `projects-changed`; the gear reloads on any event and ignores out-of-order answers; pinned in sync-spaces-service.test.ts.
- F7 accepted — held-back files are limited to ones that differ from the published tip; pinned by "does not report a big file that is already published and unchanged".
- F8 accepted — the startup provisioning error keeps its `errorCode`.
- F9 accepted — syncSpacesSyncNowAwaited is now a timeout around syncSpacesSyncNow; stale comments fixed.
- F10 accepted — `--no-object-names` dropped from the scan.
- F11 accepted — fixed with F2 (nothing to send → pushed:false, no hub signal).
- F12 accepted — PushResult.commit is the folded commit.
- Not covered (dirty over-cap file + peer edit → merge refuses every cycle) — filed on the roadmap (sync).
