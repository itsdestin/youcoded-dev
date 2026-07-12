# Conversation Store + CC Transcript Sync (Plan 2a) Implementation Plan

> **✅ SHIPPED 2026-07-11 — youcoded#116 merged to master (`ea2e1aa3`).** All 9 tasks executed via subagent-driven development (Opus implementers + two-stage review). 1577 tests green, tsc clean, build+installer clean. See the Execution Log at the bottom.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Implementer/reviewer agents run on **Opus** (Destin's standing preference).

**Goal:** Implement spec §1–§2 of `docs/superpowers/specs/2026-07-10-phase2-conversation-sync-design.md` — a per-conversation record store in the personal space, CC transcript mirror-in/materialize-out, and a Resume Browser that reads the store (legacy fallback intact). Leases (2b) and demolition (2c) are OUT of scope; **`sync-service.ts` is not touched** (PITFALLS standing rule).

**Architecture:** A new `desktop/src/main/conversations/` module family: pure record/heal logic (`store-core.ts`), an IO shell for record files (`conversation-store.ts`), transcript mirror/materialize (`transcript-mirror.ts`), a startup/periodic reconciler (`reconciler.ts`), and a module-singleton composition root (`service.ts`) mirroring `sync-spaces/service.ts`. Records live at `<personalRoot>/Conversations/<provider>/<id>.json`, transcripts at `<personalRoot>/Conversations/claude/transcripts/<projectKey>/<id>.jsonl` — inside the personal space, so the existing engine syncs them with **zero engine changes**. Live updates tap the single existing `transcriptWatcher.on('transcript-event')` seam in ipc-handlers; `turn-complete` triggers mirror-in + a prompt `syncSpacesSyncNow('personal')`. Materialize-out runs on personal-space `synced` events via a new main-process listener hook on sync-spaces service.

**Tech Stack:** TypeScript, Electron main, Vitest (real temp dirs — house convention), existing `cas-write.ts` primitives.

**Facts pinned at:** youcoded master `29ca27a0` (provider-seam merged: `SessionProvider = 'claude' | 'native'` at `src/shared/types.ts:35`).

---

## Sequencing & coordination (read before Task 1)

- **Do NOT touch `sync-service.ts`.** The legacy conversation-index machinery keeps running unchanged in parallel (dual-write happens at the IPC layer, not inside SyncService). Demolition is Plan 2c.
- **The store works with sync OFF too.** `startSyncSpaces()` always runs (main.ts:1443) and `getManagedRoots()` is non-null after it; only the engine is gated on the enable flag. Records write locally regardless; they simply don't travel until sync is enabled.
- Sharp edges (all real): never bare `npm test` (from `desktop/`: `npx vitest run <file>`; full suite `env -u YOUCODED_PROFILE -u YOUCODED_PORT_OFFSET npx vitest run`); WHY comments on every non-trivial edit (hard rule — non-developer owner); `tests/ipc-channels.test.ts` is the rebase-conflict magnet; the provider-seam track may still land renderer changes — rebase before the PR.
- Existing-code conventions to mirror: `sync-spaces/service.ts` (module-singleton composition root), `local-theme-synthesizer.ts` / `project/context-discovery.ts` (pure core + IO shell), `tests/sync-spaces-service.test.ts` (`vi.hoisted` fakes), `tests/session-browser.test.ts` (homedir stub + `vi.resetModules()` + dynamic import).

## Worktree setup

```bash
cd /c/Users/desti/youcoded-dev/youcoded && git fetch origin
git worktree add ../youcoded.wt/conversation-store -b feat/conversation-store origin/master
cd ../youcoded.wt/conversation-store/desktop && npm ci
```

## File structure

| File | Action | Responsibility |
|---|---|---|
| `desktop/src/main/conversations/store-core.ts` | Create | PURE: record type, validation, upsert-merge, conflict-copy healing fold, conflict-copy filename detection |
| `desktop/src/main/conversations/conversation-store.ts` | Create | IO shell: read/write/list record files under a root, heal-on-read, per-provider dirs |
| `desktop/src/main/conversations/transcript-mirror.ts` | Create | mirror-in (local → space, add/update-only) + materialize-out (space → local `~/.claude/projects/<slug>/`, add/update-only) |
| `desktop/src/main/conversations/reconciler.ts` | Create | scan `~/.claude/projects` → upsert records for sessions run outside the app |
| `desktop/src/main/conversations/service.ts` | Create | module singleton: start/stop, live transcript-event intake, turn-complete mirror + prompt sync, materialize-on-synced, flag/title writes |
| `desktop/src/main/sync-spaces/service.ts` | Modify | add `onSyncSpacesEvent(fn)` main-process listener hook (broadcast fan-out addition) |
| `desktop/src/main/session-browser.ts` | Modify | `listPastSessions` unions store rows over legacy rows |
| `desktop/src/shared/types.ts` | Modify | `PastSession` gains optional `device?`, `provider?`, `missingProject?` |
| `desktop/src/main/main.ts` | Modify | start/stop the conversations service |
| `desktop/src/main/ipc-handlers.ts` | Modify | transcript-event intake wiring; `session:set-flag` dual-write; topic-watcher title refresh |
| `desktop/src/renderer/components/ResumeBrowser.tsx` | Modify | disabled-resume note for `missingProject` rows |
| `desktop/tests/conversation-store-core.test.ts` | Create | pure-logic tests |
| `desktop/tests/conversation-store.test.ts` | Create | IO-shell tests (temp dirs) |
| `desktop/tests/transcript-mirror.test.ts` | Create | mirror/materialize invariant tests |
| `desktop/tests/conversation-reconciler.test.ts` | Create | scan/upsert tests |
| `desktop/tests/conversations-service.test.ts` | Create | composition-root tests (`vi.hoisted` fakes) |
| `desktop/tests/session-browser.test.ts` | Modify | store-union listing tests |

---

### Task 1: `store-core.ts` — pure record logic

**Files:**
- Create: `desktop/src/main/conversations/store-core.ts`
- Test: `desktop/tests/conversation-store-core.test.ts`

- [ ] **Step 1: Write the failing tests.** Cover this behavior contract (plain vitest, no mocks — the module is pure):

```ts
// desktop/tests/conversation-store-core.test.ts — behavior contract:
// parseRecord:
//  1. valid JSON with schema:1 and all required fields → the record object.
//  2. malformed JSON / wrong schema / missing id/provider/lastActive → null (never throws).
// mergeRecords (the upsert + healer fold — field-level, newest wins):
//  3. merge(base, incoming) where incoming.lastActive is newer → lastActive/device/title
//     from incoming; createdAt keeps the OLDER of the two; flags are merged per-flag by
//     flag.updatedAt (newest wins per flag key, both directions).
//  4. merge where incoming is OLDER → base's activity fields win but incoming's newer
//     individual flags still land (field-level, not record-level).
//  5. title: a non-empty title always beats an empty/'Untitled' one regardless of age;
//     two non-empty titles → newest lastActive side wins.
// isConflictCopyName:
//  6. 'abc123 (from Laptop, Jul 3).json' → true, and extractConflictBase returns 'abc123.json'.
//  7. 'abc123.json' → false.
// foldConflictCopies:
//  8. fold(canonical, [copy1, copy2]) === successive mergeRecords, order-independent
//     (associative for these fields — assert both orders give the same result).
```

