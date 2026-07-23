---
status: active
date: 2026-07-22
spec: docs/active/specs/2026-07-22-git-surface.md
mockup: https://claude.ai/code/artifact/522efb25-d56a-4483-9a7c-e5e1a431f262
---

# In-App Git Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-file git review in the SessionDrawer — footer entry (+/− counts, Review Changes →), a pushed review view of expandable cards (uncommitted first, then commits touching the file), stage/unstage, commit, discard.

**Architecture:** New main-process `src/main/git/` module shelling to the system `git` binary at the repo root (plain `git`, `cwd`-based — NOT the sync transport's hidden-GIT_DIR pattern). New `git:*` IPC channels across preload/remote-shim/Kotlin-stub with parity pinned. Renderer: a per-session `gitReviewBySession` flag in the artifact reducer, a footer hook in SessionDrawer, and a `GitReviewView` component reusing `UnifiedDiff`.

**Tech Stack:** Electron 41 main process (`execFile`, `fs.watch`, `shell.trashItem`), React 18 renderer, vitest (+jsdom/@testing-library for `.tsx`), Kotlin stub only.

## Global Constraints

- All code lands in the **youcoded** sub-repo (`youcoded/desktop/`, one Kotlin file). Work in a git worktree on branch `feat/git-surface` (superpowers:using-git-worktrees). The workspace repo gets NO code.
- **Mirror, not gate:** no UI copy or identifier may say approve/reject/accept. Staging state lives in the git index only — no app-local staging state.
- **Error strings** carry real git stderr (trimmed), never a guessed cause (`docs/error-message-standards.md`).
- **Never** set `GIT_DIR`/`GIT_WORK_TREE`; always plain `git` with `cwd` = repo root. `GIT_TERMINAL_PROMPT=0` always.
- New channel constants file must contain **no single-quoted strings in comments** (the parity test scans every `'…'` as a channel name).
- Desktop-only: Kotlin gets grouped `not-implemented-on-mobile` stubs; remote gets NO `remote-server.ts` cases (the server's default case auto-answers `unsupported:true` and the shim fast-rejects — renderer hooks must `.catch` to a hidden state).
- Radii/colors via theme tokens & shared primitives (`Button`, `Textarea`, `Scrim`, `OverlayPanel`) — never hand-rolled.
- Non-trivial edits get a WHY comment (Destin is a non-developer).
- Tests run from `youcoded/desktop`: `npx vitest run <file>` (or `npm test` for all). Main-process tests: node env, electron aliased to `tests/__mocks__/electron.ts`, HOME sandboxed.
- Commit after every task (conventional commits).

## File Map

| File | Role |
|---|---|
| `desktop/src/shared/git-types.ts` (new) | IPC payload types shared main↔renderer |
| `desktop/src/main/git/ipc-channels.ts` (new) | `GIT_IPC` constant map |
| `desktop/src/main/git/porcelain.ts` (new) | Pure parsers: porcelain v2, numstat, log records, unified diff → hunks |
| `desktop/src/main/git/git-exec.ts` (new) | `execGit`, repo-root resolution + cache |
| `desktop/src/main/git/git-service.ts` (new) | Operations: fileStatus, fileReview, commitFileDiff, stage, unstage, commit, discard |
| `desktop/src/main/git/git-watcher.ts` (new) | Debounced refcounted `fs.watch` on `.git/HEAD`+`index`+`refs/heads` |
| `desktop/src/main/ipc-handlers.ts` (modify) | `git:*` handler registration, root gate, `git:changed` broadcast |
| `desktop/src/main/preload.ts` (modify) | `window.claude.git.*` |
| `desktop/src/renderer/remote-shim.ts` (modify) | shim `git` object (auto-unsupported on remote) |
| `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` (modify) | grouped stub |
| `desktop/src/renderer/state/artifact-actions.ts` + `artifact-tracker.ts` (modify) | `GIT_REVIEW_OPENED/CLOSED`, `gitReviewBySession` |
| `desktop/src/renderer/utils/git-footer.ts` (new) | pure footer-visibility logic |
| `desktop/src/renderer/hooks/useGitFileStatus.ts` (new) | footer data hook (fetch + watch + refresh) |
| `desktop/src/renderer/components/SessionDrawer.tsx` (modify) | footer entry, icons, ESC cascade, view switch |
| `desktop/src/renderer/components/git/GitReviewView.tsx` (new) | sub-header + card timeline + composer |
| `desktop/src/renderer/components/git/GitReviewCard.tsx` (new) | one expandable card |
| `desktop/src/renderer/components/git/DiscardConfirmDialog.tsx` (new) | L3 destructive confirm |
| `desktop/tests/git/*.test.ts`, `desktop/src/renderer/**/*.test.tsx` (new) | per-task tests |
| `desktop/tests/ipc-channels.test.ts`, `desktop/tests/__mocks__/electron.ts` (modify) | parity block, `trashItem` mock |

---

### Task 1: Shared types + pure git-output parsers

**Files:**
- Create: `desktop/src/shared/git-types.ts`
- Create: `desktop/src/main/git/porcelain.ts`
- Test: `desktop/tests/git/porcelain.test.ts`

**Interfaces:**
- Consumes: `StructuredPatchHunk` from `desktop/src/shared/types.ts:179` (`{oldStart, oldLines, newStart, newLines, lines: string[]}`, lines prefixed `' '`/`'-'`/`'+'`).
- Produces (used by Tasks 3, 7, 8):
  - Types: `GitFileCounts {added, removed}`, `GitFileStatusResult`, `GitLogEntry {sha, shortSha, subject, authorDate}`, `GitUncommitted`, `GitFileReviewResult`, `GitCommitFileDiffResult`, `GitOpResult`, `GitChangedEvent {repoRoot}`.
  - Functions: `parsePorcelainV2(text): {branch: string|null, files: PorcelainEntry[]}`, `parseNumstat(text): Map<string, {added:number, removed:number, binary:boolean}>`, `parseLogRecords(text): GitLogEntry[]`, `parseUnifiedDiff(text): {hunks: StructuredPatchHunk[], binary: boolean}`, `countsFromHunks(hunks): GitFileCounts`, `synthesizeAddHunk(content: string): StructuredPatchHunk`.

- [ ] **Step 1: Write `desktop/src/shared/git-types.ts`**

```ts
// Git surface IPC payload types (spec docs/active/specs/2026-07-22-git-surface.md).
// Shared main <-> renderer; keep JSON-serializable.
import type { StructuredPatchHunk } from './types';

export interface GitFileCounts {
  added: number;
  removed: number;
}

/** Answer to git:file-status — drives the SessionDrawer footer entry. */
export interface GitFileStatusResult {
  ok: boolean;
  error?: string;
  /** false = not a git repo (or git missing) — footer renders exactly as today. */
  isRepo: boolean;
  branch: string | null;
  /** null when the file has no uncommitted changes vs HEAD. */
  counts: GitFileCounts | null;
  /** true when at least one commit touches this file. */
  hasHistory: boolean;
  /** true when this file has staged (index) changes. */
  staged: boolean;
}

export interface GitLogEntry {
  sha: string;
  shortSha: string;
  subject: string;
  /** ISO-8601 author date; relative time is rendered client-side. */
  authorDate: string;
}

export interface GitUncommitted {
  hunks: StructuredPatchHunk[];
  counts: GitFileCounts;
  staged: boolean;
  untracked: boolean;
  binary: boolean;
}

/** Answer to git:file-review — one payload renders the whole review view. */
export interface GitFileReviewResult {
  ok: boolean;
  error?: string;
  isRepo: boolean;
  branch: string | null;
  uncommitted: GitUncommitted | null;
  log: GitLogEntry[];
  hasMore: boolean;
  /** Repo-wide count of files with staged changes — the commit button label. */
  stagedCount: number;
}

export interface GitCommitFileDiffResult {
  ok: boolean;
  error?: string;
  hunks: StructuredPatchHunk[];
  binary: boolean;
}

export interface GitOpResult {
  ok: boolean;
  error?: string;
}

export interface GitChangedEvent {
  repoRoot: string;
}
```

- [ ] **Step 2: Write the failing parser tests**

Create `desktop/tests/git/porcelain.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  parsePorcelainV2, parseNumstat, parseLogRecords,
  parseUnifiedDiff, countsFromHunks, synthesizeAddHunk,
} from '../../src/main/git/porcelain';

describe('parsePorcelainV2', () => {
  it('extracts branch and per-file staged/unstaged/untracked', () => {
    const text = [
      '# branch.oid 1234567890abcdef',
      '# branch.head master',
      '1 .M N... 100644 100644 100644 aaa bbb src/renderer/state/chat-reducer.ts',
      '1 M. N... 100644 100644 100644 aaa bbb src/shared/types.ts',
      '1 MM N... 100644 100644 100644 aaa bbb src/both.ts',
      '? src/renderer/state/undo-stack.ts',
      '',
    ].join('\n');
    const r = parsePorcelainV2(text);
    expect(r.branch).toBe('master');
    expect(r.files).toEqual([
      { path: 'src/renderer/state/chat-reducer.ts', staged: false, unstaged: true, untracked: false, kind: 'modified' },
      { path: 'src/shared/types.ts', staged: true, unstaged: false, untracked: false, kind: 'modified' },
      { path: 'src/both.ts', staged: true, unstaged: true, untracked: false, kind: 'modified' },
      { path: 'src/renderer/state/undo-stack.ts', staged: false, unstaged: true, untracked: true, kind: 'untracked' },
    ]);
  });

  it('reports detached HEAD as null branch and classifies add/delete/rename', () => {
    const text = [
      '# branch.head (detached)',
      '1 A. N... 000000 100644 100644 000 bbb new.ts',
      '1 .D N... 100644 100644 000000 aaa bbb gone.ts',
      '2 R. N... 100644 100644 100644 aaa bbb R100 renamed.ts\told-name.ts',
      '',
    ].join('\n');
    const r = parsePorcelainV2(text);
    expect(r.branch).toBeNull();
    expect(r.files[0]).toMatchObject({ path: 'new.ts', kind: 'added', staged: true });
    expect(r.files[1]).toMatchObject({ path: 'gone.ts', kind: 'deleted', unstaged: true });
    expect(r.files[2]).toMatchObject({ path: 'renamed.ts', kind: 'renamed', staged: true });
  });
});

describe('parseNumstat', () => {
  it('maps path to added/removed and flags binary', () => {
    const text = '41\t12\tsrc/renderer/state/chat-reducer.ts\n-\t-\tassets/logo.png\n';
    const m = parseNumstat(text);
    expect(m.get('src/renderer/state/chat-reducer.ts')).toEqual({ added: 41, removed: 12, binary: false });
    expect(m.get('assets/logo.png')).toEqual({ added: 0, removed: 0, binary: true });
  });
});

describe('parseLogRecords', () => {
  it('splits unit/record separators into entries', () => {
    const U = '\x1f'; // unit separator between fields
    const R = '\x1e'; // record separator between commits
    const text =
      ['3f1c9a2deadbeef00000000000000000000000', 'fix(reducer): drop stale tool ids', '2026-07-22T14:03:11-05:00'].join(U) + R +
      ['c9718267cafebabe0000000000000000000000', 'fix(ws): consolidate duplicate clients', '2026-07-22T11:00:00-05:00'].join(U) + R;
    const log = parseLogRecords(text);
    expect(log).toHaveLength(2);
    expect(log[0]).toEqual({
      sha: '3f1c9a2deadbeef00000000000000000000000',
      shortSha: '3f1c9a2',
      subject: 'fix(reducer): drop stale tool ids',
      authorDate: '2026-07-22T14:03:11-05:00',
    });
  });
  it('returns [] for empty output', () => {
    expect(parseLogRecords('')).toEqual([]);
  });
});

describe('parseUnifiedDiff', () => {
  it('parses hunks with absolute line numbers', () => {
    const text = [
      'diff --git a/f.ts b/f.ts',
      'index aaa..bbb 100644',
      '--- a/f.ts',
      '+++ b/f.ts',
      '@@ -142,4 +142,6 @@ case block',
      "     case 'TRANSCRIPT_TOOL_RESULT': {",
      '-      const tool = state.toolCalls.get(action.id);',
      '+      const tool = state.toolCalls.get(action.id) ?? null;',
      '+      if (!tool) return state;',
      '       const next = new Map(state.toolCalls);',
      '@@ -231,2 +233,2 @@',
      '-      return old;',
      '+      return fresh;',
      '',
    ].join('\n');
    const r = parseUnifiedDiff(text);
    expect(r.binary).toBe(false);
    expect(r.hunks).toHaveLength(2);
    expect(r.hunks[0]).toMatchObject({ oldStart: 142, oldLines: 4, newStart: 142, newLines: 6 });
    expect(r.hunks[0].lines[1]).toBe('-      const tool = state.toolCalls.get(action.id);');
    expect(r.hunks[1]).toMatchObject({ oldStart: 231, newStart: 233 });
  });
  it('handles single-line hunk headers (no comma) and binary diffs', () => {
    const one = parseUnifiedDiff('--- a/f\n+++ b/f\n@@ -1 +1 @@\n-a\n+b\n');
    expect(one.hunks[0]).toMatchObject({ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1 });
    const bin = parseUnifiedDiff('diff --git a/x b/x\nBinary files a/x and b/x differ\n');
    expect(bin.binary).toBe(true);
    expect(bin.hunks).toEqual([]);
  });
});

describe('countsFromHunks / synthesizeAddHunk', () => {
  it('sums additions and removals across hunks', () => {
    const r = parseUnifiedDiff('--- a/f\n+++ b/f\n@@ -1,2 +1,3 @@\n-x\n+y\n+z\n ctx\n');
    expect(countsFromHunks(r.hunks)).toEqual({ added: 2, removed: 1 });
  });
  it('synthesizes an all-additions hunk for an untracked file', () => {
    const h = synthesizeAddHunk('line one\nline two\n');
    expect(h).toEqual({ oldStart: 0, oldLines: 0, newStart: 1, newLines: 2, lines: ['+line one', '+line two'] });
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `cd youcoded/desktop && npx vitest run tests/git/porcelain.test.ts`
Expected: FAIL — cannot resolve `../../src/main/git/porcelain`.

- [ ] **Step 4: Implement `desktop/src/main/git/porcelain.ts`**

```ts
// Pure parsers for git plumbing output. No I/O, no electron imports — every
// function takes strings so the whole module unit-tests with fixtures.
// Spec: docs/active/specs/2026-07-22-git-surface.md section 3.
import type { StructuredPatchHunk } from '../../shared/types';
import type { GitFileCounts, GitLogEntry } from '../../shared/git-types';

export interface PorcelainEntry {
  path: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  kind: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';
}

// git status --porcelain=v2 --branch. Line shapes we consume:
//   # branch.head <name>          (name is "(detached)" when detached)
//   1 XY ... <path>               (ordinary change; X=index, Y=worktree, "." = unchanged)
//   2 XY ... <path>\t<origPath>   (rename/copy)
//   ? <path>                      (untracked)
export function parsePorcelainV2(text: string): { branch: string | null; files: PorcelainEntry[] } {
  let branch: string | null = null;
  const files: PorcelainEntry[] = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('# branch.head ')) {
      const name = line.slice('# branch.head '.length).trim();
      branch = name === '(detached)' ? null : name;
    } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
      const xy = line.slice(2, 4);
      // Fields are space-separated; the path is everything after the 8th field
      // (v2 format is fixed-width up to the path). Renames append "\t<orig>".
      const fieldCount = line.startsWith('2 ') ? 9 : 8;
      const parts = line.split(' ');
      const rawPath = parts.slice(fieldCount).join(' ');
      const p = rawPath.split('\t')[0];
      const staged = xy[0] !== '.';
      const unstaged = xy[1] !== '.';
      const kind =
        xy.includes('R') ? 'renamed'
        : xy.includes('A') ? 'added'
        : xy.includes('D') ? 'deleted'
        : 'modified';
      files.push({ path: p, staged, unstaged, untracked: false, kind });
    } else if (line.startsWith('? ')) {
      files.push({ path: line.slice(2), staged: false, unstaged: true, untracked: true, kind: 'untracked' });
    }
  }
  return { branch, files };
}

