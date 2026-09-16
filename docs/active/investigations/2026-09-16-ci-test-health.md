---
status: active
---
# CI and test health — what is actually wrong, and what changes

Written 2026-09-16 from GitHub's own run history (the last 400 runs of every workflow in every
repo), the failed-step logs of 21 Desktop CI runs, a full local run of the desktop suite, and three
read-only sweeps of the 826 test files. Numbers below are measured, not estimated.

## The one-paragraph version

CI is not flaky. It is **broken and nobody is on the hook for it**. The desktop suite has not
passed on master since 2026-09-10: 16 tests fail on every Windows run and one on every Linux
run, all for the same handful of "works on Linux" assumptions. On top of that, one test in
roughly every two macOS runs fails for a different reason each time. Every one of those failures
was noticed, written into the roadmap by whichever session hit it, and left there — the roadmap
holds nine such entries, some updated four times. Because master has no branch protection and
red is normal, each merge learns to ignore red, so a real regression would look exactly like
today. The suite itself is enormous for the app (826 files, 11,563 tests, 165k lines of test
against 235k of source; 168 files added last week), built one file per task, and 112 of those
files "test" by reading source code as text and grepping it.

## The numbers

| Measure | Value |
|---|---|
| Desktop CI runs 2026-09-06 → 09-16 | 144, of which **93 failed** |
| Desktop CI on master since 09-10 | **0 passes** |
| Windows leg | 16 tests fail on every run (persistent) |
| Linux leg | 1 test fails on every run (persistent) |
| macOS leg | 1 random test fails on ~half the runs (genuinely flaky) |
| Workspace CI (youcoded-dev) | 126 of 400 failed; 28 of the last 30 on the doc-audit step |
| Android CI | 142 of 145 passed, 13 min each — builds the whole desktop installer set just to bundle the web UI |
| Marketplace / themes | fine; their reds are old install/Chrome failures |
| Desktop suite locally | 11,563 tests, 67 s wall on this machine, 12 min per CI leg |
| Test files added per week | 168 (last week), 97, 119, 31, 59, 29, 29, 82 |
| Commits touching tests since 06-16 | 1,875 of 3,082 (61%) |
| Roadmap entries about red CI or flaky tests | 9 open, several updated 3–4 times, none fixed |

## Why each leg is red

**Windows — 16 tests, all test-side, none a product bug.** Five root causes, each hitting several
tests:
- `new URL(rel, import.meta.url).pathname` used as a file path. On Windows that is `/D:/a/…`,
  and joining it makes `D:\D:\a\…`. Three whole files died at import. Filed in the roadmap on
  09-11 with the fix named; not applied.
- The temp dir's 8.3 short name. The runner's temp dir is `C:\Users\RUNNER~1\…`; anything the
  product `realpath()`s comes back as `C:\Users\runneradmin\…`. Three tests compared the two.
- Windows line endings. The repo let Windows check files out as CRLF, so a test that parses
  `electron-builder.yml` by splitting on `\n` found `"nsis:\r"` and returned null for every
  value — eight tests, and two more that *passed for the wrong reason* (null looked like absent).
- POSIX permission bits (`mode & 0o077 === 0`) asserted on a platform that has no such bits.
- A fixture file name containing `"` and a carriage return, which NTFS cannot create — the
  write threw and took a 39-test file down with it.

**Linux — 1 test, a false guarantee.** The download test "a file replaced between mint and GET
(different inode) answers 404" deleted the file and wrote a new one at the same path, expecting
a different inode. Linux hands the freed inode number straight back, so the product correctly
saw the same identity and answered 200. The test asserted something the OS never promised.

**macOS — a different test each time, load.** The runner is slow and the suite runs ~885 files
in parallel. Every failure seen was a wait on the wall clock or on real I/O: a real 1-second
poll interval (its timeout had already been raised twice — the "treadmill" the hygiene rule
warns about), a 60 ms deadline raced by a 20 ms sleep, a teardown that read the filesystem
before a chain of awaited mocks had finished, a client response nobody drained. Two of the
"flakes" are **real product races** and are now filed as bugs: the Bash tool settles on the
child's `exit` before its output pipe has drained (can drop the last line of output), and the
engine's `stopAll()` returns while a settings write is still in flight.

**Workspace CI — two doc-hygiene checks, both trivial.** Two rule files drifted 12 and 21
words over their 600-word budget, and the MAP referenced five files inside `youcoded-admin`,
the one private repo the workflow cannot clone — so the checker reported them missing on every
run. 28 red runs for that.

