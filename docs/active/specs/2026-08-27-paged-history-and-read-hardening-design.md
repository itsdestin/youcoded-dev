---
title: Paged conversation history + read-side hardening (the rest of the OOM bug class)
date: 2026-08-27
status: draft
review: REVIEWED 2026-08-28 against master 97600ddd (three parallel code sweeps, every claim checked) — see '## Spec review' at the end. §2 is cycle 2 of the perf programme; §3/§4 stay separate ROADMAP items. Decisions 2026-08-28: 1a/2a — cycle 2 = desktop paging + start-at-end only; Android on-device paging and eviction are later cycles. Plan: docs/active/plans/2026-08-28-paged-history-cycle-2.md
tags: [artifacts, memory, crash, conversations, chat-reducer, android]
related:
  - docs/active/investigations/2026-08-27-artifacts-sidecar-oom-crash.md (the crash and the six-lens sweep this spec answers)
  - ROADMAP.md → "Paged conversation history" (the pointer to this spec)
  - ROADMAP.md → "Android artifact store has neither the write queue nor a read guard"
---

# Paged conversation history + read-side hardening

## Status

**Paused, unreviewed.** The crash itself (desktop, artifacts sidecar) is fixed
separately — youcoded branch `fix/oom-read-fanout`, a shared parsed-sidecar
cache plus a head-only CAS timestamp probe. Everything below is the rest of the
same bug class, designed in conversation on 2026-08-27 and parked by Destin
until the crash fix has shipped. Nothing here is started.

Pick-up order when resumed: read the investigation's Summary, then §2 here, then
run `superpowers:writing-plans` against this file. Do not implement from this
document directly — it has not had a spec review.

## 1. The bug class, and where it lives

"Read a whole file into memory and unpack it, on a path that fires often, with
nothing stopping many copies from existing at once." A six-lens sweep of the
codebase on 2026-08-27 (main-process stores, transcript readers, trigger cadence,
Android parity, sync/remote/quarantine, renderer retention) found it in five
places. Sizes are from Destin's machine that day.

