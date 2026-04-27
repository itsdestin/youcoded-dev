# Marketplace Mobile / Narrow-Viewport Responsive Design

**Date:** 2026-04-26
**Status:** Spec — pending implementation plan
**Scope:** `youcoded/desktop/src/renderer/components/marketplace/*` (renderer-only, no IPC, no platform code)

## Problem

The marketplace was designed desktop-first. On narrow viewports (Android phone, remote browser on phone, narrow desktop window in splitscreen) it visibly degrades:

- **Bottom catalog grid is 2-column at all widths < `md`.** On a 360px-wide phone, cards end up ~155px wide with `p-4` (16px) internal padding. Title + status badge collide on the header row, and the `line-clamp-2` blurb wraps to 4–5 words per line. Reads as "too zoomed in."
- **Top bar overflows.** `[AuthChip] Marketplace` on the left and `[Your Library] [Esc · Back to chat]` on the right blow past 360px. The "Esc · Back to chat" text is dead weight on touch — there's no Esc key on a phone.
- **Hero is 180px tall with `p-6` and `text-2xl`,** eating most of the first viewport before any browse content shows.
- **Filter bar wraps into 4–5 lines** because of 12 chips (Type×2 + Vibe×7 + Meta×3) + search, and it's `sticky top-0` so it permanently consumes a large fraction of the viewport while scrolling.

Rails (`min(280px, 85vw)`) are already correct on narrow and aren't touched.

## Strategy

**Pure-CSS responsive treatment, single component tree, breakpoint-driven.** No platform branching (`isAndroid`, etc.). The fix kicks in below `sm` (640px) regardless of platform — Android phone, remote browser on phone, narrow desktop window all get the mobile layout. ≥ 640px stays exactly as today.

Where structural DOM differs between modes (the card especially — vertical card vs. horizontal list row), a tiny `useNarrowViewport()` hook drives a `compact` prop. JS-detection is needed there because rendering both trees and hiding one with `sm:hidden` would double the React work.

## Files Touched

| File | Change |
|---|---|
| `MarketplaceScreen.tsx` | Top bar swap (Esc hint ↔ back arrow), wrapper `px-3 sm:px-4` already present; minor adjustments |
| `MarketplaceHero.tsx` | Compact variant via Tailwind responsive classes — pure CSS |
| `MarketplaceFilterBar.tsx` | `useNarrowViewport`-driven branch: collapsed bar + Filters button; new `FilterSheet` sub-component |
| `MarketplaceCard.tsx` | New `compact` prop. Renders list-row layout when true, vertical card when false |
| `MarketplaceGrid.tsx` | `useNarrowViewport`-driven: stacked `flex flex-col gap-2` at narrow, current grid at wide; passes `compact` to children |
| `hooks/use-narrow-viewport.ts` (new) | `matchMedia('(max-width: 639.98px)')` listener hook |
| `tests/use-narrow-viewport.test.ts` (new) | Hook unit test |

**Out of scope:**
- `MarketplaceRail.tsx` — already correct at `min(280px, 85vw)`.
- `MarketplaceDetailOverlay.tsx` — `inset-8 md:inset-16` is acceptable at narrow; internal density review is a separate task.
- Integration cards in the "Connect your stuff" rail — render via `MarketplaceCard` inside a rail (compact=false). The rail's per-child `!w-[min(360px,90vw)]` already keeps them readable.

## Section 1 — Top Bar

Two breakpoint variants in one tree:

```
< 640px:   [AuthChip] Marketplace ········ [Lib] [←]
≥ 640px:   [AuthChip] Marketplace ········ [Library] [Esc · Back to chat]
```

- The `Esc · Back to chat` button text wraps in `<span className="hidden sm:inline">…</span>`. A sibling `<span className="sm:hidden" aria-hidden>` shows `←` (Unicode left arrow). The button's `aria-label="Exit marketplace"` stays so screen readers narrate it correctly.
- `Your Library` button stays clickable. The visible label collapses to `Lib` below `sm` to keep the row to a single line on a 360-wide phone. `aria-label="Open Your Library"` is unchanged.
- Title `text-xl` stays — at 360px wide there's enough room.
- AuthChip is unchanged.

