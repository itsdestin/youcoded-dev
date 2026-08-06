---
status: draft
---

# Per-Project Description Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every project a short, synced, user-written description that appears on the project card and in the project list.

**Architecture:** The description is a sibling of the name at every layer. Synced projects store it in the cross-device project registry next to `displayName`, with its **own** last-writer-wins clock; plain local folders store it in the saved-folders record next to `nickname` and it stays local. Both are overlaid onto the project list at read time, and the renderer prefers the synced one. Two new IPC channels mirror the two existing rename channels across all four desktop surfaces plus Android.

**Tech Stack:** TypeScript (Electron main + React renderer), Vitest, Kotlin (Android), JSON file stores.

**Spec:** `docs/active/specs/2026-08-05-project-description-design.md`

**Branch:** Work continues on `feat/project-description` (worktree `worktrees/project-description`), which already carries the approved UI as a workbench mockup against fake channels. This plan replaces those fakes with real ones and applies three decisions made after the mockup was approved.

## Global Constraints

- **Never bump `PROJECT_REGISTRY_SCHEMA`.** It stays `1`. `parseEntry` rejects on strict inequality and reads are fail-soft-skip, so bumping it makes every older device drop *every* record.
- **`description` gets its own clock (`descriptionUpdatedAt`), never `updatedAt`.** `mergeProjectEntries` picks the newer entry wholesale; a shared clock silently reverts a rename made on another device.
- **Max length is 200 characters**, enforced in both setters and as `maxLength` on the input. Constant: `PROJECT_DESCRIPTION_MAX`.
- **Empty normalises to `null`, never `""`.**
- **Status indicator on the project card is a colored DOT, not a glyph** (decision 2026-08-06, reversing mockup change 13). `sync-spaces.md` pins dots as the one sanctioned status-color use and the switcher rows already use them.
- **Every user-facing sync string stays verbatim** from the 2026-07-09 spec — see `syncPill.detail` in `ProjectHero.tsx`. Never replace a real engine error with a guess.
- **Run `bash scripts/verify.sh project-description`** before claiming any task done. Android is not covered by it (`./gradlew test` separately).

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `desktop/src/shared/artifacts/types.ts` | `PROJECT_DESCRIPTION_MAX`, `CentralIndexProject.description` | 1 |
| `desktop/src/main/sync-spaces/project-registry.ts` | registry field, tolerant parse, independent merge, setter | 1 |
| `desktop/tests/sync-spaces-project-registry.test.ts` | merge convergence + parse tolerance guards | 1 |
| `desktop/src/main/sync-spaces/service.ts` | read-time overlay + `syncSpacesSetProjectDescription` | 2 |
| `desktop/src/main/preload.ts`, `renderer/remote-shim.ts`, `main/ipc-handlers.ts`, `main/remote-server.ts` | synced channel, 4 surfaces | 3 |
| `desktop/tests/ipc-channels.test.ts` | parity rows for both channels | 3, 5 |
| `app/.../runtime/SessionService.kt` | synced channel fast-reject stub | 3 |
| `desktop/src/main/saved-folders.ts` | `SavedFolder.description` | 4 |
| `desktop/src/main/artifacts/saved-folder-projects.ts` | local description → project record | 4 |
| `app/.../config/WorkingDirStore.kt`, `SessionService.kt` | Android local-folder description | 6 |
| `desktop/src/renderer/components/project-view/ProjectHero.tsx` | card UI, dot revert, real channels | 7 |
| `desktop/src/renderer/components/project-view/ProjectSwitcher.tsx` | third line on rows | 8 |
| `desktop/src/renderer/dev/workbench/mock-shim.ts`, `mock-only.ts` | drop the fakes | 9 |

---

### Task 1: Registry field, tolerant parse, independent merge

The whole feature's correctness lives here. Everything else is wiring.

**Files:**
- Modify: `desktop/src/shared/artifacts/types.ts`
- Modify: `desktop/src/main/sync-spaces/project-registry.ts:34-41, 53-68, 74-85, 198-224`
- Test: `desktop/tests/sync-spaces-project-registry.test.ts`

**Interfaces:**
- Produces: `PROJECT_DESCRIPTION_MAX: 200`; `ProjectRegistryEntry.description: string | null`; `ProjectRegistryEntry.descriptionUpdatedAt: number`; `setProjectDescription(personalRoot: string, name: string, repoName: string, description: string): Promise<void>`

- [ ] **Step 1: Add the shared constant**

In `desktop/src/shared/artifacts/types.ts`, above `CentralIndexProject`:

```ts
// Max length of a user-written project description. Enforced in BOTH setters
// (synced registry + saved folders) and as maxLength on the input, so a pasted
// document can never bloat a file that syncs to every device.
export const PROJECT_DESCRIPTION_MAX = 200;
```

The `description?: string | null` field on `CentralIndexProject` is already present from the mockup commit — leave it.

- [ ] **Step 2: Write the failing tests**

