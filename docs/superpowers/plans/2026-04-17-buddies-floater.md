# Buddies Floater Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a desktop MVP "buddy" — a floating always-on-top mascot plus a compact chat window — that lets users see Claude's state and interact with any running session without un-minimizing the main app.

**Architecture:** Two new transparent `BrowserWindow`s per active buddy (mascot ~80×80, chat 320×480) spawned from the existing `createAppWindow` factory with a buddy variant. Both load the same Vite bundle with a `?mode=buddy-mascot|buddy-chat` query param; `App.tsx` branches on mount. Session data flows via a new subscription layer added to `WindowRegistry` alongside the existing `ownership` map. The buddy is fully independent from main's active session — it has its own switcher.

**Tech Stack:** Electron, React 19, TypeScript, Vite, vitest (test runner), Tailwind. Reuses existing chat-reducer, transcript watcher, theme engine, `<ThemeMascot>`, `<InputBar>`, and overlay primitives.

**Spec:** `docs/superpowers/specs/2026-04-17-buddies-floater-design.md`

---

## File Structure

### New files

| Path | Responsibility |
|------|----------------|
| `youcoded/desktop/src/main/buddy-window-manager.ts` | Main-process orchestration for buddy windows: show/hide/toggle-chat, position load/save, edge clamp, chat lazy-create. |
| `youcoded/desktop/src/renderer/components/buddy/BuddyMascotApp.tsx` | Mode-routed root for `?mode=buddy-mascot`. Wraps minimal providers + `<BuddyMascot>`. |
| `youcoded/desktop/src/renderer/components/buddy/BuddyChatApp.tsx` | Mode-routed root for `?mode=buddy-chat`. Wraps `ThemeProvider` + reducer + `<BuddyChat>`. |
| `youcoded/desktop/src/renderer/components/buddy/BuddyMascot.tsx` | Mascot component — renders `<ThemeMascot>`, handles click-vs-drag, toggles chat. |
| `youcoded/desktop/src/renderer/components/buddy/BuddyChat.tsx` | Chat window root — composes SessionPill, BubbleFeed, CompactToolStrip, AttentionStrip, InputBar. |
| `youcoded/desktop/src/renderer/components/buddy/SessionPill.tsx` | Top pill + dropdown switcher. Lists running sessions, "+ New session…". |
| `youcoded/desktop/src/renderer/components/buddy/CompactToolStrip.tsx` | Collapsed `─ N tools used ▾` strip; expanded tool-row list; inline permission Allow/Deny/Always buttons. |
| `youcoded/desktop/src/renderer/components/buddy/AttentionStrip.tsx` | Slim bottom attention pill (hidden when state is `'ok'`). |
| `youcoded/desktop/src/renderer/hooks/useAnyAttentionNeeded.ts` | Subscribes to `session:attention-summary` push and returns boolean. |
| `youcoded/desktop/src/renderer/styles/buddy.css` | `[data-mode="buddy-chat"]` / `[data-mode="buddy-mascot"]` CSS scope overrides (canvas transparent, font-size, stripped markdown). |
| `youcoded/desktop/tests/window-registry-subscriptions.test.ts` | Unit tests for subscription map mutations + auto-release. |
| `youcoded/desktop/tests/use-any-attention-needed.test.ts` | Unit tests for the attention-union selector. |
| `youcoded/desktop/tests/buddy-edge-clamp.test.ts` | Unit tests for multi-monitor / off-screen position clamping. |

### Modified files

| Path | Change |
|------|--------|
| `youcoded/desktop/src/shared/types.ts` | Add buddy IPC channel constants; add `SessionInfo.lastActivityAt` if missing; add `AttentionSummary` type. |
| `youcoded/desktop/src/main/window-registry.ts` | Add `subscriptions: Map<sessionId, Set<wcId>>`; `subscribe` / `unsubscribe` / `getSubscribers` / `releaseAllForWindow`. |
| `youcoded/desktop/src/main/main.ts` | Extend `createAppWindow` with a `buddy` variant; wire `BuddyWindowManager`; route session events to owner ∪ subscribers; handle `render-process-gone` for buddy windows. |
| `youcoded/desktop/src/main/ipc-handlers.ts` | Add `buddy:*` handlers; emit `session:attention-summary` on transitions. |
| `youcoded/desktop/src/main/preload.ts` | Expose `window.claude.buddy.*` API (inlined channel names per sandboxed-preload rule). |
| `youcoded/desktop/src/renderer/remote-shim.ts` | Stub `window.claude.buddy.*` with `throw new Error('Buddy is desktop-only in this version')`. |
| `youcoded/desktop/src/renderer/App.tsx` | Mode routing branch at top: check `new URLSearchParams(location.search).get('mode')`. |
| `youcoded/desktop/src/renderer/components/InputBar.tsx` | Accept `compact?: boolean` prop; conditionally hide `<QuickChips>`. |
| `youcoded/desktop/src/renderer/components/SettingsPanel.tsx` | Add "Show buddy floater" toggle in the Appearance area. |
| `youcoded/desktop/src/renderer/styles/globals.css` | Import `buddy.css`; keep buddy-specific rules in the dedicated file. |

---

## Phase 0 — Worktree setup

### Task 0: Create isolated worktree

Per `CLAUDE.md`, all non-trivial work must happen in a dedicated worktree.

- [ ] **Step 1: Create worktree and feature branch**

```bash
cd /c/Users/desti/youcoded-dev/youcoded
git fetch origin
git worktree add -b feature/buddies-floater ../.worktrees/buddies-floater origin/master
```

- [ ] **Step 2: Install dependencies in the worktree's desktop dir**

```bash
cd ../.worktrees/buddies-floater/desktop
npm ci
```

Expected: no errors; `node_modules/` populated.

- [ ] **Step 3: Verify baseline builds and tests pass before touching anything**

```bash
cd /c/Users/desti/youcoded-dev/.worktrees/buddies-floater/desktop
npm test -- --run
npm run build
```

Expected: all existing tests pass; build succeeds. If either fails, stop and surface the issue before proceeding.

- [ ] **Step 4: Commit plan + spec references into the worktree (no-op commit)**

No file changes; just confirm the worktree is clean and on the correct branch:

```bash
git status
git log --oneline -5
```

Expected: clean working tree, branch `feature/buddies-floater` exists, HEAD matches origin/master.

---

## Phase A — Subscription layer (foundation)

Goal: events for a session route to the owner AND any subscribed windows. Buddy windows become subscribers later; for now this phase is pure infrastructure, fully tested, and doesn't change observable behavior for existing users (no subscribers = exact same routing as before).

### Task A1: Add subscription map to WindowRegistry

**Files:**
- Modify: `youcoded/desktop/src/main/window-registry.ts`
- Test: `youcoded/desktop/tests/window-registry-subscriptions.test.ts`

- [ ] **Step 1: Write failing test for subscribe/unsubscribe/getSubscribers**

Create `youcoded/desktop/tests/window-registry-subscriptions.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { WindowRegistry } from '../src/main/window-registry';

describe('WindowRegistry subscriptions', () => {
  let reg: WindowRegistry;
  beforeEach(() => {
    reg = new WindowRegistry();
    reg.registerWindow(100, Date.now());
    reg.registerWindow(200, Date.now());
  });

  it('subscribe adds windowId to the session subscriber set', () => {
    reg.subscribe('sess-1', 100);
    expect(reg.getSubscribers('sess-1')).toEqual(new Set([100]));
  });

  it('subscribe tolerates duplicate calls', () => {
    reg.subscribe('sess-1', 100);
    reg.subscribe('sess-1', 100);
    expect(reg.getSubscribers('sess-1').size).toBe(1);
  });

  it('two windows can subscribe to the same session', () => {
    reg.subscribe('sess-1', 100);
    reg.subscribe('sess-1', 200);
    expect(reg.getSubscribers('sess-1')).toEqual(new Set([100, 200]));
  });

  it('unsubscribe removes only the given windowId', () => {
    reg.subscribe('sess-1', 100);
    reg.subscribe('sess-1', 200);
    reg.unsubscribe('sess-1', 100);
    expect(reg.getSubscribers('sess-1')).toEqual(new Set([200]));
  });

  it('getSubscribers returns empty set when no subscribers', () => {
    expect(reg.getSubscribers('sess-unknown')).toEqual(new Set());
  });

  it('releaseAllSubscriptionsForWindow removes that window from every session', () => {
    reg.subscribe('sess-1', 100);
    reg.subscribe('sess-2', 100);
    reg.subscribe('sess-2', 200);
    reg.releaseAllSubscriptionsForWindow(100);
    expect(reg.getSubscribers('sess-1')).toEqual(new Set());
    expect(reg.getSubscribers('sess-2')).toEqual(new Set([200]));
  });

  it('emits changed on subscribe/unsubscribe', () => {
    let count = 0;
    reg.on('changed', () => count++);
    reg.subscribe('sess-1', 100);
    reg.unsubscribe('sess-1', 100);
    expect(count).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd /c/Users/desti/youcoded-dev/.worktrees/buddies-floater/desktop
npm test -- --run window-registry-subscriptions
```

Expected: FAIL with "subscribe is not a function" or similar.

- [ ] **Step 3: Add subscription map + methods to WindowRegistry**

Add to `youcoded/desktop/src/main/window-registry.ts` inside the `WindowRegistry` class, below `releaseSession`:

