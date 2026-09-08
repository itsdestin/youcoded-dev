---
date: 2026-09-07
status: active
type: design
topic: specialists stage two — plan authoring, validation, execution, journaling, hard budgets, and transport
contract: docs/active/design/2026-09-05-specialists-plans/specialists-plans.contract.json
---

# Specialists plans — backend technical design

## Fixed product contract

This design implements the signed eighteen-row plan-card contract without changing its UI. Plans are distinct from duties; every child is called a **specialist**. The `propose_plan` tool is offered on every cloud model and on known local models in the 9B capability class or above. Local execution uses at most four simultaneous specialists, all sharing one configured context pool; each restarting child pays a fresh prefill. A paused plan has no process, timer, or loaded child behind it, so waiting costs nothing. Resume never repeats a finished step and reconstructs its inputs from the journal.

## 1. Plan document and validator

Create a versioned, model-facing `PlanDocumentV1` separate from the renderer's mutable `PlanView`:

The production schema is the exact nested, discriminated schema exercised by the completed 2026-09-04 grammar probe: a strict versioned document containing 1–20 top-level steps; `map`, `verify`, and `combine` variants with their kind-specific fields; and `repeat { maxIterations, until, steps }` with a bounded non-recursive body. `map` carries 1–4 independent briefs; `verify` requires non-empty backward result references and 1–4 check briefs; `combine` requires non-empty backward result references and exactly one synthesis brief; `repeat` contains 1–4 non-repeat steps and may not nest another repeat. Every executable leaf carries one live specialist id and an integer per-child token allowance inside configured minima/maxima.

The validator additionally enforces non-empty capped labels/briefs, unique ids across the whole document, backward-only references, no cycles, and a small explicit repeat cap. It resolves every specialist against the live roster and derives fan-out and the maximum-attempt ceiling; model-supplied status, cost, child ids, timestamps, and journal data are impossible inputs. Keeping the production shape byte-for-byte aligned with the probed schema preserves the existing 9B grammar evidence; the probe is not rerun.

`propose_plan` is conditionally attached beside `Task`, but with a separate capability gate: every selectable cloud model qualifies; local sessions qualify only when discovered model information classifies them as big-local (9B+) and tool-capable. The cloud eligibility function is pinned against the complete selectable catalog/provider surface, including constrained tool-call authoring; a future cloud row explicitly lacking that path may not remain plan-eligible by accident. Until the concurrent model-information branch supplies the local class field, the adapter recognizes only reviewed `KNOWN_MODELS` entries at or above the 9B boundary and fails closed for unknown local models. The tool is absent from specialist children, preserving depth-by-omission.

The harness watches the start of a `propose_plan` tool-input stream and emits the ordinary tool-use shell plus a transient `writing` projection keyed by that stable tool id; its elapsed clock is renderer-local and spends nothing. A valid call atomically replaces it with the durable proposal before returning its acknowledgement. Malformed output gets one repair turn containing only validator issues and the same schema. Validation failure, repair exhaustion, interruption, truncation, or session restart pairs the tool use with a terminal tool result and a failed/stopped projection, so no writing spinner can become orphaned.

## 2. Journal and state ownership

Add `PlanJournal`, the sole writer for `sessions/<native-slug>/<parentId>.plans.json`, through `NativeHome.mutateJson`. Its versioned records contain:

- immutable validated document and proposal `toolUseId`;
- status, sequence number, revision links, approved ceiling, actual usage, and optional pause reason;
- per-step status and, for every attempt, child id, spawn-time execution manifest, base/added/reserved/spent token amounts, durable phase (`prepared | request-sent | response-persisted | committed | ambiguous`), terminal status, report text/path, and completion marker;
- an execution manifest frozen at proposal time: provider/model binding, conservative pricing snapshot, specialist definition fingerprint, and permission-envelope fingerprint;
- an owner lease with unguessable instance id, process identity/heartbeat, monotonically increasing epoch, and fencing token only while an executor is actively advancing the plan.

Lease acquisition and takeover are compare-and-swap mutations. A demonstrably live foreign owner remains authoritative; takeover requires expiry plus failed liveness proof or an explicit user-forced recovery. Every allowance reservation, child launch, phase transition, completion commit, and budget mutation verifies the current fence and rejects stale executors.

