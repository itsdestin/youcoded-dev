---
status: draft (revised after independent review 2026-10-22)
date: 2026-10-22
evidence: docs/active/investigations/2026-10-22-phone-app-reliability-deep-dive.md (causes 1–8, sections B–C)
approved-by: Destin 2026-10-22 ("fix all of 1/3/4 and do your other recommendations"; always-there reload = explore, not committed)
branch: session/remote-access-audit (youcoded + youcoded-dev)
---

# Phone reliability fixes

Goal: when the laptop sleeps or freezes, or the phone is pocketed, the phone recovers on its
own. Sending and refreshing must never stay stuck.

Paths are under `youcoded/desktop/src/`. "Shim" means `renderer/remote-shim.ts`.

## Phase 1: the phone never gives up and never gets stuck

No new screens. A few lines of wording change.

### 1.1 The Android app keeps its computer (cause 1)

**Never forget on a timer.** In `scheduleReconnect`, the Android app paired to a computer
(`file:` and `targetUrl`) takes the same path a browser does:
- keep the pairing
- keep retrying with backoff up to 60 s

The `MAX_RECONNECT_ATTEMPTS` fallback to `android-local` is deleted. The only fallbacks left:
- the computer refuses this phone's key (`KEY_IS_DEAD` in `onSavedKeyAttemptFailed`, already
  there)
- the person presses Disconnect

**Come back after the app restarts.**
- On a successful `connectToHost`, save `{host, port}` as the last computer under a key the
  launch wipe doesn't touch: `youcoded-last-computer`.
- `disconnectFromHost` and a dead-key fallback clear it.
- At launch, once the local runtime is signed in (where `remote-gate.tsx` lands Android today),
  if a last computer is saved and is still in `getPairedDevices()`, call
  `connectToHost(host, port, savedPassword)`. That is the same call the Settings tap makes.
- If it fails, stay on local and say so once: "Couldn't reach <name>. Reconnect in Settings."
- The launch wipe of `youcoded-remote-target`/`-token` (shim ~2008) stays. It guards
  against the local runtime inheriting a remote target.

**"Use this phone only" while stuck reconnecting.** The reconnecting strip gets a second
button, but only on the Android app. It calls `disconnectFromHost`, which is what Settings
already does.

**Copy fix.** The reconnecting strip (`renderer/components/ChatView.tsx:1026`) changes to
"Your draft is kept. Press Send again once you're reconnected."

### 1.2 Unlocking the phone doesn't throw away a working connection (cause 3)

- In `checkConnectionAfterWake`, delete the `hiddenFor >= HIDDEN_TOO_LONG_MS` branch, so
  every wake runs `probeConnection`.
- The wake timeout becomes 4 s when hidden ≥ 60 s, otherwise 10 s. The short wait limits
  the dead-socket case to 4 s instead of today's instant replace.
- The probe already counts any incoming frame as alive.

### 1.3 Patience during a laptop freeze (cause 2, phone side)

- **Raise the heartbeat reply window** `HEARTBEAT_REPLY_MS` from 5 s to 25 s, with the
  probe sent after 12 s of silence. That tolerates freezes up to ~35 s; the measured
  freezes ≥35 s are about 5 a day.
- **Skip the probe while a `session:open` reply is still outstanding.** The reply can
  legitimately be a large frame in transit. The 30 s request timeout still bounds it.
- **New soft state.** While a probe is waiting longer than 5 s, the connection reports
  `slow`, which is neither disconnected nor connected. The existing strip shows "Waiting
  for your computer…". Send stays enabled, because the socket is alive and the message
  queues on it.
- **Combined effect.** A freeze no longer tears down the socket, so a message sent during
  it arrives when the laptop unfreezes, and is not reported as failed. This also covers the
  "looks failed but arrived" item of cause 7.

### 1.4 One lost reply never blocks the next message (cause 4)

In `renderer/state/submit-outgoing.ts` `sendViaHostQueue`, if a saved unconfirmed request
exists for a *different* draft, do not throw. Instead:

1. Ask the record about the saved `sendId`, with the same ask `send-reconcile.ts` uses.
2. If **received**, clear the saved request.
3. If **not received**, clear the saved request. Its text was already put back in the box
   when it failed.
4. If **unknown**, or the epoch changed, clear the saved request. The existing
   "Not sure this was sent" note covers it.
5. Then send the new draft normally.

**Same reconcile on reconnect.** Run it from `reconcileUnknownOutcomes` / `useSendReconcile`,
so stale saved requests don't wait for a next send.

**Why this is safe:** the host de-duplicates enqueues by `sendId` (`main/claude-queue.ts:127`),
so a saved request can never be sent twice.

**Unsent text restore** (`InputBar.tsx` ~600) currently only fills an empty box. If the box
is not empty, show the existing toast with **Restore**, so the text isn't lost silently.

### 1.5 Failed refills retry by themselves (cause 6)

- In `renderer/state/first-page-loader.ts`, a failed **refill** schedules its own retry
  while connected: 2 s, 5 s, 15 s, 30 s, then every 60 s. It stops when the session closes,
  succeeds, or a newer refill starts.
