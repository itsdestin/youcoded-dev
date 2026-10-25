---
status: shipped
date: 2026-10-22
session: 93-freeze-hunt
shipped: itsdestin/youcoded#695 (644d7dcfc archive of long-gone records, restorable)
topic: Automatic cleanup of the artifact history file (artifacts.json)
---

# Automatic cleanup of the artifact sidecar

Design only. No app code was touched. All numbers below come from a read-only copy of
`~/youcoded-dev/.youcoded/artifacts.json` taken 2026-10-22 13:26 (23,839 records, 61,894
versions). The live file keeps growing, so counts drift by a few hundred.

## 0. Short answer

- A version is **metadata only** (about 153 bytes: id, time, session id, type, author). There is
  **no file content, no blob, no content store** behind it. Deleting a record frees only its own
  bytes in this one JSON file. Nothing else is orphaned.
- Nearly everything in the file is history about files that no longer exist. A "missing" file is
  already hidden from Project View, from counts, and (by default) from the Session Drawer. So the
  user-visible cost of removing those records is small, but it is not zero (section 2).
- Recommended: **archive, never delete.** Move records that are provably dead into an append-only
  compressed file next to the sidecar. A record qualifies only if its file has been missing at two
  separate checks at least 7 days apart, it has had no activity for 30+ days, and the reason it is
  missing is a trustworthy one. Run at most once a day, in idle time, in one write, with a size
  floor so it never rewrites the file for a handful of records.
- On the real data this archives about **10,164 records / 24,192 versions / ~7.8 MB of 20.4 MB
  (-38%)** on the first qualifying run, and settles at roughly 12k records (~10 MB) in steady state.

## 1. What a record and a version contain

Types: `desktop/src/shared/artifacts/types.ts`.

Record (`ArtifactRecord`): `id` (ULID), `path`, `kind` (internal or external), `absolutePath`
(external only), `lastModified`, `status` (active or deleted), `versions[]`, `comments[]` and
`tags[]` (both always empty in this file: checked, 0 of 23,839 records have either), optional
`discovered` (never saved).

Version (`VersionEvent`): `id`, `ts`, `sessionId`, `type` (create, edit, delete, read,
delivered), `author`, optional `toolUseId`, optional `conversationId`.

File level: `projectId`, `name`, `updatedAt` (the CAS token), `manualExcludes` (0 entries here),
`manualIncludes` (0 entries here).

Content is **not** stored. The file's current content is read from disk each time
(`read-service.ts`); there is no way to see an old version's text because none was kept. Project
content search shells out to ripgrep over the folder on disk (`content-search.ts`), not over the
sidecar. Conclusion: removing a record orphans nothing and frees no blobs. It frees only the
record's JSON bytes.

Doc comments (the Word/Excel/markdown comment feature) live in a different place,
`<project>/.youcoded/comments/<relative path>.json`, keyed by file path
(`doc-comments/*`, `claude-code-doc-comments-mcp.ts`). They do not reference artifact ids or
versions, so cleanup cannot affect them. (3 comment files exist in this project.)

## 2. Every way a user can still reach an old record

Checked by searching `src/main`, `src/renderer`, `src/shared` for sidecar readers. Readers:
`read-service.ts` (7 sites), `projects-index.ts`, `project-watcher.ts`, `project-manager.ts`,
`remote-download.ts`, `file-gates.ts`, `ipc/artifacts.ts`, `sync-spaces/import-project.ts`.

