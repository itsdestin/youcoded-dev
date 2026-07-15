---
status: shipped
---

# Sync Spaces — Import Existing Folders Implementation Plan

> **✅ SHIPPED — youcoded#109 (2026-07-09).** Live status: `docs/superpowers/2026-07-10-sync-completion-handoff.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Implementer/reviewer agents run on **Opus** (Destin's standing preference).

**Goal:** Ship spec §3's two import flows — "Sync this project" on existing saved folders, and folder-picker import — each moving the folder (with plain-language consent) into `~/YouCoded/Projects/<name>/` and remapping every path-keyed store.

**Architecture:** One main-process operation (`importProjectFolder` in a new `sync-spaces/import-project.ts`) does guards → move → store remaps; `service.ts` wraps it to initialize the sync space; one new IPC channel (`syncspaces:import-project`) with full desktop-surface parity; one shared confirm modal in the renderer feeds both flows from `FolderSwitcher`. A small `saved-folders.ts` module is extracted so main-process code outside ipc-handlers can rewrite `~/.claude/youcoded-folders.json`.

**Tech Stack:** TypeScript (Electron main + React renderer), vitest, real-fs temp-dir tests (the established sync-spaces test pattern).

**Spec:** `docs/superpowers/specs/2026-07-03-cross-device-sync-design.md` §3 (import flows — REQUIRED for completion), §17 ("Phase 1-followup"), §18 (watcher-scale guardrail). Resolves the `docs/knowledge-debt.md` entry "Sync spaces: no import path for existing folders".

---

## Worktree setup (before Task 1)

The 1a code this builds on lives on `feat/sync-spaces` (youcoded PR #107). Check whether #107 has merged before branching:

```bash
cd ~/youcoded-dev/youcoded && git fetch origin
gh pr view 107 --json state -q .state
# MERGED → branch from master:
git worktree add ../youcoded.wt/sync-import -b feat/sync-import origin/master
# OPEN → branch from the 1a branch (rebase onto master once #107 merges, then re-run npm ci):
git worktree add ../youcoded.wt/sync-import -b feat/sync-import feat/sync-spaces
cd ../youcoded.wt/sync-import/desktop && npm ci
```

Sharp edges (from the 1a execution session — all real):
- **Never run bare `npm test`** — it's vitest WATCH mode and hangs agents. Always `npx vitest run <file>` from `desktop/`.
- Full-suite runs must strip dev-server env: `env -u YOUCODED_PROFILE -u YOUCODED_PORT_OFFSET npx vitest run`.
- `tests/ipc-channels.test.ts` is the adjacency-conflict magnet — on any rebase conflict there, keep BOTH sides' describes and re-close the HEAD block before inserting ours.
- Every non-trivial edit gets a WHY comment (Destin is a non-developer — hard rule).
- Windows temp-dir cleanup around git/watcher handles: `fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })`.

## File structure

| File | Action | Responsibility |
|---|---|---|
| `desktop/src/main/saved-folders.ts` | Create | Read/write/update `~/.claude/youcoded-folders.json` (extracted from ipc-handlers so import-project can use it) |
| `desktop/tests/saved-folders.test.ts` | Create | Store round-trip + `updateFolderPath` |
| `desktop/src/main/sync-spaces/guards.ts` | Modify | Add `MAX_IMPORT_FILE_COUNT` (the §18 import guardrail) |
| `desktop/src/main/project-conversations.ts` | Modify | Export `ccProjectSlug` (currently module-private) |
| `desktop/src/main/artifacts/central-index.ts` | Modify | Add `remapProjectPath()` (path rewrite under the file lock) |
| `desktop/src/main/sync-spaces/import-project.ts` | Create | `checkImport`, `countFilesBounded`, `moveFolder`, store remaps, `importProjectFolder` orchestrator |
| `desktop/tests/sync-spaces-import.test.ts` | Create | Guards, bounded count, end-to-end move + remap in temp dirs |
| `desktop/src/main/sync-spaces/service.ts` | Modify | `syncSpacesImportProject()` — import + space init + remote |
| `desktop/src/shared/types.ts` | Modify | `SYNC_SPACES_IMPORT_PROJECT` IPC constant |
| `desktop/src/main/preload.ts` | Modify | IPC constant (inlined) + `syncSpaces.importProject()` |
| `desktop/src/renderer/remote-shim.ts` | Modify | `syncSpaces.importProject()` |
| `desktop/src/main/ipc-handlers.ts` | Modify | Use saved-folders module; managed-badge by projectsRoot prefix; register import handler |
| `desktop/src/main/remote-server.ts` | Modify | `syncspaces:import-project` WS case |
| `desktop/tests/ipc-channels.test.ts` | Modify | Add channel row to the existing syncspaces parity describe |
| `desktop/src/renderer/components/ImportProjectModal.tsx` | Create | Shared consent modal (editable name, consequence copy, busy/error/warnings states) |
| `desktop/src/renderer/components/FolderSwitcher.tsx` | Modify | Per-row "Sync this project" action (flow 1) + "Move an existing folder into sync…" (flow 2) |

**What we deliberately do NOT do (per spec + 1a decisions):**
- **Move, not copy** — a copy silently forks the user's work. The only copy is the EXDEV (cross-drive) fallback, which deletes the source afterward and *warns* if that delete fails.
- **No Android Kotlin handlers** — same as all of 1a; the shim's 30s invoke timeout + the renderer's catch carry it. Stubs come with the mobile phase.
- **No engine-level file-count guardrail** — that's Plan 1b territory. Here the §18 guardrail is a pre-import check that *blocks with a clear message* instead of hanging.
- **No Project View surface** — spec says "session picker and/or Project View"; FolderSwitcher (the session picker) plus the folder-picker flow covers both spec flows. A ProjectView hero action can be a later polish PR.

---

### Task 1: Extract the saved-folders store module

The `~/.claude/youcoded-folders.json` read/write is currently inlined inside `registerIpcHandlers` (`ipc-handlers.ts:779-800`) — unreachable from `sync-spaces/`. Extract it and add `updateFolderPath` (the remap primitive the import flow needs).

**Files:**
- Create: `desktop/src/main/saved-folders.ts`
- Test: `desktop/tests/saved-folders.test.ts`
- Modify: `desktop/src/main/ipc-handlers.ts:778-800` (delete inlined helpers, import the module)

- [x] **Step 1: Write the failing test**

```ts
// desktop/tests/saved-folders.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readFolders, writeFolders, updateFolderPath } from '../src/main/saved-folders';

let tmp: string;
let file: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-folders-'));
  file = path.join(tmp, 'youcoded-folders.json');
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('saved-folders store', () => {
  it('readFolders returns [] for a missing file', () => {
    expect(readFolders(file)).toEqual([]);
  });

  it('readFolders returns [] for corrupt JSON', () => {
    fs.writeFileSync(file, '{nope');
    expect(readFolders(file)).toEqual([]);
  });

  it('write/read round-trips entries', () => {
    const entries = [{ path: 'C:\\proj', nickname: 'Proj', addedAt: 123 }];
    writeFolders(entries, file);
    expect(readFolders(file)).toEqual(entries);
  });

  it('updateFolderPath rewrites the matching entry, preserving nickname and addedAt', () => {
    writeFolders([
      { path: path.join(tmp, 'old'), nickname: 'Budget', addedAt: 42 },
      { path: path.join(tmp, 'other'), nickname: 'Other', addedAt: 7 },
    ], file);
    const ok = updateFolderPath(path.join(tmp, 'old'), path.join(tmp, 'new'), file);
    expect(ok).toBe(true);
    const after = readFolders(file);
    expect(after[0]).toEqual({ path: path.join(tmp, 'new'), nickname: 'Budget', addedAt: 42 });
    expect(after[1].path).toBe(path.join(tmp, 'other'));
  });

  it('updateFolderPath returns false when no entry matches', () => {
    writeFolders([{ path: path.join(tmp, 'a'), nickname: 'A', addedAt: 1 }], file);
    expect(updateFolderPath(path.join(tmp, 'zzz'), path.join(tmp, 'new'), file)).toBe(false);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run (from `desktop/`): `npx vitest run tests/saved-folders.test.ts`
Expected: FAIL — `Cannot find module '../src/main/saved-folders'`

- [x] **Step 3: Write the module**

```ts
// desktop/src/main/saved-folders.ts
// The session picker's saved-folder store (~/.claude/youcoded-folders.json).
// Extracted from ipc-handlers.ts so other main-process code (the sync-spaces
// import flow rewrites an entry's path when a folder is MOVED into
// ~/YouCoded/Projects/) can share one reader/writer instead of duplicating the
// file format. The file is a bare JSON array of SavedFolder.
import fs from 'fs';
import os from 'os';
import path from 'path';

export interface SavedFolder {
  path: string;
  nickname: string;
  addedAt: number;
}

export function foldersFilePath(): string {
  return path.join(os.homedir(), '.claude', 'youcoded-folders.json');
}

export function readFolders(file: string = foldersFilePath()): SavedFolder[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeFolders(folders: SavedFolder[], file: string = foldersFilePath()): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(folders, null, 2));
}