## Section 2 — Hero

Compact variant via responsive classes on the existing `MarketplaceHero` element. No JavaScript branch — all pure Tailwind responsive prefixes.

| Property | < 640px | ≥ 640px |
|---|---|---|
| `min-height` | 110px | 180px |
| padding | `p-4` | `p-6` |
| headline | `text-base` | `text-2xl` |
| blurb | `line-clamp-1` | (no clamp) |
| dot indicators | unchanged | unchanged |

The "View details" button keeps its current treatment.

## Section 3 — Filter Bar + Filter Sheet

### Sticky bar

Below 640px:

```
┌─ Sticky bar (narrow) ─────────────────────────┐
│  [🔍 Search…                ] [⚙ Filters•3]   │
└───────────────────────────────────────────────┘
```

- Search input takes the full row minus the button (flex-1 with min-w-0).
- "Filters" button shows a count badge `•N` when `N = (type ? 1 : 0) + vibes.size + meta.size`. Query is excluded — it's already visible in the search input.
- Tapping it opens `FilterSheet` (see below).

At 640px+ the chip bar renders exactly as today (no Filters button).

### `FilterSheet` (new sub-component, file-local)

Built on existing `<Scrim layer={2}>` + `<OverlayPanel layer={2}>` primitives — same shadow/blur/z-index treatment as `PreferencesPopup`. No new layering rules.

- **Positioning:** `fixed inset-x-2 bottom-2 max-h-[80vh] overflow-y-auto rounded-2xl`. Bottom-anchored so it reads as a sheet on touch but uses the same code path as a centered popup on tablets.
- **Body:** existing `<ChipGroup>` and `<Chip>` components, just stacked vertically (Type, Vibe, Meta) instead of inline.
- **Sticky header inside the sheet:** title `Filters`, "Clear all" link on the right (calls `onChange(emptyFilter())` and preserves the search query).
- **Footer:** single `Apply` button to dismiss. Chip toggles update the same `FilterState` live, so Apply is just a close affordance — matches the rest of the marketplace where filter changes are immediate.
- **Esc / scrim click** dismiss via existing `useEscClose`.
- **Behavior on viewport resize across breakpoint while open:** sheet stays open until explicitly dismissed; chip toggles continue to mutate the same `FilterState`.

Chip toggle handlers and `FilterState` shape are unchanged — the sheet is a different layout container for the same controls.

## Section 4 — Card List-Row Variant

`MarketplaceCard` gains a `compact?: boolean` prop. When `compact === true`, render as a row:

```
┌─ Compact list row (narrow, full viewport width) ───────┐
│  ┌──┐  Plugin Display Name              [Installed]    │
│  │🅰 │  Author                                          │
│  └──┘  One-line tagline truncated…       ★4.6 · 2.1k   │
└────────────────────────────────────────────────────────┘
```

### Layout

- **Outer:** `flex flex-row items-center gap-3 p-3 layer-surface`.
- **Left thumbnail (52×52, `rounded-md`, `shrink-0`):**
  - `iconUrl` set → render the icon (integrations).
  - Theme entry → `<img src={entry.preview}>` cropped to 52×52 via `object-cover`.
  - Otherwise → first letter of `displayName` on accent-tinted background (same fallback as `IntegrationDetailOverlay`).
- **Center column (`flex-1 min-w-0`):**
  - Title: `font-medium text-fg truncate`.
  - Author: `text-xs text-fg-dim truncate` (only if present).
  - Tagline: `text-sm text-fg-2 line-clamp-1`.
  - Metadata footer: rating + installs/likes on a single row (`text-xs text-fg-dim`).
