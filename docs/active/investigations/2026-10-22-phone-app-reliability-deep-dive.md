---
status: active
date: 2026-10-22
scope: why the Android app paired to the laptop disconnects often, and why Send / refresh get stuck
supersedes-focus-of: 2026-10-22-remote-access-connection-audit.md (code-only first pass; still valid as a backlog)
code: youcoded @ origin/master (workspace 063ea7c7); host app on the laptop is v1.3.1
---

# Phone app reliability: deep dive

Destin's report: the Android app "disconnects frequently". He "often can't refresh messages or
send new ones".

## How this was checked

- **Measured** — read from the laptop's own records. Nothing was sent to the running app.
  Sources:
  - the system log
  - YouCoded's timing records (`~/.config/youcoded/perf/hitches*.jsonl`)
  - Tailscale's status
- **Proved** — reproduced with throwaway tests that drove the real phone connection code
  (`remote-shim.ts`) against fake sockets. The tests were deleted afterwards.
- **Read** — confirmed line by line in the code, not run.
- **Not yet checked on the phone itself** — the phone wasn't reachable for logs.

## What is actually happening on Destin's setup (measured)

| Fact | Number | Source |
|---|---|---|
| The laptop's YouCoded freezes completely while awake | 39 freezes ≥10 s and 24 freezes ≥20 s in ~2 days (Oct 20–22). Longest 51 s | `main-stall` records, minus the times the laptop was asleep. Confirmed independently: the app's every-30-s lease check-in line is missing from the system log during a 50 s freeze (Oct 21, 09:28 local) |
| During a freeze YouCoded is **waiting**, not working | Its CPU use was 0.5% in the minute holding the 50 s freeze. The rest of the computer kept running | `minute` record 16:29Z; other programs logged during the freezes |
| The laptop sleeps often | ~13 sleeps in 2 days, from 1 min to 5.5 h. Some are lid closes, some idle auto-sleep | `systemd-sleep` in the system log |
| Remote access's "Keep awake" | Off | `~/.claude/youcoded-remote.json` |
| Phone ↔ laptop network path | Relayed through Tailscale's Los Angeles server, 75–100 ms, no direct path | `tailscale ping` |
| On Oct 20 remote access failed to start (Tailscale not yet connected at launch) and never retried | 1 occurrence in the current log | `desktop.log` |
| The laptop records nothing about phone connections, disconnections or why | — | `desktop.log` has no such lines |

## Root causes, ranked by how much each explains the symptoms

### 1. After ~3½–6 min without the laptop, the Android app deletes the pairing and never reconnects on its own

Proved.

- **What happens:**
  - The phone retries 10 times, then deletes the saved computer and its key.
  - It switches to the phone's own built-in assistant and wipes the screen's conversations
    (`renderer/remote-shim.ts:1531-1549`, `renderer/App.tsx:1973-2000`).
  - Nothing ever reconnects to the laptop automatically. App start only connects to the
    phone's own copy (`remote-gate.tsx:244`), and reopening the app clears the saved computer
    (`remote-shim.ts:~2008`).
- **Timing (proved):** with the laptop asleep and attempts hanging 15 s each, the phone gives
  up at 6.2 min. With attempts failing instantly, at 3.5 min. A nearby comment claims it
  "keeps trying slowly". That is true only for phone browsers.
- **What you'd see:** after the laptop sleeps for a few minutes, the phone's conversations
  vanish or are replaced. You have to go to Settings → Connect to Desktop and pick the
  computer again. With ~6 sleeps a day, this alone explains "disconnects frequently and
  doesn't come back".
- **Fix:**
  - Keep the pairing and keep retrying slowly, like browsers do.
  - Only fall back when the laptop actually refuses this phone.
  - On app start, reconnect to the last computer automatically.
  - Offer "Use this phone only" as a button, never as a timer.

### 2. Each 20 s+ laptop freeze makes the phone hang up a healthy connection

Measured and proved.

