---
title: Android Terminal Data-Layer Parity (Tier 1)
status: proposed
date: 2026-04-24
---

# Android Terminal Data-Layer Parity (Tier 1)

## Context

Today, desktop and Android diverge at the terminal layer in ways that have nothing to do with rendering:

- **Desktop** owns the full data stack. `pty-worker.js` spawns node-pty, bytes flow over IPC into the React `TerminalView` (xterm.js), and any React code that wants screen text reads the xterm buffer via `terminal-registry.ts`. The attention classifier (`useAttentionClassifier`) uses this to tick every second and drive the `AttentionBanner`.
- **Android** uses Termux's native `TerminalView` (`com.termux.view`) stacked behind the WebView. `PtyBridge.kt` instantiates `com.termux.terminal.TerminalSession`, which owns the PTY read loop and the ANSI emulator internally. React never sees raw PTY bytes; the classifier hook cannot run; Android users only get `attentionState` via desktop-relay `attentionMap` when paired.

This plan closes that data-layer gap without touching how Android renders the terminal. Native `TerminalView` keeps drawing pixels exactly as it does today. The change is purely additive: new WebSocket messages, a new `RawByteListener` on the emulator, and a small abstraction over "get screen text for this session" so the existing desktop classifier hook works on both platforms.

This is the "Tier 1" step of a larger plan discussed in conversation. Tier 2 (consuming the raw-byte stream in xterm.js-in-WebView to replace the native renderer) is explicitly deferred. Tier 1 is valuable on its own — it ships the attention classifier to standalone Android users — and it positions the codebase so Tier 2 can be prototyped without re-architecting.

## Goal

Close the data-layer parity gap between Android and desktop so that:

1. Any React code that needs terminal screen text (classifier, buffer scanners, prompt detection) works on both platforms via a single API.
2. Raw PTY bytes are available to React on Android, ready to be consumed by a future xterm.js renderer.
3. The attention classifier runs on standalone Android and emits the same `attentionState` transitions as desktop for the same Claude Code output.

## Success Criteria

- Attention classifier runs on standalone Android (not just via desktop relay) and emits identical `attentionState` transitions to desktop for the same Claude Code output.
- Raw-byte stream delivers bytes that, when written to an xterm.js instance, would render identically to what Termux's native emulator displays. (Verified by contract; end-to-end xterm-render verification is Tier 2's problem.)
- Existing Android UX is unchanged: typing, scrolling, IME, gesture, long-press, scrollback — all continue via the native `TerminalView`.
- All cross-platform IPC parity tests pass.

## In Scope

**Android:**
- Vendor Termux's `terminal-emulator` module (JitPack dep `com.github.termux.termux-app:terminal-emulator:v0.118.1`) into a local Gradle module with a minimal `RawByteListener` patch.
- Attach the listener in `PtyBridge.kt`; broadcast bytes over WebSocket.
- Add `terminal:get-screen-text` bridge message backed by the existing `PtyBridge.readScreenText()`.

**Desktop:**
- No behavior change.
- Small refactor: `useAttentionClassifier` calls `window.claude.terminal.getScreenText()` instead of reaching directly into `terminal-registry.ts`. The desktop implementation of that method still reads the xterm buffer.

**Shared:**
- Bridge-message type strings added to `ipc-channels.test.ts` parity matrix.
- New `shared-fixtures/attention-classifier/` with input/expected pairs.
- New classifier parity test.
- PITFALLS entries for the new invariants.
- `docs/cc-dependencies.md` entry for the Android classifier (new consumer of CC spinner/prompt patterns).
- `docs/android-runtime.md` section documenting the vendored module.

## Out of Scope

- Any xterm.js rendering on Android (Tier 2).
- Removing native Termux `TerminalView` from `ChatScreen.kt`.
- Changes to the native-terminal input path (soft keyboard, touch gestures, etc.).
- Upstream PR to Termux for a `RawByteListener` API.
- Release mechanics (version bumps, tagging, release notes) — shipped separately.

## Architecture

### New Gradle module: `terminal-emulator-vendored/`

Lives at `youcoded/terminal-emulator-vendored/` as a local Gradle library module.

**Contents:** ~15 Java files copied verbatim from the Termux `v0.118.1` tag's `terminal-emulator/src/main/java/com/termux/terminal/`, plus any shared resources that the module's AAR would normally include.

**Patch:** `TerminalEmulator.java` receives a minimal addition:

```java
public interface RawByteListener {
    void onBytesReceived(byte[] buffer, int length);
}

private final java.util.List<RawByteListener> rawByteListeners = new java.util.concurrent.CopyOnWriteArrayList<>();

public void addRawByteListener(RawByteListener listener) { rawByteListeners.add(listener); }
public void removeRawByteListener(RawByteListener listener) { rawByteListeners.remove(listener); }

// In append(byte[] buffer, int length), before the existing processing loop:
public void append(byte[] buffer, int length) {
    for (RawByteListener listener : rawByteListeners) {
        listener.onBytesReceived(buffer, length);
    }
    // ...existing per-byte processing loop unchanged...
}
```

No other Termux files are modified.

**Gradle wiring:**
- `youcoded/settings.gradle.kts` gains `include(":terminal-emulator-vendored")`.
- `youcoded/app/build.gradle.kts` swaps `implementation("com.github.termux.termux-app:terminal-emulator:v0.118.1")` for `implementation(project(":terminal-emulator-vendored"))`.
- The `terminal-view` Maven dep (`com.github.termux.termux-app:terminal-view:v0.118.1`) stays unchanged — that's the View layer, not the emulator, and we don't need to patch it.

**Documentation:** `terminal-emulator-vendored/VENDORED.md` records:
- Origin tag (`v0.118.1`) and commit SHA.
- Exact patch applied (the three additions above).
- Re-vendor procedure (when we bump to a future Termux version).
- The invariant that this module is never edited outside the documented patch.

### Android runtime changes (`youcoded/app/`)

**`PtyBridge.kt`:**
- Add `rawByteFlow: SharedFlow<ByteArray>` (bounded `MutableSharedFlow` with `replay = 0, extraBufferCapacity = 64` so slow WebSocket clients drop bytes rather than blocking the emulator thread).
- In `start()`, after `session?.initializeEmulator(80, 60)`, attach a `RawByteListener` to the session's emulator that calls `_rawByteFlow.tryEmit(bufferCopy)`. The listener copies bytes out of the shared buffer because Termux reuses the same `byte[]` across reads — the emit must happen with a copy or the reader will see later data.
- Listener is registered once per session; `stop()` calls `removeRawByteListener` to allow GC.

**`SessionService.kt`:**
- Two new bridge message handlers in `handleBridgeMessage()`:
  - `"terminal:get-screen-text"` (request-response): reads `payload.sessionId`, looks up the session, returns `{ text: PtyBridge.readScreenText() }`. If the session is unknown, returns `{ text: "" }` (see Error Handling).
  - Per-session raw-byte broadcast loop: on session registration, launch a coroutine that collects `PtyBridge.rawByteFlow`, batches bytes (see Protocol Details), and broadcasts `pty:raw-bytes` push events.

### Desktop changes (`youcoded/desktop/`)

**`src/main/preload.ts` and `src/renderer/remote-shim.ts`:**
- Both gain `window.claude.terminal.getScreenText(sessionId: string): Promise<string>`.
- Desktop implementation routes to `terminal-registry.ts` via a new IPC channel `terminal:get-screen-text`. The existing `getScreenText` function there already returns text from the xterm buffer; wrap it in an `ipcMain.handle`.
- Android (remote-shim) implementation sends the `terminal:get-screen-text` WebSocket request-response message.

**`src/renderer/hooks/useAttentionClassifier.ts`:**
- Replace the direct `getScreenText(sessionId)` import from `terminal-registry.ts` with `window.claude.terminal.getScreenText(sessionId)`.
- The tick gate (`isThinking && !hasRunningTools && !hasAwaitingApproval && visible`) is unchanged.
- The `classifyBuffer` call is unchanged.
- Result: identical classifier behavior on both platforms, single source of truth for patterns.

## Protocol Details

### Message type: `terminal:get-screen-text`

Request-response. Must have identical type string across `preload.ts`, `remote-shim.ts`, `ipc-handlers.ts`, and `SessionService.kt`.

**Request:**
```json
{ "type": "terminal:get-screen-text", "id": "msg-123", "payload": { "sessionId": "..." } }
```

**Response:**
```json
{ "type": "terminal:get-screen-text:response", "id": "msg-123", "payload": { "text": "..." } }
```

**Unknown `sessionId`:** payload is `{ "text": "" }` (not an error). The classifier tolerates empty buffers today (pre-mount, pre-first-byte), and returning an error would force every caller to branch.

### Message type: `pty:raw-bytes`

Push broadcast (no `id`). Must have identical type string across all four IPC surfaces.

**Shape:**
```json
{ "type": "pty:raw-bytes", "payload": { "sessionId": "...", "data": "<base64>" } }
```

**Base64 rationale:** JSON can't carry raw binary, UTF-8 encoding corrupts any byte that isn't valid UTF-8 (high-bit ANSI control bytes are common in terminal streams), and base64 over localhost WebSocket has negligible cost. xterm.js's `write()` accepts `Uint8Array`, which is one base64-decode away from the wire format.

