---
status: shipped
---

# Project View Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Project View into a project hub with Artifacts / Conversations / Context tabs, a palette project-switcher, a GitHub outlink, and an in-place agent-context teaching+editing layer.

**Architecture:** A new main-process `project:*` IPC layer (conversations filter, repo-info, context discovery + read/write) built with a pure-core / IO-shell split, mirroring the existing `artifacts:*` convention. The renderer decomposes the single `ProjectView.tsx` into ~11 focused components under `components/project-view/`. Conversations reuse `session-browser.ts`; artifacts reuse the existing `artifacts:*` data layer. Desktop-first; Android handlers are stubs in v1.

**Tech Stack:** TypeScript, Electron (main + preload + IPC), React (renderer), Vitest, Tailwind + theme tokens, lucide-style inline SVG.

**Spec:** `docs/superpowers/specs/2026-06-14-project-view-redesign-design.md` (commit 6bba15f)
**Prototype (visual source of truth):** `docs/superpowers/prototypes/2026-06-14-project-view-redesign.html`
**Worktree / branch:** all code changes in `C:/Users/desti/youcoded-dev/youcoded.wt/artifact-viewer` on `feat/artifact-viewer`. Paths below are relative to `desktop/` unless noted. The plan doc + PITFALLS/cc-dependencies edits in Task 5.3 land in the `youcoded-dev` workspace and `youcoded/docs/` respectively.

**Conventions for every task:**
- Run tests from `desktop/`: `npx vitest run <path>`.
- Verify visual tasks via `bash scripts/run-dev.sh` from the workspace root (NEVER the live app — see `.claude/rules/live-app-safety.md`). Port 5223; the dev window is labelled "YouCoded Dev".
- Annotate non-trivial edits with a `// WHY:` comment (Destin is non-technical).
- IPC string constants must be byte-identical across `preload.ts`, `remote-shim.ts`, `ipc-handlers.ts`, and `SessionService.kt` (stub).

---

## File structure

**New (main):**
| File | Responsibility |
|------|----------------|
| `src/main/project/ipc-channels.ts` | `PROJECT_IPC` channel constants |
| `src/main/project/repo-url.ts` | Pure: parse/normalize a git remote URL → GitHub `webUrl` |
| `src/main/project/context-discovery.ts` | Pure: (dir listings + filename list + rule frontmatter) → `ContextFile[]` |
| `src/main/project-conversations.ts` | IO: project-filtered conversation list + history (wraps `session-browser.ts`) |
| `src/main/project-repo.ts` | IO: read `.git/config`, call `repo-url.ts` |
| `src/main/project-context.ts` | IO: fs reads/writes feeding `context-discovery.ts`, allow-listed read/write |

**New (shared):**
| File | Responsibility |
|------|----------------|
| `src/shared/project-context-types.ts` | `ContextScope`, `LoadTiming`, `ContextFile`, `ContextGroup` |

**New (renderer, under `src/renderer/components/project-view/`):**
`ProjectView.tsx` (rewritten, moved here), `ProjectHero.tsx`, `ProjectSwitcher.tsx`, `ProjectDetailOverlay.tsx`, `tabs/ArtifactsTab.tsx`, `tabs/ConversationsTab.tsx`, `tabs/ContextTab.tsx`, `ConversationPreview.tsx`, `ContextIntroBanner.tsx`, `HowContextWorksPopup.tsx`, `ContextEditorOverlay.tsx`.

**Modified:** `src/main/preload.ts`, `src/renderer/remote-shim.ts`, `src/main/ipc-handlers.ts`, `src/renderer/App.tsx` (props into `<ProjectView>`), `src/renderer/components/SessionDrawer.tsx` (glyph→word), `app/.../runtime/SessionService.kt` (stubs). Old `src/renderer/components/ProjectView.tsx` is deleted (logic migrates into `project-view/`).

**New tests:** `tests/project-repo-url.test.ts`, `tests/project-context-discovery.test.ts`, `tests/project-conversations.test.ts`, and additions to `tests/ipc-channels.test.ts`.

---

## Phase 1 — Main-process data layer

### Task 1.1: PROJECT_IPC channel constants + context types

**Files:**
- Create: `src/main/project/ipc-channels.ts`
- Create: `src/shared/project-context-types.ts`

- [ ] **Step 1: Create the channel constants**

`src/main/project/ipc-channels.ts`:
```ts
// IPC channel constants for the Project View hub (conversations, repo, context).
// Mirrors src/main/artifacts/ipc-channels.ts. Keep every value in sync with
// preload.ts, remote-shim.ts, ipc-handlers.ts, and SessionService.kt (stub).
// (No apostrophes in comments — the ipc parity test scans single-quoted strings.)
export const PROJECT_IPC = {
  LIST_CONVERSATIONS: 'project:list-conversations',
  CONVERSATION_HISTORY: 'project:conversation-history',
  REPO_INFO: 'project:repo-info',
  LIST_CONTEXT: 'project:list-context',
  READ_CONTEXT_FILE: 'project:read-context-file',
  WRITE_CONTEXT_FILE: 'project:write-context-file',
} as const;

export type ProjectIpcChannel = typeof PROJECT_IPC[keyof typeof PROJECT_IPC];
```

- [ ] **Step 2: Create the shared context types**

`src/shared/project-context-types.ts`:
```ts
export type ContextScope = 'project' | 'global' | 'memory';
export type LoadTiming =
  | 'always' | 'always-everywhere' | 'conditional' | 'on-recall' | 'index';
export type ContextKind =
  | 'claude-md' | 'agents-md' | 'rule' | 'memory-index' | 'memory-note';

export interface ContextFile {
  id: string;            // stable: `${scope}:${absolutePath}`
  scope: ContextScope;
  kind: ContextKind;
  label: string;         // display name (filename or rule/memory slug)
  absolutePath: string;
  timing: LoadTiming;
  glob?: string;         // set when timing === 'conditional'
  editable: boolean;     // true in v1
  blastRadius: 'global' | 'project';
}

export interface ContextGroup {
  scope: ContextScope;
  files: ContextFile[];
}

// Recognized agent-instruction filenames. Format-agnostic so future harnesses
// (opencode, gemini, custom) are surfaced without code changes.
export const RECOGNIZED_INSTRUCTION_FILES = ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md'] as const;
```

- [ ] **Step 3: Typecheck**

Run: `cd desktop && npx tsc --noEmit`
Expected: PASS (no new files referenced yet).

- [ ] **Step 4: Commit**
```bash
git add desktop/src/main/project/ipc-channels.ts desktop/src/shared/project-context-types.ts
git commit -m "feat(project-view): PROJECT_IPC channels + context types"
```

---

### Task 1.2: Pure repo-URL normalizer

