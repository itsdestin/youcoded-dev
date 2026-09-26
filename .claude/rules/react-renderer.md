---
paths:
  - "**/desktop/src/renderer/**"
last_verified: 2026-09-23
verify:
  - path: youcoded/desktop/src/renderer/App.tsx
  - path: youcoded/desktop/src/renderer/components/HeaderBar.tsx
    contains: "showCaptionButtons"
  - path: youcoded/desktop/src/renderer/components/overlays/Overlay.tsx
  - path: youcoded/desktop/src/renderer/styles/globals.css
    contains: "chrome-glass"
  - path: youcoded/desktop/src/renderer/components/RemoteSnapshotExporter.tsx
  - path: scripts/shoot/shoot.mjs
    contains: "not showing"
  - path: scripts/ui-review/shot.mjs
    contains: "identical to baseline"
  - path: youcoded/desktop/src/renderer/components/ui/Button.tsx
    contains: "mergeClasses"
  - test: youcoded/desktop/src/renderer/components/ui/Button.test.tsx
  - test: youcoded/desktop/tests/primitive-adoption.test.ts
  - path: scripts/ast-grep/rules/no-hardcoded-z-index-or-scrim.yml
  - test: youcoded/desktop/tests/drawer-card-glass.test.ts
  - path: scripts/ast-grep/rules/no-arbitrary-text-size.yml
  - path: youcoded/desktop/src/renderer/dev/workbench/mock-shim.ts
    contains: "MOCK_ONLY|HAND_WRITTEN"
  - test: youcoded/desktop/tests/mock-shim-window.test.ts
---
# React Renderer (shared desktop + Android WebView)

This code runs in BOTH the Electron renderer AND a bundled Android WebView. **Depth + why per bullet: `youcoded/docs/renderer-chrome.md`; overlay layer system: `youcoded/docs/shared-ui-architecture.md`.**

## Node vs browser boundary
- **No `process.env`, `require()`, `fs`/`path`/`os`, or direct filesystem access** — the WebView has no Node. Go through `window.claude.*`; use ES `import`, browser APIs, `fetch`.
- **Platform detection: `location.protocol === 'file:'` = Android** — use the `remote-shim.ts` helpers, not the check inline.
- **Performance** (subscriptions, hidden tabs, per-event cost, layout/paint): `performance.md`; lists and timelines: `renderer-lists.md`.

## Framed shell & chrome-glass (`globals.css`, `App.tsx`)
- **ONE backdrop-filter, ever** — the frame chrome is a single `<div class="chrome-glass">` clipped via `clip-path: polygon()`; per-element backdrop-filters seam at non-100% zoom.
- **`destination-out` is NOT a valid `mix-blend-mode`** — silently ignored (black chat area). Cut shapes with `clip-path`.
- **`chrome-glass` is `display:none` in floating-chrome modes** (`'float'` instead collapses its clip-path — depth doc); `.chrome-wrapper` stays `background: transparent !important`; drawer-pane sits ABOVE chrome-glass (`z-index:11`).
- **Blur only through theme-engine's glass sheet**, never a static `backdrop-filter` — else Reduced effects can't remove it · guard: `float-chrome-pops.test.ts`.
- **Compound attribute selectors must be same-element:** `data-wallpaper` is on `<html>`, `data-chrome-style` on `<body>` — descendant combinator, never `[a][b]`.
- **The right slot holds EITHER the artifact drawer OR the games panel** — both read `var(--right-pane-width)`; `chrome-glass--drawer-open` gates on `activeDrawerOpen || gameState.panelOpen`. Don't hardcode the width.

## Theme color contrast (`desktop/scripts/audit-theme-contrast.mjs`; CI `wecoded-themes/scripts/audit-contrast.mjs`)
- **Surface/text/accent thresholds are BLOCKING CI** (`audit-contrast.mjs`) — the numbers live in the depth doc; you cannot violate them silently.
- **chat-pane bg == drawer-pane bg (both `--canvas`)** — change them in the SAME edit; the audit does NOT catch this one.
- **Status colour == `StatusDot.tsx` STATUS_LABEL** (green *Working*, blue *Response Ready*), and it goes in the ring/tint, NEVER the word — fixed across themes, so as text it fails the pale ones · depth doc → "Status colours".

## Header bar (`HeaderBar.tsx`)
- **No `min-w-0` on the left cluster** (collapses below the gear's `shrink-0`); put it on an individual child. Layout is SPACE-aware (`packSessions()` + ResizeObserver) — no `@media`/`window.innerWidth`; viewport branches only via `useNarrowViewport()`.
- **`showCaptionButtons` must include Linux** — frameless on BOTH; gate window-chrome on "not macOS", NEVER `navigator.platform === 'Win32'`. Announcement lives in StatusBar, not HeaderBar.

## Control primitives (`components/ui/`)
- **Every control goes through its primitive** — never hand-roll `bg-accent text-on-accent`; a caller's `className` REPLACES base tokens per conflict group via `mergeClasses`. Guard `primitive-adoption.test.ts` also fails on a primitive with NO call site.
- **Padding groups are per-axis** (`px-`/`py-` independent; `p-N` in ALL groups) — an `px-`-only override must NOT drop `py-` · guard: `Button.test.tsx` if you touch `CONFLICT_GROUPS`.
- **Chrome is unselectable** (`<button>`s/`select-none` roots; content buttons add `select-text`) · guard: ast-grep `chrome-root-select-none-*`/`file-name-button-select-text` (classes), `unselectable-chrome.test.ts` (CSS).

## Overlays (`components/overlays/Overlay.tsx`)
- **Use `<Scrim>` + `<OverlayPanel>`** (or `.layer-surface` for scrimless popovers) — never hardcode scrim/blur/shadow/radius/z-index; pick a LAYER (L1–L4). `SessionStrip` `z-[9000]` is load-bearing; glassmorphism is var-driven.
- **`.layer-surface` on a REPEATED element (grid tile, list row) is a paint bug** — N tiles = N backdrop-filters, and Windows Electron drops their paint per card (shipped twice: `516411a5`, `1f68a7f0`) · guard: `drawer-card-glass.test.ts`.

## Remote access state sync (`main/remote-server.ts`, `RemoteSnapshotExporter.tsx`)
- **Remote clients hydrate via `chat:hydrate` on connect** — no parallel replay buffer; extend `serializeChatState`/`deserializeChatState` instead. `chat:export-snapshot` has a 2s timeout.
- **`attentionState` is authoritative on DESKTOP only** — remote browsers get `attentionMap` via `status:data` and MUST NOT run their own classifier. App's `statusData` handler's `attentionMap` diff is load-bearing.
