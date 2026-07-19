---
status: active
date: 2026-07-18
tags: [native-runtime, sync, leases, takeover]
repos: [youcoded, wecoded-marketplace]
---

# Native-session takeover: the lease outran the data path

> **§6's recommendation was overridden and then largely restored, both on 2026-07-18.** Destin
> first ruled that native sessions must reach full sync parity (promoting Option C into a v1.3
> gate), then re-scoped after a design review found that cross-device native *resume* is blocked
> by the native model binding being device-local by deliberate security design. Current plan:
> **v1.3 ships Option A + the Break-4 fix + a phantom-record fix; Option C moves to v1.3.1**,
> gated on a binding-portability decision. Read the spec for the plan:
> `docs/active/specs/2026-07-18-native-sync-parity-design.md`.
>
> **Three corrections to this document**, established by that review — the rest of §§1–5 and
> §§7–9 stands and remains the authority:
> 1. **§2's claim that native and CC use "the same function" for slugs is wrong.** The native
>    store uses raw `cwdToProjectSlug`; the sync layer and `pushMoved` use `ccProjectSlug`, which
>    uppercases the Windows drive letter first. They diverge on Windows. Spec §4.2.
> 2. **A fifth break exists, not documented here.** PR #176's `sessionIdMap.set` for native
>    defeats the phantom-record gate at `ipc-handlers.ts:2374`, so flagging or noting a live
>    native session seeds a mislabeled `provider:'claude'` record that syncs everywhere and is
>    never pruned. Confirmed on disk. Spec §3.2.
> 3. **§6 decision point 1's "recommend dropping `sessionIdMap.set`" is reversed.** The invariant
>    it was buying ("native is not in the sync system") never held — see correction 2. Spec §3.3.

**Purpose.** Handoff for an implementer deciding how to fix the native-session takeover
regression introduced by youcoded PR #176 (merge `e7b09f60`). Everything below was
verified against `origin/master` at `e7b09f60` by reading the code; claims are marked
VERIFIED (quoted from source) or INFERRED (reasoned, not observed at runtime).

**One-paragraph verdict.** PR #176 correctly noticed that native-provider sessions had no
takeover protection and enrolled them in the lease system. But native conversations do not
participate in the conversation store or space sync **at all**, so every downstream step
the lease implies is a no-op for them. The result is worse than the gap it closed: a
takeover from device B now destroys device A's live native session, leaks its harness, and
transfers nothing, while device B resumes its own unchanged local copy. This is a
**behavior regression**, not merely an unfinished feature — before #176 there was no lease,
so no handoff was ever offered and device A kept running.

---

## 1. Symptom

Preconditions: sync enabled, same account on two devices, a native (non-Claude-Code)
session that exists on both.

1. Device A opens native session `S` and starts a turn. `ipc-handlers.ts:541-551` maps
   `S→S` and acquires the lease.
2. Device B opens the Resume Browser, picks `S`. `App.tsx:2136` sees `held && !self` and
   offers the takeover dialog.
3. Device B takes over. The DO broadcasts to A.
4. **Device A:** the turn keeps streaming (interrupt silently dropped), ~16s pass doing
   nothing useful, the lease is released, the session is destroyed out from under the
   user, and the MovedGate appears. The underlying `HarnessSession` keeps running.
5. **Device B:** resumes its own stale local `~/.youcoded` copy. Nothing was transferred.

Net: A loses a live session and its in-flight turn; B gains nothing it didn't already have.

---

## 2. Background — two runtimes, one sync system

The sync system was built for Claude Code sessions and, with one exception noted below,
assumes every conversation is one.

