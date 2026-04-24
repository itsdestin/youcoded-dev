# Resume Browser Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Project / Tag / Sort filter row beneath the search bar in the Resume Browser, derived entirely from the already-loaded session list — no IPC, no main-process work.

**Architecture:** Extract the existing inline filter/group/sort logic in `ResumeBrowser.tsx` into a small pure helpers module so the filter pipeline is unit-testable. Add three state vars (`selectedProjects: Set<string>`, `selectedTags: Set<FlagName>`, `sortDir: 'asc' | 'desc'`) and a pill row that drives them. Filters compose AND with search and Show Complete; selections reset on every open.

**Tech Stack:** React 19 + TypeScript + Tailwind. Tests use Vitest + React Testing Library (jsdom env). Pure helpers tested without rendering the component.

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `youcoded/desktop/src/renderer/components/resume-browser-filters.ts` | Create | Pure helper functions: `applyFilters`, `sortSessions`, `groupSessions`, `getAvailableProjects`. Imported by ResumeBrowser; tested independently. |
| `youcoded/desktop/tests/resume-browser-filters.test.ts` | Create | Unit tests for the four pure helpers. |
| `youcoded/desktop/src/renderer/components/ResumeBrowser.tsx` | Modify | Replace inline filter/group/sort with helper calls; add three state vars; add pill row UI (Projects, Tags, Sort). |

The `ResumeBrowser.tsx` modifications are layered across tasks 2–6. The pure helpers module ships first (Task 1) so the rest can lean on it.

---

## Task 1: Create pure helpers module + tests

**Files:**
- Create: `youcoded/desktop/src/renderer/components/resume-browser-filters.ts`
- Create: `youcoded/desktop/tests/resume-browser-filters.test.ts`

This task ships a pure, well-tested helpers module that the component will consume in later tasks. No `ResumeBrowser.tsx` changes yet.

- [ ] **Step 1: Create the test file with failing tests**

Create `youcoded/desktop/tests/resume-browser-filters.test.ts`:

```ts
// @vitest-environment jsdom
// resume-browser-filters.test.ts
// Pure-function tests for the Resume Browser filter pipeline:
// applyFilters (search + Show Complete + project + tag),
// sortSessions (priority pin + asc/desc),
// groupSessions (within-group + between-group ordering),
// getAvailableProjects (distinct paths + counts).

import { describe, it, expect } from 'vitest';
import {
  applyFilters,
  sortSessions,
  groupSessions,
  getAvailableProjects,
  type FilterState,
  type PastSessionLike,
} from '../src/renderer/components/resume-browser-filters';

const session = (over: Partial<PastSessionLike>): PastSessionLike => ({
  sessionId: over.sessionId ?? 's-' + Math.random().toString(36).slice(2, 8),
  name: 'session',
  projectSlug: over.projectSlug ?? 'youcoded',
  projectPath: over.projectPath ?? '/home/dev/youcoded',
  lastModified: over.lastModified ?? 1_000_000,
  size: over.size ?? 100,
  flags: over.flags,
  ...over,
});

const baseFilter: FilterState = {
  search: '',
  showComplete: false,
  stickyComplete: new Set(),
  selectedProjects: new Set(),
  selectedTags: new Set(),
};

describe('applyFilters', () => {
  it('hides complete sessions when showComplete=false and not in stickyComplete', () => {
    const a = session({ sessionId: 'a', flags: { complete: true } });
    const b = session({ sessionId: 'b' });
    const out = applyFilters([a, b], baseFilter);
    expect(out.map((s) => s.sessionId)).toEqual(['b']);
  });

  it('keeps sticky-complete sessions even when showComplete=false', () => {
    const a = session({ sessionId: 'a', flags: { complete: true } });
    const b = session({ sessionId: 'b' });
    const out = applyFilters([a, b], { ...baseFilter, stickyComplete: new Set(['a']) });
    expect(out.map((s) => s.sessionId).sort()).toEqual(['a', 'b']);
  });

  it('shows complete sessions when showComplete=true', () => {
    const a = session({ sessionId: 'a', flags: { complete: true } });
    const b = session({ sessionId: 'b' });
    const out = applyFilters([a, b], { ...baseFilter, showComplete: true });
    expect(out.map((s) => s.sessionId).sort()).toEqual(['a', 'b']);
  });

  it('matches search against name OR projectPath, case-insensitive', () => {
    const a = session({ sessionId: 'a', name: 'Refactor sync', projectPath: '/home/x' });
    const b = session({ sessionId: 'b', name: 'Other', projectPath: '/home/youcoded-core' });
    const c = session({ sessionId: 'c', name: 'Other', projectPath: '/home/x' });
    const hits = applyFilters([a, b, c], { ...baseFilter, search: 'YOUCODED' });
    expect(hits.map((s) => s.sessionId).sort()).toEqual(['b']);
    const hits2 = applyFilters([a, b, c], { ...baseFilter, search: 'refactor' });
    expect(hits2.map((s) => s.sessionId).sort()).toEqual(['a']);
  });

  it('empty selectedProjects = no project narrowing', () => {
    const a = session({ sessionId: 'a', projectPath: '/p1' });
    const b = session({ sessionId: 'b', projectPath: '/p2' });
    const out = applyFilters([a, b], baseFilter);
    expect(out.map((s) => s.sessionId).sort()).toEqual(['a', 'b']);
  });

  it('non-empty selectedProjects narrows to matching projectPath', () => {
    const a = session({ sessionId: 'a', projectPath: '/p1' });
    const b = session({ sessionId: 'b', projectPath: '/p2' });
    const c = session({ sessionId: 'c', projectPath: '/p3' });
    const out = applyFilters([a, b, c], { ...baseFilter, selectedProjects: new Set(['/p1', '/p3']) });
    expect(out.map((s) => s.sessionId).sort()).toEqual(['a', 'c']);
  });

  it('empty selectedTags = no tag narrowing', () => {
    const a = session({ sessionId: 'a', flags: { priority: true } });
    const b = session({ sessionId: 'b' });
    const out = applyFilters([a, b], baseFilter);
    expect(out.map((s) => s.sessionId).sort()).toEqual(['a', 'b']);
  });

  it('non-empty selectedTags = OR match across selected flags', () => {
    const a = session({ sessionId: 'a', flags: { priority: true } });
    const b = session({ sessionId: 'b', flags: { helpful: true } });
    const c = session({ sessionId: 'c' });
    const out = applyFilters([a, b, c], { ...baseFilter, selectedTags: new Set(['priority', 'helpful']) });
    expect(out.map((s) => s.sessionId).sort()).toEqual(['a', 'b']);
    const onlyPriority = applyFilters([a, b, c], { ...baseFilter, selectedTags: new Set(['priority']) });
    expect(onlyPriority.map((s) => s.sessionId)).toEqual(['a']);
  });

  it('all filters compose AND', () => {
    const a = session({ sessionId: 'a', name: 'good', projectPath: '/p1', flags: { priority: true } });
    const b = session({ sessionId: 'b', name: 'good', projectPath: '/p2', flags: { priority: true } });
    const c = session({ sessionId: 'c', name: 'bad', projectPath: '/p1', flags: { priority: true } });
    const d = session({ sessionId: 'd', name: 'good', projectPath: '/p1' });
    const out = applyFilters([a, b, c, d], {
      ...baseFilter,
      search: 'good',
      selectedProjects: new Set(['/p1']),
      selectedTags: new Set(['priority']),
    });
    expect(out.map((s) => s.sessionId)).toEqual(['a']);
  });
});

describe('sortSessions', () => {
  it('pins priority to top regardless of direction', () => {
    const a = session({ sessionId: 'a', lastModified: 100 });
    const b = session({ sessionId: 'b', lastModified: 200, flags: { priority: true } });
    const c = session({ sessionId: 'c', lastModified: 300 });
    const desc = sortSessions([a, b, c], 'desc');
    expect(desc.map((s) => s.sessionId)).toEqual(['b', 'c', 'a']);
    const asc = sortSessions([a, b, c], 'asc');
    expect(asc.map((s) => s.sessionId)).toEqual(['b', 'a', 'c']);
  });

  it('non-priority sorts by lastModified in chosen direction', () => {
    const a = session({ sessionId: 'a', lastModified: 100 });
    const b = session({ sessionId: 'b', lastModified: 200 });
    const c = session({ sessionId: 'c', lastModified: 300 });
    expect(sortSessions([a, b, c], 'desc').map((s) => s.sessionId)).toEqual(['c', 'b', 'a']);
    expect(sortSessions([a, b, c], 'asc').map((s) => s.sessionId)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate input', () => {
    const arr = [session({ sessionId: 'a', lastModified: 100 }), session({ sessionId: 'b', lastModified: 200 })];
    const before = arr.map((s) => s.sessionId);
    sortSessions(arr, 'asc');
    expect(arr.map((s) => s.sessionId)).toEqual(before);
  });
});

describe('groupSessions', () => {
  it('groups by projectPath and sorts within each group with priority pin', () => {
    const a = session({ sessionId: 'a', projectPath: '/p1', lastModified: 100 });
    const b = session({ sessionId: 'b', projectPath: '/p1', lastModified: 200, flags: { priority: true } });
    const c = session({ sessionId: 'c', projectPath: '/p1', lastModified: 300 });
    const groups = groupSessions([a, b, c], 'desc');
    expect([...groups.keys()]).toEqual(['/p1']);
    expect(groups.get('/p1')!.map((s) => s.sessionId)).toEqual(['b', 'c', 'a']);
  });

  it('orders groups between each other by anchor in chosen direction (desc = newest first)', () => {
    const p1Old = session({ sessionId: 'a', projectPath: '/p1', lastModified: 100 });
    const p2New = session({ sessionId: 'b', projectPath: '/p2', lastModified: 1000 });
    const groups = groupSessions([p1Old, p2New], 'desc');
    expect([...groups.keys()]).toEqual(['/p2', '/p1']);
  });

  it('orders groups between each other by anchor in chosen direction (asc = oldest first)', () => {
    const p1Old = session({ sessionId: 'a', projectPath: '/p1', lastModified: 100 });
    const p2New = session({ sessionId: 'b', projectPath: '/p2', lastModified: 1000 });
    const groups = groupSessions([p1Old, p2New], 'asc');
    expect([...groups.keys()]).toEqual(['/p1', '/p2']);
  });

  it('group anchor uses newest member when desc, oldest when asc', () => {
    // Group p1 has both an old and a new session. Group p2 is mid-range.
    const p1Old = session({ sessionId: 'a', projectPath: '/p1', lastModified: 100 });
    const p1New = session({ sessionId: 'b', projectPath: '/p1', lastModified: 1000 });
    const p2 = session({ sessionId: 'c', projectPath: '/p2', lastModified: 500 });
    // desc: p1 anchor = 1000 (newest), p2 anchor = 500. p1 first.
    expect([...groupSessions([p1Old, p1New, p2], 'desc').keys()]).toEqual(['/p1', '/p2']);
    // asc: p1 anchor = 100 (oldest), p2 anchor = 500. p1 first.
    expect([...groupSessions([p1Old, p1New, p2], 'asc').keys()]).toEqual(['/p1', '/p2']);
  });
});

describe('getAvailableProjects', () => {
  it('returns distinct projectPaths with counts and last-segment labels, alphabetical', () => {
    const list = [
      session({ projectPath: '/home/dev/youcoded' }),
      session({ projectPath: '/home/dev/youcoded' }),
      session({ projectPath: '/home/dev/core' }),
      session({ projectPath: '/home/dev/youcoded' }),
    ];
    const out = getAvailableProjects(list);
    expect(out).toEqual([
      { path: '/home/dev/core', label: 'core', count: 1 },
      { path: '/home/dev/youcoded', label: 'youcoded', count: 3 },
    ]);
  });

  it('uses the last path segment for the label, normalizing backslashes', () => {
    const out = getAvailableProjects([session({ projectPath: 'C:\\Users\\dev\\proj-a' })]);
    expect(out).toEqual([{ path: 'C:\\Users\\dev\\proj-a', label: 'proj-a', count: 1 }]);
  });

  it('falls back to the full path if there is no separator', () => {
    const out = getAvailableProjects([session({ projectPath: 'singletoken' })]);
    expect(out).toEqual([{ path: 'singletoken', label: 'singletoken', count: 1 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails (no module exists yet)**

Run: `cd youcoded/desktop && npx vitest run tests/resume-browser-filters.test.ts`
Expected: FAIL — Cannot find module `../src/renderer/components/resume-browser-filters`

- [ ] **Step 3: Create the helpers module**

Create `youcoded/desktop/src/renderer/components/resume-browser-filters.ts`:

```ts
// resume-browser-filters.ts
// Pure helpers for the Resume Browser's filter / group / sort pipeline.
// Extracted out of ResumeBrowser.tsx so the logic is unit-testable without
// rendering the component or mocking IPC. Imported by ResumeBrowser.tsx.

