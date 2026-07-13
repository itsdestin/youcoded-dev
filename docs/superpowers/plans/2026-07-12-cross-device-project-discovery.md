# Cross-Device Project Sync — Discovery, Rename & Stop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Default implementer agents to the `opus` model.

**Goal:** A project synced on one device silently **appears** on every other device, can be **renamed** so the same visible name shows everywhere, and can be **stopped** (detached from sync while every device keeps its local copy, never respawning).

**Architecture:** A per-file **convergent record** at `~/YouCoded/Personal/ProjectSync/<name>.json` (`{schemaVersion, name, repoName, displayName, state, updatedAt}`) synced inside the always-present Personal space is the source of truth. `name` is the immutable identity (folder name); `displayName` and `state` are the mutable, synced fields. A project-specific field-wise merge (state = `stopped`-dominates monotonic join; displayName = last-writer-wins) with heal-on-read folds the transport's conflict copies. A pure planner turns (registry, local projects, live spaces) into reconcile actions; the service materializes missing active projects, removes stopped ones (keeping the folder), and gates the engine's space set so stopped projects never re-add.

**Tech Stack:** TypeScript, Node `fs`, the existing `sync-spaces` modules, reused `mutateFileUnderLock` (`artifacts/cas-write`) + `laterOf`/`isConflictCopyName`/`extractConflictBase` (`conversations/store-core`), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-12-cross-device-project-discovery-design.md` (read §4/§4a for the record + merge, §6 planner, §7 reconcile, §8 writers, §9 triggers before starting).

**Worktree:** All code changes are in the `youcoded` repo; do them in the worktree from "Execution Setup" below. The plan/spec/doc edits (Task 10) are in the `youcoded-dev` workspace repo.

**Scope:** discover + rename (display-name only, no folder move) + stop (detach, keep local, tombstone). **Out of scope (spec §15):** Resume-syncing a stopped project (permanent tombstone here), true on-disk folder rename, remote-repo deletion, Android (stubbed), and the richer Project View 3-category UI (deferred; the status dot is the interim). Do NOT add those.

**Key facts confirmed against the code (do not re-derive):**
- `ManagedRoots.spaces()` is pure filesystem (personal + one space per folder under `Projects/`); it has no registry awareness and must stay that way. The stop gate lives in the service via `activeManagedSpaces()`.
- The engine has **no** per-space remove and no live-space getter — Task 3 adds `removeSpace(id)` + `liveSpaceIds()`.
- `manager.ensureRemote(space)` uses only `space.id` (never the local folder), so it can run BEFORE `createProject` — a gh failure then creates nothing.
- `GitTransport.pull` adopts `origin/main` on an unborn local `main` (`checkout -B main origin/main`), which is what makes empty-folder + first-sync-pull materialize a peer's content with no `git clone`.
- The transport's conflict policy is remote-wins-canonical → it can leave the WRONG winner as the canonical registry file → **fold-on-read is load-bearing** (a stopped project could otherwise read active and resurrect).
- `repoNameForSpace(space)` hashes only `space.id` (+ kind). `{ id: 'project:<name>', kind: 'project', root: '' }` yields the correct, cross-device-stable repo name.

---

## File Structure

**New (youcoded repo):**
- `desktop/src/main/sync-spaces/project-registry.ts` — convergent store: types, `PROJECT_REGISTRY_SCHEMA`, pure merge (`mergeProjectEntries`/`foldProjectEntries`), `readProjectRegistry` (read+fold), `ensureProjectEntry`, `setProjectDisplayName`, `setProjectStopped`.
- `desktop/src/main/sync-spaces/materialization-planner.ts` — pure `planReconcile` + `activeManagedSpaces`.
- Tests: `desktop/tests/project-registry.test.ts`, `desktop/tests/materialization-planner.test.ts`, `desktop/tests/sync-spaces-project-discovery.test.ts`.

**Modified (youcoded repo):**
- `desktop/src/main/sync-spaces/engine.ts` — `removeSpace(id)`, `liveSpaceIds()`.
- `desktop/src/main/sync-spaces/service.ts` — writers (register/rename/stop), `backfillRegistry`/`runDiscovery`/`materializeProject`, `activeManagedSpaces` gate at the three `spaces()` sites, three triggers, `displayName`/`state` in the spaces payload.
- IPC parity: `preload.ts`, `remote-shim.ts`, `ipc-handlers.ts`, `remote-server.ts`, `app/.../runtime/SessionService.kt` (stub).
- Renderer: Project View hero (`ProjectHero.tsx`) Stop button + rename wiring; `sync-dot-state.ts` stopped state; row `displayName` overlay.
- Tests: additions to `desktop/tests/sync-spaces-service.test.ts`, engine test, `desktop/tests/ipc-channels.test.ts`.

**Modified (youcoded-dev workspace repo — Task 10):** `docs/PITFALLS.md`, `docs/superpowers/2026-07-10-sync-completion-handoff.md`, `docs/knowledge-debt.md`.

---

## Task 1: Convergent registry store

**Files:** Create `desktop/src/main/sync-spaces/project-registry.ts`; Test `desktop/tests/project-registry.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// desktop/tests/project-registry.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  readProjectRegistry, ensureProjectEntry, setProjectDisplayName, setProjectStopped,
  mergeProjectEntries, PROJECT_REGISTRY_SCHEMA, type ProjectRegistryEntry,
} from '../src/main/sync-spaces/project-registry';