// git diff --numstat: "<added>\t<removed>\t<path>"; binary files show "-\t-".
export function parseNumstat(text: string): Map<string, { added: number; removed: number; binary: boolean }> {
  const out = new Map<string, { added: number; removed: number; binary: boolean }>();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const [a, r, ...rest] = line.split('\t');
    const p = rest.join('\t');
    if (!p) continue;
    if (a === '-' || r === '-') out.set(p, { added: 0, removed: 0, binary: true });
    else out.set(p, { added: parseInt(a, 10) || 0, removed: parseInt(r, 10) || 0, binary: false });
  }
  return out;
}

// git log --pretty=format:%H%x1f%s%x1f%aI%x1e — unit sep 0x1f, record sep 0x1e.
// Chosen over newline parsing so commit subjects can contain anything.
export function parseLogRecords(text: string): GitLogEntry[] {
  return text
    .split('\x1e')
    .map((rec) => rec.replace(/^\n/, ''))
    .filter((rec) => rec.trim().length > 0)
    .map((rec) => {
      const [sha, subject, authorDate] = rec.split('\x1f');
      return { sha, shortSha: sha.slice(0, 7), subject: subject ?? '', authorDate: authorDate ?? '' };
    });
}

// Unified diff -> StructuredPatchHunk[] (absolute file line numbers, the shape
// UnifiedDiff.tsx already renders for tool cards). "@@ -a[,b] +c[,d] @@".
const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function parseUnifiedDiff(text: string): { hunks: StructuredPatchHunk[]; binary: boolean } {
  const hunks: StructuredPatchHunk[] = [];
  let binary = false;
  let current: StructuredPatchHunk | null = null;
  for (const line of text.split('\n')) {
    const m = HUNK_RE.exec(line);
    if (m) {
      current = {
        oldStart: parseInt(m[1], 10),
        oldLines: m[2] !== undefined ? parseInt(m[2], 10) : 1,
        newStart: parseInt(m[3], 10),
        newLines: m[4] !== undefined ? parseInt(m[4], 10) : 1,
        lines: [],
      };
      hunks.push(current);
      continue;
    }
    if (/^Binary files .* differ$/.test(line)) { binary = true; continue; }
    if (current && (line.startsWith(' ') || line.startsWith('+') || line.startsWith('-'))) {
      // "\ No newline at end of file" starts with backslash and is skipped.
      current.lines.push(line);
    } else if (line.startsWith('diff ') || line.startsWith('--- ') || line.startsWith('+++ ')) {
      current = null; // next file section header — stop appending to the old hunk
    }
  }
  return { hunks, binary };
}

