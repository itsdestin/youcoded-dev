---
status: shipped
---

> **Resolution shipped 2026-07-18** — youcoded PR #176 (merge `e7b09f60`). Fixes 1-3
> (the reported symptoms) plus the §3.5 secondary issues landed; only Fix 4 (holder
> ack) and the TTL/sweeper tuning remain deferred. Implementation plan:
> `docs/archive/plans/2026-07-18-conversation-takeover-fixes.md`.

# Conversation takeover failures (Plan 2b leases) — symptoms, diagnosis, proposed fixes

**Date:** 2026-07-18
**Status:** Investigation complete by static analysis. Root cause for the lost turns is
confirmed in code; the preceding timeout has a leading hypothesis that is **not yet
verified** (see "Open question" below).
**Scope:** `youcoded/desktop/src/main/conversations/{takeover,lease-client,service}.ts`,
`sync-spaces/service.ts`, `ipc-handlers.ts`, `main.ts`, `renderer/App.tsx`, and the
`SyncGroupRoom` Durable Object in `wecoded-marketplace/worker/src/sync/room.ts`.
**Not reproduced against a running app** — no dev instance was launched and the live app
was not touched. Every claim below is cited to source.

---

## TL;DR

1. **The lost turns are fully explained.** `force-acquire` never notifies the holder. The
   DO does broadcast `{kind:"taken"}`, but the desktop client's lease-event listener
   handles only `takeover-request` and drops `taken`/`released` on the floor
   (`main.ts:1600-1602`). So the holder was never interrupted and never ran
   `flushSessionToSpace` — its final turns stayed on local disk while the requester
   materialized a stale space copy.
2. **The mirror-before-release barrier does not exist.** `syncSpacesSyncNow` is
   fire-and-forget (`void engine.syncSpace(s)`), so every `await` on it is a no-op. Both
   the holder's flush and the requester's pre-materialize pull complete before any git
   push/pull has run.
3. **There is no holder ack in the protocol.** `takeover` returns `ok:true`
   unconditionally before any device has seen the request, so the requester's 10s poll is
   blind — it cannot distinguish "holder is working on it", "holder is asleep", and
   "holder heard it but doesn't think it owns the lease".
4. **Takeover does not engage at all for native-provider sessions.** They emit no CC hooks,
   so they never enter `sessionIdMap` and never acquire a lease. Not the cause of this
   report, but it silently disables the whole mechanism for that session class.

---

## 1. Described symptoms

Reported by Destin, testing a beta build from `master`:

1. A conversation was **mid-turn on device A**.
2. From **device B**, he attempted to take over that conversation.
3. B did **not** hand over cleanly — it fell through to the **force** dialog
   ("<device> isn't responding — take over anyway?").
4. He confirmed the force. The force **succeeded** — B acquired the session.
5. The resumed conversation on B was **missing a couple of turns**.

### The flow he expected

> B requests takeover → A notes it is mid-turn and says so → B offers to force → he
> confirms → **A interrupts its turn, syncs, and then confirms the handoff** → B resumes
> with everything intact.

That expectation is sound and is close to what the holder-side code was designed to do.
The gap is that steps 2 and 5 of that flow do not exist in the current implementation —
see §3.

---

## 2. Diagnosis steps

### 2.1 Surveyed the takeover surface

`grep -ril takeover` across `youcoded/` returned 24 files. The load-bearing ones:

| File | Role |
|---|---|
| `desktop/src/main/conversations/takeover.ts` | Both flows: `createHolderTakeover` (steps 1-8) and `createRequesterTakeover` (poll + force) |
| `desktop/src/main/conversations/lease-client.ts` | Heartbeat renew, acquire/release/query/takeover, lease-file fallback |
| `desktop/src/main/conversations/service.ts` | `flushSessionToSpace`, `materializeOne`, quiescence |
| `desktop/src/main/sync-hub-socket.ts` | Hub transport, `request()` reqId correlation |
| `desktop/src/main/main.ts` | Lease client + requester construction, lease-event listener |
| `desktop/src/main/ipc-handlers.ts` | `sessionIdMap`, `pushMoved`, SessionStart acquire, IPC passthroughs |
| `desktop/src/renderer/App.tsx` | `handleResumeSession` — the only takeover call site |
| `wecoded-marketplace/worker/src/sync/room.ts` | `SyncGroupRoom` DO — authoritative lease store |

### 2.2 Ran the guard tests — all green

```
npx vitest run tests/holder-takeover.test.ts tests/requester-takeover.test.ts tests/lease-client.test.ts
→ 3 files, 35 tests, all passed (289ms)
```

