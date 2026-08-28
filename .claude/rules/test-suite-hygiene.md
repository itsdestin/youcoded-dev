---
paths:
  - "youcoded/desktop/vitest.config.ts"
  - "youcoded/desktop/tests/global-setup.ts"
  - "youcoded/desktop/tests/setup-dom.ts"
  - "youcoded/desktop/tests/setup-waitfor.ts"
  - "youcoded/desktop/tests/**/*.test.ts"
  - "youcoded/desktop/tests/**/*.test.tsx"
  - "youcoded/desktop/src/**/*.test.ts"
  - "youcoded/desktop/src/**/*.test.tsx"
last_verified: 2026-08-28
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

**A test that fails only sometimes is worse than one that fails always** — it teaches
every session to disbelieve the suite, and a real failure beside it becomes invisible. A
bug breaking every Windows PDF read sat in a CI log labelled "pre-existing" for twelve
days. Seven causes, fixed 2026-08-28 (youcoded#362, #363). Evidence:
`docs/testing-under-load.md`.

## Never assert on wall-clock time
**Invariant:** budget assertions measure CPU time (`process.cpuUsage()`), never
`Date.now()` / `performance.now()`.
**Why:** wall time counts time spent descheduled while other workers hold the CPU — a
1,000ms budget read 1,339ms under load, failing correct code.
**Guard:** none — candidate.

## Unmount what you render
**Invariant:** never leave a React tree mounted when a test ends; `tests/setup-dom.ts`
does it for every jsdom file. Don't disable it, or rely on a tree surviving between tests.
**Why:** React work still queued when jsdom is torn down throws `window is not defined`
from inside react-dom, which vitest reports as an *Unhandled Error* — the run fails while
every test shows as passed, so the red names nothing.
**Guard:** `tests/setup-dom.ts`.

## Never let a fixed sleep stand in for a signal
**Invariant:** wait on the thing itself — an event, or `vi.waitFor` on real state — never
`setTimeout(…, 20)` hoping the work started. If nothing observable exists, that is the bug.
**Why:** under load the work hasn't started, the code takes the *other* branch, and the
assertions fail as though the feature were broken. ~100 remain; convert any you touch.
**Guard:** none — candidate.

## Budgets are measured, not guessed
**Invariant:** suite-wide is 30s (`testTimeout`/`hookTimeout`); **`vi.waitFor` is a
SEPARATE 1s budget with no config option**, defaulted in `tests/setup-waitfor.ts`. A test
needing more gets a named constant with the measurement beside it
(`HEAVY_RUN_TIMEOUT_MS`), never a bare literal.
**Why:** vitest's 5s default is a unit-test budget; a dozen files here import 4,000-line
modules or spawn processes. A timeout cuts a run mid-flight, so it *looks* like a logic
bug — a misattribution that has cost three sessions.
**Guard:** none — candidate.

## Tests write to a temp dir, never the workspace
**Invariant:** a test exercising a CLI that writes real output points it somewhere
disposable, via an env override if needed (`YOUCODED_EVAL_RUNS_DIR`). Never
snapshot-and-restore a real directory instead.
**Why:** that guard cannot be correct under concurrency — two runs snapshot the same
directory and restore over each other — and it littered this repo every run.
**Guard:** `harness-eval-orchestrator.test.ts` (`RUNS_ROOT`).

## Teardown must tolerate writes still in flight
**Invariant:** removing a temp root a host wrote into uses a retrying remove
(`maxRetries`), not a bare `rmSync`.
**Why:** ledger writes are fire-and-forget by design, so one lands inside the tree during
its own removal walk — `ENOTEMPTY`, thrown by `afterEach` into a test that already passed.
`force: true` only swallows ENOENT.
**Guard:** `rmHostRoot()`.

## The HOME sandbox is per-run
**Invariant:** `vitest.config.ts` names a pid-suffixed sandbox and exports
`YOUCODED_TEST_HOME`; `global-setup.ts` creates, wipes and — by RETURNING a teardown —
removes it. The config must have **no import-time filesystem side effect** (`knip` imports
it).
**Why:** one shared directory let a second session's run delete the sandbox out from under
the first, mid-flight.
**Guard:** `tests/home-isolation.test.ts`.

## Before calling a failure "flake"
Run it in isolation (passes → load-sensitive) **and** in a pristine `origin/master`
worktree (still fails → pre-existing). Reproduce load with concurrent full runs; one idle
run proves little. A deterministic failure everywhere is usually machine state —
`xterm-webgl-mipmap-patch.test.ts` means postinstall has not patched this `node_modules`.
**A red CI leg you don't run locally is not noise until you have read it.**
