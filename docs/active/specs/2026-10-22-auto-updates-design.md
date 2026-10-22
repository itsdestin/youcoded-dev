---
status: active
card: 183
contract: docs/active/design/2026-10-22-auto-updates/auto-updates.contract.json
branch: session/183-auto-updates (youcoded + youcoded-dev)
---

# Automatic updates — technical design

The UI is built and approved (the contract, 16 rows). This document is the backend behind it.
Everything reuses the existing updater in `desktop/src/main/update-*.ts`; nothing is a new
download or verification engine.

## What exists today (read before changing)

- `update-service.ts` — release check every 30 min (`getUpdateStatus`), beta channel,
  `download()` (renderer-initiated, single job, into `userData/update-cache`), `launch()` which
  verifies against the signed manifest (`verifyBeforeLaunch`) and then runs the platform
  installer via `makeLaunchInstaller`.
- `update-installer.ts` — download engine, `findCachedDownload`, and the launcher: Windows NSIS
  (detached, interactive), Mac `open -W` on the DMG, Linux AppImage rename-over-self + relaunch,
  Linux packages via `pkexec` (password box) + relaunch, manual-command fallback.
- `update-manifest-verify.ts` — Ed25519-signed manifest; a release without one is refused.
- `update-settings.ts` — `~/.youcoded/config.json` → `updates.betaChannel`, locked writes.
- Quit: `shutdownApp()`/`runShutdown()` in `main.ts` is the ONE teardown route (before-quit,
  window-all-closed, SIGTERM/SIGINT). Close prompt: `close-request-manager.ts` +
  `window:close-request` push, answered by `window:answer-close`.

## Changes

### 1. Setting: `updates.autoInstall` (default on)

`UpdateSettings` gains `autoInstall: boolean` (absent/unreadable ⇒ `true`), `setAutoInstall()`
with the same validate-then-locked-mutate shape as `setBetaChannel`. Channels
`update:get-auto-install` → `{ enabled }` and `update:set-auto-install` `(enabled)` →
`{ enabled }`. Host settings like the beta channel, so they are NOT `desktopOnly`; remote-shim
forwards them over the socket. Android's backend has no in-app updater: the service answers
only where `process.platform` is win32/darwin/linux AND `app.isPackaged`-or-dev — on Android the
headless backend reports `unsupported`, and the renderer's capability check hides both rows
(`useAutoInstall` already returns null when the method is absent or rejects).

