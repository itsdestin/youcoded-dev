---
status: draft
date: 2026-07-30
reviewed: 2026-07-30
repos: [youcoded]
---

# Permission asks that expire silently

> **Revision note (2026-07-30 review).** Every code claim below was re-verified
> against the checkout and against the CC binary at
> `~/.local/share/claude/versions/2.1.220`. Four claims in the first draft were
> wrong and are corrected in place — the Android rollout hazard (§Constraints),
> the "the two clocks race" mechanism (§Mechanism 1), the escalation diagnosis
> (§Mechanism 4), and the §5 comment-site inventory. The design changed in
> three places as a result: the app now owns the expiry clock, the expired card
> keeps its `awaiting-approval` status instead of gaining a new attention
> state, and the digit rebind is gated to digit-bearing menus.
>
> **Revision note 2 (2026-07-30, second review against `ab8f5a08`).** The
> diagnosis and the Android finding survived. Five design-level errors did not,
> all in §1–§2a:
> 1. §1's tier-1 call used the wrong wire shape (`{behavior}` vs
>    `{decision:{behavior}}`).
> 2. §2's "tag the pending entry, read it in the close handler" is impossible —
>    `respond()`/`closeSocket()` delete the entry synchronously *before* the
>    socket closes, so app-initiated closes emit **no** event at all today.
> 3. §2a's "zero edits to any consumer" was false, and one consumer
>    (`usePromptDetector`) makes §2a and §2/§3 mutually exclusive as drafted.
> 4. Three renderer-initiated `PERMISSION_EXPIRED` dispatches exist to *unstick*
>    a card after a failed delivery; §2a would have pinned those cards forever.
> 5. The native `PermissionBroker` path shares the same actions and the same
>    reducer and was absent from the spec entirely.
>
> All five are corrected below. One product decision is now surfaced rather than
> implied: a 24h tier-1 hold blocks chat input for that session for 24h
> (§1b) — that number needs Destin's call.

## Problem

A chat-view permission ask dies after ~5 minutes with no indication anywhere.
The session looks idle while Claude Code is still blocked waiting for an answer.

Reported symptom: "the session just appears to be working fine from chat view
despite claude still waiting on my input/response to a permission prompt."

### Mechanism

1. `desktop/scripts/install-hooks.js:126` registers the `PermissionRequest` hook
   with `timeout: 300` (seconds). `desktop/hook-scripts/relay-blocking.js:22`
   defaults to `300000` ms. **These are not a race — CC wins deterministically.**
   CC starts its timer when it spawns the hook process; the relay's timer is
   `client.setTimeout(TIMEOUT_MS)` at `relay-blocking.js:69`, which is not armed
   until node has booted, drained stdin, and connected to the pipe — several
   hundred ms later. Equal nominal values with a strictly later start means the
   relay always loses, so the exit-2 auto-deny branch effectively never fires
   today. (The first draft attributed the inconsistent presentation to a race.
   That explanation is wrong; the true cause of any run-to-run variation is
   unknown and is **not** load-bearing for this design.)
2. Whichever fires, the socket closes. `desktop/src/main/hook-relay.ts:68-73`
   emits `permission-expired`.
3. `desktop/src/renderer/state/chat-reducer.ts:1234` flips the card to
   `status: 'failed'` with "Permission request expired — socket closed before a
   response was sent", on a card that has usually scrolled out of view.
