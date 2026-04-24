# Marketplace Integration Polish — Design

**Date:** 2026-04-22
**Status:** Draft
**Repos touched:** `youcoded` (desktop + android), `wecoded-marketplace` (registry schema)

## Problem

The marketplace "integrations" section (Apple Services, Google Services, iMessage, Todoist, etc.) has three broken or unpolished behaviors:

1. **Platform gating is invisible in the UI.** Registry entries declare `platforms: ['darwin']` but nothing renders it. Users on Windows can click "Install" on Apple Services, wait, and see an error containing raw platform codes: *"Not supported on this platform (needs darwin)"*.
2. **Integration detail pages are bare** compared to plugin detail pages. The `longDescription` field exists in the registry but is never rendered. No tags, no life-area chips, no metadata styling. The integration overlay is ~40% the size of the plugin overlay.
3. **The "Open Settings" button silently uninstalls.** Scaffold behavior left in place since Phase 3 — the button label lies. There is no real settings panel.

## Goals

- Integration cards and detail pages match the visual/informational density of plugin cards and detail pages.
- Users never see raw `darwin`/`win32` platform codes.
- Platform-blocked integrations are obvious at a glance (grid and detail), discoverable but explicitly not installable on the current platform.
- Settings button honestly signals "Coming soon" rather than pretending to work.
- `Uninstall` is exposed as a proper action matching plugin patterns — not hidden behind a misleading label.

## Non-goals

- Building a real settings panel for installed integrations. The button remains disabled.
- Adding reviews/ratings to integrations. That's a plugin-only concept.
- Adding `author` / `repoUrl` / `version` fields to integrations. Integrations are first-party; these don't apply.

## Design

### 1. Shared platform-display helper

New file `desktop/src/shared/platform-display.ts`:

```ts
// Shared by desktop + android (bundled into the React UI).
// Maps Node process.platform codes to human names.
const NAMES: Record<string, string> = {
  darwin: 'macOS',
  win32: 'Windows',
  linux: 'Linux',
  android: 'Android',
};

export function platformDisplayName(code: string): string {
  return NAMES[code] ?? code;
}

// Human-readable join: ['darwin'] → 'macOS', ['darwin','linux'] → 'macOS or Linux',
// ['darwin','linux','win32'] → 'macOS, Linux, or Windows'.
export function platformListDisplay(codes: string[]): string {
  const names = codes.map(platformDisplayName);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} or ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, or ${names[names.length - 1]}`;
}
```

Used by: integration-installer error messages, detail overlay chip, card badge.

### 2. Renderer platform detection

New IPC channel `platform:get` returning `'darwin' | 'win32' | 'linux' | 'android'`.

- **Desktop** (`desktop/src/main/ipc-handlers.ts`): returns `process.platform` from the Electron main process.
- **Android** (`app/.../runtime/SessionService.kt`): returns the literal string `"android"`.

Exposed as `window.claude.getPlatform(): Promise<Platform>` via `preload.ts` and `remote-shim.ts`. Cached on first call in a shared module (`desktop/src/renderer/state/platform.ts`) since it never changes over the session.

`MarketplaceScreen` calls `useEffect(() => { getPlatform().then(setPlatform) }, [])` on mount; renders an empty-state flash until resolved (single microtask).

**Backend check stays as-is.** `integration-installer.ts` keeps its server-side `process.platform` guard — belt-and-suspenders. The UI gate prevents the user from reaching that error; the backend gate catches any bypass.

### 3. Registry schema: add `tags`

Add optional `tags?: string[]` to `IntegrationEntry` in:
- `wecoded-marketplace/schemas/integrations-schema.json` (if present; otherwise TypeScript type only)
- `desktop/src/shared/marketplace-types.ts` (`IntegrationEntry`)
- `app/.../skills/IntegrationTypes.kt` (Android mirror)

Pre-filled values for `wecoded-marketplace/integrations/index.json`:

| Slug | Tags |
|---|---|
| apple-services | `calendar, email, contacts, notes, files` |
| google-services | `email, calendar, drive, docs, oauth` |
| imessage | `messaging, social` |
| todoist | `tasks, productivity` |
| applescript | `automation, scripting` |
| canva | `design, creative, oauth` |
| github | `code, development, oauth` |
| macos-control | `automation, accessibility` |
| windows-control | `automation, accessibility` |

### 4. Card platform badge

In `MarketplaceScreen.tsx`'s integration card path (~line 291), compute:

```ts
const isPlatformBlocked =
  item.platforms &&
  item.platforms.length > 0 &&
  !item.platforms.includes(currentPlatform);
