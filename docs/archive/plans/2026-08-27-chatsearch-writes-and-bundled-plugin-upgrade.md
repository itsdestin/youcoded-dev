---
status: shipped
created: 2026-08-27
spec: docs/archive/specs/2026-08-27-chatsearch-writes-and-bundled-plugin-upgrade-design.md
---

# Chat Search writes + bundled-skill upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The chatsearch skill can mark conversations complete and bulk-manage tags/notes through a file outbox the app drains; bundled skills upgrade at launch when their `plugin.json` version is newer.

**Architecture:** Two independent tracks, each its own worktree/branch, mergeable separately. **Track A** — the CLI (`wecoded-marketplace/youcoded-chatsearch`) writes `~/.youcoded/chatsearch/outbox/<uuid>.json`; a new desktop module `chatsearch-index/outbox-drain.ts` watches the folder, applies each op through `noteFlagChanged` / `noteSessionNote` / `getTagRegistry()`, fires the same broadcasts the IPC handlers fire, and writes `done/<uuid>.ack.json`. **Track B** — `LocalSkillProvider.reconcileBundledPlugins()` replaces `ensureBundledPluginsInstalled()`: refresh the private cache clone (1 h gate), compare `plugin.json` versions, upgrade via temp-dir + rename; Android port; `${CLAUDE_PLUGIN_ROOT}` substitution in the native harness; marketplace `sync.js` copies each plugin's `plugin.json` version into the index so the app and the listing agree on ONE number; marketplace CI guard.

**Tech Stack:** TypeScript (Electron main), Node ESM (CLI, `node --test`), Vitest, Kotlin (Android, JUnit4), GitHub Actions.

## Global Constraints

- Desktop `master` checkout in `youcoded/` is ~146 commits behind `origin/master`. **Create every worktree from `origin/master`**: `git -C youcoded fetch origin && git -C youcoded worktree add ../worktrees/<name> -b <branch> origin/master`. Copy deps with `cp -al youcoded/desktop/node_modules worktrees/<name>/desktop/node_modules` (never symlink).
- Verify desktop changes with `bash scripts/verify.sh worktrees/<name>` before claiming done. Android: `cd worktrees/<name> && ./gradlew :app:testDebugUnitTest --tests "<class>"` (never `bundleWebUi` in a linked worktree — pass `-x bundleWebUi`).
- Every non-trivial edit carries a `// WHY:` comment (Destin reads code through comments).
- Error strings are specific and accurate, or general and non-committal — never a guessed cause (`docs/error-message-standards.md`).
- Outbox request/receipt format `v: 1`; index meta format stays `CHATSEARCH_FORMAT_VERSION = 1` (additive field only).
- Note cap: 8,000 characters (matches `SESSION_SET_NOTE`). Receipt wait: 2,000 ms, 50 ms poll. Receipt retention: 24 h. Stale `processing/` recovery: 10 min. Poll fallback: 5 s. Marketplace cache refresh gate: 1 h (the existing `CACHE_REFRESH_MS`).
- **One version number per plugin.** `plugin.json` is the source of truth; `index.json` copies it (B7). The app never compares a `plugin.json` version against a synthetic index version — the renderer's "Update available" badge compares the package record against the index, so both must live in the same space or every bundled plugin shows a badge it cannot clear (its Update button is disabled).
- `note` **append** is idempotent: a request whose dated line is already in the note reports `already`. A retried `close` must never double-append.
- Dev-instance rule: non-empty `process.env.YOUCODED_PROFILE` ⇒ dev. Overrides: `YOUCODED_CHATSEARCH_OUTBOX=1` (drain anyway), `YOUCODED_BUNDLED_UPGRADE=1` (reconcile anyway).
- Never `git pull`/`reset` `~/.claude/plugins/marketplaces/youcoded/`. Only the cache clone `~/.claude/youcoded-marketplace-cache/wecoded-marketplace/` is refreshed.
- Commit only by explicit path (`git add <file>`), never `-A` — other sessions keep untracked files around.
- Plugin version for this release: `youcoded-chatsearch` `0.1.0 → 0.2.0`.

---

## File map

**Track A — desktop (`youcoded/desktop/`)**
- Modify `src/main/chatsearch-index/index-format.ts` — `storeRoot` on `ChatsearchMetaFile`
- Modify `src/main/chatsearch-index/meta-builder.ts`, `index-service.ts` — thread `storeRoot`
- Modify `src/main/ipc-handlers.ts` — export `broadcastSessionMeta`
- Create `src/main/chatsearch-index/outbox-format.ts` — request/receipt types + parser
- Create `src/main/chatsearch-index/outbox-drain.ts` — watcher, claim, apply, receipt, sweep
- Modify `src/main/main.ts` — start/stop
- Create `tests/chatsearch-outbox.test.ts`; modify `tests/chatsearch-meta-builder.test.ts`

**Track A — CLI (`wecoded-marketplace/youcoded-chatsearch/`)**
- Modify `skills/chatsearch/scripts/chatsearch.js` — `flag`, `tag`, `note`, `close`, `receipt`
- Modify `tests/chatsearch.test.js`, `skills/chatsearch/SKILL.md`, `plugin.json`

**Track B — desktop**
- Create `src/shared/version-compare.ts`; modify `src/renderer/state/marketplace-context.tsx`
- Modify `src/main/plugin-installer.ts` — `readPluginVersion`, `refreshLocalMarketplaceCache`, `upgradePluginFromLocal`, `runGit` error passthrough; real version in registry
- Modify `src/main/skill-provider.ts` — `reconcileBundledPlugins`, fixed `install()`/`update()`
- Modify `src/shared/types.ts` — `SkillEntry.sourceMarketplace`
- Modify `src/main/harness/skills/skill-catalog.ts` — `${CLAUDE_PLUGIN_ROOT}`
- Create `tests/version-compare.test.ts`, `tests/plugin-installer-upgrade.test.ts`, `tests/skill-catalog-plugin-root.test.ts`; rewrite `tests/skill-provider-bundled.test.ts`; extend `tests/bundled-plugins-parity.test.ts`

**Track B — Android (`youcoded/app/src/main/kotlin/com/youcoded/app/skills/`)**
- Create `VersionCompare.kt`; modify `PluginInstaller.kt`, `LocalSkillProvider.kt`; create `app/src/test/kotlin/com/youcoded/app/skills/PluginInstallerUpgradeTest.kt`

**Track B — marketplace (`wecoded-marketplace/`)**
- Modify `.github/workflows/validate-plugin-pr.yml` (B6), `scripts/sync.js` (B7)

---

# Track A — the write path

Worktree: `worktrees/chatsearch-writes`, branch `feat/chatsearch-outbox`. CLI work happens in `wecoded-marketplace/` on branch `feat/chatsearch-writes` (that repo is small; a worktree is optional).

### Task A1: Index meta records its `storeRoot`

**Files:**
- Modify: `src/main/chatsearch-index/index-format.ts:45-50`
- Modify: `src/main/chatsearch-index/meta-builder.ts:40-90`
- Modify: `src/main/chatsearch-index/index-service.ts` (`RefreshInput` at :46, the `buildMetaFile` call ~:147-155, `refreshFromLiveState` ~:215)
- Test: `tests/chatsearch-meta-builder.test.ts`, `tests/chatsearch-index-service.test.ts`

**Interfaces:**
- Produces: `ChatsearchMetaFile.storeRoot: string` (absolute path of the conversation store the index was built from). The CLI copies it into every request; the drainer refuses requests whose `storeRoot` ≠ its own.

- [ ] **Step 1: Failing test — meta file carries storeRoot**

