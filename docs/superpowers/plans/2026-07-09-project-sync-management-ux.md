# Project & Sync Management UX Implementation Plan

> **✅ SHIPPED — youcoded#112 + #113 (2026-07-09).** Live status: `docs/superpowers/2026-07-10-sync-completion-handoff.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Implementer/reviewer agents run on **Opus** (Destin's standing preference).

**Goal:** Implement `docs/superpowers/specs/2026-07-09-project-sync-management-ux-design.md` — slim the session picker to rows + sync dots + a "Manage projects…" bridge, add the unified two-step "Add a project" flow in Project View, and turn the ProjectHero into the per-project sync/management hub.

**Architecture:** Pure dot-state derivation in a new renderer module (unit-testable, no fs); one small backend addition (event timestamps + per-space sync-now) across the usual parity surfaces; FolderSwitcher rewritten (subsumes the uncommitted portal/clipping fix from the 2026-07-09 live session); a new `AddProjectModal` that routes to existing machinery (`createProject`, `folders.add`, `ImportProjectModal`); ProjectView/ProjectHero/ProjectSwitcher wired to `syncSpaces.status()`.

**Tech Stack:** TypeScript (Electron main + React renderer), vitest.

**Spec:** `docs/superpowers/specs/2026-07-09-project-sync-management-ux-design.md`. Read it first — every copy string below comes from it.

---

## Worktree setup (before Task 1)

```bash
cd ~/youcoded-dev/youcoded && git fetch origin
git worktree add ../youcoded.wt/project-sync-ux -b feat/project-sync-ux origin/master
cd ../youcoded.wt/project-sync-ux/desktop && npm ci
```

Sharp edges (all real, from prior sessions):
- **Never bare `npm test`** (vitest watch hangs agents). Always `npx vitest run <file>` from `desktop/`.
- Full-suite runs: `env -u YOUCODED_PROFILE -u YOUCODED_PORT_OFFSET npx vitest run`.
- WHY comments on every non-trivial edit (Destin is a non-developer — hard rule).
- **The MAIN checkout (`youcoded/`) has an UNCOMMITTED FolderSwitcher.tsx change** (the portal/clipping fix) and is running Destin's dev instance on port 5223. Do not touch the main checkout; Task 3's rewrite INCLUDES the portal fix, and the coordinator discards the main-checkout working-tree change at merge time. Do NOT start a second dev instance (5223 is taken).
- `tests/ipc-channels.test.ts` is the adjacency-conflict magnet on rebases — keep BOTH sides' describes.

## File structure

| File | Action | Responsibility |
|---|---|---|
| `desktop/src/renderer/components/sync-dot-state.ts` | Create | Pure dot/space/last-synced derivation from `syncSpaces.status()` data |
| `desktop/tests/sync-dot-state.test.ts` | Create | Unit tests for the above |
| `desktop/src/main/sync-spaces/types.ts` | Modify | `at?: number` timestamp on `SpaceSyncEvent` |
| `desktop/src/main/sync-spaces/service.ts` | Modify | Stamp `at` in `broadcast()`; `syncSpacesSyncNow(spaceId?)` |
| `desktop/src/main/ipc-handlers.ts` | Modify | Pass `spaceId` through `SYNC_SPACES_SYNC_NOW` |
| `desktop/src/main/preload.ts` | Modify | `syncNow(spaceId?)` |
| `desktop/src/renderer/remote-shim.ts` | Modify | `syncNow(spaceId?)` |
| `desktop/src/main/remote-server.ts` | Modify | Unwrap `payload?.spaceId` in the sync-now case |
| `desktop/tests/sync-spaces-service.test.ts` | Modify | Per-space sync-now behavior test |
| `desktop/src/renderer/components/FolderSwitcher.tsx` | Rewrite | Rows + dots + portal positioning + "Manage projects…" footer; all add/import UI removed |
| `desktop/src/renderer/components/SessionStrip.tsx` | Modify | Pass `onManageProjects` (dispatch `PROJECT_VIEW_OPENED`, close menu) |
| `desktop/src/renderer/components/project-view/AddProjectModal.tsx` | Create | Two-step unified add flow (router over existing machinery) |
| `desktop/src/renderer/components/project-view/ProjectHero.tsx` | Modify | Sync status line + management actions row |
| `desktop/src/renderer/components/project-view/ProjectSwitcher.tsx` | Modify | Sync dot per row; hide remove-× for synced rows |
| `desktop/src/renderer/components/project-view/ProjectView.tsx` | Modify | Fetch sync status; mount AddProjectModal + ImportProjectModal; hero wiring; remove gating |

**Deliberately NOT done (spec §5):** move-out-of-sync, folder rename for synced projects, Android Kotlin handlers, engine changes, moving the global Sync toggle.

---

### Task 1: Pure sync-dot derivation module

**Files:**
- Create: `desktop/src/renderer/components/sync-dot-state.ts`
- Test: `desktop/tests/sync-dot-state.test.ts`

- [x] **Step 1: Write the failing tests**

```ts
// desktop/tests/sync-dot-state.test.ts
import { describe, it, expect } from 'vitest';
import { syncDotFor, findSpaceFor, lastSyncedLabel, type SyncStatusData } from '../src/renderer/components/sync-dot-state';

const status = (over: Partial<SyncStatusData> = {}): SyncStatusData => ({
  enabled: true,
  spaces: [
    { id: 'personal', root: 'C:\\Users\\x\\YouCoded\\Personal' },
    { id: 'project:budget-app', root: 'C:\\Users\\x\\YouCoded\\Projects\\budget-app' },
  ],
  recentEvents: [],
  ...over,
});

describe('findSpaceFor', () => {
  it('matches a folder to its space by normalized root (slashes + case)', () => {
    expect(findSpaceFor('c:/users/x/youcoded/projects/budget-app/', status())?.id).toBe('project:budget-app');
  });
  it('returns null for a folder with no space', () => {
    expect(findSpaceFor('C:\\Users\\x\\elsewhere', status())).toBeNull();
  });
});

describe('syncDotFor', () => {
  it('returns null when status is unavailable (no dot rendered)', () => {
    expect(syncDotFor('C:\\anything', null)).toBeNull();
  });
  it('gray "Only on this computer" for unmanaged folders', () => {
    expect(syncDotFor('C:\\Users\\x\\elsewhere', status())).toEqual({ color: 'gray', label: 'Only on this computer' });
  });
  it('gray with the sync-off wording for managed folders while Sync is off', () => {
    const d = syncDotFor('C:\\Users\\x\\YouCoded\\Projects\\budget-app', status({ enabled: false }));
    expect(d?.color).toBe('gray');
    expect(d?.label).toMatch(/turn on Sync in Settings/);
  });
  it('red when the space\'s LATEST event is an error', () => {
    const d = syncDotFor('C:\\Users\\x\\YouCoded\\Projects\\budget-app', status({
      recentEvents: [
        { type: 'synced', spaceId: 'project:budget-app' },
        { type: 'error', spaceId: 'project:budget-app' },
      ],
    }));
    expect(d).toEqual({ color: 'red', label: "Sync isn't working — open Manage projects" });
  });
  it('green when a later synced event supersedes an earlier error', () => {
    const d = syncDotFor('C:\\Users\\x\\YouCoded\\Projects\\budget-app', status({
      recentEvents: [
        { type: 'error', spaceId: 'project:budget-app' },
        { type: 'synced', spaceId: 'project:budget-app' },
      ],
    }));
    expect(d).toEqual({ color: 'green', label: 'Syncs across your devices' });
  });
  it('ignores other spaces\' events', () => {
    const d = syncDotFor('C:\\Users\\x\\YouCoded\\Projects\\budget-app', status({
      recentEvents: [{ type: 'error', spaceId: 'project:other' }],
    }));
    expect(d?.color).toBe('green');
  });
});

describe('lastSyncedLabel', () => {
  const NOW = 1_800_000_000_000;
  it('formats the latest synced event\'s timestamp relatively', () => {
    const s = status({ recentEvents: [{ type: 'synced', spaceId: 'project:budget-app', at: NOW - 2 * 60_000 }] });
    expect(lastSyncedLabel('project:budget-app', s, NOW)).toBe('2 minutes ago');
  });
  it('returns null when no synced event carries a timestamp', () => {
    const s = status({ recentEvents: [{ type: 'synced', spaceId: 'project:budget-app' }] });
    expect(lastSyncedLabel('project:budget-app', s, NOW)).toBeNull();
  });
  it('says "just now" under a minute', () => {
    const s = status({ recentEvents: [{ type: 'synced', spaceId: 'project:budget-app', at: NOW - 5_000 }] });
    expect(lastSyncedLabel('project:budget-app', s, NOW)).toBe('just now');
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run (from `desktop/`): `npx vitest run tests/sync-dot-state.test.ts`
Expected: FAIL — Cannot find module '../src/renderer/components/sync-dot-state'

- [x] **Step 3: Implement**

```ts
// desktop/src/renderer/components/sync-dot-state.ts
// Pure derivation of per-project sync state from syncSpaces.status() data.
// Renderer-safe (no fs/path — this file also ships to the Android WebView).
// The three dot states and their exact wording are pinned by the 2026-07-09
// project-sync-management-ux spec; the picker shows the dot, the tooltip and
// the Project View hero show these words.

