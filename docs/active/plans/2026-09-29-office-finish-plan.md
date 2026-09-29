---
status: active
---
# Office — finish plan (features, live comments, framing, close/quit trim, platforms)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** the Office editors inside YouCoded are mergeable: every visible editor feature works or
is hidden on purpose, comments behave like the app's own comments, the editor looks framed by
the app, close/quit is simpler, and release builds work on every platform.

**Decisions this plan carries out (Destin, 2026-09-29):**
- `docs/active/design/2026-09-27-office/office-next.questions.answers.json`:
  - S-1 yes (master merged — done: app f7d9ff338, workspace 038401e8).
  - Q-1 restyle Office's comments panel AND make assistant comments reach an open editor live
    ("want it to work like our comments with live updates when the assistant interacts").
  - Q-2 fix: pictures, Save As / Export / PDF, Print, remember editor settings. NOT "insert
    another file" (stays unanswered-to-null; keep it hidden or harmless) and no separate
    every-button walk (each task checks the menus it touches).
  - Q-3 review then trim close/quit (Destin in chat, 2026-09-29: "fine with recommendations").
  - Q-4 build Mac, Windows and ARM Linux bundles before merge.
- `docs/active/design/2026-09-27-office/office-polish.review.answers.json`: keep square gallery
  tiles, scrollbars, sheet polish; apply the same polish to Word and PowerPoint; File tab and
  header/sidebar framing still wrong (Task 6).

**Sources:** design `docs/active/specs/2026-09-28-office-build-design.md`; previous plan
`docs/active/plans/2026-09-28-office-build-plan.md`; polish report
`.superpowers/sdd/polish-report.md`.

## Global constraints

- App worktree: `/home/destin/youcoded-dev/worktrees/sessions/office-suite-investigation/youcoded`
  (paths below relative to `youcoded/desktop/` unless stated). Add-on clone:
  `/home/destin/youcoded-dev/worktrees/sessions/office-suite-investigation/scratch/youcoded-office`
  (repo `itsdestin/youcoded-office`, commits to `main`, released by pushing a `vX.Y.Z` tag; CI
  builds and publishes; the app pins it in `desktop/office-pin.json` and installs it with
  `node scripts/fetch-office.mjs`). Installed bundle: `desktop/office-addon/`.
- **Never touch Destin's running YouCoded app.** Runtime checks use a dev instance:
  `bash scripts/run-dev.sh --label "Office" --offset 7 --profile office` from the workspace root
  (`/home/destin/youcoded-dev/worktrees/sessions/office-suite-investigation`), or the workbench
  (`bash scripts/run-workbench.sh` + `node scripts/office-workbench-server.mjs` in desktop/).
  Stop any dev instance you start, by PID. Use generated test files only — never files under
  `scratch/spike/samples/` or `scratch/spike/work/`.
- **Coding rules:** a WHY comment at every non-trivial edit; no `*Sync` fs/child_process in
  `src/main/**`; every new `office:*` IPC channel in preload, remote-shim (refused), handlers and
  the Kotlin stub, pinned by `tests/ipc-channels.test.ts`; new editor→host commands go through
  `OFFICE_COMMANDS` in `src/main/office/office-commands.ts` and main re-checks them; error copy per
  `docs/error-message-standards.md` (specific and accurate, never an invented cause; raw fs
  errors and paths never reach the editor frame).
- **Security invariants (must hold after every task):** each document stays on its own sealed
  `office://<token>` origin; the frame never learns folder paths; main reads only files the
  person chose in a dialog it showed, or the session's own file; downloads by URL are http(s)
  only, size-capped, image types only; `office-frame-guard.ts` stays wired.
- **Tests:** TDD where the behaviour is testable in vitest; add-on behaviour tested in its own
  `test/` suite. `bash scripts/verify.sh <app worktree>` passes before a task is called done. A
  failing or flaky test is fixed then and there.
- **Git:** stage explicit paths; push after every commit (app and workspace on
  `session/office-suite-investigation`, add-on on `main`). No merge, no PR.
- **Line budgets:** `desktop/line-budgets.json`; raise a number only for reviewed growth and say
  why in the commit.

---

### Task 1: Insert pictures

Today (verified 2026-09-29): Insert → Picture → From file does nothing because the add-on's
`tauri-relay.js` `dialog` object has no `open` (only `confirm`/`message`), so `bridge.js`
`OpenFilenameDialog` throws. Pictures from a URL or a local path go through
`LocalFileGetImageUrl` (bridge.js ~2140), a synchronous XHR to
`ASC_PROTO_BASE + 'copy-to-media/' | 'download-to-media/' + encodeURIComponent(url)`, which the
office protocol does not serve.

Build:
- Relay `dialog.open({multiple, filters})` from the editor to the host (same postMessage relay
  EditorFrame already uses) → main shows a native open dialog (parented to the window) and
  returns the chosen paths. Main records those paths as granted for that session only.
- Serve `copy-to-media/<path>` on the session's office origin: only for a granted path (or the
  session's own media), copy the file into the session's media folder under a fresh name, return
  that media name the way the editor expects. Refuse anything else (404, logged).
