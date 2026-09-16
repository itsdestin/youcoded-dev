---
status: active
branch: session/remote-first-connect
---

# Remote access batches 2 and 3 — task breakdown

From `docs/archive/specs/2026-09-10-remote-access-batch2-3-technical-design.md` revision 4,
final, after three review rounds (16, 19 and 8 findings, all 43 accepted). Contract signed
2026-09-10 (21 rows). The design's section numbers below are revision 4's.

**Two worktrees, two branches, one merge.** Batch 2 is built on
`session/remote-first-connect` in `worktrees/sessions/remote-first-connect/youcoded`;
batch 3 on `session/remote-first-connect-files` in
`worktrees/sessions/remote-files-build/youcoded`, cut from the same commit. The two halves
touch `remote-server.ts` in different regions (the replay path vs the case switch), so the
files branch merges back into the session branch when both are green. The mockups are on the branch already; these tasks are the backend under them
and the renderer changes the design names.

Each task: one reviewer, one branchable unit, its own tests written **before** the fix
where the design lists a regression. Desktop tasks end with `bash scripts/verify.sh
<worktree>`; the Android task with `./gradlew test` and the count read from
`app/build/test-results/`.

## Batch 2 — conversation restoration

**T0 · The transcript batch flushes on demand** (§1 cut line, R3-1)
Move App's `pendingTranscriptActions` batcher into a module with
`flushTranscriptActions()`; `chat-context.ts` gains `getState`; `RemoteSnapshotExporter`
flushes then serializes the store, never the ref; the hydrate handler flushes before
`HYDRATE_CHAT_STATE`. **The one thing the builder must not get wrong.**
*Tests:* the real batcher and exporter under jsdom — a delta in the frame before the
export is in the snapshot; the hidden-window case.
*Blocks:* T1.

**T1 · Readiness handshake and the per-client queue** (§1 A, B; §6 seq)
`client:ready { seq, reconnect, ptyOffsets }` in the shim, at most once per connection
generation; `seq` monotonic for the shim's lifetime; `handleMessage` stamped with the
generation. Host: `restoring` → `readying` → `live`, a bounded queue of every broadcast
except `pty:output` (and `hook:event` on first connect until the hook pass starts),
`snapshotIndex` and the cut-line skip on flush (never for omitted sessions),
`chat:hydrate { seq }`, the 5 s old-client fallback cancelled by `client:ready`, a second
`client:ready` ignored, the `_replay` message and the 500 ms timer deleted.
*Tests:* design test 1, the source guard on the timer.
*Depends:* T0. *Blocks:* T2, T4.

**T2 · The terminal backlog, the cursor replay, and consent** (§1 C, §7)
Shim: per-session ordered backlog for `pty:output:<sid>` and `pty:reset:<sid>` until the
first listener; `pty:reset` → `TerminalView` `reset()` and jump to the bottom. Host:
`PtyBuffer` gains an `epoch`, a monotonic count with a `base` that advances on every head
trim, and exact-offset slicing; the replay is a per-client cursor (`sentUnits`) with the
send gate on `bufferedAmount` (pause above 8 MB, close above 32 MB), `live` only after an
empty pass; reconnect replays only unresolved permission requests and ends with
`hook:replay-complete` for every session; the `PermissionResolved` dispatcher case and the
`PERMISSION_RESOLVED_ELSEWHERE` reducer action, neutral copy, never `failed`; constant
renamed `PTY_BUFFER_UNITS`.
*Tests:* design tests 2, 7 and 11.
*Depends:* T1.

**T3 · Snapshot from every window, merged by owner, with `focus` and `pending`** (§2)
`requestSnapshot` over `windowRegistry.getDirectory()`, one 2 s budget, merge owner →
mainWindow → leader, omit-and-degrade for unanswered owners; pending decided by the host
from `windowRegistry.isPendingTransfer` (new, non-consuming) plus the exporter's
`history.loading`; `session:selected` from App to main, cached per window; snapshot
`focus`; `session:destroyed` carries `focus`.
*Tests:* design test 3; the `focus` half of test 4.
*Independent of T0/T1* (main-process and one preload send); lands before T4.

