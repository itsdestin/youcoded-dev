---
status: shipped
---

# Cross-Device Sync Phase 1a — Desktop Sync Foundation Implementation Plan

> **✅ SHIPPED — youcoded#107 (2026-07-08).** Desktop sync foundation live on master. Live status: `docs/superpowers/2026-07-10-sync-completion-handoff.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the desktop sync foundation from `docs/superpowers/specs/2026-07-03-cross-device-sync-design.md` §17 Phase 1: managed `~/YouCoded/` roots, the `SyncTransport` interface + git transport (hidden repos → private GitHub), the watcher-driven sync engine with convergent conflict handling, session-picker integration, and the dated daily backup job for spaces.

**Architecture:** New `desktop/src/main/sync-spaces/` module tree, entirely separate from the legacy `sync-service.ts` (which keeps running untouched — see Scope notes). Each project folder and the Personal folder is a "space" backed by a hidden git repo (`GIT_DIR` env pointing at `<root>/.youcoded/sync.git` — never a `.git` file in the worktree), pushed to auto-created private GitHub repos. A chokidar watcher debounce-commits; a poll timer pulls (SyncHub signals arrive in Plan 1b). Conflicts resolve convergently: remote wins the canonical filename, local content is preserved as a visible conflict copy.

**Tech Stack:** TypeScript (Electron main), chokidar ^4 (already a dep), system `git` + `gh` via `child_process.execFile` (existing pattern), vitest.

---

## Scope notes (deviations from spec §17, decided at planning)

