---
status: draft
---

# Artifact Relative-Path Misclassification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the artifact tracker filing in-project files as `external` artifacts with a relative `absolutePath`, and repair the 58 records already written that way — which make the artifact viewer report existing files as "This file is no longer on disk."

**Architecture:** One producer fix, two consumer guards, one data repair. The producer is the pure shared helper `resolveTrackedPath`, which falls through to `external` for any path it does not recognise as under the project root — including relative paths, which the native harness legitimately emits. A new branch classifies a relative recorded path as `internal`, since a relative `file_path` from the harness is relative to the session cwd, which *is* the project root. The consumer guards (desktop `write-authorization.ts`, Android `SessionService.kt`) refuse a non-absolute `absolutePath` rather than handing it to `realpath`/`File()`, which silently resolve against the **process** cwd. The repair then re-runs every stored external path through the *fixed* classifier, so it is correct by construction rather than by a second, hand-written set of rules.

**Tech Stack:** TypeScript (Electron main + shared), vitest; Kotlin (Android), JUnit.

## Global Constraints

- `src/shared/artifacts/resolve-tracked-path.ts` must stay **pure** — no `fs`, no `path`, no `os` imports. It is imported by the renderer and unit-tested without a filesystem. The migration helper (Task 4) inherits this constraint for the same reason.
- Desktop and Android both implement `artifacts:get` and `artifacts:save` independently. A guard added to one needs the other (`ipc-channels.test.ts` pins three-surface parity).
- Annotate every non-trivial edit with a WHY comment (workspace rule — Destin is a non-developer and relies on them).
- **Never run the migration, or any script, against a live sidecar** — not `/home/destin/youcoded-dev/.youcoded/artifacts.json`, not `/home/destin/.youcoded/artifacts.json`. It ships as app code that runs on project open. All migration tests use fixtures in `os.tmpdir()`. Live-app-safety rule.
- The migration must never delete an artifact's history. Duplicates are **merged**, never dropped.

## Background: verified findings

Established by direct inspection before this plan was written. An implementer should not re-derive these.

| Fact | Evidence |
|---|---|
| The live app's process cwd is `/home/destin`, not the project root | `readlink /proc/<pid>/cwd` on the running Electron processes |
| 18 sidecar records are `kind: "external"` with a **relative** `absolutePath` | `.youcoded/artifacts.json`, dates 2026-07-20 → 2026-08-13 |
| 13 of those 18 name a file that really exists under the project root | existence test against `/home/destin/youcoded-dev/<relpath>` |
| A further 40 records hold Windows `C:/Users/desti/...` paths, which node also treats as relative on Linux | same sidecar |
| **10 of the 18 already have an internal twin at the same path** — `docs/MAP.md`, `ROADMAP.md`, `flappy-bird/styles.css`, `bowling.html`, … | join of relative-external `absolutePath` against internal `path` |
| 8 of the 40 Windows records point outside any project root (`.claude/plugins/…`, `AppData/Local/Temp/claude-desktop-attachments/paste-*.png`) | inspection of the 40 |
| The native harness `Write` accepts a relative `file_path` and resolves it internally, but the transcript event carries the **raw** arg | `harness/tools/write.ts:19-22` (`resolveP(args.file_path, ctx.cwd)`) |
| Save is hard-blocked for orphans, so the stray-write path is **latent, not live** | `ActiveArtifactView.tsx:278` — `if (content === null) return false;` |
| `detectOrphan` was deleted from desktop as dead code; the Kotlin twin has test-only callers | `project-manager.ts:84-88`; `rg detectOrphan app/src` |
| Android's `artifacts:get` has the identical defect and **is** live | `SessionService.kt:3320` — `File(artifact.absolutePath!!)` |
| `manualIncludes`/`manualExcludes` key on **paths**, not artifact ids | `types.ts:52-54`, `visible-artifacts.ts:46-47` — so merging records dangles no reference |
| Neither platform validates `$schema` on read (desktop only writes it; Android `optInt`s it) | `artifact-store.ts:114,127`; `SidecarSchema.kt:163` — so a version bump is safe in both directions |

## Key design decision: the migration reuses the fixed classifier

The repair does **not** implement its own "is this path in the project" rules. It re-runs each external record's stored `absolutePath` through `resolveTrackedPath` — the same function Task 1 fixes — and reclassifies whatever now comes back `internal`.

This is what makes the repair safe without a filesystem check:

| Stored path (root = `/home/destin/youcoded-dev`) | Which branch fires | Result |
|---|---|---|
| `flappy-bird/play.html` | new step 2.5 (relative) | internal `flappy-bird/play.html` ✓ |
| `C:/Users/desti/youcoded-dev/docs/PITFALLS.md` | step 2 (cross-OS remap finds `youcoded-dev`) | internal `docs/PITFALLS.md` ✓ |
| `C:/Users/desti/AppData/Local/Temp/…/paste.png` | no branch — no root segment, and step 2.5 rejects drive letters | stays external ✓ |
| `/tmp/claude-1000/…/scratchpad/flappy.html` | step 1 fails, absolute, no remap | stays external ✓ |

The 8 out-of-root Windows records are left alone for free, because step 2 only remaps when it finds the project-root basename as a path segment. No existence check, no `fs`, no guessing.

## Out of scope

**Kotlin `detectOrphan` pruning.** Pre-existing dead code flagged for an Android session in `project-manager.ts:84-88`. Unrelated; do not fold in.

**Changing what the harness emits.** Tempting, but wrong: `permissionSubject: (a) => a.file_path` (`harness/tools/write.ts:20`) feeds the permission prompt and the tool card. A short relative path is friendlier to show when approving a write. Changing the emitted value to satisfy the artifact layer would change what the user reads when deciding to approve. Fix the consumer.

