---
status: draft
date: 2026-07-23
spec: docs/active/specs/2026-07-23-project-view-file-merge-design.md
owner: Destin (decisions) / Claude (plan)
---

# Project View File Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse Project View's `Artifacts` and `All files` tabs into one `Files`
tab containing a `Project Files` section (the on-disk folder walk) and an
`External Artifacts` section (sidecar records outside the project folder), and
repurpose `+ Add file` from an external-pin action into a native-picker
Move/Copy import.

**Architecture:** Three independent backend changes land first (the
`visible-artifacts` predicate flip, the new `artifacts:import-file` IPC, the
Android picker filename fix), then the renderer collapses two tabs into one and
grows the external section and the import UI on top of them. The sidecar format
does not change; only the predicate that reads it and the UI that renders it.

**Tech Stack:** TypeScript, React, Electron (main + preload + renderer), Vitest,
Kotlin (Android).

## Global Constraints

- **Work in a git worktree.** Non-trivial work must not happen in the main
  checkout (workspace `CLAUDE.md`). Sub-repo code goes to `youcoded/`, not
  `youcoded-dev/`.
- **Never touch the live built app.** Runtime verification uses
  `bash scripts/run-dev.sh <branch> --label "File Merge"` only.
- **Annotate non-trivial edits with a WHY comment.** Destin is a non-developer
  and relies on them.
- **Error messages:** specific and accurate (surface the real `code`/`path`), or
  general and non-committal. Never a guessed cause. See
  `docs/error-message-standards.md`.
- **`ipc-channels.ts` comments contain no apostrophes or single quotes** — the
  parity test treats any single-quoted string there as a channel name.
- **A new IPC needs three wirings:** `src/main/ipc-handlers.ts`,
  `src/main/preload.ts`, and `src/renderer/remote-shim.ts`.
  `desktop/tests/shim-parity.test.ts` fails otherwise. Plus an Android
  `not-implemented-on-mobile` stub in `SessionService.kt`, matching every sibling
  `artifacts:*` channel.
- **This feature is desktop-only in practice.** Every `artifacts:*` channel on
  Android is a `not-implemented-on-mobile` stub (`SessionService.kt:3585-3601`);
  mobile Project View is v2. The renderer is shared so the UI renders there, but
  it has no data behind it. Do not scope Android work into this beyond the stub
  and the Move gate.
- **Do not remove `showDeletedArtifacts` from `theme-context.tsx`.** It is synced
  cross-device (`theme-context.tsx:526`) and `SessionDrawer` depends on it.
  Only project-view *consumers* are removed.
- **Section header copy is exact:** `Project Files` and `External Artifacts`.
  Segment label is exact: `Files`.
- Test commands run from `youcoded/desktop`: `npx vitest run <path>`.
  Full gate: `npm test && npm run build`.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/main/artifacts/visible-artifacts.ts` | The single tracked-visibility predicate | Modify — flip rule 4 |
| `src/main/artifacts/import-file.ts` | Copy/move a file into a project folder, collision-safe | **Create** |
| `src/main/artifacts/ipc-channels.ts` | Channel constants | Modify — add `IMPORT_FILE`, deprecate `INCLUDE_EXTERNAL` |
| `src/main/ipc-handlers.ts` | IPC handler registration | Modify — register `IMPORT_FILE` |
| `src/main/preload.ts` | contextBridge API | Modify — expose `artifacts.importFile` |
| `src/renderer/remote-shim.ts` | Remote-access mirror of preload | Modify — mirror `importFile` |
| `app/.../MainActivity.kt` | Android file picker | Modify — preserve display name |
| `src/renderer/components/project-view/ProjectView.tsx` | Tab shell, seg-row, counts | Modify — 4 tabs → 3 |
| `src/renderer/components/project-view/tabs/FilesTab.tsx` | The file browser | Modify — drop `mode`, add external section |
| `src/renderer/components/project-view/FileFilterPopover.tsx` | Filter/sort popover | Modify — drop `showDeleted` |
| `src/renderer/components/project-view/ProjectHero.tsx` | Hero stat line | Modify — drop `artifacts` stat |
| `src/renderer/components/project-view/ImportFileDialog.tsx` | Move/Copy + collision confirm | **Create** |

---

## Task 1: Flip rule 4 — externals visible by edit history, not pins

**Files:**
- Modify: `src/main/artifacts/visible-artifacts.ts:28-31` (doc comment), `:60`
- Test: `desktop/tests/artifacts/visible-artifacts.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `trackedArtifacts(artifacts, manualIncludes, manualExcludes, projectRoot)` — signature unchanged. Externals with a non-`read` version are now returned without a pin.

**Why:** `ProjectView.tsx:489` is the only caller of `includeExternal` in the
codebase. Task 6 removes it, so nothing would ever write `manualIncludes` again
and the `External Artifacts` section would be permanently empty under the current
rule 4.

- [ ] **Step 1: Write the failing tests**

Append to `desktop/tests/artifacts/visible-artifacts.test.ts`, inside the
existing `describe('trackedArtifacts', ...)` block:

```typescript
  // Rule 4 flipped (2026-07-23 file-merge spec): externals are visible on their
  // own edit history, mirroring rule 3 for internals. Pins are no longer the
  // gate — nothing writes manualIncludes once "+ Add file" becomes an import.
  it('shows external artifacts with Claude work, without any pin', () => {
    const arts = [
      { kind: 'external', path: 'made.xlsx', absolutePath: 'c:/temp/made.xlsx', versions: [edit], id: 'made' },
      { kind: 'external', path: 'new.md', absolutePath: 'c:/temp/new.md', versions: [{ type: 'create' }], id: 'new' },
    ];
    expect(trackedArtifacts(arts, [], [], ROOT).map((a: any) => a.id)).toEqual(['made', 'new']);
  });

  it('hides external files that were only VIEWED (read-only versions)', () => {
    // Same bar as rule 3 — a pill click must not populate External Artifacts.
    const arts = [
      { kind: 'external', path: 'seen.pdf', absolutePath: 'c:/temp/seen.pdf', versions: [read], id: 'seen' },
      { kind: 'external', path: 'made.pdf', absolutePath: 'c:/temp/made.pdf', versions: [edit], id: 'made' },
    ];
    expect(trackedArtifacts(arts, [], [], ROOT).map((a: any) => a.id)).toEqual(['made']);
  });

  it('still shows a legacy pinned external with only read versions (rule 1 survives)', () => {
    // Upgrade safety: existing users pinned externals with the old "+ Add file".
    // Rule 1 keeps those visible even though they would fail the new rule 4.
    const arts = [
      { kind: 'external', path: 'pinned.pdf', absolutePath: 'c:/temp/pinned.pdf', versions: [read], id: 'pinned' },
    ];
    const includes = [{ path: 'c:/temp/pinned.pdf' }];
    expect(trackedArtifacts(arts, includes, [], ROOT).map((a: any) => a.id)).toEqual(['pinned']);
  });

  it('still hides an excluded external with Claude work (rule 2 survives)', () => {
    const arts = [
      { kind: 'external', path: 'noisy.md', absolutePath: 'c:/temp/noisy.md', versions: [edit], id: 'noisy' },
      { kind: 'external', path: 'keep.md', absolutePath: 'c:/temp/keep.md', versions: [edit], id: 'keep' },
    ];
    const excludes = ['c:/temp/noisy.md'];
    expect(trackedArtifacts(arts, [], excludes, ROOT).map((a: any) => a.id)).toEqual(['keep']);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd youcoded/desktop && npx vitest run tests/artifacts/visible-artifacts.test.ts
```

