---
status: shipped
---

# Review Runner Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the harness review battery always end in either a review or a diagnosable artifact, instead of a dead turn and a missing transcript.

**Architecture:** Three failure modes (step budget exhausted, model restarting the battery, wall clock elapsed) converge on one new mechanism — interrupt the testing turn, then send a second turn that asks for the review with tool calls denied. Separately, `runBattery` stops throwing for any run that produced events, returns an `outcome` plus a metrics block, and a new pure `run-facts` module stamps every appended review with what the transcript actually shows.

**Tech Stack:** TypeScript, Node (no Electron), vitest with `MockLanguageModelV4` fakes. The runner lives in `desktop/src/main/harness/review/` and is driven by `desktop/test-engine/review-harness.mjs`.

**Spec:** `docs/active/specs/2026-08-10-harness-review-runner-resilience-design.md`

## Global Constraints

- All work happens in a **new git worktree off `youcoded` master (`eba51705`)** — not in `worktrees/bash-env`, which carries independent unmerged work. Create it with `git worktree add worktrees/review-resilience -b feat/review-runner-resilience master` from `/home/destin/youcoded-dev/youcoded`.
- Every path below is relative to `youcoded/worktrees/review-resilience/desktop/` unless stated otherwise.
- **`modelFactory` is called once per `send()`** (`src/main/harness/harness-session.ts:1020`). Any test that spans two turns MUST hoist the fake model out of the factory: `const model = scriptModel(steps); modelFactory: async () => model as any`. Writing `async () => scriptModel(steps)` gives the wrap-up turn a fresh model replaying the script from step 0.
- **Never mutate `ASSISTANT_PRESET`.** It is a shared module-level const used by every real app session (`src/shared/harness-manifest.ts`). Layer overrides onto a fresh object, as `BATTERY_HARNESS` already does.
- **Never write outside `os.tmpdir()`.** The fixture jail is held by `askUser` denying every non-`AskUserQuestion` ask. Do not relax that.
- **Error text is real or non-committal, never guessed** (`docs/error-message-standards.md`). When recording a caught error, carry its actual message.
- **Annotate every non-trivial edit with a WHY comment.** Destin is a non-developer and reads the comments to understand the code.
- Constants, exact values: `BATTERY_STEP_BUDGET = 100`, `STEP_GATE_ALLOWANCE = 1`, `BATTERY_TIMEOUT_MS = 1_200_000`, `WRAP_UP_TIMEOUT_MS = 120_000`, `REPEAT_LIMIT = 5`, `MIN_TOOL_CALLS = 10`.
- Run `bash scripts/verify.sh worktrees/review-resilience` (from `/home/destin/youcoded-dev`) before the final commit of each task that touches `src/`.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/main/harness/review/run-battery.ts` | Modify — budget constants, metrics, outcome, salvage, wrap-up turn, restart detection | 1–4 |
| `src/main/harness/review/run-facts.ts` | **Create** — pure: collect facts from a run, detect unbacked claims, render markdown | 5 |
| `src/main/harness/review/append-review.ts` | Modify — accept a rendered facts block | 5 |
| `test-engine/review-harness.mjs` | Modify — always write the transcript, new per-model output, pass facts to `appendReview` | 6 |
| `tests/harness-review-runner.test.ts` | Modify — budget, salvage, wrap-up, restart, facts tests | 1–5 |
| `.claude/rules/harness-review-runner.md` (workspace repo) | Modify — new constants and behaviors in the rule body + `verify:` anchors | 7 |

`run-facts.ts` is a separate file rather than more of `run-battery.ts` because it is **pure** — it takes a finished `BatteryRun` and returns strings. That is what makes the fabrication check unit-testable without running a session, which is the entire point of extracting it.

---

## Task 1: Give the battery its own step budget

The runner inherits `stepBudgetFor(modelId)` — 25 steps for most models, 50 for frontier ones (`src/main/harness/model-step-budget.ts`). Those are tuned for interactive chat. A battery is 37–80 tool calls whichever model runs it, so it hits the gate as a matter of routine and the gate stops meaning anything.

**Files:**
- Modify: `src/main/harness/review/run-battery.ts:61` (`STEP_GATE_ALLOWANCE`), `:99-102` (`BATTERY_HARNESS`)
- Test: `tests/harness-review-runner.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `export const BATTERY_STEP_BUDGET = 100` and the existing `export const STEP_GATE_ALLOWANCE` (value changes 4 → 1). Tasks 3 and 4 import both.

- [ ] **Step 1: Write the failing test**

Add to `tests/harness-review-runner.test.ts`, inside the existing top-level scope (after the `runBattery output ceiling` describe block):

```ts
import { BATTERY_HARNESS, BATTERY_STEP_BUDGET } from '../src/main/harness/review/run-battery';
import { FRONTIER_STEP_BUDGET } from '../src/main/harness/model-step-budget';

describe('battery step budget', () => {
  it('sets its own maxSteps instead of inheriting the app chat-tier budget', () => {
    expect(BATTERY_HARNESS.limits?.maxSteps).toBe(BATTERY_STEP_BUDGET);
  });

  it('is uniform — a frontier model gets the same budget as any other', () => {
    // WHY assert this rather than just reading the constant: harness-session.ts:1008
    // is `harness.limits?.maxSteps ?? stepBudgetFor(modelId)`. As long as maxSteps
    // is set, stepBudgetFor never runs, so the 25/50 tier split cannot leak in.
    // If someone later deletes the maxSteps line, this is the test that notices.
    expect(BATTERY_STEP_BUDGET).not.toBe(FRONTIER_STEP_BUDGET);
    expect(BATTERY_HARNESS.limits?.maxSteps).toBe(BATTERY_STEP_BUDGET);
  });

  it('allows exactly one budget continuation before the gate means something', () => {
    expect(STEP_GATE_ALLOWANCE).toBe(1);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd /home/destin/youcoded-dev/youcoded/worktrees/review-resilience/desktop
npx vitest run tests/harness-review-runner.test.ts -t "battery step budget"
```

Expected: FAIL — `BATTERY_HARNESS` and `BATTERY_STEP_BUDGET` are not exported (`run-battery.ts:99` declares `BATTERY_HARNESS` as a module-private `const`).

- [ ] **Step 3: Implement**

In `src/main/harness/review/run-battery.ts`, change `STEP_GATE_ALLOWANCE` from `4` to `1` and replace its WHY comment's final paragraph (the "WHY 4, not unbounded or 1" block at `:49-60`) with:

```ts
// WHY 1, not 4: the allowance used to compensate for a budget (25/50, chosen by
// model tier) that was far too small for a battery, so gates fired as a matter
// of routine and the allowance was really just a multiplier. BATTERY_STEP_BUDGET
// below sets 100 directly, above every healthy run ever measured (round 4: Kimi
// K3 56 tool calls, Deepseek 47, Grok 37, GPT 47, Opus 80), so reaching the gate
// at all is now real signal. One continuation is grace for an unusually thorough
// run; past that the run wraps up (see WRAP_UP_PROMPT) rather than dying, so the
// cap no longer costs a paid run its review the way it cost Opus 5 on 2026-08-09.
// Ceiling: 2 windows * 100 = 200 steps, then a wrap-up turn.
export const STEP_GATE_ALLOWANCE = 1;

// The battery's own step ceiling, replacing the per-model tier split in
// model-step-budget.ts (25 default / 50 frontier). WHY uniform: that split is
// tuned for interactive chat, where a long tool chain usually means the model
// is lost. The battery is the same size of job — walk ten tools through seven
// areas — whichever model runs it, so tiering it just means the cheap models
// get cut off mid-review. 100 is above every healthy run measured to date.
//
// WHY it works: harness-session.ts:1008 resolves the budget as
// `this.opts.harness.limits?.maxSteps ?? stepBudgetFor(this.binding.modelId)`,
// so setting maxSteps on BATTERY_HARNESS below is sufficient — stepBudgetFor
// is never consulted. Same layering already used for BATTERY_MAX_OUTPUT_TOKENS,
// and equally confined to the runner's own copy of ASSISTANT_PRESET.
export const BATTERY_STEP_BUDGET = 100;
```

Then export `BATTERY_HARNESS` and add the budget to it:

```ts
export const BATTERY_HARNESS = {
  ...ASSISTANT_PRESET,
  limits: {
    ...ASSISTANT_PRESET.limits,
    maxTokens: BATTERY_MAX_OUTPUT_TOKENS,
    maxSteps: BATTERY_STEP_BUDGET,
  },
};
```

- [ ] **Step 4: Fix the two existing budget tests that assumed the old numbers**

`tests/harness-review-runner.test.ts:488` and `:521` script `DEFAULT_STEP_BUDGET`-sized windows. Both must switch to `BATTERY_STEP_BUDGET`. In the first test (`survives the max_steps gate up to STEP_GATE_ALLOWANCE`), replace every `DEFAULT_STEP_BUDGET` with `BATTERY_STEP_BUDGET` and drop the now-unused `DEFAULT_STEP_BUDGET` import.

The second test (`denies the max_steps gate once STEP_GATE_ALLOWANCE is exhausted, ending the turn`) asserts `run.review` is `''`. **Task 3 deliberately changes that outcome** — an exhausted budget will trigger a wrap-up turn instead. For now, switch its constant to `BATTERY_STEP_BUDGET` and leave the assertions; Task 3 rewrites it.

- [ ] **Step 5: Run the full runner suite**

```bash
npx vitest run tests/harness-review-runner.test.ts
```

Expected: PASS, all tests.

- [ ] **Step 6: Commit**

```bash
git add src/main/harness/review/run-battery.ts tests/harness-review-runner.test.ts
git commit -m "fix(review): the battery sets its own step budget instead of inheriting a chat-tier one

25/50 by model tier (model-step-budget.ts) is tuned for interactive chat.
A battery is 37-80 tool calls whichever model runs it, so the gate fired
as routine and the 4x allowance was really just a multiplier. 100 uniform,
allowance 1 - reaching the gate now means something."
```

---

## Task 2: Never throw away a run that produced events

Today a provider error or a 900s timeout rejects out of `runBattery`, the CLI catches it, and **nothing is written** — not the transcript, not the metrics. Round 5's four timed-out models left no evidence at all.

**Files:**
- Modify: `src/main/harness/review/run-battery.ts:18-33` (`BatteryRun`), `:169-336` (`runBattery`)
- Test: `tests/harness-review-runner.test.ts`

**Interfaces:**
- Consumes: `BATTERY_STEP_BUDGET`, `STEP_GATE_ALLOWANCE` (Task 1).
- Produces:
  ```ts
  export type BatteryOutcome = 'complete' | 'wrapped-up' | 'no-review' | 'error';
  export interface BatteryMetrics {
    wallClockMs: number; toolCalls: number; asks: number; stepGates: number;
    thinkingEvents: number; inputTokens: number; outputTokens: number;
    stopReasons: string[]; toolsUsed: string[];
    repeats: { key: string; count: number }[];
  }
  ```
  `BatteryRun` gains `outcome: BatteryOutcome`, `error?: string`, `metrics: BatteryMetrics`. Tasks 3–6 all read these. `repeats` is populated in Task 4 and is `[]` until then.

- [ ] **Step 1: Write the failing tests**

```ts
describe('runBattery salvage', () => {
  it('returns the run with the real error instead of throwing, when the model errors mid-run', async () => {
    // WHY this matters: round 5 lost four models entirely. runBattery threw, the
    // CLI caught, and no transcript was written - so the failures were not even
    // diagnosable after the fact.
    const model = scriptModel([
      { toolCalls: [{ name: 'Read', input: { file_path: 'README.md' } }] },
      { throwError: 'provider exploded' },
    ]);
    const run = await runBattery({
      modelFactory: async () => model as any,
      modelId: 'fake/model',
      label: 'Fake',
      timeoutMs: 30_000,
    });

    expect(run.outcome).toBe('error');
    expect(run.error).toContain('provider exploded');
    // The whole point: the events survive the failure.
    expect(run.events.length).toBeGreaterThan(0);
    expect(run.metrics.toolCalls).toBe(1);
  });

  it('reports no-review when the run finishes with empty final text', async () => {
    const model = scriptModel([{ toolCalls: [{ name: 'Read', input: { file_path: 'README.md' } }] }]);
    const run = await runBattery({
      modelFactory: async () => model as any,
      modelId: 'fake/model', label: 'Fake', timeoutMs: 30_000,
    });
    expect(run.outcome).toBe('no-review');
    expect(run.review).toBe('');
  });

  it('reports complete and records metrics when the model finishes normally', async () => {
    const model = scriptModel([
      { toolCalls: [{ name: 'Glob', input: { pattern: '**/*' } }] },
      { toolCalls: [{ name: 'Read', input: { file_path: 'README.md' } }] },
      { text: 'The review.' },
    ]);
    const run = await runBattery({
      modelFactory: async () => model as any,
      modelId: 'fake/model', label: 'Fake', timeoutMs: 30_000,
    });

    expect(run.outcome).toBe('complete');
    expect(run.review).toBe('The review.');
    expect(run.metrics.toolCalls).toBe(2);
    expect(run.metrics.toolsUsed).toEqual(['Glob', 'Read']);   // distinct, sorted
    expect(run.metrics.stopReasons).toContain('end_turn');
    expect(run.metrics.wallClockMs).toBeGreaterThan(0);
    expect(run.metrics.outputTokens).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx vitest run tests/harness-review-runner.test.ts -t "runBattery salvage"
```

Expected: FAIL — `run.outcome` is `undefined`; the first test rejects rather than returning.

- [ ] **Step 3: Implement**

In `run-battery.ts`, add above `BatteryRun`:

```ts
export type BatteryOutcome = 'complete' | 'wrapped-up' | 'no-review' | 'error';

export interface BatteryMetrics {
  wallClockMs: number;
  toolCalls: number;
  asks: number;
  stepGates: number;
  /** COUNT of assistant-thinking events, not a token figure — StepUsage
   *  (harness-session.ts:109) has no reasoning field. Still the number that
   *  makes a provider-side reasoning shift visible: the same model on the same
   *  commit went 232 -> 1,691 between two runs 4.5 hours apart on 2026-08-10,
   *  and nothing in the old output showed it. */
  thinkingEvents: number;
  inputTokens: number;
  outputTokens: number;
  /** One per turn-complete, in order. A wrapped-up run has two. */
  stopReasons: string[];
  /** Distinct tool names actually invoked, sorted. The evidence a review's
   *  claims are checked against (run-facts.ts). */
  toolsUsed: string[];
  /** (toolName, input) pairs seen more than REPEAT_LIMIT times. Populated in
   *  Task 4; [] before restart detection exists. */
  repeats: { key: string; count: number }[];
}
```

Extend `BatteryRun` with:

```ts
  /** How the run ended. 'complete' — the testing turn finished on its own with
   *  a non-empty review. 'wrapped-up' — a trigger fired and the wrap-up turn
   *  produced the review. 'no-review' — finished with empty final text.
   *  'error' — the provider or session threw; see `error`. */
  outcome: BatteryOutcome;
  /** The REAL error message, never a substitute (error-message-standards.md). */
  error?: string;
  metrics: BatteryMetrics;
```

Inside `runBattery`, add counters beside the existing ones and extend the event listener:

```ts
  const startedAt = Date.now();
  let thinkingEvents = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const stopReasons: string[] = [];
  const toolsUsed = new Set<string>();
```

```ts
  session.on('transcript-event', (e: TranscriptEvent) => {
    events.push(e);
    if (e.type === 'tool-use') {
      toolCalls++;
      // toolName is the field name on TranscriptEvent.data (shared/types.ts:148),
      // not `name` — the tool-use payload mirrors CC's transcript shape.
      if (e.data.toolName) toolsUsed.add(e.data.toolName);
    }
    if (e.type === 'assistant-thinking') thinkingEvents++;
    if (e.type === 'turn-complete') {
      if (e.data.stopReason) stopReasons.push(e.data.stopReason);
      inputTokens += e.data.usage?.inputTokens ?? 0;
      outputTokens += e.data.usage?.outputTokens ?? 0;
    }
  });
```

Replace the `try { await Promise.race(...) } finally { ... }` block with a version that catches. Keep the timeout race for now — Task 3 replaces it with an interrupt:

```ts
  let error: string | undefined;
  try {
    await Promise.race([session.send(BATTERY_PROMPT), timeout]);
  } catch (err) {
    // Salvage, don't discard. A provider error or a blown deadline still leaves
    // a transcript worth writing — round 5 threw four of them away and left the
    // failures undiagnosable. The REAL message is carried through, never a guess.
    error = err instanceof Error ? err.message : String(err);
  } finally {
    clearTimeout(timer);
    session.destroy();
    if (!opts.keepFixture) fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
```

Keep the existing review extraction unchanged. Then replace the `return` with:

```ts
  const outcome: BatteryOutcome = error ? 'error' : review ? 'complete' : 'no-review';

  return {
    label: opts.label, modelId: opts.modelId, review, events,
    toolCalls, asks, stepGates, fixtureRoot,
    outcome, error,
    metrics: {
      wallClockMs: Date.now() - startedAt,
      toolCalls, asks, stepGates, thinkingEvents, inputTokens, outputTokens,
      stopReasons,
      toolsUsed: [...toolsUsed].sort(),
      repeats: [],
    },
  };
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/harness-review-runner.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/review/run-battery.ts tests/harness-review-runner.test.ts
git commit -m "fix(review): salvage a failed run instead of throwing its transcript away

Round 5 lost four models to the 900s timeout with no transcript written -
runBattery threw, the CLI caught, and the failures were not diagnosable
after the fact. runBattery now returns outcome + error + metrics for any
run that produced events."
```

---

## Task 3: The wrap-up turn (budget and wall-clock triggers)

When the budget runs out, the turn dies mid-battery and the review — which is whatever text follows the last tool call — never gets written. Same for the deadline. Both should end by *asking for the review*.

**Files:**
- Modify: `src/main/harness/review/run-battery.ts`
- Test: `tests/harness-review-runner.test.ts`

**Interfaces:**
- Consumes: `BatteryOutcome`, `BatteryMetrics` (Task 2); `BATTERY_STEP_BUDGET`, `STEP_GATE_ALLOWANCE` (Task 1).
- Produces: `export const WRAP_UP_PROMPT: string`, `export const WRAP_UP_TIMEOUT_MS = 120_000`, `export const BATTERY_TIMEOUT_MS = 1_200_000`, and `BatteryRun.wrapUpReason?: 'budget' | 'restart' | 'timeout'`. Task 4 adds the `'restart'` producer; Task 6 prints `wrapUpReason`.

- [ ] **Step 1: Write the failing tests**