```ts
  // sessionId -> Set of subscriber windowIds. Separate from `ownership`:
  // a window can subscribe to a session it does NOT own (e.g. the buddy
  // mirrors the active session while main still owns it). Session events
  // are routed to owner UNION subscribers in the IPC router.
  private readonly subscriptions = new Map<string, Set<number>>();

  /** Add a subscription. Idempotent. Emits 'changed' on mutation. */
  subscribe(sessionId: string, windowId: number): void {
    let set = this.subscriptions.get(sessionId);
    if (!set) {
      set = new Set();
      this.subscriptions.set(sessionId, set);
    }
    const before = set.size;
    set.add(windowId);
    if (set.size !== before) this.emit('changed');
  }

  /** Remove a subscription. Idempotent. Emits 'changed' on mutation. */
  unsubscribe(sessionId: string, windowId: number): void {
    const set = this.subscriptions.get(sessionId);
    if (!set) return;
    const removed = set.delete(windowId);
    if (set.size === 0) this.subscriptions.delete(sessionId);
    if (removed) this.emit('changed');
  }

  /** Read-only view of subscribers for a session. */
  getSubscribers(sessionId: string): Set<number> {
    const set = this.subscriptions.get(sessionId);
    return set ? new Set(set) : new Set();
  }

  /**
   * Remove a window from every subscription.
   * @param silent - if true, suppresses the 'changed' emission so callers
   *                 that want to bundle it into a larger mutation (e.g.
   *                 unregisterWindow) can emit exactly one event.
   */
  releaseAllSubscriptionsForWindow(windowId: number, silent = false): void {
    let mutated = false;
    for (const [sid, set] of this.subscriptions) {
      if (set.delete(windowId)) mutated = true;
      if (set.size === 0) this.subscriptions.delete(sid);
    }
    if (mutated && !silent) this.emit('changed');
  }
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npm test -- --run window-registry-subscriptions
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/window-registry.ts tests/window-registry-subscriptions.test.ts
git commit -m "feat(buddy): add subscription layer to WindowRegistry"
```

---

### Task A2: Route session events to owner ∪ subscribers

**Files:**
- Modify: `youcoded/desktop/src/main/main.ts` (event-routing helpers)

Currently `main.ts` has a `windowFromWcId` helper and session events are dispatched via per-owner lookups. We need to broadcast to owner + all subscribers for the session-scoped events listed in the spec.

- [ ] **Step 1: Find every existing send-to-owner site in main.ts**

```bash
cd /c/Users/desti/youcoded-dev/.worktrees/buddies-floater/desktop
grep -n 'ownership\|getOwner\|windowFromWcId' src/main/main.ts
```

Expected output includes at minimum the session-events dispatch site (look for `TRANSCRIPT_EVENT`, `PTY_OUTPUT`, `HOOK_EVENT`, `SESSION_PROCESS_EXITED` sends).

- [ ] **Step 2: Add a shared helper `sendToSessionAudience`**

Add near `windowFromWcId` in `main.ts`:

```ts
// Send a session-scoped IPC event to the owner window AND every subscriber
// window. Used for transcript, PTY, hook, and lifecycle events that the
// buddy subscription layer needs to observe without taking ownership.
function sendToSessionAudience(sessionId: string, channel: string, payload: unknown): void {
  const ids = new Set<number>();
  const owner = windowRegistry.getOwner(sessionId);
  if (owner != null) ids.add(owner);
  for (const sub of windowRegistry.getSubscribers(sessionId)) ids.add(sub);
  for (const wcId of ids) {
    const win = windowFromWcId(wcId);
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }
}
```

- [ ] **Step 3: Replace per-owner sends for the session-scoped channels**

Find the existing dispatch sites for the following channels and swap them to use `sendToSessionAudience(sessionId, channel, payload)`:

- `IPC.TRANSCRIPT_EVENT` (search for `TRANSCRIPT_EVENT`)
- `IPC.PTY_OUTPUT` (search for `PTY_OUTPUT`)
- `IPC.HOOK_EVENT` when it carries a `sessionId` (search for `HOOK_EVENT`)
- `IPC.SESSION_PROCESS_EXITED` (search for `SESSION_PROCESS_EXITED` or the dispatch that accompanies `session-exit`)

For each, the refactor looks like:

Before:
```ts
const owner = windowRegistry.getOwner(sessionId);
const win = owner ? windowFromWcId(owner) : mainWindow;
if (win && !win.isDestroyed()) win.webContents.send(IPC.TRANSCRIPT_EVENT, evt);
```

After:
```ts
sendToSessionAudience(sessionId, IPC.TRANSCRIPT_EVENT, evt);
```

**Important:** existing fallback behavior ("send to mainWindow when there's no owner") is intentional for orphaned events. Preserve it — in `sendToSessionAudience`, if `ids.size === 0` AND there's a `mainWindow`, fall back to `mainWindow`:

```ts
function sendToSessionAudience(sessionId: string, channel: string, payload: unknown): void {
  const ids = new Set<number>();
  const owner = windowRegistry.getOwner(sessionId);
  if (owner != null) ids.add(owner);
  for (const sub of windowRegistry.getSubscribers(sessionId)) ids.add(sub);

  if (ids.size === 0) {
    // Orphaned event — fall back to mainWindow so existing behavior is
    // preserved for sessions that haven't been claimed yet at boot.
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
    return;
  }
  for (const wcId of ids) {
    const win = windowFromWcId(wcId);
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }
}
```

- [ ] **Step 4: Run the full existing test suite to verify no regression**

```bash
npm test -- --run
```

Expected: all existing tests still pass. (No new tests for this task — routing is exercised end-to-end later.)

- [ ] **Step 5: Commit**

```bash
git add src/main/main.ts
git commit -m "refactor(buddy): route session events to owner ∪ subscribers"
```

---

### Task A3: Auto-release subscriptions on window destroy

**Files:**
- Modify: `youcoded/desktop/src/main/main.ts` (destroy hook)
- Test: `youcoded/desktop/tests/window-registry-subscriptions.test.ts` (extend)

- [ ] **Step 1: Extend the subscription test with a destroy-simulation**

Add to the existing test file:

```ts
  it('unregisterWindow releases all its subscriptions', () => {
    reg.subscribe('sess-1', 100);
    reg.subscribe('sess-2', 100);
    reg.subscribe('sess-1', 200);
    reg.unregisterWindow(100);
    expect(reg.getSubscribers('sess-1')).toEqual(new Set([200]));
    expect(reg.getSubscribers('sess-2')).toEqual(new Set());
  });
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npm test -- --run window-registry-subscriptions
```

Expected: FAIL on the new case because `unregisterWindow` doesn't touch subscriptions yet.

- [ ] **Step 3: Extend `unregisterWindow` to release subscriptions**

In `window-registry.ts`, modify `unregisterWindow` to call the helper from Task A1 in silent mode, then emit a single `changed` at the end:

```ts
unregisterWindow(id: number): void {
  if (!this.windows.has(id)) return;
  this.windows.delete(id);
  // Release any sessions owned by this window WITHOUT emitting per-release,
  // so consumers only see one 'changed' for the whole unregister.
  for (const [sessionId, ownerId] of this.ownership) {
    if (ownerId === id) this.ownership.delete(sessionId);
  }
  // Release subscriptions too — buddy windows subscribe without owning.
  this.releaseAllSubscriptionsForWindow(id, /* silent */ true);
  this.emit('changed');
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npm test -- --run window-registry-subscriptions
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Verify `main.ts` already calls `unregisterWindow` on window destroy**

```bash
grep -n 'unregisterWindow' src/main/main.ts
```

Expected: at least one site in a `closed` or `did-destroy` handler. If absent, add one by finding the window-creation path and adding:

```ts
win.webContents.on('destroyed', () => {
  windowRegistry.unregisterWindow(win.webContents.id);
});
```

(If already present, no change — `unregisterWindow` now handles both ownership and subscriptions in one call.)

- [ ] **Step 6: Commit**

```bash
git add src/main/window-registry.ts tests/window-registry-subscriptions.test.ts
git commit -m "feat(buddy): auto-release subscriptions on window destroy"
```

---

### Task A4: Reuse `TRANSCRIPT_REPLAY` for subscription snapshot

No new IPC needed — the existing `TRANSCRIPT_REPLAY` channel (used by a window acquiring ownership) already delivers the full transcript for a session. The buddy will call it via the new `buddy:subscribe` flow in Task B3; this task just confirms the handler is reachable from buddy windows.

**Files:**
- Read-only: `youcoded/desktop/src/main/main.ts`, `youcoded/desktop/src/main/ipc-handlers.ts`
- Modify: `youcoded/desktop/src/shared/types.ts` (no change if the constant is already there)

- [ ] **Step 1: Verify the handler exists and works window-agnostic**

```bash
grep -n 'TRANSCRIPT_REPLAY' src/main/ipc-handlers.ts src/main/main.ts src/main/transcript-watcher.ts
```

Expected: an `ipcMain.handle(IPC.TRANSCRIPT_REPLAY, …)` registration that returns the session's full transcript, regardless of caller window. If it checks ownership, that's a blocker — in that case, replace the ownership guard with a "session exists" guard.

- [ ] **Step 2: If the handler is ownership-gated, relax it**

If the replay handler rejects callers that aren't the owner, change the precondition to "session exists" (via `sessionManager.has(sessionId)` or equivalent). Buddy is a legitimate non-owner consumer.

**Note: if the existing handler is already window-agnostic, this step is a no-op. Verify then skip.**

- [ ] **Step 3: Commit if any change was made; otherwise proceed**

```bash
git add src/main/ipc-handlers.ts 2>/dev/null || true
git commit -m "refactor(buddy): allow transcript replay from non-owner windows" 2>/dev/null || true
```

(The `|| true` is intentional — skipping this commit if nothing changed is fine.)

---

## Phase B — Buddy window infrastructure

Goal: buddy windows can be created, receive the correct `BrowserWindowOptions`, load the shared bundle with a mode query param, and communicate with main via the new `buddy:*` IPC surface. After this phase the user can manually trigger `buddy:show` and a transparent mascot window appears (rendering nothing yet).

### Task B1: Extend `createAppWindow` with a buddy variant

**Files:**
- Modify: `youcoded/desktop/src/main/main.ts` (createAppWindow)

- [ ] **Step 1: Extend the `opts` type**

Change the `createAppWindow` signature to include a `buddy?: 'mascot' | 'chat'` variant:

```ts
function createAppWindow(opts?: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  maximize?: boolean;
  inactive?: boolean;
  buddy?: 'mascot' | 'chat';
}): BrowserWindow {
```

- [ ] **Step 2: Branch on the buddy variant when building `BrowserWindowOptions`**

Inside `createAppWindow`, before the `new BrowserWindow({…})` call, compute a `buddyExtras` object:

```ts
const isMac = process.platform === 'darwin';
const iconPath = path.join(__dirname, '../../assets/icon.png');
const icon = nativeImage.createFromPath(iconPath);

const buddyExtras: Electron.BrowserWindowConstructorOptions = opts?.buddy
  ? {
      transparent: true,
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      hasShadow: false,
      skipTaskbar: true,
      // Exclude from macOS Dock + Mission Control
      ...(isMac ? { type: 'panel' as const } : {}),
    }
  : {};

const buddyDimensions = opts?.buddy === 'mascot'
  ? { width: 80, height: 80 }
  : opts?.buddy === 'chat'
  ? { width: 320, height: 480 }
  : {};
```

Then merge into the `BrowserWindow` constructor:

```ts
const win = new BrowserWindow({
  ...buddyDimensions,
  width: buddyDimensions.width ?? opts?.width ?? 1200,
  height: buddyDimensions.height ?? opts?.height ?? 800,
  x: opts?.x,
  y: opts?.y,
  icon,
  titleBarStyle: opts?.buddy ? undefined : (isMac ? 'hiddenInset' as const : 'hidden' as const),
  show: !opts?.inactive && !opts?.buddy, // buddy windows are shown explicitly by manager
  ...buddyExtras,
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  },
});
```

- [ ] **Step 3: After `win.loadFile` / `win.loadURL`, append mode query param for buddy windows**

Find the existing load call:

```ts
if (!app.isPackaged) win.loadURL(DEV_SERVER_URL);
else win.loadFile(path.join(__dirname, '../renderer/index.html'));
```

Change to:

```ts
const modeQuery = opts?.buddy ? `?mode=buddy-${opts.buddy}` : '';
if (!app.isPackaged) {
  win.loadURL(`${DEV_SERVER_URL}${modeQuery}`);
} else {
  win.loadFile(path.join(__dirname, '../renderer/index.html'), {
    search: modeQuery.slice(1), // loadFile expects search without leading '?'
  });
}
```

- [ ] **Step 4: Lift `alwaysOnTop` level for buddy to `'screen-saver'`**

After `new BrowserWindow({…})`, add:

```ts
if (opts?.buddy) {
  // 'screen-saver' is the highest reliable always-on-top level; floats
  // over minimized apps on Win/Mac/Linux. Applied after construction
  // because BrowserWindowConstructorOptions only supports boolean here.
  win.setAlwaysOnTop(true, 'screen-saver');
}
```

- [ ] **Step 5: Run build to confirm no type errors**

```bash
cd /c/Users/desti/youcoded-dev/.worktrees/buddies-floater/desktop
npm run build
```

Expected: success.

- [ ] **Step 6: Commit**

```bash
git add src/main/main.ts
git commit -m "feat(buddy): add buddy variant to createAppWindow factory"
```

---

### Task B2: Add buddy IPC channel constants + preload + remote-shim stubs

**Files:**
- Modify: `youcoded/desktop/src/shared/types.ts`
- Modify: `youcoded/desktop/src/main/preload.ts`
- Modify: `youcoded/desktop/src/renderer/remote-shim.ts`

- [ ] **Step 1: Add buddy IPC constants to `shared/types.ts`**

Inside the `IPC` const object, before the closing `} as const;`, add:

```ts
  // Buddy floater (desktop-only MVP)
  BUDDY_SHOW: 'buddy:show',
  BUDDY_HIDE: 'buddy:hide',
  BUDDY_TOGGLE_CHAT: 'buddy:toggle-chat',
  BUDDY_SET_SESSION: 'buddy:set-session',
  BUDDY_SUBSCRIBE: 'buddy:subscribe',
  BUDDY_UNSUBSCRIBE: 'buddy:unsubscribe',
  BUDDY_GET_VIEWED_SESSION: 'buddy:get-viewed-session',
  SESSION_ATTENTION_SUMMARY: 'session:attention-summary',
