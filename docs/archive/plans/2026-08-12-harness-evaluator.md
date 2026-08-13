---
status: shipped
spec: docs/archive/specs/2026-08-12-harness-evaluator-design.md
created: 2026-08-12
---

# Harness Evaluator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-purpose harness review battery into an evaluator that runs any task against any combination of build, instructions, and model, and grades each run with both free event-stream checks and an LLM judge.

**Architecture:** `src/main/harness/review/` is renamed to `src/main/harness/eval/` and its three hardcoded values (prompt, system prompt, tool list) become inputs. A plain-Node orchestrator (`test-engine/harness-eval.mjs`) expands a test plan into runs and spawns one worker process per run; the worker loads the `dist/` under test while the orchestrator always loads graders from its own checkout.

**Tech Stack:** TypeScript compiled by `tsc` (`npm run build:main`), vitest 4, plain-Node ESM CLI, OpenRouter via the existing `makeOpenRouterFactory`.

**Spec:** `docs/active/specs/2026-08-12-harness-evaluator-design.md`

## Global Constraints

- **Work in a git worktree.** `git worktree add ../../worktrees/harness-eval -b feat/harness-evaluator` from `youcoded/`. The main checkout has uncommitted `test-engine/` work from another session.
- **Never run the paid path unasked.** `--dry-run` must work with no API key at every stage. Destin authorises real spend explicitly.
- **Never touch the live app.** Everything here is plain Node; no Electron, no `userData`, no `~/.youcoded` writes.
- **The 69 tests in `tests/harness-review-runner.test.ts` and `tests/harness-review-fixture.test.ts` must pass unchanged** except for import paths (Task 1) and additive new assertions. An existing assertion needing an edit means the refactor changed behavior — stop and report.
- **The graders are fixed; only the harness under test varies.** The orchestrator resolves `assertions`/`judge`/`report` from its own checkout, never from the per-run `--dist`.
- **Real error text only** — never substitute a guessed cause (`docs/error-message-standards.md`).
- **WHY comments on non-trivial edits** — Destin is a non-developer and relies on them.
- **Gate:** `bash scripts/verify.sh` from the workspace root before any commit claiming completion.
- Run all commands from `youcoded/desktop/` unless stated otherwise.

---

## File Structure

**Renamed (Task 1), same contents:**

| From | To |
|---|---|
| `src/main/harness/review/run-battery.ts` | `src/main/harness/eval/run-case.ts` |
| `src/main/harness/review/battery.ts` | `src/main/harness/eval/roster.ts` (roster loading) + `eval/cases/harness-battery.ts` (the prompt) |
| `src/main/harness/review/fixture-workspace.ts` | `src/main/harness/eval/fixture-workspace.ts` |
| `src/main/harness/review/run-facts.ts` | `src/main/harness/eval/run-facts.ts` |
| `src/main/harness/review/append-review.ts` | `src/main/harness/eval/append-review.ts` |
| `src/main/harness/review/openrouter-factory.ts` | `src/main/harness/eval/openrouter-factory.ts` |

**Created:**

| File | Responsibility |
|---|---|
| `src/main/harness/eval/case-types.ts` | The `EvalCase` shape and its three-state check result type |
| `src/main/harness/eval/cases/index.ts` | Case registry — id → case |
| `src/main/harness/eval/cases/harness-battery.ts` | The existing battery, as case #1 |
| `src/main/harness/eval/assertions.ts` | Free checks over the event stream |
| `src/main/harness/eval/judge.ts` | Rubric grading via a second model |
| `src/main/harness/eval/matrix.ts` | Test plan → ordered list of runs |
| `src/main/harness/eval/estimate.ts` | Token/dollar estimate for a matrix |
| `src/main/harness/eval/report.ts` | Results → markdown, pure |
| `test-engine/harness-eval.mjs` | Orchestrator CLI |
| `test-engine/harness-eval-worker.mjs` | Runs exactly one cell, prints JSON to stdout |
| `test-engine/eval-plans/claude-md-guidance.json` | The first real test plan |
| `test-engine/eval-guidance/draft.md`, `tightened.md` | Instruction variants under test |

**Modified:** `test-engine/review-harness.mjs` (thin alias), `test-engine/README.md`, `.claude/rules/harness-review-runner.md` → `harness-evaluator.md`, `youcoded/docs/harness-review-runner-internals.md` → `harness-evaluator-internals.md`.

---

# Phase 1 — Move, don't change

Goal: the battery behaves identically, but prompt/instructions/tools are inputs and the real system prompt is wired up. Phase is done when the 69 existing tests pass with only import-path edits.

---

### Task 1: Rename the directory

**Files:**
- Move: `src/main/harness/review/` → `src/main/harness/eval/` (6 files)
- Modify: `tests/harness-review-runner.test.ts`, `tests/harness-review-fixture.test.ts` (import paths only)
- Modify: `test-engine/review-harness.mjs:83,117-122` (dist paths only)

**Interfaces:**
- Consumes: nothing
- Produces: every symbol previously exported from `review/*` now exported from `eval/*` with identical names and signatures.

- [ ] **Step 1: Confirm the baseline is green before touching anything**

```bash
npx vitest run tests/harness-review-runner.test.ts tests/harness-review-fixture.test.ts
```
Expected: `Test Files 2 passed (2)`, `Tests 69 passed (69)`.

- [ ] **Step 2: Move the directory**

```bash
git mv src/main/harness/review src/main/harness/eval
git mv src/main/harness/eval/run-battery.ts src/main/harness/eval/run-case.ts
```

- [ ] **Step 3: Repoint every import**

Find them first:
```bash
rg -l "harness/review|from './run-battery'|from '\./review" src tests test-engine
```
Change `../src/main/harness/review/` → `../src/main/harness/eval/` in the two test files, and `./run-battery` → `./run-case` inside `eval/run-facts.ts:13`. In `test-engine/review-harness.mjs`, change `dist/main/harness/review/battery.js` → `dist/main/harness/eval/battery.js` and the same for `run-battery.js` → `run-case.js`, `append-review.js`, `openrouter-factory.js`, `run-facts.js`.

- [ ] **Step 4: Verify nothing changed but paths**

```bash
npx tsc --noEmit
npx vitest run tests/harness-review-runner.test.ts tests/harness-review-fixture.test.ts
```
Expected: tsc clean; `Tests 69 passed (69)`.

If any *assertion* (not import) needed changing, STOP — the move altered behavior.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(eval): rename harness review module to eval, no behavior change

