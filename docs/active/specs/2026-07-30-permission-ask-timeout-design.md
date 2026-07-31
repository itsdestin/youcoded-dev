---
status: draft
date: 2026-07-30
repos: [youcoded]
---

# Permission asks that expire silently

## Problem

A chat-view permission ask dies after ~5 minutes with no indication anywhere. The
session looks idle while Claude Code is still blocked waiting for an answer.

Reported symptom: "the session just appears to be working fine from chat view
despite claude still waiting on my input/response to a permission prompt."

### Mechanism

1. `desktop/scripts/install-hooks.js:126` registers the `PermissionRequest` hook
   with `timeout: 300`. `desktop/hook-scripts/relay-blocking.js:22` uses the same
   `300000` ms. The two are **identical**, so they race — the winner varies run to
   run, which is why the failure presents inconsistently (sometimes CC's fallback
   TUI prompt, sometimes a silent exit-2 auto-deny).
2. Whichever fires, the socket closes. `desktop/src/main/hook-relay.ts:68-73`
   emits `permission-expired`.
3. `desktop/src/renderer/state/chat-reducer.ts:1234` flips the card to
   `status: 'failed'` with "Permission request expired — socket closed before a
   response was sent". That is the **only** signal, on a card that has usually
   scrolled out of view.
4. Nothing escalates. `useAttentionClassifier` is mounted inside `ChatView` and
   gated on `visible` (`ChatView.tsx:200`, `useAttentionClassifier.ts:81`), so a
   background session is never classified at all — no banner, no strip badge.
5. `usePromptDetector.ts:11-29` deliberately refuses to render permission menus
   (`SETUP_PROMPT_TITLES` whitelist), because the hook normally owns them. So the
   live TUI prompt is invisible to chat view by design.

### Why AskUserQuestion is the acute case

Claude Code has its own AskUserQuestion clock, and it is off by default.
`askUserQuestionTimeout` is a first-class CC setting — config-panel label
"Question auto-continue timeout", options `["never", "60s", "5m", "10m"]`,
resolved as `t.askUserQuestionTimeout ?? TCe() ?? "never"`. **Default is
`never`.** Verified against the CC binary at
`~/.local/share/claude/versions/2.1.220`.

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
*is* a clamp in that binary, but it is on the SessionEnd aggregate timeout, a
different path.) Arbitrary positive values are honored.

**But `setTimeout` is 32-bit.** Anything above `2147483647` ms (~24.8 days)
overflows and fires immediately. A "make it effectively infinite" value like one
year would silently become an instant timeout — the bug we are fixing, disguised.
24h (`86400000` ms) is comfortably under.

**CC's hook timeout cannot vary per tool.** There is one `PermissionRequest`
entry in `settings.json` and it applies to every tool. Per-tool policy, if ever
wanted, has to live in the relay (which already parses `tool_name` from stdin at
`relay-blocking.js:30-35`). Not needed at 24h — noted so a future session does
not rediscover it.

**Existing installs need no migration — on desktop only.** `main.ts:1288-1307`
`require()`s `install-hooks.js` on every launch of the built app.
`resolveHookDir()` (`install-hooks.js:44-48`) unconditionally `fs.cpSync`s
`hook-scripts/` into `~/.claude/youcoded-hooks/`, overwriting;
`install-hooks.js:129-136` finds the existing `PermissionRequest` entry by index
and replaces it outright. Both the new script and the new settings value land on
the first launch after update.

**Android does NOT update in place — this must be fixed or the Android half
ships dead.** `Bootstrap.kt:992-1018` scans for an existing entry whose command
contains `hook-relay-blocking.js`, sets `prRegistered = true`, and then guards
the entire write behind `if (!prRegistered)`. On any install that already has the
hook — i.e. every existing user — the block is skipped and `timeout: 300` stays
forever. Changing the literal at line 1014 alone accomplishes nothing for anyone
but a fresh install. Android needs desktop's find-and-replace semantics: locate
the existing entry and overwrite it, rather than skipping when present.

**Scope note.** This writes `~/.claude/settings.json`, which the user's terminal
Claude Code sessions also read. The new timeout applies to CLI usage, not only to
YouCoded. Same relay, so behavior stays consistent, but it is not app-scoped.

**No TOS surface.** A documented settings field whose schema explicitly permits
any positive number. No binary patching, no bypassing or auto-approving — the
change makes the permission gate wait *longer for a human*, strictly more
conservative than what ships today.

## Design

### 1. Timeouts → 24h

| Where | File | Now | After |
|---|---|---|---|
| CC hook, desktop | `desktop/scripts/install-hooks.js:126` | `300` | `86700` |
| CC hook, Android | `app/.../runtime/Bootstrap.kt:1014` | `300` | `86700` |
| Relay, desktop | `desktop/hook-scripts/relay-blocking.js:22` | `300000` | `86400000` |
| Relay, Android | `app/src/main/assets/hook-relay-blocking.js:16` | `120000` | `86400000` |

The relay is 24h; CC's entry carries a **5-minute margin** (`86700` s) so the two
clocks are no longer equal. This is deliberate and is the one deviation from "24h
everywhere":

- Equal values are what produced the original nondeterministic race.
- The relay must win. Relay-wins produces `exit 2` → a clean deny → the session
  unblocks. CC-wins kills the hook with no decision, which for AskUserQuestion
  means waiting forever (default `never`) — the wedge we are fixing.

Carry a WHY comment at each site; the margin is invisible otherwise and a future
session will "tidy" it back to equal.

### 2. `PERMISSION_EXPIRED` gains a discriminator

