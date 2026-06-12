# Resume Browser Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop sessions from silently disappearing or losing their names in the Resume Browser.

**Architecture:** Six independent fixes in the youcoded app (desktop-first, Android parity mirrored): seed a transcript-retention default into Claude Code's settings.json, derive fallback titles and recency from the transcript JSONL itself, reject phantom session ids in the conversation index, allow `sessionIdMap` to follow Claude Code's mid-PTY session-id rotation (`/clear`), and preserve mtimes when regenerating topic-cache files so the index stops lying about activity. Backup/restore fixes (bulk-pull timeout, push mtime preservation) are explicitly **out of scope** — deferred to a dedicated backup-logic evaluation.

**Tech Stack:** TypeScript (Electron main, vitest), Kotlin (Android), bash hook untouched.

**Background (from the 2026-06-12 investigation, this session):**
- `cleanupPeriodDays` is unset in `~/.claude/settings.json`, so Claude Code's 30-day default deleted 221 named conversations' transcripts locally.
- 17 of 94 listed sessions show "Untitled" — the auto-title hook is PostToolUse-gated (chat-only sessions never fire it) and model-compliance-dependent.
- Sync restores rewrite transcript mtimes (12 sessions all "modified" 6/11 20:07–20:14), so mtime-based recency ordering lies.
- The index contains phantom ids (e.g. `3f3a5cccc-…`, nine c's) from the model hand-typing topic filenames.
- `sessionIdMap` in ipc-handlers.ts is set-once per desktop session; after `/clear` CC rotates the session id and close-time flags land on the pre-`/clear` id.
- `regenerateTopicCache()` recreates topic files with `now` mtimes; `updateConversationIndex()` reads topic mtime as `lastActive`, so every regenerate bumps every session's `lastActive` (observed: all 627 topic files ≤2 days old; dozens of index entries share lastActive `2026-06-12T03:04:04Z`). This breaks the index prune AND the recent-50 backup pull's selection.
- Empirically verified: `claude --resume <id>` keeps the same session id and appends the same JSONL (no fork).

**Working rules that apply:**
- All code changes in a `youcoded` worktree (`git worktree add`), branch `fix/resume-browser-reliability`. Sync (`git fetch origin && git pull origin master`) before creating it.
- Annotate non-trivial edits with WHY comments (Destin is a non-developer).
- Desktop handlers return raw values; the `PastSession` IPC shape must stay backward-compatible (additive fields only).
- Run `cd youcoded/desktop && npm test && npm run build` before finishing; Android: `./gradlew :app:testDebugUnitTest`.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `desktop/src/main/retention-default.ts` | Create | Seed `cleanupPeriodDays` when absent (mirrors `disable-prompt-suggestion.ts`) |
| `desktop/tests/retention-default.test.ts` | Create | Tests for the above |
| `desktop/src/main/main.ts` (~line 1142) | Modify | Invoke seeding at launch, after the prompt-suggestion block |
| `desktop/src/main/session-browser.ts` | Modify | `readTranscriptMeta()` (fallback title + content timestamp), integrate into `listPastSessions` |
| `desktop/tests/session-browser.test.ts` | Create | Tests for listing, fallback titles, content-timestamp ordering |
| `desktop/src/main/session-id-mapping.ts` | Create | Pure decision helper for sessionIdMap adopt/ignore |
| `desktop/tests/session-id-mapping.test.ts` | Create | Tests for the decision helper |
| `desktop/src/main/ipc-handlers.ts` (~lines 1750–1766) | Modify | Use the helper; close stale watchers on remap |
| `desktop/src/main/sync-service.ts` | Modify | UUID guard in `updateConversationIndex`; self-heal phantom entries; mtime-preserving `regenerateTopicCache` |
| `desktop/tests/sync-service-index-hygiene.test.ts` | Create | Tests for phantom guard + regenerate mtime |
| `app/src/main/kotlin/com/youcoded/app/runtime/RetentionDefault.kt` | Create | Android mirror of retention seeding |
| `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` | Modify | Wire RetentionDefault; apply derived-title precedence |
| `app/src/main/kotlin/com/youcoded/app/runtime/SessionBrowser.kt` | Modify | Kotlin `readTranscriptMeta` mirror |
| `youcoded/docs/cc-dependencies.md` | Modify | New CC touchpoints: `cleanupPeriodDays`, transcript head/tail parse |
| `youcoded-dev/docs/PITFALLS.md` (workspace repo) | Modify | New "Resume Browser & Conversation Identity" section |

---

### Task 0: Worktree setup

- [ ] **Step 1: Sync and create the worktree**

```bash
cd ~/youcoded-dev/youcoded && git fetch origin && git pull origin master
git worktree add .worktrees/resume-browser-reliability -b fix/resume-browser-reliability
cd .worktrees/resume-browser-reliability/desktop && npm ci
```

Expected: clean worktree on a new branch, deps installed. (Do NOT junction node_modules; `npm ci` fresh — see workspace CLAUDE.md worktree-junction warning.)

---

### Task 1: Retention default (desktop)

**Files:**
- Create: `desktop/src/main/retention-default.ts`
- Test: `desktop/tests/retention-default.test.ts`
- Modify: `desktop/src/main/main.ts` (after the prompt-suggestion block ending ~line 1141)

- [ ] **Step 1: Write the failing test**

`desktop/tests/retention-default.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Stub homedir BEFORE importing the module under test — it resolves
// ~/.claude/settings.json from os.homedir() at call time.
let tmpHome: string;
let origHomedir: typeof os.homedir;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'youcoded-retention-'));
  origHomedir = os.homedir;
  (os as any).homedir = () => tmpHome;
});

afterEach(() => {
  (os as any).homedir = origHomedir;
  try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch {}
});

const settingsPath = () => path.join(tmpHome, '.claude', 'settings.json');

async function seed() {
  const mod = await import('../src/main/retention-default');
  return mod.seedCleanupPeriodDefault();
}

describe('seedCleanupPeriodDefault', () => {
  it('writes the default when settings.json does not exist', async () => {
    const r = await seed();
    expect(r.changed).toBe(true);
    const written = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    expect(written.cleanupPeriodDays).toBe(365);
  });

  it('adds the key without clobbering existing settings', async () => {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify({ enabledPlugins: { 'x@y': true }, hooks: { Stop: [] } }));
    const r = await seed();
    expect(r.changed).toBe(true);
    const written = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    expect(written.cleanupPeriodDays).toBe(365);
    expect(written.enabledPlugins).toEqual({ 'x@y': true });
    expect(written.hooks).toEqual({ Stop: [] });
  });

  it('respects an explicit user value, including shorter ones', async () => {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify({ cleanupPeriodDays: 7 }));
    const r = await seed();
    expect(r.changed).toBe(false);
    expect(r.effective).toBe(7);
    expect(JSON.parse(fs.readFileSync(settingsPath(), 'utf8')).cleanupPeriodDays).toBe(7);
  });

  it('does NOT rewrite a corrupt settings.json (never wipe hooks/plugins)', async () => {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), '{ not json');
    const r = await seed();
    expect(r.changed).toBe(false);
    expect(fs.readFileSync(settingsPath(), 'utf8')).toBe('{ not json');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd desktop && npx vitest run tests/retention-default.test.ts`
Expected: FAIL — cannot resolve `../src/main/retention-default`.

- [ ] **Step 3: Write the implementation**

`desktop/src/main/retention-default.ts`:

```ts
import fs from 'fs';
import path from 'path';
import os from 'os';

// Seed `cleanupPeriodDays` into ~/.claude/settings.json when the key is
// ABSENT. Claude Code deletes transcript JSONLs whose age exceeds
// cleanupPeriodDays, and its built-in default is 30 days — which silently
// destroys YouCoded's Resume Browser history (2026-06-12 investigation: 221
// named conversations deleted locally). YouCoded is a chat app; users expect
// history to persist, so we seed a year.
//
// Unlike disable-prompt-suggestion.ts (force-overwrites every launch), this
// only writes when the key is missing: an explicit user value — even a
// deliberately short one — is respected.
//
// CC-coupled: `cleanupPeriodDays` is a Claude Code settings contract. See
// youcoded/docs/cc-dependencies.md → "Transcript retention (cleanupPeriodDays)".

export const DEFAULT_CLEANUP_PERIOD_DAYS = 365;

export interface SeedRetentionResult {
  /** True iff settings.json was rewritten (key was absent). */
  changed: boolean;
  /** The value now in effect, or undefined if settings were unreadable. */
  effective: number | undefined;
}

function settingsPath(): string {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

export function seedCleanupPeriodDefault(): SeedRetentionResult {
  const p = settingsPath();
  let settings: Record<string, unknown> = {};
  if (fs.existsSync(p)) {
    try {
      settings = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      // Do NOT rewrite on parse failure — settings.json carries hooks and
      // enabledPlugins; replacing a corrupt file with just our key would wipe
      // them. (disable-prompt-suggestion.ts writes fresh in this case; that
      // convention is wrong for a low-stakes seeding like this one.)
      return { changed: false, effective: undefined };
    }
  }

  if (typeof settings.cleanupPeriodDays === 'number') {
    return { changed: false, effective: settings.cleanupPeriodDays as number };
  }

  settings.cleanupPeriodDays = DEFAULT_CLEANUP_PERIOD_DAYS;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  // Atomic write (tmp + rename) — same convention as disable-prompt-suggestion.
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf8');
  fs.renameSync(tmp, p);
  return { changed: true, effective: DEFAULT_CLEANUP_PERIOD_DAYS };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd desktop && npx vitest run tests/retention-default.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Wire into main.ts**

In `desktop/src/main/main.ts`, directly AFTER the prompt-suggestion try/catch block (ends ~line 1141), add:

```ts
  // Seed a transcript-retention default so Claude Code's 30-day cleanup
  // doesn't silently delete Resume Browser history. Only writes when the
  // user hasn't set cleanupPeriodDays themselves. See retention-default.ts.
  try {
    const { seedCleanupPeriodDefault } = require('./retention-default');
    const r = seedCleanupPeriodDefault();
    if (r.changed) log('INFO', 'Main', 'Seeded cleanupPeriodDays default', { effective: r.effective });
  } catch (e) {
    log('ERROR', 'Main', 'Failed to seed cleanupPeriodDays', { error: String(e) });
  }
```

- [ ] **Step 6: Commit**

```bash
git add desktop/src/main/retention-default.ts desktop/tests/retention-default.test.ts desktop/src/main/main.ts
git commit -m "feat(retention): seed cleanupPeriodDays=365 so CC stops deleting transcript history"
```

---

### Task 2: Transcript-derived titles + content-timestamp ordering (desktop)

**Files:**
- Modify: `desktop/src/main/session-browser.ts`
- Test: `desktop/tests/session-browser.test.ts` (new)

**Behavior:**
- Name precedence: topic file > conversation-index topic > **derived-from-first-user-message** > "Untitled".
- `lastModified` becomes the transcript's own last line timestamp when parseable; falls back to file mtime. (Sync restores clobber mtimes; the JSONL content timestamps are immune.)
- Bounded I/O: read at most 256KB head (only when no topic/index name) + 64KB tail per file.

- [ ] **Step 1: Write the failing tests**

`desktop/tests/session-browser.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tmpHome: string;
let origHomedir: typeof os.homedir;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'youcoded-browser-'));
  origHomedir = os.homedir;
  (os as any).homedir = () => tmpHome;
  fs.mkdirSync(path.join(tmpHome, '.claude', 'topics'), { recursive: true });
});

