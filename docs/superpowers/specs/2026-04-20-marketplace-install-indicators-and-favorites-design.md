# Marketplace Install Indicators & Favorites — Design Spec

**Date:** 2026-04-20
**Status:** Draft
**Owner:** Destin
**Repo:** `youcoded/` (desktop renderer + main process + Android SessionService)

## Problem

Two gaps in today's marketplace and appearance flows:

1. **Install has no progress feedback.** Clicking "Install" on a skill or theme does nothing visible until the promise resolves and the button flips to "Uninstall". Users can't tell if the click registered, how long it will take, or whether it failed. The detail-overlay button is the only install surface; closing the overlay loses all context.
2. **No personal-shortlist concept for themes, and the concept is hidden for skills.** The skills system has a `favorites: string[]` in `~/.claude/youcoded-skills.json` and uses it to populate the Command Drawer, but the drawer only shows favorites, so non-favorited installed skills are only reachable through the Library. Themes have a public `LikeButton` (server-synced count) but no local "pin" concept — Appearance shows a flat grid of every theme the user has ever installed, which clutters as the user explores the marketplace.

## Goals

- Give users a clear "installing" indicator during both skill and theme installs, visible even after the detail overlay closes.
- Add a unified local pin/favorite concept that applies to both skills and themes.
- Let favorites drive the Appearance panel (themes) and preserve the Command Drawer as the quick-access surface (skills).
- Keep non-favorited installed items reachable through a single Library surface.
- Maintain desktop ↔ Android parity throughout.

## Non-goals

- No change to the server-synced theme `LikeButton` (it remains a public count, orthogonal to local favorites).
- No rich staged-progress reporting (no IPC events like "fetching → writing → reloading"); indicator is simple pending state only.
- No onboarding / tutorial UI for the new favorites concept.
- No auto-apply on theme install (users click Apply explicitly).
- No rework of existing built-in theme defaults, marketplace API, or plugin-install registry mechanics.

## Mental model

**Favorites = a user's personal shortlist.** Distinct from "installed":

| Surface | Today | After |
|---|---|---|
| Command Drawer (skills) | Favorites only | All installed, favorites floated to the top; category filter chips |
| Appearance panel (themes) | All themes | Favorites only + "Browse all themes" button |
| Library (both) | Installed + Updates | Installed + Updates + Favorites, tabbed Skills/Themes/Updates |

The four built-in themes (`light`, `dark`, `midnight`, `creme`) are seeded as favorites on first run so new users see the Appearance panel fully populated, but a user can unstar any of them. Seeded-once logic (parallel to the existing `youcoded-seeded-favorites` flag for skills) prevents re-seeding on subsequent loads or config wipes.

**Auto-favorite on install.** Installing a skill or theme from the marketplace adds it to its favorites list automatically. Uninstalling removes it. Users can unstar at any time without uninstalling.

**Active theme is independent of favorites.** Unstarring the currently-active theme keeps it active (nothing changes visually), but the card disappears from Appearance until re-favorited via Library. Uninstalling the active theme is the one case where the app switches themes (falls back to first remaining favorite, else `light`).

## Architecture

### Storage

Extend `~/.claude/youcoded-skills.json` (owned by `desktop/src/main/skill-config-store.ts`) with a single new key:

```json
{
  "favorites": ["skill-id-1", "skill-id-2"],
  "themeFavorites": ["light", "dark", "midnight", "creme"],
  ...
}
```

Missing `themeFavorites` defaults to the seed list on first read, then persists. `SkillConfigStore` gains `getThemeFavorites()` and `setThemeFavorite(slug, favorited)` methods that mirror the existing skill-favorite API exactly.

No schema migration, no new config file. The file is already the de-facto user-config store (packages map already contains `theme:<slug>` keys).

### IPC additions

Three new message types, added in lockstep across `preload.ts`, `remote-shim.ts`, and `SessionService.handleBridgeMessage()`:

- `appearance:favorite-theme` — request-response. Payload `{slug, favorited}`. Returns the new `themeFavorites` array.
- `appearance:get-favorite-themes` — request-response. Returns `string[]`.
- Broadcast on change via the existing `appearance:broadcast` pipe so peer Electron windows update without refetch.

Skill-favorite IPC already exists and is unchanged.

### Renderer state

`MarketplaceContext` (`desktop/src/renderer/state/marketplace-context.tsx`) gains:

```ts
installingIds: Set<string>              // 'skill:<id>' | 'theme:<slug>'
installError: Map<string, { message: string; at: number }>
```

`installSkill` / `installTheme` / `updateItem` wrap their IPC calls:

```ts
const key = `skill:${id}`;
setInstallingIds(prev => new Set(prev).add(key));
try {
  await window.claude.skills.install(id);
  await fetchAll();   // NOTE: fetchAll BEFORE clearing installingIds
} catch (e) {
  setInstallError(prev => new Map(prev).set(key, { message: e.message, at: Date.now() }));
} finally {
  setInstallingIds(prev => { const next = new Set(prev); next.delete(key); return next; });
}
```

The `fetchAll()`-before-clear ordering matters: clearing `installingIds` before `fetchAll()` resolves creates a brief "Installing… → Install → Uninstall" flash because the installed-state derivation hasn't caught up.

Errors auto-clear after 6s via a timer in `MarketplaceContext`.

Theme-favorite toggles go through a new `ThemeContext.favoriteTheme(slug, !current)` method that calls the IPC and updates in-memory state, parallel to the existing `setTheme` path.

## UI changes

### Install indicator (three surfaces)

1. **Detail overlay button** (`MarketplaceDetailOverlay.tsx`, skill install at ~228-240, theme at ~445-453):
   - `Install` → `Installing…` (spinner, disabled) while key is in `installingIds`.
   - Error: shake + red border, show message for 6s, button reverts to `Install` (single-click retry).
   - Success: existing `installed` check flips to `Uninstall`.

2. **Card chip** (`MarketplaceCard.tsx` and Library cards):
   - "Installed" / "Update" badge region replaced by a pulsing "Installing…" pill while the key is in `installingIds`.

3. **Marketplace footer strip** (new, rendered from `MarketplaceScreen.tsx`):
   - Visible iff `installingIds.size > 0`.
   - Docks at the bottom, theme-tinted (`--panel` + accent), respects `safe-area-inset-bottom` on Android.
   - Text: "Installing: Solarized" (single) or "Installing 2: Solarized, Inbox Skill" (multiple).
   - Errors appear as a red chip-style entry for 6s, click-to-dismiss.
   - Closing the detail overlay leaves the strip visible, so the user has continuous feedback.

### Favorite/pin control (visible on every card)

A small star control in the card's top-right corner, mirroring the pencil-icon pattern at `ThemeScreen.tsx:147-155`. Filled = favorited, outline = not. Click toggles the relevant IPC. Disabled pre-install (tooltip: "Install to favorite") — consistent with the existing skill behavior at `MarketplaceDetailOverlay.tsx:209-219`.

Applies to:
- Marketplace rail cards (`MarketplaceCard.tsx`)
- Marketplace search grid
- Library cards
- Appearance panel cards (`ThemeScreen.tsx`)
- Drawer skill cards (`CommandDrawer.tsx`)

### Appearance panel (`ThemeScreen.tsx`)

- Grid renders only `allThemes.filter(t => themeFavoriteSet.has(t.slug))`.
- Active-theme badge on the active card regardless of favorited status — if the user unstars the active theme, we still render it until they switch away (keeps at least one card visible).
- New "Browse all themes" button at the bottom, full-width, `.layer-surface` styled. Opens the Library with the Themes tab pre-selected; Appearance modal dismisses on transition.
- Cycle list, glass overrides, reduced-effects toggle, and the rest of Appearance unchanged. Cycle list is orthogonal to favorites.

