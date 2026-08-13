---
paths:
  - "youcoded/desktop/src/main/artifacts/**"
  - "youcoded/desktop/src/renderer/components/project-view/**"
  - "youcoded/desktop/src/renderer/components/SessionDrawer.tsx"
  - "youcoded/desktop/src/renderer/components/artifact-views/**"
  - "youcoded/desktop/src/renderer/state/artifact-tracker.ts"
  - "youcoded/desktop/src/renderer/state/ArtifactContext.tsx"
  - "youcoded/desktop/src/shared/artifacts/**"
last_verified: 2026-08-13
verify:
  - path: youcoded/desktop/src/main/artifacts/read-binary-access.ts
  - path: youcoded/desktop/src/main/artifacts/visible-artifacts.ts
  - path: youcoded/desktop/src/main/artifacts/import-file.ts
    contains: "MOVE_SOURCE_NOT_REMOVED"
  - test: youcoded/desktop/tests/artifacts/import-file.test.ts
  - test: youcoded/desktop/tests/session-drawer-deleted-toggle.test.tsx
  - path: youcoded/desktop/src/main/artifacts/cas-write.ts
    contains: "mutateFileUnderLock"
  - path: youcoded/desktop/src/main/artifacts/write-authorization.ts
    contains: "isAbsoluteRecorded"
  - path: youcoded/desktop/src/shared/artifacts/migrate-relative-externals.ts
  - test: youcoded/desktop/tests/migrate-relative-externals.test.ts
  - test: youcoded/desktop/tests/session-drawer-session-scoped-labels.test.tsx
  - path: youcoded/desktop/src/shared/artifacts/canonicalize.ts
  - path: youcoded/desktop/src/renderer/components/artifact-views/BinaryContent.tsx
  - test: youcoded/desktop/tests/artifacts/read-binary-access.test.ts
  - test: youcoded/desktop/tests/artifacts/visible-artifacts.test.ts
  - test: youcoded/desktop/tests/artifacts/canonicalize.test.ts
  - test: youcoded/desktop/tests/artifacts/cas-write.test.ts
  - test: youcoded/desktop/tests/ipc-channels.test.ts
---
# Artifact Viewer (Session Drawer + Project View)

Files Claude touches are tracked in per-project sidecars + a central index. State lives in the renderer (`ArtifactContext`/`artifact-tracker.ts`); all I/O is main-process via `window.claude.artifacts.*` IPC. **Depth + why per bullet: `youcoded/docs/artifacts.md`.**

## Concept split — guards: `visible-artifacts.test.ts`, `project-file-discovery.test.ts`
- **ONE Files tab, ONE section** (2026-07-23; Artifacts tab gone). In-folder artifacts are deliberately UNDIFFERENTIATED — don't badge or re-split. An `External Artifacts` section was tried and REMOVED (~95% noise); **don't re-add it** — externals live in the Session Drawer only.
- **`LIST_ALL_FILES` is NOT pure discovery** — `projectAllFiles()` UNIONS tracked internal artifacts discovery didn't reach. Keep the union; no extension allowlist.
- **`trackedArtifacts()` is the SOLE tracked-visibility decider.** Order: manually INCLUDED → EXCLUDED hidden → internal with ≥1 non-`read` version; externals hidden unless pinned (legacy pins stay; nothing WRITES pins now). Include/exclude paths are canonical ABSOLUTE — canonicalize BOTH sides.
- **`+ Add file` IMPORTS (Move/Copy), it does not pin.** `artifacts:import-file` reuses `authorizeArtifactWrite` **without** `confirmed`; each data-safety invariant is pinned by a test. `.youcoded-import-*.part` temps are filtered from discovery AND sync `DEFAULT_IGNORES`.
- **Discovery stops at nested git repos, no extension allowlist, bounded** (caps + 1.5s budget, 10s cache). `discovered:true` is NEVER persisted; consumers skip it in `checkExistence`.

## Recorded paths
- **A RELATIVE recorded path is INTERNAL** (`resolveTrackedPath` step 3, after the cross-OS remap; `..` stays external). `absolutePath` is contractually ABSOLUTE — guard **five** sites with `isAbsoluteRecorded`: `get`, `save`, `check-existence`, `countArtifacts`, `renameArtifact`.
- **`runSidecarMigration` repairs legacy records on open**, gated on `reclassified === 0`, never `$schema`; never let it throw into its read handlers. **Drawer labels are SESSION-scoped.**

## Paths & counts
- **Project list = saved folders (`youcoded-folders.json`), NOT the central index.** `buildSavedFolderProjects` reuses an index entry by canonical path, else synths one whose `id` IS the path (id-as-path fallback is traversal-guarded).
- **Two single-source count helpers:** `countArtifacts` vs `countAllFiles` — don't recompute inline (the 282-vs-1209 drift). The badge subtracts orphans via `checkExistence`.
- **`canonicalize()` is the sole source of truth for path equality** (TS + Kotlin, shared fixture).

## Concurrency
- **`casWrite` uses a mkdir-based lock** (bare CAS = TOCTOU data loss); central-index writers use `mutateFileUnderLock`. `appendVersion` retries CAS 5× — don't add a second loop.

## Binary viewers & security — guards: `read-binary-access.test.ts`, `editable-path-policy.test.ts`, `write-authorization.test.ts`
- **`artifacts:read-binary` is GUARDED on BOTH platforms** (`read-binary-access.ts`; Kotlin `EditablePathPolicy.kt`): reads restricted to project roots + tracked externals; secret dirs refused even inside roots; 50MB gate. Viewers load bytes via this IPC, NEVER `fetch('file://…')`.
- **`artifacts:get`/`save` enforce the D5 write boundary in MAIN and Kotlin** (ONE shared fixture; enforced on the SYMLINK-RESOLVED path): `.git`/`.youcoded`/credentials never writable; `.claude` + `.env*` need `confirmed`. The renderer only MIRRORS this. Save carries `baseMtimeMs` — reject-on-conflict.
- **All binary viewers go through the `BinaryContent` shell**; `ViewerErrorBoundary` wraps the lazy render. xlsx = **ExcelJS, not SheetJS**; formulas evaluated (`xlsx-formula.ts`).

## UI invariants
- **Filepath pills ALWAYS open the artifact viewer, NEVER Project View** — session→project→else artifactify; `findBestMatch` prefers EXACT over suffix.
- **Drawer state is per-session keyed by `sessionId`**; layout-level, not an overlay. Status glyphs (`●◐○`) BANNED — plain words. `.youcoded/` is auto-gitignored.
- **`showDeletedArtifacts` is SESSION-DRAWER-ONLY — deliberate asymmetry** (a deleted record is a tombstone, not a recovery path). Cross-device-SYNCED preference — don't delete the "unused" flag · guard: `session-drawer-deleted-toggle.test.tsx`.
- **`EXCLUDE` has NO renderer caller** (kept for legacy round-trip + rule 2). In-folder files can't be excluded at all.
- **Android `get`/`save`/`read-binary` are REAL (SessionService.kt), NOT stubs — mirror any new desktop guard in Kotlin** (2026-07-22 and again 2026-08-13). List/project/check-existence stubs return `not-implemented-on-mobile` — that's the contract; `project:*` is desktop-only. Parity pinned by `ipc-channels.test.ts`.
