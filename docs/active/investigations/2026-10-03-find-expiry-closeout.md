---
title: Find expiry race — closeout repair and runtime acceptance
status: active
date: 2026-10-03
---

# Bounded navigation repair

The final September package selected `Turn 3250:` with a correct `1/1` count but left its Range around y=909 underneath bottom controls. The failed originals (`closeout-find-final.json`, `closeout-find-final-repeat.json`) remain unchanged. Their approximately 1 Hz animation callbacks suggested a correction-lifetime problem, but they did not record ResizeObserver delivery.

## Evidence and limits

An isolated controlled-delay diagnostic on the unchanged `7855bc6ce` package recorded a resize delivery before expiry, a queued animation frame, then cancellation at the 800 ms expiry without a correction. That original diagnostic wrapped every newly constructed ResizeObserver, not uniquely Find. Its screenshot confirmed the covered result; its original receipt does not establish observer ownership by itself. Three instrumented runs without delay succeeded. These are diagnostics, not speed comparisons.

The repaired package adds one final synchronous settle **only when an already-delivered resize has a pending correction frame at expiry**. It cancels that frame, settles once, then stops. User intent and effect cleanup still cancel rather than flush; the existing four-correction cap remains. It neither lengthens the observation window nor claims to handle a resize first delivered after expiry or a position-only change with no resize notification.

## Regression and review

- Parent restored the original expiry temporarily and ran only the new regression: it failed because the expected third centering call never happened (`expected 3, got 2`). The repair was restored immediately.
- The focused `content-find-bar-rewalk.test.tsx` suite passed **12/12**, including wheel-intent cancellation.
- Independent review found no blocker in the pending-frame repair; its clearance explicitly excludes layout first reported after expiry.
- Diagnostic disposal now cancels pending synthetic timers/native frames and is idempotent. A regression failed with one outstanding callback before the fix and passed afterward. Failure collection gives the owned renderer a separate bounded two-second attempt to retain partial evidence; an unresponsive target is recorded as unavailable, not empty success.

## Integrated packaged acceptance

App source includes the fetched newer master plus the local repair, before its integration commit. Exact package:

- Local directory: `scratch/perf-lab/find-expiry-integrated-app/`
- Stamp: HEAD `7855bc6ce0be4523a4a6d16be174bd0bb67420c4`, dirty fingerprint `d1e042640a6c`, built `2026-10-04T06:42:33.471Z` (UTC)
- `resources/app.asar` SHA-256: `f7b022609e1e96af942174e60392fd99dfc091be07daa45f03cc17c786f57046`

Both checks used a private fixture HOME/runtime, disconnected D-Bus and an owned packaged process on explicit display `:0`, never the installed app. Fixtures are unique per run and launch refuses an existing package family.

1. **Controlled delayed correction:** `find-expiry-integrated-delayed.json`/`.png`. A 1,000 ms delay was imposed on frames synchronously requested by newly wrapped ROs. The sole observed RO was id 1, observing the chat content root. Its constructor/observe stack resolves to `dist/renderer/assets/index-qivtxNc6.js:449:9046` / `:449:9117` in the exact asar above. The extracted callsite is Find's observer, adjacent to its chrome geometry, four-correction cap and expiry-flush code (`scratch/perf-find-observer-callsite-oct03.txt`). The match was covered at y=908.7 when the pending frame was cancelled at 8852.1 ms, then recentered to y=531.375 at 8853.9 ms before disconnect. Final verification: `visibleStable:true`, `uncovered:true`, hit `SPAN`, correct `Turn 3250:`. The screenshot was inspected.
2. **Ordinary uninstrumented navigation:** `find-expiry-integrated-natural.json`/`.png`. 1,020 loaded entries, 1,015 folded before Find; correct result remained uncovered at y=531.708 with hit `SPAN`. The screenshot was inspected. No lifecycle wrappers or artificial delay were enabled.

The wrapper remains a broad newly-created-RO diagnostic; package-callsite evidence attributes **this capture's** observer to Find. Geometry reads perturb timing. Neither result certifies physical presentation, arbitrary delayed-layout behavior, or all Find workloads.

## Merge gate

These runtime checks clear the reproduced pending-correction navigation gate for this package. The app integration and repair are committed and pushed as `6e355a828` on PR `youcoded#591`; CI and the actual merge reference remain pending. The final `VITEST_MAX_WORKERS=8 bash scripts/verify.sh <app-worktree> --full` passed types, tests, knip, lint/design lint, invariants, **screen-open checks**, and journeys (`scratch/perf-integrated-full-verify-oct03-3.log`). Android's three app unit-test tasks executed successfully, with XML totals of 594 tests each and zero failures/errors/skips; `bundleWebUi` was excluded.

The first integrated verify exposed old-workspace rule/screenshot mismatch and full-suite timeout failures; those originals remain recorded. The first green rerun was not sufficient: its missing screen gate led to a separately reproduced pipefail defect in `verify.sh`, fixed with a 4,096-file actual-planner regression and CI coverage. An initially occupied Office editor port was left untouched; the subsequent check safely started its own editor after the port became free. No desktop/Android motion parity or other unmeasured performance lane is implied.
