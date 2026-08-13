---
status: draft
---

# Artifact Relative-Path Misclassification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the artifact tracker from filing in-project files as `external` artifacts with a relative `absolutePath`, which makes the artifact viewer report existing files as "This file is no longer on disk."

**Architecture:** One producer fix and two consumer guards. The producer is the pure shared helper `resolveTrackedPath`, which currently falls through to `external` for any path it does not recognise as living under the project root — including relative paths, which the native harness legitimately emits. A new branch classifies a relative recorded path as `internal`, since a relative `file_path` from the harness is relative to the session cwd, which *is* the project root. The two consumer guards (desktop `write-authorization.ts`, Android `SessionService.kt`) refuse a non-absolute `absolutePath` outright instead of handing it to `realpath`/`File()`, which silently resolve it against the **process** cwd.

**Tech Stack:** TypeScript (Electron main + shared), vitest; Kotlin (Android), JUnit.

## Global Constraints

- `src/shared/artifacts/resolve-tracked-path.ts` must stay **pure** — no `fs`, no `path`, no `os` imports. It is imported by the renderer and unit-tested without a filesystem.
- Consumer guards must **preserve the current user-visible outcome** (orphan) for already-broken records. This plan closes the wrong-file/stray-write class; it does not make the 18 existing bad records readable. That is Phase 2.
- Desktop and Android both implement `artifacts:get` and `artifacts:save` independently. Any guard added to one needs the other (`.claude/rules/` IPC parity; `ipc-channels.test.ts`).
- Annotate every non-trivial edit with a WHY comment (workspace rule — Destin is a non-developer and relies on them).
- Do not run any migration or script against `/home/destin/youcoded-dev/.youcoded/artifacts.json` or any other live sidecar. Live-app-safety rule.

## Background: verified findings

Established by direct inspection before this plan was written. An implementer should not need to re-derive these.

| Fact | Evidence |
|---|---|
| The live app's process cwd is `/home/destin`, not the project root | `readlink /proc/<pid>/cwd` on the running Electron processes |
| 18 sidecar records are `kind: "external"` with a **relative** `absolutePath` | `.youcoded/artifacts.json`, dates 2026-07-20 → 2026-08-13 |
| 13 of those 18 name a file that really exists under the project root | existence test against `/home/destin/youcoded-dev/<relpath>` |
| A further 40 records hold Windows `C:/Users/desti/...` paths, which node also treats as relative on Linux | same sidecar |
| The native harness `Write` accepts a relative `file_path` and resolves it internally, but the transcript event carries the **raw** arg | `src/main/harness/tools/write.ts:19-22` (`resolveP(args.file_path, ctx.cwd)`) |
| Save is hard-blocked for orphans, so the stray-write path is **latent, not live** | `ActiveArtifactView.tsx:278` — `if (content === null) return false;` |
| `detectOrphan` was deleted from desktop as dead code; the Kotlin twin has test-only callers | `project-manager.ts:84-88`; `rg detectOrphan app/src` |
| Android's `artifacts:get` has the identical defect and **is** live | `SessionService.kt:3320` — `File(artifact.absolutePath!!)` |

## Out of scope (deliberately)

**Phase 2 — sidecar repair.** Rewriting the 58 bad records is a separate plan with its own review, because:
- **10 of the 18 relative records already have an internal twin** pointing at the same file (`docs/MAP.md`, `ROADMAP.md`, `flappy-bird/styles.css`, `bowling.html`, …). A naive rewrite creates duplicate artifacts with split version histories. The migration's hard problem is *deduplication*, not path rewriting.
- Converting external→internal must change **two** fields in lockstep: `path` is the basename for externals (`play.html`) but root-relative for internals (`flappy-bird/play.html`). Changing one without the other turns a false orphan into a real one.
- 8 of the 40 Windows records point outside any project root (`.claude/plugins/…`, `AppData/Local/Temp/claude-desktop-attachments/paste-*.png`). Those are correctly external and correctly gone; the migration must leave them alone.
- It mutates three weeks of artifact history in a 2.9 MB file and must ship as app code running on sidecar load (with the existing `.bak` pattern, `ArtifactStore.kt:102`) — never as a script run against Destin's files.

**Kotlin `detectOrphan` pruning.** Pre-existing dead code flagged for an Android session in `project-manager.ts:84-88`. Unrelated to this bug; do not fold it in.

**Changing what the harness emits.** Tempting, but wrong: `permissionSubject: (a) => a.file_path` (`harness/tools/write.ts:20`) feeds the permission prompt and the tool card. A short relative path is friendlier to show when approving a write. Changing the emitted value to satisfy the artifact layer would change what the user reads when deciding to approve. Fix the consumer.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `youcoded/desktop/src/shared/artifacts/resolve-tracked-path.ts` | Pure internal/external classification of a transcript-recorded path | Modify — new branch before the external fallthrough |
| `youcoded/desktop/tests/resolve-tracked-path.test.ts` | Unit tests for the above | Modify — 6 new cases |
| `youcoded/desktop/src/main/artifacts/write-authorization.ts` | Resolve-and-authorize for `artifacts:get` / `artifacts:save` | Modify — new `isAbsoluteRecorded` guard in both functions |
| `youcoded/desktop/tests/artifacts/write-authorization.test.ts` | Unit tests for the above | Modify — 3 new cases |
| `youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` | Android bridge handlers incl. `artifacts:get` / `artifacts:save` | Modify — same guard at both sites |
| `youcoded/app/src/test/kotlin/com/youcoded/app/artifacts/ArtifactPathGuardTest.kt` | Kotlin test for the guard | Create |

---

### Task 1: Classify a relative recorded path as internal

This is the fix. It stops new bad records on **both** platforms at once, because Android runs the same shared React tracker (`App.tsx:1535`) in its WebView.

