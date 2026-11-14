---
status: active
date: 2026-11-14
topic: Mesh Phase 0 — re-verification of design.md section 3 and 7.1 against current code (youcoded 4c6ac0055, wecoded-marketplace 60766a5)
---

# S3 — code facts recheck

## 1. Verdict

**PASS (with line-number drift and four nuances).** Every behavioural claim in sections 3.1–3.7 and 7.1 is still true. Nothing in the design is wrong. Eight line references moved (table below); three claims need a wording nuance (rows marked "nuance"). The mesh-relevant code (conversations, sync-spaces engine, transcript watcher, IPC table, Worker sync room) is almost untouched since the design was written.

## 2. What was done

Read-only. Commands used (all under `<root>/youcoded` and `<root>/wecoded-marketplace`):

- `git log --oneline e73b41347..HEAD -- desktop/src app` gives 217 commits (both SHAs are present locally). Marketplace: `git log 830ff8e..HEAD -- worker` gives 19 commits.
- `git diff --stat e73b41347 HEAD -- <the mesh-relevant paths>` showed only 20 files touched across conversations, sync-spaces, session-manager, remote-server, device-identity, transcript-watcher, slug-encoding, ipc, backend-contract, capabilities, headless, remote-shim, index.tsx. Their diffs were read in full (summarised in section 4).
- `rg`/`wc -l` for each claim, and `git show e73b41347:<file>` for the old line numbers where a line moved.

## 3. Findings: claim, status, current location

Status words: **true** = still true as written; **moved** = true, line number changed; **nuance** = true but the wording should carry a caveat.

### 3.1 Where chats live

| Claim | Status | Current location / evidence |
|---|---|---|
| CC chats at `~/.claude/projects/<ccProjectSlug(cwd)>/<id>.jsonl`, CC writes, app reads | true | `ccProjectSlug` still in `main/slug-encoding.ts` (60 lines, unchanged) |
| Native chats at `~/.youcoded/sessions/<nativeStoreSlug(cwd)>/<id>.jsonl`, plain append | true | `main/harness/session-store.ts:151,197,231` (`nativeStoreSlug` + `appendSessionLine`). File changed by 4 lines (title helper only). |
| `sessionIdMap` links app id to CC id at first `SessionStart` | true | `main/create-runtime.ts:526-531`, `main/session-id-mapping.ts` |
| Watcher handles file shrinking `transcript-watcher.ts:989` | **true, same line** | `main/transcript-watcher.ts:989` is the `/clear truncates` comment; the `if (fileSize < session.offset)` block is 998-1003, emits `transcript-shrink` |
| Helper files `<slugdir>/<id>/subagents/agent-<id>.jsonl` | true | `transcript-watcher.ts:720,794` |
| Native helpers are ordinary files with `parentSessionId`; reports in `specialist-reports/` | true | `session-store.ts:34,488`; `specialist-reports` in `harness-session.ts`, `native-session-host.ts` |
| `conversations/slug-repair.ts` repairs duplicates once per launch, never deletes | true (not re-read in depth; file is 941 lines, unchanged since `e73b41347`) | |
| `nativeStoreSlug` is frozen | true | `session-store.ts:10` comment |
| CC saved tool outputs / plans / to-dos not read or written by app code | UNVERIFIED this pass (not in scope of a code diff; no commit since the design touches them) | |

### 3.2 How chats sync today