```ts
import { WRAP_UP_PROMPT, BATTERY_STEP_BUDGET, STEP_GATE_ALLOWANCE } from '../src/main/harness/review/run-battery';

describe('wrap-up turn', () => {
  function toolCallSteps(count: number): ScriptStep[] {
    // Alternating offsets so consecutive calls are never byte-identical — that
    // would trip the doom_loop guard (harness-session.ts:1432), which is a
    // different mechanism and would muddy what this test proves.
    return Array.from({ length: count }, (_, i) => ({
      toolCalls: [{ name: 'Read', input: { file_path: 'README.md', offset: (i % 2) + 1 } }],
    }));
  }

  it('asks for the review when the step budget is exhausted, instead of ending the turn empty', async () => {
    // One window more than the allowance permits, so the last gate is denied and
    // the testing turn ends on stopReason 'max_steps'. The trailing text step is
    // the WRAP-UP turn's response — reached only if a second send() happens.
    //
    // The model is hoisted OUT of the factory on purpose: modelFactory is called
    // once per send() (harness-session.ts:1020), so an inline
    // `async () => scriptModel(steps)` would hand the wrap-up turn a fresh model
    // replaying from step 0 — it would call tools again, not answer.
    const model = scriptModel([
      ...toolCallSteps((STEP_GATE_ALLOWANCE + 1) * BATTERY_STEP_BUDGET),
      { text: 'Review written after being asked to wrap up.' },
    ]);
    const run = await runBattery({
      modelFactory: async () => model as any,
      modelId: 'fake/model', label: 'Fake', timeoutMs: 60_000,
    });

    expect(run.outcome).toBe('wrapped-up');
    expect(run.wrapUpReason).toBe('budget');
    expect(run.review).toBe('Review written after being asked to wrap up.');
    expect(run.metrics.stopReasons).toContain('max_steps');
  });

  it('denies tool calls during the wrap-up turn so the model cannot resume testing', async () => {
    const model = scriptModel([
      ...toolCallSteps((STEP_GATE_ALLOWANCE + 1) * BATTERY_STEP_BUDGET),
      // The model tries to keep testing on the wrap-up turn...
      { toolCalls: [{ name: 'Bash', input: { command: 'echo still going' } }] },
      // ...and only then answers.
      { text: 'Fine, here is the review.' },
    ]);
    const run = await runBattery({
      modelFactory: async () => model as any,
      modelId: 'fake/model', label: 'Fake', timeoutMs: 60_000,
    });

    expect(run.review).toBe('Fine, here is the review.');
    // The Bash call was ATTEMPTED (it is in the transcript) but denied, so it
    // never reached the tool layer and never ran a command. harness-session.ts:1556
    // returns `{ isError: true }` for a denied decide, and :1131 emits it as a
    // tool-result carrying toolName.
    const bashResults = run.events.filter(
      (e) => e.type === 'tool-result' && e.data.toolName === 'Bash',
    );
    // Assert non-empty FIRST — `.every` on an empty array is vacuously true, so
    // without this the test would also pass if the wrap-up turn never ran.
    expect(bashResults.length).toBeGreaterThan(0);
    expect(bashResults.every((e) => e.data.isError)).toBe(true);
  });

  it('takes only the wrap-up turn text as the review, not narration from the interrupted turn', async () => {
    // The testing turn emits trailing narration after its last tool call. Under
    // the old single-turn extractor that text would BE the review. It must not
    // leak into the wrapped-up review — this is the exact defect the
    // "text after the last tool result" rule was written to fix.
    const steps = toolCallSteps((STEP_GATE_ALLOWANCE + 1) * BATTERY_STEP_BUDGET);
    steps[steps.length - 1] = {
      text: 'Now let me try one more thing...',
      toolCalls: [{ name: 'Read', input: { file_path: 'README.md', offset: 9 } }],
    };
    const model = scriptModel([...steps, { text: 'The actual review.' }]);
    const run = await runBattery({
      modelFactory: async () => model as any,
      modelId: 'fake/model', label: 'Fake', timeoutMs: 60_000,
    });

    expect(run.review).toBe('The actual review.');
    expect(run.review).not.toContain('one more thing');
  });

  it('asks for the review when the wall clock elapses, instead of throwing the run away', async () => {
    // 60 windows of tool calls will not finish inside a 2s deadline. The deadline
    // must interrupt the testing turn and go to wrap-up, NOT reject.
    const model = scriptModel([
      ...toolCallSteps(BATTERY_STEP_BUDGET * 60),
      { text: 'Review after the clock ran out.' },
    ]);
    const run = await runBattery({
      modelFactory: async () => model as any,
      modelId: 'fake/model', label: 'Fake', timeoutMs: 2_000,
    });

    expect(run.wrapUpReason).toBe('timeout');
    expect(run.outcome).toBe('wrapped-up');
    expect(run.error).toBeUndefined();   // a deadline is not an error any more
  });
});
```

- [ ] **Step 2: Delete the superseded test**

Remove `denies the max_steps gate once STEP_GATE_ALLOWANCE is exhausted, ending the turn` (`tests/harness-review-runner.test.ts`, the second of the two budget tests). Its assertion — `run.review` is `''` after the cap — is exactly the behavior this task replaces. The first budget test (`survives the max_steps gate up to STEP_GATE_ALLOWANCE`) stays: an allowance-sized run must still finish *without* wrapping up.

Add one assertion to that surviving test to pin the distinction:

```ts
    expect(run.outcome).toBe('complete');
    expect(run.wrapUpReason).toBeUndefined();
```

- [ ] **Step 3: Run and confirm failure**

```bash
npx vitest run tests/harness-review-runner.test.ts -t "wrap-up turn"
```

Expected: FAIL — `WRAP_UP_PROMPT` is not exported; `run.wrapUpReason` is `undefined`.

- [ ] **Step 4: Implement — constants and prompt**

Add to `run-battery.ts`, below `BATTERY_STEP_BUDGET`:

```ts
// Sent as a SECOND turn on the same session when the testing phase is cut short.
// WHY a second turn and not a bigger budget: the failure is not "the model needed
// more room", it is "the model never got asked for the deliverable". Round 5's
// Qwen 3.5 122B (127 calls) and Qwen 3.8 Max (157 calls) both ended on max_steps
// with no final text — paid runs that produced nothing readable. Reusing the same
// session keeps the model's whole history, so it reviews what it actually did.
export const WRAP_UP_PROMPT =
  'Your testing budget is spent. Do not run any more tools — any tool call you ' +
  'make now will be denied. Write your review of the harness now, covering ' +
  'whatever you managed to test.';

// The wrap-up turn's own ceiling. Much smaller than the testing phase: it is one
// message, and a model that cannot produce it in two minutes is not going to.
export const WRAP_UP_TIMEOUT_MS = 120_000;

// Default wall-clock ceiling for the TESTING phase. Raised from 900_000 because
// at the 8.6s/step measured on 2026-08-10, 900s buys ~105 steps — which made the
// deadline, not BATTERY_STEP_BUDGET, the binding constraint. Now that a blown
// deadline triggers a wrap-up turn instead of killing the run, the raise costs
// little and leaves real testing room before wrap-up.
export const BATTERY_TIMEOUT_MS = 1_200_000;
```

Add to `BatteryRun`:

```ts
  /** Which trigger sent the run to a wrap-up turn, if any. Undefined means the
   *  testing turn ended on its own. */
  wrapUpReason?: 'budget' | 'restart' | 'timeout';
```

- [ ] **Step 5: Implement — the wrap-up phase**

Inside `runBattery`, declare the phase flag above the `new HarnessSession(...)` call so both callbacks close over it:

```ts
  // Set for the duration of the wrap-up turn. While true, every tool call is
  // denied and every max_steps gate is denied, so the model cannot resume
  // testing — it answers in prose or not at all.
  let wrappingUp = false;
  let wrapUpReason: BatteryRun['wrapUpReason'];
```

Change `decide`:

```ts
      // Auto-approve everything decide() is consulted about — EXCEPT during the
      // wrap-up turn, where every tool call is refused so the model must answer.
      // NOTE: PermissionDecision (shared/permission-types.ts:17) carries only
      // `action` and `denyListed` — there is no message field, so the model sees
      // the generic tool-denial result. WRAP_UP_PROMPT is what explains why.
      // (The fixture jail does NOT rest on this — see askUser below.)
      decide: async () => ({ action: wrappingUp ? 'deny' : 'allow', denyListed: false }),
```

In `askUser`, gate the `max_steps` branch:

```ts
        if (req.toolName === 'max_steps') {
          stepGates++;
          // During wrap-up there is no more testing to fund: deny outright.
          if (wrappingUp) return { behavior: 'deny' };
          return stepGates <= STEP_GATE_ALLOWANCE
            ? { behavior: 'allow' }
            : { behavior: 'deny' };
        }
```

Replace the timeout promise and the `try/catch/finally` block. **`session.destroy()` and the fixture removal move out of the first `finally`** — they must not run until after the wrap-up turn:

```ts
  const timeoutMs = opts.timeoutMs ?? BATTERY_TIMEOUT_MS;
  let error: string | undefined;

  // The deadline INTERRUPTS rather than rejecting. interrupt()
  // (harness-session.ts:1608) ends the in-flight turn cleanly and lets send()
  // resolve with everything gathered — the old Promise.race abandoned a live
  // promise and discarded the whole run, which is how round 5 lost four models.
  const deadline = setTimeout(() => {
    wrapUpReason ??= 'timeout';
    session.interrupt();
  }, timeoutMs);
  deadline.unref();

  try {
    await session.send(BATTERY_PROMPT);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    clearTimeout(deadline);
  }

  // A denied budget gate ends the turn with stopReason 'max_steps'
  // (harness-session.ts:1102). WHY read the stopReason rather than set a flag in
  // askUser: at the callback a denied gate and a turn that was about to finish
  // anyway are indistinguishable — the stopReason is the only place the
  // difference is recorded.
  if (!wrapUpReason && !error && stopReasons.at(-1) === 'max_steps') wrapUpReason = 'budget';

  // Everything the testing turn emitted. The wrap-up review is sliced from here
  // onward so trailing narration from the interrupted turn cannot leak into it.
  let sliceFrom = 0;

  if (wrapUpReason) {
    wrappingUp = true;
    sliceFrom = events.length;
    const wrapDeadline = setTimeout(() => session.interrupt(), WRAP_UP_TIMEOUT_MS);
    wrapDeadline.unref();
    try {
      await session.send(WRAP_UP_PROMPT);
    } catch (err) {
      // A failed wrap-up is not fatal: the testing transcript is still worth
      // writing, and outcome stays 'wrapped-up' with an empty review.
      error ??= err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(wrapDeadline);
    }
  }

  session.destroy();
  if (!opts.keepFixture) fs.rmSync(fixtureRoot, { recursive: true, force: true });
```

- [ ] **Step 6: Implement — slice the review**

Change the extraction to operate on the wrap-up window only:

```ts
  // Only the wrap-up turn's events when one ran (sliceFrom > 0); the whole run
  // otherwise. Indices below are LOCAL to this window, which is what keeps the
  // interrupted turn's trailing narration out of the review.
  const reviewWindow = events.slice(sliceFrom);
  const lastToolResultIndex = reviewWindow.reduce(
    (last, e, i) => (e.type === 'tool-result' ? i : last),
    -1,
  );
  const review = reviewWindow
    .filter((e, i) => e.type === 'assistant-text' && i > lastToolResultIndex)
    .map((e) => e.data.text ?? '')
    .join('')
    .trim();
```

And the outcome, which now has a wrap-up branch:

```ts
  const outcome: BatteryOutcome =
    wrapUpReason ? 'wrapped-up'
    : error ? 'error'
    : review ? 'complete'
    : 'no-review';
```

Add `wrapUpReason` to the returned object.

- [ ] **Step 7: Run the full suite**

```bash
npx vitest run tests/harness-review-runner.test.ts
```

Expected: PASS. If the wall-clock test is flaky, raise its `timeoutMs` from `2_000` — never lower the scripted step count, which is what guarantees the deadline is what fires.

- [ ] **Step 8: Verify and commit**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh worktrees/review-resilience
```

```bash
git add src/main/harness/review/run-battery.ts tests/harness-review-runner.test.ts
git commit -m "feat(review): ask for the review when the run is cut short, instead of dying

