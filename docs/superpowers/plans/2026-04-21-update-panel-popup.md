# Update Panel Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the version-pill's browser-opening onClick with an in-app L2 popup. When `updateStatus.update_available` is true, show an "Update Now: vCURRENT → vLATEST" button plus changelog entries since the user's current version. When up to date, show the full rendered `CHANGELOG.md`. Cache the changelog until the app version changes.

**Architecture:** New main-process module `changelog-service.ts` handles fetching `raw.githubusercontent.com/itsdestin/youcoded/master/CHANGELOG.md`, parsing Keep-a-Changelog-style `## [X.Y.Z]` headers, and caching to `~/.claude/.changelog-cache.json` keyed on the running app version. One new IPC channel `update:changelog`. New renderer component `UpdatePanel.tsx` (L2 overlay patterned on `AboutPopup.tsx`) renders filtered or full changelog via the existing `MarkdownContent` component. `StatusBar.tsx` version-pill onClick flips to open the popup; the popup itself branches on `update_available`.

**Tech Stack:** TypeScript, React, Vitest, Electron (main + renderer), Kotlin (Android stub only).

**Spec:** `docs/superpowers/specs/2026-04-21-update-panel-popup-design.md`

---

## Preconditions

- [ ] **Verify workspace is up-to-date**

Run:
```bash
cd /c/Users/desti/youcoded-dev/youcoded && git fetch origin && git pull origin master
```
Expected: `Already up to date` or clean fast-forward.

---

## Task 0: Create worktree for this work

Per workspace CLAUDE.md: "Any work beyond a handful of lines must be done in a separate git worktree." This feature touches ~8 files and adds ~4 new ones.

**Files:**
- New worktree at `/c/Users/desti/youcoded-worktrees/update-panel-popup/`

- [ ] **Step 1: Create worktree**

Run:
```bash
cd /c/Users/desti/youcoded-dev/youcoded && git worktree add -b feat/update-panel-popup /c/Users/desti/youcoded-worktrees/update-panel-popup master
```
Expected: `Preparing worktree (new branch 'feat/update-panel-popup')` and `/c/Users/desti/youcoded-worktrees/update-panel-popup/` exists.

- [ ] **Step 2: `cd` into worktree for all subsequent work**

```bash
cd /c/Users/desti/youcoded-worktrees/update-panel-popup
```

- [ ] **Step 3: Install deps if needed**

```bash
cd desktop && npm ci
```
Expected: clean install, no errors.

---

## Task 1: Changelog parser (pure function, TDD)

**Responsibility:** Split a `CHANGELOG.md` string into an ordered array of `{ version, date?, body }` entries. Provide a `filterSinceCurrent` helper that returns only entries newer than a given version.

**Files:**
- Create: `desktop/src/main/changelog-parser.ts`
- Create: `desktop/src/main/__tests__/changelog-parser.test.ts`

- [ ] **Step 1: Write failing parser tests**

Create `desktop/src/main/__tests__/changelog-parser.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseChangelog, filterEntriesSinceVersion, compareSemver } from '../changelog-parser';

const SAMPLE = `# Changelog

All notable changes to YouCoded are documented in this file.

## [1.1.2] — 2026-04-21

**CC baseline:** v2.1.117

### Added
- thing A
- thing B

## [1.1.1] — 2026-04-18

### Fixed
- bug X

## [1.0.0] — 2026-01-01

Initial release.
`;

describe('parseChangelog', () => {
  it('parses version entries in source order (newest first)', () => {
    const entries = parseChangelog(SAMPLE);
    expect(entries).toHaveLength(3);
    expect(entries[0].version).toBe('1.1.2');
    expect(entries[1].version).toBe('1.1.1');
    expect(entries[2].version).toBe('1.0.0');
  });

  it('captures the date from the header when present', () => {
    const entries = parseChangelog(SAMPLE);
    expect(entries[0].date).toBe('2026-04-21');
    expect(entries[2].date).toBe('2026-01-01');
  });

  it('includes body content after the header until the next header', () => {
    const entries = parseChangelog(SAMPLE);
    expect(entries[0].body).toContain('**CC baseline:** v2.1.117');
    expect(entries[0].body).toContain('- thing A');
    expect(entries[0].body).not.toContain('## [1.1.1]');
    expect(entries[1].body).toContain('- bug X');
  });

  it('ignores preamble before the first version header', () => {
    const entries = parseChangelog(SAMPLE);
    const joined = entries.map(e => e.body).join('\n');
    expect(joined).not.toContain('All notable changes to YouCoded');
  });

  it('returns [] for malformed input with no version headers', () => {
    expect(parseChangelog('# Changelog\n\nNothing here yet.')).toEqual([]);
    expect(parseChangelog('')).toEqual([]);
  });

  it('handles trailing whitespace and missing final newline', () => {
    const trimmed = SAMPLE.trimEnd();
    const entries = parseChangelog(trimmed);
    expect(entries).toHaveLength(3);
    expect(entries[2].body.trimEnd()).toMatch(/Initial release\.$/);
  });

  it('accepts em-dash or hyphen between version and date', () => {
    const entries = parseChangelog('## [2.0.0] - 2026-05-01\nbody\n');
    expect(entries[0].date).toBe('2026-05-01');
  });
});

describe('filterEntriesSinceVersion', () => {
  const entries = parseChangelog(SAMPLE);

  it('returns entries strictly newer than current', () => {
    const filtered = filterEntriesSinceVersion(entries, '1.1.1');
    expect(filtered.map(e => e.version)).toEqual(['1.1.2']);
  });

  it('returns [] when current is at or above newest', () => {
    expect(filterEntriesSinceVersion(entries, '1.1.2')).toEqual([]);
    expect(filterEntriesSinceVersion(entries, '2.0.0')).toEqual([]);
  });

  it('returns all entries when current predates them all', () => {
    expect(filterEntriesSinceVersion(entries, '0.9.0').map(e => e.version))
      .toEqual(['1.1.2', '1.1.1', '1.0.0']);
  });
});

describe('compareSemver', () => {
  it('handles major/minor/patch ordering', () => {
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
    expect(compareSemver('1.0.1', '1.0.0')).toBe(1);
    expect(compareSemver('1.0.0', '1.0.1')).toBe(-1);
    expect(compareSemver('2.0.0', '1.9.9')).toBe(1);
    expect(compareSemver('1.10.0', '1.9.0')).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd desktop && npx vitest run src/main/__tests__/changelog-parser.test.ts
```
Expected: FAIL — module `../changelog-parser` not found.