### Library (`LibraryScreen.tsx`)

New top-level three-way filter: **Skills · Themes · Updates**. Default tab is context-aware:

| Entry point | Default tab |
|---|---|
| Appearance → "Browse all themes" | Themes |
| Command Drawer library icon | Skills |
| Marketplace top-bar library button | Skills |

Updates tab shows a count badge ("Updates · 3") and is hidden when no updates exist.

Each tab has two sections: **Favorites** then **Installed** (non-favorites). Star toggle on each card moves the card between sections on next render. Active-theme badge on whichever card holds the active slug. Updates tab shows existing update-available cards, not separated by favorites.

The existing top-level "Updates available" section moves into the Updates tab.

### Command Drawer (`CommandDrawer.tsx`)

Source changes from favorites-only to all-installed. Rendered as two flat sections:

1. **Favorites** — alphabetical.
2. **All installed** (or "Others") — alphabetical, non-favorites only. Hidden when "Favorites only" chip is on.

Sticky filter chip row at the top, mirroring `MarketplaceFilterBar.tsx`:
- Category chips: Personal · Work · Development · Admin · Other. Single-select + "All" reset.
- "Favorites only" toggle — restores today's behavior.
- Search input (already present via slash-trigger / compass button) applies on top of chip filters.

Skip the marketplace's "vibes" and "meta" chips (discovery-surface concepts, not relevant to the curated post-install view).

"Add Skills +" card pinned at the end unchanged. Existing pencil + market-stall icons at the top unchanged.

`sortedDrawerSkills` derivation in `skill-context.tsx` simplifies to `{favorites, others}` — the existing `categoryOrder` constant stays in code (drives marketplace-side grouping) but the drawer no longer uses it as a layout axis.

### Theme apply-after-install flow

In the theme detail overlay (`MarketplaceDetailOverlay.tsx:445-453` area), four button states:

| State | Primary button | Secondary | Star |
|---|---|---|---|
| Not installed | `Install` (accent) | — | disabled |
| Installing | `Installing…` (spinner, disabled) | — | disabled |
| Installed, not active | `Apply theme` (accent) | `Uninstall` (subdued) | enabled |
| Installed, active | `Active` (disabled/subdued) | `Uninstall` (subdued) | enabled |

Clicking `Apply theme` calls the existing `setTheme(slug)` path (`theme-context.tsx:118-141`). Modal stays open so the user can see the live change through the scrim. Button text fades to "Applied" for ~1.5s then resolves to "Active".

**No auto-apply on install.** Install auto-favorites but leaves the active theme untouched.

Library-side theme detail overlay gets the same flow.

Uninstalling the active theme auto-switches to the next favorite (ordered by `themeFavorites` array position, built-ins excluded from `themeFavorites` last-resort fallback), else `light` as a hard fallback. Broadcasts via existing `appearance.set`.

## Edge cases

- **Uninstall while favorited.** Same transaction removes the ID from both `favorites` and `themeFavorites` as applicable. `MarketplaceContext.fetchAll()` lazily prunes stale favorite IDs on each load for robustness against manual config edits.
- **First-run on existing install.** Users with pre-existing `youcoded-skills.json` but no `themeFavorites` key get the four built-ins seeded once; the `youcoded-seeded-theme-favorites` localStorage flag prevents re-seeding after wipes. Parallel to existing `youcoded-seeded-favorites` flag for skills.
- **Unstar all themes including active.** Active theme stays active; card still renders in Appearance until theme is switched. Prevents "empty appearance panel".
- **Install error retry.** 6s error window; click during the window resubmits. No rate limiting, no exponential backoff (consistent with today).
- **Multi-window Electron.** Favorite toggles broadcast via the existing `appearance:broadcast` pipe; peer windows re-render from in-memory update. `installingIds` is renderer-local (per-window) by design — each window shows its own in-flight installs; post-install `installed` state still syncs via `fetchAll()` broadcast.
- **Android parity.** Three new message types added in lockstep to `preload.ts`, `remote-shim.ts`, `SessionService.handleBridgeMessage()`. Missing the Android side crashes the Appearance panel on Android.

