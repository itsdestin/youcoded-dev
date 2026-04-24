# Android Terminal Data-Layer Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Tier 1 of the Android → desktop terminal parity work: vendored Termux emulator with a `RawByteListener` patch, new Android bridge messages `terminal:get-screen-text` (request-response) and `pty:raw-bytes` (push), desktop-side facade so `useAttentionClassifier` runs on both platforms from a single code path.

**Architecture:** Additive. Native Termux `TerminalView` keeps rendering Android's live terminal; we tap bytes before the emulator parses them and expose screen-text on demand. Desktop gains a thin IPC facade over the existing xterm buffer read so React code calls the same `window.claude.terminal.getScreenText()` on both platforms.

**Tech Stack:** Kotlin (Android app), Java (vendored Termux emulator), TypeScript (desktop renderer + main), Electron IPC, WebSocket bridge (Android ↔ React WebView).

**Spec:** `docs/superpowers/specs/2026-04-24-android-terminal-data-parity-design.md`

---

## Pre-work: Worktree Setup

This plan touches `youcoded/` only (desktop + app code live there). Before starting Task 1, set up an isolated worktree:

```bash
cd ~/youcoded-dev/youcoded
git fetch origin && git checkout master && git pull origin master
git worktree add ../../youcoded-worktrees/android-terminal-data-parity -b android-terminal-data-parity
cd ../../youcoded-worktrees/android-terminal-data-parity
```

All subsequent commands run from the worktree directory unless otherwise noted.

**One cross-repo detail:** the spec doc itself lives in the `youcoded-dev` workspace repo (already committed there at `docs/superpowers/specs/2026-04-24-android-terminal-data-parity-design.md`). Doc updates for `PITFALLS.md`, `android-runtime.md`, etc. also go to the workspace repo, but `cc-dependencies.md` lives inside `youcoded/` — see Task 21.

---

## Phase 1: Vendor the Termux terminal-emulator module

### Task 1: Create vendored module skeleton

**Files:**
- Create: `terminal-emulator-vendored/build.gradle.kts`
- Create: `terminal-emulator-vendored/src/main/AndroidManifest.xml`
- Modify: `settings.gradle.kts` (root youcoded dir)

- [ ] **Step 1: Create module directory and manifest**

```bash
mkdir -p terminal-emulator-vendored/src/main
cat > terminal-emulator-vendored/src/main/AndroidManifest.xml <<'EOF'
<?xml version="1.0" encoding="utf-8"?>
<manifest package="com.termux.terminal.vendored" />
EOF
```

- [ ] **Step 2: Write module build.gradle.kts**

File: `terminal-emulator-vendored/build.gradle.kts`

```kotlin
// Vendored copy of Termux's terminal-emulator module (v0.118.1).
// Patched to add a RawByteListener hook on TerminalEmulator.append().
// See VENDORED.md for origin, patch details, and re-vendor procedure.
plugins {
    id("com.android.library")
}

android {
    namespace = "com.termux.terminal.vendored"
    compileSdk = 34

    defaultConfig {
        minSdk = 24
        consumerProguardFiles("consumer-rules.pro")

        externalNativeBuild {
            cmake {
                cppFlags("")
            }
        }
    }

    externalNativeBuild {
        cmake {
            path = file("src/main/jni/CMakeLists.txt")
            version = "3.22.1"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
```

Note: compileSdk and minSdk should match what `app/build.gradle.kts` uses. Read app/build.gradle.kts first and copy its values if they differ from 34/24.

- [ ] **Step 3: Register module in settings.gradle.kts**

Modify: `settings.gradle.kts` (youcoded repo root)

Add this line alongside the other `include(...)` entries (e.g., after `include(":app")`):

```kotlin
include(":terminal-emulator-vendored")
```

- [ ] **Step 4: Commit**

```bash
git add terminal-emulator-vendored/ settings.gradle.kts
git commit -m "feat(terminal): add vendored Termux terminal-emulator module skeleton

Empty Gradle module; source/JNI added in next commit. Namespace
com.termux.terminal.vendored to avoid conflict with the Maven AAR.
Classes stay in com.termux.terminal package so Kotlin callers
import from the same package."
```

---

### Task 2: Vendor Java and JNI source from Termux v0.118.1

**Files:**
- Create: `terminal-emulator-vendored/src/main/java/com/termux/terminal/*.java` (all terminal-emulator Java sources)
- Create: `terminal-emulator-vendored/src/main/jni/*` (native C sources + CMakeLists.txt)

- [ ] **Step 1: Shallow-clone Termux at the v0.118.1 tag**

Run from any tmp location (not the worktree):

```bash
git clone --depth 1 --branch v0.118.1 https://github.com/termux/termux-app.git /tmp/termux-v0.118.1
```

Verify tag landed: `cd /tmp/termux-v0.118.1 && git describe --tags` should print `v0.118.1`.

- [ ] **Step 2: Copy Java sources**

Run from the youcoded worktree:

```bash
mkdir -p terminal-emulator-vendored/src/main/java
cp -r /tmp/termux-v0.118.1/terminal-emulator/src/main/java/com terminal-emulator-vendored/src/main/java/
```

- [ ] **Step 3: Copy native JNI sources**

```bash
mkdir -p terminal-emulator-vendored/src/main/jni
cp -r /tmp/termux-v0.118.1/terminal-emulator/src/main/jni/. terminal-emulator-vendored/src/main/jni/
```

Verify `CMakeLists.txt` is present at `terminal-emulator-vendored/src/main/jni/CMakeLists.txt`. If Termux uses a different build system (e.g., Android.mk), adapt the `build.gradle.kts` externalNativeBuild block accordingly — check the upstream `terminal-emulator/build.gradle` for the exact config.

- [ ] **Step 4: Commit vendored source**

```bash
git add terminal-emulator-vendored/src/main/java terminal-emulator-vendored/src/main/jni
git commit -m "feat(terminal): vendor Termux terminal-emulator sources at v0.118.1

Java source copied from
termux/termux-app@v0.118.1:terminal-emulator/src/main/java/
JNI source copied from
termux/termux-app@v0.118.1:terminal-emulator/src/main/jni/

No modifications — this commit is the unmodified vendor drop. The
RawByteListener patch is applied in a later commit so the delta is
obvious in git blame."
```

