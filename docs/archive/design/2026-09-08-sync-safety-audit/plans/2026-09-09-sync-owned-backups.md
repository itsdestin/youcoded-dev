---
status: draft
date: 2026-09-09
---
# Owned backups — next-batch technical design and TDD plan

**Review checkpoint, not implementation or completion.** Implements only the publication/retention portion of `docs/active/specs/2026-09-09-sync-safety.md` after review. No production edits, cloud access, live-app operations, commits, new UI, or Android changes are authorized by this document. Immediate failure-guard work remains separate; re-read its finished diff before integrating. A namespace-only change does not require a UI gate; any later visible status additions do.

## Review correction — simplify before implementation

Fresh reviewer17 rejects the following unnecessary complexity in the draft below: causal predecessor graphs, uptime-based retention, permanently stale prune locks, extra owner-token protocol, arbitrary dataset/history ceilings and whole-run failure whenever active files change. None is approved for implementation.

Revised design boundary: serialize attempts per target/install/family; record successful-run order; preserve latest verified compatible nonempty recovery per historical dataset (including stopped/missing); uncertain ordering preserves affected runs only. Use existing calendar schedules with conservative clock-anomaly deferral. Use process-exit-releasing serialization, not immortal crash locks. Bound memory through streaming/pagination, not new coverage ceilings. Stage per dataset with bounded stability retries; incomplete datasets never replace prior recovery and partial work must not report complete. Use UUID + install/target identity + local ownership record + verified manifest; do not claim remote atomic ownership or malicious-editor defense. Unknown runs are protected without vetoing unrelated proven candidates. Keep the sibling namespace, coverage matrix, checked mirror outcome and no-legacy-deletion rule.

Before implementation replace the superseded draft interfaces/tasks below with three concrete batches: publication, coordination, retention. This file currently preserves investigation detail, NOT executable approval for the rejected mechanisms.

## 1. Namespace decision: a sibling, not another dated descendant

Choose these paths (relative to each configured target root):

```text
Drive:  Backup/snapshots-v2/legacy/<UTC-date>/runs/<device-id>--<uuid>/personal/...
iCloud: Backup/snapshots-v2/legacy/<UTC-date>/runs/<device-id>--<uuid>/<existing-category-layout>
Both:   Backup/snapshots-v2/spaces/<UTC-date>/runs/<device-id>--<uuid>/<dataset-key>/...
```

Each run also has reserved root metadata: `owner.json`, `inventory.ndjson`, and finally `manifest.json`. Spaces use one run per target attempt containing all selected spaces; legacy uses one run per target attempt containing its selected categories. Different families never share a run.

WHY: the initially considered `Backup/<date>/runs/...` and `Backup/spaces/<date>/runs/...` isolate writers but **not older retention**. Existing desktop `sync-service.ts` lists immediate children of `Backup/` and purges recognized dated parents; `sync-spaces/daily-backup.ts` does the same under `Backup/spaces/`. Their predicates do not recognize `snapshots-v2`. The sibling protects v2 from these reviewed old writers without changing payload category paths. Pin this with the actual old predicates, not a prose assertion.

This is protection against the reviewed clients, not arbitrary cloud tools or every historical release. **We cannot prevent older clients deleting their own legacy dated copies.** New code must never prune/move/adopt those copies; it cannot retrofit ownership or preservation into old running binaries. No dual-write into old dated destinations, migration deletion, or claim that every legacy recovery copy is protected. Android's `Backup/personal` writer and `restore/DriveRestoreAdapter.kt` reader stay unchanged; Android will not discover v2 snapshots in this batch. No flat-to-v2 restore redirection.

## 2. Evidence and coverage compatibility matrix

Source reviewed in the isolated app: `desktop/src/main/sync-service.ts` (`pushDrive`, `pushiCloud`, `rsyncOrCp`), `desktop/src/main/sync-spaces/daily-backup.ts`, `guards.ts`, `desktop/src/main/snapshot-retention.ts`, and Android `runtime/SyncService.kt` / `runtime/restore/DriveRestoreAdapter.kt`. Paths in this section are relative to `youcoded/`. Current code may change under the separate guard batch; these are coverage contracts, not a claim its current error handling is already safe.