afterEach(() => {
  (os as any).homedir = origHomedir;
  try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch {}
});

// session-browser captures CLAUDE_DIR from os.homedir() at module load —
// dynamic import per test so the stub applies. vitest caches modules per
// file run, so resetModules first.
async function listSessions(activeIds?: Set<string>) {
  const { vi } = await import('vitest');
  vi.resetModules();
  const mod = await import('../src/main/session-browser');
  return mod.listPastSessions(activeIds);
}

const SID_A = '11111111-1111-4111-8111-111111111111';
const SID_B = '22222222-2222-4222-8222-222222222222';

function jsonlLine(obj: Record<string, unknown>): string {
  return JSON.stringify(obj) + '\n';
}

/** A realistic minimal transcript: meta line, user prompt, assistant reply. */
function writeTranscript(slug: string, sid: string, opts: {
  firstUserText?: string;
  lastTimestamp?: string;
  pad?: boolean; // pad >500 bytes
} = {}): string {
  const dir = path.join(tmpHome, '.claude', 'projects', slug);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${sid}.jsonl`);
  let content = '';
  content += jsonlLine({ type: 'user', isMeta: true, uuid: 'm1', timestamp: '2026-06-01T10:00:00Z', message: { content: 'meta noise' } });
  content += jsonlLine({
    type: 'user', uuid: 'u1', promptId: 'p1', timestamp: '2026-06-01T10:00:01Z',
    message: { content: opts.firstUserText ?? 'help me fix the spinner regex in the attention classifier please' },
  });
  content += jsonlLine({
    type: 'assistant', uuid: 'a1', timestamp: opts.lastTimestamp ?? '2026-06-01T10:05:00Z',
    message: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'done. '.repeat(opts.pad === false ? 1 : 40) }] },
  });
  fs.writeFileSync(file, content);
  return file;
}

describe('listPastSessions — fallback titles', () => {
  it('derives the name from the first user message when no topic exists', async () => {
    writeTranscript('C--proj-alpha', SID_A);
    const sessions = await listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].name).toBe('help me fix the spinner regex in the attention…');
  });

  it('prefers the topic file over the derived title', async () => {
    writeTranscript('C--proj-alpha', SID_A);
    fs.writeFileSync(path.join(tmpHome, '.claude', 'topics', `topic-${SID_A}`), 'Spinner Regex Fix');
    const sessions = await listSessions();
    expect(sessions[0].name).toBe('Spinner Regex Fix');
  });

  it('prefers the conversation-index topic over the derived title', async () => {
    writeTranscript('C--proj-alpha', SID_A);
    fs.writeFileSync(path.join(tmpHome, '.claude', 'conversation-index.json'), JSON.stringify({
      version: 1,
      sessions: { [SID_A]: { topic: 'Indexed Name', lastActive: '2026-06-01T10:05:00Z', slug: 'C--proj-alpha', device: 'test' } },
    }));
    const sessions = await listSessions();
    expect(sessions[0].name).toBe('Indexed Name');
  });

  it('skips injected tag-wrapped lines when deriving (e.g. command wrappers)', async () => {
    const dir = path.join(tmpHome, '.claude', 'projects', 'C--proj-alpha');
    fs.mkdirSync(dir, { recursive: true });
    let content = '';
    content += jsonlLine({
      type: 'user', uuid: 'u0', promptId: 'p0', timestamp: '2026-06-01T09:59:59Z',
      message: { content: '<command-name>/model</command-name>' },
    });
    content += jsonlLine({
      type: 'user', uuid: 'u1', promptId: 'p1', timestamp: '2026-06-01T10:00:01Z',
      message: { content: 'real question about themes' },
    });
    content += jsonlLine({
      type: 'assistant', uuid: 'a1', timestamp: '2026-06-01T10:05:00Z',
      message: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'x'.repeat(400) }] },
    });
    fs.writeFileSync(path.join(dir, `${SID_A}.jsonl`), content);
    const sessions = await listSessions();
    expect(sessions[0].name).toBe('real question about themes');
  });
});

describe('listPastSessions — content-timestamp ordering', () => {
  it('uses the transcript last timestamp instead of a clobbered mtime', async () => {
    const fileA = writeTranscript('C--proj-alpha', SID_A, { lastTimestamp: '2026-06-10T12:00:00Z' });
    const fileB = writeTranscript('C--proj-beta', SID_B, { lastTimestamp: '2026-06-01T12:00:00Z' });
    // Clobber mtimes in the WRONG order (older content gets newer mtime),
    // simulating what a sync restore does.
    fs.utimesSync(fileA, new Date('2026-01-01'), new Date('2026-01-01'));
    fs.utimesSync(fileB, new Date('2026-06-12'), new Date('2026-06-12'));
    const sessions = await listSessions();
    expect(sessions.map((s: any) => s.sessionId)).toEqual([SID_A, SID_B]);
    expect(sessions[0].lastModified).toBe(Date.parse('2026-06-10T12:00:00Z'));
  });
});

describe('listPastSessions — existing gates still hold', () => {
  it('skips sub-500-byte files and active sessions, dedups by longest slug', async () => {
    // Empty stub (0 bytes)
    const stubDir = path.join(tmpHome, '.claude', 'projects', 'C--home');
    fs.mkdirSync(stubDir, { recursive: true });
    fs.writeFileSync(path.join(stubDir, `${SID_A}.jsonl`), '');
    // Real file for the same id under a longer slug
    writeTranscript('C--home-project-deep', SID_A);
    // Another real file, but active
    writeTranscript('C--proj-beta', SID_B);
    const sessions = await listSessions(new Set([SID_B]));
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe(SID_A);
    expect(sessions[0].projectSlug).toBe('C--home-project-deep');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd desktop && npx vitest run tests/session-browser.test.ts`
Expected: fallback-title and content-timestamp describes FAIL (names come back "Untitled", order follows mtime). The "existing gates" test may already pass.

- [ ] **Step 3: Implement `readTranscriptMeta` in session-browser.ts**

Add to `desktop/src/main/session-browser.ts` (below `readTopic`):

```ts
// Bounded reads so a 100MB transcript doesn't blow up the browse call.
const HEAD_CHUNK_BYTES = 256 * 1024;
const TAIL_CHUNK_BYTES = 64 * 1024;
const FALLBACK_TITLE_MAX = 48;

export interface TranscriptMeta {
  /** Title derived from the first real user prompt, or null. */
  fallbackTitle: string | null;
  /** Timestamp (ms) of the last parseable transcript line, or null. */
  lastTimestampMs: number | null;
}

/** Collapse whitespace and trim a derived title to a word boundary. */
function cleanTitle(text: string): string | null {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (!collapsed) return null;
  if (collapsed.length <= FALLBACK_TITLE_MAX) return collapsed;
  const cut = collapsed.slice(0, FALLBACK_TITLE_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut) + '…';
}

/**
 * Derive display metadata straight from the transcript JSONL.
 *
 * WHY: the topic/index naming pipeline has gaps (the auto-title hook only
 * fires on PostToolUse, so chat-only sessions are never titled; titles also
 * depend on the in-session model complying), and file mtimes are clobbered
 * by sync restores. The transcript content itself is the only source of
 * truth that survives both. See docs/PITFALLS.md → Resume Browser.
 *
 * CC-coupled: relies on the transcript JSONL line shape (`type`, `isMeta`,
 * `promptId`, `timestamp`, `message.content`) — same contract the
 * transcript-watcher parses. See youcoded/docs/cc-dependencies.md.
 */
export async function readTranscriptMeta(jsonlPath: string, wantTitle: boolean): Promise<TranscriptMeta> {
  let fh: fs.promises.FileHandle | null = null;
  try {
    fh = await fs.promises.open(jsonlPath, 'r');
    const { size } = await fh.stat();

    // --- Tail: last parseable line's timestamp ---
    let lastTimestampMs: number | null = null;
    const tailLen = Math.min(TAIL_CHUNK_BYTES, size);
    if (tailLen > 0) {
      const tailBuf = Buffer.alloc(tailLen);
      await fh.read(tailBuf, 0, tailLen, size - tailLen);
      // First "line" of the chunk is usually a partial JSON line — the
      // backwards scan just skips anything that doesn't parse.
      const tailLines = tailBuf.toString('utf8').split('\n');
      for (let i = tailLines.length - 1; i >= 0; i--) {
        const line = tailLines[i];
        if (!line.trim() || line.includes('\x00')) continue;
        try {
          const ts = Date.parse(JSON.parse(line).timestamp);
          if (!Number.isNaN(ts)) { lastTimestampMs = ts; break; }
        } catch { /* partial or corrupt line — keep scanning backwards */ }
      }
    }

    // --- Head: first real user prompt → fallback title ---
    let fallbackTitle: string | null = null;
    if (wantTitle) {
      const headLen = Math.min(HEAD_CHUNK_BYTES, size);
      const headBuf = Buffer.alloc(headLen);
      await fh.read(headBuf, 0, headLen, 0);
      for (const line of headBuf.toString('utf8').split('\n')) {
        if (!line.trim() || line.includes('\x00')) continue;
        let parsed: any;
        try { parsed = JSON.parse(line); } catch { continue; }
        // Same "real conversational prompt" gate as loadHistory: user-type,
        // has promptId, not meta.
        if (parsed.type !== 'user' || parsed.isMeta || !parsed.promptId || !parsed.message) continue;
        const c = parsed.message.content;
        const text = typeof c === 'string'
          ? c
          : Array.isArray(c)
            ? c.filter((b: any) => b.type === 'text').map((b: any) => b.text).join(' ')
            : '';
        // Skip injected wrappers (<command-name>…, <local-command-stdout>…,
        // <system-reminder>…) — they're plumbing, not what the user said.
        if (!text.trim() || text.trim().startsWith('<')) continue;
        fallbackTitle = cleanTitle(text);
        if (fallbackTitle) break;
      }
    }

    return { fallbackTitle, lastTimestampMs };
  } catch {
    return { fallbackTitle: null, lastTimestampMs: null };
  } finally {
    try { await fh?.close(); } catch {}
  }
}
```

- [ ] **Step 4: Integrate into `listPastSessions`**

In `listPastSessions`, replace the per-file mapping body (currently `const name = await readTopic(...)` through the `return {...} as PastSession`) with:

```ts
      try {
        const stat = await withRetry(() => fs.promises.stat(path.join(slugDir, file)));
        if (stat.size < 500) return null;
        const topicName = await readTopic(sessionId, indexMeta.topics);

        // Transcript-derived metadata: content timestamp beats file mtime
        // (sync restores clobber mtimes), and the first user message names
        // sessions the title pipeline missed. readTranscriptMeta returns
        // nulls on any failure, so this can only improve on the defaults.
        const meta = await readTranscriptMeta(path.join(slugDir, file), topicName === 'Untitled');
        const name = topicName !== 'Untitled'
          ? topicName
          : (meta.fallbackTitle ?? 'Untitled');

        const joinedFlags = indexMeta.flags[sessionId];
        return {
          sessionId,
          name,
          projectSlug: slug,
          projectPath: resolveSlugToPath(slug),
          lastModified: meta.lastTimestampMs ?? stat.mtimeMs,
          size: stat.size,
          ...(joinedFlags ? { flags: joinedFlags } : {}),
        } as PastSession;
      } catch {
```

- [ ] **Step 5: Run tests**

Run: `cd desktop && npx vitest run tests/session-browser.test.ts`
Expected: all pass.

- [ ] **Step 6: Run the full desktop suite (regression check)**

Run: `cd desktop && npm test -- --run`
Expected: no new failures (resume-browser-filters tests and others untouched).

- [ ] **Step 7: Commit**

```bash
git add desktop/src/main/session-browser.ts desktop/tests/session-browser.test.ts
git commit -m "feat(resume): fallback titles from first user message + content-timestamp ordering"
```

---

### Task 3: Phantom-id hygiene in the conversation index (desktop)

**Files:**
- Modify: `desktop/src/main/sync-service.ts` (`updateConversationIndex`, ~lines 1617–1684)
- Test: `desktop/tests/sync-service-index-hygiene.test.ts` (new)

**Behavior:**
- Topic scan skips files whose `<id>` part is not a canonical UUID (the auto-title flow has the in-session model hand-type the filename; typos created entries like `3f3a5cccc-…`).
- The prune pass deletes malformed-id entries that carry **no flags** (self-heal). Malformed entries WITH flags are kept — deleting user-set tags is worse than carrying a dead row, and test fixtures/desktop-id seeds may use non-UUID ids.

- [ ] **Step 1: Write the failing tests**

`desktop/tests/sync-service-index-hygiene.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tmpHome: string;
let origHomedir: typeof os.homedir;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'youcoded-idx-hygiene-'));
  origHomedir = os.homedir;
  (os as any).homedir = () => tmpHome;
  fs.mkdirSync(path.join(tmpHome, '.claude', 'topics'), { recursive: true });
});

afterEach(() => {
  (os as any).homedir = origHomedir;
  try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch {}
});

async function freshService() {
  const { vi } = await import('vitest');
  vi.resetModules();
  const mod = await import('../src/main/sync-service');
  return new mod.SyncService();
}

const indexPath = () => path.join(tmpHome, '.claude', 'conversation-index.json');
const readIndex = () => JSON.parse(fs.readFileSync(indexPath(), 'utf8'));

const GOOD_ID = '3f3a5ccc-98cc-4698-a9a5-2a3c643f03c5';
const PHANTOM_ID = '3f3a5cccc-98cc-4698-a9a5-2a3c643f03c5'; // nine c's — real corruption seen 2026-06-12

function writeTopic(id: string, topic: string) {
  fs.writeFileSync(path.join(tmpHome, '.claude', 'topics', `topic-${id}`), topic);
}

describe('updateConversationIndex — phantom id guard', () => {
  it('skips topic files whose session id is not a canonical UUID', async () => {
    const svc = await freshService();
    writeTopic(GOOD_ID, 'Real Session');
    writeTopic(PHANTOM_ID, 'Phantom Session');
    svc.updateConversationIndex();
    const idx = readIndex();
    expect(idx.sessions[GOOD_ID]).toBeTruthy();
    expect(idx.sessions[PHANTOM_ID]).toBeUndefined();
  });

  it('self-heals: deletes existing malformed entries with no flags, keeps flagged ones', async () => {
    fs.writeFileSync(indexPath(), JSON.stringify({
      version: 1,
      sessions: {
        [PHANTOM_ID]: { topic: 'Phantom', lastActive: new Date().toISOString(), slug: '', device: 'x' },
        'sess-with-flag': {
          topic: 'Untitled', lastActive: new Date(0).toISOString(), slug: '', device: 'x',
          flags: { complete: { value: true, updatedAt: new Date().toISOString() } },
        },
        [GOOD_ID]: { topic: 'Real', lastActive: new Date().toISOString(), slug: '', device: 'x' },
      },
    }));
    const svc = await freshService();
    svc.updateConversationIndex();
    const idx = readIndex();
    expect(idx.sessions[PHANTOM_ID]).toBeUndefined();
    expect(idx.sessions['sess-with-flag']).toBeTruthy(); // flagged → kept
    expect(idx.sessions[GOOD_ID]).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd desktop && npx vitest run tests/sync-service-index-hygiene.test.ts`
Expected: FAIL — phantom entries are upserted / not pruned.

- [ ] **Step 3: Implement in sync-service.ts**

Add near the top of `sync-service.ts` (module scope, by the other constants ~line 121):

```ts
// Canonical Claude Code session id. The auto-title flow has the in-session
// model hand-type `echo "Title" > topics/topic-<id>` — a typo'd id creates a
// phantom index entry pointing at no transcript (seen in the wild:
// `3f3a5cccc-…`, nine c's). Gate the topic scan + prune on this shape.
const SESSION_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
```

In `updateConversationIndex`, in the topic-file scan loop, after `const sessionId = file.replace(/^topic-/, '');` add:

```ts
      if (!SESSION_UUID_RE.test(sessionId)) continue; // phantom-id guard
```

And replace the prune loop:

```ts
    // Prune old entries, but skip epoch-sentinel entries (seeded by
    // setSessionFlag before a topic file exists — see that method).
    // Also self-heal phantom entries: malformed session ids that carry no
    // user flags point at no transcript and were created by title-write
    // typos. Flagged malformed entries are kept — deleting a user's tag is
    // worse than carrying a dead row.
    for (const [sid, entry] of Object.entries(index.sessions)) {
      const migrated = migrateEntry(entry);
      const hasFlags = Object.keys(migrated.flags || {}).length > 0;
      if (!SESSION_UUID_RE.test(sid) && !hasFlags) {
        delete index.sessions[sid];
        continue;
      }
      const ts = new Date(entry.lastActive).getTime();
      if (ts === 0) continue;
      if (ts < pruneThreshold) {
        delete index.sessions[sid];
      }
    }
```

- [ ] **Step 4: Run the new tests + the existing tags tests**

Run: `cd desktop && npx vitest run tests/sync-service-index-hygiene.test.ts tests/sync-service-tags.test.ts`
Expected: all pass ('sess-a'-style seeds in the tags tests carry flags, so the self-heal doesn't touch them).

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/sync-service.ts desktop/tests/sync-service-index-hygiene.test.ts
git commit -m "fix(index): reject phantom session ids in topic scan + self-heal flagless malformed entries"
```

---

### Task 4: sessionIdMap follows `/clear` rotation (desktop)

**Files:**
- Create: `desktop/src/main/session-id-mapping.ts`
- Test: `desktop/tests/session-id-mapping.test.ts`
- Modify: `desktop/src/main/ipc-handlers.ts` (~lines 1750–1766, the `hookRelay.on('hook-event')` listener)

**Behavior:** First mapping is adopted from any hook event (unchanged). A REMAP (desktop session already mapped, different claude id) is adopted ONLY from a `SessionStart` hook — CC fires SessionStart when `/clear` rotates the session id mid-PTY. Subagent/tool hooks can carry child session ids and must never remap. On remap, stale topic + transcript watchers for the old id are torn down before new ones start.

- [ ] **Step 1: Write the failing test**

`desktop/tests/session-id-mapping.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveMappingAction } from '../src/main/session-id-mapping';

describe('resolveMappingAction', () => {
  it('adopts the first mapping from any hook event', () => {
    expect(resolveMappingAction(undefined, 'claude-1', 'PostToolUse')).toBe('adopt');
    expect(resolveMappingAction(undefined, 'claude-1', 'SessionStart')).toBe('adopt');
  });

  it('ignores events that match the current mapping', () => {
    expect(resolveMappingAction('claude-1', 'claude-1', 'SessionStart')).toBe('ignore');
    expect(resolveMappingAction('claude-1', 'claude-1', 'PostToolUse')).toBe('ignore');
  });

  it('remaps on SessionStart with a new id (/clear rotation)', () => {
    expect(resolveMappingAction('claude-1', 'claude-2', 'SessionStart')).toBe('adopt');
  });

  it('never remaps from non-SessionStart events (subagent ids must not poison the map)', () => {
    expect(resolveMappingAction('claude-1', 'claude-2', 'PostToolUse')).toBe('ignore');
    expect(resolveMappingAction('claude-1', 'claude-2', 'SubagentStart')).toBe('ignore');
    expect(resolveMappingAction('claude-1', 'claude-2', 'Stop')).toBe('ignore');
    expect(resolveMappingAction('claude-1', 'claude-2', undefined)).toBe('ignore');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd desktop && npx vitest run tests/session-id-mapping.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the helper**

`desktop/src/main/session-id-mapping.ts`:

```ts
// Decision logic for the desktop→Claude session id map in ipc-handlers.ts.
//
// WHY this exists: the map used to be set-once per desktop session, but
// Claude Code rotates its session id mid-PTY on `/clear` (verified: `--resume`
// does NOT rotate — it appends the same file). With a stale mapping, close-time
// flags and topic lookups landed on the pre-/clear session id. Only
// SessionStart is trusted for a REMAP because subagent/tool hook events can
// carry child session ids — adopting those would point flags and topic
// watchers at a subagent transcript.

export type MappingAction = 'adopt' | 'ignore';

export function resolveMappingAction(
  currentClaudeId: string | undefined,
  incomingClaudeId: string,
  hookEventName: string | undefined,
): MappingAction {
  if (!currentClaudeId) return 'adopt';                 // first sighting
  if (currentClaudeId === incomingClaudeId) return 'ignore'; // no change
  return hookEventName === 'SessionStart' ? 'adopt' : 'ignore';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd desktop && npx vitest run tests/session-id-mapping.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewire the listener in ipc-handlers.ts**

Add to the imports at the top of `ipc-handlers.ts`:

```ts
import { resolveMappingAction } from './session-id-mapping';
```

Replace the `hookRelay.on('hook-event', ...)` listener (~lines 1751–1766) with:

```ts
  if (hookRelay) {
    hookRelay.on('hook-event', (event: { sessionId: string; payload: Record<string, unknown> }) => {
      const desktopId = event.sessionId; // _desktop_session_id (set by parseHookPayload)
      const claudeId = event.payload?.session_id as string;
      if (!desktopId || !claudeId) return;

      const current = sessionIdMap.get(desktopId);
      if (resolveMappingAction(current, claudeId, event.payload?.hook_event_name as string) !== 'adopt') return;

      // Remap (e.g. /clear rotated the CC session id): tear down the old
      // topic watcher before starting a new one — startWatching overwrites
      // the topicWatchers entry, which would leak the old interval and keep
      // broadcasting renames from the stale topic file.
      if (current) {
        const oldWatcher = topicWatchers.get(desktopId);
        if (oldWatcher) {
          if (typeof (oldWatcher as fs.FSWatcher).close === 'function') {
            (oldWatcher as fs.FSWatcher).close();
          } else {
            clearInterval(oldWatcher as NodeJS.Timeout);
          }
          topicWatchers.delete(desktopId);
          lastTopics.delete(desktopId);
        }
        transcriptWatcher.stopWatching(desktopId);
      }

      sessionIdMap.set(desktopId, claudeId);
      startWatching(desktopId, claudeId);

      // Start watching the transcript file for this session
      const sessionInfo = sessionManager.getSession(desktopId);
      if (sessionInfo) {
        transcriptWatcher.startWatching(desktopId, claudeId, sessionInfo.cwd);
      }
    });
  }
```

NOTE for the implementer: `topicWatchers`, `lastTopics`, `startWatching`, and `transcriptWatcher` are all in scope at this point in `registerIpcHandlers` — the same identifiers the `session-exit` cleanup below this listener uses. Verify `transcriptWatcher.stopWatching(desktopId)` exists with that signature (it's called the same way in the `session-exit` handler at ~line 1770).

- [ ] **Step 6: Full suite regression**

Run: `cd desktop && npm test -- --run`
Expected: no new failures (ipc-handlers.test.ts and hook-relay.test.ts in particular).

- [ ] **Step 7: Commit**

```bash
git add desktop/src/main/session-id-mapping.ts desktop/tests/session-id-mapping.test.ts desktop/src/main/ipc-handlers.ts
git commit -m "fix(sessions): follow /clear session-id rotation in sessionIdMap (SessionStart-gated)"
```

---

### Task 5: Topic-cache regeneration preserves lastActive mtimes (desktop)

**Files:**
- Modify: `desktop/src/main/sync-service.ts` (`regenerateTopicCache`, ~lines 1928–1941)
- Test: extend `desktop/tests/sync-service-index-hygiene.test.ts`

**Behavior:** Regenerated topic files get `utimes` set to the entry's `lastActive` instead of "now"; placeholder topics (`Untitled` / `New Session`) and entries older than the index prune window are skipped entirely. This breaks the regenerate→rescan feedback loop that bumped every session's `lastActive` on each cycle.

- [ ] **Step 1: Write the failing tests (append to sync-service-index-hygiene.test.ts)**

```ts
describe('regenerateTopicCache — mtime preservation', () => {
  const RECENT = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago

  it('stamps regenerated topic files with the entry lastActive, not now', async () => {
    fs.writeFileSync(indexPath(), JSON.stringify({
      version: 1,
      sessions: {
        [GOOD_ID]: { topic: 'Real Session', lastActive: RECENT.toISOString(), slug: '', device: 'x' },
      },
    }));
    const svc = await freshService();
    svc.regenerateTopicCache();
    const f = path.join(tmpHome, '.claude', 'topics', `topic-${GOOD_ID}`);
    expect(fs.existsSync(f)).toBe(true);
    expect(Math.abs(fs.statSync(f).mtimeMs - RECENT.getTime())).toBeLessThan(2000);
  });

  it('does not bump lastActive when updateConversationIndex runs after a regenerate', async () => {
    fs.writeFileSync(indexPath(), JSON.stringify({
      version: 1,
      sessions: {
        [GOOD_ID]: { topic: 'Real Session', lastActive: RECENT.toISOString(), slug: '', device: 'x' },
      },
    }));
    const svc = await freshService();
    svc.regenerateTopicCache();
    svc.updateConversationIndex();
    const idx = readIndex();
    expect(Math.abs(new Date(idx.sessions[GOOD_ID].lastActive).getTime() - RECENT.getTime())).toBeLessThan(2000);
  });

  it('skips placeholder topics entirely', async () => {
    fs.writeFileSync(indexPath(), JSON.stringify({
      version: 1,
      sessions: {
        [GOOD_ID]: { topic: 'Untitled', lastActive: RECENT.toISOString(), slug: '', device: 'x' },
      },
    }));
    const svc = await freshService();
    svc.regenerateTopicCache();
    expect(fs.existsSync(path.join(tmpHome, '.claude', 'topics', `topic-${GOOD_ID}`))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify the first two fail**

Run: `cd desktop && npx vitest run tests/sync-service-index-hygiene.test.ts`
Expected: mtime test FAILS (mtime ≈ now), lastActive test FAILS (bumped to ≈ now), placeholder test FAILS (file written).

- [ ] **Step 3: Implement**

Replace `regenerateTopicCache` in `sync-service.ts`:

```ts
  /** Create topic cache files from index for cross-device sessions. */
  regenerateTopicCache(): void {
    const index: ConversationIndex = this.readJson(this.conversationIndexPath) || { version: 1, sessions: {} };
    const topicsDir = path.join(this.claudeDir, 'topics');
    fs.mkdirSync(topicsDir, { recursive: true });

    const pruneThreshold = Date.now() - INDEX_PRUNE_DAYS * 24 * 60 * 60 * 1000;

    for (const [sid, entry] of Object.entries(index.sessions || {})) {
      // Placeholder names add nothing — readTopic treats them as missing,
      // and writing them would just churn files the daily prune deletes.
      if (!entry.topic || entry.topic === 'Untitled' || entry.topic === 'New Session') continue;
      const ts = new Date(entry.lastActive).getTime();
      // Entries past the prune window would be created today and deleted by
      // the hook's `find -mtime +30` tomorrow — skip the churn. The index
      // topic fallback in session-browser still names these sessions.
      if (Number.isNaN(ts) || ts <= 0 || ts < pruneThreshold) continue;

      const topicFile = path.join(topicsDir, `topic-${sid}`);
      // Only create if local file doesn't exist (local-first)
      if (!this.fileExists(topicFile)) {
        try {
          fs.writeFileSync(topicFile, entry.topic);
          // Stamp with the entry's real lastActive. Topic-file mtime IS the
          // index's lastActive source (updateConversationIndex upserts when
          // mtime > lastActive) — writing with "now" mtime bumped every
          // session's lastActive on each regenerate, which kept dead entries
          // alive forever and fed the wrong sessions to the recent-50 pull.
          const d = new Date(ts);
          fs.utimesSync(topicFile, d, d);
        } catch {}
      }
    }
  }
```

- [ ] **Step 4: Run the file's tests + full suite**

Run: `cd desktop && npx vitest run tests/sync-service-index-hygiene.test.ts && npm test -- --run`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/sync-service.ts desktop/tests/sync-service-index-hygiene.test.ts
git commit -m "fix(index): regenerateTopicCache preserves lastActive mtimes — stops the rescan bump loop"
```

---

### Task 6: Android parity

**Files:**
- Create: `app/src/main/kotlin/com/youcoded/app/runtime/RetentionDefault.kt`
- Modify: `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` (wire RetentionDefault next to `PromptSuggestionDisabler` ~line 296; derived-title precedence in the `session:browse` handler ~line 1361)
- Modify: `app/src/main/kotlin/com/youcoded/app/runtime/SessionBrowser.kt` (transcript meta mirror)

Before coding, check `app/src/test/` for existing unit-test conventions (JSONObject availability in JVM tests); mirror whatever pattern exists. If `org.json` is not usable in plain unit tests, keep the title-cleaning logic as a pure `String → String?` function and test only that.

- [ ] **Step 1: RetentionDefault.kt**

```kotlin
package com.youcoded.app.runtime

import org.json.JSONObject
import java.io.File

/**
 * Seed `cleanupPeriodDays` into ~/.claude/settings.json when the key is
 * absent. Claude Code deletes transcripts older than this (its default is 30
 * days when unset), which silently destroys Resume Browser history. Mirrors
 * desktop retention-default.ts — only writes when absent, so an explicit user
 * value is respected. Never rewrites a corrupt settings.json (it carries
 * hooks + enabledPlugins; wiping them is worse than skipping the seed).
 */
class RetentionDefault(homeDir: File) {
    private val settingsFile = File(homeDir, ".claude/settings.json")

    companion object {
        const val DEFAULT_DAYS = 365
    }

    /** @return true iff settings.json was rewritten with the seeded default. */
    fun seedIfAbsent(): Boolean {
        return try {
            val root = if (settingsFile.exists()) JSONObject(settingsFile.readText()) else JSONObject()
            if (root.has("cleanupPeriodDays")) return false
            root.put("cleanupPeriodDays", DEFAULT_DAYS)
            settingsFile.parentFile?.mkdirs()
            val tmp = File(settingsFile.parentFile, settingsFile.name + ".tmp")
            tmp.writeText(root.toString(2))
            if (!tmp.renameTo(settingsFile)) settingsFile.writeText(root.toString(2))
            true
        } catch (_: Throwable) {
            false // corrupt/unreadable settings — skip rather than risk wiping hooks
        }
    }
}
```

Wire in `SessionService.kt` immediately after the `PromptSuggestionDisabler` call (~line 296 area), matching its style:

```kotlin
        // Seed transcript retention so CC's 30-day cleanup doesn't delete
        // Resume Browser history. Mirrors desktop retention-default.ts.
        runCatching { RetentionDefault(homeDir).seedIfAbsent() }
```

(Use the same `homeDir` value the PromptSuggestionDisabler receives there.)

- [ ] **Step 2: SessionBrowser.kt — transcript meta mirror**

Add to `SessionBrowser`:

```kotlin
    private const val HEAD_CHUNK = 256 * 1024
    private const val TAIL_CHUNK = 64 * 1024
    private const val FALLBACK_TITLE_MAX = 48

    data class TranscriptMeta(val fallbackTitle: String?, val lastTimestampMs: Long?)

    /** Collapse whitespace and trim to a word boundary. Pure — unit-testable. */
    fun cleanTitle(text: String): String? {
        val collapsed = text.replace(Regex("\\s+"), " ").trim()
        if (collapsed.isEmpty()) return null
        if (collapsed.length <= FALLBACK_TITLE_MAX) return collapsed
        val cut = collapsed.substring(0, FALLBACK_TITLE_MAX)
        val lastSpace = cut.lastIndexOf(' ')
        return (if (lastSpace > 20) cut.substring(0, lastSpace) else cut) + "…"
    }

    /**
     * Derive display metadata from the transcript itself — mirrors desktop
     * readTranscriptMeta(). Content timestamps survive mtime clobbering by
     * sync restores; the first user message names sessions the title
     * pipeline missed. Bounded reads (head 256KB / tail 64KB).
     */
    fun readTranscriptMeta(jsonlFile: File, wantTitle: Boolean): TranscriptMeta {
        var lastTimestampMs: Long? = null
        var fallbackTitle: String? = null
        try {
            val size = jsonlFile.length()
            java.io.RandomAccessFile(jsonlFile, "r").use { raf ->
                // --- tail: last parseable line's timestamp ---
                val tailLen = minOf(TAIL_CHUNK.toLong(), size).toInt()
                if (tailLen > 0) {
                    val buf = ByteArray(tailLen)
                    raf.seek(size - tailLen)
                    raf.readFully(buf)
                    val lines = String(buf, Charsets.UTF_8).split('\n')
                    for (i in lines.indices.reversed()) {
                        val line = lines[i]
                        if (line.isBlank() || line.contains('\u0000')) continue
                        val ts = try {
                            java.time.Instant.parse(JSONObject(line).optString("timestamp")).toEpochMilli()
                        } catch (_: Exception) { continue }
                        lastTimestampMs = ts
                        break
                    }
                }
                // --- head: first real user prompt → fallback title ---
                if (wantTitle) {
                    val headLen = minOf(HEAD_CHUNK.toLong(), size).toInt()
                    val buf = ByteArray(headLen)
                    raf.seek(0)
                    raf.readFully(buf)
                    for (line in String(buf, Charsets.UTF_8).split('\n')) {
                        if (line.isBlank() || line.contains('\u0000')) continue
                        val obj = try { JSONObject(line) } catch (_: Exception) { continue }
                        if (obj.optString("type") != "user") continue
                        if (obj.optBoolean("isMeta", false)) continue
                        if (!obj.has("promptId")) continue
                        val message = obj.optJSONObject("message") ?: continue
                        val content = message.opt("content")
                        val text = when (content) {
                            is String -> content
                            is org.json.JSONArray -> extractTextFromContent(content)
                            else -> continue
                        }
                        // Skip injected wrappers (<command-name>…, <system-reminder>…)
                        if (text.isBlank() || text.trim().startsWith("<")) continue
                        fallbackTitle = cleanTitle(text) ?: continue
                        break
                    }
                }
            }
        } catch (_: Exception) {
            // Unreadable transcript — return whatever we got; callers fall
            // back to mtime + "Untitled".
        }
        return TranscriptMeta(fallbackTitle, lastTimestampMs)
    }
```

Then in `listPastSessions`, change the `PastSession` construction:

```kotlin
                val topicFile = File(topicsDir, "topic-$sessionId")
                val rawName = if (topicFile.exists()) topicFile.readText().trim() else ""
                val name = if (rawName.isBlank() || rawName == "New Session") "Untitled" else rawName

                // Transcript-derived metadata — content timestamp beats file
                // mtime (sync restores clobber mtimes). The derived title is
                // carried SEPARATELY so SessionService can keep the
                // precedence topic > index > derived > Untitled.
                val meta = readTranscriptMeta(jsonlFile, wantTitle = name == "Untitled")

                sessions.add(PastSession(
                    sessionId = sessionId,
                    projectSlug = slug,
                    name = name,
                    derivedTitle = meta.fallbackTitle,
                    lastModified = meta.lastTimestampMs ?: jsonlFile.lastModified(),
                    projectPath = slugToPath(slug),
                    size = jsonlFile.length(),
                ))
```

And extend the data class (additive — JSON payload shape gains an optional field only):

```kotlin
    data class PastSession(
        val sessionId: String,
        val projectSlug: String,
        val name: String,
        /** Title derived from the first user message — used only when both
         *  the topic file and the conversation-index fallback are missing. */
        val derivedTitle: String? = null,
        val lastModified: Long,
        val projectPath: String,
        val size: Long,
    )
```

- [ ] **Step 3: SessionService.kt — precedence in the browse handler**

In the `"session:browse"` handler (~line 1361), locate where the conversation-index topic fallback replaces an "Untitled" name, and extend it so the final precedence is: topic file > index topic > `derivedTitle` > "Untitled". (Read the existing fallback code first — it follows the comment at lines 1374–1376. The change is: after the index lookup still yields "Untitled", use `s.derivedTitle` when non-null.)

- [ ] **Step 4: Build + unit tests**

```bash
cd youcoded/.worktrees/resume-browser-reliability && ./gradlew :app:testDebugUnitTest
```
Expected: compiles, existing tests pass. If `app/src/test` had JSONObject-friendly conventions and a SessionBrowser test was added, it passes too.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/kotlin/com/youcoded/app/runtime/RetentionDefault.kt app/src/main/kotlin/com/youcoded/app/runtime/SessionBrowser.kt app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt
git commit -m "feat(android): retention default + transcript-derived titles/timestamps (resume parity)"
```

---

### Task 7: Documentation

**Files:**
- Modify: `youcoded/docs/cc-dependencies.md` (in the worktree — ships with the app repo)
- Modify: `youcoded-dev/docs/PITFALLS.md` (workspace repo — commit separately to youcoded-dev)

- [ ] **Step 1: cc-dependencies.md — add two entries** (match the file's existing entry format; read it first):
  1. **"Transcript retention (cleanupPeriodDays)"** — `desktop/src/main/retention-default.ts` + `app/.../RetentionDefault.kt` seed this CC settings key. Breaks if CC renames the key or changes deletion semantics.
  2. **"Resume Browser transcript head/tail parse"** — `session-browser.ts::readTranscriptMeta` + `SessionBrowser.kt::readTranscriptMeta` rely on transcript JSONL line shape (`type`, `isMeta`, `promptId`, `timestamp`, `message.content`). Same upstream contract as the transcript-watcher; review on CC transcript-format changes.

- [ ] **Step 2: PITFALLS.md — add a "Resume Browser & Conversation Identity" section** covering:
  - Topic-file mtime IS the index's `lastActive` source — anything that (re)writes topic files MUST preserve the original timestamp (`fs.utimesSync`), or every session's lastActive gets bumped and the index prune + recent-50 pull selection break. `regenerateTopicCache` is the canonical writer; don't add new ones without the utimes stamp.
  - `sessionIdMap` remaps ONLY on `SessionStart` hook events — `/clear` rotates CC's session id mid-PTY (verified 2026-06-12: `--resume` does NOT rotate). Don't loosen the gate: subagent/tool hooks can carry child session ids and would poison the map.
  - Resume Browser name precedence: topic file > conversation-index > derived-from-first-user-message > "Untitled". The derived title and content-timestamp ordering exist because (a) the auto-title hook is PostToolUse-gated (chat-only sessions never fire it) and (b) sync restores clobber file mtimes. Don't "simplify" ordering back to `stat.mtimeMs`.
  - Phantom session ids: the auto-title flow has the model hand-type topic filenames; `SESSION_UUID_RE` gates the index topic scan. If the title mechanism ever changes, keep an id-shape gate.
  - `cleanupPeriodDays` is seeded (365) when absent, on both platforms; an explicit user value is never overwritten.

- [ ] **Step 3: Commit** (app-repo docs in the worktree branch; PITFALLS in youcoded-dev):

```bash
git add docs/cc-dependencies.md && git commit -m "docs(cc-dependencies): retention key + transcript head/tail parse touchpoints"
cd ~/youcoded-dev && git add docs/PITFALLS.md && git commit -m "docs(PITFALLS): resume browser & conversation identity invariants" && git push origin master
```

---

### Task 8: Verification & merge

- [ ] **Step 1: Full desktop suite + build**

```bash
cd youcoded/.worktrees/resume-browser-reliability/desktop && npm test -- --run && npm run build
```
Expected: green.

- [ ] **Step 2: Android compile + tests**

```bash
cd youcoded/.worktrees/resume-browser-reliability && ./gradlew :app:testDebugUnitTest
```
Expected: green.

- [ ] **Step 3: Live dev verification** (`bash scripts/run-dev.sh` from the workspace root — NEVER the installed app):
  - Open the Resume Browser: previously-"Untitled" sessions now show derived titles; ordering matches actual conversation recency (the 6/11-restored rows sink to their real dates).
  - Create a session, send one chat-only message (no tools), close it, reopen Resume Browser → it appears, named from the message.
  - `~/.claude/settings.json` now contains `cleanupPeriodDays: 365` (dev shares `~/.claude` — this is the intended effect, it protects the real install too).
  - Shut the dev instance down afterwards.

- [ ] **Step 4: Code review, then merge AND push** (merge means merge + push):

```bash
cd youcoded/.worktrees/resume-browser-reliability && git push -u origin fix/resume-browser-reliability
# open PR or merge per repo convention, then after it lands on origin/master:
cd ~/youcoded-dev/youcoded && git checkout master && git pull origin master
git worktree remove .worktrees/resume-browser-reliability && git branch -D fix/resume-browser-reliability
```

---

## Out of scope (deferred to the backup-logic evaluation)

- Background conversations pull SIGTERM-timeout (600s) — chunked/per-slug pulls.
- Push-side mtime preservation through the snapshot copy.
- Remote-server cache headers for the served bundle.
- Restoring the 221 already-deleted conversations from the Drive backup.