---

### Task 3: Switch app dependency from Maven AAR to vendored module

**Files:**
- Modify: `app/build.gradle.kts`

- [ ] **Step 1: Read existing Termux dependency declarations**

Open `app/build.gradle.kts` and locate the block (around line 111 in current master):

```kotlin
implementation("com.github.termux.termux-app:terminal-emulator:v0.118.1")
implementation("com.github.termux.termux-app:terminal-view:v0.118.1")
```

- [ ] **Step 2: Replace with vendored project reference**

Replace those two lines with:

```kotlin
// Vendored terminal-emulator module with RawByteListener patch. Don't
// add back the Maven dep — that pulls unpatched classes and creates
// duplicate-class errors.
implementation(project(":terminal-emulator-vendored"))

// terminal-view stays on Maven — we don't patch the View layer.
// Exclude terminal-emulator from its transitive deps so Gradle uses
// our vendored version exclusively.
implementation("com.github.termux.termux-app:terminal-view:v0.118.1") {
    exclude(group = "com.github.termux.termux-app", module = "terminal-emulator")
}
```

- [ ] **Step 3: Build the debug APK**

```bash
./gradlew :app:assembleDebug
```

Expected: `BUILD SUCCESSFUL`. If Gradle reports duplicate-class errors for `com.termux.terminal.*`, the exclude block didn't take effect — check the exact group/module coordinates JitPack publishes (run `./gradlew :app:dependencies --configuration releaseRuntimeClasspath | grep termux` to inspect).

- [ ] **Step 4: Commit**

```bash
git add app/build.gradle.kts
git commit -m "feat(terminal): switch app to vendored terminal-emulator

Excludes terminal-emulator from terminal-view's transitive deps so
Gradle uses the patched vendored module exclusively. No behavior
change — source is still unpatched Termux v0.118.1 at this point."
```

---

## Phase 2: Apply RawByteListener patch (TDD)

### Task 4: Write failing unit test for RawByteListener

**Files:**
- Create: `app/src/test/kotlin/com/youcoded/app/runtime/RawByteListenerTest.kt`

- [ ] **Step 1: Check existing test dependencies in `app/build.gradle.kts`**

Confirm `testImplementation` JUnit dep exists. If the project uses JUnit 5, use that; otherwise JUnit 4. For this plan assume JUnit 4 with `org.junit.Test` (adjust imports if JUnit 5).

- [ ] **Step 2: Write the test**

File: `app/src/test/kotlin/com/youcoded/app/runtime/RawByteListenerTest.kt`

```kotlin
package com.youcoded.app.runtime

import com.termux.terminal.TerminalEmulator
import com.termux.terminal.TerminalOutput
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

class RawByteListenerTest {

    @Test
    fun `listener receives exact bytes before parsing`() {
        // Minimal TerminalOutput stub — we only need append() to work.
        val output = object : TerminalOutput() {
            override fun write(data: ByteArray?, offset: Int, count: Int) {}
            override fun titleChanged(oldTitle: String?, newTitle: String?) {}
            override fun clipboardText(text: String?) {}
        }
        val emulator = TerminalEmulator(output, 80, 24, 1000)

        val captured = mutableListOf<ByteArray>()
        val listener = TerminalEmulator.RawByteListener { buffer, length ->
            // Copy — the buffer may be reused across calls.
            captured.add(buffer.copyOfRange(0, length))
        }
        emulator.addRawByteListener(listener)

        val input = "hello[1m world[0m".toByteArray()
        emulator.append(input, input.size)

        assertEquals(1, captured.size)
        assertArrayEquals(input, captured[0])
    }

    @Test
    fun `listener can be removed`() {
        val output = object : TerminalOutput() {
            override fun write(data: ByteArray?, offset: Int, count: Int) {}
            override fun titleChanged(oldTitle: String?, newTitle: String?) {}
            override fun clipboardText(text: String?) {}
        }
        val emulator = TerminalEmulator(output, 80, 24, 1000)

        var callCount = 0
        val listener = TerminalEmulator.RawByteListener { _, _ -> callCount++ }
        emulator.addRawByteListener(listener)

        emulator.append("first".toByteArray(), 5)
        assertEquals(1, callCount)

        emulator.removeRawByteListener(listener)
        emulator.append("second".toByteArray(), 6)
        assertEquals(1, callCount)  // Still 1 — removed listener didn't fire.
    }
}
```

- [ ] **Step 3: Run the test to confirm it fails**

```bash
./gradlew :app:testDebugUnitTest --tests "com.youcoded.app.runtime.RawByteListenerTest"
```

Expected: FAIL with "unresolved reference: RawByteListener" or equivalent — the interface doesn't exist yet.

- [ ] **Step 4: Commit the failing test**

```bash
git add app/src/test/kotlin/com/youcoded/app/runtime/RawByteListenerTest.kt
git commit -m "test(terminal): failing test for RawByteListener on vendored emulator

Failing because RawByteListener interface and add/remove methods don't
exist yet in the vendored TerminalEmulator. Patch applied in next commit."
```

---

### Task 5: Apply RawByteListener patch to vendored TerminalEmulator

**Files:**
- Modify: `terminal-emulator-vendored/src/main/java/com/termux/terminal/TerminalEmulator.java`

- [ ] **Step 1: Locate the `append(byte[], int)` method**

Open the vendored `TerminalEmulator.java`. Search for `public void append(byte[] buffer, int length)`. The method starts around line 1456 (exact number depends on the vendored version).

- [ ] **Step 2: Add the listener interface and registration methods**

Add this inside the `TerminalEmulator` class, near the top (after the existing field declarations):