| Writer / destination inside run | Dataset granularity | Selection and exclusions to preserve | Cadence / retention |
|---|---|---|---|
| Legacy Drive `personal/memory/<projectKey>` | Each project's memory | Existing projects with memory; rclone skip-links | Launch/hourly due check; manual force; tiered |
| Legacy iCloud `memory/<projectKey>` | Each project's memory | Existing memory; current rsync/archive copy semantics | Same |
| Legacy Drive `personal/CLAUDE.md`; iCloud `CLAUDE.md` | Individual file | Existing file, no new content filtering | Same |
| Legacy Drive `personal/encyclopedia` | Encyclopedia category | Top-level `*.md` only (`--max-depth 1 --include '*.md'`) | Same |
| Legacy iCloud `encyclopedia` | Encyclopedia category | Whole recursive directory, not Drive's markdown restriction | Same |
| Legacy Drive `personal/skills/<name>` | Individual skill | `!isToolkitOwned` and `shouldSyncSkill`; exclude `.DS_Store` | Same |
| Legacy iCloud `skills/<name>` | Individual skill | Same eligibility; recursive copy, no new `.DS_Store` exclusion | Same |
| Legacy Drive `personal/system-backup`; iCloud `system-backup` | Each config file; each plans/specs directory; index separately | Existing config.json (configured source), settings.json, keybindings.json, mcp.json, history.jsonl, plans/, specs/, conversation-index.json; no new secret filters | Same |
| Spaces Drive `<dataset-key>` | Each stable SyncSpace identity | Existing `DEFAULT_IGNORES` rclone conversion, not project `.gitignore`; no 50 MiB live-sync cap | Hourly check, once per UTC day per target; 30 days |
| Spaces iCloud `<dataset-key>` | Each stable SyncSpace identity | `isIgnoredPath` over `DEFAULT_IGNORES`; no 50 MiB cap | Same |
| Drive configured encyclopedia mirror outside Backup | Separate mutable operation, not a snapshot dataset | Configured `encyclopedia_remote_path` (default Encyclopedia/System); top-level markdown, existing update semantics | Preserve existing invocation cadence, separately checked outcome; never retention |
| Android flat Drive backup/restore | Existing Android categories | Unchanged | Unchanged |

Legacy snapshots deliberately do **not** add conversation copies: Personal space covers them. No GitHub backup target is added. Empty directories and symlinks require explicit inventory representation, not silent dropping. Pin current platform behavior with fixtures: Drive skips links where rclone does; iCloud can preserve links. For v2, inventory links as link text and never traverse their targets. If an adapter cannot faithfully preserve a selected entry type (including junctions/special files), fail that attempt without completion, rather than dereference or silently omit it. No widening legacy filters to spaces defaults in a consolidation.

Dataset IDs are typed canonical strings, e.g. `legacy:memory:<projectKey>`, `legacy:skill:<name>`, `legacy:system-file:settings.json`, `space:<exact stable space.id>`. Space directory keys become full SHA-256 of that typed ID, avoiding the current lossy colon replacement; record the original ID and readable label in metadata. Identity is not a mutable display name or root path. Legacy per-name IDs remain per-name; rename does not authorize dropping the historical ID. Retention scopes include target, device, family and dataset ID.

## 3. Minimal implementation boundaries and interfaces

Proposed modules under `desktop/src/main/backup/` (not existing APIs):

```ts
type Family = 'legacy' | 'spaces';
type Entry =
  | { path: string; kind: 'file'; bytes: number; sha256: string }
  | { path: string; kind: 'directory' }
  | { path: string; kind: 'symlink'; target: string };
interface DatasetPlan {
  id: string; payloadPrefix: string; filterId: string;
  presence: 'present' | 'absent' | 'stopped';
  // source roots and adapter-specific selection remain local, never credentials
}
interface RunRef {
  targetKey: string; deviceId: string; family: Family;
  date: string; uuid: string; relativeRunPath: string;
}
type AttemptResult =
  | { kind: 'verified'; run: RunRef; manifestDigest: string }
  | { kind: 'not-due' }
  | { kind: 'paused' }
  | { kind: 'failed'; phase: string; detail: string };
interface BackupStore {
  inspectRun(ref: RunRef): Promise<'absent' | 'present'>; // errors throw
  uploadFresh(ref: RunRef, stagedRoot: string): Promise<void>;
  verifyPayload(ref: RunRef, stagedRoot: string): Promise<void>;
  publishManifest(ref: RunRef, localManifest: string): Promise<void>;
  readVerifiedManifest(ref: RunRef): Promise<ValidatedManifest>;
  listRuns(scope: Scope): Promise<CompleteListing>;
  deleteExactRun(candidate: AuthorizedDeletion): Promise<void>;
}
```

