---
status: shipped
---

# Artifact Drawer Drag-to-Resize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A draggable divider on the artifact drawer's left edge sets any intermediate width, persisted across app restarts and updates (youcoded#105).

**Architecture:** The drawer width already flows through one CSS var (`--right-pane-width`). We add one level of indirection: a `--drawer-width` var on `<html>` (managed by ThemeProvider from localStorage, the house pattern for remembered UI prefs), which App.tsx's inline style references instead of the hardcoded `'480px'`. Live drag writes `--drawer-width` directly on `document.documentElement` (no React re-render per mousemove, and App re-renders mid-drag are harmless because the inline style is the constant string `var(--drawer-width, 480px)`); pointer-up commits to context state + localStorage. A pure clamp helper is unit-tested.

**Tech Stack:** React + TypeScript (Electron renderer, shared with Android WebView — no Node APIs), vitest, Tailwind + CSS vars.

**Spec:** `docs/active/specs/2026-07-16-artifact-drawer-resize-design.md`
**Repo:** all paths below are inside `C:/Users/desti/youcoded-dev/youcoded/` (the app sub-repo). Work in a worktree: `git worktree add ../youcoded-worktrees/drawer-resize -b feat/drawer-resize origin/master`.

## File structure

- **Create** `desktop/src/renderer/state/drawer-width.ts` — constants + pure `clampDrawerWidth` (the only logic worth unit-testing; kept out of theme-context so tests need no React).
- **Create** `desktop/tests/drawer-width.test.ts` — clamp unit tests.
- **Modify** `desktop/src/renderer/state/theme-context.tsx` — `drawerWidth` / `setDrawerWidth` / `resetDrawerWidth` (localStorage `youcoded-drawer-width`, applies `--drawer-width` on `<html>`, re-clamps on window resize).
- **Modify** `desktop/src/renderer/App.tsx:2449` — inline style indirection.
- **Modify** `desktop/src/renderer/styles/globals.css:~1181` — comment update at the `--right-pane-width` definition.
- **Modify** `desktop/src/renderer/components/SessionDrawer.tsx` — the drag handle (rendered in both `<aside>` return paths, hidden while expanded).

Rules in play: `.claude/rules/react-renderer.md` (right slot reads `var(--right-pane-width)` in BOTH consumers — we keep that var as the single distribution point; no new backdrop-filter; no Node APIs) and `.claude/rules/artifacts.md` (no status glyphs; drawer is layout-level). No IPC changes → no preload/shim/Android parity work.

---

### Task 1: Clamp helper (TDD)

**Files:**
- Create: `desktop/tests/drawer-width.test.ts`
- Create: `desktop/src/renderer/state/drawer-width.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// desktop/tests/drawer-width.test.ts
import { describe, it, expect } from 'vitest';
import { clampDrawerWidth, DEFAULT_DRAWER_WIDTH, MIN_DRAWER_WIDTH } from '../src/renderer/state/drawer-width';

// Pins the resize guardrails from the 2026-07-16 spec: min 320px, max 60% of
// the window, non-finite input falls back to the 480px default, and the
// result is always an integer (CSS px).
describe('clampDrawerWidth', () => {
  it('passes through an in-range width, rounded to an integer', () => {
    expect(clampDrawerWidth(600.4, 1920)).toBe(600);
  });

  it('clamps below the 320px minimum up to the minimum', () => {
    expect(clampDrawerWidth(100, 1920)).toBe(MIN_DRAWER_WIDTH);
    expect(MIN_DRAWER_WIDTH).toBe(320);
  });

  it('clamps above 60% of the window width down to that ceiling', () => {
    expect(clampDrawerWidth(2000, 1920)).toBe(Math.floor(1920 * 0.6));
  });

  it('never lets the ceiling drop below the minimum on tiny windows', () => {
    // 60% of 400px = 240 < 320 — the min wins so the drawer stays usable.
    expect(clampDrawerWidth(999, 400)).toBe(MIN_DRAWER_WIDTH);
  });

  it('falls back to the 480px default for non-finite input (corrupt localStorage)', () => {
    expect(clampDrawerWidth(NaN, 1920)).toBe(DEFAULT_DRAWER_WIDTH);
    expect(clampDrawerWidth(Infinity, 1920)).toBe(DEFAULT_DRAWER_WIDTH); // Infinity is non-finite too
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd desktop && npx vitest run tests/drawer-width.test.ts`
Expected: FAIL — cannot resolve `../src/renderer/state/drawer-width`.

- [ ] **Step 3: Implement the module**