```

When blocked, **override** the `statusBadge` prop passed to `MarketplaceCard` (supersedes Connected/NeedsAuth/etc. — those states are moot if the user can't install):

```ts
statusBadge: {
  label: `${platformDisplayName(item.platforms[0])} Only`,
  tone: 'locked',
}
```

`MarketplaceCard` gains a new `'locked'` tone: muted slate background (`bg-inset`), `fg-dim` text, subtle lock glyph prefix (SVG, not emoji). Visually: reads as "not for you" without being alarming like an error state.

The card itself does **not** get dimmed/disabled — it stays clickable so users can open the detail page and read about it. Only the Install button inside the detail is blocked.

### 5. Detail overlay rebuild

Keep `IntegrationDetailOverlay` as a separate component in `MarketplaceScreen.tsx` (integration actions diverge from plugin actions — different primary button semantics, no reviews/favorite/share). Rewrite its body to mirror `MarketplaceDetailOverlay`'s section structure:

```
<article flex flex-col gap-4 max-w-3xl mx-auto>
  <header flex items-start justify-between gap-4>
    <div min-w-0>
      icon + displayName (h1)
      tagline (p)
      <chip row> platform chip (if gated) + status chip
    </div>
    <div shrink-0 flex items-center gap-2>
      [action buttons per state table below]
    </div>
  </header>

  <MetadataChips> tags + lifeArea </MetadataChips>   // reuse or mirror plugin version

  <section> About (longDescription) </section>

  <section> Setup details (derived from setup.type) </section>
