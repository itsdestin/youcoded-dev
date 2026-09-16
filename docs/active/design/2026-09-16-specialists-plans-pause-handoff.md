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