Create `desktop/tests/sync-spaces-project-registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  mergeProjectEntries, PROJECT_REGISTRY_SCHEMA,
  type ProjectRegistryEntry,
} from '../src/main/sync-spaces/project-registry';

const base: ProjectRegistryEntry = {
  schemaVersion: PROJECT_REGISTRY_SCHEMA,
  name: 'proj', repoName: 'proj-abc123', displayName: 'proj',
  state: 'active', updatedAt: 0,
  description: null, descriptionUpdatedAt: 0,
};

describe('mergeProjectEntries — description', () => {
  // THE regression this whole design exists to prevent: with a shared clock,
  // device B's description write would carry B's stale displayName and revert
  // device A's rename.
  it('keeps a rename and a description written on different devices', () => {
    const a = { ...base, displayName: 'Renamed', updatedAt: 200 };
    const b = { ...base, description: 'my notes', descriptionUpdatedAt: 300 };
    const m = mergeProjectEntries(a, b);
    expect(m.displayName).toBe('Renamed');
    expect(m.description).toBe('my notes');
  });

  it('is commutative', () => {
    const a = { ...base, displayName: 'Renamed', updatedAt: 200 };
    const b = { ...base, description: 'my notes', descriptionUpdatedAt: 300 };
    expect(mergeProjectEntries(a, b)).toEqual(mergeProjectEntries(b, a));
  });

  it('takes the newer description by its own clock', () => {
    const a = { ...base, description: 'old', descriptionUpdatedAt: 100 };
    const b = { ...base, description: 'new', descriptionUpdatedAt: 200 };
    expect(mergeProjectEntries(a, b).description).toBe('new');
  });

  // stopped-dominance is unchanged and must stay unchanged.
  it('still lets stopped dominate regardless of description clocks', () => {
    const a = { ...base, state: 'stopped' as const, updatedAt: 1 };
    const b = { ...base, description: 'x', descriptionUpdatedAt: 999 };
    expect(mergeProjectEntries(a, b).state).toBe('stopped');
  });
});

// THE schema trap, pinned. parseEntry is module-private, so this goes through
// readProjectRegistry against a real temp dir — which is also the honest test,
// since fail-soft-skip happens at the read layer.
describe('readProjectRegistry — records written by an older build', () => {
  it('reads a record that has no description instead of skipping it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-'));
    const projectSync = path.join(dir, 'ProjectSync');
    fs.mkdirSync(projectSync, { recursive: true });
    // Exactly what a pre-description build writes: schema 1, no description keys.
    fs.writeFileSync(path.join(projectSync, 'proj.json'), JSON.stringify({
      schemaVersion: 1, name: 'proj', repoName: 'proj-abc123',
      displayName: 'Proj', state: 'active', updatedAt: 5,
    }));
    const out = readProjectRegistry(dir);
    expect(out).toHaveLength(1);           // NOT skipped
    expect(out[0].displayName).toBe('Proj');
    expect(out[0].description).toBeNull();
    expect(out[0].descriptionUpdatedAt).toBe(0);
  });

  it('caps an over-long description at read time', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-'));
    const projectSync = path.join(dir, 'ProjectSync');
    fs.mkdirSync(projectSync, { recursive: true });
    fs.writeFileSync(path.join(projectSync, 'proj.json'), JSON.stringify({
      schemaVersion: 1, name: 'proj', repoName: 'proj-abc123',
      displayName: 'Proj', state: 'active', updatedAt: 5,
      description: 'x'.repeat(500), descriptionUpdatedAt: 9,
    }));
    expect(readProjectRegistry(dir)[0].description).toHaveLength(200);
  });
});
```

The test file's imports:

```ts
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  mergeProjectEntries, readProjectRegistry, PROJECT_REGISTRY_SCHEMA,
  type ProjectRegistryEntry,
} from '../src/main/sync-spaces/project-registry';
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd worktrees/project-description/desktop && ./node_modules/.bin/vitest run tests/sync-spaces-project-registry.test.ts`
Expected: FAIL — `description` is not a property of `ProjectRegistryEntry` (tsc/vitest type error), or merge drops it.

- [ ] **Step 4: Extend the entry type**

In `project-registry.ts`, replace the `ProjectRegistryEntry` interface (line 34-41):

```ts
export interface ProjectRegistryEntry {
  schemaVersion: number;
  name: string;        // folder name under ~/YouCoded/Projects/ — the immutable sync identity
  repoName: string;    // repoNameForSpace(name) — deterministic, identical on every device
  displayName: string; // synced, user-visible label; defaults to name
  state: ProjectState; // 'stopped' is a tombstone
  updatedAt: number;   // ms epoch — last-writer-wins for displayName
  // User-written description. Its OWN clock, deliberately NOT updatedAt: the
  // merge below picks the newer entry WHOLESALE, so a shared clock would make a
  // description write on one device silently revert a rename made on another.
  description: string | null;
  descriptionUpdatedAt: number; // ms epoch — last-writer-wins for description
}
```

- [ ] **Step 5: Make parseEntry tolerant**

`PROJECT_REGISTRY_SCHEMA` stays `1`. Add to the returned object in `parseEntry` (after the `updatedAt` line, ~line 66):

```ts
    // Tolerant, NOT schema-gated: a record written by an older build simply has
    // no description. Bumping the schema instead would make THIS build reject
    // every record an older build wrote, and vice versa.
    description: typeof raw.description === 'string' && raw.description.trim()
      ? raw.description.trim().slice(0, PROJECT_DESCRIPTION_MAX)
      : null,
    descriptionUpdatedAt: typeof raw.descriptionUpdatedAt === 'number' && Number.isFinite(raw.descriptionUpdatedAt)
      ? raw.descriptionUpdatedAt
      : 0,
```