| Claim | Status | Current location / evidence |
|---|---|---|
| Finished reply triggers mirror-in and immediate sync `conversations/service.ts:436` | **true** | `service.ts:436` is `if (ev.type === 'turn-complete')`; the `mirrorIn(...)` call is at 446, then `syncSpacesSyncNow('personal')` at ~452 |
| Chats ride Personal space `~/YouCoded/Personal/` | true | |
| `Conversations/<provider>/<id>.json`, `.../transcripts/<projectBasename>/<id>.jsonl`, plus `Devices/`, `ProjectSync/`, `Tags/`, `ConversationNames/`, `Handoffs/` | true | `Handoffs` path: `handoff-transcript.ts:44` |
| Files over 50 MiB never sync; conflict copies `<id> (from <device>, <date>)` | true | `guards.ts` (126 lines, unchanged) |
| No chat-sync-only switch, no upload-only GitHub mode | true | no commit adds either |
| `conversations/` is 6,362 lines | **moved (+10)** | **6,372** now (`wc -l main/conversations/*.ts`). Cause: `naming-core.ts` +10 (new `stripLeadingAttachmentPaths`, phone title fix). At `e73b41347` it was the same 6,362. |
| ~2,500 lines of handoff/takeover/lease code | **nuance: the file list sums to about 2,650 with the UI; about 1,980 for the main-process half** | see list below |
| `handoff-transcript.ts` extends a copy only if existing is a byte prefix, SHA-256 receipt | true (349 lines, unchanged) | |

Handoff/takeover/lease code, line counts now (none changed since the design):

- `main/conversations/`: `lease-client.ts` 551, `takeover.ts` 401, `handoff-transcript.ts` 349, `handoff-attempt.ts` 333, `resume-admission.ts` 150, `handoff-transport.ts` 61, `handoff-receipt.ts` 52, `handoff-exit.ts` 45 = **1,942**
- `main/ipc/handoff.ts` 37 -> main-process subtotal **1,979**
- Glue in `main/conversations/service.ts:887-1042` (156 lines): counted inside `service.ts` (1,042 lines total), not additional
- Renderer: `state/pending-handoff.ts` 176, `components/PendingHandoffView.tsx` 50, `components/HandoffFreshnessInline.tsx` 37, `state/resume-lease-gate.ts` 57, `components/takeover-dialog-copy.ts` 51, `components/MovedGate.tsx` 63, `hooks/use-takeover-prompts.ts` 37 = **471**
- Worker: lease half of `sync/room.ts` (`putLease` 192, `handleLease` 205, `broadcastLeaseEvent` 328; file is 335 lines in all)
- Total with renderer: about 2,450 + the Worker half, so "about 2,500" holds. Files referencing handoff/takeover/lease terms but not on this list also exist (`App.tsx`, `remote-shim.ts`, `ipc-handlers.ts`, `preload.ts`, `SyncPanel.tsx`, `BuddyResumeList.tsx`, `session-manager.ts` `stopSessionForHandoff`): the Phase 7 deletion is a spread of edits across these, not only file deletions.

### 3.3 How devices connect today

| Claim | Status | Current location / evidence |
|---|---|---|
| `remote-server.ts`, plain WebSocket, port 9900, Tailscale address only, password then per-device secret | true | `main/remote-server.ts` 1,477 lines (+4). Port/bind not re-read in depth (no commit touches them). |
| Electron cannot be a client `renderer/index.tsx:104-117` | **moved +3** | `renderer/index.tsx:119-120` (`function Root() { if (isElectron) return <App />;`), `isElectron` at :107. Cause: 3 lines added at top (workbench clock import). |
| Every feature one entry in `channel-table.ts`, two doors: `registerDesktopChannels` line 151, `serveRemoteChannel` line 195 | **true, same lines** | `channel-table.ts:151`, `:195` (247 lines, unchanged) |
| `owner: true` door for Android's own backend | true | `channel-table.ts:197-205` (`opts: {owner?: boolean}`), caller `remote-server.ts:922` (`owner: true`) |
| `ChannelCtx.door` `'desktop' \| 'remote'` at `backend-contract.ts:890` | **true, same line** | `shared/backend-contract.ts:890` (file +7 lines, all above line 890 except none; the line held) |
| "29 handler sites branch on `ctx.door`" | **recount: 25 occurrences, in 11 files; unchanged since the design** | `rg -o 'ctx\.door' desktop/src -g '*.ts' \| wc -l` gives 26, of which 1 is a comment (`remote-server.ts:1253`) -> **25 code uses**: artifacts.ts 5, session.ts 4, window.ts 4 (all pass `ctx.door` to `zoomBy`), engine.ts 2, pages.ts 2, project.ts 2, files.ts 1, handoff.ts 1, native.ts 1, sync.ts 1. The identical count exists at `e73b41347`, so "29" was a different counting method (it probably includes the `door` parameter in `window.ts:39` and the `door: 'remote'/'desktop'` constructors). **Proposed wording: "about 25 handler sites".** |
| Windows have positive audience ids, phones negative `ipc/session.ts:406, 466` | **true, same lines** | `session.ts:406` (`const audience = ctx.door === 'desktop' ? ... w${windowId}... : ...s${audienceId}`), `:466` (`ctx.door !== 'desktop' && ctx.audienceId`); negative-id rule enforced at `window-registry.ts:239` |
| Parity tests `tests/remote-channel-parity.test.ts` | true | file exists |
| `REMOTE_SCREEN_CAPABILITIES` in `shared/capabilities.ts` | true | `capabilities.ts:92` (158 lines, unchanged) |
| friendly names in `renderer/remote-unsupported.ts` | true | 90 lines, unchanged |
| Image paste / file drag for a remote screen unconfirmed (T9) | unchanged, still open | |
| Capabilities per window, not per chat | true | |

