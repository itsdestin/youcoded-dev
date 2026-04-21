---
status: draft
created: 2026-04-20
---

# Bundled Default Plugins (Theme Builder + WeCoded Plugin Publisher)

## Summary

Ship the YouCoded app with two marketplace plugins — `wecoded-themes-plugin` (Theme Builder) and `wecoded-marketplace-publisher` (WeCoded Plugin Publisher) — always installed. On every launch, if either plugin is missing from the user's installed-plugin registry, the app silently installs it from the marketplace. The user cannot uninstall these plugins; the UI's uninstall action is disabled with a tooltip explaining why, and the IPC handler rejects uninstall calls for these IDs as defense-in-depth.

These are not "default favorites." Favoriting is untouched. The concept introduced here is **bundled plugins** — plugins essential enough to ship alongside the app, but still installed through the normal marketplace flow rather than shipped as app-bundled assets.

## Goals

- `wecoded-themes-plugin` and `wecoded-marketplace-publisher` are present on every fresh and existing install, across desktop and Android.
- Users discover these plugins with no setup friction.
- Users can't accidentally or intentionally remove them via the YouCoded UI.
- Failure modes (offline, marketplace unreachable, disk write failure) are self-healing on the next launch — no user-visible errors, no retry loops.

## Non-Goals

- Auto-favoriting these plugins. Favorites stay a user-owned list.
- A generic "essential plugin" framework configurable from the marketplace registry. The bundled list is hardcoded in the app and intrinsic to its version.
- Shipping the plugins as bundled assets. They install from the marketplace like any other plugin; first-launch offline users get them on their next connected launch.
- Blocking or slowing down app startup while the install runs.
- A UI badge on bundled plugin cards. The disabled uninstall button plus tooltip is the only visible treatment.

## Architecture

### Entry point

`SkillProvider` on both platforms gains a new method `ensureBundledPluginsInstalled()`. It:

1. Awaits the first successful marketplace cache refresh via whatever "marketplace ready" primitive each platform exposes (`ready()` on desktop; the Android equivalent in `LocalSkillProvider` — confirm during implementation).
2. Calls the existing bulk-install API `installMany(BUNDLED_PLUGIN_IDS)`. `PluginInstaller.installPlugin()` is idempotent — already-installed plugins return `'already_installed'` as a no-op — so no new "is it installed" pre-check is added.
3. Logs per-plugin failures via `console.warn` / `Log.w` and returns. Silent retry on next launch is the contract.

### Trigger

- **Desktop:** called once inside `SkillProvider.start()` (or equivalent init path invoked from `main.ts`), fire-and-forget.
- **Android:** called once inside `SessionService.onCreate()` after skill provider initialization, launched on `Dispatchers.IO` via `serviceScope` so it doesn't block the foreground service startup.

### Shared constant (parity-required, three copies)

The bundled list is duplicated across three locations. Each file carries a header comment identifying the sibling files and pointing to `PITFALLS.md`:

| File | Consumer |
|------|----------|
| `youcoded/desktop/src/shared/bundled-plugins.ts` | Electron main process — `SkillProvider`, IPC uninstall rejection |
| `youcoded/desktop/src/renderer/config/bundled-plugins.ts` | React UI — disabled uninstall button + tooltip |
| `youcoded/app/src/main/kotlin/com/youcoded/app/skills/BundledPlugins.kt` | Android `SessionService` + `LocalSkillProvider` |

Each exports:

```ts
// TypeScript (both main and renderer)
export const BUNDLED_PLUGIN_IDS = [
  'wecoded-themes-plugin',
  'wecoded-marketplace-publisher',
] as const

export const BUNDLED_REASON =
  'Bundled with YouCoded — required for theme customization and publishing.'
```

```kotlin
// Kotlin
object BundledPlugins {
  val IDS = listOf("wecoded-themes-plugin", "wecoded-marketplace-publisher")
  const val REASON =
    "Bundled with YouCoded — required for theme customization and publishing."
}
```

This mirrors the existing documented pattern where `preload.ts` / `remote-shim.ts` / `SessionService.kt` message strings must match — see the cross-platform section of `PITFALLS.md`.

A runtime-fetched, marketplace-driven bundled list was considered and rejected because (a) it depends on network availability to even know what to bundle, and (b) it grants the marketplace repo authority to force-install plugins on every YouCoded client — too much power for a remote config.

## Components

### Desktop — `youcoded/desktop/src/main/skill-provider.ts`

New method:

```ts
async ensureBundledPluginsInstalled(): Promise<void> {
  try {
    await this.ready()
    await this.installMany([...BUNDLED_PLUGIN_IDS])
  } catch (err) {
    console.warn('[bundled-plugins] ensure failed:', err)
  }
}
```

Called once from the existing `SkillProvider.start()` initialization path. Fire-and-forget — the caller does not await. `installMany` already skips plugins not present in the marketplace cache and no-ops on already-installed entries.

### Desktop — `youcoded/desktop/src/main/ipc-handlers.ts`

In the existing `skills:uninstall` handler, add an early check:

```ts
if (BUNDLED_PLUGIN_IDS.includes(id)) {
  return { ok: false, error: 'bundled' }
}
```

The response shape matches existing uninstall responses. This runs before any call to `skillProvider.uninstall(id)` — no registry mutations happen for bundled IDs.

### Android — `youcoded/app/src/main/kotlin/com/youcoded/app/skills/LocalSkillProvider.kt`

New method mirroring the desktop signature:

```kotlin
fun ensureBundledPluginsInstalled() {
  serviceScope.launch(Dispatchers.IO) {
    try {
      awaitReady()
      installMany(BundledPlugins.IDS)
    } catch (e: Exception) {
      Log.w("BundledPlugins", "ensure failed", e)
    }
  }
}
```