**Files:**
- Create: `src/main/project/repo-url.ts`
- Test: `tests/project-repo-url.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/project-repo-url.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { normalizeRepoUrl } from '../src/main/project/repo-url';

describe('normalizeRepoUrl', () => {
  it('normalizes ssh form', () => {
    expect(normalizeRepoUrl('git@github.com:itsdestin/youcoded.git'))
      .toEqual({ owner: 'itsdestin', name: 'youcoded', webUrl: 'https://github.com/itsdestin/youcoded' });
  });
  it('normalizes https form with .git', () => {
    expect(normalizeRepoUrl('https://github.com/itsdestin/youcoded.git'))
      .toEqual({ owner: 'itsdestin', name: 'youcoded', webUrl: 'https://github.com/itsdestin/youcoded' });
  });
  it('normalizes https form without .git', () => {
    expect(normalizeRepoUrl('https://github.com/itsdestin/youcoded'))
      .toEqual({ owner: 'itsdestin', name: 'youcoded', webUrl: 'https://github.com/itsdestin/youcoded' });
  });
  it('returns null for non-github hosts', () => {
    expect(normalizeRepoUrl('git@gitlab.com:foo/bar.git')).toBeNull();
  });
  it('returns null for garbage', () => {
    expect(normalizeRepoUrl('not a url')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd desktop && npx vitest run tests/project-repo-url.test.ts`
Expected: FAIL ("Cannot find module .../repo-url").

- [ ] **Step 3: Implement**

`src/main/project/repo-url.ts`:
```ts
// Pure normalizer: a git remote URL → GitHub owner/name/webUrl, or null when
// the remote is not a recognizable GitHub repo. No I/O — unit-testable.
export interface RepoUrlInfo { owner: string; name: string; webUrl: string; }

export function normalizeRepoUrl(remote: string): RepoUrlInfo | null {
  const trimmed = (remote || '').trim();
  // ssh: git@github.com:owner/name(.git)
  const ssh = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/.exec(trimmed);
  // https: https://github.com/owner/name(.git)
  const https = /^https?:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/.exec(trimmed);
  const m = ssh || https;
  if (!m) return null;
  const owner = m[1];
  const name = m[2];
  if (!owner || !name) return null;
  return { owner, name, webUrl: `https://github.com/${owner}/${name}` };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd desktop && npx vitest run tests/project-repo-url.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**
```bash
git add desktop/src/main/project/repo-url.ts desktop/tests/project-repo-url.test.ts
git commit -m "feat(project-view): pure GitHub repo-URL normalizer + tests"
```

---

### Task 1.3: Pure context-discovery mapper

**Files:**
- Create: `src/main/project/context-discovery.ts`
- Test: `tests/project-context-discovery.test.ts`

The mapper takes already-listed directory contents (no `fs`) so it is pure. The IO shell (Task 1.5) reads directories + rule frontmatter and feeds it.

- [ ] **Step 1: Write the failing test**

`tests/project-context-discovery.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { discoverContext, type DiscoveryInput } from '../src/main/project/context-discovery';

const input: DiscoveryInput = {
  projectRoot: '/home/u/proj',
  homeDir: '/home/u',
  projectSlug: '-home-u-proj',
  // files that exist on disk, by scope
  projectInstructionFiles: ['CLAUDE.md'],          // basename only, found in projectRoot or .claude
  projectRules: [{ file: 'android.md', glob: 'app/**' }, { file: 'general.md' }],
  globalInstructionFiles: ['CLAUDE.md', 'AGENTS.md'],
  globalRules: [{ file: 'live-app-safety.md' }],
  memoryFiles: ['MEMORY.md', 'feedback_x.md'],
};

describe('discoverContext', () => {
  const groups = discoverContext(input);
  const byScope = (s: string) => groups.find(g => g.scope === s)!.files;

  it('returns three groups in order project, global, memory', () => {
    expect(groups.map(g => g.scope)).toEqual(['project', 'global', 'memory']);
  });
  it('marks project CLAUDE.md always', () => {
    const f = byScope('project').find(x => x.kind === 'claude-md')!;
    expect(f.timing).toBe('always');
    expect(f.blastRadius).toBe('project');
  });
  it('marks global CLAUDE.md always-everywhere with global blast radius', () => {
    const f = byScope('global').find(x => x.kind === 'claude-md')!;
    expect(f.timing).toBe('always-everywhere');
    expect(f.blastRadius).toBe('global');
  });
  it('marks a globbed rule conditional and carries the glob', () => {
    const f = byScope('project').find(x => x.label === 'android.md')!;
    expect(f.timing).toBe('conditional');
    expect(f.glob).toBe('app/**');
  });
  it('marks an unglobbed rule always', () => {
    expect(byScope('project').find(x => x.label === 'general.md')!.timing).toBe('always');
  });
  it('marks MEMORY.md as index and other memory files on-recall', () => {
    expect(byScope('memory').find(x => x.label === 'MEMORY.md')!.timing).toBe('index');
    expect(byScope('memory').find(x => x.label === 'feedback_x.md')!.timing).toBe('on-recall');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd desktop && npx vitest run tests/project-context-discovery.test.ts`
Expected: FAIL ("Cannot find module .../context-discovery").

- [ ] **Step 3: Implement**

`src/main/project/context-discovery.ts`:
```ts
import {
  ContextFile, ContextGroup, ContextScope, LoadTiming, ContextKind,
} from '../../shared/project-context-types';

// WHY: pure mapper. The IO shell (project-context.ts) does directory listing and
// frontmatter parsing, then hands plain data here so this stays unit-testable.
export interface RuleEntry { file: string; glob?: string; absolutePath?: string }
export interface DiscoveryInput {
  projectRoot: string;
  homeDir: string;
  projectSlug: string;
  projectInstructionFiles: string[];   // basenames found (CLAUDE.md, AGENTS.md, …)
  projectInstructionPaths?: Record<string, string>; // basename → absolutePath
  projectRules: RuleEntry[];
  globalInstructionFiles: string[];
  globalInstructionPaths?: Record<string, string>;
  globalRules: RuleEntry[];
  memoryFiles: string[];               // basenames in the memory dir
  memoryPaths?: Record<string, string>;
}

function instrKind(basename: string): ContextKind {
  return basename.toUpperCase().startsWith('AGENTS') ? 'agents-md' : 'claude-md';
}

function mk(
  scope: ContextScope, kind: ContextKind, label: string, absolutePath: string,
  timing: LoadTiming, blastRadius: 'global' | 'project', glob?: string,
): ContextFile {
  return { id: `${scope}:${absolutePath}`, scope, kind, label, absolutePath, timing, glob, editable: true, blastRadius };
}

export function discoverContext(input: DiscoveryInput): ContextGroup[] {
  const project: ContextFile[] = [];
  const global: ContextFile[] = [];
  const memory: ContextFile[] = [];

  for (const f of input.projectInstructionFiles) {
    const p = input.projectInstructionPaths?.[f] ?? `${input.projectRoot}/${f}`;
    project.push(mk('project', instrKind(f), f, p, 'always', 'project'));
  }
  for (const r of input.projectRules) {
    const p = r.absolutePath ?? `${input.projectRoot}/.claude/rules/${r.file}`;
    project.push(mk('project', 'rule', r.file, p, r.glob ? 'conditional' : 'always', 'project', r.glob));
  }
  for (const f of input.globalInstructionFiles) {
    const p = input.globalInstructionPaths?.[f] ?? `${input.homeDir}/.claude/${f}`;
    global.push(mk('global', instrKind(f), f, p, 'always-everywhere', 'global'));
  }
  for (const r of input.globalRules) {
    const p = r.absolutePath ?? `${input.homeDir}/.claude/rules/${r.file}`;
    global.push(mk('global', 'rule', r.file, p, r.glob ? 'conditional' : 'always', 'global', r.glob));
  }
  for (const f of input.memoryFiles) {
    const p = input.memoryPaths?.[f] ?? `${input.homeDir}/.claude/projects/${input.projectSlug}/memory/${f}`;
    const isIndex = f === 'MEMORY.md';
    memory.push(mk('memory', isIndex ? 'memory-index' : 'memory-note', f, p, isIndex ? 'index' : 'on-recall', 'project'));
  }

  return [
    { scope: 'project', files: project },
    { scope: 'global', files: global },
    { scope: 'memory', files: memory },
  ];
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd desktop && npx vitest run tests/project-context-discovery.test.ts`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**
```bash
git add desktop/src/main/project/context-discovery.ts desktop/tests/project-context-discovery.test.ts
git commit -m "feat(project-view): pure agent-context discovery mapper + tests"
```