Add the import at the top of the file:

```ts
import { PROJECT_DESCRIPTION_MAX } from '../../shared/artifacts/types';
```

- [ ] **Step 6: Add the independent join to mergeProjectEntries**

Replace the body of `mergeProjectEntries` (line 74-85):

```ts
export function mergeProjectEntries(a: ProjectRegistryEntry, b: ProjectRegistryEntry): ProjectRegistryEntry {
  const state: ProjectState = a.state === 'stopped' || b.state === 'stopped' ? 'stopped' : 'active';
  const newer = laterOf(a, b, a.updatedAt, b.updatedAt); // displayName LWW, content-tiebroken
  // SEPARATE join for the description — see the type comment. The lattice is now
  // state × (updatedAt, displayName) × (descriptionUpdatedAt, description); each
  // dimension is still a clean join, so a plain reduce over any copy order
  // converges exactly as before.
  const descNewer = laterOf(a, b, a.descriptionUpdatedAt, b.descriptionUpdatedAt);
  return {
    schemaVersion: PROJECT_REGISTRY_SCHEMA,
    name: newer.name,
    repoName: newer.repoName,
    displayName: newer.displayName,
    state,
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
    description: descNewer.description,
    descriptionUpdatedAt: Math.max(a.descriptionUpdatedAt, b.descriptionUpdatedAt),
  };
}
```

- [ ] **Step 7: Seed the new fields in ensureProjectEntry**

In `ensureProjectEntry` (line ~164), add to the `writeAtomic` object:

```ts
    description: null, descriptionUpdatedAt: 0,
```

- [ ] **Step 8: Add setProjectDescription and make the existing setters preserve unknown fields**

Replace `setProjectDisplayName` and `setProjectStopped` bodies so they **spread `cur`** — this is the fix that stops the NEXT field added from being destroyed the way `description` can be during this rollout — and add the new setter after them:

```ts
/** Rename: set displayName + bump updatedAt, PRESERVE state AND description.
 *  Spreading `cur` is load-bearing: rebuilding from explicit fields is exactly
 *  how an older build silently drops a field a newer build wrote. */
export function setProjectDisplayName(
  personalRoot: string, name: string, repoName: string, displayName: string,
): Promise<void> {
  return mutateCanonical(personalRoot, name, (cur) => {
    if (cur && cur.displayName === displayName) return null; // no change — skip
    return {
      ...(cur ?? { description: null, descriptionUpdatedAt: 0 }),
      schemaVersion: PROJECT_REGISTRY_SCHEMA, name, repoName,
      state: cur?.state ?? 'active',
      displayName, updatedAt: Date.now(),
    };
  });
}

/** Stop: set state=stopped + bump updatedAt, PRESERVE displayName + description. */
export function setProjectStopped(
  personalRoot: string, name: string, repoName: string,
): Promise<void> {
  return mutateCanonical(personalRoot, name, (cur) => {
    if (cur && cur.state === 'stopped') return null; // already a tombstone — skip
    return {
      ...(cur ?? { description: null, descriptionUpdatedAt: 0 }),
      schemaVersion: PROJECT_REGISTRY_SCHEMA, name, repoName,
      displayName: cur?.displayName ?? name,
      state: 'stopped', updatedAt: Date.now(),
    };
  });
}

/** Describe: set description + bump ONLY descriptionUpdatedAt, PRESERVE
 *  displayName, its clock, and state. Trims + caps; empty becomes null so
 *  "cleared" and "never set" are the same state everywhere. */
export function setProjectDescription(
  personalRoot: string, name: string, repoName: string, description: string,
): Promise<void> {
  const next = description.trim().slice(0, PROJECT_DESCRIPTION_MAX) || null;
  return mutateCanonical(personalRoot, name, (cur) => {
    if (cur && (cur.description ?? null) === next) return null; // no change — skip
    return {
      ...(cur ?? {}),
      schemaVersion: PROJECT_REGISTRY_SCHEMA, name, repoName,
      displayName: cur?.displayName ?? name,
      state: cur?.state ?? 'active',
      updatedAt: cur?.updatedAt ?? 0,   // NOT touched — that clock is displayName's
      description: next,
      descriptionUpdatedAt: Date.now(),
    };
  });
}
```

- [ ] **Step 9: Run the tests**

Run: `./node_modules/.bin/vitest run tests/sync-spaces-project-registry.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 10: Run the existing registry guards**

Run: `./node_modules/.bin/vitest run tests/sync-spaces-project-discovery.test.ts tests/sync-spaces-service.test.ts`
Expected: PASS. If a fixture builds a `ProjectRegistryEntry` literal it will now fail to typecheck — add `description: null, descriptionUpdatedAt: 0` to that fixture.

- [ ] **Step 11: Commit**

```bash
git add desktop/src/shared/artifacts/types.ts desktop/src/main/sync-spaces/project-registry.ts desktop/tests/sync-spaces-project-registry.test.ts
git commit -m "feat(sync-spaces): project description in the registry, on its own LWW clock

