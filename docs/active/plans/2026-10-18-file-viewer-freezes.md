---
status: active
---
# File viewer freezes — unresolved incident and merged repairs

## Current boundary

The viewer lifecycle, comparison and indexing repairs merged in [youcoded#665](https://github.com/itsdestin/youcoded/pull/665) as `254ff9983aa3657a937dfd65011beb3c6e6508c9`, including final reviewed candidate `c020d4f49248434ecccfa1ccaaae7e73a574e499`. Source integration is complete; no release, installation or production-effectiveness claim follows. The original JPEG freeze remains **unreproduced and causally unresolved**, so this investigation and broader card #93 remain active. Comparison/indexing completion is recorded [separately](../../archive/plans/2026-10-18-nonblocking-work.md); evaluation coverage remains on #96.

## Original incident evidence

- Reported file: `/home/destin/Projects/metropolis-e5-astra/docs/review/era5-housing-wealth/wealth-game.jpg`, 414,823 bytes, baseline JPEG, 1620×1640.
- Existing recorder logged a 5,549 ms main stall at `2026-10-18T19:02:49.704Z`; last IPC was `artifacts:check-existence`, 5,643 ms earlier. That is correlation, not a causal trace. A separate main stall was 1,603 ms.
- Both windows recorded 51–56 second presentation delays with almost no attributed script/layout work. At 19:03:29 UTC, KWin logged invalid texture dimensions and an incomplete offscreen framebuffer; at 19:03:31 it named YouCoded Not Responding, cleared by 19:04:02. Destin reported other applications remained responsive. Neither graphics errors nor the last IPC establish cause.
- Read-only installed-ASAR inspection found a recorder using histogram maximum only, without the newer timer-lateness fallback. It also lacked the newer session-setup/discovery workers. Therefore the 5.5-second recorded maximum **does not prove main responsiveness during the longer missing interval**; do not privilege the GPU theory based on that negative. Installed read-service, project-watcher and chatsearch index-store modules matched the compiled baseline byte-for-byte; background setup and diagnostics differed. Installed package was 1.3.1-1; source commit was unknown. No production archive was modified or executed.
- No logged GPU reset/OOM/power signature was found in the historical 18:50–19:05:59 window. That does not exclude transient pressure.

## Merged viewer repairs

Keep the existing loading/error/viewer presentation, cancellation and authorization behavior:

- Scope read state to project root, record ID, record path and retry identity before children commit. Switching from missing text to an image must not commit a false missing-file state, and a new selection must not commit previous content or metadata. The original first-render regression produced four expected failures before repair.
- Preserve outgoing dirty-draft snapshots and original concurrency tokens across unguarded selection changes, including same-ID path-only renames. Failed, missing, binary and truncated rename reads leave drafts recoverable without claiming that a failed read means deletion.
- Scope watcher and edit-entry reads to the requesting selection/visit. Late results cannot overwrite a different root/path, a returned visit, a retried read or an unmounted pane.
- Final review corrections additionally preserve edits typed before or during a pending watcher read, including a truncated result, while retaining the original save token and surfacing the disk conflict. Explicit Load the whole file / Use disk version actions and captured raw disk-delivery callbacks are invalidated across ID/root/path changes, leave-and-return, retry and unmount. Current explicit actions still apply normally. These cases are pinned in `youcoded/desktop/tests/ActiveArtifactView.test.tsx`.

Earlier independent reviews found outgoing-draft/stale-read issues and path-only rename loss, which were reproduced and corrected. The original 101-related-test follow-up is historical evidence; the final post-review totals below supersede it for the merged candidate. No speculative GPU patch or production configuration change was made.

## Historical isolated reproduction — not a final-binary benchmark

All figures below are from the original October 18 probes, not a new measurement of the final merged binary. Disposable sessions/private HOME and copied history were used; no provider requests or production app manipulation:

- Detached baseline at `bc9e43752`, launched through run-dev.sh with offset 400/profile file-freeze-gpu: raw binary IPC 2.1–2.4 ms, JPEG decode 10–13 ms, isolated ImageView mounts 12–35 ms, Projects/Files opens 108–139 ms. The first instrumented run included a screenshot inside sampling; its 355 ms gap is invalid as opening-cost evidence.
- Real chat-chip opens with copied morning-rounds theme, disposable buddy, DPR 2.16 and confirmed AMD Radeon 8060S/Mesa 26.2.4 GPU compositing: 339/232/232 ms, maximum frame gap 77.7 ms, longest task 69 ms, longest IPC round trip 75.2 ms. Screenshots were outside measurement. The multi-second freeze did not reproduce. GPU-disabled A/B was not justified by a reproducible normal-GPU stall; the GPU was not exonerated.
- Original conversation `8521c586-ea96-4486-8105-fd1ee7096d51`, “Tomorrowland Inspired Futuristic City Models”, rooted at `/home/destin`: delivery at 18:57:29 UTC and completion notices through 18:57:48 preceded recorded stalls by minutes. Transcript contains no viewer-click event. Home sidecar was about 1.8 MB/1,884 records. Synthetic home topology (265 directories/1,181 files) with copied metadata measured 8.4 ms read/parse, 137.8 ms watcher readiness and 12.8 ms maximum heartbeat gap; this did not reproduce original storage/load.
- A pre-incident history copy (1,877 JSONL records, 4.11 MB), new session UUID and remapped paths produced real SendUserFile tile opens of 376/299/255 ms at matching theme/DPR/GPU/buddy settings. Maximum frame gap 88.9 ms, longest task 86 ms, maximum IPC round trip 26.7 ms. The reported 15–20-second freeze did not reproduce. Other original active sessions, process uptime and transient graphics/system state were not reproduced.
- Separate audit measurements confirmed unbounded diff computation and blocking full search refresh. Those classes were repaired, but do not explain the JPEG incident. Synchronous hardware/ROCm subprocess probes and quadratic inline-filepath overlap scans remain unconfirmed audit leads, not implemented fixes. A 22.5 MB/20,679-record sidecar parse/index probe measured 92 ms wall/116 ms CPU, insufficient by itself to explain the observed multi-second stall.

Original test windows were stopped; disposable reproduction checkout and copied HOME/history were removed, with evidence retained in the original workspace's scratch area.

## Final verification of merged source

- Required local desktop verification passed all nine gates: source types, test types, related tests, knip, lint, design lint, ast-grep, screen openings and journeys. **5,546 related tests passed, 36 skipped; 253 files passed, 1 skipped.** Separate final focused six-file run: **136 passed**, including 83 viewer tests. This is not a full-repository local-suite claim.
- Evidence: candidate workspace `scratch/verify-20261021-085510-2003527/`, `/tmp/93-review-verify.log`, `/tmp/93-review-target-final.log`.
- Local Android JVM-only verification passed 36 tests per debug/releaseTest/release variant, 108 variant executions total, no failures/errors/skips. Full local payload verification was blocked by missing `apk version -t` tooling, despite successful backend compilation.
- [PR #665 remote CI](https://github.com/itsdestin/youcoded/actions/runs/39631598352) subsequently passed four Linux test shards, four Linux package formats (AppImage/deb/rpm/pacman), Android JVM, debug APK and releaseTest APK jobs, plus build/evidence/completion gates. Skipped browser-diagnostic and Android source-preflight jobs are not verification. Successful APK builds are not device-runtime or original-incident reproduction evidence.

## Still to establish

Recheck the original app-only image-opening freeze using current diagnostics when evidence becomes available. Keep main-process, renderer/presentation and graphics explanations independent until a causal trace or controlled reproduction distinguishes them. The installed recorder's historical negative is insufficient to rule main out. Do not mark this incident resolved merely because confirmed viewer defects and separate comparison/indexing blocking classes were repaired.

The original `worktrees/sessions/93-file-viewer-freezes` workspace and nested app worktree retain uncommitted evaluation work and their original plan copies. They were not edited or removed for this app-only closeout. Historical uncommitted-state wording in those preserved copies is superseded for app source by the merge reference above; reconciling those copies remains separate from this active record.
