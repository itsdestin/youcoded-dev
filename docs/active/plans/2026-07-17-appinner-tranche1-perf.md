---
status: draft
---

# AppInner Tranche 1 — Perf Wins + Stage-0 Extractions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `AppInner` (App.tsx) re-rendering on every chat reducer dispatch — the biggest renderer perf win — plus the zero-risk stage-0 extractions, with before/after measurements proving the improvement.

**Architecture:** The chat store (`state/chat-context.ts`) already has `getState()`/`subscribeAll()` primitives. Today FOUR whole-map subscriptions inside AppInner (`useChatStateMap` at App.tsx:464, plus `usePromptDetector`, `useSubmitConfirmation`, `useRemoteAttentionSync` — all effect-only consumers) re-render the entire ~3,000-line component on every dispatch of ANY session. We convert every effect-only consumer to direct store subscriptions (no re-render), and replace the one genuine render-path consumer (`sessionStatuses`) with a cached-selector hook that re-renders AppInner only when a session's `{status, attentionState, awaitingApproval}` triple actually changes. Also: three trivial component moves + two self-contained hook extractions from the decomposition map.

**Tech Stack:** React 18 (`useSyncExternalStore`), TypeScript, vitest. Repo: `youcoded` (sub-repo — PR goes there, NOT to youcoded-dev).

**Source map:** `docs/active/investigations/2026-07-17-appinner-decomposition-map.md` (line numbers below reference `feat/buddy-feedback-tuning` @ 4432fb78; re-anchor by symbol if drifted).

---

## Prerequisites & ground rules

1. **Do NOT start until `feat/buddy-feedback-tuning` is merged to youcoded master.** This plan edits App.tsx broadly; starting earlier guarantees painful conflicts.
2. Work in a fresh worktree off youcoded `master`:
   ```bash
   cd /c/Users/desti/youcoded-dev/youcoded && git fetch origin && git pull origin master
   git worktree add ../youcoded-worktrees/appinner-tranche1 -b perf/appinner-tranche1
   ```
   Do NOT junction `node_modules` if any step will run `npm ci`/Gradle (see workspace CLAUDE.md junction warning). Run a plain `npm ci` in the worktree's `desktop/`.