Schema stays at 1 and parseEntry tolerates a missing description: bumping it
would make every older device drop every record, because parseEntry rejects on
strict inequality and reads are fail-soft-skip.

description joins on descriptionUpdatedAt, not updatedAt. mergeProjectEntries
picks the newer entry wholesale, so a shared clock would make a description
write on one device silently revert a rename made on another.

Both existing setters now spread cur instead of rebuilding from explicit
fields, so the next field added survives a write from an older build."
```

---

### Task 2: Service overlay and the synced write path

**Files:**
- Modify: `desktop/src/main/sync-spaces/service.ts:16, 446-469, 484-489`

**Interfaces:**
- Consumes: `setProjectDescription` (Task 1)
- Produces: `syncSpacesSetProjectDescription(name: string, description: string): Promise<{ok: true} | {ok: false, error: string}>`; `space.description` on the status payload

- [ ] **Step 1: Import the setter**

Extend the existing import on line 16:

```ts
import { readProjectRegistry, ensureProjectEntry, setProjectDisplayName, setProjectStopped, setProjectDescription } from './project-registry';
```

- [ ] **Step 2: Add the read-time overlay**

In `syncSpacesStatus()`, add to the returned space object right after the `displayName` line (~464):

```ts
        // Read-time overlay, exactly like displayName above: peers pick up a
        // description written on another device without any local write.
        description: rec?.description ?? null,
```

- [ ] **Step 3: Add the write path**

After `syncSpacesRenameProject` (~line 489):

```ts
/** Describe = change the SYNCED description only. Propagates via the Personal
 *  space; peers pick it up through the read-time overlay above. */
export async function syncSpacesSetProjectDescription(name: string, description: string) {
  if (!roots) return { ok: false as const, error: 'Sync is still starting up — try again in a moment' };
  await setProjectDescription(roots.personalRoot, name, repoNameFor(name), description);
  await pushPersonal();
  return { ok: true as const };
}
```

- [ ] **Step 4: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/sync-spaces/service.ts
git commit -m "feat(sync-spaces): overlay + write path for the synced project description"
```

---

### Task 3: IPC for the synced channel (4 desktop surfaces + Android stub)

**Files:**
- Modify: `desktop/src/main/preload.ts:184, 847-851`
- Modify: `desktop/src/main/ipc-handlers.ts:2970-2974`
- Modify: `desktop/src/renderer/remote-shim.ts:1157-1160`
- Modify: `desktop/src/main/remote-server.ts:1798-1803`
- Modify: `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt:3736-3739`
- Test: `desktop/tests/ipc-channels.test.ts:561-577`

**Interfaces:**
- Consumes: `syncSpacesSetProjectDescription` (Task 2)
- Produces: channel `syncspaces:set-project-description`; `window.claude.syncSpaces.setProjectDescription(name, description)`

- [ ] **Step 1: Add the parity test row (this is the failing test)**

In `desktop/tests/ipc-channels.test.ts`, add to the `channels` array after the `syncspaces:rename-project` row (line 567):

```ts
    ['syncspaces:set-project-description', 'IPC.SYNC_SPACES_SET_PROJECT_DESCRIPTION'],
```

- [ ] **Step 2: Run to verify it fails**

Run: `./node_modules/.bin/vitest run tests/ipc-channels.test.ts`
Expected: FAIL — `syncspaces:set-project-description present in preload, remote-shim, ipc-handlers, remote-server`.

- [ ] **Step 3: preload — constant and member**

After line 184's `SYNC_SPACES_RENAME_PROJECT`:

```ts
  SYNC_SPACES_SET_PROJECT_DESCRIPTION: 'syncspaces:set-project-description',
```

After the `renameProject` member (~line 849):

```ts
    setProjectDescription: (name: string, description: string) =>
      ipcRenderer.invoke(IPC.SYNC_SPACES_SET_PROJECT_DESCRIPTION, { name, description }),
```

- [ ] **Step 4: ipc-handlers**

After the rename handler (~line 2972):

```ts
  ipcMain.handle(IPC.SYNC_SPACES_SET_PROJECT_DESCRIPTION, (_e, p: { name: string; description: string }) =>
    syncSpacesSetProjectDescription(String(p?.name ?? ''), String(p?.description ?? '')));
```

Add `syncSpacesSetProjectDescription` to the existing `sync-spaces/service` import in this file.

- [ ] **Step 5: remote-shim**

After the `renameProject` member (~line 1159):

```ts
      setProjectDescription: (name: string, description: string) =>
        invoke('syncspaces:set-project-description', { name, description }),
```

- [ ] **Step 6: remote-server**

After the `syncspaces:rename-project` case (~line 1802):

```ts
      case 'syncspaces:set-project-description': {
        this.respond(client.ws, type, id, await syncSpacesSetProjectDescription(
          String(payload?.name ?? ''), String(payload?.description ?? '')));
        break;
      }
```

Add `syncSpacesSetProjectDescription` to this file's `sync-spaces/service` import.

- [ ] **Step 7: Android fast-reject stub**

In `SessionService.kt`, add one line immediately after `"syncspaces:rename-project",` (line 3738). It is a bare `when`-arm literal with a trailing comma — do **not** give it a `->` body; only the last arm in the chain carries one.

```kotlin
            "syncspaces:set-project-description",
```

