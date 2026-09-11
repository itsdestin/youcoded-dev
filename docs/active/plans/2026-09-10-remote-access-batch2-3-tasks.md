---
status: draft
branch: session/remote-first-connect
---

# Remote access batches 2 and 3 — task breakdown

From `docs/active/specs/2026-09-10-remote-access-batch2-3-technical-design.md` revision 2
(round 1: 16 findings, all accepted; round 2 pending). Contract signed 2026-09-10
(21 rows). The mockups are on the branch already; these tasks are the backend under them
and the renderer changes the design names.

Each task: one reviewer, one branchable unit, its own tests written **before** the fix
where the design lists a regression. Desktop tasks end with `bash scripts/verify.sh
<worktree>`; the Android task with `./gradlew test` and the count read from
`app/build/test-results/`.

## Batch 2 — conversation restoration

**T1 · Readiness handshake and the per-client queue** (§1 A, B; §6 seq)
`client:ready { seq, reconnect, ptyOffsets }` in the shim, sent on the first `chat:hydrate`
listener after `auth:ok` (and at once on reconnect); on the host a per-client phase,
`restoring` → `live`, a bounded queue of every broadcast except `pty:output` (and
`hook:event` on first connect), the flush after the buffers, `chat:hydrate { seq }`, the
5 s old-client fallback, the `_replay` message deleted, the 500 ms timer deleted.
*Tests:* design test 1 (both halves), the source guard on the timer.
*Blocks:* T2, T4, T5.

**T2 · The terminal backlog and `pty:reset`** (§1 C, §7)
Shim: per-session backlog for `pty:output:<sid>` / `pty:raw-bytes:<sid>` until the first
listener; `pty:reset` → `TerminalView` `reset()`. Host: `PtyBuffer` gains a monotonic
offset and chunk-boundary cuts; `client:ready.ptyOffsets` drives tail-or-reset; reconnect
replays only unresolved permission requests; constant renamed `PTY_BUFFER_UNITS`.
*Tests:* design tests 2 and 7.
*Depends:* T1.

**T3 · Snapshot from every window, merged by owner, with `focus` and `pending`** (§2)
`requestSnapshot` over `windowRegistry.getDirectory()`, one 2 s budget, merge owner →
mainWindow → leader, omit-and-degrade for unanswered owners and pending sessions;
`RemoteSnapshotExporter` marks pending; snapshot `focus`; `session:destroyed` carries
`focus`.
*Tests:* design test 3; the `focus` half of test 4.
*Independent of T1* (pure main-process); lands before T4 so T4 can test against it.

**T4 · Per-session apply, place, and single source** (§3, §4, §6)
Reducer: `HYDRATE_CHAT_STATE` applies per session when `degraded`; App: no selection on
`session:created` while restoring, the stored place (sessionStorage + localStorage
fallback keyed by `hostId`), first-connect default from `focus`, no `loadFirstPage` in
remote mode; shim: `remote:conversation-status` phases, `remote:rehydrate { seq }` and the
stale-seq guard; host: rehydrate re-enters `restoring`. Preload declares the two channels;
desktop IPC answers `not-remote`; MOCK_ONLY rows for them come off.
*Tests:* design tests 4, 5, 6.
*Depends:* T1, T3.

**T5 · The switch stays on its own screen** (§5)
Delete the Android-only `switch-view` broadcast and the `uiAction` receiver's branch.
*Tests:* a `switch-view` action received over remote changes no view mode.
*Independent.*

## Batch 3 — file reading

**T6 · Read services and the remote cases** (§8, §9)
Extract `main/artifacts/read-service.ts` and `main/project-read-service.ts`; `ipcMain`
and the remote `case`s call them; remote cases pass `maxBytes` from
`remote-file-limits.ts` and answer `too-large` after `stat`; WS subscriber ids for the
project watcher, dropped on close; the watcher sink broadcasts `artifacts:changed`; the
post-hydrate `{ projectRoot: null }` and its renderer handling.
*Tests:* design test 8; `remote-channel-parity.test.ts` stays green by construction.
*Independent of batch 2* except the post-hydrate push, which lands with T4's hook.

**T7 · Download: mint, route, stream** (§10)
`artifacts:download` on the host with the stated policy (no size gate), the token map
bound to device and socket, absolute URLs, `GET /download/<token>` with Range/416,
encoded `Content-Disposition`, `nosniff`, per-socket live-stream cap with close
accounting, re-canonicalize + `fstat` at open, invalidation on unpair and restart; the
shim opens the URL through `<a download>`; preload declares the channel and desktop IPC
answers `not-remote`; the MOCK_ONLY row comes off.
*Tests:* design tests 9 and 11.
*Depends:* T6 (policy helpers).

**T8 · Android: the WebView downloads** (§10, Android column)
`DownloadListener` in `WebViewHost.kt` handing `http(s)` URLs to `DownloadManager`.
*Tests:* design test 12.
*Depends:* T7 (the URL shape). The one Kotlin change in the batch.

**T9 · Sealed previews pinned** (§10 decision)
The source guard on `HtmlView`'s sandbox attribute (known-positive `allow-scripts`).
*Independent.* Tiny; pairs with whoever is idle.

## Order

T1 → T2 and T3 → T4, with T5 and T9 picked up by a second worker at any point;
T6 → T7 → T8 in parallel with batch 2 from the start. The post-hydrate
`artifacts:changed` push is the one seam between the halves and lands with T4.

## After the build

A phone pass on the built branch **before** the reviewers (batch 1's lesson), covering the
"Still to prove at runtime" list in the design. Then the code reviewer and the UX tester's
second run in parallel, triage, the fresh grader, the acceptance deck. No merge without
Destin's word.