// Case-insensitive on Windows for the same reason FOLDERS_REMOVE compares that
// way: callers hold canonical (lowercase-drive) paths while the store holds
// path.resolve (uppercase-drive) form. A case-sensitive compare silently
// fails to match on Windows.
function samePath(a: string, b: string): boolean {
  const ra = path.resolve(a);
  const rb = path.resolve(b);
  return process.platform === 'win32' ? ra.toLowerCase() === rb.toLowerCase() : ra === rb;
}

/** Rewrite one entry's path (used when a folder is moved on disk). Returns
 *  false when no entry matched — callers treat that as fine (the folder may
 *  never have been saved; the managed-projects merge will list it anyway). */
export function updateFolderPath(oldPath: string, newPath: string, file: string = foldersFilePath()): boolean {
  const folders = readFolders(file);
  const entry = folders.find(f => samePath(f.path, oldPath));
  if (!entry) return false;
  entry.path = path.resolve(newPath);
  writeFolders(folders, file);
  return true;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/saved-folders.test.ts`
Expected: PASS (5 tests)

- [x] **Step 5: Refactor ipc-handlers.ts to use the module**

In `desktop/src/main/ipc-handlers.ts`:
1. Add to the imports at the top of the file:
```ts
import { SavedFolder, readFolders, writeFolders } from './saved-folders';
```
2. Delete the inlined block at lines 778-800 (`const foldersPrefPath = …`, `interface SavedFolder`, `function readFolders()`, `function writeFolders(…)`), keeping the `// --- Folder switcher persistence ---` comment.
3. The four `IPC.FOLDERS_*` handlers below it call `readFolders()` / `writeFolders(folders)` with no arguments — the module defaults to the same `~/.claude/youcoded-folders.json` path, so the handler bodies need **no other changes**.

- [x] **Step 6: Run the folder-adjacent suites + tsc**

Run: `npx vitest run tests/saved-folders.test.ts tests/ipc-channels.test.ts && npx tsc -p tsconfig.json --noEmit`
Expected: PASS, tsc clean

- [x] **Step 7: Commit**

```bash
git add desktop/src/main/saved-folders.ts desktop/tests/saved-folders.test.ts desktop/src/main/ipc-handlers.ts
git commit -m "refactor(folders): extract saved-folders store module + updateFolderPath for the import flow"
```

---

### Task 2: Guardrail constant, ccProjectSlug export, central-index remap

Three small enablers the import module needs.

**Files:**
- Modify: `desktop/src/main/sync-spaces/guards.ts` (append after `MAX_SYNC_FILE_BYTES`, line 51)
- Modify: `desktop/src/main/project-conversations.ts:26` (export keyword)
- Modify: `desktop/src/main/artifacts/central-index.ts` (append after `listProjects`, line 72)
- Test: `desktop/tests/sync-spaces-import.test.ts` (create — first describe only)

- [x] **Step 1: Write the failing test**

```ts
// desktop/tests/sync-spaces-import.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { MAX_IMPORT_FILE_COUNT } from '../src/main/sync-spaces/guards';
import { ccProjectSlug } from '../src/main/project-conversations';
import { upsertProject, remapProjectPath, listProjects } from '../src/main/artifacts/central-index';
import { canonicalize } from '../src/shared/artifacts/canonicalize';

let tmp: string;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-import-')); });
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));

describe('import enablers', () => {
  it('MAX_IMPORT_FILE_COUNT is a sane positive bound', () => {
    expect(MAX_IMPORT_FILE_COUNT).toBeGreaterThan(1000);
  });

  it('ccProjectSlug is exported and uppercases the drive before slugifying', () => {
    // On non-Windows paths this is a plain slugify; the drive-case rule only
    // fires on the ^[a-z]: prefix.
    expect(ccProjectSlug('c:/Users/x/proj')).toBe(ccProjectSlug('C:/Users/x/proj'));
  });

  it('remapProjectPath rewrites path (and name) of the entry matching the old canonical path', async () => {
    const oldRoot = path.join(tmp, 'oldproj');
    const newRoot = path.join(tmp, 'newproj');
    await upsertProject(tmp, {
      id: 'ULID1', name: 'oldproj', path: canonicalize(oldRoot, null),
      lastIndexed: new Date().toISOString(), lastSession: null,
      contentTypes: ['artifacts'], stats: { artifactCount: 3 },
    } as any);
    await remapProjectPath(tmp, canonicalize(oldRoot, null), canonicalize(newRoot, null), 'newproj');
    const projects = await listProjects(tmp);
    expect(projects).toHaveLength(1);
    expect(projects[0].path).toBe(canonicalize(newRoot, null));
    expect(projects[0].name).toBe('newproj');
    expect(projects[0].id).toBe('ULID1');            // identity survives the move
    expect(projects[0].stats.artifactCount).toBe(3); // stats survive the move
  });

  it('remapProjectPath is a no-op when no entry matches', async () => {
    await remapProjectPath(tmp, canonicalize(path.join(tmp, 'ghost'), null), canonicalize(path.join(tmp, 'x'), null));
    expect(await listProjects(tmp)).toEqual([]);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sync-spaces-import.test.ts`
Expected: FAIL — `MAX_IMPORT_FILE_COUNT`, `ccProjectSlug`, `remapProjectPath` not exported

- [x] **Step 3: Implement all three enablers**

`desktop/src/main/sync-spaces/guards.ts` — append after the `MAX_SYNC_FILE_BYTES` block:

```ts
// Spec §18 watcher-scale guardrail, applied at IMPORT time: folders with more
// files than this are refused with a clear message instead of silently hanging
// chokidar. An engine-level guardrail (for folders that GROW past the cap
// after import) is Plan 1b scope. Count excludes DEFAULT_IGNORES (node_modules
// etc.) — those never sync, so they shouldn't disqualify a folder either.
export const MAX_IMPORT_FILE_COUNT = 20_000;
```

`desktop/src/main/project-conversations.ts:26` — change `function ccProjectSlug(` to `export function ccProjectSlug(` (the JSDoc-style comment above it stays).

`desktop/src/main/artifacts/central-index.ts` — append after `listProjects` (line 72):

```ts
/** Rewrite a project entry's path (and optionally name) when its folder is
 *  MOVED on disk (the sync-spaces import flow). Matching is by canonical path
 *  — the store key — so the entry keeps its ULID id and stats, which is what
 *  keeps artifact history attached to the project across the move. No-op when
 *  no entry matches (a never-indexed folder has nothing to remap). */
export async function remapProjectPath(
  claudeDir: string,
  oldCanonicalPath: string,
  newCanonicalPath: string,
  newName?: string
): Promise<void> {
  await mutateIndex(claudeDir, (idx) => {
    const p = idx.projects.find((x) => x.path === oldCanonicalPath);
    if (!p) return;
    p.path = newCanonicalPath;
    if (newName) p.name = newName;
  });
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sync-spaces-import.test.ts`
Expected: PASS (4 tests)

- [x] **Step 5: Run the neighbors that consume the modified files**

Run: `npx vitest run tests/sync-spaces-guards.test.ts tests/project-conversations.test.ts 2>/dev/null || npx vitest run tests/sync-spaces-guards.test.ts`
Expected: PASS (if `tests/project-conversations.test.ts` doesn't exist, the guards suite alone is fine)

- [x] **Step 6: Commit**

```bash
git add desktop/src/main/sync-spaces/guards.ts desktop/src/main/project-conversations.ts desktop/src/main/artifacts/central-index.ts desktop/tests/sync-spaces-import.test.ts
git commit -m "feat(sync-spaces): import enablers — file-count guardrail, ccProjectSlug export, central-index path remap"
```

---

### Task 3: Import checks + bounded file count

The pure-ish decision layer: every reason an import must be refused, checked BEFORE anything moves.

**Files:**
- Create: `desktop/src/main/sync-spaces/import-project.ts` (checks + counter only; move/remap arrive in Task 4)
- Test: `desktop/tests/sync-spaces-import.test.ts` (append describe)

- [x] **Step 1: Write the failing tests** — append to `tests/sync-spaces-import.test.ts`:

```ts
import { checkImport, countFilesBounded } from '../src/main/sync-spaces/import-project';

describe('countFilesBounded', () => {
  it('counts regular files and skips DEFAULT_IGNORES dirs', () => {
    const root = path.join(tmp, 'proj');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(path.join(root, 'node_modules', 'x'), { recursive: true });
    fs.writeFileSync(path.join(root, 'a.txt'), 'a');
    fs.writeFileSync(path.join(root, 'src', 'b.ts'), 'b');
    fs.writeFileSync(path.join(root, 'node_modules', 'x', 'huge.js'), 'x');
    expect(countFilesBounded(root, 100)).toBe(2);
  });

  it('stops early once the limit is exceeded', () => {
    const root = path.join(tmp, 'many');
    fs.mkdirSync(root, { recursive: true });
    for (let i = 0; i < 10; i++) fs.writeFileSync(path.join(root, `f${i}.txt`), 'x');
    expect(countFilesBounded(root, 3)).toBe(4); // limit+1: enough to know it's over
  });
});

describe('checkImport', () => {
  function ctx(over: Partial<Parameters<typeof checkImport>[0]> = {}) {
    const youcodedRoot = path.join(tmp, 'YouCoded');
    const projectsRoot = path.join(youcodedRoot, 'Projects');
    fs.mkdirSync(projectsRoot, { recursive: true });
    const source = path.join(tmp, 'mywork');
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, 'notes.md'), 'hi');
    return { sourcePath: source, name: 'mywork', projectsRoot, youcodedRoot, liveCwds: [] as string[], ...over };
  }

  it('passes for a plain folder', () => {
    expect(checkImport(ctx())).toBeNull();
  });

  it('rejects a missing source', () => {
    expect(checkImport(ctx({ sourcePath: path.join(tmp, 'ghost') }))).toMatch(/no longer exists/);
  });

  it('rejects a file source', () => {
    const f = path.join(tmp, 'file.txt');
    fs.writeFileSync(f, 'x');
    expect(checkImport(ctx({ sourcePath: f }))).toMatch(/file, not a folder/);
  });

  it('passes validateSyncName failures through verbatim', () => {
    expect(checkImport(ctx({ name: 'bad:name' }))).toMatch(/character not allowed/);
  });

  it('rejects a source already inside ~/YouCoded', () => {
    const c = ctx();
    const inside = path.join(c.youcodedRoot, 'Personal', 'notes');
    fs.mkdirSync(inside, { recursive: true });
    expect(checkImport({ ...c, sourcePath: inside })).toMatch(/already inside your YouCoded folder/);
  });

  it('rejects a source that CONTAINS ~/YouCoded (would move the destination into itself)', () => {
    const c = ctx();
    expect(checkImport({ ...c, sourcePath: tmp, name: 'everything' })).toMatch(/contains your YouCoded folder/);
  });

  it('rejects when the destination name is taken', () => {
    const c = ctx();
    fs.mkdirSync(path.join(c.projectsRoot, 'mywork'), { recursive: true });
    expect(checkImport(c)).toMatch(/already exists/);
  });

  it('rejects while a live session has its cwd inside the source', () => {
    const c = ctx();
    expect(checkImport({ ...c, liveCwds: [path.join(c.sourcePath, 'sub')] })).toMatch(/session is currently open/);
    expect(checkImport({ ...c, liveCwds: [c.sourcePath] })).toMatch(/session is currently open/);
    expect(checkImport({ ...c, liveCwds: [path.join(tmp, 'elsewhere')] })).toBeNull();
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/sync-spaces-import.test.ts`
Expected: FAIL — `Cannot find module '../src/main/sync-spaces/import-project'`

- [x] **Step 3: Implement checks + counter**

```ts
// desktop/src/main/sync-spaces/import-project.ts
// Spec §3 import flows: move an existing on-device folder into
// ~/YouCoded/Projects/<name>/ so it becomes a synced project. This module owns
// the guards, the move itself, and the remap of every store that keys on the
// folder's absolute path. Space/remote initialization stays in service.ts (it
// owns the engine singletons).
import fs from 'fs';
import os from 'os';
import path from 'path';
import { validateSyncName, isIgnoredPath, MAX_IMPORT_FILE_COUNT } from './guards';
import { canonicalize } from '../../shared/artifacts/canonicalize';

export interface ImportCheckOpts {
  sourcePath: string;
  name: string;
  projectsRoot: string;
  youcodedRoot: string;
  /** cwds of live (non-destroyed) sessions — a folder in use must not move */
  liveCwds: string[];
}

// Canonical prefix containment. canonicalize() yields forward slashes + a
// lowercased drive, so string prefix is safe here. (Byte-case differences in
// the REST of a Windows path aren't normalized — acceptable: every caller
// feeds paths from the same pickers/stores, not hand-typed variants.)
function isUnder(child: string, parent: string): boolean {
  return child === parent || child.startsWith(parent + '/');
}

/** Count real files under root, skipping DEFAULT_IGNORES (node_modules etc. —
 *  they never sync so they shouldn't disqualify the folder) and never
 *  following symlinks. Stops at limit+1: callers only need "over or not". */
export function countFilesBounded(root: string, limit: number): number {
  let count = 0;
  const walk = (dir: string, rel: string): boolean => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return true; }
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (isIgnoredPath(childRel + '/') || isIgnoredPath(childRel)) continue;
        if (!walk(path.join(dir, e.name), childRel)) return false;
      } else if (e.isFile()) {
        if (isIgnoredPath(childRel)) continue;
        count++;
        if (count > limit) return false;
      }
    }
    return true;
  };
  walk(root, '');
  return count;
}

/** Every reason an import must be refused, checked BEFORE anything moves.
 *  Returns a user-facing message, or null when the import may proceed. */
export function checkImport(opts: ImportCheckOpts): string | null {
  const { sourcePath, name, projectsRoot, youcodedRoot, liveCwds } = opts;

  let st: fs.Stats;
  try { st = fs.statSync(sourcePath); } catch { return 'That folder no longer exists'; }
  if (!st.isDirectory()) return 'That path is a file, not a folder';

  const nameErr = validateSyncName(name);
  if (nameErr) return nameErr;

  const srcCanon = canonicalize(sourcePath, null);
  const ycCanon = canonicalize(youcodedRoot, null);
  if (isUnder(srcCanon, ycCanon)) return 'This folder is already inside your YouCoded folder';
  if (isUnder(ycCanon, srcCanon)) return "This folder contains your YouCoded folder, so it can't be moved inside it";

  if (fs.existsSync(path.join(projectsRoot, name))) return 'A project with that name already exists';

  for (const cwd of liveCwds) {
    if (isUnder(canonicalize(cwd, null), srcCanon)) {
      return 'A session is currently open in this folder — close it first, then try again';
    }
  }

  const count = countFilesBounded(sourcePath, MAX_IMPORT_FILE_COUNT);
  if (count > MAX_IMPORT_FILE_COUNT) {
    return `This folder has too many files to live-sync (more than ${MAX_IMPORT_FILE_COUNT.toLocaleString()}). Move what you need into a smaller folder and import that instead.`;
  }

  return null;
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/sync-spaces-import.test.ts`
Expected: PASS (all describes so far)

Note: if the `node_modules` skip assertion fails, check `isIgnoredPath`'s dir-entry semantics in `guards.ts` (`DEFAULT_IGNORES` uses trailing-slash dir patterns) and adjust the `isIgnoredPath(childRel + '/') || isIgnoredPath(childRel)` call — the test pins the REQUIRED behavior (node_modules must be skipped), not the call shape.

- [x] **Step 5: Commit**

```bash
git add desktop/src/main/sync-spaces/import-project.ts desktop/tests/sync-spaces-import.test.ts
git commit -m "feat(sync-spaces): import guards — checkImport + bounded file count (spec §3/§18)"
```

---

### Task 4: Move + store remaps + orchestrator

The move itself, then best-effort remaps of the four path-keyed stores (saved folders, central index, sidecar manual lists, CC transcript slug dir). Remap failures degrade to WARNINGS — the move already happened; per spec, stores "must be remapped or gracefully degrade".

**Files:**
- Modify: `desktop/src/main/sync-spaces/import-project.ts` (append)
- Test: `desktop/tests/sync-spaces-import.test.ts` (append describe)

- [x] **Step 1: Write the failing tests** — append to `tests/sync-spaces-import.test.ts`:

```ts
import { importProjectFolder } from '../src/main/sync-spaces/import-project';
import { writeFolders as writeSavedFolders, readFolders as readSavedFolders } from '../src/main/saved-folders';
import { readSidecar, writeSidecar } from '../src/main/artifacts/artifact-store';
import { SIDECAR_SCHEMA_VERSION } from '../src/shared/artifacts/types';

describe('importProjectFolder', () => {
  // Full fake home: claudeDir + YouCoded roots + a source folder with content,
  // a saved-folder entry, a central-index entry, a sidecar with a manual
  // include, and a fake CC transcript slug dir.
  async function setup() {
    const claudeDir = path.join(tmp, '.claude');
    const youcodedRoot = path.join(tmp, 'YouCoded');
    const projectsRoot = path.join(youcodedRoot, 'Projects');
    fs.mkdirSync(projectsRoot, { recursive: true });
    fs.mkdirSync(claudeDir, { recursive: true });

    const source = path.join(tmp, 'budget-app');
    fs.mkdirSync(path.join(source, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(source, 'docs', 'plan.md'), 'the plan');

    const foldersFile = path.join(claudeDir, 'youcoded-folders.json');
    writeSavedFolders([{ path: source, nickname: 'Budget', addedAt: 99 }], foldersFile);

    await upsertProject(claudeDir, {
      id: 'ULIDBUDGET', name: 'budget-app', path: canonicalize(source, null),
      lastIndexed: new Date().toISOString(), lastSession: null,
      contentTypes: ['artifacts'], stats: { artifactCount: 1 },
    } as any);

    const now = new Date().toISOString();
    await writeSidecar(source, null, {
      $schema: SIDECAR_SCHEMA_VERSION, projectId: 'ULIDBUDGET', name: 'budget-app',
      createdAt: now, updatedAt: now, artifacts: [],
      manualExcludes: [], manualIncludes: [canonicalize(path.join(source, 'docs', 'plan.md'), null)],
    });

    // CC transcript dir for the OLD path (drive-case-normalized slug)
    const oldSlug = ccProjectSlug(source);
    const slugDir = path.join(claudeDir, 'projects', oldSlug);
    fs.mkdirSync(slugDir, { recursive: true });
    fs.writeFileSync(path.join(slugDir, 'session1.jsonl'), '{}');

    return { claudeDir, youcodedRoot, projectsRoot, source, foldersFile };
  }

  it('moves the folder and remaps saved folders, central index, sidecar includes, and the transcript slug dir', async () => {
    const s = await setup();
    const result = await importProjectFolder({
      sourcePath: s.source, name: 'budget-app',
      projectsRoot: s.projectsRoot, youcodedRoot: s.youcodedRoot,
      liveCwds: [], claudeDir: s.claudeDir,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const dest = path.join(s.projectsRoot, 'budget-app');
    expect(result.path).toBe(dest);
    expect(result.warnings).toEqual([]);

    // folder moved (content intact, source gone)
    expect(fs.readFileSync(path.join(dest, 'docs', 'plan.md'), 'utf8')).toBe('the plan');
    expect(fs.existsSync(s.source)).toBe(false);

    // saved-folders entry rewritten, nickname kept
    const folders = readSavedFolders(s.foldersFile);
    expect(folders[0].nickname).toBe('Budget');
    expect(path.resolve(folders[0].path)).toBe(path.resolve(dest));

    // central index remapped, identity kept
    const projects = await listProjects(s.claudeDir);
    expect(projects[0].id).toBe('ULIDBUDGET');
    expect(projects[0].path).toBe(canonicalize(dest, null));

    // sidecar traveled with the folder; manual include re-pointed inside it
    const sidecar = await readSidecar(dest);
    expect(sidecar && !('corrupted' in sidecar) && sidecar.manualIncludes[0])
      .toBe(canonicalize(path.join(dest, 'docs', 'plan.md'), null));

    // transcript slug dir renamed to the new path's slug
    expect(fs.existsSync(path.join(s.claudeDir, 'projects', ccProjectSlug(s.source)))).toBe(false);
    expect(fs.readFileSync(path.join(s.claudeDir, 'projects', ccProjectSlug(dest), 'session1.jsonl'), 'utf8')).toBe('{}');
  });

  it('refuses (ok:false) when a guard fails, without touching the source', async () => {
    const s = await setup();
    const result = await importProjectFolder({
      sourcePath: s.source, name: 'budget-app',
      projectsRoot: s.projectsRoot, youcodedRoot: s.youcodedRoot,
      liveCwds: [s.source], claudeDir: s.claudeDir,
    });
    expect(result.ok).toBe(false);
    expect(fs.existsSync(s.source)).toBe(true);
  });

  it('merges into an existing slug dir instead of failing when the new slug already exists', async () => {
    const s = await setup();
    const dest = path.join(s.projectsRoot, 'budget-app');
    const newSlugDir = path.join(s.claudeDir, 'projects', ccProjectSlug(dest));
    fs.mkdirSync(newSlugDir, { recursive: true });
    fs.writeFileSync(path.join(newSlugDir, 'existing.jsonl'), '{}');
    const result = await importProjectFolder({
      sourcePath: s.source, name: 'budget-app',
      projectsRoot: s.projectsRoot, youcodedRoot: s.youcodedRoot,
      liveCwds: [], claudeDir: s.claudeDir,
    });
    expect(result.ok).toBe(true);
    expect(fs.existsSync(path.join(newSlugDir, 'session1.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(newSlugDir, 'existing.jsonl'))).toBe(true);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/sync-spaces-import.test.ts`
Expected: FAIL — `importProjectFolder` not exported

- [x] **Step 3: Implement move + remaps + orchestrator** — append to `import-project.ts`:

```ts
import { foldersFilePath, updateFolderPath } from '../saved-folders';
import { remapProjectPath } from '../artifacts/central-index';
import { readSidecar, writeSidecar } from '../artifacts/artifact-store';
import { ccProjectSlug } from '../project-conversations';

export type ImportResult =
  | { ok: true; path: string; warnings: string[] }
  | { ok: false; error: string };

export interface ImportOpts extends ImportCheckOpts {
  /** Injectable for tests; defaults to ~/.claude */
  claudeDir?: string;
}

/** Move src → dest. rename when possible; EXDEV (another drive) falls back to
 *  copy-then-delete — still MOVE semantics per spec §3 (a surviving copy at
 *  the old path silently forks the user's work), so a failed source delete is
 *  surfaced as a warning, never ignored. Returns warnings; throws with a
 *  user-facing message on a blocked move (Windows EBUSY/EPERM when another
 *  process holds the folder). */
function moveFolder(src: string, dest: string): string[] {
  try {
    fs.renameSync(src, dest);
    return [];
  } catch (e: any) {
    if (e?.code === 'EXDEV') {
      fs.cpSync(src, dest, { recursive: true });
      try {
        fs.rmSync(src, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
        return [];
      } catch {
        return [`The folder was copied to its new home, but the original at ${src} could not be fully removed — delete it manually so you don't keep editing the old copy.`];
      }
    }
    if (e?.code === 'EBUSY' || e?.code === 'EPERM' || e?.code === 'EACCES') {
      throw new Error('Another program is using this folder (an open terminal, editor, or file). Close it and try again.');
    }
    throw e;
  }
}

