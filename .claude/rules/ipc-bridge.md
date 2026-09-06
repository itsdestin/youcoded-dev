---
paths:
  - "**/desktop/src/main/preload.ts"
  - "**/desktop/src/main/ipc-handlers.ts"
  - "**/desktop/src/renderer/remote-shim.ts"
  - "**/desktop/src/main/dev-tools.ts"
  - "**/app/**/SessionService.kt"
  - "**/app/**/LocalBridgeServer.kt"
  - "**/app/**/PlatformBridge.kt"
last_verified: 2026-07-15
verify:
  - path: youcoded/desktop/src/main/preload.ts
  - path: youcoded/desktop/src/renderer/remote-shim.ts
  - path: youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt
  - path: youcoded/desktop/src/main/dev-tools.ts
    contains: "buildIssueBody"
  - test: youcoded/desktop/tests/ipc-channels.test.ts
---

# IPC Bridge (cross-platform parity)

Desktop and Android render the SAME React UI over the SAME JSON protocol. **Full architecture: `youcoded/docs/shared-ui-architecture.md`.** Drift is caught by `tests/ipc-channels.test.ts`.

## Core parity invariants
- **`preload.ts` and `remote-shim.ts` must expose the same SHARED `window.claude` shape.** If one has a shared API the other lacks, React crashes on that platform. Five intentional exceptions, closed: `window.claude.window` (Electron-only), `window.claude.android` (Android-only), and the three below.
- **The three voice ones.** `voice.sendAudio` (the phone's recogniser owns its mic), `voice.micAccess` (the Activity's launcher owns that question), and the `voice` namespace itself — absent from `remote-shim.ts` outside `android-local`, because a browser grants no mic without an encrypted connection (deck Q-7); paired to a desktop, every method refuses per call. Guards: `ipc-channels.test.ts`, `remote-shim-voice-gate.test.ts`.
- **Message type strings must be IDENTICAL across `preload.ts`, `ipc-handlers.ts`, and `SessionService.kt`.** A typo silently breaks that feature on one platform. (`SessionService.handleBridgeMessage()`, ~136 types.)
- **Desktop handlers return raw values; Android wraps in `JSONObject`.** The shim normalizes both before React. Test on BOTH platforms.

## Protocol & adding a method
- Request `{type, id, payload}` → response `{type:"…:response", id, payload}`; push event `{type, payload}`, no id.
- 1) `remote-shim.ts`: `invoke('type:name', payload)`/`fire(...)`. 2) `ipc-handlers.ts`: `ipcMain.handle(IPC.CHANNEL, handler)`/`on()`. 3) `SessionService.handleBridgeMessage()`: a `when` case with the same type string, replying via `bridgeServer.respond(ws, msg.type, msg.id, payload)` if `msg.id` is present.
- **CC-coupled code gets an entry in `youcoded/docs/cc-dependencies.md`** — it feeds the `review-cc-changes` release agent. Coupling = parsing CC output, consuming a CC file, depending on CLI behavior (flags/exit codes/prompt text), or matching a CC text pattern.

## Shared-UI bundle
- **The React UI bundle must be in `app/src/main/assets/web/assets/` before APK packaging** or Android launches a blank WebView (`index.html` references JS/CSS that aren't shipped). The `bundleWebUi` Gradle task runs `scripts/build-web-ui.sh` before `preBuild` (input-tracked against `desktop/src/`) — don't bypass it (`-x bundleWebUi`) without running that script first.
- **Transcript-parser drift (2026-07-15):** the old "two implementations behind a `TranscriptSource` interface" design (`TranscriptWatcherProcess` + `transcript-watcher-cli.js`, gated by `transcriptWatcher.useNodeProcess`) and its `transcript-parity/` fixtures + test are ABSENT here — don't rely on them. Canonical parser: `desktop/src/main/transcript-watcher.ts`; the Kotlin `parser/TranscriptWatcher.kt` mirror still exists (its `TranscriptEvent` enum has `user-interrupt`/`assistant-thinking` for a future Node-CLI path it doesn't emit). Reintroducing one means landing parity fixtures + test in the same change.

## Settings → Development — guard: `ipc-channels.test.ts`
- **Six IPC types stay in parity across all four surfaces** (`preload.ts`, `remote-shim.ts`, `ipc-handlers.ts`, `SessionService.kt`): `dev:log-tail`, `dev:summarize-issue`, `dev:submit-issue`, `dev:install-workspace`, `dev:install-progress`, `dev:open-session-in`. Don't "simplify" one platform away.
- **`submitIssue` payload is `{kind, title, summary, description, log?, label}` — NOT `{title, body, label}`.** The body is assembled in main via `buildIssueBody()` (version + OS + platform only exist there). The renderer must NOT format the environment line (`navigator.userAgent` leaks Chrome UA, skips the YouCoded version). When porting to Kotlin, port the CURRENT TS shape — Phase 6 shipped silently-empty Android issue bodies.
- **GitHub labels (`bug`, `enhancement`, `youcoded-app:reported`) must exist on `itsdestin/youcoded`** — create the label, never strip it from `gh issue create`.
- **`setup.sh` re-run is the canonical workspace-install idempotency path** — when `~/youcoded-dev` exists with the matching remote, skip the clone, `git pull` + `bash setup.sh` (the `alreadyInstalled:true` flag drives UI copy).
- **The summarizer shells out to `claude -p` with the prompt piped via STDIN** (reuses CC's OAuth token, avoids the Windows ~32KB arg cap); both use stdin, never a positional arg. `DevTools.runStreamed` writes stdin before reading stdout — safe for the sub-64KB prompt (bounded by `smartTruncateLog`); a larger blob would deadlock (drain stdout on a separate thread).
- **Cross-platform tasks port the CURRENT implementation, not the original plan** — re-read the current desktop signatures before writing the Kotlin handler (Phase-6 cautionary tale).