- [ ] **Step 2: Run to verify failure** — from `desktop/`: `npx vitest run tests/conversation-store-core.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement:**

```ts
// desktop/src/main/conversations/store-core.ts
// PURE record logic for the Conversation Store (Phase 2a design §1).
// No fs/path/os imports — the IO shell (conversation-store.ts) does disk work.
// This is the same pure-core/IO-shell split as local-theme-synthesizer.ts.
import type { SessionProvider } from '../../shared/types';

export const RECORD_SCHEMA_VERSION = 1;

// One flag's state — matches the legacy conversation-index v2 shape so flags
// migrate losslessly in Plan 2c.
export interface FlagState { value: boolean; updatedAt: string }

export interface ConversationRecord {
  schema: number;
  id: string;                    // provider-stable conversation id (CC: session UUID)
  provider: SessionProvider | string; // 'claude' today; string-open for future providers
  projectName: string;           // portable cross-device key (folder basename)
  originalPath: string;          // path on the device that created it
  title: string;                 // '' means untitled
  lastActive: string;            // ISO-8601 — set at EVENT time, never from file mtime
  device: string;                // last device that ran a turn
  flags: Record<string, FlagState>;
  transcriptRef: string;         // space-relative, e.g. 'claude/transcripts/<key>/<id>.jsonl'
  createdAt: string;             // ISO-8601
}

// Parse + validate a record file's content. Returns null on anything invalid —
// a corrupt record must damage exactly one conversation, never the whole list.
export function parseRecord(json: string): ConversationRecord | null {
  let raw: any;
  try { raw = JSON.parse(json); } catch { return null; }
  if (!raw || typeof raw !== 'object') return null;
  if (raw.schema !== RECORD_SCHEMA_VERSION) return null;
  if (typeof raw.id !== 'string' || !raw.id) return null;
  if (typeof raw.provider !== 'string' || !raw.provider) return null;
  if (typeof raw.lastActive !== 'string' || Number.isNaN(Date.parse(raw.lastActive))) return null;
  return {
    schema: RECORD_SCHEMA_VERSION,
    id: raw.id,
    provider: raw.provider,
    projectName: typeof raw.projectName === 'string' ? raw.projectName : '',
    originalPath: typeof raw.originalPath === 'string' ? raw.originalPath : '',
    title: typeof raw.title === 'string' ? raw.title : '',
    lastActive: raw.lastActive,
    device: typeof raw.device === 'string' ? raw.device : '',
    flags: raw.flags && typeof raw.flags === 'object' ? raw.flags : {},
    transcriptRef: typeof raw.transcriptRef === 'string' ? raw.transcriptRef : '',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : raw.lastActive,
  };
}

const ts = (iso: string) => Date.parse(iso) || 0;

// Field-level merge, newest-wins per field group (design §1 healer rule).
// Used by BOTH the live upsert (base=on-disk, incoming=new event data) and the
// conflict-copy healer — one merge function so the two paths can't drift.
export function mergeRecords(a: ConversationRecord, b: ConversationRecord): ConversationRecord {
  // Activity fields travel together: whichever side saw the later turn knows
  // the true lastActive/device.
  const newer = ts(b.lastActive) >= ts(a.lastActive) ? b : a;
  const older = newer === a ? b : a;
  // Flags merge per-key by each flag's own updatedAt — a flag set on an idle
  // device must survive a merge with a busier device's record.
  const flags: Record<string, FlagState> = { ...older.flags };
  for (const [k, v] of Object.entries(newer.flags)) {
    const prev = flags[k];
    if (!prev || ts(v.updatedAt) >= ts(prev.updatedAt)) flags[k] = v;
  }
  for (const [k, v] of Object.entries(older.flags)) {
    const cur = flags[k];
    if (cur && ts(v.updatedAt) > ts(cur.updatedAt)) flags[k] = v;
  }
  // A real title always beats an empty one (auto-title can lag a turn behind).
  const title = newer.title || older.title;
  return {
    ...newer,
    title,
    flags,
    // createdAt is the conversation's birth — keep the earliest claim.
    createdAt: ts(a.createdAt) <= ts(b.createdAt) ? a.createdAt : b.createdAt,
  };
}

// Engine conflict copies look like '<base> (from <device>, <date>).json'
// (git-transport.ts conflictCopyName). The healer folds them back into the
// canonical record and deletes them.
const CONFLICT_RE = /^(.+) \(from [^)]+\)\.json$/;

export function isConflictCopyName(fileName: string): boolean {
  return CONFLICT_RE.test(fileName);
}

export function extractConflictBase(fileName: string): string | null {
  const m = CONFLICT_RE.exec(fileName);
  return m ? `${m[1]}.json` : null;
}

export function foldConflictCopies(
  canonical: ConversationRecord,
  copies: ConversationRecord[],
): ConversationRecord {
  return copies.reduce((acc, c) => mergeRecords(acc, c), canonical);
}
```

- [ ] **Step 4: Run** — `npx vitest run tests/conversation-store-core.test.ts` → PASS. `npx tsc -p tsconfig.json --noEmit` → clean.
- [ ] **Step 5: Commit** — `git add desktop/src/main/conversations desktop/tests/conversation-store-core.test.ts && git commit -m "feat(conversations): pure record logic — parse, field-level merge, conflict-copy fold"`

---

### Task 2: `conversation-store.ts` — record file IO shell

**Files:**
- Create: `desktop/src/main/conversations/conversation-store.ts`
- Test: `desktop/tests/conversation-store.test.ts`

Read first: `desktop/src/main/artifacts/cas-write.ts` (only `mutateFileUnderLock` and `casWrite` are exported — `acquireLock`/`atomicWrite` are private), `desktop/tests/sync-spaces-engine.test.ts` (temp-dir test style).

- [ ] **Step 1: Write the failing tests** (real temp dirs via `fs.mkdtempSync`, house style):

```ts
// desktop/tests/conversation-store.test.ts — behavior contract:
// (store = createConversationStore(conversationsRoot) where conversationsRoot is a temp dir)
// 1. upsert() on a missing record creates `<root>/claude/<id>.json` with schema 1
//    and returns the written record; the dir is created on demand.
// 2. upsert() on an existing record merges via mergeRecords (write a base record,
//    upsert a partial with newer lastActive → activity fields updated, flags kept).
// 3. get() returns null for missing/corrupt files (write literal garbage → null,
//    and the garbage file is left in place — never deleted by a read).
// 4. list('claude') returns every valid record; corrupt files are skipped silently.
// 5. HEALER: place `<id>.json` + `<id> (from Laptop, Jul 3).json` (a valid record
//    with a newer flag) → get(id) returns the folded record, the canonical file
//    now contains the fold, and the conflict copy file is DELETED.
// 6. Healer never touches non-record conflict copies (a `notes (from X).txt` in the
//    dir is ignored) and never crosses provider dirs.
// 7. setFlag(id, 'complete', true) creates the record if missing (flag-only seed —
//    empty title, lastActive = epoch sentinel '1970-01-01T00:00:00.000Z' so it never
//    outranks real activity in merges) and sets flags.complete with a fresh updatedAt.
// 8. Two concurrent upserts to the SAME id both land (run them via Promise.all; final
//    record contains the union — mutateFileUnderLock serializes them).
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement:**