Turning it ON triggers a background download if an update is waiting (§2). Turning it OFF does
not delete a file already downloaded (deck R-6 risk line: "turning it off stops the next ones,
not this one"); the popup then reads "Restart when you are ready" and quitting does not install.

### 2. Background download (auto-download)

After every successful release check (`parseReleaseResponse` setting an `update_available`
status) and at startup, when `autoInstall` is on, `ensureDownloaded()` runs:

1. `findCachedDownload(cacheDir, latest)` — already there? verify it (step 3) and stop.
2. Otherwise `installer.startDownload(download_url)` — the existing engine, single-job, so a
   popup "Update now" press coalesces with it. Progress events still broadcast (harmless; the
   popup shows them if open).
3. Verify immediately against the signed manifest (`verifyDownloadedUpdate`). Pass ⇒ record
   `verified = { version, filePath }` in memory. Fail ⇒ delete the file; `signature-invalid`
   (no manifest — the brake, §5) is NOT retried until the next check; network failures retry at
   the next 30-minute check. Never more than one attempt per check.

Guards: never in an unpackaged build unless `YOUCODED_DEV_FAKE_UPDATE=1` (dev keeps its fake
installer path); never on a metered/battery check (no: Electron cannot tell metered reliably —
out of scope, noted). `cleanupStaleDownloads` already deletes files older than 24 h at startup;
it must now skip the file matching the current `latest` (else a two-day-old download is deleted
and re-downloaded every launch).

### 3. Status: `downloaded` and `needs_password`

`getUpdateStatus()` adds:
- `downloaded: true` when `verified.version === status.latest` and the file still exists.
- `needs_password: true` when installing this computer needs an administrator:
  - Linux package installs (`linuxInstallKind()` is deb/rpm/pacman).
  - macOS when the running `.app` bundle (`path.resolve(app.getPath('exe'), '../../..')`) or its
    parent folder is not writable by this user (`fs.promises.access(…, W_OK)`), computed once at
    startup off the hot path and cached.
  - Never Windows (per-user NSIS one-click install) and never AppImage (an unwritable AppImage is
    the existing `appimage-not-writable` error, shown as today).

The status poller already pushes status changes to every window; the renderer (StatusBar,
UpdatePanel) already reads both fields (workbench-built).

### 4. Installing

One function, `installVerified({ relaunch })`, used by both quit and Restart. It always
re-checks first (§5). Per platform:

| Platform | How | On quit (no password) | On Restart |
|---|---|---|---|
| Windows | the downloaded NSIS installer, `/S --updated` (silent, electron-builder's own update flags) spawned detached | spawned at the end of shutdown, no `--force-run` | spawned with `--force-run` (NSIS relaunches the app), then quit |
| macOS, writable | mount the DMG read-only (`hdiutil attach -nobrowse -readonly -mountpoint <tmp>`), `ditto` the `.app` to a staging folder beside the bundle, detach; a detached `/bin/sh` helper waits for our pid to exit, then swaps (`mv` old aside → `mv` staged in → `rm -rf` old) and, for Restart, `open`s the new app | staged + helper at end of shutdown | same, then quit |
| macOS, needs password | same staging into a temp folder the user owns; the swap runs through `osascript -e 'do shell script "…" with administrator privileges'` — the Mac's own password box — BEFORE quitting | never (R15) | password box → swap → relaunch. Cancel/failure ⇒ open the DMG as today (R16) |
| Linux AppImage | existing rename-over-self | rename at end of shutdown, no relaunch | rename + `app.relaunch()` (existing) |
| Linux package | existing `pkexec` path (password box) | never (R8) | existing pkexec + relaunch; cancel = `install-cancelled`, shown as today |

Quit-time install rules:
- Only when `autoInstall` is on, a verified download exists, `needs_password` is false, the
  app is packaged, and the quit was a person's quit (before-quit / window-all-closed). NOT on
  SIGTERM/SIGINT, and not after `powerMonitor` `shutdown` (Windows logoff / OS shutdown) — an
  installer racing an OS shutdown can leave a half-written app.
- Runs as the LAST step of `runShutdown()`, after sessions are destroyed and windows are gone,
  so nothing the person sees waits on it. The re-check (§5) is capped at 5 s and runs in
  parallel with the existing teardown; a timeout means "don't install this time".
- Spawned children are `detached` + `unref`ed so the app process can exit.

Restart to update (`update:restart-to-update`, `desktopOnly`):
1. Count active sessions across all windows (`windowRegistry`). If any, ask the MAIN window's
   renderer through the existing close-request queue with a new `reason: 'update'` on the push
   (the renderer already renders the reworded prompt from it). Answer `close:false` ⇒ return
   `{ restarting: false }`, nothing happens (R11).
2. `close:true`: if `reopen` is false, untrack every owned session (same effect as
   `applyCloseAnswer` per window); then `installVerified({ relaunch: true })`.
3. Password platforms run their password step BEFORE quitting, so a cancel leaves the app
   running with the popup in its normal Ready state (Linux: existing `install-cancelled`
   ErrorState; Mac: DMG fallback, R16).
4. Return `{ restarting: true }`; the renderer shows "Restarting YouCoded…" until the process
   goes. Then `app.quit()` → normal shutdown (sessions stay tracked per step 2).

"Update now" with the switch off (not downloaded): keeps today's single press — the popup
downloads (existing progress UI), then calls `restartToUpdate()` itself, so the result is the
same restart path instead of today's interactive installer.

### 5. The brake

Admin side (youcoded-admin, a short procedure in its release skill): to pull release vX.Y.Z,
delete the `manifest.json` + `manifest.json.sig` assets from that GitHub release and mark it not
latest (or, for a beta, delete the release). Optional notice through the announcement chip
(R14) — no app code.

App side:
- A release without a manifest is already refused at verify time (`signature-invalid`), so a
  pulled release is never downloaded-and-trusted after the pull.
- Before ANY install (quit or Restart) `installVerified` forces a fresh release check
  (`fetchLatestRelease`, cap 5 s) and re-fetches + re-verifies the manifest. If `latest` no
  longer equals the downloaded version, or the manifest is gone ⇒ delete the file, clear
  `verified`, do not install (R13). Restart then shows the popup's current state (up to date, or
  the older/newer version on offer).
- A pulled release that a person already installed is not rolled back (out of scope; the
  announcement chip is the remedy, R14).

### 6. Renderer and bridge

- `preload.ts` / `remote-shim.ts` / `backend-contract.ts`: `update.getAutoInstall`,
  `update.setAutoInstall`, `update.restartToUpdate`. remote-shim forwards the two settings and
  stubs restart as `{ restarting: false }` (`remote-unsupported`), like `launch`.
- `CloseRequestPush` gains optional `reason?: 'update'`; App.tsx already passes it to
  `QuitSessionsPrompt`.
- Delete the three `MOCK_ONLY` rows; the workbench mock keeps its hand-written versions (now
  mirroring real channels).
- UpdatePanel: already built against these shapes, plus the Update-now path in §4 and the fix
  below.

### 7. A download survives closing the popup (Destin, 2026-10-22, chat)

Bug today: "closing the popup after pressing download seems to revert to 'download?' state and
cancel update". Confirmed in code: UpdatePanel's close effect calls `update.cancel(jobId)` and
resets to idle on purpose (2026-04-22 design, written when the popup was the only owner of a
download). Now main owns downloads (§2), so:
- Closing the popup no longer cancels; the download keeps going in main.
- Main exposes the in-flight job: `update:get-cached-download` (existing, desktopOnly) is widened
  to also report `{ downloading: { jobId, percent } }` when a job is active, so reopening the
  popup shows the same "Downloading… 45%" button state it had, then Ready when it finishes.
- No new UI: the button states already exist. The chip keeps saying "Update available" while
  downloading (approved risk line on R-1).
- Remove the `abortedRef` close-guard; a download finishing while the popup is closed lands as
  `downloaded` through the status push.

## Data shape

`config.json`: `{ "updates": { "betaChannel": bool|null, "autoInstall": bool } }`.
`UpdateStatus` += `downloaded?: boolean; needs_password?: boolean`.
No new files on disk besides the existing `update-cache/` (and a transient Mac staging folder
`<bundle parent>/.YouCoded-update-<version>.app` or `$TMPDIR/youcoded-update-*`).

## Performance

All new work is in main and async: no `*Sync` on any path a timer, quit or IPC reaches
(`main-blocking-calls.test.ts`). The existing `cleanupStaleDownloads`/`findCachedDownload` use
sync fs and run at startup and in an IPC handler today — the new callers use async variants
(`fs.promises`) rather than widening the allowlist. Background download is one HTTPS stream,
progress throttled as today.

## Tests (pins)

- `update-settings` autoInstall default/validation/round-trip.
- `ensureDownloaded`: autoInstall off ⇒ no download; cached+verified ⇒ no download; verify
  failure deletes the file; signature-invalid not retried within a check.
- Status: `downloaded` only for a verified file of `latest`; `needs_password` per platform kind.
- Quit install: not on SIGTERM, not after OS shutdown, not when off, not when needs_password,
  not unpackaged; brake re-check failing ⇒ no install and file deleted.
- Restart: sessions open + cancel ⇒ `{restarting:false}`, no quit; password cancel ⇒ app keeps
  running; per-platform argv (Windows `/S --updated --force-run`, Mac helper script content,
  AppImage rename).
- UpdatePanel: closing mid-download sends no cancel; reopening shows the job's progress (§7).
- IPC parity (`ipc-channels.test.ts`, `update-install-ipc.test.ts`), mock-shim contract.

## Not in scope

Delta/differential updates; rollout percentages (separate card); rolling back an installed
pulled release; metered-network detection; Android (Play Store / APK).