/** The sidecar rides inside the folder, so after the move it's already at the
 *  new root — but manualIncludes/manualExcludes hold canonical ABSOLUTE paths
 *  (PITFALLS → Artifact Viewer), which still point at the old location.
 *  Rewrite the old-root prefix. */
async function remapSidecarManualPaths(newRoot: string, oldRoot: string): Promise<void> {
  const cur = await readSidecar(newRoot);
  if (cur === null || 'corrupted' in cur) return;
  const oldCanon = canonicalize(oldRoot, null);
  const newCanon = canonicalize(newRoot, null);
  const remap = (p: string) => (isUnder(p, oldCanon) ? newCanon + p.slice(oldCanon.length) : p);
  const nextIncludes = cur.manualIncludes.map(remap);
  const nextExcludes = cur.manualExcludes.map(remap);
  if (JSON.stringify(nextIncludes) === JSON.stringify(cur.manualIncludes) &&
      JSON.stringify(nextExcludes) === JSON.stringify(cur.manualExcludes)) return;
  const expected = cur.updatedAt;
  cur.manualIncludes = nextIncludes;
  cur.manualExcludes = nextExcludes;
  cur.updatedAt = new Date().toISOString();
  await writeSidecar(newRoot, expected, cur);
}

/** CC's transcript dirs are keyed by a slug DERIVED from the cwd
 *  (~/.claude/projects/<slug>/), not stored — so a move silently orphans every
 *  past conversation unless the dir is renamed to the new path's slug. When
 *  the new slug dir already exists (rare), merge file-by-file, never clobber. */