| Concern | Claude Code (`provider: 'claude'`) | Native (`provider: 'native'`) |
|---|---|---|
| Process | `pty-worker.js` → `claude` binary (`session-manager.ts:142`, `:213`) | in-process `HarnessSession` (`ipc-handlers.ts:491-521`) |
| Transcript on disk | `~/.claude/projects/<slug>/<id>.jsonl` | `~/.youcoded/sessions/<slug>/<id>.jsonl` (`native-home.ts:114-116`) |
| Slug function | `cwdToProjectSlug` | **the same function**, imported deliberately (`session-store.ts:10-12`) |
| Transcript format | raw Anthropic-shaped records, parsed on read | v1 header line + `TranscriptEvent[]`, parsed on write |
| Event source | `TranscriptWatcher` (fs.watch + 2s poll) | `nativeHost.on('transcript-event')` |
| Feeds conversation store | **yes** — `ipc-handlers.ts:1926-1927` | **no** — `ipc-handlers.ts:1976-1981` is the same listener *minus* that call |
| Store record / `transcriptRef` | yes | none, ever |
| Space sync (mirror in/out) | yes | none |
| Interrupt | ESC byte via `sendInput` | `nativeHost.interrupt()` |
| Graceful destroy | `sessionManager.destroySession` | `nativeHost.destroy()` **then** `sessionManager.destroySession` |
| Lease enrolled | yes (since Plan 2b) | **yes (since PR #176)** ← the mismatch |

Two facts make the eventual fix cheaper than it looks:

- **The slug schemes are identical.** Only the root and one path segment differ. A
  provider-parameterized path function is a small change, not a migration.
- **The store schema is already provider-open.** `store-core.ts:18` reads
  `provider: SessionProvider | string; // 'claude' today; string-open for future providers`.
  The *schema* anticipated this; every *call site* hardcodes `'claude'`.

One fact makes it harder: **the two transcript formats are not interchangeable.** A native
file is `header + TranscriptEvent[]`; a CC file is raw API-shaped records. Sync itself only
copies bytes, so this doesn't block syncing — but it does mean a native record must never
be materialized into a CC path, and vice versa. Any fix must keep the two lanes separate
rather than coercing one into the other.

---

## 3. The breaks

All four are on the holder-side teardown in `conversations/takeover.ts:32-86`, which runs
identically for both providers. Steps are numbered as the source comments number them.

### Break 1 — the interrupt is a silent no-op (VERIFIED)

`takeover.ts:60-62`:

```ts
for (const desktopId of liveDesktopIds) {
  try { deps.sessionManager.sendInput(desktopId, '\x1b'); } catch { /* best-effort */ }
}
```

`session-manager.ts:248-252`:

```ts
sendInput(id: string, text: string): boolean {
  const session = this.sessions.get(id);
  if (!session || !session.worker) return false; // native sessions have no PTY
  ...
}
```

It **returns `false`**, so the `try/catch` never fires, and the return value is discarded.
A native turn streams straight through step 3. The correct call —
`nativeHost.interrupt(sessionId)` (`native-session-host.ts:354-362`) — is never reached
from this path; `takeover.ts` has no `nativeHost` dependency at all.

Note `sendInput`'s return contract conflates three cases (unknown id / native / dead
worker), so no caller can distinguish "not applicable" from "failed".

### Break 2 — the flush mirrors nothing (VERIFIED — *roadmap's mechanism is wrong*)

`flushSessionToSpace` (`conversations/service.ts:348-363`) computes
`localJsonlPath(ctx.cwd, id)` = `~/.claude/projects/<slug>/<id>.jsonl`
(`service.ts:126-128`). For a native session that file does not exist.

**Correction to the ROADMAP entry:** it states *"`mirrorIn` throws on the missing source
and the `catch { /* best-effort */ }` swallows it."* That is not what happens.
`transcript-mirror.ts:24-29` (`sizeOf`) catches the `statSync` throw and returns `null`,
and `mirrorIn` then returns early at `:68`:

```ts
const localSize = sizeOf(opts.localJsonlPath);
// Local gone (CC cleanup) — NEVER propagate deletion into the durable copy.
if (localSize === null) return { copied: false };
```

No throw, no catch, no signal — and the `MirrorResult` is discarded by the caller. This
matters for the fix: **adding logging to that `catch` would do nothing**, because control
never reaches it. The observable point is the discarded `{copied:false}`.

A second correction: the roadmap's account implies the flush short-circuits. It does not.
`flushSessionToSpace` bails at `:351` only `if (!ctx)`, and `ctx` **does** exist for native
because `noteSessionStarted(info.id, info.cwd)` is called at `ipc-handlers.ts:542`. So the
holder proceeds through the whole barrier: `waitForQuiescence` on a missing file (statSync
throws → size 0 → quiesces after ~2 probes, `service.ts:328-339`), a no-op `mirrorIn`, then
a genuine `await syncSpacesSyncNowAwaited('personal', 15_000)`. The holder spends up to
~16 seconds pushing an unmodified space before releasing.

### Break 3 — the requester pulls nothing (VERIFIED)

`materializeOne` (`service.ts:295-298`):

```ts
let rec; try { rec = await s.get('claude', id); } catch { return; }
if (!rec?.transcriptRef) return;
```

