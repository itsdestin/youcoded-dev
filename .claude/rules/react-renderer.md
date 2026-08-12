---
paths:
  - "youcoded/desktop/src/renderer/**"
last_verified: 2026-07-17
verify:
  - path: youcoded/desktop/src/renderer/App.tsx
  - path: youcoded/desktop/src/renderer/components/HeaderBar.tsx
    contains: "showCaptionButtons"
  - path: youcoded/desktop/src/renderer/components/overlays/Overlay.tsx
  - path: youcoded/desktop/src/renderer/styles/globals.css
    contains: "chrome-glass"
  - path: youcoded/desktop/src/renderer/components/RemoteSnapshotExporter.tsx
  - path: youcoded/desktop/src/renderer/hooks/useSessionAttention.ts
    contains: "useSyncExternalStore"
  - path: youcoded/desktop/src/renderer/components/ui/Button.tsx
    contains: "mergeClasses"
  - test: youcoded/desktop/src/renderer/components/ui/Button.test.tsx
  - test: youcoded/desktop/tests/primitive-adoption.test.ts
  - test: youcoded/desktop/tests/overlay-layer-authority.test.ts
  - test: youcoded/desktop/tests/drawer-card-glass.test.ts
  - test: youcoded/desktop/tests/type-scale-authority.test.ts
  - path: youcoded/desktop/src/renderer/dev/workbench/mock-shim.ts
    contains: "MOCK_ONLY|HAND_WRITTEN"
  - test: youcoded/desktop/tests/workbench-mock-contract.test.ts
---
# React Renderer (shared desktop + Android WebView)

This code runs in BOTH the Electron renderer AND a bundled Android WebView. **Depth + why per bullet: `youcoded/docs/renderer-chrome.md`; overlay layer system: `youcoded/docs/shared-ui-architecture.md`.**

## Node vs browser boundary
- **No `process.env`, `require()`, `fs`/`path`/`os`, or direct filesystem access** — the WebView has no Node. Go through `window.claude.*`; use ES `import`, browser APIs, `fetch`.
- **Platform detection: `location.protocol === 'file:'` = Android** — use the `remote-shim.ts` helpers, not the check inline.
- **Perf:** prefer `content-visibility: auto` over virtualization; memoize every Context value; the reducer preserves `toolCalls`/`toolGroups` Map refs — don't clone them.
- **Render-path chat state goes through a cached selector, never the whole map.** `state/chat-context.ts` is a `useSyncExternalStore` store: `useChatState(id)` for one session; cached-selector hooks (`useSessionAttention`, `useActiveSessionModel`) for derived values. **`useChatStateMap()` is banned on the render path** (sole sanctioned caller: `RemoteSnapshotExporter`); **never `store.getState()` during render** (tears — add a selector).

## Framed shell & chrome-glass (`globals.css`, `App.tsx`)
- **ONE backdrop-filter, ever** — the frame chrome is a single `<div class="chrome-glass">` clipped via `clip-path: polygon()`; per-element backdrop-filters seam at non-100% zoom.
- **`destination-out` is NOT a valid `mix-blend-mode`** — silently ignored (black chat area). Cut shapes with `clip-path`.
- **`chrome-glass` is `display:none` in floating-chrome modes**; `.chrome-wrapper` must stay `background: transparent !important`; drawer-pane sits ABOVE chrome-glass (`z-index:11`).
- **Compound attribute selectors must be same-element:** `data-wallpaper` is on `<html>`, `data-chrome-style` on `<body>` — descendant combinator, never `[a][b]`.
- **The right slot holds EITHER the artifact drawer OR the games panel** — both read `var(--right-pane-width)`; `chrome-glass--drawer-open` gates on `activeDrawerOpen || gameState.panelOpen`. Don't hardcode the width.

## Theme color contrast (`desktop/scripts/audit-theme-contrast.mjs`; CI `wecoded-themes/scripts/audit-contrast.mjs`)
- **`panel` vs `canvas` ≥ 1.07:1**; `fg`/`fg-2` ≥4.5, `fg-dim`/`fg-muted` ≥3, `fg-faint` ≥1.8; `on-accent` vs `accent` ≥4.5.
- **chat-pane bg == drawer-pane bg (both `--canvas`)** — change them in the SAME edit; the audit doesn't catch a mismatch.

## Header bar (`HeaderBar.tsx`)
- **No `min-w-0` on the left cluster** (collapses below the gear's `shrink-0`); put it on an individual child. Layout is SPACE-aware (`packSessions()` + ResizeObserver) — no `@media`/`window.innerWidth`.
- **`showCaptionButtons` must include Linux** — frameless on BOTH; gate window-chrome on "not macOS", NEVER `navigator.platform === 'Win32'`. Announcement lives in StatusBar, not HeaderBar.

## Control primitives (`components/ui/`)
- **Every control goes through its primitive** — never hand-roll `bg-accent text-on-accent`; a caller's `className` REPLACES base tokens per conflict group via `mergeClasses`. Guard `primitive-adoption.test.ts` also fails on a primitive with NO call site.
- **Padding groups are per-axis** (`px-`/`py-` independent; `p-N` in ALL groups) — an `px-`-only override must NOT drop `py-` · guard: `Button.test.tsx` if you touch `CONFLICT_GROUPS`.

## Overlays (`components/overlays/Overlay.tsx`)
- **Use `<Scrim>` + `<OverlayPanel>`** (or `.layer-surface` for scrimless popovers) — never hardcode scrim/blur/shadow/radius/z-index; pick a LAYER (L1 drawers / L2 popups / L3 destructive / L4 system). `SessionStrip` at `z-[9000]` is load-bearing. Glassmorphism is var-driven.
- **`.layer-surface` on a REPEATED element (grid tile, list row) is a paint bug** — N tiles = N backdrop-filters, and Windows Electron drops their paint per card (shipped twice: `516411a5`, `1f68a7f0`) · guard: `drawer-card-glass.test.ts`.

## Remote access state sync (`main/remote-server.ts`, `RemoteSnapshotExporter.tsx`)
- **Remote clients hydrate via `chat:hydrate` on connect** — no parallel replay buffer; extend `serializeChatState`/`deserializeChatState` instead. `chat:export-snapshot` has a 2s timeout.
- **`attentionState` is authoritative on DESKTOP only** — remote browsers get `attentionMap` via `status:data` and MUST NOT run their own classifier. The shim's `attentionMap` diff is load-bearing. `RemoteSnapshotExporter` is Electron-only by design.

## UI iteration tooling
- **Building or redesigning UI? Use `bash scripts/run-workbench.sh`** (real renderer, fake `window.claude`, port 5233); `run-dev.sh` only for real event ordering/PTY/main-process behaviour. Unbacked channels go in `mock-shim.ts`'s `MOCK_ONLY`; review under `stress`/`empty` + latency. **After ANY shim change run `node scripts/workbench-boot-check.mjs`.** Depth: `docs/archive/specs/2026-07-29-ui-workbench-design.md`.
