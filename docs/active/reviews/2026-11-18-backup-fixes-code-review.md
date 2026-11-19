---
status: active
date: 2026-11-18
topic: Independent code and regression review of session/backup-fixes-2026-11-18 (backup fixes, 5 commits over origin/master)
---

# Backup fixes: independent code review

## Verdict: safe after listed fixes (none is a data-loss path; one is a real lock race)

I found no path that deletes or overwrites a user's backup data, loses the backup list, or writes a day marker for a day that did not complete. The "unreadable config is never written back" and the "marker only when every copy landed" claims held under test and under 20 mutations. Items to fix before landing: F1 (lock steal race), F2 (phone gate is UI-only for adding), F3 (empty-file inconsistency). The rest are low severity or test gaps.

RAN = executed here. READ = code reading only.

## Findings

### F1 (medium, READ) Two processes can both reclaim a stale lock and one deletes the other's live lock
sync-service.ts `acquireLock` / `lockIsStale` (diff lines around the "Move it aside" step). The comment says "only one process can win that" rename. That is true for the first rename only. Sequence: A and B both judge the old lock stale. A renames it aside, creates a new lock and starts writing its pid. B (already past its stale check) now renames `lockDir` aside, which is A's brand-new live lock, deletes it, and makes its own. Both pushes then run at once. Needs two processes starting a backup within milliseconds on a leftover lock, e.g. the real app and a dev instance after a crash. Outcome is two overlapping personal pushes (duplicate copy work, possible Drive rate errors), not data loss, because rclone copy is additive. Fix: after the rename, check that what you moved aside is the stale one (read its pid/started from the moved folder; if it is not stale, rename it back or abort), or reclaim by renaming to a name that includes the stale lock's owner token.

### F2 (medium, READ + grep) The phone gate for ADDING a Drive or GitHub backup is only in the screens
`sync:add-backend` (ipc/sync.ts:70 -> `addBackend`) accepts any type on any device, including from the remote web UI or a phone. grep of every caller found only SyncPanel and the wizard. Result if called anyway: an entry is saved, shows the honest "not available" row, nothing is copied. No loss, no lie, but "offered nowhere" is not enforced in the backend. `installRclone`, `pushBackend`, `push`, `targetForBackend`, `autoDetectBackend` ARE enforced in the backend. Fix: refuse `drive` (when `isRunningOnPhone()`) and `github` (everywhere) in `addBackend` with a plain message. I found no assistant tool or deep link that adds a backup.

### F3 (low-medium, READ) A zero-byte config.json is "empty" for the backup code but "damaged" for first-run
`readConfigStrict` (sync-state.ts) treats empty text as empty config. `markSetupCompleted` (first-run.ts) runs `JSON.parse('')`, throws, and refuses to write `setup_completed`. A zero-byte file is the most likely leftover of the old non-atomic write, so this user keeps the old "setup state alone" fragility, and the log says "damaged" for a file the other code calls fine. Make both treat empty as empty.

### F4 (low, READ) Recovery from a really damaged config.json has no path
For a damaged (not empty, not missing) file: the backup list shows empty, and add / remove / pause / save all fail with "The saved backup settings couldn't be read, so nothing was changed." Accurate and plain, and nothing is destroyed, but the user cannot fix it from the app (no reset, no "copy aside and start fresh"). A user will likely read "no backups" as "they were wiped." Acceptable for an invisible-safety fix; worth a card (offer to move the file aside to config.json.damaged-<date> and start fresh, with consent).

### F5 (low, READ) A missing space folder now counts as success
daily-backup.ts: `rootExists` false -> log line and `continue`. Intended for a deleted project. Side effects: an unmounted external drive or a folder not created yet is skipped silently, the day can be stamped complete, and "Back up now" says finished. The old behaviour (fail every hour) was the bug being fixed, so this is a trade; consider failing only when the root's parent is also missing, or reporting skipped spaces in the result. The old test that pinned "a failing space blocks the day marker" was rewritten (see test verdict) and the new one still pins that a real copy failure blocks the marker.

### F6 (low, READ) "Back up all now" can answer success with nothing copied on a phone with only a Drive entry
`forceSync` returns success:true, "No backends configured" when every enabled entry is skipped. The screen hides the button in that state (new `anyActive` rule), so a user cannot hit it; a remote-browser or assistant caller can. Same for the old behaviour when no backend is enabled. `pushBackend` is fixed (returns "Nothing was copied."), `forceSync` is not.

### F7 (low, READ) Spaces-copy warnings from Back up now can be cleared by the next hourly personal push
`copySpacesTo` writes a red warning per destination; `clearBackendFailures` (hourly push success) clears all warnings for that backend id, including the spaces one, while conversations still fail. The failure is shown once and then disappears; the daily timer's failures still only go to the log. Not a lie, but not durable.

### F8 (low, READ) A lock held by a recycled live pid blocks backups for up to 24 h silently
By design (LOCK_STALE_MS). Hourly pushes log "another sync is running"; a manual "Upload now" says "Upload hasn't run yet - try again in a moment." for up to a day. Before: forever. Accepted trade-off, but the screen text is misleading for that case.

### F9 (info) forceSync / pushBackend answer success:false with error '' when a push is already running
Pre-existing; the screens handle empty error ("hasn't run yet"). Note the spaces copy still runs afterwards.

## Specific questions answered

