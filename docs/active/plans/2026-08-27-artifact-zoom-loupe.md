---
status: draft
date: 2026-08-27
spec: docs/active/specs/2026-08-27-artifact-zoom-loupe-design.md
repos: [youcoded]
---

# Artifact Viewer Zoom Pill + Loupe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the artifact pane a top-left zoom pill and a cursor-following magnifier for images, SVG and PDFs.

**Architecture:** One pure state machine (`useZoomPan`) that knows nothing about images or PDFs, one shared control (`ui/ZoomPill`), and one lens overlay (`Loupe`) that resolves its own source element. `ImageView` feeds the scale into a CSS transform; `PdfView` feeds it into the pdf.js render scale. The app-wide pinch handler learns one bail-out so it stops fighting the pane.

**Tech Stack:** React 19 + TypeScript, Vitest (node by default, jsdom per-file), Tailwind + the app's `ui/` primitives, pdf.js (`pdfjs-dist ^6.1.200`), Electron + Android WebView.

## Global Constraints

- **Work in a git worktree.** Never link `node_modules` — copy with `cp -al`.
- **Every non-trivial edit carries a WHY comment.** Destin is a non-developer and reads comments to understand the code.
- **No hand-rolled controls.** Buttons come from `components/ui/Button` (`size="icon"` *requires* `aria-label`, enforced by the type at `Button.tsx:89-90`). Floating surfaces come from `OverlayPanel` (`components/overlays/Overlay.tsx`) with a `layer` — never a hardcoded `z-`, blur, shadow or radius. Guards: `tests/primitive-adoption.test.ts`, `tests/overlay-layer-authority.test.ts`.
- **Hover hints are native `title=`.** `AnchorTip` is explicitly not for this.
- **jsdom is opt-in per file** with `// @vitest-environment jsdom` on line 1. Vitest 4 silently ignores `environmentMatchGlobs`; a `.tsx` test without the docblock dies on `document is not defined`.
- **jsdom has no canvas 2D context, no `matchMedia`, no `elementFromPoint`, no `URL.createObjectURL`, and every `getBoundingClientRect()` returns zeros.** `ResizeObserver` IS stubbed globally (`tests/setup-dom.ts`).
- **`bash scripts/verify.sh <worktree>` must pass** before any task is called done (tsc, affected vitest, knip, eslint, ast-grep).
- **Zoom rungs:** `[50, 75, 100, 150, 200, 400, 800]` percent. `fit` is a rung, and rungs at or below the fit scale are dropped for that file.
- **Loupe:** ~180 px diameter, 2.5× the current display scale, raster clamp 8× native, no clamp for SVG.
- **PDF canvas ceiling:** ≤ 16 megapixels per page **and** ≤ 16384 px per dimension.
- **Commit messages** end with the workspace trailer:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- **Never touch Destin's running app.** Runtime checks go through `bash scripts/run-dev.sh <worktree> --label "Artifact Zoom"` or the workbench.

## File Structure

| File | Responsibility |
|---|---|
| `desktop/src/renderer/components/artifact-views/zoom/zoom-math.ts` | **Create.** Pure functions: fit scale, ladder, rung stepping, pan clamp, anchored zoom. Zero React, zero DOM. |
| `desktop/src/renderer/components/artifact-views/zoom/useZoomPan.ts` | **Create.** React state + pointer/wheel/pinch handlers over `zoom-math`. Sizes arrive as arguments. |
| `desktop/src/renderer/components/artifact-views/zoom/Loupe.tsx` | **Create.** Lens overlay. Takes `resolveSource(clientX, clientY)`. rAF redraw. No pixel read-back. |
| `desktop/src/renderer/components/artifact-views/zoom/index.ts` | **Create.** Barrel. |
| `desktop/src/renderer/components/ui/ZoomPill.tsx` | **Create.** `[ − | % | + | ⌕ ]` on an `OverlayPanel`. |
| `desktop/src/renderer/components/ui/index.ts` | **Modify.** Export `ZoomPill`. |
| `desktop/src/renderer/components/artifact-views/ImageView.tsx` | **Modify.** Wrap in a `relative` `data-zoomable` box; wire pill + loupe + transform; delete the dead `touchAction`. |
| `desktop/src/renderer/components/artifact-views/PdfView.tsx` | **Modify (restructure).** React-owned per-page components, retained doc proxy, `renderTask.cancel()`, visible-page rendering, scale from the pill. |
| `desktop/src/renderer/hooks/useZoomControls.ts` | **Modify.** Bail out of the app-wide pinch handler inside `[data-zoomable]`. |
| `desktop/src/renderer/components/ZoomOverlay.tsx` | **Modify (conditional).** Render `ZoomPill` — only if pixel-identical. |
| `desktop/src/renderer/dev/workbench/mock-shim.ts` + `dev/workbench/fixtures/artifacts.ts` | **Modify.** Implement `artifacts.readBinary` so the workbench can show an image and a PDF at all. |
| `desktop/tests/zoom-math.test.ts` | **Create.** The bulk of the coverage — pure, node environment. |
| `desktop/tests/zoom-pill.test.tsx` | **Create.** jsdom. |
| `desktop/tests/zoom-loupe.test.tsx` | **Create.** jsdom. |
| `desktop/tests/image-view-zoom.test.tsx` | **Create.** jsdom. |
| `desktop/tests/pdf-view-zoom.test.tsx` | **Create.** jsdom + `vi.mock('pdfjs-dist')`. |
| `desktop/tests/zoom-controls-guard.test.tsx` | **Create.** jsdom. |

---

## Phase 0 — Make the work reviewable

### Task 0: Worktree

**Files:** none (environment only)

**Interfaces:**
- Consumes: nothing
- Produces: a worktree path every later task runs in — referred to below as `$WT`

- [ ] **Step 1: Sync and create the worktree**

```bash
cd /home/destin/youcoded-dev/youcoded
git fetch origin && git pull origin master
git worktree add ../artifact-zoom -b feat/artifact-zoom-loupe
```

- [ ] **Step 2: Hardlink-copy node_modules (NEVER symlink or junction)**

```bash
cp -al desktop/node_modules ../artifact-zoom/desktop/node_modules
```

Expected: completes in under a second. A symlink here makes `npm ci` empty the main checkout's deps and makes `verify.sh` silently skip suites.

- [ ] **Step 3: Confirm the baseline is green**

Run: `bash /home/destin/youcoded-dev/scripts/verify.sh ../artifact-zoom`
Expected: exit 0.

---

### Task 1: The workbench can display an image and a PDF

Today every image in the workbench renders "Preview isn't available on this platform." because `artifacts.readBinary` has no mock. Without this there is no review deck.

**Files:**
- Modify: `desktop/src/renderer/dev/workbench/fixtures/artifacts.ts`
- Modify: `desktop/src/renderer/dev/workbench/mock-shim.ts` (channel list ~line 45-47; `const artifacts = {` ~line 627)

**Interfaces:**
- Consumes: nothing
- Produces: `window.claude.artifacts.readBinary(path) => Promise<{ ok: true; base64: string } | { ok: false; error: string }>` in the workbench, matching the real shape consumed by `useArtifactBytes.ts:28`.

- [ ] **Step 1: Read the real contract first**

Run: `sed -n '1,60p' desktop/src/renderer/components/artifact-views/useArtifactBytes.ts`
Expected: shows exactly what the caller destructures. Match that shape — do not invent one.

- [ ] **Step 2: Add fixtures**

In `dev/workbench/fixtures/artifacts.ts`, add two base64 constants and a lookup. Use a real photo-like PNG (a 1200×800 gradient with fine 1px text is ideal for testing a magnifier) and a small multi-page PDF. Generate them once and paste as base64:

```ts
// WHY: the workbench has no filesystem — every binary preview must come from a
// literal, or images and PDFs render the "unavailable" error state instead.
export const FIXTURE_BINARIES: Record<string, string> = {
  'screenshot.png': 'iVBORw0KGgo…',   // 1200x800, contains 8px text to magnify
  'sample.pdf': 'JVBERi0xLjQK…',      // 3 pages
};
```

- [ ] **Step 3: Implement the channel**

In `mock-shim.ts`, add `'artifacts.readBinary'` to the channel list and to the `artifacts` object:

```ts
readBinary: async (path: string) => {
  const name = path.split('/').pop() ?? '';
  const base64 = FIXTURE_BINARIES[name];
  // WHY: mirror main's real failure code rather than inventing one, so the
  // workbench exercises the same error branch users hit.
  if (!base64) return { ok: false, error: 'orphan' };
  return { ok: true, base64 };
},
```

- [ ] **Step 4: Boot-check (required after ANY shim change)**

Run: `node /home/destin/youcoded-dev/scripts/workbench-boot-check.mjs`
Expected: every registered route loads, zero console errors.

- [ ] **Step 5: Look at it**

Run: `bash /home/destin/youcoded-dev/scripts/run-workbench.sh`, open an image artifact.
Expected: the picture renders instead of "Preview isn't available on this platform."

- [ ] **Step 6: Commit**

```bash
git add desktop/src/renderer/dev/workbench
git commit -m "feat(workbench): mock artifacts.readBinary so images and PDFs preview"
```

---

## Phase 1 — The engine

### Task 2: `zoom-math.ts` — the pure state machine

Everything hard lives here, in plain functions, because jsdom returns zeros for every rect and cannot test geometry through the DOM.

**Files:**
- Create: `desktop/src/renderer/components/artifact-views/zoom/zoom-math.ts`
- Test: `desktop/tests/zoom-math.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  ```ts
  export const ZOOM_RUNGS: readonly number[];              // [0.5, 0.75, 1, 1.5, 2, 4, 8]
  export interface Sizes { containerW: number; containerH: number; contentW: number; contentH: number }
  export interface Offset { x: number; y: number }
  export function fitScale(s: Sizes): number;              // ≤ 1, never upscales
  export function ladderFor(fit: number): number[];        // rungs strictly > fit, ascending
  export function stepScale(scale: number, fit: number, dir: 1 | -1): number;
  export function clampOffset(o: Offset, scale: number, s: Sizes): Offset;
  export function zoomAtPoint(
    prev: { scale: number; offset: Offset },
    nextScale: number,
    anchor: { x: number; y: number },   // pointer, in container-relative px
    s: Sizes,
  ): { scale: number; offset: Offset };
  ```

- [ ] **Step 1: Write the failing tests**

Create `desktop/tests/zoom-math.test.ts`:

```ts
// Pure geometry for the artifact zoom. No DOM — jsdom returns zero-sized rects,
// so every geometric claim has to be tested here or not at all.
import { describe, it, expect } from 'vitest';
import {
  ZOOM_RUNGS, fitScale, ladderFor, stepScale, clampOffset, zoomAtPoint,
} from '../src/renderer/components/artifact-views/zoom/zoom-math';

const big = { containerW: 400, containerH: 300, contentW: 2000, contentH: 1000 };
const small = { containerW: 900, containerH: 600, contentW: 300, contentH: 200 };

describe('fitScale', () => {
  it('shrinks oversized content to the tighter axis', () => {
    expect(fitScale(big)).toBeCloseTo(0.2);           // 400/2000 = 0.2 beats 300/1000 = 0.3
  });
  it('never upscales content smaller than the container', () => {
    expect(fitScale(small)).toBe(1);
  });
  it('returns 1 for degenerate sizes instead of Infinity or NaN', () => {
    expect(fitScale({ containerW: 0, containerH: 0, contentW: 0, contentH: 0 })).toBe(1);
  });
});

describe('ladderFor', () => {
  it('drops rungs at or below fit', () => {
    expect(ladderFor(1)).toEqual([1.5, 2, 4, 8]);      // a small image starts at 100%
  });
  it('keeps every rung above a small fit', () => {
    expect(ladderFor(0.2)).toEqual([...ZOOM_RUNGS]);
  });
});

describe('stepScale', () => {
  it('steps up from fit to the first rung above it', () => {
    expect(stepScale(1, 1, 1)).toBe(1.5);
  });
  it('bottoms out at fit rather than below it', () => {
    expect(stepScale(1.5, 1, -1)).toBe(1);
    expect(stepScale(1, 1, -1)).toBe(1);
  });
  it('tops out at the last rung', () => {
    expect(stepScale(8, 0.2, 1)).toBe(8);
  });
  it('snaps an off-rung scale from a wheel gesture to the next rung', () => {
    expect(stepScale(1.7, 0.2, 1)).toBe(2);
    expect(stepScale(1.7, 0.2, -1)).toBe(1.5);
  });
});

describe('clampOffset', () => {
  it('pins content to zero offset when it is not larger than the container', () => {
    expect(clampOffset({ x: 50, y: 50 }, 0.2, big)).toEqual({ x: 0, y: 0 });
  });
  it('never lets content be dragged past its own edge', () => {
    // At scale 1 the content is 2000x1000 in a 400x300 box: 1600x700 of slack.
    expect(clampOffset({ x: 9999, y: -9999 }, 1, big)).toEqual({ x: 800, y: -350 });
  });
});