`PlanJournal` uses a strict raw-file read rather than `NativeHome.readJson`: absent, valid, malformed JSON, and unsupported version are distinct. Malformed/unsupported bytes are preserved in a quarantine copy and block every mutation; they project as a visible failed plan with the real validation detail and are never initialized over.

Every valid mutation is atomic and emits one `plans:event` containing the new `PlanView`. Plan views are projections from journal truth; the renderer never synthesizes lifecycle state. On startup/resume, a stale `running` record with no valid owner becomes `interrupted`, and no executor starts until Continue. Completed attempt reports are immutable cached inputs.

A Comment atomically stops the old unstarted proposal as revised, records a trusted pending-revision token keyed by the parent session and queued comment turn, and queues that user-visible follow-up asking the assistant to call `propose_plan` again. `PlanService`, never model input, attaches and consumes `revisionOf` only when a valid replacement from that turn commits. A second comment supersedes the pending token; an unrelated proposal cannot consume it. Unchanged completed prefixes may be linked only when their validated step definition and all transitive inputs are byte-identical.

## 3. Executor

`PlanExecutor` is host-owned and injected structurally, like specialist services. Approval acquires the journal lease and advances steps in document order. A step becomes runnable only after every id in `reads` is complete. Independent briefs in one step run in waves bounded by the parent's resolved specialist slot count (maximum four); write-capable specialists still pass through the existing single-writer reservation, so writers serialize rather than race.

Before a wave launches, one fenced journal mutation reserves every member's complete token and dollar allowance and verifies `spent + reserved` against the approved ceilings. For local execution it also verifies the simultaneous prompts against the one shared configured context pool. No provider request may exist without a durable reservation. Unused reservation is released only by a fenced terminal mutation.

Every child is an ordinary durable specialist session launched through the existing reserve/spawn machinery with the plan id, step id, attempt id, fencing token, and reserved allowance. Its briefing contains only the declared brief plus bounded, labelled reports from its result references. Before transmission the attempt moves from `prepared` to `request-sent`; response/tool-result persistence advances it to `response-persisted`; the executor then commits the immutable report and advances it to `committed`. It journals the completed step before starting any successor.

`verify` and `combine` differ only in validated shape and generated briefing labels; they do not introduce executable plan code. `repeat` journals each iteration independently, and the final leaf is its decision authority: its tool result must validate as `{ report: string, repeatSatisfied: boolean }`. Missing or malformed structured output pauses with the real validator detail. `repeatSatisfied:true` ends the loop; reaching `maxIterations` without it pauses for replanning rather than pretending success. Every possible iteration is included in reservations and the ceiling.

Any child failure or budget exhaustion first enters an internal, non-rendered `pausing` phase: fence the wave, abort every nonterminal sibling, and await stream/tool settlement only up to a fixed deadline. At the deadline the host forcibly disposes each remaining child process/session, pessimistically charges every unresolved transmitted reservation, persists durable ambiguous outcomes, releases child/writer reservations and the execution lease, and only then commits and emits user-visible `paused`. Stop follows the same bounded settle-before-visible ordering, then journals skipped unfinished steps. No process, timer, reservation, loaded child, or detached execution survives a stopped, paused, or interrupted plan; waiting is free.

Resume reacquires the lease and reads committed reports from disk. For an incomplete attempt it first rebuilds any terminal result already durable in the child transcript and commits that result without another model call. A `prepared` attempt proven never transmitted may launch. A `request-sent` attempt or side-effecting tool whose durable outcome cannot be proven becomes `ambiguous` and pauses for explicit user recovery; it is never automatically replayed. Restarting a safely resumable specialist runs one fresh turn against its persisted transcript, journals that restart, and charges the complete fresh prompt against its remaining/added allowance. Definition, binding, pricing, or permission-manifest drift fails closed and requires a newly proposed plan rather than widening consent or silently repricing.

## 4. Token and dollar budgets

