---
status: draft
---

# Artifact Relative-Path Misclassification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the artifact tracker filing in-project files as `external` artifacts with a relative `absolutePath`, and repair the 58 records already written that way — which make the artifact viewer and the Session Drawer report existing files as "no longer on disk."

**Architecture:** One producer fix, one guard applied at every path-resolution site, one data repair. The producer is the pure shared helper `resolveTrackedPath`, which falls through to `external` for any path it does not recognise as under the project root — including relative paths, which the native harness legitimately emits. A new branch classifies a relative recorded path as `internal`, because a relative `file_path` from the harness is resolved against the session cwd, which is *literally the same value* the tracker passes as `projectRoot`. The guard (`isAbsoluteRecorded`) refuses a non-absolute `absolutePath` rather than handing it to `realpath`/`fs.access`/`File()`, which silently resolve against the **process** cwd. The repair then re-runs every stored external path through the *fixed* classifier, so it is correct by construction rather than by a second, hand-written set of rules.

**Tech Stack:** TypeScript (Electron main + shared), vitest; Kotlin (Android), JUnit.

## Global Constraints

- `src/shared/artifacts/resolve-tracked-path.ts` must stay **pure** — no `fs`, no `path`, no `os` imports. It is imported by the renderer and unit-tested without a filesystem. The migration helper (Task 4) inherits this constraint for the same reason.
- Desktop and Android both implement `artifacts:get` and `artifacts:save` independently. A guard added to one needs the other (`ipc-channels.test.ts` pins three-surface parity).
- Annotate every non-trivial edit with a WHY comment (workspace rule — Destin is a non-developer and relies on them).
- **Never run the migration, or any script, against a live sidecar** — not `/home/destin/youcoded-dev/.youcoded/artifacts.json`, not `/home/destin/.youcoded/artifacts.json`. It ships as app code. All migration tests use fixtures in `os.tmpdir()`. Live-app-safety rule.
- The migration must never delete an artifact's history. Duplicates are **merged**, never dropped.

## Background: verified findings

Established by direct inspection before this plan was written. An implementer should not re-derive these.

| Fact | Evidence |
|---|---|
| The live app's process cwd is `/home/destin`, not the project root | `readlink /proc/<pid>/cwd` on the running Electron processes |
| **A relative harness path and the tracker's `projectRoot` are the SAME value** — this is an identity, not an inference | `App.tsx:1507` sets `projectRoot = session.cwd`; `harness/tools/write.ts:19` calls `resolveP(args.file_path, ctx.cwd)`, and `resolveP` is `path.resolve(cwd, p)` (`harness/tools/guards.ts:31-33`). No tilde expansion, no other base. Forecloses the "what if the session cwd is a subdirectory" objection |
| 18 sidecar records are `kind: "external"` with a **relative** `absolutePath` | `.youcoded/artifacts.json`, dates 2026-07-20 → 2026-08-13 |
| 13 of those 18 name a file that really exists under the project root | existence test against `/home/destin/youcoded-dev/<relpath>` |
| A further 40 records hold Windows `C:/Users/desti/...` paths, which node also treats as relative on Linux | same sidecar |
| **10 of the 18 already have an internal twin at the same path** — `docs/MAP.md`, `ROADMAP.md`, `flappy-bird/styles.css`, `bowling.html`, … | join of relative-external `absolutePath` against internal `path` |
| 8 of the 40 Windows records point outside any project root (`.claude/plugins/…`, `AppData/Local/Temp/claude-desktop-attachments/paste-*.png`) | inspection of the 40 |
| Simulating this plan's algorithm on the live sidecar: **48 reclassified (18 relative + 30 Windows-remapped), 13 merged** | Python reimplementation of `resolveTrackedPath` + the merge rule, run read-only against a parse of `.youcoded/artifacts.json` |
| The sidecar is written continuously by the running app — 2,811 artifacts at one measurement, 2,839 twenty minutes later | two reads during planning; **this is why the verification asserts invariants rather than counts** |
| **FOUR desktop sites resolve a record's `absolutePath`, not two** | `ipc-handlers.ts:3588` (GET → `authorizeArtifactRead`), `:3727` (SAVE → `authorizeArtifactWrite`), `:4091` (CHECK_EXISTENCE → raw `fs.access`), `projects-index.ts:42` (`countArtifacts` → raw `fs.access`). `write-authorization.ts` is NOT a chokepoint |
| **The Session Drawer is the only surface where a relative external is visible at all** | Project View requires externals to be pinned (`visible-artifacts.ts:62`); the drawer shows every session record. Its "no longer on disk" label comes from CHECK_EXISTENCE, not from `artifacts:get` — `SessionDrawer.tsx:42,145` |
| The viewer's own "This file is no longer on disk." comes from `artifacts:get` returning `orphan` | `ActiveArtifactView.tsx:433` |
| Save is hard-blocked for orphans, so the stray-write path is **latent, not live** | `ActiveArtifactView.tsx:278` — `if (content === null) return false;` |
| `detectOrphan` was deleted from desktop as dead code; the Kotlin twin has test-only callers | `project-manager.ts:84-88`; `ProjectManager.kt:118-130`; `rg detectOrphan app/src` |
| Android's `artifacts:get`/`save` have the identical defect and **are** live; Android's `artifacts:check-existence` is a stub that always returns no missing ids | `SessionService.kt:3319`, `:3446`, `:3619-3622` |
| `manualIncludes`/`manualExcludes` key on **paths**, not artifact ids | `types.ts:52-54`, `visible-artifacts.ts:46-47` — so merging records dangles no reference |
| `appendVersion` only writes `$schema` when CREATING a sidecar; otherwise it round-trips whatever was on disk | `artifact-store.ts:114,127` — **this is why a `$schema` marker is the wrong run-once gate** (see "Key design decision 2") |

## Key design decision 1: the migration reuses the fixed classifier

The repair does **not** implement its own "is this path in the project" rules. It re-runs each external record's stored `absolutePath` through `resolveTrackedPath` — the same function Task 1 fixes — and reclassifies whatever now comes back `internal`.

This is what makes the repair safe without a filesystem check:

| Stored path (root = `/home/destin/youcoded-dev`) | Which branch fires | Result |
|---|---|---|
| `flappy-bird/play.html` | new step 3 (relative) | internal `flappy-bird/play.html` ✓ |
| `C:/Users/desti/youcoded-dev/docs/PITFALLS.md` | step 2 (cross-OS remap finds `youcoded-dev`) | internal `docs/PITFALLS.md` ✓ |
| `C:/Users/desti/AppData/Local/Temp/…/paste.png` | no branch — no root segment, and step 3 rejects drive letters | stays external ✓ |
| `/tmp/claude-1000/…/scratchpad/flappy.html` | step 1 fails, absolute, no remap | stays external ✓ |

The 8 out-of-root Windows records are left alone for free, because step 2 only remaps when it finds the project-root basename as a path segment. No existence check, no `fs`, no guessing.

## Key design decision 2: the run-once gate is `reclassified === 0`, NOT a `$schema` bump

An earlier draft of this plan bumped `SIDECAR_SCHEMA_VERSION` 1 → 2 on both platforms and used it as the migration's "already ran" marker. That is worse than it looks:

- **It is not self-healing.** `appendVersion` round-trips `$schema` from disk (`artifact-store.ts:114,127` set it only when creating a *new* sidecar). A peer device still running a pre-fix build keeps producing new relative-external records into the same synced sidecar — and the fixed client, seeing `$schema: 2`, will never repair them.
- **It buys nothing.** `migrateRelativeExternals` is pure and already returns `reclassified`. Gating on `reclassified === 0` costs one pass over an array that `readSidecar` just parsed anyway — noise next to the JSON.parse of a multi-megabyte file — and is exactly as idempotent (Task 4 pins that with a test).
- **It couples two platforms for no reason.** The bump forced a matching Kotlin constant change and a two-directions compatibility argument about whether an older client would reject a v2 sidecar.

So: no schema bump, no Kotlin constant change, no compatibility analysis. The gate is "did the pure function actually change anything."

Repeated calls are made cheap by a process-lifetime `Set<string>` of already-checked project roots, so wiring the migration into hot handlers costs a `Set.has` after the first call per project. Consequence to accept knowingly: repair from a stale peer's damage happens on the **next app launch**, not mid-session.

## Out of scope

**Kotlin `detectOrphan` pruning.** Pre-existing dead code flagged for an Android session in `project-manager.ts:84-88`. Unrelated; do not fold in.

**Changing what the harness emits.** Tempting, but wrong: `permissionSubject: (a) => a.file_path` (`harness/tools/write.ts:20`) feeds the permission prompt and the tool card. A short relative path is friendlier to show when approving a write. Changing the emitted value to satisfy the artifact layer would change what the user reads when deciding to approve. Fix the consumer.

**Repairing `..`-escaping records.** `resolveP` is `path.resolve(cwd, p)`, so `../other/notes.md` really did write outside the project. Those records stay external with a relative `absolutePath`, which after Task 2 means they are consistently refused as orphans everywhere instead of silently resolving against the process cwd. Correct but not *repaired* — captured as a follow-up.

**An Android-side migration.** Desktop-only, deliberately. Both platforms read the same synced sidecar, so once desktop migrates a project the repaired records are correct everywhere. If Android opens an unmigrated project first it shows the same false orphans it shows today — degraded, never corrupted. A Kotlin migration twin would double the riskiest code in this plan for a window that closes the first time the project is opened on desktop.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `youcoded/desktop/src/shared/artifacts/resolve-tracked-path.ts` | Pure internal/external classification of a recorded path | Modify — gate step 2 on absoluteness; new relative branch before the external fallthrough |
| `youcoded/desktop/tests/resolve-tracked-path.test.ts` | Unit tests for the above | Modify — 7 new cases |
| `youcoded/desktop/src/main/artifacts/write-authorization.ts` | Resolve-and-authorize for `artifacts:get` / `artifacts:save` | Modify — **export** `isAbsoluteRecorded`; apply in both functions |
| `youcoded/desktop/src/main/ipc-handlers.ts` | `artifacts:check-existence` handler | Modify — apply the guard (this is the Session-Drawer-visible path) |
| `youcoded/desktop/src/main/artifacts/projects-index.ts` | `countArtifacts` | Modify — apply the guard |
| `youcoded/desktop/tests/artifacts/write-authorization.test.ts` | Unit tests for the above | Modify — 3 new cases |
| `youcoded/app/.../runtime/SessionService.kt` | Android bridge handlers incl. `artifacts:get` / `artifacts:save` | Modify — same guard at both sites |
| `youcoded/app/.../artifacts/ProjectManager.kt` | Android artifact path helpers | Modify — add `isAbsoluteRecorded` |
| `youcoded/app/src/test/.../ArtifactPathGuardTest.kt` | Kotlin test for the guard | Create |
| `youcoded/desktop/src/shared/artifacts/migrate-relative-externals.ts` | **Pure** sidecar repair: reclassify + merge duplicates | Create |
| `youcoded/desktop/tests/migrate-relative-externals.test.ts` | Unit tests for the repair | Create |
| `youcoded/desktop/src/main/artifacts/artifact-store.ts` | Sidecar read/write | Modify — `runSidecarMigration` entry point |

Note what is **not** in this table any more: `types.ts` and `SidecarSchema.kt`. See "Key design decision 2".

---

### Task 1: Classify a relative recorded path as internal

The producer fix. It stops new bad records on **both** platforms at once, because Android runs the same shared React tracker (`App.tsx:1535`) in its WebView. Task 4 then depends on the branch added here.

This task also closes a **pre-existing** hole next door: step 2's cross-OS remap fires on *any* path whose OS-ness differs from the root's, including relative ones. With a Windows root, `resolveTrackedPath('proj/notes.md', 'C:/Users/desti/proj')` currently finds `proj` at index 0 and returns internal `notes.md` — but the harness resolved that arg to `C:/Users/desti/proj/proj/notes.md`. That is a wrong-file classification, and it is the one relative-path subset the new branch would otherwise not reach. One extra condition on the step-2 gate fixes it.