export interface SyncStatusData {
  enabled: boolean;
  spaces: Array<{ id: string; root: string }>;
  // Engine events since app boot (last 50). `at` is stamped at broadcast time
  // (ms epoch); older payloads may lack it.
  recentEvents: Array<{ type: string; spaceId: string; at?: number; message?: string }>;
}

export interface SyncDot { color: 'green' | 'red' | 'gray'; label: string }

// Windows-tolerant normalize: forward slashes, no trailing slash, lowercased.
// (canonicalize() lives in shared/artifacts but drags in more than we need
// here; root-vs-root equality only needs slash/case folding.)
const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

export function findSpaceFor(folderPath: string, status: SyncStatusData | null): { id: string; root: string } | null {
  if (!status) return null;
  return status.spaces.find((s) => norm(s.root) === norm(folderPath)) ?? null;
}

function latestEventFor(spaceId: string, status: SyncStatusData) {
  for (let i = status.recentEvents.length - 1; i >= 0; i--) {
    if (status.recentEvents[i].spaceId === spaceId) return status.recentEvents[i];
  }
  return null;
}

export function syncDotFor(folderPath: string, status: SyncStatusData | null): SyncDot | null {
  if (!status) return null; // status() rejected (e.g. Android) — render no dot at all
  const space = findSpaceFor(folderPath, status);
  if (!space) return { color: 'gray', label: 'Only on this computer' };
  if (!status.enabled) return { color: 'gray', label: 'Sync is turned off — will sync once you turn on Sync in Settings' };
  const last = latestEventFor(space.id, status);
  if (last?.type === 'error') return { color: 'red', label: "Sync isn't working — open Manage projects" };
  return { color: 'green', label: 'Syncs across your devices' };
}

/** "just now" / "N minutes ago" / "N hours ago" / null when unknown.
 *  `now` is injectable for tests. */
