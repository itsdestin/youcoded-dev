# Buddy Floater One-Window Overlay — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On Linux Wayland sessions, host the buddy floater (mascot + chat + bar) as DOM inside ONE screen-sized transparent BrowserWindow so it is draggable/peekable/dockable without OS window positioning; all other platforms keep the existing three-window `BuddyWindowManager` untouched.

**Architecture:** A new `BuddyOverlayManager` (main) creates a single transparent window sized to the primary display, defaulting to `setIgnoreMouseEvents(true, {forward:true})`; a new `BuddyOverlayApp` (renderer, `?mode=buddy-overlay`) owns mascot position, dock state, and chat/bar reveal locally (CSS, no per-frame IPC) and toggles window interactivity on hover. Pure geometry/dock modules move to `src/shared/` so the renderer can import them. Both managers sit behind one structural `BuddyManager` interface chosen once at startup.

**Tech Stack:** Electron ≥41.10.3 (already on master), React 18, vitest, existing `window.claude.buddy` preload surface.

**Spec:** `docs/active/specs/2026-07-22-buddy-floater-one-window.md` (approved 2026-07-22). All primitives referenced here are already proven on the target machine — see the spec's evidence table; do not re-litigate them.

## Global Constraints

- **Live-app safety:** never touch the running production app; all runtime checks via `bash scripts/run-dev.sh <branch>` (`.claude/rules/live-app-safety.md`).
- **Worktree:** execute in a fresh worktree (`superpowers:using-git-worktrees`). Symlinking `node_modules` from the main checkout is fine for vitest/tsc, but then NEVER run `npm ci` or gradle in the worktree (CLAUDE.md junction/symlink pitfall).
- **Windows/macOS/Linux-X11 behavior must be byte-for-byte unchanged.** Every task that touches shared files states its non-Wayland impact.
- **Preload is sandboxed:** channel strings are INLINED string literals in `preload.ts`, never imported (existing convention, `desktop/CLAUDE.md`).
- **Renderer never imports from `src/main/`** (Node boundary). That is WHY Task 1 exists.
- **IPC parity:** any `BuddyApi` addition gets the same-shape stub in `src/renderer/remote-shim.ts` (buddy is a no-op there — follow how existing buddy methods are shimmed).
- **Every non-trivial edit gets a WHY comment** (Destin is a non-developer).
- **PITFALLS §Buddy Floater invariants remain binding** — notably: bar opens with chat only; group layout is rigid (chat fit constrains mascot x); gaps measure to artwork ink, not window edge; `peeking` must re-flush position on disengage.
- **Coordinates rule (new, this feature):** ALL overlay math is window-local. Never call `getPosition()`/`getBounds()` for logic on Wayland (they return stale/echoed values — proven). The work area is delivered to the renderer as window-local offsets.
- Interactive/visual verification is Destin's eyeball via dev instance; do NOT build scripted drag rigs (CLAUDE.md 2026-07-16 lesson).

## Open Questions (resolve during execution at the marked tasks — none block starting)

1. **Click-through pass-through half** — forward-events are proven; the "clicks actually land on the desktop beneath" half was documented-but-not-eyeballed. Task 3 step 0 confirms it in 20 s before any dependent code. If it fails: STOP, escalate to Destin — the overlay must then keep a small interactive footprint (fallback design, not in this plan).
2. **Compositor placement of the overlay on multi-display setups** — single display proven at (0,0). Window-local math makes correctness independent of placement; only edge-snap alignment could shift. Task 9 eyeball checks with the TV connected if convenient; otherwise note as v1-known-limitation.
3. **Keyboard focus for the chat input inside a `showInactive()` overlay** — expected to focus on click like any window; Task 9 eyeball confirms. If focus fails, add `overlay.focus()` inside the set-interactive(true) handler (one-line fix, noted in Task 4).
4. **KWin keep-above script on non-KDE Wayland** — silently no-ops (guarded by `qdbus6` presence + KDE env). Confirm the Settings toggle communicates "KDE only" copy (Task 8).

---

### Task 1: Move pure buddy geometry + dock modules to `src/shared/`

The renderer must import `computeGroupLayout`, `dockReducer`, etc., but today they live in `src/main/` and (transitively) import from `buddy-window-manager.ts`, which imports `electron`. Move the pure code; leave re-export shims so main-process imports and all 4 existing test files keep working unchanged.

