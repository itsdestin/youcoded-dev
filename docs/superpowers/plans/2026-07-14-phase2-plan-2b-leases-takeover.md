# Plan 2b — Session Leases, Takeover, Materialize-on-Release, Device Registry

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use **Opus** implementers per the standing process (handoff §3): full task text pasted into each subagent, spec-compliance + code-quality review per task, whole-branch review before PR.

**Goal:** One device at a time may write to a conversation (leases via SyncGroupRoom), takeover moves a live conversation between devices cleanly, an ended session's peer version materializes without an app restart (Bug 2 Part 2), a closed session reappears in the Resume Browser immediately (Bug 1), and every device has a friendly editable name (device registry).

**Architecture:** The wecoded-marketplace `SyncGroupRoom` DO becomes the lease authority (server-computed expiry, lazy expiration, per-account isolation unchanged). The desktop extends `sync-hub-socket.ts` with correlated lease request/response frames and a new `lease-client.ts` on top. `conversations/service.ts` gains `noteSessionEnded` + a targeted `materializeOne`. Takeover rides the existing interrupt/endTurn/mirror machinery. Device identity is a per-install UUID in `userData`; friendly names live as per-device files in the Personal space (Conversation-Store per-file pattern — never a single shared JSON).

**Tech Stack:** Cloudflare DO (hibernation API, `state.storage`), `ws` client in Electron main, vitest both repos, existing 4-surface IPC parity pattern.

**Governing docs (READ BEFORE STARTING):** spec `docs/superpowers/specs/2026-07-10-phase2-conversation-sync-design.md` §3 (incl. "Materialize-on-release"), §5, §6; investigation `docs/superpowers/investigations/2026-07-13-cross-device-conversation-sync-bugs.md`; PITFALLS → "Sync Spaces" (all subsections, esp. SyncHub + Conversation Store); handoff `docs/superpowers/2026-07-10-sync-completion-handoff.md` §3 process + §4 sharp edges.

**Worktrees:** two branches — `feat/sync-leases` in `wecoded-marketplace` (Tasks 1–2), `feat/sync-leases` in `youcoded` (Tasks 3+). Use `git worktree add`; junction `node_modules` only with the documented removal discipline (workspace CLAUDE.md).

---

## Deliberate deviations from the spec sketch (justify-once, don't re-litigate)

1. **Lease ops are DO-authoritative request/response (`{type:'lease', op:…}`), NOT client-relayed signals.** The spec named `lease-acquired/renewed/released` as `ALLOWED_KINDS` entries; implementing them as client signals would make every client trust every other client's claim and would put lease frames in the replay ring — a reconnecting device replaying a 20-minute-old `lease-acquired` would lie. Instead the DO owns the table; it *broadcasts* `lease-event` frames (released/taken/takeover-request) directly, bypassing `relaySignal` and the ring. `ALLOWED_KINDS` stays untouched.
2. **Leases key on a per-install `deviceId` (userData UUID), never the `device` label.** Pinned by the existing room comment: the label is client-chosen and non-unique. Per-install (not per-machine) is load-bearing: the dev instance and built app share `~/.claude` but have separate `userData`, so they get distinct deviceIds and leases coordinate them — the cross-process hazard from spec §3 point 4.
3. **`session-exit` fires before the PTY worker actually dies** (investigation §Part 2 refinement b). The materialize-on-end path therefore gates on transcript **quiescence** (size stable across two stats) rather than trusting the event.

## Bugs to be wary of (check these during review of every task)

