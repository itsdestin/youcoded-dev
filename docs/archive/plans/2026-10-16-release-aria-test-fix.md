---
status: shipped
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

## Shipped outcome

The fixture repair shipped through app PR #628 and `v1.3.1` at `7bb39989a9fef0147b7d94eaf6e7a037f21f28ce`, after full candidate and actual release tests passed on Linux, Windows and macOS. The original compound review checkbox is retained rather than retrospectively asserting a separately documented independent fixture review. See `docs/archive/investigations/2026-10-17-release-1.3.1-verification.md` for publication and actual downloaded-asset checks.