Budgets are authorization limits, not warnings. Every tool-capable cloud route receives a tested budget adapter; known 9B+ local routes use the local-engine adapter. The common conservative adapter counts the complete UTF-8 request content (messages, tool schemas, and protocol framing), applies a deliberately over-reserved byte-to-token conversion plus fixed message/tool/protocol margins, permits one bounded transmission, and charges the whole reservation unless authoritative usage proves less. Provider tokenizer adapters may tighten that bound but never widen authorization. Binary/images/reasoning payloads are refused unless that adapter has conformance fixtures that certify their bound. Plan mode disables SDK retries, harness stream retry, compaction, summarization, repair calls, and every auxiliary model request inside a child; arbitrary OpenAI-compatible endpoints may reject the bounded request, but cannot receive a second transmission or exceed its reservation.

Before **every provider request**, the adapter computes that certified conservative input bound and the harness reserves the entire request allowance durably, then sets the provider's maximum output to the remainder. If one output token cannot fit, the request is not sent. A silent, interrupted, or failed response is charged the full reservation; authoritative usage may release only the unused portion. Tool execution never starts another model request after exhaustion. Any observed usage above an adapter's certified bound disables that adapter for plans and pauses with the real detail. Thus `ceilingTokens = Σ(per-attempt allowance × maximum attempts)` remains a worst case, including repeat iterations and safe resumes.

Dollar ceilings use the frozen execution manifest and conservatively apply the highest applicable published input/output/cache rate to every reserved token. Missing pricing yields `null`, never zero. Local execution is free but the card retains the token ceiling. Add budget creates a persisted authorization tranche assigned to the paused attempt (or explicitly named future attempts): `baseAllowance + addedAllowance - spent - reserved`. The fresh resume prompt must fit this tranche before Continue can transmit. The plan's displayed token/dollar limit is recomputed from authorized tranches, while already-spent and finished work remains unchanged.

## 5. IPC, remote, Android, and hydration

Add a shared push event `plans:event` and seven request channels:

- `plans:approve`, `plans:comment`, `plans:add-budget`, `plans:resume`, `plans:stop`
- `plans:get-auto-approve`, `plans:set-auto-approve`

They are wired in `ipc-handlers.ts`, `preload.ts`, `remote-shim.ts`, `remote-server.ts`, and `SessionService.kt`. Desktop and remote call the same `PlanService`. Action responses are `{ok:true,plan}` or `{ok:false,error}` or `{ok:false,unsupported:true,error}`; auto-approve reads are `{ok:true,underTokens}` or the same unsupported/error discriminants, and writes use the action discriminants without `plan`. On Android, which has no native harness, all seven explicitly return `unsupported:true`; the renderer hides or disables plan settings/actions and never applies optimistic state.

For local Electron, the existing `session:replay-live-state` request is the attach mechanism. Every successful first-page startup and explicit-resume load awaits it after transcript reduction; `sendLiveOnlyState` reads current projections from the journal and pushes them via `plans:event` alongside specialist runs. Remote clients instead receive plan projections inside the authoritative `chat:hydrate` snapshot through `serializeChatState`/`deserializeChatState`; `plans:event` carries only post-snapshot deltas, with no parallel reconnect buffer. This preserves the promised seven plan request channels while making restart hydration disk-backed. `ipc-channels.test.ts` pins names and shared-surface parity; transport tests pin normalized result shapes, first-page replay call sites, and snapshot round trips.

Auto-approve settings live in `~/.youcoded/plans.json` via `NativeHome`, default off. A proposal below a positive threshold transitions directly to running with `autoApproved:true`; it is nevertheless journalled and emitted as a proposal first so the transcript/card association exists before execution updates arrive.

The seven methods then leave `MOCK_ONLY`; the workbench retains fake implementations as fixtures, as it does for already-real specialist channels.

## 6. Failure, tests, and scope

Unit tests pin strict schema rejection, one repair only, capability gating, projection, atomic journal mutation, dead-owner interruption, no completed-step replay, fresh-prompt resume accounting, definition drift, slot waves, writer serialization, repeat cap, stop cascade, free pause, and token/dollar hard stops. Integration tests drive propose → approve → progress → pause/add → finish and restart → interrupted → resume. Renderer tests pin `plans:event` reduction and all seven actions. IPC parity and Android tests pin every transport name and explicit unsupported responses.

This stage does not build duties, the Autonomous Assistants view, the model-information UI, a general DAG engine, arbitrary code in plans, or Android native execution. It consumes the concurrent model-information seam when available without making that work a prerequisite for token-only plans.