---

### Task 1.4: Project-filtered conversations module

**Files:**
- Create: `src/main/project-conversations.ts`
- Test: `tests/project-conversations.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/project-conversations.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/main/session-browser', () => ({
  listPastSessions: vi.fn(async () => ([
    { sessionId: 'a', name: 'A', projectSlug: '-home-u-proj', projectPath: '/home/u/proj', lastModified: 2, size: 999 },
    { sessionId: 'b', name: 'B', projectSlug: '-home-u-other', projectPath: '/home/u/other', lastModified: 1, size: 999 },
  ])),
  loadHistory: vi.fn(async () => ([{ role: 'user', content: 'hi', timestamp: 1 }])),
}));

import { listProjectConversations, projectConversationHistory } from '../src/main/project-conversations';

describe('listProjectConversations', () => {
  it('keeps only sessions whose slug matches the project path', async () => {
    const res = await listProjectConversations('/home/u/proj');
    expect(res.map(s => s.sessionId)).toEqual(['a']);
  });
});

describe('projectConversationHistory', () => {
  it('delegates to loadHistory with the derived slug', async () => {
    const msgs = await projectConversationHistory('/home/u/proj', 'a', 20, false);
    expect(msgs).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd desktop && npx vitest run tests/project-conversations.test.ts`
Expected: FAIL ("Cannot find module .../project-conversations").

- [ ] **Step 3: Implement**

`src/main/project-conversations.ts`:
```ts
import { listPastSessions, loadHistory } from './session-browser';
import { cwdToProjectSlug } from './transcript-watcher';
import type { PastSession, HistoryMessage } from '../shared/types';

// WHY: listPastSessions is global. Project View needs just this project's
// sessions, so filter by the same slug CC uses for the project directory.
export async function listProjectConversations(projectPath: string): Promise<PastSession[]> {
  const slug = cwdToProjectSlug(projectPath);
  const all = await listPastSessions();
  return all.filter((s) => s.projectSlug === slug);
}

export async function projectConversationHistory(
  projectPath: string, sessionId: string, count: number, all: boolean,
): Promise<HistoryMessage[]> {
  const slug = cwdToProjectSlug(projectPath);
  return loadHistory(sessionId, slug, count, all);
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd desktop && npx vitest run tests/project-conversations.test.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**
```bash
git add desktop/src/main/project-conversations.ts desktop/tests/project-conversations.test.ts
git commit -m "feat(project-view): project-filtered conversation list + history"
```

---

### Task 1.5: IO shells — repo-info + context read/write

**Files:**
- Create: `src/main/project-repo.ts`
- Create: `src/main/project-context.ts`

No new unit tests (thin fs glue over the tested pure cores); covered by the dev-server check in Task 2.2/4.1.

- [ ] **Step 1: Implement repo-info IO shell**

`src/main/project-repo.ts`:
```ts
import fs from 'fs';
import path from 'path';
import { normalizeRepoUrl, RepoUrlInfo } from './project/repo-url';

export interface RepoInfo extends Partial<RepoUrlInfo> { hasRepo: boolean; remoteUrl?: string }

// WHY: read .git/config directly (no git spawn) and reuse the pure normalizer.
// Returns hasRepo:false when there is no .git, no origin remote, or the remote
// is not a GitHub URL we can build a webUrl for.
export async function getRepoInfo(projectPath: string): Promise<RepoInfo> {
  try {
    const cfg = await fs.promises.readFile(path.join(projectPath, '.git', 'config'), 'utf8');
    // Find [remote "origin"] ... url = <value>
    const block = /\[remote "origin"\][^[]*/s.exec(cfg)?.[0] ?? '';
    const url = /url\s*=\s*(.+)/.exec(block)?.[1]?.trim();
    if (!url) return { hasRepo: false };
    const info = normalizeRepoUrl(url);
    if (!info) return { hasRepo: true, remoteUrl: url };
    return { hasRepo: true, remoteUrl: url, ...info };
  } catch {
    return { hasRepo: false };
  }
}
```

- [ ] **Step 2: Implement context IO shell**

`src/main/project-context.ts`:
```ts
import fs from 'fs';
import os from 'os';
import path from 'path';
import { discoverContext, RuleEntry } from './project/context-discovery';
import { cwdToProjectSlug } from './transcript-watcher';
import { RECOGNIZED_INSTRUCTION_FILES, ContextGroup } from '../shared/project-context-types';

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');

async function exists(p: string): Promise<boolean> {
  try { await fs.promises.access(p); return true; } catch { return false; }
}

// Find recognized instruction files in a directory and (for project scope) its
// .claude subdir. Returns basename → absolutePath for those that exist.
async function findInstructionFiles(dirs: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const dir of dirs) {
    for (const name of RECOGNIZED_INSTRUCTION_FILES) {
      const p = path.join(dir, name);
      if (!out[name] && await exists(p)) out[name] = p;
    }
  }
  return out;
}

