---
status: shipped
dashboard_commit: e4e9ed2
plasma_commit: 12a1836
---

# Battery Flow Repair Implementation Plan

> **For agentic workers:** Use executing-plans for the scoped steps below. User approved implementation after unintended-consequence review; no commits, installation, shutdown or system configuration changes are authorized.

**Goal:** Preserve useful adapter estimates and the existing dashboard design while correcting battery direction, mixed-source arithmetic and baseline learning.

**Architecture:** A standard-library Python measurement module in system-dashboard owns battery sampling and direction validation. Dashboard and Plasma's existing stats command consume it; a small locked runtime cache shares recent samples without a daemon. Browser rendering uses explicit signed flow, confidence and AC presence rather than treating the firmware status as truth.

**Tech Stack:** Python standard library/unittest, browser JavaScript/Node tests, existing QML/shell helper.

## Global Constraints

- Work only in isolated system-dashboard and plasma worktrees beneath this session. Preserve the dashboard's existing uncommitted HTML design snapshot; do not install or alter live files.
- Scope excludes shutdown/logout, power-management actions, battery calibration and firmware updates.
- Keep estimated wattage visible on incomplete data, marked with ~; do not invent voltage or amps. Net battery power and adapter output are distinct.
- Energy history can validate direction, not independently calibrate hardware sensors. No claim of externally verified adapter accuracy.
- Reset direction history on source changes, resume/long sampling gaps, invalid readings and implausible energy jumps. Flat energy alone never proves zero flow, especially near 1%.
- Only explicitly offline AC/USB sources permit overhead learning. Unknown connection state is not unplugged.
- Old unversioned overhead estimates are ignored, not deleted. Tests and preview use isolated runtime/state paths.

## Steps

### 1. Measurement and unintended consequences
- [x] Obtain independent read-only review of existing algorithms and proposed boundaries.
- [x] Add deterministic unittest cases for false charging, genuine charging, quantized energy, source transitions, stale data, 1% plateau, missing sensors, invalid jumps, and multiple consumers.
- [x] Run tests before implementation and observe missing-module failure.
- [x] Implement power_measurement.py: raw battery read, pure direction resolver, shared locked sample cache, confidence metadata and provisional signed estimates.
- [x] Run deterministic tests and verify real-hardware sampling with an isolated cache.

### 2. Dashboard integration
- [x] Test overhead learning refuses plugged-in/unknown/uncertain data and old state versions.
- [x] Integrate the shared sample into Sensors._battery; retain firmware status as reported_status, expose corrected status, signed_power_w, flow_verified, flow_source and source_key.
- [x] Version overhead learning and permit it only on verified unplugged samples; avoid learning during quantized/discontinuous transitions.
- [x] Extract small power formatting/arithmetic functions into static/power.js for executable Node tests and load it through the existing HTTP server's explicit route.
- [x] Test signed subtraction, missing package power, provisional estimates, full/idle batteries, cold browser history and source changes.
- [x] Preserve power-tree layout but mark CPU/GPU allocation estimates, remove invented voltage/current, and depict connected-but-draining without showing the battery as a charging sink.
- [x] Update browser history and time calculations to avoid smoothing across direction/source changes; suppress verified countdowns from unverified direction.

### 3. Quick settings and verification
- [x] Replace only battery watts calculation in cc-helper stats with the shared module; retain the five-field protocol and unrelated CPU/GPU/memory behavior.
- [x] Provisional watts carry ~, verified signed watts retain +/-; missing measurement does not assert charging.
- [x] Add an import-path override for isolated testing and document the shared-module dependency.
- [x] Run Python unit tests, hardware smoke with isolated state/cache, Node behavior tests, shell syntax and helper integration.
- [x] Review static screenshots in an isolated browser preview with charging, unplugged, mixed-source and uncertain fixtures; fix observed issues.
- [x] Obtain fresh code review, address findings and rerun relevant checks.
- [x] Report exact tests, preserved source files, and the installation boundary. Do not install, commit or push without the user's instruction.

## Verification evidence

