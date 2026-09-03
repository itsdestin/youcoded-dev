---
status: shipped
created: 2026-08-31
tags: [ui, motion, session-strip, chat-view, desktop]
spec: docs/archive/specs/2026-08-31-session-strip-and-switch-motion-design.md
---

# Session Strip and Switch Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the session strip and session switching one coherent motion language — the active pill's name expands instead of snapping, hover reveals to the name's own width, dragging moves the real pill Chrome-style with neighbours sliding aside, and switching sessions animates the incoming conversation in.

**Architecture:** Three CSS custom properties for curves and three for durations land in `globals.css` first, followed by the one timing hook both animations share; everything else consumes them. All decision logic that can be pure is extracted into small modules under `components/header/` (mirroring the existing `pack-sessions.ts`) so it is unit-testable without mounting `SessionStrip`, which has too many contexts to render cheaply. React state changes are extracted into hooks tested with `renderHook`. The component keeps only the wiring.

**Tech Stack:** React 19, TypeScript, Tailwind v4 (`globals.css`), Vitest + @testing-library/react 16, `scripts/ui-review/record-pair.sh` + `review-cards.py` for the review deck.

## Global Constraints

- **Work in a git worktree branched off `origin/master`, never bare `master`.** `git worktree add ../worktrees/session-motion -b feat/session-strip-motion origin/master`. Copy `node_modules` with `cp -al`, never a symlink or junction.
- **Never touch Destin's running built app.** Runtime checks go through `bash scripts/run-dev.sh <worktree> --label "Session Motion"` — announce before launching a window, kill it when done.
- **`bash scripts/verify.sh <worktree>` must exit 0 before any task is called done.** It runs `tsc --noEmit`, affected Vitest + all source-scanning guards, knip, eslint and the ast-grep scan.
- **Desktop only.** Android is out of scope (§9 of the spec) — no Kotlin, no Gradle.
- **Every non-trivial edit carries a WHY comment.** Destin is a non-developer and reads comments to understand the code.
- **`data-session-idx` is ADDITIVE-ONLY — never renamed, never removed.** Task 8 adds `data-session-id` beside it. The old attribute is a cross-process contract with two consumers outside the renderer, and **both fail silently**:
  - `youcoded/desktop/src/main/main.ts:1167` — the MAIN process runs `document.querySelector('[data-session-idx]')` inside a string, to measure the first pill so a torn-off window lands exactly under the cursor. `tsc` cannot see inside that string, and the code swallows a miss (`if (!pillRect) return`), so a rename would leave tear-off silently mis-positioned — the one behaviour Task 10's checklist calls out as "must be unchanged".
  - `scripts/perf-lab/scenario-workload.mjs:259,301,303` (+ its README) reads the attribute **and its numeric value** to drive the session-switch benchmark — the same benchmark Task 13 measures against.
- **Motion tokens are used only in the files this plan edits.** No sweep of unrelated call sites.
- **`steps()` timing is never replaced.** `SessionStrip.tsx` has `transition: 'opacity 150ms steps(4), background 150ms steps(4)'` and `animation: 'breathe 2s steps(8) infinite'`; both stay exactly as written and are pinned by `tests/animation-frame-budget.test.ts`. `steps()` is a frame budget, not drift — the curve ban in Task 6 is scoped to `cubic-bezier(` and never touches it.
- **All new motion is gated on `prefers-reduced-motion` AND `reducedEffects` from `useTheme()`.**
- **Token values are exact:**
  - `--ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1)`
  - `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`
  - `--ease-settle: cubic-bezier(0.28, 0.84, 0.42, 1)`
  - `--dur-hover: 150ms`
  - `--dur-reveal: 200ms`
  - `--dur-switch: 240ms`

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/renderer/styles/globals.css` | Modify (`:root` at `:1739`, `.switch-arrival`) | Motion tokens; the `.switch-arrival` rules; reduced-motion overrides |
| `src/renderer/hooks/use-one-shot-window.ts` | Create | Hook: true for one animation window after a key changes; never on mount (§5.2, §4.2) |
| `src/renderer/components/header/pill-label-style.ts` | Create | Pure: the label element's inline style for a given pill state (§5, §6) |
| `src/renderer/components/header/drag-order.ts` | Create | Pure: nearest-pill hit test by id, canonical reorder indices, neighbour slide offsets (§7) |
| `src/renderer/components/header/use-frozen-pack.ts` | Create | Hook: holds the pack result taken at pointer-down for the duration of a drag (§7.5) |
| `src/renderer/components/header/pack-sessions.ts` | Modify | Export the shared `PILL_GAP` constant |
| `src/renderer/components/SessionStrip.tsx` | Modify | Wiring only — consume the modules above, delete the ghost and insertion line |
| `src/renderer/components/ChatView.tsx` | Modify (`:74`, `:891`) | Apply the arrival class to the transcript wrapper on session switch |
| `tests/use-one-shot-window.test.tsx` | Create | `renderHook` tests for the animation window |
| `tests/pill-label-style.test.ts` | Create | Pure tests for the label style |
| `tests/drag-order.test.ts` | Create | Pure tests for drag ordering, including the overflow regression |
| `tests/use-frozen-pack.test.tsx` | Create | `renderHook` tests for the pack freeze |
| `tests/animation-frame-budget.test.ts` | Modify | Token existence and placement, `steps()` survival, no raw curves in `SessionStrip.tsx` |
| `docs/archive/design/2026-08-31-session-motion/scenes/*.json` | Create | Four clip scenes: pill expand, hover, drag, switch |
| `docs/archive/design/2026-08-31-session-motion/session-motion.json` | Create | The review deck spec |
| `scripts/ui-review/record.mjs` | Modify | Add the `drag` action verb |

**Deliberately NOT created: an ast-grep rule for hand-written curves.** An earlier draft added `scripts/ast-grep/rules/no-raw-cubic-bezier.yml`, a violation fixture and a bump to the shared `EXPECTED_VIOLATIONS` counter. Two reasons it is gone. (1) The workspace's own knowledge ladder puts *a pinning test above an ast-grep rule*, and Task 6 is already editing exactly the right test file — one line there does the same job for one file. (2) The draft rule **did not work**: verified 2026-08-31 by running it, `language: typescript` does not apply to `.tsx` files, so it fired on its `.ts` fixture and found **zero** of the six raw curves then sitting in `SessionStrip.tsx`. Both halves of `check.sh` went green and the guard was decorative — the exact silent-failure mode that script exists to prevent. If a future sweep does convert the whole renderer, the rule must be `language: tsx` with a `.tsx` fixture.

---
# Phase 1 — The motion vocabulary

### Task 1: Motion tokens in `globals.css`

**Files:**
- Modify: `youcoded/desktop/src/renderer/styles/globals.css:1739`
- Test: `youcoded/desktop/tests/animation-frame-budget.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: six CSS custom properties available to every later task — `--ease-bounce`, `--ease-out`, `--ease-settle`, `--dur-hover`, `--dur-reveal`, `--dur-switch`.

- [ ] **Step 1: Write the failing test**

Append this `describe` block to the end of `youcoded/desktop/tests/animation-frame-budget.test.ts`:

```ts
// The motion vocabulary (2026-08-31 spec §3). These are source-text assertions
// for the same reason the rest of this file is: nothing breaks visually when a
// token drifts back to a hand-written curve, the app just quietly grows a sixth
// bespoke easing again.
describe('motion vocabulary', () => {
  const globals = read('styles', 'globals.css');

  it('defines three curves, reusing values the app already had', () => {
    expect(globals).toMatch(/--ease-bounce:\s*cubic-bezier\(0\.34,\s*1\.56,\s*0\.64,\s*1\)/);
    expect(globals).toMatch(/--ease-out:\s*cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/);
    expect(globals).toMatch(/--ease-settle:\s*cubic-bezier\(0\.28,\s*0\.84,\s*0\.42,\s*1\)/);
  });

  it('defines three durations matching the design guide', () => {
    expect(globals).toMatch(/--dur-hover:\s*150ms/);
    expect(globals).toMatch(/--dur-reveal:\s*200ms/);
    expect(globals).toMatch(/--dur-switch:\s*240ms/);
  });

  it('puts them in the theme-independent :root block', () => {
    // They must NOT live in any `[data-theme=...]` palette block — a community
    // theme that redefines only colours would otherwise drop the app's motion.
    //
    // WHY sliced this way: an earlier draft of this test cut the file at
    // Tailwind's `@theme` (:281) and asserted the tokens were not above it.
    // EVERY palette block is above it (`[data-theme="light"], :root` is at :14),
    // so that assertion was true no matter where the tokens landed — including
    // inside a palette block further down, which is the one thing it claimed
    // to prevent. Assert the real shape instead: present in a bare `:root`,
    // absent from every themed block.
    expect(globals).toMatch(/(^|\n):root \{[^}]*--ease-bounce/);
    for (const block of globals.split(/\[data-theme=/).slice(1)) {
      expect(block.slice(0, block.indexOf('}'))).not.toMatch(/--ease-bounce|--dur-hover/);
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd youcoded/desktop && npx vitest run tests/animation-frame-budget.test.ts -t 'motion vocabulary'
```

Expected: 3 failures, all of the form `expected '…' to match /--ease-bounce:…/`.

- [ ] **Step 3: Add the tokens**

In `youcoded/desktop/src/renderer/styles/globals.css`, inside the existing theme-independent `:root {` block that begins at line 1739 with `--frame-edge: 10px;`, insert immediately after `--frame-edge` / `--frame-corner`:

```css
  /* ── Motion vocabulary (2026-08-31) ────────────────────────────────
     Three curves and three durations, so related motion in the session
     strip and on session switch reads as one decision instead of six.
     All three curve VALUES already existed inline elsewhere in the app —
     this is a rename, not a new look.

     Deliberately in this theme-independent :root block, NOT in the
     `[data-theme=...]` palette blocks above: a community theme that only
     redefines colors must not be able to accidentally drop the app's motion.

     These are for TRANSIENT, gesture-triggered motion only (a click, a
     hover-in, a session switch). Anything that animates perpetually keeps
     steps() timing — see the frame-budget note at the top of this file and
     tests/animation-frame-budget.test.ts. */
  --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);  /* overshoot — pill expand, hover */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);         /* decelerate — neighbours sliding */
  --ease-settle: cubic-bezier(0.28, 0.84, 0.42, 1);  /* gentle stop — drag release */
  --dur-hover: 150ms;
  --dur-reveal: 200ms;
  --dur-switch: 240ms;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd youcoded/desktop && npx vitest run tests/animation-frame-budget.test.ts
