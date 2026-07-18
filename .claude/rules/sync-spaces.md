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
last_verified: 2026-07-18
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
  - path: youcoded/desktop/src/main/device-identity.ts
    contains: "getMachineIdentity"
  - path: youcoded/desktop/src/main/sync-spaces/device-registry.ts
    contains: "removeDevice"
  - test: youcoded/desktop/tests/device-identity.test.ts
  - test: youcoded/desktop/tests/sync-transport-contract.ts
  - test: youcoded/desktop/tests/sync-spaces-git-transport.test.ts
  - test: youcoded/desktop/tests/sync-spaces-engine.test.ts
  - test: youcoded/desktop/tests/sync-hub-socket.test.ts
  - test: youcoded/desktop/tests/device-activity-label.test.ts
  - test: youcoded/desktop/tests/sync-warnings-lifecycle.test.ts
  - test: youcoded/desktop/tests/github-connect.test.ts
---

# Sync Spaces, SyncHub, backup & GitHub-connect

**Depth + invariants not listed here: `youcoded/docs/sync-spaces.md`.**

## Git transport (`sync-spaces/git-transport.ts`) — guard: `sync-spaces-git-transport.test.ts`, `sync-transport-contract.ts`
- **`GIT_DIR` env, not `--separate-git-dir`** (a `.git` FILE collides with a dev's repo); ignores/attributes in `$GIT_DIR/info/`, never the user's tree.
- **`info/attributes` = `* -text`, NOT `text=auto`** (Windows LF→CRLF breaks byte fidelity).
- **Convergent conflicts: REMOTE wins the canonical name, LOCAL becomes a visible conflict copy** (local-wins never converges). `merge --allow-unrelated-histories` is load-bearing. Copy content: Buffer via `showStage()`, `maxBuffer >= maxFileBytes` (string `git()` truncates >1MB).
- **`sync-transport-contract.ts` is the transport compatibility boundary**; **`repoNameForSpace` = slug + hash of the LOWERCASED space id** = the sync identity.

## Engine & service (`engine.ts`, `service.ts`) — guard: `sync-spaces-engine.test.ts`, `sync-spaces-service.test.ts`
- **Engine:** single-flight per space + one coalesced rerun; `addSpace` awaits chokidar `ready`; a persistent `watcher.on('error')` is required; `stop()` clears the state map FIRST, then awaits in-flight chains (Windows handles block removal). **`provisionGithubRemote` treats an existing repo as SUCCESS.** **`isIgnoredPath()` keeps backup scrub == sync scrub** (`DEFAULT_IGNORES`). No Android `syncspaces:*` handlers yet.

## SyncHub (`sync-hub-socket.ts` + worker `SyncGroupRoom` DO) — guard: `sync-hub-socket.test.ts`
- **DO is per-account, an ACCELERANT not a source of truth** — never optimize away the 120s poll. **spaceKey = `repoNameForSpace()`, never the local id.** **Signal ONLY on `pushed:true`.** **The hub send runs LAST in `broadcast()`, own try/catch.** **A superseded `startEngine` owns no global state.**
- **Per-device sync recency rides the SAME signal.** The `pushed:true` signal now also carries `deviceId` (the machineId) + server `at`; the DO stores a durable per-account `lastSyncByDevice` map (in DO storage) and ships it in `hello`. It is accelerant/presence-grade — losing it degrades a device row to the launch-time `lastSeen` fallback, never breaks. Client exposes it on `getSyncStatus()` + the `status:data` push; renderer's PURE `deviceActivityLabel` (`renderer/components/device-activity-label.ts`, guard `device-activity-label.test.ts`) renders "Synced just now" (<5min) / "Last synced X ago". **Self reads the LOCAL live `lastSyncEpoch`, NOT the map** — the DO never echoes a device's own signal back, so self's own map entry only refreshes on reconnect and would drift stale.

## Import (`sync-spaces/import-project.ts`) — guard: `sync-spaces-import.test.ts`
- **Import MOVES the folder — never copy-and-keep-both** (a survivor forks the work). The EXDEV branch re-checks `existsSync(dest)` BEFORE cpSync. Store remaps (`remapTranscriptDir` etc.) degrade to WARNINGS, never silent drops.

## Project UX + discovery (`project-registry.ts`, `renderer/components/sync-dot-state.ts`) — guard: `sync-dot-state.test.ts`, `sync-spaces-project-discovery.test.ts`
- **Sync dots (green/red/gray) are the ONE sanctioned status-color use** — derive ALL dot state from the pure `sync-dot-state.ts`; labels pinned.
- **Project registry at `~/YouCoded/Personal/ProjectSync/<name>.json` — VISIBLE per-file, NEVER under `.youcoded/`.** `state` = `stopped`-dominates monotonic (not LWW); `displayName` LWW; **fold-on-read** prevents resurrection. **Stop = tombstone + `engine.removeSpace` + keep folder** (gate: `activeManagedSpaces()`). Rename/stop ride 4-surface IPC parity (`ipc-channels.test.ts`).

## Device registry (`device-identity.ts`, `sync-spaces/device-registry.ts`) — guard: `device-identity.test.ts`, `sync-spaces-device-registry.test.ts`
- **TWO identities, NEVER merged: `getDeviceIdentity(userData)` = per-INSTALL (leases); `getMachineIdentity(builtAppUserData)` = per-MACHINE (registry).** **`getMachineIdentity` READS, never mints; `null` ⇒ register NOTHING** (else a row orphans per launch).
- **`main.ts` captures `BUILT_APP_USER_DATA` BEFORE the dev-profile `setPath`** — never hardcode the `youcoded` dirname (a `productName` ⇒ `null` ⇒ NO rows).
- **Machine id in `%APPDATA%`, NOT `~/.claude`** (dotfile-synced → merges two machines).
- **`removeDevice` deletes conflict copies too** (a survivor resurrects the row); **plain delete, NOT a tombstone**.
- **Self-marking uses `machineId` on BOTH surfaces** (`ipc-handlers.ts` + `remote-server.ts`); `deviceId` matches no row.

## Legacy backup / demolition (`snapshot-retention.ts`, `conversations/symlink-sweep.ts`, `sync-spaces/gc-policy.ts`)
- **`sweepProjectSymlinks()` is `lstat`-only, removes ONLY symlinks/junctions, NEVER recursive** — recursion through a junction irreversibly deletes the TARGET's real transcripts.
- **Drive/iCloud backup is WRITE-ONLY dated snapshots; restore was REMOVED** — don't re-add a Restore Wizard or auto-restore pull. The >500MB warning rides `notice`, NOT `error`; `git gc` is local `--auto` only.

## Sync Warnings (`sync-service.ts`, `sync-error-classifier.ts`) — guard: `sync-warnings-lifecycle.test.ts`, `sync-error-classifier.test.ts`
- **`~/.claude/.sync-warnings.json` (`SyncWarning[]`) is authoritative.** **Two writers, non-overlapping codes** (health-check vs `backendId`-keyed push); the merge replaces only its own codes. Push-failure warnings are non-dismissible.
- **Node-killed timeouts have empty stderr — route through `extractStderr(e, timeoutMs)`**, never raw `e.stderr || e.message` (else every timeout → `UNKNOWN`).

## Connect-GitHub Modal (`github-auth.ts`, `github-connect.ts`) — guard: `github-auth.test.ts`, `github-connect.test.ts`
- **The access token NEVER leaves the main process** — only into `gh auth login --with-token` stdin; never logged/thrown/in a payload/over WS. Reuse gh's client id `178c6fc778ccc68e1d6a`; don't wrap interactive `--web` (`completeLogin` must `stdin.end()`). **Orchestrator: singleton, PER-FLOW settle guard** (`activeFlowId`). gh-missing install = winget→`restartRequired`.
