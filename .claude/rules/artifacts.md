---
paths:
  - "youcoded/desktop/src/main/artifacts/**"
  - "youcoded/desktop/src/renderer/components/project-view/**"
  - "youcoded/desktop/src/renderer/components/SessionDrawer.tsx"
  - "youcoded/desktop/src/renderer/components/artifact-views/**"
  - "youcoded/desktop/src/renderer/state/artifact-tracker.ts"
  - "youcoded/desktop/src/renderer/state/ArtifactContext.tsx"
  - "youcoded/desktop/src/shared/artifacts/**"
last_verified: 2026-07-24
verify:
  - path: youcoded/desktop/src/main/artifacts/read-binary-access.ts
  - path: youcoded/desktop/src/main/artifacts/visible-artifacts.ts
  - path: youcoded/desktop/src/main/artifacts/import-file.ts
    contains: "MOVE_SOURCE_NOT_REMOVED"
  - test: youcoded/desktop/tests/artifacts/import-file.test.ts
  - test: youcoded/desktop/tests/session-drawer-deleted-toggle.test.tsx
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
- **ONE Files tab, ONE section (merged 2026-07-23 — the Artifacts tab is gone).** `Project Files` = the folder on disk (`LIST_ALL_FILES`). **In-folder artifacts are deliberately UNDIFFERENTIATED** — the disk is the truth; don't badge or re-split them. An `External Artifacts` section was tried the same day and REMOVED (~95% incidental noise); **don't re-add it** — externals live in the **Session Drawer** (`LIST_SESSION`), never Project View.
- **`LIST_ALL_FILES` is NOT pure discovery.** Callee `projectAllFiles()` UNIONS tracked **internal** artifacts that exist on disk but discovery didn't reach (skipped nested sub-repo), so Project Files is a superset of in-folder tracked files. Keep the union; no extension allowlist. (`ipc-handlers.ts` said "pure discovery, independent of the sidecar" until 2026-07-23 — wrong.)
- **`trackedArtifacts()` (`visible-artifacts.ts`) is the SOLE tracked-visibility decider.** Order: manually INCLUDED (any kind) → manually EXCLUDED hidden → **internal with ≥1 non-`read` version; externals hidden unless pinned**. (Rule 4 was briefly flipped 2026-07-23 to show unpinned externals, reverted with the section.) Rule 1 keeps LEGACY pins visible on upgrade; nothing WRITES pins now (`+ Add file` imports, `INCLUDE_EXTERNAL` has no caller). Pill-click `read`-only views don't appear. Include/exclude paths are canonical ABSOLUTE (canonicalize BOTH sides — Windows drive-case bug).
- **`+ Add file` IMPORTS (Move/Copy into the browsed folder), it does not pin.** `artifacts:import-file` (`artifacts/import-file.ts`) reuses `authorizeArtifactWrite` **without** `confirmed` (`.claude/`/dotenv destinations REFUSED). Data-safety invariants (each pinned by a test, full list in the depth doc): never silent-overwrite, self-import guard, copy→verify→unlink for move, temp-then-rename for replace, `{ force: true }` on the collision `listAllFiles` scan. `.youcoded-import-*.part` temps are filtered from discovery AND sync `DEFAULT_IGNORES`.
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
- **`showDeletedArtifacts` is SESSION-DRAWER-ONLY — the asymmetry is deliberate.** Project View dropped it 2026-07-23 (`VersionEvent` has no content field → a deleted record is a tombstone, not a recovery path); the drawer keeps it because seeing everything Claude did in a session, deletions included, is that view's purpose. Cross-device-SYNCED preference (`persistAppearance`), so deleting the "now-unused" flag drops a real setting. · guard: `session-drawer-deleted-toggle.test.tsx`.
- **`EXCLUDE` (`manualExcludes` write) has NO renderer caller** (the button went with the External Artifacts section). Handler kept for legacy round-trip + rule 2. In-folder files can't be excluded at all — hiding a file the user sees in their file manager would be a lie.
- **Android `get`/`save`/`read-binary` are REAL implementations (SessionService.kt), NOT stubs — any new guard on the desktop handlers must be mirrored in Kotlin** (the 2026-07-22 lesson: Kotlin save wrote `absolutePath!!` unchecked while desktop grew a boundary). List/project stubs still return `{ok:false,error:'not-implemented-on-mobile'}` — that's the contract. `project:*` IPC is desktop-only (context read/write allow-listed to discovered set). Parity pinned by `ipc-channels.test.ts`.