- **Right column (`shrink-0 flex flex-col items-end gap-1`):**
  - Status pill (Installed / Update / Connected / Coming soon / etc.) — same logic as today, just positioned inline on the right rather than at the absolute corner.
  - For skills not yet installed, an inline install button (small download icon, 32×32 tap target). For installed/themes/integrations, no inline button — tapping the row opens detail.
  - "Local" theme indicator consolidates into the status pill (`Local` text instead of `Installed`). The (i) info-tooltip and "Plugin name" badge are wide-only — they'd clutter the row.

### Wide layout (compact = false)

Unchanged from today. Same JSX path, same classes, same `<InstallFavoriteCorner>`.

### Where `compact` comes from

`MarketplaceGrid` reads `useNarrowViewport()` and passes `compact` through to each child card. Calling sites in `MarketplaceScreen.tsx` (bottom catalog + search-mode grid) don't change. Rails always pass `compact = false` (omit the prop, default false).

## Section 5 — Grid Behavior

`MarketplaceGrid` becomes:

```jsx
const compact = useNarrowViewport();
return compact ? (
  <div className="flex flex-col gap-2">{cardsWithCompactProp}</div>
) : (
  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">{cards}</div>
);
```

The `dense` prop (which adds `panel-glass p-3 rounded-lg` on the outer wrapper) is preserved at both breakpoints — the wrapper styling is independent of the inner layout.

## Section 6 — `useNarrowViewport` Hook

```ts
// hooks/use-narrow-viewport.ts
import { useEffect, useState } from 'react';

const QUERY = '(max-width: 639.98px)';

export function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(false);  // false during SSR/initial mount
  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    setNarrow(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return narrow;
}
```

- Returns `false` initially, then updates on mount + on every viewport change.
- 639.98px (not 640px) avoids a 1px gap with Tailwind's `sm:` prefix which is `>= 640px`.
- Single source of truth for the JS-level breakpoint, used by `MarketplaceGrid` and `MarketplaceFilterBar` (where the DOM structure differs between modes). The top bar (Section 1) and hero (Section 2) use pure-CSS responsive classes and do NOT call this hook — they don't need it because the DOM is identical and only Tailwind utilities flip.

## Section 7 — Edge Cases

- **"Local" theme badge in list-row mode:** Right-column status pill shows `Local` instead of `Installed`. Wide-only (i) tooltip describes "not in marketplace, can't be re-downloaded" semantics.
- **Integration cards in the "Connect your stuff" rail:** Unchanged. Rails render full vertical `MarketplaceCard`s; per-child override `!w-[min(360px,90vw)]` keeps them readable on narrow.
- **Theme card without preview image:** Same first-letter fallback as skills.
- **FilterSheet open during a viewport resize across the breakpoint:** Sheet stays open; dismisses on Apply / Esc / scrim click as normal.
- **Hero rotation auto-advance (6s):** unchanged at narrow.

## Section 8 — Verification

1. **Unit test `useNarrowViewport`** — `youcoded/desktop/tests/use-narrow-viewport.test.ts`. Mock `matchMedia`, fire `change`, assert returned boolean tracks.
2. **Visual verification (mandatory before PR):**
   - **Desktop responsive:** `bash scripts/run-dev.sh`, open marketplace, resize window across 640px in both directions. Verify: top bar swaps, hero shrinks, grid switches between list rows and 2-col cards, Filters button appears/disappears, FilterSheet opens.
   - **Android:** `cd youcoded && ./scripts/build-web-ui.sh && ./gradlew assembleDebug && ./gradlew installDebug`. Same checks; verify FilterSheet bottom-sheet positioning reads correctly.
   - **Remote browser narrow:** open via DevTools device emulation at 360×640 and verify the same.
3. **Type/build:** `cd youcoded/desktop && npm test && npm run build`.

## Open Questions / Deferred

- **Marketplace detail overlay at narrow:** `inset-8 md:inset-16` is OK on phone; internal layout density is a separate task.
- **Integration rail cards being compact too:** the "Connect your stuff" rail keeps full vertical cards by design. Revisit if it ends up looking off in practice.
- **Per-card swipe-to-install gesture on touch:** not in scope; tap-to-open-detail is the primary affordance.
