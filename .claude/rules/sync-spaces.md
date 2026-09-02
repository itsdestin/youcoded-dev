---
paths:
  - "**/desktop/src/main/sync-spaces/**"
  - "**/desktop/src/main/sync-service.ts"
  - "**/desktop/src/main/snapshot-retention.ts"
  - "**/desktop/src/main/conversations/symlink-sweep.ts"
  - "**/desktop/src/main/sync-hub-socket.ts"
  - "**/desktop/src/main/sync-error-classifier.ts"
  - "**/desktop/src/main/github-auth.ts"
  - "**/desktop/src/main/github-connect.ts"
  - "**/desktop/src/main/github-client.ts"
  - "**/desktop/src/main/github-fork-publish.ts"
last_verified: 2026-09-01
verify:
  - path: youcoded/desktop/src/main/github-client.ts
    contains: "createGithubClient"
  - path: youcoded/desktop/src/main/github-fork-publish.ts
    contains: "forkPublish"
  - test: youcoded/desktop/tests/github-fork-publish.test.ts
  - path: youcoded/desktop/src/renderer/state/sync-display-state.ts
    contains: "deriveSettingsRowState"
  - test: youcoded/desktop/tests/sync-display-state.test.ts
  - path: youcoded/desktop/src/main/sync-spaces/git-transport.ts
    contains: "credentialedGitInvocation"
  - test: youcoded/desktop/tests/github-client.test.ts
  - path: youcoded/desktop/src/main/sync-spaces/engine.ts
    contains: "ensureProvisioned"
  - path: youcoded/desktop/src/renderer/components/sync-dot-state.ts
    contains: "deriveSyncBoxState"
  - path: youcoded/desktop/src/main/sync-spaces/git-transport.ts
    contains: "GIT_DIR"
  - path: youcoded/desktop/src/main/sync-hub-socket.ts
  - path: youcoded/desktop/src/main/sync-error-classifier.ts
    contains: "extractStderr"
  - path: youcoded/desktop/src/main/sync-service.ts
    contains: "HEALTH_POLL_INTERVAL_MS"
  - test: youcoded/desktop/tests/sync-warning-self-clear.test.ts
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
  - path: youcoded/desktop/src/main/sync-spaces/repair.ts
    contains: "deleteZeroByteObjects"
  - path: youcoded/desktop/src/main/sync-spaces/self-sync-status.ts
    contains: "deriveSelfLastSyncEpochSec"
  - test: youcoded/desktop/tests/sync-spaces-repair.test.ts
  - test: youcoded/desktop/tests/self-sync-status.test.ts
  - test: youcoded/desktop/tests/sync-hub-socket.test.ts
  - test: youcoded/desktop/tests/device-activity-label.test.ts
  - test: youcoded/desktop/tests/sync-warnings-lifecycle.test.ts
  - test: youcoded/desktop/tests/github-connect.test.ts
  - test: youcoded/desktop/tests/sync-spaces-project-registry.test.ts
---
# Sync Spaces, SyncHub, backup & GitHub-connect

**Depth + why per bullet: `youcoded/docs/sync-spaces.md`; guards = frontmatter `verify:`.**

## Git transport (`sync-spaces/git-transport.ts`)
- **`GIT_DIR` env, not `--separate-git-dir`; ignores/attributes in `$GIT_DIR/info/`; `info/attributes` = `* -text`, NOT `text=auto`.**
- **Convergent conflicts: REMOTE wins the canonical name, LOCAL becomes a visible conflict copy**; `--allow-unrelated-histories` is load-bearing; conflict-copy content rides Buffer `showStage()`, never string `git()`.
- **`sync-transport-contract.ts` is the compatibility boundary; `repoNameForSpace` (slug + LOWERCASED-id hash) IS the sync identity.**
- **Non-zero git exits are guilty until proven benign** (allowlist; corruption → coded `repo-corrupt`, else the REAL stderr) — never `{pushed:false}` on a failed commit.
- **Zero-byte loose objects are POISON** — only `repair()` clears them, never writing outside `.youcoded/`.