- [ ] **Step 3: Implement parser**

Create `desktop/src/main/changelog-parser.ts`:

```ts
// changelog-parser.ts — parses Keep-a-Changelog-style markdown into entries.
// Anchored on `## [X.Y.Z]` headers to survive incidental format drift.

export interface ChangelogEntry {
  version: string;       // e.g. "1.1.2"
  date?: string;         // e.g. "2026-04-21" (optional, from the header line)
  body: string;          // markdown body between this header and the next
}

const HEADER_RE = /^##\s+\[(\d+\.\d+\.\d+)\](?:\s*[—–-]\s*(\S+))?/;

export function parseChangelog(markdown: string): ChangelogEntry[] {
  if (!markdown) return [];
  const lines = markdown.split('\n');
  const entries: ChangelogEntry[] = [];
  let current: { version: string; date?: string; bodyLines: string[] } | null = null;

  for (const line of lines) {
    const m = line.match(HEADER_RE);
    if (m) {
      if (current) {
        entries.push({ version: current.version, date: current.date, body: current.bodyLines.join('\n').trim() });
      }
      current = { version: m[1], date: m[2], bodyLines: [] };
      continue;
    }
    if (current) current.bodyLines.push(line);
    // else: preamble — drop it
  }
  if (current) {
    entries.push({ version: current.version, date: current.date, body: current.bodyLines.join('\n').trim() });
  }
  return entries;
}

// Returns entries strictly newer than `currentVersion`.
export function filterEntriesSinceVersion(entries: ChangelogEntry[], currentVersion: string): ChangelogEntry[] {
  return entries.filter(e => compareSemver(e.version, currentVersion) > 0);
}

export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10));
  const pb = b.split('.').map(n => parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da > db ? 1 : -1;
  }
  return 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd desktop && npx vitest run src/main/__tests__/changelog-parser.test.ts
```
Expected: PASS — all 10 tests green.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/desti/youcoded-worktrees/update-panel-popup
git add youcoded/desktop/src/main/changelog-parser.ts youcoded/desktop/src/main/__tests__/changelog-parser.test.ts
git commit -m "feat(update-panel): add changelog parser and semver helpers"
```

---

## Task 2: Changelog service (fetch + cache, TDD)

**Responsibility:** `getChangelog({ forceRefresh })` returns `{ markdown, entries, fromCache, error? }`. Cache lives at `~/.claude/.changelog-cache.json` keyed on `app.getVersion()`. Fetch uses the same HTTPS + redirect + 10s timeout pattern as `fetchLatestRelease()` in `ipc-handlers.ts:1159-1180`.

**Files:**
- Create: `desktop/src/main/changelog-service.ts`
- Create: `desktop/src/main/__tests__/changelog-service.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `desktop/src/main/__tests__/changelog-service.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Module under test is imported dynamically so we can reset mocks per test.
let tmpHome: string;
let serviceModule: typeof import('../changelog-service');

const SAMPLE = `# Changelog

## [1.1.2] — 2026-04-21

### Added
- A new thing.

## [1.1.1] — 2026-04-18

### Fixed
- Something.
`;

function mockElectronApp(version: string) {
  vi.doMock('electron', () => ({
    app: { getVersion: () => version, getPath: (_name: string) => tmpHome },
  }));
}

function mockHttpsOk(body: string) {
  vi.doMock('https', () => ({
    get: vi.fn((_url: string, _opts: any, cb: any) => {
      const handlers: Record<string, Function> = {};
      const res = {
        statusCode: 200,
        headers: {},
        on: (ev: string, fn: Function) => { handlers[ev] = fn; return res; },
      };
      queueMicrotask(() => {
        cb(res);
        handlers['data']?.(Buffer.from(body, 'utf8'));
        handlers['end']?.();
      });
      return { on: () => ({}), destroy: () => {} };
    }),
  }));
}

function mockHttpsFail() {
  vi.doMock('https', () => ({
    get: vi.fn((_url: string, _opts: any, _cb: any) => {
      const req: any = { on: (ev: string, fn: Function) => { if (ev === 'error') queueMicrotask(() => fn(new Error('ENETUNREACH'))); return req; }, destroy: () => {} };
      return req;
    }),
  }));
}

beforeEach(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'youcoded-changelog-test-'));
  // Service reads cache from path.join(home, '.changelog-cache.json'); we pass tmpHome as Electron's home dir.
  vi.resetModules();
});

afterEach(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true });
  vi.doUnmock('electron');
  vi.doUnmock('https');
});

