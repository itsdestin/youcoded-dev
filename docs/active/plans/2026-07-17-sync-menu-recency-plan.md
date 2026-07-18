---
status: draft
---

# Plan — Sync menu per-device recency (via SyncHub DO)

> **For agentic workers:** implement this plan task-by-task with TDD (write failing test → verify red → implement → verify green). Steps use checkbox (`- [ ]`) syntax. Use **Opus** implementers per the standing process: full task text pasted into each subagent, spec-compliance + code-quality review per task, whole-branch review before PR. Line numbers drift — verify each cited anchor with Grep before editing; the semantic anchors (function names, comments) are authoritative.

**Goal:** Peer device rows in the sync menu show real sync recency — "Synced just now" when a device synced within the last 5 min, else "Last synced 12 minutes ago" — instead of the frozen launch-time "last seen". Self row keeps its live "Syncing…". Never-synced devices fall back to today's launch value.

**Architecture:** Carry per-device last-sync recency over the existing **SyncHub Durable Object**, never over git (a git-file timestamp re-triggers sync + bloats history — rejected in the spec). The DO already relays `{kind:"space-updated", device, at}` on every `synced && pushed` (`service.ts:117`, `room.ts` `relaySignal`); `at` is server time. We add: (1) a stable `deviceId` (the `machineId`) threaded through the connection so a signal maps to a registry row reliably; (2) a durable `lastSyncByDevice` map in DO storage, updated on each signal and shipped in the `hello` frame; (3) client + renderer plumbing to surface it. The DO stays an **accelerant, not a source of truth** — losing the map degrades a row to the launch-time fallback, nothing breaks.

**Tech Stack:** Cloudflare DO (hibernation API, `state.storage`), `ws` client in Electron main, vitest both repos, existing `status:data` push + `sync:getStatus` IPC (payload extension, no new channel).

**Governing docs (READ BEFORE STARTING):** spec `docs/active/specs/2026-07-17-sync-menu-recency-design.md` (all sections); `.claude/rules/sync-spaces.md` (Device registry + SyncHub sections); PITFALLS → Sync Spaces.

**Worktrees:** two branches — `feat/sync-recency` in `wecoded-marketplace` (Task 1), `feat/sync-recency` in `youcoded` (Tasks 2–5). Use `git worktree add`; if you junction `node_modules`, follow the removal discipline in the workspace CLAUDE.md (delete the junction with `rmdir` before `git worktree remove`; never run `npm ci`/Gradle in a junctioned worktree).

---

## Deliberate decisions (justify-once, don't re-litigate)

1. **DO storage, not git, for last-sync.** A git-synced timestamp feeds a watcher → debounced push → re-stamp feedback loop, and logs a commit-per-sync forever. The DO route has neither problem. (Spec → "Why not git".)
2. **Key on `machineId`, not the `device` label.** The wire carries only `os.hostname()` today (`service.ts:279`); rows are keyed by `machineId` UUID and displayed by an editable name. Hostname-matching breaks on rename / duplicate hostnames. `machineId` is the row key, so it is the correct join key. A **null** `machineId` (no built app / dev-only) → connect without `deviceId` → no map entry, same as the registry having no row. Graceful.
3. **Recency only — no live per-peer "Syncing…".** Would need a new sync-*start* signal; "Synced just now" already reads as active. Self row's live "Syncing…" is local-only (`syncInProgress`), no DO involvement.
4. **`at` is already on the wire; the client drops it.** No worker change is needed to *produce* the timestamp — only to add `deviceId` + the durable map. The client change is "stop dropping `at`, add `deviceId`".

## Bugs to be wary of (check during review of every task)

- **DO input gates:** keep each `storage.get → storage.put` free of unrelated `await`s in between, or two concurrent signals interleave. The `lastSyncByDevice` update must follow the same discipline as the existing ring append (`room.ts` comment at the ring `put`).
- **Rollout skew both ways:** new worker + old app (no `deviceId` on the wire) must skip the map write, not throw. Old worker + new app (no `hello.lastSyncByDevice`, no `deviceId` on frames) must fall back silently. Neither requires a coordinated deploy.
- **Clock skew:** `at` is server time compared against the viewer's local clock — clamp `max(0, now − at)` so a skewed clock never renders a negative/future age (same guard as `friends-data.ts`).
- **Backward-compatible event shape:** the `signal` `SyncHubEvent` consumer at `service.ts:281` reads only `kind`/`spaceKey`; new optional `at`/`deviceId` fields must not disturb it.
- **Unhandled rejections in Electron main are fatal-ish:** any fire-and-forget added here `.catch()`es.
- **Remote path:** `lastSyncByDevice` rides the existing `status:data` push — verify `remote-server.ts` forwards the extended payload so remote browsers degrade gracefully (they never hold the DO socket). No new IPC channel; extend the existing `SyncStatus` payload only.
- **Worker auto-deploys on merge to master** — never run `wrangler deploy`. Ship Task 1 by merging its PR.

