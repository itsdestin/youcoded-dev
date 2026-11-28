---
status: draft
---

# Notify user: status and handoff (PAUSED)

> **Read this first.** Paused 2026-11-09. Destin **rejected** the direction the code on this branch implements:
> the assistant deciding when a conversation is "ready" (blue). A separate session will settle the final design
> with him. The feature will then be **rebuilt on a new branch from master**. Treat `session/user-notify` (app
> and workspace repos) as **reference only**: don't merge or rebase it, and don't treat the code on it as approved.
> On 2026-11-09 it was 196 (app) and 188 (workspace) commits behind master.

Branches (both pushed): `session/user-notify` in `itsdestin/youcoded` (8 commits) and in `itsdestin/youcoded-dev`
(docs and decks). Worktree: `worktrees/sessions/user-notify/`. No card exists for this feature yet. It is related to
card #205 (phone browser approvals), which this branch also built.

## 1. What Destin asked for, in order

1. "Let the model directly tie into the status lights instead of guessing if user attention is needed based on turn
   boundaries": a tool the assistant calls to say a response is ready or a checkpoint was reached.
2. Scope: **not** "needs input" (red stays the app's own). Only ready/checkpoint. The assistant's few-word label goes
   where the session list's status chip says "Working" / "Response ready". He must be able to jump quickly to the message.
3. In the chat, the notification is its own clickable element that glows until clicked. If it is further up, a
   "Jump to notification" button appears.
4. Red must work for browser permission cards and "anything else that blocks the assistant while waiting".
5. The notify tool should "basically entirely replace the existing automatic version", at least for frontier sessions.
   Small local models could keep the automatic blue. "Test reliability/usability."
6. **2026-10-27: rejected item 5's result.** His words: "this seems a bit overcomplicated and potentially unreliable. and
   the ux here would be weird. if i ask a 'short' question, then flip to another tab, i'd just never be notified that i
   hadn't seen the response because its 'short'? and what if i'm actively sitting in a conversation when the assistant
   replies?"

## 2. Decisions on record

### Approved look (review decks rounds 1–4, `docs/active/design/2026-10-26-notify-user/`)

These still stand unless the design session reopens them.

- **Session list:** the dot turns blue and the chip shows the assistant's label (cut to 24 characters with "…") in
  place of "Response ready". An unseen notification's blue **beats green**, so a mid-task checkpoint shows while the
  assistant keeps working. On the phone it looks the same.
- **In the chat:** the outline goes around the **whole reply** holding the notification. The label and message sit in
  a **one-line tab** on the reply's top edge. If the text would wrap, it moves to a **separate nested card at the top**
  of the reply instead.
- **Glow ends** when the person sends a message, rests the mouse on the reply (about 0.6 s; a finger never "hovers"),
  or clicks it. A click is remembered after a reload.
- **"Jump to notification"** button at the **top** of the chat when the notified reply is scrolled out of view.
- **Wording to the assistant:** the notification is shown alongside the reply, so it must not repeat the reply.

### Questions deck, round 5 (`notify-user-r5.questions.*`, 2026-10-26)

| Q | Answer | Still current? |
|---|---|---|
| Q-1 Browser card on the phone | "why cant we answer it there? … build in remote browser approvals like every other approval card" | Yes, built |
| Q-2 Claude Code's on-screen dialogs | All red | Yes, built |
| Q-3 No notify → what color | Gray (trust the assistant) | **No.** Overturned by the 2026-10-27 objection |
| Q-4 Test plan | "you're overcomplicating … just create and run tests" (no week-long trial) | Yes |
| Q-5 Paid evaluator | Yes, with a cap | Never run. Probably moot |

### Proposed after his objection, never answered

The simpler version below was offered on 2026-10-27 and re-offered on 2026-11-09. **He did not say yes.** He said a
separate session would clarify his intent. It is a starting point for that session, not a decision.

1. **The app always shows a waiting reply.** Any reply the person hasn't seen turns the conversation blue, short or
   long, in every session (the pre-project behaviour).
2. **Notify user is an add-on.** When the assistant calls it, its label replaces "Response ready", it can ping
   mid-task, and its reply gets the outline, tab and jump button. If it forgets, the plain blue still appears. Its
   instructions shrink back to one simple line.
3. **If the person is looking at the conversation when the reply or notification arrives, it counts as seen:** no blue
   light, no glow.

## 3. What is built on `session/user-notify` (app repo)

| Piece | Where | Fate under the proposal |
|---|---|---|
| NotifyUser tool, native (label + message; label over 24 characters is cut and the model is told) | `main/harness/tools/notify-user.ts`, `shared/notify-user.ts`, `shared/harness-manifest.ts` (conditional tool), `permission-types.ts` (auto-allow) | Keep |
| NotifyUser tool, Claude Code: a second tool on the per-session `youcoded` MCP server, marked always-loaded | `main/claude-code-mcp.ts`, `session-manager.ts` | Keep |
| Instruction sentence in the main prompt (native doctrine; Claude Code `--append-system-prompt`) | `NOTIFY_INSTRUCTION` in `shared/notify-user.ts`, `prompts/shared-doctrine.ts`, `prompt-assembly.ts` | Rewrite (simpler, no "short answer" carve-out) |
| Who gets the tool: Claude Code always; native only when the model isn't a small local one (`maxToolPresentation !== 'simplified'`) and the session isn't a helper | `harness-session.ts` `notifiesByModel()`, `native-session-host.ts` | Open question |
| **Automatic blue switched off** for Claude Code and capable models (`readyIsTheModels`) | `hooks/useSessionAttention.ts`, `main/session-record.ts` (`byModel`) | **Remove: this is the rejected part** |
| Blue beats green while a notification is unseen; label in the session list (computer and phone) | `useSessionAttention.ts` (`sessionNotesOf`), `session-record.ts`, `App.tsx`, `HeaderBar.tsx`, `SessionStrip.tsx` | Keep |
| In-chat card, outline, tab / nested-card fallback, glow, seen tracking, jump button | `components/NotifyCard.tsx`, `state/notify-fact.ts`, `state/notify-seen.ts`, `styles/notify.css`, `AssistantTurnBubble.tsx`, `ChatView.tsx` | Keep, plus "on screen when it arrives = seen" (not built) |
| **Red for every block:** an open Browser card, Claude Code's on-screen dialog cards ("Usage limit reached", etc.), the app's assistant failing to start | `state/waiting-facts.ts`, `session-record.ts` `waitingCount`, `session-live.ts`, `ipc/browser.ts`, `useSessionAttention.ts` | Keep, independent of the notify design |
| **Phone answers Browser cards** (`browser:answer` is now phone-callable; the rest of `browser:*` stays computer-only) | `components/browser/BrowserAskCard.tsx`, `ChatView.tsx`, `ipc/browser.ts`, workspace `.claude/rules/assistant-browser.md` | Keep (card #205) |
| Tests | `tests/notify-user.test.tsx` (its "who decides ready" block pins the rejected behaviour), `tests/session-waiting-red.test.tsx`, plus small updates to about 10 existing tests | Update with the code |
| Harness evaluator cases (5) and plan | `main/harness/eval/cases/notify-user.ts`, `test-engine/eval-plans/notify-user.json` | Quick-answer / background cases assume the rejected rule; rework |
| Workbench screens | fixtures `bubbles/notify.jsonl`, `notify-jump.jsonl`; screens `chat#notify`, `chat#notify-phone`, `chat#notify-jump`, `chat/switcher#notify` | Keep |

`scripts/verify.sh` passed at the last commit (`bd3a32936`). The branch was never run against current master.

## 4. Test results (Claude Code, real `claude -p` runs)

The runner is saved at `docs/active/design/2026-10-26-notify-user/cc-runner/run.mjs`. It attaches the app's real MCP
server to the real CLI in throwaway folders and counts NotifyUser calls. Its raw result files were lost when the PC
died; the numbers below are the record.

| Instruction given | Should notify (finished / decision / checkpoint) | Quick answer stays quiet |
|---|---|---|
| Tool description only | Sonnet 0/15 | — |
| + first system-prompt sentence | Opus 9/9, Sonnet 6/9 | 6/6 |
| + firmer sentence | Sonnet 15/15 | Sonnet 0/5 (noise) |
| + current `NOTIFY_INSTRUCTION` | Opus 11/12 (one duplicate), Sonnet 12/12 | 8/8 |

Findings that still matter for any redesign:

- Claude Code hides MCP tools behind its tool search unless the tool carries `_meta: {'anthropic/alwaysLoad': true}`.
- The tool's description alone does not make a model call it; one sentence in the system prompt does.
- "Waiting on background work" can't be measured with `claude -p`: print mode waits for the work to finish.
- The paid native evaluator run was never made. The dry run estimated up to ~$68, which is an over-estimate.

## 5. Not done / open for the design session

- Destin's final intent for the whole feature. Above all: who owns blue, and what "seen" means while he is watching.
- "On screen when it arrives counts as seen" (not built).
- Whether small local models get the tool at all once misses cost nothing.
- **Red gaps not covered:** pop-ups the app can't read (a menu the person opened would wrongly chime red), and extra
  questions from Claude Code's connected tools ("MCP elicitation", which has no card at all). No card filed for either.
- Two small red-light fixes from the Part 1 audit were **not** done: a helper's ask flickers off the phone for ~3 s when
  the parent reply ends; a password ask arriving before its command card is dropped on the computer.
- Android build not checked (the phone path was tested via the remote browser only).

## 6. Part 1 audit: what blocks the assistant and whether it shows red (2026-10-26)

Code comments on the branch cite this as "notify-user plan Part 1".

| Waiting on you | Red before | On the branch |
|---|---|---|
| Permission, question, plan approval, password, admin approval, helper asks | Yes | Unchanged |
| Browser asks (site permission, final step before buy/send/submit, home-network address, sign-in hand-off, no browser) | No: read green, and the phone never saw the card | Red on both screens; phone can answer |
| Claude Code's on-screen dialog cards (usage limit, flagged message, switch model, setup, unknown numbered menus) | At most amber | Red |
| The app's own assistant failing to start | No | Red |
| Pop-ups the app can't read | At most amber | Not done (see §5) |
| MCP elicitation | Not handled | Not done (see §5) |
