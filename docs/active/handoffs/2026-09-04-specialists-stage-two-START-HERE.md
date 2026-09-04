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

## The next action is measurement, not code

The spec requires three live probes **before the stage-two design is final**.
None has been run. Do these first; two of the three can change the design.

1. **How many helpers the local engine really runs at once** — the configured
   parallel slots versus what `llama-server` actually serves concurrently.
2. **Whether KV prefix reuse survives fan-out.** If it does not, a plan costs
   far more than its card would promise, and the ceiling shown to the user is
   the feature's core promise.
3. **Whether the `--jinja` tool grammar holds on the nested plan schema.** If
   small local models cannot emit a valid plan, stage two is cloud-only — which
   cuts against the run-it-on-your-own-machine positioning. Know this before
   building, not after.

Nothing else in stage two is blocked on Destin. (The *naming* is — see
"Blocked on a decision" below — but the probes are not.)

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

- `docs/active/investigations/2026-09-01-specialist-notes-not-interleaved.md` —
  a note sent mid-run lands at the bottom of the Activity trail, below tool
  calls that happened later.
- `docs/active/investigations/2026-09-01-specialist-run-stale-resend.md` —
  a late-arriving run update flips a finished card back to "running"; a run
  record carries nothing saying which of two updates is newer.
- `docs/active/investigations/2026-09-01-specialist-missed-steers-unclamped.md` —
  a missed steer is stored in full in the parent's ledger, past the
  2,000-character cap notes obey, and nothing bounds how many accumulate.
- `docs/active/investigations/2026-09-01-specialist-child-transcript-gc.md` —
  helper transcripts accumulate forever. **Blocked**: the app has no
  delete-a-conversation feature at all, so this waits on that existing.

The middle two spent time in `docs/archive/` with `status: active` and no
roadmap entry — invisible to `/audit`, which never scans the archive. Both were
moved back and filed on 2026-09-04. If you archive a report, the bug it
describes must be shipped or dropped first.

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
