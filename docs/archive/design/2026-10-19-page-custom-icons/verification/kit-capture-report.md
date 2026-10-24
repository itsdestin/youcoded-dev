# Page kit capture race

## Finding and minimal fix

A real, pre-existing workbench-fixture race is established. `kit-pieces-page.ts` opened its requested demo dropdown with a **300 ms timer**, although the hosted document installs the kit's mousedown listener before the author's script and the select already exists at that script. The host's screen mark only requires `load.state === 'ready'` (the prepared document), and shoot's stillness check does not treat a pending author timer as work. Thus `#menu-open` can be photographed with `aria-expanded` absent and no listbox. No custom-icon code is involved.

Changed only:
- `youcoded/desktop/src/renderer/dev/workbench/fixtures/kit-pieces-page.ts`: dispatch the existing mousedown on the frame's **window load event**, after opening the controls section; explanatory WHY comment. No sleeps, new timeouts, shoot verdict changes, or `sameAs`. Opening during parsing was tested first but exposed a concrete Escape/focus failure in full verification; the final patch uses the actual frame-load signal instead (details below).
- `youcoded/desktop/tests/page-kit.test.ts`: run the real showcase through `prepareHostedDocument`; at the window load event require the real select to be expanded, a kit listbox to exist, and focus to be on the select; close the jsdom window in `finally`.

## Reproduction and TDD

Original shipping evidence: `scratch/verify-20261018-212759-774740/screens.log:409-410` reports `403/403 pictures` followed by `LOOK-ALIKE pages/page/page-kit-pieces = pages/page/page-kit-pieces#menu-open (light)`.

Pair command (from workspace root):
```
SHOOT_SCALE=1 node scripts/shoot/shoot.mjs 'pages/page/page-kit-pieces' 'pages/page/page-kit-pieces#menu-open' --themes light --out scratch/kit-pair-only
```
Actual output: `2/2 pictures · median 1.5s each`; exit 0. **This run did not reproduce the LOOK-ALIKE verdict**, but opening its full-size `#menu-open/light.png` visibly confirmed the requested dropdown was still closed. A green screenshot registration is not proof of this substate.

Pristine baseline: detached `origin/master` at `bf695cfbdd72f1db44b5742b5d4d4f13b541bf95`, `scratch/kit-master`, separate `cp -al` node_modules directory. Source status clean. Same pair command with `--worktree scratch/kit-master --out scratch/kit-master-only`: `2/2 pictures · median 1.5s each`, exit 0. Read its full-size open-state PNG: dropdown again closed. `git diff origin/master -- <fixture>` confirms the fixture differs only by this fix, not by custom-icon work.

TDD command (from `youcoded/desktop`):
```
npx vitest run tests/page-kit.test.ts -t 'opens the showcase menu'
```
Before implementation, actual output:
```
FAIL |unit| tests/page-kit.test.ts > the page kit dropdown > opens the showcase menu before the hosted document finishes loading
AssertionError: expected null to be 'true'
Test Files 1 failed (1)
Tests 1 failed | 14 skipped (15)
```
Exit 1. This deterministically breaks the real fixture's readiness contract, not a source-text surrogate.

After the synchronous dispatch:
```
npx vitest run tests/page-kit.test.ts
```
Actual output:
```
✓ |unit| tests/page-kit.test.ts (15 tests) 1147ms
Test Files 1 passed (1)
Tests 15 passed (15)
```
Exit 0.

Corrected capture command: same pair, `--out scratch/kit-fixed-pair`. Actual output `2/2 pictures · median 1.2s each`, exit 0. Read the full-size open-state PNG: **Breakfast / Lunch / Dinner / Snacks and Add another meal… are visibly open**, with Dinner selected. The corrected screenshot is visibly distinct from the plain state.

## Verification status

Five additional pair-only baseline runs (`scratch/kit-baseline-repeat-1` through `-5`) and five corrected runs (`scratch/kit-fixed-repeat-1` through `-5`) each report `2/2 pictures`, with no LOOK-ALIKE or FAIL line. These ran concurrently with desktop verification. **The sporadic LOOK-ALIKE verdict itself did not reproduce in these isolated runs; the deterministic failing readiness test and the visibly wrong original/baseline pictures establish the underlying defect.** Also read corrected repeat 5's full-size open-state PNG: menu remains visibly open.

