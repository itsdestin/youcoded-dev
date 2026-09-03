---
date: 2026-09-02
status: shipped
type: handoff
topic: overnight session C — making the verification tooling honest
---

# Session C — the verification tooling now tells the truth about itself

**PRs, both MERGED:** youcoded#384 -> `da955301` (the app's test tree) · youcoded-dev#19 ->
`ba0566c` (the workspace tooling).
Headless throughout — no dev window, no `run-dev.sh`.

The short version: **three of the eight filed items were already fixed on `master`** and only
looked broken because the shared checkout is ~100 commits behind. Two were real and are fixed.
One was real but its *named victims* were wrong, and it is re-scoped rather than closed. Every
claim below has the command output behind it.

---

## 1. The workbench boot check — REAL, fixed

**Reproduced on a clean checkout, first thing:**

```
$ node scripts/workbench-boot-check.mjs 5999      # nothing listening on 5999
ok    parent frame (toolbar)
ok    app · default
… (14 more)
All 16 workbench routes mount cleanly.
$ echo $?
0
```

Chrome renders its own `ERR_CONNECTION_REFUSED` page. That page has no "failed to start" text,
no `#boot` spinner, and throws no exception — so all three of the script's probes read clean and
every route scored `ok`. `CLAUDE.md` tells every session to run this after any mock-shim change,
so a dead dev server read as a passing app.

**Fixed with three assertions, each proven to fire on its own** (not inferred — each was driven
by a purpose-built server):

| Assertion | How it was proven |
|---|---|
| Preflight HTTP request to the port | dead port → `exit 2`, `nothing is serving the workbench on port 5999 (ECONNREFUSED)` |
| `Page.navigate` errorText + document HTTP status | a server answering 500 → `server answered HTTP 500 for the page` |
| `#root` present in the DOM | a live server that is not the workbench → `#root is not in the DOM — this page is not the workbench` |

**No false red:** against a real workbench on port 5263, `16/16 routes, exit 0`.

The preflight was moved **above** the Chrome launch, which has a second payoff: the whole
dead-port case is now one HTTP request, so `scripts/workbench-boot-check.test.mjs` can guard it
on a runner with no browser. Wired into Workspace CI. `CLAUDE.md`'s stale route count
(12) corrected to 16.

---

## 2. `harness-eval-orchestrator.test.ts` — the brief was stale; the flake is real but different

**The filed symptom did not reproduce.** The brief said the test at ~:1747 expects 2 transcript
files and gets 1. Run alone on clean `master`:

```
$ npx vitest run tests/harness-eval-orchestrator.test.ts
 Test Files  1 passed (1)
      Tests  86 passed (86)
```

**No bisect was run, because there was nothing red to bisect.** `docs/roadmap/shipped.md` already
carries `- [x] 2026-09-01 dev-workspace — harness-eval-orchestrator.test.ts has a red test on
master (youcoded 780de530 + 6cab56b9 in #362/#363; 86/86 green on master f2d229e4)`. The
transcript-count failure was the concurrency bug that the `YOUCODED_EVAL_RUNS_DIR` override fixed
on 2026-08-28 — before that, the suite wrote into the real workspace and two concurrent runs
snapshot/restored over each other.

**The second half of the brief WAS real.** *"does not advertise models a `--only` run will not
touch"* times out — see §4.

---

## 3. `ipc-handlers.test.ts` import-time flake — already fixed; the live one is a different file

`docs/roadmap/shipped.md:280` closes it: `SkillConfigStore.save()` writes a per-writer temp name
(`.${pid}.${seq}.tmp`) since `f05b2711` (2026-08-05), so the ENOENT rename collision cannot
happen. The surviving relative is `mcp-startup-wiring.test.ts`, which `await import()`s all of
`ipc-handlers.ts` inside five test bodies. **It did not fail once in 27 full local runs**,
including two 8-way concurrent sweeps. Its investigation says not to raise the budget again
without a real CI failure, and I did not.