export function countsFromHunks(hunks: StructuredPatchHunk[]): GitFileCounts {
  let added = 0;
  let removed = 0;
  for (const h of hunks) for (const l of h.lines) {
    if (l.startsWith('+')) added++;
    else if (l.startsWith('-')) removed++;
  }
  return { added, removed };
}

// An untracked file has no diff vs HEAD; render it as one all-additions hunk.
export function synthesizeAddHunk(content: string): StructuredPatchHunk {
  const lines = content.split('\n');
  if (lines[lines.length - 1] === '') lines.pop(); // trailing terminator, not a line
  return { oldStart: 0, oldLines: 0, newStart: 1, newLines: lines.length, lines: lines.map((l) => '+' + l) };
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run tests/git/porcelain.test.ts`
Expected: PASS (all describes green).

- [ ] **Step 6: Commit**

```bash
git add src/shared/git-types.ts src/main/git/porcelain.ts tests/git/porcelain.test.ts
git commit -m "feat(git): shared git-surface types + pure porcelain/numstat/log/diff parsers"
```

---

### Task 2: Git executor + repo-root resolution

**Files:**
- Create: `desktop/src/main/git/git-exec.ts`
- Test: `desktop/tests/git/git-exec.test.ts`

**Interfaces:**
- Produces (used by Tasks 3, 5):
  - `execGit(cwd: string, args: string[]): Promise<{code: number, stdout: string, stderr: string}>`
  - `resolveRepoRoot(dir: string): Promise<string | null>` (cached; null = not a repo or git missing)
  - `invalidateRepoRootCache(): void`
  - `gitAvailable(): Promise<boolean>` (memoized)

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/git/git-exec.test.ts`. Integration test against real `git` in a temp dir; the whole file self-skips when git is absent (CI without git must not fail):

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execGit, resolveRepoRoot, invalidateRepoRootCache, gitAvailable } from '../../src/main/git/git-exec';