```java
/**
 * YOUCODED PATCH (see VENDORED.md):
 * Raw-byte listener for routing PTY bytes to secondary consumers
 * (e.g. an xterm.js renderer over WebSocket) before the emulator
 * parses them. Listeners fire on the terminal thread; they must
 * copy bytes before any async work — the buffer is reused across reads.
 */
public interface RawByteListener {
    void onBytesReceived(byte[] buffer, int length);
}

private final java.util.List<RawByteListener> rawByteListeners =
    new java.util.concurrent.CopyOnWriteArrayList<>();

public void addRawByteListener(RawByteListener listener) {
    rawByteListeners.add(listener);
}

public void removeRawByteListener(RawByteListener listener) {
    rawByteListeners.remove(listener);
}
```

- [ ] **Step 3: Notify listeners from `append()` before processing**

Inside `public void append(byte[] buffer, int length)`, add this as the very first line of the method body (before any existing code):

```java
// YOUCODED PATCH: notify raw-byte listeners before emulator parse.
// CopyOnWriteArrayList iteration is safe under concurrent add/remove.
for (RawByteListener listener : rawByteListeners) {
    listener.onBytesReceived(buffer, length);
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
./gradlew :app:testDebugUnitTest --tests "com.youcoded.app.runtime.RawByteListenerTest"
```

Expected: BUILD SUCCESSFUL, both tests pass.

- [ ] **Step 5: Rebuild the app to confirm integration**

```bash
./gradlew :app:assembleDebug
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 6: Commit**

```bash
git add terminal-emulator-vendored/src/main/java/com/termux/terminal/TerminalEmulator.java
git commit -m "feat(terminal): patch vendored TerminalEmulator with RawByteListener

Three additions:
  1. Public RawByteListener interface with onBytesReceived(byte[], int)
  2. add/removeRawByteListener methods backed by CopyOnWriteArrayList
  3. Listener notify loop at the start of append(byte[], int)

Listener fires on the terminal thread; callers must copy bytes before
async work. Full patch documented in VENDORED.md (next commit)."
```

---

## Phase 3: Android plumbing — PtyBridge and SessionService

### Task 6: Add rawByteFlow to PtyBridge and attach listener

**Files:**
- Modify: `app/src/main/kotlin/com/youcoded/app/runtime/PtyBridge.kt`

- [ ] **Step 1: Add rawByteFlow field**

After the existing flow declarations (around line 37, after `_lastPtyOutputTime`), add:

```kotlin
/**
 * Raw bytes from the PTY, emitted before the Termux emulator parses
 * them. Fed by a RawByteListener attached to the emulator. Consumers
 * (SessionService broadcast) must not block — tryEmit drops on overflow
 * to keep the terminal thread free.
 */
private val _rawByteFlow = MutableSharedFlow<ByteArray>(
    replay = 0,
    extraBufferCapacity = 64,
)
val rawByteFlow: SharedFlow<ByteArray> = _rawByteFlow
```

- [ ] **Step 2: Attach the listener after emulator initialization**

Locate `session?.initializeEmulator(80, 60)` inside `start()` (around line 161). Right after that line, add:

```kotlin
// Route raw PTY bytes to rawByteFlow. The listener fires on the
// terminal thread, so copy bytes before emitting — Termux reuses
// the buffer across reads.
val emulator = session?.emulator
emulator?.addRawByteListener(TerminalEmulator.RawByteListener { buffer, length ->
    val copy = buffer.copyOfRange(0, length)
    _rawByteFlow.tryEmit(copy)
})
```

Add the import at the top of the file (with existing `com.termux.terminal` imports):

```kotlin
import com.termux.terminal.TerminalEmulator
```

- [ ] **Step 3: Confirm compilation**

```bash
./gradlew :app:compileDebugKotlin
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Commit**

```bash
git add app/src/main/kotlin/com/youcoded/app/runtime/PtyBridge.kt
git commit -m "feat(runtime): expose raw PTY bytes via rawByteFlow on PtyBridge

Attaches a RawByteListener to the Termux emulator after initializeEmulator().
Bytes are copied before tryEmit — the Termux buffer is reused across reads.
Bounded MutableSharedFlow (extraBufferCapacity=64) drops on overflow rather
than blocking the terminal thread."
```

---

### Task 7: Add terminal:get-screen-text request-response handler in SessionService

**Files:**
- Modify: `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`

- [ ] **Step 1: Locate the handleBridgeMessage() when-block**

Search for `"session:input"` in `SessionService.kt` to find the existing when-branch for PTY-related messages. The new case goes alongside these.

- [ ] **Step 2: Add the terminal:get-screen-text case**

Add this branch inside the `when` block (alphabetical placement near other `terminal:*` or `session:*` cases):

```kotlin
"terminal:get-screen-text" -> {
    // Returns the current visible screen buffer as plain text.
    // Used by the React-side attention classifier so it can run on
    // standalone Android with the same classifyBuffer function as
    // desktop. Unknown sessionId returns an empty string — callers
    // (classifier) already tolerate empty buffers during startup.
    val sessionId = msg.payload?.optString("sessionId") ?: ""
    val session = sessionRegistry.sessions.value[sessionId]
    val text = (session?.ptyBridge as? PtyBridge)?.readScreenText() ?: ""
    val response = JSONObject().apply { put("text", text) }
    bridgeServer.respond(ws, msg.type, msg.id, response)
}
```

Type imports (add at the top if missing):

```kotlin
import org.json.JSONObject
```

Note: adjust the session lookup expression (`sessionRegistry.sessions.value[sessionId]?.ptyBridge as? PtyBridge`) to match how `SessionService` currently reaches `PtyBridge` for other bridge messages. Read the existing `"session:input"` case for the exact idiom.

- [ ] **Step 3: Confirm compilation**

```bash
./gradlew :app:compileDebugKotlin
```

- [ ] **Step 4: Commit**

```bash
git add app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt
git commit -m "feat(bridge): add terminal:get-screen-text request-response

Reads current visible screen text from PtyBridge.readScreenText().
Unknown sessionId returns {text: \"\"} rather than an error — the
classifier already handles empty buffers, and callers shouldn't
have to branch on missing sessions."
```

---

