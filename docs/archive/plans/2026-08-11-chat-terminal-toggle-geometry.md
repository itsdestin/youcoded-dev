---
status: shipped
---

> **Shipped 2026-08-11** in youcoded `a39e287d`. Two accepted deviations from the
> sample code below, both confirmed in code review:
>
> 1. `CONTAINER_CLASS` was split into `ROW_CLASS` (no `position`) plus
>    `CONTAINER_CLASS = relative ${ROW_CLASS}`. Reusing one constant carrying
>    `relative` for rows that also get `absolute inset-0` would have left the
>    sizing rows in normal flow: Tailwind v4 emits `.relative` *after*
>    `.absolute`, so `relative` wins the cascade regardless of string order.
> 2. `viewModeRef` was dropped; the active endpoint is selected by reading the
>    `viewMode` prop at render time, which satisfies the "converge to the latest
>    viewMode" requirement without a ref nothing else used.
>
> Also added beyond the plan: `shrink-0` on the endpoint boxes (an endpoint box
> must never be width-constrained by the container, whose width animates during
> the rollout), and three extra tests closing spec-contract gaps (reverse view
> change, both-endpoints-updated, label-mode recalibration).
>
> **Plan defect worth noting:** Global Constraints contradict each other on
> observation scope — one line says to observe the sizing boxes *and the
> container*, a later line says not to observe the container. The later line is
> correct and was followed: the container's width animates during the label
> rollout, and endpoints are stored container-relative, so pure translation
> needs no re-measure.

# Chat/Terminal Toggle Geometry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the wide Chat/Terminal toggle's animated active-label rollout while making its indicator initialize and resize reliably across remounts, themes, fonts, zoom, and header layout changes.

**Architecture:** Extract the wide control into a lifecycle-isolated `WideViewToggle`. It measures two invisible, non-animating endpoint copies with one `ResizeObserver`, stores validated endpoint geometry in component state, and distinguishes user selection transitions from snap-style environmental corrections. `HeaderBar` retains breakpoint, provider, platform-placement, and cluster-reservation decisions.

**Tech Stack:** React 19, TypeScript, browser DOM APIs (`ResizeObserver`, `requestAnimationFrame`, `getBoundingClientRect`), Tailwind utility classes, CSS motion-policy selectors, Vitest 4, jsdom, Testing Library.

**Spec:** `docs/active/investigations/2026-08-11-chat-terminal-toggle-indicator-disappears.md`

## Global Constraints

- Start execution in a new `youcoded` git worktree created with `superpowers:using-git-worktrees`: branch `fix/chat-terminal-toggle-geometry` at `/home/destin/youcoded-dev/youcoded/worktrees/toggle-geometry`. Do not edit the main checkout, which may contain other sessions' work.
- Run `bash setup.sh` before worktree creation, then branch from current `origin/master`.
- Every path below is relative to `/home/destin/youcoded-dev/youcoded/worktrees/toggle-geometry/desktop/` unless explicitly prefixed with the workspace root.
- Preserve the visual contract: only the active wide option exposes its label; label rollout and indicator movement remain 300 ms when motion is allowed.
- `useNarrowViewport()` remains the only 640 px DOM-branch source of truth. Do not add another breakpoint or use `window.innerWidth`.
- Keep `HeaderBar`'s measured 560 px `showToggleLabels` decision and symmetric cluster-reservation algorithm unchanged.
- Do not observe or continuously follow the animated visible buttons. Observe only stable sizing boxes and the container.
- Do not temporarily mutate visible label styles or force synchronous reflows to calculate endpoints.
- Endpoint state must belong to the mounted `WideViewToggle`; never persist authoritative geometry only on replaceable DOM-node CSS variables.
- Invalid geometry means any non-finite coordinate/width, width `<= 0`, or zero-sized container. Ignore invalid samples after readiness and stay hidden before readiness.
- Coalesce observer callbacks to one animation frame and deduplicate endpoint changes with an exact `0.5px` tolerance.
- Do not observe the visible container: its intrinsic width changes during the approved label rollout. Observe only the two stable endpoint boxes; read the container rect when those observations schedule a measurement.
- Environmental geometry corrections snap; only `viewMode` changes animate. Use `data-geometry-syncing`, not imperative rewriting of the indicator's transition string.
- Honor both `[data-reduced-effects]` and `@media (prefers-reduced-motion: reduce)` by disabling indicator and label spatial transitions.
- The shared renderer must remain browser-only and work in Electron, remote browsers, and Android WebView: no Node APIs, Electron IPC, or platform-specific font events.
- Add `aria-pressed` to visible buttons. The sizing layer is `aria-hidden`, inert, non-interactive, invisible, and measurable.
- Annotate non-trivial production edits with WHY comments.
- Never inspect or automate Destin's live app. Final runtime verification uses an isolated `run-dev.sh` instance and is handed to Destin for visual/timing approval.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/renderer/components/WideViewToggle.tsx` | **Create** — visible toggle, stable endpoint copies, geometry validation/dedup, observer/RAF lifecycle, readiness, syncing state | 1 |
| `src/renderer/components/WideViewToggle.test.tsx` | **Create** — deterministic geometry, lifecycle, coalescing, accessibility, label-mode, and race tests | 1 |
| `src/renderer/components/HeaderBar.tsx` | Modify — remove the old measurement machinery and render `WideViewToggle` while retaining all header decisions | 2 |
| `src/renderer/styles/globals.css` | Modify — geometry-sync and reduced-motion rules | 3 |
| `tests/toggle-motion-policy.test.ts` | **Create** — pin both app and OS motion-policy selectors and keep their declarations equivalent | 3 |
| `src/renderer/components/NarrowViewToggle.test.tsx` | Existing guard only — rerun unchanged to protect target-view semantics | 2, 4 |