// Mirrors the FlagName + PastSession type defined inline in ResumeBrowser.tsx.
// Kept structurally compatible (PastSessionLike is a subset) so the component
// can pass its own typed sessions in directly.
export type FlagName = 'priority' | 'helpful' | 'complete';

export interface PastSessionLike {
  sessionId: string;
  name: string;
  projectSlug: string;
  projectPath: string;
  lastModified: number;
  size: number;
  flags?: Partial<Record<FlagName, boolean>>;
}

export interface FilterState {
  search: string;
  showComplete: boolean;
  stickyComplete: Set<string>;
  selectedProjects: Set<string>;
  selectedTags: Set<FlagName>;
}

// Apply Show Complete + sticky + project + tag + search, in that order.
// Order matches the existing inline pipeline in ResumeBrowser.tsx so the
// refactor is a behaviour-preserving lift.
export function applyFilters<T extends PastSessionLike>(sessions: T[], state: FilterState): T[] {
  const completeFiltered = state.showComplete
    ? sessions
    : sessions.filter((s) => !s.flags?.complete || state.stickyComplete.has(s.sessionId));

  const projectFiltered = state.selectedProjects.size === 0
    ? completeFiltered
    : completeFiltered.filter((s) => state.selectedProjects.has(s.projectPath));

  const tagFiltered = state.selectedTags.size === 0
    ? projectFiltered
    : projectFiltered.filter((s) => {
        for (const tag of state.selectedTags) {
          if (s.flags?.[tag]) return true;
        }
        return false;
      });

  if (!state.search.trim()) return tagFiltered;
  const q = state.search.toLowerCase();
  return tagFiltered.filter(
    (s) => s.name.toLowerCase().includes(q) || s.projectPath.toLowerCase().includes(q),
  );
}

// Pure sort: priority sessions pinned to top, then lastModified by direction.
// Returns a new array; does not mutate the input.
export function sortSessions<T extends PastSessionLike>(
  sessions: T[],
  sortDir: 'asc' | 'desc',
): T[] {
  return [...sessions].sort((a, b) => {
    const ap = a.flags?.priority ? 0 : 1;
    const bp = b.flags?.priority ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return sortDir === 'desc' ? b.lastModified - a.lastModified : a.lastModified - b.lastModified;
  });
}

// Group by projectPath. Within each group, sort by sortSessions. Between groups,
// order by an anchor lastModified in the chosen direction:
//   - 'desc' anchor = max(lastModified) in the group (newest-first feels right)
//   - 'asc'  anchor = min(lastModified) in the group (oldest-first feels right)
// Map iteration order is insertion order, so we sort the keys before inserting.
export function groupSessions<T extends PastSessionLike>(
  sessions: T[],
  sortDir: 'asc' | 'desc',
): Map<string, T[]> {
  const buckets = new Map<string, T[]>();
  for (const s of sessions) {
    const list = buckets.get(s.projectPath);
    if (list) list.push(s);
    else buckets.set(s.projectPath, [s]);
  }

  const anchor = (arr: T[]): number => {
    let value = arr[0].lastModified;
    for (const s of arr) {
      if (sortDir === 'desc' ? s.lastModified > value : s.lastModified < value) value = s.lastModified;
    }
    return value;
  };

  const orderedKeys = [...buckets.keys()].sort((ka, kb) => {
    const va = anchor(buckets.get(ka)!);
    const vb = anchor(buckets.get(kb)!);
    return sortDir === 'desc' ? vb - va : va - vb;
  });

  const out = new Map<string, T[]>();
  for (const k of orderedKeys) {
    out.set(k, sortSessions(buckets.get(k)!, sortDir));
  }
  return out;
}

// Distinct projectPaths with display labels and counts, alphabetical by label.
// Display label is the last path segment (matches the existing group header
// convention in ResumeBrowser.tsx).
export function getAvailableProjects<T extends PastSessionLike>(
  sessions: T[],
): Array<{ path: string; label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const s of sessions) counts.set(s.projectPath, (counts.get(s.projectPath) ?? 0) + 1);
  const result = [...counts.entries()].map(([path, count]) => ({
    path,
    label: lastSegment(path),
    count,
  }));
  result.sort((a, b) => a.label.localeCompare(b.label));
  return result;
}