Pure move ahead of generalising the battery into an evaluator. The 69
tests in harness-review-runner/fixture pass unchanged apart from import
paths, which is the evidence the move relocated behavior rather than
altering it."
```

---

### Task 2: Turn prompt, wrap-up prompt, and tools into inputs

**Files:**
- Modify: `src/main/harness/eval/run-case.ts` (opts interface, `session.send` call sites, `tools:` wiring)
- Test: `tests/harness-eval-runner.test.ts` (new file)

**Interfaces:**
- Consumes: `RunBatteryOpts` from Task 1.
- Produces:
```ts
export interface RunCaseOpts {
  modelFactory: ModelFactory;
  modelId: string;
  label: string;
  /** The task prompt. Defaults to BATTERY_PROMPT so existing callers are unchanged. */
  prompt?: string;
  /** Sent as the forced-final-answer turn. Defaults to WRAP_UP_PROMPT. */
  wrapUpPrompt?: string;
  /** Tool set. Defaults to CORE_TOOLS. */
  tools?: NativeTool[];
  timeoutMs?: number;
  keepFixture?: boolean;
  contextLength?: number;
}
export async function runCase(opts: RunCaseOpts): Promise<CaseRun>;
/** Back-compat alias so Task 1's callers keep working. */
export const runBattery = runCase;
```
`BatteryRun`/`BatteryMetrics`/`BatteryOutcome` keep their names and shapes in this task; they are renamed in Task 5.

- [ ] **Step 1: Write the failing test**

Create `tests/harness-eval-runner.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runCase } from '../src/main/harness/eval/run-case';
import { BATTERY_PROMPT } from '../src/main/harness/eval/battery';
import { scriptedFactory } from './helpers/harness-fakes';

describe('runCase inputs', () => {
  it('sends the prompt it was given, not the battery prompt', async () => {
    const run = await runCase({
      modelFactory: scriptedFactory([{ text: 'done' }]),
      modelId: 'test/model', label: 'test',
      prompt: 'Just say done.',
      contextLength: 64_000,
    });
    const firstUser = run.events.find((e) => e.type === 'user-message');
    expect(firstUser?.data.text).toBe('Just say done.');
    expect(firstUser?.data.text).not.toContain('battery');
  });

  it('defaults to the battery prompt when none is given', async () => {
    const run = await runCase({
      modelFactory: scriptedFactory([{ text: 'done' }]),
      modelId: 'test/model', label: 'test',
      contextLength: 64_000,
    });
    expect(run.events.find((e) => e.type === 'user-message')?.data.text).toBe(BATTERY_PROMPT);
  });

  it('attaches only the tools it was given', async () => {
    const run = await runCase({
      modelFactory: scriptedFactory([{ text: 'done' }]),
      modelId: 'test/model', label: 'test',
      tools: [],
      contextLength: 64_000,
    });
    expect(run.metrics.toolsUsed).toEqual([]);
  });
});
```

Check the fake's real export name first — `rg -n "export" tests/helpers/harness-fakes.ts` — and use whatever scripted-model helper it provides rather than inventing `scriptedFactory`.

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/harness-eval-runner.test.ts
```
Expected: FAIL — `runCase` is not exported.

- [ ] **Step 3: Make the three values inputs**

In `run-case.ts`:

```ts
export interface RunCaseOpts {
  // ...existing fields...
  /** The task prompt. WHY optional: every existing caller (test-engine/
   *  review-harness.mjs, the 69 pinning tests) predates the evaluator and
   *  must keep running the battery unchanged. */
  prompt?: string;
  /** The forced-final-answer turn. WHY per-task: WRAP_UP_PROMPT literally
   *  says "write your review of the harness", which is wrong for every task
   *  that is not the harness review. */
  wrapUpPrompt?: string;
  /** WHY a tool-set input: a task can ask "is Grep earning its context slot?"
   *  by running with it detached. Defaults to CORE_TOOLS. */
  tools?: NativeTool[];
}
```

Then inside `runCase`:
```ts
const prompt = opts.prompt ?? BATTERY_PROMPT;
const wrapUpPrompt = opts.wrapUpPrompt ?? WRAP_UP_PROMPT;
```
Replace `tools: CORE_TOOLS` (line ~426) with `tools: opts.tools ?? CORE_TOOLS`, `await session.send(BATTERY_PROMPT)` (~line 637) with `await session.send(prompt)`, and `await session.send(WRAP_UP_PROMPT)` (~line 726) with `await session.send(wrapUpPrompt)`.

Rename the function to `runCase` and add at the bottom:
```ts
/** WHY an alias rather than a rename-everywhere: Task 1 proved the move was
 *  behavior-preserving by keeping the pinning tests untouched. Renaming their
 *  entry point in the same change would forfeit that evidence. */
export const runBattery = runCase;
```

- [ ] **Step 4: Verify**

```bash
npx vitest run tests/harness-eval-runner.test.ts tests/harness-review-runner.test.ts tests/harness-review-fixture.test.ts
```
Expected: the 3 new tests pass and the 69 existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(eval): make prompt, wrap-up prompt, and tool set inputs to runCase

Defaults preserve battery behavior exactly, so the 69 pinning tests stay
untouched. The wrap-up prompt needed parameterising because it literally
says 'write your review of the harness' — wrong for any other task."
```

---

### Task 3: Wire the real system prompt and instruction files

This fixes two verified defects. The battery currently runs on `ASSISTANT_PRESET.systemPrompt`, which `harness-manifest.ts:12` documents as a *"fallback one-liner"* — the single sentence `'You are a helpful, careful assistant inside YouCoded.'` (line 56). The real shipped prompt is `ASSISTANT_DEFAULT_BODY`, reached through `resolvePreset('assistant').body`. And nothing ever reads a `CLAUDE.md`.

**Files:**
- Modify: `src/main/harness/eval/run-case.ts`
- Modify: `src/main/harness/eval/fixture-workspace.ts`
- Test: `tests/harness-eval-runner.test.ts`, `tests/harness-review-fixture.test.ts` (new assertion only)

**Interfaces:**
- Consumes: `RunCaseOpts` from Task 2.
- Produces: `RunCaseOpts.instructions?: string | null` — markdown written into the fixture as `CLAUDE.md`; `null`/absent means no file. `seedFixtureWorkspace(instructions?: string | null): string`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/harness-eval-runner.test.ts`:

```ts
import { ASSISTANT_DEFAULT_BODY } from '../src/main/harness/prompts/assistant-default';

describe('system prompt assembly', () => {
  it('runs on the real assistant prompt body, not the one-line fallback', async () => {
    const captured: string[] = [];
    const run = await runCase({
      modelFactory: capturingFactory(captured), // records the system prompt it was handed
      modelId: 'test/model', label: 'test', prompt: 'hi', contextLength: 64_000,
    });
    expect(captured[0]).toContain(ASSISTANT_DEFAULT_BODY.slice(0, 60));
    expect(captured[0]).not.toBe('You are a helpful, careful assistant inside YouCoded.');
    expect(run.outcome).toBeDefined();
  });

  it('injects instructions through the real project-instructions path', async () => {
    const captured: string[] = [];
    await runCase({
      modelFactory: capturingFactory(captured),
      modelId: 'test/model', label: 'test', prompt: 'hi', contextLength: 64_000,
      instructions: '# Test rules\n\nAlways say banana.',
    });
    expect(captured[0]).toContain('<project-instructions source="CLAUDE.md">');
    expect(captured[0]).toContain('Always say banana.');
  });

  it('omits the project-instructions block when given none', async () => {
    const captured: string[] = [];
    await runCase({
      modelFactory: capturingFactory(captured),
      modelId: 'test/model', label: 'test', prompt: 'hi', contextLength: 64_000,
    });
    expect(captured[0]).not.toContain('<project-instructions');
  });
});
```

Add `capturingFactory` to `tests/helpers/harness-fakes.ts` — a `ModelFactory` that records `opts.systemPrompt` as passed to `HarnessSession` and then behaves like the existing scripted fake.

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run tests/harness-eval-runner.test.ts -t "system prompt assembly"
```
Expected: FAIL — the assembled prompt is the one-line fallback.

- [ ] **Step 3: Seed the instruction file and a `.git` marker**

In `fixture-workspace.ts`, change the signature and add two writes at the end of `seedFixtureWorkspace`:

```ts
export function seedFixtureWorkspace(instructions?: string | null): string {
  // ...existing writes unchanged...

  // WHY an empty .git directory: projectInstructions (prompt-assembly.ts:59-64)
  // walks UP from cwd looking for AGENTS.md/CLAUDE.md and only stops at a .git
  // directory or the filesystem root. Without this marker the walk escapes the
  // fixture into os.tmpdir() and beyond, so a stray CLAUDE.md anywhere above
  // /tmp would silently contaminate the no-instructions arm of an experiment.
  // git itself never runs against this — gitSnapshot's execFileSync fails and
  // is caught, reporting "Git: not a repository", the same as before.
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });

  // WHY written as a real file rather than handed to the session directly:
  // assembleSystemPrompt reads AGENTS.md/CLAUDE.md off disk. Feeding the text
  // in some other way would test a pretend version of the feature.
  if (instructions) write('CLAUDE.md', instructions);

  return root;
}
```

Add to `FIXTURE_MANIFEST`… **no** — the manifest documents files the *battery* touches, and these are neither. Instead add a standalone assertion in Task 3 Step 5.

- [ ] **Step 4: Assemble the real system prompt in `run-case.ts`**

Add imports:
```ts
import { assembleSystemPrompt } from '../prompt-assembly';
import { resolvePreset } from '../preset-registry';
```

Replace `const fixtureRoot = seedFixtureWorkspace();` with:
```ts
const fixtureRoot = seedFixtureWorkspace(opts.instructions);
```

And in the `HarnessSession` opts object, beside `harness: BATTERY_HARNESS`, add:

```ts
// Fix (2026-08-12): without this, HarnessSession falls through to
// opts.harness.systemPrompt — which harness-manifest.ts:12 documents as a
// "fallback one-liner" and which is literally one sentence. Every harness
// review to date ran on that sentence rather than the app's real prompt, so
// the battery has never tested the shipped prompt at all. Calling the real
// assembleSystemPrompt also gives us the <project-instructions> block, which
// is what makes a CLAUDE.md A/B possible.
systemPrompt: assembleSystemPrompt({
  presetBody: resolvePreset('assistant').body,
  cwd: fixtureRoot,
  appVersion: 'eval',
}),
```

- [ ] **Step 5: Add the fixture assertion**

In `tests/harness-review-fixture.test.ts`, add a NEW `it` (do not edit existing ones):

```ts
it('plants a .git marker so the instruction walk-up cannot escape the fixture', () => {
  const root = seedFixtureWorkspace();
  expect(fs.existsSync(path.join(root, '.git'))).toBe(true);
  fs.rmSync(root, { recursive: true, force: true });
});

it('writes instructions as CLAUDE.md only when given', () => {
  const withNone = seedFixtureWorkspace();
  expect(fs.existsSync(path.join(withNone, 'CLAUDE.md'))).toBe(false);
  const withSome = seedFixtureWorkspace('# hi');
  expect(fs.readFileSync(path.join(withSome, 'CLAUDE.md'), 'utf8')).toBe('# hi');
  fs.rmSync(withNone, { recursive: true, force: true });
  fs.rmSync(withSome, { recursive: true, force: true });
});
```

- [ ] **Step 6: Verify**

```bash
npx vitest run tests/harness-eval-runner.test.ts tests/harness-review-runner.test.ts tests/harness-review-fixture.test.ts
```
Expected: all pass; existing 69 unchanged plus the new ones.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "fix(eval): run on the real system prompt and read a CLAUDE.md

Two verified defects. HarnessSession resolves system text as
opts.systemPrompt ?? opts.harness.systemPrompt (harness-session.ts:492);
runCase passed neither, so every review ran on ASSISTANT_PRESET
.systemPrompt — documented at harness-manifest.ts:12 as a fallback
one-liner. And nothing ever called assembleSystemPrompt, so no CLAUDE.md
was ever read: an instruction A/B would have reported 'no difference'
for purely mechanical reasons.

The fixture now plants an empty .git so the walk-up cannot escape into
tmpdir and pick up a stray instruction file."
```

---

### Task 4: Make the tool-call floor per-task

`MIN_TOOL_CALLS = 10` in `run-facts.ts:17` is justified as *"below the 10 it takes to walk the battery"* — meaningless for a task like "explain this file", which should legitimately use two.

**Files:**
- Modify: `src/main/harness/eval/run-facts.ts`
- Test: `tests/harness-review-runner.test.ts` — **new assertions only**

**Interfaces:**
- Produces: `collectRunFacts(run: BatteryRun, minToolCalls?: number): RunFacts` — defaults to `MIN_TOOL_CALLS` (10).

- [ ] **Step 1: Write the failing test**