Called once from `SessionService.onCreate()` after skill provider init.

### Android — `SessionService.handleBridgeMessage()` `skills:uninstall` case

Add the same rejection for bundled IDs before delegating to `skillProvider?.uninstall(id)`. Respond via `bridgeServer.respond(ws, msg.type, msg.id, JSONObject().apply { put("ok", false); put("error", "bundled") })`. Matches the desktop response shape exactly — same error code `'bundled'`.

### Renderer — disabled uninstall button

In the component that renders each installed-plugin row (likely `desktop/src/renderer/components/skills/SkillsPanel.tsx` or adjacent — resolve during implementation):

```tsx
const isBundled = BUNDLED_PLUGIN_IDS.includes(plugin.id)
<button
  disabled={isBundled}
  title={isBundled ? BUNDLED_REASON : undefined}
  onClick={...}
>
  Uninstall
</button>
```

If the existing button uses a tooltip primitive rather than `title`, adapt accordingly but keep the string in the shared `BUNDLED_REASON` constant.

No new component, no new badge, no new section. The only visible change is the disabled state + tooltip on bundled plugins' uninstall controls.

## Data Flow

```
App launch (desktop or Android)
  ↓
SkillProvider init + first marketplace cache refresh
  ↓
ensureBundledPluginsInstalled() fires (fire-and-forget)
  ↓
await ready() → installMany(BUNDLED_PLUGIN_IDS)
  ↓
For each ID:
  - Already installed → 'already_installed' (no-op)
  - Not in marketplace cache → skipped (will retry next launch)
  - Installed successfully → four-registry write via ClaudeCodeRegistry
  - Failure → logged, skipped (will retry next launch)
```

User-initiated uninstall:

```
User clicks Uninstall button
  ↓
Renderer: button disabled if BUNDLED_PLUGIN_IDS.includes(id) — click never fires
  ↓
(Belt-and-suspenders) If the IPC call somehow reaches main/SessionService:
  → handler returns { ok: false, error: 'bundled' } without touching registries
```

## Error Handling

Silent retry on next launch is the universal policy:

- **Offline at launch:** marketplace cache empty → `installMany` receives no entries to install → exit cleanly, retry next launch
- **Marketplace fetch fails mid-launch:** `ready()` rejects → outer try/catch logs → retry next launch
- **Per-plugin install failure (network mid-download, registry write error):** existing `installMany` per-plugin error handling logs and moves on; bundled-plugins method doesn't add a retry loop — next launch fills the gap
- **Partial success:** one plugin installs, other fails → the successful one stays installed; next launch tops up the missing one

Nothing surfaces to the user. No toast, no banner, no error modal. The contract from the design conversation is that these plugins are essential but not critical-path; if they arrive on the second launch instead of the first, that's fine.

## Testing

### Unit tests

- **`skill-provider.test.ts`** — `ensureBundledPluginsInstalled()` invokes `installMany` with exactly `BUNDLED_PLUGIN_IDS`, swallows thrown errors, and resolves `void`.
- **`ipc-handlers.test.ts`** — `skills:uninstall` handler invoked with a bundled ID returns `{ ok: false, error: 'bundled' }` and does not invoke `skillProvider.uninstall`. Invoked with a non-bundled ID falls through to the existing path.

Android does not currently have a sibling test suite for `SessionService` message handlers; Android coverage is via the manual checklist below.

### Manual verification checklist

1. **Fresh install, desktop:** clear `~/.claude/plugins/` and `~/.claude/toolkit-state/` → launch app → wait for marketplace cache → both plugins appear in installed list → uninstall button is disabled with the bundled reason as hover tooltip.
2. **Partial-missing install, desktop:** install one plugin, manually remove the other from `installed_plugins.json` → relaunch → the missing one reinstalls, the other is untouched.
3. **Offline launch, desktop:** disconnect network → launch with clean state → no error surfaced, nothing installs → reconnect and relaunch → both install.
4. **Fresh install, Android:** fresh APK install → complete bootstrap and tier picker → open installed-skills panel → both plugins present → uninstall disabled.
5. **Force uninstall via IPC (desktop):** from devtools, call `window.claude.skills.uninstall('wecoded-themes-plugin')` → receive `{ ok: false, error: 'bundled' }`, plugin stays installed.
6. **Force uninstall via IPC (Android remote):** connect a remote browser → invoke uninstall for a bundled ID → same rejection response, plugin stays installed.

## Documentation updates

- **`docs/PITFALLS.md`** — add a new entry under "Plugin Installation & Claude Code Registries":
  > **Bundled plugin list is three-way duplicated.** `BUNDLED_PLUGIN_IDS` lives in `desktop/src/shared/bundled-plugins.ts`, `desktop/src/renderer/config/bundled-plugins.ts`, and `app/.../skills/BundledPlugins.kt`. All three must stay in sync. Changing the list requires an app release; it is intentionally not marketplace-driven.
- **`docs/shared-ui-architecture.md`** — no change. The bundled-plugins list is a minor addition, not a new architectural layer.
- **No new rule file.** The parity requirement lives in PITFALLS alongside the existing `preload.ts` / `remote-shim.ts` / `SessionService.kt` parity notes.

## Out of Scope

- An opt-out preference ("let me uninstall these anyway") — explicitly declined.
- Marketplace-driven bundled list — explicitly declined; revisit only if the bundled list grows beyond ~3 plugins or needs release-independent rollout.
- Auto-updating bundled plugins. They follow the same update rules as other installed plugins (whatever those are; out of scope here).
- Migrating existing users' favorites to include these plugins. Favoriting stays user-owned.
