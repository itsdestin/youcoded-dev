---
status: shipped
---

# Journey driver: verified stale-click coordinate repair

Scope: workspace shoot/explore runner only in `/home/destin/youcoded-dev/worktrees/sessions/native-harness-audit-20260926`. No merge/cherry-pick of the upstream 46 commits, product navigation edit, timeout/sleep increase, live app, paid call, commit or push. All pre-existing A/B/C1 work and blocked C2 report remain in place.

## Root cause proven, and limit

`scripts/shoot/driver.mjs` previously resolved the button and checked its hit point **before moving the pointer**, then `press()` called `moveTo` and pressed the old coordinates. A pointer arrival can reposition the control, leaving the old position occupied by another button. The first deterministic isolated-browser fixture in `scripts/shoot/tests/explore.test.mjs` relocates the target exactly once on `pointerenter` and reveals an old-position decoy. The old driver clicked the **decoy**; the corrected driver clicks only the moved **target**. This demonstrates the specific driver stale-coordinate defect without a hover timer, fixed delay or probabilistic load.

Applied the narrow `d0cd18b9` reviewed hunk via Edit: move first, then re-run `where(step.target, n)` before `press()` for click/double-click/right-click. `press()`'s second move is to the now-verified location; the fixture relocates once. Hover still only moves. The original `resume-conversation` failure has no press/release event trace; its missing Resume Browser is consistent with this hazard, **not proved to have been caused by it**. The earlier `docs/archive/reviews/2026-09-27-native-harness-journey-diagnosis.md` was updated to make that distinction, not to retroactively assert certainty.

## Actual red/green evidence

- **RED on preserved old driver:** `cd /home/destin/youcoded-dev/worktrees/sessions/native-harness-audit-20260926 && node --test --test-name-pattern='a click re-aims after pointer arrival' scripts/shoot/tests/explore.test.mjs > /tmp/journey-driver-red.log 2>&1` exited **1**: `tests 1; pass 0; fail 1`; `actual: [ 'decoy' ], expected: [ 'target' ]`. This is the real fixture and real driver in a private browser tab (`data:` page), no production app attach.
- **GREEN after hunk:** same focused command redirected to `/tmp/journey-driver-green-focused.log` exited **0**: `tests 1; pass 1; fail 0`.
- `node --test scripts/shoot/tests/*.test.mjs > /tmp/journey-driver-suite.log 2>&1` exited **0**: `tests 12; pass 12; fail 0`.
- `node scripts/shoot/journeys.mjs --worktree /home/destin/youcoded-dev/worktrees/sessions/native-harness-audit-20260926/youcoded resume-conversation > /tmp/journey-driver-resume.log 2>&1` exited **0**: `journeys: 1/1 passed in 13.5s`.
- Same `journeys.mjs --worktree …` with no journey filter redirected to `/tmp/journey-driver-seven.log` exited **0**: seven named journeys, `journeys: 7/7 passed in 14.8s`.
- `git diff --check` exited **0**. Inspected focused source/test diff in `/tmp/journey-driver-final-diff.txt`; driver hunk is byte-for-byte the reviewed upstream change. No full-suite load loop was run.

Changed paths: `scripts/shoot/driver.mjs`, `scripts/shoot/tests/explore.test.mjs`, `docs/archive/reviews/2026-09-27-native-harness-journey-diagnosis.md`, and this report. The user-facing app is unchanged. The original intermittent incident's other possible causes remain unresolved absent its event trace.

## Fixture readiness correction (2026-09-28, after C3 owning checks)

Fresh review found that the fixture's immediate `assert.equal(await tab.evaluate(...), true)` following `Page.navigate` did **not** wait for readiness, contrary to the comment: navigation can acknowledge before the inline script sets `window.clicked`. Replaced it with a bounded poll of `document.readyState === 'complete' && !!window.clicked`, failing with `click fixture did not load within 5 s` if no signal arrives. The 25 ms interval only checks a concrete condition; it is not a fixed delay before interaction or an inflated journey timeout. `cd /home/destin/youcoded-dev/worktrees/sessions/native-harness-audit-20260926 && node --test --test-name-pattern='a click re-aims after pointer arrival' scripts/shoot/tests/explore.test.mjs > /tmp/c3-journey-ready-focused.log 2>&1` exited **0**, `tests 1; pass 1; fail 0`. `node --test scripts/shoot/tests/*.test.mjs > /tmp/c3-journey-ready-suite.log 2>&1` exited **0**, `tests 12; pass 12; fail 0`. The earlier RED observation still demonstrates stale-coordinate behavior, but did not itself guard against early navigation acknowledgement. The original intermittent incident remains causally unproven.
