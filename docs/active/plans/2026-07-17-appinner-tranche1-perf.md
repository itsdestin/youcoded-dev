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

## How to execute this plan (read first)

**Line numbers are hints; symbol names are the contract.** Every line reference was taken on `feat/buddy-feedback-tuning` @ 4432fb78 and will have drifted by the time you run this. Locate code by the symbol/comment quoted in each step (`grep`), never by jumping to a line number. If a quoted snippet isn't there, that's a STOP (below), not a cue to improvise.

**The code blocks in this plan are the deliverable, not illustrations.** Where a step shows code, type that code. Where a step says "cut-and-paste from App.tsx", literally move the existing block — do not retype it from memory, do not "clean it up", do not drop comments you find redundant. This file is dense with hard-won WHY comments (stray-Enter fixes, ConPTY quirks, ordering constraints); a comment you delete is a bug someone re-introduces in six months.

**This is a behavior-preserving refactor. The ONLY intended change is which mechanism triggers a re-render.** If you find yourself improving logic, renaming a variable for clarity, or "fixing" something you noticed in passing — stop. Note it in the PR description instead. A tranche-1 PR that also fixes an unrelated bug is a tranche-1 PR that can't be reviewed.

**STOP and surface (do not guess) when:**
- A quoted code snippet doesn't match what's in the file (someone changed it since 2026-07-17).
- A step's described semantics and the actual code disagree.
- A test fails in a file this plan touches and the fix isn't obviously a typo in your own edit.
- You need to make a semantic judgment call the plan didn't anticipate — especially anything touching PTY writes, permission gating, or attention reporting.

Surfacing a blocker costs one message. Guessing wrong on `useSubmitConfirmation` silently auto-answers permission prompts in production.

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
   **Known flaky tests — do NOT chase them.** This suite has a documented load-dependent flake family (ROADMAP `#tests` items): `subagent-watcher`, `transcript-watcher > deduplicates events by uuid`, and the git-heavy `sync-spaces-*` tests time out or misfire under full-suite parallel load on Windows. None of them import chat-context, App.tsx, or any file this plan touches. If one goes red, re-run it in isolation (`npx vitest run <file>`) — if it passes alone, it is the known flake: proceed, and note it in the PR. Only a failure in a file this plan actually touches is yours.
   **Ownership check:** this plan touches ONLY `desktop/src/renderer/{App.tsx, state/chat-context.ts, hooks/*}`. A red test elsewhere is either the flake family above or pre-existing on master — verify with `git stash && npm test` before spending time on it.
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

Change `interface ChatStore` (line 37) to `export interface ChatStore`, then add the accessor:

```ts
// Public store accessor for effect-only consumers (subscriptions/timers that
// read state without needing re-renders). Render-path consumers should keep
// using useChatState/useChatStateMap or a cached selector hook — reading
// getState() during render bypasses React's subscription and can tear.
export function useChatStore(): ChatStore {
  return useStore();
}
```

**Do NOT also add `export type { ChatStore };` here** — exporting at the declaration site (above) plus a re-export is a duplicate export and tsc fails with `TS2484`. (Corrected 2026-07-17: the original plan said to do both.)

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

**On the abbreviated bodies above:** the keyboard/pinch effects are shown with their comments trimmed for plan readability. When you create the file, copy the ORIGINAL blocks out of App.tsx so every WHY comment survives the move — specifically the `'+' comes as '=' on US keyboards` explanation, the `Chromium/Electron fires wheel events with ctrlKey set for pinch` note, the accumulate/flush rationale, and the `{ passive: false }` requirement. The move is a cut-and-paste, not a retype: **zero logic changes.** If your extracted file differs from the original in anything but indentation and the added hook wrapper, you've made a mistake.

- [ ] **Step 2: Rewire App.tsx** — replace the removed code with `const { zoomPercent, zoomVisible, handleZoomIn, handleZoomOut, handleZoomReset } = useZoomControls();` placed where the state block was (line 403) so hook order stays stable relative to surrounding hooks. `<ZoomOverlay>` props (3177–3183) are unchanged by name.
- [ ] **Step 3: Verify green** — `cd desktop && npm test && npm run build`.
- [ ] **Step 4: Commit** — `git commit -m "refactor(renderer): extract useZoomControls from AppInner"`

