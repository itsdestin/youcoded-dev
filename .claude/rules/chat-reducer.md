---
paths:
  - "youcoded/desktop/src/renderer/state/chat-reducer.ts"
  - "youcoded/desktop/src/renderer/state/chat-types.ts"
  - "youcoded/desktop/src/renderer/components/ChatView.tsx"
  - "youcoded/desktop/src/main/transcript-watcher.ts"
  - "youcoded/desktop/src/main/subagent-watcher.ts"
  - "youcoded/desktop/src/renderer/state/attention-classifier.ts"
  - "youcoded/desktop/src/renderer/hooks/usePtyRawBytes.ts"
  - "youcoded/terminal-emulator-vendored/**"
  - "youcoded/shared-fixtures/**"
last_verified: 2026-08-27
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
  - path: youcoded/desktop/src/renderer/hooks/useAttentionClassifier.ts
    contains: "hasBuffer"
  - path: youcoded/desktop/src/renderer/state/attention-classifier.ts
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
  - test: youcoded/desktop/tests/attention-classifier-parity.test.ts
  - test: youcoded/desktop/tests/raw-byte-listener-contract.test.ts
  - path: scripts/ast-grep/rules/toolcalls-never-cleared.yml
  - path: scripts/ast-grep/rules/spinner-re-anchored.yml
  - path: scripts/ast-grep/rules/no-seenuuids-on-tool-use.yml
---
# Chat reducer, transcript pipeline & terminal byte stream

Chat state + the JSONL transcript watcher that feeds it + the Android byte pipeline. **Depth + why per bullet: `youcoded/docs/chat-reducer.md`.**

## Reducer state (`chat-reducer.ts`) — guards: `chat-reducer`/`attention-reducer` tests
- **Current-turn status checks use `activeTurnToolIds` (a Set), not the `toolCalls` Map** — the Map is never cleared (ToolCards need old results) · scan: `toolcalls-never-cleared`.
- **Always use the `endTurn()` helper** for turn-ending paths — it fails orphaned tools, clears the Set + `isThinking`/`streamingText`/`currentTurnId`, resets `attentionState`/`stallWarning`/`stalledSince`. `SESSION_PROCESS_EXITED` and `NATIVE_SESSION_ERROR` are the only spread-then-override exceptions.
- **`AttentionState` is `'ok'|'stuck'|'session-died'|'error'|'stalled'` — five reachable states, each with a writer.** Adding one without a writer resurrects dead `AttentionBanner` branches. `stalled` = a native turn is PARKED (RED dot, card with Retry/Stop); a stall WARNING maps to `'stuck'`, now the ONLY amber state.
- **`stalledSince` is stamped once and held, and ONLY while already `'stalled'`** — nine `'ok'` writers never clear it, so the guard lives at the single WRITE site. `AttentionBanner` is the only reader.
- **`NATIVE_PARTS_DROPPED` removes only the TRAILING run of matching segments**, stopping at the first non-match — part ids repeat across steps (SDK fallback `text-0`), so a whole-turn `.filter()` deleted FINISHED earlier-step paragraphs. A tool-group segment carries no `partId`, so it always stops the walk.
- **Dedup uses the `pending` flag** — `USER_PROMPT` appends `pending:true`; `TRANSCRIPT_USER_MESSAGE` clears the oldest matching pending entry, else appends. Don't "simplify" back to content matching.
- **`TRANSCRIPT_TOOL_USE` dedups by `toolUseId`, never uuid** — the watcher re-emits tool-use on a repeated uuid by design; every write on that path stays idempotent · scan: `no-seenuuids-on-tool-use`.
- **A permission ask binds ONLY to a running tool with a MATCHING NAME** — no name-agnostic fallback · a card naming one tool while authorizing another is a CONSENT bug · guard: "PERMISSION_REQUEST tool identity".
- **`TRANSCRIPT_REPLAY_COMPLETE` reaps replay-orphaned `running` tools ONLY when `sessionIdle`, marking them failed, never complete** — the same replay fires on a live re-dock · guard: "TRANSCRIPT_REPLAY_COMPLETE".
- **`attentionState` is classifier-driven, not timer-driven** — `useAttentionClassifier` ticks the xterm buffer every 1s; transcript events + `PERMISSION_REQUEST` reset to `'ok'`. **Both of its `'ok'` dispatch sites are gated on `hasBuffer`: a classifier must never reset a state it never set** — without it a phone re-docking to a PARKED desktop session lost the card at mount.