Append to `tests/chatsearch-meta-builder.test.ts` (use the file's existing `buildMetaFile` input helper; add `storeRoot: '/tmp/store'` to it):

```ts
it('records the store root the index was built from', () => {
  const meta = buildMetaFile({ ...baseInput(), storeRoot: '/tmp/store' });
  expect(meta.storeRoot).toBe('/tmp/store');
});
```

- [ ] **Step 2: Run — expect FAIL** (`npx vitest run tests/chatsearch-meta-builder.test.ts` → TypeScript error or `undefined`).

- [ ] **Step 3: Implement**

`index-format.ts` — add to `ChatsearchMetaFile` after `refreshedAt`:
```ts
  /** Absolute path of the conversation store this index mirrors. WHY: the CLI
   *  stamps it into outbox requests so an app instance with a DIFFERENT store
   *  (a run-dev.sh copy sharing ~/.youcoded) leaves the request alone. Additive —
   *  format version stays 1; the CLI ignores fields it doesn't know. */
  storeRoot: string;
```
`meta-builder.ts` — add `storeRoot: string` to `BuildMetaInput`; in the return object add `storeRoot: input.storeRoot,` after `refreshedAt`.
`index-service.ts` — add `storeRoot: string` to `RefreshInput`; pass `storeRoot: input.storeRoot` where `buildMetaFile` is called; in `refreshFromLiveState`, where `homeRoot`/`lanes` are assembled, add `storeRoot: store.root()`.

Update `tests/chatsearch-index-service.test.ts` calls to `refreshChatsearchIndex({...})` to include `storeRoot: tmp`.

- [ ] **Step 4: Run both test files — expect PASS.** Then `npx tsc --noEmit -p .` clean.

- [ ] **Step 5: Commit**
```bash
git add src/main/chatsearch-index/index-format.ts src/main/chatsearch-index/meta-builder.ts src/main/chatsearch-index/index-service.ts tests/chatsearch-meta-builder.test.ts tests/chatsearch-index-service.test.ts
git commit -m "feat(chatsearch): index meta records the store root it mirrors"
```

### Task A2: Export a session-meta broadcaster from ipc-handlers

**Files:**
- Modify: `src/main/ipc-handlers.ts` (module top-level; and inside `registerIpcHandlers` near :3132 where `remoteServer?.setSessionMetaWiring` is called)
- Test: covered by A3's mock; add no new test (it is wiring).

**Interfaces:**
- Produces: `export function broadcastSessionMeta(sessionId: string, payload: { flag: string; value: boolean } | { note: string }): void` — sends `SESSION_META_CHANGED` to the renderer window(s) and the remote server, exactly as `SESSION_SET_FLAG` does at :3191-3195. Does **not** call `emitConversationMetaChanged()` (the caller does, once per request).

- [ ] **Step 1: Implement**

At module top level (after imports):
```ts
// WHY: the chatsearch outbox drainer lives outside registerIpcHandlers but must
// fire the SAME renderer + remote broadcast the IPC tag/flag/note handlers fire,
// or the conversation list won't repaint when the CLI changes something.
// sendForSession and remoteServer are function-local, so the handler registers
// this bridge at startup — same hand-out pattern as setSessionMetaWiring.
type MetaBroadcaster = (sessionId: string, payload: Record<string, unknown>) => void;
let metaBroadcaster: MetaBroadcaster | null = null;
export function broadcastSessionMeta(sessionId: string, payload: { flag: string; value: boolean } | { note: string }): void {
  metaBroadcaster?.(sessionId, payload);
}
```
Inside `registerIpcHandlers`, immediately after the `sendForSession` const (:225):
```ts
  metaBroadcaster = (sessionId, payload) => {
    sendForSession(sessionId, IPC.SESSION_META_CHANGED, sessionId, payload);
    remoteServer?.broadcast({ type: IPC.SESSION_META_CHANGED, payload: { sessionId, ...payload } });
  };
```

- [ ] **Step 2: `npx tsc --noEmit -p .` clean; `npx vitest run tests/ipc-channels.test.ts` PASS.**

- [ ] **Step 3: Commit**
```bash
git add src/main/ipc-handlers.ts
git commit -m "feat(ipc): export broadcastSessionMeta for out-of-handler metadata writers"
```

### Task A3: Outbox format + drainer

**Files:**
- Create: `src/main/chatsearch-index/outbox-format.ts`
- Create: `src/main/chatsearch-index/outbox-drain.ts`
- Test: `tests/chatsearch-outbox.test.ts`

**Interfaces:**
- Consumes: `noteFlagChanged`, `noteSessionNote`, `getConversationStore`, `emitConversationMetaChanged` (`conversations/service`); `getTagRegistry` (`conversations/tag-registry-service`); `broadcastSessionMeta` (A2); `tagFlagKey`, `DEFAULT_TAG_COLOR` (`shared/tags`); `chatsearchDir` (`index-store`).
- Produces:
  - `outboxDir(homeRoot): string` = `<chatsearchDir>/outbox`
  - `parseOutboxRequest(raw: string): { ok: true; req: OutboxRequest } | { ok: false; error: string }`
  - `applyOutboxRequest(req, deps): Promise<OutboxReceipt>`
  - `drainOutboxOnce(opts): Promise<number>` (files handled)
  - `startOutboxDrain(opts?)`, `stopOutboxDrain()`

- [ ] **Step 1: Write `outbox-format.ts`**

```ts
// Outbox protocol between the chatsearch CLI and the app. Spec: docs/active/specs/
// 2026-08-27-chatsearch-writes-and-bundled-plugin-upgrade-design.md §A2.
// WHY a file protocol: the CLI can't reach the running app (no auth-free local
// endpoint), direct store edits would race the app's in-memory records, and a
// mailbox works when the app is closed (drained at launch).
export const OUTBOX_FORMAT_VERSION = 1;
export const NOTE_MAX_CHARS = 8000; // matches SESSION_SET_NOTE

export interface OutboxTarget { provider: string; id: string }
export type OutboxOp =
  | { op: 'flag'; targets: OutboxTarget[]; flag: 'complete' | 'priority'; value: boolean }
  | { op: 'note'; targets: OutboxTarget[]; mode: 'set' | 'append'; text: string }
  | { op: 'tag'; targets: OutboxTarget[]; add: string[]; remove: string[]; create: boolean };

export interface OutboxRequest {
  v: number; id: string; createdAt: string; storeRoot: string; ops: OutboxOp[];
}

export type ReceiptStatus = 'applied' | 'already' | 'not-found' | 'refused' | 'error';
export interface ReceiptResult extends OutboxTarget { op: OutboxOp['op']; status: ReceiptStatus; error?: string }
export interface OutboxReceipt {
  v: number; id: string; appliedAt: string; appVersion: string;
  results: ReceiptResult[]; createdTags: Array<{ id: string; label: string }>;
  error?: string; // only when the request itself was unusable
}

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const UUID_RE = /^[0-9a-f-]{8,64}$/i;

function parseTargets(v: unknown): OutboxTarget[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const out: OutboxTarget[] = [];
  for (const t of v) {
    if (!isRec(t) || typeof t.provider !== 'string' || typeof t.id !== 'string' || !t.id) return null;
    out.push({ provider: t.provider, id: t.id });
  }
  return out;
}

export function parseOutboxRequest(raw: string): { ok: true; req: OutboxRequest } | { ok: false; error: string } {
  let j: unknown;
  try { j = JSON.parse(raw); } catch (e: any) { return { ok: false, error: `request is not valid JSON — ${e?.message ?? String(e)}` }; }
  if (!isRec(j)) return { ok: false, error: 'request is not a JSON object' };
  if (j.v !== OUTBOX_FORMAT_VERSION) return { ok: false, error: `unsupported request version ${String(j.v)} (this app reads v${OUTBOX_FORMAT_VERSION})` };
  if (typeof j.id !== 'string' || !UUID_RE.test(j.id)) return { ok: false, error: 'request id is missing or malformed' };
  if (typeof j.storeRoot !== 'string' || !j.storeRoot) return { ok: false, error: 'request has no storeRoot' };
  if (!Array.isArray(j.ops) || j.ops.length === 0) return { ok: false, error: 'request has no ops' };
  const ops: OutboxOp[] = [];
  for (const o of j.ops) {
    if (!isRec(o)) return { ok: false, error: 'an op is not an object' };
    const targets = parseTargets(o.targets);
    if (!targets) return { ok: false, error: `op "${String(o.op)}" has no valid targets` };
    if (o.op === 'flag') {
      if (o.flag !== 'complete' && o.flag !== 'priority') return { ok: false, error: `unknown flag "${String(o.flag)}"` };
      if (typeof o.value !== 'boolean') return { ok: false, error: 'flag value must be true or false' };
      ops.push({ op: 'flag', targets, flag: o.flag, value: o.value });
    } else if (o.op === 'note') {
      if (o.mode !== 'set' && o.mode !== 'append') return { ok: false, error: `note mode must be set or append, got "${String(o.mode)}"` };
      if (typeof o.text !== 'string') return { ok: false, error: 'note text must be a string' };
      ops.push({ op: 'note', targets, mode: o.mode, text: o.text });
    } else if (o.op === 'tag') {
      const strs = (x: unknown) => Array.isArray(x) && x.every((s) => typeof s === 'string') ? (x as string[]) : null;
      const add = strs(o.add ?? []); const remove = strs(o.remove ?? []);
      if (!add || !remove) return { ok: false, error: 'tag add/remove must be arrays of strings' };
      if (add.length === 0 && remove.length === 0) return { ok: false, error: 'tag op adds and removes nothing' };
      ops.push({ op: 'tag', targets, add, remove, create: o.create === true });
    } else {
      return { ok: false, error: `unknown op "${String(o.op)}"` };
    }
  }
  return { ok: true, req: { v: 1, id: j.id, createdAt: typeof j.createdAt === 'string' ? j.createdAt : '', storeRoot: j.storeRoot, ops } };
}

/** append formatting: blank note → just the line; else two newlines then the line. */
export function appendNoteText(existing: string, day: string, text: string): string {
  const line = `${day}: ${text}`;
  return existing.trim() ? `${existing}\n\n${line}` : line;
}

/** WHY: a retried `close` (the CLI timed out, the assistant re-sent it) must not
 *  append the same line twice. Matched on the text alone — a retry after
 *  midnight carries a different date. */
export function hasDatedLine(existing: string, text: string): boolean {
  return existing.split('\n').some((l) => /^\d{4}-\d{2}-\d{2}: /.test(l) && l.slice(12) === text);
}
```

- [ ] **Step 2: Failing tests — write `tests/chatsearch-outbox.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// WHY these mocks and not fs: the drainer's contract is "apply through the real
// store functions and broadcast" — we assert on the calls, and use real files
// in a tmp home for the mailbox itself (same rule as chatsearch-index-reschedule).
const flagCalls: any[] = []; const noteCalls: any[] = []; const broadcasts: any[] = [];
let metaChanged = 0; let storeAvailable = true;
const records = new Map<string, { note: string; flags: Record<string, { value: boolean }> }>();
vi.mock('../src/main/conversations/service', () => ({
  getConversationStore: () => storeAvailable ? {
    root: () => '/store/A',
    get: async (_p: string, id: string) => records.get(id) ?? null,
  } : null,
  noteFlagChanged: async (id: string, flag: string, value: boolean) => { flagCalls.push([id, flag, value]); return { ok: true }; },
  noteSessionNote: async (id: string, note: string) => { noteCalls.push([id, note]); return { ok: true }; },
  emitConversationMetaChanged: () => { metaChanged++; },
}));
const tags = [{ id: 'tag_1', label: 'sync', color: 'tag-blue', archived: false, createdAt: '' }];
const created: any[] = [];
vi.mock('../src/main/conversations/tag-registry-service', () => ({
  getTagRegistry: () => ({
    list: async () => tags,
    create: async (label: string, color: string) => { const t = { id: `tag_${label}`, label, color, archived: false, createdAt: '' }; tags.push(t); created.push(t); return t; },
  }),
}));
vi.mock('../src/main/ipc-handlers', () => ({ broadcastSessionMeta: (id: string, p: any) => { broadcasts.push([id, p]); } }));

import { parseOutboxRequest, appendNoteText, hasDatedLine } from '../src/main/chatsearch-index/outbox-format';
import { applyOutboxRequest, drainOutboxOnce, outboxDir } from '../src/main/chatsearch-index/outbox-drain';

let home: string;
const req = (ops: any[], extra: Partial<any> = {}) => ({
  v: 1, id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-27T00:00:00.000Z', storeRoot: '/store/A', ops, ...extra,
});
const T = [{ provider: 'claude', id: 'c1' }];

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-outbox-'));
  flagCalls.length = 0; noteCalls.length = 0; broadcasts.length = 0; created.length = 0; metaChanged = 0; storeAvailable = true;
  records.clear();
  records.set('c1', { note: '', flags: {} });
  records.set('c2', { note: 'old', flags: { complete: { value: true } } });
});
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); });

describe('parseOutboxRequest', () => {
  it('rejects non-JSON with the parser message', () => {
    const r = parseOutboxRequest('{nope');
    expect(r.ok).toBe(false); if (!r.ok) expect(r.error).toMatch(/not valid JSON/);
  });
  it('rejects a wrong version', () => {
    const r = parseOutboxRequest(JSON.stringify(req([{ op: 'flag', targets: T, flag: 'complete', value: true }], { v: 2 })));
    expect(r.ok).toBe(false); if (!r.ok) expect(r.error).toMatch(/version 2/);
  });
  it('accepts a well-formed request', () => {
    const r = parseOutboxRequest(JSON.stringify(req([{ op: 'tag', targets: T, add: ['sync'] }])));
    expect(r.ok).toBe(true);
  });
});

describe('appendNoteText', () => {
  it('no leading newlines on an empty note', () => { expect(appendNoteText('', '2026-08-27', 'x')).toBe('2026-08-27: x'); });
  it('two newlines after an existing note', () => { expect(appendNoteText('old', '2026-08-27', 'x')).toBe('old\n\n2026-08-27: x'); });
});

describe('hasDatedLine', () => {
  it('matches on the text, whatever the date', () => {
    expect(hasDatedLine('old\n\n2026-08-26: superseded', 'superseded')).toBe(true);
    expect(hasDatedLine('old\n\n2026-08-26: superseded by X', 'superseded')).toBe(false);
    expect(hasDatedLine('superseded', 'superseded')).toBe(false); // undated body text is not a dated line
  });
});

describe('applyOutboxRequest', () => {
  const deps = { appVersion: '9.9.9', today: () => '2026-08-27' };
  it('flag applies through noteFlagChanged and broadcasts', async () => {
    const rc = await applyOutboxRequest(req([{ op: 'flag', targets: T, flag: 'complete', value: true }]) as any, deps);
    expect(rc.results).toEqual([{ provider: 'claude', id: 'c1', op: 'flag', status: 'applied' }]);
    expect(flagCalls).toEqual([['c1', 'complete', true]]);
    expect(broadcasts).toEqual([['c1', { flag: 'complete', value: true }]]);
    expect(metaChanged).toBe(1);
  });
  it('flag reports already when unchanged, and does not write', async () => {
    const rc = await applyOutboxRequest(req([{ op: 'flag', targets: [{ provider: 'claude', id: 'c2' }], flag: 'complete', value: true }]) as any, deps);
    expect(rc.results[0].status).toBe('already'); expect(flagCalls).toEqual([]);
  });
  it('unknown id is not-found and the batch continues', async () => {
    const rc = await applyOutboxRequest(req([{ op: 'flag', targets: [{ provider: 'claude', id: 'zz' }, ...T], flag: 'priority', value: true }]) as any, deps);
    expect(rc.results.map((r) => r.status)).toEqual(['not-found', 'applied']);
  });
  it('note set replaces; append adds a dated line', async () => {
    await applyOutboxRequest(req([{ op: 'note', targets: T, mode: 'set', text: 'hello' }]) as any, deps);
    await applyOutboxRequest(req([{ op: 'note', targets: [{ provider: 'claude', id: 'c2' }], mode: 'append', text: 'superseded' }]) as any, deps);
    expect(noteCalls).toEqual([['c1', 'hello'], ['c2', 'old\n\n2026-08-27: superseded']]);
    expect(broadcasts[1]).toEqual(['c2', { note: 'old\n\n2026-08-27: superseded' }]);
  });
  it('append past 8000 chars is refused, not truncated', async () => {
    records.set('c1', { note: 'x'.repeat(7990), flags: {} });
    const rc = await applyOutboxRequest(req([{ op: 'note', targets: T, mode: 'append', text: 'y'.repeat(20) }]) as any, deps);
    expect(rc.results[0].status).toBe('refused'); expect(rc.results[0].error).toMatch(/8000/); expect(noteCalls).toEqual([]);
  });
  it('append is idempotent — a line already in the note reports already and writes nothing', async () => {
    records.set('c1', { note: 'old\n\n2026-08-26: superseded', flags: {} });
    const rc = await applyOutboxRequest(req([{ op: 'note', targets: T, mode: 'append', text: 'superseded' }]) as any, deps);
    expect(rc.results[0].status).toBe('already'); expect(noteCalls).toEqual([]);
  });
  it('no store → every target is an error, never not-found', async () => {
    storeAvailable = false;
    const rc = await applyOutboxRequest(req([{ op: 'flag', targets: T, flag: 'complete', value: true }]) as any, deps);
    expect(rc.results[0]).toMatchObject({ status: 'error', error: expect.stringMatching(/storage is not available/) });
    expect(flagCalls).toEqual([]);
  });
  it('unknown tag is refused with the existing labels; create:true creates once', async () => {
    const r1 = await applyOutboxRequest(req([{ op: 'tag', targets: T, add: ['perms'], remove: [] }]) as any, deps);
    expect(r1.results[0].status).toBe('refused'); expect(r1.results[0].error).toMatch(/unknown tag "perms" — existing tags: sync/);
    const r2 = await applyOutboxRequest(req([{ op: 'tag', targets: [{ provider: 'claude', id: 'c1' }, { provider: 'claude', id: 'c2' }], add: ['perms'], remove: [], create: true }]) as any, deps);
    expect(created).toHaveLength(1); expect(r2.createdTags).toEqual([{ id: 'tag_perms', label: 'perms' }]);
    expect(flagCalls).toEqual([['c1', 'tag:tag_perms', true], ['c2', 'tag:tag_perms', true]]);
  });
  it('tag matches labels case-insensitively and removes via value:false', async () => {
    records.set('c1', { note: '', flags: { 'tag:tag_1': { value: true } } });
    const rc = await applyOutboxRequest(req([{ op: 'tag', targets: T, add: [], remove: ['SYNC'] }]) as any, deps);
    expect(rc.results[0].status).toBe('applied'); expect(flagCalls).toEqual([['c1', 'tag:tag_1', false]]);
  });
});

describe('drainOutboxOnce', () => {
  const write = (name: string, body: unknown) => {
    const dir = outboxDir(home); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), typeof body === 'string' ? body : JSON.stringify(body));
  };
  const opts = () => ({ homeRoot: home, storeRoot: '/store/A', isDevInstance: false, appVersion: '9.9.9', today: () => '2026-08-27' });
  it('applies a request and writes a receipt; processing is emptied', async () => {
    write('11111111-2222-3333-4444-555555555555.json', req([{ op: 'flag', targets: T, flag: 'complete', value: true }]));
    expect(await drainOutboxOnce(opts())).toBe(1);
    const ack = JSON.parse(fs.readFileSync(path.join(outboxDir(home), 'done', '11111111-2222-3333-4444-555555555555.ack.json'), 'utf8'));
    expect(ack.results[0].status).toBe('applied');
    expect(fs.readdirSync(path.join(outboxDir(home), 'processing'))).toEqual([]);
  });
  it('malformed file gets an error receipt', async () => {
    write('22222222-2222-3333-4444-555555555555.json', '{nope');
    await drainOutboxOnce(opts());
    const ack = JSON.parse(fs.readFileSync(path.join(outboxDir(home), 'done', '22222222-2222-3333-4444-555555555555.ack.json'), 'utf8'));
    expect(ack.error).toMatch(/not valid JSON/); expect(ack.results).toEqual([]);
  });
  it('a request for another store is left in outbox untouched', async () => {
    write('33333333-2222-3333-4444-555555555555.json', req([{ op: 'flag', targets: T, flag: 'complete', value: true }], { storeRoot: '/store/B' }));
    expect(await drainOutboxOnce(opts())).toBe(0);
    expect(fs.existsSync(path.join(outboxDir(home), '33333333-2222-3333-4444-555555555555.json'))).toBe(true);
    expect(flagCalls).toEqual([]);
  });
  it('a dev instance never drains unless overridden', async () => {
    write('44444444-2222-3333-4444-555555555555.json', req([{ op: 'flag', targets: T, flag: 'complete', value: true }]));
    expect(await drainOutboxOnce({ ...opts(), isDevInstance: true })).toBe(0);
    expect(await drainOutboxOnce({ ...opts(), isDevInstance: true, devOverride: true })).toBe(1);
  });
  it('stale processing entries are recovered', async () => {
    const proc = path.join(outboxDir(home), 'processing'); fs.mkdirSync(proc, { recursive: true });
    const p = path.join(proc, '55555555-2222-3333-4444-555555555555.json');
    fs.writeFileSync(p, JSON.stringify(req([{ op: 'flag', targets: T, flag: 'complete', value: true }])));
    const old = new Date(Date.now() - 11 * 60_000); fs.utimesSync(p, old, old);
    expect(await drainOutboxOnce(opts())).toBe(1);
  });
  it('receipts older than 24h are swept', async () => {
    const done = path.join(outboxDir(home), 'done'); fs.mkdirSync(done, { recursive: true });
    const p = path.join(done, 'old.ack.json'); fs.writeFileSync(p, '{}');
    const old = new Date(Date.now() - 25 * 3600_000); fs.utimesSync(p, old, old);
    await drainOutboxOnce(opts());
    expect(fs.existsSync(p)).toBe(false);
  });
  it('a file another instance already claimed is skipped, not applied twice', async () => {
    // WHY not two drainers in Promise.all: everything up to the rename claim is
    // synchronous, so the second call would always see an empty folder and the
    // test would pass without exercising the race. Simulate the loser instead.
    write('66666666-2222-3333-4444-555555555555.json', req([{ op: 'flag', targets: T, flag: 'complete', value: true }]));
    const proc = path.join(outboxDir(home), 'processing'); fs.mkdirSync(proc, { recursive: true });
    fs.renameSync(path.join(outboxDir(home), '66666666-2222-3333-4444-555555555555.json'), path.join(proc, '66666666-2222-3333-4444-555555555555.json'));
    expect(await drainOutboxOnce(opts())).toBe(0);
    expect(flagCalls).toEqual([]);
  });
});
```

- [ ] **Step 3: Run — expect FAIL** (`npx vitest run tests/chatsearch-outbox.test.ts` → cannot resolve `outbox-drain`).

- [ ] **Step 4: Write `outbox-drain.ts`**

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import { chatsearchDir } from './index-store';
import {
  NOTE_MAX_CHARS, OUTBOX_FORMAT_VERSION, parseOutboxRequest, appendNoteText, hasDatedLine,
  type OutboxRequest, type OutboxReceipt, type ReceiptResult, type OutboxTarget,
} from './outbox-format';
import { getConversationStore, noteFlagChanged, noteSessionNote, emitConversationMetaChanged } from '../conversations/service';
import { getTagRegistry } from '../conversations/tag-registry-service';
import { broadcastSessionMeta } from '../ipc-handlers';
import { tagFlagKey, DEFAULT_TAG_COLOR } from '../../shared/tags';
import { log } from '../logger';

const POLL_MS = 5_000;
const RECEIPT_TTL_MS = 24 * 3600_000;
const PROCESSING_STALE_MS = 10 * 60_000;
type Store = NonNullable<ReturnType<typeof getConversationStore>>;
const STORE_DOWN = 'conversation storage is not available right now — retry with YouCoded open';

export function outboxDir(homeRoot: string): string { return path.join(chatsearchDir(homeRoot), 'outbox'); }

export interface ApplyDeps { appVersion: string; today: () => string }
export interface DrainOpts extends ApplyDeps {
  homeRoot: string; storeRoot: string; isDevInstance: boolean; devOverride?: boolean;
}

function writeJsonAtomic(target: string, value: unknown): void {
  const tmp = `${target}.tmp-${process.pid}`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, target);
}