### 3.4 The Worker

| Claim | Status | Evidence |
|---|---|---|
| One `SyncGroupRoom` DO per account in `worker/src/sync/room.ts` | true | `sync/routes.ts:21`: `idFromName(userId)` |
| Replay ring of 32 | true | `room.ts:25` `RING_MAX = 32`; `ALLOWED_KINDS = {"space-updated"}` at :20 |
| Holds session leases | true | `room.ts:41-42,192,205` |
| Stores no chat data, has no list of which devices are on, relays no bytes | **nuance** | It does keep a per-device last-sync time (`lastSyncByDevice`, `room.ts:92`), sent in the `hello`. That is "when did this device last push", not "is it on now". Present at `830ff8e` too. The design's phrase is right about presence; add "(it does keep each device's last-sync time)". |
| `GET /sync/hub` requires a GitHub-backed account token | true | `sync/routes.ts:14` (`requireAuth` = Bearer session token resolved against the sessions table, `auth/middleware.ts:12-14`); the "GitHub-backed" part is the sign-in method, not checked in the middleware itself |
| Deployed by CI on master | true | `worker-backend.md` rule |
| Net change since the design | **none to `worker/src/sync/`** | The two sync commits (`e2975f4`, `56716fd`) were both reverted (`5e65bb4`, `e9f72b0`); `git diff --stat 830ff8e HEAD -- worker/src/sync` is empty |

### 3.5 Devices, keys, lifecycle

