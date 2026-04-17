# Buddies Floater — Design

**Status:** design approved, awaiting implementation plan
**Date:** 2026-04-17
**Author:** brainstorming session (Destin + Claude)
**Scope:** Desktop MVP (Electron). Android deferred.

---

## 1. Motivation

Users often want YouCoded running in the background — Claude working on a task — while they focus on other apps. Today, seeing Claude's state or responding to a prompt requires un-minimizing the main app. A persistent, minimal floating companion (the "buddy") solves this by:

- Staying visible over other apps, even when YouCoded's main window is minimized
- Providing an ambient visual signal when any running session needs the user
- Opening a compact chat surface on click so the user can read, reply, and approve tools without switching windows
- Reusing the existing mascot, theme system, and chat state so the buddy feels native to YouCoded

This spec scopes a **mini-chat companion** MVP. Other modes (ambient-only, quick-send, full "build-your-own-buddy" configurability) are explicitly deferred to follow-on specs listed in §11.

---

## 2. Scope

### In MVP

- Two new transparent always-on-top Electron windows: **mascot window** (~80×80) and **chat window** (320×480).
- Mascot reuses active theme's `<ThemeMascot>` variants. Binary state signal: `idle` ↔ `shocked` when any session needs attention.
- Chat window shows a session pill (top), free-floating glass bubbles (middle), and an input pill (bottom). No window chrome.
- Session switcher in the pill — all running sessions listed; click to switch; `+ New session…` creates a session in the main app's strip.
- Buddy's viewed session is **independent** of main — switching main's active session does not affect buddy, and vice versa.
- Permission prompts (`Allow / Deny / Always`) render inline as compact pill buttons in the tool strip of the currently-viewed session.
- Slim attention strip at the bottom of buddy chat reflects the viewed session's `attentionState`.
- File attachments supported (reuses `<InputBar>`'s attach + paste + drag-drop behavior in `compact` mode).
- Drag to reposition both windows; positions persist across app restarts. Edge boundaries clamp to visible workArea so the mascot cannot disappear off-screen.
- Opt-in toggle in `SettingsPanel` (Appearance). Off by default. When enabled, buddy appears immediately and persists across launches.
- App quit behavior unchanged — closing the last main window quits the app; buddy dies with it.

### Deferred (see §11 for GH issues)

Screenshot → new session, global hotkey summon, tray-survival after main close, edge snapping, mode configurability (ambient / quick-send), Android parity, multiple concurrent buddies, crash auto-retry.

---

## 3. Architecture overview

### 3.1 Electron windows

Both buddy windows are spawned by the existing `createAppWindow` factory (`youcoded/desktop/src/main/main.ts`) with a new `buddy` variant for `BrowserWindowOptions`:

| Property | Mascot | Chat |
|----------|--------|------|
| `transparent` | true | true |
| `frame` | false | false |
| `resizable` | false | false |
| `alwaysOnTop` | `'screen-saver'` level | `'screen-saver'` level |
| `skipTaskbar` | true | true |
| `hasShadow` | false | false |
| Dimensions | 80×80 fixed | 320×480 fixed |

`screen-saver` is the highest reliable Electron always-on-top level for floating over minimized apps on Windows/Mac/Linux. Both windows use it so the chat is never hidden behind the mascot or by system UI when open. If this causes problems with OS dialogs in testing, the chat level can be lowered — not speccing a pre-emptive differentiation.

Both windows load the same Vite build via query param:

```
file:///…/index.html?mode=buddy-mascot
file:///…/index.html?mode=buddy-chat
```

### 3.2 Renderer mode routing

`App.tsx` branches on mount:

- no `mode` query param → full YouCoded app (current behavior)
- `mode=buddy-mascot` → `<BuddyMascotApp>` (minimal providers + `<BuddyMascot>`)
- `mode=buddy-chat` → `<BuddyChatApp>` (theme provider, reducer, `<BuddyChat>`)

Both buddy apps set `<body data-mode="buddy-mascot|buddy-chat">` so CSS can scope buddy-specific overrides without affecting main app styling.

### 3.3 Session subscription layer

`WindowRegistry` (`youcoded/desktop/src/main/window-registry.ts`) gains a `subscriptions: Map<sessionId, Set<windowId>>` alongside existing `ownership`. IPC routes that previously delivered only to the owner window now deliver to `owner ∪ subscribers`:

- `transcript:event`
- `pty:output`
- `hook:event` (permission requests, session init)
- `session:attention-changed`
- `SESSION_PROCESS_EXITED`

Two new IPC handlers:

- `buddy:subscribe(sessionId)` — adds the caller `webContents.id` to `subscriptions[sessionId]`; immediately responds with a `session:state-snapshot` (recent transcript events) so the buddy reducer catches up.
- `buddy:unsubscribe(sessionId)` — removes the caller from the set.

Subscriptions are tied to `webContents` lifetime — `webContents.on('destroyed', …)` auto-releases all subscriptions for that window. This prevents leaks if the buddy crashes.

**Input already works.** `session:input` is session-keyed, not window-keyed, so when buddy dispatches input it flows to the session PTY identically to main-originated input. No changes needed.

### 3.4 New main-process IPC surface

| IPC channel | Direction | Purpose |
|-------------|-----------|---------|
| `buddy:show` | renderer → main | Create the mascot window. Chat window is not created until the user first clicks the mascot (lazy creation). |
| `buddy:hide` | renderer → main | Destroy both buddy windows (mascot and chat if it exists). |
| `buddy:toggle-chat` | renderer → main | On first call, lazily creates the chat window and shows it. On subsequent calls, toggles chat window visibility via `show()` / `hide()` — the window is kept alive between toggles for fast reopen. |
| `buddy:set-session` | renderer → main | Unsubscribe from old session, subscribe to new, push snapshot |
| `buddy:subscribe` / `buddy:unsubscribe` | renderer → main | Subscription layer (see 3.3) |
| `session:attention-summary` | main → all buddy mascot windows | Push update when any session's attention state changes |
| `session:state-snapshot` | main → subscribing window | Recent transcript events for a session on subscribe |

### 3.5 Preload / remote-shim parity

Per `docs/PITFALLS.md` "`preload.ts` and `remote-shim.ts` must expose the same shared `window.claude` shape."

- `preload.ts` exposes `window.claude.buddy.{show,hide,toggleChat,setSession,subscribe,unsubscribe}`.
- `remote-shim.ts` exposes the same surface, but every method `throw new Error('Buddy is desktop-only in this version')`. This satisfies parity and makes the platform gap loud and obvious.

Parity is enforced by the existing contract, not by this spec — but calling it out so the implementer knows it's not optional.

---

## 4. Mascot behavior

### 4.1 `<BuddyMascot>` component

- Renders `<ThemeMascot variant={attentionNeeded ? 'shocked' : 'idle'} />` with no other chrome.
- `useAnyAttentionNeeded()` — a new selector that returns `true` iff any running session has `attentionState !== 'ok' && attentionState !== 'session-died'` OR has any tool in `'awaiting-approval'`. Union across all sessions. Source: subscribed `session:attention-summary` pushes from main.
- Root element carries `-webkit-app-region: drag` for window drag via OS-level handling.
- Click vs. drag disambiguation: `pointerdown → pointerup` tracked in component state; if total movement ≤4px, treat as click → `window.claude.buddy.toggleChat()`. Otherwise, swallow.

### 4.2 Mascot window IPC responsibilities

- Debounced `move` handler writes `{x,y}` to `localStorage['youcoded-buddy-mascot-position']` (300ms debounce).
- Subscribes to `session:attention-summary` on mount; unsubscribes on unmount.

---

## 5. Chat UI

### 5.1 `<BuddyChat>` structure

```
<body data-mode="buddy-chat">              // [data-mode] scope enables buddy CSS overrides,
  <ThemeProvider>                            //   including --canvas: transparent
    <BuddyChat>
      <SessionPill />                        // top, centered
      <BubbleFeed>                           // middle, scrollable, content-visibility: auto
        …bubbles + inline <CompactToolStrip /> when tools present
        <PermissionPromptRow />              // inline in tool strip when awaiting-approval
      </BubbleFeed>
      <InputBar compact sessionId={...} />   // bottom, reused from main
      <AttentionStrip />                     // below input pill when state ≠ ok, hidden otherwise
    </BuddyChat>
  </ThemeProvider>
</body>
```

Buddy doesn't need its own theme provider — the existing `ThemeProvider` is reused; the `[data-mode="buddy-chat"]` CSS scope overrides `--canvas` to `transparent` and applies the other buddy-specific adjustments (font size, padding, stripped markdown classes).

### 5.2 Session pill + switcher

- Pill content: status dot (reuses `DOT_BG` color mapping from `SessionStrip.tsx`), session label (`<basename(cwd)> · <branch>`), chevron.
- Click → dropdown below, anchored under the pill. Uses `<OverlayPanel layer={2}>` per `docs/shared-ui-architecture.md` overlay primitives.
- Dropdown rows: status dot + label + inline `● awaiting` / `● error` tag when non-ok. No pin icon — buddy is independent.
- `+ New session…` row at the bottom. Calls existing `session:create` IPC with defaults (main's cwd, default model, not-dangerous). New session appears in main's session strip; buddy switches to it.
- `window.claude.buddy.setSession(newSessionId)` on row click — main unsubscribes buddy from old session, subscribes to new, pushes snapshot.

### 5.3 Bubble feed

- Free-floating bubbles directly on the transparent window. No wrapping container.
- Reuses `.user-bubble` / `.assistant-bubble` CSS classes (already theme-driven, already glass-aware via `--bubble-opacity` / `--panels-blur`).
- Asymmetric corner radii match main app (`18px 18px 4px 18px` for user; mirrored for assistant).
- `[data-mode="buddy-chat"]` CSS scope overrides: 13px text (vs. 14px main), trimmed bubble padding, tables → flat text, headings → bold text, blockquotes → italic, images capped at 240px, `copy/collapse` tool-card buttons hidden.
- Scrolling: `content-visibility: auto` (per `docs/PITFALLS.md` performance guidance).
- Scrollbar: 4px overlay, fades when idle.

### 5.4 Tool presentation

- Default state: a glass strip pill inline where tools would render — `─ {N} tools used ▾`.
- Click → expands inline: list of status dot + tool name + truncated target (`● Read SessionStrip.tsx`).
- Row click → opens existing `<ToolCard>` as an overlay modal inside the buddy chat window via `<OverlayPanel layer={2}>`. Avoids inventing a new detail view.

### 5.5 Permission prompts

- When a tool's status is `'awaiting-approval'`, the tool strip auto-expands showing that tool's row with three inline pill buttons: `✓ Allow`, `✕ Deny`, `∞ Always`.
- If multiple tools await approval, all listed with individual button rows.
- Dispatches use the existing `PERMISSION_REQUEST` / approval-flow reducer actions — same state machine as main, different render.

### 5.6 Attention strip

- Below `<InputBar>`: a slim `.layer-surface` pill showing `● awaiting approval` / `● shell idle` / `● error` / `● session died` based on the viewed session's `attentionState`. Hidden when `'ok'`.

### 5.7 Input pill

- Reuses `<InputBar compact sessionId={viewedSessionId} />`. New `compact` prop:
  - Hides `QuickChips`
  - Trims padding and font size via the `[data-mode="buddy-chat"]` scope
  - Keeps: attach icon + click-to-attach, paste-to-attach, drag-drop-to-attach, placeholder, send button (w-7 h-7 rounded-lg bg-accent with existing arrow SVG), Enter-to-send, Shift+Enter newline.
- Attachments render above the input pill using the same thumbnail markup as main (`w-12 h-12 rounded-md`), positioned in a horizontal strip above the input pill. The `[data-mode="buddy-chat"]` scope may reduce thumbnail size in a follow-up polish pass if they feel oversized in testing.

---

## 6. Session relationship

**Buddy is fully independent from main's active session.** Switching sessions in either window does not affect the other.

- First-open default: main app's currently-active session at the moment buddy is first opened. One-time snapshot, never re-syncs.
- Subsequent opens: persisted last-viewed sessionId. If that session no longer exists, fall back to main's currently-active session. If none exist, show empty state.
- Session creation from buddy: creates in main's strip via `session:create` IPC; buddy switches to the new session.

---

## 7. Lifecycle & persistence

### 7.1 Enable / disable

- Setting: `SettingsPanel` Appearance area, `☐ Show buddy floater`. Off by default.
- On: `window.claude.buddy.show()` → main creates mascot window at last-known position.
- Off: `window.claude.buddy.hide()` → main destroys both buddy windows.
- Persisted in `localStorage['youcoded-buddy-enabled']` (same pattern as theme / font prefs).
- On app launch, `main.ts` startup reads the flag and calls `buddy.show()` if enabled, after main window is ready.

### 7.2 Position persistence

- `localStorage['youcoded-buddy-mascot-position']` = `{x, y}` — debounced 300ms on `move`.
- `localStorage['youcoded-buddy-chat-position']` = `{x, y}` — same pattern.
- First-ever mascot position: `(screen.primaryDisplay.workArea.width - 104, screen.primaryDisplay.workArea.height - 104)` (bottom-right, 24px margin).
- First-ever chat position: `{x: mascotX + 92, y: mascotY - 200}`, clamped to screen.

### 7.3 Edge boundary clamping

Before setting window position (create OR programmatic move):

1. `screen.getDisplayMatching(windowBounds)` selects the display the window would be on. Fall back to primary if off-screen entirely.
2. Clamp: `x ∈ [workArea.x, workArea.x + workArea.width - windowWidth]`, same for y.
3. Save the clamped position back to localStorage immediately.

Covers: saved position from a now-disconnected monitor, resolution changes, taskbar moves.

### 7.4 Click vs. drag on mascot

The `-webkit-app-region: drag` CSS gives OS-level drag, which on Windows/Mac fires clicks when movement is small. To be safe, `<BuddyMascot>` also tracks pointer movement in JS; if total travel ≤4px, emit click; otherwise swallow.

### 7.5 Chat window show/hide

- **First toggle after `buddy:show`:** chat window is created lazily via `createAppWindow` with buddy-chat variant. Position = anchored to mascot (`{x: mascotX + 92, y: mascotY - 200}`, clamped). Window shown + focused.
- **Subsequent toggles while mascot is alive:** `chatWindow.show()` / `chatWindow.hide()` toggled. Position read from `localStorage` if the user has moved the chat window previously; otherwise stays where it was last shown.
- **State preservation:** chat window's React state (reducer, scroll position, draft text) is kept alive between show/hide via `hide()` instead of destroy. Only `buddy:hide` (settings off) or app quit destroys the chat window.
- **Dismissal paths:** Escape key inside chat (dispatches `buddy:toggle-chat`), mascot click again, explicit `buddy:hide` from settings. Click-outside intentionally does **not** dismiss — buddy staying open while user works in main is a feature.

### 7.6 App quit

- Electron's `window-all-closed` behavior is unchanged: Windows/Linux quit when last main window closes; Mac keeps app alive in dock. Buddy closes with main.

---

## 8. Error handling & edge cases

| Case | Behavior |
|------|----------|
| Buddy crash (`render-process-gone`) | Main closes both buddy windows and logs. User re-enables via settings. No auto-respawn (deferred). |
| Subscribed session dies | Buddy's reducer gets `SESSION_PROCESS_EXITED` via the subscription path. Switcher drops it. Buddy auto-switches to most-recent-active remaining session or shows empty state. |
| Concurrent input from buddy and main | Both send. Each window's reducer dedups its own timeline via content matching (existing behavior per `docs/chat-reducer.md`). Acceptable race. |
| Position saved from disconnected monitor | §7.3 clamping handles it. |
| Theme change while buddy open | Existing peer-window theme broadcast (`main.ts:533`) applies. `<ThemeMascot>` variant swaps automatically. |
| Mascot clicked during drag | `<BuddyMascot>` JS guard: >4px travel → no toggle. |
| Attention push storm | `session:attention-summary` coalesces within 100ms and only emits on transitions (same discipline as existing `ATTENTION_STATE_CHANGED`). |
| Buddy enabled with zero sessions running | Mascot renders idle. Chat opens to an empty state: "No sessions running — start one in the main window, or click + New session." |
| `buddy:subscribe` for a nonexistent sessionId | Main responds with `{error: 'session-not-found'}`; buddy treats as if the session died (switches or empty state). |

---

## 9. Testing

### 9.1 Unit (vitest)

- `useAnyAttentionNeeded` selector: various session-state permutations return correct boolean
- Switcher default-session resolution: first-open uses main's active; reopen uses last-viewed; fallback on missing session
- Edge-boundary clamp: off-screen saved position clamps to workArea; multi-monitor preserves monitor when available, falls back to primary when not
- Mascot click-vs-drag threshold (4px)
- `WindowRegistry.subscribe` / `unsubscribe` mutate the map correctly; `webContents.did-destroy` auto-releases subscriptions

### 9.2 IPC handler tests

- Events route to `owner ∪ subscribers` — verified by spy on `webContents.send`
- `buddy:subscribe` triggers a `session:state-snapshot` push
- `buddy:set-session` unsubscribes from old before subscribing to new (no lingering subscription)
- `buddy:toggle-chat` creates chat window on first call, hides on second

### 9.3 Integration (manual — documented in spec for QA)

1. Enable buddy in settings; verify mascot appears at last-known position (or bottom-right on first-ever).
2. Minimize main window; verify mascot remains visible over other apps.
3. Click mascot; verify chat window appears anchored near mascot. Click again; verify chat hides.
4. Switch sessions via buddy switcher; verify bubble feed loads from snapshot and new events stream in.
5. Type and send from buddy; verify message lands in session, main also shows it.
6. Trigger a tool requiring approval in a session; verify the compact Allow/Deny/Always row appears in buddy's tool strip. Approve; verify Claude proceeds.
7. Drag mascot off-screen; restart app; verify position clamps to visible workArea.
8. Disable buddy via settings; verify both windows close. Re-enable; verify last-known positions restored.
9. Switch active theme while buddy open; verify mascot + bubbles + pills update.
10. Close the last main window; verify buddy closes and app quits (Windows/Linux) or mascot closes and app remains docked (Mac).

---

## 10. Android deferral

This feature is **desktop-only in MVP**. Android would require:

- `SYSTEM_ALERT_WINDOW` permission (user-granted via Settings, not auto-grantable)
- Kotlin `WindowManager` overlay hosting a WebView for the mascot
- Second `WindowManager` overlay for the chat window, triggered by mascot click
- Integration with `SessionService.handleBridgeMessage()` for subscription IPC (new message types matching desktop)
- Bootstrap work to ship the overlay service component

The `remote-shim.ts` `window.claude.buddy.*` stubs throw clear errors on Android so feature detection works cleanly.

A GH issue is filed as part of this spec's deferred work list (§11, item 6).

---

## 11. Deferred work (GH issues to file on `itsdestin/youcoded`)

1. **`feat(buddy): screenshot → new session`** — one-click full-screen capture + new session with image attached
2. **`feat(buddy): global hotkey summon`** — Electron `globalShortcut` toggle (default Ctrl+Shift+B; user-configurable)
3. **`feat(buddy): tray-survival after main close`** — app persists in system tray with only buddy visible
4. **`feat(buddy): edge snapping`** — mascot snaps to screen edges when dragged within threshold
5. **`feat(buddy): mode configurability — ambient / quick-send / mini-chat`** — the "build-your-own-buddy" surface; per-buddy mode selection
6. **`feat(android): buddies floater parity (SYSTEM_ALERT_WINDOW overlay)`** — Kotlin WindowManager overlay + Bootstrap wiring
7. **`feat(buddy): multiple buddy instances`** — more than one mascot simultaneously, each with independent session focus
8. **`feat(buddy): crash auto-retry policy`** — automatic respawn with backoff on `render-process-gone`

---

## 12. Out of scope

- Changes to main app chat view or main session strip (only new plumbing for subscription routing, which is additive)
- Changes to how sessions are created, owned, or migrated between windows (drag-to-detach remains unchanged)
- Changes to the remote access server (`remote-server.ts`) — buddy is Electron-local
- Changes to theme tokens or the theme engine — buddy consumes existing tokens
- Multiplayer game display in buddy — orthogonal feature, main-app-only
- Encyclopedia / life toolkit surfaces in buddy — out of compact-chat scope

---

## 13. Key files (for implementation planning)

New files:
- `youcoded/desktop/src/renderer/components/buddy/BuddyMascot.tsx`
- `youcoded/desktop/src/renderer/components/buddy/BuddyChat.tsx`
- `youcoded/desktop/src/renderer/components/buddy/SessionPill.tsx`
- `youcoded/desktop/src/renderer/components/buddy/AttentionStrip.tsx`
- `youcoded/desktop/src/renderer/components/buddy/CompactToolStrip.tsx` (if not inline in BuddyChat)
- `youcoded/desktop/src/renderer/components/buddy/BuddyApp.tsx` (mode-routed entry)
- `youcoded/desktop/src/renderer/hooks/useAnyAttentionNeeded.ts`
- `youcoded/desktop/src/renderer/styles/buddy.css` (buddy-scoped overrides)
- `youcoded/desktop/src/main/buddy-window-manager.ts` (show/hide/position/subscription orchestration)

Modified files:
- `youcoded/desktop/src/main/main.ts` — register buddy IPC handlers, wire into `createAppWindow` for buddy variant
- `youcoded/desktop/src/main/window-registry.ts` — subscription map + `subscribe`/`unsubscribe`/auto-release on destroy
- `youcoded/desktop/src/main/ipc-handlers.ts` — route events to `owner ∪ subscribers`, handle new buddy channels
- `youcoded/desktop/src/main/preload.ts` — expose `window.claude.buddy.*`
- `youcoded/desktop/src/renderer/remote-shim.ts` — stub `window.claude.buddy.*` with "desktop-only" errors
- `youcoded/desktop/src/renderer/App.tsx` — mode routing on `?mode=buddy-…`
- `youcoded/desktop/src/renderer/components/InputBar.tsx` — accept `compact` prop
- `youcoded/desktop/src/renderer/components/SettingsPanel.tsx` — buddy enable toggle
- `youcoded/desktop/src/renderer/styles/globals.css` — `[data-mode="buddy-chat"]` scope overrides
- `youcoded/desktop/src/shared/types.ts` — new IPC channel constants