describe('zoomAtPoint', () => {
  it('keeps the pixel under the pointer under the pointer', () => {
    const start = { scale: 1, offset: { x: 0, y: 0 } };
    const anchor = { x: 400, y: 300 };                // bottom-right corner of the box
    const next = zoomAtPoint(start, 2, anchor, big);
    expect(next.scale).toBe(2);
    // Doubling around a corner pulls content by the same corner distance.
    expect(next.offset.x).toBeLessThan(0);
    expect(next.offset.y).toBeLessThan(0);
  });
  it('clamps the resulting offset', () => {
    const next = zoomAtPoint({ scale: 1, offset: { x: 0, y: 0 } }, 0.2, { x: 0, y: 0 }, big);
    expect(next.offset).toEqual({ x: 0, y: 0 });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd $WT/desktop && npx vitest run tests/zoom-math.test.ts`
Expected: FAIL — `Cannot find module '.../zoom-math'`.

- [ ] **Step 3: Implement**

Create `desktop/src/renderer/components/artifact-views/zoom/zoom-math.ts`:

```ts
// Pure geometry for artifact zoom/pan. Deliberately DOM-free: jsdom reports
// every getBoundingClientRect as zeros, so anything measured from the DOM is
// untestable. Callers pass sizes in; these functions decide.

/** The rungs the +/- buttons walk, as scale factors (1 = 100%). */
export const ZOOM_RUNGS: readonly number[] = [0.5, 0.75, 1, 1.5, 2, 4, 8];

export interface Sizes { containerW: number; containerH: number; contentW: number; contentH: number }
export interface Offset { x: number; y: number }

/** Scale at which the content just fits. Mirrors `max-w-full max-h-full`:
 *  it shrinks oversized content and NEVER upscales, so a small image fits at 1. */
export function fitScale(s: Sizes): number {
  if (!(s.contentW > 0) || !(s.contentH > 0) || !(s.containerW > 0) || !(s.containerH > 0)) return 1;
  return Math.min(1, s.containerW / s.contentW, s.containerH / s.contentH);
}

/** Rungs reachable for this file. Rungs at or below fit are dropped — otherwise
 *  a small image (fit === 1) would offer 50% and 75%, which is zooming OUT past
 *  the pane for no reason, and would leave "-" enabled at the floor. */
export function ladderFor(fit: number): number[] {
  return ZOOM_RUNGS.filter((r) => r > fit + 1e-6);
}

/** Next rung above/below `scale`. `fit` is the floor and is itself a stop, so a
 *  wheel-zoomed off-rung value snaps to the neighbouring rung rather than jumping. */
export function stepScale(scale: number, fit: number, dir: 1 | -1): number {
  const stops = [fit, ...ladderFor(fit)];
  if (dir === 1) return stops.find((s) => s > scale + 1e-6) ?? stops[stops.length - 1];
  const below = stops.filter((s) => s < scale - 1e-6);
  return below.length ? below[below.length - 1] : fit;
}

/** Keep the content overlapping the container. Zoom is a CSS transform, which
 *  creates no scroll extent, so this clamp is the ONLY thing stopping a drag
 *  from throwing the picture off-screen with no way back. */
export function clampOffset(o: Offset, scale: number, s: Sizes): Offset {
  const slackX = Math.max(0, (s.contentW * scale - s.containerW) / 2);
  const slackY = Math.max(0, (s.contentH * scale - s.containerH) / 2);
  return {
    x: Math.max(-slackX, Math.min(slackX, o.x)),
    y: Math.max(-slackY, Math.min(slackY, o.y)),
  };
}

/** Zoom so the point under the pointer stays under the pointer. `anchor` is
 *  container-relative pixels; content is centred, so the container centre is the
 *  transform origin. */
export function zoomAtPoint(
  prev: { scale: number; offset: Offset },
  nextScale: number,
  anchor: { x: number; y: number },
  s: Sizes,
): { scale: number; offset: Offset } {
  const cx = s.containerW / 2;
  const cy = s.containerH / 2;
  const ratio = nextScale / prev.scale;
  // Vector from the centre to the anchor, in pre-zoom space, scaled by the change.
  const offset = {
    x: anchor.x - cx - (anchor.x - cx - prev.offset.x) * ratio,
    y: anchor.y - cy - (anchor.y - cy - prev.offset.y) * ratio,
  };
  return { scale: nextScale, offset: clampOffset(offset, nextScale, s) };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/zoom-math.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer/components/artifact-views/zoom/zoom-math.ts desktop/tests/zoom-math.test.ts
git commit -m "feat(artifacts): pure zoom/pan geometry for the viewer"
```

---

### Task 3: `useZoomPan` — React state, pointers, wheel, pinch

**Files:**
- Create: `desktop/src/renderer/components/artifact-views/zoom/useZoomPan.ts`
- Create: `desktop/src/renderer/components/artifact-views/zoom/index.ts`
- Test: extend `desktop/tests/zoom-math.test.ts`? **No** — create `desktop/tests/use-zoom-pan.test.tsx` (jsdom, hook probe).

**Interfaces:**
- Consumes: everything from `zoom-math`.
- Produces:
  ```ts
  export interface ZoomPan {
    scale: number; fit: number; isFit: boolean; percent: number;
    canZoomIn: boolean; canZoomOut: boolean;
    offset: Offset; dragging: boolean;
    zoomIn(): void; zoomOut(): void; reset(): void;
    /** Attach to the element that receives gestures. */
    bind: {
      onPointerDown(e: React.PointerEvent): void;
      onPointerMove(e: React.PointerEvent): void;
      onPointerUp(e: React.PointerEvent): void;
      onWheel(e: React.WheelEvent): void;
    };
  }
  export function useZoomPan(sizes: Sizes): ZoomPan;
  export const DRAG_THRESHOLD_PX = 4;
  ```

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/use-zoom-pan.test.tsx`:

```tsx
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { useZoomPan } from '../src/renderer/components/artifact-views/zoom/useZoomPan';

afterEach(cleanup);

const SIZES = { containerW: 400, containerH: 300, contentW: 2000, contentH: 1000 };
let api: any;
function Probe({ sizes = SIZES }: { sizes?: typeof SIZES }) {
  api = useZoomPan(sizes);
  return null;
}

describe('useZoomPan', () => {
  it('starts fitted, with zoom-out unavailable', () => {
    render(<Probe />);
    expect(api.isFit).toBe(true);
    expect(api.percent).toBe(20);
    expect(api.canZoomOut).toBe(false);
    expect(api.canZoomIn).toBe(true);
  });

  it('walks the ladder and stops at the ceiling', () => {
    render(<Probe />);
    act(() => api.zoomIn());
    expect(api.percent).toBe(50);
    for (let i = 0; i < 10; i++) act(() => api.zoomIn());
    expect(api.percent).toBe(800);
    expect(api.canZoomIn).toBe(false);
  });

  it('reset returns to fit', () => {
    render(<Probe />);
    act(() => api.zoomIn());
    act(() => api.reset());
    expect(api.isFit).toBe(true);
    expect(api.offset).toEqual({ x: 0, y: 0 });
  });

  it('a small image cannot zoom below 100%', () => {
    render(<Probe sizes={{ containerW: 900, containerH: 600, contentW: 300, contentH: 200 }} />);
    expect(api.percent).toBe(100);
    expect(api.canZoomOut).toBe(false);
    act(() => api.zoomIn());
    expect(api.percent).toBe(150);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/use-zoom-pan.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

Create `useZoomPan.ts`:

```ts
import { useCallback, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { clampOffset, fitScale, ladderFor, stepScale, zoomAtPoint, type Offset, type Sizes } from './zoom-math';

/** A press only becomes a pan after this much travel, so a slightly shaky click
 *  is still a click and never nudges the picture. */
export const DRAG_THRESHOLD_PX = 4;

export function useZoomPan(sizes: Sizes) {
  const fit = fitScale(sizes);
  const [scale, setScale] = useState<number | null>(null);   // null === "fitted"
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  // Live scale: null means "track fit", so a pane resize re-fits automatically
  // instead of stranding the picture at a stale scale.
  const current = scale ?? fit;
  const rungs = useMemo(() => ladderFor(fit), [fit]);

  const drag = useRef<{ id: number; startX: number; startY: number; base: Offset; live: boolean } | null>(null);
  // Two-pointer pinch. Android has no native pinch (setSupportZoom(false) +
  // user-scalable=no), so this is the only pinch a phone gets.
  const pinch = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);

  const applyScale = useCallback((next: number, anchor?: { x: number; y: number }) => {
    const clamped = Math.max(fit, Math.min(rungs[rungs.length - 1] ?? fit, next));
    if (!anchor) {
      setScale(clamped <= fit + 1e-6 ? null : clamped);
      setOffset((o) => clampOffset(o, clamped, sizes));
      return;
    }
    const res = zoomAtPoint({ scale: current, offset }, clamped, anchor, sizes);
    setScale(res.scale <= fit + 1e-6 ? null : res.scale);
    setOffset(res.offset);
  }, [current, offset, fit, rungs, sizes]);

  const zoomIn = useCallback(() => applyScale(stepScale(current, fit, 1)), [applyScale, current, fit]);
  const zoomOut = useCallback(() => applyScale(stepScale(current, fit, -1)), [applyScale, current, fit]);
  const reset = useCallback(() => { setScale(null); setOffset({ x: 0, y: 0 }); }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current.size === 2) {
      const [a, b] = [...pinch.current.values()];
      pinchStart.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: current };
      drag.current = null;
      return;
    }
    if (current <= fit + 1e-6) return;   // nothing to pan at fit
    drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, base: offset, live: false };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }, [current, fit, offset]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (pinch.current.has(e.pointerId)) pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchStart.current && pinch.current.size === 2) {
      const [a, b] = [...pinch.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = (e.currentTarget as Element).getBoundingClientRect();
      applyScale(pinchStart.current.scale * (dist / pinchStart.current.dist), {
        x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top,
      });
      return;
    }
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.live && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    d.live = true;
    setDragging(true);
    setOffset(clampOffset({ x: d.base.x + dx, y: d.base.y + dy }, current, sizes));
  }, [applyScale, current, sizes]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    pinch.current.delete(e.pointerId);
    if (pinch.current.size < 2) pinchStart.current = null;
    if (drag.current?.id === e.pointerId) drag.current = null;
    setDragging(false);
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey) return;   // plain wheel is pan/scroll, owned by the viewer
    // The app-wide handler bails inside [data-zoomable] (useZoomControls), so
    // this is the only zoom that runs here.
    const rect = (e.currentTarget as Element).getBoundingClientRect();
    const factor = Math.exp(-e.deltaY / 300);
    applyScale(current * factor, { x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, [applyScale, current]);

  return {
    scale: current, fit, isFit: current <= fit + 1e-6, percent: Math.round(current * 100),
    canZoomIn: current < (rungs[rungs.length - 1] ?? fit) - 1e-6,
    canZoomOut: current > fit + 1e-6,
    offset, dragging, zoomIn, zoomOut, reset,
    bind: { onPointerDown, onPointerMove, onPointerUp, onWheel },
  };
}
```

Create `zoom/index.ts`:

```ts
export * from './zoom-math';
export * from './useZoomPan';
export { Loupe } from './Loupe';
```

(`Loupe` lands in Task 4 — write that export line then, not now, or the barrel won't compile.)

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/use-zoom-pan.test.tsx tests/zoom-math.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer/components/artifact-views/zoom desktop/tests/use-zoom-pan.test.tsx
git commit -m "feat(artifacts): useZoomPan — ladder, drag-pan, ctrl-wheel and pinch"
```

---

### Task 4: `ZoomPill`

**Files:**
- Create: `desktop/src/renderer/components/ui/ZoomPill.tsx`
- Modify: `desktop/src/renderer/components/ui/index.ts`
- Test: `desktop/tests/zoom-pill.test.tsx`

**Interfaces:**
- Consumes: `Button` (`components/ui/Button`), `OverlayPanel` (`components/overlays/Overlay`).
- Produces:
  ```ts
  export interface ZoomPillProps {
    percent: number;
    canZoomIn: boolean; canZoomOut: boolean;
    zoomInDisabledReason?: string;   // shown in title when canZoomIn is false
    onZoomIn(): void; onZoomOut(): void; onReset(): void;
    loupe?: { on: boolean; onToggle(): void } | null;  // null/undefined ⇒ no loupe button
    className?: string;
  }
  export function ZoomPill(p: ZoomPillProps): JSX.Element;
  ```

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/zoom-pill.test.tsx`:

```tsx
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ZoomPill } from '../src/renderer/components/ui/ZoomPill';

