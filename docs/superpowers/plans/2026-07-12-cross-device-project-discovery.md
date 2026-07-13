# Cross-Device Project Auto-Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a project synced on one device silently appear (folder created, repo cloned, live-syncing) on every other device in the sync group.

**Architecture:** A per-file project registry (`{name, repoName}`) synced inside the always-present Personal space is the source of truth for "what projects exist in this sync group." Each device reads it, a pure planner decides which registered projects it lacks, and the service materializes each missing project by reusing the existing empty-folder + first-sync-pull path (`createProject` → `ensureRemote` → `addSpace` → `setRemote` → `syncSpace`). Discovery is triggered at engine start, on SyncHub connect, and whenever the Personal space pulls changes.

**Tech Stack:** TypeScript, Node `fs`, the existing `sync-spaces` modules (`ManagedRoots`, `SpaceManager`, `GitTransport`, `SpaceSyncEngine`, `service.ts`), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-12-cross-device-project-discovery-design.md`

**Worktree:** All code changes are in the `youcoded` repo. Create a worktree before starting (see Execution Setup). The plan/spec/doc edits are in the `youcoded-dev` workspace repo.

**Decisions resolved during planning (differ from the spec's initial sketch — spec being corrected in Task 6):**
- **Registry lives at `~/YouCoded/Personal/.youcoded-sync/projects/<name>.json`, NOT `.../.youcoded/...`.** `.youcoded/` is the transport's hidden git dir basename AND is in `DEFAULT_IGNORES` (`guards.ts`), so anything under it is never committed/pushed. `.youcoded-sync` is a distinct basename that the watcher (`WATCH_IGNORED` regex needs `.youcoded` followed by a slash or end) and the git ignore (`.youcoded/` matches the exact basename) both leave alone — so it syncs.
- **Materialization reuses the empty-folder + first-sync-pull path, not `git clone`.** `GitTransport.pull` already adopts the remote on an unborn local `main` via `checkout -B main origin/main` (git-transport.ts). So `createProject` (empty) → `addSpace` (inits hidden repo) → `setRemote` → `syncSpace` (pull adopts remote content) fully materializes a project with code that's already contract-tested. No temp `.materializing` dir is needed because no partial-clone artifact exists; a failed initial pull leaves an empty but live, poll-retriable space, not a corrupt folder.

---

## File Structure

**New files (youcoded repo):**
- `desktop/src/main/sync-spaces/project-registry.ts` — registry store: `ProjectRegistryEntry` type + `readProjectRegistry` / `writeProjectRegistry`. Owns the `.youcoded-sync/projects/` location and its fail-soft read + atomic idempotent write.
- `desktop/src/main/sync-spaces/materialization-planner.ts` — pure `planMaterialization(registry, localNames)`; no I/O.
- `desktop/tests/project-registry.test.ts`
- `desktop/tests/materialization-planner.test.ts`
- `desktop/tests/sync-spaces-project-discovery.test.ts` — real-git integration: registry file syncs through the transport + planner + materialize converge across two `ManagedRoots`.

**Modified files (youcoded repo):**
- `desktop/src/main/sync-spaces/service.ts` — registry writes in `syncSpacesCreateProject` / `syncSpacesImportProject`; `backfillRegistry`, `runDiscovery`, `materializeProject`; three discovery triggers (startEngine, SyncHub `connected`, `broadcast` on Personal `synced+updated`).
- `desktop/tests/sync-spaces-service.test.ts` — stateful `ManagedRoots` mock + `project-registry` mock; discovery-wiring tests.

**Modified files (youcoded-dev workspace repo — Task 6):**
- `docs/superpowers/specs/2026-07-12-cross-device-project-discovery-design.md` — correct §4 location + §7 approach + §8 triggers.
- `docs/PITFALLS.md` — new Sync Spaces subsection.
- `docs/superpowers/2026-07-10-sync-completion-handoff.md` — A00 status → in-progress/done.
- `docs/knowledge-debt.md` — clear the autodiscovery entry.

---

## Task 1: Project registry store

**Files:**
- Create: `desktop/src/main/sync-spaces/project-registry.ts`
- Test: `desktop/tests/project-registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// desktop/tests/project-registry.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readProjectRegistry, writeProjectRegistry } from '../src/main/sync-spaces/project-registry';