---

## 4. The parallel-load flakes — REAL, four of them, none of them the three that were filed

**How they were forced.** Twenty-seven full suite runs on this tree, escalating load:

| Load | Runs | Result |
|---|---|---|
| 1 suite alone | 1 | green, 37 s |
| 6 concurrent full suites | 6 | 6/6 green |
| 4 concurrent, pinned to 4 cores (`taskset -c 0-3`) | 4 | 4/4 green |
| **8 concurrent full suites** | 8 | **7 of 8 runs failed** |
| 8 concurrent, after the fixes | 8 | **8/8 green**, 7,828 tests each, 166 s per run |

**The shared cause of two of the four:** a fixed wall-clock per-test budget standing in for "did
it hang?", on tests whose work is spawning real processes or driving 200 real turns. That budget
was measured on an idle machine; under contention it measures the machine, not the code.

- `harness-eval-orchestrator` › *does not advertise models a `--only` run will not touch* —
  `Test timed out in 30000ms` in **3/8** runs. It spawns **two** real node processes; most tests
  in the file already pass an explicit `}, 60_000)` and this one did not. The file went from ~17 s
  alone to 138 s under 8-way load.
- `harness-review-runner` › *survives the max_steps gate up to STEP_GATE_ALLOWANCE* — same
  timeout, **4/8**. It drives `STEP_GATE_ALLOWANCE * BATTERY_STEP_BUDGET` = 200 tool calls through
  a real `HarnessSession`, and it sits **above** the comment in its own file that tells every test
  below it to pass `HEAVY_RUN_TIMEOUT_MS` (120 s). 157 s under load.

  Both fixed with a **file-level** `vi.setConfig`, not another hand-applied constant — relying on
  each author to remember is precisely what failed.

- `comment-list` › *shows a held comment once…* — `expected "vi.fn()" to be called…, Number of
  calls: 0`. `onHeldListed` fires from a passive effect, one beat after the commit the test waited
  on. Now inside a `waitFor`.
- `feedback-section` › *posts a comment and makes the thread re-read* — `expected +0 not to be +0`.
  It snapshotted the props array into a local and then waited on the **snapshot**, which can never
  change. Now reads the live array inside the `waitFor`. (This one only surfaced *after* the first
  three were fixed — it had been masked by whichever suite failed first.)

**The three suites that were filed — `subagent-view`, `mcp-startup-wiring`, `project-watcher` —
never failed in any of the 27 runs.** That entry is re-scoped, not closed: the `project-watcher`
sighting was Ubuntu CI, not local, so the trigger may simply be a different machine shape. Saying
"fixed" about something I could not make fail would be exactly the dishonesty this session was
about.

---

## 5. `desktop/tests/` type-checking and linting — REAL, landed with a named debt

`tsconfig.json`'s `include` was `src/**/*`, so **nothing had ever type-checked a test file**.

Three compiler options were needed before the real errors were visible, each measured rather than
guessed: `moduleResolution: "bundler"` (12 phantom "cannot find module" errors for `vite` and
`@vitejs/plugin-react` under the base's classic node resolution), `allowJs`+`checkJs:false` (57
implicit-any errors from importing the untyped `test-engine/*.mjs`), and `DOM.Iterable` (5, from
iterating a `querySelectorAll` result). 258 → 246 → **201 real errors in 57 files.**

**Those 57 files are excluded, by name, one per line**, so the gate ships green — the same
green-gate rule the ESLint config states. `scripts/verify.sh` prints the count on every run:

```
PASS  types in tests/ (tsc --noEmit, 57 file(s) still excluded)
```

**514 of 571 files are type-checked today.** One error was fixed rather than excluded:
`tests/helpers/chat-store-harness.ts` is imported by three suites, and `exclude` does not apply to
a file an included file imports — a useful thing to know before assuming the list is a wall.

