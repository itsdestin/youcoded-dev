# Specialists and turn delivery — investigation, 2026-09-09

Read-only. Nothing in the app was changed. Sources: the native runtime code in the shared
checkout, 254 native session transcripts modified since 2026-09-06 (59 conversations, 195
helper sessions), and the public prompts/docs of Claude Code, Codex CLI, Hermes Agent and Pi.
Supporting data: `specialist-usage-report.md` and `analyze.py` in this folder.

## 1. Why a new answer starts by itself after you press Stop (or after a final answer)

**What happens.** When a helper (specialist) or a background command finishes, the app writes
a *fake message from you* into the conversation ("[Background specialist finished] …" or
"[Background command … finished]") and starts a full new model turn on it. It only does this
when the assistant is "idle", and idle is defined as "no turn running". Pressing Stop ends the
turn, so Stop *is* the moment the app was waiting for. The same code runs whether the turn
ended normally, with an error, or because you stopped it. Nothing in the app knows you just
asked for quiet, and there is no setting to turn this off.

Code: `native-session-host.ts` — `drainDeliveries` runs unconditionally at the tail of
`runTurns` (~line 3494); `isIdle` (~4120) is `!inFlight && queue.length === 0`;
`kickIdleDeliveryPass` (~1480) spins up an empty turn just to reach that tail;
`interrupt()` (~3905) never touches the pending-delivery queues. `runNotice` in
`harness-session.ts` (~1694) makes the fake message a real turn on purpose.

**How often it bit you (last 12 sessions and the wider set).**

| Measure | Count |
|---|---|
| Messages the app injected vs. messages you typed (last 12 sessions) | 72 injected / 55 typed |
| Finished answers immediately followed by an auto-injected turn | 52 of 326 |
| Stops followed within 60 s by an auto-injected turn | 10 of 15 |
| Chains of auto-turns with no input from you | 45 chains, longest 9 turns |

Background *commands* finishing at the same time are merged into one turn; helper reports are
one turn each. Stop halts foreground helpers but deliberately leaves background helpers and
background commands running, so their reports arrive later and wake the assistant again.

**Other harnesses.** Codex (current version) puts a finished helper's result in a mailbox and
explicitly does *not* start a turn; the model sees it on the next turn. Hermes behaves like us
(a completion restarts an idle agent, even after Ctrl+C), but its delivery text says "You may
have moved on since dispatching it." Pi runs helpers in the foreground only, so Stop kills them
and the question never arises. Claude Code's docs don't say what happens after Esc.

**No test pins the observed behaviour** (delivery immediately after an interrupt). Two tests
pin the pieces separately: "the queue survives Stop" and "delivery happens at an idle boundary".

**Design options** (for your decision, not done):

A. *Stop means hold.* After a Stop, park every finished report; hand them to the model as
   context with your next message. Normal end-of-turn keeps today's behaviour.
   Pro: Stop finally means stop. Con: if you stopped and walk away, a helper's report waits
   silently (its card still shows finished).
B. *Hold after any finished answer too.* Reports never start a turn on their own; they ride
   in with your next message, and the helper card shows "report ready".
   Pro: the assistant never talks unprompted. Con: "tell me when the build finishes" and
   "keep going after the reviewer reports" stop working unless the model asked to be woken.
C. *Keep auto-delivery but change the message.* Tell the model it may have been stopped and
   to reply in one line or not at all if the report no longer matters.
   Pro: tiny change. Con: still a new turn after Stop; relies on the model behaving.

Recommendation: A now, plus C's wording for the normal case. B is the Codex model and worth
considering later with an explicit "wake me when done" flag on the Task tool.

## 2. How the models actually used specialists (59 conversations, 2026-09-06 → 09-09)

| Task-tool calls | 565 = 202 spawns · 179 steers · 176 resumes · 4 interrupts · 4 refused |
|---|---|
| Spawns background / foreground | 128 / 74 |
| Helper types | worker 81 · reviewer 72 · explorer 46 · researcher 3 |
| Started several helpers in one step | 4 times out of 565 calls |
| Most helpers truly running at once | 4 (the cap) in 3 sessions; 1–2 in most |
| Steers that were "hurry up / report now / status?" | 129 of 179 (72%) |
| Gap between nags to the same helper | median 52 s |
| Worst-nagged helper | 14 steers |
| Tokens spent by helpers | 38% of all input tokens (273M of 712M), lower bound |

**Patterns.**
- Steering is the main verb, not spawning. The model starts one helper, corrects it 20–40 s
  later, then nags every minute until it re-calls Task with the task_id to *pull* the report
  instead of waiting for delivery. In the worst session only 12 of 30 helpers reported through
  the normal channel.
- Worst sessions by calls per message from you: 127 calls on 3 messages (sync simplification,
  gpt-6-astra); 36 on 1 (cache-efficiency handoff, 4 h unattended); 53 on 6 (workspace-sync
  plan, 11.5 h, five of your six messages were "continue"); 113 on 15 (buddy-floater fixes).
