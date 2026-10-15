---
date: 2026-10-14
status: active
type: plan
supersedes: docs/active/plans/2026-09-24-android-rebuild-plan.md
topic: Android clean rebuild — the phone runs the desktop's own backend as a headless Node server inside the app; the Kotlin layer is rewritten small; no migration, no existing users
---

# Android clean rebuild — plan

> **What changed from the 2026-09-24 plan (A0–A6).** Destin, 2026-10-14: "nobody is using the
> app rn … we dont need to consider existing users or anything, and i don't want to build any
> intermediate fixes that we know we will rebuild later." So the forwarding-first migration
> (old C5), the family-by-family move (old A3), the flip (old A4), the upgrade path for old
> installs (old A1) and the "fix the skill-settings wipe now" item are all **dropped**. The old
> Kotlin app is deleted, not migrated. The one-core work it depended on (R0–R6) merged
> 2026-10-04 (youcoded#604). The A0 phone experiments ran 2026-10-14 (results below) and
> changed one decision: **Claude Code is no longer frozen on the phone.**

## For Destin, in plain words

The phone stops having its own copy of the app's features. Instead, the computer's own
"brain" runs inside the phone app, and the shared screens talk to it the same way a phone's
web browser talks to your computer today. The Android-specific part shrinks to what only a
phone can do: the app window, staying alive in the background, notifications, sharing, file
pickers, the microphone, the QR camera. Everything the computer gains later reaches the phone
automatically, or says "not on this device".

The newest Claude Code (2.1.300 on test day) runs on the phone, so the phone gets the same
Claude Code as the computer instead of one frozen at 2.1.112.

## Target shape

```
 Android app (one APK, every program inside)
 ├─ Kotlin shell (~3–5k lines, new): Activity + WebView, foreground service + wake lock,
 │    starts/stops Node, platform bridge (open URL, Keystore secrets, notifications,
 │    file pickers, share in/out, mic, QR camera, VPN state, DNS servers → resolv.conf)
 ├─ WebView: the shared React UI, remote-shim → ws://127.0.0.1 (local token)
 └─ Node (headless desktop backend): createRuntime + every phone-safe family + socket door
      ├─ node-pty → bash / Claude Code (same pty-worker as desktop)
      └─ hooks, git, ripgrep, gh, Claude Code — all bundled musl programs
```

## A0 results — tested on a real phone, 2026-10-14

Phone: Galaxy Z Flip7 (SM-F766U1), Android 17 (SDK 37). Tests ran first from `adb shell`, then
**inside a throwaway app** (`untrusted_app_34` sandbox, targetSdk 35), which is the binding
result. Source: `docs/active/prototypes/2026-10-14-android-a0-spike/`.

| Question | Result inside the app |
|---|---|
| Run programs shipped in the APK | **Yes.** Programs packed as `jniLibs/arm64-v8a/lib<name>.so` (`useLegacyPackaging`), reached through symlinks in `files/bin/`. Exec of a copy in the app's data folder is denied, as expected |
| Toolchain | **Alpine Linux (musl) packages work unmodified** except for paths: Node 24.18.1, bash 5.3, git 2.54, ripgrep 15.1, strace. Each executable's ELF interpreter is rewritten (patchelf) to a fixed per-package path, `/data/data/<pkg>/files/ld` → symlink to the bundled musl loader; libraries resolve by RUNPATH `/data/data/<pkg>/files/lib` (symlinks into the native-lib folder) |
| Libraries in the data folder | **Loadable** (a copied `pty.node` dlopen'd fine): only execve is blocked, not mmap-exec |
| Newest Claude Code | **Yes.** `@anthropic-ai/claude-code-linux-arm64-musl@2.1.300` runs through the musl loader, reaches api.anthropic.com, and draws its full first-run screen inside a node-pty terminal |
| Node event loop | **Killed by seccomp until fixed.** libuv calls `io_uring_setup`, which Android's app seccomp filter answers with SIGSYS (`UV_USE_IO_URING=0` does not prevent it). Fixed by a 90-line shim (`ycshim.c`) that answers ENOSYS; libuv falls back to epoll |
| Node → bash → git → rg child processes | **Yes**, after the shim |
| `#!` scripts (`#!/usr/bin/env bash`) | **Denied** by the kernel (data-folder exec). Fixed in the shim by exec'ing the interpreter instead (covers `execve`, `execv`, `execvp`, `execvpe`; musl's own execvp bypasses an interposed execve) |
| node-pty | **Yes.** Cross-built for musl arm64 with clang + an Alpine sysroot. Loads with `--preserve-symlinks` (or from an absolute native-lib path); plain symlinked `require` fails with "Cannot find module" |
| DNS | **Breaks without a fix.** musl and c-ares read `/etc/resolv.conf`, which Android lacks. Proved by patching the path; production builds musl + c-ares with a resolv.conf path inside the app, written by Kotlin from the active network's DNS servers |
| TLS | Node needs `SSL_CERT_FILE` (or `--use-bundled-ca`); git needs `GIT_SSL_CAINFO`. Bundled CA file |
| git https | **Yes** (`ls-remote` against GitHub from inside the app) |
| Node idle memory | 38–42 MB RSS |
| Not yet measured | Battery and Doze over a long session; cold start of the full backend; Claude Code hooks and its Bash tool with a real login (Bun's spawn path does not get the shim, and `/bin/sh` does not exist on Android); APK size of the final set (spike: 162 MB with Claude Code ~117 MB compressed) |

## Phases

### P1 — Headless backend (desktop code; laptop only)

A plain Node entry that boots `createRuntime` + every family + the socket door with **no
Electron**, used by the phone and runnable on the laptop for testing (open the UI in a
browser). The 2026-10-14 sweep found:
- `ipc-handlers.ts` (2,482 lines) is the only wiring of the ~30 `bindX` family setups and imports
  Electron; split it into an Electron-free `wireBackend(...)` plus a thin window-door layer.
- `channel-table.ts` statically imports every family, reaching 35 Electron-importing files.
  Phone-unneeded families (buddy, detach, window, browser, office, voice, update, dev) load
  only on desktop.
- ~22 phone-served files touch Electron (`session-manager` `app.getPath/isPackaged`,
  `social-handlers` `powerMonitor`, `shell.openExternal` in account/sync/first-run/plaid,
  `safeStorage`, `powerSaveBlocker`, app version/paths): each becomes a `Platform` member or a
  plain value.
- Socket door: add a loopback "local" mode that accepts the bridge token the shim already
  sends (`remote-shim.ts:1314`); serve on the shim's path (today `/ws` vs. none); bind
  127.0.0.1 instead of requiring a Tailscale address.
- **Gate:** desktop unchanged (`verify.sh --full`); headless server on the laptop serves the UI
  to a browser and runs a Claude Code and a native session.

### P2 — Phone toolkit (needs the phone)

- Build script producing the program set from Alpine packages: patchelf interpreter/RUNPATH
  per package id, `lib*.so` naming, musl + c-ares built with an in-app resolv.conf path, the
  shim built and added as `DT_NEEDED` to every musl executable that spawns, node-pty
  cross-built, Claude Code musl binary, `gh` (static Go).
- Backend fixes for Android: `process.platform` is `linux` under musl Node (good — no `'android'`
  branch needed); hard-coded `/bin/bash` and `/usr/bin/node` in `harness/tools/bash.ts`,
  `@vscode/ripgrep` (point at the bundled `rg`), `koffi.load('libc.so.6')`, `os.tmpdir()`
  (set `TMPDIR`), `/bin/sh` for shell-mode spawns, node-pty loading.
- Measure battery/Doze and backend cold start here, before P3 is built on it.
- **Gate:** the headless backend runs on the phone and a real Claude Code session (logged in)
  runs tools, hooks and permission prompts.

### P3 — New Kotlin shell (needs the phone)

A new, small app module: Activity + WebView loading the bundled UI, foreground service
(`specialUse`, with the manifest `<property>`), Node process supervision and restart, the
platform bridge, first-run unpacking. **Delete** the old `SessionService`, `Bootstrap`,
`skills/`, `parser/`, `doccomments/`, `artifacts/`, `LocalBridgeServer`, the vendored Termux
terminal and its Android parity tests/stubs. Update the IPC parity tests to the new shape.
- **Gate:** a fresh install reaches a working Claude Code and native session with no network
  download; the phone restores its screens after Android kills the app.

### P4 — "Not on this device"

Read R4's `capabilities` object so local models, buddy, extra windows, the built-in browser,
Office and other desktop-only features hide or grey with a reason.

### P5 — Phone-native features (design-first; design rounds may start any time)

Phone default UI, actionable notifications, share in/out, real file access, touch polish —
each through feature-flow. Unchanged from the 2026-09-24 plan's A5 list.

### P6 — Google Play (optional; Destin 2026-10-01: "google play isnt priority")

The bundled-programs design (P2) is what Play requires; the listing itself waits for Destin.

## Risks

- **Claude Code under Bun on Android** is only proven to start, reach the network and draw.
  Hooks and tool spawns with a real login are untested (P2 gate).
- **App size:** Claude Code alone is ~117 MB compressed. Play's base-module limit may force
  asset packs; sideload is unaffected.
- **Bundled-program updates** ship only with app releases (Claude Code's self-updater must be
  off: `DISABLE_AUTOUPDATER=1`).
- **Battery/Doze** unmeasured until P2.
- **P1 touches desktop startup wiring.** Guarded by the full desktop suite; nothing should
  look different on the computer.
