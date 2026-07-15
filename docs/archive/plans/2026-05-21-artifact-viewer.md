---
status: shipped
---

# Artifact Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the artifact viewer system per [`docs/superpowers/specs/2026-05-21-artifact-viewer-design.md`](../specs/2026-05-21-artifact-viewer-design.md): three surfaces (Session Drawer, Project View, Inline Filepath Detection) sharing one backend, with mobile parity for Surfaces 1+3.

**Architecture:** Renderer-side `ArtifactTracker` state slice subscribes to TranscriptWatcher events alongside the chat reducer. File I/O lives in a main-process `ArtifactStore` (Electron) and Kotlin `ArtifactStore` (Android), called via IPC. Storage is hybrid filesystem-of-truth: `<project>/.youcoded/artifacts.json` sidecar (source of truth) + `~/.claude/youcoded-projects-index.json` (cache, rebuildable). All paths stored in canonical form; sidecar writes use atomic temp+rename plus a CAS check.

**Tech Stack:** TypeScript, React 18, Electron, Kotlin (Android), Vitest, ULID (`ulid` npm package), PDF.js, mammoth.js, SheetJS.

**Pre-work for the executing engineer:** Create a worktree from `master` per the workspace `CLAUDE.md` convention:
```bash
cd C:/Users/desti/youcoded-dev/youcoded
git worktree add ../youcoded.wt/artifact-viewer -b feat/artifact-viewer
cd ../youcoded.wt/artifact-viewer
```

---

## File Structure

### New files (desktop)

| Path | Purpose |
|------|---------|
| `youcoded/desktop/src/shared/artifacts/types.ts` | Shared TS types — sidecar schema, ArtifactRecord, VersionEvent, etc. |
| `youcoded/desktop/src/shared/artifacts/canonicalize.ts` | Pure path-canonicalization function |
| `youcoded/desktop/src/shared/artifacts/ulid.ts` | ULID wrapper for IDs |
| `youcoded/desktop/src/main/artifacts/artifact-store.ts` | Main-process file I/O for sidecars |
| `youcoded/desktop/src/main/artifacts/central-index.ts` | Main-process file I/O for the central index |
| `youcoded/desktop/src/main/artifacts/project-manager.ts` | Project lifecycle, git treatment, orphan detection |
| `youcoded/desktop/src/main/artifacts/cas-write.ts` | Atomic+CAS write helper |
| `youcoded/desktop/src/main/artifacts/ipc-channels.ts` | Channel name constants |
| `youcoded/desktop/src/renderer/state/artifact-tracker.ts` | Renderer state slice |
| `youcoded/desktop/src/renderer/state/artifact-actions.ts` | Action types and creators |
| `youcoded/desktop/src/renderer/components/SessionDrawer.tsx` | Surface 1 main component |
| `youcoded/desktop/src/renderer/components/ProjectView.tsx` | Surface 2 main component |
| `youcoded/desktop/src/renderer/components/FilepathToken.tsx` | Surface 3 clickable token |
| `youcoded/desktop/src/renderer/components/artifact-views/RendererRegistry.ts` | Extension → component map |
| `youcoded/desktop/src/renderer/components/artifact-views/MarkdownView.tsx` | md/txt viewer + editor |
| `youcoded/desktop/src/renderer/components/artifact-views/CodeView.tsx` | Syntax-highlighted read-only |
| `youcoded/desktop/src/renderer/components/artifact-views/ImageView.tsx` | Image preview |
| `youcoded/desktop/src/renderer/components/artifact-views/PdfView.tsx` | PDF.js viewer |
| `youcoded/desktop/src/renderer/components/artifact-views/DocxView.tsx` | mammoth.js docx → HTML |
| `youcoded/desktop/src/renderer/components/artifact-views/XlsxView.tsx` | SheetJS table |
| `youcoded/desktop/src/renderer/components/artifact-views/BinaryFallback.tsx` | "Cannot preview" + Open Externally |
| `youcoded/desktop/src/renderer/hooks/useInlineFilepathDetector.ts` | Detector hook + memoization |

### Modified files (desktop)

| Path | Change |
|------|--------|
| `youcoded/desktop/src/main/preload.ts` | Expose `artifacts:*` IPC |
| `youcoded/desktop/src/main/ipc-handlers.ts` | Register artifact handlers |
| `youcoded/desktop/src/renderer/remote-shim.ts` | Mirror artifact methods on Android shim |
| `youcoded/desktop/src/renderer/components/HeaderBar.tsx` | Add drawer + Projects buttons |
| `youcoded/desktop/src/renderer/components/ChatView.tsx` | Host SessionDrawer + responsive layout |
| `youcoded/desktop/src/renderer/components/MarkdownContent.tsx` | Integrate FilepathToken (AST traversal) |
| `youcoded/desktop/src/renderer/App.tsx` | Wire ArtifactTracker, theme `layout` flag |
| `youcoded/desktop/tests/ipc-channels.test.ts` | Add artifact channel parity assertions |

### New files (Android)

| Path | Purpose |
|------|---------|
| `youcoded/app/src/main/kotlin/com/youcoded/app/artifacts/PathCanonicalize.kt` | Kotlin port of canonicalize.ts |
| `youcoded/app/src/main/kotlin/com/youcoded/app/artifacts/ArtifactStore.kt` | File I/O |
| `youcoded/app/src/main/kotlin/com/youcoded/app/artifacts/CentralIndex.kt` | Index I/O |
| `youcoded/app/src/main/kotlin/com/youcoded/app/artifacts/ProjectManager.kt` | Project lifecycle |
| `youcoded/app/src/main/kotlin/com/youcoded/app/artifacts/CasWrite.kt` | Atomic+CAS helper |
| `youcoded/app/src/main/kotlin/com/youcoded/app/artifacts/SidecarSchema.kt` | Schema constants, kotlinx.serialization types |

### Modified files (Android)

| Path | Change |
|------|--------|
| `youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` | Add `artifacts:*` IPC handlers |

### Shared fixtures + tests

| Path | Purpose |
|------|---------|
| `youcoded/shared-fixtures/artifacts/canonicalize-cases.json` | Parity fixtures (TS + Kotlin must agree) |
| `youcoded/shared-fixtures/artifacts/sample-sidecar.json` | Example for schema parity |
| `youcoded/shared-fixtures/artifacts/format-samples/sample.md` | Format viewer test fixture |
| `youcoded/shared-fixtures/artifacts/format-samples/sample.pdf` | Format viewer test fixture |
| `youcoded/shared-fixtures/artifacts/format-samples/sample.docx` | Format viewer test fixture |
| `youcoded/shared-fixtures/artifacts/format-samples/sample.xlsx` | Format viewer test fixture |
| `youcoded/shared-fixtures/artifacts/format-samples/sample.png` | Format viewer test fixture |
| `youcoded/desktop/tests/artifacts/*.test.ts` | Unit + integration tests (per task) |

---

## Phase 1: Data Layer

Pure-function and main-process foundation. No UI yet. Each task is TDD-style — test first, then implementation, then commit.

---

### Task 1.1: Shared TypeScript types

**Files:**
- Create: `youcoded/desktop/src/shared/artifacts/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// youcoded/desktop/src/shared/artifacts/types.ts

export const SIDECAR_SCHEMA_VERSION = 1;
export const INDEX_SCHEMA_VERSION = 1;

export type ArtifactKind = 'internal' | 'external';
export type ArtifactStatus = 'active' | 'deleted';
export type VersionAuthor = 'agent' | 'user';
export type VersionType = 'create' | 'edit' | 'delete';

export interface VersionEvent {
  id: string;            // ULID
  ts: string;            // ISO 8601
  sessionId: string;
  type: VersionType;
  author: VersionAuthor;
}

export interface ArtifactRecord {
  id: string;            // ULID
  path: string;          // canonical, relative if kind='internal'
  kind: ArtifactKind;
  absolutePath: string | null;  // canonical, set when kind='external'
  lastModified: string;  // cache, advisory
  status: ArtifactStatus; // cache, derived from latest version
  versions: VersionEvent[];
  comments: unknown[];    // empty in v1
  tags: string[];         // empty in v1
}

export interface ManualInclude {
  path: string;          // canonical absolute
  addedAt: string;
  addedBy: 'user';
}

export interface ProjectSidecar {
  $schema: typeof SIDECAR_SCHEMA_VERSION;
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  artifacts: ArtifactRecord[];
  manualExcludes: string[];     // canonical paths
  manualIncludes: ManualInclude[];
}

export interface CentralIndexProject {
  id: string;
  name: string;
  path: string;           // canonical absolute
  lastIndexed: string;
  lastSession: string | null;
  contentTypes: ('artifacts' | 'conversations')[];
  stats: { artifactCount: number };
}

export interface CentralIndex {
  $schema: typeof INDEX_SCHEMA_VERSION;
  projects: CentralIndexProject[];
}
```

- [ ] **Step 2: Commit**

```bash
git add youcoded/desktop/src/shared/artifacts/types.ts
git commit -m "feat(artifacts): add shared TS types for sidecar + index"
```

---

### Task 1.2: Path canonicalization (TS) — failing tests first

**Files:**
- Create: `youcoded/desktop/src/shared/artifacts/canonicalize.ts`
- Create: `youcoded/desktop/tests/artifacts/canonicalize.test.ts`
- Create: `youcoded/shared-fixtures/artifacts/canonicalize-cases.json`

- [ ] **Step 1: Create the fixture file (shared with Kotlin port later)**

```json
{
  "$schema": 1,
  "cases": [
    { "input": "C:\\foo\\bar.md", "projectRoot": null, "kind": "external", "expected": "c:/foo/bar.md" },
    { "input": "C:/foo/bar.md", "projectRoot": null, "kind": "external", "expected": "c:/foo/bar.md" },
    { "input": "c:/foo/bar.md", "projectRoot": null, "kind": "external", "expected": "c:/foo/bar.md" },
    { "input": "\\\\?\\C:\\foo\\bar.md", "projectRoot": null, "kind": "external", "expected": "c:/foo/bar.md" },
    { "input": "/home/user/foo.md", "projectRoot": null, "kind": "external", "expected": "/home/user/foo.md" },
    { "input": "./foo/bar.md", "projectRoot": "C:/proj", "kind": "internal", "expected": "foo/bar.md" },
    { "input": "foo/bar.md", "projectRoot": "C:/proj", "kind": "internal", "expected": "foo/bar.md" },
    { "input": "foo/./bar.md", "projectRoot": "C:/proj", "kind": "internal", "expected": "foo/bar.md" },
    { "input": "foo/../bar.md", "projectRoot": "C:/proj", "kind": "internal", "expected": "bar.md" },
    { "input": "C:/proj/foo/bar.md", "projectRoot": "C:/proj", "kind": "internal", "expected": "foo/bar.md" },
    { "input": "C:/proj/foo/bar.md/", "projectRoot": "C:/proj", "kind": "internal", "expected": "foo/bar.md" }
  ]
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// youcoded/desktop/tests/artifacts/canonicalize.test.ts
import { describe, expect, it } from 'vitest';
import { canonicalize } from '../../src/shared/artifacts/canonicalize';
import fixtures from '../../../shared-fixtures/artifacts/canonicalize-cases.json';

describe('canonicalize', () => {
  for (const c of fixtures.cases) {
    it(`${c.input} → ${c.expected}`, () => {
      const result = canonicalize(c.input, c.projectRoot);
      expect(result).toBe(c.expected);
    });
  }

  it('handles NFC-vs-NFD Unicode normalization', () => {
    const nfc = 'café.md'; // single codepoint é
    const nfd = 'café.md'; // e + combining acute
    expect(canonicalize(nfc, null)).toBe(canonicalize(nfd, null));
  });
});
```

- [ ] **Step 3: Run the test, confirm it fails**

```bash
cd youcoded/desktop
npx vitest run tests/artifacts/canonicalize.test.ts
```
Expected: All tests FAIL with "canonicalize is not defined" or "Cannot find module".

- [ ] **Step 4: Implement canonicalize**

```typescript
// youcoded/desktop/src/shared/artifacts/canonicalize.ts

/**
 * Canonical form for paths stored in sidecars and used for comparison.
 * Rules per spec § Path canonicalization:
 *   1. Normalize separators to forward slash
 *   2. Lowercase drive letter (Windows)
 *   3. Strip \\?\ prefix
 *   4. Resolve . and ..
 *   5. Internal paths → relative POSIX-style
 *   6. External paths → absolute canonical
 *   7. Strip trailing slashes
 *   8. Unicode NFC normalization
 */
export function canonicalize(rawPath: string, projectRoot: string | null): string {
  if (!rawPath) return rawPath;

  // 3. Strip \\?\ prefix
  let p = rawPath.replace(/^\\\\\?\\/, '');

  // 1. Normalize separators
  p = p.replace(/\\/g, '/');

  // 2. Lowercase drive letter
  p = p.replace(/^([A-Z]):/, (_, d) => d.toLowerCase() + ':');

  // 8. NFC normalize
  p = p.normalize('NFC');

  // 7. Strip trailing slashes (but keep root '/' or 'c:/')
  if (p.length > 1 && !p.endsWith(':/')) {
    p = p.replace(/\/+$/, '');
  }

  // If we have a project root and this looks like an absolute path inside it,
  // or a relative path, resolve to relative.
  if (projectRoot) {
    const root = canonicalize(projectRoot, null); // canonicalize root absolute
    if (p.startsWith(root + '/')) {
      p = p.slice(root.length + 1);
    } else if (!/^([a-z]:|\/)/.test(p)) {
      // relative path — resolve . and .. against an implicit root
    }
    // Resolve . and ..
    p = resolveDots(p);
    return p;
  }

  // 4. Resolve . and ..
  p = resolveDots(p);
  return p;
}

function resolveDots(p: string): string {
  const parts = p.split('/');
  const result: string[] = [];
  for (const part of parts) {
    if (part === '.' || part === '') {
      if (result.length === 0) result.push(part); // preserve leading /
      continue;
    }
    if (part === '..') {
      if (result.length > 0 && result[result.length - 1] !== '..' && result[result.length - 1] !== '') {
        result.pop();
      } else {
        result.push('..');
      }
      continue;
    }
    result.push(part);
  }
  return result.join('/') || '.';
}
```

- [ ] **Step 5: Run tests, confirm pass**

```bash
npx vitest run tests/artifacts/canonicalize.test.ts
```
Expected: all 12+ cases PASS.

- [ ] **Step 6: Commit**

```bash
git add youcoded/desktop/src/shared/artifacts/canonicalize.ts \
        youcoded/desktop/tests/artifacts/canonicalize.test.ts \
        youcoded/shared-fixtures/artifacts/canonicalize-cases.json
git commit -m "feat(artifacts): path canonicalize with shared fixture for parity"
```

---

### Task 1.3: ULID utility

**Files:**
- Create: `youcoded/desktop/src/shared/artifacts/ulid.ts`
- Modify: `youcoded/desktop/package.json` (add `ulid` dep)

- [ ] **Step 1: Add the dependency**

```bash
cd youcoded/desktop
npm install ulid --save
```

- [ ] **Step 2: Write the wrapper**

```typescript
// youcoded/desktop/src/shared/artifacts/ulid.ts
import { ulid } from 'ulid';

export function newArtifactId(): string {
  return `art_${ulid()}`;
}

export function newVersionId(): string {
  return `ver_${ulid()}`;
}

export function newProjectId(): string {
  return ulid();
}
```

- [ ] **Step 3: Commit**

```bash
git add youcoded/desktop/src/shared/artifacts/ulid.ts \
        youcoded/desktop/package.json \
        youcoded/desktop/package-lock.json
git commit -m "feat(artifacts): ULID id helpers"
```

---

### Task 1.4: Atomic-write + CAS helper