function remapTranscriptDir(oldPath: string, newPath: string, claudeDir: string): void {
  const projectsDir = path.join(claudeDir, 'projects');
  const oldDir = path.join(projectsDir, ccProjectSlug(oldPath));
  const newDir = path.join(projectsDir, ccProjectSlug(newPath));
  if (!fs.existsSync(oldDir)) return; // no conversations for this folder — nothing to remap
  if (!fs.existsSync(newDir)) {
    fs.renameSync(oldDir, newDir);
    return;
  }
  for (const entry of fs.readdirSync(oldDir)) {
    const from = path.join(oldDir, entry);
    const to = path.join(newDir, entry);
    if (!fs.existsSync(to)) fs.renameSync(from, to);
  }
  try { fs.rmdirSync(oldDir); } catch { /* leftovers (all-duplicate names) — harmless */ }
}

/** Guards → move → best-effort remaps. Remap failures become warnings, not
 *  errors: the folder has already moved, and each store degrades gracefully
 *  (spec §3) — e.g. a missed index remap only means artifact history restarts. */
export async function importProjectFolder(opts: ImportOpts): Promise<ImportResult> {
  const claudeDir = opts.claudeDir ?? path.join(os.homedir(), '.claude');
  const err = checkImport(opts);
  if (err) return { ok: false, error: err };

  const dest = path.join(opts.projectsRoot, opts.name);
  let warnings: string[];
  try {
    warnings = moveFolder(opts.sourcePath, dest);
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }

  const foldersFile = path.join(claudeDir, 'youcoded-folders.json');
  try { updateFolderPath(opts.sourcePath, dest, foldersFile); }
  catch { warnings.push('The saved-folders list could not be updated — remove the old entry from the picker manually.'); }

  try { await remapProjectPath(claudeDir, canonicalize(opts.sourcePath, null), canonicalize(dest, null), opts.name); }
  catch { warnings.push('The artifact index could not be updated — artifact history may restart for this project.'); }

  try { await remapSidecarManualPaths(dest, opts.sourcePath); }
  catch { warnings.push('Manually added files in the artifact drawer may need re-adding.'); }

  try { remapTranscriptDir(opts.sourcePath, dest, claudeDir); }
  catch { warnings.push('Past conversations could not be re-linked to the new location.'); }

  return { ok: true, path: dest, warnings };
}
```

Also update the module's existing import of `foldersFilePath` if unused — the code above only uses `updateFolderPath` with an explicit file arg; drop `foldersFilePath` from the import list if tsc flags it.

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/sync-spaces-import.test.ts`
Expected: PASS (all import describes)

