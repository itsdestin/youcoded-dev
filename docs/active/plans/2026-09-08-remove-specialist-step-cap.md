# Remove Specialist Step Cap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the fixed per-specialist tool-loop step cap while leaving every other native-session and specialist safety control unchanged.

**Architecture:** Delete `stepCap` from the specialist-definition data contract, including personal and Claude Code definition-file mapping. Build child `HarnessSession` instances from their selected preset without a `limits.maxSteps` override, so only parent sessions retain the regular agent-loop budget. Simplify child completion and routed budget-ask behavior now that a child cannot end at `max_steps`.

**Tech Stack:** TypeScript, Electron main process, Vitest, native harness (`HarnessSession`, `NativeSessionHost`).

## Global Constraints

- Scope is native specialist child sessions only; root native-session `max_steps` behavior remains unchanged.
- Keep `SPECIALIST_SPAWN_BUDGET_PER_SESSION = 30`, concurrency limits, single-writer reservation, no-recursion, doom-loop detection, permissions, external-directory refusal, interrupts, teardown cascade, stale status, and `reportBudgetTokens` unchanged.
- Do not add IPC, renderer, Android, or live-app changes.
- Preserve tool-call/result pairing and the frozen transcript event surface.
- Add WHY comments for non-trivial implementation decisions.
- Do not run a paid harness evaluation without Destin explicitly choosing it; offer it after code verification.

---

## File structure

| File | Responsibility after this change |
|---|---|
| `youcoded/desktop/src/main/harness/specialists/registry.ts` | Defines the specialist contract without a loop-step cap. |
| `youcoded/desktop/src/main/harness/specialists/builtins.ts` | Defines built-in roles and their report-size budgets, not action-count budgets. |
| `youcoded/desktop/src/main/harness/specialists/definition-files.ts` | Loads tools, model preference, report budget, and identity from personal/Claude Code agent files; ignores legacy step-cap fields. |
| `youcoded/desktop/src/main/harness/harness-session.ts` | Skips the root model-tier step-budget fallback for specialist children only. |
| `youcoded/desktop/src/main/harness/native-session-host.ts` | Constructs unbounded specialist children and completes reports without a max-step special case. |
| `youcoded/desktop/src/main/harness/specialists/child-ask-router.ts` | Treats only `doom_loop` as a routed non-rememberable budget ask for children. |
| `youcoded/desktop/tests/{specialist-definition-files,specialist-catalog,task-tool,specialist-run,native-session-host}.test.ts` | Pins the deleted contract, unbounded child construction, normal report completion, and independent ask-routing behavior. |
| `.claude/rules/native-specialists.md` and `youcoded/docs/native-runtime.md` | Document the remaining specialist controls accurately. |

### Task 1: Delete step-cap configuration from specialist definitions

**Files:**
- Modify: `youcoded/desktop/src/main/harness/specialists/registry.ts:8-51`
- Modify: `youcoded/desktop/src/main/harness/specialists/builtins.ts:111-170`
- Modify: `youcoded/desktop/src/main/harness/specialists/definition-files.ts:25-27,248-287,373-410,427-447`
- Modify: `youcoded/desktop/tests/specialist-definition-files.test.ts`
- Modify: `youcoded/desktop/tests/specialist-catalog.test.ts`
- Modify: `youcoded/desktop/tests/task-tool.test.ts`
- Modify: `youcoded/desktop/tests/specialist-run.test.ts`

**Interfaces:**
- Consumes: `SpecialistDefinition`, personal-frontmatter `stepCap`, and Claude Code agent-frontmatter `maxTurns`.
- Produces: `SpecialistDefinition` without `stepCap`; definition loaders that do not produce a child loop limit.

- [ ] **Step 1: Write the failing definition-loader tests**

In `specialist-definition-files.test.ts`, replace the `cc: maxTurns → stepCap` assertion with a compile-visible definition-shape assertion that confirms the loader returns no `stepCap` property even when `maxTurns: 12` appears in the file:

```ts
it('cc: maxTurns does not configure a native specialist limit', () => {
  const raw = '---\nname: Docs Writer\ndescription: Test.\nmaxTurns: 12\n---\nDo the thing.';
  const result = loadClaudeCodeDefinition('/agents/docs-writer.md', raw, 'user');
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.value.definition).not.toHaveProperty('stepCap');
});
```