| # | Where | Size | Shape | Status |
|---|---|---|---|---|
| 1 | Artifacts sidecar, desktop (`<project>/.youcoded/artifacts.json`) | 6.4 MB | ~11 full parses per Edit (not the 5 the investigation counted); every open tab parses at startup; the CAS check parses 6.4 MB for one timestamp | **fixed in `fix/oom-read-fanout`** — out of scope here |
| 2 | Artifacts sidecar, **Android** (`ArtifactStore.kt`) | same file | 3 full reads per recorded tool event; **no write queue** (PR #318 never reached Android); every bridge message runs on its own `Dispatchers.IO` coroutine, so bursts parse in parallel; writes pretty-printed | §3 |
| 3 | Claude Code transcripts + subagent files | up to 75 MB + 90 MB per session | reload replays every open session whole (`transcript-watcher.ts getHistory` + `subagent-watcher.ts getHistory`); resume re-reads the whole file through the live tailer from byte 0 AND loads a text-only "last 10"; the phone gets the desktop window's entire chat state | §2 |
| 4 | Conversation list, "last model", history previews | 768 files / 25 MB | `listPastSessions` opens every file at once (bounded reads, no concurrency cap); an old-encoding folder that never resolves is fully re-read on every list open; `model:read-last` and `loadHistory` read whole files | §4 |
| 5 | Model catalog cache | 5 MB | memoised but not single-flight: concurrent first callers each parse and each refetch | §4 |

Renderer: no fan-out bug, but unbounded retention — every tool result kept in
full per open session, no virtualisation, closed sessions keep their artifact
list forever (`artifact-tracker.ts` has no session-removal case). §2's paging and
eviction bound the first two; the last is §4 housekeeping.

Verified clean and NOT in scope: sync-spaces engine, hub sockets, remote-server
buffers, live transcript tailing, chat-search indexer, renderer IPC listeners.

## 2. Paged conversation history (approved direction)

### 2.1 Today: six load paths, three mechanisms

| Path | Mechanism today | Reads |
|---|---|---|
| Renderer reload — every open tab (`App.tsx` ~1712) | `transcript:replay-from-start` → `getHistory` reads the whole file + every subagent file synchronously, sends every event one IPC message at a time | 75 MB + 90 MB |
| Buddy re-dock / ownership handoff (`App.tsx` ~1784, `BubbleFeed.tsx`) | same | same |
| Native resume (`App.tsx` ~2422) | same, from `SessionStore.readEvents` (parent + every delegated child) | ≤3 MB today |
| CC resume (`App.tsx` ~2440) | the live tailer starts at `offset: 0` and re-emits the whole file as live events, PLUS `loadHistory(…, 10)` → `HISTORY_LOADED` text-only bubbles with a "See previous messages" button that loads ALL text | whole file, twice |
| Phone connect (`remote-server.ts replayBuffers` → `chat:hydrate`) | desktop renderer serialises its entire chat state for every session | everything the desktop holds |
| "See previous messages" (`ChatView.tsx HistoryExpandButton`) | `loadHistory(all=true)` — text only, no tool cards | whole file |

### 2.2 Design: the transcript on disk is the truth; the window is a cache

**One request replaces all of the above:** `transcript:page` —
`(sessionId, beforeCursor?) → { events, cursor, hasMore }`.

**Main-side reader** (new module beside `transcript-watcher.ts`):

- Scans the JSONL from the **end backward** in 64 KB chunks (the pattern
  `transcript-utils.ts readTranscriptMeta` already uses) until it has counted
  `PAGE_TURNS` user-prompt lines (a `type:"user"` line that is a real prompt,
  not a `tool_result` carrier) or crossed `PAGE_MAX_BYTES`, whichever first.
  Snapping page boundaries to user prompts keeps every `tool_use` with its
  `tool_result` and every assistant turn intact.
- Streams **forward** from that boundary line by line (`readline` over a
  `createReadStream`, never one string) through the same `parseTranscriptLine`
  the live path uses, with the same replay dedupe semantics as today's
  `getHistory` (repeated uuid: skip `assistant-text`, keep tool events).
  Identical parser ⇒ identical cards, groups, markers, compaction dividers.
- Subagent files: included only for `Agent` tool_uses inside the page, each
  streamed line by line (`SubagentWatcher.getHistory` reworked to take the set
  of parent tool ids).
- Native sessions: `SessionStore` grows the same tail-page reader; specialist
  children merged only for delegations inside the page (`mergeChildEvents`).
- **Concurrency:** one page read at a time per process (a queue); a second
  request for the same `(session, cursor)` while one is in flight shares it.
- **Cursor** is opaque to the renderer: `{ path, offset, sizeAtRead }`. If the
  file has shrunk below `offset` (`/clear`, `/compact` rewrite), the reader
  answers `hasMore:false` with an empty page and the renderer drops its cursor.

**Renderer / reducer:**

- Per-session state gains `history: { cursor: string | null; hasMore: boolean;
  loading: boolean }`.
- `HISTORY_PAGE_LOADED { sessionId, events, cursor, hasMore }` runs the page's
  events through the existing per-event handlers on a scratch session state,
  then **prepends**: `timeline = page.timeline ++ existing.timeline`; the
  `toolCalls` / `toolGroups` / `assistantTurns` maps are unioned. Ids on the
  page path derive from transcript uuids (not counters) so prepend, evict and
  re-fetch are idempotent.
- `HISTORY_LOADED`, the `hist-` entries, `HistoryExpandButton`, the renderer's
  `resumeInfo` map and the chat's use of `session:history` are **retired**.
  Older history now renders real tool cards.
- The first page is requested on mount, on reload, on re-dock/handoff, on
  native resume and on CC resume — replacing every `requestTranscriptReplay`
  call. `TRANSCRIPT_REPLAY_COMPLETE` (orphan-tool reaping, `sessionIdle` gate)
  keeps its semantics and fires after the first page.

**ChatView:**

- A sentinel row at the top of the timeline; when it enters the viewport and
  `hasMore && !loading`, dispatch a page request. While loading: a thin spinner
  row. When `hasMore` is false: a quiet "Beginning of conversation" row.
- **Scroll anchoring** on prepend and on evict: measure `scrollHeight` before
  and after the commit and adjust `scrollTop` by the delta (`overflow-anchor`
  alone is not reliable under batched React commits). This is the part Destin
  eyeballs in the dev window; do not script it.

**Eviction:**

- Every user-prompt timeline entry carries the byte offset of its transcript
  line (the live tailer knows it; the page reader knows it). That offset is
  what a new cursor is minted from.
- ChatView tracks `lastVisibleAt` per turn with one IntersectionObserver. A
  60 s interval dispatches `HISTORY_EVICT { sessionId, beforeOffset }` when:
  loaded turns > `2 × PAGE_TURNS`, AND the oldest loaded run has been out of
  view > `EVICT_AFTER_MS`, AND the run contains no turn with a tool in
  `activeTurnToolIds`, no open permission ask, and not `currentTurnId`.
  Eviction never drops below `PAGE_TURNS` loaded turns.
- The reducer removes the timeline entries before the boundary and deletes
  their entries from `toolCalls` / `toolGroups` / `assistantTurns`, then sets
  the cursor to the boundary. Scrolling up re-fetches. This applies equally to
  history that arrived live, so a 12-hour session no longer grows the window
  without bound.
- **Rule/doc update required:** `.claude/rules/chat-reducer.md` says the
  `toolCalls` Map "is never cleared"; eviction is the one sanctioned deletion
  and must be described there, and the `toolcalls-never-cleared` ast-grep rule
  checked so it does not flag the eviction case.

**Resume and the live tailer:**

- `TranscriptWatcher.startWatching` sets `offset = current file size` when the
  file already exists (today: 0), so a resumed 75 MB session is no longer
  re-read through the live path. The first page supplies the history; uuid
  dedupe absorbs the small overlap between "size at watcher start" and "size
  at page read", exactly as it absorbs live/replay overlap today.
- `SubagentWatcher.scanDirectory` likewise starts each pre-existing
  `agent-*.jsonl` at its end instead of firing an unbounded parallel
  `readNewLines` per file.

**Phone, other windows, Android:**

- `chat:hydrate` is bounded automatically — it ships what the window holds.
- Scrolling up on the phone sends `transcript:page` over the WebSocket;
  `remote-server.ts` answers from the same reader.
- On-device Android: `SessionService.kt` handles `transcript:page` with a Kotlin
  tail-page reader over its `TranscriptWatcher.kt` / `SessionBrowser.kt`
  files; `TranscriptWatcher.kt startWatching` gets the same start-at-end rule.
  The React UI is shared, so paging and eviction behave identically.
- Three-surface parity (`preload.ts`, `remote-shim.ts`, `SessionService.kt`)
  is enforced by `ipc-channels.test.ts`; `transcript:replay-from-start` is
  removed from all three in the same change.

### 2.3 Constants (Destin, 2026-08-27)

| Constant | Value | Meaning |
|---|---|---|
| `PAGE_TURNS` | 30 | user turns per page (a turn = one user message + everything the assistant did in response) |
| `PAGE_MAX_BYTES` | 2 MB | hard cap on transcript bytes per page; a turn-heavy page stops early |
| `EVICT_AFTER_MS` | 5 min | how long a run of completed turns must be out of view before it can be dropped |
| eviction threshold | loaded turns > 2 × `PAGE_TURNS` | never evict below one page |

### 2.4 What Destin will see

After a reload, resume or re-dock the window lands at the recent end of the
conversation and older history streams in as he scrolls up, holding scroll
position. "See previous messages" as a button is gone. Reloads with many big
tabs become fast. Older history shows real tool cards. Nothing changes during
a live session he is actively reading.

Known limits accepted: chat-side search (if any) covers only loaded history;
the compaction-fade boundary (`findArchiveBoundary`) is computed over loaded
entries only.

## 3. Android artifact store parity (a bug, not a refactor)

`ArtifactStore.kt` / `ProjectManager.kt` / `CasWrite.kt` need what desktop has:

1. **Per-project append queue** mirroring desktop `appendQueues`: a
   `Channel`-fed drainer that applies a burst of `appendVersion` calls in one
   read → mutate → CAS-write cycle. Today each call is its own cycle and a
   replay burst of ~1,000 runs on the IO pool in parallel.
2. **Shared parsed-sidecar cache** mirroring desktop's `sidecar-cache.ts`
   (validated by `lastModified` + `length`, in-flight `Deferred` shared,
   seeded after a committed write, idle-evicted). `ensureProject` /
   `applyGitTreatment` coalesced per project as on desktop.
3. **CAS probe** reads the head of the file for `"updatedAt"` instead of
   `JSONObject(raw)` over the whole file.
4. `toString(2)` → `toString()` in `ArtifactStore.kt:142` and
   `CentralIndex.kt:41` (compact JSON; the file is per-device, never read by
   eye, and indentation is ~30% of its bytes). Desktop makes the same change
   in `writeSidecar` (`JSON.stringify(next, null, 2)` → `JSON.stringify(next)`).

Guard: Kotlin unit tests mirroring `artifact-store.test.ts` "burst coalescing"
and the desktop cache tests. No `largeHeap` in the manifest today; do not add
one to paper over this.

## 4. The other readers

- `session-browser.ts listPastSessions`: a `mapWithLimit(files, 32, …)` helper
  instead of `Promise.all` over 768 files; `transcript-cwd.ts r1CwdForDir`
  memoised per directory per process keyed on the directory's mtime, so the
  old-encoding `PAF-574…,…&…` folder is resolved once per launch instead of
  25 MB per list open (and `allCwds` bounded to a head read).
- `model:read-last` (`ipc-handlers.ts`, `remote-server.ts`, `SessionService.kt`)
  and `loadHistory` for its remaining callers (remote `session:history`,
  `project-conversations.ts` previews): tail-first bounded reads using the §2
  page reader.
- `providers/model-catalog.ts ensureFresh`: an in-flight promise so concurrent
  callers share one parse and one fetch.
- Housekeeping: the six per-session structures in main already on the ROADMAP
  ("Six small per-session structures…"), plus a `SESSION_REMOVED` case in
  `artifact-tracker.ts` deleting the `bySession` keys and dropping the dead
  `projectArtifacts` field; `resumeInfo` disappears with §2.

## 5. Verification

- Unit: page boundaries land on user prompts; `PAGE_MAX_BYTES` stops a heavy
  page early; a shrunk file invalidates the cursor; subagent events appear only
  for in-page parents; prepend is idempotent; eviction never touches the
  active turn, an open ask, or the last page; `startWatching` on an existing
  file starts at its end; three-surface channel parity; Android store queue
  and cache.
- Dev-instance repro (never the live app): copy Destin's real 6.4 MB sidecar
  and a 75 MB transcript with its subagents dir into a scratch project, open
  several tabs, reload, and confirm main's heap stays flat where today it
  climbs; scroll up through a 75 MB session and confirm pages arrive without a
  jump. Scroll feel and anchoring are Destin's to eyeball; flag, don't script.

## 6. Out of scope (separate decisions)

- Shrinking the sidecar: records for the 107 deleted worktrees (39% of the
  file), CC-resume re-records (ROADMAP "A resumed Claude Code conversation
  still re-records…"), and whether to keep recording `read` events (17%).
- Deleting `~/.youcoded/repair-quarantine` (194 MB; grows ~19 MB per dev
  launch while the installed app predates the slug split — stops on upgrade).
- Capping the bytes of a single tool result kept in the reducer; virtualising
  the ChatView list.

## Spec review (2026-08-28, against master `97600ddd`)

Every claim in §2 was checked against the code by three read-only sweeps (main-process
readers, renderer/reducer, perf rig). What holds, what was wrong, and what the plan must
do differently. §3 and §4 were NOT reviewed here — they are not cycle 2.

### Verified (the spec is right)

- Replay reads the whole transcript synchronously (`transcript-watcher.ts:456-492`,
  `readFileSync`, then every `agent-*.jsonl` the same way) and sends one IPC message per
  event (`ipc-handlers.ts:2568-2570`). `loadHistory` reads the whole file and slices AFTER
  parsing (`session-browser.ts:677-685`). `model:read-last` likewise.
- The live tailer starts at `offset: 0` for an existing file (`transcript-watcher.ts:390`),
  so a resumed session is delivered TWICE (replay + live) — a documented pathology that
  OOM-killed main on 2026-08-15 (`docs/artifacts.md:10`). `SubagentWatcher.scanDirectory`
  fires an unbounded parallel read per pre-existing file from byte 0 (`:209-288`).
- The five renderer load paths exist (`App.tsx:1715`, `:1787`, `:2425`, `:2456-2459`,
  `ChatView.tsx:77-82`) plus the buddy window's own (`BubbleFeed.tsx:285`); `resumeInfo` is
  live and is the SOLE data source for the expand button (10 usages).
- No virtualisation anywhere (`ChatView.tsx:810` plain `.map`); `content-visibility:auto`
  was tried and removed (`globals.css:804`) — do not reintroduce it.
- `.claude/rules/chat-reducer.md:40` says the `toolCalls` Map is never cleared and the
  ast-grep rule `toolcalls-never-cleared.yml` enforces it; eviction must be sanctioned there.
- `seenUuids` is cloned on every uuid-bearing event (5 sites) — O(n²) on a full replay.
- `chat:hydrate` sends the ENTIRE timeline (`chat-types.ts:783-814`, `serializeChatState`).
- Backward 64 KB chunk scan pattern exists in `readTranscriptMeta` (`transcript-utils.ts:41`).

### Wrong or missing — the plan must differ from §2 here

1. **`transcript:replay-from-start` is desktop-only.** It is not on `remote-shim.ts`
   (a no-op stub at `:1473`), not a `remote-server.ts` WS case, and absent from Android
   (`rg` over `app/` → nothing). "Remove it from all three surfaces" is moot; only
   `preload.ts` + `ipc-handlers.ts` carry it. The phone hydrates via `chat:hydrate`;
   on-device Android gets history ONLY through its live tailer starting at offset 0.
2. **Events carry no byte offset** (`TranscriptEvent` = type/sessionId/uuid/timestamp/data).
   §2's eviction cursor ("every user-prompt entry carries the byte offset of its line")
   requires adding one: the tailer's `readNewLines` and the page reader both know line
   starts, so `data.offset` on `user-message` is cheap on desktop; Android's
   `TranscriptWatcher.parseLine` must mirror it when Android pages.
3. **Reducer ids are global counters, not transcript uuids** (`chat-reducer.ts:21-54`;
   `turn-N`/`group-N` are not even epoch-prefixed; `hist-` uses a third counter). Rewriting
   id minting to uuids is a deep change. **Recommended instead:** keep the counters —
   prepend cannot collide because counters only grow — and get idempotency from the
   CURSOR discipline (one in-flight page per session, cursor monotonic, main single-flight
   per `(session, cursor)`), not from id identity. Eviction removes a timeline RANGE, not
   ids.
4. **Overlap between the first page and the live tailer must be removed, not deduped.**
   Main-side dedupe (`transcript-watcher.ts:463-482`, `:691-707`) only skips repeated
   `assistant-text`; tool events on the overlap window would render twice. Fix: the first
   page request happens AFTER `startWatching`, and the page reader takes the tailer's start
   offset as the page's END boundary — page = `[boundary, tailerStart)`, tailer = `[tailerStart, ∞)`.
   No overlap, no dedupe needed.
5. **`HISTORY_LOADED`/`hasMore` has a hidden dependant:** `pty-input-gate.ts:37` keys the
   input gate on the resume-time `HISTORY_LOADED` dispatch. Retiring it must re-key the
   gate on the first page's arrival.
6. **`TRANSCRIPT_REPLAY_COMPLETE` clears `attentionState`/`errorMessage`**
   (`chat-reducer.ts:1690-1697`, documented latent bug). Only the FIRST page may fire it;
   later pages must never.
7. **The native replay handler re-sends more than transcript events** — broker-held
   permission asks (`ipc-handlers.ts:2578`) and specialist run records (`:2596`). The first
   page must preserve those out-of-band sends. `NativeSessionHost.getHistory` returns null
   for NON-LIVE sessions (`:3760`), so the native page reader must read `SessionStore`
   files, not the live host.
8. **Two reducer instances.** The buddy window runs its own `chatReducer`
   (`BubbleFeed.tsx:265-270`); every new history action needs a buddy-side dispatcher.
9. **`ipc-channels.test.ts` does not enforce global parity** — it is opt-in per channel
   (hand-listed describe blocks). `transcript:page` must get its own block.
10. **`hasMore` already exists** as a one-shot toggle (`HISTORY_LOADED` action field,
    "last 10" vs "all"). Replace it, do not extend it.
11. **Reuse, don't reinvent:** `ResumeBrowser.tsx:525-538, 1363` already implements the
    top-sentinel + `hasMore` IntersectionObserver pattern; `fs-read-head.ts`,
    `NativeHome.readSessionHead` (`native-home.ts:188`) and `readSessionTranscriptMeta`
    (`session-browser.ts:287`) are the existing bounded readers.
12. **`artifact-tracker.ts` has no session-removal case** and the real action is
    `SESSION_REMOVE` (no D). §4 housekeeping, not cycle 2.

### The rig must change WITH this feature (budgeted into cycle 2)

- `scenario-history.mjs:326-341` settles on ANY non-zero count holding still for 1 s — it
  would accept a first-page render as "done" and report a fake win. It must require
  `n >= ENTRIES_PER_TURN × min(turns, PAGE_TURNS)`. Same at `scenario-replay-stall.mjs:443`
  (its `expectedEntries` is computed and unused).
- `scenario-workload.mjs:365-374` requires `n >= 2 × turns` and would pin every switch at
  its 20 s cap (PRIMARY `switchPaintedBySize.huge.medianMs` → ~20,000). Add
  `PAGE_TURNS` and `renderedEntries(turns) = ENTRIES_PER_TURN × min(turns, PAGE_TURNS)`;
  keep `expectedEntries` exported for its tests.
- `history.*.resumeStableMs` stays the KEEP metric: it is the same user-facing clock
  ("conversation open and usable"), now honestly guarded. Tests to update are listed in
  the rig sweep (`tests/scenario-workload.test.mjs:25,30,64`,
  `tests/scenario-history.test.mjs:67-93`, `tests/scenario-replay-stall.test.mjs:305,333`,
  `tests/run-report.test.mjs:100-112,332,636`).
- Optional, later: a separate `resumeFullHistoryMs` clock that scrolls to the top until
  `hasMore` is false — a new metric, never folded into `resumeStableMs`.

### Scope decisions — DECIDED by Destin 2026-08-28: "1a/2a" (desktop now, Android next cycle; paging only, eviction moves to cycle 3)

- **D1 — Android in this cycle?** On-device Android needs a Kotlin tail-page reader +
  start-at-end (§2, "Phone, other windows, Android"). Recommended: desktop first (the phone
  over remote is covered automatically via `chat:hydrate` + a `transcript:page` WS case);
  Android on-device as the following cycle, with the shared UI degrading to today's
  behaviour where `transcript:page` is unsupported.
- **D2 — Eviction in this cycle?** Paging + start-at-end delivers the open/switch win.
  Eviction is the memory half (needs the byte-offset field, a per-turn visibility
  observer, a timer, and scroll anchoring on removal). Recommended: cycle 2 = paging;
  eviction joins cycle 3 (park hidden views), which is the memory cycle anyway.
