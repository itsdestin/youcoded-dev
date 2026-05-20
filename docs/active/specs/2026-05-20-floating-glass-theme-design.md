# Floating Glass Theme — Design

**Status:** Draft for review
**Owner:** Destin
**Date:** 2026-05-20
**Scope:** Desktop only (Windows, macOS, Linux). Android falls back to solid canvas.

## Summary

A new YouCoded theme called **Floating Glass** that uses the user's active OS desktop wallpaper as the app's background image, strips every outer-chrome container, and renders only the small interactive widgets as glass cards floating over the wallpaper.

## Goals

- The app *looks* like it's floating over the user's desktop wallpaper.
- Every "container" backdrop (header bar wrapper, status bar wrapper, input bar wrapper, chrome wrappers, app-shell canvas) is invisible.
- The remaining UI elements — session strip, individual status pills + quick chips, input text field, window control buttons, chat/terminal toggle, chat bubbles — render as small glass cards with backdrop blur.
- Ships as a single new theme that users select from the existing theme picker.

## Non-goals

- **True Electron window transparency.** The `BrowserWindow` stays constructed with its current solid config. The OS wallpaper is *lifted* (copied as the app's background image), not punched through. Trade-off accepted: dragging the window drags the wallpaper image with it.
- **Live wallpaper tracking.** Wallpaper is read once on theme activation and cached for the session. Changing the OS wallpaper while the app is running does not refresh until the theme is reselected or the app restarts.
- **Android parity.** Android renders the theme with a solid `--canvas` color fallback. No Android `WallpaperManager` integration in v1.
- **Multi-monitor screen-position tracking.** The wallpaper image is rendered the same regardless of which monitor / which part of the screen the window is on.

## User experience

When the user selects the Floating Glass theme:

1. The desktop wallpaper appears as the background of the YouCoded window.
2. The header strip area looks empty except for the session pill, the chat/terminal toggle (its position varies by OS — left cluster on Win/Linux, right cluster on macOS), and the window control buttons (Win/Linux only — macOS has native traffic lights).
3. The chat scrollback area shows user/assistant bubbles as small glass cards floating over the wallpaper, with no container backdrop behind them.
4. The status bar area looks empty except for the individual status pills and quick chips, each one its own small glass card.
5. The input area looks empty except for the text input field itself (with its glass backdrop) — no wider input-bar container backdrop.

If wallpaper detection fails for any reason (unsupported Linux DE, registry read error, sandboxing issue), the theme falls back to its solid `--canvas` color. The user still gets the chrome-stripped layout; they just don't see their wallpaper.

## Architecture

The feature is a theme + a small Electron-main capability behind it. The theme can't read the OS wallpaper on its own, so a new IPC is required.

### Electron main: wallpaper reader

**New file:** `youcoded/desktop/src/main/wallpaper-reader.ts`

Exports a single function:

```ts
export async function getSystemWallpaperPath(): Promise<string | null>
```

Per-platform implementation:

| Platform | Method | Notes |
|----------|--------|-------|
| macOS | `osascript -e 'tell app "System Events" to get picture of current desktop'` | Returns POSIX path. ~150–300ms first call; acceptable since one-shot. |
| Windows | Read registry `HKCU\Control Panel\Desktop\Wallpaper` via `child_process` + `reg query` | REG_SZ string. Slideshow users get the current `TranscodedWallpaper` path here. |
| Linux | Try GNOME first: `gsettings get org.gnome.desktop.background picture-uri`; then KDE: parse `~/.config/plasma-org.kde.plasma.desktop-appletsrc` for `Image=`; then return null. | XFCE / Cinnamon / sway / hyprland fall through to null in v1. |

Returns `file:///absolute/path/to/image` or `null`. All errors are caught and surface as `null` — never throws to the caller.

Result is cached in module scope for the lifetime of the main process. A `refreshSystemWallpaperPath()` export forces a re-read; not wired to any UI in v1 but available for future.

### IPC

**New channel:** `system:get-wallpaper-path` (request-response, no payload, returns `string | null`).

- `youcoded/desktop/src/main/ipc-handlers.ts`: `ipcMain.handle(IPC.SYSTEM_GET_WALLPAPER_PATH, ...)` calls `getSystemWallpaperPath()`.
- `youcoded/desktop/src/main/preload.ts`: expose `window.claude.system.getWallpaperPath(): Promise<string | null>`.
- `youcoded/desktop/src/renderer/remote-shim.ts`: parity stub returning `null` (remote browser has no OS wallpaper access).
- `youcoded/app/.../runtime/SessionService.kt`: parity handler returning `null` (Android renders solid fallback).

### Theme engine: new background source

**Edit:** `youcoded/desktop/src/renderer/themes/theme-engine.ts`

Extend the `background` manifest schema:

```ts
type ThemeBackground = {
  type: 'image' | 'gradient' | 'solid';
  value?: string;            // existing — asset path, gradient string, color
  source?: 'asset' | 'system-wallpaper';  // NEW — defaults to 'asset' for back-compat
  opacity?: number;
  'panels-blur'?: number;
  'panels-opacity'?: number;
  'bubble-blur'?: number;
  'bubble-opacity'?: number;
}
```

When `type === 'image'` AND `source === 'system-wallpaper'`:

1. Theme engine calls `window.claude.system.getWallpaperPath()`.
2. If a path is returned, it's used as the `background-image: url(...)` value on the `#theme-bg` div, same as any other image theme.
3. If `null` is returned, fall through to solid `--canvas` (the theme renders without the wallpaper but with all its other styling intact).
4. The `[data-wallpaper]` attribute is set on `<html>` (gating the existing glass CSS) only when a path was successfully resolved.

The IPC fetch is awaited during theme activation; the `#theme-bg` div renders with `null` background image until the path resolves (sub-second).

### The theme

**New directory:** `wecoded-themes/themes/floating-glass/`

Contents:
- `manifest.json` — the standard 15 color tokens, glass parameters, `background: { type: 'image', source: 'system-wallpaper' }`, and a `custom_css` block (below).
- `preview.png` — auto-generated by the existing Playwright preview pipeline. In CI there's no OS wallpaper, so the preview shows the solid `--canvas` fallback — that's acceptable; the preview communicates the *style* not a literal wallpaper.

Color palette: cool / neutral tones designed to look right over a wide range of wallpapers. Glass tints lean light with strong backdrop-blur. Final color choices made during implementation.

#### custom_css: strip outer containers

The chrome refactor is achieved via CSS, not by editing the React components. The strategy:

```css
/* App shell + chrome wrappers: transparent */
.app-shell { background: transparent !important; }
.chrome-wrapper { background: transparent !important; }

/* Header bar: kill outer container background, individual pills/buttons keep their own bg */
.header-bar { background: transparent !important; box-shadow: none !important; border: none !important; }

/* Status bar: kill outer floating-pill container, individual pills/chips keep their own bg */
/* (StatusBar.tsx renders a portal with `fixed inset-0` — we don't strip that; we strip the inner container) */

/* Input bar: kill wider container, keep the inner text field's glass bg */
.input-bar-container { background: transparent !important; border: none !important; box-shadow: none !important; }
```

The exact selectors will be confirmed during implementation by reading the current component output. If a component doesn't have a stable class to target (e.g., header bar's outer pill background comes from a Tailwind utility rather than a `.header-bar` rule), the implementation plan will adjust either:
- Add a stable class to the component (small edit to `HeaderBar.tsx` / `StatusBar.tsx` / `InputBar.tsx`), OR
- Use a `[data-theme="floating-glass"]` parent selector + structural CSS to target the right element.