While a hook is pending, CC is showing its own Ink menu simultaneously — that is
why `hook-relay.ts:178-181` (`hasPendingPermission`) exists to block PTY writers.
So a user *can* answer in the terminal today. CC resolves it, the hook dies, and
the card flips to `status: 'failed'` with "Permission request expired" — an error,
on a question that was actually answered.

Fix is a discriminator on an event we already receive. On `PERMISSION_EXPIRED`,
check whether an Ink menu is still on screen (`parseInkSelect` over the buffer;
`usePromptDetector` already polls it):

- **Menu gone** → answered in the terminal. Clear the card quietly as resolved.
  No error text, no banner.
- **Menu still up** → genuine timeout or dead hook. Surface the attention banner
  and a session-strip badge.

This closes the "clear the question from chat view if the user responds in
terminal view" requirement.

### 3. Digit rebind — single-select permission asks only

On expiry with the menu still up, keep the card and swap its buttons from
*respond-to-socket* to *write-this-input*. The mapping already exists:
`menuToButtons` (`ink-select-parser.ts:362-386`) returns `{ label, input: "2" }`
from real parsed `optionNumbers`, with a wrap-correct arrow-key fallback for
menus carrying no digits. It already drives the working "Trust This Folder?" and
"Usage Limit Reached" cards. The card's appearance does not change; the user
cannot tell.

Two hard rules:

- **Match by label, never by index.** CC's option set varies by tool and mode — a
  Bash ask and an Edit ask do not share a middle option. Clicking "No" and
  landing on "Yes, and don't ask again" is a silent misfire in the worst
  direction. Require a confident label match; with no match, degrade to the
  banner. Never guess an index.
- **Bypass the PTY gate — deliberately, with precedent.** `pty-input-gate.ts`
  states the rule: automated writers (submit-retry, chat sends, command sends)
  must consult the gate; "Deliberate menu-driving writes (ToolCard plan keys,
  TrustGate buttons, terminal-view keystrokes) must NOT go through this gate —
  driving the menu is their whole purpose." The rebind writer is category two.
  Working precedent is `ToolCard.tsx:466-473`, where `PlanApprovalButtons` sends
  `DOWN.repeat(optionIndex) + '\r'` straight through `sendInput`.

**Explicitly not attempted for AskUserQuestion.** CC's TUI for it is sequential
(answer Q1, then Q2…), handles multi-select toggling, and per CC's own tool
description "always includes a Skip button and a free-text input box for custom
answers" — affordances our card does not have. Replaying that blind is a state
machine with a wrong-answer failure mode. AskUserQuestion's safety net is the
banner from §2.

### 4. Close the post-expiry stray-Enter hole

Pre-existing bug, reachable today, made far more visible by keeping the card
alive. Every guard that protects the live Ink menu keys off state that goes
FALSE at expiry, while the menu is still on screen:

- `hasPendingPermission` (`hook-relay.ts:182-188`) is socket-based, so it flips
  false the moment the socket closes. It gates the `/reload-plugins` broadcast
  (`main.ts:178-181`, `session-manager.ts:264-271`) — that broadcast can now type
  into a live menu.
- `hasPendingInteraction` (`pty-input-gate.ts`) scans `activeTurnToolIds` for
  `awaiting-approval`; the expired card becomes `'failed'`, so chat sends and the
  `useSubmitConfirmation` retry `\r` are unblocked while the menu is live.

This is precisely the class the 2026-07-09 stray-Enter fix exists to prevent
(`pty-input-gate.ts`, `pty-worker.js:192-202`, `App.tsx:517-525`): a bare `\r`
presses Enter on the highlighted option and silently auto-answers the prompt.

Requirement: whatever state the rebound card takes must still count as pending
for **both** gates, even though the rebind buttons themselves bypass them. The §2
discriminator supplies the signal — menu present means still gated.

### 5. Comment rewrites (not renumbering)

Three comment sites assert the *opposite* of the new design or hardcode the old
value. Changing constants without them leaves landmines:

- **`relay-blocking.js:19-21`** — "Default 300s to match the Claude Code hook
  timeout in settings.json. If the relay times out before Claude Code's hook
  timeout, it exits with code 2 (deny), causing an auto-deny before the user can
  respond." Both clauses now invert: the values are deliberately **not** matched,
  and the relay firing first is the **desired** outcome. Rewrite to explain why
  (relay-wins → clean exit-2 deny that unblocks; CC-wins → hook killed with no
  decision → AskUserQuestion waits forever on its `never` default). Without this
  a future session "fixes" the margin back to equal and restores the wedge.
- **`EventBridge.kt:119,146`** — both hardcode "times out (120s)" in prose.
- **`docs/blocking-relay-handoff.md:44`** — already stale and contradicts shipped
  code today: claims "default 30s" and "relay exits 0 (**fail-open**)", but the
  code is 300s and exit 2 (**fail-closed**). Fix-on-sight or mark historical.

Preserved intentionally: **`exit 2` fail-closed on timeout stays.** Both relay
headers document it (`relay-blocking.js:11`, `hook-relay-blocking.js:10`) and the
new design depends on it — it is what makes relay-wins unblock the session.
Android's "Connection error → exit 0 (fall through to terminal prompt)" also
stays.

### 6. Android parity

Same four numbers, plus the in-place update fix from Constraints above. Android's
relay asset is the worst value in the table today (120s) and must not be left
behind.

## Testing

- Pinning test: expiry with menu present → banner state; expiry with menu absent
  → quiet resolve, no error text on the card.
- Pinning test: `menuToButtons` label-match rejects a menu whose options do not
  confidently match the card's buttons (degrades rather than guessing).
- `ipc-channels.test.ts` if any channel shape changes.
- The four timeout values are constants — a unit test asserting relay < CC entry
  is cheap and pins the margin against a future "tidy".

## Open

None. Design settled 2026-07-30.