async function applyFlag(store: Store, t: OutboxTarget, flagKey: string, value: boolean): Promise<ReceiptResult> {
  const rec = await store.get(t.provider, t.id);
  if (!rec) return { ...t, op: 'flag', status: 'not-found' };
  const current = rec.flags?.[flagKey]?.value === true;
  if (current === value) return { ...t, op: 'flag', status: 'already' };
  // WHY knownNative=false: the drainer never sees live desktop ids, so the
  // store probe inside noteFlagChanged is the right provider decision.
  const res = await noteFlagChanged(t.id, flagKey, value, t.provider === 'native');
  if (!res.ok) return { ...t, op: 'flag', status: 'error', error: 'Could not save — conversation storage is not available on this device.' };
  broadcastSessionMeta(t.id, { flag: flagKey, value });
  return { ...t, op: 'flag', status: 'applied' };
}

export async function applyOutboxRequest(req: OutboxRequest, deps: ApplyDeps): Promise<OutboxReceipt> {
  const results: ReceiptResult[] = [];
  const createdTags: Array<{ id: string; label: string }> = [];
  const receipt = (): OutboxReceipt => ({ v: OUTBOX_FORMAT_VERSION, id: req.id, appliedAt: new Date().toISOString(), appVersion: deps.appVersion, results, createdTags });
  const store = getConversationStore();
  // WHY error and not not-found: the store is null only while starting or after
  // quit began. "Not found" would be a wrong, permanent answer for a real conversation.
  if (!store) {
    for (const op of req.ops) for (const t of op.targets) results.push({ ...t, op: op.op, status: 'error', error: STORE_DOWN });
    return receipt();
  }

  for (const op of req.ops) {
    if (op.op === 'flag') {
      for (const t of op.targets) results.push(await applyFlag(store, t, op.flag, op.value));
    } else if (op.op === 'note') {
      for (const t of op.targets) {
        const rec = await store.get(t.provider, t.id);
        if (!rec) { results.push({ ...t, op: 'note', status: 'not-found' }); continue; }
        if (op.mode === 'append' && hasDatedLine(rec.note ?? '', op.text)) { results.push({ ...t, op: 'note', status: 'already' }); continue; }
        const next = op.mode === 'set' ? op.text : appendNoteText(rec.note ?? '', deps.today(), op.text);
        if (next.length > NOTE_MAX_CHARS) { results.push({ ...t, op: 'note', status: 'refused', error: `note would exceed ${NOTE_MAX_CHARS} characters (${next.length})` }); continue; }
        if (next === (rec.note ?? '')) { results.push({ ...t, op: 'note', status: 'already' }); continue; }
        const res = await noteSessionNote(t.id, next, t.provider === 'native');
        if (!res.ok) { results.push({ ...t, op: 'note', status: 'error', error: 'Could not save — conversation storage is not available on this device.' }); continue; }
        broadcastSessionMeta(t.id, { note: next });
        results.push({ ...t, op: 'note', status: 'applied' });
      }
    } else if (op.op === 'tag') {
      const reg = getTagRegistry();
      if (!reg) { for (const t of op.targets) results.push({ ...t, op: 'tag', status: 'error', error: 'tag registry unavailable' }); continue; }
      const all = (await reg.list()).filter((x) => !x.archived);
      const byLabel = new Map(all.map((x) => [x.label.toLowerCase(), x]));
      const resolve = async (label: string, allowCreate: boolean) => {
        const hit = byLabel.get(label.toLowerCase());
        if (hit) return hit;
        if (!allowCreate) return null;
        const made = await reg.create(label, DEFAULT_TAG_COLOR);
        byLabel.set(label.toLowerCase(), made); createdTags.push({ id: made.id, label: made.label });
        return made;
      };
      // WHY resolve before touching any target: an unknown label refuses the
      // whole op — partial application across 22 conversations is worse than none.
      const adds = []; const removes = []; let refused: string | null = null;
      for (const l of op.add) { const r = await resolve(l, op.create); if (!r) { refused = l; break; } adds.push(r); }
      if (!refused) for (const l of op.remove) { const r = await resolve(l, false); if (!r) { refused = l; break; } removes.push(r); }
      if (refused) {
        const existing = all.map((x) => x.label).sort().join(', ') || '(none)';
        for (const t of op.targets) results.push({ ...t, op: 'tag', status: 'refused', error: `unknown tag "${refused}" — existing tags: ${existing}` });
        continue;
      }
      for (const t of op.targets) {
        let worst: ReceiptResult | null = null; let applied = false;
        for (const [tag, value] of [...adds.map((a) => [a, true] as const), ...removes.map((r) => [r, false] as const)]) {
          const r = await applyFlag(store, t, tagFlagKey(tag.id), value);
          if (r.status === 'applied') applied = true;
          if (r.status === 'not-found' || r.status === 'error') { worst = { ...r, op: 'tag' }; break; }
        }
        results.push(worst ?? { ...t, op: 'tag', status: applied ? 'applied' : 'already' });
      }
    }
  }
  if (results.some((r) => r.status === 'applied')) emitConversationMetaChanged();
  return receipt();
}

function recoverStaleProcessing(dir: string): void {
  const proc = path.join(dir, 'processing');
  let names: string[] = [];
  try { names = fs.readdirSync(proc); } catch { return; }
  for (const n of names) {
    const p = path.join(proc, n);
    try {
      if (Date.now() - fs.statSync(p).mtimeMs > PROCESSING_STALE_MS) fs.renameSync(p, path.join(dir, n));
    } catch { /* another instance got there first */ }
  }
}

function sweepReceipts(dir: string): void {
  const done = path.join(dir, 'done');
  let names: string[] = [];
  try { names = fs.readdirSync(done); } catch { return; }
  for (const n of names) {
    const p = path.join(done, n);
    try { if (Date.now() - fs.statSync(p).mtimeMs > RECEIPT_TTL_MS) fs.unlinkSync(p); } catch { /* best effort */ }
  }
}

/** One pass over the outbox. Returns how many requests this instance handled. */
export async function drainOutboxOnce(opts: DrainOpts): Promise<number> {
  if (opts.isDevInstance && !opts.devOverride) return 0;
  const dir = outboxDir(opts.homeRoot);
  if (!fs.existsSync(dir)) return 0;
  recoverStaleProcessing(dir);
  sweepReceipts(dir);
  let handled = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue; // the CLI's temp files end in .tmp-<pid>, so they never match
    const src = path.join(dir, name);
    let raw: string;
    try { raw = fs.readFileSync(src, 'utf8'); } catch { continue; }
    const parsed = parseOutboxRequest(raw);
    // WHY check storeRoot BEFORE claiming: a request for another store must stay
    // visible to the instance it belongs to.
    if (parsed.ok && parsed.req.storeRoot !== opts.storeRoot) {
      log('INFO', 'chatsearch-outbox', 'request for another store left in place', { id: parsed.req.id, storeRoot: parsed.req.storeRoot });
      continue;
    }
    const claimed = path.join(dir, 'processing', name);
    fs.mkdirSync(path.dirname(claimed), { recursive: true });
    try { fs.renameSync(src, claimed); } catch { continue; } // lost the race
    const id = name.replace(/\.json$/, '');
    let receipt: OutboxReceipt;
    if (!parsed.ok) {
      receipt = { v: OUTBOX_FORMAT_VERSION, id, appliedAt: new Date().toISOString(), appVersion: opts.appVersion, results: [], createdTags: [], error: parsed.error };
    } else {
      try { receipt = await applyOutboxRequest(parsed.req, opts); }
      catch (e: any) {
        receipt = { v: OUTBOX_FORMAT_VERSION, id, appliedAt: new Date().toISOString(), appVersion: opts.appVersion, results: [], createdTags: [], error: `apply failed — ${e?.message ?? String(e)}` };
      }
    }
    writeJsonAtomic(path.join(dir, 'done', `${id}.ack.json`), receipt);
    try { fs.unlinkSync(claimed); } catch { /* already gone */ }
    handled++;
  }
  return handled;
}