**An Android-side migration.** Desktop-only, deliberately. Both platforms read the same synced sidecar, so once desktop migrates a project the repaired records are correct everywhere. If Android opens an unmigrated project first it shows the same false orphans it shows today — degraded, never corrupted. A Kotlin migration twin would double the riskiest code in this plan for a window that closes the first time the project is opened on desktop. Task 5 still bumps the Kotlin schema constant so the two stay in sync.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `youcoded/desktop/src/shared/artifacts/resolve-tracked-path.ts` | Pure internal/external classification of a recorded path | Modify — new branch before the external fallthrough |
| `youcoded/desktop/tests/resolve-tracked-path.test.ts` | Unit tests for the above | Modify — 6 new cases |
| `youcoded/desktop/src/main/artifacts/write-authorization.ts` | Resolve-and-authorize for `artifacts:get` / `artifacts:save` | Modify — `isAbsoluteRecorded` guard in both functions |
| `youcoded/desktop/tests/artifacts/write-authorization.test.ts` | Unit tests for the above | Modify — 3 new cases |
| `youcoded/app/.../runtime/SessionService.kt` | Android bridge handlers incl. `artifacts:get` / `artifacts:save` | Modify — same guard at both sites |
| `youcoded/app/.../artifacts/ProjectManager.kt` | Android artifact path helpers | Modify — add `isAbsoluteRecorded` |
| `youcoded/app/src/test/.../ArtifactPathGuardTest.kt` | Kotlin test for the guard | Create |
| `youcoded/desktop/src/shared/artifacts/migrate-relative-externals.ts` | **Pure** sidecar repair: reclassify + merge duplicates | Create |
| `youcoded/desktop/tests/migrate-relative-externals.test.ts` | Unit tests for the repair | Create |
| `youcoded/desktop/src/main/artifacts/artifact-store.ts` | Sidecar read/write | Modify — `runSidecarMigration` entry point |
| `youcoded/desktop/src/shared/artifacts/types.ts` | Schema constants | Modify — `SIDECAR_SCHEMA_VERSION` 1 → 2 |

---

### Task 1: Classify a relative recorded path as internal

The producer fix. It stops new bad records on **both** platforms at once, because Android runs the same shared React tracker (`App.tsx:1535`) in its WebView. Task 4 then depends on the branch added here.

**Files:**
- Modify: `youcoded/desktop/src/shared/artifacts/resolve-tracked-path.ts:73-79`
- Test: `youcoded/desktop/tests/resolve-tracked-path.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: no signature change. `resolveTrackedPath(recordedPath: string, projectRoot: string): TrackedPathResolution` keeps its shape; only the classification of relative inputs changes. **Task 4 calls this function directly.**

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('resolveTrackedPath', …)` block in `youcoded/desktop/tests/resolve-tracked-path.test.ts`:

```typescript
  // ── Relative recorded paths (native harness) ────────────────────────────
  // The native harness Write/Edit/Read tools accept a relative file_path and
  // resolve it against ctx.cwd internally, but the transcript event carries the
  // RAW arg. Such a path is relative to the session cwd, which IS the project
  // root — so the file is genuinely in-project and must file as internal.
  // Filing it external with a relative absolutePath produced the 2026-08-12
  // "This file is no longer on disk" false positive on files that exist.

  it('relative recorded path → internal, NOT external', () => {
    expect(resolveTrackedPath('play.html', '/home/desti/proj')).toEqual({
      kind: 'internal', path: 'play.html', absolutePath: null,
    });
  });

  it('relative nested path → internal preserving subdirs', () => {
    expect(resolveTrackedPath('flappy-bird/play.html', '/home/desti/proj')).toEqual({
      kind: 'internal', path: 'flappy-bird/play.html', absolutePath: null,
    });
  });

  it('leading ./ is stripped', () => {
    expect(resolveTrackedPath('./ROADMAP.md', '/home/desti/proj')).toEqual({
      kind: 'internal', path: 'ROADMAP.md', absolutePath: null,
    });
  });

  // REGRESSION TRAP: 'C:/Users/...' is NOT absolute by POSIX rules, so on Linux
  // a naive "not absolute → internal" check swallows every cross-device Windows
  // record and yields the garbage internal path join(root, 'C:/Users/...').
  // This case has no project-root segment to remap, so step 2 cannot fire and
  // it falls through to the new branch — which must reject it.
  it('unremappable Windows path on a Linux root stays EXTERNAL', () => {
    expect(resolveTrackedPath('C:\\Users\\desti\\AppData\\Local\\Temp\\paste.png',
      '/home/desti/proj')).toEqual({
      kind: 'external', path: 'paste.png',
      absolutePath: 'C:/Users/desti/AppData/Local/Temp/paste.png',
    });
  });

  // A '..' segment escapes the root once joined, manufacturing a phantom
  // internal artifact that authorizeArtifactRead then rejects. Leave external.
  it('relative path escaping the root with .. stays EXTERNAL', () => {
    expect(resolveTrackedPath('../other/notes.md', '/home/desti/proj')).toEqual({
      kind: 'external', path: 'notes.md', absolutePath: '../other/notes.md',
    });
  });

  it('empty recorded path stays EXTERNAL (unchanged behavior)', () => {
    expect(resolveTrackedPath('', '/home/desti/proj')).toEqual({
      kind: 'external', path: '', absolutePath: '',
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd youcoded/desktop && npx vitest run tests/resolve-tracked-path.test.ts
```

Expected: the three "relative → internal" cases FAIL (they currently return `{kind: 'external', …}`). The three guard cases (Windows, `..`, empty) should already PASS — they encode behavior that must not regress.

- [ ] **Step 3: Add the classification branch**

In `youcoded/desktop/src/shared/artifacts/resolve-tracked-path.ts`, insert **between** the step-2 cross-OS remap block and the step-3 external fallthrough:

```typescript
  // 2.5 Relative recorded path → internal. The native harness tools accept a
  //     relative file_path and resolve it against ctx.cwd themselves
  //     (main/harness/tools/write.ts), but the transcript event we consume
  //     carries the RAW arg. A relative path there is relative to the session
  //     cwd, which IS the project root — the file is genuinely in-project.
  //
  //     WHY internal rather than absolutising into an external: internal
  //     records survive cross-device sync (that is the entire point of step 2).
  //     An external carrying a machine-specific absolute path breaks again the
  //     next time the conversation is resumed on another device.
  //
  //     MUST run AFTER step 2. 'C:/Users/...' is not absolute by POSIX rules,
  //     so on Linux it reaches here; the drive-letter test below catches the
  //     case where step 2 ran but found no project-root segment to remap.
  //     Without it we would produce join(root, 'C:/Users/...') — worse than
  //     leaving the record external.
  const isWindowsAbs = /^[a-zA-Z]:[\\/]/.test(recordedPath);
  const isPosixAbs = fwdPath.startsWith('/');
  if (fwdPath !== '' && !isWindowsAbs && !isPosixAbs) {
    // A '..' segment escapes the root once joined, manufacturing a phantom
    // internal artifact. Leave those external — authorizeArtifactRead's in-root
    // check would reject them anyway, but as an unexplained "not found".
    if (!fwdPath.split('/').includes('..')) {
      return { kind: 'internal', path: fwdPath.replace(/^\.\//, ''), absolutePath: null };
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd youcoded/desktop && npx vitest run tests/resolve-tracked-path.test.ts
```

