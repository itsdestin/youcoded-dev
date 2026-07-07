# Android Plugin Discovery Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Android-only "installed plugins don't appear in command drawer" so marketplace installs are visible immediately on Android, with no duplicates and no phantom plugin-level entries.

**Architecture:** Four independent fixes addressing one user-visible symptom but four distinct root causes. Three are Android-side (Kotlin), one is shared renderer (TypeScript). They're ordered so each can land and be verified before the next.

**Tech Stack:** TypeScript (vitest, jsdom, @testing-library/react), Kotlin (JUnit 4 JVM unit tests), React Context.

**Branch:** `fix/android-plugin-discovery` off `master` (NOT `mp-mobile` — kept separate so reviews stay focused).

**Repo:** All file edits land in `youcoded/` (the app repo). The plan itself lives in the workspace at `docs/superpowers/plans/`. Use a worktree under `youcoded/.worktrees/android-plugin-discovery/`.

---

## Background — Why Each Fix Is Needed

| Symptom | Root cause | File |
|---|---|---|
| `skills:list` resolves to `[]` permanently after cold start | `send()` silently drops messages when WS isn't OPEN; first calls race the auth handshake | `desktop/src/renderer/remote-shim.ts` |
| `youcoded-encyclopedia` and `youcoded-civic-report` show duplicate skill entries on Android only | `SkillScanner` Pass 1 walks the marketplace subtree (via `listInstalledPluginDirs`); combined with `pluginRoot.name.startsWith("youcoded")` it adds bare ids that Pass 2 then re-adds namespaced | `app/.../skills/SkillScanner.kt` |
| Phantom plugin-level "Encyclopedia" placeholder card appears alongside its real skills | `LocalSkillProvider.getInstalled()` only dedupes by skill id, not pluginName | `app/.../skills/LocalSkillProvider.kt` |
| Drawer stays stale after a same-session install (latent on desktop, masked on Android until #1) | `MarketplaceContext.installSkill` never calls `useSkills().refreshInstalled()` | `desktop/src/renderer/state/marketplace-context.tsx` |

Out of scope for this plan: drawer "browse" mode showing slash commands alongside skills (separate UX ticket).

---

## File Structure

| File | Role | Action |
|---|---|---|
| `desktop/src/renderer/remote-shim.ts` | WebSocket bridge between renderer and Kotlin/Electron host | Modify `send()` to queue when WS isn't OPEN; flush on `auth:ok`; clear on host switch |
| `desktop/tests/remote-shim-send-queue.test.ts` | Unit tests for the queue | Create |
| `app/src/main/kotlin/com/youcoded/app/skills/SkillScanner.kt` | Discovers installed skills on Android | Replace Pass 1 over-walk with top-level-only scan (mirrors desktop) |
| `app/src/test/kotlin/com/youcoded/app/skills/SkillScannerTest.kt` | JUnit tests for the scanner | Create |
| `app/src/main/kotlin/com/youcoded/app/skills/LocalSkillProvider.kt` | Builds the merged skill list returned by `skills:list` | Add `pluginsWithScannedSkills` filter (mirrors desktop) |
| `app/src/test/kotlin/com/youcoded/app/skills/LocalSkillProviderInstalledTest.kt` | JUnit tests for `getInstalled()` filtering | Create |
| `desktop/src/renderer/state/marketplace-context.tsx` | Renderer marketplace state + install/uninstall actions | Call `refreshInstalled()` after install, uninstall, installTheme, uninstallTheme |
| `desktop/tests/marketplace-context-refreshes-skills.test.tsx` | Test that SkillContext is refreshed after marketplace mutations | Create |

---

## Task 1: WebSocket Send Queue + Cold-Start Flush

**Files:**
- Modify: `desktop/src/renderer/remote-shim.ts`
- Create: `desktop/tests/remote-shim-send-queue.test.ts`

**Why this is task 1:** It's the load-bearing fix — Android's `skills:list` returning `[]` is the user-visible symptom and Fix #1 is what unblocks every other context that fetches at mount. Tasks 2–4 are correctness fixes whose effects are masked while Fix #1 is missing.

**Design notes:**
- Queue is a simple `string[]` of already-serialized JSON messages. Bound at `MAX_QUEUE = 256` entries (FIFO eviction with a `console.warn` so we notice if a real flow exceeds it).
- Flush ONLY after `auth:ok` (NOT on `ws.onopen`) — sending application messages before auth is rejected by the bridge.
- The auth message itself bypasses the queue: it's sent via `ws!.send(JSON.stringify(authMsg))` directly inside `ws.onopen`, not via `send()`. Verify this stays true — do not refactor the auth path through `send()`.
- Clear the queue (rejecting any in-flight `invoke` promises waiting for those messages via the existing `pending` map) inside `connectToHost` and `disconnectFromHost`, mirroring how `pending` is already cleared there.

- [ ] **Step 1: Write the failing tests**

Create `desktop/tests/remote-shim-send-queue.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// remote-shim.ts is module-scoped — we test it via dynamic import + module reset.
// Each test gets a fresh module instance and a stubbed WebSocket.

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  static CONNECTING = 0;
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  url: string;
  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    if (this.readyState !== FakeWebSocket.OPEN) {
      throw new Error('WebSocket is not OPEN');
    }
    this.sent.push(data);
  }
  close() { this.readyState = 3; this.onclose?.({ code: 1000, reason: '' }); }
  // Test helpers
  open() { this.readyState = FakeWebSocket.OPEN; this.onopen?.(); }
  receive(msg: any) { this.onmessage?.({ data: JSON.stringify(msg) }); }
}

describe('remote-shim send queue', () => {
  let shim: typeof import('../src/renderer/remote-shim');
  beforeEach(async () => {
    vi.resetModules();
    FakeWebSocket.instances = [];
    (globalThis as any).WebSocket = FakeWebSocket;
    (globalThis as any).location = { protocol: 'ws:', host: 'localhost', search: '' };
    (globalThis as any).localStorage = {
      _s: {} as Record<string, string>,
      getItem(k: string) { return this._s[k] ?? null; },
      setItem(k: string, v: string) { this._s[k] = v; },
      removeItem(k: string) { delete this._s[k]; },
    };
    shim = await import('../src/renderer/remote-shim');
  });
  afterEach(() => {
    delete (globalThis as any).WebSocket;
  });

  it('does NOT send application messages while WS is CONNECTING', async () => {
    const connectPromise = shim.connect('pw', false);
    const ws = FakeWebSocket.instances[0];
    expect(ws.readyState).toBe(FakeWebSocket.CONNECTING);

    // Install shim so window.claude exists
    shim.installShim();
    // Fire a request before the WS opens
    const invokePromise = (window as any).claude.skills.list();
    // No bytes should have hit the wire yet
    expect(ws.sent).toEqual([]);

    // Open + auth
    ws.open();
    expect(ws.sent).toHaveLength(1); // auth message only
    ws.receive({ type: 'auth:ok', token: 'tok', platform: 'browser' });
    await connectPromise;

    // After auth:ok, the queued skills:list should flush
    const sentTypes = ws.sent.slice(1).map(s => JSON.parse(s).type);
    expect(sentTypes).toContain('skills:list');

    // Resolve the invoke
    const queuedMsg = JSON.parse(ws.sent[ws.sent.length - 1]);
    ws.receive({ type: 'skills:list:response', id: queuedMsg.id, payload: [] });
    await expect(invokePromise).resolves.toEqual([]);
  });

  it('auth message bypasses the queue (sent directly during ws.onopen)', async () => {
    shim.connect('pw', false);
    const ws = FakeWebSocket.instances[0];
    ws.open();
    expect(ws.sent).toHaveLength(1);
    expect(JSON.parse(ws.sent[0]).type).toBe('auth');
  });

  it('drops oldest queued messages once MAX_QUEUE is exceeded (with warning)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    shim.connect('pw', false);
    const ws = FakeWebSocket.instances[0];
    shim.installShim();

    // Queue more than the bound (256) before opening
    for (let i = 0; i < 300; i++) (window as any).claude.skills.list();
    expect(ws.sent).toEqual([]);
    ws.open();
    ws.receive({ type: 'auth:ok', token: 't', platform: 'browser' });
    await new Promise(r => setTimeout(r, 0));

    // Auth + at most 256 application messages flushed
    const flushed = ws.sent.length - 1;
    expect(flushed).toBeLessThanOrEqual(256);
    expect(warn).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd youcoded/desktop && npx vitest run tests/remote-shim-send-queue.test.ts`
Expected: FAIL — first test should show `expect(sentTypes).toContain('skills:list')` failing because `send()` silently drops the message.

- [ ] **Step 3: Implement the queue in `remote-shim.ts`**

Modify `desktop/src/renderer/remote-shim.ts`:

Add at the top with other module state (around line 38):

```ts
// WS cold-start race fix: messages enqueued when ws is not OPEN are flushed
// on auth:ok. Bounded to prevent runaway memory if auth never completes.
// Why 256: covers a worst-case mount-time burst (skills + themes + commands +
// marketplace + per-section context fetches) with headroom. If we hit the
// bound it's a signal that something is mis-using send() during disconnect,
// not normal flow — the warn surfaces it.
const MAX_QUEUE = 256;
let pendingSendQueue: string[] = [];
```

Replace the `send()` function (lines 74-78):

```ts
function send(msg: any): void {
  const data = JSON.stringify(msg);
  if (ws?.readyState === WebSocket.OPEN && connectionState === 'connected') {
    ws.send(data);
    return;
  }
  // Queue for flush on auth:ok. Authoring rule: this MUST NOT be reached
  // by the auth message itself — auth uses ws!.send(...) directly inside
  // ws.onopen so it doesn't race with the queue.
  if (pendingSendQueue.length >= MAX_QUEUE) {
    console.warn('[remote-shim] send queue overflow — dropping oldest');
    pendingSendQueue.shift();
  }
  pendingSendQueue.push(data);
}

function flushSendQueue(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const queued = pendingSendQueue;
  pendingSendQueue = [];
  for (const data of queued) {
    try { ws.send(data); } catch (e) {
      console.error('[remote-shim] flush failed:', e);
    }
  }
}
```

Inside `ws.onmessage` (around line 290), call `flushSendQueue()` immediately after `setConnectionState('connected')`:

```ts
        if (msg.type === 'auth:ok') {
          authResolved = true;
          reconnectDelay = 1000;
          reconnectAttempts = 0;
          console.log('[remote-shim] auth:ok from', getWsUrl());
          setConnectionState('connected');
          flushSendQueue();  // ← NEW: deliver any pre-auth queued messages
          // ... existing token storage + resolve(token)
```

Inside `connectToHost` and `disconnectFromHost`, after `pending.clear()`, also clear the queue. This rejects any pending `invoke` calls whose messages were queued (the existing 30s `invoke` timeout would otherwise reject them later, but we want immediate signal on host switch):

```ts
  // Inside connectToHost and disconnectFromHost, after pending.clear():
  if (pendingSendQueue.length > 0) {
    console.warn('[remote-shim] discarding', pendingSendQueue.length,
      'queued messages on host switch');
    pendingSendQueue = [];
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd youcoded/desktop && npx vitest run tests/remote-shim-send-queue.test.ts`
Expected: PASS — all three tests green.

- [ ] **Step 5: Commit**

```bash
cd youcoded
git add desktop/src/renderer/remote-shim.ts desktop/tests/remote-shim-send-queue.test.ts
git commit -m "fix(remote-shim): queue messages during WS cold-start

The renderer-side send() silently dropped messages when the WebSocket
wasn't OPEN, so first-mount fetches (window.claude.skills.list etc.)
that raced the auth handshake resolved to undefined and contexts stayed
empty for the app's lifetime. Visible on Android as 'installed plugins
never appear in the command drawer'.

Now: messages enqueue while pre-auth, flush after auth:ok, with a
bound (256) and host-switch clear path to mirror the existing pending
map. Auth itself bypasses the queue."
```

---

## Task 2: Mirror Desktop's Top-Level-Only Pass 1 in `SkillScanner.kt`

**Files:**
- Modify: `app/src/main/kotlin/com/youcoded/app/skills/SkillScanner.kt`
- Create: `app/src/test/kotlin/com/youcoded/app/skills/SkillScannerTest.kt`

**Why now:** Once Fix #1 is in, `skills.list()` returns real data on Android — and the duplicate `youcoded-encyclopedia` skills become user-visible.

**Design notes:**
- Desktop's `skill-scanner.ts` Pass 1 only reads top-level children of `~/.claude/plugins/` and skips entries without a `plugin.json`. Marketplace plugins live deeper (`marketplaces/youcoded/plugins/<id>/`) and are picked up by Pass 2 from `installed_plugins.json`.
- Android currently uses `ClaudeCodeRegistry.listInstalledPluginDirs()` for Pass 1, which deliberately walks both roots (it serves reconcilers that DO need the marketplace subtree). We don't want to change that helper — we want Pass 1 to NOT use it.
- The `pluginRoot.name.startsWith("youcoded")` check in Android's Pass 1 (line 62) is fine on its own — the bug is that combined with the over-walk, it produces bare ids for marketplace plugins. Once Pass 1 only sees top-level, the only youcoded-prefixed plugin it can hit is `youcoded-core` itself (the bundled plugin), which is the intended legacy behavior.

- [ ] **Step 1: Write failing tests**

Create `app/src/test/kotlin/com/youcoded/app/skills/SkillScannerTest.kt`:

```kotlin
package com.youcoded.app.skills

import android.content.Context
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import java.io.ByteArrayInputStream
import java.io.File

class SkillScannerTest {

    private lateinit var tmpHome: File
    private lateinit var context: Context

    @Before
    fun setUp() {
        tmpHome = createTempDir(prefix = "youcoded-scanner-")
        context = mock(Context::class.java)
        // Stub assets.open so loadRegistry() returns an empty registry
        val assets = mock(android.content.res.AssetManager::class.java)
        `when`(context.assets).thenReturn(assets)
        `when`(assets.open("web/data/skill-registry.json"))
            .thenReturn(ByteArrayInputStream("{}".toByteArray()))
    }

    @After
    fun tearDown() { tmpHome.deleteRecursively() }

    private fun mkdirs(path: String) = File(tmpHome, path).apply { mkdirs() }
    private fun write(path: String, content: String) {
        File(tmpHome, path).apply { parentFile?.mkdirs() }.writeText(content)
    }

    @Test
    fun `youcoded-core at top level produces bare skill ids`() {
        write(".claude/plugins/youcoded-core/plugin.json", """{"name":"youcoded-core"}""")
        mkdirs(".claude/plugins/youcoded-core/skills/setup-wizard")
        mkdirs(".claude/plugins/youcoded-core/skills/remote-setup")

        val skills = SkillScanner(tmpHome, context).scan()
        val ids = (0 until skills.length()).map { skills.getJSONObject(it).getString("id") }.sorted()
        assertEquals(listOf("remote-setup", "setup-wizard"), ids)
    }

    @Test
    fun `marketplace-installed youcoded-prefixed plugin does NOT produce bare skill ids in Pass 1`() {
        // Regression for Android-only duplicate ids bug.
        // Pre-fix: Pass 1 walked the marketplace subtree AND saw youcoded-encyclopedia,
        // adding bare 'journal' alongside 'youcoded-encyclopedia:journal' from Pass 2.
        val pluginPath = ".claude/plugins/marketplaces/youcoded/plugins/youcoded-encyclopedia"
        write("$pluginPath/plugin.json", """{"name":"youcoded-encyclopedia"}""")
        mkdirs("$pluginPath/skills/journal")

        // Wire it through installed_plugins.json so Pass 2 picks it up
        write(".claude/plugins/installed_plugins.json", """
            {"version":2,"plugins":{"youcoded-encyclopedia@youcoded":[
              {"installPath":"${File(tmpHome, pluginPath).absolutePath.replace("\\","\\\\")}",
               "version":"1.0.0","scope":"user"}
            ]}}
        """.trimIndent())

        val skills = SkillScanner(tmpHome, context).scan()
        val ids = (0 until skills.length()).map { skills.getJSONObject(it).getString("id") }
        assertFalse("bare id 'journal' should not appear on Android", ids.contains("journal"))
        assertTrue("namespaced id should appear", ids.contains("youcoded-encyclopedia:journal"))
        assertEquals("no duplicates", ids.distinct().size, ids.size)
    }

    @Test
    fun `marketplace plugin emits pluginName field for the LocalSkillProvider filter`() {
        // Task 3 depends on this — pluginName must carry the plugin id, not the skill id.
        val pluginPath = ".claude/plugins/marketplaces/youcoded/plugins/imessage"
        write("$pluginPath/plugin.json", """{"name":"imessage"}""")
        mkdirs("$pluginPath/skills/send-message")
        write(".claude/plugins/installed_plugins.json", """
            {"version":2,"plugins":{"imessage@youcoded":[
              {"installPath":"${File(tmpHome, pluginPath).absolutePath.replace("\\","\\\\")}",
               "version":"1.0.0","scope":"user"}
            ]}}
        """.trimIndent())

        val skills = SkillScanner(tmpHome, context).scan()
        val entry = (0 until skills.length()).map { skills.getJSONObject(it) }
            .first { it.getString("id") == "imessage:send-message" }
        assertEquals("imessage", entry.getString("pluginName"))
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd youcoded && ./gradlew :app:testDebugUnitTest --tests "com.youcoded.app.skills.SkillScannerTest"`
Expected: FAIL on `marketplace-installed youcoded-prefixed plugin does NOT produce bare skill ids` — current code adds bare `journal`.

- [ ] **Step 3: Replace Pass 1 with top-level-only walk**

Edit `app/src/main/kotlin/com/youcoded/app/skills/SkillScanner.kt`:

Replace lines 50-69 (the entire Pass 1 try block) with:

```kotlin
        // Pass 1: top-level scan ONLY (mirrors desktop/src/main/skill-scanner.ts).
        // We deliberately do NOT call ClaudeCodeRegistry.listInstalledPluginDirs()
        // here — that helper walks the marketplace subtree too, which is correct
        // for reconcilers but wrong for the scanner: marketplace plugins are
        // picked up by Pass 2 (installed_plugins.json) with namespaced ids, and
        // walking them here produced duplicate bare ids for any plugin whose
        // directory name starts with "youcoded" (the special-case branch below).
        try {
            pluginsDir.listFiles()?.forEach { pluginRoot ->
                if (!pluginRoot.isDirectory) return@forEach
                if (pluginRoot.name == "marketplaces") return@forEach
                val hasManifest = File(pluginRoot, "plugin.json").exists() ||
                    File(pluginRoot, ".claude-plugin/plugin.json").exists()
                if (!hasManifest) return@forEach

                File(pluginRoot, "skills").listFiles()?.forEach { entry ->
                    if (entry.isDirectory) {
                        // youcoded-core (bundled, top-level) keeps bare skill ids
                        // for backward-compat with existing favorites/curated
                        // defaults. No marketplace plugin can reach this branch
                        // because the marketplaces/ subtree was skipped above.
                        val skillId = if (pluginRoot.name.startsWith("youcoded")) entry.name
                            else "${pluginRoot.name}:${entry.name}"
                        val source = if (pluginRoot.name.startsWith("youcoded")) "youcoded-core" else "plugin"
                        addSkill(skillId, entry.name, "", source, pluginRoot.name)
                    }
                }
            }
        } catch (_: Exception) {}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd youcoded && ./gradlew :app:testDebugUnitTest --tests "com.youcoded.app.skills.SkillScannerTest"`
Expected: PASS — all three tests green.

- [ ] **Step 5: Commit**

```bash
cd youcoded
git add app/src/main/kotlin/com/youcoded/app/skills/SkillScanner.kt \
        app/src/test/kotlin/com/youcoded/app/skills/SkillScannerTest.kt
git commit -m "fix(android-skills): top-level-only Pass 1 to mirror desktop

Android's SkillScanner Pass 1 used listInstalledPluginDirs() which
walks both top-level AND the marketplace subtree. Combined with the
'youcoded' prefix special case, every youcoded-prefixed marketplace
plugin (youcoded-encyclopedia, youcoded-civic-report) got bare ids in
Pass 1 AND namespaced ids in Pass 2 — duplicates in the drawer.

Now Pass 1 reads top-level children only and skips 'marketplaces/',
matching desktop. Bare ids are reserved for the bundled youcoded-core."
```

---

## Task 3: `LocalSkillProvider.getInstalled()` Adds `pluginsWithScannedSkills` Filter

**Files:**
- Modify: `app/src/main/kotlin/com/youcoded/app/skills/LocalSkillProvider.kt`
- Create: `app/src/test/kotlin/com/youcoded/app/skills/LocalSkillProviderInstalledTest.kt`

**Design notes:**
- Mirrors desktop's `skill-provider.ts` lines 174-178 + 182.
- Each scanned skill carries a `pluginName` field (set by `SkillScanner.addSkill`). Build a Set of those names. When backfilling `marketplaceInstalled`, skip any id whose plugin already has scanned skills.
- A plugin with no scanned skills (e.g., commands-only or hooks-only) STILL appears as a plugin-level entry — that's intentional, matches desktop.

- [ ] **Step 1: Write failing test**

Create `app/src/test/kotlin/com/youcoded/app/skills/LocalSkillProviderInstalledTest.kt`:

```kotlin
package com.youcoded.app.skills

import android.content.Context
import android.content.res.AssetManager
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import java.io.ByteArrayInputStream
import java.io.File

class LocalSkillProviderInstalledTest {

    private lateinit var tmpHome: File
    private lateinit var context: Context

    @Before
    fun setUp() {
        tmpHome = createTempDir(prefix = "youcoded-localprov-")
        context = mock(Context::class.java)
        val assets = mock(AssetManager::class.java)
        `when`(context.assets).thenReturn(assets)
        `when`(assets.open("web/data/skill-registry.json"))
            .thenReturn(ByteArrayInputStream("{}".toByteArray()))
    }

    @After
    fun tearDown() { tmpHome.deleteRecursively() }

    private fun mkdirs(path: String) = File(tmpHome, path).apply { mkdirs() }
    private fun write(path: String, content: String) {
        File(tmpHome, path).apply { parentFile?.mkdirs() }.writeText(content)
    }

    @Test
    fun `does not emit phantom plugin-level entry when scanner found that plugin's skills`() {
        // Plugin 'imessage' has skill 'send-message' on disk and is registered
        // in installed_plugins.json AND in the marketplace config store.
        // Scanner emits one entry: imessage:send-message with pluginName=imessage.
        // Backfill must NOT also add a placeholder entry with id='imessage'.
        val pluginPath = ".claude/plugins/marketplaces/youcoded/plugins/imessage"
        write("$pluginPath/plugin.json", """{"name":"imessage"}""")
        mkdirs("$pluginPath/skills/send-message")
        val absInstall = File(tmpHome, pluginPath).absolutePath
        write(".claude/plugins/installed_plugins.json", """
            {"version":2,"plugins":{"imessage@youcoded":[
              {"installPath":"${absInstall.replace("\\","\\\\")}",
               "version":"1.0.0","scope":"user"}
            ]}}
        """.trimIndent())
        // Mark as marketplace-installed in the config store so
        // configStore.getInstalledPlugins() returns it
        write(".claude/youcoded-skills.json", """
            {"installedPlugins":{"imessage":{
              "installedAt":"2026-04-28T00:00:00Z","installedFrom":"marketplace",
              "installPath":"${absInstall.replace("\\","\\\\")}"
            }}}
        """.trimIndent())

        val provider = LocalSkillProvider(tmpHome, context)
        val installed = provider.getInstalled()
        val ids = (0 until installed.length()).map { installed.getJSONObject(it).getString("id") }

        assertTrue("real skill id should be present", ids.contains("imessage:send-message"))
        assertFalse("plugin-level placeholder must not appear", ids.contains("imessage"))
    }

    @Test
    fun `commands-only plugin still emits a plugin-level entry`() {
        // No skills/ directory means scanner finds nothing. The placeholder
        // entry from configStore.getInstalledPlugins() is the only signal
        // the user has that the plugin is installed.
        val pluginPath = ".claude/plugins/marketplaces/youcoded/plugins/some-cmd-plugin"
        write("$pluginPath/plugin.json", """{"name":"some-cmd-plugin"}""")
        mkdirs("$pluginPath/commands")
        val absInstall = File(tmpHome, pluginPath).absolutePath
        write(".claude/youcoded-skills.json", """
            {"installedPlugins":{"some-cmd-plugin":{
              "installedAt":"2026-04-28T00:00:00Z","installedFrom":"marketplace",
              "installPath":"${absInstall.replace("\\","\\\\")}"
            }}}
        """.trimIndent())

        val provider = LocalSkillProvider(tmpHome, context)
        val installed = provider.getInstalled()
        val ids = (0 until installed.length()).map { installed.getJSONObject(it).getString("id") }
        assertTrue("placeholder should still appear for commands-only plugin",
            ids.contains("some-cmd-plugin"))
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd youcoded && ./gradlew :app:testDebugUnitTest --tests "com.youcoded.app.skills.LocalSkillProviderInstalledTest"`
Expected: FAIL on `does not emit phantom plugin-level entry` — current code adds `imessage` placeholder.

- [ ] **Step 3: Add `pluginsWithScannedSkills` filter in `LocalSkillProvider.kt`**

Edit `app/src/main/kotlin/com/youcoded/app/skills/LocalSkillProvider.kt` `getInstalled()`:

Insert a `pluginsWithScannedSkills` Set built from scanner output, and use it inside the marketplace-backfill loop. Replace lines 37-72 (the `if (installedCache == null) { ... }` block) with:

```kotlin
    fun getInstalled(): JSONArray {
        if (installedCache == null) {
            val scanned = scanner.scan()
            val privateSkills = configStore.getPrivateSkills()
            val combined = JSONArray()
            val seenIds = mutableSetOf<String>()
            // Track plugin ids that already have at least one scanned skill —
            // mirrors desktop's pluginsWithScannedSkills (skill-provider.ts
            // lines 174-178). Without this, the backfill below adds a phantom
            // plugin-level entry alongside the real skills (e.g. an
            // "Encyclopedia" placeholder card on top of its 5 individual skills).
            val pluginsWithScannedSkills = mutableSetOf<String>()
            for (i in 0 until scanned.length()) {
                val s = scanned.getJSONObject(i)
                combined.put(s); seenIds.add(s.optString("id"))
                val pluginName = s.optString("pluginName", "")
                if (pluginName.isNotEmpty()) pluginsWithScannedSkills.add(pluginName)
            }
            for (i in 0 until privateSkills.length()) {
                val s = privateSkills.getJSONObject(i)
                combined.put(s); seenIds.add(s.optString("id"))
            }
            // Include marketplace-installed plugins not already discovered
            // by scanner — but skip if the scanner already found their skills.
            val marketplaceInstalled = configStore.getInstalledPlugins()
            val keys = marketplaceInstalled.keys()
            while (keys.hasNext()) {
                val id = keys.next()
                if (seenIds.contains(id)) continue
                if (pluginsWithScannedSkills.contains(id)) continue
                val meta = marketplaceInstalled.optJSONObject(id) ?: continue
                val installPath = meta.optString("installPath", "")
                val dir = if (installPath.isNotEmpty()) File(installPath) else null
                combined.put(JSONObject().apply {
                    put("id", id)
                    put("type", "plugin")
                    put("displayName", id.split("-").joinToString(" ") { it.replaceFirstChar { c -> c.uppercase() } })
                    put("description", "Installed from ${meta.optString("installedFrom", "marketplace")}")
                    put("category", "other")
                    put("source", "marketplace")
                    put("visibility", "published")
                    put("installedAt", meta.optString("installedAt", ""))
                    if (dir != null && !dir.exists()) put("status", "missing")
                })
                seenIds.add(id)
            }
            installedCache = combined
        }
```

(Leave the post-cache override-merge block at lines 75-87 unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd youcoded && ./gradlew :app:testDebugUnitTest --tests "com.youcoded.app.skills.LocalSkillProviderInstalledTest"`
Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
cd youcoded
git add app/src/main/kotlin/com/youcoded/app/skills/LocalSkillProvider.kt \
        app/src/test/kotlin/com/youcoded/app/skills/LocalSkillProviderInstalledTest.kt
git commit -m "fix(android-skills): drop phantom plugin-level entries

LocalSkillProvider.getInstalled() backfilled marketplaceInstalled by
skill-id only, so plugins whose individual skills were already
discovered by the scanner ALSO got a plugin-level placeholder. Result:
'Encyclopedia' card + its 5 real skills, side-by-side.

Now we track pluginName from scanner output and skip backfill for
plugins that already have scanned skills — mirror of desktop's
skill-provider.ts pluginsWithScannedSkills filter."
```

---

## Task 4: Refresh `SkillContext` After Marketplace Mutations

**Files:**
- Modify: `desktop/src/renderer/state/marketplace-context.tsx`
- Create: `desktop/tests/marketplace-context-refreshes-skills.test.tsx`

**Why:** `SkillContext.installed` (consumed by `CommandDrawer` via `drawerSkills`) is loaded once on mount and never refreshes. After Tasks 1–3 land, the cold-start race is gone but the post-install staleness will become visible — install a plugin from the marketplace, open the drawer, plugin's skills are missing until app restart. This is technically a latent desktop bug too; the same fix covers both platforms.

**Design notes:**
- `SkillProvider` already exposes `refreshInstalled()`. We just need to call it.
- Cleanest wiring: take a callback as a prop on `MarketplaceProvider`, or have `MarketplaceProvider` consume `SkillContext` directly. The latter requires `MarketplaceProvider` to be mounted INSIDE `SkillProvider` — verify the mount order in `App.tsx` before deciding. If `MarketplaceProvider` is outside `SkillProvider`, prefer the prop-callback approach.
- Apply to all four mutators: `installSkill`, `uninstallSkill`, `installTheme`, `uninstallTheme`. Themes don't appear in the drawer but are part of the same `skills.list()` response shape on Android (where theme installs route through the same plugin path).

- [ ] **Step 1: Verify mount order**

Inspect `desktop/src/renderer/App.tsx` for the relative nesting of `<MarketplaceProvider>` and `<SkillProvider>`. Document the finding inline at the top of `marketplace-context.tsx` before editing.

If `MarketplaceProvider` is INSIDE `SkillProvider`: import `useSkills` and call `refreshInstalled()` directly.

If `MarketplaceProvider` is OUTSIDE: add an `onSkillsChanged?: () => void` prop to `MarketplaceProvider` and have `App.tsx` wire it via a small inner component that has access to `useSkills()`.

- [ ] **Step 2: Write failing test**

Create `desktop/tests/marketplace-context-refreshes-skills.test.tsx`. The test renders both providers around a probe component that calls `installSkill('foo')` and asserts that `window.claude.skills.list` is called BOTH inside `fetchAll` AND a second time via `SkillContext.refreshInstalled` after the install. The exact shape of the test depends on the wiring chosen in Step 1 — adapt accordingly.

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import { SkillProvider, useSkills } from '../src/renderer/state/skill-context';
import { MarketplaceProvider, useMarketplace } from '../src/renderer/state/marketplace-context';

describe('MarketplaceContext refreshes SkillContext after install/uninstall', () => {
  let listCalls = 0;
  let installCalls = 0;
  beforeEach(() => {
    listCalls = 0;
    installCalls = 0;
    (window as any).claude = {
      skills: {
        list: vi.fn(async () => { listCalls++; return []; }),
        listMarketplace: vi.fn(async () => []),
        getFavorites: vi.fn(async () => []),
        getChips: vi.fn(async () => []),
        getCuratedDefaults: vi.fn(async () => []),
        install: vi.fn(async () => { installCalls++; }),
        getFeatured: vi.fn(async () => ({ hero: [], rails: [] })),
      },
      commands: { list: vi.fn(async () => []) },
      marketplace: { getPackages: vi.fn(async () => ({})) },
      marketplaceAuth: { signedIn: vi.fn(async () => false) },
      theme: { marketplace: { list: vi.fn(async () => []) } },
      appearance: { getFavoriteThemes: vi.fn(async () => []) },
    };
  });

  it('calls skills.list a second time after installSkill', async () => {
    let installFn: ((id: string) => Promise<void>) | null = null;
    function Probe() {
      const mp = useMarketplace();
      installFn = mp.installSkill;
      return null;
    }
    render(
      <SkillProvider>
        <MarketplaceProvider>
          <Probe />
        </MarketplaceProvider>
      </SkillProvider>,
    );
    // Wait for initial mount fetches
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    const baseline = listCalls;
    await act(async () => { await installFn!('foo'); });
    expect(listCalls).toBeGreaterThan(baseline + 1); // fetchAll + refreshInstalled
    expect(installCalls).toBe(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run tests/marketplace-context-refreshes-skills.test.tsx`
Expected: FAIL — `listCalls` increments only by `fetchAll`'s call, not by an extra `refreshInstalled`.

- [ ] **Step 4: Implement the wiring**

Inside `desktop/src/renderer/state/marketplace-context.tsx`, after the existing imports add:

```tsx
import { useSkills } from './skill-context';
```

(Or, if Step 1 found `MarketplaceProvider` is OUTSIDE `SkillProvider`, refactor to take a callback prop instead.)

Inside `MarketplaceProvider`, near the top of the function body alongside `const { reloadUserThemes } = useTheme();`:

```tsx
  const { refreshInstalled: refreshDrawerSkills } = useSkills();
```

In `installSkill`, after `await fetchAll();` (line 246) add:

```tsx
      await refreshDrawerSkills();
```

Repeat in `uninstallSkill` (after line 260), `installTheme` (after line 281), `uninstallTheme` (after line 299).

Add `refreshDrawerSkills` to the `useCallback` dependency arrays for those four actions.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd youcoded/desktop && npx vitest run tests/marketplace-context-refreshes-skills.test.tsx`
Expected: PASS.

Also re-run the existing marketplace-context tests to confirm no regressions:

```
cd youcoded/desktop && npx vitest run tests/marketplace-context-install-telemetry.test.tsx
```

- [ ] **Step 6: Commit**

```bash
cd youcoded
git add desktop/src/renderer/state/marketplace-context.tsx \
        desktop/tests/marketplace-context-refreshes-skills.test.tsx
git commit -m "fix(skills): refresh drawer state after marketplace install/uninstall

MarketplaceContext maintained its own installedSkills via fetchAll(),
but never told SkillContext (which feeds the CommandDrawer) to
refresh. The drawer stayed stale until app restart. Latent on desktop,
visible on Android once the WS cold-start race fix exposed installed
plugins in the first place.

Calls SkillContext.refreshInstalled() after each of the four
marketplace mutators."
```

---

## Verification (after all four tasks land)

- [ ] **Build the APK and install on the device**

```bash
cd youcoded
./gradlew assembleDebug
adb -s R5CY72QFCZB install -r app/build/outputs/apk/debug/app-debug.apk
```

- [ ] **Marketplace install smoke test**

1. Launch the app, open Marketplace.
2. Install `youcoded-civic-report`. Confirm the install spinner resolves and the card flips to "Installed".
3. Install `youcoded-encyclopedia`. Same.
4. Open the command drawer (slash key or menu). Switch to Browse mode.
5. Expected:
   - `youcoded-civic-report:civic-report` (and any sibling skills) appear once each, no duplicates
   - `youcoded-encyclopedia:journal` (and siblings) appear once each, no duplicates
   - No phantom plugin-level "Civic Report" or "Encyclopedia" cards alongside their skills
6. Force-close and relaunch the app. Open the drawer immediately. Same skills should appear without delay (Fix #1 confirmation).

- [ ] **CDP probe (live verification)**

```bash
adb shell ps -A | grep com.youcoded
adb forward tcp:9222 localabstract:webview_devtools_remote_<PID>
curl -s http://localhost:9222/json   # copy the webSocketDebuggerUrl
node scripts/cdp-eval.mjs '<wsUrl>' "(async () => {
  const skills = await window.claude.skills.list();
  return {
    count: skills.length,
    civicReportEntries: skills.filter(s => s.id.includes('civic')),
    encyclopediaEntries: skills.filter(s => s.id.includes('encyclopedia')),
  };
})()"
```

Expected output: each plugin's skills appear exactly once with namespaced ids, no bare-id duplicates, no plugin-level placeholders alongside discovered skills.

- [ ] **Cleanup**

```bash
git worktree remove youcoded/.worktrees/android-plugin-discovery
git branch -D fix/android-plugin-discovery   # only after merge to master
```

Update `docs/PITFALLS.md` if any of the four fixes uncovered new invariants worth pinning. Likely candidate: a note under "Plugin Installation & Claude Code Registries" that Android's `SkillScanner` Pass 1 must NOT use `listInstalledPluginDirs()` (and explain why — the helper is correct for reconcilers, wrong for the scanner). Mention the cold-start race fix in remote-shim under a new "WebSocket Bridge (Renderer)" subsection.
