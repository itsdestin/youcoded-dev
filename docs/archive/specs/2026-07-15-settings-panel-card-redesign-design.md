---
status: shipped
---

# Settings Panel Card Redesign — Design

**Date:** 2026-07-15
**Status:** Approved design, pre-implementation
**Scope:** Desktop (Electron + React renderer); shared components mean Android settings pick up the same change automatically

## Summary

Flatten the Settings panel from grouped sections (uppercase `<h3>` headers like "Appearance", "Buddy", "Sound", "Performance", "Sync", "Other", "Account", "Backup & Sync", "Model Providers", "Remote Access", "Package Tier" etc.) into a single uniform list of cards. Every card gets the same shape: an icon, a static title, and a lighter-weight subtitle line showing the current value or a short description — matching the existing "Defaults" / "Development" cards, which already follow this format.

Extract the repeated row markup (icon + title + subtitle + chevron, currently copy-pasted ~12 times) into one shared `SettingsRow` component so future consistency changes are a single edit instead of a dozen.

Replace the Buddy Floater checkbox with a row+popup following the same click-to-open pattern as every other setting, using a new simple outline icon (not the full mascot illustration).

## Goals

- Visual and structural consistency across every row in the Settings panel.
- Eliminate ~12 duplicated copies of the row markup.
- Buddy Floater matches the interaction pattern of every other setting (row → popup with the actual control), instead of being the one native-checkbox outlier.

## Non-goals