Expected: the two new "shows external … without any pin" / "hides external …
VIEWED" tests FAIL (both return `[]` — rule 4 hides everything unpinned). The two
"survives" tests PASS already.

Also expected: the pre-existing test `shows external artifacts only when
manually included` FAILS — it asserts the old behavior. That is correct; Step 3
replaces it.

- [ ] **Step 3: Replace the obsolete test**

Delete the existing `it('shows external artifacts only when manually included', …)`
case (around `tests/artifacts/visible-artifacts.test.ts:35`). It asserts exactly
the rule this task inverts and is superseded by the two new cases above.

- [ ] **Step 4: Implement the flip**

In `src/main/artifacts/visible-artifacts.ts`, replace rule 4 in the doc comment:

```typescript
 *   4. External files → visible only with at least one NON-READ version, same
 *      bar as rule 3. Was "hidden unless manually included" until 2026-07-23:
 *      "+ Add file" became a Move/Copy import and stopped writing manualIncludes,
 *      so a pin-gated rule would have left External Artifacts permanently empty.
 *      Rule 1 still wins, which is what keeps legacy pins visible on upgrade.
```

Then change the predicate's rule-4 line (`:60`) from:

```typescript
    if (a.kind !== 'internal') return false;     // rule 4 — externals need a pin
    // rule 3 — internal: Claude's work only (any non-read version)
    return (a.versions ?? []).some((v) => v.type !== 'read');
```

to:

```typescript
    // rules 3 + 4 — internal AND external: Claude's work only (any non-read
    // version). Externals used to require a pin; see the header comment.
    return (a.versions ?? []).some((v) => v.type !== 'read');
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd youcoded/desktop && npx vitest run tests/artifacts/visible-artifacts.test.ts
```

Expected: PASS, all cases.

- [ ] **Step 6: Run the dependent suites**

`trackedArtifacts` feeds the central index and project counts.

```bash
cd youcoded/desktop && npx vitest run tests/artifacts/central-index.test.ts tests/artifacts/artifact-flow.integration.test.ts tests/project-registry.test.ts
```

Expected: PASS. If a count assertion fails because a fixture has an unpinned
external with edit history, the fixture's expectation is now genuinely wrong —
update the expected number and add a comment saying why.

- [ ] **Step 7: Commit**

```bash
git add src/main/artifacts/visible-artifacts.ts tests/artifacts/visible-artifacts.test.ts
git commit -m "feat(artifacts): externals visible by edit history, not manual pins

Rule 4 required a manualIncludes pin, but + Add file was the only writer and it
becomes a Move/Copy import. Externals now clear the same non-read-version bar as
internals so the External Artifacts section is self-populating. Rules 1 and 2
survive: legacy pins stay visible on upgrade, Exclude stays sticky."
```

---

## Task 2: `artifacts:import-file` — collision-safe copy/move into a project

**Files:**
- Create: `src/main/artifacts/import-file.ts`
- Modify: `src/main/artifacts/ipc-channels.ts`, `src/main/ipc-handlers.ts`, `src/main/preload.ts`, `src/renderer/remote-shim.ts`
- Test: `desktop/tests/artifacts/import-file.test.ts` (create)

**Interfaces:**
- Consumes: `authorizeArtifactWrite` from `./write-authorization`, `invalidateDiscoveryCache` from `./project-file-discovery`.
- Produces:
  ```typescript
  export type ImportMode = 'move' | 'copy';
  export type CollisionMode = 'replace' | 'keep-both' | 'skip';
  export type ImportFileResult =
    | { ok: true; skipped: true }
    | { ok: true; skipped: false; relPath: string }
    | { ok: false; error: string; detail?: string };
  export async function importFile(args: {
    projectRoot: string; sourcePath: string; destDir: string;
    mode: ImportMode; onCollision: CollisionMode;
  }): Promise<ImportFileResult>;
  ```
  Task 6 calls this through `window.claude.artifacts.importFile(projectRoot, sourcePath, destDir, { mode, onCollision })`.

- [ ] **Step 1: Write the failing tests**

