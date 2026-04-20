# Marketplace Install Indicators & Favorites — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-04-20-marketplace-install-indicators-and-favorites-design.md`

**Goal:** Add (a) a visible "installing" indicator surface that persists after the detail overlay closes, (b) a unified local pin/favorite concept that applies to both skills and themes and drives the Appearance panel (themes) and Command Drawer (skills).

**Architecture:** Extend `SkillConfigStore` with a `themeFavorites` string-array, mirror the existing skill-favorite IPC channels for themes, extend `MarketplaceContext` with a renderer-only `installingIds: Set<string>` and `installError: Map`, restructure the Appearance panel / Library / Command Drawer to read from favorites, and introduce two small reusable UI primitives (`<FavoriteStar>`, `<InstallingPill>`) used across every card surface.

**Tech Stack:** TypeScript, React, Vitest, Electron IPC (JSON passthrough), Kotlin (Android bridge parity). No new dependencies.

**Out of scope:** IPC-level install progress events (install-indicator stays renderer-local). `LikeButton` (server-synced public count) is left untouched — it's orthogonal to the local favorite concept. Android NATIVE UI surfaces — favorites/install UI ride on the shared React bundle, so Android parity is handled via bridge message types only.

**Worktree setup:** Execute in a dedicated worktree per workspace convention:
```bash
cd /c/Users/desti/youcoded-dev/youcoded
git fetch origin && git pull origin master
git worktree add ../../youcoded-worktrees/install-indicators-and-favorites -b feat/install-indicators-and-favorites
cd ../../youcoded-worktrees/install-indicators-and-favorites
```

---

## File Map

**Modify:**
- `youcoded/desktop/src/shared/types.ts` — extend `UserSkillConfig` with `themeFavorites?: string[]`
- `youcoded/desktop/src/main/skill-config-store.ts` — add `getThemeFavorites()` / `setThemeFavorite()` + seed logic; extend `removePackage()` to prune from `themeFavorites`
- `youcoded/desktop/src/main/ipc-handlers.ts` — add `appearance:favorite-theme` and `appearance:get-favorite-themes` handlers
- `youcoded/desktop/src/main/preload.ts` — expose `window.claude.appearance.favoriteTheme()` / `getFavoriteThemes()`
- `youcoded/desktop/src/renderer/remote-shim.ts` — mirror shape on Android/remote path
- `youcoded/app/src/main/java/.../runtime/SessionService.kt` — add `when` cases in `handleBridgeMessage()` for the two new message types
- `youcoded/desktop/src/renderer/state/marketplace-context.tsx` — add `installingIds`, `installError`; wrap install/uninstall/update; add `themeFavorites`, `favoriteTheme()`, auto-favorite-on-install
- `youcoded/desktop/src/renderer/state/theme-context.tsx` — seed four built-ins into `themeFavorites` on first run; listen for broadcast; expose `themeFavoriteSet`
- `youcoded/desktop/src/renderer/state/skill-context.tsx` — simplify `drawerSkills` computation to return all installed (favorites no longer gate visibility); callers will do their own sort
- `youcoded/desktop/src/renderer/components/marketplace/MarketplaceCard.tsx` — inline `<InstallingPill>` when key is installing; inline `<FavoriteStar>` for installed cards
- `youcoded/desktop/src/renderer/components/marketplace/MarketplaceDetailOverlay.tsx` — button state machine (install / installing / uninstall / apply / active), theme star parity with skills, Apply flow
- `youcoded/desktop/src/renderer/components/marketplace/MarketplaceScreen.tsx` — render `<InstallingFooterStrip>` when `installingIds.size > 0`
- `youcoded/desktop/src/renderer/components/ThemeScreen.tsx` — filter grid to favorites, add star control on cards, add "Browse all themes" button
- `youcoded/desktop/src/renderer/components/library/LibraryScreen.tsx` — tabs (Skills · Themes · Updates), two-section layout per tab, context-aware default tab via new `initialTab` prop
- `youcoded/desktop/src/renderer/components/CommandDrawer.tsx` — source all-installed; add sticky filter chip row; render two flat sections (Favorites / All)

**Create:**
- `youcoded/desktop/src/renderer/components/marketplace/FavoriteStar.tsx` — shared star-toggle component used by every card and the detail overlay
- `youcoded/desktop/src/renderer/components/marketplace/InstallingPill.tsx` — shared pulsing pill shown while a skill/theme is in-flight
- `youcoded/desktop/src/renderer/components/marketplace/InstallingFooterStrip.tsx` — bottom-docked strip listing in-flight installs
- `youcoded/desktop/tests/skill-config-store-theme-favorites.test.ts` — storage round-trip + seeding

**No changes:**
- `LikeButton.tsx` — public-count semantics unchanged
- `marketplace-stats-context.tsx` — unrelated
- Theme registry file format — no manifest changes

---

## Naming Decisions (lock these in)

- Config key: `themeFavorites: string[]` (camelCase, parallel to `favorites`)
- IPC message types: `appearance:favorite-theme`, `appearance:get-favorite-themes`
- Context derived state: `themeFavoriteSet: Set<string>` (parallel to existing `favorites: string[]` on MarketplaceContext)
- Renderer-only state: `installingIds: Set<string>` with keys `skill:<id>` or `theme:<slug>` (colon separator matches the existing `theme:<slug>` key in the packages map)
- Error state: `installError: Map<string, { message: string; at: number }>` — keys identical to `installingIds`
- localStorage seed guard: `youcoded-seeded-theme-favorites` (parallel to existing `youcoded-seeded-favorites`)
- Built-in theme slugs to seed: `['light', 'dark', 'midnight', 'creme']` (verified against `theme-context.tsx:14-24`)

---

## Phase 1 — Storage + IPC

### Task 1.1: Extend UserSkillConfig type and SkillConfigStore

**Files:**
- Modify: `youcoded/desktop/src/shared/types.ts`
- Modify: `youcoded/desktop/src/main/skill-config-store.ts`
- Test: `youcoded/desktop/tests/skill-config-store-theme-favorites.test.ts` (create)

- [ ] **Step 1: Extend UserSkillConfig type**

In `youcoded/desktop/src/shared/types.ts`, find the `UserSkillConfig` interface and add:

```ts
export interface UserSkillConfig {
  version: number;
  favorites: string[];
  /** Slugs of themes the user has pinned as favorites. Drives the Appearance
   *  panel (favorites-only) and the "My favorite themes" section in Library.
   *  Seeded with the four built-ins on first run; see SkillConfigStore.load(). */
  themeFavorites?: string[];
  chips: ChipConfig[];
  // ...existing fields unchanged
}
```

- [ ] **Step 2: Write failing test**

Create `youcoded/desktop/tests/skill-config-store-theme-favorites.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Isolate the store's config path per test via a temp HOME override.
let originalHome: string | undefined;
let tmpHome: string;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'youcoded-skill-config-'));
  originalHome = process.env.HOME;
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;  // Windows homedir backing
  vi.resetModules();  // Ensure CONFIG_PATH is re-evaluated under the new HOME
});

afterEach(() => {
  if (originalHome) process.env.HOME = originalHome;
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe('SkillConfigStore theme favorites', () => {
  it('seeds the four built-in theme slugs on first read when missing', async () => {
    const { SkillConfigStore } = await import('../src/main/skill-config-store');
    const store = new SkillConfigStore();
    const favs = store.getThemeFavorites();
    expect(favs.sort()).toEqual(['creme', 'dark', 'light', 'midnight']);
  });

  it('persists setThemeFavorite across reload', async () => {
    const { SkillConfigStore } = await import('../src/main/skill-config-store');
    const store = new SkillConfigStore();
    store.getThemeFavorites();  // trigger seed
    store.setThemeFavorite('solarized', true);
    store.setThemeFavorite('light', false);

    const store2 = new SkillConfigStore();
    const favs = store2.getThemeFavorites();
    expect(favs).toContain('solarized');
    expect(favs).not.toContain('light');
  });

  it('is idempotent when setting a favorite that already exists', async () => {
    const { SkillConfigStore } = await import('../src/main/skill-config-store');
    const store = new SkillConfigStore();
    store.setThemeFavorite('dark', true);
    store.setThemeFavorite('dark', true);
    const favs = store.getThemeFavorites();
    expect(favs.filter(s => s === 'dark')).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd youcoded/desktop && npx vitest run tests/skill-config-store-theme-favorites.test.ts
```

