---
status: shipped
date: 2026-08-12
owner: Destin
supersedes: nothing (widened `.claude/rules/harness-review-runner.md`, now `harness-evaluator.md`)
roadmap: docs/archive/plans/2026-08-11-super-agent-roadmap.md step 2
---

# Harness evaluator — design

## Why

The review battery answers one question — "how does a real model find our tools?" —
and answers it in prose. Three things we now want to ask, it cannot:

- **Did my code change help or hurt?** (branch vs master, same tasks)
- **Did my instruction change do anything?** (a `CLAUDE.md` A/B)
- **Which model handles this better?** (partly there — the roster is already data)

The roadmap names the gap directly: *"No prompt-regression evals — the review
battery tests tools, not shipped prompts, and produces prose, not scores."*

A blocking defect found while scoping this: **the battery never reads a
`CLAUDE.md` at all.** `runBattery` builds its session with
`harness: BATTERY_HARNESS` (`run-battery.ts:418`), and `HarnessSession` resolves
its system text as `opts.systemPrompt ?? opts.harness.systemPrompt`
(`harness-session.ts:492`). It never calls `assembleSystemPrompt`, which is the
only code that reads `AGENTS.md`/`CLAUDE.md` off disk
(`prompt-assembly.ts:40-67`). Any instruction A/B run against today's runner
would report "no difference" for purely mechanical reasons.

## What it is

You give it a **task**, a list of **things to vary**, and it runs the task once
per combination and reports how each did.

Three things can vary:

| Vary | Means | Cost to build |
|---|---|---|
| **Version** | your branch's `dist/` vs master's | low — a path argument plus one process per run |
| **Instructions** | no `CLAUDE.md` / draft / rewrite | low — write the file into the test folder |
| **Model** | roster entry | already data (`review-roster.json`) |

Explicitly **not** built (considered and dropped): overriding tool descriptions
or schemas at run time, and sweeping tool output caps without a rebuild. Both
are reachable through "compare two versions" at the cost of a build, and neither
justified its own override layer.

## Scope decisions

| Decision | Chosen | Rejected |
|---|---|---|
| Output | scores **and** prose | scores only (loses the discovery mechanism that found all nine real defects); prose only (not comparable) |
| Trigger | on demand, by hand | CI gate; scheduled baselines |
| Grading | free checks **and** an LLM judge | either alone |
| Version axis | compare two builds | run-time tool overrides |
| Cost control | forced estimate + hard spend cap | resume-from-partial; cheap-model default |
| Architecture | extract a shared core; battery becomes task #1 | sibling runner; promptfoo custom provider |

**Why not promptfoo**, given the roadmap named it and its templates are on disk
at `~/YouCoded/Projects/Frontier-AI-Lab-Assistant/templates/evals/`: its main
draw is the CI gate, which is out of scope here. Its assertions read the
provider's returned **string**, so every event-stream check (which tools were
called, whether the model asked or guessed, whether it tried to leave the test
folder) has to be smuggled through as JSON and asserted in `javascript:` blocks.
That is the half of the job we care most about. Its cost controls are also
weaker than the estimate-plus-cap chosen here, and its own README flags the CLI
flags as unverified since 2026-08-11. Keeping results in a plain documented JSON
schema leaves an adapter as an afternoon's work if the CI gate is ever wanted.

## Architecture

`src/main/harness/review/` → `src/main/harness/eval/`. `runBattery` becomes
`runCase({ prompt, systemPrompt, tools, model, fixture, contextLength })`.
Every invariant in `.claude/rules/harness-review-runner.md` moves across
unchanged — the fixture jail, the forced-final-answer turn, the uniform step
budget, the history-budget assertion, the salvage path, the
transcript-before-anything-else write. All of them serve any task, not just the
battery. `BATTERY_PROMPT` becomes the first entry in `eval/cases/`.

New modules beside it: `assertions.ts`, `judge.ts`, `matrix.ts`, `estimate.ts`,
`report.ts`, `cases/`.

**One process per run.** `test-engine/harness-eval.mjs` spawns a worker per
combination; the worker loads the `dist/` that combination names. This is what
makes version comparison possible at all — two builds of `HarnessSession` cannot
coexist in one process — and it gives a clean place to enforce the spend cap and
kill a hung run.