`ValidatedManifest`, `CompleteListing`, `AuthorizedDeletion` are internal validated/branded types, not JSON casts. Pure `layout.ts`, `manifest.ts`, `retention.ts` own path grammar, schemas and selection. `capture.ts` owns local streaming capture. `drive-store.ts` and `local-store.ts` implement bounded checked I/O; `coordinator.ts` handles consent, per-target due state and sequencing. Existing writers retain coverage enumeration until fixtures prove parity. Inject clock, UUID generator, filesystem, command runner, identity, consent reader and state directory for tests.

Target key hashes a canonical descriptor containing backend type, configured backend identity, normalized destination and resolved provider identity where available, **not credentials**. iCloud uses canonical real root; changed Drive configuration/unknown account identity fails closed for pruning, rather than treating a reused remote alias as the old target. Namespace validation disallows overlapping configured destinations. A legacy mirror destination equal to or inside the v2 namespace is rejected before writes; never allow a configurable mutable operation to reach immutable runs.

Use the existing per-install device identity as ownership identity (not the machine registry identity). Distinguish installs and dev profiles. No new cloud-wide locking or alteration to device registry. Losing identity/state means old runs remain readable but not eligible for automatic deletion by the new install.

## 4. Capture before upload; bounded, checked verification

1. Resolve consent and target descriptor; enumerate selected datasets. ENOENT at initial discovery is absent, stopped is excluded from new capture; EACCES/I/O failure is an error, never absence. Freeze selection/filter version for the attempt. Recheck it before publication; changed selection aborts.
2. Create private local staging with `mkdtemp`, outside source and synced roots, directory mode 0700. No hardlinks to source. Allocate a fresh UUID for every attempt, including retries and manual force. A run is never resumed in place.
3. Enumerate without following links using async directory iteration; copy regular files through bounded streams while SHA-256 hashing. Record pre/post file identity, size and high-resolution stat times. Compare a second complete source inventory and second streamed content hash pass against staging before uploading. Added/deleted/changed/unreadable entries abort the attempt; do not silently accept a truncated log or subset. Check source directories/parents for replacement and containment during traversal. Preserve selected empty directories and supported links.
4. This is an observed stable file-set capture, **not a transactional snapshot of an actively written database or whole filesystem**. A writer can change and revert between observations; this algorithm cannot prove global simultaneity. Its guarantee is that immutable staged bytes are the bytes verified at the destination. Ongoing changes lead to failure and a later fresh attempt, not retries against published content. No quiescing the live app or source locking is introduced. Source changes after the final capture check do not change staging; record capture start/end times, not a fictional instantaneous source revision.
5. Upload from staging only. Drive uses checked rclone `copy` to a fresh run, without `--update`/size-only shortcuts; retain `--immutable` as a secondary guard, not ownership proof. Enumerate destination with `lsjson --recursive` and require exact selected path/type/size inventory, including unexpected entries. Run `rclone check <staging-payload> <remote-payload> --download` with checked exit status for byte-level comparison even when provider hashes are missing; **do not** use `--one-way` or accept size/mtime-only success. Test the installed rclone's flag and empty-directory behavior on local fixtures before wiring. If unsupported, fail safely; no weaker fallback. Payload roots exclude run metadata, not user files.
6. iCloud uses exclusive local creation and async streaming copy, then independently walks destination and SHA-256 hashes files; compares link text, types, directories and inventory exactly. It verifies the local iCloud folder, **not Apple server durability**; no claim of confirmed cloud upload or remote freshness from local filesystem success.
7. Serialize inventory deterministically as NDJSON with canonical relative paths and explicit dataset ownership. Compute its SHA-256/count/byte totals while writing. Verify its uploaded bytes too. Only after payload and inventory checks succeed may a completion manifest be constructed and uploaded. Keep staged bytes until manifest readback is checked or the attempt fails.

### Resource and parser limits (proposed conservative first-version constants)

No new dependencies. Node `crypto`, async fs/streams and existing rclone suffice. Use `spawn`, backpressure and temporary output files, not unbounded `execFile` stdout or whole-file Buffers. File hashing uses 1 MiB chunks, at most two file streams; one target transfer/check at a time. No per-file content size exclusion: large files remain covered. Preflight available staging disk with `statfs` where supported; stream-copy ENOSPC remains a checked failure everywhere.

