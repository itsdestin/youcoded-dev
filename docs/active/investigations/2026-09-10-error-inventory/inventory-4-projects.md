# Error-handling inventory 4: projects, files, git, menus

Read-only audit of today's code. Base for every path below:
`/home/destin/youcoded-dev/worktrees/sessions/error-states-unit-b/youcoded/desktop/src/`
(`app/…` paths are `/home/destin/youcoded-dev/worktrees/sessions/error-states-unit-b/youcoded/app/…`).
Every backend claim was followed renderer → `main/preload.ts` → the `main/` handler.
Line numbers are from the worktree on 2026-09-10. The 2026-09-08 audit was not used.

**Totals:** severity 1: **3** · severity 2: **12** · severity 3: **21** · intentional fallbacks (no defect): **17**

`plainMessage()` (`renderer/utils/ipc-error.ts`) strips the Electron `Error invoking remote method '…': Error:` wrapper, but the preload does not. A row is flagged RAW only where the caller does not use `plainMessage`.

---

## Ledger

| # | file:line | What the user sees | Trigger | Kind | Defects | Sev | Fix |
|---|---|---|---|---|---|---|---|
| 1 | renderer/components/artifact-views/ActiveArtifactView.tsx:291-301, :325 → main/artifacts/write-authorization.ts:143 (Android: app/…/SessionService.kt:3806) | The editor opens normally. Save succeeds with no banner, even when someone else changed the file after it was opened. Their newer edit is overwritten, and "This file changed on disk while you were editing." never appears. | The edit-start read that fetches the file's modification time rejects, returns `ok:false`, or returns `orphan`. Also: Save pressed before that read lands, or a restored draft carrying no token. | uncertain-mutation | FALSE, SILENT (evidence below) | **1** | Treat "no token" as unsafe: wait for the edit-start read before enabling edit, seed the token from the initial read, or confirm "Couldn't check for newer changes — save anyway?" |
| 2 | renderer/hooks/useOpenFilepath.ts:61, :79, :131, :150 (shown by SessionDrawer.tsx:666-668) | "Couldn’t open notes.md — the file wasn’t found in this project." | Clicking a file pill or a sent-file card when the bridge call rejects (`catch { failed(); }`), the session has no known folder, the path is a `~/` path the renderer can't expand, or the session re-list returns `ok:false`. | app-side/unknown | FALSE (evidence below), DEADEND | **1** | Keep "wasn't found" only for a real miss; use a general error with Retry and Report bug on catch, and say "couldn't locate this path" for `~/` paths and a missing folder. |
| 3 | renderer/components/CloseSessionPrompt.tsx:157-177 → main/ipc-handlers.ts:4160; applied at renderer/App.tsx:3926 | The close-conversation prompt shows no note and no tags, as if none exist. If the user types a note it **replaces** the existing note they were never shown. | `session:get-meta` store read throws (main returns blanks), or the invoke rejects (renderer blanks). | transient-read feeding uncertain-mutation | FALSE, EMPTY-AS-NONE, SILENT (evidence below) | **1** | Return and handle `{ok:false}`; on failure show "Couldn't load this conversation's note and tags" and disable the note field (or refuse the note write). |
| 4 | renderer/components/artifact-views/ActiveArtifactView.tsx:327-329 (callers: project-view/tabs/FilesTab.tsx:966, SessionDrawer.tsx:1100, artifact-views/UnsavedChangesDialog.tsx:100) → main/ipc-handlers.ts:4896 | Nothing. Save does nothing, the editor stays open, and no banner appears. In the unsaved-changes dialog the Save button does nothing and the dialog stays up. | `artifacts:save` rejects: the handler rethrows write/rename errors (`throw e;` at :4896) and any `appendVersion` error thrown after the file was already replaced. | uncertain-mutation | SILENT. If the throw came after the rename, the file **is** saved while the pane still shows unsaved edits. The next Save then raises "This file changed on disk while you were editing.", caused by the user's own write, because the token was never refreshed. | 2 | Wrap in try/catch → `setSaveError(plainMessage(e))`. In main, report success once the rename lands and treat sidecar bookkeeping as best-effort. |
| 5 | renderer/components/artifact-views/ActiveArtifactView.tsx:257-272 | The old text stays on screen as if current. If the user is editing, no conflict banner is raised. | Refetch after an outside change rejects (no `.catch`) or returns `!res.ok`. | transient-read | SILENT | 2 | On failure show an inline "Couldn't refresh this file" with Retry. |
| 6 | renderer/components/git/GitReviewView.tsx:50-54 → main/git/git-service.ts (`fail(base, errText(diff))`), main/ipc-handlers.ts:4984 (`'unknown-project-root'`) | First load: only the header "Reviewing changes for “x”" over a blank timeline, with no commit box and no message. After Include/Commit: the previous state stays as if current. | `git:file-review` returns `ok:false` (git stderr or gate code) or rejects. `.then(r => { if (… r?.ok) setReview(r) }).catch(() => {})` | transient-read | EMPTY-AS-NONE, SILENT | 2 | Hold a `reviewError` → `<ErrorState message=… onRetry={refresh}>`. |
| 7 | renderer/components/project-view/ProjectView.tsx:313-331, :807 | "Select a project to view its artifacts." under Files/Conversations/Instructions tabs, with no project to select, no error, no retry. | `listProjectsIndex` rejects (no `.catch`) or returns `!ok`. On the phone's own bridge it **always** returns `ok:false, error:'not-implemented-on-mobile'` (app/…/SessionService.kt:3929-3931). | transient-read | EMPTY-AS-NONE, SILENT, DEADEND | 2 | Track an index error → ErrorState with Retry. On the phone, an explicit "Projects aren't available on this device yet". |
| 8 | renderer/components/project-view/ProjectView.tsx:377-394, :405-414 (rendered at tabs/ConversationsTab.tsx:41, tabs/ContextTab.tsx:105) | "No conversations in this project yet." · "No context files found for this project." · file count 0 | `project.listConversations` / `listContext` / `artifacts.listAllFiles` rejects or returns `!ok`. `!ok` results are cached for the whole open (`convCache.current.set(id, list)` with `list = []`). | transient-read | EMPTY-AS-NONE | 2 | Return `null`/an error marker instead of `[]`, don't cache failures, show ErrorState in the tab. |
| 9 | renderer/components/project-view/ConversationPreview.tsx:43-55, :115 → main/session-browser.ts:690-693 | "No messages to preview." "Open full transcript" failing (:60-73) leaves the preview unchanged with no message. | Transcript read fails. Main swallows it (`catch { return []; }` in `loadHistory`) and returns `ok:true, messages: []`. Renderer `catch` also sets `[]`. | transient-read | EMPTY-AS-NONE, SILENT | 2 | `loadHistory` returns an error distinct from "empty"; the overlay shows "Couldn't read this conversation" + Retry. |
| 10 | renderer/components/project-view/tabs/FilesTab.tsx:269-276, :316-319 | Rejected load: "Loading files…" forever. `ok:false`: "No files found in this project folder." Rejected refresh after a file change: stale list shown as current. | `artifacts.listAllFiles` rejects (no `.catch`), or returns `ok:false` (phone bridge: SessionService.kt:3925-3927 `not-implemented-on-mobile`). | transient-read | EMPTY-AS-NONE, SILENT, DEADEND | 2 | `.catch` + a load-error state rendered via ErrorState with Retry. |
| 11 | renderer/components/project-view/ProjectHero.tsx:148-163 (rename), :184-201 (description) | The edit field closes and the old name/description remains, with no message. | Sync path returns `{ok:false, error:'Sync is still starting up — try again in a moment'}` (main/sync-spaces/service.ts:495, :504) — a user-ready sentence that is thrown away. Local path: `folders.rename`/`setDescription` returns `false` on no match (main/ipc-handlers.ts:1505-1506, :1515-1516). Those compare strictly `path.resolve(f.path) === normalized`, while Project View passes the canonical path (`path: canon`, main/artifacts/saved-folder-projects.ts). FOLDERS_REMOVE's own comment (:1488-1491) says this case differs on Windows. Rejections are also `.catch(() => {})`. | uncertain-mutation | SILENT | 2 | Read the result; show `r.error` / "Couldn't rename this project" inline and keep the draft. Make rename/set-description compare like remove. |
| 12 | renderer/components/project-view/ProjectHero.tsx:208-213 | After confirming "Stop syncing" nothing tells the user it failed; the project still reads as synced. | `syncSpaces.stopProject` returns `{ok:false,…}` (service.ts:515) or rejects; `.catch(() => {})`, result ignored. | uncertain-mutation | SILENT | 2 | Surface `r.error` in the sync popover with Retry. |
| 13 | renderer/components/project-view/ProjectView.tsx:556-575 | If `folders.remove` throws, Remove appears to do nothing and the modal stays. If "Also delete .youcoded/artifacts.json" fails, the modal closes as if done. | `folders.remove` returns `false` (ignored) or throws (unhandled). `artifacts.deleteProject` returns `{ok:false, error:'project-not-found'}` for any folder with no central-index entry, whose id is its path (`id: canon`, saved-folder-projects.ts), so the sidecar is never deleted. Also `.catch(() => {})`. | uncertain-mutation | SILENT | 2 | try/catch around the removal; read both results; report "The project was removed, but its history file could not be deleted" when applicable. |
| 14 | renderer/components/project-view/ProjectView.tsx:600-677 (`computeImportCollisions`, `importFiles`, `runImport`) | Nothing: the Move/Copy dialog stays open and no result modal appears, while other files in the batch may already have been copied or moved. | Any `importFile` invoke rejects (`Promise.all` rejects as a whole), or `dialog.openFile` / collision `listAllFiles` rejects. None are wrapped. | uncertain-mutation | SILENT | 2 | `Promise.allSettled`; map a rejection to a per-file line in the existing result modal. |
| 15 | renderer/components/FolderSwitcher.tsx:71-80, :360-372 | Picker lists no folders (only "Browse for folder…"). Picking a folder that fails to save does nothing. | `folders.list` rejects (`catch {}`); `folders.add` rejects (`catch { /* no-op */ }`). | transient-read / uncertain-mutation | EMPTY-AS-NONE, SILENT | 2 | Inline FieldError "Couldn't load your folders" + Retry; show the add failure. |
| 16 | renderer/components/artifact-views/ActiveArtifactView.tsx:32-41, :546-556 | "Save failed: artifact-not-found" in a hand-built red banner with only Dismiss. | Save refused with a code other than protected-path / needs-confirm / conflict (write-authorization.ts:114, :124, :128). | user-resolvable | RAW, HANDROLLED | 3 | Plain sentence per code; use the shared callout/ErrorState. |
| 17 | renderer/components/artifact-views/ActiveArtifactView.tsx:406-409 (banner: PartialFileBanner.tsx) | Clicking "Load the whole file" does nothing. | `artifacts.get({full})` rejects (no `.catch`) or returns `!ok` (`applyDiskRead` ignores it, useArtifactContent.ts:137). | transient-read | SILENT | 3 | Inline error on the banner + retry. |
| 18 | renderer/components/artifact-views/useArtifactContent.ts:101-106, :22 | "Couldn’t read this file: Error invoking remote method 'artifacts:get': Error: EACCES: permission denied, open '/…'" (with Retry) | `artifacts:get` handler throws (non-ENOENT `throw e` at main/ipc-handlers.ts:4710, :4756). | transient-read | RAW | 3 | `plainMessage(e)`; map EACCES/EPERM to "YouCoded doesn't have permission to read this file." |
| 19 | renderer/components/artifact-views/BinaryContent.tsx:26-27 | "This image is outside your project folders and can’t be previewed." — also for files **inside** the project that sit in a protected folder. | main/ipc-handlers.ts:4807 `if (verdict !== 'allowed') return { ok: false, error: 'not-allowed' };` collapses main/artifacts/read-binary-access.ts:57 `if (isSensitivePath(canonicalPath)) return 'sensitive';` into the same code. | user-resolvable | FALSE (quoted) | 3 | Pass `sensitive` through as its own code with its own sentence. |
| 20 | renderer/components/artifact-views/BinaryContent.tsx:30-31, :47-62 | "Couldn’t open this document." Off desktop there is no button at all. | read-binary returns a raw message (`String(e?.message ?? e)`) or `'no path'`. | transient-read | VAGUE, DEADEND (phone/remote), HANDROLLED | 3 | ErrorState with Retry; name permission errors. |
| 21 | renderer/components/artifact-views/PdfView.tsx:78-82, :125; :186-198 | "Couldn’t open this PDF. It may be corrupt or password-protected." A page whose load fails stays a blank canvas. | pdf.js rejects; `parseError` holds the specific exception but the copy guesses. `pdf.getPage(index)` inside the page effect is uncaught. | intentional-fallback shape, but a guessed cause | VAGUE (guessed cause), HANDROLLED, DEADEND; SILENT for per-page | 3 | Branch on `e.name` (PasswordException vs InvalidPDFException); catch per-page failure and draw a note. |
| 22 | renderer/components/artifact-views/DocxView.tsx:28, :32; XlsxView.tsx:163-166, :183 | "Couldn’t open this document." / "Couldn’t open this spreadsheet." (also shown for a workbook with zero worksheets, which is not a failure) | mammoth / ExcelJS parse rejects; message discarded. | app-side/unknown | VAGUE, DEADEND, HANDROLLED | 3 | ErrorState general mode with Report bug; separate "This spreadsheet has no sheets." |
| 23 | renderer/components/artifact-views/ViewerErrorBoundary.tsx:30-38 | "Couldn’t display this file." + path + "Try again" | Lazy viewer chunk failed to load, or the viewer crashed while rendering. "Try again" only clears boundary state: a rejected `React.lazy` stays rejected and re-throws, and the same content re-crashes, so the button cannot recover. | app-side/unknown | HANDROLLED, DEADEND (in effect) | 3 | ErrorState general mode with Report bug / Diagnose; drop the no-op retry or remount with a fresh lazy import. |
| 24 | renderer/components/git/GitReviewView.tsx:111-129 | "Show more" does nothing. | `fileReview({logSkip})` returns `!ok` or rejects (`.catch(() => {})`). | transient-read | SILENT | 3 | Inline error + retry under the list. |
| 25 | renderer/components/git/GitReviewView.tsx:131-148, :346-350 → main/git/git-service.ts (`gitCommit`, `simpleOp`, `gitDiscard`), main/ipc-handlers.ts:4992 | Hand-built box showing git's text verbatim, e.g. "fatal: Unable to create '…/.git/index.lock': File exists.", "Author identity unknown *** Please tell me who you are…", or internal codes "unknown-project-root" / "not-a-git-repository" / "path-outside-project". A rejected invoke shows nothing (try/finally, no catch). | stage / unstage / commit / discard returns `ok:false` (discard errors arrive via discard-guard.ts → `externalError`, same slot). | user-resolvable | RAW, HANDROLLED; SILENT on rejection | 3 | Map known codes and common stderr (index.lock, identity) to plain sentences, keep stderr as detail; add `catch → plainMessage`. |
| 26 | renderer/components/git/GitReviewView.tsx:85-96, :315-317 | Git's raw error inside the expanded commit card. Collapsing and re-expanding never refetches (`if (!commitDiffs.has(sha))`, :76). | `git:commit-file-diff` returns `ok:false` (`errText`, `'invalid-sha'`, …) or rejects. | transient-read | RAW, DEADEND, HANDROLLED | 3 | Don't cache errors; ErrorState inline with Retry. |
| 27 | renderer/components/project-view/ProjectView.tsx:118-128 (via :661) | Import result modal line such as "notes.pdf — EACCES: EACCES: permission denied, copyfile '…'" | main/artifacts/import-file.ts returns `{ ok:false, error: e.code, detail: e.message }` (:182, :197, :204); everything except two codes falls through to `` `${error}: ${detail}` ``. | user-resolvable | RAW | 3 | Human wording for EACCES/ENOSPC/EXDEV, raw code as secondary detail. |
| 28 | renderer/components/project-view/ContextEditorOverlay.tsx:64-94, :155, :251-254 → main/project-context.ts:165-167 | Red paragraph such as "ENOENT: no such file or directory, open '…'" or "not-a-context-file". Header tools are hidden, so only Close remains. | `project:read-context-file` returns `{ok:false, error: String(e?.message)}`, or the invoke rejects (IPC wrapper via `e?.message`). | transient-read | RAW, DEADEND, HANDROLLED | 3 | ErrorState with Retry; `plainMessage`. |
| 29 | renderer/components/project-view/ContextEditorOverlay.tsx:98-119, :242-244 → main/project-context.ts:171-173 | Red line with a raw fs message / "not-a-context-file" / IPC wrapper text (draft is kept). | `project:write-context-file` fails. | uncertain-mutation (atomicity n/a: plain writeFile) | RAW, HANDROLLED | 3 | `plainMessage`; FieldError or ErrorState; map `not-a-context-file`. |
| 30 | renderer/components/project-view/AddProjectModal.tsx:64-66, :172, :202 → main/sync-spaces/service.ts:615 | Hand-built red line. When Sync hasn't started: "Cannot read properties of null (reading 'createProject')". | `syncSpacesCreateProject` does `roots!.createProject(name)` with no startup guard (import/rename/stop have one). | app-side/unknown | RAW, HANDROLLED | 3 | Add the same `if (!roots)` guard; use FieldError. |
| 31 | renderer/components/ImportProjectModal.tsx:79-83, :146 → main/sync-spaces/import-project.ts (`throw e;` → `String(e?.message ?? e)`) | Hand-built red line; for fs errors other than EEXIST/ENOTEMPTY/EBUSY/EPERM/EACCES, the raw Node message. Partial moves correctly become warnings. | Folder move fails with an unmapped fs error. | uncertain-mutation | RAW, HANDROLLED | 3 | Generic "The folder couldn't be moved. Nothing was changed." only where verified; FieldError. |
| 32 | renderer/components/SessionRenameDialog.tsx:63 | ErrorState (with Retry) showing "Error invoking remote method '…': Error: …" | `sessionNaming.rename` rejects; message used as `e.message`, not `plainMessage(e)`. | uncertain-mutation | RAW | 3 | `plainMessage(e, 'The name was not saved.')`. |
| 33 | renderer/components/project-view/ProjectView.tsx:535-554 | The just-added project doesn't appear or get selected until Project View is reopened. | Post-add `listProjectsIndex` rejects → `console.warn` only. | transient-read | SILENT | 3 | Keep the modal's success, then show an inline "Couldn't refresh the list" + Retry. |
| 34 | renderer/components/context-menu/build-menu.ts:124, :176, :180, :211, :212, :221, :238; project-view/tabs/FilesTab.tsx:955-958; project-view/ContextEditorOverlay.tsx:146-150 | Copy / Copy as path / Copy link does nothing and says nothing. In a remote browser over http, `navigator.clipboard?.writeText(…)` short-circuits, so "Copy path" silently never runs, and it never uses `clipboard.ts`'s fallback. | `copyText` returns `false` (ignored via `void`); clipboard unavailable. | user-resolvable | SILENT | 3 | Use `copyText` everywhere and toast "Couldn't copy" on `false`. |
| 35 | renderer/components/DeliverablesCard.tsx:98-100; project-view/ProjectHero.tsx:356, :373 | Clicking a sent link / folder path / repo link does nothing. | `shell.openExternal` / `openPath` rejects (`void`, no catch). | user-resolvable | SILENT | 3 | `.catch` → toast "Couldn't open this link." |
| 36 | renderer/components/project-view/tabs/FilesTab.tsx:395-405 | Search shows only name matches, possibly "No files match “q”." even if file contents match. | `artifacts.searchContent` returns `!ok` or rejects on desktop (settles to `[]`). | transient-read | EMPTY-AS-NONE | 3 | On desktop, a small "Couldn't search inside files" note under the results. |