// Parse a rule .md frontmatter for a globs:/glob: field (first value only).
async function readRules(rulesDir: string): Promise<RuleEntry[]> {
  let files: string[];
  try { files = (await fs.promises.readdir(rulesDir)).filter(f => f.endsWith('.md')); }
  catch { return []; }
  const out: RuleEntry[] = [];
  for (const file of files) {
    const absolutePath = path.join(rulesDir, file);
    let glob: string | undefined;
    try {
      const head = (await fs.promises.readFile(absolutePath, 'utf8')).slice(0, 2000);
      const fm = /^---\s*([\s\S]*?)\s*---/.exec(head)?.[1] ?? '';
      const g = /(?:globs?|glob)\s*:\s*(.+)/i.exec(fm)?.[1]?.trim();
      if (g) glob = g.replace(/^['"\[]+|['"\]]+$/g, '').split(',')[0].trim();
    } catch { /* unreadable rule — list it with no glob */ }
    out.push({ file, glob, absolutePath });
  }
  return out;
}

export async function listContext(projectPath: string): Promise<ContextGroup[]> {
  const slug = cwdToProjectSlug(projectPath);
  const projInstr = await findInstructionFiles([projectPath, path.join(projectPath, '.claude')]);
  const globalInstr = await findInstructionFiles([CLAUDE_DIR]);
  const projRules = await readRules(path.join(projectPath, '.claude', 'rules'));
  const globalRules = await readRules(path.join(CLAUDE_DIR, 'rules'));

  const memoryDir = path.join(CLAUDE_DIR, 'projects', slug, 'memory');
  let memoryFiles: string[] = [];
  const memoryPaths: Record<string, string> = {};
  try {
    memoryFiles = (await fs.promises.readdir(memoryDir)).filter(f => f.endsWith('.md'));
    for (const f of memoryFiles) memoryPaths[f] = path.join(memoryDir, f);
  } catch { /* no memory dir for this project */ }

  return discoverContext({
    projectRoot: projectPath, homeDir: HOME, projectSlug: slug,
    projectInstructionFiles: Object.keys(projInstr), projectInstructionPaths: projInstr,
    projectRules: projRules,
    globalInstructionFiles: Object.keys(globalInstr), globalInstructionPaths: globalInstr,
    globalRules,
    memoryFiles, memoryPaths,
  });
}

// Allow-list guard: only paths that appear in the discovered set for this
// project may be read or written. Prevents arbitrary-path I/O via these IPCs.
async function isAllowed(projectPath: string, absolutePath: string): Promise<boolean> {
  const groups = await listContext(projectPath);
  return groups.some(g => g.files.some(f => f.absolutePath === absolutePath));
}

export async function readContextFile(projectPath: string, absolutePath: string): Promise<{ ok: boolean; content?: string; error?: string }> {
  if (!await isAllowed(projectPath, absolutePath)) return { ok: false, error: 'not-a-context-file' };
  try { return { ok: true, content: await fs.promises.readFile(absolutePath, 'utf8') }; }
  catch (e: any) { return { ok: false, error: String(e?.message ?? e) }; }
}

export async function writeContextFile(projectPath: string, absolutePath: string, content: string): Promise<{ ok: boolean; error?: string }> {
  if (!await isAllowed(projectPath, absolutePath)) return { ok: false, error: 'not-a-context-file' };
  try { await fs.promises.writeFile(absolutePath, content, 'utf8'); return { ok: true }; }
  catch (e: any) { return { ok: false, error: String(e?.message ?? e) }; }
}
```

- [ ] **Step 3: Typecheck**

Run: `cd desktop && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add desktop/src/main/project-repo.ts desktop/src/main/project-context.ts
git commit -m "feat(project-view): repo-info + context read/write IO shells"
```

---

### Task 1.6: Register handlers + preload + remote-shim

**Files:**
- Modify: `src/main/ipc-handlers.ts` (near the other `ARTIFACT_IPC` handlers, ~line 2100)
- Modify: `src/main/preload.ts` (add a `project` namespace after the `artifacts` block, ~line 884)
- Modify: `src/renderer/remote-shim.ts` (add a `project` namespace + invoke cases mirroring the `artifacts` block, ~line 1010)

- [ ] **Step 1: Register main handlers**

In `src/main/ipc-handlers.ts`, add near the artifact handlers:
```ts
import { PROJECT_IPC } from './project/ipc-channels';
import { listProjectConversations, projectConversationHistory } from './project-conversations';
import { getRepoInfo } from './project-repo';
import { listContext, readContextFile, writeContextFile } from './project-context';

ipcMain.handle(PROJECT_IPC.LIST_CONVERSATIONS, async (_e, projectPath: string) => {
  return { ok: true, conversations: await listProjectConversations(projectPath) };
});
ipcMain.handle(PROJECT_IPC.CONVERSATION_HISTORY, async (_e, projectPath: string, sessionId: string, count: number, all: boolean) => {
  return { ok: true, messages: await projectConversationHistory(projectPath, sessionId, count ?? 20, !!all) };
});
ipcMain.handle(PROJECT_IPC.REPO_INFO, async (_e, projectPath: string) => {
  return { ok: true, ...(await getRepoInfo(projectPath)) };
});
ipcMain.handle(PROJECT_IPC.LIST_CONTEXT, async (_e, projectPath: string) => {
  return { ok: true, groups: await listContext(projectPath) };
});
ipcMain.handle(PROJECT_IPC.READ_CONTEXT_FILE, async (_e, projectPath: string, absolutePath: string) => {
  return readContextFile(projectPath, absolutePath);
});
ipcMain.handle(PROJECT_IPC.WRITE_CONTEXT_FILE, async (_e, projectPath: string, absolutePath: string, content: string) => {
  return writeContextFile(projectPath, absolutePath, content);
});
```

- [ ] **Step 2: Add the preload `project` namespace**

In `src/main/preload.ts`, after the `artifacts: { … }` block (before the closing `})` at ~line 885):
```ts
  project: {
    listConversations: (projectPath: string) =>
      ipcRenderer.invoke('project:list-conversations', projectPath),
    conversationHistory: (projectPath: string, sessionId: string, count: number, all: boolean) =>
      ipcRenderer.invoke('project:conversation-history', projectPath, sessionId, count, all),
    repoInfo: (projectPath: string) =>
      ipcRenderer.invoke('project:repo-info', projectPath),
    listContext: (projectPath: string) =>
      ipcRenderer.invoke('project:list-context', projectPath),
    readContextFile: (projectPath: string, absolutePath: string) =>
      ipcRenderer.invoke('project:read-context-file', projectPath, absolutePath),
    writeContextFile: (projectPath: string, absolutePath: string, content: string) =>
      ipcRenderer.invoke('project:write-context-file', projectPath, absolutePath, content),
  },
```

- [ ] **Step 3: Add the remote-shim `project` namespace**

In `src/renderer/remote-shim.ts`, mirror the `artifacts` shape with the same method names, each calling `invoke('project:…', { … })`. Add invoke cases for each of the six `project:*` channels (the shim's `invoke` switch must carry the literal strings so the parity test sees them). Match the existing artifact-shim style:
```ts
    project: {
      listConversations: (projectPath: string) =>
        invoke('project:list-conversations', { projectPath }),
      conversationHistory: (projectPath: string, sessionId: string, count: number, all: boolean) =>
        invoke('project:conversation-history', { projectPath, sessionId, count, all }),
      repoInfo: (projectPath: string) =>
        invoke('project:repo-info', { projectPath }),
      listContext: (projectPath: string) =>
        invoke('project:list-context', { projectPath }),
      readContextFile: (projectPath: string, absolutePath: string) =>
        invoke('project:read-context-file', { projectPath, absolutePath }),
      writeContextFile: (projectPath: string, absolutePath: string, content: string) =>
        invoke('project:write-context-file', { projectPath, absolutePath, content }),
    },