Create `desktop/tests/artifacts/import-file.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { importFile } from '../../src/main/artifacts/import-file';

let tmp: string, root: string, outside: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'import-file-'));
  root = path.join(tmp, 'proj');
  outside = path.join(tmp, 'outside');
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
});
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

const src = (name: string, body = 'hello') => {
  const p = path.join(outside, name);
  fs.writeFileSync(p, body);
  return p;
};

describe('importFile', () => {
  it('copies a file into the destination folder and leaves the source', async () => {
    const s = src('budget.xlsx');
    const r = await importFile({
      projectRoot: root, sourcePath: s, destDir: path.join(root, 'docs'),
      mode: 'copy', onCollision: 'skip',
    });
    expect(r).toMatchObject({ ok: true, skipped: false });
    expect(fs.readFileSync(path.join(root, 'docs', 'budget.xlsx'), 'utf8')).toBe('hello');
    expect(fs.existsSync(s)).toBe(true);
  });

  it('moves a file — destination written, source removed', async () => {
    const s = src('notes.md');
    const r = await importFile({
      projectRoot: root, sourcePath: s, destDir: root,
      mode: 'move', onCollision: 'skip',
    });
    expect(r).toMatchObject({ ok: true, skipped: false });
    expect(fs.readFileSync(path.join(root, 'notes.md'), 'utf8')).toBe('hello');
    expect(fs.existsSync(s)).toBe(false);
  });

  it('skip leaves an existing destination untouched and reports skipped', async () => {
    fs.writeFileSync(path.join(root, 'notes.md'), 'ORIGINAL');
    const s = src('notes.md', 'NEW');
    const r = await importFile({
      projectRoot: root, sourcePath: s, destDir: root,
      mode: 'copy', onCollision: 'skip',
    });
    expect(r).toEqual({ ok: true, skipped: true });
    expect(fs.readFileSync(path.join(root, 'notes.md'), 'utf8')).toBe('ORIGINAL');
  });

  it('skip does NOT delete the source in move mode', async () => {
    // A skipped move must be a no-op, not a silent delete of the user's file.
    fs.writeFileSync(path.join(root, 'notes.md'), 'ORIGINAL');
    const s = src('notes.md', 'NEW');
    await importFile({
      projectRoot: root, sourcePath: s, destDir: root,
      mode: 'move', onCollision: 'skip',
    });
    expect(fs.existsSync(s)).toBe(true);
  });

  it('replace overwrites the existing destination', async () => {
    fs.writeFileSync(path.join(root, 'notes.md'), 'ORIGINAL');
    const s = src('notes.md', 'NEW');
    const r = await importFile({
      projectRoot: root, sourcePath: s, destDir: root,
      mode: 'copy', onCollision: 'replace',
    });
    expect(r).toMatchObject({ ok: true, relPath: 'notes.md' });
    expect(fs.readFileSync(path.join(root, 'notes.md'), 'utf8')).toBe('NEW');
  });

  it('keep-both suffixes the name and preserves the extension', async () => {
    fs.writeFileSync(path.join(root, 'notes.md'), 'ORIGINAL');
    const s = src('notes.md', 'NEW');
    const r = await importFile({
      projectRoot: root, sourcePath: s, destDir: root,
      mode: 'copy', onCollision: 'keep-both',
    });
    expect(r).toMatchObject({ ok: true, relPath: 'notes (2).md' });
    expect(fs.readFileSync(path.join(root, 'notes.md'), 'utf8')).toBe('ORIGINAL');
    expect(fs.readFileSync(path.join(root, 'notes (2).md'), 'utf8')).toBe('NEW');
  });

  it('keep-both keeps counting past an existing suffixed file', async () => {
    fs.writeFileSync(path.join(root, 'notes.md'), 'A');
    fs.writeFileSync(path.join(root, 'notes (2).md'), 'B');
    const s = src('notes.md', 'C');
    const r = await importFile({
      projectRoot: root, sourcePath: s, destDir: root,
      mode: 'copy', onCollision: 'keep-both',
    });
    expect(r).toMatchObject({ ok: true, relPath: 'notes (3).md' });
  });

  it('rejects a destination outside the project root', async () => {
    const s = src('evil.md');
    const r = await importFile({
      projectRoot: root, sourcePath: s, destDir: path.join(root, '..', 'outside'),
      mode: 'copy', onCollision: 'replace',
    });
    expect(r).toMatchObject({ ok: false });
    expect((r as any).ok).toBe(false);
    expect(fs.existsSync(path.join(outside, 'evil.md'))).toBe(true); // untouched
  });

  it('reports the real error code when the source does not exist', async () => {
    const r = await importFile({
      projectRoot: root, sourcePath: path.join(outside, 'ghost.md'), destDir: root,
      mode: 'copy', onCollision: 'replace',
    });
    expect(r).toMatchObject({ ok: false, error: 'ENOENT' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd youcoded/desktop && npx vitest run tests/artifacts/import-file.test.ts
```

Expected: FAIL — `Failed to resolve import "../../src/main/artifacts/import-file"`.

- [ ] **Step 3: Implement `import-file.ts`**

Create `src/main/artifacts/import-file.ts`:

```typescript
// importFile — bring a file the user picked in the native dialog INTO a project
// folder, as either a copy or a move. Replaces the old "+ Add file" behavior,
// which only wrote a manualIncludes pin and never touched the disk.
//
// Safety properties this module owns:
//   - destDir must resolve inside projectRoot (symlink-resolved) — reuses
//     authorizeArtifactWrite so the traversal + protected-path policy is the
//     SAME one the editor save path already enforces. Do not re-inline it.
//   - Never silently overwrites: the caller picks replace / keep-both / skip.
//   - Move is copy-then-unlink and NEVER unlinks before the copy is verified.
//     A cross-filesystem move (external drive to home) cannot be a rename, and
//     a half-failed rename must not eat the user's only copy.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { authorizeArtifactWrite } from './write-authorization';
import { invalidateDiscoveryCache } from './project-file-discovery';

export type ImportMode = 'move' | 'copy';
export type CollisionMode = 'replace' | 'keep-both' | 'skip';

export type ImportFileResult =
  | { ok: true; skipped: true }
  | { ok: true; skipped: false; relPath: string }
  | { ok: false; error: string; detail?: string };

const exists = async (p: string): Promise<boolean> => {
  try { await fs.promises.access(p); return true; } catch { return false; }
};

// "notes.md" colliding twice becomes "notes (2).md" then "notes (3).md".
// Extension is preserved so the file keeps opening in the right viewer.
async function freeName(destDir: string, base: string): Promise<string> {
  const ext = path.extname(base);
  const stem = path.basename(base, ext);
  for (let n = 2; n < 1000; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!(await exists(path.join(destDir, candidate)))) return candidate;
  }
  return `${stem} (${Date.now()})${ext}`;
}

export async function importFile(args: {
  projectRoot: string;
  sourcePath: string;
  destDir: string;
  mode: ImportMode;
  onCollision: CollisionMode;
}): Promise<ImportFileResult> {
  const { projectRoot, sourcePath, destDir, mode, onCollision } = args;

  // Source must exist before anything else — a missing source is the most
  // common failure and deserves its real code, not a generic message.
  try {
    const st = await fs.promises.stat(sourcePath);
    if (!st.isFile()) return { ok: false, error: 'ENOTFILE', detail: sourcePath };
  } catch (e: any) {
    return { ok: false, error: e.code ?? 'ENOENT', detail: sourcePath };
  }

  let name = path.basename(sourcePath);
  const collided = await exists(path.join(destDir, name));
  if (collided) {
    if (onCollision === 'skip') return { ok: true, skipped: true };
    if (onCollision === 'keep-both') name = await freeName(destDir, name);
    // 'replace' falls through — copyFile overwrites by default.
  }

  const destPath = path.join(destDir, name);

  // Traversal + protected-path policy on the RESOLVED destination. mustStayInRoot
  // is true: an import always lands inside the project by definition.
  const auth = await authorizeArtifactWrite({
    projectRoot, fullPath: destPath, mustStayInRoot: true, confirmed: true,
  });
  if (!auth.ok) return { ok: false, error: auth.error, detail: (auth as any).path };

  try {
    await fs.promises.copyFile(sourcePath, destPath);
  } catch (e: any) {
    return { ok: false, error: e.code ?? 'COPY_FAILED', detail: e.message };
  }

  // Verify BEFORE unlinking. A short write (full disk) must not cost the source.
  try {
    const [s, d] = await Promise.all([
      fs.promises.stat(sourcePath), fs.promises.stat(destPath),
    ]);
    if (s.size !== d.size) {
      return { ok: false, error: 'COPY_INCOMPLETE', detail: `${d.size} of ${s.size} bytes` };
    }
  } catch (e: any) {
    return { ok: false, error: e.code ?? 'VERIFY_FAILED', detail: e.message };
  }

  if (mode === 'move') {
    try {
      await fs.promises.unlink(sourcePath);
    } catch (e: any) {
      // The copy succeeded — the file IS in the project. Report the partial
      // outcome truthfully rather than claiming the move failed outright.
      invalidateDiscoveryCache(projectRoot);
      return { ok: false, error: 'MOVE_SOURCE_NOT_REMOVED', detail: e.message };
    }
  }

  // Drop the cached scan so the file appears without waiting for the TTL.
  invalidateDiscoveryCache(projectRoot);
  return { ok: true, skipped: false, relPath: path.relative(projectRoot, destPath) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd youcoded/desktop && npx vitest run tests/artifacts/import-file.test.ts
```

