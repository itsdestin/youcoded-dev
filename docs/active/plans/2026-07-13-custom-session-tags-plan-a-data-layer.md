---
status: active
---

# Custom Session Tags — Plan A: Data Layer & IPC

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the persistence, sync-merge, and IPC layer for first-class custom session tags and per-session freeform notes, with no UI — verifiable entirely by unit/integration tests.

**Architecture:** A synced tag registry (one JSON file per tag under the Personal sync space) with field-level newest-wins merge, mirroring the existing Conversation Store's pure-core / IO-shell split. Tag *application* to a session reuses the conversation record's existing `flags` map under `tag:<id>` keys, so per-key convergent merge is inherited unchanged. A new `note` field is added to the conversation record with its own timestamp. New IPC channels (`tags:*`, `session:set-tag`, `session:set-note`) are added across every bridge surface for parity; Android handlers are stubbed.

**Tech Stack:** TypeScript, Node.js (Electron main), Vitest. Kotlin (Android bridge, stubs only).

**Companion spec:** `docs/superpowers/specs/2026-07-13-custom-session-tags-design.md`. Plan B (UI) follows and consumes the types this plan locks.

**Working directory:** All code paths are in the `youcoded` sub-repo. Do this work in a `youcoded` git worktree (per workspace CLAUDE.md: sub-repo changes go to the sub-repo, PR'd there). Run tests from `youcoded/desktop`.

---

## Session Bootstrap (do this first)

This plan is written for a cold session. Before Task 1:

1. **Read the companion spec** `docs/superpowers/specs/2026-07-13-custom-session-tags-design.md` — it explains the *why* behind every design choice referenced below (registry model, reserved-flag behavior, the `helpful` removal, Android deferral).

2. **Sync + create a worktree in the `youcoded` sub-repo** (workspace CLAUDE.md requires worktrees for non-trivial work; sub-repo code never lands in `youcoded-dev`):

```bash
cd youcoded
git fetch origin && git pull origin master
git worktree add ../youcoded-worktrees/session-tags-a -b feat/session-tags-data-layer
cd ../youcoded-worktrees/session-tags-a
```

3. **Install desktop deps once** (the worktree has its own `node_modules`; or junction the main checkout's per CLAUDE.md — if you junction, remember to `cmd //c "rmdir node_modules"` BEFORE `git worktree remove` so it doesn't delete the main checkout's deps):

```bash
cd desktop && npm ci && cd ..
```

4. **Path note:** run every `npx vitest` / `npx tsc` / `npm run build` from `<worktree>/desktop`. Gradle commands run from `<worktree>` (the repo root). Never run the desktop build and a Gradle build concurrently in the same checkout (PITFALLS → Build order — `bundleWebUi` shells to `npm ci` and wipes `node_modules` mid-build).

5. **Context that auto-loads:** editing files under `src/main/conversations/`, `src/renderer/`, or `app/**` pulls in the relevant `.claude/rules/` (IPC bridge, React renderer, Android runtime). `docs/PITFALLS.md` → "Conversation Store", "Resume Browser & Conversation Identity", and "Cross-Platform" are the load-bearing invariants this plan builds on — skim them if a task's *why* isn't obvious.

When Plan A is merged, remove the worktree per CLAUDE.md (`git worktree remove`, `git branch -D`), then Plan B (UI) is authored against the now-locked types.

---

## File Structure

**Create (youcoded/desktop):**
- `src/main/conversations/tag-registry-core.ts` — pure: `TagRecord`, `parseTag`, `mergeTag`, `foldTagConflicts`, label/color helpers. No fs/path/os.
- `src/main/conversations/tag-registry.ts` — IO shell: `createTagRegistry(root)` → list/create/update/delete on disk via `mutateFileUnderLock`.
- `src/main/conversations/tag-registry-service.ts` — module singleton: `startTagRegistry` / `getTagRegistry` / `stopTagRegistry`.
- `src/shared/tags.ts` — shared renderer-facing types + constants: `TagColor`, `TAG_COLORS`, `TagRecord` (re-exported shape), `TAG_ID_PREFIX`.
- `tests/tag-registry-core.test.ts`, `tests/tag-registry.test.ts`.

**Modify (youcoded/desktop):**
- `src/main/conversations/store-core.ts` — export merge helpers; add `note`/`noteUpdatedAt` to `ConversationRecord` + parse/merge/fold.
- `src/main/conversations/conversation-store.ts` — `note` defaults in `toRecord`; add `setNote`.
- `src/main/conversations/service.ts` — add `noteSessionNote`.
- `src/shared/types.ts` — drop `helpful` from `SessionFlagName` + `SESSION_FLAG_NAMES`; add IPC channel constants; add `tags?`/`note?` to `PastSession`.
- `src/main/ipc-handlers.ts` — `tags:*`, `session:set-tag`, `session:set-note` handlers + broadcasts.
- `src/main/preload.ts` — `window.claude.tags.*`, `session.setTag`, `session.setNote`, `on.tagsChanged`.
- `src/renderer/remote-shim.ts` — same shape as preload.
- `src/main/remote-server.ts` — dispatch the new channels for remote clients.
- `src/main/session-browser.ts` — extract `tags`/`note` from store records into `PastSession`; drop `helpful`.
- `src/main/main.ts` — `startTagRegistry()` at launch.
- `tests/ipc-channels.test.ts` — parity assertions for the new channels.

**Modify (youcoded/app):**
- `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` — stub `when` cases for the three session/tag channels.

---

## Task 1: Export merge helpers from store-core

**Files:**
- Modify: `youcoded/desktop/src/main/conversations/store-core.ts`

The pure tag-registry core needs the same total-order timestamp tiebreak (`ts`, `laterOf`, `earliestOf`) the conversation store already uses. Export them so we don't duplicate the convergence logic (DRY). No behavior change.

- [ ] **Step 1: Add `export` to the three helpers**

In `store-core.ts`, change these three declarations (currently module-private) to be exported:

```ts
// Line ~84
export const ts = (iso: string) => Date.parse(iso) || 0;

// Line ~95
export function laterOf<T>(x: T, y: T, tx: number, ty: number): T {
  if (tx !== ty) return tx > ty ? x : y;
  return JSON.stringify(x) >= JSON.stringify(y) ? x : y;
}

// Line ~109
export function earliestOf(x: string, y: string): string {
  const tx = ts(x);
  const ty = ts(y);
  if (tx !== ty) return tx < ty ? x : y;
  return x <= y ? x : y;
}
```

- [ ] **Step 2: Verify existing store-core tests still pass**

Run: `cd youcoded/desktop && npx vitest run tests/conversation-store-core.test.ts`
Expected: PASS (adding `export` changes nothing at call sites).

- [ ] **Step 3: Commit**

```bash
git add src/main/conversations/store-core.ts
git commit -m "refactor(conversations): export ts/laterOf/earliestOf for reuse by tag registry"
```

---

## Task 2: Shared tag types & constants

**Files:**
- Create: `youcoded/desktop/src/shared/tags.ts`

One shared module (imported by both main and renderer) for the color palette slots and the tag id prefix, so the renderer and backend can't drift on either.

- [ ] **Step 1: Write the file**

```ts
// src/shared/tags.ts
// Shared tag constants + the renderer-facing TagRecord shape. Imported by both
// the Electron main process (registry IO) and the React renderer (Tag Picker),
// so the palette and id conventions have exactly one definition.

// The 10 fixed themed color slots (design §"Color palette"). These are SLOT
// KEYS, never raw hex — theme-engine.ts maps each to a theme-legible color so a
// tag stays readable on every theme. Order is the swatch order shown in the UI.
export const TAG_COLORS = [
  'tag-red', 'tag-orange', 'tag-amber', 'tag-green', 'tag-teal',
  'tag-blue', 'tag-indigo', 'tag-purple', 'tag-pink', 'tag-gray',
] as const;

export type TagColor = typeof TAG_COLORS[number];

// Default color for tags created without an explicit color, and the clamp
// target for any unrecognized color read off disk.
export const DEFAULT_TAG_COLOR: TagColor = 'tag-gray';

export function isTagColor(v: unknown): v is TagColor {
  return typeof v === 'string' && (TAG_COLORS as readonly string[]).includes(v);
}

// Tag ids are prefixed so they're visually distinct in the flag map's
// `tag:<id>` keys and can never collide with a reserved flag name.
export const TAG_ID_PREFIX = 'tag_';

// A conversation record's flag key for an applied tag.
export function tagFlagKey(tagId: string): string {
  return `tag:${tagId}`;
}

// The renderer-facing tag shape (the internal store record is a superset with
// per-field timestamps; the registry's list/create/update return this).
export interface TagRecord {
  id: string;
  label: string;
  color: TagColor;
  archived: boolean;
  createdAt: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd youcoded/desktop && npx tsc --noEmit`
Expected: PASS (new self-contained module).

- [ ] **Step 3: Commit**

```bash
git add src/shared/tags.ts
git commit -m "feat(tags): shared tag color palette + id constants"
```

---

## Task 3: Tag registry pure core

**Files:**
- Create: `youcoded/desktop/src/main/conversations/tag-registry-core.ts`
- Test: `youcoded/desktop/tests/tag-registry-core.test.ts`

Pure parse + field-level convergent merge for one tag file. Same pure-core discipline as `store-core.ts` — no fs/path/os. Each editable field carries its own `*UpdatedAt`; merge picks newest per field via `laterOf` so `merge(a,b) === merge(b,a)`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/tag-registry-core.test.ts
import { describe, it, expect } from 'vitest';
import {
  parseTag, mergeTag, foldTagConflicts, normalizeLabel,
  StoredTag, TAG_SCHEMA_VERSION,
} from '../src/main/conversations/tag-registry-core';

function tag(over: Partial<StoredTag> = {}): StoredTag {
  const t = '2026-07-13T00:00:00.000Z';
  return {
    schema: TAG_SCHEMA_VERSION, id: 'tag_a', label: 'Auth', labelUpdatedAt: t,
    color: 'tag-blue', colorUpdatedAt: t, archived: false, archivedUpdatedAt: t,
    deleted: false, deletedUpdatedAt: t, createdAt: t, ...over,
  };
}

describe('parseTag', () => {
  it('rejects wrong schema / missing id', () => {
    expect(parseTag(JSON.stringify({ ...tag(), schema: 99 }))).toBeNull();
    expect(parseTag(JSON.stringify({ ...tag(), id: '' }))).toBeNull();
    expect(parseTag('not json')).toBeNull();
  });
  it('clamps an unknown color to the default', () => {
    const p = parseTag(JSON.stringify({ ...tag(), color: 'tag-chartreuse' }));
    expect(p?.color).toBe('tag-gray');
  });
});

describe('mergeTag', () => {
  it('picks each field by its own updatedAt (commutative)', () => {
    const a = tag({ label: 'Auth', labelUpdatedAt: '2026-07-13T01:00:00.000Z' });
    const b = tag({ color: 'tag-red', colorUpdatedAt: '2026-07-13T02:00:00.000Z' });
    const ab = mergeTag(a, b);
    const ba = mergeTag(b, a);
    expect(ab).toEqual(ba);
    expect(ab.label).toBe('Auth');       // a's later label
    expect(ab.color).toBe('tag-red');    // b's later color
  });
  it('a delete tombstone from an older-overall copy still wins the deleted field', () => {
    const live = tag({ deleted: false, deletedUpdatedAt: '2026-07-13T01:00:00.000Z' });
    const gone = tag({ deleted: true, deletedUpdatedAt: '2026-07-13T03:00:00.000Z',
                       label: 'Old', labelUpdatedAt: '2026-07-12T00:00:00.000Z' });
    expect(mergeTag(live, gone).deleted).toBe(true);
  });
  it('keeps the earliest createdAt', () => {
    const a = tag({ createdAt: '2026-07-13T05:00:00.000Z' });
    const b = tag({ createdAt: '2026-07-10T00:00:00.000Z' });
    expect(mergeTag(a, b).createdAt).toBe('2026-07-10T00:00:00.000Z');
  });
});

describe('normalizeLabel', () => {
  it('lowercases and trims for dedup', () => {
    expect(normalizeLabel('  Auth Rewrite ')).toBe('auth rewrite');
  });
});

describe('foldTagConflicts', () => {
  it('is independent of copy order', () => {
    const base = tag({ label: 'A', labelUpdatedAt: '2026-07-13T01:00:00.000Z' });
    const c1 = tag({ label: 'B', labelUpdatedAt: '2026-07-13T02:00:00.000Z' });
    const c2 = tag({ color: 'tag-green', colorUpdatedAt: '2026-07-13T03:00:00.000Z' });
    expect(foldTagConflicts(base, [c1, c2])).toEqual(foldTagConflicts(base, [c2, c1]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run tests/tag-registry-core.test.ts`
Expected: FAIL — cannot find module `tag-registry-core`.

- [ ] **Step 3: Write the implementation**

```ts
// src/main/conversations/tag-registry-core.ts
// PURE record logic for the tag registry (design §"Tag registry"). No fs/path/os
// — the IO shell (tag-registry.ts) does disk work. Same pure-core / IO-shell
// split as store-core.ts. Every editable field carries its own *UpdatedAt so
// mergeTag resolves each field independently and converges across devices.
import { ts, laterOf, earliestOf } from './store-core';
import { TagColor, DEFAULT_TAG_COLOR, isTagColor } from '../../shared/tags';

export const TAG_SCHEMA_VERSION = 1;

// The on-disk tag shape — a superset of the renderer's TagRecord with per-field
// timestamps and a delete tombstone.
export interface StoredTag {
  schema: number;
  id: string;
  label: string;
  labelUpdatedAt: string;
  color: TagColor;
  colorUpdatedAt: string;
  archived: boolean;
  archivedUpdatedAt: string;
  deleted: boolean;          // tombstone — delete must propagate, not resurrect
  deletedUpdatedAt: string;
  createdAt: string;
}

// Case-insensitive, trimmed label — the dedup key used by create() so 'Auth'
// and ' auth ' don't become two tags.
export function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

// Parse + validate one tag file. Returns null on anything malformed so a corrupt
// tag damages exactly itself, never the whole list (same guarantee as parseRecord).
export function parseTag(json: string): StoredTag | null {
  let raw: any;
  try { raw = JSON.parse(json); } catch { return null; }
  if (!raw || typeof raw !== 'object') return null;
  if (raw.schema !== TAG_SCHEMA_VERSION) return null;
  if (typeof raw.id !== 'string' || !raw.id) return null;
  if (typeof raw.label !== 'string') return null;
  const str = (v: unknown, d: string) =>
    typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : d;
  const createdAt = str(raw.createdAt, str(raw.labelUpdatedAt, new Date(0).toISOString()));
  return {
    schema: TAG_SCHEMA_VERSION,
    id: raw.id,
    label: raw.label,
    labelUpdatedAt: str(raw.labelUpdatedAt, createdAt),
    color: isTagColor(raw.color) ? raw.color : DEFAULT_TAG_COLOR,
    colorUpdatedAt: str(raw.colorUpdatedAt, createdAt),
    archived: raw.archived === true,
    archivedUpdatedAt: str(raw.archivedUpdatedAt, createdAt),
    deleted: raw.deleted === true,
    deletedUpdatedAt: str(raw.deletedUpdatedAt, createdAt),
    createdAt,
  };
}

// Pick the value+timestamp pair with the newer timestamp, JSON-tiebroken on a
// tie — reuses store-core's laterOf so the tiebreak is identical everywhere.
function pickField<T>(av: T, aAt: string, bv: T, bAt: string): { v: T; at: string } {
  return laterOf({ v: av, at: aAt }, { v: bv, at: bAt }, ts(aAt), ts(bAt));
}

// Field-level newest-wins merge. Used by BOTH create/update read-modify-write
// and the conflict-copy fold, so the two can't drift.
export function mergeTag(a: StoredTag, b: StoredTag): StoredTag {
  const label = pickField(a.label, a.labelUpdatedAt, b.label, b.labelUpdatedAt);
  const color = pickField(a.color, a.colorUpdatedAt, b.color, b.colorUpdatedAt);
  const archived = pickField(a.archived, a.archivedUpdatedAt, b.archived, b.archivedUpdatedAt);
  const deleted = pickField(a.deleted, a.deletedUpdatedAt, b.deleted, b.deletedUpdatedAt);
  return {
    schema: TAG_SCHEMA_VERSION,
    id: a.id,
    label: label.v, labelUpdatedAt: label.at,
    color: color.v, colorUpdatedAt: color.at,
    archived: archived.v, archivedUpdatedAt: archived.at,
    deleted: deleted.v, deletedUpdatedAt: deleted.at,
    createdAt: earliestOf(a.createdAt, b.createdAt),
  };
}

// Fold conflict copies into the canonical tag. Every field pick is per-field
// max/min over values that pass through merges UNCHANGED (associative +
// commutative), so a plain reduce is order-independent here.
export function foldTagConflicts(canonical: StoredTag, copies: StoredTag[]): StoredTag {
  return copies.reduce((acc, c) => mergeTag(acc, c), canonical);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd youcoded/desktop && npx vitest run tests/tag-registry-core.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/main/conversations/tag-registry-core.ts tests/tag-registry-core.test.ts
git commit -m "feat(tags): pure tag-registry-core (parse + field-level convergent merge)"
```

---

## Task 4: Tag registry IO shell

**Files:**
- Create: `youcoded/desktop/src/main/conversations/tag-registry.ts`
- Test: `youcoded/desktop/tests/tag-registry.test.ts`

Disk CRUD over one-file-per-tag, using the same `mutateFileUnderLock` primitive and path-traversal guards as the conversation store.

- [ ] **Step 1: Write the failing test**

```ts
// tests/tag-registry.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTagRegistry } from '../src/main/conversations/tag-registry';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'tagreg-'));
});

describe('createTagRegistry', () => {
  it('creates, lists, updates, and deletes', async () => {
    const reg = createTagRegistry(root);
    const t = await reg.create('Auth rewrite', 'tag-blue');
    expect(t.id.startsWith('tag_')).toBe(true);
    expect((await reg.list()).map((x) => x.label)).toEqual(['Auth rewrite']);

    await reg.update(t.id, { label: 'Auth', color: 'tag-red', archived: true });
    const [u] = await reg.list();
    expect([u.label, u.color, u.archived]).toEqual(['Auth', 'tag-red', true]);

    await reg.delete(t.id);
    expect(await reg.list()).toEqual([]);   // tombstoned tags never list
  });

  it('reuses an existing non-archived tag on a case-insensitive label match', async () => {
    const reg = createTagRegistry(root);
    const a = await reg.create('Feature X', 'tag-green');
    const b = await reg.create('  feature x ', 'tag-pink');
    expect(b.id).toBe(a.id);                // same tag, not a duplicate
    expect((await reg.list()).length).toBe(1);
  });

  it('rejects a blank label', async () => {
    const reg = createTagRegistry(root);
    await expect(reg.create('   ', 'tag-blue')).rejects.toThrow();
  });

  it('clamps an unknown color to the default on create', async () => {
    const reg = createTagRegistry(root);
    const t = await reg.create('X', 'not-a-color' as any);
    expect(t.color).toBe('tag-gray');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run tests/tag-registry.test.ts`
Expected: FAIL — cannot find module `tag-registry`.

- [ ] **Step 3: Write the implementation**

```ts
// src/main/conversations/tag-registry.ts
// IO shell for the tag registry (design §"Tag registry"). One JSON file per tag
// under <personalRoot>/Tags/. All disk access lives here; all DECISIONS live in
// tag-registry-core.ts. Uses the same mkdir-lock read-modify-write primitive and
// path-traversal guards as conversation-store.ts.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mutateFileUnderLock } from '../artifacts/cas-write';
import {
  StoredTag, TAG_SCHEMA_VERSION, parseTag, mergeTag, normalizeLabel,
} from './tag-registry-core';
import {
  TagColor, TagRecord, TAG_ID_PREFIX, DEFAULT_TAG_COLOR, isTagColor,
} from '../../shared/tags';

export interface TagRegistry {
  list(): Promise<TagRecord[]>;                 // non-deleted; archived included
  create(label: string, color: TagColor): Promise<TagRecord>;
  update(id: string, patch: { label?: string; color?: TagColor; archived?: boolean }): Promise<TagRecord>;
  delete(id: string): Promise<void>;
  root(): string;
}

// Same allowlist as conversation-store: id becomes a path segment.
const SAFE_SEGMENT_RE = /^[A-Za-z0-9._-]+$/;
const isSafeId = (s: string) => SAFE_SEGMENT_RE.test(s) && s !== '.' && s !== '..';

const nowIso = () => new Date().toISOString();

function toPublic(t: StoredTag): TagRecord {
  return { id: t.id, label: t.label, color: t.color, archived: t.archived, createdAt: t.createdAt };
}

export function createTagRegistry(tagsRoot: string): TagRegistry {
  const rootResolved = path.resolve(tagsRoot);

  function tagPath(id: string): string {
    const target = path.resolve(rootResolved, `${id}.json`);
    if (!isSafeId(id) || !target.startsWith(rootResolved + path.sep)) {
      throw new Error(`tag-registry: invalid tag id '${id}'`);
    }
    return target;
  }

  // Read every *.json under the root, parse, drop nulls (corrupt) and tombstoned.
  async function readAll(): Promise<StoredTag[]> {
    let names: string[];
    try { names = fs.readdirSync(rootResolved); } catch { return []; }
    const out: StoredTag[] = [];
    for (const n of names) {
      if (!n.endsWith('.json') || n.endsWith('.tmp')) continue;
      try {
        const t = parseTag(fs.readFileSync(path.join(rootResolved, n), 'utf8'));
        if (t) out.push(t);
      } catch { /* unreadable — skip */ }
    }
    return out;
  }

  async function writeTag(next: StoredTag): Promise<void> {
    const committed = await mutateFileUnderLock(tagPath(next.id), (onDisk) => {
      const existing = onDisk ? parseTag(onDisk) : null;
      // Merge so a concurrent cross-process edit isn't clobbered.
      const merged = existing ? mergeTag(existing, next) : next;
      return JSON.stringify(merged, null, 2);
    });
    if (!committed) throw new Error(`tag-registry: could not write ${next.id} (lock timeout)`);
  }

  return {
    root: () => tagsRoot,

    async list() {
      return (await readAll())
        .filter((t) => !t.deleted)
        .sort((a, b) => a.label.localeCompare(b.label))
        .map(toPublic);
    },

    async create(label, color) {
      const clean = label.trim();
      if (!clean) throw new Error('tag-registry: blank label');
      // Reuse an existing non-archived tag with the same normalized label
      // instead of making a duplicate.
      const existing = (await readAll()).find(
        (t) => !t.deleted && !t.archived && normalizeLabel(t.label) === normalizeLabel(clean),
      );
      if (existing) return toPublic(existing);
      const at = nowIso();
      const tag: StoredTag = {
        schema: TAG_SCHEMA_VERSION,
        id: TAG_ID_PREFIX + randomUUID(),
        label: clean, labelUpdatedAt: at,
        color: isTagColor(color) ? color : DEFAULT_TAG_COLOR, colorUpdatedAt: at,
        archived: false, archivedUpdatedAt: at,
        deleted: false, deletedUpdatedAt: at,
        createdAt: at,
      };
      await writeTag(tag);
      return toPublic(tag);
    },

    async update(id, patch) {
      const target = tagPath(id);
      let result: StoredTag | undefined;
      const committed = await mutateFileUnderLock(target, (onDisk) => {
        const existing = onDisk ? parseTag(onDisk) : null;
        if (!existing) throw new Error(`tag-registry: no tag '${id}'`);
        const at = nowIso();
        const next: StoredTag = { ...existing };
        if (patch.label !== undefined) {
          const clean = patch.label.trim();
          if (!clean) throw new Error('tag-registry: blank label');
          next.label = clean; next.labelUpdatedAt = at;
        }
        if (patch.color !== undefined) {
          next.color = isTagColor(patch.color) ? patch.color : DEFAULT_TAG_COLOR;
          next.colorUpdatedAt = at;
        }
        if (patch.archived !== undefined) { next.archived = patch.archived; next.archivedUpdatedAt = at; }
        result = next;
        return JSON.stringify(next, null, 2);
      });
      if (!committed || !result) throw new Error(`tag-registry: could not update ${id}`);
      return toPublic(result);
    },

    async delete(id) {
      const committed = await mutateFileUnderLock(tagPath(id), (onDisk) => {
        const existing = onDisk ? parseTag(onDisk) : null;
        if (!existing) return null; // already gone — nothing to tombstone
        const at = nowIso();
        return JSON.stringify({ ...existing, deleted: true, deletedUpdatedAt: at }, null, 2);
      });
      if (!committed) throw new Error(`tag-registry: could not delete ${id}`);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd youcoded/desktop && npx vitest run tests/tag-registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/conversations/tag-registry.ts tests/tag-registry.test.ts
git commit -m "feat(tags): tag-registry IO shell (CRUD, dedup, tombstone delete)"
```

---

## Task 5: Tag registry service singleton + launch wiring

**Files:**
- Create: `youcoded/desktop/src/main/conversations/tag-registry-service.ts`
- Modify: `youcoded/desktop/src/main/main.ts` (near line 1470, beside `startConversationStore()`)

Thin composition root mirroring `conversations/service.ts`. It resolves the Tags dir from the Personal sync space and holds the singleton. No dedicated test — it delegates to the fully-tested IO shell.

- [ ] **Step 1: Write the service module**

```ts
// src/main/conversations/tag-registry-service.ts
// Module singleton for the tag registry (design §"Storage & sync layout").
// Mirrors conversations/service.ts: reads the Personal sync space's managed root
// and owns the createTagRegistry instance. Works with sync OFF — the Tags dir is
// created on first write regardless of the enable flag (same as conversations).
import path from 'node:path';
import { createTagRegistry, TagRegistry } from './tag-registry';
import { getManagedRoots } from '../sync-spaces/service';

let registry: TagRegistry | null = null;

export function getTagRegistry(): TagRegistry | null { return registry; }

export function startTagRegistry(opts?: { tagsRoot?: string }): void {
  stopTagRegistry();
  const personalRoot = getManagedRoots()?.personalRoot;
  const root = opts?.tagsRoot ?? (personalRoot ? path.join(personalRoot, 'Tags') : null);
  if (!root) return; // managed roots unavailable — registry stays off this launch
  registry = createTagRegistry(root);
}

export function stopTagRegistry(): void {
  registry = null;
}
```

- [ ] **Step 2: Wire into launch**

In `main.ts`, add the import beside the existing conversations import (line ~25):

```ts
import { startTagRegistry } from './conversations/tag-registry-service';
```

And immediately after the `startConversationStore().catch(...)` line (~1470), add:

```ts
  // Tag registry (design §"Storage & sync layout") — same Personal sync space,
  // resolved after managed roots exist (same ordering as startConversationStore).
  startTagRegistry();
```

- [ ] **Step 3: Typecheck**

Run: `cd youcoded/desktop && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/conversations/tag-registry-service.ts src/main/main.ts
git commit -m "feat(tags): tag-registry service singleton + launch wiring"
```

---

## Task 6: Add `note` to the conversation record

**Files:**
- Modify: `youcoded/desktop/src/main/conversations/store-core.ts`
- Modify: `youcoded/desktop/src/main/conversations/conversation-store.ts`
- Test: `youcoded/desktop/tests/conversation-store-core.test.ts` (extend)

The per-session freeform note is a record field with its own timestamp, merged newest-wins independently of activity.

- [ ] **Step 1: Write the failing test**

Add to `tests/conversation-store-core.test.ts` (import `mergeRecords`, `parseRecord` if not already):

```ts
describe('note field', () => {
  const base = (over: any = {}) => ({
    schema: 1, id: 'x', provider: 'claude', projectName: '', originalPath: '',
    title: '', lastActive: '2026-07-13T00:00:00.000Z', device: '', flags: {},
    transcriptRef: '', createdAt: '2026-07-13T00:00:00.000Z',
    note: '', noteUpdatedAt: '2026-07-13T00:00:00.000Z', ...over,
  });
  it('parses default note when absent', () => {
    const r = parseRecord(JSON.stringify({ ...base(), note: undefined, noteUpdatedAt: undefined }));
    expect(r?.note).toBe('');
  });
  it('merges the note with the newest noteUpdatedAt, independent of activity', () => {
    // a has the newer TURN but the OLDER note; b's newer note must still win.
    const a = base({ lastActive: '2026-07-13T09:00:00.000Z',
                     note: 'old', noteUpdatedAt: '2026-07-13T01:00:00.000Z' });
    const b = base({ lastActive: '2026-07-13T02:00:00.000Z',
                     note: 'new', noteUpdatedAt: '2026-07-13T05:00:00.000Z' });
    expect(mergeRecords(a, b).note).toBe('new');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run tests/conversation-store-core.test.ts -t "note field"`
Expected: FAIL — `note`/`noteUpdatedAt` not on the record.

- [ ] **Step 3: Extend `store-core.ts`**

Add two fields to the `ConversationRecord` interface (after `createdAt`):

```ts
  note: string;                  // user freeform note; '' means none
  noteUpdatedAt: string;         // ISO — own timestamp for independent merge
```

In `parseRecord`, add these to the returned object (after `createdAt: ...`):

```ts
    note: typeof raw.note === 'string' ? raw.note : '',
    // Absent/corrupt noteUpdatedAt → createdAt, so an old record never claims a
    // note edit it didn't make.
    noteUpdatedAt:
      typeof raw.noteUpdatedAt === 'string' && !Number.isNaN(Date.parse(raw.noteUpdatedAt))
        ? raw.noteUpdatedAt
        : (typeof raw.createdAt === 'string' && !Number.isNaN(Date.parse(raw.createdAt))
            ? raw.createdAt : raw.lastActive),
```

In `mergeRecords`, before the `return`, add the independent note pick and include it in the returned object:

```ts
  // Note is NOT activity-coupled (unlike title): a note edit on an idle device
  // must not lose to a busier device's newer turn. Pick by noteUpdatedAt alone.
  const notePick = laterOf(
    { v: a.note, at: a.noteUpdatedAt }, { v: b.note, at: b.noteUpdatedAt },
    ts(a.noteUpdatedAt), ts(b.noteUpdatedAt),
  );
```

Then in the returned object add:

```ts
    note: notePick.v,
    noteUpdatedAt: notePick.at,
```

In `foldConflictCopies`, the note travels through the pairwise reduce (`folded`) safely because the note pick is a per-field max — add to the returned object:

```ts
    note: folded.note,
    noteUpdatedAt: folded.noteUpdatedAt,
```

- [ ] **Step 4: Extend `conversation-store.ts`**

In `toRecord`, add to the returned object (after `createdAt: ...`):

```ts
      note: '',
      noteUpdatedAt: p.lastActive ?? new Date().toISOString(),
```

Add `setNote` to the `ConversationStore` interface (after `setTitle`):

```ts
  setNote(provider: string, id: string, note: string): Promise<void>;
```

Add the implementation (after the `setTitle` method):

```ts
    async setNote(provider, id, note) {
      // Unlike setTitle, an EMPTY note is a valid value — clearing a note. So we
      // do not early-return on '' (that's how a user erases a note).
      await mutateRecord(provider, id, (existing) => {
        const base = existing ?? toRecord({ id, provider });
        return { ...base, note, noteUpdatedAt: new Date().toISOString() };
      });
    },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd youcoded/desktop && npx vitest run tests/conversation-store-core.test.ts`
Expected: PASS (note-field cases + all existing).

- [ ] **Step 6: Commit**

```bash
git add src/main/conversations/store-core.ts src/main/conversations/conversation-store.ts tests/conversation-store-core.test.ts
git commit -m "feat(conversations): add per-session note field (independent newest-wins merge)"
```

---

## Task 7: Note write-through in the conversations service

**Files:**
- Modify: `youcoded/desktop/src/main/conversations/service.ts`

- [ ] **Step 1: Add the writer**

After `noteFlagChanged` (line ~171):

```ts
export function noteSessionNote(claudeSessionId: string, note: string): void {
  store?.setNote('claude', claudeSessionId, note).catch(() => { /* carry-forward 1 */ });
}
```

- [ ] **Step 2: Typecheck**

Run: `cd youcoded/desktop && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main/conversations/service.ts
git commit -m "feat(conversations): noteSessionNote write-through"
```

---

## Task 8: IPC channel constants + PastSession shape; drop `helpful`

**Files:**
- Modify: `youcoded/desktop/src/shared/types.ts`

- [ ] **Step 1: Drop `helpful` from the flag union**

Change (line ~554):

```ts
export type SessionFlagName = 'complete' | 'priority';
export const SESSION_FLAG_NAMES: SessionFlagName[] = ['complete', 'priority'];
```

- [ ] **Step 2: Add note + tags to `PastSession`**

In the `PastSession` interface (after the `flags?` field ~572), add:

```ts
  /** Applied custom-tag ids (from the conversation store's `tag:<id>` flag
   *  keys). Resolved to labels/colors by the renderer via the tag registry. */
  tags?: string[];
  /** User's freeform note for this session ('' / absent = none). */
  note?: string;
```

- [ ] **Step 3: Add the IPC channel constants**

In the `IPC` const, after `SESSION_META_CHANGED` (line ~726):

```ts
  // Custom session tags (registry CRUD + application) and per-session notes.
  SESSION_SET_TAG: 'session:set-tag',   // (sessionId, tagId, value)
  SESSION_SET_NOTE: 'session:set-note', // (sessionId, note)
  TAGS_LIST: 'tags:list',
  TAGS_CREATE: 'tags:create',           // (label, color)
  TAGS_UPDATE: 'tags:update',           // (id, { label?, color?, archived? })
  TAGS_DELETE: 'tags:delete',           // (id)
  TAGS_CHANGED: 'tags:changed',         // push: registry mutated
```

- [ ] **Step 4: Typecheck (expect failures to fix next)**

Run: `cd youcoded/desktop && npx tsc --noEmit`
Expected: FAIL — `session-browser.ts` line ~372 references `'helpful'` in a `SessionFlagName` context. Fixed in Task 12. (If other references to `'helpful'` surface, note them; the known ones are session-browser.ts and CloseSessionPrompt.tsx/ResumeBrowser.tsx — the last two are Plan B.)

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(tags): IPC channel constants + PastSession tags/note; drop helpful flag"
```

---

## Task 9: IPC handlers (main process)

**Files:**
- Modify: `youcoded/desktop/src/main/ipc-handlers.ts`

Add the registry CRUD, tag application, and note handlers. Tag application writes ONLY to the conversation store (`tag:<id>` key) — no legacy conversation-index dual-write (tags are new; the legacy index dies in Plan 2c). Reuse the `SESSION_SET_FLAG` handler's phantom-record gate and broadcast pattern.

- [ ] **Step 1: Add imports**

Extend the existing conversations import (line ~62) and add the registry import:

```ts
import { noteTranscriptEvent, noteSessionStarted, noteTitleChanged, noteFlagChanged, noteSessionNote } from './conversations/service';
import { getTagRegistry } from './conversations/tag-registry-service';
import { tagFlagKey, isTagColor, TagColor } from '../shared/tags';
```

`BrowserWindow` is already imported in this file (used at line ~938). Add a small local helper for the registry-wide broadcast near the other send helpers (after `sendForSession`, ~line 132), matching the existing `getAllWindows()` loop pattern used at lines 938 / 1423:

```ts
  // Registry-wide push (not session-scoped): notify every window. Mirrors the
  // getAllWindows loop already used for 'appearance:sync' / 'update:progress'.
  const broadcastToAllWindows = (channel: string, payload: any) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload);
    }
  };
```

- [ ] **Step 2: Add the handlers**

Immediately after the `IPC.SESSION_SET_FLAG` handler block (ends ~line 1939), add:

```ts
  // --- Tag registry CRUD ---
  ipcMain.handle(IPC.TAGS_LIST, async () => {
    const reg = getTagRegistry();
    if (!reg) return [];
    try { return await reg.list(); } catch { return []; }
  });

  ipcMain.handle(IPC.TAGS_CREATE, async (_e, label: string, color: string) => {
    const reg = getTagRegistry();
    if (!reg) return { ok: false, error: 'tag registry unavailable' };
    const c: TagColor = isTagColor(color) ? color : 'tag-gray';
    try {
      const tag = await reg.create(String(label ?? ''), c);
      remoteServer?.broadcast({ type: IPC.TAGS_CHANGED, payload: {} });
      // Notify local windows too (buddy window + main share the registry).
      broadcastToAllWindows(IPC.TAGS_CHANGED, {});
      return { ok: true, tag };
    } catch (e: any) { return { ok: false, error: e?.message || String(e) }; }
  });

  ipcMain.handle(IPC.TAGS_UPDATE, async (_e, id: string, patch: { label?: string; color?: string; archived?: boolean }) => {
    const reg = getTagRegistry();
    if (!reg) return { ok: false, error: 'tag registry unavailable' };
    const clean: { label?: string; color?: TagColor; archived?: boolean } = {};
    if (patch?.label !== undefined) clean.label = String(patch.label);
    if (patch?.color !== undefined) clean.color = isTagColor(patch.color) ? patch.color : 'tag-gray';
    if (patch?.archived !== undefined) clean.archived = !!patch.archived;
    try {
      const tag = await reg.update(String(id), clean);
      remoteServer?.broadcast({ type: IPC.TAGS_CHANGED, payload: {} });
      broadcastToAllWindows(IPC.TAGS_CHANGED, {});
      return { ok: true, tag };
    } catch (e: any) { return { ok: false, error: e?.message || String(e) }; }
  });

  ipcMain.handle(IPC.TAGS_DELETE, async (_e, id: string) => {
    const reg = getTagRegistry();
    if (!reg) return { ok: false, error: 'tag registry unavailable' };
    try {
      await reg.delete(String(id));
      remoteServer?.broadcast({ type: IPC.TAGS_CHANGED, payload: {} });
      broadcastToAllWindows(IPC.TAGS_CHANGED, {});
      return { ok: true };
    } catch (e: any) { return { ok: false, error: e?.message || String(e) }; }
  });

  // --- Apply/remove a tag on a session (writes tag:<id> into the store flag map) ---
  ipcMain.handle(IPC.SESSION_SET_TAG, async (_e, sessionId: string, tagId: string, value: boolean) => {
    if (typeof tagId !== 'string' || !tagId.startsWith('tag_')) {
      return { ok: false, error: `invalid tag id: ${tagId}` };
    }
    const resolved = sessionIdMap.get(sessionId) || sessionId;
    const key = tagFlagKey(tagId);
    try {
      // Same phantom-record gate as SESSION_SET_FLAG: only write the store when
      // `resolved` is a known CLAUDE id or a non-live session.
      if (sessionIdMap.has(sessionId) || !sessionManager.getSession(sessionId)) {
        noteFlagChanged(resolved, key, !!value);
      }
      const payload = { flag: key, value: !!value };
      sendForSession(resolved, IPC.SESSION_META_CHANGED, resolved, payload);
      remoteServer?.broadcast({ type: IPC.SESSION_META_CHANGED, payload: { sessionId: resolved, ...payload } });
      return { ok: true };
    } catch (e: any) { return { ok: false, error: e?.message || String(e) }; }
  });

  // --- Set/clear a session note ---
  ipcMain.handle(IPC.SESSION_SET_NOTE, async (_e, sessionId: string, note: string) => {
    const resolved = sessionIdMap.get(sessionId) || sessionId;
    const text = String(note ?? '');
    if (text.length > 8000) return { ok: false, error: 'note exceeds 8000 characters' };
    try {
      if (sessionIdMap.has(sessionId) || !sessionManager.getSession(sessionId)) {
        noteSessionNote(resolved, text);
      }
      const payload = { note: text };
      sendForSession(resolved, IPC.SESSION_META_CHANGED, resolved, payload);
      remoteServer?.broadcast({ type: IPC.SESSION_META_CHANGED, payload: { sessionId: resolved, ...payload } });
      return { ok: true };
    } catch (e: any) { return { ok: false, error: e?.message || String(e) }; }
  });
```

Note: `broadcastToAllWindows` is the local helper added in Step 1 above (an inline `BrowserWindow.getAllWindows()` loop). `sendForSession` targets one session's windows; the registry-wide `TAGS_CHANGED` uses `broadcastToAllWindows` because it isn't session-scoped.

- [ ] **Step 3: Typecheck**

Run: `cd youcoded/desktop && npx tsc --noEmit`
Expected: PASS for this file (the session-browser `helpful` error from Task 8 is fixed in Task 12; if you are executing strictly in order, that error is still present — that's expected until Task 12).

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc-handlers.ts
git commit -m "feat(tags): IPC handlers for tag registry CRUD, set-tag, set-note"
```

---

## Task 10: Preload + remote-shim parity

**Files:**
- Modify: `youcoded/desktop/src/main/preload.ts`
- Modify: `youcoded/desktop/src/renderer/remote-shim.ts`

Expose the identical `window.claude` shape on both surfaces (parity invariant).

- [ ] **Step 1: preload.ts — session methods**

After the `session.setFlag` method (line ~305):

```ts
    setTag: (sessionId: string, tagId: string, value: boolean) =>
      ipcRenderer.invoke(IPC.SESSION_SET_TAG, sessionId, tagId, value),
    setNote: (sessionId: string, note: string) =>
      ipcRenderer.invoke(IPC.SESSION_SET_NOTE, sessionId, note),
```

- [ ] **Step 2: preload.ts — tags namespace + channel constants**

Add the channel constants to preload's inlined `IPC` object (mirror Task 8's names — preload inlines them, it does not import). Then add a top-level `tags` namespace on the exposed object (beside `session`, `on`, etc.):

```ts
  tags: {
    list: () => ipcRenderer.invoke('tags:list'),
    create: (label: string, color: string) => ipcRenderer.invoke('tags:create', label, color),
    update: (id: string, patch: object) => ipcRenderer.invoke('tags:update', id, patch),
    delete: (id: string) => ipcRenderer.invoke('tags:delete', id),
  },
```

And add a listener in the `on` namespace:

```ts
    tagsChanged: (cb: (payload: any) => void) => {
      const handler = (_e: any, payload: any) => cb(payload);
      ipcRenderer.on('tags:changed', handler);
      return () => ipcRenderer.removeListener('tags:changed', handler);
    },
```

- [ ] **Step 3: remote-shim.ts — same shape**

After `session.setFlag` (line ~703):

```ts
      setTag: (sessionId: string, tagId: string, value: boolean) =>
        invoke('session:set-tag', { sessionId, tagId, value }),
      setNote: (sessionId: string, note: string) =>
        invoke('session:set-note', { sessionId, note }),
```

Add the `tags` namespace (beside the other top-level namespaces in `installShim`):

```ts
    tags: {
      list: () => invoke('tags:list'),
      create: (label: string, color: string) => invoke('tags:create', { label, color }),
      update: (id: string, patch: object) => invoke('tags:update', { id, patch }),
      delete: (id: string) => invoke('tags:delete', { id }),
    },
```

Add the listener in the `on` namespace (beside `sessionMetaChanged`, line ~726):

```ts
      tagsChanged: (cb: Callback) => addListener('tags:changed', cb),
```

And add a dispatch case in `handleMessage` (beside `session:meta-changed`, line ~216):

```ts
    case 'tags:changed':
      dispatchEvent('tags:changed', undefined, payload || {});
      break;
```

- [ ] **Step 4: Typecheck**

Run: `cd youcoded/desktop && npx tsc --noEmit`
Expected: PASS for these files.

- [ ] **Step 5: Commit**

```bash
git add src/main/preload.ts src/renderer/remote-shim.ts
git commit -m "feat(tags): window.claude.tags + session.setTag/setNote parity (preload + remote-shim)"
```

---

## Task 11: Remote server dispatch

**Files:**
- Modify: `youcoded/desktop/src/main/remote-server.ts`

Handle the new request channels so a remote browser's Tag Picker works. Mirror the existing `session:browse` case (line ~546) which responds via `this.respond(client.ws, type, id, payload)`.

- [ ] **Step 1: Add the cases**

In the message-dispatch `switch`, beside `case 'session:browse'`, add:

```ts
      case 'tags:list': {
        const { getTagRegistry } = await import('./conversations/tag-registry-service');
        const reg = getTagRegistry();
        const list = reg ? await reg.list().catch(() => []) : [];
        this.respond(client.ws, type, id, list);
        break;
      }
      case 'tags:create': {
        const { getTagRegistry } = await import('./conversations/tag-registry-service');
        const reg = getTagRegistry();
        if (!reg) { this.respond(client.ws, type, id, { ok: false, error: 'tag registry unavailable' }); break; }
        try {
          const tag = await reg.create(String(payload?.label ?? ''), payload?.color);
          this.broadcast({ type: 'tags:changed', payload: {} });
          this.respond(client.ws, type, id, { ok: true, tag });
        } catch (e: any) { this.respond(client.ws, type, id, { ok: false, error: e?.message || String(e) }); }
        break;
      }
      case 'tags:update': {
        const { getTagRegistry } = await import('./conversations/tag-registry-service');
        const reg = getTagRegistry();
        if (!reg) { this.respond(client.ws, type, id, { ok: false, error: 'tag registry unavailable' }); break; }
        try {
          const tag = await reg.update(String(payload?.id), payload?.patch ?? {});
          this.broadcast({ type: 'tags:changed', payload: {} });
          this.respond(client.ws, type, id, { ok: true, tag });
        } catch (e: any) { this.respond(client.ws, type, id, { ok: false, error: e?.message || String(e) }); }
        break;
      }
      case 'tags:delete': {
        const { getTagRegistry } = await import('./conversations/tag-registry-service');
        const reg = getTagRegistry();
        if (!reg) { this.respond(client.ws, type, id, { ok: false, error: 'tag registry unavailable' }); break; }
        try {
          await reg.delete(String(payload?.id));
          this.broadcast({ type: 'tags:changed', payload: {} });
          this.respond(client.ws, type, id, { ok: true });
        } catch (e: any) { this.respond(client.ws, type, id, { ok: false, error: e?.message || String(e) }); }
        break;
      }
      case 'session:set-tag': {
        const { noteFlagChanged } = await import('./conversations/service');
        const { tagFlagKey } = await import('../shared/tags');
        const tagId = String(payload?.tagId ?? '');
        if (!tagId.startsWith('tag_')) { this.respond(client.ws, type, id, { ok: false, error: 'invalid tag id' }); break; }
        noteFlagChanged(String(payload?.sessionId), tagFlagKey(tagId), !!payload?.value);
        this.respond(client.ws, type, id, { ok: true });
        break;
      }
      case 'session:set-note': {
        const { noteSessionNote } = await import('./conversations/service');
        const text = String(payload?.note ?? '');
        if (text.length > 8000) { this.respond(client.ws, type, id, { ok: false, error: 'note too long' }); break; }
        noteSessionNote(String(payload?.sessionId), text);
        this.respond(client.ws, type, id, { ok: true });
        break;
      }
```

(If the remote server already resolves `sessionId` through a session-id map for other channels, apply the same resolution here for consistency. If it does not — the desktop-launched remote clients pass claude ids for past sessions — the raw id is correct, matching `session:browse`.)

- [ ] **Step 2: Typecheck**

Run: `cd youcoded/desktop && npx tsc --noEmit`
Expected: PASS for this file.

- [ ] **Step 3: Commit**

```bash
git add src/main/remote-server.ts
git commit -m "feat(tags): remote-server dispatch for tags:* + set-tag/set-note"
```

---

## Task 12: Session-browser join — surface tags & note, drop helpful

**Files:**
- Modify: `youcoded/desktop/src/main/session-browser.ts`

Extract applied tag ids and the note from the store record into `PastSession`, and stop treating `helpful` as a known flag.

- [ ] **Step 1: Write the failing test**

If `tests/session-browser.test.ts` exists, add a case there; otherwise add to the store-union test file that covers this function. Assert the join maps `tag:<id>` flag keys to `tags` and copies `note`:

```ts
it('surfaces tag:<id> flags as tags[] and note from the store record', () => {
  // Unit against the pure extraction helper introduced below.
  const rec: any = {
    flags: {
      priority: { value: true, updatedAt: 'x' },
      helpful: { value: true, updatedAt: 'x' },          // ignored now
      'tag:tag_1': { value: true, updatedAt: 'x' },
      'tag:tag_2': { value: false, updatedAt: 'x' },     // off — excluded
    },
    note: 'left off mid-refactor',
  };
  const { extractStoreMeta } = require('../src/main/session-browser');
  const meta = extractStoreMeta(rec);
  expect(meta.flags).toEqual({ priority: true });        // helpful dropped
  expect(meta.tags).toEqual(['tag_1']);
  expect(meta.note).toBe('left off mid-refactor');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run -t "surfaces tag"`
Expected: FAIL — `extractStoreMeta` not exported.

- [ ] **Step 3: Add + use the extraction helper**

Add an exported pure helper near the top of `session-browser.ts` (after the imports):

```ts
// Pure: turn a store record's flag map + note into the PastSession-facing shape.
// Reserved flags stay booleans; `tag:<id>` keys become the tags[] list; unknown
// flags (including retired `helpful`) are ignored. Exported for unit testing.
export function extractStoreMeta(rec: { flags: Record<string, { value: boolean }>; note?: string }): {
  flags: Partial<Record<SessionFlagName, boolean>>;
  tags: string[];
  note?: string;
} {
  const flags: Partial<Record<SessionFlagName, boolean>> = {};
  const tags: string[] = [];
  for (const [k, v] of Object.entries(rec.flags || {})) {
    if (!v?.value) continue;
    if (k === 'complete' || k === 'priority') flags[k] = true;
    else if (k.startsWith('tag:')) tags.push(k.slice(4));
  }
  return { flags, tags, ...(rec.note ? { note: rec.note } : {}) };
}
```

Replace the inline flag extraction at line ~370-373:

```ts
        const { flags, tags, note } = extractStoreMeta(rec);
```

In the `legacy` overlay branch (line ~381), replace `if (Object.keys(flags).length) legacy.flags = flags;` with:

```ts
          if (Object.keys(flags).length) legacy.flags = flags;
          if (tags.length) legacy.tags = tags;
          if (note) legacy.note = note;
```

In the store-only `result.push({...})` branch (line ~407-421), add after the `flags` spread:

```ts
            ...(tags.length ? { tags } : {}),
            ...(note ? { note } : {}),
```

Also, in the LEGACY-index join near line ~300-308 (`joinedFlags`), drop `helpful` if the legacy index carries it — filter to known reserved names so a stale legacy `helpful` never reaches the renderer:

```ts
        const rawFlags = indexMeta.flags[sessionId];
        const joinedFlags = rawFlags
          ? Object.fromEntries(Object.entries(rawFlags).filter(([k]) => k === 'complete' || k === 'priority'))
          : undefined;
```

- [ ] **Step 4: Run tests to verify pass + typecheck**

Run: `cd youcoded/desktop && npx vitest run -t "surfaces tag" && npx tsc --noEmit`
Expected: PASS, and the Task-8 `helpful` typecheck error is now resolved.

- [ ] **Step 5: Commit**

```bash
git add src/main/session-browser.ts tests/session-browser.test.ts
git commit -m "feat(tags): session-browser surfaces tags[]/note from store; drop helpful"
```

---

## Task 13: Android bridge stubs

**Files:**
- Modify: `youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`

The shared React UI (Plan B) references these channels; Android's tagging UI is deferred, but the `window.claude` shape must resolve so nothing crashes. Stub the three session/tag write channels + registry CRUD as not-implemented, and `tags:list` as an empty list (so a Tag Picker that ever mounts shows nothing rather than erroring).

- [ ] **Step 1: Add the `when` cases**

Beside the existing `"session:set-flag"` case (line ~1480), add:

```kotlin
            "tags:list" -> {
                // Android tagging UI is deferred (Plan A design §"Cross-platform
                // parity & Android"). Return an empty registry so a shared-UI Tag
                // Picker degrades to "no tags" instead of hanging on a missing handler.
                msg.id?.let { bridgeServer.respond(ws, msg.type, it, org.json.JSONArray()) }
            }
            "tags:create", "tags:update", "tags:delete",
            "session:set-tag", "session:set-note" -> {
                val payload = org.json.JSONObject()
                    .put("ok", false)
                    .put("error", "not-implemented-on-mobile")
                msg.id?.let { bridgeServer.respond(ws, msg.type, it, payload) }
            }
```

- [ ] **Step 2: Verify Kotlin compiles**

Run: `cd youcoded && ./gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: Commit**

```bash
git add app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt
git commit -m "feat(tags): Android bridge stubs for tags:* + set-tag/set-note (deferred UI)"
```

---

## Task 14: IPC parity test

**Files:**
- Modify: `youcoded/desktop/tests/ipc-channels.test.ts`

Pin that the new channels exist across preload, remote-shim, and SessionService.kt (the parity boundary).

- [ ] **Step 1: Add the parity assertions**

`ipc-channels.test.ts` already `fs.readFileSync`s `preload.ts` inside its tests. Add a self-contained describe block at the end of the file that reads all three surfaces itself (no dependency on existing in-file vars), asserting each channel string is present in each surface:

```ts
describe('custom tags + notes channel parity', () => {
  const read = (rel: string) => fs.readFileSync(path.join(__dirname, rel), 'utf8');
  const preload = read('../src/main/preload.ts');
  const remoteShim = read('../src/renderer/remote-shim.ts');
  const sessionService = read('../../app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt');
  const channels = [
    'session:set-tag', 'session:set-note',
    'tags:list', 'tags:create', 'tags:update', 'tags:delete',
  ];
  for (const ch of channels) {
    test(`${ch} present in preload, remote-shim, and SessionService.kt`, () => {
      expect(preload).toContain(ch);
      expect(remoteShim).toContain(ch);
      expect(sessionService).toContain(ch);
    });
  }
});
```

(`fs` and `path` are already imported at the top of the file. The Android path is relative from `desktop/tests/` up to the repo root, then into `app/` — matching the layout in the `youcoded` repo where `desktop/` and `app/` are siblings.)

- [ ] **Step 2: Run test**

Run: `cd youcoded/desktop && npx vitest run tests/ipc-channels.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/ipc-channels.test.ts
git commit -m "test(tags): channel parity for tags:* + set-tag/set-note"
```

---

## Task 15: `session:get-meta` read channel (all surfaces)

**Files:**
- Modify: `youcoded/desktop/src/main/ipc-handlers.ts`, `preload.ts`, `remote-shim.ts`, `remote-server.ts`, `SessionService.kt`, `shared/types.ts`, `tests/ipc-channels.test.ts`

`session:browse` deliberately EXCLUDES live sessions, so Plan B's in-session StatusBar element has no way to read the ACTIVE session's applied tags + note. This read channel fills that gap: given a session id, return `{ tags: string[], note: string }` from the store record.

- [ ] **Step 1: Constant** — in `shared/types.ts` IPC block, beside `SESSION_SET_NOTE`:

```ts
  SESSION_GET_META: 'session:get-meta',   // (sessionId) → { tags, note }
```

- [ ] **Step 2: Main handler** — in `ipc-handlers.ts`, extend the conversations import to also pull `getConversationStore`, and add after the `SESSION_SET_NOTE` handler:

```ts
  ipcMain.handle(IPC.SESSION_GET_META, async (_e, sessionId: string) => {
    const store = getConversationStore();
    if (!store) return { tags: [], note: '' };
    const resolved = sessionIdMap.get(sessionId) || sessionId;
    try {
      const rec = await store.get('claude', resolved);
      if (!rec) return { tags: [], note: '' };
      const tags: string[] = [];
      for (const [k, v] of Object.entries(rec.flags)) {
        if (v.value && k.startsWith('tag:')) tags.push(k.slice(4));
      }
      return { tags, note: rec.note || '' };
    } catch { return { tags: [], note: '' }; }
  });
```

(Add `getConversationStore` to the existing `import { ... } from './conversations/service'` line.)

- [ ] **Step 3: preload.ts** — in the `session` namespace:

```ts
    getMeta: (sessionId: string): Promise<{ tags: string[]; note: string }> =>
      ipcRenderer.invoke(IPC.SESSION_GET_META, sessionId),
```

- [ ] **Step 4: remote-shim.ts** — in the `session` namespace:

```ts
      getMeta: (sessionId: string) => invoke('session:get-meta', { sessionId }),
```

- [ ] **Step 5: remote-server.ts** — add a case beside the others:

```ts
      case 'session:get-meta': {
        const { getConversationStore } = await import('./conversations/service');
        const store = getConversationStore();
        let out = { tags: [] as string[], note: '' };
        if (store) {
          try {
            const rec = await store.get('claude', String(payload?.sessionId));
            if (rec) {
              const tags: string[] = [];
              for (const [k, v] of Object.entries(rec.flags)) {
                if ((v as any).value && k.startsWith('tag:')) tags.push(k.slice(4));
              }
              out = { tags, note: rec.note || '' };
            }
          } catch { /* fall through to empty */ }
        }
        this.respond(client.ws, type, id, out);
        break;
      }
```

- [ ] **Step 6: SessionService.kt** — add to the not-implemented group, but return an EMPTY meta object (not an error) so a shared-UI call degrades gracefully:

```kotlin
            "session:get-meta" -> {
                val payload = org.json.JSONObject()
                    .put("tags", org.json.JSONArray())
                    .put("note", "")
                msg.id?.let { bridgeServer.respond(ws, msg.type, it, payload) }
            }
```

- [ ] **Step 7: Parity + typecheck** — add `'session:get-meta'` to the channel array in the Task-14 parity describe, then:

Run: `cd youcoded/desktop && npx tsc --noEmit && npx vitest run tests/ipc-channels.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/shared/types.ts src/main/ipc-handlers.ts src/main/preload.ts src/renderer/remote-shim.ts src/main/remote-server.ts app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt tests/ipc-channels.test.ts
git commit -m "feat(tags): session:get-meta read channel for live-session tags/note"
```

---

## Task 16: Full verification

- [ ] **Step 1: Full test suite**

Run: `cd youcoded/desktop && npm test`
Expected: PASS (no regressions; new tag/note/parity tests green).

- [ ] **Step 2: Full typecheck + build**

Run: `cd youcoded/desktop && npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 3: Android compile**

Run: `cd youcoded && ./gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Confirm no lingering `helpful` references**

Run: `cd youcoded && git grep -n "helpful" -- desktop/src app/src | grep -iv "helpfulness\|# \|//"`
Expected: only Plan-B renderer files (`ResumeBrowser.tsx`, `CloseSessionPrompt.tsx`) — those are removed in Plan B. No references in the data layer / IPC / session-browser.

---

## Self-review notes (author)

- **Spec coverage:** registry (T2–T5), application via flag map (T8–T12), note field (T6–T7, T9), IPC + parity (T8–T11, T14), drop helpful (T8, T12), Android stubs (T13), sync-off works (registry/store write locally regardless — T5/T4). Tombstone delete (T3/T4), duplicate-label reuse (T4), 8000-char note cap (T9/T11). UI surfaces are Plan B by design.
- **Types locked for Plan B:** `TagRecord`/`TagColor`/`TAG_COLORS` (`src/shared/tags.ts`), `PastSession.tags?: string[]` + `note?`, channel names, and `window.claude.tags` + `session.setTag/setNote/getMeta` + `on.tagsChanged`. Live-session tags/note are read via `session.getMeta(sessionId)` (Task 15).
- **Not in this plan:** theme color tokens for the 10 slots (Plan B, T-theme), the Tag Picker / chip / note editor components, and all five UI surfaces.
