---
paths:
  - "**/desktop/vitest.config.ts"
  - "**/desktop/tests/global-setup.ts"
  - "**/desktop/tests/setup-dom.ts"
  - "**/desktop/tests/setup-waitfor.ts"
  - "**/desktop/tests/**/*.test.ts"
  - "**/desktop/tests/**/*.test.tsx"
  - "**/desktop/src/**/*.test.ts"
  - "**/desktop/src/**/*.test.tsx"
  # Plans prescribe tests before any test file exists, and the 2026-09-10 freeze-fixes
  # plan shipped five that could not fail ("A guard you did not break…", below). Loading
  # this rule while a plan is WRITTEN is the only moment it can prevent that (2026-09-16).
  - "**/docs/*/plans/**"
last_verified: 2026-09-16
verify:
  - path: youcoded/desktop/vitest.config.ts
    contains: "youcoded-vitest-home-"
  - path: youcoded/desktop/vitest.config.ts
    contains: "testTimeout: 30_000"
  - path: youcoded/desktop/tests/setup-dom.ts
    contains: "cleanup"
  - path: youcoded/desktop/tests/setup-waitfor.ts
    contains: "DEFAULT_WAIT_FOR_MS"
  - path: youcoded/desktop/test-engine/harness-eval.mjs
    contains: "YOUCODED_EVAL_RUNS_DIR"
  - test: youcoded/desktop/tests/home-isolation.test.ts
  - path: youcoded/desktop/vitest.config.ts
    contains: "TMP_REAL"
  - path: scripts/ast-grep/rules/test-file-url-to-path.yml
  - path: scripts/ast-grep/rules/iframe-sandbox-no-allow-same-origin.yml
  - path: scripts/ast-grep/rules/test-name-describes-behaviour.yml

---

# Writing tests that stay green under load — and on Windows

**A test that fails only sometimes is worse than one that fails always.** Depth:
`docs/testing-under-load.md`. **CI runs Windows and macOS on master pushes and nightly; PRs run Linux only, so a Windows-only break shows after merge.**

## Windows runs this suite too
**Invariant:** a path from `import.meta.url` is `fileURLToPath(new URL(…))`, never `.pathname`; fixtures
live in the test's own temp dir; `mode & 0o077`, and names with `"` or `\r\n`, are POSIX-only; text reads strip `\r`.
**Guard:** `scripts/ast-grep/rules/test-file-url-to-path.yml`; the rest — candidate.

## Never assert on wall-clock time
**Invariant:** budgets measure CPU time — a pure-CPU group calls `budgetCpuPerTest()` (`tests/helpers/cpu-budget.ts`).
**Guard:** none — candidate.

## Unmount what you render
**Invariant:** no React tree stays mounted past a test; clear any timer that outlives it — queued work fails
the run while every test passed. **Guard:** `tests/setup-dom.ts`.

## Wait on a signal, never a fixed sleep or a real poll
**Invariant:** wait on an event or `vi.waitFor` on real state, never `setTimeout(…, 20)`; never a REAL
`setInterval` (`vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })` + `advanceTimersByTimeAsync`).
Positive signal first, then settle for the negative (comment it "settle"). **Guard:** `tests/test-waits.test.ts`.

## Budgets are measured, not guessed
**Invariant:** suite-wide 30s; **`vi.waitFor` has a SEPARATE 15s budget** (`tests/setup-waitfor.ts`). More needs a
named constant with its measurement; a budget raised twice is a treadmill. **A file's one-time cost (a heavy
lazy `import()`, a huge fixture) is warmed in `beforeAll` under its own budget, never in the first test** (~3s
here, over 30s on Windows: two red releases). **Guard:** none — candidate.

## Real output goes to a temp dir, and its teardown retries
**Invariant:** disposable output via an env override, never snapshot-and-restore a real directory; remove the
root with `maxRetries` (a late write throws `ENOTEMPTY`). **Guard:** `harness-eval-orchestrator.test.ts`, `rmHostRoot()`.

## The HOME sandbox is per-run
**Invariant:** `vitest.config.ts` names a pid-suffixed sandbox exporting `YOUCODED_TEST_HOME`; `global-setup.ts`
creates and wipes it and RETURNS its teardown. **No import-time filesystem side effect** (`knip` imports it).
**Guard:** `tests/home-isolation.test.ts`.

## A guard you did not break is a guard you did not test
**Invariant:** invert what a test guards, watch it go red, restore it, and paste that run — only that test
(`-t "<name>"`), against the real site. **A new source-text guard needs a reason a rule cannot express**
(cross-language parity, CSS↔TSX coupling). **Guard:** `tests/helpers/guard-scope.ts`;
`scripts/ast-grep/check.sh` fails a rule firing on no fixture.

## Never pin wording or styling
**Invariant:** no test asserts exact user-facing copy, a CSS class or a style value — find elements by
role/label, then assert what happened. Looks and copy are judged on the before/after screenshot review;
whether things work, by the release walk-through. **Why:** Destin, 2026-11-01: "we should literally never pin
exact wording. waste of code/effort." **Guard:** `tests/no-sentence-pins.test.ts` (a sentence the test
supplies itself is allowed); CSS classes — candidate.

## A test lives with its feature and is named for its behaviour
**Invariant:** a new test goes in `tests/<module>.test.ts` (or `<Surface>.test.tsx`), never a new file per
task; titles state behaviour — no dates, `§`, task ids or review rounds; shared setup in `tests/helpers/`.
**Guard:** `scripts/ast-grep/rules/test-name-describes-behaviour.yml`.

## Before calling a failure "flake"
Run it alone (passes → load-sensitive) **and** in a pristine `origin/master` worktree (fails → pre-existing).
**Never manufacture load** (`yes`, busy loops): the machine is shared — make its failure message explain the
next. **Then fix it now, never file it (Destin, 2026-09-17): a filed flake kept master red a week.**