**Files:**
- Modify: `youcoded/desktop/src/shared/artifacts/resolve-tracked-path.ts:73-79`
- Test: `youcoded/desktop/tests/resolve-tracked-path.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: no signature change. `resolveTrackedPath(recordedPath: string, projectRoot: string): TrackedPathResolution` keeps its shape; only the classification of relative inputs changes.

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

Expected: the three "relative → internal" cases FAIL (they currently return `{kind: 'external', …}`). The three guard cases (`Windows`, `..`, empty) should already PASS — they encode behavior that must not regress.

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

Expected: PASS. If `artifact-tracker.test.ts` fails, a fixture there encodes the old external-for-relative behavior — update the fixture, and note in the commit that the fixture was asserting the bug.

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

Defense in depth for the ~58 bad records already on disk, which Task 1 does not repair. Today `realpath('ROADMAP.md')` from cwd `/home/destin` happens to ENOENT — but only because no such file exists there. If one did, the viewer would open **the wrong file**. The same construction in the write path resolves the *parent* on ENOENT (`write-authorization.ts:85-87`) and, since `mustStayInRoot` is `false` for externals, would create a stray file outside the project.

**User-visible behavior is unchanged**: the read guard returns the same `orphan` signal these records already produce. A reviewer should not expect a visible fix here.

**Files:**
- Modify: `youcoded/desktop/src/main/artifacts/write-authorization.ts`
- Test: `youcoded/desktop/tests/artifacts/write-authorization.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `authorizeArtifactRead` gains no new return variant (reuses `{ok: false, orphan: true}`). `authorizeArtifactWrite` reuses `{ok: false, error: 'artifact-not-found'}`. No caller changes.

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

Expected: FAIL on all three, deterministically.
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

Then as the first statement of `authorizeArtifactRead`, before the `realpath` try block:

```typescript
  // Corrupt sidecar record — same outcome the caller already renders for these
  // (orphan), but without letting realpath resolve it against the process cwd.
  if (!isAbsoluteRecorded(fullPath)) return { ok: false, orphan: true };
```

And as the first statement of `authorizeArtifactWrite`, before its `realpath` try block:

```typescript
  // Corrupt sidecar record. Critically, the ENOENT fallback below resolves the
  // PARENT directory — for a bare 'ROADMAP.md' that is realpath('.'), so a save
  // would create a stray file in the process cwd, outside the project, with the
  // in-root check skipped (mustStayInRoot is false for externals).
  if (!isAbsoluteRecorded(args.fullPath)) return { ok: false, error: 'artifact-not-found' };
```

Note `authorizeArtifactWrite` destructures its args *after* this line in the current code — reference `args.fullPath` directly, or move the guard below the existing `const { … } = args;` destructure and use `fullPath`.

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
records already produced. Repairing the records themselves is a separate change."
```

---

### Task 3: Android parity guard

`SessionService.kt:3320` builds `File(artifact.absolutePath!!)` exactly as desktop did. On Android a relative path resolves against the app process cwd (`/`), so the identical false orphan occurs. Task 1 stops new bad records on Android too (the tracker is the shared React one), but existing synced sidecars still carry them.

**Files:**
- Modify: `youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` (`artifacts:get` ~3320, `artifacts:save` ~3419)
- Create: `youcoded/app/src/test/kotlin/com/youcoded/app/artifacts/ArtifactPathGuardTest.kt`

**Interfaces:**
- Consumes: nothing from Tasks 1–2 (independent platform).
- Produces: `fun isAbsoluteRecorded(p: String): Boolean` in `com.youcoded.app.artifacts` (file `ProjectManager.kt`), mirroring the desktop helper of the same name. No new import is needed in `SessionService.kt` — line 40 already wildcards that package (`import com.youcoded.app.artifacts.*`).

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

Then in `"artifacts:save"` (~line 3445), replace the identical `fullPath` construction:

```kotlin
                val fullPath = if (artifact.kind == "internal") java.io.File(projectRoot, artifact.path)
                               else java.io.File(artifact.absolutePath!!)
```

with:

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

## Final verification

- [ ] **Desktop:** `bash scripts/verify.sh` from the workspace root (tsc, affected vitest, knip, eslint, ast-grep). Covers `youcoded/desktop` only — it says so on exit.
- [ ] **Android:** `cd youcoded && ./gradlew test` (already run in Task 3).
- [ ] **Regression check on the real data shapes:** confirm the fix classifies every observed bad path correctly. This is a pure-function check and needs no filesystem and no sidecar access:

```bash
cd youcoded/desktop && npx vitest run tests/resolve-tracked-path.test.ts -t 'relative'
```

- [ ] **Hand the visual check to Destin.** Per the workspace rule, do not build a scripted rig for this. Ask him to open a *newly written* artifact in a dev instance (`bash scripts/run-dev.sh <worktree> --label "Artifact Path Fix"`) and confirm it renders instead of showing "This file is no longer on disk." The 18 **existing** broken records will still show the message — that is expected until Phase 2, and worth saying explicitly so it does not read as a failed fix.

## Follow-ups to capture in ROADMAP.md

- **Phase 2: sidecar repair migration** — `bug`, tagged `#artifacts`. Must merge the 10 duplicate pairs rather than rewrite fields; must change `path` and `absolutePath` together; must leave the 8 out-of-root Windows records alone; must ship as app code with a `$schema`-version marker (`SIDECAR_SCHEMA_VERSION`, `artifact-store.ts:114`) so it runs once rather than stat-sweeping 2,811 records on every sidecar load.
- **Kotlin `detectOrphan` pruning** — `chore`, tagged `#android`. Dead code with test-only callers; desktop twin already removed (`project-manager.ts:84-88`).