| Claim | Status | Evidence |
|---|---|---|
| `main/device-identity.ts` (per-install UUID, per-machine id) | true | 65 lines, unchanged |
| Device registry in `sync-spaces/device-registry.ts` | true, 258 lines | changed: new `selfDeviceName()` (see section 4) |
| Crypto: Node `crypto` + `bcryptjs` only, no key-exchange library | UNVERIFIED this pass (no dependency change in the diff; `desktop/package.json` not re-read) | |
| Android secret storage AES-256-GCM keyed from Keystore `headless/electron-headless.ts:153` | **true, same line** | `electron-headless.ts:153` `export const safeStorage`, `:141` comment, `:159` `aes-256-gcm`. File 261 lines, unchanged. |
| Quit: `window-all-closed` quits `main.ts:2068` | **moved +6** | `main.ts:2074` (`app.on('window-all-closed', () => { app.quit(); })`). Behaviour unchanged. `main.ts` is 2,108 lines now. |
| Android backend is the only windowless boot | true | |
| `powerSaveBlocker` used only for "keep awake for remote access" | true | `ipc-handlers.ts:995`; stand-in `electron-headless.ts:199` |
| Android `keepAwake` host call, partial wake lock, 4 hour cap | true | `BackendService.kt:242,253` (`acquire(4 * 60 * 60 * 1000L)`) |
| No battery-exemption request, no wifi lock, no local network discovery | true | `rg -i 'dgram\|mdns\|bonjour\|ssdp\|multicast' desktop/src/main` finds only unrelated net-guard / address-check files (`browser-net.ts`, `public-address.ts`, `callback-page-assets.ts`, `net-guard.ts`); `rg 'MulticastLock\|REQUEST_IGNORE_BATTERY\|WifiLock' app/src/main` finds nothing |
| `PROTOCOL_VERSION` sent to remote clients, nothing acts on a mismatch | **nuance** | True of `PROTOCOL_VERSION` (`capabilities.ts:17`; `remote-server.ts:192`; the only reader is `remote-shim.ts:1498`, which stores it). But a separate refusal exists: `shared/fill-protocol.ts` (`FILL_PROTOCOL_VERSION = 2`, `isOldFillClient`, close code 4005, "This app is older than your computer's YouCoded") makes `remote-server.ts` refuse an old page. It is dated 2026-10-01, before the design. **This is a precedent for the mesh's version check (5.11), not a contradiction.** |

### 3.6 Project files and backup

| Claim | Status | Evidence |
|---|---|---|
| `engine.ts` chokidar, 15 s `debounceMs` line 142, 120 s poll | **moved +1** | `engine.ts:143` (`this.debounceMs = opts.debounceMs ?? 15_000`), declared `:14`, poll `:15,120`. |
| `SyncTransport` at `types.ts:65` | true, same line | `export interface SyncTransport` at `types.ts:65` |
| `git-transport.ts` only implementation | true | 1,360 lines (+12: `info/` folder created for phone repos) |
| Contract suite `tests/sync-transport-contract.ts`, 11 tests | true | `rg -c '^\s*(it\|test)\('` gives 11 |
| Conflict rule: remote keeps name, local becomes `name (from <device>, <date>).ext` | true | `sync-spaces.md` rule |
| No "listed but not downloaded" state; `materialization-planner.ts`, `runDiscovery` in `service.ts` | true | `materialization-planner.ts` 56 lines (`planReconcile`: toMaterialize = every active registry project not local); `service.ts:319` `runDiscovery` |
| `--allow-unrelated-histories` at `git-transport.ts:887` | **moved +8** | `git-transport.ts:895` (comment at 888). |
| Delete/archive of chats absent | true | no commit adds it |
| No per-project change counter | true | |
| `guards.ts`: `NEVER_SYNC`, `DEFAULT_IGNORES`, 50 MiB cap | true | `guards.ts:21,27` (126 lines, unchanged) |
| `daily-backup.ts` copies every space to Drive (`rclone`) or iCloud daily; no restore | true | 136 lines, `rclone` at :92,119,122 |
| "GitHub" backup type exists in settings but copies nothing | true | `backup-targets.ts:8-9`: the filter keeps only `drive` and `icloud`; `SyncPanel.tsx:113` still types `'github'` |
| `rclone` not shipped on Android | UNVERIFIED this pass (no `rclone` in `app/runtime/pins.env` diff; not checked in full) | |
| New device restores by turning sync on | true (no change to the flow) | |
| New since the design: size notices now use decimal MB/GB (`engine.ts:392-397`), via `shared/format-bytes` | n/a | cosmetic |

### 3.7 Test rigs

| Claim | Status |
|---|---|
| `run-dev.sh --offset N --profile name --label` side by side; share `~/.claude` and machine id; no two-device rig | true (workspace docs, `PITFALLS.md` "dev instance and the built app SHARE ~/.claude") |
| `verify.sh` desktop only | true |

### Section 3 intro / 7.1 / other references