let personal: string;
beforeEach(() => { personal = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-preg-')); });
afterEach(() => { fs.rmSync(personal, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });

const dir = () => path.join(personal, 'ProjectSync');
const write = (file: string, obj: unknown) => {
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(path.join(dir(), file), JSON.stringify(obj));
};
const E = (over: Partial<ProjectRegistryEntry>): ProjectRegistryEntry => ({
  schemaVersion: PROJECT_REGISTRY_SCHEMA, name: 'app', repoName: 'r-app',
  displayName: 'app', state: 'active', updatedAt: 1, ...over,
});

describe('project registry store — I/O', () => {
  it('ensureProjectEntry creates a visible ProjectSync/<name>.json (active, displayName=name)', () => {
    ensureProjectEntry(personal, { name: 'app', repoName: 'r-app' });
    expect(fs.existsSync(path.join(dir(), 'app.json'))).toBe(true);
    const got = readProjectRegistry(personal);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ name: 'app', repoName: 'r-app', displayName: 'app', state: 'active' });
  });

  it('ensureProjectEntry is create-if-absent — never clobbers an existing rename/stop', () => {
    ensureProjectEntry(personal, { name: 'app', repoName: 'r-app' });
    write('app.json', E({ displayName: 'Cool App', state: 'stopped', updatedAt: 50 }));
    ensureProjectEntry(personal, { name: 'app', repoName: 'r-app' }); // must NOT reset
    const got = readProjectRegistry(personal)[0];
    expect(got.displayName).toBe('Cool App');
    expect(got.state).toBe('stopped');
  });

  it('returns [] when the registry dir does not exist', () => {
    expect(readProjectRegistry(personal)).toEqual([]);
  });

  it('skips corrupt / unknown-schema files without throwing', () => {
    ensureProjectEntry(personal, { name: 'good', repoName: 'r' });
    fs.writeFileSync(path.join(dir(), 'bad.json'), '{ not json');
    write('future.json', { schemaVersion: 999, name: 'future', repoName: 'r' });
    expect(readProjectRegistry(personal).map(e => e.name).sort()).toEqual(['good']);
  });

  it('setProjectDisplayName updates displayName + bumps updatedAt, preserving state', async () => {
    write('app.json', E({ state: 'stopped', updatedAt: 5 }));
    await setProjectDisplayName(personal, 'app', 'r-app', 'Renamed');
    const got = readProjectRegistry(personal)[0];
    expect(got.displayName).toBe('Renamed');
    expect(got.state).toBe('stopped'); // preserved
    expect(got.updatedAt).toBeGreaterThan(5);
  });

  it('setProjectStopped tombstones, preserving displayName', async () => {
    write('app.json', E({ displayName: 'Cool', updatedAt: 5 }));
    await setProjectStopped(personal, 'app', 'r-app');
    const got = readProjectRegistry(personal)[0];
    expect(got.state).toBe('stopped');
    expect(got.displayName).toBe('Cool');
  });

  it('folds conflict copies on read — stopped dominates regardless of updatedAt', () => {
    // Canonical says active/newer; a remote-wins conflict copy says stopped/older.
    write('app.json', E({ displayName: 'A', state: 'active', updatedAt: 100 }));
    write('app (from laptop, 2026-07-13).json', E({ displayName: 'A', state: 'stopped', updatedAt: 5 }));
    const got = readProjectRegistry(personal);
    expect(got).toHaveLength(1);           // folded into one
    expect(got[0].state).toBe('stopped');  // tombstone dominates the newer active
  });

  it('folds conflict copies on read — displayName is last-writer-wins', () => {
    write('app.json', E({ displayName: 'Old', updatedAt: 10 }));
    write('app (from laptop, 2026-07-13).json', E({ displayName: 'New', updatedAt: 20 }));
    expect(readProjectRegistry(personal)[0].displayName).toBe('New');
  });
});

describe('project registry store — pure merge', () => {
  it('mergeProjectEntries is commutative for state + displayName', () => {
    const a = E({ state: 'active', displayName: 'X', updatedAt: 3 });
    const b = E({ state: 'stopped', displayName: 'Y', updatedAt: 9 });
    const ab = mergeProjectEntries(a, b);
    const ba = mergeProjectEntries(b, a);
    expect(ab).toEqual(ba);
    expect(ab.state).toBe('stopped');     // dominates
    expect(ab.displayName).toBe('Y');     // updatedAt 9 wins
  });
});
```

- [ ] **Step 2: Run — expect module-not-found FAIL**

Run: `cd youcoded/desktop && npx vitest run tests/project-registry.test.ts`

- [ ] **Step 3: Implement**

```ts
// desktop/src/main/sync-spaces/project-registry.ts
// The per-project registry that powers cross-device project discovery, rename,
// and stop (spec 2026-07-12 §4/§4a). One JSON file per project, synced INSIDE
// the always-present Personal space so every device sees the same list.
//
// Layout mirrors the Conversation Store (Personal/Conversations/<provider>/<id>.json):
// a VISIBLE per-file folder under Personal. Following that convention sidesteps
// the reserved `.youcoded/` basename (the transport's hidden git dir AND a
// DEFAULT_IGNORES entry — anything under it silently never syncs).
//
// Records are MUTABLE (displayName renames + a `stopped` tombstone), so this IS
// a convergent record set and mirrors the Conversation Store's machinery:
// per-file, fail-soft parse, locked read-modify-write, and heal-on-read that
// folds the transport's conflict copies. The MERGE is project-specific (§4a):
//   - state: MONOTONIC join — `stopped` dominates. NOT last-writer-wins, so a
//     stale "active + renamed" write from a device that hasn't pulled the stop
//     can never un-stop it. (Consequence: no Resume — spec §15.)
//   - displayName: last-writer-wins by updatedAt (content-tiebroken).
// FOLD-ON-READ IS LOAD-BEARING: the transport's remote-wins conflict policy can
// leave the WRONG winner as the canonical file, so a stopped project could
// otherwise read active and resurrect. We fold in memory; copy files are left in
// place (rare, inert — they always lose or re-fold identically; a future cleanup
// can prune them).
import fs from 'fs';
import path from 'path';
import { mutateFileUnderLock } from '../artifacts/cas-write';
import { laterOf, isConflictCopyName, extractConflictBase } from '../conversations/store-core';

export const PROJECT_REGISTRY_SCHEMA = 1;

export type ProjectState = 'active' | 'stopped';

export interface ProjectRegistryEntry {
  schemaVersion: number;
  name: string;        // folder name under ~/YouCoded/Projects/ — the immutable sync identity
  repoName: string;    // repoNameForSpace(name) — deterministic, identical on every device
  displayName: string; // synced, user-visible label; defaults to name
  state: ProjectState; // 'stopped' is a tombstone
  updatedAt: number;   // ms epoch — last-writer-wins for displayName
}

function registryDir(personalRoot: string): string {
  return path.join(personalRoot, 'ProjectSync');
}

// `name` becomes a filename and this store sits near sync/remote surfaces. Names
// are already validateSyncName-checked at create/import time; re-checking here is
// defense-in-depth (rejects separators, traversal, trailing dot/space).
const SAFE_NAME_RE = /^[^<>:"|?*\x00-\x1f/\\]+$/;
const isSafeName = (s: string): boolean =>
  !!s && s !== '.' && s !== '..' && SAFE_NAME_RE.test(s) && !/[. ]$/.test(s);

function parseEntry(json: string): ProjectRegistryEntry | null {
  let raw: any;
  try { raw = JSON.parse(json); } catch { return null; }
  if (!raw || typeof raw !== 'object') return null;
  if (raw.schemaVersion !== PROJECT_REGISTRY_SCHEMA) return null;
  if (typeof raw.name !== 'string' || !isSafeName(raw.name)) return null;
  if (typeof raw.repoName !== 'string' || !raw.repoName) return null;
  return {
    schemaVersion: PROJECT_REGISTRY_SCHEMA,
    name: raw.name,
    repoName: raw.repoName,
    displayName: typeof raw.displayName === 'string' && raw.displayName ? raw.displayName : raw.name,
    state: raw.state === 'stopped' ? 'stopped' : 'active',
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
  };
}

// PURE. Field-wise merge (§4a). Commutative + associative (a lattice join over
// state × (updatedAt, displayName)), so a plain reduce over any copy order
// converges. UNLIKE the Conversation Store's title rule, every field here is a
// clean join, so no special fold accumulator is needed.
export function mergeProjectEntries(a: ProjectRegistryEntry, b: ProjectRegistryEntry): ProjectRegistryEntry {
  const state: ProjectState = a.state === 'stopped' || b.state === 'stopped' ? 'stopped' : 'active';
  const newer = laterOf(a, b, a.updatedAt, b.updatedAt); // displayName LWW, content-tiebroken
  return {
    schemaVersion: PROJECT_REGISTRY_SCHEMA,
    name: newer.name,
    repoName: newer.repoName,
    displayName: newer.displayName,
    state,
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
  };
}

export function foldProjectEntries(entries: ProjectRegistryEntry[]): ProjectRegistryEntry {
  return entries.reduce((acc, e) => mergeProjectEntries(acc, e));
}

/** Read + fold every registry record. FAIL-SOFT: corrupt/partial/unknown-schema
 *  files are skipped, never thrown (dev instance + built app share the tree).
 *  Conflict copies are folded into their canonical in memory (fold-on-read is
 *  load-bearing — see file header). Copy files are left on disk (inert). */
export function readProjectRegistry(personalRoot: string): ProjectRegistryEntry[] {
  const dir = registryDir(personalRoot);
  let names: string[];
  try { names = fs.readdirSync(dir); } catch { return []; }
  const groups = new Map<string, ProjectRegistryEntry[]>();
  for (const n of names) {
    if (!n.endsWith('.json')) continue;
    const base = isConflictCopyName(n) ? extractConflictBase(n) : n;
    if (!base) continue;
    const full = path.join(dir, n);
    let e: ProjectRegistryEntry | null = null;
    try { if (fs.lstatSync(full).isFile()) e = parseEntry(fs.readFileSync(full, 'utf8')); }
    catch { /* corrupt/vanished — skip */ }
    // Grouping integrity: only fold a file whose content name matches its
    // canonical filename base (the transport copies content verbatim, so these
    // always agree; guard defends against a hand-mangled file).
    if (!e || `${e.name}.json` !== base) continue;
    const arr = groups.get(base) ?? [];
    arr.push(e);
    groups.set(base, arr);
  }
  const out: ProjectRegistryEntry[] = [];
  for (const arr of groups.values()) out.push(foldProjectEntries(arr));
  return out;
}

function writeAtomic(file: string, entry: ProjectRegistryEntry): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(entry, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

/** Create-if-absent an active record (displayName = name). Idempotent: a boot
 *  backfill leaves an existing record — including a synced rename or stop —
 *  untouched, so it neither churns the Personal watcher nor clobbers peer edits. */
export function ensureProjectEntry(personalRoot: string, input: { name: string; repoName: string }): void {
  if (!isSafeName(input.name)) throw new Error(`project-registry: invalid name '${input.name}'`);
  const dir = registryDir(personalRoot);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${input.name}.json`);
  if (fs.existsSync(file)) return;
  writeAtomic(file, {
    schemaVersion: PROJECT_REGISTRY_SCHEMA,
    name: input.name, repoName: input.repoName,
    displayName: input.name, state: 'active', updatedAt: Date.now(),
  });
}

// Locked read-modify-write on the CANONICAL file. Correctness note: writers do
// NOT need to fold conflict copies — read-time fold + stopped-dominance already
// guarantee correct reads, and even if a writer preserves a stale `active`, the
// stopped copy still dominates on the next read. The lock (mutateFileUnderLock)
// exists for the SAME-DEVICE race (dev instance + built app writing this file
// concurrently) where there is no git conflict copy to fold — an unlocked
// read-modify-write there would lose the other writer's field.
async function mutateCanonical(
  personalRoot: string, name: string,
  fn: (cur: ProjectRegistryEntry | null) => ProjectRegistryEntry,
): Promise<void> {
  if (!isSafeName(name)) throw new Error(`project-registry: invalid name '${name}'`);
  const dir = registryDir(personalRoot);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.json`);
  const committed = await mutateFileUnderLock(file, (onDisk) => {
    const cur = onDisk ? parseEntry(onDisk) : null;
    return JSON.stringify(fn(cur), null, 2) + '\n';
  });
  if (!committed) throw new Error(`project-registry: could not write ${name} (lock timeout)`);
}

/** Rename: set displayName + bump updatedAt, PRESERVE state. Seeds an active
 *  record if somehow absent (repoName supplied by the caller). */
export function setProjectDisplayName(
  personalRoot: string, name: string, repoName: string, displayName: string,
): Promise<void> {
  return mutateCanonical(personalRoot, name, (cur) => ({
    schemaVersion: PROJECT_REGISTRY_SCHEMA, name, repoName,
    state: cur?.state ?? 'active',
    displayName, updatedAt: Date.now(),
  }));
}

/** Stop: set state=stopped + bump updatedAt, PRESERVE displayName. */
export function setProjectStopped(
  personalRoot: string, name: string, repoName: string,
): Promise<void> {
  return mutateCanonical(personalRoot, name, (cur) => ({
    schemaVersion: PROJECT_REGISTRY_SCHEMA, name, repoName,
    displayName: cur?.displayName ?? name,
    state: 'stopped', updatedAt: Date.now(),
  }));
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd youcoded/desktop && npx vitest run tests/project-registry.test.ts`

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/sync-spaces/project-registry.ts desktop/tests/project-registry.test.ts
git commit -m "feat(sync): convergent project registry store (per-file, Personal space)"
```

---

## Task 2: Pure reconcile planner + active-space gate

**Files:** Create `desktop/src/main/sync-spaces/materialization-planner.ts`; Test `desktop/tests/materialization-planner.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// desktop/tests/materialization-planner.test.ts
import { describe, it, expect } from 'vitest';
import { planReconcile, activeManagedSpaces } from '../src/main/sync-spaces/materialization-planner';
import { PROJECT_REGISTRY_SCHEMA, type ProjectRegistryEntry } from '../src/main/sync-spaces/project-registry';
import type { SyncSpace } from '../src/main/sync-spaces/types';

const E = (name: string, state: 'active' | 'stopped' = 'active'): ProjectRegistryEntry =>
  ({ schemaVersion: PROJECT_REGISTRY_SCHEMA, name, repoName: `r-${name}`, displayName: name, state, updatedAt: 1 });
const projSpace = (name: string): SyncSpace => ({ id: `project:${name}`, kind: 'project', root: `/p/${name}` });
const personalSpace: SyncSpace = { id: 'personal', kind: 'personal', root: '/personal' };

describe('planReconcile', () => {
  it('materializes active registry projects missing locally', () => {
    const p = planReconcile([E('alpha'), E('beta')], ['alpha'], []);
    expect(p.toMaterialize.map(e => e.name)).toEqual(['beta']);
    expect(p.toStop).toEqual([]);
  });

  it('skips active projects already local', () => {
    expect(planReconcile([E('alpha')], ['alpha'], ['alpha']).toMaterialize).toEqual([]);
  });

  it('never materializes a stopped project', () => {
    expect(planReconcile([E('beta', 'stopped')], [], []).toMaterialize).toEqual([]);
  });

  it('stops a stopped project that currently has a live space', () => {
    const p = planReconcile([E('beta', 'stopped')], ['beta'], ['beta']);
    expect(p.toStop).toEqual(['beta']);
    expect(p.toMaterialize).toEqual([]);
  });

  it('does not stop a stopped project with no live space (already detached)', () => {
    expect(planReconcile([E('beta', 'stopped')], ['beta'], []).toStop).toEqual([]);
  });

  it('dedups duplicate registry names', () => {
    expect(planReconcile([E('beta'), E('beta')], [], []).toMaterialize.map(e => e.name)).toEqual(['beta']);
  });
});

describe('activeManagedSpaces', () => {
  it('drops stopped project spaces and always keeps personal', () => {
    const spaces = [personalSpace, projSpace('alpha'), projSpace('beta')];
    const out = activeManagedSpaces([E('alpha'), E('beta', 'stopped')], spaces);
    expect(out.map(s => s.id)).toEqual(['personal', 'project:alpha']);
  });

  it('keeps project spaces with no registry entry (not yet registered)', () => {
    const out = activeManagedSpaces([], [personalSpace, projSpace('alpha')]);
    expect(out.map(s => s.id)).toEqual(['personal', 'project:alpha']);
  });
});
```

- [ ] **Step 2: Run — expect module-not-found FAIL**

Run: `cd youcoded/desktop && npx vitest run tests/materialization-planner.test.ts`

- [ ] **Step 3: Implement**

```ts
// desktop/src/main/sync-spaces/materialization-planner.ts
// PURE decision core (no I/O — same pattern as resolve-local-project.ts,
// buildSavedFolderProjects, discoverContext). Given the synced registry + what's
// on this device, decide what to reconcile, and which spaces the engine should
// actually run.
import type { ProjectRegistryEntry } from './project-registry';
import type { SyncSpace } from './types';

export interface ReconcilePlan {
  toMaterialize: ProjectRegistryEntry[]; // active registry projects missing locally
  toStop: string[];                      // project names whose live space must detach
}

function spaceProjectName(s: SyncSpace): string {
  return s.id.startsWith('project:') ? s.id.slice('project:'.length) : '';
}

/** Reconcile the synced registry against local state.
 *  - toMaterialize: active + not local (deduped). Skipping already-local names
 *    avoids clobbering a live folder — a same-named local project already
 *    converges to the same repo via ensureRemote + the unrelated-histories merge.
 *  - toStop: stopped + currently live here (the mid-session case). A stopped
 *    project with no live space is already detached — nothing to do. */
export function planReconcile(
  registry: ProjectRegistryEntry[],
  localProjectNames: string[],
  liveSpaceNames: string[],
): ReconcilePlan {
  const local = new Set(localProjectNames);
  const live = new Set(liveSpaceNames);
  const seen = new Set<string>();
  const toMaterialize: ProjectRegistryEntry[] = [];
  const toStop: string[] = [];
  for (const e of registry) {
    if (seen.has(e.name)) continue;
    seen.add(e.name);
    if (e.state === 'stopped') {
      if (live.has(e.name)) toStop.push(e.name);
      continue;
    }
    if (!local.has(e.name)) toMaterialize.push(e);
  }
  return { toMaterialize, toStop };
}

/** The spaces the engine should run: everything EXCEPT project spaces whose
 *  registry record is `stopped`. Personal and unregistered project folders pass
 *  through. This is the single enforcement point for "stopped stays stopped" —
 *  route every raw `roots.spaces()` add/sync/backup loop through it (spec §7). */
export function activeManagedSpaces(
  registry: ProjectRegistryEntry[],
  spaces: SyncSpace[],
): SyncSpace[] {
  const stopped = new Set(registry.filter(e => e.state === 'stopped').map(e => e.name));
  return spaces.filter(s => s.kind !== 'project' || !stopped.has(spaceProjectName(s)));
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd youcoded/desktop && npx vitest run tests/materialization-planner.test.ts`

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/sync-spaces/materialization-planner.ts desktop/tests/materialization-planner.test.ts
git commit -m "feat(sync): pure reconcile planner + active-space gate"
```

---

## Task 3: Engine `removeSpace` + `liveSpaceIds`

**Files:** Modify `desktop/src/main/sync-spaces/engine.ts`; Test — add to the existing engine test file (find it: `desktop/tests/sync-spaces-engine.test.ts` or similar; if none exists for the engine, create `desktop/tests/sync-spaces-engine-remove.test.ts`).

- [ ] **Step 1: Write the failing test**

Add (or create) a test that a live space can be removed without stopping the others. Adapt the harness to the existing engine tests (they construct a `SpaceSyncEngine` with a fake transport and temp dirs). If creating fresh:

```ts
// desktop/tests/sync-spaces-engine-remove.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SpaceSyncEngine } from '../src/main/sync-spaces/engine';
import type { PullResult, PushResult, SpaceVersion, SyncSpace, SyncTransport } from '../src/main/sync-spaces/types';

// Minimal no-op transport — addSpace calls init(); sync calls pull()+push().
const transport: SyncTransport = {
  async init() {}, async hasRemote() { return false; }, async setRemote() {},
  async pull(): Promise<PullResult> { return { updated: false, conflictCopies: [] }; },
  async push(): Promise<PushResult> { return { pushed: false, oversize: [] }; },
  async history(): Promise<SpaceVersion[]> { return []; },
};

let tmp: string;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-eng-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });

const mkSpace = (id: string): SyncSpace => {
  const root = path.join(tmp, id.replace(/:/g, '_'));
  fs.mkdirSync(root, { recursive: true });
  return { id, kind: id === 'personal' ? 'personal' : 'project', root };
};

describe('SpaceSyncEngine.removeSpace', () => {
  it('removes one live space, leaving others live', async () => {
    const engine = new SpaceSyncEngine(transport, { pollMs: 0, debounceMs: 50, onEvent: () => {} });
    const a = mkSpace('project:a'); const b = mkSpace('project:b');
    await engine.addSpace(a); await engine.addSpace(b);
    expect(engine.liveSpaceIds().sort()).toEqual(['project:a', 'project:b']);
    await engine.removeSpace('project:a');
    expect(engine.liveSpaceIds()).toEqual(['project:b']);
    // Removing an unknown id is a no-op.
    await engine.removeSpace('project:missing');
    expect(engine.liveSpaceIds()).toEqual(['project:b']);
    await engine.stop();
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`liveSpaceIds`/`removeSpace` not functions)

Run: `cd youcoded/desktop && npx vitest run tests/sync-spaces-engine-remove.test.ts`

- [ ] **Step 3: Implement** — add two methods to `SpaceSyncEngine` (after `stop()`):

```ts
  /** Ids of the spaces this engine currently watches. Used by the service's
   *  reconcile to decide which stopped projects have a live space to detach. */
  liveSpaceIds(): string[] {
    return [...this.states.keys()];
  }

  /** Detach ONE space (Stop-syncing) without touching the folder or the others.
   *  Delete from the map FIRST so a finishing sync's queued rerun early-returns
   *  in syncSpace (same ordering as stop()); then close the watcher and await any
   *  in-flight sync (its git subprocesses hold handles in the space root — on
   *  Windows that blocks folder use until they exit). */
  async removeSpace(id: string): Promise<void> {
    const st = this.states.get(id);
    if (!st) return;
    this.states.delete(id);
    if (st.debounce) clearTimeout(st.debounce);
    await st.watcher.close();
    if (st.current) await st.current.catch(() => {});
  }
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd youcoded/desktop && npx vitest run tests/sync-spaces-engine-remove.test.ts`

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/sync-spaces/engine.ts desktop/tests/sync-spaces-engine-remove.test.ts
git commit -m "feat(sync): engine removeSpace + liveSpaceIds (per-space detach)"
```

---

## Task 4: Register projects on create / import + backfill

**Files:** Modify `desktop/src/main/sync-spaces/service.ts`; Test additions in `desktop/tests/sync-spaces-service.test.ts`.

**Before writing:** read the current `sync-spaces-service.test.ts` to learn its mock harness (the `vi.hoisted` `h` object, `freshService`, the `ManagedRoots` / `SpaceManager` / `GitTransport` / engine mocks). The additions below assume you upgrade the `ManagedRoots` mock to be **stateful** (so a mid-test `createProject` is visible to a later `spaces()`/`listProjects()`), expose `personalRoot`/`projectsRoot`, and add a mock for the new `project-registry` module. Adapt names to the real harness.

- [ ] **Step 1: Upgrade mocks + write the failing test**

Make the `ManagedRoots` mock stateful and registry-aware. Add to the hoisted `h`: `projects: [] as string[]`, `registry: [] as any[]`, and spies `ensureEntry: vi.fn()`, `setDisplay: vi.fn()`, `setStopped: vi.fn()`. Reset them in `beforeEach`.

```ts
vi.mock('../src/main/sync-spaces/managed-roots', () => ({
  ManagedRoots: class {
    readonly personalRoot = '/fake/personal';
    readonly projectsRoot = '/fake/projects';
    readonly youcodedRoot = '/fake';
    ensure(): void {}
    listProjects() { return h.projects.map((n: string) => ({ name: n, path: `/fake/projects/${n}` })); }
    createProject(name: string) {
      if (h.projects.includes(name)) return { ok: false, error: 'exists' };
      h.projects.push(name);
      return { ok: true, path: `/fake/projects/${name}` };
    }
    spaces() {
      return [
        { id: 'personal', kind: 'personal', root: '/fake/personal' },
        ...h.projects.map((n: string) => ({ id: `project:${n}`, kind: 'project', root: `/fake/projects/${n}` })),
      ];
    }
  },
}));

vi.mock('../src/main/sync-spaces/project-registry', () => ({
  PROJECT_REGISTRY_SCHEMA: 1,
  readProjectRegistry: () => h.registry,
  ensureProjectEntry: (_root: string, input: any) => { h.ensureEntry(input); },
  setProjectDisplayName: async (_r: string, name: string, repo: string, dn: string) => { h.setDisplay({ name, repo, dn }); },
  setProjectStopped: async (_r: string, name: string, repo: string) => { h.setStopped({ name, repo }); },
}));
```

Test (place inside the top-level `describe`):

```ts
  it('creating a project registers it (name + deterministic repoName)', async () => {
    h.autoAddSpace = true;
    h.spaces = [{ id: 'personal', kind: 'personal', root: '/fake/personal' }];
    const svc = await freshService();
    await svc.syncSpacesEnable(true);
    await svc.syncSpacesCreateProject('delta');
    expect(h.ensureEntry).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'delta', repoName: expect.stringContaining('youcoded-sync-project-delta-') }),
    );
  });
```

(The real `repoNameForSpace` is NOT mocked, so assert the real prefix. If the service test mocks `space-manager`, keep `repoNameForSpace` real — only mock `provisionRemote`.)

- [ ] **Step 2: Run — expect FAIL** (`ensureEntry` not called)

Run: `cd youcoded/desktop && npx vitest run tests/sync-spaces-service.test.ts -t "registers it"`

- [ ] **Step 3: Implement** — in `service.ts`:

Add imports after `import { importProjectFolder } from './import-project';`:
```ts
import { readProjectRegistry, ensureProjectEntry, setProjectDisplayName, setProjectStopped } from './project-registry';
import { planReconcile, activeManagedSpaces } from './materialization-planner';
```
(`planReconcile`/`activeManagedSpaces`/`setProject*` are used in Tasks 5-6 — importing now keeps the block in one edit.)

Add a helper above `syncSpacesCreateProject`:
```ts
// Register a project so peers can discover it. repoName is derived purely from
// the id, so ensureProjectEntry writes the same file on every device (§8).
function registerProject(name: string, root: string): void {
  if (!roots) return;
  ensureProjectEntry(roots.personalRoot, {
    name,
    repoName: repoNameForSpace({ id: `project:${name}`, kind: 'project', root }),
  });
}

// One-time on enable: register every project already on this device so
// pre-existing / sync-was-off projects enter the registry. Idempotent
// (ensureProjectEntry is create-if-absent — no churn, no clobber).
function backfillRegistry(): void {
  if (!roots) return;
  for (const p of roots.listProjects()) registerProject(p.name, p.path);
}
```

In `syncSpacesCreateProject`, add right after `const result = roots!.createProject(name);`:
```ts
  if (result.ok) registerProject(name, result.path);
```

In `syncSpacesImportProject`, add right after the `importProjectFolder({...})` result, before the `if (result.ok && engine)` block:
```ts
  if (result.ok) registerProject(name, result.path);
```

- [ ] **Step 4: Run — expect PASS** (new test + the whole file, to confirm the mock upgrade didn't break existing tests)

Run: `cd youcoded/desktop && npx vitest run tests/sync-spaces-service.test.ts`

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/sync-spaces/service.ts desktop/tests/sync-spaces-service.test.ts
git commit -m "feat(sync): register projects on create/import + backfill helper"
```

---

## Task 5: Discovery, materialization, the stop gate, and triggers

**Files:** Modify `desktop/src/main/sync-spaces/service.ts`; Test additions in `desktop/tests/sync-spaces-service.test.ts`.

- [ ] **Step 1: Write the failing tests**

Add inside the top-level `describe` (adapt to the harness — `h.engines[0]`, `h.hub.opts.onEvent`, `h.ensureRemoteFails`, etc.; if the harness lacks an `ensureRemoteFails` knob, add one to the `SpaceManager` mock's `ensureRemote`):

```ts
  async function enabledSvc() {
    h.autoAddSpace = true;
    h.spaces = [{ id: 'personal', kind: 'personal', root: '/fake/personal' }];
    const svc = await freshService();
    await svc.syncSpacesEnable(true);
    return svc;
  }

  it('discovery materializes a registered active project missing locally', async () => {
    const svc = await enabledSvc();
    h.registry = [{ schemaVersion: 1, name: 'gamma', repoName: 'r-gamma', displayName: 'gamma', state: 'active', updatedAt: 1 }];
    const engine = h.engines[0];
    engine.added.length = 0;
    h.hub.opts.onEvent({ type: 'connected' }); // reconcile-on-connect → runDiscovery
    await vi.waitFor(() => expect(h.projects).toContain('gamma'));
    expect(engine.added).toContain('project:gamma');
    void svc;
  });

  it('discovery skips an already-local project', async () => {
    h.autoAddSpace = true;
    h.spaces = [{ id: 'personal', kind: 'personal', root: '/fake/personal' }];
    h.projects = ['alpha'];
    const svc = await freshService();
    await svc.syncSpacesEnable(true);
    h.registry = [{ schemaVersion: 1, name: 'alpha', repoName: 'r-alpha', displayName: 'alpha', state: 'active', updatedAt: 1 }];
    const before = [...h.projects];
    h.hub.opts.onEvent({ type: 'connected' });
    await new Promise((r) => setTimeout(r, 20));
    expect(h.projects).toEqual(before); // no new create
    void svc;
  });

  it('a materialize failure (ensureRemote rejects) emits an error and creates no space', async () => {
    const svc = await enabledSvc();
    h.registry = [{ schemaVersion: 1, name: 'gamma', repoName: 'r-gamma', displayName: 'gamma', state: 'active', updatedAt: 1 }];
    h.ensureRemoteFails = true;
    const engine = h.engines[0];
    engine.added.length = 0;
    h.hub.opts.onEvent({ type: 'connected' });
    await vi.waitFor(async () => {
      const st = await svc.syncSpacesStatus();
      expect(st.recentEvents.some((e: any) => e.type === 'error' && String(e.spaceId).includes('gamma'))).toBe(true);
    });
    expect(engine.added).not.toContain('project:gamma');
    expect(h.projects).not.toContain('gamma');
    void svc;
  });

  it('a Personal synced+updated event triggers discovery', async () => {
    const svc = await enabledSvc();
    h.registry = [{ schemaVersion: 1, name: 'gamma', repoName: 'r-gamma', displayName: 'gamma', state: 'active', updatedAt: 1 }];
    // Simulate the engine emitting a Personal-space applied-changes event.
    h.onEvent!({ type: 'synced', spaceId: 'personal', pushed: false, updated: true });
    await vi.waitFor(() => expect(h.projects).toContain('gamma'));
    void svc;
  });

  it('the active-space gate keeps a stopped project out at engine start', async () => {
    h.autoAddSpace = true;
    h.projects = ['beta'];
    h.registry = [{ schemaVersion: 1, name: 'beta', repoName: 'r-beta', displayName: 'beta', state: 'stopped', updatedAt: 1 }];
    h.spaces = [{ id: 'personal', kind: 'personal', root: '/fake/personal' }];
    const svc = await freshService();
    await svc.syncSpacesEnable(true);
    const engine = h.engines[0];
    expect(engine.added).not.toContain('project:beta'); // gated out
    void svc;
  });
```

Extend the `SpaceManager` mock's `ensureRemote` for the failure knob:
```ts
    async ensureRemote() { if (h.ensureRemoteFails) throw new Error('gh not signed in'); return 'https://github.com/x/y.git'; }
```
Add `ensureRemoteFails: false` to `h` and reset it in `beforeEach`.

- [ ] **Step 2: Run — expect FAIL** (no discovery / no gate)

Run: `cd youcoded/desktop && npx vitest run tests/sync-spaces-service.test.ts -t "discovery"` (and `-t "gate"`, `-t "Personal synced"`, `-t "materialize failure"`)

- [ ] **Step 3: Implement** — in `service.ts`:

Add module-level single-flight state after `let transition: Promise<void> = Promise.resolve();`:
```ts
// Cross-device project discovery (2026-07-12). Single-flight + one coalesced
// rerun (mirrors the engine's syncSpace guard) so overlapping triggers (boot,
// hub-connected, Personal-updated) can't race two createProject calls for one name.
let discovering = false;
let discoverAgain = false;
```

Add `materializeProject` + `runDiscovery` above `startEngine`:
```ts
// Materialize one registered project this device is missing. ORDERING IS
// LOAD-BEARING (spec §7): ensureRemote FIRST (uses only the id — a gh-auth
// failure creates NOTHING); createProject makes the empty folder; addSpace makes
// it a live, poll-retriable space BEFORE the first pull (a failed pull leaves a
// recoverable empty space, not an orphan); setRemote + syncSpace's first-sync
// pull adopts origin/main (unborn local main → checkout -B main origin/main).
async function materializeProject(entry: { name: string; repoName: string }): Promise<void> {
  if (!engine || !roots || !manager) return;
  const e = engine;
  const url = await manager.ensureRemote({ id: `project:${entry.name}`, kind: 'project', root: '' });
  const created = roots.createProject(entry.name);
  if (!created.ok) return; // taken locally between plan and now — idempotent no-op
  const space = roots.spaces().find((s) => s.id === `project:${entry.name}`);
  if (!space || engine !== e) return; // disabled mid-materialize — next boot/connect adds it
  await e.addSpace(space);
  const transport = new GitTransport({ deviceName: os.hostname() });
  await transport.setRemote(space, url);
  await e.syncSpace(space);
}

// Reconcile local projects against the synced registry: materialize missing
// active projects, detach stopped ones (keeping the folder). Reads the registry
// ON DISK — callers ensure freshness (startEngine awaits a Personal pull; the
// broadcast/connected triggers fire after a Personal sync) — rather than syncing
// Personal itself (which would recurse through the broadcast trigger). Never
// throws: a per-project failure becomes an error event and retries next
// boot/connect. Single-flight with one coalesced rerun.
async function runDiscovery(): Promise<void> {
  if (!engine || !roots) return;
  if (discovering) { discoverAgain = true; return; }
  discovering = true;
  try {
    do {
      discoverAgain = false;
      if (!engine || !roots) break;
      const registry = readProjectRegistry(roots.personalRoot);
      const localNames = roots.listProjects().map((p) => p.name);
      const liveNames = engine.liveSpaceIds()
        .filter((id) => id.startsWith('project:')).map((id) => id.slice('project:'.length));
      const plan = planReconcile(registry, localNames, liveNames);
      for (const name of plan.toStop) {
        if (!engine) break;
        try { await engine.removeSpace(`project:${name}`); } // keep the folder
        catch (err: any) { broadcast({ type: 'error', spaceId: `project:${name}`, message: `Could not stop syncing "${name}": ${String(err?.message ?? err)}` }); }
      }
      for (const entry of plan.toMaterialize) {
        if (!engine || !roots) break;
        try { await materializeProject(entry); }
        catch (err: any) { broadcast({ type: 'error', spaceId: `project:${entry.name}`, message: `Could not add project "${entry.name}" from another device: ${String(err?.message ?? err)}` }); }
      }
    } while (discoverAgain);
  } finally {
    discovering = false;
  }
}
```

Add a small helper used by the three add/sync/backup sites (place near the top of the module functions):
```ts
// The spaces the engine should actually run — spaces() minus stopped projects
// (spec §7 single enforcement point). Reads the registry on disk each call;
// cheap (a small dir of tiny files).
function activeSpaces() {
  if (!roots) return [];
  return activeManagedSpaces(readProjectRegistry(roots.personalRoot), roots.spaces());
}
```

**Route the three `roots.spaces()` iteration sites through `activeSpaces()`:**
- In `startEngine` the start loop: `for (const space of roots!.spaces())` → `for (const space of activeSpaces())`.
- In the SyncHub `connected` handler: `if (engine && roots) for (const s of roots.spaces()) void engine.syncSpace(s);` → `for (const s of activeSpaces()) void engine.syncSpace(s);` (keep the `engine && roots` guard).
- In `startSyncSpaces`'s `runBackup`: `roots!.spaces()` → `activeSpaces()`.

**Wire the triggers:**

(a) In `startEngine`, after the supersession guard `if (engine !== e) return;` (line ~149) and before `hubStatus = 'connecting';`, insert:
```ts
  // Cross-device discovery: await a fresh Personal pull so the registry is
  // current, register this device's own projects, then reconcile.
  const personalSpace = roots!.spaces().find((s) => s.kind === 'personal');
  if (personalSpace) { try { await e.syncSpace(personalSpace); } catch { /* offline — poll/connect retries */ } }
  if (engine !== e) return; // disabled while we synced Personal — bail
  backfillRegistry();
  void runDiscovery();
```

(b) In the SyncHub `connected` branch, after the reconcile-on-connect `for (const s of activeSpaces()) void engine.syncSpace(s);`, add:
```ts
        void runDiscovery(); // retry any project a prior materialize missed; apply stop tombstones
```

(c) In `broadcast(e)`, after the hub-signal `try { … } catch { … }` block, add:
```ts
  // A Personal pull that APPLIED changes may have added/renamed/stopped registry
  // records — reconcile. Guarded to Personal + updated so it fires only when the
  // registry could have changed; runDiscovery is single-flight so bursts coalesce.
  try {
    if (stamped.type === 'synced' && stamped.updated && roots) {
      const personal = roots.spaces().find((s) => s.kind === 'personal');
      if (personal && stamped.spaceId === personal.id) void runDiscovery();
    }
  } catch { /* discovery is best-effort — boot/connect retries */ }
```

- [ ] **Step 4: Run — expect PASS** (all discovery tests + the whole file)

Run: `cd youcoded/desktop && npx vitest run tests/sync-spaces-service.test.ts`

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/sync-spaces/service.ts desktop/tests/sync-spaces-service.test.ts
git commit -m "feat(sync): discover/materialize + stop gate + triggers"
```

---

## Task 6: Rename + Stop service functions + payload fields

**Files:** Modify `desktop/src/main/sync-spaces/service.ts`; Test additions in `desktop/tests/sync-spaces-service.test.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
  it('syncSpacesRenameProject writes displayName + pushes Personal', async () => {
    h.autoAddSpace = true; h.projects = ['app'];
    h.spaces = [{ id: 'personal', kind: 'personal', root: '/fake/personal' }];
    const svc = await freshService();
    await svc.syncSpacesEnable(true);
    await svc.syncSpacesRenameProject('app', 'Cool App');
    expect(h.setDisplay).toHaveBeenCalledWith(expect.objectContaining({ name: 'app', dn: 'Cool App' }));
    // Personal was synced to push the rename (engine.syncSpace called for personal).
    expect(h.engines[0].synced).toContain('personal');
  });

  it('syncSpacesStopProject tombstones, pushes Personal, and removes the live space', async () => {
    h.autoAddSpace = true; h.projects = ['app'];
    h.spaces = [{ id: 'personal', kind: 'personal', root: '/fake/personal' }];
    const svc = await freshService();
    await svc.syncSpacesEnable(true);
    const engine = h.engines[0];
    await svc.syncSpacesStopProject('app');
    expect(h.setStopped).toHaveBeenCalledWith(expect.objectContaining({ name: 'app' }));
    expect(engine.removed).toContain('project:app'); // detached, folder kept
    expect(h.engines[0].synced).toContain('personal'); // pushed
  });

  it('status spaces carry displayName + state for synced projects', async () => {
    h.autoAddSpace = true; h.projects = ['app'];
    h.registry = [{ schemaVersion: 1, name: 'app', repoName: 'r-app', displayName: 'Cool App', state: 'active', updatedAt: 1 }];
    h.spaces = [{ id: 'personal', kind: 'personal', root: '/fake/personal' }];
    const svc = await freshService();
    await svc.syncSpacesEnable(true);
    const st = await svc.syncSpacesStatus();
    const row = st.spaces.find((s: any) => s.id === 'project:app');
    expect(row.displayName).toBe('Cool App');
    expect(row.state).toBe('active');
  });
```

Ensure the engine mock records `synced` (an array pushed to in its `syncSpace`) and `removed` (pushed to in `removeSpace`). Add those to the `FakeEngine` mock if absent.

- [ ] **Step 2: Run — expect FAIL** (functions/fields missing)

Run: `cd youcoded/desktop && npx vitest run tests/sync-spaces-service.test.ts -t "Rename"` (and `-t "Stop"`, `-t "displayName"`)

- [ ] **Step 3: Implement** — in `service.ts`:

Add a helper and two exported functions (near the other IPC-facing functions):
```ts
function repoNameFor(name: string): string {
  return repoNameForSpace({ id: `project:${name}`, kind: 'project', root: '' });
}

async function pushPersonal(): Promise<void> {
  if (!engine || !roots) return;
  const personal = roots.spaces().find((s) => s.kind === 'personal');
  if (personal) await engine.syncSpace(personal); // push the registry change to peers
}

/** Rename = change the SYNCED display name only (no folder move). Propagates via
 *  the Personal space; peers relabel via the read-time overlay in the status
 *  payload (spec §8). */
export async function syncSpacesRenameProject(name: string, displayName: string) {
  if (!roots) return { ok: false as const, error: 'Sync is still starting up — try again in a moment' };
  await setProjectDisplayName(roots.personalRoot, name, repoNameFor(name), displayName);
  await pushPersonal();
  return { ok: true as const };
}

/** Stop syncing = tombstone the registry record, push it, then detach the live
 *  space locally while KEEPING the folder (spec §7). The activeSpaces() gate
 *  keeps it detached on every future boot; the tombstone stops peers from
 *  re-materializing and detaches their live space via runDiscovery's toStop. */
export async function syncSpacesStopProject(name: string) {
  if (!roots) return { ok: false as const, error: 'Sync is still starting up — try again in a moment' };
  await setProjectStopped(roots.personalRoot, name, repoNameFor(name));
  await pushPersonal();
  if (engine) await engine.removeSpace(`project:${name}`);
  return { ok: true as const };
}
```

Add `displayName` + `state` to the spaces payload in `syncSpacesStatus`:
```ts
export async function syncSpacesStatus() {
  const registry = roots ? readProjectRegistry(roots.personalRoot) : [];
  const byName = new Map(registry.map((e) => [e.name, e]));
  return {
    enabled: manager?.isEnabled() ?? false,
    spaces: roots?.spaces().map((s) => {
      const name = s.id.startsWith('project:') ? s.id.slice('project:'.length) : '';
      const rec = byName.get(name);
      return {
        ...s,
        remote: manager?.remoteFor(s.id) ?? null,
        // Read-time overlay (spec §8): synced display name + lifecycle state.
        displayName: rec?.displayName ?? name,
        state: rec?.state ?? (s.kind === 'project' ? 'active' : undefined),
      };
    }) ?? [],
    recentEvents,
    syncHub: hubStatus,
  };
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd youcoded/desktop && npx vitest run tests/sync-spaces-service.test.ts`

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/sync-spaces/service.ts desktop/tests/sync-spaces-service.test.ts
git commit -m "feat(sync): rename + stop project service fns + displayName/state payload"
```

---

## Task 7: IPC parity for `syncSpacesRenameProject` + `syncSpacesStopProject`

**Files:** `desktop/src/main/preload.ts`, `desktop/src/renderer/remote-shim.ts`, `desktop/src/main/ipc-handlers.ts`, `desktop/src/main/remote-server.ts`, `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`; Test: `desktop/tests/ipc-channels.test.ts`.

**Method:** grep for an existing sync-spaces IPC method that takes an arg and returns `{ok}` — `syncspaces:sync-now` (`syncSpacesSyncNow`) — and mirror its wiring exactly across all five surfaces for the two new channels:
- `syncspaces:rename-project` → payload `{ name, displayName }` → `syncSpacesRenameProject(name, displayName)`
- `syncspaces:stop-project` → payload `{ name }` → `syncSpacesStopProject(name)`

- [ ] **Step 1: Add the parity test first**

In `desktop/tests/ipc-channels.test.ts`, find the sync-spaces parity `describe` (it asserts each `syncspaces:*` channel string appears in `preload.ts`, `remote-shim.ts`, `ipc-handlers.ts`, and — for a stub — `SessionService.kt`). Add `syncspaces:rename-project` and `syncspaces:stop-project` to that assertion set. Run it and watch it FAIL (channels not present yet).

Run: `cd youcoded/desktop && npx vitest run tests/ipc-channels.test.ts`

- [ ] **Step 2: Wire all five surfaces** (mirror `syncspaces:sync-now`)

- `preload.ts` (`window.claude.syncSpaces`): add
  ```ts
  renameProject: (name: string, displayName: string) => invoke('syncspaces:rename-project', { name, displayName }),
  stopProject: (name: string) => invoke('syncspaces:stop-project', { name }),
  ```
- `remote-shim.ts`: add the same two methods on the shared `syncSpaces` object, routing through the WS `invoke`.
- `ipc-handlers.ts`: register
  ```ts
  ipcMain.handle('syncspaces:rename-project', (_e, p) => syncSpacesRenameProject(p.name, p.displayName));
  ipcMain.handle('syncspaces:stop-project', (_e, p) => syncSpacesStopProject(p.name));
  ```
  (import the two functions from `./sync-spaces/service`).
- `remote-server.ts`: add the two cases to its `syncspaces:*` message switch, calling the same service functions (mirror the existing `syncspaces:sync-now` case).
- `SessionService.kt`: add the two message-type `when` cases returning the not-implemented stub, mirroring the other sync-spaces stubs:
  ```kotlin
  "syncspaces:rename-project", "syncspaces:stop-project" ->
      bridgeServer.respond(ws, msg.type, msg.id, JSONObject().put("ok", false).put("error", "not-implemented-on-mobile"))
  ```
  (Fold into the existing combined sync-spaces stub `when` case if one exists.)

- [ ] **Step 3: Run parity test — expect PASS**

Run: `cd youcoded/desktop && npx vitest run tests/ipc-channels.test.ts`

- [ ] **Step 4: Commit**

```bash
git add desktop/src/main/preload.ts desktop/src/renderer/remote-shim.ts desktop/src/main/ipc-handlers.ts desktop/src/main/remote-server.ts app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt desktop/tests/ipc-channels.test.ts
git commit -m "feat(sync): IPC parity for rename/stop project (four surfaces + android stub)"
```

---

## Task 8: Renderer — Stop button, rename wiring, stopped dot, name overlay

**Files (read each before editing):** `desktop/src/renderer/components/project-view/ProjectHero.tsx`, `desktop/src/renderer/components/sync-dot-state.ts`, the Project View / ProjectSwitcher / FolderSwitcher row components that render a project name, and wherever `window.claude.syncSpaces.status()` spaces are consumed.

This task is UI wiring on top of the now-working backend. Mirror existing hero affordances (the hero already has **Rename** and **Sync now** buttons — copy their structure).

- [ ] **Step 1: `sync-dot-state.ts` — add a "stopped / not syncing" state.** It already derives green/red/gray from a space's sync status; add a branch: a project space whose `state === 'stopped'` → gray dot, label `"Sync stopped"`. Add/adjust its unit test (`sync-dot-state.test.ts`) with a stopped case. Keep the label strings pinned (they're a UI contract).

- [ ] **Step 2: Name overlay.** Wherever a project row currently shows the folder name, prefer the `displayName` from the sync spaces payload (Task 6) when present. Single source of truth — do NOT write it back into `youcoded-folders.json` (spec §8). For a plain local folder with no synced record, fall back to the existing nickname/folder name.

- [ ] **Step 3: Hero "Stop syncing" button** (synced/managed projects only), behind a plain-language consequence confirm (per the destructive-UI convention — mirror an existing confirm in the app):
  > "Stop syncing '<name>'? The folder stays on all your devices, but changes will no longer sync between them. This can't be undone from here."
  On confirm → `await window.claude.syncSpaces.stopProject(name)`. Refresh the view (the ProjectView already refreshes on `syncSpaces.onEvent`; a stop pushes a Personal `synced` event, but also refresh optimistically).

- [ ] **Step 4: Wire hero Rename to sync.** For a synced project, the existing Rename action calls `await window.claude.syncSpaces.renameProject(name, newDisplayName)` (propagates) instead of the local-only `folders.rename`. For a plain local folder, keep `folders.rename`.

- [ ] **Step 5: Typecheck + build the renderer**

Run: `cd youcoded/desktop && npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/renderer
git commit -m "feat(sync): Project View Stop-syncing button, rename-through-sync, stopped dot, name overlay"
```

---

## Task 9: Real-git convergence integration test

**Files:** Create `desktop/tests/sync-spaces-project-discovery.test.ts`.

Proves against REAL git (no mocks) that (a) the `ProjectSync/` registry actually syncs through the transport, (b) a peer's project materializes with its synced display name, and (c) a stop propagates + detaches + does NOT respawn.

- [ ] **Step 1: Write the test**

```ts
// desktop/tests/sync-spaces-project-discovery.test.ts
// Real-git integration for cross-device project discovery/rename/stop (spec
// 2026-07-12). Two ManagedRoots + real bare remotes, mirroring
// sync-spaces-two-device.test.ts. Exercises the registry + planner + transport
// directly (no service/Electron layer) so convergence is provable against git.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { ManagedRoots } from '../src/main/sync-spaces/managed-roots';
import { GitTransport } from '../src/main/sync-spaces/git-transport';
import { SpaceSyncEngine } from '../src/main/sync-spaces/engine';
import {
  readProjectRegistry, ensureProjectEntry, setProjectStopped,
} from '../src/main/sync-spaces/project-registry';
import { planReconcile, activeManagedSpaces } from '../src/main/sync-spaces/materialization-planner';
import type { SyncSpace } from '../src/main/sync-spaces/types';

let tmp: string;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-disc-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });

function bare(name: string): string {
  const p = path.join(tmp, name); fs.mkdirSync(p);
  execFileSync('git', ['init', '--bare', '--initial-branch=main', p]);
  return p;
}

it('device B discovers, materializes, and (after a stop) detaches a project', async () => {
  const personalBare = bare('personal.git');
  const appBare = bare('app.git');
  const laptop = new ManagedRoots(path.join(tmp, 'laptop'));
  const desktop = new ManagedRoots(path.join(tmp, 'desktop'));
  laptop.ensure(); desktop.ensure();

  const lT = new GitTransport({ deviceName: 'Laptop' });
  const dT = new GitTransport({ deviceName: 'Desktop' });
  const lEngine = new SpaceSyncEngine(lT, { debounceMs: 200, pollMs: 0, onEvent: () => {} });
  const dEngine = new SpaceSyncEngine(dT, { debounceMs: 200, pollMs: 0, onEvent: () => {} });

  const lPersonal = laptop.spaces().find(s => s.kind === 'personal')!;
  const dPersonal = desktop.spaces().find(s => s.kind === 'personal')!;
  await lEngine.addSpace(lPersonal); await lT.setRemote(lPersonal, personalBare);
  await dEngine.addSpace(dPersonal); await dT.setRemote(dPersonal, personalBare);

  // Laptop creates + pushes the 'app' project and registers it in Personal.
  laptop.createProject('app');
  const lApp = laptop.spaces().find(s => s.id === 'project:app')!;
  await lEngine.addSpace(lApp); await lT.setRemote(lApp, appBare);
  fs.writeFileSync(path.join(lApp.root, 'CLAUDE.md'), '# app\n');
  await lEngine.syncSpace(lApp);
  ensureProjectEntry(laptop.personalRoot, { name: 'app', repoName: 'app' });
  await lEngine.syncSpace(lPersonal);

  // Desktop pulls Personal → the registry file must arrive (proves ProjectSync/ syncs).
  await dEngine.syncSpace(dPersonal);
  let registry = readProjectRegistry(desktop.personalRoot);
  expect(registry.map(e => e.name)).toEqual(['app']);

  // Desktop reconciles + materializes (mirrors runDiscovery, appBare stands in
  // for the repoName→URL the real ensureRemote returns).
  let plan = planReconcile(registry, desktop.listProjects().map(p => p.name), dEngine.liveSpaceIds());
  expect(plan.toMaterialize.map(e => e.name)).toEqual(['app']);
  for (const entry of plan.toMaterialize) {
    desktop.createProject(entry.name);
    const space = desktop.spaces().find(s => s.id === `project:${entry.name}`) as SyncSpace;
    await dEngine.addSpace(space);
    await dT.setRemote(space, appBare);
    await dEngine.syncSpace(space);
  }
  expect(fs.readFileSync(path.join(desktop.projectsRoot, 'app', 'CLAUDE.md'), 'utf8')).toBe('# app\n');
  expect(desktop.listProjects().map(p => p.name)).toContain('app');

  // Laptop STOPS syncing 'app' and pushes the tombstone.
  await setProjectStopped(laptop.personalRoot, 'app', 'app');
  await lEngine.syncSpace(lPersonal);

  // Desktop pulls Personal → registry says stopped → reconcile detaches, keeps folder.
  await dEngine.syncSpace(dPersonal);
  registry = readProjectRegistry(desktop.personalRoot);
  expect(registry.find(e => e.name === 'app')!.state).toBe('stopped');
  plan = planReconcile(registry, desktop.listProjects().map(p => p.name), dEngine.liveSpaceIds());
  expect(plan.toStop).toEqual(['app']);
  for (const name of plan.toStop) await dEngine.removeSpace(`project:${name}`);
  expect(dEngine.liveSpaceIds()).not.toContain('project:app'); // detached
  expect(fs.existsSync(path.join(desktop.projectsRoot, 'app', 'CLAUDE.md'))).toBe(true); // folder KEPT

  // Re-reconcile must NOT respawn a live space (activeManagedSpaces gate).
  const gated = activeManagedSpaces(registry, desktop.spaces());
  expect(gated.map(s => s.id)).not.toContain('project:app');
  const plan2 = planReconcile(registry, desktop.listProjects().map(p => p.name), dEngine.liveSpaceIds());
  expect(plan2.toMaterialize).toEqual([]);
  expect(plan2.toStop).toEqual([]); // no live space to stop

  await lEngine.stop(); await dEngine.stop();
}, 30_000);
```

- [ ] **Step 2: Run — expect PASS** (a failure on the registry-arrives assertion means `ProjectSync/` is being ignored by sync — the regression this test guards)

Run: `cd youcoded/desktop && npx vitest run tests/sync-spaces-project-discovery.test.ts`

- [ ] **Step 3: Full sync-spaces + new-module sweep**

Run: `cd youcoded/desktop && npx vitest run tests/sync-spaces-*.test.ts tests/project-registry.test.ts tests/materialization-planner.test.ts tests/ipc-channels.test.ts`

- [ ] **Step 4: Typecheck + build**

Run: `cd youcoded/desktop && npm run build`

- [ ] **Step 5: Commit**

```bash
git add desktop/tests/sync-spaces-project-discovery.test.ts
git commit -m "test(sync): real-git convergence for discovery, materialize, and stop"
```

---

## Task 10: Docs — PITFALLS, handoff, knowledge-debt

**Files (youcoded-dev workspace repo):** `docs/PITFALLS.md`, `docs/superpowers/2026-07-10-sync-completion-handoff.md`, `docs/knowledge-debt.md`.

- [ ] **Step 1: Add a PITFALLS subsection** under the Sync Spaces area:

```markdown
### Cross-device project discovery / rename / stop (2026-07-12, youcoded `feat/sync-project-discovery`)

Spec: `docs/superpowers/specs/2026-07-12-cross-device-project-discovery-design.md`. Modules: `desktop/src/main/sync-spaces/{project-registry,materialization-planner}.ts` + `engine.ts` (`removeSpace`/`liveSpaceIds`) + `service.ts` wiring.

- **The project registry lives at `~/YouCoded/Personal/ProjectSync/<name>.json` — VISIBLE per-file, mirroring the Conversation Store, NEVER under `.youcoded/`** (that basename is the transport's hidden git dir AND a `DEFAULT_IGNORES` entry, so anything under it never syncs). `sync-spaces-project-discovery.test.ts` pins that the registry round-trips through the transport.
- **The record is convergent and mutable (`{schemaVersion,name,repoName,displayName,state,updatedAt}`) — `name` is the IMMUTABLE identity (folder name), `displayName`/`state` are synced+mutable.** The field-wise merge: **`state` is `stopped`-dominates monotonic** (NOT last-writer-wins — a stale rename on a device that hasn't pulled the stop must never un-stop it; consequence: no Resume without a per-field `state` timestamp), **`displayName` is last-writer-wins** by `updatedAt`. Reuses `laterOf`/`isConflictCopyName`/`extractConflictBase` (`conversations/store-core`) + `mutateFileUnderLock` (`artifacts/cas-write`).
- **Fold-on-read is load-bearing — provable against the transport.** The transport's conflict policy is remote-wins-canonical, so it can leave the WRONG winner as the canonical `<name>.json` (a peer's older `active` overwriting a local `stopped`). `readProjectRegistry` folds every conflict copy into the canonical in memory (stopped dominates), so a stopped project can't read active and resurrect. Copy files are left in place (rare, inert). Don't "optimize away" the fold.
- **Rename is display-name only; the folder never moves** (`repoName` derives from the folder name, which stays fixed — that's why no ULID). True on-disk folder rename is deferred (spec §15).
- **Stop = tombstone + `engine.removeSpace` + KEEP the folder.** The folder stays under `Projects/`, still a project, just detached. `activeManagedSpaces()` (the ONE gate, routed through all three `roots.spaces()` sites — startEngine add loop, hub-connected sync loop, daily-backup loop) keeps stopped projects out of the live engine so they never respawn. Don't filter at the sites individually and don't make `ManagedRoots.spaces()` registry-aware.
- **`ensureRemote` runs FIRST in materialize** (it uses only `space.id`, so a gh-auth failure creates nothing); `addSpace` runs BEFORE the first pull (a failed pull leaves a recoverable empty space). Materialize reuses the empty-folder + first-sync-pull path — NO `git clone`.
- **`runDiscovery` is single-flight + one coalesced rerun**, reads the registry ON DISK (triggers guarantee freshness: startEngine awaits a Personal pull; broadcast/connected fire after a Personal sync). Don't make it sync Personal itself (recurses through the broadcast trigger).
- **UI: the status dot is the sync/stopped signal; location ≠ status** (synced + unsynced projects both live in `Projects/`). The richer 3-category Project View labeling (native-synced / native-unsynced / external) is a deferred follow-up (spec §10/§15).
- **Android:** no discovery yet (Phase 3); `syncspaces:rename-project`/`syncspaces:stop-project` are `not-implemented-on-mobile` stubs. Registry format is platform-neutral for later reuse.
```

- [ ] **Step 2: Update the handoff.** In `docs/superpowers/2026-07-10-sync-completion-handoff.md`: mark **A00** done-on-`feat/sync-project-discovery` (→ DONE when merged); rewrite **A01** to reflect that rename (display-name) + un-sync (stop) are now DELIVERED here, leaving only the genuinely-deferred pieces (Resume, true on-disk folder rename, remote-repo cleanup, the 3-category UI) as future — and note they are NOT release-gating on their own (the core lifecycle is covered).

- [ ] **Step 3: Clear the knowledge-debt entry** for cross-device project auto-discovery (mark resolved, pointing at the spec + plan).

- [ ] **Step 4: Commit + push the workspace docs**

```bash
cd /c/Users/desti/youcoded-dev
git add docs/PITFALLS.md docs/superpowers/2026-07-10-sync-completion-handoff.md docs/knowledge-debt.md
git commit -m "docs(sync): PITFALLS + handoff + knowledge-debt for project discovery/rename/stop"
git push origin master
```

---

## Execution Setup (do this before Task 1)

Create an isolated worktree in the `youcoded` repo (never work on `master` directly):

```bash
cd /c/Users/desti/youcoded-dev/youcoded
git fetch origin && git checkout master && git pull origin master
git worktree add ../youcoded.wt/sync-project-discovery -b feat/sync-project-discovery
cd ../youcoded.wt/sync-project-discovery
# Share node_modules from the main checkout (Windows junction) to skip a reinstall:
cmd //c "mklink /J desktop\\node_modules ..\\..\\youcoded\\desktop\\node_modules"
```

**Windows junction teardown (CRITICAL — from CLAUDE.md):** before `git worktree remove`, delete the junction FIRST or the remove follows it and wipes the MAIN checkout's `node_modules`:

```bash
cmd //c "rmdir desktop\\node_modules"   # remove the junction (NOT rm -rf, which follows it)
cd /c/Users/desti/youcoded-dev/youcoded
git worktree remove ../youcoded.wt/sync-project-discovery
git branch -D feat/sync-project-discovery   # after the PR merges
```

Do NOT run the desktop build and any Gradle build concurrently in this worktree (`bundleWebUi` runs `npm ci`, wiping `node_modules` mid-build).

---

## Self-Review

**Spec coverage:** §4 record → Task 1. §4a merge/fold → Task 1 (+ pinned in tests). §5 store API → Task 1. §6 planner + gate → Task 2. §7 materialize + removeSpace + gate → Tasks 3, 5. §8 writers + IPC + name overlay → Tasks 4, 6, 7, 8. §9 triggers → Task 5. §10 UI → Task 8. §11 failure modes → Tasks 5, 9. §13 testing → Tasks 1-9. §14 file plan → File Structure. §15 out-of-scope → Scope note (nothing implements them). ✅

**Placeholder scan:** New modules + new test files carry complete code. Tasks 4-8 that touch large existing files (service tests, IPC surfaces, renderer) give exact new code/signatures + a "read the file first, mirror pattern X" instruction because reproducing those files verbatim isn't feasible — each names the exact function to mirror (`syncSpacesSyncNow`, existing hero Rename/Sync-now). ✅

**Type consistency:** `ProjectRegistryEntry {schemaVersion,name,repoName,displayName,state,updatedAt}` defined in Task 1, imported by Task 2 and the service (Tasks 4-6). `planReconcile(registry, localNames, liveNames): {toMaterialize, toStop}` and `activeManagedSpaces(registry, spaces)` consistent across Tasks 2, 5, 9. `engine.removeSpace(id)` / `liveSpaceIds()` defined Task 3, used Tasks 5, 6, 9. `setProjectDisplayName(root,name,repo,displayName)` / `setProjectStopped(root,name,repo)` / `ensureProjectEntry(root,{name,repoName})` consistent across Tasks 1, 4, 6, 9. IPC channels `syncspaces:rename-project` / `syncspaces:stop-project` consistent across Task 7 surfaces. ✅

**Ordering dependencies:** Task 3 (engine) before Task 5 (uses removeSpace/liveSpaceIds). Task 4 (`registerProject`) before Task 5 (`backfillRegistry` reuses it). Task 6 before Task 7 (IPC calls the service fns). Task 6's payload fields before Task 8's overlay. Execute in order.