- Serve `download-to-media/<url>`: http(s) only, image content types only, a size cap (name the
  constant; 25 MB), a time cap; save into media; return the name the editor expects.
- Check pasted pictures and drag-and-drop still work.
- Word, Excel and PowerPoint: Insert → Picture from file, from URL; also the picture used in a
  shape fill / slide background if it uses the same dialog.
- Dev-window check in all three editors with generated files, then save, reopen: the picture
  survives.

### Task 2: Save As, Export, PDF

Today (polish report §4): File-tab "Save As", "Export/Download as" and "Export to PDF" are hidden
by CSS because they end in `bridge.js` save-as: `__TAURI__.dialog.save` is missing from the relay
and `save_file_as` is refused by main. Ctrl+Shift+S (editor-patches.js) still reaches that path
and fails silently.

Build:
- Relay `dialog.save` → native save dialog in main (filters from the editor's request).
- Implement `save_file_as` (add to `OFFICE_COMMANDS`): translate through x2t to the chosen format
  (at least docx/xlsx/pptx, pdf, odt/ods/odp, rtf/txt/csv where x2t supports them) and write via
  the same safe path "Save a copy" uses (private temp dir beside the target, output validated,
  one rename). The open document and its session stay on the original file (a copy, like "Save a
  copy"), unless the editor's flow requires otherwise — state the choice in the report.
- Un-hide those File-tab items (add-on `polishCss`), keep them styled like the rest of the tab.
- Ctrl+Shift+S works.
- Tests for the command (formats, refusal of protected folders, the open-elsewhere rule the
  copy path already has).

### Task 3: Print

Today: Print is hidden (config `permissions.print:false` + CSS); it ends in `print_document`,
refused by main.

Build: implement `print_document` (add to `OFFICE_COMMANDS`): translate the current document to
PDF with x2t (reuse Task 2), then show the operating system's print dialog for it from main (for
example a hidden BrowserWindow that loads the PDF and calls `webContents.print`, or the most
reliable Electron route you verify). If printing cannot be shown, give a specific message and
offer "Save as PDF" instead. Re-enable Print in the editor config and CSS: File → Print, the
toolbar print button, Ctrl+P, "Print selection" if the editor supports it. Dev-window check that
the print dialog appears (cancel it; do not print).

### Task 4: Remember editor settings

Today: File → Advanced Settings choices last only while the document is open (each open is a
fresh `office://<token>` origin, so its localStorage starts empty).

Build: persist the editor's own settings keys (an allow-list of the keys Advanced Settings and
view toggles write — find them in web-apps; never document content) in main
(`<userData>/office-editor-settings.json`, written atomically, per editor kind if the keys
differ). Seed them into the frame before the editor reads them (yc-early.js runs first), and send
changes back when they change. The Interface-theme row stays hidden (YouCoded sets the theme).
Tests: round trip; keys outside the allow-list are dropped.

### Task 5: Saving that doesn't feel janky

Destin: editing and saving "seemed like they might be a bit janky". Hypothesis (unverified):
every autosave translates the whole document through x2t (`save_changes` = full save).

Build: measure first in a dev window with generated documents of three sizes (small, ~5 MB,
~20 MB): time per autosave, what the person sees (save indicator, typing pauses, flicker, focus
or caret jumps), how often saves run. Report the numbers. Then fix what the numbers point at
(for example: save less often while typing continues, never block input, keep the indicator
steady, skip a save with no changes). Keep the no-lost-edits guarantees the existing tests pin.
If nothing is janky by measurement, say so and change nothing.

### Task 6: Comments — live assistant comments and a restyled Office panel