Expected: FAIL — `getThemeFavorites` / `setThemeFavorite` do not exist.

- [ ] **Step 4: Add methods to SkillConfigStore**

In `youcoded/desktop/src/main/skill-config-store.ts`, add this constant near the top (below `DEFAULT_CHIPS`):

```ts
// Four built-in theme slugs, seeded as favorites on first-read so a new user
// sees a populated Appearance panel. Mirrors the skill-favorites seeding in
// createDefaultConfig. Must stay in sync with BUILTIN_THEMES in theme-context.tsx.
const DEFAULT_THEME_FAVORITES = ['light', 'dark', 'midnight', 'creme'];
```

Below `setFavorite(...)` (around line 123), add:

```ts
  getThemeFavorites(): string[] {
    const config = this.load();
    // Lazy seed on first access. Config written back in the same call so the
    // seed survives even if the caller never mutates. We only seed when the
    // key is missing — an empty array is a legitimate user state (they
    // unstarred everything) and must be preserved.
    if (config.themeFavorites === undefined) {
      config.themeFavorites = [...DEFAULT_THEME_FAVORITES];
      this.save();
    }
    return config.themeFavorites;
  }

  setThemeFavorite(slug: string, favorited: boolean): void {
    const config = this.load();
    const current = config.themeFavorites ?? [...DEFAULT_THEME_FAVORITES];
    const set = new Set(current);
    if (favorited) set.add(slug); else set.delete(slug);
    config.themeFavorites = [...set];
    this.save();
  }
```

Also extend `removePackage()` (around line 224) to prune a theme from `themeFavorites` when its theme-prefixed package is removed. Replace the existing method with:

```ts
  removePackage(id: string): void {
    const config = this.load();
    if (config.packages) {
      delete config.packages[id];
    }
    // Cascade cleanup — remove from favorites, chips, overrides
    config.favorites = config.favorites.filter(f => f !== id);
    config.chips = config.chips.filter(c => c.skillId !== id);
    delete config.overrides[id];
    // Theme packages use the "theme:<slug>" key. When uninstalled, also remove
    // the slug from themeFavorites so the Appearance panel doesn't keep a
    // reference to a gone theme.
    if (id.startsWith('theme:') && config.themeFavorites) {
      const slug = id.slice('theme:'.length);
      config.themeFavorites = config.themeFavorites.filter(s => s !== slug);
    }
    this.save();
  }
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd youcoded/desktop && npx vitest run tests/skill-config-store-theme-favorites.test.ts
```

Expected: PASS (all three tests).

- [ ] **Step 6: Commit**

```bash
git add youcoded/desktop/src/shared/types.ts youcoded/desktop/src/main/skill-config-store.ts youcoded/desktop/tests/skill-config-store-theme-favorites.test.ts
git commit -m "feat(storage): theme favorites in youcoded-skills.json with seed"
```

### Task 1.2: Add IPC handlers

**Files:**
- Modify: `youcoded/desktop/src/main/ipc-handlers.ts`
- Modify: `youcoded/desktop/src/main/preload.ts`

- [ ] **Step 1: Find the existing favorite IPC handler pattern**

```bash
grep -n "setFavorite\|getFavorites\|IPC.SKILLS_SET_FAVORITE\|skills:set-favorite\|skills:get-favorites" /c/Users/desti/youcoded-dev/youcoded/desktop/src/main/ipc-handlers.ts
```

Read 10 lines of context around each hit — the new handlers should mirror that pattern exactly (wrapping `skillConfigStore.setThemeFavorite(...)` / `.getThemeFavorites()`).

- [ ] **Step 2: Add the two new IPC handlers**

In `ipc-handlers.ts`, directly below the existing `skills:set-favorite` handler, add:

```ts
  // Theme favorites — parallel to skills:set-favorite. Drives the Appearance
  // panel's favorites-only list and the "My favorite themes" Library section.
  ipcMain.handle('appearance:get-favorite-themes', async () => {
    return skillConfigStore.getThemeFavorites();
  });

  ipcMain.handle('appearance:favorite-theme', async (_event, slug: string, favorited: boolean) => {
    skillConfigStore.setThemeFavorite(slug, favorited);
    // Broadcast to peer windows so ThemeContext re-reads without requiring a
    // polled IPC fetch. Reuses the existing appearance broadcast pipe.
    try {
      const prefs = { themeFavoritesChanged: Date.now() };
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('appearance:sync', prefs);
      }
    } catch { /* best-effort broadcast */ }
    return skillConfigStore.getThemeFavorites();
  });
```

If `BrowserWindow` is not already imported at the top of the file, add `import { BrowserWindow, ipcMain } from 'electron';` (keep any existing named imports).

- [ ] **Step 3: Expose on preload**

In `youcoded/desktop/src/main/preload.ts`, find the existing `appearance` namespace object and add two methods to it:

```ts
    appearance: {
      // ...existing methods unchanged
      favoriteTheme: (slug: string, favorited: boolean) =>
        ipcRenderer.invoke('appearance:favorite-theme', slug, favorited),
      getFavoriteThemes: () =>
        ipcRenderer.invoke('appearance:get-favorite-themes'),
    },
```

Do NOT remove the existing `appearance.set`, `.get`, `.broadcast`, `.onSync` methods — just add alongside.

- [ ] **Step 4: Typecheck**

```bash
cd youcoded/desktop && npx tsc --noEmit 2>&1 | head -40
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add youcoded/desktop/src/main/ipc-handlers.ts youcoded/desktop/src/main/preload.ts
git commit -m "feat(ipc): appearance:favorite-theme + appearance:get-favorite-themes"
```

### Task 1.3: Mirror on remote-shim (Android/remote path)

**Files:**
- Modify: `youcoded/desktop/src/renderer/remote-shim.ts`

- [ ] **Step 1: Find the existing appearance shim**

```bash
grep -n "appearance\.set\|appearance\.get\|favoriteTheme\|getFavoriteThemes" /c/Users/desti/youcoded-dev/youcoded/desktop/src/renderer/remote-shim.ts
```

- [ ] **Step 2: Add the two new methods to the shim**

In `remote-shim.ts`, find the `appearance` object on the shared `window.claude` shape and add:

```ts
    appearance: {
      // ...existing methods unchanged
      favoriteTheme: (slug: string, favorited: boolean) =>
        invoke<string[]>('appearance:favorite-theme', { slug, favorited }),
      getFavoriteThemes: () =>
        invoke<string[]>('appearance:get-favorite-themes', {}),
    },
```

(Adapt to whatever the actual `invoke` helper signature is — read the existing `appearance.set` implementation for the correct parameter shape.)

- [ ] **Step 3: Typecheck**

```bash
cd youcoded/desktop && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add youcoded/desktop/src/renderer/remote-shim.ts
git commit -m "feat(ipc): remote-shim parity for theme favorites"
```

### Task 1.4: Android parity — SessionService bridge cases

**Files:**
- Modify: `youcoded/app/src/main/java/.../runtime/SessionService.kt` (find exact path via grep)
- Modify: `youcoded/app/src/main/java/.../runtime/SkillConfigStore.kt` (if a Kotlin-side store exists — otherwise plumb directly to the JSON file via the same path)

- [ ] **Step 1: Locate the existing skills:set-favorite handler**

```bash
grep -rn "skills:set-favorite\|skills:get-favorites" /c/Users/desti/youcoded-dev/youcoded/app/src/main/
```