Add to `tests/harness-eval-runner.test.ts`:
```ts
it('uses the per-task floor when one is given', () => {
  const run = { review: '', metrics: { toolCalls: 3, toolsUsed: [] }, outcome: 'complete' } as any;
  expect(collectRunFacts(run, 2).belowFloor).toBe(false);
  expect(collectRunFacts(run).belowFloor).toBe(true);   // default 10 still applies
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run tests/harness-eval-runner.test.ts -t "per-task floor"
```
Expected: FAIL — `collectRunFacts` takes one argument.

- [ ] **Step 3: Implement**

```ts
/** WHY a parameter: MIN_TOOL_CALLS is "what it takes to walk the battery" and
 *  is nonsense for a task like "explain this file", where two calls is a
 *  complete answer. The default keeps every existing caller identical. */
export function collectRunFacts(run: BatteryRun, minToolCalls: number = MIN_TOOL_CALLS): RunFacts {
  // ...
  belowFloor: run.metrics.toolCalls < minToolCalls,
```
Update `renderRunFacts` to take the floor it was measured against so its warning text stays true:
```ts
export function renderRunFacts(facts: RunFacts, minToolCalls: number = MIN_TOOL_CALLS): string
```
and interpolate `minToolCalls` in place of `MIN_TOOL_CALLS` in the warning string.

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run tests/harness-eval-runner.test.ts tests/harness-review-runner.test.ts
git add -A && git commit -m "feat(eval): per-task tool-call floor, defaulting to the battery's 10"
```

- [ ] **Step 5: Phase gate**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh youcoded/worktrees/harness-eval
```
Expected: exit 0. Report the result to Destin before starting Phase 2.

---

# Phase 2 — Vary things

Goal: a test plan expands into a list of runs, each executes in its own process against a named build, and nothing is spent without a confirmed estimate. Done when `--dry-run` prints a correct 24-run grid and dollar figure with no API key.

---

### Task 5: Case definitions and the case registry

**Files:**
- Create: `src/main/harness/eval/case-types.ts`, `src/main/harness/eval/cases/index.ts`, `src/main/harness/eval/cases/harness-battery.ts`
- Test: `tests/harness-eval-cases.test.ts`

**Interfaces:**
- Produces:
```ts
export type CheckState = 'passed' | 'failed' | 'never-ran';
export interface CheckResult { id: string; state: CheckState; detail: string }
export interface Check { id: string; run(run: CaseRun): CheckResult }
export interface RubricItem { id: string; ask: string }
export interface EvalCase {
  id: string;
  prompt: string;
  wrapUpPrompt: string;
  /** Minimum tool calls for this task to have been attempted at all. */
  minToolCalls: number;
  expect: Check[];
  rubric: RubricItem[];
}
export function getCase(id: string): EvalCase;   // throws on unknown id, naming the known ids
export function allCaseIds(): string[];
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { getCase, allCaseIds } from '../src/main/harness/eval/cases';
import { BATTERY_PROMPT } from '../src/main/harness/eval/battery';

describe('case registry', () => {
  it('carries the battery as a case', () => {
    expect(getCase('harness-battery').prompt).toBe(BATTERY_PROMPT);
    expect(getCase('harness-battery').minToolCalls).toBe(10);
  });
  it('names the known ids when asked for an unknown one', () => {
    expect(() => getCase('nope')).toThrow(/harness-battery/);
  });
  it('lists ids in a stable order', () => {
    expect(allCaseIds()).toEqual([...allCaseIds()].sort());
  });
});
```

- [ ] **Step 2: Run and watch it fail** — `npx vitest run tests/harness-eval-cases.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement `case-types.ts`** with the interfaces above verbatim.

- [ ] **Step 4: Implement `cases/harness-battery.ts`**

```ts
import { BATTERY_PROMPT } from '../battery';
import { WRAP_UP_PROMPT } from '../run-case';
import type { EvalCase } from '../case-types';
import { calledTool, stayedInsideTestFolder, endedWithAnAnswer } from '../assertions';

/** The original harness review, now one case among many. Its checks are
 *  deliberately thin: this case's value is the model's PROSE, which found nine
 *  real defects that 4,500 unit tests missed. Scoring it hard would be scoring
 *  the wrong thing. */
export const HARNESS_BATTERY: EvalCase = {
  id: 'harness-battery',
  prompt: BATTERY_PROMPT,
  wrapUpPrompt: WRAP_UP_PROMPT,
  minToolCalls: 10,
  expect: [stayedInsideTestFolder(), endedWithAnAnswer(), calledTool('Grep')],
  rubric: [],
};
```

Note the ordering dependency: this imports from `assertions.ts`, built in Task 9. Build Task 9 first, or stub `expect: []` here and fill it in Task 9's commit. **Choose the stub** — it keeps Phase 2 independently verifiable.

- [ ] **Step 5: Implement `cases/index.ts`**

```ts
import { HARNESS_BATTERY } from './harness-battery';
import type { EvalCase } from '../case-types';

const CASES: Record<string, EvalCase> = { [HARNESS_BATTERY.id]: HARNESS_BATTERY };

export function allCaseIds(): string[] { return Object.keys(CASES).sort(); }

export function getCase(id: string): EvalCase {
  const found = CASES[id];
  // WHY name the known ids: a typo'd case id in a test plan is the most likely
  // failure here, and "unknown case: confgi-investigation" without the list
  // sends you reading source to find the right spelling.
  if (!found) throw new Error(`Unknown case "${id}". Known cases: ${allCaseIds().join(', ')}`);
  return found;
}
```

- [ ] **Step 6: Verify and commit**

```bash
npx vitest run tests/harness-eval-cases.test.ts
git add -A && git commit -m "feat(eval): case definitions and registry, battery as case #1"
```

---

### Task 6: Test plan format and matrix expansion

**Files:**
- Create: `src/main/harness/eval/matrix.ts`
- Test: `tests/harness-eval-matrix.test.ts`

**Interfaces:**
- Produces:
```ts
export interface InstructionArm { id: string; file: string | null }
export interface BuildArm { id: string; dist: string }
export interface EvalPlan {
  name: string;
  cases: string[];
  instructions: InstructionArm[];
  models: string[];              // roster labels
  builds?: BuildArm[];           // default [{ id: 'current', dist: '.' }]
  judge?: string | null;         // OpenRouter model id; null/absent = no judging
  repeats?: number;              // default 1
}
export interface Cell {
  id: string;                    // stable: `${caseId}|${instructionsId}|${model}|${buildId}|${repeat}`
  caseId: string; instructionsId: string; model: string; buildId: string; dist: string; repeat: number;
}
export function expandPlan(plan: EvalPlan): Cell[];
export function validatePlan(plan: unknown, knownCaseIds: string[], knownModels: string[]): EvalPlan;
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { expandPlan, validatePlan } from '../src/main/harness/eval/matrix';