- **Unhandled rejections in Electron main are fatal-ish** — every fire-and-forget promise (`lease acquire on session start`, `materializeOne`, hub sends) must `.catch()`. Same rule as `safeUpsert`.
- **The hub socket's supersede guards** (`ws !== sock`) — any new pending-request map must be cleared in `handleDown()` (reject all pending) or requests hang forever across a reconnect.
- **DO input gates:** keep each lease op's `storage.get` → `storage.put` free of unrelated `await`s in between, or two ops can interleave (same discipline as the ring append comment in `room.ts:117-122`).
- **Never materialize over a live transcript** — the whole point of the guard. The targeted materialize must check the `sessions` map AND quiescence AND (when connected) the lease.
- **`sendSignal`-style never-block:** lease query failures must degrade to "proceed with a warning dialog", never a hard block (spec §3 never-block principle).
- **IPC parity drift:** every new channel appears in preload.ts, remote-shim.ts, ipc-handlers.ts, remote-server.ts (remote path), SessionService.kt (stub), and `tests/ipc-channels.test.ts`. A missed surface = silent break on one platform.
- **Line numbers in this plan drift.** Verify each cited anchor with Grep before editing; the semantic anchors (function names, comments) are authoritative.

---

### Task 1: Worker — lease table + ops in SyncGroupRoom

**Files:**
- Modify: `wecoded-marketplace/worker/src/sync/room.ts`
- Test: `wecoded-marketplace/worker/test/sync-room.test.ts` (extend the existing suite; follow its SELF.fetch/WebSocket style)

- [ ] **Step 1: Write failing tests** — in the existing sync-room test file, add a `describe('leases')`:
  - `acquire on a free session returns ok:true with holder=self`
  - `acquire on a held session (other deviceId) returns ok:false with the holder`
  - `re-acquire by the same deviceId succeeds (idempotent) and extends expiry`
  - `renew by holder extends expiresAt; renew by non-holder returns ok:false`
  - `release by holder frees it; release when free returns ok:true (idempotent)`
  - `expiry is lazy: a lease older than 300s reads as free` (drive time via `vi.setSystemTime` if the pool supports it; otherwise write the record with a past `expiresAt` via a first acquire + fake clock — if neither works, inject `now` from `Date.now()` and test the boundary by acquiring, then patching storage directly through a second acquire after advancing mocked time; document whichever works)
  - `release broadcasts a lease-event {kind:'released'} to OTHER sockets, not the sender, and it does NOT enter the replay ring` (connect a second socket, assert it receives the frame; then reconnect a third socket and assert its hello replay contains no lease frames)
  - `cross-account isolation: a lease in room A is invisible in room B` (mirror the existing isolation test)
- [ ] **Step 2: Run to verify failure** — `cd wecoded-marketplace/worker && npm test` → new tests FAIL (no `lease` handler).
- [ ] **Step 3: Implement.** In `room.ts`:

```ts
interface LeaseRecord { deviceId: string; device: string; expiresAt: number; }
const LEASE_TTL_MS = 300_000; // spec §3: 30s heartbeat, 300s expiry — ten missed beats

// in webSocketMessage(), alongside the ping/signal branches:
if (data.type === "lease") { await this.handleLease(ws, data); return; }

private async handleLease(ws: WebSocket, data: any): Promise<void> {
  // Same null-guard discipline as relaySignal — ungated path, missing attachment must not throw.
  const att = ws.deserializeAttachment() as Attachment | null;
  if (!att) return;
  const { op, sessionId, deviceId, reqId } = data;
  // Validate hard: only client-writable path into lease storage.
  if (typeof op !== "string") return;
  if (typeof sessionId !== "string" || !sessionId || sessionId.length > 100) return;
  if (typeof deviceId !== "string" || !deviceId || deviceId.length > 100) return;

  const key = `lease:${sessionId}`;
  const now = Date.now(); // server time — spec §18 clock-skew rule: clients never compute expiry
  let rec = (await this.state.storage.get<LeaseRecord>(key)) ?? null;
  if (rec && rec.expiresAt <= now) rec = null; // lazy expiry — no alarms needed

  let ok = false;
  if (op === "get") {
    ok = true;
  } else if (op === "acquire") {
    if (!rec || rec.deviceId === deviceId) {
      rec = { deviceId, device: att.device, expiresAt: now + LEASE_TTL_MS };
      await this.state.storage.put(key, rec);
      ok = true;
    }
  } else if (op === "renew") {
    if (rec && rec.deviceId === deviceId) {
      rec = { ...rec, expiresAt: now + LEASE_TTL_MS };
      await this.state.storage.put(key, rec);
      ok = true;
    }
  } else if (op === "release") {
    if (!rec) { ok = true; } // idempotent: releasing nothing is success
    else if (rec.deviceId === deviceId) {
      await this.state.storage.delete(key);
      rec = null; ok = true;
      this.broadcastLeaseEvent(ws, { kind: "released", sessionId, device: att.device });
    }
  } else if (op === "takeover") {
    // Relay the request to the account's other devices; holder answers by releasing.
    ok = true;
    this.broadcastLeaseEvent(ws, { kind: "takeover-request", sessionId, from: { deviceId, device: att.device } });
  } else if (op === "force-acquire") {
    // Spec §3 step 5: unresponsive holder, user confirmed. Overwrite unconditionally.
    rec = { deviceId, device: att.device, expiresAt: now + LEASE_TTL_MS };
    await this.state.storage.put(key, rec);
    ok = true;
    this.broadcastLeaseEvent(ws, { kind: "taken", sessionId, device: att.device });
  } else { return; } // unknown op: drop, never reply

  this.safeSend(ws, JSON.stringify({
    type: "lease-result", reqId: reqId ?? null, op, sessionId, ok,
    holder: rec ? { deviceId: rec.deviceId, device: rec.device, expiresAt: rec.expiresAt } : null,
  }));
}

// DO-generated notification — deliberately NOT relaySignal and NOT ring-stored:
// a replayed stale lease frame would lie about current lease state.
private broadcastLeaseEvent(sender: WebSocket, payload: Record<string, unknown>): void {
  const frame = JSON.stringify({ type: "lease-event", ...payload });
  for (const sock of this.state.getWebSockets()) {
    if (sock === sender) continue;
    this.safeSend(sock, frame);
  }
}
```

- [ ] **Step 4: Run tests** — all green, including the pre-existing relay/ring/isolation suite (regression check: `ALLOWED_KINDS` and `relaySignal` are byte-untouched).
- [ ] **Step 5: Commit** — `feat(sync-hub): lease table + ops in SyncGroupRoom (2b)`.

**No wrangler.toml changes needed** — same DO class, no new binding, no new migration tag (verify: only NEW classes need `[[migrations]]`).

### Task 2: Worker — merge + deploy

- [ ] Open PR `feat/sync-leases` → master in wecoded-marketplace. Merge after review. **CI deploys** (never `wrangler deploy` manually — PITFALLS). Smoke: the existing `/sync/hub` 401 unauthenticated check still passes.
- [ ] Commit nothing further here; the desktop work proceeds against production.

### Task 3: Desktop — device identity module

**Files:**
- Create: `youcoded/desktop/src/main/device-identity.ts`
- Test: `youcoded/desktop/tests/device-identity.test.ts`

- [ ] **Step 1: Failing test:** `getDeviceIdentity(tmpDir)` creates `device-id.json` with a UUID `id` on first call; second call returns the SAME id; a corrupt file is replaced (never throws).
- [ ] **Step 2: Implement:**

```ts
// Per-INSTALL identity for lease coordination. userData-scoped ON PURPOSE:
// the dev instance and built app share ~/.claude but have separate userData,
// so they get distinct ids and leases coordinate them cross-process (spec §3.4).
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function getDeviceIdentity(userDataDir: string): { id: string } {
  const p = path.join(userDataDir, 'device-id.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (typeof parsed?.id === 'string' && parsed.id) return { id: parsed.id };
  } catch { /* absent or corrupt — regenerate below */ }
  const fresh = { id: randomUUID() };
  try { fs.writeFileSync(p, JSON.stringify(fresh)); } catch { /* read-only disk: ephemeral id this launch */ }
  return fresh;
}
```

- [ ] **Step 3: Green. Commit** — `feat(sync): per-install device identity for leases`.

### Task 4: Desktop — device registry (Personal/Devices, friendly names)

