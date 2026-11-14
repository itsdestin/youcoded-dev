---
status: active
date: 2026-11-14
topic: Mesh Phase 0, T9 — what a remote screen refuses today, and what "capabilities per chat" needs
---

# T9: what a remote screen refuses today

## 1. Verdict

**PASS** against the section 9 line ("a table: each decided limit in 2.1 is enforced today, or needs building"). Result: of the four decided limits, **one is enforced** (assistant browser) and **one is half-enforced** (Office); **image paste and dragging files in are not enforced with any message, they silently do nothing on a phone**. None of the four shows the 2.1 sentence ("X is not currently supported from a remote client"); that wording exists nowhere in the code. On a computer used as a watcher, **nothing is enforced for any of the four**, because an Electron window never goes through `remote-shim.ts`. Method was code reading only (no runtime check, see section 6).

## 2. What was done

Read-only. No app was launched, nothing was edited. Files read (all under `youcoded/desktop/src/`): `shared/capabilities.ts`, `renderer/platform.ts`, `renderer/remote-unsupported.ts`, `renderer/remote-shim.ts` (the `dialog`, `office`, `browser` blocks, `pickAndUploadFiles`, `noteUnsupported`), `renderer/components/InputBar.tsx` (paste, drop, attach handlers), `renderer/components/context-menu/build-menu.ts`, `renderer/components/office/office-availability.ts`, `renderer/state/browser-store.ts`, `main/remote-server.ts` (`authOkMessage`), `main/ipc/channel-table.ts` (`serveRemoteChannel`), every `main/ipc/*.ts` family file.

Commands that produced the counts (re-runnable from `youcoded/desktop/src`):

- Call sites of the capabilities function: `rg -n "getCapabilities\(\)" --glob '!*.test.*' . | grep -vE ":[0-9]+:\s*(//|\*|/\*)" | grep -v "export function" | wc -l` gives **45**, in **36 files**.
- Channel flag counts: `cat main/ipc/*.ts | sed -E 's#^\s*//.*##' | rg -o "desktopOnly: true" | wc -l` gives 148; same with `remoteAllowed: false` gives 45, `remoteGuard:` 14, `remoteOnly: true` 2.
- The table was parsed with a throwaway script (kept in the scratchpad, not in the repo): it split each `main/ipc/*.ts` on `defineChannel({`, read `name`, `kind` and the flags, and resolved `IPC.X` names through `shared/backend-contract.ts`. Result: **470 entries written out + 8 made by one helper in `handoff.ts` = 478**. This equals the 478 rows of request types in `ChannelTypes`, which is the cross-check.

## 3. Findings

### 3.1 The four decided limits, and the others a phone lacks

