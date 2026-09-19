---
date: 2026-09-19
status: active
type: handoff
topic: specialists stage two — plans
branch: feat/specialists-plans-ui
---

# Specialists plans — START HERE

Read this before touching anything. It assumes no prior context.

## What the feature is

The assistant proposes a **plan**: several steps, each run by one or more specialists (child AI
sessions), as structured data rather than prose. The user sees a card in the chat, approves it, and
the app runs it — in waves, with a hard spending limit it cannot exceed, pausing and resuming
safely, surviving a restart.

## Where it lives

| What | Where |
|---|---|
| Branch (app code) | `feat/specialists-plans-ui` in the **youcoded** repo, 113 commits ahead of master |
| Working worktree | `worktrees/specialists-plans` |
| Workspace docs branch | `docs/specialists-plans-decisions` in **youcoded-dev**, worktree `worktrees/specialists-plans-decisions` |
| Implementation plan | `docs/active/plans/2026-09-07-specialists-plans-backend-implementation.md` |
| **Decision log (read this)** | `docs/active/design/2026-09-05-specialists-plans/decision-log.md` |
| Contract (83 rows, UNSIGNED) | `docs/active/design/2026-09-05-specialists-plans/specialists-plans.contract.json` |
| Decks 1–11 and their answers | same folder, `*.json` / `*.answers.json` |
| Grammar | `desktop/src/main/harness/plans/schema.ts` + `validator.ts` |
| The card | `desktop/src/renderer/components/plans/PlanCard.tsx` |
| Projection (record → card) | `desktop/src/main/harness/plans/plan-journal.ts` |

The decision log is the single most useful file. Every numbered decision is the owner's ruling and
the code carries WHY comments naming those numbers.

## State: built and working

The engine is complete — the `propose_plan` tool, the durable journal, hard token/dollar ceilings,
the wave executor, pause/resume/recovery, the card, all three surfaces (desktop, Android, remote),
and end-to-end tests. Each of seven build tasks was implemented by one subagent and audited by a
separate one; every finding was fixed or declined in writing.

Since then, driven by the owner's live testing:

- Plans are never proposed with a specialist that cannot run (local credential check, no spend).
- The one automatic retry is never spent on an error that cannot heal.
- A tier change re-freezes and resumes instead of forcing a new plan.
- **The card was reworked three times.** Two full redesigns were rejected; the third pass kept the
  shipped card and fixed named defects. See "Card history" below — it matters, because the same
  mistakes are easy to repeat.
- **Grammar tightened (decision 33):** `summary` is required on every step; a plan whose entire
  worst case is one specialist run is refused, telling the assistant to hire a specialist instead.
  One-item split steps remain legal.
- **A repeat is now ONE card row containing its body**, instead of being flattened into rows that
  looked like unrelated steps with the loop, round count and stop condition invisible.

## State: open, and what each needs

### 1. Add budget freezes the window — UNSOLVED, highest priority

Owner, 2026-09-19: *"when i press add budget, the whole window enters a 'not responding' state and
freezes for a few seconds to minutes."*

Not diagnosed. **Two fixes already landed near it are NOT this bug** — do not mistake them for it:
- the card stayed disabled and silent through the slow half (fixed, `3bb875300`)
- the workbench fake answered Add budget with a running plan, so the two-call path the app really
  takes was never tested there (fixed, `2b1802df4`)

Ruled out by measurement: git snapshots (9 ms on this workspace), token counting (there is no real
tokenizer in that path).

Still suspected, unproven: `resolveManifest` builds **a probe session per distinct specialist** on
the main process, and the window going "not responding" means a blocked thread. Corroborating
evidence: the dev instance's own debugger endpoint took 2.5 s to answer during the episode, and
once returned nothing within 5 s.

**Next step:** timing instrumentation around each stage of that path (session build, prompt
assembly, measurement, per specialist) so the next occurrence produces numbers. Needs a dev restart.

### 2. Why Continue re-measures at all — owner objected on principle

Owner: *"why do we 'begin a new session' just to check the model? this seems broken or janky at the
least."* He is right.

`reconcile()` (plan-service.ts) calls `resolveManifest()` on **every Approve and every Continue**,
and that opens a probe session per specialist to measure setup cost. On Continue the only question
being asked is "did the model change since you paused?" — which is identity, not measurement.

**Proposed fix, not yet built:** compare identity cheaply (binding, route, credentials, permission
fingerprint) and reuse the frozen measurements when nothing moved; probe only when identity
actually changed. Likely also fixes item 1.

### 3. Sign-off sequence — deferred by the owner until he finishes testing

In order: he signs the 83-row contract (one yes/no) → a **fresh** grader writes
`specialists-plans.contract.verdicts.json` → build and serve the acceptance deck → his merge call.
Do not start any of this unprompted; he said *"ignore contract for now until i am done testing."*