Read 30 lines of context. The bridge message handlers are a `when` expression inside `handleBridgeMessage()`. Existing favorites likely read/write `~/.claude/youcoded-skills.json` directly via a Kotlin helper; mirror that same file-access pattern.

- [ ] **Step 2: Add appearance:get-favorite-themes case**

In `handleBridgeMessage()`, add below the existing `skills:get-favorites`:

```kotlin
"appearance:get-favorite-themes" -> {
    val favorites = skillConfigStore.getThemeFavorites()
    bridgeServer.respond(ws, msg.type, msg.id, JSONArray(favorites))
}
```

- [ ] **Step 3: Add appearance:favorite-theme case**

```kotlin
"appearance:favorite-theme" -> {
    val slug = msg.payload.optString("slug")
    val favorited = msg.payload.optBoolean("favorited")
    skillConfigStore.setThemeFavorite(slug, favorited)
    bridgeServer.respond(ws, msg.type, msg.id, JSONArray(skillConfigStore.getThemeFavorites()))
}
```

- [ ] **Step 4: Add Kotlin helpers to SkillConfigStore.kt**

If a Kotlin-side `SkillConfigStore.kt` exists, mirror the Node methods. Seed with `listOf("light","dark","midnight","creme")` when `themeFavorites` key is missing, parallel to the Node seed logic. Persist changes via the same JSON read/modify/atomic-write pattern as `setFavorite`.

If no Kotlin store exists, inline the three operations directly in the `when` case: read `~/.claude/youcoded-skills.json`, mutate, write. Reuse the helpers used by the `skills:set-favorite` case.

- [ ] **Step 5: Build Android**

```bash
cd youcoded && ./scripts/build-web-ui.sh && ./gradlew assembleDebug
```

Expected: successful build. (Full smoke test happens in Task 13.)

- [ ] **Step 6: Commit**

```bash
git add youcoded/app/src/main/
git commit -m "feat(android): bridge parity for theme favorites"
```

---

## Phase 2 — Renderer state

### Task 2.1: Extend MarketplaceContext with install-tracking + theme favorites

**Files:**
- Modify: `youcoded/desktop/src/renderer/state/marketplace-context.tsx`

- [ ] **Step 1: Add new state fields**

In the provider function body (around line 114–121), add below `favorites`:

```tsx
  const [themeFavorites, setThemeFavoritesState] = useState<string[]>([]);
  const [installingIds, setInstallingIds] = useState<Set<string>>(() => new Set());
  const [installError, setInstallError] = useState<Map<string, { message: string; at: number }>>(() => new Map());
```

- [ ] **Step 2: Extend fetchAll to load theme favorites**

Inside `fetchAll`, in the `Promise.all(...)` block (around line 145), add `claude().appearance.getFavoriteThemes().catch(() => [])` as a new element. Destructure it alongside `favs`:

```ts
      const [
        marketplaceSkills,
        themes,
        installed,
        favs,
        themeFavs,
        pkgs,
        feat,
      ] = await Promise.all([
        window.claude.skills.listMarketplace(),
        claude().theme.marketplace.list().catch(() => []),
        window.claude.skills.list(),
        window.claude.skills.getFavorites(),
        claude().appearance.getFavoriteThemes().catch(() => []),
        marketplaceApi?.getPackages?.().catch(() => ({})) ?? Promise.resolve({}),
        featuredCall,
      ]);
```

After the existing `setFavoritesState(favs || []);` line, add:

```ts
      setThemeFavoritesState(themeFavs || []);
```

- [ ] **Step 3: Add installingIds helpers + wrap each install/update method**

Add helpers above the install methods (around line 184):

```tsx
  // Renderer-only install-tracking. Keys: `skill:<id>` | `theme:<slug>`.
  // Cleared in `finally` AFTER `fetchAll()` resolves — clearing before would
  // briefly flash Install → Installed because installed-state derivation
  // hasn't caught up.
  const markInstalling = useCallback((key: string) => {
    setInstallingIds(prev => { const n = new Set(prev); n.add(key); return n; });
  }, []);
  const clearInstalling = useCallback((key: string) => {
    setInstallingIds(prev => { const n = new Set(prev); n.delete(key); return n; });
  }, []);
  const recordInstallError = useCallback((key: string, message: string) => {
    setInstallError(prev => { const n = new Map(prev); n.set(key, { message, at: Date.now() }); return n; });
    // Auto-clear after 6s
    setTimeout(() => {
      setInstallError(prev => {
        const entry = prev.get(key);
        if (!entry || Date.now() - entry.at < 6000) return prev;
        const n = new Map(prev); n.delete(key); return n;
      });
    }, 6500);
  }, []);
```

Replace `installSkill` (~line 185) with:

```tsx
  const installSkill = useCallback(async (id: string) => {
    const key = `skill:${id}`;
    markInstalling(key);
    try {
      await window.claude.skills.install(id);
      try {
        const signedIn = await claude().marketplaceAuth.signedIn();
        if (signedIn) {
          const res = await claude().marketplaceApi.install(id);
          if (!res.ok) console.warn("[marketplace] install telemetry failed:", res.status, res.message);
        }
      } catch (err) {
        console.warn("[marketplace] install telemetry threw (non-fatal):", err);
      }
      // Auto-favorite on install so newly-added skills appear at the top of
      // the Command Drawer immediately. User can unstar at any time.
      try { await window.claude.skills.setFavorite(id, true); } catch {}
      await fetchAll();  // Refresh state BEFORE clearing installing flag
    } catch (err: any) {
      recordInstallError(key, err?.message || 'Install failed');
      throw err;
    } finally {
      clearInstalling(key);
    }
  }, [fetchAll, markInstalling, clearInstalling, recordInstallError]);
```

Apply the same wrapping pattern to `uninstallSkill`, `installTheme`, `uninstallTheme`, and `update`:

```tsx
  const uninstallSkill = useCallback(async (id: string) => {
    const key = `skill:${id}`;
    markInstalling(key);
    try {
      await window.claude.skills.uninstall(id);
      await fetchAll();
    } catch (err: any) {
      recordInstallError(key, err?.message || 'Uninstall failed');
      throw err;
    } finally {
      clearInstalling(key);
    }
  }, [fetchAll, markInstalling, clearInstalling, recordInstallError]);

  const installTheme = useCallback(async (slug: string) => {
    const key = `theme:${slug}`;
    markInstalling(key);
    try {
      await claude().theme.marketplace.install(slug);
      // Auto-favorite on install (mirrors skills)
      try { await claude().appearance.favoriteTheme(slug, true); } catch {}
      await fetchAll();
    } catch (err: any) {
      recordInstallError(key, err?.message || 'Install failed');
      throw err;
    } finally {
      clearInstalling(key);
    }
  }, [fetchAll, markInstalling, clearInstalling, recordInstallError]);

  const uninstallTheme = useCallback(async (slug: string) => {
    const key = `theme:${slug}`;
    markInstalling(key);
    try {
      await claude().theme.marketplace.uninstall(slug);
      await fetchAll();
    } catch (err: any) {
      recordInstallError(key, err?.message || 'Uninstall failed');
      throw err;
    } finally {
      clearInstalling(key);
    }
  }, [fetchAll, markInstalling, clearInstalling, recordInstallError]);

  const update = useCallback(async (id: string, type: 'skill' | 'theme') => {
    const key = `${type}:${id}`;
    markInstalling(key);
    try {
      const result = type === 'theme'
        ? await claude().theme.marketplace.update(id)
        : await (window as any).claude.skills.update(id);
      await fetchAll();
      return result;
    } catch (err: any) {
      recordInstallError(key, err?.message || 'Update failed');
      throw err;
    } finally {
      clearInstalling(key);
    }
  }, [fetchAll, markInstalling, clearInstalling, recordInstallError]);
```

- [ ] **Step 4: Add theme-favorite action**