function lastSegment(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const last = parts[parts.length - 1];
  return last || path;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd youcoded/desktop && npx vitest run tests/resume-browser-filters.test.ts`
Expected: PASS — all 14 tests green.

- [ ] **Step 5: Commit**

```bash
git -C youcoded/desktop add src/renderer/components/resume-browser-filters.ts tests/resume-browser-filters.test.ts
git -C youcoded/desktop commit -m "feat(resume-browser): pure helpers for filter/group/sort pipeline

Extract applyFilters, sortSessions, groupSessions, and
getAvailableProjects into a separate module so the Resume Browser's
filter logic is unit-testable without rendering the component. No
component changes yet; ResumeBrowser.tsx will adopt these in the
follow-up task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Refactor ResumeBrowser to use the helpers (no behavior change)

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/ResumeBrowser.tsx`

This task is a behavior-preserving lift: replace the inline filter/group/sort logic with calls to the new pure helpers, and introduce the three new state vars with default values that produce identical output to the current code. No new UI yet — pills come in Task 3+.

**Why before the UI work:** if anything regresses, we know it's the refactor, not the UI wiring. Easier to bisect.

- [ ] **Step 1: Open the existing component to map current state**

Run: `cat youcoded/desktop/src/renderer/components/ResumeBrowser.tsx | head -180` — confirm the existing `filtered`, `grouped`, and `flatSorted` `useMemo`s match what's in this plan (lines 126–174 of the current file).

- [ ] **Step 2: Add imports + remove the now-duplicate local FlagName + new state**

In `ResumeBrowser.tsx`, swap the import block for one that includes the helpers, and delete the local `FlagName` type declaration so the helpers module's `FlagName` is the single source of truth (the local + imported names would otherwise collide).

Find:

```tsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MODELS, type ModelAlias } from './StatusBar';
import { Scrim, OverlayPanel } from './overlays/Overlay';
import { useScrollFade } from '../hooks/useScrollFade';
import { useEscClose } from '../hooks/use-esc-close';
import { SkipPermissionsInfoTooltip } from './SkipPermissionsInfoTooltip';
```

Replace with:

```tsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MODELS, type ModelAlias } from './StatusBar';
import { Scrim, OverlayPanel } from './overlays/Overlay';
import { useScrollFade } from '../hooks/useScrollFade';
import { useEscClose } from '../hooks/use-esc-close';
import { SkipPermissionsInfoTooltip } from './SkipPermissionsInfoTooltip';
import {
  applyFilters,
  sortSessions,
  groupSessions,
  getAvailableProjects,
  type FilterState,
  type FlagName,
} from './resume-browser-filters';
```

Then find this block (around lines 33–38):

```tsx
// Keep in sync with SESSION_FLAG_NAMES in shared/types.ts. The renderer imports
// from shared/types would be ideal, but that module is CommonJS — we use a
// literal list here to avoid the compile coupling and keep the flag order
// stable in the UI (Priority first, Helpful, then Complete).
type FlagName = 'priority' | 'helpful' | 'complete';
const FLAG_ORDER: FlagName[] = ['priority', 'helpful', 'complete'];
```

Replace with:

```tsx
// FlagName is imported from resume-browser-filters.ts (single source of truth).
// Kept in sync with SESSION_FLAG_NAMES in shared/types.ts; that module is
// CommonJS so we don't import it directly. FLAG_ORDER fixes the pill / badge
// ordering in the UI (Priority first, Helpful, then Complete).
const FLAG_ORDER: FlagName[] = ['priority', 'helpful', 'complete'];
```

Then find the existing `stickyComplete` state declaration:

```tsx
  const [stickyComplete, setStickyComplete] = useState<Set<string>>(new Set());