const PLAN = {
  name: 'x',
  cases: ['a', 'b'],
  instructions: [{ id: 'none', file: null }, { id: 'draft', file: 'd.md' }],
  models: ['M1', 'M2'],
};

describe('expandPlan', () => {
  it('produces one cell per combination', () => {
    expect(expandPlan(PLAN as any)).toHaveLength(2 * 2 * 2);
  });
  it('multiplies by repeats', () => {
    expect(expandPlan({ ...PLAN, repeats: 3 } as any)).toHaveLength(2 * 2 * 2 * 3);
  });
  it('gives every cell a unique stable id', () => {
    const ids = expandPlan(PLAN as any).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(expandPlan(PLAN as any).map((c) => c.id)).toEqual(ids); // deterministic order
  });
  it('defaults to a single current build', () => {
    expect(expandPlan(PLAN as any).every((c) => c.buildId === 'current')).toBe(true);
  });
});

describe('validatePlan', () => {
  it('rejects an unknown case id and names the known ones', () => {
    expect(() => validatePlan({ ...PLAN, cases: ['nope'] }, ['a', 'b'], ['M1', 'M2']))
      .toThrow(/nope.*a, b/s);
  });
  it('rejects an unknown model label', () => {
    expect(() => validatePlan({ ...PLAN, models: ['M9'] }, ['a', 'b'], ['M1', 'M2']))
      .toThrow(/M9/);
  });
  it('rejects duplicate instruction arm ids', () => {
    expect(() => validatePlan(
      { ...PLAN, instructions: [{ id: 'none', file: null }, { id: 'none', file: 'x.md' }] },
      ['a', 'b'], ['M1', 'M2'],
    )).toThrow(/duplicate/i);
  });
});
```

- [ ] **Step 2: Run and watch it fail** — Expected: module not found.

- [ ] **Step 3: Implement `matrix.ts`**

Expansion order is cases → instructions → models → builds → repeats (outermost first), so the report reads case-by-case. `validatePlan` checks: name is a non-empty string; every case id is in `knownCaseIds`; every model is in `knownModels`; instruction arm ids are unique and non-empty; `repeats` is a positive integer; every build has a distinct id. Each failure message names the bad value AND the valid set — same reasoning as `getCase`.

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run tests/harness-eval-matrix.test.ts
git add -A && git commit -m "feat(eval): test plan validation and matrix expansion"
```

---

### Task 7: One worker process per run

**Files:**
- Create: `test-engine/harness-eval-worker.mjs`, `test-engine/harness-eval.mjs`
- Test: `tests/harness-eval-orchestrator.test.ts`

**Interfaces:**
- The worker reads one JSON config on `argv[2]`, runs exactly one cell, and prints **one** JSON object to stdout: `{ cellId, run: CaseRun, error?: string }`. Everything else it prints goes to stderr.
- Produces: `runCell(cell, { distRoot, apiKey }): Promise<CellResult>` in the orchestrator.

- [ ] **Step 1: Write the failing test**

The orchestrator's grader resolution is the invariant worth pinning; the subprocess itself is exercised in Phase 4.

```ts
import { describe, it, expect } from 'vitest';
import { graderRoot, harnessRoot } from '../src/main/harness/eval/paths';

describe('grader isolation', () => {
  it('resolves graders against its own checkout, never the dist under test', () => {
    expect(graderRoot({ dist: '/somewhere/else/dist' })).not.toContain('/somewhere/else');
  });
  it('resolves the harness under test against the given dist', () => {
    expect(harnessRoot({ dist: '/somewhere/else/dist' })).toContain('/somewhere/else');
  });
});
```

- [ ] **Step 2: Run and watch it fail.**

- [ ] **Step 3: Create `src/main/harness/eval/paths.ts`**

```ts
// WHY this file exists at all: comparing your branch against master must not
// silently compare two GRADERS as well as two harnesses. The orchestrator
// always loads assertions/judge/report from its own checkout; only the worker
// loads the dist under test. Two functions so the distinction is impossible to
// get wrong by accident, and testable without spawning anything.
export function graderRoot(_cell: { dist: string }): string { /* own checkout */ }
export function harnessRoot(cell: { dist: string }): string { /* the cell's dist */ }
```

- [ ] **Step 4: Write the worker**

`harness-eval-worker.mjs` — reads config JSON, imports `runCase` from `<dist>/main/harness/eval/run-case.js`, calls it, writes the result JSON to stdout. It must:
- delete `OPENROUTER_API_KEY` from `process.env` before running, exactly as `review-harness.mjs:113` does and for the identical reason (the Bash tool spawns subprocesses with `env: process.env` and the battery invites `env`/`printenv`);
- write nothing but the result JSON to stdout;
- exit non-zero with the real error on stderr if the run could not start.

- [ ] **Step 5: Write the orchestrator skeleton**

`harness-eval.mjs` — flags `--plan <file>`, `--dry-run`, `--yes`, `--max-spend <usd>`, `--only <cellId>`, `--repeats <n>`. For now: load and validate the plan, expand it, and print the grid. Spawning comes alive in this task; estimate and cap arrive in Task 8.

- [ ] **Step 6: Verify and commit**

```bash
npx vitest run tests/harness-eval-orchestrator.test.ts && npx tsc --noEmit
git add -A && git commit -m "feat(eval): per-cell worker process and grader-isolation paths"
```

---

### Task 8c: Load the instruction files (added 2026-08-12 — this was an ORPHAN)

**Nothing in this plan owned reading an instruction file from disk.** The plan format defines `instructions: [{id, file}]`, `expandPlan` carries `instructionsFile` onto every cell, `runCell` refuses to run when a cell declares a file but no text was supplied, and Task 12 writes `draft.md`/`tightened.md` — but no task ever connected the two. `main()` never passes `instructionsText`, so every guidance arm would either refuse to run or run identically.

Same failure shape as the `BatteryRun`→`CaseRun` rename (Task 13 Step 0): a step described in prose in one task's narrative, fenced out of that task's file list, and therefore assigned to nobody. It matters more here because the instructions axis **is** the first real experiment.