After the existing `setFavorite` (~line 235), add:

```tsx
  const favoriteTheme = useCallback(async (slug: string, favorited: boolean) => {
    await claude().appearance.favoriteTheme(slug, favorited);
    // Optimistic update — broadcast from main will reconcile any drift.
    setThemeFavoritesState(prev =>
      favorited ? [...new Set([...prev, slug])] : prev.filter(s => s !== slug)
    );
  }, []);
```

- [ ] **Step 5: Extend the context interface and value**

In `MarketplaceState` (line 63), add:

```ts
  themeFavorites: string[];
  installingIds: Set<string>;
  installError: Map<string, { message: string; at: number }>;
```

In `MarketplaceActions` (line 83), add:

```ts
  favoriteTheme: (slug: string, favorited: boolean) => Promise<void>;
```

Add the four new fields to the memoized `value` object (~line 275) — spread into both the object literal and the dep array.

- [ ] **Step 6: Typecheck**

```bash
cd youcoded/desktop && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add youcoded/desktop/src/renderer/state/marketplace-context.tsx
git commit -m "feat(marketplace): install-tracking state + theme favorites + auto-favorite-on-install"
```

### Task 2.2: ThemeContext — respect theme favorites broadcast

**Files:**
- Modify: `youcoded/desktop/src/renderer/state/theme-context.tsx`

The ThemeContext does not need to fetch or own `themeFavorites` itself — MarketplaceContext (mounted when the marketplace/library/appearance panels render) is the owner. But: when a user toggles a theme star from the Appearance panel, the call goes through `MarketplaceContext.favoriteTheme`, which hits the IPC, which broadcasts via `appearance:sync`. The ThemeContext's existing `onSync` listener (lines 248–279) already handles all prefs; we don't need to touch it for the favorites broadcast. No change to this file. Skip.

- [ ] **Step 1: Verify**

```bash
grep -n "appearance:sync\|onSync" /c/Users/desti/youcoded-dev/youcoded/desktop/src/renderer/state/theme-context.tsx
```

Confirm `onSync` listens at line 248 and doesn't need extension for the favorites flow.

- [ ] **Step 2: No commit** — task is a verification check, no file changes.

### Task 2.3: Simplify drawerSkills — return all installed

**Files:**
- Modify: `youcoded/desktop/src/renderer/state/skill-context.tsx`

- [ ] **Step 1: Read the existing drawerSkills memo**

```bash
grep -n "drawerSkills\|favSet\|seeded-favorites" /c/Users/desti/youcoded-dev/youcoded/desktop/src/renderer/state/skill-context.tsx
```

Read 20 lines around each hit.

- [ ] **Step 2: Replace drawerSkills to return all installed**

Replace the existing `drawerSkills` memo (around line 136):

```ts
  // Drawer shows ALL installed skills. Sorting (favorites first) happens in
  // CommandDrawer itself so callers can apply category/search filters first.
  // The seed-favorites first-run logic still runs — it pre-populates the
  // favorites array so the drawer's Favorites section is non-empty on day 1.
  const drawerSkills = useMemo(() => installed, [installed]);
```

Keep the `favorites` state and the first-run seeding logic (lines ~62–123) unchanged — they still drive Drawer sort order and Library's Favorites section.

- [ ] **Step 3: Typecheck and run any skill-context tests**

```bash
cd youcoded/desktop && npx tsc --noEmit && npm test -- skill-context 2>&1 | head -30
```

Expected: typecheck passes; skill-context tests (if any) still pass — callers that read `drawerSkills` get a larger list but the list still contains all prior entries.

- [ ] **Step 4: Commit**

```bash
git add youcoded/desktop/src/renderer/state/skill-context.tsx
git commit -m "refactor(skill-context): drawerSkills returns all installed; sort moves to drawer"
```

---

## Phase 3 — Reusable UI primitives

### Task 3.1: FavoriteStar and InstallingPill components

**Files:**
- Create: `youcoded/desktop/src/renderer/components/marketplace/FavoriteStar.tsx`
- Create: `youcoded/desktop/src/renderer/components/marketplace/InstallingPill.tsx`

- [ ] **Step 1: Create FavoriteStar.tsx**

```tsx
// Shared star toggle used on every card (marketplace rail, marketplace grid,
// library, appearance, drawer) and in the detail overlay. Thin wrapper over a
// button — styling matches the existing IconButton treatment in
// MarketplaceDetailOverlay.tsx:125-151. Gated to installed targets; `disabled`
// renders a muted outline-only star with a tooltip explaining why.
import React from 'react';

interface Props {
  filled: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onToggle: () => void;
  size?: 'sm' | 'md';
  /** When true, the star is absolutely positioned to sit in the corner of a
   *  card. Default false for header/inline use. */
  corner?: boolean;
}

export default function FavoriteStar({
  filled, disabled = false, disabledReason, onToggle, size = 'md', corner = false,
}: Props) {
  const px = size === 'sm' ? 14 : 16;
  const positioning = corner
    ? 'absolute top-1.5 right-1.5 bg-panel/80 backdrop-blur-sm'
    : '';
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); if (!disabled) onToggle(); }}
      disabled={disabled}
      aria-label={filled ? 'Unfavorite' : 'Favorite'}
      aria-pressed={filled}
      title={disabled && disabledReason ? disabledReason : (filled ? 'Unfavorite' : 'Favorite')}
      className={`${positioning} p-1 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        filled ? 'text-accent' : 'text-fg-dim hover:text-fg'
      }`}
    >
      <svg
        width={px} height={px} viewBox="0 0 24 24"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth={filled ? 0 : 1.8}
        strokeLinejoin="round"
      >
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    </button>
  );
}
```

- [ ] **Step 2: Create InstallingPill.tsx**

```tsx
// Shared "Installing…" pill shown on cards while a skill/theme is in-flight.
// Keep footprint identical to the existing "Installed" / "Update" badge
// regions (MarketplaceCard.tsx) so layout doesn't shift when status changes.
import React from 'react';

export default function InstallingPill({ label = 'Installing…' }: { label?: string }) {
  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded-full border border-accent/50 text-accent bg-accent/10 animate-pulse"
      role="status"
      aria-live="polite"
    >
      {label}
    </span>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd youcoded/desktop && npx tsc --noEmit
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add youcoded/desktop/src/renderer/components/marketplace/FavoriteStar.tsx youcoded/desktop/src/renderer/components/marketplace/InstallingPill.tsx
git commit -m "feat(marketplace): FavoriteStar + InstallingPill primitives"
```

---

## Phase 4 — Marketplace card, detail overlay, footer strip

### Task 4.1: MarketplaceCard — star + installing pill

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/marketplace/MarketplaceCard.tsx`

- [ ] **Step 1: Read the current card layout**

```bash
grep -n "Installed\|Update\|className" /c/Users/desti/youcoded-dev/youcoded/desktop/src/renderer/components/marketplace/MarketplaceCard.tsx | head -30
```

Read lines 59–97 to understand the current card structure (stats footer at ~87–94).

- [ ] **Step 2: Import the primitives + context hooks**

At the top of `MarketplaceCard.tsx`, add:

```tsx
import FavoriteStar from './FavoriteStar';
import InstallingPill from './InstallingPill';
import { useMarketplace } from '../../state/marketplace-context';
```

- [ ] **Step 3: Compute installing key and favorite state in the component body**

Near the top of the card's component body:

```tsx
  const mp = useMarketplace();
  const kind = entry.type === 'theme' ? 'theme' : 'skill';
  const key = kind === 'theme' ? `theme:${entry.slug}` : `skill:${entry.id}`;
  const isInstalling = mp.installingIds.has(key);
  const isFavorited =
    kind === 'theme'
      ? mp.themeFavorites.includes(entry.slug)
      : mp.favorites.includes(entry.id);
  const isInstalled = !!entry.installed;

  const toggleFavorite = () => {
    if (kind === 'theme') mp.favoriteTheme(entry.slug, !isFavorited).catch(() => {});
    else mp.setFavorite(entry.id, !isFavorited).catch(() => {});
  };