- Final deterministic checks: 27 dashboard Python tests, 5 shell-helper integration tests and 22 JavaScript/binding tests passed. Python compilation, shell syntax and both repository diff checks passed.
- Original `system-dashboard` still has its pre-existing `.state.json`, HTML and design-directory changes; original Plasma checkout remains clean. No source installation, commits or pushes.
- Real-hardware smoke passed using temporary cache/state. During a separate 30-second shared-reader check on mains, the quick-settings output moved from provisional `~+4.8` to validated `+4.2` after the energy window; measured net energy increased at 3.76 W and the final battery sensor read +4.036 W. This validates integration/direction, not external adapter accuracy.
- Actual dashboard browser assertions passed for charging, plugged-in draining, unplugged, provisional, missing-data and idle fixtures. Screenshots reviewed in light/dark themes and at desktop/tablet sizes. No browser console errors in these checks. The low-contrast light-theme battery-casing time was corrected and rechecked.
- Qt 6 QML parsing completed with pre-existing import/context warnings plus ordinary unqualified-scope warnings; this is not a warning-free lint or an installed-widget runtime check. Qt 5's default qmllint was incompatible; the matching Qt 6 binary was used.
- Fresh backend and presentation reviewers reported no remaining blockers after fixes. No physical USB-adapter comparison or external wattmeter validation was performed during implementation.
- Shared-reader history is locked/atomic; learned overhead is atomic last-valid-writer-wins. New overhead learning waits for an energy-confirmed unplugged window and is cadence-limited.
- Installation, runtime widget reload and replacement of live dashboard source remain separate approval steps. Shutdown/logout work was not changed.

## Approved-design finalization

- C-3 and C-4 approved in `power-restyle.review-3.answers.json`: light card style, Power draw label, battery switches between supplying and receiving rows, independent smooth adapter/battery paths join when both supply power.
- Approved cards are now the default renderer on Overview and Power, without a preview layout parameter. Removed rejected lines/balance prototypes and legacy rainbow CSS/SVG geometry. Historical screenshots and decision records remain intact.
- Final default charging and draining cards matched their approved screenshots with **0 differing pixels** in the 1440×700 power-flow region. Browser assertions also checked unplugged, idle, estimated, unavailable and unknown-adapter states at tablet width without horizontal overflow.
- Fresh source-role review found one failure case: known battery discharge with unreadable AC status was placed below. Corrected it to remain a source; the unverified adapter is labeled unknown and gets a dashed connection. A failing-then-passing test and browser check pin this. Reviewer's final verdict: no remaining blockers.
- The quick-settings charging fill now follows positive shared watts, not cable presence; its regression test failed before the correction and passed afterward. A fresh reviewer found no blockers in the icon/label/freshness integration. Existing pill layout/colors are retained.
- Final deterministic checks: **32 JavaScript/binding + 27 dashboard Python + 5 helper integration tests = 64 passing tests**. Final real-hardware smoke passed with temporary state/cache; the helper returned idle watts (`0`) without stderr. Syntax/diff checks passed; QML still has existing context/import warnings and is not claimed warning-free.
- At pre-install verification, the original dashboard checkout retained its pre-existing state/HTML/design changes and the original Plasma checkout was clean. Physical USB-adapter comparison and external wattmeter validation were not claimed complete.

## Authorized landing and installation

- After the user explicitly requested merge/close/install, fixed phone-width connections using measured card positions and a center-gutter spine; navigation now wraps instead of overflowing. Browser assertions verified all four wrapped connection endpoints and no horizontal page overflow at 390 px. Desktop/tablet design is unchanged.
- Both component main branches fast-forwarded to the tested commits above. Plasma main was pushed to its existing remote. The dashboard has no remote; no new repository or publication destination was created without approval.
- All **65** deterministic checks passed on the merged checkouts (33 JavaScript/binding, 27 dashboard Python, 5 helper Python), with syntax/diff checks and redacted Gitleaks scans of staged and committed changes.
- Backups: `/home/destin/kde-theme-backups/power-flow-20261020-194454/` contains originals for all 18 installation targets, the previous design patch, battery-state snapshot, Git bundles and a guarded `RESTORE.sh`. The superseded pre-existing dashboard HTML is also preserved in a named Git stash; runtime state and the user's untracked design folder were not reset.
- Dashboard source is installed in its original checkout. Only the two changed Control Center QML files were atomically copied into the installed widget; all 18 target hashes matched the tested build. No wholesale widget/theme install, desktop restart or YouCoded process/settings change.
- The installed dashboard served its new routes and rendered approved cards from real hardware: 100% battery, verified idle 0 W, estimated power draw around 43 W during the check, no legacy gradient diagram or browser console error. The installed helper returned idle 0 W. The temporary installed-dashboard check server exited on its own.
- Widget source is installed, but the existing desktop's QML cache is not forcibly reloaded: UI changes take effect on a normal widget reload or next sign-in. Shutdown/logout remains out of scope. Physical USB comparison, external-meter accuracy and firmware gauge calibration remain unverified, not hidden as completed work.