Research (2026-09-29, read-only) found, in `office-addon/editors/sdkjs/{word,cell}`:
`asc_addComment/asc_changeComment/asc_removeComment` and plugin wrappers
`pluginMethod_AddComment/_ChangeComment/_RemoveComments/_GetAllComments` in both editors; Word
events `asc_onAddComment/asc_onChangeCommentData/asc_onRemoveComment` (Excel events unconfirmed).
`yc-bridge.js` already reaches the editor via `editorApi()` and accepts `yc:office-*` messages
from `window.parent`. The app's assistant path: `src/main/doc-comments/pending-mutation-queue.ts`
`applyRequest` → `doc-comments-dispatch.ts` → `write-pipeline.ts` `writeFileMutation` (which
today writes the file even while Office has it open, so Office's next autosave erases it);
reads via `listNativeComments`. `getOfficeSessions().byPath(realPath)` tells whether Office has a
file open.

Build:
- **Writes:** when Office has the file open, `applyRequest` routes add / reply / resolve / reopen
  / edit / delete into the live editor (main → the owning window → EditorFrame → yc-bridge →
  editor comment API), waits for the editor's answer (time-capped), and returns that as the
  request's result. The editor's autosave then writes it to the file. When the editor cannot
  answer (still loading, crashed), queue the request and apply it when the editor is ready or,
  after close, to the file as today; tell the assistant it is queued rather than dropping it.
- **Reads:** when Office has the file open, list comments from the live editor.
- **Live panel updates:** editor comment events (Word) or a short poll (Excel, if no events)
  push `docComments:changed` so any reading view of the same file updates.
- **Anchoring:** Word needs the quoted text selected before adding — find and select it without
  moving the person's caret visibly (restore their selection); Excel needs the right sheet/cell.
- **Authors:** assistant comments show as the same author the app writes to files
  (`docx-comments.ts`), and the person's own Office comments use the same name the app uses for
  them.
- **Restyle Office's comments panel** (add-on CSS) to match the app's comment cards
  (`src/renderer/components/comments/`: same card shape, fonts, colours, buttons, reply box) in
  every theme; hide Office features that conflict (e.g. its own "@mention").
- Known accepted oddity: Ctrl+Z can remove an assistant comment.
- Tests: routing when open vs closed; queue on not-ready; reads from the editor; add-on tests for
  the bridge handler. Dev-window check in Word and Excel: ask the assistant (or drive the
  doc-comments MCP request path directly) to comment while the file is open — the comment
  appears within about a second, survives autosave and reopen, and your own typing is not lost.
- Show Destin before/after pictures of the restyled panel (the controller builds the deck).

### Task 7: Framing, File tab, and Word/PowerPoint polish parity (UI — Destin approves on a deck)

Destin: "the side bars and such should gracefully connect to the header element to frame the
doc/content"; "a line below the header section across the entire panel area in a different
color, which i want to fix/hide/blend"; File tab (polish answers P-file): "no thumbnail styling.
make this match youcoded's card styling. this still doesn't blend well into or properly separate
from the file/home/insert/etc buttons, or the focused/selected side pane. should all be rounded
and such while also separating from the youcoded theme frame"; P-menus: "header and sidebars
still dont connect properly to frame the edit area"; P-sheet: same fixes across PowerPoint/Word.

Build (add-on CSS/bridge, plus app side only if needed): the ribbon (header) and the left/right
side strips form one continuous panel-coloured frame around the document canvas — joined corners,
one consistent radius, no gap between the ribbon card and the side strips; remove or blend the
full-width line under the header; File tab: its page and the recent/document thumbnail use
YouCoded's card style, rounded, clearly separate from the tab row and the selected side item, and
separated from the app's own frame. Apply the approved polish to Word and PowerPoint as it is in
Excel. Follow `docs/active/design/2026-08-25-ui-design-guide.md`. Capture before/after pictures
(the shoot office screens and the polish rig used in `.superpowers/sdd/polish-report.md`) in
Midnight and Meadow Mist for Word, Excel and PowerPoint; the controller builds the review deck.

### Task 8: Close and quit — trim onto the editor's own recovery

Review (2026-09-29, read-only): ~1,900–2,200 branch lines handle close/quit/unsaved; `bridge.js`
already streams every change batch via `save_changes`/`LocalFileSaveChanges` and has
`recovery_begin` / `recovery_mark_saved` / `recovery_end` / replay-at-open
(`_recoveryEnqueue`), but main answers `recovery_candidates` with `[]`, so it is off.

Build:
- Implement the editor's recovery in main: an append-only journal per open document (private
  folder, permissions like the existing temp dirs), `recovery_candidates` / `recovery_load` /
  `recovery_discard` per `bridge.js`, cleared on a clean save/close. At next open of a file with a
  journal, the editor replays it (verify the editor's own recovery prompt/flow; style it or offer
  "Recover unsaved changes" per the error standards).
- Then remove what the journal makes unnecessary: `office-flush.ts` handshake, Office-specific
  holds in `window-close-gate.ts` and `office-store`, `abandoned-saves.ts`, the Office part of
  the quit prompt. A dirty Office document still counts as unsaved in the one quit prompt
  (use the editor's modified flag).
- Keep app-wide protections: the unsaved-files prompt for the text editor and parked drafts
  (simplify its code if you can without changing what it does), the hung-window escape, the quit
  watchdog, restart through the quit gate, session teardown. `office-frame-guard.ts` stays.
- Report lines removed/added and every user-visible behaviour change. Dev-window checks: type,
  quit immediately → nothing lost (file or recovery); kill the dev process mid-typing → recovery
  offered at next open; text-editor unsaved prompt unchanged; hung window escape unchanged.

### Task 9: Mac, Windows and ARM Linux bundles

Build: extend the add-on's CI to produce `youcoded-office-<v>-{darwin-x64,darwin-arm64,win32-x64,
linux-arm64}.tar.gz` (x2t and its libraries from the matching euro-office-lite release assets;
research what exists per platform first and report gaps), pin every platform in
`office-pin.json`, and make `fetch-office.mjs`/the release build pick the right one. Where an
upstream binary does not exist for a platform, report it and choose between building it or
shipping that platform with Office hidden (the app must build and run there either way) — ask the
controller before choosing. Test: the app's release build config resolves every platform;
fetch-office verifies checksums.