`WideViewToggle` is a focused component rather than a generic segmented-control primitive. Its asymmetric active-label rollout and dual endpoint-copy measurement are unique in the current renderer; generalizing now would add an unused abstraction.

---

## Task 1: Build a lifecycle-owned wide toggle with stable endpoint measurement

**Files:**
- Create: `src/renderer/components/WideViewToggle.tsx`
- Create: `src/renderer/components/WideViewToggle.test.tsx`

**Interfaces:**
- Consumes: `ChatIcon` and `TerminalIcon` from `./Icons`; browser `ResizeObserver` and animation-frame APIs.
- Produces: default export `WideViewToggle(props: WideViewToggleProps)` where `WideViewToggleProps` has `viewMode: ViewMode`, `onToggleView: (view: ViewMode) => void`, and `showLabels: boolean`.
- Produces for tests: named exports `measureToggleEndpoints(input: ToggleMeasurementInput): ToggleEndpoints | null` and `endpointsEqual(a: ToggleEndpoints | null, b: ToggleEndpoints, tolerance?: number): boolean`.

- [ ] **Step 1: Create the failing component test harness and pure-geometry tests**

Create `src/renderer/components/WideViewToggle.test.tsx` with this initial content:

```tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WideViewToggle, {
  endpointsEqual,
  measureToggleEndpoints,
  type ToggleEndpoints,
} from './WideViewToggle';

const rect = (left: number, width: number, height = 28): DOMRect => ({
  x: left,
  y: 0,
  left,
  right: left + width,
  top: 0,
  bottom: height,
  width,
  height,
  toJSON: () => ({}),
} as DOMRect);

class ControlledResizeObserver {
  static instances: ControlledResizeObserver[] = [];
  readonly observe = vi.fn();
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();

  constructor(private readonly callback: ResizeObserverCallback) {
    ControlledResizeObserver.instances.push(this);
  }

  fire(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

let rafQueue: FrameRequestCallback[];
let cancelledFrames: number[];

function flushFrame(time = 16): void {
  const pending = rafQueue;
  rafQueue = [];
  act(() => pending.forEach(callback => callback(time)));
}

function installRects(
  container: HTMLElement,
  chatEndpoint: HTMLElement,
  terminalEndpoint: HTMLElement,
  values: { container: DOMRect; chat: DOMRect; terminal: DOMRect },
): void {
  vi.spyOn(container, 'getBoundingClientRect').mockImplementation(() => values.container);
  vi.spyOn(chatEndpoint, 'getBoundingClientRect').mockImplementation(() => values.chat);
  vi.spyOn(terminalEndpoint, 'getBoundingClientRect').mockImplementation(() => values.terminal);
}

function getGeometryNodes(container: HTMLElement) {
  return {
    root: container.querySelector<HTMLElement>('[data-testid="wide-view-toggle"]')!,
    indicator: container.querySelector<HTMLElement>('[data-testid="toggle-indicator"]')!,
    chatEndpoint: container.querySelector<HTMLElement>('[data-testid="chat-endpoint"]')!,
    terminalEndpoint: container.querySelector<HTMLElement>('[data-testid="terminal-endpoint"]')!,
    sizingLayer: container.querySelector<HTMLElement>('[data-testid="toggle-sizing-layer"]')!,
  };
}

beforeEach(() => {
  ControlledResizeObserver.instances = [];
  rafQueue = [];
  cancelledFrames = [];
  vi.stubGlobal('ResizeObserver', ControlledResizeObserver);
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    rafQueue.push(callback);
    return rafQueue.length;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => {
    cancelledFrames.push(id);
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('toggle endpoint geometry', () => {
  it('derives both endpoints relative to the mounted container', () => {
    expect(measureToggleEndpoints({
      container: rect(100, 160),
      chat: rect(102, 64),
      terminal: rect(138, 90),
    })).toEqual({
      chat: { left: 2, width: 64 },
      terminal: { left: 38, width: 90 },
    });
  });

  it.each([
    ['zero container', rect(0, 0), rect(2, 64), rect(38, 90)],
    ['zero chat width', rect(0, 160), rect(2, 0), rect(38, 90)],
    ['zero terminal width', rect(0, 160), rect(2, 64), rect(38, 0)],
    ['non-finite coordinate', rect(0, 160), rect(Number.NaN, 64), rect(38, 90)],
  ])('rejects %s', (_name, containerRect, chatRect, terminalRect) => {
    expect(measureToggleEndpoints({
      container: containerRect,
      chat: chatRect,
      terminal: terminalRect,
    })).toBeNull();
  });

  it('deduplicates subpixel movement at the exact 0.5px tolerance', () => {
    const current: ToggleEndpoints = {
      chat: { left: 2, width: 64 },
      terminal: { left: 38, width: 90 },
    };
    expect(endpointsEqual(current, {
      chat: { left: 2.49, width: 64.5 },
      terminal: { left: 37.51, width: 89.5 },
    })).toBe(true);
    expect(endpointsEqual(current, {
      chat: { left: 2.51, width: 64 },
      terminal: { left: 38, width: 90 },
    })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the pure tests and confirm they fail because the component does not exist**

Run:

```bash
cd /home/destin/youcoded-dev/youcoded/worktrees/toggle-geometry/desktop
npx vitest run src/renderer/components/WideViewToggle.test.tsx -t "toggle endpoint geometry"
```

Expected: FAIL with an import-resolution error for `./WideViewToggle`.

- [ ] **Step 3: Add the pure types, validation, and dedup implementation**

Create `src/renderer/components/WideViewToggle.tsx` with these exports first:

```tsx
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ChatIcon, TerminalIcon } from './Icons';

