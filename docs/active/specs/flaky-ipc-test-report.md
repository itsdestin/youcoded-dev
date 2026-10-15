# Flaky test: ipc-handlers "sends a changed payload once and does not repeat an identical one"

**Root cause (reproduced, not a guess).** The update checker (`desktop/src/main/update-service.ts`) is one shared object per test file. Earlier describes in `ipc-handlers.test.ts` call `registerIpcHandlers`, which starts a REAL GitHub request. When the reply lands, `parseReleaseResponse` swaps the cached update status from the 4-key fallback (`current, latest, update_available, download_url`) to a 7-key object (adds `manifest_url, signature_url, tag`). That status is part of the status payload, so if the swap happens between two ticks of the test, the payload really changed and the dedupe correctly sends twice ("expected 2 to be 1"). A slow reply (loaded full verify run) lands inside the test; normal runs get it long before.

**Not specific to the page feature.** Same code on origin/master (eac33bb80); page-start-session adds nothing here.

**Evidence.** 30 filtered runs, 15 runs under 8-core CPU load, 3 plain runs: all passed (natural flake is rare). Delaying the GitHub reply by 115, 130 and 160 ms (temporary probe in update-service.ts, reverted) failed the test with the exact message; with the fix the same delays pass.

**Fix.** Branch `session/flaky-ipc-test` (youcoded repo): the status-push describe's `beforeEach` pins `getUpdateService().getUpdateStatus` to a fixed value (WHY comment in place). Test-only change; verify.sh all green.