- Read each arm's `file` relative to the **plan file's** directory (the same base `readPlanFile` already resolves `build.dist` against), not the cwd.
- A declared file that cannot be read must fail **before** any spend, naming the path and the real I/O error.
- Pass the text to `runCell` as `instructionsText`; it reaches `runCase`'s `instructions` option, which writes it into the fixture as a real `CLAUDE.md` (Task 3).
- **Guard the axis actually differs:** two arms resolving to identical text is not a comparison. Reject it before spending, the same way `validatePlan` already rejects two `null` baselines.
- Test that two arms produce two different `CLAUDE.md` bodies reaching the session — the shape guard added in Task 7 proves only that an arm *declared* itself. Prove it discriminates.

### Task 8: Estimate and spend cap

> **BINDING CONSTRAINT added 2026-08-12 — the API key must NOT reach the orchestrator through an inherited environment variable.**
>
> Task 7 took three rounds to close this class and the third round still left it open one process up. The mechanism: `delete process.env.X` is `unsetenv`, which edits the in-heap environ array and never rewrites the region the kernel exposes at `/proc/<pid>/environ`. That region is readable by any same-uid process, and the model's Bash tool is a same-uid **descendant** — not just a child. Task 7's worker is now clean (config, key included, arrives over stdin with an allowlisted child environment), but Task 8 is where a process first actually *holds* a key, and the existing convention (`OPENROUTER_API_KEY=sk-... node …`, see `review-harness.mjs:100` and `openrouter-factory.ts:14`) would put it straight back into an inherited environ. Measured on the real three-process topology: worker environ CLEAN, **orchestrator environ LEAKED**, own inherited env CLEAN.
>
> So: read the credential from a file (`--key-file`), or prompt for it, or any mechanism that never places it in the orchestrator's environment. Then extend the leak detector to probe the **grandparent** (`/proc/<orchestrator-pid>/environ` and `ps eww` against it) from a Bash-tool-style grandchild, and keep a negative control that reproduces the env-inherited style and reports LEAKED — a detector that cannot see the old bug certifies nothing. Three rounds of this were each certified by a detector that probed exactly the boundary it was aimed at; the whole threat model is "any channel a **descendant** can read", so the detector's boundary must be the outermost key-holding process, not the nearest one.
>
> Same session also recorded the identical hole in the shipped `review-harness.mjs` — see `ROADMAP.md` → Bugs (2026-08-12).

> **STEP 0 — INTEGRATION, do this before any estimate work. Verified live on the merged branch 2026-08-12.**
>
> Phase 2's three tasks were built in isolated worktrees and forbidden from importing each other, so Task 7 wrote its own local `loadPlan`/`expandPlan` inside `test-engine/harness-eval.mjs`. Git merged all three **cleanly** — they are different files — and `verify.sh` passes. Measured after the merge:
> - `test-engine/harness-eval.mjs` still defines its own `loadPlan` **and** `expandPlan` (2 matches), while `src/main/harness/eval/matrix.ts` exports `validatePlan` **and** `expandPlan` (2 matches). **Two plan validators, and they already disagree** — the local one never cross-checks case ids or roster labels, which is `validatePlan`'s whole job.
> - `cellFilename` — the Windows-safe filename builder that cost a full review round (the raw cell id contains `|`, which is Windows-reserved, and spaces from roster labels like `"Claude Opus 5"`) — is referenced **zero times** in `harness-eval.mjs`. The orchestrator is not using it.
>
> Nothing fails, which is the hazard: a clean merge plus a green gate reads as "integrated" when the two halves have never been connected.
>
> **Required:** delete the local `loadPlan`/`expandPlan` from `harness-eval.mjs` — *delete and replace*, never merge the two — import the real ones from `dist/main/harness/eval/matrix.js`, thread `knownCaseIds`/`knownModels` into `validatePlan` from `cases/index.js` and the roster, and use `cellFilename` for every path derived from a cell. Then re-run Task 7's own tests: several pin behaviour of the local validator and must be repointed, not deleted.

**Files:**
- Create: `src/main/harness/eval/estimate.ts`
- Modify: `test-engine/harness-eval.mjs`
- Test: `tests/harness-eval-estimate.test.ts`

**Interfaces:**
- Produces:
```ts
/** Measured whole-run output totals, from run-case.ts:190-195. */
export const MEASURED_OUTPUT_TOKENS: Record<string, number>;
export interface Price { inputPerM: number; outputPerM: number }
export function estimateCells(cells: Cell[], prices: Record<string, Price>): {
  perCell: { cellId: string; usd: number }[]; totalUsd: number; unpriced: string[];
};
```

- [ ] **Step 1: Write the failing test**

```ts
it('multiplies measured tokens by price and totals the matrix', () => {
  const cells = [{ cellId: 'c1', model: 'M1' }, { cellId: 'c2', model: 'M1' }] as any;
  const out = estimateCells(cells, { M1: { inputPerM: 1, outputPerM: 10 } });
  expect(out.totalUsd).toBeCloseTo(out.perCell[0].usd * 2, 10);
});

it('reports unpriced models instead of silently costing them zero', () => {
  const out = estimateCells([{ cellId: 'c1', model: 'MYSTERY' }] as any, {});
  expect(out.unpriced).toEqual(['MYSTERY']);
});
```

The second test is the important one: a model with no price entry must be **named**, never treated as free. A silent zero is how an estimate lies.

- [ ] **Step 2: Run and watch it fail.**

- [ ] **Step 3: Implement `estimate.ts`.** Seed `MEASURED_OUTPUT_TOKENS` from the figures already recorded in `run-case.ts:190-195` — Opus 5 8,379; Qwen 3.8 Max 11,766; Deepseek v4 Flash 0731 9,530; GPT 5.6 Luna 4,098; Grok 4.5 3,662 — with a WHY comment saying these are battery-sized runs and a short task will cost less.

- [ ] **Step 4: Wire the confirmation gate into the orchestrator**

Before the first spawn: print the grid, the per-cell and total dollar figures, and any unpriced models. Then require an interactive `y` or the `--yes` flag. `--dry-run` prints all of this and exits 0 **without needing an API key**.

- [ ] **Step 5: Wire the spend cap**

Between cells, if `--max-spend` was given, query `/api/v1/key` for real usage. If spend since start exceeds the cap: stop, write the report for completed cells, and print exactly which cells never ran. **Never** kill a cell mid-flight — a half-run costs the same as a whole one and yields nothing.

- [ ] **Step 6: Verify and commit**

```bash
npx vitest run tests/harness-eval-estimate.test.ts
node test-engine/harness-eval.mjs --plan test-engine/eval-plans/claude-md-guidance.json --dry-run
```
Expected: prints a 24-cell grid and a dollar figure, exits 0, no key needed. (The plan file is written in Task 12 — until then dry-run against a small hand-made plan.)

