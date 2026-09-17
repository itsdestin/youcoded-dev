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

---

# Writing tests that stay green under load — and on Windows

**A test that fails only sometimes is worse than one that fails always** — it teaches
sessions to disbelieve the suite. Depth: `docs/testing-under-load.md`. **CI runs this suite on
Windows and macOS too**: 16 tests were red on Windows for a week (2026-09-10 to 09-16).

## Windows runs this suite too
**Invariant:** a file path from `import.meta.url` is `fileURLToPath(new URL(…))`, never
`.pathname` (`/D:/a/…` → `D:\D:\a\…`). Fixture paths come from the test's own temp dir, never
literal `/a`. `mode & 0o077` is asserted only off `win32`. A file name with `"` or `\r\n` is
created only on POSIX. Text reads strip `\r` before `split('\n')` (`.gitattributes` checks out
LF too).
**Why:** each shape failed a week of Windows runs. `vitest.config.ts` exports the realpath
spelling of the temp dir (`TMP_REAL`), so `RUNNER~1` short names never reach a comparison.
**Guard:** `scripts/ast-grep/rules/test-file-url-to-path.yml`; the rest — candidate.

## Never assert on wall-clock time
**Invariant:** budget assertions measure CPU time (`process.cpuUsage()`), never wall clock
(a 1,000ms budget read 1,339ms under load). **Guard:** none — candidate.

## Unmount what you render
**Invariant:** never leave a React tree mounted when a test ends (`tests/setup-dom.ts`
does it for jsdom files), and clear any timer that outlives it.
**Why:** work queued past teardown fails the run while every test passed.
**Guard:** `tests/setup-dom.ts`.

## Never let a fixed sleep or a real poll stand in for a signal
**Invariant:** wait on the thing itself — an event, or `vi.waitFor` on real state — never
`setTimeout(…, 20)` hoping the work started, and never a REAL `setInterval` (fake it:
`vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })` + `advanceTimersByTimeAsync`).
A client response you never `resume()` never closes. Wait for the positive signal, then settle
for the negative. **Why:** under load the work hasn't started; ~100 remain.
**Guard:** none — candidate.

## Budgets are measured, not guessed
**Invariant:** suite-wide is 30s; **`vi.waitFor` is a SEPARATE 15s budget** (`tests/setup-waitfor.ts`).
More needs a named constant with its measurement; a budget raised twice is a treadmill — wait
on a signal. **Why:** a timeout looks like a logic bug; it cost three sessions.
**Guard:** none — candidate.

## Real output goes to a temp dir, and its teardown retries
**Invariant:** disposable output via an env override, never snapshot-and-restore a real
directory; remove the root with `maxRetries`, not bare `rmSync` (a late write throws `ENOTEMPTY`
into a passing test).
**Guard:** `harness-eval-orchestrator.test.ts` (`RUNS_ROOT`), `rmHostRoot()`.

## The HOME sandbox is per-run
**Invariant:** `vitest.config.ts` names a pid-suffixed sandbox exporting `YOUCODED_TEST_HOME`;
`global-setup.ts` creates, wipes and — by RETURNING a teardown — removes it. **No import-time
filesystem side effect** (`knip` imports it). **Guard:** `tests/home-isolation.test.ts`.

## A guard you did not break is a guard you did not test
**Invariant:** invert what a test guards, watch it go red, restore it — and paste that run.
Run only the test you are proving (`-t "<name>"`); confirm the break landed at the site under
test; use the real regression, not a lookalike. **Why:** three green guards proved nothing
(2026-09-04). **Guard:** `tests/helpers/guard-scope.ts` (`readStripped()`, `assertPatternMatches()`);
`scripts/ast-grep/check.sh` fails a rule firing on no fixture. **A new source-text guard needs a
reason a rule cannot express** (parity across languages, CSS↔TSX coupling). The 2026-09 sweep
converted or deleted the rest of its 114; the kept ones and unswept files are
`node scripts/test-inventory.mjs` section 3.

## Before calling a failure "flake"
Run it alone (passes → load-sensitive) **and** in a pristine `origin/master` worktree (still
fails → pre-existing). **Then fix it or file it with the cause — an unread red leg is
not noise; an unowned filed flake kept master red for a week.**