let personal: string;
beforeEach(() => { personal = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-reg-')); });
afterEach(() => { fs.rmSync(personal, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });

describe('project registry store', () => {
  it('round-trips an entry through the .youcoded-sync/projects dir', () => {
    writeProjectRegistry(personal, { name: 'app', repoName: 'youcoded-sync-project-app-abc', addedBy: 'Laptop', addedAt: '2026-07-12T00:00:00.000Z' });
    const got = readProjectRegistry(personal);
    expect(got).toEqual([{ name: 'app', repoName: 'youcoded-sync-project-app-abc', addedBy: 'Laptop', addedAt: '2026-07-12T00:00:00.000Z' }]);
    // Location is under .youcoded-sync (NOT .youcoded, which is git-ignored).
    expect(fs.existsSync(path.join(personal, '.youcoded-sync', 'projects', 'app.json'))).toBe(true);
  });

  it('returns [] when the registry dir does not exist', () => {
    expect(readProjectRegistry(personal)).toEqual([]);
  });

  it('skips a corrupt/partial file without throwing, keeping the good ones', () => {
    writeProjectRegistry(personal, { name: 'good', repoName: 'r-good', addedBy: 'x', addedAt: 't' });
    const dir = path.join(personal, '.youcoded-sync', 'projects');
    fs.writeFileSync(path.join(dir, 'bad.json'), '{ this is not json');
    const got = readProjectRegistry(personal);
    expect(got.map(e => e.name)).toEqual(['good']);
  });

  it('an identical rewrite does not change the file mtime (no watcher churn)', () => {
    const entry = { name: 'app', repoName: 'r', addedBy: 'x', addedAt: 't' };
    writeProjectRegistry(personal, entry);
    const file = path.join(personal, '.youcoded-sync', 'projects', 'app.json');
    const m1 = fs.statSync(file).mtimeMs;
    writeProjectRegistry(personal, entry); // identical → skipped
    expect(fs.statSync(file).mtimeMs).toBe(m1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run tests/project-registry.test.ts`
Expected: FAIL — cannot find module `../src/main/sync-spaces/project-registry`.

- [ ] **Step 3: Write the implementation**

```ts
// desktop/src/main/sync-spaces/project-registry.ts
// The per-project registry that makes cross-device project discovery possible.
// One JSON file per project, synced INSIDE the Personal space so every device
// sees the same list (spec 2026-07-12).
import fs from 'fs';
import path from 'path';

export interface ProjectRegistryEntry {
  name: string;      // the project's folder name under ~/YouCoded/Projects/
  repoName: string;  // repoNameForSpace(project) — the stable cross-device sync identity
  addedBy: string;   // hostname that first registered it (provenance only)
  addedAt: string;   // ISO timestamp (provenance only)
}

// WHY not `.youcoded/`: that basename is (a) the git transport's hidden git dir
// (<root>/.youcoded/sync.git) and (b) in DEFAULT_IGNORES (guards.ts), so anything
// under it is NEVER committed or pushed. `.youcoded-sync` is a DELIBERATELY
// different basename so the registry rides the Personal space's sync. Verified:
// WATCH_IGNORED's /(^|[\\/])\.youcoded([\\/]|$)/ needs `.youcoded` followed by a
// slash or end-of-segment, and git's `.youcoded/` ignore matches the exact
// basename — neither matches `.youcoded-sync`. The project-discovery integration
// test pins that the registry actually syncs, guarding against a future
// broadening of the ignore set.
function registryDir(personalRoot: string): string {
  return path.join(personalRoot, '.youcoded-sync', 'projects');
}

/** Read every registry entry. FAIL-SOFT: a corrupt/partial peer file (the dev
 *  instance and built app share ~/YouCoded) is skipped, never thrown — one bad
 *  file must not sink discovery for all the others. */
export function readProjectRegistry(personalRoot: string): ProjectRegistryEntry[] {
  const dir = registryDir(personalRoot);
  let names: string[];
  try { names = fs.readdirSync(dir); } catch { return []; }
  const out: ProjectRegistryEntry[] = [];
  for (const f of names) {
    if (!f.endsWith('.json')) continue;
    const full = path.join(dir, f);
    try {
      // Skip anything that isn't a real regular file (a half-written .tmp, a
      // stray dir) before reading.
      if (!fs.lstatSync(full).isFile()) continue;
      const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
      if (parsed && typeof parsed.name === 'string' && typeof parsed.repoName === 'string') {
        out.push({
          name: parsed.name,
          repoName: parsed.repoName,
          addedBy: String(parsed.addedBy ?? ''),
          addedAt: String(parsed.addedAt ?? ''),
        });
      }
    } catch { /* corrupt/partial file — skip */ }
  }
  return out;
}

/** Write one entry atomically. Idempotent: an identical rewrite is skipped so a
 *  boot-time backfill doesn't bump mtimes and wake the Personal watcher on every
 *  launch. Atomic temp+rename because the dev instance and built app share the
 *  tree — a concurrent reader must never see a half-written file. */
export function writeProjectRegistry(personalRoot: string, entry: ProjectRegistryEntry): void {
  const dir = registryDir(personalRoot);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${entry.name}.json`);
  const body = JSON.stringify(entry, null, 2) + '\n';
  try { if (fs.readFileSync(file, 'utf8') === body) return; } catch { /* absent — write it */ }
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, file);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd youcoded/desktop && npx vitest run tests/project-registry.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/sync-spaces/project-registry.ts desktop/tests/project-registry.test.ts
git commit -m "feat(sync): project registry store (per-file, synced in Personal space)"
```

---

## Task 2: Materialization planner (pure)

**Files:**
- Create: `desktop/src/main/sync-spaces/materialization-planner.ts`
- Test: `desktop/tests/materialization-planner.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// desktop/tests/materialization-planner.test.ts
import { describe, it, expect } from 'vitest';
import { planMaterialization } from '../src/main/sync-spaces/materialization-planner';
import type { ProjectRegistryEntry } from '../src/main/sync-spaces/project-registry';

const entry = (name: string): ProjectRegistryEntry => ({ name, repoName: `r-${name}`, addedBy: 'x', addedAt: 't' });

describe('planMaterialization', () => {
  it('returns registry projects that are missing locally', () => {
    const plan = planMaterialization([entry('alpha'), entry('beta')], ['alpha']);
    expect(plan.map(e => e.name)).toEqual(['beta']);
  });

  it('returns nothing when everything is already local', () => {
    expect(planMaterialization([entry('alpha')], ['alpha', 'gamma'])).toEqual([]);
  });

  it('returns nothing for an empty registry', () => {
    expect(planMaterialization([], ['alpha'])).toEqual([]);
  });

  it('dedups duplicate registry names defensively', () => {
    const plan = planMaterialization([entry('beta'), entry('beta')], []);
    expect(plan.map(e => e.name)).toEqual(['beta']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run tests/materialization-planner.test.ts`
Expected: FAIL — cannot find module `../src/main/sync-spaces/materialization-planner`.

- [ ] **Step 3: Write the implementation**

```ts
// desktop/src/main/sync-spaces/materialization-planner.ts
// PURE decision core (no I/O — same pattern as resolve-local-project.ts,
// buildSavedFolderProjects, discoverContext). Given the synced registry + the
// projects already on this device, return the entries this device must
// materialize.
import type { ProjectRegistryEntry } from './project-registry';

/** Registry projects missing locally. Skips names already present: a same-named
 *  local project already converges to the same repo via ensureRemote
 *  provisioning + the transport's unrelated-histories merge, so re-materializing
 *  would clobber a live folder. Dedups by name defensively (per-file storage
 *  already guarantees uniqueness, but a duplicate must never produce two
 *  createProject calls for one name). */
export function planMaterialization(
  registry: ProjectRegistryEntry[],
  localProjectNames: string[],
): ProjectRegistryEntry[] {
  const local = new Set(localProjectNames);
  const seen = new Set<string>();
  const out: ProjectRegistryEntry[] = [];
  for (const e of registry) {
    if (local.has(e.name) || seen.has(e.name)) continue;
    seen.add(e.name);
    out.push(e);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd youcoded/desktop && npx vitest run tests/materialization-planner.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/sync-spaces/materialization-planner.ts desktop/tests/materialization-planner.test.ts
git commit -m "feat(sync): pure materialization planner (registry vs local projects)"
```

---

## Task 3: Register a project on create/import

**Files:**
- Modify: `desktop/src/main/sync-spaces/service.ts` (`syncSpacesCreateProject`, `syncSpacesImportProject`, imports)
- Test: `desktop/tests/sync-spaces-service.test.ts` (add a create-writes-registry test)

This task adds the *writer* side only. The `ManagedRoots` mock in the service test currently returns `listProjects(): []` and lacks `personalRoot` / `createProject` / `projectsRoot`; upgrade it to a small stateful fake first so this task and Task 4 can both use it, and mock the new `project-registry` module.

- [ ] **Step 1: Upgrade the mocks and write the failing test**

In `desktop/tests/sync-spaces-service.test.ts`, replace the `ManagedRoots` mock (currently lines ~63-70) with a stateful fake, and add a `project-registry` mock. Add these to the `vi.hoisted` object `h` (inside the returned object): a `registry` array and a `projects` array.

Add to the `h = vi.hoisted(() => ({ ... }))` return object:
```ts
    // Cross-device discovery (2026-07-12): the registry entries readProjectRegistry
    // returns, and the local project names the fake ManagedRoots reports.
    registry: [] as Array<{ name: string; repoName: string; addedBy: string; addedAt: string }>,
    projects: [] as string[],
    writeRegistry: vi.fn(),
```

Replace the `ManagedRoots` mock with:
```ts
vi.mock('../src/main/sync-spaces/managed-roots', () => ({
  ManagedRoots: class {
    readonly personalRoot = '/fake/personal';
    readonly projectsRoot = '/fake/projects';
    ensure(): void {}
    listProjects(): Array<{ name: string; path: string }> {
      return h.projects.map((n) => ({ name: n, path: `/fake/projects/${n}` }));
    }
    createProject(name: string): { ok: true; path: string } | { ok: false; error: string } {
      if (h.projects.includes(name)) return { ok: false, error: 'exists' };
      h.projects.push(name);
      return { ok: true, path: `/fake/projects/${name}` };
    }
    // personal + one space per local project (read live so a mid-test create shows up).
    spaces(): Array<{ id: string; kind: string; root: string }> {
      return [
        { id: 'personal', kind: 'personal', root: '/fake/personal' },
        ...h.projects.map((n) => ({ id: `project:${n}`, kind: 'project', root: `/fake/projects/${n}` })),
      ];
    }
  },
}));
```

Add a new mock (place it next to the other `vi.mock` calls):
```ts
vi.mock('../src/main/sync-spaces/project-registry', () => ({
  readProjectRegistry: () => h.registry,
  writeProjectRegistry: (_root: string, entry: any) => { h.writeRegistry(entry); },
}));
```

In `beforeEach`, reset the new knobs:
```ts
    h.registry = [];
    h.projects = [];
    h.writeRegistry.mockClear();
```

Now add the writer test inside the top-level `describe`:
```ts
  it('creating a project writes a registry entry (name + repoName)', async () => {
    h.autoAddSpace = true;
    h.spaces = [{ id: 'personal', kind: 'personal', root: '/fake/personal' }];
    const svc = await freshService();
    await svc.syncSpacesEnable(true);
    await svc.syncSpacesCreateProject('delta');
    expect(h.writeRegistry).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'delta', repoName: 'repo-project:delta' }),
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd youcoded/desktop && npx vitest run tests/sync-spaces-service.test.ts -t "writes a registry entry"`
Expected: FAIL — `h.writeRegistry` never called (service doesn't write the registry yet).

- [ ] **Step 3: Add registry writes to the service**

In `desktop/src/main/sync-spaces/service.ts`, add imports near the top (after the existing `import { importProjectFolder } from './import-project';`):
```ts
import { readProjectRegistry, writeProjectRegistry } from './project-registry';
import { planMaterialization } from './materialization-planner';
```
(`planMaterialization` and `readProjectRegistry` are used in Task 4 — importing both now keeps the import block in one edit.)

Add a small helper above `syncSpacesCreateProject`:
```ts
// Register a project so this device's peers can discover it. repoNameForSpace is
// the stable cross-device identity; addedBy/addedAt are provenance only.
function registerProject(name: string, root: string): void {
  if (!roots) return;
  writeProjectRegistry(roots.personalRoot, {
    name,
    repoName: repoNameForSpace({ id: `project:${name}`, kind: 'project', root }),
    addedBy: os.hostname(),
    addedAt: new Date().toISOString(),
  });
}
```

In `syncSpacesCreateProject`, after `const result = roots!.createProject(name);` and before the `if (result.ok && engine)` block, add:
```ts
  if (result.ok) registerProject(name, result.path);
```

In `syncSpacesImportProject`, after `const result = await importProjectFolder({ ... });` and before the `if (result.ok && engine)` block, add:
```ts
  if (result.ok && roots) registerProject(name, result.path);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd youcoded/desktop && npx vitest run tests/sync-spaces-service.test.ts -t "writes a registry entry"`
Expected: PASS. Also run the whole file to confirm the mock upgrade didn't break the existing tests:
Run: `cd youcoded/desktop && npx vitest run tests/sync-spaces-service.test.ts`
Expected: PASS (all existing tests + the new one).

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/sync-spaces/service.ts desktop/tests/sync-spaces-service.test.ts
git commit -m "feat(sync): register projects in the registry on create/import"
```

---

## Task 4: Discovery + materialization in the service

**Files:**
- Modify: `desktop/src/main/sync-spaces/service.ts` (`backfillRegistry`, `runDiscovery`, `materializeProject`, three triggers)
- Test: `desktop/tests/sync-spaces-service.test.ts` (discovery-wiring tests)

- [ ] **Step 1: Write the failing tests**

Add these tests inside the top-level `describe` in `desktop/tests/sync-spaces-service.test.ts`:
```ts
  // ---- Cross-device project discovery (2026-07-12) ----

  async function enabledDiscoveryService() {
    h.autoAddSpace = true;
    h.spaces = [{ id: 'personal', kind: 'personal', root: '/fake/personal' }];
    const svc = await freshService();
    await svc.syncSpacesEnable(true);
    return svc;
  }

  it('a hub-connected reconcile materializes a registered project missing locally', async () => {
    const svc = await enabledDiscoveryService();
    h.registry = [{ name: 'gamma', repoName: 'repo-project:gamma', addedBy: 'Laptop', addedAt: 't' }];
    const engine = h.engines[0];
    engine.added.length = 0;
    h.hub.opts.onEvent({ type: 'connected' }); // triggers reconcile + discovery
    await vi.waitFor(() => expect(h.projects).toContain('gamma'));
    expect(engine.added).toContain('project:gamma'); // added as a live space
    void svc;
  });

  it('discovery skips a project that already exists locally', async () => {
    h.autoAddSpace = true;
    h.spaces = [{ id: 'personal', kind: 'personal', root: '/fake/personal' }];
    h.projects = ['alpha'];
    const svc = await freshService();
    await svc.syncSpacesEnable(true);
    h.registry = [{ name: 'alpha', repoName: 'repo-project:alpha', addedBy: 'x', addedAt: 't' }];
    const createSpy = vi.spyOn(await import('../src/main/sync-spaces/managed-roots').then(m => m.ManagedRoots.prototype), 'createProject');
    h.hub.opts.onEvent({ type: 'connected' });
    await new Promise((r) => setTimeout(r, 20));
    expect(createSpy).not.toHaveBeenCalled();
    createSpy.mockRestore();
    void svc;
  });

  it('a materialize failure emits an error event and creates no space', async () => {
    const svc = await enabledDiscoveryService();
    h.registry = [{ name: 'gamma', repoName: 'repo-project:gamma', addedBy: 'x', addedAt: 't' }];
    h.ensureRemoteFails = true; // see mock change below
    const engine = h.engines[0];
    engine.added.length = 0;
    h.hub.opts.onEvent({ type: 'connected' });
    await vi.waitFor(() => {
      const evs = (recentEventsSync(svc)).filter((e: any) => e.type === 'error' && String(e.spaceId).includes('gamma'));
      expect(evs.length).toBeGreaterThan(0);
    });
    expect(engine.added).not.toContain('project:gamma');
    expect(h.projects).not.toContain('gamma');
    void svc;
  });

  it('a Personal-space synced+updated event triggers discovery', async () => {
    const svc = await enabledDiscoveryService();
    h.registry = [{ name: 'gamma', repoName: 'repo-project:gamma', addedBy: 'x', addedAt: 't' }];
    h.onEvent!({ type: 'synced', spaceId: 'personal', pushed: false, updated: true });
    await vi.waitFor(() => expect(h.projects).toContain('gamma'));
    void svc;
  });
```

Add a tiny helper near the top of the file (below `waitForGate`):
```ts
function recentEventsSync(svc: any): any[] {
  // syncSpacesStatus is async; the failure test only needs recentEvents, so read
  // it via a resolved status. Returns a snapshot array.
  let out: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  svc.syncSpacesStatus().then((s: any) => { out = s.recentEvents; });
  return out;
}
```
Actually prefer awaiting; replace the failure test's assertion block with a direct await:
```ts
    await vi.waitFor(async () => {
      const st = await svc.syncSpacesStatus();
      const evs = st.recentEvents.filter((e: any) => e.type === 'error' && String(e.spaceId).includes('gamma'));
      expect(evs.length).toBeGreaterThan(0);
    });
```
(Delete the `recentEventsSync` helper — the awaited form is cleaner.)

The failure test needs `ensureRemote` to reject. Extend the `SpaceManager` mock and add an `h.ensureRemoteFails` knob. In the `h = vi.hoisted(...)` object add `ensureRemoteFails: false,`. In `beforeEach` add `h.ensureRemoteFails = false;`. Change the `SpaceManager` mock's `ensureRemote`:
```ts
    async ensureRemote(): Promise<string> {
      if (h.ensureRemoteFails) throw new Error('gh not signed in');
      return 'https://github.com/x/y.git';
    }
```

The materialize path also constructs a `new GitTransport(...).setRemote(...)`. The existing `GitTransport` mock has `init` + `setRemote` — both no-ops, so that's already covered. The `FakeEngine.syncSpace` is already a spy that resolves — covered.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd youcoded/desktop && npx vitest run tests/sync-spaces-service.test.ts -t "discovery"` and `... -t "materialize"` and `... -t "Personal-space synced"`
Expected: FAIL — projects never gain `gamma` (no discovery wired yet).

- [ ] **Step 3: Implement discovery in the service**

In `desktop/src/main/sync-spaces/service.ts`, add module-level single-flight state near the other `let` declarations (after `let transition: Promise<void> = Promise.resolve();`):
```ts
// Cross-device project discovery (2026-07-12). Single-flight + one coalesced
// rerun, mirroring the engine's syncSpace guard — overlapping triggers (boot,
// hub-connected, Personal-updated) must not race into two createProject calls
// for the same name.
let discovering = false;
let discoverAgain = false;
```

Add these functions (place them above `startEngine`):
```ts
// Register every project currently on this device, so peers can discover them.
// Idempotent — writeProjectRegistry skips identical rewrites, so a boot-time
// backfill causes no watcher churn after the first run.
function backfillRegistry(): void {
  if (!roots) return;
  for (const p of roots.listProjects()) registerProject(p.name, p.path);
}

// Materialize one registered project this device is missing. ORDERING IS
// LOAD-BEARING: ensureRemote runs FIRST so a gh-auth failure creates NOTHING;
// createProject then makes the (empty) folder; addSpace makes it a live, watched,
// poll-retriable space BEFORE the first pull, so even a failed initial syncSpace
// leaves a recoverable empty space rather than an orphan folder; syncSpace's
// first-sync pull adopts origin/main (the transport checks out origin/main on an
// unborn local main) to bring the peer's content in. Reuses the exact path
// createProject/import already exercise — no git clone, no temp dir.
async function materializeProject(entry: { name: string; repoName: string }): Promise<void> {
  if (!engine || !roots || !manager) return;
  const url = await manager.ensureRemote({ id: `project:${entry.name}`, kind: 'project', root: '' });
  const created = roots.createProject(entry.name);
  if (!created.ok) return; // name taken locally between plan and now — idempotent no-op
  const space = roots.spaces().find((s) => s.id === `project:${entry.name}`);
  if (!space || !engine) return; // disabled mid-materialize — next boot's main loop adds the folder
  await engine.addSpace(space);
  const transport = new GitTransport({ deviceName: os.hostname() });
  await transport.init(space);
  await transport.setRemote(space, url);
  await engine.syncSpace(space);
}

// Reconcile the local project set against the synced registry. Reads the
// registry ON DISK (callers ensure it's fresh: startEngine awaits a Personal
// pull; the broadcast + connected triggers fire after a Personal sync). Never
// throws — a per-project failure becomes an error event and the project is
// retried on the next boot/connect. Single-flight with one coalesced rerun.
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
      for (const entry of planMaterialization(registry, localNames)) {
        if (!engine || !roots) break;
        try {
          await materializeProject(entry);
        } catch (err: any) {
          broadcast({
            type: 'error',
            spaceId: `project:${entry.name}`,
            message: `Could not add project "${entry.name}" from another device: ${String(err?.message ?? err)}`,
          });
        }
      }
    } while (discoverAgain);
  } finally {
    discovering = false;
  }
}
```

Wire the three triggers:

**(a) startEngine** — after the supersession guard `if (engine !== e) return;` (currently at line ~149, right before `hubStatus = 'connecting';`), insert:
```ts
  // Cross-device project discovery: await a fresh Personal-space pull so the
  // registry is current, register this device's own projects, then reconcile any
  // projects a peer synced that we don't have yet.
  const personalSpace = roots!.spaces().find((s) => s.kind === 'personal');
  if (personalSpace) { try { await e.syncSpace(personalSpace); } catch { /* offline — poll/connect retries */ } }
  if (engine !== e) return; // disabled while we synced Personal — bail
  backfillRegistry();
  void runDiscovery();
```

**(b) SyncHub `connected`** — in the `hubSocket = createSyncHubSocket({ ... onEvent: (ev) => { ... } })` handler, in the `else if (ev.type === 'connected')` branch, after the existing `if (engine && roots) for (const s of roots.spaces()) void engine.syncSpace(s);`, add:
```ts
        void runDiscovery(); // retry any project a prior materialize missed
```

**(c) broadcast — Personal synced+updated** — in `broadcast(e)`, after the existing hub-signal `try { ... } catch { ... }` block (the one that calls `hubSocket.sendSignal`), add:
```ts
  // A Personal-space pull that APPLIED changes may have added project registry
  // entries — reconcile the local project set. Guarded to the Personal space +
  // updated so it fires only when the registry could have changed; runDiscovery
  // is single-flight so bursts coalesce.
  try {
    if (stamped.type === 'synced' && stamped.updated && roots) {
      const personal = roots.spaces().find((s) => s.kind === 'personal');
      if (personal && stamped.spaceId === personal.id) void runDiscovery();
    }
  } catch { /* discovery is best-effort — boot/connect retries */ }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd youcoded/desktop && npx vitest run tests/sync-spaces-service.test.ts`
Expected: PASS (all existing + the four new discovery tests).

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/sync-spaces/service.ts desktop/tests/sync-spaces-service.test.ts
git commit -m "feat(sync): discover + materialize cross-device projects from the registry"
```

---

## Task 5: Real-git convergence integration test

**Files:**
- Create: `desktop/tests/sync-spaces-project-discovery.test.ts`

This proves — against REAL git, no mocks — that (a) the registry file actually syncs through the transport (guarding the `.youcoded-sync` naming decision) and (b) the planner + materialize path brings a peer's project onto a second device.

- [ ] **Step 1: Write the test**

```ts
// desktop/tests/sync-spaces-project-discovery.test.ts
// Real-git integration for cross-device project discovery (spec 2026-07-12):
// device A registers + pushes a project; device B pulls the registry, plans, and
// materializes the project via the empty-folder + first-sync-pull path. No
// service/Electron layer — exercises the registry, planner, and transport
// directly so the convergence is provable against real git.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { ManagedRoots } from '../src/main/sync-spaces/managed-roots';
import { GitTransport } from '../src/main/sync-spaces/git-transport';
import { SpaceSyncEngine } from '../src/main/sync-spaces/engine';
import { readProjectRegistry, writeProjectRegistry } from '../src/main/sync-spaces/project-registry';
import { planMaterialization } from '../src/main/sync-spaces/materialization-planner';
import type { SyncSpace } from '../src/main/sync-spaces/types';

let tmp: string;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-disc-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });

function bare(name: string): string {
  const p = path.join(tmp, name);
  fs.mkdirSync(p);
  execFileSync('git', ['init', '--bare', '--initial-branch=main', p]);
  return p;
}

it('device B discovers and materializes a project device A registered', async () => {
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

  // Laptop creates + pushes the 'app' project.
  laptop.createProject('app');
  const lApp = laptop.spaces().find(s => s.id === 'project:app')!;
  await lEngine.addSpace(lApp); await lT.setRemote(lApp, appBare);
  fs.writeFileSync(path.join(lApp.root, 'CLAUDE.md'), '# app\n');
  await lEngine.syncSpace(lApp);

  // Laptop registers 'app' in the Personal space and pushes Personal.
  writeProjectRegistry(laptop.personalRoot, { name: 'app', repoName: 'app', addedBy: 'Laptop', addedAt: '2026-07-12T00:00:00.000Z' });
  await lEngine.syncSpace(lPersonal);

  // Desktop pulls Personal → the registry file must arrive (proves it syncs).
  await dEngine.syncSpace(dPersonal);
  const registry = readProjectRegistry(desktop.personalRoot);
  expect(registry.map(e => e.name)).toEqual(['app']);

  // Desktop plans + materializes the missing project (mirrors runDiscovery).
  const plan = planMaterialization(registry, desktop.listProjects().map(p => p.name));
  expect(plan.map(e => e.name)).toEqual(['app']);
  for (const entry of plan) {
    const created = desktop.createProject(entry.name);
    expect(created.ok).toBe(true);
    const space = desktop.spaces().find(s => s.id === `project:${entry.name}`) as SyncSpace;
    await dEngine.addSpace(space);
    await dT.setRemote(space, appBare); // repoName 'app' → appBare in this test
    await dEngine.syncSpace(space);
  }

  // The peer's content is now on desktop, and 'app' is a local project.
  expect(fs.existsSync(path.join(desktop.projectsRoot, 'app', 'CLAUDE.md'))).toBe(true);
  expect(fs.readFileSync(path.join(desktop.projectsRoot, 'app', 'CLAUDE.md'), 'utf8')).toBe('# app\n');
  expect(desktop.listProjects().map(p => p.name)).toContain('app');

  await lEngine.stop(); await dEngine.stop();
}, 30_000);
```

- [ ] **Step 2: Run the test**

Run: `cd youcoded/desktop && npx vitest run tests/sync-spaces-project-discovery.test.ts`
Expected: PASS. (If it fails on the registry-arrives assertion, the `.youcoded-sync` location is being ignored — that is the exact regression this test guards.)

- [ ] **Step 3: Run the whole sync-spaces suite to confirm no regressions**

Run: `cd youcoded/desktop && npx vitest run tests/sync-spaces-*.test.ts tests/project-registry.test.ts tests/materialization-planner.test.ts`
Expected: PASS (all).

- [ ] **Step 4: Typecheck + build**

Run: `cd youcoded/desktop && npm run build`
Expected: build succeeds (tsc has no errors for the new/changed files).

- [ ] **Step 5: Commit**

```bash
git add desktop/tests/sync-spaces-project-discovery.test.ts
git commit -m "test(sync): real-git convergence for cross-device project discovery"
```

---

## Task 6: Docs — spec correction, PITFALLS, handoff, knowledge-debt

**Files (youcoded-dev workspace repo):**
- Modify: `docs/superpowers/specs/2026-07-12-cross-device-project-discovery-design.md`
- Modify: `docs/PITFALLS.md`
- Modify: `docs/superpowers/2026-07-10-sync-completion-handoff.md`
- Modify: `docs/knowledge-debt.md`

- [ ] **Step 1: Correct the spec's resolved decisions**

In `docs/superpowers/specs/2026-07-12-cross-device-project-discovery-design.md`:
- §4 heading + body: change every `~/YouCoded/Personal/.youcoded/projects/` to `~/YouCoded/Personal/.youcoded-sync/projects/`, and replace the "Hidden `.youcoded/` control dir" bullet with:
  > - **Control dir `.youcoded-sync/` (NOT `.youcoded/`).** `.youcoded/` is the git transport's hidden git-dir basename AND is in `DEFAULT_IGNORES`, so anything under it is never committed/pushed — it would silently never sync. `.youcoded-sync` is a distinct basename the watcher and git-ignore both leave alone. Plan 2b's `devices.json` can join as `.youcoded-sync/devices.json`.
- §7: replace the "clone into a temp path → atomic rename" mechanism and the "Transport-init detail to settle in the plan" note with the resolved approach:
  > Materialization reuses the empty-folder + first-sync-pull path (no `git clone`, no temp dir): `ensureRemote` (resolve URL, already-exists recovery) → `createProject` (empty folder) → `addSpace` (inits the hidden repo + watches) → `setRemote` → `syncSpace` (the transport adopts `origin/main` on an unborn local `main`, checking out the peer's content). Ordering is load-bearing: `ensureRemote` first so a gh-auth failure creates nothing; `addSpace` before the first pull so a failed pull leaves a recoverable empty space, not an orphan. No partial-clone artifact exists, so no complete-then-register temp dir is needed.
- §8: add the third trigger:
  > - **`broadcast` on Personal `synced` + `updated:true`**: a Personal-space pull that applied changes may have added registry entries — reconcile. This is what makes a project created on device A appear on device B within seconds (A pushes → hub signal → B pulls Personal → updated → discovery).
- §12: mark open question #1 **Resolved (empty-folder + first-sync-pull; see §7)**.

- [ ] **Step 2: Add a PITFALLS subsection**

In `docs/PITFALLS.md`, under the Sync Spaces area, add:
```markdown
### Cross-device project auto-discovery (2026-07-12, youcoded `feat/sync-project-discovery`)

Spec: `docs/superpowers/specs/2026-07-12-cross-device-project-discovery-design.md`. Module: `desktop/src/main/sync-spaces/{project-registry,materialization-planner}.ts` + `service.ts` wiring.

- **The project registry lives at `~/YouCoded/Personal/.youcoded-sync/projects/<name>.json` — NEVER `.youcoded/`.** `.youcoded/` is the transport's hidden git-dir basename AND is in `DEFAULT_IGNORES` (`guards.ts`), so anything under it is never committed/pushed — a registry there would silently never sync and discovery would be dead. `.youcoded-sync` is a distinct basename the `WATCH_IGNORED` regex (needs `.youcoded` + slash/end) and git's `.youcoded/` ignore (exact basename) both leave alone. `sync-spaces-project-discovery.test.ts` pins that the registry actually round-trips through the transport — if someone broadens the ignore to `.youcoded*`, that test breaks.
- **One file per project is what makes the registry conflict-free.** Two devices adding different projects touch different files (clean git merge); two devices adding the same name write byte-identical content (deterministic `repoName`). Don't collapse it into one `projects.json` — concurrent adds would textually conflict. Mirrors the 2a Conversation Store's per-record-file design.
- **Materialization reuses the empty-folder + first-sync-pull path — do NOT reintroduce `git clone`.** `createProject` (empty) → `addSpace` → `setRemote` → `syncSpace` works because `GitTransport.pull` adopts `origin/main` on an unborn local `main`. Ordering is load-bearing: `ensureRemote` FIRST (gh-auth failure creates nothing), `addSpace` BEFORE the first pull (a failed pull leaves a recoverable empty space, not an orphan folder). There is no temp `.materializing` dir because there is no partial-clone artifact.
- **`runDiscovery` is single-flight with one coalesced rerun.** Three triggers fire it (startEngine after an awaited Personal pull; SyncHub `connected`; `broadcast` on Personal `synced`+`updated`). Without the guard, overlapping triggers could race two `createProject` calls for one name. Don't remove it.
- **Discovery reads the registry ON DISK; the triggers guarantee freshness.** startEngine awaits a Personal `syncSpace` before backfill+discovery; the broadcast + connected triggers fire only after a Personal sync. Don't make `runDiscovery` sync Personal itself — that recurses through the broadcast trigger.
- **Silent by design.** Every synced project lands on every device; there's no per-device selective sync (deferred). The `synced` event drives the Sync-panel record. Un-sync/rename propagation are deferred — the registry is add/update only.
- **Android:** no discovery yet (Phase 3, with the rest of Android sync). The registry format is platform-neutral so the Kotlin engine can consume it unchanged later.
```

- [ ] **Step 3: Update the handoff + clear knowledge-debt**

In `docs/superpowers/2026-07-10-sync-completion-handoff.md` §2 item A00: change the status line to note it is now designed + planned + implemented on `feat/sync-project-discovery` (update to "DONE" when merged), referencing the spec and plan paths.

In `docs/knowledge-debt.md`: remove (or mark resolved) the high-priority cross-device project auto-discovery entry, pointing at the spec + plan.

- [ ] **Step 4: Commit + push the workspace docs**

```bash
cd /c/Users/desti/youcoded-dev
git add docs/superpowers/specs/2026-07-12-cross-device-project-discovery-design.md docs/PITFALLS.md docs/superpowers/2026-07-10-sync-completion-handoff.md docs/knowledge-debt.md
git commit -m "docs(sync): correct project-discovery spec + PITFALLS/handoff/knowledge-debt"
git push origin master
```

---

## Execution Setup (do this before Task 1)

Create an isolated worktree in the `youcoded` repo (per workspace convention — never work on `master` directly):

```bash
cd /c/Users/desti/youcoded-dev/youcoded
git fetch origin && git checkout master && git pull origin master
git worktree add ../youcoded.wt/sync-project-discovery -b feat/sync-project-discovery
cd ../youcoded.wt/sync-project-discovery
# Share node_modules from the main checkout to avoid a full reinstall (Windows junction):
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

**Spec coverage:**
- §4 registry (per-file, Personal space) → Task 1. ✅
- §5 registry store (fail-soft read, atomic write) → Task 1. ✅
- §6 pure planner → Task 2. ✅
- §4 writers (create/import + backfill) → Task 3 (create/import) + Task 4 (`backfillRegistry`). ✅
- §7 materialization (complete/robust ordering) → Task 4 `materializeProject`. ✅ (approach corrected to first-sync-pull; spec updated in Task 6)
- §8 triggers (boot/enable, connected, Personal-updated) → Task 4. ✅
- §9 failure/transparency (error events, retry) → Task 4 `runDiscovery` catch + Task 4 tests. ✅
- §10 testing (planner, store, service integration, convergence) → Tasks 2, 1, 4, 5. ✅
- §11 file plan → matches the File Structure section. ✅

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N" — every code step has complete code; the one doc step (Task 6) quotes exact replacement text. ✅

**Type consistency:** `ProjectRegistryEntry {name, repoName, addedBy, addedAt}` defined in Task 1, imported by Task 2 (`planMaterialization`), and constructed in Task 3/4 (`registerProject`, `backfillRegistry`). `planMaterialization(registry, localNames)` signature matches across Tasks 2 and 4. `materializeProject(entry)`, `runDiscovery()`, `backfillRegistry()`, `registerProject(name, root)` names consistent between the implementation and the triggers. `repoNameForSpace` is already imported in service.ts. ✅

**Note on `registerProject`:** defined in Task 3 (used by create/import) and reused by `backfillRegistry` in Task 4 — Task 4 depends on Task 3 having added it. Execute tasks in order.