- **runNow vs timer vs marker (RAN via tests + mutations M1-M6; READ for the rest).** Timer skips while any run is active; a manual run waits for the active one; runNow never writes the marker; hourly check finishes the rest and writes it only when no failure. Crash mid-run leaves no marker. One destination failing: marker withheld, finished destinations remembered in `done`. A paused destination named by the user is copied but not stamped. Two destinations: independent. OK.
- **Single-flight guard.** The run body catches everything and returns `{ok:false}`, so joiners cannot hang and cannot get a false success; `track()` clears `active` in `finally`. Joiners are keyed by destination set, so different sets queue behind each other correctly (each waits for the previous tail).
- **Async lock conversion.** `stop()` does `void releaseLock()`; if the process exits first the folder is left behind, and the next start reclaims it (dead pid) at once. No unawaited-promise hazard found. The same-pid rule ("ours only if this service holds the token") is right for pid reuse after reboot.
- **Dev + real app sharing a lock file.** Different pids, both alive: not reclaimed under 24 h. Not stealable except via F1.
- **Atomic write.** Same-directory temp + rename, retries EPERM/EACCES/EBUSY on Windows, removes temp on failure, so a full disk leaves the old file. Cross-device cannot occur (same dir). Not run on Windows (UNVERIFIED).
- **"Sign in again" (RAN, throwaway RCLONE_CONFIG in the scratchpad, no browser, no network).** `rclone config update gdrive` (rclone 1.75.1) with stdin closed starts the local sign-in server, prints "Waiting for code...", and leaves the existing remote, its token and the other remote untouched while waiting. `config update` on a missing remote errors ("couldn't find type field"); the code's `config create` branch handles that. So the claim holds for the waiting/cancel case. A completed sign-in was NOT run (no real login). Wrong-entry repair: the wizard resolves the remote from the clicked entry id, so two Drive entries repair the right one. Name differing: `updateBackend` points the entry at the new name. Entry removed meanwhile: refused, not resurrected.
- **Phone detection.** `setRunningOnPhone(true)` is only called in headless-boot.ts, whose only launcher is the Android BackendService (headless-main.ts says a laptop run by hand is possible, which would also flip it; acceptable, never in main.ts). A phone paired to a computer talks to the computer's backend (flag false) and keeps Drive. Existing phone Drive entries: data and settings untouched, shown "Not available on this phone" with Remove, old red warnings cleared on each push.
- **Computer regressions.** No change found for add/remove/pause, wizard, add-another-account (no `existingRemote` passed -> the old `gdrive2` path), iCloud, the GitHub row (same sentence kept word for word), workbench mock. Remote-shim timeout for `pushBackend` raised to 10 min (matches force). "Back up now" taking longer is the intended change.
- **User-facing text.** All new strings plain and accurate. "The backup service is still starting up." is only true if startup has not finished; `backup` is created in `startSyncSpaces` on both boot paths, so it is accurate in practice. "Nothing was copied." alone is vague but invents no cause.

## Test-weakening verdict
- `first-run-chatgpt.test.ts`: one assertion reversed on purpose (the old test pinned "forceStep alone demotes a finished install back to first-run", which is the bug being fixed; the new one pins the opposite). Other edits only add `await flushFirstRunWrites()`. Not weakened.
- `sync-spaces-daily-backup.test.ts`: the old "a space with a missing folder fails the copy" case was replaced by "skipped, carries on". Intended by D-7; real failures still pinned. Judged fine, but see F5.
- `main-blocking-calls.allowlist.json`: only removals (shrink-only rule respected).
- `buddy-helper-states.test.tsx`: adds `waitFor` for an async state; strengthens, no assertion removed.

## Mutation table (scratch copy, 8 relevant test files, baseline 153 pass)
| # | Mutation | Result |
|---|---|---|
| M1 | timer no longer skips while a run is active | killed |
| M2 | missing-folder skip removed | killed |
| M3 | same-destination manual runs no longer join | killed |
| M4 | manual run no longer waits for the active run | SURVIVED (test gap: nothing checks manual-vs-timer overlap) |
| M5 | marker written even when incomplete | killed |
| M6 | manual run honours `done` (no re-copy) | killed |
| M7 | 24 h lock age limit removed | killed |
| M8 | same-pid-not-ours reclaim removed | killed |
| M9 | release not owner-checked | killed |
| M10 | dead owner not reclaimed | killed |
| M11 | any read error of config.json treated as empty | SURVIVED (read-error branch untested; the parse-failure branch is) |
| M12 | first-run overwrites a damaged config | killed |
| M13 | GitHub push answers ok | killed |
| M14 | phone Drive target allowed | killed |
| M15 | Sign in again uses the create path | killed |
| M16 | phone Drive filter in push removed | killed |
| M17 | skipped backup counted finished | killed |
| M18 | spaces failure ignored in forceSync | killed |
| M19 | installRclone phone guard removed | killed |
| M20 | `syncSpacesBackupNow` catch answers ok | survived, equivalent (runNow already never throws; dead code) |
No test covers F1, F2 or F3.

## verify.sh
Run from the workspace root against the youcoded checkout: types, types in tests, related tests (31 changed files + 91 source guards), knip, lint, design lint, ast-grep, screens open, journeys all PASS. "OK - all checks passed." Android and the marketplace worker are not covered. Note printed: master has a new commit touching changed files (8d04f32ca, "Phone: pasting a picture attaches it over remote"); merge before landing.

## Untested / UNVERIFIED
Windows rename and tasklist behaviour; a completed Drive sign-in; a real backup run; F1 race (reasoned, not reproduced); remote-browser flows on a real phone; the Android Kotlin side.