This was informative in the negative: the unit logic is intact, so the defect lives in the
**seams between units**. Notably `requester-takeover.test.ts` injects `syncNow` as a stub,
so the fire-and-forget behavior of the real `syncSpacesSyncNow` is never exercised — which
is precisely how finding §3.2 survived the test suite.

### 2.3 Traced the holder-side path

`takeover.ts:32-85`, documented order: reverse-map → interrupt (ESC) → `flushSessionToSpace`
→ `release` → `pushMoved` → `destroySession`. Every step independently `try/catch`ed with an
outer backstop. The **ordering is correct** — `release` (step 6) precedes `pushMoved` (7) and
`destroySession` (8), so a throw in 7 or 8 cannot strand the requester.

### 2.4 Followed the "mirror-before-release" claim to its implementation

`takeover.ts:63-67` states the invariant:

> MIRROR-BEFORE-RELEASE is load-bearing: the requester pulls the moment it sees the release,
> so the final turn must already be in the space

`flushSessionToSpace` ends with (`conversations/service.ts:351`):

```ts
try { await Promise.resolve(syncSpacesSyncNow('personal')); } catch { /* the poll covers a miss */ }
```

But `syncSpacesSyncNow` does not await (`sync-spaces/service.ts:446-456`):

```ts
for (const s of roots.spaces()) {
  if (spaceId && s.id !== spaceId) continue;
  void engine.syncSpace(s);   // <-- discards a real Promise<void>
}
return { ok: true };
```

`engine.syncSpace` is `async ... Promise<void>` (`engine.ts:117`). Confirmed via
`grep -rn "syncSpacesSyncNow\|awaitSync\|syncSpaceAndWait"` that **no awaitable variant
exists anywhere** in the codebase. → finding §3.2.

### 2.5 Delegated the Worker DO and renderer paths to parallel subagents

**DO findings** (`wecoded-marketplace/worker/src/sync/room.ts`):

- `release` **is** ownership-checked (`room.ts:198-211`) — a non-holder release returns
  `ok:false` and does not delete. This **refuted** an earlier hypothesis that the holder's
  post-`destroySession` release at `ipc-handlers.ts:2268` could clobber the requester's
  fresh lease. Ruled out.
- `takeover` returns `ok:true` **unconditionally** (`room.ts:212-216`), before any delivery.
  → finding §3.3.
- `force-acquire` broadcasts `{kind:"taken", sessionId, device}` (`room.ts:217-223`).
  → this is the thread that led to finding §3.1.
- Lease events are **excluded from the replay ring** (`room.ts:236-238`); expiry is
  **lazy-only**, no alarm or sweeper (`room.ts:167-168`), `LEASE_TTL_MS = 300_000`.
- Broadcast fans to **all sockets in the room except the sender** — it is not targeted at
  the holder. Client-side filtering via `held.has(sessionId)` is what makes it correct.
- DO is keyed per-account via `idFromName(userId)` from `sessions.user_id`; two devices on
  one account cannot land in different instances.
- Verified the six op strings match exactly across client and DO (`get`/`acquire`/`renew`/
  `release`/`takeover` in `lease-client.ts`, `force-acquire` at `main.ts:717`). **No
  spelling drift** — the DO's silent unknown-op fallthrough (`room.ts:224-226`) is not
  firing here. Ruled out.

**Renderer findings** (`App.tsx:2124-2148`) — the only takeover call site:

```ts
const q = await window.claude.syncSpaces?.leaseQuery?.(claudeSessionId);
if (q?.held && !q.self) {
  const confirmed = await askTakeover(device, 'confirm');
  if (!confirmed) return;
  const r = await window.claude.syncSpaces?.leaseTakeover?.(claudeSessionId);
  if (r?.outcome === 'timeout') {
    const forced = await askTakeover(device, 'force');
    if (!forced) return;
    await window.claude.syncSpaces?.leaseForce?.(claudeSessionId);   // return value discarded
  }
  // 'acquired' or 'error' -> fall through and resume
}
```

- `outcome: 'error'` is handled **nowhere** — silent fall-through to resume.
- `leaseForce`'s `{ok:false}` is **discarded** — a failed force is equally silent.
- Takeover is **not** gated behind `native.supported`/`YOUCODED_NATIVE`. Its real gate is
  `isSyncSpacesEnabled()`, and only on **acquire** (`ipc-handlers.ts:2249`).

### 2.6 Ruled out a broken event listener

