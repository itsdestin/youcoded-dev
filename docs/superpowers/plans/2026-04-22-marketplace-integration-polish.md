# Marketplace Integration Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give integrations a visible platform badge, a plugin-parity detail page with descriptions/tags, and an honest Settings button (disabled "Coming soon…") — replacing the current button that silently uninstalls.

**Architecture:** Add a shared `platform-display` helper + `platform:get` IPC so the renderer can gate UI by platform. Rewrite `IntegrationDetailOverlay` (in `MarketplaceScreen.tsx`) to mirror `MarketplaceDetailOverlay`'s section structure. Add `tags` to the integration registry schema and pre-fill all 9 entries. Add a new `integrations:connect` IPC that re-runs `postInstallCommand` without uninstalling, and wire it to a proper Connect button for the needs-auth state.

**Tech Stack:** TypeScript (Electron main + React renderer), Kotlin (Android), Vitest (desktop tests).

**Two repos:**
- `C:\Users\desti\youcoded-dev\youcoded\` — app code
- `C:\Users\desti\youcoded-dev\wecoded-marketplace\` — registry

**Worktree:** Create a worktree for the youcoded changes before Task 1. Marketplace-registry changes (Task 7) land directly on master of wecoded-marketplace since they're a single-file addition.

---

## Worktree setup

- [ ] **Step 0.1: Create worktree for youcoded changes**

Run:
```bash
cd /c/Users/desti/youcoded-dev/youcoded && git worktree add ../youcoded-worktrees/marketplace-integration-polish -b marketplace-integration-polish master
```

All subsequent youcoded work happens inside `C:\Users\desti\youcoded-dev\youcoded-worktrees\marketplace-integration-polish\`. Marketplace-registry work in Task 7 happens in `C:\Users\desti\youcoded-dev\wecoded-marketplace\` (no worktree — single-file change).

- [ ] **Step 0.2: Sync both repos first**

Run:
```bash
cd /c/Users/desti/youcoded-dev/wecoded-marketplace && git fetch origin && git pull origin master
cd /c/Users/desti/youcoded-dev/youcoded-worktrees/marketplace-integration-polish && git pull origin master
```

---

### Task 1: Shared platform-display helper

Pure functions that map `darwin → macOS`, `win32 → Windows`, etc. Used by integration-installer, card badge, detail overlay, tooltips.

**Files:**
- Create: `youcoded-worktrees/marketplace-integration-polish/desktop/src/shared/platform-display.ts`
- Create: `youcoded-worktrees/marketplace-integration-polish/desktop/tests/platform-display.test.ts`

- [ ] **Step 1.1: Write the failing test**

Create `desktop/tests/platform-display.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { platformDisplayName, platformListDisplay } from '../src/shared/platform-display';

describe('platformDisplayName', () => {
  test('maps known codes to display names', () => {
    expect(platformDisplayName('darwin')).toBe('macOS');
    expect(platformDisplayName('win32')).toBe('Windows');
    expect(platformDisplayName('linux')).toBe('Linux');
    expect(platformDisplayName('android')).toBe('Android');
  });

  test('returns input unchanged for unknown codes', () => {
    expect(platformDisplayName('beos')).toBe('beos');
    expect(platformDisplayName('')).toBe('');
  });
});

describe('platformListDisplay', () => {
  test('returns empty string for empty input', () => {
    expect(platformListDisplay([])).toBe('');
  });

  test('returns single name for one-element list', () => {
    expect(platformListDisplay(['darwin'])).toBe('macOS');
  });

  test('joins two names with "or"', () => {
    expect(platformListDisplay(['darwin', 'linux'])).toBe('macOS or Linux');
  });

  test('joins three names with commas and oxford "or"', () => {
    expect(platformListDisplay(['darwin', 'linux', 'win32'])).toBe('macOS, Linux, or Windows');
  });

  test('passes unknown codes through unchanged', () => {
    expect(platformListDisplay(['darwin', 'beos'])).toBe('macOS or beos');
  });
});
```

- [ ] **Step 1.2: Run the test to verify it fails**

Run: `cd desktop && npx vitest run tests/platform-display.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 1.3: Implement the helper**

Create `desktop/src/shared/platform-display.ts`:

```ts
// Shared platform-code → display-name helpers.
//
// Used everywhere user-facing text might otherwise leak raw Node
// `process.platform` codes (e.g. "darwin"). Also shared between desktop main
// process, renderer (React), and Android WebView via the React bundle.

const NAMES: Record<string, string> = {
  darwin: 'macOS',
  win32: 'Windows',
  linux: 'Linux',
  android: 'Android',
};

export function platformDisplayName(code: string): string {
  return NAMES[code] ?? code;
}

// Human-readable join. Examples:
//   ['darwin']                   -> 'macOS'
//   ['darwin', 'linux']          -> 'macOS or Linux'
//   ['darwin', 'linux', 'win32'] -> 'macOS, Linux, or Windows'
export function platformListDisplay(codes: string[]): string {
  const names = codes.map(platformDisplayName);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} or ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, or ${names[names.length - 1]}`;
}
```

- [ ] **Step 1.4: Run the test to verify it passes**

Run: `cd desktop && npx vitest run tests/platform-display.test.ts`
Expected: PASS — all 7 tests green.

- [ ] **Step 1.5: Commit**

```bash
cd /c/Users/desti/youcoded-dev/youcoded-worktrees/marketplace-integration-polish
git add desktop/src/shared/platform-display.ts desktop/tests/platform-display.test.ts
git commit -m "feat(shared): add platform-display helpers (darwin -> macOS)"
```

---

### Task 2: Clean up integration-installer error copy

Replace raw `darwin`/`win32` leakage in error strings. Use the new helper.

**Files:**
- Modify: `desktop/src/main/integration-installer.ts:113-119, :128`

- [ ] **Step 2.1: Add import**

At the top of `desktop/src/main/integration-installer.ts`, after the existing `import { installPlugin, uninstallPlugin } from "./plugin-installer";` line, add:

```ts
import { platformListDisplay } from "../shared/platform-display";
```

- [ ] **Step 2.2: Fix platform-gate error string**

Replace lines 113-119 (the `Platform gate` block):

```ts
    // Platform gate — honour entry.platforms if present.
    if (entry.platforms && entry.platforms.length > 0) {
      const cur = currentPlatform();
      if (cur === "unknown" || !entry.platforms.includes(cur as any)) {
        return this.recordFailure(slug, `Not supported on this platform (needs ${entry.platforms.join("/")})`);
      }
    }
