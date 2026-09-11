---
status: active
date: 2026-09-09
---
# Sync safety — approved direction and batch boundaries

Authority: `docs/active/design/2026-09-08-sync-safety/sync-safety.questions.answers.json` (all four picks submitted). Destin authorizes staged corrective work, existing deletion semantics first, recovery-first retention, and explanations in existing screens. No new delete-everywhere or local-eviction controls. No commit, merge, push, live-app changes, or paid evaluations authorized.

## Design

Preserve the current Git transport identity, binary fidelity, conflict-copy convention, normal deletion propagation, project stop tombstones, conversation shrink protection, polling fallback, backend coverage, and retention schedules. Correct failure handling before consolidation. Do not replace the engine or silently rewrite users' existing stores.

1. Backup consent and accounting: every automatic writer must honor backend pause; every checked copy must report failure. A failed replacement cannot trigger retention or completion. Completion is per destination, not any-destination success. A running job needs a fresh consent check before additional copies or pruning; already-running filesystem/remote operations cannot be promised instantaneous cancellation.
2. Backup publication and recovery: snapshots need private run/device ownership, complete manifests and immutable publication; unknown legacy copies must not be classified verified merely from dates. Retain last verified recovery copy per covered dataset, including temporarily missing/stopped datasets. Never delete legacy snapshots to migrate layout. Preserve coverage distinctions until a common coordinator proves parity. These are a separate batch from immediate failure guards.
3. Transport correctness: explicit checked outcomes, distinguish absent stages from read failure, no unchecked conflict operations; protect ignored/untracked files; required secret excludes cannot be overridden by project ignore files. A transaction shared across processes must not deadlock recursive retry/repair. Keep local histories even if reconciliation fails.
4. Repair: do not reset the baseline to fetched-but-unapplied content. Recover trustworthy prior ancestry when possible; unknown ancestry must preserve ambiguous data without silently publishing absence as deletion or stale files as additions. First setup remains distinct from repair. Evidence preserved in quarantine is not automatically deleted.
5. Engine completion/status: scheduling and waiting have separate contracts. Awaited calls cover their requested cycle, even when coalesced. Only verified remote success updates freshness; offline/blocked attempts remain incomplete. Existing UI receives truthful state, with any visible additions reviewed first.
6. Identity and import: validate state, lock read-modify-write across processes, reject case-equivalent collisions before moving or attaching folders, respect stopped identities in every activation path. Do not change remote naming. Import uses owned staging and retains source when copied contents cannot be verified stable. No automatic resolution of existing name collisions.
7. Cleanup/conversations: preserve unreadable conflict evidence; prove ownership before legacy link removal. Do not assume transcript size proves common history; divergent inactive histories require preservation rather than replacement. Existing filesystem resurrection is documented behavior, not consent for global erasure.
8. UI and platform: before/after workbench review for truthful state, exclusions/conflicts and stop/cleanup explanations. Audit Android implementations separately; do not label implemented artifact operations unsupported, and do not equate remote-browser use with Android local sync.

## Evidence and corrections

Baseline app `6bf34ad5`; previous 184-test run covered normal paths. Scratch validation `scratch/sync-validation/results-final.log` records eight positive reproductions of unsafe behavior: tier-1 deletion after fetched/unapplied remote change; tier-2 resurrection; failed checkout publishing markers; failed stage-3 probe publishing deletion; failed stage-2 subprocess read skipping conflict preservation; overlapping awaited cycle returning early; `.gitignore` negation publishing `.env`; unborn checkout overwriting ignored local file. These are bug-presence assertions, not regression guards yet. Repair tests invoke repair directly rather than recreate originating corruption.

Corrections: lost conflict copies can remain recoverable from Git parents; symlink removal does not normally delete targets; filesystem transcript resurrection has not established reversal of any specific UI delete button; project artifact-history deletion is not conversation deletion. Additional source-confirmed issues include case-equivalent project identity collisions, unlocked persisted-state updates and stopped-project reactivation.

## Design-review gate (Fenn, first review)

The direction is approved, not every algorithm. Do not implement repair, retention migration, locking or consolidation until their detailed batch design resolves these blockers:

- Unknown-ancestry repair must persistently block ordinary snapshot/merge/push across restart until ancestry or a safe reconciliation is established. Quarantine alone is insufficient. Any new recovery-resolution UI needs separate review.
- Legacy snapshots remain unverified and protected from both migration deletion and ordinary age pruning until a coverage-aware policy establishes safe eligibility. Date directories can contain now-missing/stopped datasets.
- Full transaction locking needs canonical resource identity, explicit lock order, atomic acquisition, owner-checked release and crash recovery. Age alone cannot prove an owner dead; existing PID-after-mkdir locks are not a safe template.
- Failure gating cannot protect existing same-day recovery content overwritten during copy. Backup publication must use private, collision-safe run ownership before this batch can be considered complete. Skipping all existing destinations would regress manual Back up now and is not an acceptable final fix.
- Capture a writer/destination/dataset/exclusion/cadence compatibility matrix before consolidating writers.

The first independently implementable correction is automatic target selection honoring the existing pause flag, tested through production selection and wiring. It does not claim to fix in-flight pause, backup publication, retention, or the entire pause contract.

## Additional verified consumer contracts

Fresh reviewer18 traced pause as automatic-backup opt-out, not a ban on explicitly requested Upload now: targeted `pushBackend(id)` includes a paused destination, while bulk `forceSync()` excludes paused ones. Preserve this distinction. Bulk UI currently ignores returned result; busy/lock failure has zero errors; no-target/debounce is successful no-op; returned backend IDs include failed attempts. These are status obligations, not permission to report uploaded data. `SyncService.stop()` does not abort/await a push; spaces engine stop awaits current chains. Back up all now invokes legacy SyncService only, NOT spaces DailyBackup. Do not silently drop or claim nonexistent manual spaces coverage when consolidating.

## Acceptance

Each batch has failing regression evidence, passing relevant tests, a fresh code review, and explicit unresolved findings. Final desktop changes require `bash scripts/verify.sh <isolated-app>`; Android/Worker changes need their own tests. Existing user files/clouds remain untouched throughout verification. New UI receives feature-flow review before implementation. No blanket completion claim until all batches are verified or explicitly deferred by Destin.