- [x] **Step 5: Run tsc**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: clean

- [x] **Step 6: Commit**

```bash
git add desktop/src/main/sync-spaces/import-project.ts desktop/tests/sync-spaces-import.test.ts
git commit -m "feat(sync-spaces): importProjectFolder — move-with-guards + remap of all path-keyed stores"
```

---

### Task 5: Service wiring + IPC surface (full desktop parity)

`syncSpacesImportProject` in service.ts (import + space init + remote), then the new channel across shared/types, preload, remote-shim, ipc-handlers, remote-server, and the parity test.

**Files:**
- Modify: `desktop/src/main/sync-spaces/service.ts` (append after `syncSpacesCreateProject`, line 147)
- Modify: `desktop/src/shared/types.ts:770` (after `SYNC_SPACES_CREATE_PROJECT`)
- Modify: `desktop/src/main/preload.ts` (~line 660 syncSpaces block + ~line 769 inlined IPC object)
- Modify: `desktop/src/renderer/remote-shim.ts` (~line 1026 syncSpaces block)
- Modify: `desktop/src/main/ipc-handlers.ts` (~line 1929, after the create-project handler)
- Modify: `desktop/src/main/remote-server.ts` (~line 1132, after the create-project case)
- Modify: `desktop/tests/ipc-channels.test.ts:499` (add channel row)

- [x] **Step 1: Add the parity test row first (failing test)**

In `desktop/tests/ipc-channels.test.ts`, in the `syncspaces:* channel parity` describe, extend the channels array (line 496-500):

