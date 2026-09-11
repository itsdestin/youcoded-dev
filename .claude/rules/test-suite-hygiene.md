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
session to disbelieve the suite. Twelve causes, and the twelve-day Windows PDF bug they
hid: `docs/testing-under-load.md`.

## Never assert on wall-clock time
**Invariant:** budget assertions measure CPU time (`process.cpuUsage()`), never wall clock.
**Why:** wall time counts time descheduled while other workers hold the CPU — a 1,000ms
budget read 1,339ms under load.
**Guard:** none — candidate.

## Unmount what you render
**Invariant:** never leave a React tree mounted when a test ends (`tests/setup-dom.ts`
does it for every jsdom file), and clear any timer that outlives it.
**Why:** work still queued when jsdom is torn down throws `window is not defined` as an
*Unhandled Error* — the run fails while every test shows passed, so the red names nothing.
**Guard:** `tests/setup-dom.ts`.

## Never let a fixed sleep stand in for a signal
**Invariant:** wait on the thing itself — an event, or `vi.waitFor` on real state — never
`setTimeout(…, 20)` hoping the work started. If nothing observable exists, that is the bug.
Waiting for a control to ENABLE is the same mistake when the value lands after it.
**Why:** under load the work hasn't started and the code takes the *other* branch. ~100
remain; convert any you touch.
**Guard:** none — candidate.

## Budgets are measured, not guessed
**Invariant:** suite-wide is 30s; **`vi.waitFor` is a SEPARATE 1s budget with no config
option** (`tests/setup-waitfor.ts`). More needs a named constant with its measurement beside
it — and a budget raised twice is a treadmill: wait on a signal instead.
**Why:** a timeout cuts a run mid-flight, so it *looks* like a logic bug — a misattribution
that has cost three sessions.
**Guard:** none — candidate.

## Real output goes to a temp dir, and its teardown retries
**Invariant:** send real output somewhere disposable via an env override, never
snapshot-and-restore a real directory, and remove that root with a retrying remove
(`maxRetries`), not `rmSync`.
**Why:** snapshot-restore cannot be correct under concurrency; a fire-and-forget write
landing mid-removal throws `ENOTEMPTY` into a passing test · `docs/testing-under-load.md`.
**Guard:** `harness-eval-orchestrator.test.ts` (`RUNS_ROOT`), `rmHostRoot()`.

## The HOME sandbox is per-run
**Invariant:** `vitest.config.ts` names a pid-suffixed sandbox exporting
`YOUCODED_TEST_HOME`; `global-setup.ts` creates, wipes and — by RETURNING a teardown —
removes it. **No import-time filesystem side effect** (`knip` imports it).
**Why:** one shared directory let a second session's run delete the sandbox mid-flight.
**Guard:** `tests/home-isolation.test.ts`.

## A guard you did not break is a guard you did not test
**Invariant:** invert what a test guards, watch it go red, restore it — and paste that run.
Three ways red lies: **run only the test you are proving** (`-t "<name>"`) — a
tautological check "passed" because four OTHER tests went red; **confirm the break landed at
the site under test** — a hardcoded line re-added to the first of two identical call sites
left the rendered one working; **use the real regression, not a lookalike** — a guard
matching ". " missed a sub-label with no full stop.
**Why:** green suites full of tests proving nothing (three, 2026-09-04).
**Guard:** `tests/helpers/guard-scope.ts` (~20 source-scanning tests use it):
`readStripped()` drops comments, `assertPatternMatches()` fails a pattern matching nothing.
Anchor to the ONE thing you mean — bare `toContain('disabled={hostOnly}')` passed with that
prop deleted. `scripts/ast-grep/check.sh` fails a rule firing on no fixture.

## Before calling a failure "flake"
Run it in isolation (passes → load-sensitive) **and** in a pristine `origin/master`
worktree (still fails → pre-existing). Failing everywhere is usually machine state.
**A red CI leg you have not read is not noise.**