A spent budget or a blown deadline ended the turn mid-battery and the
review - the text after the last tool call - never existed. Both now
interrupt and send a second turn asking for it, with tool calls denied
so the model cannot resume testing. Round 5's two max_steps models each
made 100+ calls and produced nothing readable."
```

---

## Task 4: Restart detection as a third trigger

`doom_loop` catches *consecutive* identical calls. Qwen 3.8 Max issued `Glob **/*` fourteen times spread across 157 calls — the battery being restarted after compaction, which `doom_loop` cannot see.

**Files:**
- Modify: `src/main/harness/review/run-battery.ts`
- Test: `tests/harness-review-runner.test.ts`

**Interfaces:**
- Consumes: `wrapUpReason`, `BatteryMetrics.repeats` (Tasks 2–3).
- Produces: `export const REPEAT_LIMIT = 5`. Task 5 reads `metrics.repeats`.

- [ ] **Step 1: Write the failing test**

```ts
import { REPEAT_LIMIT } from '../src/main/harness/review/run-battery';

describe('restart detection', () => {
  it('wraps up when the same call repeats past the limit, even non-consecutively', async () => {
    // Interleave a repeated Glob with distinct Reads so no two IDENTICAL calls
    // are ever adjacent — doom_loop (harness-session.ts:1432) only catches the
    // consecutive case and must not be what fires here.
    const steps: ScriptStep[] = [];
    for (let i = 0; i <= REPEAT_LIMIT; i++) {
      steps.push({ toolCalls: [{ name: 'Glob', input: { pattern: '**/*' } }] });
      steps.push({ toolCalls: [{ name: 'Read', input: { file_path: `f${i}.ts` } }] });
    }
    steps.push({ text: 'Review after the restart was caught.' });
    const model = scriptModel(steps);

    const run = await runBattery({
      modelFactory: async () => model as any,
      modelId: 'fake/model', label: 'Fake', timeoutMs: 60_000,
    });

    expect(run.wrapUpReason).toBe('restart');
    expect(run.outcome).toBe('wrapped-up');
    expect(run.review).toBe('Review after the restart was caught.');
    expect(run.metrics.repeats[0]).toMatchObject({ count: REPEAT_LIMIT + 1 });
    expect(run.metrics.repeats[0].key).toContain('Glob');
  });

  it('leaves a run alone when repeats stay at or under the limit', async () => {
    const steps: ScriptStep[] = [];
    for (let i = 0; i < REPEAT_LIMIT; i++) {
      steps.push({ toolCalls: [{ name: 'Glob', input: { pattern: '**/*' } }] });
      steps.push({ toolCalls: [{ name: 'Read', input: { file_path: `f${i}.ts` } }] });
    }
    steps.push({ text: 'Normal review.' });
    const model = scriptModel(steps);

    const run = await runBattery({
      modelFactory: async () => model as any,
      modelId: 'fake/model', label: 'Fake', timeoutMs: 60_000,
    });

    expect(run.wrapUpReason).toBeUndefined();
    expect(run.outcome).toBe('complete');
    expect(run.metrics.repeats).toEqual([]);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx vitest run tests/harness-review-runner.test.ts -t "restart detection"
```

Expected: FAIL — `REPEAT_LIMIT` is not exported.

- [ ] **Step 3: Implement**

Add the constant to `run-battery.ts`, below `WRAP_UP_PROMPT`:

```ts
// How many byte-identical (toolName, input) pairs a run may issue before it is
// treated as having restarted the battery rather than making progress.
//
// WHY this is not doom_loop's job: doom_loop (harness-session.ts:1432) fires on
// CONSECUTIVE repeats, which catches a stuck tool. This catches the other shape
// — Qwen 3.8 Max issued `Glob **/*` fourteen times spread across 157 calls on
// 2026-08-10, restarting the battery each time its context compacted. Nothing
// was stuck; the run was just never going to finish.
//
// WHY 5: re-reading one file twice while testing (say, checking Read's freshness
// guard) is legitimate. Six byte-identical calls is not a re-check.
export const REPEAT_LIMIT = 5;
```

Inside `runBattery`, add the counter above the session construction:

```ts
  // Keyed on tool name + exact input. Non-consecutive by design — see REPEAT_LIMIT.
  const repeatCounts = new Map<string, number>();
```

Extend the `tool-use` branch of the event listener:

```ts
    if (e.type === 'tool-use') {
      toolCalls++;
      if (e.data.toolName) toolsUsed.add(e.data.toolName);
      const key = `${e.data.toolName ?? '?'} ${JSON.stringify(e.data.toolInput ?? {})}`;
      const seen = (repeatCounts.get(key) ?? 0) + 1;
      repeatCounts.set(key, seen);
      // Trip once, on the crossing. `wrappingUp` guards the wrap-up turn itself
      // (whose denied calls still emit tool-use events), and `wrapUpReason`
      // guards against a second interrupt after another trigger already fired.
      if (seen > REPEAT_LIMIT && !wrappingUp && !wrapUpReason) {
        wrapUpReason = 'restart';
        session.interrupt();
      }
    }
```

`session` is referenced inside its own construction argument, so the listener must be attached *after* `const session = new HarnessSession(...)` — it already is (`run-battery.ts:276`). No reordering needed.

Populate `metrics.repeats` in the return:

```ts
      repeats: [...repeatCounts.entries()]
        .filter(([, count]) => count > REPEAT_LIMIT)
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count),
```

- [ ] **Step 4: Run the full suite**

```bash
npx vitest run tests/harness-review-runner.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/review/run-battery.ts tests/harness-review-runner.test.ts
git commit -m "feat(review): catch a model restarting the battery, not just a stuck tool

doom_loop fires on consecutive identical calls. Qwen 3.8 Max issued
Glob **/* fourteen times across 157 calls on 2026-08-10, restarting after
each compaction - nothing was stuck, the run was just never going to
finish. Six byte-identical calls now sends the run to wrap-up."
```

---

## Task 5: Run facts and the fabrication check

Qwen 3.6 35B A3B made 14 tool calls — 13 `Read`, one `Glob`, one `Bash pwd && ls -la` — and wrote a review describing `Edit` duplicate-string tests, `replace_all`, a `sleep 15` timeout with exit 124, and five files that do not exist in the fixture. It was appended to the doc as a genuine review.

**Files:**
- Create: `src/main/harness/review/run-facts.ts`
- Modify: `src/main/harness/review/append-review.ts:24-28`
- Test: `tests/harness-review-runner.test.ts`

**Interfaces:**
- Consumes: `BatteryRun`, `BatteryMetrics` (Tasks 2–4).
- Produces:
  ```ts
  export const MIN_TOOL_CALLS = 10;
  export interface RunFacts { metrics: BatteryMetrics; outcome: BatteryOutcome;
    wrapUpReason?: 'budget' | 'restart' | 'timeout'; error?: string;
    unbackedClaims: string[]; belowFloor: boolean }
  export function collectRunFacts(run: BatteryRun): RunFacts
  export function claimedTools(reviewText: string): string[]
  export function renderRunFacts(facts: RunFacts): string
  ```
  `appendReview`'s `run` parameter gains `runFacts: string`. Task 6 calls all of it.

- [ ] **Step 1: Write the failing tests**

```ts
import { collectRunFacts, claimedTools, renderRunFacts, MIN_TOOL_CALLS }
  from '../src/main/harness/review/run-facts';

const BASE_METRICS = {
  wallClockMs: 230_000, toolCalls: 58, asks: 2, stepGates: 0, thinkingEvents: 232,
  inputTokens: 100_000, outputTokens: 8_379, stopReasons: ['end_turn'],
  toolsUsed: ['Bash', 'Edit', 'Glob', 'Grep', 'Read', 'Write'], repeats: [],
};
const baseRun = (over: Partial<any> = {}) => ({
  label: 'Fake', modelId: 'fake/model', review: 'A review.', events: [],
  toolCalls: 58, asks: 2, stepGates: 0, fixtureRoot: '/tmp/x',
  outcome: 'complete' as const, metrics: BASE_METRICS, ...over,
});

describe('claimedTools', () => {
  it('finds tool names named in the review', () => {
    expect(claimedTools('I tested Edit and Grep, then Read the file.'))
      .toEqual(['Edit', 'Grep', 'Read']);
  });

  it('matches whole words only, so prose is not mistaken for a tool name', () => {
    // "Reading", "edited", "globbing" must NOT count as Read / Edit / Glob.
    expect(claimedTools('Reading the file, I edited it while globbing.')).toEqual([]);
  });
});

describe('collectRunFacts', () => {
  it('flags a tool the review claims but the transcript never shows', () => {
    // The exact Qwen 3.6 35B A3B shape: 14 calls, none of them Edit, review
    // describing Edit tests in detail.
    const facts = collectRunFacts(baseRun({
      review: 'Edit refused a duplicate string, and replace_all worked as documented.',
      toolCalls: 14,
      metrics: { ...BASE_METRICS, toolCalls: 14, toolsUsed: ['Bash', 'Glob', 'Read'] },
    }));
    expect(facts.unbackedClaims).toEqual(['Edit']);
  });

  it('does not flag a tool the review claims AND the transcript shows', () => {
    const facts = collectRunFacts(baseRun({ review: 'Edit and Read both behaved.' }));
    expect(facts.unbackedClaims).toEqual([]);
  });

  it('flags a run below the tool-call floor', () => {
    // Qwen 3.6 27B made two calls. Whatever follows two calls is not a review
    // of ten tools.
    const facts = collectRunFacts(baseRun({
      toolCalls: 2, metrics: { ...BASE_METRICS, toolCalls: 2, toolsUsed: ['Read'] },
    }));
    expect(facts.belowFloor).toBe(true);
    expect(MIN_TOOL_CALLS).toBe(10);
  });
});

describe('renderRunFacts', () => {
  it('states what the run actually did', () => {
    const out = renderRunFacts(collectRunFacts(baseRun()));
    expect(out).toContain('58 tool calls');
    expect(out).toContain('232 thinking');
    expect(out).toContain('Bash, Edit, Glob, Grep, Read, Write');
  });

  it('leads with a warning blockquote when a claim is unbacked', () => {
    const out = renderRunFacts(collectRunFacts(baseRun({
      review: 'Edit refused a duplicate string.',
      metrics: { ...BASE_METRICS, toolsUsed: ['Read'] },
    })));
    expect(out.startsWith('> ')).toBe(true);
    expect(out).toContain('Edit');
    // Flags, does not judge — the wording must not assert the review is false.
    expect(out.toLowerCase()).not.toContain('fabricat');
  });

  it('has no warning blockquote for a clean run', () => {
    expect(renderRunFacts(collectRunFacts(baseRun())).startsWith('> ')).toBe(false);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx vitest run tests/harness-review-runner.test.ts -t "claimedTools"
```

Expected: FAIL — cannot resolve `../src/main/harness/review/run-facts`.

- [ ] **Step 3: Implement `run-facts.ts`**

```ts
// What the transcript says a run did, rendered for the reviews doc.
//
// WHY this exists: on 2026-08-10 a model made 14 tool calls — 13 Read, one Glob,
// one Bash — and wrote a review describing Edit duplicate-string tests,
// replace_all, and a `sleep 15` timeout with exit 124. It was appended as a
// genuine review and only caught by hand-reading the transcript. The evidence
// was already on disk, written thirty lines earlier by the CLI, and nothing
// consulted it.
//
// WHY pure: it takes a finished BatteryRun and returns strings, so the check is
// unit-testable without a session or a paid run.
import { CORE_TOOLS } from '../tools';
import type { BatteryRun, BatteryMetrics, BatteryOutcome } from './run-battery';

// Below this, a run did not exercise ten tools across seven areas, whatever its
// text claims. Round 5's Qwen 3.6 27B stopped after two calls.
export const MIN_TOOL_CALLS = 10;

const TOOL_NAMES = CORE_TOOLS.map((t) => t.name);

export interface RunFacts {
  metrics: BatteryMetrics;
  outcome: BatteryOutcome;
  wrapUpReason?: 'budget' | 'restart' | 'timeout';
  error?: string;
  /** Tools the review names that never appear in metrics.toolsUsed. */
  unbackedClaims: string[];
  belowFloor: boolean;
}