### Intentional fallbacks (checked, degrade quietly by design, no defect)

| file:line | Behaviour on failure |
|---|---|
| renderer/components/ArtifactThumbnail.tsx:116-131, :145-153 | Extension-letter glyph / no preview text. |
| renderer/components/artifact-views/html-inline-assets.ts:53-61, :124-126 | Asset left un-inlined; page renders as before. |
| renderer/components/artifact-views/CodeEditorView.tsx:97 | No syntax highlighting; editor works. |
| renderer/components/artifact-views/cm/editor-registry.ts:66-68 | Search chunk is statically imported elsewhere; failure effectively impossible. |
| renderer/components/artifact-views/PdfView.tsx:88, :198 | Cancel/destroy rejections on scale change or unmount. |
| renderer/components/project-view/ProjectView.tsx:421 | Repo info → no GitHub link. |
| renderer/components/project-view/ProjectView.tsx:460-462, :489-491, :785 | Sync status → no sync line (documented for Android); Sync now → dot reflects outcome. |
| renderer/components/project-view/AddProjectModal.tsx:41-43; ImportProjectModal.tsx:41-43; FolderSwitcher.tsx:89-91 | Sync status unknown → no "Sync is off" note / no row dots. |
| renderer/hooks/useActiveProject.ts:29-43 | Falls back to the session folder. |
| renderer/hooks/useMissingArtifacts.ts:106-109 | Shows the unfiltered list (documented). |
| renderer/hooks/useGitFileStatus.ts:52-53, :60, :91 | Git footer info hidden (consumer SessionDrawer is out of scope). |
| renderer/hooks/useProjectWatch.ts:19, :25 | No live refresh where the watcher doesn't exist. |
| renderer/state/artifact-tool-use-tracker.ts:98, :115, :187 | Background tracking; logged, not user-initiated. |
| renderer/components/git/discard-guard.ts:394-409 | Correct: real message passthrough + stale-result guard (display defect is row 25). |
| renderer/components/ContentFindBar.tsx:113 · plan-windows.tsx:78 · DeliverablesCard.tsx:280 | Non-IPC guards (range geometry, date format, URL parse). |
| renderer/components/project-view/ProjectView.tsx:81, :190 · ContextIntroBanner.tsx:21, :29 · hooks/useSessionTasks.ts:20, :28 | localStorage guards. |
| renderer/components/context-menu/clipboard.ts:14, :34, :44 | Helper itself correct (returns false/null); callers are row 34. |

