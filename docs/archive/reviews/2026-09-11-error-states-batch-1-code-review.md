# Code review — error states batch 1 (`session/error-states-unit-b`)

Reviewer: fresh agent, brief `scripts/ui-review/code-reviewer.md`. No contract on this branch; each
`fix(...)` commit message is taken as its promise. Diff: `git diff origin/master HEAD -- desktop app`
(49 files, 15 commits).

## verify.sh (run once, `bash scripts/verify.sh ./youcoded`)

```
verify: .../worktrees/sessions/error-states-unit-b/youcoded (base origin/master)
  tests: related to 46 changed file(s) + 57 source-scanning guards
PASS  types (tsc --noEmit)
PASS  types in tests/ (tsc --noEmit, 57 file(s) still excluded)
PASS  tests (related)
PASS  dead code (knip)
PASS  lint (eslint)
PASS  invariants (ast-grep)
OK — all checks passed.
   Not covered: Android (./gradlew test), marketplace worker.
```
Android not run (per instructions: another Gradle run owns the build dir).

## Findings

- F1 — desktop/src/renderer/hooks/useSessionMeta.ts:50-63, desktop/src/renderer/hooks/usePreviewMeta.ts:54 — both other `getMeta` readers ignore the new `unreadable` field (and useSessionMeta's `.catch` still answers blanks with `supported: true`), so the in-session tag chip's note editor (SessionTagsChip.tsx:100-101, `onNote={meta.setNote}`) and the drawer preview's note editor (SessionDrawer.tsx:943-944, `onNote={previewMeta.saveNote}`) still show an empty note for a record that could not be read, and typing replaces the stored note — the exact data loss 008eedb4 fixed only in CloseSessionPrompt, now with both hosts explicitly telling the renderer the read failed — confirmed by reading both hooks, their consumers, and `setNote`/`saveNote` (whole-text writes). Not a regression; the fix stops at one of three editors of the same field.
- F2 — desktop/src/renderer/components/UpdatePanel.tsx:36-38 — `downloadErrorCode` never finds a code on desktop, so every download failure (including `busy`, `url-rejected`, `unsupported-platform`) becomes `network-failed` and shows an ENABLED "Download failed — Retry" that the file's own comment says cannot help — confirmed by call chain: `UpdateInstallError` sets `this.name = 'UpdateInstallError'` (main/update-installer.ts:36); Electron's bundled lib (read out of node_modules/electron/dist/electron) replies `sendReply({error:r.toString()})` and the renderer throws `` `Error invoking remote method '${e}': ${r}` ``, so the text is `Error invoking remote method 'update:download': UpdateInstallError: busy: …`; `ELECTRON_WRAPPER` (utils/ipc-error.ts:23) strips only an optional `Error:`, leaving `UpdateInstallError: …`, which `/^([a-z][a-z-]*)(?::|$)/` rejects on the capital U. 7149d657's "Launch failed" wording is fixed; its "the code is now read" claim is not.
- F3 — desktop/tests/update-panel-failure-label.test.tsx:22-24 — the `wrapped()` fixture builds `Error invoking remote method 'update:download': <code>: …` without the `UpdateInstallError: ` segment Electron really inserts, and the "retry cannot fix" case only asserts `/download failed/i`, which "Download failed — Retry" also matches; both tests would stay green with F2's bug in production — confirmed by comparing the fixture to the Electron reply format above and to the label strings at UpdatePanel.tsx (error-state button).
- F4 — desktop/src/renderer/state/marketplace-context.tsx:185 — `theme.marketplace.list().catch(() => [])` turns a failed theme-list read into an empty `themeEntries` with `error` still null, so LibraryScreen's `loadGate` (LibraryScreen.tsx:43-45) returns null and the Themes tab still says "No themes installed yet." to someone with themes — confirmed by reading fetchAll and loadGate; library-load-state.test.tsx's Themes case fails `skills.list`, not the theme list, so it does not cover this. 1797c8f3's promise holds for themes only when the skills list is what failed.
- F5 — desktop/src/renderer/components/tags/TagPicker.tsx:100, desktop/src/renderer/components/ResumeBrowser.tsx:1610-1612 — both read `useTagRegistry()` but not its new `error`, so after a failed read the tag picker still says "No tags yet — type a name to create one." (inviting duplicates) and the Resume Browser tag filter says "No tags yet" — confirmed by reading both empty-state conditions (`visible.length === 0 …` / `liveTags.length === 0`). 09f0b6d7's title ("a tag read that failed is not 'No tags yet'") is met only in TagManagerPopup.
- F6 — app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt:3604 — the over-cap branch of artifacts:get still calls `EditablePathPolicy.readFully` (EditablePathPolicy.kt:106-107, `f.inputStream()`), which throws `FileNotFoundException`/`SecurityException` for the same "exists but can't be read" file that `readWhole` now handles two branches later; the handler runs in `serviceScope.launch` on `CoroutineScope(Dispatchers.IO + SupervisorJob())` (lines 118, 316) with no exception handler, so an unreadable file over EDIT_MAX_BYTES gets no answer at best and an uncaught-exception crash at worst — read only, not run [PLAUSIBLE]
- F7 — desktop/src/renderer/components/SyncPanel.tsx:970-971 — when `pushBackend` is skipped because a push is already running or the lock is held, desktop answers `{ success: false, error: '' }` (sync-service.ts:950, 962-964), and the new done step reports "Your first backup didn't finish." with no reason for a backup that was never attempted — confirmed by call chain; how often a push is in flight right after adding a destination was not measured [PLAUSIBLE]
- F8 — desktop/src/renderer/components/ToolCard.tsx:1040/1077 — AskUserQuestionCard's `handleSubmit` never calls `setUnconfirmed(false)` (handleDeny and PermissionButtons do), so the comment "cleared on the next try" is false for Submit and the "couldn't confirm" line stays up while the retry is in flight — confirmed by reading handleSubmit's opening lines.
- F9 — desktop/src/renderer/components/tags/TagManagerPopup.tsx:86-88 — with a failed refresh and every loaded tag archived (Show archived off), `registry.tags.length > 0` skips the error branch and `visible.length === 0` shows "No tags yet — create one above" without the stale notice — confirmed by reading the branch order and the `visible` filter (line 44-46).

## Promises checked with no finding

7809ff46 (Retry through handlePushBackend; wizard rejects on a failed save, uploads only the new id; tests fail if reverted), 73d3bf35 (copyText awaited; test fails if reverted), 1797c8f3 (skills half), db19d5b6 (answer shapes checked on desktop, remote-server and Kotlin: `{status:'failed'}` / `{ok:false}` / bundled; all renderer callers of the four mutations catch; the refresh-failure test is real because `refreshDrawerSkills` is `refreshInstalled`, which throws), cdca34b8, 69cd411d, 1abb381d, 7a950efd (test drives the textarea Enter branch that changed; handleSubmit already had the check), d83ce662, 53884535 (comparator is the loaded `content`, which only the non-dirty watcher path updates; Android and desktop both return `mtimeMs`), 3f66cd72 (useArtifactContent.ts:99 renders `{ok:false,error}` as "Couldn't read this file"; artifacts:get is not in REJECT_ON_NOT_OK), 008eedb4 (close prompt itself; Android answers `supported:false`, no mirror needed), 352c2bd7 (desktop `permission:respond` returns a boolean and does not throw, so a rejection really is a transport failure), 05fe0534.

## Not covered

- No Android run: F6 and the Kotlin readWhole test are read-only judgements.
- remote-server.ts `case 'skills:uninstall'` answers `{ ok: true }` whatever the provider returned and has no bundled check; not traced whether `skillProvider.uninstall` can return a failure, so db19d5b6's "reads every answer" was not verified over remote access.
- `plainMessage` output for other `UpdateInstallError`-style named errors elsewhere (the same `Name:` prefix would survive its wrapper strip) — not swept repo-wide.
- CloseSessionPrompt's `unreadable` state also hides the Complete/flag controls; not checked whether flags should stay editable when only tags/note failed.
- Visual/runtime behaviour of every new error state (no app, workbench or browser launched).

## Triage (implementing session, 2026-09-11)

- F1 accepted — confirmed: useSessionMeta and usePreviewMeta ignore `unreadable`; both editors get the close prompt's "can't be changed here" treatment.
- F2 accepted — confirmed `this.name = 'UpdateInstallError'` (update-installer.ts:36) survives the wrapper strip; the wrapper now also strips a named `…Error: `.
- F3 accepted — the fixture now carries `UpdateInstallError: ` and the labels are asserted exactly (enabled "Download failed — Retry" vs disabled "Download failed").
- F4 accepted — a failed theme list is tracked on its own and the Themes tab shows it.
- F5 accepted — TagPicker and the Resume Browser tag filter read `registry.error`.
- F6 accepted — the over-cap branch reads through a guarded helper like the whole-file branch.
- F7 accepted — an empty-reason `success: false` (a push that was skipped) reads "hasn't run yet", not "didn't finish".
- F8 accepted — handleSubmit clears `unconfirmed` on the next try.
- F9 accepted — the stale notice no longer depends on whether a loaded tag is visible.
- Not covered, remote-server `skills:uninstall` answering `{ ok: true }` regardless — filed for batch 2 (remote access), not fixed here.
