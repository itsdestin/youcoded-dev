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

---

### Task 3: Git service operations

**Files:**
- Create: `desktop/src/main/git/git-service.ts`
- Modify: `desktop/tests/__mocks__/electron.ts` (add `trashItem`)
- Test: `desktop/tests/git/git-service.test.ts`

**Interfaces:**
- Consumes: `execGit`, `resolveRepoRoot` (Task 2); all parsers (Task 1); types from `shared/git-types` (Task 1); `shell` from `'electron'` (mocked in tests).
- Produces (used by Task 5 handlers — exact signatures):
  - `gitFileStatus(projectRoot: string, relPath: string): Promise<GitFileStatusResult>`
  - `gitFileReview(projectRoot: string, relPath: string, opts?: {logSkip?: number}): Promise<GitFileReviewResult>`
  - `gitCommitFileDiff(projectRoot: string, sha: string, relPath: string): Promise<GitCommitFileDiffResult>`
  - `gitStage(projectRoot: string, relPath: string): Promise<GitOpResult>`
  - `gitUnstage(projectRoot: string, relPath: string): Promise<GitOpResult>`
  - `gitCommit(projectRoot: string, message: string): Promise<GitOpResult>`
  - `gitDiscard(projectRoot: string, relPath: string): Promise<GitOpResult>`
  - `LOG_PAGE = 20` (exported const)

Notes that shape the implementation:
- `relPath` arrives **project-root-relative** (that is what `artifact.path` is). The repo root may sit above the project root, so every git call converts: `abs = path.resolve(projectRoot, relPath)` → `relToRepo = path.relative(repoRoot, abs)` (posix-joined). If `abs` escapes the project root (`path.relative(projectRoot, abs)` starts with `..`) return `{ok:false, error:'path-outside-project'}` — defense in depth under the Task 5 root gate.
- Untracked file: no diff vs HEAD exists — read the file (`fs.promises.readFile`, utf8) and `synthesizeAddHunk`. Files >1MB: return `binary:true`-style truncation (`hunks: [], binary: true`) rather than flooding IPC.
- Discard: tracked → `git checkout HEAD -- <rel>` (restores index AND worktree); untracked → `shell.trashItem(abs)` (recoverable; NEVER `git clean`).
- Every failed git call returns `{ok:false, error: stderr.trim() || 'git exited with code N'}` — real stderr, per the error standard.

- [ ] **Step 1: Add `trashItem` to the electron mock**

In `desktop/tests/__mocks__/electron.ts`, extend the `shell` export (currently `{openExternal, openPath}` at line 49):

```ts
export const shell = {
  openExternal: vi.fn(),
  openPath: vi.fn(),
  // git surface discard of untracked files (git-service.ts) — resolves like Electron 41
  trashItem: vi.fn(async (_path: string) => undefined),
};
```

- [ ] **Step 2: Write the failing integration test**

Create `desktop/tests/git/git-service.test.ts` (real git, self-skipping like Task 2; a helper builds a repo with one commit):

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { shell } from 'electron'; // vitest alias -> tests/__mocks__/electron.ts
import {
  gitFileStatus, gitFileReview, gitCommitFileDiff,
  gitStage, gitUnstage, gitCommit, gitDiscard, LOG_PAGE,
} from '../../src/main/git/git-service';
import { invalidateRepoRootCache } from '../../src/main/git/git-exec';

function hasGit(): boolean {
  try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
}
function sh(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.t',
      GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.t',
    },
  });
}

