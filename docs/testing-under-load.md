# Testing under load — what actually broke, and how it was measured

Depth for `.claude/rules/test-suite-hygiene.md`. Read that rule first; this file is the
evidence behind it, kept out of the rule so the rule stays inside its word budget.

Fixed 2026-08-28 in youcoded **#362** (the flakiness) and **#363** (Windows, plus two
classes #362 did not reach).

## Why this mattered more than a red suite

The suite failed a *varying* set of files on every loaded run. That trained sessions to
disbelieve it. Two consequences, both observed:

1. During the 2026-08-27 status-bar work, **four agents each re-ran suites in isolation**
   to tell a real regression from noise; one nearly attributed another agent's genuine
   breakage to flakiness.
2. **A real product bug hid inside the noise for twelve days.** Desktop CI's Windows leg
   was red from 2026-08-16, filed in ROADMAP as "two pre-existing, unrelated failures". It
   was 19 failures across 4 files, and ten of them were one bug: *every PDF read fails on
   Windows*. Nobody had opened the log.

That second one is the case for treating flakiness as urgent rather than cosmetic.

## Reproduction

An idle full run is nearly always green — it proves nothing. Load is the variable:

```bash
cd youcoded/desktop
for i in 1 2 3; do npx vitest run > /tmp/run-$i.txt 2>&1 & sleep 3; done; wait
```

| | before | after |
|---|---|---|
| 3 concurrent full runs | **6 files failed**, a different set each run | — |
| 4 concurrent full runs | — | **4/4 green**, 7,429 tests each, 0 unhandled errors |

## The seven causes

### 1. One shared sandbox HOME for every checkout (#362)
`vitest.config.ts` pointed every checkout at `os.tmpdir()/youcoded-vitest-home`, and
`global-setup.ts` wipes it at run start. A second session's run therefore deleted the
first run's sandbox mid-flight, surfacing as ENOTEMPTY/ENOENT temp-rename errors in
whatever unrelated file was writing at that instant. Filed twice as a bug in the victim
test (2026-08-06, 2026-08-27).

Now pid-suffixed. Two things were verified before relying on them, because the old comment
asserted the opposite: the config module is evaluated **exactly once** per `vitest run`,
in the main process, and `test.env` is what propagates HOME into workers. `globalSetup`
runs in that same process, so it reads `YOUCODED_TEST_HOME` rather than re-deriving.

### 2. Vitest's 5s default `testTimeout` (#362)
Measured in isolation on a 32-core box: `harness-review-runner` 25.1s, `harness-eval-
orchestrator` 11.3s, `remote-server` 5.0s, `engine-supervisor` 4.5s, `mcp-startup-wiring`
2.7s — **for the whole file**. A single heavy test sat within a rounding error of the 5s
per-test budget before any contention. Failures landed at exactly 5000ms, always in a
different file.

Now 30s suite-wide. `harness-review-runner` gets `HEAVY_RUN_TIMEOUT_MS = 120_000`: its
existing per-test 30s budget was itself measured failing at 30,289ms under 3× load. Its
work is real CPU (200 tool calls through a real `HarnessSession`); `run-case.ts` has no
artificial delay, so there was nothing to optimise away.

### 3. `vi.waitFor`'s separate 1s budget (#363)
**The gap #362 missed.** vitest hardcodes `timeout = 1e3` for `waitFor`/`waitUntil` and
offers **no config option**, so raising `testTimeout` did nothing for ~60 bare calls across
13 files. Windows CI then failed `specialist-run.test.ts` with `expected 'running' to be
'completed'` — a background specialist streaming ~69,000 characters had not finished inside
one second. Defaulted centrally in `tests/setup-waitfor.ts`; an explicit per-call timeout
still wins in both the options and numeric-shorthand forms.

### 4. React work surviving jsdom teardown (#362)
18 of 113 `.tsx` files never unmounted. Queued scheduler work (React defers via
`setImmediate`) landed after `window` was deleted. Vitest reports that as an **Unhandled
Error**: the run fails while every test shows as passed. Fixed centrally in
`tests/setup-dom.ts` rather than in the three files that had been caught; all 142 `.tsx`
suites pass with it.

### 5. Teardown racing fire-and-forget writes (#363)
`ENOTEMPTY: directory not empty, rmdir '/tmp/yc-host-…/.youcoded/sessions'`, thrown by
`afterEach` **into a test that had already passed**. `destroyAll()` deliberately does not
drain delegation-ledger writes (a failed bookkeeping write must never cost the user their
session), so one lands inside the tree during its own removal walk. `force: true` only
swallows ENOENT. `rmHostRoot()` uses Node's own answer — `fs.rm` retries
EBUSY/EMFILE/ENFILE/ENOTEMPTY/EPERM with a linear backoff.

### 6. The suite wrote into this workspace (#362)
`harness-eval`'s `resolveRunsDir` walked up to youcoded-dev and wrote into
`docs/active/investigations/harness-eval-runs/<date>/` for real. The tests defended with a
file-by-file snapshot/restore guard, which cannot be correct under concurrency — that was
the unexplained `ENOENT … run-summary-unit-test-plan.json`. It also left an empty dated
directory behind every run; five had accumulated, keeping `git status` dirty.
`YOUCODED_EVAL_RUNS_DIR` now redirects it; real runs are unchanged.

### 7. Wall-clock budgets (#362)
`web-fetch-tool.test.ts` bounded 15 quadratic-blowup guards with `Date.now()` and a
1,000ms budget, and read 1,339ms under load. The proposed fix (a fake clock) would have
**defeated** those tests — their whole subject is real CPU burn, 2.8s–108s before the
fixes they pin. `process.cpuUsage()` is immune to descheduling, so the original 1,000ms
budgets stand unchanged and still catch every regression.

## Windows: two real product bugs, not test bugs

Both shipped. Both were visible only on the CI leg being ignored.

**PDF reads failed outright.** `pdfjsAssetDirs()` appended `path.sep`. pdf.js validates
these inside `getDocument()` — `if (val.endsWith("/")) return val;` else
`Invalid factory url: "…" must include trailing slash.` On Windows `path.sep` is `\`, so
every PDF read threw before parsing. A forward slash is correct on Windows too: in Node,
pdf.js resolves the concatenated string with `fs.readFile`, not a URL parser.

**Filename case was flattened.** `workspaceMatchFor` built its returned segments from
`canonical`, and `canonicalize()` lowercases on win32 (right for the comparisons it feeds).
So the "did you mean this workspace file?" recovery answered `roadmap.md` for `ROADMAP.md`.
Quiet, because the filesystem is case-insensitive — but that string reaches the model and
the user, and git's index is case-sensitive everywhere. `toPosix`'s own doc comment already
warned this was "destructive for anything a user or model reads back".

### The lesson about guards
The PDF contract test (*"both dirs end with `/`"*) is **vacuous on POSIX** — `path.sep`
*is* `/` there. That is exactly why the bug shipped and survived: the only machine that
could see it was the leg nobody read. So the guard that matters is the **source scan**
asserting `path.sep` never returns to that function; it goes red on a developer's own
machine. Confirmed red-first by reverting the fix.

Prefer a guard that can fail where the work happens. A test that can only fail on a
platform you don't run is a guard in name only.

## Residual, deliberately not fixed

**~100 fixed sleeps remain** across the suite (36 in `native-session-host.test.ts`) of the
form `await new Promise((r) => setTimeout(r, N))`. Not all are waits — some legitimately
let time pass — but each one that stands in for a signal is a latent version of cause 3.
Converting them wholesale, blind, would be more dangerous than leaving them; convert the
ones you touch. Tracked in ROADMAP.