```

And immediately after it, add:

```tsx
  // New filter state — all reset on each open (no localStorage). Default values
  // (empty Sets, sortDir='desc') produce identical behaviour to the prior
  // hard-coded filter pipeline.
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [selectedTags, setSelectedTags] = useState<Set<FlagName>>(new Set());
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
```

- [ ] **Step 3: Reset the new state when the browser opens**

Find the existing open-effect (around line 100):

```tsx
  useEffect(() => {
    if (open) {
      setSearch('');
      setExpandedId(null);
      setResumeModel(defaultModel || 'sonnet');
      setResumeDangerous(defaultSkipPermissions || false);
      // Reset the sticky-visible set each open — previously kept rows drop out.
      setStickyComplete(new Set());
```

Add three resets after `setStickyComplete(new Set());`:

```tsx
      setStickyComplete(new Set());
      // Reset filter pills each open — current spec: no persistence.
      setSelectedProjects(new Set());
      setSelectedTags(new Set());
      setSortDir('desc');
```

- [ ] **Step 4: Replace the inline filter useMemo with applyFilters**

Find the existing `filtered` useMemo (around lines 126–141):

```tsx
  const filtered = useMemo(() => {
    // Hide complete sessions by default; Show Complete toggle reveals them.
    // Priority does NOT override hiding — a complete+priority session stays hidden.
    // Exception: sessions just flagged Complete during this open stay visible
    // (stickyComplete) so the row doesn't disappear mid-interaction.
    const base = showComplete
      ? sessions
      : sessions.filter((s) => !s.flags?.complete || stickyComplete.has(s.sessionId));
    if (!search.trim()) return base;
    const q = search.toLowerCase();
    return base.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.projectPath.toLowerCase().includes(q),
    );
  }, [sessions, search, showComplete, stickyComplete]);
```

Replace with:

```tsx
  const filtered = useMemo(() => {
    // Filter pipeline lives in resume-browser-filters.ts so it can be unit tested.
    // Order: Show Complete + sticky → project → tag → search.
    const state: FilterState = {
      search,
      showComplete,
      stickyComplete,
      selectedProjects,
      selectedTags,
    };
    return applyFilters(sessions, state);
  }, [sessions, search, showComplete, stickyComplete, selectedProjects, selectedTags]);
```

- [ ] **Step 5: Replace the inline grouped useMemo with groupSessions**

Find the existing `grouped` useMemo (around lines 145–163):

```tsx
  // Group by project path AND sort priority sessions to the top of each group.
  // Secondary sort is lastModified desc (preserves the existing default).
  const grouped = useMemo(() => {
    if (search.trim()) return null;
    const groups = new Map<string, PastSession[]>();
    for (const s of filtered) {
      const list = groups.get(s.projectPath) || [];
      list.push(s);
      groups.set(s.projectPath, list);
    }
    for (const [k, arr] of groups) {
      arr.sort((a, b) => {
        const ap = a.flags?.priority ? 0 : 1;
        const bp = b.flags?.priority ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return b.lastModified - a.lastModified;
      });
      groups.set(k, arr);
    }
    return groups;
  }, [filtered, search]);
```

Replace with:

```tsx
  // Group by project path; within-group sort priority-pinned + lastModified by sortDir.
  // Between-group order also follows sortDir (newest-first when desc, oldest-first when asc).
  const grouped = useMemo(() => {
    if (search.trim()) return null;
    return groupSessions(filtered, sortDir);
  }, [filtered, search, sortDir]);
```

- [ ] **Step 6: Replace the inline flatSorted useMemo with sortSessions**

Find the existing `flatSorted` useMemo (around lines 166–174):

```tsx
  // Flat list (search mode) — still pin priority to the top.
  const flatSorted = useMemo(() => {
    if (!search.trim()) return filtered;
    return [...filtered].sort((a, b) => {
      const ap = a.flags?.priority ? 0 : 1;
      const bp = b.flags?.priority ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return b.lastModified - a.lastModified;
    });
  }, [filtered, search]);
```

Replace with:

```tsx
  // Flat list (search mode) — priority-pinned, lastModified by sortDir.
  const flatSorted = useMemo(() => {
    if (!search.trim()) return filtered;
    return sortSessions(filtered, sortDir);
  }, [filtered, search, sortDir]);
```

- [ ] **Step 7: Run the existing test suite to confirm nothing else regressed**

Run: `cd youcoded/desktop && npm test -- --run`
Expected: All tests pass — including the new `resume-browser-filters.test.ts` from Task 1.

- [ ] **Step 8: Manual smoke check — confirm no behavior change**

Run: `bash scripts/run-dev.sh` from the workspace root. Open the dev YouCoded instance, click the resume button to open the Resume Browser. Verify:
- Sessions list looks identical to before (grouped by project, priority pinned, most-recent first).
- Search still filters.
- Show Complete still hides/shows complete sessions.

If anything looks different, the refactor introduced a behaviour change — bisect by reverting the three `useMemo` replacements one at a time. Shut down the dev server with Ctrl+C when done.

- [ ] **Step 9: Commit**

```bash
git -C youcoded/desktop add src/renderer/components/ResumeBrowser.tsx
git -C youcoded/desktop commit -m "refactor(resume-browser): use pure helpers + add filter state stubs

Replace inline filter/group/sort with calls to the helpers extracted in
the previous commit. Add three new state vars (selectedProjects,
selectedTags, sortDir) wired into the pipeline with default values that
produce behaviour identical to the prior code. UI for the new filters
comes in follow-up commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Add the FilterPill row scaffolding (Sort toggle only)

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/ResumeBrowser.tsx`

This task lays out the new pill row beneath the search bar and wires the simplest pill — the Sort toggle. Project and Tag pills (which need dropdowns) come in Tasks 4 and 5. Doing Sort first proves out the pill row layout without the dropdown complexity.

- [ ] **Step 1: Add a small FilterPill component near the top of the file**

In `ResumeBrowser.tsx`, after the existing constants and helpers (around the existing `formatSize` function near line 30) but before the `interface PastSession` declaration, add:

```tsx
// Shared trigger-button shape for the filter row beneath the search bar.
// Inactive pills look like the search input frame; active pills tint with
// the accent so it's obvious a filter is narrowing the list.
function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[11px] flex items-center gap-1.5 transition-colors ${
        active
          ? 'bg-accent/10 border border-accent/40 text-fg'
          : 'bg-inset border border-edge-dim text-fg-muted hover:text-fg'
      }`}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Add the pill row JSX beneath the search bar**

Find the closing `</div>` of the search-bar container in the header (around line 413, the `</div>` after `<input ref={searchRef} ... />`). Just after the entire search-bar wrapper closes (the `</div>` on the line before `{/* Session list */}`), add the pill row.

Find this section:

```tsx
            <div className="flex items-center gap-2 bg-inset rounded-lg px-3 py-2 border border-edge-dim">
              <svg className="w-4 h-4 text-fg-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search sessions..."
                className="flex-1 bg-transparent text-sm text-fg placeholder-fg-muted outline-none"
              />
            </div>
          </div>
```

The trailing `</div>` closes the header section. Just BEFORE that trailing `</div>` (so the pill row renders inside the header section, after the search bar), add:

```tsx
            <div className="flex items-center gap-1.5 mt-2">
              {/* Sort toggle — flips lastModified direction. Priority-pin still wins. */}
              <FilterPill active={sortDir !== 'desc'} onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}>
                {sortDir === 'desc' ? 'Most recent ↓' : 'Oldest first ↑'}
              </FilterPill>
            </div>
```

After this insertion, the header should look like:

```tsx
            </div>  {/* search-bar wrapper */}
            <div className="flex items-center gap-1.5 mt-2">
              <FilterPill ...>...</FilterPill>
            </div>
          </div>  {/* header */}
```

- [ ] **Step 3: Run the test suite to confirm no regressions**

Run: `cd youcoded/desktop && npm test -- --run`
Expected: All tests still pass.

- [ ] **Step 4: Manual verification — sort toggle**

Run: `bash scripts/run-dev.sh`. Open the Resume Browser. Confirm:
- A pill labeled `Most recent ↓` is visible just below the search bar.
- Clicking it flips to `Oldest first ↑` and the session list reorders (oldest sessions on top, group order also flips).
- Priority-flagged sessions still appear pinned at the top of their group regardless of direction.
- Clicking again flips back to `Most recent ↓` and the original ordering returns.

Shut down the dev server with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git -C youcoded/desktop add src/renderer/components/ResumeBrowser.tsx
git -C youcoded/desktop commit -m "feat(resume-browser): add Sort filter pill

Add a pill row beneath the search bar with a single Sort toggle
(Most recent ↓ ↔ Oldest first ↑). Reuses the FilterPill shape that
Projects + Tags pills will adopt in follow-up commits. Sort direction
already flows through groupSessions / sortSessions from the prior
refactor — this commit only exposes the control.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Add the Projects pill + multi-select dropdown

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/ResumeBrowser.tsx`

- [ ] **Step 1: Add a unified "open dropdown" state**

Two dropdowns (Projects, Tags) shouldn't be open at the same time. A single `openPill` state enforces this. Add it next to the other state at the top of the component, right after the `sortDir` declaration from Task 2:

```tsx
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  // Tracks which filter pill's dropdown is currently open. null = both closed.
  const [openPill, setOpenPill] = useState<'projects' | 'tags' | null>(null);
```

- [ ] **Step 2: Add an availableProjects memo**

After the `flatSorted` useMemo, add a memo that computes the project list shown in the dropdown:

```tsx
  // Distinct projects with counts — what the Projects pill dropdown displays.
  // Derived from the unfiltered session list so the dropdown always shows
  // every known project, even when the user has narrowed the visible list.
  const availableProjects = useMemo(() => getAvailableProjects(sessions), [sessions]);
```

- [ ] **Step 3: Add a projects-trigger label memo**

Just below `availableProjects`, add a memo that produces the Projects pill's display label based on the current selection. Falls through size buckets per the spec:

```tsx
  // Trigger label for the Projects pill: 0 selected → "Projects", 1 → label,
  // 2-3 → comma-joined labels, 4+ → "Projects (N)". Spec: 2026-04-24-resume-browser-filters.
  const projectsLabel = useMemo(() => {
    if (selectedProjects.size === 0) return 'Projects';
    const selectedList = availableProjects.filter((p) => selectedProjects.has(p.path));
    if (selectedList.length === 1) return selectedList[0].label;
    if (selectedList.length <= 3) return selectedList.map((p) => p.label).join(', ');
    return `Projects (${selectedList.length})`;
  }, [selectedProjects, availableProjects]);
```

- [ ] **Step 4: Add a wrapper ref + outside-click handler for dropdowns**

Outside-click closes the open dropdown — same pattern as `FolderSwitcher.tsx`. Add a wrapper ref near the other refs (`searchRef`, `listRef`):

```tsx
  const filterRowRef = useRef<HTMLDivElement>(null);
```

Then add an effect that closes `openPill` when a click lands outside `filterRowRef`. Place it after the existing close-on-Escape effect:

```tsx
  // Close the active filter dropdown on outside click (matches FolderSwitcher).
  useEffect(() => {
    if (!openPill) return;
    const handler = (e: Event) => {
      if (filterRowRef.current?.contains(e.target as Node)) return;
      setOpenPill(null);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [openPill]);
```

- [ ] **Step 5: Extend the existing ESC handler to close dropdowns first**

Find the existing `handleEscClose` callback:

```tsx
  const handleEscClose = useCallback(() => {
    if (expandedId) setExpandedId(null);
    else onClose();
  }, [expandedId, onClose]);
```

Replace it with one that closes a dropdown first if any is open:

```tsx
  // Layered ESC: close an open filter dropdown first, then collapse the
  // expanded row, then close the browser. Each ESC press peels one layer.
  const handleEscClose = useCallback(() => {
    if (openPill) setOpenPill(null);
    else if (expandedId) setExpandedId(null);
    else onClose();
  }, [openPill, expandedId, onClose]);
```

- [ ] **Step 6: Wrap the pill row in the ref + add the Projects pill trigger**

Find the pill row added in Task 3:

```tsx
            <div className="flex items-center gap-1.5 mt-2">
              {/* Sort toggle — flips lastModified direction. Priority-pin still wins. */}
              <FilterPill active={sortDir !== 'desc'} onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}>
                {sortDir === 'desc' ? 'Most recent ↓' : 'Oldest first ↑'}
              </FilterPill>
            </div>
```

Replace with:

```tsx
            <div ref={filterRowRef} className="flex items-center gap-1.5 mt-2 relative">
              {/* Projects: multi-select dropdown over distinct projectPaths in the loaded sessions. */}
              <div className="relative">
                <FilterPill
                  active={selectedProjects.size > 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenPill((p) => (p === 'projects' ? null : 'projects'));
                  }}
                >
                  <span>{projectsLabel}</span>
                  <span className="text-fg-faint text-[9px]">▾</span>
                </FilterPill>
                {openPill === 'projects' && (
                  <div
                    className="layer-surface absolute top-full left-0 mt-1 w-64 overflow-hidden"
                    style={{ zIndex: 50, animation: 'dropdown-in 120ms cubic-bezier(0.16, 1, 0.3, 1) both' }}
                  >
                    {/* All projects — clear affordance. Visually checked when selectedProjects is empty. */}
                    <button
                      type="button"
                      onClick={() => setSelectedProjects(new Set())}
                      className="w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-2 hover:bg-inset transition-colors text-fg"
                    >
                      <span className={`w-3 h-3 shrink-0 rounded-sm border ${selectedProjects.size === 0 ? 'bg-accent border-accent' : 'border-edge'}`} />
                      <span>All projects</span>
                    </button>
                    <div className="max-h-56 overflow-y-auto border-t border-edge-dim">
                      {availableProjects.map((p) => {
                        const checked = selectedProjects.has(p.path);
                        return (
                          <button
                            key={p.path}
                            type="button"
                            onClick={() => {
                              setSelectedProjects((prev) => {
                                const next = new Set(prev);
                                if (next.has(p.path)) next.delete(p.path);
                                else next.add(p.path);
                                return next;
                              });
                            }}
                            className="w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-2 hover:bg-inset transition-colors text-fg-2"
                          >
                            <span className={`w-3 h-3 shrink-0 rounded-sm border ${checked ? 'bg-accent border-accent' : 'border-edge'}`} />
                            <span className="flex-1 truncate" title={p.path}>{p.label}</span>
                            <span className="text-[10px] text-fg-faint shrink-0">{p.count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Sort toggle — flips lastModified direction. Priority-pin still wins. */}
              <FilterPill active={sortDir !== 'desc'} onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}>
                {sortDir === 'desc' ? 'Most recent ↓' : 'Oldest first ↑'}
              </FilterPill>
            </div>
```

- [ ] **Step 7: Run tests**

Run: `cd youcoded/desktop && npm test -- --run`
Expected: All tests pass.

- [ ] **Step 8: Manual verification — Projects pill**

Run: `bash scripts/run-dev.sh`. Open the Resume Browser. Confirm:
- A pill labeled `Projects` is visible to the left of `Most recent ↓`.
- Clicking it opens a dropdown listing every project that has past sessions, alphabetical, with a session count on the right.
- A top "All projects" row shows a filled accent square when nothing is selected.
- Clicking a project's checkbox adds/removes it from the filter.
- The pill label updates: empty → "Projects"; one → folder name (active tint); 2–3 → comma list; 4+ → "Projects (N)".
- The visible session list narrows to only the selected project(s); the per-project group header still renders even when only one project is selected.
- Clicking outside the row closes the dropdown.
- Pressing ESC once closes the dropdown without closing the Resume Browser; pressing ESC again closes the browser.

Shut down the dev server with Ctrl+C.

- [ ] **Step 9: Commit**

```bash
git -C youcoded/desktop add src/renderer/components/ResumeBrowser.tsx
git -C youcoded/desktop commit -m "feat(resume-browser): add Projects multi-select filter pill

Multi-select dropdown over distinct projectPaths in the loaded sessions.
Trigger label falls through 0/1/2-3/4+ states. 'All projects' clears
selection. Layered ESC closes the dropdown first, then collapsed row,
then the browser. Outside-click also closes the dropdown.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Add the Tags pill + multi-select dropdown

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/ResumeBrowser.tsx`

The Tags pill mirrors the Projects pill but shows only the two flag options Priority and Helpful (Complete is owned by the existing Show Complete toggle).

- [ ] **Step 1: Add a tags-trigger label memo**

Place it right after the `projectsLabel` memo from Task 4:

```tsx
  // Trigger label for the Tags pill: 0 → "Tags"; 1 → flag label; 2 → "A + B".
  // Architected so the future custom-tags work is a list extension.
  const tagsLabel = useMemo(() => {
    if (selectedTags.size === 0) return 'Tags';
    const labels: string[] = [];
    if (selectedTags.has('priority')) labels.push('Priority');
    if (selectedTags.has('helpful')) labels.push('Helpful');
    return labels.join(' + ');
  }, [selectedTags]);
```

- [ ] **Step 2: Insert the Tags pill into the row, between Projects and Sort**

Find the pill row from Task 4. Insert the Tags pill after the Projects `</div>` and before the Sort toggle:

```tsx
              {/* Tags: multi-select dropdown over the per-session flag set. Priority + Helpful only;
                  Complete stays owned by the Show Complete toggle in the header. */}
              <div className="relative">
                <FilterPill
                  active={selectedTags.size > 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenPill((p) => (p === 'tags' ? null : 'tags'));
                  }}
                >
                  <span>{tagsLabel}</span>
                  <span className="text-fg-faint text-[9px]">▾</span>
                </FilterPill>
                {openPill === 'tags' && (
                  <div
                    className="layer-surface absolute top-full left-0 mt-1 w-44 overflow-hidden"
                    style={{ zIndex: 50, animation: 'dropdown-in 120ms cubic-bezier(0.16, 1, 0.3, 1) both' }}
                  >
                    {(['priority', 'helpful'] as const).map((tag) => {
                      const checked = selectedTags.has(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            setSelectedTags((prev) => {
                              const next = new Set(prev);
                              if (next.has(tag)) next.delete(tag);
                              else next.add(tag);
                              return next;
                            });
                          }}
                          className="w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-2 hover:bg-inset transition-colors text-fg-2"
                        >
                          <span className={`w-3 h-3 shrink-0 rounded-sm border ${checked ? 'bg-accent border-accent' : 'border-edge'}`} />
                          <span className="flex-1 capitalize">{tag}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
```

- [ ] **Step 3: Run tests**

Run: `cd youcoded/desktop && npm test -- --run`
Expected: All tests pass.

- [ ] **Step 4: Manual verification — Tags pill**

Run: `bash scripts/run-dev.sh`. Open the Resume Browser. Confirm:
- A pill labeled `Tags` is visible between `Projects` and `Most recent ↓`.
- Clicking it opens a dropdown with two checkboxes: Priority and Helpful.
- Selecting Priority narrows the list to priority-flagged sessions; the pill label becomes `Priority` (active tint).
- Selecting both becomes `Priority + Helpful`; sessions with EITHER flag remain visible (OR semantics).
- Tags filter composes with the Projects filter and search — all narrow together.
- Clearing selection (toggling each off) returns the pill to `Tags` and removes the filter.
- Opening the Tags dropdown closes the Projects dropdown if it was open (mutual exclusion via `openPill`).

Shut down the dev server.

- [ ] **Step 5: Commit**

```bash
git -C youcoded/desktop add src/renderer/components/ResumeBrowser.tsx
git -C youcoded/desktop commit -m "feat(resume-browser): add Tags multi-select filter pill

Priority + Helpful checkboxes; OR semantics; Complete stays owned by
the Show Complete toggle. Future custom tags will be a list extension
of the inline tuple.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: End-to-end verification across composed filters

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/ResumeBrowser.tsx` (only if regressions surface)

This task isn't a code change — it's a structured exercise of the composed filter behavior to confirm the spec lands correctly. Drives out any regressions that single-axis tests in Tasks 3-5 might have missed.

- [ ] **Step 1: Run the full desktop test suite**

Run: `cd youcoded/desktop && npm test -- --run`
Expected: All tests pass — including `resume-browser-filters.test.ts`.

- [ ] **Step 2: Type-check**

Run: `cd youcoded/desktop && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Manual end-to-end verification**

Run `bash scripts/run-dev.sh`. Open the Resume Browser. Walk through this matrix:

1. **Default state** — pill row shows `Projects | Tags | Most recent ↓`, all in muted tint. Session list looks identical to before this feature shipped (grouped, priority-pinned, most recent first).
2. **Project filter alone** — pick one project. List narrows; group header for that project still renders. Pill shows the folder name in accent tint. Pick a second project; pill becomes "youcoded, core" (or similar). Pick a fourth; pill collapses to "Projects (4)".
3. **Tag filter alone** — pick Priority. Only priority-flagged sessions remain. Pick Helpful too. Sessions with either flag visible (OR). Clear both — full list returns.
4. **Sort toggle alone** — flip to Oldest first. List reverses both within and between groups; priority sessions still pin to the top of their group.
5. **All four composed (search + Projects + Tags + Sort)** — type a search term that matches a few sessions across multiple projects, narrow Projects to one, narrow Tags to Priority. Result should be sessions matching ALL filters; sort direction still applies. Flat list (search mode), priority pinned at top.
6. **Show Complete interaction** — flip Show Complete on. Complete sessions reappear and respect all active filters. Tags pill never lists Complete; only Show Complete reveals them.
7. **Reset on open** — close the Resume Browser, reopen it. All three filter pills return to their default state (no localStorage persistence). Show Complete preserves its setting (separate, persisted toggle — unchanged behavior).
8. **Layered ESC** — open a filter dropdown, press ESC: dropdown closes, browser stays. Press ESC again: browser closes. Open browser, expand a session row, press ESC: row collapses, browser stays. Press ESC again: browser closes.
9. **Outside click** — open a filter dropdown, click on a session row in the list: dropdown closes; session expand still happens.
10. **Resume flow** — expand a session, hit Resume — session resumes as before. Filter pill state at the moment of resume doesn't affect the resumed session.

Shut down the dev server with Ctrl+C when done.

- [ ] **Step 4: Build the Android web bundle to confirm renderer compiles for Android**

Run: `cd youcoded && ./scripts/build-web-ui.sh`
Expected: Successful build — confirms the same bundle is shippable to Android. (Full Android APK build / device test is out of scope for this plan; the React UI is shared so a successful web build is the parity check.)

- [ ] **Step 5: Commit any verification fixups (if needed)**

If any matrix item failed and required a code change, commit it now with a focused message. If everything passed, this step is a no-op.

- [ ] **Step 6: Final summary commit (only if no fixups)**

If no fixups were needed, this task ends without a commit. The five prior task commits stand as the change set.

---

## Self-Review

- **Spec coverage:**
  - Layout (pill row beneath search) — Task 3 (Sort), Task 4 (Projects), Task 5 (Tags). ✓
  - Projects pill semantics + label states — Task 4 steps 3 & 6. ✓
  - Tags pill semantics + label states — Task 5 steps 1 & 2. ✓
  - Sort toggle behavior — Task 3 + helpers in Task 1 (`sortSessions`, between-group anchor in `groupSessions`). ✓
  - Reset on each open — Task 2 step 3. ✓
  - Filter pipeline as AND with search + Show Complete — Task 1 (`applyFilters`) + Task 6 step 3 item 5. ✓
  - Single-project edge case still shows group header — Task 2 (no change to grouping condition; still groups when search empty) + verified in Task 4 step 8 + Task 6 step 3 item 2. ✓
  - Outside-click and ESC dropdown close — Task 4 steps 4 & 5. ✓
  - Anchored-popover style (`.layer-surface`) — Task 4 step 6 + Task 5 step 2. ✓
  - No new IPC, no main/Android work — confirmed by file table. ✓

- **Placeholder scan:** No "TBD"/"TODO"/"add appropriate" left in the plan. Each step has runnable code/commands.

- **Type consistency:** `FilterState` shape matches between Task 1 (definition) and Task 2 step 4 (consumption). `FlagName` is exported from the helpers module (Task 1) and imported implicitly via the union literal `'priority' | 'helpful'` used in Task 5 — but Task 4 step 1 imports it from the helpers module, so the symbol exists in scope. `availableProjects` shape matches between `getAvailableProjects` (Task 1: `{ path, label, count }[]`) and consumption (Task 4 step 6).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-24-resume-browser-filters.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — I execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