describe.skipIf(!hasGit())('git-service (integration, real git)', () => {
  let root: string;
  beforeEach(async () => {
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ycd-git-svc-'));
    invalidateRepoRootCache();
    sh(root, ['init', '-b', 'main']);
    await fs.promises.writeFile(path.join(root, 'a.txt'), 'one\ntwo\n');
    sh(root, ['add', '.']);
    sh(root, ['commit', '-m', 'initial']);
  });
  afterEach(async () => {
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  it('fileStatus: clean tracked file -> no counts, hasHistory true', async () => {
    const r = await gitFileStatus(root, 'a.txt');
    expect(r).toMatchObject({ ok: true, isRepo: true, branch: 'main', counts: null, hasHistory: true, staged: false });
  });

  it('fileStatus: modified file -> counts vs HEAD', async () => {
    await fs.promises.writeFile(path.join(root, 'a.txt'), 'one\nTWO\nthree\n');
    const r = await gitFileStatus(root, 'a.txt');
    expect(r.counts).toEqual({ added: 2, removed: 1 });
  });

  it('fileStatus: non-repo dir -> isRepo false, ok true', async () => {
    const bare = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ycd-norepo-'));
    try {
      const r = await gitFileStatus(bare, 'x.txt');
      expect(r).toMatchObject({ ok: true, isRepo: false, counts: null, hasHistory: false });
    } finally { await fs.promises.rm(bare, { recursive: true, force: true }); }
  });

  it('fileStatus: escaping relPath is refused', async () => {
    const r = await gitFileStatus(root, '../outside.txt');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('path-outside-project');
  });

  it('fileReview: modified file -> uncommitted hunks + log + stagedCount', async () => {
    await fs.promises.writeFile(path.join(root, 'a.txt'), 'one\nTWO\n');
    const r = await gitFileReview(root, 'a.txt');
    expect(r.ok).toBe(true);
    expect(r.uncommitted?.untracked).toBe(false);
    expect(r.uncommitted?.counts).toEqual({ added: 1, removed: 1 });
    expect(r.uncommitted?.hunks[0].lines).toContain('-two');
    expect(r.log).toHaveLength(1);
    expect(r.log[0].subject).toBe('initial');
    expect(r.hasMore).toBe(false);
    expect(r.stagedCount).toBe(0);
  });

  it('fileReview: untracked file -> synthesized all-additions hunk', async () => {
    await fs.promises.writeFile(path.join(root, 'new.txt'), 'alpha\nbeta\n');
    const r = await gitFileReview(root, 'new.txt');
    expect(r.uncommitted?.untracked).toBe(true);
    expect(r.uncommitted?.hunks).toEqual([
      { oldStart: 0, oldLines: 0, newStart: 1, newLines: 2, lines: ['+alpha', '+beta'] },
    ]);
    expect(r.log).toEqual([]);
  });

  it('stage/unstage flip index state and stagedCount', async () => {
    await fs.promises.writeFile(path.join(root, 'a.txt'), 'changed\n');
    expect((await gitStage(root, 'a.txt')).ok).toBe(true);
    expect((await gitFileStatus(root, 'a.txt')).staged).toBe(true);
    expect((await gitFileReview(root, 'a.txt')).stagedCount).toBe(1);
    expect((await gitUnstage(root, 'a.txt')).ok).toBe(true);
    expect((await gitFileStatus(root, 'a.txt')).staged).toBe(false);
  });

  it('commit commits the index and clears the uncommitted card', async () => {
    await fs.promises.writeFile(path.join(root, 'a.txt'), 'committed\n');
    await gitStage(root, 'a.txt');
    const c = await gitCommit(root, 'test: from the drawer');
    expect(c.ok).toBe(true);
    const r = await gitFileReview(root, 'a.txt');
    expect(r.uncommitted).toBeNull();
    expect(r.log[0].subject).toBe('test: from the drawer');
  });

  it('commit with empty index fails with real git stderr', async () => {
    const c = await gitCommit(root, 'nothing to commit');
    expect(c.ok).toBe(false);
    expect(c.error!.length).toBeGreaterThan(0); // git's own message, passed through
  });

  it('commitFileDiff returns the hunks of a past commit for the file', async () => {
    await fs.promises.writeFile(path.join(root, 'a.txt'), 'one\ntwo\nthree\n');
    sh(root, ['add', '.']); sh(root, ['commit', '-m', 'add three']);
    const sha = sh(root, ['rev-parse', 'HEAD']).trim();
    const d = await gitCommitFileDiff(root, sha, 'a.txt');
    expect(d.ok).toBe(true);
    expect(d.hunks[0].lines).toContain('+three');
  });

  it('discard tracked restores HEAD content', async () => {
    await fs.promises.writeFile(path.join(root, 'a.txt'), 'garbage\n');
    expect((await gitDiscard(root, 'a.txt')).ok).toBe(true);
    expect(await fs.promises.readFile(path.join(root, 'a.txt'), 'utf8')).toBe('one\ntwo\n');
  });

  it('discard untracked goes through shell.trashItem, never git clean', async () => {
    const p = path.join(root, 'junk.txt');
    await fs.promises.writeFile(p, 'x\n');
    expect((await gitDiscard(root, 'junk.txt')).ok).toBe(true);
    expect(shell.trashItem).toHaveBeenCalledWith(p);
  });

  it('LOG_PAGE caps the log and reports hasMore', async () => {
    for (let i = 0; i < LOG_PAGE + 2; i++) {
      await fs.promises.writeFile(path.join(root, 'a.txt'), `rev ${i}\n`);
      sh(root, ['add', '.']); sh(root, ['commit', '-m', `rev ${i}`]);
    }
    const r = await gitFileReview(root, 'a.txt');
    expect(r.log).toHaveLength(LOG_PAGE);
    expect(r.hasMore).toBe(true);
    const page2 = await gitFileReview(root, 'a.txt', { logSkip: LOG_PAGE });
    expect(page2.log.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/git/git-service.test.ts`
Expected: FAIL — cannot resolve `../../src/main/git/git-service`.

- [ ] **Step 4: Implement `desktop/src/main/git/git-service.ts`**

```ts
// Git operations for the user's real repo (spec section 3). Every function is
// projectRoot-scoped and answers with plain serializable objects; the IPC
// handlers in ipc-handlers.ts add the known-root gate and broadcasting.
import fs from 'fs';
import path from 'path';
import { shell } from 'electron';
import { execGit, resolveRepoRoot } from './git-exec';
import {
  parsePorcelainV2, parseNumstat, parseLogRecords, parseUnifiedDiff,
  countsFromHunks, synthesizeAddHunk,
} from './porcelain';
import type {
  GitFileStatusResult, GitFileReviewResult, GitCommitFileDiffResult,
  GitOpResult, GitUncommitted,
} from '../../shared/git-types';

export const LOG_PAGE = 20;
const MAX_UNTRACKED_BYTES = 1024 * 1024; // beyond this, show as binary-style stub

// %H = sha, %s = subject, %aI = author date ISO; 0x1f/0x1e separators survive
// any subject content (newlines in subjects are impossible for %s).
const LOG_FORMAT = '%H%x1f%s%x1f%aI%x1e';

interface Located {
  repoRoot: string;
  abs: string;
  rel: string; // repo-relative, posix separators
}

function fail<T extends { ok: boolean; error?: string }>(base: Omit<T, 'ok' | 'error'>, error: string): T {
  return { ...(base as object), ok: false, error } as T;
}

function errText(r: { code: number; stderr: string }): string {
  return r.stderr.trim() || `git exited with code ${r.code}`;
}

async function locate(projectRoot: string, relPath: string): Promise<Located | 'outside' | null> {
  const abs = path.resolve(projectRoot, relPath);
  const inProject = path.relative(projectRoot, abs);
  // Defense in depth under the IPC known-root gate: an artifact path may never
  // escape its project root.
  if (inProject.startsWith('..') || path.isAbsolute(inProject)) return 'outside';
  const repoRoot = await resolveRepoRoot(projectRoot);
  if (!repoRoot) return null;
  const rel = path.relative(repoRoot, abs).split(path.sep).join('/');
  return { repoRoot, abs, rel };
}

const NOT_REPO: Omit<GitFileStatusResult, 'ok' | 'error'> = {
  isRepo: false, branch: null, counts: null, hasHistory: false, staged: false,
};

export async function gitFileStatus(projectRoot: string, relPath: string): Promise<GitFileStatusResult> {
  const loc = await locate(projectRoot, relPath);
  if (loc === 'outside') return { ok: false, error: 'path-outside-project', ...NOT_REPO };
  if (!loc) return { ok: true, ...NOT_REPO };
  const { repoRoot, abs, rel } = loc;

  const status = await execGit(repoRoot, ['status', '--porcelain=v2', '--branch', '--', rel]);
  if (status.code !== 0) return { ok: false, error: errText(status), ...NOT_REPO };
  const parsed = parsePorcelainV2(status.stdout);
  const entry = parsed.files.find((f) => f.path === rel) ?? null;

  let counts: GitFileStatusResult['counts'] = null;
  if (entry?.untracked) {
    try {
      const stat = await fs.promises.stat(abs);
      if (stat.size <= MAX_UNTRACKED_BYTES) {
        const content = await fs.promises.readFile(abs, 'utf8');
        counts = countsFromHunks([synthesizeAddHunk(content)]);
      } else counts = { added: 0, removed: 0 };
    } catch { counts = { added: 0, removed: 0 }; }
  } else if (entry) {
    const num = await execGit(repoRoot, ['diff', '--numstat', 'HEAD', '--', rel]);
    if (num.code === 0) {
      const m = parseNumstat(num.stdout).get(rel);
      counts = m ? { added: m.added, removed: m.removed } : { added: 0, removed: 0 };
    } else counts = { added: 0, removed: 0 };
  }

  // Any commit touching this path? --max-count=1 keeps it O(first hit).
  const hist = await execGit(repoRoot, ['rev-list', '--max-count=1', 'HEAD', '--', rel]);
  const hasHistory = hist.code === 0 && hist.stdout.trim().length > 0;

  return {
    ok: true, isRepo: true, branch: parsed.branch, counts,
    hasHistory, staged: entry?.staged ?? false,
  };
}

export async function gitFileReview(
  projectRoot: string, relPath: string, opts?: { logSkip?: number },
): Promise<GitFileReviewResult> {
  const base: Omit<GitFileReviewResult, 'ok' | 'error'> = {
    isRepo: false, branch: null, uncommitted: null, log: [], hasMore: false, stagedCount: 0,
  };
  const loc = await locate(projectRoot, relPath);
  if (loc === 'outside') return fail<GitFileReviewResult>(base, 'path-outside-project');
  if (!loc) return { ok: true, ...base };
  const { repoRoot, abs, rel } = loc;

  // Whole-repo status: branch + this file's entry + the repo-wide staged count
  // (the commit button label counts everything a commit would include).
  const status = await execGit(repoRoot, ['status', '--porcelain=v2', '--branch']);
  if (status.code !== 0) return fail<GitFileReviewResult>(base, errText(status));
  const parsed = parsePorcelainV2(status.stdout);
  const entry = parsed.files.find((f) => f.path === rel) ?? null;
  const stagedCount = parsed.files.filter((f) => f.staged).length;

  let uncommitted: GitUncommitted | null = null;
  if (entry?.untracked) {
    let hunks = [] as GitUncommitted['hunks'];
    let binary = false;
    try {
      const stat = await fs.promises.stat(abs);
      if (stat.size <= MAX_UNTRACKED_BYTES) hunks = [synthesizeAddHunk(await fs.promises.readFile(abs, 'utf8'))];
      else binary = true;
    } catch { binary = true; }
    uncommitted = { hunks, counts: countsFromHunks(hunks), staged: false, untracked: true, binary };
  } else if (entry) {
    const diff = await execGit(repoRoot, ['diff', 'HEAD', '--', rel]);
    if (diff.code !== 0) return fail<GitFileReviewResult>(base, errText(diff));
    const { hunks, binary } = parseUnifiedDiff(diff.stdout);
    uncommitted = { hunks, counts: countsFromHunks(hunks), staged: entry.staged, untracked: false, binary };
  }

  const skip = opts?.logSkip ?? 0;
  // Ask for one extra record purely to learn whether a next page exists.
  const log = await execGit(repoRoot, [
    'log', '--follow', `--max-count=${LOG_PAGE + 1}`, `--skip=${skip}`,
    `--pretty=format:${LOG_FORMAT}`, '--', rel,
  ]);
  // git log exits 0 with empty output for a path with no commits (e.g. untracked)
  const entries = log.code === 0 ? parseLogRecords(log.stdout) : [];
  const hasMore = entries.length > LOG_PAGE;

  return {
    ok: true, isRepo: true, branch: parsed.branch,
    uncommitted, log: entries.slice(0, LOG_PAGE), hasMore, stagedCount,
  };
}

export async function gitCommitFileDiff(
  projectRoot: string, sha: string, relPath: string,
): Promise<GitCommitFileDiffResult> {
  const loc = await locate(projectRoot, relPath);
  if (loc === 'outside' || !loc) return { ok: false, error: 'path-outside-project', hunks: [], binary: false };
  if (!/^[0-9a-f]{4,40}$/i.test(sha)) return { ok: false, error: 'invalid-sha', hunks: [], binary: false };
  // --format= suppresses the commit header so output is pure diff.
  const r = await execGit(loc.repoRoot, ['show', sha, '--format=', '--', loc.rel]);
  if (r.code !== 0) return { ok: false, error: errText(r), hunks: [], binary: false };
  const { hunks, binary } = parseUnifiedDiff(r.stdout);
  // Empty hunks is a real state (merge commit / rename-only) — the card body
  // renders the "no direct changes" line, not an error.
  return { ok: true, hunks, binary };
}

async function simpleOp(projectRoot: string, relPath: string, args: (rel: string) => string[]): Promise<GitOpResult> {
  const loc = await locate(projectRoot, relPath);
  if (loc === 'outside' || !loc) return { ok: false, error: 'path-outside-project' };
  const r = await execGit(loc.repoRoot, args(loc.rel));
  return r.code === 0 ? { ok: true } : { ok: false, error: errText(r) };
}

export function gitStage(projectRoot: string, relPath: string): Promise<GitOpResult> {
  return simpleOp(projectRoot, relPath, (rel) => ['add', '--', rel]);
}

export function gitUnstage(projectRoot: string, relPath: string): Promise<GitOpResult> {
  return simpleOp(projectRoot, relPath, (rel) => ['restore', '--staged', '--', rel]);
}

export async function gitCommit(projectRoot: string, message: string): Promise<GitOpResult> {
  if (!message.trim()) return { ok: false, error: 'empty-commit-message' };
  const repoRoot = await resolveRepoRoot(projectRoot);
  if (!repoRoot) return { ok: false, error: 'not-a-git-repository' };
  const r = await execGit(repoRoot, ['commit', '-m', message]);
  return r.code === 0 ? { ok: true } : { ok: false, error: r.stderr.trim() || r.stdout.trim() || `git exited with code ${r.code}` };
}

export async function gitDiscard(projectRoot: string, relPath: string): Promise<GitOpResult> {
  const loc = await locate(projectRoot, relPath);
  if (loc === 'outside' || !loc) return { ok: false, error: 'path-outside-project' };
  const status = await execGit(loc.repoRoot, ['status', '--porcelain=v2', '--', loc.rel]);
  if (status.code !== 0) return { ok: false, error: errText(status) };
  const entry = parsePorcelainV2(status.stdout).files.find((f) => f.path === loc.rel);
  if (!entry) return { ok: true }; // nothing to discard — already clean
  if (entry.untracked) {
    // Untracked: recoverable OS-trash delete, never `git clean` (spec section 5).
    try { await shell.trashItem(loc.abs); return { ok: true }; }
    catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
  }
  // Tracked: restore BOTH index and worktree copy to HEAD.
  const r = await execGit(loc.repoRoot, ['checkout', 'HEAD', '--', loc.rel]);
  return r.code === 0 ? { ok: true } : { ok: false, error: errText(r) };
}
```

Note for the implementer: `gitCommit` failure uses `stderr || stdout` because git prints "nothing to commit" to **stdout** — passing through whichever the real message landed in is still the real message.

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run tests/git/git-service.test.ts`
Expected: PASS. If the `-b main` init flag fails (git <2.28 has no `-b`), the fixture helper — not the service — is at fault; require git ≥2.28 for dev machines and note it in the PR description.

- [ ] **Step 6: Commit**

```bash
git add src/main/git/git-service.ts tests/git/git-service.test.ts tests/__mocks__/electron.ts
git commit -m "feat(git): git-service operations — status, review, log, stage, commit, discard"
```

---

### Task 4: `.git` state watcher

**Files:**
- Create: `desktop/src/main/git/git-watcher.ts`
- Test: `desktop/tests/git/git-watcher.test.ts`

**Interfaces:**
- Produces (used by Task 5):
  - `initGitWatchers(emit: (evt: {repoRoot: string}) => void): void`
  - `watchGit(repoRoot: string, subscriberId: number): {ok: boolean}`
  - `unwatchGit(repoRoot: string, subscriberId: number): void`
  - `dropGitSubscriber(subscriberId: number): void`
  - `closeAllGitWatchers(): void` (test teardown)

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/git/git-watcher.test.ts` (no git binary needed — it watches plain files):

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  initGitWatchers, watchGit, unwatchGit, dropGitSubscriber, closeAllGitWatchers,
} from '../../src/main/git/git-watcher';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('git-watcher', () => {
  let root: string;
  let events: Array<{ repoRoot: string }>;
  beforeEach(async () => {
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ycd-git-watch-'));
    await fs.promises.mkdir(path.join(root, '.git', 'refs', 'heads'), { recursive: true });
    await fs.promises.writeFile(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    events = [];
    initGitWatchers((e) => events.push(e));
  });
  afterEach(async () => {
    closeAllGitWatchers();
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  it('refuses a root without .git', async () => {
    const bare = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ycd-nogit-'));
    try { expect(watchGit(bare, 1).ok).toBe(false); }
    finally { await fs.promises.rm(bare, { recursive: true, force: true }); }
  });

  it('emits one debounced event for a burst of .git changes', async () => {
    expect(watchGit(root, 1).ok).toBe(true);
    await fs.promises.writeFile(path.join(root, '.git', 'index'), 'i1');
    await fs.promises.writeFile(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/other\n');
    await fs.promises.writeFile(path.join(root, '.git', 'index'), 'i2');
    await wait(700); // debounce is 300ms; fs.watch latency varies by platform
    expect(events.length).toBe(1);
    expect(events[0]).toEqual({ repoRoot: root });
  });

  it('stops emitting after the last subscriber unwatches', async () => {
    watchGit(root, 1);
    watchGit(root, 2);
    unwatchGit(root, 1);
    unwatchGit(root, 2);
    await fs.promises.writeFile(path.join(root, '.git', 'index'), 'x');
    await wait(500);
    expect(events).toEqual([]);
  });

  it('dropGitSubscriber releases every root a renderer held', async () => {
    watchGit(root, 7);
    dropGitSubscriber(7);
    await fs.promises.writeFile(path.join(root, '.git', 'index'), 'x');
    await wait(500);
    expect(events).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/git/git-watcher.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `desktop/src/main/git/git-watcher.ts`**

```ts
// WHY this exists: the chokidar project watcher (artifacts/project-watcher.ts)
// deliberately ignores dot-directories, so commits, checkouts and staging —
// which only touch .git/ — are invisible to it. This tiny fs.watch on the
// .git dir (HEAD + index live there) and .git/refs/heads keeps the git
// surface honest when the agent or a terminal moves git state underneath it.
// Same refcount model as project-watcher: N renderers x M roots.
import fs from 'fs';
import path from 'path';

export interface GitWatchEvent {
  repoRoot: string;
}

type Emit = (evt: GitWatchEvent) => void;

const DEBOUNCE_MS = 300;

interface Entry {
  watchers: fs.FSWatcher[];
  refs: Map<number, number>; // subscriberId -> refcount
  timer: ReturnType<typeof setTimeout> | null;
}

let emit: Emit | null = null;
const entries = new Map<string, Entry>();

export function initGitWatchers(cb: Emit): void {
  emit = cb;
}

export function watchGit(repoRoot: string, subscriberId: number): { ok: boolean } {
  let entry = entries.get(repoRoot);
  if (!entry) {
    const gitDir = path.join(repoRoot, '.git');
    if (!fs.existsSync(gitDir)) return { ok: false };
    const created: Entry = { watchers: [], refs: new Map(), timer: null };
    const fire = () => {
      // Debounce: one commit touches index, HEAD and a ref within milliseconds.
      if (created.timer) clearTimeout(created.timer);
      created.timer = setTimeout(() => {
        created.timer = null;
        emit?.({ repoRoot });
      }, DEBOUNCE_MS);
    };
    // Watching the DIRECTORIES catches create/replace of direct children —
    // git rewrites HEAD/index atomically via rename, which a file-watch loses.
    for (const target of [gitDir, path.join(gitDir, 'refs', 'heads')]) {
      try {
        created.watchers.push(fs.watch(target, fire));
      } catch {
        // refs/heads may not exist yet in a repo with no commits — HEAD watch
        // still covers the state change when the first commit creates it.
      }
    }
    if (created.watchers.length === 0) return { ok: false };
    entries.set(repoRoot, created);
    entry = created;
  }
  entry.refs.set(subscriberId, (entry.refs.get(subscriberId) ?? 0) + 1);
  return { ok: true };
}

function closeEntry(repoRoot: string, entry: Entry): void {
  if (entry.timer) clearTimeout(entry.timer);
  for (const w of entry.watchers) w.close();
  entries.delete(repoRoot);
}

export function unwatchGit(repoRoot: string, subscriberId: number): void {
  const entry = entries.get(repoRoot);
  if (!entry) return;
  const n = (entry.refs.get(subscriberId) ?? 0) - 1;
  if (n > 0) entry.refs.set(subscriberId, n);
  else entry.refs.delete(subscriberId);
  if (entry.refs.size === 0) closeEntry(repoRoot, entry);
}

export function dropGitSubscriber(subscriberId: number): void {
  for (const [root, entry] of entries) {
    if (entry.refs.delete(subscriberId) && entry.refs.size === 0) closeEntry(root, entry);
  }
}

export function closeAllGitWatchers(): void {
  for (const [root, entry] of entries) closeEntry(root, entry);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/git/git-watcher.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/git/git-watcher.ts tests/git/git-watcher.test.ts
git commit -m "feat(git): debounced refcounted .git state watcher"
```

---

### Task 5: IPC wiring — channels, handlers, preload, shim, Kotlin stub, parity test

**Files:**
- Create: `desktop/src/main/git/ipc-channels.ts`
- Modify: `desktop/src/main/ipc-handlers.ts` (new registration block; imports)
- Modify: `desktop/src/main/preload.ts` (add `git` object at the end of the `artifacts` sibling level, ~line 1285)
- Modify: `desktop/src/renderer/remote-shim.ts` (add `git` object after `artifacts`, ~line 1250)
- Modify: `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` (grouped stub near the `artifacts:watch-project` group, ~line 3641)
- Test: `desktop/tests/ipc-channels.test.ts` (new describe block)

**Interfaces:**
- Consumes: Task 3 service functions, Task 4 watcher functions, `resolveRepoRoot`/`invalidateRepoRootCache` (Task 2).
- Produces (used by Tasks 7, 8): `window.claude.git` with methods `fileStatus(projectRoot, relPath)`, `fileReview(projectRoot, relPath, opts?)`, `commitFileDiff(projectRoot, sha, relPath)`, `stage(projectRoot, relPath)`, `unstage(projectRoot, relPath)`, `commit(projectRoot, message)`, `discard(projectRoot, relPath)`, `watch(projectRoot)`, `unwatch(projectRoot)`, `onChanged(cb): () => void`.

- [ ] **Step 1: Extend the parity test first (failing)**

Append to `desktop/tests/ipc-channels.test.ts` (model: the `project:*` block at line 508; Kotlin asserts use double quotes):

```ts
describe('git:* IPC parity (git surface, spec 2026-07-22)', () => {
  const preload = fs.readFileSync(path.join(__dirname, '../src/main/preload.ts'), 'utf8');
  const shim = fs.readFileSync(path.join(__dirname, '../src/renderer/remote-shim.ts'), 'utf8');
  const handlers = fs.readFileSync(path.join(__dirname, '../src/main/ipc-handlers.ts'), 'utf8');
  const kotlinPath = path.join(__dirname, '../../app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt');
  const kotlin = fs.existsSync(kotlinPath) ? fs.readFileSync(kotlinPath, 'utf8') : null;

  const channels: Array<[string, string]> = [
    ['git:file-status', 'GIT_IPC.FILE_STATUS'],
    ['git:file-review', 'GIT_IPC.FILE_REVIEW'],
    ['git:commit-file-diff', 'GIT_IPC.COMMIT_FILE_DIFF'],
    ['git:stage', 'GIT_IPC.STAGE'],
    ['git:unstage', 'GIT_IPC.UNSTAGE'],
    ['git:commit', 'GIT_IPC.COMMIT'],
    ['git:discard', 'GIT_IPC.DISCARD'],
    ['git:watch', 'GIT_IPC.WATCH'],
    ['git:unwatch', 'GIT_IPC.UNWATCH'],
  ];

  for (const [ch, constant] of channels) {
    it(`${ch} present in preload + remote-shim + ipc-handlers`, () => {
      expect(preload).toContain(`'${ch}'`);
      expect(shim).toContain(`'${ch}'`);
      expect(handlers.includes(`'${ch}'`) || handlers.includes(constant)).toBe(true);
    });
    it(`${ch} has an Android not-implemented-on-mobile stub`, () => {
      if (kotlin) expect(kotlin).toContain(`"${ch}"`);
    });
  }

  it('git:changed push channel present in preload + remote-shim', () => {
    expect(preload).toContain(`'git:changed'`);
    expect(shim).toContain(`'git:changed'`);
  });
});
```

Run: `npx vitest run tests/ipc-channels.test.ts -t "git:"`
Expected: FAIL on every new assertion.

- [ ] **Step 2: Create `desktop/src/main/git/ipc-channels.ts`**

Comments must contain no single-quoted strings (the artifact parity block scans its sibling file that way; keep the convention here for safety):

```ts
// IPC channel constants for the git surface (spec 2026-07-22).
// Comment rule: never put a single-quoted string inside a comment in this
// file family — parity tests harvest every quoted token as a channel name.
export const GIT_IPC = {
  FILE_STATUS: 'git:file-status',
  FILE_REVIEW: 'git:file-review',
  COMMIT_FILE_DIFF: 'git:commit-file-diff',
  STAGE: 'git:stage',
  UNSTAGE: 'git:unstage',
  COMMIT: 'git:commit',
  DISCARD: 'git:discard',
  WATCH: 'git:watch',
  UNWATCH: 'git:unwatch',
  CHANGED: 'git:changed',
} as const;

export type GitIpcChannel = typeof GIT_IPC[keyof typeof GIT_IPC];
```

- [ ] **Step 3: Register handlers in `desktop/src/main/ipc-handlers.ts`**

Add imports at the top (near the artifacts imports):

```ts
import { GIT_IPC } from './git/ipc-channels';
import {
  gitFileStatus, gitFileReview, gitCommitFileDiff,
  gitStage, gitUnstage, gitCommit, gitDiscard,
} from './git/git-service';
import { initGitWatchers, watchGit, unwatchGit, dropGitSubscriber } from './git/git-watcher';
import { resolveRepoRoot, invalidateRepoRootCache } from './git/git-exec';
```

Add the registration block directly AFTER the artifacts watcher block (after the `ARTIFACT_IPC.UNWATCH_PROJECT` handler, ~line 3250). `readFolders`, `listProjects`, `canonicalize`, `CLAUDE_DIR` and `webContents` are already in scope in this file (used by the `artifacts:read-binary` handler at ~line 3105):

```ts
  // ── Git surface (spec docs/active/specs/2026-07-22-git-surface.md) ──
  // Known-roots gate: a git operation may only target a saved folder or an
  // indexed project root — same allow-list the read-binary guard builds.
  const knownGitRoot = async (projectRoot: unknown): Promise<boolean> => {
    if (typeof projectRoot !== 'string' || projectRoot.length === 0) return false;
    const canon = canonicalize(projectRoot, null);
    const roots = [
      ...readFolders().map((f) => canonicalize(f.path, null)),
      ...(await listProjects(CLAUDE_DIR)).map((p) => canonicalize(p.path, null)),
    ];
    return roots.includes(canon);
  };
  const gitGate = async <T extends object>(projectRoot: unknown, blocked: T, run: () => Promise<T>): Promise<T> => {
    if (!(await knownGitRoot(projectRoot))) return blocked;
    return run();
  };
  const broadcastGitChanged = (repoRoot: string) => {
    // Commits and checkouts can create or retarget repos — drop the cache so
    // the next footer query re-resolves.
    invalidateRepoRootCache();
    webContents.getAllWebContents().forEach((wc) => wc.send(GIT_IPC.CHANGED, { repoRoot }));
  };

  initGitWatchers((evt) => broadcastGitChanged(evt.repoRoot));

  ipcMain.handle(GIT_IPC.FILE_STATUS, (_e, projectRoot: string, relPath: string) =>
    gitGate(projectRoot, { ok: false, error: 'unknown-project-root', isRepo: false, branch: null, counts: null, hasHistory: false, staged: false },
      () => gitFileStatus(projectRoot, relPath)));

  ipcMain.handle(GIT_IPC.FILE_REVIEW, (_e, projectRoot: string, relPath: string, opts?: { logSkip?: number }) =>
    gitGate(projectRoot, { ok: false, error: 'unknown-project-root', isRepo: false, branch: null, uncommitted: null, log: [], hasMore: false, stagedCount: 0 },
      () => gitFileReview(projectRoot, relPath, opts)));

  ipcMain.handle(GIT_IPC.COMMIT_FILE_DIFF, (_e, projectRoot: string, sha: string, relPath: string) =>
    gitGate(projectRoot, { ok: false, error: 'unknown-project-root', hunks: [], binary: false },
      () => gitCommitFileDiff(projectRoot, sha, relPath)));

  const mutating = async (projectRoot: string, run: () => Promise<{ ok: boolean; error?: string }>) =>
    gitGate(projectRoot, { ok: false, error: 'unknown-project-root' }, async () => {
      const result = await run();
      if (result.ok) {
        const repoRoot = await resolveRepoRoot(projectRoot);
        if (repoRoot) broadcastGitChanged(repoRoot);
      }
      return result;
    });

  ipcMain.handle(GIT_IPC.STAGE, (_e, projectRoot: string, relPath: string) =>
    mutating(projectRoot, () => gitStage(projectRoot, relPath)));
  ipcMain.handle(GIT_IPC.UNSTAGE, (_e, projectRoot: string, relPath: string) =>
    mutating(projectRoot, () => gitUnstage(projectRoot, relPath)));
  ipcMain.handle(GIT_IPC.COMMIT, (_e, projectRoot: string, message: string) =>
    mutating(projectRoot, () => gitCommit(projectRoot, message)));
  ipcMain.handle(GIT_IPC.DISCARD, (_e, projectRoot: string, relPath: string) =>
    mutating(projectRoot, () => gitDiscard(projectRoot, relPath)));

  const gitWatchedSenders = new Set<number>();
  ipcMain.handle(GIT_IPC.WATCH, (e, projectRoot: string) =>
    gitGate(projectRoot, { ok: false }, async () => {
      const repoRoot = await resolveRepoRoot(projectRoot);
      if (!repoRoot) return { ok: false };
      const senderId = e.sender.id;
      if (!gitWatchedSenders.has(senderId)) {
        gitWatchedSenders.add(senderId);
        e.sender.once('destroyed', () => { gitWatchedSenders.delete(senderId); dropGitSubscriber(senderId); });
      }
      return watchGit(repoRoot, senderId);
    }));
  ipcMain.handle(GIT_IPC.UNWATCH, async (e, projectRoot: string) => {
    if (typeof projectRoot !== 'string' || projectRoot.length === 0) return { ok: false };
    const repoRoot = await resolveRepoRoot(projectRoot);
    if (repoRoot) unwatchGit(repoRoot, e.sender.id);
    return { ok: true };
  });
```

- [ ] **Step 4: Expose in `desktop/src/main/preload.ts`**

Insert a `git` object as a sibling directly after the `artifacts` object (which ends ~line 1285). Channel strings are inlined literals — the sandboxed preload cannot import `GIT_IPC`:

```ts
  git: {
    fileStatus: (projectRoot: string, relPath: string) =>
      ipcRenderer.invoke('git:file-status', projectRoot, relPath),
    fileReview: (projectRoot: string, relPath: string, opts?: { logSkip?: number }) =>
      ipcRenderer.invoke('git:file-review', projectRoot, relPath, opts),
    commitFileDiff: (projectRoot: string, sha: string, relPath: string) =>
      ipcRenderer.invoke('git:commit-file-diff', projectRoot, sha, relPath),
    stage: (projectRoot: string, relPath: string) =>
      ipcRenderer.invoke('git:stage', projectRoot, relPath),
    unstage: (projectRoot: string, relPath: string) =>
      ipcRenderer.invoke('git:unstage', projectRoot, relPath),
    commit: (projectRoot: string, message: string) =>
      ipcRenderer.invoke('git:commit', projectRoot, message),
    discard: (projectRoot: string, relPath: string) =>
      ipcRenderer.invoke('git:discard', projectRoot, relPath),
    watch: (projectRoot: string) => ipcRenderer.invoke('git:watch', projectRoot),
    unwatch: (projectRoot: string) => ipcRenderer.invoke('git:unwatch', projectRoot),
    onChanged: (cb: (event: any) => void) => {
      const handler = (_e: any, payload: any) => cb(payload);
      ipcRenderer.on('git:changed', handler);
      return () => ipcRenderer.removeListener('git:changed', handler);
    },
  },
```

- [ ] **Step 5: Mirror in `desktop/src/renderer/remote-shim.ts`**

Insert a `git` object directly after the shim's `artifacts` object (~line 1250). Payloads are single objects (shim convention). No `remote-server.ts` cases are added — the server's default case answers `unsupported:true` and the shim fast-rejects, which is the intended desktop-only degradation:

```ts
    git: {
      fileStatus: (projectRoot: string, relPath: string) =>
        invoke('git:file-status', { projectRoot, relPath }),
      fileReview: (projectRoot: string, relPath: string, opts?: { logSkip?: number }) =>
        invoke('git:file-review', { projectRoot, relPath, ...opts }),
      commitFileDiff: (projectRoot: string, sha: string, relPath: string) =>
        invoke('git:commit-file-diff', { projectRoot, sha, relPath }),
      stage: (projectRoot: string, relPath: string) => invoke('git:stage', { projectRoot, relPath }),
      unstage: (projectRoot: string, relPath: string) => invoke('git:unstage', { projectRoot, relPath }),
      commit: (projectRoot: string, message: string) => invoke('git:commit', { projectRoot, message }),
      discard: (projectRoot: string, relPath: string) => invoke('git:discard', { projectRoot, relPath }),
      watch: (projectRoot: string) => invoke('git:watch', { projectRoot }),
      unwatch: (projectRoot: string) => invoke('git:unwatch', { projectRoot }),
      onChanged: (cb: (event: any) => void) => {
        const handler: Callback = (evt: any) => cb(evt);
        addListener('git:changed', handler);
        return () => removeListener('git:changed', handler);
      },
    },
```

Also add `git:changed` routing to the shim's `handleMessage` push-event switch (next to the `case 'artifacts:changed':` at ~line 357):

```ts
      case 'git:changed':
        dispatchEvent('git:changed', payload);
        break;
```

- [ ] **Step 6: Kotlin grouped stub**

In `SessionService.kt`, next to the `"artifacts:watch-project", "artifacts:unwatch-project"` group (~line 3641), add:

```kotlin
            "git:file-status", "git:file-review", "git:commit-file-diff", "git:stage",
            "git:unstage", "git:commit", "git:discard", "git:watch", "git:unwatch" -> {
                // Git surface is desktop-only for now (spec 2026-07-22); the shared
                // renderer hides the footer entry when these reject.
                msg.id?.let { bridgeServer.respond(ws, msg.type, it,
                    org.json.JSONObject().put("ok", false).put("error", "not-implemented-on-mobile")) }
            }
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run tests/ipc-channels.test.ts`
Expected: PASS (all git:* assertions plus the pre-existing blocks — confirms nothing regressed).

Run: `npx vitest run tests/git/`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/main/git/ipc-channels.ts src/main/ipc-handlers.ts src/main/preload.ts src/renderer/remote-shim.ts tests/ipc-channels.test.ts ../app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt
git commit -m "feat(git): git:* IPC — handlers with known-root gate, preload, shim, Kotlin stubs, parity pins"
```

---

### Task 6: Reducer state — `gitReviewBySession`

**Files:**
- Modify: `desktop/src/renderer/state/artifact-actions.ts` (extend action union)
- Modify: `desktop/src/renderer/state/artifact-tracker.ts` (state field + cases)
- Test: `desktop/tests/renderer/git-review-state.test.ts`

**Interfaces:**
- Produces (used by Task 7): actions `{type: 'GIT_REVIEW_OPENED', sessionId}` / `{type: 'GIT_REVIEW_CLOSED', sessionId}`; state field `gitReviewBySession: Record<string, boolean>`.

- [ ] **Step 1: Write the failing reducer test**

Create `desktop/tests/renderer/git-review-state.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { artifactReducer, initialArtifactState } from '../../src/renderer/state/artifact-tracker';

const open = (s = initialArtifactState) =>
  artifactReducer(s, { type: 'GIT_REVIEW_OPENED', sessionId: 's1' } as any);

describe('git review view state', () => {
  it('defaults closed', () => {
    expect(initialArtifactState.gitReviewBySession).toEqual({});
  });

  it('GIT_REVIEW_OPENED / GIT_REVIEW_CLOSED flip the per-session flag', () => {
    let s = open();
    expect(s.gitReviewBySession['s1']).toBe(true);
    s = artifactReducer(s, { type: 'GIT_REVIEW_CLOSED', sessionId: 's1' } as any);
    expect(s.gitReviewBySession['s1']).toBe(false);
  });

  it('DRAWER_CLOSED clears the flag for that session', () => {
    let s = open();
    s = artifactReducer(s, { type: 'DRAWER_CLOSED', sessionId: 's1' } as any);
    expect(s.gitReviewBySession['s1']).toBeFalsy();
  });

  it('selecting a different artifact exits review (view follows the file)', () => {
    let s = open();
    s = artifactReducer(s, { type: 'ACTIVE_ARTIFACT_SET', sessionId: 's1', artifactId: 'a2' } as any);
    expect(s.gitReviewBySession['s1']).toBe(false);
  });

  it('is per-session', () => {
    const s = open();
    expect(s.gitReviewBySession['s2']).toBeUndefined();
  });
});
```

Note: if `artifact-tracker.ts` exports the reducer under a different name (check the file — the reducer is the plain `switch` the drawer dispatches through; export it if it is currently module-local), adjust the import in this test to the actual exported names rather than renaming the export.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/renderer/git-review-state.test.ts`
Expected: FAIL — `gitReviewBySession` undefined / unknown action.

- [ ] **Step 3: Implement**

In `artifact-actions.ts`, extend the action union (next to the `DRAWER_*` members):

```ts
  | { type: 'GIT_REVIEW_OPENED'; sessionId: string }
  | { type: 'GIT_REVIEW_CLOSED'; sessionId: string }
```

In `artifact-tracker.ts`:

1. Add to `ArtifactState` (after `activeArtifactBySession`):
```ts
  /** Per-session: the drawer is showing the git review sub-view for the active file. */
  gitReviewBySession: Record<string, boolean>;
```
2. Add to `initialArtifactState`: `gitReviewBySession: {},`
3. Add reducer cases (after the `ACTIVE_ARTIFACT_SET` case):
```ts
    case 'GIT_REVIEW_OPENED':
      return { ...state, gitReviewBySession: { ...state.gitReviewBySession, [action.sessionId]: true } };
    case 'GIT_REVIEW_CLOSED':
      return { ...state, gitReviewBySession: { ...state.gitReviewBySession, [action.sessionId]: false } };
```
4. In the existing `DRAWER_CLOSED` case (which already resets expand + selection + pillError), also spread `gitReviewBySession: { ...state.gitReviewBySession, [action.sessionId]: false }`.
5. In the existing `ACTIVE_ARTIFACT_SET` case, also clear the flag the same way — clicking a file in the list always lands on the FILE view (the review view belongs to the file it was opened from).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/renderer/git-review-state.test.ts`
Expected: PASS. Also run `npx vitest run tests/ -t artifact` to confirm no existing artifact-state test regressed.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/state/artifact-actions.ts src/renderer/state/artifact-tracker.ts tests/renderer/git-review-state.test.ts
git commit -m "feat(git): per-session gitReviewBySession drawer state"
```

---

### Task 7: Footer entry — pure logic, data hook, SessionDrawer wiring

**Files:**
- Create: `desktop/src/renderer/utils/git-footer.ts`
- Create: `desktop/src/renderer/hooks/useGitFileStatus.ts`
- Modify: `desktop/src/renderer/components/SessionDrawer.tsx` (PATHS icons, hook call, footer strip, ESC cascade, view switch shell)
- Test: `desktop/tests/renderer/git-footer.test.ts`, `desktop/src/renderer/components/SessionDrawerGitFooter.test.tsx`

**Interfaces:**
- Consumes: `window.claude.git` (Task 5), `GitFileStatusResult`/`GitFileCounts` (Task 1), actions (Task 6). `GitReviewView` (Task 8) — this task renders a placeholder `<div data-testid="git-review-view" />` where Task 8's component will mount, so Task 7 is testable standalone; Task 8 replaces the placeholder import.
- Produces: `gitFooterState(s: GitFileStatusResult | null): {show: boolean, counts: GitFileCounts | null}`; `useGitFileStatus(projectRoot: string, relPath: string | null, enabled: boolean): GitFileStatusResult | null`; PATHS icons `back`, `gitbranch`.

- [ ] **Step 1: Pure logic + failing test**

Create `desktop/tests/renderer/git-footer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { gitFooterState } from '../../src/renderer/utils/git-footer';

const base = { ok: true, isRepo: true, branch: 'main', counts: null, hasHistory: false, staged: false };

describe('gitFooterState', () => {
  it('hidden when status is unknown or not a repo', () => {
    expect(gitFooterState(null).show).toBe(false);
    expect(gitFooterState({ ...base, isRepo: false }).show).toBe(false);
  });
  it('hidden for a clean file with no history (footer reads exactly as today)', () => {
    expect(gitFooterState(base)).toEqual({ show: false, counts: null });
  });
  it('shown with counts when the file has uncommitted changes', () => {
    const r = gitFooterState({ ...base, counts: { added: 41, removed: 12 } });
    expect(r).toEqual({ show: true, counts: { added: 41, removed: 12 } });
  });
  it('shown without counts when clean but with history', () => {
    expect(gitFooterState({ ...base, hasHistory: true })).toEqual({ show: true, counts: null });
  });
  it('zero-zero counts (binary/oversize) still count as changed', () => {
    expect(gitFooterState({ ...base, counts: { added: 0, removed: 0 } }).show).toBe(true);
  });
});
```

Run: `npx vitest run tests/renderer/git-footer.test.ts` → FAIL (module missing).

Create `desktop/src/renderer/utils/git-footer.ts`:

```ts
// Footer-entry visibility (mockup ledger 9): show the Review Changes button
// when the file has uncommitted changes OR any git history; counts render only
// when there are uncommitted changes. Pure so it unit-tests without React.
import type { GitFileStatusResult, GitFileCounts } from '../../shared/git-types';

export function gitFooterState(
  s: GitFileStatusResult | null,
): { show: boolean; counts: GitFileCounts | null } {
  if (!s || !s.ok || !s.isRepo) return { show: false, counts: null };
  const changed = s.counts !== null;
  return { show: changed || s.hasHistory, counts: changed ? s.counts : null };
}
```

Run again → PASS.

- [ ] **Step 2: Data hook**

Create `desktop/src/renderer/hooks/useGitFileStatus.ts`:

```ts
// Footer data for the git surface. Fetches git:file-status for the open file
// and refreshes on BOTH change feeds: artifacts:changed (worktree edits, from
// the chokidar watcher) and git:changed (commits/checkouts/staging, from the
// .git watcher — the chokidar one ignores .git/ by design).
// On Android/remote every call rejects (unsupported) and the hook settles to
// null — the footer then renders exactly as it does today. Same graceful
// degradation as content search (FilesTab).
import { useEffect, useState } from 'react';
import type { GitFileStatusResult } from '../../shared/git-types';

export function useGitFileStatus(
  projectRoot: string,
  relPath: string | null,
  enabled: boolean,
): GitFileStatusResult | null {
  const [status, setStatus] = useState<GitFileStatusResult | null>(null);

  useEffect(() => {
    setStatus(null);
    if (!enabled || !relPath || !projectRoot) return;
    const api = (window as any).claude?.git;
    if (!api?.fileStatus) return;
    let alive = true;

    const refresh = () => {
      api.fileStatus(projectRoot, relPath)
        .then((r: GitFileStatusResult) => { if (alive) setStatus(r?.ok ? r : null); })
        .catch(() => { if (alive) setStatus(null); });
    };
    refresh();
    api.watch?.(projectRoot)?.catch?.(() => {});
    const offGit = api.onChanged?.(() => refresh()) ?? (() => {});
    const offArtifacts = (window as any).claude?.artifacts?.onChanged?.((evt: any) => {
      if (evt?.projectRoot === projectRoot) refresh();
    }) ?? (() => {});

    return () => {
      alive = false;
      offGit();
      offArtifacts();
      api.unwatch?.(projectRoot)?.catch?.(() => {});
    };
  }, [projectRoot, relPath, enabled]);

  return status;
}
```

- [ ] **Step 3: Failing DOM test for the footer + view switch**

Create `desktop/src/renderer/components/SessionDrawerGitFooter.test.tsx` (StopButton.test.tsx idiom). SessionDrawer needs its contexts; rather than mounting the whole drawer, this test pins the two pieces Task 7 adds — extract them as small exported components so they test in isolation:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { GitFooterEntry } from './SessionDrawer';

describe('GitFooterEntry', () => {
  beforeEach(() => {
    (window as any).claude = { git: {} };
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('renders counts and the Review Changes button when there are changes', () => {
    const onOpen = vi.fn();
    render(<GitFooterEntry counts={{ added: 41, removed: 12 }} show onOpenReview={onOpen} />);
    expect(screen.getByText('+41')).toBeInTheDocument();
    expect(screen.getByText('−12')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review Changes' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('renders the button without counts for clean-with-history', () => {
    render(<GitFooterEntry counts={null} show onOpenReview={() => {}} />);
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review Changes' })).toBeInTheDocument();
  });

  it('renders nothing when show is false', () => {
    const { container } = render(<GitFooterEntry counts={null} show={false} onOpenReview={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

Run: `npx vitest run src/renderer/components/SessionDrawerGitFooter.test.tsx` → FAIL (no export).

- [ ] **Step 4: SessionDrawer edits**

All in `desktop/src/renderer/components/SessionDrawer.tsx`.

**(a) PATHS icons** — add to the `PATHS` map (`:47-65`). Arc commands are lowercase `a` only: `Ic` splits the path string on capital `M`, so an uppercase `A` arc would corrupt the split:

```ts
  back: 'M19 12H5M11 18l-6-6 6-6',
  gitbranch: 'M6 8.5v7M18 10.5c0 3-4 3.5-7 3.5M6 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M6 20.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M18 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
```

**(b) Exported footer entry component** — add near `FilterToggles` (module scope, exported for the test):

```tsx
// Footer entry for the git surface (mockup ledger 9). Rendered inside the
// metadata strip; absent entirely when show=false so the strip reads exactly
// as it did before the git surface existed.
export function GitFooterEntry({
  counts, show, onOpenReview,
}: {
  counts: { added: number; removed: number } | null;
  show: boolean;
  onOpenReview: () => void;
}) {
  if (!show) return null;
  return (
    <>
      {counts && (
        <>
          <span className="font-mono text-green-400">+{counts.added}</span>
          <span className="font-mono text-red-400">−{counts.removed}</span>
        </>
      )}
      <button
        type="button"
        onClick={onOpenReview}
        title="Review this file's changes"
        className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] text-fg-dim hover:text-fg hover:bg-inset transition-colors"
      >
        Review Changes <Ic name="back" size={11} />
      </button>
    </>
  );
}
```

WHY the arrow reuses `back` mirrored: keep ONE new arrow glyph; wrap the `Ic` in a `<span className="-scale-x-100">`… — simpler: add a third PATHS entry `forward: 'M5 12h14M13 6l6 6-6 6'` and use `<Ic name="forward" size={11} />`. Do that (three icons total: `back`, `forward`, `gitbranch`).

**(c) Hook call + derived state** — inside `SessionDrawer` after `const isElectron = getPlatform() === 'electron';` (`:217`):

```tsx
  const gitReviewOpen = state.gitReviewBySession?.[sessionId] ?? false;
  // Footer git status only for the open file, only while the drawer is visible.
  const gitStatus = useGitFileStatus(projectRoot, active && isElectron ? active.path : null, drawerOpen);
  const gitFooter = gitFooterState(gitStatus);
```

Imports: `import { useGitFileStatus } from '../hooks/useGitFileStatus';` and `import { gitFooterState } from '../utils/git-footer';` — note `active` is defined above the early returns; place the hook call before ANY conditional return (hooks rule): `active` is derived at `:220-230` area — verify and place the hook after `active` is computed but before `if (!drawerOpen) return null;` (`:377`). If `active` is computed later, hoist the hook to use `activeArtifactId` + a lookup instead.

**(d) ESC cascade** — in `handleBack` (`:365-373`), insert after the `expanded` branch:

```tsx
    if (gitReviewOpen) { dispatch({ type: 'GIT_REVIEW_CLOSED', sessionId }); return; }
```

and add `gitReviewOpen` to the dependency array.

**(e) Footer strip** — extend the metadata strip (`:685-691`) with a spacer + the entry:

```tsx
          <div className="flex items-center gap-2 px-3.5 py-1 text-[11px] text-fg-muted border-t border-edge-dim bg-well shrink-0">
            <span>{statusWord}</span>
            <span className="text-fg-faint">·</span>
            <span>{formatRelativeTime(active.lastModified)}</span>
            {content !== null && <><span className="text-fg-faint">·</span><span>{formatSize(content)}</span></>}
            <div className="flex-1" />
            <GitFooterEntry
              counts={gitFooter.counts}
              show={gitFooter.show}
              onOpenReview={() => dispatch({ type: 'GIT_REVIEW_OPENED', sessionId })}
            />
          </div>
```

**(f) View switch shell** — wrap the drawer-content column body (`:615-692`): when `gitReviewOpen && active`, render the review view INSTEAD of find-bar + content + edit cluster + metadata strip (the standard top bar at `:551` stays — locked decision, ledger 10):

```tsx
        <div className="drawer-content flex-1 min-w-0 overflow-hidden relative flex flex-col">
          {gitReviewOpen && active ? (
            <div data-testid="git-review-view" className="flex-1 min-h-0" />
          ) : (
            <>{/* existing find bar + content + edit cluster + metadata strip, unchanged */}</>
          )}
        </div>
```

(The placeholder div is replaced by `<GitReviewView …/>` in Task 8.)

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/renderer/git-footer.test.ts src/renderer/components/SessionDrawerGitFooter.test.tsx`
Expected: PASS.
Run: `npx vitest run` (full suite) — expect no regressions (SessionDrawer still compiles; existing drawer tests green).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/utils/git-footer.ts src/renderer/hooks/useGitFileStatus.ts src/renderer/components/SessionDrawer.tsx src/renderer/components/SessionDrawerGitFooter.test.tsx tests/renderer/git-footer.test.ts
git commit -m "feat(git): SessionDrawer footer entry — counts + Review Changes, ESC cascade, view-switch shell"
```

---

### Task 8: GitReviewView — sub-header, card timeline, composer

**Files:**
- Create: `desktop/src/renderer/components/git/GitReviewCard.tsx`
- Create: `desktop/src/renderer/components/git/GitReviewView.tsx`
- Modify: `desktop/src/renderer/components/SessionDrawer.tsx` (replace Task 7's placeholder)
- Test: `desktop/src/renderer/components/git/GitReviewView.test.tsx`

**Interfaces:**
- Consumes: `window.claude.git.*` (Task 5), `UnifiedDiff` (`../diff/UnifiedDiff`, props `{oldStr, newStr, structuredPatch?}` — pass `oldStr=''`, `newStr=''`, `structuredPatch=hunks`), `formatRelativeTime` (`../../utils/format-time`), `Button`/`Textarea` (`../ui`), types (Task 1).
- Produces: `GitReviewView` props:

```ts
export interface GitReviewViewProps {
  projectRoot: string;
  /** project-root-relative path of the file under review (artifact.path) */
  relPath: string;
  fileName: string;
  onBack: () => void;
  /** jump into the editor at a 1-indexed line (Task 7 host wires revealLine) */
  onOpenAtLine: (line: number) => void;
  /** open the L3 discard confirm (Task 9 wires the dialog; until then a no-op) */
  onRequestDiscard: (untracked: boolean) => void;
}
```

- [ ] **Step 1: Write the failing component test**

Create `desktop/src/renderer/components/git/GitReviewView.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { GitReviewView } from './GitReviewView';

const review = {
  ok: true, isRepo: true, branch: 'master',
  uncommitted: {
    hunks: [{ oldStart: 142, oldLines: 1, newStart: 142, newLines: 2, lines: ['-old line', '+new line', '+added line'] }],
    counts: { added: 2, removed: 1 }, staged: false, untracked: false, binary: false,
  },
  log: [
    { sha: 'a'.repeat(40), shortSha: 'aaaaaaa', subject: 'fix: first', authorDate: '2026-07-22T10:00:00Z' },
    { sha: 'b'.repeat(40), shortSha: 'bbbbbbb', subject: 'feat: second', authorDate: '2026-07-21T10:00:00Z' },
  ],
  hasMore: false, stagedCount: 0,
};

function mountWith(overrides: Partial<typeof review> = {}, props: Partial<React.ComponentProps<typeof GitReviewView>> = {}) {
  (window as any).claude = {
    git: {
      fileReview: vi.fn(async () => ({ ...review, ...overrides })),
      commitFileDiff: vi.fn(async () => ({ ok: true, hunks: [], binary: false })),
      stage: vi.fn(async () => ({ ok: true })),
      unstage: vi.fn(async () => ({ ok: true })),
      commit: vi.fn(async () => ({ ok: true })),
      onChanged: vi.fn(() => () => {}),
    },
  };
  render(
    <GitReviewView
      projectRoot="/proj" relPath="src/f.ts" fileName="f.ts"
      onBack={() => {}} onOpenAtLine={() => {}} onRequestDiscard={() => {}}
      {...props}
    />,
  );
  return (window as any).claude.git;
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('GitReviewView', () => {
  it('renders sub-header title, branch chip, uncommitted card first and expanded', async () => {
    mountWith();
    await waitFor(() => expect(screen.getByText('Uncommitted changes')).toBeInTheDocument());
    expect(screen.getByText(/Reviewing changes for/)).toBeInTheDocument();
    expect(screen.getByText('master')).toBeInTheDocument();
    // expanded by default: its diff rows are visible
    expect(screen.getByText('-old line'.slice(1))).toBeInTheDocument(); // "old line" text cell
    // commit cards listed, collapsed
    expect(screen.getByText('fix: first')).toBeInTheDocument();
    expect(screen.getByText('feat: second')).toBeInTheDocument();
  });

  it('no uncommitted card when the file is clean', async () => {
    mountWith({ uncommitted: null });
    await waitFor(() => expect(screen.getByText('fix: first')).toBeInTheDocument());
    expect(screen.queryByText('Uncommitted changes')).not.toBeInTheDocument();
  });

  it('expanding a commit card lazily fetches its diff', async () => {
    const git = mountWith();
    await waitFor(() => screen.getByText('fix: first'));
    fireEvent.click(screen.getByText('fix: first'));
    await waitFor(() =>
      expect(git.commitFileDiff).toHaveBeenCalledWith('/proj', 'a'.repeat(40), 'src/f.ts'));
  });

  it('Show more appears when hasMore and fetches the next page', async () => {
    const git = mountWith({ hasMore: true });
    await waitFor(() => screen.getByRole('button', { name: /Show more/ }));
    fireEvent.click(screen.getByRole('button', { name: /Show more/ }));
    await waitFor(() =>
      expect(git.fileReview).toHaveBeenCalledWith('/proj', 'src/f.ts', { logSkip: 2 }));
  });

  it('composer: disabled until a message exists AND stagedCount > 0', async () => {
    mountWith({ stagedCount: 0 });
    await waitFor(() => screen.getByText('Uncommitted changes'));
    const btn = screen.getByRole('button', { name: /Commit/ }) as HTMLButtonElement;
    expect(btn).toBeDisabled(); // no staged files
    fireEvent.change(screen.getByPlaceholderText('Commit message'), { target: { value: 'msg' } });
    expect(btn).toBeDisabled(); // still no staged files
  });

  it('composer: commit fires git.commit with the message and clears it', async () => {
    const git = mountWith({ stagedCount: 2 });
    await waitFor(() => screen.getByText('Uncommitted changes'));
    const area = screen.getByPlaceholderText('Commit message');
    fireEvent.change(area, { target: { value: 'feat: from drawer' } });
    const btn = screen.getByRole('button', { name: 'Commit 2 staged files' });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    await waitFor(() => expect(git.commit).toHaveBeenCalledWith('/proj', 'feat: from drawer'));
    await waitFor(() => expect((area as HTMLTextAreaElement).value).toBe(''));
  });

  it('staged checkbox row stages/unstages the file', async () => {
    const git = mountWith();
    await waitFor(() => screen.getByText('Staged for commit'));
    fireEvent.click(screen.getByText('Staged for commit'));
    await waitFor(() => expect(git.stage).toHaveBeenCalledWith('/proj', 'src/f.ts'));
  });

  it('surfaces a failed operation error verbatim', async () => {
    const git = mountWith({ stagedCount: 1 });
    git.commit.mockResolvedValueOnce({ ok: false, error: 'nothing added to commit' });
    await waitFor(() => screen.getByText('Uncommitted changes'));
    fireEvent.change(screen.getByPlaceholderText('Commit message'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Commit 1 staged file' }));
    await waitFor(() => expect(screen.getByText('nothing added to commit')).toBeInTheDocument());
  });
});
```

Run: `npx vitest run src/renderer/components/git/GitReviewView.test.tsx` → FAIL (module missing).

- [ ] **Step 2: Implement `GitReviewCard.tsx`**

```tsx
// One expandable card in the review timeline (mockup ledger 11/12): the
// uncommitted card and every commit card share this shell so the two states
// cannot drift apart visually.
import React from 'react';

export function GitReviewCard({
  accent, expanded, onToggle, headerLeft, headerRight, children,
}: {
  /** accent border marks the pinned Uncommitted card */
  accent?: boolean;
  expanded: boolean;
  onToggle: () => void;
  headerLeft: React.ReactNode;
  headerRight?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border ${accent ? 'border-accent' : 'border-edge'} bg-well overflow-hidden`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-inset transition-colors"
      >
        <span className={`text-fg-muted text-[10px] transition-transform ${expanded ? 'rotate-90' : ''}`}>▸</span>
        {headerLeft}
        {headerRight}
      </button>
      {expanded && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 3: Implement `GitReviewView.tsx`**

```tsx
// The pushed review sub-view (mockup ledger 10-13, spec section 2). Mirror,
// not gate: everything shown here is a live read of git state; staging is the
// real index; refresh rides git:changed. The standard drawer top bar stays in
// the host — this component starts at the sub-header row.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { UnifiedDiff } from '../diff/UnifiedDiff';
import { formatRelativeTime } from '../../utils/format-time';
import { Button, Textarea } from '../ui';
import { GitReviewCard } from './GitReviewCard';
import type { GitFileReviewResult, GitLogEntry } from '../../../shared/git-types';
import type { StructuredPatchHunk } from '../../../shared/types';

export interface GitReviewViewProps {
  projectRoot: string;
  relPath: string;
  fileName: string;
  onBack: () => void;
  onOpenAtLine: (line: number) => void;
  onRequestDiscard: (untracked: boolean) => void;
}

function gitApi(): any {
  return (window as any).claude?.git;
}

export function GitReviewView({
  projectRoot, relPath, fileName, onBack, onOpenAtLine, onRequestDiscard,
}: GitReviewViewProps) {
  const [review, setReview] = useState<GitFileReviewResult | null>(null);
  const [extraLog, setExtraLog] = useState<GitLogEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['uncommitted']));
  const [commitDiffs, setCommitDiffs] = useState<Map<string, StructuredPatchHunk[] | 'loading' | 'empty'>>(new Map());
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  const refresh = useCallback(() => {
    gitApi()?.fileReview?.(projectRoot, relPath)
      .then((r: GitFileReviewResult) => { if (aliveRef.current && r?.ok) { setReview(r); } })
      .catch(() => {});
  }, [projectRoot, relPath]);

  useEffect(() => {
    aliveRef.current = true;
    refresh();
    const off = gitApi()?.onChanged?.(() => refresh()) ?? (() => {});
    return () => { aliveRef.current = false; off(); };
  }, [refresh]);

  const toggle = (key: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const expandCommit = (sha: string) => {
    toggle(sha);
    if (!commitDiffs.has(sha)) {
      setCommitDiffs((m) => new Map(m).set(sha, 'loading'));
      gitApi()?.commitFileDiff?.(projectRoot, sha, relPath)
        .then((d: { ok: boolean; hunks: StructuredPatchHunk[] }) => {
          if (!aliveRef.current) return;
          setCommitDiffs((m) => new Map(m).set(sha, d.ok && d.hunks.length > 0 ? d.hunks : 'empty'));
        })
        .catch(() => { if (aliveRef.current) setCommitDiffs((m) => new Map(m).set(sha, 'empty')); });
    }
  };

  const showMore = () => {
    const skip = (review?.log.length ?? 0) + extraLog.length;
    gitApi()?.fileReview?.(projectRoot, relPath, { logSkip: skip })
      .then((r: GitFileReviewResult) => {
        if (aliveRef.current && r?.ok) {
          setExtraLog((prev) => [...prev, ...r.log]);
          setReview((prev) => (prev ? { ...prev, hasMore: r.hasMore } : prev));
        }
      })
      .catch(() => {});
  };

  const run = async (op: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    setOpError(null);
    try {
      const r = await op();
      // Real stderr passthrough (error-message standard) — never a guessed cause.
      if (!r.ok) setOpError(r.error ?? 'git operation failed');
      else refresh();
      return r.ok;
    } finally { setBusy(false); }
  };

  const stagedCount = review?.stagedCount ?? 0;
  const canCommit = !busy && stagedCount > 0 && message.trim().length > 0;
  const uncommitted = review?.uncommitted ?? null;
  const log = [...(review?.log ?? []), ...extraLog];

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* sub-header BENEATH the standard drawer top bar (ledger 10, locked) */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-edge-dim bg-well shrink-0">
        <button
          type="button"
          onClick={onBack}
          title="Back to file view"
          className="w-7 h-7 rounded-md inline-flex items-center justify-center shrink-0 border transition-colors text-fg-dim border-transparent hover:text-fg hover:bg-inset hover:border-edge"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="text-xs font-medium text-fg-2 truncate">Reviewing changes for “{fileName}”</span>
        <div className="flex-1" />
        {review?.branch && (
          <span className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono text-fg-dim border border-edge-dim" title="Current branch">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="8" r="2.5" />
              <path d="M6 8.5v7M18 10.5c0 3-4 3.5-7 3.5" />
            </svg>
            {review.branch}
          </span>
        )}
      </div>

      {/* card timeline */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2">
        {uncommitted && (
          <GitReviewCard
            accent
            expanded={expanded.has('uncommitted')}
            onToggle={() => toggle('uncommitted')}
            headerLeft={<span className="text-xs font-semibold text-fg flex-1">Uncommitted changes</span>}
            headerRight={
              <>
                <span className="text-[10px] font-mono text-green-400">+{uncommitted.counts.added}</span>
                <span className="text-[10px] font-mono text-red-400">−{uncommitted.counts.removed}</span>
              </>
            }
          >
            {uncommitted.binary ? (
              <div className="text-[11px] text-fg-muted py-1">Binary or oversized file — no line diff.</div>
            ) : (
              <UnifiedDiff oldStr="" newStr="" structuredPatch={uncommitted.hunks} />
            )}
            <div className="flex items-center gap-1.5 mt-2">
              {!uncommitted.untracked && (
                <button
                  type="button"
                  onClick={() => run(() => (uncommitted.staged
                    ? gitApi().unstage(projectRoot, relPath)
                    : gitApi().stage(projectRoot, relPath)))}
                  className="flex items-center gap-1.5 text-[11px] text-fg-2 hover:text-fg transition-colors"
                >
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    {uncommitted.staged && <path d="m8 12.5 3 3 5.5-6.5" />}
                  </svg>
                  Staged for commit
                </button>
              )}
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => onRequestDiscard(uncommitted.untracked)}
                className="px-2 py-1 rounded-md text-[11px] text-destructive-fg hover:bg-destructive/10 transition-colors"
              >
                {uncommitted.untracked ? 'Delete file…' : 'Discard changes…'}
              </button>
              {uncommitted.hunks.length > 0 && (
                <button
                  type="button"
                  onClick={() => onOpenAtLine(uncommitted.hunks[0].newStart)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-fg-dim hover:text-fg hover:bg-inset transition-colors"
                >
                  Open file ↗
                </button>
              )}
            </div>
          </GitReviewCard>
        )}

        {log.map((entry) => {
          const body = commitDiffs.get(entry.sha);
          return (
            <GitReviewCard
              key={entry.sha}
              expanded={expanded.has(entry.sha)}
              onToggle={() => expandCommit(entry.sha)}
              headerLeft={
                <>
                  <span className="font-mono text-[11px] text-fg-faint">{entry.shortSha}</span>
                  <span className="text-xs text-fg-2 truncate flex-1">{entry.subject}</span>
                </>
              }
              headerRight={<span className="text-[11px] text-fg-faint whitespace-nowrap">{formatRelativeTime(entry.authorDate)}</span>}
            >
              {body === 'loading' && <div className="text-[11px] text-fg-muted py-1">Loading…</div>}
              {body === 'empty' && <div className="text-[11px] text-fg-muted py-1">No direct changes to this file in this commit.</div>}
              {Array.isArray(body) && <UnifiedDiff oldStr="" newStr="" structuredPatch={body} />}
            </GitReviewCard>
          );
        })}

        {review?.hasMore && (
          <button
            type="button"
            onClick={showMore}
            className="text-[10px] uppercase tracking-wider text-fg-muted hover:text-fg-2 py-1"
          >
            Show more
          </button>
        )}
      </div>

      {/* composer (ledger 13): counts staged files REPO-WIDE — a commit always
          commits the whole index, including files the agent staged meanwhile. */}
      <div className="shrink-0 border-t border-edge px-2 py-2 bg-inset">
        {opError && (
          <div className="mb-1 px-2.5 py-1.5 text-[11px] text-fg rounded-md border border-edge bg-well break-all">
            {opError}
          </div>
        )}
        <Textarea
          size="sm"
          rows={2}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Commit message"
          className="w-full"
        />
        <Button
          size="md"
          variant="primary"
          disabled={!canCommit}
          className="mt-1 w-full"
          onClick={async () => {
            const ok = await run(() => gitApi().commit(projectRoot, message));
            if (ok) setMessage('');
          }}
        >
          {`Commit ${stagedCount} staged file${stagedCount === 1 ? '' : 's'}`}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Replace the Task 7 placeholder in SessionDrawer**

```tsx
          {gitReviewOpen && active ? (
            <GitReviewView
              projectRoot={projectRoot}
              relPath={active.path}
              fileName={fileName}
              onBack={() => dispatch({ type: 'GIT_REVIEW_CLOSED', sessionId })}
              onOpenAtLine={(line) => {
                // Close review, then land the editor on the line. revealLine
                // internally retries while the lazy CM6 chunk mounts, but the
                // handle itself is null until ActiveArtifactView remounts —
                // defer one frame so the ref is populated.
                dispatch({ type: 'GIT_REVIEW_CLOSED', sessionId });
                requestAnimationFrame(() => editRef.current?.revealLine(line));
              }}
              onRequestDiscard={() => { /* wired in Task 9 */ }}
            />
          ) : (
            <>{/* existing content, unchanged */}</>
          )}
```

Import: `import { GitReviewView } from './git/GitReviewView';`

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/renderer/components/git/GitReviewView.test.tsx`
Expected: PASS (all 9 tests).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/git/ src/renderer/components/SessionDrawer.tsx
git commit -m "feat(git): GitReviewView — pushed sub-view with card timeline and repo-wide commit composer"
```

---

### Task 9: Discard confirm dialog (L3 destructive)

**Files:**
- Create: `desktop/src/renderer/components/git/DiscardConfirmDialog.tsx`
- Modify: `desktop/src/renderer/components/SessionDrawer.tsx` (wire `onRequestDiscard`)
- Test: `desktop/src/renderer/components/git/DiscardConfirmDialog.test.tsx`

**Interfaces:**
- Consumes: `Scrim`, `OverlayPanel` from `../overlays/Overlay` (`Scrim {layer, onClick, children}`, `OverlayPanel {layer, destructive?, className, role, 'aria-modal', …}` — layer 3 = destructive confirmations); `Button` from `../ui` (variants `secondary`, `danger`); `window.claude.git.discard` (Task 5).
- Produces:

```ts
export interface DiscardConfirmDialogProps {
  fileName: string;
  untracked: boolean;
  onConfirm: () => void;  // caller runs git.discard and closes
  onCancel: () => void;
}
```

- [ ] **Step 1: Write the failing test**

Create `desktop/src/renderer/components/git/DiscardConfirmDialog.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DiscardConfirmDialog } from './DiscardConfirmDialog';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('DiscardConfirmDialog', () => {
  it('tracked copy states exactly what is restored and confirm fires', () => {
    const onConfirm = vi.fn();
    render(<DiscardConfirmDialog fileName="f.ts" untracked={false} onConfirm={onConfirm} onCancel={() => {}} />);
    expect(screen.getByText(/Restore “f.ts” to its last committed state\?/)).toBeInTheDocument();
    expect(screen.getByText(/uncommitted edits to this file will be lost/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('untracked copy says trash, not restore', () => {
    render(<DiscardConfirmDialog fileName="new.ts" untracked onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByText(/Move “new.ts” to the system trash\?/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete file' })).toBeInTheDocument();
  });

  it('cancel and Escape both close without confirming', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<DiscardConfirmDialog fileName="f.ts" untracked={false} onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
```

Run: `npx vitest run src/renderer/components/git/DiscardConfirmDialog.test.tsx` → FAIL.

- [ ] **Step 2: Implement `DiscardConfirmDialog.tsx`**

```tsx
// L3 destructive confirm for the git surface (spec section 5). Uses the shared
// overlay primitives — never a hand-rolled bg-black/40 (react-renderer rule).
// The copy states EXACTLY what happens; the failure path (surfaced by the
// caller) carries real git stderr.
import React, { useEffect } from 'react';
import { Scrim, OverlayPanel } from '../overlays/Overlay';
import { Button } from '../ui';

export interface DiscardConfirmDialogProps {
  fileName: string;
  untracked: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DiscardConfirmDialog({ fileName, untracked, onConfirm, onCancel }: DiscardConfirmDialogProps) {
  // Capture-phase Escape = cancel, same pattern as UnsavedChangesDialog — the
  // drawer's own ESC cascade must not fire underneath an open dialog.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [onCancel]);

  return (
    <Scrim layer={3} onClick={onCancel} className="flex items-center justify-center">
      <OverlayPanel
        layer={3}
        destructive
        role="alertdialog"
        aria-modal
        aria-label={untracked ? 'Delete file' : 'Discard changes'}
        className="p-4 max-w-sm w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-medium text-fg mb-1">
          {untracked ? `Move “${fileName}” to the system trash?` : `Restore “${fileName}” to its last committed state?`}
        </div>
        <div className="text-sm text-fg-2 mb-4 break-all">
          {untracked
            ? 'The file is untracked — git has no copy of it. It goes to the trash, not permanent deletion.'
            : 'Your uncommitted edits to this file will be lost. Staged and unstaged changes are both restored from HEAD.'}
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm}>{untracked ? 'Delete file' : 'Discard changes'}</Button>
        </div>
      </OverlayPanel>
    </Scrim>
  );
}
```

- [ ] **Step 3: Wire it in SessionDrawer**

Add state + handler inside `SessionDrawer` (near the other git state from Task 7):

```tsx
  const [discardAsk, setDiscardAsk] = useState<{ untracked: boolean } | null>(null);
  const [discardError, setDiscardError] = useState<string | null>(null);
```

Replace Task 8's `onRequestDiscard={() => {}}` with `onRequestDiscard={(untracked) => setDiscardAsk({ untracked })}` and render next to `{unsavedDialog}` (`:549`):

```tsx
      {discardAsk && active && (
        <DiscardConfirmDialog
          fileName={fileName}
          untracked={discardAsk.untracked}
          onConfirm={async () => {
            setDiscardAsk(null);
            const r = await (window as any).claude?.git?.discard?.(projectRoot, active.path).catch(
              (e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }));
            // Real stderr or nothing — the review view refreshes itself via git:changed.
            setDiscardError(r?.ok ? null : (r?.error ?? 'git discard failed'));
          }}
          onCancel={() => setDiscardAsk(null)}
        />
      )}
```

Pass `discardError` into `GitReviewView` presentation by leaving it to the view's own `opError`? No — keep ONE error surface: add an optional prop to `GitReviewView` (`externalError?: string | null`) rendered in the same `opError` slot, and pass `discardError`. Add the prop to `GitReviewViewProps` and render `{(opError ?? externalError) && (...)}` in the composer block.

Import: `import { DiscardConfirmDialog } from './git/DiscardConfirmDialog';`

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/renderer/components/git/`
Expected: PASS (dialog tests + review-view tests still green after the `externalError` prop addition).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/git/DiscardConfirmDialog.tsx src/renderer/components/git/DiscardConfirmDialog.test.tsx src/renderer/components/git/GitReviewView.tsx src/renderer/components/SessionDrawer.tsx
git commit -m "feat(git): L3 discard confirm — restore-from-HEAD / trash-untracked with exact copy"
```

---

### Task 10: Full verification, build, and handoff

**Files:**
- No new source files. Runs suites/builds; PR.

- [ ] **Step 1: Full desktop test suite**

Run: `cd youcoded/desktop && npm test -- --run`
Expected: ALL tests pass, including the pre-existing suites (ipc-channels parity, artifact tests, Button/Overlay pins).

- [ ] **Step 2: Type-check and build**

Run: `cd youcoded/desktop && npm run build`
Expected: clean build (tsc + vite). Fix any type errors surfaced by the new shared types.

- [ ] **Step 3: Android compile check (Kotlin stub only)**

Run: `cd youcoded && ./scripts/build-web-ui.sh && ./gradlew assembleDebug`
Expected: BUILD SUCCESSFUL — proves the `SessionService.kt` stub block compiles and the shared renderer bundle builds with the new components. (Do NOT run this in a worktree with junctioned `node_modules` — see workspace CLAUDE.md; on this Linux box junctions don't apply, but `npm ci` inside `build-web-ui.sh` rule still holds.)

- [ ] **Step 4: Interactive verification — Destin's eyeball, not a CDP rig**

Start the dev instance from the WORKSPACE root: `bash scripts/run-dev.sh`. Then hand off to Destin with this checklist (live-app-safety: dev instance only; flag, don't automate — the final feel-check is his):

1. Open a session in a real git project; open a modified file in the drawer → footer shows `+N −N · Review Changes →`.
2. Click Review Changes → standard header stays, sub-header appears beneath, uncommitted card expanded.
3. Commit from a terminal while the view is open → uncommitted card collapses into a new commit card (mirror check).
4. Stage checkbox, commit with a message, discard a scratch file (goes to trash).
5. ESC walks back: review → file view → drawer close.

- [ ] **Step 5: PR + docs lifecycle**

Use superpowers:finishing-a-development-branch. On merge to youcoded master (merge means merge AND push):
- Move `docs/active/plans/2026-07-22-git-surface.md` and the spec to `docs/archive/` and flip the ROADMAP `#git` entry to `[x]` **in the same session** (workspace rule).
- Archive `docs/active/handoffs/2026-07-22-handoff-git-surface-and-version-tracking.md` (superseded → shipped).
- Add phase-2 ROADMAP entries from spec section 8 if not already present (branch ops, push/PR, repo-wide review, hunk staging).
- Shut down the dev server once the commit lands (workspace rule).

```bash
git worktree remove <path> && git branch -D feat/git-surface   # after merge verified on master
```

---

## Self-Review (performed at write time)

**Spec coverage:** §1 framing → constraints block + composer/copy wording (Tasks 8, 9). §2 UI: footer entry (T7), pushed sub-header (T8), cards/anatomy (T8), composer (T8), rejected items absent. §3 architecture: new module (T1–T4), repo resolution (T2), operations (T3), IPC + parity (T5). §4 refresh: chokidar reuse + `.git` watcher + own-op broadcast (T4, T5, T7 hook). §5 safety: root gate (T5), L3 confirm + trashItem (T3, T9), stderr passthrough (T3, T8, T9), D5 untouched (no editable-path change anywhere). §6 platforms: Kotlin stub + shim auto-unsupported + `.catch`-to-null hooks (T5, T7). §7 testing: parsers (T1), fixture-repo integration (T2, T3), watcher (T4), parity (T5), reducer (T6), footer visibility (T7), timeline/composer/commit-fires (T8), eyeball pass (T10). §8 non-goals: nothing in this plan implements them.

**Known judgment calls (not gaps):**
- `git:file-status` and `git:file-review` re-run `git status` rather than sharing a cache — correctness first; profile before optimizing.
- `revealLine` handoff after closing review uses one `requestAnimationFrame` + the handle's own 20×50ms retry; if the ref is still null on slow mounts, switch to a `pendingReveal` state consumed by an effect (noted inline in T8 step 4).
- Reducer test imports `artifactReducer`/`initialArtifactState` — if the reducer is module-local today, export it (T6 step 1 note) rather than renaming anything.

**Type consistency check:** `GitFileStatusResult`/`GitFileReviewResult`/`GitOpResult` shapes match between service (T3), handlers' blocked-fallback objects (T5), hook (T7), and view (T8). `LOG_PAGE` used in T3 test and T8 `logSkip` math. `relPath` is project-root-relative everywhere (converted to repo-relative only inside `locate()`).