**Files:**
- Create: `youcoded/desktop/src/main/sync-spaces/device-registry.ts`
- Test: `youcoded/desktop/tests/sync-spaces-device-registry.test.ts`

Pattern to copy: `sync-spaces/project-registry.ts` (per-file records, `mutateFileUnderLock`, fold-on-read using `store-core`'s `laterOf`/`isConflictCopyName`/`extractConflictBase`). Record: `Personal/Devices/<deviceId>.json` → `{ schemaVersion: 1, id, name, platform, lastSeen, updatedAt }`. Merge rules: `name` is LWW by `updatedAt`; `lastSeen` takes the max. **Per-device file = each device normally writes only its own file → conflicts only from cross-device renames, healed by fold-on-read.**

- [ ] **Step 1: Failing tests:** round-trip write/read; `upsertSelf` stamps lastSeen without clobbering a newer name; fold-on-read picks the newer `name` from a conflict copy and the max `lastSeen`; malformed files skipped.
- [ ] **Step 2: Implement** exports: `readDevices(personalRoot): DeviceRecord[]`, `upsertSelf(personalRoot, {id, name?, platform})` (creates with `os.hostname()` default name if absent; only bumps `updatedAt` when name actually changes), `renameDevice(personalRoot, id, name)` (writes target file with LWW stamp).
- [ ] **Step 3: Green. Commit** — `feat(sync): device registry in Personal space (spec §10a)`.

### Task 5: Desktop — sync-hub-socket lease frames + request correlation

**Files:**
- Modify: `youcoded/desktop/src/main/sync-hub-socket.ts`
- Test: `youcoded/desktop/tests/sync-hub-socket.test.ts` (extend; it already injects a fake `WebSocketCtor`)

- [ ] **Step 1: Failing tests:** `request('acquire', sid, did)` resolves the matching `lease-result` by `reqId`; a mismatched reqId doesn't resolve it; times out to `null` after 5s (fake timers); resolves `null` immediately when not connected; **pending requests are rejected-to-null when the socket goes down** (call the fake's close handler mid-request); `lease-event` frames emit as `SyncHubEvent`.
- [ ] **Step 2: Implement:** extend the event union + API:

```ts
export interface LeaseHolder { deviceId: string; device: string; expiresAt: number }
export type SyncHubEvent =
  | { type: 'connected' } | { type: 'disconnected' }
  | { type: 'signal'; kind: string; spaceKey: string }
  | { type: 'lease-event'; kind: 'released' | 'taken' | 'takeover-request'; sessionId: string; device?: string; from?: { deviceId: string; device: string } };

// inside createSyncHubSocket:
let reqCounter = 0;
const pending = new Map<string, { resolve: (r: LeaseResult | null) => void; timer: NodeJS.Timeout }>();
function failAllPending() { for (const [, p] of pending) { clearTimeout(p.timer); p.resolve(null); } pending.clear(); }
// CALL failAllPending() inside handleDown() and in setDesired(false)/destroy() —
// a request stranded across a reconnect must resolve null (never-block), not hang.

// message handler additions (inside the existing try):
} else if (msg && msg.type === 'lease-result' && typeof msg.reqId === 'string' && pending.has(msg.reqId)) {
  const p = pending.get(msg.reqId)!; pending.delete(msg.reqId); clearTimeout(p.timer);
  p.resolve({ ok: !!msg.ok, op: msg.op, sessionId: msg.sessionId, holder: msg.holder ?? null });
} else if (msg && msg.type === 'lease-event' && msg.kind && msg.sessionId) {
  opts.onEvent({ type: 'lease-event', kind: msg.kind, sessionId: msg.sessionId, device: msg.device, from: msg.from });
}

// public API addition:
request(op: string, sessionId: string, deviceId: string): Promise<LeaseResult | null> {
  if (ws === null || ws.readyState !== WebSocket.OPEN) return Promise.resolve(null); // never-block
  const reqId = `r${++reqCounter}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => { pending.delete(reqId); resolve(null); }, 5_000);
    timer.unref?.();
    pending.set(reqId, { resolve, timer });
    try { ws!.send(JSON.stringify({ type: 'lease', op, sessionId, deviceId, reqId })); }
    catch { pending.delete(reqId); clearTimeout(timer); resolve(null); }
  });
},
```

- [ ] **Step 3: Green (whole hub-socket suite). Commit** — `feat(sync): lease request/response frames on the hub socket`.

### Task 6: Desktop — lease-client

**Files:**
- Create: `youcoded/desktop/src/main/conversations/lease-client.ts`
- Test: `youcoded/desktop/tests/lease-client.test.ts` (fake hub via the socket's structural interface)

Responsibilities: per-held-session 30s renew timers; acquire/release/query/takeover ops; **lease-file fallback** (`Personal/Leases/<sessionId>.json` `{deviceId, device, expiresAt}` — written on acquire/renew, deleted on release, consulted by `query` when the hub returns null; identical 300s stale rule using local clock, tolerated because file-fallback is best-effort); emits `onTakeoverRequest(sessionId, from)` upward.

- [ ] **Step 1: Failing tests:** acquire starts a renew timer (fake timers: renew fires at 30s); release stops it and deletes the file; query prefers hub result, falls back to an unexpired file, treats an expired file as free; hub-null + no file = free; takeover-request event for a HELD session invokes the callback, for an unheld session is ignored; `destroy()` clears all timers.
- [ ] **Step 2: Implement.** Shape:

```ts
export interface LeaseClientOpts {
  deviceId: string;
  deviceName: string;
  personalRoot: () => string | null;           // null when managed roots unavailable
  hubRequest: (op: string, sessionId: string, deviceId: string) => Promise<LeaseResult | null>;
  onTakeoverRequest: (sessionId: string, from: { deviceId: string; device: string }) => void;
}
export interface LeaseQueryResult { held: boolean; device?: string; expiresAt?: number; source: 'hub' | 'file' | 'none' }
```

Key WHY comments to include: renew failure (`ok:false` — someone force-acquired) must stop the timer AND invoke `onTakeoverRequest`-equivalent handling ("A's client, whenever it wakes, sees it no longer holds the lease" — spec §3 step 5); every timer `unref()`; all fs ops try/caught (file fallback is best-effort).

- [ ] **Step 3: Green. Commit** — `feat(sync): lease client with heartbeat + file fallback`.

### Task 7: Desktop — noteSessionEnded + targeted materialize (Bug 2 Part 2) + Bug 1 browse filter

**Files:**
- Modify: `youcoded/desktop/src/main/conversations/service.ts`
- Modify: `youcoded/desktop/src/main/ipc-handlers.ts` (session-exit handler ~`:2028`; SESSION_BROWSE ~`:1240` — **verify anchors by grepping `session-exit` and `SESSION_BROWSE`**)
- Test: `youcoded/desktop/tests/conversations-service.test.ts` (extend)

- [ ] **Step 1: Failing tests:**
  - `noteSessionEnded deletes the guard entry` (start store, noteSessionStarted, noteSessionEnded, assert a subsequent sweep materializes the record — reuse the existing sweep test fixtures)
  - `materialize-after-end waits for quiescence` (write the local file, call noteSessionEnded, grow the local file once during the wait, assert the space→local copy happens only after size stabilizes; fake timers)
  - `materialize-after-end is targeted` (two records; only the ended session's local file changes)
  - `noteSessionEnded with no store is a no-op` (never throws)
- [ ] **Step 2: Implement in `service.ts`:**

```ts
const QUIESCE_PROBE_MS = 750;   // two equal-size stats this far apart = CC done flushing
const QUIESCE_MAX_MS = 6_000;   // give up waiting; skip this round (reconciler/startup sweep catch up)

export function noteSessionEnded(claudeSessionId: string): void {
  const ctx = sessions.get(claudeSessionId);
  sessions.delete(claudeSessionId); // release the materialize guard FIRST — even if the rest bails
  if (!store) return;
  // session-exit fires BEFORE the PTY worker actually dies (spec §3 refinement b):
  // CC may still be flushing a final turn. Gate the targeted materialize on the
  // local transcript being quiescent, and never full-scan (refinement a).
  void materializeEndedSession(claudeSessionId, ctx?.cwd).catch(() => { /* never reject in main */ });
}