// ---- lifecycle -------------------------------------------------------------
let watcher: fs.FSWatcher | null = null;
let pollTimer: NodeJS.Timeout | null = null;
let running = false;
let rerun = false;

function liveOpts(): DrainOpts | null {
  const store = getConversationStore();
  if (!store) return null;
  return {
    homeRoot: os.homedir(), storeRoot: store.root(),
    isDevInstance: !!process.env.YOUCODED_PROFILE, devOverride: process.env.YOUCODED_CHATSEARCH_OUTBOX === '1',
    appVersion: app?.getVersion?.() ?? 'dev', today: () => new Date().toISOString().slice(0, 10),
  };
}

async function drainSerialized(): Promise<void> {
  if (running) { rerun = true; return; }
  running = true;
  try {
    do { rerun = false; const o = liveOpts(); if (o) await drainOutboxOnce(o); } while (rerun);
  } catch (e: any) {
    log('WARN', 'chatsearch-outbox', 'drain failed', { error: e?.message ?? String(e) });
  } finally { running = false; }
}

export function startOutboxDrain(): void {
  stopOutboxDrain();
  const dir = outboxDir(os.homedir());
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* drain will no-op */ }
  try {
    watcher = fs.watch(dir, () => { void drainSerialized(); });
    watcher.on('error', () => { watcher?.close(); watcher = null; });
  } catch { watcher = null; }
  // WHY a poll alongside fs.watch: Windows drops notifications; 5 s matches subagent-watcher.
  // Every pass also sweeps old receipts, so no separate sweep timer exists.
  pollTimer = setInterval(() => { void drainSerialized(); }, POLL_MS); pollTimer.unref?.();
  void drainSerialized(); // launch drain — requests queued while the app was closed
}

export function stopOutboxDrain(): void {
  watcher?.close(); watcher = null;
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}
```

If `../logger` does not export `log(level, scope, msg, data)` in that shape, use whatever `skill-provider.ts:266` imports (`log('ERROR', 'SkillProvider', …)`) — same module.

- [ ] **Step 5: Run — expect PASS** (`npx vitest run tests/chatsearch-outbox.test.ts`). The `electron` import resolves via `tests/__mocks__/electron.ts`; if `app.getVersion` is absent there, the `?? 'dev'` fallback covers it.

- [ ] **Step 6: Commit**
```bash
git add src/main/chatsearch-index/outbox-format.ts src/main/chatsearch-index/outbox-drain.ts tests/chatsearch-outbox.test.ts
git commit -m "feat(chatsearch): outbox drainer — CLI requests apply through the store and broadcast"
```

### Task A4: Wire the drainer into app lifecycle

**Files:**
- Modify: `src/main/main.ts:58` (import), `:1983` (after `startChatsearchIndex()`), `:2034` (after `stopChatsearchIndex()`)

- [ ] **Step 1: Implement**
```ts
import { startOutboxDrain, stopOutboxDrain } from './chatsearch-index/outbox-drain';
…
  startChatsearchIndex();
  // WHY after the index: the drainer reads the same store root; requests it
  // applies trigger the index rebuild through emitConversationMetaChanged.
  startOutboxDrain();
…
  try { stopChatsearchIndex(); } catch {}
  try { stopOutboxDrain(); } catch {}
```
- [ ] **Step 2: `bash scripts/verify.sh worktrees/chatsearch-writes` — all green.**
- [ ] **Step 3: Commit** `git add src/main/main.ts && git commit -m "feat(chatsearch): start the outbox drainer at launch, stop at quit"`

### Task A5: CLI write commands

**Files:**
- Modify: `wecoded-marketplace/youcoded-chatsearch/skills/chatsearch/scripts/chatsearch.js` (dispatch :982-996, USAGE :944-953, `resolveId` :731)
- Test: `wecoded-marketplace/youcoded-chatsearch/tests/chatsearch.test.js`

**Interfaces:**
- Consumes: index entry `{ id, provider, note, tags, complete, priority }`, `meta.storeRoot` (A1).
- Produces: `runChatsearch(req, env)` handles `flag | tag | note | close | receipt`; `env.receiptTimeoutMs` (default 2000) and `env.uuid` (default `crypto.randomUUID`) are test seams.

- [ ] **Step 1: Failing tests** — append to `tests/chatsearch.test.js`. Update `fixture()` so `claude-meta.json` includes `storeRoot: '/store/A'` at the top level.

```js
import { randomUUID } from 'node:crypto';
const OUTBOX = (home) => path.join(home, '.youcoded', 'chatsearch', 'outbox');
const readRequests = (home) => fs.readdirSync(OUTBOX(home)).filter((n) => n.endsWith('.json'))
  .map((n) => JSON.parse(fs.readFileSync(path.join(OUTBOX(home), n), 'utf8')));
const fakeApp = (home, id, results) => {
  fs.mkdirSync(path.join(OUTBOX(home), 'done'), { recursive: true });
  fs.writeFileSync(path.join(OUTBOX(home), 'done', `${id}.ack.json`), JSON.stringify({ v: 1, id, appliedAt: 'x', appVersion: 't', results, createdTags: [] }));
};
const env = (home, extra = {}) => ({ home, receiptTimeoutMs: 100, uuid: () => 'aaaaaaaa-0000-0000-0000-000000000001', ...extra });

test('flag writes a request stamped with the store root and reports Queued without a receipt', async () => {
  const home = fixture();
  const out = await runChatsearch({ cmd: 'flag', ids: ['a3f2'], flag: 'priority', value: true }, env(home));
  const [req] = readRequests(home);
  assert.equal(req.v, 1); assert.equal(req.storeRoot, '/store/A');
  assert.deepEqual(req.ops, [{ op: 'flag', targets: [{ provider: 'claude', id: 'a3f2aaaa' }], flag: 'priority', value: true }]);
  assert.match(out, /^Queued: YouCoded is not running, or is busy\. The change applies the next time it opens \(request aaaaaaaa-0000-0000-0000-000000000001\)\.$/m);
});

test('close expands to flag complete + dated note append, and renders the receipt', async () => {
  const home = fixture();
  const p = runChatsearch({ cmd: 'close', ids: ['a3f2', '9c14'], reason: 'superseded by PR #339' }, env(home));
  await new Promise((r) => setTimeout(r, 20));
  fakeApp(home, 'aaaaaaaa-0000-0000-0000-000000000001', [
    { provider: 'claude', id: 'a3f2aaaa', op: 'flag', status: 'already' },
    { provider: 'claude', id: 'a3f2aaaa', op: 'note', status: 'applied' },
    { provider: 'claude', id: '9c14bbbb', op: 'flag', status: 'applied' },
    { provider: 'claude', id: '9c14bbbb', op: 'note', status: 'applied' },
  ]);
  const out = await p;
  const [req] = readRequests(home); // no app is running, so the request stays in outbox/
  assert.equal(req.ops[0].op, 'flag'); assert.equal(req.ops[0].flag, 'complete'); assert.equal(req.ops[0].value, true);
  assert.equal(req.ops[1].op, 'note'); assert.equal(req.ops[1].mode, 'append'); assert.equal(req.ops[1].text, 'superseded by PR #339');
  assert.match(out, /a3f2aaaa .*flag: already/); assert.match(out, /9c14bbbb .*note: applied/);
  assert.match(out, /applied 3 · already 1 · not found 0 · refused 0 · error 0/);
});

test('tag refuses when neither add nor remove is given; passes create through', async () => {
  const home = fixture();
  const out = await runChatsearch({ cmd: 'tag', ids: ['a3f2'] }, env(home));
  assert.match(out, /tag needs "add" and\/or "remove"/);
  await runChatsearch({ cmd: 'tag', ids: ['a3f2'], add: ['superseded'], create: true }, env(home));
  const [req] = readRequests(home);
  assert.deepEqual(req.ops[0], { op: 'tag', targets: [{ provider: 'claude', id: 'a3f2aaaa' }], add: ['superseded'], remove: [], create: true });
});

test('note needs mode set|append and text', async () => {
  const home = fixture();
  assert.match(await runChatsearch({ cmd: 'note', ids: ['a3f2'], text: 'x' }, env(home)), /note needs "mode": "set" or "append"/);
  await runChatsearch({ cmd: 'note', ids: ['a3f2'], mode: 'set', text: 'x' }, env(home));
  assert.equal(readRequests(home)[0].ops[0].mode, 'set');
});

test('an unknown id refuses the whole command before anything is written', async () => {
  const home = fixture();
  const out = await runChatsearch({ cmd: 'flag', ids: ['a3f2', 'zzzz'], flag: 'complete', value: true }, env(home));
  assert.match(out, /no conversation matches id "zzzz"/);
  assert.equal(fs.existsSync(OUTBOX(home)) ? readRequests(home).length : 0, 0);
});

test('receipt prints a stored receipt or says it is not there yet', async () => {
  const home = fixture();
  assert.match(await runChatsearch({ cmd: 'receipt', id: 'nope' }, env(home)), /no receipt for request nope — either YouCoded has not applied it yet/);
  fakeApp(home, 'r1', [{ provider: 'claude', id: 'a3f2aaaa', op: 'flag', status: 'applied' }]);
  assert.match(await runChatsearch({ cmd: 'receipt', id: 'r1' }, env(home)), /applied 1 · already 0/);
});

test('an index without storeRoot refuses writes and says why', async () => {
  const home = fixture();
  const metaPath = path.join(home, '.youcoded', 'chatsearch', 'claude-meta.json');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); delete meta.storeRoot; fs.writeFileSync(metaPath, JSON.stringify(meta));
  const out = await runChatsearch({ cmd: 'flag', ids: ['a3f2'], flag: 'complete', value: true }, env(home));
  assert.match(out, /this index was written by an older YouCoded — update YouCoded, open it once, then retry/);
});
```

- [ ] **Step 2: Run — expect FAIL** (`cd wecoded-marketplace/youcoded-chatsearch && npm test` → `unknown command "flag"`).

- [ ] **Step 3: Implement.** Add near `resolveId`:

```js
import { randomUUID } from 'node:crypto';

/** Resolve every id up front; one bad id refuses the whole write. */
function resolveIds(index, rawIds, verb) {
  const list = Array.isArray(rawIds) ? rawIds : rawIds ? [rawIds] : [];
  if (!list.length) return { message: `${verb} needs "ids": a list of conversation ids (short ids from find are fine)` };
  const entries = []; const seen = new Set();
  for (const raw of list) {
    const r = resolveId(index, raw);
    if (r.message) return { message: r.message.replace(/\bshow\b/g, verb) };
    if (seen.has(r.entry.id)) continue;
    seen.add(r.entry.id); entries.push(r.entry);
  }
  return { entries };
}

function storeRootOf(index) {
  for (const p of index.providers) if (p.present && p.meta && typeof p.meta.storeRoot === 'string' && p.meta.storeRoot) return p.meta.storeRoot;
  return null;
}
// WHY no version number: the release that carries this is not fixed, and a wrong one is a misleading error.
const NO_STORE_ROOT = 'this index was written by an older YouCoded — update YouCoded, open it once, then retry';

const targetsOf = (entries) => entries.map((e) => ({ provider: e.provider, id: e.id }));

async function submitRequest(index, ops, env) {
  const storeRoot = storeRootOf(index);
  if (!storeRoot) return { message: NO_STORE_ROOT };
  const id = (env.uuid || randomUUID)();
  const dir = path.join(index.dir, 'outbox');
  await fsp.mkdir(path.join(dir, 'done'), { recursive: true });
  const req = { v: 1, id, createdAt: new Date().toISOString(), storeRoot, ops };
  const target = path.join(dir, `${id}.json`);
  const tmp = `${target}.tmp-${process.pid}`;
  await fsp.writeFile(tmp, JSON.stringify(req, null, 2), 'utf8');
  await fsp.rename(tmp, target);
  const ackPath = path.join(dir, 'done', `${id}.ack.json`);
  const deadline = Date.now() + (typeof env.receiptTimeoutMs === 'number' ? env.receiptTimeoutMs : 2000);
  while (Date.now() < deadline) {
    try { return { receipt: JSON.parse(await fsp.readFile(ackPath, 'utf8')) }; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 50));
  }
  return { message: `Queued: YouCoded is not running, or is busy. The change applies the next time it opens (request ${id}).` };
}

