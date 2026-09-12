---
paths:
  - "**/desktop/src/main/artifacts/**"
  - "**/desktop/src/renderer/components/project-view/**"
  - "**/desktop/src/renderer/components/SessionDrawer.tsx"
  - "**/desktop/src/renderer/components/artifact-views/**"
  - "**/desktop/src/renderer/state/artifact-tracker.ts"
  - "**/desktop/src/renderer/state/artifact-tool-use-tracker.ts"
  - "**/desktop/src/renderer/state/ArtifactContext.tsx"
  - "**/desktop/src/renderer/hooks/useMissingArtifacts.ts"
  - "**/desktop/src/shared/artifacts/**"
last_verified: 2026-09-11
verify:
  - test: youcoded/desktop/tests/artifacts/artifact-tool-use-tracker.test.ts
  - test: youcoded/desktop/tests/artifacts/relocate-missing.test.ts
  - test: youcoded/desktop/tests/artifacts/external-record-identity.test.ts
  - test: youcoded/desktop/tests/session-drawer-missing-labels.test.tsx
  - test: youcoded/desktop/tests/artifact-draft-survives-disk-change.test.tsx
  - test: youcoded/desktop/tests/artifacts-encoding.test.ts
  - test: youcoded/desktop/tests/artifacts-save-write-failure.test.ts
  - test: youcoded/desktop/tests/artifacts-read-binary-symlink.test.ts
  - path: youcoded/desktop/src/main/artifacts/relocate-missing.ts
    contains: "MIN_AGREEING_SEGMENTS"
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

Per-project sidecars + a central index track every file Claude touches; I/O is main-process via `window.claude.artifacts.*`. **Depth: `youcoded/docs/artifacts.md`.**

## Concept split
- **ONE Files tab, ONE section** (2026-07-23): in-folder artifacts are UNDIFFERENTIATED — never badge, re-split, or re-add the removed `External Artifacts` section.
- **`LIST_ALL_FILES` is NOT pure discovery** — `projectAllFiles()` UNIONS tracked internals; keep the union, no allowlist.
- **`trackedArtifacts()` is the SOLE tracked-visibility decider:** INCLUDED → EXCLUDED hidden → internal with ≥1 non-`read` version; externals hidden unless pinned. Include/exclude paths are canonical ABSOLUTE — canonicalize BOTH sides.
- **`+ Add file` IMPORTS (Move/Copy), it does not pin** — `authorizeArtifactWrite` without `confirmed`; `.youcoded-import-*.part` temps are filtered from discovery and sync.
- **Discovery stops at nested git repos**, is bounded, never persists `discovered:true` — skip those in `checkExistence`.

## Records & recorded paths
- **A tracked call is recorded on its RESULT, never the call** — the transcript writes the call before the tool runs, so new files read "deleted" and denied edits counted as changes.
- **Identity is WHERE the file is:** internals by `path`, externals by canonical `absolutePath` (TS + Kotlin).
- **A missing INTERNAL record is relocated once** (`relocate-missing.ts`, in `LIST_SESSION`): name + 2 folders agree, exactly one candidate, else nothing. Never externals or deletes.
- **A RELATIVE recorded path is INTERNAL** (`resolveTrackedPath` step 3; `..` stays external). `absolutePath` is contractually ABSOLUTE — `isAbsoluteRecorded` guards five sites: `get`, `save`, `check-existence`, `countArtifacts`, `renameArtifact`.
- **`runSidecarMigration` repairs legacy records on open**, gated on `reclassified === 0`, never `$schema`; never throws into a read handler.
- **`canonicalize()` is the sole source of truth for path equality** (TS + Kotlin, one fixture).
- **Project list = saved folders, NOT the index; `countArtifacts` (drops orphans) and `countAllFiles` (discovery) are the only counters** — never recompute inline.

## Concurrency — each cost an OOM or a lost record; incidents in the depth doc
- **`casWrite` locks with mkdir** (bare CAS = data loss); index writers use `mutateFileUnderLock`; `appendVersion` retries CAS 5× — never add a second loop.
- **Appends are queued per project** and deduped on `(sessionId, toolUseId)`; never call `appendVersionsDirect` from a handler.
- **Every read goes through `readSidecarShared`** — ONE parsed copy per project, **READ-ONLY**; only mutate-and-write paths call `readSidecar`.

## Reading & writing files
- **`read-binary` is GUARDED on BOTH platforms and SYMLINK-RESOLVED before the verdict** (target, roots, tracked paths): project roots + tracked externals only, secret dirs refused inside roots, 50MB gate.
- **`get`/`save` enforce the D5 boundary in MAIN and Kotlin** (ONE fixture, symlink-resolved): `.git`/`.youcoded`/credentials never writable, `.claude` + `.env*` need `confirmed`, the renderer only MIRRORS it. Save carries `baseMtimeMs`.
- **A failed write ANSWERS `{ok:false, error:'write-failed', code}`, never throws**; name a cause only for an unambiguous code. **Non-UTF-8 text is SHOW-ONLY**: `get` flags `notUtf8`, `save` refuses `not-utf8`.
- **All binary viewers go through `BinaryContent`**; `ViewerErrorBoundary` wraps the render. xlsx = **ExcelJS, not SheetJS**.

## UI invariants
- **Filepath pills ALWAYS open the artifact viewer, NEVER Project View** — session→project→else artifactify; `findBestMatch` prefers EXACT.
- **Drawer state is per-session keyed by `sessionId`**, labels SESSION-scoped; layout-level, not an overlay. Status glyphs BANNED.
- **"deleted" is ONLY a record whose last event is a delete; anything the check cannot find is "not found"**, and the empty list names its reason. The verdict re-checks on `artifacts:changed`; an older answer never overwrites a newer one.
- **`showDeletedArtifacts` is SESSION-DRAWER-ONLY and cross-device-SYNCED** — don't delete the "unused" flag; its chip reads "Show missing".
- **Android `get`/`save`/`read-binary` are REAL, NOT stubs — mirror every new desktop guard in Kotlin.** List/project/import/search/watch are `not-implemented-on-mobile`; `check-existence` stubs "nothing missing".