- **What happens:**
  - The phone treats 12 s of silence as suspicious, pings, and hangs up if no answer comes in
    5 s (`remote-shim.ts:1626-1634, 1682`). In practice it hangs up 15–25 s after the last
    message, depending on timing (proved: 15 s freeze → no drop; 25 s → drop 2 of 3 times;
    45 s → always).
  - Its new connection attempts then hang on the frozen laptop for 15 s each.
- **What you'd see:**
  - "Reconnecting to your computer…", then "Catching up with your computer…", with Send
    blocked throughout.
  - At the measured freeze rate that's roughly 10+ times a day. Each time, everything on
    screen is refilled.
- **Fixes:**
  - **Phone side:** tolerate longer silence: about 30–45 s, with two missed pings. Never
    hang up while data is still arriving.
  - **Laptop side:** a fill that runs past 30 s currently closes the phone's whole
    connection (code 4010, `main/audience-fill.ts:46`). Make it retry only that one
    conversation.
  - **Real cure:** stop the freezes. See section B.

### 3. Every unlock after a minute or more throws away a working connection

Proved.

- **What happens:** if the screen was hidden 60 s or more, the phone drops the connection and
  reconnects without checking whether it still works (`remote-shim.ts:1670`). The laptop
  usually still has it, because the phone keeps answering the laptop's pings in the
  background.
- **What you'd see:** "Reconnecting… Catching up…" and blocked Send on almost every unlock.
- **Fix:** on unlock, send one quick "are you there?" and only reconnect if it goes
  unanswered.

### 4. A send that got no answer blocks every other message, even after restarting the app

Proved.

- **What happens:**
  - For Claude Code conversations the phone saves each send before sending it, and only a
    "queued" reply clears it (`renderer/state/submit-outgoing.ts:69-79`).
  - If the reply is lost, for example during a freeze or drop as in causes 2 and 3, the saved
    send stays. Every **different** message is then refused with: "An earlier queued send is
    unconfirmed. Retry that saved message before sending a different draft."
  - It is stored on the phone, so killing the app doesn't clear it.
  - The only way out is retyping the exact same message.
  - The original text isn't guaranteed to return to the box. It only comes back into an
    empty box (`InputBar.tsx:~600`).
- **What you'd see:** literally "can't send new messages".
- **Fix:**
  - After reconnecting, ask the laptop whether that send arrived. The laptop already records
    send ids.
  - Clear it if it did.
  - Let a new message replace it if you choose.

### 5. Big refills over the relay can loop forever

The mechanism is proved. The actual link speed is not measured.

- **What happens:**
  - The phone only counts *complete* messages as signs of life (`remote-shim.ts:974`).
  - A refill is sent as one large message: up to ~2 MB of history plus ~2 MB of recent tail
    plus up to 4 M characters of terminal text.
  - On first open the terminal text is sent **twice** (`remote-shim.ts:634, 653`).
  - Nothing is compressed (`main/remote-server.ts:421`).
- If one message takes more than ~15–25 s to arrive, the phone decides the connection is
  dead. It reconnects and asks for the same large refill again: an endless loop on long
  conversations.
- Even without that, a refill taking more than 30 s is abandoned and shows "may be out of
  date".
- **Fix:**
  - Count bytes arriving as a sign of life.
  - Send the terminal once.
  - Compress.
  - Split big refills into small pieces.

### 6. Refresh only appears when the phone already knows it's behind, and failed refills are never retried

Read.

- **What happens:**
  - A failed refill is not recorded and is never retried (`renderer/state/first-page-loader.ts:154`).
  - Refresh exists only on the "This conversation may be out of date" strip. There is no
    pull-to-refresh or menu refresh anywhere.
  - Pressing Refresh while disconnected does nothing and gives no feedback
    (`remote-shim.ts:246`).
  - After 4 failed first loads in one run, a conversation silently stops loading
    (`first-page-loader.ts:135`).
- **What you'd see:** "unable to refresh messages", with no button to press.
- **Fix:**
  - Retry failed refills automatically while connected.
  - Add an always-available "Reload this conversation".
  - Count only permanent failures toward the 4-try limit.

### 7. Messages that look failed but arrived, and a promise the app doesn't keep

Read.

