---
date: 2026-09-16
status: active
type: design
topic: specialists plans — automatic recovery and handing pauses to the assistant (deck 6 follow-up)
sources:
  - docs/active/design/2026-09-05-specialists-plans/specialists-plans.review6.answers.json
  - decisions 8–13 in the build ledger (worktrees/specialists-plans/.superpowers/sdd/controller-context.md)
builds-on: docs/active/design/2026-09-07-specialists-plans-backend-design.md
---

# Plans — who deals with a pause

Destin's direction (review deck 6, R6-3/R6-5/R6-6/Q6-3, then chat): handle the obvious cases
automatically where safe, hand the rest to the assistant, which recommends what to do, and only
leave to the user what genuinely needs them. The user still presses every button that spends money
or restarts work; the assistant never adds budget or resumes by itself.

## 1. Routing by pause kind (revision 2, after review 1)

Every native tool declares `effect: 'read' | 'local' | 'external'` beside its definition (a test
fails when one is missing). `read`: Read, Glob, Grep, Skill, model search, BashOutput, WebSearch. `local`: Write, Edit,
TodoWrite, KillShell. `external`: Bash, WebFetch, AskUserQuestion, SendUserFile, SendUserLink, every
MCP tool, and anything unclassified. The executor's own `PLAN_READ_ONLY_TOOLS` list is deleted.

| Kind | Route |
|---|---|
| `launch-failed` from a provider/start error | **Auto:** retry once. Never for a launch *refusal* (it would repeat). |
| `specialist-error` | **Auto:** retry once, unless the specialist's transcript ends in an unanswered `external` call (then assistant). |
| `invalid-report` | **Auto:** once — a report-only turn on the same specialist session: a dedicated "send your report in the required form" message, tools disabled for that turn, a fixed 2,000-token allowance funded from what the failed attempt left unspent. Less than that left → assistant. |
| `unknown-request` (cut off mid-request, no action ran) | **Auto:** re-run once. |
| `unknown-outcome`, tool effect `read` | **Auto:** re-run once. |
| `unknown-outcome`, tool effect `local` | **Auto:** restart once with the check-first brief naming the tool. |
| `unknown-outcome`, tool effect `external` (incl. Bash) | **Assistant.** |
| `local-pool` | **Assistant** (the pool check is fixed for this plan; waiting cannot help). |
| A launch *refusal* (budget route switched off) or a specialist definition/model/price drift | **Assistant** — never retried. |
| `iteration-cap`, `budget`, `ceiling-shortfall`, `plan-limit`, `budget-refused`, `unexpected-error` | **Assistant.** |
| A second failure after an automatic retry | **Assistant.** |
| `specialist-stopped` (the user stopped a specialist) | **User:** Stop · Continue. |
| Interrupted by an app restart | **User:** Continue (signed R9). |

- **Automatic recovery never halts the wave.** The failed member is retried inside `runWave`; its
  siblings keep running. Only routes that end at the assistant or the user halt and settle.
- Before ANY automatic restart the same routing check runs on the specialist's transcript: an
  unanswered `external` call sends it to the assistant instead.
- **One automatic recovery per (step, iteration, item, cause)**, journalled with the fence before the
  relaunch, so a crash can't multiply it. Each retry reserves budget normally; if it can't be
  funded, it becomes a budget pause → assistant.
- The specialist's row shows it restarted ("Retried after an error"); the card stays running.

## 2. Handing a pause to the assistant (revision 2)

1. **Before** the settle write, the host checks the conversation can take a notice: it is live and
   its deliveries are not held (the user has not pressed Stop on it). If not, no handoff is made and
   the card shows the default buttons. If it can, the settle write records
   `paused.handoff = { id, state: 'pending', at }` (an unguessable id per pause).
2. The card is **deactivated**: greyed, no buttons, "The assistant is looking into this."
3. After the write, the host queues the notice, tagged with the handoff id so it can be withdrawn.
   Plan notices are never queued while deliveries are held (other notice kinds keep today's
   behaviour). If queueing fails anyway, the handoff is cleared at once.
4. The notice is a pinned template: plan title, step label, what happened (kind), spent and limit,
   the minimum top-up when there is one, the handoff id, the allowed actions for this kind, and the
   provider/tool detail wrapped as untrusted content and capped at 500 characters. No specialist
   report text is ever included.
