---
status: active
---
# Five-minute Linux/Android CI experiments

User authorized isolated experiments on 2026-10-18, targeting as close to five minutes total as possible, maximum useful parallelism and efficient individual steps. This authorizes candidate branches/CI runs, NOT merges, production signing/release publication, paid runner upgrades or weakened coverage.

## Frozen starting point and existing measurements

Linux app experiment branch `session/29-linux-build-bench` starts at the already-green app candidate `a85342b9a5fc6a6b63d9b6023d04ae907a06396f` (PR635). Baseline production source and tests must stay fixed across comparisons; record source/test tree hashes, package lock, Office pins, Node/Electron/builder versions and hardware.

PR635 observed 11m19s total: full test command8m29s, installer build9m28s, running concurrently. Android7m20s. Earlier serial beta PR19m57s is historical context, not a controlled A/B. Completed Linux release target tail pacman307–366s; compression causality unproven. Android prior run builds three runtime identities during unit-test prerequisites (~143.6s script intervals) including repeated musl compilation. Full profiles: `/tmp/youcoded-desktop-packaging-speed-review.md`, `/tmp/youcoded-android-build-speed-review.md`.

## Experiment design

### Linux and tests — first batch

1. Add an EXPERIMENT-ONLY `.github/workflows/linux-speed-benchmark.yml` triggered by a pull request whose head is the named experiment branch. A new manual-only workflow cannot dispatch before default-branch registration; a new PR workflow can run from its candidate tree. Preserve desktop-ci.yml and all existing workflow-contract tests unchanged: ordinary candidate CI provides a same-SHA unsharded/full-package control. Never emit the protected full-build check from the diagnostic benchmark itself. Read-only contents permission, no signing secrets, `--publish never` everywhere. No master/release triggers.
2. One preflight/preparation job checks policy, types, lint and benchmark unit tests, then creates one frozen Linux unpacked app. Preserve the same main/shared/renderer build and Office inputs. Transfer it in a mode/symlink-preserving archive; include preparation, archiving/upload and downstream restore/extraction in end-to-end timings. GHA artifact ZIP alone does not preserve executable permissions/symlinks.
3. Native-format fan-out uses independent private copies/outputs/temp dirs for AppImage/deb/rpm/pacman; FPM mutates prepared metadata, so no shared writable directories/hardlinks. Use supported --prepackaged mode, not private builder patches.
4. For deb/rpm/pacman compare existing compression against explicitly supported faster settings discovered from the installed builder schema/FPM version. AppImage is retained and measured; no speculative unsupported flags. Compare installed payload and package metadata, preserving licenses, dependencies, links and modes. Changing archive bytes/size is a measured tradeoff, not declared identical release output. Report each size as well as timing. No formats removed.
5. Run all existing Vitest files/cases in four independent Linux shards on the same frozen source, with normal assertion/timeouts preserved. Persist structured reports and verify the union has no duplicate/omitted files and no failures or silent skips relative to the complete discovered suite. Preserve whole-tree guards and full typecheck. Test harness selection/aggregation itself has failing regressions.
6. Record process-level monotonic spans and GitHub job timestamps: setup/preflight/preparation/transfer/each target/test shard/validation/gate, CPU/RAM/tool versions and source fingerprints. Do not add parallel medians. First batch includes slower baseline controls; its entire duration need not meet five minutes. After selecting supported winners, run a separate combined candidate with all coverage but without control-only workload to measure actual critical path.

### Android — isolated second candidate, parallel preparation

- Separate worktree/branch and existing android-ci.yml manual dispatch, no release signing/publication.
- Instrument current task/native phases first; retain all JVM variant tests, debug and real R8 ReleaseTest assembly.
- Trial verified run-local reuse of application-ID-independent native compilation/preparation (especially musl) with complete toolchain/source/sysroot/patch fingerprints. Preserve variant-specific interpreter/RPATH/launcher transformations and original Claude Code bytes. No blind reuse by directory presence; no concurrent mutation of current shared cache/root/sysroot.
- Trial moving generated runtime/assets dependencies to actual packaging consumers so JVM tests don't build unnecessary native payloads; prove task graph, APK contents, runtime identities and legal/source evidence. No blanket exclusions or removed tests.
- Only after measurements consider heap/worker/configuration-cache experiments; preserve source-collection behavior and invalidation. Existing caches are not counted as new improvements.

## Review and acceptance

All experiment code stays separate from PR635/272. Unit/schema tests before hosted runs; inspect exact staged paths and secrets before candidate pushes; independent review before treating results as trustworthy. Use existing runners; record costs/queues rather than buying bigger machines. Any failing/flaky test is investigated and fixed, never dismissed to get faster green.

A winner must preserve all test cases/targets and required installed content, modes, links, package dependency metadata, signing/source/legal obligations. Initial static payload comparisons are not claimed as full platform install/runtime proof. No interactive/repeated live-app rig. Retain evidence and distinguish measurement from estimate; five minutes is a target, not a guarantee or reason to skip validation.

## Current companion work

PR272's first full trial passed but helper/gate checkouts were68s/63s. Sparse correction reduced checkout but exposed a shallow GitHub event-base/actual-merge-parent mismatch, correctly failing red. A real Git regression now passes using the verified synthetic merge's actual first-parent tree for classification; independent review and rerun pending in session29-ci-fastpaths. This is not a packaging change.
