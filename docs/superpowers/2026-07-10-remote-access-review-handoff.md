# Remote Access / Remote Server — Review Findings Handoff

**Date:** 2026-07-10
**Source:** Full-codebase review of youcoded master (commit `4f02dacd`, no open PRs) covering correctness, performance, dead code, and complexity. This doc collects every finding that touches the remote access system so a dedicated session can fix/improve/rework it as a unit. All file:line references were verified against master on the review date.

**Scope of the future session:** `desktop/src/main/remote-server.ts`, `desktop/src/renderer/remote-shim.ts`, the `chat:hydrate` path, and remote-relevant parts of `chat-types.ts` serialization. Read `docs/PITFALLS.md → Remote Access State Sync` before starting — the single-source `chat:hydrate` rule, the attentionMap diff, and the Electron-only `RemoteSnapshotExporter` are pinned invariants.

---

## Finding 1 (HIGH, correctness): `chat:hydrate` ID collision corrupts remote chat history

`desktop/src/renderer/state/chat-reducer.ts:13-25` — `messageCounter` / `groupCounter` / `turnCounter` are module-level and start at 0 in every JS context. IDs are deterministic (`turn-1`, `group-1`, `msg-1`).

A remote browser hydrates the desktop's serialized `ChatState` (containing the *desktop's* low-numbered IDs) via `chat:hydrate`, then mints the same IDs from its own fresh counters when live transcript events arrive. `getOrCreateTurn` (chat-reducer.ts:45) does `assistantTurns.set('turn-1', …)` — **overwriting a hydrated historical turn's segments** while also pushing a second `{kind:'assistant-turn', turnId:'turn-1'}` timeline entry. The oldest historical assistant reply visibly morphs into a copy of the newest streaming response. Same collision class for `group-1` (old tool group renders new tools) and `msg-1` (duplicate React keys).

Reproduces whenever the hydrated state contains low-numbered IDs — i.e., any session created early in the desktop app's process lifetime. Deterministic, not a race.

**Fix shape:** reseed the three counters above the max numeric suffix found in hydrated state inside `deserializeChatState` (chat-types.ts), or namespace IDs with a per-context random prefix. Reseeding is the smaller diff; prefixing is the more robust design (also covers two remotes + broadcastAction cross-talk). Add a regression test: serialize a state containing `turn-1..3`, hydrate into a fresh module context (vitest module reset), dispatch a `TRANSCRIPT_ASSISTANT_TEXT`, assert no overwrite.

## Finding 2 (HIGH, perf): rolling PTY replay buffer does an O(4MB) string copy per chunk — with zero clients connected

`desktop/src/main/remote-server.ts:23` (`PTY_BUFFER_SIZE = 4MB/session`) and `:244-255` — `buf += data` reallocates the whole rolling string on every PTY chunk; once a session's history hits the 4MB cap, every chunk pays a ~4MB concat **plus** a ~4MB `slice`. At 30-60 chunks/sec during streaming that is 100-240MB/s of memory bandwidth + GC churn in the Electron main process, paid whenever remote access is *enabled*, regardless of whether any client is connected.

Companion: `broadcast()` (`:1359-1366`) `JSON.stringify`s every pty chunk / transcript event before checking whether anyone is listening.

**Fix shape:** store `string[]` (or `Buffer[]`) chunks + a running byte total; trim whole chunks from the front when over budget; `join('')` only in `replayBuffers()` at connect time. Add `if (this.clients.size === 0) return;` at the top of `broadcast()`. Also caps latent memory (4MB × sessions + the 10k-hook-event buffer × sessions).

## Finding 3 (MEDIUM-HIGH, drift bugs): ~14 hand-rolled pref handlers duplicate ipc-handlers.ts and have diverged

`remote-server.ts:720-937` (`model:*`, `appearance:*`, `defaults:*`, `settings:*`, `modes:*`, `folders:*`) vs `ipc-handlers.ts:575-861`. The dot-path settings walker at remote-server.ts:838-864 is a byte-level copy of ipc-handlers.ts:639-664 (its own comment admits "mirrors ipc-handlers.ts"). Three **live drift bugs** found:

1. **`defaults:get/set` (remote-server.ts:769-793)** uses a 3-key `DEFAULTS_INITIAL` missing `geminiEnabled` + `permissionOverrides`, skips the permissionOverrides deep-merge, and never calls `syncPermissionOverrides()` — a remote client editing defaults leaves the main-process permission cache stale.
2. **`folders:list` (remote-server.ts:865-884)** skips the Home-seed, `exists` annotation, managed-root prefix badging, and managed-project merge that desktop `FOLDERS_LIST` (ipc-handlers.ts:785-817) does — remote clients see a different folder list than desktop.
3. **`folders:add` (remote-server.ts:885-905)** writes `youcoded-folders.json` with a plain `writeFile`, bypassing `saved-folders.ts`'s atomic unique-tmp+rename — which exists precisely because the dev instance and built app share `~/.claude`. Corruption window under concurrent writers.

PITFALLS already sanctions the consolidation ("remote-server.ts still hand-rolls the format inline in its folders:* cases — migrate it there if you touch those").

**Fix shape:** extract each pref domain into a plain function module (the `saved-folders.ts` pattern — it already exists for folders; remote-server just doesn't import it). `ipcMain.handle` and the remote `case` both become one-line delegations, exactly like remote-server already does for `skillProvider` / `sessionManager` cases. Behavior convergence is the point; nothing suggests remote was deliberately given a reduced view.

## Finding 4 (MEDIUM, correctness): live/replay overlap at connect has no ordering guarantee

On new WebSocket auth, `replayBuffers()` requests the chat snapshot (`chat:hydrate`, 2s timeout, 500ms PTY-replay delay — both documented in PITFALLS). But live event routing to the connecting client can begin before the snapshot/replay lands, so events delivered in the gap are applied twice and out of order: `[newest live events][full history containing them again]`. The renderer has no uuid-based dedup on any of the transcript apply paths (`TRANSCRIPT_ASSISTANT_TEXT` appends unconditionally; `TRANSCRIPT_USER_MESSAGE` appends when no pending match).

The same gap exists on desktop detach/re-dock (`onOwnershipAcquired`, App.tsx:1298-1323) — the non-remote session (see "Coordination" below) is fixing the *intra-file* replay dup (missing seenUuids in `getHistory`), but the connect-time ordering gap is remote-owned machinery: fix by buffering live events server-side (or client-side) until hydrate/replay has been applied, then flushing in order.

## Finding 5 (LOW): replayed/hydrated events are stamped `Date.now()`, not transcript time

`transcript-watcher.ts:57` — `parseTranscriptLine` ignores the JSONL line's own `timestamp` field. Live this is approximately correct; on replay every historical bubble is stamped with the replay moment, so after a remote connect (or re-dock) all timestamps read "now" with `showTimestamps` on, and `AssistantTurn.timestamp` is meaningless for history. Fix: carry the transcript's ISO timestamp through the event and prefer it when present.

## Smaller notes for the rework

- `broadcastStatusData` is called on the unconditional 10s `buildStatusData()` tick (ipc-handlers.ts:1622-1628) even when the payload is byte-identical and/or no remote clients exist. If the rework adds a changed-guard, make sure a **newly connecting client still gets an immediate first status push** (currently it just waits for the next tick).
- The hook-event replay buffer (10k events/session) shares the unbounded-ish growth concern with Finding 2 — same chunked-trim treatment applies.
- `remote-shim.ts` `invoke()` has a 30s timeout used as the Android-missing-handler fallback; any new remote channels should keep responses fast-failing rather than relying on that timeout.
- Security posture note from the artifact work (PITFALLS): `artifacts:read-binary` is guarded because it's reachable over the remote WebSocket. Any new remote-reachable IPC that returns file contents needs the same allow-list treatment (`read-binary-access.ts` is the pattern).

## Coordination — what the non-remote session is fixing first (2026-07-10)

These land before the remote session and overlap conceptually; verify they're merged and don't re-diagnose them:

1. **`readNewLines` re-entrancy serialization** in transcript-watcher.ts (+ subagent-watcher.ts) — eliminates duplicate/dropped transcript events at the source.
2. **`getHistory` uuid dedup** (mirror of the live path's skip-repeated-`assistant-text`) — fixes intra-file replay dupes for detach/re-dock; also reduces (but does not eliminate) Finding 4's blast radius.
3. **getScreenText tail-read + statusData renderer-side diff + settingsDangerBadge derivation** — perf items that slightly touch the status pipeline remote also consumes.

Update this doc if the scope of that session changes.