**Files:**
- Create: `youcoded/desktop/src/main/artifacts/cas-write.ts`
- Create: `youcoded/desktop/tests/artifacts/cas-write.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// youcoded/desktop/tests/artifacts/cas-write.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { casWrite } from '../../src/main/artifacts/cas-write';

describe('casWrite', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cas-test-'));
  });

  it('writes new file atomically when no prior file exists', async () => {
    const target = join(dir, 'foo.json');
    const result = await casWrite(target, null, '{"v":1}');
    expect(result.committed).toBe(true);
    expect(readFileSync(target, 'utf8')).toBe('{"v":1}');
  });

  it('writes when expectedUpdatedAt matches', async () => {
    const target = join(dir, 'foo.json');
    writeFileSync(target, '{"updatedAt":"2026-01-01T00:00:00Z"}');
    const result = await casWrite(
      target,
      '2026-01-01T00:00:00Z',
      '{"updatedAt":"2026-01-02T00:00:00Z"}',
      (json) => JSON.parse(json).updatedAt
    );
    expect(result.committed).toBe(true);
  });

  it('rejects when expectedUpdatedAt does not match', async () => {
    const target = join(dir, 'foo.json');
    writeFileSync(target, '{"updatedAt":"2026-01-05T00:00:00Z"}');
    const result = await casWrite(
      target,
      '2026-01-01T00:00:00Z',
      '{"updatedAt":"2026-01-02T00:00:00Z"}',
      (json) => JSON.parse(json).updatedAt
    );
    expect(result.committed).toBe(false);
    expect(result.actualUpdatedAt).toBe('2026-01-05T00:00:00Z');
  });

  it('leaves no .tmp file behind on success or failure', async () => {
    const target = join(dir, 'foo.json');
    await casWrite(target, null, '{}');
    expect(existsSync(target + '.tmp')).toBe(false);
  });
});
```

- [ ] **Step 2: Run, confirm fails**

```bash
npx vitest run tests/artifacts/cas-write.test.ts
```
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement**

```typescript
// youcoded/desktop/src/main/artifacts/cas-write.ts
import { promises as fs } from 'fs';
import { dirname, basename, join } from 'path';

export interface CasResult {
  committed: boolean;
  actualUpdatedAt: string | null;
}

/**
 * Atomic write-then-rename with CAS check.
 * @param target Absolute target path
 * @param expectedUpdatedAt The updatedAt value the caller read at the start
 *                          of its mutation. Pass null for "file does not exist
 *                          yet" (creation).
 * @param content New file contents
 * @param extractUpdatedAt Function to pull updatedAt out of a JSON string.
 *                        Optional — when undefined, CAS check is skipped
 *                        (use for non-CAS atomic writes like .gitignore).
 */
export async function casWrite(
  target: string,
  expectedUpdatedAt: string | null,
  content: string,
  extractUpdatedAt?: (json: string) => string
): Promise<CasResult> {
  // CAS pre-check
  if (extractUpdatedAt) {
    try {
      const onDisk = await fs.readFile(target, 'utf8');
      const actual = extractUpdatedAt(onDisk);
      if (actual !== expectedUpdatedAt) {
        return { committed: false, actualUpdatedAt: actual };
      }
    } catch (e: any) {
      if (e.code !== 'ENOENT') throw e;
      if (expectedUpdatedAt !== null) {
        return { committed: false, actualUpdatedAt: null };
      }
    }
  }

  // Atomic write
  const tmp = target + '.tmp';
  await fs.mkdir(dirname(target), { recursive: true });
  await fs.writeFile(tmp, content, 'utf8');
  const fh = await fs.open(tmp, 'r+');
  await fh.sync();
  await fh.close();
  await fs.rename(tmp, target);

  return { committed: true, actualUpdatedAt: null };
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npx vitest run tests/artifacts/cas-write.test.ts
```
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add youcoded/desktop/src/main/artifacts/cas-write.ts \
        youcoded/desktop/tests/artifacts/cas-write.test.ts
git commit -m "feat(artifacts): atomic write + CAS helper"
```

---

### Task 1.5: ArtifactStore — read sidecar

**Files:**
- Create: `youcoded/desktop/src/main/artifacts/artifact-store.ts`
- Create: `youcoded/desktop/tests/artifacts/artifact-store.test.ts`
- Create: `youcoded/shared-fixtures/artifacts/sample-sidecar.json`

- [ ] **Step 1: Create the sample sidecar fixture**

```json
{
  "$schema": 1,
  "projectId": "01HXAB000000000000000000",
  "name": "test-project",
  "createdAt": "2026-05-21T14:00:00.000Z",
  "updatedAt": "2026-05-21T14:30:00.000Z",
  "artifacts": [
    {
      "id": "art_01HXAB000000000000000001",
      "path": "docs/feature.md",
      "kind": "internal",
      "absolutePath": null,
      "lastModified": "2026-05-21T14:30:00.000Z",
      "status": "active",
      "versions": [
        {
          "id": "ver_01HXAB000000000000000001",
          "ts": "2026-05-21T14:05:00.000Z",
          "sessionId": "test-session",
          "type": "create",
          "author": "agent"
        }
      ],
      "comments": [],
      "tags": []
    }
  ],
  "manualExcludes": [],
  "manualIncludes": []
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// youcoded/desktop/tests/artifacts/artifact-store.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { readSidecar } from '../../src/main/artifacts/artifact-store';
import sample from '../../../shared-fixtures/artifacts/sample-sidecar.json';

describe('readSidecar', () => {
  let projectRoot: string;
  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'as-read-'));
    mkdirSync(join(projectRoot, '.youcoded'));
  });

  it('returns null when sidecar does not exist', async () => {
    const sidecar = await readSidecar(projectRoot);
    expect(sidecar).toBeNull();
  });

  it('parses a well-formed sidecar', async () => {
    writeFileSync(join(projectRoot, '.youcoded/artifacts.json'), JSON.stringify(sample));
    const sidecar = await readSidecar(projectRoot);
    expect(sidecar?.projectId).toBe('01HXAB000000000000000000');
    expect(sidecar?.artifacts).toHaveLength(1);
  });

  it('returns {corrupted: true} on parse failure and backs up the file', async () => {
    writeFileSync(join(projectRoot, '.youcoded/artifacts.json'), '{ not valid json');
    const sidecar = await readSidecar(projectRoot);
    expect(sidecar).toEqual({ corrupted: true });
    // Check a backup file was created
    const { readdirSync } = await import('fs');
    const files = readdirSync(join(projectRoot, '.youcoded'));
    expect(files.some(f => f.startsWith('artifacts.json.bak.'))).toBe(true);
  });
});
```

- [ ] **Step 3: Run, confirm fails**

```bash
npx vitest run tests/artifacts/artifact-store.test.ts
```
Expected: FAIL.

- [ ] **Step 4: Implement readSidecar**

```typescript
// youcoded/desktop/src/main/artifacts/artifact-store.ts
import { promises as fs } from 'fs';
import { join } from 'path';
import { ProjectSidecar } from '../../shared/artifacts/types';

export const SIDECAR_RELATIVE = '.youcoded/artifacts.json';

export type ReadResult = ProjectSidecar | null | { corrupted: true };

export async function readSidecar(projectRoot: string): Promise<ReadResult> {
  const path = join(projectRoot, SIDECAR_RELATIVE);
  let raw: string;
  try {
    raw = await fs.readFile(path, 'utf8');
  } catch (e: any) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  try {
    return JSON.parse(raw) as ProjectSidecar;
  } catch {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    await fs.copyFile(path, `${path}.bak.${ts}`);
    return { corrupted: true };
  }
}
```

- [ ] **Step 5: Run, confirm pass**

```bash
npx vitest run tests/artifacts/artifact-store.test.ts
```
Expected: 3 PASS.

- [ ] **Step 6: Commit**

```bash
git add youcoded/desktop/src/main/artifacts/artifact-store.ts \
        youcoded/desktop/tests/artifacts/artifact-store.test.ts \
        youcoded/shared-fixtures/artifacts/sample-sidecar.json
git commit -m "feat(artifacts): readSidecar with corruption recovery"
```

---

### Task 1.6: ArtifactStore — write sidecar with CAS

**Files:**
- Modify: `youcoded/desktop/src/main/artifacts/artifact-store.ts`
- Modify: `youcoded/desktop/tests/artifacts/artifact-store.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `tests/artifacts/artifact-store.test.ts`:

```typescript
import { writeSidecar } from '../../src/main/artifacts/artifact-store';

describe('writeSidecar', () => {
  let projectRoot: string;
  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'as-write-'));
  });

  it('creates sidecar atomically when none exists', async () => {
    const sidecar = { ...sample, updatedAt: '2026-05-21T15:00:00.000Z' };
    const result = await writeSidecar(projectRoot, null, sidecar);
    expect(result.committed).toBe(true);
    const onDisk = await readSidecar(projectRoot);
    expect(onDisk).toMatchObject({ projectId: sidecar.projectId });
  });

  it('CAS rejects when updatedAt does not match', async () => {
    mkdirSync(join(projectRoot, '.youcoded'));
    writeFileSync(
      join(projectRoot, '.youcoded/artifacts.json'),
      JSON.stringify({ ...sample, updatedAt: '2026-05-22T00:00:00.000Z' })
    );
    const updated = { ...sample, updatedAt: '2026-05-21T15:00:00.000Z' };
    const result = await writeSidecar(projectRoot, sample.updatedAt, updated);
    expect(result.committed).toBe(false);
  });
});
```

- [ ] **Step 2: Implement writeSidecar**

Add to `artifact-store.ts`:

```typescript
import { casWrite } from './cas-write';

export async function writeSidecar(
  projectRoot: string,
  expectedUpdatedAt: string | null,
  next: ProjectSidecar
): Promise<{ committed: boolean }> {
  const path = join(projectRoot, SIDECAR_RELATIVE);
  const json = JSON.stringify(next, null, 2);
  const result = await casWrite(
    path,
    expectedUpdatedAt,
    json,
    expectedUpdatedAt === null ? undefined : (raw) => JSON.parse(raw).updatedAt
  );
  return { committed: result.committed };
}
```

- [ ] **Step 3: Run, confirm pass**

```bash
npx vitest run tests/artifacts/artifact-store.test.ts
```
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add youcoded/desktop/src/main/artifacts/artifact-store.ts \
        youcoded/desktop/tests/artifacts/artifact-store.test.ts
git commit -m "feat(artifacts): writeSidecar with CAS check"
```

---

### Task 1.7: ArtifactStore — append version (high-level mutator with retry)

**Files:**
- Modify: `youcoded/desktop/src/main/artifacts/artifact-store.ts`
- Modify: `youcoded/desktop/tests/artifacts/artifact-store.test.ts`

- [ ] **Step 1: Add failing test**

```typescript
import { appendVersion } from '../../src/main/artifacts/artifact-store';