Because the symptom implies the holder never responded, the lease-event wiring was checked
directly. It is **correct**: `setSyncSpacesLeaseEventListener` is registered before
`startSyncSpaces` (`main.ts:1600`), and the service forwards to it
(`sync-spaces/service.ts:333`). But reading it is what surfaced §3.1 — the listener body
handles exactly one event kind.

---

## 3. Findings

### 3.1 Force never notifies the holder — CONFIRMED, this is the lost turns

`requester.force()` (`takeover.ts:152-162`) is `forceAcquire` → `syncNow` → `materializeOne`.
The holder is told nothing.

The DO *does* broadcast `{kind:"taken"}` on force-acquire, but the client drops it
(`main.ts:1600-1602`):

```ts
setSyncSpacesLeaseEventListener((ev) => {
  if (ev.kind === 'takeover-request') leaseClient?.handleTakeoverRequest(ev.sessionId, ev.from);
});
```

`taken` and `released` are both ignored. Consequence, matching the report exactly: device A
kept running its turn, never received the ESC interrupt, never ran `flushSessionToSpace`.
Its final turns stayed local. B materialized the last-synced space copy → **missing a
couple of turns**. Two live writers on one transcript, with no UI signal on either side.

### 3.2 The mirror-before-release barrier does not exist — CONFIRMED

Per §2.4. Both the holder's flush and the requester's pre-materialize pull resolve before
any git operation completes. Even had the takeover path run normally, the requester could
have materialized a stale space. This is an independent second cause of lost turns.

### 3.3 No holder ack in the protocol — CONFIRMED

`takeover` returns `ok:true` before delivery, and lease events are excluded from the replay
ring, so an offline holder never learns of the request while its lease persists for the full
300s TTL. The requester's budget is `MAX_MS = 10_000` (`takeover.ts:120`) — a **30x gap**.
The requester cannot distinguish:

- holder is live and handing off (wait),
- holder is asleep/offline (force is correct),
- holder heard it but `held.has()` was false (force is correct but will lose data).

### 3.4 Leading hypothesis for the timeout — NOT VERIFIED

Under normal operation the holder should release in ~2-6s (quiescence caps at
`QUIESCE_MAX_MS = 6_000`, `service.ts:27`), comfortably inside the 10s budget. That Destin
got a force offer means the holder did not release. §2.6 rules out the event never arriving.

The leading candidate is that **device A never held the lease locally**. In
`lease-client.ts:230-234`, when `acquire` returns `ok:false` (another device holds it), the
client returns early **without** adding to `held`. The call site discards the result
entirely (`ipc-handlers.ts:2249`):

```ts
if (isSyncSpacesEnabled()) void leaseWiring?.client.acquire(claudeId).catch(() => {});
```

So a session can run indefinitely believing nothing is wrong while not owning its lease.
A subsequent `takeover-request` then early-returns at `lease-client.ts:305`
(`if (!held.has(sessionId)) return;`) — no interrupt, no flush — which guarantees the 10s
timeout and lands directly in §3.1.

This chain produces all three symptoms in the reported order, but it **requires a
pre-existing stale lease record** (from a crash, a sleep, or the beta build and live app
being two installs with distinct `deviceId`s). That precondition is unconfirmed.

**Open question — cheap to settle:** inspect `~/YouCoded/Personal/Leases/*.json` on both
machines for stale records, and check whether the affected `sessionId` shows a holder
`deviceId` belonging to neither current install.

### 3.5 Secondary issues found en route

- **Native-provider sessions get no takeover protection.** No CC hooks → never in
  `sessionIdMap` → never acquire. `leaseQuery` always answers `held:false` and the gate at
  `App.tsx:2124` never fires. Silent for that whole session class.
- **Silent `error` outcome** (§2.5) — user clicks "take over", handoff never happens, resume
  proceeds with no signal.
- **Split-brain on hub loss.** The client holds optimistically when `hubRequest` returns null
  (`lease-client.ts:204-209`) while the DO expires the record at 300s. A requester then sees
  `holder:null`, acquires **without ever sending a takeover**, and both devices go live.
- **Half-handoff on duplicate desktop ids.** A create+resume pair can map two desktop ids to
  one claude id (`ipc-handlers.ts:1300-1304`); `takeover.ts:56` pick-firsts and the other
  live session is never interrupted, destroyed, or told it moved.
- **Moved pill can land on the wrong window.** `pushMoved` routes via `sendForSession`, which
  falls back to `mainWindow` with no registered owner — the gate never appears and the
  session appears to vanish.

---

## 4. Proposed fixes

Ordered by (impact ÷ risk). Items 1-3 address the reported bug; 4-5 are the design gap.