/** Tool names mentioned in the review text, as whole words. WHY whole words:
 *  "Reading the file" must not count as the Read tool, or every review would
 *  flag. Sorted and deduplicated so the output is stable. */
export function claimedTools(reviewText: string): string[] {
  return TOOL_NAMES.filter((name) => new RegExp(`\\b${name}\\b`).test(reviewText)).sort();
}

export function collectRunFacts(run: BatteryRun): RunFacts {
  const used = new Set(run.metrics.toolsUsed);
  return {
    metrics: run.metrics,
    outcome: run.outcome,
    wrapUpReason: run.wrapUpReason,
    error: run.error,
    unbackedClaims: claimedTools(run.review).filter((name) => !used.has(name)),
    belowFloor: run.metrics.toolCalls < MIN_TOOL_CALLS,
  };
}

function duration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}m${String(total % 60).padStart(2, '0')}s`;
}

/** A markdown block for the reviews doc: warnings first (if any), then what the
 *  run measurably did. WHY warnings FLAG rather than judge: a review that
 *  honestly says "I never reached Edit" trips the unbacked-claims check too, and
 *  a reader settles that in two seconds. Refusing to append would spend real
 *  money and then discard the result on a heuristic. */
export function renderRunFacts(facts: RunFacts): string {
  const lines: string[] = [];

  if (facts.unbackedClaims.length) {
    lines.push(
      `> ⚠️ This review names ${facts.unbackedClaims.join(', ')}, which the ` +
      `transcript shows no call to. Check the claims against the run before ` +
      `acting on them.`,
      '',
    );
  }
  if (facts.belowFloor) {
    lines.push(
      `> ⚠️ Only ${facts.metrics.toolCalls} tool calls — below the ${MIN_TOOL_CALLS} ` +
      `it takes to walk the battery. This run did not cover the tools.`,
      '',
    );
  }

  const m = facts.metrics;
  const ending = facts.wrapUpReason
    ? `wrapped up (${facts.wrapUpReason})`
    : facts.outcome;
  lines.push(
    `**Run facts:** ${ending} · ${m.toolCalls} tool calls · ${m.asks} asks · ` +
    `${m.stepGates} step gates · ${m.thinkingEvents} thinking events · ` +
    `${m.outputTokens.toLocaleString()} output tokens · ${duration(m.wallClockMs)}`,
    '',
    `**Tools actually used:** ${m.toolsUsed.length ? m.toolsUsed.join(', ') : 'none'}`,
  );
  if (facts.error) lines.push('', `**Error:** ${facts.error}`);

  return lines.join('\n');
}
```

- [ ] **Step 4: Run the facts tests**

```bash
npx vitest run tests/harness-review-runner.test.ts -t "RunFacts"
npx vitest run tests/harness-review-runner.test.ts -t "claimedTools"
npx vitest run tests/harness-review-runner.test.ts -t "collectRunFacts"
```

Expected: PASS.

- [ ] **Step 5: Write the failing `appendReview` test**

```ts
it('carries the run-facts block under the heading, above the review body', () => {
  const out = appendReview(DOC, {
    label: 'Fake', modelId: 'fake/model', review: 'Body text.',
    buildSha: 'abc123', runFacts: '**Run facts:** complete · 58 tool calls',
  }, RUN_AT);

  const headingAt = out.indexOf('## Review: Fake');
  const factsAt = out.indexOf('**Run facts:**');
  const bodyAt = out.indexOf('Body text.');
  expect(headingAt).toBeLessThan(factsAt);
  expect(factsAt).toBeLessThan(bodyAt);
});
```

- [ ] **Step 6: Implement the `appendReview` change**

Widen the parameter type at `append-review.ts:26` and insert the block. The function stays pure — it receives the rendered string, never a `BatteryRun`:

```ts
export function appendReview(
  docText: string,
  run: { label: string; modelId: string; review: string; buildSha: string; runFacts: string },
  runAtISO: string,
): string {
```

In the `section` array, insert after the `**Model:**` metadata line and its following `''`:

```ts
    // What the transcript shows this run actually did, plus any warning that
    // the review's claims outrun it (run-facts.ts). Every review carries this,
    // not only suspect ones — a reader should not have to open a 400KB
    // transcript JSON to learn how many tools a review is based on.
    run.runFacts,
    '',
```

- [ ] **Step 7: Run the full suite**

```bash
npx vitest run tests/harness-review-runner.test.ts
```

Expected: PASS. Existing `appendReview` tests will fail to typecheck until each call site adds `runFacts` — add `runFacts: ''` to the ones whose subject is insertion position or byte-identity, not the facts block.

- [ ] **Step 8: Verify and commit**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh worktrees/review-resilience
```

```bash
git add src/main/harness/review/run-facts.ts src/main/harness/review/append-review.ts tests/harness-review-runner.test.ts
git commit -m "feat(review): stamp every review with what the transcript actually shows