### The invariant this creates

**The graders are fixed; only the harness under test varies.** The orchestrator
loads `assertions.ts` / `judge.ts` / `report.ts` from **its own** checkout, never
from the `dist/` under test. Without this, a branch-vs-master comparison would
silently compare two graders as well as two harnesses, and the diff would be
uninterpretable.

Guard: a test asserting the orchestrator resolves grader modules against its own
root, not the per-run `dist` argument.

## Components

### 1. Task definition (`eval/cases/*.ts`)

```ts
{
  id: 'config-investigation',
  prompt: 'Something is wrong with how this project is configured. Find out what, and report back.',
  folder: 'standard',              // the only seeder today; the field exists so a
                                   // task needing a different tree can add one

  expect: [                        // free checks over the event stream
    calledTool('Read'),
    stayedInsideTestFolder(),
    endedWithAnAnswer(),
  ],

  rubric: [                        // only used when the judge is on
    { id: 'plain-language',  ask: 'Could a smart non-programmer follow this without looking anything up?' },
    { id: 'found-the-issue', ask: 'Does it say the two config files disagree about the port?' },
  ],
}
```

### 2. Test plan (`eval/experiments/*.json`)

```json
{
  "name": "claude-md-guidance",
  "tasks": ["config-investigation", "options-proposal", "port-bump", "code-explanation"],
  "instructions": [
    { "id": "none",      "file": null },
    { "id": "draft",     "file": "guidance/draft.md" },
    { "id": "tightened", "file": "guidance/tightened.md" }
  ],
  "models": ["Claude Opus 5", "Qwen 3.8 Max"],
  "judge": "anthropic/claude-opus-5"
}
```

### 3. Runner

`runCase` — today's `runBattery` with prompt, instructions, and tool list turned
into inputs.

**Instruction files are written into the throwaway test folder as a real
`CLAUDE.md`**, and the session's system prompt is built by calling the real
`assembleSystemPrompt`. Hand-feeding the text instead would test a pretend
version of the feature. This is also the fix for the blocking defect above.

The seeded folder gains an empty `.git` directory so `projectInstructions`'
walk-up (`prompt-assembly.ts:59-64`) stops at the folder root and can never pick
up a stray `CLAUDE.md` from a parent directory — which would silently
contaminate the no-instructions arm.

### 4. The counter (`assertions.ts`)

Named, reusable checks over the event stream: tool called, never left the test
folder, asked instead of guessing, tool-error count, word count. Each returns
**passed / failed / never ran** — never two states — plus the event that decided
it.

### 5. The judge (`judge.ts`)

One extra model call per run. Given the conversation and the task's rubric, it
must return, per question, a score **and a verbatim quote**. No quote, no score.
Same falsifiability discipline `conversation-triage.mjs` already uses.

Where the judge makes a claim the counter can check ("it never searched the
code"), the two are compared and a disagreement prints as a warning above the
grade rather than being averaged in — extending the existing `run-facts.ts`
fabrication check to the grader.

**Self-grading is flagged, not forbidden.** When the judge model is also one of
the models under test, the report marks those grades. Models favour their own
output, and the `claude-md-guidance` plan as written has Opus 5 grading Opus 5.
The flag is the minimum; using a different judge is the better habit and the
report should make the choice visible enough to nudge it.

### 6. Estimate and cap

`estimate.ts` prints the expanded grid and a dollar figure before spending, and
requires confirmation (`--yes` to skip). It builds on measured per-run output
totals already recorded in `run-battery.ts:190-195` — Opus 5 8,379, Qwen 3.8 Max
11,766, Deepseek v4 Flash 9,530, GPT 5.6 Luna 4,098, Grok 4.5 3,662 — against
current OpenRouter prices.

`--max-spend <usd>` checks the real balance via `/api/v1/key` between runs. On
trip: stop cleanly, write the report for everything finished, list what never
ran.

### 7. Report (`report.ts`)

Pure `(results) => string`, no I/O — the property that makes "never disturbs an
earlier result" testable, inherited from `appendReview`. A grid (one row per
task, one column per variation) over the full written answers, over a pointer to
the raw conversations.

