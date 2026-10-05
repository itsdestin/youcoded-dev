---
title: Performance evidence and paused experiment preservation
status: active
date: 2026-09-29
---

# Evidence inventory

Current status: `2026-09-29-performance-status.md`. Historical reports distinguish measured, incomplete, unsupported and rejected runs; never rewrite an original verdict merely because a later instrument was repaired.

## Versioned evidence

- `perf-reports/2026-09-28-message-find/`: synthetic fixture Find reports, lifecycle comparisons and interpretation, including failed baseline navigation.
- `docs/archive/investigations/2026-09-26-performance-history-audit/`: historical commit screening and reviewed implementation inventory; counts are screening scope, not measured gains.
- The dated short-cycle, long-history/Files, native presentation and presentation-follow-up reports give exact run names, package stamps, conditions, integrity checks and limitations.
- Offline presentation tests now use a small synthetic `scripts/perf-lab/tests/fixtures/presentation-wire.log` and self-contained trace markers. Private captured files are no longer required to run these tests on CI. This fixture is not a new runtime measurement.

## Local-only preservation

### Resolve historical scratch paths here

The original session worktree has been removed. Let `EVIDENCE_ROOT` mean `/home/destin/youcoded-perf-evidence/performance-history-audit-2026-10-03` **on this machine**.

| Historical reference | Preserved location |
|---|---|
| `scratch/<relative-path>` | `EVIDENCE_ROOT/final-scratch/<relative-path>` |
| An absolute path ending in the old session's `/scratch/<relative-path>` | The same `EVIDENCE_ROOT/final-scratch/<relative-path>` mapping; do not recreate the deleted worktree. |
| A bare report/package name explicitly described as perf-lab evidence | `EVIDENCE_ROOT/final-scratch/perf-lab/<name>` |
| Later shipping or cleanup receipts absent from the final snapshot | `EVIDENCE_ROOT/shipping-receipts/`; its manifest records the copied additions/updates, and it also holds merge receipts, Android XML and cleanup logs. |

For example, `scratch/perf-lab/find-expiry-integrated-delayed.json` is now `/home/destin/youcoded-perf-evidence/performance-history-audit-2026-10-03/final-scratch/perf-lab/find-expiry-integrated-delayed.json`. Repository paths such as `docs/...` and `perf-reports/...` still resolve inside a normal checkout, not under this evidence root. The earlier `EVIDENCE_ROOT/scratch/` copy is the initial resume snapshot, not the preferred location for final results.

The source archive and written findings are versioned; these large raw captures are local preservation. **No off-device backup has been verified.** Treat that as a preservation caveat, not a missing app fix, and do not upload private raw evidence to the public repository.

Large raw traces, CPU profiles, private generated fixtures, screenshots and exact comparison packages are intentionally not all committed to the public repository. The 2026-10-03 resume copied the existing scratch tree to `/home/destin/youcoded-perf-evidence/performance-history-audit-2026-10-03/scratch/` and verified all 109,485 regular files by SHA-256 with zero mismatches; its sibling `sha256-manifest.json` records the inventory. The final measurement snapshot is `/home/destin/youcoded-perf-evidence/performance-history-audit-2026-10-03/final-scratch/`: **116,217 regular-file SHA-256 matches and 430 matching symlink targets, zero mismatches**, recorded in `final-sha256-manifest.json`. It includes the newer failed and accepted Find captures and exact repaired package. Any later shipping-only logs are preserved separately under the same evidence root's `shipping-receipts/` before cleanup. Do not delete unique failed reports, the exact accepted/before packages or the paused source snapshot merely to achieve a clean checkout.

Paused source: the preserved `scratch/perf-lab/paused-rendering-experiments/` reference (resolve it using the table above) contains a full pre-cleanup binary diff, all 27 changed/untracked app file snapshots and checksums. The diff includes accepted fixes too: it is recovery evidence, NOT a patch to apply blindly on merged master. `scratch/paused-rendering-experiments.md` inventories the extraction. Source-only preservation is versioned at `docs/active/prototypes/2026-09-29-paused-rendering/`: a checksum-identified archive plus precise recovery instructions, outside every app build path. Actual comparison packages remain local.

Important named local evidence: `history-render-before-app` (accepted pre-experiment package, asar `ba61863669c1e86cbc73a044509565c95dc9abc953b7980f740162fe56649145`), `history-shared-only-app` (`b11ed8bf896b56e7edfe76264a5c8db3f340464ffd4060e7e512f3b4c887a8f6`), `history-plain-only-app` (`19aaeb923433763206e53c1069de5181e4296b7d4b873fba12b255c0875b3974`), original `switch-before-app`, input/activation/profile/native-presentation JSON+trace logs, and failed capture originals described in the reports.

## Publication review

A read-only review of newly proposed reports found generated fixture content and local path metadata, not actual credentials or private conversation text. A separate common credential/private-key pattern scan covered73 then-untracked publication candidates with no hits. These bounded checks are not a universal secret guarantee; repeat against the final staged/pushed content. Do not add live-app inspection dumps or screenshots to public git without inspecting each file. Historical absolute scratch paths describe where runs happened; resolve them against the preserved local evidence root after cleanup, not an assumed live worktree.