**Batching:** `SessionService` debounces — flushes the accumulated byte buffer every **16ms** (≈ one 60fps frame) OR when the buffer exceeds **8KB**, whichever comes first. Keeps small bursts coalesced without adding perceptible latency under heavy Ink repaint. Values are starting points; we may tune them during dogfooding if the byte stream shows observable problems, but neither should grow without a recorded reason.

**Broadcast recipients:** all authenticated WebSocket clients. No per-client subscription management in Tier 1 — the stream is cheap, and every remote client that connects will want it when xterm.js lands in Tier 2.

## Parity Invariants (will become PITFALLS entries)

- **Message type strings live in `IPC` constants on desktop and as string literals in `SessionService.kt`**, identical on both sides. `ipc-channels.test.ts` adds `terminal:get-screen-text` and `pty:raw-bytes` to its parity matrix.
- **The vendored `terminal-emulator-vendored/` module is never edited outside the documented patch.** The `VENDORED.md` file is the lock record; any further change requires updating it. If the patch grows beyond "add one listener + call it from `append()`", stop, reconsider, and split the patch into a separate concern.
- **`RawByteListener` fires on the terminal thread** (same thread that calls `TerminalEmulator.append()`). `PtyBridge.rawByteFlow` uses `tryEmit` on a buffered `MutableSharedFlow` so the listener never blocks the emulator thread. Dropped emissions are acceptable because Tier 1 has no render consumer that depends on byte-perfect delivery.
- **The classifier runs from the same `classifyBuffer` function on both platforms.** Patterns are Claude Code CLI-version-sensitive (existing PITFALLS note); a single source of truth is a hard requirement. Any pattern change ships with a matching fixture addition.
- **Raw-byte buffer copying is mandatory.** Termux reuses the same `byte[]` across reads. The `RawByteListener` implementation in `PtyBridge` must copy bytes before emitting; forwarding the shared buffer directly races with the next read.

## Error Handling

- **WebSocket disconnect mid-stream:** push events just stop arriving. The next reconnect's `chat:hydrate` reseeds higher-level state; xterm-side (Tier 2) will handle gaps in its own way. Tier 1 has no render consumer so no extra handling is needed.
- **Vendored-module load failure** (missing class, Gradle misconfiguration): fails at compile time, not runtime. Detected before shipping.
- **Classifier fixture divergence between desktop and Android:** parity test fails in CI, blocks merge. No runtime error path — this is a test-time contract.
- **Screen text read during a `TerminalSession` resize race:** `PtyBridge.readScreenText()` already swallows exceptions from `TerminalBuffer` (existing try-catch at `PtyBridge.kt:206–222`). Unchanged.
- **Slow raw-byte consumer:** the bounded `MutableSharedFlow` drops bytes rather than blocking. In Tier 1 this is silent because nothing is consuming. In Tier 2, if xterm-in-WebView falls behind, we'll need to revisit (either bigger buffer, or flow-control via ACK messages like xterm.js's official flow-control guide).

## Testing

### Classifier parity fixtures (new)

Location: `youcoded/shared-fixtures/attention-classifier/`

Each fixture is a pair:
- `<name>.input.txt` — a screen-text snapshot (plain text, last ~40 lines as the classifier sees them)
- `<name>.expected.json` — expected `{ state: AttentionState }` output

Seed fixtures cover the known states:
- `ok-thinking.input.txt` — fresh spinner with "esc to cancel" marker → `ok`
- `awaiting-input.input.txt` — permission prompt visible → `awaiting-input`
- `shell-idle.input.txt` — bash prompt visible → `shell-idle`
- `error.input.txt` — red error banner → `error`
- `stuck.input.txt` — thinking with no progress markers → `stuck`
- Edge cases: ANSI-color-stripped output, truncated last line, window-wrap boundary, multi-byte char at truncation point.

### Parity test (new)

`youcoded/desktop/tests/attention-classifier-parity.test.ts`

Reads every fixture, runs `classifyBuffer(input)`, asserts `state === expected.state` byte-equal. Mirrors the existing `transcript-parity.test.ts` pattern — same directory structure, same fixture convention. Adding a new state or tweaking a regex pattern requires a fixture change in the same commit.

### Cross-platform IPC parity test (extended)

`youcoded/desktop/tests/ipc-channels.test.ts` gets two new entries: `terminal:get-screen-text` and `pty:raw-bytes`. The existing test asserts the same channel name appears in `preload.ts`, `remote-shim.ts`, `ipc-handlers.ts`, and (by grep) in `SessionService.kt`.