```typescript
// desktop/src/renderer/state/drawer-width.ts
/** Artifact-drawer width preference (youcoded#105).
 *
 * The drawer's width is distributed to the layout through ONE CSS var,
 * `--right-pane-width` (see react-renderer rule — the chrome-glass cutout and
 * .drawer-pane both read it). This module owns the USER-CHOSEN width behind
 * it: `--drawer-width`, set on <html> by ThemeProvider and referenced by
 * App.tsx's inline style as `var(--drawer-width, 480px)`. Live drag writes
 * the <html> var directly (no React re-render per mousemove); pointer-up
 * commits through ThemeProvider (state + localStorage).
 */

export const DRAWER_WIDTH_KEY = 'youcoded-drawer-width';
export const DEFAULT_DRAWER_WIDTH = 480; // matches the pre-resize fixed width
export const MIN_DRAWER_WIDTH = 320;     // thinner is unreadable
export const MAX_DRAWER_FRACTION = 0.6;  // leave the chat pane usable

/** Clamp a candidate width to [320, 60% of window], defaulting to 480 for
 *  non-finite input (e.g. corrupt localStorage). Always returns an integer. */
export function clampDrawerWidth(width: number, windowWidth: number): number {
  if (!Number.isFinite(width)) return DEFAULT_DRAWER_WIDTH;
  const max = Math.max(MIN_DRAWER_WIDTH, Math.floor(windowWidth * MAX_DRAWER_FRACTION));
  return Math.round(Math.min(max, Math.max(MIN_DRAWER_WIDTH, width)));
}

/** Write the live width var on <html>. Used by ThemeProvider (committed
 *  value) AND by the drag handler (per-frame preview). */
export function applyDrawerWidthVar(px: number): void {
  document.documentElement.style.setProperty('--drawer-width', `${px}px`);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd desktop && npx vitest run tests/drawer-width.test.ts`
Expected: PASS (5 tests). (`applyDrawerWidthVar` touches `document` — fine, vitest config uses a DOM environment for renderer tests; if the suite runs node-env for this path, move `applyDrawerWidthVar` calls out of test scope — the tests above never call it.)

- [ ] **Step 5: Commit**

```bash
git add desktop/tests/drawer-width.test.ts desktop/src/renderer/state/drawer-width.ts
git commit -m "feat(drawer): clamp helper + width-var module for drag-to-resize (youcoded#105)"
```

---

### Task 2: ThemeProvider plumbing (persist + apply + re-clamp)

**Files:**
- Modify: `desktop/src/renderer/state/theme-context.tsx`

- [ ] **Step 1: Add the import and key**

Near the other storage keys (after line 39, `SHOW_DELETED_ARTIFACTS_KEY`):

```typescript
import { clampDrawerWidth, applyDrawerWidthVar, DRAWER_WIDTH_KEY, DEFAULT_DRAWER_WIDTH } from './drawer-width';
```

(Import goes at the top of the file with the other imports; no new key constant here — `DRAWER_WIDTH_KEY` lives in drawer-width.ts.)

- [ ] **Step 2: Extend the context interface and default**

In `ThemeContextValue` (after `setShowDeletedArtifacts` at line 76):

```typescript
  /** Artifact drawer width in px (youcoded#105). Committed value — the live
   *  drag previews via the <html> CSS var and commits here on pointer-up. */
  drawerWidth: number;
  setDrawerWidth: (px: number) => void;
  /** Double-click-the-handle reset: back to 480 and forget the stored pref. */
  resetDrawerWidth: () => void;
```

In the `createContext` default (after `showDeletedArtifacts` line 98):

```typescript
  drawerWidth: DEFAULT_DRAWER_WIDTH, setDrawerWidth: () => {}, resetDrawerWidth: () => {},
```

- [ ] **Step 3: Add state + setters + effects inside `ThemeProvider`**

Next to the other pref states (near `showTimestamps`, ~line 136):

```typescript
  // Artifact drawer width (youcoded#105). Clamped at load so a pref saved on
  // a big monitor can't overflow a smaller window on next launch.
  const [drawerWidth, setDrawerWidthState] = useState(() =>
    clampDrawerWidth(parseInt(getStored(DRAWER_WIDTH_KEY, String(DEFAULT_DRAWER_WIDTH)), 10), window.innerWidth));

  const setDrawerWidth = (px: number) => {
    const clamped = clampDrawerWidth(px, window.innerWidth);
    setDrawerWidthState(clamped);
    try { localStorage.setItem(DRAWER_WIDTH_KEY, String(clamped)); } catch {}
  };

  const resetDrawerWidth = () => {
    setDrawerWidthState(DEFAULT_DRAWER_WIDTH);
    // Remove (don't write 480) so a future default change reaches users who reset.
    try { localStorage.removeItem(DRAWER_WIDTH_KEY); } catch {}
  };

  // Keep the <html> var in sync with the committed value…
  useEffect(() => { applyDrawerWidthVar(drawerWidth); }, [drawerWidth]);

  // …and re-clamp when the window shrinks (debounced via rAF; resize storms
  // are cheap no-ops when the clamp doesn't change the value).
  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setDrawerWidthState((w) => clampDrawerWidth(w, window.innerWidth));
      });
    };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, []);
```