```

with:

```ts
    // Platform gate — honour entry.platforms if present.
    // Error copy uses display names (macOS / Windows / Linux) since this
    // message can surface in the UI if the renderer gate is bypassed.
    if (entry.platforms && entry.platforms.length > 0) {
      const cur = currentPlatform();
      if (cur === "unknown" || !entry.platforms.includes(cur as any)) {
        return this.recordFailure(slug, `Not supported on this platform — needs ${platformListDisplay(entry.platforms)}`);
      }
    }
```

- [ ] **Step 2.3: Fix stub-setup-type error string**

Replace line 128:

```ts
    return this.recordFailure(slug, `setup.type "${entry.setup.type}" not yet implemented`);
```

with:

```ts
    return this.recordFailure(slug, `This integration's setup method isn't supported in this version.`);
```

- [ ] **Step 2.4: Verify typecheck**

Run: `cd desktop && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2.5: Commit**

```bash
git add desktop/src/main/integration-installer.ts
git commit -m "fix(integrations): replace raw platform codes in error copy with display names"
```

---

### Task 3: Add IntegrationInstaller.connect() method

Re-runs `postInstallCommand` for an already-installed integration without a fresh install+write cycle. Fixes the needs-auth case where the only recovery was uninstall+reinstall.

**Files:**
- Modify: `desktop/src/main/integration-installer.ts` (new method after `uninstall`, around line 189)
- Create: `desktop/tests/integration-installer-connect.test.ts`

- [ ] **Step 3.1: Write the failing test**

Create `desktop/tests/integration-installer-connect.test.ts`:

```ts
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { IntegrationInstaller } from '../src/main/integration-installer';

// Redirect the installer's HOME so tests don't write into the real
// ~/.claude/integrations.json. vitest doesn't provide per-test tmpdirs, so
// we roll our own.
let tmpHome: string;
let origHome: string | undefined;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-test-'));
  origHome = process.env.HOME;
  // On Windows, Node's os.homedir() reads USERPROFILE; set both.
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;
});

afterEach(() => {
  process.env.HOME = origHome;
  try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch {}
});

describe('IntegrationInstaller.connect', () => {
  test('returns postInstallCommand for installed integration with one', async () => {
    const installer = new IntegrationInstaller();

    // Seed the manifest with an installed entry.
    installer.writeManifest({
      'google-services': { slug: 'google-services', installed: true, connected: false },
    });

    // Stub listCatalog so we don't hit the network.
    vi.spyOn(installer, 'listCatalog').mockResolvedValue({
      version: 'test',
      integrations: [{
        slug: 'google-services',
        displayName: 'Google Services',
        tagline: '',
        kind: 'plugin' as any,
        setup: {
          type: 'plugin',
          pluginId: 'google-services',
          postInstallCommand: '/google-services-setup',
          requiresOAuth: true,
        } as any,
        status: 'available',
      }],
    });

    const result = await installer.connect('google-services');

    expect(result.error).toBeUndefined();
    expect(result.installed).toBe(true);
    expect(result.postInstallCommand).toBe('/google-services-setup');
  });

  test('returns error when integration is not installed', async () => {
    const installer = new IntegrationInstaller();

    vi.spyOn(installer, 'listCatalog').mockResolvedValue({
      version: 'test',
      integrations: [{
        slug: 'google-services',
        displayName: 'Google Services',
        tagline: '',
        kind: 'plugin' as any,
        setup: {
          type: 'plugin',
          pluginId: 'google-services',
          postInstallCommand: '/google-services-setup',
          requiresOAuth: true,
        } as any,
        status: 'available',
      }],
    });

    const result = await installer.connect('google-services');

    expect(result.error).toContain('not installed');
    expect(result.installed).toBe(false);
  });

  test('returns error when entry has no postInstallCommand', async () => {
    const installer = new IntegrationInstaller();
    installer.writeManifest({
      'todoist': { slug: 'todoist', installed: true, connected: false },
    });

    vi.spyOn(installer, 'listCatalog').mockResolvedValue({
      version: 'test',
      integrations: [{
        slug: 'todoist',
        displayName: 'Todoist',
        tagline: '',
        kind: 'mcp' as any,
        setup: { type: 'api-key', keyName: 'TODOIST_API_KEY', requiresOAuth: false } as any,
        status: 'available',
      }],
    });

    const result = await installer.connect('todoist');

    expect(result.error).toContain('no connect flow');
  });
});
```

- [ ] **Step 3.2: Run the test to verify it fails**

Run: `cd desktop && npx vitest run tests/integration-installer-connect.test.ts`
Expected: FAIL — `installer.connect is not a function`.

- [ ] **Step 3.3: Add the connect method**

Also update the `IntegrationInstallResult` shape docstring: `postInstallCommand` is now used by both install() and connect().

In `desktop/src/main/integration-installer.ts`, insert the following method after the `uninstall` method (after line 189 / just before the existing `configure` method):

```ts
  // Re-run the post-install setup command for an already-installed integration.
  // Used by the "Connect" button on the detail overlay when state is
  // installed-but-not-connected (e.g. OAuth expired or user skipped the
  // initial setup flow). Does NOT re-install the plugin — just returns the
  // command so the renderer can spawn it in a fresh Sonnet session, same
  // path that install() uses.
  async connect(slug: string): Promise<IntegrationInstallResult> {
    const manifest = this.readManifest();
    const current = manifest[slug];
    if (!current?.installed) {
      return { slug, installed: false, connected: false, error: `${slug} is not installed` };
    }

    const catalog = await this.listCatalog();
    const entry = (catalog.integrations || []).find((e) => e.slug === slug);
    if (!entry) {
      return { ...current, error: `Integration not found: ${slug}` };
    }

    const cmd = entry.setup.postInstallCommand;
    if (!cmd) {
      return { ...current, error: `${slug} has no connect flow` };
    }

    // Clear any prior error so the UI flips out of the "Error" badge when
    // the user kicks off a retry. State stays installed=true/connected=false
    // until the post-install command actually succeeds (which is outside the
    // installer's visibility — the user's Claude session runs it).
    const next: IntegrationState = { ...current, error: undefined };
    manifest[slug] = next;
    this.writeManifest(manifest);

    return { ...next, postInstallCommand: cmd };
  }
```