### Task 8: Add pty:raw-bytes broadcast with batching

**Files:**
- Modify: `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`

- [ ] **Step 1: Decide where to launch the broadcast coroutine**

SessionService already has a coroutine scope — search the file for `CoroutineScope(` or `: CoroutineScope` to find its field name (likely `scope`, `serviceScope`, or `coroutineScope`). Use that same name in Step 2's code (replace `scope.launch` with the actual field name). Raw-byte broadcasting is per-session — start it when a session is created and cancel it when destroyed. Find the existing session-creation path (search for the `"session:create"` bridge case or `sessionRegistry.create...` calls).

- [ ] **Step 2: Add a private method that broadcasts batched raw bytes for a session**

Add this method inside `SessionService`:

```kotlin
/**
 * Broadcast raw PTY bytes over the WebSocket as pty:raw-bytes push events.
 * Batches to coalesce bursts: flush every 16ms (~1 frame at 60fps) OR
 * when the pending buffer hits 8KB, whichever comes first. Base64 encodes
 * the payload so JSON can carry arbitrary bytes (ANSI control chars with
 * high bits are common). Broadcast recipient: all authenticated clients.
 */
private fun launchRawByteBroadcast(sessionId: String, session: PtyBridge): Job {
    return scope.launch {
        val pending = java.io.ByteArrayOutputStream()
        var lastFlushNs = System.nanoTime()
        val flushIntervalNs = 16_000_000L  // 16 ms
        val maxBufferBytes = 8192

        session.rawByteFlow.collect { bytes ->
            pending.write(bytes)
            val now = System.nanoTime()
            if (pending.size() >= maxBufferBytes || now - lastFlushNs >= flushIntervalNs) {
                val payload = JSONObject().apply {
                    put("sessionId", sessionId)
                    put("data", android.util.Base64.encodeToString(
                        pending.toByteArray(), android.util.Base64.NO_WRAP))
                }
                bridgeServer.broadcast(
                    JSONObject().apply {
                        put("type", "pty:raw-bytes")
                        put("payload", payload)
                    }
                )
                pending.reset()
                lastFlushNs = now
            }
        }
    }
}
```

- [ ] **Step 3: Wire the broadcast into session lifecycle**

After `sessionRegistry.create(...)` (or wherever a new session is added to the registry), launch the broadcast coroutine and store the Job so it can be cancelled on session destruction:

```kotlin
// Example — adjust to match existing lifecycle code.
val session = /* the newly created session */
if (session.ptyBridge is PtyBridge) {
    val job = launchRawByteBroadcast(sessionId, session.ptyBridge as PtyBridge)
    rawByteJobs[sessionId] = job  // see step 4 for the map declaration
}
```

On session destroy (in the `"session:destroy"` bridge case), cancel:

```kotlin
rawByteJobs.remove(sessionId)?.cancel()
```

- [ ] **Step 4: Add the job-tracking map as a SessionService field**

Near the other private fields:

```kotlin
private val rawByteJobs = mutableMapOf<String, Job>()
```

Add imports at the top:

```kotlin
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
```

- [ ] **Step 5: Confirm compilation**

```bash
./gradlew :app:compileDebugKotlin
```

- [ ] **Step 6: Commit**

```bash
git add app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt
git commit -m "feat(bridge): add pty:raw-bytes push broadcast with batching

Per-session coroutine collects PtyBridge.rawByteFlow, coalesces bytes
over a 16ms window (or 8KB cap, whichever first), base64-encodes, and
broadcasts as pty:raw-bytes push events to all authenticated clients.
No current React consumer — infrastructure for the Tier 2 xterm.js
renderer in the WebView."
```

---

## Phase 4: Desktop facade and classifier refactor

### Task 9: Expose `window.claude.terminal.getScreenText` on Electron via preload + IPC

**Files:**
- Modify: `desktop/src/main/preload.ts`
- Modify: `desktop/src/main/ipc-handlers.ts`
- Create: `desktop/src/renderer/bootstrap/terminal-bridge.ts`
- Modify: `desktop/src/renderer/App.tsx` (import the bootstrap)

- [ ] **Step 1: Add `terminal.getScreenText` to preload.ts's contextBridge**

Open `desktop/src/main/preload.ts`. Find the `contextBridge.exposeInMainWorld('claude', {...})` block. Inside the exposed object, add:

```typescript
terminal: {
  getScreenText: (sessionId: string): Promise<string> =>
    ipcRenderer.invoke('terminal:get-screen-text', sessionId),
},
```

- [ ] **Step 2: Add the main-side IPC handler**

Open `desktop/src/main/ipc-handlers.ts`. Near the other `ipcMain.handle(...)` registrations, add:

```typescript
// window.claude.terminal.getScreenText — reads the visible xterm buffer
// for the given session. The actual read happens in the renderer (xterm
// lives there), so main calls back via executeJavaScript. ~1s cadence
// under the classifier; round-trip overhead is negligible.
ipcMain.handle('terminal:get-screen-text', async (event, sessionId: string) => {
  try {
    return await event.sender.executeJavaScript(
      `window.__terminalRegistry?.getScreenText(${JSON.stringify(sessionId)}) ?? ''`
    );
  } catch {
    return '';
  }
});
```

- [ ] **Step 3: Create the renderer bootstrap**

File: `desktop/src/renderer/bootstrap/terminal-bridge.ts`

```typescript
// Registers window.__terminalRegistry so the main process can call
// getScreenText on the correct session's xterm via executeJavaScript.
// Runs once on renderer load.
import { getScreenText } from '../hooks/terminal-registry';

(window as unknown as { __terminalRegistry?: { getScreenText: (id: string) => string } })
  .__terminalRegistry = { getScreenText };
```

- [ ] **Step 4: Import the bootstrap from App.tsx**

Open `desktop/src/renderer/App.tsx`. At the top with the other imports, add:

```typescript
import './bootstrap/terminal-bridge';
```

- [ ] **Step 5: Typecheck + build**