---

## Evidence for severity-1 rows

### Row 1: a save can skip its conflict check without the user knowing (the known lead is CONFIRMED)

The only source of the modification-time token for a first edit is the edit-start read. The initial read in `useArtifactContent.ts:91-97` stores content, binary, truncated and sizeBytes, but never `mtimeMs`. Switching files wipes the token:

```ts
// ActiveArtifactView.tsx:161-164
// Optimistic-concurrency token from artifacts:get, round-tripped into save as
// baseMtimeMs so a save over a changed file is rejected instead of silently
// clobbering it (spec §12.9). null = no token yet → save runs unguarded.
const mtimeRef = useRef<number | null>(null);
// :207
mtimeRef.current = null; // token belongs to the previous file
```

Edit start: any failure leaves the token null, and edit mode is entered regardless, before the read even resolves.

```ts
// :291-303
(window.claude as any).artifacts.get(projectRoot, artifact.id).then((res: any) => {
  if (!res || !res.ok || res.orphan) return;
  if (typeof res.mtimeMs === 'number') mtimeRef.current = res.mtimeMs;
  ...
}).catch(() => { /* stale content + no token — save falls back to unguarded */ });
setEditing(true);
setConflict(null);
setSaveError(null);
```

Save sends no token when it is null:

```ts
// :325
if (!opts?.force && mtimeRef.current !== null) saveOpts.baseMtimeMs = mtimeRef.current;
```