```
(Android returns `{ok:false}` for these in v1, so the shim values are only exercised on remote-browser-of-desktop, which proxies to the desktop handlers — fine.)

- [ ] **Step 4: Typecheck**

Run: `cd desktop && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add desktop/src/main/ipc-handlers.ts desktop/src/main/preload.ts desktop/src/renderer/remote-shim.ts
git commit -m "feat(project-view): wire project:* handlers + preload + remote-shim"
```

---

### Task 1.7: IPC parity test + Android stubs

**Files:**
- Modify: `tests/ipc-channels.test.ts`
- Modify: `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`

- [ ] **Step 1: Add the parity describe**

Append to `tests/ipc-channels.test.ts`:
```ts
// Regression net for the project:* IPC channels (Project View redesign).
// Desktop is authoritative in v1; SessionService.kt carries stub cases so the
// type strings stay in parity (handlers return not-implemented-on-mobile).
describe('project:* channel parity', () => {
  const NEW_TYPES = [
    'project:list-conversations',
    'project:conversation-history',
    'project:repo-info',
    'project:list-context',
    'project:read-context-file',
    'project:write-context-file',
  ];
  it('declared in preload.ts', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'preload.ts'), 'utf8');
    for (const t of NEW_TYPES) expect(src).toContain(`'${t}'`);
  });
  it('referenced in remote-shim.ts', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'remote-shim.ts'), 'utf8');
    for (const t of NEW_TYPES) expect(src).toContain(`'${t}'`);
  });
  it('registered in ipc-handlers.ts', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'ipc-handlers.ts'), 'utf8');
    for (const t of NEW_TYPES) expect(src).toContain(`'${t}'`);
  });
  it('stubbed in SessionService.kt (Android)', () => {
    const kt = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'src', 'main', 'kotlin', 'com', 'youcoded', 'app', 'runtime', 'SessionService.kt'), 'utf8');
    for (const t of NEW_TYPES) expect(kt).toContain(`"${t}"`);
  });
});
```

- [ ] **Step 2: Run it to confirm the Android assertion fails**

Run: `cd desktop && npx vitest run tests/ipc-channels.test.ts -t 'project:\*'`
Expected: 3 pass, the SessionService.kt assertion FAILS (strings not in Kotlin yet).

- [ ] **Step 3: Add Android stub cases**

In `SessionService.kt#handleBridgeMessage()`, add six `when` cases alongside the existing artifact stubs. Match the existing not-implemented stub style:
```kotlin
"project:list-conversations",
"project:conversation-history",
"project:repo-info",
"project:list-context",
"project:read-context-file",
"project:write-context-file" -> {
    // Project View hub is desktop-only in v1 (see docs/superpowers/specs/
    // 2026-06-14-project-view-redesign-design.md). Reply not-implemented so the
    // shared React UI can degrade to an "available on desktop" state.
    msg.id?.let { bridgeServer.respond(ws, msg.type, it, JSONObject().put("ok", false).put("error", "not-implemented-on-mobile")) }
}
```

- [ ] **Step 4: Re-run the parity test**

Run: `cd desktop && npx vitest run tests/ipc-channels.test.ts -t 'project:\*'`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**
```bash
git add desktop/tests/ipc-channels.test.ts youcoded.wt/artifact-viewer/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt
git commit -m "test(project-view): project:* IPC parity + Android stubs"
```

---

## Phase 2 — Renderer shell, hero, switcher

> **Visual tasks (2.x–4.x):** the prototype `2026-06-14-project-view-redesign.html` is the visual source of truth. Build each component to match its prototype section using the app's real theme tokens and `.layer-surface` (NOT the CDN Tailwind in the mock). Design-language rules: monochrome palette, accent once per view, uppercase `tracking-wider text-[10px] text-fg-muted` micro-labels, outline-not-fill selection, radius scale (surfaces `rounded-xl`, mid `rounded-lg`, controls `rounded-md`, chips `rounded-full`), `font-mono` only for paths/hex. Verify each in `bash scripts/run-dev.sh` (dev window, port 5223) — never the live app.

### Task 2.1: Overlay shell + tab routing + ArtifactsTab extraction

**Files:**
- Create: `src/renderer/components/project-view/ProjectView.tsx`
- Create: `src/renderer/components/project-view/tabs/ArtifactsTab.tsx`
- Delete: `src/renderer/components/ProjectView.tsx`
- Modify: `src/renderer/App.tsx:56` (import path), `App.tsx:2590` (props), `App.tsx` (pass `onNewConversation`/`onResumeConversation`)

- [ ] **Step 1: Extract ArtifactsTab**

Move the artifact grid + toolbar (search, Hide-code-&-configs, Show-deleted, `checkExistence` orphan logic, the `filtered`/`deletedCount` memos, the card grid) out of the old `ProjectView.tsx` into `tabs/ArtifactsTab.tsx` as `function ArtifactsTab({ project }: { project: CentralIndexProject })`. Keep `PV_SESSION = 'project-view'` and the `ACTIVE_ARTIFACT_SET` dispatch, but on card click open the **centered overlay** (Task 2.4) instead of the side pane. Restyle cards to `.layer-surface` and replace the `✕ deleted` glyph badge + any status glyph with a **word** label (`deleted`). Preserve the fixed `h-44` card height + `shrink-0` children (PITFALLS: cards collapse otherwise).

- [ ] **Step 2: Write the new ProjectView shell**

`project-view/ProjectView.tsx` responsibilities: the `fixed inset-0 bg-canvas z-[8000]` overlay (unchanged mount/z), the "Projects" header with global search + Esc·Close, the `ProjectHero` mount, the segmented control (`Artifacts | Conversations | Context`, default `artifacts`), and routing to the active tab. Owns local state: `activeProject`, `tab`, `switcherOpen`, plus the existing projects-index load effect. Accepts props:
```ts
interface ProjectViewProps {
  onNewConversation: (cwd: string) => void;
  onResumeConversation: (sessionId: string, projectSlug: string, projectPath: string) => void;
}
```
Keep the Rules-of-Hooks ordering note from the old file (hooks before the `projectViewOpen` early return).

- [ ] **Step 3: Thread props from App.tsx**

`App.tsx:56`: change import to `./components/project-view/ProjectView`.
`App.tsx:2590`: 
```tsx
<ProjectView
  onNewConversation={(cwd) => { dispatch({ type: 'PROJECT_VIEW_CLOSED' }); createSession(cwd, false); }}
  onResumeConversation={(sid, slug, path) => { dispatch({ type: 'PROJECT_VIEW_CLOSED' }); handleResumeSession(sid, slug, path); }}
/>
```
(`createSession` is defined at `App.tsx:1728`; `handleResumeSession` at `App.tsx:1745`. `dispatch` here is the artifact dispatch already in scope for `PROJECT_VIEW_CLOSED`.)

- [ ] **Step 4: Typecheck + dev verify**

Run: `cd desktop && npx tsc --noEmit` → PASS.
Run `bash scripts/run-dev.sh`; open Projects; confirm the overlay renders, the Artifacts tab shows the grid, switching tabs works (Conversations/Context can be empty placeholders for now), and clicking a card opens content. Close the dev server when done.