Without this, the description editor on a phone waits 30 seconds for a response that never comes, instead of rejecting immediately with `not-implemented-on-mobile`.

- [ ] **Step 8: Run the parity test**

Run: `./node_modules/.bin/vitest run tests/ipc-channels.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add desktop/src/main/preload.ts desktop/src/main/ipc-handlers.ts desktop/src/renderer/remote-shim.ts desktop/src/main/remote-server.ts desktop/tests/ipc-channels.test.ts app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt
git commit -m "feat(ipc): syncspaces:set-project-description across all four surfaces + Android stub"
```

---

### Task 4: Local-folder description (desktop)

Plain folders don't sync, so this is a separate store with its own quirk: **`remote-server.ts` re-implements the folders file inline rather than importing `saved-folders.ts`.** Both copies must learn the field or the remote browser silently drops descriptions.

**Files:**
- Modify: `desktop/src/main/saved-folders.ts:10-14`
- Modify: `desktop/src/main/artifacts/saved-folder-projects.ts:21-26, 35-67`
- Modify: `desktop/src/main/ipc-handlers.ts:1145-1153` (add a sibling handler)
- Modify: `desktop/src/main/preload.ts:117, 786`
- Modify: `desktop/src/renderer/remote-shim.ts:1200`
- Modify: `desktop/src/main/remote-server.ts:1579-1594` (add a sibling case)
- Test: `desktop/tests/ipc-channels.test.ts`, `desktop/tests/saved-folder-projects.test.ts`

**Interfaces:**
- Produces: channel `folders:set-description`; `window.claude.folders.setDescription(folderPath, description)`; `SavedFolder.description?: string | null`

- [ ] **Step 1: Add the parity row and a projection test (failing)**

In `tests/ipc-channels.test.ts` `channels`:

```ts
    ['folders:set-description', 'IPC.FOLDERS_SET_DESCRIPTION'],
```

In `tests/saved-folder-projects.test.ts`, add:

```ts
  it('carries a saved folder description onto the project record', () => {
    const out = buildSavedFolderProjects(
      [{ path: '/home/d/proj', nickname: 'Proj', description: 'my notes' }],
      [],
    );
    expect(out[0].description).toBe('my notes');
  });

  it('prefers the saved folder description over an indexed entry', () => {
    const indexed = {
      id: '/home/d/proj', name: 'proj', path: '/home/d/proj', lastIndexed: '',
      lastSession: null, contentTypes: [], stats: { artifactCount: 0 },
    } as any;
    const out = buildSavedFolderProjects(
      [{ path: '/home/d/proj', nickname: 'Proj', description: 'mine' }],
      [indexed],
    );
    expect(out[0].description).toBe('mine');
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `./node_modules/.bin/vitest run tests/ipc-channels.test.ts tests/saved-folder-projects.test.ts`
Expected: FAIL on both new tests.

- [ ] **Step 3: Extend SavedFolder**

`saved-folders.ts:10-14`:

```ts
export interface SavedFolder {
  path: string;
  nickname: string;
  addedAt: number;
  // Local-only description. A plain folder has nothing to sync it to — the
  // synced equivalent lives in the project registry (project-registry.ts).
  description?: string | null;
}
```

- [ ] **Step 4: Project the description**

`saved-folder-projects.ts` — add to `SavedFolderInput` (line 21-26):

```ts
  description?: string | null;
```

and set it on BOTH branches of `buildSavedFolderProjects` (lines 53 and 57 neighborhood):

```ts
    if (indexed) {
      out.push({
        ...indexed,
        name: f.nickname?.trim() || indexed.name,
        description: f.description?.trim() || null,
      });
    } else {
      out.push({
        id: canon,
        name: f.nickname?.trim() || basename(f.path),
        description: f.description?.trim() || null,
        path: canon,
        lastIndexed: '',
        lastSession: null,
        contentTypes: [],
        stats: { artifactCount: 0 },
      });
    }
```

- [ ] **Step 5: Channel constant in both places**

`desktop/src/shared/types.ts:980` (Folder switcher block) and `preload.ts:117`:

```ts
  FOLDERS_SET_DESCRIPTION: 'folders:set-description',
```

- [ ] **Step 6: ipc-handlers sibling**

After the `FOLDERS_RENAME` handler (~line 1153):

```ts
  ipcMain.handle(IPC.FOLDERS_SET_DESCRIPTION, async (_event, folderPath: string, description: string) => {
    const folders = readFolders();
    const normalized = path.resolve(folderPath);
    const entry = folders.find(f => path.resolve(f.path) === normalized);
    if (!entry) return false;
    // Trim + cap here as well as in the UI: the renderer is a mirror, never the
    // boundary (same rule as the artifact write policy).
    entry.description = description.trim().slice(0, PROJECT_DESCRIPTION_MAX) || null;
    writeFolders(folders);
    return true;
  });
```

Import `PROJECT_DESCRIPTION_MAX` from `../shared/artifacts/types` in this file.

- [ ] **Step 7: preload + shim**

`preload.ts` after line 786:

```ts
    setDescription: (folderPath: string, description: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.FOLDERS_SET_DESCRIPTION, folderPath, description),
```

`remote-shim.ts` after line 1200 — note the shim passes a **payload object** while preload passes positional args:

```ts
      setDescription: (folderPath: string, description: string) =>
        invoke('folders:set-description', { folderPath, description }),