- **First-load give-up.** The `FIRST_PAGE_MAX_RUNS` cap counts only permanent failures
  (`gone`/no transcript), not timeouts.
- **Catch-up guard.** Wrap the `resume === 'events'` apply in try/catch like the page branch.
  `App.tsx` `fillAgain` uses `Promise.allSettled`, so the fill round is always reported and
  `reconcilePending` always runs.
- **Refresh while disconnected.** The shim (~246) currently returns `{ok:false}` with no
  feedback. Instead, the strip says "Not connected — will refresh when your computer is
  back", and the refresh runs on the next connection.

### 1.6 The laptop stops hanging up on the phone over one slow conversation (cause 2, laptop side)

- **Hold expiry** (`main/ipc-handlers.ts:414`): for a phone, send the same
  `session:refill [sessionId]` push a window gets, instead of `dropAudience`. The shim and
  App handle `session:refill` the way the window does: refill that one session.
- **Reconnect replaces old copies.** In `main/remote-server.ts` `addClient`, when a device
  signs in, close its older sockets with a "replaced" code. That gives a correct online
  count, and the laptop stops streaming to dead copies.

### 1.7 The laptop records phone connections

One `log('INFO', 'Remote', …)` line per event in `main/remote-server.ts`:
- signed in (device name, path: direct or `android-local`)
- closed (code, reason, how long connected, bytes sent)
- ping-sweep kill
- backpressure kill
- hold-expiry refill

This is low volume: the measured rate is ~10–30 events a day. It makes every later claim
countable.

### 1.8 Remote access starts once Tailscale is up

The laptop can open before Tailscale is ready, and remote access never retries
(deep-dive §8). While remote access is enabled and the server is not running, check
`detectTailscale` every 20 s and on power resume, and start the server when an address
appears.

## Phase 2: the laptop freezes (deep-dive §B)

Diagnosis first; the fix depends on the culprit.

- The passive watcher keeps running.
- Add a diagnostic to the hitch recorder: when a main-stall ≥5 s ends, record the last N
  child processes spawned and any sync calls. Reason: a main-process sample can't be taken
  from outside while it is blocked.
- The current lead: the main thread was seen in `anon_pipe_read` while a `git … credential.helper`
  child ran. That points to a synchronous wait on a git child from sync or GitHub backup.
- Card #93 is linked. Fix once the culprit is named.

## Phase 3: smaller, faster refills (cause 5)

1. **Terminal once.** When `openPtyEarly` was sent, the full `session:open` omits `pty`. The
   server then skips `cutPty` for it.
2. **Compression.** `perMessageDeflate` on the phone socket, with a threshold of 1 KB and
   `concurrencyLimit` 4. Measure the laptop's CPU on one large refill before and after.
3. **No duplicate history.** In `main/session-open.ts`, drop the tail entries that the page
   already covers.
4. **Heartbeat.** With 1–3 done, the probe-skip in 1.3 covers the remaining large-frame
   case. Chunking frames is not needed unless measurement says so.

## Phase 4: honest connection status (UI, via review deck)

This is the first-pass audit's T1–T6: one connection model with one indicator on every
screen, plus Android error wording E2–E4. It also covers the "always-there reload" option:
explore it, with alternatives such as the header menu or pull-down, on the same deck.

## Verification

**Unit tests**, each seen red first:
- Android keeps the pairing past 10 failures.
- Launch reconnect.
- Wake with a hidden period ≥60 s and a live socket → no teardown.
- A 30 s silent host → no teardown, `slow` shown.
- A saved unconfirmed request plus a different draft → reconciled and sent.
- A failed refill → retried.
- Hold expiry → per-session refill, not a close.
- A second sign-in from the same device → the old socket is closed.
- The 2026-10 timing tests that proved causes 1–3, rebuilt as permanent pins.

**Other checks:**
- `bash scripts/verify.sh` (desktop).
- The Android build, if the SDK is present. Check with `ls $HOME/.android-sdk/platform-tools /usr/lib/jvm`.
- A dev instance plus a phone browser over Tailscale: simulate a freeze with a debug-only
  main-thread busy loop in dev, then sleep the dev host.
- Destin's real-phone pass on an `assembleReleaseTest` APK.
- After shipping, the 1.7 logs count real drops per day against today's baseline of
  ~10/day estimated.

## Revisions after independent review (2026-10-22) — these override the sections above

- **1.1**
  - **Launch:** hold the gate on "Connecting to <computer>…" for up to 10 s before rendering
    App. This avoids a flash of the phone's own conversations, and stops a send going to the
    wrong runtime.
  - **Laptop unreachable at launch:** fall to local with a persistent strip, "Can't reach
    <name> · Reconnect", plus a quiet background retry. When the laptop answers, offer
    "<name> is back · Switch" and never switch on its own mid-use.
  - **"Use this phone only":** gated on capabilities, not `location.protocol`.
  - **Device rows:** re-auth by password reuses the device row (`previousDeviceId`) and mints
    a fresh secret. That is acceptable.