```ts
  const channels: Array<[string, string]> = [
    ['syncspaces:status', 'IPC.SYNC_SPACES_STATUS'],
    ['syncspaces:enable', 'IPC.SYNC_SPACES_ENABLE'],
    ['syncspaces:sync-now', 'IPC.SYNC_SPACES_SYNC_NOW'],
    ['syncspaces:create-project', 'IPC.SYNC_SPACES_CREATE_PROJECT'],
    ['syncspaces:import-project', 'IPC.SYNC_SPACES_IMPORT_PROJECT'],
  ];
```

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ipc-channels.test.ts`
Expected: FAIL — `syncspaces:import-project present in preload, remote-shim, ipc-handlers, remote-server`

- [x] **Step 3: service.ts — the import entry point**

Append after `syncSpacesCreateProject` (service.ts line 147), plus add the import at the top of the file (`import { importProjectFolder } from './import-project';`):

```ts
/** Spec §3 import flows: move an existing folder into ~/YouCoded/Projects/ and
 *  make it a synced space. liveCwds comes from the caller (ipc-handlers /
 *  remote-server own the SessionManager) so this module stays free of a
 *  session-manager import. Unlike createProject, an imported folder HAS
 *  content — kick an immediate syncSpace instead of waiting for the poll. */
export async function syncSpacesImportProject(sourcePath: string, name: string, liveCwds: string[]) {
  if (!roots) return { ok: false as const, error: 'Sync is still starting up — try again in a moment' };
  const result = await importProjectFolder({
    sourcePath, name, liveCwds,
    projectsRoot: roots.projectsRoot,
    youcodedRoot: roots.youcodedRoot,
  });
  if (result.ok && engine) {
    const space = roots.spaces().find(s => s.id === `project:${name}`);
    if (space) {
      try {
        await engine.addSpace(space);
        const transport = new GitTransport({ deviceName: os.hostname() });
        await transport.init(space);
        await transport.setRemote(space, await manager!.ensureRemote(space));
        void engine.syncSpace(space); // imported content should reach the remote now, not at the next poll
      } catch { /* engine error events surface the failure (same contract as createProject) */ }
    }
  }
  return result;
}
```

- [x] **Step 4: IPC constant in both homes**

`desktop/src/shared/types.ts` after line 769 (`SYNC_SPACES_CREATE_PROJECT`):
```ts
  SYNC_SPACES_IMPORT_PROJECT: 'syncspaces:import-project',
```
`desktop/src/main/preload.ts` in the inlined `IPC` object (after its `SYNC_SPACES_CREATE_PROJECT` line):
```ts
  SYNC_SPACES_IMPORT_PROJECT: 'syncspaces:import-project',
```

- [x] **Step 5: preload + remote-shim methods**

`preload.ts` syncSpaces block, after `createProject`:
```ts
    // Spec §3 import: move an existing folder into ~/YouCoded/Projects/<name>.
    importProject: (sourcePath: string, name: string) =>
      ipcRenderer.invoke(IPC.SYNC_SPACES_IMPORT_PROJECT, sourcePath, name),
```

`remote-shim.ts` syncSpaces block, after `createProject`:
```ts
      importProject: (sourcePath: string, name: string) =>
        invoke('syncspaces:import-project', { sourcePath, name }),
```

- [x] **Step 6: ipc-handlers + remote-server handlers**

`ipc-handlers.ts`, after the `SYNC_SPACES_CREATE_PROJECT` handler (line 1929). Add `syncSpacesImportProject` to the existing sync-spaces import list at line 27:

```ts
  ipcMain.handle(IPC.SYNC_SPACES_IMPORT_PROJECT, (_e, sourcePath: string, name: string) =>
    // Live-cwd guard input: the folder must not move under a running session.
    syncSpacesImportProject(String(sourcePath ?? ''), String(name ?? ''),
      sessionManager.listSessions().filter(s => s.status !== 'destroyed').map(s => s.cwd)));
```

`remote-server.ts`, after the `syncspaces:create-project` case (line 1132); add `syncSpacesImportProject` to its existing sync-spaces import:

```ts
      case 'syncspaces:import-project': {
        this.respond(client.ws, type, id, await syncSpacesImportProject(
          String(payload?.sourcePath ?? ''), String(payload?.name ?? ''),
          this.sessionManager.listSessions().filter(s => s.status !== 'destroyed').map(s => s.cwd)));
        break;
      }
```

- [x] **Step 7: Managed-badge fix in FOLDERS_LIST**

After import, the saved-folder entry points at the new managed path, so the existing merge (which only tags SYNTHESIZED rows `managed: true`) would show the row without its "synced project" badge. Tag saved entries by projectsRoot prefix instead. In `ipc-handlers.ts` `FOLDERS_LIST` (the `result` mapping around line 811):

```ts
    // A saved folder that lives under ~/YouCoded/Projects/ IS a managed sync
    // project (the import flow rewrites saved entries to their new managed
    // path) — badge it like the synthesized managed rows below.
    const projectsRoot = getManagedRoots()?.projectsRoot;
    const projectsPrefix = projectsRoot ? path.resolve(projectsRoot).toLowerCase() + path.sep : null;
    const result: any[] = folders.map(f => ({
      ...f,
      exists: fs.existsSync(f.path),
      ...(projectsPrefix && path.resolve(f.path).toLowerCase().startsWith(projectsPrefix)
        ? { managed: true } : {}),
    }));
```

- [x] **Step 8: Run parity + service tests + tsc**

Run: `npx vitest run tests/ipc-channels.test.ts tests/sync-spaces-service.test.ts && npx tsc -p tsconfig.json --noEmit`
Expected: PASS, tsc clean. (`sync-spaces-service.test.ts` mocks every service dep via `vi.mock` — if the new `./import-project` import breaks module resolution there, add `vi.mock('../src/main/sync-spaces/import-project', () => ({ importProjectFolder: vi.fn() }))` alongside the existing mocks.)

- [x] **Step 9: Commit**

```bash
git add desktop/src/main/sync-spaces/service.ts desktop/src/shared/types.ts desktop/src/main/preload.ts desktop/src/renderer/remote-shim.ts desktop/src/main/ipc-handlers.ts desktop/src/main/remote-server.ts desktop/tests/ipc-channels.test.ts
git commit -m "feat(sync-spaces): syncspaces:import-project IPC across all desktop surfaces + managed badge by projectsRoot prefix"
```

---

### Task 6: Renderer — consent modal + both entry points in FolderSwitcher

One shared modal (`ImportProjectModal`) with the plain-language move warning, an editable name, busy/error states, and a warnings summary on success. Flow 1: hover action on non-managed saved-folder rows. Flow 2: "Move an existing folder into sync…" under the new-project form (native picker).

Consequence-gated UI rules apply (Destin's standing preference): plain words, explicit warning about what moves, no status glyphs.

**Files:**
- Create: `desktop/src/renderer/components/ImportProjectModal.tsx`
- Modify: `desktop/src/renderer/components/FolderSwitcher.tsx`

- [x] **Step 1: Create the modal**

```tsx
// desktop/src/renderer/components/ImportProjectModal.tsx
// Consent + name-confirm modal shared by BOTH spec-§3 import flows (row action
// and folder-picker). The move is consequence-gated: the copy spells out that
// the folder itself MOVES (old path stops existing) before anything happens.
import React, { useState, useCallback } from 'react';
import { Scrim, OverlayPanel } from './overlays/Overlay';
import { useEscClose } from '../hooks/use-esc-close';

interface Props {
  sourcePath: string;
  defaultName: string;
  onClose: () => void;
  /** Called with the new project path after a successful import */
  onDone: (newPath: string) => void;
}

