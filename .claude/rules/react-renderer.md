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
  - path: youcoded/desktop/src/renderer/state/session-fill.ts
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
  - path: youcoded/desktop/src/renderer/platform.ts
    contains: "getCapabilities"
  - path: scripts/ast-grep/rules/no-arbitrary-text-size.yml
  - path: youcoded/desktop/src/renderer/dev/workbench/mock-shim.ts
    contains: "MOCK_ONLY|HAND_WRITTEN"
  - test: youcoded/desktop/tests/mock-shim-window.test.ts
---
# React Renderer (shared desktop + Android WebView)

This code runs in BOTH the Electron renderer AND a bundled Android WebView. **Depth + why per bullet: `youcoded/docs/renderer-chrome.md`; overlay layer system: `youcoded/docs/shared-ui-architecture.md`.**

## Node vs browser boundary
- **No `process.env`, `require()`, `fs`/`path`/`os`, or direct filesystem access** — the WebView has no Node. Go through `window.claude.*`; use ES `import`, browser APIs, `fetch`.
- **One platform module: `renderer/platform.ts`.** "Can this screen do X?" is `getCapabilities().x` (host-reported via `auth:ok`/preload — `shared/capabilities.ts`), never `isAndroid()`/`isRemoteMode()`; those two are for look-and-feel and connection state. Never test `location.protocol` inline.
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

## Remote access state sync (`main/session-open.ts`, `state/session-fill.ts`)
- **EVERY screen is filled by `session:open`** (a phone, a torn-off window, a reconnecting phone): the computer answers from its record with the newest page, its recent past (`before`) and what only memory holds (`after`), or only the events a reconnect missed (`have: {epoch, seq}`). `state/session-fill.ts` applies it through the SAME handlers a live push reaches — never a second set of rules for "drawing a filled session". Backfill new state by making it a numbered event or a record fact, not by copying a window's reducer. While a screen is filled its pushes for that session are held (`main/audience-fill.ts`).
- **A PHONE is sent only the conversations it WATCHES** (one-core R5-3): `session:open` starts a watch, `session:unwatch` ends it (`hooks/useRemoteWatch.ts`, `state/watch-set.ts`: the one on screen + two). Everything else reaches it as `session:summary` only, so a phone's dots, attention sound and "finished" chime read the summary (`statusFromSummary`; blue stays per-screen). A push a phone must hear for ANY conversation (a tag or note change) is `publish(..., {everyPhone: true})`; never rely on a phone having an unwatched conversation's events. The computer's windows are unaffected: they receive by ownership.
- **SHARED LINES AND LIVE FACTS ARE THE HOST'S, NOT EACH SCREEN'S** (one-core R5-4a): the queue of messages waiting on the computer, the model label, the "Model switched to ..." and "Conversation cleared" dividers, the compaction spinner and the terminal prompt cards arrive as numbered `session:live` events (`shared/session-live-types.ts`; Claude Code ones are read once in `main/session-live.ts`), are applied through `routeSessionLive` (the frame batcher, so order matches the transcript) and are held in the record for a screen that opens later. A screen must NOT also infer them: `capabilities.sessionRecord` is true everywhere except the Android app's own runtime, which has no record and still draws its own. The permission mode of a Claude Code session is likewise read in main (`session:permission-mode`), never scanned per screen. A card, and the "may be stuck" reading, are found by the COMPUTER's own headless copy of each running terminal (`main/session-screens.ts`, one-core R5-4b), so they are right with no computer window open and nothing a screen sends can create one (the R5-4a `session:prompt-report` channel is gone); only a host with no record keeps reading in its renderer (`useAttentionClassifier`, `usePromptDetector`, both over the shared `shared/stuck-tracker.ts` / `shared/prompt-card-reader.ts`). A host that sends no `sessionRecord` capability means false: that screen keeps inferring. Pinned by `tests/session-live-two-screens.test.ts` and, against the real captures, `tests/session-screens.test.ts`.
- **"May be stuck" has ONE writer, the computer's main process** (a numbered `session:live` `attention` event; `attentionMap` in `status:data` still carries a window's relayed state for the status bar). A screen must NOT run its own classifier wherever `capabilities.sessionRecord` is true. App's `statusData` handler's `attentionMap` diff is load-bearing.
- **A MESSAGE THE SCREEN SENDS CARRIES AN ID** (one-core R5-4b): `session:input` and `native:send` carry `sendId`; the computer's record notes the ids it received, and after a drop `hooks/useSendReconcile.ts` asks it (`session:send-outcomes`) about every bubble still waiting for its echo and says so ON the bubble ("Not sure this was sent" / "This didn't send" + Send again; a received one clears itself). Nothing is ever resent automatically. A new send path must go through `state/submit-outgoing.ts`. Pinned by `tests/send-reconcile.test.tsx`.
- **A PHONE'S BUTTONS ANSWER AT ONCE** (one-core R6-2): Stop, a permission answer (Yes / No / Always allow), Close, a native Send into an idle conversation and the permission-mode chip draw their change before the computer replies, all through the one helper `state/pending-action.ts` (`runPending`): the change is marked waiting; the computer's yes (a reply, or the record's own published state) drops the mark; a refusal undoes the change and says so in the computer's own words; a reply that never came leaves it WAITING until the reconnect's fills (`reconcilePending`) show what the record has. The helper holds only what this screen did and has not had confirmed, never a copy of session state, and never resends. Only where `isRemoteMode()`: the computer's own window and Android's own runtime keep the direct path. A new instant button goes through it. A drawn answer must not be drawn again by the computer's re-announce of the same ask (`state/permission-answer.ts`). Pinned by `tests/instant-buttons.test.tsx`.
