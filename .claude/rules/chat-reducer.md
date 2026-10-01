---
paths:
  - "**/desktop/src/renderer/state/chat-reducer.ts"
  - "**/desktop/src/renderer/state/chat-types.ts"
  - "**/desktop/src/renderer/components/ChatView.tsx"
  - "**/desktop/src/main/transcript-watcher.ts"
  - "**/desktop/src/main/subagent-watcher.ts"
  - "**/desktop/src/shared/attention-classifier.ts"
  - "**/desktop/src/renderer/hooks/usePtyRawBytes.ts"
  - "**/terminal-emulator-vendored/**"
  - "**/shared-fixtures/**"
last_verified: 2026-10-01
verify:
  - path: youcoded/desktop/src/renderer/state/chat-reducer.ts
  - path: youcoded/desktop/src/renderer/state/chat-reducer.ts
    contains: "NATIVE_PARTS_DROPPED"
  - path: youcoded/desktop/src/renderer/state/chat-types.ts
    contains: "stalledSince"
  - path: youcoded/desktop/src/main/transcript-page.ts
    contains: "PAGE_TURNS"
  - path: youcoded/desktop/src/renderer/state/transcript-page-actions.ts
    contains: "pageEventToAction"
  - path: youcoded/desktop/src/renderer/state/transcript-event-actions.ts
    contains: "eventToAction"
  - test: youcoded/desktop/tests/transcript-event-surface-parity.test.ts
  - test: youcoded/desktop/tests/transcript-routing.test.ts
  - path: youcoded/desktop/src/renderer/hooks/useAttentionClassifier.ts
    contains: "hasBuffer"
  - path: youcoded/desktop/src/shared/attention-classifier.ts
    contains: "SPINNER_RE"
  - path: youcoded/terminal-emulator-vendored/VENDORED.md
  - test: youcoded/desktop/tests/chat-reducer.test.ts
  - test: youcoded/desktop/tests/attention-reducer.test.ts
  - test: youcoded/desktop/src/renderer/hooks/useAttentionClassifier.test.tsx
  - test: youcoded/desktop/tests/attention-strip.test.tsx
  - test: youcoded/desktop/tests/transcript-watcher.test.ts
  - test: youcoded/desktop/tests/transcript-page.test.ts
  - test: youcoded/desktop/tests/history-paging-reducer.test.ts
  - test: youcoded/desktop/tests/chatview-history-sentinel.test.tsx
  - test: youcoded/desktop/tests/chatview-prepend-scroll-anchor.test.tsx
  - test: youcoded/desktop/tests/attention-classifier.test.ts
  - test: youcoded/desktop/tests/raw-byte-listener-contract.test.ts
  - path: scripts/ast-grep/rules/toolcalls-never-cleared.yml
  - path: scripts/ast-grep/rules/spinner-re-anchored.yml
  - path: scripts/ast-grep/rules/no-seenuuids-on-tool-use.yml
  - path: scripts/ast-grep/rules/app-transcript-listeners-batched.yml
---
# Chat reducer, transcript pipeline & terminal byte stream

**Depth + why: `youcoded/docs/chat-reducer.md`; guards = frontmatter `verify:`.**