---

### Task 5: Extract `useChromeMeasurements`

**Files:**
- Create: `desktop/src/renderer/hooks/useChromeMeasurements.ts`
- Modify: `desktop/src/renderer/App.tsx` (remove the three effects at 2493–2572; one hook call replaces them)

- [ ] **Step 1: Create the hook** — move the three ResizeObserver effects **cut-and-paste, in their existing order**: bottom-chrome-height (2493–2507), top-chrome vars (2528–2546), Android layout-report (2550–2572). Preserve every comment, especially the long NOTE at 2524–2527 explaining that we measure the inner `.header-bar`, NOT the `headerRef` wrapper (measuring the wrapper returns 0 — that bug already happened once). Signature:

```ts
import { useEffect } from 'react';
// getPlatform: copy the import line from App.tsx's existing import block
// (grep `getPlatform` in App.tsx) and fix up the relative path — it is one
// level deeper here (hooks/ → ../).

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

**The conversion recipe (applies to all three):** each hook currently calls `useChatStateMap()` purely to feed effects and a latest-value ref. Swap the map for the store handle, replace `<ref>.current` reads with `store.getState()`, and turn each `[chatState]`-keyed effect into a `store.subscribeAll` subscription that runs the identical body. Every subscription follows this shape — `check()` first (seeding the refs exactly as the old effect's first run did), then subscribe, returning the unsubscribe:

```ts
useEffect(() => {
  const check = () => { /* old effect body, chatState → store.getState() */ };
  check();
  return store.subscribeAll(check);
}, [store]);
```

- [ ] **Step 1: usePromptDetector** — full diff, not a description:
  - **Import line 3** becomes: `import { useChatDispatch, useChatStore } from '../state/chat-context';`
  - **Delete lines 51–53** (`const chatState = useChatStateMap();` + `chatStateRef` + its render assign). **Add** in their place: `const store = useChatStore();`
  - **Line 92** — inside the `onBufferReady` callback — becomes: `const sessionState = store.getState().get(sid);`
  - **Line 156** — inside the debounce timer — becomes: `const currentSession = store.getState().get(sid);`
  - **Replace the whole awaiting-transition effect (lines 73–86)** — keep its existing perf WHY comment (68–72) above it — with:
    ```ts
    // Perf (tranche 1): direct store subscription instead of a [chatState]
    // effect — this hook no longer re-renders its host (AppInner) on every
    // dispatch. Body is unchanged from the previous effect.
    useEffect(() => {
      const check = () => {
        for (const [sid, session] of store.getState()) {
          let hasAwaiting = false;
          for (const toolId of session.activeTurnToolIds) {
            const tool = session.toolCalls.get(toolId);
            if (tool && tool.status === 'awaiting-approval') { hasAwaiting = true; break; }
          }
          const wasAwaiting = prevAwaitingRef.current.get(sid) ?? false;
          if (wasAwaiting && !hasAwaiting) {
            lastPermissionClearedRef.current.set(sid, Date.now());
          }
          prevAwaitingRef.current.set(sid, hasAwaiting);
        }
      };
      check();
      return store.subscribeAll(check);
    }, [store]);
    ```
  - **Nothing else changes** — the big `onBufferReady` effect (88–225) keeps its `[dispatch]` dep and its whole body; it was never keyed on chatState.
- [ ] **Step 2: Verify + commit** — `npm test` (the ink-select-parser + any prompt-flow tests pin the semantics); `git commit -m "perf(renderer): usePromptDetector reads the chat store directly (no host re-renders)"`
- [ ] **Step 3: useSubmitConfirmation** — this hook guards the stray-`\r` safety mechanism (`.claude/rules/pty-io.md`: a bare `\r` while an Ink menu is live silently answers a permission prompt). **Every gate stays exactly as written** — you are changing WHERE state is read from, never WHEN a `\r` is sent:
  - **Import line 2** becomes: `import { useChatStore } from '../state/chat-context';`
  - **Delete lines 76–80** (`const chatState = useChatStateMap();` + `stateRef` + its render assign, keeping the `argsRef` block at 84–85 untouched). **Add**: `const store = useChatStore();`
  - **Line 94** in `attemptRetry` becomes: `const session = store.getState().get(info.sessionId);`
  - **Replace the tracking effect (lines 164–196)** with the same body reading the store:
    ```ts
    // Perf (tranche 1): store subscription instead of a [chatState] effect.
    // Tracking/cleanup semantics are unchanged — only the read path moved.
    useEffect(() => {
      const track = () => {
        const tracked = trackedRef.current;
        const seen = new Set<string>();
        for (const [sessionId, session] of store.getState()) {
          // Native sessions send in-process (native:send) — no lost-byte failure
          // mode, so never track their pending bubbles for the PTY `\r` retry.
          // Edge: during teardown the resolver may transiently return undefined
          // (the SessionInfo already removed while chat state lingers). undefined is
          // treated as claude/tracked — safe by default (a bare `\r` to a dead
          // session is a harmless no-op); a native session caught mid-teardown is a
          // low residual risk, not a correctness bug.
          if (argsRef.current.providerForSession?.(sessionId) === 'native') continue;
          for (const entry of session.timeline) {
            if (entry.kind !== 'user' || !entry.pending) continue;
            const messageId = entry.message.id;
            seen.add(messageId);
            if (tracked.has(messageId)) continue;
            tracked.set(messageId, {
              sessionId,
              retried: false,
              timer: setTimeout(() => attemptRetry(messageId), RETRY_DELAY_MS),
            });
          }
        }
        for (const [id, info] of tracked) {
          if (!seen.has(id)) {
            clearTimeout(info.timer);
            tracked.delete(id);
          }
        }
      };
      track();
      return store.subscribeAll(track);
    }, [store, attemptRetry]);
    ```
  - **The unmount-only cleanup effect (200–206) stays exactly as-is** — its empty deps are load-bearing (its comment explains why).
- [ ] **Step 4: Verify + commit** — `npm test` (submit-confirmation/outgoing-message tests pin this); `git commit -m "perf(renderer): useSubmitConfirmation subscribes to the store directly"`
- [ ] **Step 5: useRemoteAttentionSync** — the smallest of the three:
  - **Import line 2** becomes: `import { useChatStore } from '../state/chat-context';`
  - **Delete line 13** (`const chatState = useChatStateMap();`). **Add**: `const store = useChatStore();`
  - **Replace the effect (lines 16–32)** with:
    ```ts
    // Perf (tranche 1): store subscription instead of a [chatState] effect.
    // The api-missing guard stays OUTSIDE the subscription and still bails
    // permanently — identical to the previous effect's semantics (it also
    // returned before doing any work when the API was absent at mount).
    useEffect(() => {
      const api = (window as any).claude;
      if (typeof api?.fireRemoteAttentionChanged !== 'function') return;
      const sync = () => {
        const last = lastByIdRef.current;
        const chatState = store.getState();
        for (const [sessionId, session] of chatState) {
          const prev = last.get(sessionId);
          if (prev !== session.attentionState) {
            last.set(sessionId, session.attentionState);
            api.fireRemoteAttentionChanged({ sessionId, state: session.attentionState });
          }
        }
        // Clean up removed sessions so we don't keep stale entries in the ref.
        for (const sessionId of Array.from(last.keys())) {
          if (!chatState.has(sessionId)) last.delete(sessionId);
        }
      };
      sync();
      return store.subscribeAll(sync);
    }, [store]);
    ```
- [ ] **Step 6: Verify + commit** — `npm test`; `git commit -m "perf(renderer): useRemoteAttentionSync subscribes to the store directly"`

---

### Task 7: New cached-selector hook `useSessionAttention` (TDD)

The ONE render-path consumer. Returns a `Map<sessionId, {status, attentionState, awaitingApproval}>` whose IDENTITY changes only when some triple changes — so AppInner re-renders on dot-color/attention flips (rare), not on every transcript event.

**Files:**
- Create: `desktop/src/renderer/hooks/useSessionAttention.ts`
- Test: `desktop/src/renderer/hooks/useSessionAttention.test.tsx`

- [ ] **Step 1: Write the failing test**

Every action shape below is REAL — verified 2026-07-17 against `state/chat-types.ts` (`SESSION_INIT` line 214, `USER_PROMPT` 216–223, `PERMISSION_REQUEST` 314–323) and `chat-reducer.ts` (`SESSION_INIT` 283, `USER_PROMPT` 295). Do NOT invent variants; if one of these no longer type-checks, read the current `ChatAction` union and adjust, then note the drift in the PR.

Write `desktop/src/renderer/hooks/useSessionAttention.test.tsx`:

```tsx
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ChatProvider, useChatDispatch } from '../state/chat-context';
import { useSessionAttention } from './useSessionAttention';

