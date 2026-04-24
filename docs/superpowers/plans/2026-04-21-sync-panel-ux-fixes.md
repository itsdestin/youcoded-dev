# Sync Panel UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve five sync panel UX issues — drop OS/toolkit metadata, unify sync-status derivation across the compact row + per-backend dots + status bar pill, collapse the status bar to a single severity-aware pill, and restyle the "Synced Data" tiles so their visual affordance matches their read-only behavior.

**Architecture:** A new pure helper `deriveSyncState()` becomes the single source of truth for sync UI status across three call sites that today have independent (and disagreeing) derivations. The status bar widget's per-warning loop collapses to one derived pill. Two unrelated visual fixes (drop platform/toolkit line, restyle category tiles) are pure markup edits in `SyncPanel.tsx`.

**Tech Stack:** TypeScript, React 18, Vitest 4, Tailwind utility classes, Electron renderer (also runs unmodified inside Android WebView).

**Spec:** `docs/superpowers/specs/2026-04-21-sync-panel-ux-design.md`

**Repo / branch convention:** All edits are inside the `youcoded/` repo (the app), not the workspace scaffold. The workspace rule (`youcoded-dev/CLAUDE.md`) requires non-trivial work to happen in a worktree. Create one before starting Task 1:

```bash
cd youcoded
git fetch origin && git pull origin master
git worktree add ../youcoded-worktrees/sync-panel-ux-fixes -b feat/sync-panel-ux-fixes
cd ../youcoded-worktrees/sync-panel-ux-fixes/desktop
npm ci   # only first time in this worktree
```

All file paths in this plan are **relative to `youcoded/`** (the worktree root). Inside the worktree, `desktop/` is your day-to-day directory.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `desktop/src/renderer/state/sync-display-state.ts` | new | `deriveSyncState()` pure helper + `SyncDisplayState` discriminated union. Importable from any renderer component without pulling Node-only dependencies. |
| `desktop/src/renderer/state/sync-display-state.test.ts` | new | Vitest unit tests covering all six state branches + severity precedence + scoped-by-backendId behavior. |
| `desktop/src/renderer/components/SyncPanel.tsx` | modify | Replace two existing dot/label derivations with helper calls. Remove the OS/toolkit metadata line. Replace the chip cluster with an inline read-only list. |
| `desktop/src/renderer/components/StatusBar.tsx` | modify | Replace the `warnings.map(...)` per-warning pill loop with a single derived "Sync Failing" / "Sync Warning" pill driven by the same helper. |

No changes to `src/main/`. No changes to IPC. No changes to Android Kotlin code. No changes to `cc-dependencies.md` (no Claude Code coupling touched).

---

## Task 1: Create `deriveSyncState` helper with full test coverage

**Files:**
- Create: `desktop/src/renderer/state/sync-display-state.ts`
- Create: `desktop/src/renderer/state/sync-display-state.test.ts`

The helper is pure: input is a small struct, output is a discriminated union. No React, no IPC, no DOM. This makes it trivially unit-testable and reusable across `SyncPanel.tsx` (compact row + per-backend dots) and `StatusBar.tsx` (single pill).

**The `SyncWarning` type already exists** in `desktop/src/main/sync-state.ts:46-56`:
```ts
export interface SyncWarning {
  code: string;
  level: 'danger' | 'warn';
  backendId?: string;
  title: string;
  body: string;
  fixAction?: SyncFixAction;
  dismissible: boolean;
  stderr?: string;
  createdEpoch: number;
}
```

We import it as a **type-only** import (`import type`) so the renderer doesn't pull in any Node code — TypeScript erases type-only imports at build time.

- [ ] **Step 1: Write the failing tests**

Create `desktop/src/renderer/state/sync-display-state.test.ts` with the following content:

```ts
import { describe, it, expect } from 'vitest';
import { deriveSyncState } from './sync-display-state';
import type { SyncWarning } from '../../main/sync-state';

const NOW_EPOCH = Math.floor(Date.now() / 1000);

const warn = (overrides: Partial<SyncWarning> = {}): SyncWarning => ({
  code: 'TEST',
  level: 'warn',
  title: 't',
  body: 'b',
  dismissible: true,
  createdEpoch: NOW_EPOCH,
  ...overrides,
});

describe('deriveSyncState', () => {
  it('returns unconfigured when there are no backends', () => {
    const result = deriveSyncState({
      hasBackends: false,
      syncInProgress: false,
      lastSyncEpoch: null,
      warnings: [],
    });
    expect(result).toEqual({ kind: 'unconfigured' });
  });

  it('returns syncing whenever syncInProgress is true, even with active warnings', () => {
    const result = deriveSyncState({
      hasBackends: true,
      syncInProgress: true,
      lastSyncEpoch: NOW_EPOCH - 30,
      warnings: [warn({ level: 'danger' })],
    });
    expect(result).toEqual({ kind: 'syncing' });
  });

  it('returns failing when any danger warning is present', () => {
    const warnings = [warn({ level: 'warn' }), warn({ code: 'AUTH_EXPIRED', level: 'danger' })];
    const result = deriveSyncState({
      hasBackends: true,
      syncInProgress: false,
      lastSyncEpoch: NOW_EPOCH - 30,
      warnings,
    });
    expect(result).toEqual({ kind: 'failing', warningCount: 2 });
  });

  it('returns attention when only warn-level warnings are present', () => {
    const warnings = [warn({ code: 'PROJECTS_UNSYNCED' }), warn({ code: 'SKILLS_UNROUTED' })];
    const result = deriveSyncState({
      hasBackends: true,
      syncInProgress: false,
      lastSyncEpoch: NOW_EPOCH - 30,
      warnings,
    });
    expect(result).toEqual({
      kind: 'attention',
      warningCount: 2,
      lastSyncEpoch: NOW_EPOCH - 30,
    });
  });

  it('returns synced when no warnings and last sync was within 24h', () => {
    const result = deriveSyncState({
      hasBackends: true,
      syncInProgress: false,
      lastSyncEpoch: NOW_EPOCH - 3600, // 1h ago
      warnings: [],
    });
    expect(result).toEqual({ kind: 'synced', lastSyncEpoch: NOW_EPOCH - 3600 });
  });

  it('returns stale when no warnings and last sync was over 24h ago', () => {
    const oldEpoch = NOW_EPOCH - 90000; // ~25h ago
    const result = deriveSyncState({
      hasBackends: true,
      syncInProgress: false,
      lastSyncEpoch: oldEpoch,
      warnings: [],
    });
    expect(result).toEqual({ kind: 'stale', lastSyncEpoch: oldEpoch });
  });

  it('returns stale when there is no last sync recorded', () => {
    const result = deriveSyncState({
      hasBackends: true,
      syncInProgress: false,
      lastSyncEpoch: null,
      warnings: [],
    });
    expect(result).toEqual({ kind: 'stale', lastSyncEpoch: null });
  });

  describe('scoped to backendId', () => {
    it('only considers warnings whose backendId matches the scope', () => {
      const warnings = [
        warn({ level: 'danger', backendId: 'drive-1' }),
        warn({ level: 'warn', backendId: 'github-1' }),
      ];
      const driveResult = deriveSyncState({
        hasBackends: true,
        syncInProgress: false,
        lastSyncEpoch: NOW_EPOCH - 30,
        warnings,
        scope: { backendId: 'drive-1' },
      });
      expect(driveResult.kind).toBe('failing');

      const githubResult = deriveSyncState({
        hasBackends: true,
        syncInProgress: false,
        lastSyncEpoch: NOW_EPOCH - 30,
        warnings,
        scope: { backendId: 'github-1' },
      });
      expect(githubResult.kind).toBe('attention');
    });

    it('ignores warnings without a backendId when scoped', () => {
      const warnings = [warn({ level: 'danger', backendId: undefined })];
      const result = deriveSyncState({
        hasBackends: true,
        syncInProgress: false,
        lastSyncEpoch: NOW_EPOCH - 30,
        warnings,
        scope: { backendId: 'drive-1' },
      });
      expect(result.kind).toBe('synced');
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd desktop
npx vitest run src/renderer/state/sync-display-state.test.ts
```

Expected: All tests FAIL with an import resolution error like `Cannot find module './sync-display-state'`. This confirms the test file is correctly resolving paths and the helper truly does not exist yet.