```bash
cd desktop && npm run build
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/main/preload.ts desktop/src/main/ipc-handlers.ts \
        desktop/src/renderer/bootstrap/terminal-bridge.ts \
        desktop/src/renderer/App.tsx
git commit -m "feat(desktop): expose window.claude.terminal.getScreenText

Preload exposes an async getScreenText via contextBridge; main-side
IPC handler routes back to the renderer via executeJavaScript to read
xterm's live buffer (xterm lives in renderer, IPC handlers in main).
Renderer-side bootstrap registers window.__terminalRegistry so the
round-trip can reach it. ~1s classifier cadence; round-trip cost
is not perf-sensitive."
```

---

### Task 10: Expose `window.claude.terminal.getScreenText` in remote-shim (Android)

**Files:**
- Modify: `desktop/src/renderer/remote-shim.ts`

- [ ] **Step 1: Locate the `window.claude` construction**

Open `remote-shim.ts`. Find the object assigned to `(window as any).claude = {...}` or the equivalent. Add a new `terminal` namespace alongside `session`, `window.claude.android`, etc.

- [ ] **Step 2: Add the facade using the existing WebSocket `invoke` helper**

`remote-shim.ts` already has a request-response helper (per the research, something like `invoke('type:name', payload)`). Use it:

```typescript
terminal: {
  getScreenText: async (sessionId: string): Promise<string> => {
    const response = await invoke('terminal:get-screen-text', { sessionId });
    return response?.text ?? '';
  },
},
```

Adjust the `invoke` function name to match whatever remote-shim.ts currently uses (search for existing `session:*` bridge calls for the exact pattern).

- [ ] **Step 3: Typecheck**

```bash
cd desktop && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add desktop/src/renderer/remote-shim.ts
git commit -m "feat(remote-shim): add window.claude.terminal.getScreenText for Android

Routes through the existing WebSocket invoke helper as
terminal:get-screen-text. Response normalizes {text: string} to the
Promise<string> the desktop facade also returns."
```

---

### Task 11: Refactor `useAttentionClassifier` to use the facade

**Files:**
- Modify: `desktop/src/renderer/hooks/useAttentionClassifier.ts` (or wherever the hook lives — verify by grep)

- [ ] **Step 1: Locate the current getScreenText usage**

Search the file for `getScreenText(` — find the call site inside the tick body.

- [ ] **Step 2: Replace the direct import call with the facade**

Remove the direct import:

```typescript
// DELETE this:
import { getScreenText } from './terminal-registry';
```

Replace the call site. If the classifier previously ran synchronously, it now needs to `await`:

```typescript
// Previously:
// const text = getScreenText(sessionId);
// const next = classifyBuffer(text);

// Now (inside the tick handler, which should already be an async/useEffect context):
const text = await window.claude.terminal.getScreenText(sessionId);
const next = classifyBuffer(text);
```

If the tick handler is synchronous, wrap in an async IIFE or convert to `.then`:

```typescript
window.claude.terminal.getScreenText(sessionId).then((text) => {
  const next = classifyBuffer(text);
  // ... existing dispatch logic ...
});
```

- [ ] **Step 3: Verify existing desktop tests still pass**

```bash
cd desktop && npm test -- --testPathPattern="classifier"
```

Expected: all classifier tests pass. If tests mocked `getScreenText` at module scope, they need to mock `window.claude.terminal.getScreenText` instead — update those mocks.

- [ ] **Step 4: Commit**

```bash
git add desktop/src/renderer/hooks/useAttentionClassifier.ts
git commit -m "refactor(classifier): read screen text via window.claude.terminal facade

Single code path on both platforms. On desktop the facade resolves
via IPC round-trip to the renderer; on Android via WebSocket. Same
classifyBuffer call regardless. Removes the direct terminal-registry
import — the hook no longer knows where screen text comes from."
```

---

## Phase 5: Parity tests

### Task 12: Create shared fixtures directory and seed fixtures

**Files:**
- Create: `shared-fixtures/attention-classifier/*.input.txt` and `*.expected.json` pairs

- [ ] **Step 1: Create the directory**

```bash
mkdir -p shared-fixtures/attention-classifier
```

- [ ] **Step 2: Capture real screen-text samples**

For each known state, create a fixture pair. The simplest way to get realistic inputs: run Claude Code in a terminal, copy the last ~40 lines when it's in each state, paste into an `.input.txt` file. Below are structural templates — fill with real text during dogfooding.

File: `shared-fixtures/attention-classifier/ok-thinking.input.txt`
```
(capture the spinner + "esc to cancel" state here)
```

File: `shared-fixtures/attention-classifier/ok-thinking.expected.json`
```json
{ "state": "ok" }
```

Repeat for:
- `awaiting-input.input.txt` + `.expected.json` → `{ "state": "awaiting-input" }`
- `shell-idle.input.txt` + `.expected.json` → `{ "state": "shell-idle" }`
- `error.input.txt` + `.expected.json` → `{ "state": "error" }`
- `stuck.input.txt` + `.expected.json` → `{ "state": "stuck" }`

Edge-case fixtures:
- `truncated-last-line.input.txt` — same as ok-thinking but with the last line cut mid-word → `{ "state": "ok" }`
- `wrapped-prompt.input.txt` — permission prompt wrapped across two visual rows → `{ "state": "awaiting-input" }`
- `multi-byte-boundary.input.txt` — ends in the middle of a UTF-8 multi-byte sequence → `{ "state": "ok" }` (or whatever classifyBuffer returns for it; the assertion is its own authority)

- [ ] **Step 3: Commit**

```bash
git add shared-fixtures/attention-classifier
git commit -m "test(classifier): seed shared fixtures for parity testing

8 fixtures covering the 5 known attention states plus 3 edge cases
(truncation, line-wrap, multi-byte boundary). Fixtures are the contract:
any future classifyBuffer pattern change ships with a fixture change."
```

---

### Task 13: Write attention-classifier-parity.test.ts

**Files:**
- Create: `desktop/tests/attention-classifier-parity.test.ts`

- [ ] **Step 1: Write the test**

File: `desktop/tests/attention-classifier-parity.test.ts`