```

- [ ] **Step 8: remote-server sibling case**

After the `folders:rename` case (~line 1594). This duplicates the inline file handling that case already uses — the file does not import `saved-folders.ts`, and unifying that is out of scope here:

```ts
      // Import PROJECT_DESCRIPTION_MAX from '../shared/artifacts/types' at the
      // top of this file — remote-server is main-process, so it can share the
      // constant rather than re-typing 200 and drifting from the other setters.
      case 'folders:set-description': {
        const foldersPrefPath = path.join(os.homedir(), '.claude', 'youcoded-folders.json');
        try {
          let folders: any[] = [];
          try { folders = JSON.parse(await fs.promises.readFile(foldersPrefPath, 'utf8')); } catch {}
          if (!Array.isArray(folders)) folders = [];
          const normalized = path.resolve(payload.folderPath);
          const entry = folders.find((f: any) => path.resolve(f.path) === normalized);
          if (!entry) { this.respond(client.ws, type, id, false); break; }
          entry.description = String(payload.description ?? '').trim().slice(0, PROJECT_DESCRIPTION_MAX) || null;
          await fs.promises.writeFile(foldersPrefPath, JSON.stringify(folders, null, 2));
          this.respond(client.ws, type, id, true);
        } catch {
          this.respond(client.ws, type, id, false);
        }
        break;
      }
```

- [ ] **Step 9: Run tests**

Run: `./node_modules/.bin/vitest run tests/ipc-channels.test.ts tests/saved-folder-projects.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add desktop/src/main/saved-folders.ts desktop/src/main/artifacts/saved-folder-projects.ts desktop/src/shared/types.ts desktop/src/main/preload.ts desktop/src/main/ipc-handlers.ts desktop/src/renderer/remote-shim.ts desktop/src/main/remote-server.ts desktop/tests/
git commit -m "feat(folders): local-folder description, mirroring the nickname path

remote-server.ts re-implements the folders file inline rather than importing
saved-folders.ts, so the field is added in both copies — missing the second one
would silently drop descriptions written from a remote browser."
```

---

### Task 5: Android local-folder description

Android's local folders are a **different store with different field names**: `WorkingDirStore` writes `.claude-mobile/working-dirs.json` holding `{label, path}`, and the bridge maps `label` → `nickname` on the wire (`SessionService.kt:1279`). This is why the Android work here is real rather than a stub.

**Files:**
- Modify: `app/src/main/kotlin/com/youcoded/app/config/WorkingDirStore.kt:9, 37, readFromDisk/writeToDisk`
- Modify: `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt:1279, 1315-1329`

- [ ] **Step 1: Add the field to the model**

`WorkingDirStore.kt:9`:

```kotlin
data class WorkingDir(val label: String, val path: String, val description: String? = null)
```

- [ ] **Step 2: Persist it**

Replace the `mapNotNull` body in `readFromDisk()` (`WorkingDirStore.kt:51-56`). `optString` returns `""` for a missing key, so an existing file without the field loads as `null` rather than an empty description:

```kotlin
            (0 until arr.length()).mapNotNull { i ->
                val obj = arr.optJSONObject(i) ?: return@mapNotNull null
                val label = obj.optString("label", "")
                val path = obj.optString("path", "")
                val description = obj.optString("description", "").ifBlank { null }
                if (label.isNotBlank() && path.isNotBlank()) WorkingDir(label, path, description) else null
            }
```

And in `writeToDisk()` (`WorkingDirStore.kt:66-70`), add the key. `JSONObject.put` with a null String omits the key entirely, which is what we want — a folder with no description writes no field:

```kotlin
        for (wd in dirs) {
            val obj = JSONObject()
            obj.put("label", wd.label)
            obj.put("path", wd.path)
            obj.put("description", wd.description)
            arr.put(obj)
        }
```

- [ ] **Step 3: Add the setter**

After `rename()` (line 37):

```kotlin
    fun setDescription(path: String, description: String?) {
        val current = _dirs.value.toMutableList()
        val idx = current.indexOfFirst { it.path == path }
        if (idx >= 0) {
            // Trim + cap to match the desktop setter (200) — the two stores must
            // not disagree about what a valid description is.
            val next = description?.trim()?.take(200)?.ifEmpty { null }
            current[idx] = current[idx].copy(description = next)
            _dirs.value = current
            writeToDisk(current)
        }
    }
```

- [ ] **Step 4: Serve it on the wire and handle the write**

At `SessionService.kt:1279`, alongside `put("nickname", wd.label)`:

```kotlin
                        .put("description", wd.description)
```

After the `folders:rename` handler (line 1329):

```kotlin
            "folders:set-description" -> {
                val folderPath = msg.payload.optString("folderPath", "")
                val description = msg.payload.optString("description", "")
                var ok = false
                if (folderPath.isNotEmpty()) {
                    val homeDir = bootstrap?.homeDir ?: filesDir
                    val store = com.youcoded.app.config.WorkingDirStore(homeDir)
                    if (store.dirs.value.any { it.path == folderPath }) {
                        store.setDescription(folderPath, description)
                        ok = true
                    }
                }
                msg.id?.let { bridgeServer.respond(ws, msg.type, it, ok) }
            }