- [ ] **Step 3: Create the helper to make tests pass**

Create `desktop/src/renderer/state/sync-display-state.ts` with the following content:

```ts
import type { SyncWarning } from '../../main/sync-state';

export type SyncDisplayState =
  | { kind: 'unconfigured' }
  | { kind: 'syncing' }
  | { kind: 'failing'; warningCount: number }
  | { kind: 'attention'; warningCount: number; lastSyncEpoch: number | null }
  | { kind: 'synced'; lastSyncEpoch: number }
  | { kind: 'stale'; lastSyncEpoch: number | null };

export interface DeriveSyncStateInput {
  hasBackends: boolean;
  syncInProgress: boolean;
  lastSyncEpoch: number | null;
  warnings: SyncWarning[];
  /** When provided, only warnings whose `backendId` matches are considered. */
  scope?: { backendId: string };
}

const TWENTY_FOUR_HOURS_SECONDS = 86400;

export function deriveSyncState(input: DeriveSyncStateInput): SyncDisplayState {
  const { hasBackends, syncInProgress, lastSyncEpoch, warnings, scope } = input;

  if (!hasBackends) return { kind: 'unconfigured' };
  if (syncInProgress) return { kind: 'syncing' };

  // Filter warnings to the requested scope (panel-wide vs per-backend).
  const relevantWarnings = scope
    ? warnings.filter(w => w.backendId === scope.backendId)
    : warnings;

  const dangerCount = relevantWarnings.filter(w => w.level === 'danger').length;
  if (dangerCount > 0) {
    return { kind: 'failing', warningCount: relevantWarnings.length };
  }

  if (relevantWarnings.length > 0) {
    return { kind: 'attention', warningCount: relevantWarnings.length, lastSyncEpoch };
  }

  if (lastSyncEpoch !== null) {
    const ageSeconds = Math.floor(Date.now() / 1000) - lastSyncEpoch;
    if (ageSeconds < TWENTY_FOUR_HOURS_SECONDS) {
      return { kind: 'synced', lastSyncEpoch };
    }
  }

  return { kind: 'stale', lastSyncEpoch };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd desktop
npx vitest run src/renderer/state/sync-display-state.test.ts
```

Expected: PASS. All 9 tests pass.

- [ ] **Step 5: Commit**

```bash
cd ..   # back to youcoded/
git add desktop/src/renderer/state/sync-display-state.ts desktop/src/renderer/state/sync-display-state.test.ts
git commit -m "feat(sync): add deriveSyncState helper for unified status logic"
```

---

## Task 2: Wire `deriveSyncState` into the compact row in `SyncPanel.tsx`

