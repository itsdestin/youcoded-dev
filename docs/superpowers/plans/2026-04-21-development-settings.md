# Development Settings Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Settings → Other → **Development** entry to YouCoded that lets users report bugs/features (via `gh issue create` or browser fallback), contribute (clone the `youcoded-dev` workspace and register it as a project folder), or open known issues — with a shared "let Claude fix it / build it" path that opens a new session pre-loaded in the cloned workspace.

**Architecture:**
- One settings entry → cascading L2 popup with three options (Report, Contribute, Known Issues).
- New main-process module `dev-tools.ts` houses pure logic (redaction, body assembly, URL prefill, idempotency probe) plus IPC handler implementations for log-tail, summarize, submit, install, and open-session-in.
- Summarizer shells out to `claude -p` rather than calling `api.anthropic.com` directly (avoids cracking open Claude Code's credentials file).
- Cross-platform parity via the shared React UI: every IPC has a Desktop handler in `ipc-handlers.ts` and an Android handler in `SessionService.kt`, with shared logic ported into a Kotlin `DevTools.kt`.

**Tech Stack:** TypeScript / React / Electron (Desktop), Kotlin (Android), Vitest, `gh` CLI, `git`, `bash`, `claude -p`.

**Spec:** `docs/superpowers/specs/2026-04-21-development-settings-design.md`

---

## File Structure

**New files (Desktop):**
- `youcoded/desktop/src/main/dev-tools.ts` — pure logic + handler bodies
- `youcoded/desktop/src/renderer/components/development/DevelopmentPopup.tsx`
- `youcoded/desktop/src/renderer/components/development/BugReportPopup.tsx`
- `youcoded/desktop/src/renderer/components/development/ContributePopup.tsx`
- `youcoded/desktop/tests/dev-redaction.test.ts`
- `youcoded/desktop/tests/dev-issue-body.test.ts`
- `youcoded/desktop/tests/dev-url-prefill.test.ts`
- `youcoded/desktop/tests/dev-idempotency.test.ts`
- `youcoded/desktop/tests/dev-ipc-handlers.test.ts`
- `youcoded/desktop/tests/development-popup.test.tsx`

**Modified files (Desktop):**
- `youcoded/desktop/src/main/preload.ts` — add `IPC.DEV_*` channel constants and `window.claude.dev.*` surface
- `youcoded/desktop/src/main/ipc-handlers.ts` — register six new handlers, all calling `dev-tools.ts`
- `youcoded/desktop/src/main/session-manager.ts` — add `initialInput?: string` to `CreateSessionOpts`
- `youcoded/desktop/src/renderer/remote-shim.ts` — mirror `window.claude.dev.*`
- `youcoded/desktop/src/renderer/components/SettingsPanel.tsx` — add Development row in both Android and Desktop blocks
- `youcoded/desktop/src/renderer/components/InputBar.tsx` — consume `initialInput` from new-session event
- `youcoded/desktop/tests/ipc-channels.test.ts` — assert parity for the six new types

**New files (Android):**
- `youcoded/app/src/main/kotlin/com/youcoded/app/runtime/DevTools.kt`

**Modified files (Android):**
- `youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` — `when` cases for the six new IPC types

**Modified docs:**
- `youcoded-dev/docs/PITFALLS.md` — short entry on dev-tools IPC parity, GitHub label prerequisite, `setup.sh` idempotency assumption

---

## Phase 1 — Worktree setup and shared types

### Task 0: Create a worktree

The workspace's working rules require non-trivial work to happen in a separate git worktree.

**Files:** none (git operation)

- [ ] **Step 1: Create the worktree from `youcoded` master**

```bash
cd youcoded
git fetch origin
git worktree add -b feat/development-settings ../../youcoded-dev/youcoded-worktrees/development-settings origin/master
```

If `youcoded-worktrees/` doesn't exist yet, `git worktree add` will create the leaf path (it does not create parent dirs — `mkdir -p ../../youcoded-dev/youcoded-worktrees` first if needed).

- [ ] **Step 2: Verify the worktree is on the new branch**

Run: `cd ../../youcoded-dev/youcoded-worktrees/development-settings && git status -sb`
Expected: `## feat/development-settings`, clean working tree.

**All subsequent file paths in this plan are relative to that worktree's `youcoded/` directory unless stated otherwise. The `desktop/` and `app/` paths inside it match the source layout used in the spec.**

---

### Task 1: Add shared `DevIssueKind` type

A tiny shared type used by handlers, components, and tests. Define it once.

**Files:**
- Modify: `youcoded/desktop/src/shared/types.ts`

- [ ] **Step 1: Add the type at the bottom of the existing exports**

```typescript
// Discriminator for development-flow IPC payloads.
export type DevIssueKind = 'bug' | 'feature';
```

- [ ] **Step 2: Run typecheck to confirm no breakage**

Run: `cd desktop && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add desktop/src/shared/types.ts
git commit -m "feat(dev): add DevIssueKind shared type"
```

---

## Phase 2 — Pure logic (TDD, Desktop)

The four pure functions in this phase are co-located in `desktop/src/main/dev-tools.ts`. We build the file incrementally, test by test.

### Task 2: Log redaction

**Files:**
- Create: `youcoded/desktop/src/main/dev-tools.ts`
- Test: `youcoded/desktop/tests/dev-redaction.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// desktop/tests/dev-redaction.test.ts
import { describe, it, expect } from 'vitest';
import { redactLog } from '../src/main/dev-tools';

describe('redactLog', () => {
  it('replaces the user home dir with ~', () => {
    expect(redactLog('opened C:\\Users\\alice\\projects\\foo', 'C:\\Users\\alice'))
      .toBe('opened ~\\projects\\foo');
    expect(redactLog('opened /Users/alice/projects/foo', '/Users/alice'))
      .toBe('opened ~/projects/foo');
    expect(redactLog('opened /home/alice/projects/foo', '/home/alice'))
      .toBe('opened ~/projects/foo');
    expect(redactLog('opened /data/data/com.youcoded.app/files/home/x', '/data/data/com.youcoded.app/files/home'))
      .toBe('opened ~/x');
  });

  it('redacts gh tokens (all four prefixes)', () => {
    expect(redactLog('token=ghp_abcdefghij1234567890XYZ', '/h')).toContain('[REDACTED-GH-TOKEN]');
    expect(redactLog('token=gho_abcdefghij1234567890XYZ', '/h')).toContain('[REDACTED-GH-TOKEN]');
    expect(redactLog('token=ghs_abcdefghij1234567890XYZ', '/h')).toContain('[REDACTED-GH-TOKEN]');
    expect(redactLog('token=ghu_abcdefghij1234567890XYZ', '/h')).toContain('[REDACTED-GH-TOKEN]');
  });

  it('redacts Anthropic keys', () => {
    expect(redactLog('Bearer sk-ant-api03-AbCdEf_-12345678901234567890', '/h'))
      .toContain('[REDACTED-ANTHROPIC-KEY]');
  });

  it('handles multiple secrets on one line', () => {
    const input = 'a=ghp_abcdefghij1234567890XYZ b=sk-ant-api03-XYZ12345678901234567890';
    const out = redactLog(input, '/h');
    expect(out).toContain('[REDACTED-GH-TOKEN]');
    expect(out).toContain('[REDACTED-ANTHROPIC-KEY]');
    expect(out).not.toContain('ghp_');
    expect(out).not.toContain('sk-ant');
  });

  it('does not false-positive on a 20-char hex hash', () => {
    const input = 'commit 0123456789abcdef0123456789abcdef';
    expect(redactLog(input, '/h')).toBe(input);
  });

  it('is idempotent', () => {
    const first = redactLog('token=ghp_abcdefghij1234567890XYZ', '/h');
    expect(redactLog(first, '/h')).toBe(first);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd desktop && npx vitest run tests/dev-redaction.test.ts`
Expected: FAIL with "Cannot find module '../src/main/dev-tools'".

- [ ] **Step 3: Write the minimal implementation**

```typescript
// desktop/src/main/dev-tools.ts
// Pure logic + IPC handler bodies for the Settings → Development feature.
// See docs/superpowers/specs/2026-04-21-development-settings-design.md.

const GH_TOKEN_RE = /gh[opsu]_[A-Za-z0-9]{20,}/g;
const ANTHROPIC_KEY_RE = /sk-ant-[A-Za-z0-9_-]{20,}/g;

/**
 * Apply minimal, high-confidence redaction to a log excerpt before it
 * leaves the main process. We deliberately avoid aggressive token-shape
 * scrubbing — false positives erode user trust. The editable preview in
 * the renderer is the real safety net.
 */
export function redactLog(text: string, homeDir: string): string {
  let out = text;
  if (homeDir) {
    // Escape regex metachars so backslashes in Windows paths work.
    const escaped = homeDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped, 'g'), '~');
  }
  out = out.replace(GH_TOKEN_RE, '[REDACTED-GH-TOKEN]');
  out = out.replace(ANTHROPIC_KEY_RE, '[REDACTED-ANTHROPIC-KEY]');
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd desktop && npx vitest run tests/dev-redaction.test.ts`
Expected: PASS, all 6 specs.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/dev-tools.ts desktop/tests/dev-redaction.test.ts
git commit -m "feat(dev): redactLog with home-dir + gh/anthropic-token scrubbing"
```

---

### Task 3: Issue body assembly

**Files:**
- Modify: `youcoded/desktop/src/main/dev-tools.ts`
- Test: `youcoded/desktop/tests/dev-issue-body.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// desktop/tests/dev-issue-body.test.ts
import { describe, it, expect } from 'vitest';
import { buildIssueBody, smartTruncateLog } from '../src/main/dev-tools';

describe('buildIssueBody', () => {
  it('builds a bug body with the log details block', () => {
    const out = buildIssueBody({
      kind: 'bug',
      summary: 'App crashes on startup.',
      description: 'I clicked the icon and nothing happened.',
      log: 'line A\nline B',
      version: '2.3.2',
      platform: 'desktop',
      os: 'win32 10.0',
    });
    expect(out).toContain('App crashes on startup.');
    expect(out).toContain('I clicked the icon and nothing happened.');
    expect(out).toContain('YouCoded v2.3.2 · desktop · win32 10.0');
    expect(out).toContain('<details><summary>desktop.log</summary>');
    expect(out).toContain('line A\nline B');
  });

  it('builds a feature body without the log block', () => {
    const out = buildIssueBody({
      kind: 'feature',
      summary: 'Add dark mode for the input bar.',
      description: 'Currently the input bar stays light even on dark themes.',
      log: 'should not appear',
      version: '2.3.2',
      platform: 'android',
      os: 'Android 14',
    });
    expect(out).toContain('Add dark mode for the input bar.');
    expect(out).not.toContain('<details>');
    expect(out).not.toContain('should not appear');
  });
});

describe('smartTruncateLog', () => {
  it('returns the input unchanged when under the line limit', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n');
    expect(smartTruncateLog(lines, 50)).toBe(lines);
  });

  it('keeps the last N lines and prepends an omission marker', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');
    const out = smartTruncateLog(lines, 50);
    const outLines = out.split('\n');
    expect(outLines[0]).toBe('… (150 earlier lines omitted)');
    expect(outLines.at(-1)).toBe('line 199');
    expect(outLines.length).toBe(51); // marker + 50 kept lines
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd desktop && npx vitest run tests/dev-issue-body.test.ts`
Expected: FAIL with "buildIssueBody is not exported" (or similar).

- [ ] **Step 3: Append the implementation**

```typescript
// Append to desktop/src/main/dev-tools.ts:

import type { DevIssueKind } from '../shared/types';

export interface BuildIssueBodyArgs {
  kind: DevIssueKind;
  summary: string;
  description: string;
  log: string;
  version: string;
  platform: 'desktop' | 'android';
  os: string;
}

/**
 * Assemble the markdown body that ships in the GitHub issue.
 * Bugs include a collapsible log block; features do not.
 * Whatever the caller passes for `log` is what ships — the renderer is
 * responsible for showing the user a preview and letting them edit.
 */
export function buildIssueBody(args: BuildIssueBodyArgs): string {
  const header = [
    args.summary.trim(),
    '',
    '---',
    '**User description:**',
    args.description.trim(),
    '',
    `**Environment:** YouCoded v${args.version} · ${args.platform} · ${args.os}`,
  ].join('\n');

  if (args.kind === 'feature') return header;

  return [
    header,
    '',
    '**Logs (last N lines):**',
    '<details><summary>desktop.log</summary>',
    '',
    '```',
    args.log,
    '```',
    '',
    '</details>',
  ].join('\n');
}

/**
 * Truncate a log to the last N lines, prepending an omission marker.
 * Used in the URL-prefill fallback path where the full log can't fit
 * under the ~8KB GitHub URL cap.
 */
export function smartTruncateLog(text: string, keepLines: number): string {
  const lines = text.split('\n');
  if (lines.length <= keepLines) return text;
  const omitted = lines.length - keepLines;
  return `… (${omitted} earlier lines omitted)\n${lines.slice(-keepLines).join('\n')}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd desktop && npx vitest run tests/dev-issue-body.test.ts`
Expected: PASS, all 4 specs.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/dev-tools.ts desktop/tests/dev-issue-body.test.ts
git commit -m "feat(dev): buildIssueBody + smartTruncateLog"
```

---

### Task 4: URL-prefill construction

**Files:**
- Modify: `youcoded/desktop/src/main/dev-tools.ts`
- Test: `youcoded/desktop/tests/dev-url-prefill.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// desktop/tests/dev-url-prefill.test.ts
import { describe, it, expect } from 'vitest';
import { buildPrefillUrl } from '../src/main/dev-tools';

describe('buildPrefillUrl', () => {
  it('builds a URL with title, body, and label', () => {
    const url = buildPrefillUrl({
      title: 'My title',
      body: 'My body',
      label: 'bug',
    });
    expect(url.startsWith('https://github.com/itsdestin/youcoded/issues/new?')).toBe(true);
    expect(url).toContain('title=My+title'); // encodeURIComponent uses %20, but URLSearchParams uses +
    expect(url).toMatch(/body=My(\+|%20)body/);
    expect(url).toContain('labels=bug');
  });

  it('encodes special chars in the body', () => {
    const url = buildPrefillUrl({
      title: 'Crash & burn',
      body: 'Line 1\nLine 2 "quoted" & ampersand',
      label: 'enhancement',
    });
    expect(url).toContain('labels=enhancement');
    // Decode and verify round-trip.
    const params = new URL(url).searchParams;
    expect(params.get('title')).toBe('Crash & burn');
    expect(params.get('body')).toBe('Line 1\nLine 2 "quoted" & ampersand');
  });

  it('stays under the 8KB URL cap by hard-capping the description', () => {
    const huge = 'x'.repeat(20_000);
    const url = buildPrefillUrl({ title: 'T', body: huge, label: 'bug' });
    expect(url.length).toBeLessThan(8000);
    // The body should have been truncated with a marker.
    expect(decodeURIComponent(new URL(url).searchParams.get('body') || '')).toContain('[truncated]');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd desktop && npx vitest run tests/dev-url-prefill.test.ts`
Expected: FAIL with "buildPrefillUrl is not exported".

- [ ] **Step 3: Append the implementation**

```typescript
// Append to desktop/src/main/dev-tools.ts:

const URL_CAP_BYTES = 7500; // leave headroom under GitHub's ~8KB practical cap
const REPO_ISSUES_BASE = 'https://github.com/itsdestin/youcoded/issues/new';

export interface BuildPrefillUrlArgs {
  title: string;
  body: string;
  label: 'bug' | 'enhancement';
}

/**
 * Construct the GitHub "new issue" URL with prefilled title/body/label.
 * If the encoded URL would exceed our cap, hard-truncate the body and
 * append a `[truncated]` marker so the user can paste a follow-up
 * comment on the issue once they've created it in their browser.
 */
export function buildPrefillUrl(args: BuildPrefillUrlArgs): string {
  const build = (body: string) => {
    const params = new URLSearchParams({
      title: args.title,
      body,
      labels: args.label,
    });
    return `${REPO_ISSUES_BASE}?${params.toString()}`;
  };

  let url = build(args.body);
  if (url.length <= URL_CAP_BYTES) return url;

  // Binary-style shrink: chop the tail until under the cap.
  let body = args.body;
  while (url.length > URL_CAP_BYTES && body.length > 100) {
    body = body.slice(0, Math.floor(body.length * 0.8));
    url = build(`${body}\n\n[truncated]`);
  }
  return url;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd desktop && npx vitest run tests/dev-url-prefill.test.ts`
Expected: PASS, all 3 specs.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/dev-tools.ts desktop/tests/dev-url-prefill.test.ts
git commit -m "feat(dev): buildPrefillUrl with smart truncation"
```

---

### Task 5: Workspace idempotency probe

**Files:**
- Modify: `youcoded/desktop/src/main/dev-tools.ts`
- Test: `youcoded/desktop/tests/dev-idempotency.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// desktop/tests/dev-idempotency.test.ts
import { describe, it, expect } from 'vitest';
import { classifyExistingWorkspace } from '../src/main/dev-tools';

describe('classifyExistingWorkspace', () => {
  it('treats https:// remote as the workspace', () => {
    expect(classifyExistingWorkspace('https://github.com/itsdestin/youcoded-dev'))
      .toBe('workspace');
    expect(classifyExistingWorkspace('https://github.com/itsdestin/youcoded-dev.git'))
      .toBe('workspace');
    expect(classifyExistingWorkspace('https://github.com/itsdestin/youcoded-dev/'))
      .toBe('workspace');
  });

  it('treats git@ remote as the workspace', () => {
    expect(classifyExistingWorkspace('git@github.com:itsdestin/youcoded-dev.git'))
      .toBe('workspace');
  });

  it('treats unrelated remote as wrong-remote', () => {
    expect(classifyExistingWorkspace('https://github.com/someone-else/youcoded-dev'))
      .toBe('wrong-remote');
    expect(classifyExistingWorkspace('https://github.com/itsdestin/some-other-repo'))
      .toBe('wrong-remote');
  });

  it('treats empty string (no remote) as not-git', () => {
    expect(classifyExistingWorkspace('')).toBe('not-git');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd desktop && npx vitest run tests/dev-idempotency.test.ts`
Expected: FAIL with "classifyExistingWorkspace is not exported".

- [ ] **Step 3: Append the implementation**

```typescript
// Append to desktop/src/main/dev-tools.ts:

/**
 * Decide whether an existing directory at the target path is the
 * youcoded-dev workspace, a different git repo we shouldn't touch, or
 * not a git repo at all. Caller already ran `git -C <path> remote
 * get-url origin` and passes the trimmed stdout (or '' on error).
 */
export function classifyExistingWorkspace(
  remoteUrl: string,
): 'workspace' | 'wrong-remote' | 'not-git' {
  if (!remoteUrl.trim()) return 'not-git';
  // Match itsdestin/youcoded-dev across https/git@/with-or-without .git/trailing-slash.
  return /[/:]itsdestin\/youcoded-dev(\.git)?\/?$/.test(remoteUrl.trim())
    ? 'workspace'
    : 'wrong-remote';
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd desktop && npx vitest run tests/dev-idempotency.test.ts`
Expected: PASS, all 4 specs.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/dev-tools.ts desktop/tests/dev-idempotency.test.ts
git commit -m "feat(dev): classifyExistingWorkspace probe"
```

---

## Phase 3 — Desktop IPC handlers

Each handler in this phase is implemented in `dev-tools.ts` (so the logic stays unit-testable) and registered in `ipc-handlers.ts` (a thin wrapper that calls into `dev-tools`). Channel constants live in `preload.ts` per the existing pattern.

### Task 6: `dev:log-tail` IPC

**Files:**
- Modify: `youcoded/desktop/src/main/preload.ts`
- Modify: `youcoded/desktop/src/main/dev-tools.ts`
- Modify: `youcoded/desktop/src/main/ipc-handlers.ts`
- Test: `youcoded/desktop/tests/dev-ipc-handlers.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// desktop/tests/dev-ipc-handlers.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import { readLogTail } from '../src/main/dev-tools';

vi.mock('fs');
vi.mock('os');

describe('readLogTail', () => {
  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue('/home/alice');
  });

  it('returns empty string when log file is missing', async () => {
    vi.mocked(fs.promises.readFile).mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    );
    expect(await readLogTail(200)).toBe('');
  });

  it('redacts home dir and tokens before returning', async () => {
    const raw =
      'opened /home/alice/projects/foo\n' +
      'token=ghp_abcdefghij1234567890XYZ\n';
    vi.mocked(fs.promises.readFile).mockResolvedValue(raw);
    const out = await readLogTail(200);
    expect(out).toContain('~/projects/foo');
    expect(out).toContain('[REDACTED-GH-TOKEN]');
    expect(out).not.toContain('ghp_');
  });

  it('returns only the last N lines', async () => {
    const raw = Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n');
    vi.mocked(fs.promises.readFile).mockResolvedValue(raw);
    const out = await readLogTail(50);
    const lines = out.split('\n');
    expect(lines.length).toBe(50);
    expect(lines.at(-1)).toBe('line 499');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd desktop && npx vitest run tests/dev-ipc-handlers.test.ts`
Expected: FAIL — `readLogTail` not exported.

- [ ] **Step 3: Add `readLogTail` to dev-tools.ts**

```typescript
// Append to desktop/src/main/dev-tools.ts:

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Read the last N lines of ~/.claude/desktop.log, with redaction
 * applied. Returns '' if the log doesn't exist yet (fresh install).
 */
export async function readLogTail(maxLines: number): Promise<string> {
  const home = os.homedir();
  const logPath = path.join(home, '.claude', 'desktop.log');
  let raw: string;
  try {
    raw = await fs.promises.readFile(logPath, 'utf8');
  } catch (err: any) {
    if (err?.code === 'ENOENT') return '';
    throw err;
  }
  const lines = raw.split('\n');
  const tail = lines.slice(-maxLines).join('\n');
  return redactLog(tail, home);
}
```

- [ ] **Step 4: Run to verify the test passes**

Run: `cd desktop && npx vitest run tests/dev-ipc-handlers.test.ts`
Expected: PASS, 3 specs.

- [ ] **Step 5: Add the IPC channel constant in `preload.ts`**

Find the existing channel-constants block (search for `FOLDERS_ADD: 'folders:add'` near line 84) and add immediately after it:

```typescript
DEV_LOG_TAIL: 'dev:log-tail',
DEV_SUMMARIZE_ISSUE: 'dev:summarize-issue',
DEV_SUBMIT_ISSUE: 'dev:submit-issue',
DEV_INSTALL_WORKSPACE: 'dev:install-workspace',
DEV_INSTALL_PROGRESS: 'dev:install-progress',
DEV_OPEN_SESSION_IN: 'dev:open-session-in',
```

Then in the `contextBridge.exposeInMainWorld('claude', { ... })` block, add a new namespace alongside the existing ones:

```typescript
dev: {
  logTail: (maxLines: number) =>
    ipcRenderer.invoke(IPC.DEV_LOG_TAIL, maxLines),
  summarizeIssue: (args: { kind: 'bug' | 'feature'; description: string; log?: string }) =>
    ipcRenderer.invoke(IPC.DEV_SUMMARIZE_ISSUE, args),
  submitIssue: (args: { title: string; body: string; label: 'bug' | 'enhancement' }) =>
    ipcRenderer.invoke(IPC.DEV_SUBMIT_ISSUE, args),
  installWorkspace: () =>
    ipcRenderer.invoke(IPC.DEV_INSTALL_WORKSPACE),
  onInstallProgress: (cb: (line: string) => void) => {
    const listener = (_e: unknown, line: string) => cb(line);
    ipcRenderer.on(IPC.DEV_INSTALL_PROGRESS, listener);
    return () => ipcRenderer.removeListener(IPC.DEV_INSTALL_PROGRESS, listener);
  },
  openSessionIn: (args: { cwd: string; initialInput?: string }) =>
    ipcRenderer.invoke(IPC.DEV_OPEN_SESSION_IN, args),
},
```

- [ ] **Step 6: Register the log-tail handler in `ipc-handlers.ts`**

Add near the end of the file, before any closing brackets of the registration function:

```typescript
import { readLogTail } from './dev-tools';

// Settings → Development feature handlers (see dev-tools.ts).
ipcMain.handle(IPC.DEV_LOG_TAIL, async (_event, maxLines: number) => {
  return readLogTail(typeof maxLines === 'number' ? maxLines : 200);
});
```

(Place the `import` next to the other imports at the top; place the handler next to other handlers in the registration block.)

- [ ] **Step 7: Verify typecheck passes**

Run: `cd desktop && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add desktop/src/main/preload.ts desktop/src/main/ipc-handlers.ts desktop/src/main/dev-tools.ts desktop/tests/dev-ipc-handlers.test.ts
git commit -m "feat(dev): dev:log-tail IPC + readLogTail"
```

---

### Task 7: `dev:summarize-issue` IPC (shells out to `claude -p`)

**Files:**
- Modify: `youcoded/desktop/src/main/dev-tools.ts`
- Modify: `youcoded/desktop/src/main/ipc-handlers.ts`
- Modify: `youcoded/desktop/tests/dev-ipc-handlers.test.ts`

- [ ] **Step 1: Add the failing test (append to existing test file)**

```typescript
// Append to desktop/tests/dev-ipc-handlers.test.ts:

import { execFile } from 'child_process';
import { summarizeIssue } from '../src/main/dev-tools';

vi.mock('child_process');

describe('summarizeIssue', () => {
  it('parses the JSON envelope returned by claude -p', async () => {
    vi.mocked(execFile).mockImplementation(((_cmd: string, _args: string[], _opts: any, cb: any) => {
      const json = JSON.stringify({
        title: 'App crashes on startup',
        summary: 'Clicking the icon does nothing.',
        flagged_strings: ['/Users/alice/secret-project'],
      });
      cb(null, json, '');
      return {} as any;
    }) as any);
    const out = await summarizeIssue({
      kind: 'bug',
      description: 'I clicked the icon and nothing happened.',
      log: 'line A',
    });
    expect(out.title).toBe('App crashes on startup');
    expect(out.summary).toContain('Clicking the icon');
    expect(out.flagged_strings).toEqual(['/Users/alice/secret-project']);
  });

  it('returns a fallback envelope when claude -p errors', async () => {
    vi.mocked(execFile).mockImplementation(((_c: string, _a: string[], _o: any, cb: any) => {
      cb(new Error('not authenticated'), '', '');
      return {} as any;
    }) as any);
    const out = await summarizeIssue({
      kind: 'bug',
      description: 'something',
    });
    expect(out.title).toBe('something'.slice(0, 80));
    expect(out.summary).toBe('something');
    expect(out.flagged_strings).toEqual([]);
  });

  it('omits the log block from the prompt when kind is feature', async () => {
    let capturedArgs: string[] = [];
    vi.mocked(execFile).mockImplementation(((_c: string, args: string[], _o: any, cb: any) => {
      capturedArgs = args;
      cb(null, JSON.stringify({ title: 't', summary: 's', flagged_strings: [] }), '');
      return {} as any;
    }) as any);
    await summarizeIssue({
      kind: 'feature',
      description: 'I want X',
      log: 'should not appear in prompt',
    });
    const promptArg = capturedArgs.find((a) => a.includes('I want X'));
    expect(promptArg).toBeDefined();
    expect(promptArg).not.toContain('should not appear in prompt');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd desktop && npx vitest run tests/dev-ipc-handlers.test.ts -t summarizeIssue`
Expected: FAIL — `summarizeIssue` not exported.

- [ ] **Step 3: Add `summarizeIssue` to `dev-tools.ts`**

```typescript
// Append to desktop/src/main/dev-tools.ts:

import { execFile } from 'child_process';
import type { DevIssueKind } from '../shared/types';

export interface SummarizeArgs {
  kind: DevIssueKind;
  description: string;
  log?: string;
}

export interface SummaryResult {
  title: string;
  summary: string;
  flagged_strings: string[];
}

/**
 * Ask claude -p to produce a structured summary of the user's bug
 * report or feature request. We pass the prompt as the final positional
 * argument and instruct the CLI to emit JSON only. On any failure
 * (CLI missing, not authenticated, JSON parse error) we degrade
 * gracefully to a fallback envelope built from the user's description
 * — submission still works.
 */
export async function summarizeIssue(args: SummarizeArgs): Promise<SummaryResult> {
  const prompt = buildSummarizerPrompt(args);
  try {
    const stdout: string = await new Promise((resolve, reject) => {
      execFile(
        'claude',
        ['-p', prompt],
        { timeout: 30_000, maxBuffer: 1024 * 1024 },
        (err, out) => (err ? reject(err) : resolve(String(out || ''))),
      );
    });
    return parseSummary(stdout, args.description);
  } catch {
    return fallbackSummary(args.description);
  }
}

function buildSummarizerPrompt(args: SummarizeArgs): string {
  const intro =
    args.kind === 'bug'
      ? 'You are summarizing a bug report from a YouCoded user for a GitHub issue.'
      : 'You are summarizing a feature request from a YouCoded user for a GitHub issue.';
  const logBlock =
    args.kind === 'bug' && args.log
      ? `\n\nThe last lines of their app log are:\n\`\`\`\n${args.log}\n\`\`\``
      : '';
  return [
    intro,
    `\n\nThe user wrote:\n«${args.description}»`,
    logBlock,
    '\n\nProduce a JSON object with fields:',
    '  - title: a one-line GitHub-issue title (≤80 chars)',
    '  - summary: a one-paragraph summary that captures the user\'s intent',
    '  - flagged_strings: an array of strings from the log that look sensitive (paths, IDs, possible secrets)',
    '\n\nRespond with JSON only — no prose, no markdown fences.',
  ].join('');
}

function parseSummary(stdout: string, fallbackText: string): SummaryResult {
  // Be lenient: strip ``` fences if the model added them anyway.
  const cleaned = stdout.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      title: String(parsed.title || fallbackText.slice(0, 80)),
      summary: String(parsed.summary || fallbackText),
      flagged_strings: Array.isArray(parsed.flagged_strings)
        ? parsed.flagged_strings.map(String)
        : [],
    };
  } catch {
    return fallbackSummary(fallbackText);
  }
}

function fallbackSummary(description: string): SummaryResult {
  return {
    title: description.slice(0, 80),
    summary: description,
    flagged_strings: [],
  };
}
```

- [ ] **Step 4: Register the IPC handler**

Append to `ipc-handlers.ts` next to the log-tail handler:

```typescript
import { readLogTail, summarizeIssue } from './dev-tools';

ipcMain.handle(IPC.DEV_SUMMARIZE_ISSUE, async (_event, args) => {
  return summarizeIssue(args);
});
```

(If the `import` line was already added in Task 6, just extend the import.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd desktop && npx vitest run tests/dev-ipc-handlers.test.ts -t summarizeIssue`
Expected: PASS, 3 specs.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/main/dev-tools.ts desktop/src/main/ipc-handlers.ts desktop/tests/dev-ipc-handlers.test.ts
git commit -m "feat(dev): dev:summarize-issue via claude -p shell-out"
```

---

### Task 8: `dev:submit-issue` IPC (`gh` primary, URL fallback)

**Files:**
- Modify: `youcoded/desktop/src/main/dev-tools.ts`
- Modify: `youcoded/desktop/src/main/ipc-handlers.ts`
- Modify: `youcoded/desktop/tests/dev-ipc-handlers.test.ts`

- [ ] **Step 1: Add the failing test**

```typescript
// Append to desktop/tests/dev-ipc-handlers.test.ts:

import { submitIssue } from '../src/main/dev-tools';

describe('submitIssue', () => {
  it('returns the issue URL when gh is authed and create succeeds', async () => {
    vi.mocked(execFile).mockImplementation(((cmd: string, args: string[], _o: any, cb: any) => {
      // First call: gh auth status — exit 0
      if (args[0] === 'auth' && args[1] === 'status') {
        cb(null, 'Logged in', '');
      } else if (args[0] === 'issue' && args[1] === 'create') {
        cb(null, 'https://github.com/itsdestin/youcoded/issues/42\n', '');
      }
      return {} as any;
    }) as any);
    const out = await submitIssue({ title: 't', body: 'b', label: 'bug' });
    expect(out.ok).toBe(true);
    expect(out.url).toBe('https://github.com/itsdestin/youcoded/issues/42');
  });

  it('returns a fallback URL when gh auth status fails', async () => {
    vi.mocked(execFile).mockImplementation(((_c: string, args: string[], _o: any, cb: any) => {
      if (args[0] === 'auth' && args[1] === 'status') {
        cb(new Error('not authenticated'), '', 'You are not logged in');
      }
      return {} as any;
    }) as any);
    const out = await submitIssue({ title: 't', body: 'b', label: 'bug' });
    expect(out.ok).toBe(false);
    expect(out.fallbackUrl).toContain('https://github.com/itsdestin/youcoded/issues/new');
    expect(out.fallbackUrl).toContain('labels=bug');
  });

  it('returns a fallback URL when gh issue create fails after auth check', async () => {
    vi.mocked(execFile).mockImplementation(((_c: string, args: string[], _o: any, cb: any) => {
      if (args[0] === 'auth') cb(null, 'Logged in', '');
      else cb(new Error('rate limited'), '', '');
      return {} as any;
    }) as any);
    const out = await submitIssue({ title: 't', body: 'b', label: 'enhancement' });
    expect(out.ok).toBe(false);
    expect(out.fallbackUrl).toContain('labels=enhancement');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd desktop && npx vitest run tests/dev-ipc-handlers.test.ts -t submitIssue`
Expected: FAIL — `submitIssue` not exported.

- [ ] **Step 3: Add `submitIssue` to `dev-tools.ts`**

```typescript
// Append to desktop/src/main/dev-tools.ts:

export interface SubmitArgs {
  title: string;
  body: string;
  label: 'bug' | 'enhancement';
}

export type SubmitResult =
  | { ok: true; url: string }
  | { ok: false; fallbackUrl: string };

/**
 * Submit a GitHub issue via the `gh` CLI when authenticated, otherwise
 * fall back to a prefilled browser URL. The fallback path lets the user
 * review and submit in their browser themselves.
 */
export async function submitIssue(args: SubmitArgs): Promise<SubmitResult> {
  const ghAuthed = await isGhAuthenticated();
  if (!ghAuthed) {
    return { ok: false, fallbackUrl: buildPrefillUrl(args) };
  }

  const tmpFile = path.join(
    os.tmpdir(),
    `youcoded-issue-${Date.now()}-${process.pid}.md`,
  );
  await fs.promises.writeFile(tmpFile, args.body, 'utf8');

  try {
    const stdout: string = await new Promise((resolve, reject) => {
      execFile(
        'gh',
        [
          'issue', 'create',
          '--repo', 'itsdestin/youcoded',
          '--title', args.title,
          '--body-file', tmpFile,
          '--label', args.label,
          '--label', 'youcoded-app:reported',
        ],
        { timeout: 30_000 },
        (err, out) => (err ? reject(err) : resolve(String(out || ''))),
      );
    });
    const url = (stdout.match(/https:\/\/github\.com\/[^\s]+/) || [''])[0].trim();
    if (!url) {
      // gh succeeded but didn't print a URL we can parse — treat as opaque success.
      return { ok: true, url: 'https://github.com/itsdestin/youcoded/issues' };
    }
    return { ok: true, url };
  } catch {
    return { ok: false, fallbackUrl: buildPrefillUrl(args) };
  } finally {
    fs.promises.unlink(tmpFile).catch(() => undefined);
  }
}

async function isGhAuthenticated(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('gh', ['auth', 'status'], { timeout: 5_000 }, (err) => {
      resolve(!err);
    });
  });
}
```

- [ ] **Step 4: Register the IPC handler**

Extend the dev-tools import in `ipc-handlers.ts` and add:

```typescript
import { readLogTail, summarizeIssue, submitIssue } from './dev-tools';

ipcMain.handle(IPC.DEV_SUBMIT_ISSUE, async (_event, args) => {
  return submitIssue(args);
});
```

- [ ] **Step 5: Run the tests**

Run: `cd desktop && npx vitest run tests/dev-ipc-handlers.test.ts -t submitIssue`
Expected: PASS, 3 specs.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/main/dev-tools.ts desktop/src/main/ipc-handlers.ts desktop/tests/dev-ipc-handlers.test.ts
git commit -m "feat(dev): dev:submit-issue with gh primary, URL fallback"
```

---

### Task 9: `dev:install-workspace` and `dev:install-progress`

**Files:**
- Modify: `youcoded/desktop/src/main/dev-tools.ts`
- Modify: `youcoded/desktop/src/main/ipc-handlers.ts`
- Modify: `youcoded/desktop/tests/dev-ipc-handlers.test.ts`

- [ ] **Step 1: Add the concurrency-guard test**

```typescript
// Append to desktop/tests/dev-ipc-handlers.test.ts:

import { installWorkspace, _resetInstallGuard } from '../src/main/dev-tools';

describe('installWorkspace concurrency', () => {
  beforeEach(() => _resetInstallGuard());

  it('rejects a second concurrent call', async () => {
    // First call: leave a long-running clone unresolved.
    vi.mocked(execFile).mockImplementation(((..._args: any[]) => {
      // Never call cb — simulates an in-flight install.
      return {} as any;
    }) as any);

    const first = installWorkspace(() => undefined);
    const second = installWorkspace(() => undefined);
    await expect(second).rejects.toThrow(/already in progress/i);
    // first stays pending; we don't await it
    void first;
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd desktop && npx vitest run tests/dev-ipc-handlers.test.ts -t installWorkspace`
Expected: FAIL — `installWorkspace` not exported.

- [ ] **Step 3: Add `installWorkspace` to `dev-tools.ts`**

```typescript
// Append to desktop/src/main/dev-tools.ts:

import { spawn } from 'child_process';

const WORKSPACE_REPO = 'https://github.com/itsdestin/youcoded-dev';

export interface InstallResult {
  path: string;
  alreadyInstalled: boolean;
}

let installInFlight = false;

/** Test helper — DO NOT call from production code. */
export function _resetInstallGuard(): void {
  installInFlight = false;
}

/**
 * Clone-or-update the youcoded-dev workspace at ~/youcoded-dev, then
 * run setup.sh to fetch all sub-repos. Streams progress lines through
 * the supplied callback (which the IPC layer forwards as
 * `dev:install-progress` events to the renderer).
 *
 * Throws if a clone is already in flight (concurrency guard).
 * Throws with a stable message if the target dir exists with a wrong
 * remote — caller maps the message to UI text.
 */
export async function installWorkspace(
  onProgress: (line: string) => void,
): Promise<InstallResult> {
  if (installInFlight) {
    throw new Error('Install already in progress');
  }
  installInFlight = true;
  try {
    const targetPath = path.join(os.homedir(), 'youcoded-dev');
    const exists = fs.existsSync(targetPath);

    let alreadyInstalled = false;

    if (exists) {
      const remote = await getGitRemote(targetPath).catch(() => '');
      const status = classifyExistingWorkspace(remote);
      if (status === 'wrong-remote' || status === 'not-git') {
        throw new Error(
          `${targetPath} already exists but isn't the YouCoded dev workspace. ` +
            `Move or rename it and try again.`,
        );
      }
      // status === 'workspace' — update path
      alreadyInstalled = true;
      onProgress('Found existing workspace, pulling latest…');
      await runStreamed('git', ['-C', targetPath, 'pull', '--ff-only'], onProgress);
    } else {
      onProgress('Cloning workspace…');
      await runStreamed(
        'git',
        ['clone', '--depth', '50', WORKSPACE_REPO, targetPath],
        onProgress,
      );
    }

    onProgress('Cloning sub-repos (this may take a minute)…');
    await runStreamed('bash', ['setup.sh'], onProgress, { cwd: targetPath });

    return { path: targetPath, alreadyInstalled };
  } finally {
    installInFlight = false;
  }
}

async function getGitRemote(repoPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['-C', repoPath, 'remote', 'get-url', 'origin'],
      { timeout: 5_000 },
      (err, out) => (err ? reject(err) : resolve(String(out || '').trim())),
    );
  });
}

function runStreamed(
  cmd: string,
  args: string[],
  onProgress: (line: string) => void,
  opts: { cwd?: string } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd: opts.cwd, env: process.env });
    proc.stdout?.on('data', (b) => splitLines(b.toString()).forEach(onProgress));
    proc.stderr?.on('data', (b) => splitLines(b.toString()).forEach(onProgress));
    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

function splitLines(s: string): string[] {
  return s.split(/\r?\n/).filter((l) => l.length > 0);
}
```

- [ ] **Step 4: Register the IPC handler with progress forwarding**

Append to `ipc-handlers.ts`:

```typescript
import { readLogTail, summarizeIssue, submitIssue, installWorkspace } from './dev-tools';

ipcMain.handle(IPC.DEV_INSTALL_WORKSPACE, async (event) => {
  const send = (line: string) => {
    event.sender.send(IPC.DEV_INSTALL_PROGRESS, line);
  };
  try {
    const result = await installWorkspace(send);
    // Register the workspace as a known project folder. folders.add
    // is already idempotent (deduped by normalized path).
    try {
      const normalized = path.resolve(result.path);
      const folders = readFolders();
      if (!folders.some((f) => path.resolve(f.path) === normalized)) {
        const entry: SavedFolder = {
          path: normalized,
          nickname: path.basename(normalized),
          addedAt: Date.now(),
        };
        folders.unshift(entry);
        writeFolders(folders);
      }
    } catch (e) {
      log('WARN', 'dev', 'folders.add post-install failed', { error: String(e) });
    }
    return result;
  } catch (e: any) {
    return { error: String(e?.message || e) };
  }
});
```

(The `readFolders` / `writeFolders` / `SavedFolder` / `log` imports already exist higher in the file — reuse them.)

- [ ] **Step 5: Run the test**

Run: `cd desktop && npx vitest run tests/dev-ipc-handlers.test.ts -t installWorkspace`
Expected: PASS, 1 spec.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/main/dev-tools.ts desktop/src/main/ipc-handlers.ts desktop/tests/dev-ipc-handlers.test.ts
git commit -m "feat(dev): dev:install-workspace with progress streaming + folder registration"
```

---

### Task 10: `dev:open-session-in` (extends `session.create` with `initialInput`)

**Files:**
- Modify: `youcoded/desktop/src/main/session-manager.ts`
- Modify: `youcoded/desktop/src/main/ipc-handlers.ts`
- Modify: `youcoded/desktop/src/renderer/components/InputBar.tsx`

- [ ] **Step 1: Add `initialInput?` to `CreateSessionOpts`**

In `session-manager.ts`, edit the existing interface (~line 15):

```typescript
export interface CreateSessionOpts {
  name: string;
  cwd: string;
  skipPermissions: boolean;
  cols?: number;
  rows?: number;
  /** Resume a previous session by its Claude Code session ID */
  resumeSessionId?: string;
  model?: string;
  /** Which CLI backend to launch — defaults to 'claude' */
  provider?: SessionProvider;
  /** Optional text to prefill into the input bar after the session is selected. */
  initialInput?: string;
}
```

In the same file, find where `'session-created'` is emitted (~line 100) and ensure `initialInput` is forwarded along with the session info. The cleanest path: extend `SessionInfo` (look in `src/shared/types.ts`) with an optional `initialInput?: string` and copy it into the info object on creation.

```typescript
// In createSession(), after the existing const info = { ... }:
const info: SessionInfo = {
  id,
  name: opts.name,
  cwd: resolvedCwd,
  createdAt: Date.now(),
  // Carry initialInput through so the renderer can pick it up.
  initialInput: opts.initialInput,
};
```

(Update `SessionInfo` in `shared/types.ts` to include `initialInput?: string`.)

- [ ] **Step 2: Add the `dev:open-session-in` IPC handler**

```typescript
// Append to ipc-handlers.ts:

ipcMain.handle(IPC.DEV_OPEN_SESSION_IN, async (_event, args: { cwd: string; initialInput?: string }) => {
  // Pull defaults so the new session inherits the user's preferred model + skip-permissions.
  const defaults = readDefaults(); // existing helper near the top of the file
  const info = sessionManager.createSession({
    name: 'Development',
    cwd: args.cwd,
    skipPermissions: defaults.skipPermissions,
    model: defaults.model,
    initialInput: args.initialInput,
  });
  return info;
});
```

(`sessionManager` and `readDefaults` are already in scope in this file — search for prior `sessionManager.createSession` calls to confirm the local name.)

- [ ] **Step 3: Wire `initialInput` into `InputBar.tsx`**

In `desktop/src/renderer/components/InputBar.tsx`, find the effect that runs when the active session changes. Add a new effect that reads `session.initialInput` (passed via props or pulled from the session-context store, depending on how InputBar consumes the active session). When non-empty, set the textarea value and clear the field on the session object so it doesn't refire.

Concretely — if InputBar receives `session: SessionInfo` as a prop:

```typescript
useEffect(() => {
  if (session?.initialInput) {
    setInputValue(session.initialInput);
    // Clear so we don't refill on the next render.
    session.initialInput = undefined;
  }
}, [session?.id]);
```

(If InputBar reads via a hook like `useActiveSession()`, do the equivalent there — assignment is fine since the SessionInfo is a local cache; the source of truth stays in the main process.)

- [ ] **Step 4: Manual smoke**

Run: `cd desktop && npm run dev` (or `bash scripts/run-dev.sh` from the workspace root for the dev profile).
- Open dev tools console.
- Run: `await window.claude.dev.openSessionIn({ cwd: process.env.HOME, initialInput: 'hello' })`
- Confirm a new session is selected and the input bar shows `hello`.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/session-manager.ts desktop/src/main/ipc-handlers.ts desktop/src/renderer/components/InputBar.tsx desktop/src/shared/types.ts
git commit -m "feat(dev): dev:open-session-in with initialInput prefill"
```

---

## Phase 4 — Renderer plumbing

### Task 11: Mirror `window.claude.dev.*` in `remote-shim.ts`

Required by the parity invariant (PITFALLS.md → Cross-Platform). Without this, remote browser users get a runtime crash when the Development popup tries to call `window.claude.dev.logTail`.

**Files:**
- Modify: `youcoded/desktop/src/renderer/remote-shim.ts`

- [ ] **Step 1: Add the dev namespace to the shim**

Find the `claude` object construction in `remote-shim.ts` (search for `folders:` near the top of the exposed shape). Add a parallel `dev:` block:

```typescript
dev: {
  logTail: (maxLines: number) =>
    invoke('dev:log-tail', maxLines),
  summarizeIssue: (args: { kind: 'bug' | 'feature'; description: string; log?: string }) =>
    invoke('dev:summarize-issue', args),
  submitIssue: (args: { title: string; body: string; label: 'bug' | 'enhancement' }) =>
    invoke('dev:submit-issue', args),
  installWorkspace: () =>
    invoke('dev:install-workspace'),
  onInstallProgress: (cb: (line: string) => void) => {
    // Server pushes 'dev:install-progress' messages — register a listener
    // that the existing onMessage dispatcher already supports.
    return subscribePush('dev:install-progress', (payload: any) => cb(String(payload)));
  },
  openSessionIn: (args: { cwd: string; initialInput?: string }) =>
    invoke('dev:open-session-in', args),
},
```

(The exact names `invoke` and `subscribePush` should match what's already in the file — adapt to local naming.)

- [ ] **Step 2: Verify typecheck**

Run: `cd desktop && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add desktop/src/renderer/remote-shim.ts
git commit -m "feat(dev): mirror window.claude.dev.* in remote-shim"
```

---

### Task 12: Parity test — assert all six channels exist on both sides

**Files:**
- Modify: `youcoded/desktop/tests/ipc-channels.test.ts`

- [ ] **Step 1: Read the existing parity test to learn its pattern**

Run: `cat desktop/tests/ipc-channels.test.ts`

Note how it parses preload.ts and SessionService.kt (or equivalent) for message types.

- [ ] **Step 2: Add an assertion for the six new types**

Append to the existing test file:

```typescript
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('dev:* channel parity', () => {
  const NEW_TYPES = [
    'dev:log-tail',
    'dev:summarize-issue',
    'dev:submit-issue',
    'dev:install-workspace',
    'dev:install-progress',
    'dev:open-session-in',
  ];

  it('all six dev:* types are declared in preload.ts', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'preload.ts'), 'utf8');
    for (const t of NEW_TYPES) expect(src).toContain(`'${t}'`);
  });

  it('all six dev:* types are referenced in remote-shim.ts', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'remote-shim.ts'), 'utf8');
    for (const t of NEW_TYPES) expect(src).toContain(`'${t}'`);
  });

  it('all six dev:* types are handled by SessionService.kt (Android)', () => {
    const ktPath = path.join(
      __dirname, '..', '..', 'app', 'src', 'main', 'kotlin',
      'com', 'youcoded', 'app', 'runtime', 'SessionService.kt',
    );
    const src = fs.readFileSync(ktPath, 'utf8');
    for (const t of NEW_TYPES) expect(src).toContain(`"${t}"`);
  });
});
```

- [ ] **Step 3: Run — first two specs should pass, third should FAIL**

Run: `cd desktop && npx vitest run tests/ipc-channels.test.ts`
Expected: 2 PASS, 1 FAIL ("'dev:log-tail' not found in SessionService.kt"). The Android-side fix lands in Phase 6 — the failing test is the regression net.

- [ ] **Step 4: Commit (with the failing Android assertion still failing)**

```bash
git add desktop/tests/ipc-channels.test.ts
git commit -m "test(dev): parity assertions for dev:* IPC channels (android side pending)"
```

---

## Phase 5 — UI components

The popup cascade builds bottom-up: shared-style buttons first, then the simplest popup, then the more complex screens.

### Task 13: `DevelopmentPopup` — three-row menu

**Files:**
- Create: `youcoded/desktop/src/renderer/components/development/DevelopmentPopup.tsx`
- Test: `youcoded/desktop/tests/development-popup.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// desktop/tests/development-popup.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DevelopmentPopup } from '../src/renderer/components/development/DevelopmentPopup';

