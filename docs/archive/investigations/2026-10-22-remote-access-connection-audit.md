---
status: shipped (merged 2026-10-22: youcoded#688, youcoded-dev#308; follow-ups on card #182)
date: 2026-10-22
scope: read-only audit — every path a phone uses to reach the computer, and everything the phone shows about it
code: youcoded @ origin/master 063ea7c7 (workspace), worktree sessions/remote-access-audit
---

# Remote access: connection audit

Read-only. Nothing was run on a phone or in a dev instance; every finding comes from reading
the code. **Verified** = confirmed line by line. **Likely** = the code points to it, but it
needs a real-device check. Paths are under `youcoded/desktop/src/`.

## How a phone reaches the computer today

| Path | How it connects | How it signs in |
|---|---|---|
| Phone browser | Opens `http://<tailscale-ip>:9900`. The computer serves the app page, then a live socket on the same port | A key saved in the browser. Falls back to the password screen |
| Android app, on its own | The app's page talks to the copy of YouCoded running inside the phone | A token from the app. 5 retries |
| Android app, paired to a computer | Settings → Connect to Desktop → pick a saved computer | Sends the **saved password** every time. The saved key is wiped at every app launch, so you pick the computer again each launch |

- The computer only listens on its Tailscale address. It checks phones every 20 s and drops
  one after three missed answers.
- The phone checks when it wakes, when it comes back online, and every 10 s when things go
  quiet.
- Retries: 1 s, 2 s, 4 s … up to 30 s. After 10 failures a browser keeps trying every 60 s.
  The Android app gives up on the computer instead (finding R3).
- After reconnecting, the phone refills only the conversation on screen plus two more.
  - A short gap gets just the missed messages.
  - A long gap reloads that conversation's newest page in full.

## Recommended bundles (biggest win first)

1. **Connections that don't silently die.** Findings R1–R6. Mostly computer-side and
   invisible except that things work. Small to medium effort.
2. **One honest connection indicator.** Findings T1–T6 and E1–E4. This is UI, so it goes
   through a review deck first.
3. **Faster phone loads.** Findings S1–S4. Measure before and after.
4. **Simpler Android pairing.** Finding X1. Removes the stored password and the re-pick
   every launch.
5. **Small sync fixes.** Findings R7–R10.

## Reliability: connections that die or stall

**R1. If Tailscale isn't ready when the app starts, remote access stays off until restart.** Verified.
- Evidence: the server only starts at launch (`main/main.ts:1509`) or when the switch is
  flipped (`main/ipc/remote-admin.ts:94`). If Tailscale isn't up, it refuses to start
  (`main/remote-server.ts:354`) and nothing ever retries.
- You'd experience: you log in, the app opens before Tailscale connects, and the phone can
  never connect that day. The setting still shows "on".
- Fix: while remote access is on but not running, check for Tailscale every ~20 s and on
  wake from sleep. Start the server when Tailscale appears.

**R2. The Android app checks for Tailscale on the phone, where the check can't work.** Likely.
- Evidence: before connecting to a `100.x` address, `connectToHost` asks the phone's own
  backend `remote:detect-tailscale` (`renderer/remote-shim.ts:1832`). That runs the
  `tailscale` command (`main/remote-config.ts:201`). The command doesn't exist inside the
  Android app, so the answer is "not installed".
- You'd experience: "Tailscale VPN is not connected. Turn on Tailscale and try again." even
  with Tailscale on. One check on the phone confirms it.
- Fix: skip the pre-check on Android. A failed connection already says the computer can't
  be reached.

**R3. The Android app quietly drops your computer after about 2½ minutes without signal.** Verified.
- Evidence: after 10 failed retries it deletes the saved computer and key, throws away
  queued messages and switches to the phone's own assistant (`renderer/remote-shim.ts:1531-1549`).
  A nearby comment says the opposite ("keeps trying slowly").
- You'd experience: you walk through a dead zone and your conversations are swapped for the
  phone's own empty workspace, with no message. The REMOTE badge vanishes.
- Fix: keep retrying slowly, like the browser does. Show "Can't reach your computer" with
  **Try now** and **Use this phone only** buttons.
- Side effect: the app no longer becomes usable offline on its own. The button covers that.

**R4. After the connection opens, sign-in has no deadline.** Verified.
- Evidence: the connect timer stops when the socket opens (`renderer/remote-shim.ts:1304`).
  The wake check and heartbeat both skip the signing-in state.
- You'd experience: "Connecting to your computer…" for minutes on a flaky network.
- Fix: allow 10 s from open to signed in, then retry.

**R5. A reconnecting phone leaves its old connection alive on the computer.** Verified.
- Evidence: `addClient` (`main/remote-server.ts:944`) never closes an older socket from the
  same device.
- You'd experience: the computer keeps sending to a dead connection for ~60–80 s, and the
  "N online" count on the computer is too high.
- Fix: when a device signs in, close its other connections.

**R6. The Android app's own backend is given only ~15 s to start.** Verified code; impact likely.
- Evidence: `retryLocalBridge` stops after 5 tries (`renderer/remote-shim.ts:1776-1798`)
  and then shows nothing.
- You'd experience: on a slow or cold phone, the app opens to a "Connecting..." screen that
  never changes.
- Fix: keep trying every 5 s, or wait for the app to say the backend is ready. Give the
  screen a failure state.

**R7. One bad catch-up can leave buttons stuck on "waiting" and skip messages for good.** Verified; rare.
- Evidence: the short catch-up branch has no error guard (`renderer/state/first-page-loader.ts:177`),
  unlike the page branch below it. The saved position has already moved forward
  (`remote-shim.ts:654`), so the missed messages are never asked for again.
- You'd experience: a Stop or permission answer that stays "waiting" forever, and a
  conversation missing a few messages until a full reload.
- Fix: guard it like the page branch, and move the position only after success.

**R8. Two overlapping opens can let live messages through before the refill.** Likely; rare.
- Evidence: an old open's release can free the new open's hold (`main/ipc/session.ts` ~429).
- You'd experience: a paragraph that briefly shows, vanishes or is out of order after
  switching conversations quickly.
- Fix: tag each hold so an old release can't free a new one.

**R9. Answering a permission prompt for a conversation you aren't viewing subscribes the phone to it forever.** Likely.
- Evidence: the follow-up uses `session:open` (`renderer/App.tsx:2613`), which starts a watch
  the phone doesn't track.
- You'd experience: wasted data and battery.
- Fix: stop watching afterwards, or use the normal watch.

**R10. One slow conversation load disconnects the whole phone.** Verified; rare.
- Evidence: after 30 s (`main/audience-fill.ts:15`) the computer hangs up on the phone
  entirely.
- You'd experience: on a very long conversation on a busy computer, the phone can loop
  disconnect → reconnect.
- Fix: time out only that conversation and ask the phone to refill just that one.

**Also small:**
- Retries have no randomness, so every phone reconnects at the same instant after the
  computer restarts.
- Keep-awake restarts its full time (e.g. 8 h) whenever the app restarts, instead of keeping
  the time left (`main/ipc-handlers.ts:1011`).
- A sign-in can be handled twice during the wrong-password slowdown (`main/remote-server.ts:820`).

## Transparency: what the phone tells you

The phone has six separate connection indicators, each fed by a different signal, so they
disagree:
- the sign-in screens
- the chat strip
- the "catching up" screen
- the REMOTE badge
- the send toast
- the Settings rows

**T1. Connection trouble only shows inside the chat view.** Verified for chat; terminal and Settings by reading.
- Evidence: the strip lives in `ChatView.tsx:1014`.
- You'd experience: in Terminal, Settings, Projects or Pages the phone looks fine while
  dead. Taps then fail.

**T2. The REMOTE badge never changes.** Verified.
- Evidence: it is driven by "this is a phone", not "the connection is up"
  (`HeaderBar.tsx:569`). Its only explanation is a hover tooltip, which phones can't show.

**T3. Android Settings says "Connected · Desktop" with a pulsing green dot while disconnected.** Verified.
- Evidence: `SettingsPanel.tsx:2425`. After a restart it also forgets the computer's name
  and shows "Desktop".

**T4. Desktop Settings says "Connected" before any phone has ever paired.** Verified.
- Evidence: "Connected" means "listening" (`SettingsPanel.tsx:1730`). Offline phones show no
  "last seen", though the data exists.

**T5. A long outage looks the same as a 2-second one.** Verified.
- No elapsed time, no next-try time, and no **Try now** once you're inside the app.
- No "your phone is offline" vs "your computer isn't answering", although the app already
  knows when the phone is offline (`hooks/useNetworkOnline.ts`).

**T6. Staleness is shown for the whole phone, not per conversation.** Verified.
- A button waiting on a reply never says "not confirmed".

**Fix for T1–T6:** one connection model with five states:
- connected
- reconnecting since X, next try in Y
- your phone is offline
- your computer isn't answering
- signing in

Show it once at the top of every screen (the REMOTE badge becomes this). Keep the chat strip
only for "loading this conversation" and "may be out of date". The Settings rows and send
toast read the same model.

Proposed wording:
- "Reconnecting · 2 min · Try now"
- "Your phone is offline"
- "Can't reach your computer. Is it on and awake?"

## Misleading or raw error messages

**E1. The reconnecting strip promises something that doesn't happen.** Verified.
- Evidence: `ChatView.tsx:1026` says "Your draft is safe. It sends once you're
  reconnected." By design nothing auto-sends. The toast beside it says "Send it again when
  you reconnect."
- You'd experience: you put the phone down expecting the message to go out, and it never does.
- Fix: "Your draft is kept. Press Send again once you're reconnected."

**E2. The Android app shows raw codes on sign-in failure.** Verified.
- Evidence: `remote-shim.ts:1436, 1465-1471`.
- What it shows today:
  - `invalid-credentials`
  - `no-password-configured`
  - "Connection closed before auth (code 1006)."
  - "Cannot reach host at ws://100.x…:9900/ws. Check the host, port, and network (VPN/firewall)."
  - "Try again" buttons on errors that retrying can't fix.
- The phone browser's sign-in screen already has plain wording (`remote-gate.tsx:78`).
- Fix: use that one translator in both places.

**E3. The "too many attempts" message can never appear.** Verified.
- Evidence: the phone waits for close code 4029, which the computer never sends. One code
  (4009) is reused for three different problems.
- You'd experience: after a few wrong passwords, a vague "closed the connection" message
  while auto-retry keeps going and extends the lockout.
- Fix: one code per reason, plain sentences, and pause auto-retry when rate-limited.

**E4. Raw internal names leak into errors.** Verified.
- Evidence: anything opened while disconnected spins 30 s, then says e.g.
  "Request marketplace:list timed out" (`remote-shim.ts:714`).
- Fix: while disconnected, fail at once with "Not connected to your computer."

**Smaller:**
- The Android QR scanner silently ignores a wrong code.
- Remove deletes a saved computer with no confirm or undo.
- The button label "Disconnect — Return to Local" is jargon.
- The "isn't available via remote access yet" toasts say "yet" for things that may never come.

## Speed

**S1. The terminal is downloaded twice on every first open.** Verified.
- Evidence: an early terminal-only request and the full open both carry the terminal, up to
  4M characters each (`remote-shim.ts:634, 653`). The phone throws the second copy away.
- Fix: leave the terminal out of the full open when the early one was asked for.

**S2. Nothing on the live connection is compressed.** Verified.
- Evidence: no compression set on the socket server (`main/remote-server.ts:421`). Chat text
  and terminal output compress very well, often 5–10×.
- Fix: compress messages over ~1 KB.
- Cost: a little computer CPU. Measure before turning it on by default.

**S3. A full reload sends overlapping history twice and re-reads the file from disk every time.** Verified.
- Evidence: `main/session-open.ts` ~125.
- Fix: send only the part of the recent tail newer than the page.

**S4. Small items:**
- The app page has no "not modified" check, so it fully re-downloads each visit.
- A backgrounded phone may pile up 32 MB before the computer cuts it off.
- A missing image or script is answered with the app page instead of "not found". This
  makes the broken-theme-picture symptom in card #118 harder to read.

## Simplification

**X1. Android pairing.**
- Today the app stores your password in plain form, sends it on every connect, and forgets
  its key every launch (`remote-shim.ts:2008`).
- Fix: save a key per computer, exactly as the browser does, and reconnect with it.
- Effects:
  - The stored password is no longer needed.
  - No re-picking the computer each launch.
  - Removes a whole code branch.

**X2. Reconnect and sign-in logic.**
- There are three reconnect schedulers and three sign-in paths (browser, Android-to-computer,
  Android-local), each failing differently.
- Fold them into one `connect(target)` with one retry loop. Findings R3, R6, E2 and the
  missing randomness then become one fix each instead of three.

**X3. Leftover compatibility code.** `main/remote-server.ts:1069-1085` builds a fake old-style
snapshot for phone pages from before the one-fill change. Delete it and keep the "please
reload" close.

**X4. Overlapping sync safety nets.** These are:
- the page retry loop
- the early terminal open
- the 30 s hold
- the reconnect refill
- two answer-settling paths

Each works, but their overlap is where R7 and R8 come from. Consolidate after the fixes above.

## Existing cards, re-checked

- **#99**
  - "Phone receives every session": fixed.
  - "Full redraw on reconnect": fixed for short gaps; long gaps still reload the conversation.
  - "Terminal cut mid-formatting-code": still present (`main/session-record.ts:481`).
  - "Multi-MB terminal blob": still present, and doubled by S1.
  - "Hydrating flag": replaced by the loading screen.
  - "White flash": not checked.
- **#113(a)** (new device row each reconnect): mostly fixed. The row is reused; the key is
  still rotated each time (see X1).
- **#114, #115, #118, #119**: unchanged and not repeated here. #114's "phone shows the
  browser's own error page" is the one cause no fix here touches.

## Checked and sound

- Sends are never queued or resent automatically.
- Held messages are always released.
- No ordering bugs between refill and live messages.
- The computer cuts off slow readers and they recover.
- The app page itself is compressed and cached.
- Per-session delivery works.
