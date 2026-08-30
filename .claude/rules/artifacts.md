---
paths:
  - "youcoded/desktop/src/main/artifacts/**"
  - "youcoded/desktop/src/renderer/components/project-view/**"
  - "youcoded/desktop/src/renderer/components/SessionDrawer.tsx"
  - "youcoded/desktop/src/renderer/components/artifact-views/**"
  - "youcoded/desktop/src/renderer/state/artifact-tracker.ts"
  - "youcoded/desktop/src/renderer/state/artifact-tool-use-tracker.ts"
  - "youcoded/desktop/src/renderer/state/ArtifactContext.tsx"
  - "youcoded/desktop/src/shared/artifacts/**"
last_verified: 2026-08-30
verify:
  - test: youcoded/desktop/tests/artifacts/artifact-tool-use-tracker.test.ts
  - path: youcoded/desktop/src/main/artifacts/artifact-store.ts
    contains: "appendVersionsDirect"
  - path: youcoded/desktop/src/main/artifacts/read-binary-access.ts
  - path: youcoded/desktop/src/main/artifacts/visible-artifacts.ts
  - path: youcoded/desktop/src/main/artifacts/import-file.ts
    contains: "MOVE_SOURCE_NOT_REMOVED"
  - test: youcoded/desktop/tests/artifacts/import-file.test.ts
  - test: youcoded/desktop/tests/session-drawer-deleted-toggle.test.tsx
  - test: youcoded/desktop/tests/project-view-default-selection.test.ts
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
  - test: youcoded/desktop/tests/missing-artifacts-cache.test.tsx
  - test: youcoded/desktop/tests/session-drawer-settle-hold.test.tsx
  - path: youcoded/desktop/src/renderer/hooks/useMissingArtifacts.ts
    contains: "NEVER cleared before"
  - test: youcoded/desktop/tests/deliverable-auto-open.test.ts
  - test: youcoded/desktop/tests/deliverables-card.test.tsx
  - path: youcoded/desktop/src/renderer/state/deliverable-auto-open.ts
    contains: "FRESH_WINDOW_MS"
  - path: youcoded/desktop/src/shared/artifacts/types.ts
    contains: "'delivered'"
---
# Artifact Viewer (Session Drawer + Project View)

Files Claude touches are tracked in per-project sidecars + a central index. State lives in the renderer (`ArtifactContext`/`artifact-tracker.ts`); all I/O is main-process via `window.claude.artifacts.*` IPC. **Depth + why: `youcoded/docs/artifacts.md`.**

## Concept split — guards: `visible-artifacts.test.ts`, `project-file-discovery.test.ts`
- **ONE Files tab, ONE section** (2026-07-23). In-folder artifacts are UNDIFFERENTIATED — don't badge or re-split. An `External Artifacts` section was tried and REMOVED (~95% noise); **don't re-add it** — externals live in the Session Drawer only.
- **`LIST_ALL_FILES` is NOT pure discovery** — `projectAllFiles()` UNIONS tracked internal artifacts discovery missed. Keep the union; no extension allowlist.
- **`trackedArtifacts()` is the SOLE tracked-visibility decider.** Order: manually INCLUDED → EXCLUDED hidden → internal with ≥1 non-`read` version; externals hidden unless pinned (legacy pins stay; nothing WRITES pins now). Include/exclude paths are canonical ABSOLUTE — canonicalize BOTH sides.
- **`+ Add file` IMPORTS (Move/Copy), it does not pin.** `artifacts:import-file` reuses `authorizeArtifactWrite` **without** `confirmed`; each data-safety invariant has a test. `.youcoded-import-*.part` temps are filtered from discovery AND sync `DEFAULT_IGNORES`.
- **Discovery stops at nested git repos, no extension allowlist, bounded** (caps + 1.5s, 10s cache). `discovered:true` is NEVER persisted; skip it in `checkExistence`.

## Recorded paths
- **A RELATIVE recorded path is INTERNAL** (`resolveTrackedPath` step 3, after the cross-OS remap; `..` stays external). `absolutePath` is contractually ABSOLUTE — guard **five** sites with `isAbsoluteRecorded`: `get`, `save`, `check-existence`, `countArtifacts`, `renameArtifact`.
- **`runSidecarMigration` repairs legacy records on open**, gated on `reclassified === 0`, never `$schema`; it must never throw into read handlers. **Drawer labels are SESSION-scoped.**