```ts
// desktop/src/main/conversations/conversation-store.ts
// IO shell for Conversation Store records (design §1). All disk access for
// records lives HERE; decisions live in store-core.ts (pure).
// Records are one-file-per-conversation so the sync engine's generic conflict
// policy stays out of our way (design decision 6) — and the healer below cleans
// up the rare record-level conflict copies it does produce.
import fs from 'node:fs';
import path from 'node:path';
import { mutateFileUnderLock } from '../artifacts/cas-write';
import {
  ConversationRecord, RECORD_SCHEMA_VERSION, parseRecord, mergeRecords,
  isConflictCopyName, extractConflictBase, foldConflictCopies, FlagState,
} from './store-core';

export interface ConversationStore {
  upsert(partial: UpsertInput): Promise<ConversationRecord>;
  get(provider: string, id: string): Promise<ConversationRecord | null>;
  list(provider: string): Promise<ConversationRecord[]>;
  setFlag(provider: string, id: string, flag: string, value: boolean): Promise<void>;
  setTitle(provider: string, id: string, title: string): Promise<void>;
  root(): string;
}

export interface UpsertInput {
  id: string;
  provider: string;
  projectName?: string;
  originalPath?: string;
  title?: string;
  lastActive?: string;   // ISO — REQUIRED for activity updates; omitted for metadata-only
  device?: string;
  transcriptRef?: string;
}

const EPOCH = '1970-01-01T00:00:00.000Z';

export function createConversationStore(conversationsRoot: string): ConversationStore {
  const recordPath = (provider: string, id: string) =>
    path.join(conversationsRoot, provider, `${id}.json`);

  // Build the merge input from a partial. lastActive defaults to EPOCH so a
  // metadata-only upsert (flag/title seed) never outranks real activity.
  function toRecord(p: UpsertInput): ConversationRecord {
    const la = p.lastActive ?? EPOCH;
    return {
      schema: RECORD_SCHEMA_VERSION,
      id: p.id,
      provider: p.provider,
      projectName: p.projectName ?? '',
      originalPath: p.originalPath ?? '',
      title: p.title ?? '',
      lastActive: la,
      device: p.device ?? '',
      flags: {},
      transcriptRef: p.transcriptRef ?? '',
      createdAt: p.lastActive ?? new Date().toISOString(),
    };
  }

  async function mutateRecord(
    provider: string, id: string,
    fn: (onDisk: ConversationRecord | null) => ConversationRecord,
  ): Promise<ConversationRecord> {
    const target = recordPath(provider, id);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    let result!: ConversationRecord;
    // mutateFileUnderLock gives read-modify-write atomicity — the dev instance
    // and the built app share ~/YouCoded, so cross-process interleaving is a
    // normal state (same reasoning as the artifact central index).
    await mutateFileUnderLock(target, (onDisk) => {
      const existing = onDisk ? parseRecord(onDisk) : null;
      result = fn(existing);
      return JSON.stringify(result, null, 2);
    });
    return result;
  }

  // Heal engine conflict copies for one record id: fold field-level, rewrite
  // canonical, delete the copies. Runs opportunistically on read paths.
  async function heal(provider: string, id: string): Promise<void> {
    const dir = path.join(conversationsRoot, provider);
    let names: string[];
    try { names = fs.readdirSync(dir); } catch { return; }
    const copies = names.filter(
      (n) => isConflictCopyName(n) && extractConflictBase(n) === `${id}.json`,
    );
    if (copies.length === 0) return;
    const parsed = copies
      .map((n) => {
        try { return parseRecord(fs.readFileSync(path.join(dir, n), 'utf8')); }
        catch { return null; }
      })
      .filter((r): r is ConversationRecord => !!r && r.id === id);
    if (parsed.length > 0) {
      await mutateRecord(provider, id, (existing) =>
        foldConflictCopies(existing ?? parsed[0], existing ? parsed : parsed.slice(1)));
    }
    // Delete the copies whether or not they parsed — an unparseable record copy
    // carries nothing worth keeping and would re-trigger healing forever.
    for (const n of copies) {
      try { fs.unlinkSync(path.join(dir, n)); } catch { /* already gone */ }
    }
  }

  return {
    root: () => conversationsRoot,

    async upsert(partial) {
      await heal(partial.provider, partial.id);
      const incoming = toRecord(partial);
      return mutateRecord(partial.provider, partial.id, (existing) => {
        if (!existing) return incoming;
        // Metadata-only partials must not blank real fields: overlay only the
        // fields the caller actually provided, then field-merge.
        const overlay: ConversationRecord = {
          ...existing,
          ...(partial.projectName !== undefined && { projectName: partial.projectName }),
          ...(partial.originalPath !== undefined && { originalPath: partial.originalPath }),
          ...(partial.title !== undefined && { title: partial.title }),
          ...(partial.device !== undefined && { device: partial.device }),
          ...(partial.transcriptRef !== undefined && { transcriptRef: partial.transcriptRef }),
          lastActive: incoming.lastActive,
        };
        return mergeRecords(existing, overlay);
      });
    },

    async get(provider, id) {
      await heal(provider, id);
      try {
        return parseRecord(fs.readFileSync(recordPath(provider, id), 'utf8'));
      } catch { return null; }
    },

    async list(provider) {
      const dir = path.join(conversationsRoot, provider);
      let names: string[];
      try { names = fs.readdirSync(dir); } catch { return []; }
      // Heal any conflict copies found during a listing pass, then read clean.
      for (const n of names) {
        if (isConflictCopyName(n)) {
          const base = extractConflictBase(n);
          if (base) await heal(provider, base.replace(/\.json$/, ''));
        }
      }
      const out: ConversationRecord[] = [];
      for (const n of fs.readdirSync(dir)) {
        if (!n.endsWith('.json') || isConflictCopyName(n)) continue;
        try {
          const r = parseRecord(fs.readFileSync(path.join(dir, n), 'utf8'));
          if (r) out.push(r); // corrupt records damage one conversation, never the list
        } catch { /* unreadable file — skip */ }
      }
      return out;
    },

    async setFlag(provider, id, flag, value) {
      await mutateRecord(provider, id, (existing) => {
        const base = existing ?? toRecord({ id, provider, lastActive: undefined });
        const flags: Record<string, FlagState> = {
          ...base.flags,
          [flag]: { value, updatedAt: new Date().toISOString() },
        };
        return { ...base, flags };
      });
    },

    async setTitle(provider, id, title) {
      if (!title) return;
      await mutateRecord(provider, id, (existing) => {
        const base = existing ?? toRecord({ id, provider, lastActive: undefined });
        return { ...base, title };
      });
    },
  };
}
```

- [ ] **Step 4: Run** — `npx vitest run tests/conversation-store.test.ts tests/conversation-store-core.test.ts` → PASS; typecheck clean.
- [ ] **Step 5: Commit** — `git commit -m "feat(conversations): record IO shell — locked upserts, heal-on-read, per-provider dirs"` (add the two files).

---

### Task 3: `transcript-mirror.ts` — mirror-in + materialize-out