```

Also add an `AttentionSummary` type used by the push channel. Near the other shared types in the file:

```ts
export interface AttentionSummary {
  anyNeedsAttention: boolean;
  perSession: Record<string, { attentionState: string; awaitingApproval: boolean }>;
}
```

- [ ] **Step 2: Expose `window.claude.buddy.*` in preload.ts**

Per `docs/PITFALLS.md`, preload channel names must be inlined. Add inside `contextBridge.exposeInMainWorld('claude', { … })`:

```ts
  buddy: {
    show: () => ipcRenderer.invoke('buddy:show'),
    hide: () => ipcRenderer.invoke('buddy:hide'),
    toggleChat: () => ipcRenderer.invoke('buddy:toggle-chat'),
    setSession: (sessionId: string) => ipcRenderer.invoke('buddy:set-session', sessionId),
    subscribe: (sessionId: string) => ipcRenderer.invoke('buddy:subscribe', sessionId),
    unsubscribe: (sessionId: string) => ipcRenderer.invoke('buddy:unsubscribe', sessionId),
    getViewedSession: () => ipcRenderer.invoke('buddy:get-viewed-session'),
    onAttentionSummary: (cb: (summary: unknown) => void) => {
      const listener = (_: unknown, summary: unknown) => cb(summary);
      ipcRenderer.on('session:attention-summary', listener);
      return () => ipcRenderer.removeListener('session:attention-summary', listener);
    },
  },
```

- [ ] **Step 3: Stub `window.claude.buddy.*` in remote-shim.ts**

Per the preload-parity rule, `remote-shim.ts` must expose the same shape. Add inside the shim's `window.claude = { … }` object:

```ts
  buddy: {
    show: () => { throw new Error('Buddy is desktop-only in this version'); },
    hide: () => { throw new Error('Buddy is desktop-only in this version'); },
    toggleChat: () => { throw new Error('Buddy is desktop-only in this version'); },
    setSession: () => { throw new Error('Buddy is desktop-only in this version'); },
    subscribe: () => { throw new Error('Buddy is desktop-only in this version'); },
    unsubscribe: () => { throw new Error('Buddy is desktop-only in this version'); },
    getViewedSession: () => { throw new Error('Buddy is desktop-only in this version'); },
    onAttentionSummary: () => () => { /* no-op unsubscribe */ },
  },
```

- [ ] **Step 4: Add a TypeScript interface for `window.claude.buddy` so callers get types**

In `shared/types.ts`, add (or extend the existing) global `Window` augmentation:

```ts
export interface BuddyApi {
  show(): Promise<void>;
  hide(): Promise<void>;
  toggleChat(): Promise<void>;
  setSession(sessionId: string): Promise<void>;
  subscribe(sessionId: string): Promise<void>;
  unsubscribe(sessionId: string): Promise<void>;
  getViewedSession(): Promise<string | null>;
  onAttentionSummary(cb: (summary: AttentionSummary) => void): () => void;
}
```

If there's an existing `ClaudeApi` / `window.claude` type alias, add `buddy: BuddyApi` to it.

- [ ] **Step 5: Build to verify**

```bash
npm run build
```

Expected: success (type check passes).

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/preload.ts src/renderer/remote-shim.ts
git commit -m "feat(buddy): add buddy IPC constants, preload API, and remote-shim stubs"
```

---

### Task B3: Create `BuddyWindowManager` in main process

**Files:**
- Create: `youcoded/desktop/src/main/buddy-window-manager.ts`
- Modify: `youcoded/desktop/src/main/main.ts` (instantiate + wire IPC)
- Test: `youcoded/desktop/tests/buddy-edge-clamp.test.ts`

- [ ] **Step 1: Write failing test for edge-boundary clamping (pure function)**

Create `youcoded/desktop/tests/buddy-edge-clamp.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { clampToWorkArea } from '../src/main/buddy-window-manager';

describe('clampToWorkArea', () => {
  const wa = { x: 0, y: 0, width: 1920, height: 1080 };

  it('returns input position when fully inside', () => {
    expect(clampToWorkArea({ x: 100, y: 100 }, { width: 80, height: 80 }, wa))
      .toEqual({ x: 100, y: 100 });
  });

  it('clamps right edge when x + width > workArea right', () => {
    expect(clampToWorkArea({ x: 1900, y: 100 }, { width: 80, height: 80 }, wa))
      .toEqual({ x: 1840, y: 100 });
  });

  it('clamps bottom edge when y + height > workArea bottom', () => {
    expect(clampToWorkArea({ x: 100, y: 1060 }, { width: 80, height: 80 }, wa))
      .toEqual({ x: 100, y: 1000 });
  });

  it('clamps negative x/y to work area origin', () => {
    expect(clampToWorkArea({ x: -50, y: -50 }, { width: 80, height: 80 }, wa))
      .toEqual({ x: 0, y: 0 });
  });

  it('handles non-zero workArea origin (secondary monitor)', () => {
    const wa2 = { x: 1920, y: 0, width: 1920, height: 1080 };
    expect(clampToWorkArea({ x: 1900, y: 100 }, { width: 80, height: 80 }, wa2))
      .toEqual({ x: 1920, y: 100 });
  });
});
```

