---
paths:
  - "**/desktop/src/main/preload.ts"
  - "**/desktop/src/main/ipc-handlers.ts"
  - "**/desktop/src/renderer/remote-shim.ts"
  - "**/desktop/src/renderer/utils/ipc-error.ts"
  - "**/desktop/src/main/remote-server.ts"
  - "**/desktop/src/main/dev-tools.ts"
  - "**/app/**/SessionService.kt"
  - "**/app/**/LocalBridgeServer.kt"
  - "**/app/**/PlatformBridge.kt"
last_verified: 2026-09-06
verify:
  - path: youcoded/desktop/src/main/preload.ts
  - path: youcoded/desktop/src/renderer/remote-shim.ts
    contains: "REJECT_ON_NOT_OK"
  - path: youcoded/desktop/src/main/remote-server.ts
  - test: youcoded/desktop/tests/ipc-error.test.ts
  - path: youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt
  - path: youcoded/desktop/src/main/dev-tools.ts
    contains: "buildIssueBody"
  - test: youcoded/desktop/tests/ipc-channels.test.ts
---

# IPC Bridge (cross-platform parity)

Desktop, Android and a remote browser render the SAME React UI over the SAME JSON protocol. **Architecture: `youcoded/docs/shared-ui-architecture.md`.** Drift: `tests/ipc-channels.test.ts`.

## Core parity invariants
- **`preload.ts` and `remote-shim.ts` must expose the same SHARED `window.claude` shape.** If one has a shared API the other lacks, React crashes there. Five closed exceptions: `window.claude.window` (Electron-only), `window.claude.android` (Android-only), the three below.
- **The three voice ones.** `voice.sendAudio`, `voice.micAccess` and the `voice` namespace itself — absent from `remote-shim.ts` outside `android-local`, because a browser grants no mic without an encrypted connection; paired to a desktop every method refuses per call. Guard: `remote-shim-voice-gate.test.ts`.
- **Message type strings must be IDENTICAL on every surface.** A typo silently breaks that feature on one platform. (`SessionService.handleBridgeMessage()`: ~286 types, counted 2026-09-06 from its `when` branch labels — the long-standing "~136" was under half.)
- **Desktop handlers return raw values; Android wraps in `JSONObject`.** The shim normalizes both before React.
- **A desktop-only channel must REJECT elsewhere, never resolve.** Kotlin's not-implemented arm answers `{ok:false}`; the shim errors ONLY for channels in `REJECT_ON_NOT_OK`. Miss it and a caller expecting an array gets an object — the first `.filter()` takes the screen down.

## Protocol & adding a method
- Request `{type, id, payload}` → response `{type:"…:response", id, payload}`; push `{type, payload}`.
- **A channel has FIVE surfaces, not four** — `preload.ts`, `ipc-handlers.ts`, `remote-shim.ts` (`invoke`/`fire`), **`remote-server.ts`** and `SessionService.kt`. `remote-server.ts` is the desktop's WS host for a remote browser; its `default:` answers `{unsupported:true}`, so a channel skipped there is dead over remote. Kotlin: a `when` case on the same type string, replying via `bridgeServer.respond`.
- **CC-coupled code gets an entry in `youcoded/docs/cc-dependencies.md`** — it feeds the `review-cc-changes` release agent. Coupling = parsing CC output, consuming a CC file, depending on CLI behavior, or matching a CC text pattern.

## Shared-UI bundle
- **The React UI bundle must be in `app/src/main/assets/web/assets/` before APK packaging** or Android launches a blank WebView. `bundleWebUi` runs `scripts/build-web-ui.sh` before `preBuild` — don't bypass it (`-x bundleWebUi`) without running that script first.
- **Transcript-parser drift (2026-07-15):** the old `TranscriptSource` two-implementation design and its `transcript-parity/` fixtures are ABSENT — don't rely on them. Canonical parser: `desktop/src/main/transcript-watcher.ts`; the Kotlin `parser/TranscriptWatcher.kt` mirror still exists. Reintroducing one means landing parity fixtures too.

## Settings → Development — guard: `ipc-channels.test.ts`
- **`ipc-channels.test.ts` holds the authoritative `dev:*` list — SEVEN types today, not six** (`dev:diagnostics` joined `log-tail`, `summarize-issue`, `submit-issue`, `install-workspace`, `install-progress`, `open-session-in`), in parity across `preload.ts`, `remote-shim.ts`, `ipc-handlers.ts` and `SessionService.kt`. **The guard only reads THREE of those four** — `ipc-handlers.ts` uses `IPC.DEV_*` constants, not literals, so nothing checks it. `remote-server.ts` bridges none, so Settings → Development degrades over remote.
- **`submitIssue` payload is `{kind, title, summary, description, log?, label}` — NOT `{title, body, label}`.** The body is assembled in main by `buildIssueBody()` (version + OS + platform only exist there). The renderer must NOT format the environment line — `navigator.userAgent` leaks Chrome's UA and drops the YouCoded version.
- **GitHub labels (`bug`, `enhancement`, `youcoded-app:reported`) must exist on `itsdestin/youcoded`** — create it, never strip it from `gh issue create`.
- **`setup.sh` re-run is the canonical workspace-install idempotency path** — when `~/youcoded-dev` exists with the matching remote, skip the clone: `git pull` + `bash setup.sh`.
- **The summarizer shells `claude -p` with the prompt piped via STDIN** (reuses CC's OAuth token, avoids the Windows ~32KB arg cap), never a positional arg. `DevTools.runStreamed` writes stdin before reading stdout — safe under 64KB (`smartTruncateLog` bounds it); larger would deadlock.
- **Cross-platform tasks port the CURRENT implementation, not the original plan** — re-read the desktop signatures before writing the Kotlin handler (Phase 6 shipped empty Android issue bodies).