- [ ] **Step 5: Commit**
```bash
git add -A desktop/src/renderer/components/project-view desktop/src/renderer/App.tsx
git rm desktop/src/renderer/components/ProjectView.tsx
git commit -m "feat(project-view): overlay shell + tab routing + ArtifactsTab extraction"
```

---

### Task 2.2: ProjectHero (name switcher trigger, repo outlink, stats, New Conversation)

**Files:**
- Create: `src/renderer/components/project-view/ProjectHero.tsx`

- [ ] **Step 1: Build the hero**

`function ProjectHero({ project, stats, repo, onOpenSwitcher, onNewConversation })`. Render a `.layer-surface p-5` with: eyebrow `PROJECT` (uppercase micro-label); the project **name** as a button (`onClick={onOpenSwitcher}`) with a `▾` chevron — **no truncation** (`whitespace-nowrap`, allow wrap, never `truncate`); the filesystem path in `font-mono text-fg-muted`; when `repo?.webUrl`, the `owner/name` slug inline with a git glyph; a stat row `N artifacts · N conversations · N context files · active <when>`; and right-aligned actions: an **Open repo ↗** outlink button (only when `repo?.webUrl`, `onClick={() => window.claude.shell.openExternal(repo.webUrl)}`) and a primary **New Conversation** button (`onClick={() => onNewConversation(project.path)}`). Build to the prototype hero. Props:
```ts
interface HeroStats { artifacts: number; conversations: number; contextFiles: number; activeLabel: string }
interface HeroRepo { webUrl?: string; owner?: string; name?: string }
```

- [ ] **Step 2: Wire stats + repo in ProjectView**