Main skips the conflict check entirely when no token arrives:

```ts
// main/artifacts/write-authorization.ts:143-150
if (typeof baseMtimeMs === 'number') {
  try {
    const cur = await fs.promises.stat(realPath);
    if (cur.mtimeMs !== baseMtimeMs) return { ok: false, error: 'conflict' };
  } ...
}
return { ok: true, realPath };
```

Android is the same: `SessionService.kt:3806` `if (msg.payload.has("baseMtimeMs") && resolvedSave.exists() && …)`.

**What the user experiences:** the editor opens as normal, with no warning that the safety check is off. If the agent, another window or another tool changes the file while they edit, the conflict banner ("This file changed on disk while you were editing.") never appears. Save exits edit mode as a success, and the other writer's change is gone. The same happens with no read failure at all if Save is pressed before the edit-start read lands, or when a stashed draft with `mtimeMs: null` is restored (:194, :223).

One narrower case is still covered: if an outside change event arrives while editing, the watcher (:259) sets a token, and the dirty-editor branch raises the banner.

### Row 2: "the file wasn't found" when it may exist

```ts
// renderer/hooks/useOpenFilepath.ts:54-62
const failed = () => {
  if (!drawerOpensImmediately) return;
  dispatch({
    type: 'PILL_RESOLVE_FAILED',
    sessionId,
    message: `Couldn’t open ${name} — the file wasn’t found in this project.`,
  });
};
// :79   if (!cwd) { failed(); return; }
// :131  if (!args) { failed(); return; } // e.g. a ~/ path the renderer can't expand
// :150  } catch { failed(); }
```