```

- [ ] **Step 5: Build and test**

Run: `cd /home/destin/youcoded-dev/youcoded && ./gradlew test`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 6: Commit**

```bash
git add app/src/main/kotlin/com/youcoded/app/config/WorkingDirStore.kt app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt
git commit -m "feat(android): local-folder description in WorkingDirStore

Android's local folders are a different store from desktop's (working-dirs.json
with label/path, not youcoded-folders.json with nickname). folders:rename is a
real handler here, not a stub, so the description needs a real one too."
```

---

### Task 6: Card UI — real channels, dot instead of glyphs, length cap

The mockup already built this UI against fakes. This task swaps in the real channels and applies the post-approval decision to revert change 13.

**Files:**
- Modify: `desktop/src/renderer/components/project-view/ProjectHero.tsx`
- Modify: `desktop/src/renderer/components/project-view/icons.tsx` (remove the four glyphs)
- Test: `desktop/src/renderer/components/project-view/ProjectHero.test.tsx`

- [ ] **Step 1: Revert the status glyphs to a dot**

Decision 2026-08-06: `sync-spaces.md` pins the dot as the one sanctioned status-color use, and switcher rows already use it — two visual languages for one status is the wrong answer.

Remove the `icon` field from the `syncPill` object and its five branches. In the pill trigger and the popover header, replace `<span className={...}>{syncPill.icon}</span>` with the dot markup already used by the switcher:

```tsx
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    sync!.dot.color === 'green' ? 'bg-[#44A05C]'
                    : sync!.dot.color === 'red' ? 'bg-[#DD4444]'
                    : 'bg-fg-faint'
                  }`}
                />
```

Delete `CheckCircleIcon`, `AlertTriangleIcon`, `CircleSlashIcon`, and `MonitorIcon` from `icons.tsx` and drop them from the `ProjectHero.tsx` import. Leaving them unused would trip `knip`.

- [ ] **Step 2: Cap the input**

On the description `TextInput`, add:

```tsx
            maxLength={PROJECT_DESCRIPTION_MAX}
```

Import it: `import { PROJECT_DESCRIPTION_MAX } from '../../../shared/artifacts/types';`

- [ ] **Step 3: Point the commit at the real channels**

`commitDescription` already calls `syncSpaces.setProjectDescription` / `folders.setDescription`. Remove the optional-call `?.` now that both exist, so a missing channel is a loud failure rather than a silent no-op:

```tsx
    if (syncedFolderName) {
      await (window.claude as any).syncSpaces.setProjectDescription(syncedFolderName, d).catch(() => {});
    } else {
      await (window.claude as any).folders.setDescription(project.path, d).catch(() => {});
    }
```

- [ ] **Step 4: Update the guards for the dot**

The three popover tests query `getByLabelText('Sync status: …')`, which is on the trigger button and unaffected by the glyph removal. Run them:

Run: `./node_modules/.bin/vitest run src/renderer/components/project-view/ProjectHero.test.tsx`
Expected: PASS, 22 tests.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer/components/project-view/
git commit -m "feat(project-view): wire the description to real channels; revert status glyphs to the dot

