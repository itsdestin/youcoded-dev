# Plan 2b (Session Leases + Takeover) — Adversarial Review Findings + "Moved Gate" Follow-up

**Date:** 2026-07-14
**Reviewer:** prior session (adversarial bug review of Plan 2b before merge)
**Branch under review:** `feat/sync-leases` in BOTH repos
- Desktop: youcoded PR #121 — worktree `C:\Users\desti\youcoded-dev\youcoded-worktrees\sync-leases\desktop`
- Worker: wecoded-marketplace PR #22 — worktree `C:\Users\desti\youcoded-dev\wecoded-marketplace-worktrees\sync-leases\worker`

**Governing docs:**
- Plan: `docs/superpowers/plans/2026-07-14-phase2-plan-2b-leases-takeover.md`
- Spec: `docs/superpowers/specs/2026-07-10-phase2-conversation-sync-design.md` §3 ("Session leases + takeover", "Materialize-on-release")

**Diffs:** `git diff master...feat/sync-leases` in each worktree.

**Overall verdict of the review:** The lease/DO/takeover machinery is sound. One **blocking** functional bug (Finding 1), one accepted-tradeoff to document (Finding 2). Everything else traced clean (list at bottom). Destin chose a specific fix for Finding 1 — the **"Moved Gate"** (§Fix below) — which is *lower risk* than the alternatives because it renders a dedicated full-page gate instead of keeping the dead session in the chat view.

---

## Finding 1 — BLOCKING — the "moved to <device>" banner is wiped the instant it's created

**Task 10's entire deliverable is unreachable in practice.**

### Mechanism (traced, high confidence)

Holder-side takeover (`desktop/src/main/conversations/takeover.ts`, `createHolderTakeover`):
- **Step 7** `pushMoved(desktopId, from?.device)` (takeover.ts ~line 78) → `pushMoved` in `ipc-handlers.ts` (~line 1786) sends `IPC.SESSION_MOVED` via `sendForSession(desktopId, …)` + `remoteServer.broadcast(…)`.
  - Renderer `movedHandler` (`App.tsx` ~line 1010) dispatches `SESSION_MOVED` → reducer `chat-reducer.ts:427` appends a permanent `variant:'moved'` system-marker to that session's timeline.
- **Step 8** `sessionManager.destroySession(desktopId)` (takeover.ts ~line 82) → `session-exit` → `ipc-handlers.ts:1370` sends `IPC.SESSION_DESTROYED` → renderer `destroyedHandler` (`App.tsx:736`):
  - `dispatch(SESSION_PROCESS_EXITED)` (App.tsx:740) — sets `attentionState:'session-died'` (killed PTY exits non-zero).
  - `setSessions(prev => prev.filter(s => s.id !== id))` (App.tsx:741–749) — removes the pill from the strip **and auto-switches** the view away.
  - `dispatch(SESSION_REMOVE)` (App.tsx:765) → `chat-reducer.ts:299` = `next.delete(sessionId)` — **wipes the whole chat state, marker included.**
  - also drops the session from `viewModes` / `permissionModes` / `sessionModels` / `initializedSessions`.

So the "permanent" moved marker is appended (step 7) then deleted (step 8) back-to-back. Every window and every remote client runs the same `destroyedHandler`, so **no surface retains it**. Both holder entry points hit this: the hub `takeover-request` path and the renew-`ok:false` (force-taken) path both funnel through `createHolderTakeover` → destroy.

Net user experience today on the taken-over device (Device A): the conversation silently vanishes from the strip and the view jumps to another session, with **no explanation**.

### Why the "obvious" fix (just skip `SESSION_REMOVE`) is NOT safe on its own

Three confirmed tails if you keep the dead session sitting in the normal chat view:
1. **Double-writer risk.** The holder released the lease; if the session stays live/visible the user could keep typing — the chat input is gated on `!sessionInitialized` (App.tsx:2509) which `destroyedHandler` clears, BUT the **terminal-view (xterm) write path** is not gated by that, so it re-opens a second writer to the same conversation. The session MUST be destroyed.
2. **Un-removable zombie.** `SESSION_DESTROY` only re-emits `session:destroyed` when the session was still live (`ipc-handlers.ts:517`). A kept, already-dead session's ✕ → `session.destroy(id)` returns `false` → no `session:destroyed` → never removed from the strip.
3. **Competing banner.** `destroyedHandler` also fires `SESSION_PROCESS_EXITED` → a "session died" banner would show alongside/instead of "moved".

