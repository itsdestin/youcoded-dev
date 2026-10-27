---
status: draft
---

# Notifications: red for every block, and the assistant decides "ready"

Branch `session/user-notify` (youcoded + workspace). Follows the approved notify-user decks (rounds 1–4,
`docs/active/design/2026-10-26-notify-user/`).

## Part 1: red must mean "the assistant is waiting on you", every time

Audit 2026-10-26 (every path checked in this branch's code). Today red is set ONLY by permission-style
asks (hook `PermissionRequest`/`PasswordRequest`) and by stalled / error / stopped states.

| Waiting on you | Red today? | Change |
|---|---|---|
| Permission, question, plan approval, password, admin approval, helper asks | Yes, computer and phone | none |
| **Browser asks** (site permission, "final step" before buy/send/submit, home-network address, sign-in hand-off, "no browser installed") | **No.** Reads green (the Browser tool looks busy); the phone never sees the card | Count an open browser card as a waiting ask on both screens. On the phone: red, with a card saying "Open this conversation on your computer to answer" (the Browser runs on the computer) |
| **Claude Code's terminal cards** (Usage limit reached, Message flagged, Switch model?, setup dialogs, unknown numbered menus) | **No.** At most amber | Count an unanswered card as waiting on both screens |
| Pop-ups the app can't read (keyboard taken, no card) | No, at most amber | Red while one is up (the app already detects them to block sending) |
| Extra questions from tools Claude Code connected ("elicitation") | No, and not handled at all | Out of scope here; filed as its own item (needs a card first) |
| The app's own assistant failing to start (Retry / Continue) | No | Red |
| Small: a helper's ask flickers off the phone for ~3 s when the parent reply ends; a password ask arriving before its command card is dropped on the computer | — | Fix both |

Where: `hooks/useSessionAttention.ts` (computer), `main/session-record.ts` `summary()` (phone),
`main/assistant-browser/browser-service.ts` `ask()` (publish the open card as a session fact).

## Part 2: the assistant decides when a conversation is "ready"

**Who gets it.** Model-driven for every capable session: all Claude Code sessions, and native sessions
whose profile is `maxToolPresentation: 'full'` (cloud models, big local models). Small local models
(`'simplified'`) keep today's automatic blue: they are unreliable tool callers, and the tool would cost
them context.

**What changes for capable sessions.** The automatic "finished while you were away" blue goes. Blue
appears only when the assistant calls Notify user. Red, amber and green are unchanged (app-owned).

**Tool instructions get one more rule.** Since nothing else will tell the person, the model must notify
whenever it stops and hands the conversation back: finished what was asked, or needs a decision it is
asking for in its reply. Not when it stops only to wait for its own helpers or background work, and not
for a one-line answer to a quick question. (Exact wording is tested below before it ships.)

**Safety net while testing (proposed):** a hidden log line per reply-end, "auto-blue would fire: yes/no;
assistant notified: yes/no", so real use measures the replacement without anyone keeping score by hand.

## Part 3: how we test it

### Expected experience (what "working" means)

| # | Situation | You expect | Failure looks like |
|---|---|---|---|
| E1 | Long task, you switch away, it finishes | Blue + its label within seconds of finishing | Gray: you never learn it finished |
| E2 | Long task, checkpoint mid-way, keeps working | Blue + label while still working | Green only (missed) or a ping per step (noise) |
| E3 | It stops to wait on its own helpers / background work | Stays green or gray, no blue | Blue with nothing for you to do |
| E4 | Quick question, you're watching | Nothing changes (you're there) | — (a notify here is harmless but counts as noise) |
| E5 | Quick question, you switched away | Blue + label | Gray (missed) |
| E6 | It asks you something in its reply and stops | Blue + a label like "Need your pick" | Gray, or the question buried with no ping |
| E7 | Permission / question / browser card / Claude Code dialog | Red (app), chime | Green or amber |
| E8 | Error or stopped | Red / amber (app) | — |
| E9 | Label and message quality | ≤ 3 words; one sentence that does not repeat the reply | Long labels (cut with …), message restating the reply |
| E10 | Small local model session | Automatic blue, exactly as today | Any change |

Scores: **missed** (E1/E2/E5/E6 with no notify), **noise** (notify with nothing for you to act on, or
more than one per reply), **quality** (E9).

### Four ways to measure, cheapest first

1. **Automatic tests (free, already partly built).** The app's side: each row's lights, labels, card,
   glow, jump button, phone summary, small-model fallback. Runs in every check.
2. **Scripted conversations in the test copy (free; uses your account's normal usage).** One prompt per
   row E1–E6 and E9, run in a Claude Code session and an app-assistant session; I record expected vs
   actual in a table. About 20 conversations.
3. **The harness evaluator (paid, only with your OK).** The same rows as automated cases against several
   cloud models (Claude, GPT, Gemini via OpenRouter) and one big local model, 3 repeats each, scored
   missed / noise / quality. Free practice run first; the real run has a spending cap you set.
4. **A week of your real use (free).** The log line from Part 2 compares "would auto-blue have fired"
   with "did the assistant notify" on every reply you get. At the end: a short report of misses and noise.

**Ship rule (proposed):** capable sessions switch over only if misses ≤ 1 in 20 replies that needed you
and noise ≤ 1 in 10 notifications, in both 3 and 4. Otherwise improve the instructions and re-run.

## Order

1. Part 1 (red gaps): independent, ship-worthy on its own.
2. Part 2 behind the log, with the stronger instructions.
3. Tests 1–2 now; 3 if you approve the spend; 4 over the following week.
4. Your call on switching over, from the numbers.