`failed()` fires when a bridge call rejects, which is no search result at all. It also fires when the session folder is unknown, and when a `~/` path simply can't be expanded by the renderer. In each case the drawer (`SessionDrawer.tsx:666-668`) tells the user their file doesn't exist in the project, a cause the code never verified.

### Row 3: the close prompt can hide and then overwrite an existing note

Main swallows a store failure into "no note, no tags":

```ts
// main/ipc-handlers.ts:4146-4160
if (!store) return { tags: [], note: '', supported: true };
try { ... return { tags, note: rec.note || '', supported: true, flags: reserved }; }
catch { return { tags: [], note: '', supported: true }; }
```

The renderer does the same on rejection, and uses the blank as the baseline:

```ts
// renderer/components/CloseSessionPrompt.tsx:177
.catch(() => { if (!cancelled) { setTagIds(new Set()); setNote(''); setOriginal(blank); setMetaLoaded(true); } });
// :198
noteChanged: note !== original.note,
```

```ts
// renderer/App.tsx:3926
if (result.noteChanged) { try { Promise.resolve((window as any).claude.session.setNote(id, result.note)).catch(() => {}); } catch {} }
```

**What the user experiences:** the prompt shows an empty note and no tags for a conversation that has them. Typing a note replaces the stored one they never saw. Tags are sent as a delta, so existing tags survive but cannot be seen or removed.

