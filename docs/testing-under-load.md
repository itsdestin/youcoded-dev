# Testing under load — what actually broke, and how it was measured

Depth for `.claude/rules/test-suite-hygiene.md`. Read that rule first; this file is the
evidence behind it, kept out of the rule so the rule stays inside its word budget.

Fixed 2026-08-28 in youcoded **#362** (the first five causes) and **#363** (Windows, plus
seven more classes #362 did not reach). **Twelve causes in total** — the count matters only
because the list grew twice AFTER CI had gone green, which is the real lesson here.

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
| 6 concurrent full runs | (never attempted) | **6/6 green**, 0 unhandled errors |
| Desktop CI (ubuntu/macOS/Windows) | red since 2026-08-16 | **green** at `0371c265` |

## Causes 1–7 — the flakiness (#362) and the first Windows round (#363)

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

## Causes 8–12 — found by local stress, after CI had already gone green once

The list above was written when CI first passed on all three platforms. It was not the
end. Running **six concurrent full suites locally** — a far harsher load than any real
scenario, and the thing that should have been done first — surfaced five more, each a
distinct mechanism. Do this before believing a suite is stable:

```bash
cd youcoded/desktop
for i in 1 2 3 4 5 6; do npx vitest run > /tmp/run-$i.txt 2>&1 & sleep 2; done; wait
```

### 8. Another fixed shared temp path, outside the sandbox
Bash spills output to `os.tmpdir()/youcoded-harness-bash-output/<sessionId>`, resolved
from `os.tmpdir()` directly — correct for production, and therefore **not covered by the
HOME redirect of cause 1**. Every test run used `sessionId: 'test'`, so concurrent suites
shared one directory and the `afterEach` deleted it out from under the others:
`expect(fs.existsSync(r.outputPath)).toBe(true)` failed on a file that had been written
and then removed by a different process. Session ids are per-process now, here and in the
two background-shell tests (whose log filenames embed a `shellId` that restarts at 1 in
every process).

**The general lesson: a HOME redirect does not catch a path built from `os.tmpdir()`.**
When you sandbox by environment, anything resolving a temp path directly escapes it.

### 9. Hand-rolled poll ceilings
Cause 3 raised `vi.waitFor`'s default, but 18 loops poll by hand
(`for (let i = 0; i < 50; i++) { …; await sleep(10) }` — a 500 ms ceiling) and no default
can reach those. ubuntu CI failed `expected [] to deep equally contain …` on a permission
rule that *was* persisted, just not within half a second under load. These loops already
wait on a real condition; only the ceiling was wrong, so the fix was a named tries count
sized to ~15 s at each loop's own interval.

### 10. A second, competing deadline
`harness-review-runner` passed `runCase` its own 60 s wall-clock deadline while asserting
about the **step budget**. Two clocks raced to end the same run, and under load the wrong
one won: `expected 'timeout' to be 'budget'`. That reports as a *wrong value*, which reads
like broken wrap-up reasoning rather than "this was slow". Every deadline that is not its
test's subject now uses one constant set far **above** vitest's budget, so vitest is the
single authority and a genuine hang is always reported as a timeout.

**Two budgets that can both end the same operation is a bug even when both are generous.**

### 11. Reading a fire-and-forget write one-shot
`spawnSpecialist` resolves on the report; the ledger's completion write lands behind it.
macOS CI failed `expected 'running' to be 'completed'` while the report assertion on the
line above passed. Distinct from cause 9 in the same way a missing wait differs from a
short one — there was no wait at all.

### 12. A 2× timing margin
The stall-watchdog test drove progress every 60 ms against a 120 ms budget, so one
scheduler hiccup tripped the watchdog and the test failed as though progress did not
re-arm it. Now 40 ms against 600 ms — a 15× margin — while 1,800 ms vs 600 ms keeps
"would have expired without progress" true three times over. **The assertion's meaning did
not change; only the headroom did.** When a timing test is flaky, check the ratio it
depends on before touching what it asserts.

## Two traps created while fixing this

Recorded because both are easy to repeat, and both were caught by measurement rather than
by review:

**A `vi.waitFor` under fake timers perturbs what it waits for.** Added to a test that
installs `vi.useFakeTimers({ toFake: [… 'Date'] })`, the wait advances the fake clock on
every check — so a 15 s budget drove ~300 synthetic clock jumps through a system whose
staleness logic is driven by that same clock. It ran its full budget and never saw the
result. Fix: hand time back to the real clock (`vi.useRealTimers()`) once the fake-clock
part of the test is done.

**Raising the ceiling of a loop with no break condition is pure cost.**
`transcript-watcher`'s negative assertion — "give the read every chance to fire, then
require silence" — has no early exit, so every iteration is paid on every run. Sizing it
like the wait-for-success loops turned a 250 ms pause into 15 s and made that file **6×
slower** (3.16 s → 18.04 s) for no added confidence. Caught only by timing the file before
and after. **Before raising any loop's ceiling, check whether it can exit early.**

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
let time pass, and at least one is a negative assertion that MUST stay small (see the
second trap above) — but each one that stands in for a signal is a latent version of
causes 9–12. Converting them wholesale, blind, would be more dangerous than leaving them;
convert the ones you touch.

**`mcp-startup-wiring.test.ts` still exceeds 30 s at EIGHT concurrent suites**, because it
`await import()`s all 3,906 lines of `ipc-handlers.ts` inside the test body. The import
cannot be hoisted: that file's `os` mock is a closure over a per-test temp dir, so a static
import would evaluate before the dir exists. Eight concurrent suites is far past any real
scenario (CI runs one) and six is green, so this was left rather than restructured on
speculation. If it ever fails on real CI, the fix is to restructure the mock so the import
can move to module scope — **not** to raise the number again.

Both are tracked in ROADMAP.
