---
paths:
  - "youcoded/desktop/src/main/sync-spaces/**"
  - "youcoded/desktop/src/main/sync-service.ts"
  - "youcoded/desktop/src/main/snapshot-retention.ts"
  - "youcoded/desktop/src/main/conversations/symlink-sweep.ts"
  - "youcoded/desktop/src/main/sync-hub-socket.ts"
  - "youcoded/desktop/src/main/sync-error-classifier.ts"
  - "youcoded/desktop/src/main/github-auth.ts"
  - "youcoded/desktop/src/main/github-connect.ts"
last_verified: 2026-07-15
verify:
  - path: youcoded/desktop/src/main/sync-spaces/engine.ts
  - path: youcoded/desktop/src/main/sync-spaces/git-transport.ts
    contains: "GIT_DIR"
  - path: youcoded/desktop/src/main/sync-hub-socket.ts
  - path: youcoded/desktop/src/main/sync-error-classifier.ts
    contains: "extractStderr"
  - path: youcoded/desktop/src/main/snapshot-retention.ts
  - path: youcoded/desktop/src/main/conversations/symlink-sweep.ts
  - path: youcoded/desktop/src/main/sync-spaces/gc-policy.ts
  - test: youcoded/desktop/tests/sync-transport-contract.ts
  - test: youcoded/desktop/tests/sync-spaces-git-transport.test.ts
  - test: youcoded/desktop/tests/sync-spaces-engine.test.ts
  - test: youcoded/desktop/tests/sync-hub-socket.test.ts
  - test: youcoded/desktop/tests/sync-warnings-lifecycle.test.ts
  - test: youcoded/desktop/tests/github-connect.test.ts
---

# Sync Spaces, SyncHub, backup & GitHub-connect

A hidden per-space git repo the app pushes/pulls + SyncHub instant signals + a daily backup. **Full depth + the invariants not listed here: `youcoded/docs/sync-spaces.md`.**

## Git transport (`sync-spaces/git-transport.ts`) — guard: `sync-spaces-git-transport.test.ts`, `sync-transport-contract.ts`
- **`GIT_DIR` env, not `--separate-git-dir`** (which drops a `.git` FILE colliding with a dev's own repo). Ignores/attributes go in `$GIT_DIR/info/`, never the user's tree.
- **`info/attributes` = `* -text`, NOT `text=auto`** — on Windows text=auto forces LF→CRLF, breaking byte fidelity.
- **Conflict policy is convergent: REMOTE wins the canonical name, LOCAL becomes a visible conflict copy** (local-wins never converges). `merge --allow-unrelated-histories` is load-bearing. Conflict-copy content is read as a Buffer via `showStage()` with `maxBuffer ≥ maxFileBytes` — the string `git()` helper corrupts binary/truncates >1MB → silent data loss.
- **`sync-transport-contract.ts` is the transport compatibility boundary** — a new `SyncTransport` must pass it unchanged. **`repoNameForSpace` = slug + hash of the LOWERCASED space id** (the sync identity).

## Engine & service (`engine.ts`, `service.ts`) — guard: `sync-spaces-engine.test.ts`, `sync-spaces-service.test.ts`
- **Engine:** single-flight per space + one coalesced rerun; `addSpace` awaits chokidar `ready`; a persistent `watcher.on('error')` is required; `stop()` clears the state map FIRST then awaits in-flight chains (Windows handles block folder removal).- **`provisionGithubRemote` treats an already-existing repo as SUCCESS** (per-device state → second device re-provisions). **`isIgnoredPath()` keeps backup scrub == sync scrub** (`DEFAULT_IGNORES`). Android has no `syncspaces:*` handlers yet.

## SyncHub (`sync-hub-socket.ts` + worker `SyncGroupRoom` DO) — guard: `sync-hub-socket.test.ts`
- **DO is per-account, an ACCELERANT not a source of truth** — never optimize away the 120s poll. **spaceKey = `repoNameForSpace()`, never the local id.** **Signal ONLY on `pushed:true`** (loop breaker). **The hub send runs LAST in `broadcast()`, own try/catch** (never block local/remote delivery). **A superseded `startEngine` owns no global state.**

## Import (`sync-spaces/import-project.ts`) — guard: `sync-spaces-import.test.ts`
- **Import MOVES the folder — never copy-and-keep-both** (a surviving copy forks the user's work). The EXDEV branch re-checks `existsSync(dest)` BEFORE cpSync. Store remaps after the move (`remapTranscriptDir` etc.) degrade to WARNINGS, never silent drops.

## Project UX + discovery (`project-registry.ts`, `renderer/components/sync-dot-state.ts`) — guard: `sync-dot-state.test.ts`, `sync-spaces-project-discovery.test.ts`
- **Sync dots (green/red/gray) are the ONE sanctioned status-color use** — derive ALL dot state from the pure `sync-dot-state.ts` (labels are a pinned contract).
- **Project registry at `~/YouCoded/Personal/ProjectSync/<name>.json` — VISIBLE per-file, NEVER under `.youcoded/`.** `state` is `stopped`-dominates monotonic (not LWW); `displayName` LWW; **fold-on-read** keeps a stopped project from resurrecting. **Stop = tombstone + `engine.removeSpace` + keep folder**, gated by `activeManagedSpaces()`. Rename/stop ride 4-surface IPC parity (`ipc-channels.test.ts`).

## Legacy backup / demolition (Plan 2c — MERGED, youcoded PR #126; modules `snapshot-retention.ts`, `conversations/symlink-sweep.ts`, `sync-spaces/gc-policy.ts`)
- **`sweepProjectSymlinks()` is `lstat`-only, removes ONLY symlinks/junctions, NEVER recursive** — recursion through a junction deletes the TARGET's real transcripts (irreversible; highest-consequence sync invariant).
- **Drive/iCloud backup is WRITE-ONLY dated snapshots; restore was REMOVED** — don't re-add a Restore Wizard or auto-restore pull. The >500MB warning rides a `notice` event kind, NOT `error`; `git gc` is local `--auto` only.

## Sync Warnings (`sync-service.ts`, `sync-error-classifier.ts`) — guard: `sync-warnings-lifecycle.test.ts`, `sync-error-classifier.test.ts`
- **`~/.claude/.sync-warnings.json` is authoritative** (`SyncWarning[]`). **Two writers, non-overlapping codes** (health-check vs `backendId`-keyed push); the health-check merge replaces only its own. Push-failure warnings are non-dismissible.
- **Node-killed timeouts have empty stderr — route through `extractStderr(e, timeoutMs)`**, never raw `e.stderr || e.message` (else every timeout → `UNKNOWN`).

## Connect-GitHub Modal (`github-auth.ts`, `github-connect.ts`) — guard: `github-auth.test.ts`, `github-connect.test.ts`
- **The access token NEVER leaves the main process** — only into `gh auth login --with-token` stdin; never logged/thrown/in a payload/over WS. Reuse gh's client id `178c6fc778ccc68e1d6a`; don't wrap interactive `--web` (`completeLogin` must `stdin.end()`). **Orchestrator is a singleton with a PER-FLOW settle guard** (`activeFlowId`). gh-missing install = winget→`restartRequired`.