function hasGit(): boolean {
  try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
}

describe.skipIf(!hasGit())('git-exec (integration, real git)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ycd-git-exec-'));
    invalidateRepoRootCache();
  });
  afterEach(async () => {
    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it('execGit returns code 0 + stdout on success', async () => {
    const r = await execGit(dir, ['--version']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('git version');
  });

  it('execGit returns nonzero code + real stderr on failure', async () => {
    const r = await execGit(dir, ['rev-parse', '--show-toplevel']);
    expect(r.code).not.toBe(0);
    expect(r.stderr.toLowerCase()).toContain('not a git repository');
  });

  it('resolveRepoRoot finds the toplevel from a subdirectory and caches', async () => {
    await execGit(dir, ['init']);
    const sub = path.join(dir, 'a', 'b');
    await fs.promises.mkdir(sub, { recursive: true });
    const root = await resolveRepoRoot(sub);
    expect(root && (await fs.promises.realpath(root))).toBe(await fs.promises.realpath(dir));
    // cached: second call resolves identically without re-shelling (same value)
    expect(await resolveRepoRoot(sub)).toBe(root);
  });

  it('resolveRepoRoot returns null outside any repo', async () => {
    expect(await resolveRepoRoot(dir)).toBeNull();
  });

  it('gitAvailable is true here', async () => {
    expect(await gitAvailable()).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/git/git-exec.test.ts`
Expected: FAIL — cannot resolve `../../src/main/git/git-exec`.

- [ ] **Step 3: Implement `desktop/src/main/git/git-exec.ts`**

```ts
// Thin runner for the user's real repo. Deliberately NOT GitTransport
// (sync-spaces/git-transport.ts): that class pins GIT_DIR to the hidden
// .youcoded/sync.git and must never touch the user's own .git. Here we run
// plain `git` with cwd only — the repo is whatever the user's project is.
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileP = promisify(execFile);

const GIT_TIMEOUT_MS = 60_000;
const MAX_BUFFER = 16 * 1024 * 1024; // large diffs; UnifiedDiff paginates client-side

export interface GitExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export async function execGit(cwd: string, args: string[]): Promise<GitExecResult> {
  try {
    const { stdout, stderr } = await execFileP('git', args, {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      // Never let git prompt — a hung credential prompt would wedge the handler.
      // MVP operations are all local, so no credentials are ever needed.
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    return { code: 0, stdout: String(stdout), stderr: String(stderr) };
  } catch (err: unknown) {
    const e = err as { code?: number | string; stdout?: string; stderr?: string; message?: string };
    if (typeof e.code === 'number') {
      // git ran and exited nonzero — pass its real stderr through untouched
      return { code: e.code, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
    }
    // spawn failure (git not installed, ENOENT) or timeout kill
    return { code: -1, stdout: '', stderr: e.stderr || e.message || String(err) };
  }
}

let gitOk: boolean | null = null;
export async function gitAvailable(): Promise<boolean> {
  if (gitOk === null) gitOk = (await execGit(process.cwd(), ['--version'])).code === 0;
  return gitOk;
}

// dir -> repo toplevel (or null). Cached: the footer asks on every artifact
// switch and status refresh; rev-parse per keystroke would be wasteful.
// Invalidated wholesale on git:changed (Task 5) — repos appear/vanish rarely.
const rootCache = new Map<string, string | null>();

export async function resolveRepoRoot(dir: string): Promise<string | null> {
  const hit = rootCache.get(dir);
  if (hit !== undefined) return hit;
  const r = await execGit(dir, ['rev-parse', '--show-toplevel']);
  const root = r.code === 0 ? r.stdout.trim() : null;
  rootCache.set(dir, root);
  return root;
}

export function invalidateRepoRootCache(): void {
  rootCache.clear();
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/git/git-exec.test.ts`
Expected: PASS (or the whole describe skipped on a machine without git).

- [ ] **Step 5: Commit**

```bash
git add src/main/git/git-exec.ts tests/git/git-exec.test.ts
git commit -m "feat(git): execGit runner + cached repo-root resolution"
```

<!-- APPEND -->