No record exists. The only writer is `noteTranscriptEvent` (`service.ts:137-191`), which is
fed exclusively by the CC `TranscriptWatcher` wiring at `ipc-handlers.ts:1926-1927`. The
native listener (`ipc-handlers.ts:1976-1981`) is the same code **minus** that line — verified
by direct comparison. Even if it were wired, `noteTranscriptEvent` hardcodes
`provider: 'claude'` (`:148`) and builds `` transcriptRef: `claude/transcripts/...` ``
(`:157-159`), so it would mislabel native sessions and point them at a CC path.

### Break 4 — the harness is orphaned, not destroyed (VERIFIED — **not in the roadmap**)

This is the most severe of the four and was missed in the original write-up.

`takeover.ts:80-83` calls `deps.sessionManager.destroySession(desktopId)` **directly**.
Compare the sanctioned destroy path, `ipc-handlers.ts:589-593`:

```ts
ipcMain.handle(IPC.SESSION_DESTROY, async (_event, sessionId: string) => {
  // Idempotent + no-op for non-native ids: flushes/tears down the native
  // HarnessSession if this id is live, otherwise returns immediately.
  await nativeHost.destroy(sessionId);
  const result = sessionManager.destroySession(sessionId);
```

The takeover path runs only the second half. `nativeHost.destroy` is called from exactly
two places (`ipc-handlers.ts:592` and the app-quit `destroyAll` at `:3339`) — and the
`session-exit` handler (`:2322-2344`) does **not** call it either. So after a takeover the
`HarnessSession` remains in `nativeHost.live` with:

- its `AbortController` never fired — the in-flight turn keeps streaming;
- its `transcript-event` listener still attached, still appending to
  `~/.youcoded/sessions/...`. The `destroy()` doc comment
  (`native-session-host.ts:405-409`) is explicit that this is the mechanism that stops
  appends: *"removing our transcript-event listener is what actually stops new appends
  being enqueued (the listener closes over `entry`, so deleting the map entry alone would
  NOT stop re-enqueue mid-stream)"*;
- pending permission asks never cancelled (`broker.cancelSession` skipped);
- `releaseModel` never called — the loaded model's ref-count never drops, so a local
  model stays resident in VRAM/RAM for the rest of the app run.

**VERIFIED (2026-07-18, upgraded from INFERRED — this is the severity driver).** If the
user later resumes the same native session id on device A within the same app run,
`resume()` (`native-session-host.ts:303-327`) **never consults `this.live` and never calls
`destroy()`**. It constructs a fresh `HarnessSession` and `wire()`s it at `:326`, and
`wire()` does `this.live.set(sessionId, entry)` with a **new** `entry` object (`:235-237`).
The orphan's `transcript-event` listener closes over the *old* `entry` (`:260-265`) and
keeps calling `this.store.append(cwd, event)`. Result: **two live sessions appending to one
native transcript.**

Worse than a plain interleave: `appendChain` serializes appends *within* one entry, so the
two writers are not ordered against each other at all, and `store.dispose()` flushes a
buffered open streaming part — so the corruption can split a single streaming part across
two writers, not merely reorder whole events.

The single-writer assumption is stated as a design invariant at `native-home.ts:5-7`
(*"session files are single-writer by design"*), and it is that invariant that justifies the
absence of a file lock on session JSONL. It is now violable.

**Scoping consequence.** This is not really a takeover bug. `resume()` is unguarded against
an orphan from *any* source — and §3 already notes `session-exit` (`ipc-handlers.ts:2322-2344`)
also skips `nativeHost.destroy`. Fixing only `takeover.ts` leaves the class alive. See
"Break 4 is separable" in §5.

---

## 4. Root cause

Ordering, not logic. Each individual step is correct for the runtime it was written for.
The lease was extended to a session class whose data path does not exist yet, so the
resume gate now advertises a capability the layer beneath it cannot perform.

The deeper cause is that **`provider` is a first-class concept in the session layer and an
absent one in the sync layer.** `SessionProvider` is a real union (`types.ts:35`) checked in
~20 renderer and main sites, but the conversation store reads and writes the literal
`'claude'` in every call (`service.ts:148, 197, 201, 205, 237, 297`;
`reconciler.ts:115, 182`; `session-browser.ts:377`; `ipc-handlers.ts:2480`;
`remote-server.ts:789`). PR #176 crossed that boundary without noticing it was one.

**A useful reframing for whoever picks this up:** without native transcript sync, the
native lease protects nothing. Two devices "resuming the same native session" are resuming
two unrelated local files — there is no shared resource to serialize access to. The lease
only becomes meaningful at the same moment the transcript becomes shared. That is why
Option A below is not merely a stopgap but an *honest* state.

