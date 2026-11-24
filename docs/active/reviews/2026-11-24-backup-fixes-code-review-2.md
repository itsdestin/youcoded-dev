---
status: active
date: 2026-11-24
topic: Second independent review of session/backup-fixes-2026-11-18 (range 0bd0ef70f..5d2c617d6: master merge + B-1..B-4)
---

# Verdict: SAFE AFTER LISTED FIXES (no certain data-loss path in normal use; three small hardening fixes and four test gaps)

RAN = executed here (scratch copies only, nothing in the worktree or the real home changed). READ = code reading.
Suites run from the worktree with HOME pointed at a scratch folder: 8 files, 187 tests pass; nothing was written to that scratch home except npm's own log files, so no test in the range touches the real home.

Real code range reviewed: merge conflict resolution in sync-service.ts, then `3a61c7674..5d2c617d6` (the six commits; 36 files).

## Merge resolution (sync-service.ts)

The resolution is clean. `acquireOwnedLock` from master's `owned-lock.ts` is used (sync-service.ts:485-496); the author's own lock rewrite is gone, and nothing else from the earlier fixes was dropped in it. Stale-lock constants, `noteBackupSkipped` (L-2 warning) and `STALE_LOCK_TAKEOVER_MS` are master's.

**Does master's lock have F1's two-process steal race? YES (RAN).** `owned-lock.ts:106-110`: both contenders judge a leftover lock stale; A renames it aside, deletes it, makes a new live lock; B (already past its check) then renames `lockDir` (now A's live lock) aside and deletes it and makes its own. The comment "two contenders cannot both remove a lock the other has just re-created" is not true, because the rename acts on the path, not on the folder B inspected. Reproduction with a forced interleave: both A and B returned `ok:true`; the lock folder ended up owned by B while A believed it held it. In real life the window is milliseconds and needs a leftover lock from a crash plus two processes (installed app and a dev copy) starting a backup at the same instant. Effect: two overlapping personal pushes, no data loss (rclone copy is additive). Master's code, not this branch's; report to whoever owns owned-lock.ts. Fix: after the rename, read `owner.json` from the moved-aside folder and, if it is not the stale owner judged earlier, rename it back and treat as held.

## Findings by severity

### F-A (medium, RAN) A missing config file ignores a good copy, and the next write overwrites the good copy
`backup-config.ts:254` (`'missing'` returns `{ok:true, config:{}}` without looking at `config.json.good`). Trigger: the app (or power) stops between "damaged file moved aside" (`:237`) and "repaired file written" (`:240`) in `repair`, or anything deletes config.json. Next launch: `healBackupConfig` reads it as a normal first run, `isFirstRun` says first run (unless the first-run state file says COMPLETE), and the next harmless write (`updateBackupConfig`, e.g. the status poll's migration at sync-state.ts:362 creates `{storage_backends:[]}`) refreshes `config.json.good` from the EMPTY content. Demonstrated: good copy replaced by `{"x":1}` after one update. User experience: backup list gone and the safety copy gone with it; only `config.json.damaged-<stamp>` holds the old data, with no notice. Window is tiny, which is why this is medium not high. Fix: treat "missing but good copy exists" like the blank-file case (restore), and in `writeInner` never refresh the good copy from a config that has fewer backups than the existing good copy without the write being a deliberate removal (or keep one older generation, `.good.prev`).

### F-B (medium-low, RAN) Two processes repairing at once: the loser reports "damaged" and refuses the user's action
`backup-config.ts:233-238`. The queue is in-process only. Two instances (installed app + dev copy share `~/.claude`) both judge the same damaged text; the first moves it aside and restores; the second passed its "still the same" check a moment earlier, so its rename fails ENOENT and it returns `ok:false` ("...could not move it aside: ENOENT"). Reproduced with two module instances: one got the restored config, the other `ok:false`, with one `.damaged-` file and a note. Experience for the loser: a red "Backup settings couldn't be read" notice (written to the warning store by the health check, then replaced within 5 minutes) and, if it was an add/remove/pause, a failed action "nothing was changed". Transient, nothing lost. Fix: on a failed `moveAside` with ENOENT, re-read and return `readInner(file)`.
A rarer variant (READ): the loser's rename can move the already-repaired healthy file aside and rewrite the same content from the good copy; if a third writer saved between, that save is demoted to `config.json.damaged-*` and lost from the live file.

### F-C (medium-low, READ) "Start fresh" can be offered, and work, on a file that was repairable
`backup-config.ts:218-247` returns `ok:false` also when the repair itself could not be written (full disk, read-only folder) — the original is put back. `configHealthWarnings` then shows the red "couldn't be read" notice with Start fresh, and `startFreshBackupConfig` (`:291`) judges "not ok" and moves the file aside. After that the file is missing, the good copy is ignored (F-A), and the user sets up from nothing although a valid copy sat next to it. Needs a failing disk write plus a click, so rare. Fix: make `ConfigDamagedError`/`ok:false` carry a kind (`unreadable-and-unrepairable` vs `repair-write-failed`); Start fresh only for the first; the second says "couldn't save the repair".

### F-D (low-medium, READ) Stale good copy after a crash between "file written" and "good copy refreshed" can bring back a removed backup
`writeInner` `:202-213`: file written first, good copy after. A crash between leaves good = previous state. Later damage restores the previous state: a backup the user removed returns (demonstrated by simulating the crash; it came back). Consequence: backups to a destination the user deliberately removed start again (for Drive, only if its remote still exists). Requires crash in a millisecond window and later damage. Accepted trade-off if noted; or refresh the good copy BEFORE writing the new file only when the good copy is older than the file (so the good copy is always "the previous complete state" and a restore never goes forward-wrong), and document it.

### F-E (low, READ) The panel's Dismiss on the restored/salvaged notice does nothing until the next health check has stored it
`sync-state.ts:848-855` finds the warning only in the stored list; the panel builds the notice from the file (`:478`). If the repair happens while the app runs (not at launch), the notice can show for up to 5 minutes with a Dismiss that does nothing. Launch repairs are stored by the startup health check, so the common path works.

### F-F (low, READ) First-run wizard on a healthy install after salvage
`salvageConfigText` can keep the backups but drop `setup_completed` when the cut-off is before it (it keeps values only up to the first break). `isFirstRun` (first-run.ts:248) then answers true unless the first-run state file says COMPLETE (it normally does on a real install, which is why this is low). Fuzzed: 512 truncation points of a realistic file, 0 invented or altered values, `setup_completed` kept whenever it precedes the break. No path turns a healthy file into a wizard; a file with no good copy and nothing salvageable still shows the first-run wizard on every launch (and `markSetupCompleted` then refuses to write), with "Start fresh" reachable only inside Settings, which a user stuck in the wizard cannot reach. Pre-existing in kind, but the new notice is invisible to this user.

### F-G (low, READ) `readBackendInstances` swallows every failure to migrate
`sync-state.ts:369` `.catch(() => [])` also hides a failed write of the migration (disk full) with no log. Reads as "no backups" for that poll, silently. The comment promises the notice comes from the file check; it does not for a write failure.

### F-H (low, READ) The success marker is "any snapshot backend succeeded", not "0 errors"
`sync-service.ts:1161`. With two destinations (Drive A fails, Drive B or iCloud succeeds) the cycle stamps `.sync-marker` and clears `lastFailedCycleAt`, so "Extra backups are stale" never fires for the failing one (its own per-backup red warning does exist). Also a not-due cycle (`pushDrive` `!snapshot.due`, returns 0 at `:700`) counts as success and stamps the marker though nothing was copied that hour; harmless because it only happens after that day already completed. And `forceSync` can stamp the marker while its conversations half fails (that failure has its own red warning). The commit message claim "only on 0 errors" is therefore wrong in wording.

### F-I (low, READ) The background first upload leaves no trace in two cases
`SyncPanel.tsx:1111` `void handlePushBackend(added.id)`. (1) The failure box is panel state; if the panel is closed mid-upload it is dropped. A real failure still leaves the red per-backup warning (recordBackendFailure) so it is visible on reopen. (2) If the push is skipped because another sync is running (`push()` returns `success:false, errors:0` with no warning), nothing is recorded; the new backup then waits for the hourly poll, which is non-force, so on a day another backup already stamped the day marker the new destination reads success without copying (`pushDrive` `!snapshot.due`). Pre-existing quirk, now unseen because the wizard no longer waits. Quitting the app mid-copy: stops silently; next hourly poll retries only if the day is not stamped (it is not stamped for a failed cycle, so retried).

## Item 2: when does a user actually see "Extra backups are stale"? (answer to the owner's question)

Conditions (sync-service.ts:1297-1306): a success marker older than 24 hours AND a failed cycle recorded in THIS app run within the last 90 minutes, AND a health check runs after that failure. Health checks run every 5 minutes while a window is visible or a phone is connected (the launch one runs before the first push). Pushes run at launch and every hour (15-minute debounce now reads the separate attempt marker, so a failure no longer hides itself).

- App left open for days with failing backups: yes, within about 5 minutes of the first failing hourly cycle after the marker passes 24 hours, and it stays (each hourly failure refreshes the 90-minute window). If the window is hidden at the time, it appears within 5 minutes of someone looking.
- App restarted daily: the launch check cannot show it (no failure yet this run); the launch push fails within seconds to a few minutes and the next 5-minute check shows it. A user who closes the app inside about 5 minutes never sees it. Otherwise yes.
- Laptop asleep overnight: not shown on wake by itself (intended). If the morning's cycle fails, it appears within 5 minutes after that failure; if the backup succeeds, never. A laptop closed for days and only briefly opened (under 5 minutes) misses it.
- Never: a backup that has never once succeeded (no marker file exists, so no stale warning; only the per-backup red warning), anyone with a second working backup (F-H), a cycle that fails by being skipped (another sync running; has its own 24-hour red warning), and an app that is not visible and has no phone connected (checks pause).
So the warning is reachable in the main three scenarios; the author's "gap" (open over 90 minutes with no new failing cycle) does not occur because hourly pushes keep failing and renewing it. Not a tight loop and not a never-retry: failing cycles retry hourly (attempt marker blocks only within 15 minutes); an exception thrown mid-cycle leaves the attempt marker unwritten, so it retries at the next hourly tick, not faster. Last-backed-up cannot show a failed cycle as fresh (per-backup marker now success-only; test S10 and S6 kill).

## Item 3 (B-3): all copy steps counted?
Drive: every `rclone` in `pushDrive` goes through `copyStep` (grep: only the lsf/purge pruning calls and the health `lsd` remain direct; lsf/purge only run when `errors === 0` at `sync-service.ts:~797`). iCloud: every copy is in try/catch counting errors. Spaces (daily-backup.ts `copyOne`): failures collected, prune only `if (!landed) return`. Pruning is blocked by any failed part in all three paths (RAN, mutations S1/S5 killed). READ: a failed purge is best-effort by design.

## Item 4 (B-1)
- Flag stuck true: `copyingIds` is cleared in `finally` (sync-service.ts:1135); spaces map is cleared in `finally` (daily-backup.ts). A hung rclone ends at its own 10-minute timeout. Not stuck in any exception path found (S11 mutation killed).
- Poll: `setInterval` only exists while `anyCopying` is true and is cleared on stop and on unmount (SyncPanel.tsx:645-651). While hidden it still ticks every 3 s but does nothing (the interval is not paused; harmless).
- Remote/phone: `copyingBackendIds` rides the 10-second push and the status call, so a remote client shows it; the failure box for a wizard-started upload exists only on the client that started it (F-I).

## Item 5: async readers
Searched every caller of `isSyncConfigured`, `getBackendInstances`, `getSyncEnabledBackends`, `getBackendById`, `configGet`, `isToolkitOwned`, `resolveICloudPath`, `writeBackupMeta`: all awaited; no truthy-Promise bug and no unawaited call. Startup order: `healBackupConfig` runs before `isFirstRun` in main.ts:1406 and headless-boot.ts:143, inside the existing try. No other source file reads or writes `toolkit-state/config.json` (searched `src/main`), so one owner holds.

## Item 6: IPC
`sync:start-fresh` is open to phone and remote web (pinned in `tests/fixtures/phone-open-channels.json`, count test 37 to 38). Parity: backend-contract.ts:294, preload.ts:199/1689, remote-shim.ts:2808, sync-channel-types.ts:31, ipc/sync.ts:69, workbench mock. No Android Kotlin entry exists for any `sync:*` channel (the phone runs the desktop backend), so none is needed. Safe: it refuses on a healthy or repairable file (RAN: returns null) and keeps the moved file; same exposure level as remove-backend, which can do more harm. Intended and acceptable; see F-C for when it is offered wrongly.

## Item 7: tests

New tests that test the claim: B-4 marker tests, copy-step counts for skills/plans/index, repair/salvage/startFresh, dismissal path. Missing: crash between steps (F-A, F-D), two processes (F-B), read-back guard, undo on failed write, encyclopedia copies, writing under a read-only folder.

### Mutation survivors (scratch copies; baseline 33 / 43+15 pass)
backup-config.ts (14 mutations):
- M1 good copy refreshed even when the file did not read back identically: SURVIVED (nothing pins "do not bless a copy of something that did not land")
- M2 read-back skipped entirely: SURVIVED (the "read back" in B-2's claim is untested)
- M4 undo of a failed repair write removed: SURVIVED (the "put the original back" path is untested)
- M9 re-check before moving aside removed: SURVIVED (the cross-process guard is untested; and F-B shows it is incomplete)
- Killed: M3 no aside, M5 start fresh on healthy, M6 blank + good not restored, M7 trailing number trusted, M8 partial entry kept, M10 queue removed, M11 good copy unvalidated, M12 write when damaged, M13 note not written, M14 salvage without an entry.
sync-service.ts (16 mutations):
- S2 and S2b (encyclopedia copy and its legacy-path copy back to ignoring failures): SURVIVED, both. The encyclopedia is the first thing B-3 names; no test pins it.
- Killed: S1 copyStep not counting, S3 skills, S4 plans, S4b index, S5 prune after errors, S6 success marker always, S7 debounce on success marker, S7b attempt marker never written, S8 failed-lately dropped, S9 failure never remembered, S9b success does not clear it, S10 per-backend marker on failure, S11 copying flag not cleared, S12 90-minute window removed.

### silent-catch baseline and blocking allowlist
- `silent-catch-baseline.json`: only two entries REMOVED (`first-run markSetupCompleted 1`, `daily-backup runIfDue 2`); no entry added. The catches that remain are annotated `// benign:`. Judged: `daily-backup.ts` marker read (no marker = first day) fine; prune best-effort fine (copy already succeeded, retried next run); `backup-config.ts` access/undo-rename/note-clear fine; `healBackupConfig` catch fine (readBackupConfig does not throw in practice); `sync-state.ts:369` `.catch(() => [])` is the one I do not accept as written (F-G).
- `main-blocking-calls.allowlist.json`: one entry REMOVED (`SyncService.configGet readFileSync`); nothing newly allowed. All new file work uses `fs.promises`. Fine.

## Item 8: new user-facing sentences
- `backup-config-notices.ts:22-23` "Backup settings restored" / "Your backup settings file was damaged, so YouCoded brought back the last copy it had saved. The damaged file was kept next to it in case you need it." Observed facts only. Slight: "damaged" also covers a blank file; fine.
- `:29-30` "Please check your backups" / "...damaged and no earlier copy was saved. YouCoded kept the N backups it could still read. Please check the list is complete and add any that are missing. The damaged file was kept." True; "no earlier copy was saved" is true only if none was readable (could also be unreadable); acceptable.
- `:35-36` "Backup settings couldn't be read" / "Nothing was changed, so nothing was lost. Start fresh sets the unreadable file aside (it is kept, not deleted) so you can set up your backups again." Two cause-ish claims: "nothing was lost" is true of the file but wrong to say if a repair failed to WRITE (F-C) or lost the race (F-B), where the file may be perfectly readable. Soften to "Nothing was changed." and drop "unreadable" in the Start fresh sentence.
- `SyncPanel.tsx:778` "Couldn't set the damaged file aside" (+ the real error shown): fine.
- `SyncPanel.tsx:1609` "Uploading..." and `StatusBar.tsx:1568/1573` "A backup is copying your files — click to see it" / "Backing up…": true statements of observed state.
- `sync-service.ts` stale body (unchanged wording) "haven't succeeded in over 24 hours": true for the marker, see F-H for the two-destination case.
- `backup-config.ts:54` ConfigDamagedError "The saved backup settings couldn't be read, so nothing was changed." shown as the action failure reason: accurate for the unrepairable case; wrong for F-B/F-C cases.

## F1-F8 carry-over (from 2026-11-18 review)
| # | Earlier finding | Now |
|---|---|---|
| F1 | Lock steal race | The author's rewrite is gone; master's `owned-lock.ts` HAS the same race (RAN, above). Still open, now master's code |
| F2 | Phone/GitHub gate only in screens | Fixed in backend: `addBackend` refuses github and phone Drive (sync-state.ts ~620) (READ) |
| F3 | Empty file inconsistent | Fixed: one `classifyConfigText`; `markSetupCompleted` goes through `updateBackupConfig`; `isFirstRun` uses the same classifier (READ + tests) |
| F4 | No recovery from a damaged file | Fixed by B-2 (restore, salvage, Start fresh) with caveats F-A, F-B, F-C |
| F5 | Missing space folder counts as success | Unchanged by design (daily-backup.ts `copyOne` skip) |
| F6 | "Back up all now" success with nothing copied | Fixed: `forceSync` answers "Nothing was copied." (sync-state.ts ~757-761) |
| F7 | Spaces warning cleared by hourly push | Fixed by master's per-half warning source (`source:'spaces'`, sync-state.ts:84, 432-442) |
| F8 | Recycled live pid blocks backups up to 24 h | Improved by master's lock: Linux verifies by process start time, other systems after 2 hours; the screen text "hasn't run yet" is unchanged |

Rely on master's lock: F1, F8. Still fixed by this branch's own code: F2, F3, F4 (new), F6. F5 unchanged. F7 fixed by master.

## Not covered
- No Windows or macOS run (atomic rename retry, `process.kill` pid checks).
- No real rclone, real Drive, real Android device, no dev instance, no UI rendering of the new row, chip or notices (only the unit tests and the code).
- Cross-process races were simulated with two module instances plus forced interleaving, not two real apps.
- The three notice texts' appearance in the status bar pill and Back up all now button behavior while an hourly copy runs (SyncPanel.tsx:1704 shows "Backing up…" whenever `syncInProgress`, which now includes the background copy) were read, not seen.
- Settings-file fuzz covered truncation only (one realistic file); non-truncation corruption was spot-checked with two cases.
- Scratch work: /tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/backup-review-2/ (w/ = experiments, m/ and d/ = mutation copies).