**Files:**
- Create: `desktop/src/shared/buddy-geometry.ts` (types `Rect`/`Point`/`Size`, `clampToWorkArea`, and the ENTIRE current content of `src/main/buddy-bar-geometry.ts`)
- Create: `desktop/src/shared/buddy-dock.ts` (entire current content of `src/main/buddy-dock.ts`)
- Modify: `desktop/src/main/buddy-bar-geometry.ts` → re-export shim only
- Modify: `desktop/src/main/buddy-dock.ts` → re-export shim only
- Modify: `desktop/src/main/buddy-window-manager.ts:25-33` (keep `Rect`/`Point`/`Size`/`clampToWorkArea` exports as re-exports from shared so its dependents don't churn)
- Test: existing `desktop/tests/buddy-bar-geometry.test.ts`, `buddy-dock.test.ts`, `buddy-edge-clamp.test.ts`, `buddy-bar-visibility.test.ts` (unchanged — they are the regression gate)

**Interfaces:**
- Consumes: current exports listed in the spec's interface map (`MASCOT_SIZE {112,112}`, `CHAT_SIZE {320,480}`, `BAR_SIZE {164,60}`, `computeGroupLayout(mascotBounds: Rect, workArea: Rect): GroupLayout`, `computeBarPosition`, `mascotXRangeForChat`, `mascotInkRect`, `chatOffsetX`, `dockReducer(state: DockState, event: DockEvent): DockState`, `detectSnapEdge(pos, size, workArea, threshold=24)`, `dockPosition(edge, current, size, workArea)`, `DockEdge`, `DockState`, `FREE_DOCK`, `SNAP_THRESHOLD_PX`)
- Produces: identical names importable from `src/shared/buddy-geometry` and `src/shared/buddy-dock` — every later task imports from these paths.

- [ ] **Step 1: Move the code.** `src/shared/buddy-geometry.ts` starts with the type + clamp block currently in `buddy-window-manager.ts:25-40` (copy verbatim, including comments), followed by the full body of `buddy-bar-geometry.ts` with its import line deleted (types are now local). `src/shared/buddy-dock.ts` is `buddy-dock.ts` verbatim with its type imports pointed at `./buddy-geometry`.
- [ ] **Step 2: Shim the old paths.**

```ts
// desktop/src/main/buddy-bar-geometry.ts — entire new content
// WHY a shim: geometry is pure and now shared with the renderer overlay
// (src/shared/buddy-geometry.ts). Main-process callers and the pinning tests
// keep this import path so the move is invisible to them.
export * from '../shared/buddy-geometry';
```

```ts
// desktop/src/main/buddy-dock.ts — entire new content (same WHY comment style)
export * from '../shared/buddy-dock';
```

In `buddy-window-manager.ts`, replace the local `Rect`/`Point`/`Size`/`clampToWorkArea` definitions with `export { clampToWorkArea } from '../shared/buddy-geometry'; export type { Rect, Point, Size } from '../shared/buddy-geometry';` and fix its own uses to import them.

- [ ] **Step 3: Verify.** Run: `cd desktop && npx tsc --noEmit -p tsconfig.json && npx vitest run tests/buddy-bar-geometry.test.ts tests/buddy-dock.test.ts tests/buddy-edge-clamp.test.ts tests/buddy-bar-visibility.test.ts`. Expected: tsc clean, 4 files pass with zero test edits.
- [ ] **Step 4: Commit.** `git commit -m "refactor(buddy): move pure geometry/dock to src/shared for renderer reuse — old paths re-export"`

---

### Task 2: `BuddyManager` interface + main.ts uses it for capture/attach

Give the two managers one structural type and remove the last places `main.ts` reaches into three-window internals (`getMascotWindow`/`getChatWindow`/`getBarWindow` in the capture handler; `liveChat` for `BUDDY_ATTACH_FILE`).

**Files:**
- Create: `desktop/src/main/buddy-manager.ts`
- Modify: `desktop/src/main/buddy-window-manager.ts` (add the two new methods; ~10 lines)
- Modify: `desktop/src/main/main.ts:1514-1580` (capture handler), `:1575` (attach-file target), `:115` (`buddyManagerRef` type)
- Test: `desktop/tests/buddy-strategy.test.ts` (new)

**Interfaces:**
- Produces (all later tasks depend on this exact shape):

```ts
// desktop/src/main/buddy-manager.ts
import type { BrowserWindow, WebContents } from 'electron';

// WHY: main.ts must not care whether the buddy is three windows (Win/mac/X11)
// or one overlay window (Linux Wayland). Everything main.ts needs is here.
export interface BuddyManager {
  show(): void;
  hide(): void;
  dismiss(): void;
  getStatus(): { dismissed: boolean; visible: boolean };
  toggleChat(): void;
  setViewedSession(sessionId: string): void;
  getViewedSession(): string | null;
  setAttentionNeeded(needed: boolean): void;
  isBuddyWindow(win: BrowserWindow): boolean;
  /** Windows to hide while capturing the desktop (capture-icon flow). */
  captureWindows(): BrowserWindow[];
  /** WebContents that hosts the buddy chat — target for BUDDY_ATTACH_FILE. */
  chatWebContents(): WebContents | null;
  /** Per-frame drag path used ONLY by the three-window model; overlay no-ops. */
  moveMascot(targetX: number, targetY: number): void;
  dragEnded(): void;
}

// WHY: one decision point, pure and testable. The overlay exists because
// Wayland forbids window positioning; everywhere else keeps three windows.
export function chooseBuddyStrategy(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>
): 'overlay' | 'windows' {
  if (platform !== 'linux') return 'windows';
  const wayland = env.XDG_SESSION_TYPE === 'wayland' || !!env.WAYLAND_DISPLAY;
  if (env.YOUCODED_BUDDY_STRATEGY === 'windows' || env.YOUCODED_BUDDY_STRATEGY === 'overlay') {
    return env.YOUCODED_BUDDY_STRATEGY; // dev/test override + user escape hatch
  }
  return wayland ? 'overlay' : 'windows';
}
```

- [ ] **Step 1: Write the failing test** (`desktop/tests/buddy-strategy.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { chooseBuddyStrategy } from '../src/main/buddy-manager';

describe('chooseBuddyStrategy', () => {
  it('overlay only on linux wayland', () => {
    expect(chooseBuddyStrategy('linux', { XDG_SESSION_TYPE: 'wayland' })).toBe('overlay');
    expect(chooseBuddyStrategy('linux', { WAYLAND_DISPLAY: 'wayland-0' })).toBe('overlay');
    expect(chooseBuddyStrategy('linux', { XDG_SESSION_TYPE: 'x11' })).toBe('windows');
    expect(chooseBuddyStrategy('win32', { XDG_SESSION_TYPE: 'wayland' })).toBe('windows');
    expect(chooseBuddyStrategy('darwin', {})).toBe('windows');
  });
  it('env override wins on linux', () => {
    expect(chooseBuddyStrategy('linux', { XDG_SESSION_TYPE: 'wayland', YOUCODED_BUDDY_STRATEGY: 'windows' })).toBe('windows');
    expect(chooseBuddyStrategy('linux', { XDG_SESSION_TYPE: 'x11', YOUCODED_BUDDY_STRATEGY: 'overlay' })).toBe('overlay');
    expect(chooseBuddyStrategy('win32', { YOUCODED_BUDDY_STRATEGY: 'overlay' })).toBe('windows');
  });
});
```

- [ ] **Step 2: Run it — fails** (`npx vitest run tests/buddy-strategy.test.ts`, "Cannot find module").
- [ ] **Step 3: Create `buddy-manager.ts`** exactly as in Interfaces above. Run test — passes.
- [ ] **Step 4: Implement the interface on `BuddyWindowManager`** — add:

```ts
// in buddy-window-manager.ts, near getMascotWindow (:474)
captureWindows(): BrowserWindow[] {
  return [this.mascot, this.chat, this.bar].filter((w): w is BrowserWindow => !!w && !w.isDestroyed());
}
chatWebContents(): Electron.WebContents | null {
  return this.chat && !this.chat.isDestroyed() ? this.chat.webContents : null;
}
```

Declare `implements BuddyManager` on the class (compile-time proof of parity).

- [ ] **Step 5: Refactor main.ts.** Type `buddyManagerRef: BuddyManager | null` (:115). In the capture handler (:1514-1580) replace the three getter calls with `buddyManager.captureWindows()` iteration; at :1575 replace the `liveChat` lookup with `buddyManager.chatWebContents()?.send(IPC.BUDDY_ATTACH_FILE, tmpPath)`. NO behavior change — same windows, same order-insensitive hide/restore.
- [ ] **Step 6: Verify + commit.** `npx tsc --noEmit && npx vitest run tests/` all green. `git commit -m "refactor(buddy): BuddyManager interface + strategy selector; capture/attach go through it"`

---

### Task 3: `BuddyOverlayManager` (main) — window lifecycle + click-through default

**Files:**
- Create: `desktop/src/main/buddy-overlay-manager.ts`
- Modify: `desktop/src/main/main.ts:472-533` (`createAppWindow`: accept `buddy: 'overlay'` variant), `:596-597` (mode query already generic — `?mode=buddy-overlay` falls out), `:1423-1447` (construct by strategy)
- Test: `desktop/tests/buddy-overlay-manager.test.ts` (pure helpers only — window code follows the codebase's untested-manager pattern)

**Interfaces:**
- Consumes: `BuddyManager` + `chooseBuddyStrategy` (Task 2); `createAppWindow` opts.
- Produces:

```ts
export const OVERLAY_TITLE = 'YouCoded Buddy';   // Task 8's KWin script matches on this
export class BuddyOverlayManager implements BuddyManager { constructor(deps: BuddyOverlayDeps) }
interface BuddyOverlayDeps {
  createOverlayWindow(opts: { width: number; height: number }): BrowserWindow;
  getPersisted(): { mascot: Point | null; dock: DockEdge | null; keepAbove: boolean };
  persist(state: { mascot: Point; dock: DockEdge | null }): void;
  registry: WindowRegistry;                     // same subscribe/unsubscribe as today
  mainWindow: () => BrowserWindow | null;
  onStatusChanged(status: { dismissed: boolean; visible: boolean }): void;
  applyKeepAbove(win: BrowserWindow): void;     // Task 8 injects the KWin script runner; no-op until then
}
// pure, exported for tests:
export function overlayInitPayload(displayBounds: Rect, displayWorkArea: Rect,
  persisted: { mascot: Point | null; dock: DockEdge | null }): OverlayInit;
export interface OverlayInit {
  workArea: Rect;              // WINDOW-LOCAL: workArea offset by -displayBounds.x/y
  mascot: Point | null;        // window-local, pre-clamped into workArea, or null (renderer picks default)
  dock: DockEdge | null;
}
```

- [ ] **Step 0 (20 s, Destin): confirm click-through pass-through.** Run the archived workbench (`docs/active/prototypes/2026-07-22-buddy-wayland-workbench/`, `--interactive`), press "ignore + forward (12s)", click on a window BEHIND the empty area. Click must land on the thing underneath. If not → STOP (Open Question 1).
- [ ] **Step 1: Failing test for the pure payload builder:**

```ts
import { describe, it, expect } from 'vitest';
import { overlayInitPayload } from '../src/main/buddy-overlay-manager';

describe('overlayInitPayload', () => {
  const bounds = { x: 0, y: 0, width: 1707, height: 1067 };
  const workArea = { x: 0, y: 0, width: 1707, height: 1018 };
  it('converts workArea to window-local and clamps persisted mascot', () => {
    const p = overlayInitPayload(bounds, workArea, { mascot: { x: 5000, y: -50 }, dock: 'right' });
    expect(p.workArea).toEqual({ x: 0, y: 0, width: 1707, height: 1018 });
    expect(p.mascot!.x).toBeLessThanOrEqual(1707 - 112);   // MASCOT_SIZE.width
    expect(p.mascot!.y).toBeGreaterThanOrEqual(0);
    expect(p.dock).toBe('right');
  });
  it('offsets workArea when display bounds do not start at 0 (secondary-display safety)', () => {
    const p = overlayInitPayload({ x: 1707, y: 0, width: 1920, height: 1080 },
      { x: 1707, y: 40, width: 1920, height: 1040 }, { mascot: null, dock: null });
    expect(p.workArea).toEqual({ x: 0, y: 40, width: 1920, height: 1040 });
    expect(p.mascot).toBeNull();
  });
});
```

- [ ] **Step 2: Run — fails.** Step 3: implement `overlayInitPayload` using `clampToWorkArea` + `MASCOT_SIZE` from `src/shared/buddy-geometry`. Run — passes.
- [ ] **Step 4: Implement the manager.** Key behaviors (mirror `BuddyWindowManager`'s public contract; keep it lean):
  - `show()`: if window missing → `deps.createOverlayWindow({...screen.getPrimaryDisplay().bounds})` (size = bounds; construct-at-size IS the positioning mechanism — never call `setPosition`, never `maximize`). `win.setTitle(OVERLAY_TITLE)`; `win.setAlwaysOnTop(true,'screen-saver')` (harmless request); **`win.setIgnoreMouseEvents(true, { forward: true })` immediately** — the overlay must NEVER eat clicks by default; `deps.applyKeepAbove(win)` if persisted keepAbove; `showInactive()`; on `did-finish-load` send `IPC.BUDDY_OVERLAY_INIT` with `overlayInitPayload(...)` (channel added in Task 4; until then keep the send behind `if (IPC.BUDDY_OVERLAY_INIT)` — actually: Tasks 3+4 land in one PR sequence, wire it directly and let tsc gate ordering). Clear `dismissed`, fire `onStatusChanged`.
  - `screen.on('display-metrics-changed' | 'primary-display-changed')`: destroy + recreate the window at new bounds (simplest correct resize on Wayland), re-send init. Debounce 300 ms.
  - `hide()/dismiss()/getStatus()`: same semantics as three-window (`dismiss` = hide + `dismissed=true`; every `show()` clears it — PITFALLS: the hide button must NOT write the localStorage preference).
  - `toggleChat()`: `win.webContents.send(IPC.BUDDY_OVERLAY_TOGGLE_CHAT)` (external callers only; mascot clicks are renderer-local).
  - `setViewedSession(id)`: identical subscribe/unsubscribe dance as `BuddyWindowManager.setViewedSession` (:449-460) but with the overlay's `webContents.id`.
  - `setInteractive(interactive: boolean)`: `interactive ? win.setIgnoreMouseEvents(false) : win.setIgnoreMouseEvents(true, {forward:true})`. (Open Question 3 lands here: add `win.focus()` on `true` if the eyeball shows the chat input can't take keys.)
  - `captureWindows()` → `[overlay]`; `chatWebContents()` → overlay wc; `moveMascot`/`dragEnded` → no-ops with a WHY comment (three-window-only path).
- [ ] **Step 5: Wire construction in main.ts:**

```ts
// main.ts, replacing the unconditional construction at :1423
const buddyStrategy = chooseBuddyStrategy(process.platform, process.env);
const buddyManager: BuddyManager = buddyStrategy === 'overlay'
  ? new BuddyOverlayManager({ /* deps: reuse buddyPositions load/save, add keepAbove field */ })
  : new BuddyWindowManager({ /* existing deps object, unchanged */ });
```

`createAppWindow` gains `buddy?: 'mascot'|'chat'|'bar'|'overlay'`; overlay uses the same `buddyExtras` flag block, dimensions passed explicitly by the manager (`opts.width/height` — bounds-sized), registers in the registry as kind `'buddy'` (:641 already generic). Extend `BuddyPositionsFile` (:1411) with `keepAbove?: boolean`.
- [ ] **Step 6: Verify.** `npx tsc --noEmit && npx vitest run tests/` green. Launch `bash scripts/run-dev.sh <branch>` on THIS machine (Wayland): expect an invisible full-screen overlay window to exist (verify via the KWin probe recipe in FINDINGS — `KWINPROBE|electron|YouCoded Buddy|x=0,y=0,w=1707…`), desktop clicks pass through everywhere, no rendering yet (renderer root lands in Task 5). On a `YOUCODED_BUDDY_STRATEGY=windows` relaunch: three-window behavior identical to master.
- [ ] **Step 7: Commit.** `git commit -m "feat(buddy): BuddyOverlayManager — one screen-sized click-through window on Linux Wayland"`

---

### Task 4: New IPC channels + preload + `BuddyApi` additions

**Files:**
- Modify: `desktop/src/shared/types.ts` (`IPC` object ~:955-994; `BuddyApi` :560-595)
- Modify: `desktop/src/main/preload.ts` (:264-283 channel literals; :1018-1080 buddy API)
- Modify: `desktop/src/main/main.ts` (handlers beside the existing buddy block :1449-1480)
- Modify: `desktop/src/renderer/remote-shim.ts` (parity stubs, same no-op pattern as existing buddy methods)

**Interfaces (produces — exact strings; preload INLINES them):**

| Const | String | Direction | Payload |
|---|---|---|---|
| `IPC.BUDDY_OVERLAY_INIT` | `buddy:overlay-init` | main → overlay push | `OverlayInit` (Task 3) |
| `IPC.BUDDY_OVERLAY_SET_INTERACTIVE` | `buddy:overlay-set-interactive` | renderer → main, `send` | `{ interactive: boolean }` |
| `IPC.BUDDY_OVERLAY_PERSIST` | `buddy:overlay-persist` | renderer → main, `send` | `{ mascot: Point; dock: DockEdge \| null }` |
| `IPC.BUDDY_OVERLAY_TOGGLE_CHAT` | `buddy:overlay-toggle-chat` | main → overlay push | none |

`BuddyApi` additions (types.ts + preload impl + remote-shim no-op stubs):

```ts
onOverlayInit(cb: (init: { workArea: {x:number;y:number;width:number;height:number};
  mascot: {x:number;y:number} | null; dock: string | null }) => void): () => void;
onOverlayToggleChat(cb: () => void): () => void;
overlaySetInteractive(interactive: boolean): void;   // send, fire-and-forget (hover-hot path)
overlayPersist(state: { mascot: {x:number;y:number}; dock: string | null }): void; // send
```

- [ ] **Step 1:** Add the four consts to `IPC` in types.ts, the four members to `BuddyApi`, the inlined-literal listeners/senders in preload (copy the established `onBarState`/`moveMascot` patterns at :1061/:1028), and remote-shim stubs. Main-side: `ipcMain.on(IPC.BUDDY_OVERLAY_SET_INTERACTIVE, (evt, {interactive}) => { if (buddyManager instanceof BuddyOverlayManager && buddyManager.isBuddyWindow(BrowserWindow.fromWebContents(evt.sender)!)) buddyManager.setInteractive(interactive); })` and the analogous `BUDDY_OVERLAY_PERSIST` → `deps.persist`. (Guarding on sender identity keeps a compromised main window from puppeting the overlay's input mode.)
- [ ] **Step 2: Verify + commit.** `npx tsc --noEmit` (this catches preload/types/shim drift), `npx vitest run tests/`. `git commit -m "feat(buddy): overlay IPC surface — init push, hover interactivity, persistence"`

---

### Task 5: Overlay renderer state module (pure) + tests

All overlay behavior decisions live in one pure reducer so they're vitest-testable without DOM: mascot drag, dock snap (reusing `dockReducer`/`detectSnapEdge`/`dockPosition`), chat/bar reveal (bar shows only with chat — PITFALLS), group layout (chat fit constrains mascot — reuse `computeGroupLayout`).

**Files:**
- Create: `desktop/src/renderer/components/buddy/overlay-state.ts`
- Test: `desktop/tests/buddy-overlay-state.test.ts`

**Interfaces:**
- Consumes: `src/shared/buddy-geometry` + `src/shared/buddy-dock` (Task 1 paths).
- Produces:

```ts
export interface OverlayState {
  workArea: Rect;                          // window-local
  mascot: Point;                           // window-local mascot window-rect origin
  dock: DockState;                         // {mode:'free'|'docked'|'peeking', edge}
  chatVisible: boolean;
  barVisible: boolean;                     // invariant: barVisible → chatVisible
}
export type OverlayAction =
  | { type: 'init'; init: OverlayInitLike }
  | { type: 'drag-move'; to: Point }        // raw pointer target; reducer clamps + peeks
  | { type: 'drag-end' }
  | { type: 'toggle-chat' }
  | { type: 'engage' } | { type: 'disengage' };
export function overlayReducer(s: OverlayState, a: OverlayAction): OverlayState;
export function overlayLayout(s: OverlayState): {
  mascot: Point; chat: Point; bar: Point;   // window-local CSS positions
};
export function defaultMascotPosition(workArea: Rect): Point; // bottom-right nook, clamped
```

- [ ] **Step 1: Failing tests** — port the semantics the three-window model guarantees (each `it` cites its source rule):

```ts
import { describe, it, expect } from 'vitest';
import { overlayReducer, overlayLayout, defaultMascotPosition } from '../src/renderer/components/buddy/overlay-state';
import { MASCOT_SIZE, CHAT_SIZE } from '../src/shared/buddy-geometry';

const wa = { x: 0, y: 0, width: 1707, height: 1018 };
const base = { workArea: wa, mascot: { x: 800, y: 500 }, dock: { mode: 'free' as const, edge: null }, chatVisible: false, barVisible: false };

describe('overlayReducer', () => {
  it('drag clamps into workArea (buddy-edge-clamp contract)', () => {
    const s = overlayReducer(base, { type: 'drag-move', to: { x: 99999, y: -50 } });
    expect(s.mascot.x).toBe(wa.width - MASCOT_SIZE.width);
    expect(s.mascot.y).toBe(0);
  });
  it('drag within SNAP_THRESHOLD of an edge → drag-end docks flush (dockReducer contract)', () => {
    const nearRight = overlayReducer(base, { type: 'drag-move', to: { x: wa.width - MASCOT_SIZE.width - 10, y: 500 } });
    const s = overlayReducer(nearRight, { type: 'drag-end' });
    expect(s.dock.mode).toBe('docked');
    expect(s.dock.edge).toBe('right');
  });
  it('bar only ever visible with chat (PITFALLS: bar opens with the chat and nothing else)', () => {
    const open = overlayReducer(base, { type: 'toggle-chat' });
    expect(open.chatVisible).toBe(true); expect(open.barVisible).toBe(true);
    const closed = overlayReducer(open, { type: 'toggle-chat' });
    expect(closed.barVisible).toBe(false);
  });
  it('disengage from peeking re-flushes to the edge (PITFALLS: hanging-off-nothing)', () => {
    const docked = { ...base, dock: { mode: 'peeking' as const, edge: 'right' as const }, mascot: { x: 900, y: 500 } };
    const s = overlayReducer(docked, { type: 'disengage' });
    expect(s.mascot.x).toBe(wa.width - MASCOT_SIZE.width); // flush, not stranded
  });
});

describe('overlayLayout', () => {
  it('chat position comes from computeGroupLayout — chat never offscreen', () => {
    const s = { ...base, mascot: { x: wa.width - MASCOT_SIZE.width, y: 300 }, chatVisible: true, barVisible: true };
    const l = overlayLayout(s);
    expect(l.chat.x + CHAT_SIZE.width).toBeLessThanOrEqual(wa.width);
    expect(l.chat.x).toBeGreaterThanOrEqual(0);
  });
});

describe('defaultMascotPosition', () => {
  it('lands inside the work area', () => {
    const p = defaultMascotPosition(wa);
    expect(p.x + MASCOT_SIZE.width).toBeLessThanOrEqual(wa.width);
    expect(p.y + MASCOT_SIZE.height).toBeLessThanOrEqual(wa.height);
  });
});
```

- [ ] **Step 2: Run — fails.** Step 3: implement. Composition notes: `drag-move` = clamp via `clampToWorkArea` then `dockReducer(state, {type:'drag-peek', edge: detectSnapEdge(...)})`; `drag-end` = `dockReducer(state, {type:'drag-release', snapEdge: detectSnapEdge(...)})` + on `docked`, `mascot = dockPosition(edge, mascot, MASCOT_SIZE, workArea)`; `toggle-chat` sets both `chatVisible` and `barVisible` (BarVisibilityTracker's `wantsVisible()` is literally `chatOpen` — inline it, one WHY comment); `disengage` on `peeking` = `dockPosition` re-flush; chat/mascot group position via `computeGroupLayout({...MASCOT_SIZE, ...mascot}, workArea)` and bar via `computeBarPosition`. If `computeGroupLayout` moves the mascot to fit the chat, ADOPT that mascot position into state (rigid-group rule).
- [ ] **Step 4: Run — passes. Full suite green. Commit.** `git commit -m "feat(buddy): pure overlay state — drag/dock/reveal/layout with three-window semantics"`

---

### Task 6: `BuddyOverlayApp` — mount, hover interactivity, mascot hosting

**Files:**
- Create: `desktop/src/renderer/components/buddy/BuddyOverlayApp.tsx`
- Modify: `desktop/src/renderer/App.tsx` (:130-132 mode parse already generic; add route at :3327 block: `if (buddyMode === 'buddy-overlay') return <BuddyOverlayApp />;`)
- Modify: `desktop/src/renderer/index.tsx:24-27` (accept `'buddy-overlay'` in the data-mode allowlist)
- Modify: `desktop/src/renderer/components/buddy/BuddyMascot.tsx` (overlay props, ~25 lines)
- Test: renderer component tests are not part of this codebase's pattern; the logic is in Task 5's pure module. tsc + eyeball gate this task.

**Interfaces:**
- Consumes: `window.claude.buddy.onOverlayInit/onOverlayToggleChat/overlaySetInteractive/overlayPersist` (Task 4), `overlayReducer/overlayLayout/defaultMascotPosition` (Task 5).
- Produces: `BuddyMascot` new optional props — **when `overlayDrive` is present, the component makes NO buddy IPC calls**:

```ts
interface OverlayDrive {
  dock: { mode: 'free'|'docked'|'peeking'; edge: string|null }; // replaces onMascotState subscription
  onDragMove(target: { x: number; y: number }): void;  // replaces moveMascot IPC (rAF-coalesced by caller)
  onDragEnd(): void;                                    // replaces dragEnded IPC
  onTap(): void;                                        // replaces toggleChat IPC
}
// BuddyMascot: export function BuddyMascot(props: { overlayDrive?: OverlayDrive })
```

- [ ] **Step 1: BuddyMascot overlay props.** In the existing handlers: `flushPendingMove` (:144) calls `overlayDrive ? overlayDrive.onDragMove(target) : window.claude?.buddy?.moveMascot?.(target)` — note the target it computes today is `e.screenX - grabOffset`; in overlay mode use `e.clientX/clientY` (window-local — the coordinates rule). `endDrag` (:170) → `onDragEnd()`. Click branch (:242) → `onTap()`. The `onMascotState` subscription effect (:63) is skipped entirely when `overlayDrive` (dock comes from the prop). Everything else (poses, swing, hover-hop, rig) untouched — it's all transform-local.
- [ ] **Step 2: BuddyOverlayApp.** Structure (complete component, ~120 lines):
  - `useReducer(overlayReducer, INIT_PLACEHOLDER)`; `onOverlayInit` effect dispatches `{type:'init'}` (mascot: persisted ?? `defaultMascotPosition`).
  - `onOverlayToggleChat` → dispatch `{type:'toggle-chat'}`.
  - Renders inside `<ThemeProvider>`: a fixed-position mascot wrapper at `layout.mascot` hosting `<BuddyMascot overlayDrive={...}/>`; when `chatVisible`, a chat panel wrapper at `layout.chat` hosting `<BuddyChat/>` inside `<ChatProvider>` (mirror `BuddyChatApp.tsx`'s provider nesting + fade classes exactly); when `barVisible`, the three-button bar at `layout.bar` (lift the button row out of `BuddyBarApp.tsx` into a shared `BuddyBarButtons` component so both mounts render identical DOM — move, don't duplicate).
  - **Hover → interactivity:** each of the three wrappers gets `onPointerEnter={() => hover(+1)}` / `onPointerLeave={() => hover(-1)}`; `hover` keeps a ref count and calls `overlaySetInteractive(count > 0)` — with a 60 ms trailing debounce on the `false` edge only (prevents flap crossing between mascot and bar; instant `true` edge so the first click always lands). While a drag is active, force-hold `true` until `onDragEnd`.
  - **Persistence:** on `drag-end` and on dock change, `overlayPersist({ mascot: state.mascot, dock: state.dock.edge })` (300 ms debounce — mirrors the three-window save debounce).
  - Drag targets from `BuddyMascot` are rAF-coalesced already (its `pendingTargetRef` machinery) — dispatch `{type:'drag-move', to}` directly; the reducer is cheap.
- [ ] **Step 3: Route it.** App.tsx + index.tsx edits above. WHY comment on the route: overlay is the Linux-Wayland buddy host; other platforms keep per-window mounts.
- [ ] **Step 4: Verify.** `npx tsc --noEmit && npx vitest run tests/` green (Android unaffected: new mode never set there, no new top-level imports beyond existing buddy components). Dev instance on this machine: mascot renders inside the invisible overlay; dragging moves him smoothly (no smear — Electron 41.10.3); clicks in empty desktop areas still pass through; hovering the mascot makes him clickable; tap opens chat+bar positioned by the group rules; drag near an edge docks/peeks. **Destin eyeballs this checkpoint before Task 7 proceeds.**
- [ ] **Step 5: Commit.** `git commit -m "feat(buddy): overlay renderer — mascot/chat/bar as DOM, hover-driven interactivity"`

---### Task 7: Chat + bar feature parity inside the overlay

**Files:**
- Modify: `desktop/src/renderer/components/buddy/BuddyBarApp.tsx` (extract `BuddyBarButtons`), `BuddyOverlayApp.tsx` (consume it)
- Modify: `desktop/src/main/main.ts` capture handler (verify overlay path end-to-end — code landed in Tasks 2-3)

**Interfaces:** consumes `captureWindows()`/`chatWebContents()` (Task 2/3). No new surface.

- [ ] **Step 1:** Extract `BuddyBarButtons` (screenshot / open-main / hide) from `BuddyBarApp.tsx` verbatim; `BuddyBarApp` renders it unchanged (three-window platforms identical DOM), overlay renders it at `layout.bar`.
- [ ] **Step 2: Dev-instance functional pass (Destin + logs):** capture-icon flow hides the WHOLE overlay for the snap (acceptable v1 — it is the buddy being excluded), attaches the PNG into the buddy chat (`BUDDY_ATTACH_FILE` → overlay wc → existing `onAttachFile` listener in `BuddyChat`); open-main focuses the main window + `SESSION_FOCUS_REQUEST` carries the viewed session; hide dismisses for the run (localStorage preference untouched — PITFALLS); session pill switching re-routes transcript events (registry subscribe on overlay wc id); attention summary reaches the mascot (`SESSION_ATTENTION_SUMMARY` is broadcast — no wiring needed, confirm visually).
- [ ] **Step 3: Commit.** `git commit -m "feat(buddy): overlay chat/bar parity — capture, open-main, session routing"`

---

### Task 8: Keep-above via KWin scripting (opt-in) + Settings toggle

**Files:**
- Create: `desktop/src/main/kwin-keep-above.ts`
- Modify: `desktop/src/main/buddy-overlay-manager.ts` (`applyKeepAbove` dep wired to it)
- Modify: `desktop/src/main/main.ts` (one `ipcMain.handle` + persistence field from Task 3)
- Modify: `desktop/src/main/preload.ts`, `src/shared/types.ts`, `remote-shim.ts` (`buddy.setKeepAbove(enabled): Promise<boolean>`, channel `buddy:overlay-keep-above`)
- Modify: `desktop/src/renderer/components/SettingsPanel.tsx` (toggle in the existing buddy row, rendered only when `platform === 'linux'`)
- Test: `desktop/tests/kwin-keep-above.test.ts` (script-text builder only)

**Interfaces:**

```ts
// kwin-keep-above.ts
export function buildKeepAboveScript(title: string, keepAbove: boolean): string; // pure — tested
export async function applyKwinKeepAbove(title: string, keepAbove: boolean): Promise<boolean>;
// writes buildKeepAboveScript() to a temp file, then (qdbus6 || qdbus):
//   loadScript(<file>, 'youcoded-buddy-keepabove') → /Scripting/Script<id> run → unloadScript
// Returns false (never throws) when qdbus/KWin absent — silent no-op on GNOME/wlroots.
```

- [ ] **Step 1: Failing test** — `buildKeepAboveScript('YouCoded Buddy', true)` output contains `workspace.windowList()`, an exact-caption filter on `'YouCoded Buddy'`, and `keepAbove = true`; the `false` variant sets `false`. (Exact mechanism validated live 2026-07-22 via `kwin-probe.js` — same DBus recipe, archived in the prototype dir.)
- [ ] **Step 2-3: Implement; test passes.** Script body:

```js
for (const w of workspace.windowList()) {
  if (w.caption === TITLE_JSON) { w.keepAbove = KEEP; }
}
```

(`TITLE_JSON` = `JSON.stringify(title)` — never string-interpolate unescaped.)
- [ ] **Step 4:** Overlay manager calls `applyKeepAbove(win)` on every show/recreate when the persisted flag is on (KWin state does not survive window recreation). Settings toggle: copy reads "Pin buddy above other windows (KDE only)" with sublabel "Requires KDE Plasma. No effect on other desktops." — Open Question 4 resolved by this copy.
- [ ] **Step 5: Verify on dev instance:** toggle on → KWin probe shows `keepAbove=true` for `YouCoded Buddy`; focus another window → mascot stays visible (Destin). Toggle off → reverts. `npx vitest run tests/` green.
- [ ] **Step 6: Commit.** `git commit -m "feat(buddy): opt-in KDE keep-above via KWin scripting DBus"`

---

### Task 9: Full verification, docs, ship

**Files:**
- Modify: `docs/PITFALLS.md` (§Buddy Floater — overlay addendum), `youcoded/desktop/CLAUDE.md` (one line: buddy hosting strategies)
- Modify: `ROADMAP.md` (flip 'Wayland-native one-window rewrite' + fold-in note on the scene-companion item)
- Move: spec + this plan + `docs/active/prototypes/2026-07-22-buddy-wayland-workbench/` + the 2026-07-22 handoff → `docs/archive/…` (after merge)
- Remove: `worktrees/xwayland-floater` + branch (experiment record superseded by shipped code)

- [ ] **Step 1: Automated gate.** `cd desktop && npx tsc --noEmit && npx vitest run && npm run build` — all green.
- [ ] **Step 2: Destin's eyeball checklist (dev instance, Wayland):** drag smoothness + no smear; dock all four edges; peek pose sits flush (no hanging-off-nothing); chat opens/closes with bar; chat input takes keyboard focus (Open Question 3); type + send in buddy chat; session pill switch; capture flow; open-main; hide + Settings "Show now"; empty-desktop clicks pass through THE WHOLE TIME; keep-above toggle. If the TV is convenient: connect it, confirm the overlay stays sane on the primary display (Open Question 2).
- [ ] **Step 3: Non-Wayland regression:** relaunch dev with `YOUCODED_BUDDY_STRATEGY=windows` — three-window behavior identical to master (drag via IPC, bar reveal, capture). This is the seam's guard.
- [ ] **Step 4: PITFALLS addendum (overlay invariants, condensed):** overlay ignores mouse by default — every new interactive element MUST sit inside a hover-counted wrapper or it is unclickable; never read `getPosition/getBounds` for overlay logic (Wayland lies — window-local coords only); overlay recreation on display changes must re-apply keep-above + re-send init.
- [ ] **Step 5: PR** to itsdestin/youcoded (spec + FINDINGS linked), merge on Destin's approval, then the doc moves + roadmap flips + worktree cleanup in the same session (merge = merge AND push AND archive).

---

## Self-review notes (done at write time)

- Spec coverage: platform seam (T2/T3), overlay window + construct-at-size (T3), click-through (T3 step 0 + T6), drag/peek/dock semantics (T5/T6), chat/bar + capture/session routing (T7), keep-above (T8), verification + non-Wayland guard + docs lifecycle (T9), coordinates rule (global constraint + T3 payload + T6 drag). Spec's "residual verification" is T3 step 0.
- Type consistency: `OverlayInit`/`OverlayDrive`/`OverlayState` names used identically across T3-T6; channel strings identical in T4 table and T3/T6 usage.
- The one intentionally-deferred code body is `BuddyOverlayApp` JSX (T6 gives structure + exact behaviors, not full markup) — its correctness gate is the T6 eyeball checkpoint, and the fade/provider nesting is specified as "mirror `BuddyChatApp.tsx` exactly," which is a copyable source, not a guess.