```bash
git add -A && git commit -m "feat(eval): forced cost estimate and hard spend cap"
```

- [ ] **Step 7: Phase gate** — `bash scripts/verify.sh` from the workspace root; report to Destin.

---

# Phase 3 — Grade things

Goal: a canned conversation produces a correct report, entirely offline.

---

### Task 9: The counter (`assertions.ts`)

**Files:**
- Create: `src/main/harness/eval/assertions.ts`
- Modify: `src/main/harness/eval/cases/harness-battery.ts` (fill in the stubbed `expect`)
- Test: `tests/harness-eval-assertions.test.ts`

**Interfaces:**
- Produces these `Check` factories: `calledTool(name)`, `stayedInsideTestFolder()`, `endedWithAnAnswer()`, `askedInsteadOfGuessing()`, `noToolErrors()`, `underWords(n)`.

- [ ] **Step 1: Write the failing tests — the three-state rule first**

```ts
it('reports never-ran, not passed, when the precondition never occurred', () => {
  const run = { events: [], metrics: { toolsUsed: [] } } as any;   // model never called a tool
  expect(noToolErrors().run(run).state).toBe('never-ran');
});

it('passes only on positive evidence', () => {
  expect(calledTool('Grep').run({ metrics: { toolsUsed: ['Grep'] } } as any).state).toBe('passed');
  expect(calledTool('Grep').run({ metrics: { toolsUsed: ['Read'] } } as any).state).toBe('failed');
});

it('carries the deciding evidence in detail', () => {
  expect(calledTool('Grep').run({ metrics: { toolsUsed: ['Read'] } } as any).detail)
    .toContain('Read');
});
```

The first test is the guard against the `notes/pristine.md` class of bug: a check whose setup never happened must not silently pass.

- [ ] **Step 2: Run and watch it fail.**

- [ ] **Step 3: Implement.** Every check returns `never-ran` when its precondition is absent, and every `detail` names the evidence that decided it.

- [ ] **Step 4: Fill in the battery case's `expect`** with `[stayedInsideTestFolder(), endedWithAnAnswer(), calledTool('Grep')]`.

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run tests/harness-eval-assertions.test.ts tests/harness-eval-cases.test.ts
git add -A && git commit -m "feat(eval): three-state event-stream checks"
```

---

### Task 10: The judge

**Files:**
- Create: `src/main/harness/eval/judge.ts`
- Test: `tests/harness-eval-judge.test.ts`

**Interfaces:**
- Produces:
```ts
export interface Grade { id: string; score: number; quote: string; }
export interface JudgeResult { grades: Grade[]; unavailable?: string; warnings: string[] }
export async function judgeRun(
  run: CaseRun, rubric: RubricItem[],
  judge: { modelId: string; factory: ModelFactory } | null,
  checks: CheckResult[],
): Promise<JudgeResult>;
```

- [ ] **Step 1: Write the failing tests**

```ts
it('drops a grade that carries no quote', async () => {
  const r = await judgeRun(RUN, RUBRIC, fakeJudge([{ id: 'a', score: 5, quote: '' }]), []);
  expect(r.grades).toHaveLength(0);
  expect(r.warnings.join()).toMatch(/quote/i);
});

it('drops a grade whose quote is not in the transcript', async () => {
  const r = await judgeRun(RUN, RUBRIC, fakeJudge([{ id: 'a', score: 5, quote: 'never said this' }]), []);
  expect(r.grades).toHaveLength(0);
});

it('warns when the judge contradicts a check instead of averaging it in', async () => {
  const checks = [{ id: 'calledTool:Grep', state: 'passed', detail: 'Grep' }] as any;
  const r = await judgeRun(RUN, RUBRIC, fakeJudge([
    { id: 'searched', score: 0, quote: '...', reason: 'it never searched the code' },
  ]), checks);
  expect(r.warnings.join()).toMatch(/contradict/i);
});

it('a broken judge never costs the run its other results', async () => {
  const r = await judgeRun(RUN, RUBRIC, throwingJudge(), []);
  expect(r.unavailable).toBeTruthy();
  expect(r.grades).toEqual([]);
});

it('flags self-grading when the judge is also under test', async () => {
  const r = await judgeRun({ ...RUN, modelId: 'anthropic/claude-opus-5' } as any, RUBRIC,
    fakeJudge([], 'anthropic/claude-opus-5'), []);
  expect(r.warnings.join()).toMatch(/self-grad/i);
});
```

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Implement.** The judge gets the run's final text plus a compact tool-call list, and the rubric. It must return strict JSON. A grade is kept only if its `quote` appears verbatim in the run's text — this is the whole falsifiability mechanism, so it is enforced in code, not asked for politely in the prompt.

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run tests/harness-eval-judge.test.ts
git add -A && git commit -m "feat(eval): rubric judge with enforced quotes and contradiction warnings"
```

---

### Task 11: The report

**Files:**
- Create: `src/main/harness/eval/report.ts`
- Test: `tests/harness-eval-report.test.ts`

**Interfaces:**
- Produces: `renderReport(plan: EvalPlan, results: CellResult[], meta: { startedISO: string; buildSha: string }): string` — pure, no I/O.

- [ ] **Step 1: Write the failing tests**

```ts
it('is pure — same input, byte-identical output', () => {
  expect(renderReport(PLAN, RESULTS, META)).toBe(renderReport(PLAN, RESULTS, META));
});

it('states the single-run caveat when repeats is 1', () => {
  expect(renderReport({ ...PLAN, repeats: 1 }, RESULTS, META)).toMatch(/one run per combination/i);
});

it('names cells that never ran rather than omitting them', () => {
  const out = renderReport(PLAN, [], META);
  expect(out).toMatch(/did not run/i);
});

it('shows never-ran checks distinctly from passed ones', () => {
  expect(renderReport(PLAN, [WITH_NEVER_RAN_CHECK], META)).toMatch(/never ran/i);
});
```

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Implement.** A grid (rows = cases, columns = instruction arms, one block per model), then full written answers, then a pointer to the raw transcripts. The single-run caveat and the no-resume note are printed unconditionally, per the spec's "stated limits".

- [ ] **Step 4: Wire it into the orchestrator** — write the report to `docs/active/investigations/harness-eval-runs/<date>/report.md` and each cell's raw conversation to the same directory, transcript first, before grading.

- [ ] **Step 5: Add the gitignore entry**

