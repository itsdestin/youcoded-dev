# Android Runtime

The Android app runs Claude Code (a Node.js CLI) inside a Termux-derived environment. Several non-obvious constraints apply.

## System Fundamentals

### `LD_LIBRARY_PATH` is mandatory
The app relocates Termux binaries from `/data/data/com.termux/files/usr` to `context.filesDir/usr`, so `DT_RUNPATH` baked into binaries is stale. `LD_LIBRARY_PATH` overrides it. Set in `Bootstrap.buildRuntimeEnv()`. **Do not remove.**

### All binaries route through `/system/bin/linker64`
SELinux W^X bypass (Android 10+). Three layers, each with a distinct role:

1. **LD_PRELOAD (`libtermux-exec-ld-preload.so`)** — intercepts `execve()` in C/Rust programs, routes through linker64
2. **`claude-wrapper.js`** — NOT exec routing. Handles /tmp rewriting, fs.accessSync bypass, shell path fixing, BASH_ENV injection
3. **`linker64-env.sh`** — bash function wrappers for Go binaries (gh, fzf, micro) that bypass LD_PRELOAD

**Use the linker variant of termux-exec.** Bootstrap.kt copies `libtermux-exec-linker-ld-preload.so` over `libtermux-exec-ld-preload.so` after installing `termux-exec`.

### No `/tmp`
Use `$HOME/.cache/tmpdir` via `TMPDIR` and `CLAUDE_CODE_TMPDIR`. The specific path (`$HOME/.cache/tmpdir`, not `$HOME/tmp`) avoids Termux Node.js's compiled-in `/tmp` rewriting from double-applying.

### No glibc
Bionic only. `native/execve-interceptor.c` is a research artifact, not deployed.

## Canonical sources

- `claude-wrapper.js` — canonical at `app/src/main/assets/claude-wrapper.js`. Deployed at every PTY start (inline in `PtyBridge.start()` at `PtyBridge.kt:119-123` — reads the asset and writes it to `$HOME/.claude-mobile/claude-wrapper.js` before each launch). There is no separate `Bootstrap.deployWrapperJs()` method. **Edit the asset file directly.**

## Shared runtime environment

Runtime fixes MUST work in both `PtyBridge` and `DirectShellBridge`. Both share:
- `Bootstrap.buildRuntimeEnv()` (PtyBridge.kt:106, DirectShellBridge.kt:43)
- `Bootstrap.deployBashEnv()` (PtyBridge.kt:131, DirectShellBridge.kt:49)

## Reactivity

**Do not poll `isRunning`.** Use the reactive `sessionFinished` `StateFlow` (fed by a JNI `waitpid()` thread).

## Native UI Bridge Pattern (Deferred)

When an IPC handler needs native Android UI (file picker, folder picker, QR scanner):

1. `SessionService` creates a `CompletableDeferred<T>` and stores it (e.g., `pendingFolderPicker`)
2. `SessionService` calls a callback (e.g., `onFolderPickerRequested`) to notify the Activity
3. `MainActivity` shows the native UI (Compose dialog or `ActivityResultContract`)
4. On result, `MainActivity` calls `deferred.complete(result)`
5. `SessionService` awaits the deferred and sends the response back via WebSocket

Used by: `dialog:open-file`, `dialog:open-folder`, `android:scan-qr`.

## Key Files

| File | Purpose |
|------|---------|
| `app/.../ui/WebViewHost.kt` | Hosts React UI in WebView, loads bundled web assets |
| `app/.../bridge/LocalBridgeServer.kt` | WebSocket server on :9901, bridges React IPC to Kotlin |
| `app/.../bridge/PlatformBridge.kt` | Android-native operations (file picker, clipboard, URLs) |
| `app/.../runtime/Bootstrap.kt` | Package management, environment setup, shell function generation |
| `app/.../runtime/SessionService.kt` | Main IPC dispatcher — handles ~136 bridge message types |
| `app/.../runtime/PtyBridge.kt` | Claude Code terminal session (PTY + event bridge) |
| `app/.../runtime/DirectShellBridge.kt` | Standalone bash shell session |
| `app/.../runtime/ManagedSession.kt` | Session lifecycle, status, approval flow, prompt detection |
| `app/.../runtime/SessionRegistry.kt` | Multi-session management |
| `app/.../assets/claude-wrapper.js` | Node.js monkey-patch (CANONICAL SOURCE) |
| `app/.../assets/hook-relay.js` | Unix socket event relay for structured hook events |
| `app/.../skills/LocalSkillProvider.kt` | Skill marketplace backend |
| `app/.../skills/PluginInstaller.kt` | Installs Claude Code plugins via git clone/copy |
| `app/.../ui/TierPickerScreen.kt` | First-run package tier selection (Compose) |
| `app/.../ui/SetupScreen.kt` | Bootstrap progress display (Compose) |
| `app/.../ui/FolderPickerDialog.kt` | Native folder browser (Compose) |