export default function ImportProjectModal({ sourcePath, defaultName, onClose, onDone }: Props) {
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Post-success state: when the move produced warnings we keep the modal open
  // to show them (closing instantly would hide "delete the old copy manually").
  const [doneWarnings, setDoneWarnings] = useState<string[] | null>(null);
  const [donePath, setDonePath] = useState<string | null>(null);

  useEscClose(true, onClose);

  const confirm = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    // try/catch: on Android the shim has no syncspaces handlers and rejects
    // after 30s — surface inline, never as an unhandled rejection.
    try {
      const r = await (window as any).claude.syncSpaces.importProject(sourcePath, trimmed);
      if (r?.ok) {
        if (r.warnings?.length) { setDoneWarnings(r.warnings); setDonePath(r.path); }
        else onDone(r.path);
      } else {
        setError(r?.error ?? 'Could not move the folder');
      }
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setBusy(false);
    }
  }, [name, busy, sourcePath, onDone]);

  return (
    <>
      <Scrim layer={2} onClick={busy ? undefined : onClose} />
      <OverlayPanel layer={2} className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[26rem] max-w-[calc(100vw-2rem)] p-4">
        {doneWarnings ? (
          <>
            <div className="text-sm font-medium text-fg">Folder moved</div>
            <div className="mt-2 text-xs text-fg-2">The folder now lives at <span className="text-fg break-all">{donePath}</span> and will sync across your devices. A couple of things need your attention:</div>
            <ul className="mt-2 space-y-1 text-xs text-fg-dim list-disc pl-4">
              {doneWarnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
            <div className="mt-4 flex justify-end">
              <button onClick={() => onDone(donePath!)} className="text-sm px-3 py-1 rounded bg-accent text-on-accent">Done</button>
            </div>
          </>
        ) : (
          <>
            <div className="text-sm font-medium text-fg">Move and sync this folder?</div>
            <div className="mt-2 text-xs text-fg-2">
              YouCoded will <span className="text-fg">move</span> <span className="break-all">{sourcePath}</span> to{' '}
              <span className="text-fg break-all">~/YouCoded/Projects/{name.trim() || '…'}/</span> so it can sync across your devices.
            </div>
            <div className="mt-1 text-xs text-fg-dim">
              The folder itself moves — anything pointing at the old location (shortcuts, open terminals, editors) will need the new path.
            </div>
            <label className="block mt-3 text-[10px] uppercase tracking-wide text-fg-muted">Project name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void confirm(); }}
              className="mt-1 w-full bg-inset text-fg text-sm rounded px-2 py-1 border border-edge-dim focus:border-accent outline-none"
              autoFocus
            />
            {error && <div className="mt-2 text-xs text-red-500">{error}</div>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={onClose} disabled={busy} className="text-sm px-3 py-1 rounded text-fg-dim hover:text-fg hover:bg-inset transition-colors">Cancel</button>
              <button onClick={() => void confirm()} disabled={busy || !name.trim()} className="text-sm px-3 py-1 rounded bg-accent text-on-accent disabled:opacity-50">
                {busy ? 'Moving…' : 'Move and sync'}
              </button>
            </div>
          </>
        )}
      </OverlayPanel>
    </>
  );
}
```

- [x] **Step 2: Wire both flows into FolderSwitcher**

In `desktop/src/renderer/components/FolderSwitcher.tsx`:

1. Import the modal (top of file):
```ts
import ImportProjectModal from './ImportProjectModal';
```

2. Add state after the `projectError` state (line 36):
```ts
  // Import-existing-folder flow (spec §3): which folder the consent modal is
  // showing for. Set by the row action (flow 1) or the picker button (flow 2).
  const [importTarget, setImportTarget] = useState<{ sourcePath: string; defaultName: string } | null>(null);
```

3. Add handlers after `createProject` (line 108):
```ts
  const startImportForRow = useCallback((e: React.MouseEvent, folder: SavedFolder) => {
    e.stopPropagation();
    const base = folder.path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? folder.nickname;
    setImportTarget({ sourcePath: folder.path, defaultName: base });
  }, []);

  const startImportFromPicker = useCallback(async () => {
    try {
      const folder = await (window as any).claude.dialog.openFolder();
      if (!folder) return;
      const base = folder.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? '';
      setImportTarget({ sourcePath: folder, defaultName: base });
    } catch {}
  }, []);

  const handleImportDone = useCallback(async (newPath: string) => {
    setImportTarget(null);
    await load();
    // Select the project at its new home (also covers "the moved folder was
    // the current selection" — the old path no longer exists).
    onChange(newPath);
    setOpen(false);
  }, [load, onChange]);