---

### Task 1: Worker — `deviceId` + `lastSyncByDevice` map in SyncGroupRoom

**Files:**
- Modify: `wecoded-marketplace/worker/src/sync/routes.ts`, `wecoded-marketplace/worker/src/sync/room.ts`
- Test: `wecoded-marketplace/worker/test/sync-hub.test.ts` (extend the existing suite; follow its `SELF.fetch`/WebSocket style)

- [ ] **Step 1: Write failing tests** — add a `describe('device recency')`:
  - `a signal from a socket connected with ?deviceId=D records lastSyncByDevice[D]=<at> in storage`
  - `the relayed signal frame to other sockets includes deviceId`
  - `hello frame includes lastSyncByDevice map with prior recorded entries` (connect A, send a signal, reconnect B → B's hello carries A's entry)
  - `a signal from a socket with NO deviceId does not throw and records nothing` (rollout skew — old client)
  - `map is per-account: a deviceId recorded in room A is absent from room B's hello` (mirror the existing isolation test)
  - `two rapid signals from different devices both land` (no interleave clobber)
- [ ] **Step 2: Run to verify failure** — `cd wecoded-marketplace/worker && npm test` → new tests FAIL.
- [ ] **Step 3: Implement.**
  - `routes.ts`: read `?deviceId=` from the upgrade request URL and forward as header `X-Sync-Device-Id` (mirror exactly how `?device=` → `X-Sync-Device` is done).
  - `room.ts` `fetch()`: read `X-Sync-Device-Id`; add `deviceId: string` to the `Attachment` interface and the `serializeAttachment(...)` call. Read `lastSyncByDevice` from storage; include it in the `hello` frame alongside `replay`.
  - `room.ts` `relaySignal()`: after the ring `put`, if `att.deviceId` is a non-empty string, do `const m = (await storage.get<Record<string,number>>('lastSyncByDevice')) ?? {}; m[att.deviceId] = entry.at; await storage.put('lastSyncByDevice', m);` — **no `await` between the get and put** (input-gate discipline). Add `deviceId: att.deviceId` to the relayed frame object.
  - Leave `ALLOWED_KINDS` untouched; leave lease paths untouched.
- [ ] **Step 4: Verify green** — `npm test` passes. Typecheck.
- [ ] **Step 5: PR** — open against `wecoded-marketplace` master; merge triggers the auto-deploy workflow.

### Task 2: Client — `sync-hub-socket.ts` carries `deviceId` + `at` + hello map

**Files:**
- Modify: `youcoded/desktop/src/main/sync-hub-socket.ts`
- Test: `youcoded/desktop/tests/sync-hub-socket.test.ts`

- [ ] **Step 1: Write failing tests** — extend the state-machine suite (uses the injectable `WebSocketCtor`):
  - `connect URL includes &deviceId=<id> when deviceId opt is set` (and omits it when the opt is absent/empty)
  - `a live signal frame with at+deviceId emits a signal event carrying at+deviceId`
  - `a hello frame with lastSyncByDevice emits it to the consumer` (new event, e.g. `{type:'sync-map', map}`)
  - `a signal frame missing at/deviceId still emits {kind,spaceKey} (backward compat)`
- [ ] **Step 2: Verify red** — `cd youcoded/desktop && npm test -- sync-hub-socket` FAILS.
- [ ] **Step 3: Implement.**
  - Add `deviceId?: string` to `SyncHubSocketOpts`; append `&deviceId=${encodeURIComponent(opts.deviceId)}` to `url` (guard empty/undefined — omit the param).
  - Extend the `signal` variant of `SyncHubEvent` with `at?: number; deviceId?: string`. Forward `entry.at`/`entry.deviceId` at the hello-replay site (~line 143) and the live-frame site (~line 148).
  - Add a `hello` handler branch: when `msg.lastSyncByDevice` is an object, emit a new event `{ type: 'sync-map'; map: Record<string, number> }`; add it to the `SyncHubEvent` union.
- [ ] **Step 4: Verify green** — suite passes. Typecheck.

### Task 3: Client — `service.ts` threads `machineId`, holds the map, exposes it

**Files:**
- Modify: `youcoded/desktop/src/main/sync-spaces/service.ts`, `youcoded/desktop/src/main/main.ts`
- Test: `youcoded/desktop/tests/sync-spaces-service.test.ts` (if a focused test fits; otherwise cover via Task 2 + Task 5 and typecheck)