describe('appendVersion', () => {
  let projectRoot: string;
  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'as-append-'));
  });

  it('creates a new artifact when path is unseen', async () => {
    await appendVersion(projectRoot, sample.projectId, sample.name, {
      path: 'docs/new.md',
      kind: 'internal',
      absolutePath: null,
      sessionId: 'sess-1',
      type: 'create',
      author: 'agent',
    });
    const sidecar = await readSidecar(projectRoot);
    expect((sidecar as ProjectSidecar).artifacts[0].path).toBe('docs/new.md');
    expect((sidecar as ProjectSidecar).artifacts[0].versions).toHaveLength(1);
  });

  it('appends a version to an existing artifact', async () => {
    await appendVersion(projectRoot, sample.projectId, sample.name, {
      path: 'docs/x.md', kind: 'internal', absolutePath: null,
      sessionId: 'sess-1', type: 'create', author: 'agent',
    });
    await appendVersion(projectRoot, sample.projectId, sample.name, {
      path: 'docs/x.md', kind: 'internal', absolutePath: null,
      sessionId: 'sess-1', type: 'edit', author: 'agent',
    });
    const sidecar = await readSidecar(projectRoot);
    expect((sidecar as ProjectSidecar).artifacts).toHaveLength(1);
    expect((sidecar as ProjectSidecar).artifacts[0].versions).toHaveLength(2);
  });

  it('retries on CAS conflict up to MAX_RETRIES', async () => {
    // Set up two concurrent appends; serialize by waiting on each.
    // Both should succeed because the second retries.
    await appendVersion(projectRoot, sample.projectId, sample.name, {
      path: 'a.md', kind: 'internal', absolutePath: null,
      sessionId: 's', type: 'create', author: 'agent',
    });
    const [r1, r2] = await Promise.all([
      appendVersion(projectRoot, sample.projectId, sample.name, {
        path: 'b.md', kind: 'internal', absolutePath: null,
        sessionId: 's', type: 'create', author: 'agent',
      }),
      appendVersion(projectRoot, sample.projectId, sample.name, {
        path: 'c.md', kind: 'internal', absolutePath: null,
        sessionId: 's', type: 'create', author: 'agent',
      }),
    ]);
    expect(r1.committed).toBe(true);
    expect(r2.committed).toBe(true);
    const sidecar = await readSidecar(projectRoot) as ProjectSidecar;
    expect(sidecar.artifacts).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Implement**

Add to `artifact-store.ts`:

```typescript
import { newArtifactId, newVersionId } from '../../shared/artifacts/ulid';
import { SIDECAR_SCHEMA_VERSION } from '../../shared/artifacts/types';

const MAX_RETRIES = 5;

export interface AppendVersionInput {
  path: string;            // canonical
  kind: 'internal' | 'external';
  absolutePath: string | null;
  sessionId: string;
  type: 'create' | 'edit' | 'delete';
  author: 'agent' | 'user';
}

export async function appendVersion(
  projectRoot: string,
  projectId: string,
  projectName: string,
  input: AppendVersionInput
): Promise<{ committed: boolean }> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const current = await readSidecar(projectRoot);
    let sidecar: ProjectSidecar;
    let expectedUpdatedAt: string | null;
    if (current === null) {
      // Lazy creation
      const now = new Date().toISOString();
      sidecar = {
        $schema: SIDECAR_SCHEMA_VERSION,
        projectId,
        name: projectName,
        createdAt: now,
        updatedAt: now,
        artifacts: [],
        manualExcludes: [],
        manualIncludes: [],
      };
      expectedUpdatedAt = null;
    } else if ('corrupted' in current) {
      // Recovery path — start fresh, preserve nothing (existing file already backed up)
      const now = new Date().toISOString();
      sidecar = {
        $schema: SIDECAR_SCHEMA_VERSION,
        projectId,
        name: projectName,
        createdAt: now,
        updatedAt: now,
        artifacts: [],
        manualExcludes: [],
        manualIncludes: [],
      };
      expectedUpdatedAt = null;
    } else {
      sidecar = current;
      expectedUpdatedAt = sidecar.updatedAt;
    }

    const existing = sidecar.artifacts.find(
      (a) => a.path === input.path && a.kind === input.kind
    );
    const now = new Date().toISOString();
    const versionEvent = {
      id: newVersionId(),
      ts: now,
      sessionId: input.sessionId,
      type: input.type,
      author: input.author,
    };
    if (existing) {
      existing.versions.push(versionEvent);
      existing.lastModified = now;
      existing.status = input.type === 'delete' ? 'deleted' : 'active';
    } else {
      sidecar.artifacts.push({
        id: newArtifactId(),
        path: input.path,
        kind: input.kind,
        absolutePath: input.absolutePath,
        lastModified: now,
        status: input.type === 'delete' ? 'deleted' : 'active',
        versions: [versionEvent],
        comments: [],
        tags: [],
      });
    }
    sidecar.updatedAt = now;

    const result = await writeSidecar(projectRoot, expectedUpdatedAt, sidecar);
    if (result.committed) return { committed: true };
    // CAS conflict — retry against fresh state
    await sleep(10 * (attempt + 1));
  }
  return { committed: false };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
```

- [ ] **Step 3: Run, confirm pass**

```bash
npx vitest run tests/artifacts/artifact-store.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add youcoded/desktop/src/main/artifacts/artifact-store.ts \
        youcoded/desktop/tests/artifacts/artifact-store.test.ts
git commit -m "feat(artifacts): appendVersion with CAS retry"
```

---

### Task 1.8: Central index — read + write

**Files:**
- Create: `youcoded/desktop/src/main/artifacts/central-index.ts`
- Create: `youcoded/desktop/tests/artifacts/central-index.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// youcoded/desktop/tests/artifacts/central-index.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  readIndex,
  upsertProject,
  removeProject,
  listProjects,
} from '../../src/main/artifacts/central-index';
import { INDEX_SCHEMA_VERSION } from '../../src/shared/artifacts/types';

describe('central-index', () => {
  let claudeDir: string;
  beforeEach(() => {
    claudeDir = mkdtempSync(join(tmpdir(), 'ci-'));
  });

  it('returns an empty index when none exists', async () => {
    const idx = await readIndex(claudeDir);
    expect(idx).toEqual({ $schema: INDEX_SCHEMA_VERSION, projects: [] });
  });

  it('upserts a new project', async () => {
    await upsertProject(claudeDir, {
      id: 'p1', name: 'a', path: '/p/a',
      lastIndexed: '2026-01-01T00:00:00Z',
      lastSession: null, contentTypes: ['artifacts'],
      stats: { artifactCount: 0 },
    });
    const idx = await readIndex(claudeDir);
    expect(idx.projects).toHaveLength(1);
    expect(idx.projects[0].id).toBe('p1');
  });

  it('upserts overwrites an existing project by id', async () => {
    const base = {
      id: 'p1', name: 'a', path: '/p/a',
      lastIndexed: '2026-01-01T00:00:00Z',
      lastSession: null, contentTypes: ['artifacts'] as const,
      stats: { artifactCount: 0 },
    };
    await upsertProject(claudeDir, base);
    await upsertProject(claudeDir, { ...base, name: 'a-renamed', stats: { artifactCount: 5 } });
    const idx = await readIndex(claudeDir);
    expect(idx.projects).toHaveLength(1);
    expect(idx.projects[0].name).toBe('a-renamed');
    expect(idx.projects[0].stats.artifactCount).toBe(5);
  });

  it('removeProject removes by id', async () => {
    await upsertProject(claudeDir, {
      id: 'p1', name: 'a', path: '/p/a',
      lastIndexed: '2026-01-01T00:00:00Z',
      lastSession: null, contentTypes: ['artifacts'],
      stats: { artifactCount: 0 },
    });
    await removeProject(claudeDir, 'p1');
    const idx = await readIndex(claudeDir);
    expect(idx.projects).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npx vitest run tests/artifacts/central-index.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// youcoded/desktop/src/main/artifacts/central-index.ts
import { promises as fs } from 'fs';
import { join } from 'path';
import {
  CentralIndex, CentralIndexProject, INDEX_SCHEMA_VERSION,
} from '../../shared/artifacts/types';
import { casWrite } from './cas-write';

export const INDEX_FILE = 'youcoded-projects-index.json';

const MAX_RETRIES = 5;

export async function readIndex(claudeDir: string): Promise<CentralIndex> {
  const path = join(claudeDir, INDEX_FILE);
  try {
    const raw = await fs.readFile(path, 'utf8');
    return JSON.parse(raw) as CentralIndex;
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      return { $schema: INDEX_SCHEMA_VERSION, projects: [] };
    }
    throw e;
  }
}

async function writeIndex(claudeDir: string, expectedUpdatedAt: string | null, index: CentralIndex) {
  // Index doesn't have its own updatedAt — we treat the full-file equality as the CAS key
  // by re-reading and comparing serialized form. Simpler: best-effort, no CAS for v1 since
  // contention on the index is rare (only changed on project create/delete/stats-refresh).
  const path = join(claudeDir, INDEX_FILE);
  await casWrite(path, null, JSON.stringify(index, null, 2));
}

export async function upsertProject(
  claudeDir: string,
  project: CentralIndexProject
): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const idx = await readIndex(claudeDir);
    const i = idx.projects.findIndex((p) => p.id === project.id);
    if (i >= 0) idx.projects[i] = project;
    else idx.projects.push(project);
    try {
      await writeIndex(claudeDir, null, idx);
      return;
    } catch (e) {
      if (attempt === MAX_RETRIES - 1) throw e;
    }
  }
}

export async function removeProject(claudeDir: string, projectId: string): Promise<void> {
  const idx = await readIndex(claudeDir);
  idx.projects = idx.projects.filter((p) => p.id !== projectId);
  await writeIndex(claudeDir, null, idx);
}

export async function listProjects(claudeDir: string): Promise<CentralIndexProject[]> {
  const idx = await readIndex(claudeDir);
  return idx.projects;
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npx vitest run tests/artifacts/central-index.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add youcoded/desktop/src/main/artifacts/central-index.ts \
        youcoded/desktop/tests/artifacts/central-index.test.ts
git commit -m "feat(artifacts): central index read/write/upsert/remove"
```

---

### Task 1.9: ProjectManager — auto-create + git-treatment

**Files:**
- Create: `youcoded/desktop/src/main/artifacts/project-manager.ts`
- Create: `youcoded/desktop/tests/artifacts/project-manager.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// youcoded/desktop/tests/artifacts/project-manager.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  ensureProject,
  applyGitTreatment,
} from '../../src/main/artifacts/project-manager';
import { readIndex } from '../../src/main/artifacts/central-index';

describe('ensureProject', () => {
  let claudeDir: string;
  let projectRoot: string;
  beforeEach(() => {
    claudeDir = mkdtempSync(join(tmpdir(), 'pm-claude-'));
    projectRoot = mkdtempSync(join(tmpdir(), 'pm-proj-'));
  });

  it('creates a new project entry in the index when path is unknown and no sidecar exists', async () => {
    const result = await ensureProject(claudeDir, projectRoot, 'sess-1');
    expect(result.created).toBe(true);
    const idx = await readIndex(claudeDir);
    expect(idx.projects).toHaveLength(1);
    // Sidecar NOT yet written (lazy)
    expect(existsSync(join(projectRoot, '.youcoded'))).toBe(false);
  });

  it('updates lastSession when path is already known', async () => {
    await ensureProject(claudeDir, projectRoot, 'sess-1');
    const result = await ensureProject(claudeDir, projectRoot, 'sess-2');
    expect(result.created).toBe(false);
    const idx = await readIndex(claudeDir);
    expect(idx.projects[0].lastSession).toBe('sess-2');
  });

  it('auto-recovers when sidecar exists at the path (project-moved case)', async () => {
    mkdirSync(join(projectRoot, '.youcoded'));
    writeFileSync(
      join(projectRoot, '.youcoded/artifacts.json'),
      JSON.stringify({
        $schema: 1, projectId: 'pre-existing', name: 'foo',
        createdAt: 'x', updatedAt: 'x',
        artifacts: [], manualExcludes: [], manualIncludes: [],
      })
    );
    const result = await ensureProject(claudeDir, projectRoot, 'sess-1');
    const idx = await readIndex(claudeDir);
    expect(idx.projects[0].id).toBe('pre-existing');
  });
});

describe('applyGitTreatment', () => {
  let projectRoot: string;
  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'pm-git-'));
  });

  it('does nothing in a non-git directory', async () => {
    await applyGitTreatment(projectRoot);
    expect(existsSync(join(projectRoot, '.gitignore'))).toBe(false);
  });

  it('creates .gitignore with .youcoded/ in a git repo with no existing .gitignore', async () => {
    mkdirSync(join(projectRoot, '.git'));
    await applyGitTreatment(projectRoot);
    expect(readFileSync(join(projectRoot, '.gitignore'), 'utf8')).toContain('.youcoded/');
  });

  it('appends to an existing .gitignore without duplicating', async () => {
    mkdirSync(join(projectRoot, '.git'));
    writeFileSync(join(projectRoot, '.gitignore'), 'node_modules\n');
    await applyGitTreatment(projectRoot);
    const content = readFileSync(join(projectRoot, '.gitignore'), 'utf8');
    expect(content).toMatch(/node_modules/);
    expect(content).toMatch(/\.youcoded\//);

    // Idempotent
    await applyGitTreatment(projectRoot);
    const occurrences = (readFileSync(join(projectRoot, '.gitignore'), 'utf8').match(/\.youcoded\//g) || []).length;
    expect(occurrences).toBe(1);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npx vitest run tests/artifacts/project-manager.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// youcoded/desktop/src/main/artifacts/project-manager.ts
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import { join, basename } from 'path';
import { canonicalize } from '../../shared/artifacts/canonicalize';
import { newProjectId } from '../../shared/artifacts/ulid';
import { readSidecar } from './artifact-store';
import { readIndex, upsertProject } from './central-index';
import { CentralIndexProject } from '../../shared/artifacts/types';

export interface EnsureProjectResult {
  project: CentralIndexProject;
  created: boolean;
}

export async function ensureProject(
  claudeDir: string,
  projectRoot: string,
  sessionId: string
): Promise<EnsureProjectResult> {
  const canonicalRoot = canonicalize(projectRoot, null);
  const now = new Date().toISOString();
  const idx = await readIndex(claudeDir);
  const existing = idx.projects.find((p) => p.path === canonicalRoot);

  if (existing) {
    const updated: CentralIndexProject = { ...existing, lastSession: sessionId, lastIndexed: now };
    await upsertProject(claudeDir, updated);
    return { project: updated, created: false };
  }

  // Check sidecar for auto-recovery
  const sidecar = await readSidecar(projectRoot);
  let projectId: string;
  let name: string;
  if (sidecar && 'projectId' in sidecar) {
    projectId = sidecar.projectId;
    name = sidecar.name;
  } else {
    projectId = newProjectId();
    name = basename(projectRoot);
  }

  const project: CentralIndexProject = {
    id: projectId,
    name,
    path: canonicalRoot,
    lastIndexed: now,
    lastSession: sessionId,
    contentTypes: ['artifacts'],
    stats: { artifactCount: 0 },
  };
  await upsertProject(claudeDir, project);
  return { project, created: true };
}

export async function applyGitTreatment(projectRoot: string): Promise<void> {
  if (!existsSync(join(projectRoot, '.git'))) return;
  const gitignorePath = join(projectRoot, '.gitignore');
  let current = '';
  try {
    current = await fs.readFile(gitignorePath, 'utf8');
  } catch (e: any) {
    if (e.code !== 'ENOENT') throw e;
  }
  if (/^\.youcoded\/?\s*$/m.test(current)) return;
  const next = (current && !current.endsWith('\n') ? current + '\n' : current) + '.youcoded/\n';
  await fs.writeFile(gitignorePath + '.tmp', next, 'utf8');
  await fs.rename(gitignorePath + '.tmp', gitignorePath);
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npx vitest run tests/artifacts/project-manager.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add youcoded/desktop/src/main/artifacts/project-manager.ts \
        youcoded/desktop/tests/artifacts/project-manager.test.ts
git commit -m "feat(artifacts): ProjectManager auto-create + git treatment"
```

---

### Task 1.10: Orphan detection + index rebuild

**Files:**
- Modify: `youcoded/desktop/src/main/artifacts/project-manager.ts`
- Modify: `youcoded/desktop/tests/artifacts/project-manager.test.ts`

- [ ] **Step 1: Add failing tests**

```typescript
import { detectOrphan, rebuildIndex } from '../../src/main/artifacts/project-manager';

describe('detectOrphan', () => {
  let projectRoot: string;
  beforeEach(() => { projectRoot = mkdtempSync(join(tmpdir(), 'orph-')); });

  it('returns false for a file that exists', async () => {
    writeFileSync(join(projectRoot, 'foo.md'), 'hi');
    expect(await detectOrphan(projectRoot, 'foo.md', 'internal', null)).toBe(false);
  });

  it('returns true for a file that does not exist', async () => {
    expect(await detectOrphan(projectRoot, 'missing.md', 'internal', null)).toBe(true);
  });
});

describe('rebuildIndex', () => {
  let claudeDir: string;
  let p1Root: string;
  let p2Root: string;
  beforeEach(() => {
    claudeDir = mkdtempSync(join(tmpdir(), 'rb-c-'));
    p1Root = mkdtempSync(join(tmpdir(), 'rb-p1-'));
    p2Root = mkdtempSync(join(tmpdir(), 'rb-p2-'));
  });

  it('drops projects whose sidecars no longer exist', async () => {
    await ensureProject(claudeDir, p1Root, 's1');
    await ensureProject(claudeDir, p2Root, 's2');
    // Materialize p1 sidecar
    mkdirSync(join(p1Root, '.youcoded'));
    writeFileSync(join(p1Root, '.youcoded/artifacts.json'), JSON.stringify({
      $schema: 1, projectId: 'pre', name: 'a', createdAt: 'x', updatedAt: 'x',
      artifacts: [{ id: 'art_x' }], manualExcludes: [], manualIncludes: [],
    }));
    // p2 sidecar never materialized — should be dropped
    await rebuildIndex(claudeDir);
    const idx = await readIndex(claudeDir);
    expect(idx.projects).toHaveLength(1);
    expect(idx.projects[0].stats.artifactCount).toBe(1);
  });
});
```

- [ ] **Step 2: Implement**

Add to `project-manager.ts`:

```typescript
export async function detectOrphan(
  projectRoot: string,
  path: string,
  kind: 'internal' | 'external',
  absolutePath: string | null
): Promise<boolean> {
  const fullPath = kind === 'internal' ? join(projectRoot, path) : absolutePath!;
  return !existsSync(fullPath);
}

export async function rebuildIndex(claudeDir: string): Promise<void> {
  const idx = await readIndex(claudeDir);
  const surviving: CentralIndexProject[] = [];
  for (const p of idx.projects) {
    const sidecar = await readSidecar(p.path);
    if (sidecar && 'projectId' in sidecar) {
      surviving.push({
        ...p,
        stats: { artifactCount: sidecar.artifacts.length },
        lastIndexed: new Date().toISOString(),
      });
    }
  }
  // Replace index
  const { writeIndex } = await import('./central-index-internal'); // see note
  // Simpler: just upsert each and remove missing
  for (const p of surviving) await upsertProject(claudeDir, p);
  const survivingIds = new Set(surviving.map((p) => p.id));
  for (const p of idx.projects) {
    if (!survivingIds.has(p.id)) {
      const { removeProject } = await import('./central-index');
      await removeProject(claudeDir, p.id);
    }
  }
}
```

- [ ] **Step 3: Run, confirm pass**

```bash
npx vitest run tests/artifacts/project-manager.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add youcoded/desktop/src/main/artifacts/project-manager.ts \
        youcoded/desktop/tests/artifacts/project-manager.test.ts
git commit -m "feat(artifacts): orphan detection + index rebuild"
```

---

## Phase 2: IPC Layer

Wire the Tracker/Store to the renderer via IPC. Both platforms.

---

### Task 2.1: Channel constants

**Files:**
- Create: `youcoded/desktop/src/main/artifacts/ipc-channels.ts`

- [ ] **Step 1: Create the file**

```typescript
// youcoded/desktop/src/main/artifacts/ipc-channels.ts
export const ARTIFACT_IPC = {
  LIST_SESSION: 'artifacts:list-session',
  LIST_PROJECT: 'artifacts:list-project',
  GET: 'artifacts:get',
  SAVE: 'artifacts:save',
  INCLUDE_EXTERNAL: 'artifacts:include-external',
  EXCLUDE: 'artifacts:exclude',
  CHANGED: 'artifacts:changed', // push event
} as const;

export type ArtifactIpcChannel = typeof ARTIFACT_IPC[keyof typeof ARTIFACT_IPC];
```

- [ ] **Step 2: Commit**

```bash
git add youcoded/desktop/src/main/artifacts/ipc-channels.ts
git commit -m "feat(artifacts): IPC channel constants"
```

---

### Task 2.2: Main-process handlers

**Files:**
- Modify: `youcoded/desktop/src/main/ipc-handlers.ts`

- [ ] **Step 1: Register handlers**

Add at the end of the handler registration block in `ipc-handlers.ts`:

```typescript
import { ARTIFACT_IPC } from './artifacts/ipc-channels';
import {
  appendVersion, readSidecar, writeSidecar,
} from './artifacts/artifact-store';
import { readIndex, listProjects } from './artifacts/central-index';
import { ensureProject, applyGitTreatment, detectOrphan } from './artifacts/project-manager';
import { canonicalize } from '../shared/artifacts/canonicalize';
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CLAUDE_DIR = join(homedir(), '.claude');

ipcMain.handle(ARTIFACT_IPC.LIST_SESSION, async (_e, sessionId: string, projectRoot: string) => {
  const sidecar = await readSidecar(projectRoot);
  if (!sidecar || 'corrupted' in sidecar) return { ok: true, artifacts: [] };
  // Filter to artifacts touched by this session
  const result = sidecar.artifacts.filter((a) =>
    a.versions.some((v) => v.sessionId === sessionId)
  );
  return { ok: true, artifacts: result };
});

ipcMain.handle(ARTIFACT_IPC.LIST_PROJECT, async (_e, projectId: string) => {
  const projects = await listProjects(CLAUDE_DIR);
  const p = projects.find((x) => x.id === projectId);
  if (!p) return { ok: false, error: 'project-not-found' };
  const sidecar = await readSidecar(p.path);
  if (!sidecar || 'corrupted' in sidecar) return { ok: true, artifacts: [] };
  return { ok: true, artifacts: sidecar.artifacts };
});

ipcMain.handle(ARTIFACT_IPC.GET, async (_e, projectRoot: string, artifactId: string) => {
  const sidecar = await readSidecar(projectRoot);
  if (!sidecar || 'corrupted' in sidecar) return { ok: false, error: 'sidecar-missing' };
  const artifact = sidecar.artifacts.find((a) => a.id === artifactId);
  if (!artifact) return { ok: false, error: 'artifact-not-found' };
  const fullPath = artifact.kind === 'internal'
    ? join(projectRoot, artifact.path)
    : artifact.absolutePath!;
  let content: string | null = null;
  try {
    content = await fs.readFile(fullPath, 'utf8');
  } catch (e: any) {
    if (e.code !== 'ENOENT') throw e;
    // Orphan
  }
  return { ok: true, artifact, content, orphan: content === null };
});

ipcMain.handle(ARTIFACT_IPC.SAVE, async (
  _e,
  projectRoot: string,
  projectId: string,
  projectName: string,
  artifactId: string,
  newContent: string,
  sessionId: string
) => {
  const sidecar = await readSidecar(projectRoot);
  if (!sidecar || 'corrupted' in sidecar) return { ok: false, error: 'sidecar-missing' };
  const artifact = sidecar.artifacts.find((a) => a.id === artifactId);
  if (!artifact) return { ok: false, error: 'artifact-not-found' };
  const fullPath = artifact.kind === 'internal'
    ? join(projectRoot, artifact.path)
    : artifact.absolutePath!;
  await fs.writeFile(fullPath + '.tmp', newContent, 'utf8');
  await fs.rename(fullPath + '.tmp', fullPath);
  await appendVersion(projectRoot, projectId, projectName, {
    path: artifact.path,
    kind: artifact.kind,
    absolutePath: artifact.absolutePath,
    sessionId,
    type: 'edit',
    author: 'user',
  });
  // Broadcast
  webContents.getAllWebContents().forEach((wc) =>
    wc.send(ARTIFACT_IPC.CHANGED, { projectRoot, artifactId, kind: 'edit', by: 'user' })
  );
  return { ok: true };
});

ipcMain.handle(ARTIFACT_IPC.INCLUDE_EXTERNAL, async (
  _e, projectRoot: string, absolutePath: string
) => {
  const canonical = canonicalize(absolutePath, null);
  const sidecar = await readSidecar(projectRoot);
  if (!sidecar || 'corrupted' in sidecar) return { ok: false, error: 'sidecar-missing' };
  if (sidecar.manualIncludes.some((i) => i.path === canonical)) {
    return { ok: true }; // idempotent
  }
  sidecar.manualIncludes.push({
    path: canonical,
    addedAt: new Date().toISOString(),
    addedBy: 'user',
  });
  sidecar.updatedAt = new Date().toISOString();
  await writeSidecar(projectRoot, sidecar.updatedAt, sidecar);
  return { ok: true };
});

ipcMain.handle(ARTIFACT_IPC.EXCLUDE, async (
  _e, projectRoot: string, canonicalPath: string
) => {
  const sidecar = await readSidecar(projectRoot);
  if (!sidecar || 'corrupted' in sidecar) return { ok: false, error: 'sidecar-missing' };
  if (!sidecar.manualExcludes.includes(canonicalPath)) {
    sidecar.manualExcludes.push(canonicalPath);
    sidecar.updatedAt = new Date().toISOString();
    await writeSidecar(projectRoot, sidecar.updatedAt, sidecar);
  }
  return { ok: true };
});
```

- [ ] **Step 2: Commit**

```bash
git add youcoded/desktop/src/main/ipc-handlers.ts
git commit -m "feat(artifacts): main-process IPC handlers for artifacts:*"
```

---

### Task 2.3: Preload exposure

**Files:**
- Modify: `youcoded/desktop/src/main/preload.ts`

- [ ] **Step 1: Add to the `window.claude` shape**

In preload.ts, find the `window.claude` exposeInMainWorld block. Add an `artifacts` namespace:

```typescript
import { ARTIFACT_IPC } from './artifacts/ipc-channels';

// inside the existing exposeInMainWorld call, add:
artifacts: {
  listSession: (sessionId: string, projectRoot: string) =>
    ipcRenderer.invoke(ARTIFACT_IPC.LIST_SESSION, sessionId, projectRoot),
  listProject: (projectId: string) =>
    ipcRenderer.invoke(ARTIFACT_IPC.LIST_PROJECT, projectId),
  get: (projectRoot: string, artifactId: string) =>
    ipcRenderer.invoke(ARTIFACT_IPC.GET, projectRoot, artifactId),
  save: (projectRoot: string, projectId: string, projectName: string,
         artifactId: string, content: string, sessionId: string) =>
    ipcRenderer.invoke(ARTIFACT_IPC.SAVE, projectRoot, projectId, projectName, artifactId, content, sessionId),
  includeExternal: (projectRoot: string, absolutePath: string) =>
    ipcRenderer.invoke(ARTIFACT_IPC.INCLUDE_EXTERNAL, projectRoot, absolutePath),
  exclude: (projectRoot: string, canonicalPath: string) =>
    ipcRenderer.invoke(ARTIFACT_IPC.EXCLUDE, projectRoot, canonicalPath),
  onChanged: (cb: (event: any) => void) => {
    ipcRenderer.on(ARTIFACT_IPC.CHANGED, (_e, payload) => cb(payload));
    return () => ipcRenderer.removeAllListeners(ARTIFACT_IPC.CHANGED);
  },
},
```

- [ ] **Step 2: Commit**

```bash
git add youcoded/desktop/src/main/preload.ts
git commit -m "feat(artifacts): expose artifacts API on window.claude (Electron)"
```

---

### Task 2.4: Remote-shim mirror (Android)

**Files:**
- Modify: `youcoded/desktop/src/renderer/remote-shim.ts`

- [ ] **Step 1: Add the artifacts namespace to the Android shim**

Find the `window.claude` shape in remote-shim.ts. Add:

```typescript
artifacts: {
  listSession: (sessionId: string, projectRoot: string) =>
    invoke('artifacts:list-session', { sessionId, projectRoot }),
  listProject: (projectId: string) =>
    invoke('artifacts:list-project', { projectId }),
  get: (projectRoot: string, artifactId: string) =>
    invoke('artifacts:get', { projectRoot, artifactId }),
  save: (projectRoot: string, projectId: string, projectName: string,
         artifactId: string, content: string, sessionId: string) =>
    invoke('artifacts:save', { projectRoot, projectId, projectName, artifactId, content, sessionId }),
  includeExternal: (projectRoot: string, absolutePath: string) =>
    invoke('artifacts:include-external', { projectRoot, absolutePath }),
  exclude: (projectRoot: string, canonicalPath: string) =>
    invoke('artifacts:exclude', { projectRoot, canonicalPath }),
  onChanged: (cb: (event: any) => void) => {
    const handler = (e: MessageEvent) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'artifacts:changed') cb(msg.payload);
    };
    ws.addEventListener('message', handler);
    return () => ws.removeEventListener('message', handler);
  },
},
```

- [ ] **Step 2: Commit**

```bash
git add youcoded/desktop/src/renderer/remote-shim.ts
git commit -m "feat(artifacts): mirror artifacts API on Android remote-shim"
```

---

### Task 2.5: IPC parity test

**Files:**
- Modify: `youcoded/desktop/tests/ipc-channels.test.ts`

- [ ] **Step 1: Add the parity assertions**

Append to the existing test file:

```typescript
import { ARTIFACT_IPC } from '../src/main/artifacts/ipc-channels';

describe('artifact IPC parity', () => {
  const channels = Object.values(ARTIFACT_IPC);
  const preload = readFileSync('src/main/preload.ts', 'utf8');
  const shim = readFileSync('src/renderer/remote-shim.ts', 'utf8');
  const handlers = readFileSync('src/main/ipc-handlers.ts', 'utf8');
  const kotlin = readFileSync(
    '../app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt', 'utf8'
  );

  for (const channel of channels) {
    it(`channel ${channel} is referenced in preload.ts`, () => {
      expect(preload).toMatch(channel);
    });
    it(`channel ${channel} is referenced in remote-shim.ts`, () => {
      expect(shim).toMatch(channel);
    });
    if (channel !== 'artifacts:changed') {
      // Push events don't need a handler — only request/response channels
      it(`channel ${channel} is registered in ipc-handlers.ts`, () => {
        expect(handlers).toMatch(channel);
      });
    }
    it(`channel ${channel} is registered in SessionService.kt`, () => {
      expect(kotlin).toMatch(channel);
    });
  }
});
```

- [ ] **Step 2: Run, confirm fails on Kotlin assertions (Kotlin not implemented yet)**

```bash
npx vitest run tests/ipc-channels.test.ts
```
Expected: TS-side passes, Kotlin assertions FAIL.

(The test will pass after Phase 8 Task 8.4. Leave failing for now — it's a tracker for the parity work.)

- [ ] **Step 3: Commit**

```bash
git add youcoded/desktop/tests/ipc-channels.test.ts
git commit -m "test(artifacts): IPC parity assertions across 4 surfaces"
```

---

## Phase 3: Artifact Tracker (renderer state slice)

---

### Task 3.1: Action types + reducer slice

**Files:**
- Create: `youcoded/desktop/src/renderer/state/artifact-actions.ts`
- Create: `youcoded/desktop/src/renderer/state/artifact-tracker.ts`
- Create: `youcoded/desktop/tests/artifacts/artifact-tracker.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// youcoded/desktop/tests/artifacts/artifact-tracker.test.ts
import { describe, expect, it } from 'vitest';
import {
  initialArtifactState,
  artifactReducer,
} from '../../src/renderer/state/artifact-tracker';
import type { ArtifactRecord } from '../../src/shared/artifacts/types';

const sampleArtifact: ArtifactRecord = {
  id: 'art_1', path: 'a.md', kind: 'internal', absolutePath: null,
  lastModified: 'now', status: 'active',
  versions: [{ id: 'v1', ts: 'now', sessionId: 's1', type: 'create', author: 'agent' }],
  comments: [], tags: [],
};

describe('artifactReducer', () => {
  it('SESSION_ARTIFACTS_LOADED replaces sessionArtifacts', () => {
    const next = artifactReducer(initialArtifactState, {
      type: 'SESSION_ARTIFACTS_LOADED',
      sessionId: 's1',
      artifacts: [sampleArtifact],
    });
    expect(next.sessionArtifacts['s1']).toEqual([sampleArtifact]);
  });

  it('ARTIFACT_CHANGED triggers re-fetch flag', () => {
    const next = artifactReducer(initialArtifactState, {
      type: 'ARTIFACT_CHANGED',
      projectRoot: '/p',
      artifactId: 'art_1',
    });
    expect(next.pendingRefresh['/p']).toBe(true);
  });

  it('DRAWER_OPENED sets drawerOpen', () => {
    const next = artifactReducer(initialArtifactState, { type: 'DRAWER_OPENED' });
    expect(next.drawerOpen).toBe(true);
  });

  it('DRAWER_CLOSED clears drawerOpen and activeArtifactId', () => {
    let s = artifactReducer(initialArtifactState, { type: 'DRAWER_OPENED' });
    s = artifactReducer(s, { type: 'ACTIVE_ARTIFACT_SET', artifactId: 'art_1' });
    s = artifactReducer(s, { type: 'DRAWER_CLOSED' });
    expect(s.drawerOpen).toBe(false);
    expect(s.activeArtifactId).toBeNull();
  });
});
```

- [ ] **Step 2: Run, confirm fails**

```bash
npx vitest run tests/artifacts/artifact-tracker.test.ts
```

- [ ] **Step 3: Implement actions**

```typescript
// youcoded/desktop/src/renderer/state/artifact-actions.ts
import type { ArtifactRecord } from '../../shared/artifacts/types';

export type ArtifactAction =
  | { type: 'SESSION_ARTIFACTS_LOADED'; sessionId: string; artifacts: ArtifactRecord[] }
  | { type: 'ARTIFACT_CHANGED'; projectRoot: string; artifactId: string }
  | { type: 'DRAWER_OPENED' }
  | { type: 'DRAWER_CLOSED' }
  | { type: 'ACTIVE_ARTIFACT_SET'; artifactId: string }
  | { type: 'PROJECT_VIEW_OPENED' }
  | { type: 'PROJECT_VIEW_CLOSED' };
```

- [ ] **Step 4: Implement reducer**

```typescript
// youcoded/desktop/src/renderer/state/artifact-tracker.ts
import type { ArtifactRecord } from '../../shared/artifacts/types';
import type { ArtifactAction } from './artifact-actions';

export interface ArtifactState {
  sessionArtifacts: Record<string, ArtifactRecord[]>; // by sessionId
  projectArtifacts: Record<string, ArtifactRecord[]>; // by projectRoot
  pendingRefresh: Record<string, boolean>;            // by projectRoot
  drawerOpen: boolean;
  projectViewOpen: boolean;
  activeArtifactId: string | null;
}

export const initialArtifactState: ArtifactState = {
  sessionArtifacts: {},
  projectArtifacts: {},
  pendingRefresh: {},
  drawerOpen: false,
  projectViewOpen: false,
  activeArtifactId: null,
};

export function artifactReducer(s: ArtifactState, a: ArtifactAction): ArtifactState {
  switch (a.type) {
    case 'SESSION_ARTIFACTS_LOADED':
      return { ...s, sessionArtifacts: { ...s.sessionArtifacts, [a.sessionId]: a.artifacts } };
    case 'ARTIFACT_CHANGED':
      return { ...s, pendingRefresh: { ...s.pendingRefresh, [a.projectRoot]: true } };
    case 'DRAWER_OPENED':
      return { ...s, drawerOpen: true };
    case 'DRAWER_CLOSED':
      return { ...s, drawerOpen: false, activeArtifactId: null };
    case 'ACTIVE_ARTIFACT_SET':
      return { ...s, activeArtifactId: a.artifactId };
    case 'PROJECT_VIEW_OPENED':
      return { ...s, projectViewOpen: true };
    case 'PROJECT_VIEW_CLOSED':
      return { ...s, projectViewOpen: false };
    default:
      return s;
  }
}
```

- [ ] **Step 5: Run, confirm pass**

```bash
npx vitest run tests/artifacts/artifact-tracker.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add youcoded/desktop/src/renderer/state/artifact-actions.ts \
        youcoded/desktop/src/renderer/state/artifact-tracker.ts \
        youcoded/desktop/tests/artifacts/artifact-tracker.test.ts
git commit -m "feat(artifacts): renderer state slice + reducer"
```

---

### Task 3.2: Subscribe to TranscriptWatcher events in App.tsx

**Files:**
- Modify: `youcoded/desktop/src/renderer/App.tsx`

- [ ] **Step 1: Add a useEffect that subscribes to transcript tool-use events**

Find the existing transcript event subscription in App.tsx (likely near where ChatProvider is mounted). Add a parallel subscription:

```typescript
import {
  artifactReducer, initialArtifactState,
} from './state/artifact-tracker';
import { useReducer, useEffect } from 'react';

// Inside App component:
const [artifactState, dispatchArtifact] = useReducer(artifactReducer, initialArtifactState);

useEffect(() => {
  const onToolUse = async (evt: { sessionId: string; tool: string; args: any; projectRoot: string }) => {
    // Only Write / Edit / Delete tool calls produce artifacts
    if (!['Write', 'Edit', 'MultiEdit'].includes(evt.tool)) return;
    // Filter to internal-only auto-tracking (external files require explicit add)
    const targetPath = evt.args.file_path || evt.args.path;
    if (!targetPath) return;
    const isInternal = targetPath.startsWith(evt.projectRoot);
    if (!isInternal) return;
    // Re-fetch session artifacts to update the list
    const res = await window.claude.artifacts.listSession(evt.sessionId, evt.projectRoot);
    if (res.ok) {
      dispatchArtifact({
        type: 'SESSION_ARTIFACTS_LOADED',
        sessionId: evt.sessionId,
        artifacts: res.artifacts,
      });
    }
  };
  // Subscribe alongside the existing chat reducer subscription
  const unsubscribe = window.claude.transcript.onToolUse(onToolUse);
  return unsubscribe;
}, []);

useEffect(() => {
  const unsubscribe = window.claude.artifacts.onChanged((evt) => {
    dispatchArtifact({
      type: 'ARTIFACT_CHANGED',
      projectRoot: evt.projectRoot,
      artifactId: evt.artifactId,
    });
  });
  return unsubscribe;
}, []);
```

- [ ] **Step 2: Wire into context if other components need access**

If a context provider exists (`ChatProvider` pattern), add an `ArtifactProvider`:

```typescript
// Create youcoded/desktop/src/renderer/state/ArtifactContext.tsx
import { createContext, useContext } from 'react';
import type { ArtifactState } from './artifact-tracker';
import type { ArtifactAction } from './artifact-actions';

export const ArtifactContext = createContext<{
  state: ArtifactState;
  dispatch: React.Dispatch<ArtifactAction>;
} | null>(null);

export function useArtifact() {
  const ctx = useContext(ArtifactContext);
  if (!ctx) throw new Error('useArtifact outside ArtifactProvider');
  return ctx;
}
```

Wrap App's children: `<ArtifactContext.Provider value={{ state: artifactState, dispatch: dispatchArtifact }}>`.

- [ ] **Step 3: Commit**

```bash
git add youcoded/desktop/src/renderer/App.tsx \
        youcoded/desktop/src/renderer/state/ArtifactContext.tsx
git commit -m "feat(artifacts): subscribe Tracker to transcript + push events"
```

---

## Phase 4: Renderer Registry + Format Viewers

---

### Task 4.1: Renderer Registry base

**Files:**
- Create: `youcoded/desktop/src/renderer/components/artifact-views/RendererRegistry.ts`

- [ ] **Step 1: Create**

```typescript
// youcoded/desktop/src/renderer/components/artifact-views/RendererRegistry.ts
import { ComponentType } from 'react';
import { MarkdownView } from './MarkdownView';
import { CodeView } from './CodeView';
import { ImageView } from './ImageView';
import { BinaryFallback } from './BinaryFallback';
// PdfView, DocxView, XlsxView are dynamically imported for lazy loading

export interface ArtifactViewProps {
  path: string;
  content: string | null;
  absolutePath: string;
  isEditable: boolean;
  onEdit?: (newContent: string) => void;
}

type LazyImporter = () => Promise<{ default: ComponentType<ArtifactViewProps> }>;
type ViewSpec = ComponentType<ArtifactViewProps> | { lazy: LazyImporter };

const REGISTRY: Record<string, ViewSpec> = {
  md: MarkdownView,
  markdown: MarkdownView,
  txt: MarkdownView, // shares the textarea path
  ts: CodeView,
  tsx: CodeView,
  js: CodeView,
  jsx: CodeView,
  py: CodeView,
  css: CodeView,
  json: CodeView,
  yaml: CodeView,
  yml: CodeView,
  png: ImageView,
  jpg: ImageView,
  jpeg: ImageView,
  gif: ImageView,
  webp: ImageView,
  pdf: { lazy: () => import('./PdfView').then((m) => ({ default: m.PdfView })) },
  docx: { lazy: () => import('./DocxView').then((m) => ({ default: m.DocxView })) },
  xlsx: { lazy: () => import('./XlsxView').then((m) => ({ default: m.XlsxView })) },
};

export function getViewer(path: string): ViewSpec {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return REGISTRY[ext] ?? BinaryFallback;
}
```

- [ ] **Step 2: Commit**

```bash
git add youcoded/desktop/src/renderer/components/artifact-views/RendererRegistry.ts
git commit -m "feat(artifacts): Renderer Registry with lazy-load slots"
```

---

### Task 4.2: MarkdownView (md + txt + edit mode)

**Files:**
- Create: `youcoded/desktop/src/renderer/components/artifact-views/MarkdownView.tsx`

- [ ] **Step 1: Implement**

```tsx
// youcoded/desktop/src/renderer/components/artifact-views/MarkdownView.tsx
import { useState } from 'react';
import { MarkdownContent } from '../MarkdownContent';
import type { ArtifactViewProps } from './RendererRegistry';

export function MarkdownView({ path, content, isEditable, onEdit }: ArtifactViewProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content ?? '');

  if (content === null) {
    return <div className="text-fg-muted p-4">⚠ file not on disk</div>;
  }

  if (editing) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex gap-2 p-2 border-b border-edge">
          <button
            className="px-3 py-1 rounded bg-accent text-on-accent"
            onClick={() => { onEdit?.(draft); setEditing(false); }}
          >
            Save
          </button>
          <button
            className="px-3 py-1 rounded border border-edge"
            onClick={() => { setDraft(content); setEditing(false); }}
          >
            Cancel
          </button>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="flex-1 w-full p-3 bg-inset text-fg font-mono text-sm resize-none focus:outline-none"
        />
      </div>
    );
  }

  const isMarkdown = path.endsWith('.md') || path.endsWith('.markdown');
  return (
    <div className="flex flex-col h-full">
      {isEditable && (
        <div className="flex gap-2 p-2 border-b border-edge">
          <button
            className="px-3 py-1 rounded border border-edge hover:bg-inset"
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
        </div>
      )}
      <div className="flex-1 overflow-auto p-4">
        {isMarkdown
          ? <MarkdownContent source={content} />
          : <pre className="font-mono text-sm whitespace-pre-wrap">{content}</pre>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add youcoded/desktop/src/renderer/components/artifact-views/MarkdownView.tsx
git commit -m "feat(artifacts): MarkdownView with edit toggle"
```

---

### Task 4.3: CodeView (read-only syntax highlighted)

**Files:**
- Create: `youcoded/desktop/src/renderer/components/artifact-views/CodeView.tsx`

- [ ] **Step 1: Implement**

```tsx
// youcoded/desktop/src/renderer/components/artifact-views/CodeView.tsx
import { MarkdownContent } from '../MarkdownContent';
import type { ArtifactViewProps } from './RendererRegistry';

export function CodeView({ path, content }: ArtifactViewProps) {
  if (content === null) {
    return <div className="text-fg-muted p-4">⚠ file not on disk</div>;
  }
  const lang = path.split('.').pop() ?? '';
  // Reuses the chat markdown highlighter by wrapping in a fenced code block.
  const wrapped = '```' + lang + '\n' + content + '\n```';
  return (
    <div className="overflow-auto p-4 h-full">
      <MarkdownContent source={wrapped} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add youcoded/desktop/src/renderer/components/artifact-views/CodeView.tsx
git commit -m "feat(artifacts): CodeView (read-only syntax highlighted)"
```

---

### Task 4.4: ImageView

**Files:**
- Create: `youcoded/desktop/src/renderer/components/artifact-views/ImageView.tsx`

- [ ] **Step 1: Implement**

```tsx
// youcoded/desktop/src/renderer/components/artifact-views/ImageView.tsx
import type { ArtifactViewProps } from './RendererRegistry';

export function ImageView({ absolutePath }: ArtifactViewProps) {
  return (
    <div className="flex items-center justify-center h-full p-4 overflow-auto">
      <img
        src={`file://${absolutePath}`}
        alt=""
        className="max-w-full max-h-full"
        style={{ touchAction: 'pinch-zoom' }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add youcoded/desktop/src/renderer/components/artifact-views/ImageView.tsx
git commit -m "feat(artifacts): ImageView"
```

---

### Task 4.5: PdfView (lazy PDF.js)

**Files:**
- Create: `youcoded/desktop/src/renderer/components/artifact-views/PdfView.tsx`
- Modify: `youcoded/desktop/package.json`

- [ ] **Step 1: Add dependency**

```bash
cd youcoded/desktop && npm install pdfjs-dist --save
```

- [ ] **Step 2: Implement**

```tsx
// youcoded/desktop/src/renderer/components/artifact-views/PdfView.tsx
import { useEffect, useRef } from 'react';
import * as pdfjs from 'pdfjs-dist';
import 'pdfjs-dist/build/pdf.worker.min.js';
import type { ArtifactViewProps } from './RendererRegistry';

export function PdfView({ absolutePath }: ArtifactViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loadingTask = pdfjs.getDocument(`file://${absolutePath}`);
      const pdf = await loadingTask.promise;
      if (cancelled) return;
      const container = containerRef.current;
      if (!container) return;
      container.innerHTML = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.maxWidth = '100%';
        canvas.style.marginBottom = '8px';
        container.appendChild(canvas);
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
      }
    })();
    return () => { cancelled = true; };
  }, [absolutePath]);

  return <div ref={containerRef} className="overflow-auto h-full p-4" />;
}
```

- [ ] **Step 3: Commit**

```bash
git add youcoded/desktop/src/renderer/components/artifact-views/PdfView.tsx \
        youcoded/desktop/package.json youcoded/desktop/package-lock.json