```

- [ ] **Step 4: Render the star in the corner for installed cards**

Inside the card's outer `<div>` (the container that sets `position: relative` — add it if not present), add just above the first child:

```tsx
{isInstalled && (
  <FavoriteStar
    filled={isFavorited}
    onToggle={toggleFavorite}
    size="sm"
    corner
  />
)}
```

- [ ] **Step 5: Swap Installed/Update badge for InstallingPill when in flight**

Find the badge block (e.g., `{entry.updateAvailable ? <Update badge /> : entry.installed && <Installed badge />}` — exact JSX varies) and wrap:

```tsx
{isInstalling ? (
  <InstallingPill />
) : entry.updateAvailable ? (
  /* existing "Update" badge */
) : isInstalled ? (
  /* existing "Installed" badge */
) : null}
```

- [ ] **Step 6: Run the dev server, open the marketplace, click Install on a skill**

```bash
cd youcoded/desktop && npm run dev
```

Manual verification: the card shows "Installing…" pill while the install promise is open, then flips to "Installed" when done. Detail-overlay button also shows "Installing…" (that's handled in Task 4.2 next — for this task only the card behavior matters).

- [ ] **Step 7: Commit**

```bash
git add youcoded/desktop/src/renderer/components/marketplace/MarketplaceCard.tsx
git commit -m "feat(marketplace): card star + installing pill"
```

### Task 4.2: MarketplaceDetailOverlay — button state machine + Apply flow

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/marketplace/MarketplaceDetailOverlay.tsx`

- [ ] **Step 1: Wire ThemeContext for Apply action**

At the top of the file, add:

```tsx
import { useTheme } from '../../state/theme-context';
```

In the main component (`MarketplaceDetailOverlay`) body, right after `const mp = useMarketplace();`:

```tsx
  const { theme: activeThemeSlug, setTheme } = useTheme();
```

- [ ] **Step 2: Replace the SkillBody install button (lines 228-240) with a state machine**

Pass the `isInstalling` and `installError` props to SkillBody. Update the SkillBody type signature:

```tsx
function SkillBody({
  entry, installed, favorited, isInstalling, installError,
  onInstall, onUninstall, onToggleFavorite, onShare,
}: {
  entry: SkillEntry;
  installed: boolean;
  favorited: boolean;
  isInstalling: boolean;
  installError: string | null;
  onInstall(): void;
  onUninstall(): void;
  onToggleFavorite(): void;
  onShare?(): void;
}) {
```

Replace the install/uninstall button block (lines 228–240) with:

```tsx
          {isInstalling ? (
            <button
              type="button"
              disabled
              className="px-4 py-2 rounded-md bg-accent/70 text-on-accent cursor-wait flex items-center gap-2"
            >
              <span className="inline-block w-3 h-3 border-2 border-on-accent border-t-transparent rounded-full animate-spin" />
              Installing…
            </button>
          ) : installed ? (
            <button type="button" onClick={onUninstall} className="px-4 py-2 rounded-md bg-inset text-fg border border-edge hover:border-edge-dim">
              Uninstall
            </button>
          ) : (
            <button
              type="button"
              onClick={onInstall}
              className={`px-4 py-2 rounded-md bg-accent text-on-accent hover:opacity-90 ${installError ? 'ring-2 ring-red-500' : ''}`}
              title={installError || undefined}
            >
              {installError ? 'Retry Install' : 'Install'}
            </button>
          )}
```

Pass `isInstalling` and `installError` from the caller at line 60-70:

```tsx
      const installing = mp.installingIds.has(`skill:${target.id}`);
      const errEntry = mp.installError.get(`skill:${target.id}`);
      content = (
        <SkillBody
          entry={entry}
          installed={installed}
          favorited={favorited}
          isInstalling={installing}
          installError={errEntry?.message ?? null}
          onInstall={() => mp.installSkill(entry.id).catch(() => undefined)}
          onUninstall={() => mp.uninstallSkill(entry.id).catch(() => undefined)}
          onToggleFavorite={() => mp.setFavorite(entry.id, !favorited).catch(() => undefined)}
          onShare={onOpenShareSheet ? () => onOpenShareSheet(entry.id) : undefined}
        />
      );
```

- [ ] **Step 3: Replace the ThemeBody button block with the four-state machine**

Update the ThemeBody signature:

```tsx
function ThemeBody({
  entry, isInstalling, installError, isActive, favorited,
  onInstall, onUninstall, onApply, onToggleFavorite, onShare,
}: {
  entry: ThemeRegistryEntryWithStatus;
  isInstalling: boolean;
  installError: string | null;
  isActive: boolean;
  favorited: boolean;
  onInstall(): void;
  onUninstall(): void;
  onApply(): void;
  onToggleFavorite(): void;
  onShare?(): void;
}) {
```

Replace `const installed = entry.installed;` with `const installed = !!entry.installed;` (defensive). Below `<LikeButton />`, inside the icon cluster, add the new local favorite star alongside LikeButton:

```tsx
          {/* Local favorite (drives Appearance panel). Distinct from LikeButton
              which is a public count. Gated to installed. */}
          <IconButton
            title={!installed ? "Install to favorite" : favorited ? "Unfavorite" : "Favorite"}
            active={favorited}
            ariaPressed={favorited}
            onClick={installed ? onToggleFavorite : undefined}
          >
            <StarIcon filled={favorited} />
          </IconButton>
```

Replace the install/uninstall button block (lines 445–453) with:

```tsx
          {isInstalling ? (
            <button
              type="button"
              disabled
              className="px-4 py-2 rounded-md bg-accent/70 text-on-accent cursor-wait flex items-center gap-2"
            >
              <span className="inline-block w-3 h-3 border-2 border-on-accent border-t-transparent rounded-full animate-spin" />
              Installing…
            </button>
          ) : !installed ? (
            <button
              type="button"
              onClick={onInstall}
              className={`px-4 py-2 rounded-md bg-accent text-on-accent hover:opacity-90 ${installError ? 'ring-2 ring-red-500' : ''}`}
              title={installError || undefined}
            >
              {installError ? 'Retry Install' : 'Install'}
            </button>
          ) : isActive ? (
            <>
              <button type="button" disabled className="px-4 py-2 rounded-md bg-inset text-fg-dim border border-edge cursor-default">
                Active
              </button>
              <button type="button" onClick={onUninstall} className="px-3 py-2 rounded-md text-fg-dim hover:text-fg text-sm">
                Uninstall
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onApply} className="px-4 py-2 rounded-md bg-accent text-on-accent hover:opacity-90">
                Apply theme
              </button>
              <button type="button" onClick={onUninstall} className="px-3 py-2 rounded-md text-fg-dim hover:text-fg text-sm">
                Uninstall
              </button>
            </>
          )}
```

- [ ] **Step 4: Wire ThemeBody props at the caller (inside main component body)**

Replace the theme `content` block (lines 72–85) with:

```tsx
  } else {
    const entry = mp.themeEntries.find((e) => e.slug === target.slug);
    if (!entry) {
      content = <NotFound label="Theme" onClose={onClose} />;
    } else {
      const installing = mp.installingIds.has(`theme:${target.slug}`);
      const errEntry = mp.installError.get(`theme:${target.slug}`);
      const favorited = mp.themeFavorites.includes(target.slug);
      const isActive = activeThemeSlug === target.slug;
      content = (
        <ThemeBody
          entry={entry}
          isInstalling={installing}
          installError={errEntry?.message ?? null}
          isActive={isActive}
          favorited={favorited}
          onInstall={() => mp.installTheme(entry.slug).catch(() => undefined)}
          onUninstall={() => mp.uninstallTheme(entry.slug).catch(() => undefined)}
          onApply={() => setTheme(entry.slug)}
          onToggleFavorite={() => mp.favoriteTheme(entry.slug, !favorited).catch(() => undefined)}
          onShare={onOpenThemeShare ? () => onOpenThemeShare(entry.slug) : undefined}
        />
      );
    }
  }
```

