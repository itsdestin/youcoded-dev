---
status: shipped
---

# Buddy Floater Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the buddy floater's positioning bugs, replace the single capture icon with a 3-button action bar (screenshot · open main app · hide), make the mascot feel alive (rigged SVG mascot format with limb-trailing drag, breathing, blinks, attention bounce), add edge snap + peek, and restyle the Settings entry.

**Spec:** `docs/superpowers/specs/2026-07-10-buddy-floater-upgrades-design.md` (workspace repo). Read it first.

**Architecture:** All work is in the `youcoded` repo, `desktop/` only (buddy is Electron-only). Main-process window orchestration lives in `buddy-window-manager.ts` with new pure modules (`buddy-bar-geometry.ts`, `buddy-bar-visibility.ts`, `buddy-dock.ts`) for unit-testable logic. Renderer gains a rigged-mascot subsystem under `src/renderer/components/mascot/` (sanitizer, poses, `MascotRig` component, first-party default rig). All mascot motion is CSS/JS transforms inside fixed-size windows; the only window-bounds animation is the edge-snap glide.

**Tech Stack:** Electron (main), React 18 + Vite (renderer), vitest (tests — `.tsx` test files get jsdom via `environmentMatchGlobs`, plain `.ts` run in node with an electron mock at `tests/__mocks__/electron.ts`).

**Working rules that apply (from workspace CLAUDE.md):**
- Work in a git worktree, NOT on master in the main checkout.
- Annotate non-trivial edits with WHY comments.
- Never touch Destin's live built app; runtime verification via `bash scripts/run-dev.sh` from the workspace root.
- Commit frequently; the branch merges via PR at the end.

---

## File map

| File | Action | Responsibility |
|------|--------|----------------|
| `desktop/src/shared/types.ts` | modify | 10 new IPC channel constants |
| `desktop/src/main/preload.ts` | modify | New `window.claude.buddy.*` methods + IPC constants (inlined) |
| `desktop/src/renderer/remote-shim.ts` | modify | Parity stubs for the new buddy methods |
| `desktop/src/main/buddy-bar-geometry.ts` | create | Pure: action-bar size + position math (extracted from manager) |
| `desktop/src/main/buddy-bar-visibility.ts` | create | Pure-ish: hover/chat-open → bar visible state with grace timeout |
| `desktop/src/main/buddy-dock.ts` | create | Pure: snap-edge detection, dock/peek state machine, dock positions |
| `desktop/src/main/buddy-window-manager.ts` | modify | capture→bar rename, reposition-on-show fix, hover/dismiss/dock orchestration, glide |
| `desktop/src/main/main.ts` | modify | Bar dimensions + variant rename, new IPC handlers, attention hook, dock persistence |
| `desktop/src/renderer/components/buddy/BuddyBarApp.tsx` | create | 3-button action bar renderer (replaces BuddyCaptureApp) |
| `desktop/src/renderer/components/buddy/BuddyCaptureApp.tsx` | delete | Superseded by BuddyBarApp |
| `desktop/src/renderer/components/buddy/BuddyMascot.tsx` | modify | Rig integration, wrapper animations, hover/drag-end reporting, peek sink |
| `desktop/src/renderer/components/buddy/BuddyChatApp.tsx` | modify | Open/close fade+scale animation |
| `desktop/src/renderer/components/mascot/sanitize-rig-svg.ts` | create | Pure: SVG sanitizer (security boundary for third-party rigs) |
| `desktop/src/renderer/components/mascot/mascot-poses.ts` | create | Pure: rig part ids, pivot parsing, pose data, spring math, drag targets |
| `desktop/src/renderer/components/mascot/MascotRig.tsx` | create | Rig renderer: fetch/sanitize/inline SVG, poses, limb springs, blink |
| `desktop/src/renderer/components/mascot/default-buddy-rig.ts` | create | First-party default character rig (SVG string, theme-tinted) |
| `desktop/src/renderer/themes/theme-types.ts` | modify | `ThemeMascot` gains optional `rig` key |
| `desktop/src/renderer/components/SettingsPanel.tsx` | modify | BuddyToggle restyle (Toggle switch + status + Show now) |
| `desktop/src/renderer/App.tsx` | modify | `buddy-bar` mode route, session focus-request listener |
| `desktop/src/renderer/index.tsx` | modify | `buddy-bar` in the pre-mount data-mode list |
| `desktop/src/renderer/styles/buddy.css` | modify | Mode rename, wrapper/bar/peek/chat animations |
| `desktop/tests/buddy-bar-geometry.test.ts` | create | Bar position math |
| `desktop/tests/buddy-bar-visibility.test.ts` | create | Hover grace coalescing |
| `desktop/tests/buddy-dock.test.ts` | create | Snap detection + dock state machine |
| `desktop/tests/sanitize-rig-svg.test.tsx` | create | Sanitizer (jsdom — note `.tsx` extension) |
| `desktop/tests/mascot-poses.test.ts` | create | Pivot parsing, spring math, drag targets |
| `desktop/docs/theme-spec.md` | modify | Document the `mascot.rig` format |

---

### Task 0: Worktree setup

- [ ] **Step 1: Sync and create the worktree**

From the workspace root (`C:\Users\desti\youcoded-dev`), Git Bash:

```bash
cd youcoded && git fetch origin && git pull origin master
git worktree add ../youcoded-worktrees/buddy-upgrades -b feat/buddy-upgrades
cd ../youcoded-worktrees/buddy-upgrades/desktop && npm ci
```

Do NOT junction `node_modules` from the main checkout (worktree-remove follows junctions on Windows — see workspace CLAUDE.md). `npm ci` fresh.

- [ ] **Step 2: Verify baseline**

Run: `npm test -- --run` (in `youcoded-worktrees/buddy-upgrades/desktop`)
Expected: full suite passes. If not, STOP and report — don't build on a broken baseline.

All subsequent tasks run inside `youcoded-worktrees/buddy-upgrades/desktop` unless stated otherwise.

---

### Task 1: IPC constants + preload + remote-shim parity

**Files:**
- Modify: `src/shared/types.ts` (the `IPC` object, after `BUDDY_ATTACH_FILE: 'buddy:attach-file',` ~line 832)
- Modify: `src/main/preload.ts` (IPC const block after `BUDDY_ATTACH_FILE` ~line 256, and the `buddy: {...}` API object ~line 887)
- Modify: `src/renderer/remote-shim.ts` (the `buddy: {...}` stub block ~line 1296)

- [ ] **Step 1: Add channel constants to `src/shared/types.ts`**

Insert directly after the `BUDDY_ATTACH_FILE` line:

```ts
  // ── Buddy upgrades (action bar, dismiss, dock/peek) ──
  // Fire-and-forget: mascot + bar renderers report pointer enter/leave; main
  // coalesces with a grace timeout to decide bar visibility.
  BUDDY_HOVER_CHANGED: 'buddy:hover-changed',
  // Fire-and-forget: mascot renderer signals drag release so main can run
  // edge-snap detection against the window's final bounds.
  BUDDY_DRAG_ENDED: 'buddy:drag-ended',
  // Restore + focus the main window and switch it to the buddy's viewed session.
  BUDDY_OPEN_MAIN: 'buddy:open-main',
  // Hide the buddy for this app run only (preference stays enabled).
  BUDDY_DISMISS: 'buddy:dismiss',
  BUDDY_GET_STATUS: 'buddy:get-status',
  // Main → all windows: { dismissed, visible } so open Settings panels update live.
  BUDDY_STATUS_CHANGED: 'buddy:status-changed',
  // Main → bar renderer: fade the action bar in/out (window stays shown; CSS animates).
  BUDDY_BAR_STATE: 'buddy:bar-state',
  // Main → mascot renderer: dock/peek state for the sink animation + peek pose.
  BUDDY_MASCOT_STATE: 'buddy:mascot-state',
  // Main → chat renderer: entrance/exit animation cue around show/hide.
  BUDDY_CHAT_STATE: 'buddy:chat-state',
  // Main → main window: switch active session (sent by buddy:open-main).
  SESSION_FOCUS_REQUEST: 'session:focus-request',
```

- [ ] **Step 2: Mirror the constants into `src/main/preload.ts`'s inlined IPC block**

Insert the same 10 entries after `BUDDY_ATTACH_FILE: 'buddy:attach-file',` in preload's `const IPC = {` block (preload cannot import shared/types — constants are duplicated by design; `tests/ipc-channels.test.ts` checks drift).

- [ ] **Step 3: Add the new API methods to preload's `buddy: {...}` object**

After the existing `onAttachFile` entry inside `buddy: {`:

```ts
    // ── Buddy upgrades ──
    reportHover: (payload: { source: 'mascot' | 'bar'; hovering: boolean }) =>
      ipcRenderer.send(IPC.BUDDY_HOVER_CHANGED, payload),
    dragEnded: () => ipcRenderer.send(IPC.BUDDY_DRAG_ENDED),
    openMain: (): Promise<void> => ipcRenderer.invoke(IPC.BUDDY_OPEN_MAIN),
    dismiss: (): Promise<void> => ipcRenderer.invoke(IPC.BUDDY_DISMISS),
    getStatus: (): Promise<{ dismissed: boolean; visible: boolean }> =>
      ipcRenderer.invoke(IPC.BUDDY_GET_STATUS),
    onStatusChanged: (cb: (s: { dismissed: boolean; visible: boolean }) => void) => {
      const listener = (_: unknown, s: { dismissed: boolean; visible: boolean }) => cb(s);
      ipcRenderer.on(IPC.BUDDY_STATUS_CHANGED, listener);
      return () => ipcRenderer.removeListener(IPC.BUDDY_STATUS_CHANGED, listener);
    },
    onBarState: (cb: (s: { visible: boolean }) => void) => {
      const listener = (_: unknown, s: { visible: boolean }) => cb(s);
      ipcRenderer.on(IPC.BUDDY_BAR_STATE, listener);
      return () => ipcRenderer.removeListener(IPC.BUDDY_BAR_STATE, listener);
    },
    onMascotState: (cb: (s: { mode: 'free' | 'docked' | 'peeking'; edge: string | null }) => void) => {
      const listener = (_: unknown, s: { mode: 'free' | 'docked' | 'peeking'; edge: string | null }) => cb(s);
      ipcRenderer.on(IPC.BUDDY_MASCOT_STATE, listener);
      return () => ipcRenderer.removeListener(IPC.BUDDY_MASCOT_STATE, listener);
    },
    onChatState: (cb: (s: { visible: boolean }) => void) => {
      const listener = (_: unknown, s: { visible: boolean }) => cb(s);
      ipcRenderer.on(IPC.BUDDY_CHAT_STATE, listener);
      return () => ipcRenderer.removeListener(IPC.BUDDY_CHAT_STATE, listener);
    },
    onFocusSession: (cb: (sessionId: string) => void) => {
      const listener = (_: unknown, sessionId: string) => cb(sessionId);
      ipcRenderer.on(IPC.SESSION_FOCUS_REQUEST, listener);
      return () => ipcRenderer.removeListener(IPC.SESSION_FOCUS_REQUEST, listener);
    },
```

- [ ] **Step 4: Add parity stubs to `src/renderer/remote-shim.ts`**

Inside the existing `buddy: {` stub object (after `onAttentionSummary`), matching the established stub conventions there (throw for user-initiated invokes, no-op for high-frequency fires and listeners):

```ts
      // ── Buddy upgrades — same desktop-only contract as the methods above.
      // reportHover/dragEnded are no-ops (not throws): they fire from pointer
      // handlers and throwing would spam the console if a buddy surface ever
      // loaded remote-shim. The on* listeners return no-op unsubscribers.
      reportHover: (_p: { source: 'mascot' | 'bar'; hovering: boolean }) => { /* desktop-only */ },
      dragEnded: () => { /* desktop-only */ },
      openMain: () => { throw new Error('Buddy is desktop-only in this version'); },
      dismiss: () => { throw new Error('Buddy is desktop-only in this version'); },
      getStatus: () => { throw new Error('Buddy is desktop-only in this version'); },
      onStatusChanged: () => () => { /* no-op unsubscribe */ },
      onBarState: () => () => { /* no-op unsubscribe */ },
      onMascotState: () => () => { /* no-op unsubscribe */ },
      onChatState: () => () => { /* no-op unsubscribe */ },
      onFocusSession: () => () => { /* no-op unsubscribe */ },
```

- [ ] **Step 5: Typecheck + run the channel-parity test**

Run: `npx tsc --noEmit && npx vitest run tests/ipc-channels.test.ts`
Expected: PASS (the test extracts channels from both files and compares).

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/preload.ts src/renderer/remote-shim.ts
git commit -m "feat(buddy): IPC surface for action bar, dismiss, dock/peek"
```

---

### Task 2: Bar geometry pure module (TDD)

**Files:**
- Create: `src/main/buddy-bar-geometry.ts`
- Test: `tests/buddy-bar-geometry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { BAR_SIZE, computeBarPosition } from '../src/main/buddy-bar-geometry';

const wa = { x: 0, y: 0, width: 1920, height: 1080 };
const mascot = (x: number, y: number) => ({ x, y, width: 80, height: 80 });