Expected: PASS, all cases including the 8 pre-existing ones.

- [ ] **Step 5: Run the wider artifact suite for fallout**

```bash
cd youcoded/desktop && npx vitest run tests/artifact-tracker.test.ts tests/artifacts/
```

Expected: PASS. If `artifact-tracker.test.ts` fails, a fixture there encodes the old external-for-relative behavior — update the fixture, and say in the commit that the fixture was asserting the bug.

- [ ] **Step 6: Commit**

```bash
git add src/shared/artifacts/resolve-tracked-path.ts tests/resolve-tracked-path.test.ts
git commit -m "fix(artifacts): file relative transcript paths as internal, not external

The native harness Write/Edit/Read tools accept a relative file_path and
resolve it against ctx.cwd, but the transcript event carries the raw arg.
resolveTrackedPath had no branch for a relative path, so it fell through to
'genuinely external' and stored the relative string in absolutePath -- a field
contractually required to be absolute. Consumers then handed that to realpath,
which resolves against the PROCESS cwd (/home/destin for a GUI-launched
Electron app), so 13 files that exist in the project rendered as
'This file is no longer on disk'.

The new branch runs after the cross-OS remap and guards against both
Windows-drive paths (not absolute by POSIX rules) and '..' escapes."
```

---

### Task 2: Refuse non-absolute external paths at the desktop authorize boundary

Defense in depth for records the migration cannot reach — other projects' sidecars, and any record written by a client that has not shipped Task 1 yet. Today `realpath('ROADMAP.md')` from cwd `/home/destin` happens to ENOENT — but only because no such file exists there. If one did, the viewer would open **the wrong file**. The same construction in the write path resolves the *parent* on ENOENT (`write-authorization.ts:85-87`) and, since `mustStayInRoot` is `false` for externals, would create a stray file outside the project.

**User-visible behavior is unchanged**: the read guard returns the same `orphan` signal these records already produce. A reviewer should not expect a visible fix from this task.