## Files touched (non-exhaustive)

| File | Change |
|---|---|
| `desktop/src/main/skill-config-store.ts` | Add `themeFavorites` key, `getThemeFavorites()` / `setThemeFavorite()` methods |
| `desktop/src/main/ipc-handlers.ts` | Add `appearance:favorite-theme` and `appearance:get-favorite-themes` handlers |
| `desktop/src/main/preload.ts` | Expose `appearance.favoriteTheme()` / `appearance.getFavoriteThemes()` on `window.claude` |
| `desktop/src/renderer/remote-shim.ts` | Same shape on Android side (WebSocket IPC) |
| `app/.../runtime/SessionService.kt` | `when` cases for the three new message types |
| `desktop/src/renderer/state/marketplace-context.tsx` | `installingIds`, `installError`, wrap install/update calls |
| `desktop/src/renderer/state/theme-context.tsx` | `favoriteTheme()`, seeding logic, `themeFavoriteSet` derivation, active-theme fallback on uninstall |
| `desktop/src/renderer/state/skill-context.tsx` | `sortedDrawerSkills` → flat `{favorites, others}` |
| `desktop/src/renderer/components/marketplace/MarketplaceScreen.tsx` | Footer strip |
| `desktop/src/renderer/components/marketplace/MarketplaceCard.tsx` | Installing pill, star control |
| `desktop/src/renderer/components/marketplace/MarketplaceDetailOverlay.tsx` | Button state machine (install / installing / active / uninstall), Apply flow |
| `desktop/src/renderer/components/ThemeScreen.tsx` | Favorites filter, star control, "Browse all themes" button |
| `desktop/src/renderer/components/library/LibraryScreen.tsx` | Tabs (Skills/Themes/Updates), two-section layout, context-aware default tab |
| `desktop/src/renderer/components/CommandDrawer.tsx` | All-installed source, filter chips, two flat sections |

## Testing

Unit (Vitest):
- `SkillConfigStore` favorites round-trip for themes, seeding on first read, idempotency.
- `MarketplaceContext` install wrapper: `installingIds` contains key during promise, clears after `fetchAll()`, error populates `installError`, auto-clears after 6s.
- Install-button state machine: Install → Installing → (Active / Uninstall / Apply), error state renders.

Component (React Testing Library):
- `ThemeScreen` renders only favorited themes + active theme fallback.
- `CommandDrawer` renders all installed, favorites first, category chip filters, "Favorites only" toggle.
- `LibraryScreen` tabs switch correctly, context-aware default.

Integration (manual):
- Install flow on desktop and Android: spinner visible, footer strip visible, close overlay mid-install, verify continued feedback, verify Apply works, verify auto-favorite.
- Uninstall active theme → fallback to next favorite.

No new E2E. Consistent with existing desktop test posture (`npm test` = Vitest unit).

## Pitfall compliance

- **IPC parity** (PITFALLS.md "Cross-Platform"): all three new message types added in lockstep across preload.ts, remote-shim.ts, SessionService.kt. Call-site verification required in QA.
- **Overlay primitives** (PITFALLS.md "Overlays"): "Browse all themes" button uses `.layer-surface`; footer strip uses theme tokens, no hardcoded `bg-black/40` or z-indexes.
- **Single source of truth for theme prefs** (theme-context.tsx docs): favorites broadcast via existing `appearance.set` channel; no new sync pipes.
- **CC coupling** (PITFALLS.md): this feature touches no Claude Code file-format, registry, or CLI-parsing code. No entry needed in `docs/cc-dependencies.md`.

## Rollout

Single PR to `youcoded`. Desktop + Android ship together (one tag). No feature flag — the favorites seed list ensures existing users get a reasonable Appearance panel on first load post-upgrade.
