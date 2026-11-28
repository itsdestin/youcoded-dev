---
status: draft
date: 2026-09-09
---
# Sync backup safety — target-selection first chunk

## Superseding review decision: implement target selection ONLY

The requester narrowed the immediate implementation after fresh review: checked success/no-prune does not protect an existing same-day snapshot from overwrite. Skipping existing paths would break force backup; owned publication needs a separate full design. **Only the target-selection change below is implementation-ready. Everything after this section is retained investigation/design notes, NOT an approved implementation sequence. In particular, do not disable retention or backup features to stand in for a recovery design.** No app edits in this planning task.

### Exact implementation scope

1. Create `youcoded/desktop/src/main/sync-spaces/backup-targets.ts` exporting `selectSpaceBackupTargets(backends: BackendInstance[]): BackupTarget[]`. Import BackendInstance as a type from `../sync-state` and BackupTarget as a type from `./daily-backup`.
2. Move the mapping currently in `youcoded/desktop/src/main/main.ts:2331–2337` into that helper, adding only `b.syncEnabled === true` to eligibility. Preserve Drive/iCloud filtering, nullish defaults (`gdrive`, `Claude`), explicit iCloud path requirement, empty-base filtering and returned `{type, base}` shape. Do not add IDs or change DailyBackup interfaces in this chunk.
3. In the existing async startSyncSpaces callback in `main.ts`, retain fresh `await getSyncConfig()` and return `selectSpaceBackupTargets(cfg?.backends ?? [])`. Add a WHY comment that storage-only/paused backends have not consented to automatic spaces backup. Do not change startup/timer/global sync gating.
4. Create `youcoded/desktop/tests/sync-spaces-backup-targets.test.ts`: execute the production helper with enabled and paused Drive and iCloud entries, multiple accounts, GitHub, empty list, missing iCloud path, configured paths, default Drive values and explicit empty strings (nullish defaults must remain nullish, not become truthy defaults). Assert exact outputs and no input mutation. Assert only explicit true is selected, including a malformed missing flag fixture at the boundary.
5. Add a narrow source wiring guard in that test: read main.ts, require the helper import and invocation inside the actual startSyncSpaces callback with the freshly read config. Assert the captured callback is nonempty and use whitespace-tolerant patterns for CRLF. The behavior tests exercise the helper; the guard only prevents leaving the old unfiltered mapping wired in production. No Electron startup mock or live app required.

### Immediate verification commands (future implementation; not run here)

```bash
cd /home/destin/youcoded-dev/worktrees/sessions/sync-safety-audit-20260908/youcoded/desktop
./node_modules/.bin/vitest run tests/sync-spaces-backup-targets.test.ts tests/sync-spaces-daily-backup.test.ts tests/sync-spaces-service.test.ts
cd /home/destin/youcoded-dev/worktrees/sessions/sync-safety-audit-20260908
bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/sync-safety-audit-20260908/youcoded
```

First demonstrate the paused-target test fails without the predicate; verify the wiring guard fails when the helper call is replaced by the former mapping (separate reviewer worktree/no concurrent writes). Read the diff and obtain fresh review. This fixes **selection-time automatic-backup consent only**; dynamic mid-job pause, retry, completion accounting, same-day overwrite, ignored legacy results and recovery retention remain unresolved. No UI approval is needed for enforcing this existing promise. No commits authorized.

---

## Retained broad design notes — superseded, NOT implementation-ready

Authority: `docs/active/specs/2026-09-09-sync-safety.md` and the approved staged safety direction. This is an implementation plan, not implementation or shipping authorization. No UI, IPC shape, app source, live data, commits, migrations of cloud contents, or paid evaluation changes were made while preparing it.

## Recommendation and boundary

Implement the existing backup promises in small backend-only steps: pause-aware target selection; checked copy outcomes; no completion after failure; independent destination retry; single-flight execution. Keep the two writers separate. These corrections need no new interface approval.