- [ ] **Step 2: Run test; expect failure (module doesn't exist yet)**

```bash
npm test -- --run buddy-edge-clamp
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Create `buddy-window-manager.ts` with the pure helper first**

Create `youcoded/desktop/src/main/buddy-window-manager.ts`:

```ts
import { BrowserWindow, screen, ipcMain } from 'electron';
import { IPC, type AttentionSummary } from '../shared/types';
import type { WindowRegistry } from './window-registry';

export interface Rect { x: number; y: number; width: number; height: number; }
export interface Point { x: number; y: number; }
export interface Size { width: number; height: number; }

/**
 * Clamp a position so the window stays fully inside the workArea.
 * Pure function — no electron deps — so it's unit-testable.
 */
export function clampToWorkArea(pos: Point, size: Size, workArea: Rect): Point {
  const maxX = workArea.x + workArea.width - size.width;
  const maxY = workArea.y + workArea.height - size.height;
  return {
    x: Math.max(workArea.x, Math.min(pos.x, maxX)),
    y: Math.max(workArea.y, Math.min(pos.y, maxY)),
  };
}

const MASCOT_SIZE: Size = { width: 80, height: 80 };
const CHAT_SIZE: Size = { width: 320, height: 480 };

export interface BuddyWindowManagerDeps {
  createBuddyWindow(variant: 'mascot' | 'chat', opts: { x: number; y: number }): BrowserWindow;
  getPersistedPosition(key: 'mascot' | 'chat'): Point | null;
  setPersistedPosition(key: 'mascot' | 'chat', pos: Point): void;
  registry: WindowRegistry;
  mainWindow: () => BrowserWindow | null;
}

export class BuddyWindowManager {
  private mascot: BrowserWindow | null = null;
  private chat: BrowserWindow | null = null;
  private viewedSessionId: string | null = null;

  constructor(private readonly deps: BuddyWindowManagerDeps) {}

  show(): void {
    if (this.mascot && !this.mascot.isDestroyed()) {
      this.mascot.showInactive();
      return;
    }
    const saved = this.deps.getPersistedPosition('mascot');
    const primary = screen.getPrimaryDisplay().workArea;
    const defaultPos = { x: primary.x + primary.width - 104, y: primary.y + primary.height - 104 };
    const raw = saved ?? defaultPos;
    const display = screen.getDisplayMatching({ ...raw, ...MASCOT_SIZE }) ?? screen.getPrimaryDisplay();
    const clamped = clampToWorkArea(raw, MASCOT_SIZE, display.workArea);
    this.mascot = this.deps.createBuddyWindow('mascot', clamped);
    this.wireMascotLifecycle(this.mascot);
    this.mascot.showInactive();
  }

  hide(): void {
    if (this.chat && !this.chat.isDestroyed()) this.chat.destroy();
    if (this.mascot && !this.mascot.isDestroyed()) this.mascot.destroy();
    this.chat = null;
    this.mascot = null;
  }

  toggleChat(): void {
    if (!this.chat || this.chat.isDestroyed()) {
      this.createChat();
      return;
    }
    if (this.chat.isVisible()) this.chat.hide();
    else this.chat.show();
  }

  setViewedSession(sessionId: string): void {
    const prev = this.viewedSessionId;
    if (prev === sessionId) return;
    if (this.chat && !this.chat.isDestroyed()) {
      const wcId = this.chat.webContents.id;
      if (prev) this.deps.registry.unsubscribe(prev, wcId);
      this.deps.registry.subscribe(sessionId, wcId);
    }
    this.viewedSessionId = sessionId;
  }

  getViewedSession(): string | null {
    return this.viewedSessionId;
  }

  private createChat(): void {
    const saved = this.deps.getPersistedPosition('chat');
    let raw: Point;
    if (saved) {
      raw = saved;
    } else if (this.mascot && !this.mascot.isDestroyed()) {
      const mb = this.mascot.getBounds();
      raw = { x: mb.x + 92, y: mb.y - 200 };
    } else {
      const primary = screen.getPrimaryDisplay().workArea;
      raw = { x: primary.x + primary.width - 344, y: primary.y + primary.height - 580 };
    }
    const display = screen.getDisplayMatching({ ...raw, ...CHAT_SIZE }) ?? screen.getPrimaryDisplay();
    const clamped = clampToWorkArea(raw, CHAT_SIZE, display.workArea);
    this.chat = this.deps.createBuddyWindow('chat', clamped);
    this.wireChatLifecycle(this.chat);
    this.chat.show();
    this.chat.focus();
  }

  private wireMascotLifecycle(win: BrowserWindow): void {
    const save = debounce(() => {
      if (win.isDestroyed()) return;
      const { x, y } = win.getBounds();
      this.deps.setPersistedPosition('mascot', { x, y });
    }, 300);
    win.on('move', save);
    win.webContents.on('render-process-gone', () => this.hide());
  }

  private wireChatLifecycle(win: BrowserWindow): void {
    const save = debounce(() => {
      if (win.isDestroyed()) return;
      const { x, y } = win.getBounds();
      this.deps.setPersistedPosition('chat', { x, y });
    }, 300);
    win.on('move', save);
    win.webContents.on('render-process-gone', () => this.hide());
    win.on('closed', () => { this.chat = null; });
  }
}

function debounce<T extends (...a: any[]) => void>(fn: T, ms: number): T {
  let t: NodeJS.Timeout | null = null;
  return ((...args: any[]) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  }) as T;
}
```

- [ ] **Step 4: Run the test to confirm pure helper passes**

```bash
npm test -- --run buddy-edge-clamp
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Wire the manager into `main.ts` and register IPC handlers**

In `main.ts`, after `WindowRegistry` instantiation and `createWindow`, add:

```ts
import { BuddyWindowManager } from './buddy-window-manager';
import { safeStorage } from 'electron'; // optional — we'll use in-memory + store below

// Main-process persistence — uses a JSON file in userData to avoid renderer
// localStorage round-trips. Keys: 'mascot', 'chat'.
const BUDDY_POS_FILE = path.join(app.getPath('userData'), 'buddy-positions.json');
function loadBuddyPositions(): Record<string, { x: number; y: number } | undefined> {
  try { return JSON.parse(fs.readFileSync(BUDDY_POS_FILE, 'utf8')); } catch { return {}; }
}
function saveBuddyPositions(obj: Record<string, { x: number; y: number } | undefined>): void {
  try { fs.writeFileSync(BUDDY_POS_FILE, JSON.stringify(obj)); } catch {}
}
const buddyPositions = loadBuddyPositions();

const buddyManager = new BuddyWindowManager({
  createBuddyWindow: (variant, { x, y }) => createAppWindow({ x, y, buddy: variant }),
  getPersistedPosition: (key) => buddyPositions[key] ?? null,
  setPersistedPosition: (key, pos) => {
    buddyPositions[key] = pos;
    saveBuddyPositions(buddyPositions);
  },
  registry: windowRegistry,
  mainWindow: () => mainWindow,
});

ipcMain.handle(IPC.BUDDY_SHOW, () => buddyManager.show());
ipcMain.handle(IPC.BUDDY_HIDE, () => buddyManager.hide());
ipcMain.handle(IPC.BUDDY_TOGGLE_CHAT, () => buddyManager.toggleChat());
ipcMain.handle(IPC.BUDDY_SET_SESSION, (_evt, sessionId: string) => {
  buddyManager.setViewedSession(sessionId);
});
ipcMain.handle(IPC.BUDDY_SUBSCRIBE, (evt, sessionId: string) => {
  windowRegistry.subscribe(sessionId, evt.sender.id);
  // Trigger a replay so the buddy reducer catches up with recent history.
  // The existing TRANSCRIPT_REPLAY handler will stream events back via the
  // normal TRANSCRIPT_EVENT channel — we just need the subscription in
  // place before the events start arriving.
  evt.sender.send(IPC.TRANSCRIPT_REPLAY_START, { sessionId });
});
ipcMain.handle(IPC.BUDDY_UNSUBSCRIBE, (evt, sessionId: string) => {
  windowRegistry.unsubscribe(sessionId, evt.sender.id);
});
ipcMain.handle(IPC.BUDDY_GET_VIEWED_SESSION, () => buddyManager.getViewedSession());
```

**Note:** if `TRANSCRIPT_REPLAY_START` doesn't exist as an IPC constant, either reuse `TRANSCRIPT_REPLAY` (invoke-style) or omit this line — the buddy renderer can call `window.claude.session.replayTranscript(sessionId)` itself after subscribing. Pick the existing-pattern option that's consistent with current renderer code.

- [ ] **Step 6: Build to verify**

```bash
npm run build
```

Expected: success.

- [ ] **Step 7: Commit**

```bash
git add src/main/buddy-window-manager.ts src/main/main.ts tests/buddy-edge-clamp.test.ts
git commit -m "feat(buddy): add BuddyWindowManager with edge-clamped positioning"
```

---

## Phase C — Attention summary push

Goal: main process emits a `session:attention-summary` push whenever any session's attention state changes. The buddy mascot subscribes and reacts.

### Task C1: Emit `session:attention-summary` from main

**Files:**
- Modify: `youcoded/desktop/src/main/ipc-handlers.ts` (or wherever attention changes originate)
- Modify: `youcoded/desktop/src/main/main.ts` if attention fires there

- [ ] **Step 1: Locate where per-session `attentionState` changes are observed server-side**

```bash
grep -rn 'attentionState\|attention-state\|ATTENTION_STATE' src/main
```

Expected: none — attention classification currently runs in the renderer (per `docs/chat-reducer.md`). The main process only sees transcript events and `HOOK_EVENT` (permission requests).

**Implication:** the attention summary must be computed from signals main already has, or the renderer must post its derived state back. Simplest path: **each window posts its attention summary to main when its reducer updates**, and main fans out.

- [ ] **Step 2: Add `ATTENTION_REPORT` IPC channel for window → main reports**

In `shared/types.ts` add:

```ts
  // Buddy support — each window reports its per-session attentionState to
  // main, which aggregates into a global summary pushed back to buddy windows.
  ATTENTION_REPORT: 'attention:report',
```

- [ ] **Step 3: Add aggregation + fan-out in main.ts**

Add near the buddy IPC handlers:

```ts
// Per-window attention reports keyed by sessionId. Main unions them to
// produce the global summary the buddy mascot subscribes to. Window
// webContents.id → (sessionId → {attentionState, awaitingApproval}).
const attentionReports = new Map<number, Map<string, { attentionState: string; awaitingApproval: boolean }>>();

function recomputeAndBroadcastAttention(): void {
  const perSession: Record<string, { attentionState: string; awaitingApproval: boolean }> = {};
  let anyNeedsAttention = false;
  for (const byWin of attentionReports.values()) {
    for (const [sid, state] of byWin) {
      perSession[sid] = state;
      if (state.awaitingApproval || (state.attentionState !== 'ok' && state.attentionState !== 'session-died')) {
        anyNeedsAttention = true;
      }
    }
  }
  const summary = { anyNeedsAttention, perSession };
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.SESSION_ATTENTION_SUMMARY, summary);
  }
}

const debouncedBroadcast = (() => {
  let t: NodeJS.Timeout | null = null;
  return () => {
    if (t) clearTimeout(t);
    t = setTimeout(recomputeAndBroadcastAttention, 100);
  };
})();

ipcMain.on(IPC.ATTENTION_REPORT, (evt, payload: { sessionId: string; attentionState: string; awaitingApproval: boolean } | { sessionId: string; clear: true }) => {
  let byWin = attentionReports.get(evt.sender.id);
  if (!byWin) { byWin = new Map(); attentionReports.set(evt.sender.id, byWin); }
  if ('clear' in payload) byWin.delete(payload.sessionId);
  else byWin.set(payload.sessionId, { attentionState: payload.attentionState, awaitingApproval: payload.awaitingApproval });
  debouncedBroadcast();
});
```

