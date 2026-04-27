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

## Vendored Termux terminal-emulator

Android depends on a **vendored copy** of Termux's `terminal-emulator` at `youcoded/terminal-emulator-vendored/` (Maven coordinate would be `com.github.termux.termux-app:terminal-emulator:v0.118.1`, but we build it locally). The vendor drop is patched to expose a `RawByteListener` on `TerminalEmulator.append()` — used by `PtyBridge.rawByteFlow` and broadcast as `pty:raw-bytes` WebSocket push events for the React xterm renderer.

Source of truth for the origin tag and patch shape: `terminal-emulator-vendored/VENDORED.md`. Never edit this module outside the documented patch.

The vendored emulator is **headless** as of Tier 2. The native Termux `TerminalView` UI was removed from `ChatScreen.kt` and the `terminal-view:v0.118.1` Maven dependency dropped. `TerminalSession` still owns the PTY fork + JNI waitpid loop + emulator processing; only the rendering layer changed.

## Terminal rendering (Tier 2)

Terminal rendering on Android happens in xterm.js inside the WebView, not in a native Termux `TerminalView`. The pipeline:

1. `PtyBridge` runs the PTY in `TerminalSession` (vendored emulator). Bytes from `pty.read()` reach `TerminalEmulator.append()`.
2. The `RawByteListener` patch fires on the terminal thread before the emulator processes the bytes. `PtyBridge.rawByteFlow` (a `MutableSharedFlow` with `tryEmit`) carries them.
3. `SessionService.launchRawByteBroadcast` collects from `rawByteFlow`, batches at ~16ms / 8KB, base64-encodes, and broadcasts `pty:raw-bytes` over the WebSocket.
4. In React, `remote-shim.ts` dispatches per-session events. `usePtyRawBytes` (`desktop/src/renderer/hooks/usePtyRawBytes.ts`) decodes base64 → `Uint8Array` and feeds `terminal.write()` on xterm.
5. xterm renders to canvas in the WebView. The React `TerminalView` component (`desktop/src/renderer/components/TerminalView.tsx`) is the same component desktop uses — the touch-platform branch sets `disableStdin: true`, skips `terminal.onData`, swaps to `usePtyRawBytes`, uses 12px font, and registers a one-finger touch-scroll handler.

Typing on touch flows through `InputBar` minimal-mode `<textarea>` → `sendInput(text + '\r')`, NOT through xterm's hidden textarea (which is suppressed by `disableStdin`). Special keys (Esc, Tab, Ctrl, ←/→, ↑/↓ scroll buttons) come from `TerminalToolbar` and `TerminalScrollButtons`.

The `screenMode` enum, `viewModeRequest` collector, and `layoutInsets` SharedFlow in `SessionService.kt` still have producers but no Kotlin consumers (the deleted Compose block was their only consumer). They're left in place as a follow-up cleanup — pruning is safe but out of Tier 2 scope.

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
