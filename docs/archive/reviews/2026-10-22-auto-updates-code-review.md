# Auto-updates (#183) — code review

Branch `session/183-auto-updates` (youcoded, 48 files; youcoded-admin `skills/release/`, 2 files) against `origin/master`. Reviewer saw only the diff, the contract rows, the rules and PITFALLS. Nothing was fixed or committed.

## verify.sh summary (`bash scripts/verify.sh youcoded`, run once)

```
NOTE  master has new commits touching files this branch changed — merge it in and check for duplicate work:
        e2d44338b hooks: keep the hook socket out of /tmp and re-create it if deleted
verify: .../youcoded (base origin/master)
  tests: related to 48 changed file(s) + 84 source-scanning guards + 3 naming a changed/deleted data file
PASS  types (tsgo --noEmit)
PASS  types in tests/ (tsgo --noEmit, 0 file(s) still excluded)
PASS  tests (related)
PASS  dead code (knip)
PASS  lint (oxlint)
PASS  design lint (oxlint --max-warnings ratchet)
PASS  invariants (ast-grep)
```
Android/Worker untouched. youcoded-admin's own test was not run (it reads a file in the app repo; not run here). Nothing here was run on macOS, Windows or an AppImage: every install-path finding is from reading code, and says so.

## Findings (most severe first)

- F1 — desktop/src/main/update-service.ts:1033-1056 (`planRestart`) and :973-989 (`buildPlan`) — On a Mac that needs a password, Restart asks for the password and quits, then silently reopens the OLD version if the staged copy has gone missing. `planRestart` only re-hashes the disk image; it never checks the staged app exists. The password-case copy lives in `$TMPDIR` (update-staging.ts:117), which macOS clears of files untouched for days, and `pending` is only checked for the staged copy once at startup (`loadPending` :561-564). If it vanishes mid-session: `startMacRootHelper` succeeds, then `buildPlan` returns null (:979), `runExitInstall` relaunches with no plan (:1021), and the root helper later finds no staged app and quits. The person typed a password for nothing and gets no message. Confirmed by reading the call chain (no test covers "staged copy gone before Restart"); the macOS purge itself is PLAUSIBLE.