- [ ] **Step 3.4: Run the test to verify it passes**

Run: `cd desktop && npx vitest run tests/integration-installer-connect.test.ts`
Expected: PASS — all 3 tests green.

- [ ] **Step 3.5: Commit**

```bash
git add desktop/src/main/integration-installer.ts desktop/tests/integration-installer-connect.test.ts
git commit -m "feat(integrations): add connect() to re-run postInstallCommand for installed entries"
```

---

### Task 4: Add `platform:get` IPC channel (parity across desktop + android)

Exposes the current platform (`darwin`/`win32`/`linux`/`android`) to the renderer. Needed so the card UI can gate the install button before the user clicks.

**Files:**
- Modify: `desktop/src/shared/types.ts` (add to IPC enum)
- Modify: `desktop/src/main/preload.ts` (add to IPC const + expose getPlatform)
- Modify: `desktop/src/main/ipc-handlers.ts` (register handler)
- Modify: `desktop/src/renderer/remote-shim.ts` (expose on window.claude)
- Modify: `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` (handle bridge message)

- [ ] **Step 4.1: Add channel constant to shared types**

In `desktop/src/shared/types.ts`, locate the IPC const (around line 565). After the `TERMINAL_READY` line (~line 606), before the `// Main -> Renderer` comment, add:

```ts
  // Static-per-session lookup — returns 'darwin' | 'win32' | 'linux' | 'android'.
  // Used by the integration cards to gate UI by platform before the user
  // clicks (backend integration-installer.ts also re-checks).
  PLATFORM_GET: 'platform:get',
```

- [ ] **Step 4.2: Add channel constant to preload**

In `desktop/src/main/preload.ts`, locate the IPC const. After the `SKILLS_GET_FEATURED` line, add the same constant alongside the existing integrations entries (around line 60):

```ts
  PLATFORM_GET: 'platform:get',
```