- The model almost never fans out in parallel; it serialises worker → reviewer → fix → re-review
  rounds, 2–4 rounds per step, with the parent's own context still reaching 200k.

**Failures (58 events).**
- Helper hit its step limit without reporting: 16. Answered by a resume (which often hit the
  limit again) or a near-identical re-spawn (19 re-spawns after failures).
- "Failed to process successful response": 7 (2 tool errors + 5 background failures). This is
  a harness/provider-adapter error, not the model, and deserves its own bug.
- Network (connect timeout, DNS): 7. ChatGPT weekly limit: 2. Provider 503 / stall: 2.
- Refusals: writer already running 4, unknown task_id 3, garbage in the `model` field 2
  (`"budget}},{"`), 4-helper cap 1.
- Two long sessions have **no turn-complete records at all**, so their parent usage is
  unrecorded (their helpers alone used 99M tokens). Likely a logging bug when a turn is
  interrupted repeatedly; worth a separate look.
- The three stops at 03:02 on 09-09 hit three sessions within 15 s: an app-wide stop, not you.

## 3. Our guidance vs. the others

**What our model is told.** The system prompt says nothing about specialists except "a helper
reporting back, not a new request". Everything lives in the Task tool text, which lists the
four helpers, how to write a brief, and how to steer/resume. It contains:
- no "when to delegate" and no "when not to";
- "Set true for anything long — you keep working" on the background flag, with no counterweight;
- nothing about not re-doing delegated work, not nagging, or ending the turn while waiting;
- no mention of the limits (4 at once, 1 writer, 30 per conversation, no nesting) until a call
  is refused;
- roster lines that say what a helper *has*, not when to pick it;
- nothing telling the model a helper's "tests pass" is a self-report to verify.

**What the others say (verbatim gist).**
- Claude Code: delegate "when answering would mean reading across several files — you keep the
  conclusion, not the file dumps"; "for a single-fact lookup … search directly"; "once you've
  delegated a search, don't also run it yourself"; launch independent agents in one message.
- Codex: "Do not spawn sub-agents unless the user or AGENTS.md explicitly ask … Requests for
  depth, thoroughness, research … do not count as permission"; "keep work local when tightly
  coupled, urgent, or likely to block your immediate next step"; tells the model the number of
  free slots; on depth refusal: "Solve the task yourself."
- Hermes: "USE FOR: reasoning-heavy subtasks, work that would flood your context…"; "DO NOT USE
  FOR: a single tool call; mechanical work; tasks needing user interaction"; "finish whatever
  does not depend on them, then give a one-line status and END YOUR TURN. Never wait or poll";
  "child summaries are SELF-REPORTS, not verified facts".
- Pi: no guidance in the tool; its author calls mid-session context-gathering helpers and
  parallel feature workers anti-patterns and keeps only code review.

**Verdict.** Yes, our guidance is both less defined and more permissive than every harness
with a real tool description. Ours is the only one that (a) says nothing about when not to,
(b) actively encourages background launches, and (c) offers a steer verb with no rule about
using it sparingly. The transcripts show exactly those three gaps: spawn eagerly, then nag.

## 4. Proposed changes (not started)

1. **Delivery after Stop** — option A above, with a pinning test for "no injection after
   user-interrupt until the next user message". Files: `native-session-host.ts`
   (`interrupt`, `drainDeliveries`, `kickIdleDeliveryPass`).
2. **Delivery wording** — the "[Background specialist finished]" preamble tells the model the
   user may have moved on or stopped it; reply briefly or not at all if it no longer matters.
3. **Task tool text** (`tools/task.ts`): a "do it yourself first" default; a do-not-delegate
   list; background only when there is other non-overlapping work; never re-do delegated work;
   when nothing is left, say what is running and end the turn; state the limits up front.
4. **Steer rate limit in the harness**, not just prompt text: refuse a steer to the same helper
   within ~2 minutes of the last unless the helper is flagged stuck, with a refusal that says
   "wait for the report". Prompt rules alone did not stop Hermes-style nagging elsewhere.
5. **Roster lines say when to pick** (`specialists/builtins.ts`): explorer for sweeping many
   files when only the conclusion matters; reviewer for a fresh-eyes check; worker for a
   bounded change already scoped; researcher for sourced external facts.
6. **Self-report caveat** in the finish rules (`prompts/shared-doctrine.ts`): check the part
   that matters before telling the user a delegated change works.
7. **Bugs to file**: "Failed to process successful response" (7 events); long interrupted
   sessions writing no turn-complete records; garbage in the Task `model` field accepted by
   the schema.
8. **Harness evaluator**: the original specialists spec already lists "over-delegation of
   trivial work" as a battery case. A real run costs money and is Destin's call; a dry run is
   free.