describe('computeBarPosition', () => {
  it('centers the bar under the mascot with a 6px gap', () => {
    // mascot center x = 500 + 40 = 540; bar left = 540 - 74 = 466; y = 300 + 80 + 6
    expect(computeBarPosition(mascot(500, 300), wa)).toEqual({ x: 466, y: 386 });
  });

  it('flips above the mascot when below would clip the workArea bottom', () => {
    // mascot at bottom: below-y = 1000 + 80 + 6 = 1086 > 1080 - 44 → flip above
    expect(computeBarPosition(mascot(500, 1000), wa)).toEqual({ x: 466, y: 1000 - BAR_SIZE.height - 6 });
  });

  it('clamps horizontally at the left edge', () => {
    const pos = computeBarPosition(mascot(0, 300), wa);
    expect(pos.x).toBe(0); // raw would be 40 - 74 = -34 → clamped
    expect(pos.y).toBe(386);
  });

  it('clamps horizontally at the right edge', () => {
    const pos = computeBarPosition(mascot(1840, 300), wa);
    expect(pos.x).toBe(wa.width - BAR_SIZE.width);
  });

  it('handles non-zero workArea origin (secondary monitor)', () => {
    const wa2 = { x: 1920, y: 0, width: 1920, height: 1080 };
    expect(computeBarPosition(mascot(1920, 300), wa2).x).toBe(1920);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/buddy-bar-geometry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/buddy-bar-geometry.ts`**

```ts
import { clampToWorkArea, type Point, type Rect, type Size } from './buddy-window-manager';

// Action bar: three 44×44 buttons + 2 × 8px gaps = 148 wide. main.ts's
// buddyDimensions imports this so the BrowserWindow and the math can't drift.
export const BAR_SIZE: Size = { width: 148, height: 44 };
export const BAR_GAP_PX = 6;

/**
 * Position for the action-bar window — centered horizontally on the mascot,
 * BAR_GAP_PX below it. Flips to above when below would clip the workArea.
 * Always clamped to the visible workArea. Pure — unit-tested.
 * (Extracted from BuddyWindowManager.computeCapturePosition and widened for
 * the 3-button bar.)
 */
export function computeBarPosition(mascotBounds: Rect, workArea: Rect): Point {
  const centerX = mascotBounds.x + Math.round(mascotBounds.width / 2) - Math.round(BAR_SIZE.width / 2);
  const belowY = mascotBounds.y + mascotBounds.height + BAR_GAP_PX;
  const belowFits = belowY + BAR_SIZE.height <= workArea.y + workArea.height;
  const raw = belowFits
    ? { x: centerX, y: belowY }
    : { x: centerX, y: mascotBounds.y - BAR_SIZE.height - BAR_GAP_PX };
  return clampToWorkArea(raw, BAR_SIZE, workArea);
}
```

Note: `clampToWorkArea`, `Point`, `Rect`, `Size` are already exported from `buddy-window-manager.ts` (`Rect`/`Point`/`Size` interfaces at the top). If `Size`/`Point`/`Rect` lack `export` on any of them, add it there.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/buddy-bar-geometry.test.ts tests/buddy-edge-clamp.test.ts`
Expected: PASS (both).

- [ ] **Step 5: Commit**

```bash
git add src/main/buddy-bar-geometry.ts tests/buddy-bar-geometry.test.ts src/main/buddy-window-manager.ts
git commit -m "feat(buddy): extract action-bar geometry into pure tested module"
```

---

### Task 3: Capture window → action bar (+ the §2 bug fixes)

**Files:**
- Modify: `src/main/buddy-window-manager.ts`
- Modify: `src/main/main.ts` (`createAppWindow` opts type ~383, `buddyDimensions` ~437, capture handler ~1344)
- Create: `src/renderer/components/buddy/BuddyBarApp.tsx`
- Delete: `src/renderer/components/buddy/BuddyCaptureApp.tsx`
- Modify: `src/renderer/App.tsx` (~74-76 imports, ~2710-2712 routing)
- Modify: `src/renderer/index.tsx` (~23-26 mode list)
- Modify: `src/renderer/styles/buddy.css` (every `buddy-capture` selector)

- [ ] **Step 1: Rename the variant across main-process code**

In `buddy-window-manager.ts`:
1. Change `createBuddyWindow(variant: 'mascot' | 'chat' | 'capture', ...)` in `BuddyWindowManagerDeps` to `'mascot' | 'chat' | 'bar'`.
2. Rename the private field `capture` → `bar` (and every reference: `hide()`, `isBuddyWindow`, `getCaptureWindow` → `getBarWindow`, `wireCaptureLifecycle` → `wireBarLifecycle`).
3. Delete the private `computeCapturePosition` method and the `CAPTURE_SIZE`/`CAPTURE_GAP_PX` constants; import instead:

```ts
import { BAR_SIZE, computeBarPosition } from './buddy-bar-geometry';
```

4. Replace `showCapture`/`hideCapture` with (THE BUG FIX — reposition on every show, not just creation):

```ts
  /** Create-if-needed and show the action-bar window.
   *  FIX (youcoded buddy bug): ALWAYS recompute position from the current
   *  mascot bounds before showing. The old code only computed position at
   *  creation, so dragging the mascot while the chat was closed left the
   *  re-shown icon stranded at the mascot's OLD position. */
  private showBar(): void {
    const pos = this.currentBarPosition();
    if (!this.bar || this.bar.isDestroyed()) {
      this.bar = this.deps.createBuddyWindow('bar', { x: Math.round(pos.x), y: Math.round(pos.y) });
      this.wireBarLifecycle(this.bar);
    } else {
      this.bar.setPosition(Math.round(pos.x), Math.round(pos.y));
    }
    if (!this.bar.isVisible()) this.bar.showInactive();
  }

  private hideBar(): void {
    if (this.bar && !this.bar.isDestroyed() && this.bar.isVisible()) this.bar.hide();
  }

  /** Bar position derived from live mascot bounds; falls back to bottom-right
   *  of the primary display when the mascot is gone (mirrors old behavior). */
  private currentBarPosition(): Point {
    if (!this.mascot || this.mascot.isDestroyed()) {
      const primary = screen.getPrimaryDisplay().workArea;
      return {
        x: primary.x + primary.width - BAR_SIZE.width - 24,
        y: primary.y + primary.height - BAR_SIZE.height - 24,
      };
    }
    const mb = this.mascot.getBounds();
    const display = screen.getDisplayMatching(mb) ?? screen.getPrimaryDisplay();
    return computeBarPosition(mb, display.workArea);
  }
```

5. Update `toggleChat()` and `moveMascot()` call sites: `showCapture()`→`showBar()`, `hideCapture()`→`hideBar()`; in `moveMascot` the bar-follow block becomes:

```ts
    if (this.bar && !this.bar.isDestroyed() && this.bar.isVisible()) {
      const pos = this.currentBarPosition();
      this.bar.setPosition(Math.round(pos.x), Math.round(pos.y));
    }
```

(Keep the `chatVisible` gate on the CHAT follow; the bar follow now gates on its own visibility — in Task 4 the bar becomes hover-revealable without the chat.)

6. **Orphan fix** — in `wireChatLifecycle`, extend the `closed` handler:

```ts
    win.on('closed', () => {
      this.chat = null;
      // FIX: an OS-closed chat (not a toggle) used to strand the action bar
      // visible with no chat. Drop the bar too until the next reveal.
      this.hideBar();
    });
```

7. **Dead-code fix** — in `wireChatLifecycle`, delete the debounce `save` const and `win.on('move', save)` (chat position is written but never read — chat is always re-anchored to the mascot). Then in `BuddyWindowManagerDeps`, narrow the persistence keys to `'mascot'`:

```ts
  getPersistedPosition(key: 'mascot'): Point | null;
  setPersistedPosition(key: 'mascot', pos: Point): void;
```

- [ ] **Step 2: Update `src/main/main.ts`**

1. `createAppWindow` opts type: `buddy?: 'mascot' | 'chat' | 'capture'` → `'mascot' | 'chat' | 'bar'` (both the ~383 signature and any other mention).
2. `buddyDimensions` (~437): import `BAR_SIZE` from `./buddy-bar-geometry` at the top of main.ts, then:

```ts
  const buddyDimensions: { width?: number; height?: number } = opts?.buddy === 'mascot'
    ? { width: 80, height: 80 }
    : opts?.buddy === 'chat'
    ? { width: 320, height: 480 }
    : opts?.buddy === 'bar'
    // Action bar: three 44px buttons. Size lives in buddy-bar-geometry.ts so
    // the window and the positioning math can never drift apart.
    ? { width: BAR_SIZE.width, height: BAR_SIZE.height }
    : {};
```

3. Capture handler (~1348): `buddyManager.getCaptureWindow()` → `buddyManager.getBarWindow()` (variable `captureWin` → `barWin`).

- [ ] **Step 3: Create `src/renderer/components/buddy/BuddyBarApp.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { ThemeProvider } from '../../state/theme-context';

/**
 * Action-bar floater window (148×44, transparent). Sits directly below the
 * mascot. Three actions: screenshot the desktop, open the main app, hide the
 * buddy for this run. Replaces the old single-purpose BuddyCaptureApp.
 *
 * Visibility is CSS-driven (fade+rise) via the buddy:bar-state push — the
 * BrowserWindow itself stays shown so opacity can animate (Task 4 wires the
 * push; until then the bar renders visible whenever the window is shown).
 */
function BarButton({ label, onClick, busy, children }: {
  label: string;
  onClick: () => void;
  busy?: boolean;
  children: React.ReactNode; // the icon SVG
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={busy}
      className="buddy-bar-btn"
      // Suppress the pre-click focus so no focus ring flashes (same rationale
      // as the old capture button: frameless window, no keyboard nav).
      onMouseDown={(e) => e.preventDefault()}
      style={{
        width: 44,
        height: 44,
        padding: 0,
        borderRadius: '50%',
        border: '1px solid color-mix(in srgb, var(--edge) 60%, transparent)',
        cursor: busy ? 'default' : 'pointer',
        background: 'var(--panel)',
        color: 'var(--fg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Inset highlight only — window is exactly button-height, an outer
        // shadow would clip at the window edge and read as a square halo.
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.18)',
        transition: 'transform 120ms ease, opacity 120ms ease',
        transform: busy ? 'scale(0.92)' : undefined,
        opacity: busy ? 0.7 : 1,
        outline: 'none',
        WebkitAppearance: 'none',
      }}
    >
      {children}
    </button>
  );
}

const ICON_PROPS = {
  width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.8,
  strokeLinecap: 'round', strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

export function BuddyBarApp() {
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    document.body.setAttribute('data-mode', 'buddy-bar');
  }, []);

  const onCapture = useCallback(async () => {
    if (capturing) return;
    setCapturing(true);
    try {
      await window.claude?.buddy?.captureDesktop?.();
    } finally {
      // Hold the pressed state ~150ms so the click is visibly acknowledged.
      setTimeout(() => setCapturing(false), 150);
    }
  }, [capturing]);

  const onOpenMain = useCallback(() => {
    (window.claude?.buddy as any)?.openMain?.();
  }, []);

  const onHide = useCallback(() => {
    (window.claude?.buddy as any)?.dismiss?.();
  }, []);

  return (
    <ThemeProvider>
      <div
        className="buddy-bar-root"
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          background: 'transparent',
        }}
      >
        <BarButton label="Screenshot desktop" onClick={onCapture} busy={capturing}>
          {/* camera */}
          <svg {...ICON_PROPS}>
            <path d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </BarButton>
        <BarButton label="Open YouCoded" onClick={onOpenMain}>
          {/* expand / open-in-window */}
          <svg {...ICON_PROPS}>
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </BarButton>
        <BarButton label="Hide buddy until restart" onClick={onHide}>
          {/* eye-off */}
          <svg {...ICON_PROPS}>
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        </BarButton>
      </div>
    </ThemeProvider>
  );
}
```

- [ ] **Step 4: Delete `BuddyCaptureApp.tsx`, update routing**

1. `git rm src/renderer/components/buddy/BuddyCaptureApp.tsx`
2. `src/renderer/App.tsx`: replace the import `BuddyCaptureApp` with `BuddyBarApp` (from `'./components/buddy/BuddyBarApp'`), and the route `if (buddyMode === 'buddy-capture') return <BuddyCaptureApp />;` → `if (buddyMode === 'buddy-bar') return <BuddyBarApp />;`
3. `src/renderer/index.tsx` (~24): `__buddyMode === 'buddy-capture'` → `__buddyMode === 'buddy-bar'`.
4. `src/renderer/styles/buddy.css`: replace every `buddy-capture` selector token with `buddy-bar` (5 occurrences: the body rule, two html rules, the #root rule, the theme-effects-overlay rule).

- [ ] **Step 5: Typecheck + tests + manual smoke**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

Manual smoke (from the WORKSPACE root, pointing dev at the worktree — `run-dev.sh` runs the main checkout, so instead run the worktree's dev directly):

```bash
cd ../../youcoded-worktrees/buddy-upgrades/desktop && YOUCODED_PORT_OFFSET=50 YOUCODED_PROFILE=dev npm run dev
```

Enable the buddy in Settings → click mascot → verify the 3-button bar appears under the mascot; close chat, drag mascot, reopen → **bar is under the mascot's new position** (the reported bug, fixed). Screenshot button attaches a capture to buddy chat. The other two buttons no-op until Task 5. Shut the dev instance down after checking.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(buddy): replace capture icon with 3-button action bar; fix stale bar position + orphaned bar + dead chat persistence"
```

---

### Task 4: Hover-revealed bar (visibility tracker + fade + click-through)

**Files:**
- Create: `src/main/buddy-bar-visibility.ts`
- Test: `tests/buddy-bar-visibility.test.ts`
- Modify: `src/main/buddy-window-manager.ts` (integrate tracker)
- Modify: `src/main/main.ts` (BUDDY_HOVER_CHANGED handler)
- Modify: `src/renderer/components/buddy/BuddyBarApp.tsx` (fade + hover reporting)
- Modify: `src/renderer/components/buddy/BuddyMascot.tsx` (hover reporting)
- Modify: `src/renderer/styles/buddy.css` (fade animation)

- [ ] **Step 1: Write the failing tracker test**

`tests/buddy-bar-visibility.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BarVisibilityTracker } from '../src/main/buddy-bar-visibility';

describe('BarVisibilityTracker', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows on mascot hover, hides after grace when hover ends', () => {
    const changes: boolean[] = [];
    const t = new BarVisibilityTracker((v) => changes.push(v), 350);
    t.setHover('mascot', true);
    expect(changes).toEqual([true]);
    t.setHover('mascot', false);
    expect(changes).toEqual([true]); // not yet — grace pending
    vi.advanceTimersByTime(349);
    expect(changes).toEqual([true]);
    vi.advanceTimersByTime(2);
    expect(changes).toEqual([true, false]);
  });

  it('crossing the mascot→bar gap within grace does not flicker', () => {
    const changes: boolean[] = [];
    const t = new BarVisibilityTracker((v) => changes.push(v), 350);
    t.setHover('mascot', true);
    t.setHover('mascot', false);      // left mascot…
    vi.advanceTimersByTime(100);
    t.setHover('bar', true);          // …arrived on bar inside grace
    vi.advanceTimersByTime(1000);
    expect(changes).toEqual([true]);  // never hid
  });

  it('stays pinned while chat is open regardless of hover', () => {
    const changes: boolean[] = [];
    const t = new BarVisibilityTracker((v) => changes.push(v), 350);
    t.setChatOpen(true);
    expect(changes).toEqual([true]);
    t.setHover('mascot', true);
    t.setHover('mascot', false);
    vi.advanceTimersByTime(1000);
    expect(changes).toEqual([true]); // chat pins it
    t.setChatOpen(false);
    vi.advanceTimersByTime(351);
    expect(changes).toEqual([true, false]);
  });

  it('reset() clears state without firing callbacks', () => {
    const changes: boolean[] = [];
    const t = new BarVisibilityTracker((v) => changes.push(v), 350);
    t.setHover('bar', true);
    t.reset();
    vi.advanceTimersByTime(1000);
    expect(changes).toEqual([true]);
    expect(t.wantsVisible()).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/buddy-bar-visibility.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/buddy-bar-visibility.ts`**

```ts
/**
 * Decides whether the buddy action bar should be visible.
 * Inputs: per-source hover (mascot window, bar window) and chat-open state.
 * Rule (spec §4.1): visible while hovering OR while the chat is open.
 * A grace timeout on hover-loss lets the cursor cross the ~6px gap between
 * the mascot and the bar without the bar flickering out.
 * Pure logic + injected timers — unit-tested without Electron.
 */
export class BarVisibilityTracker {
  private hovered = new Set<'mascot' | 'bar'>();
  private chatOpen = false;
  private graceTimer: NodeJS.Timeout | null = null;
  private visible = false;

  constructor(
    private readonly onChange: (visible: boolean) => void,
    private readonly graceMs = 350,
  ) {}

  setHover(source: 'mascot' | 'bar', hovering: boolean): void {
    if (hovering) this.hovered.add(source);
    else this.hovered.delete(source);
    this.recompute();
  }

  setChatOpen(open: boolean): void {
    this.chatOpen = open;
    this.recompute();
  }

  wantsVisible(): boolean {
    return this.chatOpen || this.hovered.size > 0;
  }

  /** Drop all state without firing onChange — used when the buddy is torn down. */
  reset(): void {
    this.cancelGrace();
    this.hovered.clear();
    this.chatOpen = false;
    this.visible = false;
  }

  private recompute(): void {
    const want = this.wantsVisible();
    if (want) {
      // Any return-to-wanted state cancels a pending hide.
      this.cancelGrace();
      if (!this.visible) {
        this.visible = true;
        this.onChange(true);
      }
      return;
    }
    if (!this.visible || this.graceTimer) return;
    this.graceTimer = setTimeout(() => {
      this.graceTimer = null;
      // Re-check: state may have changed while the timer was pending.
      if (!this.wantsVisible()) {
        this.visible = false;
        this.onChange(false);
      }
    }, this.graceMs);
  }

  private cancelGrace(): void {
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/buddy-bar-visibility.test.ts`
Expected: PASS.

- [ ] **Step 5: Integrate into `BuddyWindowManager`**

1. Import + field + wiring:

```ts
import { BarVisibilityTracker } from './buddy-bar-visibility';
```

```ts
  // Decides bar visibility from hover + chat-open (spec §4.1). The bar
  // BrowserWindow stays shown once created; reveals are CSS fades driven by
  // the buddy:bar-state push, and click-through is toggled alongside so the
  // invisible bar never eats clicks meant for windows underneath.
  private readonly barVisibility = new BarVisibilityTracker((visible) => this.applyBarVisible(visible));
  private barCssVisible = false;
```

2. New methods:

```ts
  /** Renderer hover reports land here (buddy:hover-changed IPC). */
  reportHover(source: 'mascot' | 'bar', hovering: boolean): void {
    this.barVisibility.setHover(source, hovering);
  }

  private applyBarVisible(visible: boolean): void {
    this.barCssVisible = visible;
    if (visible) {
      // Reposition-before-reveal: mascot may have moved while the bar was
      // hidden (the Task 3 bug class — never show at a stale position).
      this.showBar();
      const bar = this.bar;
      if (bar && !bar.isDestroyed()) {
        bar.setIgnoreMouseEvents(false);
        bar.webContents.send(IPC_BAR_STATE, { visible: true });
      }
    } else {
      const bar = this.bar;
      if (bar && !bar.isDestroyed()) {
        bar.webContents.send(IPC_BAR_STATE, { visible: false });
        // Let the 150ms CSS fade finish, then make the window click-through.
        // forward:true keeps mousemove flowing to the page so hovering the
        // (invisible) bar zone can still re-summon it — a nice grace region.
        setTimeout(() => {
          if (this.bar && !this.bar.isDestroyed() && !this.barCssVisible) {
            this.bar.setIgnoreMouseEvents(true, { forward: true });
          }
        }, 180);
      }
    }
  }
```

Add the channel constants at the top of buddy-window-manager.ts (it doesn't import shared/types today — keep it dependency-free with local consts):

```ts
// Push-channel names (kept as local consts — this module deliberately doesn't
// import shared/types; values must match IPC.* in src/shared/types.ts).
const IPC_BAR_STATE = 'buddy:bar-state';
```

3. In `showBar()`, after creation, push the current state once the renderer is ready (first reveal races page load):

```ts
      this.bar.webContents.once('did-finish-load', () => {
        if (this.bar && !this.bar.isDestroyed()) {
          this.bar.webContents.send(IPC_BAR_STATE, { visible: this.barCssVisible });
        }
      });
```

4. Replace the direct `showBar()`/`hideBar()` calls in `toggleChat()`/`createChat()` with tracker inputs:
   - `createChat()` end: `this.barVisibility.setChatOpen(true);`
   - `toggleChat()` hide branch: `this.chat.hide(); this.barVisibility.setChatOpen(false);`
   - `toggleChat()` re-show branch: after `this.chat.show();` → `this.barVisibility.setChatOpen(true);`
   - chat `closed` handler: replace `this.hideBar()` with `this.barVisibility.setChatOpen(false);`
5. In `hide()`: add `this.barVisibility.reset(); this.barCssVisible = false;` before destroying windows.
6. In `moveMascot`, gate the bar-follow on `this.barCssVisible` (not Electron `isVisible()` — the window stays Electron-visible once created):

```ts
    if (this.bar && !this.bar.isDestroyed() && this.barCssVisible) {
```

- [ ] **Step 6: main.ts handler**

Next to the other buddy handlers (~1295):

```ts
  // High-frequency-ish (pointer enter/leave) — fire-and-forget like move-mascot.
  ipcMain.on(IPC.BUDDY_HOVER_CHANGED, (_evt, p: { source: 'mascot' | 'bar'; hovering: boolean }) => {
    if (p && (p.source === 'mascot' || p.source === 'bar')) {
      buddyManager.reportHover(p.source, !!p.hovering);
    }
  });
```

- [ ] **Step 7: Renderer hover reporting + fade**

1. `BuddyMascot.tsx` — on the root div add:

```tsx
      onPointerEnter={() => (window.claude?.buddy as any)?.reportHover?.({ source: 'mascot', hovering: true })}
      onPointerLeave={() => (window.claude?.buddy as any)?.reportHover?.({ source: 'mascot', hovering: false })}
```

2. `BuddyBarApp.tsx` — subscribe to bar-state and report hover. Add to the component:

```tsx
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const off = (window.claude?.buddy as any)?.onBarState?.((s: { visible: boolean }) => setVisible(!!s.visible));
    return off;
  }, []);
```

On the root div: add `data-visible={visible ? '1' : '0'}` and the hover props:

```tsx
        onPointerEnter={() => (window.claude?.buddy as any)?.reportHover?.({ source: 'bar', hovering: true })}
        onPointerLeave={() => (window.claude?.buddy as any)?.reportHover?.({ source: 'bar', hovering: false })}
```

3. `buddy.css` — append:

```css
/* Action bar fade+rise. The BrowserWindow stays shown; reveal/dismiss is CSS
   so it can animate (Electron show/hide cannot). Click-through while hidden
   is enforced main-side via setIgnoreMouseEvents. */
body[data-mode="buddy-bar"] .buddy-bar-root {
  transition: opacity 150ms ease, translate 150ms ease;
}
body[data-mode="buddy-bar"] .buddy-bar-root[data-visible="0"] {
  opacity: 0;
  translate: 0 4px;
  pointer-events: none;
}
```

- [ ] **Step 8: Typecheck + tests + manual smoke**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

Dev-instance smoke: with chat CLOSED, hover the mascot → bar fades in; move down onto the bar → stays; move away → fades out after ~350ms; open chat → bar stays without hover; click something under where the hidden bar sits → click lands (ignoreMouseEvents works).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(buddy): hover-revealed action bar with grace timeout, CSS fade, click-through when hidden"
```

---

### Task 5: Dismiss, status, open-main

**Files:**
- Modify: `src/main/buddy-window-manager.ts` (dismissed flag + status)
- Modify: `src/main/main.ts` (three handlers + status broadcast dep)
- Modify: `src/renderer/App.tsx` (focus-request listener)

- [ ] **Step 1: Manager additions**

```ts
  // "Hide until restart": set by the bar's hide button (buddy:dismiss), cleared
  // by any show(). localStorage['youcoded-buddy-enabled'] is untouched — the
  // preference stays on; only this run's windows go away. (spec §7)
  private dismissed = false;
```

Add to `BuddyWindowManagerDeps`:

```ts
  /** Broadcast { dismissed, visible } to all windows (buddy:status-changed). */
  onStatusChanged(status: { dismissed: boolean; visible: boolean }): void;
```

New/changed methods:

```ts
  getStatus(): { dismissed: boolean; visible: boolean } {
    return {
      dismissed: this.dismissed,
      visible: !!(this.mascot && !this.mascot.isDestroyed()),
    };
  }

  /** Hide-for-this-run (bar hide button). Preference untouched. */
  dismiss(): void {
    this.hide();
    this.dismissed = true;
    this.deps.onStatusChanged(this.getStatus());
  }
```

At the END of `show()` add:

```ts
    this.dismissed = false;
    this.deps.onStatusChanged(this.getStatus());
```

At the END of `hide()` add (settings-off also clears the dismissed flag — a disabled buddy isn't "hidden until restart"):

```ts
    this.dismissed = false;
    this.deps.onStatusChanged(this.getStatus());
```

(Note `dismiss()` sets `dismissed = true` AFTER calling `hide()`, so the order works; it then broadcasts a second time with the final value.)

- [ ] **Step 2: main.ts wiring**

1. In the `new BuddyWindowManager({...})` deps object add:

```ts
    onStatusChanged: (status) => {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send(IPC.BUDDY_STATUS_CHANGED, status);
      }
    },
```

2. Handlers next to the existing buddy handlers:

```ts
  ipcMain.handle(IPC.BUDDY_DISMISS, () => buddyManager.dismiss());
  ipcMain.handle(IPC.BUDDY_GET_STATUS, () => buddyManager.getStatus());
  // Restore + focus the main window, then ask it to switch to the buddy's
  // viewed session so the user lands in the same conversation (spec §4.2).
  ipcMain.handle(IPC.BUDDY_OPEN_MAIN, () => {
    // Same source of truth the buddyManager deps use for mainWindow.
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    const sid = buddyManager.getViewedSession();
    if (sid) win.webContents.send(IPC.SESSION_FOCUS_REQUEST, sid);
  });
```

(Check what the buddyManager deps' `mainWindow: () => ...` closure returns at ~main.ts:1289 and use the same variable. If it's a function like `getMainWindow()`, call that.)

- [ ] **Step 3: App.tsx focus-request listener**

In the main app component (AppInner — same scope as the attention-reporter effect ~line 601, where `sessions` and `setSessionId` are in scope):

```tsx
  // Buddy "open main app" → land on the buddy's viewed session. Ref-based so
  // the IPC subscription survives sessions-array churn without resubscribing.
  const sessionsForFocusRef = useRef(sessions);
  useEffect(() => { sessionsForFocusRef.current = sessions; }, [sessions]);
  useEffect(() => {
    const off = (window.claude?.buddy as any)?.onFocusSession?.((sid: string) => {
      if (sessionsForFocusRef.current.some((s: any) => s.id === sid)) {
        setSessionId(sid);
        (window as any).claude?.session?.switch?.(sid);
      }
    });
    return off;
  }, []);
```

- [ ] **Step 4: Typecheck + tests + manual smoke**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

Dev smoke: hide button → all buddy windows vanish; re-enable via the settings toggle cycle (restyle comes next task); open-main button with main minimized → restores + focuses and switches to the buddy's session.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(buddy): dismiss-for-run, live status, open-main-app action"
```

---

### Task 6: Settings row restyle

**Files:**
- Modify: `src/renderer/components/SettingsPanel.tsx` (the `BuddyToggle` function ~line 668)

- [ ] **Step 1: Replace `BuddyToggle` wholesale**

The current checkbox row becomes the app's standard row (icon + title + status description) with the exported `Toggle` switch (same as `AnalyticsOptInToggle`), plus a "Show now" affordance while dismissed:

```tsx
// ─── Buddy floater toggle ─────────────────────────────────────────────────
// Standard settings row (icon + title + status + <Toggle>), replacing the old
// raw checkbox (Destin, 2026-07-10). Persists via
// localStorage['youcoded-buddy-enabled']; App.tsx reads the flag on mount to
// auto-show. Subscribes to buddy:status-changed so the "Hidden until restart"
// state (bar hide button) renders live, with an inline Show-now recovery.
function BuddyToggle() {
  const [enabled, setEnabled] = useState<boolean>(() =>
    localStorage.getItem('youcoded-buddy-enabled') === '1',
  );
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let alive = true;
    (window.claude.buddy as any)?.getStatus?.()
      .then((s: { dismissed: boolean }) => { if (alive) setDismissed(!!s?.dismissed); })
      .catch(() => {});
    const off = (window.claude.buddy as any)?.onStatusChanged?.(
      (s: { dismissed: boolean }) => setDismissed(!!s?.dismissed),
    );
    return () => { alive = false; off?.(); };
  }, []);

  const toggle = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem('youcoded-buddy-enabled', next ? '1' : '0');
    if (next) window.claude.buddy?.show?.();
    else window.claude.buddy?.hide?.();
  }, [enabled]);

  const showNow = useCallback(() => {
    window.claude.buddy?.show?.(); // show() clears the dismissed flag main-side
  }, []);

  const status = !enabled
    ? 'Off'
    : dismissed
    ? 'Hidden until restart'
    : 'On — floating on your desktop';

  return (
    <section>
      <h3 className="text-[10px] font-medium text-fg-muted tracking-wider uppercase mb-3">Buddy</h3>
      <div className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-inset/50 hover:bg-inset transition-colors">
        {/* Little buddy face icon — matches the 32×20 icon holder other rows use */}
        <div className="flex items-center justify-center shrink-0" style={{ width: 32, height: 20 }}>
          <svg className="w-4 h-4 text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <circle cx="9" cy="10.5" r="0.6" fill="currentColor" />
            <circle cx="15" cy="10.5" r="0.6" fill="currentColor" />
            <path d="M9 14.5 Q12 17 15 14.5" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-fg font-medium">Buddy floater</div>
          <div className="text-[10px] text-fg-muted mt-0.5">
            {status}
            {enabled && dismissed && (
              <>
                {' · '}
                <button onClick={showNow} className="text-accent hover:underline">Show now</button>
              </>
            )}
          </div>
        </div>
        <Toggle enabled={enabled} onToggle={toggle} />
      </div>
    </section>
  );
}
```

(`Toggle` is defined in this same file ~line 263 — no import needed. Keep the existing "no `<BuddyToggle />` on Android" comment at the remote-settings render site.)

- [ ] **Step 2: Typecheck + manual check**

Run: `npx tsc --noEmit`
Expected: clean.

Dev smoke: Settings → Buddy row shows the switch; toggle on/off works; with buddy on, click the bar's hide button → row flips to "Hidden until restart · Show now" live; Show now brings it back.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/SettingsPanel.tsx
git commit -m "feat(buddy): settings row restyle — Toggle switch, live status, Show-now recovery"
```

---

### Task 7: Rig SVG sanitizer (TDD)

**Files:**
- Create: `src/renderer/components/mascot/sanitize-rig-svg.ts`
- Test: `tests/sanitize-rig-svg.test.tsx` (**`.tsx` extension is required** — vitest's `environmentMatchGlobs` gives jsdom only to `tests/**/*.tsx`; the sanitizer needs DOMParser)

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { sanitizeRigSvg } from '../src/renderer/components/mascot/sanitize-rig-svg';

const wrap = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">${inner}</svg>`;

describe('sanitizeRigSvg', () => {
  it('returns null for non-SVG and unparseable input', () => {
    expect(sanitizeRigSvg('<div>nope</div>')).toBeNull();
    expect(sanitizeRigSvg('<<<garbage')).toBeNull();
  });

  it('preserves rig groups, data-pivot, and shapes', () => {
    const out = sanitizeRigSvg(wrap('<g id="rig-arm-left" data-pivot="18 38"><rect x="1" y="2" width="3" height="4"/></g>'));
    expect(out).toContain('rig-arm-left');
    expect(out).toContain('data-pivot="18 38"');
    expect(out).toContain('<rect');
  });

  it('strips script, foreignObject, and style tags', () => {
    const out = sanitizeRigSvg(wrap('<script>alert(1)</script><foreignObject><body/></foreignObject><style>@import url(http://evil)</style><g id="rig-body"/>'));
    expect(out).not.toContain('script');
    expect(out).not.toContain('foreignObject');
    expect(out).not.toContain('style>');
    expect(out).toContain('rig-body');
  });

  it('strips on* event handler attributes', () => {
    const out = sanitizeRigSvg(wrap('<g id="rig-body" onclick="evil()" onload="evil()"/>'));
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('onload');
  });

  it('strips external hrefs but keeps same-document refs and data: images', () => {
    const out = sanitizeRigSvg(wrap(
      '<use href="#part"/><image href="data:image/png;base64,AAAA"/><image href="https://evil.example/x.png"/>'
    ));
    expect(out).toContain('href="#part"');
    expect(out).toContain('data:image/png');
    expect(out).not.toContain('evil.example');
  });

  it('strips style attributes containing external url()', () => {
    const out = sanitizeRigSvg(wrap('<g id="rig-body" style="fill: url(http://evil.example/f.svg#x)"/>'));
    expect(out).not.toContain('evil.example');
  });

  it('keeps benign style attributes (display:none face groups)', () => {
    const out = sanitizeRigSvg(wrap('<g id="rig-face-blink" style="display:none"><path d="M1 1h2"/></g>'));
    expect(out).toContain('display:none');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/sanitize-rig-svg.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
/**
 * Sanitizes a theme-provided rig SVG before it is inlined into the buddy DOM.
 *
 * SECURITY BOUNDARY: themes are third-party content, and inline SVG executes
 * in our renderer with access to window.claude. Everything that can run
 * script or reach the network is stripped; only static drawing content,
 * same-document references (#id) and embedded data:image/* rasters survive.
 * Registry-side CI validation is a follow-up — THIS function is the guarantee.
 *
 * Pure (DOMParser is available in the renderer and jsdom tests). Returns the
 * serialized sanitized SVG, or null when the input isn't a parseable SVG.
 */
const BLOCKED_TAGS = ['script', 'foreignObject', 'iframe', 'object', 'embed', 'link', 'meta', 'style', 'animate', 'animateTransform', 'animateMotion', 'set'];

export function sanitizeRigSvg(svgText: string): string | null {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  } catch {
    return null;
  }
  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return null;

  for (const tag of BLOCKED_TAGS) {
    // SVG is case-sensitive but sloppy authors aren't — match both spellings.
    doc.querySelectorAll(`${tag}, ${tag.toLowerCase()}`).forEach((el) => el.remove());
  }

  const scrub = (el: Element): void => {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
      } else if (name === 'href' || name === 'xlink:href') {
        if (!(value.startsWith('#') || value.toLowerCase().startsWith('data:image/'))) {
          el.removeAttribute(attr.name);
        }
      } else if (name === 'style' && /url\s*\(\s*['"]?\s*(?!#|data:image\/)/i.test(value)) {
        // fill:url(https://…) can exfiltrate via fetch — allow only #refs/data images.
        el.removeAttribute(attr.name);
      }
    }
    for (const child of [...el.children]) scrub(child);
  };
  scrub(root);

  return new XMLSerializer().serializeToString(root);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/sanitize-rig-svg.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/mascot/sanitize-rig-svg.ts tests/sanitize-rig-svg.test.tsx
git commit -m "feat(mascot): rig SVG sanitizer — the security boundary for third-party rigs"
```

---

### Task 8: Poses, pivots, springs (TDD)

**Files:**
- Create: `src/renderer/components/mascot/mascot-poses.ts`
- Test: `tests/mascot-poses.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  parsePivot, defaultPivot, POSES, stepSpring, isSettled, dragTargets,
  LIMB_IDS,
} from '../src/renderer/components/mascot/mascot-poses';

describe('parsePivot', () => {
  it('parses "x y" and "x,y"', () => {
    expect(parsePivot('18 38')).toEqual({ x: 18, y: 38 });
    expect(parsePivot('18,38')).toEqual({ x: 18, y: 38 });
    expect(parsePivot(' 18.5  38 ')).toEqual({ x: 18.5, y: 38 });
  });
  it('rejects malformed input', () => {
    expect(parsePivot(null)).toBeNull();
    expect(parsePivot('')).toBeNull();
    expect(parsePivot('18')).toBeNull();
    expect(parsePivot('a b')).toBeNull();
  });
});

describe('defaultPivot', () => {
  const bbox = { x: 10, y: 20, width: 8, height: 20 };
  it('arms/legs pivot at top-center (shoulder/hip)', () => {
    expect(defaultPivot('rig-arm-left', bbox)).toEqual({ x: 14, y: 20 });
    expect(defaultPivot('rig-leg-right', bbox)).toEqual({ x: 14, y: 20 });
  });
  it('head pivots at bottom-center (neck)', () => {
    expect(defaultPivot('rig-head', bbox)).toEqual({ x: 14, y: 40 });
  });
});

describe('POSES', () => {
  it('every pose names only known part ids and a valid face', () => {
    for (const pose of Object.values(POSES)) {
      expect(['idle', 'shocked']).toContain(pose.face);
      for (const id of Object.keys(pose.parts)) {
        expect([...LIMB_IDS, 'rig-head', 'rig-body']).toContain(id);
      }
    }
  });
  it('peek raises both arms (hands gripping the edge)', () => {
    expect(POSES.peek.parts['rig-arm-left']!.rotate!).toBeLessThan(0);
    expect(POSES.peek.parts['rig-arm-right']!.rotate!).toBeGreaterThan(0);
  });
});

describe('stepSpring', () => {
  it('converges to the target and settles', () => {
    let s = { value: 0, velocity: 0 };
    for (let i = 0; i < 300; i++) s = stepSpring(s, 20, 16);
    expect(s.value).toBeCloseTo(20, 0);
    expect(isSettled(s, 20)).toBe(true);
  });
  it('overshoots on the way (underdamped wobble)', () => {
    let s = { value: 0, velocity: 0 };
    let maxV = 0;
    for (let i = 0; i < 300; i++) { s = stepSpring(s, 20, 16); maxV = Math.max(maxV, s.value); }
    expect(maxV).toBeGreaterThan(20); // the wobble is the feature
  });
  it('clamps huge dt so a paused rAF cannot explode the spring', () => {
    let s = { value: 0, velocity: 0 };
    s = stepSpring(s, 20, 5000);
    expect(Number.isFinite(s.value)).toBe(true);
    expect(Math.abs(s.value)).toBeLessThan(100);
  });
});

describe('dragTargets', () => {
  it('limbs trail opposite the direction of horizontal motion', () => {
    const t = dragTargets(10, 0); // moving right → limbs lag left (negative rotation)
    expect(t['rig-arm-left']).toBeLessThan(0);
    expect(t['rig-leg-left']).toBeLessThan(0);
  });
  it('is clamped', () => {
    const t = dragTargets(10000, 10000);
    for (const v of Object.values(t)) expect(Math.abs(v)).toBeLessThanOrEqual(45);
  });
  it('zero velocity → zero targets', () => {
    const t = dragTargets(0, 0);
    for (const v of Object.values(t)) expect(v).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/mascot-poses.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/renderer/components/mascot/mascot-poses.ts`**

```ts
/**
 * Pose + physics data for rigged mascots (spec §3.3, §5).
 *
 * Poses are DATA acting on named rig parts — themes author parts once, the
 * app defines behaviors centrally. New poses/animations ship in app updates
 * and apply to every existing rig with no re-authoring.
 */

export const LIMB_IDS = ['rig-arm-left', 'rig-arm-right', 'rig-leg-left', 'rig-leg-right'] as const;
export type LimbId = (typeof LIMB_IDS)[number];
export type RigPartId = LimbId | 'rig-head' | 'rig-body';
export type FaceName = 'idle' | 'shocked';
export type PoseName = 'idle' | 'shocked' | 'welcome' | 'peek';

export interface PartPose { rotate?: number; translateX?: number; translateY?: number; }
export interface PoseDef { parts: Partial<Record<RigPartId, PartPose>>; face: FaceName; }

// Rotation values assume limbs drawn HANGING DOWN from their pivot (the
// default-rig convention, documented in theme-spec.md). ±160° ≈ raised
// straight up. Tuned during QA; treat as starting points, not magic.
export const POSES: Record<PoseName, PoseDef> = {
  idle:    { parts: {}, face: 'idle' },
  shocked: { parts: { 'rig-arm-left': { rotate: -130 }, 'rig-arm-right': { rotate: 130 } }, face: 'shocked' },
  welcome: { parts: { 'rig-arm-right': { rotate: 160 } }, face: 'idle' },
  // Peek: both arms up = little hands gripping the screen edge while the
  // body sinks past it (BuddyMascot applies the container sink transform).
  peek:    { parts: { 'rig-arm-left': { rotate: -160 }, 'rig-arm-right': { rotate: 160 } }, face: 'idle' },
};

/** Parse a data-pivot="x y" attribute (viewBox coordinates). */
export function parsePivot(attr: string | null): { x: number; y: number } | null {
  if (!attr) return null;
  const parts = attr.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 2 || parts.some(Number.isNaN)) return null;
  return { x: parts[0], y: parts[1] };
}

/** Fallback pivot when a part declares no data-pivot: arms/legs hinge at
 *  top-center (shoulder/hip), the head at bottom-center (neck). */
export function defaultPivot(
  partId: RigPartId,
  bbox: { x: number; y: number; width: number; height: number },
): { x: number; y: number } {
  const cx = bbox.x + bbox.width / 2;
  return partId === 'rig-head'
    ? { x: cx, y: bbox.y + bbox.height }
    : { x: cx, y: bbox.y };
}

// ── Spring physics (limb trailing during drag) ──
export interface SpringState { value: number; velocity: number; }

// Underdamped on purpose: the release overshoot IS the "carried soft toy"
// wobble. dt clamped so a backgrounded rAF resuming with a huge delta can't
// explode the integration.
export function stepSpring(s: SpringState, target: number, dtMs: number, stiffness = 170, damping = 16): SpringState {
  const dt = Math.min(dtMs, 64) / 1000;
  const accel = stiffness * (target - s.value) - damping * s.velocity;
  const velocity = s.velocity + accel * dt;
  return { value: s.value + velocity * dt, velocity };
}

export function isSettled(s: SpringState, target: number): boolean {
  return Math.abs(s.value - target) < 0.15 && Math.abs(s.velocity) < 0.15;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Per-limb rotation targets (degrees) from smoothed drag velocity
 *  (px/frame). Limbs trail OPPOSITE the motion — body leads, extremities lag. */
export function dragTargets(vx: number, vy: number): Record<LimbId, number> {
  const lean = clamp(-vx * 1.6, -28, 28);
  const lift = clamp(vy * 0.8, -10, 10);
  return {
    'rig-arm-left': clamp(lean * 1.4 + lift, -45, 45),
    'rig-arm-right': clamp(lean * 1.4 - lift, -45, 45),
    'rig-leg-left': clamp(lean * 1.1, -45, 45),
    'rig-leg-right': clamp(lean * 1.1, -45, 45),
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/mascot-poses.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/mascot/mascot-poses.ts tests/mascot-poses.test.ts
git commit -m "feat(mascot): pose data, pivot parsing, spring physics for rig animation"
```

---

### Task 9: Default rig + MascotRig component

**Files:**
- Create: `src/renderer/components/mascot/default-buddy-rig.ts`
- Create: `src/renderer/components/mascot/MascotRig.tsx`

- [ ] **Step 1: Create the first-party default rig**

`src/renderer/components/mascot/default-buddy-rig.ts`:

```ts
/**
 * First-party default buddy character (spec §3.6) — a friendly round blob
 * with stubby limbs. Ships as a rig so every user gets limb-trailing drag,
 * blinks, and peek-with-hands out of the box, and serves as the reference
 * implementation of the rig contract (docs/theme-spec.md).
 *
 * Theme-tinted: body/limbs use var(--accent), face uses var(--on-accent) —
 * the theme contrast rules guarantee ≥4.5:1 between those two tokens.
 * Limbs are drawn HANGING DOWN from their data-pivot (the pose-data convention).
 * Limbs are defined BEFORE the body so they paint behind it.
 */
export const DEFAULT_BUDDY_RIG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
  <g id="rig-arm-left" data-pivot="17 38">
    <rect x="12" y="34" width="9" height="21" rx="4.5" fill="var(--accent)"/>
  </g>
  <g id="rig-arm-right" data-pivot="63 38">
    <rect x="59" y="34" width="9" height="21" rx="4.5" fill="var(--accent)"/>
  </g>
  <g id="rig-leg-left" data-pivot="33 58">
    <rect x="29" y="56" width="8" height="16" rx="4" fill="var(--accent)"/>
  </g>
  <g id="rig-leg-right" data-pivot="47 58">
    <rect x="43" y="56" width="8" height="16" rx="4" fill="var(--accent)"/>
  </g>
  <g id="rig-body">
    <circle cx="40" cy="40" r="24" fill="var(--accent)"/>
  </g>
  <g id="rig-face-idle">
    <circle cx="32" cy="36" r="2.6" fill="var(--on-accent)"/>
    <circle cx="48" cy="36" r="2.6" fill="var(--on-accent)"/>
    <path d="M33 46 Q40 52 47 46" stroke="var(--on-accent)" stroke-width="2.5" stroke-linecap="round" fill="none"/>
  </g>
  <g id="rig-face-shocked" style="display:none">
    <circle cx="32" cy="35" r="3.4" fill="var(--on-accent)"/>
    <circle cx="48" cy="35" r="3.4" fill="var(--on-accent)"/>
    <ellipse cx="40" cy="48" rx="4" ry="5.5" fill="var(--on-accent)"/>
  </g>
  <g id="rig-face-blink" style="display:none">
    <path d="M29 36 h6" stroke="var(--on-accent)" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M45 36 h6" stroke="var(--on-accent)" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M33 46 Q40 52 47 46" stroke="var(--on-accent)" stroke-width="2.5" stroke-linecap="round" fill="none"/>
  </g>
</svg>`;
```

- [ ] **Step 2: Create `src/renderer/components/mascot/MascotRig.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { sanitizeRigSvg } from './sanitize-rig-svg';
import { DEFAULT_BUDDY_RIG } from './default-buddy-rig';
import {
  POSES, LIMB_IDS, parsePivot, defaultPivot, stepSpring, isSettled, dragTargets,
  type PoseName, type SpringState, type LimbId, type RigPartId,
} from './mascot-poses';

export interface RigMotion { vx: number; vy: number; dragging: boolean; }

interface MascotRigProps {
  /** theme-asset:// URL of the theme's rig, or null → first-party default rig. */
  svgUrl: string | null;
  pose: PoseName;
  /** Mutable drag-velocity ref written by the drag handler (BuddyMascot).
   *  A ref, not state — pointermove-rate re-renders would defeat the point. */
  motionRef: React.MutableRefObject<RigMotion>;
  /** Disables blink + limb springs (reduced-effects mode). Pose changes remain. */
  reducedEffects: boolean;
}

interface Parts {
  byId: Map<RigPartId, SVGGElement>;
  faces: { idle: SVGGElement | null; shocked: SVGGElement | null; blink: SVGGElement | null };
}

/**
 * Renders a rigged mascot SVG and animates it (spec §3).
 * - Fetches + sanitizes the theme rig (or uses the bundled default).
 * - Applies poses as transforms on named part groups (CSS-transitioned).
 * - Runs per-limb rotation springs during drag for the trailing-limbs feel.
 * - Blinks by swapping the face group every 6–12s.
 */
export function MascotRig({ svgUrl, pose, motionRef, reducedEffects }: MascotRigProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [svgHtml, setSvgHtml] = useState<string | null>(null);
  const partsRef = useRef<Parts | null>(null);
  const springsRef = useRef<Map<LimbId, SpringState>>(new Map());
  const poseRef = useRef<PoseName>(pose);
  poseRef.current = pose;
  const [blinking, setBlinking] = useState(false);

  // ── Load + sanitize ──
  useEffect(() => {
    let alive = true;
    if (!svgUrl) {
      setSvgHtml(sanitizeRigSvg(DEFAULT_BUDDY_RIG));
      return;
    }
    // theme-asset:// is registered with supportFetchAPI:true (main.ts), so
    // fetch works. Sanitization is the security boundary — see sanitize-rig-svg.
    fetch(svgUrl)
      .then((r) => r.text())
      .then((text) => { if (alive) setSvgHtml(sanitizeRigSvg(text)); })
      .catch(() => { if (alive) setSvgHtml(sanitizeRigSvg(DEFAULT_BUDDY_RIG)); });
    return () => { alive = false; };
  }, [svgUrl]);

  // ── Index parts + set pivots after the SVG lands in the DOM ──
  useEffect(() => {
    if (!svgHtml || !hostRef.current) { partsRef.current = null; return; }
    const svg = hostRef.current.querySelector('svg');
    if (!svg) { partsRef.current = null; return; }
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    const byId = new Map<RigPartId, SVGGElement>();
    const allIds: RigPartId[] = [...LIMB_IDS, 'rig-head', 'rig-body'];
    for (const id of allIds) {
      const el = svg.querySelector<SVGGElement>(`#${id}`);
      if (!el) continue;
      byId.set(id, el);
      if (id === 'rig-body') continue;
      const pivot = parsePivot(el.getAttribute('data-pivot'))
        ?? (() => { try { return defaultPivot(id, el.getBBox()); } catch { return null; } })();
      if (pivot) {
        // transform-box:view-box makes transform-origin viewBox-relative,
        // matching the data-pivot coordinate space.
        (el.style as any).transformBox = 'view-box';
        el.style.transformOrigin = `${pivot.x}px ${pivot.y}px`;
      }
    }
    partsRef.current = {
      byId,
      faces: {
        idle: svg.querySelector<SVGGElement>('#rig-face-idle'),
        shocked: svg.querySelector<SVGGElement>('#rig-face-shocked'),
        blink: svg.querySelector<SVGGElement>('#rig-face-blink'),
      },
    };
    springsRef.current = new Map();
    applyPose(partsRef.current, poseRef.current, blinking, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svgHtml]);

  // ── Pose + face application ──
  useEffect(() => {
    if (partsRef.current) applyPose(partsRef.current, pose, blinking, false);
  }, [pose, blinking]);

  // ── Blink loop ──
  useEffect(() => {
    if (reducedEffects) return;
    let closeTimer: NodeJS.Timeout | null = null;
    let openTimer: NodeJS.Timeout | null = null;
    let stopped = false;
    const schedule = () => {
      if (stopped) return;
      closeTimer = setTimeout(() => {
        // Skip blinks mid-drag and while shocked — eyes-wide states.
        if (!motionRef.current.dragging && poseRef.current !== 'shocked' && partsRef.current?.faces.blink) {
          setBlinking(true);
          openTimer = setTimeout(() => { setBlinking(false); schedule(); }, 120);
        } else {
          schedule();
        }
      }, 6000 + Math.random() * 6000);
    };
    schedule();
    return () => {
      stopped = true;
      if (closeTimer) clearTimeout(closeTimer);
      if (openTimer) clearTimeout(openTimer);
      setBlinking(false);
    };
  }, [reducedEffects, motionRef]);

  // ── Limb springs (drag trailing) ──
  useEffect(() => {
    if (reducedEffects) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = now - last;
      last = now;
      const parts = partsRef.current;
      if (!parts) return;
      const m = motionRef.current;
      const targets = m.dragging ? dragTargets(m.vx, m.vy) : ZERO_TARGETS;
      let anyActive = m.dragging;
      for (const id of LIMB_IDS) {
        const el = parts.byId.get(id);
        if (!el) continue;
        let s = springsRef.current.get(id) ?? { value: 0, velocity: 0 };
        if (!m.dragging && isSettled(s, 0) && s.value === 0) continue;
        s = stepSpring(s, targets[id], dt);
        if (!m.dragging && isSettled(s, 0)) s = { value: 0, velocity: 0 };
        else anyActive = true;
        springsRef.current.set(id, s);
        const base = POSES[poseRef.current].parts[id]?.rotate ?? 0;
        // Direct per-frame write — disable the pose transition while springing.
        el.style.transition = 'none';
        el.style.transform = `rotate(${base + s.value}deg)`;
      }
      if (!anyActive) {
        // Springs settled — restore transition-driven pose transforms.
        for (const id of LIMB_IDS) {
          const el = parts.byId.get(id);
          if (el) el.style.transition = '';
        }
        applyPose(parts, poseRef.current, blinking, false);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedEffects]);

  return (
    <div
      ref={hostRef}
      style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
      // Sanitized upstream — sanitizeRigSvg is the security boundary.
      dangerouslySetInnerHTML={svgHtml ? { __html: svgHtml } : undefined}
    />
  );
}

const ZERO_TARGETS: Record<LimbId, number> = {
  'rig-arm-left': 0, 'rig-arm-right': 0, 'rig-leg-left': 0, 'rig-leg-right': 0,
};

function applyPose(parts: Parts, pose: PoseName, blinking: boolean, instant: boolean): void {
  const def = POSES[pose];
  for (const [id, el] of parts.byId) {
    if (id === 'rig-body') continue;
    const p = def.parts[id] ?? {};
    el.style.transition = instant ? 'none' : 'transform 180ms ease-out';
    el.style.transform = `translate(${p.translateX ?? 0}px, ${p.translateY ?? 0}px) rotate(${p.rotate ?? 0}deg)`;
  }
  const { idle, shocked, blink } = parts.faces;
  const want: 'idle' | 'shocked' | 'blink' =
    blinking && blink && def.face === 'idle' ? 'blink' : def.face;
  if (idle) idle.style.display = want === 'idle' ? '' : 'none';
  if (shocked) shocked.style.display = want === 'shocked' ? '' : 'none';
  if (blink) blink.style.display = want === 'blink' ? '' : 'none';
}
```

- [ ] **Step 3: Add the `rig` key to the theme type**

`src/renderer/themes/theme-types.ts` line 90:

```ts
export type ThemeMascot = Partial<Record<MascotVariant, string>> & {
  /** Optional rigged SVG (named part groups + data-pivot attrs) — the
   *  preferred mascot format. See desktop/docs/theme-spec.md → "Mascot rig".
   *  Resolved to theme-asset:// by theme-asset-resolver like the flat variants
   *  (its Object.entries loop is key-agnostic — no resolver change needed). */
  rig?: string;
};
```

- [ ] **Step 4: Typecheck + full tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/mascot/ src/renderer/themes/theme-types.ts
git commit -m "feat(mascot): MascotRig renderer + first-party default rig + mascot.rig theme key"
```

---

### Task 10: BuddyMascot integration (alive animations)

**Files:**
- Modify: `src/renderer/components/buddy/BuddyMascot.tsx` (full rewrite below)
- Modify: `src/renderer/styles/buddy.css` (wrapper animations)

- [ ] **Step 1: Rewrite `BuddyMascot.tsx`**

The drag/IPC logic is preserved verbatim from the current file (anchor-based drag, rAF coalescing, capture-loss safety nets — see the WHY comments); new: mascot resolution order (rig > flat > default rig), motion tracking for the springs, wrapper animation classes, hover reporting, dock-state sink (state subscribed here but transforms land in Task 12's CSS).

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '../../state/theme-context';
import { useThemeMascot } from '../../hooks/useThemeMascot';
import { useAnyAttentionNeeded } from '../../hooks/useAnyAttentionNeeded';
import { MascotRig, type RigMotion } from '../mascot/MascotRig';
import type { PoseName } from '../mascot/mascot-poses';

const DRAG_THRESHOLD_PX = 4;

// Pointer-driven drag state. Anchor-based: we capture the cursor's offset
// inside the 80×80 mascot at pointerdown and recompute the absolute target on
// every pointermove as (e.screenX - grabOffsetX, e.screenY - grabOffsetY).
// This keeps the cursor locked to the same pixel inside the mascot for the
// full drag regardless of HiDPI rounding — a prior delta-based design drifted
// on fractional-scale (125/150%) Windows displays. lastScreenX/Y + totalTravel
// only distinguish a genuine drag from a jittery click.
interface DragState {
  grabOffsetX: number;
  grabOffsetY: number;
  lastScreenX: number;
  lastScreenY: number;
  lastMoveTime: number;
  totalTravel: number;
  pointerId: number;
}

export interface MascotDockState { mode: 'free' | 'docked' | 'peeking'; edge: string | null; }

export function BuddyMascot() {
  const attention = useAnyAttentionNeeded();
  const { activeTheme, reducedEffects } = useTheme();

  // Mascot resolution order (spec §3.5): theme rig → theme flat art →
  // first-party default rig. Flat art is the legacy tier: it gets the
  // wrapper-level effects below but no limb trailing / blink / peek hands.
  const rigUrl = (activeTheme?.mascot as any)?.rig ?? null;
  const variantMascot = useThemeMascot(attention ? 'shocked' : 'idle');
  const welcomeMascot = useThemeMascot('welcome');
  const flatMascot = variantMascot ?? welcomeMascot;
  const useRig = !!rigUrl || !flatMascot;

  // Dock/peek state pushed from main (buddy:mascot-state). The sink transform
  // is applied via data-attrs + buddy.css.
  const [dock, setDock] = useState<MascotDockState>({ mode: 'free', edge: null });
  useEffect(() => {
    const off = (window.claude?.buddy as any)?.onMascotState?.((s: MascotDockState) => setDock(s));
    return off;
  }, []);

  const pose: PoseName = attention ? 'shocked' : dock.mode === 'peeking' ? 'peek' : 'idle';

  // Attention bounce: retrigger the CSS animation each time attention flips on.
  const [bounceKey, setBounceKey] = useState(0);
  useEffect(() => { if (attention) setBounceKey((k) => k + 1); }, [attention]);

  const [grabbed, setGrabbed] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  // Smoothed drag velocity for the rig's limb springs. A ref — pointermove-rate
  // React state would re-render 60×/s for nothing.
  const motionRef = useRef<RigMotion>({ vx: 0, vy: 0, dragging: false });

  // rAF-coalesce the moveMascot IPC: at most one move in flight per frame,
  // always targeting the latest cursor position (high-refresh mice fire
  // pointermove faster than the display refresh — "squishy" lag otherwise).
  const pendingTargetRef = useRef<{ targetX: number; targetY: number } | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const flushPendingMove = useCallback(() => {
    rafIdRef.current = null;
    const target = pendingTargetRef.current;
    if (!target) return;
    pendingTargetRef.current = null;
    window.claude?.buddy?.moveMascot?.(target);
  }, []);

  const cancelPendingMove = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    pendingTargetRef.current = null;
  }, []);

  useEffect(() => cancelPendingMove, [cancelPendingMove]);

  const endDrag = useCallback((notifyMain: boolean) => {
    const wasDragging = !!dragRef.current && dragRef.current.totalTravel > DRAG_THRESHOLD_PX;
    dragRef.current = null;
    motionRef.current = { vx: 0, vy: 0, dragging: false };
    setGrabbed(false);
    // Snap detection runs main-side against final window bounds (spec §6.1).
    if (notifyMain && wasDragging) (window.claude?.buddy as any)?.dragEnded?.();
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    dragRef.current = {
      grabOffsetX: e.clientX,
      grabOffsetY: e.clientY,
      lastScreenX: e.screenX,
      lastScreenY: e.screenY,
      lastMoveTime: performance.now(),
      totalTravel: 0,
      pointerId: e.pointerId,
    };
    setGrabbed(true);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragRef.current;
    if (!st) return;
    const dx = e.screenX - st.lastScreenX;
    const dy = e.screenY - st.lastScreenY;
    if (dx === 0 && dy === 0) return;
    const now = performance.now();
    const dt = Math.max(1, now - st.lastMoveTime);
    st.lastScreenX = e.screenX;
    st.lastScreenY = e.screenY;
    st.lastMoveTime = now;
    st.totalTravel += Math.abs(dx) + Math.abs(dy);
    if (st.totalTravel > DRAG_THRESHOLD_PX) {
      // Exponentially smoothed velocity in px/frame (16ms) for the limb springs.
      const m = motionRef.current;
      m.dragging = true;
      m.vx = 0.7 * m.vx + 0.3 * (dx / dt) * 16;
      m.vy = 0.7 * m.vy + 0.3 * (dy / dt) * 16;
      pendingTargetRef.current = {
        targetX: e.screenX - st.grabOffsetX,
        targetY: e.screenY - st.grabOffsetY,
      };
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(flushPendingMove);
      }
    }
  }, [flushPendingMove]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Flush any unsent move synchronously so the mascot doesn't rest one
    // frame behind the cursor.
    const pending = pendingTargetRef.current;
    cancelPendingMove();
    if (pending) window.claude?.buddy?.moveMascot?.(pending);

    const st = dragRef.current;
    const wasClick = !!st && st.totalTravel <= DRAG_THRESHOLD_PX;
    if (st) { try { e.currentTarget.releasePointerCapture(st.pointerId); } catch { /* ignore */ } }
    endDrag(true);
    if (wasClick && window.claude?.buddy?.toggleChat) {
      window.claude.buddy.toggleChat();
    }
  }, [cancelPendingMove, endDrag]);

  // Safety net for "stuck being dragged": OS-revoked capture or synthesized
  // pointercancel means pointerup never fires — clear state so later
  // pointermoves don't keep dragging a released mascot.
  const onLostPointerCapture = useCallback(() => { cancelPendingMove(); endDrag(true); }, [cancelPendingMove, endDrag]);
  const onPointerCancel = useCallback(() => { cancelPendingMove(); endDrag(true); }, [cancelPendingMove, endDrag]);

  const reportHover = useCallback((hovering: boolean) => {
    (window.claude?.buddy as any)?.reportHover?.({ source: 'mascot', hovering });
  }, []);

  return (
    <div
      className={[
        'mascot-wrap',
        grabbed ? 'mascot-grabbed' : '',
        !reducedEffects && !grabbed && dock.mode !== 'peeking' ? 'mascot-breathing' : '',
      ].filter(Boolean).join(' ')}
      style={{
        width: 80,
        height: 80,
        // NOTE: deliberately NOT -webkit-app-region: drag — on Windows that
        // routes ALL pointer events to the OS (WM_NCHITTEST → HTCAPTION) and
        // click detection dies. Drag is driven via the buddy.moveMascot IPC.
        cursor: grabbed ? 'grabbing' : 'grab',
        background: 'transparent',
        touchAction: 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onLostPointerCapture={onLostPointerCapture}
      onPointerCancel={onPointerCancel}
      onPointerEnter={() => reportHover(true)}
      onPointerLeave={() => reportHover(false)}
    >
      {/* Middle layer: peek sink (translate past the screen edge) — driven by
          data-attrs + buddy.css so it CSS-transitions. Inner layer: bounce. */}
      <div className="mascot-sink" data-dock-mode={dock.mode} data-dock-edge={dock.edge ?? ''}>
        <div key={bounceKey} className={attention && !reducedEffects ? 'mascot-bounce' : ''} style={{ width: '100%', height: '100%' }}>
          {useRig ? (
            <MascotRig svgUrl={rigUrl} pose={pose} motionRef={motionRef} reducedEffects={reducedEffects} />
          ) : (
            <img
              src={flatMascot!}
              alt=""
              style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
              draggable={false}
            />
          )}
        </div>
      </div>
    </div>
  );
}
```

Note: this removes the `WelcomeAppIcon` fallback import — the default rig replaces it (spec §3.5). If `WelcomeAppIcon` was only imported for that, drop the import.

- [ ] **Step 2: Append wrapper animation CSS to `buddy.css`**

```css
/* ── Alive & responsive (spec §5) ──
   All mascot motion is transforms INSIDE the fixed 80×80 window.
   `scale` (hover/grab) and `translate` (breathing) are independent CSS
   properties so the animations compose without clobbering each other. */
body[data-mode="buddy-mascot"] .mascot-wrap {
  width: 100%;
  height: 100%;
  transition: scale 120ms ease;
}
body[data-mode="buddy-mascot"] .mascot-wrap:hover { scale: 1.06; }
body[data-mode="buddy-mascot"] .mascot-wrap.mascot-grabbed { scale: 0.94; }

body[data-mode="buddy-mascot"] .mascot-breathing {
  animation: buddy-breathe 4s ease-in-out infinite;
}
@keyframes buddy-breathe {
  0%, 100% { translate: 0 0; }
  50% { translate: 0 -2.5px; }
}

/* Attention bounce — retriggered via a React key swap each time attention
   flips on, so repeat alerts bounce again. */
body[data-mode="buddy-mascot"] .mascot-bounce {
  animation: buddy-bounce 500ms cubic-bezier(0.28, 0.84, 0.42, 1);
}
@keyframes buddy-bounce {
  0% { translate: 0 0; }
  30% { translate: 0 -9px; }
  55% { translate: 0 0; }
  72% { translate: 0 -4px; }
  100% { translate: 0 0; }
}

/* Peek sink container — transforms land in Task 12; the transition lives
   here so dock-state changes animate. */
body[data-mode="buddy-mascot"] .mascot-sink {
  width: 100%;
  height: 100%;
  transition: transform 200ms ease;
}
```

- [ ] **Step 3: Typecheck + tests + manual smoke**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

Dev smoke (theme WITHOUT a mascot, e.g. built-in Midnight): default rig character renders tinted to the theme accent; hover scales up; grab squishes; dragging trails arms/legs with a wobble on release; blinks every ~6–12s; trigger attention (permission prompt) → bounce + shocked face. Switch to a theme WITH flat mascot art → flat image, wrapper effects only. Toggle reduced-effects → breathing/blink/trailing stop.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(buddy): alive mascot — rig integration, breathing, blink, grab squish, attention bounce, limb-trailing drag"
```

---

### Task 11: Chat open/close animation

**Files:**
- Modify: `src/main/buddy-window-manager.ts` (`toggleChat`, `createChat`)
- Modify: `src/renderer/components/buddy/BuddyChatApp.tsx`
- Modify: `src/renderer/styles/buddy.css`

- [ ] **Step 1: Manager — push chat-state around show/hide**

Add a local const next to `IPC_BAR_STATE`:

```ts
const IPC_CHAT_STATE = 'buddy:chat-state';
```

In `toggleChat()`'s hide branch, replace `this.chat.hide();` with:

```ts
      // Exit animation: cue the renderer, let the 120ms fade play, THEN hide
      // the window. Guarded so a rapid re-toggle inside the delay can't hide
      // a window the user just re-opened.
      this.chat.webContents.send(IPC_CHAT_STATE, { visible: false });
      const chatRef = this.chat;
      setTimeout(() => {
        if (chatRef && !chatRef.isDestroyed() && chatRef === this.chat && !this.chatOpenIntent) {
          chatRef.hide();
        }
      }, 140);
```

Track intent with a private field so the timeout guard works:

```ts
  // True while the user intends the chat visible — set in the show paths,
  // cleared in the hide path. Guards the delayed hide() against re-toggles.
  private chatOpenIntent = false;
```

Set `this.chatOpenIntent = true;` in `createChat()` and in the re-show branch of `toggleChat()` (before `this.chat.show()`), and `this.chatOpenIntent = false;` at the top of the hide branch. In the re-show branch, after `this.chat.show();` add:

```ts
      this.chat.webContents.send(IPC_CHAT_STATE, { visible: true });
```

- [ ] **Step 2: Renderer — entrance/exit classes**

`BuddyChatApp.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { ThemeProvider } from '../../state/theme-context';
import { ChatProvider } from '../../state/chat-context';
import { BuddyChat } from './BuddyChat';

export function BuddyChatApp() {
  // Entrance/exit fade+scale (spec §5): first mount plays the entrance;
  // buddy:chat-state pushes replay it on every re-show and play the exit
  // before main hides the window.
  const [phase, setPhase] = useState<'enter' | 'exit'>('enter');
  const [replayKey, setReplayKey] = useState(0);

  useEffect(() => {
    document.body.setAttribute('data-mode', 'buddy-chat');
    const off = (window.claude?.buddy as any)?.onChatState?.((s: { visible: boolean }) => {
      if (s.visible) { setPhase('enter'); setReplayKey((k) => k + 1); }
      else setPhase('exit');
    });
    return off;
  }, []);

  return (
    <ThemeProvider>
      {/* ChatProvider: BubbleFeed's ToolCard calls useChatDispatch() — the
          buddy window has its own isolated React tree. */}
      <ChatProvider>
        <div key={replayKey} className={phase === 'enter' ? 'buddy-chat-enter' : 'buddy-chat-exit'} style={{ width: '100%', height: '100%' }}>
          <BuddyChat />
        </div>
      </ChatProvider>
    </ThemeProvider>
  );
}
```

`buddy.css` append:

```css
/* Chat open/close: fade + scale instead of popping (spec §5). Origin leans
   toward the mascot side (left edge) so it reads as growing out of the buddy. */
body[data-mode="buddy-chat"] .buddy-chat-enter {
  animation: buddy-chat-in 120ms ease-out;
  transform-origin: 0% 20%;
}
body[data-mode="buddy-chat"] .buddy-chat-exit {
  animation: buddy-chat-out 120ms ease-in forwards;
  transform-origin: 0% 20%;
}
@keyframes buddy-chat-in {
  from { opacity: 0; transform: scale(0.92); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes buddy-chat-out {
  from { opacity: 1; transform: scale(1); }
  to { opacity: 0; transform: scale(0.95); }
}
```

- [ ] **Step 3: Typecheck + manual smoke + commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS. Dev smoke: chat scales/fades in on open, fades out on mascot click, rapid double-click doesn't strand it hidden or mid-fade.

```bash
git add -A
git commit -m "feat(buddy): chat window open/close fade+scale animation"
```

---

### Task 12: Edge snap + dock/peek

**Files:**
- Create: `src/main/buddy-dock.ts`
- Test: `tests/buddy-dock.test.ts`
- Modify: `src/main/buddy-window-manager.ts` (dock orchestration, glide, timers)
- Modify: `src/main/main.ts` (BUDDY_DRAG_ENDED handler, dock persistence dep, attention hook)
- Modify: `src/renderer/styles/buddy.css` (sink transforms)

- [ ] **Step 1: Write the failing test**

`tests/buddy-dock.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { detectSnapEdge, dockReducer, dockPosition, FREE_DOCK } from '../src/main/buddy-dock';

const wa = { x: 0, y: 0, width: 1920, height: 1080 };
const size = { width: 80, height: 80 };

describe('detectSnapEdge', () => {
  it('null when nowhere near an edge', () => {
    expect(detectSnapEdge({ x: 500, y: 500 }, size, wa)).toBeNull();
  });
  it('detects each edge within the 24px threshold', () => {
    expect(detectSnapEdge({ x: 10, y: 500 }, size, wa)).toBe('left');
    expect(detectSnapEdge({ x: 1830, y: 500 }, size, wa)).toBe('right');   // right gap = 1920-1910 = 10
    expect(detectSnapEdge({ x: 500, y: 20 }, size, wa)).toBe('top');
    expect(detectSnapEdge({ x: 500, y: 990 }, size, wa)).toBe('bottom');   // bottom gap = 1080-1070 = 10
  });
  it('25px away is not a snap', () => {
    expect(detectSnapEdge({ x: 25, y: 500 }, size, wa)).toBeNull();
  });
  it('corner picks the nearer edge', () => {
    expect(detectSnapEdge({ x: 5, y: 990 }, size, wa)).toBe('left'); // 5 < 10
  });
  it('respects non-zero workArea origin', () => {
    const wa2 = { x: 1920, y: 0, width: 1920, height: 1080 };
    expect(detectSnapEdge({ x: 1925, y: 500 }, size, wa2)).toBe('left');
  });
});

describe('dockReducer', () => {
  it('drag-release with a snap edge docks', () => {
    expect(dockReducer(FREE_DOCK, { type: 'drag-release', snapEdge: 'bottom' }))
      .toEqual({ mode: 'docked', edge: 'bottom' });
  });
  it('drag-release away from edges frees', () => {
    expect(dockReducer({ mode: 'peeking', edge: 'left' }, { type: 'drag-release', snapEdge: null }))
      .toEqual(FREE_DOCK);
  });
  it('idle-timeout peeks only from docked', () => {
    expect(dockReducer({ mode: 'docked', edge: 'left' }, { type: 'idle-timeout' }))
      .toEqual({ mode: 'peeking', edge: 'left' });
    expect(dockReducer(FREE_DOCK, { type: 'idle-timeout' })).toEqual(FREE_DOCK);
  });
  it('activity slides a peeking mascot back to docked', () => {
    expect(dockReducer({ mode: 'peeking', edge: 'right' }, { type: 'activity' }))
      .toEqual({ mode: 'docked', edge: 'right' });
    expect(dockReducer({ mode: 'docked', edge: 'right' }, { type: 'activity' }))
      .toEqual({ mode: 'docked', edge: 'right' });
  });
  it('drag-start undocks (mascot pops out while carried)', () => {
    expect(dockReducer({ mode: 'peeking', edge: 'bottom' }, { type: 'drag-start' })).toEqual(FREE_DOCK);
  });
});

describe('dockPosition', () => {
  it('flush against each edge, other axis preserved + clamped', () => {
    expect(dockPosition('left', { x: 10, y: 500 }, size, wa)).toEqual({ x: 0, y: 500 });
    expect(dockPosition('right', { x: 1830, y: 500 }, size, wa)).toEqual({ x: 1840, y: 500 });
    expect(dockPosition('top', { x: 500, y: 20 }, size, wa)).toEqual({ x: 500, y: 0 });
    expect(dockPosition('bottom', { x: 500, y: 990 }, size, wa)).toEqual({ x: 500, y: 1000 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/buddy-dock.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/buddy-dock.ts`**

```ts
import { clampToWorkArea, type Point, type Rect, type Size } from './buddy-window-manager';

/**
 * Edge snap + peek state machine (spec §6). Pure — the BuddyWindowManager
 * drives it with events and owns the timers/windows.
 *
 *   free ──drag-release(near edge)──▶ docked ──8s idle──▶ peeking
 *     ▲                                 ▲                    │
 *     └──drag-release(elsewhere)/drag-start                  │
 *                                       └────── activity ────┘
 */
export type DockEdge = 'left' | 'right' | 'top' | 'bottom';
export interface DockState { mode: 'free' | 'docked' | 'peeking'; edge: DockEdge | null; }
export type DockEvent =
  | { type: 'drag-start' }
  | { type: 'drag-release'; snapEdge: DockEdge | null }
  | { type: 'idle-timeout' }
  | { type: 'activity' }; // hover, chat opening, attention

export const FREE_DOCK: DockState = { mode: 'free', edge: null };
export const SNAP_THRESHOLD_PX = 24;
export const PEEK_IDLE_MS = 8000;

export function dockReducer(state: DockState, event: DockEvent): DockState {
  switch (event.type) {
    case 'drag-start':
      return FREE_DOCK;
    case 'drag-release':
      return event.snapEdge ? { mode: 'docked', edge: event.snapEdge } : FREE_DOCK;
    case 'idle-timeout':
      return state.mode === 'docked' ? { mode: 'peeking', edge: state.edge } : state;
    case 'activity':
      return state.mode === 'peeking' ? { mode: 'docked', edge: state.edge } : state;
  }
}

/** Nearest workArea edge within threshold of the window bounds, else null.
 *  Corners resolve to the strictly nearer edge. */
export function detectSnapEdge(pos: Point, size: Size, workArea: Rect, threshold = SNAP_THRESHOLD_PX): DockEdge | null {
  const candidates: Array<[DockEdge, number]> = [
    ['left', pos.x - workArea.x],
    ['right', workArea.x + workArea.width - (pos.x + size.width)],
    ['top', pos.y - workArea.y],
    ['bottom', workArea.y + workArea.height - (pos.y + size.height)],
  ];
  const within = candidates.filter(([, d]) => d <= threshold);
  if (within.length === 0) return null;
  within.sort((a, b) => a[1] - b[1]);
  return within[0][0];
}

/** Window position flush against `edge`, preserving (and clamping) the other axis. */
export function dockPosition(edge: DockEdge, current: Point, size: Size, workArea: Rect): Point {
  const raw: Point =
    edge === 'left' ? { x: workArea.x, y: current.y } :
    edge === 'right' ? { x: workArea.x + workArea.width - size.width, y: current.y } :
    edge === 'top' ? { x: current.x, y: workArea.y } :
    { x: current.x, y: workArea.y + workArea.height - size.height };
  return clampToWorkArea(raw, size, workArea);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/buddy-dock.test.ts`
Expected: PASS.

- [ ] **Step 5: Manager orchestration**

In `buddy-window-manager.ts`:

1. Imports + consts + deps:

```ts
import {
  dockReducer, detectSnapEdge, dockPosition, FREE_DOCK, PEEK_IDLE_MS,
  type DockState, type DockEvent, type DockEdge,
} from './buddy-dock';

const IPC_MASCOT_STATE = 'buddy:mascot-state';
```

(`MASCOT_SIZE` is already defined at the top of this file — the new code below reuses it.)

Add to `BuddyWindowManagerDeps`:

```ts
  /** Persisted dock edge (buddy-positions.json `dock` key) so a docked/peeking
   *  buddy is still docked after a restart (spec §6.1). */
  getPersistedDock(): DockEdge | null;
  setPersistedDock(edge: DockEdge | null): void;
```

2. Fields + core methods:

```ts
  private dockState: DockState = FREE_DOCK;
  private peekTimer: NodeJS.Timeout | null = null;
  private glideTimer: NodeJS.Timeout | null = null;
  private attentionNeeded = false;

  private dispatchDock(event: DockEvent): void {
    const next = dockReducer(this.dockState, event);
    if (next.mode === this.dockState.mode && next.edge === this.dockState.edge) {
      this.schedulePeek(); // state unchanged, but activity resets the idle clock
      return;
    }
    this.dockState = next;
    this.deps.setPersistedDock(next.mode === 'free' ? null : next.edge);
    this.pushMascotState();
    this.schedulePeek();
  }

  private pushMascotState(): void {
    if (this.mascot && !this.mascot.isDestroyed()) {
      this.mascot.webContents.send(IPC_MASCOT_STATE, this.dockState);
    }
  }

  /** (Re)arm the docked→peeking idle timer. Peek only starts when nothing is
   *  going on: not hovered, chat closed, no attention (spec §6.2). */
  private schedulePeek(): void {
    if (this.peekTimer) { clearTimeout(this.peekTimer); this.peekTimer = null; }
    if (this.dockState.mode !== 'docked') return;
    if (this.barVisibility.wantsVisible() || this.attentionNeeded) return;
    this.peekTimer = setTimeout(() => {
      this.peekTimer = null;
      if (this.dockState.mode === 'docked' && !this.barVisibility.wantsVisible() && !this.attentionNeeded) {
        this.dispatchDock({ type: 'idle-timeout' });
      }
    }, PEEK_IDLE_MS);
  }

  /** Called by main.ts from the attention aggregation broadcast. */
  setAttentionNeeded(needed: boolean): void {
    if (needed === this.attentionNeeded) return;
    this.attentionNeeded = needed;
    if (needed) this.dispatchDock({ type: 'activity' });
    else this.schedulePeek();
  }

  /** buddy:drag-ended — run snap detection against final window bounds. */
  dragEnded(): void {
    if (!this.mascot || this.mascot.isDestroyed()) return;
    const mb = this.mascot.getBounds();
    const display = screen.getDisplayMatching(mb) ?? screen.getPrimaryDisplay();
    const edge = detectSnapEdge({ x: mb.x, y: mb.y }, MASCOT_SIZE, display.workArea);
    this.dispatchDock({ type: 'drag-release', snapEdge: edge });
    if (edge) {
      const target = dockPosition(edge, { x: mb.x, y: mb.y }, MASCOT_SIZE, display.workArea);
      this.glideTo(target);
    }
  }

  /** The one sanctioned window-bounds animation (spec §6.1): a short eased
   *  glide onto the edge. ~10 steps over 150ms; canceled by any new drag. */
  private glideTo(target: Point, ms = 150): void {
    if (this.glideTimer) { clearInterval(this.glideTimer); this.glideTimer = null; }
    const win = this.mascot;
    if (!win || win.isDestroyed()) return;
    const [sx, sy] = win.getPosition();
    const t0 = Date.now();
    this.glideTimer = setInterval(() => {
      if (!win || win.isDestroyed()) { if (this.glideTimer) clearInterval(this.glideTimer); this.glideTimer = null; return; }
      const t = Math.min(1, (Date.now() - t0) / ms);
      const ease = 1 - Math.pow(1 - t, 3);
      win.setPosition(Math.round(sx + (target.x - sx) * ease), Math.round(sy + (target.y - sy) * ease));
      if (t >= 1) {
        if (this.glideTimer) clearInterval(this.glideTimer);
        this.glideTimer = null;
        // Bar may need to flip sides now that the mascot sits on an edge.
        if (this.barCssVisible) this.applyBarVisible(true);
      }
    }, 16);
  }
```

3. Hook the existing paths:
   - `moveMascot()` — first line: `if (this.glideTimer) { clearInterval(this.glideTimer); this.glideTimer = null; }` and `if (this.dockState.mode !== 'free') this.dispatchDock({ type: 'drag-start' });` (dragging always pops the mascot out).
   - `reportHover()` — append `this.dispatchDock({ type: 'activity' });`
   - `barVisibility.setChatOpen(true)` call sites (`createChat`, re-show branch) — also call `this.dispatchDock({ type: 'activity' });`
   - `barVisibility.setChatOpen(false)` call sites — call `this.schedulePeek();`
   - `hide()` — clear both timers, reset `this.dockState = FREE_DOCK;` (do NOT clear the persisted dock — a dismissed buddy should come back docked).
   - `show()` — after creating/showing the mascot, restore the dock:

```ts
    const savedEdge = this.deps.getPersistedDock();
    if (savedEdge) {
      const mb = this.mascot.getBounds();
      const d = screen.getDisplayMatching(mb) ?? screen.getPrimaryDisplay();
      const flush = dockPosition(savedEdge, { x: mb.x, y: mb.y }, MASCOT_SIZE, d.workArea);
      this.mascot.setPosition(Math.round(flush.x), Math.round(flush.y));
      this.dockState = { mode: 'docked', edge: savedEdge };
      // Renderer may not have loaded yet — replay state when it has.
      this.mascot.webContents.once('did-finish-load', () => this.pushMascotState());
      this.pushMascotState();
      this.schedulePeek();
    }
```

- [ ] **Step 6: main.ts wiring**

1. Handler:

```ts
  ipcMain.on(IPC.BUDDY_DRAG_ENDED, () => buddyManager.dragEnded());
```

2. Deps (dock persistence — same JSON file as positions):

```ts
    getPersistedDock: () => (buddyPositions as any).dock ?? null,
    setPersistedDock: (edge) => {
      (buddyPositions as any).dock = edge ?? undefined;
      saveBuddyPositions(buddyPositions);
    },
```

(Widen the `buddyPositions` record type to `Record<string, any>` or add a proper `{ dock?: DockEdge }` field — prefer the typed field.)

3. Attention hook — in `recomputeAndBroadcastAttention()` (~line 349), after computing `anyNeedsAttention`, add:

```ts
  // Dock/peek activity signal: attention pops a peeking buddy out (spec §6.2).
  buddyManagerRef?.setAttentionNeeded(anyNeedsAttention);
```

- [ ] **Step 7: Peek sink CSS**

Append to `buddy.css`:

```css
/* Peek (spec §6.2): the 80×80 window stays flush on-screen at the edge; the
   ARTWORK translates past the edge so only the top ~30% (head + gripping
   hands from the rig's peek pose) stays visible. Percentages of the 80px box. */
body[data-mode="buddy-mascot"] .mascot-sink[data-dock-mode="peeking"][data-dock-edge="bottom"] { transform: translateY(58%); }
body[data-mode="buddy-mascot"] .mascot-sink[data-dock-mode="peeking"][data-dock-edge="top"] { transform: translateY(-58%); }
body[data-mode="buddy-mascot"] .mascot-sink[data-dock-mode="peeking"][data-dock-edge="left"] { transform: translateX(-58%); }
body[data-mode="buddy-mascot"] .mascot-sink[data-dock-mode="peeking"][data-dock-edge="right"] { transform: translateX(58%); }
```

- [ ] **Step 8: Typecheck + full tests + manual smoke**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

Dev smoke: drag near bottom edge, release → glides flush; wait 8s → sinks into peek (default rig: arms up gripping); hover → slides out to docked; drag away → undocks; permission prompt while peeking → pops out shocked; relaunch dev instance → still docked. Repeat for left/right edges. Verify chat + bar still position sanely while docked (bar flips above when mascot is on the bottom edge).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(buddy): edge snap with eased glide + peek-over-the-edge state machine"
```

---

### Task 13: Docs, full verification, PR

**Files:**
- Modify: `desktop/docs/theme-spec.md` (youcoded repo — rig format section)
- Modify: `docs/PITFALLS.md` (workspace repo `youcoded-dev` — separate commit)

- [ ] **Step 1: Document the rig format in `desktop/docs/theme-spec.md`**

Append a section:

```markdown
## Mascot rig (preferred mascot format)

A theme may ship `mascot.rig`: a single SVG whose named groups the app animates.
Flat variants (`idle`/`shocked`/`welcome`) remain supported as the legacy tier
(no limb trailing, no blink, no peek hands).

Required/optional group ids: `rig-body` (required), `rig-head`, `rig-arm-left`,
`rig-arm-right`, `rig-leg-left`, `rig-leg-right`, `rig-face-idle`,
`rig-face-shocked`, `rig-face-blink`.

Conventions:
- Draw limbs HANGING DOWN from their attachment point; pose data assumes it.
- Each limb/head group may declare `data-pivot="x y"` (viewBox coords) for its
  hinge. Defaults: top-center of the group's bbox (arms/legs), bottom-center (head).
- Face groups other than `rig-face-idle` should start `style="display:none"`.
- Groups may embed raster art via `<image href="data:image/...">` — painted
  mascots can be rigged by slicing.
- SECURITY: rigs are sanitized at load (`sanitize-rig-svg.ts`) — scripts,
  foreignObject, `<style>`, SMIL animation tags, `on*` attributes, and external
  URLs are stripped. Only `#refs` and `data:image/*` URLs survive.
- Poses (idle/shocked/welcome/peek) and physics are app-defined data in
  `src/renderer/components/mascot/mascot-poses.ts` — new behaviors ship in app
  updates and apply to every conforming rig with no re-authoring.
- Reference implementation: `src/renderer/components/mascot/default-buddy-rig.ts`.
```

- [ ] **Step 2: Full verification**

```bash
npx tsc --noEmit && npx vitest run && npm run build
```

Expected: all pass. Then the full manual QA list from the spec (§11) in the dev instance — including at minimum: the original reported bug scenario, hover reveal, hide → Show now, snap/peek on 3 edges, default rig + one flat-art theme + one no-mascot theme, reduced-effects, theme switch live.

- [ ] **Step 3: Commit + PR (youcoded repo)**

```bash
git add -A && git commit -m "docs(theme-spec): mascot rig format"
git push -u origin feat/buddy-upgrades
gh pr create --repo itsdestin/youcoded --title "Buddy floater upgrades: action bar, rigged mascot, edge snap + peek" --body "Implements docs/superpowers/specs/2026-07-10-buddy-floater-upgrades-design.md (youcoded-dev). Fixes stale capture-icon position, orphaned icon, dead chat persistence. Adds 3-button action bar, rigged mascot format + default rig, alive animations, edge snap + peek, dismiss-for-run, settings row restyle.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 4: Workspace docs (youcoded-dev repo)**

In the WORKSPACE repo (`C:\Users\desti\youcoded-dev`), add to `docs/PITFALLS.md` under a new "## Buddy Floater" heading:

```markdown
## Buddy Floater

- **The action bar window stays Electron-shown; visibility is CSS + `setIgnoreMouseEvents`.** Reveal/dismiss animates via the `buddy:bar-state` push. When CSS-hidden, main sets `setIgnoreMouseEvents(true, {forward:true})` so the invisible 148×44 window doesn't eat clicks — and `forward:true` is load-bearing: it keeps mousemove flowing so hovering the hidden bar zone can re-reveal it. Don't "simplify" to window show/hide (kills the fade) and don't drop the ignore-mouse toggle (invisible click-eater).
- **Bar position is recomputed from live mascot bounds before EVERY reveal** (`showBar` + `applyBarVisible`). The original capture-icon bug was computing position only at window creation — a mascot drag while the bar was hidden stranded it. Geometry is pure + tested in `buddy-bar-geometry.ts`.
- **Rig SVGs are third-party code — `sanitize-rig-svg.ts` is the security boundary.** Themes ship `mascot.rig` and the SVG is INLINED into the buddy renderer DOM. The sanitizer strips scripts/foreignObject/`<style>`/SMIL/`on*`/external URLs; only `#refs` and `data:image/*` survive. Never inline a rig (or any theme SVG) without routing through it. Registry-side CI validation does not exist yet — the app-side sanitizer carries the whole guarantee.
- **Mascot motion is transforms inside fixed-size windows; the ONLY window-bounds animation is the edge-snap glide.** Breathing uses the `translate` property and hover/grab use `scale` (independent properties, so they compose). The dock/peek state machine is pure (`buddy-dock.ts`); BuddyWindowManager owns its timers.
- **`buddy:dismiss` hides for the run only** — `localStorage['youcoded-buddy-enabled']` stays `'1'`; the `dismissed` flag lives in BuddyWindowManager and every `show()` clears it. The Settings row's "Show now" is just `buddy.show()`. Don't make the hide button write the localStorage preference.
```

```bash
cd C:\Users\desti\youcoded-dev
git add docs/PITFALLS.md && git commit -m "docs(PITFALLS): buddy floater invariants (bar visibility, rig sanitizer, dock/peek)" && git push origin master
```

- [ ] **Step 5: After merge — cleanup**

Once the PR is merged AND pushed to youcoded master:

```bash
cd youcoded && git fetch origin && git branch --contains <merge-sha>   # verify master has it
git worktree remove ../youcoded-worktrees/buddy-upgrades
git branch -D feat/buddy-upgrades
```

Shut down any dev-instance Electron processes (workspace rule: pushing to master green-lights closing the dev server).

---

## Self-review notes (kept for the executor)

- **Spec coverage:** §2 bugs → Task 3; §3 rig format → Tasks 7–9; §4 action bar → Tasks 3–5; §5 alive → Tasks 10–11; §6 snap/peek → Task 12; §7 dismiss → Task 5; §8 settings → Task 6; §9 IPC → Task 1; §11 tests → Tasks 2/4/7/8/12 + manual QA in 13.
- **Naming consistency:** window variant is `'bar'`, mode string `buddy-bar`, manager methods `showBar`/`hideBar`/`getBarWindow`, tracker `BarVisibilityTracker`, pure modules `buddy-bar-geometry` / `buddy-bar-visibility` / `buddy-dock`.
- **Type note:** several renderer call sites cast `window.claude.buddy as any` for the new methods. If the repo has a central `window.claude` type declaration (check `src/renderer/types/` or a `global.d.ts`), extend it instead of casting — search for where `buddy` is typed and add the ten new members there.
- **`MASCOT_SIZE` stays the manager's constant** — Task 12 references it from within the manager only; no export changes needed beyond `Point`/`Rect`/`Size` (Task 2).