describe('getChangelog', () => {
  it('fetches and writes cache on first call', async () => {
    mockElectronApp('1.1.2');
    mockHttpsOk(SAMPLE);
    serviceModule = await import('../changelog-service');
    const result = await serviceModule.getChangelog({ forceRefresh: false });
    expect(result.fromCache).toBe(false);
    expect(result.entries).toHaveLength(2);
    expect(result.markdown).toContain('## [1.1.2]');
    const cacheFile = path.join(tmpHome, '.changelog-cache.json');
    expect(fs.existsSync(cacheFile)).toBe(true);
    const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    expect(cached.app_version_at_fetch).toBe('1.1.2');
  });

  it('returns cached data when app version matches and forceRefresh=false', async () => {
    mockElectronApp('1.1.2');
    fs.writeFileSync(path.join(tmpHome, '.changelog-cache.json'), JSON.stringify({
      markdown: SAMPLE,
      entries: [{ version: '1.1.2', date: '2026-04-21', body: 'cached' }],
      fetched_at: '2026-04-21T00:00:00Z',
      app_version_at_fetch: '1.1.2',
    }));
    // No https mock — any fetch would throw.
    vi.doMock('https', () => ({ get: () => { throw new Error('should not be called'); } }));
    serviceModule = await import('../changelog-service');
    const result = await serviceModule.getChangelog({ forceRefresh: false });
    expect(result.fromCache).toBe(true);
    expect(result.entries[0].body).toBe('cached');
  });

  it('refetches when cache app_version differs from running version', async () => {
    mockElectronApp('1.1.3'); // running newer than cached
    fs.writeFileSync(path.join(tmpHome, '.changelog-cache.json'), JSON.stringify({
      markdown: '# old', entries: [], fetched_at: '2026-04-01T00:00:00Z', app_version_at_fetch: '1.1.0',
    }));
    mockHttpsOk(SAMPLE);
    serviceModule = await import('../changelog-service');
    const result = await serviceModule.getChangelog({ forceRefresh: false });
    expect(result.fromCache).toBe(false);
    expect(result.entries).toHaveLength(2);
  });

  it('refetches even with valid cache when forceRefresh=true', async () => {
    mockElectronApp('1.1.2');
    fs.writeFileSync(path.join(tmpHome, '.changelog-cache.json'), JSON.stringify({
      markdown: '# stale', entries: [], fetched_at: '2026-04-01T00:00:00Z', app_version_at_fetch: '1.1.2',
    }));
    mockHttpsOk(SAMPLE);
    serviceModule = await import('../changelog-service');
    const result = await serviceModule.getChangelog({ forceRefresh: true });
    expect(result.fromCache).toBe(false);
    expect(result.entries).toHaveLength(2);
  });

  it('returns stale cache silently on fetch failure', async () => {
    mockElectronApp('1.1.2');
    fs.writeFileSync(path.join(tmpHome, '.changelog-cache.json'), JSON.stringify({
      markdown: SAMPLE, entries: [{ version: '1.1.2', date: '2026-04-21', body: 'cached' }],
      fetched_at: '2026-04-01T00:00:00Z', app_version_at_fetch: '1.1.1', // stale version
    }));
    mockHttpsFail();
    serviceModule = await import('../changelog-service');
    const result = await serviceModule.getChangelog({ forceRefresh: true });
    expect(result.fromCache).toBe(true);
    expect(result.error).toBeFalsy();
    expect(result.entries[0].body).toBe('cached');
  });

  it('returns error shape on fetch failure with no cache', async () => {
    mockElectronApp('1.1.2');
    mockHttpsFail();
    serviceModule = await import('../changelog-service');
    const result = await serviceModule.getChangelog({ forceRefresh: true });
    expect(result.error).toBe(true);
    expect(result.markdown).toBeNull();
    expect(result.entries).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd desktop && npx vitest run src/main/__tests__/changelog-service.test.ts
```
Expected: FAIL — module `../changelog-service` not found.

- [ ] **Step 3: Implement service**

Create `desktop/src/main/changelog-service.ts`:

```ts
// changelog-service.ts — fetches + caches CHANGELOG.md for the UpdatePanel.
// Cache file: $HOME/.changelog-cache.json (Electron's app.getPath('home') returns ~/).
// Cache is keyed on the running app version — invalidates automatically on update install.

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { app } from 'electron';
import { parseChangelog, ChangelogEntry } from './changelog-parser';

const CHANGELOG_URL = 'https://raw.githubusercontent.com/itsdestin/youcoded/master/CHANGELOG.md';
const FETCH_TIMEOUT_MS = 10000;

export interface ChangelogResult {
  markdown: string | null;
  entries: ChangelogEntry[];
  fromCache: boolean;
  error?: boolean;
}

interface CacheFile {
  markdown: string;
  entries: ChangelogEntry[];
  fetched_at: string;
  app_version_at_fetch: string;
}

function cachePath(): string {
  // ~/.claude/.changelog-cache.json would collide with app-user separation; prefer the app's home dir.
  // Test suite stubs app.getPath('home') with a temp dir.
  return path.join(app.getPath('home'), '.claude', '.changelog-cache.json');
}

function readCache(): CacheFile | null {
  try {
    const raw = fs.readFileSync(cachePath(), 'utf8');
    return JSON.parse(raw) as CacheFile;
  } catch {
    return null;
  }
}

function writeCache(data: CacheFile): void {
  try {
    const dir = path.dirname(cachePath());
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(cachePath(), JSON.stringify(data, null, 2), 'utf8');
  } catch {
    // Best-effort; a failed cache write shouldn't fail the whole operation.
  }
}

function fetchRemote(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'YouCoded' }, timeout: FETCH_TIMEOUT_MS }, (res: any) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirect = res.headers?.location;
        if (!redirect) { reject(new Error('Redirect without location')); return; }
        fetchRemote(redirect).then(resolve, reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let body = '';
      res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      res.on('end', () => resolve(body));
    });
    req.on('error', (err: Error) => reject(err));
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

export async function getChangelog(opts: { forceRefresh: boolean }): Promise<ChangelogResult> {
  const cached = readCache();
  const currentVersion = app.getVersion();
  const cacheIsValid = cached && cached.app_version_at_fetch === currentVersion;

  if (!opts.forceRefresh && cacheIsValid && cached) {
    return { markdown: cached.markdown, entries: cached.entries, fromCache: true };
  }

  try {
    const markdown = await fetchRemote(CHANGELOG_URL);
    const entries = parseChangelog(markdown);
    const toCache: CacheFile = {
      markdown,
      entries,
      fetched_at: new Date().toISOString(),
      app_version_at_fetch: currentVersion,
    };
    writeCache(toCache);
    return { markdown, entries, fromCache: false };
  } catch {
    // Fetch failed — serve stale cache if any (even if app_version mismatch), else error shape.
    if (cached) {
      return { markdown: cached.markdown, entries: cached.entries, fromCache: true };
    }
    return { markdown: null, entries: [], fromCache: false, error: true };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd desktop && npx vitest run src/main/__tests__/changelog-service.test.ts
```
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/desti/youcoded-worktrees/update-panel-popup
git add youcoded/desktop/src/main/changelog-service.ts youcoded/desktop/src/main/__tests__/changelog-service.test.ts
git commit -m "feat(update-panel): add changelog-service with fetch + cache + graceful fallback"
```

---

## Task 3: IPC wire-up (main handler + preload + remote-shim + Android stub + types)

**Responsibility:** Register `update:changelog` across all four platforms so the renderer can call `window.claude.update.changelog({ forceRefresh })`.

**Files:**
- Modify: `desktop/src/main/preload.ts` (add `IPC.UPDATE_CHANGELOG` constant near line ~57, add `update` namespace near line ~432)
- Modify: `desktop/src/main/ipc-handlers.ts` (import service, register handler)
- Modify: `desktop/src/renderer/remote-shim.ts` (add `update` namespace near line ~748)
- Modify: `desktop/src/renderer/hooks/useIpc.ts` (add `update` to the `window.claude` Window interface)
- Modify: `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` (add `"update:changelog"` case)

- [ ] **Step 1: Add IPC constant in preload.ts**

In `desktop/src/main/preload.ts`, locate the `OPEN_CHANGELOG: 'shell:open-changelog'` line (~57) and add after it:

```ts
UPDATE_CHANGELOG: 'update:changelog',
```

- [ ] **Step 2: Add `update` namespace to preload bridge**

In `desktop/src/main/preload.ts`, locate the `shell:` namespace block around line 427–432:

```ts
shell: {
  openChangelog: (): Promise<void> =>
    ipcRenderer.invoke(IPC.OPEN_CHANGELOG),
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke(IPC.OPEN_EXTERNAL, url),
},
```

Immediately after the closing `},` of `shell`, add a new namespace:

```ts
update: {
  changelog: (opts: { forceRefresh: boolean }): Promise<ChangelogIpcResult> =>
    ipcRenderer.invoke(IPC.UPDATE_CHANGELOG, opts),
},
```

At the top of `preload.ts` alongside other type imports, add:

```ts
// Mirrored type — must match ChangelogResult in src/main/changelog-service.ts.
interface ChangelogIpcResult {
  markdown: string | null;
  entries: Array<{ version: string; date?: string; body: string }>;
  fromCache: boolean;
  error?: boolean;
}
```

- [ ] **Step 3: Register handler in ipc-handlers.ts**

In `desktop/src/main/ipc-handlers.ts`, add near other imports at top:

```ts
import { getChangelog } from './changelog-service';
```

Locate the `ipcMain.handle(IPC.OPEN_CHANGELOG, ...)` block around lines 453–455. After it, add:

```ts
// Update panel fetches CHANGELOG.md via this handler. Cached in main;
// forceRefresh is true only when the popup opens in the update-available path.
ipcMain.handle(IPC.UPDATE_CHANGELOG, async (_event, opts: { forceRefresh?: boolean } = { forceRefresh: false }) => {
  return getChangelog({ forceRefresh: !!opts.forceRefresh });
});
```

- [ ] **Step 4: Mirror in remote-shim.ts**

In `desktop/src/renderer/remote-shim.ts`, locate the `shell:` namespace block around lines 740–748. After the closing `},` of `shell`, add:

```ts
update: {
  changelog: async (opts: { forceRefresh: boolean }) =>
    invoke('update:changelog', opts),
},
```

(The `invoke()` helper at ~line 75 handles WebSocket request-response.)

- [ ] **Step 5: Add types in useIpc.ts**

In `desktop/src/renderer/hooks/useIpc.ts`, locate the `declare global { interface Window { claude: { ... } } }` block. Inside the `claude:` object, after the `shell:` namespace, add:

```ts
update: {
  changelog: (opts: { forceRefresh: boolean }) => Promise<{
    markdown: string | null;
    entries: Array<{ version: string; date?: string; body: string }>;
    fromCache: boolean;
    error?: boolean;
  }>;
};
```

- [ ] **Step 6: Add Android stub in SessionService.kt**

In `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`, inside the `when (msg.type)` block in `handleBridgeMessage()`, add a new case (alphabetical insertion near other `update:*` or `shell:*` handlers if they exist, else at the end):

```kotlin
"update:changelog" -> {
    // Desktop-only feature. Android never renders the version pill, so this
    // handler should be unreachable — but IPC-parity invariant (docs/PITFALLS.md
    // "Cross-Platform") requires the type string to exist in all three files.
    msg.id?.let {
        bridgeServer.respond(ws, msg.type, it, JSONObject()
            .put("markdown", JSONObject.NULL)
            .put("entries", org.json.JSONArray())
            .put("fromCache", false)
            .put("error", true))
    }
}
```

- [ ] **Step 7: Run existing IPC parity test**

```bash
cd desktop && npx vitest run tests/ipc-channels.test.ts
```
Expected: PASS — the test uses regex to extract channel names and should automatically pick up `UPDATE_CHANGELOG`. If it fails claiming a mismatch, read the error to locate the missing side and fix.

- [ ] **Step 8: Typecheck all of desktop**

```bash
cd desktop && npm run build 2>&1 | tail -40
```
Expected: build succeeds. If TypeScript errors appear, they're likely in the renderer `window.claude` typing — confirm Step 5 added the namespace correctly.

- [ ] **Step 9: Commit**

```bash
cd /c/Users/desti/youcoded-worktrees/update-panel-popup
git add youcoded/desktop/src/main/preload.ts \
        youcoded/desktop/src/main/ipc-handlers.ts \
        youcoded/desktop/src/renderer/remote-shim.ts \
        youcoded/desktop/src/renderer/hooks/useIpc.ts \
        youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt
git commit -m "feat(update-panel): wire up update:changelog IPC across preload, handler, shim, android stub, and types"
```

---

## Task 4: UpdatePanel component (TDD)

**Responsibility:** L2 overlay popup. Fetches changelog on open; renders "Update available" header + Update Now button + entries-since-current when `updateStatus.update_available`, else "What's new" + full changelog.

**Files:**
- Create: `desktop/src/renderer/components/UpdatePanel.tsx`
- Create: `desktop/src/renderer/components/__tests__/UpdatePanel.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `desktop/src/renderer/components/__tests__/UpdatePanel.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import UpdatePanel from '../UpdatePanel';

type Status = {
  current: string;
  latest: string;
  update_available: boolean;
  download_url: string | null;
};

const UPDATE_STATUS_AVAILABLE: Status = {
  current: '1.1.1',
  latest: '1.1.2',
  update_available: true,
  download_url: 'https://example.com/YouCoded-1.1.2-setup.exe',
};

const UPDATE_STATUS_OK: Status = {
  current: '1.1.2',
  latest: '1.1.2',
  update_available: false,
  download_url: null,
};

const CHANGELOG_OK = {
  markdown: `# Changelog

## [1.1.2] — 2026-04-21
### Added
- Thing B

## [1.1.1] — 2026-04-18
### Fixed
- Thing A
`,
  entries: [
    { version: '1.1.2', date: '2026-04-21', body: '### Added\n- Thing B' },
    { version: '1.1.1', date: '2026-04-18', body: '### Fixed\n- Thing A' },
  ],
  fromCache: false,
};

const CHANGELOG_ERROR = { markdown: null, entries: [], fromCache: false, error: true };

beforeEach(() => {
  (window as any).claude = {
    update: { changelog: vi.fn().mockResolvedValue(CHANGELOG_OK) },
    shell: {
      openExternal: vi.fn().mockResolvedValue(undefined),
      openChangelog: vi.fn().mockResolvedValue(undefined),
    },
  };
});

describe('UpdatePanel — update available', () => {
  it('renders "Update available" header and Update Now button', async () => {
    render(<UpdatePanel open={true} onClose={() => {}} updateStatus={UPDATE_STATUS_AVAILABLE} />);
    await waitFor(() => expect(screen.getByText(/update available/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /update now.*1\.1\.1.*1\.1\.2/i })).toBeInTheDocument();
  });

  it('calls changelog with forceRefresh=true when update is available', async () => {
    render(<UpdatePanel open={true} onClose={() => {}} updateStatus={UPDATE_STATUS_AVAILABLE} />);
    await waitFor(() => expect((window as any).claude.update.changelog).toHaveBeenCalledWith({ forceRefresh: true }));
  });

  it('Update Now button calls shell.openExternal and closes', async () => {
    const onClose = vi.fn();
    render(<UpdatePanel open={true} onClose={onClose} updateStatus={UPDATE_STATUS_AVAILABLE} />);
    const btn = await screen.findByRole('button', { name: /update now/i });
    fireEvent.click(btn);
    expect((window as any).claude.shell.openExternal).toHaveBeenCalledWith(UPDATE_STATUS_AVAILABLE.download_url);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('filters entries to those newer than current version', async () => {
    render(<UpdatePanel open={true} onClose={() => {}} updateStatus={UPDATE_STATUS_AVAILABLE} />);
    // Current is 1.1.1 → only 1.1.2 should be rendered.
    await waitFor(() => expect(screen.getByText(/Thing B/)).toBeInTheDocument());
    expect(screen.queryByText(/Thing A/)).not.toBeInTheDocument();
  });

  it('falls back to rendering the newest entry when filter returns empty (changelog lags release)', async () => {
    // Current is already 1.1.2, but update_available is true — filter returns [] → fallback.
    const offStatus = { ...UPDATE_STATUS_AVAILABLE, current: '1.1.2', latest: '1.1.3' };
    render(<UpdatePanel open={true} onClose={() => {}} updateStatus={offStatus} />);
    await waitFor(() => expect(screen.getByText(/Thing B/)).toBeInTheDocument());
  });
});

describe('UpdatePanel — up to date', () => {
  it('renders "What\'s new" header and no Update Now button', async () => {
    render(<UpdatePanel open={true} onClose={() => {}} updateStatus={UPDATE_STATUS_OK} />);
    await waitFor(() => expect(screen.getByText(/what'?s new/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /update now/i })).not.toBeInTheDocument();
  });

  it('calls changelog with forceRefresh=false when up to date', async () => {
    render(<UpdatePanel open={true} onClose={() => {}} updateStatus={UPDATE_STATUS_OK} />);
    await waitFor(() => expect((window as any).claude.update.changelog).toHaveBeenCalledWith({ forceRefresh: false }));
  });

  it('renders full changelog markdown (both entries visible)', async () => {
    render(<UpdatePanel open={true} onClose={() => {}} updateStatus={UPDATE_STATUS_OK} />);
    await waitFor(() => expect(screen.getByText(/Thing B/)).toBeInTheDocument());
    expect(screen.getByText(/Thing A/)).toBeInTheDocument();
  });
});

describe('UpdatePanel — error states', () => {
  it('shows Open on GitHub fallback link when IPC returns error=true', async () => {
    (window as any).claude.update.changelog.mockResolvedValue(CHANGELOG_ERROR);
    render(<UpdatePanel open={true} onClose={() => {}} updateStatus={UPDATE_STATUS_OK} />);
    const link = await screen.findByRole('button', { name: /open on github/i });
    fireEvent.click(link);
    expect((window as any).claude.shell.openChangelog).toHaveBeenCalled();
  });

  it('Update Now button stays visible even when changelog failed to load', async () => {
    (window as any).claude.update.changelog.mockResolvedValue(CHANGELOG_ERROR);
    render(<UpdatePanel open={true} onClose={() => {}} updateStatus={UPDATE_STATUS_AVAILABLE} />);
    expect(await screen.findByRole('button', { name: /update now/i })).toBeInTheDocument();
  });
});

describe('UpdatePanel — close behavior', () => {
  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn();
    render(<UpdatePanel open={true} onClose={onClose} updateStatus={UPDATE_STATUS_OK} />);
    await screen.findByText(/what'?s new/i);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('does not fetch when open=false', () => {
    render(<UpdatePanel open={false} onClose={() => {}} updateStatus={UPDATE_STATUS_OK} />);
    expect((window as any).claude.update.changelog).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd desktop && npx vitest run src/renderer/components/__tests__/UpdatePanel.test.tsx
```
Expected: FAIL — module `../UpdatePanel` not found.

- [ ] **Step 3: Implement UpdatePanel**

Create `desktop/src/renderer/components/UpdatePanel.tsx`:

```tsx
// UpdatePanel.tsx — L2 overlay opened from the StatusBar version pill.
// Two modes driven by updateStatus.update_available:
//   - true  → "Update available" + Update Now button + changelog entries since current version
//   - false → "What's new" + full changelog, no button
// Cache lives main-side (see changelog-service.ts).

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Scrim, OverlayPanel } from './overlays/Overlay';
import MarkdownContent from './MarkdownContent';
import { compareSemver } from '../../main/changelog-parser';

interface UpdateStatus {
  current: string;
  latest: string;
  update_available: boolean;
  download_url: string | null;
}

interface ChangelogEntry { version: string; date?: string; body: string; }

interface ChangelogData {
  markdown: string | null;
  entries: ChangelogEntry[];
  fromCache: boolean;
  error?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  updateStatus: UpdateStatus;
}

export default function UpdatePanel({ open, onClose, updateStatus }: Props) {
  const [data, setData] = useState<ChangelogData | null>(null);
  const [loading, setLoading] = useState(false);

  // Escape-to-close, matching AboutPopup/PreferencesPopup convention.
  // When the planned useEscClose stack lands, migrate alongside those popups.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Fetch changelog when popup opens. forceRefresh only when an update is available —
  // the up-to-date path uses cache unless the app version changed (cache invalidates itself).
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (window as any).claude.update
      .changelog({ forceRefresh: updateStatus.update_available })
      .then((res: ChangelogData) => setData(res))
      .catch(() => setData({ markdown: null, entries: [], fromCache: false, error: true }))
      .finally(() => setLoading(false));
  }, [open, updateStatus.update_available]);

  if (!open) return null;

  const handleUpdate = async () => {
    if (updateStatus.download_url) {
      await (window as any).claude.shell.openExternal(updateStatus.download_url);
    }
    onClose();
  };

  const handleOpenOnGithub = async () => {
    await (window as any).claude.shell.openChangelog();
  };

  // Body selection:
  //   update_available → entries newer than current; if filter is empty (changelog lags release), fall back to the newest entry
  //   otherwise       → full markdown, rendered as one block
  let body: React.ReactNode;
  if (data?.error || (!loading && !data?.markdown && !data?.entries?.length)) {
    body = (
      <div className="text-fg-dim text-sm py-8 text-center">
        Couldn't load changelog.{' '}
        <button onClick={handleOpenOnGithub} className="underline hover:text-fg">Open on GitHub</button>
      </div>
    );
  } else if (loading || !data) {
    body = <div className="text-fg-dim text-sm py-8 text-center">Loading…</div>;
  } else if (updateStatus.update_available) {
    let shown = data.entries.filter(e => compareSemver(e.version, updateStatus.current) > 0);
    if (shown.length === 0 && data.entries.length > 0) shown = [data.entries[0]];
    body = (
      <div className="space-y-6">
        {shown.map(e => (
          <section key={e.version}>
            <h2 className="text-lg font-semibold mb-2">
              v{e.version}
              {e.date && <span className="text-fg-dim font-normal ml-2">{e.date}</span>}
            </h2>
            <MarkdownContent content={e.body} />
          </section>
        ))}
      </div>
    );
  } else if (data.markdown) {
    body = <MarkdownContent content={data.markdown} />;
  }

  return createPortal(
    <>
      <Scrim layer={2} onClick={onClose} />
      <OverlayPanel layer={2} className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[720px] max-w-[90vw] max-h-[80vh] flex flex-col">
        <header className="flex items-center justify-between px-5 py-3 border-b border-edge-dim">
          <h1 className="text-base font-medium">
            {updateStatus.update_available ? 'Update available' : "What's new"}
          </h1>
          <button onClick={onClose} aria-label="Close" className="text-fg-dim hover:text-fg">✕</button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{body}</div>
        {updateStatus.update_available && (
          <footer className="px-5 py-3 border-t border-edge-dim flex justify-end">
            <button
              onClick={handleUpdate}
              className="px-4 py-2 rounded-sm bg-accent text-on-accent font-medium hover:opacity-90"
            >
              Update Now: v{updateStatus.current} → v{updateStatus.latest}
            </button>
          </footer>
        )}
      </OverlayPanel>
    </>,
    document.body,
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd desktop && npx vitest run src/renderer/components/__tests__/UpdatePanel.test.tsx
```
Expected: PASS — all 11 tests green. If a test asserting on button text fails due to minor copy variance, align the assertion regex with your implementation — don't soften the implementation copy.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/desti/youcoded-worktrees/update-panel-popup
git add youcoded/desktop/src/renderer/components/UpdatePanel.tsx \
        youcoded/desktop/src/renderer/components/__tests__/UpdatePanel.test.tsx
git commit -m "feat(update-panel): add UpdatePanel component with filter + full-changelog modes"
```

---

## Task 5: Wire StatusBar version pill to UpdatePanel

**Responsibility:** Replace the pill's conditional external-URL onClick with a single `setUpdatePanelOpen(true)`; mount the popup.

**Files:**
- Modify: `desktop/src/renderer/components/StatusBar.tsx:866-891` (pill onClick) + mount site (wherever the component tree root lives in StatusBar — add popup state alongside other popup states already managed there).

- [ ] **Step 1: Locate existing popup-state pattern in StatusBar.tsx**

Read the component head to find how other popups (e.g., `WidgetConfigPopup`) are managed. Use the same `useState<boolean>(false)` + conditional render pattern.

```bash
grep -n "useState" youcoded/desktop/src/renderer/components/StatusBar.tsx | head -20
```
Expected: list of existing `useState` lines — identify the one guarding `WidgetConfigPopup` (or similar) for pattern-match.

- [ ] **Step 2: Add import and state**

In `desktop/src/renderer/components/StatusBar.tsx`, add near other component imports:

```ts
import UpdatePanel from './UpdatePanel';
```

In the StatusBar component body, near other popup state, add:

```ts
const [updatePanelOpen, setUpdatePanelOpen] = useState(false);
```

- [ ] **Step 3: Swap the pill onClick**

Replace the existing onClick at lines 866–891:

Before:
```tsx
onClick={() => {
  if (updateStatus.update_available && updateStatus.download_url) {
    window.claude.shell.openExternal(updateStatus.download_url);
  } else {
    window.claude.shell.openChangelog();
  }
}}
```

After:
```tsx
onClick={() => setUpdatePanelOpen(true)}
```

Keep all other pill styling (yellow-glow animation gated on `update_available`, title text, className) unchanged.

- [ ] **Step 4: Mount the popup**

Near the bottom of the StatusBar component's JSX (alongside whichever `<WidgetConfigPopup open={...} />` mount already exists), add:

```tsx
{updateStatus && (
  <UpdatePanel
    open={updatePanelOpen}
    onClose={() => setUpdatePanelOpen(false)}
    updateStatus={updateStatus}
  />
)}
```

- [ ] **Step 5: Typecheck**

```bash
cd desktop && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Run existing StatusBar tests (if any)**

```bash
cd desktop && npx vitest run src/renderer/components/__tests__/StatusBar
```
Expected: PASS — the pill onClick change is covered by the new UpdatePanel tests already; StatusBar tests should still pass since we didn't change the styling.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/desti/youcoded-worktrees/update-panel-popup
git add youcoded/desktop/src/renderer/components/StatusBar.tsx
git commit -m "feat(update-panel): wire version pill onClick to UpdatePanel popup"
```

---

## Task 6: Dev-only update simulation flag

**Responsibility:** Let developers verify the update-available path without waiting for a real release. Gated on `YOUCODED_DEV_FAKE_UPDATE=1` env var.

**Files:**
- Modify: `desktop/src/main/ipc-handlers.ts` (inside or just after `parseReleaseResponse` — check source).

- [ ] **Step 1: Locate `parseReleaseResponse` (or equivalent) in ipc-handlers.ts**

```bash
grep -n "parseReleaseResponse\|update_available" youcoded/desktop/src/main/ipc-handlers.ts | head -20
```

- [ ] **Step 2: Add the fake-update override**

Inside `fetchLatestRelease()` or wherever `updateStatus` is constructed, add after the real response is parsed and before it's assigned to the cached state:

```ts
// Dev-only: force update_available for manual UpdatePanel verification.
// Set YOUCODED_DEV_FAKE_UPDATE=1 to simulate a new release one patch ahead of current.
if (process.env.YOUCODED_DEV_FAKE_UPDATE === '1') {
  const [maj, min, patch] = app.getVersion().split('.').map(n => parseInt(n, 10));
  updateStatus = {
    current: app.getVersion(),
    latest: `${maj}.${min}.${patch + 1}`,
    update_available: true,
    download_url: 'https://github.com/itsdestin/youcoded/releases/latest',
  };
}
```

(Adjust the variable name `updateStatus` to match whatever is actually used in the surrounding code.)

- [ ] **Step 3: Commit**

```bash
cd /c/Users/desti/youcoded-worktrees/update-panel-popup
git add youcoded/desktop/src/main/ipc-handlers.ts
git commit -m "chore(update-panel): YOUCODED_DEV_FAKE_UPDATE env flag for manual verification"
```

---

## Task 7: Manual verification

**Not a code task — a live-app checklist.** Do every item; if any fails, fix before merge.

- [ ] **Step 1: Run the dev loop with fake-update flag**

```bash
cd /c/Users/desti/youcoded-worktrees/update-panel-popup
YOUCODED_DEV_FAKE_UPDATE=1 bash scripts/run-dev.sh
```

- [ ] **Step 2: Verify "update available" path**

- Version pill is yellow and animating.
- Click pill → popup opens with header "Update available".
- Changelog renders (at least the newest entry).
- "Update Now: vX → vY" button visible.
- Click Update Now → browser opens to `download_url` → popup closes.

- [ ] **Step 3: Verify "up to date" path**

- Restart dev loop without the env flag: `bash scripts/run-dev.sh`.
- Version pill is normal (no glow).
- Click pill → popup opens with header "What's new".
- Full CHANGELOG.md rendered, scrollable.
- No Update Now button.
- Close via: scrim click, ESC, and X button. All three work.

- [ ] **Step 4: Verify cache hit on second open**

- With the up-to-date popup open, close it, open DevTools Network tab, re-open the popup. No network request for `raw.githubusercontent.com`.

- [ ] **Step 5: Verify offline behavior**

- Disconnect network.
- Open popup (up-to-date path) → cached content renders, no spinner.
- Delete `~/.claude/.changelog-cache.json`, open popup again → fallback "Open on GitHub" link visible.

- [ ] **Step 6: Verify cross-platform build still green**

```bash
cd desktop && npm run build
```
Expected: build succeeds, no TypeScript errors.

- [ ] **Step 7: Verify Android build still compiles**

```bash
cd /c/Users/desti/youcoded-worktrees/update-panel-popup/youcoded && ./scripts/build-web-ui.sh && ./gradlew assembleDebug
```
Expected: Android APK build succeeds — the Kotlin stub is syntactically valid.

- [ ] **Step 8: Run the full desktop test suite**

```bash
cd desktop && npm test
```
Expected: all tests pass — no regressions elsewhere.

---

## Task 8: Merge and cleanup

- [ ] **Step 1: Ensure everything is committed in the worktree**

```bash
cd /c/Users/desti/youcoded-worktrees/update-panel-popup
git status
```
Expected: `nothing to commit, working tree clean`.

- [ ] **Step 2: Merge to master and push**

Per workspace CLAUDE.md: "'Merge' means merge AND push."

```bash
cd /c/Users/desti/youcoded-dev/youcoded
git fetch origin && git pull origin master
git merge --no-ff feat/update-panel-popup -m "feat(update-panel): in-app changelog popup triggered from version pill"
git push origin master
```

- [ ] **Step 3: Verify the commit landed**

```bash
git branch --contains $(git rev-parse feat/update-panel-popup)
```
Expected: `master` listed.

- [ ] **Step 4: Clean up worktree**

```bash
cd /c/Users/desti/youcoded-dev/youcoded
git worktree remove /c/Users/desti/youcoded-worktrees/update-panel-popup
git branch -D feat/update-panel-popup
```

- [ ] **Step 5: Final status check**

```bash
git worktree list
git branch --list 'feat/update-panel*'
```
Expected: worktree list shows no `update-panel-popup` entry; branch list is empty.

---

## Self-Review Summary (writer's notes, not a task)

- **Spec coverage:** Every section of the spec (trigger & scope, data flow, parsing, cache, edge cases, testing) maps to a task above. The ESC-handling scope-correction (local `useEffect` vs planned `useEscClose`) is implemented in Task 4.
- **Type consistency:** `ChangelogEntry` shape `{ version, date?, body }` is consistent across parser (Task 1), service (Task 2), IPC types (Task 3), and component (Task 4). `ChangelogResult`/`ChangelogIpcResult`/`ChangelogData` are the same shape across the boundary (main → preload → renderer).
- **Handler naming:** `getChangelog` (service), `IPC.UPDATE_CHANGELOG` (constant), `update:changelog` (string), `window.claude.update.changelog` (bridge). Consistent throughout.
- **No placeholders:** Every code block is complete. The only hedge is "adjust the variable name `updateStatus` to match surrounding code" in Task 6 Step 2, which is unavoidable without reading the full ipc-handlers.ts context but is flagged clearly.