**Files:**
- Create: `desktop/src/main/conversations/transcript-mirror.ts`
- Test: `desktop/tests/transcript-mirror.test.ts`

Read first: `desktop/src/main/project-conversations.ts:26` (`ccProjectSlug` — the exported cwd→slug helper with drive-letter normalization), `desktop/src/main/transcript-watcher.ts:24-30` (`cwdToProjectSlug`).

- [ ] **Step 1: Write the failing tests** (temp dirs standing in for both `~/.claude/projects` and the space's `Conversations/` dir):

```ts
// desktop/tests/transcript-mirror.test.ts — behavior contract:
// mirrorIn({ localJsonlPath, spaceTranscriptPath }):
//  1. copies a new local transcript into the space (creating dirs) and returns
//     {copied:true}.
//  2. local file LARGER than space copy → overwrites (append-only growth).
//  3. local file identical size → no write (returns {copied:false}); verify via
//     mtime not changing (write, capture mtime, mirror again, compare).
//  4. local file MISSING → no-op, space copy untouched — CC cleanup must never
//     propagate as deletion (design invariant; this is the load-bearing test).
//  5. local file SMALLER than space copy → space copy untouched + returns
//     {copied:false, shrunk:true} (a /clear rewrite or foreign truncation must
//     not clobber the durable copy; the record's transcriptRef still points at
//     the fuller history).
// materializeOut({ spaceTranscriptPath, localJsonlPath }):
//  6. writes the space copy to the local path (creating `~/.claude/projects/<slug>/`)
//     when local is missing or smaller.
//  7. local file LARGER or equal → untouched (never clobber newer local work).
//  8. never deletes anything, ever.
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement:**

```ts
// desktop/src/main/conversations/transcript-mirror.ts
// CC transcript movement between the device and the personal space (design §2).
// BOTH directions are add/update-only and size-gated:
//  - mirror-in: the space copy is the DURABLE one. CC's cleanupPeriodDays
//    deleting a local transcript must never delete the synced copy, and a
//    local rewrite that SHRANK the file (e.g. /clear) must not clobber the
//    fuller durable history.
//  - materialize-out: local files are only ever created or grown, never
//    deleted, and never overwritten by a smaller/equal space copy.
// Size comparison (not content hash) is sufficient: CC transcripts are
// append-only JSONL between rewrites, and a same-size-different-content case
// resolves on the next turn's growth.
import fs from 'node:fs';
import path from 'node:path';

export interface MirrorResult { copied: boolean; shrunk?: boolean }

function sizeOf(p: string): number | null {
  try { return fs.statSync(p).size; } catch { return null; }
}

function copyInto(src: string, dest: string): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  // Copy via unique tmp + rename so a mid-copy crash never leaves a torn file
  // for the sync engine to push.
  const tmp = `${dest}.${process.pid}.${Date.now()}.tmp`;
  fs.copyFileSync(src, tmp);
  fs.renameSync(tmp, dest);
}

export function mirrorIn(opts: { localJsonlPath: string; spaceTranscriptPath: string }): MirrorResult {
  const localSize = sizeOf(opts.localJsonlPath);
  if (localSize === null) return { copied: false }; // local gone — NEVER propagate deletion
  const spaceSize = sizeOf(opts.spaceTranscriptPath);
  if (spaceSize !== null && localSize < spaceSize) return { copied: false, shrunk: true };
  if (spaceSize !== null && localSize === spaceSize) return { copied: false };
  copyInto(opts.localJsonlPath, opts.spaceTranscriptPath);
  return { copied: true };
}

export function materializeOut(opts: { spaceTranscriptPath: string; localJsonlPath: string }): MirrorResult {
  const spaceSize = sizeOf(opts.spaceTranscriptPath);
  if (spaceSize === null) return { copied: false };
  const localSize = sizeOf(opts.localJsonlPath);
  if (localSize !== null && localSize >= spaceSize) return { copied: false };
  copyInto(opts.spaceTranscriptPath, opts.localJsonlPath);
  return { copied: true };
}
```

- [ ] **Step 4: Run** — `npx vitest run tests/transcript-mirror.test.ts` → PASS; typecheck clean.
- [ ] **Step 5: Commit** — `git commit -m "feat(conversations): transcript mirror — add/update-only both directions, shrink-guarded"`.

---

### Task 4: `reconciler.ts` — catch-up scan

**Files:**
- Create: `desktop/src/main/conversations/reconciler.ts`
- Test: `desktop/tests/conversation-reconciler.test.ts`

Read first: `desktop/src/main/session-browser.ts:170` (`readSessionTranscriptMeta(jsonlPath, wantTitle)` → `{ fallbackTitle, lastTimestampMs }` — bounded head/tail reads), `session-browser.ts:119-130` (`readTopic` precedence), `sync-service.ts:127` (`SESSION_UUID_RE`).

- [ ] **Step 1: Write the failing tests:**

```ts
// desktop/tests/conversation-reconciler.test.ts — behavior contract:
// reconcile({ projectsDir, topicsDir, store, device, mirror }) with a temp
// ~/.claude/projects tree containing <slug>/<uuid>.jsonl fixtures (reuse
// session-browser.test.ts's jsonlLine/writeTranscript helper style):
// 1. creates a record per transcript whose filename is a valid session UUID:
//    projectName = folder basename recovered from the slug's LAST path segment
//    (documented approximation), originalPath = slug-decoded best effort,
//    lastActive = the transcript's LAST JSONL timestamp (readSessionTranscriptMeta
//    .lastTimestampMs → ISO) — NEVER the file mtime (set the file's mtime to a
//    wildly different time in the fixture and assert lastActive matches the
//    JSONL content, not the mtime).
// 2. filenames failing SESSION_UUID_RE are skipped (no record created).
// 3. an EXISTING record with lastActive >= the transcript's tail timestamp is
//    not touched (upsert merge keeps newest — assert device field unchanged).
// 4. title: topic file `topic-<id>` content wins; else the derived first-user-
//    message fallbackTitle; else '' (record stays untitled).
// 5. each scanned transcript is mirrored into the space via the injected mirror
//    fn (assert called with the right space-relative ref for its projectKey).
// 6. transcripts <500 bytes are skipped (same junk threshold as the browser).
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement:**

