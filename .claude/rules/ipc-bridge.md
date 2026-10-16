---
paths:
  - "**/desktop/src/main/preload.ts"
  - "**/desktop/src/main/ipc-handlers.ts"
  - "**/desktop/src/main/ipc/**"
  - "**/desktop/src/shared/backend-contract.ts"
  - "**/desktop/scripts/generate-preload-channels.mjs"
  - "**/desktop/src/renderer/remote-shim.ts"
  - "**/desktop/src/renderer/utils/ipc-error.ts"
  - "**/desktop/src/main/remote-server.ts"
  - "**/desktop/src/main/dev-tools.ts"
  - "**/app/**/HostJsBridge.kt"
  - "**/desktop/src/main/remote-local.ts"
last_verified: 2026-10-04
verify:
  - path: youcoded/desktop/src/main/preload.ts
  - path: youcoded/desktop/src/renderer/remote-shim.ts
    contains: "REJECT_ON_NOT_OK"
  - path: youcoded/desktop/src/main/remote-server.ts
  - test: youcoded/desktop/tests/ipc-error.test.ts
  - path: youcoded/desktop/src/main/dev-tools.ts
    contains: "buildIssueBody"
  - test: youcoded/desktop/tests/ipc-channels.test.ts
  - path: youcoded/desktop/src/main/ipc/channel-table.ts
    contains: "serveRemoteChannel"
  - path: youcoded/desktop/src/shared/backend-contract.ts
    contains: "desktopOnly"
  - path: youcoded/desktop/scripts/generate-preload-channels.mjs
  - test: youcoded/desktop/tests/channel-table-complete.test.ts
  - test: youcoded/desktop/tests/generate-preload-channels.test.ts
  - test: youcoded/desktop/tests/phone-open-set.test.ts
---

# IPC Bridge (cross-platform parity)

Desktop, Android and a remote browser render the SAME React UI over the SAME JSON protocol. **Architecture: `youcoded/docs/shared-ui-architecture.md`.** Drift: `tests/ipc-channels.test.ts`.

## Core parity invariants
- **`preload.ts` and `remote-shim.ts` must expose the same SHARED `window.claude` shape**, both typed against the one `Window['claude']` in `shared/backend-contract.ts`. If one has a shared API the other lacks, React crashes there. Five closed exceptions: `window.claude.window` (Electron-only), `window.claude.android` (Android-only), the three below.
- **The three voice ones:** `voice.sendAudio`, `voice.micAccess` and the `voice` namespace — absent from `remote-shim.ts` outside `android-local` (a browser gets no mic without encryption); paired to a desktop every method refuses per call. Guard: `remote-shim-refusals.test.ts`.
- **Message type strings must be IDENTICAL on every surface.** A typo breaks it on one platform.
- **The phone runs the desktop backend** (Android clean rebuild, 2026-10-14): the Android app's page is the socket door's local-mode OWNER, so the table's `desktopOnly`/`remoteAllowed:false` refusals apply only to visiting phones. Phone-only calls go to the app (`invokeAndroidHost` ↔ `HostJsBridge.kt`; guard `android-host-channels.test.ts`).
- **A desktop-only channel must REJECT elsewhere, never resolve.** The shim errors ONLY for channels in `REJECT_ON_NOT_OK`. Miss it and a caller expecting an array gets an object.

## Protocol & adding a method
- Request `{type, id, payload}` → response `{type:"…:response", id, payload}`; push `{type, payload}`.
- **One feature = one table entry, not two copies.** (1) Rows in `ChannelTypes` and the `IPC` names in `shared/backend-contract.ts`; (2) one `defineChannel` in `main/ipc/<family>.ts`, listed in `main/ipc/channel-table.ts` — the handler takes `(payload, ctx)` and BOTH doors run it (the phone door, `remote-server.ts`, looks the table up first); (3) preload's channel list is GENERATED: `node scripts/generate-preload-channels.mjs` (a stale block fails `generate-preload-channels.test.ts`); (4) a method in `remote-shim.ts`. Nothing in Kotlin: the phone runs this same table. A hand-written `ipcMain.handle` or a feature `case` in `remote-server.ts` fails `channel-table-complete.test.ts` (only named connection housekeeping is exempt).
- **Phone policy lives on the entry**: `desktopOnly`, `remoteAllowed:false`, `refusal`, `remoteGuard`/`remotePayload`/`remoteOnError`. `serveRemoteChannel` applies it, so a refused channel's handler never runs. `remote-server.ts`'s `default:` still answers `{unsupported:true}` for anything else.
- **CC-coupled code gets an entry in `youcoded/docs/cc-dependencies.md`** (parsing CC output, consuming a CC file, depending on CLI behavior, or matching CC text) — it feeds the `review-cc-changes` release agent.

## Shared-UI bundle
- **The React UI bundle must be in `app/src/main/assets/web/assets/` before APK packaging** or Android launches a blank WebView (`app/src/main/assets/web/` is generated and untracked). `bundleWebUi` runs `scripts/build-web-ui.sh` — don't bypass it (`-x bundleWebUi`) without running that script first.
- **Transcript parser:** `desktop/src/main/transcript-watcher.ts` is the only one (the Kotlin mirror was deleted with the old Android app).

## Settings → Development — guard: `ipc-channels.test.ts`
- **`ipc-channels.test.ts` derives the `dev:*` list from `IPC` in `shared/backend-contract.ts` — TEN types today** (`log-tail`, `diagnostics`, `summarize-issue`, `submit-issue`, `install-workspace`, `install-progress`, `setup-workspace`, `setup-status`, `setup-clear`, `open-session-in`), entries in `main/ipc/dev.ts`. Parity across `preload.ts` and `remote-shim.ts`; `setup-*` are `desktopOnly` (refused, not missing, on a phone).
- **`submitIssue` payload is `{kind, title, summary, description, log?, label}` — NOT `{title, body, label}`.** The body is assembled in main by `buildIssueBody()`. The renderer must NOT format the environment line (`navigator.userAgent` drops the YouCoded version).
- **GitHub labels (`bug`, `enhancement`, `youcoded-app:reported`) must exist on `itsdestin/youcoded`** — never strip one from `gh issue create`.
- **An existing `~/youcoded-dev` gets `git pull` + `bash setup.sh`, not a clone.**
- **The summarizer shells `claude -p` with the prompt piped via STDIN** (avoids the Windows ~32KB arg cap), never a positional arg. `DevTools.runStreamed` writes stdin before reading stdout — safe under 64KB (`smartTruncateLog` bounds it).
- **What a phone may call is pinned whole** in `tests/phone-open-set.test.ts` + `fixtures/phone-open-channels.json`; changing it is Destin's decision.