function renderReceipt(rc, index) {
  const lines = [];
  if (rc.error) { lines.push(`YouCoded could not use this request: ${rc.error}`); return lines.join('\n'); }
  const titles = new Map(index.conversations.map((e) => [e.id, e.title || '(untitled)']));
  const counts = { applied: 0, already: 0, 'not-found': 0, refused: 0, error: 0 };
  for (const r of rc.results || []) {
    counts[r.status] = (counts[r.status] || 0) + 1;
    lines.push(`  ${r.id}  ${titles.get(r.id) || ''}  ${r.op}: ${r.status}${r.error ? ` — ${r.error}` : ''}`);
  }
  for (const t of rc.createdTags || []) lines.push(`  created tag "${t.label}"`);
  lines.push(`applied ${counts.applied} · already ${counts.already} · not found ${counts['not-found']} · refused ${counts.refused} · error ${counts.error}`);
  return lines.join('\n');
}

async function cmdWrite(req, index, now, env, verb, buildOps) {
  const out = [];
  const banner = stalenessBanner(index, now);
  if (banner) out.push(banner);
  out.push(...index.problems);
  const resolved = resolveIds(index, req.ids, verb);
  if (resolved.message) { out.push(resolved.message); return out.join('\n'); }
  const built = buildOps(targetsOf(resolved.entries));
  if (built.message) { out.push(built.message); return out.join('\n'); }
  const sent = await submitRequest(index, built.ops, env);
  out.push(sent.message ? sent.message : renderReceipt(sent.receipt, index));
  return out.join('\n');
}

const cmdFlag = (req, index, now, env) => cmdWrite(req, index, now, env, 'flag', (targets) => {
  if (req.flag !== 'complete' && req.flag !== 'priority') return { message: 'flag needs "flag": "complete" or "priority"' };
  if (typeof req.value !== 'boolean') return { message: 'flag needs "value": true or false' };
  return { ops: [{ op: 'flag', targets, flag: req.flag, value: req.value }] };
});
const cmdTag = (req, index, now, env) => cmdWrite(req, index, now, env, 'tag', (targets) => {
  const strs = (x) => Array.isArray(x) ? x.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim()) : [];
  const add = strs(req.add); const remove = strs(req.remove);
  if (!add.length && !remove.length) return { message: 'tag needs "add" and/or "remove": lists of tag labels' };
  return { ops: [{ op: 'tag', targets, add, remove, create: req.create === true }] };
});
const cmdNote = (req, index, now, env) => cmdWrite(req, index, now, env, 'note', (targets) => {
  if (req.mode !== 'set' && req.mode !== 'append') return { message: 'note needs "mode": "set" or "append"' };
  if (typeof req.text !== 'string') return { message: 'note needs "text"' };
  return { ops: [{ op: 'note', targets, mode: req.mode, text: req.text }] };
});
const cmdClose = (req, index, now, env) => cmdWrite(req, index, now, env, 'close', (targets) => {
  if (typeof req.reason !== 'string' || !req.reason.trim()) return { message: 'close needs "reason": one line on why this conversation is done' };
  return { ops: [{ op: 'flag', targets, flag: 'complete', value: true }, { op: 'note', targets, mode: 'append', text: req.reason.trim() }] };
});
async function cmdReceipt(req, index) {
  const id = String(req.id || '').trim();
  if (!id) return 'receipt needs "id": the request id printed by a Queued write';
  try { return renderReceipt(JSON.parse(await fsp.readFile(path.join(index.dir, 'outbox', 'done', `${id}.ack.json`), 'utf8')), index); }
  // WHY two causes: receipts are deleted after 24 h, so "not applied" alone would be wrong for an old request.
  catch { return `no receipt for request ${id} — either YouCoded has not applied it yet (is it open?), or it applied more than a day ago and the receipt has been cleaned up`; }
}
```
Dispatch (replace :994-996):
```js
  if (cmd === 'find') return cmdFind(req, index, now);
  if (cmd === 'show') return cmdShow(req, index, now);
  if (cmd === 'flag') return cmdFlag(req, index, now, env);
  if (cmd === 'tag') return cmdTag(req, index, now, env);
  if (cmd === 'note') return cmdNote(req, index, now, env);
  if (cmd === 'close') return cmdClose(req, index, now, env);
  if (cmd === 'receipt') return cmdReceipt(req, index);
  return `unknown command "${req.cmd}".\n\n${USAGE}`;
```
USAGE — add after the `status` line:
```js
  '  {"cmd":"close","ids":["a3f2","9c14"],"reason":"superseded by PR #339"}',
  '  {"cmd":"flag","ids":["a3f2"],"flag":"complete","value":false}',
  '  {"cmd":"tag","ids":["a3f2"],"add":["superseded"],"remove":["wip"],"create":false}',
  '  {"cmd":"note","ids":["a3f2"],"mode":"append","text":"handed off to the Phase D session"}',
  '  {"cmd":"receipt","id":"<request id from a Queued write>"}',
```

- [ ] **Step 4: Run — expect PASS** (`npm test` → all tests pass, count = 25 + 7).

- [ ] **Step 5: Commit**
```bash
git add youcoded-chatsearch/skills/chatsearch/scripts/chatsearch.js youcoded-chatsearch/tests/chatsearch.test.js
git commit -m "feat(chatsearch): flag/tag/note/close/receipt — writes through the app's outbox"
```

### Task A6: SKILL.md + version bump

**Files:**
- Modify: `wecoded-marketplace/youcoded-chatsearch/skills/chatsearch/SKILL.md`, `wecoded-marketplace/youcoded-chatsearch/plugin.json`

- [ ] **Step 1: SKILL.md** — after the `### status` section add:

```markdown
## Changing things

Five write commands. Each takes `ids` (a list; short ids from `find` are fine)
and writes a request the app applies — the tool itself never edits anything.

| Command | Request |
|---|---|
| `close` | `{"cmd":"close","ids":[…],"reason":"…"}` — mark complete **and** add a dated note line. Prefer this over a bare `flag`. |
| `flag` | `{"cmd":"flag","ids":[…],"flag":"complete"|"priority","value":true|false}` |
| `tag` | `{"cmd":"tag","ids":[…],"add":["label"],"remove":["label"],"create":false}` — unknown labels are refused unless `"create": true`; say so when you create one. |
| `note` | `{"cmd":"note","ids":[…],"mode":"set"|"append","text":"…"}` — `set` replaces, `append` adds `<date>: text`. |
| `receipt` | `{"cmd":"receipt","id":"…"}` — fetch the result of a write that came back `Queued`. |

Rules:
- **Show the user the list before any write touching more than five conversations**, and wait for a yes.
- `Queued: YouCoded is not running…` is not a failure. The change lands when the app opens; check with `receipt` if it matters now. **Never re-send a write that came back `Queued`.**
- **The receipt is the confirmation.** The search index catches up a few seconds after a write, so a `find` run right away still shows the old state — do not re-run `find` to check, and do not conclude the write failed.
- One unknown id refuses the whole command before anything is written — fix the id and re-run.
- Every result line says `applied`, `already` (nothing changed), `not found`, `refused` (with why) or `error`. Report the summary line to the user verbatim.
```
Under "How to run it", keep `${CLAUDE_PLUGIN_ROOT}` and add one sentence: *Claude Code and YouCoded's own harness both fill in `${CLAUDE_PLUGIN_ROOT}`; if it comes through empty, the plugin lives at `~/.claude/plugins/marketplaces/youcoded/plugins/youcoded-chatsearch/`.*

- [ ] **Step 2: `plugin.json`** — `"version": "0.2.0"`.
- [ ] **Step 3: `npm test` PASS. Commit**
```bash
git add youcoded-chatsearch/skills/chatsearch/SKILL.md youcoded-chatsearch/plugin.json
git commit -m "docs(chatsearch): write commands in SKILL.md; bump to 0.2.0"
```

---

# Track B — bundled skills that upgrade

Worktree: `worktrees/bundled-upgrade`, branch `fix/bundled-plugin-upgrade`.

### Task B1: Shared `isNewerVersion`

**Files:**
- Create: `src/shared/version-compare.ts`
- Modify: `src/renderer/state/marketplace-context.tsx:26-45` (delete local copy, import)
- Test: `tests/version-compare.test.ts`

**Interfaces:** `export function isNewerVersion(installed: string | undefined, latest: string | undefined): boolean`

- [ ] **Step 1: Test**
```ts
import { describe, it, expect } from 'vitest';
import { isNewerVersion } from '../src/shared/version-compare';
describe('isNewerVersion', () => {
  it.each([
    ['0.1.0', '0.2.0', true], ['0.2.0', '0.1.0', false], ['1.0.0', '1.0.0', false],
    ['v1.2', '1.2.1', true], ['1.0', '1.0.0', false], [undefined, '1.0.0', false], ['1.0.0', undefined, false],
    ['1.0.0-beta', '1.0.0', true], ['abc', 'abd', true],
  ])('%s → %s = %s', (a, b, want) => { expect(isNewerVersion(a, b)).toBe(want); });
});
```
- [ ] **Step 2: FAIL. Step 3: Move the function body verbatim from marketplace-context.tsx:26-45 into `version-compare.ts` with `export`; in the tsx file replace the definition with `import { isNewerVersion } from '../../shared/version-compare';`.**
- [ ] **Step 4: PASS; `tsc --noEmit` clean. Commit** `git add src/shared/version-compare.ts src/renderer/state/marketplace-context.tsx tests/version-compare.test.ts && git commit -m "refactor: isNewerVersion moves to shared so main can compare plugin versions"`

### Task B2: Installer primitives — installed version, cache refresh, upgrade

**Files:**
- Modify: `src/main/plugin-installer.ts`
- Modify: `src/main/skill-provider.ts:232-244` (forward `version`)
- Test: `tests/plugin-installer-upgrade.test.ts`

**Interfaces (all exported from `plugin-installer.ts`):**
- `readPluginVersion(dir: string): string | null` — reads `plugin.json` or `.claude-plugin/plugin.json` (rename of `readCachedPluginVersion`, exported)
- `refreshLocalMarketplaceCache(sourceMarketplace?: string): Promise<{ ok: boolean; refreshed: boolean; error?: string }>` — clone if missing; otherwise `git fetch` + `reset --hard` only when the last refresh is older than `CACHE_REFRESH_MS` (1 h — the gate `installFromLocal` already uses; an upgrade still lands within an hour of any launch, and every launch of every install does NOT hit GitHub)
- `upgradePluginFromLocal(id: string, sourceRef: string, sourceMarketplace?: string): Promise<InstallResult>` — copy cache tree to `<PLUGINS_DIR>/.upgrade-<id>-<pid>`, then swap: rename old → `.old-<id>-<pid>`, rename new → `<id>`, delete old. Registers with the **real** version.
- `runGit` — when git produces no output (typically: git is not installed), the result carries the OS error message instead of an empty string.

- [ ] **Step 1: Test** (pattern 2 — temp HOME + `vi.resetModules()` + dynamic import; a fake cache clone is just a directory, so no git runs)

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

let home: string; let origHome: string | undefined;
const w = (p: string, s: string) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const cacheDir = () => path.join(home, '.claude', 'youcoded-marketplace-cache', 'wecoded-marketplace');
const pluginsDir = () => path.join(home, '.claude', 'plugins', 'marketplaces', 'youcoded', 'plugins');

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-upgrade-')); origHome = process.env.HOME;
  process.env.HOME = home; process.env.USERPROFILE = home; vi.resetModules();
});
afterEach(() => { process.env.HOME = origHome; delete process.env.USERPROFILE; fs.rmSync(home, { recursive: true, force: true }); });

describe('plugin-installer upgrade primitives', () => {
  it('readPluginVersion reads root or .claude-plugin manifests', async () => {
    const { readPluginVersion } = await import('../src/main/plugin-installer');
    w(path.join(home, 'a', 'plugin.json'), '{"version":"0.2.0"}');
    w(path.join(home, 'b', '.claude-plugin', 'plugin.json'), '{"version":"3.0.0"}');
    expect(readPluginVersion(path.join(home, 'a'))).toBe('0.2.0');
    expect(readPluginVersion(path.join(home, 'b'))).toBe('3.0.0');
    expect(readPluginVersion(path.join(home, 'c'))).toBeNull();
  });
  it('refreshLocalMarketplaceCache skips the network inside the 1 h gate', async () => {
    const { refreshLocalMarketplaceCache } = await import('../src/main/plugin-installer');
    fs.mkdirSync(cacheDir(), { recursive: true });
    fs.writeFileSync(path.join(cacheDir(), '.youcoded-last-pull'), String(Date.now())); // the file setCacheTimestamp writes (:218)
    expect(await refreshLocalMarketplaceCache('youcoded')).toEqual({ ok: true, refreshed: false });
  });
  it('upgradePluginFromLocal swaps the tree and registers the real version', async () => {
    const mod = await import('../src/main/plugin-installer');
    w(path.join(cacheDir(), 'youcoded-chatsearch', 'plugin.json'), '{"name":"youcoded-chatsearch","version":"0.2.0"}');
    w(path.join(cacheDir(), 'youcoded-chatsearch', 'skills', 'x', 'SKILL.md'), 'new');
    w(path.join(pluginsDir(), 'youcoded-chatsearch', 'plugin.json'), '{"name":"youcoded-chatsearch","version":"0.1.0"}');
    w(path.join(pluginsDir(), 'youcoded-chatsearch', 'stale.txt'), 'gone after upgrade');
    const r = await mod.upgradePluginFromLocal('youcoded-chatsearch', 'youcoded-chatsearch', 'youcoded');
    expect(r.status).toBe('installed');
    expect(fs.existsSync(path.join(pluginsDir(), 'youcoded-chatsearch', 'stale.txt'))).toBe(false);
    expect(fs.readFileSync(path.join(pluginsDir(), 'youcoded-chatsearch', 'skills', 'x', 'SKILL.md'), 'utf8')).toBe('new');
    const db = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'plugins', 'installed_plugins.json'), 'utf8'));
    expect(db.plugins['youcoded-chatsearch@youcoded'][0].version).toBe('0.2.0');
    expect(fs.readdirSync(pluginsDir()).filter((n) => n.startsWith('.'))).toEqual([]);
  });
  it('upgradePluginFromLocal fails honestly when the cache has no such plugin', async () => {
    const mod = await import('../src/main/plugin-installer');
    fs.mkdirSync(cacheDir(), { recursive: true });
    const r = await mod.upgradePluginFromLocal('nope', 'nope', 'youcoded');
    expect(r.status).toBe('failed'); if (r.status === 'failed') expect(r.error).toMatch(/Source not found in cache: nope/);
  });
});
```
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** in `plugin-installer.ts`:

```ts
export function readPluginVersion(dir: string): string | null { /* body of readCachedPluginVersion, unchanged */ }
// keep a private alias so existing call sites compile:
const readCachedPluginVersion = readPluginVersion;