The chosen fix (below) sidesteps ALL THREE by rendering a dedicated gate for the moved session instead of the chat/terminal view.

---

## Finding 2 — LOW / accepted tradeoff — document it, don't necessarily change it

`requester.force` (`takeover.ts:152`) returns `{ok:true}` even when `forceAcquire` returned `null` because the hub was down (`hubLeaseRequest` → `hubSocket?.request(...) ?? null`), and `App.tsx` then falls through and resumes. If the hub is down the real holder never received the `takeover-request` either, so both devices end up live on the same conversation (both mirror grow-only to the space). This is the never-block principle taken to its end — the user confirmed twice — so it is *defensible*, but the `{ok:true}` is misleading. On a shared-`~/.claude` machine (dev + built app) this is a genuine same-file double-writer; on distinct machines it's grow-only churn, not corruption.

**Action:** add a PITFALLS line under "Sync Spaces" (Task 13 already plans PITFALLS additions) noting hub-down force is a deliberate never-block degradation. Optionally have `force` surface a distinct outcome when `forceAcquire` was null so the UI could warn — but not required.

---

## Agreed Fix for Finding 1 — the "Moved Gate"

### Desired UX (Destin's design)
1. On Device A (the taken-over device), the session **pill/name stays in the top session strip**.
2. The actual Claude Code conversation is still **exited** (destroyed) and the transcript **lease released/locked** — exactly as the plan requires. (No change to the holder-side interrupt→flush→release→destroy sequence.)
3. Clicking that session opens a **full-page gate** modeled on `TrustGate` (the "trust this folder?" prompt), NOT the chat view.
4. The gate says: **"This session was taken over on *<devicename>*."**
5. Two buttons:
   - **Exit Session** → removes the pill (client-side removal — the CC session is already dead).
   - **Resume on this device** → runs the existing `handleResumeSession(...)` (the standard resume/takeover flow already built — it will re-query the lease, show the "active on B — take over?" dialog, hand off, materialize, acquire, resume).

Why this is the *safe* design: the moved session's ONLY interaction is the gate, so there is no chat/terminal write path (kills the double-writer risk), no "session died" banner (we don't render the normal view), and "Exit Session" is an explicit removal (no zombie).

### Difficulty estimate
Low–moderate, ~half a day. One new component + one handler branch + one tiny main-process payload enrichment. **No new IPC channels. No reducer/DO/worker/Android/lease-layer changes.** The one thing not locally verifiable is the full two-device flow → dogfood it.

### Implementation steps

**1. Enrich the `session:moved` push (main) so the gate can offer Resume.**
- File: `desktop/src/main/ipc-handlers.ts`, the `pushMoved` closure (~line 1786, inside the `if (leaseWiring)` block).
- At push time the holder session still exists (destroy is step 8, after pushMoved is step 7), so `sessionIdMap.get(desktopId)` = claudeId and the live session's `cwd` are both available. Add them to the payload:
  ```ts
  const pushMoved = (desktopId: string, device?: string) => {
    const claudeId = sessionIdMap.get(desktopId);
    const info = sessionManager.getSession(desktopId); // has cwd
    const cwd = info?.cwd;
    const payload = { sessionId: desktopId, device, claudeSessionId: claudeId, projectPath: cwd,
                      projectSlug: cwd ? /* same slug helper the resume browser uses */ : undefined };
    sendForSession(desktopId, IPC.SESSION_MOVED, payload);
    remoteServer?.broadcast({ type: IPC.SESSION_MOVED, payload });
  };
  ```
  - VERIFY: what `handleResumeSession(claudeSessionId, projectSlug, projectPath, …)` (App.tsx ~line 1890) actually needs `projectSlug` for, and which slug helper to use (check `ccProjectSlug` in `conversations/service.ts` / how the Resume Browser derives `projectSlug`). `projectPath` = cwd is straightforward.
- Update the `session:moved` payload type in `preload.ts` (`sessionMoved` cb type) and `useIpc.ts` — they currently type it as `{ sessionId, device? }`. remote-shim already forwards the whole payload object (no change needed there).

