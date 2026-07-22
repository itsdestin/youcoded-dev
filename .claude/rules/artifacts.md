---
paths:
  - "youcoded/desktop/src/main/artifacts/**"
  - "youcoded/desktop/src/renderer/components/project-view/**"
  - "youcoded/desktop/src/renderer/components/SessionDrawer.tsx"
  - "youcoded/desktop/src/renderer/components/artifact-views/**"
  - "youcoded/desktop/src/renderer/state/artifact-tracker.ts"
  - "youcoded/desktop/src/renderer/state/ArtifactContext.tsx"
  - "youcoded/desktop/src/shared/artifacts/**"
last_verified: 2026-07-15
verify:
  - path: youcoded/desktop/src/main/artifacts/read-binary-access.ts
  - path: youcoded/desktop/src/main/artifacts/visible-artifacts.ts
  - path: youcoded/desktop/src/main/artifacts/cas-write.ts
    contains: "mutateFileUnderLock"
  - path: youcoded/desktop/src/shared/artifacts/canonicalize.ts
  - path: youcoded/desktop/src/renderer/components/artifact-views/BinaryContent.tsx
  - test: youcoded/desktop/tests/artifacts/read-binary-access.test.ts
  - test: youcoded/desktop/tests/artifacts/visible-artifacts.test.ts
  - test: youcoded/desktop/tests/artifacts/canonicalize.test.ts
  - test: youcoded/desktop/tests/artifacts/cas-write.test.ts
  - test: youcoded/desktop/tests/ipc-channels.test.ts
---

# Artifact Viewer (Session Drawer + Project View)

Files Claude touches are tracked in per-project sidecars + a central index and rendered in the Session Drawer and Project View. State lives in the renderer (`ArtifactContext`/`artifact-tracker.ts`); all I/O is main-process via `window.claude.artifacts.*` IPC (same split as the chat reducer). **Full depth: `youcoded/docs/artifacts.md`.**

## Concept split — guard: `visible-artifacts.test.ts`, `project-file-discovery.test.ts`
- **Artifacts vs All files are TWO concepts; All files is ALWAYS a superset.** Artifacts = files Claude created/edited (sidecar-tracked, internal or manually-included-external). All files = every real file on disk. `LIST_PROJECT` returns tracked ONLY; `LIST_ALL_FILES` = discovery UNIONed with tracked-on-disk artifacts (so it can't report fewer than Artifacts). Don't merge them, add an extension allowlist to discovery, or drop the union.
- **`trackedArtifacts()` (`visible-artifacts.ts`) is the SOLE Artifacts-tab visibility decider.** Includes WIN over excludes ("+ Add file" recovers a mistaken exclude); `manualExcludes` MUST stay wired (shipped inert once); internal with ≥1 non-`read` version = Claude's work; pill-click `read`-only views don't appear. Include/exclude paths are canonical ABSOLUTE (canonicalize BOTH sides — Windows drive-case bug).
- **Discovery (`project-file-discovery.ts`) stops at nested git repos, has NO extension allowlist, is bounded** (file/dir/depth caps + 1.5s budget, 10s cache). The nested-repo stop makes the count DETERMINISTIC. `discovered:true` is NEVER persisted — consumers skip it in `checkExistence` (relative ids, not sidecar ids).

## Paths & counts
- **Project list = saved folders (`youcoded-folders.json`), NOT the central index.** `buildSavedFolderProjects` reuses an index entry by canonical path, else makes a synth whose `id` IS the canonical path (`LIST_PROJECT`/`GET`/`SAVE` fall back to id-as-path, traversal-guarded). "Add a project" = `dialog.openFolder`→`folders.add`.
- **Two single-source count helpers in `ipc-handlers.ts`:** `countArtifacts` (non-deleted tracked files still on disk — orphans excluded) vs `countAllFiles` (discovery length). Don't recompute inline (caused the 282-vs-1209 drift). HeaderBar badge subtracts orphans via `checkExistence`.
- **`canonicalize()` is the single source of truth for path equality** (TS `shared/artifacts/canonicalize.ts` + Kotlin `PathCanonicalize.kt`, shared fixture). Bypassing it is the usual "path didn't match" cause.

## Concurrency
- **`casWrite` uses a mkdir-based lock** (not bare CAS — TOCTOU double-rename data loss). **Central-index writers use `mutateFileUnderLock`** (read-modify-write inside the lock; dev + built app share `~/.claude`). `appendVersion` retries CAS 5× — don't add a second loop.

## Binary viewers & security — guard: `read-binary-access.test.ts`, `editable-path-policy.test.ts`, `write-authorization.test.ts`, `ipc-channels.test.ts`
- **`artifacts:read-binary` is GUARDED on BOTH platforms** (desktop `read-binary-access.ts`; Kotlin ports the sensitive deny + 50MB gate via `EditablePathPolicy.kt`, 2026-07-22): reads restricted to project roots + tracked externals, well-known secret dirs refused even inside roots. Don't bypass. Binary viewers load bytes via this IPC (base64) — NEVER `fetch('file://…')`.
- **`artifacts:get`/`save` enforce the D5 write boundary in MAIN and Kotlin** (`shared/artifacts/editable-path-policy.ts` + `EditablePathPolicy.kt`, ONE shared fixture; enforcement in `write-authorization.ts` runs on the SYMLINK-RESOLVED path): `.git`/`.youcoded`/credential paths never writable, `.claude` + `.env*` need the `confirmed` flag, everything else free. The renderer only MIRRORS this to hide the Edit affordance — never treat a renderer check as the boundary. Save also carries an mtime token (`baseMtimeMs`) — reject-on-conflict, never silent last-write-wins.
- **All binary viewers go through the `BinaryContent` shell** (owns loading/error, keys inner viewer by path); `ViewerErrorBoundary` wraps the lazy render (chunk-load throws escape `<Suspense>`). xlsx = **ExcelJS, not SheetJS**; formulas evaluated (`xlsx-formula.ts`, IF short-circuits, /0 → blank).

## UI invariants
- **Filepath pills ALWAYS open the artifact viewer, NEVER Project View** — resolve session→project→else artifactify (`appendVersion` `read`); `findBestMatch` prefers EXACT over suffix.
- **Drawer state is per-session keyed by `sessionId`**; drawer is layout-level (don't wrap in `<OverlayPanel>`). `ActiveArtifactView` is shared by SessionDrawer + ProjectView. Status glyphs (`●◐○`) are BANNED — plain words. `.youcoded/` is auto-gitignored.
- **Android `get`/`save`/`read-binary` are REAL implementations (SessionService.kt), NOT stubs — any new guard on the desktop handlers must be mirrored in Kotlin** (the 2026-07-22 lesson: Kotlin save wrote `absolutePath!!` unchecked while desktop grew a boundary). List/project stubs still return `{ok:false,error:'not-implemented-on-mobile'}` — that's the contract.** `project:*` IPC is desktop-only (context read/write allow-listed to discovered set). Parity pinned by `ipc-channels.test.ts`.