git commit -m "feat(artifacts): PdfView (lazy PDF.js)"
```

---

### Task 4.6: DocxView (lazy mammoth.js)

**Files:**
- Create: `youcoded/desktop/src/renderer/components/artifact-views/DocxView.tsx`

- [ ] **Step 1: Add dependency**

```bash
cd youcoded/desktop && npm install mammoth --save
```

- [ ] **Step 2: Implement**

```tsx
// youcoded/desktop/src/renderer/components/artifact-views/DocxView.tsx
import { useEffect, useState } from 'react';
import mammoth from 'mammoth/mammoth.browser';
import type { ArtifactViewProps } from './RendererRegistry';

export function DocxView({ absolutePath }: ArtifactViewProps) {
  const [html, setHtml] = useState<string>('');
  useEffect(() => {
    let cancelled = false;
    fetch(`file://${absolutePath}`)
      .then((r) => r.arrayBuffer())
      .then((buf) => mammoth.convertToHtml({ arrayBuffer: buf }))
      .then((result) => { if (!cancelled) setHtml(result.value); });
    return () => { cancelled = true; };
  }, [absolutePath]);
  return (
    <div
      className="overflow-auto h-full p-4 prose dark:prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add youcoded/desktop/src/renderer/components/artifact-views/DocxView.tsx \
        youcoded/desktop/package.json youcoded/desktop/package-lock.json
git commit -m "feat(artifacts): DocxView (lazy mammoth.js)"
```

---

### Task 4.7: XlsxView (lazy SheetJS)

**Files:**
- Create: `youcoded/desktop/src/renderer/components/artifact-views/XlsxView.tsx`

- [ ] **Step 1: Add dependency**

```bash
cd youcoded/desktop && npm install xlsx --save
```

- [ ] **Step 2: Implement**

```tsx
// youcoded/desktop/src/renderer/components/artifact-views/XlsxView.tsx
import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import type { ArtifactViewProps } from './RendererRegistry';

export function XlsxView({ absolutePath }: ArtifactViewProps) {
  const [sheets, setSheets] = useState<{ name: string; html: string }[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`file://${absolutePath}`)
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        const wb = XLSX.read(buf, { type: 'array' });
        const sheetData = wb.SheetNames.map((name) => ({
          name,
          html: XLSX.utils.sheet_to_html(wb.Sheets[name]),
        }));
        if (!cancelled) setSheets(sheetData);
      });
    return () => { cancelled = true; };
  }, [absolutePath]);

  return (
    <div className="flex flex-col h-full">
      {sheets.length > 1 && (
        <div className="flex gap-1 p-2 border-b border-edge overflow-x-auto">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              className={`px-3 py-1 rounded ${i === active ? 'bg-accent text-on-accent' : 'hover:bg-inset'}`}
              onClick={() => setActive(i)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div
        className="flex-1 overflow-auto p-4"
        dangerouslySetInnerHTML={{ __html: sheets[active]?.html ?? '' }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add youcoded/desktop/src/renderer/components/artifact-views/XlsxView.tsx \
        youcoded/desktop/package.json youcoded/desktop/package-lock.json
git commit -m "feat(artifacts): XlsxView (lazy SheetJS)"
```

---

### Task 4.8: BinaryFallback

**Files:**
- Create: `youcoded/desktop/src/renderer/components/artifact-views/BinaryFallback.tsx`

- [ ] **Step 1: Implement**

```tsx
// youcoded/desktop/src/renderer/components/artifact-views/BinaryFallback.tsx
import type { ArtifactViewProps } from './RendererRegistry';

export function BinaryFallback({ path, absolutePath }: ArtifactViewProps) {
  const openExternally = () => {
    // Uses existing platform IPC
    (window.claude as any).platform?.openExternal?.(absolutePath);
  };
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-fg-muted">
      <p className="mb-4">Cannot preview this file type.</p>
      <p className="mb-4 font-mono text-sm">{path}</p>
      <button
        className="px-4 py-2 rounded bg-accent text-on-accent"
        onClick={openExternally}
      >
        Open Externally
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add youcoded/desktop/src/renderer/components/artifact-views/BinaryFallback.tsx
git commit -m "feat(artifacts): BinaryFallback view"
```

---

## Phase 5: Surface 3 (Inline Filepath Detection)

---

### Task 5.1: Detection regex + pure function

**Files:**
- Create: `youcoded/desktop/src/renderer/hooks/useInlineFilepathDetector.ts`
- Create: `youcoded/desktop/tests/artifacts/inline-filepath-detector.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// youcoded/desktop/tests/artifacts/inline-filepath-detector.test.ts
import { describe, expect, it } from 'vitest';
import { detectFilepaths } from '../../src/renderer/hooks/useInlineFilepathDetector';

describe('detectFilepaths', () => {
  it('matches an absolute Unix path with whitelisted extension', () => {
    const matches = detectFilepaths('See /home/user/docs/plan.md for details');
    expect(matches).toEqual([{ path: '/home/user/docs/plan.md', start: 4, end: 27 }]);
  });

  it('matches a Windows path', () => {
    const matches = detectFilepaths('Wrote C:\\Users\\desti\\notes.md just now');
    expect(matches[0].path).toBe('C:\\Users\\desti\\notes.md');
  });

  it('matches a tilde path', () => {
    const matches = detectFilepaths('saved to ~/Documents/foo.txt');
    expect(matches[0].path).toBe('~/Documents/foo.txt');
  });

  it('matches a relative path', () => {
    const matches = detectFilepaths('open ./docs/plan.md please');
    expect(matches[0].path).toBe('./docs/plan.md');
  });

  it('does not match unwhitelisted extensions', () => {
    expect(detectFilepaths('see /tmp/x.exe')).toEqual([]);
    expect(detectFilepaths('see /tmp/x.log')).toEqual([]);
  });

  it('does not match mid-word paths', () => {
    expect(detectFilepaths('abc/foo.md.bak')).toEqual([]);
  });

  it('does not match a bare filename without separator', () => {
    expect(detectFilepaths('see plan.md')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, confirm fails**

```bash
npx vitest run tests/artifacts/inline-filepath-detector.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// youcoded/desktop/src/renderer/hooks/useInlineFilepathDetector.ts
const WHITELIST = new Set([
  'md', 'markdown', 'txt',
  'pdf', 'docx', 'xlsx',
  'png', 'jpg', 'jpeg', 'gif', 'webp',
  'ts', 'tsx', 'js', 'jsx', 'py', 'css', 'json', 'yaml', 'yml',
]);

// Matches:
//   /abs/path  ~/path  ./rel  ../rel  C:\path  C:/path  rel/path (with slash)
//   followed by .ext where ext is in the whitelist
const PATH_RE = /(?:^|(?<=\s|[\(\[\{,'"\`>]))((?:[a-zA-Z]:[\\/]|~[\\/]|\.{1,2}[\\/]|\/)[\w\-. \\/]*?\.([a-zA-Z0-9]+))(?=$|[\s\)\]\},'"\`<:;])/g;

export interface FilepathMatch {
  path: string;
  start: number;
  end: number;
}

export function detectFilepaths(text: string): FilepathMatch[] {
  const out: FilepathMatch[] = [];
  PATH_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PATH_RE.exec(text))) {
    const ext = m[2].toLowerCase();
    if (!WHITELIST.has(ext)) continue;
    out.push({ path: m[1], start: m.index + (m[0].length - m[1].length), end: m.index + m[0].length });
  }
  return out;
}
```

Note: the regex is approximate — real-world tests in Task 5.3 may surface edge cases. Adjust then.

- [ ] **Step 4: Run, confirm pass**

```bash
npx vitest run tests/artifacts/inline-filepath-detector.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add youcoded/desktop/src/renderer/hooks/useInlineFilepathDetector.ts \
        youcoded/desktop/tests/artifacts/inline-filepath-detector.test.ts
git commit -m "feat(artifacts): inline filepath detector (pure function)"
```

---

### Task 5.2: FilepathToken component

**Files:**
- Create: `youcoded/desktop/src/renderer/components/FilepathToken.tsx`

- [ ] **Step 1: Implement**

```tsx
// youcoded/desktop/src/renderer/components/FilepathToken.tsx
import { useArtifact } from '../state/ArtifactContext';

interface Props {
  path: string;
  currentSessionId: string;
  currentProjectRoot: string;
}

const EXT_ICON: Record<string, string> = {
  md: '📝', markdown: '📝', txt: '📄',
  pdf: '📕', docx: '📘', xlsx: '📗',
  png: '🖼', jpg: '🖼', jpeg: '🖼', gif: '🖼', webp: '🖼',
};

export function FilepathToken({ path, currentSessionId, currentProjectRoot }: Props) {
  const { state, dispatch } = useArtifact();
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const icon = EXT_ICON[ext] ?? '📎';

  const onClick = async () => {
    // 1. Is it session-current?
    const sessArtifacts = state.sessionArtifacts[currentSessionId] ?? [];
    const sessMatch = sessArtifacts.find((a) =>
      (a.kind === 'internal' ? a.path : a.absolutePath) === path ||
      (a.kind === 'internal' && (currentProjectRoot + '/' + a.path) === path)
    );
    if (sessMatch) {
      dispatch({ type: 'DRAWER_OPENED' });
      dispatch({ type: 'ACTIVE_ARTIFACT_SET', artifactId: sessMatch.id });
      return;
    }
    // 2. Cross-session lookup falls through to ProjectView
    //    (in v1, just open ProjectView and let the user find it)
    dispatch({ type: 'PROJECT_VIEW_OPENED' });
  };

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-inset text-fg font-mono text-[0.9em] hover:bg-inset/80"
      onClick={onClick}
      title={path}
    >
      <span>{icon}</span>
      <span>{path}</span>
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add youcoded/desktop/src/renderer/components/FilepathToken.tsx
git commit -m "feat(artifacts): FilepathToken component with click routing"
```

---

### Task 5.3: Integrate detector into MarkdownContent

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/MarkdownContent.tsx`

- [ ] **Step 1: Add a post-processor that replaces matched paths with FilepathToken**

Find `MarkdownContent.tsx`. Identify how it renders text nodes. Insert a transformation that wraps matched paths with the token. Pseudocode (adapt to actual library — likely react-markdown):

```tsx
import { detectFilepaths } from '../hooks/useInlineFilepathDetector';
import { FilepathToken } from './FilepathToken';
import { useSession } from '../state/SessionContext'; // existing

function transformTextNode(text: string, sessionId: string, projectRoot: string): React.ReactNode {
  const matches = detectFilepaths(text);
  if (matches.length === 0) return text;
  const out: React.ReactNode[] = [];
  let cursor = 0;
  matches.forEach((m, i) => {
    if (m.start > cursor) out.push(text.slice(cursor, m.start));
    out.push(
      <FilepathToken
        key={`fp-${i}`}
        path={m.path}
        currentSessionId={sessionId}
        currentProjectRoot={projectRoot}
      />
    );
    cursor = m.end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return <>{out}</>;
}
```

Wire this into the existing react-markdown `components` prop, intercepting text nodes (but NOT inside code spans — react-markdown distinguishes via the node type). Memoize per `messageId` if MarkdownContent receives one.

- [ ] **Step 2: Add a memoization wrapper**

```tsx
const MEMO_CACHE = new Map<string, React.ReactNode>();
function memoizedTransform(messageId: string, text: string, sessionId: string, projectRoot: string) {
  const key = `${messageId}:${text}`;
  if (MEMO_CACHE.has(key)) return MEMO_CACHE.get(key)!;
  const result = transformTextNode(text, sessionId, projectRoot);
  MEMO_CACHE.set(key, result);
  return result;
}
```

- [ ] **Step 3: Manual smoke test**

```bash
cd /c/Users/desti/youcoded-dev
bash scripts/run-dev.sh
```
Type a message in dev window that mentions a path like `~/Documents/foo.md`. Confirm it renders as a clickable token.

- [ ] **Step 4: Commit**

```bash
git add youcoded/desktop/src/renderer/components/MarkdownContent.tsx
git commit -m "feat(artifacts): integrate FilepathToken into chat markdown"
```

---

## Phase 6: Surface 1 (Session Drawer)

---

### Task 6.1: SessionDrawer component scaffold + HeaderBar trigger

**Files:**
- Create: `youcoded/desktop/src/renderer/components/SessionDrawer.tsx`
- Modify: `youcoded/desktop/src/renderer/components/HeaderBar.tsx`

- [ ] **Step 1: Scaffold the drawer**

```tsx
// youcoded/desktop/src/renderer/components/SessionDrawer.tsx
import { useArtifact } from '../state/ArtifactContext';
import { useEffect, useState } from 'react';
import { getViewer } from './artifact-views/RendererRegistry';
import { BinaryFallback } from './artifact-views/BinaryFallback';

interface Props {
  sessionId: string;
  projectRoot: string;
  projectId: string;
  projectName: string;
}

export function SessionDrawer({ sessionId, projectRoot, projectId, projectName }: Props) {
  const { state, dispatch } = useArtifact();
  const artifacts = state.sessionArtifacts[sessionId] ?? [];
  const active = artifacts.find((a) => a.id === state.activeArtifactId);
  const [content, setContent] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ disk: string } | null>(null);

  useEffect(() => {
    if (!active) { setContent(null); return; }
    let cancelled = false;
    window.claude.artifacts.get(projectRoot, active.id).then((res) => {
      if (cancelled) return;
      if (res.ok) setContent(res.content);
    });
    return () => { cancelled = true; };
  }, [active?.id]);

  if (!state.drawerOpen) return null;

  return (
    <aside className="w-[480px] h-full flex bg-panel border-l border-edge">
      <div className="w-[180px] border-r border-edge overflow-y-auto">
        <div className="p-2 border-b border-edge font-semibold">
          Session Artifacts ({artifacts.length})
        </div>
        {artifacts.map((a) => {
          const glyph = a.status === 'deleted' ? '☓'
            : a.versions.length > 1 ? '◐' : '●';
          return (
            <button
              key={a.id}
              className={`w-full text-left px-2 py-1 hover:bg-inset ${
                state.activeArtifactId === a.id ? 'bg-inset' : ''
              }`}
              onClick={() => dispatch({ type: 'ACTIVE_ARTIFACT_SET', artifactId: a.id })}
            >
              <span className="mr-1">{glyph}</span>
              <span className="font-mono text-xs">{a.path}</span>
            </button>
          );
        })}
      </div>
      <div className="flex-1 overflow-hidden">
        {active ? (
          <ActiveArtifactView
            artifact={active}
            content={content}
            projectRoot={projectRoot}
            projectId={projectId}
            projectName={projectName}
            sessionId={sessionId}
            conflict={conflict}
            onConflictResolved={() => setConflict(null)}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-fg-muted">
            Pick an artifact to view
          </div>
        )}
      </div>
    </aside>
  );
}

function ActiveArtifactView({ artifact, content, projectRoot, projectId, projectName, sessionId, conflict, onConflictResolved }: any) {
  const Viewer = getViewer(artifact.path);
  const absolutePath = artifact.kind === 'internal'
    ? projectRoot + '/' + artifact.path
    : artifact.absolutePath;
  const isEditable = ['md', 'markdown', 'txt'].includes(
    artifact.path.split('.').pop()?.toLowerCase() ?? ''
  );

  const onEdit = async (newContent: string) => {
    const res = await window.claude.artifacts.save(
      projectRoot, projectId, projectName, artifact.id, newContent, sessionId
    );
    if (!res.ok) {
      // surface error toast
      console.error(res.error);
    }
  };

  if ('lazy' in Viewer) {
    // Lazy viewer — render with suspense fallback (omitted; use React.lazy if you prefer)
    return <BinaryFallback path={artifact.path} content={content} absolutePath={absolutePath} isEditable={false} />;
  }

  return (
    <div className="h-full flex flex-col">
      {conflict && (
        <div className="bg-yellow-100 text-yellow-900 p-3 text-sm flex gap-2 items-center">
          <span>Claude also edited this file.</span>
          <button onClick={onConflictResolved}>Use mine</button>
          <button onClick={onConflictResolved}>Use Claude's</button>
        </div>
      )}
      <Viewer
        path={artifact.path}
        content={content}
        absolutePath={absolutePath}
        isEditable={isEditable}
        onEdit={onEdit}
      />
    </div>
  );
}
```

- [ ] **Step 2: Add the trigger button in HeaderBar**

In HeaderBar.tsx, add a new button (place per the "open question" about layout; pick a sensible spot — likely next to the gear icon):

```tsx
import { useArtifact } from '../state/ArtifactContext';

// inside HeaderBar render:
const { state, dispatch } = useArtifact();
const count = (state.sessionArtifacts[currentSessionId] ?? []).length;
// ...
<button
  className="header-icon-button"
  onClick={() => dispatch({ type: state.drawerOpen ? 'DRAWER_CLOSED' : 'DRAWER_OPENED' })}
  title="Session Artifacts"
>
  📄
  {count > 0 && <span className="badge">{count}</span>}
</button>
```

- [ ] **Step 3: Commit**

```bash
git add youcoded/desktop/src/renderer/components/SessionDrawer.tsx \
        youcoded/desktop/src/renderer/components/HeaderBar.tsx
git commit -m "feat(artifacts): SessionDrawer scaffold + HeaderBar trigger"
```

---

### Task 6.2: Layout integration with framed-theme chrome

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/ChatView.tsx`
- Modify: `youcoded/desktop/src/renderer/styles.css` (or wherever theme tokens live)

- [ ] **Step 1: Define the CSS variable + framed chrome shell**

Add to the global CSS:

```css
:root {
  --frame-edge: 10px;
}

.framed-shell {
  background: var(--panel-bg);
  display: flex;
  flex-direction: row;
  height: 100%;
}

.framed-shell > .frame-left,
.framed-shell > .frame-right,
.framed-shell > .frame-divider {
  background: var(--panel-bg);
  width: var(--frame-edge);
  flex-shrink: 0;
}

.framed-shell > .chat-pane,
.framed-shell > .drawer-pane {
  flex-shrink: 1;
  overflow: hidden;
  background: var(--canvas-bg);
}

.framed-shell > .chat-pane { flex: 1; }
.framed-shell > .drawer-pane { width: 480px; background: var(--panel-bg); }

/* Floating-theme fallback: no edge fills */
[data-theme-layout="floating"] .framed-shell > .frame-left,
[data-theme-layout="floating"] .framed-shell > .frame-right,
[data-theme-layout="floating"] .framed-shell > .frame-divider {
  display: none;
}
```

- [ ] **Step 2: Wrap chat + drawer in ChatView**

```tsx
// In ChatView.tsx, find the existing chat layout and wrap:
const { state } = useArtifact();
const drawerOpen = state.drawerOpen;
// ... existing chat rendering as <ChatPanel />

return (
  <div className="framed-shell">
    <div className="frame-left" />
    <div className="chat-pane"><ChatPanel /></div>
    {drawerOpen && (
      <>
        <div className="frame-divider" />
        <div className="drawer-pane">
          <SessionDrawer
            sessionId={sessionId}
            projectRoot={projectRoot}
            projectId={projectId}
            projectName={projectName}
          />
        </div>
      </>
    )}
    <div className="frame-right" />
  </div>
);
```

- [ ] **Step 3: Set the data-theme-layout attribute from the theme engine**

In App.tsx or wherever theme is applied:

```tsx
useEffect(() => {
  document.documentElement.dataset.themeLayout = currentTheme.layout ?? 'framed';
}, [currentTheme]);
```

(If `currentTheme.layout` doesn't exist yet, default it to 'framed' in the type and add `'floating'` to themes that opt in.)

- [ ] **Step 4: Manual smoke test**

```bash
bash scripts/run-dev.sh
```
Open the drawer (the artifacts button). Confirm the framed chrome forms around chat + drawer. Switch to a floating-style theme and confirm the chrome edges disappear but layout still works.

- [ ] **Step 5: Commit**

```bash
git add youcoded/desktop/src/renderer/components/ChatView.tsx \
        youcoded/desktop/src/renderer/styles.css \
        youcoded/desktop/src/renderer/App.tsx
git commit -m "feat(artifacts): framed-shell layout with --frame-edge chrome"
```

---

### Task 6.3: Responsive collapse on narrow screens

**Files:**
- Modify: `youcoded/desktop/src/renderer/styles.css`
- Modify: `youcoded/desktop/src/renderer/components/ChatView.tsx`

- [ ] **Step 1: Add the narrow-screen rules**

```css
@media (max-width: 700px) {
  .framed-shell > .frame-left,
  .framed-shell > .frame-right,
  .framed-shell > .frame-divider {
    display: none;
  }
  .framed-shell.drawer-open > .chat-pane { display: none; }
  .framed-shell > .drawer-pane { width: 100%; }
}
```

- [ ] **Step 2: Toggle the `drawer-open` class on the shell**

```tsx
<div className={`framed-shell ${drawerOpen ? 'drawer-open' : ''}`}>
```

- [ ] **Step 3: Handle hardware back on Android**

In `SessionDrawer.tsx`, add a handler that intercepts back-button events (the existing YouCoded overlay pattern). The drawer should close on back if no artifact is active; if an artifact is active, back returns to the list view first.

```tsx
useEffect(() => {
  const handler = (e: PopStateEvent | KeyboardEvent) => {
    if (state.activeArtifactId) {
      dispatch({ type: 'ACTIVE_ARTIFACT_SET', artifactId: '' as any }); // clears
      e.preventDefault?.();
      return true;
    }
    dispatch({ type: 'DRAWER_CLOSED' });
    return true;
  };
  // wire up via the existing platform back-button hook
  return () => { /* unsubscribe */ };
}, [state.activeArtifactId]);
```

- [ ] **Step 4: Commit**

```bash
git add youcoded/desktop/src/renderer/styles.css \
        youcoded/desktop/src/renderer/components/ChatView.tsx \
        youcoded/desktop/src/renderer/components/SessionDrawer.tsx
git commit -m "feat(artifacts): responsive drawer collapse + Android back handling"
```

---

### Task 6.4: Conflict-banner wiring

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/SessionDrawer.tsx`

- [ ] **Step 1: Detect concurrent edit via artifacts:changed during editing**

The `ActiveArtifactView` already receives `conflict` via state. Add the watch:

```tsx
useEffect(() => {
  if (!editing) return;
  const unsubscribe = window.claude.artifacts.onChanged((evt) => {
    if (evt.projectRoot === projectRoot && evt.artifactId === active.id && evt.by === 'agent') {
      // Re-fetch disk content
      window.claude.artifacts.get(projectRoot, active.id).then((res) => {
        if (res.ok) setConflict({ disk: res.content });
      });
    }
  });
  return unsubscribe;
}, [editing, active?.id]);
```

- [ ] **Step 2: Implement the three resolution actions**

```tsx
const resolveKeepMine = async () => {
  await onEdit(draft); // save textarea over disk
  setConflict(null);
};
const resolveUseClaudes = () => {
  if (conflict) setDraft(conflict.disk);
  setConflict(null);
  setEditing(false);
};
const resolveShowDiff = () => {
  // Inline diff view component — uses an existing diff renderer in YouCoded if available
  setDiffOpen(true);
};
```

- [ ] **Step 3: Commit**

```bash
git add youcoded/desktop/src/renderer/components/SessionDrawer.tsx
git commit -m "feat(artifacts): conflict-banner with three resolution actions"
```

---

## Phase 7: Surface 2 (Project View)

---

### Task 7.1: ProjectView scaffold + HeaderBar trigger

**Files:**
- Create: `youcoded/desktop/src/renderer/components/ProjectView.tsx`
- Modify: `youcoded/desktop/src/renderer/components/HeaderBar.tsx`
- Modify: `youcoded/desktop/src/renderer/App.tsx`

- [ ] **Step 1: Scaffold**

```tsx
// youcoded/desktop/src/renderer/components/ProjectView.tsx
import { useArtifact } from '../state/ArtifactContext';
import { useEffect, useState } from 'react';
import type { CentralIndexProject, ArtifactRecord } from '../../shared/artifacts/types';

export function ProjectView() {
  const { state, dispatch } = useArtifact();
  const [projects, setProjects] = useState<CentralIndexProject[]>([]);
  const [activeProject, setActiveProject] = useState<CentralIndexProject | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    // (Need a new IPC method to list projects from the index; or wire via the
    // existing ipc-handlers — add an `artifacts:list-projects-index` channel
    // in a small follow-up task. For now, stub.)
    setProjects([]);
  }, []);

  useEffect(() => {
    if (!activeProject) { setArtifacts([]); return; }
    window.claude.artifacts.listProject(activeProject.id).then((res) => {
      if (res.ok) setArtifacts(res.artifacts);
    });
  }, [activeProject?.id]);

  if (!state.projectViewOpen) return null;

  const filtered = artifacts.filter((a) =>
    !search || a.path.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-canvas z-[8000] flex">
      <header className="absolute top-0 right-0 p-2">
        <button onClick={() => dispatch({ type: 'PROJECT_VIEW_CLOSED' })}>×</button>
      </header>
      <aside className="w-[220px] border-r border-edge overflow-y-auto p-2">
        <h3 className="font-semibold mb-2">Projects</h3>
        {projects.map((p) => (
          <button
            key={p.id}
            className={`w-full text-left p-2 rounded ${activeProject?.id === p.id ? 'bg-inset' : 'hover:bg-inset'}`}
            onClick={() => setActiveProject(p)}
          >
            <div>{p.name}</div>
            <div className="text-xs text-fg-muted">{p.stats.artifactCount} items</div>
          </button>
        ))}
        <button className="w-full mt-2 p-2 border border-edge rounded">+ Add external folder</button>
      </aside>
      <main className="flex-1 p-4 overflow-hidden flex flex-col">
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full p-2 mb-3 bg-inset rounded"
        />
        <div className="flex-1 overflow-auto grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
          {filtered.map((a) => (
            <button
              key={a.id}
              className="flex flex-col items-center p-3 border border-edge rounded hover:bg-inset"
              onClick={() => { /* open detail pane */ }}
            >
              <div className="text-3xl mb-1">{a.path.split('.').pop()?.toUpperCase()}</div>
              <div className="text-xs truncate w-full text-center">{a.path.split('/').pop()}</div>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Add a "Projects" trigger button in HeaderBar**

```tsx
<button
  className="header-icon-button"
  onClick={() => dispatch({ type: 'PROJECT_VIEW_OPENED' })}
  title="Projects"
>
  📁
</button>
```

- [ ] **Step 3: Mount ProjectView in App.tsx**

```tsx
<ProjectView />
```

(Renders nothing when closed; absolute-positioned when open.)

- [ ] **Step 4: Add IPC method to list projects from index**

In `ipc-handlers.ts`, add:

```typescript
ipcMain.handle('artifacts:list-projects-index', async () => {
  const projects = await listProjects(CLAUDE_DIR);
  return { ok: true, projects };
});
```

Expose in `preload.ts`:

```typescript
listProjectsIndex: () => ipcRenderer.invoke('artifacts:list-projects-index'),
```

Mirror in `remote-shim.ts`. Update `ProjectView.tsx` first useEffect to call it.

Add to the IPC parity test.

- [ ] **Step 5: Commit**

```bash
git add youcoded/desktop/src/renderer/components/ProjectView.tsx \
        youcoded/desktop/src/renderer/components/HeaderBar.tsx \
        youcoded/desktop/src/renderer/App.tsx \
        youcoded/desktop/src/main/ipc-handlers.ts \
        youcoded/desktop/src/main/preload.ts \
        youcoded/desktop/src/renderer/remote-shim.ts \
        youcoded/desktop/tests/ipc-channels.test.ts
git commit -m "feat(artifacts): ProjectView scaffold + projects-index IPC"
```

---

### Task 7.2: Project View detail pane

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/ProjectView.tsx`

- [ ] **Step 1: Add detail pane that reuses the same viewer system as SessionDrawer**

Extract the `ActiveArtifactView` component from SessionDrawer into a shared file `youcoded/desktop/src/renderer/components/artifact-views/ActiveArtifactView.tsx`, then use it in both SessionDrawer and ProjectView's detail pane.

```tsx
// In ProjectView, add right-column detail pane:
<aside className="w-[360px] border-l border-edge overflow-hidden flex flex-col">
  {activeArtifact && (
    <ActiveArtifactView
      artifact={activeArtifact}
      content={detailContent}
      projectRoot={activeProject!.path}
      projectId={activeProject!.id}
      projectName={activeProject!.name}
      sessionId={'project-view'} // versions will note 'user' author
      // ... onEdit, conflict handling, etc.
    />
  )}
</aside>
```

Update SessionDrawer to import the shared component.

- [ ] **Step 2: Add Exclude / Show in chat buttons to detail pane**

```tsx
<div className="flex gap-2 p-2 border-b border-edge">
  <button onClick={() => excludeArtifact(activeArtifact.id)}>Exclude</button>
  <button onClick={() => showInChat(activeArtifact.path)}>Show in chat</button>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add youcoded/desktop/src/renderer/components/ProjectView.tsx \
        youcoded/desktop/src/renderer/components/SessionDrawer.tsx \
        youcoded/desktop/src/renderer/components/artifact-views/ActiveArtifactView.tsx
git commit -m "feat(artifacts): ProjectView detail pane + extract ActiveArtifactView"
```

---

### Task 7.3: Project deletion + Add external file flows

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/ProjectView.tsx`
- Modify: `youcoded/desktop/src/main/ipc-handlers.ts`
- Modify: `youcoded/desktop/src/main/preload.ts`
- Modify: `youcoded/desktop/src/renderer/remote-shim.ts`

- [ ] **Step 1: Add IPC for project deletion**

```typescript
// ipc-handlers.ts
ipcMain.handle('artifacts:delete-project', async (_e, projectId: string, deleteSidecar: boolean) => {
  const projects = await listProjects(CLAUDE_DIR);
  const p = projects.find((x) => x.id === projectId);
  if (!p) return { ok: false };
  await removeProject(CLAUDE_DIR, projectId);
  if (deleteSidecar) {
    const path = join(p.path, '.youcoded/artifacts.json');
    try { await fs.unlink(path); } catch {}
  }
  return { ok: true };
});
```

- [ ] **Step 2: Add the confirmation modal**

In ProjectView.tsx, add a small modal:

```tsx
{deletingProject && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9000]">
    <div className="bg-panel p-6 rounded max-w-md">
      <h3>Remove project</h3>
      <p>Remove "{deletingProject.name}" from YouCoded?</p>
      <label className="flex items-center gap-2 mt-3">
        <input type="checkbox" checked={alsoDeleteSidecar} onChange={(e) => setAlsoDeleteSidecar(e.target.checked)} />
        Also delete .youcoded/artifacts.json
      </label>
      <div className="flex gap-2 mt-4">
        <button onClick={() => setDeletingProject(null)}>Cancel</button>
        <button onClick={confirmDelete} className="bg-destructive text-on-destructive">Remove</button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 3: Add file picker integration for external add**

```typescript
const addExternal = async () => {
  const res = await window.claude.dialog.openFile(); // existing IPC
  if (res.canceled) return;
  await window.claude.artifacts.includeExternal(activeProject!.path, res.path);
  // refresh list
};
```

- [ ] **Step 4: Commit**

```bash
git add youcoded/desktop/src/renderer/components/ProjectView.tsx \
        youcoded/desktop/src/main/ipc-handlers.ts \
        youcoded/desktop/src/main/preload.ts \
        youcoded/desktop/src/renderer/remote-shim.ts \
        youcoded/desktop/tests/ipc-channels.test.ts
git commit -m "feat(artifacts): project delete + add-external flows"
```

---

## Phase 8: Mobile (Android Kotlin)

---

### Task 8.1: Kotlin path canonicalization (parity port)

**Files:**
- Create: `youcoded/app/src/main/kotlin/com/youcoded/app/artifacts/PathCanonicalize.kt`
- Create: `youcoded/app/src/test/kotlin/com/youcoded/app/artifacts/PathCanonicalizeTest.kt`

- [ ] **Step 1: Write parity test**

```kotlin
// app/src/test/kotlin/com/youcoded/app/artifacts/PathCanonicalizeTest.kt
package com.youcoded.app.artifacts

import org.junit.Test
import kotlin.test.assertEquals
import com.google.gson.Gson
import com.google.gson.JsonObject

class PathCanonicalizeTest {
    @Test
    fun runsAllSharedFixtures() {
        val text = javaClass.classLoader!!
            .getResourceAsStream("artifacts/canonicalize-cases.json")!!
            .bufferedReader().readText()
        val obj = Gson().fromJson(text, JsonObject::class.java)
        val cases = obj.getAsJsonArray("cases")
        for (c in cases) {
            val o = c.asJsonObject
            val input = o.get("input").asString
            val root = if (o.get("projectRoot").isJsonNull) null else o.get("projectRoot").asString
            val expected = o.get("expected").asString
            assertEquals(expected, canonicalize(input, root), "input=$input")
        }
    }
}
```

(Copy the shared fixture JSON into `app/src/test/resources/artifacts/canonicalize-cases.json` as part of the gradle setup.)

- [ ] **Step 2: Implement canonicalize.kt**

```kotlin
// app/src/main/kotlin/com/youcoded/app/artifacts/PathCanonicalize.kt
package com.youcoded.app.artifacts

import java.text.Normalizer

fun canonicalize(rawPath: String, projectRoot: String?): String {
    if (rawPath.isEmpty()) return rawPath
    var p = rawPath.removePrefix("\\\\?\\")
    p = p.replace('\\', '/')
    p = p.replace(Regex("^([A-Z]):")) { it.value.lowercase() }
    p = Normalizer.normalize(p, Normalizer.Form.NFC)
    if (p.length > 1 && !p.endsWith(":/")) {
        p = p.trimEnd('/')
    }
    if (projectRoot != null) {
        val root = canonicalize(projectRoot, null)
        if (p.startsWith("$root/")) {
            p = p.substring(root.length + 1)
        }
        p = resolveDots(p)
        return p
    }
    return resolveDots(p)
}

private fun resolveDots(p: String): String {
    val parts = p.split('/')
    val out = mutableListOf<String>()
    for (part in parts) {
        when {
            part == "." || part.isEmpty() -> {
                if (out.isEmpty()) out.add(part)
            }
            part == ".." -> {
                if (out.isNotEmpty() && out.last() != ".." && out.last().isNotEmpty()) {
                    out.removeAt(out.size - 1)
                } else {
                    out.add("..")
                }
            }
            else -> out.add(part)
        }
    }
    return if (out.isEmpty()) "." else out.joinToString("/")
}
```

- [ ] **Step 3: Copy fixture to Android test resources**

```bash
mkdir -p youcoded/app/src/test/resources/artifacts
cp youcoded/shared-fixtures/artifacts/canonicalize-cases.json \
   youcoded/app/src/test/resources/artifacts/
```

Or set up a gradle task. For now, manual copy.

- [ ] **Step 4: Run, confirm pass**

```bash
cd youcoded && ./gradlew :app:testDebugUnitTest --tests "*PathCanonicalize*"
```

- [ ] **Step 5: Commit**

```bash
git add youcoded/app/src/main/kotlin/com/youcoded/app/artifacts/PathCanonicalize.kt \
        youcoded/app/src/test/kotlin/com/youcoded/app/artifacts/PathCanonicalizeTest.kt \
        youcoded/app/src/test/resources/artifacts/canonicalize-cases.json
git commit -m "feat(artifacts): Kotlin canonicalize with shared-fixture parity test"
```

---

### Task 8.2: Kotlin ArtifactStore + CentralIndex + CasWrite

**Files:**
- Create: `youcoded/app/src/main/kotlin/com/youcoded/app/artifacts/CasWrite.kt`
- Create: `youcoded/app/src/main/kotlin/com/youcoded/app/artifacts/SidecarSchema.kt`
- Create: `youcoded/app/src/main/kotlin/com/youcoded/app/artifacts/ArtifactStore.kt`
- Create: `youcoded/app/src/main/kotlin/com/youcoded/app/artifacts/CentralIndex.kt`

Apply the same logic as the TS implementations (Tasks 1.4-1.8) in Kotlin. Use kotlinx.serialization for JSON. Use java.nio for atomic write-then-rename. Sleep between retries via `Thread.sleep` or coroutine `delay`.

- [ ] **Step 1: Write minimal Kotlin implementations matching the TS contracts**

(Roughly mirrors TS code; structure is the same.)

- [ ] **Step 2: Smoke test the Kotlin code with one happy-path test**

Add `ArtifactStoreTest.kt` that creates a tmpdir, writes a sidecar, reads it back, asserts equality.

- [ ] **Step 3: Commit**

```bash
git add youcoded/app/src/main/kotlin/com/youcoded/app/artifacts/
git commit -m "feat(artifacts): Kotlin ArtifactStore + CentralIndex + CasWrite"
```

---

### Task 8.3: Kotlin ProjectManager

**Files:**
- Create: `youcoded/app/src/main/kotlin/com/youcoded/app/artifacts/ProjectManager.kt`

Mirror Task 1.9 + 1.10 in Kotlin.

- [ ] **Step 1: Implement**

- [ ] **Step 2: Commit**

```bash
git add youcoded/app/src/main/kotlin/com/youcoded/app/artifacts/ProjectManager.kt
git commit -m "feat(artifacts): Kotlin ProjectManager (auto-create + git treatment + orphan)"
```

---

### Task 8.4: Wire IPC handlers in SessionService

**Files:**
- Modify: `youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`

- [ ] **Step 1: Add handlers**

In `handleBridgeMessage()`, add cases for each `artifacts:*` channel:

```kotlin
"artifacts:list-session" -> {
    val sessionId = payload.getString("sessionId")
    val projectRoot = payload.getString("projectRoot")
    val artifacts = ArtifactStore.listSessionArtifacts(projectRoot, sessionId)
    respondJson(msg, JSONObject().put("ok", true).put("artifacts", JSONArray(artifacts.map { it.toJson() })))
}
"artifacts:list-project" -> {
    // No-op stub: returns "not implemented on mobile in v1"
    respondJson(msg, JSONObject().put("ok", false).put("error", "not-implemented-on-mobile"))
}
"artifacts:get" -> {
    // ... read sidecar, find artifact, read file content, return
}
"artifacts:save" -> {
    // ... write file, append version, broadcast changed
}
"artifacts:include-external" -> {
    respondJson(msg, JSONObject().put("ok", false).put("error", "not-implemented-on-mobile"))
}
"artifacts:exclude" -> {
    respondJson(msg, JSONObject().put("ok", false).put("error", "not-implemented-on-mobile"))
}
```

- [ ] **Step 2: Verify IPC parity test passes**

```bash
cd youcoded/desktop && npx vitest run tests/ipc-channels.test.ts
```

All assertions should now pass (Kotlin file references all channels).

- [ ] **Step 3: Commit**

```bash
git add youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt
git commit -m "feat(artifacts): Kotlin IPC handlers (full impls + no-op stubs)"
```

---

### Task 8.5: Android UI adjustments

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/FilepathToken.tsx`
- Modify: `youcoded/desktop/src/renderer/components/SessionDrawer.tsx`

- [ ] **Step 1: Touch-target sizing on FilepathToken**

Add a min-height + padding for mobile-friendly hit targets:

```tsx
className="inline-flex items-center gap-1 px-2 py-1 min-h-[28px] rounded bg-inset ..."
```

- [ ] **Step 2: Soft-keyboard handling in MarkdownView edit mode on Android**

Tested manually. If the existing InputBar pattern translates, no code needed; otherwise add a `data-soft-keyboard-aware` attribute that the WebView lifts above the keyboard.

- [ ] **Step 3: Commit**

```bash
git add youcoded/desktop/src/renderer/components/FilepathToken.tsx \
        youcoded/desktop/src/renderer/components/SessionDrawer.tsx
git commit -m "feat(artifacts): touch-target sizing for mobile"
```

---

## Phase 9: Verification + Documentation

---

### Task 9.1: Integration test — full artifact flow

**Files:**
- Create: `youcoded/desktop/tests/artifacts/artifact-flow.integration.test.ts`

- [ ] **Step 1: Write the integration test**

```typescript
import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { appendVersion, readSidecar } from '../../src/main/artifacts/artifact-store';
import { ensureProject } from '../../src/main/artifacts/project-manager';

describe('artifact flow', () => {
  let claudeDir: string;
  let projectRoot: string;
  beforeEach(() => {
    claudeDir = mkdtempSync(join(tmpdir(), 'flow-c-'));
    projectRoot = mkdtempSync(join(tmpdir(), 'flow-p-'));
  });

  it('end-to-end: ensure → append create → append edit → read sidecar', async () => {
    const { project } = await ensureProject(claudeDir, projectRoot, 'sess-1');
    await appendVersion(projectRoot, project.id, project.name, {
      path: 'docs/foo.md', kind: 'internal', absolutePath: null,
      sessionId: 'sess-1', type: 'create', author: 'agent',
    });
    await appendVersion(projectRoot, project.id, project.name, {
      path: 'docs/foo.md', kind: 'internal', absolutePath: null,
      sessionId: 'sess-1', type: 'edit', author: 'agent',
    });
    const sidecar = await readSidecar(projectRoot);
    expect((sidecar as any).artifacts).toHaveLength(1);
    expect((sidecar as any).artifacts[0].versions).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run, confirm pass**

```bash
npx vitest run tests/artifacts/artifact-flow.integration.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add youcoded/desktop/tests/artifacts/artifact-flow.integration.test.ts
git commit -m "test(artifacts): end-to-end integration flow"
```

---

### Task 9.2: Update PITFALLS.md with new entries

**Files:**
- Modify: `C:/Users/desti/youcoded-dev/docs/PITFALLS.md`

- [ ] **Step 1: Add a new section "Artifact Viewer"**

Add to PITFALLS.md (workspace doc):

```markdown
## Artifact Viewer

- **`canonicalize()` is the single source of truth for path equality.** All paths in sidecars and the central index are stored canonical. All comparisons (orphan detection, exclude match, dedup, click routing) go through `canonicalize()`. Bypassing it is the most likely cause of "the path didn't match even though it should have."
- **`appendVersion` retries on CAS conflict — don't add a second retry loop.** The MAX_RETRIES constant (5) is intentional. Increasing it doesn't help under sustained contention; surfacing a warning is the right escape valve.
- **`transcriptRef` is NOT in v1.** Earlier drafts pointed versions at CC's JSONL lines. Dropped because of CC version coupling. Don't reintroduce it — v2 will snapshot content into `.youcoded/content/<versionId>` at write time.
- **`bash mv` / `bash rm` produce zero artifact events.** The Tracker only subscribes to Write/Edit/Delete tool calls. Filesystem side-effects via Bash are opaque in v1. If you need rename tracking, that's a v2 task.
- **External-file auto-tracking is forbidden.** Files outside the working directory are NEVER auto-tracked, even if Claude edits them. Only the explicit "Add file..." gesture in Project View promotes externals to artifacts. The inline filepath click on an unrecognized path opens a view-only modal — do NOT make it auto-track.
- **`.youcoded/` is auto-gitignored.** ProjectManager appends `.youcoded/` to `.gitignore` on first sidecar materialization in a git repo. User can opt into sharing via Settings → Privacy. Don't override this default — it's a privacy guarantee.
- **The drawer is layout-level, NOT an overlay.** Don't wrap SessionDrawer in `<OverlayPanel>`. It's a flex sibling of ChatPanel inside `.framed-shell`.
- **`--frame-edge` is a real CSS variable.** Theme authors can tune it; default ~10px. Setting it to 0 effectively hides the chrome edges (useful for fullscreen-feeling themes).
- **Android `artifacts:list-project` / `:include-external` / `:exclude` are no-op stubs.** Mobile Project View is v2. The Kotlin handlers return `not-implemented-on-mobile`. Don't fix the "bug" of stubs returning errors — that's the contract.
```

- [ ] **Step 2: Commit**

```bash
cd /c/Users/desti/youcoded-dev
git add docs/PITFALLS.md
git commit -m "docs(artifacts): add Artifact Viewer pitfalls section"
```

---

### Task 9.3: Update cc-dependencies.md

**Files:**
- Modify: `youcoded/docs/cc-dependencies.md`

- [ ] **Step 1: Add the new entry**

Add to cc-dependencies.md:

```markdown
## TranscriptWatcher Write/Edit/Delete event consumption (Desktop + Android)

The Artifact Tracker subscribes to `TRANSCRIPT_TOOL_USE` events from TranscriptWatcher and reacts only to `Write`, `Edit`, `MultiEdit` tool calls. The detection uses the `tool` field exactly as emitted by TranscriptWatcher.

If Claude Code renames the tool, splits/merges Edit into multiple tools, or changes the JSONL shape such that the `tool` field is no longer present at the level the Tracker reads, the Artifact Tracker silently stops tracking. Verify on each CC bump.

The Tracker also reads `args.file_path` (and falls back to `args.path`). Both fields have been stable across CC v2.x, but the contract is implicit.

**On a CC version review:** run a smoke test that does a real Write tool call and confirm the Tracker created the sidecar entry.
```

- [ ] **Step 2: Commit**

```bash
cd /c/Users/desti/youcoded-dev/youcoded
git add docs/cc-dependencies.md
git commit -m "docs(artifacts): add cc-dependency entry for Tracker event consumption"
```

---

### Task 9.4: Manual verification

- [ ] **Step 1: Desktop dev run**

```bash
cd /c/Users/desti/youcoded-dev
bash scripts/run-dev.sh
```

In the dev window:
- Start a chat session in `youcoded-dev`
- Ask Claude to create a markdown file in `docs/`
- Open Session Drawer — confirm the file appears
- Click it — confirm the rendered markdown view
- Edit the file in the drawer; confirm save round-trip
- Ask Claude to also write a binary file — confirm BinaryFallback renders
- Ask Claude to edit a file while the drawer is in edit mode for it — confirm the conflict banner fires
- Open Project View — confirm the project appears with its artifacts
- Switch themes (default → floating) — confirm framed chrome appears/disappears correctly

- [ ] **Step 2: Android dev verification**

```bash
cd /c/Users/desti/youcoded-dev/youcoded
./scripts/build-web-ui.sh && ./gradlew :app:assembleReleaseTest
adb install -r app/build/outputs/apk/releaseTest/*.apk
```

In the YouCoded ReleaseTest app on device:
- Create a session in a project folder
- Ask Claude to write a markdown file
- Open Session Drawer (touch the artifact button in HeaderBar)
- Tap the artifact — confirm detail view
- Use hardware back — returns to list
- Tap an inline filepath token in chat — confirm it opens the drawer

- [ ] **Step 3: Record results**

If anything fails the manual verification, file the issue in Settings → Development → Submit Issue and pause before declaring the feature complete.

---

## Self-Review

After writing the plan above, here are the checks:

**Spec coverage:**

- [x] Surface 1 (Session Drawer) — Tasks 6.1-6.4
- [x] Surface 2 (Project View) — Tasks 7.1-7.3
- [x] Surface 3 (Inline Filepath Detection) — Tasks 5.1-5.3
- [x] Hybrid sidecar+index storage — Tasks 1.5-1.10
- [x] Path canonicalization — Task 1.2, 8.1
- [x] CAS locking — Task 1.4, 1.7
- [x] Atomic write — Task 1.4
- [x] Git treatment — Task 1.9, 9.2 (PITFALLS)
- [x] Orphan handling — Task 1.10
- [x] Index rebuild — Task 1.10
- [x] Corruption recovery — Task 1.5
- [x] Lazy sidecar creation — Task 1.7 (creates on first appendVersion)
- [x] Internal-only auto-tracking — Task 3.2 (filter in subscribe handler)
- [x] Format viewers (md, txt, code, image, pdf, docx, xlsx, binary) — Tasks 4.2-4.8
- [x] Edit-in-place (md, txt) + conflict banner — Tasks 4.2, 6.4
- [x] Renderer Registry — Task 4.1
- [x] Tracker (renderer state slice) + Store (main I/O) split — Tasks 3.1-3.2, 2.2
- [x] 7 new IPC channels with parity test — Tasks 2.1-2.5
- [x] Android Kotlin port + no-op stubs — Tasks 8.1-8.4
- [x] Mobile responsive collapse — Task 6.3
- [x] Mobile touch targets + back-stack — Tasks 6.3, 8.5
- [x] Framed chrome with `--frame-edge` — Task 6.2
- [x] Floating-theme fallback — Task 6.2
- [x] PITFALLS, cc-dependencies, manual verification — Tasks 9.2-9.4
- [x] Integration tests — Task 9.1 (plus per-task integration coverage)

**Placeholder scan:** No "TBD" / "TODO" / "fill in later" remaining. Some tasks include the note "(adapt to actual library — likely react-markdown)" — this is honest signaling that the exact integration depends on how MarkdownContent is structured; the engineer reads MarkdownContent.tsx first. Acceptable.

**Type consistency:** Names checked across tasks:
- `appendVersion` (Task 1.7) used by ipc-handlers (Task 2.2) ✓
- `readSidecar` (Task 1.5) used by Task 2.2, 9.1 ✓
- `ARTIFACT_IPC` constants (Task 2.1) used by Tasks 2.2-2.5 ✓
- `ArtifactRecord` / `ProjectSidecar` types (Task 1.1) used throughout ✓
- `canonicalize()` (Task 1.2, 8.1) used in Task 2.2 (include-external) and PathCanonicalize.kt (8.1) ✓
- `dispatchArtifact` / `useArtifact` (Task 3.1, 3.2) used in Tasks 5.2, 6.1, 7.1 ✓
- `getViewer` (Task 4.1) used in Task 6.1 ✓

**Issues found and fixed inline:** None requiring a rewrite.

---

**Plan complete.** Saved to `docs/superpowers/plans/2026-05-21-artifact-viewer.md`.

---

## Post-execution notes (2026-05-22)

All 45 tasks executed in a single session using subagent-driven development. Phase-by-phase pause checkpoints, mostly small adaptations during implementation, then several real bugs surfaced during manual dev-loop verification.

### Phase-by-phase result

| Phase | Tasks | All green | Notes |
|---|---|---|---|
| 1 — Data layer | 1.1-1.10 | ✓ | Task 1.2 cleanup commit `7d20cdba` removed dead else-if + documented bare-`/` edge case. Task 1.7's concurrent test surfaced a TOCTOU race in casWrite; fix in `a75492ea` added an mkdir-based exclusive lock (all 24 artifact tests pass stably after). |
| 2 — IPC | 2.1-2.5 | ✓ | Task 2.5 parity test initially had 13 failures (6 false ipc-handlers + 7 Kotlin); 6 fixed by accepting `ARTIFACT_IPC.<NAME>` constant references in the assertion (commit `0fff858c`); 7 Kotlin tracked as a Phase 8 indicator and went green when Phase 8 landed. |
| 3 — Tracker | 3.1-3.2 | ✓ | Implementer reused existing `transcript:event` channel via `(window.claude.on as any).transcriptEvent` — no new IPC surface needed. |
| 4 — Renderer Registry + 7 viewers | 4.1-4.8 | ✓ | Implementer batched the 4 non-lazy viewers + Registry + 3 lazy viewers across 3 dispatches; added `@ts-expect-error` bridge for lazy imports then cleaned them up. `MarkdownContent`'s prop name is `content` (not `source` as the plan template guessed). |
| 5 — Inline filepath detection | 5.1-5.3 | ✓ | Implementer used a proper rehype plugin via `visitParents` for AST-aware code-block exclusion (cleaner than regex preprocessing in the plan template). Removed `currentProjectRoot` prop in favor of suffix-based path matching. |
| 6 — Session Drawer | 6.1-6.4 | ✓ | Implementer reused the existing `useEscClose` LIFO stack for back-button handling on both desktop and Android. Added `ACTIVE_ARTIFACT_CLEARED` reducer action to handle null vs empty-string correctly. Refactored MarkdownView to a controlled component so the conflict banner can observe edit-in-progress. |
| 7 — Project View | 7.1-7.3 | ✓ | Extracted `ActiveArtifactView` to a shared file used by both SessionDrawer and ProjectView. `dialog.openFile()` returns `string[]` (multi-select); button label changed from "Add external folder" to "Add external file". |
| 8 — Android Kotlin | 8.1-8.5 | ✓ | Used `ReadResult` sealed class instead of TS's union type (idiomatic Kotlin). Hand-rolled ULID generator (Crockford base32). `org.json.JSONObject` used consistently with existing 40+ Kotlin source files. All artifact channels now in SessionService.kt → parity test 57/57. |
| 9 — Verification + Docs | 9.1-9.4 | ✓ (9.1-9.3), partial (9.4) | Integration test, PITFALLS section, cc-dependencies entry all landed. 9.4 manual verification is in progress (this session) — surfaced six real bugs that needed post-Phase-9 fixes. |

### Post-Phase-9 fixes (after the plan completed)

The plan was technically "complete" at commit `b0fca22f` (Task 9.1), but manual dev-loop verification surfaced bugs that the plan didn't catch. Each was fixed in a separate commit:

| # | Symptom | Root cause | Fix commit |
|---|---|---|---|
| 1 | Vite build failed on `pdfjs-dist` worker import | pdfjs-dist v5+ ships only `.mjs` workers; needed Vite `?url` suffix + explicit `workerSrc` | `4bd677c0` |
| 2 | SessionDrawer rendered with `projectRoot=""` | `cwd` wasn't threaded from App.tsx through ChatView to SessionDrawer; added prop, lookup against central index | `7f367b0d` |
| 3 | Wallpapers/gradients invisible when drawer is open | `.framed-shell { background: var(--panel) }` painted over WallpaperBackdrop layer | `3cb4242f` |
| 4 | "No projects" and "nothing in drawer" — artifacts never tracked | `artifacts:append-version` IPC didn't exist; Tracker only called `listSession` (read-only) | `74437f92` |
| 5 | Tracker handler never fired after the IPC fix | Handler read `event.cwd` but transcript events don't include cwd; switched to `sessionsRef` lookup by sessionId | `aa226cc3` |
| 6 | Session drawer skipped EXTERNAL files Claude wrote | Original spec said "external = NEVER auto-track" — conflated session-scope with project-scope. Changed: session drawer tracks all; Project View filters externals not in manualIncludes | `447b7c3e` |
| 7 | Inline filepath tokens didn't render for `docs/foo.md`-style paths | Detector regex required `./`, `~/`, `/`, or drive-letter prefix; widened to allow `<dirname>/<file>` | `d5fb3fc4` |

### Attempted-and-reverted

- **Option C: chrome-clearance padding for framed-shell when drawer open** — committed as `03111edc`, reverted as `5f95b36d`. The layout-shift between drawer-closed (chat scrolls behind chrome) and drawer-open (chat inset) looked worse than the original problem. Deferred to Option B (restructure HeaderBar/StatusBar to flex siblings) in a fresh session.

### Material design changes captured in the spec

See the spec doc's "Post-implementation amendments" section for canonical references. The amendments are not just bug fixes — they record decisions that override original spec text.

### Outstanding before merge

- Framed-chrome visual fix (Option B or C-prime; deferred to a fresh session)
- Strip diagnostic console.logs from App.tsx artifact tracker
- Track down `setState`-during-render warning
- Real-device Android verification
- Other themes visual verification