---

## 5. Paths forward

### Option A — gate the native acquire (restore pre-#176 behavior)

Wrap `ipc-handlers.ts:543-551` so the lease is taken only once native transcripts
participate in sync. Keep `sessionIdMap.set` + `noteSessionStarted` (harmless, and
`noteSessionStarted` is what the eventual fix needs anyway) — or drop them too if you want
native fully out of the lease surface.

- **Size:** ~5 lines plus a comment.
- **Result:** `leaseQuery` answers `held:false` for native, the resume gate never offers a
  handoff, device A keeps running. Honest, and matches the actual capability.
- **Cost:** native sessions have no cross-device protection — but as argued in §4, there is
  nothing to protect until sync exists.
- **Leaves open:** Break 4 (see below — fix it regardless).

### Option B — make the teardown native-aware, leave the data path alone

Give `takeover.ts` a `nativeHost` dependency (or an injected
`interrupt(desktopId): boolean` / `destroy(desktopId): Promise<void>` pair, which keeps the
module's fake-collaborator test style intact) and branch on provider for steps 3 and 8.

- **Size:** moderate; `createHolderTakeover`'s deps grow, `ipc-handlers.ts:1892-1898`
  updates, `holder-takeover.test.ts` gains native cases.
- **Result:** the holder shuts down *gracefully* instead of being orphaned.
- **Do not ship this alone.** It makes the destruction tidy without making the handoff
  real — device A still loses the session and device B still gets nothing. Shipped by
  itself it converts a loud bug into a quiet one.

### Option C — native conversations as first-class store citizens (the real fix)

The design pass. Roughly:

1. **Provider parameterization.** Thread a `provider` argument through
   `noteTranscriptEvent`, `materializeOne`/`materializeSweep`, `flushSessionToSpace`,
   `setTitle`/`setFlag`/`setNote`, and the browse/meta readers. Schema is already open
   (`store-core.ts:18`); this is a call-site sweep, and the compiler will find them if you
   make the parameter required.
2. **Provider-aware local path.** `localJsonlPath` becomes provider-aware:
   `~/.claude/projects/<slug>/` vs `~/.youcoded/sessions/<slug>/`. Cheap — the slug function
   is already shared (`session-store.ts:10-12`).
3. **Provider-aware `transcriptRef`.** `native/transcripts/<projectKey>/<id>.jsonl` beside
   the existing `claude/` prefix. Keep the lanes disjoint; never cross-materialize (the
   formats differ, §2).
4. **Route native events into the store.** Add the `noteTranscriptEvent` call to
   `ipc-handlers.ts:1976-1981` with `provider: 'native'`.
5. **Native interrupt + destroy in the teardown** (Option B, now with a data path behind it).
6. **Resume path.** `pushMoved` stamps `ccProjectSlug` (`ipc-handlers.ts:1881`) and the
   MovedGate's "Resume on this device" feeds `handleResumeSession`, which branches on a
   `provider` the moved payload never carries (`App.tsx:2170`) — so a moved native session
   currently resumes down the **CC** branch and would spawn `claude --resume <nativeId>`.
   The payload needs `provider`.
7. **Browse/meta.** `session-browser.ts:427/439` probes a CC path to decide
   `notSyncedYet`; a native record would always read "not synced to this device yet".
   Remote browse (`remote-server.ts:601-606`) omits native rows entirely.

- **Size:** a genuine design pass — spec + plan, not a PR.
- **Result:** this is also exactly the work any *"resume my native conversation on another
  device"* feature needs. It is not throwaway.

### Break 4 is separable — fix it in any option

The orphaned-harness bug is a defect on its own terms: the takeover path is simply missing
the `await nativeHost.destroy(sessionId)` that every other destroy path has. It costs a
dependency and one line, it is worth a pinning test, and it should land regardless of which
option is chosen — including under Option A, where the teardown *shouldn't* run for native
but would still be wrong if it ever did.

---

## 6. Recommendation

### Severity and exposure — an open question the scoping rests on

This document is written for an implementer and does not state how likely a user is to hit
this. The v1.3-vs-later call rests on that, so it should be answered before the scope is
locked.

The trigger requires all of: sync enabled, same account on two devices, a **native**
(non-Claude-Code) session that exists on both, and a takeover. That is a narrow
intersection — but the two failure modes have very different blast radii:

- **The takeover itself** (Breaks 1–3) is bounded: one lost session, one lost turn, on the
  narrow trigger above. Bad, recoverable, and it needs the full two-device setup.
- **The orphaned harness** (Break 4) is not bounded the same way. Two writers on one JSONL
  can corrupt a native transcript *permanently*, and the leaked model ref-count pins a local
  model in VRAM for the rest of the app run. Data loss outranks session loss.

**Unanswered, and needed:** is a two-device native session a real user path today, or is it
effectively only the Android/desktop dogfood configuration? If dogfood-only, Option A alone
comfortably holds until after v1.3. If it is a shipped path, the Break-4 data-corruption
risk — not the takeover regression — is what forces the timeline.

Note this question does **not** change the recommendation below, only its urgency. Option A
is right either way; it is the deadline that moves.

### The call

**For v1.3: Option A + the Break-4 fix.** Option A restores the pre-#176 behavior on a
release that is otherwise gate-complete, and does it by removing a false claim rather than
by adding machinery. The Break-4 fix is independently correct and cheap. Together they are
small enough to review confidently under release pressure.

**After v1.3: Option C, scoped as its own spec.** Fold in Option B as its step 5 rather
than shipping B separately. Note that Option C overlaps the existing ROADMAP item *"Native
(PTY-less) session stuck-detection"* and the broader native/Android parity gap — worth
scoping together.

**Explicitly not recommended:** shipping Option B alone (tidy destruction of a session that
still loses its work), or attempting Option C before v1.3 (it is a design pass, and the
release is otherwise ready).

### Decision points for the implementer

1. Does Option A keep `sessionIdMap.set` + `noteSessionStarted` for native, or drop them?
   Keeping them is harmless and pre-stages Option C; dropping them makes "native is not in
   the sync system" a single enforceable statement. **Recommend dropping** (revised
   2026-07-18 — this section originally recommended keeping).

   The reasoning that flipped it: §4's own reframing is that the honest state is *"native is
   not in the sync system."* Half-enrolling native is precisely how #176 happened — state
   present, capability absent, and the next reader takes the presence as permission. And
   pre-staging buys nothing concrete: Option C threads a `provider` argument through these
   call sites anyway (§5 Option C step 1), so the eventual fix rewrites them rather than
   inheriting them. Dropping trades a speculative head start for an invariant a future
   session can actually enforce.

   Counter-argument, recorded honestly: this is a judgment call, not a correctness one.
   Whoever holds the code may reasonably weigh it the other way.