afterEach(cleanup);
const base = { percent: 100, canZoomIn: true, canZoomOut: true, onZoomIn: vi.fn(), onZoomOut: vi.fn(), onReset: vi.fn() };

describe('ZoomPill', () => {
  it('gives every control an accessible name', () => {
    render(<ZoomPill {...base} loupe={{ on: false, onToggle: vi.fn() }} />);
    expect(screen.getByRole('button', { name: /zoom out/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /zoom in/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /magnif/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /fit/i })).toBeTruthy();
  });

  it('states WHY a control is disabled, never just greys it out', () => {
    render(<ZoomPill {...base} canZoomOut={false} canZoomIn={false} zoomInDisabledReason="This page can’t be drawn any larger" />);
    const out = screen.getByRole('button', { name: /zoom out/i });
    const inn = screen.getByRole('button', { name: /zoom in/i });
    expect(out.hasAttribute('disabled')).toBe(true);
    expect(out.getAttribute('title')).toMatch(/already fitted/i);
    expect(inn.getAttribute('title')).toMatch(/can’t be drawn any larger/i);
  });

  it('omits the magnifier entirely when no loupe is offered', () => {
    render(<ZoomPill {...base} loupe={null} />);
    expect(screen.queryByRole('button', { name: /magnif/i })).toBeNull();
  });

  it('reports loupe state with aria-pressed', () => {
    const onToggle = vi.fn();
    render(<ZoomPill {...base} loupe={{ on: true, onToggle }} />);
    const btn = screen.getByRole('button', { name: /magnif/i });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalled();
  });

  it('the percentage is the reset control', () => {
    const onReset = vi.fn();
    render(<ZoomPill {...base} percent={240} onReset={onReset} />);
    fireEvent.click(screen.getByRole('button', { name: /fit/i }));
    expect(onReset).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /fit/i }).textContent).toContain('240');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/zoom-pill.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
import { OverlayPanel } from '../overlays/Overlay';
import { Button } from './Button';

/**
 * The zoom control for a picture-like artifact: [ − | 120% | + | ⌕ ].
 *
 * Always visible while a zoomable file is open — NOT hover-revealed. A hover
 * fade would never appear on Android (no pointer-enter), and an opacity-0
 * control stays in the tab order, which is the bug the Edit cluster already has.
 */
export interface ZoomPillProps {
  percent: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  zoomInDisabledReason?: string;
  onZoomIn(): void;
  onZoomOut(): void;
  onReset(): void;
  loupe?: { on: boolean; onToggle(): void } | null;
  className?: string;
}

export function ZoomPill({
  percent, canZoomIn, canZoomOut, zoomInDisabledReason,
  onZoomIn, onZoomOut, onReset, loupe, className = '',
}: ZoomPillProps) {
  return (
    <OverlayPanel layer={1} className={`flex items-center gap-1 px-1.5 py-1 ${className}`.trim()}>
      <Button
        size="icon" variant="ghost" aria-label="Zoom out"
        disabled={!canZoomOut}
        // Design guide §4.7: a disabled control owes the user a reason.
        title={canZoomOut ? 'Zoom out' : 'Already fitted to the pane'}
        onClick={onZoomOut}
      >−</Button>

      <Button
        size="sm" variant="ghost" onClick={onReset}
        className="min-w-[3.5rem] tabular-nums text-2xs"
        title="Reset to fit"
      >{percent}%</Button>

      <Button
        size="icon" variant="ghost" aria-label="Zoom in"
        disabled={!canZoomIn}
        title={canZoomIn ? 'Zoom in' : (zoomInDisabledReason ?? 'Already at the largest size')}
        onClick={onZoomIn}
      >+</Button>

      {loupe && (
        <Button
          size="icon" variant="ghost" aria-label="Magnify on hover"
          aria-pressed={loupe.on} title="Magnify on hover"
          onClick={loupe.onToggle}
        >⌕</Button>
      )}
    </OverlayPanel>
  );
}
```

Notes for the implementer:
- The reset button's accessible name must contain "fit" — the test matches `/fit/i` on the name, which comes from `title` when there is no `aria-label`. If `Button` does not forward `title` to the DOM node, add `aria-label={`Reset to fit (${percent}%)`}` rather than changing the test.
- If `variant="ghost"` does not exist, run `grep -n "ButtonVariant" src/renderer/components/ui/Button.tsx` and use the closest low-emphasis variant. Do not hand-roll classes.
- Confirm `text-2xs` exists (`grep -rn "text-2xs" src/renderer/styles/`); the design guide sets 11 px as the floor.

- [ ] **Step 4: Export it**

Add to `components/ui/index.ts`:

```ts
export { ZoomPill } from './ZoomPill';
export type { ZoomPillProps } from './ZoomPill';
```

- [ ] **Step 5: Run the tests + the guards**

Run: `npx vitest run tests/zoom-pill.test.tsx tests/primitive-adoption.test.ts tests/overlay-layer-authority.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/renderer/components/ui/ZoomPill.tsx desktop/src/renderer/components/ui/index.ts desktop/tests/zoom-pill.test.tsx
git commit -m "feat(ui): ZoomPill primitive with stated disabled reasons"
```

---

### Task 5: `Loupe`

**Files:**
- Create: `desktop/src/renderer/components/artifact-views/zoom/Loupe.tsx`
- Modify: `desktop/src/renderer/components/artifact-views/zoom/index.ts` (add the export)
- Test: `desktop/tests/zoom-loupe.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  ```ts
  export interface LoupeSource { el: CanvasImageSource & Element; }
  export interface LoupeProps {
    /** Return the element under this client point, or null to hide the lens. */
    resolveSource(clientX: number, clientY: number): LoupeSource | null;
    /** Current display scale of the content, so magnification compounds correctly. */
    displayScale: number;
    diameter?: number;      // default 180
    magnification?: number; // default 2.5
    /** True for vector sources: skips the raster "no more detail" clamp. */
    vector?: boolean;
  }
  export function Loupe(p: LoupeProps): JSX.Element | null;
  export const LOUPE_DIAMETER = 180;
  ```

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/zoom-loupe.test.tsx`:

```tsx
// @vitest-environment jsdom
// jsdom has NO canvas 2D context: getContext('2d') returns null. The lens must
// survive that (it is also a real production defense on a GPU-starved device).
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { Loupe } from '../src/renderer/components/artifact-views/zoom/Loupe';

afterEach(cleanup);

describe('Loupe', () => {
  it('renders and no-ops when there is no 2D context', () => {
    const { container } = render(
      <Loupe resolveSource={() => ({ el: document.createElement('canvas') as any })} displayScale={1} />,
    );
    expect(() => fireEvent.pointerMove(window, { clientX: 10, clientY: 10 })).not.toThrow();
    expect(container.querySelector('canvas')).toBeTruthy();
  });

  it('hides itself when the pointer resolves to no source', () => {
    const resolveSource = vi.fn(() => null);
    const { container } = render(<Loupe resolveSource={resolveSource} displayScale={1} />);
    fireEvent.pointerMove(window, { clientX: 5, clientY: 5 });
    const lens = container.firstElementChild as HTMLElement;
    expect(lens.style.visibility).toBe('hidden');
  });

  it('never reads pixels back — tainting must not be reachable', async () => {
    const src = await import('../src/renderer/components/artifact-views/zoom/Loupe?raw' as any).catch(() => null);
    // Fallback: read the file from disk so this holds even without ?raw support.
    const fs = await import('node:fs/promises');
    const text = src?.default ?? await fs.readFile(
      'src/renderer/components/artifact-views/zoom/Loupe.tsx', 'utf8');
    expect(text).not.toMatch(/getImageData|toDataURL/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/zoom-loupe.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
import { useEffect, useRef } from 'react';

export const LOUPE_DIAMETER = 180;

export interface LoupeSource { el: CanvasImageSource & Element }

export interface LoupeProps {
  resolveSource(clientX: number, clientY: number): LoupeSource | null;
  displayScale: number;
  diameter?: number;
  magnification?: number;
  vector?: boolean;
}

/**
 * Cursor-following magnifier.
 *
 * Three non-obvious rules, each of them a measured failure if broken:
 *
 * 1. It moves by writing a CSS transform through a ref, NOT by React state.
 *    State-per-pointermove re-renders the whole viewer on every pixel of cursor
 *    travel and visibly stutters on a large image.
 * 2. It draws with the DESTINATION-rect form of drawImage (whole source, scaled
 *    and offset behind a circular clip) — never the 9-arg source-rect form. A
 *    viewBox-only SVG reports naturalWidth 300x150 whatever its real size, and a
 *    source rect past naturalWidth returns fully transparent pixels: a blank lens.
 * 3. It redraws on requestAnimationFrame while open, not only on movement, or a
 *    stationary cursor over an animated GIF freezes the magnified copy while the
 *    picture underneath keeps playing.
 *
 * It NEVER calls getImageData/toDataURL. A display-only draw is unaffected by
 * canvas tainting; read-back is the thing tainting blocks.
 */
export function Loupe({
  resolveSource, displayScale, diameter = LOUPE_DIAMETER, magnification = 2.5, vector = false,
}: LoupeProps) {
  const lensRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onMove = (e: PointerEvent) => { pointer.current = { x: e.clientX, y: e.clientY }; };
    const onLeave = () => { pointer.current = null; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerleave', onLeave);

    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const lens = lensRef.current;
      const canvas = canvasRef.current;
      if (!lens || !canvas) return;
      const p = pointer.current;
      const hit = p ? resolveSource(p.x, p.y) : null;
      if (!p || !hit) { lens.style.visibility = 'hidden'; return; }

      const rect = hit.el.getBoundingClientRect();
      // Suppress the lens on content smaller than itself — a 16px favicon under
      // a 180px circle is four fat pixels and reads as broken.
      if (rect.width < diameter || rect.height < diameter) { lens.style.visibility = 'hidden'; return; }

      lens.style.visibility = 'visible';
      lens.style.transform = `translate(${p.x - diameter / 2}px, ${p.y - diameter / 2}px)`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;   // jsdom, and a real defense on a context-starved device

      // Raster sources have a native resolution; past 8x it is just bigger
      // pixels. Vector sources have none, so they magnify freely.
      const raw = magnification;
      const natural = (hit.el as HTMLImageElement).naturalWidth || rect.width;
      const nativeRatio = rect.width / natural;
      const factor = vector ? raw : Math.min(raw, 8 * nativeRatio / Math.max(displayScale, 0.01));

      const w = rect.width * factor;
      const h = rect.height * factor;
      // All maths in coordinates RELATIVE to the source rect. On Android and
      // remote, app zoom is a CSS transform on <html>, so rects are already
      // scaled — ratios cancel that out, absolute page coordinates would not.
      const nx = (p.x - rect.left) / rect.width;
      const ny = (p.y - rect.top) / rect.height;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(hit.el, diameter / 2 - nx * w, diameter / 2 - ny * h, w, h);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
    };
  }, [resolveSource, displayScale, diameter, magnification, vector]);

  return (
    <div
      ref={lensRef}
      aria-hidden
      className="fixed top-0 left-0 pointer-events-none rounded-full overflow-hidden
                 border border-border shadow-lg"
      style={{ width: diameter, height: diameter, visibility: 'hidden', zIndex: 1 }}
    >
      <canvas ref={canvasRef} width={diameter} height={diameter} />
    </div>
  );
}
```

Note for the implementer: `overlay-layer-authority.test.ts` forbids `z-[N]` **class strings**; this uses an inline `zIndex` inside a `position: fixed` layer that is a child of the pane's own stacking context. If the guard or a reviewer objects, wrap it in `OverlayPanel layer={1}` instead of hand-setting `zIndex` — do not add a `z-` class.

- [ ] **Step 4: Add the barrel export and run**

Add `export { Loupe, LOUPE_DIAMETER } from './Loupe';` to `zoom/index.ts`.

Run: `npx vitest run tests/zoom-loupe.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer/components/artifact-views/zoom desktop/tests/zoom-loupe.test.tsx
git commit -m "feat(artifacts): Loupe — rAF redraw, destination-form draw, no pixel read-back"
```

---

### Task 6: Stop the app-wide pinch handler fighting the pane

**Files:**
- Modify: `desktop/src/renderer/hooks/useZoomControls.ts:76-100`
- Test: `desktop/tests/zoom-controls-guard.test.tsx`

**Interfaces:**
- Consumes: the `data-zoomable` attribute that Task 7 and Task 11 put on the viewer roots.
- Produces: no API change.

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/zoom-controls-guard.test.tsx`:

```tsx
// @vitest-environment jsdom
// The app-wide pinch handler is capture-phase on window and preventDefaults every
// ctrlKey wheel event. Without this guard, pinching a picture zooms the whole app
// AND the picture at once — the exact double-zoom this test exists to prevent.
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { useZoomControls } from '../src/renderer/hooks/useZoomControls';

afterEach(cleanup);

function Host() { useZoomControls(); return <div data-zoomable data-testid="pane"><span data-testid="img" /></div>; }

describe('useZoomControls pinch guard', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('ignores a ctrl+wheel that starts inside a zoomable viewer', () => {
    const { getByTestId } = render(<Host />);
    const setZoom = vi.fn();
    (window as any).claude = { window: { setZoomLevel: setZoom, getZoomLevel: async () => 0 } };
    act(() => {
      getByTestId('img').dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -120, bubbles: true }));
      vi.advanceTimersByTime(100);
    });
    expect(setZoom).not.toHaveBeenCalled();
  });

  it('still zooms the app for a ctrl+wheel anywhere else', () => {
    render(<Host />);
    const setZoom = vi.fn();
    (window as any).claude = { window: { setZoomLevel: setZoom, getZoomLevel: async () => 0 } };
    act(() => {
      document.body.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -120, bubbles: true }));
      vi.advanceTimersByTime(100);
    });
    expect(setZoom).toHaveBeenCalled();
  });
});
```

Implementer note: read `useZoomControls.ts` first and stub whatever it actually calls to change zoom (the IPC surface may differ from the sketch above). The assertion that matters is *called* vs *not called*.

- [ ] **Step 2: Run it and watch the first case fail**

Run: `npx vitest run tests/zoom-controls-guard.test.tsx`
Expected: FAIL on "ignores a ctrl+wheel that starts inside a zoomable viewer".

- [ ] **Step 3: Add the guard**

In `useZoomControls.ts`, inside the wheel handler, immediately after the `if (!e.ctrlKey) return;` line:

```ts
      // The artifact viewer owns pinch/ctrl+wheel over a picture. This listener is
      // capture-phase on window and does NOT stopPropagation, so without this bail
      // both handlers run and one gesture zooms the app and the image together.
      if ((e.target as Element | null)?.closest?.('[data-zoomable]')) return;
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/zoom-controls-guard.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer/hooks/useZoomControls.ts desktop/tests/zoom-controls-guard.test.tsx
git commit -m "fix(zoom): app pinch handler yields to a zoomable artifact viewer"
```

---

### Task 7: Wire it into `ImageView`

**Files:**
- Modify: `desktop/src/renderer/components/artifact-views/ImageView.tsx`
- Test: `desktop/tests/image-view-zoom.test.tsx`

**Interfaces:**
- Consumes: `useZoomPan`, `Loupe`, `ZoomPill`.
- Produces: the `data-zoomable` root Task 6 keys off.

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/image-view-zoom.test.tsx`:

```tsx
// @vitest-environment jsdom
// ImageView reads its own bytes, so the test must stub BOTH the IPC read and
// URL.createObjectURL (jsdom ships neither). No existing test gets ImageView
// past the byte read — artifact-content-loading.test.tsx:214 asserts the
// 'unavailable' error state instead.
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ImageView } from '../src/renderer/components/artifact-views/ImageView';

beforeEach(() => {
  (URL as any).createObjectURL = vi.fn(() => 'blob:fake');
  (URL as any).revokeObjectURL = vi.fn();
  (window as any).matchMedia = (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} });
  (window as any).claude = {
    artifacts: { readBinary: vi.fn(async () => ({ ok: true, base64: 'AAAA' })) },
  };
});
afterEach(cleanup);

const props = { path: 'a.png', absolutePath: '/p/a.png', content: null, isEditable: false } as any;

describe('ImageView zoom', () => {
  it('shows the pill with the picture', async () => {
    render(<ImageView {...props} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /zoom in/i })).toBeTruthy());
  });

  it('does not magnify until the user turns the loupe on', async () => {
    const { container } = render(<ImageView {...props} />);
    await waitFor(() => screen.getByRole('button', { name: /magnif/i }));
    expect(container.querySelectorAll('canvas').length).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: /magnif/i }));
    expect(container.querySelectorAll('canvas').length).toBe(1);
  });

  it('hides the magnifier button where there is no cursor', async () => {
    (window as any).matchMedia = (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} });
    render(<ImageView {...props} />);
    await waitFor(() => screen.getByRole('button', { name: /zoom in/i }));
    expect(screen.queryByRole('button', { name: /magnif/i })).toBeNull();
  });

  it('marks its root data-zoomable so the app pinch handler yields', async () => {
    const { container } = render(<ImageView {...props} />);
    await waitFor(() => screen.getByRole('button', { name: /zoom in/i }));
    expect(container.querySelector('[data-zoomable]')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/image-view-zoom.test.tsx`
Expected: FAIL — no zoom controls rendered.

- [ ] **Step 3: Rewrite `ImageContent`**

Replace the body of `ImageContent` in `ImageView.tsx`. Key points, all load-bearing:

```tsx
function ImageContent({ bytes, absolutePath }: { bytes: Uint8Array; absolutePath: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [nat, setNat] = useState({ w: 0, h: 0 });
  const [loupeOn, setLoupeOn] = useState(false);

  const isSvg = absolutePath.toLowerCase().endsWith('.svg');
  // No hover ⇒ no loupe. A media query, not a platform sniff: a remote browser
  // on a desktop has a real cursor and should get the lens.
  const canLoupe = typeof window !== 'undefined'
    && window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches === true;

  // …existing blob-URL effect, unchanged…

  // The drawer resize writes --drawer-width straight to <html> with NO React
  // re-render (state/drawer-width.ts), so the container size must be observed
  // or the fit scale goes stale while the user drags the divider.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const zoom = useZoomPan({ containerW: box.w, containerH: box.h, contentW: nat.w, contentH: nat.h });

  // Escape rides the app's dismissal stack. A raw keydown listener here would
  // either swallow the Escape that interrupts Claude or fire alongside it, and
  // Android's hardware back button routes through this same stack.
  useEscClose(loupeOn, () => setLoupeOn(false));

  const resolveSource = useCallback(() => (imgRef.current ? { el: imgRef.current } : null), []);

  if (!url) return <CenterNote>Loading image…</CenterNote>;

  return (
    <div
      ref={boxRef}
      data-zoomable
      className="relative h-full w-full overflow-hidden"
      // touch-action only while zoomed, so page scrolling is untouched at rest.
      style={{ touchAction: zoom.isFit ? undefined : 'none' }}
      {...zoom.bind}
    >
      <img
        ref={imgRef}
        src={url}
        alt=""
        draggable={false}
        onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        className="absolute left-1/2 top-1/2 max-w-none select-none"
        style={{
          // translate(-50%,-50%) centres it; scale is applied on top. A transform
          // creates no scroll extent, which is why drag is the only pan.
          transform: `translate(-50%, -50%) translate(${zoom.offset.x}px, ${zoom.offset.y}px) scale(${zoom.scale})`,
          transformOrigin: 'center',
          cursor: zoom.isFit ? undefined : (zoom.dragging ? 'grabbing' : 'grab'),
        }}
      />

      {/* Hidden below 260px: the pane can be ~107px wide (MIN_DRAWER_WIDTH 320
          minus the 210px file list), narrower than the pill itself. */}
      {box.w >= 260 && (
        <ZoomPill
          className="absolute top-2 left-2"
          percent={zoom.percent}
          canZoomIn={zoom.canZoomIn}
          canZoomOut={zoom.canZoomOut}
          onZoomIn={zoom.zoomIn} onZoomOut={zoom.zoomOut} onReset={zoom.reset}
          loupe={canLoupe ? { on: loupeOn, onToggle: () => setLoupeOn((v) => !v) } : null}
        />
      )}

      {loupeOn && <Loupe resolveSource={resolveSource} displayScale={zoom.scale} vector={isSvg} />}
    </div>
  );
}
```

Also in this file:
- **Delete** `style={{ touchAction: 'pinch-zoom' }}` from the old `<img>` — it is dead code (`WebViewHost.kt:64-65` disables WebView zoom and both `index.html` copies ship `user-scalable=no`).
- Keep all state in `ImageContent`, **never** in `ImageView` — `BinaryContent.tsx:65` keys the inner child by `absolutePath`, so only state held here resets on file switch.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/image-view-zoom.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Full verify**

Run: `bash /home/destin/youcoded-dev/scripts/verify.sh $WT`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/renderer/components/artifact-views/ImageView.tsx desktop/tests/image-view-zoom.test.tsx
git commit -m "feat(artifacts): zoom, pan and hover magnifier for images and SVG"
```

---

### Task 8: One zoom pill in the app, not two

Strictly optional and strictly cosmetic. **If the refactor changes how `ZoomOverlay` looks at all, revert it and leave `ZoomOverlay` alone** — app-wide zoom chrome is not what this feature is for.

**Files:**
- Modify: `desktop/src/renderer/components/ZoomOverlay.tsx`

- [ ] **Step 1: Screenshot the current overlay**

Run `bash scripts/run-workbench.sh`, press `Ctrl+=` twice, screenshot the overlay.

- [ ] **Step 2: Swap the inner markup for `ZoomPill`**

```tsx
return (
  <ZoomPill
    className="fixed top-16 right-4"
    percent={zoomPercent}
    canZoomIn canZoomOut
    onZoomIn={onZoomIn} onZoomOut={onZoomOut} onReset={onZoomReset}
    loupe={null}
  />
);
```

`ZoomPill` uses `OverlayPanel layer={1}`; `ZoomOverlay` deliberately uses **L4** (a zoom readout must clear L2 popups at z-61). Either give `ZoomPill` a `layer` prop defaulting to 1, or abandon this task. Do not silently demote `ZoomOverlay` to L1.

- [ ] **Step 3: Compare**

Screenshot again. Any visible difference ⇒ `git checkout desktop/src/renderer/components/ZoomOverlay.tsx` and skip to Task 9.

- [ ] **Step 4: Commit (only if identical)**

```bash
git add desktop/src/renderer/components/ZoomOverlay.tsx desktop/src/renderer/components/ui/ZoomPill.tsx
git commit -m "refactor(ui): app zoom overlay renders the shared ZoomPill"
```

---

### Task 9: Sign-off gate for the image half

**Files:** none (review artifacts only)

- [ ] **Step 1: Re-run the affected UI review plans**

Run: `bash scripts/ui-review/run-review.sh $WT` (or the affected plans only). Read `coverage.md` **before** writing any finding — a surface that is not `covered` is unreviewed, never "fine".

- [ ] **Step 2: Build the review deck**

Run: `python3 scripts/ui-review/review-cards.py serve <spec>` in the background. One point per change: pill present, loupe on/off, zoomed + panned, narrow pane (pill hidden), each Before | After with the changed region boxed.

- [ ] **Step 3: Six-theme sheet**

Per design-guide checklist #7: six themes × `default`/`stress` × desktop and 390 px. Specifically inspect the pill over a **pure-white screenshot** in Meadow Mist and Halftone — a translucent pill on a white image is the known failure mode.

- [ ] **Step 4: Hand off for interactive checks**

Run `bash scripts/run-dev.sh $WT --label "Artifact Zoom"` and ask Destin to try: drag-pan, trackpad pinch over an image, pinch elsewhere (must still zoom the app), the lens over small text, and Escape while the lens is on.

- [ ] **Step 5: STOP.** Do not start Phase 2 until Destin approves the deck.

---

## Phase 2 — PDF

### Task 10: Restructure `PdfPages` (no zoom yet)

Behaviour-neutral rewrite that makes zoom possible and fixes a live bug: the in-flight `page.render()` is never cancelled, and `RenderTask.cancel()` is called nowhere in the codebase.

**Files:**
- Modify: `desktop/src/renderer/components/artifact-views/PdfView.tsx`
- Test: `desktop/tests/pdf-view-zoom.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `PdfPage` (internal), rendering one page at a given `scale` with cancellation.

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/pdf-view-zoom.test.tsx`:

```tsx
// @vitest-environment jsdom
// pdfjs cannot run in jsdom (no canvas 2D context), so the library is mocked and
// we assert the ORCHESTRATION: one render task per page, cancelled before the
// next one starts. Rendering twice into one canvas without cancel() is the
// pdf.js "Cannot use the same canvas during multiple render() operations" error.
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';

const cancel = vi.fn();
const renderFn = vi.fn(() => ({ promise: Promise.resolve(), cancel }));
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 2,
      getPage: async () => ({
        getViewport: ({ scale }: { scale: number }) => ({ width: 100 * scale, height: 200 * scale }),
        render: renderFn,
      }),
    }),
    destroy: async () => {},
  }),
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '' }));

beforeEach(() => {
  renderFn.mockClear(); cancel.mockClear();
  (window as any).claude = { artifacts: { readBinary: vi.fn(async () => ({ ok: true, base64: 'AAAA' })) } };
});
afterEach(cleanup);

describe('PdfView', () => {
  it('renders every page once at the default scale', async () => {
    const { PdfView } = await import('../src/renderer/components/artifact-views/PdfView');
    render(<PdfView path="a.pdf" absolutePath="/p/a.pdf" content={null} isEditable={false} {...({} as any)} />);
    await waitFor(() => expect(renderFn).toHaveBeenCalledTimes(2));
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/pdf-view-zoom.test.tsx`
Expected: FAIL (the current imperative loop appends canvases outside React and will not satisfy the assertions once Task 11 extends this file; if it passes as written, extend it with the Task 11 assertions first).

- [ ] **Step 3: Restructure**

Replace `PdfPages`' imperative loop with:

```tsx
function PdfPages({ bytes, scale }: { bytes: Uint8Array; scale: number }) {
  const docRef = useRef<any>(null);                 // retained: a scale change must NOT re-run getDocument
  const [numPages, setNumPages] = useState(0);
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const task = pdfjs.getDocument({ data: bytes.slice() });
    task.promise.then((pdf: any) => {
      if (cancelled) { pdf.destroy?.(); return; }
      docRef.current = pdf;
      setNumPages(pdf.numPages);
    }).catch((e: any) => { if (!cancelled) setParseError(String(e?.message ?? e)); });
    return () => { cancelled = true; task.destroy().catch(() => {}); };
  }, [bytes]);                                       // deliberately NOT [bytes, scale]

  if (parseError) return <CenterNote>Couldn’t open this PDF. It may be corrupt or password-protected.</CenterNote>;
  return (
    <div className="overflow-auto h-full p-4">
      {Array.from({ length: numPages }, (_, i) => (
        <PdfPage key={i} doc={docRef} index={i + 1} scale={scale} />
      ))}
    </div>
  );
}

function PdfPage({ doc, index, scale }: { doc: React.MutableRefObject<any>; index: number; scale: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const taskRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pdf = doc.current;
      const canvas = canvasRef.current;
      if (!pdf || !canvas) return;
      // Cancel the previous render for THIS canvas first. pdf.js throws
      // "Cannot use the same canvas during multiple render() operations"
      // otherwise — the bug the old imperative loop could not hit only because
      // it never re-rendered at all.
      taskRef.current?.cancel?.();
      const page = await pdf.getPage(index);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.maxWidth = '100%';
      canvas.style.marginBottom = '8px';
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      taskRef.current = page.render({ canvasContext: ctx, viewport, canvas });
      await taskRef.current.promise.catch(() => {});   // a cancelled render rejects; that is expected
    })();
    return () => { cancelled = true; taskRef.current?.cancel?.(); };
  }, [doc, index, scale]);

  return <canvas ref={canvasRef} />;
}
```

`PdfView` passes `scale={1.5}` for now — behaviour identical to today.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/pdf-view-zoom.test.tsx`
Expected: PASS.

- [ ] **Step 5: Look at a real PDF**

Run `bash scripts/run-dev.sh $WT --label "Artifact Zoom"`, open a multi-page PDF.
Expected: identical to before the change.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/renderer/components/artifact-views/PdfView.tsx desktop/tests/pdf-view-zoom.test.tsx
git commit -m "refactor(artifacts): React-owned PDF pages with real render cancellation"
```

---

### Task 11: PDF zoom, ceiling, and lazy pages

**Files:**
- Modify: `desktop/src/renderer/components/artifact-views/PdfView.tsx`
- Test: extend `desktop/tests/pdf-view-zoom.test.tsx`

**Interfaces:**
- Consumes: `useZoomPan` (for the ladder only — the transform is not used here), `ZoomPill`, `Loupe`.
- Produces:
  ```ts
  export const PDF_MAX_MEGAPIXELS = 16;
  export const PDF_MAX_DIMENSION = 16384;
  export function pdfScaleCeiling(pageW: number, pageH: number): number;
  ```

- [ ] **Step 1: Write the failing tests** (append to `pdf-view-zoom.test.tsx`)

```tsx
import { pdfScaleCeiling, PDF_MAX_MEGAPIXELS } from '../src/renderer/components/artifact-views/PdfView';

describe('pdfScaleCeiling', () => {
  it('caps by area', () => {
    // A 1000x1000 page: 16MP ⇒ 4000x4000 ⇒ scale 4.
    expect(pdfScaleCeiling(1000, 1000)).toBeCloseTo(4, 2);
  });
  it('caps by single dimension for a very long page', () => {
    // 100 x 20000: area would allow ~28x, but 16384/20000 < 1 wins.
    expect(pdfScaleCeiling(100, 20000)).toBeLessThan(1);
  });
});

it('re-renders visible pages at the new scale, cancelling the old task', async () => {
  const { PdfView } = await import('../src/renderer/components/artifact-views/PdfView');
  const { getByRole } = render(<PdfView path="a.pdf" absolutePath="/p/a.pdf" content={null} isEditable={false} {...({} as any)} />);
  await waitFor(() => expect(renderFn).toHaveBeenCalledTimes(2));
  renderFn.mockClear();
  fireEvent.click(getByRole('button', { name: /zoom in/i }));
  await waitFor(() => expect(cancel).toHaveBeenCalled());
  await waitFor(() => expect(renderFn).toHaveBeenCalled());
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/pdf-view-zoom.test.tsx`
Expected: FAIL — `pdfScaleCeiling` is not exported.

- [ ] **Step 3: Implement the ceiling**

```ts
/** Chrome accepts an oversized canvas, reports the requested width, paints
 *  NOTHING, and throws no exception (measured). So a pre-emptive cap is the only
 *  defense that exists — "render and catch" is not an option. */
export const PDF_MAX_MEGAPIXELS = 16;
export const PDF_MAX_DIMENSION = 16384;

export function pdfScaleCeiling(pageW: number, pageH: number): number {
  if (!(pageW > 0) || !(pageH > 0)) return 1;
  const byArea = Math.sqrt((PDF_MAX_MEGAPIXELS * 1_000_000) / (pageW * pageH));
  const byDim = Math.min(PDF_MAX_DIMENSION / pageW, PDF_MAX_DIMENSION / pageH);
  return Math.max(1, Math.min(byArea, byDim));
}
```

- [ ] **Step 4: Wire the pill, the debounce and the lazy pages**

In `PdfPages`:
- Hold `scale` from `useZoomPan`'s ladder (fit for a PDF means "page width fits the pane").
- Keep a `displayScale` (applied instantly as a CSS `transform: scale()` on each canvas) and a `renderScale` (committed after ~150 ms), so the user sees soft-then-crisp instead of a stall.
- Give `PdfPage` an `IntersectionObserver`; render only when it has been visible at least once at the current `renderScale`.
- Root gets `data-zoomable` and `className="relative overflow-auto h-full p-4"`; the pill is `absolute top-2 left-2` and is passed `canZoomIn={next <= ceiling}` with
  `zoomInDisabledReason="This page can’t be drawn any larger"`.
- `Loupe` gets a `resolveSource` that hit-tests the container's page canvases by `getBoundingClientRect` — **not** `document.elementFromPoint`, which does not exist in jsdom:

```ts
const resolveSource = useCallback((cx: number, cy: number) => {
  const root = rootRef.current;
  if (!root) return null;
  for (const el of Array.from(root.querySelectorAll('canvas'))) {
    const r = el.getBoundingClientRect();
    if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) return { el: el as HTMLCanvasElement };
  }
  return null;   // between pages: the lens hides itself
}, []);
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/pdf-view-zoom.test.tsx`
Expected: PASS.

- [ ] **Step 6: Verify + eyeball**

Run: `bash /home/destin/youcoded-dev/scripts/verify.sh $WT` → exit 0.
Then `run-dev.sh` with a text-dense PDF: `+` sharpens rather than blurs, `+` disables at the ceiling with a reason on hover, scrolling still works, the lens magnifies a page and vanishes between pages.

- [ ] **Step 7: Commit**

```bash
git add desktop/src/renderer/components/artifact-views/PdfView.tsx desktop/tests/pdf-view-zoom.test.tsx
git commit -m "feat(artifacts): PDF zoom re-renders pages crisp, with a size ceiling"
```

---

### Task 12: Close out

**Files:**
- Modify: `/home/destin/youcoded-dev/ROADMAP.md`
- Move: the spec and this plan to `docs/archive/`

- [ ] **Step 1: Full verify**

Run: `bash /home/destin/youcoded-dev/scripts/verify.sh $WT --full`
Expected: exit 0.

- [ ] **Step 2: Android build**

```bash
cd $WT/.. && ./scripts/build-web-ui.sh && ./gradlew assembleDebug && ./gradlew test
```

Install the debug APK and check on a phone: the pill appears, `+`/`−` work, two-finger pinch zooms a photo (new capability), drag pans, and **no** magnifier button is present.

- [ ] **Step 3: Second review deck**

Deck for the PDF half; Destin approves.

- [ ] **Step 4: PR, merge, push**

```bash
gh pr create --title "Artifact viewer: zoom pill + hover magnifier" --body "…"
```

- [ ] **Step 5: Archive and flip the roadmap in the SAME session as the merge**

```bash
cd /home/destin/youcoded-dev
git mv docs/active/specs/2026-08-27-artifact-zoom-loupe-design.md docs/archive/specs/
git mv docs/active/plans/2026-08-27-artifact-zoom-loupe.md docs/archive/plans/
```

- [ ] **Step 6: Clean up**

```bash
cd /home/destin/youcoded-dev/youcoded
git branch --contains <sha>          # must list master
git worktree remove ../artifact-zoom
git push origin --delete feat/artifact-zoom-loupe
git branch -D feat/artifact-zoom-loupe
```

Shut down any dev server started during the work.

---

## Spec coverage check

| Spec section | Task |
|---|---|
| Gesture ownership (Ctrl+wheel guard, Ctrl+= unchanged) | 6 |
| Escape via `useEscClose` | 7 |
| Pill: always visible, 260 px cutoff, disabled reasons, `aria-pressed`, media-query loupe gate | 4, 7 |
| Primitives (`OverlayPanel`, `Button size="icon"`, `title`) | 4 |
| Ladder incl. fit-at-100 % case | 2, 3 |
| Pan: transform-only, 4 px threshold, clamp, ResizeObserver | 2, 3, 7 |
| Loupe: rAF, destination-form draw, normalized rects, tiny-source suppression, no read-back, `resolveSource` | 5, 11 |
| Touch: pinch, drag, no loupe button, dead `touchAction` removed | 3, 7, 12 |
| State reset on file switch (state in `ImageContent`/`PdfPages`) | 7, 10 |
| PDF: restructure, cancellation, retained proxy, debounce, lazy pages, ceiling | 10, 11 |
| Workbench `readBinary` + boot-check | 1 |
| Six-theme sheet, review deck, interactive handoff | 9, 12 |
| One zoom pill in the app | 8 (conditional) |