```

Expected: PASS, all tests in the file green (the pre-existing `steps()` assertions included).

- [ ] **Step 5: Commit**

```bash
git add youcoded/desktop/src/renderer/styles/globals.css youcoded/desktop/tests/animation-frame-budget.test.ts
git commit -m "feat(motion): three curves and three durations as tokens

All three curve values already existed inline in the renderer; this names
them so the session-strip work stops inventing a seventh."
```

---

### Task 2: The one-shot animation window

Two places in this plan need the same thing: *be true for one animation window
after something changes, and never on first render.* The pill needs it so a
click can override the transition kill-switch (Task 4); the transcript needs it
so switching sessions animates the arriving conversation (Task 11). An earlier
draft built two near-identical hooks with two test files and two copies of the
same `240`. One hook, built first, and both call sites become one line.

**Files:**
- Create: `youcoded/desktop/src/renderer/hooks/use-one-shot-window.ts`
- Test: `youcoded/desktop/tests/use-one-shot-window.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export const MOTION_WINDOW_MS = 240;
  export function useOneShotWindow(key: unknown, durationMs?: number): boolean;
  ```

- [ ] **Step 1: Write the failing test**

Create `youcoded/desktop/tests/use-one-shot-window.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOneShotWindow } from '../src/renderer/hooks/use-one-shot-window';