- **1.2** — wake timeout stays 10 s throughout; no 4 s value.
- **1.3**
  - `slow` is a **flag on `ConversationPhase` / `remote:conversation-status`, never a
    `connectionState`**. `setConnectionState` rejects pending requests and stops the
    heartbeat. Touch points:
    - the shim phase type (~169)
    - App `ConversationStatus` (136)
    - `remoteCatchingUp` (404) and the check at 2621
    - the ChatView strip switch (~1025)
    - `mock-shim.ts`
  - `slow` → connected again returns to the previous phase without an "Up to date." flash.
  - Reply window 20 s. A probe skipped while `session:open` is outstanding is capped at
    10 s. `offline` events and socket close short-circuit at once.
  - `session:queue-action` gets a 60 s timeout while the socket is alive. A late reply
    counts and clears the saved request.
  - Make-before-break is deferred unless the 1.7 logs still show many freeze drops.
- **1.4**
  - Check queue sends against the **host queue snapshot**, which is durable and deduped by
    `sendId`, not the in-memory record.
  - Whenever the outcome is not "received", put the text and attachments back in the box.
    If the box isn't empty, use the toast with Restore.
  - On reconnect and at launch, scan the `youcoded:pending-queue-send:*` keys. Queue sends
    have no bubble, so `useSendReconcile` can't see them.
- **1.5**
  - A successful retry reports back so the "may be out of date" strip clears.
  - Retry timers pause while the page is hidden, and there's a per-connection retry cap.
  - Refresh while disconnected shows strip text only and does not queue: the reconnect
    already refills.
- **1.6**
  - **"Replaced" close:** a new code that the shim treats as terminal ("Opened on another
    tab · Reconnect"). Only non-owner remote sockets are affected, never local.
  - **Hold-expiry refill push:** sent only to clients that announce support at auth. Older
    pages keep the 4010 hang-up.
  - **Order:** ship after 1.5.
- **1.7** — route the existing `logDevice` (remote-server ~293) through `log('INFO','Remote',…)`
  and add bytes and path. It already covers connect, close, ping-kill, backpressure and 4010.
- **Shipping order** — separate commits, in this order:
  1. 1.7
  2. 1.8
  3. 1.1
  4. 1.4
  5. 1.5
  6. 1.2
  7. 1.3
  8. 1.6
- **Tests to add** — beyond the list above:
  - two sign-ins with one device id
  - `slow` keeps pending requests and the heartbeat
  - queue send through a >30 s freeze
  - saved queue send surviving restart
  - gate with a saved computer, no local flash
  - an old shim still gets 4010
- **Existing pins to update** — `remote-shim-connection.test.ts`, `remote-recovery.test.ts`,
  `phone-reconnect-state.test.ts`, `first-page-retry.test.ts`.
- **New on-screen wording, shown to Destin before merge**:
  - "Waiting for your computer…"
  - "Use this phone only"
  - "Connecting to <computer>…"
  - "Can't reach <name> · Reconnect"
  - "<name> is back · Switch"
  - "Opened on another tab"
  - the restore toast

## Status (2026-10-22, end of build session)

Built on `session/remote-access-audit` (youcoded), each with tests seen red, then green:

| Item | Status |
|---|---|
| 1.1 | Done: keep pairing, reconnect at launch with a gate, "Use this phone only", wording fix, Tailscale pre-check removed |
| 1.2 | Done |
| 1.3 | Done: 20 s window, `slow` flag, `offline` short-circuit, 60 s queue-send timeout. The `session:open` probe-skip was dropped: the 20 s window covers it |
| 1.4 | Done: queue `lookup` action, settle on send / reconnect / start, restore into an empty box |
| 1.5 | Done: `refill-retry.ts`; drops don't use up first loads; catch-up guard. "Refresh while disconnected" is not needed, because the strip is "Reconnecting" then |
| 1.6 | Done: `refillPush`, `CLOSE_REPLACED` |
| 1.7 | Done |
| 1.8 | Done |
| Phase 3.1 (terminal once) | Done, server side |
| Phase 3.2 (compression) | Done, level 1 |
| Phase 3.3 (dedupe tail vs page) | **Dropped**: `fill-equivalence.test.ts` showed the tail can carry a newer version of a line than the page (a native retry's `dropPart`), so filtering by uuid resurrected discarded text |

**Phase 2 (laptop freezes):** open. A passive `/proc` sampler caught no freeze over 1 s in its first ~70 min. The one lead is brief `anon_pipe_read` waits while `git … credential.helper` children ran.

**Phase 4 (connection indicator UI):** not started. It needs its own deck.

**Review deck:** `docs/active/design/2026-10-22-phone-reliability/phone-reliability.review.json`.

**Verification:**
- `verify.sh --full` is green apart from one test that was mid red-check, which passes on rerun.
- Not yet run on a real phone. An `assembleReleaseTest` APK is needed from a worktree with its own (non-hardlinked) `node_modules`.