Decision 2026-08-06: sync-spaces.md pins the dot as the one sanctioned
status-color use and the switcher rows already use it."
```

---

### Task 7: Strip the cog's duplicated sync entries

Decision 2026-08-06. The pill's popover now offers every sync action at every width, so the narrow cog's sync rows are a second entry point for the same four actions. Nothing is stranded by removing them.

**Files:**
- Modify: `desktop/src/renderer/components/project-view/ProjectHero.tsx` (`syncAction`, `destructiveAction`, `menuItems`)
- Test: `desktop/src/renderer/components/project-view/ProjectHero.test.tsx`

- [ ] **Step 1: Update the narrow guard first**

The existing test `arms the stop-syncing confirm instead of stopping immediately` (~line 190) opens the cog and clicks "Stop syncing". That row is going away. Change it to assert the cog no longer carries sync actions, since the popover does:

```ts
  it('leaves sync actions to the pill popover, not the cog', () => {
    renderHero({
      canRemove: false,
      sync: { dot: { color: 'green' }, spaceId: 'project:proj', lastSynced: null, errorMessage: null, stopped: false },
    });
    openCog();
    expect(screen.queryByText('Stop syncing')).toBeNull();
    expect(screen.queryByText('Sync now')).toBeNull();
    expect(screen.getByText('Rename')).toBeTruthy();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `./node_modules/.bin/vitest run src/renderer/components/project-view/ProjectHero.test.tsx`
Expected: FAIL — the cog still renders "Stop syncing".

- [ ] **Step 3: Delete the sync entries**

Remove the `syncAction` const entirely. Reduce `destructiveAction` to the remove-only case, and simplify `menuItems`:

```tsx
  // Sync actions are NOT here — they live in the sync pill's popover, which
  // renders at every width (2026-08-06). The cog is management only.
  const destructiveAction: MenuItem | null =
    canRemove
      ? { key: 'remove', label: 'Remove from YouCoded', onClick: onRemove, danger: true }
      : null;

  const menuItems: MenuItem[] = [
    { key: 'rename', label: 'Rename', onClick: () => setRenaming(true) },
    ...(destructiveAction ? [destructiveAction] : []),
  ];
```

- [ ] **Step 4: Run the tests**

Run: `./node_modules/.bin/vitest run src/renderer/components/project-view/ProjectHero.test.tsx`
Expected: PASS. If `OverflowMenu.test.tsx` or the narrow-collapse block asserts a sync row, update it the same way.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer/components/project-view/
git commit -m "refactor(project-view): cog is management-only; sync actions live in the pill popover"
```

---

### Task 8: Switcher rows read the real description

**Files:**
- Modify: `desktop/src/renderer/components/project-view/ProjectSwitcher.tsx`

The mockup already renders the third line and resolves `space.description ?? p.description`. Both sides are now real, so this task is verification rather than new code.

- [ ] **Step 1: Confirm the resolution matches the shipped shapes**

`findSpaceFor(...)?.description` now comes from Task 2's overlay and `p.description` from Task 4's projection. Confirm the `desc` const still reads:

```tsx
            const desc = ((findSpaceFor(p.path, syncStatus ?? null) as any)?.description as string | undefined)
              || p.description || null;
```

- [ ] **Step 2: Typecheck and run the renderer suite**

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run src/renderer/components/project-view/`
Expected: exit 0, all PASS.

- [ ] **Step 3: Commit only if something changed**

```bash
git commit -am "feat(project-view): switcher rows read the real description" || echo "no change needed"
```

---

### Task 9: Retire the mocks and update the docs

**Files:**
- Modify: `desktop/src/renderer/dev/workbench/mock-only.ts`
- Modify: `desktop/src/renderer/dev/workbench/mock-shim.ts`
- Modify: `.claude/rules/sync-spaces.md` (workspace repo)
- Modify: `docs/active/specs/2026-08-05-project-description-design.md` (workspace repo)

- [ ] **Step 1: Empty the MOCK_ONLY registry**

Both channels are real now. Restore `MOCK_ONLY` to its empty state with the explanatory comment:

```ts
export const MOCK_ONLY: ReadonlyArray<{ channel: string; feature: string }> = [
  // Empty today. Add entries as new UI is designed ahead of its backend, e.g.
  // { channel: 'session.setColor', feature: 'per-session color coding' },
];
```

- [ ] **Step 2: Keep the shim honest**

Leave the hand-written `syncSpaces.setProjectDescription` / `folders.setDescription` implementations in `mock-shim.ts` and their `HAND_WRITTEN` entries — they now mirror real channels, which is exactly what the contract test wants. Only the `MOCK_ONLY` rows go.

- [ ] **Step 3: Run the contract test and boot check**

```bash
./node_modules/.bin/vitest run tests/workbench-mock-contract.test.ts
# in another terminal: bash scripts/run-workbench.sh project-description
node /home/destin/youcoded-dev/scripts/workbench-boot-check.mjs 5233
```
Expected: PASS; all 8 routes mount.

- [ ] **Step 4: Update the sync-spaces rule**

In `.claude/rules/sync-spaces.md`, the Project UX bullet currently reads `state` = stopped-dominates monotonic (not LWW); `displayName` LWW`. Extend it:

```
**Project registry at `~/YouCoded/Personal/ProjectSync/<name>.json` — VISIBLE per-file, NEVER under `.youcoded/`.** `state` = `stopped`-dominates monotonic (not LWW); `displayName` LWW by `updatedAt`; `description` LWW by its OWN `descriptionUpdatedAt` — a shared clock reverts a peer's rename. **Schema stays 1: `parseEntry` rejects on strict inequality, so bumping it makes older devices drop every record.** Setters spread `cur` so an older build's write can't destroy a newer field. **fold-on-read** prevents resurrection. Rename/stop/describe ride 4-surface IPC parity (`ipc-channels.test.ts`).
```

Add `desktop/tests/sync-spaces-project-registry.test.ts` to the rule's `verify:` frontmatter block.

- [ ] **Step 5: Flip the spec to shipped and archive**

Set `status: shipped` in the spec frontmatter, resolve the four §8 open questions with the decisions taken (dot not glyphs; 200-char cap; cog stripped; wrap on card / truncate in list), then move both spec and plan to `docs/archive/` and flip the ROADMAP item to `[x]` — per the workspace rule, merging means merging AND archiving AND flipping the roadmap.

- [ ] **Step 6: Full verification**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh project-description
cd youcoded && ./gradlew test
```
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add desktop/src/renderer/dev/workbench/
git commit -m "chore(workbench): retire the description mocks — both channels are real"
```

---

## Verification Checklist

- [ ] `bash scripts/verify.sh project-description` — types, full suite, knip, ast-grep
- [ ] `./gradlew test` in `youcoded/`
- [ ] Workbench boots on all 8 routes
- [ ] Manual (Destin): describe a synced project on one device, confirm it appears on another
- [ ] Manual (Destin): rename on device A while describing on device B — **both** survive
- [ ] Manual (Destin): describe a plain local folder; confirm it does not sync and the card says so

## Known Residual Risk

An older build that renames or stops a project rebuilds the entry from explicit fields and will drop `description` for every device. Task 1 Step 8 fixes the setters so the *next* field added survives this, but it cannot protect `description` during this rollout. Ship in a release where sync clients update together, per spec §9.