---

## (a) In-scope files checked with no defects

Each file was read in full, or its failure-capable calls were read after searching for `window.claude`, `catch`, `.then(`, `await` and `Promise`. No matches means no failure path.

- `renderer/components/diff/UnifiedDiff.tsx`
- `renderer/components/context-menu/ContextMenuHost.tsx`, `ContextMenu.tsx`, `menu-icons.tsx`, `clipboard.ts` (helper; callers are row 34)
- `renderer/components/header/drag-order.ts`, `pack-sessions.ts`, `pill-label-style.ts`, `pill-metrics.ts`, `session-runtime-label.ts`
- `renderer/components/overlays/Overlay.tsx`
- `renderer/components/git/DiscardConfirmDialog.tsx`, `GitReviewCard.tsx`, `discard-guard.ts`
- `renderer/components/project-view/ContextIntroBanner.tsx`, `context-labels.ts`, `detail-tool-icons.tsx`, `FileFilterPopover.tsx`, `HowContextWorksPopup.tsx`, `icons.tsx`, `ImportFileDialog.tsx`, `ProjectDetailOverlay.tsx`, `ProjectsEmptyCard.tsx`, `ProjectSwitcher.tsx`, `tabs/ConversationsTab.tsx`, `tabs/ContextTab.tsx` (these two render what ProjectView passes; the defect is row 8)
- `renderer/components/artifact-views/BinaryFallback.tsx`, `CsvView.tsx`, `MarkdownView.tsx`, `HtmlView.tsx`, `ImageView.tsx`, `CodeEditorView.tsx`, `csv-parse.ts`, `dirty-editor-guard.ts`, `draft-store.ts`, `edit-permission.ts`, `exceljs-cell.ts`, `RendererRegistry.ts`, `sheet-theme.ts`, `types.ts`, `UnsavedChangesDialog.tsx` (its save path is row 4), `useArtifactBytes.ts`, `xlsx-formula.ts`, `PartialFileBanner.tsx`, `html-inline-assets.ts`, `cm/cm-theme.ts`, `cm/syntax-colors.ts`, `cm/editor-registry.ts`, `zoom/*`
- `renderer/components/ArtifactThumbnail.tsx`, `ContentFindBar.tsx`, `FilepathToken.tsx`, `LinkableText.tsx`, `MarkdownContent.tsx`, `OpenTasksChip.tsx`, `OpenTasksPopup.tsx`, `HeaderBar.tsx`, `OverflowMenu.tsx`, `ContextPopup.tsx`, `CopyPicker.tsx`, `HeadPreview.tsx`, `ZoomOverlay.tsx`, `plan-windows.tsx`
- `renderer/hooks/useActiveProject.ts`, `useArtifactCount.ts`, `useGitFileStatus.ts`, `useMissingArtifacts.ts`, `useProjectWatch.ts`, `useInlineFilepathDetector.ts`, `useSessionTasks.ts`
- `renderer/state/ArtifactContext.tsx`, `artifact-actions.ts`, `artifact-tracker.ts`, `deliverable-auto-open.ts`, `artifact-tool-use-tracker.ts`