Both options are acceptable; the choice is implementation detail.

### Validator update

**Edit:** `wecoded-themes/.github/workflows/validate-theme-pr.yml` (or the validator script it calls)

Add `source` as a recognized field on `background`. Without this, a community PR that tries to use `source: system-wallpaper` would be rejected by CI. In v1 we don't actively encourage community use of this field (it requires the app capability), but the schema should accept it.

## Behavior matrix

| Situation | Behavior |
|-----------|----------|
| Theme activated, wallpaper read succeeds | Wallpaper renders as background, glass effects apply. |
| Theme activated, wallpaper read fails / returns null | Solid `--canvas` color renders; chrome still stripped; app fully functional. |
| User changes OS wallpaper while app is open | Stale until theme reselect or app restart. (v1 limitation.) |
| User drags the window | Wallpaper drags with the window. (Accepted trade-off.) |
| Live / video / slideshow wallpapers | Static still frame renders (whatever path the OS exposes). |
| Multi-monitor | Wallpaper from current desktop renders (macOS) / single registry value (Windows) / single gsettings value (Linux). |
| Android | Solid `--canvas` fallback; chrome strip still applies. |
| Remote browser access | Solid `--canvas` fallback; chrome strip still applies. |

## Edge cases & risks

- **Linux DE coverage.** GNOME + KDE covers ~90% of likely users. XFCE / Cinnamon / sway / hyprland get the fallback. Acceptable; can extend later.
- **macOS sandbox / file:// access.** YouCoded isn't sandboxed in v1 (no App Store distribution), so reading a user's `~/Pictures/...` path via `file://` works. If we ever sandbox, this design needs revisiting (`security-scoped bookmark` or copy-to-app-container).
- **Windows registry `Wallpaper` empty during transitions.** If the user has slideshow enabled and the read hits during a transition, the value can momentarily be empty. Detection: empty string → return null → solid fallback. The user can reselect the theme to retry.
- **`osascript` startup cost on macOS.** ~150–300ms one-time. Done during theme activation; no perceptible delay.
- **CSS selector stability.** Tailwind utility classes are unstable across refactors. If the implementation needs structural CSS, prefer adding semantic classes to the component (`HeaderBar.tsx` etc.) rather than chaining attribute selectors. That keeps the theme robust against future refactors.