| Path to an old record | What it does with it | Effect of archiving a dead record |
|---|---|---|
| Version history UI | There is **no** version-history or restore screen. `versions` is only used to label a row ("created / edited / viewed / delivered") in `SessionDrawer.tsx` and to decide Project View visibility. | None. |
| Restore | Nothing to restore: no content is stored. The only "restore" is a person copying a `.bak`. | None. |
| Session Drawer for an old conversation | `listSessionFiles` lists records whose versions mention that session id. A record whose file is gone is drawn as deleted and **hidden unless "show deleted" is on** (`SessionDrawer.tsx` lines 329-354, `orphanIds`). | **The one visible change.** With "show deleted" on, an old conversation would no longer list files that were deleted long ago. The files cannot be opened anyway. Restore from archive brings the rows back. |
| Chat pills / links in old conversations | Pills open by **path** through `artifacts:resolve-path` (rule in `.claude/rules/artifacts.md`). Record found, or else the file is found on disk as a "discovered" record. Ids are not stored in chat transcripts. | If the file is gone it was already "not found". If the file is back, discovery finds it. No change. |
| Doc comments anchored to versions | Comments are keyed by file path, not by version or record id. | None. |
| Search | Name/content search walks the folder on disk. | None. |
| Project View / counts | `trackedArtifacts()` and `countArtifacts` already drop records whose file is missing. | None. |
| Watcher id map (`project-watcher.ts`) | Path-to-id map rebuilt from the sidecar; cache is invalidated by `invalidateSidecarIdCache`. | Must call `invalidateSidecarIdCache` after the cleanup commit (the existing remove/rename handlers do). |
| Sync to other devices | `.youcoded/` is in `DEFAULT_IGNORES` (`sync-spaces/guards.ts`) and project-manager gitignores it. The project sidecar is **per device, never synced**. Android runs the same desktop backend with its own sidecar, no Kotlin mirror (artifacts rule file). | No cross-device conflict possible for the project sidecar. Not checked: whether anything syncs `~/.youcoded/` itself (3.8 MB, not a concern at the threshold below). |
| Sync import (`import-project.ts`) | Reads and writes the sidecar with CAS when importing a project. | Cleanup must use the same CAS write and the same per-project queue so the two cannot interleave. |
| Backups | `artifacts.json.pre-migration.bak` (4 MB, old, from the relative-path migration) and `.bak.<timestamp>` on corruption. No scheduled backup. | See the cleanup backup below. |
| Manual remove (existing) | `artifacts:remove-record` already deletes one record permanently with no undo. | Precedent: the app already lets a user drop a record; the archive is strictly safer. |

## 3. What "dead" should mean

A missing path alone is not enough. The test must prove the file is gone for good, not just
unreachable right now.

A record is a **candidate** only if all of these hold at the sweep:

1. **Missing for a reason we can name.** `fs.stat` of the target returns `ENOENT` or `ENOTDIR`
   (any other error such as `EIO`, `EACCES`, `ENOTCONN`, `ETIMEDOUT` means "unknown, keep"). Then
   classify by walking up to the nearest existing ancestor:
   - **tmp**: path under `/tmp` or `/var/tmp` or the OS temp dir (scratchpads, harness output).
     Gone by design.
   - **worktree-gone**: path contains `.../worktrees/sessions/<name>/` and that folder is gone while
     its parent `worktrees/sessions/` exists and lists successfully. This is the dominant case.
   - **file-gone**: the nearest existing ancestor is on the **same filesystem device** as the
     project root and is readable.
   - Everything else is **unknown, keep**: no existing ancestor (the volume or mount is absent),
     ancestor on a different device (an unmounted-then-remounted drive, rclone, USB, network
     share), relative or non-absolute `absolutePath`, any path in a saved folder that is itself
     missing.
2. **Idle 30+ days**: newest version `ts` older than 30 days (matches the existing 30-day version
   retention, `version-retention.ts`). Unparseable timestamps count as recent.
3. **Two strikes, 7+ days apart.** The sweep keeps a tiny strike ledger
   (`.youcoded/artifacts-sweep.json`: `{ id: firstSeenMissingISO }`). The first sweep that sees a
   record missing only writes the date. A record is archivable once it has been missing at a
   sweep at least 7 days after its first strike, and is **still missing now**. If the file
   reappears at any sweep the strike is cleared. This covers a worktree that is temporarily
   absent, a mount that was down for a day, and a rename that gets reverted.
4. **Not pinned**: its canonical absolute path is not in `manualIncludes` or `manualExcludes`
   (both empty today, but the code must honour them: pinned wins).