**A failure gate is not a last-good recovery floor.** Successful commands do not establish a complete, consistent, immutable recovery snapshot. Date-only directories have no dataset manifest, ownership or proof that a stopped/missing dataset has another recovery copy. Therefore this first batch must **hold destructive retention on existing unverified dated directories, even after a successful copy**. Preserve the existing 30-day spaces and tiered legacy retention calculators and tests as candidate policies, but do not authorize deletion from dates alone. Log the hold without a new UI warning. This is a temporary recovery-first safety interlock, not a new retention schedule. If holding retention is unacceptable because of storage pressure, stop for a decision; do not silently fall back to age-only deletion.

Preserve all existing destination layouts, copy flags, datasets, ignored paths, skill routing, normal sync deletion propagation and stopped-project handling. No unification with the Git engine. Immutable publication, per-dataset verified floors and manifest migration are batch 2. Never delete legacy recovery copies as a migration step.

## Source inspection and coupling

Paths below are relative to `youcoded/desktop/` unless prefixed otherwise.

- `src/main/main.ts:2324–2337`: the async target provider selects Drive/iCloud but does not test `syncEnabled`; iCloud without an explicit path is omitted. Preserve this existing coverage distinction rather than importing legacy autodetection in this batch.
- `src/main/sync-spaces/daily-backup.ts`: one plain-date `.spaces-backup-marker`; catches individual copy errors, still prunes and stamps; no flight guard. Drive subprocess rejects on failure; iCloud uses async `mkdir`/`cp` with DEFAULT_IGNORES. Destinations are `Backup/spaces/<date>/<space-id with first colon replaced>`.
- `src/main/sync-spaces/service.ts:220–246`: startup plus hourly timer, `activeSpaces()` excludes stopped projects; targets currently read only once per run. It constructs the sole production DailyBackup found in the app-wide search.
- `src/main/sync-service.ts:611–1065`: Drive checks memory, CLAUDE.md and system files, but ignores returned failure codes for both encyclopedia copies (including its separate legacy path), skills, plans/specs and conversation-index. Both backend writers prune after failed copies. One any-success daily stamp suppresses other destinations. The per-backend freshness marker is touched even on error. `push()` already has an instance guard and `.sync-lock`, plus 15-minute debounce. `force` bypasses daily/debounce; targeted manual push intentionally includes storage-only backends.
- Preserve legacy coverage: memory, CLAUDE.md, encyclopedia, eligible user skills, config/settings/keybindings/mcp/history, plans/specs and frozen conversation-index. Drive uses `Backup/<date>/personal/...`; iCloud uses `Backup/<date>/...` without `personal`. Conversations remain in spaces backup, not re-added here.
- `src/main/sync-state.ts:644–686`: `forceSync()` and `pushBackend()` consume `PushResult.success/errors/backends`; keep that shape. `.sync-marker-*`, `.sync-marker` and `backup-meta.json` have status readers; do not reuse freshness files as new scheduling ledgers. Failed/skipped work must not advance freshness.
- `tests/sync-spaces-daily-backup.test.ts`: pure date/30-day policy tests plus real temporary iCloud copy/filter/same-day gate test. Its marker assertion expects a plain date and needs adapting if state changes; retain actual file-content and exclusion assertions.
- `tests/snapshot-retention.test.ts`: pins tier boundaries and `shouldStampDailyMarker(due, anySnapshotSucceeded)`; update the latter to destination-level semantics, not a renamed any-success aggregate.
- `tests/sync-spaces-service.test.ts`: DailyBackup mock is currently a no-op class with `runIfDue`; startup tests call `startSyncSpaces(async () => [], ...)`. Extend this mock to capture provider/lifecycle wiring, without weakening engine/lease tests.
- Inspected relevant fixtures in `tests/sync-warning-self-clear.test.ts`, `tests/sync-health-primary-system.test.ts`, `tests/sync-warnings-lifecycle.test.ts`: use `new SyncService(tmpHome)`, `setClaudeDirForTests`, private-method spies and temporary warning files. They cover health/warning lifecycle, not backup failure completion. New writer tests should use this isolation pattern, stub all remote commands, and not invoke real startup probes.
- App-wide searches also surfaced Android `runtime/SyncService.kt`, `RestoreService.kt` and `restore/DriveRestoreAdapter.kt`. They are not edited or certified by this desktop batch. Layout must stay unchanged. Test hits in voice/symlink suites were comments or unrelated `push` methods, not backup mocks. Main-module test harnesses (`ipc-handlers.test.ts`, `session-create-ownership-order.test.ts`) intentionally avoid ready-time service startup; prefer a small pure target selector over booting Electron to test mapping.