### 4. Two questions owed to him

- Whether **"Ask the assistant"** is the right name for that button (raised by the UX tester).
- A re-ask of the **pause/resume cost** question (deck 9, Q9-1) in plainer words — he found the
  original wording confusing.

### 5. Judgement calls flagged rather than made

- **A repeat row's count is its worst case across rounds** (2 items × 3 rounds = "6 workers"), which
  asks the reader to multiply. Per-round counts would need progress re-derived per round — a
  projection change with its own pricing risk. Owner's call.
- **The heavy fixture's step 1 deliberately has no `summary`**, so it exercises the pre-decision-33
  fallback path. It therefore looks worse than the other four fixtures. That is intentional.
- **At 390 px the step row's detail still CSS-truncates.** Pre-existing and identical before this
  work; letting it wrap makes every collapsed card taller on a phone. Needs its own decision.

## Card history — read before redesigning anything

Three attempts. The first two were rejected and the reasons generalise:

1. **Round 1** (compare surface `plan-card-hierarchy`, round 1 — still in the registry as the
   record): three new layouts. Rejected: *"doesnt match existing ui at all. lots of bare text and
   divider lines, which we don't use anywhere else in the app."* They ignored
   `docs/active/design/2026-08-25-ui-design-guide.md` — hand-rolled rows instead of `SettingRow`,
   `divide-y` dividers (which appear in exactly ONE file in the whole renderer), information below
   the 11 px floor.
2. **Round 2** (same surface, round 2): the same three ideas rebuilt from real primitives. Rejected
   anyway: *"these are just getting progressively worse. whatever is live in the dev window is still
   the best i've seen."*
3. **What worked:** keep the shipped card, fix the named defects, and judge every change against a
   fixture shaped like a plan he actually ran. The earlier rounds looked fine only because the
   sample plan had 3 short items and no brief; his had 7 long ones and a 600-word brief.

**The lesson worth keeping: build the hard fixture first.**

## Fixtures — use all five

`?mode=workbench&seed=bubbles-<name>`, in `desktop/src/renderer/dev/workbench/fixtures/bubbles/`.
They land on session **wb-2** ("theme contrast pass") — you must click that session in the strip.

| Fixture | Shape it proves |
|---|---|
| `plan-shape-chain` | split → check → combine; shows NO flow labels (correct) |
| `plan-shape-repeat` | a repeat with rounds and a stop condition on the row |
| `plan-shape-fork` | two steps consuming the same earlier step; two backward labels |
| `plan-shape-single` | a one-item split inside a larger plan |
| `plan-proposed-heavy` | the owner's real plan: 7 long items, 31-line brief with `{item}` |

## What the grammar can actually produce

Worth knowing before designing UI for it. 1–6 top-level steps. Four kinds: **split** (`map`, 1–8
items, one specialist per item), **check** (`verify`), **combine**, **repeat** (body of 1–4 leaf
steps, up to 5 rounds, no nesting). Brief up to 4,000 chars; each item up to 2,000; stop condition
up to 2,000; the plain sentence capped at 200. Smallest plan is two specialist runs; the largest is
roughly 960.

Two facts that constrain any design:

- **A split step can never declare an input** (`of` belongs to check/combine only), and at run time
  it genuinely receives nothing from earlier steps. So the card **can never show a complete flow**
  and must not imply one.
- **Every link names exactly one earlier step**, so the structure is always a tree, never a web.
  That is why words carry it and no diagram is needed — a diagram was proposed and rejected twice.

## How to run it

```bash
bash scripts/run-workbench.sh specialists-plans    # UI only, fake backend, fastest loop
bash scripts/run-dev.sh --path worktrees/plans-demo --label "Plans demo" --profile plansdev
bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/specialists-plans
```

`verify.sh` is green except `ast-grep`, which fails at **exactly 341 pre-existing errors** owned by
another session's in-flight rule sweep. Confirm the count is unchanged and that none name your
files; do not start that sweep.

## Standing constraints

- **Never touch the owner's live built YouCoded app.** Dev instances only. A frozen demo worktree
  (`worktrees/plans-demo`, Vite 5223, debugger 9272, profile `plansdev`) is used for live testing —
  it is checked out detached at a specific commit on purpose.
- Never `npm install` / `npm ci` — `node_modules` is a hardlink farm.
- Never `git add -A`. Stage explicit paths.
- Never merge or suggest merging. The owner decides.
- A failing or flaky test is fixed when found, never filed.
- **Ask before building a review deck while a dev instance is running** — a deck that shows what he
  is already looking at wastes tokens (`.claude/rules/feature-flow.md`).
- Never invent an error cause (`docs/error-message-standards.md`).