In `ProjectView`, load on `activeProject` change: artifact count (reuse the live filtered count, NOT `stats.artifactCount`), `window.claude.project.listConversations(path)` length, `window.claude.project.listContext(path)` group-size sum, and `window.claude.project.repoInfo(path)`. Compute `activeLabel` from the most-recent conversation `lastModified` (relative time; reuse the app's existing relative-time helper if one exists, else `Intl.RelativeTimeFormat`). Pass into `ProjectHero`.

- [ ] **Step 3: Dev verify**

`bash scripts/run-dev.sh`: hero shows name + path; on a project with a GitHub remote the `owner/name` + **Open repo** appear and the outlink opens the browser; **New Conversation** closes Project View and starts a session in the project folder. Stats are non-zero where applicable. Close dev server.

- [ ] **Step 4: Commit**
```bash
git add desktop/src/renderer/components/project-view/ProjectHero.tsx desktop/src/renderer/components/project-view/ProjectView.tsx
git commit -m "feat(project-view): hero with repo outlink, stats, New Conversation"
```

---

### Task 2.3: ProjectSwitcher (command palette)

**Files:**
- Create: `src/renderer/components/project-view/ProjectSwitcher.tsx`

- [ ] **Step 1: Build the palette**

`function ProjectSwitcher({ projects, activeId, onSelect, onClose, onAddProject })`. Render `<Scrim layer={2} onClick={onClose} />` + a centered `<OverlayPanel layer={2}>` (use `components/overlays/Overlay.tsx`; center via `fixed left-1/2 top-[15%] -translate-x-1/2 w-[min(640px,92vw)]`). Contents: a search `<input>` ("Jump to project…", autofocus), an uppercase `RECENT` micro-label, and a list of project rows (avatar initial + name + repo glyph when present + `font-mono` path + `files · chats` hint + active check). Filter rows by a case-insensitive substring match on `name` + `path`. Keyboard: `↑/↓` move a `highlightIndex`, `Enter` selects the highlighted row (`onSelect(project)`), `Esc` calls `onClose`. Footer: an "Add a project" row (`onClick={onAddProject}`). Build to the prototype `switcherPaletteEl`.

- [ ] **Step 2: Wire into ProjectView**

Render `<ProjectSwitcher>` when `switcherOpen`. `onSelect` sets `activeProject` + closes. `onAddProject`: reuse the existing folder picker (`window.claude.dialog.openFolder?.()` if present, else `openFile`) then re-list the projects index (a project materializes once a session runs there — for v1 the picker can simply set the chosen path as a transient active project or no-op with a tooltip "Start a session in a folder to add it"; pick the no-op+tooltip to avoid inventing index rows). Esc handled inside the palette.

- [ ] **Step 3: Dev verify**

`bash scripts/run-dev.sh`: clicking the hero name opens the centered palette; typing filters; arrow keys + Enter switch projects; Esc closes; long project names are NOT truncated in the hero after switching. Close dev server.

- [ ] **Step 4: Commit**
```bash
git add desktop/src/renderer/components/project-view/ProjectSwitcher.tsx desktop/src/renderer/components/project-view/ProjectView.tsx
git commit -m "feat(project-view): command-palette project switcher"
```

---

### Task 2.4: Shared centered detail overlay

**Files:**
- Create: `src/renderer/components/project-view/ProjectDetailOverlay.tsx`

- [ ] **Step 1: Build the host**

`function ProjectDetailOverlay({ onClose, children, title })`. `<Scrim layer={2} onClick={onClose} />` + `<OverlayPanel layer={2} className="fixed inset-2 sm:inset-8 md:inset-16 flex flex-col">` with a thin header (title + Esc/close) and a scrollable body slot. This is the shared host for: the artifact viewer (`ActiveArtifactView`), the conversation preview, and the context editor. ESC closes via `useEscClose` (follow the existing overlay ESC pattern; see `docs/PITFALLS.md → Keyboard Routing`).

- [ ] **Step 2: Use it from ArtifactsTab**

In `ArtifactsTab`, when an artifact is selected, render `<ProjectDetailOverlay title={artifact.path} onClose={…}>` wrapping `ActiveArtifactView` with the existing props (`artifact, content, projectRoot=project.path, projectId=project.id, projectName=project.name, sessionId='project-view', onContentChange`). Load content via `window.claude.artifacts.get(project.path, artifact.id)` (same as the old detail pane).

- [ ] **Step 3: Dev verify**

`bash scripts/run-dev.sh`: clicking an artifact opens it in a big centered overlay (not a side pane); editing md/txt still works; Esc/close returns to the grid. Close dev server.

- [ ] **Step 4: Commit**
```bash
git add desktop/src/renderer/components/project-view/ProjectDetailOverlay.tsx desktop/src/renderer/components/project-view/tabs/ArtifactsTab.tsx
git commit -m "feat(project-view): shared centered detail overlay + artifact viewing"
```

---

## Phase 3 — Conversations tab

### Task 3.1: ConversationsTab list

**Files:**
- Create: `src/renderer/components/project-view/tabs/ConversationsTab.tsx`

- [ ] **Step 1: Build the list**

`function ConversationsTab({ project, onOpenPreview })`. On mount/project change, `window.claude.project.listConversations(project.path)` → `PastSession[]`. Render `.layer-surface` rows: name (topic), relative time from `lastModified`, a size hint. Empty state: "No conversations in this project yet." Clicking a row calls `onOpenPreview(session)`. Build to the prototype `convRow`. No glyphs.

- [ ] **Step 2: Route from ProjectView**

Render `<ConversationsTab>` when `tab === 'conversations'`. Hold `previewSession` state; pass `onOpenPreview={setPreviewSession}`.

- [ ] **Step 3: Dev verify**

`bash scripts/run-dev.sh`: Conversations tab lists this project's sessions (verify against `~/.claude/projects/<slug>/`), newest first. Close dev server.

- [ ] **Step 4: Commit**
```bash
git add desktop/src/renderer/components/project-view/tabs/ConversationsTab.tsx desktop/src/renderer/components/project-view/ProjectView.tsx
git commit -m "feat(project-view): conversations tab list"
```

---

### Task 3.2: ConversationPreview (read-only) + resume

**Files:**
- Create: `src/renderer/components/project-view/ConversationPreview.tsx`

- [ ] **Step 1: Build the preview**

`function ConversationPreview({ project, session, onClose, onResume })`. Render inside `ProjectDetailOverlay`. On open, `window.claude.project.conversationHistory(project.path, session.sessionId, 20, false)` → `HistoryMessage[]`; render user/assistant bubbles read-only (reuse existing bubble styling or a simple role-labelled block — no Claude launch). Header actions: **Resume in Claude** (`onResume(session)`) and **Open full transcript** (re-fetch with `(…, 0, true)` and re-render). Build to the prototype transcript-preview overlay.

- [ ] **Step 2: Wire resume**

In `ProjectView`, `onResume` calls the `onResumeConversation(session.sessionId, session.projectSlug, session.projectPath)` prop (threaded from App in Task 2.1), which resumes and closes Project View.

- [ ] **Step 3: Dev verify**

`bash scripts/run-dev.sh`: clicking a conversation shows its message history with no new Claude process spawned (confirm no new PTY in Task Manager); "Open full transcript" loads the rest; "Resume in Claude" boots the resumed session. Close dev server.

- [ ] **Step 4: Commit**
```bash
git add desktop/src/renderer/components/project-view/ConversationPreview.tsx desktop/src/renderer/components/project-view/ProjectView.tsx
git commit -m "feat(project-view): read-only conversation preview + resume"
```

---

## Phase 4 — Context tab (teaching layer)

### Task 4.1: ContextTab grouped list + load badges

**Files:**
- Create: `src/renderer/components/project-view/tabs/ContextTab.tsx`

- [ ] **Step 1: Build the grouped list**

`function ContextTab({ project, onEditFile, onOpenInfo })`. On mount, `window.claude.project.listContext(project.path)` → `ContextGroup[]`. Render three groups with headers + descriptions (no trailing periods): This project — "May be loaded for conversations in this project"; Global — "Loaded before every conversation on this device"; Memory — "Recalled when relevant to a conversation". Each group header has an `(i)` button → `onOpenInfo(scope)`. Each file row shows label, `font-mono` path, and a **plain-text** load badge mapped from `timing`:
```ts
const TIMING_LABEL: Record<LoadTiming, string> = {
  'always': 'Always',
  'always-everywhere': 'Always · everywhere',
  'conditional': '', // computed below
  'on-recall': 'On recall',
  'index': 'Index',
};
// for conditional: `When editing ${file.glob}`
```
Clicking a row calls `onEditFile(file)`. **No `●◐○` anywhere.** Build to the prototype `ctxRow`/`grp`/`loadPill`.

- [ ] **Step 2: Route from ProjectView**

Render `<ContextTab>` when `tab === 'context'`. Hold `editingContext` + `infoScope` state for Tasks 4.3/4.4.

- [ ] **Step 3: Dev verify**

`bash scripts/run-dev.sh` against a project with `CLAUDE.md`, `.claude/rules/*`, and memory: each file appears under the right group with the right badge (a globbed rule shows "When editing app/**"; MEMORY.md shows "Index"; notes show "On recall"; global CLAUDE.md shows "Always · everywhere"). Close dev server.

- [ ] **Step 4: Commit**
```bash
git add desktop/src/renderer/components/project-view/tabs/ContextTab.tsx desktop/src/renderer/components/project-view/ProjectView.tsx
git commit -m "feat(project-view): context tab grouped list + plain-text load badges"
```

---

### Task 4.2: Dismiss-forever intro banner

**Files:**
- Create: `src/renderer/components/project-view/ContextIntroBanner.tsx`

- [ ] **Step 1: Build the banner**

`function ContextIntroBanner()`. Reads `localStorage.getItem('pv-context-intro-dismissed')`; renders nothing if set. Otherwise a `.layer-surface` explainer (what "context" is, one short paragraph) with a `×` that sets the key and hides it (local `useState` to hide immediately). No re-show affordance. Build to the prototype banner. Render it at the top of `ContextTab` body.

- [ ] **Step 2: Dev verify**

`bash scripts/run-dev.sh`: banner shows first time; `×` dismisses; reopening Project View keeps it dismissed (persisted). Close dev server.

- [ ] **Step 3: Commit**
```bash
git add desktop/src/renderer/components/project-view/ContextIntroBanner.tsx desktop/src/renderer/components/project-view/tabs/ContextTab.tsx
git commit -m "feat(project-view): dismiss-forever context intro banner"
```

---

### Task 4.3: "How context works" popup

**Files:**
- Create: `src/renderer/components/project-view/HowContextWorksPopup.tsx`

- [ ] **Step 1: Build the popup**

`function HowContextWorksPopup({ initialTab, onClose })`. `<Scrim layer={2}>` + centered `<OverlayPanel layer={2}>` with a left nav: Overview, CLAUDE.md, AGENTS.md, Rules, Memory. **Overview**: visual stack broad→specific (Global → This project → Rules → Memory) each with path + load timing, plus a "the more specific one wins" callout. **Each topic page**: icon header + facts strip (Scope · When it loads · Lives at) + What/When sections + a concrete example block (Rules page shows the `globs:` frontmatter; Memory page bakes in the verified behavior — project-scoped under `~/.claude/projects/<slug>/memory/`, agent-decided storage, automatic recall via MEMORY.md loading each conversation). Port the copy verbatim from the prototype's `infoContent`/`overviewContent`. `initialTab` maps the group `(i)` (`project→overview`, `global→overview`, `memory→memory`). Esc/close.

- [ ] **Step 2: Wire `onOpenInfo`**

In `ProjectView`, `onOpenInfo(scope)` sets `infoScope`; render `<HowContextWorksPopup initialTab={…} onClose={() => setInfoScope(null)}>`.

- [ ] **Step 3: Dev verify**

`bash scripts/run-dev.sh`: each group `(i)` opens the popup to the right tab; all nav tabs render (no missing-icon crash — every referenced icon must exist in the icon set); copy reads correctly. Close dev server.

- [ ] **Step 4: Commit**
```bash
git add desktop/src/renderer/components/project-view/HowContextWorksPopup.tsx desktop/src/renderer/components/project-view/ProjectView.tsx
git commit -m "feat(project-view): How context works teaching popup"
```

---

### Task 4.4: Context editor overlay + blast-radius

**Files:**
- Create: `src/renderer/components/project-view/ContextEditorOverlay.tsx`

- [ ] **Step 1: Build the editor**

`function ContextEditorOverlay({ project, file, onClose })`. Render inside `ProjectDetailOverlay`. On open, `window.claude.project.readContextFile(project.path, file.absolutePath)` → content; show a `<textarea>` (or reuse the markdown editor used by `ActiveArtifactView` if cleanly extractable; a plain monospace textarea is acceptable for v1) plus Reveal (`window.claude.shell.showItemInFolder(file.absolutePath)`) and Copy-path. **Blast-radius banner** (always visible): `file.blastRadius === 'global'` → amber banner ("affects every project on this device"); else neutral ("changes how Claude behaves across every session in this project"). **Save:** for `blastRadius === 'global'`, first show a confirm step ("This affects every project on this device. Save anyway?") before calling `writeContextFile`; for project files, save directly. `window.claude.project.writeContextFile(project.path, file.absolutePath, content)`; on `{ok:false}` surface the error inline; on success close. Build to the prototype editing overlay.

- [ ] **Step 2: Wire `onEditFile`**

In `ProjectView`, `onEditFile(file)` sets `editingContext`; render `<ContextEditorOverlay file={editingContext} … onClose={() => setEditingContext(null)}>`.

- [ ] **Step 3: Dev verify (use a throwaway project, NEVER the live app)**

`bash scripts/run-dev.sh`: open a project rule, edit, Save — file changes on disk; open a project's `CLAUDE.md` (neutral banner, saves directly); open the global `~/.claude/CLAUDE.md` (amber banner + confirm-on-save). Edit a memory note. Verify Reveal/Copy-path. Close dev server. (Dev shares `~/.claude/` with the built app — edit a test project's files, not anything load-bearing.)