export type ViewMode = 'chat' | 'terminal';

export interface WideViewToggleProps {
  viewMode: ViewMode;
  onToggleView: (view: ViewMode) => void;
  showLabels: boolean;
}

export type ToggleEndpoints = Record<ViewMode, { left: number; width: number }>;

export interface ToggleMeasurementInput {
  container: DOMRect;
  chat: DOMRect;
  terminal: DOMRect;
}

const GEOMETRY_TOLERANCE_PX = 0.5;

export function measureToggleEndpoints({
  container,
  chat,
  terminal,
}: ToggleMeasurementInput): ToggleEndpoints | null {
  const values = [
    container.left, container.width, container.height,
    chat.left, chat.width,
    terminal.left, terminal.width,
  ];
  if (values.some(value => !Number.isFinite(value))) return null;
  if (container.width <= 0 || container.height <= 0 || chat.width <= 0 || terminal.width <= 0) {
    return null;
  }
  return {
    chat: { left: chat.left - container.left, width: chat.width },
    terminal: { left: terminal.left - container.left, width: terminal.width },
  };
}

export function endpointsEqual(
  current: ToggleEndpoints | null,
  next: ToggleEndpoints,
  tolerance = GEOMETRY_TOLERANCE_PX,
): boolean {
  if (!current) return false;
  return (['chat', 'terminal'] as const).every(mode =>
    Math.abs(current[mode].left - next[mode].left) <= tolerance
      && Math.abs(current[mode].width - next[mode].width) <= tolerance,
  );
}