## Paged history (perf cycle 2) — guards: `transcript-page`, `history-paging-reducer`, `chatview-history-sentinel` tests
- **History arrives one PAGE at a time, never as a whole file** — `readTranscriptPage` (`main/transcript-page.ts`), last 30 turns / 2 MB before a byte offset. `HISTORY_LOADED` + the "See previous messages" button are RETIRED.
- **`HISTORY_PAGE_LOADED` PREPENDS by replaying the page through the same per-event cases the live path uses** (`pageEventToAction` → `chatReducer` on a scratch state). Never hand-build timeline entries for history — that is what made the old `hist-` bubbles card-less. Counter ids mean an older page can't collide with what's on screen; paging only unions maps page-first, so it never clears `toolCalls` (eviction, which would, is cycle 3).
- **`history: {cursor, hasMore, loading}` — dispatch `HISTORY_PAGE_REQUESTED` BEFORE awaiting the fetch.** `loading` is the one-in-flight guard and is the whole of paging's idempotency.
- **The live tailer starts at EOF on an existing file and the first page ends at `getStartOffset()`** — that is what makes page and live structurally non-overlapping. Restoring `offset: 0` re-emits the whole transcript on every resume.
- **`requestTranscriptReplay` survives for exactly ONE caller** — the ownership handoff, which also re-sends broker-held asks and specialist runs (main-memory only). Never on a first-load path.

## Transcript watcher read-integrity (`transcript-watcher.ts`, `subagent-watcher.ts`) — guard: `transcript-watcher.test.ts`
- **`readNewLines` isolates each emit in try/catch** — don't collapse to a batch wrapper.
- **`readNewLines` is SERIALIZED per session** (`reading` flag + coalesced rerun).
- **The incomplete-line carry is BYTES (`partialBytes: Buffer`), not a string.**
- **SubagentWatcher polls are slow (5s) safety nets — the fast paths are event-driven** (`kickScan()`/`settleByParent()`). Don't speed them up or remove the kicks.
- **`<local-command-stdout>`/`<local-command-stderr>` are STRIPPED ENTIRELY in `stripSystemTags`**; new slash-command output gets a NEW event type, never the user-message path.

## Spinner classifier (`attention-classifier.ts`) — guard: `attention-classifier-parity.test.ts`
- **Matches glyph + gerund + ellipsis ONLY** (no seconds counter); active-vs-stalled = glyph rotation OR `COUNTER_RE` advancement. re-run the `test-conpty` spinner probes on a CC bump · scan: `spinner-re-anchored`.

- **The `shared-fixtures/attention-classifier/` fixtures are the contract** — a regex or `BufferClass` change needs a fixture change in the SAME commit.
## Terminal byte stream (Android xterm-in-WebView) — guard: `raw-byte-listener-contract.test.ts`
- **The vendored emulator is HEADLESS** (Termux v0.118.1 — `VENDORED.md` is source of truth). **`RawByteListener` fires on the terminal thread — copy bytes before any async work**; `rawByteFlow` `tryEmit`s (drops, never blocks).
- **`pty:raw-bytes` is base64-encoded**, three-surface parity (`ipc-channels.test.ts`). **xterm is display-only on touch** (`disableStdin:true`; typing flows through InputBar). Don't reintroduce a native render path or xterm-side touch input.