1. **SyncHub is NOT in this plan.** (Updated 2026-07-08:) accounts Phase 1 landed (`wecoded-marketplace@8d18246`) — SyncHub's identity dependency is satisfied; per amended spec §6, devices will authenticate with the platform session token. SyncHub stays out of 1a because the platform Worker still has no Durable Object / WebSocket infrastructure (that arrives with accounts Phase 2's PresenceRoom or with SyncGroupRoom itself — coordinate before starting Plan 1b). The engine ships with the spec §6 degradation path — poll the transport every 2 minutes — as its initial signal mechanism; Plan 1b adds SyncHub and drops the poll to a fallback. Nothing in 1a touches the Worker, `marketplace-auth-store.ts`, or the `marketplace:auth:*` IPC surface, and the `gh`-CLI paths 1a reuses (`sync-setup-handlers.ts` repo creation, ~line 293-320) were verified untouched by the accounts merges (checked 2026-07-08 at youcoded `4eaeb621`).
2. **GitHub-backup migration and legacy-system deletions (spec §12) are re-staged to Phase 2.** Reason: conversations don't move into a sync space until Phase 2. Flipping the legacy backup to daily-only now would regress conversation backup freshness from 15 minutes to 24 hours with no sync layer covering them yet. In 1a the legacy sync-service runs completely untouched; the new daily dated backup covers only the new spaces, alongside it.
3. **Personal space in 1a = `~/YouCoded/Personal/**` only.** Skills/memory/settings join the personal space in Phase 2 together with conversations (they're currently covered by the legacy backup, so nothing is unprotected meanwhile). Encyclopedia migration is Phase 2 for the same reason.
4. **Line endings:** stored byte-faithful (`core.autocrlf=false`) plus `* text=auto` merge normalization via `$GIT_DIR/info/attributes` — git supports repo-local attributes there without writing any file into the user's tree.

## Worktree setup (before Task 1)

All code changes go to the **youcoded** sub-repo on a new branch in a worktree:

```bash
cd /c/Users/desti/youcoded-dev/youcoded
git fetch origin && git worktree add ../youcoded.wt/sync-spaces -b feat/sync-spaces origin/master
cd ../youcoded.wt/sync-spaces/desktop && npm ci
```

All paths below are relative to `youcoded.wt/sync-spaces/`. Run tests from `desktop/` with `npx vitest run tests/<file>`.

## File structure

| File | Responsibility |
|---|---|
| `desktop/src/main/sync-spaces/types.ts` | `SyncSpace`, `SyncTransport` interface, result types, engine event types |
| `desktop/src/main/sync-spaces/guards.ts` | Pure: name validation, default ignores, size cap, conflict-copy naming |
| `desktop/src/main/sync-spaces/managed-roots.ts` | `~/YouCoded/{Projects,Personal}` creation, project listing/creation |
| `desktop/src/main/sync-spaces/git-transport.ts` | `SyncTransport` impl: hidden git repo, commit/push/pull/merge/history |
| `desktop/src/main/sync-spaces/engine.ts` | Watcher + debounce + poll loop + single-flight sync + events |
| `desktop/src/main/sync-spaces/space-manager.ts` | Space enumeration, GitHub remote provisioning, enable/disable state |
| `desktop/src/main/sync-spaces/daily-backup.ts` | Once-daily dated copy of all spaces to Drive/iCloud + prune |
| `desktop/tests/sync-transport-contract.ts` | Reusable transport contract suite (any `SyncTransport` must pass) |
| `desktop/tests/sync-spaces-*.test.ts` | Per-module tests (paths given per task) |

Modify: `desktop/src/shared/types.ts` (IPC consts), `desktop/src/main/preload.ts`, `desktop/src/renderer/remote-shim.ts`, `desktop/src/main/remote-server.ts`, `desktop/src/main/ipc-handlers.ts` (folders merge + new handlers), `desktop/src/main/main.ts` (bootstrap), `desktop/src/renderer/components/FolderSwitcher.tsx` (new-project affordance), `desktop/src/renderer/components/SyncPanel.tsx` (spaces section).

---

### Task 1: Guards module (pure helpers)

**Files:**
- Create: `desktop/src/main/sync-spaces/guards.ts`
- Test: `desktop/tests/sync-spaces-guards.test.ts`

- [x] **Step 1: Write the failing tests**

```ts
// desktop/tests/sync-spaces-guards.test.ts
import { describe, it, expect } from 'vitest';
import {
  validateSyncName, DEFAULT_IGNORES, MAX_SYNC_FILE_BYTES,
  conflictCopyName, findCaseCollisions,
} from '../src/main/sync-spaces/guards';

describe('validateSyncName', () => {
  it('accepts normal names', () => {
    expect(validateSyncName('budget-app')).toBeNull();
    expect(validateSyncName('My Notes 2026')).toBeNull();
  });
  it('rejects Windows reserved device names (any case, with extension)', () => {
    expect(validateSyncName('CON')).toMatch(/reserved/i);
    expect(validateSyncName('aux.txt')).toMatch(/reserved/i);
    expect(validateSyncName('com1')).toMatch(/reserved/i);
  });
  it('rejects characters invalid on Windows', () => {
    for (const bad of ['a<b', 'a>b', 'a:b', 'a"b', 'a|b', 'a?b', 'a*b']) {
      expect(validateSyncName(bad)).toMatch(/character/i);
    }
  });
  it('rejects empty, dot-only, and trailing dot/space names', () => {
    expect(validateSyncName('')).toBeTruthy();
    expect(validateSyncName('.')).toBeTruthy();
    expect(validateSyncName('name.')).toBeTruthy();
    expect(validateSyncName('name ')).toBeTruthy();
  });
});

describe('DEFAULT_IGNORES', () => {
  it('covers the spec §8 credential + junk set', () => {
    for (const p of ['node_modules/', '.youcoded/', '.git/', '.env', '*.pem', '.DS_Store']) {
      expect(DEFAULT_IGNORES).toContain(p);
    }
  });
});

describe('MAX_SYNC_FILE_BYTES', () => {
  it('is 50MB per spec §7', () => expect(MAX_SYNC_FILE_BYTES).toBe(50 * 1024 * 1024));
});

describe('conflictCopyName', () => {
  const d = new Date('2026-07-03T14:00:00Z');
  it('inserts device + date before the extension', () => {
    expect(conflictCopyName('docs/notes.md', 'Laptop', d))
      .toBe('docs/notes (from Laptop, 2026-07-03).md');
  });
  it('handles extensionless files', () => {
    expect(conflictCopyName('Makefile', 'Laptop', d))
      .toBe('Makefile (from Laptop, 2026-07-03)');
  });
});

describe('findCaseCollisions', () => {
  it('groups paths differing only by case', () => {
    expect(findCaseCollisions(['a/Readme.md', 'a/readme.md', 'b/x.ts']))
      .toEqual([['a/Readme.md', 'a/readme.md']]);
  });
  it('returns empty when no collisions', () => {
    expect(findCaseCollisions(['a.ts', 'b.ts'])).toEqual([]);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/sync-spaces-guards.test.ts`
Expected: FAIL — cannot resolve `../src/main/sync-spaces/guards`

- [x] **Step 3: Implement guards.ts**

```ts
// desktop/src/main/sync-spaces/guards.ts
// Pure helpers for the sync-spaces subsystem. NO fs/os imports — keeps this
// unit-testable without mocks (same rule as local-theme-synthesizer).

// Why: a name created on macOS/Linux must not break a Windows device later.
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const INVALID_CHARS = /[<>:"|?*\x00-\x1f/\\]/;

/** Returns an error message, or null when the name is safe on every platform. */
export function validateSyncName(name: string): string | null {
  if (!name || name === '.' || name === '..') return 'Name is empty or invalid';
  if (WINDOWS_RESERVED.test(name)) return `"${name}" is a reserved name on Windows`;
  if (INVALID_CHARS.test(name)) return 'Name contains a character not allowed on all platforms (< > : " | ? * / \\)';
  if (/[. ]$/.test(name)) return 'Name cannot end with a dot or space (Windows restriction)';
  if (name.length > 100) return 'Name is too long (max 100 characters)';
  return null;
}

// Spec §8 default ignore set: build junk + secrets. gitignore syntax — written
// into each hidden repo's info/exclude (never into the user's tree).
export const DEFAULT_IGNORES: string[] = [
  'node_modules/', '.git/', '.youcoded/', 'dist/', 'build/', 'out/', 'target/',
  '.venv/', 'venv/', '__pycache__/', '.pytest_cache/', '.gradle/',
  '.DS_Store', 'Thumbs.db', 'desktop.ini',
  '.env', '.env.*', '*.pem', '*.key', 'id_rsa*', 'id_ed25519*', '*.credentials.json',
];

/** Spec §7: files over this cap don't live-sync (daily backup covers them). */
export const MAX_SYNC_FILE_BYTES = 50 * 1024 * 1024;

/** Spec §8: "notes (from Laptop, 2026-07-03).md" — the visible conflict copy. */
export function conflictCopyName(relPath: string, deviceName: string, when: Date): string {
  const date = when.toISOString().slice(0, 10);
  const dot = relPath.lastIndexOf('.');
  const slash = Math.max(relPath.lastIndexOf('/'), relPath.lastIndexOf('\\'));
  const suffix = ` (from ${deviceName}, ${date})`;
  if (dot > slash + 1) return `${relPath.slice(0, dot)}${suffix}${relPath.slice(dot)}`;
  return `${relPath}${suffix}`;
}

/** Case-insensitive collision groups — these break macOS/Windows checkouts. */
export function findCaseCollisions(paths: string[]): string[][] {
  const byLower = new Map<string, string[]>();
  for (const p of paths) {
    const k = p.toLowerCase();
    byLower.set(k, [...(byLower.get(k) ?? []), p]);
  }
  return [...byLower.values()].filter(g => g.length > 1);
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/sync-spaces-guards.test.ts`
Expected: PASS (all)

- [x] **Step 5: Commit**

```bash
git add desktop/src/main/sync-spaces/guards.ts desktop/tests/sync-spaces-guards.test.ts
git commit -m "feat(sync-spaces): pure guards — name validation, ignores, size cap, conflict-copy naming"
```

---

### Task 2: Types + managed roots

**Files:**
- Create: `desktop/src/main/sync-spaces/types.ts`
- Create: `desktop/src/main/sync-spaces/managed-roots.ts`
- Test: `desktop/tests/sync-spaces-managed-roots.test.ts`

- [x] **Step 1: Write types.ts (no test — types only)**

```ts
// desktop/src/main/sync-spaces/types.ts
// The sync-space model from spec §4/§5. The SyncTransport seam is the
// compatibility boundary for the future YouCoded Cloud transport (spec §16).

export type SpaceKind = 'project' | 'personal';

export interface SyncSpace {
  id: string;        // 'personal' | 'project:<name>'
  kind: SpaceKind;
  root: string;      // absolute path to the space's folder on this device
}

export interface PushResult {
  pushed: boolean;          // false when nothing changed or no remote configured
  commit?: string;          // HEAD sha after commit, when one was made
  oversize: string[];       // rel paths excluded for exceeding MAX_SYNC_FILE_BYTES
}

export interface PullResult {
  updated: boolean;         // true when remote changes were applied
  conflictCopies: string[]; // rel paths of conflict copies written this pull
}

export interface SpaceVersion { commit: string; date: string; message: string; }

/** Spec §5: push/pull/subscribe/history. subscribe() is Plan 1b (SyncHub) —
 *  1a polls instead, so the interface ships without it and 1b adds it. */
export interface SyncTransport {
  init(space: SyncSpace): Promise<void>;
  hasRemote(space: SyncSpace): Promise<boolean>;
  setRemote(space: SyncSpace, url: string): Promise<void>;
  push(space: SyncSpace, message: string): Promise<PushResult>;
  pull(space: SyncSpace): Promise<PullResult>;
  history(space: SyncSpace, limit?: number): Promise<SpaceVersion[]>;
}

export type SpaceSyncEvent =
  | { type: 'synced'; spaceId: string; pushed: boolean; updated: boolean }
  | { type: 'conflict'; spaceId: string; copies: string[] }
  | { type: 'oversize'; spaceId: string; files: string[] }
  | { type: 'error'; spaceId: string; message: string };
```

- [x] **Step 2: Write the failing tests for managed-roots**

```ts
// desktop/tests/sync-spaces-managed-roots.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ManagedRoots } from '../src/main/sync-spaces/managed-roots';

let tmp: string;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-roots-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

describe('ManagedRoots', () => {
  it('ensure() creates Projects and Personal under the base', () => {
    const r = new ManagedRoots(tmp);
    r.ensure();
    expect(fs.existsSync(path.join(tmp, 'YouCoded', 'Projects'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'YouCoded', 'Personal'))).toBe(true);
  });
  it('listProjects() returns directories only, sorted', () => {
    const r = new ManagedRoots(tmp);
    r.ensure();
    fs.mkdirSync(path.join(r.projectsRoot, 'zeta'));
    fs.mkdirSync(path.join(r.projectsRoot, 'alpha'));
    fs.writeFileSync(path.join(r.projectsRoot, 'stray.txt'), 'x');
    expect(r.listProjects().map(p => p.name)).toEqual(['alpha', 'zeta']);
    expect(r.listProjects()[0].path).toBe(path.join(r.projectsRoot, 'alpha'));
  });
  it('createProject() validates the name and rejects duplicates', () => {
    const r = new ManagedRoots(tmp);
    r.ensure();
    expect(r.createProject('my-app')).toEqual({ ok: true, path: path.join(r.projectsRoot, 'my-app') });
    expect(r.createProject('my-app')).toEqual({ ok: false, error: 'A project with that name already exists' });
    const bad = r.createProject('aux');
    expect(bad.ok).toBe(false);
  });
  it('spaces() returns personal + one space per project with stable ids', () => {
    const r = new ManagedRoots(tmp);
    r.ensure();
    r.createProject('my-app');
    const spaces = r.spaces();
    expect(spaces.map(s => s.id)).toEqual(['personal', 'project:my-app']);
    expect(spaces[0].root).toBe(r.personalRoot);
    expect(spaces[1].kind).toBe('project');
  });
});
```

- [x] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/sync-spaces-managed-roots.test.ts`
Expected: FAIL — cannot resolve `managed-roots`

- [x] **Step 4: Implement managed-roots.ts**

```ts
// desktop/src/main/sync-spaces/managed-roots.ts
import fs from 'fs';
import os from 'os';
import path from 'path';
import { validateSyncName } from './guards';
import type { SyncSpace } from './types';

export type CreateResult = { ok: true; path: string } | { ok: false; error: string };

/** Owns ~/YouCoded/{Projects,Personal} (spec §3). baseDir is injectable for tests;
 *  production passes os.homedir(). */
export class ManagedRoots {
  readonly youcodedRoot: string;
  readonly projectsRoot: string;
  readonly personalRoot: string;

  constructor(baseDir: string = os.homedir()) {
    this.youcodedRoot = path.join(baseDir, 'YouCoded');
    this.projectsRoot = path.join(this.youcodedRoot, 'Projects');
    this.personalRoot = path.join(this.youcodedRoot, 'Personal');
  }

  ensure(): void {
    fs.mkdirSync(this.projectsRoot, { recursive: true });
    fs.mkdirSync(this.personalRoot, { recursive: true });
  }

  listProjects(): Array<{ name: string; path: string }> {
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(this.projectsRoot, { withFileTypes: true }); } catch { return []; }
    return entries
      .filter(e => e.isDirectory())
      .map(e => ({ name: e.name, path: path.join(this.projectsRoot, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  createProject(name: string): CreateResult {
    const err = validateSyncName(name);
    if (err) return { ok: false, error: err };
    const dir = path.join(this.projectsRoot, name);
    if (fs.existsSync(dir)) return { ok: false, error: 'A project with that name already exists' };
    fs.mkdirSync(dir, { recursive: true });
    return { ok: true, path: dir };
  }

  /** Spec §4: one personal space + one space per managed project. */
  spaces(): SyncSpace[] {
    return [
      { id: 'personal', kind: 'personal' as const, root: this.personalRoot },
      ...this.listProjects().map(p => ({ id: `project:${p.name}`, kind: 'project' as const, root: p.path })),
    ];
  }
}
```

- [x] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/sync-spaces-managed-roots.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add desktop/src/main/sync-spaces/types.ts desktop/src/main/sync-spaces/managed-roots.ts desktop/tests/sync-spaces-managed-roots.test.ts
git commit -m "feat(sync-spaces): SyncSpace/SyncTransport types + ManagedRoots (~/YouCoded)"
```

---

### Task 3: Transport contract suite + GitTransport init/push

The contract suite is the reusable compatibility boundary — Plan 1b/YouCoded Cloud must pass the same suite (spec §15). Tests use a **local bare repo** as the remote; no GitHub needed.

**Files:**
- Create: `desktop/tests/sync-transport-contract.ts` (exported suite, not a `.test` file)
- Create: `desktop/src/main/sync-spaces/git-transport.ts`
- Test: `desktop/tests/sync-spaces-git-transport.test.ts`

- [x] **Step 1: Write the contract suite**

```ts
// desktop/tests/sync-transport-contract.ts
// Contract every SyncTransport implementation must satisfy (spec §15).
// Called from a concrete transport's .test.ts with a factory.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { SyncSpace, SyncTransport } from '../src/main/sync-spaces/types';

export interface TransportHarness {
  transport: SyncTransport;
  /** Make a fresh device root attached to the SAME logical remote. */
  makeDeviceSpace(): Promise<SyncSpace>;
  cleanup(): Promise<void>;
}

export function describeTransportContract(name: string, makeHarness: () => Promise<TransportHarness>) {
  describe(`SyncTransport contract: ${name}`, () => {
    let h: TransportHarness;
    beforeEach(async () => { h = await makeHarness(); });
    afterEach(async () => { await h.cleanup(); });

    it('init is idempotent and touches nothing outside .youcoded/', async () => {
      const s = await h.makeDeviceSpace();
      await h.transport.init(s);
      await h.transport.init(s);
      const entries = fs.readdirSync(s.root).filter(e => e !== '.youcoded');
      expect(entries).toEqual([]);            // no .git file/dir, no stray files
      expect(fs.existsSync(path.join(s.root, '.git'))).toBe(false);
    });

    it('push then pull round-trips a file to a second device', async () => {
      const a = await h.makeDeviceSpace();
      const b = await h.makeDeviceSpace();
      await h.transport.init(a); await h.transport.init(b);
      fs.mkdirSync(path.join(a.root, 'docs'), { recursive: true });
      fs.writeFileSync(path.join(a.root, 'docs', 'notes.md'), 'hello from A\n');
      const push = await h.transport.push(a, 'test change');
      expect(push.pushed).toBe(true);
      const pull = await h.transport.pull(b);
      expect(pull.updated).toBe(true);
      expect(fs.readFileSync(path.join(b.root, 'docs', 'notes.md'), 'utf8')).toBe('hello from A\n');
    });

    it('push with no changes reports pushed:false', async () => {
      const a = await h.makeDeviceSpace();
      await h.transport.init(a);
      const r = await h.transport.push(a, 'noop');
      expect(r.pushed).toBe(false);
    });

    it('divergent edits converge: remote wins canonical, local kept as conflict copy', async () => {
      const a = await h.makeDeviceSpace();
      const b = await h.makeDeviceSpace();
      await h.transport.init(a); await h.transport.init(b);
      fs.writeFileSync(path.join(a.root, 'plan.md'), 'base\n');
      await h.transport.push(a, 'base');
      await h.transport.pull(b);
      // Both edit the same line "offline"
      fs.writeFileSync(path.join(a.root, 'plan.md'), 'A version\n');
      await h.transport.push(a, 'A edit');
      fs.writeFileSync(path.join(b.root, 'plan.md'), 'B version\n');
      const pull = await h.transport.pull(b);   // B pulls A's push → conflict
      expect(pull.conflictCopies.length).toBe(1);
      // Canonical file holds the REMOTE (A) content — convergent rule, spec §8
      expect(fs.readFileSync(path.join(b.root, 'plan.md'), 'utf8')).toBe('A version\n');
      // Conflict copy holds B's content
      const copy = path.join(b.root, pull.conflictCopies[0]);
      expect(fs.readFileSync(copy, 'utf8')).toBe('B version\n');
      // After B pushes, A pulls and converges with NO further conflict
      await h.transport.push(b, 'merge');
      const aPull = await h.transport.pull(a);
      expect(aPull.conflictCopies).toEqual([]);
      expect(fs.readFileSync(path.join(a.root, 'plan.md'), 'utf8')).toBe('A version\n');
      expect(fs.existsSync(path.join(a.root, pull.conflictCopies[0]))).toBe(true);
    });

    it('default ignores are honored (node_modules, .env never travel)', async () => {
      const a = await h.makeDeviceSpace();
      const b = await h.makeDeviceSpace();
      await h.transport.init(a); await h.transport.init(b);
      fs.mkdirSync(path.join(a.root, 'node_modules', 'x'), { recursive: true });
      fs.writeFileSync(path.join(a.root, 'node_modules', 'x', 'i.js'), 'x');
      fs.writeFileSync(path.join(a.root, '.env'), 'SECRET=1');
      fs.writeFileSync(path.join(a.root, 'real.md'), 'content');
      await h.transport.push(a, 'with junk');
      await h.transport.pull(b);
      expect(fs.existsSync(path.join(b.root, 'real.md'))).toBe(true);
      expect(fs.existsSync(path.join(b.root, 'node_modules'))).toBe(false);
      expect(fs.existsSync(path.join(b.root, '.env'))).toBe(false);
    });

    it('history lists pushed versions, newest first', async () => {
      const a = await h.makeDeviceSpace();
      await h.transport.init(a);
      fs.writeFileSync(path.join(a.root, 'f.md'), '1');
      await h.transport.push(a, 'first');
      fs.writeFileSync(path.join(a.root, 'f.md'), '2');
      await h.transport.push(a, 'second');
      const hist = await h.transport.history(a, 10);
      expect(hist.length).toBeGreaterThanOrEqual(2);
      expect(hist[0].message).toBe('second');
    });
  });
}
```

- [x] **Step 2: Write the git-transport test file that runs the contract**

```ts
// desktop/tests/sync-spaces-git-transport.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { GitTransport } from '../src/main/sync-spaces/git-transport';
import type { SyncSpace } from '../src/main/sync-spaces/types';
import { describeTransportContract, TransportHarness } from './sync-transport-contract';

// Real git, local bare repo as the "GitHub" remote. Needs git on PATH (CI has it).
async function makeHarness(): Promise<TransportHarness> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-gt-'));
  const bare = path.join(tmp, 'remote.git');
  fs.mkdirSync(bare);
  execFileSync('git', ['init', '--bare', '--initial-branch=main', bare]);
  let n = 0;
  const transport = new GitTransport({ deviceName: 'TestDevice' });
  return {
    transport,
    async makeDeviceSpace(): Promise<SyncSpace> {
      const root = path.join(tmp, `device-${n++}`);
      fs.mkdirSync(root, { recursive: true });
      const space: SyncSpace = { id: 'project:contract', kind: 'project', root };
      await transport.init(space);
      await transport.setRemote(space, bare);
      return space;
    },
    async cleanup() { fs.rmSync(tmp, { recursive: true, force: true }); },
  };
}

describeTransportContract('GitTransport', makeHarness);

describe('GitTransport specifics', () => {
  it('oversize files are excluded from sync and reported', async () => {
    const h = await makeHarness();
    const a = await h.makeDeviceSpace();
    // 50MB cap — write cap+1 bytes sparsely is slow; instead the transport takes
    // an injectable cap for tests:
    const small = new GitTransport({ deviceName: 'T', maxFileBytes: 10 });
    fs.writeFileSync(path.join(a.root, 'big.bin'), 'x'.repeat(11));
    fs.writeFileSync(path.join(a.root, 'ok.md'), 'fine');
    const r = await small.push(a, 'mixed');
    expect(r.pushed).toBe(true);
    expect(r.oversize).toEqual(['big.bin']);
    await h.cleanup();
  }, 30000);
});
```

- [x] **Step 3: Run to verify failure**

Run: `npx vitest run tests/sync-spaces-git-transport.test.ts`
Expected: FAIL — cannot resolve `git-transport`

- [x] **Step 4: Implement git-transport.ts**

```ts
// desktop/src/main/sync-spaces/git-transport.ts
// SyncTransport implementation over a HIDDEN git repo (spec §7).
//
// CRITICAL MECHANISM: we do NOT use `git init --separate-git-dir` — that writes
// a `.git` FILE into the worktree, which would collide with a developer's own
// .git in the same project. Instead every git call runs with GIT_DIR pointing
// at <root>/.youcoded/sync.git and GIT_WORK_TREE at <root>. The user's tree
// never contains any git artifact of ours; their own repo is untouched.
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { DEFAULT_IGNORES, MAX_SYNC_FILE_BYTES, conflictCopyName } from './guards';
import type { PullResult, PushResult, SpaceVersion, SyncSpace, SyncTransport } from './types';

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT = 5 * 60 * 1000; // mirrors sync-service.ts GIT_TIMEOUT

interface ExecResult { code: number; stdout: string; stderr: string; }

export class GitTransport implements SyncTransport {
  private deviceName: string;
  private maxFileBytes: number;

  constructor(opts: { deviceName: string; maxFileBytes?: number }) {
    this.deviceName = opts.deviceName;
    this.maxFileBytes = opts.maxFileBytes ?? MAX_SYNC_FILE_BYTES;
  }

  private gitDir(space: SyncSpace): string {
    return path.join(space.root, '.youcoded', 'sync.git');
  }

  private async git(space: SyncSpace, args: string[]): Promise<ExecResult> {
    const env = { ...process.env, GIT_DIR: this.gitDir(space), GIT_WORK_TREE: space.root };
    try {
      const { stdout, stderr } = await execFileAsync('git', args, { cwd: space.root, env, timeout: GIT_TIMEOUT });
      return { code: 0, stdout, stderr };
    } catch (e: any) {
      return { code: typeof e.code === 'number' ? e.code : 1, stdout: e.stdout || '', stderr: e.stderr || String(e) };
    }
  }

  async init(space: SyncSpace): Promise<void> {
    const gd = this.gitDir(space);
    if (!fs.existsSync(path.join(gd, 'HEAD'))) {
      fs.mkdirSync(gd, { recursive: true });
      await this.git(space, ['init', '--initial-branch=main']);
      await this.git(space, ['config', 'user.name', `YouCoded Sync (${this.deviceName})`]);
      await this.git(space, ['config', 'user.email', 'sync@youcoded.local']);
      // Byte-faithful storage; merge-time text normalization via repo-local
      // info/attributes (never a .gitattributes in the user's tree).
      await this.git(space, ['config', 'core.autocrlf', 'false']);
      fs.writeFileSync(path.join(gd, 'info', 'attributes'), '* text=auto\n');
    }
    // info/exclude is OURS (rewritten on every init so ignore updates roll out).
    // The user's own .gitignore still applies on top for their repo, not ours.
    fs.writeFileSync(path.join(gd, 'info', 'exclude'), DEFAULT_IGNORES.join('\n') + '\n');
  }

  async hasRemote(space: SyncSpace): Promise<boolean> {
    const r = await this.git(space, ['remote', 'get-url', 'origin']);
    return r.code === 0;
  }

  async setRemote(space: SyncSpace, url: string): Promise<void> {
    const existing = await this.git(space, ['remote', 'get-url', 'origin']);
    if (existing.code === 0) await this.git(space, ['remote', 'set-url', 'origin', url]);
    else await this.git(space, ['remote', 'add', 'origin', url]);
  }

  /** Stage everything, unstage+exclude oversize files, commit, push. */
  async push(space: SyncSpace, message: string): Promise<PushResult> {
    await this.git(space, ['add', '-A']);
    const oversize = await this.unstageOversize(space);
    const staged = await this.git(space, ['diff', '--cached', '--name-only']);
    let commit: string | undefined;
    if (staged.stdout.trim().length > 0) {
      const c = await this.git(space, ['commit', '-m', message]);
      if (c.code !== 0) return { pushed: false, oversize };
      commit = (await this.git(space, ['rev-parse', 'HEAD'])).stdout.trim();
    }
    if (!(await this.hasRemote(space))) return { pushed: false, commit, oversize };
    const ahead = await this.git(space, ['rev-list', '--count', 'origin/main..main']);
    // origin/main may not exist yet (first push) — rev-list fails; push anyway.
    if (ahead.code === 0 && ahead.stdout.trim() === '0' && !commit) return { pushed: false, oversize };
    const p = await this.git(space, ['push', '-u', 'origin', 'main']);
    if (p.code !== 0) {
      // Non-fast-forward: another device pushed first. Merge, then push again.
      await this.pull(space);
      const retry = await this.git(space, ['push', '-u', 'origin', 'main']);
      return { pushed: retry.code === 0, commit, oversize };
    }
    return { pushed: true, commit, oversize };
  }

  private async unstageOversize(space: SyncSpace): Promise<string[]> {
    const staged = (await this.git(space, ['diff', '--cached', '--name-only', '-z'])).stdout
      .split('\0').filter(Boolean);
    const oversize: string[] = [];
    for (const rel of staged) {
      try {
        if (fs.statSync(path.join(space.root, rel)).size > this.maxFileBytes) oversize.push(rel);
      } catch { /* deleted while staging — fine */ }
    }
    if (oversize.length) {
      await this.git(space, ['reset', '--', ...oversize]);
      // Persist the exclusion so the watcher doesn't re-stage it every cycle.
      fs.appendFileSync(path.join(this.gitDir(space), 'info', 'exclude'),
        oversize.map(o => `/${o}`).join('\n') + '\n');
    }
    return oversize;
  }

  /** Commit local pending, fetch, merge. Convergent conflict rule (spec §8):
   *  REMOTE wins the canonical filename; LOCAL content is preserved as a
   *  visible conflict copy. Both devices converge to identical trees. */
  async pull(space: SyncSpace): Promise<PullResult> {
    // Snapshot local changes first so merge never runs on a dirty tree.
    await this.git(space, ['add', '-A']);
    await this.unstageOversize(space);
    const dirty = (await this.git(space, ['diff', '--cached', '--name-only'])).stdout.trim();
    if (dirty) await this.git(space, ['commit', '-m', `local snapshot before merge (${this.deviceName})`]);

    if (!(await this.hasRemote(space))) return { updated: false, conflictCopies: [] };
    const fetch = await this.git(space, ['fetch', 'origin', 'main']);
    if (fetch.code !== 0) return { updated: false, conflictCopies: [] }; // offline — never block (spec §13)
    const behind = await this.git(space, ['rev-list', '--count', 'main..origin/main']);
    if (behind.code !== 0 || behind.stdout.trim() === '0') return { updated: false, conflictCopies: [] };

    const merge = await this.git(space, ['merge', '--no-edit', 'origin/main']);
    if (merge.code === 0) return { updated: true, conflictCopies: [] };

    // Conflicts: resolve each convergently.
    const conflicted = (await this.git(space, ['diff', '--name-only', '--diff-filter=U', '-z'])).stdout
      .split('\0').filter(Boolean);
    const copies: string[] = [];
    for (const rel of conflicted) {
      // Stage 2 = ours (this device), stage 3 = theirs (remote).
      const ours = await this.git(space, ['show', `:2:${rel}`]);
      const theirs = await this.git(space, ['show', `:3:${rel}`]);
      if (ours.code === 0) {
        const copyRel = this.freeCopyName(space, rel);
        fs.mkdirSync(path.dirname(path.join(space.root, copyRel)), { recursive: true });
        fs.writeFileSync(path.join(space.root, copyRel), ours.stdout);
        await this.git(space, ['add', copyRel]);
        copies.push(copyRel);
      }
      if (theirs.code === 0) {
        await this.git(space, ['checkout', '--theirs', '--', rel]);
        await this.git(space, ['add', rel]);
      } else {
        await this.git(space, ['rm', '--force', '--', rel]); // deleted remotely → deletion wins canonical
      }
    }
    const commit = await this.git(space, ['commit', '--no-edit']);
    if (commit.code !== 0) {
      // Merge could not complete — bail out rather than leave a wedged repo.
      await this.git(space, ['merge', '--abort']);
      return { updated: false, conflictCopies: [] };
    }
    return { updated: true, conflictCopies: copies };
  }

  private freeCopyName(space: SyncSpace, rel: string): string {
    let candidate = conflictCopyName(rel, this.deviceName, new Date());
    let i = 2;
    while (fs.existsSync(path.join(space.root, candidate))) {
      candidate = conflictCopyName(rel, `${this.deviceName} ${i++}`, new Date());
    }
    return candidate;
  }

  async history(space: SyncSpace, limit = 50): Promise<SpaceVersion[]> {
    const r = await this.git(space, ['log', `--max-count=${limit}`, '--format=%H%x1f%cI%x1f%s']);
    if (r.code !== 0) return [];
    return r.stdout.split('\n').filter(Boolean).map(line => {
      const [commit, date, message] = line.split('\x1f');
      return { commit, date, message };
    });
  }
}
```

- [x] **Step 5: Run the transport tests**

Run: `npx vitest run tests/sync-spaces-git-transport.test.ts`
Expected: PASS (contract suite + oversize test). These tests shell to real git — if a step fails, re-run with `--reporter=verbose` and inspect the temp dirs printed in failures before changing the implementation.

- [x] **Step 6: Commit**

```bash
git add desktop/tests/sync-transport-contract.ts desktop/src/main/sync-spaces/git-transport.ts desktop/tests/sync-spaces-git-transport.test.ts
git commit -m "feat(sync-spaces): GitTransport (hidden GIT_DIR repo) + reusable transport contract suite"
```

---

### Task 4: Sync engine (watcher + debounce + poll + single-flight)

**Files:**
- Create: `desktop/src/main/sync-spaces/engine.ts`
- Test: `desktop/tests/sync-spaces-engine.test.ts`

- [x] **Step 1: Write the failing test**

The engine test uses a fake transport (no git) to keep it fast and deterministic; the real-git path is already covered by Task 3.

```ts
// desktop/tests/sync-spaces-engine.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SpaceSyncEngine } from '../src/main/sync-spaces/engine';
import type { SyncSpace, SyncTransport, SpaceSyncEvent } from '../src/main/sync-spaces/types';

function fakeTransport(): SyncTransport & { pushes: string[]; pulls: string[] } {
  const t: any = {
    pushes: [] as string[], pulls: [] as string[],
    init: vi.fn(async () => {}),
    hasRemote: vi.fn(async () => true),
    setRemote: vi.fn(async () => {}),
    push: vi.fn(async (s: SyncSpace) => { t.pushes.push(s.id); return { pushed: true, oversize: [] }; }),
    pull: vi.fn(async (s: SyncSpace) => { t.pulls.push(s.id); return { updated: false, conflictCopies: [] }; }),
    history: vi.fn(async () => []),
  };
  return t;
}

let tmp: string;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-eng-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

describe('SpaceSyncEngine', () => {
  it('debounces file changes into one sync (pull then push)', async () => {
    const t = fakeTransport();
    const events: SpaceSyncEvent[] = [];
    const engine = new SpaceSyncEngine(t, { debounceMs: 150, pollMs: 0, onEvent: e => events.push(e) });
    const space: SyncSpace = { id: 'project:x', kind: 'project', root: tmp };
    await engine.addSpace(space);
    fs.writeFileSync(path.join(tmp, 'a.md'), '1');
    fs.writeFileSync(path.join(tmp, 'b.md'), '2');
    await vi.waitFor(() => expect(t.pushes.length).toBe(1), { timeout: 5000 });
    expect(t.pulls.length).toBe(1);                 // pull-before-push ordering
    expect(events.some(e => e.type === 'synced')).toBe(true);
    await engine.stop();
  });

  it('ignores changes under .youcoded/ and node_modules/', async () => {
    const t = fakeTransport();
    const engine = new SpaceSyncEngine(t, { debounceMs: 100, pollMs: 0, onEvent: () => {} });
    await engine.addSpace({ id: 'project:x', kind: 'project', root: tmp });
    fs.mkdirSync(path.join(tmp, '.youcoded'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.youcoded', 'sync.log'), 'x');
    fs.mkdirSync(path.join(tmp, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'node_modules', 'y.js'), 'x');
    await new Promise(r => setTimeout(r, 500));
    expect(t.pushes.length).toBe(0);
    await engine.stop();
  });

  it('poll timer pulls without local changes', async () => {
    const t = fakeTransport();
    const engine = new SpaceSyncEngine(t, { debounceMs: 5000, pollMs: 120, onEvent: () => {} });
    await engine.addSpace({ id: 'personal', kind: 'personal', root: tmp });
    await vi.waitFor(() => expect(t.pulls.length).toBeGreaterThanOrEqual(1), { timeout: 5000 });
    await engine.stop();
  });

  it('emits error events instead of throwing (never-block, spec §13)', async () => {
    const t = fakeTransport();
    (t.push as any).mockImplementation(async () => { throw new Error('boom'); });
    const events: SpaceSyncEvent[] = [];
    const engine = new SpaceSyncEngine(t, { debounceMs: 100, pollMs: 0, onEvent: e => events.push(e) });
    await engine.addSpace({ id: 'project:x', kind: 'project', root: tmp });
    fs.writeFileSync(path.join(tmp, 'a.md'), '1');
    await vi.waitFor(() => expect(events.some(e => e.type === 'error')).toBe(true), { timeout: 5000 });
    await engine.stop();
  });
});
```

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run tests/sync-spaces-engine.test.ts`
Expected: FAIL — cannot resolve `engine`

- [x] **Step 3: Implement engine.ts**

```ts
// desktop/src/main/sync-spaces/engine.ts
// Watch → debounce → sync (pull-then-push) per space, plus a poll loop that
// stands in for SyncHub signals until Plan 1b. Single-flight per space: a
// change arriving mid-sync queues exactly one follow-up sync.
import path from 'path';
import chokidar, { FSWatcher } from 'chokidar';
import type { SpaceSyncEvent, SyncSpace, SyncTransport } from './types';

interface EngineOpts {
  debounceMs?: number;  // default 15s (spec §8)
  pollMs?: number;      // default 120s (spec §6 degradation path); 0 disables
  onEvent: (e: SpaceSyncEvent) => void;
}

interface SpaceState {
  space: SyncSpace;
  watcher: FSWatcher;
  debounce: ReturnType<typeof setTimeout> | null;
  syncing: boolean;
  rerun: boolean;
}

const WATCH_IGNORED = [/(^|[\\/])\.youcoded([\\/]|$)/, /(^|[\\/])node_modules([\\/]|$)/, /(^|[\\/])\.git([\\/]|$)/];

export class SpaceSyncEngine {
  private states = new Map<string, SpaceState>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private debounceMs: number;
  private pollMs: number;
  private onEvent: (e: SpaceSyncEvent) => void;

  constructor(private transport: SyncTransport, opts: EngineOpts) {
    this.debounceMs = opts.debounceMs ?? 15_000;
    this.pollMs = opts.pollMs ?? 120_000;
    this.onEvent = opts.onEvent;
    if (this.pollMs > 0) {
      this.pollTimer = setInterval(() => {
        for (const st of this.states.values()) void this.syncSpace(st.space);
      }, this.pollMs);
      // Don't keep the process alive for polling alone.
      (this.pollTimer as any).unref?.();
    }
  }

  async addSpace(space: SyncSpace): Promise<void> {
    if (this.states.has(space.id)) return;
    await this.transport.init(space);
    const watcher = chokidar.watch(space.root, {
      ignored: WATCH_IGNORED,
      ignoreInitial: true,
      followSymlinks: false,       // spec §8: symlinks are not synced
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    });
    const st: SpaceState = { space, watcher, debounce: null, syncing: false, rerun: false };
    watcher.on('all', () => this.schedule(st));
    this.states.set(space.id, st);
  }

  private schedule(st: SpaceState): void {
    if (st.debounce) clearTimeout(st.debounce);
    st.debounce = setTimeout(() => { st.debounce = null; void this.syncSpace(st.space); }, this.debounceMs);
  }

  /** Pull first (reduces non-fast-forward pushes), then push. Never throws. */
  async syncSpace(space: SyncSpace): Promise<void> {
    const st = this.states.get(space.id);
    if (!st) return;
    if (st.syncing) { st.rerun = true; return; }
    st.syncing = true;
    try {
      const pull = await this.transport.pull(space);
      if (pull.conflictCopies.length) this.onEvent({ type: 'conflict', spaceId: space.id, copies: pull.conflictCopies });
      const push = await this.transport.push(space, `sync from ${space.id}`);
      if (push.oversize.length) this.onEvent({ type: 'oversize', spaceId: space.id, files: push.oversize });
      this.onEvent({ type: 'synced', spaceId: space.id, pushed: push.pushed, updated: pull.updated });
    } catch (e: any) {
      this.onEvent({ type: 'error', spaceId: space.id, message: String(e?.message ?? e) });
    } finally {
      st.syncing = false;
      if (st.rerun) { st.rerun = false; void this.syncSpace(space); }
    }
  }

  async stop(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);
    for (const st of this.states.values()) {
      if (st.debounce) clearTimeout(st.debounce);
      await st.watcher.close();
    }
    this.states.clear();
  }
}
```

- [x] **Step 4: Run tests**

Run: `npx vitest run tests/sync-spaces-engine.test.ts`
Expected: PASS

- [x] **Step 5: Run the whole new suite together**

Run: `npx vitest run tests/sync-spaces-guards.test.ts tests/sync-spaces-managed-roots.test.ts tests/sync-spaces-git-transport.test.ts tests/sync-spaces-engine.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add desktop/src/main/sync-spaces/engine.ts desktop/tests/sync-spaces-engine.test.ts
git commit -m "feat(sync-spaces): SpaceSyncEngine — chokidar watch, debounce, poll loop, single-flight, never-block events"
```

---

### Task 5: Space manager (enable state + GitHub remote provisioning)

**Files:**
- Create: `desktop/src/main/sync-spaces/space-manager.ts`
- Test: `desktop/tests/sync-spaces-space-manager.test.ts`

- [x] **Step 1: Write the failing test (state + repo-name logic; gh calls injected)**

```ts
// desktop/tests/sync-spaces-space-manager.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SpaceManager, repoNameForSpace } from '../src/main/sync-spaces/space-manager';
import type { SyncSpace } from '../src/main/sync-spaces/types';

describe('repoNameForSpace', () => {
  it('maps personal and project spaces to stable private repo names', () => {
    expect(repoNameForSpace({ id: 'personal', kind: 'personal', root: '/x' })).toBe('youcoded-sync-personal');
    expect(repoNameForSpace({ id: 'project:My App', kind: 'project', root: '/x' })).toBe('youcoded-sync-project-my-app');
  });
});

describe('SpaceManager state', () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-sm-')); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('persists enabled flag + per-space remotes in sync-spaces.json', () => {
    const stateFile = path.join(tmp, 'sync-spaces.json');
    const m = new SpaceManager({ stateFile, provisionRemote: vi.fn() });
    expect(m.isEnabled()).toBe(false);
    m.setEnabled(true);
    expect(new SpaceManager({ stateFile, provisionRemote: vi.fn() }).isEnabled()).toBe(true);
    m.recordRemote('personal', 'https://github.com/u/youcoded-sync-personal.git');
    expect(m.remoteFor('personal')).toBe('https://github.com/u/youcoded-sync-personal.git');
  });

  it('ensureRemote provisions once and caches the URL', async () => {
    const stateFile = path.join(tmp, 'sync-spaces.json');
    const provisionRemote = vi.fn(async (name: string) => `https://github.com/u/${name}.git`);
    const m = new SpaceManager({ stateFile, provisionRemote });
    const space: SyncSpace = { id: 'personal', kind: 'personal', root: tmp };
    const url1 = await m.ensureRemote(space);
    const url2 = await m.ensureRemote(space);
    expect(url1).toBe('https://github.com/u/youcoded-sync-personal.git');
    expect(url2).toBe(url1);
    expect(provisionRemote).toHaveBeenCalledTimes(1);
  });
});
```

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run tests/sync-spaces-space-manager.test.ts`
Expected: FAIL

- [x] **Step 3: Implement space-manager.ts**

```ts
// desktop/src/main/sync-spaces/space-manager.ts
// Sync enable/disable state + per-space GitHub remote provisioning.
// State lives at ~/.claude/toolkit-state/sync-spaces.json.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { SyncSpace } from './types';

const execFileAsync = promisify(execFile);

export function repoNameForSpace(space: SyncSpace): string {
  if (space.kind === 'personal') return 'youcoded-sync-personal';
  const name = space.id.replace(/^project:/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `youcoded-sync-project-${name}`;
}

/** Creates a private repo via gh and returns its clone URL. Mirrors the
 *  createGithubRepo pattern in sync-setup-handlers.ts. */
export async function provisionGithubRemote(repoName: string): Promise<string> {
  // `gh repo create` prints the repo URL on success; --private is mandatory (spec §14).
  const { stdout } = await execFileAsync('gh', ['repo', 'create', repoName, '--private'], { timeout: 60_000 });
  const url = stdout.trim();
  if (!/^https:\/\/github\.com\//.test(url)) throw new Error(`unexpected gh output: ${stdout}`);
  return `${url}.git`;
}

interface SpaceManagerOpts {
  stateFile?: string; // injectable for tests
  provisionRemote?: (repoName: string) => Promise<string>;
}

interface SpacesState {
  enabled: boolean;
  remotes: Record<string, string>; // spaceId -> clone URL
}

export class SpaceManager {
  private stateFile: string;
  private provisionRemote: (repoName: string) => Promise<string>;

  constructor(opts: SpaceManagerOpts = {}) {
    this.stateFile = opts.stateFile ?? path.join(os.homedir(), '.claude', 'toolkit-state', 'sync-spaces.json');
    this.provisionRemote = opts.provisionRemote ?? provisionGithubRemote;
  }

  private read(): SpacesState {
    try { return { enabled: false, remotes: {}, ...JSON.parse(fs.readFileSync(this.stateFile, 'utf8')) }; }
    catch { return { enabled: false, remotes: {} }; }
  }

  private write(s: SpacesState): void {
    fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
    fs.writeFileSync(this.stateFile, JSON.stringify(s, null, 2));
  }

  isEnabled(): boolean { return this.read().enabled; }
  setEnabled(v: boolean): void { this.write({ ...this.read(), enabled: v }); }
  remoteFor(spaceId: string): string | null { return this.read().remotes[spaceId] ?? null; }
  recordRemote(spaceId: string, url: string): void {
    const s = this.read();
    s.remotes[spaceId] = url;
    this.write(s);
  }

  /** Idempotent: returns the recorded remote or provisions + records one. */
  async ensureRemote(space: SyncSpace): Promise<string> {
    const existing = this.remoteFor(space.id);
    if (existing) return existing;
    const url = await this.provisionRemote(repoNameForSpace(space));
    this.recordRemote(space.id, url);
    return url;
  }
}
```

- [x] **Step 4: Run tests**

Run: `npx vitest run tests/sync-spaces-space-manager.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add desktop/src/main/sync-spaces/space-manager.ts desktop/tests/sync-spaces-space-manager.test.ts
git commit -m "feat(sync-spaces): SpaceManager — enable state, per-space GitHub remote provisioning via gh"
```

---

### Task 6: Daily dated backup job

**Files:**
- Create: `desktop/src/main/sync-spaces/daily-backup.ts`
- Test: `desktop/tests/sync-spaces-daily-backup.test.ts`

- [x] **Step 1: Write the failing tests (pure scheduling + prune logic)**

```ts
// desktop/tests/sync-spaces-daily-backup.test.ts
import { describe, it, expect } from 'vitest';
import { isBackupDue, datedFolderName, foldersToPrune } from '../src/main/sync-spaces/daily-backup';

describe('isBackupDue', () => {
  it('due when no marker', () => expect(isBackupDue(null, new Date('2026-07-03T10:00:00Z'))).toBe(true));
  it('not due same UTC day', () => expect(isBackupDue('2026-07-03', new Date('2026-07-03T23:00:00Z'))).toBe(false));
  it('due on a new UTC day', () => expect(isBackupDue('2026-07-02', new Date('2026-07-03T00:10:00Z'))).toBe(true));
});

describe('datedFolderName', () => {
  it('is the UTC date', () => expect(datedFolderName(new Date('2026-07-03T14:00:00Z'))).toBe('2026-07-03'));
});

describe('foldersToPrune', () => {
  it('keeps 30 days, prunes older, ignores non-date names', () => {
    const now = new Date('2026-07-03T00:00:00Z');
    expect(foldersToPrune(['2026-07-01', '2026-05-01', 'junk', '2026-06-04'], now, 30))
      .toEqual(['2026-05-01']);
  });
});
```

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run tests/sync-spaces-daily-backup.test.ts`
Expected: FAIL

- [x] **Step 3: Implement daily-backup.ts**

```ts
// desktop/src/main/sync-spaces/daily-backup.ts
// Spec §11: once per day, copy ALL synced spaces to each configured Drive /
// iCloud backend into a dated folder, then prune by age. Runs ALONGSIDE the
// legacy backup in 1a (legacy is untouched until conversations move in Phase 2).
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { DEFAULT_IGNORES } from './guards';
import type { SyncSpace } from './types';

const execFileAsync = promisify(execFile);
const RCLONE_TIMEOUT = 10 * 60 * 1000;

// ---- pure helpers (unit-tested) ----
export function datedFolderName(now: Date): string { return now.toISOString().slice(0, 10); }

export function isBackupDue(markerContent: string | null, now: Date): boolean {
  return markerContent !== datedFolderName(now);
}

export function foldersToPrune(names: string[], now: Date, keepDays: number): string[] {
  const cutoff = now.getTime() - keepDays * 24 * 60 * 60 * 1000;
  return names.filter(n => /^\d{4}-\d{2}-\d{2}$/.test(n) && new Date(`${n}T00:00:00Z`).getTime() < cutoff);
}

// ---- job ----
export interface BackupTarget {
  type: 'drive' | 'icloud';
  /** drive: rclone remote+root e.g. "gdrive:Claude"; icloud: absolute folder path */
  base: string;
}

export class DailyBackup {
  private markerPath: string;

  constructor(opts?: { markerPath?: string }) {
    this.markerPath = opts?.markerPath ?? path.join(os.homedir(), '.claude', '.spaces-backup-marker');
  }

  /** Call from an hourly timer; no-ops until a new UTC day. Never throws. */
  async runIfDue(spaces: SyncSpace[], targets: BackupTarget[], log: (msg: string) => void): Promise<void> {
    let marker: string | null = null;
    try { marker = fs.readFileSync(this.markerPath, 'utf8').trim(); } catch { /* first run */ }
    const now = new Date();
    if (!isBackupDue(marker, now) || targets.length === 0) return;
    const dated = datedFolderName(now);
    for (const target of targets) {
      for (const space of spaces) {
        try { await this.copySpace(space, target, dated); }
        catch (e: any) { log(`spaces-backup failed for ${space.id} → ${target.type}: ${String(e?.message ?? e)}`); }
      }
      try { await this.prune(target, now, log); } catch { /* prune is best-effort */ }
    }
    fs.writeFileSync(this.markerPath, dated);
    log(`spaces-backup completed for ${dated} (${spaces.length} spaces, ${targets.length} targets)`);
  }

  private async copySpace(space: SyncSpace, target: BackupTarget, dated: string): Promise<void> {
    if (target.type === 'drive') {
      const dest = `${target.base}/Backup/spaces/${dated}/${space.id.replace(':', '-')}`;
      const excludes = DEFAULT_IGNORES.flatMap(p => ['--exclude', p.endsWith('/') ? `${p}**` : p]);
      await execFileAsync('rclone', ['copy', space.root, dest, ...excludes], { timeout: RCLONE_TIMEOUT });
    } else {
      const dest = path.join(target.base, 'Backup', 'spaces', dated, space.id.replace(':', '-'));
      fs.mkdirSync(dest, { recursive: true });
      fs.cpSync(space.root, dest, {
        recursive: true,
        filter: (src) => !/([\\/])(node_modules|\.youcoded|\.git)([\\/]|$)/.test(src) && !path.basename(src).startsWith('.env'),
      });
    }
  }

  private async prune(target: BackupTarget, now: Date, log: (m: string) => void): Promise<void> {
    if (target.type === 'drive') {
      const { stdout } = await execFileAsync('rclone', ['lsf', '--dirs-only', `${target.base}/Backup/spaces/`], { timeout: RCLONE_TIMEOUT });
      const names = stdout.split('\n').map(s => s.replace(/\/$/, '')).filter(Boolean);
      for (const name of foldersToPrune(names, now, 30)) {
        await execFileAsync('rclone', ['purge', `${target.base}/Backup/spaces/${name}`], { timeout: RCLONE_TIMEOUT });
        log(`spaces-backup pruned ${name}`);
      }
    } else {
      const dir = path.join(target.base, 'Backup', 'spaces');
      let names: string[] = [];
      try { names = fs.readdirSync(dir); } catch { return; }
      for (const name of foldersToPrune(names, now, 30)) {
        fs.rmSync(path.join(dir, name), { recursive: true, force: true });
        log(`spaces-backup pruned ${name}`);
      }
    }
  }
}
```

- [x] **Step 4: Run tests**

Run: `npx vitest run tests/sync-spaces-daily-backup.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add desktop/src/main/sync-spaces/daily-backup.ts desktop/tests/sync-spaces-daily-backup.test.ts
git commit -m "feat(sync-spaces): DailyBackup — dated per-day space snapshots to Drive/iCloud with 30-day prune"
```

---

### Task 7: IPC channels (parity across preload, remote-shim, remote-server, types.ts)

**Files:**
- Modify: `desktop/src/shared/types.ts` (the `export const IPC` object)
- Modify: `desktop/src/main/preload.ts` (inlined `IPC` object ~line 90+, and the `window.claude` API)
- Modify: `desktop/src/renderer/remote-shim.ts` (~line 940, next to the `sync:` block)
- Modify: `desktop/src/main/remote-server.ts` (~line 1093, next to `case 'sync:get-status'`)
- Test: `desktop/tests/ipc-channels.test.ts` (add a hard-assert describe)

**Channels:** `syncspaces:status`, `syncspaces:enable`, `syncspaces:sync-now`, `syncspaces:create-project`, plus push event `syncspaces:event`.

- [x] **Step 1: Add the parity test first**

Append to `desktop/tests/ipc-channels.test.ts` (follow the existing `dev:*` describe pattern in that file):

```ts
describe('syncspaces:* channel parity (desktop surfaces)', () => {
  const channels = ['syncspaces:status', 'syncspaces:enable', 'syncspaces:sync-now', 'syncspaces:create-project'];
  const preload = fs.readFileSync(path.join(__dirname, '../src/main/preload.ts'), 'utf8');
  const shim = fs.readFileSync(path.join(__dirname, '../src/renderer/remote-shim.ts'), 'utf8');
  const handlers = fs.readFileSync(path.join(__dirname, '../src/main/ipc-handlers.ts'), 'utf8');
  const remoteServer = fs.readFileSync(path.join(__dirname, '../src/main/remote-server.ts'), 'utf8');
  for (const ch of channels) {
    it(`${ch} present in preload, remote-shim, ipc-handlers, remote-server`, () => {
      expect(preload).toContain(ch);
      expect(shim).toContain(ch);
      expect(handlers).toContain(ch);
      expect(remoteServer).toContain(ch);
    });
  }
  it('syncspaces:event push channel present in preload + remote-shim', () => {
    expect(preload).toContain('syncspaces:event');
    expect(shim).toContain('syncspaces:event');
  });
});
```

Run: `npx vitest run tests/ipc-channels.test.ts`
Expected: the new describe FAILS (channels absent); pre-existing describes still pass.

- [x] **Step 2: Add constants to `src/shared/types.ts` IPC object**

Inside `export const IPC = { ... }` next to the existing `SYNC_*` keys:

```ts
  SYNC_SPACES_STATUS: 'syncspaces:status',
  SYNC_SPACES_ENABLE: 'syncspaces:enable',
  SYNC_SPACES_SYNC_NOW: 'syncspaces:sync-now',
  SYNC_SPACES_CREATE_PROJECT: 'syncspaces:create-project',
  SYNC_SPACES_EVENT: 'syncspaces:event',
```

- [x] **Step 3: Add the same keys to the inlined IPC object in `preload.ts`** (values must be byte-identical — the parity test compares them), then expose the API next to the existing `sync:` block (~line 580):

```ts
  syncSpaces: {
    status: () => ipcRenderer.invoke(IPC.SYNC_SPACES_STATUS),
    enable: (enabled: boolean) => ipcRenderer.invoke(IPC.SYNC_SPACES_ENABLE, enabled),
    syncNow: () => ipcRenderer.invoke(IPC.SYNC_SPACES_SYNC_NOW),
    createProject: (name: string) => ipcRenderer.invoke(IPC.SYNC_SPACES_CREATE_PROJECT, name),
    onEvent: (cb: (e: unknown) => void) => {
      const listener = (_: unknown, e: unknown) => cb(e);
      ipcRenderer.on(IPC.SYNC_SPACES_EVENT, listener);
      return () => ipcRenderer.removeListener(IPC.SYNC_SPACES_EVENT, listener);
    },
  },
```

- [x] **Step 4: Mirror in `remote-shim.ts`** (next to the `sync:` block ~line 940 — same shared shape or React crashes on remote, per PITFALLS):

```ts
  syncSpaces: {
    status: () => invoke('syncspaces:status'),
    enable: (enabled: boolean) => invoke('syncspaces:enable', { enabled }),
    syncNow: () => invoke('syncspaces:sync-now'),
    createProject: (name: string) => invoke('syncspaces:create-project', { name }),
    onEvent: (cb: (e: unknown) => void) => subscribe('syncspaces:event', cb),
  },
```

(If `remote-shim.ts` has no generic `subscribe` helper, follow whatever pattern the existing `sync`/`status:data` push events use in that file — match it exactly.)

- [x] **Step 5: Add remote-server cases** in the message switch (~line 1093, next to `case 'sync:get-status'`) delegating to the same functions Task 8 wires (import from `./sync-spaces/service` — created in Task 8):

```ts
      case 'syncspaces:status': this.respond(ws, msg, await syncSpacesStatus()); break;
      case 'syncspaces:enable': this.respond(ws, msg, await syncSpacesEnable(!!msg.payload?.enabled)); break;
      case 'syncspaces:sync-now': this.respond(ws, msg, await syncSpacesSyncNow()); break;
      case 'syncspaces:create-project': this.respond(ws, msg, await syncSpacesCreateProject(String(msg.payload?.name ?? ''))); break;
```

(Match the exact `respond` signature used by the adjacent `sync:get-status` case in that file.)

- [x] **Step 6: Run the parity test** — the ipc-handlers assertion still fails (handlers arrive in Task 8). That's expected; commit after Task 8. Do NOT commit a red test alone.

---

### Task 8: Service wiring — ipc-handlers, main.ts bootstrap, folders merge

**Files:**
- Create: `desktop/src/main/sync-spaces/service.ts` (composition root for the subsystem)
- Modify: `desktop/src/main/ipc-handlers.ts` (register handlers + merge managed projects into `FOLDERS_LIST`)
- Modify: `desktop/src/main/main.ts` (~line 1432 block)

- [x] **Step 1: Implement service.ts**

```ts
// desktop/src/main/sync-spaces/service.ts
// Composition root: owns the singleton ManagedRoots/SpaceManager/Engine and
// exposes the functions IPC + remote-server call. Mirrors the sync-state.ts
// singleton pattern (setSyncService/getSyncService).
import os from 'os';
import { BrowserWindow } from 'electron';
import { ManagedRoots } from './managed-roots';
import { SpaceManager } from './space-manager';
import { GitTransport } from './git-transport';
import { SpaceSyncEngine } from './engine';
import { DailyBackup, BackupTarget } from './daily-backup';
import type { SpaceSyncEvent } from './types';

let roots: ManagedRoots | null = null;
let manager: SpaceManager | null = null;
let engine: SpaceSyncEngine | null = null;
let backup: DailyBackup | null = null;
let backupTimer: ReturnType<typeof setInterval> | null = null;
let recentEvents: SpaceSyncEvent[] = [];

function broadcast(e: SpaceSyncEvent): void {
  recentEvents = [...recentEvents.slice(-49), e];
  for (const w of BrowserWindow.getAllWindows()) {
    try { w.webContents.send('syncspaces:event', e); } catch { /* window closing */ }
  }
}

/** Called once from main.ts after app ready. Roots always exist (the picker
 *  needs them); the engine only starts when the user enabled sync. */
export async function startSyncSpaces(getBackupTargets: () => BackupTarget[], log: (m: string) => void): Promise<void> {
  roots = new ManagedRoots();
  roots.ensure();
  manager = new SpaceManager();
  if (manager.isEnabled()) await startEngine(log);
  backup = new DailyBackup();
  backupTimer = setInterval(() => {
    void backup!.runIfDue(roots!.spaces(), getBackupTargets(), log);
  }, 60 * 60 * 1000);
  (backupTimer as any).unref?.();
  void backup.runIfDue(roots.spaces(), getBackupTargets(), log);
}

async function startEngine(log: (m: string) => void): Promise<void> {
  const transport = new GitTransport({ deviceName: os.hostname() });
  engine = new SpaceSyncEngine(transport, { onEvent: broadcast });
  for (const space of roots!.spaces()) {
    try {
      await engine.addSpace(space);
      const url = await manager!.ensureRemote(space);
      await transport.setRemote(space, url);
      void engine.syncSpace(space); // initial reconcile
    } catch (e: any) {
      log(`sync-spaces: failed to start space ${space.id}: ${String(e?.message ?? e)}`);
      broadcast({ type: 'error', spaceId: space.id, message: String(e?.message ?? e) });
    }
  }
}

export async function stopSyncSpaces(): Promise<void> {
  if (backupTimer) clearInterval(backupTimer);
  await engine?.stop();
  engine = null;
}

// ---- IPC-facing functions (also used by remote-server cases) ----
export async function syncSpacesStatus() {
  return {
    enabled: manager?.isEnabled() ?? false,
    spaces: roots?.spaces().map(s => ({ ...s, remote: manager?.remoteFor(s.id) ?? null })) ?? [],
    recentEvents,
  };
}

export async function syncSpacesEnable(enabled: boolean) {
  manager!.setEnabled(enabled);
  if (enabled && !engine) await startEngine(() => {} as any ?? console.log); // log injected in Step 2 wiring
  if (!enabled && engine) { await engine.stop(); engine = null; }
  return syncSpacesStatus();
}

export async function syncSpacesSyncNow() {
  if (engine && roots) for (const s of roots.spaces()) void engine.syncSpace(s);
  return { ok: true };
}

export async function syncSpacesCreateProject(name: string) {
  const result = roots!.createProject(name);
  if (result.ok && engine) {
    const space = roots!.spaces().find(s => s.id === `project:${name}`)!;
    try {
      await engine.addSpace(space);
      const transport = new GitTransport({ deviceName: os.hostname() });
      await transport.init(space);
      await transport.setRemote(space, await manager!.ensureRemote(space));
    } catch { /* engine events surface the failure */ }
  }
  return result;
}

export function getManagedRoots(): ManagedRoots | null { return roots; }
```

Note for the implementer: replace the `() => {} as any ?? console.log` placeholder-looking expression in `syncSpacesEnable` with a module-level `let logFn: (m: string) => void = console.log;` assigned in `startSyncSpaces` — i.e.:

```ts
let logFn: (m: string) => void = console.log;
// in startSyncSpaces: logFn = log;
// in syncSpacesEnable: await startEngine(logFn);
```

- [x] **Step 2: Register IPC handlers in `ipc-handlers.ts`** (next to `ipcMain.handle(IPC.SYNC_GET_STATUS, ...)` at ~line 1862):

```ts
import {
  syncSpacesStatus, syncSpacesEnable, syncSpacesSyncNow, syncSpacesCreateProject, getManagedRoots,
} from './sync-spaces/service';

ipcMain.handle(IPC.SYNC_SPACES_STATUS, () => syncSpacesStatus());
ipcMain.handle(IPC.SYNC_SPACES_ENABLE, (_e, enabled: boolean) => syncSpacesEnable(!!enabled));
ipcMain.handle(IPC.SYNC_SPACES_SYNC_NOW, () => syncSpacesSyncNow());
ipcMain.handle(IPC.SYNC_SPACES_CREATE_PROJECT, (_e, name: string) => syncSpacesCreateProject(String(name ?? '')));
```

- [x] **Step 3: Merge managed projects into `FOLDERS_LIST`** — in the existing handler at `ipc-handlers.ts:767-780`, after the saved-folders array is built and before return:

```ts
    // Managed projects (spec §3) always appear in the session-creation picker,
    // deduped against saved folders by normalized path. `managed: true` lets
    // the renderer badge them.
    const managed = getManagedRoots()?.listProjects() ?? [];
    const known = new Set(folders.map((f: any) => path.resolve(f.path).toLowerCase()));
    for (const p of managed) {
      if (!known.has(path.resolve(p.path).toLowerCase())) {
        folders.push({ path: p.path, nickname: p.name, addedAt: 0, exists: true, managed: true });
      }
    }
```

- [x] **Step 4: Bootstrap in `main.ts`** — in the service-start block (~line 1432, right after `initRestoreService(...)`):

```ts
// Cross-device sync spaces (spec 2026-07-03). Roots always ensured (the
// session picker lists them); the engine runs only when the user enabled sync.
import { startSyncSpaces, stopSyncSpaces } from './sync-spaces/service';
// ... inside the app-ready block:
startSyncSpaces(
  () => {
    // Daily dated backup targets come from the SAME backend config the legacy
    // system uses — drive + icloud only (GitHub is sync, not backup; spec §11).
    const cfg = getSyncConfig();
    return (cfg?.storage_backends ?? [])
      .filter((b: any) => b.type === 'drive' || b.type === 'icloud')
      .map((b: any) => b.type === 'drive'
        ? { type: 'drive' as const, base: `${b.config?.rcloneRemote ?? 'gdrive'}:${b.config?.DRIVE_ROOT ?? 'Claude'}` }
        : { type: 'icloud' as const, base: b.config?.ICLOUD_PATH ?? '' })
      .filter((t: any) => t.base);
  },
  (m) => log('INFO', 'SyncSpaces', m),
).catch(e => log('ERROR', 'Main', 'SyncSpaces start failed', { error: String(e) }));
```

And in the quit/teardown block (~line 1452, next to `hookRelay.stop()`):

```ts
try { void stopSyncSpaces(); } catch {}
```

(`getSyncConfig` is already exported from `sync-state.ts` and imported in main.ts's orbit — check the import list at the top of main.ts and add it if absent. Match the actual `SyncConfig` field names from `sync-state.ts:111` — if the backends array is named differently there, use that name.)

- [x] **Step 5: Typecheck + run parity and full test suite**

Run: `cd desktop && npm run build 2>&1 | tail -20` (or the project's typecheck script) and `npx vitest run tests/ipc-channels.test.ts`
Expected: build clean; the Task 7 parity describe now PASSES.

- [x] **Step 6: Commit (Tasks 7+8 together — they're one parity unit)**

```bash
git add desktop/src/shared/types.ts desktop/src/main/preload.ts desktop/src/renderer/remote-shim.ts \
  desktop/src/main/remote-server.ts desktop/src/main/ipc-handlers.ts desktop/src/main/main.ts \
  desktop/src/main/sync-spaces/service.ts desktop/tests/ipc-channels.test.ts
git commit -m "feat(sync-spaces): IPC surface (syncspaces:*) + service composition root + main.ts bootstrap + picker merge"
```

---

### Task 9: Renderer — FolderSwitcher new-project + SyncPanel spaces section

**Files:**
- Modify: `desktop/src/renderer/components/FolderSwitcher.tsx`
- Modify: `desktop/src/renderer/components/SyncPanel.tsx`

- [x] **Step 1: FolderSwitcher — "New project" affordance**

In `FolderSwitcher.tsx`, next to the existing add-folder control, add a small inline form that calls the new API and refreshes the list (follow the component's existing state/refresh pattern — it already calls `window.claude.folders.list()` at line 32):

```tsx
// New managed project (spec §3): creates ~/YouCoded/Projects/<name> and it
// appears in this picker automatically via the FOLDERS_LIST merge.
const [newProjectName, setNewProjectName] = useState('');
const [projectError, setProjectError] = useState<string | null>(null);

async function createProject() {
  const name = newProjectName.trim();
  if (!name) return;
  const r = await (window as any).claude.syncSpaces.createProject(name);
  if (r?.ok) { setNewProjectName(''); setProjectError(null); await refresh(); onChange(r.path); }
  else setProjectError(r?.error ?? 'Could not create project');
}
```

```tsx
<div className="flex items-center gap-2 mt-2">
  <input
    value={newProjectName}
    onChange={e => setNewProjectName(e.target.value)}
    onKeyDown={e => { if (e.key === 'Enter') void createProject(); }}
    placeholder="New project name…"
    className="flex-1 bg-inset text-fg text-sm rounded px-2 py-1 border border-edge-dim"
  />
  <button onClick={() => void createProject()} className="text-sm px-2 py-1 rounded bg-accent text-on-accent">
    Create
  </button>
</div>
{projectError && <div className="text-xs text-red-500 mt-1">{projectError}</div>}
```

Also badge managed rows: where the folder rows render, if the entry has `managed: true`, append a plain-word badge (NO status glyphs — user preference): `<span className="text-xs text-fg-muted ml-1">synced project</span>`.

(`refresh` = whatever function the component already uses to reload `folders.list()`; reuse it, don't add a second loader.)

- [x] **Step 2: SyncPanel — "Synced spaces" section**

In `SyncPanel.tsx`, add a section below the backends list. Follow the component's existing data-fetch pattern (`window.claude.sync.getStatus()` at line 246):

```tsx
const [spacesStatus, setSpacesStatus] = useState<any>(null);
useEffect(() => {
  void (async () => setSpacesStatus(await (window as any).claude.syncSpaces.status()))();
  const off = (window as any).claude.syncSpaces.onEvent?.(() => {
    void (async () => setSpacesStatus(await (window as any).claude.syncSpaces.status()))();
  });
  return () => { off?.(); };
}, []);
```

```tsx
<section className="mt-4">
  <div className="flex items-center justify-between">
    <h3 className="text-sm font-medium text-fg">Synced spaces</h3>
    <label className="flex items-center gap-2 text-sm text-fg-2">
      <input
        type="checkbox"
        checked={!!spacesStatus?.enabled}
        onChange={async e => setSpacesStatus(await (window as any).claude.syncSpaces.enable(e.target.checked))}
      />
      Sync across devices
    </label>
  </div>
  {spacesStatus?.enabled && (
    <ul className="mt-2 space-y-1">
      {spacesStatus.spaces.map((s: any) => (
        <li key={s.id} className="text-sm text-fg-2 flex items-center justify-between">
          <span>{s.id === 'personal' ? 'Personal' : s.id.replace('project:', '')}</span>
          <span className="text-xs text-fg-muted">{s.remote ? 'connected' : 'local only'}</span>
        </li>
      ))}
    </ul>
  )}
  {spacesStatus?.recentEvents?.some((e: any) => e.type === 'conflict') && (
    <p className="text-xs text-amber-600 mt-2">
      Some files had conflicting edits — the other device's copy was kept alongside yours
      (look for "(from …)" files).
    </p>
  )}
  <button onClick={() => void (window as any).claude.syncSpaces.syncNow()} className="text-xs mt-2 underline text-fg-muted">
    Sync now
  </button>
</section>
```

- [x] **Step 3: Typecheck + full suite**

Run: `cd desktop && npm run build && npx vitest run`
Expected: clean build, all tests pass.

- [x] **Step 4: Commit**

```bash
git add desktop/src/renderer/components/FolderSwitcher.tsx desktop/src/renderer/components/SyncPanel.tsx
git commit -m "feat(sync-spaces): renderer — new-project in session picker, Synced spaces section in SyncPanel"
```

---

### Task 10: Two-device integration test + live dev verification

**Files:**
- Create: `desktop/tests/sync-spaces-two-device.test.ts`

- [x] **Step 1: Write the two-device end-to-end test (real git, fake devices)**

```ts
// desktop/tests/sync-spaces-two-device.test.ts
// Spec §15 two-instance matrix, transport+engine layers only (no Electron):
// two ManagedRoots + engines sharing one bare remote must converge.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { ManagedRoots } from '../src/main/sync-spaces/managed-roots';
import { GitTransport } from '../src/main/sync-spaces/git-transport';
import { SpaceSyncEngine } from '../src/main/sync-spaces/engine';
import type { SpaceSyncEvent } from '../src/main/sync-spaces/types';

let tmp: string;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-e2e-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

it('laptop → desktop file propagation via engines', async () => {
  const bare = path.join(tmp, 'remote.git');
  fs.mkdirSync(bare);
  execFileSync('git', ['init', '--bare', '--initial-branch=main', bare]);

  const laptop = new ManagedRoots(path.join(tmp, 'laptop'));
  const desktop = new ManagedRoots(path.join(tmp, 'desktop'));
  laptop.ensure(); desktop.ensure();
  laptop.createProject('app'); desktop.createProject('app');
  const [lSpace] = laptop.spaces().filter(s => s.kind === 'project');
  const [dSpace] = desktop.spaces().filter(s => s.kind === 'project');

  const lT = new GitTransport({ deviceName: 'Laptop' });
  const dT = new GitTransport({ deviceName: 'Desktop' });
  const events: SpaceSyncEvent[] = [];
  const lEngine = new SpaceSyncEngine(lT, { debounceMs: 200, pollMs: 0, onEvent: e => events.push(e) });
  const dEngine = new SpaceSyncEngine(dT, { debounceMs: 200, pollMs: 300, onEvent: e => events.push(e) });

  await lEngine.addSpace(lSpace); await lT.setRemote(lSpace, bare);
  await dEngine.addSpace(dSpace); await dT.setRemote(dSpace, bare);

  fs.writeFileSync(path.join(lSpace.root, 'CLAUDE.md'), '# project instructions\n');
  // Laptop watcher debounces → pushes; desktop poll loop pulls.
  await waitFor(() => fs.existsSync(path.join(dSpace.root, 'CLAUDE.md')), 20_000);
  expect(fs.readFileSync(path.join(dSpace.root, 'CLAUDE.md'), 'utf8')).toBe('# project instructions\n');

  await lEngine.stop(); await dEngine.stop();
}, 30_000);

async function waitFor(cond: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('timeout waiting for condition');
    await new Promise(r => setTimeout(r, 250));
  }
}
```

- [x] **Step 2: Run it**

Run: `npx vitest run tests/sync-spaces-two-device.test.ts`
Expected: PASS (allow up to 30s)

- [x] **Step 3: Live verification in the dev app (NEVER the built app)**

```bash
cd /c/Users/desti/youcoded-dev && bash scripts/run-dev.sh
```

In the **YouCoded Dev** window: open Settings → Sync → verify the "Synced spaces" section renders; create a project from the new-session picker ("New project name…"); confirm `~/YouCoded/Projects/<name>` exists on disk and the folder appears in the picker with the "synced project" badge. Do NOT enable sync against real GitHub in this smoke test unless a throwaway/`gh`-authed test account is acceptable — engine behavior is already covered by the two-device test.

- [x] **Step 4: Full suite + commit**

```bash
cd desktop && npx vitest run && npm run build
git add desktop/tests/sync-spaces-two-device.test.ts
git commit -m "test(sync-spaces): two-device engine convergence integration test"
```

---

### Task 11: Docs + PR

**Files:**
- Modify (workspace repo, separate commit on the `spec/cross-device-sync` branch): `docs/PITFALLS.md`

- [x] **Step 1: Add a PITFALLS section** (workspace repo — `youcoded-dev.wt/cross-device-sync/docs/PITFALLS.md`), new `## Sync Spaces (Cross-Device Sync Phase 1a)` section:

```markdown
## Sync Spaces (Cross-Device Sync Phase 1a)

- **The hidden repo uses GIT_DIR env, NOT `--separate-git-dir`.** separate-git-dir writes a `.git` FILE into the worktree, which collides with a developer's own repo in the same project folder. Every git call in `git-transport.ts` sets `GIT_DIR=<root>/.youcoded/sync.git` + `GIT_WORK_TREE=<root>`. Never "simplify" to a normal `git init`.
- **Ignores live in `$GIT_DIR/info/exclude`, attributes in `$GIT_DIR/info/attributes`.** Nothing of ours is ever written into the user's tree (no .gitignore, no .gitattributes). info/exclude is rewritten on every init — local additions (oversize exclusions) are appended after, and re-appended if lost.
- **Conflict policy is convergent: REMOTE wins the canonical filename; LOCAL content becomes a visible conflict copy** (`name (from <device>, <date>).ext`). Both devices converge to identical trees — do NOT flip to local-wins-canonical, which never converges (each device keeps its own canonical and they re-conflict forever). Pinned by the transport contract suite.
- **`tests/sync-transport-contract.ts` is the transport compatibility boundary.** Any new `SyncTransport` (SyncHub-assisted, YouCoded Cloud) must pass it unchanged. Changing the contract = changing the spec (§15) — do both in the same commit.
- **Engine is single-flight per space with a rerun flag.** A change arriving mid-sync queues exactly one follow-up. Don't add a second queue/loop on top.
- **Legacy sync-service is UNTOUCHED in 1a.** GitHub-backup migration + §12 deletions are Phase 2 (when conversations move into the personal space) — flipping backup to daily-only earlier would regress conversation backup freshness to 24h.
```