## (b) In-scope files containing `catch` / `.catch(` that were NOT inspected

`rg -l 'catch'` over every in-scope component directory and top-level file (test files excluded) returned 28 files. **All 28 were inspected at their catch sites:** DeliverablesCard, ArtifactThumbnail, ContentFindBar, FolderSwitcher, CloseSessionPrompt, SessionRenameDialog, ImportProjectModal, plan-windows, git/discard-guard, git/GitReviewView, context-menu/clipboard, artifact-views/ViewerErrorBoundary, DocxView, PdfView, CodeEditorView, XlsxView, useArtifactContent, html-inline-assets, useArtifactBytes, ActiveArtifactView, cm/editor-registry, project-view/tabs/FilesTab, ConversationPreview, ContextEditorOverlay, ContextIntroBanner, ProjectView, AddProjectModal, ProjectHero.

For `renderer/hooks/` and `renderer/state/`, the search was limited to the files that feed projects, artifacts and git. Those with catch sites were all inspected: useActiveProject, useGitFileStatus, useMissingArtifacts, useOpenFilepath, useProjectWatch, useSessionTasks, artifact-tool-use-tracker. Other hooks and state files with catch sites (for example useChessGame, useVoiceInput, marketplace/sync contexts) were **not inspected**, because they feed other units' scopes.

**Partially read** (only the regions around bridge calls and error rendering; the remaining regions are layout with no bridge calls, per grep):

- FilesTab.tsx 1-240, 430-635, 720-890
- ProjectHero.tsx 1-140, 225-693 (except :356, :373)
- ProjectView.tsx 1-95, 140-225, 830-1000
- CloseSessionPrompt.tsx 1-150, 215-355
- FolderSwitcher.tsx 100-360
- DeliverablesCard.tsx outside 93-300