```

4. In the per-row hover-actions cluster (the `{!isEditing && (` block, before the Rename button at line 243), add a "Sync this project" action for rows that exist and aren't already managed:
```tsx
                        {/* Sync this project (spec §3 flow 1) — move into ~/YouCoded/Projects/ */}
                        {f.exists && !f.managed && (
                          <button
                            onClick={(e) => startImportForRow(e, f)}
                            className="w-5 h-5 flex items-center justify-center rounded-sm text-fg-faint hover:text-fg hover:bg-inset transition-colors"
                            title="Sync this project (moves it into ~/YouCoded/Projects/)"
                          >
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M5.5 9a7.5 7.5 0 0113-2.5M18.5 15a7.5 7.5 0 01-13 2.5" />
                            </svg>
                          </button>
                        )}
```

5. Under the new-project input block (after the `projectError` line, still inside the `px-2.5 pb-2` div), add flow 2's entry:
```tsx
              {/* Spec §3 flow 2: import any on-device folder via the native picker. */}
              <button
                onClick={() => void startImportFromPicker()}
                className="mt-1.5 w-full text-left text-[11px] text-fg-dim hover:text-fg transition-colors"
              >
                or move an existing folder into sync…
              </button>
```

6. At the very end of the component's JSX, OUTSIDE the `{open && (…)}` dropdown conditional (so the modal survives the dropdown's outside-click close), before the closing `</div>`:
```tsx
      {importTarget && (
        <ImportProjectModal
          sourcePath={importTarget.sourcePath}
          defaultName={importTarget.defaultName}
          onClose={() => setImportTarget(null)}
          onDone={(p) => void handleImportDone(p)}
        />
      )}
```

- [x] **Step 3: tsc + build**

Run: `npx tsc -p tsconfig.json --noEmit && npm run build`
Expected: clean

- [x] **Step 4: Commit**

```bash
git add desktop/src/renderer/components/ImportProjectModal.tsx desktop/src/renderer/components/FolderSwitcher.tsx
git commit -m "feat(sync-spaces): import UI — consent modal + row action + picker flow in FolderSwitcher"
```

---

### Task 7: Full verification, live smoke, docs, PR

- [x] **Step 1: Full suite + build (env-stripped)**

From `desktop/`:
```bash
env -u YOUCODED_PROFILE -u YOUCODED_PORT_OFFSET npx vitest run
npx tsc -p tsconfig.json --noEmit
npm run build
```
Expected: ALL green (transport contract tests take 45-85s total — normal), tsc + build clean.

- [x] **Step 2: Live dev-window smoke test (both flows)**

Per the handoff's worktree-smoke recipe (run-dev.sh cds into the MAIN checkout — replicate manually from the worktree): export `YOUCODED_PORT_OFFSET=50 YOUCODED_PROFILE=dev`, unset the CC session markers (list in `scripts/run-dev.sh`), start `npm run dev:renderer` in the background, `npx wait-on http://localhost:5223`, then `npx tsc -p tsconfig.json && node -e "require('fs').cpSync('src/main/pty-worker.js','dist/main/pty-worker.js')" && npx electron . --remote-debugging-port=9333` in the background. Probe via CDP (copy `scripts/cdp-eval.mjs` INTO `desktop/` first). **Never touch the live built app.**

Verify (Definition of Done item 3 from the handoff):
1. Create a scratch folder with a file (e.g. `~/yc-import-smoke/hello.md`), add it via "Browse for folder".
2. **Flow 1:** hover its row → "Sync this project" → confirm modal shows the move warning → confirm → folder lands at `~/YouCoded/Projects/yc-import-smoke/` with content, row shows the "synced project" badge, selection follows the new path.
3. **Flow 2:** create another scratch folder; use "or move an existing folder into sync…" → picker → modal → confirm → same checks.
4. **Live-session guard:** open a session with a third scratch folder as cwd, then try to import it — the modal must show "A session is currently open in this folder…".
5. Artifacts/conversations resolution: if a scratch folder had a conversation, confirm it still lists under the project after the move (transcript slug remap).
6. Clean up: kill the electron + node PIDs directly (TaskStop on the shell does not kill Windows children), confirm ports 5223/9333 freed, delete scratch folders and their `~/YouCoded/Projects/` copies, remove picker entries.

- [x] **Step 3: Docs**

In the **workspace repo** (`youcoded-dev`, branch `spec/cross-device-sync` or master if already merged):
1. `docs/PITFALLS.md → Sync Spaces`: append invariants learned, at minimum:
   - Import MOVES the folder; the EXDEV fallback is copy-then-delete with a warning on failed delete — never leave two silent live copies.
   - The CC transcript slug dir must be renamed on move (`remapTranscriptDir`) — the slug is derived from cwd, not stored, so conversations orphan silently otherwise.
   - `FOLDERS_LIST` badges managed rows by projectsRoot PREFIX (not just the synthesized merge) — imported projects keep their saved entry.
   - Plus anything new the execution surfaces.
2. `docs/knowledge-debt.md`: DELETE the "Sync spaces: no import path for existing folders" entry (resolved).
3. Check the plan checkboxes in this file as tasks complete; append an execution log + corrections section (same format as the 1a plan).
4. Commit + push the docs branch.

- [x] **Step 4: PR**

```bash
git push -u origin feat/sync-import
gh pr create --repo itsdestin/youcoded --title "Sync spaces: import existing folders (spec §3 flows 1+2)" --body "…summary, test plan, link to spec §3 + this plan…"
```
If #107 is still open, note in the PR body that this branch is stacked on `feat/sync-spaces` and set the PR base to `feat/sync-spaces` (`--base feat/sync-spaces`); retarget to master after #107 merges.

---

## Self-review (run after writing, fixed inline)

- Spec §3 coverage: flow 1 (row action, Task 6) ✓; flow 2 (picker, Task 6) ✓; move-not-copy ✓ (Task 4 moveFolder); consent wording ✓ (modal copy); `validateSyncName` ✓ (checkImport); git-repo-inside is fine ✓ (nothing special needed — GIT_DIR transport + `.git/` in DEFAULT_IGNORES, no code change required); §18 guardrail ✓ (MAX_IMPORT_FILE_COUNT block); live-session block ✓; EBUSY/EPERM message ✓; store remap enumeration ✓ (saved-folders, central index, sidecar manual lists, transcript slug dir; conversation-index + topics are sessionId-keyed and need nothing — verified in exploration).
- Encyclopedia migration + GitHub-backup upgrade from §3 are NOT here — they belong to Phase 2 per §17 (conversations/backup migration); the knowledge-debt entry scoped to the two folder flows only.
- Type consistency: `ImportResult`/`ImportOpts`/`ImportCheckOpts` used consistently across Tasks 3-5; `syncSpacesImportProject(sourcePath, name, liveCwds)` matches both handler call sites; modal calls `syncSpaces.importProject(sourcePath, name)` matching preload/shim.

---

## Execution log & plan corrections (2026-07-09, executed via subagent-driven development)

All 7 tasks executed on youcoded branch `feat/sync-import` (worktree `youcoded.wt/sync-import`, based on `feat/sync-spaces` since PR #107 was still open). Fresh Opus implementer per task + spec-compliance review + code-quality review; the loops caught **8 real defects** in the plan's own code. Corrections, in commit order:

1. **`countFilesBounded` needed depth (100) + wall-clock (2s) bounds** (Task 3 quality review). `isSymbolicLink()` does not detect NTFS junctions; a junction cycle containing no files never trips the file-count limit → unbounded recursion → main-process stack overflow. Depth/time exhaustion returns the OVER-limit signal (fail closed), not a partial count. Commit `7698e28`.
2. **`manualIncludes` is `ManualInclude[]` (objects), not `string[]`** (Task 4 spec review). The plan's remap code and test both used bare strings — the test exercised a branch that never runs in production. Object-only remap preserving `addedAt`/`addedBy`; test uses the real shape. Commit `d446560`. (Root cause of the slip: `desktop/tests/**` is not covered by `tsc -p tsconfig.json` — a workspace-level improvement candidate.)
3. **EXDEV copy failure left a partial dest that permanently blocked retries** (Task 4 quality review) — checkImport's "already exists" guard then refused every retry. cpSync wrapped; partial dest cleaned up best-effort; friendly "failed partway / nothing was lost" error. Commit `e4d3df9`.
4. **Sidecar CAS miss was silently ignored** — now throws internally so the orchestrator converts it to the standard warning (every remap failure must surface). Same commit.
5. **`writeFolders` atomic write used a fixed `.tmp` name** — two concurrent writers (dev + built app) would interleave into one tmp file. Unique per-writer tmp + cleanup-on-rename-failure. Same commit. (The atomic write itself was a Task 1 review follow-up — the plan's original was a plain writeFileSync.)
6. **Rename-over-existing needed an explicit EEXIST/ENOTEMPTY branch** — the TOCTOU dest-collision otherwise reported "another program is using this folder." Same commit.
7. **The EXDEV branch needed an `existsSync(dest)` re-check** (Task 4 quality re-review) — rename(2) reports EXDEV before dest-existence, so a dest created in the check→move window would be silently MERGED into by cpSync and then DELETED by the failure cleanup. Applied inline by the coordinator (corrections had accumulated). Commit `168f0120`.
8. **Modal ESC bypassed the busy guard** (Task 6 quality review) — ESC mid-move unmounted the modal, setState fired on an unmounted component, and the folder list never reconciled. `useEscClose(!busy, dismiss)` + cancelledRef + post-success dismissals all route to `onDone(path)`; a11y roles added (dialog/alert, matching RatingSubmitModal); submit latch via inFlightRef. Commit `d7546dc`.

Also folded in from Task 2's quality review: `remapProjectPath` drops any stale index entry already sitting at the destination path (two entries sharing one canonical path shadow each other and detach artifact history).

**Verification:** full env-stripped suite 1309 passed / 34 skipped / 0 failed; tsc + `npm run build` clean. Live dev-window smoke (manual worktree replication of run-dev.sh, CDP-driven): flow 1 driven through the REAL UI (row action → consent modal with correct copy + prefilled name → confirm → folder moved to `~/YouCoded/Projects/`, picker entry rewritten with the "synced project" badge, no duplicate rows); live-session guard verified end-to-end (session open in folder → exact refusal message; import succeeds after session destroy); IPC-level import verified for a second folder; flow 2's picker button renders (its unique step — the native OS folder dialog — can't be driven headlessly; it feeds the same modal + IPC path as flow 1). Smoke artifacts removed, dev processes killed, ports 5223/9333 freed.

**Follow-ups (non-blocking, noted by reviewers):** migrate `remote-server.ts`'s four inline `youcoded-folders.json` cases to the `saved-folders.ts` module; consider typechecking `desktop/tests/**`; `project-context.ts` still carries a private duplicate of `ccProjectSlug`; Windows dir-rename-onto-existing surfaces as EPERM so that TOCTOU case shows the folder-in-use message (inherent ambiguity); time-cap exhaustion in `countFilesBounded` reuses the "too many files" message wording.