Bound metadata: 100,000 selected entries/run, 64 MiB inventory or lsjson output, 4 KiB path, 16 KiB NDJSON line, 1 MiB manifest, 10,000 dataset descriptors, 10,000 historical run descriptors per scan. Enforce limits while consuming bytes, before parsing. Since `lsjson` is a JSON array, spool to a capped file then parse in a worker with a 256 MiB heap budget; exceeding any budget terminates that verification, never truncates an inventory into success. Retention processes manifests/inventories sequentially and aborts all deletion on incomplete listing/budget exhaustion. These are failure limits, not coverage exclusions; log an accurate incomplete-backup reason. Use a 10-minute command deadline initially (matching existing rclone timeout); timeout/kill waits for child exit before any next operation. No automatic same-attempt retries after ambiguous writes. Capacity/deadline tuning is a later reviewed change, not silently skipping large datasets.

## 5. Ownership and manifest publication without fictional remote atomicity

`owner.json` carries format/version, run tuple, random 256-bit owner token, and creation intent. Persist a local exclusive (`wx`) run journal before the first target write. The journal records exact tuple, target descriptor digest and owner token; never overwrite it. UUID and owner token come from Node crypto. Tokens establish accidental-writer provenance, **not authentication against malicious cloud editors**.

Local/iCloud: create the exact run directory with non-recursive exclusive mkdir after validated ancestors exist; EEXIST aborts and allocates another UUID. Manifest is written once with exclusive create, flushed and closed; a reader recognizes it only after full schema/hash/payload validation. Do not claim the iCloud sync agent atomically publishes directories or honors local rename visibility on other devices.

Drive/rclone: `mkdir`, existence-check-then-copy, `copyto --immutable` and rename are **not atomic conditional creation** across clients. This API cannot prove remote CAS ownership. Use an unpredictable UUID+token namespace, preflight absence, verify exactly one owner object by `lsjson` and readback before and after upload, and reject duplicate paths/IDs, foreign entries, changed owners or ambiguous listing. Never write into a discovered existing run, even if it looks like ours. No remote rename to a shared final name, mutable latest pointer or shared daily manifest. This is collision-resistant ownership under cooperative clients, not an absolute no-clobber primitive. If review demands provider-enforced create-if-absent, generic rclone is insufficient: stop rather than assert it exists. Independent random runs make prior recovery content unreachable by normal new writes.

`manifest.json` version 2 contains: producer/family; exact run/target/device tuple; owner token digest; capture and verification timestamps; verification kind (`rclone-download-check` or `local-sha256`); inventory digest/count/bytes; dataset IDs, filter versions, prefixes and explicit present/absent/stopped state; per-dataset predecessor evidence references. Only present successfully captured datasets count as coverage. An absent/stopped entry is never a replacement for that dataset. Empty present datasets are recorded, but cannot supersede a prior nonempty recovery anchor in this batch (conservative protection against accidental empty roots).

Manifest is written **last and once**, after verification, and fetched/read back byte-for-byte. Partial JSON, unsupported versions, wrong tuple, duplicate keys/paths, path traversal, case-equivalent collisions, invalid digest, invalid totals or unknown entry types classify the run as unknown. A filename alone is never completion. No repair by overwriting manifest. Readers revalidate inventory and payload before relying on a run for deletion. A manifest becoming visible before its content through iCloud replication does not qualify until content verification succeeds.

On failure/pause, no successful result, no daily completion marker, no retention. An ambiguous manifest-upload timeout may have left complete bytes remotely: leave the run untouched and incomplete locally; next attempt uses another UUID. Crashed/incomplete/unknown runs are not automatically cleaned up in this batch, even with an owner file. Staging cleanup is limited to the exact current process's owned local staging; abandoned staging cleanup is deferred, not age-based deletion.

## 6. Retention: historical coverage before age

Replace old date-parent prune call sites for new writers; do not pass v2 dates to old purge shells. Reuse pure calendar bucketing concepts only. Deletion accepts an exact recognized run path under the fixed v2 family grammar; **never a date, runs parent, family, Backup root, wildcard or legacy path**. Empty parent folders may remain forever.

For each target/device/family, enumerate *historical manifests*, not just currently active datasets. Build the union of historical dataset IDs, including now-missing projects, stopped spaces and disabled skills. Unknown manifests/legacy entries are protected and do not supply replacement evidence. Any incomplete listing, unreadable recognized history, unsupported schema or unresolved identity makes this scope non-prunable for that attempt.