const SESSIONS = [{ id: 's1' }, { id: 's2' }];

function Providers({ children }: { children: React.ReactNode }) {
  return <ChatProvider>{children}</ChatProvider>;
}

// viewedSessions/activeSessionId are fixed for these cases; the hook mirrors
// them into a ref, so passing new identities per render is not under test here.
function useHarness() {
  const dispatch = useChatDispatch();
  const attention = useSessionAttention(SESSIONS, new Set<string>(['s1']), 's1');
  return { dispatch, attention };
}

describe('useSessionAttention', () => {
  it('returns gray for a session with no chat state and for a freshly inited one', () => {
    const { result } = renderHook(useHarness, { wrapper: Providers });
    expect(result.current.attention.get('s1')?.status).toBe('gray');
    act(() => { result.current.dispatch({ type: 'SESSION_INIT', sessionId: 's1' }); });
    expect(result.current.attention.get('s1')?.status).toBe('gray');
    expect(result.current.attention.get('s1')?.attentionState).toBe('ok');
    expect(result.current.attention.get('s1')?.awaitingApproval).toBe(false);
  });

  it('flips to green when a session starts thinking (USER_PROMPT sets isThinking)', () => {
    const { result } = renderHook(useHarness, { wrapper: Providers });
    act(() => { result.current.dispatch({ type: 'SESSION_INIT', sessionId: 's1' }); });
    act(() => {
      result.current.dispatch({
        type: 'USER_PROMPT', sessionId: 's1', content: 'hi', timestamp: 1,
      });
    });
    expect(result.current.attention.get('s1')?.status).toBe('green');
  });

  it('flips to red + awaitingApproval when a permission request lands', () => {
    const { result } = renderHook(useHarness, { wrapper: Providers });
    act(() => { result.current.dispatch({ type: 'SESSION_INIT', sessionId: 's1' }); });
    act(() => {
      result.current.dispatch({
        type: 'PERMISSION_REQUEST', sessionId: 's1', toolName: 'Bash',
        input: { command: 'ls' }, requestId: 'req-1',
      });
    });
    expect(result.current.attention.get('s1')?.status).toBe('red');
    expect(result.current.attention.get('s1')?.awaitingApproval).toBe(true);
  });

  it('keeps Map IDENTITY stable when a dispatch changes no triple (the perf contract)', () => {
    const { result } = renderHook(useHarness, { wrapper: Providers });
    act(() => { result.current.dispatch({ type: 'SESSION_INIT', sessionId: 's1' }); });
    act(() => {
      result.current.dispatch({
        type: 'USER_PROMPT', sessionId: 's1', content: 'first', timestamp: 1,
      });
    });
    const afterThinking = result.current.attention;
    expect(afterThinking.get('s1')?.status).toBe('green');
    // Second prompt while ALREADY thinking: timeline grows, isThinking stays
    // true → no triple changes → the selector must return the SAME Map object.
    act(() => {
      result.current.dispatch({
        type: 'USER_PROMPT', sessionId: 's1', content: 'second', timestamp: 2,
      });
    });
    expect(result.current.attention).toBe(afterThinking);
  });

  it('changes identity when a triple actually changes', () => {
    const { result } = renderHook(useHarness, { wrapper: Providers });
    act(() => { result.current.dispatch({ type: 'SESSION_INIT', sessionId: 's1' }); });
    const before = result.current.attention;
    act(() => {
      result.current.dispatch({
        type: 'USER_PROMPT', sessionId: 's1', content: 'go', timestamp: 1,
      });
    });
    expect(result.current.attention).not.toBe(before);   // gray → green
  });
});
```

The identity test (case 4) is the whole point of the hook — if it passes but the others fail, the cache is over-aggressive; if it alone fails, stabilization is broken. Both are real bugs, not test noise.

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

- [ ] **Step 2: Compaction watchdog → subscription** (R6). Keep the entire existing comment block (502–512) above it. Replace the effect (513–550) with:

```ts
useEffect(() => {
  const check = () => {
    const map = chatStore.getState();
    // Perf: this runs on every reducer dispatch. Steady state (no compaction
    // in flight, no live watchdogs) short-circuits without walking the session
    // map. When a compaction is live we still iterate — preserving the
    // activity-awareness described above (timer resets on every dispatch).
    if (compactWatchdogs.current.size === 0) {
      let anyPending = false;
      for (const session of map.values()) {
        if (session.compactionPending) { anyPending = true; break; }
      }
      if (!anyPending) return;
    }
    for (const [sid, session] of map) {
      const existing = compactWatchdogs.current.get(sid);
      if (session.compactionPending) {
        // Reset on every reducer tick while pending — if transcript events are
        // flowing for this session, the timer keeps bumping and never fires.
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          const current = chatStateMapRef.current.get(sid);
          if (current?.compactionPending) {
            dispatch({
              type: 'COMPACTION_COMPLETE',
              sessionId: sid,
              markerId: `compact-timeout-${Date.now()}`,
              afterContextTokens: null,
              aborted: true,
            });
          }
          compactWatchdogs.current.delete(sid);
        }, 180_000);
        compactWatchdogs.current.set(sid, timer);
      } else if (existing) {
        clearTimeout(existing);
        compactWatchdogs.current.delete(sid);
      }
    }
  };
  check();
  return chatStore.subscribeAll(check);
}, [chatStore, dispatch]);
```

  The 180s timer still reads `chatStateMapRef.current` (Step 1 keeps that ref fed). The pre-existing no-clear-timers-on-unmount behavior is preserved deliberately — do not "fix" it here; that's a separate change with its own risk.

- [ ] **Step 3: Clear-viewed-on-thinking → subscription.** Keep the existing comment (1658–1659). Replace the effect (1660–1679) with the body below — note `sessions` becomes `sessionsRef.current` (that mirror already exists in the file for exactly this reason) and `setViewedSessions` is a stable setState, safe to call from a subscription callback:

```ts
useEffect(() => {
  const check = () => {
    const map = chatStore.getState();
    const sessions = sessionsRef.current;
    // Early-exit: skip iteration if no sessions are currently thinking.
    let anyThinking = false;
    for (const s of sessions) {
      const chatState = map.get(s.id);
      if (chatState?.isThinking) { anyThinking = true; break; }
    }
    if (!anyThinking) return;

    for (const s of sessions) {
      const chatState = map.get(s.id);
      if (chatState?.isThinking) {
        setViewedSessions((prev) => {
          if (!prev.has(s.id)) return prev;
          const next = new Set(prev);
          next.delete(s.id);
          return next;
        });
      }
    }
  };
  check();
  return chatStore.subscribeAll(check);
}, [chatStore]);
```
- [x] **Step 4: Passive model drift → cached selector (option c — RESOLVED 2026-07-17).** The plan originally proposed a plain `chatStore.subscribeAll` subscription and flagged a possible semantic delta. **That delta was real** — a Task-9 implementer agent constructed a concrete counterexample: the old effect read only the *active* session (`chatStateMap.get(sessionId)`) and its `sessionId` dep is what reconciles a session's pill *on switch-in*. A dispatch-only subscription drops that trigger, so switching into a background-drifted idle session (e.g. B auto-downshifted on a rate limit while A was active, then went idle) leaves B's pill stale until its next dispatch. The proposed dispatch-counter fallback preserves behavior but re-renders AppInner every dispatch, negating the win.

  **Resolution shipped: a cached selector, `useActiveSessionModel(sessionId)`** (`hooks/useActiveSessionModel.ts` + 5 tests). It moves the timeline walk into a `useSyncExternalStore` selector returning the active session's latest-known `ModelAlias | null` (a primitive, so Object.is handles identity — no manual cache). This preserves BOTH triggers — the transcript trigger (selector value changes → effect re-runs) AND the switch trigger (`sessionId` change re-renders, `getSnapshot` recomputes for the new session) — while re-rendering AppInner only when the active session's alias actually changes, not per dispatch. The AppInner effect becomes:
```ts
const activeSessionModel = useActiveSessionModel(sessionId);
useEffect(() => {
  if (!sessionId || pendingModel) return;
  if (!activeSessionModel) return;
  const currentAlias = sessionModels.get(sessionId);
  if (currentAlias && currentAlias !== activeSessionModel) {
    (window.claude as any).model?.setPreference(activeSessionModel);
    setSessionModels((prev) => new Map(prev).set(sessionId, activeSessionModel));
  }
}, [sessionId, activeSessionModel, sessionModels, pendingModel]);
```
  The `!pendingModel` verify-race gate (R5) and the drift-reconciliation WHY comment are preserved. Committed in `34e4b68a`. This is the pattern later tranches should reuse for any other render-path chatStateMap consumer (e.g. the incoming `nativeStatusUsage` conflict noted below).
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

## Known incoming merge conflict — `feat/native-local-reliability` (noted 2026-07-17)

That branch (Plan C, live) adds a `nativeStatusUsage` memo to AppInner keyed on `[isNativeSession, sessionId, chatStateMap]` that walks the active native session's timeline for the latest turn usage, feeding the StatusBar chips. It is a **render-path** consumer of `chatStateMap` — the same category as `sessionStatuses`, so it cannot simply become a subscription.

It is NOT on master as of this plan's execution, so Task 9 Step 5's "grep `chatStateMap` → ZERO hits" holds for this branch. But **whoever merges second owns the reconciliation**:
- If tranche 1 lands first: that branch's memo must be re-expressed as a cached selector (mirror `useSessionAttention` — subscribe via `useChatStore`, stabilize identity on the usage object) or read `chatStateMapRef.current` if a render-path read isn't actually needed.
- If that branch lands first: Task 9's grep will find this extra consumer. Do NOT delete it or leave `useChatStateMap` in place to serve it — extend `useSessionAttention` (or add a sibling `useNativeStatusUsage` selector) so the whole-map subscription still dies.

## Docs to land WITH the merge (not before)

A 2026-07-17 docs audit found the workspace docs are almost entirely unaffected (they describe the renderer at an abstraction above these internals). Two doc changes were prepared; the in-code one is on the branch, the rule one must wait for merge:

1. **DONE on the branch (`chat-context.ts` perf-rationale comment)** — rewritten to name `RemoteSnapshotExporter` as the sole remaining `useChatStateMap()` caller and to document `useChatStore()` + the "use a selector for render-path data" rule. Ships with the branch.
2. **HOLD until merge (`.claude/rules/react-renderer.md`, workspace repo)** — add a Perf bullet: *"Reading chat state on the render path: use a cached selector, not the whole map"* — `chat-context.ts` is a `useSyncExternalStore` store; `useChatState(id)` per-session; `useChatStore()` for effect-only readers + cached selectors (`useSessionAttention`, `useActiveSessionModel`); do NOT put `useChatStateMap()` on the render path (only sanctioned caller is `RemoteSnapshotExporter`); never `getState()` during render (can tear). Also add a `verify:` anchor `path: youcoded/desktop/src/renderer/hooks/useSessionAttention.ts` (`contains: "useSyncExternalStore"`) and bump `last_verified` to the merge date. **Why held:** the anchor + prose reference `useSessionAttention.ts`, which only exists on this branch — landing the rule on workspace master before the branch merges to youcoded master would fail `/audit` (missing-file anchor). Apply this rule edit in the same session the branch merges.

## Explicitly out of scope (tranche 2+)

- `<WelcomeScreen>` extraction, session model/permission hooks, marketplace nav, takeover prompt (decomposition-map stages 1–2).
- Callback-stabilization pass + memoized `BottomChrome`/`ContentArea` (stages 3–4) — only worth doing after this tranche's numbers show how much remains.
- The giant session-event-bridge mount effect and ownership wiring (stage 5) — dedicated plan required.
- `RemoteSnapshotExporter`'s whole-map subscription — deliberate and cheap (tiny subtree, remote feature needs the full map).
- `statusHandler` / `prevAttentionRef` / `lastStatusJsonRef` (R9/R10) — untouched.
- Hidden-xterm WebGL detach (GPU-side; profile first, separate item).

## Measurements

**Status 2026-07-17:** all 8 implementation tasks committed on `perf/appinner-tranche1` and statically verified — `tsc --noEmit` clean, full suite green (238 files / 2551 passed + 35 skipped, no flakes), `vite build` clean. App.tsx 3356 → 3114 lines (−242); 9 new focused files (5 hooks + 3 components + the profiler harness).

**Adversarial review (2026-07-17):** a diff-level review of the perf-core commits ran. Verdict: behavior-preserving; the safety-critical stray-`\r`/auto-answer guard (`useSubmitConfirmation`) confirmed fully preserved. It found ONE real regression — the ready-sound effect had become a per-dispatch subscription that would spam `ready` chimes during transcript replay/hydrate (a batch of N turn dispatches toggling `isThinking` intra-batch). **Fixed in `604b8403`** by reverting it to a React effect keyed on `[sessionAttention]` (coalesces to one post-commit run, mirroring the attention-sound effect). Findings #2/#4/#5 were negligible (idempotent bodies / unreachable paths), left as-is; #3 was a comment-honesty fix. This regression is the reason the ready-sound path is worth a 30-second ear-check during the dev-instance measurement: resume a chatty session, confirm it chimes once (not per historical turn).

**In-situ measurement (2026-07-17, Destin's dev instance, branch `perf/appinner-tranche1`).** Workload: a ~10-turn back-and-forth counting exchange (many turn boundaries — each assistant reply is an `isThinking` true→false flip, the case that legitimately re-renders AppInner). `window.__appInnerProfile` after:

| metric | measured | reading |
|---|---|---|
| `appInnerRenders` | **31** | AppInner's OWN re-renders across the whole exchange — the tranche-1 metric |
| `subtreeCommits` | **615** | AppInner-subtree commits (ChatView redrawing per streamed token) — unchanged by this tranche |
| `totalMs` / `maxMs` | 3273 / 189 | subtree render time total / heaviest single commit (≈ initial mount) |

**Result: ~20× fewer AppInner re-renders.** Before this tranche AppInner subscribed to the whole chat map (new ref per dispatch), so its re-render count was coupled 1:1 to dispatches — i.e. the counterfactual "before" `appInnerRenders` ≈ `subtreeCommits` ≈ **615**. Measured "after" is **31** (≈ the turn-boundaries + session setup/focus/status changes), a ~95% cut in how often the 3,000-line component re-runs its hooks and rebuilds its tree. This matches `selector-rerender.test.tsx` exactly (old pattern re-renders per dispatch; selector only on triple changes). The unchanged `subtreeCommits: 615` is the quantified target for the future memoized-children tranche (stabilize callbacks + `React.memo` BottomChrome/ContentArea) — now it has a baseline. (Note: the counting exchange chimes once per LIVE assistant turn, which is correct; the ready-sound *replay* regression fix — `604b8403` — is verified separately by resuming a session with prior history and confirming silence.)

### Commit map (11 commits)
- `7638e6a9` Task 1 — export useChatStore + dev profiler
- `15ba8cc2` / `85a2cc74` / `90af57aa` Task 6 — three hooks → store subscriptions
- `b12da4f1` / `09b7495c` Task 7 — useSessionAttention selector + tests (+ amber rationale)
- `59dad0e5` Task 8 — status dots + attention reporter → selector
- `34e4b68a` Task 9 — remove AppInner useChatStateMap (incl. useActiveSessionModel, option c)
- `97d1bf7e` Task 3 — ThemeBg / StatsWithHealthBridge / RootErrorBoundary → own files
- `796f584a` Task 4 — useZoomControls
- `7d374fb1` Task 5 — useChromeMeasurements
- `604b8403` review followups — ready-sound regression fix + dead-import/comment cleanup