export function lastSyncedLabel(spaceId: string, status: SyncStatusData | null, now: number = Date.now()): string | null {
  if (!status) return null;
  let latest: number | null = null;
  for (const e of status.recentEvents) {
    if (e.spaceId === spaceId && e.type === 'synced' && typeof e.at === 'number') {
      if (latest === null || e.at > latest) latest = e.at;
    }
  }
  if (latest === null) return null;
  const mins = Math.floor((now - latest) / 60_000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 minute ago';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
}
```

- [x] **Step 4: Run to verify it passes** — `npx vitest run tests/sync-dot-state.test.ts` → PASS

- [x] **Step 5: Commit**

```bash
git add desktop/src/renderer/components/sync-dot-state.ts desktop/tests/sync-dot-state.test.ts
git commit -m "feat(sync-ux): pure sync-dot derivation (green/red/gray + sync-off honesty + last-synced label)"
```

---

### Task 2: Backend — event timestamps + per-space sync-now

**Files:**
- Modify: `desktop/src/main/sync-spaces/types.ts` (SpaceSyncEvent union)
- Modify: `desktop/src/main/sync-spaces/service.ts` (`broadcast`, `syncSpacesSyncNow`)
- Modify: `desktop/src/main/ipc-handlers.ts` (SYNC_SPACES_SYNC_NOW handler)
- Modify: `desktop/src/main/preload.ts` (`syncNow`)
- Modify: `desktop/src/renderer/remote-shim.ts` (`syncNow`)
- Modify: `desktop/src/main/remote-server.ts` (`syncspaces:sync-now` case)
- Test: `desktop/tests/sync-spaces-service.test.ts` (append)

- [x] **Step 1: Write the failing test** — append to the existing describe in `tests/sync-spaces-service.test.ts` (this file mocks electron/engine/etc. via `vi.mock` + `vi.hoisted` and uses `freshService()` with dynamic import — follow its existing patterns exactly; read its top 70 lines first):

```ts
  it('syncSpacesSyncNow(spaceId) syncs ONLY the matching space', async () => {
    const svc = await freshService();
    await svc.startSyncSpaces(async () => [], () => {});
    await svc.syncSpacesEnable(true);
    mockEngine.syncSpace.mockClear();
    await svc.syncSpacesSyncNow('project:beta');
    // Engine mock's addSpace/syncSpace receive the space objects from the
    // mocked ManagedRoots.spaces(); assert only the matching one synced.
    expect(mockEngine.syncSpace).toHaveBeenCalledTimes(1);
    expect(mockEngine.syncSpace.mock.calls[0][0].id).toBe('project:beta');
  });

  it('syncSpacesSyncNow() with no arg still syncs every space', async () => {
    const svc = await freshService();
    await svc.startSyncSpaces(async () => [], () => {});
    await svc.syncSpacesEnable(true);
    mockEngine.syncSpace.mockClear();
    await svc.syncSpacesSyncNow();
    expect(mockEngine.syncSpace.mock.calls.length).toBeGreaterThan(1);
  });

  it('broadcast stamps events with an `at` timestamp', async () => {
    const svc = await freshService();
    await svc.startSyncSpaces(async () => [], () => {});
    await svc.syncSpacesEnable(true);
    // Fire the engine's onEvent hook the way the engine would.
    capturedOnEvent({ type: 'synced', spaceId: 'project:beta', pushed: true, updated: false });
    const st = await svc.syncSpacesStatus();
    const e = st.recentEvents.find((x: any) => x.spaceId === 'project:beta');
    expect(typeof (e as any).at).toBe('number');
  });
```

Adapt mock names (`mockEngine`, `capturedOnEvent`, spaces returned by the mocked roots) to what the file actually defines — read it first; if the existing mocks only define one space, extend the mocked `spaces()` to return two (`project:alpha`, `project:beta`). The BEHAVIOR asserted above is the contract; the harness plumbing follows the file's own conventions.

- [x] **Step 2: Run to verify the new tests fail** — `npx vitest run tests/sync-spaces-service.test.ts`

- [x] **Step 3: Implement.**

`desktop/src/main/sync-spaces/types.ts` — extend the event union: add to EACH variant of `SpaceSyncEvent` an optional stamp, e.g. change the union to intersect with `{ at?: number }`:

```ts
// Stamped by service.broadcast() at emit time (ms epoch). Optional so replayed
// or older payloads without it still typecheck. Renderer uses it for
// "Last synced N minutes ago" in the Project View hero.
export type SpaceSyncEvent = (
  | { type: 'synced'; spaceId: string; pushed: boolean; updated: boolean }
  | { type: 'conflict'; spaceId: string; copies: string[] }
  | { type: 'oversize'; spaceId: string; files: string[] }
  | { type: 'error'; spaceId: string; message: string }
) & { at?: number };
```

`desktop/src/main/sync-spaces/service.ts`:
1. In `broadcast(e)`, stamp before storing/fanning out:
```ts
function broadcast(e: SpaceSyncEvent): void {
  // Stamp at emit time — the renderer derives "Last synced N min ago" from it.
  const stamped: SpaceSyncEvent = { ...e, at: Date.now() };
  recentEvents = [...recentEvents.slice(-49), stamped];
  for (const w of BrowserWindow.getAllWindows()) {
    try { w.webContents.send('syncspaces:event', stamped); } catch { /* window closing */ }
  }
  try { remoteBroadcast?.(stamped); } catch { /* remote server not up / closing */ }
}
```
2. Per-space sync-now:
```ts
export async function syncSpacesSyncNow(spaceId?: string) {
  // spaceId narrows to one space (the Project View hero's "Sync now" button);
  // no arg keeps the SyncPanel's existing sync-everything behavior.
  if (engine && roots) {
    for (const s of roots.spaces()) {
      if (spaceId && s.id !== spaceId) continue;
      void engine.syncSpace(s);
    }
  }
  return { ok: true };
}
```

`desktop/src/main/ipc-handlers.ts` — the SYNC_SPACES_SYNC_NOW handler gains the arg:
```ts
  ipcMain.handle(IPC.SYNC_SPACES_SYNC_NOW, (_e, spaceId?: string) =>
    syncSpacesSyncNow(spaceId ? String(spaceId) : undefined));
```

`desktop/src/main/preload.ts` syncSpaces block:
```ts
    syncNow: (spaceId?: string) => ipcRenderer.invoke(IPC.SYNC_SPACES_SYNC_NOW, spaceId),
```

`desktop/src/renderer/remote-shim.ts` syncSpaces block:
```ts
      syncNow: (spaceId?: string) => invoke('syncspaces:sync-now', { spaceId }),
```

`desktop/src/main/remote-server.ts` `syncspaces:sync-now` case:
```ts
      case 'syncspaces:sync-now': {
        this.respond(client.ws, type, id, await syncSpacesSyncNow(
          payload?.spaceId ? String(payload.spaceId) : undefined));
        break;
      }
```

- [x] **Step 4: Run** — `npx vitest run tests/sync-spaces-service.test.ts tests/ipc-channels.test.ts tests/sync-spaces-engine.test.ts && npx tsc -p tsconfig.json --noEmit` → all PASS, tsc clean.

- [x] **Step 5: Commit**

```bash
git add desktop/src/main/sync-spaces/types.ts desktop/src/main/sync-spaces/service.ts desktop/src/main/ipc-handlers.ts desktop/src/main/preload.ts desktop/src/renderer/remote-shim.ts desktop/src/main/remote-server.ts desktop/tests/sync-spaces-service.test.ts
git commit -m "feat(sync-ux): event timestamps + per-space syncspaces:sync-now across all surfaces"
```

---

### Task 3: FolderSwitcher rewrite — dots, portal, "Manage projects…" footer

The rewrite REPLACES the whole component. It keeps: row list (nickname/path/missing warning/selected check/rename/remove hover actions), the useEscClose + outside-click behavior. It ADDS: portal-based fixed positioning (subsumes the uncommitted 2026-07-09 clipping fix — WHY: this picker renders inside the SessionStrip menu whose overflow-hidden clipped the old absolute dropdown), the per-row sync dot, and the single "Manage projects…" footer. It REMOVES: "Browse for folder", the inline create field, "or move an existing folder into sync…", the row "Sync this project" action, the `ImportProjectModal` mount, and the `managed` badge text (the dot replaces it).

**Files:**
- Rewrite: `desktop/src/renderer/components/FolderSwitcher.tsx`
- Modify: `desktop/src/renderer/components/SessionStrip.tsx` (~line 948: pass `onManageProjects`)

- [x] **Step 1: Rewrite the component**

```tsx
// desktop/src/renderer/components/FolderSwitcher.tsx
// The session picker's folder dropdown. Per the 2026-07-09 project-sync UX
// spec this component ONLY picks: adding/importing/syncing projects moved to
// Project View, reached via the single "Manage projects…" footer entry.
// Each row carries a sync dot (green syncing / red problem / gray not in
// sync) whose tooltip holds the full plain-language phrase.
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useScrollFade } from '../hooks/useScrollFade';
import { useEscClose } from '../hooks/use-esc-close';
import { syncDotFor, type SyncStatusData } from './sync-dot-state';

interface SavedFolder {
  path: string;
  nickname: string;
  addedAt: number;
  exists: boolean;
  // Still set by FOLDERS_LIST for managed projects; the dot supersedes the old
  // text badge but the flag keeps rename/remove semantics cheap to reason about.
  managed?: boolean;
}

interface Props {
  /** Currently selected folder path */
  value: string;
  /** Called when user selects a folder */
  onChange: (path: string) => void;
  /** Auto-select the first saved folder when value is empty (default: true) */
  autoSelect?: boolean;
  /** Opens Project View ("Manage projects…"). Omitted where Project View
   *  doesn't exist (the buddy window) — the footer row hides itself. */
  onManageProjects?: () => void;
}

// Dot colors: status colors are theme-independent by design-system rule.
// Red matches the app's existing #DD4444; green mirrors the SessionDot green.
const DOT_CLASS: Record<'green' | 'red' | 'gray', string> = {
  green: 'bg-[#44A05C]',
  red: 'bg-[#DD4444]',
  gray: 'bg-fg-faint',
};

