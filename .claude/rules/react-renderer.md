---
paths:
  - "youcoded/desktop/src/renderer/**"
last_verified: 2026-07-15
verify:
  - path: youcoded/desktop/src/renderer/App.tsx
  - path: youcoded/desktop/src/renderer/components/HeaderBar.tsx
    contains: "showCaptionButtons"
  - path: youcoded/desktop/src/renderer/components/overlays/Overlay.tsx
  - path: youcoded/desktop/src/renderer/styles/globals.css
    contains: "chrome-glass"
  - path: youcoded/desktop/src/renderer/components/RemoteSnapshotExporter.tsx
---

# React Renderer (shared desktop + Android WebView)

This code runs in BOTH the Electron renderer AND a bundled Android WebView. **Chrome/theme/overlay depth: `youcoded/docs/renderer-chrome.md`; overlay layer system: workspace `docs/shared-ui-architecture.md`.**

## Node vs browser boundary
- **No `process.env`, `require()`, `fs`/`path`/`os`, or direct filesystem access** — the WebView has no Node runtime. Go through `window.claude.*` (from `remote-shim.ts`); use ES `import`, browser APIs, `fetch`.
- **Platform detection: `location.protocol === 'file:'` = Android.** Use `remote-shim.ts` helpers, not the check inline.
- **Perf:** prefer `content-visibility: auto` over virtualization (keeps find-in-page + a11y); memoize every Context value (`useMemo`), split contexts by change frequency. The chat reducer preserves `toolCalls`/`toolGroups` Map refs when unchanged so `React.memo` works — don't clone them needlessly.

## Framed shell & chrome-glass (`globals.css`, `App.tsx`)
- **ONE backdrop-filter, ever.** The whole frame chrome is a single `<div class="chrome-glass">` clipped to a donut via `clip-path: polygon()`. Per-element `backdrop-filter` on HeaderBar/InputBar/StatusBar/frame-edge/frame-divider/drawer-pane creates anti-aliased compositing seams at non-100% zoom — don't reintroduce them in framed-chrome mode.
- **`destination-out` is NOT a valid `mix-blend-mode`** (it's a Porter-Duff compositing op) — the browser silently ignores it and paints the cutout's `background:black` through (black chat area). Use `clip-path` to cut a shape.
- **`chrome-glass` is `display:none` in floating-chrome modes** (`chrome-style='floating'` or `input-style='floating'`) — HeaderBar/InputBar/StatusBar paint their own pills; mirror that gating for any new "always-floating" element. `.chrome-wrapper` must be `background: transparent !important` (the bottom wrapper at z-20 sits above chrome-glass at z-10). drawer-pane sits ABOVE chrome-glass via `z-index:11`.
- **Compound attribute selectors must be same-element:** `data-wallpaper` is on `<html>`, `data-chrome-style` on `<body>` — use a DESCENDANT combinator, never `[a][b]` (never matches).
- **Right slot holds EITHER the artifact drawer OR the games panel** — both read `var(--right-pane-width)`; they're mutually exclusive; `chrome-glass--drawer-open` gates on `activeDrawerOpen || gameState.panelOpen`. Don't hardcode the pane width in either place.

## Theme color contrast (`desktop/scripts/audit-theme-contrast.mjs`; CI `wecoded-themes/scripts/audit-contrast.mjs`)
- **`panel` vs `canvas` ≥ 1.07:1** (below it the frame disappears). Text on canvas: `fg`/`fg-2` ≥4.5, `fg-dim`/`fg-muted` ≥3, `fg-faint` ≥1.8. User bubble `on-accent` vs `accent` ≥4.5.
- **chat-pane bg == drawer-pane bg (both `--canvas`)** — change them in the SAME edit (the audit doesn't catch a mismatch).

## Header bar (`HeaderBar.tsx`)
- **Do NOT add `min-w-0` to the left cluster** (it collapses below the gear's `shrink-0`, letting SessionStrip paint over it). Put `min-w-0` on an individual child instead. Layout is SPACE-aware (`packSessions()` + ResizeObserver, measured `clientWidth`), NOT viewport-aware — no `@media`/`hidden sm:`/`window.innerWidth`.
- **`showCaptionButtons` must include Linux, not just Windows** — the window is frameless on BOTH; gate window-chrome on "not macOS" (`!isMac && !isAndroid() && !isRemoteMode()`), NEVER `navigator.platform === 'Win32'` (excludes Linux). Chat/terminal toggle placement is platform-conditional (right on macOS, left on Win/Linux). Announcement lives in StatusBar, not HeaderBar.

## Overlays (`components/overlays/Overlay.tsx`)
- **Use `<Scrim>` + `<OverlayPanel>`** (or `.layer-surface` for scrimless popovers) — never hardcode `bg-black/40`, `backdrop-blur-sm`, `shadow-xl`, `rounded-xl`, or arbitrary z-index. Pick a LAYER (L1 drawers / L2 popups / L3 destructive / L4 system), not a z-index. `SessionStrip` at `z-[9000]` is load-bearing (`.header-bar` backdrop-filter traps lower values) — don't "fix" it. Glassmorphism is var-driven (`--panels-blur`/`--panels-opacity`). See `docs/shared-ui-architecture.md`.

## Remote access state sync (`main/remote-server.ts`, `RemoteSnapshotExporter.tsx`)
- **Remote clients hydrate via `chat:hydrate` on connect** (`replayBuffers()` → `requestChatSnapshot()` → serialized `ChatState`) — don't add a parallel replay buffer; extend `serializeChatState`/`deserializeChatState` in `state/chat-types.ts` instead. The `chat:export-snapshot` has a 2s timeout (resolves `{sessions:[]}`).
- **`attentionState` is authoritative on DESKTOP only** — `useAttentionClassifier` reads the xterm buffer (Electron only). Remote browsers get it via `attentionMap` in `status:data` and MUST NOT run their own classifier (CLI-version regex would drift). The shim diffs `attentionMap` vs `prevAttentionRef` before dispatching — the diff is load-bearing. `RemoteSnapshotExporter` is Electron-only by design (short-circuits on remote).
