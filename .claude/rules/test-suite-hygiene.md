---
paths:
  - "youcoded/desktop/vitest.config.ts"
  - "youcoded/desktop/tests/global-setup.ts"
  - "youcoded/desktop/tests/setup-dom.ts"
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
  - path: youcoded/desktop/test-engine/harness-eval.mjs
    contains: "YOUCODED_EVAL_RUNS_DIR"
  - test: youcoded/desktop/tests/home-isolation.test.ts
---

# Writing tests that stay green under load

**A test that fails only sometimes is worse than one that fails always** — it teaches
every session to disbelieve the suite. On 2026-08-27 four agents each re-ran suites in
isolation to separate a real regression from noise, and one nearly dismissed another
agent's genuine breakage as flake. Five causes, all fixed 2026-08-28 (youcoded#362).

## Never assert on wall-clock time
**Invariant:** budget assertions measure CPU time (`process.cpuUsage()`), never
`Date.now()` / `performance.now()`.
**Why:** wall time counts milliseconds spent descheduled while other workers hold the
CPU. `web-fetch-tool.test.ts` bounded quadratic-blowup guards at 1,000ms and read
1,339ms under a parallel run — a false red on correct code. The regressions it pins
(2.8s–108s) are pure CPU burn, so CPU time measures the real thing at the same budget.
**Guard:** none — candidate. Grep `Date.now()` in a test before adding one.

## Unmount what you render
**Invariant:** never leave a React tree mounted when a test ends. `tests/setup-dom.ts`
runs testing-library's `cleanup` after every jsdom test — don't disable it, and don't
rely on a tree surviving between `it()` blocks.
**Why:** React defers work through `setImmediate`. Work still queued when vitest tears
down jsdom lands after `window` is deleted, as `ReferenceError: window is not defined`
from inside react-dom. Vitest calls that an **Unhandled Error**: the run fails while
every test shows as passed, so the red names no test. 18 of 113 `.tsx` files leaked it.
**Guard:** `tests/setup-dom.ts` (the `afterEach` cleanup).

## Tests write to a temp dir, never the workspace
**Invariant:** a test exercising a CLI that writes real output points it somewhere
disposable (`fs.mkdtempSync`), via an env override on the CLI if needed —
`YOUCODED_EVAL_RUNS_DIR` is the worked example. Never snapshot-and-restore a real
directory instead.
**Why:** `harness-eval` walked up to youcoded-dev and wrote into
`docs/active/investigations/` for real. A restore guard cannot be correct under
concurrency — two runs snapshot the same directory and restore over each other — and it
left an empty dated directory behind every run (five accumulated, keeping `git status`
dirty).
**Guard:** `harness-eval-orchestrator.test.ts` (`RUNS_ROOT`).

## The HOME sandbox is per-run
**Invariant:** `vitest.config.ts` names a pid-suffixed sandbox and exports
`YOUCODED_TEST_HOME`; `global-setup.ts` creates, wipes and — by RETURNING a teardown —
removes it. The config must have **no import-time filesystem side effect**: `npm run
knip` imports it.
**Why:** one fixed directory shared by every checkout let a second session's run delete
the sandbox out from under the first, mid-flight. It surfaced as ENOTEMPTY/ENOENT
temp-rename errors in whatever file was writing at that instant, and was mis-filed twice
as a bug in the victim test.
**Guard:** `tests/home-isolation.test.ts`.

## Budgets are measured, not guessed
**Invariant:** the suite-wide budget is 30s (`testTimeout`/`hookTimeout`). A test needing
more gets a **named constant with the measurement beside it** (`HEAVY_RUN_TIMEOUT_MS`,
`harness-review-runner.test.ts`), never a bare literal.
**Why:** vitest's 5s default is a unit-test budget; a dozen files here import 4,000-line
modules or spawn processes. They failed at exactly 5000ms, always in a different file. A
timeout cuts a run mid-flight, so it *looks* like a logic bug — that misattribution has
cost three sessions.
**Guard:** none — candidate.

## Before calling a failure "flake"
Run it in isolation (passes → load-sensitive) **and** in a pristine `origin/master`
worktree (still fails → pre-existing). A deterministic failure in every checkout is
usually machine state: `xterm-webgl-mipmap-patch.test.ts` failing means postinstall has
not patched this `node_modules` — its message says so. Reproduce load with concurrent
full runs; one idle run is nearly always green.