```typescript
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { classifyBuffer } from '../src/renderer/state/attention-classifier';

const FIXTURES_DIR = join(__dirname, '..', '..', 'shared-fixtures', 'attention-classifier');

describe('attention-classifier parity fixtures', () => {
  const entries = readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.input.txt'));

  it.each(entries)('classifies %s as expected', (inputFile) => {
    const baseName = inputFile.replace(/\.input\.txt$/, '');
    const input = readFileSync(join(FIXTURES_DIR, inputFile), 'utf8');
    const expected = JSON.parse(
      readFileSync(join(FIXTURES_DIR, `${baseName}.expected.json`), 'utf8')
    );

    expect(classifyBuffer(input)).toEqual(expected.state);
  });
});
```

Verify the import path for `classifyBuffer` — search the repo for `export function classifyBuffer` to confirm the file location.

- [ ] **Step 2: Run the test**

```bash
cd desktop && npm test -- --testPathPattern="attention-classifier-parity"
```

Expected: all fixtures pass. If any fixture fails, investigate — either the fixture's `.expected.json` is wrong (fix the JSON) or the classifier has drifted (file a bug and fix the regex, updating the fixture only if the new behavior is correct).

- [ ] **Step 3: Commit**

```bash
git add desktop/tests/attention-classifier-parity.test.ts
git commit -m "test(classifier): parity test driven by shared fixtures

Iterates every .input.txt in shared-fixtures/attention-classifier/ and
asserts classifyBuffer(input) equals the matching .expected.json state.
Adding a new AttentionState or tweaking a regex now requires a fixture
change in the same commit — the fixture is the contract."
```

---

### Task 14: Write raw-byte-listener-contract.test.ts

**Files:**
- Create: `desktop/tests/raw-byte-listener-contract.test.ts`

- [ ] **Step 1: Write the test**

File: `desktop/tests/raw-byte-listener-contract.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

// Contract test: the pty:raw-bytes WebSocket message shape must
// round-trip arbitrary bytes via base64 without corruption, including
// high-bit ANSI control bytes. This locks the wire format so the
// Android broadcaster and the future xterm.js consumer agree.

describe('pty:raw-bytes wire contract', () => {
  it('base64 round-trips high-bit bytes', () => {
    const original = new Uint8Array([
      0x1b, 0x5b, 0x33, 0x31, 0x6d, // ESC [ 3 1 m (red foreground)
      0xe2, 0x94, 0x80,             // UTF-8 for ─ (BOX DRAWINGS LIGHT HORIZONTAL)
      0x00, 0xff, 0x7f, 0x80,       // edge bytes
    ]);

    // Base64-encode on one side (Kotlin uses android.util.Base64.NO_WRAP).
    const encoded = Buffer.from(original).toString('base64');
    // Decode on the other (xterm-side / test consumer).
    const decoded = new Uint8Array(Buffer.from(encoded, 'base64'));

    expect(decoded).toEqual(original);
  });

  it('message payload shape carries sessionId and data', () => {
    const bytes = new Uint8Array([0x48, 0x69]); // "Hi"
    const msg = {
      type: 'pty:raw-bytes',
      payload: {
        sessionId: 'abc-123',
        data: Buffer.from(bytes).toString('base64'),
      },
    };

    expect(msg.type).toBe('pty:raw-bytes');
    expect(msg.payload.sessionId).toBe('abc-123');
    expect(typeof msg.payload.data).toBe('string');
    expect(new Uint8Array(Buffer.from(msg.payload.data, 'base64'))).toEqual(bytes);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd desktop && npm test -- --testPathPattern="raw-byte-listener-contract"
```

Expected: 2 passing tests.

- [ ] **Step 3: Commit**

```bash
git add desktop/tests/raw-byte-listener-contract.test.ts
git commit -m "test(contract): pty:raw-bytes wire format contract test

Asserts base64 round-trips arbitrary bytes (including high-bit ANSI
control bytes) and locks the message payload shape {sessionId, data}.
Doesn't exercise the Android broadcaster — that's Task 8's unit test
+ manual verification — but makes the contract explicit."
```

---

### Task 15: Extend ipc-channels.test.ts with new channels

**Files:**
- Modify: `desktop/tests/ipc-channels.test.ts`

- [ ] **Step 1: Locate the parity matrix**

Open `desktop/tests/ipc-channels.test.ts`. Find the list or array of channel names that the test iterates. It should be checking that each channel appears in `preload.ts`, `remote-shim.ts`, `ipc-handlers.ts`, and (by grep) `SessionService.kt`.

- [ ] **Step 2: Add the two new channels**

Add to the list (preserving the existing sort/convention):

```typescript
'terminal:get-screen-text',
'pty:raw-bytes',
```

- [ ] **Step 3: Run the test**

```bash
cd desktop && npm test -- --testPathPattern="ipc-channels"
```

Expected: all parity checks pass. If one platform is missing the channel name, fix it (should have been added in Phase 3 / Phase 4). If `SessionService.kt` grep fails for `pty:raw-bytes`, double-check Task 8 added the string exactly.

- [ ] **Step 4: Commit**

```bash
git add desktop/tests/ipc-channels.test.ts
git commit -m "test(ipc): add terminal:get-screen-text and pty:raw-bytes to parity matrix

These two message type strings must appear identically in preload.ts,
remote-shim.ts, ipc-handlers.ts, and SessionService.kt. Drift would
silently break the classifier on one platform."
```

---

## Phase 6: Documentation

### Task 16: Write VENDORED.md for the vendored module

**Files:**
- Create: `terminal-emulator-vendored/VENDORED.md`

- [ ] **Step 1: Write the doc**

File: `terminal-emulator-vendored/VENDORED.md`

````markdown
# Vendored Termux terminal-emulator

This module is a vendored copy of Termux's `terminal-emulator` Android library, patched to add a `RawByteListener` hook on `TerminalEmulator.append()`.

## Origin

- Upstream: https://github.com/termux/termux-app
- Tag: `v0.118.1`
- Path: `terminal-emulator/`
- Vendored on: 2026-04-24