Expected: PASS, 10 tests.

- [ ] **Step 5: Add the channel constant**

In `src/main/artifacts/ipc-channels.ts`, add inside `ARTIFACT_IPC` — **no
apostrophes in these comments**:

```typescript
  // Copy or move a picked file INTO the project folder (see artifacts/import-file.ts).
  // Powers the + Add file button, which no longer pins externals.
  IMPORT_FILE: 'artifacts:import-file',
```

And mark the old channel deprecated (again, no apostrophes):

```typescript
  // DEPRECATED 2026-07-23 — no caller since + Add file became an import. The
  // handler stays so existing sidecar manualIncludes entries keep round-tripping
  // and rule 1 keeps legacy pins visible. See the file-merge spec.
  INCLUDE_EXTERNAL: 'artifacts:include-external',
```

- [ ] **Step 6: Register the handler**

In `src/main/ipc-handlers.ts`, next to the other artifact handlers, add:

```typescript
  // IMPORT_FILE → copy/move a picked file into the project. All policy lives in
  // artifacts/import-file.ts (traversal, collisions, verify-before-unlink).
  ipcMain.handle(ARTIFACT_IPC.IMPORT_FILE, async (
    _e,
    projectRoot: string,
    sourcePath: string,
    destDir: string,
    opts: { mode: 'move' | 'copy'; onCollision: 'replace' | 'keep-both' | 'skip' },
  ) => importFile({ projectRoot, sourcePath, destDir, mode: opts.mode, onCollision: opts.onCollision }));
```

Add the import at the top of the file, alongside the other
`./artifacts/...` imports:

```typescript
import { importFile } from './artifacts/import-file';
```

- [ ] **Step 7: Bridge it in preload and remote-shim**

In `src/main/preload.ts`, in the `artifacts` object near `includeExternal`
(`:1299`):

```typescript
    importFile: (projectRoot: string, sourcePath: string, destDir: string,
                 opts: { mode: 'move' | 'copy'; onCollision: 'replace' | 'keep-both' | 'skip' }) =>
      ipcRenderer.invoke('artifacts:import-file', projectRoot, sourcePath, destDir, opts),
```

In `src/renderer/remote-shim.ts`, in the matching `artifacts` object near
`includeExternal` (`:1225`), following that file's `invoke(channel, payload)`
convention:

```typescript
      importFile: (projectRoot: string, sourcePath: string, destDir: string,
                   opts: { mode: 'move' | 'copy'; onCollision: 'replace' | 'keep-both' | 'skip' }) =>
        invoke('artifacts:import-file', { projectRoot, sourcePath, destDir, opts }),
```

- [ ] **Step 8: Add the Android stub**

Every `artifacts:*` channel on Android returns `not-implemented-on-mobile` —
mobile Project View is v2. `IMPORT_FILE` follows the same convention rather than
falling through to whatever the `when` block's default does.

In `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`, beside the
sibling artifact cases (around `:3599`):

```kotlin
            "artifacts:import-file" -> {
                msg.id?.let { bridgeServer.respond(ws, msg.type, it,
                    org.json.JSONObject().put("ok", false).put("error", "not-implemented-on-mobile")) }
            }
```

- [ ] **Step 9: Run the parity tests**

```bash
cd youcoded/desktop && npx vitest run tests/ipc-channels.test.ts tests/shim-parity.test.ts
```

Expected: PASS. A failure here means one of the three wirings is missing — fix
that rather than adjusting the test.

- [ ] **Step 10: Commit**

```bash
git add src/main/artifacts/import-file.ts tests/artifacts/import-file.test.ts \
        src/main/artifacts/ipc-channels.ts src/main/ipc-handlers.ts \
        src/main/preload.ts src/renderer/remote-shim.ts \
        ../app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt
git commit -m "feat(artifacts): artifacts:import-file — collision-safe copy/move into a project

Backs the repurposed + Add file button. Reuses authorizeArtifactWrite for the
traversal and protected-path policy, never silently overwrites, and verifies the
copy before unlinking on move so a cross-filesystem failure cannot eat the
source. INCLUDE_EXTERNAL is marked deprecated but kept for sidecar round-trip."
```

---

## Task 3: Android picker preserves the real filename

**Files:**
- Modify: `app/src/main/kotlin/com/youcoded/app/MainActivity.kt:50-72`

**Interfaces:**
- Consumes: nothing.
- Produces: `dialog:open-file` still returns `{ paths: [...] }` of absolute paths under `~/attachments/`; only the basename changes from `<timestamp>.<ext>` to the picked file's display name.

**Why:** the picker names every file `${System.currentTimeMillis()}.${ext}` with
the extension guessed from MIME, so every chat attachment is currently named
`1784838134583.png`.

> **This task is NOT on the critical path and does not unlock anything on Android
> today.** Every `artifacts:*` channel on Android is a
> `not-implemented-on-mobile` stub (`SessionService.kt:3585-3601`) — mobile
> Project View is v2, so there is no working Files tab to import into. This ships
> because better attachment names are worth having now and because a
> timestamp-renamed file would be wrong the moment mobile Project View lands.
> **It can be dropped or deferred without affecting Tasks 1, 2, 4, 5, or 6.**

**Kept as its own commit** so it can be reverted independently if it disturbs the
chat-attachment flow, which shares this picker.

- [ ] **Step 1: Implement the display-name lookup**

In `MainActivity.kt`, replace the `uris.mapNotNull { uri -> ... }` body
(`:55-69`) with:

```kotlin
                uris.mapNotNull { uri ->
                    try {
                        // Prefer the provider's real display name so a file filed
                        // into a project keeps its name. Falls back to the old
                        // timestamp scheme only when the provider gives us nothing.
                        val display = contentResolver.query(
                            uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME),
                            null, null, null,
                        )?.use { c ->
                            if (c.moveToFirst() && !c.isNull(0)) c.getString(0) else null
                        }?.takeIf { it.isNotBlank() }

                        val mime = contentResolver.getType(uri)
                        val ext = when {
                            mime?.startsWith("image/png") == true -> "png"
                            mime?.startsWith("image/jpeg") == true -> "jpg"
                            mime?.startsWith("image/") == true -> mime.substringAfter("/")
                            else -> uri.lastPathSegment?.substringAfterLast('.', "bin") ?: "bin"
                        }
                        // Strip path separators — a provider-supplied name is
                        // untrusted input and must not escape attachDir.
                        val safeName = display?.replace(Regex("[/\\\\]"), "_")
                            ?: "${System.currentTimeMillis()}.$ext"

                        // Collide-proof within attachDir: two picks of budget.xlsx
                        // in one session must not clobber each other.
                        var destFile = File(attachDir, safeName)
                        if (destFile.exists()) {
                            val stem = safeName.substringBeforeLast('.', safeName)
                            val sfx = safeName.substringAfterLast('.', "")
                            val dot = if (sfx.isEmpty()) "" else ".$sfx"
                            destFile = File(attachDir, "$stem-${System.currentTimeMillis()}$dot")
                        }

                        contentResolver.openInputStream(uri)?.use { input ->
                            destFile.outputStream().use { output -> input.copyTo(output) }
                        }
                        destFile.absolutePath
                    } catch (_: Exception) { null }
                }
```