2. ~~Confirm or refute the two-writer resume scenario.~~ **Resolved 2026-07-18 — confirmed
   by code reading; see §3, Break 4.** `resume()` never checks `this.live` and never calls
   `destroy()`, so the orphan's listener (closed over the old `entry`) keeps appending
   alongside the new session. The Break-4 fix is **urgent, not merely correct**, and its
   scope should include `resume()` itself, not only the takeover caller.
3. Under Option C: does a native conversation sync its **transcript**, or only its
   **record** (title/flags/tags, so it's visible cross-device but resumable only where it
   lives)? The record-only variant is much cheaper and may be the right v1 — it makes the
   Resume Browser honest without moving bytes.
4. Under Option C: whether `provider` becomes a required parameter (compiler finds every
   site, bigger diff) or defaults to `'claude'` (smaller diff, silent misses).
   **Recommend required.**

---

## 7. Test gaps

- **No test covers native lease registration.** `grep -rn "leaseWiring" tests/` → zero hits.
  `ipc-handlers.ts:541-551` shipped entirely unguarded, at any level.
- **The suite does not merely miss this — it certifies it.** `holder-takeover.test.ts` passes
  on a native session that was never interrupted, because its fake `sendInput` records the
  call and cannot express "returns false and did nothing" (see below). A green run is
  currently evidence of nothing. Whichever option ships, the provider-aware fake must land
  with it, or the next change re-opens the same hole against a green suite.
- Neither lease *registration* path (CC or native) is tested — only the pieces they call.
  Nothing constructs `registerIpcHandlers`.
- `holder-takeover.test.ts` pins the teardown **sequence** against fully fake
  collaborators. Its fake `sendInput` records the call and cannot express "returns false
  and does nothing", so it passes on a native session that was never interrupted. Any fix
  needs a native case with a provider-aware fake.
- Nothing exercises `flushSessionToSpace` or `materializeSweep` against a **missing local
  source file** (as distinct from a missing session).
- Nothing asserts the native slug matches CC's — the coupling at `session-store.ts:12` is
  enforced only by the shared import.