Also clear a window's reports on destroy:

```ts
win.webContents.on('destroyed', () => {
  attentionReports.delete(win.webContents.id);
  debouncedBroadcast();
  windowRegistry.unregisterWindow(win.webContents.id);
});
```

(Merge with the existing `destroyed` handler if one already exists.)

- [ ] **Step 4: Expose `ATTENTION_REPORT` in preload**

Add to the `window.claude` exposure:

```ts
  attention: {
    report: (payload: unknown) => ipcRenderer.send('attention:report', payload),
  },
```

Same signature stubbed in `remote-shim.ts` as a no-op (remote clients don't contribute to buddy attention — buddy is desktop-only).

- [ ] **Step 5: Main-window renderer pushes its attention state on reducer updates**

In the renderer state layer (locate where `ATTENTION_STATE_CHANGED` is dispatched), add a side-effect that calls:

```ts
window.claude.attention.report({
  sessionId,
  attentionState,
  awaitingApproval: toolCalls && [...toolCalls.values()].some(t => t.status === 'awaiting-approval' && activeTurnToolIds.has(t.id)),
});
```

When a session is removed, report clear:

```ts
window.claude.attention.report({ sessionId, clear: true });
```

**Note:** the cleanest place for this is likely a `useEffect` in the component that owns the chat reducer. Avoid spamming — only fire on state changes, not every render.

- [ ] **Step 6: Build and test**

```bash
npm run build
npm test -- --run
```

Expected: build passes; existing tests still pass (this phase added pure additive plumbing).

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/main/main.ts src/main/preload.ts src/renderer/remote-shim.ts src/renderer/**/*.tsx src/renderer/**/*.ts
git commit -m "feat(buddy): aggregate attention summary across windows"
```

---

### Task C2: `useAnyAttentionNeeded` hook

**Files:**
- Create: `youcoded/desktop/src/renderer/hooks/useAnyAttentionNeeded.ts`
- Test: `youcoded/desktop/tests/use-any-attention-needed.test.ts`

- [ ] **Step 1: Write failing test**

Create `youcoded/desktop/tests/use-any-attention-needed.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnyAttentionNeeded } from '../src/renderer/hooks/useAnyAttentionNeeded';
import type { AttentionSummary } from '../src/shared/types';

describe('useAnyAttentionNeeded', () => {
  it('returns false initially', () => {
    mockClaudeBuddy([]);
    const { result } = renderHook(() => useAnyAttentionNeeded());
    expect(result.current).toBe(false);
  });

  it('returns true when summary says anyNeedsAttention', () => {
    const emit = mockClaudeBuddy([]);
    const { result } = renderHook(() => useAnyAttentionNeeded());
    act(() => {
      emit({ anyNeedsAttention: true, perSession: { 's1': { attentionState: 'awaiting-input', awaitingApproval: false } } } satisfies AttentionSummary);
    });
    expect(result.current).toBe(true);
  });

  it('returns false after clearing', () => {
    const emit = mockClaudeBuddy([]);
    const { result } = renderHook(() => useAnyAttentionNeeded());
    act(() => {
      emit({ anyNeedsAttention: true, perSession: {} });
      emit({ anyNeedsAttention: false, perSession: {} });
    });
    expect(result.current).toBe(false);
  });
});

// Helper: mount a stub for window.claude.buddy.onAttentionSummary that
// returns an emit function the test uses to push summaries.
function mockClaudeBuddy(initial: AttentionSummary[]): (s: AttentionSummary) => void {
  let cb: ((s: AttentionSummary) => void) | null = null;
  (window as any).claude = {
    buddy: {
      onAttentionSummary: (c: (s: AttentionSummary) => void) => { cb = c; return () => { cb = null; }; },
    },
  };
  for (const s of initial) cb?.(s);
  return (s) => cb?.(s);
}
```

- [ ] **Step 2: Run test; confirm it fails**

```bash
npm test -- --run use-any-attention-needed
```

Expected: FAIL on module-not-found.

- [ ] **Step 3: Implement the hook**

Create `youcoded/desktop/src/renderer/hooks/useAnyAttentionNeeded.ts`:

```ts
import { useEffect, useState } from 'react';
import type { AttentionSummary } from '../../shared/types';

/**
 * Subscribes to the main process's aggregated session attention summary.
 * Returns true iff ANY running session currently needs the user's attention
 * (awaiting-input, awaiting-approval, stuck, shell-idle, error).
 *
 * Source: window.claude.buddy.onAttentionSummary push channel.
 */
export function useAnyAttentionNeeded(): boolean {
  const [needs, setNeeds] = useState(false);
  useEffect(() => {
    const unsub = window.claude.buddy.onAttentionSummary((summary: AttentionSummary) => {
      setNeeds(summary.anyNeedsAttention);
    });
    return unsub;
  }, []);
  return needs;
}
```

- [ ] **Step 4: Run test; confirm it passes**

```bash
npm test -- --run use-any-attention-needed
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/hooks/useAnyAttentionNeeded.ts tests/use-any-attention-needed.test.ts
git commit -m "feat(buddy): add useAnyAttentionNeeded hook"
```

---

## Phase D — Mascot window

Goal: opening the buddy from settings spawns a transparent mascot window that renders the theme's mascot, reacts to attention, and toggles the chat window on click.

### Task D1: App mode routing

**Files:**
- Modify: `youcoded/desktop/src/renderer/App.tsx`
- Create: `youcoded/desktop/src/renderer/components/buddy/BuddyMascotApp.tsx` (placeholder)
- Create: `youcoded/desktop/src/renderer/components/buddy/BuddyChatApp.tsx` (placeholder)

- [ ] **Step 1: Add mode detection at the top of `App.tsx`**

Near the top of `App.tsx`, before any provider setup, add:

```tsx
import { BuddyMascotApp } from './components/buddy/BuddyMascotApp';
import { BuddyChatApp } from './components/buddy/BuddyChatApp';

const buddyMode = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('mode');
```

In the component's return (earliest branch):

```tsx
if (buddyMode === 'buddy-mascot') return <BuddyMascotApp />;
if (buddyMode === 'buddy-chat') return <BuddyChatApp />;
// ...existing main app render
```

- [ ] **Step 2: Create placeholder BuddyMascotApp and BuddyChatApp**

`youcoded/desktop/src/renderer/components/buddy/BuddyMascotApp.tsx`:

```tsx
import { useEffect } from 'react';

export function BuddyMascotApp() {
  useEffect(() => { document.body.setAttribute('data-mode', 'buddy-mascot'); }, []);
  return (
    <div style={{ width: 80, height: 80, background: 'transparent' }}>
      <span style={{ color: '#fff' }}>🐱 buddy</span>
    </div>
  );
}
```

`youcoded/desktop/src/renderer/components/buddy/BuddyChatApp.tsx`:

```tsx
import { useEffect } from 'react';

export function BuddyChatApp() {
  useEffect(() => { document.body.setAttribute('data-mode', 'buddy-chat'); }, []);
  return (
    <div style={{ width: 320, height: 480, background: 'transparent', color: '#fff' }}>
      buddy chat placeholder
    </div>
  );
}
```

- [ ] **Step 3: Build and dev-test**

```bash
npm run build
```

- [ ] **Step 4: Manual sanity check (optional but recommended)**

Start the dev loop via `scripts/run-dev.sh` (or directly `npm run dev`), open DevTools, run in console:

```js
window.claude.buddy.show();
```

Expected: a small transparent window appears somewhere on the primary display with 🐱 emoji. Click the mascot placeholder — nothing happens yet (wiring is in D2).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/App.tsx src/renderer/components/buddy/BuddyMascotApp.tsx src/renderer/components/buddy/BuddyChatApp.tsx
git commit -m "feat(buddy): add mode routing for buddy windows"
```

---

### Task D2: Real `<BuddyMascot>` component

**Files:**
- Create: `youcoded/desktop/src/renderer/components/buddy/BuddyMascot.tsx`
- Modify: `youcoded/desktop/src/renderer/components/buddy/BuddyMascotApp.tsx`

- [ ] **Step 1: Implement `<BuddyMascot>`**

Create `youcoded/desktop/src/renderer/components/buddy/BuddyMascot.tsx`:

```tsx
import { useCallback, useRef } from 'react';
import { useThemeMascot } from '../../hooks/useThemeMascot';
import { useAnyAttentionNeeded } from '../../hooks/useAnyAttentionNeeded';

const DRAG_THRESHOLD_PX = 4;

export function BuddyMascot() {
  const attention = useAnyAttentionNeeded();
  const variant = attention ? 'shocked' : 'idle';
  const customMascot = useThemeMascot(variant);

  // Track pointer travel so drag doesn't register as click.
  const downRef = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    downRef.current = { x: e.screenX, y: e.screenY };
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const down = downRef.current;
    downRef.current = null;
    if (!down) return;
    const dx = Math.abs(e.screenX - down.x);
    const dy = Math.abs(e.screenY - down.y);
    if (dx + dy <= DRAG_THRESHOLD_PX) {
      window.claude.buddy.toggleChat();
    }
  }, []);

  return (
    <div
      style={{
        width: 80,
        height: 80,
        // OS-level drag handle — lets user reposition the transparent window
        // by dragging the mascot itself.
        WebkitAppRegion: 'drag' as any,
        cursor: 'grab',
        background: 'transparent',
      }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      {customMascot ? (
        <img src={customMascot} alt="" style={{ width: '100%', height: '100%', pointerEvents: 'none' }} />
      ) : (
        // Fallback: reuse the default chibi mascot component (<ThemeMascot>
        // renders the theme asset when available, and falls back to the
        // default chibi mascot PNG bundled with the app).
        <DefaultMascot variant={variant} />
      )}
    </div>
  );
}

// Fallback when the active theme has no mascot override for the current
// variant. Kept deliberately minimal — the real default chibi mascot that
// ships with the app is expected to be an <img> asset reachable via a
// default theme's mascot map; use that directly once verified. See the
// self-review note at the end of this plan (Task D2).
function DefaultMascot({ variant }: { variant: 'idle' | 'shocked' }) {
  return <div style={{ width: '100%', height: '100%', fontSize: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{variant === 'shocked' ? '😲' : '🐱'}</div>;
}
```