- [ ] **Step 2: Compile**

```bash
cd youcoded && ./scripts/build-web-ui.sh && ./gradlew assembleDebug
```

Expected: `BUILD SUCCESSFUL`.

> **Worktree warning** (workspace `CLAUDE.md`): if you junctioned `node_modules`
> into this worktree, do NOT run `build-web-ui.sh` here — it runs `npm ci`, which
> rimrafs through the junction and empties the main checkout's `node_modules`.
> Run the Gradle build from the main checkout instead.

- [ ] **Step 3: Run the Android unit tests**

```bash
cd youcoded && ./gradlew test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/src/main/kotlin/com/youcoded/app/MainActivity.kt
git commit -m "fix(android): file picker preserves the real filename

Every picked file was renamed to <timestamp>.<ext> with the extension guessed
from MIME. Invisible for chat attachments; wrong once + Add file files a picked
document into a project folder. Queries OpenableColumns.DISPLAY_NAME, sanitizes
separators out of the untrusted provider name, and de-collides within
~/attachments/. Falls back to the old scheme when no display name is available."
```

---

## Task 4: Collapse the two file tabs into one

**Files:**
- Modify: `src/renderer/components/project-view/ProjectView.tsx` (`:39`, `:99`, `:292-316`, `:498-502`, `:644-657`, `:672`, `:679`, `:694`, `:720-745`, `:752-760`)
- Modify: `src/renderer/components/project-view/tabs/FilesTab.tsx` (`:137-172`, `:239`, `:246`, `:445`, `:472`)
- Modify: `src/renderer/components/project-view/FileFilterPopover.tsx` (`:64-82`, `:91-95`)
- Modify: `src/renderer/components/project-view/ProjectHero.tsx` (`HeroStats`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `FilesTab` no longer accepts a `mode` prop. `TabId` becomes `'files' | 'conversations' | 'context'`. `HeroStats` loses its `artifacts` field.

- [ ] **Step 1: Retype the tabs**

`ProjectView.tsx:39`:

```typescript
// 2026-07-23: the Artifacts tab merged into Files. Artifacts was not a subset of
// All files, so the merge moved externals into their own section inside this tab
// rather than deleting them — see the file-merge spec.
type TabId = 'files' | 'conversations' | 'context';
```

Replace the two file entries in `SEGMENTS` (`:499-500`) with one:

```typescript
    { id: 'files', label: 'Files', icon: <FolderIcon />, count: formatFileCount(heroStats.files, heroStats.filesTruncated) },
```

`GridIcon` becomes unused at that call site — remove the import if nothing else
references it.

- [ ] **Step 2: Update every `tab ===` guard**

Replace `(tab === 'artifacts' || tab === 'allfiles')` with `tab === 'files'`
(`:672`). Replace the search placeholder ternary (`:679`) with the constant
`'Search files…'`. In the tab-routing block (`:752-760`), delete the
`tab === 'artifacts'` render and change the remaining one to:

```typescript
            {activeProject && tab === 'files' && (
              <FilesTab project={activeProject} search={artifactSearch} typeFilter={typeFilter} sortBy={fileSort} hideCode={hideCode} refreshKey={refreshKey} onMutated={() => setCountsKey((k) => k + 1)} />
            )}
```

Confirm no `'artifacts'` or `'allfiles'` tab literal survives:

```bash
cd youcoded/desktop && grep -n "'artifacts'\|'allfiles'" src/renderer/components/project-view/ProjectView.tsx
```

Expected: no output.

- [ ] **Step 3: Delete the `(i)` explainer**

Remove the `{active && isFileTab && (<span … InfoIcon …>)}` block
(`ProjectView.tsx:644-657`) and the now-unused `isFileTab` local. With one tab
there is no split to explain. Remove the `InfoIcon` import if unreferenced.

- [ ] **Step 4: Unwire "Show deleted" from project view only**

In `ProjectView.tsx`: drop `showDeletedArtifacts, setShowDeletedArtifacts` from
the `useTheme()` destructure (`:99`); simplify the filter badge (`:693-695`) to
`const activeFilters = typeFilter !== 'all' ? 1 : 0;`; delete the `showDeleted`,
`onShowDeleted`, and `showDeletedAvailable` props passed to `FileFilterPopover`.

In `FilesTab.tsx`: delete the `const { showDeletedArtifacts } = useTheme();` line
(`:169`), the `if (isDeleted && !showDeletedArtifacts) return false;` filter
(`:239`), and `showDeletedArtifacts` from the `useMemo` deps (`:246`). Drop the
`useTheme` import if nothing else in the file uses it.

In `FileFilterPopover.tsx`: delete the `showDeleted`, `onShowDeleted`, and
`showDeletedAvailable` props and their types (`:64-82`), the `showDeletedAvailable
&& showDeleted` term in `filtersActive` (`:91`), the `if (showDeletedAvailable)
onShowDeleted(false);` line in `clear()` (`:95`), and the chip itself.

> **Do not touch `theme-context.tsx` or `SessionDrawer.tsx`.** The flag stays —
> it is synced cross-device and the session drawer still shows deleted files,
> which is where seeing everything Claude did in a session belongs. Task 7 pins
> this with a test.

- [ ] **Step 5: Collapse `FilesTab`'s mode**

Replace the header comment (`FilesTab.tsx:1-11` and `:136-139`) and the prop:

```typescript
// FilesTab — the folder-tree file browser for one project. Renders two sections:
//   Project Files    — every real file in the project folder (LIST_ALL_FILES,
//                      full-browser discovery). The disk is the truth here, so a
//                      file Claude edited in-folder gets NO special treatment.
//   External Artifacts — sidecar records outside the project folder (Task 5).
// Merged from the old Artifacts/All-files tab split on 2026-07-23; the search +
// type filter + sort apply to both sections. Badge counts stay folder TOTALS.
```

Delete `mode` from the props type and the destructure, and replace the two
mode-derived locals (`:164-165`) with constants:

```typescript
  const rootLabel = 'Project Files';
  const noun = 'files';
```

Delete the `mode === 'allfiles' ? … : …` branches at the empty state (`:472`),
keeping only `'No files found in this project folder.'`. Confirm the fetch calls
(`:201`, `:253`) unconditionally use `listAllFiles`.

- [ ] **Step 6: Reword the gated-root copy**

`FilesTab.tsx:445` names a tab that no longer exists. Replace:

```tsx
            It covers your whole {rootLooksLikeDrive(project.path) ? 'drive' : 'home folder'}, so
            browsing shows only a partial list and can be slow. Conversations and
            external artifacts are unaffected.
```

- [ ] **Step 7: Drop the hero's artifacts stat**

In `ProjectHero.tsx`, delete `artifacts: number;` from `HeroStats` and the stat's
render. In `ProjectView.tsx`, delete `getArtifactCount` (`:298-303`), its entry in
the `Promise.all` destructure (`:318`), and `artifacts:` from the `setHeroStats`
object.

Leave `countVisibleArtifacts` in main and `stats.artifactCount` in the central
index alone — they feed `ProjectSwitcher` and the persisted index, and are out of
scope. Add a WHY comment at the deletion site saying so.

- [ ] **Step 8: Typecheck and build**

```bash
cd youcoded/desktop && npx tsc --noEmit && npm run build
```

Expected: no errors. A `mode` or `showDeleted` reference surviving anywhere shows
up here.

- [ ] **Step 9: Run the full suite**

```bash
cd youcoded/desktop && npm test
```

Expected: PASS. Renderer tests referencing the removed tab need updating to the
merged shape — that is a genuine expectation change, not a workaround.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/components/project-view/
git commit -m "feat(project-view): merge Artifacts and All files into one Files tab

Segmented control goes 4 to 3. FilesTab loses its mode prop and always renders
the on-disk walk; in-folder artifacts are no longer differentiated from other
in-folder files. Show deleted leaves project view (deleted records carry no
content, so they were tombstones not a recovery path) but STAYS in the session
drawer, where seeing everything Claude did in a session is the point."
```

---

## Task 5: The `External Artifacts` section

**Files:**
- Modify: `src/renderer/components/project-view/tabs/FilesTab.tsx`
- Test: `desktop/tests/project-view-external-artifacts.test.tsx` (create)

**Interfaces:**
- Consumes: the flipped predicate from Task 1 (externals arrive from
  `artifacts.listProject` without a pin); `FilesTab` with no `mode` prop from
  Task 4.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the failing tests**

Create `desktop/tests/project-view-external-artifacts.test.tsx`. Follow the
existing renderer-test setup in `tests/artifacts/html-viewer-stale-content.test.tsx`
for how `window.claude` is stubbed and providers are wrapped; mirror that file's
harness rather than inventing a new one.

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FilesTab } from '../src/renderer/components/project-view/tabs/FilesTab';

const PROJECT = { id: 'p1', name: 'Proj', path: '/home/d/proj' } as any;

const external = (id: string, abs: string) => ({
  id, path: abs.split('/').pop(), kind: 'external', absolutePath: abs,
  versions: [{ type: 'edit' }], status: 'active', lastModified: new Date().toISOString(),
  comments: [], tags: [],
});

const stubClaude = (files: any[], tracked: any[], opts: { gated?: boolean } = {}) => {
  (window as any).claude = {
    artifacts: {
      listAllFiles: vi.fn().mockResolvedValue({ ok: true, files, truncated: false, gated: !!opts.gated }),
      listProject: vi.fn().mockResolvedValue({ ok: true, artifacts: tracked }),
      checkExistence: vi.fn().mockResolvedValue({ ok: true, missingIds: [] }),
      watchProject: vi.fn(), unwatchProject: vi.fn(),
    },
  };
};

const props = {
  project: PROJECT, search: '', typeFilter: 'all' as const,
  sortBy: 'name' as const, hideCode: true, refreshKey: 0,
};

describe('FilesTab — External Artifacts section', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the section when an external artifact exists', async () => {
    stubClaude([], [external('e1', '/home/d/other/budget.xlsx')]);
    render(<FilesTab {...props} />);
    await waitFor(() => expect(screen.getByText('External Artifacts')).toBeTruthy());
    expect(screen.getByText('budget.xlsx')).toBeTruthy();
  });

  it('omits the section entirely when there are no externals', async () => {
    stubClaude([], [
      { id: 'i1', path: 'in.md', kind: 'internal', absolutePath: null,
        versions: [{ type: 'edit' }], status: 'active', lastModified: '', comments: [], tags: [] },
    ]);
    render(<FilesTab {...props} />);
    await waitFor(() => expect(screen.getByText('Project Files')).toBeTruthy());
    expect(screen.queryByText('External Artifacts')).toBeNull();
  });

  it('renders externals even on a gated root, where the disk walk is skipped', async () => {
    // The gate covers Project Files only — the section reads the sidecar and
    // never scans, so a home-dir project still shows what Claude touched outside.
    stubClaude([], [external('e1', '/home/d/other/budget.xlsx')], { gated: true });
    render(<FilesTab {...props} />);
    await waitFor(() => expect(screen.getByText('External Artifacts')).toBeTruthy());
    expect(screen.getByText(/This folder is very large/)).toBeTruthy();
  });

  it('drops internal records — in-folder artifacts are not differentiated', async () => {
    stubClaude(
      [{ id: 'in.md', path: 'in.md', kind: 'internal', absolutePath: null, discovered: true,
         versions: [], status: 'active', lastModified: '', comments: [], tags: [] }],
      [{ id: 'i1', path: 'in.md', kind: 'internal', absolutePath: null,
         versions: [{ type: 'edit' }], status: 'active', lastModified: '', comments: [], tags: [] }],
    );
    render(<FilesTab {...props} />);
    await waitFor(() => expect(screen.getByText('Project Files')).toBeTruthy());
    expect(screen.queryByText('External Artifacts')).toBeNull();
    expect(screen.getAllByText('in.md')).toHaveLength(1); // once, from the walk
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd youcoded/desktop && npx vitest run tests/project-view-external-artifacts.test.tsx
```

Expected: FAIL — `Unable to find an element with the text: External Artifacts`.

- [ ] **Step 3: Fetch and filter externals**

In `FilesTab`, alongside the existing `LIST_ALL_FILES` load, add:

```typescript
  // External artifacts — sidecar records that live OUTSIDE the project folder.
  // The disk walk cannot produce these (it only covers the project root), which
  // is the one thing the old Artifacts tab held that Project Files cannot.
  // Internals are dropped here: in-folder files come from the walk, undifferentiated.
  const [externals, setExternals] = useState<ArtifactRecord[]>([]);
  useEffect(() => {
    let cancelled = false;
    (window.claude as any).artifacts.listProject(project.id).then((r: any) => {
      if (cancelled) return;
      const tracked: ArtifactRecord[] = (r?.ok && r.artifacts) ? r.artifacts : [];
      setExternals(tracked.filter((a) => a.kind !== 'internal'));
    }).catch(() => { if (!cancelled) setExternals([]); });
    return () => { cancelled = true; };
  }, [project.id, refreshKey, countsRefreshKey]);
```

Use whichever local refresh counter the file already bumps after a mutation; if
there is none besides `refreshKey`, drop `countsRefreshKey` from the deps.

- [ ] **Step 4: Render the section**

Below the `Project Files` grid, and **only at the tree root**:

```tsx
      {/* Root-only: externals have no position in the project folder hierarchy,
          so showing them while drilled into a subfolder would imply they live
          there. Omitted entirely when empty — no "none yet" prose. */}
      {!currentDir && visibleExternals.length > 0 && (
        <>
          <h3 className="text-sm font-medium text-fg mt-6 mb-2">External Artifacts</h3>
          <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            {visibleExternals.map((a) => renderCard(a))}
          </div>
        </>
      )}
```

`visibleExternals` applies the same `search` / `typeFilter` / `sortBy` the
`Project Files` grid uses — reuse the existing filter helper rather than
duplicating the predicates. `renderCard` is whatever the existing grid maps over;
extract it to a local function in this step if it is currently inline, so both
grids share one card renderer.

Keep the existing `artifacts:check-existence` orphan wiring pointed at
`externals` only — an external whose file was moved or deleted should render as
an orphan row, not a card that errors on click. In-folder files no longer need it
(the walk only returns files that exist).

- [ ] **Step 5: Scope `Exclude` to externals**

At `FilesTab.tsx:785`, change the render condition from `!artifact.discovered` to
`artifact.kind !== 'internal'`, and replace the comment and title:

```tsx
      {/* Exclude = hide this external artifact from the section. Writes a sticky
          manualExcludes entry so Claude re-editing the file does not resurface it.
          Externals only: an in-folder file cannot be hidden from a plain disk walk
          without lying about what is in the folder. There is no in-app undo now
          that + Add file imports instead of pinning. */}
      {artifact.kind !== 'internal' && (
        <button
          type="button"
          className={TOOL_BTN_NEUTRAL}
          onClick={handleExclude}
          title="Hide this external artifact from this project. This cannot be undone in-app."
        >
          Exclude
        </button>
      )}
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd youcoded/desktop && npx vitest run tests/project-view-external-artifacts.test.tsx
```

Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/project-view/tabs/FilesTab.tsx \
        tests/project-view-external-artifacts.test.tsx
git commit -m "feat(project-view): External Artifacts section in the merged Files tab

Sidecar records outside the project folder, which the disk walk structurally
cannot produce. Root-only (externals have no place in the folder hierarchy),
omitted when empty, and still rendered on gated roots where Project Files is
skipped. Exclude is now scoped to external rows."
```

---

## Task 6: `+ Add file` becomes Move / Copy

**Files:**
- Create: `src/renderer/components/project-view/ImportFileDialog.tsx`
- Modify: `src/renderer/components/project-view/ProjectView.tsx:484-491`
- Test: `desktop/tests/import-file-dialog.test.tsx` (create)

**Interfaces:**
- Consumes: `window.claude.artifacts.importFile(projectRoot, sourcePath, destDir, { mode, onCollision })` from Task 2; `getPlatform()` from `src/renderer/platform`.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the failing tests**

Create `desktop/tests/import-file-dialog.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportFileDialog } from '../src/renderer/components/project-view/ImportFileDialog';

