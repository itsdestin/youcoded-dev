---
date: 2026-09-21
status: active
type: investigation
topic: Audit of conversation sync/lease handoff — device A live → device B resumes; warnings, file safety, transparency
---

# Conversation lease & handoff audit (cross-device resume)

**Request.** Destin asked for a thorough investigation of the sync/lease logic for conversations: find errors in the handoff between a live app holding a conversation on device 1 and a different device resuming it while live; ensure there is always a proper warning and handoff; ensure files are correctly/safely synced and reconciled; and make the behaviour transparent in the Backup & Sync (i) popup.

**Scope.** `youcoded/desktop` (main + renderer), the SyncGroupRoom worker (`wecoded-marketplace/worker/src/sync/room.ts`), and the Backup & Sync settings surfaces. No code changed — this is a findings report.

**Verification note (2026-09-21, reconciled).** This report was independently re-reviewed by a second session whose assessment was then mechanically verified by a fresh-eyes reviewer against the code (every H/M claim CONFIRMED with file:line evidence). Where the assessment corrected this report — the conclusion was too optimistic — this revision adopts the correction. Test runs: 136/136 across the focused lease/takeover/mirror suites (second session) and 272 across the combined lease/takeover/sync-transport/conversation-store suites (first pass). Both green — and neither covers the races below.

---

## Verdict (reconciled)

**The ordinary responsive-holder flow has sensible ordering and strong local file protections.** It avoids overwriting live transcripts and preserves competing versions as conflict copies. **However, lease ownership is not an atomic admission gate, and several reachable paths — lease expiry, free-to-acquire races, forced takeover, failed final flush, hub outage, and Android-local use — can still produce concurrent writers or an initially stale resume.** The system favors availability and recovery over a strict single-writer guarantee. The "no file loss" and "requester pulls the final turn" claims in the first version of this report are too strong as stated; see H2/H3 for the qualification.

---

## How the handoff works today (the good parts)