async function materializeEndedSession(id: string, cwd?: string): Promise<void> {
  const s = store; if (!s) return;
  let rec; try { rec = await s.get('claude', id); } catch { return; }
  if (!rec?.transcriptRef) return;
  const managed = new Map<string, string>((getManagedRoots()?.listProjects() ?? []).map(p => [p.name, p.path]));
  let saved: Array<{ path: string }> = [];
  try { saved = readFolders(); } catch { /* saved folders unreadable */ }
  const local = cwd ?? resolveLocalProject(rec, managed, saved);
  if (!local) return;
  const localPath = localJsonlPath(local, id);
  // Quiescence: poll size until stable across one probe interval (or timeout → skip).
  const started = Date.now();
  let prev = -1;
  while (Date.now() - started < QUIESCE_MAX_MS) {
    let size = 0;
    try { size = fs.statSync(localPath).size; } catch { size = 0; } // absent local is quiescent
    if (size === prev) break;
    prev = size;
    await new Promise(r => setTimeout(r, QUIESCE_PROBE_MS));
  }
  if (sessions.has(id)) return; // re-opened during the wait — the guard wins
  try {
    materializeOut({ spaceTranscriptPath: path.join(s.root(), rec.transcriptRef), localJsonlPath: localPath });
  } catch { /* grow-only copy failed — startup sweep catches up */ }
}
```

  (Add the `fs` import if absent; it already imports `node:fs` at top.)
- [ ] **Step 3: Wire `ipc-handlers.ts` session-exit** — the handler already resolves `claudeId` before `sessionIdMap.delete` (verified at `:2031-2036`). Add, right after the marker unlinks:

```ts
    if (claudeId) {
      // ...existing two fs.unlink lines...
      // 2b: release the conversation-store materialize guard + apply any peer
      // version now that this session ended (Bug 2 Part 2 — no restart needed).
      noteSessionEnded(claudeId);
    }
```

  (The companion `leaseClient?.release(claudeId)` line lands in Task 8, where the lease client is constructed — do NOT reference `leaseClient` in this task; it doesn't exist yet.)

- [ ] **Step 4: Bug 1 — make SESSION_BROWSE resilient to stale mappings.** Replace the activeIds loop:

```ts
    // Bug 1 (2026-07-13 dogfood): a stale sessionIdMap entry (missed exit event,
    // or a create+resume pair leaving two desktop ids on one claude id) hid a
    // CLOSED session from the browser until restart. Filter to mappings whose
    // desktop session actually still exists — the map is a cache, not truth.
    const activeIds = new Set<string>();
    for (const [desktopId, claudeId] of sessionIdMap.entries()) {
      if (sessionManager.getSession(desktopId)) activeIds.add(claudeId);
    }