A model made 14 calls - 13 Read, one Glob, one Bash - and wrote a review
describing Edit duplicate-string tests and a sleep-15 timeout. It was
appended as genuine. The evidence was already on disk and nothing read
it. Reviews now carry their run facts, and a claim with no matching call
gets a warning above it."
```

---

## Task 6: Wire the CLI

`review-harness.mjs` writes the transcript **inside** the try, after a successful `runBattery` — so a thrown run wrote nothing. Now that `runBattery` returns instead of throwing, that ordering has to change too.

**Files:**
- Modify: `test-engine/review-harness.mjs:129-163`

**Interfaces:**
- Consumes: `BatteryRun.outcome`, `.error`, `.wrapUpReason`, `.metrics` (Tasks 2–4); `collectRunFacts`, `renderRunFacts` (Task 5).
- Produces: nothing downstream.

- [ ] **Step 1: Add the run-facts import**

Beside the existing lazy imports at `:117-119`:

```js
const { collectRunFacts, renderRunFacts } = await import(path.join(DESKTOP, 'dist/main/harness/review/run-facts.js'));
```

- [ ] **Step 2: Rewrite the roster loop**

Replace the whole `for (const entry of roster) { ... }` block:

```js
for (const entry of roster) {
  console.log(`\n=== ${entry.label} (${entry.modelId}) ===`);
  const slug = entry.label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const transcriptPath = path.join(runDir, `${slug}.json`);
  try {
    const run = await runBattery({
      modelFactory: makeOpenRouterFactory(key, entry.modelId),
      modelId: entry.modelId,
      label: entry.label,
    });

    // Save the transcript FIRST, unconditionally, before anything can fail. A
    // claim in a review is only checkable if the events behind it survive — and
    // round 5 lost four models entirely because the write sat behind a throw.
    fs.writeFileSync(
      transcriptPath,
      JSON.stringify(
        {
          label: entry.label, modelId: entry.modelId,
          outcome: run.outcome, wrapUpReason: run.wrapUpReason, error: run.error,
          metrics: run.metrics, events: run.events,
        },
        null, 2,
      ),
    );

    const m = run.metrics;
    const ending = run.wrapUpReason ? `wrapped-up (${run.wrapUpReason})` : run.outcome;
    const secs = Math.round(m.wallClockMs / 1000);
    console.log(
      `  ${ending} · ${m.toolCalls} calls · ${m.asks} asks · ${m.stepGates} gates · ` +
      `${m.thinkingEvents} thinking · ${Math.floor(secs / 60)}m${String(secs % 60).padStart(2, '0')}s`,
    );
    console.log(`  tools: ${m.toolsUsed.join(' ') || 'none'}`);
    if (run.error) console.log(`  error: ${run.error}`);

    if (!run.review.trim()) {
      // Not a failure worth aborting on — the transcript is written and the
      // metrics line above says what happened. appendReview would throw here.
      console.log('  → no review text; transcript only');
      continue;
    }

    const runFacts = renderRunFacts(collectRunFacts(run));
    fs.writeFileSync(
      DOC,
      appendReview(fs.readFileSync(DOC, 'utf8'), { ...run, buildSha, runFacts }, new Date().toISOString()),
    );
    console.log('  → review appended');
  } catch (err) {
    // runBattery now only throws when there was nothing to salvage (it could not
    // seed the fixture or construct the session). Report the real failure; one
    // model erroring must not abort the roster.
    console.error(`  FAILED: ${err?.message ?? err}`);
  }
}
```

- [ ] **Step 3: Verify the dry run still works**

```bash
cd /home/destin/youcoded-dev/youcoded/worktrees/review-resilience/desktop
npm run build 2>&1 | tail -5
node test-engine/review-harness.mjs --dry-run
```

Expected: the roster table and the battery prompt print; exit 0. This path never imports `run-facts.js` (the `--dry-run` early-exit is above the lazy imports), so it proves nothing about Task 5 — it proves the script still parses and the roster still loads.

- [ ] **Step 4: Commit**

```bash
git add test-engine/review-harness.mjs
git commit -m "fix(review): write every model's transcript, including the ones that failed

The write sat inside the try, after a successful runBattery - so round 5's
four timed-out models produced no evidence at all. It now happens first,
unconditionally, and each model prints its outcome and metrics."
```

---

## Task 7: Update the rule and close the loop

The path-scoped rule in the workspace repo pins the runner's behavior for future sessions. Its `verify:` anchors are harvested by `/audit`, so a stale one fails CI on the daily cron.

**Files:**
- Modify (workspace repo, `/home/destin/youcoded-dev`): `.claude/rules/harness-review-runner.md`
- Move: `docs/active/specs/2026-08-10-harness-review-runner-resilience-design.md` and `docs/active/plans/2026-08-10-review-runner-resilience-plan.md` → `docs/archive/`

No `ROADMAP.md` change: these six defects were never roadmap items — they were found in a live run and specced directly.

- [ ] **Step 1: Update the rule body**

In `.claude/rules/harness-review-runner.md`, add these invariants (format: **invariant · why · guard**, and keep the whole body ≤600 words — trim older prose if needed):

- A cut-short run ends in a wrap-up turn, not a dead turn · three triggers (budget, restart, wall clock) all interrupt and send `WRAP_UP_PROMPT` with tool calls denied · `tests/harness-review-runner.test.ts` → `wrap-up turn`
- The battery sets its own uniform step budget · `stepBudgetFor`'s 25/50 chat tiers cut a 40–80-call battery off mid-review · same file → `battery step budget`
- `runBattery` never throws for a run that produced events · round 5 lost four models' transcripts to a throw · same file → `runBattery salvage`
- Every appended review carries its run facts · a 14-call run's review described tools it never called · same file → `renderRunFacts`

Add to the `verify:` block:

```yaml
  - path: youcoded/desktop/src/main/harness/review/run-facts.ts
    contains: "MIN_TOOL_CALLS"
  - path: youcoded/desktop/src/main/harness/review/run-battery.ts
    contains: "WRAP_UP_PROMPT"
  - path: youcoded/desktop/src/main/harness/review/run-battery.ts
    contains: "BATTERY_STEP_BUDGET"
```

Update `last_verified:` to the merge date.

- [ ] **Step 2: Confirm the anchors resolve**

```bash
cd /home/destin/youcoded-dev && node scripts/audit-anchors.mjs
```

Expected: exit 0. **This will fail until the branch is merged to `youcoded` master** — anchors resolve against the main checkout (`youcoded/`), not a worktree. Run it after the merge; if it must be checked before, temporarily point the paths at `youcoded/worktrees/review-resilience/desktop/...` and revert before committing.

- [ ] **Step 3: Flip the spec to shipped and archive it**

```bash
cd /home/destin/youcoded-dev
sed -i 's/^status: draft$/status: shipped/' docs/active/specs/2026-08-10-harness-review-runner-resilience-design.md
git mv docs/active/specs/2026-08-10-harness-review-runner-resilience-design.md docs/archive/specs/
git mv docs/active/plans/2026-08-10-review-runner-resilience-plan.md docs/archive/plans/
```

- [ ] **Step 4: Commit**

```bash
git add .claude/rules/harness-review-runner.md docs/
git commit -m "docs: pin the review runner's wrap-up, salvage, and run-facts behavior

Rule body + three new verify anchors; spec and plan archived."
```

---

## After the plan

Not part of it, in this order:

1. Merge `feat/review-runner-resilience` to `youcoded` master, then run `node scripts/audit-anchors.mjs` (Task 7 Step 2).
2. Merge `feat/bash-env-persistence` — independent, already green, A/B-exonerated.
3. **Rotate the OpenRouter key** before round 6. The current one is in a session transcript.
4. Round 6, full roster. The success criterion is not 8/8 reviews — it is **8/8 transcripts and an honest outcome for every model**.