Read before implementation: workspace/app CLAUDE files, `.claude/rules/sync-spaces.md`, `.claude/rules/test-suite-hygiene.md`, `docs/PITFALLS.md`. Inspection covered the direct writer implementations and focused mock/consumer ranges, not a complete review of every indirect renderer/status consumer. Re-search the exact fields if changing status semantics beyond failure-only freshness gating.

## First implementation chunk (small, independently useful)

1. **Pause selection:** extract the existing mapping to `src/main/sync-spaces/backup-targets.ts` (new), called by the callback in `main.ts`. Signature: `selectBackupTargets(backends: BackendInstance[]): BackupTarget[]`. Filter `syncEnabled === true`, Drive/iCloud only; retain default remote/root and current explicit-iCloud-path policy. Include backend identity on each target for later checks. Add `tests/sync-spaces-backup-targets.test.ts`.
2. **DailyBackup failure accounting:** track complete/failed/deferred per target; any copy rejection prevents that target's completion stamp and retention. Other targets may proceed. Zero spaces/zero targets is no-work, not success. Preserve `runIfDue`'s nonthrowing contract and log partial outcomes instead of unconditional “completed”. Marker-write failure remains retryable and must not be logged as durable completion.
3. **Legacy checked operations:** use one local checked-rclone wrapper inside `pushDrive` (or a private helper) for every copy/copyto, preserving argv. Aggregate errors and first real stderr, classify once per backend; do not clear warnings after a failed copy. Exceptions from discovery/mkdir/copy must also prevent completion. Gate both legacy retention paths on complete copy outcome, and apply the independent unverified-retention hold described above.
4. **Recovery hold ships with these gates**, not in a later commit that leaves success-day age pruning enabled. Preserve candidate-policy functions; remove/bypass production destructive execution against date-only snapshots. Tests must prove an old directory survives BOTH failure and successful replacement.

Do not call this first chunk full pause/retry safety until the following completion work lands. It can be reviewed immediately without coordinator or UI design.

## Finish batch 1: minimal internal interfaces

### Fresh consent and no overlap

Change DailyBackup's internal caller contract to accept a provider, rather than a frozen target list:

```ts
interface BackupTarget { id: string; type: 'drive' | 'icloud'; base: string }
runIfDue(spaces: SyncSpace[], getTargets: () => Promise<BackupTarget[]>, log: (m: string) => void): Promise<void>
```

Only `service.ts`, its mock, and DailyBackup tests need this call-signature change among the direct usages found. Install an `inFlight: Promise<void> | null` before the first await; concurrent timer calls await that flight, never start a second copy and never claim a newly requested cycle completed. No coalesced rerun is necessary for the hourly scheduler; next tick evaluates fresh spaces/targets. Clear in `finally`. Capture the job instance in the timer closure rather than dereferencing a mutable `backup!` after an await. Before adding a stop hook, inspect `stopSyncSpaces` and adapt its mock explicitly; stopped service must not start new copies after a pending config read resolves.

Target identity for accounting/consent is a collision-safe tuple of backend ID, type and resolved destination, not type alone. Re-read targets before each space copy and before completion; compare the entire tuple. Removed, paused or repointed targets become deferred and remain due. Provider/read errors fail closed and log; never keep using a stale target list. Do not automatically copy a newly added target in the middle of a run; next run picks it up.

For legacy writers, pass a fresh `canContinue()` check alongside the per-backend gate (or as a small execution context). Automatic runs require the original ID/type/destination still enabled. All copy/mkdir boundaries and the final stamp must use it. Config checks must be read-only: existing `getBackendInstances()` can migrate/write config when parsing fails, so do not use it as a supposedly fail-closed consent probe without a narrow read-only implementation. Missing/unreadable config means defer, not “use defaults”.