5. **Not live**: no version newer than 7 days and its session is not an open session.
6. **Never based on path strings alone.** All existence checks use the OS `stat`, never string
   comparison, so a case-insensitive filesystem (Windows, macOS) answers correctly and
   `Foo.md` vs `foo.md` is not treated as missing. Archive keys use `canonicalize()` (the
   workspace's one source of truth for path equality).
7. **Kind of renamed or moved folder**: a moved folder looks like "gone" at the old path. That is
   acceptable because the archive keeps the record; and when the folder is moved inside the
   project, the next edit creates a fresh record at the new path as it does today.
   Optional later improvement, not required: on archive, record the content hash is not possible
   (we have none), so no rename detection is attempted.

Files referenced by surviving conversations: pills resolve by path and fall back to the disk
(section 2), so a surviving conversation does not need the record. If the file exists the record
is not dead (rule 1).

## 4. The safest policy

**Archive, not delete.** Dead records are appended to
`.youcoded/artifacts-archive/<YYYY-MM>.jsonl.gz` (one JSON record per line, gzip). Order of
operations guarantees at no point can a record exist in neither place:

1. Write and fsync the archive chunk (`.tmp`, then rename).
2. Only then rewrite `artifacts.json` without those records, through the existing `writeSidecar`
   CAS.
3. If the process dies between 1 and 2, the next run finds records present in both places; the
   archive is deduped by record id on restore. Harmless.

Other pieces, each decided for a reason:

- **Pre-clean backup**: one copy, `artifacts.json.pre-cleanup.bak`, written with
  `COPYFILE_EXCL` the first time ever (mirrors `pre-migration.bak`). Because the archive holds
  everything removed, a backup per run would only be 20+ MB of duplicate; keep the oldest only.
  Cost: 27 MB disk, once.
- **Grace period**: the two-strike, 7-day gap plus 30-day idle rule above. First removals appear
  at the earliest 7 days after shipping, so there is a week to notice a problem.
- **Keep only the latest version**: **not recommended** for living files. Version counts for files
  that exist are already bounded (30 days or the newest 10 versions, `pruneVersions`); only 200 of
  4,231 living records exceed 10 versions. Trimming further saves almost nothing and loses real
  "who touched this" history. Leave the existing rule alone.
- **Per-project limits**: add a **brake**, not a cap. If one run would archive more than 70% of the
  records, or more than 6,000 at once, it archives the oldest-idle 6,000 and stops. This catches
  a bug such as a wrong root, a mount outage, or a clock jump, which would otherwise look like
  "everything is missing". Also refuse to run when the project root itself is missing, unreadable,
  or empty of files, or when more than 50% of *all* tracked paths (including recent ones) are
  missing at once (that pattern means an outage, not cleanup).
- **Size floor**: do not rewrite the file for fewer than 500 candidates or fewer than 5% of
  records, whichever is larger. Each rewrite costs about 400 MB of memory churn, so cleanup should
  pay for itself and then be quiet. With ~230 new records a day the file is rewritten by cleanup
  roughly once every 2-3 weeks in steady state.
- **Off the main thread, idle, atomic**:
  - The *survey* (stat calls, a few thousand per run) is async, chunked (about 200 stats, then
    `setImmediate`), concurrency about 16, abortable. It reads from `readSidecarShared`, so it
    adds zero parses and never mutates the shared copy.
  - It starts 10 minutes after the app finishes launching, only when the append queue for that
    project is empty and no chat is streaming, and never more than once per 24 hours per project
    (timestamp in the ledger file).
  - The *commit* is a single queued job on the existing per-project append queue (so it can never
    run beside `appendVersionsDirect`), builds a new object copy-on-write (`artifacts` filtered,
    like the existing prune pass), re-verifies each candidate still has the same `versions.length`
    and `lastModified` as at survey time (drop any that changed), then `writeSidecar` with the
    CAS token. Atomic file replacement is already inside `casWrite`.
  - JSON parse/stringify of 20 MB cannot move off the main thread without a worker; the plan does
    not add one. Mitigation: the write happens at most about every 2-3 weeks, once, and *replaces*
    a write that would have happened anyway when the next append arrives (set `updatedAt` once).
    A later improvement could move the whole sidecar write to a worker; out of scope here.
- **Undo path**: `restoreArchivedArtifacts(projectRoot, { sinceISO? , ids? })` reads the gz
  chunks, skips ids or paths already present, and appends the records back through the same CAS
  write. Exposed as a Settings advanced action, "Bring back archived file history", plus a script
  `scripts/restore-artifact-archive.mjs` for support. Also automatically: **when a new version is
  recorded for a path that has an archived record**, nothing special (a fresh record is made, as
  today); history stays in the archive.
- **Multi-device**: not an issue for the project sidecar (never synced). Two app instances on one
  machine (dev + built) are covered by the CAS token and the commit re-verification. A cleanup
  commit that loses the CAS race simply re-surveys next day (do **not** add a second retry loop,
  per the artifacts rule: `appendVersion` retries 5x and that is the only loop).
- **Interaction with the in-memory cache and coalesced writes** (the other agent is changing
  `artifact-store.ts`): the cleanup commit goes through `writeSidecar`, which already seeds the
  shared parsed copy on a committed write, so every later read costs zero parses. The survey
  relies on the stat signature check inside `readSidecarShared`; if the other agent's version
  holds a write-behind buffer, the survey and commit must read the **post-flush** object (call
  the same "get current object" function the append path uses, never the file on disk), and the
  commit must be delivered through the same coalescing queue so it is one write, not two. After
  commit call `invalidateSidecarIdCache(projectRoot)` and send the existing `artifacts:changed`
  event (kind `'remove'` is the closest existing kind; add `'archive'` if the renderer filters on
  kind).

## 5. Expected result on the real data

Per-record compact JSON size (what the new compact writer produces; the current on-disk file is
still the old indented 26.8 MB form). Total 20.4 MB. Present on disk right now: 4,231 records
(12,516 versions). Missing: 19,608 (49,378 versions, 16.5 MB).

Why they are missing (all 19,608): worktree gone 9,103; file gone inside an existing folder
5,087; under /tmp 5,397; no existing ancestor 19; different device 2 (those last 21 are always
kept).

| Policy | Records archived | Versions | Compact MB | Left | Size after |
|---|---|---|---|---|---|
| **Recommended** (missing, strong reason, idle > 30 d) | **10,164** | **24,192** | **7.77** | 13,675 | 12.66 MB |
| Same, idle > 14 d | 16,534 | 41,644 | 13.77 | 7,305 | 6.66 MB |
| Same, idle > 45 d | 6,018 | 16,726 | 4.90 | 17,821 | 15.53 MB |
| Same, idle > 60 d | 2,886 | 9,468 | 2.42 | 20,953 | 18.02 MB |
| Cautious phase 1: worktree-gone and tmp only, idle > 30 d | 5,791 | 10,421 | 4.02 | 18,048 | 16.42 MB |
| Only files never changed (viewed only), idle > 30 d | 4,315 | 5,881 | 2.60 | 19,524 | 17.83 MB |
| Aggressive: anything missing, any age (not recommended) | 19,608 | 49,378 | 16.48 | 4,231 | 3.96 MB |

Notes:
- The oldest activity in the file is 102 days. Only 38% of the file's records are old enough to
  clear a 30-day idle gate today; the rest age in over the next months.
- The first run is held to 6,000 records by the brake, so the recommended policy takes two
  daily runs to reach the end state.
- Steady state estimate: about 230 new records a day, so roughly 37 days of not-yet-eligible
  records (about 8k) plus the living ~4k gives about 12k records and about 10 MB. That is about 3x
  smaller than today, and it stays flat instead of growing.
- Rewriting costs scale with size, so each later write is about 40% cheaper (about 240 MB of churn
  instead of 400 MB).
- `~/.youcoded/artifacts.json` is 3.8 MB: under the 500-candidate floor, it would rarely or never
  trigger. That is intended.

## 6. Test plan and exact code changes (for the implementer)

### New pure module (no fs, no clock unless passed in)
`youcoded/desktop/src/shared/artifacts/dead-records.ts` (sibling of `version-retention.ts`)

- `classifyMissing(probe: ProbeResult): 'tmp' | 'worktree-gone' | 'file-gone' | 'unknown'`
- `selectArchivable(records, probes, ledger, nowMs, opts): { ids: string[]; ledger: Ledger; blocked: Reason[] }`
  implementing rules 1-6 and the brake.
- Constants: `DEAD_IDLE_DAYS = 30`, `STRIKE_GAP_DAYS = 7`, `MIN_CANDIDATES = 500`,
  `MIN_FRACTION = 0.05`, `MAX_PER_RUN = 6000`, `MAX_FRACTION_PER_RUN = 0.7`.

### New main-process module
`youcoded/desktop/src/main/artifacts/sidecar-cleanup.ts`

- `surveyProject(projectRoot, sidecar, nowMs, signal)`: async, chunked stats, returns probes.
  Ancestor walk must terminate (guard against relative paths with no slash: my first analysis
  script hung forever on exactly that input).
- `readLedger/writeLedger(projectRoot)`: `.youcoded/artifacts-sweep.json` through the existing
  `mutateFileUnderLock` helper.
- `archiveRecords(projectRoot, records)`: write `.tmp` gz, fsync, rename into
  `.youcoded/artifacts-archive/<YYYY-MM>.jsonl.gz`.
- `runCleanup(projectRoot)`: order of operations below.
- `restoreArchive(projectRoot, filter)`: the undo path.

### Edits to `src/main/artifacts/artifact-store.ts` (after the other agent's rewrite lands)
- Export a queue-aware hook, e.g. `enqueueMaintenance(projectRoot, job)`, that puts a job on the
  same `appendQueues` entry so it runs between drains, never parallel. Do not call
  `appendVersionsDirect` from outside (rule in `artifacts.md`).
- A commit helper `commitArchive(projectRoot, ids, expectedSnapshot)` which builds the filtered
  copy and calls `writeSidecar`.
- No change to `pruneVersions`, `readSidecarShared`, `removeArtifactRecord`.

### Scheduling
`main.ts` (or wherever the project watcher is started): after the window is ready and 10 minutes
idle, for each saved project root with a sidecar over 5 MB, call `runCleanup` in a try/catch that
logs and never throws. Use `setTimeout(...).unref()`. The cleanup must not run in the
`LIST_*` handlers (the migration there is the precedent for what not to copy: reads that write).

### Order of operations in `runCleanup`
1. Bail if cleanup ran in the last 24 h for this root, or the app is quitting.
2. `readSidecarShared`; bail if null or corrupted. Remember `updatedAt` and, per candidate id,
   `versions.length` and `lastModified`.
3. Sanity checks on the root (exists, listable). Survey (async, chunked).
4. Update ledger (new strikes, cleared strikes); write it.
5. `selectArchivable`; apply the size floor and the brake. If below the floor, stop.
6. First ever run only: `COPYFILE_EXCL` copy to `artifacts.json.pre-cleanup.bak`.
7. Enqueue a maintenance job on the project queue. In it, re-read the current object, drop any
   candidate whose `versions.length` or `lastModified` changed, `archiveRecords` for the rest,
   then `writeSidecar` with the current `updatedAt` CAS token. On conflict: stop, log, retry
   tomorrow.
8. On commit: `invalidateSidecarIdCache`, emit `artifacts:changed`, log one line "archived N
   records (M versions) in <root>; archive at <path>; undo with ...".

### Tests (vitest, `desktop/tests/artifacts/`)
Pure module (`dead-records.test.ts`):
- missing + 31 d idle + 2 strikes 7 d apart: archived.
- first strike only: kept. File reappears between strikes: strike cleared.
- 29 days idle: kept. Unparseable `ts`: kept.
- `EIO` / `EACCES` / `ENOTCONN`: kept. Different device ancestor: kept. No existing ancestor: kept.
- Pinned in `manualIncludes`: kept. Relative `absolutePath`: kept.
- Case-insensitive duplicate: `A.md` exists, record says `a.md`: kept (stat-based probe fake).
- Brake: 80% candidates, or more than 50% of all tracked paths missing: refuses; with 6,000 limit
  the oldest-idle are picked first.
- Idempotent: a second run on the output selects nothing.
- Property test: ids returned are always a subset of ids in input; non-dead records are
  deep-equal before and after.

Store-level (`sidecar-cleanup.test.ts`, temp dirs only):
- Archive written and fsynced **before** sidecar write (inject failure in the sidecar write:
  archive exists, sidecar still full, rerun is a no-op duplicate).
- Crash between steps leaves no record in neither place (kill after archive; after rename).
- CAS conflict (a concurrent `appendVersion`): cleanup aborts, the appended version survives.
- Candidate that gained a version between survey and commit: kept.
- Round trip: `restoreArchive` returns identical records; restoring twice does not duplicate.
- Pre-cleanup backup is written once and never overwritten.
- Shared cache: after commit, `readSidecarShared` returns the new object with zero parses
  (reuse `sidecar-cache.test.ts` helpers); `_resetSidecarCacheForTests` clears the ledger timers.
- Main-thread guard: add the new file to the `main-blocking-calls.test.ts` review. It must need
  **no** new allowlist entries (no `*Sync` calls). `npm run knip`, `verify.sh`.
- A fixture built from a trimmed copy of the real file shape (tmp, worktree-gone, file-gone,
  other-device cases). Do not commit the real data.

Manual check (dev instance only, `run-dev.sh`, never the live app): seed a temp project with
old records, confirm Files tab, Session Drawer (with "show deleted" on and off) and a reopened
old conversation behave as described in section 2, then restore.

## 7. Decisions needed from the owner (plain language)

1. **Archive or delete?**
   - *Archive (recommended):* removed history is packed into a small compressed file you can
     bring back. You gain a safety net. You pay a few MB of disk and one more file.
   - *Delete:* simplest and smallest, but if we got a rule wrong the history is gone.
     Note that this history is only a list of "Claude touched this file at this time", not the
     files themselves, so the stakes are low either way.
2. **How long a file must be missing before it is archived?**
   - *30 days quiet + checked twice a week apart (recommended):* very unlikely to catch a folder
     that is merely away for a few days. Slower to shrink the file.
   - *14 days:* shrinks it to about 6.7 MB (about 16.5k records). Faster, a little riskier if a
     project sits untouched during a holiday.
   - *60 days:* very safe but removes only about 2.9k records now; the file stays near 18 MB.
3. **What you will notice.** Old conversations, with "show deleted files" turned on in the files
   drawer, will stop listing files that were deleted long ago. Nothing else changes: those rows
   already show greyed out and cannot be opened. Say so if you ever use that list to see what a
   past chat deleted; if you do, we could keep records that contain a delete event for longer.
4. **Do we also try to shrink the "viewed only" records of files that still exist?** Not
   recommended (saves little, loses who-touched-what), but the option is there.
5. **Where do the controls live?** Recommend no new setting: runs automatically, with a
   "bring back archived file history" button under advanced settings. An alternative is a visible
   "Clean up now" button and a toggle, which gives control but adds an interface to design under
   the UI rules (needs a review deck). Decide before an implementer starts.
6. **The first run.** It will be large (about 6,000 records, with a second run the next day). Do
   you want the first run to be only the safest category (worktree-gone and tmp, about 5.8k
   records, 4 MB) and widen later? Safer, but the file stays bigger for a few more weeks.

## Risks and things not verified

- The "Android runs the same backend" claim comes from `.claude/rules/artifacts.md`; I did not
  inspect the Android build, which has its own sidecar per device in any case.
- I did not verify whether anything syncs `~/.youcoded/` (home-level sidecar). The project
  sidecar is excluded from sync by `guards.ts`.
- Counts use "exists now" from one moment; the two-strike rule is exactly what protects against
  a transient state, and it cannot be simulated from a single snapshot. The 30-day idle gate
  applies to the snapshot as taken.
- The other agent's `artifact-store.ts` rewrite is not visible to me; section 4 states the
  contract the cleanup needs from it (a single "current object" accessor, one write queue,
  `writeSidecar` still seeds the cache).
- Memory cost of the one commit write is the same as any other write (about 400 MB churn at
  today's size); the plan limits it to about once per 2-3 weeks rather than removing it.