describe('useOneShotWindow', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('does NOT open on first mount', () => {
    // At app start the active session's pill and pane render immediately.
    // Firing there would make every cold launch look like a switch that
    // never happened.
    const { result } = renderHook(() => useOneShotWindow('session-a'));
    expect(result.current).toBe(false);
  });

  it('opens when the key changes', () => {
    const { result, rerender } = renderHook(({ k }) => useOneShotWindow(k), {
      initialProps: { k: 'session-a' },
    });
    rerender({ k: 'session-b' });
    expect(result.current).toBe(true);
  });

  it('closes itself after the window', () => {
    const { result, rerender } = renderHook(({ k }) => useOneShotWindow(k, 240), {
      initialProps: { k: 'session-a' },
    });
    rerender({ k: 'session-b' });
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).toBe(false);
  });

  it('re-opens on a second change, restarting the clock', () => {
    const { result, rerender } = renderHook(({ k }) => useOneShotWindow(k, 240), {
      initialProps: { k: 'a' },
    });
    rerender({ k: 'b' });
    act(() => { vi.advanceTimersByTime(200); });
    rerender({ k: 'c' });
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current).toBe(true);   // the first timer was cleared, not left to fire
  });

  it('opens in BOTH directions — one-way callers AND the result', () => {
    // ChatView must animate a pane arriving and NOT one leaving. The hook does
    // not know about directions; the call site says which one it wants by
    // ANDing in the state it cares about. This test pins that pattern, because
    // it is the whole reason one hook can serve both call sites.
    const { result, rerender } = renderHook(
      ({ a }) => useOneShotWindow(a) && a,
      { initialProps: { a: true } },
    );
    rerender({ a: false });
    expect(result.current).toBe(false);   // window opened, guard says no
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd youcoded/desktop && npx vitest run tests/use-one-shot-window.test.tsx
```

Expected: FAIL — `Failed to resolve import ".../hooks/use-one-shot-window"`.

- [ ] **Step 3: Write the implementation**

Create `youcoded/desktop/src/renderer/hooks/use-one-shot-window.ts`:

```ts
// True for one animation window after `key` changes — and never on mount.
//
// Two callers, one shape:
//   • SessionStrip arms the active pill's expand animation when the active
//     session id changes (its label transition is otherwise switched off).
//   • ChatView animates the incoming conversation when its pane becomes the
//     active session.
//
// WHY never on mount: at app start the active session's pill and pane render
// immediately. Firing there would make every cold launch look like a session
// switch that never happened.
//
// WHY no direction option: the hook opens on ANY change of `key`, both ways. A
// caller that wants one direction ANDs in the state it cares about —
// `useOneShotWindow(sessionActive) && sessionActive` is true only on the way
// IN, because on the way OUT the window opens while `sessionActive` is false.
// That is one word at the call site, versus a `direction: 'rising'` option
// nobody could read at a glance.
import { useEffect, useRef, useState } from 'react';

/** 200ms reveal / 240ms switch, plus a frame of slack — one number, because the
 *  strip and the transcript are meant to read as one decision, not two. */
export const MOTION_WINDOW_MS = 240;

export function useOneShotWindow(key: unknown, durationMs = MOTION_WINDOW_MS): boolean {
  const [open, setOpen] = useState(false);
  const prev = useRef(key);

  useEffect(() => {
    // Unchanged key: return WITHOUT a cleanup, so a window already counting
    // down is left alone rather than cancelled by an unrelated re-render.
    if (prev.current === key) return;
    prev.current = key;
    setOpen(true);
    const t = setTimeout(() => setOpen(false), durationMs);
    return () => clearTimeout(t);
  }, [key, durationMs]);

  return open;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd youcoded/desktop && npx vitest run tests/use-one-shot-window.test.tsx
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add youcoded/desktop/src/renderer/hooks/use-one-shot-window.ts youcoded/desktop/tests/use-one-shot-window.test.tsx
git commit -m "feat(motion): one hook for the short window after a change

The pill's expand and the transcript's arrival are the same shape. One
hook, one duration, and the call site says which direction it wants."
```

---

# Phase 2 — The pill: expanding and hover

### Task 3: Pure label-style module

The label's inline style has two independent bugs (spec §5.1): `maxWidth` is `undefined` for the active pill so nothing interpolates, and the transition is switched off for exactly the pill that was just clicked. Both live in one expression, so extracting that expression makes both testable.

**Files:**
- Create: `youcoded/desktop/src/renderer/components/header/pill-label-style.ts`
- Test: `youcoded/desktop/tests/pill-label-style.test.ts`

**Interfaces:**
- Consumes: the motion tokens from Task 1 (by name, inside a string).
- Produces:
  ```ts
  export const HOVER_CAP_PX = 120;
  export interface LabelStyleInput {
    showName: boolean;
    isActive: boolean;
    packExpanded: boolean;
    animateExpand: boolean;
  }
  export function pillLabelStyle(input: LabelStyleInput): React.CSSProperties;
  ```

- [ ] **Step 1: Write the failing test**

Create `youcoded/desktop/tests/pill-label-style.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pillLabelStyle, HOVER_CAP_PX } from '../src/renderer/components/header/pill-label-style';

const base = { showName: false, isActive: false, packExpanded: false, animateExpand: false };

describe('pillLabelStyle', () => {
  it('collapses to zero width when the name is hidden', () => {
    const s = pillLabelStyle(base);
    expect(s.width).toBe('0px');
    expect(s.opacity).toBe(0);
  });

  it('reveals a non-active pill to its OWN width, capped', () => {
    // The 2026-08-31 bug: the old code animated to a flat 120px, so a short
    // name reached full size early and then sat still while the transition
    // kept running. calc-size() interpolates to the label's real width.
    const s = pillLabelStyle({ ...base, showName: true });
    expect(s.width).toBe(`calc-size(max-content, min(size, ${HOVER_CAP_PX}px))`);
  });

  it('reveals the active pill uncapped so it can hold a long name', () => {
    const s = pillLabelStyle({ ...base, showName: true, isActive: true });
    expect(s.width).toBe('calc-size(max-content, size)');
  });

  it('animates on the vocabulary, not two different curves', () => {
    const s = pillLabelStyle({ ...base, showName: true });
    expect(s.transition).toBe(
      'width var(--dur-reveal) var(--ease-bounce), opacity var(--dur-hover) var(--ease-bounce)',
    );
  });

  it('kills the transition for a pack-expanded pill (repack churn)', () => {
    // The `none` exists so pills do not slide around every time the packer
    // runs. It stays.
    const s = pillLabelStyle({ ...base, showName: true, packExpanded: true });
    expect(s.transition).toBe('none');
  });

  it('overrides that kill-switch inside the armed window after a click', () => {
    // packSessions guarantees the ACTIVE pill is always pack-expanded, so
    // without this override the transition is off for exactly the pill the
    // user just clicked — cause #2 of the snap.
    const s = pillLabelStyle({
      ...base, showName: true, isActive: true, packExpanded: true, animateExpand: true,
    });
    expect(s.transition).toContain('width var(--dur-reveal) var(--ease-bounce)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd youcoded/desktop && npx vitest run tests/pill-label-style.test.ts
```

Expected: FAIL — `Failed to resolve import ".../header/pill-label-style"`.

- [ ] **Step 3: Write the implementation**

Create `youcoded/desktop/src/renderer/components/header/pill-label-style.ts`:

```ts
// The session pill's name label: how wide it is and how it gets there.
//
// Extracted from SessionStrip.tsx (was inline at :892-896) because the two
// causes of the 2026-08-31 "active pill snaps open" bug both lived in this one
// expression and neither was reachable by a test while it sat in JSX.
//
// WHY calc-size(): a plain `max-width: 0 -> 120px` transition gives every name
// the same travel distance regardless of how long it is, so a short name
// reaches its real size early and then sits still. calc-size() lets the
// browser interpolate to the label's INTRINSIC width, which `max-width` cannot
// do without imposing a hard cap. calc-size() needs Chromium 129; this app
// runs Electron 41.10.3, comfortably past it (the exact Chromium number is not
// worth pinning here — it moves every release and only the floor matters).
// If it ever has to be reverted, the fallback is animating
// `grid-template-columns: 0fr -> 1fr` on a wrapper element (one extra DOM node
// per pill, and the grid item needs `min-width: 0` or 0fr clamps to min-content).
import type React from 'react';

/** How wide a NON-active pill's name may get on hover. The active pill is
 *  uncapped: it flex-shrinks and ellipsises only when the strip itself runs
 *  out of room, which is what makes the active session's name worth showing. */
export const HOVER_CAP_PX = 120;

export interface LabelStyleInput {
  /** The name is meant to be visible at all (hovered, pack-expanded, or active). */
  showName: boolean;
  isActive: boolean;
  /** `pack.expanded.has(id)` — the packer decided this pill shows its name. */
  packExpanded: boolean;
  /** True only inside the short window armed by a change of active session id. */
  animateExpand: boolean;
}

const REVEAL_TRANSITION =
  'width var(--dur-reveal) var(--ease-bounce), opacity var(--dur-hover) var(--ease-bounce)';

export function pillLabelStyle(input: LabelStyleInput): React.CSSProperties {
  const { showName, isActive, packExpanded, animateExpand } = input;

  const width = !showName
    ? '0px'
    : isActive
      ? 'calc-size(max-content, size)'
      : `calc-size(max-content, min(size, ${HOVER_CAP_PX}px))`;

  // `none` suppresses repack churn — without it every pill slides whenever the
  // packer reruns. But packSessions guarantees the active pill is ALWAYS
  // pack-expanded, so this same `none` silences the one pill the user just
  // clicked. The armed window is the narrow exception.
  const transition = packExpanded && !animateExpand ? 'none' : REVEAL_TRANSITION;

  return { width, opacity: showName ? 1 : 0, transition };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd youcoded/desktop && npx vitest run tests/pill-label-style.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add youcoded/desktop/src/renderer/components/header/pill-label-style.ts youcoded/desktop/tests/pill-label-style.test.ts
git commit -m "feat(strip): pure module for the pill label's width and transition"
```

---

### Task 4: Wire the label style into `SessionStrip`, with the armed window

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/SessionStrip.tsx:886-901` (the label `<span>`), plus one line near the pack state
- Test: `youcoded/desktop/tests/animation-frame-budget.test.ts`

**Interfaces:**
- Consumes: `pillLabelStyle` from Task 3, `useOneShotWindow` from Task 2.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing test**

Add to the `motion vocabulary` describe block created in Task 1:

```ts
  it('routes the session pill label through pillLabelStyle', () => {
    const strip = read('components', 'SessionStrip.tsx');
    expect(strip).toMatch(/pillLabelStyle\(/);
    // The old inline style is gone — both halves of it.
    expect(strip).not.toMatch(/maxWidth:\s*showName/);
    expect(strip).not.toMatch(/'max-width 200ms ease, opacity 150ms ease'/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd youcoded/desktop && npx vitest run tests/animation-frame-budget.test.ts -t 'routes the session pill label'
```

Expected: FAIL — `expected '…' to match /pillLabelStyle\(/`.

- [ ] **Step 3: Implement**

3a. Add the imports beside the existing `pack-sessions` import at the top of `SessionStrip.tsx`:

```ts
import { pillLabelStyle } from './header/pill-label-style';
import { useOneShotWindow } from '../hooks/use-one-shot-window';
```

3b. Add the armed window immediately after the `const [pack, setPack] = ...`
declaration (`SessionStrip.tsx:750` — search for `setPack(result)` to find the
surrounding block):

```tsx
  // Fix (active pill snapped open): packSessions always marks the active pill
  // expanded, and the label's `transition: 'none'` — which exists to stop pills
  // sliding on every repack — therefore silenced exactly the pill the user just
  // clicked. Open a short window on a change of active session id, during which
  // that `none` is overridden. Nothing else opens it, so repack churn stays as
  // still as it is today.
  const expandArmed = useOneShotWindow(activeSessionId);
```

3c. Replace the label `<span>`'s `style` prop. The current block is:

```tsx
                  style={{
                    // Active pill flex-shrinks so ellipsis kicks in when the
                    // strip is narrower than the full name (no hard cap).
                    maxWidth: showName
                      ? (isActive ? undefined : 120)
                      : 0,
                    opacity: showName ? 1 : 0,
                    transition: pack.expanded.has(s.id) ? 'none' : 'max-width 200ms ease, opacity 150ms ease',
                  }}
```

Replace it with:

```tsx
                  style={pillLabelStyle({
                    showName,
                    isActive,
                    packExpanded: pack.expanded.has(s.id),
                    // Only the pill that just became active is allowed through
                    // the repack-churn kill-switch.
                    animateExpand: expandArmed && isActive,
                  })}
```

3d. The active pill's ellipsis depends on it being able to shrink below its
`width`. The `<span>` already carries `overflow-hidden text-ellipsis` and
`${isActive ? 'min-w-0' : ''}`. Leave that className exactly as it is.

- [ ] **Step 4: Run tests and typecheck**

```bash
cd youcoded/desktop && npx vitest run tests/animation-frame-budget.test.ts && npx tsc --noEmit
```

Expected: PASS on both.

- [ ] **Step 5: Look at it in the dev window**

Announce to Destin first — this paints a real window on his desktop.

```bash
cd /home/destin/youcoded-dev && bash scripts/run-dev.sh session-motion --label "Session Motion"
```

Check three things, then close the window:
1. Clicking between two sessions: the newly-active pill's name grows open instead of appearing at full size.
2. A session with a very long name, with the window narrowed until the strip is tight: the active pill still ellipsises rather than pushing the strip wide.
3. Hovering a collapsed dot: the name grows to its own length; a short name stops when it is done, a long one stops at 120px.

If (1) or (3) snap rather than animate, `calc-size()` is not interpolating — fall back to the `grid-template-columns: 0fr -> 1fr` wrapper documented in `pill-label-style.ts`'s header comment before continuing.

- [ ] **Step 6: Commit**

```bash
git add youcoded/desktop/src/renderer/components/SessionStrip.tsx youcoded/desktop/tests/animation-frame-budget.test.ts
git commit -m "fix(strip): the active pill's name expands instead of snapping

Two independent causes, both had to go: maxWidth was undefined for the
active pill so there was no numeric pair to interpolate, and the label's
transition was switched off for every pack-expanded pill — which the
packer guarantees the active pill always is."
```

---

### Task 5: A pill collapsed under a stationary cursor never reveals

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/SessionStrip.tsx:852-853`
- Test: `youcoded/desktop/tests/animation-frame-budget.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

The hover handlers are attached only to pills the packer has *not* expanded. If a repack turns a pill into a dot while the cursor is already sitting on it, `mouseenter` has already fired and will not fire again — the pill stays a dot until the user moves off and back on.

- [ ] **Step 1: Write the failing test**

Add to the `motion vocabulary` describe block:

```ts
  it('attaches pill hover handlers unconditionally', () => {
    // Fix: attaching them only to non-pack-expanded pills means a pill the
    // packer collapses UNDER a stationary cursor never gets its mouseenter,
    // so it stays a dot until the user moves off and back on. Gate inside the
    // handler instead, where the current pack state is read at event time.
    const strip = read('components', 'SessionStrip.tsx');
    expect(strip).not.toMatch(/onMouseEnter=\{pack\.expanded\.has\(s\.id\)\s*\?\s*undefined/);
    expect(strip).not.toMatch(/onMouseLeave=\{pack\.expanded\.has\(s\.id\)\s*\?\s*undefined/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd youcoded/desktop && npx vitest run tests/animation-frame-budget.test.ts -t 'attaches pill hover handlers'
```

Expected: FAIL on the first `expect`.

- [ ] **Step 3: Implement**

Replace lines 852-853 of `SessionStrip.tsx`:

```tsx
                onMouseEnter={pack.expanded.has(s.id) ? undefined : () => handleEnter(s.id)}
                onMouseLeave={pack.expanded.has(s.id) ? undefined : handleLeave}
```

with:

```tsx
                // Fix: these used to be `undefined` for pack-expanded pills.
                // A pill the packer collapsed to a dot while the cursor was
                // already on it therefore never received a mouseenter and sat
                // as a dot until the user moved away and back. Always attach;
                // decide inside, where pack state is read at event time.
                onMouseEnter={() => handleEnter(s.id)}
                onMouseLeave={handleLeave}
```

Then change `handleEnter` so it is a no-op for a pill that is already showing its name. Find `const handleEnter = ` and make its body begin:

```ts
    // A pack-expanded pill already shows its name — there is nothing to
    // reveal, and setting hoveredId would only cost a render.
    if (packRef.current.expanded.has(id)) return;
```

Add the ref that backs it beside the `pack` state (a ref, not the state value, so `handleEnter` does not need `pack` in its dependency list and stays stable across repacks):

```ts
  // Mirror of `pack` for event handlers — they must read the CURRENT pack at
  // event time, not the one captured when the callback was created.
  const packRef = useRef(pack);
  useEffect(() => { packRef.current = pack; }, [pack]);
```

- [ ] **Step 4: Run tests and typecheck**

```bash
cd youcoded/desktop && npx vitest run tests/animation-frame-budget.test.ts && npx tsc --noEmit
```

Expected: PASS on both.

- [ ] **Step 5: Commit**

```bash
git add youcoded/desktop/src/renderer/components/SessionStrip.tsx youcoded/desktop/tests/animation-frame-budget.test.ts
git commit -m "fix(strip): a pill collapsed under a stationary cursor now reveals

The hover handlers were attached only to pills the packer had not
expanded, so a pill that became a dot while the cursor was already on it
never got its mouseenter."
```

---

### Task 6: Convert `SessionStrip`'s curves to the vocabulary

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/SessionStrip.tsx:879`, `:970`, `:1261`
- Test: `youcoded/desktop/tests/animation-frame-budget.test.ts`

**Interfaces:**
- Consumes: the tokens from Task 1.
- Produces: nothing.

Measured 2026-08-31 (`rg -o 'cubic-bezier\([^)]*\)' src/renderer | sort | uniq -c`):
the renderer holds **five** distinct curves, three of them the same overshoot
with drifted numbers — `1.56`, `1.5`, `1.62` — because every new transition was
typed out by hand. This task converts the three in `SessionStrip.tsx` and pins
the file so a sixth cannot appear there.

- [ ] **Step 1: Write the failing test**

Add to the `motion vocabulary` describe block:

```ts
  it('leaves no hand-written curve in SessionStrip', () => {
    // Five distinct curves accumulated in the renderer, three of them the same
    // overshoot with drifted numbers, because each was typed out by hand.
    // Scoped to the one file this plan converts — the rest of the app is a
    // separate cleanup with its own before/after deck.
    //
    // This bans hand-written CURVES, not hand-written timing functions:
    // `steps()` is the frame budget and is required, and the assertions at the
    // top of this file pin the two `steps()` sites in this same file.
    expect(read('components', 'SessionStrip.tsx')).not.toMatch(/cubic-bezier\(/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd youcoded/desktop && npx vitest run tests/animation-frame-budget.test.ts -t 'leaves no hand-written curve'
```

Expected: FAIL — the file still contains three of them.

- [ ] **Step 3: Convert all three**

3a. The pill transition at `:879`:

```tsx
                    : 'transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1), border-color 150ms cubic-bezier(0.34, 1.56, 0.64, 1), background-color 150ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 150ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 150ms cubic-bezier(0.34, 1.56, 0.64, 1)',
```

becomes:

```tsx
                    : 'transform var(--dur-hover) var(--ease-bounce), border-color var(--dur-hover) var(--ease-bounce), background-color var(--dur-hover) var(--ease-bounce), box-shadow var(--dur-hover) var(--ease-bounce), opacity var(--dur-hover) var(--ease-bounce)',
```

3b. The session dropdown's open animation at `:970` — this is the third curve,
and its value already IS `--ease-out`:

```tsx
              animation: 'dropdown-in 120ms cubic-bezier(0.16, 1, 0.3, 1) both',
```

becomes:

```tsx
              animation: 'dropdown-in 120ms var(--ease-out) both',
```

3c. The insertion indicator at `:1261` is deleted wholesale in Task 10. Until
then, convert only the curve — leave `top 120ms ease` alone, since `ease` is not
a hand-written curve and changing it would alter the feel of a block that is
about to disappear anyway:

```tsx
            transition: 'left 120ms var(--ease-bounce), top 120ms ease',
```

3d. Leave `:98` (`'breathe 2s steps(8) infinite'`) and `:1014`
(`'opacity 150ms steps(4), background 150ms steps(4)'`) **exactly as they are**.
They are `steps()`, not curves, and the frame-budget assertions pin them.

- [ ] **Step 4: Run the suite**

```bash
cd youcoded/desktop && npx vitest run tests/animation-frame-budget.test.ts
```

Expected: PASS — including the pre-existing `steps()` assertions, which this
task must not disturb.

- [ ] **Step 5: Commit**

```bash
git add youcoded/desktop/src/renderer/components/SessionStrip.tsx youcoded/desktop/tests/animation-frame-budget.test.ts
git commit -m "feat(motion): SessionStrip uses the vocabulary, not hand-written curves

Three raw cubic-beziers converted and the file pinned against a fourth.
steps() is explicitly still allowed — it is the frame budget, not drift."
```

---

# Phase 3 — Drag

### Task 7: Pure drag-order module (the correctness fix)

`dragIdx` is resolved against the **full** `sessions` array (`SessionStrip.tsx:492`, deliberately), but `data-session-idx` on each pill is its index into the **visible** subset (`:847`). `visibleSessions` (`:813`) drops everything in `packSessions`' `overflow` bucket — that is what the "+N" chip at `:920` counts — so the two index spaces diverge the moment the strip runs out of room. `onReorderSessions(releasedDragIdx, releasedOverIdx)` then gets a canonical "from" and a visible "to", and `App.tsx:2930` splices into the wrong slot.

**Files:**
- Create: `youcoded/desktop/src/renderer/components/header/drag-order.ts`
- Modify: `youcoded/desktop/src/renderer/components/header/pack-sessions.ts` (export `PILL_GAP`)
- Test: `youcoded/desktop/tests/drag-order.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export const PILL_GAP: number;                    // re-exported from pack-sessions
  export interface PillRect { id: string; left: number; right: number; }
  export function nearestPillId(rects: readonly PillRect[], clientX: number, draggedId: string): string | null;
  export function reorderIndices(sessionIds: readonly string[], fromId: string, toId: string): { from: number; to: number } | null;
  export function neighbourOffsets(rects: readonly PillRect[], draggedId: string, overId: string | null, gap?: number): Map<string, number>;
  ```

- [ ] **Step 1: Write the failing test**

Create `youcoded/desktop/tests/drag-order.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { nearestPillId, reorderIndices, neighbourOffsets } from '../src/renderer/components/header/drag-order';

// Three 100px pills with a 2px gap: a=[0,100] b=[102,202] c=[204,304]
const rects = [
  { id: 'a', left: 0, right: 100 },
  { id: 'b', left: 102, right: 202 },
  { id: 'c', left: 204, right: 304 },
];

describe('nearestPillId', () => {
  it('picks the pill whose centre is closest to the cursor', () => {
    expect(nearestPillId(rects, 250, 'a')).toBe('c');
    expect(nearestPillId(rects, 150, 'a')).toBe('b');
  });

  it('never picks the pill being dragged', () => {
    // Cursor is dead on b's centre, but b is the one in hand.
    expect(nearestPillId(rects, 152, 'b')).not.toBe('b');
  });

  it('returns null when the dragged pill is the only one', () => {
    expect(nearestPillId([rects[0]], 50, 'a')).toBeNull();
  });
});

describe('reorderIndices', () => {
  it('resolves both ends against the FULL session list', () => {
    expect(reorderIndices(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual({ from: 0, to: 2 });
  });

  it('stays correct when pills are missing from the strip (overflow)', () => {
    // THE REGRESSION. The strip shows a, c, d — b is in the "+1" overflow
    // bucket. Dropping a onto d is canonical (0 -> 3). The old code passed a
    // canonical "from" and a VISIBLE "to" (0 -> 2), which App.tsx spliced into
    // the wrong slot. Ids cannot desync.
    const all = ['a', 'b', 'c', 'd'];
    expect(reorderIndices(all, 'a', 'd')).toEqual({ from: 0, to: 3 });
  });

  it('returns null for an id that is not in the list', () => {
    expect(reorderIndices(['a', 'b'], 'a', 'zz')).toBeNull();
  });
});

describe('neighbourOffsets', () => {
  it('slides the pills between source and target LEFT when dragging right', () => {
    // a (100 wide) heads for c's slot: b and c step left by 100 + 2.
    const o = neighbourOffsets(rects, 'a', 'c', 2);
    expect(o.get('b')).toBe(-102);
    expect(o.get('c')).toBe(-102);
    expect(o.get('a')).toBeUndefined(); // the dragged pill is positioned by the cursor
  });

  it('slides them RIGHT when dragging left', () => {
    const o = neighbourOffsets(rects, 'c', 'a', 2);
    expect(o.get('a')).toBe(102);
    expect(o.get('b')).toBe(102);
  });

  it('moves nothing when there is no target', () => {
    expect(neighbourOffsets(rects, 'a', null, 2).size).toBe(0);
  });

  it('moves nothing when the target is the dragged pill itself', () => {
    expect(neighbourOffsets(rects, 'b', 'b', 2).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd youcoded/desktop && npx vitest run tests/drag-order.test.ts
```

Expected: FAIL — `Failed to resolve import ".../header/drag-order"`.

- [ ] **Step 3: Write the implementation**

3a. In `youcoded/desktop/src/renderer/components/header/pack-sessions.ts`, add near the top (after the interfaces):

```ts
/** Horizontal gap between pills, in CSS px. Matches `gap-0.5` on the strip.
 *  Shared with drag-order.ts so the two cannot drift apart. */
export const PILL_GAP = 2;
```

and change the `packSessions` call site in `SessionStrip.tsx:791` from `gap: 2, // matches gap-0.5 on the strip` to `gap: PILL_GAP,`, importing it alongside `packSessions`.

3b. Create `youcoded/desktop/src/renderer/components/header/drag-order.ts`:

```ts
// Where a dragged session pill lands, and how the pills around it get out of
// the way. Pure so it can be tested without mounting SessionStrip.
//
// EVERYTHING HERE IS KEYED BY SESSION ID, NEVER BY INDEX. That is the whole
// point of the module. The strip used to mix two index spaces: `dragIdx` was
// resolved against the FULL sessions array, while each pill's data attribute
// carried its index into the VISIBLE subset. Those agree only while every
// session fits — the moment packSessions pushes one into its `overflow`
// bucket (the "+N" chip), they diverge, and onReorderSessions was called with
// a canonical "from" and a visible "to". App.tsx spliced into the wrong slot.
// Ids are unique (pack-sessions.ts: "Caller guarantees session ids are unique")
// so no index space can drift out from under them again.
import { PILL_GAP } from './pack-sessions';

export { PILL_GAP };

/** One pill's horizontal extent, in client coordinates. */
export interface PillRect {
  id: string;
  left: number;
  right: number;
}

/** The pill whose horizontal centre is nearest the cursor, excluding the one
 *  in hand. Y is deliberately ignored: the pickup range is the full height of
 *  the window so a slightly-low drag still reorders instead of doing nothing. */
export function nearestPillId(
  rects: readonly PillRect[],
  clientX: number,
  draggedId: string,
): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const r of rects) {
    if (r.id === draggedId) continue;
    const dist = Math.abs(clientX - (r.left + r.right) / 2);
    if (dist < bestDist) {
      bestDist = dist;
      best = r.id;
    }
  }
  return best;
}

/** Canonical from/to for `onReorderSessions`, which splices into the full
 *  sessions array. Null when either id is unknown — a session can close
 *  mid-drag, and reordering against a stale list is worse than not reordering. */
export function reorderIndices(
  sessionIds: readonly string[],
  fromId: string,
  toId: string,
): { from: number; to: number } | null {
  const from = sessionIds.indexOf(fromId);
  const to = sessionIds.indexOf(toId);
  if (from === -1 || to === -1) return null;
  return { from, to };
}

/** How far each pill slides to open the gap the dragged pill is heading for,
 *  in CSS px (negative = left). The dragged pill is absent from the map: it is
 *  positioned by the cursor, not by this.
 *
 *  Chrome's model: every tab between the dragged tab's origin and its target
 *  steps over by exactly one tab-width, so the row never changes total width
 *  and the gap IS the insertion indicator. */
export function neighbourOffsets(
  rects: readonly PillRect[],
  draggedId: string,
  overId: string | null,
  gap: number = PILL_GAP,
): Map<string, number> {
  const out = new Map<string, number>();
  if (overId === null || overId === draggedId) return out;

  const from = rects.findIndex(r => r.id === draggedId);
  const to = rects.findIndex(r => r.id === overId);
  if (from === -1 || to === -1) return out;

  const dragged = rects[from];
  const shift = dragged.right - dragged.left + gap;

  if (to > from) {
    // Dragging right: everything from just after the origin through the target
    // steps LEFT into the space the dragged pill vacated.
    for (let i = from + 1; i <= to; i++) out.set(rects[i].id, -shift);
  } else {
    for (let i = to; i < from; i++) out.set(rects[i].id, shift);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd youcoded/desktop && npx vitest run tests/drag-order.test.ts tests/pack-sessions.test.ts && npx tsc --noEmit
```

Expected: PASS — 10 new tests plus the 9 existing `packSessions` cases.

- [ ] **Step 5: Commit**

```bash
git add youcoded/desktop/src/renderer/components/header/drag-order.ts youcoded/desktop/src/renderer/components/header/pack-sessions.ts youcoded/desktop/src/renderer/components/SessionStrip.tsx youcoded/desktop/tests/drag-order.test.ts
git commit -m "feat(strip): id-keyed drag ordering, replacing two index spaces

The strip mixed a full-list index with a visible-list index; they agree
only while every session fits on screen. Once one overflows into the +N
chip, drops landed in the wrong slot."
```

---

### Task 8: Move `SessionStrip`'s drag state onto ids

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/SessionStrip.tsx` — state block `:284-289`, `handlePointerDown` `:486-509`, `handlePointerMove` `:519-644`, `handlePointerUp` `:645-740`, the pill `data-` attributes `:847` and `:994`, `isBeingDragged` `:842` and `:990`
- Test: `youcoded/desktop/tests/animation-frame-budget.test.ts`

**Interfaces:**
- Consumes: `nearestPillId`, `reorderIndices`, `PillRect` from Task 7.
- Produces: `dragId` / `overId` state and a frozen `pillRectsRef` that Tasks 9 and 10 read.

Two symptoms, one cause. `dragIdx` is resolved against the **full** `sessions`
array while each pill's `idx` is its index into the **visible** subset, so once
anything overflows into the "+N" chip: (1) the drop lands in the wrong slot, and
(2) `isBeingDragged` at `:842` dims the **wrong pill** for the whole drag.

- [ ] **Step 1: Write the failing test**

Add to the `motion vocabulary` describe block:

```ts
  it('keys drag state by session id, never by index', () => {
    // See drag-order.ts's header for why. A single surviving `sessions[dragIdx]`
    // puts the two index spaces back in the same code.
    //
    // NOTE the attribute is checked as PRESENT, not as gone: `data-session-idx`
    // stays. It is read from outside the renderer by main.ts (torn-off window
    // placement) and by the perf lab, both of which fail silently on a rename.
    const strip = read('components', 'SessionStrip.tsx');
    expect(strip).toMatch(/data-session-id=\{s\.id\}/);
    expect(strip).toMatch(/data-session-idx=\{idx\}/);
    expect(strip).not.toMatch(/\bdragIdx\b/);
    expect(strip).not.toMatch(/\boverIdx\b/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd youcoded/desktop && npx vitest run tests/animation-frame-budget.test.ts -t 'keys drag state by session id'
```

Expected: FAIL on `data-session-id`.

- [ ] **Step 3: Implement**

3a. State block (`:284-289`) — replace the two index states:

```tsx
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
```

with:

```tsx
  // Keyed by SESSION ID, not index — see header/drag-order.ts.
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
```

and add the geometry ref beside the other drag refs:

```tsx
  // The strip's pill geometry, MEASURED ONCE at pointer-down and not touched
  // again until the next one. A ref, not state: the render reads it to position
  // neighbours, but writing it must not itself schedule a render.
  //
  // WHY frozen rather than re-measured per move: getBoundingClientRect()
  // INCLUDES the translateX Task 10 applies to the neighbours. Re-measuring
  // would feed this frame's answer to "which pill am I over?" back in as next
  // frame's input — the pills chatter back and forth at the boundaries, and the
  // dragged pill's travel clamp (which is computed from its own rect) drifts.
  const pillRectsRef = useRef<PillRect[]>([]);
```

3b. `handlePointerDown` (`:492-497`) — the canonical-index lookup becomes
unnecessary, and this is where the geometry is captured:

```tsx
    const idx = sessions.findIndex(s => s.id === sessionId);
    if (idx === -1) return;
    const s = sessions[idx];
    // Capture label + color eagerly so pointermove can start immediately
    setDragIdx(idx);
```

becomes:

```tsx
    const s = sessions.find(x => x.id === sessionId);
    if (!s) return;
    // Capture label + color eagerly so pointermove can start immediately
    setDragId(s.id);

    // Freeze the strip's geometry for the whole drag — see pillRectsRef.
    const barEl = pillBarRef.current;
    if (barEl) {
      pillRectsRef.current = [...barEl.querySelectorAll<HTMLElement>('[data-session-id]')]
        .map(el => {
          const r = el.getBoundingClientRect();
          return { id: el.dataset.sessionId!, left: r.left, right: r.right };
        });
    }
```

Leave the `closest('[data-session-idx]')` lookup a few lines below **exactly as
it is** — it feeds `grabOffsetInPill`, which the live tear-off uses to place the
new window, and the attribute is staying.

3c. `handlePointerMove` — four substitutions:

- `if (dragIdx === null || !dragOrigin.current) return;` → `if (dragId === null || !dragOrigin.current) return;`
- both `const draggedSession = sessions[dragIdx];` → `const draggedSession = sessions.find(s => s.id === dragId); if (!draggedSession) return;`
- the tear-off guard `bar && dragIdx !== null && sessions.length > 1` → `bar && dragId !== null && sessions.length > 1`
- the live-detach cleanup block `setDragIdx(null); setOverIdx(null);` → `setDragId(null); setOverId(null);`

3d. `handlePointerMove` hit-test (`:598-643`) — replace everything from
`const els = bar.querySelectorAll(...)` through the closing `}` of the
`setGhostTarget(null)` else-branch with two lines:

```tsx
    // Hit-test by horizontal distance only, against the geometry frozen at
    // pointer-down. Y is ignored on purpose: the pickup range is the full
    // height of the window, so a slightly-low drag still reorders.
    setOverId(nearestPillId(pillRectsRef.current, e.clientX, dragId));
```

3e. `handlePointerUp` — replace the captured values and both reorder call sites:

```tsx
    const releasedDragIdx = dragIdx;
    const releasedOverIdx = overIdx;
    const releasedSession = releasedDragIdx !== null ? sessions[releasedDragIdx] : null;
```

becomes:

```tsx
    const releasedDragId = dragId;
    const releasedOverId = overId;
    const releasedSession = releasedDragId !== null
      ? sessions.find(s => s.id === releasedDragId) ?? null
      : null;
```

Both occurrences of:

```tsx
      if (releasedOverIdx !== null && onReorderSessions && releasedDragIdx !== null) {
        onReorderSessions(releasedDragIdx, releasedOverIdx);
      }
```

become:

```tsx
      // Both ends resolved against the FULL session list — see drag-order.ts.
      if (releasedOverId !== null && onReorderSessions && releasedDragId !== null) {
        const move = reorderIndices(sessions.map(s => s.id), releasedDragId, releasedOverId);
        if (move) onReorderSessions(move.from, move.to);
      }
```

Update the reset block (`setDragIdx(null); setOverIdx(null);` → `setDragId(null); setOverId(null);`) and the dependency array (`[dragIdx, overIdx, ...]` → `[dragId, overId, ...]`).

3f. Both `isBeingDragged` sites — `:842` (a strip pill, `idx` is its index into
`visibleSessions`) and `:990` (a row in the session dropdown, `idx` is its index
into the full `sessions`). The first was the wrong-pill-dims bug; keying both by
id makes the two spellings unnecessary:

```tsx
                const isBeingDragged = dragId === s.id && isDragging.current;
```

3g. Both `data-session-idx={idx}` sites (`:847` on the pill, `:994` on the
dropdown row) gain a sibling. **Add, do not replace:**

```tsx
                data-session-idx={idx}
                data-session-id={s.id}
```

The new attribute is what this component's own drag code reads. The old one has
two consumers outside the renderer that both fail silently if it disappears —
`main.ts:1167` (torn-off window placement, the query lives inside a string that
`tsc` cannot see) and `scripts/perf-lab/scenario-workload.mjs` (which reads the
numeric value). See Global Constraints.

3h. Update the `dragging` flag at `:819`:

```tsx
  const dragging = dragId !== null && isDragging.current && dragPos !== null;
```

3i. Add the imports:

```ts
import { nearestPillId, reorderIndices, neighbourOffsets, type PillRect } from './header/drag-order';
```

(`neighbourOffsets` is unused until Task 10 — add it there instead if lint objects now.)

- [ ] **Step 4: Run the checks**

```bash
bash scripts/verify.sh worktrees/session-motion
```

Expected: exit 0. `tsc` catches any missed `dragIdx` reference.

- [ ] **Step 5: Confirm the bug is gone in the dev window**

Announce first. Launch, then narrow the window until the "+N" chip appears (at
least one session overflows), and drag the leftmost visible pill onto the
rightmost visible pill. Two things to watch: the pill that dims must be the one
under your cursor, and the drop must land where you dropped it. Before this task
both were wrong. Close the window.

- [ ] **Step 6: Commit**

```bash
git add youcoded/desktop/src/renderer/components/SessionStrip.tsx youcoded/desktop/tests/animation-frame-budget.test.ts
git commit -m "fix(strip): drops land in the right slot when the strip overflows

Drag state is now keyed by session id end to end. The drag source was a
full-list index and the drop target a visible-list index, so once one
session overflowed into the +N chip the wrong pill dimmed and the drop
landed in the wrong slot. data-session-idx is kept alongside the new
data-session-id: main.ts and the perf lab both read it, and both fail
silently on a rename."
```

---

### Task 9: Freeze widths and packing for the duration of a drag

Two freezes, two jobs. Task 8 froze the pills' **positions** so the hit test
cannot chase its own output. This one freezes **which pills show their names**,
so the row cannot repack — turning pills into dots under the cursor — while the
drag is in flight.

**Files:**
- Create: `youcoded/desktop/src/renderer/components/header/use-frozen-pack.ts`
- Modify: `youcoded/desktop/src/renderer/components/SessionStrip.tsx`
- Test: `youcoded/desktop/tests/use-frozen-pack.test.tsx`

**Interfaces:**
- Consumes: `PackResult` from `pack-sessions.ts`.
- Produces: `export function useFrozenPack(live: PackResult, frozen: boolean): PackResult;`

- [ ] **Step 1: Write the failing test**

Create `youcoded/desktop/tests/use-frozen-pack.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFrozenPack } from '../src/renderer/components/header/use-frozen-pack';
import type { PackResult } from '../src/renderer/components/header/pack-sessions';

const pack = (expanded: string[], collapsed: string[] = [], overflow: string[] = []): PackResult =>
  ({ expanded: new Set(expanded), collapsed, overflow });

describe('useFrozenPack', () => {
  it('passes the live pack through when not frozen', () => {
    const { result, rerender } = renderHook(
      ({ p, f }) => useFrozenPack(p, f),
      { initialProps: { p: pack(['a']), f: false } },
    );
    expect([...result.current.expanded]).toEqual(['a']);
    rerender({ p: pack(['a', 'b']), f: false });
    expect([...result.current.expanded]).toEqual(['a', 'b']);
  });

  it('holds the pack captured at the moment it froze', () => {
    // The drag case: opening a slot makes the row wider, which can trip a
    // repack. Pills turning into dots mid-drag would be worse than the jump
    // this whole feature exists to remove.
    const { result, rerender } = renderHook(
      ({ p, f }) => useFrozenPack(p, f),
      { initialProps: { p: pack(['a', 'b']), f: false } },
    );
    rerender({ p: pack(['a', 'b']), f: true });
    rerender({ p: pack(['a']), f: true });          // packer wants to collapse b
    expect([...result.current.expanded]).toEqual(['a', 'b']);
  });

  it('releases to the live pack when it unfreezes', () => {
    const { result, rerender } = renderHook(
      ({ p, f }) => useFrozenPack(p, f),
      { initialProps: { p: pack(['a', 'b']), f: true } },
    );
    rerender({ p: pack(['a']), f: true });
    expect([...result.current.expanded]).toEqual(['a', 'b']);
    rerender({ p: pack(['a']), f: false });
    expect([...result.current.expanded]).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd youcoded/desktop && npx vitest run tests/use-frozen-pack.test.tsx
```

Expected: FAIL — `Failed to resolve import ".../header/use-frozen-pack"`.

- [ ] **Step 3: Write the implementation**

Create `youcoded/desktop/src/renderer/components/header/use-frozen-pack.ts`:

```ts
// Holds the pack result taken at pointer-down for the whole of a drag.
//
// WHY: the strip collapses pills into dots when it runs out of room. Opening a
// slot for the dragged pill makes the row wider, which can trip a repack —
// pills turning into dots UNDER THE CURSOR mid-drag would read as worse than
// the one-frame jump this feature exists to remove. Whatever the row looked
// like when you pressed down is what it looks like until you let go.
import { useRef } from 'react';
import type { PackResult } from './pack-sessions';

export function useFrozenPack(live: PackResult, frozen: boolean): PackResult {
  const held = useRef<PackResult | null>(null);

  if (!frozen) {
    held.current = null;
    return live;
  }
  // First render of a frozen period captures; every later one reuses.
  //
  // WHY writing a ref during render is safe HERE, where it usually is not: the
  // write is idempotent (it only ever fills a null slot) and the value it holds
  // is discarded the moment `frozen` goes false. A React double-render or a
  // discarded concurrent render therefore cannot leave a stale value behind —
  // it would capture the same `live` twice, or capture one that is thrown away
  // with the drag. Do NOT extend this to anything that accumulates.
  if (held.current === null) held.current = live;
  return held.current;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd youcoded/desktop && npx vitest run tests/use-frozen-pack.test.tsx
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Wire it in and freeze hover too**

5a. Import it in `SessionStrip.tsx` and insert one line after the `pack` state, renaming every downstream read:

```tsx
  // Everything below reads the FROZEN pack. `pack` is the live one; only the
  // measuring effect writes it.
  const displayPack = useFrozenPack(pack, dragId !== null);
```

Then replace every `pack.expanded.has(` / `pack.collapsed` read in the render body and in `handleEnter` with `displayPack.` (the measuring effect's `setPack(result)` stays on `pack`). `packRef` from Task 5 tracks `displayPack`, not `pack`.

5b. Freeze hover width by refusing to set a hover during a drag. In `handleEnter`, add after the pack-expanded guard:

```ts
    // Widths freeze for the duration of a drag: dragging OVER a pill must not
    // trigger its hover reveal and grow the row under the cursor.
    if (dragIdRef.current !== null) return;
```

with the backing ref beside `pillRectsRef` (Task 8):

```tsx
  // Mirror of dragId for event handlers that must not be recreated per drag.
  const dragIdRef = useRef<string | null>(null);
  useEffect(() => { dragIdRef.current = dragId; }, [dragId]);
```

5c. Also clear any standing hover when a drag begins, in `handlePointerDown` right after `setDragId(s.id)`:

```tsx
    setHoveredId(null);
```

- [ ] **Step 6: Run the checks**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh worktrees/session-motion
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add youcoded/desktop/src/renderer/components/header/use-frozen-pack.ts youcoded/desktop/src/renderer/components/SessionStrip.tsx youcoded/desktop/tests/use-frozen-pack.test.tsx
git commit -m "feat(strip): widths and packing freeze for the duration of a drag

Chrome's tabs are uniform width; ours are dots, hover-wide, or active-wide.
Without the freeze the row grows and repacks under the cursor."
```

---

### Task 10: The pill moves; the ghost and insertion line go

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/SessionStrip.tsx` — delete `:1253-1283`, delete `ghostTarget` state, add transforms to the pill
- Test: `youcoded/desktop/tests/animation-frame-budget.test.ts`

**Interfaces:**
- Consumes: `neighbourOffsets` from Task 7, `dragId` / `dragPos` / `pillRectsRef` from Task 8.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Add to the `motion vocabulary` describe block:

```ts
  it('has no floating ghost and no insertion line', () => {
    // Chrome's model: the tab itself moves and the neighbours step aside, so
    // the gap IS the indicator. A ghost plus a line pointing at a gap that
    // does not exist is what this replaced.
    const strip = read('components', 'SessionStrip.tsx');
    expect(strip).not.toMatch(/ghostTarget/);
    expect(strip).not.toMatch(/Floating drag ghost/);
    expect(strip).not.toMatch(/Insertion indicator/);
  });

  it('positions the real pill and its neighbours from drag state', () => {
    const strip = read('components', 'SessionStrip.tsx');
    expect(strip).toMatch(/neighbourOffsets\(/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd youcoded/desktop && npx vitest run tests/animation-frame-budget.test.ts -t 'has no floating ghost'
```

Expected: FAIL on `ghostTarget`.

- [ ] **Step 3: Implement**

3a. Delete the `ghostTarget` state declaration (`:289`) and all four `setGhostTarget(...)` calls (in `handlePointerMove`'s live-detach cleanup, in `handlePointerUp`'s reset block, and the two in the deleted hit-test).

3b. Delete both JSX blocks at the bottom of the component — the insertion indicator (`:1253-1266`) and the floating ghost (`:1268-1283`) — leaving the `</>` intact. Also delete the now-unused `dragLabel` / `dragColor` state and their setters in `handlePointerDown`, unless `tsc` shows another consumer.

3c. Compute the per-pill drag transform. Add just above `visibleSessions.map(...)`:

```tsx
  // Chrome's model: the dragged pill IS the thing that moves, clamped to the
  // strip, and every pill between its origin and its target steps aside by one
  // pill-width so the gap it will land in is already open. On release there is
  // nothing to jump to — it is already there.
  const dragOffsets = dragging && dragId
    ? neighbourOffsets(pillRectsRef.current, dragId, overId)
    : new Map<string, number>();

  const draggedShift = (() => {
    if (!dragging || !dragId || !dragPos || !dragOrigin.current) return 0;
    const bar = pillBarRef.current;
    const self = pillRectsRef.current.find(r => r.id === dragId);
    const raw = dragPos.x - dragOrigin.current.x;
    if (!bar || !self) return raw;
    // Clamp so the pill rides the strip instead of leaving it. `self` comes
    // from the geometry FROZEN at pointer-down (Task 8): measuring it live
    // would include the translateX being computed right here, so the clamp
    // would chase its own output and drift. Vertical is tear-off only and is
    // handled in handlePointerMove — never here.
    const barRect = bar.getBoundingClientRect();
    return Math.max(barRect.left - self.left, Math.min(raw, barRect.right - self.right));
  })();
```

3d. On the pill `<button>`, fold the drag transform into the existing `style` object. Replace:

```tsx
                  transform: (!isBeingDragged && isHovered && !isActive) ? 'scale(1.02)' : undefined,
```

with:

```tsx
                  // Three mutually exclusive transform states: the pill in
                  // hand (follows the cursor, lifted), a neighbour stepping
                  // aside, or a plain hover.
                  transform: isBeingDragged
                    ? `translateX(${draggedShift}px) scale(1.05)`
                    : dragOffsets.has(s.id)
                      ? `translateX(${dragOffsets.get(s.id)}px)`
                      : (isHovered && !isActive) ? 'scale(1.02)' : undefined,
                  zIndex: isBeingDragged ? 10 : undefined,
                  boxShadow: isBeingDragged
                    ? '0 8px 20px rgba(0,0,0,0.35)'
                    : ((!forceSingle && isActive) ? GLOW_SHADOW[color] : undefined),
```

and delete the now-duplicated `boxShadow:` line below it.

3e. Give the three states the right timings. Replace the `isBeingDragged` branch of the transition ternary (`:873`):

```tsx
                    ? 'opacity 150ms, transform 150ms'
```

with:

```tsx
                    // The pill in hand tracks the cursor 1:1 — a transition on
                    // transform here would make it lag behind the pointer.
                    // Only the lift is animated.
                    ? 'opacity var(--dur-hover) var(--ease-out), box-shadow var(--dur-hover) var(--ease-out)'
```

and add, on the `else` branch, a movement transition for neighbours by appending to the existing token string:

```tsx
                    : `transform ${dragging ? 'var(--dur-hover) var(--ease-out)' : 'var(--dur-hover) var(--ease-bounce)'}, border-color var(--dur-hover) var(--ease-bounce), background-color var(--dur-hover) var(--ease-bounce), box-shadow var(--dur-hover) var(--ease-bounce), opacity var(--dur-hover) var(--ease-bounce)`
```

3f. The dragged pill no longer fades. Delete `opacity-30 scale-95` from the className at `:862` — it exists only because a separate copy was carrying the visual. Replace with an empty string so the ternary shape survives:

```tsx
                  ${isBeingDragged ? 'cursor-grabbing' : ''}
```

3g. Release settles rather than jumps, and this falls out of the model rather than needing its own animation. `handlePointerUp` clears `dragId` and `dragPos` in the same commit that calls `onReorderSessions`, so in the very next render the pill is in its new slot with `translateX(0)` — which is the position the open gap was already showing. There is nothing to travel.

The one thing worth guarding is the neighbours: they go from an offset to zero in that same commit, and any sub-pixel difference between "the gap" and "the slot" would snap. Give them the settle curve by extending the transition branch you wrote in 3e so `dragging` picks the drag curve and `!dragging` picks the settle curve for `transform` only:

```tsx
                    : `transform ${dragging ? 'var(--dur-hover) var(--ease-out)' : 'var(--dur-hover) var(--ease-settle)'}, border-color var(--dur-hover) var(--ease-bounce), background-color var(--dur-hover) var(--ease-bounce), box-shadow var(--dur-hover) var(--ease-bounce), opacity var(--dur-hover) var(--ease-bounce)`
```

This replaces the string from 3e rather than adding to it — 3e's version used `--ease-bounce` for the non-drag transform, which would make a hover scale overshoot AND a release overshoot. Only the hover scale should bounce, and it is the `scale(1.02)` that carries that feel, not the curve on a zero-distance move.

- [ ] **Step 4: Run the checks**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh worktrees/session-motion
```

Expected: exit 0. `knip` will flag `dragLabel`/`dragColor` if 3b missed them.

- [ ] **Step 5: Watch it in the dev window**

Announce first. Launch with at least four sessions open and check, then close the window:

1. Press and drag a pill sideways — the pill itself moves, lifted, and does not leave the strip vertically or horizontally.
2. The pills it crosses step aside as it passes their centres; the gap it is heading for is open before release.
3. Release — it settles into the open gap; no one-frame jump.
4. Drag downward past the strip — the existing live tear-off still spawns the window and the window follows the cursor. **This must be unchanged.**
5. Narrow the window until the "+N" chip appears and repeat 1-3: pills must not turn into dots mid-drag, and no pill must change width under the cursor.

- [ ] **Step 6: Commit**

```bash
git add youcoded/desktop/src/renderer/components/SessionStrip.tsx youcoded/desktop/tests/animation-frame-budget.test.ts
git commit -m "feat(strip): Chrome-style drag — the pill moves, neighbours step aside

Replaces the floating copy and the insertion line, which pointed at a gap
that did not exist and left the row to jump into its new order on release."
```

---

# Phase 4 — The incoming conversation

### Task 11: Whole-pane arrival in `ChatView` (spec §4.2 option A)

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/ChatView.tsx:74` (the existing `useTheme()` call) and `:891` (the `contentRef` wrapper)
- Modify: `youcoded/desktop/src/renderer/styles/globals.css`
- Test: `youcoded/desktop/tests/animation-frame-budget.test.ts`

**Interfaces:**
- Consumes: `useOneShotWindow` (Task 2), the motion tokens (Task 1), `reducedEffects` from `useTheme()`.
- Produces: nothing.

This is the cheap half of the spec's §4.2 choice: the transcript arrives as one
element rather than a hundred. It has no measurement, no per-entry state and no
cost that scales with transcript length. **Build this regardless** — it is the
fallback if the deck rejects the staggered version, and Task 13 layers on top of it.

- [ ] **Step 1: Write the failing test**

Add to the `motion vocabulary` describe block:

```ts
  it('animates the incoming conversation, never the outgoing one', () => {
    const chat = read('components', 'ChatView.tsx');
    // The gate is sessionActive, not `visible` — `visible` also flips on Ctrl+`.
    // The trailing `&& sessionActive` is what makes it one-directional: the
    // window opens on the way out too, and this is what closes it. See the
    // hook's header.
    expect(chat).toMatch(/useOneShotWindow\(\s*sessionActive\s*\)\s*&&\s*sessionActive/);
  });

  it('defines the arrival animation with a finite iteration count', () => {
    // Perpetual animation is the thing this file exists to prevent. One run.
    const globals = read('styles', 'globals.css');
    expect(globals).toMatch(/\.switch-arrival\s*\{[^}]*animation:[^;]*switch-arrival/);
    expect(globals).not.toMatch(/\.switch-arrival\s*\{[^}]*infinite/);
  });

  it('gates the arrival animation on reduced motion AND Reduce Visual Effects', () => {
    const globals = read('styles', 'globals.css');
    expect(globals).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^}]*\.switch-arrival[^}]*\}/);
    expect(globals).toMatch(/\[data-reduced-effects\] \.switch-arrival/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd youcoded/desktop && npx vitest run tests/animation-frame-budget.test.ts -t 'animates the incoming conversation'
```

Expected: FAIL — `expected '…' to match /useOneShotWindow\(…/`.

- [ ] **Step 3: Implement**

3a. In `globals.css`, immediately after the `.timeline-entry { contain: layout style; }`
rule (`:849-851`):

```css
/* Session switch: the incoming conversation arrives as ONE element.
   Deliberately not per-bubble. On a high-refresh display the frame cost is
   per-FRAME rather than per-element (see the frame-budget note at the top of
   tests/animation-frame-budget.test.ts), but a staggered cascade also has to
   MEASURE which bubbles are on screen first, and a scrolled-back conversation
   can hold thousands of messages. One element has no cost that scales with
   transcript length.

   The OUTGOING conversation is not animated: content-visibility has already
   taken it out of the layout tree, and Chrome does not animate the page you
   are leaving either. */
@keyframes switch-arrival {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: none; }
}

.switch-arrival {
  animation: switch-arrival var(--dur-switch) var(--ease-out) 1;
}

@media (prefers-reduced-motion: reduce) {
  .switch-arrival { animation: none; }
}

/* Reduce Visual Effects — the app's own toggle, set on <html> by
   theme-engine.ts. Honoured alongside the OS preference, never instead of it. */
[data-reduced-effects] .switch-arrival { animation: none; }
```

3b. In `ChatView.tsx`, add the import:

```ts
import { useOneShotWindow } from '../hooks/use-one-shot-window';
```

`useTheme` is **already imported and already called** at `:21` and `:74`
(`import { useTheme } from '../state/theme-context';` /
`const { showTimestamps } = useTheme();`). Extend that call rather than adding a
second one:

```tsx
  const { showTimestamps, reducedEffects } = useTheme();
```

Then, beside it:

```tsx
  // Motion on a SESSION SWITCH only.
  //  • `sessionActive`, not `visible` — `visible` also flips on the Ctrl+`
  //    chat↔terminal toggle, which is frequent; a switch is deliberate.
  //  • the trailing `&& sessionActive` makes it one-directional: the window
  //    also opens when the pane goes INACTIVE, and this is what suppresses it.
  //  • `reducedEffects` is folded in here rather than at the class, so the
  //    timer never even starts when the user has effects off.
  const arriving = useOneShotWindow(sessionActive) && sessionActive && !reducedEffects;
```

3c. Apply it to the transcript wrapper at `:891`:

```tsx
           <div ref={contentRef}>
```

becomes:

```tsx
           {/* The arrival class is on the CONTENT wrapper, not the scroller:
               animating transform on the scroll container would make it a
               containing block and disturb useStickToBottom's measurements. */}
           <div ref={contentRef} className={arriving ? 'switch-arrival' : undefined}>
```

- [ ] **Step 4: Run the checks**

```bash
bash scripts/verify.sh worktrees/session-motion
```

Expected: exit 0.

- [ ] **Step 5: Watch it in the dev window**

Announce first. Open two sessions with real transcripts and switch between them.
The incoming conversation should rise and fade in over roughly a quarter second;
the outgoing one should simply be gone. Then press Ctrl+` a few times inside one
session — the chat↔terminal toggle must **not** animate. Close the window.

- [ ] **Step 6: Commit**

```bash
git add youcoded/desktop/src/renderer/components/ChatView.tsx youcoded/desktop/src/renderer/styles/globals.css youcoded/desktop/tests/animation-frame-budget.test.ts
git commit -m "feat(chat): the incoming conversation arrives on a session switch

One animated element, so the cost does not scale with transcript length.
Gated on sessionActive so Ctrl+\` stays instant."
```

---

# Phase 5 — Review

### Task 12: Record the clips and build the deck

**Files:**
- Create: `docs/archive/design/2026-08-31-session-motion/scenes/strip-pill-expand.json`
- Create: `docs/archive/design/2026-08-31-session-motion/scenes/strip-hover.json`
- Create: `docs/archive/design/2026-08-31-session-motion/scenes/strip-drag.json`
- Create: `docs/archive/design/2026-08-31-session-motion/scenes/switch-arrival.json`
- Create: `docs/archive/design/2026-08-31-session-motion/session-motion.json` (the deck spec)
- Modify: `scripts/ui-review/record.mjs` (add the `drag` action verb)

**Interfaces:**
- Consumes: the finished branch, and a clean worktree at `origin/master` as the "before" target.
- Produces: a deck Destin answers Yes/No per step.

Everything lives beside the design doc, not in `scripts/ui-review/plans/` — that
folder holds **screenshot capture plans** (`shots`), a different format. Every
shipped deck spec sits under `docs/`.

- [ ] **Step 0: Make the "before" worktree**

```bash
git worktree add worktrees/session-motion-before --detach origin/master
```

**Do not record "before" from `youcoded/`.** The main checkout is routinely
dirty and behind — it was 4 commits behind at the time of writing — so it is not
a trustworthy picture of "today". `record-pair.sh` boots a workbench inside
whichever tree you name.

- [ ] **Step 1: Write the scenes**

Create `docs/archive/design/2026-08-31-session-motion/scenes/strip-pill-expand.json`:

```json
{
  "base": "http://127.0.0.1:5473/?mode=workbench&scenario=stress&latency=0",
  "theme": "midnight",
  "boot": 2500,
  "actions": [
    { "hold": 700 },
    { "click": "js:document.querySelectorAll('[data-session-id]')[1]", "settle": 1200 },
    { "hold": 600 },
    { "click": "js:document.querySelectorAll('[data-session-id]')[0]", "settle": 1200 },
    { "hold": 900 }
  ]
}
```

Create `.../scenes/strip-hover.json`:

```json
{
  "base": "http://127.0.0.1:5473/?mode=workbench&scenario=stress&latency=0",
  "theme": "midnight",
  "boot": 2500,
  "actions": [
    { "hold": 700 },
    { "moveTo": "js:document.querySelectorAll('[data-session-id]')[2]", "ms": 500, "settle": 1200 },
    { "hold": 800 },
    { "moveTo": "js:document.querySelectorAll('[data-session-id]')[3]", "ms": 500, "settle": 1200 },
    { "hold": 900 }
  ]
}
```

`moveTo` is `record.mjs`'s verb for a real eased cursor move via CDP — that IS
the hover. `record.mjs` has no `hover` verb; **its sibling `shot.mjs` does**, so
don't let that fact talk you out of `hover` in a screenshot plan. The `js:`
prefix is `selExpr`'s escape hatch (`cdp-helpers.mjs:41`), needed here because
the pills are `<button>` elements, so `:nth-of-type` would count every button in
the strip rather than the pills.

The `[data-session-id]` selector works in "before" as well as "after" **only
because Task 8 keeps `data-session-idx` and adds the new one** — if the before
run predates Task 8, use `[data-session-idx]` in the before scene, or record
both runs from a branch that has Task 8 (this is the recommended shape: the
whole point of "before" here is the motion, not the markup).

Create `.../scenes/strip-drag.json`:

```json
{
  "base": "http://127.0.0.1:5473/?mode=workbench&scenario=stress&latency=0",
  "theme": "midnight",
  "boot": 2500,
  "actions": [
    { "hold": 700 },
    { "drag": "js:document.querySelectorAll('[data-session-idx]')[0]", "to": "js:document.querySelectorAll('[data-session-idx]')[2]", "ms": 900, "settle": 1200 },
    { "hold": 1200 }
  ]
}
```

`drag` does not exist yet — Step 2 adds it.

Create `.../scenes/switch-arrival.json`:

```json
{
  "base": "http://127.0.0.1:5473/?mode=workbench&scenario=stress&latency=0",
  "theme": "midnight",
  "boot": 3000,
  "actions": [
    { "hold": 900 },
    { "click": "js:document.querySelectorAll('[data-session-idx]')[1]", "settle": 1400 },
    { "hold": 700 },
    { "click": "js:document.querySelectorAll('[data-session-idx]')[0]", "settle": 1400 },
    { "hold": 1000 }
  ]
}
```

- [ ] **Step 2: Add the `drag` verb to `record.mjs`**

`record.mjs` today has `moveTo`, `click`, `clickText`, `typeSlow`, `key`,
`waitFor`/`waitForText`, `eval`, `hold`/`wait` — and nothing that holds the
button down across a move. An unrecognised verb does not error: the `if/else if`
chain falls straight through to `await sleep(a.settle ?? 400)`, so the scene
silently records a clip of nothing happening. So the verb has to be real.

Add this function beside the existing `click` (`record.mjs:86-93`):

```js
// Press, travel, release — the one gesture the click/moveTo pair cannot express.
// Chromium synthesises pointerdown/pointermove/pointerup from these raw mouse
// events, which is what SessionStrip listens to. `buttons: 1` on every move is
// load-bearing: without it Chromium treats the moves as a hover and the strip
// never sees a drag.
//
// Both endpoints are measured BEFORE the press, on purpose: the target pill
// steps aside during the drag, so re-measuring it mid-gesture would chase a
// moving target. The app hit-tests against its own frozen geometry too
// (SessionStrip's pillRectsRef), so the two agree.
async function drag(fromExpr, toExpr, ms = 800) {
  const a = await rectOf(fromExpr);
  if (!a) throw new Error(`MISSING ${fromExpr}`);
  const b = await rectOf(toExpr);
  if (!b) throw new Error(`MISSING ${toExpr}`);
  await moveTo(a, 300);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1 });
  await sleep(80);
  const steps = Math.max(8, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const k = i / steps, e = 1 - Math.pow(1 - k, 3);
    const x = a.x + (b.x - a.x) * e, y = a.y + (b.y - a.y) * e;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
    await sleep(16);
  }
  await sleep(120);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', buttons: 0, clickCount: 1 });
  cur = b;
}
```

and wire it into the action loop (`record.mjs:132`), immediately after the
`a.click` branch:

```js
  else if (a.drag) await drag(selExpr(a.drag), selExpr(a.to), a.ms);
```

Verify it parses before recording eight clips with it:

```bash
node --check scripts/ui-review/record.mjs && echo parses
```

- [ ] **Step 3: Record before/after for each scene**

Clips must land in `<images>/clips/` — that is where the deck resolves them
(`deck/spec.py:111`), and `record-pair.sh`'s last argument is that folder, not
its parent.

```bash
D=docs/archive/design/2026-08-31-session-motion
mkdir -p "$D/images/session-motion/clips"
for s in strip-pill-expand strip-hover strip-drag switch-arrival; do
  bash scripts/ui-review/record-pair.sh "$D/scenes/$s.json" \
    worktrees/session-motion-before worktrees/session-motion \
    "$D/images/session-motion/clips"
done
```

Expected: eight `.webm` files plus `.webp` posters in that folder. **Open the
drag clip before continuing** — a clip where nothing moves means the scene's
selectors did not match, which the rig cannot detect for you.

- [ ] **Step 4: Write the deck spec and build it**

Create `docs/archive/design/2026-08-31-session-motion/session-motion.json`.

Three shapes the loader enforces, each of which an earlier draft got wrong:
`runs` is an **object** mapping each run to its picture folder (`run_names()`
calls `.keys()` on it), `out` is a **filename** resolved next to the spec, and
`images` must contain the spec's own name or two decks silently overwrite each
other's pictures.

```json
{
  "title": "Session strip and switching",
  "key": "session-motion",
  "out": "deck.html",
  "images": "images/session-motion",
  "runs": {
    "before": "images/session-motion/before",
    "after": "images/session-motion/after"
  },
  "themes": ["midnight"],
  "steps": [
    {
      "id": "pill-expand",
      "surface": "Session strip",
      "path": "Header",
      "clip": "strip-pill-expand",
      "headline": "The session name grows open instead of appearing",
      "changed": "Clicking a session now expands its name over 200ms. Two separate bugs were switching the animation off — one left the browser with no width to animate towards, the other disabled transitions on exactly the pill you just clicked.",
      "notice": "The strip feels less abrupt when you switch sessions. Nothing moves that did not move before.",
      "risk": "A very long session name on a narrow window must still shorten with an ellipsis rather than pushing the strip wide."
    },
    {
      "id": "hover",
      "surface": "Session strip",
      "path": "Header",
      "clip": "strip-hover",
      "headline": "Hovering reveals the name to its own length",
      "changed": "Every name used to slide open the same fixed distance, so a short one finished early and then sat still while the animation kept going. It now stops when the name does, up to the same 120px limit.",
      "notice": "Short session names feel snappier on hover. Long ones are unchanged.",
      "risk": "A pill that shrinks to a dot while your cursor is already resting on it now reveals correctly; it used to stay a dot."
    },
    {
      "id": "drag",
      "surface": "Session strip",
      "path": "Header",
      "clip": "strip-drag",
      "headline": "Dragging moves the pill itself, like a Chrome tab",
      "changed": "The floating copy and the thin insertion line are gone. The real pill lifts and follows your cursor along the strip, and the pills it passes step aside so the gap is already open when you let go. It also used to dim the wrong pill, and drop into the wrong slot, whenever a session had overflowed into the +N chip.",
      "notice": "No more one-frame jump on release. Tearing a session out into its own window is unchanged.",
      "risk": "Pill widths and the dots/names layout are frozen while you drag, so the row cannot grow or repack under your cursor."
    },
    {
      "id": "switch",
      "surface": "Chat",
      "path": "Main view",
      "clip": "switch-arrival",
      "headline": "The incoming conversation arrives instead of appearing",
      "changed": "Switching sessions fades and lifts the incoming conversation over a quarter second. The one you are leaving is not animated at all.",
      "notice": "Switching reads as a deliberate move rather than a hard cut. Ctrl+` between chat and terminal is untouched and stays instant.",
      "risk": "One animated element rather than one per message, so a very long conversation costs no more than a short one."
    }
  ]
}
```

A clip step takes no `crop` and no `highlight` — the recording is the picture,
and the loader rejects the spec if either is present.

Build and serve (run `serve` in the background; its exit is the "review
finished" signal):

```bash
python3 scripts/ui-review/review-cards.py serve docs/archive/design/2026-08-31-session-motion/session-motion.json
```

- [ ] **Step 5: Hand Destin the deck**

Give him the URL the `serve` command prints. Do not summarise the changes in
chat instead — the deck is the review surface, and the answers land in a file
for Claude to read on Submit.

- [ ] **Step 6: Commit the scenes and spec**

```bash
git add docs/archive/design/2026-08-31-session-motion scripts/ui-review/record.mjs
git commit -m "docs(ui-review): scenes, drag verb and deck spec for session motion"
```

---

### Task 13: Per-bubble stagger — ONLY if Destin rejects the whole-pane arrival

Do not build this speculatively. The whole-pane arrival from Task 11 is the shipped behaviour unless the deck's `switch` step comes back "No" with a note asking for per-bubble motion.

If it does, the spec's §4.3 applies: a `useLayoutEffect` on the incoming pane binary-searches the timeline entries' `offsetTop` for the first and last one inside `scrollTop … scrollTop + clientHeight`, and only those get a staggered `switch-arrival` class. Do **not** reintroduce a dependency on `.in-view` — it is observer-driven and async, it carries two unrelated jobs already (wallpaper glass at `theme-engine.ts:600`, keyword shimmer at `globals.css:1680`), and it is coupled to `content-visibility`.

Before building it, measure. Take a before/after against `perf-reports/2026-08-28-0803-8935c28-cycle3-baseline.json` on a transcript large enough to matter, and check CPU during the animation on the 180Hz panel — a screenful of simultaneously-animating bubbles is the one proposal in this plan that the 2026-07-30 frame-budget finding actually threatens. If it costs more than the whole-pane version by a visible margin, the answer is that the whole-pane version was right.

---

## Done criteria

- [ ] `bash scripts/verify.sh worktrees/session-motion` exits 0
- [ ] `rg -n 'cubic-bezier\(' youcoded/desktop/src/renderer/components/SessionStrip.tsx` returns nothing
- [ ] `rg -n 'data-session-idx' youcoded/desktop/src/renderer/components/SessionStrip.tsx` still returns **two** hits — the attribute main.ts and the perf lab read
- [ ] Every step in Task 10's dev-window checklist passes, tear-off included
- [ ] The deck has been built and handed to Destin, and every step answered
- [ ] Both worktrees removed (`session-motion`, `session-motion-before`) and the branch deleted locally and remotely
- [ ] Spec `status:` flipped to `shipped`; spec, this plan and the deck folder moved to `docs/archive/`
- [ ] `docs/archive/handoffs/2026-07-20-session-switch-animation-handoff.md` archived
- [ ] youcoded PR #192 closed unmerged