## Engine & service (`engine.ts`, `service.ts`)
- **Engine:** single-flight per space + one coalesced rerun; `addSpace` awaits chokidar `ready`; a persistent `watcher.on('error')` is required; `stop()` clears the state map FIRST.
- **A remote-less space NEVER emits `synced`; green is evidence-gated** (`deriveSyncBoxState`).
- **Conversation Store `native/` lanes ride this SAME engine — no native-only `synced` path.**
- **Corrupt-repo heal is ONCE per space per launch** (`healedSpaces`, marked BEFORE attempting). **Self device-row recency derives from `lastSyncFor` evidence**, never `.sync-marker`.

## SyncHub (`sync-hub-socket.ts` + `SyncGroupRoom` DO)
- **The DO is per-account, an ACCELERANT not truth** — never drop the 120s poll. **spaceKey = `repoNameForSpace()`, never the local id; signal ONLY on `pushed:true`; the hub send runs LAST of the fan-outs in `broadcast()`, isolated.**
- **Per-device recency rides the SAME signal** (`lastSyncByDevice` in DO storage; pure `deviceActivityLabel` renders). **Self reads the LOCAL `lastSyncEpoch`, NOT the map.**

## Import (`sync-spaces/import-project.ts`)
- **Import MOVES the folder — never copy-and-keep-both.** The EXDEV branch re-checks `existsSync(dest)` BEFORE cpSync; store remaps degrade to WARNINGS, never silent drops.

## Project UX + discovery
- **Sync dots (green/red/gray) are the ONE sanctioned status-color use** — ALL dot state from pure `sync-dot-state.ts`; labels pinned.
- **Project registry at `~/YouCoded/Personal/ProjectSync/<name>.json` — VISIBLE per-file, NEVER under `.youcoded/`.** `state` = `stopped`-dominates monotonic (not LWW); **fold-on-read** blocks resurrection; schema stays 1.
- **Per-field merge: `laterOf` takes `{v, at}` wrappers (`description` does; the name dimension passes whole entries); `description` is LWW on its OWN `descriptionUpdatedAt`, never `updatedAt`.** Whole-entry `laterOf` tie-breaks on `JSON.stringify` (broke associativity); a shared clock reverts a peer's rename.

## Device registry
- **TWO identities, NEVER merged: `getDeviceIdentity(userData)` = per-INSTALL (leases); `getMachineIdentity(builtAppUserData)` = per-MACHINE (registry), which READS, never mints — `null` ⇒ register NOTHING.**
- **`main.ts` captures `BUILT_APP_USER_DATA` BEFORE the dev-profile `setPath`; machine id lives in `%APPDATA%`, NOT `~/.claude`.**
- **`removeDevice` deletes conflict copies too — a plain delete, NOT a tombstone.** **Self-marking uses `machineId` on BOTH surfaces.**

## Legacy backup / demolition
- **`sweepProjectSymlinks()` is `lstat`-only, removes ONLY symlinks/junctions, NEVER recursive.** **Drive/iCloud backup is WRITE-ONLY dated snapshots; restore is GONE.** The >500MB warning rides `notice`, NOT `error`; `git gc` is local `--auto`.

## Sync Warnings
- **`~/.claude/.sync-warnings.json` is authoritative; two writers, non-overlapping codes** (each replaces only its own); push-failure warnings are non-dismissible.
- **`runHealthCheck` runs at launch AND every 60s — a health warning must not outlive its cause** (2026-08-11).
- **Node-killed timeouts have empty stderr — route through `extractStderr(e, timeoutMs)`**, never raw `e.stderr || e.message`.

## GitHub auth (`github-{auth,connect,client}.ts`)
- **The access token NEVER leaves the main process** — only the github-client store (safeStorage, per-install userData, never `~/.claude`/synced dirs) and `gh auth login --with-token` stdin; never logged, thrown, or in payloads/WS/git argv/config. App store PRIMARY, gh best-effort.
- **Git creds = per-invocation inline `credential.helper` reading child env, NOT `GIT_ASKPASS`**; auth-refused ops throw coded `github-auth` errors — match the code, not prose.
- **Reuse gh's own client id `178c6fc778ccc68e1d6a`; never wrap interactive `--web`.** **Orchestrator: singleton, PER-FLOW settle guard (`activeFlowId`).**