### Raw-byte stream contract test (new)

`youcoded/desktop/tests/raw-byte-listener-contract.test.ts`

Asserts the `pty:raw-bytes` message shape: base64 round-trips cleanly (including high-bit bytes), required keys (`sessionId`, `data`) are present, `data` is a string. Belt-and-suspenders for the WebSocket contract.

### Android-side unit test (new)

`youcoded/app/src/test/kotlin/com/youcoded/app/runtime/RawByteListenerTest.kt`

Instantiates the vendored `TerminalEmulator` directly, registers a listener, calls `append(bytes, len)` with a known buffer, asserts the listener received the exact bytes before parsing. Proves the vendored patch works at the Java level without needing a running PTY.

### Manual verification plan

1. Build Android APK, run alongside desktop (both connected to a fresh Claude session).
2. Trigger a long-running thinking state (ask Claude a complex question).
3. Confirm the `AttentionBanner` appears on Android within ~30s of thinking → stuck transition, matching desktop's behavior for the same session.
4. Confirm native TerminalView still renders normally, typing still works, scrolling still works — no regression.
5. Temporarily add a `console.log` in `remote-shim.ts`'s `pty:raw-bytes` handler to confirm bytes arrive when Claude runs on Android. Remove before merge.

### What we explicitly don't test

- Timing precision of the 16ms batch debounce — the budget is "no perceptible latency", not a specific number.
- Memory overhead of the vendored module under load — if it becomes a concern, add profiling later.
- xterm.js compatibility of the raw-byte stream — that's Tier 2's problem.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Termux emulator's `append()` signature changes in a future version | `VENDORED.md` records exact tag + patch; re-vendor is a documented procedure. The patch is small enough to re-apply in minutes. |
| `RawByteListener` fires on the terminal thread and a slow listener blocks the emulator | `PtyBridge.rawByteFlow` uses a bounded `MutableSharedFlow` with `tryEmit` — never blocks the terminal thread. Overflow drops bytes (acceptable since Tier 1 has no renderer consumer). |
| Base64 encoding overhead at high byte rates | 16ms debounce batches small bursts; base64 is ~33% larger than raw, negligible on localhost WebSocket. |
| Classifier regex behavior differs between xterm's `getScreenText` (desktop) and Termux's `readScreenText` (Android) because of subtle line-wrap or padding differences | Shared fixtures test both paths through the same `classifyBuffer` function. If divergence surfaces, the fix is normalizing whitespace/padding in one of the two screen-text sources, not touching the classifier. |
| Vendored module build order surprises (Kotlin modules depending on vendored Java source) | Small enough that `./gradlew assembleDebug` failure shows up immediately during dogfooding. No runtime risk. |
| The classifier starts running on Android and surfaces existing reducer bugs that were latent because the classifier never ran there before | Part of manual verification — if `ATTENTION_STATE_CHANGED` causes wrong banner rendering on Android, it's a pre-existing reducer bug that we'd also fix as part of this work. |
| Termux reuses the `byte[]` buffer across PTY reads, so a naive `tryEmit` of the buffer leaks bytes between reads | The `RawByteListener` implementation in `PtyBridge` always copies bytes before emitting. Enforced by code review; not catchable by unit test because Termux's shared buffer isn't visible from the test harness. |

## Done Criteria

- All Gradle/TS builds green on both platforms.
- All new tests pass: classifier parity fixtures, IPC channel parity, raw-byte contract, Android unit test for `RawByteListener`.
- Manual verification: attention classifier runs on standalone Android (native app, no desktop pairing), produces the same banner transitions as desktop for a synthetic long-thinking scenario.
- No regression in typing, scrolling, IME, gesture behavior on Android.
- PITFALLS.md has entries for: vendored-module patch invariant, `RawByteListener` threading rule, base64 `pty:raw-bytes` contract, classifier fixture dependency, buffer-copy requirement.
- `docs/cc-dependencies.md` gets an entry for the Android classifier (adds another consumer of CC spinner/prompt text patterns).
- `docs/android-runtime.md` gains a short section on "Vendored Termux terminal-emulator module".
- Branch merges to `master` with the full test and doc set green.

## Deferred to Tier 2 (explicitly out of this plan)

- Consuming `pty:raw-bytes` in React via xterm.js-in-WebView.
- xterm.js-in-WebView perf/IME/gesture evaluation on Android.
- Removing the native Termux `TerminalView` layer from `ChatScreen.kt`.
- Deleting `screenVersion` plumbing and the dual-emulator parse.
- Upstream PR to Termux for a `RawByteListener` API (would let us drop the vendored module).