```

  (Verify `sessionManager.getSession` returns null/undefined for destroyed sessions — grep its implementation in `session-manager.ts`; if destroyed sessions linger there too, use its live-sessions listing instead. **Do not skip this verification** — it's the crux of Bug 1.)
- [ ] **Step 5: Green (service + a new ipc-level test if the harness supports it). Commit** — `fix(sync): materialize-on-release + resume-browser stale-active fix (Bug 1 + Bug 2 Part 2)`.

### Task 8: Desktop — wire lease client into service + session lifecycle + takeover (holder side)

**Files:**
- Modify: `youcoded/desktop/src/main/sync-spaces/service.ts` (hub socket creation ~`:258` — pass lease frames through; expose `hubLeaseRequest`)
- Modify: `youcoded/desktop/src/main/main.ts` (construct lease client with `getDeviceIdentity(app.getPath('userData'))`, wire `upsertSelf` at startup)
- Modify: `youcoded/desktop/src/main/ipc-handlers.ts` — TWO insertions: (a) SessionStart block ~`:2013-2023`: after `noteSessionStarted`, `leaseClient?.acquire(claudeId)` — fire-and-forget, `ok:false` logs a warn but NEVER blocks (the sanctioned resume path already handled takeover before spawn); (b) session-exit handler: add `leaseClient?.release(claudeId)` next to the `noteSessionEnded(claudeId)` call Task 7 placed (deferred from Task 7 because the client is constructed here)
- Test: extend `tests/sync-spaces-service.test.ts` (it already fakes the hub socket)

**Holder-side takeover sequence** (in a new function, `handleTakeoverRequest(claudeId, from)`, living in ipc-handlers or a small `takeover.ts` next to it, injected into the lease client's `onTakeoverRequest`):

1. Reverse-map claudeId → desktopId(s) via `sessionIdMap` entries.
2. If none (we don't actually have it live): just `leaseClient.release(claudeId)` and return.
3. Send `\x1b` to the PTY (`sessionManager` write path — single byte, safe per PITFALLS "Keyboard Routing").
4. Wait for transcript quiescence on the local JSONL (reuse the Task 7 probe constants).
5. `mirrorIn` local→space + `syncSpacesSyncNow('personal')` (both best-effort, caught).
6. `leaseClient.release(claudeId)`.
7. Push `session:moved` `{sessionId: desktopId, device: from.device}` to the renderer (both `send(...)` and `remoteServer.broadcast` — same dual path as transcript events).
8. `sessionManager.destroySession(desktopId)` — this fires `session-exit`, which runs the Task 7 cleanup (noteSessionEnded is harmless here; release is idempotent).

- [ ] Tests: fake hub emits `takeover-request` → assert the ordered effects (interrupt write, mirror, release, push, destroy) using injected fakes. Keep the sequence assertions strict — **release-before-destroy and mirror-before-release are load-bearing** (requester pulls after seeing the release; the push must already contain the final turn).
- [ ] Commit — `feat(sync): lease lifecycle wiring + holder-side takeover`.

### Task 9: Desktop — requester-side takeover IPC + Resume Browser dialogs

**Files:**
- Modify: `youcoded/desktop/src/main/ipc-handlers.ts` — three handlers:
  - `syncspaces:lease-query` `{claudeSessionId}` → `LeaseQueryResult`
  - `syncspaces:lease-takeover` `{claudeSessionId}` → runs the whole requester flow in main: send `op:'takeover'`; poll `query` every 1s up to 10s; on free → `syncSpacesSyncNow('personal')`, targeted materialize (reuse `materializeEndedSession`'s core via an exported `materializeOne(id)`), `acquire`; returns `{outcome:'acquired'|'timeout'|'error'}`
  - `syncspaces:lease-force` `{claudeSessionId}` → `force-acquire` + pull + materialize; returns `{ok}`
- Modify: `youcoded/desktop/src/renderer/components/ResumeBrowser.tsx` (or wherever the resume click handler lives — grep `resumeSessionId` in the renderer): before invoking resume for a store-backed row, call `lease-query`; if `held` and device ≠ self → L2 confirm dialog **"This session is active on <device> — take over here?" / "Never mind"**; on confirm call `lease-takeover`; on `'timeout'` → second dialog **"<device> isn't responding — take over anyway?"** → `lease-force`. Then proceed with the normal resume invoke. Plain words, no glyphs, `<Scrim>`/`<OverlayPanel>` primitives (PITFALLS → Overlays).
- Test: main-side handler test with fakes (poll loop with fake timers); renderer flow can be covered by the dialog component's unit render if the harness allows, else rely on review + dogfood.

- [ ] Commit — `feat(sync): requester-side takeover flow + Resume Browser dialogs`.

### Task 10: Renderer — moved-to banner (SESSION_MOVED)

**Files:**
- Modify: `youcoded/desktop/src/renderer/state/chat-types.ts` + `chat-reducer.ts` — new action `SESSION_MOVED {sessionId, device}`. Handler: spread `endTurn(session, 'Conversation moved')` then append a system marker. **First grep the compaction `SystemMarker` shape in chat-types.ts and mirror it exactly** (add a `kind: 'moved'` or equivalent discriminant; text: `This conversation moved to <device>`). Follow the spread-then-override pattern documented in PITFALLS → Chat Reducer.
- Modify: `App.tsx` — subscribe to the `session:moved` push (new preload/remote-shim event registration) → dispatch.
- Modify: `SystemMarker.tsx` — render the moved marker (no expandable content).
- Test: reducer test — SESSION_MOVED mid-turn clears `isThinking`, fails running tools with 'Turn ended', appends the marker; idle SESSION_MOVED appends the marker only.

- [ ] Commit — `feat(sync): moved-to banner via SESSION_MOVED`.

### Task 11: IPC parity sweep + Android stubs

**Files:** `preload.ts`, `remote-shim.ts`, `ipc-handlers.ts`, `remote-server.ts`, `SessionService.kt`, `shared/types.ts` (IPC constants), `tests/ipc-channels.test.ts`.

New channels (exact strings, identical everywhere):
`syncspaces:lease-query`, `syncspaces:lease-takeover`, `syncspaces:lease-force`, `syncspaces:list-devices`, `syncspaces:rename-device`; push event `session:moved`.

- [ ] preload: inlined literals (sandboxed preload cannot import); remote-shim: object payloads per its convention; remote-server: route the five request channels (same pattern as the existing `syncspaces:*` rows); SessionService.kt: one combined `when` case returning `{ok:false, error:'not-implemented-on-mobile'}` (artifact-stub pattern — invokes reject fast instead of 30s-timing-out).
- [ ] Extend the `ipc-channels.test.ts` syncspaces parity describe with the new rows. Run it: `env -u YOUCODED_PROFILE -u YOUCODED_PORT_OFFSET npx vitest run tests/ipc-channels.test.ts`.
- [ ] Commit — `feat(sync): lease/device IPC parity + Android stubs`.

### Task 12: Devices UI ("Your devices" in Backup & Sync)

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/SettingsPanel.tsx` (SyncPanel section) — list from `syncspaces:list-devices`: friendly name (inline-editable → `rename-device`), "last seen <relative>", a plain-words "(this device)" suffix for the matching id. No status dots here — plain text only.
- `list-devices` main handler: `readDevices(personalRoot)` + mark `self` by deviceId; `upsertSelf` runs at service start (Task 8) so the list is never empty.
- [ ] Commit — `feat(sync): Your devices list (spec §10a)`.

