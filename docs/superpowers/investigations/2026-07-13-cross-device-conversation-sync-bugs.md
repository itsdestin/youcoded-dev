# Cross-Device Conversation Sync — Two Bugs From The Two-Device Dogfood

> **Status:** Investigation complete — **BOTH BUGS FIXED as of Plan 2b (PR open on `feat/sync-leases`, 2026-07-14).**
> - **Part 1 (startup catch-up `materializeSweep()`) — DONE:** youcoded PR **#120** (`fix/conversation-startup-materialize-catchup`). A peer's already-synced continuation is applied on next launch.
> - **Part 2 (release the live guard + materialize on session-close, without a restart) — SHIPPED in Plan 2b** (PR open on `feat/sync-leases`; not yet merged — no merge SHA claimed here). `noteSessionEnded` releases the guard on `session-exit` and runs a targeted, **quiescence-gated** `materializeOne` (renamed from the sketch's `materializeEndedSession`): it polls the local transcript until size-stable (750ms probe, max 6s) and **SKIPS on timeout** — because `session-exit` fires before the PTY dies, materializing over a still-flushing transcript would `renameSync` over CC's open inode and lose the final turn (POSIX inode-detach; a real data-loss hazard the review caught). See `2026-07-10-phase2-conversation-sync-design.md` §3 "Materialize-on-release" and PITFALLS → Sync Spaces → "Session leases & takeover".
> - **Bug 1 (closed session lingered in the resume-browser active-set until restart) — FIXED in Plan 2b:** `SESSION_BROWSE` now filters `sessionIdMap.entries()` to mappings whose desktop session still exists (`sessionManager.getSession` returns undefined for destroyed sessions) — the map is a CACHE, not truth, so a stale/duplicate entry no longer hides a closed session until restart. Not addressed by #120; shipped on `feat/sync-leases`.
> **Date:** 2026-07-13
> **Author:** dogfood-debugging session (GalaxyBook = device A / Windows; destinsZ13 = device B / Linux)
> **Scope:** Phase 2a Conversation Store (`youcoded/desktop/src/main/conversations/`) + the Resume Browser. Related: PITFALLS → "Conversation Store (Phase 2a)"; spec `docs/superpowers/specs/2026-07-10-phase2-conversation-sync-design.md`; tracker `docs/superpowers/2026-07-10-sync-completion-handoff.md`.

---

## TL;DR

A conversation created on device A, closed, continued on device B, and returned to on device A does **not** update on device A, and can **vanish from device A's resume browser**. Investigation found **two independent, confirmed code bugs** (both present in the shipping code, not dev-instance quirks):

1. **Closing a session doesn't release it from the app's in-memory active-set.** The Resume Browser excludes "active" sessions; a session that wasn't released stays hidden until an app restart. **Confirmed:** restarting the dev app made the session reappear.
2. **The materialize sweep (space→local transcript copy) is only triggered by a fresh `synced + personal + updated` event — there is no catch-up sweep on startup or on session-end.** So another device's version, once it's sitting in the local sync *space*, is **never written into the local Claude Code transcript** the app actually resumes from. **Confirmed:** even after the restart cleared the guard, the local transcript stayed at the stale size because no sweep runs.

No data is lost in either case — everything is on disk; it just isn't being surfaced/applied.

The proposed fix (two small, safe parts) is in [§Proposed fix](#proposed-fix). It fixes the **sequential handoff** case. The **truly concurrent** case (same conversation open on both devices at once → git conflict copies) is out of scope and needs leases (Plan 2b).

---

## Reproduction (what the user did)

Sequential handoff, **not** concurrent (the user was explicit both devices were never open on the same session at once):

1. Device A (GalaxyBook): create session `SyncTesting4pm` in project `CookinOnLowHeat` (`~/YouCoded/Projects/CookinOnLowHeat`). Close it.
2. It appears on device B (destinsZ13). Continue the conversation there. Close it.
3. Back on device A: the conversation **does not reflect device B's new turns**, and **is absent from device A's resume browser**.

Session id: `4a774005-0179-4766-b5e3-99dfde25d801`. Project always lived at `~/YouCoded/Projects/CookinOnLowHeat` on both devices (it did **not** move; ignore any earlier "project moved" theory — there is an unrelated legacy `~/CookinOnLowHeat` slug from months ago).

---

## Evidence (on-disk facts + reproduction)

All paths on device A (GalaxyBook, Windows). `~` = `C:\Users\desti`.

**Store record** — `~/YouCoded/Personal/Conversations/claude/4a774005-….json`:
```json
{
  "schema": 1, "id": "4a774005-…", "provider": "claude",
  "projectName": "CookinOnLowHeat",
  "originalPath": "/home/destin/YouCoded/Projects/CookinOnLowHeat",   // device B (Linux) path — B was last writer
  "title": "SyncTesting4pm",
  "lastActive": "2026-07-13T23:26:07Z", "device": "destinsZ13",
  "flags": {},                                                          // NOT flagged complete
  "transcriptRef": "claude/transcripts/CookinOnLowHeat/4a774005-….jsonl"
}
```

**The two transcript copies on device A:**
| Copy | Path | Size |
|---|---|---|
| Sync **space** (device B's continuation) | `~/YouCoded/Personal/Conversations/claude/transcripts/CookinOnLowHeat/4a774005-….jsonl` | **103,844 b** |
| Local **CC transcript** (what resume reads) | `~/.claude/projects/C--Users-desti-YouCoded-Projects-CookinOnLowHeat/4a774005-….jsonl` | **73,878 b** (stale, device A's pre-handoff version) |

- **No conflict copy exists** for `4a774005` anywhere — this is a clean fast-forward case (device B's transcript is a superset of device A's), NOT a git conflict. (Contrast: sibling session `3c2f8b3c` *does* have a `…(from destinsZ13, 2026-07-13).jsonl` conflict copy — that one *was* edited concurrently. Different problem.)
- **Backend replication:** re-implemented `listPastSessions`'s scan (legacy slug scan + store union) against the real `~/.claude/projects` + store, with an **empty active-set**. Result **includes** `4a774005` (title "SyncTesting4pm"). ⇒ nothing about the data/record hides it; the exclusion must be the per-app active-set.
- **Session markers** `~/.claude/.context-4a774005` and `.session-stats-4a774005.json` are **deleted** (the `session-exit` handler deletes these), so a `session-exit` *did* fire at some point. `.gitbranch-4a774005` lingers (that one isn't cleaned by exit — expected).
- **Currently-live sessions** (by `.session-stats-*.json`): only the debugging session + one other youcoded-dev session. `4a774005` is **not** live now.
- **Restart test:** after relaunching the dev app, the user confirmed **`SyncTesting4pm` reappeared in the resume browser** — but the local transcript **stayed 73,878 b** (watched for ~90 s; it did not grow to 103,844 b).
- The built app *does* show `4a774005` (its own in-memory active-set never held it) but resumes the **stale 73,878 b** version — same un-updated local file.

---

## Bug 1 — closing a session doesn't release it from the resume-browser active-set

**Symptom:** session absent from device A's resume browser until an app restart.

**Mechanism:** `listPastSessions(activeSessionIds)` excludes any session in `activeSessionIds` — in **both** the legacy slug scan and the store union:
- `session-browser.ts:284` — `if (activeSessionIds?.has(sessionId)) return null;`
- `session-browser.ts:367` — `if (activeSessionIds?.has(rec.id)) continue;`

`activeSessionIds` is built in the IPC handler from `sessionIdMap.values()`:
- `ipc-handlers.ts:1240-1246` — `SESSION_BROWSE` collects `sessionIdMap.values()` → `listPastSessions(activeIds)`.

`sessionIdMap` (desktop-id → claude-id) is deleted on `session-exit`:
- `ipc-handlers.ts:2002-2016` — `session-exit` handler → `sessionIdMap.delete(sessionId)` (line 2010).

**Confirmed by the restart test** (restart clears the in-memory map → session reappears). The exact reason the map wasn't cleared *on close* (vs. only on restart) is not 100% pinned — candidates:
- `session-exit` didn't fire on close (CC process lingered), so `sessionIdMap.delete` never ran; **or**
- two desktop-ids mapped to the same claude-id this run (create + resume) and only one was cleaned, leaving the claude-id still in `sessionIdMap.values()`.

Either way, the *behavioral* bug is real: **a closed session can remain in the active-set until restart**, hiding it from the resume browser.

> **Reviewer TODO:** verify the close → `session.destroy` → `sessionManager.destroySession` → `emit('session-exit')` → `sessionIdMap.delete` path fires reliably on a normal close, and whether a resumed session can leave a stale second mapping. Both close paths call `window.claude.session.destroy(id)` (`App.tsx:2334` immediate-suppress, `App.tsx:2652` close-prompt confirm).

---

## Bug 2 — the back-sync never materializes (the more serious one)

**Symptom:** device B's continuation reaches device A's sync *space* (103,844 b confirmed) but is never written into device A's local CC transcript (stays 73,878 b) — so no app resumes the updated version.

**Mechanism:** the space→local copy (`materializeOut`) is **correct** but **never called** for an already-present transcript.

- `materializeOut` (`transcript-mirror.ts:84-94`) copies when `spaceSize > localSize` (or local missing); never shrinks/deletes. For `4a774005`: 103,844 > 73,878 ⇒ it *would* copy. So the copy primitive is fine.
- `materializeSweep()` (`conversations/service.ts:196-233`) iterates store records and calls `materializeOut` — but **skips live sessions** via `if (sessions.has(rec.id)) continue;` (line 223), where `sessions` is the conversation-store's own in-memory guard map.
- **The only trigger** for `materializeSweep()` is a fresh Personal-space update event:
  - `conversations/service.ts:59-65` — `onSyncSpacesEvent(... if e.type==='synced' && e.spaceId==='personal' && e.updated) void materializeSweep();`
- **`startConversationStore` runs NO catch-up sweep** (`conversations/service.ts:40-73`): it subscribes to events and kicks `runReconcile()` (which does **local→space** `mirrorIn`, not space→local materialize). There is no `materializeSweep()` on startup.

**Why the user's case is permanently stuck:**
1. While `4a774005` was open on device A, device B's version synced into device A's Personal space. A `synced+personal+updated` event fired → `materializeSweep()` ran → but **skipped `4a774005`** because `sessions.has('4a774005')` was true (the live guard).
2. The session was closed. Nothing removes it from the conversation-store `sessions` guard on close — it's only cleared on restart (`sessions.clear()` in `stopConversationStore`, `service.ts:80`). And nothing re-triggers a sweep on session-end. (The code comment at `service.ts:218-222` explicitly defers this: *"nothing removes entries from `sessions` on session exit … a `noteSessionEnded` refinement lands with leases in 2b."*)
3. On restart, the guard is cleared — **but there's no startup sweep**, and device A's Personal space already has device B's version (nothing *new* to pull → no `updated` event → no sweep trigger). So `materializeOut` is never called and the local stays stale.

**Net:** a transcript that lands in the space while its session is guarded (or before the store is watching) is **never materialized** — there is no catch-up path. `mirrorIn` keeps the space current *from the local side*, but the *reverse* (space→local for another device's version) has a hole.

> **Open thread (low priority):** the local transcript's mtime advanced (16:57, then 17:22 after restart) while its **size stayed 73,878 b**. Something touches the local file without materializing the space version — likely the legacy `sync-service.ts` conversation aggregation (frozen until Plan 2c) or a reconcile pass touching mtime. Not believed to be causal for Bug 2, but the reviewer should confirm the legacy sync path isn't *overwriting* a would-be-materialized file back to the stale version.

---

## Proposed fix

Two small, additive changes in `youcoded/desktop/src/main/`. Both are safe: `materializeOut` only ever **grows** a local file (never shrinks/deletes), and the sequential-handoff transcript is a clean superset.

### Part 1 — catch-up `materializeSweep()` on startup — ✅ SHIPPED (youcoded#120)
In `conversations/service.ts` `startConversationStore` (~line 70, alongside the detached `runReconcile()`), kick a `materializeSweep()` once after start so any transcript already in the space materializes into the local CC dir on launch:

```ts
// Catch-up: a transcript that landed in the space while its session was guarded
// (or before we were watching) is otherwise never materialized — the sweep is
// only event-triggered on fresh Personal updates. Run one on startup so a peer's
// version is applied on next launch. Detached; materializeSweep never throws.
void materializeSweep();
```
Effect for the user: the next dev restart would pull device B's 103,844 b version into local.

### Part 2 — release the guard + re-sweep on session end (`noteSessionEnded`) — ⏸ DEFERRED TO PLAN 2b
So the peer's version applies **without needing a restart**, and (in tandem with the Bug-1 fix) the session reappears in the resume browser immediately.

> **This is now owned by Plan 2b** (`2026-07-10-phase2-conversation-sync-design.md` §3 "Materialize-on-release"). The sketch below is the *stopgap* shape; 2b implements the **lease-aware** version, which also addresses three refinements the stopgap misses: (a) materialize should be **targeted to the ended session**, not a full store scan (perf); (b) `session-exit` fires **synchronously before** the PTY process actually dies, so materializing then can clobber a still-flushing transcript — gate on the process being gone / lease released; (c) the dev + built app share `~/.claude` with **separate** guard maps, so cross-instance safety needs leases too. Do NOT implement the stopgap standalone — it re-opens the concurrent-writer hazard the 2a guard exists to prevent.

1. Add to `conversations/service.ts`:
```ts
export function noteSessionEnded(claudeSessionId: string): void {
  sessions.delete(claudeSessionId);   // release the materialize guard
  void materializeSweep();            // pull any peer version now that it's safe
}
```
2. Call it from the `session-exit` handler in `ipc-handlers.ts:2002-2016`, resolving the claude id *before* the `sessionIdMap.delete`:
```ts
sessionManager.on('session-exit', (sessionId: string) => {
  const claudeId = sessionIdMap.get(sessionId);
  // …existing marker cleanup…
  if (claudeId) noteSessionEnded(claudeId);   // NEW: release conv-store guard + sweep
  sessionIdMap.delete(sessionId);
  // …
});
```
Safety: after `session-exit` the CC process has exited, so materializing over the local transcript can't race an active writer.

### Bug 1 follow-up
The Bug-1 fix depends on `session-exit` reliably clearing `sessionIdMap` on close. If review finds it does *not* fire reliably (or a resumed session leaves a stale second mapping), add the corresponding cleanup so the resume browser reflects a closed session without a restart. (If it *does* fire reliably, Part 1+2 plus a normal close already resolve the observed symptom, since the reappearance only needed the map cleared — which restart did.)

---

## What this does NOT fix

- **Concurrent editing of the same conversation on both devices at once.** That produces git **conflict copies** (`…(from <device>, <date>).jsonl`) because two divergent transcripts merge — see session `3c2f8b3c`. Claude Code's resume only reads the canonical file, so one device's turns get stranded in the copy. The designed fix is **leases/takeover (Plan 2b)**: one device holds a lease so the transcript stays a single linear fast-forward. Out of scope here.
- **Legacy `sync-service.ts` interactions** (home-slug symlink aggregation, etc.) — frozen until Plan 2c; only flagged as an open thread above.

---

## Key file references

| Concern | File / line |
|---|---|
| Resume list + active-set exclusion | `desktop/src/main/session-browser.ts:245` (`listPastSessions`), `:284`, `:367` |
| `activeIds` source | `desktop/src/main/ipc-handlers.ts:1238-1246` (`SESSION_BROWSE`) |
| `sessionIdMap` delete on exit | `desktop/src/main/ipc-handlers.ts:2002-2016` |
| Close → destroy paths | `desktop/src/renderer/App.tsx:2334`, `:2652`; `session-manager.ts:215` (`destroySession`) |
| Materialize sweep + live guard | `desktop/src/main/conversations/service.ts:196-233` (guard at `:223`) |
| Sweep trigger (event only) | `desktop/src/main/conversations/service.ts:59-65` |
| Startup (no catch-up sweep) | `desktop/src/main/conversations/service.ts:40-73` |
| `noteSessionStarted` (no `…Ended`) | `desktop/src/main/conversations/service.ts:84` |
| `materializeOut` / `mirrorIn` | `desktop/src/main/conversations/transcript-mirror.ts:65` / `:84` |
| Store record | `~/YouCoded/Personal/Conversations/claude/<id>.json` |
| Space transcript | `~/YouCoded/Personal/Conversations/claude/transcripts/<projectKey>/<id>.jsonl` |
| Local CC transcript | `~/.claude/projects/<slug>/<id>.jsonl` |