</article>
```

**Setup details section** is a small bulleted block, derived from the registry fields — no new schema needed:

- `setup.type === 'api-key'` → "• Requires a `${setup.keyName}` API key"
- `setup.requiresOAuth === true` → "• Signs in via ${setup.oauthProvider || 'OAuth'}"
- `platforms` declared → "• Available on ${platformListDisplay(platforms)}"
- `setup.postInstallCommand` → "• After install, runs `${setup.postInstallCommand}`"

Only renders if at least one bullet applies.

### 6. Action button state machine

Replaces the current broken single-button logic in `IntegrationDetailOverlay`. Cards have no action buttons — they only render the status badge from §4; clicking a card opens the detail where the full button row below applies.

| State | Condition | Buttons (left to right) |
|---|---|---|
| Coming soon | `status === 'planned'` | `[Coming soon]` disabled |
| Deprecated | `status === 'deprecated'` | `[Deprecated]` disabled |
| Platform-blocked | `platforms && !includes(currentPlatform)` | `[${platformName} Only]` disabled, tooltip `Only available on ${platformName}` |
| Installing | `state.installing` | `[Installing…]` disabled, spinner |
| Install error | `!state.installed && state.error` | `[Retry Install]` enabled |
| Not installed | `!state.installed` | `[Install]` enabled |
| Needs auth | `state.installed && !state.connected` | `[Connect]` + `[Settings (Coming soon…)]` disabled + `[Uninstall]` |
| Connected | `state.installed && state.connected` | `[Settings (Coming soon…)]` disabled + `[Uninstall]` |

**Precedence:** platform-blocked > status-planned/deprecated > installing > error > install-state. A deprecated integration on the wrong platform shows "macOS Only" (platform check wins); this avoids two disabled buttons competing for the primary slot.

**New: Connect action.** Re-runs `setup.postInstallCommand` against an existing install without a fresh install+write cycle. Implementation: add `IntegrationInstaller.connect(slug)` that checks `state.installed === true` and spawns `postInstallCommand` as the user would from chat. If no `postInstallCommand`, the Connect button is not rendered (fall back to `[Settings (Coming soon…)] [Uninstall]`).

**Settings button styling:** Matches the disabled plugin patterns (`bg-inset text-fg-dim border-edge-dim cursor-not-allowed`). Label: exactly `Settings (Coming soon…)` including the ellipsis character.

**Uninstall styling:** Identical to `MarketplaceDetailOverlay`'s uninstall button (`bg-inset text-fg border border-edge hover:border-edge-dim`, primary slot weight). Exposes the action that was previously hidden behind the misleading "Open settings" label.

### 7. User-facing copy cleanup

- `integration-installer.ts:117` → use `platformListDisplay(entry.platforms)` so the error reads *"Not supported on this platform (needs macOS)"* instead of *"needs darwin"*. (Backend path only hit if the UI gate is bypassed, but the string still matters.)
- Audit other error messages in `integration-installer.ts` for similar leakage: `setup.type "X" not yet implemented` is developer-ese — rewrite to "This setup method isn't supported yet." Error catalog:
  - Line 128: `Plugin not found in marketplace: ${pluginId}` → acceptable, leaves for now
  - Line 155: `setup.type "${type}" not yet implemented` → `"This integration's setup method isn't supported in this version."`
  - Line 194: `not-implemented: configure` → no longer user-facing after Settings button is disabled; leave as internal sentinel
  - Line 204 (recordFailure): `${err}` may leak raw exception — wrap with user-facing prefix `"Install failed: "` and log the raw error to console.

## Components changed

| File | Change |
|---|---|
| `desktop/src/shared/platform-display.ts` | **new** — helpers |
| `desktop/src/renderer/state/platform.ts` | **new** — platform hook/cache |
| `desktop/src/shared/marketplace-types.ts` | add `tags` to `IntegrationEntry` |
| `desktop/src/main/ipc-handlers.ts` | register `platform:get` |
| `desktop/src/main/preload.ts` | expose `getPlatform` |
| `desktop/src/renderer/remote-shim.ts` | expose `getPlatform`; mirror `integrations:connect` |
| `desktop/src/main/integration-installer.ts` | add `connect()` method; copy cleanup; use `platformListDisplay` |
| `desktop/src/renderer/components/marketplace/MarketplaceScreen.tsx` | Integration card path: platform check + badge override. Rebuild `IntegrationDetailOverlay` component. |
| `desktop/src/renderer/components/marketplace/MarketplaceCard.tsx` | add `'locked'` tone to badge enum + styles |
| `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` | handle `platform:get` + `integrations:connect` bridge messages |
| `app/src/main/kotlin/com/youcoded/app/skills/IntegrationTypes.kt` | mirror `tags` field |
| `wecoded-marketplace/integrations/index.json` | add `tags` to all 9 entries |
| `wecoded-marketplace/scripts/build-integrations.js` | allow `tags` in schema |
| `wecoded-marketplace/schemas/integrations-schema.json` (if present) | add `tags` |

## Testing

- Desktop unit: `integration-installer.connect()` existing-install path; platform-display helpers (both functions, edge cases: empty array, unknown code).
- Desktop renderer: `IntegrationDetailOverlay` renders each state from the table above (snapshot-style or RTL per existing patterns).
- Manual: open each state on desktop (darwin, win32) and on Android. Confirm Apple Services shows "macOS Only" pill on Windows and renders normally on macOS. Confirm Todoist (unconstrained) renders normally on all platforms.
- IPC parity test: `tests/ipc-channels.test.ts` picks up new `platform:get` and `integrations:connect` channels on all three platform surfaces.

## Rollout

Ship in one worktree / one PR per repo:

1. `wecoded-marketplace` — registry schema + content. Can deploy independently (24h cache means app picks it up within a day; force-refresh also triggers).
2. `youcoded` — UI + IPC + installer. Ships in the next app release.

Order: marketplace registry first (harmless without UI changes — just extra field that old UI ignores), then youcoded PR.

## Open questions

None — all ambiguities resolved during brainstorming.

## Out of scope (deferred)

- Real settings panel for installed integrations (`integrations:configure` IPC stays a stub). Separate spec when that work starts.
- Integration reviews/ratings. Different product concept from plugin reviews; punt.
- `author` / `repoUrl` fields on integrations. Re-evaluate if any community-contributed integrations appear.
- Android-specific platform enum value. Currently `'android'` is distinct from `'linux'`, but no integrations gate on Android yet. Revisit when a Linux-desktop-only integration is added (today's `platforms: ['linux']` would incorrectly allow Android install).