**Files:**
- Modify: `desktop/src/renderer/components/SyncPanel.tsx` (lines around 215-264 — the `SyncSection` component's compact row)

The compact row today derives its dot color and label independently of warnings (`SyncPanel.tsx:215-228`), then renders a separate red badge for warning count (`SyncPanel.tsx:248-260`). Replace both with a single helper-driven render so warnings can no longer disagree with the headline.

- [ ] **Step 1: Add the helper import**

Open `desktop/src/renderer/components/SyncPanel.tsx`. Find the existing imports near the top of the file (around line 12-20). Add a new import line directly after the `SyncWarning` type import on line 13:

Replace:
```ts
import type { SyncWarning } from '../../main/sync-state';
```

With:
```ts
import type { SyncWarning } from '../../main/sync-state';
import { deriveSyncState, type SyncDisplayState } from '../state/sync-display-state';
```

- [ ] **Step 2: Replace the compact-row derivation and label**

Find the compact-row block in `SyncPanel.tsx` — it's the section that starts with the comment `// Derive summary for compact row` (around line 214) and continues through the `<button>` rendering and ends just before the `{open && createPortal(...)` block.

The current code is:

```tsx
  // Derive summary for compact row
  const syncCount = status?.backends.filter(b => b.syncEnabled).length ?? 0;
  const storageCount = status?.backends.filter(b => !b.syncEnabled).length ?? 0;
  const warningCount = status?.warnings.length ?? 0;
  const lastSyncText = status?.lastSyncEpoch ? timeAgo(status.lastSyncEpoch) : 'Never';

  // Status dot: only considers sync-enabled backends
  const syncBackends = status?.backends.filter(b => b.syncEnabled) ?? [];
  const dotColor = !status || syncBackends.length === 0
    ? 'bg-fg-muted/40'
    : status.syncInProgress
      ? 'bg-blue-400 animate-pulse'
      : status.lastSyncEpoch && (Date.now() / 1000 - status.lastSyncEpoch) < 86400
        ? 'bg-green-500'
        : 'bg-yellow-500';

  return (
    <section>
      <h3 className="text-[10px] font-medium text-fg-muted tracking-wider uppercase mb-3">Sync</h3>

      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-inset/50 hover:bg-inset transition-colors text-left"
      >
        <div className="flex items-center justify-center shrink-0" style={{ width: 32, height: 20 }}>
          <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs text-fg font-medium">
            {loading ? 'Loading...' :
             (syncCount + storageCount) === 0 ? 'Not configured' :
             status?.syncInProgress ? 'Syncing...' :
             `Last synced ${lastSyncText}`}
          </span>
          {(syncCount + storageCount) > 0 && (
            <span className="text-[10px] text-fg-muted ml-2">
              {syncCount > 0 ? `${syncCount} synced` : ''}
              {syncCount > 0 && storageCount > 0 ? ' · ' : ''}
              {storageCount > 0 ? `${storageCount} paused` : ''}
            </span>
          )}
        </div>
        {warningCount > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-[#DD4444]/15 text-[#DD4444] text-[9px] font-medium shrink-0">
            {warningCount}
          </span>
        )}
        <svg className="w-3.5 h-3.5 text-fg-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
```

Replace the entire block above (from `// Derive summary for compact row` through the closing `</button>`) with:

```tsx
  // Backend counts kept for the secondary "X synced · Y paused" caption.
  const syncCount = status?.backends.filter(b => b.syncEnabled).length ?? 0;
  const storageCount = status?.backends.filter(b => !b.syncEnabled).length ?? 0;

  // Single derivation: compact row dot + label + badge all flow from this state.
  // Severity-aware so the row can never read "Synced" while warnings are active.
  const display: SyncDisplayState = deriveSyncState({
    hasBackends: (status?.backends.length ?? 0) > 0,
    syncInProgress: status?.syncInProgress ?? false,
    lastSyncEpoch: status?.lastSyncEpoch ?? null,
    warnings: status?.warnings ?? [],
  });

  const dotColor = dotColorForState(display);
  const primaryLabel = primaryLabelForState(display, loading);
  const badge = badgeForState(display);

  return (
    <section>
      <h3 className="text-[10px] font-medium text-fg-muted tracking-wider uppercase mb-3">Sync</h3>

      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-inset/50 hover:bg-inset transition-colors text-left"
      >
        <div className="flex items-center justify-center shrink-0" style={{ width: 32, height: 20 }}>
          <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs text-fg font-medium">{primaryLabel}</span>
          {(syncCount + storageCount) > 0 && display.kind !== 'failing' && (
            <span className="text-[10px] text-fg-muted ml-2">
              {syncCount > 0 ? `${syncCount} synced` : ''}
              {syncCount > 0 && storageCount > 0 ? ' · ' : ''}
              {storageCount > 0 ? `${storageCount} paused` : ''}
            </span>
          )}
        </div>
        {badge}
        <svg className="w-3.5 h-3.5 text-fg-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
```

- [ ] **Step 3: Add the three rendering helpers near the top of the file**

Find the existing `timeAgo()` helper in `SyncPanel.tsx` (around line 99-108). Directly after `timeAgo`, add three new helper functions. They turn the `SyncDisplayState` discriminated union into the visual pieces the JSX needs:

```tsx
function dotColorForState(state: SyncDisplayState): string {
  switch (state.kind) {
    case 'unconfigured': return 'bg-fg-muted/40';
    case 'syncing':      return 'bg-blue-400 animate-pulse';
    case 'failing':      return 'bg-red-500';
    case 'attention':    return 'bg-green-500';
    case 'synced':       return 'bg-green-500';
    case 'stale':        return 'bg-yellow-500';
  }
}

function primaryLabelForState(state: SyncDisplayState, loading: boolean): string {
  if (loading) return 'Loading...';
  switch (state.kind) {
    case 'unconfigured': return 'Not configured';
    case 'syncing':      return 'Syncing...';
    case 'failing':      return 'Sync Failing';
    case 'attention':    return state.lastSyncEpoch ? `Last synced ${timeAgo(state.lastSyncEpoch)}` : 'Never synced';
    case 'synced':       return `Last synced ${timeAgo(state.lastSyncEpoch)}`;
    case 'stale':        return state.lastSyncEpoch ? `Last synced ${timeAgo(state.lastSyncEpoch)}` : 'Never synced';
  }
}

function badgeForState(state: SyncDisplayState): React.ReactNode {
  if (state.kind === 'failing') {
    return (
      <span className="px-1.5 py-0.5 rounded-full bg-[#DD4444]/15 text-[#DD4444] text-[9px] font-medium shrink-0">
        {state.warningCount}
      </span>
    );
  }
  if (state.kind === 'attention') {
    return (
      <span className="px-1.5 py-0.5 rounded-full bg-[#FF9800]/15 text-[#FF9800] text-[9px] font-medium shrink-0">
        {state.warningCount}
      </span>
    );
  }
  return null;
}
```

- [ ] **Step 4: Run typecheck to verify**

```bash
cd desktop
npx tsc --noEmit
```

Expected: PASS (no type errors). If you see "Cannot find name 'React'" — `React` is already imported at the top of `SyncPanel.tsx` (line 12: `import React, ...`), so this should not occur. If it does, the helpers may have been pasted outside the file scope; verify they sit at module top level alongside `timeAgo()`.

- [ ] **Step 5: Run the existing test to verify nothing else broke**

```bash
cd desktop
npx vitest run src/renderer/state/sync-display-state.test.ts
```

Expected: PASS. (We're not adding new tests in this task — the helper is already covered, and these helpers are too thin to test independently.)

- [ ] **Step 6: Commit**

```bash
cd ..
git add desktop/src/renderer/components/SyncPanel.tsx
git commit -m "fix(sync): unify compact-row status with deriveSyncState helper

Replaces the time-only dot derivation that ignored warnings.
Compact row now reads 'Sync Failing' (red) for danger warnings
and shows an amber badge for warn-level only states."
```

---

## Task 3: Wire `deriveSyncState` into per-backend dots

**Files:**
- Modify: `desktop/src/renderer/components/SyncPanel.tsx` (per-backend dot block around line 621-634, inside the popup)

The per-backend dot block today already filters by `backendId` and checks danger/warn levels — it's the more correct of the two existing derivations. We replace it with the helper anyway so all status dots in the panel share one truth and future spec changes touch one function. The visual outcome stays the same (in fact slightly better since the helper handles `unconfigured`/`syncing` states uniformly).

- [ ] **Step 1: Replace the per-backend dot block**

Find the per-backend dot in `SyncPanel.tsx` — it's an inline IIFE with the comment `{/* Status dot — color derived from scoped warnings for this backend. */}` (around line 621-634).

Current code:

```tsx
                      {/* Status dot — color derived from scoped warnings for this backend. */}
                      {(() => {
                        const scoped = status.warnings.filter(w => w.backendId === b.id);
                        const hasDanger = scoped.some(w => w.level === 'danger');
                        const hasWarn = scoped.some(w => w.level === 'warn');
                        const dotClass =
                          hasDanger ? 'bg-red-500'
                          : hasWarn ? 'bg-amber-500'
                          : actionFeedback[b.id]?.includes('ing') ? 'bg-blue-400 animate-pulse'
                          : b.syncEnabled && b.connected && b.lastPushEpoch && (Date.now() / 1000 - b.lastPushEpoch) < 86400 ? 'bg-green-500'
                          : b.syncEnabled && b.connected ? 'bg-yellow-500'
                          : 'bg-fg-muted/40';
                        return <div className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />;
                      })()}
```

Replace with:

```tsx
                      {/* Status dot — same severity logic as the panel-wide row, scoped to this backend.
                          Action-feedback "uploading/downloading" overlays the helper-derived color. */}
                      {(() => {
                        const scopedDisplay = deriveSyncState({
                          hasBackends: true,
                          // syncInProgress is global; per-backend "syncing" comes from per-backend action feedback below.
                          syncInProgress: false,
                          lastSyncEpoch: b.lastPushEpoch,
                          warnings: status.warnings,
                          scope: { backendId: b.id },
                        });
                        const inFlight = actionFeedback[b.id]?.includes('ing');
                        const baseClass = dotColorForState(scopedDisplay);
                        // When the backend isn't connected/sync-enabled at all, dim the dot regardless of warnings.
                        const offline = !b.syncEnabled || !b.connected;
                        const dotClass = inFlight
                          ? 'bg-blue-400 animate-pulse'
                          : offline && scopedDisplay.kind !== 'failing'
                            ? 'bg-fg-muted/40'
                            : baseClass;
                        return <div className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />;
                      })()}
```

The `inFlight` and `offline` overlays preserve existing behavior the helper doesn't model — per-backend transient states (uploading/downloading) and the dimmed state for paused/disconnected backends. Danger warnings still win over offline because the user needs to see "this backend is broken" even when it's marked storage-only.

- [ ] **Step 2: Run typecheck**

```bash
cd desktop
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd ..
git add desktop/src/renderer/components/SyncPanel.tsx
git commit -m "fix(sync): per-backend dots use deriveSyncState helper for consistency"
```

---

## Task 4: Replace `StatusBar.tsx` per-warning loop with one derived pill

**Files:**
- Modify: `desktop/src/renderer/components/StatusBar.tsx` (lines around 819-831)

Today `StatusBar.tsx:819-831` maps every warning to its own pill. With three warnings, three pills crowd the bar. Collapse to at most one pill driven by `deriveSyncState`.

- [ ] **Step 1: Add the helper import**

Open `desktop/src/renderer/components/StatusBar.tsx`. Find the existing import line:

```ts
import type { SyncWarning } from '../../main/sync-state';
```

(around line 7). Add a second import line directly after:

```ts
import type { SyncWarning } from '../../main/sync-state';
import { deriveSyncState } from '../state/sync-display-state';
```

- [ ] **Step 2: Replace the per-warning map with a single derived pill**

Find the block in `StatusBar.tsx` that starts with the comment `{/* Sync warnings */}` (around line 819-831).

Current code:

```tsx
      {/* Sync warnings */}
      {show('sync-warnings') && warnings.map((w, i) => {
        const handler = onOpenSync || onRunSync;
        return (
          <button
            key={i}
            onClick={handler}
            className={`px-1.5 py-0.5 rounded-sm border text-[9px] sm:text-[10px] ${warnStyles[w.level]} ${handler ? 'cursor-pointer hover:brightness-125 transition-all' : ''}`}
          >
            {w.text}
          </button>
        );
      })}
```

Replace with:

```tsx
      {/* Sync status pill — at most one badge total.
          Red "Sync Failing" for any danger-level warning,
          orange "Sync Warning" for warn-only,
          nothing when synced. Click opens the panel where the descriptive copy lives. */}
      {show('sync-warnings') && (() => {
        const handler = onOpenSync || onRunSync;
        const display = deriveSyncState({
          hasBackends: (syncWarnings ?? []).length > 0, // any warning at all implies a backend exists
          syncInProgress: false,
          lastSyncEpoch: null,
          warnings: syncWarnings ?? [],
        });
        if (display.kind !== 'failing' && display.kind !== 'attention') return null;
        const isFailing = display.kind === 'failing';
        const label = isFailing ? 'Sync Failing' : 'Sync Warning';
        const styleClass = isFailing ? warnStyles.danger : warnStyles.warn;
        return (
          <button
            onClick={handler}
            className={`px-1.5 py-0.5 rounded-sm border text-[9px] sm:text-[10px] ${styleClass} ${handler ? 'cursor-pointer hover:brightness-125 transition-all' : ''}`}
            title={isFailing ? 'Sync is failing — click for details' : 'Sync warnings — click for details'}
          >
            {label}
          </button>
        );
      })()}
```

Note on the `hasBackends` field: the StatusBar widget doesn't have direct access to the backend list (it only sees warnings). We pass `hasBackends: true` whenever there are warnings, since by definition warnings imply some backend or system state exists. When there are zero warnings, the helper returns `synced` or `stale` (both filtered out by the `if` check), so the pill renders nothing — which is the desired outcome regardless of whether backends exist.

The unused local `warnings` variable derived at `StatusBar.tsx:582` (`const warnings = (syncWarnings ?? []).map(...)`) becomes dead code after this change. Leave it for now — it's referenced elsewhere in this file (search for other usages of `warnings.` to confirm before deletion). If after a `tsc --noEmit + npm run lint` pass it shows up as truly unused, delete it as a follow-up.

- [ ] **Step 3: Verify the `warnings` local is or isn't still used**

```bash
cd desktop
grep -n "warnings\." src/renderer/components/StatusBar.tsx
```

Expected: only the line that defines `warnings` itself (line ~582). If no other references, delete the line:

```ts
const warnings = (syncWarnings ?? []).map((w) => ({ text: w.title, level: w.level }));
```

If there ARE other references, leave it.

- [ ] **Step 4: Run typecheck**

```bash
cd desktop
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ..
git add desktop/src/renderer/components/StatusBar.tsx
git commit -m "fix(statusbar): single severity-aware sync pill instead of per-warning fan-out"
```

---

## Task 5: Remove the OS / toolkit metadata line from the popup

**Files:**
- Modify: `desktop/src/renderer/components/SyncPanel.tsx` (the conditional block around line 714-718, inside the Sync Now bar in the popup)

- [ ] **Step 1: Remove the conditional block**

Find this block in `SyncPanel.tsx` (inside the popup's `{/* 2. Sync Now bar */}` section, around line 714-718):

```tsx
                {status?.backupMeta?.platform && (
                  <div className="text-[10px] text-fg-faint mt-0.5">
                    from {status.backupMeta.platform} {'·'} toolkit {status.backupMeta.toolkit_version}
                  </div>
                )}
```

Delete the entire conditional block. The surrounding `<div>` containing "Last synced…" stays.

- [ ] **Step 2: Run typecheck**

```bash
cd desktop
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd ..
git add desktop/src/renderer/components/SyncPanel.tsx
git commit -m "fix(sync): drop OS / toolkit metadata line from popup

The line surfaced raw process.platform values like 'win32' and the literal
string 'unknown' when the toolkit VERSION file was unreadable. The toolkit
itself is being deprecated. backup-meta.json continues to store these
fields for diagnostic purposes; only the UI surfacing is removed."
```

---

## Task 6: Restyle "Synced Data" tiles as a read-only inline list

**Files:**
- Modify: `desktop/src/renderer/components/SyncPanel.tsx` (the `{/* 4. Synced Data Categories */}` block around line 789-805)

- [ ] **Step 1: Replace the chip cluster with an inline sentence**

Find the block in `SyncPanel.tsx` starting with `{/* 4. Synced Data Categories */}` (around line 789-805):

```tsx
            {/* 4. Synced Data Categories */}
            {status && status.syncedCategories.length > 0 && (
              <div>
                <h3 className="text-[10px] font-medium text-fg-muted tracking-wider uppercase mb-2">Synced Data</h3>
                <div className="flex flex-wrap gap-1.5">
                  {status.syncedCategories.map(cat => (
                    <span
                      key={cat}
                      title={CATEGORY_DESCRIPTIONS[cat] || ''}
                      className="px-2 py-1 rounded-md bg-inset/60 border border-edge-dim text-[10px] text-fg-dim cursor-help"
                    >
                      {CATEGORY_LABELS[cat] || cat}
                    </span>
                  ))}
                </div>
              </div>
            )}
```

Replace with:

```tsx
            {/* 4. Synced Data Categories — read-only inline list.
                Tiles used to look like buttons (border + cursor-help) but did nothing.
                Now passive text with per-item hover tooltips on the default cursor. */}
            {status && status.syncedCategories.length > 0 && (
              <div>
                <span className="text-[10px] font-medium text-fg-muted tracking-wider uppercase">Includes </span>
                <span className="text-[11px] text-fg-dim">
                  {status.syncedCategories.flatMap((cat, i) => {
                    const label = (
                      <span key={cat} title={CATEGORY_DESCRIPTIONS[cat] || ''}>
                        {CATEGORY_LABELS[cat] || cat}
                      </span>
                    );
                    return i === 0 ? [label] : [<span key={`sep-${cat}`}> {'·'} </span>, label];
                  })}
                </span>
              </div>
            )}
```

- [ ] **Step 2: Run typecheck**

```bash
cd desktop
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd ..
git add desktop/src/renderer/components/SyncPanel.tsx
git commit -m "fix(sync): tiles read-only inline list instead of chip cluster

The 'Synced Data' chips used cursor-help and a chip-shaped border that
falsely promised interactivity. Replaced with a passive inline sentence
('Includes memory · conversations · ...') with per-item hover tooltips
on the default cursor."
```

---

## Task 7: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run full typecheck and tests**

```bash
cd desktop
npx tsc --noEmit
npm test -- --run
```

Expected: PASS for both.

- [ ] **Step 2: Run dev mode and walk through the spec's manual verification list**

```bash
# from youcoded-dev workspace root
cd ../../..   # back to youcoded-dev (or wherever the parent of all the worktrees is)
bash scripts/run-dev.sh
```

Once "YouCoded Dev" launches, walk through the manual checks from the spec:

- Open the settings panel with a clean sync state → compact row is green and reads "Last synced Xm ago"; the status bar has no sync pill.
- Trigger a `PROJECTS_UNSYNCED` (warn) condition. The simplest way: leave Drive backups configured but make sure projects haven't been synced in the last 24h (or temporarily edit `runHealthCheck` to push a warn-level entry into `.sync-warnings.json`). Verify: compact row stays green with amber count badge; status bar shows orange "Sync Warning" pill; clicking the pill opens the sync panel.
- Trigger an `AUTH_EXPIRED` (danger) condition. Simplest path: revoke the connected Drive token (or temporarily push a danger-level entry into `.sync-warnings.json`). Verify: compact row turns red with "Sync Failing"; status bar shows red "Sync Failing" pill.
- With both a danger and a warn warning active, verify only one pill appears in the status bar (red, "Sync Failing"). The compact row also shows the failing state — the warn warning is folded into the danger overall display.
- Open the Sync popup. Confirm the "from {platform} · toolkit {version}" line is gone from the Sync Now bar.
- Confirm the "Synced Data" section renders as `Includes memory · conversations · encyclopedia · skills · system config · plans · specs` with no chip borders. Hovering an item shows the tooltip from `CATEGORY_DESCRIPTIONS`.

- [ ] **Step 3: If all manual checks pass, finish the branch**

Per `youcoded-dev/CLAUDE.md`: merge means merge AND push.

```bash
cd youcoded
git checkout master
git pull origin master
git merge --no-ff feat/sync-panel-ux-fixes
git push origin master
```

Then clean up the worktree per the workspace rules:

```bash
git worktree remove ../youcoded-worktrees/sync-panel-ux-fixes
git branch -D feat/sync-panel-ux-fixes
```

Verify the merge landed before deleting the worktree:

```bash
git branch --contains <merge-commit-sha>   # should list 'master'
```

---

## Notes for the executor

**Build context.** The React UI is shared between Electron and Android — these renderer-only changes ship to both platforms with no Kotlin work. No `build-web-ui.sh` invocation needed for desktop verification, but it WILL be needed before any Android APK build. Out of scope for this plan.

**No IPC parity work.** This plan modifies only `src/renderer/` files. `preload.ts`, `remote-shim.ts`, `ipc-handlers.ts`, and `SessionService.kt` are untouched. The IPC parity test (`tests/ipc-channels.test.ts`) is unaffected.

**No `cc-dependencies.md` update.** None of the touched code parses Claude Code output, consumes a Claude Code file, or depends on CLI behavior.

**One file, four task touches.** `SyncPanel.tsx` is modified across Tasks 2, 3, 5, and 6. Each task targets a logically distinct region (compact row, per-backend dot, Sync Now bar conditional, category tiles). Use the comment markers and surrounding context shown in each task to find the right region — line numbers will shift as edits accumulate.