**T4 · Per-session apply, place, and single source** (§3, §4, §6)
Reducer: `HYDRATE_CHAT_STATE` applies per session when `degraded`, keeps
`queuedMessages` and un-echoed pending bubbles in both branches, marks delivered sessions
`history.hydrated`; App: `placeDecided` gates every selection site in remote mode, the
stored place (sessionStorage + localStorage fallback keyed by `hostId` from the target or
`location.host`), first-connect default from `focus`, `session:destroyed.focus` with the
first-remaining fallback, `loadFirstPage` skipped only for hydrated sessions, the hydrate
handler reports `{ seq, kept }` to the shim; shim: `remote:conversation-status` phases
(incomplete while any session is kept), `remote:rehydrate { seq }` and the latest-seq
guard; host: rehydrate re-enters `restoring` with `snapshotIndex`. Preload declares the
channels; desktop IPC answers `not-remote`; the MOCK_ONLY rows come off.
*Tests:* design tests 4, 5, 6.
*Depends:* T1, T3.

**T5 · The switch stays on its own screen** (§5)
Delete the Android-only `switch-view` broadcast and the `uiAction` receiver's branch.
*Tests:* a `switch-view` action received over remote changes no view mode.
*Independent.*

## Batch 3 — file reading

**T6 · Read services and the remote cases** (§8, §9)
Extract `main/artifacts/read-service.ts` and `main/project-read-service.ts`; `ipcMain`
and the remote `case`s call them; `readArtifactBytes` resolves with `realpath` before
`canonicalize` and `evaluateBinaryRead` on both transports; remote cases pass `maxBytes`
from `remote-file-limits.ts` and answer `too-large` after `stat`; WS subscriber ids for
the project watcher, dropped on close; the watcher sink broadcasts `artifacts:changed`;
`useProjectWatch` re-subscribes on a `connected` transition; the two list channels join
`REHYDRATE_ON_RECONNECT`; `remote-channel-parity.test.ts` gains the `artifacts:` and
`project:` prefixes and the explicit `client:ready` / `pty:reset` names.
*Tests:* design test 8.
*Independent of batch 2.* Built on the files branch.

**T7 · Download: mint, route, stream** (§10)
`artifacts:download` on the host with the stated policy (`realpath`, sensitive first,
binary rule or artifact read, no size gate, `bigint` stat, `ino === 0n` refused), the
token map with sliding expiry bound to device and socket, absolute URLs from the target
or `location.origin`, `GET /download/<token>` matched before the static handler with
`O_RDONLY | (O_NOFOLLOW ?? 0)`, the `dev`/`ino` compare, `ELOOP` → 404, `Range` / 416 /
`If-Range` / `ETag` / `Accept-Ranges` / `Content-Length` / `Last-Modified`, encoded
`Content-Disposition`, `nosniff`, the per-socket live-stream cap keyed on the token's
`socketId` with entries deleted at zero, invalidation on unpair and restart; the shim
opens the URL through `<a download>`; preload declares the channel and desktop IPC
answers `not-remote`; the MOCK_ONLY row comes off.
*Tests:* design test 9.
*Depends:* T6 (policy helpers). Built on the files branch.

**T8 · Android: the WebView downloads** (§10, Android column)
A pure Kotlin decision function (`/download/` on any http(s) host → download; other remote
→ open externally; local → load) driven from both `shouldOverrideUrlLoading` and a
`setDownloadListener` in `WebViewHost.kt`, enqueuing on `DownloadManager`.
*Tests:* design test 12; `./gradlew test` with the count read from the results.
*Depends:* T7 (the URL shape). The one Kotlin change in the batch. Built on the files
branch.

**T9 · Sealed previews pinned** (§10 decision)
The source guard on `HtmlView`'s sandbox attribute (known-positive `allow-scripts`).
*Independent.* Tiny; pairs with whoever is idle.

## Order

Session branch: T0 → T1 → T2, T3 → T4, with T5 and T9 at any point. Files branch, in
parallel from the start: T6 → T7 → T8. Then the files branch merges into the session
branch; `verify.sh` and `./gradlew test` on the result.

## After the build

A phone pass on the built branch **before** the reviewers (batch 1's lesson), covering the
"Still to prove at runtime" list in the design. Then the code reviewer and the UX tester's
second run in parallel, triage, the fresh grader, the acceptance deck. No merge without
Destin's word.