- [ ] **Step 4: Add the three fields to the provider's `value`**

Find the `value={{ ... }}` (or `useMemo`-built value object) that lists `showDeletedArtifacts, setShowDeletedArtifacts` and add `drawerWidth, setDrawerWidth, resetDrawerWidth` beside them. If the value is memoized, add `drawerWidth` to the dependency array.

- [ ] **Step 5: Typecheck**

Run: `cd desktop && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/renderer/state/theme-context.tsx
git commit -m "feat(drawer): drawerWidth pref in ThemeProvider (localStorage-backed, resize re-clamp)"
```

---

### Task 3: Route the width through App.tsx + CSS comment

**Files:**
- Modify: `desktop/src/renderer/App.tsx:2446-2449`
- Modify: `desktop/src/renderer/styles/globals.css:1181-1186`

- [ ] **Step 1: Replace the hardcoded 480px with the indirection**

`App.tsx:2446-2449` currently:

```tsx
        // --right-pane-width drives BOTH the framed-shell drawer-pane width and
        // the chrome-glass cutout offset (both descend from here). The game pane
        // is narrower than the artifact drawer's 480px default.
        style={{ ['--right-pane-width' as any]: gameState.panelOpen ? '400px' : '480px' }}
```

Replace with:

```tsx
        // --right-pane-width drives BOTH the framed-shell drawer-pane width and
        // the chrome-glass cutout offset (both descend from here). The game pane
        // stays fixed at 400px; the artifact drawer's width is user-resizable
        // (youcoded#105) via --drawer-width on <html> — referencing the var here
        // (instead of a px literal) means mid-drag App re-renders rewrite the
        // SAME string and can't snap the width back while the user is dragging.
        style={{ ['--right-pane-width' as any]: gameState.panelOpen ? '400px' : 'var(--drawer-width, 480px)' }}
```

- [ ] **Step 2: Update the globals.css comment**

At `styles/globals.css:1181-1186`, extend the existing comment block above `--right-pane-width: 480px;` with one line (keep the rest):

```css
     User-resized drawer widths arrive via --drawer-width on <html>
     (ThemeProvider / drawer-width.ts) — App.tsx points --right-pane-width at
     it when the artifact drawer is the active right pane. */
```

- [ ] **Step 3: Typecheck + spot-run the app-level tests**

Run: `cd desktop && npx tsc --noEmit && npx vitest run tests/artifacts/artifact-tracker.test.ts`
Expected: clean / PASS (no reducer change — this is a canary that nothing drifted).

- [ ] **Step 4: Commit**

```bash
git add desktop/src/renderer/App.tsx desktop/src/renderer/styles/globals.css
git commit -m "feat(drawer): --right-pane-width reads user-set --drawer-width var"
```

---

### Task 4: The drag handle in SessionDrawer

**Files:**
- Modify: `desktop/src/renderer/components/SessionDrawer.tsx` (asideClass ~line 422; both `<aside>` returns at ~428 and ~434; `useTheme()` destructure at line 85)

- [ ] **Step 1: Pull the new context fields**

Line 85 destructure gains the three fields:

```typescript
  const { hideCodeAndConfigs, setHideCodeAndConfigs, showDeletedArtifacts, setShowDeletedArtifacts, drawerWidth, setDrawerWidth, resetDrawerWidth } = useTheme();
```

- [ ] **Step 2: Add the drag handler + handle element (above the `asideClass` definition, ~line 420)**