| Limit (2.1) | Phone or browser client today | A computer used as a watcher today | Needs building |
|---|---|---|---|
| **No assistant browser** | **Enforced.** `REMOTE_SCREEN_CAPABILITIES.assistantBrowser = false` (`capabilities.ts:113`); `browserSupported()` (`state/browser-store.ts:32`) reads it, so the panel, the header button, Settings page and ask card are hidden. 19 of 20 `browser:*` channels are `desktopOnly`. The user sees nothing (no message). One piece works on purpose: `browser:answer`, so a phone can answer the browser's question card. | **Not enforced.** The window's own set says `assistantBrowser: true`, and the local browser belongs to the watcher, not the host. A watched chat would show the watcher's browser panel for a chat whose browser runs elsewhere. | A per-chat answer to `browserSupported()` (8 callers) plus the 2.1 wording. |
| **No Office documents** | **Half enforced, by refusal not by capability.** All 15 `office:*` channels are `desktopOnly` (`ipc/office.ts`). The renderer asks `office.status(null)` once per run (`office-availability.ts`); a refusal reads as "not available" and every Office entry point (Edit button, header icon, Pages row) stays hidden. If something reaches the pane, `OfficeView.tsx:69` shows its own "not available" line and `saidInPlace('office:')` stops the toast. | **Not enforced.** The question is asked of the watcher's own host and answers yes. A watched chat's Office files would open in the watcher's own Office add-on on the watcher's own disk, not the host's. | Office is not a capability key at all. Add one (or key `officeAvailableNow()` by chat). Today the answer is cached once per app run, globally (`office-availability.ts:20-27`). |
| **No image paste** | **Not enforced; silently does nothing.** `InputBar.handlePaste` (line 1045) calls `e.preventDefault()` for an image-only clipboard, then `window.claude.dialog.saveClipboardImage()`. The shim's version is `async () => null` (`remote-shim.ts:2606`), so nothing is attached and no message appears. The right-click Paste (`build-menu.ts:236-247`) does the same through the `youcoded:composer-paste-image` event. The host channel `clipboard:save-image` is `desktopOnly`, but the shim never even calls it. | **Not enforced; worse.** The local channel works: it saves the picture to the watcher's own temp folder and the path is attached. That path exists only on the watcher. If the send forwarded it, the host would be told about a file it does not have. | A check in `handlePaste`, the context-menu paste and the `buddy:attach-file` event, and the notice. |
| **No dragging files in** | **Not enforced; silently does nothing.** `InputBar.handleDrop` (line 1080) keeps only `(f as any).path`. A browser `File` has no `path`, so the list is empty and nothing happens. The dashed drop highlight still lights up (line 1109) and then nothing arrives, which looks broken. | **Unknown, possibly already broken on a computer.** The app is on Electron `^44.10.0` (`package.json:93`). Electron removed `File.path` in version 32 and replaced it with `webUtils.getPathForFile`. `rg -n "getPathForFile\|webUtils" src` finds nothing. If that is right, dragging a file into the box already attaches nothing on the desktop. `InputBar.test.tsx:74-85` pins only the highlight, not the attach. UNVERIFIED at runtime. | Same check as paste. Also worth a one-minute look on a dev instance by the lead (a possible existing bug, not caused by this work). |

Other things a remote screen lacks today, from `REMOTE_SCREEN_CAPABILITIES` (`capabilities.ts:92-114`): own windows and tear-off (`nativeWindows`), open a file in the OS (`openInOs`), open a link in the browser (`openExternal`), git status (`git`), theme pictures and animated mascots, reading terminal text (`terminalScreenRead`), the floating buddy, changing project files (`projectWrites`), searching inside project files (`contentSearch`). Each is read from the one window-wide object. The phone's real set is not that constant: `authOkMessage` (`remote-server.ts:193-203`) overrides `sessionRecord: true`, `nativeSessions` and `chatgptAccount` on top of it. So "the remote-screen set" in 5.5 must mean the handshake set, not the constant. Using the constant as is would make a watcher infer dividers and prompt cards itself (`sessionRecord: false`).

Also: voice typing is refused only on a phone paired to a computer (`VOICE_REMOTE_REASON`, `remote-shim.ts:432-451`) and absent in a plain browser tab. That is a limit a watcher on a computer would not have (its own microphone works and only produces text), so it needs no per-chat rule.

**Not in the 2.1 list but needed, found while reading:** the attach button (paperclip). `dialog:open-file` is `desktopOnly`; on a phone the shim replaces it with a picker that **uploads** the file to the host (`pickAndUploadFiles`, `remote-shim.ts:2101-2160`, channel `file:upload`, which is `remoteOnly`) and attaches the host's copy. On a computer watcher the native picker returns paths on the watcher's disk, which the host cannot open. So "attach a file" needs either the upload route for peers, or to be listed as a limit. Not decided anywhere in 2.1.

### 3.2 How a refusal is shown today (for the notice wording)