**Files:**
- Modify: `youcoded/desktop/src/shared/artifacts/resolve-tracked-path.ts:59-75`
- Test: `youcoded/desktop/tests/resolve-tracked-path.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: no signature change. `resolveTrackedPath(recordedPath: string, projectRoot: string): TrackedPathResolution` keeps its shape; only the classification of relative inputs changes. **Task 4 calls this function directly.**

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('resolveTrackedPath', …)` block in `youcoded/desktop/tests/resolve-tracked-path.test.ts`:

```typescript
  // ── Relative recorded paths (native harness) ────────────────────────────
  // The native harness Write/Edit/Read tools accept a relative file_path and
  // resolve it with path.resolve(ctx.cwd, p) (harness/tools/guards.ts), but the
  // transcript event carries the RAW arg. The tracker passes session.cwd as
  // projectRoot (App.tsx:1507) — the SAME value — so a relative recorded path is
  // by definition in-project and must file as internal. Filing it external with
  // a relative absolutePath produced the 2026-08-12 "no longer on disk" false
  // positive on files that exist.

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

  // PRE-EXISTING BUG, fixed by the absoluteness gate on step 2. Without it the
  // cross-OS remap fires on a RELATIVE path (its OS-ness trivially differs from
  // a Windows root), finds 'proj' at index 0, and returns internal 'notes.md' —
  // but the harness resolved this arg to C:/Users/desti/proj/proj/notes.md.
  it('relative path under a Windows root is joined, not remapped', () => {
    expect(resolveTrackedPath('proj/notes.md', 'C:/Users/desti/proj')).toEqual({
      kind: 'internal', path: 'proj/notes.md', absolutePath: null,
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

Expected: the three "relative → internal" cases FAIL (they currently return `{kind: 'external', …}`), and the Windows-root case FAILS (it currently returns `{kind: 'internal', path: 'notes.md'}`). The three guard cases (unremappable Windows, `..`, empty) should already PASS — they encode behavior that must not regress.

- [ ] **Step 3: Gate the cross-OS remap on absoluteness**

The two `isWindows` flags already exist at `resolve-tracked-path.ts:59-60`. Add a POSIX-absolute test beside them and require the recorded path to be absolute *somehow* before step 2 may fire:

```typescript
  const recordedIsWindows = /^[a-zA-Z]:[\\/]/.test(recordedPath);
  const rootIsWindows = /^[a-zA-Z]:[\\/]/.test(projectRoot);
  // Fix: step 2 remaps ANOTHER DEVICE'S ABSOLUTE PATH. A relative path has no
  // OS-ness of its own, so the `recordedIsWindows !== rootIsWindows` gate below
  // fired on every relative path under a Windows root and, if the path happened
  // to contain the project folder name as a segment, silently returned the WRONG
  // file ('proj/notes.md' → 'notes.md', when the harness meant proj/proj/notes.md).
  const recordedIsAbsolute = recordedIsWindows || fwdPath.startsWith('/');
  if (recordedIsAbsolute && recordedIsWindows !== rootIsWindows) {
```

(The body of the `if` is unchanged.)

- [ ] **Step 4: Add the classification branch**

Insert **between** the step-2 cross-OS remap block and the step-3 external fallthrough (which becomes step 4 — renumber its comment):

```typescript
  // 3. Relative recorded path → internal. The native harness tools accept a
  //    relative file_path and resolve it with path.resolve(ctx.cwd, p) themselves
  //    (main/harness/tools/guards.ts), but the transcript event we consume
  //    carries the RAW arg. The tracker passes session.cwd as projectRoot
  //    (App.tsx:1507) — the SAME value the harness resolved against — so a
  //    relative path here is in-project by identity, not by inference.
  //
  //    WHY internal rather than absolutising into an external: internal records
  //    survive cross-device sync (that is the entire point of step 2). An
  //    external carrying a machine-specific absolute path breaks again the next
  //    time the conversation is resumed on another device.
  //
  //    MUST run AFTER step 2. 'C:/Users/...' is not absolute by POSIX rules, so
  //    on Linux it reaches here; the drive-letter test below catches the case
  //    where step 2 ran but found no project-root segment to remap. Without it
  //    we would produce join(root, 'C:/Users/...') — worse than leaving the
  //    record external.
  if (!recordedIsAbsolute && fwdPath !== '') {
    // A '..' segment escapes the root once joined, manufacturing a phantom
    // internal artifact. Leave those external — authorizeArtifactRead's in-root
    // check would reject them anyway, but as an unexplained "not found".
    if (!fwdPath.split('/').includes('..')) {
      return { kind: 'internal', path: fwdPath.replace(/^\.\//, ''), absolutePath: null };
    }
  }
```

Note this reuses `recordedIsAbsolute` from Step 3 rather than recomputing the two regexes — one definition of "absolute" for both branches.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd youcoded/desktop && npx vitest run tests/resolve-tracked-path.test.ts
```

Expected: PASS, all cases including the 8 pre-existing ones.

- [ ] **Step 6: Run the wider artifact suite for fallout**

```bash
cd youcoded/desktop && npx vitest run tests/artifacts/
```

Expected: PASS. If `tests/artifacts/artifact-tracker.test.ts` fails, a fixture there encodes the old external-for-relative behavior — update the fixture, and say in the commit that the fixture was asserting the bug.

- [ ] **Step 7: Commit**

```bash
git add src/shared/artifacts/resolve-tracked-path.ts tests/resolve-tracked-path.test.ts
git commit -m "fix(artifacts): file relative transcript paths as internal, not external

The native harness Write/Edit/Read tools accept a relative file_path and
resolve it with path.resolve(ctx.cwd, p), but the transcript event carries the
raw arg. resolveTrackedPath had no branch for a relative path, so it fell
through to 'genuinely external' and stored the relative string in absolutePath
-- a field contractually required to be absolute. Consumers then handed that to
realpath/fs.access, which resolve against the PROCESS cwd (/home/destin for a
GUI-launched Electron app), so 13 files that exist in the project rendered as
'no longer on disk'.

Also gates the cross-OS remap on the recorded path being absolute. A relative
path has no OS-ness, so that gate fired on every relative path under a Windows
root and, when the path contained the project folder name as a segment,
returned the WRONG file ('proj/notes.md' -> 'notes.md')."
```

---

### Task 2: Refuse non-absolute recorded paths at every desktop resolution site

**There is no single boundary to guard.** Four desktop sites build a filesystem path out of `artifact.absolutePath`; only two go through `write-authorization.ts`:

| Site | How it resolves today | Consequence of a relative record |
|---|---|---|
| `ipc-handlers.ts:3588` (GET) | `authorizeArtifactRead` → `realpath` | Opens whatever sits at that path relative to the process cwd, or ENOENT → orphan |
| `ipc-handlers.ts:3727` (SAVE) | `authorizeArtifactWrite` → `realpath`, ENOENT-falls-back to the **parent** | Would CREATE a stray file in the process cwd, with the in-root check skipped (`mustStayInRoot` is false for externals) |
| `ipc-handlers.ts:4091` (CHECK_EXISTENCE) | raw `fs.access(a.absolutePath)` | **This is the Session Drawer's "The original file is no longer on disk."** (`SessionDrawer.tsx:42,145`) — and the inverse: a same-named file in the process cwd reports the artifact as *alive* |
| `projects-index.ts:42` (`countArtifacts`) | raw `fs.access(a.absolutePath!)` | Same, in the hero/switcher count. Lower reach — `trackedArtifacts` admits externals only when pinned (`visible-artifacts.ts:62`) |

`isAbsoluteRecorded` is therefore **exported** from `write-authorization.ts` and imported by the other two.

**No drive-letter clause.** An earlier draft accepted `C:/…` explicitly. It is provably behavior-neutral: on POSIX, `realpath('C:/Users/x/notes.md')` ENOENTs and the write path's parent fallback ENOENTs too — identical outcomes to refusing up front — and on Windows `path.isAbsolute` already returns true for it. Bare `path.isAbsolute` is exactly right on both platforms.

**User-visible behavior is unchanged** on the read/list paths: these records already render as orphans. A reviewer should not expect a visible fix from this task. What it removes is the *wrong-file* class — a relative record silently addressing, or creating, a file outside the project.

**Files:**
- Modify: `youcoded/desktop/src/main/artifacts/write-authorization.ts`
- Modify: `youcoded/desktop/src/main/ipc-handlers.ts` (CHECK_EXISTENCE, ~4076)
- Modify: `youcoded/desktop/src/main/artifacts/projects-index.ts` (`countArtifacts`, ~34)
- Test: `youcoded/desktop/tests/artifacts/write-authorization.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `export function isAbsoluteRecorded(p: string): boolean`. No new return variants — `authorizeArtifactRead` reuses `{ok: false, orphan: true}`, `authorizeArtifactWrite` reuses `{ok: false, error: 'artifact-not-found'}`, CHECK_EXISTENCE reports the id as missing, `countArtifacts` counts it as not-alive. No caller signature changes.

- [ ] **Step 1: Write the failing tests**

Append to `youcoded/desktop/tests/artifacts/write-authorization.test.ts`:

```typescript
  // A relative absolutePath is a corrupt sidecar record (pre-2026-08-12
  // resolveTrackedPath wrote them). realpath()/fs.access()/File() resolve it
  // against the PROCESS cwd, not the project root, so it can silently address a
  // file outside the project. Refuse before resolution rather than guessing.

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

  // Behavior PIN, not a fix: a Windows-drive record already orphans on POSIX
  // (realpath ENOENT) and is already accepted on Windows (path.isAbsolute is
  // true there). Same expectation on both platforms, before and after. It exists
  // so a future "simplification" of isAbsoluteRecorded to a hand-rolled
  // startsWith('/') cannot silently break cross-device records on Windows.
  it('read: a Windows-drive path orphans on POSIX and is accepted on Windows', async () => {
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

Expected: two of the three FAIL, deterministically.
- Read/`package.json`: currently returns `{ok: true, realPath: '<cwd>/package.json'}` because the file exists relative to the vitest cwd. **FAILS.**
- Read/`C:/Users/...`: passes before and after — see the comment above. **PASSES.**
- Write/`ROADMAP.md`: currently returns `{ok: true, realPath: '<cwd>/ROADMAP.md'}` because the ENOENT fallback resolves `dirname('ROADMAP.md')` = `realpath('.')`. **FAILS.**

- [ ] **Step 3: Add and export the guard**

In `youcoded/desktop/src/main/artifacts/write-authorization.ts`, add above `inRealRoot`:

```typescript
/**
 * An external artifact's `absolutePath` is contractually canonical and absolute
 * (shared/artifacts/types.ts). Records written before the 2026-08-12
 * resolveTrackedPath fix violate that — they hold relative strings like
 * 'flappy-bird/play.html'. Every filesystem call resolves a relative path
 * against the PROCESS cwd (/home/destin for a GUI-launched Electron app, never
 * the project root), so such a record can silently address a file outside the
 * project, or — on the write path, whose ENOENT fallback resolves the PARENT —
 * create one.
 *
 * EXPORTED because write-authorization is not the only site that builds a path
 * from a record: artifacts:check-existence (ipc-handlers.ts) and countArtifacts
 * (projects-index.ts) call fs.access on the raw string. All four sites share
 * this one definition.
 *
 * path.isAbsolute is deliberately used bare. It is already platform-correct: on
 * Windows it accepts 'C:\...' (a real absolute path there); on POSIX it rejects
 * it, which lands cross-device Windows records on the same orphan outcome their
 * realpath ENOENT already produced.
 */
export function isAbsoluteRecorded(p: string): boolean {
  return path.isAbsolute(p);
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

- [ ] **Step 4: Apply the guard at the two raw `fs.access` sites**

In `youcoded/desktop/src/main/ipc-handlers.ts`, inside the CHECK_EXISTENCE handler (~4089), replace:

```typescript
        const fullPath = a.kind === 'internal'
          ? path.join(projectRoot, a.path)
          : a.absolutePath;
        if (!fullPath) return id;
```

with:

```typescript
        // A corrupt record (relative absolutePath) resolves against the PROCESS
        // cwd here, which cuts both ways: it reports an in-project file as
        // missing (the Session Drawer's "no longer on disk" — this handler feeds
        // that label, SessionDrawer.tsx:42) AND would report an artifact as
        // present if a same-named file happens to sit in the process cwd.
        const fullPath = a.kind === 'internal'
          ? path.join(projectRoot, a.path)
          : a.absolutePath;
        if (!fullPath) return id;
        if (a.kind !== 'internal' && !isAbsoluteRecorded(fullPath)) return id;
```

In `youcoded/desktop/src/main/artifacts/projects-index.ts`, inside `countArtifacts` (~41):

```typescript
  const alive = await Promise.all(visible.map(async (a: any) => {
    const full = a.kind === 'internal' ? path.join(projectRoot, a.path) : a.absolutePath!;
    // Same corrupt-record guard as artifacts:check-existence — never let
    // fs.access resolve a relative record against the process cwd and count a
    // coincidentally-named file as this artifact.
    if (a.kind !== 'internal' && !isAbsoluteRecorded(full)) return false;
    try { await fs.promises.access(full); return true; } catch { return false; }
  }));
```

Import `isAbsoluteRecorded` from `./write-authorization` (projects-index) and `./artifacts/write-authorization` (ipc-handlers) alongside the existing imports.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd youcoded/desktop && npx vitest run tests/artifacts/
```

Expected: PASS, including all pre-existing cases (symlink resolution, in-root enforcement, tier refusal, concurrency token) and `project-manager.test.ts` / `categorization.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/main/artifacts/write-authorization.ts src/main/artifacts/projects-index.ts \
        src/main/ipc-handlers.ts tests/artifacts/write-authorization.test.ts
git commit -m "fix(artifacts): refuse non-absolute recorded paths at all four resolution sites

Sidecar records written before the resolveTrackedPath fix hold relative
absolutePath strings, and FOUR main-process sites turn one into a filesystem
path -- artifacts:get and artifacts:save via write-authorization, plus
artifacts:check-existence and countArtifacts, which call fs.access on the raw
string. write-authorization is not a chokepoint, so isAbsoluteRecorded is
exported and applied at all four.

check-existence is the one users see: it feeds the Session Drawer's 'The
original file is no longer on disk', and the drawer is the only surface where
an unpinned external is visible at all.

Reads and counts keep their existing orphan outcome. What goes away is the
wrong-file class: realpath/fs.access resolving a relative record against the
process cwd, and -- on save, whose ENOENT fallback resolves the PARENT --
creating a stray file there with the in-root check skipped."
```

---

### Task 3: Android parity guard

`SessionService.kt:3319` builds `File(artifact.absolutePath!!)` exactly as desktop did. On Android a relative path resolves against the app process cwd (`/`), so the identical false orphan occurs. Android's `artifacts:check-existence` is a stub that always reports nothing missing (`SessionService.kt:3619-3622`), so unlike desktop there is no third site to guard.

Android is always POSIX, so the helper is a bare `startsWith("/")` — no drive-letter clause. A synced Windows record (`C:/Users/…`) is refused as an orphan, which is exactly what `File("C:/Users/…").exists()` already returns there.

**Files:**
- Modify: `youcoded/app/src/main/kotlin/com/youcoded/app/artifacts/ProjectManager.kt`
- Modify: `youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` (`artifacts:get` ~3319, `artifacts:save` ~3446)
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
    fun relativePathIsRejected() {
        assertFalse(isAbsoluteRecorded("flappy-bird/play.html"))
        assertFalse(isAbsoluteRecorded("ROADMAP.md"))
    }

    // A synced Windows record is not addressable on Android. Refusing it yields
    // the same orphan the existing File("C:/...").exists() == false produced.
    @Test
    fun windowsDrivePathIsRejectedOnAndroid() {
        assertFalse(isAbsoluteRecorded("C:/Users/desti/notes.md"))
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
 * even though it sits in the project — the "no longer on disk" false positive.
 *
 * Android is always POSIX, so this is a bare leading-slash test. A synced
 * Windows record ("C:/Users/...") is not addressable here and is refused as an
 * orphan — the same result File("C:/Users/...").exists() already gives.
 *
 * Mirrors desktop/src/main/artifacts/write-authorization.ts::isAbsoluteRecorded
 * (which uses path.isAbsolute, platform-correct on both OSes).
 */
fun isAbsoluteRecorded(p: String): Boolean = p.startsWith("/")
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd youcoded && ./gradlew test --tests '*ArtifactPathGuardTest*'
```

Expected: PASS.

- [ ] **Step 5: Apply the guard at both bridge handlers**

In `SessionService.kt`, in `"artifacts:get"`, replace the `fullPath` construction (~line 3319):

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

Then in `"artifacts:save"` (~line 3446), replace the identical `fullPath` construction with:

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
git commit -m "fix(artifacts): Android parity for the non-absolute recorded path guard

SessionService's artifacts:get/save built File(absolutePath!!) directly, so a
relative record resolved against the app process cwd ('/') and reported an
existing project file as missing -- the same defect fixed on desktop in
write-authorization.ts. Android's artifacts:check-existence is a stub that
reports nothing missing, so there is no third site to guard here."
```

---

### Task 4: Pure sidecar repair — reclassify and merge

The data fix. A pure function so the merge logic — the genuinely tricky part — is unit-testable without a filesystem, and so it can never touch a live sidecar by accident.

**Merge rule.** When a reclassified record lands on a path an internal record already occupies, the **older** record survives (ULIDs sort by creation time, so the lexicographically smaller id is older). It absorbs the other's history: versions concatenated, deduped by version id, sorted by `ts`; `lastModified` = the later of the two; `status` recomputed from the latest version; `tags` unioned; `comments` concatenated. The surviving id is the one most likely already referenced by an open draft or the current selection.

**Path matching is raw, deliberately.** The collision map keys on `a.path` byte-for-byte, while the rest of the artifact layer compares through `canonicalize()` on both sides (`visible-artifacts.ts:46-55`). Importing `canonicalize` here is possible (it is also pure) but changes what the migration *writes*: `resolved.path` comes straight out of `resolveTrackedPath`, so canonicalizing one side of the comparison and not the other would be worse than neither. The residual risk is a case-differing pair (`Docs/MAP.md` vs `docs/MAP.md`) dodging the merge and leaving two internal records at "the same" path — possible only on Windows, where these records mostly do not exist in the first place (a Windows client's own paths hit step 1 and were already internal). Accepted, and noted in the follow-ups.

**Files:**
- Create: `youcoded/desktop/src/shared/artifacts/migrate-relative-externals.ts`
- Test: `youcoded/desktop/tests/migrate-relative-externals.test.ts`

**Interfaces:**
- Consumes: `resolveTrackedPath` from Task 1 — the branch added there is what makes this correct.
- Produces:
  ```typescript
  export interface MigrationResult {
    sidecar: ProjectSidecar;   // new object; input is not mutated
    reclassified: number;      // externals that became internal (INCLUDES merged ones)
    merged: number;            // records folded into an existing internal twin
  }
  export function migrateRelativeExternals(
    sidecar: ProjectSidecar,
    projectRoot: string
  ): MigrationResult
  ```
  Task 5 calls this, and uses `reclassified === 0` as its run-once gate.

- [ ] **Step 1: Write the failing tests**

Create `youcoded/desktop/tests/migrate-relative-externals.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { migrateRelativeExternals } from '../src/shared/artifacts/migrate-relative-externals';
import { SIDECAR_SCHEMA_VERSION } from '../src/shared/artifacts/types';
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
    $schema: SIDECAR_SCHEMA_VERSION, projectId: 'p', name: 'proj',
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

  it('leaves a .. escape external — the harness really did write outside the root', () => {
    const original = rec({ id: 'art_A', path: 'notes.md', kind: 'external',
      absolutePath: '../other/notes.md' });
    const res = migrateRelativeExternals(sidecar([original]), ROOT);
    expect(res.reclassified).toBe(0);
    expect(res.sidecar.artifacts[0]).toEqual(original);
  });

  it('MERGES into an existing internal twin instead of creating a duplicate', () => {
    // 10 of the 18 real records hit this path. A plain field rewrite would
    // leave two internal records at the same path with split histories.
    //
    // The ids carry a numeric prefix on purpose: `older()` compares ULIDs
    // LEXICOGRAPHICALLY, so bare 'art_OLD'/'art_NEW' would make the "new" record
    // sort first ('N' < 'O') and the assertion below would be testing the
    // opposite of what it reads as.
    const res = migrateRelativeExternals(sidecar([
      rec({ id: 'art_1_OLD', path: 'ROADMAP.md', kind: 'internal', absolutePath: null,
            lastModified: '2026-07-25T00:00:00.000Z',
            versions: [{ id: 'v1', ts: '2026-07-25T00:00:00.000Z', sessionId: 's1', type: 'create', author: 'agent' }],
            tags: ['plan'] }),
      rec({ id: 'art_2_NEW', path: 'ROADMAP.md', kind: 'external', absolutePath: 'ROADMAP.md',
            lastModified: '2026-08-13T00:00:00.000Z',
            versions: [{ id: 'v2', ts: '2026-08-13T00:00:00.000Z', sessionId: 's2', type: 'edit', author: 'agent' }],
            tags: ['roadmap'] }),
    ]), ROOT);

    expect(res.merged).toBe(1);
    expect(res.sidecar.artifacts).toHaveLength(1);
    const m = res.sidecar.artifacts[0];
    expect(m.id).toBe('art_1_OLD');                     // older record survives
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

  // THE RUN-ONCE GATE. Task 5 writes only when reclassified > 0, so this test is
  // load-bearing for "safe to call on every project open", not a nicety.
  it('is idempotent — a second run reclassifies nothing and changes nothing', () => {
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
// field contractually absolute. Consumers hand that to realpath/fs.access/File(),
// which resolve it against the PROCESS cwd, so files that exist in the project
// render as "no longer on disk".
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
// never touch a live sidecar by accident. `reclassified` doubles as the caller's
// run-once gate — see runSidecarMigration in main/artifacts/artifact-store.ts.
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
  // Keys are RAW, not canonicalized — see the task's "Path matching is raw" note.
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
      // referenced by an open draft or the current selection. The merged record
      // replaces `existing` IN PLACE regardless of which id wins, so ordering is
      // stable and a later external resolving to the same path finds it here.
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

Expected: PASS, all 11 cases.

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
this can never touch a live sidecar by accident.

reclassified === 0 is the caller's run-once gate; the idempotency test pins it."
```

---

### Task 5: Run the repair where the false orphans actually render

**The handler choice is the substance of this task.** An earlier draft hooked `ARTIFACT_IPC.LIST_PROJECT` "on project open." That handler is not project open — `rg -n "artifacts\.listProject\b" src/renderer` returns exactly one caller, `FilepathToken.tsx:110` (resolving a filepath pill), and `ipc-handlers.ts:3517-3521` says so itself: *"No Project View section reads this any more."* Project View opens through `listProjectsIndex` + `listAllFiles`; the Session Drawer — the only surface where a relative external is visible — uses `listSession`.

So wire it into all three per-project entry points and make repeat calls free with a process-lifetime memo:

| Handler | Line | Why |
|---|---|---|
| `LIST_SESSION` | ~3471 | The Session Drawer. Where the false orphans render |
| `LIST_ALL_FILES` | ~3567 | Actual project open (Project View → Files) |
| `LIST_PROJECT` | ~3531 | Filepath pills + the hero/switcher count |

`LIST_SESSION` also fires after every tracked write (`App.tsx` refreshes the drawer in `appendVersion`'s `.finally`), which is exactly why the memo is not optional.

**Files:**
- Modify: `youcoded/desktop/src/main/artifacts/artifact-store.ts`
- Modify: `youcoded/desktop/src/main/ipc-handlers.ts` (three handlers)
- Test: `youcoded/desktop/tests/artifacts/artifact-store.test.ts`

**Interfaces:**
- Consumes: `migrateRelativeExternals` (Task 4), `readSidecar` / `writeSidecar` (existing).
- Produces: `runSidecarMigration(projectRoot: string): Promise<{ migrated: boolean; reclassified: number; merged: number }>`, exported from `artifact-store.ts`.

- [ ] **Step 1: Write the failing test**

Append to `youcoded/desktop/tests/artifacts/artifact-store.test.ts`. That file has **no shared fixture helper** — every `describe` makes its own root with `mkdtempSync(join(tmpdir(), '<prefix>-'))` and cleans up in `afterEach`. Follow that pattern:

```typescript
describe('runSidecarMigration', () => {
  let projectRoot: string;
  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'as-migrate-'));
    mkdirSync(join(projectRoot, '.youcoded'), { recursive: true });
  });
  afterEach(() => rmSync(projectRoot, { recursive: true, force: true }));

  const legacy = () => ({
    $schema: SIDECAR_SCHEMA_VERSION, projectId: 'p', name: 'proj',
    createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
    artifacts: [{
      id: 'art_A', path: 'play.html', kind: 'external' as const,
      absolutePath: 'flappy-bird/play.html',
      lastModified: '2026-08-13T00:00:00.000Z', status: 'active' as const,
      versions: [], comments: [], tags: [],
    }],
    manualExcludes: [], manualIncludes: [],
  });

  it('repairs relative externals and is a no-op on the second call', async () => {
    await writeSidecar(projectRoot, null, legacy() as any);

    const first = await runSidecarMigration(projectRoot);
    expect(first).toMatchObject({ migrated: true, reclassified: 1, merged: 0 });

    const after = await readSidecar(projectRoot) as ProjectSidecar;
    expect(after.artifacts[0]).toMatchObject({
      path: 'flappy-bird/play.html', kind: 'internal', absolutePath: null,
    });

    // No-op via the reclassified === 0 gate — NOT via the process memo, which a
    // fresh temp root cannot have populated for a second distinct project.
    const second = await runSidecarMigration(projectRoot);
    expect(second).toMatchObject({ migrated: false, reclassified: 0 });
    const unchanged = await readSidecar(projectRoot) as ProjectSidecar;
    expect(unchanged.updatedAt).toBe(after.updatedAt);   // it did not rewrite
  });

  it('does not write, or back up, a sidecar with nothing to repair', async () => {
    const clean = legacy();
    clean.artifacts[0] = { ...clean.artifacts[0], kind: 'internal' as any, absolutePath: null };
    await writeSidecar(projectRoot, null, clean as any);

    const res = await runSidecarMigration(projectRoot);
    expect(res.migrated).toBe(false);
    expect(readdirSync(join(projectRoot, '.youcoded')).filter((f) => f.includes('.bak'))).toHaveLength(0);
  });

  it('backs the sidecar up exactly once before rewriting it', async () => {
    await writeSidecar(projectRoot, null, legacy() as any);
    await runSidecarMigration(projectRoot);
    await runSidecarMigration(projectRoot);
    const backups = readdirSync(join(projectRoot, '.youcoded'))
      .filter((f) => f.startsWith('artifacts.json.pre-migration'));
    expect(backups).toEqual(['artifacts.json.pre-migration.bak']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd youcoded/desktop && npx vitest run tests/artifacts/artifact-store.test.ts
```

Expected: FAIL — "runSidecarMigration is not exported".

- [ ] **Step 3: Add the migration entry point**

Append to `youcoded/desktop/src/main/artifacts/artifact-store.ts`:

```typescript
// Project roots already checked in THIS process. The migration is safe to call
// from hot handlers (LIST_SESSION fires after every tracked write), and the
// pure pass over a 2,800-record array is cheap — but it is not free, and there
// is no reason to redo it every call.
//
// Process-lifetime, deliberately: a peer device on a pre-fix build can keep
// writing new relative-external records into a synced sidecar, and clearing the
// memo on app launch is what lets us repair those. That is the trade for having
// no persistent "already migrated" marker — see the plan's design decision 2.
const migrationChecked = new Set<string>();

/**
 * One-time repair of relative-external records (see
 * shared/artifacts/migrate-relative-externals.ts).
 *
 * The run-once gate is `reclassified === 0`, NOT a $schema bump. appendVersion
 * round-trips $schema from disk, so a schema marker would say "repaired" while
 * a stale peer build kept producing new damage that this would then never fix.
 * The pure function already tells us whether anything changed; nothing is
 * written when it hasn't.
 *
 * WHY here and not inside readSidecar: readSidecar is a hot path (every get,
 * save, and list call). A function that writes from inside a read is both
 * surprising and a lock-contention risk.
 */
export async function runSidecarMigration(
  projectRoot: string
): Promise<{ migrated: boolean; reclassified: number; merged: number }> {
  const NOTHING = { migrated: false, reclassified: 0, merged: 0 };
  if (migrationChecked.has(projectRoot)) return NOTHING;

  // The sidecar is written continuously by the running app, so a CAS conflict is
  // a real (if rare) outcome. Mirror appendVersion: re-read and retry rather
  // than deferring to "some later project open", which for the busiest project
  // is the least likely to win.
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await readSidecar(projectRoot);
    if (current === null || 'corrupted' in current) {
      migrationChecked.add(projectRoot);
      return NOTHING;
    }

    const result = migrateRelativeExternals(current, projectRoot);
    if (result.reclassified === 0) {
      migrationChecked.add(projectRoot);   // nothing to do — don't re-scan this process
      return NOTHING;
    }

    // Back up before the first rewrite. This edits weeks of artifact history in
    // place; a copy is the only way back if the merge rule turns out wrong for a
    // record we did not anticipate. FIXED name, written only if absent: a
    // timestamped name would accumulate one file per retry and per relapse.
    const sidecarPath = join(projectRoot, SIDECAR_RELATIVE);
    try {
      await fs.copyFile(sidecarPath, `${sidecarPath}.pre-migration.bak`, fsConstants.COPYFILE_EXCL);
    } catch (e: any) {
      if (e.code !== 'EEXIST') throw e;   // a backup already exists — keep the oldest
    }

    // CAS on the value we read: if another window wrote in between, re-read and
    // recompute rather than clobber.
    const next: ProjectSidecar = result.sidecar;
    const { committed } = await writeSidecar(projectRoot, current.updatedAt, next);
    if (committed) {
      migrationChecked.add(projectRoot);
      return { migrated: true, reclassified: result.reclassified, merged: result.merged };
    }
  }
  return NOTHING;   // three conflicts — do NOT memo; the next call retries
}
```

Add at the top of the file:

```typescript
import { constants as fsConstants } from 'fs';
import { migrateRelativeExternals } from '../../shared/artifacts/migrate-relative-externals';
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd youcoded/desktop && npx vitest run tests/artifacts/artifact-store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Call it from the three per-project entry points**

In `youcoded/desktop/src/main/ipc-handlers.ts`. `LIST_SESSION` (~3471) receives `projectRoot` directly:

```typescript
    // Repair legacy relative-external records before listing. The Session
    // Drawer is the only surface where an unpinned external is visible, so this
    // is where the false "no longer on disk" actually renders. Memoized per
    // project per process — this handler also fires after every tracked write.
    await runSidecarMigration(projectRoot);
```

`LIST_PROJECT` (~3531) and `LIST_ALL_FILES` (~3567) both resolve `projectRoot` from `projectId` first; add the same line immediately after their `const projectRoot = p ? p.path : projectId;`.

Import `runSidecarMigration` alongside the existing `artifact-store` imports.

- [ ] **Step 6: Full desktop verification**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh
```

Expected: PASS — tsc, affected vitest, knip, eslint, ast-grep. Knip matters here: it catches `runSidecarMigration` being exported but never wired up if Step 5 was missed.

- [ ] **Step 7: Commit**

```bash
git add src/main/artifacts/artifact-store.ts src/main/ipc-handlers.ts \
        tests/artifacts/artifact-store.test.ts
git commit -m "feat(artifacts): run the relative-external repair where the orphans render

Gated on the pure migration reporting reclassified === 0, not on a \$schema
bump: appendVersion round-trips \$schema from disk, so a schema marker would
read 'repaired' while a peer device on a pre-fix build kept writing new
relative-external records that this would then never fix. A process-lifetime
memo keeps repeat calls to a Set lookup.

Wired into list-session (the Session Drawer -- the only surface where an
unpinned external is visible), list-all-files (project open), and list-project
(filepath pills). NOT list-project alone: that handler has exactly one renderer
caller, FilepathToken, and its own comment says no Project View section reads
it any more.

Backs the sidecar up under a fixed name before the first rewrite, and CAS-
writes against the value it read, retrying twice on conflict rather than
deferring to a later open -- the busiest project is the one most likely to
conflict and the one that most needs the repair."
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

Then run `migrateRelativeExternals` against the parsed copy in a scratch vitest file with `projectRoot` set to `/home/destin/youcoded-dev`.

**Assert invariants, not counts.** A simulation of this algorithm against the live sidecar on 2026-08-12 produced **48 reclassified (18 relative + 30 Windows-remapped), 13 merged**, out of 2,839 artifacts. Do not hardcode those numbers: that file is written continuously by the running app — two measurements 20 minutes apart during planning saw 2,811 and 2,839 artifacts. Treat the composition (roughly 18 relative, roughly 30 Windows, ~13 collisions) as a sanity range and assert these instead, all of which hold at any size:

```typescript
const before = JSON.parse(raw) as ProjectSidecar;
const { sidecar: after, reclassified, merged } = migrateRelativeExternals(before, ROOT);

// 1. Every surviving external must be safe to hand to fs — the whole point.
for (const a of after.artifacts) {
  if (a.kind === 'internal') expect(a.absolutePath).toBeNull();
}
// 2. No two internal records may share a path (the duplicate this migration exists to prevent).
const paths = after.artifacts.filter((a) => a.kind === 'internal').map((a) => a.path);
expect(new Set(paths).size).toBe(paths.length);
// 3. Exactly `merged` records disappeared — nothing else was lost.
expect(after.artifacts.length).toBe(before.artifacts.length - merged);
// 4. No version event was dropped anywhere in the sidecar.
const count = (s: ProjectSidecar) => new Set(s.artifacts.flatMap((a) => a.versions.map((v) => v.id))).size;
expect(count(after)).toBe(count(before));
// 5. The out-of-root Windows records survived as externals.
expect(after.artifacts.some((a) => a.kind === 'external' && a.absolutePath?.includes('AppData/Local/Temp'))).toBe(true);
// 6. Running it again is a true no-op — this is the production run-once gate.
expect(migrateRelativeExternals(after, ROOT).reclassified).toBe(0);
```

Invariant 4 is the one that matters most — it is the difference between a merge and a data loss. Invariant 6 is the one production depends on: with no `$schema` marker, an idempotency failure means the app rewrites the sidecar on every project open forever. Delete the scratch file before committing.

Note what invariant 1 no longer asserts: that every *external* holds an absolute path. It doesn't, and shouldn't — the `..`-escaping records deliberately stay external with a relative string. Task 2's guard is what keeps those from resolving against the process cwd.

- [ ] **Hand the visual check to Destin.** Per the workspace rule, do not build a scripted rig. Ask him to open a dev instance (`bash scripts/run-dev.sh <worktree> --label "Artifact Path Fix"`), open Project View on `youcoded-dev` **and** the Session Drawer on a session that touched them, and confirm that `flappy-bird/play.html`, `ROADMAP.md`, and `docs/MAP.md` now open instead of showing "no longer on disk". Note for him: the first open triggers the migration and writes `.youcoded/artifacts.json.pre-migration.bak` next to the sidecar — expected, not a bug, and it is written once ever.

## Follow-ups to capture in ROADMAP.md

- **Kotlin `detectOrphan` pruning** — `chore`, tagged `#android`. Dead code with test-only callers; desktop twin already removed (`project-manager.ts:84-88`).
- **Android does not run the migration** — `bug`, tagged `#android`, low priority. A project opened only ever on Android keeps showing the legacy false orphans. Closes the first time that project is opened on desktop.
- **`..`-escaping records are refused, not repaired** — `bug`, low priority. `resolveP` is `path.resolve(cwd, p)`, so `../other/notes.md` really did write outside the project; the record keeps a relative `absolutePath` and is consistently orphaned everywhere. Folding `..` segments against the root in pure string code would let those resolve to their real absolute location.
- **The migration's collision map compares raw paths** — `chore`, low priority. Everything else in the artifact layer compares through `canonicalize()` on both sides (`visible-artifacts.ts:46-55`). A case-differing pair could dodge the merge on Windows and leave two internal records at "the same" path.