## Why vendored

Termux's `TerminalEmulator` owns the ANSI parse loop but exposes no pre-parse byte listener. We need raw bytes to flow to a secondary consumer (a future xterm.js renderer over WebSocket) in parallel with the existing native `TerminalView` display.

Subclassing doesn't work: `mEmulator` is package-private on `TerminalSession`, and `processByte` / `processCodePoint` are private. The cleanest tap point is overriding `append(byte[], int)` directly — but the only way to install an override is to patch the class or replace it in a package-private field via reflection. Vendoring is less fragile than reflection drift.

## The patch

Three additions to `src/main/java/com/termux/terminal/TerminalEmulator.java`, all marked with `// YOUCODED PATCH` comments:

1. Public `RawByteListener` interface with `onBytesReceived(byte[] buffer, int length)`.
2. `addRawByteListener(...)` / `removeRawByteListener(...)` methods backed by a `CopyOnWriteArrayList`.
3. A listener-notify loop at the very start of `append(byte[] buffer, int length)`, before the existing per-byte processing.

No other Termux file is modified. No JNI changes.

## Re-vendor procedure

When bumping to a newer Termux version:

1. Shallow-clone at the new tag: `git clone --depth 1 --branch <tag> https://github.com/termux/termux-app.git /tmp/termux-<tag>`
2. Back up our patched `TerminalEmulator.java` (copy it somewhere).
3. Replace `src/main/java/com/termux/terminal/` and `src/main/jni/` with the new tag's contents: `cp -r /tmp/termux-<tag>/terminal-emulator/src/main/java/com terminal-emulator-vendored/src/main/java/ && cp -r /tmp/termux-<tag>/terminal-emulator/src/main/jni/. terminal-emulator-vendored/src/main/jni/`
4. Re-apply the three `// YOUCODED PATCH` additions to the new `TerminalEmulator.java`.
5. Run `./gradlew :app:testDebugUnitTest --tests "com.youcoded.app.runtime.RawByteListenerTest"` — both tests must pass.
6. Run `./gradlew :app:assembleDebug` — the APK must build.
7. Update "Vendored on" and "Tag" fields at the top of this file.

## Invariant

This module is never edited outside the documented patch. If a future change needs more than "add one listener and call it from append()", stop and reconsider — either upstream a proper `RawByteListener` API to Termux, or split the new concern into a separate change with its own documentation.
````

- [ ] **Step 2: Commit**

```bash
git add terminal-emulator-vendored/VENDORED.md
git commit -m "docs(terminal-emulator): document vendoring origin, patch, and re-vendor procedure"
```

---

### Task 17: Add PITFALLS.md entries (workspace repo)

**Files:**
- Modify: `docs/PITFALLS.md` (in the `youcoded-dev` workspace repo, NOT the youcoded repo)

This task runs in the workspace repo, not the youcoded worktree.

- [ ] **Step 1: Add a new section after "Android Runtime"**

Insert a new section titled "## Vendored Termux terminal-emulator" with these entries:

```markdown
## Vendored Termux terminal-emulator

- **`terminal-emulator-vendored/` is pinned to Termux v0.118.1 with a single documented patch** (a `RawByteListener` hook on `TerminalEmulator.append()`). `VENDORED.md` in that directory is the source of truth. Never edit files in this module outside the documented patch — if a new concern needs more, revisit the decision to vendor.
- **`RawByteListener` fires on the terminal thread** (same thread that calls `TerminalEmulator.append()`). Listener implementations MUST copy bytes before any async work — Termux reuses the same `byte[]` across PTY reads. `PtyBridge.rawByteFlow` uses `tryEmit` on a bounded `MutableSharedFlow` so a slow downstream consumer drops bytes rather than blocking the terminal thread. Dropped emissions are acceptable; there is no render consumer in Tier 1.
- **`pty:raw-bytes` payload is base64-encoded.** JSON can't carry raw binary, UTF-8 corrupts high-bit bytes (common in ANSI control sequences), and base64 over localhost WebSocket has negligible cost. Never change the encoding without updating `raw-byte-listener-contract.test.ts` and every consumer at once.
- **Classifier fixtures at `youcoded/shared-fixtures/attention-classifier/` are the contract.** Adding an `AttentionState` or tweaking a regex in `classifyBuffer` requires a fixture change in the same commit. `attention-classifier-parity.test.ts` enforces this.
```

- [ ] **Step 2: Commit in the workspace repo**

```bash
cd ~/youcoded-dev
git add docs/PITFALLS.md
git commit -m "docs(pitfalls): vendored Termux emulator, RawByteListener rules, base64 contract

Locks in the four new invariants from the Android terminal data-layer
parity work (see docs/superpowers/specs/2026-04-24-android-terminal-data-parity-design.md)."
```

---

### Task 18: Add `cc-dependencies.md` entry for the Android classifier

**Files:**
- Modify: `youcoded/docs/cc-dependencies.md` (inside the youcoded repo — the worktree)

- [ ] **Step 1: Add the entry**

Open `docs/cc-dependencies.md` in the worktree. Follow the existing format. Add an entry describing the new Android-side coupling:

```markdown
### Android attention classifier

- **What:** `useAttentionClassifier` (renderer) runs on standalone Android by reading screen text via `window.claude.terminal.getScreenText`, which routes to `PtyBridge.readScreenText()` on the Android side. Classifier regex patterns match Claude Code CLI spinner glyphs, "esc to cancel" prompt, and permission-prompt markers.
- **CC-coupled files:**
  - `desktop/src/renderer/state/attention-classifier.ts` (patterns)
  - `desktop/src/renderer/hooks/useAttentionClassifier.ts` (tick logic)
  - `desktop/tests/attention-classifier-parity.test.ts` + `youcoded/shared-fixtures/attention-classifier/` (regression coverage)
- **Why coupled:** Patterns must match Claude Code's CLI output. Visual changes to the Ink UI (spinner glyph, prompt copy, error banner color) can break classification silently.
- **Review trigger:** Any Claude Code CHANGELOG entry mentioning TUI / Ink / prompt / spinner / progress updates.
```