4. **The expiry actively erases the one signal that was working.** While the ask
   is pending the session strip dot is **red**: `useSessionAttention.ts:65`
   derives `hasAwaiting ? 'red'` by scanning `activeTurnToolIds` for an
   `awaiting-approval` tool, and `PERMISSION_REQUEST` puts the (possibly
   synthetic) tool there — `chat-reducer.ts:1160-1168, 1187-1188`. That
   selector is **not** visibility-gated, so background sessions get the red dot
   too. At expiry the card flips to `'failed'`, `hasAwaiting` goes false, and
   the dot drops to green/gray — the session starts *looking fine* at the exact
   moment it stops being fine. That is the reported symptom.
   - The classifier is a separate, smaller gap: `useAttentionClassifier` is
     mounted inside `ChatView` (`ChatView.tsx:200`) and gated on `visible`
     (`useAttentionClassifier.ts:81`), so a background session is never
     classified. It is not what would have caught this — `PERMISSION_REQUEST`
     deliberately pins `attentionState: 'ok'` (`chat-reducer.ts:1192-1193`,
     "Chat already renders the approval card — classifier doesn't also need to
     warn"), so the classifier was never in this path.
5. `usePromptDetector.ts:16` deliberately refuses to render permission menus
   (`SETUP_PROMPT_TITLES` whitelist), because the hook normally owns them. So
   the live TUI prompt is invisible to chat view by design.

### Why AskUserQuestion is the acute case

Claude Code has its own AskUserQuestion clock, and it is off by default.
`askUserQuestionTimeout` is a first-class CC setting — schema
`v.enum(["60s","5m","10m","never"]).optional()`, config-panel label "Question
auto-continue timeout", resolved as
`r?.askUserQuestionTimeout ?? TCe() ?? "never"`. **Default is `never`.**
Verified against the CC binary at `~/.local/share/claude/versions/2.1.220`.

So CC waits indefinitely for an AskUserQuestion answer, and our 300s hook is the
only clock in the system. When it fires, the card dies and CC keeps waiting
forever. The session is permanently wedged with zero indication.

Three factors stack to make this the tool that actually bites:

- **Bypass mode makes it the only card that appears.** `main.ts:889` explicitly
  never auto-approves AskUserQuestion (`toolName !== 'AskUserQuestion'`), while
  everything else under `--dangerously-skip-permissions` is handled natively by
  CC. For a user who lives in bypass mode it is the only prompt still routed to
  chat.
- **It takes longest to answer** — 1-4 questions, some multi-select. 300s is
  tight for a real question and generous for a Yes/No.
- **It is the only one where expiry is unrecoverable.** An expired permission ask
  either auto-denies or falls through to CC's own menu; the session moves either
  way. AskUserQuestion just stops.

### Android is worse

`app/src/main/assets/hook-relay-blocking.js:16` defaults to `120000` ms — a
two-minute auto-deny.

## Constraints discovered

**CC does not clamp the hook timeout.** The command-hook schema is
`timeout: v.number().positive().optional()` with no `.max()`, and execution is
`P = e.timeout ? e.timeout*1000 : Hm` where `Hm = 600000` — no `Math.min`. (There
*is* a clamp in that binary, `Math.max(P2o, Math.min(t, wF_))`, but it is on the
SessionEnd aggregate timeout, a different path.) Arbitrary positive values are
honored.

**But `setTimeout` is 32-bit.** Anything above `2147483647` ms (~24.8 days)
overflows and fires immediately — measured, not assumed: node warns
`TimeoutOverflowWarning … Timeout duration was set to 1` and the callback runs
on the next tick. A "make it effectively infinite" value like one year would
silently become an instant timeout — the bug we are fixing, disguised. Every
value in this design is comfortably under.

**Both relay timeouts are env-overridable.** `relay-blocking.js:22` and
`hook-relay-blocking.js:16` read `process.env.CLAUDE_RELAY_TIMEOUT` before
falling back to the literal; `desktop/docs/test-blocking-relay.js:144` sets it
to `3000`. Nothing in the app sets it, so the literals are what ship — but the
pinning test in §Testing must assert the **literals**, not a resolved runtime
value, or it will pass vacuously under the test harness.

**CC's hook timeout cannot vary per tool.** There is one `PermissionRequest`
entry in `settings.json` and it applies to every tool. Per-tool policy, if ever
wanted, has to live in the app: the relay does **not** inspect the payload
beyond injecting `_desktop_session_id` (`relay-blocking.js:27-35` — there is no
`tool_name` read anywhere in either relay, contrary to the first draft), but
`HookRelay` has the parsed payload and can branch there. Not needed here —
noted so a future session does not rediscover it.

**Existing desktop installs need no migration.** `main.ts:1288-1306` `require()`s
`install-hooks.js` on every launch of the built app (skipped when
`YOUCODED_PROFILE` is set, i.e. dev instances). `resolveHookDir()`
(`install-hooks.js:42`) unconditionally `fs.cpSync`s `hook-scripts/` into
`~/.claude/youcoded-hooks/`, overwriting; `install-hooks.js:129-134` finds the
existing `PermissionRequest` entry by index and replaces it outright. Both the
new script and the new settings value land on the first launch after update, in
the same run.

**`hook-reconciler.ts` runs after `install-hooks.js` and will not undo this.**
It enforces `MAX(user_timeout, manifest_timeout)` (`hook-reconciler.ts:221-226`)
— it never shortens — and it has no `PermissionRequest` spec at all. Noted so a
future session doesn't hunt for a phantom clamp.

**⚠ Android's settings write is skipped on every existing install — and the
asset write is NOT.** This inverts the first draft's conclusion and is the
reason the Android changes must ship as one unit:

- `Bootstrap.kt:893-899` — *"Always redeploy — ensures latest version after APK
  update"* — unconditionally copies `hook-relay-blocking.js` from assets on
  every launch. **The relay timeout change lands on every existing install.**
- `Bootstrap.kt:996-1008` scans for an existing entry whose command contains
  `hook-relay-blocking.js`, sets `prRegistered = true`, and guards the entire
  write behind `if (!prRegistered)`. **The `timeout: 300` at `Bootstrap.kt:1014`
  stays forever** on any install that already has the hook — i.e. every existing
  user.

Shipping only the asset change therefore produces relay-24h against CC-300s:
CC wins every time, kills the hook with no decision, and AskUserQuestion wedges
**permanently**. That is strictly worse than today's 120s auto-deny, which at
least unblocks the session. Android needs desktop's find-and-replace semantics
(locate the existing entry, overwrite it) and it is a **prerequisite**, not
parity polish — see §Implementation order.

**The blast radius is app-scoped in practice, despite writing a shared file.**
This writes `~/.claude/settings.json`, which terminal Claude Code sessions also
read, so the hook entry does apply to CLI usage. But `main.ts:172-177` derives a
**PID-suffixed** pipe path (`claude-desktop-hooks-${process.pid}.sock`) and only
`pty-worker.js:257` injects `CLAUDE_DESKTOP_PIPE`. A plain terminal `claude`
therefore falls back to the unsuffixed default path, which nothing ever listens
on, hits `client.on('error')` (`relay-blocking.js:74-76`) and exits 0
immediately — CC falls through to its own TUI prompt with no delay. Terminal
sessions are unaffected by the longer timeout.

**No TOS surface.** A documented settings field whose schema explicitly permits
any positive number. No binary patching, no bypassing or auto-approving — the
change makes the permission gate wait *longer for a human*, strictly more
conservative than what ships today.

## Design

### 1. Three clocks, one owner

The app owns the real clock. The relay and CC entry become backstops with
explicit margins, so that in normal operation **the app is always the party
that ends the wait** — which is what makes an expiry distinguishable (§2).

| Tier | Where | File | Now | After |
|---|---|---|---|---|
| **1 — app hold (24h)** | `HookRelay` per-request timer | `desktop/src/main/hook-relay.ts` (new) | — | `86400000` ms |
| | Android equivalent | `app/.../parser/EventBridge.kt` (new) | — | `86400000` ms |
| **2 — relay backstop (24h30m)** | Relay, desktop | `desktop/hook-scripts/relay-blocking.js:22` | `300000` | `88200000` |
| | Relay, Android | `app/src/main/assets/hook-relay-blocking.js:16` | `120000` | `88200000` |
| **3 — CC backstop (25h)** | CC hook, desktop | `desktop/scripts/install-hooks.js:126` | `300` | `90000` |
| | CC hook, Android | `app/.../runtime/Bootstrap.kt:1014` | `300` | `90000` |

Why the ordering matters, in one sentence per tier:

- **Tier 1 must win.** The app is the only party that knows *why* the wait
  ended, can label the card accurately, and can decide deliberately. On firing
  it calls `HookRelay.respond(requestId, { decision: { behavior: 'deny' } })`
  (`hook-relay.ts:156`) — a clean decision that unblocks the turn. **The nested
  `decision` wrapper is load-bearing:** `relay-blocking.js:50-55` reads
  `appDecision.decision` and re-wraps it as `hookSpecificOutput.decision`, so a
  flat `{ behavior: 'deny' }` ships `decision: undefined`. Every real caller
  uses the nested form (`main.ts:894, 900, 906`) and
  `tests/hook-relay.test.ts:86` pins it.
- **Tier 2 (relay) covers "app alive but hung"** — the only case where the
  socket stays open with nobody minding it. It exits 2 (fail-closed deny), which
  also unblocks.
- **Tier 3 (CC) is last resort.** CC winning is the *bad* outcome: it kills the
  hook with no decision at all, which for AskUserQuestion means waiting forever
  on its `never` default. The 30-minute margins exist solely to keep tier 3
  unreachable.

If the app process dies, the socket closes on its own and the relay exits 0
(`relay-blocking.js:65-67`), so CC falls through to its own TUI menu. No timer
is needed for that case.

Carry a WHY comment at each site. The margins are invisible otherwise and a
future session will "tidy" them back to equal — which restores the wedge.

### 1a. Undelivered asks must not hold for 24 hours

The old 300s timeout was doing unadvertised double duty as a dead-man's switch
for *"the card never reached any UI"*: renderer crash, no window open, remote
client gone, or an ask whose session id doesn't match a live session
(`hook-relay.ts:34` falls back to CC's own `session_id` when
`_desktop_session_id` is absent, and nothing guarantees a renderer session
exists for that id). At 24h, every one of those becomes a day-long hang.

Restore the switch cheaply, with no new IPC channel: `HookRelay` gets a
routability gate wired to `SessionManager`, mirroring the existing
`setReloadPluginsGate` pattern (`main.ts:181`, `session-manager.ts:274-276`). If
the incoming `sessionId` does not correspond to a live session at the moment the
request arrives, the hold is capped at **60s** instead of 24h; on expiry the app
responds deny as in tier 1. Same gate on Android, wired to `SessionService`.

### 1b. ⚠ Decision needed: a 24h hold blocks chat input for 24h

`hasPendingInteraction` (`pty-input-gate.ts:29-47`) blocks **chat sends and
command sends** while any active-turn tool is `awaiting-approval`. That is
correct behaviour — the Ink menu would eat the bytes — but today the ceiling on
it is the 300s expiry. Tier 1 raises that ceiling to a full day, and §2a keeps
the card `awaiting-approval` past expiry, so the block persists.

The only automatic release is `endTurn()` (`chat-reducer.ts:171-181`), which
flips `awaiting-approval` → `'failed'`. It cannot fire while CC is blocked on
the hook — that is the wedge. So a user who walks away from an ask returns to a
session they cannot type into, with no in-app way out except answering the card
or switching to terminal view.

§4 discusses the `/reload-plugins` fallout of the longer hold but not this,
which is the larger one. Two things close it; **the first needs Destin's call**:

- **Shorten tier 1.** 24h covers nothing that terminal view doesn't already
  cover. Recommended: **2h** app hold, 2h30m relay, 3h CC (`7200000` /
  `9000000` / `10800`) — long enough for "stepped away", short enough that a
  forgotten ask self-clears the same working day. The table above is left at 24h
  pending that decision; the margins and the ordering are what matter, not the
  magnitude.
- **Give the expired card an out.** Alongside the §3 rebind buttons, a plain
  "Dismiss — I answered in the terminal" control that resolves the card locally
  (same reducer path as a `'hook-closed'` + menu-gone expiry). Cheap, and it is
  the only affordance that helps when §3's rebind is gated off — which is
  always, for AskUserQuestion.

Secondary, accepted: each unanswered ask now pins one node relay process and one
held socket for the duration of the hold instead of 5 minutes. Bounded by the
number of concurrent unanswered asks; noted so it isn't rediscovered as a leak.

### 2. `PERMISSION_EXPIRED` carries a reason

Today `hook-relay.ts:68-73` emits `permission-expired` from `socket.on('close')`,
which is byte-identical whether the app closed the socket, the relay timed out,
or CC killed the hook. The design needs to tell those apart and pass a `reason`
through.

**The obvious implementation does not work.** "Tag the pending entry, read the
tag in the close handler" reads an entry that is already gone: `respond()`
(`hook-relay.ts:162-164`) and `closeSocket()` (`:171-173`) both
`pendingSockets.delete(requestId)` **synchronously**, while `'close'` fires on a
later tick — and the handler's `const wasOpen = this.pendingSockets.delete(...)`
guard (`:69-72`) then swallows the emit. Consequence today: an app-initiated
close emits **no `permission-expired` at all**. (`tests/hook-relay.test.ts:80-96`
matches — it asserts `respond()` clears `hasPendingPermission`, and never
asserts an emit.) A tier-1 deny built on the close handler would therefore leave
the card `awaiting-approval` with a dead `requestId` forever — the wedge,
relocated.

**So the app-initiated paths emit explicitly.** Tier 1 and the §1a cap call
`respond()` and then emit directly:
`this.emit('permission-expired', sessionId, requestId, 'app-timeout')`. The
`socket.on('close')` handler keeps its `wasOpen` guard and emits
`'hook-closed'` — it is now reachable only when the far end went away first,
which is exactly the discrimination §2 wants. No tagging, no new map field.

- `'app-timeout'` — tier 1 fired; a deny was delivered and CC is about to tear
  its menu down. **Do not rebind** (see the race in §3). Resolve the card as
  denied, with accurate copy.
- `'unroutable'` — the §1a 60s cap fired. Same handling as `'app-timeout'`.
- `'hook-closed'` — the far end went away (CC killed the hook, relay died,
  relay's own tier-2 timeout). The menu may still be live; discriminate:
  - **Menu gone** (`parseInkSelect` over the buffer returns nothing) → the user
    answered in the terminal. Clear the card quietly as resolved. No error text.
  - **Menu still up** → genuine dead hook. Keep the card per §2a and rebind per
    §3.

`usePromptDetector` already polls the buffer via `getVisibleScreenText` /
`onBufferReady` and is mounted once at app level (`App.tsx:475`), iterating all
registered terminals — so the discriminator works for background sessions, not
just the visible one. Do **not** put it behind `useAttentionClassifier`, which
is `visible`-gated and would leave background sessions silent (the original
symptom).

**⚠ But §2a switches that polling off — this must be fixed first.**
`usePromptDetector.ts:101-108` returns early from *every* buffer flush when any
tool in `sessionState.toolCalls` is `awaiting-approval` — and it scans the
**session-lifetime** map, not `activeTurnToolIds`:

```ts
for (const [, tool] of sessionState.toolCalls) {
  if (tool.status === 'awaiting-approval') return;
}
```

§2a keeps the expired card at `awaiting-approval` indefinitely, so the detector
goes permanently silent for that session — taking with it §2's "menu gone?"
discriminator, §3's rebind, and every unrelated prompt card (trust gate, usage
limit, resume, external imports). It self-heals only at `endTurn()`, which
cannot fire while CC is blocked. As drafted, §2a and §2/§3 are mutually
exclusive.

Required change: make that bail skip cards flagged `expired` —
`if (tool.status === 'awaiting-approval' && !tool.expired) return;`. The intent
of the original guard ("the hook UI owns this menu, don't double-render a
PromptCard") still holds for live asks and no longer holds for a dead one.

Related, same file: `usePromptDetector.ts:80-96` arms its 800ms
`POST_PERMISSION_COOLDOWN_MS` on the `awaiting → not-awaiting` transition, which
§2a stops firing on expiry. Harmless (the cooldown exists to suppress redraw
churn after a *successful* response) but it means the `expired` flag, not the
status, is the transition to watch if that cooldown is ever wanted here.

This closes the "clear the question from chat view if the user responds in
terminal view" requirement.

### 2a. The expired card stays `awaiting-approval` (do not flip to `'failed'`)

Replace the `status: 'failed'` write at `chat-reducer.ts:1241-1246` with:
keep `status: 'awaiting-approval'`, clear `requestId`, and set a new optional
`expired?: true` on `ToolCallState` (`src/shared/types.ts:281-302`).

One field change buys four behaviours **with no edits to any of the four
gates below** — but it is not free elsewhere. `rg -n "awaiting-approval"
src/renderer/` returns 47 hits: 12 across 5 component files
(`ToolCard`, `CompactToolStrip`, `AssistantTurnBubble`, `BubbleFeed`,
`ChatView`), plus `usePromptDetector` (7), `chat-reducer` (9),
`useSessionAttention` (3), `pty-input-gate` (3), `useAnyAttentionNeeded` (1).
The four wins are real; the required edits are inventoried in §2b.

The four behaviours that come for free:

- **The red strip dot persists.** `useSessionAttention.ts:51-70` keys off
  `activeTurnToolIds` + `status === 'awaiting-approval'`, so the session keeps
  reading "needs you" in the switcher — for background sessions too. This is the
  actual fix for the reported symptom.
- **`hasPendingInteraction` keeps returning true** (`pty-input-gate.ts`), so chat
  sends and command sends stay blocked while the Ink menu is live.
- **`canRetrySubmit` keeps returning false**, so `useSubmitConfirmation` cannot
  fire a bare `\r` into the menu.
- **Remote clients inherit it for free** — `serializeChatState` copies
  `toolCalls` wholesale (`chat-types.ts:672`), so an added optional field rides
  along with no shim change.

`ToolCard` reads `expired` to swap its copy and its button wiring (§3). This
satisfies §4's requirement — "whatever state the rebound card takes must still
count as pending for both gates" — without touching either gate.

### 2b. Consumers that DO need edits

Four, none optional:

- **`usePromptDetector.ts:101-108`** — the buffer-parse bail. See §2; without
  this edit §2 and §3 do not function at all.
- **`ToolCard.tsx:785`** — the approval UI is gated
  `tool.status === 'awaiting-approval' && tool.requestId`. §2a clears
  `requestId`, so an expired card renders header-only: no copy, no buttons.
  Widen to `&& (tool.requestId || tool.expired)` and branch inside on `expired`.
- **`CompactToolStrip.tsx:252`** — same gate, same fix, buddy-mode surface.
  Missing it leaves an amber strip entry with no way to act on it.
- **`AssistantTurnBubble.tsx:511-512`** filters `awaiting-approval` tools out of
  turn groups because "they render as standalone bubbles at the bottom of the
  timeline". No code change needed, but note the behaviour: an expired card now
  stays pinned to the bottom of the chat and out of its turn group for the life
  of the turn. That is arguably the right presentation for something still
  needing an answer — decide deliberately rather than discover it.

`useAnyAttentionNeeded.ts` (the tray/badge "any session needs you" aggregate) is
fed by the renderer's own `ATTENTION_REPORT`, which derives from
`useSessionAttention`'s `awaitingApproval` — so it inherits §2a's persistence
correctly and needs nothing.

### 2c. Renderer-initiated `PERMISSION_EXPIRED` must NOT retain the card

`PERMISSION_EXPIRED` is not only the socket-close signal the spec has been
treating it as. Three renderer sites dispatch it as a generic *unstick this
dead card* action, on a delivery that returned `false` or threw:

- `ToolCard.tsx:798-804` (`onFailedCb`) — reached from six call sites:
  `PermissionButtons.handleRespond` (`:293, :300`), `AskUserQuestionCard`
  submit (`:571, :578`) and deny (`:590, :596`).
- `CompactToolStrip.tsx:175` (delivered === false) and `:196` (catch).

Under §2a these would pin the card at `awaiting-approval` with a cleared
`requestId` — red dot forever, chat sends blocked forever (§1b), and after the
§2b gate widening, a card whose buttons cannot work because the socket is
already gone. Strictly worse than today.

All three must pass `reason: 'delivery-failed'`, which the reducer resolves the
same way as `'app-timeout'`: card resolved, no retention, no rebind. The
`reason` field therefore has to exist on the `PERMISSION_EXPIRED` *action*
(`chat-types.ts:460`), not just on the main-process event — and it must be
optional, so a remote client on an older shim still deserializes.

**Default when `reason` is absent: resolve, do not retain.** Retention is the
new, riskier behaviour; it should require an explicit opt-in from a producer
that knows the menu is still live.

### 2d. The native `PermissionBroker` path

`src/main/harness/permission-broker.ts` emits `PermissionRequest` and
`PermissionExpired` in the *same shape* as `hook-relay` and routes through the
same `hook-dispatcher` → same reducer (its header comment says so explicitly).
The spec's first two drafts modelled only the hook path.

`cancelOne()` (`permission-broker.ts:97-108`) emits `PermissionExpired` with no
reason on interrupt (`cancelSession`) and on shutdown (`cancelAll`), and its own
comment states the purpose: "PermissionExpired clears the approval card". §2a
would stop it clearing. Native sessions have **no PTY at all**
(`pty-input-gate.ts:96` — `canPtySend` returns false for `provider === 'native'`),
so there is no terminal menu to answer, nothing for §2's discriminator to parse,
and nothing for §3 to rebind to. A retained native card is unrecoverable.

Rule: **`native-`-prefixed request ids always resolve.** Cheapest form is the
§2c default (absent `reason` → resolve), which covers the broker for free; but
state it explicitly in the reducer as a WHY comment so a later "let's default to
retain" change can't silently re-break it. The broker also has no tier-1 timer —
out of scope here, noted so its absence reads as deliberate.

**Deliberately NOT adding an `AttentionState`.** The obvious alternative was a
new state plus an `AttentionBanner` branch. `.claude/rules/chat-reducer.md`
pins the union at four members, each with a writer, precisely because dead
branches accumulated there before; and `PERMISSION_REQUEST` intentionally holds
`attentionState: 'ok'` while a card is showing (`chat-reducer.ts:1192-1193`).
The persistent red dot plus the card's own copy is the escalation. Leave
`attentionState` alone.

### 3. Digit rebind — digit-bearing single-select menus only

On a `'hook-closed'` expiry with the menu still up, keep the card and swap its
buttons from *respond-to-socket* to *write-this-input*. The mapping already
exists: `menuToButtons` (`src/renderer/parser/ink-select-parser.ts:362-386` —
`parser/`, not `utils/`) returns `{ label, input: "2" }` from real parsed
`optionNumbers`. It already drives the working "Trust This Folder?" and "Usage
Limit Reached" cards. The card's appearance does not change; the user cannot
tell.

The rebind re-parses the buffer at expiry time (it has to — a permission menu
never produces a `SHOW_PROMPT`, so no `ParsedMenu` is stored on the card).

Three hard rules:

- **Match by label, never by index.** CC's option set varies by tool and mode — a
  Bash ask and an Edit ask do not share a middle option. Clicking "No" and
  landing on "Yes, and don't ask again" is a silent misfire in the worst
  direction. Require a confident label match; with no match, keep the card in
  its §2a state and leave the buttons inert. Never guess an index.
- **Require digits — reject the arrow-key fallback path.** `menuToButtons`'
  no-digit branch (`ink-select-parser.ts:376-384`) emits
  `DOWN.repeat(steps)` computed from `menu.selectedIndex` **as captured at
  SHOW_PROMPT time**, and its own comment says that value "goes stale if the
  user arrows in the terminal view after the card appears". Gate the rebind on
  `optionNumbers` being present for every option; otherwise no rebind.
  **Calibration:** this gate is defensive, not load-bearing — the same file's
  header (`:369-370`) notes "the parser requires a numeric prefix to recognise
  an option line at all, so this is the path that actually runs", i.e. the
  fallback branch is close to unreachable. And because the rebind re-parses
  fresh, `selectedIndex` would be current anyway. Keep the gate (it costs one
  line and the invariant is real); don't budget review time for it.
- **Bypass the PTY gate — deliberately, with precedent.** `pty-input-gate.ts`
  states the rule: automated writers (submit-retry, chat sends, command sends)
  must consult the gate; "Deliberate menu-driving writes (ToolCard plan keys,
  TrustGate buttons, terminal-view keystrokes) must NOT go through this gate —
  driving the menu is their whole purpose." The rebind writer is category two.
  Precedent is `ToolCard.tsx:466-473` (`PlanApprovalButtons` → `sendInput`).
  **Copy the gate bypass, not the write shape:** that call site sends
  `DOWN.repeat(i) + '\r'` as one write, while `ink-select-parser.ts`'s header
  documents that the `\r` must be a *separate* write (which is why
  `menuToButtons` returns `input` and `submitInput` as distinct fields). Use the
  `input`/`submitInput` split.

**Why `'app-timeout'` must not rebind.** When tier 1 fires, the app has just
sent a deny; CC has not yet processed it, so the Ink menu is still on screen at
the instant `PERMISSION_EXPIRED` is dispatched. A buffer-only discriminator
would see "menu up", rebind the digits, and the user's click would land *after*
CC tore the menu down — stray input straight into the prompt box, which is the
exact class the 2026-07-09 stray-Enter fix exists to prevent. The `reason` tag
from §2 is what closes this; there is no buffer state that distinguishes it.

**Explicitly not attempted for AskUserQuestion.** CC's TUI for it is sequential
(answer Q1, then Q2…), handles multi-select toggling, and per CC's own tool
description "always includes a Skip button and a free-text input box for custom
answers" — affordances our card does not have. Replaying that blind is a state
machine with a wrong-answer failure mode. AskUserQuestion's safety net is the
persistent card and red dot from §2a, plus terminal view.

### 4. The post-expiry stray-Enter hole

Pre-existing bug, reachable today. Every guard that protects the live Ink menu
keys off state that goes FALSE at expiry while the menu is still on screen:

- `hasPendingPermission` (`hook-relay.ts:182-188`) is socket-based, so it flips
  false the moment the socket closes. It gates the `/reload-plugins` broadcast
  (`main.ts:178-181`, `session-manager.ts:266-275`).
- `hasPendingInteraction` (`pty-input-gate.ts`) scans `activeTurnToolIds` for
  `awaiting-approval`; the expired card became `'failed'`, so chat sends and the
  `useSubmitConfirmation` retry `\r` were unblocked while the menu was live.

**§2a closes the second one outright** — the card never leaves
`awaiting-approval`, so both `pty-input-gate` predicates keep holding. No gate
edits needed.

The `/reload-plugins` path needs no code change either, but its behaviour
changes and should be documented: `sendReloadWhenClear` retries at most
`RELAY_MAX_RETRIES = 24` × 5s ≈ 2 minutes and then **gives up silently**
(`session-manager.ts:278-279, 300-305`). With a 24h hold, a broadcast issued
while a session sits on an unanswered prompt will always be dropped rather than
delayed. Accepted: installing a plugin will not reload it in a session that is
mid-prompt; the user can re-run `/reload-plugins`. Do **not** raise the retry
cap to cover 24h — that would resurrect the stray-Enter write.

(The first draft claimed the broadcast "can now type into a live menu". That is
only reachable in the ~2-minute window immediately preceding an expiry, and §2a
plus the tier-1 deny make it narrower still. Not a blocker.)

### 5. Comment and doc rewrites

Four sites assert the opposite of the new design or hardcode a stale value.
Changing constants without them leaves landmines:

- **`relay-blocking.js:19-21`** — "Default 300s to match the Claude Code hook
  timeout in settings.json. If the relay times out before Claude Code's hook
  timeout, it exits with code 2 (deny), causing an auto-deny before the user can
  respond." Both clauses now invert: the values are deliberately **not** matched,
  and the relay firing before CC is the **desired** outcome. Rewrite to state
  the tier ordering from §1 and why (relay-wins → clean exit-2 deny that
  unblocks; CC-wins → hook killed with no decision → AskUserQuestion waits
  forever on its `never` default).
- **`EventBridge.kt:146`** — hardcodes "times out (120s)" in prose.
  (`EventBridge.kt:119` mentions the timeout but carries **no** number — leave
  it or generalize it; the first draft listed the wrong pair of lines.)
- **`HookEvent.kt:60`** — hardcodes "timed out (120s)". Missed by the first
  draft; it is the second of the two Android prose sites that carry the number.
- **`desktop/docs/blocking-relay-handoff.md:44`** — already stale and
  contradicts shipped code today: claims "default 30s" and "relay exits 0
  (**fail-open**)", but the code is 300s and exit 2 (**fail-closed**). Fix on
  sight (workspace rule: docs contradicting code get fixed in the same session).

Preserved intentionally: **`exit 2` fail-closed on the relay timeout stays.**
Both relay headers document it (`relay-blocking.js:11`,
`hook-relay-blocking.js:10`) and tier 2 depends on it. Android's "Connection
error → exit 0 (fall through to terminal prompt)" also stays — it is what makes
terminal-only sessions and post-app-quit hooks resolve instantly.

### 6. Android parity

Android needs, in this order: the `Bootstrap` find-and-replace fix
(prerequisite), the two numbers, the tier-1 hold timer + routability cap in
`EventBridge`, and the `reason` tag on `PermissionExpired`. The React layer is
shared, so §2a/§3 come for free once `PermissionExpired` carries `reason` on
both transports.

## Implementation order

The Android pieces are order-dependent; the rest is not.

1. **`Bootstrap.kt:996-1008` find-and-replace fix** — must land **before or with**
   the `hook-relay-blocking.js` asset bump. Shipping the asset alone regresses
   every existing Android install from "120s auto-deny" to "permanent wedge".
   There is no way to stage them apart: the asset redeploys unconditionally on
   every launch.
2. Timeout constants, all six sites (§1 table) + WHY comments (§5).
3. `ToolCallState.expired` + the `PERMISSION_EXPIRED` reducer change (§2a) —
   this alone fixes the reported symptom and is independently shippable.
4. `reason` on the expiry event, both transports (§2), plus tier-1 timer and the
   §1a routability cap.
5. Digit rebind (§3) — the smallest-value, highest-risk piece; ship last, behind
   the §3 gates.

## Testing

- **Unit, constants:** assert the literal defaults satisfy
  `app_hold < relay_default < cc_entry_ms` across all six sites. Read the
  literals, not `process.env`-resolved values (§Constraints). Pins the margins
  against a future "tidy".
- **Reducer:** `PERMISSION_EXPIRED` with `reason: 'hook-closed'` + menu present
  leaves the card `awaiting-approval` with `expired: true` and no error text;
  `hasPendingInteraction` and `canRetrySubmit` still report pending; the
  `useSessionAttention` dot stays `'red'`. This is the regression test for the
  reported symptom.
- **Reducer:** `reason: 'app-timeout'` resolves the card without rebinding, even
  when the buffer still shows a menu.
- **Reducer:** expiry with menu absent → quiet resolve, no error text.
- **Parser:** `menuToButtons` consumers reject a menu with any missing
  `optionNumbers` entry, and reject a label set that doesn't confidently match
  the card's buttons — degrade rather than guess.
- **Android:** `Bootstrap.installHooks` on a settings file that already contains
  a `hook-relay-blocking.js` entry overwrites its `timeout`. This is the test
  that would have caught the §Constraints inversion.
- `ipc-channels.test.ts` for the `reason` field on the expiry event (three
  surfaces: preload / remote-shim / `SessionService.kt`).
- `bash scripts/verify.sh` before claiming the desktop half done.

## Open

**One load-bearing assumption is unverified.** The whole tier ordering rests on
"a deny unblocks the turn" — specifically, that responding
`{ behavior: 'deny' }` (tier 1) or exiting 2 (tier 2) on an **AskUserQuestion**
`PermissionRequest` releases CC rather than re-prompting. I confirmed the relay
exits 2 and that CC treats exit 2 as a block, but not CC's downstream behaviour
for this specific tool. If a deny causes CC to re-ask instead of proceeding, the
margins buy nothing and the design needs a different tier-1 action (close the
socket and let CC fall through to its own menu).

**This needs a live check in a dev instance, not a code read** —
`bash scripts/run-dev.sh <worktree> --label "Ask Timeout"`, trigger an
AskUserQuestion, let the ask expire, observe whether the turn proceeds. Flagging
for Destin rather than scripting it (workspace rule on interactive
verification). Everything else in this spec is settled.