// In runGit's error branch (:141-143): when git printed nothing, keep the OS
// error — "fetch failed: " with nothing after it is a misleading error.
//   const printed = `${stderr}\n${stdout}`.trim();
//   resolve({ ok: false, output: printed || err.message });

export async function refreshLocalMarketplaceCache(sourceMarketplace?: string): Promise<{ ok: boolean; refreshed: boolean; error?: string }> {
  const cacheRepo = path.join(CACHE_DIR, getCacheRepoName(sourceMarketplace));
  const repoUrl = getMarketplaceRepo(sourceMarketplace);
  // marketplaceBranch: today a local const inside installFromLocal (:245) — hoist that one line to module level so both callers share it; don't re-read the env var here.
  if (!fs.existsSync(cacheRepo)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const { ok, output } = await runGit('clone', '--depth', '1', '--branch', marketplaceBranch, repoUrl, cacheRepo);
    if (!ok) return { ok: false, refreshed: false, error: `clone failed: ${output.slice(0, 200)}` };
    setCacheTimestamp(cacheRepo); return { ok: true, refreshed: true };
  }
  // WHY the same 1 h gate as installFromLocal: reconcile runs on EVERY launch of
  // EVERY install; without a gate that is a GitHub round-trip per app start.
  if (Date.now() - getCacheTimestamp(cacheRepo) < CACHE_REFRESH_MS) return { ok: true, refreshed: false };
  const f = await runGit('-C', cacheRepo, 'fetch', 'origin');
  if (!f.ok) return { ok: false, refreshed: false, error: `fetch failed: ${f.output.slice(0, 200)}` };
  const r = await runGit('-C', cacheRepo, 'reset', '--hard', `origin/${marketplaceBranch}`);
  if (!r.ok) return { ok: false, refreshed: false, error: `reset failed: ${r.output.slice(0, 200)}` };
  setCacheTimestamp(cacheRepo); return { ok: true, refreshed: true };
}

/** Replace an installed plugin with the cache clone's copy. Never rmSync's the
 *  live dir first — a crash mid-copy must not leave the user with no plugin. */
export async function upgradePluginFromLocal(id: string, sourceRef: string, sourceMarketplace?: string): Promise<InstallResult> {
  if (!SAFE_ID_RE.test(id)) return { status: 'failed', error: 'Invalid plugin id' };
  const cacheRepo = path.join(CACHE_DIR, getCacheRepoName(sourceMarketplace));
  const sourceDir = path.join(cacheRepo, sourceRef);
  if (!isContainedIn(sourceDir, cacheRepo)) return { status: 'failed', error: 'Invalid source ref (path traversal blocked)' };
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) return { status: 'failed', error: `Source not found in cache: ${sourceRef}` };
  fs.mkdirSync(PLUGINS_DIR, { recursive: true });
  const targetDir = path.join(PLUGINS_DIR, id);
  const staging = path.join(PLUGINS_DIR, `.upgrade-${id}-${process.pid}`);
  const retired = path.join(PLUGINS_DIR, `.old-${id}-${process.pid}`);
  try {
    fs.rmSync(staging, { recursive: true, force: true });
    copyDirSync(sourceDir, staging);
    if (fs.existsSync(targetDir)) fs.renameSync(targetDir, retired);
    fs.renameSync(staging, targetDir);
    fs.rmSync(retired, { recursive: true, force: true });
  } catch (err: any) {
    // WHY: put the old tree back if the swap died half-way.
    if (!fs.existsSync(targetDir) && fs.existsSync(retired)) { try { fs.renameSync(retired, targetDir); } catch { /* nothing better to do */ } }
    fs.rmSync(staging, { recursive: true, force: true });
    return { status: 'failed', error: `upgrade copy failed: ${err?.message || String(err)}` };
  }
  const version = readPluginVersion(targetDir) ?? '1.0.0';
  try { registerPluginInstall({ id, installPath: targetDir, version }); }
  catch (err: any) { return { status: 'failed', error: `Registry write failed: ${err?.message || String(err)}` }; }
  return { status: 'installed' };
}
```
In `installPlugin` (:390-396) replace `version: '1.0.0', // real version flows …` with `version: readPluginVersion(path.join(PLUGINS_DIR, id)) ?? entry.version ?? '1.0.0',` and add `version?: string` handling: `installFromLocal(id, sourceRef, entry.sourceMarketplace, entry.version)` already exists — now make `skill-provider.ts:232-244` actually pass `version: marketplaceEntry.version,` (it never did — the cache-refresh-on-version-mismatch trigger was dead code).

- [ ] **Step 4: PASS; `tsc` clean. Commit**
```bash
git add src/main/plugin-installer.ts src/main/skill-provider.ts tests/plugin-installer-upgrade.test.ts
git commit -m "feat(plugins): upgrade primitives — real versions, gated cache refresh, atomic swap"
```

### Task B3: `reconcileBundledPlugins` + honest `update()`

**Files:**
- Modify: `src/main/skill-provider.ts` (`ensureBundledPluginsInstalled` :806-812, `update` :284-332, `install` :246-260)
- Modify: `src/shared/types.ts` — `SkillEntry` (add `sourceMarketplace?: string`)
- Test: rewrite `tests/skill-provider-bundled.test.ts`

**Interfaces:**
- `LocalSkillProvider.reconcileBundledPlugins(): Promise<Array<{ id: string; action: 'installed' | 'upgraded' | 'unchanged' | 'skipped-dev' | 'failed'; from?: string; to?: string; error?: string }>>`
- `ensureBundledPluginsInstalled()` stays as the public name `main.ts:206` calls; its body becomes `await this.reconcileBundledPlugins()` with logging.
- Bundled plugins are app-owned: a newer cache copy always replaces the installed tree. Edits to a bundled skill go through the marketplace repo, never the install folder. (No local-modification fingerprint — it would leave a hand-edited copy silently on an old version forever, with only a log line to say so.)

- [ ] **Step 1: Test** (rewrite the file)

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BUNDLED_PLUGIN_IDS } from '../src/shared/bundled-plugins';

const inst = vi.hoisted(() => ({
  installPlugin: vi.fn(), upgradePluginFromLocal: vi.fn(), refreshLocalMarketplaceCache: vi.fn(),
  readPluginVersion: vi.fn(), isPluginInstalled: vi.fn(),
}));
vi.mock('../src/main/plugin-installer', () => inst);
import { LocalSkillProvider } from '../src/main/skill-provider';

const entry = (id: string, version: string) => ({ id, type: 'plugin', version, sourceType: 'local', sourceRef: id, sourceMarketplace: 'youcoded' });

describe('LocalSkillProvider.reconcileBundledPlugins', () => {
  let p: LocalSkillProvider; const versions: Record<string, string> = {};
  beforeEach(() => {
    vi.clearAllMocks(); delete process.env.YOUCODED_PROFILE; delete process.env.YOUCODED_BUNDLED_UPGRADE;
    p = new LocalSkillProvider();
    for (const k of Object.keys(versions)) delete versions[k];
    vi.spyOn(p as any, 'fetchIndex').mockResolvedValue(BUNDLED_PLUGIN_IDS.map((id) => entry(id, '1.0.0')));
    vi.spyOn(p.configStore, 'updatePackageVersion').mockImplementation((id: string, v: string) => { versions[id] = v; });
    inst.refreshLocalMarketplaceCache.mockResolvedValue({ ok: true, refreshed: true });
    inst.isPluginInstalled.mockReturnValue(true);
    inst.readPluginVersion.mockImplementation((dir: string) => dir.includes('youcoded-marketplace-cache') ? '0.2.0' : '0.1.0');
    inst.upgradePluginFromLocal.mockResolvedValue({ status: 'installed' });
    inst.installPlugin.mockResolvedValue({ status: 'installed' });
  });
  it('is a no-op on a dev instance unless overridden', async () => {
    process.env.YOUCODED_PROFILE = 'dev';
    expect((await p.reconcileBundledPlugins()).every((r) => r.action === 'skipped-dev')).toBe(true);
    expect(inst.refreshLocalMarketplaceCache).not.toHaveBeenCalled();
    process.env.YOUCODED_BUNDLED_UPGRADE = '1';
    expect((await p.reconcileBundledPlugins()).some((r) => r.action === 'upgraded')).toBe(true);
  });
  it('upgrades when the cache copy is newer and records the plugin.json version', async () => {
    const r = await p.reconcileBundledPlugins();
    expect(r.find((x) => x.id === 'youcoded-chatsearch')).toMatchObject({ action: 'upgraded', from: '0.1.0', to: '0.2.0' });
    expect(inst.upgradePluginFromLocal).toHaveBeenCalledWith('youcoded-chatsearch', 'youcoded-chatsearch', 'youcoded');
    expect(versions['youcoded-chatsearch']).toBe('0.2.0');
  });
  it('leaves an equal version alone', async () => {
    inst.readPluginVersion.mockReturnValue('0.2.0');
    expect((await p.reconcileBundledPlugins()).every((r) => r.action === 'unchanged')).toBe(true);
    expect(inst.upgradePluginFromLocal).not.toHaveBeenCalled();
  });
  it('still compares against the last cache copy when the refresh fails', async () => {
    inst.refreshLocalMarketplaceCache.mockResolvedValue({ ok: false, refreshed: false, error: 'fetch failed: offline' });
    expect((await p.reconcileBundledPlugins()).find((x) => x.id === 'youcoded-chatsearch')?.action).toBe('upgraded');
  });
  it('installs a bundled id that is not installed, refetching the index once when it is absent', async () => {
    inst.isPluginInstalled.mockImplementation((id: string) => id !== 'youcoded-chatsearch');
    const fetchIndex = vi.spyOn(p as any, 'fetchIndex')
      .mockResolvedValueOnce(BUNDLED_PLUGIN_IDS.filter((id) => id !== 'youcoded-chatsearch').map((id) => entry(id, '1.0.0')))
      .mockResolvedValueOnce(BUNDLED_PLUGIN_IDS.map((id) => entry(id, '1.0.0')));
    const invalidate = vi.spyOn(p, 'invalidateCache').mockResolvedValue();
    const r = await p.reconcileBundledPlugins();
    expect(invalidate).toHaveBeenCalledTimes(1); expect(fetchIndex).toHaveBeenCalledTimes(2);
    expect(r.find((x) => x.id === 'youcoded-chatsearch')?.action).toBe('installed');
  });
  it('reports install failures instead of swallowing them', async () => {
    inst.isPluginInstalled.mockReturnValue(false);
    inst.installPlugin.mockResolvedValue({ status: 'failed', error: 'clone failed: boom' });
    expect((await p.reconcileBundledPlugins())[0]).toMatchObject({ action: 'failed', error: 'clone failed: boom' });
  });
  it('ensureBundledPluginsInstalled resolves even when reconcile throws', async () => {
    vi.spyOn(p, 'reconcileBundledPlugins').mockRejectedValue(new Error('network'));
    await expect(p.ensureBundledPluginsInstalled()).resolves.toBeUndefined();
  });
});
```
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement.**

`types.ts` — `SkillEntry`: add `sourceMarketplace?: string;` next to `sourceRef`. (`skill-config-store.ts` is untouched — `getPackage` and `updatePackageVersion` already exist at :224 and :259.)

`skill-provider.ts` — imports: `import { installPlugin, upgradePluginFromLocal, refreshLocalMarketplaceCache, readPluginVersion, isPluginInstalled } from './plugin-installer';` plus `isNewerVersion` from `../shared/version-compare`, `BUNDLED_PLUGIN_IDS` (already), and `pluginInstallDir` (already). Replace :806-812:

```ts
  type ReconcileAction = 'installed' | 'upgraded' | 'unchanged' | 'skipped-dev' | 'failed';
  async reconcileBundledPlugins(): Promise<Array<{ id: string; action: ReconcileAction; from?: string; to?: string; error?: string }>> {
    const ids = [...BUNDLED_PLUGIN_IDS];
    // WHY: ~/.claude is shared with the live app; a run-dev.sh copy must never rewrite the real install.
    if (process.env.YOUCODED_PROFILE && process.env.YOUCODED_BUNDLED_UPGRADE !== '1') {
      return ids.map((id) => ({ id, action: 'skipped-dev' as const }));
    }
    let index = await this.fetchIndex();
    if (ids.some((id) => !index.find((e) => e.id === id))) {
      // WHY: a newly bundled plugin isn't in a day-old cached index; refetch once, only for this case.
      await this.invalidateCache(); index = await this.fetchIndex();
    }
    const refreshed = await refreshLocalMarketplaceCache('youcoded');
    if (!refreshed.ok) log('WARN', 'bundled-plugins', 'marketplace cache refresh failed; comparing against the last copy', { error: refreshed.error });
    const out: Array<{ id: string; action: ReconcileAction; from?: string; to?: string; error?: string }> = [];
    for (const id of ids) {
      const entry = index.find((e) => e.id === id);
      if (!entry) { out.push({ id, action: 'failed', error: `not in the marketplace index (${index.length} entries)` }); continue; }
      const sourceRef = entry.sourceRef || id; const mp = entry.sourceMarketplace ?? 'youcoded';
      const installDir = pluginInstallDir(id);
      if (!isPluginInstalled(id)) {
        const r = await installPlugin({ id, sourceType: entry.sourceType || 'local', sourceRef, sourceMarketplace: mp, description: entry.description, author: (entry as any).author, version: entry.version });
        if (r.status !== 'installed') { out.push({ id, action: 'failed', error: (r as any).error ?? r.status }); continue; }
        // WHY plugin.json's version, not the index's: B7 makes the index copy plugin.json,
        // so the renderer's "Update available" compare (package record vs index) stays in one number space.
        this.configStore.recordPackageInstall(id, { version: readPluginVersion(installDir) ?? entry.version ?? '1.0.0', source: 'marketplace', installedAt: new Date().toISOString(), removable: true, components: [{ type: 'plugin', path: installDir }] });
        this.installedCache = null; this.onCacheInvalidated?.();
        out.push({ id, action: 'installed', to: readPluginVersion(installDir) ?? undefined }); continue;
      }
      const installed = readPluginVersion(installDir); const available = readPluginVersion(path.join(os.homedir(), '.claude', 'youcoded-marketplace-cache', 'wecoded-marketplace', sourceRef));
      if (!isNewerVersion(installed ?? undefined, available ?? undefined)) { out.push({ id, action: 'unchanged', from: installed ?? undefined }); continue; }
      const r = await upgradePluginFromLocal(id, sourceRef, mp);
      if (r.status !== 'installed') { out.push({ id, action: 'failed', from: installed ?? undefined, to: available ?? undefined, error: (r as any).error ?? r.status }); continue; }
      this.configStore.updatePackageVersion(id, available ?? '1.0.0');
      this.installedCache = null; this.onCacheInvalidated?.();
      out.push({ id, action: 'upgraded', from: installed ?? undefined, to: available ?? undefined });
    }
    return out;
  }

  async ensureBundledPluginsInstalled(): Promise<void> {
    try {
      const results = await this.reconcileBundledPlugins();
      for (const r of results) if (r.action !== 'unchanged' && r.action !== 'skipped-dev') log(r.action === 'failed' ? 'ERROR' : 'INFO', 'bundled-plugins', r.action, r);
      if (results.some((r) => r.action === 'installed' || r.action === 'upgraded')) { try { reconcileHooks(); } catch {} try { await reconcileMcp(); } catch {} }
    } catch (err) {
      log('ERROR', 'bundled-plugins', 'reconcile failed', { error: String(err) });
    }
  }
