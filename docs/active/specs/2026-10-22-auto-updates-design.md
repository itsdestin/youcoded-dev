---
status: active
card: 183
contract: docs/active/design/2026-10-22-auto-updates/auto-updates.contract.json
branch: session/183-auto-updates (youcoded + youcoded-dev)
reviews: docs/active/reviews/2026-10-22-auto-updates-design-review-1.md
---

# Automatic updates — technical design (rev 2, after review 1)

The UI is built and approved (the contract, 16 rows). This document is the backend behind it.
Everything reuses the existing updater in `desktop/src/main/update-*.ts`. `Dn` marks a change
made for review-1 finding n.

## What exists today

- `update-service.ts` — release check every 30 min (`getUpdateStatus`), beta channel,
  `download()` (renderer-initiated, single job, into `userData/update-cache`), `launch()`, which
  verifies against the signed release file (`verifyBeforeLaunch`) and then runs the platform
  installer via `makeLaunchInstaller`.
- `update-installer.ts` — download engine, `findCachedDownload`, `cleanupStaleDownloads`, and
  the launcher: Windows NSIS (detached, interactive), Mac `open -W` on the DMG, Linux AppImage
  rename-over-self + relaunch, Linux packages via `pkexec` + relaunch, manual-command fallback.
- `update-manifest-verify.ts` — Ed25519-signed release file `youcoded-release.json` (+ `.sig`)
  listing each asset's SHA-256; a release without one is refused.
- `update-settings.ts` — `~/.youcoded/config.json` → `updates.betaChannel`, locked writes.
- Quit: `shutdownApp()`/`runShutdown()` in `main.ts` is the ONE teardown route (before-quit,
  window-all-closed, SIGTERM/SIGINT, app-restart relaunches). Close prompt:
  `close-request-manager.ts` + `window:close-request`, answered by `window:answer-close`.

## 1. Setting: `updates.autoInstall` (default on)

- `UpdateSettings` gains `autoInstall` (absent/unreadable ⇒ `true`) and `setAutoInstall()`,
  validated then written through the existing locked mutate. The service caches the value in
  memory at startup (async read) and writes through on set — no sync read on any check or quit
  path (D18).
- Channels `update:get-auto-install` → `{ supported: true, enabled } | { supported: false }`,
  and `update:set-auto-install (enabled)` → same shape. `supported:false` wherever there is no
  in-app updater: Android's headless backend and an unpackaged build without
  `YOUCODED_DEV_FAKE_UPDATE` (D16). The renderer hook maps `supported:false`, a missing method
  and a rejection all to `null` (row hidden).
- Allowed from a paired phone, like the beta channel (D17 rejected: R1 is one setting kept in
  sync everywhere). The pinned phone-allowed list in `channel-table-families.test.ts` gains
  both; `update:restart-to-update` is `desktopOnly`.
- Turning it ON schedules a background download (§2). Turning it OFF keeps any file already
  downloaded (deck R-6 risk line); the popup then reads "Restart when you are ready" and
  quitting does not install.

## 2. Downloading: one owner

The service owns every download through one function, `ensureDownloaded(reason)` (D14):

- It returns the in-flight promise when one exists; the popup's "Update now" awaits the same
  promise (so there is no second job and no `busy`).
- Background callers: after each successful release check, and on turning the switch on —
  only when `autoInstall` is on. The first background run waits until 60 s after the first
  window is ready, so it never competes with startup and session restore (D19).
- Steps: (1) a verified file for `latest` already recorded? done. (2) A file on disk named for
  `latest` (`findCachedDownload`, made async — D18)? verify it. (3) Otherwise download with the
  existing engine. (4) Verify with `verifyDownloadedUpdate` against THAT release's own signed
  file. Pass ⇒ record `pending = { version, tag, manifestUrl, signatureUrl, filePath }` in
  memory and in `update-cache/pending.json` (D13). Fail ⇒ delete that file; `signature-invalid`
  (no signed file — the brake) is not retried until the next check; network failures retry at
  the next check.
- A newer release appearing while an older one is `pending` downloads the newer one; the older
  file is deleted only after the newer has verified (D13).