```ts
// desktop/src/main/conversations/reconciler.ts
// Catch-up scan (design §1): sessions run OUTSIDE the app (bare `claude` in a
// terminal) never fire the live transcript-event path, so on startup (and a
// slow periodic tick) we walk ~/.claude/projects and upsert records for what
// we find. The live path remains authoritative — the upsert merge keeps the
// newest data, so re-scanning is always safe.
import fs from 'node:fs';
import path from 'node:path';
import { readSessionTranscriptMeta } from '../session-browser';
import type { ConversationStore } from './conversation-store';

// Same UUID gate as the legacy index (sync-service.ts SESSION_UUID_RE) — the
// phantom-id lesson from the Resume Browser incident: never create records
// from malformed ids.
const SESSION_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_TRANSCRIPT_BYTES = 500; // junk threshold, same as listPastSessions

export interface ReconcileOpts {
  projectsDir: string;   // ~/.claude/projects
  topicsDir: string;     // ~/.claude/topics
  store: ConversationStore;
  device: string;
  // Injected so tests don't need a real space; production passes a closure over
  // transcript-mirror + the Conversations root.
  mirror: (localJsonlPath: string, projectKey: string, sessionId: string) => void;
}

// A CC slug is the cwd with separators flattened to '-' (cwdToProjectSlug).
// The original path is not recoverable in general; the basename approximation
// (last '-' segment) is good enough for projectName matching, and the record's
// originalPath is corrected by the live path the next time the session runs
// in the app.
function projectNameFromSlug(slug: string): string {
  const parts = slug.split('-').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : slug;
}

function readTopicTitle(topicsDir: string, sessionId: string): string {
  try {
    const t = fs.readFileSync(path.join(topicsDir, `topic-${sessionId}`), 'utf8').trim();
    if (t && t !== 'New Session' && t !== 'Untitled') return t;
  } catch { /* no topic file */ }
  return '';
}

export async function reconcile(opts: ReconcileOpts): Promise<number> {
  let upserts = 0;
  let slugs: string[] = [];
  try { slugs = fs.readdirSync(opts.projectsDir); } catch { return 0; }
  for (const slug of slugs) {
    const dir = path.join(opts.projectsDir, slug);
    let files: string[] = [];
    try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')); } catch { continue; }
    for (const file of files) {
      const sessionId = file.replace(/\.jsonl$/, '');
      if (!SESSION_UUID_RE.test(sessionId)) continue;
      const jsonlPath = path.join(dir, file);
      let size = 0;
      try { size = fs.statSync(jsonlPath).size; } catch { continue; }
      if (size < MIN_TRANSCRIPT_BYTES) continue;

      const existing = await opts.store.get('claude', sessionId);
      const meta = await readSessionTranscriptMeta(jsonlPath, !existing?.title);
      // lastActive from the transcript's own content timestamp — mtimes lie
      // after any sync/restore (the 627-file rebump incident).
      const lastActive = meta.lastTimestampMs ? new Date(meta.lastTimestampMs).toISOString() : null;
      if (existing && lastActive && Date.parse(existing.lastActive) >= Date.parse(lastActive)) {
        // Record already as fresh as the file — still mirror (cheap size check).
        opts.mirror(jsonlPath, existing.projectName || projectNameFromSlug(slug), sessionId);
        continue;
      }
      const projectName = existing?.projectName || projectNameFromSlug(slug);
      const title = readTopicTitle(opts.topicsDir, sessionId) || meta.fallbackTitle || '';
      await opts.store.upsert({
        id: sessionId,
        provider: 'claude',
        projectName,
        title: title || undefined,
        lastActive: lastActive ?? undefined,
        device: opts.device,
        transcriptRef: `claude/transcripts/${projectName}/${sessionId}.jsonl`,
      });
      opts.mirror(jsonlPath, projectName, sessionId);
      upserts++;
    }
  }
  return upserts;
}
```

- [ ] **Step 4: Run** — `npx vitest run tests/conversation-reconciler.test.ts` → PASS; typecheck clean.
- [ ] **Step 5: Commit** — `git commit -m "feat(conversations): reconciler — UUID-gated catch-up scan, content-timestamp lastActive"`.

---

### Task 5: sync-spaces main-process listener hook

**Files:**
- Modify: `desktop/src/main/sync-spaces/service.ts`
- Test: `desktop/tests/sync-spaces-service.test.ts` (append)

- [ ] **Step 1: Write the failing tests** (append to the existing file, following its `vi.hoisted` + `freshService()` conventions):

```ts
// behavior contract:
// 1. onSyncSpacesEvent(fn) subscribes; an engine event reaches fn with the
//    stamped `at` field; the returned unsubscribe fn stops delivery.
// 2. a listener that THROWS does not break other listeners or the window/
//    remote/hub fan-outs (assert a second listener still fires and the event
//    still lands in recentEvents).
```

- [ ] **Step 2: Run to verify the new tests fail.**

- [ ] **Step 3: Implement** in `service.ts` — module state + export + fan-out:

```ts
// Main-process subscribers (conversations service materializes on 'synced').
// Renderer/remote consumers use the existing window/remote fan-outs; this hook
// exists because main-process modules have no webContents to receive on.
const localListeners = new Set<(e: SpaceSyncEvent) => void>();

export function onSyncSpacesEvent(fn: (e: SpaceSyncEvent) => void): () => void {
  localListeners.add(fn);
  return () => localListeners.delete(fn);
}
```

In `broadcast()`, after the existing window fan-out (each listener isolated — same rationale as the sibling blocks):

```ts
  for (const fn of localListeners) {
    try { fn(stamped); } catch { /* one bad listener must not strand the rest */ }
  }
```

- [ ] **Step 4: Run** — `npx vitest run tests/sync-spaces-service.test.ts` → PASS (existing 12 + 2 new); typecheck clean.
- [ ] **Step 5: Commit** — `git commit -m "feat(sync-spaces): onSyncSpacesEvent main-process listener hook (isolated fan-out)"`.

---

### Task 6: `conversations/service.ts` — composition root + wiring

**Files:**
- Create: `desktop/src/main/conversations/service.ts`
- Modify: `desktop/src/main/main.ts`, `desktop/src/main/ipc-handlers.ts`
- Test: `desktop/tests/conversations-service.test.ts`

Read first: `desktop/src/main/sync-spaces/service.ts` (the module-singleton pattern this clones), `desktop/src/main/ipc-handlers.ts:1686-1713` (the transcript-event seam), `ipc-handlers.ts:1854` (where cwd is known at startWatching), `ipc-handlers.ts:1885` (`session:set-flag` handler), `ipc-handlers.ts:1745-1795` (topic watchers), `main.ts:1426-1462` (init order), `desktop/tests/sync-spaces-service.test.ts` (harness conventions).

- [ ] **Step 1: Write the failing tests** (`vi.hoisted` fakes for the store/mirror/reconciler/sync-spaces service, mirroring sync-spaces-service.test.ts):

```ts
// desktop/tests/conversations-service.test.ts — behavior contract:
// startConversationStore({conversationsRoot, projectsDir, topicsDir, device}):
// 1. runs the reconciler once at start (fake reconciler called with the dirs).
// 2. noteSessionStarted(claudeSessionId, cwd) then noteTranscriptEvent(ev) with
//    ev.type='user-message' → store.upsert called with {id: claudeSessionId,
//    provider:'claude', projectName: basename(cwd), originalPath: cwd,
//    lastActive: <ISO of ev.timestamp>, device}.
// 3. ev.type='turn-complete' → additionally mirrorIn is called (local jsonl path
//    computed via ccProjectSlug(cwd)) AND requestPersonalSync() fires (fake
//    syncSpacesSyncNow spy called with 'personal') — transcripts push promptly,
//    not on the 15s quiet window (design §2).
// 4. a personal-space {type:'synced', updated:true} event from the (faked)
//    onSyncSpacesEvent subscription triggers a materialize sweep: for each store
//    record whose projectName matches a known local folder (fake matcher), the
//    injected materializeOut is called with the local slug path; records with no
//    local match are skipped.
// 5. noteTitleChanged(claudeSessionId, title) → store.setTitle('claude', id, title).
// 6. noteFlagChanged(claudeSessionId, flag, value) → store.setFlag(...).
// 7. stopConversationStore() unsubscribes (a later synced event does nothing) and
//    clears the periodic timer (vi.useFakeTimers: advance past the interval,
//    reconciler NOT called again).
// 8. events for sessions never announced via noteSessionStarted (no cwd known)
//    still upsert with projectName '' (record exists; live path corrects later —
//    matches the reconciler's approximation rule).
// 9. transcript events with type 'assistant-text'/'tool-use'... update lastActive
//    at most once per 5s per session (debounce — assert two rapid events → one
//    upsert; the turn-complete path is NOT debounced).
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement `service.ts`:**

```ts
// desktop/src/main/conversations/service.ts
// Composition root for the Conversation Store (design §1–§2). Module singleton
// like sync-spaces/service.ts. Owns: the store instance, live transcript-event
// intake (debounced activity upserts; prompt mirror+push on turn-complete),
// title/flag write-through, the startup + periodic reconciler, and the
// materialize-on-synced subscription.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createConversationStore, ConversationStore } from './conversation-store';
import { mirrorIn, materializeOut } from './transcript-mirror';
import { reconcile } from './reconciler';
import { ccProjectSlug } from '../project-conversations';
import { onSyncSpacesEvent, syncSpacesSyncNow, getManagedRoots } from '../sync-spaces/service';
import type { TranscriptEvent } from '../../shared/types';

