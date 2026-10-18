---
status: active
---
# Release accessibility-test repair Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this bounded task with a red/green checkpoint.

**Goal:** Keep the accessibility scanner's in-memory fixture visible when TypeScript changes Windows path separators.

**Architecture:** Normalize path separators at the virtual compiler-host boundary, without changing the scanner or renderer. Exercise both spellings before running the existing type-checker assertions.

**Tech Stack:** TypeScript compiler API, Vitest.

## Global Constraints

Only the accessibility test fixture changes in this subtask. Browser failures and Android licensing are separate investigations. No publication.

### Task 1: Prove and repair virtual-file path handling

**Files:** Modify/test `youcoded/desktop/tests/aria-props.test.ts`.

**Interfaces:** Consumes `ts.createCompilerHost`; produces the same in-memory probe for slash and backslash path spellings.

- [x] Add this assertion after the existing host overrides and before `createProgram`:
  ```ts
  expect(host.getSourceFile(probe.replaceAll('/', '\\'), ts.ScriptTarget.Latest)?.text).toBe(source);
  ```
- [x] Run `npx vitest run tests/aria-props.test.ts -t 'the scan flags'` in the private desktop dependency installation. Confirm the alternate spelling fails to return the source on Linux.
- [x] Introduce `const isProbe = (name: string) => name.replaceAll('\\', '/') === probe.replaceAll('\\', '/');` and use `isProbe(name)` in both existing host overrides. Include a WHY comment explaining TypeScript's forward-slash normalization on Windows.
- [x] Run the focused test again, then the whole `tests/aria-props.test.ts` file and `npm run typecheck`.
- [ ] Inspect the diff and obtain an independent review with the other release fixes. Leave changes uncommitted until requested.
