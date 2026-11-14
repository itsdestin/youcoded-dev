---
status: active
date: 2026-11-14
topic: Mesh Phase 0, T20 — every source file that reads or writes a chat file, and what it does on a device that is not the host
---

# T20: who reads chat files

## 1. Verdict

**PASS** against the section 9 line ("a table with a decision per file"). The real count is **29 files that read or write chat files directly** (23 touch Claude Code's chat folder, 6 more touch only the native chat folder), plus **13 files that reach chat files only by calling one of the 29**. The design's "about 26" is close to a plain text search of the Claude Code folder alone (28 files), but it undercounts: the native folder, the helper-file readers and the search index are not all in it. Of the 29: 12 should read through the chat store, 10 are host-only and fine as they are, 3 are deleted anyway by 7.1, and 4 need a design answer.

## 2. What was done

Read-only, in `youcoded/desktop/src/` (Android Kotlin, hook scripts, the marketplace plugin and workspace scripts were searched separately, see 3.4). No code run, no chat file opened.

Search, from `youcoded/desktop/src` (test files and `renderer/dev/` excluded):

1. `rg -l "ccProjectSlug|'\.claude', 'projects'|PROJECTS_DIR|projectsDir|claudeConfigDir|claudeProjects\b|CLAUDE_PROJECTS" . --glob '!*.test.*' --glob '!renderer/dev/**'` gives **28 files** (Claude Code folder).
2. `rg -l "nativeStoreSlug|'\.youcoded', 'sessions'|NATIVE_SESSIONS|sessionFilePath|listSessionFiles|SessionStore\b|session-store'" ...` gives **31 files** (native folder). Union of 1 and 2: **46 files**.
3. Wider sweeps to catch readers the path words miss: `rg -c "\.jsonl|transcriptPath|transcript_path|projectsDir|PROJECTS_DIR|ccProjectSlug|nativeStoreSlug|sessionsRoot|session-store"` over `desktop/src`, `desktop/hook-scripts`, `app/src`; `rg -l -i "transcript"` over `main/` and `shared/` (about 120 files); `rg -l -i "\.claude['\"/]"` over `main/`; `rg -l "subagents|tool-results|'plans'|'todos'|conversation-index|history\.jsonl"`; and an import check (`rg -l "from '[./]*([a-z-]+/)*<module>'"`) for each of the 17 modules that own a path helper, to find files that call a reader without naming a path.
4. Each of the 46 plus the sweep hits was then opened at the matching lines and sorted into: **direct** (opens, lists, stats, writes, moves or deletes a chat file or folder), **indirect** (owns no path, calls a direct one), **adjacent** (same folder, not a chat), or **false hit**.

Re-run note: step 4 is judgement; steps 1 to 3 are commands and give the same lists.

## 3. Findings

### 3.1 The 29 files that read or write chat files directly

Decision codes: **S2** = read through the chat store; **HOST** = host-only, fine as it is; **GONE** = deleted by 7.1 anyway; **ASK** = needs a design answer.

"Not the host" below means: no process runs the chat there, and (by 4.2 idea 2) no working file is read. Whether the file is simply absent or a stale copy depends on the device; both are covered by the same answer.

**Claude Code chats (`~/.claude/projects`), 23 files**

| # | File (under `main/`) | What it does | On a device that is not the host | Decision |
|---|---|---|---|---|
| 1 | `transcript-watcher.ts` | Tails the chat file by byte offset; turns lines into blocks; learns the path from the `SessionStart` hook (`ipc-handlers.ts:2093-2098`) or `ccProjectSlug(cwd)` (line 719). | Never started: no process, no hook. If started with no file it polls forever. | HOST. It is the ancestor of the S1 adapter (6.1). A device with only lines needs the same line-to-block parser fed from the store (see ASK 1 below). |
| 2 | `subagent-watcher.ts` | Tails helper-agent files under `<id>/subagents/`; `getHistory` replays them for old pages. | Live part: never started. Replay part: folder missing, helper cards empty. | HOST for live; the replay reads extras (5.3's helper files) from the store (S2). |
| 3 | `transcript-page.ts` | Reads one page of history from a file by byte range, plus helper history. Cursors are byte offsets. | File missing: the page source says "could not locate it" (`transcript-page-source.ts:113`), so the chat opens empty. | S2. Cursors must become line numbers. |
| 4 | `transcript-page-source.ts` | Builds the file path from the folder and id; remembers it per session; `snapshotResumeBoundary` stats the file before a resume. | Same: `get()` returns null when the file is not there. | S2 (boundary part is HOST: it runs only when the device resumes a chat as host). |
| 5 | `transcript-cwd.ts` | Reads the first lines of every chat file in a slug folder to recover which project folder it belongs to. Used by the resume browser and slug repair. | No folder: returns null. | S2. The store knows each chat's folder from its roster entry; no need to read bytes. |
| 6 | `transcript-utils.ts` | `readTranscriptMeta(path)`: reads head and tail for model and context percentage. Only caller is the `transcript:read-meta` channel. | Returns null. | S2. See also 3.5: no screen calls it. |
| 7 | `session-browser.ts` | The Resume list: scans both folders, reads each file's title, model and counts, and merges with the synced conversation records. Already tolerates a missing folder ("NORMAL on a fresh secondary device", lines 532-541) and marks rows `missingProject` or `notSyncedYet` (`shared/types.ts:1527-1535`). `loadHistory` reads history by id. | List shows only what the synced records say; rows whose file is missing cannot be resumed. | S2. Largest single change: the list, per-chat title and counts must come from the store and roster, not from scanning. |
| 8 | `claude-queue-evidence.ts` | Scans every slug folder for a chat's file to prove a queued message reached Claude Code. | File absent, so "unknown", never "resend". | HOST. The queue belongs to the host's process. A forwarded queue action is answered by the host. |
| 9 | `ipc/session.ts` | `findTranscriptSlug` scans the folder for a chat id (used by `session:history` and the page fallback); `transcript:read-meta` checks the path is under `~/.claude/projects`. | `session:history` returns `[]`. | S2. |
| 10 | `ipc/model.ts` | `model:read-last`: reads the **whole** chat file to find its last model. Path must be under `~/.claude/projects`. | Returns null. | S2. See 3.5: no screen calls it, and it reads up to 300 MB whole. |
| 11 | `ipc-handlers.ts` | Mixed: the resume boundary and model before launching `claude --resume` (lines 636-664); starts the watcher from the hook (2098); the transcript-page closure (1687-1731) that finds a file by id; the handoff glue (1410-1463); the native "does this file exist" probe (187). | Host parts do not run; page closure returns nothing; handoff glue never matters. | ASK 2: it needs splitting by part: launch and watcher parts HOST, page closure S2, handoff glue GONE. |
| 12 | `conversations/service.ts` | Owns the conversation records; `mirrorIn` copies each finished reply's chat file into the Personal space and `materializeOut` writes files back out (grow-only by size); builds the local path (line 374). | Writes files into a device that is not the host, which is exactly what 4.2 forbids. | GONE (7.1 deletes the mirror and record syncing). Keep `localTranscriptPath`'s job inside S7 `becomeHost`. |
| 13 | `conversations/reconciler.ts` | Scans `~/.claude/projects`, creates a conversation record for every file found, and mirrors it. | Nothing to scan on a device that never ran Claude Code there. | ASK 3: 7.1 keeps naming, tags, slug repair and `resolve-local-project` but does not name the reconciler. With records gone, "a chat exists" must come from the S1 adapter on the host. Probably replaced. |
| 14 | `conversations/slug-repair.ts` | **Writes.** Once per launch, merges, moves and quarantines duplicate or wrong-named chat folders and files (never deletes; quarantine in `~/.youcoded/repair-quarantine`). Wired in both `main.ts` and `headless/headless-boot.ts:310`. | Nothing to repair. | HOST, with one rule: it moves working files under the S1 adapter, so the adapter must treat "file moved or replaced" as a normal event (S1 already lists "file replaced"). The store is keyed by chat id, not folder name, so the repair does not touch it. |
| 15 | `conversations/symlink-sweep.ts` | Deletes leftover symlinks in the folder, once at launch (`main.ts:1927`). | Nothing there. | HOST. |
| 16 | `conversations/handoff-transcript.ts` | Publishes and imports a chat file for the old handoff (checks the file's identity and size). | Part of the old handoff. | GONE (7.1 lists `handoff-*.ts`). |
| 17 | `conversations/transcript-mirror.ts` | The two copy functions `service.ts` uses. | Same as 12. | GONE. |
| 18 | `sync-spaces/import-project.ts` | When a project's folder moves on this device, renames the chat folder `ccProjectSlug(old)` to `ccProjectSlug(new)` so chats follow it (lines 247-257). | No chat folder: skipped. | HOST. |
| 19 | `chatsearch-index/index-worker.ts` | Builds each chat's path (both folders) and hands the list to the indexer. Runs in a worker. | Records point at files that are missing. | S2. |
| 20 | `chatsearch-index/index-store.ts` | Reads each chat file in chunks, from a saved offset, to append user turns to the search index. | A missing file is skipped; the index keeps what it had. | S2 (feed the indexer from lines as they arrive, so an evicted chat body is not needed later). |
| 21 | `chatsearch-index/refresh-core.ts` | Picks the local file, else the space copy (`resolveTranscriptPathTwoStep`), and checks it exists with `lstat`. | Falls to the space mirror path; "tombstone" if neither exists. | S2 (the "space mirror" step goes with 12 and 17). |
| 22 | `chatsearch-index/refs-service.ts` | Answers `chatsearch:resolve` and `chatsearch:read`: finds a chat's file by id or slug and reads a slice for the preview card. | "Not found" or "outside roots" error text. | S2. |
| 23 | `chatsearch-index/transcript-reader.ts` | Reads the slice (head/tail, cached by mtime and size). | Same error texts. | S2. |

**Native chats only (`~/.youcoded/sessions`), 6 more files** (the six above that also name the native path: 7, 11, 12, 19, 22 and `handoff-transcript.ts`, are already counted)

| # | File | What it does | On a device that is not the host | Decision |
|---|---|---|---|---|
| 24 | `harness/session-store.ts` | The writer, reader and lister of native chat files (append, read back, header, `listAsync`). | No file, so the list is empty there. | HOST. It is the native S1 source; a device that becomes host writes a fresh working file from the store (S7). |
| 25 | `native-home.ts` | Path helpers (`sessionFilePath`), `listSessionFiles`, and `writeSessionArtifact` / `readSessionArtifact` for oversized helper reports. | Same. | HOST. The report spill files are "extras" (5.3 lists `specialist-reports/`). |
| 26 | `harness/native-session-host.ts` | Opens and continues native chats from the store; lists them (`listAsync`); writes report spills; `captureHandoffWriter` for the old handoff. | Not running a chat there. | HOST. Handoff part GONE. |
| 27 | `harness/accepted-history-store.ts` | Reads the native chat file to check and restore a provider-cache continuation record kept in the app's private folder (`private-continuation/`, not synced). | A new host has no record, so it falls back to rebuilding from the file (reasons `missing-transcript`, `binding-mismatch`). | HOST. Confirm in test that the fallback is a full rebuild, not an error. |
| 28 | `harness/shell-sidecar.ts` | **Writes** `<id>.shells.json` beside the native chat file: records of background commands the chat started. | Not present. | ASK 4: a sidecar beside the chat that 5.3's extras table does not list. On a new host these would read as "maybe still running" for processes on another machine. |
| 29 | `harness/specialists/delegation-ledger.ts` | **Writes** `<id>.delegations.json` beside the native chat file (helper-agent bookkeeping). | Not present. | ASK 4: same question. |

Counting: rows 1 to 23 = 23 Claude Code files (rows 7, 11, 12, 19, 22 also touch the native folder). Rows 24 to 29 = 6 native-only files. **23 + 6 = 29.**

Decision tally, each file counted once by its main decision: **S2 = 12** (rows 3, 4, 5, 6, 7, 9, 10, 19, 20, 21, 22, 23); **HOST = 10** (rows 1, 2, 8, 14, 15, 18, 24, 25, 26, 27); **GONE = 3** (rows 12, 16, 17); **ASK = 4** (rows 11, 13, 28, 29). Total 29. Rows 2, 4 and 26 have a second part with the other answer, stated in the row.

### 3.2 Files that reach chat files only by calling a direct one (13)

These need no change of their own; they follow whichever answer their callee gets.

`project-conversations.ts` and `artifacts/projects-index.ts` (the project's chat list and counts, through `listPastSessions`); `project-read-service.ts` (calls the first); `conversations/resume-model.ts` (model of a resumed chat, through `readSessionTranscriptMeta`); `conversations/takeover.ts` and `conversations/handoff-attempt.ts` (old handoff, GONE); `chatsearch-index/meta-builder.ts` (stores the path and a "tombstone" flag); `session-open.ts` (calls the page reader); `claude-queue-transport.ts` (calls `verifyClaudeQueueEvidence`); `create-runtime.ts` (builds the native store); `ipc/native.ts` (`native:sessions-list`, calls `listAsync`); `main.ts` and `headless/headless-boot.ts` (wire slug repair, the sweep and the conversation store; both must stay in step, per section 3).

### 3.3 Same folder, not chats (leave alone, but know they exist)

- `sync-service.ts:688, 828` and `sync-state.ts:460-463`: the old Drive/iCloud backup copies each project's `memory/` folder out of `~/.claude/projects/<slug>/` and checks the folder exists. Not chat files.
- `project-context.ts:85-91`: reads Claude Code's per-project `memory/` folder. Not a chat. It is the only other thing 5.3 does not cover that lives beside chats (flagged in 3.6).
- `retention-default.ts`: writes `cleanupPeriodDays` into Claude Code's settings. This is why 4.2 idea 2 says the store must keep its own bytes.
- `harness/permission-store.ts`: keys "always allow" rules by `nativeStoreSlug`, but stores them in `~/.youcoded/permissions.json`, not beside chats.

### 3.4 Other places searched, with results

- **Android app (`youcoded/app/src`)**: `rg -n -i "transcript|\.jsonl|conversations|sessions/" app/src/main --glob '*.kt'` finds only two comments (`RuntimeInstaller.kt:28`, `CleartextPolicy.kt:7`). It reads no chat file; the phone runs this same desktop backend, so every row above applies to it unchanged.
- **Hook scripts (`desktop/hook-scripts/`)**: `rg -n "transcript|projects|jsonl|\.claude/"` shows they touch `topics/`, `.sync-status`, `.context-<id>` and logs, and `write-guard.sh` only mentions `history.jsonl` in an exclusion. None reads a chat file. (Claude Code's hook payload carries `transcript_path`; the app's hook relay hands it to the watcher, row 1.)
- **Renderer**: no file reads chat files itself. It reaches them only through channels: `session.browse` (5 files: `App.tsx`, `ResumeBrowser.tsx`, `SyncPanel.tsx`, `buddy/BuddyResumeList.tsx`, `pages/page-chats.ts`), history paging (`state/chat-reducer.ts`, `pages/page-chats.ts`), `chatsearch.read/resolve` (`SessionPreviewPane.tsx`, `hooks/useResolvedConversations.ts`), `project.listConversations` (`ProjectView.tsx`), `native.sessionsList` (`ModelPickerPopup.tsx`). These all follow rows 7, 9, 22, and the project and native-list entries.
- **Pty worker (`pty-worker.js:519`)**: comment only. It strips environment variables so Claude Code writes a top-level chat file; reads nothing.
- **Tests and dev probes** (`tests/`, `test-conpty/`, `renderer/dev/workbench/`): excluded on purpose (not shipped).
- **Usage and cost counters, analytics, crash-resume repair, exports**: searched for by name and by path; **no separate file reads chat files for them**. `analytics-service.ts`, `crash-diagnostics.ts`, `harness/pricing.ts` and `legacy-cleanup.ts` matched the broad word search but hold no chat-folder path (checked: `rg -n "projects|\.jsonl|ccProjectSlug|nativeStoreSlug|sessionsRoot"` over those four finds nothing). Crash-resume of a Claude Code chat is the watcher (row 1) plus `snapshotResumeBoundary` (row 4); of a native chat, `session-store.ts`/`native-session-host.ts`. There is no chat export feature that reads these files in the source tree.

**The `youcoded-chatsearch` plugin and skill** (`wecoded-marketplace/youcoded-chatsearch/`): `rg -n "projects|\.jsonl|sessions|\.youcoded"` shows it reads **only the app's own search index** at `~/.youcoded/chatsearch/<provider>-meta.json` and `<provider>-turns.jsonl`; it never opens a chat file, and its notes say it "never edits the index". So it needs no change **as long as the app keeps writing that index on every device**. The index itself is built by rows 19 to 23, so the index becomes right on a watcher only when those rows read the store.

### 3.5 Incidental findings (not asked, worth knowing)

1. `dialog.readTranscriptMeta` and `model.readLastModel` have **no caller** in the renderer or main: `rg -n "readTranscriptMeta\(|readLastModel\(" renderer main --glob '!*.test.*'` finds only their definitions (`preload.ts`, `remote-shim.ts`, `ipc/session.ts:386`). The two channels (`transcript:read-meta`, `model:read-last`) look dead; `model:read-last` reads the whole file into memory. UNVERIFIED that nothing outside this tree calls them (the phone and Android pages share this renderer, so I expect not). If dead, removing them removes rows 6 and 10 from the problem. A fix is outside this task, so none was made.
2. `session-browser.ts` already unions the folder scan with synced records and survives a missing folder, so rows 7, 19 to 23 are a change of source, not a new capability.
3. The conversation records (`ConversationRecord`, `transcriptRef`) are the search index's and resume list's source of "which chats exist" (`index-worker.ts:16`, `refresh-core.ts:54`). 7.1 deletes record syncing. So S2 alone is not enough for those two: something must replace the record as the list of chats (the roster plus per-chat summary in 5.3 and 6.5).

### 3.6 What 5.3 does not list as chat "extras"

The extras table covers helper files, saved outputs, plan and to-do. Found beside chats and not covered: the two native sidecars (`.shells.json`, `.delegations.json`, rows 28 and 29), Claude Code's per-project `memory/` folder (3.3), and the optional accepted-history record (row 27, deliberately private and safe to lose).

## 4. What this changes in the design

- **7.1, row "Everything that reads chat files directly":** replace "About 26 source files reference Claude Code's chat folder (chat search, the resume browser, transcript paging, the reconciler, slug repair)" with: "29 source files read or write chat files directly (23 touch Claude Code's folder, 6 more only the native folder) and 13 more reach them through those (T20). 12 must read through the chat store, 10 run only on the host and stay as they are, 3 are deleted with the old handoff and mirror, and 4 need an answer: the reconciler, the three-way split of `ipc-handlers.ts`, and the two native sidecars. The chat-search index and the Resume list also need a replacement for the conversation record as their list of chats."
- **5.3 extras table:** add a row for the native sidecars `<id>.shells.json` and `<id>.delegations.json` once decided (ASK 4), and a line that Claude Code's per-project `memory/` is outside the chat store.
- **5.3 or S2:** note that the read side must serve (a) pages by line number, not byte offset, (b) the Resume list's title, model and counts, (c) the folder of a chat, (d) search turns, and (e) helper-file history. Those are the five read shapes the 12 S2 files use today.
- **4.2 idea 2 (working copies):** add "slug repair, the launch sweep and project moves rewrite working files on the host; the adapter must treat a moved or replaced file as an ordinary event."
- **9, T20 row:** result recorded here.

## 5. Needs Destin

Nothing. The four open points are design questions for the lead and builder. (ASK 4, whether the native helper bookkeeping should follow a chat to a new host, will become a user-visible choice only if it changes what he sees after Continue here; the lead can decide whether to bring it to him.)

## 6. Could not test here

- Nothing was run, so "what happens when the file is absent" is from reading the code's own handling (for example `transcript-page-source.ts:113`, `session-browser.ts:536`) and not observed. UNVERIFIED at runtime for rows 3, 20, 22.
- Windows-specific paths (drive-letter casing in `ccProjectSlug`, junctions) were not exercised; this machine is Linux only.
- No second device was available to see a real stale working copy; the "stale versus absent" distinction is argued from 4.2, not observed.
- The "13 indirect" and "false hit" classifications are my reading. The 29 and the 46 can be re-derived with the commands in section 2.