### Task 13: Docs, PITFALLS, whole-branch review, PR

- [ ] New PITFALLS entries under "Sync Spaces": lease frames never enter the replay ring (why); deviceId is per-install userData (why); noteSessionEnded quiescence gate (why); Bug-1 browse filter (map is a cache, not truth); release-before-destroy ordering in takeover.
- [ ] Update the handoff tracker §2.B + phase table (2b → shipped) and the investigation doc header (Bug 1 → fixed by which commit; Part 2 → shipped).
- [ ] Whole-branch review (spec-compliance vs. design §3 + this plan; code-quality). Full suite: `cd youcoded/desktop && env -u YOUCODED_PROFILE -u YOUCODED_PORT_OFFSET npx vitest run && npx tsc --noEmit && npm run build`.
- [ ] PR to youcoded master; merge means merge AND push; clean worktrees.

## How to verify end-to-end (two-device dogfood, dev builds)

1. A opens a conversation → B's Resume Browser row click shows the takeover dialog naming A. Confirm → A shows the moved banner, its session ends; B resumes with A's final turn present.
2. Kill A's network mid-hold → B's takeover times out at ~10s → force dialog → B resumes; A on reconnect stops renewing and shows the banner (renew `ok:false` path).
3. Close a session on A; continue it on B; back on A **without restarting**: the row is present (Bug 1) and resume picks up B's turns (Bug 2 Part 2).
4. Rename a device on A → name shows on B's devices list after the next Personal sync.
5. `netstat`/process discipline per handoff §4 when done.