Commit (workspace repo): `git add docs/PITFALLS.md && git commit -m "docs(PITFALLS): sync-spaces Phase 1a invariants"`

- [x] **Step 2: Push the youcoded branch + open the PR**

```bash
cd /c/Users/desti/youcoded-dev/youcoded.wt/sync-spaces
git push -u origin feat/sync-spaces
gh pr create --repo itsdestin/youcoded --title "Cross-device sync Phase 1a: sync spaces foundation" --body "$(cat <<'EOF'
Implements Phase 1a of docs/superpowers/specs/2026-07-03-cross-device-sync-design.md (youcoded-dev):
managed ~/YouCoded roots, SyncTransport + GitTransport (hidden GIT_DIR repos), SpaceSyncEngine
(watch/debounce/poll, convergent conflict copies), SpaceManager (gh remote provisioning),
dated daily space backups to Drive/iCloud, syncspaces:* IPC + picker/SyncPanel UI.

SyncHub (signals) is Plan 1b — blocked on accounts Phase 1. Legacy sync-service untouched.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review (run after writing, fixed inline)

1. **Spec coverage (Phase 1 items):** managed roots §3 → Task 2/8/9; SyncTransport + git transport §5/§7 → Tasks 3; engine + conflicts + guards §8 → Tasks 1/4; polling degradation §6 → Task 4; remote provisioning §7 → Task 5; daily dated backup §11 → Task 6; status surface §13 (minimal) → Task 9; testing §15 (contract suite, two-instance) → Tasks 3/10. Deferred with reasons: SyncHub (1b), GitHub-backup migration + deletions (Phase 2), skills/memory/settings in personal space (Phase 2), StatusBar widget (polish, follow-up).
2. **Placeholder scan:** the one intentionally-flagged expression in Task 8 Step 1 has explicit replacement instructions immediately below it. No TBDs elsewhere.
3. **Type consistency:** `SyncSpace{id,kind,root}`, `PushResult{pushed,commit?,oversize}`, `PullResult{updated,conflictCopies}`, `SpaceSyncEvent`, `GitTransport(opts{deviceName,maxFileBytes?})`, `SpaceSyncEngine(transport, {debounceMs,pollMs,onEvent})`, `ManagedRoots(baseDir)` with `ensure/listProjects/createProject/spaces`, `SpaceManager{isEnabled,setEnabled,remoteFor,recordRemote,ensureRemote}` — used consistently across Tasks 1–10.

---

## Execution log & plan corrections (2026-07-08, executed via subagent-driven development)

All 11 tasks executed and merged into `feat/sync-spaces` (youcoded). The plan's given code needed the following corrections, discovered by the plan's own tests or by review — recorded here per the handoff's definition of done. Durable invariants moved to `docs/PITFALLS.md → Sync Spaces`.

1. **`info/attributes`: `* text=auto` → `* -text`** (Task 3). `text=auto` overrides `core.autocrlf=false` and CRLF-converts checkouts on Windows, failing the contract suite's own byte-fidelity assertions. Scope note 4 and the handoff's decision list said `text=auto`; byte-faithful storage (the decision's actual goal) requires `-text`.
2. **`pull()` needed an unborn-`main` adopt path** (Task 3). A fresh second device has no local `main`; `rev-list main..origin/main` exits 128 and the plan's pull bailed before applying remote content — the round-trip contract test could never pass. Fix: `checkout -B main origin/main` after fetch when local main is unborn.
3. **`merge` needs `--allow-unrelated-histories`** (Task 3, review finding). Two devices with pre-existing content in the same space (Personal on a second machine) were permanently, silently stuck. New contract test pins convergence.
4. **Conflict-copy extraction needed a Buffer path with `maxBuffer ≥ maxFileBytes`** (Task 3, review finding). The plan's `git show` via the utf8 string helper corrupted binary conflict copies and silently DROPPED copies >1MB (Node kills the child at the 1MB default maxBuffer) while `checkout --theirs` still overwrote local content. Two new contract tests pin >1MB + binary fidelity.
5. **Contract suite owns a 30s suite-scoped timeout** (`vi.setConfig`) — the plan's tests exceeded vitest's 5s default under real git on Windows, so bare `npx vitest run` (the DoD gate) failed.
6. **Engine `addSpace` must await chokidar `ready`** (Task 4). With `ignoreInitial: true`, writes landing before `ready` are silently never emitted (verified empirically) — the plan's own debounce tests timed out without the wait.
7. **Engine needs a persistent `watcher.on('error')`** (Task 4, review finding) — post-ready watcher errors otherwise crash the Electron main process on the second occurrence (unhandled EventEmitter 'error').
8. **Engine `stop()` must await in-flight sync chains** (Task 10, exposed by the two-device test's Windows teardown flake). The plan's stop() resolved with git subprocesses still running — which also raced real app-quit teardown.
9. **`repoNameForSpace` gained a lowercased-id hash suffix** (Task 5, review finding; supersedes the plan's pinned test). The plain slug mapped distinct projects ('My App' / 'My-App') to one repo (silent cross-sync) and all-symbol/non-Latin names to an empty slug.
10. **`provisionGithubRemote` recovers from already-exists via `gh repo view`** (Task 5). The per-device state file means the second device re-provisions repos the first created; the plan's version errored and sync never started on device 2. Also: injectable exec for testability, plain-language ENOENT/auth errors, atomic state writes.
11. **iCloud backup filter → shared `isIgnoredPath()`** (Task 6, review finding). The plan's hardcoded cpSync filter leaked `*.pem`/`id_rsa*`/credentials into iCloud backups that Drive excluded. Also: iCloud copy/prune switched to `fs.promises` (sync deep copies froze the main process), marker write guarded per the never-throws contract.
12. **Task 8 wiring drift vs current code:** `getSyncConfig()` is async and exposes `.backends` (not `storage_backends`); no central remote push forwarder exists, so `service.ts` takes an injected `setSyncSpacesRemoteBroadcaster` (wired in main.ts before start); enable/disable transitions are serialized through a promise chain (toggle race leaked watchers); parity test asserts the `IPC.SYNC_SPACES_*` constant form for ipc-handlers.
13. **Task 9 additions beyond the template:** SyncPanel renders the latest `error`-type event (the space-manager friendly-error contract had no reader), all async UI actions handle rejections, enable shows a "Setting up…" pending state, and Android degrades gracefully via the shim's 30s invoke timeout (no Kotlin stubs in 1a — deliberate).
14. **Env-contamination note for future full-suite runs:** inherited `YOUCODED_PORT_OFFSET`/`YOUCODED_PROFILE` from a dev-server shell make `remote-config.test.ts` / `ipc-handlers.test.ts` fail falsely — unset them in the test shell.

Smoke test (Task 10 step 3) performed against the worktree dev instance via CDP: managed roots created at boot; `syncSpaces.status()` round-trips; project creation via IPC AND via the picker UI form lands on disk and appears in the picker with the "synced project" badge; SyncPanel "Synced spaces" section renders with the toggle + Sync now (space list correctly hidden while disabled); no status glyphs. Sync was never enabled against real GitHub. Dev instance shut down and smoke artifacts removed afterward.

## Required follow-up (added 2026-07-09, decided with Destin)

**Import existing folders into sync** — NOT built in 1a, and no other phase owned it until now. The spec's §3 has been expanded with the full requirement; §17 assigns it as "Phase 1-followup," required before the sync rebuild counts as complete. Two flows: (1) convert an existing saved-folder project into a managed synced project ("Sync this project" → move-with-consent into `~/YouCoded/Projects/<name>/` + saved-folders/artifact-index/conversation path remap); (2) folder-picker import of any on-device folder into a new synced project (same consent warning: "YouCoded will move this folder into ~/YouCoded/Projects/… to activate sync. Is this okay?"). Needs its own plan; sequence before or alongside Plan 1b. Tracked in `docs/knowledge-debt.md`.