**Note to implementer:** at plan time I verified `useThemeMascot` exists (`src/renderer/hooks/useThemeMascot.ts`) but did not confirm whether a `<ThemeMascot>` component also exists. First thing to do: search for `<ThemeMascot` across the renderer; if it exists, import it and render it in place of the inline `<DefaultMascot>` fallback. If it doesn't, the inline fallback is acceptable — the hook already gives a custom theme asset path.

- [ ] **Step 2: Update `BuddyMascotApp` to render `<BuddyMascot>`**

```tsx
import { useEffect } from 'react';
import { BuddyMascot } from './BuddyMascot';

export function BuddyMascotApp() {
  useEffect(() => { document.body.setAttribute('data-mode', 'buddy-mascot'); }, []);
  return <BuddyMascot />;
}
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

- [ ] **Step 4: Manual test**

Run dev loop, trigger `window.claude.buddy.show()` from DevTools. Expected: mascot renders; clicking toggles the chat window; dragging moves the mascot.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/buddy/BuddyMascot.tsx src/renderer/components/buddy/BuddyMascotApp.tsx
git commit -m "feat(buddy): render mascot with theme variant + attention reactivity"
```

---

### Task D3: Settings toggle

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/SettingsPanel.tsx`
- Modify: `youcoded/desktop/src/main/main.ts` (auto-show on startup if flag set)

- [ ] **Step 1: Add the toggle to `SettingsPanel.tsx`**

Find the Appearance section in `SettingsPanel.tsx`. Add a checkbox row below the existing theme/font controls:

```tsx
const [buddyEnabled, setBuddyEnabled] = useState<boolean>(() => {
  return localStorage.getItem('youcoded-buddy-enabled') === '1';
});

const toggleBuddy = useCallback(() => {
  const next = !buddyEnabled;
  setBuddyEnabled(next);
  localStorage.setItem('youcoded-buddy-enabled', next ? '1' : '0');
  if (next) window.claude.buddy.show();
  else window.claude.buddy.hide();
}, [buddyEnabled]);

// in JSX, add to Appearance section:
<label className="flex items-center gap-2">
  <input type="checkbox" checked={buddyEnabled} onChange={toggleBuddy} />
  <span>Show buddy floater</span>
</label>
```

- [ ] **Step 2: Auto-enable on main-window ready if flag is set**

The `localStorage` read in step 1 is inside the settings panel — main process needs its own signal. Two options:

**Option A (recommended):** have the main-window renderer call `window.claude.buddy.show()` once on mount if `localStorage` says enabled. Add to `App.tsx` (only in the non-buddy branch):

```tsx
useEffect(() => {
  if (buddyMode) return;
  if (localStorage.getItem('youcoded-buddy-enabled') === '1') {
    window.claude.buddy.show();
  }
}, []);
```

(This runs exactly once per main-window load. Buddy windows won't hit this branch because of the `if (buddyMode) return;` early out.)

- [ ] **Step 3: Build and manual test**

```bash
npm run build
npm run dev
```

Toggle the setting off and on. Expected: mascot appears/disappears. Restart the app; expected: state persists — if last state was "on," mascot auto-appears on launch.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/SettingsPanel.tsx src/renderer/App.tsx
git commit -m "feat(buddy): settings toggle with persistent enable state"
```

---

## Phase E — Chat window

Goal: clicking the mascot opens a compact chat window that can view/switch any running session, send input, approve permissions, and show attention state.

### Task E1: `BuddyChat` shell + CSS scope

**Files:**
- Create: `youcoded/desktop/src/renderer/components/buddy/BuddyChat.tsx`
- Create: `youcoded/desktop/src/renderer/styles/buddy.css`
- Modify: `youcoded/desktop/src/renderer/styles/globals.css` (import buddy.css)
- Modify: `youcoded/desktop/src/renderer/components/buddy/BuddyChatApp.tsx`

- [ ] **Step 1: Create `buddy.css` with scope overrides**

Create `youcoded/desktop/src/renderer/styles/buddy.css`:

```css
/* Buddy-specific CSS scopes. Loaded globally but only apply when
   body[data-mode="buddy-chat"] or buddy-mascot is active. */

body[data-mode="buddy-chat"],
body[data-mode="buddy-mascot"] {
  background: transparent !important;
  --canvas: transparent;
}

body[data-mode="buddy-chat"] {
  font-size: 13px;
  overflow: hidden;
}

/* Compact bubbles inside buddy chat */
body[data-mode="buddy-chat"] .user-bubble,
body[data-mode="buddy-chat"] .assistant-bubble {
  padding: 9px 13px;
  font-size: 13px;
  line-height: 1.5;
}

/* Strip tables / headings / blockquotes in buddy markdown */
body[data-mode="buddy-chat"] .prose h1,
body[data-mode="buddy-chat"] .prose h2,
body[data-mode="buddy-chat"] .prose h3,
body[data-mode="buddy-chat"] .prose h4 {
  font-size: inherit;
  font-weight: 700;
  margin: 0;
}
body[data-mode="buddy-chat"] .prose table { display: none; }
body[data-mode="buddy-chat"] .prose blockquote {
  font-style: italic;
  border: none;
  padding: 0;
  margin: 0;
}

/* Thin scrollbar in buddy chat */
body[data-mode="buddy-chat"] ::-webkit-scrollbar { width: 4px; }
body[data-mode="buddy-chat"] ::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
}
```

- [ ] **Step 2: Import buddy.css from globals.css**

In `globals.css`, add (wherever other imports live, near the top):

```css
@import './buddy.css';
```

- [ ] **Step 3: Real `<BuddyChat>` shell**

Create `youcoded/desktop/src/renderer/components/buddy/BuddyChat.tsx`:

```tsx
import { useEffect, useState } from 'react';

export function BuddyChat() {
  const [viewedSession, setViewedSession] = useState<string | null>(null);

  useEffect(() => {
    window.claude.buddy.getViewedSession().then((sid) => {
      setViewedSession(sid);
      if (sid) window.claude.buddy.subscribe(sid);
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') window.claude.buddy.toggleChat();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: '12px 10px', gap: 10 }}>
      {/* Top: session pill */}
      <SessionPillPlaceholder sessionId={viewedSession} />
      {/* Middle: bubble feed */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <BubbleFeedPlaceholder sessionId={viewedSession} />
      </div>
      {/* Bottom: input */}
      <InputBarPlaceholder sessionId={viewedSession} />
      {/* Attention strip */}
      <AttentionStripPlaceholder sessionId={viewedSession} />
    </div>
  );
}

// Placeholders to be filled in by Tasks E2–E5.
function SessionPillPlaceholder({ sessionId }: { sessionId: string | null }) {
  return <div className="layer-surface" style={{ padding: '7px 14px', alignSelf: 'center', borderRadius: 999, fontSize: 12 }}>{sessionId ?? 'no session'}</div>;
}
function BubbleFeedPlaceholder({ sessionId }: { sessionId: string | null }) {
  return <div style={{ color: 'var(--fg)' }}>bubble feed for {sessionId}</div>;
}
function InputBarPlaceholder({ sessionId }: { sessionId: string | null }) {
  return <div className="layer-surface" style={{ padding: 8, borderRadius: 14 }}>input {sessionId}</div>;
}
function AttentionStripPlaceholder({ sessionId }: { sessionId: string | null }) {
  return null;
}
```

- [ ] **Step 4: Wire `<BuddyChat>` into `<BuddyChatApp>`**

```tsx
import { useEffect } from 'react';
import { ThemeProvider } from '../../state/theme-context'; // path may vary — verify
import { BuddyChat } from './BuddyChat';

export function BuddyChatApp() {
  useEffect(() => { document.body.setAttribute('data-mode', 'buddy-chat'); }, []);
  return (
    <ThemeProvider>
      <BuddyChat />
    </ThemeProvider>
  );
}
```

Verify the `ThemeProvider` import path by searching:

```bash
grep -rn 'export.*ThemeProvider' src/renderer
```

- [ ] **Step 5: Build and manual test**

```bash
npm run build
npm run dev
```

Toggle buddy on, click the mascot. Expected: transparent 320×480 chat window opens with placeholder content and a themed session pill.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/buddy/BuddyChat.tsx src/renderer/components/buddy/BuddyChatApp.tsx src/renderer/styles/buddy.css src/renderer/styles/globals.css
git commit -m "feat(buddy): chat window shell + CSS scope"
```

---

### Task E2: SessionPill + dropdown switcher

**Files:**
- Create: `youcoded/desktop/src/renderer/components/buddy/SessionPill.tsx`
- Modify: `youcoded/desktop/src/renderer/components/buddy/BuddyChat.tsx` (use real pill)

- [ ] **Step 1: Implement `<SessionPill>`**

Create `youcoded/desktop/src/renderer/components/buddy/SessionPill.tsx`:

```tsx
import { useEffect, useState, useCallback } from 'react';

interface RunningSession {
  id: string;
  cwd: string;
  branch?: string;
  attentionState?: string;
  awaitingApproval?: boolean;
}

interface Props {
  viewedSessionId: string | null;
  onChange: (sessionId: string) => void;
}