```tsx
  // Drag-to-resize (youcoded#105). The drawer sits on the RIGHT, so dragging
  // the LEFT edge left grows it: width = startWidth + (startX - clientX).
  // Live preview writes the <html> --drawer-width var once per frame (no
  // React re-render per mousemove); pointer-up commits via setDrawerWidth
  // (clamp + localStorage). Double-click resets to the 480px default.
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);
  const dragRaf = useRef(0);
  const [dragging, setDragging] = useState(false);

  const onHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragState.current = { startX: e.clientX, startWidth: drawerWidth };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onHandlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragState.current;
    if (!s) return;
    const next = clampDrawerWidth(s.startWidth + (s.startX - e.clientX), window.innerWidth);
    cancelAnimationFrame(dragRaf.current);
    dragRaf.current = requestAnimationFrame(() => applyDrawerWidthVar(next));
  };
  const onHandlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragState.current;
    if (!s) return;
    dragState.current = null;
    setDragging(false);
    cancelAnimationFrame(dragRaf.current);
    setDrawerWidth(s.startWidth + (s.startX - e.clientX)); // setter clamps + persists
  };

  // Hidden while expanded — there's no width to drag in fill mode. w-1.5 is a
  // 6px hit area hugging the drawer's left edge; the visible affordance is the
  // hover/drag accent tint. No new backdrop-filter (react-renderer rule).
  const resizeHandle = expanded ? null : (
    <div
      className={`absolute left-0 inset-y-0 w-1.5 cursor-col-resize z-10 transition-colors ${dragging ? 'bg-accent/50' : 'hover:bg-accent/30'}`}
      title="Drag to resize · double-click to reset"
      onPointerDown={onHandlePointerDown}
      onPointerMove={onHandlePointerMove}
      onPointerUp={onHandlePointerUp}
      onPointerCancel={onHandlePointerUp}
      onDoubleClick={resetDrawerWidth}
    />
  );
```

Add the imports at the top of the file:

```typescript
import { clampDrawerWidth, applyDrawerWidthVar } from '../state/drawer-width';
```

(`useRef` is already imported; add `useState` if not already in the react import — it is, per line 96.)

- [ ] **Step 3: Make both `<aside>` returns positioning contexts and render the handle**

`asideClass` (~line 422) — add `relative` to BOTH branches, and switch the collapsed branch's `w-[480px]` literal to follow the shared var so the aside can never drift from its `.drawer-pane` parent (which is sized by `var(--right-pane-width)` at `globals.css:1478`):

```typescript
  // relative: positioning context for the resize handle. Width follows the
  // same var as the parent .drawer-pane so the two can't drift (youcoded#105).
  const asideClass = expanded
    ? 'relative flex-1 min-w-0 h-full flex flex-col bg-inset'
    : 'relative w-[var(--right-pane-width,480px)] h-full flex flex-col bg-inset shrink-0';
```

Both returns gain the handle as the first child:

```tsx
  if (!active) {
    return <aside ref={asideRef} className={asideClass}>{resizeHandle}{listInner}</aside>;
  }
```

and in the main return (~line 434):

```tsx
    <aside ref={asideRef} className={asideClass}>
      {resizeHandle}
      {/* top bar */}
```

- [ ] **Step 4: Typecheck + run the artifact test files**

Run: `cd desktop && npx tsc --noEmit && npx vitest run tests/drawer-width.test.ts tests/artifacts/`
Expected: clean / all PASS.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer/components/SessionDrawer.tsx
git commit -m "feat(drawer): drag handle — live resize, double-click reset (youcoded#105)"
```

---

### Task 5: Full verification + PR

- [ ] **Step 1: Full suite**

Run: `cd desktop && npx vitest run`
Expected: all pass (2016+ passed as of 2026-07-16; `sync-spaces-project-discovery.test.ts` is known-flaky under full-suite load — rerun in isolation if it times out).

- [ ] **Step 2: Live verification in the dev instance**

Run `bash scripts/run-dev.sh` from the workspace root (NEVER the live app), open a session with artifacts, then check:

1. Drag the drawer edge: width follows smoothly; chat pane and frosted-chrome cutout stay aligned (no seam) at 100% and 125% zoom.
2. Release, close and reopen the app (dev instance): width restored.
3. Double-click the handle: snaps to 480; restart: still 480.
4. Drag past the limits: stops at 320px and at 60% of the window.
5. Shrink the OS window below the saved width's fit: drawer re-clamps, no horizontal overflow.
6. Expand-to-fill toggle: handle disappears; back to normal: handle returns at the remembered width.
7. Open the games panel (drawer closed): game pane still 400px, unaffected.
8. `localStorage.getItem('youcoded-drawer-width')` in the DEV instance's DevTools reflects the committed value.

Shut the dev instance down afterward.

- [ ] **Step 3: Push + PR**

```bash
git push -u origin feat/drawer-resize
gh pr create --repo itsdestin/youcoded --title "feat(drawer): drag-to-resize artifact drawer width (persisted)" --body "Closes #105. <summary + verification notes>. 🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Do not merge without review. After merge: remove the worktree, flip the ROADMAP/spec status (workspace repo), and close the loop per "merge means merge AND push AND archive the docs".