The lint half found only **5 errors in 4 files**, every one a false positive on deliberate code
(three literal `${…}` strings that are the subject of their test, a helper named `use` that builds
a tool-*use* event, and a deliberately >2^53 integer). Each now carries a named `eslint-disable`
with its reason, so the rules stay on for future tests. Type-aware rules are deliberately absent
from the tests block: pointing them at a project that excludes 57 files fails all 57 with "not
found in project", which is a config error dressed up as a lint finding.

---

## 6. The audit-staleness reminder — ALREADY FIXED on master; proven firing

No code change was needed. `git log` shows `5598f69 fix(hooks): audit-staleness reminder skips
baseline files instead of picking the newest name`, and `.claude/hooks/context-inject.test.mjs`
already carries three cases for it. **The reason it "never fired" is that the shared youcoded-dev
checkout is ~100 commits behind `origin/master`.**

Proven firing by running the real hook against a probe report:

```
### ⚠️ Audit staleness
Latest audit (2026-09-02-PROBE.md) is 243 days old. Consider running `/audit`.

### ⚠️ Unapplied audit findings
3 open item(s) in 2026-09-02-PROBE.md. Review the ## Residue section.
```

It is silent today for the right reason: the newest non-baseline report is `2026-09-01.md`, one
day old, `residue: 0`.

---

## 7. Anchors and the four "already done" entries — all already closed

```
$ node scripts/audit-anchors.mjs --no-diff
anchors: 394/394 ok · MAP paths: 345/345 ok · eager ≈7992 tokens (limit 10000)
MECHANICAL PASS: OK
```

All four entries the difficulty ranking flagged are already `[x]` in `docs/roadmap/shipped.md`:
the CI anchor cron (closed 2026-09-01), the two doc anchors (2026-09-01), the curated-defaults
dead id (2026-09-01), and `conversation-triage.mjs`, which was **dropped** on 2026-09-02 with the
reason recorded ("the /wrap-up skill makes each session report its own friction"). I confirmed the
file is in neither git nor the working tree and did **not** re-create it — re-creating a 526-line
tool that a decision already replaced would be building something nobody asked for.

The roadmap tool then found an entry I *had* fixed, by its own anchor:

```
### Claims — 101 checked, 1 broken
- dev-workspace:70 The workbench boot check prints "ok" for all 12 routes and exits 0 …
```

Closed and archived. Now `100 checked, 0 broken`.

---

## 8a. `verify.sh` in a symlinked worktree — REAL, fixed properly rather than warned around

**Reproduced** in a throwaway worktree whose `desktop/node_modules` was a symlink to the main
checkout:

```
Caused by: Error: Denied ID …/highlight.js/styles/github-dark.css?inline
 Test Files  60 failed | 24 passed (84)
      Tests  255 passed (255)
```

Note the shape: **60 files failed and 0 assertions failed.** Vite resolves through the symlink to
the real path, then its dev-server file guard denies anything outside the project root. The only
imports that pass through that guard are Vite-transformed asset URLs, so the failure is not
"module not found" but a denial thrown at module load — and the summary blames your diff.

Fixed in `vitest.config.ts` by naming the resolved `node_modules` in `server.fs.allow`. Same
worktree, after: **`Test Files 84 passed (84)`**. This is test-config only; the app's
`vite.config.ts` is untouched.

**This does not make a symlinked `node_modules` safe** — `npm ci` and Gradle's `bundleWebUi` still
follow it and empty the shared copy for every worktree at once. So `verify.sh` now *also* prints a
loud warning naming that hazard and the `cp -al` replacement command. Real fix for the lie, loud
warning for the danger that cannot be fixed from there.

## 8b. Fixed sleeps standing in for signals — 6 of 108 converted

`108` counted (not "about a hundred"): 34 in `native-session-host.test.ts` alone. **Six were
taken, and the choice of which six is the point.**

