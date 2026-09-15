# Model Picker Selectable-First Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put selectable model rows before unavailable rows without changing filtering, selection, or within-group order.

**Architecture:** `ModelPicker` already assigns each row `unavailable` from the shared availability authority. The existing memo first builds filtered/favourited rows and optionally pins the selected model. Add one final stable partition of that resulting array: rows without `unavailable`, then rows with it. A focused DOM test supplies overlapping ChatGPT and OpenRouter models to pin the visible behavior.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library.

---

### Task 1: Pin the visible selectable-first regression

**Files:**
- Create: `youcoded/desktop/tests/model-picker-selectable-first.test.tsx`
- Modify: none

- [ ] **Step 1: Write the failing test**

Create a jsdom test with a mocked `window.claude.providers` bridge. Return ready ChatGPT and unready OpenRouter providers, each with a catalog model whose label contains `Astra`. Render `ModelPicker` with `includeClaude={false}`, open it, search for `astra`, and assert the model-row buttons occur in ChatGPT then OpenRouter order. Assert both rows exist, ChatGPT is enabled, and OpenRouter remains disabled.

```tsx
const rows = await screen.findAllByRole('button', { name: /Astra/ });
expect(rows.map((row) => row.textContent)).toEqual([
  expect.stringContaining('ChatGPT'),
  expect.stringContaining('OpenRouter'),
]);
expect(rows[0]).toBeEnabled();
expect(rows[1]).toBeDisabled();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run tests/model-picker-selectable-first.test.tsx`

Expected: FAIL because catalogue order currently determines the result order, leaving the unavailable OpenRouter row first.

### Task 2: Apply the final stable availability ordering

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/model/ModelPicker.tsx:517-548`
- Test: `youcoded/desktop/tests/model-picker-selectable-first.test.tsx`

- [ ] **Step 1: Add a local final-order helper inside the existing `rows` memo**

After the existing `pinSelectedToTop` logic determines its `ordered` array, return a stable partition based only on the flag which already disables the row. Add a WHY comment explaining that ordering and selectability must have one authority and that sorting after pinning keeps the selected row inside its own availability group.

```ts
const selectable = ordered.filter((entry) => !entry.unavailable);
const unavailable = ordered.filter((entry) => entry.unavailable);
return [...selectable, ...unavailable];
```

Refactor the early return from the no-pinning branch into the shared final-order path. Do not change entry construction, filtering predicates, `unavailableReason`, or `onSelect`.

- [ ] **Step 2: Run the focused test to verify it passes**

Run: `cd youcoded/desktop && npx vitest run tests/model-picker-selectable-first.test.tsx`

Expected: PASS; the selectable ChatGPT row is first and the unavailable OpenRouter row remains visible and disabled.

### Task 3: Cover stable groups and unavailable selected pinning

**Files:**
- Modify: `youcoded/desktop/tests/model-picker-selectable-first.test.tsx`

- [ ] **Step 1: Add a stable-order test**

Return two selectable and two unavailable matching catalogue rows in deliberately interleaved catalogue order. Search for their common term and assert that selectable rows lead, while the relative order inside the selectable group and unavailable group matches catalogue order.

```tsx
expect((await screen.findAllByRole('button', { name: /Shared/ })).map((row) => row.textContent))
  .toEqual([
    expect.stringContaining('Ready first'),
    expect.stringContaining('Ready second'),
    expect.stringContaining('Unavailable first'),
    expect.stringContaining('Unavailable second'),
  ]);
```

- [ ] **Step 2: Add an unavailable-selected pinning test**

Use the default favourites view with `pinSelectedToTop`, an unavailable selected OpenRouter model, and at least one selectable favourite. Assert that the selectable favourite is first and the selected unavailable model is first among unavailable rows. This proves pinning happens before the final partition and cannot promote an unavailable row above a selectable one.

- [ ] **Step 3: Run the test file to verify it passes**

Run: `cd youcoded/desktop && npx vitest run tests/model-picker-selectable-first.test.tsx`

Expected: PASS for all selectable-first cases.

### Task 4: Verify the affected picker suite

**Files:**
- Modify: none

- [ ] **Step 1: Run picker regression tests**

Run: `cd youcoded/desktop && npx vitest run tests/model-picker-selectable-first.test.tsx tests/model-picker-refresh.test.tsx tests/model-picker-load-failure.test.tsx`

Expected: all tests pass.

- [ ] **Step 2: Run the desktop verification suite**

Run: `bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/model-picker-provider-sort`

Expected: types, affected tests, source guards, knip, lint, and ast-grep all pass.

- [ ] **Step 3: Inspect the final diff**

Run: `git -C /home/destin/youcoded-dev/worktrees/sessions/model-picker-provider-sort diff --check && git -C /home/destin/youcoded-dev/worktrees/sessions/model-picker-provider-sort diff -- youcoded/desktop/src/renderer/components/model/ModelPicker.tsx youcoded/desktop/tests/model-picker-selectable-first.test.tsx`

Expected: no whitespace errors; only the final-order logic and its focused regression coverage change.