1. **Resume gate runs before any session is created.** `handleResumeSession` (App.tsx) → `runLeaseTakeoverGate` (`resume-lease-gate.ts`): queries the hub (`leaseQuery` → worker `op:get` → DO lease table). `held && !self` → user is asked (three honest phases: `confirm` / `force` / `undeliverable`, copy pinned verbatim in `takeover-dialog-copy.ts`). Decline → resume aborts.
2. **Requester flow** (`createRequesterTakeover`, `takeover.ts`): `takeover` (DO relays `takeover-request` to the holder), poll up to `REQUESTER_MAX_MS` 25s: on free → `syncNow` (awaited, 15s cap) → `materializeOne` (pull peer's final turn, `shouldCommit` re-checks liveness) → `acquire`. On timeout → user is asked again (`force`), then `forceAcquire` → sync → materialize. Never blocks: any error degrades to proceed-with-warning.
3. **Holder teardown** (`createHolderTakeover`): reverse-map claude → live desktop ids; **interrupt/quiesce EVERY holder** (ESC byte for CC, `quiesceNative` for native) → `flushSessionToSpace` (waits for quiescence, mirrors, genuinely AWAITS the personal push, 15s cap) → **release the lease** → `pushMoved` → `destroyNative`/`destroySession`. Mirror-before-release is load-bearing so the requester's pull finds the final turn.
4. **Identity discipline.** Leases key on per-INSTALL `deviceId` (`device-identity.ts`), never the hostname label; `self` is deviceId-derived. Two installs sharing a hostname (dev + built app) serialize correctly (regression-pinned in `requester-takeover.test.ts`).
5. **File safety.** `materializeSweep`/`materializeOne` refuse to touch a live session's transcript (in-memory `sessions` guard + `shouldCommit` re-check + quiescence wait). Mirror-in is grow-only and shrink-guarded. Convergent conflicts → remote wins canonical, local becomes `name (from <device>, <date>)` copy, bytes moved as Buffers. `release` is race-safe (releaseSeq + reserved file-op slots).

---

## Original findings (F1–F7) — retained, with corrections

### F1 / F4 — Hub down = no warning at all (cross-device silent dual-writer) — open, on roadmap

**Severity: High (data-integrity in a specific window).** RETAINED: `leaseQuery` returns `{held:false, source:'none'}` and the gate checks only `held` (lease-client.ts:469–503; resume-lease-gate.ts:45–46), so a hub outage produces no warning. Both the second session and the reviewer confirmed the mechanics; the roadmap item stands (`docs/roadmap/sync.md:40-54`). Never-block is a deliberate choice; never-warn is the oversight. Fix direction unchanged: surface a non-blocking "couldn't check your other devices" warning on a hub-down query.

### F2 — Hub-down force leaves holder live — correct, scope corrected

**Severity: High (same window as F1).** RETAINED with the second session's scope correction: the dual-writer/rewriting-lease-file loop is specific to the SAME-machine case (dev install + built app sharing `~/YouCoded`). On different machines the lease files live in per-install `userData` (main.ts:1029–1046), so there is no shared file for either side to rewrite — but the force still reaches nobody on a hub outage, so the holder still never interrupts and the moved pill never shows. The same-machine symptom is confirmed (2026-09-01 investigation); the cross-machine hub-down force is F1's window.

### F3 — `(i)` popup in Backup & Sync doesn't mention concurrent-open behaviour, handoff, or lease mechanics

**Severity: Medium (transparency — directly requested).** RETAINED as assessed. `SYNC_EXPLAINER` (SyncPanel.tsx:34–83) says nothing about leases, handoffs, concurrent conversations, or the degraded state; the only surfaces that do are the takeover dialog's AnchorTip and the conflict notice. The report's drafted section copy stands; the mere fact that protection may be *unavailable* (hub down, Android) should be part of the copy.

### F5 — Same-install multi-window self-skip — kept, narrowed

**Severity: Low-Medium.** The second session and reviewer confirmed the gate skips any lease held by the same install (`q.self`), not by the same window (resume-lease-gate.ts:45–47). This is properly subsumed by H4 (any same-window-or-other-install race from an unheld state can produce two writers); F5 as a standalone item is a subset.

### F6 — Over-50 MB conversations never reach peers — correct, already tracked

**Severity: Medium (availability).** RETAINED. Roadmap sync.md:4-7; the second session additionally notes the related merge-failure risk already on the roadmap (sync.md:18-21).

### F7 — Copy/UX asymmetries — correct

**Severity: Low.** RETAINED, with the second session's emphasis: the *first* confirmation dialog (`confirm` phase) omits the separate-copy consequence; the AnchorTip covers it only on hover. MovedGate's CC-specific line and the vanishing conflict notice stand.

---

## Assessment findings adopted (H1–H6, M1, M2) — all mechanically confirmed

### H1 — A healthy hub still has a dual-writer race after a "free" result — High

**The biggest omission of the first version.** After the requester observes the lease free, it does `syncNow()` → `materializeOne()` → **`acquire()` last** (takeover.ts:214–222). Another device can acquire in between. Worse, the requester ignores a denied acquire (`.catch(() => {})` at 221 and the unconditional `return { outcome: 'acquired' }` at 222) and opens the session anyway. The normal post-start acquires are fire-and-forget and only log a denial (native: ipc-handlers.ts:1007–1014; CC: ipc-handlers.ts:3959–3966). Effect: a reachable, working hub can still permit two writers — this is NOT the F1/F2 outage case. Fix: claim the lease before the requester opens/writes, or use an atomic server-side transfer/claim.

### H2 — "Mirror before release" does not guarantee the final turn arrives — Medium-high

The holder awaits its flush but swallows a failure (takeover.ts:100–106, `catch { console.warn }`) and then releases, pushes moved, and destroys anyway (108–126). The holder-takeover test pins this continuation behavior (holder-takeover.test.ts:200–215). The ordering is only safe when the flush succeeds; if push/mirror fails, the requester may materialize an earlier copy and the holder is terminated. NOT permanent byte loss — the holder's local transcript survives on disk (destroySession kills the process but removes no files; the reconciler mirrors it later) — so "no file loss" in ordering remains *qualitatively* true about the transcript, but "requester pulls the final turn" is too strong. The later transcript eventually reconciles as conflict-copy content.

### H3 — Forced takeover races the holder's final flush even with a healthy hub — Medium-high

Force does `forceAcquire` first, then syncs/materializes (takeover.ts:230–238); the old holder only begins interrupt→flush after receiving the hub's `taken` event (main.ts:2321–2324; lease-client.ts:513–524). The requester can therefore pull before the holder's final flush exists. main.ts:2316–2320 documents this "KNOWN RESIDUAL WINDOW" verbatim. Result: stale-first-open; the holder's later flush can arrive and reconcile, but the new owner starts without the tail. Fix direction: an acknowledgement/transfer protocol, or an explicit "final changes are still arriving" state with post-flush re-materialization.

### H4 — Two simultaneous normal resumes can both pass the gate before either obtains a lease — High

The no-holder path is a query, not an atomic check-and-claim (resume-lease-gate.ts:45–46). Two resume actions — two windows, a double action, app and buddy flow, another UI route — can both see "free", both create sessions (App.tsx:2927–2954), and only afterward attempt acquisition (native after create: ipc-handlers.ts:1007–1014; CC after the SessionStart event: ipc-handlers.ts:3940–3966). The loser stays open and writing; its denied acquire is merely logged. The DO does atomically deny the later acquire (room.ts:200–206) — but only after the losing local session has already started. This overlaps F5 but is broader, applying across installs/devices racing from an unheld state.

### H5 — Lease expiry creates a healthy-hub split-brain window — High (nuanced)

If a holder sleeps or is throttled past the 300 s TTL, the hub lazily clears the record (room.ts:193–194); another device can then acquire normally with no takeover or moved signal (room.ts:200–205). The old holder only notices on its next renew (lease-client.ts:323–365), where it tears down if another holder now owns the lease. Distinguish from F1/F2: the hub is HEALTHY here, but the old process may still be live and locally writing when the new holder begins. The reviewer's nuance: the worker's renew re-grants an expired lease when still free, so sleeping past TTL alone does not force a takeover — the split-brain needs a second device to acquire in the expired-but-unrenewed window. Fix direction: holder fencing/epoch checks rather than relying only on a later renew.

### H6 — Android is outside the system — Medium (prominent platform gap)

The report framed this as a cross-device mechanism but scoped only desktop + worker. Android explicitly stubs lease/takeover/force as desktop-only (SessionService.kt:4311–4318); the shared renderer's gate catches the reject and proceeds (resume-lease-gate.ts:44–67); and Android's `session:create` drops `resumeSessionId` (SessionService.kt:935–954), so its local "resume" does not actually resume the selected conversation. An Android-local session has no lease protection, handoff, warning, or SyncHub participation. A paired phone controlling a desktop remotely is different: the desktop remains the holder and its remote server supports the lease RPCs (remote-server.ts:3410–3450). This should be a prominent limitation, not merely a Phase 3 footnote, in UI/copy and any docs describing "cross-device".

### M1 — The "timeout" dialog overstates what is known — Low-medium transparency

The worker sets `ok = true` before the best-effort broadcast (room.ts:238–242) and `safeSend` swallows closed sockets (room.ts:114–116); there is no holder acknowledgement. So the `force` copy ("was asked … but didn't answer", takeover-dialog-copy.ts:30–34) is technically stronger than the code can establish: "timeout" truthfully means "we could not confirm that the other device completed a handoff", not necessarily "that device was asked and did not answer". Keep `undeliverable` distinct (the holder was never asked); reword `force` to "couldn't confirm the handoff".

### M2 — Lease identity is not authenticated per connection — Medium (in-account security boundary)

The worker accepts the `deviceId` supplied in the lease message body as authority for acquire/renew/release (room.ts:177–183 destructures it from `data`; 200–205, 219–222, 224–235, 243–249 all compare/store the body value). The connection-pinned `att.deviceId` is used only for the human-readable label and sync-recency bookkeeping (room.ts:157–160, 265–270); there is **no `data.deviceId === att.deviceId` check**. An authenticated same-account client that knows another holder's deviceId can therefore impersonate that install in lease operations. Primarily an in-account integrity/security boundary, not an accidental-sync failure, but it should be assessed and tested. Fix: bind lease authority to the authenticated connection identity.

---

## What was checked and is genuinely clean (the report's earlier claims, corrected)

- **No hard-block regression**: the gate always proceeds on error; `requester.force` returns `{ok:true}` optimistically on hub-down (documented as deliberate).
- **No mis-attribution between `timeout` and `undeliverable`**: the distinction is honest as far as it goes; M1 narrows what `timeout` claims.
- **No file loss in the flush/materialize ordering** — *corrected*: the ordering does not delete the holder's local transcript (destroySession removes no files; the reconciler mirrors it later), so persistent byte loss is not demonstrated; but a failed flush means the *requester can start stale*, which the first version's wording implied could not happen (H2).
- **No lease-file resurrection races**: releaseSeq + reserved file-op slots + destroyed-flag + single-per-session chain all pinned by `lease-client.test.ts`.
- **Conflict-copy byte fidelity**: Buffers, not strings; >1 MB conflict copies round-trip exactly (transport contract).
- **The 25s budget vs 6s quiesce + 15s push** — *corrected*: the arithmetic (25 > 6 + 15, with 2s+ nominal slack) is pinned by `handoff-timing-contract.test.ts`, but that test asserts constant arithmetic only — it does not measure scheduling, poll granularity, hub round-trips, or slow disk. It is a healthy regression guard, not a performance proof (D1).

---

## Priority order (reconciled from both sessions)

1. **H1 + H4** — make admission atomic: claim/transfer the lease BEFORE starting a writer, and stop reporting `acquired` when the acquire was denied. Also gate the normal post-start acquire on the denial result (or halt the losing session).
2. **H2 + H3** — define forced/failed handoff semantics: preserve and surface "final sync pending/failed", then re-materialize after the holder's final flush instead of starting stale.
3. **F1/F4 + F2** — surface hub uncertainty ("couldn't check your other devices") instead of silence; improve same-machine fallback detection if desired.
4. **H5** — decide what "lease expired while still running" means; likely holder fencing/epoch checks rather than only the later renew.
5. **H6** — explicitly exclude Android from this feature in UI/copy, or implement Android parity before calling it "cross-device".
6. **F3/F7** — explain the real, qualified behaviour in the Backup & Sync (i) popup — including that conflicts preserve copies and that protection may be unavailable.
7. **M1/M2** — reword the force dialog ("couldn't confirm the handoff") and bind lease authority to an authenticated installation identity.

---

## Recommended next steps

1. **H1/H4 (highest value):** the clean-handoff path must claim the lease before opening/writing; a denied acquire must not report `acquired`.
2. **F1/F4 (directly requested transparency):** hub-down warning + (i) popup copy pass (draft section copy in the previous revision of this file).
3. **H6:** decide Android's place in "cross-device" and say so in copy.
4. M1 copy change is trivial; M2 needs a worker test that an attacker-tainted body deviceId is refused.