describe('DevelopmentPopup', () => {
  it('renders all three rows', () => {
    render(<DevelopmentPopup open={true} onClose={() => undefined} onOpenBug={() => undefined} onOpenContribute={() => undefined} />);
    expect(screen.getByText(/Report a Bug or Request a Feature/i)).toBeInTheDocument();
    expect(screen.getByText(/Contribute to YouCoded/i)).toBeInTheDocument();
    expect(screen.getByText(/Known Issues and Planned Features/i)).toBeInTheDocument();
  });

  it('opens the GitHub issues URL when Known Issues is clicked', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const onClose = vi.fn();
    render(<DevelopmentPopup open={true} onClose={onClose} onOpenBug={() => undefined} onOpenContribute={() => undefined} />);
    fireEvent.click(screen.getByText(/Known Issues and Planned Features/i));
    expect(openSpy).toHaveBeenCalledWith('https://github.com/itsdestin/youcoded/issues', '_blank');
    expect(onClose).toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('calls onOpenBug when Report row is clicked', () => {
    const onOpenBug = vi.fn();
    render(<DevelopmentPopup open={true} onClose={() => undefined} onOpenBug={onOpenBug} onOpenContribute={() => undefined} />);
    fireEvent.click(screen.getByText(/Report a Bug or Request a Feature/i));
    expect(onOpenBug).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd desktop && npx vitest run tests/development-popup.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

```tsx
// desktop/src/renderer/components/development/DevelopmentPopup.tsx
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenBug: () => void;
  onOpenContribute: () => void;
}

const KNOWN_ISSUES_URL = 'https://github.com/itsdestin/youcoded/issues';

/**
 * L2 popup with three rows: Report, Contribute, Known Issues. Reuses
 * the existing layer-scrim + layer-surface tokens so the popup picks
 * up the active theme automatically.
 */
export function DevelopmentPopup({ open, onClose, onOpenBug, onOpenContribute }: Props) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 layer-scrim" data-layer="2" />
      <div
        className="layer-surface relative p-4 w-[320px] mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[10px] font-medium text-fg-muted tracking-wider uppercase mb-3">Development</h3>
        <div className="space-y-2">
          <Row
            icon="🐞"
            title="Report a Bug or Request a Feature"
            subtitle="Send it to the maintainers"
            onClick={() => { onOpenBug(); }}
          />
          <Row
            icon="🤝"
            title="Contribute to YouCoded"
            subtitle="Set up the dev workspace"
            onClick={() => { onOpenContribute(); }}
          />
          <Row
            icon="📋"
            title="Known Issues and Planned Features"
            subtitle="Browse open issues on GitHub"
            onClick={() => { window.open(KNOWN_ISSUES_URL, '_blank'); onClose(); }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Row({ icon, title, subtitle, onClick }: { icon: string; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-inset/50 hover:bg-inset transition-colors text-left"
    >
      <div className="flex items-center justify-center shrink-0 text-base" style={{ width: 32, height: 20 }}>{icon}</div>
      <div className="flex-1 min-w-0">
        <span className="text-xs text-fg font-medium">{title}</span>
        <p className="text-[10px] text-fg-muted">{subtitle}</p>
      </div>
      <svg className="w-3.5 h-3.5 text-fg-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `cd desktop && npx vitest run tests/development-popup.test.tsx`
Expected: PASS, 3 specs.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer/components/development/DevelopmentPopup.tsx desktop/tests/development-popup.test.tsx
git commit -m "feat(dev): DevelopmentPopup three-row menu"
```

---

### Task 14: `BugReportPopup` — three-screen state machine

This is the largest UI piece. We add it as one component file with three internal screen states. Tests focus on the state machine, not pixel layout.

**Files:**
- Create: `youcoded/desktop/src/renderer/components/development/BugReportPopup.tsx`
- Modify: `youcoded/desktop/tests/development-popup.test.tsx`

- [ ] **Step 1: Add failing tests**

```tsx
// Append to desktop/tests/development-popup.test.tsx:
import { BugReportPopup } from '../src/renderer/components/development/BugReportPopup';

describe('BugReportPopup', () => {
  beforeEach(() => {
    (window as any).claude = {
      dev: {
        logTail: vi.fn().mockResolvedValue(''),
        summarizeIssue: vi.fn().mockResolvedValue({ title: 'T', summary: 'S', flagged_strings: [] }),
        submitIssue: vi.fn().mockResolvedValue({ ok: true, url: 'https://github.com/itsdestin/youcoded/issues/1' }),
        installWorkspace: vi.fn().mockResolvedValue({ path: '/h/youcoded-dev', alreadyInstalled: false }),
        onInstallProgress: vi.fn(() => () => undefined),
        openSessionIn: vi.fn().mockResolvedValue({ id: 's1' }),
      },
    };
  });

  it('disables Continue until description is at least 10 chars', () => {
    render(<BugReportPopup open={true} onClose={() => undefined} />);
    const cont = screen.getByText(/^Continue$/) as HTMLButtonElement;
    expect(cont).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/What's happening/i), { target: { value: 'short' } });
    expect(cont).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/What's happening/i), { target: { value: 'this is long enough' } });
    expect(cont).not.toBeDisabled();
  });

  it('passes the bug label when submitting from Bug toggle', async () => {
    render(<BugReportPopup open={true} onClose={() => undefined} />);
    fireEvent.change(screen.getByPlaceholderText(/What's happening/i), { target: { value: 'a real bug description' } });
    fireEvent.click(screen.getByText(/^Continue$/));
    // Wait for summarize to resolve and Submit button to render.
    await screen.findByText(/Submit as GitHub Issue/i);
    fireEvent.click(screen.getByText(/Submit as GitHub Issue/i));
    await screen.findByText(/Issue created/i);
    expect((window as any).claude.dev.submitIssue).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'bug' }),
    );
  });

  it('passes the enhancement label when Feature toggle is selected', async () => {
    render(<BugReportPopup open={true} onClose={() => undefined} />);
    fireEvent.click(screen.getByText(/^Feature$/));
    fireEvent.change(screen.getByPlaceholderText(/What's happening/i), { target: { value: 'a real feature description' } });
    fireEvent.click(screen.getByText(/^Continue$/));
    await screen.findByText(/Submit as GitHub Issue/i);
    fireEvent.click(screen.getByText(/Submit as GitHub Issue/i));
    await screen.findByText(/Issue created/i);
    expect((window as any).claude.dev.submitIssue).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'enhancement' }),
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd desktop && npx vitest run tests/development-popup.test.tsx -t BugReportPopup`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

```tsx
// desktop/src/renderer/components/development/BugReportPopup.tsx
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Kind = 'bug' | 'feature';
type Screen = 'describe' | 'review' | 'result';

const PROMPT_BUG = (description: string) =>
  `I just filed (or am about to file) a bug against YouCoded. Here's what I described: «${description}». ` +
  `Investigate the codebase in this workspace and propose a fix. Read \`docs/PITFALLS.md\` first, ` +
  `and check both desktop and Android touchpoints if the bug could affect either.`;

const PROMPT_FEATURE = (description: string) =>
  `I want to add a new feature to YouCoded. Here's what I'm asking for: «${description}». ` +
  `Read \`docs/PITFALLS.md\`, then use the brainstorming skill to design it before writing code. ` +
  `Both desktop and Android share the React UI — keep that in mind.`;

export function BugReportPopup({ open, onClose }: Props) {
  const [screen, setScreen] = useState<Screen>('describe');
  const [kind, setKind] = useState<Kind>('bug');
  const [description, setDescription] = useState('');
  const [summary, setSummary] = useState<{ title: string; summary: string; flagged_strings: string[] } | null>(null);
  const [logTail, setLogTail] = useState('');
  const [busy, setBusy] = useState(false);
  const [resultMessage, setResultMessage] = useState<{ kind: 'submit' | 'claude'; message: string; url?: string } | null>(null);
  const [installLines, setInstallLines] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      // Reset on close so the next open is fresh.
      setScreen('describe');
      setKind('bug');
      setDescription('');
      setSummary(null);
      setLogTail('');
      setBusy(false);
      setResultMessage(null);
      setInstallLines([]);
    }
  }, [open]);

  if (!open) return null;

  const onContinue = async () => {
    setBusy(true);
    try {
      const log = kind === 'bug' ? await window.claude.dev.logTail(200) : '';
      setLogTail(log);
      const s = await window.claude.dev.summarizeIssue({ kind, description, log: kind === 'bug' ? log : undefined });
      setSummary(s);
      setScreen('review');
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = async () => {
    if (!summary) return;
    setBusy(true);
    try {
      const body = buildBody(kind, summary.summary, description, kind === 'bug' ? logTail : '');
      const result = await window.claude.dev.submitIssue({
        title: summary.title,
        body,
        label: kind === 'bug' ? 'bug' : 'enhancement',
      });
      if (result.ok) {
        setResultMessage({ kind: 'submit', message: 'Issue created', url: result.url });
      } else {
        window.open(result.fallbackUrl, '_blank');
        setResultMessage({ kind: 'submit', message: 'Opening GitHub in your browser…' });
      }
      setScreen('result');
    } finally {
      setBusy(false);
    }
  };

  const onLetClaudeTry = async () => {
    setBusy(true);
    setScreen('result');
    setInstallLines([]);
    const off = window.claude.dev.onInstallProgress((line) =>
      setInstallLines((prev) => [...prev.slice(-9), line]),
    );
    try {
      const r = await window.claude.dev.installWorkspace();
      if ((r as any).error) {
        setResultMessage({ kind: 'claude', message: (r as any).error });
        return;
      }
      const prompt = kind === 'bug' ? PROMPT_BUG(description) : PROMPT_FEATURE(description);
      await window.claude.dev.openSessionIn({ cwd: (r as any).path, initialInput: prompt });
      setResultMessage({ kind: 'claude', message: `New session opened in ${(r as any).path}.` });
    } catch (e: any) {
      setResultMessage({ kind: 'claude', message: String(e?.message || e) });
    } finally {
      off();
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 layer-scrim" data-layer="2" />
      <div
        className="layer-surface relative p-4 w-[400px] max-w-[92vw] mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {screen === 'describe' && (
          <DescribeScreen
            kind={kind}
            setKind={setKind}
            description={description}
            setDescription={setDescription}
            onContinue={onContinue}
            busy={busy}
          />
        )}
        {screen === 'review' && summary && (
          <ReviewScreen
            kind={kind}
            summary={summary}
            logTail={logTail}
            setLogTail={setLogTail}
            onEdit={() => setScreen('describe')}
            onSubmit={onSubmit}
            onLetClaudeTry={onLetClaudeTry}
            busy={busy}
          />
        )}
        {screen === 'result' && (
          <ResultScreen
            resultMessage={resultMessage}
            installLines={installLines}
            onDone={onClose}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}

function DescribeScreen({ kind, setKind, description, setDescription, onContinue, busy }: any) {
  return (
    <>
      <div className="flex gap-1 mb-3 p-1 bg-inset/50 rounded-lg">
        {(['bug', 'feature'] as Kind[]).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${kind === k ? 'bg-accent text-on-accent' : 'text-fg-2 hover:bg-inset'}`}
          >
            {k === 'bug' ? 'Bug' : 'Feature'}
          </button>
        ))}
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What's happening? (Or what would you like to see?)"
        className="w-full h-32 p-2 text-xs bg-inset/50 border border-edge-dim rounded-lg resize-none focus:outline-none focus:border-accent"
      />
      <button
        disabled={description.trim().length < 10 || busy}
        onClick={onContinue}
        className="w-full mt-3 py-2.5 text-xs font-medium rounded-lg bg-accent text-on-accent hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {busy ? 'Summarizing…' : 'Continue'}
      </button>
    </>
  );
}

function ReviewScreen({ kind, summary, logTail, setLogTail, onEdit, onSubmit, onLetClaudeTry, busy }: any) {
  const ctaLabel = kind === 'bug' ? 'Let Claude Try to Fix It' : 'Let Claude Try to Build It';
  return (
    <>
      <div className="text-xs text-fg mb-3">{summary.summary}</div>
      {kind === 'bug' && (
        <details className="mb-3">
          <summary className="text-[10px] text-fg-muted cursor-pointer">Logs to include (editable)</summary>
          {summary.flagged_strings.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {summary.flagged_strings.map((s: string) => (
                <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">⚠ {s.slice(0, 30)}</span>
              ))}
            </div>
          )}
          <textarea
            value={logTail}
            onChange={(e) => setLogTail(e.target.value)}
            className="w-full h-32 mt-2 p-2 text-[10px] font-mono bg-inset/50 border border-edge-dim rounded-lg resize-none focus:outline-none focus:border-accent"
          />
        </details>
      )}
      <div className="flex flex-col gap-2">
        <button
          disabled={busy}
          onClick={onSubmit}
          className="w-full py-2.5 text-xs font-medium rounded-lg bg-accent text-on-accent hover:brightness-110 disabled:opacity-40"
        >
          Submit as GitHub Issue
        </button>
        <button
          disabled={busy}
          onClick={onLetClaudeTry}
          className="w-full py-2.5 text-xs font-medium rounded-lg border border-edge-dim text-fg-2 hover:bg-inset disabled:opacity-40"
        >
          {ctaLabel}
        </button>
        <p className="text-[10px] text-amber-400/80 text-center">⚠ High Claude usage — not recommended for Pro plans</p>
        <button onClick={onEdit} className="text-[10px] text-fg-muted hover:text-fg underline">Edit description</button>
      </div>
    </>
  );
}

function ResultScreen({ resultMessage, installLines, onDone }: any) {
  return (
    <>
      {resultMessage ? (
        <div className="text-xs text-fg mb-3">
          {resultMessage.message}
          {resultMessage.url && (
            <>
              {': '}
              <a className="underline text-accent" href={resultMessage.url} target="_blank" rel="noreferrer">{resultMessage.url}</a>
            </>
          )}
        </div>
      ) : (
        <div className="text-xs text-fg-muted mb-3 font-mono">
          {installLines.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
      <button
        onClick={onDone}
        className="w-full py-2.5 text-xs font-medium rounded-lg bg-accent text-on-accent hover:brightness-110"
      >
        Done
      </button>
    </>
  );
}

function buildBody(kind: Kind, summary: string, description: string, log: string): string {
  const header = [summary.trim(), '', '---', '**User description:**', description.trim(), '', `**Environment:** YouCoded · ${navigator.userAgent}`].join('\n');
  if (kind === 'feature') return header;
  return [header, '', '**Logs (last N lines):**', '<details><summary>desktop.log</summary>', '', '```', log, '```', '', '</details>'].join('\n');
}
```

- [ ] **Step 4: Run the tests**

Run: `cd desktop && npx vitest run tests/development-popup.test.tsx -t BugReportPopup`
Expected: PASS, 3 specs.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer/components/development/BugReportPopup.tsx desktop/tests/development-popup.test.tsx
git commit -m "feat(dev): BugReportPopup with three-screen state machine"
```

---

### Task 15: `ContributePopup` — single-screen install flow

**Files:**
- Create: `youcoded/desktop/src/renderer/components/development/ContributePopup.tsx`

- [ ] **Step 1: Implement the component**

```tsx
// desktop/src/renderer/components/development/ContributePopup.tsx
import { createPortal } from 'react-dom';
import { useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ContributePopup({ open, onClose }: Props) {
  const [installing, setInstalling] = useState(false);
  const [installLines, setInstallLines] = useState<string[]>([]);
  const [done, setDone] = useState<{ path: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const onInstall = async () => {
    setInstalling(true);
    setInstallLines([]);
    setError(null);
    const off = window.claude.dev.onInstallProgress((line) =>
      setInstallLines((prev) => [...prev.slice(-9), line]),
    );
    try {
      const r = await window.claude.dev.installWorkspace();
      if ((r as any).error) {
        setError((r as any).error);
      } else {
        setDone({ path: (r as any).path });
      }
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      off();
      setInstalling(false);
    }
  };

  const onOpenInNewSession = async () => {
    if (!done) return;
    await window.claude.dev.openSessionIn({ cwd: done.path });
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 layer-scrim" data-layer="2" />
      <div
        className="layer-surface relative p-4 w-[400px] max-w-[92vw] mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {!installing && !done && !error && (
          <>
            <h3 className="text-sm font-medium text-fg mb-2">Contribute to YouCoded</h3>
            <p className="text-xs text-fg-2 mb-2">
              <code className="text-[11px] bg-inset/60 px-1 rounded">youcoded-dev</code> is the workspace scaffold
              that clones all five YouCoded sub-repos side by side, with shared docs and the <code>/audit</code> command.
            </p>
            <p className="text-xs text-fg-2 mb-3">
              Open it as a project folder, ask Claude to make changes, and push PRs to the relevant
              <strong> sub-repo</strong> — never to <code>youcoded-dev</code> itself.
            </p>
            <button
              onClick={onInstall}
              className="w-full py-2.5 text-xs font-medium rounded-lg bg-accent text-on-accent hover:brightness-110"
            >
              Install Workspace
            </button>
          </>
        )}
        {installing && (
          <div className="text-xs text-fg-muted mb-3 font-mono">
            {installLines.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
        {error && (
          <>
            <div className="text-xs text-fg mb-3">{error}</div>
            <button onClick={onClose} className="w-full py-2.5 text-xs font-medium rounded-lg bg-accent text-on-accent">Done</button>
          </>
        )}
        {done && (
          <>
            <div className="text-xs text-fg mb-3">
              Workspace installed at <code className="text-[11px]">{done.path}</code>. Added to your project folders.
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 py-2.5 text-xs font-medium rounded-lg border border-edge-dim text-fg-2 hover:bg-inset">Done</button>
              <button onClick={onOpenInNewSession} className="flex-1 py-2.5 text-xs font-medium rounded-lg bg-accent text-on-accent">Open in New Session</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: Quick smoke compile**

Run: `cd desktop && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add desktop/src/renderer/components/development/ContributePopup.tsx
git commit -m "feat(dev): ContributePopup with install + folder-registration flow"
```

---

### Task 16: Wire Development row into the **Desktop** Settings block

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/SettingsPanel.tsx`

- [ ] **Step 1: Add imports and state at the top of the `DesktopSettings` component**

Find the `DesktopSettings` function (~line 2076) and the existing `useState` block for show-popups. Add:

```typescript
import { DevelopmentPopup } from './development/DevelopmentPopup';
import { BugReportPopup } from './development/BugReportPopup';
import { ContributePopup } from './development/ContributePopup';

// inside DesktopSettings():
const [showDevMenu, setShowDevMenu] = useState(false);
const [showBugReport, setShowBugReport] = useState(false);
const [showContribute, setShowContribute] = useState(false);
```

- [ ] **Step 2: Insert the row + popup bodies in the Other section**

In the Other section block (~line 2261-2374), insert a new row between **Defaults** and **Keyboard Shortcuts**:

```tsx
<button
  onClick={() => setShowDevMenu(true)}
  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-inset/50 hover:bg-inset transition-colors text-left"
>
  <div className="flex items-center justify-center shrink-0" style={{ width: 32, height: 20 }}>
    <span className="text-base">🛠</span>
  </div>
  <div className="flex-1 min-w-0">
    <span className="text-xs text-fg font-medium">Development</span>
    <p className="text-[10px] text-fg-muted">Report a bug, contribute, or browse known issues</p>
  </div>
  <svg className="w-3.5 h-3.5 text-fg-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
</button>

<DevelopmentPopup
  open={showDevMenu}
  onClose={() => setShowDevMenu(false)}
  onOpenBug={() => { setShowDevMenu(false); setShowBugReport(true); }}
  onOpenContribute={() => { setShowDevMenu(false); setShowContribute(true); }}
/>
<BugReportPopup open={showBugReport} onClose={() => setShowBugReport(false)} />
<ContributePopup open={showContribute} onClose={() => setShowContribute(false)} />
```

- [ ] **Step 3: Manual smoke**

Run: `bash scripts/run-dev.sh` from the workspace root.
- Open Settings → Other
- Click **Development** — three-row popup appears
- Click **Known Issues and Planned Features** — browser opens to issues page
- Click **Report a Bug or Request a Feature** — popup appears with Bug/Feature toggle and textarea

- [ ] **Step 4: Commit**

```bash
git add desktop/src/renderer/components/SettingsPanel.tsx
git commit -m "feat(dev): wire Development row into Desktop settings"
```

---

### Task 17: Wire Development row into the **Android** Settings block

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/SettingsPanel.tsx`

The Android variant of the Settings panel uses the same React component (the UI is shared) but is in a separate JSX block (~line 1971). Add the same row + popup bodies there.

- [ ] **Step 1: Add the same state declarations to the Android settings function**

Find the Android settings function (it's the one with the `<TierSelector …>` component, typically near line 1900). Add the same three `useState` lines and the imports if not already imported at file scope.

- [ ] **Step 2: Insert the same row + popup JSX**

Between **DefaultsButton** (~line 1974) and the existing Keyboard Shortcuts comment (~line 1976), paste the same row JSX from Task 16 step 2, plus the same three popup elements at the end of the Other section.

- [ ] **Step 3: Manual smoke (if Android device available)**

Build: `cd youcoded && ./scripts/build-web-ui.sh && ./gradlew assembleDebug`
Install on device, open Settings → Other → Development. Confirm same flow.

- [ ] **Step 4: Commit**

```bash
git add desktop/src/renderer/components/SettingsPanel.tsx
git commit -m "feat(dev): wire Development row into Android settings"
```

---

## Phase 6 — Android parity

### Task 18: Add `DevTools.kt` with shared logic

**Files:**
- Create: `youcoded/app/src/main/kotlin/com/youcoded/app/runtime/DevTools.kt`

- [ ] **Step 1: Implement Kotlin port of dev-tools.ts**

```kotlin
// youcoded/app/src/main/kotlin/com/youcoded/app/runtime/DevTools.kt
package com.youcoded.app.runtime

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException

/**
 * Kotlin equivalent of desktop/src/main/dev-tools.ts. Mirrors the
 * pure-logic helpers and IPC handler bodies. The TS file is the
 * canonical reference for behavior — keep these in sync.
 *
 * See docs/superpowers/specs/2026-04-21-development-settings-design.md.
 */
object DevTools {
    private val GH_TOKEN_RE = Regex("gh[opsu]_[A-Za-z0-9]{20,}")
    private val ANTHROPIC_KEY_RE = Regex("sk-ant-[A-Za-z0-9_-]{20,}")
    private const val WORKSPACE_REPO = "https://github.com/itsdestin/youcoded-dev"

    fun redactLog(text: String, homeDir: String): String {
        var out = text
        if (homeDir.isNotEmpty()) {
            out = out.replace(homeDir, "~")
        }
        out = GH_TOKEN_RE.replace(out, "[REDACTED-GH-TOKEN]")
        out = ANTHROPIC_KEY_RE.replace(out, "[REDACTED-ANTHROPIC-KEY]")
        return out
    }

    fun smartTruncateLog(text: String, keepLines: Int): String {
        val lines = text.split('\n')
        if (lines.size <= keepLines) return text
        val omitted = lines.size - keepLines
        return "… ($omitted earlier lines omitted)\n${lines.takeLast(keepLines).joinToString("\n")}"
    }

    fun classifyExistingWorkspace(remoteUrl: String): String {
        val trimmed = remoteUrl.trim()
        if (trimmed.isEmpty()) return "not-git"
        return if (Regex("[/:]itsdestin/youcoded-dev(\\.git)?/?$").containsMatchIn(trimmed))
            "workspace" else "wrong-remote"
    }

    fun readLogTail(homeDir: String, maxLines: Int): String {
        val logFile = File(File(homeDir, ".claude"), "desktop.log")
        if (!logFile.exists()) return ""
        return try {
            val raw = logFile.readText()
            val tail = raw.split('\n').takeLast(maxLines).joinToString("\n")
            redactLog(tail, homeDir)
        } catch (e: IOException) {
            ""
        }
    }

    /**
     * Run a shell command via Bootstrap-built env so gh/git/bash resolve.
     * Streams stdout/stderr line-by-line through onLine.
     * Returns (exitCode, combinedOutput).
     */
    fun runStreamed(
        context: Context,
        env: Array<String>,
        cmd: List<String>,
        cwd: File?,
        onLine: (String) -> Unit,
    ): Pair<Int, String> {
        val pb = ProcessBuilder(cmd).redirectErrorStream(true)
        pb.environment().clear()
        env.forEach { kv ->
            val ix = kv.indexOf('=')
            if (ix > 0) pb.environment()[kv.substring(0, ix)] = kv.substring(ix + 1)
        }
        if (cwd != null) pb.directory(cwd)
        val proc = pb.start()
        val output = StringBuilder()
        proc.inputStream.bufferedReader().useLines { lines ->
            for (line in lines) {
                onLine(line)
                output.append(line).append('\n')
            }
        }
        val exit = proc.waitFor()
        return exit to output.toString()
    }
}
```

- [ ] **Step 2: Compile to verify**

Run: `cd youcoded && ./gradlew :app:compileDebugKotlin`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/src/main/kotlin/com/youcoded/app/runtime/DevTools.kt
git commit -m "feat(android): DevTools.kt with redaction, idempotency, run helpers"
```

---

### Task 19: Add SessionService.kt `when` cases for all six IPC types

**Files:**
- Modify: `youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`

The existing `handleBridgeMessage()` is a long `when`. We add six branches that delegate to `DevTools` (for pure logic) and shell out via the Bootstrap env (for `gh`, `git`, `bash`, `claude`).

- [ ] **Step 1: Find `handleBridgeMessage()` and the existing env-build helper**

Search SessionService.kt for `fun handleBridgeMessage` and `Bootstrap.buildRuntimeEnv` to see how existing handlers shell out.

- [ ] **Step 2: Add the six branches**

Add inside the `when (msg.type)` block:

```kotlin
"dev:log-tail" -> {
    val maxLines = (msg.payload as? Number)?.toInt() ?: 200
    val tail = DevTools.readLogTail(homeDir.absolutePath, maxLines)
    bridgeServer.respond(ws, msg.type, msg.id, tail)
}
"dev:summarize-issue" -> {
    val payload = msg.payload as? JSONObject ?: JSONObject()
    val kind = payload.optString("kind", "bug")
    val description = payload.optString("description", "")
    val log = if (kind == "bug") payload.optString("log", "") else ""
    val prompt = buildSummarizerPrompt(kind, description, log)
    val (exit, out) = DevTools.runStreamed(
        applicationContext,
        Bootstrap.buildRuntimeEnv(applicationContext),
        listOf("claude", "-p", prompt),
        null,
    ) { /* ignore intermediate lines */ }
    val result = parseSummary(out, description, exit == 0)
    bridgeServer.respond(ws, msg.type, msg.id, result)
}
"dev:submit-issue" -> {
    val payload = msg.payload as JSONObject
    val title = payload.getString("title")
    val body = payload.getString("body")
    val label = payload.getString("label")
    val env = Bootstrap.buildRuntimeEnv(applicationContext)
    val (authExit, _) = DevTools.runStreamed(applicationContext, env, listOf("gh", "auth", "status"), null) {}
    if (authExit != 0) {
        bridgeServer.respond(ws, msg.type, msg.id, JSONObject().apply {
            put("ok", false)
            put("fallbackUrl", buildPrefillUrl(title, body, label))
        })
    } else {
        val tmp = File.createTempFile("youcoded-issue-", ".md", applicationContext.cacheDir)
        tmp.writeText(body)
        val (exit, stdout) = DevTools.runStreamed(
            applicationContext, env,
            listOf("gh", "issue", "create",
                "--repo", "itsdestin/youcoded",
                "--title", title,
                "--body-file", tmp.absolutePath,
                "--label", label,
                "--label", "youcoded-app:reported"),
            null,
        ) {}
        tmp.delete()
        val url = Regex("https://github\\.com/[^\\s]+").find(stdout)?.value
        if (exit == 0 && url != null) {
            bridgeServer.respond(ws, msg.type, msg.id, JSONObject().apply {
                put("ok", true); put("url", url)
            })
        } else {
            bridgeServer.respond(ws, msg.type, msg.id, JSONObject().apply {
                put("ok", false); put("fallbackUrl", buildPrefillUrl(title, body, label))
            })
        }
    }
}
"dev:install-workspace" -> {
    val target = File(homeDir, "youcoded-dev")
    val env = Bootstrap.buildRuntimeEnv(applicationContext)
    val onLine: (String) -> Unit = { line ->
        bridgeServer.broadcast(JSONObject().apply { put("type", "dev:install-progress"); put("payload", line) })
    }
    try {
        if (target.exists()) {
            val (_, remote) = DevTools.runStreamed(applicationContext, env, listOf("git", "-C", target.absolutePath, "remote", "get-url", "origin"), null) {}
            val cls = DevTools.classifyExistingWorkspace(remote.trim())
            if (cls != "workspace") {
                bridgeServer.respond(ws, msg.type, msg.id, JSONObject().apply {
                    put("error", "${target.absolutePath} already exists but isn't the YouCoded dev workspace. Move or rename it and try again.")
                })
                return@handleBridgeMessage
            }
            onLine("Found existing workspace, pulling latest…")
            DevTools.runStreamed(applicationContext, env, listOf("git", "-C", target.absolutePath, "pull", "--ff-only"), null, onLine)
        } else {
            onLine("Cloning workspace…")
            DevTools.runStreamed(applicationContext, env, listOf("git", "clone", "--depth", "50", "https://github.com/itsdestin/youcoded-dev", target.absolutePath), null, onLine)
        }
        onLine("Cloning sub-repos (this may take a minute)…")
        DevTools.runStreamed(applicationContext, env, listOf("bash", "setup.sh"), target, onLine)
        // Register as a project folder via the existing Android folders mechanism.
        registerProjectFolder(target.absolutePath)
        bridgeServer.respond(ws, msg.type, msg.id, JSONObject().apply {
            put("path", target.absolutePath)
            put("alreadyInstalled", false)
        })
    } catch (e: Exception) {
        bridgeServer.respond(ws, msg.type, msg.id, JSONObject().apply { put("error", e.message ?: "Install failed") })
    }
}
"dev:open-session-in" -> {
    val payload = msg.payload as JSONObject
    val cwd = payload.getString("cwd")
    val initialInput = payload.optString("initialInput", null)
    val info = sessionRegistry.createSession(cwd = cwd, initialInput = initialInput)
    bridgeServer.respond(ws, msg.type, msg.id, info.toJson())
}
```

(Helper functions `buildSummarizerPrompt`, `parseSummary`, `buildPrefillUrl` need to be defined as private members of `SessionService` or in `DevTools.kt`. Same logic as the TS counterparts — port directly. `registerProjectFolder` should call into whatever Android storage already backs the folder picker; if no such helper exists, write the path into the same JSON file the Android folder-list IPC reads from.)

- [ ] **Step 3: Compile and run the parity test from Task 12**

Run: `cd youcoded && ./gradlew :app:compileDebugKotlin && cd desktop && npx vitest run tests/ipc-channels.test.ts`
Expected: Kotlin compiles; all three parity assertions in `ipc-channels.test.ts` now PASS.

- [ ] **Step 4: Commit**

```bash
git add app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt app/src/main/kotlin/com/youcoded/app/runtime/DevTools.kt
git commit -m "feat(android): SessionService handlers for dev:* IPCs"
```

---

## Phase 7 — Polish

### Task 20: Add PITFALLS.md entry

**Files:**
- Modify: `docs/PITFALLS.md` (in `youcoded-dev`, not in `youcoded/`)

- [ ] **Step 1: Append a new section after the existing **"Announcements"** section**

```markdown
## Settings → Development

- **Six new IPC types must stay in parity across `preload.ts`, `remote-shim.ts`, `ipc-handlers.ts`, and `SessionService.kt`:** `dev:log-tail`, `dev:summarize-issue`, `dev:submit-issue`, `dev:install-workspace`, `dev:install-progress`, `dev:open-session-in`. The `tests/ipc-channels.test.ts` parity test catches drift; do not "simplify" by removing one platform.
- **GitHub labels must exist on `itsdestin/youcoded` for `gh issue create` to succeed:** `bug`, `enhancement`, `youcoded-app:reported`. If `gh` returns "label not found," create the label in the repo settings — do not silently strip the label from the spawn args.
- **`setup.sh` re-run is the canonical idempotency path for the workspace install.** When `~/youcoded-dev` already exists with the matching git remote, the install handler skips the clone and just runs `git pull` + `bash setup.sh` again. Do not "simplify" by always re-cloning — wastes ~500MB and breaks any in-progress local edits the user has.
- **Summarizer shells out to `claude -p` (one-shot non-interactive mode), not `api.anthropic.com` directly.** This reuses Claude Code's own OAuth token and avoids cracking open `~/.claude/.credentials.json`. If you ever switch to direct API calls, add a `cc-dependencies.md` entry — the credentials file format is a private CC contract.
```

- [ ] **Step 2: Commit (in the youcoded-dev repo, not the youcoded subrepo)**

```bash
cd ../../  # back to youcoded-dev workspace root
git add docs/PITFALLS.md
git commit -m "docs(pitfalls): settings → development section"
cd youcoded/  # back to the worktree
```

---

### Task 21: Verify GitHub repo labels exist

This is a one-time manual step, not a code change.

**Files:** none.

- [ ] **Step 1: Check existing labels**

Run: `gh label list --repo itsdestin/youcoded`

- [ ] **Step 2: Create any missing labels**

For each missing label, run:

```bash
gh label create bug --description "Something isn't working" --color d73a4a --repo itsdestin/youcoded
gh label create enhancement --description "New feature or request" --color a2eeef --repo itsdestin/youcoded
gh label create youcoded-app:reported --description "Submitted via the in-app Development popup" --color cccccc --repo itsdestin/youcoded
```

(`bug` and `enhancement` are GitHub defaults; only create if missing.)

---

### Task 22: Manual smoke checklist

Execute on Desktop. Optional but recommended on Android.

- [ ] Open Settings → Other → Development. Confirm three rows.
- [ ] Click **Known Issues and Planned Features** — opens browser to `https://github.com/itsdestin/youcoded/issues`.
- [ ] Click **Report a Bug**, choose **Bug** toggle, type "test bug — please ignore" (≥10 chars), Continue.
- [ ] Confirm summary renders. Confirm collapsible logs section is present and editable.
- [ ] Click **Submit as GitHub Issue** — assuming `gh auth status` succeeds, confirm "Issue created" with a clickable URL. Open the URL — verify `bug` and `youcoded-app:reported` labels are applied.
- [ ] Repeat with **Feature** toggle — verify `enhancement` label and no `<details>` block in the issue body.
- [ ] Manually `gh auth logout`, then submit again — verify browser opens to a prefilled URL.
- [ ] Click **Let Claude Try to Fix It** with a description in place. Watch progress lines stream. Verify a new session opens with `cwd = ~/youcoded-dev` and the input bar prefilled with the prompt template (not yet sent).
- [ ] In FolderSwitcher / new-session form, confirm `~/youcoded-dev` now appears in the project folders list.
- [ ] Run **Let Claude Try to Fix It** a second time — verify silent re-use, `setup.sh` re-runs, no error.
- [ ] Manually create `~/youcoded-dev` as an empty dir (or one with a different remote). Run install — verify the wrong-remote error appears with no destructive action.
- [ ] Open **Contribute to YouCoded** — confirm explainer text. Click **Install Workspace** — runs same install. Verify "Open in New Session" works.
- [ ] If Android device available: rebuild web UI + APK (`./scripts/build-web-ui.sh && ./gradlew assembleDebug`), install, repeat the bug-submit and install-workspace flows on the device.

---

## Self-review notes

- Spec coverage: every numbered section of the spec maps to one or more tasks above. Cross-checked: settings entry (T16, T17), three-row popup (T13), bug-report state machine (T14), contribute popup (T15), submission pipeline incl. redaction/summarizer/submit/URL-fallback (T2, T3, T4, T6, T7, T8), install pipeline incl. idempotency/concurrency (T5, T9), folder registration (T9 inline), session prefill (T10), Android parity (T18, T19), error handling (covered in handler implementations), tests (per phase), docs (T20), label prerequisite (T21).
- The `dev:open-session-in` IPC needs `SessionInfo` to carry `initialInput` through to the renderer — Task 10 includes this in `shared/types.ts` so the parity test in T12 doesn't false-fail.
- `Object.assign` patterns and any helpers used (`splitLines`, `getGitRemote`, `isGhAuthenticated`, `parseSummary`, `fallbackSummary`, `buildSummarizerPrompt`) are defined in the same task that introduces their first caller — readable out of order.
- Test naming follows existing convention (`*.test.ts` flat in `desktop/tests/`).
- No "TBD" / "TODO" / "implement later" — every step has runnable code or an exact command.