**Dynamic pause semantics:** finish an already-started rclone/cp operation; do not promise immediate cancellation or rollback. After it settles, start no further copy or prune for that target and do not stamp the interrupted run. Recheck before an rsync fallback: a pause arriving during failed rsync must prevent the subsequent cp. Async `mkdir` and `cp` are separate boundaries. A synchronous filesystem operation blocks receipt of a same-process pause until it returns; no claim of instantaneous responsiveness. No per-file interrupt protocol is introduced.

Manual targeted push is an existing explicit one-off permission on storage-only backends. Preserve it; `force` alone must not include paused targets. A newly observed true→false change during a manually started enabled-backend run should stop further work. A backend that was already paused and explicitly targeted needs separate handling so the initial paused state does not erase that one-off permission. Detect removal/repointing regardless. Brief pause→resume between checks is not observable without revision tokens; flag this limitation rather than inventing cancellation guarantees.

### Per-destination retry accounting

Use local, writer-specific per-target date receipts, not a shared coordinator and not a cloud manifest. Proposed helper file: `src/main/backup-completion.ts`; tests: `tests/backup-completion.test.ts`.

Minimal operations: derive a safe hashed key from the tuple; read a versioned receipt for that exact key; atomically replace it after complete copy with `{version: 1, date, targetKey}`. Keep separate roots for spaces and legacy receipts. Supply explicit temp receipt roots in tests. Atomic temp-then-rename prevents torn reads; per-key files avoid lost updates to a common JSON map. They are scheduling evidence ONLY, never verification or deletion authority.

Do not reinterpret either old global plain-date marker as success for every destination. Preserve those legacy files untouched; new receipt absence means due. This may cause a one-time same-day recopy into the existing layout; it must not delete old dates. Receipt read/write failure leaves that target due. Target config change/new account is due even if another ID/type succeeded today. Keep the same UTC date fixed throughout one cycle.

Legacy `SnapshotGate` is computed per instance with common `now/dated` and per-key `due`; replace any-success aggregation with actual target results. Internal outcome needs to distinguish `complete`, `failed`, `deferred`, `not-due` (an integer zero currently conflates these). `PushResult` stays unchanged; failed/deferred requested work must not set success true. Do not increment a copy-error counter for a routine pause merely to fit the old shape; exact existing-surface handling of `success:false, errors:0` needs a focused consumer check before finalizing. Preserve warning ownership and avoid fabricated network errors.

Successful destinations are skipped on subsequent automatic ticks; failed destinations retry on the existing hourly cadence, without immediate loops. Force repeats the requested eligible destination even if its receipt exists. Retain the 15-minute attempt debounce as scheduling, not remote freshness evidence. Before changing its storage, verify `sync-state.ts` and health fallbacks; preferably separate attempt accounting from success markers. No successful-copy freshness on not-due, failed, paused, unsupported or empty work. Warning clear happens only after a genuinely complete new copy, not a daily skip.

Process-local no-overlap is feasible now. The legacy lock is not a proof of multi-device or all-process safety; DailyBackup instances in separate installations still share mutable date directories. Immutable ownership and cross-process coordination belong to batch 2, explicitly unresolved here.

## Regression cases and exact test files