```
Also `update()` (:319): when `result.status === 'already_installed'`, call `upgradePluginFromLocal(...)` for `sourceType === 'local'` before bumping the recorded version — so the Settings "Update" button actually replaces files. Record `readPluginVersion(installDir) ?? entry.version` — same number space as the index (B7).

- [ ] **Step 4: PASS. `bash scripts/verify.sh worktrees/bundled-upgrade` green. Commit**
```bash
git add src/main/skill-provider.ts src/shared/types.ts tests/skill-provider-bundled.test.ts
git commit -m "fix(plugins): bundled skills upgrade at launch when their plugin.json is newer; Update button really updates"
```

### Task B4: `${CLAUDE_PLUGIN_ROOT}` in the native harness

**Files:**
- Modify: `src/main/harness/skills/skill-catalog.ts:85-94`
- Test: `tests/skill-catalog-plugin-root.test.ts`

- [ ] **Step 1: Test**
```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createSkillCatalog } from '../src/main/harness/skills/skill-catalog';
it('substitutes ${CLAUDE_PLUGIN_ROOT} with the plugin root two levels above the skill dir', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-skillroot-'));
  const skillDir = path.join(root, 'plugins', 'youcoded-chatsearch', 'skills', 'chatsearch');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: chatsearch\n---\nrun node "${CLAUDE_PLUGIN_ROOT}/skills/chatsearch/scripts/chatsearch.js"');
  const cat = createSkillCatalog([{ id: 'chatsearch', displayName: 'x', description: 'y', skillDir } as any]);
  const body = cat.load('chatsearch').body;
  expect(body).toContain(`node "${path.join(root, 'plugins', 'youcoded-chatsearch')}/skills/chatsearch/scripts/chatsearch.js"`);
  expect(body).not.toContain('${');
});
```
- [ ] **Step 2: FAIL. Step 3:** in `load()` before the return: 
```ts
      // WHY: Claude Code fills ${CLAUDE_PLUGIN_ROOT} when it renders a plugin skill;
      // our harness must too, or every plugin's documented command runs as `node /skills/…`.
      const pluginRoot = path.dirname(path.dirname(entry.skillDir));
      const body = stripFrontmatter(raw).trim().split('${CLAUDE_PLUGIN_ROOT}').join(pluginRoot);