- The three coupled handoff constants (`QUIESCE_MAX_MS` 6s + `HANDOFF_SYNC_TIMEOUT_MS` 15s
  < `MAX_MS` 25s) are documented in comments at all three sites but pinned by no test.
  Cheap arithmetic pin, worth adding while in here.

Current state of the related suites — all green, so none of this is caught today:

```
npx vitest run tests/holder-takeover.test.ts tests/requester-takeover.test.ts \
  tests/lease-client.test.ts tests/conversations-service.test.ts tests/sync-spaces-service.test.ts
→ 5 files, 92 tests, 0 failures
```

---

## 8. Load-bearing — do not undo while fixing this

PR #176's primary fixes are correct and independent of the native gap:

1. **`syncSpacesSyncNowAwaited` at both barrier sites** (`service.ts:357`, `main.ts:715`).
   The old `syncSpacesSyncNow` was `void engine.syncSpace(s)` — it resolved before git ran,
   so the "mirror-before-release" barrier did not exist. Reverting either site silently
   restores the lost-turns bug.
2. **The three coupled constants** (§7). Lowering `MAX_MS` back toward 10s re-introduces the
   force dialog on healthy holders.
3. **Both `'takeover-request'` and `'taken'` routed** at `main.ts:1621`. The DO broadcasts
   `taken` on force-acquire; dropping it reverts the fix entirely.
4. **`held.has()` as the victim/attacker discriminator** (`lease-client.ts:305`). The `taken`
   frame carries no `deviceId`, so any refactor keying off a payload field would tear down
   the wrong device. Pinned at `lease-client.test.ts:166`.
5. **The per-holder loop** in `takeover.ts:60` and `:80` — a create+resume pair can map two
   desktop ids to one claude id; pick-first left a silent second PTY writer. Flush and
   release stay outside the loop (claude-id-keyed, once each).
6. **`pushMoved` before `destroySession`**, each independently try/caught.
7. **`sendToAllMainWindows`** for `SESSION_MOVED` (`ipc-handlers.ts:1883`) —
   `sendForSession`'s ownerless fallback only reaches the primary window.

Worker side (`wecoded-marketplace/worker/src/sync/room.ts`), both predating #176 and both
still correct: `release` guards on `rec.deviceId === deviceId` (`:231`), and
`broadcastLeaseEvent` excludes the sender (`:268`) so a forcing device never self-tears-down.

*(Aside: the ROADMAP entry credits these two worker guards to PR #176's companion change.
They were authored in the original Plan 2b lease commit `465fb3ce` and are untouched since;
the recent `room.ts` commits are PR #45 per-device recency and PR #43 renew-revives-a-lapsed-lease.
No worker change accompanied #176.)*

---

## 9. File index

| Concern | Location |
|---|---|
| Native lease registration (the regression) | `desktop/src/main/ipc-handlers.ts:529-552` |
| Holder teardown | `desktop/src/main/conversations/takeover.ts:32-86` |
| Requester takeover | `desktop/src/main/conversations/takeover.ts:120-173` |
| `sendInput` native no-op | `desktop/src/main/session-manager.ts:248-252` |
| `flushSessionToSpace` | `desktop/src/main/conversations/service.ts:348-363` |
| `localJsonlPath` / `spaceTranscriptPath` | `desktop/src/main/conversations/service.ts:119-128` |
| `materializeOne` | `desktop/src/main/conversations/service.ts:295-322` |
| `noteTranscriptEvent` (hardcoded provider) | `desktop/src/main/conversations/service.ts:137-191` |
| `mirrorIn` silent missing-source return | `desktop/src/main/conversations/transcript-mirror.ts:24-29`, `:65-79` |
| CC event → store wiring | `desktop/src/main/ipc-handlers.ts:1917-1928` |
| Native event wiring (missing the store call) | `desktop/src/main/ipc-handlers.ts:1974-1981` |
| `nativeHost.destroy` (never called on takeover) | `desktop/src/main/harness/native-session-host.ts:402-434` |
| `nativeHost.interrupt` (never called on takeover) | `desktop/src/main/harness/native-session-host.ts:354-362` |
| Native transcript path | `desktop/src/main/native-home.ts:114-116` |
| Shared slug function | `desktop/src/main/transcript-watcher.ts:24-30` |
| Provider union | `desktop/src/shared/types.ts:35` |
| Store record schema (provider-open) | `desktop/src/main/conversations/store-core.ts:15-29` |
| DO lease table | `wecoded-marketplace/worker/src/sync/room.ts:174-260` |