### Fix 1 — Handle `taken` in the lease-event listener *(small, high value)*

`main.ts:1600-1602`. Route `taken` through the same holder teardown as `takeover-request`
so a forced steal still interrupts → flushes → pushes moved → destroys. Guard on the
holder's own `deviceId` so a device never tears down on its own force.

This alone converts "force loses turns" into "force costs one interrupted turn", which is
the intended semantics.

### Fix 2 — Make the handoff sync actually awaitable *(medium, touches shared callers)*

Add an awaitable variant alongside `syncSpacesSyncNow` — e.g.
`syncSpacesSyncNowAwaited(spaceId)` returning `Promise.allSettled(spaces.map(s => engine.syncSpace(s)))`
with a bounded timeout. Use it in exactly the two barrier sites: `flushSessionToSpace`
(`service.ts:351`) and the requester's pre-materialize pull (`takeover.ts:141`, `:158`).

Leave the existing fire-and-forget `syncSpacesSyncNow` alone for the "Sync now" button and
the `service.ts:173` signal path — changing those would make UI clicks block on the network.

**Raise `MAX_MS` alongside this.** Once the holder genuinely awaits its push, 10s is too
tight; the budget must exceed quiescence (6s) + a real push. Better still, make the poll
adaptive — see Fix 4.

### Fix 3 — Surface failures instead of silently proceeding *(small)*

`App.tsx:2124-2148`. Handle `outcome: 'error'` and check `leaseForce`'s `{ok}`. On either
failure, still let the resume proceed (never-block holds) but show a non-blocking warning
that the other device may still be live and turns may be missing.

Also stop discarding the acquire result at `ipc-handlers.ts:2249` — at minimum log when
acquire returns `ok:false`, since today a session can run its entire life not owning its
lease with zero trace. This is the observability that would have settled §3.4 immediately.

### Fix 4 — Add a holder ack to the protocol *(larger; the real gap Destin identified)*

Give `takeover` a response path so the requester learns what actually happened:

- Holder receives `takeover-request`, and **immediately** — before interrupting — replies
  with an ack carrying its state (`mid-turn` / `idle` / `not-held`).
- DO relays the ack to the requester.
- Requester behavior becomes informed rather than blind:
  - **ack `mid-turn`** → show "device A is finishing its turn…" and wait on a *longer*
    budget, since a clean handoff is genuinely in progress.
  - **ack `not-held`** → offer force immediately; no reason to wait 10s.
  - **no ack within ~2s** → holder is offline; offer force immediately with an honest
    "device A appears offline" message.

This is exactly the flow Destin described. It requires a new DO op/event kind (a
`lease-ack` frame relayed sender→requester), so it should be specced before implementation.

**Design tension to resolve first:** never-block currently means "on any lease failure,
proceed with the resume". Fixes 3 and 4 push toward waiting on a real handshake. The
resolution proposed here is that never-block should mean *never hard-block the user*, not
*silently proceed while pretending the handoff worked* — but that is a product call, not an
implementation detail, and should be decided explicitly.

### Fix 5 — Backlog

- Decide whether native-provider sessions should participate in leases at all. If yes, they
  need a `sessionIdMap` entry from a non-hook source. If no, the Resume Browser should say
  so rather than silently offering an unprotected resume.
- Interrupt **all** live desktop ids in `takeover.ts:43-57`, not just the first.
- Fix `pushMoved` window routing for sessions with no registered owner.
- Consider a DO-side sweeper or a shorter TTL, so a ghost lease does not persist 300s.

---

## 5. Guard tests to add

Each fix should land with a pinning test, per the workspace's knowledge-placement rule:

- `taken` event drives holder teardown (Fix 1) — extend `holder-takeover.test.ts`.
- The requester's `syncNow` dep **awaits** before `materializeOne` is called (Fix 2) —
  extend `requester-takeover.test.ts`; today's stub hides this.
- `outcome: 'error'` and `force → {ok:false}` both surface a warning (Fix 3) — renderer test.
- Ack-driven branching (Fix 4) — new tests on both sides plus a DO test in
  `wecoded-marketplace/worker/test/sync-hub.test.ts`.

---

## 6. Verification note

Nothing here was reproduced against a running app, and per the live-app-safety rule the
built app was not touched. Confirming §3.4 needs either the `Leases/` inspection above or a
two-instance dev repro (`bash scripts/run-dev.sh` alongside a second profile) — that repro
is interactive and multi-window, so per CLAUDE.md it should be handed to Destin rather than
scripted.