Then at the bottom of the exposed `window.claude` surface, add a new top-level method. Find the `integrations:` namespace block (search for `INTEGRATIONS_LIST` usage in the preload's exposure) and add a sibling `getPlatform` method at the same top level as `integrations`:

```ts
    getPlatform: (): Promise<'darwin' | 'win32' | 'linux' | 'android'> =>
      ipcRenderer.invoke(IPC.PLATFORM_GET),
```

**Important:** If you can't locate the exact place to drop this, use `grep` to find `ipcRenderer.invoke('integrations:list')` in preload.ts — add `getPlatform` in the same block near where `integrations` is exposed.

- [ ] **Step 4.3: Register desktop IPC handler**

In `desktop/src/main/ipc-handlers.ts`, after the existing `INTEGRATIONS_CONFIGURE` handler registration (around line 890), add:

```ts
  // Reports process.platform so the renderer can gate UI (e.g. hide Install
  // buttons on macOS-only integrations when running on Windows). Returns the
  // raw Node code — the renderer uses platform-display.ts to humanize.
  ipcMain.handle(IPC.PLATFORM_GET, () => {
    return process.platform;
  });
```

- [ ] **Step 4.4: Expose on remote-shim (WebSocket / Android path)**

In `desktop/src/renderer/remote-shim.ts`, locate where `integrations:` is exposed on the `window.claude` equivalent shape. Add a sibling `getPlatform` method (likely around line 649-655):

```ts
    getPlatform: (): Promise<'darwin' | 'win32' | 'linux' | 'android'> =>
      invoke('platform:get'),
```

- [ ] **Step 4.5: Handle the message on Android**

In `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`, locate the `handleBridgeMessage()` `when` block. Find the existing `"integrations:status", "integrations:install", "integrations:uninstall", "integrations:configure" ->` case (around line 891). Just above it, add a new case:

```kotlin
            "platform:get" -> {
                // Android is explicitly "android" — distinct from "linux" so
                // integrations that declare `platforms: ['linux']` don't
                // accidentally enable on Android. The desktop handler returns
                // process.platform ('darwin'/'win32'/'linux') natively.
                val payload = JSONObject().apply { put("platform", "android") }
                msg.id?.let { bridgeServer.respond(ws, msg.type, it, payload) }
            }
```

**Shape note:** Desktop returns the raw string; Android wraps in `{platform: "android"}`. The remote-shim normalizes — see Step 4.6.

- [ ] **Step 4.6: Normalize the Android response in remote-shim**

In `desktop/src/renderer/remote-shim.ts`, update the `getPlatform` binding from Step 4.4 to unwrap the Android shape:

```ts
    getPlatform: async (): Promise<'darwin' | 'win32' | 'linux' | 'android'> => {
      const result = await invoke('platform:get');
      // Desktop returns the raw string; Android wraps in {platform}. Normalize.
      if (typeof result === 'string') return result as any;
      if (result && typeof result === 'object' && 'platform' in result) {
        return (result as any).platform;
      }
      return 'linux'; // degenerate fallback; shouldn't hit
    },
```

- [ ] **Step 4.7: Verify typecheck**

Run: `cd desktop && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4.8: Verify IPC parity test still passes**

Run: `cd desktop && npx vitest run tests/ipc-channels.test.ts`
Expected: PASS. (The test is informational for missing channels; it should not fail but check for warnings in the console output about `platform:get`.)

- [ ] **Step 4.9: Commit**

```bash
git add desktop/src/shared/types.ts desktop/src/main/preload.ts desktop/src/main/ipc-handlers.ts desktop/src/renderer/remote-shim.ts app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt
git commit -m "feat(ipc): add platform:get for UI-level platform gating (desktop + android parity)"
```

---

### Task 5: Add `integrations:connect` IPC channel (parity)

Wires the new `IntegrationInstaller.connect()` through to the renderer.

**Files:**
- Modify: `desktop/src/shared/types.ts`
- Modify: `desktop/src/main/preload.ts`
- Modify: `desktop/src/main/ipc-handlers.ts`
- Modify: `desktop/src/renderer/remote-shim.ts`
- Modify: `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`

- [ ] **Step 5.1: Add constant to shared types**

In `desktop/src/shared/types.ts`, next to the other `INTEGRATIONS_*` constants (around line 600):

```ts
  INTEGRATIONS_CONNECT: 'integrations:connect',
```

- [ ] **Step 5.2: Add constant to preload**

In `desktop/src/main/preload.ts`, next to the other `INTEGRATIONS_*` constants (around line 60):

```ts
  INTEGRATIONS_CONNECT: 'integrations:connect',
```

Then in the exposed `integrations:` namespace block of preload, add:

```ts
    connect: (slug: string) =>
      ipcRenderer.invoke(IPC.INTEGRATIONS_CONNECT, slug),
```

- [ ] **Step 5.3: Register desktop IPC handler**

In `desktop/src/main/ipc-handlers.ts`, after the existing `INTEGRATIONS_UNINSTALL` handler (around line 888-890), add:

```ts
  ipcMain.handle(IPC.INTEGRATIONS_CONNECT, async (_e, slug: string) => {
    return integrationInstaller.connect(slug);
  });
```

- [ ] **Step 5.4: Expose on remote-shim**

In `desktop/src/renderer/remote-shim.ts`, inside the `integrations:` block (around line 649-655), add:

```ts
      connect: (slug: string) => invoke('integrations:connect', { slug }),
```

- [ ] **Step 5.5: Handle the message on Android**

In `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`, update the existing `"integrations:status", "integrations:install", ...` multi-case block (around line 891-894) to include `"integrations:connect"`:

```kotlin
            "integrations:status",
            "integrations:install",
            "integrations:uninstall",
            "integrations:connect",
            "integrations:configure" -> {
```

(Just add the `"integrations:connect",` line — the existing stub body returns the generic JSON placeholder, which is fine for Android until an Android integration backend exists.)

- [ ] **Step 5.6: Verify typecheck**

Run: `cd desktop && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5.7: Commit**

```bash
git add desktop/src/shared/types.ts desktop/src/main/preload.ts desktop/src/main/ipc-handlers.ts desktop/src/renderer/remote-shim.ts app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt
git commit -m "feat(ipc): add integrations:connect for needs-auth re-trigger (desktop + android parity)"
```

---

### Task 6: Renderer platform hook

A tiny cached hook so multiple components don't each invoke the IPC. Resolves on mount; renders `null` until resolved.

**Files:**
- Create: `desktop/src/renderer/state/platform.ts`

- [ ] **Step 6.1: Write the hook**

Create `desktop/src/renderer/state/platform.ts`:

```ts
// Renderer-side platform detection. Wraps window.claude.getPlatform() and
// caches the result in module scope since platform never changes over a
// session. Components call useCurrentPlatform(); initial render returns
// null, the effect resolves + re-renders with the real value on next tick.

import { useEffect, useState } from 'react';

export type Platform = 'darwin' | 'win32' | 'linux' | 'android';

let cached: Platform | null = null;
let inflight: Promise<Platform> | null = null;

async function fetchPlatform(): Promise<Platform> {
  if (cached) return cached;
  if (inflight) return inflight;
  const w = window as any;
  if (!w.claude?.getPlatform) {
    // Defensive fallback for older shims — detect Android via file: protocol.
    cached = location.protocol === 'file:' ? 'android' : 'linux';
    return cached;
  }
  inflight = w.claude.getPlatform().then((p: Platform) => {
    cached = p;
    inflight = null;
    return p;
  });
  return inflight;
}

export function useCurrentPlatform(): Platform | null {
  const [platform, setPlatform] = useState<Platform | null>(cached);
  useEffect(() => {
    if (cached) { setPlatform(cached); return; }
    let active = true;
    fetchPlatform().then((p) => { if (active) setPlatform(p); });
    return () => { active = false; };
  }, []);
  return platform;
}
```

- [ ] **Step 6.2: Verify typecheck**

Run: `cd desktop && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6.3: Commit**

```bash
git add desktop/src/renderer/state/platform.ts
git commit -m "feat(renderer): add useCurrentPlatform hook (cached, single IPC per session)"
```

---

### Task 7: Registry additions — add `tags` + pre-filled content

This task lands in `wecoded-marketplace`, NOT the youcoded worktree.

**Files:**
- Modify: `wecoded-marketplace/integrations/index.json`
- Modify: `youcoded-worktrees/marketplace-integration-polish/desktop/src/shared/types.ts` (IntegrationEntry)

- [ ] **Step 7.1: Add `tags` to IntegrationEntry type**

In `youcoded-worktrees/marketplace-integration-polish/desktop/src/shared/types.ts`, locate the `IntegrationEntry` interface (around line 394-410). Add `tags?: string[]` after the `iconUrl?: string;` line, before `platforms?`:

```ts
  // Human tags for search and the detail-page chip row. Freeform strings;
  // the detail overlay renders each as a "#tag" pill.
  tags?: string[];
```

Save the file — do NOT commit yet; this change is part of Task 8's commit (stays within the youcoded repo).

- [ ] **Step 7.2: Add tags to registry JSON**

In `C:\Users\desti\youcoded-dev\wecoded-marketplace\integrations\index.json`, add a `"tags"` array to each of the 9 integration entries. Exact additions:

For `apple-services` (after the `"lifeArea"` array):
```json
      "tags": ["calendar", "email", "contacts", "notes", "files"]
```

For `google-services`:
```json
      "tags": ["email", "calendar", "drive", "docs", "oauth"]
```

For `imessage`:
```json
      "tags": ["messaging", "social"]
```

For `todoist`:
```json
      "tags": ["tasks", "productivity"]
```

For `applescript`:
```json
      "tags": ["automation", "scripting"]
```

For `canva`:
```json
      "tags": ["design", "creative", "oauth"]
```

For `github`:
```json
      "tags": ["code", "development", "oauth"]
```

For `macos-control`:
```json
      "tags": ["automation", "accessibility"]
```

For `windows-control`:
```json
      "tags": ["automation", "accessibility"]
```

Make sure each entry's closing `}` stays balanced. Each `"tags"` line is a new property on the existing object — add a comma after the preceding property's closing bracket/value.

- [ ] **Step 7.3: Validate the JSON**

Run: `cd /c/Users/desti/youcoded-dev/wecoded-marketplace && node -e "JSON.parse(require('fs').readFileSync('integrations/index.json','utf8'))"`
Expected: no output (success). If you see `SyntaxError`, re-check comma placement.

- [ ] **Step 7.4: Check for build script**

Run: `ls scripts/build-integrations.js` in the wecoded-marketplace directory.
If the file exists, open it and verify `tags` is either passed through or not explicitly stripped. If it's a strict field-allowlist, add `'tags'` to the allowlist. If it's a passthrough (common case — the script usually generates `index.json` from per-slug source files), no change needed.

- [ ] **Step 7.5: Commit in wecoded-marketplace**

```bash
cd /c/Users/desti/youcoded-dev/wecoded-marketplace
git add integrations/index.json
# Also add scripts/build-integrations.js if modified in Step 7.4:
# git add scripts/build-integrations.js
git commit -m "feat(integrations): add tags field + pre-fill for 9 entries"
```

Do NOT push yet — wait until Task 12 passes verification.

---

### Task 8: Add `'locked'` tone to MarketplaceCard badge

The platform-blocked badge needs a visually distinct tone that reads as "not available to you" rather than "error" or "coming soon".

**Files:**
- Modify: `desktop/src/renderer/components/marketplace/MarketplaceCard.tsx:36, :52-57`

- [ ] **Step 8.1: Widen the badge tone union**

In `desktop/src/renderer/components/marketplace/MarketplaceCard.tsx`, update the `statusBadge` prop type on line 36:

```ts
  statusBadge?: {
    text: string;
    tone: 'ok' | 'warn' | 'err' | 'neutral' | 'locked';
  };
```

- [ ] **Step 8.2: Add `locked` to the tone-class map**

Update the `STATUS_TONE_CLASS` const on line 52:

```ts
const STATUS_TONE_CLASS: Record<'ok' | 'warn' | 'err' | 'neutral' | 'locked', string> = {
  ok: 'bg-green-500/15 text-green-400 border border-green-500/30',
  warn: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  err: 'bg-red-500/15 text-red-400 border border-red-500/30',
  neutral: 'bg-inset text-fg-2 border border-edge',
  // Platform-blocked — muted slate reading as "not for this platform" without
  // the alarm of err/warn. Distinct from neutral so "macOS Only" doesn't blur
  // into "Coming soon".
  locked: 'bg-slate-500/10 text-fg-dim border border-slate-500/30',
};
```

- [ ] **Step 8.3: Update the `integrationStatusBadge` helper type in MarketplaceScreen**

The helper at `desktop/src/renderer/components/marketplace/MarketplaceScreen.tsx:98` declares a narrower tone type. Widen it to match:

```ts
  const integrationStatusBadge = (item: IntegrationCardItem): { text: string; tone: 'ok' | 'warn' | 'err' | 'neutral' | 'locked' } => {
```

(The function body stays unchanged for now; Task 9 adds the `locked` return branch.)

- [ ] **Step 8.4: Verify typecheck**

Run: `cd desktop && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8.5: Commit**

```bash
git add desktop/src/renderer/components/marketplace/MarketplaceCard.tsx desktop/src/renderer/components/marketplace/MarketplaceScreen.tsx
git commit -m "feat(marketplace): add 'locked' badge tone for platform-blocked cards"
```

---

### Task 9: Card platform-blocked badge override

Renders `"macOS Only"`-style badge on unsupported-platform cards, superseding the install state badge.

**Files:**
- Modify: `desktop/src/renderer/components/marketplace/MarketplaceScreen.tsx:98-106, :291-343, type imports`

- [ ] **Step 9.1: Import the hook and helper**

At the top of `desktop/src/renderer/components/marketplace/MarketplaceScreen.tsx`, add to imports:

```ts
import { useCurrentPlatform } from '../../state/platform';
import { platformDisplayName } from '../../../shared/platform-display';
```

Match the existing import style (relative paths, same ordering as nearby imports).

- [ ] **Step 9.2: Call the hook**

Near the top of the `MarketplaceScreen` function body (immediately after `useMarketplace()` call or equivalent — inspect the file for the hook-calling convention), add:

```ts
  const currentPlatform = useCurrentPlatform();
```

- [ ] **Step 9.3: Extend `integrationStatusBadge` to check platform**

Update the helper (around line 98-106):

```ts
  const integrationStatusBadge = (item: IntegrationCardItem): { text: string; tone: 'ok' | 'warn' | 'err' | 'neutral' | 'locked' } => {
    // Platform lock overrides everything — if the user can't install, the
    // connected/needs-auth state is moot. Fall through when platform is still
    // resolving (null) — treat unresolved as "not blocked" to avoid a
    // transient grey badge flash on mount.
    if (currentPlatform && item.platforms && item.platforms.length > 0 && !item.platforms.includes(currentPlatform as any)) {
      return { text: `${platformDisplayName(item.platforms[0])} Only`, tone: 'locked' };
    }
    if (item.status === 'planned') return { text: 'Coming soon', tone: 'neutral' };
    if (item.status === 'deprecated') return { text: 'Deprecated', tone: 'neutral' };
    const s = item.state;
    if (s.error) return { text: 'Error', tone: 'err' };
    if (s.connected) return { text: 'Connected', tone: 'ok' };
    if (s.installed) return { text: 'Needs auth', tone: 'warn' };
    return { text: 'Not installed', tone: 'neutral' };
  };
```

**Note on multi-platform arrays:** When `platforms` has multiple entries (e.g., `['darwin', 'linux']`), the badge names the first entry. This is correct for the current registry (all multi-platform integrations don't declare `platforms`) — if any future entry declares multiple, the "<Platform> Only" phrasing would be misleading, but we'll address that when it arises.

- [ ] **Step 9.4: Verify typecheck**

Run: `cd desktop && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9.5: Commit**

```bash
git add desktop/src/renderer/components/marketplace/MarketplaceScreen.tsx
git commit -m "feat(marketplace): show 'macOS Only' badge on platform-blocked integration cards"
```

---

### Task 10: Rewrite `IntegrationDetailOverlay` — plugin parity + action state machine

The big one. Rewrites the detail overlay body (lines ~509-546 of MarketplaceScreen.tsx) to mirror MarketplaceDetailOverlay's structure, adds the action-button state table, and disables Settings with "Coming soon…".

**Files:**
- Modify: `desktop/src/renderer/components/marketplace/MarketplaceScreen.tsx` (IntegrationDetailOverlay component + handleIntegration callsite)

- [ ] **Step 10.1: Update the `IntegrationDetailOverlay` prop surface**

Replace the current prop signature (around line 455-463):

```ts
function IntegrationDetailOverlay({
  item, onClose, onPrimary, statusBadge, iconUrl,
}: {
  item: IntegrationCardItem;
  onClose(): void;
  onPrimary(): void | Promise<void>;
  statusBadge: { text: string; tone: 'ok' | 'warn' | 'err' | 'neutral' };
  iconUrl?: string;
}) {
```

with:

```ts
function IntegrationDetailOverlay({
  item, onClose, onInstall, onConnect, onUninstall, statusBadge, iconUrl, platformBlocked, platformBlockedName,
}: {
  item: IntegrationCardItem;
  onClose(): void;
  onInstall(): void | Promise<void>;
  onConnect(): void | Promise<void>;
  onUninstall(): void | Promise<void>;
  statusBadge: { text: string; tone: 'ok' | 'warn' | 'err' | 'neutral' | 'locked' };
  iconUrl?: string;
  platformBlocked: boolean;
  platformBlockedName: string | null;  // e.g. "macOS" when blocked, else null
}) {
```

- [ ] **Step 10.2: Widen the toneClass map inside the component**

Update the `toneClass` const inside `IntegrationDetailOverlay` (around line 472-477):

```ts
  const toneClass: Record<string, string> = {
    ok: 'bg-green-500/15 text-green-400 border-green-500/30',
    warn: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    err: 'bg-red-500/15 text-red-400 border-red-500/30',
    neutral: 'bg-inset text-fg-2 border-edge',
    locked: 'bg-slate-500/10 text-fg-dim border-slate-500/30',
  };
```

- [ ] **Step 10.3: Replace the action-label block with state detection**

Delete the existing `planned` / `deprecated` / `actionLabel` / `actionDisabled` lines (around 479-488).

Replace with:

```ts
  // Derive the action-button state. Precedence: platform-blocked > planned >
  // deprecated > installing > error > install-state. The table in
  // docs/superpowers/specs/2026-04-22-marketplace-integration-polish-design.md §6
  // is the source of truth.
  type ActionState =
    | { kind: 'blocked'; label: string; tooltip: string }
    | { kind: 'planned' }
    | { kind: 'deprecated' }
    | { kind: 'install-error' }
    | { kind: 'not-installed' }
    | { kind: 'needs-auth' }
    | { kind: 'connected' };

  const actionState: ActionState = (() => {
    if (platformBlocked && platformBlockedName) {
      return {
        kind: 'blocked',
        label: `${platformBlockedName} Only`,
        tooltip: `Only available on ${platformBlockedName}`,
      };
    }
    if (item.status === 'planned') return { kind: 'planned' };
    if (item.status === 'deprecated') return { kind: 'deprecated' };
    if (!item.state.installed && item.state.error) return { kind: 'install-error' };
    if (!item.state.installed) return { kind: 'not-installed' };
    if (item.state.installed && !item.state.connected) return { kind: 'needs-auth' };
    return { kind: 'connected' };
  })();
```

- [ ] **Step 10.4: Rewrite the overlay JSX body**

Replace the entire `<article>…</article>` block (currently around lines 510-546) with the new structure. Locate the `<div className="flex-1 overflow-y-auto p-6">` opening and replace the entire child article:

```tsx
          <article className="flex flex-col gap-4 max-w-3xl mx-auto">
            <header className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4 min-w-0 flex-1">
                {/* Custom integration icon, falls back to the displayName letter. */}
                <div
                  className="w-16 h-16 rounded-lg shrink-0 overflow-hidden bg-inset flex items-center justify-center text-on-accent text-2xl font-semibold"
                  style={iconUrl ? undefined : { background: item.accentColor || 'var(--accent)' }}
                >
                  {iconUrl ? (
                    <img src={iconUrl} alt="" className="w-full h-full object-contain" />
                  ) : (
                    item.displayName.slice(0, 1)
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl font-semibold text-fg">{item.displayName}</h1>
                  {item.tagline && <p className="mt-1 text-fg-2">{item.tagline}</p>}
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border ${toneClass[statusBadge.tone]}`}>
                      {statusBadge.text}
                    </span>
                    {item.state.error && (
                      <span className="text-xs text-red-400 truncate max-w-[40ch]" title={item.state.error}>{item.state.error}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <IntegrationActions
                  state={actionState}
                  onInstall={onInstall}
                  onConnect={onConnect}
                  onUninstall={onUninstall}
                />
              </div>
            </header>

            <IntegrationMetadataChips entry={item} />

            {item.longDescription ? (
              <section>
                <h2 className="text-sm uppercase tracking-wide text-fg-dim mb-2">About</h2>
                <div className="prose prose-sm max-w-none text-fg-2 whitespace-pre-wrap">
                  {item.longDescription}
                </div>
              </section>
            ) : null}

            <IntegrationSetupDetails entry={item} />
          </article>
```

- [ ] **Step 10.5: Add the `IntegrationActions` subcomponent**

Below the `IntegrationDetailOverlay` function (before the existing `// Lightweight detail overlay…` comment block ends, or at end of file), add:

```tsx
// Renders the contextual action buttons in the detail header. One component
// per ActionState case keeps the overlay JSX clean.
function IntegrationActions({
  state, onInstall, onConnect, onUninstall,
}: {
  state:
    | { kind: 'blocked'; label: string; tooltip: string }
    | { kind: 'planned' }
    | { kind: 'deprecated' }
    | { kind: 'install-error' }
    | { kind: 'not-installed' }
    | { kind: 'needs-auth' }
    | { kind: 'connected' };
  onInstall(): void | Promise<void>;
  onConnect(): void | Promise<void>;
  onUninstall(): void | Promise<void>;
}) {
  // Shared styles — mirrors MarketplaceDetailOverlay's primary + uninstall classes.
  const primaryCls = 'px-4 py-2 rounded-md bg-accent text-on-accent hover:opacity-90';
  const uninstallCls = 'px-4 py-2 rounded-md bg-inset text-fg border border-edge hover:border-edge-dim';
  const disabledCls = 'px-4 py-2 rounded-md bg-inset text-fg-dim border border-edge-dim cursor-not-allowed opacity-60';

  if (state.kind === 'blocked') {
    return (
      <button type="button" disabled title={state.tooltip} className={disabledCls}>
        {state.label}
      </button>
    );
  }
  if (state.kind === 'planned') {
    return <button type="button" disabled className={disabledCls}>Coming soon</button>;
  }
  if (state.kind === 'deprecated') {
    return <button type="button" disabled className={disabledCls}>Deprecated</button>;
  }
  if (state.kind === 'install-error') {
    return (
      <button type="button" onClick={() => { void onInstall(); }} className={primaryCls}>
        Retry Install
      </button>
    );
  }
  if (state.kind === 'not-installed') {
    return (
      <button type="button" onClick={() => { void onInstall(); }} className={primaryCls}>
        Install
      </button>
    );
  }
  if (state.kind === 'needs-auth') {
    return (
      <>
        <button type="button" onClick={() => { void onConnect(); }} className={primaryCls}>
          Connect
        </button>
        <button type="button" disabled title="Coming soon" className={disabledCls}>
          Settings (Coming soon…)
        </button>
        <button type="button" onClick={() => { void onUninstall(); }} className={uninstallCls}>
          Uninstall
        </button>
      </>
    );
  }
  // connected
  return (
    <>
      <button type="button" disabled title="Coming soon" className={disabledCls}>
        Settings (Coming soon…)
      </button>
      <button type="button" onClick={() => { void onUninstall(); }} className={uninstallCls}>
        Uninstall
      </button>
    </>
  );
}
```

- [ ] **Step 10.6: Add the `IntegrationMetadataChips` subcomponent**

Below `IntegrationActions`, add:

```tsx
// Mirror of MarketplaceDetailOverlay's MetadataChips — pulls the tags +
// lifeArea from the IntegrationEntry. Intentionally duplicated (not imported)
// because the plugin MetadataChips takes a SkillEntry shape.
function IntegrationMetadataChips({ entry }: { entry: IntegrationCardItem }) {
  const tags = entry.tags || [];
  const lifeAreas = entry.lifeArea || [];
  if (!tags.length && !lifeAreas.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {tags.map((t) => (
        <span key={`tag-${t}`} className="text-xs px-2 py-0.5 rounded-full bg-inset text-fg-2 border border-edge-dim">
          #{t}
        </span>
      ))}
      {lifeAreas.map((a) => (
        <span key={`area-${a}`} className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-fg border border-accent/30 capitalize">
          {a}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 10.7: Add the `IntegrationSetupDetails` subcomponent**

Below `IntegrationMetadataChips`, add:

```tsx
// Small bulleted block describing setup — derived from setup.type /
// requiresOAuth / postInstallCommand / platforms. No new registry fields.
function IntegrationSetupDetails({ entry }: { entry: IntegrationCardItem }) {
  const bullets: string[] = [];
  if (entry.setup.type === 'api-key' && entry.setup.keyName) {
    bullets.push(`Requires a \`${entry.setup.keyName}\` API key`);
  }
  if (entry.setup.requiresOAuth) {
    const provider = entry.setup.oauthProvider ? entry.setup.oauthProvider : 'OAuth';
    bullets.push(`Signs in via ${provider}`);
  }
  if (entry.platforms && entry.platforms.length > 0) {
    bullets.push(`Available on ${platformListDisplay(entry.platforms)}`);
  }
  if (entry.setup.postInstallCommand) {
    bullets.push(`After install, runs \`${entry.setup.postInstallCommand}\``);
  }

  if (bullets.length === 0) return null;

  return (
    <section>
      <h2 className="text-sm uppercase tracking-wide text-fg-dim mb-2">Setup</h2>
      <ul className="list-disc pl-5 text-sm text-fg-2 space-y-1">
        {bullets.map((b) => (
          <li key={b}>
            {/* Render inline-code segments inside backticks as <code>. */}
            {b.split(/(`[^`]+`)/g).map((chunk, i) =>
              chunk.startsWith('`') && chunk.endsWith('`')
                ? <code key={i} className="px-1 py-0.5 rounded bg-inset text-fg-2 text-xs">{chunk.slice(1, -1)}</code>
                : <span key={i}>{chunk}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 10.8: Import `platformListDisplay` inside the file**

If not already imported from Task 9, add to the top of `MarketplaceScreen.tsx`:

```ts
import { platformDisplayName, platformListDisplay } from '../../../shared/platform-display';
```

(Replace the single-import line from Task 9 with both helpers.)

- [ ] **Step 10.9: Verify typecheck**

Run: `cd desktop && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 10.10: Commit**

```bash
git add desktop/src/renderer/components/marketplace/MarketplaceScreen.tsx
git commit -m "feat(integrations): rewrite detail overlay for plugin parity + action state machine"
```

---

### Task 11: Wire the new buttons (Install / Connect / Uninstall) and platform-block props

Replace the single `handleIntegration` entry point with three discrete handlers. Pass the new `platformBlocked` props to the overlay.

**Files:**
- Modify: `desktop/src/renderer/components/marketplace/MarketplaceScreen.tsx:108-141, :431-442`

- [ ] **Step 11.1: Replace `handleIntegration` with three handlers**

Delete the existing `handleIntegration` function (around line 108-141) and replace with:

```ts
  // Spawn a new Sonnet session and pipe the post-install setup command into
  // it. Shared by both install and connect flows. The fixed 3s delay
  // matches the legacy implementation — Claude Code buffers stdin, so the
  // value isn't load-bearing, just pragmatic.
  const runPostInstallCommand = async (displayName: string, command: string) => {
    const info = await (window as any).claude.session.create({
      name: `Set up ${displayName}`,
      cwd: '',
      skipPermissions: false,
      model: 'claude-sonnet-4-6',
    });
    if (info?.id) {
      setTimeout(() => {
        try {
          (window as any).claude.session.sendInput(info.id, command + '\r');
        } catch { /* user can type the command themselves */ }
      }, 3000);
      onExit();
    }
  };

  const installIntegration = async (item: IntegrationCardItem) => {
    if (item.status !== 'available') return;
    const result = await (window as any).claude.integrations.install(item.slug);
    if (result?.postInstallCommand) {
      await runPostInstallCommand(item.displayName, result.postInstallCommand);
    }
    await refreshIntegrations();
  };

  const connectIntegration = async (item: IntegrationCardItem) => {
    const result = await (window as any).claude.integrations.connect(item.slug);
    if (result?.postInstallCommand) {
      await runPostInstallCommand(item.displayName, result.postInstallCommand);
    }
    await refreshIntegrations();
  };

  const uninstallIntegration = async (item: IntegrationCardItem) => {
    await (window as any).claude.integrations.uninstall(item.slug);
    await refreshIntegrations();
  };
```

- [ ] **Step 11.2: Rewire the overlay callsite**

Replace the existing `<IntegrationDetailOverlay …>` call (around line 431-442) with:

```tsx
      {integrationDetail && (() => {
        const blocked = !!(currentPlatform && integrationDetail.platforms && integrationDetail.platforms.length > 0 && !integrationDetail.platforms.includes(currentPlatform as any));
        const blockedName = blocked && integrationDetail.platforms ? platformDisplayName(integrationDetail.platforms[0]) : null;
        return (
          <IntegrationDetailOverlay
            item={integrationDetail}
            onClose={() => setIntegrationDetail(null)}
            onInstall={async () => {
              await installIntegration(integrationDetail);
              setIntegrationDetail(null);
            }}
            onConnect={async () => {
              await connectIntegration(integrationDetail);
              setIntegrationDetail(null);
            }}
            onUninstall={async () => {
              await uninstallIntegration(integrationDetail);
              setIntegrationDetail(null);
            }}
            statusBadge={integrationStatusBadge(integrationDetail)}
            iconUrl={integrationDetail.iconUrl ? `${INTEGRATION_ICON_BASE}/${integrationDetail.iconUrl}` : undefined}
            platformBlocked={blocked}
            platformBlockedName={blockedName}
          />
        );
      })()}
```

- [ ] **Step 11.3: Verify typecheck**

Run: `cd desktop && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 11.4: Run all tests**

Run: `cd desktop && npm test`
Expected: all tests pass (including the new platform-display and integration-installer-connect suites).

- [ ] **Step 11.5: Commit**

```bash
git add desktop/src/renderer/components/marketplace/MarketplaceScreen.tsx
git commit -m "feat(integrations): split handleIntegration into Install/Connect/Uninstall; pass platform-block props"
```

---

### Task 12: Manual verification + Android build + finalize

- [ ] **Step 12.1: Run desktop dev build and eyeball each state**

Run: `bash scripts/run-dev.sh` from the workspace root.

In the dev build, open the Marketplace screen. For each integration, verify:

| Integration | Platform | Expected badge on card | Expected buttons in detail |
|---|---|---|---|
| Apple Services (if on Windows) | win32 | "macOS Only" (locked tone) | "macOS Only" disabled with tooltip |
| Apple Services (if on macOS) | darwin | "Not installed" or actual state | "Install" |
| Google Services | any | actual state | Install / Connect+Settings+Uninstall per state |
| Todoist | any | actual state | state-appropriate buttons |
| Windows Control (if on macOS) | darwin | "Windows Only" (locked tone) | "Windows Only" disabled |
| AppleScript (planned) | any | "Coming soon" | "Coming soon" disabled |

In addition, in the detail overlay:
- **Tags pills** (e.g., #email, #calendar, #drive, #docs, #oauth for Google Services) render in a chip row.
- **Life-area pills** render next to tags with accent-colored capitalize styling.
- **About section** renders `longDescription` with an uppercase "About" header.
- **Setup section** renders bullets derived from `setup.type`/`requiresOAuth`/`platforms`/`postInstallCommand`.

- [ ] **Step 12.2: Rebuild Android WebView bundle and verify**

Only if Android sanity check is possible in this environment. Otherwise skip to 12.3.

Run: `cd /c/Users/desti/youcoded-dev/youcoded-worktrees/marketplace-integration-polish && ./scripts/build-web-ui.sh`
Expected: success (copies desktop/dist/renderer/ into app/src/main/assets/web/).

Then (on a box that can build Android): `./gradlew assembleDebug` and smoke-test the marketplace screen renders without crashing. If `getPlatform` fires an error on Android, verify the Kotlin handler added in Step 4.5 is wired.

- [ ] **Step 12.3: Push the wecoded-marketplace commit**

```bash
cd /c/Users/desti/youcoded-dev/wecoded-marketplace
git push origin master
```

**Caveat:** Desktop app caches the integrations registry for 24h at `~/.claude/youcoded-marketplace-cache/`. The new `tags` fields may not appear in the dev build until the cache expires OR until you invalidate it. To bust: `rm ~/.claude/youcoded-marketplace-cache/integrations.json` before re-running the dev build.

- [ ] **Step 12.4: Merge and push the youcoded worktree**

From the worktree:

```bash
cd /c/Users/desti/youcoded-dev/youcoded-worktrees/marketplace-integration-polish
# Confirm branch is up to date with all task commits:
git log --oneline master..HEAD
# Switch to youcoded master and merge:
cd /c/Users/desti/youcoded-dev/youcoded
git fetch origin
git pull origin master
git merge --no-ff marketplace-integration-polish -m "merge: marketplace integration polish — platform badges, plugin-parity detail, Settings placeholder"
git push origin master
```

- [ ] **Step 12.5: Clean up worktree**

```bash
cd /c/Users/desti/youcoded-dev/youcoded
git worktree remove ../youcoded-worktrees/marketplace-integration-polish
git branch -D marketplace-integration-polish
```

Verify the merge commit landed on master:
```bash
git log --oneline -5 master
```

---

## Self-Review

**Spec coverage check (§ = spec section):**
- § 1 (Shared platform-display helper) → Task 1 ✓
- § 2 (Renderer platform detection IPC) → Task 4 ✓
- § 3 (Registry `tags` field) → Task 7 ✓
- § 4 (Card platform badge) → Tasks 8 + 9 ✓
- § 5 (Detail overlay rebuild) → Task 10 ✓
- § 6 (Action button state machine + Connect action) → Tasks 3 (backend) + 5 (IPC) + 10 (UI) + 11 (wiring) ✓
- § 7 (User-facing copy cleanup) → Task 2 ✓
- Renderer platform hook → Task 6 ✓
- Manual verification → Task 12 ✓

**Placeholder scan:** No "TBD" / "TODO" / "similar to" / "add appropriate error handling" found. Every code step shows the actual code. Every run step states the expected outcome.

**Type consistency:**
- `IntegrationCardItem` type name used throughout — unchanged from existing codebase.
- `ActionState` discriminated union defined in Task 10 Step 10.3 and used in Task 10 Step 10.5 — matches.
- `IntegrationInstallResult` extends `IntegrationState` with optional `postInstallCommand` — unchanged from existing code, new `connect()` reuses the shape.
- Tone union `'ok' | 'warn' | 'err' | 'neutral' | 'locked'` added consistently in Tasks 8, 9, 10.

**Scope:** One coherent change — marketplace integration UX. Under 12 tasks, single worktree. Not over-scoped.