const ACTIVITY_DEBOUNCE_MS = 5_000;
const RECONCILE_INTERVAL_MS = 30 * 60_000; // slow tick; startup scan is the load-bearing one

interface SessionCtx { cwd: string }

let store: ConversationStore | null = null;
let projectsDir = '';
let topicsDir = '';
let device = '';
let unsubscribe: (() => void) | null = null;
let reconcileTimer: NodeJS.Timeout | null = null;
const sessions = new Map<string, SessionCtx>();          // claudeSessionId → ctx
const pendingActivity = new Map<string, NodeJS.Timeout>(); // debounce timers

export function getConversationStore(): ConversationStore | null { return store; }

export async function startConversationStore(opts?: {
  conversationsRoot?: string; projectsDir?: string; topicsDir?: string; device?: string;
}): Promise<void> {
  const personalRoot = getManagedRoots()?.personalRoot;
  const root = opts?.conversationsRoot
    ?? (personalRoot ? path.join(personalRoot, 'Conversations') : null);
  if (!root) return; // managed roots unavailable — store stays off this launch
  projectsDir = opts?.projectsDir ?? path.join(os.homedir(), '.claude', 'projects');
  topicsDir = opts?.topicsDir ?? path.join(os.homedir(), '.claude', 'topics');
  device = opts?.device ?? os.hostname();
  store = createConversationStore(root);

  // Materialize when the personal space pulls new content. Sweep is cheap:
  // size-compare per record, write only growth.
  unsubscribe = onSyncSpacesEvent((e) => {
    if (e.type === 'synced' && e.spaceId === 'personal' && e.updated) void materializeSweep();
  });

  await runReconcile();
  reconcileTimer = setInterval(() => { void runReconcile(); }, RECONCILE_INTERVAL_MS);
  // Timers must not keep a quitting app alive.
  reconcileTimer.unref?.();
}

export function stopConversationStore(): void {
  unsubscribe?.(); unsubscribe = null;
  if (reconcileTimer) { clearInterval(reconcileTimer); reconcileTimer = null; }
  for (const t of pendingActivity.values()) clearTimeout(t);
  pendingActivity.clear();
  sessions.clear();
  store = null;
}

// ipc-handlers calls this where it already knows the cwd (its startWatching path).
export function noteSessionStarted(claudeSessionId: string, cwd: string): void {
  sessions.set(claudeSessionId, { cwd });
}

function spaceTranscriptPath(projectKey: string, sessionId: string): string {
  return path.join(store!.root(), 'claude', 'transcripts', projectKey, `${sessionId}.jsonl`);
}

function localJsonlPath(cwd: string, sessionId: string): string {
  return path.join(projectsDir, ccProjectSlug(cwd), `${sessionId}.jsonl`);
}

// Live intake. `claudeSessionId` is resolved by the caller (ipc-handlers owns
// the desktop→claude id map); events arrive for every type — we debounce the
// chatty ones and act promptly on turn-complete.
export function noteTranscriptEvent(claudeSessionId: string, ev: TranscriptEvent): void {
  if (!store) return;
  const ctx = sessions.get(claudeSessionId);
  const upsertNow = () => {
    pendingActivity.delete(claudeSessionId);
    void store?.upsert({
      id: claudeSessionId,
      provider: 'claude',
      projectName: ctx ? path.basename(ctx.cwd) : undefined,
      originalPath: ctx?.cwd,
      lastActive: new Date(ev.timestamp).toISOString(),
      device,
      transcriptRef: ctx
        ? `claude/transcripts/${path.basename(ctx.cwd)}/${claudeSessionId}.jsonl`
        : undefined,
    });
  };

  if (ev.type === 'turn-complete') {
    upsertNow();
    if (ctx) {
      const key = path.basename(ctx.cwd);
      try {
        mirrorIn({
          localJsonlPath: localJsonlPath(ctx.cwd, claudeSessionId),
          spaceTranscriptPath: spaceTranscriptPath(key, claudeSessionId),
        });
      } catch { /* mirror is best-effort; reconciler catches up */ }
      // Prompt push (design §2): conversations move faster than the engine's
      // 15s quiet window. syncSpace is single-flight — bursts coalesce.
      void syncSpacesSyncNow('personal');
    }
    return;
  }
  // Chatty event types: coalesce activity updates.
  if (!pendingActivity.has(claudeSessionId)) {
    const t = setTimeout(upsertNow, ACTIVITY_DEBOUNCE_MS);
    t.unref?.();
    pendingActivity.set(claudeSessionId, t);
  }
}

export function noteTitleChanged(claudeSessionId: string, title: string): void {
  void store?.setTitle('claude', claudeSessionId, title);
}

export function noteFlagChanged(claudeSessionId: string, flag: string, value: boolean): void {
  void store?.setFlag('claude', claudeSessionId, flag, value);
}

// Map a record's projectName/originalPath to a local folder. Prefer the exact
// original path when it exists here; else match a saved folder or managed
// project by basename. Ambiguity resolves to the first match — corrected the
// next time the session actually runs on this device.
function resolveLocalProject(rec: { projectName: string; originalPath: string }): string | null {
  if (rec.originalPath && fs.existsSync(rec.originalPath)) return rec.originalPath;
  const roots = getManagedRoots();
  if (roots) {
    for (const p of roots.listProjects()) {
      if (p.name === rec.projectName) return p.path;
    }
  }
  try {
    // Lazy import avoids a cycle: saved-folders has no deps on us.
    const { readFolders } = require('../saved-folders') as typeof import('../saved-folders');
    const hit = readFolders().find((f) => path.basename(f.path) === rec.projectName);
    if (hit && fs.existsSync(hit.path)) return hit.path;
  } catch { /* saved folders unreadable */ }
  return null;
}