## Files affected

**New:**
- `youcoded/desktop/src/main/wallpaper-reader.ts`
- `wecoded-themes/themes/floating-glass/manifest.json`
- `wecoded-themes/themes/floating-glass/preview.png` (CI-generated)

**Edit:**
- `youcoded/desktop/src/main/ipc-handlers.ts` — add handler
- `youcoded/desktop/src/main/preload.ts` — expose `window.claude.system.getWallpaperPath()`
- `youcoded/desktop/src/renderer/remote-shim.ts` — parity stub returning null
- `youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` — parity stub returning null
- `youcoded/desktop/src/renderer/themes/theme-engine.ts` — resolve `source: 'system-wallpaper'`
- `youcoded/desktop/src/renderer/components/HeaderBar.tsx` / `StatusBar.tsx` / `InputBar.tsx` — minor stable-class additions if needed for CSS targeting (TBD during implementation; prefer not to edit if `custom_css` alone works)
- `wecoded-themes/.github/workflows/validate-theme-pr.yml` (or its script) — accept `source` on `background`

**Tests:**
- `youcoded/desktop/tests/wallpaper-reader.test.ts` — mocked per-platform paths
- `youcoded/desktop/tests/ipc-channels.test.ts` — parity entry for `system:get-wallpaper-path`

## Test plan

- Unit: `wallpaper-reader.test.ts` mocks `child_process.exec` and verifies per-platform commands + null fallback.
- IPC parity: `ipc-channels.test.ts` covers the new channel across preload, remote-shim, SessionService.
- Manual (dev): on CachyOS Plasma — set a wallpaper, run `bash scripts/run-dev.sh`, select Floating Glass theme, confirm wallpaper renders + chrome is stripped.
- Manual (Windows / macOS): later, when test machines are available. Until then, fallback path ensures the theme doesn't *break* on those platforms even if the wallpaper read fails.

## Open questions for review

- Final theme name (working: "Floating Glass"). Alternatives: "Liquid Glass", "Crystal", "Floating".
- Default glass parameters (panels-blur, panels-opacity) for first version. Will tune during implementation by eye on Destin's machine.
- Whether to ship a built-in light vs dark variant, or one neutral palette that works over both light and dark wallpapers. Recommendation: one neutral palette in v1.

---

**Next:** Once approved, hand off to `writing-plans` for an implementation plan.
