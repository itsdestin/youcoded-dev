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
last_verified: 2026-09-01
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
---

# Writing tests that stay green under load

**A test that fails only sometimes is worse than one that fails always** — it teaches every
session to disbelieve the suite, so a real failure beside it becomes invisible. Twelve
causes and the twelve-day Windows PDF bug they hid: `docs/testing-under-load.md`.

## Never assert on wall-clock time
**Invariant:** budget assertions measure CPU time (`process.cpuUsage()`), never
`Date.now()` / `performance.now()`.
**Why:** wall time counts time descheduled while other workers hold the CPU — a 1,000ms
budget read 1,339ms under load, failing correct code.
**Guard:** none — candidate.

## Unmount what you render
**Invariant:** never leave a React tree mounted when a test ends; `tests/setup-dom.ts`
does it for every jsdom file. Don't disable it, or rely on a tree surviving a test.
**Why:** React work still queued when jsdom is torn down throws `window is not defined`
from react-dom, which vitest reports as an *Unhandled Error*: the run fails while every
test shows passed, so the red names nothing.
**Guard:** `tests/setup-dom.ts`.

## Never let a fixed sleep stand in for a signal
**Invariant:** wait on the thing itself — an event, or `vi.waitFor` on real state — never
`setTimeout(…, 20)` hoping the work started. If nothing observable exists, that is the bug.
**Why:** under load the work hasn't started, the code takes the *other* branch, and
assertions fail as though the feature were broken. ~100 remain; convert any you touch.
**Guard:** none — candidate.

## Budgets are measured, not guessed
**Invariant:** suite-wide is 30s (`testTimeout`/`hookTimeout`); **`vi.waitFor` is a
SEPARATE 1s budget with no config option**, defaulted in `tests/setup-waitfor.ts`. A test
needing more gets a named constant with the measurement beside it
(`HEAVY_RUN_TIMEOUT_MS`), never a bare literal.
**Why:** vitest's 5s default is a unit-test budget; files here import 4,000-line modules
or spawn processes. A timeout cuts a run mid-flight, so it *looks* like a logic bug — a
misattribution that has cost three sessions.
**Guard:** none — candidate.

## Real output goes to a temp dir, and its teardown retries
**Invariant:** a test driving a CLI that writes real output points it somewhere disposable
(env override, e.g. `YOUCODED_EVAL_RUNS_DIR`) — never snapshot-and-restore a real
directory — and removes that root with a retrying remove (`maxRetries`), not `rmSync`.
**Why:** snapshot-restore cannot be correct under concurrency, and a fire-and-forget write
landing mid-removal throws `ENOTEMPTY` into a test that already passed. Both:
`docs/testing-under-load.md`.
**Guard:** `harness-eval-orchestrator.test.ts` (`RUNS_ROOT`), `rmHostRoot()`.

## The HOME sandbox is per-run
**Invariant:** `vitest.config.ts` names a pid-suffixed sandbox and exports
`YOUCODED_TEST_HOME`; `global-setup.ts` creates, wipes and — by RETURNING a teardown —
removes it. **No import-time filesystem side effect** (`knip` imports it).
**Why:** one shared directory let a second session's run delete the sandbox mid-flight.
**Guard:** `tests/home-isolation.test.ts`.

## A guard you did not break is a guard you did not test
**Invariant:** before calling a test coverage for a load-bearing rule, **delete or invert
what it guards, watch it go red, put it back** — and paste that run.
**Why:** three reviews on 2026-09-04 found tests proving nothing, in green suites: one
asserted an error string the tool never emits; one asserted totals, so deleting a code
path left every assertion true; one's fixtures made the condition under test irrelevant.
Each certified its own fixtures.
**Guard:** none — a habit, not a shape.

## Before calling a failure "flake"
Run it in isolation (passes → load-sensitive) **and** in a pristine `origin/master`
worktree (still fails → pre-existing); one idle run proves little. A deterministic failure
everywhere is usually machine state. **A red CI leg you don't run locally is not noise
until you have read it.**