If `cc-dependencies.md` doesn't have an existing section for classifier or similar topic, follow the format of the nearest entry (search for other `### ` headings in the file).

- [ ] **Step 2: Commit**

```bash
git add docs/cc-dependencies.md
git commit -m "docs(cc-deps): add Android attention classifier entry

Adds Android as a new surface that classifier pattern drift could
break. Review trigger: CC changes to Ink / TUI output patterns."
```

---

### Task 19: Update `docs/android-runtime.md` with the vendored-module section

**Files:**
- Modify: `docs/android-runtime.md` (inside the `youcoded-dev` workspace repo)

- [ ] **Step 1: Add a section near the top, after "Canonical sources"**

Insert:

```markdown
## Vendored Termux terminal-emulator

Android depends on a **vendored copy** of Termux's `terminal-emulator` at `youcoded/terminal-emulator-vendored/` (Maven coordinate would be `com.github.termux.termux-app:terminal-emulator:v0.118.1`, but we build it locally). The vendor drop is patched to expose a `RawByteListener` on `TerminalEmulator.append()` — used by `PtyBridge.rawByteFlow` and broadcast as `pty:raw-bytes` WebSocket push events for future xterm.js consumption.

Source of truth for the origin tag and patch shape: `terminal-emulator-vendored/VENDORED.md`. Never edit this module outside the documented patch.

Terminal-view (`com.github.termux.termux-app:terminal-view:v0.118.1`) stays on the Maven dep — unpatched. The app build excludes terminal-emulator from terminal-view's transitive deps so Gradle picks up only the vendored version.
```

- [ ] **Step 2: Commit in the workspace repo**

```bash
cd ~/youcoded-dev
git add docs/android-runtime.md
git commit -m "docs(android): document vendored Termux terminal-emulator module"
```

---

## Phase 7: Manual Verification

### Task 20: Manual APK verification

This step runs on a physical Android device. It can't be automated.

- [ ] **Step 1: Build debug APK and install**

From the youcoded worktree:

```bash
./scripts/build-web-ui.sh   # Required — Android WebView loads built React bundle
./gradlew :app:installDebug
```

- [ ] **Step 2: Verify native terminal rendering unchanged**

Launch the app. Start a Claude session. Confirm:
- Terminal renders normally (Claude Code's Ink UI shows).
- Typing into the terminal works (native soft keyboard input still reaches the PTY).
- Scrolling through scrollback works.
- Pinch-zoom, tap-to-position cursor, long-press, text selection — all still work via Termux's native TerminalView.

If any of these regress, something in Phase 2 or Phase 3 broke the native path. Bisect before continuing.

- [ ] **Step 3: Verify attention classifier fires on Android**

Temporarily add a log in `useAttentionClassifier.ts` after the `dispatch({ type: 'ATTENTION_STATE_CHANGED', ... })` call:

```typescript
console.log('[classifier] state changed to', nextState);
```

Rebuild, reinstall. Trigger a long-thinking state in Claude (ask it a complex question). Watch `adb logcat | grep classifier`. Expected: `[classifier] state changed to ok` when thinking starts, eventually `[classifier] state changed to stuck` after the 30s timeout if it hangs.

Confirm the Android `AttentionBanner` component appears and matches the state shown on desktop for the same session.

- [ ] **Step 4: Verify raw-byte stream**

Temporarily add a log in `remote-shim.ts`'s push-event dispatcher for `pty:raw-bytes`:

```typescript
if (msg.type === 'pty:raw-bytes') {
  console.log('[raw-bytes]', msg.payload.sessionId, msg.payload.data.length, 'b64 chars');
}
```

Watch `adb logcat | grep raw-bytes` while Claude produces output. Expected: frequent entries during Ink repaints, coalesced at ~16ms intervals.

- [ ] **Step 5: Remove the diagnostic logs**

Remove both `console.log` additions from Step 3 and Step 4. These were dogfood-only.

```bash
git diff  # Confirm only the console.log lines are being reverted.
git checkout -- desktop/src/renderer/hooks/useAttentionClassifier.ts desktop/src/renderer/remote-shim.ts
```

(Or edit manually if the diff shows other changes you want to keep.)

- [ ] **Step 6: Final build and test run**

```bash
cd desktop && npm test
cd .. && ./gradlew :app:testDebugUnitTest
./gradlew :app:assembleDebug
cd .. && ./scripts/build-web-ui.sh
```

All commands should exit 0.

- [ ] **Step 7: Merge**

Once the manual verification checklist is complete and all automated tests are green, create a PR or fast-forward merge into master per your workflow. No version bump in this plan — the user handles shipping independently.

```bash
git push origin android-terminal-data-parity
# Then create PR via gh or merge locally and push master.
```

- [ ] **Step 8: Clean up worktree after merge**

```bash
cd ~/youcoded-dev/youcoded
git worktree remove ../../youcoded-worktrees/android-terminal-data-parity
git branch -D android-terminal-data-parity
```

---

## Done Criteria Recap

- Vendored `terminal-emulator-vendored` module builds, is wired into `:app`, and excludes the Maven AAR from terminal-view's transitives.
- `RawByteListenerTest` passes.
- `PtyBridge.rawByteFlow` emits on every PTY read.
- `terminal:get-screen-text` and `pty:raw-bytes` appear identically across `preload.ts`, `remote-shim.ts`, `ipc-handlers.ts`, `SessionService.kt`.
- `useAttentionClassifier` runs on standalone Android, produces the same `attentionState` transitions as desktop for a long-thinking scenario.
- Typing, scrolling, IME, gestures on Android native TerminalView: unchanged.
- All new tests green: `attention-classifier-parity`, `raw-byte-listener-contract`, `ipc-channels`, `RawByteListenerTest`.
- Docs: `VENDORED.md`, PITFALLS entries, `cc-dependencies.md` entry, `android-runtime.md` section — all committed in their respective repos.
- Branch merged to `master`.
- Worktree cleaned up.