export default function FolderSwitcher({ value, onChange, autoSelect = true, onManageProjects }: Props) {
  const [folders, setFolders] = useState<SavedFolder[]>([]);
  const [open, setOpen] = useState(false);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editNickname, setEditNickname] = useState('');
  const [syncStatus, setSyncStatus] = useState<SyncStatusData | null>(null);
  const editRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // The dropdown panel is PORTALED to document.body (see render below), so it
  // needs its own ref for the outside-click check — it is no longer a DOM
  // child of wrapperRef.
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useScrollFade<HTMLDivElement>();
  // Fixed-position coordinates for the portaled dropdown, computed from the
  // trigger button's screen rect whenever the dropdown opens (and on resize).
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await (window as any).claude.folders.list();
      setFolders(list);
      // Auto-select the first folder (home) when no value is set
      if (autoSelect && !value && list.length > 0) {
        onChange(list[0].path);
      }
    } catch {}
  }, [value, onChange, autoSelect]);

  useEffect(() => { load(); }, [load]);

  // Fetch sync state when the dropdown opens. catch → null: on Android the
  // shim has no syncspaces handlers (30s reject) — rows simply render no dot.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (window as any).claude.syncSpaces.status()
      .then((s: SyncStatusData) => { if (!cancelled) setSyncStatus(s); })
      .catch(() => { if (!cancelled) setSyncStatus(null); });
    return () => { cancelled = true; };
  }, [open]);

  // Position the portaled dropdown under the trigger, clamped to the viewport.
  // WHY a portal + fixed positioning at all: this picker lives inside the
  // SessionStrip's new-session menu, whose rounded-corner containers use
  // overflow-hidden — an absolutely-positioned child gets CLIPPED at the menu
  // edges (cut-off icons, truncated list). Portaling to document.body lets the
  // dropdown float above the host menu instead of being squeezed inside it.
  const PANEL_WIDTH = 288; // w-72
  const measure = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const margin = 8;
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - PANEL_WIDTH / 2, margin),
      window.innerWidth - PANEL_WIDTH - margin
    );
    const top = rect.bottom + 4;
    // Never extend past the viewport bottom — the panel scrolls instead.
    const maxHeight = Math.max(window.innerHeight - top - margin, 120);
    setPanelPos({ top, left, maxHeight });
  }, []);

  useLayoutEffect(() => {
    if (!open) { setPanelPos(null); return; }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open, measure]);

  // Close panel on outside click/tap. The panel is portaled, so "inside" means
  // inside the trigger wrapper OR inside the floating panel itself.
  useEffect(() => {
    if (!open) return;
    const handler = (e: Event) => {
      const t = e.target as Node;
      if (wrapperRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
      setEditingPath(null);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  // Close panel on Escape — routed through the central useEscClose LIFO stack
  // so chat-passthrough preventDefault works consistently with other overlays.
  const handleEscClose = useCallback(() => {
    setOpen(false);
    setEditingPath(null);
  }, []);
  useEscClose(open, handleEscClose);

  // Focus nickname input when editing starts
  useEffect(() => {
    if (editingPath && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editingPath]);

  const handleSelect = useCallback((path: string) => {
    onChange(path);
    setOpen(false);
    setEditingPath(null);
  }, [onChange]);

  const handleRemove = useCallback(async (e: React.MouseEvent, folderPath: string) => {
    e.stopPropagation();
    await (window as any).claude.folders.remove(folderPath);
    await load();
    // If we just removed the selected folder, clear selection
    if (value === folderPath) onChange('');
  }, [value, onChange, load]);

  const handleStartRename = useCallback((e: React.MouseEvent, folder: SavedFolder) => {
    e.stopPropagation();
    setEditingPath(folder.path);
    setEditNickname(folder.nickname);
  }, []);

  const handleFinishRename = useCallback(async () => {
    if (!editingPath || !editNickname.trim()) {
      setEditingPath(null);
      return;
    }
    await (window as any).claude.folders.rename(editingPath, editNickname.trim());
    await load();
    setEditingPath(null);
  }, [editingPath, editNickname, load]);

  // Find nickname for current value
  const currentFolder = folders.find(f => f.path === value);
  const displayLabel = currentFolder
    ? currentFolder.nickname
    : value
      ? value.replace(/\\/g, '/').split('/').pop() || value
      : 'Select folder...';

  return (
    <div ref={wrapperRef} className="relative">
      {/* Trigger button — shows current selection */}
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className="w-full text-left px-2.5 py-1.5 bg-inset border border-edge rounded-md text-xs text-fg-2 hover:border-edge transition-colors truncate flex items-center gap-1.5"
      >
        <svg className="w-3 h-3 shrink-0 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <span className="flex-1 truncate">{displayLabel}</span>
        <svg className={`w-3 h-3 shrink-0 text-fg-faint transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Full path hint below trigger */}
      {value && (
        <div className="mt-0.5 px-1 text-[10px] text-fg-faint truncate" title={value}>
          {value}
        </div>
      )}

      {/* Dropdown panel — uses .layer-surface for theme-driven background,
          border, shadow, and glassmorphism (blur/opacity from --panels-* vars).
          PORTALED to document.body with fixed positioning so the host menu's
          overflow-hidden can't clip it (see the WHY on `measure` above).
          zIndex 9001: the SessionStrip menu that hosts this picker is the
          documented z-[9000] exception (PITFALLS → Overlays) — a popover
          spawned FROM that menu must render above its own host. */}
      {open && panelPos && createPortal(
        <div
          ref={panelRef}
          className="layer-surface fixed w-72 overflow-hidden flex flex-col"
          style={{ top: panelPos.top, left: panelPos.left, maxHeight: panelPos.maxHeight, zIndex: 9001, animation: 'dropdown-in 120ms cubic-bezier(0.16, 1, 0.3, 1) both' }}
        >
          {/* Saved folders list — min-h-0 lets flexbox shrink the list first
              when the viewport-clamped panel height is tight. */}
          {folders.length > 0 && (
            <div ref={listRef} className="scroll-fade max-h-48 min-h-0">
              <div className="py-1">
              {folders.map((f) => {
                const isSelected = f.path === value;
                const isEditing = editingPath === f.path;
                const dot = syncDotFor(f.path, syncStatus);

                return (
                  <div
                    key={f.path}
                    onClick={() => !isEditing && handleSelect(f.path)}
                    className={`group/folder flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-accent/10 text-fg'
                        : f.exists
                          ? 'text-fg-2 hover:bg-inset hover:text-fg'
                          : 'text-fg-faint hover:bg-inset'
                    }`}
                  >
                    {/* Folder icon */}
                    <svg className={`w-3 h-3 shrink-0 ${f.exists ? 'text-fg-muted' : 'text-[#DD4444]/60'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>

                    {/* Nickname (editable) or display */}
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <input
                          ref={editRef}
                          value={editNickname}
                          onChange={(e) => setEditNickname(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleFinishRename();
                            if (e.key === 'Escape') setEditingPath(null);
                          }}
                          onBlur={handleFinishRename}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full bg-inset border border-edge rounded-sm px-1 py-0.5 text-xs text-fg outline-none focus:border-accent"
                        />
                      ) : (
                        <>
                          <div className="text-xs truncate">{f.nickname}</div>
                          <div className="text-[10px] text-fg-faint truncate" title={f.path}>
                            {f.path}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Stale warning */}
                    {!f.exists && !isEditing && (
                      <span className="text-[9px] text-[#DD4444]/80 shrink-0" title="Directory not found">
                        missing
                      </span>
                    )}

                    {/* Action buttons — visible on hover */}
                    {!isEditing && (
                      <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover/folder:opacity-100 transition-opacity">
                        {/* Rename */}
                        <button
                          onClick={(e) => handleStartRename(e, f)}
                          className="w-5 h-5 flex items-center justify-center rounded-sm text-fg-faint hover:text-fg hover:bg-inset transition-colors"
                          title="Rename"
                        >
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        {/* Remove */}
                        <button
                          onClick={(e) => handleRemove(e, f.path)}
                          className="w-5 h-5 flex items-center justify-center rounded-sm text-fg-faint hover:text-[#DD4444] hover:bg-inset transition-colors"
                          title="Remove from list"
                        >
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    )}

                    {/* Selected check */}
                    {isSelected && !isEditing && (
                      <svg className="w-3 h-3 shrink-0 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}

                    {/* Sync dot — green syncing / red problem / gray not in
                        sync; the tooltip carries the full phrase. Renders only
                        when syncSpaces.status() resolved (desktop). */}
                    {dot && !isEditing && (
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${DOT_CLASS[dot.color]}`}
                        title={dot.label}
                        aria-label={dot.label}
                      />
                    )}
                  </div>
                );
              })}
              </div>
            </div>
          )}

          {/* Footer: the ONLY action — everything about adding/importing/
              syncing projects lives in Project View (spec decision 3). */}
          {onManageProjects && (
            <div className="border-t border-edge">
              <button
                onClick={() => { setOpen(false); onManageProjects(); }}
                className="w-full px-2.5 py-2 text-xs text-fg-dim hover:bg-inset hover:text-fg transition-colors flex items-center justify-center gap-1.5"
              >
                Manage projects…
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
```

- [x] **Step 2: Wire SessionStrip.** In `desktop/src/renderer/components/SessionStrip.tsx`: add `import { useArtifact } from '../state/ArtifactContext';` and inside the component body `const { dispatch: artifactDispatch } = useArtifact();` (SessionStrip renders only in the main window, inside the ArtifactContext provider — the buddy window uses FolderSwitcher directly and simply omits the prop). Then at the `<FolderSwitcher …>` usage (~line 948):

```tsx
                <FolderSwitcher
                  value={newCwd}
                  onChange={setNewCwd}
                  // "Manage projects…" bridges to Project View (same action as
                  // the header button) and closes the session menu behind it.
                  onManageProjects={() => { setMenuOpen(false); artifactDispatch({ type: 'PROJECT_VIEW_OPENED' }); }}
                />
```

Verify the menu-close setter's real name in this component (the remote-session rows nearby call `setMenuOpen(false)`) and match it. If `useArtifact` cannot be called at SessionStrip's top level for provider-ordering reasons (check how HeaderBar isolates it at line ~195), isolate the same way HeaderBar does.

- [x] **Step 3: Verify** — `npx tsc -p tsconfig.json --noEmit && npx vitest run tests/sync-dot-state.test.ts tests/ipc-channels.test.ts` → clean/PASS. (BuddyNewSessionForm compiles unchanged — the new prop is optional.)

- [x] **Step 4: Commit**

```bash
git add desktop/src/renderer/components/FolderSwitcher.tsx desktop/src/renderer/components/SessionStrip.tsx
git commit -m "feat(sync-ux): picker slim-down — sync dots, portal positioning, single Manage-projects footer"
```

---

### Task 4: AddProjectModal — the unified two-step add flow

**Files:**
- Create: `desktop/src/renderer/components/project-view/AddProjectModal.tsx`

Read `desktop/src/renderer/components/ImportProjectModal.tsx` first — this modal reuses its conventions exactly (Scrim/OverlayPanel layer 2, useEscClose, cancelledRef, inFlightRef, a11y roles, inline errors, rejection-safe invokes).

- [x] **Step 1: Create the component**

```tsx
// desktop/src/renderer/components/project-view/AddProjectModal.tsx
// The unified "Add a project" flow (2026-07-09 project-sync UX spec §3).
// A thin ROUTER over existing machinery — no new main-process flows:
//   Start something new        → syncSpaces.createProject(name)
//   Use existing → keep        → folders.add(path)
//   Use existing → move+sync   → the existing ImportProjectModal (consent+move)
// Step 1 asks the only question a new user can answer instantly (new or
// existing?); step 2 makes the sync decision explicit with its consequence.
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Scrim, OverlayPanel } from '../overlays/Overlay';
import { useEscClose } from '../../hooks/use-esc-close';
import ImportProjectModal from '../ImportProjectModal';

interface Props {
  onClose: () => void;
  /** Called with the project path after ANY successful add path. */
  onAdded: (path: string) => void;
}

type Step =
  | { kind: 'choose' }
  | { kind: 'existing'; path: string; baseName: string }
  | { kind: 'move'; path: string; baseName: string };

export default function AddProjectModal({ onClose, onAdded }: Props) {
  const [step, setStep] = useState<Step>({ kind: 'choose' });
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Honesty rule: when global Sync is off, every sync promise softens to
  // "will sync once you turn on Sync in Settings". null = unknown (e.g.
  // Android where syncspaces handlers don't exist) — show no note.
  const [syncEnabled, setSyncEnabled] = useState<boolean | null>(null);
  const cancelledRef = useRef(false);
  const inFlightRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    (window as any).claude.syncSpaces.status()
      .then((s: any) => { if (!cancelledRef.current) setSyncEnabled(!!s?.enabled); })
      .catch(() => { if (!cancelledRef.current) setSyncEnabled(null); });
    return () => { cancelledRef.current = true; };
  }, []);

  // The move step delegates entirely to ImportProjectModal (it owns the
  // consent copy, name confirm, warnings). ESC/scrim for THIS modal only
  // apply outside the move step (ImportProjectModal manages its own).
  useEscClose(step.kind !== 'move' && !busy, onClose);

  const createNew = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || inFlightRef.current) return;
    inFlightRef.current = true;
    setBusy(true);
    setError(null);
    // try/catch: on Android the shim rejects after 30s — surface inline.
    try {
      const r = await (window as any).claude.syncSpaces.createProject(trimmed);
      if (cancelledRef.current) return;
      if (r?.ok) onAdded(r.path);
      else setError(r?.error ?? 'Could not create the project');
    } catch (err: any) {
      if (!cancelledRef.current) setError(String(err?.message ?? err));
    } finally {
      inFlightRef.current = false;
      if (!cancelledRef.current) setBusy(false);
    }
  }, [name, onAdded]);

  const pickExisting = useCallback(async () => {
    try {
      const folder: string | null = await (window as any).claude.dialog.openFolder();
      if (!folder || cancelledRef.current) return;
      const baseName = folder.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? '';
      setError(null);
      setStep({ kind: 'existing', path: folder, baseName });
    } catch { /* dialog unavailable (remote) — nothing to do */ }
  }, []);

  const keepInPlace = useCallback(async () => {
    if (step.kind !== 'existing' || inFlightRef.current) return;
    inFlightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await (window as any).claude.folders.add(step.path);
      if (!cancelledRef.current) onAdded(step.path);
    } catch (err: any) {
      if (!cancelledRef.current) setError(String(err?.message ?? err));
    } finally {
      inFlightRef.current = false;
      if (!cancelledRef.current) setBusy(false);
    }
  }, [step, onAdded]);

  const syncOffNote = syncEnabled === false && (
    <div className="mt-3 rounded-md border border-edge bg-inset px-3 py-2 text-xs text-fg-dim" role="note">
      <span className="text-fg-2 font-medium">Sync is currently turned off.</span>{' '}
      This project will start syncing once you turn on Sync in Settings.
    </div>
  );

  if (step.kind === 'move') {
    return (
      <ImportProjectModal
        sourcePath={step.path}
        defaultName={step.baseName}
        onClose={() => setStep({ kind: 'existing', path: step.path, baseName: step.baseName })}
        onDone={(p) => onAdded(p)}
      />
    );
  }

  return (
    <>
      <Scrim layer={2} onClick={busy ? undefined : onClose} />
      <OverlayPanel
        layer={2}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[26rem] max-w-[calc(100vw-2rem)] p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-project-title"
      >
        {step.kind === 'choose' ? (
          <>
            <div id="add-project-title" className="text-sm font-medium text-fg">Add a project</div>

            {/* Choice 1: start new (inline name + create) */}
            <div className="mt-3 rounded-lg border border-edge p-3">
              <div className="text-[13px] font-semibold text-fg">Start something new</div>
              <div className="mt-0.5 text-xs text-fg-dim">Creates an empty project in YouCoded that syncs across your devices.</div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void createNew(); }}
                  placeholder="Project name…"
                  className="flex-1 bg-inset text-fg text-sm rounded px-2 py-1 border border-edge-dim focus:border-accent outline-none"
                />
                <button
                  onClick={() => void createNew()}
                  disabled={busy || !name.trim()}
                  className="text-sm px-3 py-1 rounded bg-accent text-on-accent disabled:opacity-50"
                >
                  {busy ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>

            {/* Choice 2: existing folder → step 2 */}
            <button
              onClick={() => void pickExisting()}
              disabled={busy}
              className="mt-2 w-full text-left rounded-lg border border-edge p-3 hover:border-accent hover:bg-inset transition-colors"
            >
              <div className="text-[13px] font-semibold text-fg">Use a folder already on this computer</div>
              <div className="mt-0.5 text-xs text-fg-dim">Pick any folder — you'll choose whether it syncs next.</div>
            </button>

            {error && <div className="mt-2 text-xs text-red-500" role="alert">{error}</div>}
            {syncOffNote}
            <div className="mt-4 flex justify-end">
              <button onClick={onClose} disabled={busy} className="text-sm px-3 py-1 rounded text-fg-dim hover:text-fg hover:bg-inset transition-colors">Cancel</button>
            </div>
          </>
        ) : (
          <>
            <div id="add-project-title" className="text-sm font-medium text-fg">How should “{step.baseName}” work?</div>

            <button
              onClick={() => void keepInPlace()}
              disabled={busy}
              className="mt-3 w-full text-left rounded-lg border border-edge p-3 hover:border-accent hover:bg-inset transition-colors"
            >
              <div className="text-[13px] font-semibold text-fg">Keep it where it is</div>
              <div className="mt-0.5 text-xs text-fg-dim">Only on this computer. The folder doesn't move and nothing changes.</div>
            </button>

            <button
              onClick={() => setStep({ kind: 'move', path: step.path, baseName: step.baseName })}
              disabled={busy}
              className="mt-2 w-full text-left rounded-lg border border-edge p-3 hover:border-accent hover:bg-inset transition-colors"
            >
              <div className="text-[13px] font-semibold text-fg">Move it into YouCoded so it syncs</div>
              <div className="mt-0.5 text-xs text-fg-dim">The folder moves to ~/YouCoded/Projects/ and syncs across your devices. Anything pointing at the old location (shortcuts, open terminals) will need the new path.</div>
            </button>

            {error && <div className="mt-2 text-xs text-red-500" role="alert">{error}</div>}
            {syncOffNote}
            <div className="mt-4 flex justify-between">
              <button onClick={() => { setError(null); setStep({ kind: 'choose' }); }} disabled={busy} className="text-sm px-3 py-1 rounded text-fg-dim hover:text-fg hover:bg-inset transition-colors">Back</button>
              <button onClick={onClose} disabled={busy} className="text-sm px-3 py-1 rounded text-fg-dim hover:text-fg hover:bg-inset transition-colors">Cancel</button>
            </div>
          </>
        )}
      </OverlayPanel>
    </>
  );
}
```

Note: if `OverlayPanel` doesn't accept `role`/`aria-*` props (check its signature in `components/overlays/Overlay.tsx` — ImportProjectModal already passes them, so it almost certainly does), match however ImportProjectModal attaches them.

- [x] **Step 2: Verify** — `npx tsc -p tsconfig.json --noEmit` → clean.

- [x] **Step 3: Commit**

```bash
git add desktop/src/renderer/components/project-view/AddProjectModal.tsx
git commit -m "feat(sync-ux): unified two-step Add-a-project modal (router over create/add/import)"
```

---

### Task 5: Project View wiring — hero sync hub, switcher dots, add/remove gating

**Files:**
- Modify: `desktop/src/renderer/components/project-view/ProjectView.tsx`
- Modify: `desktop/src/renderer/components/project-view/ProjectHero.tsx`
- Modify: `desktop/src/renderer/components/project-view/ProjectSwitcher.tsx`

- [x] **Step 1: ProjectView — sync status + modal mounts.** In `ProjectView.tsx`:

1. State additions near the other useState calls (~line 167):
```tsx
  const [syncStatus, setSyncStatus] = useState<SyncStatusData | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  // Turn-on-sync consent modal for the ACTIVE project (hero button).
  const [turnOnSyncFor, setTurnOnSyncFor] = useState<{ path: string; name: string } | null>(null);
```
with imports:
```tsx
import { syncDotFor, findSpaceFor, lastSyncedLabel, type SyncStatusData } from '../sync-dot-state';
import AddProjectModal from './AddProjectModal';
import ImportProjectModal from '../ImportProjectModal';
```

2. Fetch sync status whenever the view opens or the project list refreshes — add to the existing load effect (the one keyed on `[activeProject?.id, activeProject?.path, refreshKey, countsKey]`) or a parallel small effect:
```tsx
  // Per-project sync state for the hero + switcher dots. catch → null (Android
  // has no syncspaces handlers; the UI simply shows no sync affordances).
  useEffect(() => {
    if (!state.projectViewOpen) return;
    let cancelled = false;
    (window.claude as any).syncSpaces.status()
      .then((s: SyncStatusData) => { if (!cancelled) setSyncStatus(s); })
      .catch(() => { if (!cancelled) setSyncStatus(null); });
    return () => { cancelled = true; };
  }, [state.projectViewOpen, refreshKey, countsKey, activeProject?.path]);
```

3. Replace `handleAddProject`'s body: it now just opens the modal —
```tsx
  const handleAddProject = () => {
    setSwitcherOpen(false);
    setAddOpen(true);
  };
```
and add the shared post-add handler (reusing the existing refresh + suffix-select logic verbatim from the old handleAddProject):
```tsx
  // After ANY successful add path (create / keep-in-place / move+sync):
  // refresh the list and select the project at its (possibly new) path.
  const handleAdded = async (path: string) => {
    setAddOpen(false);
    setTurnOnSyncFor(null);
    const res = await (window.claude as any).artifacts.listProjectsIndex({ withCounts: true });
    if (res?.ok) {
      setProjects(res.projects);
      const added = res.projects.find(
        (p: CentralIndexProject) => p.path.replace(/\\/g, '/').toLowerCase() === path.replace(/\\/g, '/').toLowerCase()
      );
      if (added) setActiveProject(added);
    }
  };
```

4. Hero wiring — compute per-active-project sync props and pass them (at the `<ProjectHero …>` callsite ~line 445):
```tsx
              {(() => {
                const space = findSpaceFor(activeProject.path, syncStatus);
                const dot = syncDotFor(activeProject.path, syncStatus);
                return (
                  <ProjectHero
                    project={activeProject}
                    stats={heroStats}
                    repo={heroRepo}
                    onOpenSwitcher={() => setSwitcherOpen(true)}
                    onNewConversation={props.onNewConversation}
                    sync={dot && {
                      dot,
                      spaceId: space?.id ?? null,
                      lastSynced: space ? lastSyncedLabel(space.id, syncStatus) : null,
                      // Latest error message for the inline note (friendly-error contract).
                      errorMessage: dot.color === 'red'
                        ? [...(syncStatus?.recentEvents ?? [])].reverse().find(e => e.spaceId === space?.id && e.type === 'error')?.message ?? null
                        : null,
                    }}
                    onTurnOnSync={() => setTurnOnSyncFor({ path: activeProject.path, name: activeProject.name })}
                    onSyncNow={(spaceId) => { void (window.claude as any).syncSpaces.syncNow(spaceId); }}
                    onRenamed={async () => {
                      const res = await (window.claude as any).artifacts.listProjectsIndex({ withCounts: true });
                      if (res?.ok) {
                        setProjects(res.projects);
                        const cur = res.projects.find((p: CentralIndexProject) => p.path === activeProject.path);
                        if (cur) setActiveProject(cur);
                      }
                    }}
                    canRemove={!space}
                    onRemove={() => setDeletingProject(activeProject)}
                  />
                );
              })()}
```
(Adjust to the file's actual JSX style — the point is the prop payload, not the IIFE.)

5. Mount the modals near the existing delete-confirm modal (~line 653):
```tsx
      {addOpen && (
        <AddProjectModal onClose={() => setAddOpen(false)} onAdded={(p) => void handleAdded(p)} />
      )}
      {turnOnSyncFor && (
        <ImportProjectModal
          sourcePath={turnOnSyncFor.path}
          defaultName={turnOnSyncFor.name}
          onClose={() => setTurnOnSyncFor(null)}
          onDone={(p) => void handleAdded(p)}
        />
      )}
```

6. Pass `syncStatus` to `<ProjectSwitcher … syncStatus={syncStatus} />` and gate its per-row remove: change the `onDeleteProject` prop it receives to skip synced rows (see Step 3).

- [x] **Step 2: ProjectHero — sync line + actions row.** Extend the props and render. New prop types at the top of `ProjectHero.tsx`:

```tsx
import { type SyncDot } from '../sync-dot-state';

interface HeroSync {
  dot: SyncDot;
  spaceId: string | null;
  lastSynced: string | null;
  errorMessage: string | null;
}
```
Extend `ProjectHeroProps`:
```tsx
  sync: HeroSync | null;             // null → syncSpaces unavailable: render no sync line
  onTurnOnSync: () => void;
  onSyncNow: (spaceId: string) => void;
  onRenamed: () => void;             // parent refreshes the list after a nickname rename
  canRemove: boolean;                // false for synced projects (move-out is deferred)
  onRemove: () => void;
```

Inside the component, add local rename state + commit:
```tsx
  const [renaming, setRenaming] = useState(false);
  const [nickname, setNickname] = useState(project.name);
  useEffect(() => { setNickname(project.name); setRenaming(false); }, [project.path]);
  const commitRename = async () => {
    const n = nickname.trim();
    setRenaming(false);
    if (!n || n === project.name) return;
    // Nickname only — NEVER the folder on disk (a folder rename would change
    // the sync identity; spec defers that). folders.rename updates the picker
    // nickname, which buildSavedFolderProjects prefers for the display name.
    await (window.claude as any).folders.rename(project.path, n).catch(() => {});
    onRenamed();
  };
```
(Adds `useState`/`useEffect` to the React import.)

Render the sync line directly under the path/repo row (after the `mt-1.5` div, before the stat row):
```tsx
        {/* Sync status line (2026-07-09 spec §4). Plain words + the one action
            that matters for the state. Hidden when syncSpaces is unavailable. */}
        {sync && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-inset px-3 py-2">
            {sync.dot.color === 'green' && (
              <>
                <span className="text-[13px] font-semibold text-[#44A05C]">Syncs across your devices</span>
                {sync.lastSynced && <span className="text-xs text-fg-muted">Last synced {sync.lastSynced}</span>}
                {sync.spaceId && (
                  <button
                    type="button"
                    onClick={() => onSyncNow(sync.spaceId!)}
                    className="px-2.5 py-1 rounded-md bg-panel border border-edge-dim hover:border-edge text-xs text-fg-2 hover:text-fg transition-colors"
                  >
                    Sync now
                  </button>
                )}
              </>
            )}
            {sync.dot.color === 'red' && (
              <>
                <span className="text-[13px] font-semibold text-[#DD4444]">Sync isn't working</span>
                {sync.errorMessage && <span className="text-xs text-fg-dim">{sync.errorMessage}</span>}
                {sync.spaceId && (
                  <button
                    type="button"
                    onClick={() => onSyncNow(sync.spaceId!)}
                    className="px-2.5 py-1 rounded-md bg-panel border border-edge-dim hover:border-edge text-xs text-fg-2 hover:text-fg transition-colors"
                  >
                    Try again
                  </button>
                )}
              </>
            )}
            {sync.dot.color === 'gray' && sync.spaceId && (
              // Managed but global Sync is off — the honesty rule.
              <span className="text-[13px] text-fg-dim">Sync is turned off — this project will sync once you turn it on in Settings</span>
            )}
            {sync.dot.color === 'gray' && !sync.spaceId && (
              <>
                <span className="text-[13px] font-semibold text-fg-2">Only on this computer</span>
                <button
                  type="button"
                  onClick={onTurnOnSync}
                  className="px-3 py-1 rounded-md bg-accent text-on-accent text-xs hover:opacity-90 transition-opacity"
                >
                  Turn on sync for this project
                </button>
              </>
            )}
          </div>
        )}
```

And the management actions row directly under the stat row:
```tsx
        {/* Management actions (spec §4). Rename = picker nickname only. Remove
            hides for synced projects (move-out-of-sync is a deferred flow). */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {renaming ? (
            <input
              value={nickname}
              autoFocus
              onChange={(e) => setNickname(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void commitRename(); if (e.key === 'Escape') { setNickname(project.name); setRenaming(false); } }}
              onBlur={() => void commitRename()}
              className="bg-inset text-fg text-xs rounded px-2 py-1 border border-edge-dim focus:border-accent outline-none"
            />
          ) : (
            <button type="button" onClick={() => setRenaming(true)} className="px-2.5 py-1 rounded-md border border-edge-dim hover:border-edge text-xs text-fg-2 hover:text-fg transition-colors">
              Rename
            </button>
          )}
          {isElectron && (
            <button
              type="button"
              onClick={() => void (window.claude as any).shell.openPath(project.path)}
              className="px-2.5 py-1 rounded-md border border-edge-dim hover:border-edge text-xs text-fg-2 hover:text-fg transition-colors"
            >
              Open in File Explorer
            </button>
          )}
          {canRemove ? (
            <button type="button" onClick={onRemove} className="px-2.5 py-1 rounded-md border border-edge-dim hover:border-edge text-xs text-fg-2 hover:text-[#DD4444] transition-colors">
              Remove from YouCoded
            </button>
          ) : (
            <span className="text-[11px] text-fg-faint">Managed by sync</span>
          )}
        </div>
```
with `const isElectron = getPlatform() === 'electron';` and `import { getPlatform } from '../../platform';` (verify the module path — SessionDrawer.tsx:174 imports the same helper; copy its import specifier).

- [x] **Step 3: ProjectSwitcher — dots + remove gating.** In `ProjectSwitcher.tsx`:
1. Props: add `syncStatus?: SyncStatusData | null;` (import `{ syncDotFor, findSpaceFor, type SyncStatusData }` from `../sync-dot-state`).
2. In the row map (after the files·chats hint, before the active check):
```tsx
                  {(() => {
                    const dot = syncDotFor(p.path, syncStatus ?? null);
                    return dot ? (
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ml-1 ${dot.color === 'green' ? 'bg-[#44A05C]' : dot.color === 'red' ? 'bg-[#DD4444]' : 'bg-fg-faint'}`}
                        title={dot.label}
                        aria-label={dot.label}
                      />
                    ) : null;
                  })()}
```
3. Gate the hover remove-×: replace the `{onDeleteProject && (` condition with `{onDeleteProject && !findSpaceFor(p.path, syncStatus ?? null) && (` — synced rows don't offer remove (deferred move-out flow); the title stays "Remove … from YouCoded".

- [x] **Step 4: Verify** — `npx tsc -p tsconfig.json --noEmit && npx vitest run tests/sync-dot-state.test.ts && npm run build` → clean.

- [x] **Step 5: Commit**

```bash
git add desktop/src/renderer/components/project-view/ProjectView.tsx desktop/src/renderer/components/project-view/ProjectHero.tsx desktop/src/renderer/components/project-view/ProjectSwitcher.tsx
git commit -m "feat(sync-ux): Project View management hub — hero sync line + actions, switcher dots, unified add flow wiring"
```

---

### Task 6: Full verification

- [x] **Step 1:** From `desktop/`: `env -u YOUCODED_PROFILE -u YOUCODED_PORT_OFFSET npx vitest run` → ALL green (transport contract tests take 45–85s — normal). Then `npx tsc -p tsconfig.json --noEmit && npm run build` → clean.
- [x] **Step 2:** Static review of the four spec copy rules against the diff (`git diff origin/master --stat` + grep): the noun is "project" in all new user-facing strings; the two sync phrases appear exactly as specced; no `●◐○` glyph characters anywhere (`git diff origin/master | grep -c "●\|◐\|○"` → 0); sync-off wording present in AddProjectModal + hero + dot label.
- [x] **Step 3: Commit any fixes**, then hand back to the coordinator. **Do NOT start a dev instance** — port 5223 is held by Destin's running session; the live UI review happens post-merge via the main checkout's HMR (coordinator handles the merge, including discarding the main checkout's uncommitted FolderSwitcher.tsx first — it is subsumed by Task 3).

---

### Task 7: Docs + PR (coordinator or final subagent)

- [x] **Step 1: Workspace docs** (`youcoded-dev` master): add to `docs/PITFALLS.md → Sync Spaces` a short "Project & sync management UX" subsection: dots are the ONE sanctioned status-color use (tooltip carries the words; the no-●◐○-glyph rule is about glyph text, not colored dots — Destin chose the dots explicitly); FolderSwitcher is portaled to document.body at z-9001 (host menu is the z-9000 exception — don't "fix" either); the picker deliberately has NO add/import actions (spec decision 3 — don't reintroduce); `SpaceSyncEvent.at` is stamped in `broadcast()` and is the ONLY source for "Last synced" (no persistence); `syncSpacesSyncNow(spaceId?)` narrows to one space. Check this plan's boxes + append an execution log.
- [x] **Step 2: PR** on `itsdestin/youcoded` from `feat/project-sync-ux` to master, describing the spec link, the three surfaces, and that the FolderSwitcher portal fix (live-session hotfix) is included here rather than as a separate PR.

---

## Self-review (run after writing, fixed inline)

- Spec coverage: picker rows+dots+footer (T3), Manage bridge (T3 SessionStrip), add flow both steps + sync-off note (T4), hero sync line all four states + Sync now + error message + actions (T5), switcher dots + remove gating (T5), per-space sync-now + timestamps (T2), honesty rule (T1 labels + T4 note + T5 gray-managed line), deferrals honored (no move-out, nickname-only rename, no Kotlin) ✓.
- Type consistency: `SyncStatusData`/`SyncDot`/`findSpaceFor`/`lastSyncedLabel` defined in T1, consumed in T3/T5 with matching signatures; `syncNow(spaceId?)` matches T2's surfaces; `HeroSync` local to ProjectHero ✓.
- Placeholders: none — every code step carries the code; T2's test harness adaptation is explicitly bounded ("behavior is the contract, plumbing follows the file's conventions").
- Known judgment calls for reviewers: `managed` badge text removed in favor of the dot (spec decision 2); ProjectSwitcher "Add a project" footer now opens the modal (unchanged wiring — `onAddProject` still fires, only its implementation changed).

---

## Execution log (2026-07-09, subagent-driven development)

Executed task-by-task with a fresh Opus implementer per task + spec-compliance review + code-quality review per task, then a whole-branch final review. Merged as youcoded#112 (merge commit `8af94119`); worktree + branch cleaned up; main checkout's uncommitted FolderSwitcher hotfix discarded (subsumed by Task 3).

| Task | Commits | Review outcome |
|---|---|---|
| 1 sync-dot-state module | `c6cb370a`, `bcbf099f` | Spec ✅; quality approved (+3 label-branch tests added on reviewer suggestion) |
| 2 timestamps + per-space sync-now | `544f7b47`, `1a269f35` | Spec review caught the remote-server.ts edit left UNCOMMITTED (remote parity would have shipped broken) → committed; quality approved |
| 3 FolderSwitcher rewrite | `d181eacf`, `4f572fcb` | Spec ✅; quality approved (+corrected a stale WHY comment on the dead `managed` field, linked PANEL_WIDTH↔w-72) |
| 4 AddProjectModal | `a3ff9e0b`, `76108dce` | Spec ✅ (copy byte-verified); quality approved (+stale-error clear on move transition, surfaced picker failures, autofocus-absence WHY) |
| 5 Project View wiring | `49685e72`, `63525807` | Spec ✅; quality flagged "Sync now gives no feedback / status goes stale" → fixed with a debounced `syncSpaces.onEvent` subscription + handleAdded/onRenamed hardening; re-approved |
| 6 full verification | — | 1426 passed / 34 skipped; tsc + `npm run build` clean; all four copy rules pass (glyph grep = 0) |
| final whole-branch review | `15d043e0` | Found the buddy window lost its only add-folder route (picker slim-down removed browse; buddy has no Project View) → "Browse for folder…" fallback rendered ONLY when `onManageProjects` is absent; welcome-screen picker gained the Manage entry; ImportProjectModal gained the sync-off honesty note (it's reached directly from the hero); HeaderBar isolation comment corrected. Re-review APPROVED |

Notable catches the review loops earned their cost on: the uncommitted parity surface (Task 2), the buddy-window dead end, and the sync-now-invisible-feedback gap — all would have reached Destin's UI review as real defects.
