---
status: shipped
---
# Nonblocking comparisons and search indexing

App source merged in [youcoded#665](https://github.com/itsdestin/youcoded/pull/665) as `254ff9983aa3657a937dfd65011beb3c6e6508c9`, including reviewed candidate `c020d4f49248434ecccfa1ccaaae7e73a574e499`. This records source integration, not a release or installation. It does not resolve the original JPEG freeze; that investigation remains [archived with card #93](2026-10-18-file-viewer-freezes.md).

## Completed scope

- Exact large fallback comparisons run in a bounded browser worker instead of blocking the renderer. The synchronous fast path is limited to 32,768 combined UTF-16 code units and 200 combined lines. Structured patches bypass computation. One active worker per window, cancellation, hidden-chat handling, stale-result rejection, retry and failure states preserve exact output; worker failure never falls back to blocking renderer computation.
- The complete search refresh runs in a Node worker, including record/tag loading, transcript resolution, parsing, indexing and metadata writes. Main sends roots/configuration, not transcript contents or full record collections. Existing lanes, path gates, cross-process build lock, atomic writes, debounce, single-flight scheduling and pending reruns are retained. Stop settles callers without starting a replacement before the old worker exits. There is no blocking main-thread fallback.
- The same app change includes viewer first-frame, draft, rename and stale-read repairs, including the final review corrections summarized in the active investigation.

## Historical isolated measurements

These measurements came from the original October 18 implementation probes, **not a new benchmark of the final merged binary**:

- Electron comparison of 10,000 unrelated lines: legacy typing round trip 11,693 ms; worker typing round trip 47 ms while computation remained pending. All 20,000 result rows were retained. Maximum frame gap fell from 11,682.2 ms to 22.2 ms. The long-task observer missed even the baseline block; its negative was not used as evidence.
- Fresh-ASAR search probe: legacy maximum heartbeat gap 435.1 ms; worker 29.8 ms, with output parity. System Node measurements likewise showed 426.0 ms versus 5.4 ms gaps. Fixtures used private state, not user indexes.
- Original production browser-worker asset executed over HTTP and a file URL inside fresh-ASAR sandboxed Electron, with exact rows verified. The indexing worker also passed its fresh-ASAR probe.

These scoped synthetic results establish responsiveness for measured blocking classes, not causation of the JPEG incident or performance on other operating systems/devices.

## Final verification

The final candidate's required local desktop verifier passed all nine gates: source types, test types, related tests, knip, lint, design lint, ast-grep, screen openings and journeys. Related tests: **5,546 passed, 36 skipped**, with 253 test files passed and 1 skipped. A separate final focused run passed **136 tests across six files**. These are related/focused runs, not a claim that the complete repository suite ran locally.

Local evidence in the candidate workspace: `scratch/verify-20261021-085510-2003527/`; summaries `/tmp/93-review-verify.log` and `/tmp/93-review-target-final.log`.

Local Android backend compilation succeeded, but the full local payload path stopped at `buildRuntimeDebug`'s redistribution gate because `apk version -t` tooling was unavailable. A separate JVM-only run with payload/build tasks excluded passed 36 tests in each of debug, releaseTest and release: **108 variant executions of the same 36 tests**, no failures/errors/skips. Evidence: `/tmp/93-android.log`, `/tmp/93-android-jvm.log` and candidate app `app/build/test-results/test*UnitTest/` XML suites.

Subsequently, [remote CI for PR #665](https://github.com/itsdestin/youcoded/actions/runs/39631598352) passed all four Linux test shards; Linux AppImage, deb, rpm and pacman packaging; Android JVM tests; and both debug and releaseTest APK jobs. The build, evidence and Android completion gates also passed. Browser-diagnostic and Android source-preflight jobs were skipped, not claimed as exercised. This closes the local payload-verification gap through CI build evidence, **not phone/device runtime verification**.

## Remaining boundaries

Card #110's specific large-comparison freeze is completed by this merge. Card #93 remains open for broader blocking/memory issues and the unresolved original JPEG incident. Card #96's measurement coverage/evaluation work remains open. Synchronous hardware subprocess probes and large inline-path-list overlap scans were audit leads, not fixes included here.

The original workspace and app worktrees at `worktrees/sessions/93-file-viewer-freezes` retain separate uncommitted evaluation work and their original source-plan copies. This closeout adds app-only records without modifying or removing those copies. Their historical “local and uncommitted” statements describe the earlier state, not the now-merged app source; reconciliation of those copies is separate from this record.