## Paths & counts
- **Project list = saved folders (`youcoded-folders.json`), NOT the central index.** `buildSavedFolderProjects` reuses an index entry by canonical path, else synths one whose `id` IS the path (id-as-path fallback is traversal-guarded).
- **Two single-source count helpers:** `countArtifacts` vs `countAllFiles` — don't recompute inline (282-vs-1209 drift). Badge AND drawer subtract orphans via ONE shared cwd-keyed cache (`hooks/useMissingArtifacts.ts`), never cleared before its replacement lands — per-component copies flashed deleted rows on every drawer open · depth: `youcoded/docs/artifacts.md` → Orphan detection.
- **`canonicalize()` is the sole source of truth for path equality** (TS + Kotlin, shared fixture).

## Concurrency
- **`casWrite` uses a mkdir-based lock** (bare CAS = TOCTOU data loss); central-index writers use `mutateFileUnderLock`. `appendVersion` retries CAS 5× — don't add a second loop.
- **Append path is burst-safe** (a replayed session = ~1,000 live tool events; 2026-08-15 OOM): `appendVersion` queues per project, `*Coalesced` helpers, one tracker refresh, dedupe on `(sessionId, toolUseId)`. Handlers never call `appendVersionsDirect`.
- **Every read goes through `readSidecarShared`; only mutate-and-write paths call `readSidecar`** (2026-08-27 OOM, PR #335 — 477 parsed copies of a 6.4 MB sidecar). One parsed copy per project, stat-validated, in-flight shared, seeded by a committed write, 60 s idle drop. The shared object is READ-ONLY: never mutate it. `casWrite` probes a 4 KB head for the comparand — never `JSON.parse` the whole file to read `updatedAt`. Guard: `sidecar-cache.test.ts`.

## Binary viewers & security — guards: `read-binary-access.test.ts`, `editable-path-policy.test.ts`, `write-authorization.test.ts`
- **`artifacts:read-binary` is GUARDED on BOTH platforms** (`read-binary-access.ts`; Kotlin `EditablePathPolicy.kt`): project roots + tracked externals only; secret dirs refused even inside roots; 50MB gate. Viewers load bytes via this IPC, NEVER `fetch('file://…')`.
- **`artifacts:get`/`save` enforce the D5 write boundary in MAIN and Kotlin** (ONE shared fixture; enforced on the SYMLINK-RESOLVED path): `.git`/`.youcoded`/credentials never writable; `.claude` + `.env*` need `confirmed`. The renderer only MIRRORS this. Save carries `baseMtimeMs` — reject-on-conflict.
- **All binary viewers go through the `BinaryContent` shell**; `ViewerErrorBoundary` wraps the lazy render. xlsx = **ExcelJS, not SheetJS**; formulas via `xlsx-formula.ts`.

## UI invariants
- **Filepath pills ALWAYS open the artifact viewer, NEVER Project View** — session→project→else artifactify; `findBestMatch` prefers EXACT.
- **Project View re-homes to the FOCUSED conversation's project on every open** — `matchProjectByPath(projects, activeSessionCwd)` → else `projects[0]`. It deliberately does NOT restore the last selection: the component never unmounts, so the old `prev`-retention made the choice sticky for the whole app run and opened you on a project you last browsed days ago. The cwd rides a REF, not an effect dep — a dep would re-home mid-browse. · guard: `project-view-default-selection.test.ts`.
- **Drawer state is per-session keyed by `sessionId`**; layout-level, not an overlay. Status glyphs (`●◐○`) BANNED — plain words. `.youcoded/` auto-gitignored.
- **`showDeletedArtifacts` is SESSION-DRAWER-ONLY — deliberate** (a deleted record is a tombstone, not a recovery path). Cross-device-SYNCED preference — don't delete the "unused" flag · guard: `session-drawer-deleted-toggle.test.tsx`.
- **`EXCLUDE` has NO renderer caller** (kept for legacy round-trip + rule 2). In-folder files can't be excluded.
- **Android `get`/`save`/`read-binary` are REAL (SessionService.kt), NOT stubs — mirror any new desktop guard in Kotlin.** List/project/check-existence stubs return `not-implemented-on-mobile` — that's the contract; `project:*` is desktop-only. Parity: `ipc-channels.test.ts`.