Use a causal predecessor graph per dataset rather than timestamps to establish replacement: a new run may reference only fully verified historical runs observed during capture planning. Concurrent unobserved branches have no dominance relation; keep all maximal verified branches. A run covers a predecessor only for datasets it actually captured successfully with compatible filters; changed filter version or reduced coverage cannot silently supersede an older anchor. No wall-clock timestamp or UUID ordering proves recency. On restoration of local state, do not invent predecessor links.

Compute protected anchors over every historical dataset: retain every maximal coverage branch and the last nonempty verified recovery branch. A run containing any protected dataset is indivisible and retained. A stopped/missing dataset with no replacement therefore protects its containing run regardless of age. Before deleting a non-anchor, freshly verify retained replacement payloads, inventories, ownership and manifest digests for **every dataset** it contains. Partial replacement does not qualify.

Then apply schedules independently per dataset's compatible coverage history and union keep decisions: legacy keeps every run within 7 UTC days, newest eligible day per ISO week for days 8–28, newest eligible day per month for days 29–90; spaces keep every run for 30 days. Preserve all runs on a retained date (manual same-day runs are not coalesced/deleted early). Beyond these schedules deletion still requires replacement proof. Future/invalid dates are protected.

Clock: capture timestamps are labels, not ordering authority. Use monotonic elapsed time for in-process intervals and detect wall-clock rollback/jumps against it; suspend pruning on discontinuity. Across restart or lost clock state, require an eligible candidate to remain observed for its policy age using durable observation records and monotonic elapsed intervals, excluding unobserved downtime; calendar bucketing alone cannot advance deletion eligibility. This conservative delay may keep extra backups, never fewer. Do not claim an offline clock can establish trusted real-world age.

Concurrency: new writers use distinct run IDs; no writer mutates a published run. Retention takes a **local per-target/device/family prune lock via `open(wx)`**, held across listing, protection calculation, replacement recheck and each exact deletion. Lock records owner token; release only by the acquiring process after checking token. No PID/mtime stale stealing. Crash leaves pruning blocked, not backup publication; an explicit offline ownership-recovery procedure is separate review work. All same-install prune paths must use this lock and canonical local state root. Other devices prune only their own provenance, never ours. A cloned identity/state or changed target identity disables automatic pruning pending review; do not infer remote locking from this local lock.

Candidate must match a locally journaled successful run and remote owner/manifest digest; reconstructed historical manifests supply protection but cannot independently authorize deletion. Recheck consent, target identity, candidate owner/digest and all witnesses immediately before each purge/rm. Changed/unknown data aborts cleanup. External deletion/corruption can still defeat retention guarantees; this is cooperative-client safety, not remote object-lock storage. A purge interrupted mid-run cannot roll back: retain its local deletion intent and retry only that exact authorized non-anchor after fresh checks. Never delete a witness as part of the same plan. No startup sweep of arbitrary incomplete runs.

## 7. Consent, retry and completion wiring

Both writer families share a target-attempt result contract, not a forced common dataset enumerator. Due state is scoped by target key + device + family + selection/filter digest and UTC day. Successful target A must not suppress failed B. Legacy global markers are not v2 verification evidence; first v2 attempt is due. Append exclusive per-run success receipts only after manifest readback and a fresh consent check; derive due state from validated receipts instead of a shared mutable latest JSON. Missing/corrupt receipts may cause extra fresh backups, never completion. Failure to persist receipt is an incomplete attempt.

Manual force bypasses due/debounce only and always creates a new run; it does not bypass consent or overwrite an old run. Recheck backend pause/enablement and destination identity before capture, each transfer/check/publication, completion receipt, mirror copy and each delete. If paused while an operation runs, await its termination; do not promise instantaneous cancellation. Even if publication finished during pause, do not report cycle completion or prune; retain the valid remote bytes as recovery evidence.

Keep mutable encyclopedia mirror outcome separate from snapshot publication. A mirror error must remain reported, not be hidden by a verified snapshot; do not rewrite that snapshot on retry. Retry failed mirror work separately; only snapshot receipts control snapshot cadence. Conservatively skip retention if any required target operation failed/paused. Existing aggregate status may be successful only when all requested target operations finished successfully; not-due is not a fresh backup. Per-target logs must distinguish verified snapshot, local iCloud verification, mirror failure, pause and deferred cleanup without inventing an error cause. UI redesign and broader engine completion semantics are outside this batch.