- **Looks failed, but arrived:** a message sent during a freeze is shown as failed and put
  back in the box. The laptop very likely received it once it unfroze (`main/remote-server.ts:1225`).
  The risk is sending it twice.
- **The promise:** while reconnecting the strip says "Your draft is safe. It sends once
  you're reconnected." (`renderer/components/ChatView.tsx:1026`). Nothing is sent
  automatically.
- **Fix:**
  - After reconnecting, check with the laptop and mark the message "Sent".
  - Change the wording to "Press Send again once you're reconnected."

### 8. Smaller confirmed gaps

| Gap | Where | Status |
|---|---|---|
| A crash while catching up leaves Stop or permission buttons "waiting" forever and skips the missed messages | `first-page-loader.ts:177`, `App.tsx:1744` | Read; proved the page branch is guarded and this one is not |
| An old request can release a new request's hold, so messages arrive before the refill and are then wiped | `main/ipc/session.ts:429` | Read; narrow race |
| Remote access never retries if Tailscale isn't up when the app starts | `main/main.ts:1509`, `main/remote-server.ts:354` | Measured once on Oct 20; read |
| The laptop keeps a dead copy of the phone's connection for up to 80 s after it reconnects | `main/remote-server.ts:944` | Read |
| "Not sure this was sent" can linger if its own check times out | `hooks/useSendReconcile.ts` | Read |
| The laptop logs nothing about phone connections, so none of this can be counted | `main/remote-server.ts` | Measured |

## B. The laptop-side freezes (cause 2's root)

- **The facts:**
  - 10–51 s freezes of YouCoded's main part (the part that also serves the phone), about
    20 a day, while the laptop is awake.
  - CPU near zero during them, so it is **waiting** on something: a helper program, a file,
    or the system.
  - The last request before each freeze varies (`session:terminal-ack`, `artifacts:list-session`,
    `syncspaces:status`, `attention:report` …), so no single button causes it.
- **Ruled out:**
  - memory pressure (none)
  - the whole computer freezing (other programs logged throughout)
  - laptop sleep (sleep windows were excluded)
- **Suspects not yet proven:**
  - a waiting call on files inside the two Google Drive folders mounted by rclone. Those
    mounts fail and restart after every sleep. No YouCoded setting points there, so this is
    unproven.
  - a system-service call such as the password keyring.
- **In progress:** a read-only watcher samples, twice a second, what YouCoded's main part
  is waiting on. Results go to the session scratchpad. The next freeze will name the culprit.
- Related open card: **#93** (Background freezes, P1, needs-repro). This is evidence for it.

## C. Laptop sleep

- The phone can't reach a sleeping laptop; that's unavoidable.
- "Keep awake" is off. It likely can't stop a lid-close sleep anyway, because KDE honours
  app sleep blocks for idle sleep only. That needs a quick check.
- What the app *can* do:
  - tell the phone "Your computer is asleep" instead of reconnect churn
  - reconnect by itself when the laptop wakes (cause 1)
  - possibly offer keep-awake while a phone is connected

## Recommended order

1. **Stop the phone giving up and getting stuck.**
   - Causes 1, 3, 4 and the cause-2 phone-side tolerance, the wording fix, refill retry
     (cause 6), the cause-8 catch-up guard, and connection logging on the laptop.
   - Small to medium, behind the scenes, with no screen redesign. Expected effect: most
     "disconnects" become short, self-healing blips, and Send no longer stays blocked.
2. **Find and fix the laptop freezes** (section B). This removes the trigger for most blips
   and also helps the desktop itself (card #93).
3. **Make refills small and fast** (cause 5): terminal once, compression, split replies.
4. **Honest connection status on the phone** — the UI work from the first-pass report, via a
   review deck.

## Still unknown (needs the phone)

- Whether Samsung's battery management pauses the app's network or timers when the screen is
  off. This decides how often cause 1 fires while the phone sits in a pocket.
- Real relay throughput and real refill sizes on Destin's long conversations.
- How the laptop's listener behaves across a sleep and wake on the Tailscale address.

Wireless debugging on the phone would let these be read from the phone's own log without
changing anything.