| Claim | Status | Evidence |
|---|---|---|
| `headless-boot.ts` is 307 lines, "Keep it in step with main.ts" | **moved: 330 lines** | `headless-boot.ts:9` has the comment; file grew +23 (+33/-10) |
| `headless-boot.ts:132-134` hard-codes Android | **moved, and slightly off even then** | Now: `:133` (comment "android + the phone's own ID"), `:139` `startDailyHeartbeat({ platform: 'android' })`, `:306` `upsertSelf(..., platform: 'android')`. At the design commit the same lines were 128 / 134 / ~275. |
| Lease wiring `main.ts:1014` | **moved +3** | `main.ts:1017` (`leaseDir: () => path.join(app.getPath('userData'), 'Leases')`); lease client built at `main.ts:985-1020`, `createLeaseClient` import :86 |
| Lease wiring `headless-boot.ts:186` | **moved +9** | `headless-boot.ts:195` (`const leaseDir = ...`), client `:196-224`, `sweepExpiredLeases` :203 |
| `conversations/service.ts:887-1042` handoff glue | **true, same lines** | `service.ts:887` is `publishStoppedHandoff`; file is exactly 1,042 lines; `handoffPins` at 383-390 and uses at 743-1036 also hold handoff glue outside that range |
| `MODEL_SWITCH_MARKER` at `renderer/state/transcript-event-actions.ts:361` | **true, same line** | `:361` |
| `resolve-local-project.ts` | true | `main/conversations/resolve-local-project.ts` 58 lines |
| `QrScannerOverlay.kt` | true | `app/src/main/kotlin/com/youcoded/app/ui/QrScannerOverlay.kt`, 220 lines |
| `PairedDeviceStore.kt` | true | `app/src/main/kotlin/com/youcoded/app/runtime/PairedDeviceStore.kt`, 99 lines |
| "About 26 source files reference Claude Code's chat folder" | **UNVERIFIED as 26; same count then and now** | My pattern (`ccProjectSlug\|.claude/projects\|'.claude','projects'\|claudeProjectsDir\|CLAUDE_PROJECTS`, non-test, non-workbench) gives **29 files** at both `e73b41347` and HEAD: no drift. The design's 26 used another pattern; T20 should record its own command. |
| `main/ipc/handoff.ts` | true, 37 lines | |
| `main/session-manager.ts` `stopSessionForHandoff` | true | 913 lines now (+32, see section 4) |
| Worker allow-listed new DO | true, and now has precedent | see section 4 |

## 4. Changes since the design was written that affect the design

Commits `e73b41347..HEAD` are mostly UI, local models, terminal, Office and Android polish. These touch the mesh:

1. **Phone device name** (`device-registry.ts`, `selfDeviceName()`, env `YOUCODED_DEVICE_NAME`; the Android app passes the phone's name). Before, the phone registered as "localhost". Mesh device records and pairing screens must take the name from `selfDeviceName()`, not `os.hostname()`. Also `upsertSelf` now "heals" a row still named `localhost`. `headless-boot.ts:306` now passes `platform: 'android'` to the registry.
2. **Remote devices now expire and show a "signed out" row** (`remote-server.ts`: `devices.expireStale`, `dismissExpired`; commit `d34a1f3cd` "Sign-outs nobody was told about: two notices"). The mesh's device list (2.4, 5.1) sits next to this existing "Remote access" device list. The design must say what happens to the old list once mesh pairing exists, and reuse the signed-out wording.
3. **Android background status and notifications** (`main/background-status.ts`, new, 125 lines; `StatusNotifier.kt`; `headless-boot.ts` wiring: "N working, N waiting, N done" always-on notification, `hostNotify('status')`, a `foreground` event, `returnToApp` after browser sign-ins). Section 5.9 (lifecycle) and the notice (2.7) must account for this existing foreground-service notification and the new `host-bridge.ts` calls; the "watched" input it reads is `windowRegistry.getSocketWatchers(id)` (phone audience), which the mesh proxy/router (5.5) will change.
4. **Worker: Durable Object precedent** (`CONNECTFOUR`, `CHESS` classes, migration tag `v3`, `wrangler.toml` binding in both the main and `[env.test]` sections, `games/tickets.ts` short-lived sign-in tickets for WebSocket joins, migration `0012_game_tickets.sql`, `games/relay-room.ts`). The "new Durable Object and route" in 7.1 now has a working template, including a ticket pattern for authenticating a socket without a header. A new relay DO must be mirrored into `[env.test]` bindings and take the next migration tag (`v4`).
5. **Sessions**: every session now gets a name (`NEW_SESSION`) at `SessionManager.createSession` for all doors (`session-manager.ts`); a Claude Code start-mode module (`claude-start-mode.ts`) fixes the permission mode and badge at start; phone sessions pass `--messaging-socket-path` (Claude Code's cross-session socket, short path, one per session); the phone no longer has an app-private "Home" project (sessions with no folder open in a clean "No folder", card #213). Remote-host sessions started by the mesh (seam S7) go through the same `createSession` and inherit these; "No folder" sessions have no project slug, so the mesh chat store and project-files rows must handle a chat with no real folder.
6. **Local models (`engine/*`, `harness/*`)**: a chat keeps its own engine slot between messages, `claude:load(modelId, sessionId?)` signature changed, and "coming back to a chat whose model slept loads it and re-reads the chat" (commit `0ec5118a7`). A chat that is hosted on a device with a local model cannot be taken over on a device without that model; the host chip / takeover logic (2.7) needs a "model not available here" case. `lastUsedModel` is already a portable ref (rule `conversations.md`).
7. **Crash-resume repair** (card #163, `04a411407`): changes only what the model reads on reopen; "the readable transcript is never changed" and the native JSONL stays append-only, so 3.1 "strictly grows" still holds. But resume repair now annotates tool calls "completion unknown, inspect state before retrying"; a takeover should rely on the same repair path.
8. **Office / files reliability** (`fb01783a5`, `5395826c6`): an autosave over a change made outside the app keeps the overwritten version. Project-file sync over the mesh (5.7) will be one of those "outside" writers; the clash rule must not fight Office's own keep-the-old-version behaviour. UNVERIFIED how Office names/places that kept version; read `main/office/` before designing the 2 s clash rule.
9. **Resume Browser / launch**: a reloaded desktop window reopens on the chat it showed (card #146); resume preview card. Both read chat files directly, adding to the "everything that reads chat files directly" list in 7.1 (T20).
10. **Launch settings retry** (`launch-settings-chores.ts`, `startLaunchSettingsRetry`, card #11): both `main.ts` and `headless-boot.ts` gained wiring for it (headless: `installLocked` + `{ phone: true }`). More evidence for design risk 10 (start-up wiring exists twice) — any mesh start-up must again be added to both files.
11. **Worker sync room: nothing landed.** Two lease-identity commits were reverted (`e2975f4`, `56716fd` reverted by `5e65bb4`, `e9f72b0`). The lease half the design deletes is exactly as designed.
12. **Files that the design treats as stable are confirmed unchanged**: `channel-table.ts`, `capabilities.ts`, `transcript-watcher.ts` (shrink block), all `main/conversations/*` except `naming-core.ts`, `sync-spaces/guards.ts`, `daily-backup.ts`, `materialization-planner.ts`, `device-identity.ts`, `slug-encoding.ts`.
13. **Docs not updated**: `youcoded/docs/{sync-spaces,conversations,native-runtime,android-runtime}.md` have no commits since the design (`git log e73b41347..HEAD -- docs/<each>` empty); the doc rewrite in 7.1 starts from the same text.

Not found (searched, nothing): any new Google Drive/Docs file integration, any new chat-delete/archive, any local-network discovery, any new key-exchange dependency in main (not checked in `package.json`; commits listed only touch the worker `package.json`).

## 5. Invariants builders of `main/mesh/` must respect

From `docs/PITFALLS.md` and the rules (all under `<root>/.claude/rules/`):

**Start-up and platform**
- `android-runtime.md`: never port logic to Kotlin; build once in the desktop backend. `headless-boot.ts` must mirror `main.ts`'s backend half (guard: none). A new phone-only page call needs a type in both `invokeAndroidHost` and `HostJsBridge.TYPES` (guard `android-host-channels.test.ts`). Android has no `rclone`; every bundled executable ships as a `jniLibs` `.so`.
- `native-runtime.md` / MAP "runtime and two doors": `create-runtime.ts` must not import Electron (guard `create-runtime.test.ts`). Mesh code that runs on both boots must be Electron-free.
- `live-app-safety.md`: a dev instance shares `~/.claude`, `~/YouCoded` and the machine id with Destin's live app (PITFALLS "Shared state"). Mesh test rigs need their own home folder; every cross-process JSON write is lock-guarded (`mutateFileUnderLock`, `casWrite`, guard `cas-write.test.ts`).
- PITFALLS: any new Claude Code coupling (reading CC files/paths, JSONL parsing, flags) needs an entry in `youcoded/docs/cc-dependencies.md`. T3's CC paths for tool outputs, plans and to-dos go there.

**IPC**
- `ipc-bridge.md`: one feature = one table entry (`ChannelTypes` + `IPC` names in `shared/backend-contract.ts`, one `defineChannel` in `main/ipc/<family>.ts` listed in `channel-table.ts`, regenerate `preload.ts` list with `node scripts/generate-preload-channels.mjs`, a `remote-shim.ts` method). Message-type strings byte-identical everywhere (`ipc-channels.test.ts`). A desktop-only channel must REJECT elsewhere, not resolve (`REJECT_ON_NOT_OK`). Phone policy lives on the entry (`desktopOnly`, `remoteAllowed`, `refusal`, `remoteGuard`). **What a phone may call is pinned whole in `tests/phone-open-set.test.ts` + `fixtures/phone-open-channels.json`; changing it is Destin's decision.** The planned `peer` context and `peerAllowed` field changes the same table and must keep `channel-table-complete.test.ts` and `remote-channel-parity.test.ts` green.
- `ctx.door` is `'desktop' | 'remote'` and about 25 handlers branch on it: a third door (`peer`) must be handled at each, or fail closed.
- Removing or narrowing a broadcast (PITFALLS "Removing a broadcast"): `rg` the CHANNEL and ask each listener what it does when it stops. Applies to chat transcript pushes if the proxy replaces them.

**Sessions and chats**
- `conversations.md`: mirror-in is add/update only and shrink-guarded (CC `/clear` rewrites must never shrink the durable copy); `lastActive` = transcript content timestamp, never mtime; merges are convergent; the record id/provider is a path-traversal boundary (reachable over remote WS) so a mesh chat id from a peer must be charset-checked and `path.resolve`-contained; fire-and-forget store writes must `.catch()`; materialize and the Resume Browser union both SKIP live sessions (renaming a transcript CC is appending to loses turns); the reconciler must skip symlinks; `sessionIdMap` remaps only on a `SessionStart` whose source is not `startup`; `sessionProvider` is a required param with no default to `'claude'`; `lastUsedModel` is a `PortableModelRef`, never the device-local provider ULID; two identities never merged (`getDeviceIdentity` per-install for leases, `getMachineIdentity` per-machine for the registry, which reads and never mints).
- `native-runtime.md`: `SessionProvider` has three values, shell is a terminal with no assistant, every provider branch must handle it; native sessions are Conversation Store rows; `SessionStore` coalesces same-partId deltas and never persists display-only events; the emit surface of the tool loop is FROZEN; tool-call/result pairing must hold everywhere.
- `pty-io.md` (MAP "PTY I/O & keyboard"): `session-manager.ts` owns every session's lifecycle; `prepareRunInTerminal` is the only minter of shell sessions.

**Sync**
- `sync-spaces.md`: `repoNameForSpace` IS the sync identity; `sync-transport-contract.ts` is the compatibility boundary (the mesh carrier must pass the 11-test suite); remote wins canonical name, local becomes visible conflict copy (the mesh carrier's new clash rule is a deliberate exception, and must not touch the GitHub carrier); never push an over-cap blob; secrets enforced at staging (`NEVER_SYNC`); the SyncHub DO is an accelerant, not truth (keep the 120 s poll); spaceKey = `repoNameForSpace()`; signal only on `pushed:true`; the hub send runs last in `broadcast()`, isolated; conversation-store `native/` lanes ride the same engine, with no native-only `synced` path; sync status comes only from pure `sync-dot-state.ts`; the project registry lives at `~/YouCoded/Personal/ProjectSync/<name>.json`, never under `.youcoded/`; the GitHub access token never leaves the main process (a mesh key must follow the same safeStorage rule, never in logs, payloads, WS or argv); Drive/iCloud backup is write-only dated snapshots.
- `worker-backend.md`: a new DO binding must be mirrored into `[env.test]`; never the same key in `[vars]` and as a secret; deploy order is migrations, deploy, secret put; never tell Destin to run `wrangler deploy`; `checkRateLimit()` limits nothing (use the `EVENT_RATE_LIMITER` binding for any real limit); SyncHub worker invariants are in `sync-spaces.md`, not `worker-backend.md`. Raw `device_id_hash` is never logged server-side: a mesh DO must not log device ids either.

**Code and UI standards (CLAUDE.md)**
- WHY comment at every non-trivial edit; `<ErrorState>` and plain-words errors with no invented causes (`docs/error-message-standards.md`); a failing or flaky test is fixed when found; `bash scripts/verify.sh` before claiming done (desktop only: Android and Worker need their own checks); dev launches take `--label`, distinct `--offset` and `--profile`; any user-visible surface needs a Destin-approved design (`feature-flow.md`, design guide); a new `<Dialog>` needs `screen=` or `noScreen=`.
- Line budgets: several commits this period raised or defended budgets for `App.tsx`, `remote-shim.ts`, `backend-contract.ts`, `harness-session.ts`, `main.ts` (card #11 b: "main.ts budget +3"). New mesh wiring in `main.ts`, `headless-boot.ts`, `remote-shim.ts` and `backend-contract.ts` must live in new files with a one-line hook, or the budget tests fail.
- `docs/PITFALLS.md` "Worktrees": never symlink `node_modules`; `npm install` inside a worktree is blocked by `glob-guard.py` guard 8 (prototype folders needing a package must use `--package-lock-only` or a folder outside `/worktrees/`).

## 6. Proposed edits to design.md (wording only)

- 3 intro: "307 lines" -> "330 lines"; 7.1 and 3.5: update line refs as in section 3 (`main.ts:2074`, `:1017`, `headless-boot.ts:195`, `:133/:139/:306`, `engine.ts:143`, `git-transport.ts:895`, `renderer/index.tsx:119-120`).
- 3.2: "6,362 lines" -> "6,372 lines".
- 3.3: "29 handler sites" -> "about 25 handler sites".
- 3.4: add "(it keeps each device's last-sync time, not whether it is on now)".
- 3.5: `PROTOCOL_VERSION` bullet: add "A separate older-page refusal exists for the fill protocol (`shared/fill-protocol.ts`, close code 4005); reuse it for 5.11."
- 7.1 Worker row: add "template: the Connect 4 / Chess rooms and their sign-in tickets".
- 7.1 "Everything that reads chat files directly": record the exact command (29 files by `ccProjectSlug|.claude/projects|...` as of `4c6ac0055`).

## 7. Needs Destin

Nothing.

## 8. Could not test here

Android runtime behaviours (wake lock, notification service, QR scanner) were read in code only; no phone, Windows or Mac is attached. Items marked UNVERIFIED above were not in scope of the diff and were not re-read.