export default function WideViewToggle(_props: WideViewToggleProps) {
  return null;
}
```

- [ ] **Step 4: Run the pure tests and confirm they pass**

Run:

```bash
npx vitest run src/renderer/components/WideViewToggle.test.tsx -t "toggle endpoint geometry"
```

Expected: PASS (3 tests, including all table rows).

- [ ] **Step 5: Add failing lifecycle, interaction, accessibility, and race tests**

Append to `WideViewToggle.test.tsx`:

```tsx
describe('WideViewToggle', () => {
  function renderToggle(viewMode: 'chat' | 'terminal' = 'chat', showLabels = true) {
    const onToggleView = vi.fn();
    const result = render(
      <WideViewToggle
        viewMode={viewMode}
        onToggleView={onToggleView}
        showLabels={showLabels}
      />,
    );
    return { ...result, onToggleView };
  }

  function makeReady(container: HTMLElement, values = {
    container: rect(100, 160),
    chat: rect(102, 64),
    terminal: rect(138, 90),
  }) {
    const nodes = getGeometryNodes(container);
    installRects(nodes.root, nodes.chatEndpoint, nodes.terminalEndpoint, values);
    act(() => ControlledResizeObserver.instances[0].fire());
    flushFrame();
    return nodes;
  }

  it('stays hidden until the current mount has valid geometry', () => {
    const { container } = renderToggle();
    const { indicator } = getGeometryNodes(container);
    expect(indicator.style.opacity).toBe('0');
  });

  it('initializes at the active endpoint while geometry transitions are suppressed', () => {
    const { container } = renderToggle('chat');
    const nodes = makeReady(container);
    expect(nodes.indicator.style.left).toBe('2px');
    expect(nodes.indicator.style.width).toBe('64px');
    expect(nodes.indicator.style.opacity).toBe('1');
    expect(nodes.root.dataset.geometrySyncing).toBe('true');
    flushFrame(32);
    expect(nodes.root.dataset.geometrySyncing).toBeUndefined();
  });

  it('moves to a cached endpoint on view change without entering geometry-sync mode', () => {
    const { container, rerender, onToggleView } = renderToggle('chat');
    const nodes = makeReady(container);
    flushFrame(32);
    fireEvent.click(screen.getByRole('button', { name: 'Terminal' }));
    expect(onToggleView).toHaveBeenCalledWith('terminal');
    rerender(
      <WideViewToggle viewMode="terminal" onToggleView={onToggleView} showLabels />,
    );
    expect(nodes.indicator.style.left).toBe('38px');
    expect(nodes.indicator.style.width).toBe('90px');
    expect(nodes.root.dataset.geometrySyncing).toBeUndefined();
    expect(container.querySelector('[data-testid="chat-label"]')?.className).toContain('duration-300');
    expect(container.querySelector('[data-testid="terminal-label"]')?.className).toContain('duration-300');
  });

  it('coalesces observer bursts and snaps an environmental correction', () => {
    const { container } = renderToggle('chat');
    const nodes = makeReady(container);
    flushFrame(32);
    const updated = {
      container: rect(100, 180),
      chat: rect(102, 72),
      terminal: rect(146, 104),
    };
    installRects(nodes.root, nodes.chatEndpoint, nodes.terminalEndpoint, updated);
    const observer = ControlledResizeObserver.instances[0];
    act(() => {
      observer.fire();
      observer.fire();
      observer.fire();
    });
    expect(rafQueue).toHaveLength(1);
    flushFrame(48);
    expect(nodes.indicator.style.left).toBe('2px');
    expect(nodes.indicator.style.width).toBe('72px');
    expect(nodes.root.dataset.geometrySyncing).toBe('true');
  });

  it('ignores invalid samples after readiness instead of hiding valid geometry', () => {
    const { container } = renderToggle('chat');
    const nodes = makeReady(container);
    flushFrame(32);
    installRects(nodes.root, nodes.chatEndpoint, nodes.terminalEndpoint, {
      container: rect(100, 0),
      chat: rect(102, 0),
      terminal: rect(102, 0),
    });
    act(() => ControlledResizeObserver.instances[0].fire());
    flushFrame(48);
    expect(nodes.indicator.style.left).toBe('2px');
    expect(nodes.indicator.style.width).toBe('64px');
    expect(nodes.indicator.style.opacity).toBe('1');
  });

  it('ignores endpoint jitter at or below 0.5px', () => {
    const { container } = renderToggle('chat');
    const nodes = makeReady(container);
    flushFrame(32);
    installRects(nodes.root, nodes.chatEndpoint, nodes.terminalEndpoint, {
      container: rect(100, 160),
      chat: rect(102.5, 64.5),
      terminal: rect(137.5, 89.5),
    });
    act(() => ControlledResizeObserver.instances[0].fire());
    flushFrame(48);
    expect(nodes.root.dataset.geometrySyncing).toBeUndefined();
    expect(nodes.indicator.style.left).toBe('2px');
    expect(nodes.indicator.style.width).toBe('64px');
  });

  it('starts unready with fresh state after unmount and remount', () => {
    const first = renderToggle();
    makeReady(first.container);
    first.unmount();
    const second = renderToggle();
    expect(getGeometryNodes(second.container).indicator.style.opacity).toBe('0');
    expect(ControlledResizeObserver.instances).toHaveLength(2);
  });

  it('disconnects its observer and cancels queued frames on unmount', () => {
    const { container, unmount } = renderToggle();
    const nodes = getGeometryNodes(container);
    installRects(nodes.root, nodes.chatEndpoint, nodes.terminalEndpoint, {
      container: rect(100, 160), chat: rect(102, 64), terminal: rect(138, 90),
    });
    act(() => ControlledResizeObserver.instances[0].fire());
    expect(rafQueue).toHaveLength(1);
    unmount();
    expect(ControlledResizeObserver.instances[0].disconnect).toHaveBeenCalledOnce();
    expect(cancelledFrames.length).toBeGreaterThan(0);
  });

  it('uses icon-only endpoint copies when labels are disabled', () => {
    const { container, rerender, onToggleView } = renderToggle('chat', true);
    const nodes = makeReady(container);
    flushFrame(32);
    rerender(
      <WideViewToggle viewMode="chat" onToggleView={onToggleView} showLabels={false} />,
    );
    expect(nodes.sizingLayer.dataset.labels).toBe('hidden');
    expect(container.querySelectorAll('[data-sizing-label].hidden')).toHaveLength(4);
  });

  it('keeps sizing markup inert and visible controls accessible', () => {
    const { container } = renderToggle('chat');
    const nodes = getGeometryNodes(container);
    expect(nodes.sizingLayer.getAttribute('aria-hidden')).toBe('true');
    expect(nodes.sizingLayer.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Chat' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Terminal' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('uses the latest view when geometry changes during rapid mode updates', () => {
    const { container, rerender, onToggleView } = renderToggle('chat');
    const nodes = makeReady(container);
    flushFrame(32);
    rerender(<WideViewToggle viewMode="terminal" onToggleView={onToggleView} showLabels />);
    rerender(<WideViewToggle viewMode="chat" onToggleView={onToggleView} showLabels />);
    installRects(nodes.root, nodes.chatEndpoint, nodes.terminalEndpoint, {
      container: rect(100, 180), chat: rect(102, 72), terminal: rect(146, 104),
    });
    act(() => ControlledResizeObserver.instances[0].fire());
    flushFrame(48);
    expect(nodes.indicator.style.left).toBe('2px');
    expect(nodes.indicator.style.width).toBe('72px');
  });
});
```

- [ ] **Step 6: Run the component tests and confirm the stub implementation fails behaviorally**

Run:

```bash
npx vitest run src/renderer/components/WideViewToggle.test.tsx
```

Expected: the pure geometry tests PASS; the `WideViewToggle` tests FAIL because the stub renders no control.

- [ ] **Step 7: Replace the stub with the complete stable-endpoint component**

In `WideViewToggle.tsx`, keep the types and pure helpers from Step 3, then replace the stub component with:

```tsx
const CONTAINER_CLASS = 'relative flex bg-inset rounded-md p-0.5 gap-0.5';
const BUTTON_LAYOUT_CLASS = 'px-1.5 sm:px-2.5 py-1 rounded-[var(--radius-toggle)] flex items-center gap-1.5';
const LABEL_LAYOUT_CLASS = 'text-xs font-medium overflow-hidden whitespace-nowrap';
const CHAT_LABEL_MAX = '3rem';
const TERMINAL_LABEL_MAX = '4.5rem';

interface EndpointRowProps {
  mode: ViewMode;
  showLabels: boolean;
  activeRef: React.RefObject<HTMLDivElement | null>;
}

function EndpointRow({ mode, showLabels, activeRef }: EndpointRowProps) {
  const chatActive = mode === 'chat';
  return (
    <div className={`${CONTAINER_CLASS} absolute inset-0 invisible pointer-events-none`}>
      <div
        ref={chatActive ? activeRef : undefined}
        className={BUTTON_LAYOUT_CLASS}
        data-testid={chatActive ? 'chat-endpoint' : undefined}
      >
        <ChatIcon className="w-3.5 h-3.5 shrink-0" />
        <span
          data-sizing-label
          className={`${LABEL_LAYOUT_CLASS} ${showLabels ? 'inline-block' : 'hidden'}`}
          style={{ maxWidth: chatActive ? CHAT_LABEL_MAX : '0' }}
        >Chat</span>
      </div>
      <div
        ref={!chatActive ? activeRef : undefined}
        className={BUTTON_LAYOUT_CLASS}
        data-testid={!chatActive ? 'terminal-endpoint' : undefined}
      >
        <TerminalIcon className="w-3.5 h-3.5 shrink-0" />
        <span
          data-sizing-label
          className={`${LABEL_LAYOUT_CLASS} ${showLabels ? 'inline-block' : 'hidden'}`}
          style={{ maxWidth: !chatActive ? TERMINAL_LABEL_MAX : '0' }}
        >Terminal</span>
      </div>
    </div>
  );
}

export default function WideViewToggle({
  viewMode,
  onToggleView,
  showLabels,
}: WideViewToggleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chatEndpointRef = useRef<HTMLDivElement>(null);
  const terminalEndpointRef = useRef<HTMLDivElement>(null);
  const endpointsRef = useRef<ToggleEndpoints | null>(null);
  const viewModeRef = useRef(viewMode);
  const measureFrameRef = useRef<number | null>(null);
  const syncEndFrameRef = useRef<number | null>(null);
  const [endpoints, setEndpoints] = useState<ToggleEndpoints | null>(null);
  const [geometrySyncing, setGeometrySyncing] = useState(true);
  viewModeRef.current = viewMode;

  const measure = useCallback(() => {
    const container = containerRef.current;
    const chat = chatEndpointRef.current;
    const terminal = terminalEndpointRef.current;
    if (!container || !chat || !terminal) return;

    const next = measureToggleEndpoints({
      container: container.getBoundingClientRect(),
      chat: chat.getBoundingClientRect(),
      terminal: terminal.getBoundingClientRect(),
    });
    if (!next || endpointsEqual(endpointsRef.current, next)) return;

    // WHY: font/theme/zoom corrections are geometry maintenance, not user
    // selections. Suppress the slide for this commit so the indicator cannot
    // visibly chase a newly loaded font, then re-arm selection motion next frame.
    endpointsRef.current = next;
    setGeometrySyncing(true);
    setEndpoints(next);
    if (syncEndFrameRef.current !== null) cancelAnimationFrame(syncEndFrameRef.current);
    syncEndFrameRef.current = requestAnimationFrame(() => {
      syncEndFrameRef.current = null;
      setGeometrySyncing(false);
    });
  }, []);

  const scheduleMeasure = useCallback(() => {
    if (measureFrameRef.current !== null) return;
    measureFrameRef.current = requestAnimationFrame(() => {
      measureFrameRef.current = null;
      measure();
    });
  }, [measure]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const chat = chatEndpointRef.current;
    const terminal = terminalEndpointRef.current;
    if (!container || !chat || !terminal) return;

    // WHY: stable endpoint copies change for every relevant cause—font load,
    // theme, zoom, label mode, or container geometry—without observing the
    // visible 300ms label animation that caused the historical stutter.
    measure();
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(chat);
    observer.observe(terminal);
    return () => {
      observer.disconnect();
      if (measureFrameRef.current !== null) cancelAnimationFrame(measureFrameRef.current);
      if (syncEndFrameRef.current !== null) cancelAnimationFrame(syncEndFrameRef.current);
    };
  }, [measure, scheduleMeasure]);

  const activeEndpoint = endpoints?.[viewModeRef.current] ?? null;

  return (
    <div
      ref={containerRef}
      data-testid="wide-view-toggle"
      data-geometry-syncing={geometrySyncing ? 'true' : undefined}
      className={`${CONTAINER_CLASS} wide-view-toggle`}
    >
      <div
        data-testid="toggle-indicator"
        className="wide-view-toggle-indicator absolute top-0.5 bottom-0.5 bg-accent rounded-[var(--radius-toggle)] transition-[left,width] duration-300 ease-in-out"
        style={{
          left: activeEndpoint ? `${activeEndpoint.left}px` : undefined,
          width: activeEndpoint ? `${activeEndpoint.width}px` : undefined,
          opacity: activeEndpoint ? 1 : 0,
        }}
      />
      <button
        type="button"
        aria-label="Chat"
        aria-pressed={viewMode === 'chat'}
        onClick={() => onToggleView('chat')}
        className={`relative z-10 ${BUTTON_LAYOUT_CLASS} transition-colors duration-300 ${
          viewMode === 'chat' ? 'text-on-accent' : 'text-fg-dim hover:text-fg-2'
        }`}
      >
        <ChatIcon className="w-3.5 h-3.5 shrink-0" />
        <span
          data-testid="chat-label"
          className={`wide-view-toggle-label ${LABEL_LAYOUT_CLASS} transition-[max-width,opacity] duration-300 ease-in-out ${showLabels ? 'inline-block' : 'hidden'}`}
          style={{ maxWidth: viewMode === 'chat' ? CHAT_LABEL_MAX : '0', opacity: viewMode === 'chat' ? 1 : 0 }}
        >Chat</span>
      </button>
      <button
        type="button"
        aria-label="Terminal"
        aria-pressed={viewMode === 'terminal'}
        onClick={() => onToggleView('terminal')}
        className={`relative z-10 ${BUTTON_LAYOUT_CLASS} transition-colors duration-300 ${
          viewMode === 'terminal' ? 'text-on-accent' : 'text-fg-dim hover:text-fg-2'
        }`}
      >
        <TerminalIcon className="w-3.5 h-3.5 shrink-0" />
        <span
          data-testid="terminal-label"
          className={`wide-view-toggle-label ${LABEL_LAYOUT_CLASS} transition-[max-width,opacity] duration-300 ease-in-out ${showLabels ? 'inline-block' : 'hidden'}`}
          style={{ maxWidth: viewMode === 'terminal' ? TERMINAL_LABEL_MAX : '0', opacity: viewMode === 'terminal' ? 1 : 0 }}
        >Terminal</span>
      </button>
      <div
        data-testid="toggle-sizing-layer"
        data-labels={showLabels ? 'shown' : 'hidden'}
        aria-hidden="true"
        className="absolute inset-0 invisible pointer-events-none"
      >
        <EndpointRow mode="chat" showLabels={showLabels} activeRef={chatEndpointRef} />
        <EndpointRow mode="terminal" showLabels={showLabels} activeRef={terminalEndpointRef} />
      </div>
    </div>
  );
}
```

Implementation review note: if React/TypeScript rejects assigning `activeRef` conditionally, use two explicit endpoint `div`s rather than a callback ref. Do not weaken types with `any`.

- [ ] **Step 8: Run the focused tests and repair test-harness-only timing differences**

Run:

```bash
npx vitest run src/renderer/components/WideViewToggle.test.tsx
```

Expected: PASS. If the initial `useLayoutEffect` runs before rectangle spies are installed, that initial sample is intentionally invalid; the controlled observer fired by `makeReady()` supplies the first valid sample. Do not add production timers or font listeners to satisfy jsdom.

- [ ] **Step 9: Commit Task 1**

```bash
git add src/renderer/components/WideViewToggle.tsx \
  src/renderer/components/WideViewToggle.test.tsx
git commit -m "feat(header): measure stable toggle endpoints"
```

Expected: one commit containing only the new component and its focused tests.

---

## Task 2: Replace HeaderBar's stale DOM-node measurement cache

**Files:**
- Modify: `src/renderer/components/HeaderBar.tsx:1-12,290-304,415-563`
- Test: `src/renderer/components/WideViewToggle.test.tsx`
- Guard: `src/renderer/components/NarrowViewToggle.test.tsx`

**Interfaces:**
- Consumes: Task 1 default export `WideViewToggle` with `viewMode`, `onToggleView`, and `showLabels`.
- Produces: `HeaderBar` wide branch renders `WideViewToggle`; no `containerRef`, `chatBtnRef`, `termBtnRef`, `measured`, `measureEndpoints`, `document.fonts.ready`, or toggle-specific `window.resize` listener remains.

- [ ] **Step 1: Add a source-level regression test that fails while stale measurement code remains**

Append this test to `WideViewToggle.test.tsx` (imports go at the top):

```tsx
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

it('keeps endpoint ownership out of HeaderBar', () => {
  const source = readFileSync(join(__dirname, 'HeaderBar.tsx'), 'utf8');
  expect(source).toContain("import WideViewToggle from './WideViewToggle'");
  expect(source).toContain('<WideViewToggle');
  expect(source).not.toContain('measureEndpoints');
  expect(source).not.toContain('--pill-chat-left');
  expect(source).not.toContain('document.fonts.ready');
});
```

- [ ] **Step 2: Run the regression and narrow tests to confirm the new test fails and the old guard passes**

Run:

```bash
npx vitest run \
  src/renderer/components/WideViewToggle.test.tsx \
  src/renderer/components/NarrowViewToggle.test.tsx
```

Expected: `WideViewToggle` source-ownership test FAILS because `HeaderBar` still contains `measureEndpoints`; all behavioral wide tests and all narrow tests PASS.

- [ ] **Step 3: Replace the old inline wide toggle with `WideViewToggle`**

In `HeaderBar.tsx`:

1. Change the icon import from:

```tsx
import { ChatIcon, TerminalIcon, GamepadIcon } from './Icons';
```

to:

```tsx
import { GamepadIcon } from './Icons';
```

2. Add beside the narrow-toggle import:

```tsx
import WideViewToggle from './WideViewToggle';
```

3. Delete the entire toggle measurement block beginning with the comment `// Pill doesn't track live button widths` through `const [measured, setMeasured] = useState(false);`. Keep `headerRef` and `showToggleLabels`.

4. Delete `measureEndpoints`, its `useLayoutEffect`, the `showToggleLabels` remeasure effect, the `document.fonts.ready` effect, the toggle-specific `window.resize` effect, and the inline `wideToggleElement` JSX.

5. Replace the old `toggleElement` declaration with:

```tsx
  // WHY: the wide toggle owns geometry with the DOM instance that consumes it;
  // crossing the narrow breakpoint now unmounts all readiness and cached
  // endpoints together instead of leaving HeaderBar with stale `measured=true`.
  const toggleElement = narrow
    ? <NarrowViewToggle viewMode={viewMode} onToggleView={onToggleView} />
    : (
      <WideViewToggle
        viewMode={viewMode}
        onToggleView={onToggleView}
        showLabels={showToggleLabels}
      />
    );
```

6. Keep every render location for `toggleElement` unchanged (`!narrow && toggleOnLeft...` and `(narrow || !toggleOnLeft)...`). Keep provider gating unchanged.

7. Remove React hook imports only if now unused. `HeaderBar` still uses `useRef`, `useLayoutEffect`, `useEffect`, and `useState` elsewhere; remove only `useCallback` if repository search confirms no remaining call in this file.

- [ ] **Step 4: Run focused tests and type-check**

Run:

```bash
npx vitest run \
  src/renderer/components/WideViewToggle.test.tsx \
  src/renderer/components/NarrowViewToggle.test.tsx
npx tsc --noEmit
```

Expected: both test files PASS and TypeScript exits 0. The source-level test proves the stale CSS-variable/font-ready architecture is gone.

- [ ] **Step 5: Verify the removal programmatically**

Run:

```bash
rg -n "measureEndpoints|--pill-(chat|term)|document\.fonts\.ready" \
  src/renderer/components/HeaderBar.tsx
```

Expected: no output, exit code 1. This expected negative is the evidence for the durable removal claim.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/renderer/components/HeaderBar.tsx \
  src/renderer/components/WideViewToggle.test.tsx
git commit -m "fix(header): scope toggle geometry to wide mount"
```

Expected: one commit integrating the component and removing the old lifecycle.

---

## Task 3: Pin geometry-sync and reduced-motion policy in CSS

**Files:**
- Modify: `src/renderer/styles/globals.css` near the shared motion-policy rules
- Create: `tests/toggle-motion-policy.test.ts`

**Interfaces:**
- Consumes: Task 1 classes `.wide-view-toggle`, `.wide-view-toggle-indicator`, `.wide-view-toggle-label` and attribute `[data-geometry-syncing='true']`.
- Produces: CSS that disables indicator transition during environmental correction and disables both spatial transitions under app or OS reduced-motion settings.

- [ ] **Step 1: Write a failing source contract for all three CSS policies**

Create `tests/toggle-motion-policy.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  join(__dirname, '..', 'src', 'renderer', 'styles', 'globals.css'),
  'utf8',
);

function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  expect(match, `missing CSS selector: ${selector}`).toBeTruthy();
  return match![1].replace(/\\s+/g, ' ').trim();
}