Add the analogous personal-file test with `stepCap: 1` and assert that the returned definition has no `stepCap` property. Update every test helper and inline `SpecialistDefinition` fixture in the listed test files by deleting its `stepCap` key.

- [ ] **Step 2: Run the focused definition-file test and confirm the expected failure**

Run:

```bash
cd /home/destin/youcoded-dev/worktrees/sessions/remove-specialist-step-cap/youcoded/desktop
npx vitest run tests/specialist-definition-files.test.ts
```

Expected: the new no-`stepCap` assertion fails while the interface and loaders still expose the property.

- [ ] **Step 3: Remove the data and parsing paths**

Make these exact changes:

1. Delete `stepCap: number` from `SpecialistDefinition` in `registry.ts`.
2. Delete all four built-in `stepCap` values and rewrite the nearby comment to describe only `reportBudgetTokens`.
3. Delete `DEFAULT_STEP_CAP` and both personal `stepCap` parsing/validation branches from `definition-files.ts`.
4. Delete Claude Code `maxTurns -> stepCap` parsing and stop assigning `stepCap` to loaded Claude Code definitions.
5. Delete `stepCap: 25` and its body explanation from `STARTER_FILE_CONTENTS`.

Keep a legacy file’s `stepCap` and `maxTurns` frontmatter harmlessly ignored: do not warn or reject it, because existing user files should keep loading after this update.

- [ ] **Step 4: Run the focused contract tests and confirm they pass**

Run:

```bash
cd /home/destin/youcoded-dev/worktrees/sessions/remove-specialist-step-cap/youcoded/desktop
npx vitest run tests/specialist-definition-files.test.ts tests/specialist-catalog.test.ts tests/task-tool.test.ts tests/specialist-run.test.ts
```

Expected: PASS. No test fixture passes `stepCap`, and legacy frontmatter still loads successfully without configuring a limit.

- [ ] **Step 5: Commit the contract cleanup**

```bash
cd /home/destin/youcoded-dev/worktrees/sessions/remove-specialist-step-cap/youcoded
git add desktop/src/main/harness/specialists/registry.ts desktop/src/main/harness/specialists/builtins.ts desktop/src/main/harness/specialists/definition-files.ts desktop/tests/specialist-definition-files.test.ts desktop/tests/specialist-catalog.test.ts desktop/tests/task-tool.test.ts desktop/tests/specialist-run.test.ts
git diff --cached --check
git commit -m "refactor: remove specialist step cap" -m "Submitted via YouCoded Assistant"
```

### Task 2: Construct child sessions with no max-step override

**Files:**
- Modify: `youcoded/desktop/src/main/harness/harness-session.ts:1873-1878,2147-2157`
- Modify: `youcoded/desktop/src/main/harness/native-session-host.ts:1810-1933,2966-3090`
- Modify: `youcoded/desktop/tests/harness-session-loop.test.ts`
- Modify: `youcoded/desktop/tests/native-session-host.test.ts:2240-2358`
- Modify: `youcoded/desktop/tests/specialist-run.test.ts:427-448`

**Interfaces:**
- Consumes: `ResolvedPreset.manifest`, `SpecialistDefinition`, and `HarnessSessionOpts.harness`.
- Produces: specialist `HarnessSession` options with no injected `harness.limits.maxSteps`, and a shared loop that skips its model-tier budget only when `isSpecialistChild` is true.

- [ ] **Step 1: Replace the capped-child behavioral test with a construction regression test**

Delete the test named `stepCap is enforced...` in `native-session-host.test.ts`. It only validates the behavior being removed and is not the independent router test.

Add a test next to the child-construction tests that creates an Explorer child, reads its private `opts.harness` through the existing `childSession(h, childId)` test helper, and asserts:

```ts
expect((childSession(h, childId) as any).opts.harness.limits?.maxSteps).toBeUndefined();
```

Use a normal root session whose preset manifest has no `limits.maxSteps`, so the assertion proves `buildSpecialistSession()` did not inject one.

In `harness-session-loop.test.ts`, add a regression that drives a specialist child through more tool-call steps than the selected model's normal budget and then stops normally. Assert it emits no permission ask with `toolName: 'max_steps'` and emits `turn-complete` with its normal stop reason. Keep the existing root-session max-step test unchanged.

Replace the capped-report test in `specialist-run.test.ts` with a normal multi-tool completion test: script a child that emits text, makes at least two tool-call steps, then emits its final report. Assert the report contains the final text, does not contain `stopped at its step limit`, and the child transcript contains only the original prompt (no report nudge).