```
and return `body`.
- [ ] **Step 4: PASS. Commit** `git add src/main/harness/skills/skill-catalog.ts tests/skill-catalog-plugin-root.test.ts && git commit -m "fix(harness): fill \${CLAUDE_PLUGIN_ROOT} when rendering plugin skills"`

### Task B5: Android port + parity pin

**Files:**
- Create: `app/src/main/kotlin/com/youcoded/app/skills/VersionCompare.kt`
- Modify: `app/src/main/kotlin/com/youcoded/app/skills/PluginInstaller.kt`, `LocalSkillProvider.kt:487-493`
- Create: `app/src/test/kotlin/com/youcoded/app/skills/PluginInstallerUpgradeTest.kt`
- Modify: `desktop/tests/bundled-plugins-parity.test.ts`

**Interfaces (Kotlin):**
- `object VersionCompare { fun isNewer(installed: String?, latest: String?): Boolean }` — port of B1.
- `PluginInstaller.readPluginVersion(dir: File): String?`, `suspend fun refreshLocalMarketplaceCache(sourceMarketplace: String?): Boolean` (same 1 h gate as desktop, using the class's existing cache-timestamp helpers), `suspend fun upgradeFromLocal(id: String, sourceRef: String, sourceMarketplace: String?): InstallResult`, `fun cacheSourceDir(sourceRef: String, sourceMarketplace: String?): File`
- `LocalSkillProvider.reconcileBundledPlugins(): JSONArray` of `{id, action, from?, to?, error?}`; `ensureBundledPluginsInstalled()` calls it and logs.

- [ ] **Step 1: Parity pin first (desktop test)** — add to `bundled-plugins-parity.test.ts`:
```ts
  it('the Kotlin installer implements the same reconcile entry points', () => {
    const kt = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', 'app', 'src', 'main', 'kotlin', 'com', 'youcoded', 'app', 'skills', f), 'utf8');
    expect(kt('LocalSkillProvider.kt')).toMatch(/fun reconcileBundledPlugins\(/);
    expect(kt('PluginInstaller.kt')).toMatch(/fun upgradeFromLocal\(/);
    expect(kt('PluginInstaller.kt')).toMatch(/fun refreshLocalMarketplaceCache\(/);
    expect(kt('VersionCompare.kt')).toMatch(/fun isNewer\(/);
  });
```
Run → FAIL.

- [ ] **Step 2: Kotlin test** `PluginInstallerUpgradeTest.kt` (temp `homeDir`, no git: the cache clone is a plain directory; construct `PluginInstaller(tmpHome, mock(Bootstrap::class.java), SkillConfigStore(tmpHome))`):
```kotlin
class PluginInstallerUpgradeTest {
    private lateinit var tmpHome: File
    @Before fun setUp() { tmpHome = createTempDir(prefix = "youcoded-upgrade-") }
    @After fun tearDown() { tmpHome.deleteRecursively() }
    private fun write(path: String, content: String) { File(tmpHome, path).apply { parentFile?.mkdirs() }.writeText(content) }

    @Test fun `isNewer compares dotted versions`() {
        assertTrue(VersionCompare.isNewer("0.1.0", "0.2.0")); assertFalse(VersionCompare.isNewer("0.2.0", "0.1.0"))
        assertFalse(VersionCompare.isNewer("1.0.0", "1.0.0")); assertFalse(VersionCompare.isNewer(null, "1.0.0"))
        assertTrue(VersionCompare.isNewer("v1.2", "1.2.1"))
    }
    @Test fun `readPluginVersion reads root or dot-claude-plugin manifests`() {
        write("a/plugin.json", """{"version":"0.2.0"}"""); write("b/.claude-plugin/plugin.json", """{"version":"3.0.0"}""")
        val installer = PluginInstaller(tmpHome, mock(Bootstrap::class.java), SkillConfigStore(tmpHome))
        assertEquals("0.2.0", installer.readPluginVersion(File(tmpHome, "a")))
        assertEquals("3.0.0", installer.readPluginVersion(File(tmpHome, "b")))
        assertNull(installer.readPluginVersion(File(tmpHome, "c")))
    }
    @Test fun `upgradeFromLocal swaps the tree and registers the real version`() = runTest {
        write(".claude/youcoded-marketplace-cache/wecoded-marketplace/youcoded-chatsearch/plugin.json", """{"name":"youcoded-chatsearch","version":"0.2.0"}""")
        write(".claude/youcoded-marketplace-cache/wecoded-marketplace/youcoded-chatsearch/skills/x/SKILL.md", "new")
        write(".claude/plugins/marketplaces/youcoded/plugins/youcoded-chatsearch/plugin.json", """{"name":"youcoded-chatsearch","version":"0.1.0"}""")
        write(".claude/plugins/marketplaces/youcoded/plugins/youcoded-chatsearch/stale.txt", "gone")
        val installer = PluginInstaller(tmpHome, mock(Bootstrap::class.java), SkillConfigStore(tmpHome))
        val r = installer.upgradeFromLocal("youcoded-chatsearch", "youcoded-chatsearch", "youcoded")
        assertTrue(r is PluginInstaller.InstallResult.Success)
        assertFalse(File(tmpHome, ".claude/plugins/marketplaces/youcoded/plugins/youcoded-chatsearch/stale.txt").exists())
        assertEquals("new", File(tmpHome, ".claude/plugins/marketplaces/youcoded/plugins/youcoded-chatsearch/skills/x/SKILL.md").readText())
        val db = JSONObject(File(tmpHome, ".claude/plugins/installed_plugins.json").readText())
        assertEquals("0.2.0", db.getJSONObject("plugins").getJSONArray("youcoded-chatsearch@youcoded").getJSONObject(0).getString("version"))
    }
}
```
Run `./gradlew :app:testDebugUnitTest --tests "com.youcoded.app.skills.PluginInstallerUpgradeTest" -x bundleWebUi` → FAIL (unresolved references).

- [ ] **Step 3: Implement.** `VersionCompare.kt`:
```kotlin
package com.youcoded.app.skills
/** Port of desktop src/shared/version-compare.ts — keep the two in step. */
object VersionCompare {
    fun isNewer(installed: String?, latest: String?): Boolean {
        if (installed.isNullOrBlank() || latest.isNullOrBlank()) return false
        val a = installed.removePrefix("v").removePrefix("V").trim(); val b = latest.removePrefix("v").removePrefix("V").trim()
        if (a == b) return false
        val pa = a.split('.', '-', '+').map { it.toIntOrNull() }; val pb = b.split('.', '-', '+').map { it.toIntOrNull() }
        if (pa.any { it == null } || pb.any { it == null }) return a != b
        for (i in 0 until maxOf(pa.size, pb.size)) {
            val ai = pa.getOrNull(i) ?: 0; val bi = pb.getOrNull(i) ?: 0
            if (bi > ai) return true; if (bi < ai) return false
        }
        return false
    }
}
```
`PluginInstaller.kt` additions (inside the class):
```kotlin
    fun readPluginVersion(dir: File): String? = listOf(File(dir, "plugin.json"), File(dir, ".claude-plugin/plugin.json"))
        .firstOrNull { it.exists() }?.let { runCatching { JSONObject(it.readText()).optString("version").takeIf { v -> v.isNotEmpty() } }.getOrNull() }

    fun cacheSourceDir(sourceRef: String, sourceMarketplace: String?): File = File(File(cacheDir, getCacheRepoName(sourceMarketplace)), sourceRef)

    suspend fun refreshLocalMarketplaceCache(sourceMarketplace: String?): Boolean = withContext(Dispatchers.IO) {
        val cacheRepo = File(cacheDir, getCacheRepoName(sourceMarketplace)); val repoUrl = getMarketplaceRepo(sourceMarketplace)
        if (!cacheRepo.exists()) { cacheDir.mkdirs(); return@withContext runGit("clone", "--depth", "1", repoUrl, cacheRepo.absolutePath).also { if (it) setCacheTimestamp(cacheRepo) } }
        // WHY the 1 h gate (same as installFromLocal): reconcile runs on every launch; no gate = a GitHub round-trip per app start, on a phone.
        if (System.currentTimeMillis() - getCacheTimestamp(cacheRepo) < CACHE_REFRESH_MS) return@withContext true
        if (!runGit("-C", cacheRepo.absolutePath, "fetch", "origin")) return@withContext false
        runGit("-C", cacheRepo.absolutePath, "reset", "--hard", "origin/master").also { if (it) setCacheTimestamp(cacheRepo) }
    }

    /** Replace the installed tree with the cache copy via staging + rename; never delete the live dir first. */
    suspend fun upgradeFromLocal(id: String, sourceRef: String, sourceMarketplace: String?): InstallResult = withContext(Dispatchers.IO) {
        val sourceDir = cacheSourceDir(sourceRef, sourceMarketplace)
        if (!sourceDir.isDirectory) return@withContext InstallResult.Failed("Source not found in marketplace cache: $sourceRef")
        pluginsDir.mkdirs()
        val target = File(pluginsDir, id); val staging = File(pluginsDir, ".upgrade-$id"); val retired = File(pluginsDir, ".old-$id")
        staging.deleteRecursively(); retired.deleteRecursively()
        try {
            sourceDir.copyRecursively(staging, overwrite = true)
            if (target.exists() && !target.renameTo(retired)) return@withContext InstallResult.Failed("could not move the old plugin aside")
            if (!staging.renameTo(target)) { retired.renameTo(target); return@withContext InstallResult.Failed("could not move the new plugin into place") }
            retired.deleteRecursively()
        } catch (e: Exception) {
            if (!target.exists() && retired.exists()) retired.renameTo(target)
            staging.deleteRecursively()
            return@withContext InstallResult.Failed("upgrade copy failed: ${e.message}")
        }
        val version = readPluginVersion(target) ?: "1.0.0"
        ClaudeCodeRegistry.registerPluginInstall(homeDir, ClaudeCodeRegistry.RegisterInput(id = id, installPath = target.absolutePath, version = version, description = null, author = null, category = null))
        InstallResult.Success
    }
```
`LocalSkillProvider.kt` — replace :487-493:
```kotlin
    suspend fun reconcileBundledPlugins(): JSONArray {
        val out = JSONArray()
        val installer = pluginInstaller ?: return out.put(JSONObject().put("action", "failed").put("error", "installer not initialized"))
        var index = getMarketplaceIndex()
        if (BundledPlugins.IDS.any { id -> index.none { it.optString("id") == id } }) { invalidateCache(); index = getMarketplaceIndex() }
        installer.refreshLocalMarketplaceCache("youcoded")
        for (id in BundledPlugins.IDS) {
            val entry = index.firstOrNull { it.optString("id") == id }
            val row = JSONObject().put("id", id)
            if (entry == null) { out.put(row.put("action", "failed").put("error", "not in the marketplace index")); continue }
            val sourceRef = entry.optString("sourceRef").ifEmpty { id }; val mp = entry.optString("sourceMarketplace").ifEmpty { "youcoded" }
            val installDir = File(ClaudeCodeRegistry.youcodedPluginsDir(homeDir), id)
            if (!installer.isInstalled(id)) {
                val r = installer.install(entry)
                if (r !is PluginInstaller.InstallResult.Success) { out.put(row.put("action", "failed").put("error", (r as? PluginInstaller.InstallResult.Failed)?.error ?: r.toString())); continue }
                installedCache = null
                out.put(row.put("action", "installed").put("to", installer.readPluginVersion(installDir))); continue
            }
            val installed = installer.readPluginVersion(installDir); val available = installer.readPluginVersion(installer.cacheSourceDir(sourceRef, mp))
            if (!VersionCompare.isNewer(installed, available)) { out.put(row.put("action", "unchanged").put("from", installed)); continue }
            val r = installer.upgradeFromLocal(id, sourceRef, mp)
            if (r !is PluginInstaller.InstallResult.Success) { out.put(row.put("action", "failed").put("error", (r as? PluginInstaller.InstallResult.Failed)?.error ?: r.toString())); continue }
            configStore.updatePackageVersion(id, available ?: "1.0.0"); installedCache = null
            out.put(row.put("action", "upgraded").put("from", installed).put("to", available))
        }
        if ((0 until out.length()).any { out.getJSONObject(it).optString("action") in setOf("installed", "upgraded") }) { onPluginsChanged?.invoke(); hookReconciler?.reconcile(); mcpReconciler?.reconcile() }
        return out
    }

    suspend fun ensureBundledPluginsInstalled() {
        try { val r = reconcileBundledPlugins(); Log.i("BundledPlugins", r.toString()) }
        catch (e: Exception) { Log.w("BundledPlugins", "reconcile failed", e) }
    }
```
Use whatever the class already names its index getter (`getMarketplaceEntry` at :348 reads from a list — expose that list as `getMarketplaceIndex(): List<JSONObject>` if no such method exists) and its cache invalidator; `installer.isInstalled(id)` = `File(pluginsDir, id)` has a manifest (add as a one-liner if absent). Note Android has no dev-instance concept — no profile guard.

- [ ] **Step 4: Both test commands PASS** (`./gradlew :app:testDebugUnitTest --tests "com.youcoded.app.skills.PluginInstallerUpgradeTest" -x bundleWebUi`; `npx vitest run tests/bundled-plugins-parity.test.ts`).
- [ ] **Step 5: Commit**
```bash
git add app/src/main/kotlin/com/youcoded/app/skills/VersionCompare.kt app/src/main/kotlin/com/youcoded/app/skills/PluginInstaller.kt app/src/main/kotlin/com/youcoded/app/skills/LocalSkillProvider.kt app/src/test/kotlin/com/youcoded/app/skills/PluginInstallerUpgradeTest.kt desktop/tests/bundled-plugins-parity.test.ts
git commit -m "fix(android): bundled skills upgrade at launch — port of the desktop reconcile"
```

### Task B6: Marketplace CI — bundled plugin changes need a version bump

**Files:**
- Modify: `wecoded-marketplace/.github/workflows/validate-plugin-pr.yml` (new job after `validate`)

- [ ] **Step 1: Add the job**
```yaml
  bundled-version-bump:
    # WHY: the app upgrades bundled skills only when plugin.json's version rises.
    # A file change without a bump would ship to nobody who already has the skill.
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with: { fetch-depth: 0 }
      - name: Require a version bump when a bundled plugin's files change
        run: |
          BASE=${{ github.event.pull_request.base.sha }}
          FAIL=0
          for d in youcoded-chatsearch wecoded-themes-plugin wecoded-marketplace-publisher; do
            if git diff --quiet "$BASE" HEAD -- "$d/"; then continue; fi
            OLD=$(git show "$BASE:$d/plugin.json" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("version",""))' || echo "")
            NEW=$(python3 -c 'import json; print(json.load(open("'"$d"'/plugin.json")).get("version",""))')
            if [ "$OLD" = "$NEW" ]; then
              echo "::error file=$d/plugin.json::$d changed but its version is still '$NEW' — bump it so installed copies upgrade"
              FAIL=1
            else
              echo "$d: $OLD -> $NEW"
            fi
          done
          exit $FAIL
      - name: Run the chatsearch CLI tests when it changed
        if: always()
        run: |
          if git diff --quiet ${{ github.event.pull_request.base.sha }} HEAD -- youcoded-chatsearch/; then echo "unchanged"; exit 0; fi
          cd youcoded-chatsearch && npm test
```
Add `- uses: actions/setup-node@v7` with `node-version: 20` before the last step.

- [ ] **Step 2: Sanity-run the shell locally** against the Track A branch: `BASE=$(git merge-base master HEAD)` then the loop body — expect `youcoded-chatsearch: 0.1.0 -> 0.2.0`.
- [ ] **Step 3: Commit** `git add .github/workflows/validate-plugin-pr.yml && git commit -m "ci: bundled plugin changes must bump plugin.json"`

### Task B7: The marketplace index copies each plugin's own version

**Files:**
- Modify: `wecoded-marketplace/scripts/sync.js` (`mapEntry` loop for local entries ~:335-347; the diff loop ~:419-440)

**Why this task exists:** `sync.js` gives every listing its own made-up version — `1.0.0`, then the last digit bumped whenever the listing *text* changes (`hasChanges` ignores file edits). Chat Search is listed as `1.0.0` while its `plugin.json` says `0.1.0`. The app's marketplace screen shows "Update available" when the installed package record is behind the listing; B3 records `plugin.json` versions, so without this task `isNewerVersion('0.2.0', '1.0.0')` is true → every bundled plugin shows a badge forever, and their Update button is disabled (`MarketplaceDetailOverlay.tsx:276`), so nothing clears it. After this task, the listing carries the same number the app compares, and a `plugin.json` bump (B6 guarantees one) moves the listing on the next rebuild.

- [ ] **Step 1: Implement.** In the local-entries loop, after `mapEntry(...)`:
```js
    // WHY: bundled plugins (and any in-repo plugin with a plugin.json version)
    // must be listed under the SAME version the app reads from plugin.json —
    // the app's "Update available" badge compares the two. Plugins without a
    // manifest version keep the synthetic bump-on-metadata-change below.
    if (!isPrompt && entry.sourceType === "local") {
      const pluginDir = path.join(__dirname, "..", entry.sourceRef);
      for (const rel of ["plugin.json", ".claude-plugin/plugin.json"]) {
        try {
          const v = JSON.parse(fs.readFileSync(path.join(pluginDir, rel), "utf8")).version;
          if (typeof v === "string" && v) { entry.version = v; entry.manifestVersion = true; break; }
        } catch { /* no manifest here — try the next layout */ }
      }
    }
```
In the diff loop, immediately after `const prev = previousById.get(entry.id);`, short-circuit the three existing branches so a manifest-pinned version is never overwritten and `publishedAt` moves when it changes:
```js
    if (entry.manifestVersion) {
      delete entry.manifestVersion;
      if (prev && prev.version !== entry.version) { entry.publishedAt = today; updated++; }
      else if (prev) { entry.publishedAt = prev.publishedAt; if (prev.deprecated) { entry.deprecated = prev.deprecated; entry.deprecatedAt = prev.deprecatedAt; } unchanged++; }
      else added++;
      finalEntries.push(entry); continue;
    }
```
(`today` = the existing `new Date().toISOString().split("T")[0] + "T00:00:00Z"` expression — hoist it to a const.)

- [ ] **Step 2: Check locally without committing the rebuilt index.** `node scripts/sync.js` (it is what CI runs; set `GITHUB_TOKEN` for rate limits) → confirm `youcoded-chatsearch` in `index.json` now reads `0.2.0` (or `0.1.0` if A6 has not merged yet) and `wecoded-marketplace-publisher` reads `0.1.0`. Then `git checkout -- index.json skills/index.json stats.json sync-report.json` — CI's `rebuild` job regenerates them on merge; only the script is committed.

- [ ] **Step 3: Commit** `git add scripts/sync.js && git commit -m "fix(index): list in-repo plugins under their plugin.json version — the app compares against it"`

---

## Finishing

1. Track A: `bash scripts/verify.sh worktrees/chatsearch-writes` green → PR to `youcoded`; `npm test` green in `wecoded-marketplace` → PR there (the CLI PR must land **after** or **with** the CI job from B6, or its own bump is the first thing the new job checks — either order passes).
2. Track B: `bash scripts/verify.sh worktrees/bundled-upgrade` green + Android test class green → PR to `youcoded`. **B7 must merge before or with the `youcoded` PR** — the app change without the index change is the permanent-badge bug. The index rebuild only runs when a plugin dir changes, so the first rebuild that picks up B7 is the A6 merge (chatsearch bump); merge B6+B7 first, then A6.
3. Manual check for Destin (not automatable, per CLAUDE.md): launch a dev instance with `YOUCODED_CHATSEARCH_OUTBOX=1 YOUCODED_BUNDLED_UPGRADE=1`, run `{"cmd":"close","ids":["<one test conversation>"],"reason":"test"}` from a Claude Code session, watch the conversation list repaint and the receipt print. Run the same `close` again → every line says `already`. Then remove the test note in the app. Open Settings → marketplace: no "Update available" badge on the three bundled plugins.
4. After merge: ROADMAP lines 67–72 (chatsearch phase 2 + "bundled plugins never upgraded" + "newly bundled plugin cannot install for 24h" — B3's refetch fixes it) and 189 (`${CLAUDE_PLUGIN_ROOT}`) → `[x]`; spec + this plan move to `docs/archive/`; the 08-27 inventory's "mark complete in the app" list can be executed with `close`.
