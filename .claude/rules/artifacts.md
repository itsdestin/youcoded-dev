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
  - test: youcoded/desktop/tests/artifacts/sidecar-cache.test.ts
  - test: youcoded/desktop/tests/project-file-discovery.test.ts
  - test: youcoded/desktop/tests/artifacts/editable-path-policy.test.ts
  - test: youcoded/desktop/tests/artifacts/write-authorization.test.ts
---
# Artifact Viewer (Session Drawer + Project View)

Per-project sidecars + a central index track every file Claude touches; I/O is main-process via `window.claude.artifacts.*`. **Depth: `youcoded/docs/artifacts.md`; guards = frontmatter `verify:` tests.**

## Concept split
- **ONE Files tab, ONE section** (2026-07-23). In-folder artifacts are UNDIFFERENTIATED — never badge or re-split. An `External Artifacts` section was REMOVED (~95% noise); **never re-add it**.
- **`LIST_ALL_FILES` is NOT pure discovery** — `projectAllFiles()` UNIONS tracked internal artifacts discovery missed. Keep the union; no allowlist.
- **`trackedArtifacts()` is the SOLE tracked-visibility decider.** Order: INCLUDED → EXCLUDED hidden → internal with ≥1 non-`read` version; externals hidden unless pinned. Include/exclude paths are canonical ABSOLUTE — canonicalize BOTH sides.
- **`+ Add file` IMPORTS (Move/Copy), it does not pin.** It reuses `authorizeArtifactWrite` **without** `confirmed`; `.youcoded-import-*.part` temps are filtered from discovery AND sync `DEFAULT_IGNORES`.
- **Discovery stops at nested git repos**, is bounded (caps + 1.5s, 10s cache), and never persists `discovered:true` — skip those in `checkExistence`.

## Recorded paths
- **A RELATIVE recorded path is INTERNAL** (`resolveTrackedPath` step 3; `..` stays external). `absolutePath` is contractually ABSOLUTE — `isAbsoluteRecorded` guards **five** sites: `get`, `save`, `check-existence`, `countArtifacts`, `renameArtifact`.
- **`runSidecarMigration` repairs legacy records on open**, gated on `reclassified === 0`, never `$schema`; it must never throw into a read handler.
- **`canonicalize()` is the sole source of truth for path equality** (TS + Kotlin, one fixture).

## Paths & counts
- **Project list = saved folders (`youcoded-folders.json`), NOT the central index.** `buildSavedFolderProjects` reuses an index entry by canonical path, else synths one whose `id` IS the path (traversal-guarded).
- **Two single-source count helpers:** `countArtifacts` vs `countAllFiles` — never recompute inline (282-vs-1209 drift). Both subtract orphans via ONE cwd-keyed cache (`useMissingArtifacts.ts`), never cleared before its replacement lands.

## Concurrency
- **`casWrite` uses a mkdir-based lock** (bare CAS = TOCTOU data loss); central-index writers use `mutateFileUnderLock`. `appendVersion` retries CAS 5× — never add a second loop.
- **Append path is burst-safe** (a replay = ~1,000 tool events; 2026-08-15 OOM): per-project queue, `*Coalesced` helpers, one tracker refresh, dedupe on `(sessionId, toolUseId)`. Never call `appendVersionsDirect` from a handler.
- **Every read goes through `readSidecarShared`; only mutate-and-write paths call `readSidecar`** — 477 parsed copies of one 6.4 MB sidecar OOM'd the app (2026-08-27, PR #335). ONE parsed copy per project, **READ-ONLY**; `casWrite` head-probes 4 KB.

## Binary viewers & security
- **`artifacts:read-binary` is GUARDED on BOTH platforms** (`read-binary-access.ts`, Kotlin `EditablePathPolicy.kt`): project roots + tracked externals only; secret dirs refused even inside roots; 50MB gate. Viewers use it, never `fetch('file://…')`.
- **`artifacts:get`/`save` enforce the D5 write boundary in MAIN and Kotlin** (ONE fixture, SYMLINK-RESOLVED): `.git`/`.youcoded`/credentials never writable; `.claude` + `.env*` need `confirmed`; the renderer only MIRRORS it. Save carries `baseMtimeMs`.
- **All binary viewers go through the `BinaryContent` shell**; `ViewerErrorBoundary` wraps the render. xlsx = **ExcelJS, not SheetJS**.

## UI invariants
- **Filepath pills ALWAYS open the artifact viewer, NEVER Project View** — session→project→else artifactify; `findBestMatch` prefers EXACT.
- **Project View re-homes to the FOCUSED conversation's project on every open** — `matchProjectByPath(projects, activeSessionCwd)` → else `projects[0]`. It deliberately does NOT restore the last selection (the component never unmounts, so retention went sticky all run); cwd rides a REF, never a dep.
- **Drawer state is per-session keyed by `sessionId`**, labels SESSION-scoped; layout-level, not an overlay. Status glyphs (`●◐○`) BANNED. `.youcoded/` auto-gitignored.
- **`showDeletedArtifacts` is SESSION-DRAWER-ONLY — deliberate** (a tombstone, not a recovery path). Cross-device-SYNCED — don't delete the "unused" flag.
- **`EXCLUDE` has NO renderer caller** (legacy round-trip only); in-folder files can't be excluded.
- **Android `get`/`save`/`read-binary` are REAL (SessionService.kt), NOT stubs — mirror any new desktop guard in Kotlin.** List/project/check-existence return `not-implemented-on-mobile`; `project:*` is desktop-only.