**2. Renderer: track moved sessions.**
- File: `desktop/src/renderer/App.tsx`.
- Add state: `const [movedSessions, setMovedSessions] = useState<Map<string, { device?: string; claudeSessionId?: string; projectSlug?: string; projectPath?: string }>>(new Map());`
- In `movedHandler` (~line 1010), instead of (or in addition to) dispatching the marker, record the entry:
  ```ts
  setMovedSessions(prev => new Map(prev).set(payload.sessionId, {
    device: payload.device, claudeSessionId: payload.claudeSessionId,
    projectSlug: payload.projectSlug, projectPath: payload.projectPath }));
  ```
  Keep dispatching `SESSION_MOVED` for its `endTurn` effect (cleanly stops any "thinking" state) — but the marker it appends is now redundant (we render the gate, not the timeline). See step 6 re: retiring the marker.

**3. `destroyedHandler` branch for moved sessions (App.tsx:736).**
- At the top of the handler, check `if (movedSessions.has(id)) { …moved branch… return; }` BEFORE the normal removal.
- Moved branch:
  - Do NOT `setSessions(filter)` (keep the pill) and do NOT auto-switch.
  - Do NOT `dispatch(SESSION_PROCESS_EXITED)` (no death banner) and do NOT `dispatch(SESSION_REMOVE)` (we can either keep or wipe chat state — we render the gate, so chat state is unused; simplest is to leave it, it's freed on Exit).
  - DO drop it from `initializedSessions` / `viewModes` / `permissionModes` / `sessionModels` (inert; also `!sessionInitialized` keeps input disabled as defence-in-depth).
- Ordering note: `session:moved` (step 7) is delivered before `session:destroyed` (step 8) on the same webContents channel, and `session-exit` is additionally async (fires after the PTY actually dies), so `movedSessions` is reliably populated before `destroyedHandler` runs. Confirm this holds for remote clients too (same relative order over the WS).

**4. New `MovedGate` component.**
- File: `desktop/src/renderer/components/MovedGate.tsx` (model on `components/TrustGate.tsx`).
- Props: `{ sessionId, device?, onExit, onResume }`.
- Renders a full-page gate: message "This session was taken over on *<device ?? 'another device'>*." + two buttons (Exit Session / Resume on this device). Use theme tokens; plain words (no status glyphs — user preference).

**5. Render the gate in the content area.**
- File: `App.tsx` ~line 2483 (right where `{trustGateActive && sessionId && <TrustGate …/>}` lives).
- Add: `const movedGate = sessionId ? movedSessions.get(sessionId) : undefined;` and render `<MovedGate/>` **instead of** `ChatView`/`TerminalView` when `movedGate` is set (gate takes precedence over the normal view for that session). Mirror the TrustGate placement so it covers the content area for the current session only.

**6. Wire the two buttons.**
- **Exit Session** → client-side removal (the CC session is already dead, so `session.destroy` would no-op): replicate the normal removal — `setSessions(filter + auto-switch)`, `dispatch(SESSION_REMOVE)`, drop from the aux maps, and `setMovedSessions(delete)`.
- **Resume on this device** → `setMovedSessions(delete id)` + `setSessions(remove old pill)` then call `handleResumeSession(entry.claudeSessionId, entry.projectSlug, entry.projectPath)`. That runs the standard takeover flow (lease query → "active on B?" dialog → takeover → materialize → acquire → resume) and creates a fresh session pill. (Removing the old pill first avoids a duplicate.)
- Retire the now-dead timeline marker: remove the `variant:'moved'` marker append from `chat-reducer.ts` `SESSION_MOVED` (keep the `endTurn`), and clean up `chat-types.ts` (`'moved'` variant), `SystemMarker.tsx` (moved branch), and `desktop/tests/session-moved-reducer.test.ts` accordingly — OR keep `SESSION_MOVED` doing only `endTurn`. Decide during implementation; don't ship a marker that never renders.

### Caveats / edge cases to handle or accept
- **Remote browser / buddy window** also show the gate; "Resume on this device" from a *remote* browser actually resumes on the host — mild semantic oddity. Optionally hide the Resume button when `isRemoteMode()` / non-desktop; otherwise harmless.
- **Android:** shared React UI would show the gate too; resume there goes through Android's own (deferred) path. Acceptable — Android lease/takeover is already `not-implemented-on-mobile` stubbed, so the gate simply won't be triggered on Android in practice (no `session:moved` push originates there).
- **Two windows / subscribers:** `pushMoved` uses `sendForSession` (owner + subscribers), so subscriber windows also keep the pill + gate. Consistent.
- **Verification:** unit-check the gate render + exit removal + resume call in a dev build (`bash scripts/run-dev.sh`); the true two-device takeover (A held, B resumes, A shows gate, A exits or resumes) needs a two-instance/two-device dogfood — same as the rest of the PR.

---

## Areas traced and found SOUND (no action needed — recorded so the reviewer doesn't re-derive)

- **No both-hold / neither-hold window under a live hub.** Requester only `acquire`s after `query` reports `held:false || self` (`takeover.ts:136`), which happens only after the holder's `release` (step 6, before destroy). A late holder `release` after a `force-acquire` is correctly rejected by the DO's `rec.deviceId === deviceId` guard (`room.ts:195`).
- **id discipline consistent everywhere.** Lease ops key on `claudeSessionId`; `handleTakeoverRequest` filters on `held.has(claudeSessionId)`; `pushMoved`/`SESSION_MOVED` use `desktopId` (chat state is keyed by desktop id); reverse-map filters `sessionIdMap` by live `getSession`. No claudeId/desktopId/deviceId cross-wiring; no dropped `from`.
- **Quiescence / data-loss guard correct.** `materializeOne` (space→local) returns on quiescence timeout (never `renameSync` over a growing/open transcript); `flushSessionToSpace` (local→space, grow-only via `mirrorIn`) pushes regardless. `materializeOut` is strictly `space > local` (`transcript-mirror.ts:91`), so the holder's post-destroy `noteSessionEnded → materializeOne` is a no-op after the equal-size flush.
- **Path consistency.** `spaceTranscriptPath(basename(cwd), id)` (`service.ts:97`) === `join(root, rec.transcriptRef)` (`service.ts:132`) — requester pulls exactly what the holder flushed.
- **DO input-gate discipline.** `handleLease` has no stray `await` between `storage.get` and `storage.put` (`room.ts:167–216`); lazy-expiry boundary inclusive (`expiresAt <= now`); lease frames never enter the replay ring (`broadcastLeaseEvent` + `lease-result` are direct `safeSend`s, `room.ts:229`); `reqId` re-validated to string-or-null.
- **lease-client generation guard robust.** Overlapping `acquire`s / in-flight `renewTick`s can't leak a second heartbeat loop (`gen` bump + `held.has` re-checks after each await, `lease-client.ts:149–153`). `failAllPending()` wired into `handleDown` / `setDesired(false)` / `destroy`, so no `request()` hangs across a reconnect.
- **Never-block on all transports.** Absent `leaseWiring` → `{held:false}/{outcome:'error'}`; hub-down `query` → file fallback → free; Android stub → `{ok:false}` (falsy `held`); remote-shim symmetric. `App.tsx` resume gate wraps the whole thing in try/catch and every branch proceeds. No fire-and-forget path throws into Electron main (`void …catch()` everywhere).
- **Bug-1 browse filter correct.** `sessionManager.getSession` returns `undefined` for destroyed/exited sessions (`session-manager.ts:300`, deletes at 158/178/188/219), so the `SESSION_BROWSE` `activeIds` filter genuinely un-hides closed sessions.
- **Non-gated CC-user safety.** `noteSessionEnded`/`materializeOne` short-circuit on `!store` and are grow-only no-ops with sync off; SessionStart acquire gated on `isSyncSpacesEnabled()`; release stays unconditional + idempotent.
- **Minor (not a bug):** `SyncPanel` `YourDevices` Escape-then-blur — React doesn't fire synthetic `onBlur` on unmount, so Escape cancels correctly.

## Suggested commit sequence for the fix
1. `feat(sync): enrich session:moved payload with resume params` (main + preload/useIpc types)
2. `feat(sync): moved-session gate — keep pill, show takeover gate, Exit/Resume` (App.tsx + MovedGate.tsx)
3. `chore(sync): retire the never-rendered moved timeline marker` (reducer/types/SystemMarker/test)
4. `docs(pitfalls): hub-down force is a deliberate never-block degradation` (Finding 2)
Then re-run `env -u YOUCODED_PROFILE -u YOUCODED_PORT_OFFSET npx vitest run && npx tsc --noEmit && npm run build` in `desktop/`.