- [ ] **Step 5: Typecheck + manual smoke**

```bash
cd youcoded/desktop && npx tsc --noEmit
cd youcoded/desktop && npm run dev
```

Manual: install a theme, confirm button flips Install → Installing… → Apply theme → (click Apply) → Active, with working Uninstall alongside.

- [ ] **Step 6: Commit**

```bash
git add youcoded/desktop/src/renderer/components/marketplace/MarketplaceDetailOverlay.tsx
git commit -m "feat(marketplace): detail-overlay button state machine + theme Apply flow"
```

### Task 4.3: InstallingFooterStrip and mount on MarketplaceScreen

**Files:**
- Create: `youcoded/desktop/src/renderer/components/marketplace/InstallingFooterStrip.tsx`
- Modify: `youcoded/desktop/src/renderer/components/marketplace/MarketplaceScreen.tsx`

- [ ] **Step 1: Create InstallingFooterStrip.tsx**

```tsx
// Docked footer strip that lists in-flight skill/theme installs. Visible iff
// installingIds.size > 0. Uses theme tokens (.layer-surface + accent accent)
// so no hardcoded colors. Respects safe-area-inset-bottom for Android.
import React from 'react';
import { useMarketplace } from '../../state/marketplace-context';

function labelForKey(
  key: string,
  skillEntries: { id: string; displayName?: string }[],
  themeEntries: { slug: string; name?: string }[],
): string {
  if (key.startsWith('skill:')) {
    const id = key.slice('skill:'.length);
    return skillEntries.find(s => s.id === id)?.displayName ?? id;
  }
  if (key.startsWith('theme:')) {
    const slug = key.slice('theme:'.length);
    return themeEntries.find(t => t.slug === slug)?.name ?? slug;
  }
  return key;
}

export default function InstallingFooterStrip() {
  const mp = useMarketplace();
  const keys = Array.from(mp.installingIds);
  const errorKeys = Array.from(mp.installError.keys()).filter(k => !mp.installingIds.has(k));
  if (keys.length === 0 && errorKeys.length === 0) return null;

  const inflightLabels = keys.map(k => labelForKey(k, mp.skillEntries, mp.themeEntries));

  return (
    <div
      className="layer-surface fixed left-0 right-0 bottom-0 border-t border-edge-dim px-4 py-2 flex flex-col gap-1 text-sm"
      style={{ zIndex: 60, paddingBottom: 'max(env(safe-area-inset-bottom), 0.5rem)' }}
      role="status"
      aria-live="polite"
    >
      {keys.length > 0 && (
        <div className="flex items-center gap-2 text-fg-2">
          <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span>
            Installing {keys.length > 1 ? `${keys.length}: ` : ''}
            {inflightLabels.join(', ')}
          </span>
        </div>
      )}
      {errorKeys.map(k => {
        const err = mp.installError.get(k)!;
        const label = labelForKey(k, mp.skillEntries, mp.themeEntries);
        return (
          <div key={k} className="text-xs text-red-500 border border-red-500/40 bg-red-500/10 rounded px-2 py-1">
            Failed to install {label}: {err.message}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Mount the strip in MarketplaceScreen**

In `MarketplaceScreen.tsx`, import the strip at the top:

```tsx
import InstallingFooterStrip from './InstallingFooterStrip';
```

Render it just before the closing wrapper of the screen (bottom of the return, outside the scroll container):

```tsx
      <InstallingFooterStrip />
```

- [ ] **Step 3: Typecheck + smoke**

```bash
cd youcoded/desktop && npx tsc --noEmit && npm run dev
```

Manual: install a theme, close the detail overlay mid-install, confirm the footer strip stays visible with "Installing: <theme name>".

- [ ] **Step 4: Commit**

```bash
git add youcoded/desktop/src/renderer/components/marketplace/InstallingFooterStrip.tsx youcoded/desktop/src/renderer/components/marketplace/MarketplaceScreen.tsx
git commit -m "feat(marketplace): persistent installing footer strip"
```

---

## Phase 5 — Appearance panel, Library, Command Drawer

### Task 5.1: ThemeScreen (Appearance) — favorites filter + star + Browse all

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/ThemeScreen.tsx`

- [ ] **Step 1: Read the current layout**

```bash
grep -n "allThemes\|setTheme\|pencil\|active" /c/Users/desti/youcoded-dev/youcoded/desktop/src/renderer/components/ThemeScreen.tsx | head -30
```

Read lines 66–174 to understand the current card grid.

- [ ] **Step 2: Add imports + context**

At the top:

```tsx
import { useMarketplace } from '../state/marketplace-context';
import FavoriteStar from './marketplace/FavoriteStar';
```

In the component body:

```tsx
  const mp = useMarketplace();
  const themeFavSet = useMemo(() => new Set(mp.themeFavorites), [mp.themeFavorites]);
```

- [ ] **Step 3: Filter the grid source to favorites + active theme fallback**

Replace the `allThemes` grid source:

```tsx
  // Appearance panel shows favorites only, plus the active theme as a
  // fallback so there's always at least one card even when the user has
  // unstarred their current theme. Library is the escape hatch for the
  // rest (see "Browse all themes" button below).
  const gridThemes = useMemo(() => {
    const favs = allThemes.filter(t => themeFavSet.has(t.slug));
    if (favs.some(t => t.slug === activeSlug)) return favs;
    const active = allThemes.find(t => t.slug === activeSlug);
    return active ? [...favs, active] : favs;
  }, [allThemes, themeFavSet, activeSlug]);
```

Use `gridThemes` in the `.map()` that renders the grid instead of `allThemes`.

- [ ] **Step 4: Add the star to each card**

Inside each theme card (keep the existing pencil icon), add a star to the opposite corner. Near where the pencil button is rendered (~line 147-155), add:

```tsx
<FavoriteStar
  filled={themeFavSet.has(theme.slug)}
  onToggle={() => mp.favoriteTheme(theme.slug, !themeFavSet.has(theme.slug)).catch(() => {})}
  size="sm"
  corner
/>
```

(Position-tune via `className` as needed — top-right if the pencil is top-left, or stack them.)

- [ ] **Step 5: Add "Browse all themes" button at the bottom**

Below the grid, add:

```tsx
<button
  type="button"
  onClick={() => {
    // Dispatch a global event that App.tsx listens for to open Library on
    // the themes tab and dismiss the Appearance modal.
    window.dispatchEvent(new CustomEvent('youcoded:open-library', { detail: { tab: 'themes' } }));
  }}
  className="layer-surface w-full mt-4 px-4 py-3 text-fg-2 hover:text-fg text-sm flex items-center justify-center gap-2"
>
  Browse all themes →
</button>
```

- [ ] **Step 6: Have App.tsx listen for the event**

Find App.tsx around where Library/marketplace modals are managed (grep `setLibraryOpen\|openLibrary\|LibraryScreen`). Add a listener:

```tsx
useEffect(() => {
  const onOpen = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    setLibraryOpen({ tab: detail?.tab ?? 'skills' });   // lift tab into state
    setAppearanceModalOpen(false);                        // close Appearance
  };
  window.addEventListener('youcoded:open-library', onOpen);
  return () => window.removeEventListener('youcoded:open-library', onOpen);
}, []);
```