- [ ] **Step 4: Commit**
```bash
git add desktop/src/renderer/components/project-view/ContextEditorOverlay.tsx desktop/src/renderer/components/project-view/ProjectView.tsx
git commit -m "feat(project-view): context editor with blast-radius warnings"
```

---

## Phase 5 — Cross-cutting cleanups

### Task 5.1: SessionDrawer glyph → word migration

**Files:**
- Modify: `src/renderer/components/SessionDrawer.tsx`

- [ ] **Step 1: Find the glyph usage**

Run: `cd desktop && grep -n "statusInfo\|glyph" src/renderer/components/SessionDrawer.tsx`
Expected: `statusInfo()` returns `{ glyph, word }`; glyph rendered in the row/card.

- [ ] **Step 2: Migrate to the word form**

Replace every render of `statusInfo(...).glyph` with the `word` form (`created`/`edited`/`read`/`deleted`), styled as a small uppercase micro-label or plain text. If `statusInfo` is now only used for its `word`, simplify the return to a string. Add a `// WHY: status shown as a word, not a ●◐○ glyph (user-disliked, see dislikes-status-glyphs memory)` comment. Confirm no other component imports the `glyph` field.

- [ ] **Step 3: Typecheck + dev verify**

Run: `cd desktop && npx tsc --noEmit` → PASS.
`bash scripts/run-dev.sh`: open the Session Drawer in a session with artifacts; statuses read as words, no ●◐○. Close dev server.

- [ ] **Step 4: Commit**
```bash
git add desktop/src/renderer/components/SessionDrawer.tsx
git commit -m "refactor(artifacts): SessionDrawer status as words, drop status glyphs"
```

---

### Task 5.2: Full test sweep + typecheck + build

**Files:** none (verification gate)

- [ ] **Step 1: Run the artifact + project test suites**

Run: `cd desktop && npx vitest run tests/project-repo-url.test.ts tests/project-context-discovery.test.ts tests/project-conversations.test.ts tests/ipc-channels.test.ts`
Expected: all PASS (project:* Android assertion green after Task 1.7).

- [ ] **Step 2: Full typecheck + production build**

Run: `cd desktop && npx tsc --noEmit && npm run build`
Expected: PASS (no type errors, renderer builds).

- [ ] **Step 3: Commit (if any incidental fixes were needed)**
```bash
git add -A desktop
git commit -m "test(project-view): green test sweep + build" --allow-empty
```

---

### Task 5.3: Docs — PITFALLS + cc-dependencies

**Files:**
- Modify: `C:/Users/desti/youcoded-dev/docs/PITFALLS.md` (workspace, NOT the worktree)
- Modify: `youcoded.wt/artifact-viewer/docs/cc-dependencies.md`

- [ ] **Step 1: PITFALLS → Artifact Viewer**

Add bullets: (a) Project-View detail moved from a 360px side pane to the shared centered `ProjectDetailOverlay`; (b) `project:*` IPC are desktop-only in v1 — Android returns `not-implemented-on-mobile` and the renderer degrades; (c) `project:read-context-file`/`write-context-file` are **allow-listed** to the discovered context set — don't add arbitrary-path reads; (d) context load-timing badges are plain words (no ●◐○), consistent with the SessionDrawer migration.

- [ ] **Step 2: cc-dependencies entry**

Add an entry: "Project View context discovery" — reads CC's project-slug directory layout (`~/.claude/projects/<slug>/`), the `CLAUDE.md`/`AGENTS.md`/`.claude/rules/*` instruction-file conventions, and `memory/MEMORY.md`. If CC changes the slug encoding, memory layout, or instruction-file discovery, `project-context.ts` + `context-discovery.ts` must follow.

- [ ] **Step 3: Commit both repos**
```bash
# worktree (youcoded)
git -C youcoded.wt/artifact-viewer add docs/cc-dependencies.md
git -C youcoded.wt/artifact-viewer commit -m "docs(cc-dependencies): Project View context discovery coupling"
# workspace (youcoded-dev) — committed separately from sub-repo code per CLAUDE.md
git add docs/PITFALLS.md
git commit -m "docs(PITFALLS): Project View redesign invariants"
```

---

## Self-review checklist (completed during planning)

- **Spec coverage:** IA/hero/switcher (2.2/2.3), Artifacts centered overlay (2.4), Conversations + preview/resume (3.1/3.2), Context discovery + badges + intro + popup + editor/blast-radius (1.3–1.5, 4.1–4.4), greenfield IPC (1.1–1.7), glyph migration (5.1), Android stubs (1.7), docs (5.3). Decisions §8 row-by-row: preview depth 20 (3.2), reuse resume (2.1/3.2), word card status (2.1), allow-list I/O (1.5), desktop-only stubs (1.7), GitHub-only outlink (1.2/2.2).
- **Type consistency:** `ContextFile`/`ContextGroup`/`LoadTiming`/`RECOGNIZED_INSTRUCTION_FILES` defined in 1.1, consumed identically in 1.3/1.5/4.1. `PROJECT_IPC` strings identical across 1.1/1.6/1.7. `listProjectConversations`/`projectConversationHistory` names consistent 1.4↔1.6. `window.claude.project.*` method names identical in preload (1.6) and renderer consumers (2.2/3.1/3.2/4.1/4.4).
- **No placeholders:** logic tasks carry full TDD code; visual tasks carry real props/IPC contracts + prototype references (the prototype is the approved visual source of truth) + dev-server acceptance.