- [ ] **Step 1: Thread machineId.** Add a `machineId: string | null` param to `startSyncSpaces` (`service.ts:138`) — or a `setSyncSpacesMachineId()` setter matching the existing setter pattern, set before the `startSyncSpaces(...)` call. In `main.ts:1603`, pass `machineIdentity?.id ?? null` (in scope; same value used at `main.ts:1632`).
- [ ] **Step 2: Pass to the socket.** In `createSyncHubSocket({...})` (`service.ts:277`), add `deviceId: machineId ?? undefined` alongside `deviceName: os.hostname()`.
- [ ] **Step 3: Hold the map.** Add a module-level `let lastSyncByDevice: Record<string, number> = {}`. In the socket `onEvent`: on `{type:'sync-map'}` replace it (seed from hello); on `{type:'signal'}` with `ev.deviceId && ev.at`, set `lastSyncByDevice[ev.deviceId] = Math.max(lastSyncByDevice[ev.deviceId] ?? 0, ev.at)`. Reset to `{}` in `teardownHub()`.
- [ ] **Step 4: Expose it.** Add `lastSyncByDevice` to the object returned by `getSyncStatus()` and to the `status:data` push payload (the live-fields push — same place `lastSyncEpoch`/`syncInProgress` ride). Ensure `remoteBroadcast`/`status:data` carries it to remote clients.
- [ ] **Step 5: Verify** — typecheck; `npm test`. Confirm no unhandled-rejection paths added.

### Task 4: Renderer — pure `deviceActivityLabel` helper

**Files:**
- Create: `youcoded/desktop/src/renderer/components/device-activity-label.ts` (pure, mirrors `sync-dot-state.ts`)
- Test: `youcoded/desktop/tests/device-activity-label.test.ts`

- [ ] **Step 1: Write failing tests** for the pure function
  `deviceActivityLabel({ isSelf, syncInProgress, lastSyncAt, gitLastSeen }, now): string`:
  - self + syncInProgress → `"Syncing…"`
  - self + not syncing, lastSyncAt 2m ago → `"Synced just now"`
  - peer, lastSyncAt 30s ago → `"Synced just now"`
  - peer, lastSyncAt exactly 5m ago → boundary: `< 5min` is "just now", `≥ 5min` is relative (pick and pin: **≥ 5min → relative**)
  - peer, lastSyncAt 12m ago → `"Last synced 12 minutes ago"`
  - peer, no lastSyncAt, gitLastSeen 3h ago → fallback `"last seen 3 hours ago"` (today's wording via existing `relativeMs`)
  - peer, lastSyncAt in the future (skew) → clamped to `"Synced just now"`, never negative
- [ ] **Step 2: Verify red** → **Step 3: Implement** the bands (reuse/relocate the existing `relativeMs` phrasing helper for the ≥5min case; do NOT duplicate it — import or co-locate) → **Step 4: Verify green.**

### Task 5: Renderer — wire the helper into SyncPanel

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/SyncPanel.tsx`
- Test: extend `device-activity-label.test.ts`; manual dev-window check flagged to Destin (interactive verification — do NOT build a scripted rig).

- [ ] **Step 1:** Extend the `SyncStatus` interface (`SyncPanel.tsx:93`) with `lastSyncByDevice?: Record<string, number>`; patch it in from `status:data` in the existing merge effect (~line 305) and from `getSyncStatus` (~line 338).
- [ ] **Step 2:** In the device-list render (~line 1575), replace the inline
  `const activity = d.self ? 'active now' : \`last seen ${relativeMs(d.lastSeen)}\``
  with `deviceActivityLabel({ isSelf: d.self, syncInProgress: status.syncInProgress, lastSyncAt: status.lastSyncByDevice?.[d.id] ?? null, gitLastSeen: d.lastSeen }, Date.now())`.
- [ ] **Step 3: Typecheck + unit tests green.** Then **flag Destin** to eyeball the device list in a dev window (`bash scripts/run-dev.sh`) with a second device syncing — per the CLAUDE.md rule, don't auto-script the interactive check.

### Task 6: Docs — update the guard rule + flip roadmap/archive

- [ ] Update `.claude/rules/sync-spaces.md` SyncHub line to note the signal now also carries `deviceId`/`at` and feeds the per-device recency map (and bump `last_verified`).
- [ ] On merge of both PRs: move spec + this plan to `docs/archive/`, flip the ROADMAP item to `[x]` (same session — "merge means merge AND archive AND flip").

---

## Sequencing

Task 1 (worker) can land first and independently — it's backward-compatible (old clients ignore the map, send no `deviceId`). Then Tasks 2→3→4→5 in `youcoded` (2 and 4 are independent and can be parallel; 3 depends on 2; 5 depends on 3+4). Task 6 closes out on merge. The feature only lights up once both PRs ship; until then, rows show today's launch-time fallback (no regression).