- Cancel (the popup's existing button while downloading) stops the job and suppresses background
  downloads until the next check.
- `cleanupStaleDownloads` runs after the first check (not at startup), async, and never deletes
  the `pending` file or a file for the current `latest` (D15).
- Never downloads in an unpackaged build unless `YOUCODED_DEV_FAKE_UPDATE=1` (pinned, D26).

### Closing the popup no longer cancels (Destin, 2026-10-22, chat)

Today closing the popup cancels the download and resets the popup ("closing the popup after
pressing download seems to revert to 'download?' state and cancel update"). UpdatePanel's
close effect stops calling `update.cancel` and stops resetting a download. On open, the popup
reads `update:get-cached-download`, widened to also return `{ downloading: { percent } }` while
a job runs, so it shows the same "Downloading… 45%" button it had; a download finishing while
closed arrives as `downloaded` through the status push. No new UI.

## 3. Status: `downloaded` and `needs_password`

`getUpdateStatus()` adds:
- `downloaded: true` when `pending.version === status.latest` and the file exists (existence
  is checked asynchronously when `pending` is set and on each check, not in the getter).
- `needs_password: true` when installing needs an administrator, computed once at startup,
  async:
  - Linux package installs (`linuxInstallKind()` is deb/rpm/pacman).
  - macOS when the `.app` bundle or its parent folder is not writable by this user.
  - Windows when the install folder (the exe's directory) is not writable — a per-machine
    install under Program Files (D24).
  - Never AppImage (an unwritable AppImage stays the existing `appimage-not-writable` error).
- Install is refused outright (no auto-install, Restart falls back to today's interactive
  installer / disk image) when the app is unpackaged, or on macOS when the bundle is not named
  `YouCoded.app` or runs from an App Translocation path (D9).

## 4. Installing

`installPending({ relaunch })` is the only installer entry. Before running anything it:
1. Runs the brake (§5); a pulled or unconfirmed release ⇒ no install.
2. Re-hashes the exact file it is about to run against the signed file (`verifyBeforeLaunch`
   on `pending.filePath`, using `pending`'s own tag and URLs), then hands that path — never a
   renderer value — to the platform step (D12).
3. Writes `update-cache/attempt.json` (`{ version, at }`) (D7/D21). On the next launch: running
   version ≥ attempted ⇒ success, delete the attempt and the file. Still older ⇒ log
   "install did not complete", delete the attempt, keep `pending` so the popup is simply Ready
   again (no new notice — no deck approved one).

| Platform | Quit install (switch on, no password) | Restart to update |
|---|---|---|
| Windows per-user | NSIS installer `/S --updated`, spawned detached from `will-quit` after teardown (D6) | same plus `--force-run` (NSIS relaunches the app), then quit |
| Windows per-machine | never | interactive installer as today (its own Windows permission prompt) |
| macOS writable | stage (below), then a detached `/bin/sh` helper spawned from `will-quit` waits for our pid to exit, swaps, rolls back on failure | same, helper `open`s the new app when done |
| macOS needs password | never (R15) | stage, then ONE `osascript … with administrator privileges` (the Mac's own password box) that starts the same helper as root in the background and returns at once; cancel ⇒ open the disk image as today, app keeps running (R16). The helper restores the bundle's owner after the swap so the next update needs no password (D9) |
| Linux AppImage | copy the file beside the running AppImage (same folder), verify, `rename` over it (D20), from `will-quit` | same, then `app.relaunch()` |
| Linux package | never (R8) | existing `pkexec` + relaunch; cancel = existing `install-cancelled` ErrorState |

macOS staging (D8–D11): `hdiutil attach -nobrowse -readonly -mountpoint <tmp>`; `ditto` the
`.app` to `<bundle parent>/.YouCoded-update-<version>.app` (writable case) or
`$TMPDIR/youcoded-update-<version>/` (password case); detach; `codesign --verify --deep --strict`
the staged copy. Any failure ⇒ disk image fallback. The swap NEVER runs while our process
lives: the helper polls our pid, then `mv old → old.bak`, `mv staged → bundle`, `rm -rf old.bak`;
any failed step moves `old.bak` back. Paths reach the helper as positional arguments to a
fixed script (`quoted form of` in AppleScript), never interpolated. Startup sweeps stale
`.YouCoded-update-*` and `$TMPDIR/youcoded-update-*`. **No Mac is available here: a real-Mac
run (writable and non-admin account, macOS 15 and 26) is a release gate, listed in the
handoff.** App Management protection on newer macOS may refuse the helper; that path must fall
back to the disk image, and the test above must confirm it.

### When a quit installs

`shutdownApp({ installUpdate })` (D5): the intent is set only by a person's quit —
`window-all-closed`, the app-menu Quit / Cmd+Q (`before-quit` not raised by our own code) — and
never by SIGTERM/SIGINT, app-restart relaunches, or when any relaunch is queued. A Windows
`session-end` (logoff/shutdown) and macOS/Linux `powerMonitor` `shutdown` set a system-shutdown
flag that vetoes it (D4). Conditions: switch on, `pending` exists, `needs_password` false,
install not refused (§3). The brake runs during teardown, capped at 5 s; the spawn happens in
`will-quit` after teardown; children are `detached` + `unref`ed. Known limit: a launcher that
runs YouCoded inside a kill-on-close Windows job object kills the installer with it (D25).

### Restart to update (`update:restart-to-update`, desktopOnly)

1. Count active sessions in every window. If any, ask the main window with a close request
   that has its OWN key (not the window's close slot) and `reason: 'update'` on the push (D22).
   One answer covers every window's sessions (D23; the prompt already counts them all).
2. Answer cancel, or ANY quit starting while the prompt is open ⇒ `{ restarting: false }`;
   the update does not install (D22). The other quit proceeds as it would have.
3. Yes: password platforms ask first (step above); a cancel there leaves the app running with
   the popup's existing state. Then untrack sessions if `reopen` is false, run the platform
   step with `relaunch: true`, return `{ restarting: true }`, and quit through
   `shutdownApp({ installUpdate: false })` (the install is already handed off).

"Update now" (switch off, nothing downloaded): the popup awaits `ensureDownloaded`, then calls
`restartToUpdate()` — one press, as today, but it ends in the same restart path.

## 5. The brake

Admin (youcoded-admin release skill, short procedure): to pull vX.Y.Z, delete
`youcoded-release.json` and `youcoded-release.json.sig` from that GitHub release (D2). That
alone stops both channels (D3). Optionally also mark it not-latest so the stable listing offers
the previous release. Notice, when worth it, through the announcement chip (R14).

App, before any install (D1):
- Fetch `pending`'s own signed file and signature from the release download host (not the
  rate-limited API). 404 ⇒ pulled: delete the file, clear `pending`, do not install. Any other
  failure or timeout (5 s) ⇒ do not install this time; keep the file.
- Re-verify the file's hash against it (§4 step 2).
- Restart additionally runs a result-returning `checkNow()` against the API; if that fresh,
  parsed answer names a different `latest`, the popup refreshes to it instead of installing. A
  failed API check does not block Restart (the signed-file check above is the brake).

A release someone already installed is not rolled back (out of scope; R14).

## 6. Renderer and bridge

- `preload.ts`, `remote-shim.ts`, `backend-contract.ts`: `update.getAutoInstall`,
  `update.setAutoInstall`, `update.restartToUpdate`. remote-shim forwards the two settings and
  stubs restart as `{ restarting: false }`.
- `CloseRequestPush` gains optional `reason?: 'update'`; App.tsx already passes it to
  `QuitSessionsPrompt`.
- Delete the three `MOCK_ONLY` rows; the workbench mock's hand-written versions now mirror real
  channels.
- UpdatePanel: the close-no-cancel fix (§2) and the Update-now path (§4).

## Data shape

`config.json`: `{ "updates": { "betaChannel": bool|null, "autoInstall": bool } }`.
`UpdateStatus` += `downloaded?: boolean; needs_password?: boolean`.
`update-cache/pending.json` `{ version, tag, manifestUrl, signatureUrl, file }` and
`update-cache/attempt.json` `{ version, at }`. Mac staging folders are transient and swept.

## Performance

Every new path is async (`fs.promises`, spawn), including the AppImage copy/rename and the
verifier's `statSync` (D18); the blocking-call allowlist does not grow. The first background
download is deferred (D19); hashing streams.

## Tests (pins)

- Settings: autoInstall default/validation/round-trip; `supported:false` unpackaged/Android.
- `ensureDownloaded`: off ⇒ none; one promise for background + popup; verify failure deletes;
  newer release keeps the older file until verified; unpackaged never downloads (D26).
- Cleanup: runs after first check; never deletes `pending` (D15).
- Status: `downloaded` / `needs_password` per platform and install kind.
- Quit: installs only with the person-quit intent; not on SIGTERM, relaunch-queued, Windows
  `session-end`, switch off, needs_password, unpackaged (D4, D5).
- Brake: signed-file 404 ⇒ delete + no install; timeout ⇒ keep + no install; hash re-check on
  the exact path (D1, D12).
- Restart: own request key; quit during prompt ⇒ no install; cancel ⇒ `{restarting:false}`;
  password cancel ⇒ app runs; per-platform argv; Mac helper with spaces and quotes in paths and
  its rollback branch (D9, D10, D22).
- Attempt record: success and failure on next launch (D7).
- UpdatePanel: closing mid-download sends no cancel; reopening shows the job's progress.
- IPC parity (`ipc-channels.test.ts`, `update-install-ipc.test.ts`,
  `channel-table-families.test.ts`), mock-shim contract.

## Not in scope

Delta updates; staged rollout (separate card); rolling back an installed pulled release;
metered-network detection; Android (Play Store / APK); a "last update didn't finish" notice
(needs a deck).
