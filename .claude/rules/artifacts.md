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

Files Claude touches are tracked in per-project sidecars + a central index. State lives in the renderer (`ArtifactContext`/`artifact-tracker.ts`); all I/O is main-process via `window.claude.artifacts.*` IPC. **Depth + why per bullet: `youcoded/docs/artifacts.md`.**

## Concept split — guards: `visible-artifacts.test.ts`, `project-file-discovery.test.ts`
- **ONE Files tab, ONE section (merged 2026-07-23 — the Artifacts tab is gone).** `Project Files` = the folder on disk; **in-folder artifacts are deliberately UNDIFFERENTIATED** — don't badge or re-split them. An `External Artifacts` section was tried and REMOVED (~95% incidental noise); **don't re-add it** — externals live in the **Session Drawer** (`LIST_SESSION`), never Project View.
- **`LIST_ALL_FILES` is NOT pure discovery** — `projectAllFiles()` UNIONS tracked internal artifacts discovery didn't reach. Keep the union; no extension allowlist.
- **`trackedArtifacts()` (`visible-artifacts.ts`) is the SOLE tracked-visibility decider.** Order: manually INCLUDED → manually EXCLUDED hidden → internal with ≥1 non-`read` version; externals hidden unless pinned (LEGACY pins stay visible; nothing WRITES pins now). Include/exclude paths are canonical ABSOLUTE (canonicalize BOTH sides).
- **`+ Add file` IMPORTS (Move/Copy into the browsed folder), it does not pin.** `artifacts:import-file` reuses `authorizeArtifactWrite` **without** `confirmed`. Data-safety invariants (never silent-overwrite, self-import guard, copy→verify→unlink, temp-then-rename, `{ force: true }` collision scan) each pinned by a test. `.youcoded-import-*.part` temps are filtered from discovery AND sync `DEFAULT_IGNORES`.
- **Discovery stops at nested git repos, has NO extension allowlist, is bounded** (caps + 1.5s budget, 10s cache). `discovered:true` is NEVER persisted; consumers skip it in `checkExistence`.

## Paths & counts
- **Project list = saved folders (`youcoded-folders.json`), NOT the central index.** `buildSavedFolderProjects` reuses an index entry by canonical path, else synths one whose `id` IS the path (id-as-path fallback is traversal-guarded).
- **Two single-source count helpers in `ipc-handlers.ts`:** `countArtifacts` vs `countAllFiles`. Don't recompute inline (the 282-vs-1209 drift). The badge subtracts orphans via `checkExistence`.
- **`canonicalize()` is the single source of truth for path equality** (TS + Kotlin `PathCanonicalize.kt`, shared fixture).

## Concurrency
- **`casWrite` uses a mkdir-based lock** (bare CAS = TOCTOU data loss). **Central-index writers use `mutateFileUnderLock`** (dev + built app share `~/.claude`). `appendVersion` retries CAS 5× — don't add a second loop.

## Binary viewers & security — guards: `read-binary-access.test.ts`, `editable-path-policy.test.ts`, `write-authorization.test.ts`
- **`artifacts:read-binary` is GUARDED on BOTH platforms** (`read-binary-access.ts`; Kotlin `EditablePathPolicy.kt`): reads restricted to project roots + tracked externals; secret dirs refused even inside roots; 50MB gate. Viewers load bytes via this IPC (base64), NEVER `fetch('file://…')`.
- **`artifacts:get`/`save` enforce the D5 write boundary in MAIN and Kotlin** (ONE shared fixture; enforcement runs on the SYMLINK-RESOLVED path): `.git`/`.youcoded`/credentials never writable; `.claude` + `.env*` need `confirmed`. The renderer only MIRRORS this. Save carries `baseMtimeMs` — reject-on-conflict, never silent last-write-wins.
- **All binary viewers go through the `BinaryContent` shell**; `ViewerErrorBoundary` wraps the lazy render. xlsx = **ExcelJS, not SheetJS**; formulas evaluated (`xlsx-formula.ts`).

## UI invariants
- **Filepath pills ALWAYS open the artifact viewer, NEVER Project View** — session→project→else artifactify; `findBestMatch` prefers EXACT over suffix.
- **Drawer state is per-session keyed by `sessionId`**; the drawer is layout-level, not an overlay. Status glyphs (`●◐○`) are BANNED — plain words. `.youcoded/` is auto-gitignored.
- **`showDeletedArtifacts` is SESSION-DRAWER-ONLY — the asymmetry is deliberate** (a deleted record is a tombstone, not a recovery path; the drawer is an activity log). Cross-device-SYNCED preference — don't delete the "unused" flag · guard: `session-drawer-deleted-toggle.test.tsx`.
- **`EXCLUDE` has NO renderer caller** (kept for legacy round-trip + rule 2). In-folder files can't be excluded at all.
- **Android `get`/`save`/`read-binary` are REAL (SessionService.kt), NOT stubs — mirror any new desktop guard in Kotlin** (the 2026-07-22 lesson). List/project stubs return `not-implemented-on-mobile` — that's the contract; `project:*` IPC is desktop-only. Parity pinned by `ipc-channels.test.ts`.