3. Every task ends green: `cd desktop && npm test && npm run build` must pass before its commit.
4. Runtime verification uses the dev instance ONLY (`bash scripts/run-dev.sh` from the workspace root) — never Destin's live app (`.claude/rules/live-app-safety.md`).
5. **Behavior-preservation is the contract.** Every conversion keeps logic byte-for-byte where possible; only the subscription mechanism changes. If a step forces a semantic choice, stop and surface it.
6. Regression traps R1–R10 in the decomposition map apply throughout. The ones this plan touches directly: R1 (status/reporter ordering — solved by Task 8's design), R6 (watchdog timers), R9 (`prevAttentionRef` remote path — NOT touched here; `statusHandler` stays as-is), R10 (`lastStatusJsonRef` — untouched).

**A note on subscription-callback timing:** `store.subscribeAll` callbacks fire synchronously inside `dispatch()`. This is NOT new exposure — React's own `useSyncExternalStore` subscriber sits in the same `allSubs` set and already runs synchronously there. None of the converted callbacks dispatch chat actions synchronously (only via timers), so no reducer re-entry is possible.

---

### Task 1: Export the store + add the dev-only render profiler

**Files:**
- Modify: `desktop/src/renderer/state/chat-context.ts` (add export after `useChatDispatch`, ~line 132)
- Modify: `desktop/src/renderer/App.tsx` (the `App()` component, ~line 3230)

- [ ] **Step 1: Export `useChatStore` from chat-context.ts**

Add below `useChatDispatch` (~line 132). The internal `useStore` already exists; expose it under a public name and export the store type:

```ts
// Public store accessor for effect-only consumers (subscriptions/timers that
// read state without needing re-renders). Render-path consumers should keep
// using useChatState/useChatStateMap or a cached selector hook — reading
// getState() during render bypasses React's subscription and can tear.
export type { ChatStore };
export function useChatStore(): ChatStore {
  return useStore();
}
```

Also change `interface ChatStore` (line 37) to `export interface ChatStore`.

- [ ] **Step 2: Add the profiler harness around `<AppInner />`**

In `App()` (~line 3291), wrap the existing `<AppInner />`:

```tsx
<MarketplaceProvider>
  <AppInnerProfiler>
    <AppInner />
  </AppInnerProfiler>
</MarketplaceProvider>
```

Add above `App()` (next to `ThemeBg`), following the existing `import.meta.env.DEV` gating idiom from `ToolSandboxRoute` (line 94, including the `@ts-ignore TS1343` comment):

```tsx
// Dev-only commit profiler for the AppInner tranche-1 perf work. Accumulates
// React commit stats on window.__appInnerProfile so before/after numbers can
// be read via console or scripts/cdp-eval.mjs against the DEV instance.
// Statically dead code in production builds (DEV-gated), tree-shaken by Vite.
declare global { interface Window { __appInnerProfile?: { commits: number; totalMs: number; maxMs: number; since: number; reset: () => void } } }
function AppInnerProfiler({ children }: { children: React.ReactNode }) {
  // @ts-ignore TS1343 — import.meta is intercepted by Vite at build time
  if (!import.meta.env.DEV) return <>{children}</>;
  if (!window.__appInnerProfile) {
    window.__appInnerProfile = {
      commits: 0, totalMs: 0, maxMs: 0, since: Date.now(),
      reset() { this.commits = 0; this.totalMs = 0; this.maxMs = 0; this.since = Date.now(); },
    };
  }
  const onRender: React.ProfilerOnRenderCallback = (_id, _phase, actualDuration) => {
    const p = window.__appInnerProfile!;
    p.commits += 1;
    p.totalMs += actualDuration;
    if (actualDuration > p.maxMs) p.maxMs = actualDuration;
  };
  return <React.Profiler id="AppInner" onRender={onRender}>{children}</React.Profiler>;
}
```

- [ ] **Step 3: Verify green**

Run: `cd desktop && npm test && npm run build` — expected: all pass, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add desktop/src/renderer/state/chat-context.ts desktop/src/renderer/App.tsx
git commit -m "feat(perf): export useChatStore + dev-only AppInner commit profiler"
```

---

### Task 2: Baseline measurement

**Files:** none (measurement only)

- [ ] **Step 1: Launch the dev instance** — `bash scripts/run-dev.sh` from the workspace root.
- [ ] **Step 2: Drive a streaming workload** — start a session in the dev window, send a prompt that produces sustained output (e.g. "count from 1 to 300, one number per line, no tools"). Let it stream ~60s. Ideally repeat with 2 concurrent sessions streaming.
- [ ] **Step 3: Read the numbers** — either in the dev window's DevTools console (dev instance only!) or one-shot via CDP against the DEV instance's debugger port:
  `window.__appInnerProfile` → record `{commits, totalMs, maxMs}` and elapsed. Call `window.__appInnerProfile.reset()` between scenarios.
- [ ] **Step 4: Record baseline** — append the numbers (commits/sec, mean ms/commit, max ms) to this plan file under a `## Measurements` heading at the bottom, labeled `baseline @ <commit sha>`. Expected today: commits/sec roughly tracks total dispatch rate across ALL sessions.

---

### Task 3: Trivial component moves (stage 0)

**Files:**
- Create: `desktop/src/renderer/components/ThemeBg.tsx` (from App.tsx 3209–3217)
- Create: `desktop/src/renderer/components/StatsWithHealthBridge.tsx` (from App.tsx 3219–3228)
- Create: `desktop/src/renderer/components/RootErrorBoundary.tsx` (from App.tsx 3305–3356)
- Modify: `desktop/src/renderer/App.tsx` (delete the three definitions, add imports)

- [ ] **Step 1: Move each component verbatim** (keep the existing WHY comments). Each new file needs only its own imports:
  - `ThemeBg.tsx`: `import React from 'react'; import { useTheme } from '../state/theme-context';` + `export function ThemeBg()` (body unchanged from App.tsx:3209–3217).
  - `StatsWithHealthBridge.tsx`: `import React from 'react';` + the `useWorkerHealth` and `MarketplaceStatsProvider` imports copied from App.tsx's import block + `export function StatsWithHealthBridge(...)` (body unchanged).
  - `RootErrorBoundary.tsx`: `import React from 'react';` + `export class RootErrorBoundary ...` (body unchanged from 3309–3356, including the inline-styles-only WHY comment).
- [ ] **Step 2: Update App.tsx** — delete the three in-file definitions, add `import { ThemeBg } from './components/ThemeBg';` etc. Remove any imports App.tsx no longer needs (`useWorkerHealth`, `MarketplaceStatsProvider` — verify with `tsc` unused errors or grep before removing; `useTheme` may still be used elsewhere in App.tsx — check first).
- [ ] **Step 3: Verify green** — `cd desktop && npm test && npm run build`.
- [ ] **Step 4: Commit** — `git commit -m "refactor(renderer): move ThemeBg, StatsWithHealthBridge, RootErrorBoundary out of App.tsx"`

---

### Task 4: Extract `useZoomControls`

**Files:**
- Create: `desktop/src/renderer/hooks/useZoomControls.ts`
- Modify: `desktop/src/renderer/App.tsx` (remove lines 403–412 and 2371–2452; one hook call replaces them)

- [ ] **Step 1: Create the hook** — move state (403–412), handlers + keyboard + pinch effects (2371–2452) verbatim, preserving every WHY comment and the ref-mirror pattern (R8):

```ts
import { useState, useRef, useEffect, useCallback } from 'react';

// Zoom subsystem (Ctrl+/-/0, trackpad pinch, transient overlay state).
// Extracted from AppInner (tranche 1) — logic unchanged. The handler refs are
// assigned every render on purpose so the once-registered window listeners
// always see the latest callbacks without re-registering (App.tsx R8 pattern).
export function useZoomControls() {
  const [zoomPercent, setZoomPercent] = useState(100);
  const [zoomVisible, setZoomVisible] = useState(false);
  const zoomHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch actual zoom level on mount — Electron may have persisted a non-100% zoom
  useEffect(() => {
    (window as any).claude?.zoom?.get?.().then((p: number) => {
      if (p && p !== 100) setZoomPercent(p);
    }).catch(() => {});
  }, []);

  const showZoom = useCallback((percent: number) => {
    setZoomPercent(percent);
    setZoomVisible(true);
    if (zoomHideTimer.current) clearTimeout(zoomHideTimer.current);
    zoomHideTimer.current = setTimeout(() => setZoomVisible(false), 1500);
  }, []);

  const handleZoomIn = useCallback(async () => {
    const percent = await (window as any).claude.zoom.zoomIn();
    showZoom(percent);
  }, [showZoom]);
  const handleZoomOut = useCallback(async () => {
    const percent = await (window as any).claude.zoom.zoomOut();
    showZoom(percent);
  }, [showZoom]);
  const handleZoomReset = useCallback(async () => {
    const percent = await (window as any).claude.zoom.reset();
    showZoom(percent);
  }, [showZoom]);

  const zoomInRef = useRef(handleZoomIn);
  const zoomOutRef = useRef(handleZoomOut);
  const zoomResetRef = useRef(handleZoomReset);
  zoomInRef.current = handleZoomIn;
  zoomOutRef.current = handleZoomOut;
  zoomResetRef.current = handleZoomReset;

  // Keyboard: Ctrl+Plus, Ctrl+Minus, Ctrl+0  (verbatim from App.tsx 2403–2421)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomInRef.current(); }
      else if (e.key === '-') { e.preventDefault(); zoomOutRef.current(); }
      else if (e.key === '0') { e.preventDefault(); zoomResetRef.current(); }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);

  // Trackpad pinch-to-zoom (verbatim from App.tsx 2423–2452, incl. WHY comments)
  const pinchAccumulator = useRef(0);
  const pinchFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      pinchAccumulator.current += e.deltaY;
      if (pinchFlushTimer.current) clearTimeout(pinchFlushTimer.current);
      pinchFlushTimer.current = setTimeout(async () => {
        const delta = pinchAccumulator.current;
        pinchAccumulator.current = 0;
        if (Math.abs(delta) < 5) return;
        if (delta < 0) zoomInRef.current(); else zoomOutRef.current();
      }, 50);
    };
    window.addEventListener('wheel', handler, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', handler, true);
  }, []);

  return { zoomPercent, zoomVisible, handleZoomIn, handleZoomOut, handleZoomReset };
}
```

(When moving, copy the ORIGINAL comment blocks from App.tsx verbatim — the abbreviated bodies above show structure, the file keeps full comments.)

- [ ] **Step 2: Rewire App.tsx** — replace the removed code with `const { zoomPercent, zoomVisible, handleZoomIn, handleZoomOut, handleZoomReset } = useZoomControls();` placed where the state block was (line 403) so hook order stays stable relative to surrounding hooks. `<ZoomOverlay>` props (3177–3183) are unchanged by name.
- [ ] **Step 3: Verify green** — `cd desktop && npm test && npm run build`.
- [ ] **Step 4: Commit** — `git commit -m "refactor(renderer): extract useZoomControls from AppInner"`

---

### Task 5: Extract `useChromeMeasurements`

**Files:**
- Create: `desktop/src/renderer/hooks/useChromeMeasurements.ts`
- Modify: `desktop/src/renderer/App.tsx` (remove the three effects at 2493–2572; one hook call replaces them)

- [ ] **Step 1: Create the hook** — the three ResizeObserver effects verbatim (bottom-chrome-height 2493–2507, top-chrome vars 2528–2546 with its full NOTE comment about measuring `.header-bar` not the wrapper, Android layout-report 2550–2572). Signature:

```ts
import { useEffect } from 'react';
import { getPlatform } from '../remote-shim';   // match App.tsx's actual import for getPlatform — grep it; adjust path if it comes from elsewhere

// Chrome geometry observers extracted from AppInner (tranche 1) — logic
// unchanged. Publishes --bottom-chrome-height / --top-chrome-height /
// --top-chrome-bottom CSS vars and reports layout to Android.
// deps [sessionId, currentViewMode] are re-run TRIGGERS (chrome remounts on
// view/session changes), not values read inside — preserve them exactly.
export function useChromeMeasurements(
  headerRef: React.RefObject<HTMLDivElement | null>,
  bottomBarRef: React.RefObject<HTMLDivElement | null>,
  sessionId: string | null,
  currentViewMode: string | undefined,
) {
  /* three useEffect blocks moved verbatim, same order, same dep arrays */
}
```

- [ ] **Step 2: Rewire App.tsx** — `useChromeMeasurements(headerRef, bottomBarRef, sessionId, currentViewMode);` at the same position (2493) — it must stay AFTER `currentViewMode` is derived (2181) and BEFORE the early returns at 2575 (the Android effect's "must be before early returns" hook-order comment applies to the hook call now).
- [ ] **Step 3: Verify green + dev smoke** — `npm test && npm run build`; then in the dev instance confirm the chat content still clears the header and the input bar (the CSS vars are visibly load-bearing — a broken observer shows as chat text underlapping chrome).
- [ ] **Step 4: Commit** — `git commit -m "refactor(renderer): extract useChromeMeasurements from AppInner"`

---

### Task 6: Convert the three effect-only hooks off `useChatStateMap`

These are internal changes to each hook — zero API/callsite changes. One commit per hook.

**Files:**
- Modify: `desktop/src/renderer/hooks/usePromptDetector.ts`
- Modify: `desktop/src/renderer/hooks/useSubmitConfirmation.ts`
- Modify: `desktop/src/renderer/hooks/useRemoteAttentionSync.ts`

- [ ] **Step 1: usePromptDetector** — replace `useChatStateMap` with `useChatStore`:
  - Delete lines 51–53 (`chatState`, `chatStateRef`, render assign). Add `const store = useChatStore();`.
  - Replace both `chatStateRef.current.get(sid)` reads (lines 92, 156) with `store.getState().get(sid)`.
  - Convert the awaiting-transition effect (73–86) to a subscription — same body, reading the store:
    ```ts
    // Perf (tranche 1): direct store subscription instead of a [chatState]
    // effect — this hook no longer re-renders its host on every dispatch.
    // Callback body is unchanged from the previous effect.
    useEffect(() => {
      const check = () => {
        for (const [sid, session] of store.getState()) {
          /* body verbatim from old effect lines 74–85 */
        }
      };
      check(); // seed prevAwaitingRef with current state, as the old effect's first run did
      return store.subscribeAll(check);
    }, [store]);
    ```
  - Update the import line: `import { useChatDispatch, useChatStore } from '../state/chat-context';`
- [ ] **Step 2: Verify + commit** — `npm test` (the ink-select-parser + any prompt-flow tests pin the semantics); `git commit -m "perf(renderer): usePromptDetector reads the chat store directly (no host re-renders)"`
- [ ] **Step 3: useSubmitConfirmation** — same shape. This hook guards the stray-`\r` safety mechanism (`.claude/rules/pty-io.md`) — body must move VERBATIM:
  - Delete lines 76–80 (`chatState`, `stateRef`, render assign). Add `const store = useChatStore();`.
  - In `attemptRetry`, replace `stateRef.current.get(info.sessionId)` (line 94) with `store.getState().get(info.sessionId)`.
  - Convert the tracking effect (164–196) to `useEffect(() => { const track = () => { /* body verbatim, chatState → store.getState() */ }; track(); return store.subscribeAll(track); }, [store, attemptRetry]);`
  - The unmount-only cleanup effect (200–206) stays exactly as-is.
- [ ] **Step 4: Verify + commit** — `npm test` (submit-confirmation/outgoing-message tests pin this); `git commit -m "perf(renderer): useSubmitConfirmation subscribes to the store directly"`
- [ ] **Step 5: useRemoteAttentionSync** — same shape: `const store = useChatStore();`, effect (16–32) becomes `useEffect(() => { const sync = () => { /* body verbatim, chatState → store.getState() */ }; sync(); return store.subscribeAll(sync); }, [store]);`. Note the early `return` when `fireRemoteAttentionChanged` is missing must move INSIDE `sync()` (the API can appear later; bailing out of the whole effect would also skip subscribing — check: original bails permanently, so preserve original semantics by keeping the guard + early return OUTSIDE the subscription, exactly as today: if the API is absent at mount, subscribe nothing).
- [ ] **Step 6: Verify + commit** — `npm test`; `git commit -m "perf(renderer): useRemoteAttentionSync subscribes to the store directly"`

---

### Task 7: New cached-selector hook `useSessionAttention` (TDD)

The ONE render-path consumer. Returns a `Map<sessionId, {status, attentionState, awaitingApproval}>` whose IDENTITY changes only when some triple changes — so AppInner re-renders on dot-color/attention flips (rare), not on every transcript event.

**Files:**
- Create: `desktop/src/renderer/hooks/useSessionAttention.ts`
- Test: `desktop/src/renderer/hooks/useSessionAttention.test.tsx`

- [ ] **Step 1: Write the failing test** (model the store harness on the existing hook tests, e.g. `useSessionTasks.test.tsx`, for how they wrap `ChatProvider` and dispatch):

```tsx
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { ChatProvider, useChatDispatch } from '../state/chat-context';
import { useSessionAttention } from './useSessionAttention';

const SESSIONS = [{ id: 's1' }, { id: 's2' }] as any;

function useHarness() {
  const dispatch = useChatDispatch();
  const attention = useSessionAttention(SESSIONS, new Set<string>(), 's1');
  return { dispatch, attention };
}
const wrapper = ({ children }: { children: React.ReactNode }) => <ChatProvider>{children}</ChatProvider>;

test('identity is stable across dispatches that do not change any triple', () => {
  const { result } = renderHook(useHarness, { wrapper });
  act(() => { result.current.dispatch({ type: 'SESSION_CREATED', sessionId: 's1' } as any); });
  const first = result.current.attention;
  // A transcript text event mid-turn changes timeline but not status/attention triple
  act(() => { result.current.dispatch({ type: 'SESSION_CREATED', sessionId: 's2' } as any); });
  const afterS2 = result.current.attention;  // s2 appeared → identity SHOULD change
  expect(afterS2).not.toBe(first);
  const again = result.current.attention;
  expect(again).toBe(afterS2);              // no dispatch → stable
});

test('status flips green when a session starts thinking', () => {
  const { result } = renderHook(useHarness, { wrapper });
  act(() => { result.current.dispatch({ type: 'SESSION_CREATED', sessionId: 's1' } as any); });
  expect(result.current.attention.get('s1')?.status).toBe('gray');
  act(() => { result.current.dispatch({ type: 'USER_PROMPT', sessionId: 's1', message: { id: 'm1', text: 'hi' } } as any); });
  expect(result.current.attention.get('s1')?.status).toBe('green');
});
```

**Adjust action shapes to the real reducer's** (`state/chat-reducer.ts` / `chat-types.ts`) — the test author must use real `ChatAction` variants (whatever sets `isThinking`, e.g. the action `USER_PROMPT` maps to), not invented ones. If `SESSION_CREATED` isn't the real init action, use the one the reducer actually handles.

- [ ] **Step 2: Run to verify failure** — `cd desktop && npx vitest run src/renderer/hooks/useSessionAttention.test.tsx` — expected: FAIL (module not found).

- [ ] **Step 3: Implement the hook** — the derivation logic is App.tsx 611–658 (status priority chain, verbatim incl. comments) merged with the reporter's per-session triple (719–729):

```ts
import { useCallback, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { useChatStore } from '../state/chat-context';
import type { AttentionState } from '../state/chat-types';
import type { SessionStatusColor } from '../components/StatusDot';

export interface SessionAttentionInfo {
  status: SessionStatusColor;
  attentionState: AttentionState;
  awaitingApproval: boolean;
}

// Cached selector over the chat store. Re-renders the host ONLY when some
// session's (status, attentionState, awaitingApproval) triple changes —
// replaces AppInner's whole-map subscription (tranche 1). Derivation logic is
// verbatim from the old sessionStatuses memo (App.tsx) + attention-reporter
// triple; keep the two consumers (HeaderBar dots, attention.report) in sync
// with this ONE computation. Iterates sessions ∪ chatStateMap keys so
// chat-state-only sessions still get reported (status 'gray'), matching the
// old reporter exactly.
export function useSessionAttention(
  sessions: Array<{ id: string }>,
  viewedSessions: Set<string>,
  activeSessionId: string | null,
): Map<string, SessionAttentionInfo> {
  const store = useChatStore();
  const cacheRef = useRef<Map<string, SessionAttentionInfo>>(new Map());
  // Render-phase arg mirror (R8 pattern) so getSnapshot — called by React on
  // subscription ticks AND on ordinary re-renders — always sees current args.
  const argsRef = useRef({ sessions, viewedSessions, activeSessionId });
  argsRef.current = { sessions, viewedSessions, activeSessionId };

  const getSnapshot = useCallback((): Map<string, SessionAttentionInfo> => {
    const { sessions, viewedSessions, activeSessionId } = argsRef.current;
    const state = store.getState();
    const next = new Map<string, SessionAttentionInfo>();

    for (const s of sessions) {
      const chatState = state.get(s.id);
      if (!chatState) {
        next.set(s.id, { status: 'gray', attentionState: 'ok', awaitingApproval: false });
        continue;
      }
      // Only check tools in the active turn — stale tools from old turns are invisible
      let hasAwaiting = false;
      let hasRunning = false;
      for (const id of chatState.activeTurnToolIds) {
        const t = chatState.toolCalls.get(id);
        if (!t) continue;
        if (t.status === 'awaiting-approval') hasAwaiting = true;
        else if (t.status === 'running') hasRunning = true;
        if (hasAwaiting) break;
      }
      // Priority chain verbatim from the old memo (red → amber → green → blue → gray)
      const needsAttention = chatState.attentionState !== 'ok';
      const status: SessionStatusColor = hasAwaiting ? 'red'
        : needsAttention ? 'amber'
        : (chatState.isThinking || hasRunning) ? 'green'
        : (chatState.timeline.length > 0 && !viewedSessions.has(s.id) && s.id !== activeSessionId) ? 'blue'
        : 'gray';
      next.set(s.id, { status, attentionState: chatState.attentionState, awaitingApproval: hasAwaiting });
    }
    // Sessions present in chat state but not in the sessions list: the old
    // reporter still reported them (dot fallback 'gray') — preserve that.
    for (const [sid, chatState] of state) {
      if (next.has(sid)) continue;
      let awaitingApproval = false;
      for (const id of chatState.activeTurnToolIds) {
        const t = chatState.toolCalls.get(id);
        if (t?.status === 'awaiting-approval') { awaitingApproval = true; break; }
      }
      next.set(sid, { status: 'gray', attentionState: chatState.attentionState, awaitingApproval });
    }

    // Identity stabilization: return the previous Map when nothing changed.
    const prev = cacheRef.current;
    if (prev.size === next.size) {
      let changed = false;
      for (const [id, info] of next) {
        const p = prev.get(id);
        if (!p || p.status !== info.status || p.attentionState !== info.attentionState || p.awaitingApproval !== info.awaitingApproval) {
          changed = true; break;
        }
      }
      if (!changed) return prev;
    }
    cacheRef.current = next;
    return next;
  }, [store]);

  const subscribe = useCallback((cb: () => void) => store.subscribeAll(cb), [store]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
```

- [ ] **Step 4: Run tests to verify pass** — `npx vitest run src/renderer/hooks/useSessionAttention.test.tsx` — expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(renderer): useSessionAttention cached selector hook + tests"`

---

### Task 8: Rewire AppInner's status/sound/reporter onto `useSessionAttention`

**Files:**
- Modify: `desktop/src/renderer/App.tsx` (lines 606–746 region)

- [ ] **Step 1: Add the store handle + replace the memo** — add `const chatStore = useChatStore();` directly below `const chatStateMap = useChatStateMap();` (line 464; both coexist until Task 9 deletes the latter). Then delete `sessionStatusesRef` (609) + the `sessionStatuses` useMemo (611–658). In their place:

```ts
// Tranche 1: sessionStatuses now derives from the cached selector — AppInner
// re-renders only when a triple changes, not on every dispatch (see
// useSessionAttention). sessionStatuses keeps its old shape for HeaderBar.
const sessionAttention = useSessionAttention(sessions, viewedSessions, sessionId);
const sessionStatuses = useMemo(() => {
  const m = new Map<string, SessionStatusColor>();
  for (const [id, info] of sessionAttention) m.set(id, info.status);
  return m;
}, [sessionAttention]);
```

(Note: `sessionAttention` includes 'gray' entries for chat-state-only sessions the old memo skipped; HeaderBar looks dots up by session id so extras are inert.)

- [ ] **Step 2: Re-key the red-sound effect** — the effect at 673–681 keeps its body, dep stays `[sessionStatuses]`.
- [ ] **Step 3: Re-key the ready-sound effect** — 688–701 iterated `chatStateMap` for `isThinking`. Convert to a store subscription (same pattern as Task 6):

```ts
// Ready chime on isThinking true→false. Store-subscribed (tranche 1): the
// old [chatStateMap] effect required AppInner to re-render per dispatch.
// Body + skip-on-first-observation semantics unchanged.
useEffect(() => {
  const check = () => {
    const prev = prevThinkingRef.current;
    const next = new Map<string, boolean>();
    for (const [id, state] of chatStore.getState()) {
      const was = prev.get(id);
      const isThinking = !!state.isThinking;
      next.set(id, isThinking);
      if (was === true && !isThinking) playSound('ready');
    }
    prevThinkingRef.current = next;
  };
  check();
  return chatStore.subscribeAll(check);
}, [chatStore]);
```

(`chatStore` was added in Step 1.)

- [ ] **Step 4: Re-key the attention reporter (R1)** — the effect at 716–746 keeps running as a REACT EFFECT (not a raw subscription: it must observe the post-render `sessionAttention`, preserving the old ordering guarantee), now keyed on the selector output and reading triples from it directly:

```ts
useEffect(() => {
  const prev = lastAttentionReportedRef.current;
  const currentIds = new Set<string>();
  for (const [sid, info] of sessionAttention) {
    currentIds.add(sid);
    const next = { attentionState: info.attentionState, awaitingApproval: info.awaitingApproval, status: info.status };
    const last = prev.get(sid);
    if (!last || last.attentionState !== next.attentionState || last.awaitingApproval !== next.awaitingApproval || last.status !== next.status) {
      window.claude.attention.report({ sessionId: sid, ...next });
      prev.set(sid, next);
    }
  }
  for (const sid of prev.keys()) {
    if (!currentIds.has(sid)) {
      window.claude.attention.report({ sessionId: sid, clear: true });
      prev.delete(sid);
    }
  }
}, [sessionAttention]);
```

Keep the full original WHY comment block (703–715), amended to note the selector now carries the triple.

- [ ] **Step 5: Verify green + dev smoke** — `npm test && npm run build`; in the dev instance: dots turn green while thinking, red on a permission prompt, chime on completion, buddy dot matches (attention.report path).
- [ ] **Step 6: Commit** — `git commit -m "perf(renderer): AppInner status dots + attention reporter ride the cached selector"`

---

### Task 9: Remove `useChatStateMap()` from AppInner — convert the remaining consumers

**Files:**
- Modify: `desktop/src/renderer/App.tsx`

Remaining `chatStateMap` consumers after Task 8 (verify by grepping `chatStateMap` in App.tsx before starting — anything this list misses must be converted the same way, or stop and reassess):
compaction watchdog (513–550), clear-viewed-on-thinking (1660–1679), passive model drift (1851–1887), and the `chatStateMapRef` mirror (474–475).

- [ ] **Step 1: Retire the ref's effect** — delete `const chatStateMap = useChatStateMap();` at line 464 (`chatStore` already exists from Task 8). Replace the `chatStateMapRef` mirror (474–475) with a subscription so every existing `chatStateMapRef.current` read (≈12 sites: guardedPtySend, mount-effect handlers, getSessionState props, StatusBar onDispatch timeline read) keeps working untouched:

```ts
// Latest-value ref, now fed by a store subscription instead of re-rendering
// AppInner per dispatch (tranche 1). Reads are unchanged all over this file.
const chatStateMapRef = useRef(chatStore.getState());
useEffect(() => {
  chatStateMapRef.current = chatStore.getState();
  return chatStore.subscribeAll(() => { chatStateMapRef.current = chatStore.getState(); });
}, [chatStore]);
```

- [ ] **Step 2: Compaction watchdog → subscription** (R6) — same body, `chatStateMap` → `chatStore.getState()`, wrapped as `useEffect(() => { const check = () => { /* body verbatim incl. the steady-state short-circuit */ }; check(); return chatStore.subscribeAll(check); }, [chatStore, dispatch]);`. Timer map + its per-iteration clears are unchanged; the (pre-existing) no-cleanup-on-unmount semantics stay as-is.
- [ ] **Step 3: Clear-viewed-on-thinking → subscription** — body verbatim; `sessions` → `sessionsRef.current` (the mirror already exists for exactly this pattern), `chatStateMap.get` → `chatStore.getState().get`. `setViewedSessions` is a stable setState — safe inside the callback.
- [ ] **Step 4: Passive model drift → subscription with arg refs** — this effect also depends on `sessionId`, `sessionModels`, `pendingModel`. Add one render-phase mirror above it (file idiom):

```ts
// Latest-value mirror for the drift subscription below (assign-in-render,
// same pattern as zoomInRef et al).
const driftArgsRef = useRef({ sessionId, sessionModels, pendingModel });
driftArgsRef.current = { sessionId, sessionModels, pendingModel };
useEffect(() => {
  const check = () => {
    const { sessionId, sessionModels, pendingModel } = driftArgsRef.current;
    if (!sessionId || pendingModel) return;
    const session = chatStore.getState().get(sessionId);
    /* remainder of the body verbatim from 1854–1886, incl. all comments */
  };
  check();
  return chatStore.subscribeAll(check);
}, [chatStore]);
```

  One semantic delta to accept knowingly: the old effect ALSO re-ran when `sessionId`/`sessionModels`/`pendingModel` changed without a dispatch; the subscription only fires on dispatches. The drift this effect reconciles is *produced by* transcript dispatches (a new assistant turn carrying a model), so a dispatch always follows the state it needs to see; the `check()` seed covers mount. If the implementer finds a counterexample, keep this one as a React effect keyed on `[sessionId, sessionModels, pendingModel]` + a store-subscribed dispatch counter state instead — do not silently ship a behavior change.
- [ ] **Step 5: Delete the `useChatStateMap` import usage** — grep App.tsx for `chatStateMap` (excluding `chatStateMapRef` and `chatStore`): expected ZERO hits. Remove `useChatStateMap` from the import at line 24 (keep `useChatState` — still used elsewhere; verify with grep).
- [ ] **Step 6: Verify green + full dev smoke** — `npm test && npm run build`, then in the dev instance: send messages, watch compaction (trigger `/compact` if practical), switch sessions (viewed/blue dots), model pill behavior, prompts still detected (usePromptDetector path), submit recovery unaffected (normal sends work).
- [ ] **Step 7: Commit** — `git commit -m "perf(renderer): AppInner no longer subscribes to the whole chat map"`

---

### Task 10: After-measurement + verification

- [ ] **Step 1: Repeat Task 2's exact scenarios** in the dev instance on this branch. Record under `## Measurements` as `after @ <sha>`. Success criterion: during single-session streaming, AppInner commits/sec drops from ~dispatch-rate to near-zero (only status flips); with 2 sessions streaming the effect compounds. Mean ms/commit for the remaining commits will be similar (the tree didn't shrink) — the win is COUNT.
- [ ] **Step 2: Run the /verify skill flow** — drive the affected flows end-to-end in the dev instance (streaming, permission prompt → red dot + sound, completion chime, remote browser dot sync if practical via the shifted remote port 9950).
- [ ] **Step 3: Flag interactive checks for Destin** — sounds timing, buddy dot parity, and general feel are 30-second eyeball checks; per the workspace rule, ask rather than build a CDP rig for them.
- [ ] **Step 4: Update docs + roadmap in the workspace repo** — mark the tranche-1 portion done in `ROADMAP.md` (the "Staged AppInner decomposition" item and the "App-root useChatStateMap subscription refactor" line in the Someday deferred-perf entry), append the measurement numbers to the decomposition map doc, move this plan to `docs/archive/plans/` when merged (separate youcoded-dev commit).
- [ ] **Step 5: Open the PR against youcoded master** — title `perf(renderer): AppInner subscription refactor + stage-0 extractions (tranche 1)`; body links the decomposition map + before/after numbers. Merge means merge AND push AND archive the docs AND flip the roadmap items.

---

## Explicitly out of scope (tranche 2+)

- `<WelcomeScreen>` extraction, session model/permission hooks, marketplace nav, takeover prompt (decomposition-map stages 1–2).
- Callback-stabilization pass + memoized `BottomChrome`/`ContentArea` (stages 3–4) — only worth doing after this tranche's numbers show how much remains.
- The giant session-event-bridge mount effect and ownership wiring (stage 5) — dedicated plan required.
- `RemoteSnapshotExporter`'s whole-map subscription — deliberate and cheap (tiny subtree, remote feature needs the full map).
- `statusHandler` / `prevAttentionRef` / `lastStatusJsonRef` (R9/R10) — untouched.
- Hidden-xterm WebGL detach (GPU-side; profile first, separate item).

## Measurements

(filled in by Tasks 2 and 10)