**Files:**
- Modify: `youcoded/desktop/src/main/artifacts/write-authorization.ts`
- Test: `youcoded/desktop/tests/artifacts/write-authorization.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `isAbsoluteRecorded(p: string): boolean`, module-private. No new return variants — `authorizeArtifactRead` reuses `{ok: false, orphan: true}`, `authorizeArtifactWrite` reuses `{ok: false, error: 'artifact-not-found'}`. No caller changes.

- [ ] **Step 1: Write the failing tests**

Append to `youcoded/desktop/tests/artifacts/write-authorization.test.ts`:

```typescript
  // A relative absolutePath is a corrupt sidecar record (pre-2026-08-12
  // resolveTrackedPath wrote them). realpath()/File() resolve it against the
  // PROCESS cwd, not the project root, so it can silently address a file
  // outside the project. Refuse before resolution rather than guessing.

  // NOTE the deliberate choice of 'package.json': it EXISTS relative to the
  // vitest cwd (youcoded/desktop). Before the guard, realpath resolves it and
  // the call returns ok:true pointing at a file outside the notional project —
  // exactly the wrong-file read this guard closes. A non-existent relative path
  // would return orphan both before and after, so the test could never fail
  // first and would prove nothing.
  it('read: refuses a relative path instead of resolving it against process cwd', async () => {
    const res = await authorizeArtifactRead('/some/project', 'package.json', false);
    expect(res).toEqual({ ok: false, orphan: true });
  });

  it('read: refuses a Windows-drive path on POSIX', async () => {
    const res = await authorizeArtifactRead('/some/project', 'C:/Users/desti/notes.md', false);
    expect(res).toEqual({ ok: false, orphan: true });
  });

  it('write: refuses a relative path instead of creating a file under process cwd', async () => {
    const res = await authorizeArtifactWrite({
      projectRoot: '/some/project', fullPath: 'ROADMAP.md', mustStayInRoot: false,
    });
    expect(res).toEqual({ ok: false, error: 'artifact-not-found' });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd youcoded/desktop && npx vitest run tests/artifacts/write-authorization.test.ts
```

Expected: FAIL, deterministically.
- Read/`package.json`: currently returns `{ok: true, realPath: '<cwd>/package.json'}` because the file exists relative to the vitest cwd.
- Read/`C:/Users/...`: currently returns `{ok: false, orphan: true}` already — this one **passes before the change**. Keep it: it pins the drive-letter clause so a future simplification of `isAbsoluteRecorded` to a bare `path.isAbsolute` cannot silently reroute cross-device records.
- Write/`ROADMAP.md`: currently returns `{ok: true, realPath: '<cwd>/ROADMAP.md'}` because the ENOENT fallback resolves `dirname('ROADMAP.md')` = `realpath('.')`.

- [ ] **Step 3: Add the guard**

In `youcoded/desktop/src/main/artifacts/write-authorization.ts`, add above `inRealRoot`:

```typescript
/**
 * An external artifact's `absolutePath` is contractually canonical and absolute
 * (shared/artifacts/types.ts). Records written before the 2026-08-12
 * resolveTrackedPath fix violate that — they hold relative strings like
 * 'flappy-bird/play.html'. fs.realpath resolves a relative path against the
 * PROCESS cwd (/home/destin for a GUI-launched Electron app, never the project
 * root), so such a record can silently address a file outside the project, or
 * — on the write path, whose ENOENT fallback resolves the PARENT — create one.
 * Refuse explicitly rather than letting realpath guess.
 *
 * The drive-letter clause keeps cross-device Windows records ('C:/Users/...',
 * which path.isAbsolute() calls relative on POSIX) on their existing orphan
 * path instead of routing them through a new error.
 */
function isAbsoluteRecorded(p: string): boolean {
  return path.isAbsolute(p) || /^[a-zA-Z]:[\\/]/.test(p);
}
```

As the first statement of `authorizeArtifactRead`, before the `realpath` try block:

```typescript
  // Corrupt sidecar record — same outcome the caller already renders for these
  // (orphan), but without letting realpath resolve it against the process cwd.
  if (!isAbsoluteRecorded(fullPath)) return { ok: false, orphan: true };
```

And in `authorizeArtifactWrite`, immediately after the existing `const { projectRoot, fullPath, … } = args;` destructure:

```typescript
  // Corrupt sidecar record. Critically, the ENOENT fallback below resolves the
  // PARENT directory — for a bare 'ROADMAP.md' that is realpath('.'), so a save
  // would create a stray file in the process cwd, outside the project, with the
  // in-root check skipped (mustStayInRoot is false for externals).
  if (!isAbsoluteRecorded(fullPath)) return { ok: false, error: 'artifact-not-found' };
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd youcoded/desktop && npx vitest run tests/artifacts/write-authorization.test.ts
```

Expected: PASS, including all pre-existing cases (symlink resolution, in-root enforcement, tier refusal, concurrency token).

- [ ] **Step 5: Commit**

```bash
git add src/main/artifacts/write-authorization.ts tests/artifacts/write-authorization.test.ts
git commit -m "fix(artifacts): refuse non-absolute external paths at the authorize boundary

Sidecar records written before the resolveTrackedPath fix hold relative
absolutePath strings. realpath resolves those against the process cwd, so a
read could open a file outside the project and a save could create one -- the
write path's ENOENT fallback resolves the PARENT, which for a bare filename is
realpath('.'), with the in-root check skipped because externals set
mustStayInRoot=false.

User-visible behavior is unchanged: reads return the same orphan signal these
records already produced."
```

---

### Task 3: Android parity guard

`SessionService.kt:3320` builds `File(artifact.absolutePath!!)` exactly as desktop did. On Android a relative path resolves against the app process cwd (`/`), so the identical false orphan occurs.

**Files:**
- Modify: `youcoded/app/src/main/kotlin/com/youcoded/app/artifacts/ProjectManager.kt`
- Modify: `youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` (`artifacts:get` ~3320, `artifacts:save` ~3445)
- Create: `youcoded/app/src/test/kotlin/com/youcoded/app/artifacts/ArtifactPathGuardTest.kt`

**Interfaces:**
- Consumes: nothing from Tasks 1–2 (independent platform).
- Produces: `fun isAbsoluteRecorded(p: String): Boolean` in `com.youcoded.app.artifacts`, mirroring the desktop helper of the same name. No new import is needed in `SessionService.kt` — line 40 already wildcards that package (`import com.youcoded.app.artifacts.*`).

- [ ] **Step 1: Write the failing test**

Create `youcoded/app/src/test/kotlin/com/youcoded/app/artifacts/ArtifactPathGuardTest.kt`:

```kotlin
package com.youcoded.app.artifacts

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Mirrors desktop/tests/artifacts/write-authorization.test.ts. A relative
 * absolutePath in a sidecar record resolves against the app process cwd ("/"
 * on Android), producing a false "no longer on disk" for a file that exists.
 */
class ArtifactPathGuardTest {
    @Test
    fun posixAbsoluteIsAccepted() {
        assertTrue(isAbsoluteRecorded("/data/user/0/com.youcoded.app/files/notes.md"))
    }

    @Test
    fun windowsDrivePathIsAcceptedSoCrossDeviceRecordsKeepTheirExistingPath() {
        assertTrue(isAbsoluteRecorded("C:/Users/desti/notes.md"))
        assertTrue(isAbsoluteRecorded("C:\\Users\\desti\\notes.md"))
    }

    @Test
    fun relativePathIsRejected() {
        assertFalse(isAbsoluteRecorded("flappy-bird/play.html"))
        assertFalse(isAbsoluteRecorded("ROADMAP.md"))
    }

    @Test
    fun emptyPathIsRejected() {
        assertFalse(isAbsoluteRecorded(""))
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd youcoded && ./gradlew test --tests '*ArtifactPathGuardTest*'
```

Expected: FAIL to compile — "unresolved reference: isAbsoluteRecorded".

- [ ] **Step 3: Add the helper**

Append to `youcoded/app/src/main/kotlin/com/youcoded/app/artifacts/ProjectManager.kt`:

```kotlin
/**
 * True when [p] is an absolute path we can safely hand to File().
 *
 * WHY: an external artifact's absolutePath is contractually absolute, but
 * records written before the 2026-08-12 resolveTrackedPath fix hold relative
 * strings ("flappy-bird/play.html"). File("flappy-bird/play.html") resolves
 * against the app PROCESS cwd ("/" on Android), so the file reads as missing
 * even though it sits in the project — the "This file is no longer on disk"
 * false positive.
 *
 * The drive-letter clause keeps cross-device Windows records on their existing
 * orphan path rather than routing them through a new error.
 *
 * Mirrors desktop/src/main/artifacts/write-authorization.ts::isAbsoluteRecorded.
 */
fun isAbsoluteRecorded(p: String): Boolean =
    p.startsWith("/") || Regex("^[a-zA-Z]:[\\\\/]").containsMatchIn(p)
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd youcoded && ./gradlew test --tests '*ArtifactPathGuardTest*'
```

Expected: PASS.

- [ ] **Step 5: Apply the guard at both bridge handlers**

In `SessionService.kt`, in `"artifacts:get"`, replace the `fullPath` construction (~line 3320):

```kotlin
                val fullPath = if (artifact.kind == "internal") java.io.File(projectRoot, artifact.path)
                               else java.io.File(artifact.absolutePath!!)
```

with:

```kotlin
                // A corrupt record (relative absolutePath) would resolve against the
                // app process cwd, not the project — report it as an orphan rather
                // than reading whatever happens to sit at that relative location.
                val extAbs = artifact.absolutePath
                if (artifact.kind != "internal" && (extAbs == null || !isAbsoluteRecorded(extAbs))) {
                    msg.id?.let { bridgeServer.respond(ws, msg.type, it,
                        org.json.JSONObject().put("ok", true).put("orphan", true)
                            .put("artifact", artifact.toJson()).put("content", org.json.JSONObject.NULL)) }
                    return@handleBridgeMessage
                }
                val fullPath = if (artifact.kind == "internal") java.io.File(projectRoot, artifact.path)
                               else java.io.File(extAbs!!)
```

Then in `"artifacts:save"` (~line 3445), replace the identical `fullPath` construction with:

```kotlin
                // Same corrupt-record guard as artifacts:get. Critical on the write
                // path: a relative record would create a stray file under the app
                // process cwd instead of refusing. Matches desktop's
                // authorizeArtifactWrite refusal (error: 'artifact-not-found').
                val extAbs = artifact.absolutePath
                if (artifact.kind != "internal" && (extAbs == null || !isAbsoluteRecorded(extAbs))) {
                    msg.id?.let { bridgeServer.respond(ws, msg.type, it,
                        org.json.JSONObject().put("ok", false).put("error", "artifact-not-found")) }
                    return@handleBridgeMessage
                }
                val fullPath = if (artifact.kind == "internal") java.io.File(projectRoot, artifact.path)
                               else java.io.File(extAbs!!)
```

That `{ok: false, error: "artifact-not-found"}` shape is already used twice in this handler (the empty-arg and missing-artifact branches above it), so it needs no new renderer handling.

- [ ] **Step 6: Verify the orphan response shape matches desktop**

Compare against `ipc-handlers.ts:3606`, which returns `{ok: true, artifact, content: null, orphan: true}`. The renderer is shared, so a shape mismatch renders differently on Android than desktop.

```bash
cd youcoded/desktop && npx vitest run tests/ipc-channels.test.ts
```

Expected: PASS (three-surface channel parity).

- [ ] **Step 7: Build and run the Android suite**

```bash
cd youcoded && ./scripts/build-web-ui.sh && ./gradlew assembleDebug && ./gradlew test
```

Expected: BUILD SUCCESSFUL, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add app/src/main/kotlin/com/youcoded/app/artifacts/ProjectManager.kt \
        app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt \
        app/src/test/kotlin/com/youcoded/app/artifacts/ArtifactPathGuardTest.kt
git commit -m "fix(artifacts): Android parity for the non-absolute external path guard

SessionService's artifacts:get/save built File(absolutePath!!) directly, so a
relative record resolved against the app process cwd ('/') and reported an
existing project file as missing -- the same defect fixed on desktop in
write-authorization.ts."
```

---

### Task 4: Pure sidecar repair — reclassify and merge

The data fix. A pure function so the merge logic — the genuinely tricky part — is unit-testable without a filesystem, and so it can never touch a live sidecar by accident.

**Merge rule.** When a reclassified record lands on a path an internal record already occupies, the **older** record survives (ULIDs sort by creation time, so the lexicographically smaller id is older). It absorbs the other's history: versions concatenated, deduped by version id, sorted by `ts`; `lastModified` = the later of the two; `status` recomputed from the latest version; `tags` unioned; `comments` concatenated. The surviving id is the one most likely already referenced by an open draft or the current selection.

**Files:**
- Create: `youcoded/desktop/src/shared/artifacts/migrate-relative-externals.ts`
- Test: `youcoded/desktop/tests/migrate-relative-externals.test.ts`

**Interfaces:**
- Consumes: `resolveTrackedPath` from Task 1 — the branch added there is what makes this correct.
- Produces:
  ```typescript
  export interface MigrationResult {
    sidecar: ProjectSidecar;   // new object; input is not mutated
    reclassified: number;      // externals that became internal
    merged: number;            // records folded into an existing internal twin
  }
  export function migrateRelativeExternals(
    sidecar: ProjectSidecar,
    projectRoot: string
  ): MigrationResult
  ```
  Task 5 calls this.

- [ ] **Step 1: Write the failing tests**

Create `youcoded/desktop/tests/migrate-relative-externals.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { migrateRelativeExternals } from '../src/shared/artifacts/migrate-relative-externals';
import type { ProjectSidecar, ArtifactRecord } from '../src/shared/artifacts/types';

const ROOT = '/home/desti/youcoded-dev';

function rec(over: Partial<ArtifactRecord>): ArtifactRecord {
  return {
    id: 'art_0000000000000000000000',
    path: 'x.md', kind: 'internal', absolutePath: null,
    lastModified: '2026-08-01T00:00:00.000Z', status: 'active',
    versions: [], comments: [], tags: [],
    ...over,
  };
}

function sidecar(artifacts: ArtifactRecord[]): ProjectSidecar {
  return {
    $schema: 1 as any, projectId: 'p', name: 'proj',
    createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
    artifacts, manualExcludes: [], manualIncludes: [],
  };
}

describe('migrateRelativeExternals', () => {
  it('reclassifies a relative external to internal with the full relative path', () => {
    // NOTE: external records store the BASENAME in `path` and the real path in
    // `absolutePath`. Both fields must change together — nulling absolutePath
    // while leaving path='play.html' would yield join(root,'play.html'), which
    // does not exist, turning a false orphan into a real one.
    const res = migrateRelativeExternals(sidecar([
      rec({ id: 'art_A', path: 'play.html', kind: 'external', absolutePath: 'flappy-bird/play.html' }),
    ]), ROOT);
    expect(res.reclassified).toBe(1);
    expect(res.merged).toBe(0);
    expect(res.sidecar.artifacts[0]).toMatchObject({
      id: 'art_A', path: 'flappy-bird/play.html', kind: 'internal', absolutePath: null,
    });
  });

  it('remaps a cross-device Windows path that contains the project-root segment', () => {
    const res = migrateRelativeExternals(sidecar([
      rec({ id: 'art_A', path: 'PITFALLS.md', kind: 'external',
            absolutePath: 'C:/Users/desti/youcoded-dev/docs/PITFALLS.md' }),
    ]), ROOT);
    expect(res.sidecar.artifacts[0]).toMatchObject({
      path: 'docs/PITFALLS.md', kind: 'internal', absolutePath: null,
    });
  });

  it('LEAVES ALONE a Windows path outside any project root', () => {
    // 8 of the 40 legacy records look like this. They are correctly external
    // and correctly unavailable on Linux; reclassifying them would invent a
    // phantom in-project file.
    const original = rec({ id: 'art_A', path: 'paste.png', kind: 'external',
      absolutePath: 'C:/Users/desti/AppData/Local/Temp/attachments/paste.png' });
    const res = migrateRelativeExternals(sidecar([original]), ROOT);
    expect(res.reclassified).toBe(0);
    expect(res.sidecar.artifacts[0]).toEqual(original);
  });

  it('leaves a genuine POSIX-absolute external alone', () => {
    const original = rec({ id: 'art_A', path: 'flappy.html', kind: 'external',
      absolutePath: '/tmp/scratchpad/flappy.html' });
    const res = migrateRelativeExternals(sidecar([original]), ROOT);
    expect(res.reclassified).toBe(0);
    expect(res.sidecar.artifacts[0]).toEqual(original);
  });

  it('MERGES into an existing internal twin instead of creating a duplicate', () => {
    // 10 of the 18 real records hit this path. A plain field rewrite would
    // leave two internal records at the same path with split histories.
    const res = migrateRelativeExternals(sidecar([
      rec({ id: 'art_OLD', path: 'ROADMAP.md', kind: 'internal', absolutePath: null,
            lastModified: '2026-07-25T00:00:00.000Z',
            versions: [{ id: 'v1', ts: '2026-07-25T00:00:00.000Z', sessionId: 's1', type: 'create', author: 'agent' }],
            tags: ['plan'] }),
      rec({ id: 'art_NEW', path: 'ROADMAP.md', kind: 'external', absolutePath: 'ROADMAP.md',
            lastModified: '2026-08-13T00:00:00.000Z',
            versions: [{ id: 'v2', ts: '2026-08-13T00:00:00.000Z', sessionId: 's2', type: 'edit', author: 'agent' }],
            tags: ['roadmap'] }),
    ]), ROOT);

    expect(res.merged).toBe(1);
    expect(res.sidecar.artifacts).toHaveLength(1);
    const m = res.sidecar.artifacts[0];
    expect(m.id).toBe('art_OLD');                       // older record survives
    expect(m.kind).toBe('internal');
    expect(m.versions.map((v) => v.id)).toEqual(['v1', 'v2']);   // history preserved, ts-sorted
    expect(m.lastModified).toBe('2026-08-13T00:00:00.000Z');     // later of the two
    expect(m.tags.sort()).toEqual(['plan', 'roadmap']);          // unioned
  });

  it('merges two relative externals that resolve to the same path', () => {
    const res = migrateRelativeExternals(sidecar([
      rec({ id: 'art_B', path: 'notes.md', kind: 'external', absolutePath: 'docs/notes.md',
            versions: [{ id: 'v2', ts: '2026-08-02T00:00:00.000Z', sessionId: 's', type: 'edit', author: 'agent' }] }),
      rec({ id: 'art_A', path: 'notes.md', kind: 'external', absolutePath: './docs/notes.md',
            versions: [{ id: 'v1', ts: '2026-08-01T00:00:00.000Z', sessionId: 's', type: 'create', author: 'agent' }] }),
    ]), ROOT);
    expect(res.sidecar.artifacts).toHaveLength(1);
    expect(res.sidecar.artifacts[0].id).toBe('art_A');
    expect(res.sidecar.artifacts[0].versions.map((v) => v.id)).toEqual(['v1', 'v2']);
  });

  it('dedupes version ids so a re-run cannot duplicate history', () => {
    const shared = { id: 'v1', ts: '2026-08-01T00:00:00.000Z', sessionId: 's', type: 'create' as const, author: 'agent' as const };
    const res = migrateRelativeExternals(sidecar([
      rec({ id: 'art_A', path: 'a.md', kind: 'internal', absolutePath: null, versions: [shared] }),
      rec({ id: 'art_B', path: 'a.md', kind: 'external', absolutePath: 'a.md', versions: [shared] }),
    ]), ROOT);
    expect(res.sidecar.artifacts[0].versions).toHaveLength(1);
  });

  it('is idempotent — a second run changes nothing', () => {
    const once = migrateRelativeExternals(sidecar([
      rec({ id: 'art_A', path: 'play.html', kind: 'external', absolutePath: 'flappy-bird/play.html' }),
    ]), ROOT);
    const twice = migrateRelativeExternals(once.sidecar, ROOT);
    expect(twice.reclassified).toBe(0);
    expect(twice.merged).toBe(0);
    expect(twice.sidecar).toEqual(once.sidecar);
  });

  it('does not mutate the input sidecar', () => {
    const input = sidecar([
      rec({ id: 'art_A', path: 'play.html', kind: 'external', absolutePath: 'flappy-bird/play.html' }),
    ]);
    const snapshot = JSON.parse(JSON.stringify(input));
    migrateRelativeExternals(input, ROOT);
    expect(input).toEqual(snapshot);
  });

  it('recomputes status from the latest version after a merge', () => {
    const res = migrateRelativeExternals(sidecar([
      rec({ id: 'art_A', path: 'gone.md', kind: 'internal', absolutePath: null, status: 'active',
            versions: [{ id: 'v1', ts: '2026-08-01T00:00:00.000Z', sessionId: 's', type: 'create', author: 'agent' }] }),
      rec({ id: 'art_B', path: 'gone.md', kind: 'external', absolutePath: 'gone.md', status: 'deleted',
            versions: [{ id: 'v2', ts: '2026-08-05T00:00:00.000Z', sessionId: 's', type: 'delete', author: 'agent' }] }),
    ]), ROOT);
    expect(res.sidecar.artifacts[0].status).toBe('deleted');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd youcoded/desktop && npx vitest run tests/migrate-relative-externals.test.ts
```

Expected: FAIL — "Failed to resolve import … migrate-relative-externals".

- [ ] **Step 3: Write the implementation**

Create `youcoded/desktop/src/shared/artifacts/migrate-relative-externals.ts`:

```typescript
// One-time repair for sidecar records written before the 2026-08-12
// resolveTrackedPath fix, which stored a RELATIVE string in `absolutePath` — a
// field contractually absolute. Consumers hand that to realpath/File(), which
// resolve it against the PROCESS cwd, so files that exist in the project render
// as "This file is no longer on disk".
//
// WHY this re-runs resolveTrackedPath rather than implementing its own rules:
// the classifier already knows every case (relative → internal, cross-OS remap
// via the project-root segment, genuinely-external passthrough). Reusing it
// makes the repair correct BY CONSTRUCTION and keeps the two from drifting.
// It also means no filesystem access is needed — the 8 legacy records pointing
// outside any project root are left alone for free, because the cross-OS remap
// only fires when it finds the project-root basename as a path segment.
//
// Pure (no fs/path/os) so the merge logic is unit-testable and so this can
// never touch a live sidecar by accident.
import type { ProjectSidecar, ArtifactRecord, VersionEvent } from './types';
import { resolveTrackedPath } from './resolve-tracked-path';

export interface MigrationResult {
  sidecar: ProjectSidecar;
  reclassified: number;
  merged: number;
}

/** ULIDs sort lexicographically by creation time, so the smaller id is older. */
function older(a: ArtifactRecord, b: ArtifactRecord): ArtifactRecord {
  return a.id <= b.id ? a : b;
}

function mergeVersions(a: VersionEvent[], b: VersionEvent[]): VersionEvent[] {
  const byId = new Map<string, VersionEvent>();
  for (const v of [...a, ...b]) byId.set(v.id, v);   // dedup — re-runs cannot duplicate history
  return [...byId.values()].sort((x, y) => x.ts.localeCompare(y.ts));
}

/** `status` is a cache derived from the latest version (types.ts). */
function statusFrom(versions: VersionEvent[], fallback: ArtifactRecord['status']) {
  const last = versions[versions.length - 1];
  if (!last) return fallback;
  return last.type === 'delete' ? 'deleted' : 'active';
}

function mergeRecords(keep: ArtifactRecord, drop: ArtifactRecord): ArtifactRecord {
  const versions = mergeVersions(keep.versions, drop.versions);
  return {
    ...keep,
    kind: 'internal',
    absolutePath: null,
    versions,
    status: statusFrom(versions, keep.status),
    lastModified: keep.lastModified >= drop.lastModified ? keep.lastModified : drop.lastModified,
    tags: [...new Set([...keep.tags, ...drop.tags])],
    comments: [...keep.comments, ...drop.comments],
  };
}

export function migrateRelativeExternals(
  sidecar: ProjectSidecar,
  projectRoot: string
): MigrationResult {
  let reclassified = 0;
  let merged = 0;

  // Internal records indexed by path — the collision targets. 10 of the 18 real
  // relative-external records land on one of these, so a plain field rewrite
  // would leave two internal records at the same path with split histories.
  const byPath = new Map<string, ArtifactRecord>();
  const out: ArtifactRecord[] = [];

  for (const a of sidecar.artifacts) {
    if (a.kind === 'internal') {
      byPath.set(a.path, a);
      out.push(a);
    }
  }

  for (const a of sidecar.artifacts) {
    if (a.kind === 'internal') continue;
    if (a.absolutePath === null) { out.push(a); continue; }

    const resolved = resolveTrackedPath(a.absolutePath, projectRoot);
    if (resolved.kind !== 'internal') { out.push(a); continue; }   // genuinely external — untouched

    reclassified++;
    const existing = byPath.get(resolved.path);
    if (existing) {
      // Merge into whichever record is older; it keeps the id most likely to be
      // referenced by an open draft or the current selection.
      const keep = older(existing, a);
      const drop = keep === existing ? a : existing;
      const mergedRec = mergeRecords({ ...keep, path: resolved.path }, drop);
      const idx = out.indexOf(existing);
      out.splice(idx, 1, mergedRec);
      byPath.set(resolved.path, mergedRec);
      merged++;
    } else {
      // BOTH fields must change: `path` holds the basename for externals but the
      // root-relative path for internals. Changing one without the other yields
      // join(root, basename) — a real orphan in place of a false one.
      const converted: ArtifactRecord = {
        ...a, kind: 'internal', path: resolved.path, absolutePath: null,
      };
      out.push(converted);
      byPath.set(resolved.path, converted);
    }
  }

  return { sidecar: { ...sidecar, artifacts: out }, reclassified, merged };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd youcoded/desktop && npx vitest run tests/migrate-relative-externals.test.ts
```

Expected: PASS, all 10 cases.

- [ ] **Step 5: Commit**

```bash
git add src/shared/artifacts/migrate-relative-externals.ts tests/migrate-relative-externals.test.ts
git commit -m "feat(artifacts): pure sidecar repair for relative external records

Re-runs each external record's stored path through the fixed
resolveTrackedPath and reclassifies whatever now resolves internal, so the
repair cannot drift from the classifier. Reclassified records that collide
with an existing internal twin (10 of 18 in the observed data) are MERGED --
versions concatenated and deduped, status recomputed, tags unioned -- rather
than duplicated. Pure, so the merge logic is testable without a filesystem and
this can never touch a live sidecar by accident."
```

---

### Task 5: Run the repair on project open

**Files:**
- Modify: `youcoded/desktop/src/shared/artifacts/types.ts:1`
- Modify: `youcoded/desktop/src/main/artifacts/artifact-store.ts`
- Modify: `youcoded/app/src/main/kotlin/com/youcoded/app/artifacts/SidecarSchema.kt:12`
- Test: `youcoded/desktop/tests/artifacts/artifact-store.test.ts`

**Interfaces:**
- Consumes: `migrateRelativeExternals` (Task 4), `readSidecar` / `writeSidecar` (existing).
- Produces: `runSidecarMigration(projectRoot: string): Promise<{ migrated: boolean; reclassified: number; merged: number }>`, exported from `artifact-store.ts`.

- [ ] **Step 1: Write the failing test**

Append to `youcoded/desktop/tests/artifacts/artifact-store.test.ts` (follow that file's existing tmpdir fixture helpers — do NOT point it at a real project):

```typescript
  it('runSidecarMigration repairs relative externals once and bumps $schema', async () => {
    const root = await makeTempProject();   // existing helper in this file
    await writeSidecar(root, null, {
      $schema: 1 as any, projectId: 'p', name: 'proj',
      createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
      artifacts: [{
        id: 'art_A', path: 'play.html', kind: 'external',
        absolutePath: 'flappy-bird/play.html',
        lastModified: '2026-08-13T00:00:00.000Z', status: 'active',
        versions: [], comments: [], tags: [],
      }],
      manualExcludes: [], manualIncludes: [],
    });

    const first = await runSidecarMigration(root);
    expect(first).toMatchObject({ migrated: true, reclassified: 1, merged: 0 });

    const after = await readSidecar(root) as ProjectSidecar;
    expect(after.$schema).toBe(2);
    expect(after.artifacts[0]).toMatchObject({
      path: 'flappy-bird/play.html', kind: 'internal', absolutePath: null,
    });

    // Second call is a no-op — the $schema guard, not luck.
    const second = await runSidecarMigration(root);
    expect(second.migrated).toBe(false);
  });

  it('runSidecarMigration backs the sidecar up before rewriting it', async () => {
    const root = await makeTempProject();
    await writeSidecar(root, null, { /* same shape as above */ } as any);
    await runSidecarMigration(root);
    const backups = (await fs.readdir(join(root, '.youcoded')))
      .filter((f) => f.startsWith('artifacts.json.bak.'));
    expect(backups).toHaveLength(1);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd youcoded/desktop && npx vitest run tests/artifacts/artifact-store.test.ts
```

Expected: FAIL — "runSidecarMigration is not exported".

- [ ] **Step 3: Bump the schema constant on both platforms**

`youcoded/desktop/src/shared/artifacts/types.ts:1`:

```typescript
// 2 (2026-08-12): relative-external records repaired by
// migrate-relative-externals. Doubles as the migration's run-once marker.
// Safe to bump — neither platform VALIDATES $schema on read (desktop only
// writes it; Android optInt()s it and round-trips whatever it read), so an
// older client never rejects a v2 sidecar.
export const SIDECAR_SCHEMA_VERSION = 2;
```

`youcoded/app/src/main/kotlin/com/youcoded/app/artifacts/SidecarSchema.kt:12`:

```kotlin
// 2 (2026-08-12): see desktop shared/artifacts/types.ts. Android does not run
// the migration (desktop repairs the shared sidecar); this only keeps a
// sidecar CREATED on Android from claiming to be v1.
const val SIDECAR_SCHEMA_VERSION = 2
```

- [ ] **Step 4: Add the migration entry point**

Append to `youcoded/desktop/src/main/artifacts/artifact-store.ts`:

```typescript
/**
 * One-time repair of relative-external records (see
 * shared/artifacts/migrate-relative-externals.ts). Idempotent via the $schema
 * marker, so this is safe to call on every project open — the common path is a
 * single integer comparison on an object that was parsed anyway.
 *
 * WHY here and not inside readSidecar: readSidecar is a hot path (every get,
 * save, and list call). A function that writes from inside a read is both
 * surprising and a lock-contention risk.
 */
export async function runSidecarMigration(
  projectRoot: string
): Promise<{ migrated: boolean; reclassified: number; merged: number }> {
  const current = await readSidecar(projectRoot);
  if (current === null || 'corrupted' in current) {
    return { migrated: false, reclassified: 0, merged: 0 };
  }
  if ((current.$schema as number) >= SIDECAR_SCHEMA_VERSION) {
    return { migrated: false, reclassified: 0, merged: 0 };
  }

  const result = migrateRelativeExternals(current, projectRoot);

  // Back up before the first rewrite. This edits three weeks of artifact
  // history in place; a timestamped copy is the only way back if the merge rule
  // turns out wrong for a record we did not anticipate.
  const sidecarPath = join(projectRoot, SIDECAR_RELATIVE);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  await fs.copyFile(sidecarPath, `${sidecarPath}.bak.${ts}`);

  const next: ProjectSidecar = { ...result.sidecar, $schema: SIDECAR_SCHEMA_VERSION };
  // CAS on the value we read: if another window wrote in between, skip rather
  // than clobber. The next project open retries.
  const { committed } = await writeSidecar(projectRoot, current.updatedAt, next);
  if (!committed) return { migrated: false, reclassified: 0, merged: 0 };

  return { migrated: true, reclassified: result.reclassified, merged: result.merged };
}
```

Add the import at the top of the file:

```typescript
import { migrateRelativeExternals } from '../../shared/artifacts/migrate-relative-externals';
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd youcoded/desktop && npx vitest run tests/artifacts/artifact-store.test.ts
```

Expected: PASS.

- [ ] **Step 6: Call it on project open**

In `youcoded/desktop/src/main/ipc-handlers.ts`, at the top of the `ARTIFACT_IPC.LIST_PROJECT` handler body:

```typescript
    // Repair legacy relative-external records before listing, so Project View
    // never renders a false "no longer on disk" for a file that is right there.
    // No-op after the first run (guarded on $schema).
    await runSidecarMigration(projectRoot);
```

Import `runSidecarMigration` alongside the existing `artifact-store` imports.

- [ ] **Step 7: Full desktop verification**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh
```

Expected: PASS — tsc, affected vitest, knip, eslint, ast-grep. Knip matters here: it catches `runSidecarMigration` being exported but never wired up if Step 6 was missed.

- [ ] **Step 8: Commit**

```bash
git add src/shared/artifacts/types.ts src/main/artifacts/artifact-store.ts \
        src/main/ipc-handlers.ts tests/artifacts/artifact-store.test.ts \
        ../app/src/main/kotlin/com/youcoded/app/artifacts/SidecarSchema.kt
git commit -m "feat(artifacts): run the relative-external repair on project open

Guarded on \$schema so it runs once per project and is a single integer
comparison thereafter. Backs the sidecar up before the first rewrite, and CAS-
writes against the value it read so a concurrent window is never clobbered --
the next project open retries.

Bumped to schema 2 on both platforms. Safe in both directions: neither
validates \$schema on read, so an older client never rejects a v2 sidecar."
```

---

## Final verification

- [ ] **Desktop:** `bash scripts/verify.sh` from the workspace root. Covers `youcoded/desktop` only — it says so on exit.
- [ ] **Android:** `cd youcoded && ./gradlew test`.
- [ ] **Migration dry-run against a COPY of the real data.** This is the one check that exercises the actual 58 records. Copy the sidecar to the scratchpad first — never migrate in place:

```bash
mkdir -p /tmp/claude-*/scratchpad/migration-check/.youcoded
cp /home/destin/youcoded-dev/.youcoded/artifacts.json \
   /tmp/claude-*/scratchpad/migration-check/.youcoded/
```

Then run `migrateRelativeExternals` against the parsed copy in a scratch vitest file with `projectRoot` set to `/home/destin/youcoded-dev`, and assert the counts match what was measured: **18 relative + 32 remappable Windows records reclassified, 10 merged, 8 out-of-root Windows records untouched, 793 → 783 artifacts.** A different number means the merge rule is behaving unexpectedly on real data — stop and investigate before shipping. Delete the scratch file before committing.

- [ ] **Hand the visual check to Destin.** Per the workspace rule, do not build a scripted rig. Ask him to open a dev instance (`bash scripts/run-dev.sh <worktree> --label "Artifact Path Fix"`), open Project View on `youcoded-dev`, and confirm that `flappy-bird/play.html`, `ROADMAP.md`, and `docs/MAP.md` now open instead of showing "This file is no longer on disk". Note for him: the first open triggers the migration and writes a `.youcoded/artifacts.json.bak.<ts>` next to it — expected, not a bug.

## Follow-ups to capture in ROADMAP.md

- **Kotlin `detectOrphan` pruning** — `chore`, tagged `#android`. Dead code with test-only callers; desktop twin already removed (`project-manager.ts:84-88`).
- **Android does not run the migration** — `bug`, tagged `#android`, low priority. A project opened only ever on Android keeps showing the legacy false orphans. Closes the first time that project is opened on desktop.