export function SessionPill({ viewedSessionId, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<RunningSession[]>([]);
  const viewed = sessions.find((s) => s.id === viewedSessionId) ?? null;

  useEffect(() => {
    // Load running sessions from the existing window:get-directory IPC.
    // The payload shape is { windows: [{ window, sessions }] }; flatten to
    // a unique list and project to RunningSession.
    const load = async () => {
      const dir = await window.claude.session.getDirectory?.(); // verify helper name
      if (!dir) return;
      const all: RunningSession[] = [];
      for (const wd of dir.windows) {
        for (const s of wd.sessions) {
          all.push({
            id: s.id,
            cwd: s.cwd,
            branch: s.branch,
            attentionState: s.attentionState,
            awaitingApproval: s.awaitingApproval,
          });
        }
      }
      setSessions(all);
    };
    load();
    const unsub = window.claude.session.onDirectoryUpdated?.(load); // verify helper name
    return unsub;
  }, []);

  const selectSession = useCallback(async (sid: string) => {
    await window.claude.buddy.setSession(sid);
    await window.claude.buddy.subscribe(sid);
    onChange(sid);
    setOpen(false);
  }, [onChange]);

  const createSession = useCallback(async () => {
    // Reuses existing session:create IPC. The new session appears in main's
    // strip; wait for the directory push, then select it.
    const newId = await window.claude.session.create?.({ cwd: undefined, model: undefined, dangerous: false });
    if (newId) selectSession(newId);
  }, [selectSession]);

  const label = viewed ? `${basename(viewed.cwd)}${viewed.branch ? ` · ${viewed.branch}` : ''}` : 'no session';
  const dotColor = viewed ? attentionColor(viewed) : '#888';

  return (
    <div style={{ position: 'relative', alignSelf: 'center' }}>
      <button
        className="layer-surface"
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 999, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none' }}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor }} />
        <span>{label}</span>
        <span style={{ opacity: 0.5, fontSize: 10 }}>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div
          className="layer-surface"
          style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 6, width: 240, padding: 6, borderRadius: 16, zIndex: 100 }}
        >
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => selectSession(s.id)}
              style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, padding: '6px 10px', fontSize: 12, background: s.id === viewedSessionId ? 'rgba(255,255,255,0.06)' : 'transparent', border: 'none', borderRadius: 10, cursor: 'pointer', color: 'inherit' }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: attentionColor(s) }} />
              <span style={{ flex: 1, textAlign: 'left' }}>{basename(s.cwd)}{s.branch ? ` · ${s.branch}` : ''}</span>
              {(s.awaitingApproval || (s.attentionState && s.attentionState !== 'ok')) && (
                <span style={{ fontSize: 10, opacity: 0.7 }}>● {s.awaitingApproval ? 'awaiting' : s.attentionState}</span>
              )}
            </button>
          ))}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
          <button
            onClick={createSession}
            style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, padding: '6px 10px', fontSize: 12, background: 'transparent', border: 'none', borderRadius: 10, cursor: 'pointer', color: 'inherit' }}
          >
            <span style={{ width: 12, textAlign: 'center' }}>+</span>
            <span>New session…</span>
          </button>
        </div>
      )}
    </div>
  );
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

function attentionColor(s: RunningSession): string {
  if (s.awaitingApproval) return '#f5a623';
  switch (s.attentionState) {
    case 'error':
    case 'stuck': return '#ef4444';
    case 'awaiting-input': return '#f5a623';
    case 'shell-idle': return '#60a5fa';
    case 'session-died': return '#6b7280';
    default: return '#9575ff';
  }
}
```

**Note:** the helper names `window.claude.session.getDirectory()`, `onDirectoryUpdated(…)`, `create(…)` are placeholders — the implementer MUST verify exact names in `preload.ts` and `remote-shim.ts` and adjust. If the existing API is `window.claude.window.getDirectory()` or `window.claude.sessions.list()`, match that.

- [ ] **Step 2: Swap `BuddyChat` to use the real pill**

Replace `<SessionPillPlaceholder>` with `<SessionPill viewedSessionId={viewedSession} onChange={setViewedSession} />`.

- [ ] **Step 3: First-open default = main's active session**

In `BuddyChat.tsx`, when `viewedSession` is null after mount (meaning no persisted selection), ask main for its active session and set it. Extend the existing mount effect:

```tsx
useEffect(() => {
  (async () => {
    let sid = await window.claude.buddy.getViewedSession();
    if (!sid) {
      // Fallback: main's currently-active session. The `window:get-directory`
      // response already marks the active session per-window; find main's.
      const dir = await window.claude.session.getDirectory?.();
      const mainWin = dir?.windows?.find((w: any) => w.window.label === 'window 1');
      sid = mainWin?.sessions?.find((s: any) => s.active)?.id ?? null;
      if (sid) await window.claude.buddy.setSession(sid);
    }
    setViewedSession(sid);
    if (sid) window.claude.buddy.subscribe(sid);
  })();
}, []);
```

**Note:** verify what field on `SessionInfo` / the directory entry marks "active" — if it's `isActive` or `focused` instead of `active`, adjust.

- [ ] **Step 4: Manage subscription when session changes**

When the user picks a different session via the switcher, unsubscribe from the old. In `BuddyChat.tsx`:

```tsx
const prevSessionRef = useRef<string | null>(null);
useEffect(() => {
  const prev = prevSessionRef.current;
  if (prev && prev !== viewedSession) {
    window.claude.buddy.unsubscribe(prev);
  }
  prevSessionRef.current = viewedSession;
}, [viewedSession]);
```

- [ ] **Step 5: Build and manual test**

```bash
npm run build
npm run dev
```

Expected: pill shows current session; click opens switcher; selecting another session switches the buddy.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/buddy/SessionPill.tsx src/renderer/components/buddy/BuddyChat.tsx
git commit -m "feat(buddy): session pill with switcher and new-session creation"
```

---

### Task E3: Bubble feed (reuse existing)

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/buddy/BuddyChat.tsx`

- [ ] **Step 1: Identify the main app's bubble-feed component**

```bash
grep -rn 'BubbleFeed\|ChatView\|MessageList' src/renderer/components | head -5
```

The main chat view likely composes bubbles via `<ChatView>` or a `<MessageList>` that maps timeline entries from the reducer. For the buddy, we want the same rendering but in compact mode. Two options:

- **Best:** factor the existing bubble-rendering out of the main ChatView into a standalone `<BubbleFeed sessionId={…}/>` that both windows can use, adding a `compact` prop.
- **Acceptable shortcut:** render `<ChatView sessionId={…} compact />` directly in the buddy, passing the current viewed sessionId. Whether this works depends on how tightly ChatView is coupled to main-window providers.

Pick whichever is less invasive given what you see in the code.

- [ ] **Step 2: Render the bubble feed inside BuddyChat**

Replace `<BubbleFeedPlaceholder>` with the chosen component, passing the viewed sessionId. The buddy's `ThemeProvider` and subscription are already in place, so bubbles should stream in as transcript events arrive.

- [ ] **Step 3: Verify `content-visibility: auto` is applied for scroll perf**

If the existing feed doesn't already use `content-visibility: auto` (per `docs/PITFALLS.md`), add it via the buddy.css scope:

```css
body[data-mode="buddy-chat"] .bubble-row {
  content-visibility: auto;
  contain-intrinsic-size: 0 80px;
}
```

(Selector name depends on actual DOM — `.bubble-row`, `.message-row`, `.timeline-entry`, etc. Verify against the real markup.)

- [ ] **Step 4: Manual test**

Subscribe buddy to an active session. Expected: user + assistant bubbles render with correct styling (asymmetric corners, theme colors, glass). Code blocks render. Markdown simplifies (no tables, flattened headings).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/buddy/BuddyChat.tsx src/renderer/styles/buddy.css
git commit -m "feat(buddy): render bubble feed in compact mode"
```

---

### Task E4: CompactToolStrip + inline permission prompts

**Files:**
- Create: `youcoded/desktop/src/renderer/components/buddy/CompactToolStrip.tsx`
- Modify: the bubble-feed rendering to swap tool cards for the compact strip when `data-mode="buddy-chat"`

- [ ] **Step 1: Identify where tool-card rendering happens**

```bash
grep -rn 'ToolCard\|ToolBubble\|ToolGroup' src/renderer/components | head
```

Expected: a component like `<ToolCard>` or `<ToolBubble>` that renders a single tool with its inputs, status, and (when applicable) Allow/Deny buttons.

- [ ] **Step 2: Implement `<CompactToolStrip>`**

Create `youcoded/desktop/src/renderer/components/buddy/CompactToolStrip.tsx`:

```tsx
import { useState } from 'react';

interface ToolSummary {
  id: string;
  name: string;
  target?: string;
  status: 'running' | 'completed' | 'failed' | 'awaiting-approval';
}

interface Props {
  tools: ToolSummary[];
  onApprove: (toolId: string, mode: 'once' | 'always') => void;
  onDeny: (toolId: string) => void;
  onOpenDetail?: (toolId: string) => void;
}

export function CompactToolStrip({ tools, onApprove, onDeny, onOpenDetail }: Props) {
  const awaiting = tools.filter((t) => t.status === 'awaiting-approval');
  // Auto-expand when anything awaits approval; otherwise collapsed by default.
  const [expanded, setExpanded] = useState(awaiting.length > 0);
  if (tools.length === 0) return null;

  if (!expanded && awaiting.length === 0) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="layer-surface"
        style={{ alignSelf: 'center', padding: '4px 14px', borderRadius: 999, fontFamily: 'Cascadia Code, monospace', fontSize: 10.5, letterSpacing: 0.3, cursor: 'pointer', border: 'none', color: 'var(--fg-dim)' }}
      >
        {tools.length} tools used ▾
      </button>
    );
  }

  return (
    <div className="layer-surface" style={{ padding: 6, borderRadius: 10, alignSelf: 'stretch' }}>
      <button
        onClick={() => setExpanded((e) => !e)}
        style={{ display: 'block', width: '100%', textAlign: 'center', background: 'transparent', border: 'none', fontSize: 10, color: 'var(--fg-dim)', cursor: 'pointer', marginBottom: 4 }}
      >
        {tools.length} tools used ▴
      </button>
      {tools.map((t) => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 6, fontSize: 11 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: toolDot(t.status) }} />
          <span style={{ fontFamily: 'Cascadia Code, monospace', color: 'var(--fg)' }}>{t.name}</span>
          <span style={{ flex: 1, color: 'var(--fg-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.target ?? ''}</span>
          {t.status === 'awaiting-approval' ? (
            <span style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => onApprove(t.id, 'once')} style={approveStyle}>✓ Allow</button>
              <button onClick={() => onDeny(t.id)} style={denyStyle}>✕ Deny</button>
              <button onClick={() => onApprove(t.id, 'always')} style={alwaysStyle}>∞ Always</button>
            </span>
          ) : onOpenDetail ? (
            <button onClick={() => onOpenDetail(t.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)', fontSize: 10 }}>▸</button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function toolDot(status: ToolSummary['status']): string {
  switch (status) {
    case 'running': return '#60a5fa';
    case 'completed': return '#4ade80';
    case 'failed': return '#ef4444';
    case 'awaiting-approval': return '#f5a623';
  }
}

const approveStyle: React.CSSProperties = { fontSize: 10, padding: '2px 8px', borderRadius: 999, background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', cursor: 'pointer' };
const denyStyle: React.CSSProperties = { fontSize: 10, padding: '2px 8px', borderRadius: 999, background: 'transparent', color: 'var(--fg)', border: '1px solid var(--edge)', cursor: 'pointer' };
const alwaysStyle: React.CSSProperties = { ...approveStyle, background: 'transparent', color: 'var(--fg-dim)', border: '1px solid var(--edge)' };
```