- No new settings, no behavior changes to any existing setting beyond Buddy Floater's interaction shape.
- No change to popup *internals* (Sound's volume/preset controls, Remote Access's Tailscale flow, Sync's add/edit flows, etc.) — only the outer row shell and section headers change.
- No Android-specific redesign — the affected components (`AccountSection`, `ThemeButton`, `PerformanceButton`, `SyncSection`, `DefaultsButton`) are shared, so Android inherits the flattened layout for free. Android-only rows (`TierSelector`, `ConnectToDesktopButton`) get the same `SettingsRow` treatment for consistency.

## Current state

Every top-level row in `SettingsPanel.tsx` (plus `AccountSection.tsx`, `SyncPanel.tsx`, `ModelProvidersPopup.tsx`, `PerformanceButton.tsx`) follows the identical pattern:

```tsx
<section>
  <h3 className="text-[10px] font-medium text-fg-muted tracking-wider uppercase mb-3">Label</h3>
  <button onClick={() => setOpen(true)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-inset/50 hover:bg-inset transition-colors text-left">
    <div className="flex items-center justify-center shrink-0" style={{ width: 32, height: 20 }}>{/* icon */}</div>
    <div className="flex-1 min-w-0">
      <span className="text-xs text-fg font-medium">Title</span>
      <p className="text-[10px] text-fg-muted">Subtitle</p>
    </div>
    <svg className="w-3.5 h-3.5 text-fg-muted shrink-0" ...>{/* chevron */}</svg>
  </button>
  {open && createPortal(<Popup />, document.body)}
</section>
```

Confirmed instances of this pattern (all get the header stripped, all get `SettingsRow` swapped in):

- `SettingsPanel.tsx`: Appearance (`ThemeButton`), Buddy (`BuddyToggle` — different shape, see below), Sound (`SoundButton`), Remote Access (`RemoteButton`), the "Other" wrapper around `DefaultsButton` + Development + Keyboard Shortcuts + Donate + About, and Android's Package Tier (`TierSelector`) + "Other" wrapper.
- `AccountSection.tsx`: Account.
- `SyncPanel.tsx`: Backup & Sync (has an extra `{badge}` element between subtitle and chevron).
- `ModelProvidersPopup.tsx`: Model Providers.
- `PerformanceButton.tsx`: Performance (currently titled "Graphics").

`BuddyToggle` (`SettingsPanel.tsx` ~line 673) is the one outlier — a native `<label><input type="checkbox"></label>` instead of the button+popup pattern, with its own `<h3>Buddy</h3>` header.

`DesktopSettings` and `AndroidSettings` wrap all these `<section>`s in an outer `space-y-6` list — that spacing exists to separate header-groups and needs to become a flat `space-y-2` (the spacing "Other"'s inner rows already use).

## New shared component: `SettingsRow`

New file: `src/renderer/components/SettingsRow.tsx` (own file, not inside `SettingsPanel.tsx`, since `SettingsPanel.tsx` imports `AccountSection`/`SyncPanel`/`ModelProvidersPopup`/`PerformanceButton` — putting it in `SettingsPanel.tsx` would create a circular import).

```tsx
interface SettingsRowProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onClick: () => void;
  rightAccessory?: React.ReactNode; // e.g. Backup & Sync's status badge
}
```

Presentational only — renders the button/icon-slot/title/subtitle/chevron markup above, nothing else. Every row component keeps owning its own `open` state, outside-click handling, and popup exactly as today; only the outer shell swaps to `<SettingsRow ... />` + the existing popup as siblings (wrapped in a `<>` fragment, no `<section>`).

## Per-row title/subtitle mapping

Rows that already have a static label + dynamic value only need the header stripped. Three rows currently use the dynamic value *as the title* (no separate label) and get restructured:

| Row                                                      | Title (before → after)                     | Subtitle (before → after)                                                                                                                        |
| -------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Account                                                  | Account (unchanged)                        | "Signed in as @x" / "Sign in to like themes, rate plugins, and play games" (unchanged)                                                           |
| Appearance                                               | theme name → **"Appearance"**              | *(none)* → **theme name**, e.g. "Golden Daybreak"                                                                                                |
| Buddy Floater                                            | "Show buddy floater" → **"Buddy Floater"** | description text → **"Enabled" / "Disabled"**                                                                                                    |
| Sound                                                    | "Notifications" → **"Sound"**              | volume % / "Muted" (unchanged)                                                                                                                   |
| Performance                                              | "Graphics" → **"Performance"**             | state label, e.g. "Power saving" (unchanged)                                                                                                     |
| Backup & Sync                                            | unchanged                                  | unchanged (badge accessory unchanged)                                                                                                            |
| Model Providers                                          | unchanged                                  | unchanged                                                                                                                                        |
| Remote Access                                            | status text → **"Remote Access"**          | *(n/a)* → **status text**, e.g. "Connected · 2 clients · Tailscale" (folds in the separate "Tailscale" tag currently rendered next to the title) |
| Package Tier (Android)                                   | unchanged                                  | unchanged                                                                                                                                        |
| Connect to Desktop (Android)                             | unchanged                                  | unchanged                                                                                                                                        |
| Defaults, Development, Keyboard Shortcuts, Donate, About | unchanged                                  | unchanged                                                                                                                                        |

## Buddy Floater row

Converts `BuddyToggle` from a checkbox+label to the same row-opens-popup pattern as Sound/Theme/Remote — inline in `SettingsPanel.tsx` (not a separate file; it's one toggle, doesn't warrant Performance's two-file split).

**Icon:** a new, small outline SVG glyph defined inline in `SettingsPanel.tsx` — stroke-based, `currentColor`, `viewBox="0 0 24 24"`, sized `w-4 h-4` to match every other row's icon. A simplified/abstracted mascot silhouette (rounded head shape + minimal face), matching the visual language of the Performance chip glyph and Theme swatches — explicitly NOT the full mascot illustration (`WelcomeAppIcon`/`AppIcon`/`ThemeMascot`), which is too detailed for a 16px monochrome row icon and would pull in theme-swappable art where a plain settings glyph is wanted.

**State:** unchanged — `localStorage['youcoded-buddy-enabled']`, `window.claude.buddy.show()/hide()`.

**Popup:** small centered modal (same portal/Scrim/outside-click pattern as `SoundButton`), header "Buddy Floater", one row with the shared `Toggle` pill control, and the description text ("A small always-on-top mascot that stays visible even when the app is minimized.") moved down into the popup body.

## Layout change

`DesktopSettings` and `AndroidSettings`: replace `<div className="flex-1 px-4 py-4 space-y-6">` (wrapping `<section>`-per-group) with `<div className="flex-1 px-4 py-4 space-y-2">` (flat list of rows, no groups, no `<section>` wrappers). The "Other" `<section>`/`<h3>Other</h3>` wrapper is deleted entirely — its rows (`DefaultsButton`, Development, Keyboard Shortcuts, Donate, About) become plain top-level rows in the same flat list.

## Testing / verification

Pure UI restructuring, no new IPC or state — verify by running `bash scripts/run-dev.sh` and visually checking both the Desktop settings drawer and (if convenient) Android's WebView-rendered settings for: uniform card spacing, no leftover section headers, Buddy Floater toggling correctly (state persists, `window.claude.buddy.show/hide` still fires), and Backup & Sync's status badge still renders in its row.
