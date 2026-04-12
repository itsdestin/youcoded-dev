# Shared UI Architecture

Desktop and Android render the **same React UI**. This is the most important architectural fact about DestinCode.

## How it works

- Source of truth: `destincode/desktop/src/renderer/` (React app)
- Desktop: Electron hosts the React app natively
- Android: `WebViewHost.kt` loads the React build from bundled assets (`file:///android_asset/web/`). The React bundle is generated from the desktop source via `scripts/build-web-ui.sh`.
- Platform detection: `remote-shim.ts` checks `location.protocol === 'file:'` (Android) and routes IPC via WebSocket (`ws://localhost:9901`). Desktop uses Electron IPC directly.
- Both platforms communicate via the **same JSON protocol** — the WebSocket transport and Electron IPC carry identical message shapes.

## Practical implication

Most features work on both platforms automatically because the UI is shared. Only features requiring native Android APIs (camera, file picker, package bootstrap, tier selection) need Kotlin code. When evaluating feature gaps between platforms, check whether the IPC handler exists in `SessionService.handleBridgeMessage()` — the UI itself is shared.

## Adding Cross-Platform Features (IPC Pattern)

1. **React side** (`destincode/desktop/src/renderer/remote-shim.ts`): Add method to `window.claude` using `invoke('type:name', payload)` (request-response) or `fire('type:name', payload)` (fire-and-forget)
2. **Desktop side** (`destincode/desktop/src/main/ipc-handlers.ts`): Add `ipcMain.handle(IPC.CHANNEL, handler)` for request-response, or `ipcMain.on()` for fire-and-forget
3. **Android side** (`destincode/app/.../runtime/SessionService.kt`): Add a `when` case in `handleBridgeMessage()` matching the same type string. Respond with `bridgeServer.respond(ws, msg.type, msg.id, payload)` if `msg.id` is present

The message type string (e.g., `"skills:install"`) must be **identical across all three files**. `SessionService.handleBridgeMessage()` currently has 92 message types.

## Critical parity requirement

`preload.ts` and `remote-shim.ts` must expose the **same shared `window.claude` shape**. If one has a shared API the other lacks, React components crash on that platform. When adding features, always update both.

### Intentional platform-exclusive namespaces

These are NOT parity violations — they're by design:
- **Electron only** (preload.ts): `window.claude.window` (minimize/maximize/close/onFullscreenChanged) — browser cannot do window control
- **Android only** (remote-shim.ts): `window.claude.android` — desktop doesn't need Android-specific APIs

## Protocol format

- Request: `{ "type": "...", "id": "msg-1", "payload": {...} }`
- Response: `{ "type": "...:response", "id": "msg-1", "payload": {...} }`
- Push event: `{ "type": "...", "payload": {...} }` (no id, broadcast)

## Response shape normalization

Desktop handlers return raw values (e.g., `string[]`). Android wraps in JSONObject (e.g., `{paths: [...]}`). The shim should normalize differences so React sees a consistent shape.