async function materializeSweep(): Promise<void> {
  if (!store) return;
  const records = await store.list('claude');
  for (const rec of records) {
    if (!rec.transcriptRef) continue;
    const local = resolveLocalProject(rec);
    if (!local) continue; // project not on this device — visible in browser, resume disabled
    try {
      materializeOut({
        spaceTranscriptPath: path.join(store.root(), rec.transcriptRef),
        localJsonlPath: localJsonlPath(local, rec.id),
      });
    } catch { /* per-record isolation — one bad file must not stop the sweep */ }
  }
}

async function runReconcile(): Promise<void> {
  if (!store) return;
  try {
    await reconcile({
      projectsDir, topicsDir, store, device,
      mirror: (localPath, projectKey, sessionId) => {
        try {
          mirrorIn({ localJsonlPath: localPath, spaceTranscriptPath: spaceTranscriptPath(projectKey, sessionId) });
        } catch { /* best-effort */ }
      },
    });
  } catch { /* reconciler failure must never break startup */ }
}
```

**`main.ts` wiring** (after `startSyncSpaces` — managed roots must exist; find the `await startSyncSpaces(...)` block ending near line 1459):

```ts
// Conversation Store (Phase 2a): records + transcript sync ride the personal
// space. Started after sync-spaces so getManagedRoots() is available.
const { startConversationStore } = await import('./conversations/service');
await startConversationStore();
```

and in the quit path next to `stopSyncSpaces()`: `stopConversationStore()` (import alongside).

**`ipc-handlers.ts` wiring** (three small touches, each with a WHY comment):
1. Next to the existing `transcriptWatcher.on('transcript-event', ...)` at ~1688: resolve the claude id for `event.sessionId` via the existing `sessionIdMap` and call `noteTranscriptEvent(claudeId, event)` (skip if unresolved).
2. In the local `startWatching(desktopId, claudeId)` fn (~1745) where `sessionInfo.cwd` is in hand (~1854): `noteSessionStarted(claudeId, sessionInfo.cwd)`.
3. In the `session:set-flag` handler (~1885), after the legacy `getSyncService().setSessionFlag(...)`: `noteFlagChanged(resolvedId, flag, !!value)` — dual-write during the transition (legacy index untouched; Plan 2c deletes it). In the topic-watcher callback (~1745-1795) where a topic file change is read: `noteTitleChanged(sessionId, newTitle)`.

- [ ] **Step 4: Run** — `npx vitest run tests/conversations-service.test.ts tests/sync-spaces-service.test.ts` → PASS; typecheck clean.
- [ ] **Step 5: Commit** — `git commit -m "feat(conversations): composition root — live intake, prompt push on turn-end, materialize-on-synced"` (add service.ts + main.ts + ipc-handlers.ts + test).

---

### Task 7: Resume Browser reads the store

**Files:**
- Modify: `desktop/src/main/session-browser.ts`, `desktop/src/shared/types.ts`
- Modify: `desktop/src/renderer/components/ResumeBrowser.tsx`
- Test: `desktop/tests/session-browser.test.ts` (append)

Read first: `session-browser.ts:238-330` (`listPastSessions` — row build, dedup, sort), `types.ts:557-573` (`PastSession`), `ResumeBrowser.tsx:164-175` (its local `PastSession` mirror), `ResumeBrowser.tsx:417` (onResume args), `desktop/tests/session-browser.test.ts` (homedir-stub + `vi.resetModules()` harness).

- [ ] **Step 1: Write the failing tests** (append; same harness):

```ts
// behavior contract (store dir seeded under the stubbed homedir at
// YouCoded/Personal/Conversations/claude/):
// 1. a store record with NO local transcript (remote-device conversation) appears
//    in listPastSessions with name=title, lastModified=Date.parse(lastActive),
//    flags mapped from record.flags (truthy values only), missingProject=true
//    when its project resolves to no local folder, device + provider populated.
// 2. a store record whose id ALSO exists as a local transcript (both sources) →
//    ONE row (store wins on name/lastModified/flags; projectSlug/projectPath
//    from the local transcript so resume keeps working).
// 3. a local transcript with NO store record (store empty / sync off) → legacy
//    row exactly as before (regression guard on the existing fields).
// 4. rows sort by lastModified desc across BOTH sources.
// 5. store list failures (unreadable dir) degrade to the legacy list silently.
```

- [ ] **Step 2: Run to verify the new tests fail.**

- [ ] **Step 3: Implement.**

`types.ts` — extend `PastSession` (optional fields; renderer mirror updated to match):

```ts
  device?: string;         // last device that ran a turn (store-fed rows)
  provider?: string;       // 'claude' | 'native' — store-fed rows
  missingProject?: boolean; // true when the conversation's project folder is not on this device
```

`session-browser.ts` — inside `listPastSessions`, after the legacy rows are built (before dedup/sort), union in store rows:

```ts
  // Store union (Phase 2a): the Conversation Store is the canonical record;
  // legacy scanning stays as the fallback until Plan 2c deletes it. Store rows
  // win on metadata; legacy rows win on projectSlug/projectPath (resume needs
  // the LOCAL slug, which the store doesn't know for remote conversations).
  try {
    const { getConversationStore } = await import('./conversations/service');
    const store = getConversationStore();
    if (store) {
      const records = await store.list('claude');
      const bySession = new Map(rows.map((r) => [r.sessionId, r]));
      for (const rec of records) {
        const legacy = bySession.get(rec.id);
        const flags: PastSession['flags'] = {};
        for (const [k, v] of Object.entries(rec.flags)) {
          if (v.value && (k === 'complete' || k === 'priority' || k === 'helpful')) flags[k] = true;
        }
        if (legacy) {
          legacy.name = rec.title || legacy.name;
          legacy.lastModified = Math.max(legacy.lastModified, Date.parse(rec.lastActive) || 0);
          if (Object.keys(flags).length) legacy.flags = flags;
          legacy.device = rec.device || undefined;
          legacy.provider = rec.provider;
        } else {
          const localPath = rec.originalPath && fs.existsSync(rec.originalPath) ? rec.originalPath : null;
          rows.push({
            sessionId: rec.id,
            name: rec.title || 'Untitled',
            projectSlug: localPath ? cwdToProjectSlug(localPath) : '',
            projectPath: localPath ?? rec.originalPath,
            lastModified: Date.parse(rec.lastActive) || 0,
            size: 0,
            ...(Object.keys(flags).length ? { flags } : {}),
            device: rec.device || undefined,
            provider: rec.provider,
            ...(localPath ? {} : { missingProject: true }),
          });
        }
      }
    }
  } catch { /* store unavailable — legacy list stands alone */ }