- F2 — desktop/src/main/update-exit.ts:104-135 (`MAC_HELPER_SCRIPT`, root mode) — The root helper can be tricked into installing an unsigned app, because it checks the staged app by path and then moves it by path. The folder `$cleanup` sits in the user-writable `$TMPDIR`; chowning it to root does not stop the user renaming it (rename needs the parent's write permission). A same-user process can swap a different folder into that path between `codesign --verify` and `mv "$staged" "$old"`, and root then moves the swapped app into `/Applications`. Also `chmod 700 "$cleanup"` and `chown -R -h "$staged"` follow a swapped parent component. The `-L` checks (:112) narrow the window but do not close it. Needs a local process running as the user, so it is a privilege-escalation hole, not a remote one. PLAUSIBLE (read only; not run on macOS). Safer shape: stage under a root-owned directory, or verify and move from the same directory handle.

- F3 — desktop/src/main/update-settings.ts:~62 (`readAsync`) with update-service.ts:323-327 (`readAutoInstallInto`) — Someone who turned the switch off can be silently turned back on. `readAsync` turns ANY read error (a locked file on Windows while the dev instance holds the config lock, a half-written file) into the defaults, which include `autoInstall: true`, and `readAutoInstallInto` applies that to the memory cache on every release check (`refreshAutoInstall`, :833). The next check then downloads 150 MB and a plain quit installs it, against the person's saved choice. Only a missing file should read as "on"; a failed read should keep the previous cache. Confirmed by reading; the failing read itself is PLAUSIBLE.

- F4 — desktop/src/main/update-release-status.ts:178-188 (`readReleaseStatus`) — Contract R13 says apps "stop offering" a release whose signed list was removed, but they keep offering it. `update_available` depends only on the version and an installer being attached, never on `youcoded-release.json` being present (the existing test at tests/update-release-status.test.ts:81-84 even pins a partial release as offered). After the brake the chip still says "Update available", "Update now" downloads 150 MB, then fails with signature-invalid and the "update didn't download" notice. Only an already-downloaded copy is dropped (runBrake). The new `release` skill section (SKILL.md step 3) repeats the claim "apps refuse". On the beta channel `selectRelease` (:150-153) also still picks the pulled beta as the highest version, so a lower good beta is never offered. Confirmed by reading and by the test above.

- F5 — desktop/src/renderer/components/UpdatePanel.tsx:~474-480 — The popup line "Downloaded. Installs by itself the next time you quit YouCoded." is shown in cases where a quit will NOT install. `install_refused` (Mac refused swap, AppImage in a read-only folder, Linux tarball) is sent in the status (update-service.ts:486) but nothing in the renderer reads it (rg `install_refused` in src: main only). The same is true when staging failed (disk full, a Mac copy that failed its signature check: `stageVerified` swallows the error, :670) and after two failed attempts (`MAX_FAILED_ATTEMPTS`, :914). Contract R15 says quitting does not install on the refused Mac, yet the popup and the chip tooltip say it does. Confirmed by reading; also the line shows the "by itself" wording while the switch state is still loading (`autoInstall === null`).

- F6 — desktop/src/main/main.ts:~2022-2027 (`runShutdown` 6 s race) with update-service.ts:995-1012 (`prepareExit`) — Restart can end by reopening the old version with no message. The teardown wait is capped at 6 s, but `prepareExit` caps only the brake (3 s); the re-hash of a 150-180 MB file (`buildPlan` → `rehash`) is uncapped and runs again here even though `planRestart` already did it. If it is not done when teardown finishes, `preparedPlan` is still null at will-quit, so `runExitInstall` just relaunches (:1021). Same outcome if the 10-minute brake answer expired while the close prompt was open and the 3 s fetch times out. Slow disk plus large file makes this plausible; PLAUSIBLE (not timed).

- F7 — desktop/src/renderer/components/UpdatePanel.tsx:356-360 with :46 and :71 — A failed Restart is shown as "The installer didn't start." and a thrown error with no code becomes `network-failed` (`downloadErrorCode` default). The real cause in the common case is "could not confirm this release is still current" (planRestart, update-service.ts:1048) or a password-helper failure, neither of which is an installer problem. This is the invented-error-cause the workspace rules forbid (docs/error-message-standards.md). Confirmed by reading the mapping.

- F8 — desktop/src/main/update-service.ts:830-840 (`onCheckSucceeded`) with :787-803 — A download that keeps failing is retried on every 30-minute check with a full new download. Only `signature-invalid` sets `brakedTag`; `verify-failed` (file deleted, :727), `disk-full` and a size mismatch all retry from zero, forever, for a switch the person never touched. A bad CDN copy or a full disk means ~180 MB every half hour on a metered line. PLAUSIBLE (no test for repeat failures).

- F9 — desktop/src/main/update-service.ts:819-827 (`sweepIfDue`) — The sweep checks `inFlight` once, then awaits directory reads; a popup "Update now" started during the sweep gets its `.partial` file deleted by `cleanupStaleDownloads` (it removes every `.partial` unconditionally, update-installer.ts:~371). The sweep is awaited in `onCheckSucceeded` before `runBackground` but not before `download()`. Low odds (once per launch). PLAUSIBLE.

- F10 — desktop/src/main/update-exit.ts:98 and :110-114 — Two cleanup gaps in the Mac helper. After the 24 h wait it does `exit 0` without removing the staged app (180 MB left in `$TMPDIR` or hidden beside the bundle until the next sweep). And a go file left by a helper that died is not in the sweep's keep list but is only swept after the first successful release check (`sweptOnce`), so a quit before then lets a NEW helper start on a stale "go" and swap on a quit the person did not make an install quit. PLAUSIBLE.

- F11 — desktop/src/main/update-service.ts:404-416 (`launch`) with update-restart.ts:23-27 — In `finishInteractive`, when `shuttingDown()` is true after a successful interactive install (`quitPending: true`), `launchActive` stays true and nothing quits, so every later Restart in that session answers "busy". Rare (a shutdown starting at that instant). Confirmed by reading.

- F12 — desktop/src/main/update-service.ts:1087 (`hasPending`) — Dead: no caller in src and no test (rg over src and tests). `loadAutoInstall`, `refreshAutoInstall`, `autoInstallEnabled` are also returned from the service but only used inside it. The WHY comment at :328-329 says "T2 calls this at startup", but nothing calls `loadAutoInstall` at startup (`startInit` does not), so until a check or the Help popup reads the file the cache is the default `true`. Knip does not flag object members. Confirmed by rg.

## Contract rows

All 16 rows are `live-app`, `deck` or `human` with no `guard`, so there is no mechanical guard to compare against. Rows with no or contradicting implementation: R13 (F4), R15 (popup still tells the person quit installs, F5). R7/R8/R16 are implemented as stated in code (password only through `startMacRootHelper` on Restart); not run on a Mac. R10/R11 (close prompt, X cancels) are implemented through `close-request-manager` `CANCEL` and read correct.

## Rules checked

performance.md rule 1: new sync calls are only in `runExitPlan`, allowlisted with reasons; the stale-download and cache lookups moved to async; no new sync read on a click path. Rules 2/3: `watchProgress` subscribes while closed only when downloading; `useAutoInstall` is a selector store. renderer-lists: no lists added. IPC parity: `getAutoInstall`/`setAutoInstall` forwarded in remote-shim; `restartToUpdate` desktop-only stub; parity tests pass. No findings against those rules.

## Not covered (out of budget or not testable here)

- Nothing was run on macOS, Windows or a real AppImage. Not checked: whether macOS App Management blocks `/bin/sh` from replacing a signed app in `/Applications`; whether `mv` across volumes (password case) keeps every extended attribute the signature needs; Electron's `app.relaunch()` from inside an AppImage mount (the old installer path did the same).
- Windows: the NSIS installer is spawned at will-quit while the app process is still alive (update-exit.ts:51-57); whether the electron-builder installer waits for the app to exit was not checked.
- update-staging.ts hdiutil/ditto argument details, `linux-install-kind`, and the workbench mock-shim changes beyond the diff skim.
- The tests themselves were not audited for whether they test what their names say (only the guards the rules name).
- Design disagreement, one line: "Update now" with the popup open now chains straight into Restart (and on a password machine, into the password box) after a long download, which may surprise someone who walked away; the contract's R8 reads as if they must press Restart to update.

## Triage (implementing session, 2026-10-22)

- F1 accepted — Restart on a password Mac first checks the staged app exists (re-stages, or falls back to the disk image) before asking for the password.
- F2 accepted — the root helper copies the staged app into a root-owned folder it creates, then verifies and moves that copy; nothing user-writable is trusted after the check.
- F3 accepted — only a missing config file reads as "on"; a failed read keeps the last known value.
- F4 accepted — a release with no signed file is no longer offered (stable and beta); the beta listing skips it and offers the next good one. The release skill's claim becomes true; its wording is checked.
- F5 accepted — the popup's "installs by itself" line shows only when a quit really will install (switch on, not refused, staged, under the failure limit, switch state known); otherwise the approved "Restart when you are ready." line.
- F6 accepted — the quit prepare reuses Restart's re-hash, and its whole run is capped inside the teardown window; a Restart whose plan is not ready says so instead of reopening the old version silently.
- F7 accepted — Restart failures map to their real cause or to the general error (Report bug / Diagnose); no invented installer or network cause.
- F8 accepted — repeated download failures back off (no full re-download every 30 minutes).
- F9 accepted — the sweep and every download share one lock.
- F10 accepted — the helper removes its staging after the 24 h wait; stale go files are removed at startup before any helper can start.
- F11 accepted — the launch lock is released when a shutdown takes over.
- F12 accepted — dead `hasPending` removed; `loadAutoInstall` called at startup as its comment says, and the extra service members trimmed.
- Design note accepted — "Update now" continues straight into Restart only when the popup is still open and no password is needed; otherwise it lands on the Ready state and the person presses Restart to update (R8).