describe('wide toggle motion policy', () => {
  it('snaps indicator geometry while environmental measurements synchronize', () => {
    expect(ruleBody(".wide-view-toggle[data-geometry-syncing='true'] .wide-view-toggle-indicator"))
      .toContain('transition-duration: 0ms');
  });

  it('disables spatial toggle transitions for the app Reduced Effects setting', () => {
    expect(ruleBody('[data-reduced-effects] .wide-view-toggle-indicator'))
      .toContain('transition-duration: 0ms');
    expect(ruleBody('[data-reduced-effects] .wide-view-toggle-label'))
      .toContain('transition-duration: 0ms');
  });

  it('duplicates the same declarations for the OS reduced-motion preference', () => {
    const media = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)?.join('\n') ?? '';
    expect(media).toContain('.wide-view-toggle-indicator');
    expect(media).toContain('.wide-view-toggle-label');
    expect(media.match(/transition-duration:\s*0ms/g)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the CSS policy test and confirm all selectors are missing**

Run:

```bash
npx vitest run tests/toggle-motion-policy.test.ts
```

Expected: FAIL with `missing CSS selector` for geometry syncing and reduced effects.

- [ ] **Step 3: Add the geometry-sync and paired reduced-motion rules**

Add this block to `globals.css` near the existing Reduced Effects comments (before `.model-load-track` is acceptable):

```css
/* Chat/terminal toggle motion has two meanings. A user selection slides between
   stable endpoints; a font/theme/zoom correction only repairs geometry and must
   snap. The component owns the temporary data attribute so CSS remains the sole
   transition authority instead of JS rewriting inline transition strings. */
.wide-view-toggle[data-geometry-syncing='true'] .wide-view-toggle-indicator {
  transition-duration: 0ms;
}

/* Reduced Effects and the OS preference both disable the toggle's spatial
   movement. Keep these declaration bodies equivalent: one is YouCoded's own
   setting, the other is the platform accessibility preference. */
[data-reduced-effects] .wide-view-toggle-indicator {
  transition-duration: 0ms;
}
[data-reduced-effects] .wide-view-toggle-label {
  transition-duration: 0ms;
}
@media (prefers-reduced-motion: reduce) {
  .wide-view-toggle-indicator {
    transition-duration: 0ms;
  }
  .wide-view-toggle-label {
    transition-duration: 0ms;
  }
}
```

Do not disable the buttons' `transition-colors`; the requirement is to suppress spatial motion, not all state feedback.

- [ ] **Step 4: Run CSS, component, and narrow tests**

Run:

```bash
npx vitest run \
  tests/toggle-motion-policy.test.ts \
  src/renderer/components/WideViewToggle.test.tsx \
  src/renderer/components/NarrowViewToggle.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/renderer/styles/globals.css \
  tests/toggle-motion-policy.test.ts
git commit -m "fix(header): respect toggle motion preferences"
```

Expected: one commit containing only motion policy and its guard.

---

## Task 4: Run full verification and hand off interactive review

**Files:**
- Modify only if verification exposes a defect in Tasks 1–3.
- Review: workspace spec `docs/active/investigations/2026-08-11-chat-terminal-toggle-indicator-disappears.md`.

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: one verified implementation branch ready for code review; interactive visual approval remains Destin's explicit gate.

- [ ] **Step 1: Run the repository's desktop verdict from the workspace root**

Run:

```bash
cd /home/destin/youcoded-dev
bash scripts/verify.sh youcoded/worktrees/toggle-geometry
```

Expected: exit 0 for TypeScript, related Vitest, knip, ESLint, and ast-grep. Read the complete output; do not report only the final line if a warning identifies a new finding.

- [ ] **Step 2: Run the focused regression files explicitly**

Run:

```bash
cd /home/destin/youcoded-dev/youcoded/worktrees/toggle-geometry/desktop
npx vitest run \
  src/renderer/components/WideViewToggle.test.tsx \
  src/renderer/components/NarrowViewToggle.test.tsx \
  tests/toggle-motion-policy.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 3: Build the shared web UI from the worktree**

Run from the worktree repository root:

```bash
cd /home/destin/youcoded-dev/youcoded/worktrees/toggle-geometry
./scripts/build-web-ui.sh
```

Expected: renderer build exits 0 and updates/generates the Android WebView asset in the isolated worktree only. Do not run Gradle in a Windows junctioned worktree; on this Linux host, an Android build is unnecessary because no bridge or Kotlin behavior changed.

- [ ] **Step 4: Inspect the final diff for scope and forbidden architecture regressions**

Run:

```bash
git diff origin/master...HEAD -- \
  desktop/src/renderer/components/HeaderBar.tsx \
  desktop/src/renderer/components/WideViewToggle.tsx \
  desktop/src/renderer/components/WideViewToggle.test.tsx \
  desktop/src/renderer/styles/globals.css \
  desktop/tests/toggle-motion-policy.test.ts

rg -n "document\.fonts\.ready|measureEndpoints|--pill-(chat|term)" \
  desktop/src/renderer/components
```

Expected: the diff is limited to the planned files; the `rg` command prints no matches. Confirm the implementation observes stable endpoint boxes, not visible buttons.

- [ ] **Step 5: Request code review before interactive verification**

Invoke `superpowers:requesting-code-review` with the approved investigation and this plan as reviewer context. Resolve findings using `superpowers:receiving-code-review`; rerun Steps 1–4 after any production change.

Expected: no unresolved correctness, accessibility, lifecycle, or cross-platform findings.

- [ ] **Step 6: Launch an isolated labeled dev instance and hand visual checks to Destin**

From the workspace root, first choose an unused offset/profile (`bash scripts/run-dev.sh --list`), then run:

```bash
bash scripts/run-dev.sh youcoded/worktrees/toggle-geometry \
  --label "Toggle Geometry" \
  --offset 40 \
  --profile toggle-geometry
```

Ask Destin to verify in that **dev window**, not the installed app:

1. Rapidly alternate Chat and Terminal; the indicator and active label finish together without stutter or teleport.
2. Switch from a default-font theme to themes using Comfortaa, Nunito, and Space Grotesk, including an uncached first load; the indicator snaps to corrected geometry without a late selection-like slide.
3. Resize across the 560 px label threshold; icon-only and labeled modes remain aligned.
4. Resize below 640 px and back above; the newly mounted wide indicator appears in the correct active position every time.
5. Test non-100% zoom; no stale width or disappearance.
6. Toggle Reduced Effects; selection movement and label rollout become immediate while color feedback remains usable.
7. Watch the session strip; no new jump beyond the existing smooth cluster reservation.

Expected: Destin approves all seven checks. Do not build an automated cursor/timing rig unless he requests it.

- [ ] **Step 7: Record verification outcome and make a final fixup commit only if needed**

If review or verification required edits:

```bash
git add src/renderer/components/HeaderBar.tsx \
  src/renderer/components/WideViewToggle.tsx \
  src/renderer/components/WideViewToggle.test.tsx \
  src/renderer/styles/globals.css \
  tests/toggle-motion-policy.test.ts
git commit -m "fix(header): address toggle verification findings"
```

If no edits were required, do not create an empty commit. Report exact command outcomes and Destin's visual result.

- [ ] **Step 8: Finish the branch only after approval**

Invoke `superpowers:finishing-a-development-branch`. If Destin chooses merge, follow workspace policy: merge **and push**, verify the implementation commit is contained by `master`, remove the worktree, delete local/remote feature branches, and stop the isolated dev server after the push lands on `origin/master`.

Expected: no stale worktree, branch, or dev process remains after shipping.