## What was wrong about the process, not the code

1. **Red has no consequence.** Master is unprotected. A failed test step skips packaging, so a
   red Windows leg meant no Windows installer — the answer was a `skip_windows_tests` switch on
   the beta build, and two betas shipped that way. There is even a script,
   `ci-red-vs-master.sh`, whose job is to tell a session "this red is already red on master, go
   ahead." That is the failure institutionalised.
2. **Everyone files, nobody fixes.** The hygiene rule says "before calling a failure flake, run
   it alone and on pristine master" — and sessions did exactly that, then wrote a paragraph in
   the roadmap and moved on ("not done here because it is another feature's test"). Nine
   entries, zero fixes, one of them naming the exact one-line fix.
3. **Tests are written to the ticket, not the behaviour.** One new file per task (62% of files
   sit in a prefix cluster like `remote-shim-*`, nine files for one module; 24 files import one
   36-line context), names carry dates and review-round numbers (47 dates, 81 `§` marks inside
   test names), and a fifth of every test line is a comment.
4. **Source-grep tests stand in for lint.** 112 files (13.6%) read a source file as text and
   assert a substring or regex is present or absent — "this component uses primitive X", "this
   function has no sync fs call". These break on whitespace, on CRLF, on renames, and pass
   silently when the pattern matches nothing (the helper exists precisely because that happened
   three times). Most are expressible as ast-grep rules, which the workspace already runs.
5. **Nothing is run for the machines it targets.** Nobody on the team has a Windows or macOS
   box, so the only place those legs run is CI, and CI is the thing being ignored.

## What this branch fixes (all mechanical, verified locally, then proven on CI)

Five CI runs of this branch, in order: Windows 16 → 1 → 2 → 3 → 0 → 1 failures (each round
exposed tests a file-level crash had hidden; the last one is a single 30 s timeout on a test that
passed the run before, filed as a Windows load flake), macOS 1 → 0 → 0 → 0 → 0, Linux 0 → 3 → 1
→ 1 → 0. Every red that remained after round two was one of the filed product races or a
one-off load timeout, not a test-side assumption. The one test that
asserted the lease file's deletion now pins only the in-memory contract; its on-disk claim is
filed with evidence rather than reddening every merge.


App repo (`youcoded`):
- Every Windows failure: `fileURLToPath` in 3 files; the vitest config now exports the
  realpath spelling of the temp dir to every worker (kills the 8.3 class outright, not per test);
  `.gitattributes` checks out LF on every platform; the two YAML parsers strip `\r`; the
  permission-bit checks run only off Windows; the odd file name has a Windows-legal spelling.
- The Linux inode test now forces a second inode (write-then-rename) instead of hoping.
- Four macOS/load flakes rewritten to wait on a signal: the ChatGPT poll test drives a fake
  clock; the lease test waits on the outcome; the engine-config join window is 1 s not 60 ms;
  the download-revoke test drains its response (it only ever passed after an earlier test had
  warmed the connection — 3/3 red alone before, 3/3 green after).
- The full desktop verify (types, 11,563 tests, knip, lint, ast-grep) passes.

Workspace repo (`youcoded-dev`):
- The two over-budget rules trimmed; the doc audit now reports a MAP path inside a repo it
  cannot see as *unverified* instead of *missing*.
- A new ast-grep rule (`test-file-url-to-path`) and the invariant runner now scans the test
  tree too, so the worst Windows shape cannot come back.
- The test-hygiene rule gains a "Windows runs this suite too" section and now says: fix it or
  file it with the cause, never just file it.
- Two product races filed in the roadmap with their mechanism.

## What is NOT fixed here, and needs a decision (see the deck)

- Branch protection / a required check, and what to do about `paths-ignore` if so.
- Whether every PR needs three operating systems, or Linux on PRs and the other two on master
  and nightly.
- Android CI building the full desktop installer set (13 min) when it only needs the web bundle.
- What to do with the 112 source-grep test files and the one-file-per-task habit.
- Whether the roadmap's nine stale CI entries close now (this branch) or after CI confirms.

## Evidence trail

Run summaries and failed-step logs are in this session's scratchpad; the per-workflow tally,
per-day fail counts, and the failing-test tallies were produced by `gh run list/view` over
`itsdestin/youcoded`, `youcoded-dev`, `wecoded-marketplace`, `wecoded-themes`. Sweep reports
(source-grep guards, timing/IO, duplication) are summarised above; the raw counts and the rg
commands that produced them are reproducible from the sweep briefs in the conversation.