## 8. Bite-size TDD sequence (all pending review)

Each task: first add a failing executable regression, make the smallest implementation, run focused tests, inspect diff. No production wiring until steps 1–7 pass and design blockers are reviewed.

1. **Pin compatibility:** `backup-coverage.test.ts` fixtures for every matrix row, skills eligibility, links, empty directories, >50 MiB file, nested encyclopedia, secret/junk excludes and conversation non-duplication. Source guard pins Android flat reader/writer unchanged. Test old retention predicates against sibling vs dated nesting.
2. **Pure layout/identity:** `backup-layout.test.ts`: exact namespace, UUID/device grammar, full dataset hashes, traversal/absolute paths, case collisions, destination alias changes and mutable-mirror overlap. Reject parent deletion by construction.
3. **Schema/parser:** `backup-manifest.test.ts`: deterministic inventory, bounded JSON/NDJSON, duplicate keys and paths, unknown versions, wrong owner, partial manifest, incompatible filters, absent vs empty and stopped coverage.
4. **Capture:** `backup-capture.test.ts` on temporary filesystem: byte-preserving binary/large streams, stable capture; injected additions/deletions/same-size edits; unreadable source; ENOSPC; links and parent replacement. Assert failures produce no manifest or completion. Check finite stream concurrency and limits.
5. **Local publication:** `backup-local-store.test.ts`: exclusive directory collision, independent SHA-256 verification, same-day force preservation, crash/partial manifest, mutation after capture, delayed metadata/content visibility. Never assert Apple cloud delivery.
6. **Drive adapter:** `backup-drive-store.test.ts` fake command runner for exact argv, nonzero check/copy/list status, timeout, duplicate Drive entries, owner collision, missing hashes, unexpected files and capped output. Add offline local-backend rclone integration fixtures for `lsjson`/`check --download`; no configured remotes or credentials. Missing binary explicitly blocks this integration gate, never an implicit pass.
7. **Historical retention:** `backup-retention.test.ts`: stopped/missing dataset last copy; mixed-dataset run; same-day manual runs; two devices; concurrent causal branches; filter narrowing; empty replacement; legacy/unknown/incomplete manifests; corrupt witness; incomplete listing; future/rollback/jump/restart clocks; observation-age guard; exact-run deletion only. Repeat with randomized ordering to prove order-independent protection.
8. **Prune I/O/ownership:** `backup-prune-store.test.ts`: two local processes contend on exclusive lock; no stale stealing; crash blocks pruning only; owner-checked release; missing local journal never grants deletion; pause/identity/witness changes before deletion; interrupted exact-run purge. Tests use owned temp roots only.
9. **Coordinator:** `backup-coordinator.test.ts`: A succeeds/B fails then B retries; same target different roots; config changes; force fresh UUID; two families; every pause boundary including manifest in flight; receipt failure; mirror failure/retry separate; no completion/retention on failed or paused attempt. Assert all injected promises settle before return.
10. **Wire legacy writers:** replace destinations and prune shells only after matrix parity; preserve mirror and all checked outcomes from prior batch. Update existing `sync-service` tests; guard that no old date-parent purge remains reachable from these writers.
11. **Wire spaces writer:** keep existing selection and ignore semantics, add per-target receipts and fresh runs. Update daily-backup tests; guard stopped histories survive current space-list shrink. Android remains untouched.
12. **Independent review + verification:** fresh reviewer checks ownership limitations, metadata bounds, symlink semantics and retention witnesses against implementation. Run focused tests, then `bash scripts/verify.sh <isolated-app>` once concurrent edits stop. No cloud/live-app tests. Document actual command outputs and unresolved limitations; do not call this the whole sync-safety fix.

## 9. Review decisions and honest limits

Recommended decisions: accept sibling namespace; accept cooperative random ownership rather than unavailable provider CAS; accept local-only iCloud verification; accept fail-closed limits and stale prune locks; accept extra retention for ambiguous clocks, empty replacements and incomplete history. These choices trade space/retry work for recovery safety without adding dependencies or silently changing coverage.

If review requires strict atomic remote create, transactional source capture, server-confirmed iCloud persistence, or automatic crash-lock recovery, those are separate capability/algorithm designs—not hidden assumptions this batch can satisfy. This plan does not protect legacy copies from older clients, grant migration/cleanup permission, implement restore discovery, or close the transport/repair/identity/UI parts of the approved spec.
