---
date: 2026-09-04
status: active
type: handoff
topic: specialists — stage one shipped, stage two (plans) not started; the reading list and the three probes that gate the design
---

# Specialists / plans — start here

Hand this file to a new session. It is a map, not a plan: it says what is built,
what is not, what to read in what order, and what the next real action is.

Assembled 2026-09-04 against `origin/master`. Every path below was verified to
exist at that commit.

## Status in one paragraph

**Stage one is shipped and working:** a native session can hire helper sessions
(four built-ins plus user-defined files and Claude Code `.claude/agents` files),
run them in the foreground or background, send them a note mid-run, stop them,
and answer a question a helper raises. **Stage two — plans — has no code.** That
is the model proposing a multi-step fan-out as a schema-validated document, the
user approving it as a card carrying an enforced worst-case token/dollar
ceiling, and an executor that journals each step so the plan resumes across a
restart. It was approved in the 2026-08-11 spec (§4, §7, §8) and never started.

## The probes are done; the next action is Destin's decisions, then design

The spec required three live probes **before the stage-two design is final**.
All three were run on 2026-09-04 against the pinned engine build; results and
their design consequences are in `youcoded/docs/engine-dependencies.md` →
"Stage-two probes". In one line each:

1. **Four helpers at once** is the ceiling; an eight-wide fan-out runs as two
   waves. With the app's real launch shape all four share ONE context pool the
   size of the configured window, so budgets are summed against the pool.
2. **Prefix reuse only partly survives** the first simultaneous fan-out (one to
   two of four children reuse; the rest pay the full prompt again); every later
   wave reuses fully. The card's worst case charges a full prefill per child.
3. **Plan authoring is a model-class gate, not cloud-only:** every local model
   from the 9B class up produced a valid, sensible plan every time; the 2B
   class is unreliable and gemma-4-E2B ignores the schema entirely. Validate
   app-side with one retry, and expect 40 s to 4 min of "writing the plan".

The probes also found a shipped bug: the app could not read the engine's slot
count on this build, so every local model was capped at one helper. Fixed and
merged 2026-09-05; a follow-on (the count is read before the model loads) is
on the local-models roadmap.

What blocks stage two now is Destin's decisions — the prompt at
`docs/active/handoffs/2026-09-04-stage-two-decisions-prompt.md` puts them on a
question deck and then starts the design.

## Read in this order

| # | Path | Why |
|---|---|---|
| 1 | `docs/active/specs/2026-09-01-agent-platform-vision-and-state.md` | The single doc for the whole program. §5.3 is specialists; §6.1 is where this is heading; §9 is what Destin still owes. Read §5.3 + §9 at minimum. |
| 2 | `docs/active/specs/2026-08-11-native-specialists-design.md` | The specialists spec itself. §4 is the plan schema, §7–§8 the executor and budgets. This is the stage-two design. |
| 3 | `docs/active/handoffs/2026-08-16-specialists-1c-testing-checklist.md` | 17 hands-on checks of **shipped** behaviour. All 17 result tables are still empty (verified 2026-09-04). Check 9b — a permission grant leaking between helpers — is the one to run first and needs a real model. |
| 4 | `docs/roadmap/native-harness.md` → `## specialists` | The five open items, in Destin's words. |
| 5 | `youcoded/docs/native-runtime.md` | Depth on everything already shipped. Read when you need mechanism, not before. |

Background, only if you need the reasoning behind a settled decision — do not
re-derive from these:

- `docs/archive/plans/2026-08-12-native-specialists-plan-1a-core.md`
- `docs/archive/plans/2026-08-12-native-specialists-plan-1b-background-durability.md`
- `docs/archive/plans/2026-08-16-native-specialists-plan-1c-implementation.md`
- `docs/archive/specs/2026-08-16-native-specialists-plan-1c-design.md`
- `docs/archive/handoffs/2026-08-16-specialists-1c-handoff.md`
- `docs/archive/investigations/2026-08-11-subagent-platform-research.md`

## Open bugs, with reports

- `docs/active/investigations/2026-09-01-specialist-child-transcript-gc.md` —
  helper transcripts accumulate forever. **Blocked**: the app has no
  delete-a-conversation feature at all, so this waits on that existing.

Two more (a stale run update rewinding a finished card; missed steers stored
unclamped) were fixed on master on 2026-09-02 (`96d82393`, `5f759d8a`) without
closing their roadmap items — closed and archived 2026-09-04. The note-order bug
was fixed and merged 2026-09-05 (`f0ac766d`, `7d3cc64d`); the same branch pinned
checklist 9b's security half as a unit test.

## Code map

Main process — `youcoded/desktop/src/main/harness/specialists/`:

    registry.ts            the roster: built-ins + file-defined, and lookup
    builtins.ts            explorer / researcher / reviewer / worker
    catalog.ts             what the model is offered as hireable
    definition-files.ts    user files + Claude Code .claude/agents parsing
    frontmatter.ts         the file format's header
    child-permissions.ts   what a helper may do — check 9b's subject
    child-ask-router.ts    a helper's question reaching the right person
    delegation-ledger.ts   the durable record; missed steers live here
    delegated-models.ts    tier → model binding
    report-budget.ts       how much a helper may report back
    limits.ts, names.ts, name-pools.json

The model-facing tool is `youcoded/desktop/src/main/harness/tools/task.ts`
(named `Task` to the model, *specialist* to the user — UI copy never says
subagent, orchestrator, spawn or Task).

Renderer — `youcoded/desktop/src/renderer/`:

    components/SpecialistsChip.tsx        status-bar chip
    components/SpecialistReportCard.tsx   the finished-helper card
    components/SpecialistEnvelope.tsx
    components/SpecialistsSection.tsx     the Settings roster
    components/specialists/RunStatusLine.tsx
    components/specialists/SpecialistActions.tsx
    components/specialists/SpecialistAskBlock.tsx
    hooks/useSpecialists.ts
    utils/specialist-cards.ts
    dev/workbench/specialist-runs.ts      workbench fixtures
    dev/workbench/fixtures/specialists.ts

Tests — 18 files, `youcoded/desktop/tests/specialist*.test.*` plus
`chat-reducer-specialists.test.ts`. `bash scripts/verify.sh <worktree>` runs the
affected ones.

## Blocked on a decision

Stage two's *shape* is not blocked, but its *vocabulary* is. Destin's 2026-09-01
"assistants made of duties" proposal makes a duty implemented as a specialist,
which turns the specialists spec's headline noun into an implementation detail.
That is decision 1 in the vision doc §9, and Agents & Automations waits on the
same ruling. Do not rename anything before it lands.

Also unbuilt from the same spec: the Claude Code bridge (`youcoded agent run`
CLI plus a bundled skill), which needs a `bin` entry the app has never shipped.

## What is NOT in flight

Verified 2026-09-04: no branch, no worktree, no pull request touches
specialists, and every specialists conversation in the chat index carries the
app's "complete" marker. Nothing is half-committed anywhere — this program is
stopped, not paused.