- [ ] **Step 2: Run the targeted tests and confirm the expected failure**

Run:

```bash
cd /home/destin/youcoded-dev/worktrees/sessions/remove-specialist-step-cap/youcoded/desktop
npx vitest run tests/harness-session-loop.test.ts tests/native-session-host.test.ts tests/specialist-run.test.ts
```

Expected: the construction assertion fails because `buildSpecialistSession()` still supplies `specialist.stepCap` as `limits.maxSteps`; the new loop regression fails because a child with no explicit limit still falls back to `stepBudgetFor(modelId)`.

- [ ] **Step 3: Stop injecting `limits.maxSteps` into child options**

In `NativeSessionHost.buildSpecialistSession()`, replace:

```ts
harness: { ...preset.manifest, limits: { ...preset.manifest.limits, maxSteps: specialist.stepCap } },
```

with:

```ts
// WHY: specialist work is bounded by its narrow tool set, parent-managed
// lifecycle controls, and the delegation spawn backstop—not an arbitrary
// per-child action count. Root sessions retain their own max_steps gate.
harness: preset.manifest,
```

In `HarnessSession.send()`, make the root budget nullable for a child:

```ts
const maxSteps = this.opts.isSpecialistChild
  ? undefined
  : (this.opts.harness.limits?.maxSteps ?? stepBudgetFor(this.binding.modelId));
```

Guard the existing gate with `maxSteps !== undefined`:

```ts
if (maxSteps !== undefined && stepsSinceApproval >= maxSteps) {
  // existing max_steps ask behavior, unchanged for root sessions
}
```

Keep `model-step-budget.ts` unchanged and do not alter root-session loop behavior.

In `runSpecialist()`, simplify `reportSoFar()` to return only the latest non-empty text and remove the special `stopReason === 'max_steps'` no-report branch. The unchanged one-nudge path must run whenever the child is silent after a normal completed turn.

- [ ] **Step 4: Run targeted tests and mutation checks**

Run:

```bash
cd /home/destin/youcoded-dev/worktrees/sessions/remove-specialist-step-cap/youcoded/desktop
npx vitest run tests/harness-session-loop.test.ts tests/native-session-host.test.ts tests/specialist-run.test.ts
```

Expected: PASS.

Then perform both mutation checks:

1. Temporarily restore the old `maxSteps` override and run:

```bash
npx vitest run tests/native-session-host.test.ts -t "does not inject a max-step limit"
```

Expected: FAIL because `maxSteps` is present.

2. Temporarily remove the `this.opts.isSpecialistChild` carve-out in `HarnessSession.send()` and run the new child-loop test by name. Expected: FAIL because the child emits a `max_steps` ask at the model-tier threshold.

Restore the production implementation after each mutation and rerun the affected tests; expected PASS.

- [ ] **Step 5: Commit child-session behavior**

```bash
cd /home/destin/youcoded-dev/worktrees/sessions/remove-specialist-step-cap/youcoded
git add desktop/src/main/harness/harness-session.ts desktop/src/main/harness/native-session-host.ts desktop/tests/harness-session-loop.test.ts desktop/tests/native-session-host.test.ts desktop/tests/specialist-run.test.ts
git diff --cached --check
git commit -m "fix: let specialists run without step cap" -m "Submitted via YouCoded Assistant"
```

### Task 3: Keep child ask routing accurate and update reference documentation

**Files:**
- Modify: `youcoded/desktop/src/main/harness/specialists/child-ask-router.ts:6-27,107-124`
- Modify: `.claude/rules/native-specialists.md:59-63`
- Modify: `youcoded/docs/native-runtime.md:625-669`
- Test: `youcoded/desktop/tests/specialist-child-ask-router.test.ts`

**Interfaces:**
- Consumes: child synthetic ask names and `BUDGET_ASK_TOOL_NAMES`.
- Produces: `BUDGET_ASK_TOOL_NAMES = new Set(['doom_loop'])`; docs that accurately describe no per-child step cap and the retained 30-spawn backstop.

- [ ] **Step 1: Add the failing router assertion**

In `specialist-child-ask-router.test.ts`, add an import for `BUDGET_ASK_TOOL_NAMES` and assert:

```ts
it('treats doom-loop, but not max-steps, as a specialist budget ask', () => {
  expect(BUDGET_ASK_TOOL_NAMES.has('doom_loop')).toBe(true);
  expect(BUDGET_ASK_TOOL_NAMES.has('max_steps')).toBe(false);
});
```

- [ ] **Step 2: Run the focused router test and confirm the expected failure**

Run:

```bash
cd /home/destin/youcoded-dev/worktrees/sessions/remove-specialist-step-cap/youcoded/desktop
npx vitest run tests/specialist-child-ask-router.test.ts
```

Expected: FAIL because the set still includes `max_steps`.

- [ ] **Step 3: Remove specialist max-step references and correct docs**

Change the set to:

```ts
export const BUDGET_ASK_TOOL_NAMES = new Set(['doom_loop']);
```

Update comments in `child-ask-router.ts` and `native-session-host.ts` that list child `max_steps` among routed budget asks, but do not change root `max_steps` documentation.

In `.claude/rules/native-specialists.md`, add one concise plan-1b invariant: a specialist has no per-child step cap; the 30-spawn-per-parent backstop, concurrency limits, doom-loop detection, and lifecycle controls remain.

In `youcoded/docs/native-runtime.md`, revise the plan-1b child-ask and spawn-budget bullets to remove child `max_steps` claims, retain doom-loop routing, and state that `SPECIALIST_SPAWN_BUDGET_PER_SESSION` is the runaway backstop.

- [ ] **Step 4: Run focused tests and static searches**

Run:

```bash
cd /home/destin/youcoded-dev/worktrees/sessions/remove-specialist-step-cap/youcoded/desktop
npx vitest run tests/specialist-child-ask-router.test.ts tests/native-session-host.test.ts tests/specialist-run.test.ts
rg -n "stepCap|DEFAULT_STEP_CAP|maxTurns → stepCap|stopped at its step limit" src/main/harness tests
```

Expected: all tests PASS; `rg` returns no matches. `max_steps` matches in the root harness are expected and must not be removed.

- [ ] **Step 5: Commit routing and documentation**

```bash
cd /home/destin/youcoded-dev/worktrees/sessions/remove-specialist-step-cap
git add .claude/rules/native-specialists.md youcoded/docs/native-runtime.md
git add youcoded/desktop/src/main/harness/specialists/child-ask-router.ts youcoded/desktop/src/main/harness/native-session-host.ts youcoded/desktop/tests/specialist-child-ask-router.test.ts
git diff --cached --check
git commit -m "docs: clarify unbounded specialist runs" -m "Submitted via YouCoded Assistant"
```

### Task 4: Verify the desktop change end to end

**Files:**
- Verify: `youcoded/desktop/src/main/harness/specialists/`
- Verify: `youcoded/desktop/src/main/harness/native-session-host.ts`
- Verify: `youcoded/desktop/tests/`

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: evidence that specialist children no longer have a fixed step cap and the retained guards are still covered.

- [ ] **Step 1: Run the complete focused test set**

Run:

```bash
cd /home/destin/youcoded-dev/worktrees/sessions/remove-specialist-step-cap/youcoded/desktop
npx vitest run tests/specialist-definition-files.test.ts tests/specialist-catalog.test.ts tests/task-tool.test.ts tests/specialist-run.test.ts tests/native-session-host.test.ts tests/specialist-child-ask-router.test.ts tests/harness-session-loop.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the required desktop verifier**

Run:

```bash
cd /home/destin/youcoded-dev/worktrees/sessions/remove-specialist-step-cap
bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/remove-specialist-step-cap/youcoded
```

Expected: the verifier completes successfully. If it fails, report the exact failing check and distinguish an environmental/pre-existing failure from a regression using the documented comparison procedure.

- [ ] **Step 3: Inspect the final diff and confirm no scope expansion**

Run:

```bash
cd /home/destin/youcoded-dev/worktrees/sessions/remove-specialist-step-cap
git diff master --check
git diff master --stat
git diff master -- youcoded/desktop/src/main/harness/model-step-budget.ts youcoded/desktop/src/main/harness/harness-session.ts youcoded/app
```

Expected: no whitespace errors; no changes to parent budget logic, shared harness loop implementation, or Android.

- [ ] **Step 4: Offer the optional harness evaluator**

Tell Destin: “The code and desktop verifier are complete. This changes native specialist behavior, so I can run a harness-evaluator dry run or a paid capped evaluation if you want additional model-behavior evidence. I will not run a paid evaluation unless you explicitly choose it.”