Five were literally the same line, five times: `send('go')` followed by
`await new Promise(r => setTimeout(r, 20))` — a guess that a child's turn had started. That is the
exact bug youcoded#363 fixed once in this same file, and it left a helper behind
(`waitForTurnInFlight`, which matches on `data.agentId` because a child's events arrive re-stamped
under the parent's session id). **The helper was being used at one site out of six.** The sixth had
a comment reading "The ledger write is fire-and-forget — poll for it" directly above a
`setTimeout(r, 30)`; it now polls.

The rest were read and deliberately left. Most of the large ones (120/150/80/80/150 ms) are
**negative** assertions — "wait a bounded time and prove nothing happened" — which have no signal to
wait on by construction, and the `setTimeout(r, 10)` majority sit inside fake model streams where
they *are* the simulated work. Converting those would be churn at best and a weakened test at
worst.

---

## What is green now that was not

- `node scripts/workbench-boot-check.mjs <dead port>` → exit 2 with a real explanation, instead of
  exit 0 and "All 16 routes mount cleanly".
- `tsc -p desktop/tsconfig.tests.json` → 0 errors over 514 test files that nothing had ever
  checked; `npm run lint` covers all 571.
- 8 concurrent full suites → 8/8 green, where the same load was 1/8 before.
- `npx vitest related` in a symlinked-node_modules worktree → 84/84, where it was 24/84.
- `scripts/verify.sh` reports six checks instead of five, and states its own remaining blind spot
  (57 excluded files) in the pass line.

## What was left behind, and why

1. **201 type errors in 57 test files.** Filed as its own roadmap entry with the list living in
   `tsconfig.tests.json`. They are mostly fixtures built as partial objects; each needs a judgment
   call about what the fixture should assert, and making 201 of those unsupervised at 6 a.m. is how
   a test gets quietly weakened. Deleting a line from the exclude list and fixing that file is the
   intended way to pay it down.
2. **The three filed flaky suites stay open, re-scoped.** They did not fail locally in 27 runs. The
   next step is a CI-shaped runner (2 cores), not more local concurrency.
3. **`mcp-startup-wiring`'s in-body `await import()`** is untouched, per its investigation's own
   instruction — it never failed here.
4. **96 remaining fixed sleeps**, characterised above so the next session can pick without
   re-reading all of them.
5. **Type-aware ESLint rules on `tests/**`** — blocked on (1).
6. **`docs/roadmap/dev-workspace.md`'s macOS sync-spaces flake** was not touched; it needs the
   macOS CI leg, which this machine is not.


---

## Addendum — the one CI failure, and why it was not mine

youcoded#384's first run went green on Ubuntu, Windows and the Android leg, and **red on macOS**:

```
FAIL tests/native-session-host.test.ts > G-1 background Bash > a finished run is injected ONCE …
AssertionError: expected '[Background command sh-4c82 finished …' to match
  /^\[Background command sh-4c82 finished · exit 2 · \d+s\]\n\$ echo done; exit 2\ndone\nFull log: /
```

Three things established it was not this branch:

1. **The diff does not reach it.** That test is at line 4969; every hunk this branch touches in
   that file is between 2407 and 3631 (`git diff --stat` per hunk).
2. **The macOS leg is already flaky on master.** `master`'s own run 33615851775, five hours
   earlier and with no PR involved, failed macOS on `sync-spaces-engine` — a separate, already-filed
   entry. Ubuntu and Windows passed the same commit.
3. **A plain re-run of the identical commit passed**, no code change: macos-latest `success`.
   The suite took 317 s on that runner against 37 s locally, which is the load signature.

Filed as its own roadmap entry rather than fixed here, because the honest reading is not settled:
the notice arriving without the command's stdout may be a test race OR a real product race in the
finished-notice composer — in which case a user on a slow machine sees a background command report
finished with none of its output. Deciding that needs a reproduction on macOS, which this machine
is not, and guessing a fix would paper over the second possibility.