```

(`cwdToProjectSlug` imported from `./transcript-watcher` — it's the exported canonical encoder; drive-case normalize first like `ccProjectSlug` does: reuse `ccProjectSlug` from `./project-conversations` instead if the path may have a lowercase drive.)

`ResumeBrowser.tsx` — extend its local `PastSession` mirror with the three optional fields; where the row's resume affordance renders, gate on `missingProject`:

```tsx
{s.missingProject ? (
  // Plain words, no glyphs (house rule). The conversation is visible everywhere;
  // resume needs the project folder present on this device.
  <span className="text-xs text-fg-muted">Project folder not on this device</span>
) : (
  /* existing resume button/handler unchanged */
)}
```

and skip the `onResume` invocation for `missingProject` rows (guard at the top of the click handler).

- [ ] **Step 4: Run** — `npx vitest run tests/session-browser.test.ts` → PASS; typecheck clean.
- [ ] **Step 5: Commit** — `git commit -m "feat(conversations): Resume Browser store union — store metadata wins, resume gated on local project"`.

---

### Task 8: Full verification + PR

- [ ] **Step 1:** From `desktop/`: `env -u YOUCODED_PROFILE -u YOUCODED_PORT_OFFSET npx vitest run` → ALL green; `npx tsc -p tsconfig.json --noEmit` → clean; `npm run build` → clean.
- [ ] **Step 2:** Rebase onto origin/master (`git fetch origin && git rebase origin/master`), re-run the full suite after any rebase (`npm ci` first if package-lock changed — parallel tracks add deps).
- [ ] **Step 3 (live sanity, dev instance):** `bash scripts/run-dev.sh` (check port 5223 free first) → run a short session → verify `~/YouCoded/Personal/Conversations/claude/<id>.json` appears with correct title/lastActive, transcript mirrors under `claude/transcripts/<projectKey>/`, and the Resume Browser still lists everything. Shut the dev instance down after.
- [ ] **Step 4:** PR on `itsdestin/youcoded` from `feat/conversation-store` to master. Body: store design (per-record files, healer, add/update-only invariants), what's deliberately NOT here (leases 2b, demolition 2c, sync-service untouched), and the dogfood note (two-device verification is the gate before Plan 2b).
- [ ] **Step 5:** After merge: clean up worktree + branch.

---

### Task 9: Docs (coordinator)

- [ ] **Step 1:** `docs/PITFALLS.md → Sync Spaces` — new "Conversation Store (Plan 2a)" subsection: mirror-in add/update-only (CC cleanup must never propagate — the load-bearing invariant), shrink-guard both directions, lastActive from record/content never mtime, healer folds field-level and deletes copies (engine conflict policy gets no special cases), records damage one conversation never the list, store works with sync off, `sync-service.ts` still untouched until 2c, the reconciler's UUID gate, `onSyncSpacesEvent` isolation.
- [ ] **Step 2:** Check this plan's boxes, append an execution log, update the Phase-2 design doc §5 table (2a → SHIPPED + PR), update the sync-completion handoff (item B progress), commit + push workspace master.

---

## Self-review (run after writing, fixed inline)

- **Spec §1 coverage:** layout ✓ (store root under personalRoot/Conversations), record schema ✓ (Task 1, flags shape matches legacy v2 for lossless 2c migration), live writer ✓ (Task 6 intake), reconciler ✓ (Task 4, UUID-gated, content timestamps), titles ✓ (topic consumption in reconciler + noteTitleChanged), flags dual-write ✓ (Task 6 wiring), all four invariants ✓ (Tasks 3+2 tests pin them).
- **Spec §2 coverage:** mirror-in on turn-end + prompt push ✓ (Task 6), materialize-out on pull ✓ (Task 6 sweep via Task 5 hook), projectKey matching + missing-project handling ✓ (Task 7), store-first browser with legacy fallback ✓ (Task 7).
- **Type consistency:** `ConversationRecord`/`UpsertInput`/`ConversationStore` (Tasks 1–2) match Task 4/6 call sites; `PastSession` extras (Task 7) match the renderer mirror; `onSyncSpacesEvent` (Task 5) matches Task 6's subscription.
- **Known judgment calls for reviewers:** size-gated mirroring (not hashing) — documented in Task 3's header comment; projectName-from-slug approximation in the reconciler — corrected by the live path; `require()` lazy import in resolveLocalProject to avoid a cycle; store-only rows carry `size: 0` (no local file to stat — renderer's formatSize renders '0 B', acceptable until materialization fills it).
- **Placeholder scan:** clean — every code step carries the actual code; test steps carry behavior contracts naming the exact convention file to clone (the bounded style Tasks 4/5 of the 1b plan used).

---

## Execution Log (2026-07-11)

Executed via superpowers:subagent-driven-development — fresh Opus implementer per task, spec-compliance review then code-quality review per task, review loops until both approved, whole-branch final review before PR. 18 commits on `feat/conversation-store` → PR #116 → merged to master (`ea2e1aa3`). Started under Fable 5; finished under Opus 4.8 after the model switch. Final: **1577 tests pass**, tsc clean, production build + installer clean.

**Defects the review loops caught and fixed (the process earning its keep):**
- **Task 1 (store-core):** `'Untitled'` placeholder wrongly beat real titles; `mergeRecords` non-convergent on exact `lastActive` ties (positional tiebreak → two devices ping-pong) — fixed with a total-order content tiebreak; `foldConflictCopies` title, then ALL field groups, made order-independent by picking over the ORIGINAL input set instead of the mutated reduce accumulator; parse hardening (flag-value sanitize, corrupt-`createdAt` fallback, greedy conflict-copy regex).
- **Task 2 (IO shell):** path-traversal write via crafted id (charset allowlist + `path.resolve` containment + Windows reserved names); multi-process heal race deleting an unfolded conflict copy (quarantine-rename claim); metadata-only upsert silently dropping provided fields (local-truth re-apply); read paths rejecting on lock-timeout (fail-soft); lock-timeout returning a bogus record (throw).
- **Task 3 (mirror):** approved first pass; added stale-`.tmp` sweep (crash orphans would sync as junk) + same-size/different-content and materialize-side tmp tests.
- **Task 4 (reconciler):** O(n²) heal-readdir storm (measured ~2.8s at 600 records every startup + 30-min tick) → single `list()` preload (~200× fewer dirents); corrupt-tail transcript created an EPOCH record that re-upserted forever → skip; untested update branch pinned; wasted head-read reordered.
- **Task 5 (sync-spaces hook):** approved as written (isolated fan-out before the hub send; SyncHub invariants intact).
- **Task 6 (composition root):** materialize sweep could replace a LIVE session's transcript (no leases) → `sessions.has(id)` guard; per-record sweep IO on secondary devices → hoist managed/saved lookups once; double-start subscription/timer leak → idempotent start; phantom synced-record from flagging a live session before its id mapping → gated dual-write.
- **Task 7 (Resume Browser):** union resurfaced LIVE sessions as resumable rows (double-attach hazard) → `activeSessionIds` guard; store-only rows offered resume before the transcript materialized → `notSyncedYet` gate; `'Untitled'` placeholder shadowed derived names; fresh-secondary-device early-return-`[]` hid all synced conversations (product fix).
- **Whole-branch review:** the reconciler (`basename` via slug-last-segment truncation) and the live path (`basename(cwd)`) derived DIFFERENT projectKeys for hyphenated folders (`youcoded-dev` → `dev`) → orphan duplicate space transcript + cross-device materialize gap; fixed by recovering the exact folder name from a `ccProjectSlug(known folder) → basename` map (`3a7559b1`).

**Documented (not fixed here):** transient "Not synced to this device yet" wording on a second device until the same-pull sweep materializes (self-corrects); transcripts >50 MB hit the engine's pre-existing `MAX_SYNC_FILE_BYTES` cap and don't reach peers.

**The gate before Plan 2b:** the two-device dogfood (handoff item D) — first real-world test of records + transcripts converging across two machines. A single-instance live smoke test was NOT run this session; the dogfood supersedes it.