5. Notice turns get a turn id like user turns, so the revise path can link.
6. The assistant answers one of three ways:
   - `recommend_plan_action({ planId, handoffId, action, addTokens?, message })`. Valid only for
     this conversation's plan, whose pending handoff id matches. Allowed actions by kind:

     | Kind | Allowed |
     |---|---|
     | `budget`, `ceiling-shortfall` | `add_budget` (≥ the minimum, ≤ 4× the plan's limit), `stop` |
     | `plan-limit`, `budget-refused`, `iteration-cap`, `local-pool`, a launch refusal, a drift | `stop` (a fix is a revised plan) |
     | `unexpected-error`, `unknown-outcome` (external), a failed retry | `continue`, `stop` |

     A refused recommendation tells the assistant why and to give its advice in chat instead.
     The minimum for `add_budget` is the one the service computes today, and a test pins that
     adding at least that amount is always followed by a Continue that runs.

     `message` is capped at 280 characters. On success the handoff becomes `answered` with the
     recommendation.
   - **Revise** with `propose_plan`. The handoff stores a pending revision keyed by this plan (not
     the single journal slot; a Comment on another plan can't overwrite it). When the replacement
     from that notice turn commits, the same write links it — and stops the old plan as revised
     only if the old plan is still `paused` with the same handoff id; otherwise the new plan stands
     alone. **Any `propose_plan` made during a plan notice turn never auto-approves**, whether or not it
     links (the rule follows the turn, not the pending revision).
   - **Just explain.** The handoff becomes `answered` with no recommendation when the turn that
     delivered THIS notice ends — on success, error or Stop — not when some other turn ends.
7. The card **reactivates**:
   - With a recommendation: the assistant's message, the recommended action as the filled right
     button (Add budget pre-filled), and Stop as the light button on its left.
   - Without one: `budget` and `ceiling-shortfall` get Stop · Add budget; every Stop-only kind in the
     table above gets Stop only; everything else gets Stop · Continue.
8. The user presses the button; nothing resumes or spends on the assistant's word.

**Never stuck, never stale:**
- Pending handoffs are cleared (to `answered`, no recommendation) when the user presses Stop on the
  conversation, when the notice turn fails to deliver, when the conversation is destroyed or taken
  over, on app restart, and after a 10-minute backstop. **Every clear also withdraws the handoff's
  undelivered notice**, so a stale notice never reaches the assistant.
- The backstop only runs until delivery starts; once the notice turn has begun, the
  "turn that delivered it ended" rule decides.
- A user Continue, Add budget or Stop while a handoff is pending (from another window or a phone)
  supersedes it: the service accepts it, marks the handoff answered, withdraws an undelivered
  notice and deletes the handoff's pending revision. A later recommendation with the old id is
  refused.
- Stopping the plan withdraws its queued notice if it has not been delivered yet.
- Downgrade note: the strict journal schema means an older dev build will quarantine a journal
  carrying handoff fields. Plans have not shipped, so only development machines are affected.

`recommend_plan_action` is offered exactly where `propose_plan` is, never to specialists, and its
description says it is only for answering a plan pause notice. Its cost is ordinary conversation
cost. Phone and remote viewers see the assistant's reply; their card stays read-only as today.

## 3. Card, chip and dot changes (decisions 8–12)

- Approximate limits: a tilde before the token number ("Up to ~42,000 tokens"); the explanatory
  sentence is removed.
- Button order: Approve rightmost, Comment to its left; every filled/light pair follows the new
  design-guide rule (filled button centered full-width or right-aligned; light button on the left).
- The design guide gains that rule.
- A specialist waiting on the user (ordinary or plan) lights the conversation's red dot with the
  alert sound.
- The Specialists chip also lists a plan's working specialists, grouped under the plan. Each plan is
  a collapsible one-line row (title, "3 of 5 steps", "1 needs you" when asking) that expands to its
  specialists.
- Phone copy stays "Plans aren't available on the phone yet."
- "The assistant isn't available right now." + Retry replaces the runtime wording (already built).

## 4. What does not change

Signed rows R1–R18 stand except where deck 6 amended them (R6 answers are the sources). The
restart → Continue rule, budgets as hard stops, settle-before-visible, and no finished step
re-running are all unchanged.

## 5. Tests the build must add

(Automatic recovery is keyed per step, iteration, item and cause. Revision 2 adds: tool effect declared for every tool; no wave halt on auto-retry; recovery key without an attempt; handoff id validation; notice-turn scoping; clears on hold/failed delivery/destroy/backstop; handoff-tied proposals never auto-approve; revision keyed by plan; untrusted wrapping; user action supersedes a pending handoff.)

- Routing per kind (auto / assistant / user), including the Bash and unclassified-tool cases.
- One automatic recovery per step, iteration, item and cause, surviving a crash between the journal
  write and the relaunch.
- Handoff lifecycle: notice queued, card deactivated, recommendation validated (every refusal),
  revise via `propose_plan` links correctly, "just explain" reactivates with defaults, held
  deliveries and closed conversations skip the handoff, restart clears a pending handoff, and Stop
  during a pending handoff.
- The assistant can never resume or add budget by itself.
- Card states: deactivated, recommended (each action), and defaults.
- Chip grouping and collapse; the dot and sound for ordinary and plan specialist asks.

## 6. Revision 4 — the handoff is on request only (Destin, 2026-09-17)

After review deck 7 ("a lot of messages/cards/responses for a straightforward action"), Destin
chose: **no automatic handing off. A button instead.** This replaces §2 steps 1–3 as the trigger;
everything else in §2 (the notice, `recommend_plan_action`, revise path, clears, supersession,
never-auto-approve for notice turns, the per-kind action table) stays.

- A pause never hands off by itself. Every **paused** card (all pause kinds, including the
  user-stopped state) shows its reason and its default buttons from §2 step 7 at once, plus
  **Ask the assistant** as the light button on the far left. A restart-**interrupted** card is
  unchanged (Continue/Stop, no Ask): its journal state has no pause to hold a handoff (review 4-1).
  The button is hidden when the conversation's model cannot use tools.
- Pressing it calls a new plan action, `plans:ask-assistant` on all five surfaces (Android's
  `PlansBridge.kt` id list answers typed `unsupported`; update `PLAN_REQUEST_CHANNELS`,
  `PlanRequestHost`, preload, remote-shim, remote-server, ipc-handlers, the workbench mock rows,
  and the "exactly seven" guards in `plans-transport.test.ts` and `ipc-channels.test.ts`).
- The service registers the handoff in the host's in-memory map first, then checks INSIDE the
  journal mutation that the plan is paused and has no pending handoff, and records
  `paused.handoff = pending` in that same write; the host then queues the notice (§2 steps 3–5).
  A second press (another window, the phone, a double click) is refused by that in-write check;
  the card also ignores clicks while its request is in flight. Liveness and held deliveries are
  checked before the write. Refusals are ordinary action errors with the real reason.
- Asking again after an answered handoff replaces the earlier recommendation and drops its
  revision link.
- `resume`, `addBudget` and `stop` read the handoff id to withdraw INSIDE their own start/stop
  write, not from an earlier read (review 4-2).
- Restart recovery's stale-handoff clear re-checks inside its mutation, so a handoff registered
  meanwhile is kept (review 4-4).
- The notice text is the transcript text, as today. Renderers replace the single hide rule with a
  render kind — `hide` / `ask-line` — used identically by the chat view, the buddy feed and
  previews: a plan notice renders as one plain line on the user's side, "You asked the assistant
  about this plan." (no edit/resend). It appears when the notice is delivered; a withdrawn notice
  shows no line. No new transcript event and no history-only note.
- The notice wording becomes "The user asked you about this paused plan." plus the existing facts.
- If the notice waits behind a reply in progress, the greyed card says "The assistant will look at
  this after its current reply." If the backstop or a failed notice turn clears it, the card shows
  an error line with Retry (Retry asks again), per the error standards, instead of silently
  returning its buttons.
- While pending the card is deactivated as before; the §2 clears, backstop and supersession apply
  unchanged. The button is not offered while a handoff is pending.
- The routing function's `assistant` outcome now only means "Stop-only / Continue defaults per the
  table"; nothing is queued at pause time — the executor's pause-time `prepare`/`prepareHandoff`
  hook and its `revisionTurnId` stamp are removed. Automatic recovery (§1) is unchanged.
- An eighth request channel is added; the "exactly seven channels" constraint from the backend
  design is superseded by this decision.

## 7. Revision 5 — the usage limit does not re-count cached tokens (Destin, 2026-09-17)

Destin: "we should not be re-counting cached tokens". Amends backend design §4 for plan children.

- **Counted usage per request** = uncached input + cache-write input + output (cached reads are
  excluded). Providers that report no cache breakdown count their whole input, as today; local
  engines use their reported reuse count when present.
- **Dollars are unchanged:** priced from real usage with the cached-read rate.
- **Reservation before sending:** if the same specialist's previous request completed within the
  provider's cache window (conservatively 4 minutes) and the conversation prefix is unchanged,
  reserve only the new part of the prompt (bound of the bytes added since that request) plus the
  output cap; otherwise reserve the full certified bound as today. The certified-bound breach check
  still compares reported TOTAL input against the full bound (a separately stored value), never
  against the smaller reservation.
- **A cache miss after a small reservation** is charged at its real counted usage even if that
  exceeds the reservation; the plan-wide check then pauses before any further request once the
  limit is passed (same mechanism as the soft ChatGPT limit). This is the only overshoot path on
  capped routes, bounded by one request's uncached prompt per running specialist.
- **Ceiling and minimum Add budget:** the plan ceiling stays the approved worst case. The minimum
  Add budget uses the same reservation rule, so after a short pause it asks for far less.
- **Card:** unchanged wording; the numbers now track new work.
- Tests: warm-cache continue reserves and charges only the new part; cold continue reserves the full
  bound and releases the unused part; a cache miss after a small reservation is charged and pauses
  the plan before the next request; breach check still uses the full bound; no-cache-breakdown
  providers count full input; local engine reuse counted.