- Host side: `serveRemoteChannel` (`channel-table.ts:195-`) answers `{ok:false, error:"This feature isn't available over remote access yet (<channel>).", unsupported:true}` for a `desktopOnly` or `remoteAllowed:false` channel (or the entry's own `refusal`: silent, or a fixed reply). 12 entries carry a `refusal` (per-entry text count by the script).
- Screen side: `noteUnsupported` (`remote-shim.ts:976`) shows one toast per feature per page load: "<Feature> isn't available via remote access yet." (or "on the phone"). Only namespaces named in `remote-unsupported.ts` get a toast (18 names); an unnamed one only logs to the console. `office:` is "said in place" (no toast).
- So the sentence in 2.1 would be a new string, and the existing toast is per feature per load, not per chat.

### 3.3 What "capabilities become per chat" requires in the renderer (5.5)

1. **Today there is one set per window.** The set lives on `window.claude.capabilities`. On a computer it is fixed at load from `preload.ts:1049`. On a phone it is replaced once by the handshake (`remote-shim.ts:1497`). `getCapabilities()` (`renderer/platform.ts:103-108`) reads it fresh on every call. It takes no argument, is not a React hook, does not notify anyone when it changes, and knows nothing about which chat is on screen.
2. **45 call sites in 36 files** (command above). By my reading (the lead should treat the split as a judgement, the count is exact):
   - **About 19 sit inside the chat screen and would need the chat's id**: `hooks/useAttentionClassifier.ts:68`; `hooks/usePromptDetector.ts:134,222`; `state/transcript-batch.ts:60`; `state/slash-command-dispatcher.ts:25`; `state/pty-input-gate.ts:97`; `state/native-slash-actions.ts:59`; `components/TerminalView.tsx:843`; `state/browser-store.ts:33`; `components/model/ModelPicker.tsx:386`; `components/RuntimeBinding.tsx:108`; `components/SessionDrawer.tsx:429`; `components/artifact-views/BinaryFallback.tsx:31`, `BinaryContent.tsx:82`, `PartialFileBanner.tsx:37`; `hooks/useOpenFilepath.ts:276,314,321`; `components/context-menu/build-menu.ts:294`.
   - **About 26 are about the window, not a chat**, and can keep the one set: theme pictures and rigs, buddy, window controls and tear-off, sign-in (`openExternal`), first-run, tips, settings, the project screens (`ProjectView`, `ProjectHero`, `AddProjectModal`, `ContextEditorOverlay`, `FilesTab`), the games.
3. **Most of those 19 are plain functions, not components.** `state/*.ts` and `hooks/*` helpers call it with no session in scope (for example `hostDraws()` in `slash-command-dispatcher.ts:25` and `officeAvailableNow()` have no argument). Each needs a session id threaded in (or a lookup `capabilitiesFor(sessionId)`), and the components need to re-render when a chat's host changes (a subscription, e.g. `useSyncExternalStore`), because today nothing re-renders on a capability change.
4. **Three of the four limits are not capability keys.** Only `assistantBrowser` is. Image paste, file drop and Office need new keys, or a new "chat limits" object. Attach-from-this-device may need one too (3.1).
5. **Some readers do not read capabilities at all** and ask the bridge directly: `window.claude.office.status()` (cached globally once per run), `window.claude.browser` presence, and the shim stubs themselves. Those are the 3 direct reads of `window.claude.capabilities` outside `platform.ts` (`remote-shim.ts:1497, 3412, 3487`). They must be made chat-aware too or they will answer for the window.
6. **Where the per-chat set comes from.** For a phone client the host decides in `auth:ok`. For a watched chat on any device the watcher's own app decides (there is no handshake with a window). It should be the window's own set with the chat limits taken away, **not** `REMOTE_SCREEN_CAPABILITIES` copied (see 3.1, the `sessionRecord` point). The host must still refuse on its side (`desktopOnly` and `peerAllowed`), so a stale or modified watcher cannot get through.
7. **Test and doc impact:** `tests/remote-channel-parity.test.ts` and `tests/remote-shim-refusals.test.ts` pin the current refusals; `ModelSwitchPrompt.test.tsx:182` sets `window.claude.capabilities` directly.

### 3.4 Session-scoped channels (S6 and 5.5)

**Definition used:** a channel whose request carries a session or chat id, or whose job is to act on a running chat. The table has no marker for this today, so S6's parity test ("every session-scoped channel is `peerAllowed`, or has a refusal message") cannot be written until a marker exists. 65 of the 99 below have `sessionId` in their request type (found by script); the other 34 I marked by reading the handler.

**Counts: 99 session-scoped channels out of 478 (21%): 26 forward as they are, 29 need thought, 44 must not be forwarded.** Of the 44, 11 are the handoff and lease channels the mesh replaces (Phase 7), and 33 are window, tab and terminal-flow bookkeeping or already refused to phones.

Reading the "today's phone policy" column: `desktopOnly` or `remoteAllowed:false` means a phone is already refused; a bare `handle` or `on` means a phone may call it with no gate. Codes: all counts are from the script above and `main/ipc/*.ts`.


#### Forward (26)

| Channel | Kind and today's phone policy | Why |
|---|---|---|
| `session:claude-control` | handle | acts on the running chat; host does it on its own disk |
| `session:menu-lock` | handle | acts on the running chat; host does it on its own disk |
| `session:open` | handle | acts on the running chat; host does it on its own disk |
| `session:send-outcomes` | handle | acts on the running chat; host does it on its own disk |
| `session:queue-action` | handle | acts on the running chat; host does it on its own disk |
| `native:interrupt` | on | acts on the running chat; host does it on its own disk |
| `native:retry` | on | acts on the running chat; host does it on its own disk |
| `native:continue-turn` | on | acts on the running chat; host does it on its own disk |
| `native:startup-action` | handle | acts on the running chat; host does it on its own disk |
| `native:compact` | handle | acts on the running chat; host does it on its own disk |
| `native:clear` | handle | acts on the running chat; host does it on its own disk |
| `native:invoke-skill` | handle | acts on the running chat; host does it on its own disk |
| `native:switch-model` | handle | acts on the running chat; host does it on its own disk |
| `native:set-binding` | handle | acts on the running chat; host does it on its own disk |
| `native:set-permission-mode` | handle | acts on the running chat; host does it on its own disk |
| `native:get-permission-mode` | handle | acts on the running chat; host does it on its own disk |
| `native:kill-shell` | handle | acts on the running chat; host does it on its own disk |
| `native:queue-remove` | handle | acts on the running chat; host does it on its own disk |
| `native:queue-send-now` | handle | acts on the running chat; host does it on its own disk |
| `specialists:steer` | handle | acts on the running chat; host does it on its own disk |
| `specialists:interrupt` | handle | acts on the running chat; host does it on its own disk |
| `permission:respond` | handle | acts on the running chat; host does it on its own disk |
| `browser:answer` | handle | acts on the running chat; host does it on its own disk |
| `native:session-context-text` | handle | acts on the running chat; host does it on its own disk |
| `session:switch` | handle | client-side no-op or proxy bookkeeping |
| `session:unwatch` | handle | client-side no-op or proxy bookkeeping |

#### Needs thought (29)

| Channel | Kind and today's phone policy | Why |
|---|---|---|
| `native:send` | handle | message text fine; attachments are file paths that exist only on the sender |
| `session:input` | on | raw terminal keystrokes/paste into the host PTY; pasted text may be a local path; several watchers typing at once |
| `session:resize` | on | resizes the host terminal to the watcher viewport; two watchers would fight |
| `session:create` | remoteGuard handle | folder path differs per device; host must map to its copy of the project; shell refusal exists |
| `session:destroy` | handle | closing a tab vs deleting a chat vs stopping the host process are three different things in the design |
| `session:list` | handle | today every phone sees all sessions of one computer; mesh needs one merged list (roster) not a forward |
| `session:browse` | handle | Resume list scans chat folders on this disk (T20): must read the chat store |
| `session:history` | handle | looks up the transcript file by id on this disk (T20) |
| `transcript:page` | handle | paged history reads the transcript file by id (T20) |
| `transcript:read-meta` | handle | takes a file path under ~/.claude/projects: a path that assumes shared disk |
| `session:set-flag` | handle | rename/complete/tags apply on every device: should become control-log entries, not a forward |
| `session:set-tag` | handle | rename/complete/tags apply on every device: should become control-log entries, not a forward |
| `session:set-note` | handle | rename/complete/tags apply on every device: should become control-log entries, not a forward |
| `session-naming:rename` | handle | rename/complete/tags apply on every device: should become control-log entries, not a forward |
| `session:get-meta` | handle | reads the local conversation record; becomes a read of synced meta |
| `session-naming:title` | handle | reads the local conversation record; becomes a read of synced meta |
| `chatsearch:read` | handle | reads chat files on this disk (T20) |
| `chatsearch:resolve` | handle | reads chat files on this disk (T20) |
| `project:list-conversations` | remoteGuard handle | lists chats of a project folder from the chat folder (T20) |
| `native:submit-admin-password` | handle | a password typed on the watcher would travel to the host |
| `models:load` | handle | loads a local model into memory on whichever machine runs it; sessionId optional |
| `engine:run-in-terminal` | handle | opens a plain shell session from a command; watchers should not |
| `artifacts:list-session` | remoteGuard handle | file panel for a chat: projectRoot and paths are local to a device; design 2.8 syncs project files instead |
| `artifacts:resolve-path` | remoteGuard handle | file panel for a chat: projectRoot and paths are local to a device; design 2.8 syncs project files instead |
| `dialog:open-file` | desktopOnly handle | picker on the watcher returns paths on the watcher disk; phone gets around it by uploading (file:upload) |
| `file:upload` | handle | phone-only upload to host temp folder; a computer watcher has nothing like it today |
| `native:sessions-list` | handle | lists native chats found on this disk (T20) |
| `model:read-last` | handle | takes a transcript file path and reads its last model (T20) |
| `fs:read-head` | handle | reads first bytes of a path; attachment preview; path assumes shared disk |

#### Do not forward (44)

| Channel | Kind and today's phone policy | Why |
|---|---|---|
| `session:selected` | desktopOnly refusal on | window/tab/terminal-flow bookkeeping of ONE window: stays local, already desktopOnly |
| `session:terminal-ready` | desktopOnly refusal on | window/tab/terminal-flow bookkeeping of ONE window: stays local, already desktopOnly |
| `session:terminal-ack` | desktopOnly refusal on | window/tab/terminal-flow bookkeeping of ONE window: stays local, already desktopOnly |
| `session:terminal-repaint` | desktopOnly refusal on | window/tab/terminal-flow bookkeeping of ONE window: stays local, already desktopOnly |
| `session:detach-start` | desktopOnly on | window/tab/terminal-flow bookkeeping of ONE window: stays local, already desktopOnly |
| `session:detach-live` | desktopOnly handle | window/tab/terminal-flow bookkeeping of ONE window: stays local, already desktopOnly |
| `session:drag-dropped` | desktopOnly on | window/tab/terminal-flow bookkeeping of ONE window: stays local, already desktopOnly |
| `session:drag-adopt` | desktopOnly on | window/tab/terminal-flow bookkeeping of ONE window: stays local, already desktopOnly |
| `session:drag-window-move` | desktopOnly on | window/tab/terminal-flow bookkeeping of ONE window: stays local, already desktopOnly |
| `session:drag-started` | desktopOnly on | window/tab/terminal-flow bookkeeping of ONE window: stays local, already desktopOnly |
| `session:drag-ended` | desktopOnly on | window/tab/terminal-flow bookkeeping of ONE window: stays local, already desktopOnly |
| `session:drop-resolve` | desktopOnly handle | window/tab/terminal-flow bookkeeping of ONE window: stays local, already desktopOnly |
| `session:reopen-list` | desktopOnly refusal handle | window/tab/terminal-flow bookkeeping of ONE window: stays local, already desktopOnly |
| `session:forget-reopen` | desktopOnly refusal handle | window/tab/terminal-flow bookkeeping of ONE window: stays local, already desktopOnly |
| `window:open-detached` | desktopOnly on | window/tab/terminal-flow bookkeeping of ONE window: stays local, already desktopOnly |
| `window:focus-and-switch` | desktopOnly on | window/tab/terminal-flow bookkeeping of ONE window: stays local, already desktopOnly |
| `buddy:set-session` | desktopOnly handle | window/tab/terminal-flow bookkeeping of ONE window: stays local, already desktopOnly |
| `attention:report` | desktopOnly on | window/tab/terminal-flow bookkeeping of ONE window: stays local, already desktopOnly |
| `attention:get-summary` | desktopOnly handle | window/tab/terminal-flow bookkeeping of ONE window: stays local, already desktopOnly |
| `remote:attention-changed` | desktopOnly on | window/tab/terminal-flow bookkeeping of ONE window: stays local, already desktopOnly |
| `dev:open-session-in` | desktopOnly handle | window/tab/terminal-flow bookkeeping of ONE window: stays local, already desktopOnly |
| `browser:state` | desktopOnly handle | a limit in 2.1 or needs the host machine; refused for a phone today (desktopOnly or no-remote) |
| `browser:watch` | desktopOnly handle | a limit in 2.1 or needs the host machine; refused for a phone today (desktopOnly or no-remote) |
| `browser:unwatch` | desktopOnly handle | a limit in 2.1 or needs the host machine; refused for a phone today (desktopOnly or no-remote) |
| `browser:frame-ack` | desktopOnly on | a limit in 2.1 or needs the host machine; refused for a phone today (desktopOnly or no-remote) |
| `browser:open-window-for-handoff` | desktopOnly handle | a limit in 2.1 or needs the host machine; refused for a phone today (desktopOnly or no-remote) |
| `browser:close-session` | desktopOnly handle | a limit in 2.1 or needs the host machine; refused for a phone today (desktopOnly or no-remote) |
| `browser:input` | desktopOnly on | a limit in 2.1 or needs the host machine; refused for a phone today (desktopOnly or no-remote) |
| `browser:selection` | desktopOnly handle | a limit in 2.1 or needs the host machine; refused for a phone today (desktopOnly or no-remote) |
| `browser:view-size` | desktopOnly on | a limit in 2.1 or needs the host machine; refused for a phone today (desktopOnly or no-remote) |
| `terminal:get-screen-text` | desktopOnly handle | a limit in 2.1 or needs the host machine; refused for a phone today (desktopOnly or no-remote) |
| `clipboard:save-image` | desktopOnly handle | a limit in 2.1 or needs the host machine; refused for a phone today (desktopOnly or no-remote) |
| `artifacts:append-version` | remoteAllowed:false handle | a limit in 2.1 or needs the host machine; refused for a phone today (desktopOnly or no-remote) |
| `handoff:begin` | handle (open to phone) | the handoff/lease system the mesh replaces (Phase 7); not forwarded |
| `handoff:status` | handle (open to phone) | the handoff/lease system the mesh replaces (Phase 7); not forwarded |
| `handoff:wait` | handle (open to phone) | the handoff/lease system the mesh replaces (Phase 7); not forwarded |
| `handoff:retry` | handle (open to phone) | the handoff/lease system the mesh replaces (Phase 7); not forwarded |
| `handoff:saved-copy` | handle (open to phone) | the handoff/lease system the mesh replaces (Phase 7); not forwarded |
| `handoff:force` | handle (open to phone) | the handoff/lease system the mesh replaces (Phase 7); not forwarded |
| `handoff:cancel` | handle (open to phone) | the handoff/lease system the mesh replaces (Phase 7); not forwarded |
| `handoff:create-params` | handle (open to phone) | the handoff/lease system the mesh replaces (Phase 7); not forwarded |
| `syncspaces:lease-query` | handle | lease operations the mesh replaces (Phase 7) |
| `syncspaces:lease-takeover` | handle | lease operations the mesh replaces (Phase 7) |
| `syncspaces:lease-force` | handle | lease operations the mesh replaces (Phase 7) |


Things the table shows that the design should know:

- **26 channels are plainly forwardable**, and all 26 already work for a phone. The session proxy for them is mechanical.
- **The 29 "needs thought" cluster into five questions**: (a) file paths that assume one disk (`native:send` attachments, `dialog:open-file`, `fs:read-head`, `transcript:read-meta`, `model:read-last`, `artifacts:*`); (b) reads of chat files on this disk (browse, history, paging, search, project conversation list, native list: the T20 list); (c) renames, completion and tags that must reach every device (should become control-log entries, not forwards); (d) terminal input and resize from several watchers at once; (e) a password (`native:submit-admin-password`) and shell sessions (`engine:run-in-terminal`) that should probably never cross the mesh. These are questions for the design, not for Destin yet, except possibly (e).
- `session:create` already has the right model: a `remoteGuard` refusing `provider:'shell'` for a phone. 2.1 says a chat can be started from another device; the folder in the payload is a path on the sender's disk and the host must map it to its own copy of the project.
- `session:destroy` is one call today but the design has three meanings (close a tab here, delete everywhere, stop the host's process). It cannot be forwarded as is.

## 4. What this changes in the design

- **2.1, "A watcher has the limits a phone has today":** replace with: "A watcher has the limits a phone has today (no assistant browser, no Office documents, no image paste, no dragging files in, and attaching a file from the watcher's own disk goes through upload). Today only the first is enforced for a phone; paste and drag silently do nothing and Office is hidden by a refusal. All four, and the sentence 'X is not currently supported from a remote client', are new work on every device." Also decide the attach button (section 5).
- **3.3, last bullet:** replace "Whether image paste and file drag are refused ... was not confirmed in code (pre-build item T9)" with: "Image paste and file drag are not refused: on a phone they do nothing silently (`saveClipboardImage` returns null; browser files carry no `path`). Office is refused at the host and hidden. Only `assistantBrowser` is a capability."
- **5.5, "Capabilities become per chat":** replace with the three requirements in 3.3: a chat argument on the capability read (about 19 of 45 call sites), new keys for image paste, file drop and Office (plus attach if decided), and a subscription so screens redraw when a chat's host changes. State that the per-chat set is the window's set minus the limits, not `REMOTE_SCREEN_CAPABILITIES` as written (its `sessionRecord` is false; a phone's real set overrides it in the handshake).
- **6.1 row S6:** add "needs a marker on each channel entry saying it is session-scoped (`scope: 'session'`), because the table has none today; 99 of 478 entries are session-scoped by this investigation's count (26 forward, 29 need a design answer, 44 are refused)". The test can then fail when a new session-scoped entry has no `peerAllowed` and no refusal.
- **7.1, last rows:** none for T9 beyond the above.
- **9, T9 row:** result recorded here.

## 5. Needs Destin

- **Attaching a file with the paperclip while watching from a computer.** Today a phone uploads the file to the computer and it works. A watcher on a computer would pick a file from its own disk, which the host cannot read. Options: (1) upload it like the phone does (recommended: nothing is lost, the file travels once, same behaviour as the phone); (2) list it as a watcher limit (simpler, but a real feature loss on a computer). Needs his choice because it changes what he can do on a watcher.
- **Dragging a file into the message box on the desktop** may already do nothing (see 3.1). If that is confirmed on a dev instance, he should hear it as a separate bug, not part of this feature.

## 6. Could not test here

- No runtime check of any behaviour above: the app was not launched (brief rule 1), so "silently does nothing" for paste and drag, and the Electron `File.path` question, are from code reading only. UNVERIFIED at runtime.
- No Android phone, so the Android-local picker (`android:pick-files`) and the Android WebView's handling of paste and drag were not looked at beyond the shim code.
- Windows and macOS clipboard behaviour for `clipboard.read()` was not checked.