- `tests/sync-spaces-backup-targets.test.ts` (new): mixed enabled/paused Drive+iCloud, two Drive accounts, GitHub excluded, empty iCloud path excluded, defaults unchanged; assert ID and exact base. Test the production selector, not a copied predicate.
- `tests/sync-spaces-daily-backup.test.ts`: retain real temp-dir scrubbed iCloud copy; deterministic UTC clock. Inject/reject copy for first/middle/last space; old dated files remain, failed target receives no receipt/no success log. A succeeds/B fails, next run only B copies; all fail; empty inputs; next UTC day; target change; marker I/O failure; old plain marker cannot suppress retry. Drive tests mock subprocess at boundary and assert existing exclusion argv.
- Same suite: deferred promise in first copy, call twice, assert one copy and both callers unsettled until release; rejection clears flight. Pause/remove/repoint between copies and after final copy; rejected config read; pause during mkdir; pause during rsync fallback belongs in legacy suite. Assert absence of follow-on operations, not just an error message.
- `tests/sync-service-backup.test.ts` (new): use temp home/config with every covered dataset populated, mock rclone success by default then fail each command family independently (including BOTH encyclopedia paths, skills, plans, specs, index). Assert unsuccessful public result, warning classification, no completion receipt/freshness/meta advance, no destructive retention. Throw on discovery/mkdir and iCloud copy. Successful sibling still completes and failed sibling retries next eligible tick. Verify exact legacy layout/flags and excluded conversation copy remain unchanged.
- Same suite: force bypasses daily gate, default excludes paused, manual targeted paused behavior preserved, pause/removal/repoint mid-job, GitHub-only and not-due no false copy evidence; existing overlap/lock release on failure. Old legacy dated directories and their bytes survive a successful run as well as a failed run.
- `tests/backup-completion.test.ts` (new): key separation, schema/date validation, receipt read/write failure, atomic replacement, changed destination, old global marker ignored, no date-only deletion permission.
- `tests/snapshot-retention.test.ts`: retain all policy boundary cases; replace aggregate stamp contract with target-level helper coverage if the helper is retired. Add explicit tests separating “age candidate” from “allowed to delete”; do not label a successful copy a verified manifest.
- `tests/sync-spaces-service.test.ts`: provider passed through, startup/hourly behavior, stop while target lookup/copy pending, no orphan follow-on job; extend DailyBackup mock rather than silently accepting unused callback parameters.

Use deferred promises/fake time, not sleeps. Real data only in mkdtemp roots with retrying teardown. Mock subprocesses/DNS; never launch a service against the real home. For each load-bearing guard, demonstrate a failing regression before the fix; destructive guard mutation checks only in a separate reviewer checkout or after all writers stop.

## Commands and acceptance

Run from the returned workspace. These are implementation-time commands, **not claimed runs in this planning session**:

```bash
node scripts/workspace-start.mjs --session sync-safety-audit-20260908
cd /home/destin/youcoded-dev/worktrees/sessions/sync-safety-audit-20260908/youcoded/desktop
./node_modules/.bin/vitest run tests/sync-spaces-backup-targets.test.ts tests/sync-spaces-daily-backup.test.ts tests/sync-service-backup.test.ts tests/backup-completion.test.ts tests/snapshot-retention.test.ts tests/sync-spaces-service.test.ts
./node_modules/.bin/vitest run tests/sync-warning-self-clear.test.ts tests/sync-health-primary-system.test.ts tests/sync-warnings-lifecycle.test.ts tests/sync-display-state.test.ts tests/ipc-channels.test.ts
cd /home/destin/youcoded-dev/worktrees/sessions/sync-safety-audit-20260908
bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/sync-safety-audit-20260908/youcoded
```

Run only existing test paths until each new test is created. Record actual failing/passing output, review the full diff, obtain a fresh code review, and report remaining hazards. No interactive app or UI deck is required for this backend-only batch. No Android build/parity claim; no SDK is available per workspace guidance.

## Explicit unresolved hazards / next batch

1. Same-day mutable destinations, `--update`/fallback skip behavior, concurrent devices, source changes during a copy, and absent datasets mean command completion is not recoverability. Receipt data cannot authorize retention. Batch 2 needs immutable run/device ownership, manifests, stable-copy validation and per-dataset last-good floors, retaining legacy evidence untouched.
2. Retention hold consumes additional storage. Duration/capacity response requires an explicit follow-up, never an emergency auto-delete of unverified history.
3. Manual pause revocation and transient pause→resume require a versioned-consent decision if boundary checks prove insufficient. Existing explicit targeted pushes must not be silently removed.
4. Config readers swallow some errors and legacy filesystem copy can fall back after rsync failure. Broad read/error semantics and exact copy verification remain unresolved; fail known operations closed now without claiming comprehensive recovery verification.
5. Process-local single-flight does not serialize separate apps/devices. Do not advertise global no-overlap until a separately reviewed lock/ownership design exists.
6. Existing status consumers conflate attempt/freshness and error counts. Keep this batch to truthful existing fields; any new visible state/copy must follow the approved existing-screen review flow later.