In the workspace repo's `.gitignore`, beside lines 62-63:
```
docs/active/investigations/harness-eval-runs/
```

- [ ] **Step 6: Verify and commit**

```bash
npx vitest run tests/harness-eval-report.test.ts
git add -A && git commit -m "feat(eval): pure report renderer with stated limits"
```

- [ ] **Step 7: Phase gate** — `bash scripts/verify.sh`; report to Destin.

---

# Phase 4 — Use it

---

### Task 12: Write the tasks and instruction variants, then run the experiment

**Files:**
- Create: `src/main/harness/eval/cases/config-investigation.ts`, `options-proposal.ts`, `port-bump.ts`, `code-explanation.ts`
- Create: `test-engine/eval-guidance/draft.md`, `test-engine/eval-guidance/tightened.md`
- Create: `test-engine/eval-plans/claude-md-guidance.json`
- Modify: `src/main/harness/eval/cases/index.ts`

- [ ] **Step 1: Write `draft.md`** — Destin's proposed text, verbatim, no edits.

- [ ] **Step 2: Write `tightened.md`** — the same intent with the internal tension resolved. The draft asks for *thorough* explanation, the *fewest possible words*, and pros/cons of *all* options; a model cannot maximise all three. The tightened version states an explicit priority order instead of three competing absolutes.

- [ ] **Step 3: Write the four cases.** Each names its prompt, a wrap-up prompt matching the task (not the battery's "review the harness"), `minToolCalls`, checks, and a rubric. Rubric questions must be answerable from the run's text alone.

- [ ] **Step 4: Write the plan file**

```json
{
  "name": "claude-md-guidance",
  "cases": ["config-investigation", "options-proposal", "port-bump", "code-explanation"],
  "instructions": [
    { "id": "none",      "file": null },
    { "id": "draft",     "file": "test-engine/eval-guidance/draft.md" },
    { "id": "tightened", "file": "test-engine/eval-guidance/tightened.md" }
  ],
  "models": ["Claude Opus 5", "Qwen 3.8 Max"],
  "judge": "x-ai/grok-4.5"
}
```

Judge choice is deliberate: Grok is in the roster but **not** under test here, so no cell is graded by itself. The spec permits self-grading with a flag; avoiding it entirely is better.

- [ ] **Step 5: Dry run**

```bash
npm run build:main
node test-engine/harness-eval.mjs --plan test-engine/eval-plans/claude-md-guidance.json --dry-run
```
Expected: 24 cells listed, a dollar estimate, no unpriced models, exit 0, no API key needed.

- [ ] **Step 6: STOP. Report the estimate to Destin and wait.**

Do not spend. Show the cell count and the dollar figure and ask whether to proceed.

- [ ] **Step 7: On approval, run it**

```bash
OPENROUTER_API_KEY=sk-... node test-engine/harness-eval.mjs \
  --plan test-engine/eval-plans/claude-md-guidance.json --max-spend 8
```

- [ ] **Step 8: Read the report and spot-check three grades** against their quotes before reporting any conclusion. A judge grade whose quote you haven't verified is not evidence.

- [ ] **Step 9: Commit the report** (not the transcripts — they are gitignored).

---

### Task 13: Documentation

- [ ] **Step 0 (code cleanup — added 2026-08-12, do this first):** three deferred renames now have no other owner. Task 2's interface block said `BatteryRun`/`BatteryMetrics`/`BatteryOutcome` "are renamed in Task 5", but Task 5's brief excluded `run-case.ts` (the shared file its parallel siblings were forbidden to touch), so Task 5 aliased `export type CaseRun = BatteryRun` instead and the rename fell through. Converge them here:
  - Rename `BatteryRun` → `CaseRun`, `BatteryMetrics` → `CaseMetrics`, `BatteryOutcome` → `CaseOutcome` in `run-case.ts`; delete the alias in `case-types.ts`.
  - Delete the `runBattery` delegating function (`run-case.ts`, added in Task 2 so the pinning tests stayed untouched) and update its ~35 call sites in `tests/harness-review-runner.test.ts` plus 2 in `test-engine/review-harness.mjs`. The "tests unchanged" evidence has served its purpose by now — Phases 1–3 all passed with it intact.
  - Sweep the stale `run-battery.ts` / `run-battery.js` mentions left in comments across `test-engine/review-harness.mjs` and both pinning test files, and the hardcoded `src/main/harness/review/battery.ts` string in `eval/append-review.ts:59` (it renders a now-nonexistent path into report output).
  - Gate: `bash scripts/verify.sh` plus the full `npx vitest run` — this is a wide mechanical rename and `tsc` will not catch the `.mjs` call sites.

- [ ] **Step 1:** `git mv .claude/rules/harness-review-runner.md .claude/rules/harness-evaluator.md`; widen the body to cover the evaluator; repoint `paths:` to `youcoded/desktop/src/main/harness/eval/**` and `test-engine/harness-eval.mjs`; update every `verify:` anchor to the new paths.

- [ ] **Step 2:** `git mv youcoded/docs/harness-review-runner-internals.md youcoded/docs/harness-evaluator-internals.md` and repoint its anchors. **Note:** this file is currently untracked in the main checkout — confirm it is committed before moving, or the move silently loses it.

- [ ] **Step 3:** Update `test-engine/README.md` — replace the "Review harness" section with the evaluator, keeping the `--dry-run`-is-free framing.

- [ ] **Step 4:** Move the spec to `docs/archive/specs/` and flip the roadmap's step 2 to reflect what actually shipped (the evaluator; **not** the promptfoo CI gate, which was considered and rejected).

- [ ] **Step 5:** `node scripts/audit-anchors.mjs` — expected: no broken anchors.

- [ ] **Step 6: Commit and merge.** Merge to master, push, then remove the worktree and delete the branch locally and remotely.

---

## Self-review notes

**Spec coverage:** every spec section maps to a task — instruction injection (3), version axis (7), model axis (6, already data), estimate + cap (8), counter (9), judge incl. self-grading flag (10), report incl. stated limits (11), the `.git` marker (3), grader isolation (7), per-task floor (4), phasing (all).

**Known ordering hazard:** `cases/harness-battery.ts` (Task 5) imports from `assertions.ts` (Task 9). Task 5 Step 4 resolves this by stubbing `expect: []` and Task 9 Step 4 fills it in. Do not "fix" it by reordering the phases — Phase 2 must stay independently verifiable.

**Deliberately deferred:** resume-from-partial; promptfoo output adapter; run-time tool description overrides. All three are named in the spec as out of scope.