(If Library state is currently a boolean, widen it to `{ tab: 'skills' | 'themes' | 'updates' } | null`. Task 5.2 below does this; if 5.2 hasn't landed yet, use a temporary ref.)

- [ ] **Step 7: Manual smoke**

Open Appearance, confirm only favorited themes render. Unstar a non-active theme → it vanishes. Unstar the active theme → stays (as a fallback). Click "Browse all themes" → Library opens on Themes tab.

- [ ] **Step 8: Commit**

```bash
git add youcoded/desktop/src/renderer/components/ThemeScreen.tsx youcoded/desktop/src/renderer/App.tsx
git commit -m "feat(appearance): filter to favorites, star control, Browse all themes button"
```

### Task 5.2: LibraryScreen — tabs + two-section layout

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/library/LibraryScreen.tsx`

- [ ] **Step 1: Add prop for initial tab**

Update the props interface:

```tsx
interface Props {
  onClose(): void;
  onOpenMarketplace(): void;
  initialTab?: 'skills' | 'themes' | 'updates';
}
```

- [ ] **Step 2: Add tab state and chip row**

At the top of the component:

```tsx
const [tab, setTab] = useState<'skills' | 'themes' | 'updates'>(initialTab ?? 'skills');
const mp = useMarketplace();
const updateCount = Object.values(mp.updateAvailable).filter(Boolean).length;
const themeFavSet = useMemo(() => new Set(mp.themeFavorites), [mp.themeFavorites]);
const skillFavSet = useMemo(() => new Set(mp.favorites), [mp.favorites]);
```

Render the tab row (replace the existing Updates/Favorites/Installed-stack layout with):

```tsx
<div className="sticky top-0 z-10 bg-canvas px-4 py-2 border-b border-edge-dim flex gap-2">
  {(['skills','themes'] as const).map(t => (
    <button
      key={t}
      type="button"
      onClick={() => setTab(t)}
      className={`px-3 py-1.5 rounded-md text-sm ${
        tab === t ? 'bg-accent text-on-accent' : 'bg-inset text-fg-2 hover:text-fg'
      }`}
    >
      {t === 'skills' ? 'Skills' : 'Themes'}
    </button>
  ))}
  {updateCount > 0 && (
    <button
      type="button"
      onClick={() => setTab('updates')}
      className={`px-3 py-1.5 rounded-md text-sm ${
        tab === 'updates' ? 'bg-accent text-on-accent' : 'bg-inset text-fg-2 hover:text-fg'
      }`}
    >
      Updates · {updateCount}
    </button>
  )}
</div>
```

- [ ] **Step 3: Render tab content**

Replace the existing `Section` stack with:

```tsx
{tab === 'skills' && (
  <>
    <Section title="Favorites">
      {mp.installedSkills.filter(s => skillFavSet.has(s.id)).map(renderSkillCard)}
    </Section>
    <Section title="Installed">
      {mp.installedSkills.filter(s => !skillFavSet.has(s.id)).map(renderSkillCard)}
    </Section>
  </>
)}

{tab === 'themes' && (
  <>
    <Section title="Favorite themes">
      {mp.themeEntries.filter(t => t.installed && themeFavSet.has(t.slug)).map(renderThemeCard)}
    </Section>
    <Section title="Installed themes">
      {mp.themeEntries.filter(t => t.installed && !themeFavSet.has(t.slug)).map(renderThemeCard)}
    </Section>
  </>
)}

{tab === 'updates' && (
  <Section title="Updates available">
    {[
      ...mp.installedSkills.filter(s => mp.updateAvailable[s.id]),
      ...mp.themeEntries.filter(t => mp.updateAvailable[t.slug]),
    ].map(renderMixedCard)}
  </Section>
)}
```

(`renderSkillCard`, `renderThemeCard`, `renderMixedCard` are the existing MarketplaceCard render calls — pull them into local helpers inside the component for readability.)

- [ ] **Step 4: Wire App.tsx to pass initialTab from the global event**

Where `<LibraryScreen ... />` is rendered, pass `initialTab={libraryOpen?.tab}` (see Task 5.1 Step 6 for the state shape).

- [ ] **Step 5: Typecheck + manual smoke**

```bash
cd youcoded/desktop && npx tsc --noEmit && npm run dev
```

Manual: open Library from the Drawer library icon → Skills tab active, Favorites on top. Open from Appearance's "Browse all themes" → Themes tab active.

- [ ] **Step 6: Commit**

```bash
git add youcoded/desktop/src/renderer/components/library/LibraryScreen.tsx youcoded/desktop/src/renderer/App.tsx
git commit -m "feat(library): tabs (Skills/Themes/Updates), two-section layout, context-aware default"
```

### Task 5.3: CommandDrawer — all installed + filter chips + two flat sections

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/CommandDrawer.tsx`

- [ ] **Step 1: Read the current layout**

```bash
grep -n "categoryOrder\|drawerSkills\|sortedDrawerSkills\|filter\|chip" /c/Users/desti/youcoded-dev/youcoded/desktop/src/renderer/components/CommandDrawer.tsx | head -30
```

Read lines 84–202 to understand the current structure.

- [ ] **Step 2: Add category + favorites-only filter state**

Near the top of the component body:

```tsx
const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
const [favoritesOnly, setFavoritesOnly] = useState(false);
const skillFavSet = useMemo(() => new Set(favorites), [favorites]);
```

(If `favorites` isn't already in scope, pull from `useSkills()` or whatever hook the Drawer uses.)

- [ ] **Step 3: Replace category-grouping layout with two flat sections**

Replace the existing category-bucketed render with:

```tsx
const filtered = drawerSkills.filter(s => {
  if (categoryFilter && (s.category ?? 'other') !== categoryFilter) return false;
  return true;
});
const favsSorted = filtered
  .filter(s => skillFavSet.has(s.id) || (s.pluginName && skillFavSet.has(s.pluginName)))
  .sort((a, b) => a.displayName.localeCompare(b.displayName));
const othersSorted = filtered
  .filter(s => !skillFavSet.has(s.id) && !(s.pluginName && skillFavSet.has(s.pluginName)))
  .sort((a, b) => a.displayName.localeCompare(b.displayName));

return (
  <>
    {/* Sticky filter chip row */}
    <div className="sticky top-0 z-10 bg-panel px-2 py-1.5 border-b border-edge-dim flex flex-wrap gap-1.5">
      {(['personal','work','development','admin','other'] as const).map(c => (
        <button
          key={c}
          type="button"
          onClick={() => setCategoryFilter(prev => prev === c ? null : c)}
          className={`text-xs px-2 py-0.5 rounded-full border ${
            categoryFilter === c
              ? 'bg-accent text-on-accent border-accent'
              : 'bg-inset text-fg-2 border-edge-dim hover:border-edge'
          }`}
        >
          {c.charAt(0).toUpperCase() + c.slice(1)}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setFavoritesOnly(v => !v)}
        className={`text-xs px-2 py-0.5 rounded-full border ml-auto ${
          favoritesOnly
            ? 'bg-accent/20 text-accent border-accent/50'
            : 'bg-inset text-fg-2 border-edge-dim hover:border-edge'
        }`}
      >
        ★ Favorites only
      </button>
    </div>

    {/* Favorites section */}
    {favsSorted.length > 0 && (
      <section className="px-2 pt-2">
        <h3 className="text-[10px] uppercase tracking-wide text-fg-dim mb-1 px-1">Favorites</h3>
        <div className="grid grid-cols-2 gap-1.5">
          {favsSorted.map(renderDrawerCard)}
        </div>
      </section>
    )}

    {/* All installed (non-favorites), hidden when favoritesOnly on */}
    {!favoritesOnly && othersSorted.length > 0 && (
      <section className="px-2 pt-3">
        <h3 className="text-[10px] uppercase tracking-wide text-fg-dim mb-1 px-1">All installed</h3>
        <div className="grid grid-cols-2 gap-1.5">
          {othersSorted.map(renderDrawerCard)}
        </div>
      </section>
    )}
  </>
);
```

(`renderDrawerCard` is the existing per-skill card render — pull into a local helper so both sections use the same JSX. Ensure each card renders `<FavoriteStar>` in the corner using the `corner` variant, toggling via `setFavorite(id, !current)`.)

- [ ] **Step 4: Keep the existing "Add Skills +" card at the very end**

The `{/* Add Skills + */}` block (lines ~207-218) stays unchanged — render it after the Others section.

- [ ] **Step 5: Manual smoke**

```bash
cd youcoded/desktop && npm run dev
```

Confirm: drawer shows all installed skills, favorites on top. Click a category chip → filters both sections. Click "Favorites only" → hides the All installed section.

- [ ] **Step 6: Commit**

```bash
git add youcoded/desktop/src/renderer/components/CommandDrawer.tsx
git commit -m "feat(drawer): all-installed with filter chips and two flat sections"
```

---

## Phase 6 — Verification

### Task 6.1: Full typecheck + test suite + build

- [ ] **Step 1: Desktop typecheck + tests**

```bash
cd youcoded/desktop && npx tsc --noEmit && npm test && npm run build
```

Expected: typecheck clean, all tests pass (including new `skill-config-store-theme-favorites.test.ts`), production build succeeds.

- [ ] **Step 2: Android build**

```bash
cd youcoded && ./scripts/build-web-ui.sh && ./gradlew assembleDebug && ./gradlew test
```

Expected: clean debug APK, unit tests pass.

### Task 6.2: Manual QA checklist

- [ ] **Desktop: install a skill from the marketplace.**
  - Button: Install → Installing… (spinner) → Uninstall after resolve.
  - Card: "Installed" pill replaced by "Installing…" during flight.
  - Footer strip appears; close detail overlay mid-install → strip persists.
  - After install: skill appears in Command Drawer's Favorites section (auto-favorited).

- [ ] **Desktop: install a theme.**
  - Button sequence: Install → Installing… → Apply theme (not Active, because auto-apply is off).
  - Click Apply → theme activates live, button flips to Active.
  - Theme appears in Appearance panel (auto-favorited).

- [ ] **Desktop: uninstall the active theme.**
  - Fallback: next favorite becomes active. If none, `light`.

- [ ] **Desktop: unstar every default theme.**
  - Appearance panel shows only the active theme (fallback keeps it visible).
  - "Browse all themes" button opens Library → Themes tab.

- [ ] **Desktop: drawer filter chips.**
  - Personal/Work/Development/Admin/Other filter to that category only.
  - "Favorites only" hides the All-installed section.
  - Favorites stay sorted alphabetically within their section.

- [ ] **Android: repeat the skill-install, theme-install, theme-apply, and Appearance favorites flow.**
  - Footer strip respects the bottom safe-area (doesn't hide under system nav bar).
  - Favorite toggles persist across app restart (verify by killing and reopening).
  - Install error retry path: turn off network, click Install, confirm error pill → turn network on, click Retry Install.

- [ ] **Multi-window Electron: open a second window while installing.**
  - First window runs install → footer strip shows there.
  - Second window: the installed state syncs via fetchAll broadcast (other window doesn't show footer strip — strip is renderer-local by design, per spec).
  - Favorite toggled in one window appears in the other window's Appearance panel after re-render.

### Task 6.3: Commit final docs note (optional)

- [ ] **Step 1: Add a pointer in docs/PITFALLS.md**

Append to the `## Working With Destin` or a new `## Marketplace / Favorites` section:

```markdown
- **Favorites are local-only; `LikeButton` is server-synced.** Don't conflate. Theme favorites live in `~/.claude/youcoded-skills.json` → `themeFavorites: string[]`; skills use `favorites: string[]`. The four built-ins (`light`, `dark`, `midnight`, `creme`) are seeded on first run but can be unstarred.
- **`installingIds` is renderer-local, not IPC-broadcast.** If the user triggers an install in one Electron window, a second window won't show the footer strip. Installed-state syncs via `fetchAll`; in-flight tracking doesn't. This is intentional — the install is fast enough that cross-window tracking isn't worth the IPC.
- **Auto-favorite on install.** Installing a skill or theme auto-adds to favorites. Uninstall removes. Users can unstar at any time without uninstalling. Don't add a setting to disable this; the behavior is load-bearing for the Appearance/Drawer visibility model.
```

- [ ] **Step 2: Commit**

```bash
git add docs/PITFALLS.md
git commit -m "docs(pitfalls): marketplace favorites + install-indicator notes"
```

---

## Android parity — already handled

Unlike the transcript-metadata-polish plan, this feature does not require a follow-up Kotlin plan: the React bundle IS the Android UI. Phase 1 Task 1.4 already adds the two bridge message cases. Phase 6 Task 6.2 validates it.

---

## Self-Review

**Spec coverage:**

| Spec section | Implemented in |
|---|---|
| Storage: `themeFavorites` in youcoded-skills.json | Task 1.1 |
| IPC: `appearance:favorite-theme` + `appearance:get-favorite-themes` | Tasks 1.2, 1.3, 1.4 |
| Renderer state: `installingIds`, `installError`, `themeFavorites` | Task 2.1 |
| Auto-favorite on install | Task 2.1 (inside `installSkill` / `installTheme`) |
| Drawer all-installed with favorites sort | Tasks 2.3, 5.3 |
| Install indicator — detail-overlay button | Task 4.2 |
| Install indicator — card pill | Task 4.1 |
| Install indicator — footer strip | Task 4.3 |
| Favorite/pin star on every card surface | Tasks 3.1, 4.1, 4.2, 5.1, 5.3 |
| Appearance panel favorites filter | Task 5.1 |
| Appearance "Browse all themes" button → Library | Tasks 5.1, 5.2 |
| Library tabs + two-section layout + context default | Task 5.2 |
| Theme apply-after-install flow | Task 4.2 (ThemeBody state machine) |
| Active-theme fallback on uninstall | Already handled by existing `theme-context.tsx:163-173`; no code change — documented in Task 6.2 QA |
| Seeding defaults on first run | Task 1.1 (`DEFAULT_THEME_FAVORITES` + lazy seed in `getThemeFavorites`) |
| Edge: active theme stays visible in Appearance even if unstarred | Task 5.1 (`gridThemes` fallback) |
| Android parity | Task 1.4 |
| Multi-window broadcast | Task 1.2 (appearance:sync broadcast) + existing onSync listener in theme-context |

**Placeholder scan:** no TBDs, no "similar to Task N", no "handle edge cases" without code. Every step has concrete commands or code.

**Type consistency:**
- `themeFavorites: string[]` — consistent across UserSkillConfig, SkillConfigStore methods, MarketplaceState, IPC return type
- Install-tracking key format `${type}:${id}` — consistent across markInstalling/clearInstalling/installError/InstallingPill/MarketplaceDetailOverlay/InstallingFooterStrip
- IPC message names `appearance:favorite-theme` / `appearance:get-favorite-themes` — identical across preload.ts / remote-shim.ts / SessionService.kt (mandatory per PITFALLS.md)
- Event name `youcoded:open-library` with `{ detail: { tab: 'skills' | 'themes' | 'updates' } }` — emitted by ThemeScreen, listened by App.tsx, forwarded to LibraryScreen's `initialTab` prop
- `LibraryScreen` `initialTab` prop shape matches the event detail shape

**Known fragility:**
- Task 1.4 (Android) assumes a Kotlin-side `SkillConfigStore` already has a `setFavorite` pattern to mirror. If it doesn't, the step falls back to inline JSON mutation, which is explicit in Step 4.
- Task 5.1 Step 6 (App.tsx event listener) assumes a Library modal state exists. If the current App.tsx uses a different open/close pattern for Library, adapt to whatever that pattern is — the event dispatch is independent of state shape.
- Task 5.3 assumes `drawerSkills` still exists on the SkillContext value after Task 2.3 (it does — we only changed the derivation, not the field name).

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-20-marketplace-install-indicators-and-favorites.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task with two-stage review between. Keeps main context clean and lets you eyeball each commit. Best when tasks span multiple files with significant new code, like this plan.

2. **Inline Execution** — execute tasks in this session with checkpoints. Faster but harder to course-correct if a phase goes sideways.

Which approach?