vi.mock('../src/renderer/platform', () => ({ getPlatform: vi.fn(() => 'desktop') }));
import { getPlatform } from '../src/renderer/platform';

const base = {
  sources: ['/home/d/Downloads/budget.xlsx'],
  destDir: '/home/d/proj/docs',
  destLabel: 'docs/',
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe('ImportFileDialog', () => {
  it('names the destination folder so the target is never a guess', () => {
    render(<ImportFileDialog {...base} />);
    expect(screen.getByText(/docs\//)).toBeTruthy();
  });

  it('offers Move and Copy on desktop', () => {
    render(<ImportFileDialog {...base} />);
    expect(screen.getByRole('button', { name: /^Move$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Copy$/ })).toBeTruthy();
  });

  it('hides Move on Android, where the picker already copied the file', () => {
    // Android's picker copies the selection into ~/attachments/ before the
    // renderer ever sees a path, so the "source" is a temp copy. Moving it would
    // delete the temp and leave the user's original untouched — a lie.
    // Defensive today: every artifacts:* channel is not-implemented-on-mobile
    // (mobile Project View is v2), so this tab has no data on Android at all.
    // The gate exists so the wrong affordance is not waiting when v2 lands.
    vi.mocked(getPlatform).mockReturnValue('android');
    render(<ImportFileDialog {...base} />);
    expect(screen.queryByRole('button', { name: /^Move$/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Copy$/ })).toBeTruthy();
    vi.mocked(getPlatform).mockReturnValue('desktop');
  });

  it('confirms with the chosen mode', async () => {
    const onConfirm = vi.fn();
    render(<ImportFileDialog {...base} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: /^Copy$/ }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ mode: 'copy' }));
  });

  it('asks about collisions once for a batch, with apply-to-all', async () => {
    const onConfirm = vi.fn();
    render(
      <ImportFileDialog
        {...base}
        sources={['/a/notes.md', '/a/todo.md']}
        collisions={['notes.md', 'todo.md']}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByText(/2 files already exist/i)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Keep both/i }));
    await userEvent.click(screen.getByRole('button', { name: /^Copy$/ }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'copy', onCollision: 'keep-both' }),
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd youcoded/desktop && npx vitest run tests/import-file-dialog.test.tsx
```

Expected: FAIL — cannot resolve `ImportFileDialog`.

- [ ] **Step 3: Build the dialog**

Create `src/renderer/components/project-view/ImportFileDialog.tsx`. Match the
markup and class conventions of the existing project-deletion modal in
`ProjectView.tsx` rather than inventing new styling; use `Button` from the shared
UI primitives, and `useEscClose` for dismissal like the other overlays.

Required behavior:

- Shows the destination as `destLabel` in the prose — *"Copy into `docs/`"*.
- Renders `Move` and `Copy` buttons; `Move` is omitted when
  `getPlatform() === 'android'` (with the WHY comment from the test above).
- When `collisions` is non-empty, shows `N files already exist in this folder`
  and a three-way `Replace / Keep both / Skip` choice that applies to the whole
  batch. Default selection is `Keep both` — the only option that loses nothing.
- `onConfirm({ mode, onCollision })`; `onCancel()` on Esc or Cancel.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd youcoded/desktop && npx vitest run tests/import-file-dialog.test.tsx
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Rewire `+ Add file`**

Replace `addExternal` in `ProjectView.tsx:484-491`:

```typescript
  // + Add file — was a manualIncludes pin (a "fake" tracked entry pointing at a
  // file elsewhere on disk); now it actually brings the file INTO the project.
  // Destination is the folder currently being browsed, not the project root:
  // FilesTab is a breadcrumb tree, so landing everything at the root would be
  // surprising once you have navigated in.
  const importFiles = async () => {
    if (!activeProject) return;
    const paths: string[] = await (window.claude as any).dialog.openFile();
    if (!paths || paths.length === 0) return;
    setPendingImport({ sources: paths });
  };
```

`FilesTab` owns `currentDir`, so it must report the browsed folder up for the
destination. Add an `onCurrentDirChange?: (relDir: string) => void` prop to
`FilesTab`, call it whenever `currentDir` changes, and hold the value in
`ProjectView` state. Render `ImportFileDialog` when `pendingImport` is set,
passing `destDir` = `activeProject.path` joined with the current relative dir and
`destLabel` = the relative dir or the project name at the root.

On confirm, call `importFile` per source, then bump `refreshKey`:

```typescript
  const runImport = async ({ mode, onCollision }: { mode: 'move' | 'copy'; onCollision: 'replace' | 'keep-both' | 'skip' }) => {
    const destDir = /* activeProject.path + currentRelDir */;
    const results = await Promise.all(pendingImport!.sources.map((p) =>
      (window.claude as any).artifacts.importFile(activeProject!.path, p, destDir, { mode, onCollision })));
    const failed = results.filter((r) => r && r.ok === false);
    // Surface the REAL failure (code + path) — never a guessed cause.
    if (failed.length > 0) setImportError(failed.map((f: any) => `${f.error}${f.detail ? `: ${f.detail}` : ''}`).join('\n'));
    setPendingImport(null);
    setRefreshKey((k) => k + 1);
  };
```

Compute the collision list before opening the dialog by checking the current
`Project Files` listing for matching basenames, and pass it as `collisions`.

- [ ] **Step 6: Update the button**

At `ProjectView.tsx:735-745`, drop the `tab === 'artifacts'` guard (that tab is
gone — it now renders whenever `tab === 'files'` with a project) and repoint it:

```tsx
                  <Button
                    variant="secondary"
                    className="shrink-0"
                    onClick={importFiles}
                    title="Copy or move a file into this project folder"
                  >
                    + Add file
                  </Button>
```

- [ ] **Step 7: Typecheck, build, full suite**

```bash
cd youcoded/desktop && npx tsc --noEmit && npm run build && npm test
```

Expected: no type errors, build succeeds, all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/project-view/ImportFileDialog.tsx \
        src/renderer/components/project-view/ProjectView.tsx \
        src/renderer/components/project-view/tabs/FilesTab.tsx \
        tests/import-file-dialog.test.tsx
git commit -m "feat(project-view): + Add file copies or moves a file into the project

Was a manualIncludes pin that never touched disk. Now opens the native picker and
imports into the folder being browsed, with an explicit Replace/Keep both/Skip
choice asked once per batch. Move is hidden on Android, where the picker already
copied the selection into ~/attachments/ and the original is never in reach."
```

---

## Task 7: Regression guard + docs

**Files:**
- Test: `desktop/tests/session-drawer-deleted-toggle.test.tsx` (create)
- Modify: `docs/active/specs/2026-07-23-project-view-file-merge-design.md` (status), `ROADMAP.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Pin the session-drawer behavior**

Create `desktop/tests/session-drawer-deleted-toggle.test.tsx`. It must fail if a
future cleanup sweep removes `showDeletedArtifacts` from `SessionDrawer` or
`theme-context`:

```tsx
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Project View dropped "Show deleted" on 2026-07-23 (deleted records carry no
// content — VersionEvent has no content field — so they were tombstones, not a
// recovery path). The SESSION drawer keeps it: seeing everything Claude did in a
// session, deletions included, is that view's whole purpose. A cleanup pass that
// removes the now-"unused" flag would silently break it and drop a synced pref.
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('showDeletedArtifacts survives the project-view merge', () => {
  it('is still consumed by SessionDrawer', () => {
    expect(read('src/renderer/components/SessionDrawer.tsx')).toContain('showDeletedArtifacts');
  });

  it('is still persisted as a synced appearance preference', () => {
    const ctx = read('src/renderer/state/theme-context.tsx');
    expect(ctx).toContain('showDeletedArtifacts');
    expect(ctx).toContain('persistAppearance({ showDeletedArtifacts');
  });

  it('is gone from project view', () => {
    expect(read('src/renderer/components/project-view/ProjectView.tsx')).not.toContain('showDeletedArtifacts');
    expect(read('src/renderer/components/project-view/tabs/FilesTab.tsx')).not.toContain('showDeletedArtifacts');
  });
});
```

- [ ] **Step 2: Run it**

```bash
cd youcoded/desktop && npx vitest run tests/session-drawer-deleted-toggle.test.tsx
```

Expected: PASS (Task 4 already produced this state).

- [ ] **Step 3: Full gate**

```bash
cd youcoded/desktop && npm test && npm run build
cd youcoded && ./gradlew test
```

Expected: all PASS. Record the actual output — do not claim completion without it.

- [ ] **Step 4: Runtime check — hand off to Destin**

Per workspace `CLAUDE.md`, do NOT build a scripted verification rig for this.
Launch the dev instance and ask Destin to eyeball it:

```bash
bash scripts/run-dev.sh <branch> --label "File Merge"
```

Ask him to confirm: three segments read `Files | Conversations | Context`; the
`Project Files` header; `External Artifacts` appears only when one exists and
only at the tree root; `+ Add file` opens the picker and offers Move/Copy naming
the right folder; the session drawer still has its "Show deleted" chip.

- [ ] **Step 5: Commit and close out the docs**

Flip the spec's `status:` to `shipped`, move both the spec and this plan to
`docs/archive/`, and flip the ROADMAP entry to `[x]` — in the same session the
work merges ("Merge means merge AND push AND archive the docs AND flip the
roadmap item").

```bash
git add desktop/tests/session-drawer-deleted-toggle.test.tsx
git commit -m "test(project-view): pin showDeletedArtifacts to the session drawer

Guards the deliberate asymmetry from the file-merge: project view dropped the
toggle, the session drawer kept it. Without this a cleanup sweep would read the
flag as unused and remove a synced preference."
```

---

## Self-Review Notes

**Spec coverage.** §2 model → Tasks 4, 5. §3 rule-4 flip → Task 1. §4.1 segment
removal → Task 4 Steps 1-3. §4.2 Show-deleted removal → Task 4 Step 4 + Task 7.
§4.3 orphan scoping → Task 5 Step 4. §5.1 sections → Task 5. §5.2 counts → Task 4
Step 7. §5.3 Exclude → Task 5 Step 5. §5.4 empty/gated copy → Task 4 Steps 5-6.
§6 Move/Copy → Tasks 2, 6. §7 Android → Task 2 Step 8 (stub), Task 3 (picker
name, off the critical path), Task 6 Step 3 (Move gate). §8 testing → Tasks 1, 2,
5, 6, 7.

**Correction applied 2026-07-23 after drafting:** the Android decision was
originally framed as "Android gets Copy" versus "desktop-only". That framing was
wrong — `SessionService.kt:3585-3601` stubs every `artifacts:*` channel, so
mobile Project View has no data today and Copy-on-Android is unreachable
regardless. The picker-filename fix survives on its own merits (attachment names
today, a prerequisite for mobile v2) but is explicitly off the critical path.

**Known soft spots, called out rather than hidden:**
- Task 5 Step 4 and Task 6 Steps 3/5 describe behavior plus constraints rather
  than giving complete final markup, because both depend on `FilesTab`'s existing
  card renderer and `ProjectView`'s existing modal markup, which the implementer
  must match. The tests are complete and define the contract.
- Task 6 Step 5 requires lifting `currentDir` out of `FilesTab`. That is the one
  piece of new cross-component plumbing in this plan; if it proves invasive,
  falling back to the project root as the destination is an acceptable
  simplification — but say so in the PR rather than shipping it silently.