Command used for each series:
```
for n in 1 2 3 4 5; do
  SHOOT_SCALE=1 node scripts/shoot/shoot.mjs 'pages/page/page-kit-pieces' 'pages/page/page-kit-pieces#menu-open' --themes light [--worktree scratch/kit-master] --out scratch/kit-{baseline|fixed}-repeat-$n
 done
```
The bracketed worktree option applies only to baseline; output folders are the corresponding series. Actual summaries from `rg -n 'LOOK-ALIKE|2/2 pictures|FAIL' /tmp/kit-baseline-repeat-{1,2,3,4,5}.log /tmp/kit-fixed-repeat-{1,2,3,4,5}.log`: all ten report `2/2 pictures`; medians baseline 3.1/2.7/3.5/2.2/1.4 seconds and fixed 2.9/2.1/4.1/2.0/1.3 seconds. No timing claim is used as a test assertion.

`git -C youcoded diff --check`: exit 0, no output. Own diff read back.

### Concrete integration failure and final adjustment

The first implementation opened synchronously during parsing. Although the real menu was visible in the corrected captures above, required full verification exposed a concrete keyboard/focus failure:
```
bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/page-custom-icons/youcoded
```
Actual output in `/tmp/kit-fixed-verify.log`:
```
PASS types
PASS types in tests/
PASS tests (related)
PASS dead code (knip)
PASS lint (oxlint)
PASS design lint
PASS invariants (ast-grep)
FAIL screens open (shoot --check)
402/403 pictures
NOT TAKEN pages/page/page-kit-pieces#menu-open · light — Escape should step back inside panel "Built in" and leave every layer open ... open before: panel "Built in" — after: nothing
PASS journeys (click paths)
1 check(s) failed.
```
Full log: `scratch/verify-20261018-213358-823689/screens.log`. This is **not** a waived failure. It required the narrowly scoped final adjustment: open on the frame's `load` event, when it can take keyboard focus, instead of opening during document parsing. The existing regression checks the same by-load readiness contract; no test was weakened. The five corrected repetitions above describe the intermediate synchronous version, not the final load-event patch.

Final focused command: `npx vitest run tests/page-kit.test.ts`, exit 0 (`/tmp/kit-load-green.log`):
```
✓ |unit| tests/page-kit.test.ts (15 tests) 1522ms
Test Files 1 passed (1)
Tests 15 passed (15)
```
The parent committed the final load-event patch as `128d2341c83e53f01469ef87c370baa10c04dff3` while verification ran. Read its actual committed diff: it contains the load listener shown above, not the intermediate parsing-time implementation. I made no commit or publication myself. The parent's generated-site rebuild is independent and was not touched by this investigation.

**Final combined desktop verification PASSED** against the unchanged load-event patch:
```
bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/page-custom-icons/youcoded
```
Actual output (`/tmp/kit-load-verify.log`):
```
PASS types (tsgo --noEmit)
PASS types in tests/ (tsgo --noEmit, 0 file(s) still excluded)
PASS tests (related)
PASS dead code (knip)
PASS lint (oxlint)
PASS design lint (oxlint --max-warnings ratchet)
PASS invariants (ast-grep)
PASS screens open (shoot --check)
PASS journeys (click paths)
OK — all checks passed.
Not covered: Android (./gradlew test), marketplace worker.
```
Durable logs: `scratch/verify-20261018-213702-862551/`. `tests.log`: **226 files passed; 4,462 tests passed, 1 skipped**. `screens.log`: **403/403 pictures, median 1.3s; pictures taken in 90.2s; done in 104.3s**, with no LOOK-ALIKE or Escape failure. This is the standard combined verifier's related-tests route (16 changed files + 81 source-scanning guards), not a claim of `--full` unit-suite coverage. Final `git diff HEAD --` on the two source/test files and scoped `git diff --check` both returned no output, exit 0: the verified sources match the parent's commit.

No additional capture repetitions or source edits followed the parent's steer. The scratch baseline and reproduction pictures remain available for the parent; no running verification process remains from this investigation.

Additional tooling verification:
```
node --test scripts/shoot/tests/*.test.mjs
```
Actual output: `tests 53`, `pass 53`, `fail 0`, `duration_ms 16716.344089`; exit 0. No shoot tooling was changed.

## Operational notes

No commits, pushes, paid evaluations, live-state changes, plugin changes, generated website edits or shared-checkout edits made. The first attempted pair commands included `--check`; inspection established this flag selects all 403 screens regardless of names. The app run completed cleanly; the baseline all-screen attempt was stopped when it began preparing its own Office add-on, then rerun correctly as pair-only. Two verify launch attempts used a wrong target/root and failed before tests; the actual verification uses the app checkout path from the workspace root. These invocation errors are not test failures. Logs are in `/tmp/kit-*.log`; captured images are under this session's `scratch/kit-*`.