- [ ] **Step 3: Wire into the bubble feed**

Wherever main's bubble feed renders tool cards for a turn, check for `body[data-mode="buddy-chat"]` and render `<CompactToolStrip>` instead. Simplest implementation: a small component wrapper:

```tsx
function ToolRendererSwitch({ tools, ...handlers }: any) {
  const buddy = typeof document !== 'undefined' && document.body.getAttribute('data-mode') === 'buddy-chat';
  if (buddy) return <CompactToolStrip tools={tools} {...handlers} />;
  return <ToolCard tools={tools} {...handlers} />; // existing
}
```

Insert `<ToolRendererSwitch>` where `<ToolCard>` currently appears.

- [ ] **Step 4: Reuse existing permission dispatch actions**

The `onApprove` / `onDeny` handlers should dispatch the same reducer actions that the main ToolCard dispatches (probably `PERMISSION_APPROVE` / `PERMISSION_DENY` or similar). Find the existing handlers and reuse.

- [ ] **Step 5: Manual test**

Trigger a tool requiring approval in a session buddy is viewing. Expected: tool strip auto-expands; three pill buttons visible; clicking Allow advances Claude just like main would.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/buddy/CompactToolStrip.tsx <whatever file(s) were modified for ToolRendererSwitch>
git commit -m "feat(buddy): compact tool strip with inline permission prompts"
```

---

### Task E5: InputBar compact mode + AttentionStrip

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/InputBar.tsx` (add `compact` prop)
- Create: `youcoded/desktop/src/renderer/components/buddy/AttentionStrip.tsx`
- Modify: `youcoded/desktop/src/renderer/components/buddy/BuddyChat.tsx` (use real InputBar and AttentionStrip)

- [ ] **Step 1: Add `compact` prop to `InputBar`**

In `InputBar.tsx`, extend the props:

```ts
interface InputBarProps {
  sessionId: string;
  disabled?: boolean;
  minimal?: boolean;
  compact?: boolean;
  onCloseDrawer?: () => void;
  // ...existing
}
```

In the render: when `compact`, hide `<QuickChips>`:

```tsx
{!minimal && !compact && <QuickChips onChipTap={handleChip} />}
```

No other JSX changes — the CSS scope (`body[data-mode="buddy-chat"]`) handles padding/sizing.

- [ ] **Step 2: Use `<InputBar>` inside `<BuddyChat>`**

Replace `<InputBarPlaceholder>` with:

```tsx
{viewedSession ? (
  <InputBar sessionId={viewedSession} compact />
) : null}
```

Import path: adjust to wherever `InputBar` lives (`import InputBar from '../InputBar'`).

- [ ] **Step 3: Implement `<AttentionStrip>`**

Create `youcoded/desktop/src/renderer/components/buddy/AttentionStrip.tsx`:

```tsx
import type { AttentionSummary } from '../../../shared/types';
import { useEffect, useState } from 'react';

interface Props { sessionId: string | null; }

export function AttentionStrip({ sessionId }: Props) {
  const [summary, setSummary] = useState<AttentionSummary | null>(null);
  useEffect(() => {
    const unsub = window.claude.buddy.onAttentionSummary(setSummary);
    return unsub;
  }, []);

  if (!sessionId || !summary) return null;
  const state = summary.perSession[sessionId];
  if (!state) return null;
  const label = state.awaitingApproval ? 'awaiting approval'
    : state.attentionState === 'ok' ? null
    : state.attentionState;
  if (!label) return null;
  const color = state.awaitingApproval ? '#f5a623'
    : state.attentionState === 'error' || state.attentionState === 'stuck' ? '#ef4444'
    : state.attentionState === 'awaiting-input' ? '#f5a623'
    : state.attentionState === 'session-died' ? '#6b7280' : '#60a5fa';

  return (
    <div
      className="layer-surface"
      style={{ alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 999, fontSize: 11, color: 'var(--fg-dim)' }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      <span>{label}</span>
    </div>
  );
}
```

- [ ] **Step 4: Wire `<AttentionStrip>` in `<BuddyChat>`**

Replace `<AttentionStripPlaceholder>` with `<AttentionStrip sessionId={viewedSession} />`.

- [ ] **Step 5: Build and manual test**

```bash
npm run build
npm run dev
```

Expected: typing in buddy input + Enter sends the message to the viewed session; attachments (paste image, drag file) work; attention strip appears when Claude is shell-idle or a tool needs approval.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/InputBar.tsx src/renderer/components/buddy/BuddyChat.tsx src/renderer/components/buddy/AttentionStrip.tsx
git commit -m "feat(buddy): compact input bar + attention strip"
```

---

## Phase F — Final wiring, manual QA, deferred issues

### Task F1: Full manual integration pass

**Files:** no code changes; verification only.

- [ ] **Step 1: Run the 10 manual integration scenarios from the spec**

From `docs/superpowers/specs/2026-04-17-buddies-floater-design.md` §9.3:

1. Enable buddy in settings → mascot appears at bottom-right (or last-known position).
2. Minimize main → mascot remains visible over other apps.
3. Click mascot → chat window opens near mascot. Click again → chat hides.
4. Switch sessions via buddy switcher → bubble feed updates; new events stream.
5. Type + send from buddy → message reaches session; main also shows it.
6. Trigger a tool needing approval → compact Allow/Deny/Always row appears; Approve proceeds.
7. Drag mascot off-screen → restart app → position clamped to visible workArea.
8. Disable buddy via settings → both windows close. Re-enable → positions restored.
9. Switch active theme with buddy open → mascot + bubbles + pills update.
10. Close last main window → buddy closes and app quits (Win/Linux); app remains docked (Mac).

- [ ] **Step 2: For each scenario that fails, file a follow-up task before closing the plan**

If a scenario fails in a way that's not fixable in this plan's scope, write it up clearly and decide: fix now, defer to a GH issue, or block release.

- [ ] **Step 3: Run full test suite and build**

```bash
cd /c/Users/desti/youcoded-dev/.worktrees/buddies-floater/desktop
npm test -- --run
npm run build
```

Expected: all tests pass, build succeeds.

- [ ] **Step 4: Commit any fix-ups from the manual pass (if any)**

```bash
git add -A
git commit -m "fix(buddy): <description of what manual QA surfaced>"
```

(Skip if nothing to commit.)

---

### Task F2: File deferred-work GitHub issues

**Files:** no code changes.

- [ ] **Step 1: Create the 8 GitHub issues listed in the spec**

For each of the following, create an issue on `itsdestin/youcoded` with an acceptance-criteria block:

1. `feat(buddy): screenshot → new session`
2. `feat(buddy): global hotkey summon`
3. `feat(buddy): tray-survival after main close`
4. `feat(buddy): edge snapping`
5. `feat(buddy): mode configurability — ambient / quick-send / mini-chat`
6. `feat(android): buddies floater parity (SYSTEM_ALERT_WINDOW overlay)`
7. `feat(buddy): multiple buddy instances`
8. `feat(buddy): crash auto-retry policy`

Create them via `gh`:

```bash
gh issue create --repo itsdestin/youcoded --title "feat(buddy): screenshot → new session" --body "…full body…"
# …repeat for each
```

Each body should reference this plan's spec doc and summarize the deferred behavior from spec §11.

- [ ] **Step 2: Verify all 8 issues exist**

```bash
gh issue list --repo itsdestin/youcoded --search "buddy" --limit 20
```

Expected: 8 issues.

---

### Task F3: Prepare merge to master

**Files:** no code changes.

- [ ] **Step 1: Rebase / merge latest master into the feature branch**

```bash
cd /c/Users/desti/youcoded-dev/.worktrees/buddies-floater
git fetch origin
git rebase origin/master
```

Resolve any conflicts. If conflicts are in `main.ts` or `shared/types.ts` (most likely), hand-merge carefully.

- [ ] **Step 2: Final build + test pass on rebased branch**

```bash
cd desktop
npm ci
npm test -- --run
npm run build
```

- [ ] **Step 3: Push feature branch**

```bash
git push -u origin feature/buddies-floater
```

- [ ] **Step 4: Open PR**

Use the `superpowers:finishing-a-development-branch` skill to decide the right integration path (PR vs. direct merge). For a feature of this size, open a PR for review; don't direct-merge.

- [ ] **Step 5: After PR is merged, clean up**

```bash
cd /c/Users/desti/youcoded-dev/youcoded
git fetch origin
git branch --contains <merge-sha>  # verify it includes master
git worktree remove ../.worktrees/buddies-floater
git branch -D feature/buddies-floater
```

---

## Self-review notes (for the implementer)

**Areas where the plan explicitly defers to plan-time verification:**

1. **`<ThemeMascot>` component existence** (Task D2) — verify before implementing; fall back to inline `<img>` if missing.
2. **`window.claude.session.getDirectory()` / `.onDirectoryUpdated()` / `.create()`** (Task E2) — the exact preload method names are not verified here. Find the real ones before writing the SessionPill.
3. **Attention classifier integration point** (Task C1, step 5) — the cleanest hook into the renderer's reducer is unverified; likely `useAttentionClassifier` or a side-effect in `App.tsx` where the reducer lives.
4. **Bubble feed factoring** (Task E3) — whether to factor out a standalone `<BubbleFeed>` or render the whole `<ChatView>` in compact mode is a judgment call at plan time. Pick the less invasive path.
5. **Tool-card swap point** (Task E4) — the exact render site for tool cards may differ from assumptions; find the real one before inserting `<ToolRendererSwitch>`.
6. **`active` field on session directory entries** (Task E2, step 3) — the exact property name that marks the currently-active session in the `window:get-directory` response needs to be verified.

These are all small verifications the implementer should do as Step 0 of the relevant task — not blockers, just don't trust the plan's field names blindly.