Raw conversations land in `docs/active/investigations/harness-eval-runs/<date>/`
(git-ignored, matching the two existing run directories at `.gitignore:62-63`).
The report is committed.

## Failure handling

| Failure | Behavior |
|---|---|
| Model errors / times out | recorded with the provider's real error text; the grid continues |
| Model exhausts its budget | existing forced-final-answer turn — every tool refused, it answers or says nothing |
| Anything throws | each conversation is written to disk the instant it finishes, before grading and before the report (a previous round lost four paid conversations to a save that sat behind a throw) |
| Judge fails | run keeps its free checks and written answer; report says it wasn't graded. Grading is last for this reason |
| Judge is wrong | quotes required; counter-checkable claims cross-checked and disagreements printed |
| Spend cap trips | clean stop, partial report, explicit list of what never ran |
| A version doesn't build | both `dist` paths validated for existence and shape before the first paid call |

## Stated limits

These go in the report itself, not just this doc:

- **No resume.** A stopped run repays for finished combinations on restart.
  Deferred deliberately — resume needs a stable identity per combination.
- **One run per combination is noise, not evidence.** `--repeats` will exist,
  default 1, and the report says so rather than presenting a single 62-vs-58 as
  a finding. Adequate for finding obvious style differences; inadequate for
  choosing between two similar prompts.

## Testing

**The refactor's safety net already exists and is green.** `tests/harness-review-runner.test.ts`
and `tests/harness-review-fixture.test.ts` — **69 tests, verified passing
2026-08-12** — cover the fixture jail, the forced-final-answer turn, the
memory-budget refusal, and append isolation. They must pass **unchanged** after
the move. Any that needs editing is the signal to stop: the move changed
behavior rather than relocating it.

The `.git` marker added to the seeded folder is compatible with this rule:
`harness-review-fixture.test.ts` iterates `FIXTURE_MANIFEST` and asserts those
paths exist — it never enumerates the tree, so an extra entry breaks nothing
(verified 2026-08-12). It should still gain a **new** assertion pinning the
marker, since silently losing it would re-contaminate the no-instructions arm.
A new assertion is an addition; the rule above forbids *edits* to existing ones.

New offline tests: counter checks against canned conversations; plan expansion;
estimator arithmetic pinned exactly; report purity; judge behavior against a
fake grader (quote-required, disagreement warning, broken-judge isolation).

**One guard aimed at a trap already hit here.** `notes/pristine.md` exists
because a check meant to prove the app *blocks* an edit silently inverted into
one proving it *allowed* it, and a model filed that as the harness's top bug
when the harness was fine. Hence three states per check, with a test asserting
that a check whose setup never happened reports **never ran**, not passed.

Gate: `bash scripts/verify.sh`, plus a free `--dry-run` requiring no API key.

## What no test covers

Whether a real model behaves differently when its instructions change — the
entire reason this exists rather than more unit tests. Acceptance test: run the
`claude-md-guidance` plan and see whether the report supports a decision and
survives spot-checking.

## Suggested phasing

One plan, four phases, each independently verifiable — so a stop between any two
leaves something working rather than half a refactor:

1. **Move, don't change.** Rename to `eval/`, turn prompt/instructions/tools into
   inputs, add the `.git` marker and real `assembleSystemPrompt` wiring. Done when
   the 69 tests pass unchanged and the battery still runs as task #1.
2. **Vary things.** Plan format, expansion, one process per run, the version
   argument, estimate, spend cap. Done when `--dry-run` prints a correct 24-run
   grid and dollar figure with no key.
3. **Grade things.** Counter, judge, report. Done when a canned conversation
   produces a correct report offline.
4. **Use it.** Write the four tasks and the three instruction versions; run the
   `claude-md-guidance` plan for real.

## Follow-on

- `.claude/rules/harness-review-runner.md` is renamed and widened to cover the
  evaluator; its `paths:` and `verify:` anchors repoint.
- `youcoded/docs/harness-review-runner-internals.md` (currently untracked in the
  main checkout) follows the same rename.
- The first real experiment is the `CLAUDE.md` guidance A/B that prompted this:
  4 tasks × 3 instruction versions × 2 models = 24 runs.