## Reducer state (`chat-reducer.ts`)
- **Current-turn status checks use `activeTurnToolIds` (a Set), not the `toolCalls` Map** — the Map never clears.
- **Always use the `endTurn()` helper** on turn-ending paths — fails orphaned tools, resets turn state. Only `SESSION_PROCESS_EXITED`/`NATIVE_SESSION_ERROR` spread-then-override.
- **`AttentionState` is `'ok'|'stuck'|'session-died'|'error'|'stalled'` — five reachable states, each with a writer.** `stalled` = a PARKED native turn; a stall WARNING is `'stuck'`, the ONLY amber state. **`stalledSince` is stamped once and held, ONLY while already `'stalled'`** — nine `'ok'` writers never clear it; the guard sits at the WRITE site.
- **`NATIVE_PARTS_DROPPED` removes only the TRAILING run of matching segments**, stopping at the first non-match: part ids repeat across steps, so a whole-turn `.filter()` deleted finished paragraphs.
- **User-message dedup uses the `pending` flag, never content matching** — `USER_PROMPT` appends `pending:true`; `TRANSCRIPT_USER_MESSAGE` clears the oldest match, else appends. **`TRANSCRIPT_TOOL_USE` dedups by `toolUseId`, never uuid** — the watcher re-emits on a repeated uuid by design.
- **A permission ask binds ONLY to a running tool with a MATCHING NAME** — else a CONSENT bug.
- **`TRANSCRIPT_REPLAY_COMPLETE` reaps replay-orphaned `running` tools ONLY when `sessionIdle`, failed not complete** — also fires on a live re-dock.
- **`attentionState` is classifier-driven, not timer-driven** — transcript events and `PERMISSION_REQUEST` reset it to `'ok'`. **Both `'ok'` sites are gated on `hasBuffer`: never reset a state you never set.**

## Paged history (perf cycle 2)
- **History arrives one PAGE at a time** (`transcript-page.ts`; 30 turns / 2 MB). `HISTORY_LOADED` and "See previous messages" are RETIRED.
- **A transcript event becomes reducer actions in ONE place, `eventToAction`** (`transcript-event-actions.ts`) — main window, buddy and history pages all call it; never add a per-event case to `App.tsx` or `BubbleFeed.tsx`. The buddy's differences are the typed `BUDDY_LIVE` ledger. **The main window batches EVERY action via `routeTranscriptEvent` (`transcript-batch.ts`); no direct dispatch** — it reorders same-frame actions · guards: `transcript-event-surface-parity.test.ts`, `transcript-routing.test.ts`.
- **`HISTORY_PAGE_LOADED` PREPENDS by replaying through the same translator (`live:false`)**, on scratch state seeded with the session's `seenUuids` — never hand-build history entries or drop the seed (unseeded, it re-renders what is on screen).
- **Set `HISTORY_PAGE_REQUESTED` BEFORE awaiting**: `history.loading` is the whole of paging's idempotency. The tailer starts at EOF and page one ends at `getStartOffset()` — that keeps page and live non-overlapping.
- **Enumerate a broadcast's listeners by CHANNEL before removing it** — dropping whole-file replay broke FOUR features, uncaught by ~7,000 tests.

## Transcript watcher read-integrity (`transcript-watcher.ts`, `subagent-watcher.ts`)
- **`readNewLines` isolates each emit in try/catch and is SERIALIZED per session** (`reading` flag + coalesced rerun) — never collapse either into a batch.
- **The incomplete-line carry is BYTES (`partialBytes: Buffer`), not a string.**
- **SubagentWatcher polls are slow (5s) safety nets — the fast paths are event-driven** (`kickScan()`/`settleByParent()`). Never speed them up or drop a kick.
- **`<local-command-stdout>`/`<local-command-stderr>` are STRIPPED ENTIRELY in `stripSystemTags`**; new slash-command output gets a NEW event type, never the user-message path.

## Spinner classifier (`attention-classifier.ts`)
- **Matches glyph + gerund + ellipsis ONLY** (no seconds counter); active-vs-stalled = glyph rotation OR `COUNTER_RE` advance. **The `shared-fixtures/attention-classifier/` fixtures are the contract** — a regex or `BufferClass` change needs a fixture change in the SAME commit; a CC bump re-runs the `test-conpty` probes.

## Terminal byte stream (Android xterm-in-WebView)
- **The vendored emulator is HEADLESS** (`VENDORED.md` is truth). **`RawByteListener` fires on the terminal thread — copy bytes before any async work**; `rawByteFlow` `tryEmit`s.
- **`pty:raw-bytes` is base64-encoded**, three-surface parity. **xterm is display-only on touch** (`disableStdin:true`; typing goes through InputBar). Never reintroduce a native render path or xterm touch input.
