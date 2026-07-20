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
last_verified: 2026-07-19
verify:
  - path: youcoded/desktop/src/renderer/state/chat-reducer.ts
  - path: youcoded/desktop/src/renderer/state/attention-classifier.ts
    contains: "SPINNER_RE"
  - path: youcoded/terminal-emulator-vendored/VENDORED.md
  - test: youcoded/desktop/tests/chat-reducer.test.ts
  - test: youcoded/desktop/tests/transcript-watcher.test.ts
  - test: youcoded/desktop/tests/attention-classifier-parity.test.ts
  - test: youcoded/desktop/tests/raw-byte-listener-contract.test.ts
---

# Chat reducer, transcript pipeline & terminal byte stream

Chat state + the JSONL transcript watcher that feeds it + the Android byte pipeline. **Full architecture + read-integrity/spinner-regex/terminal-byte depth: `youcoded/docs/chat-reducer.md` (see its "PITFALLS-triage additions" section).**

## Reducer state (`chat-reducer.ts`) — guard: `chat-reducer.test.ts`
- **`toolCalls` Map is NEVER cleared** (ToolCards need old results). Use `activeTurnToolIds` (a Set) for current-turn status checks, not the full Map.
- **Always use the `endTurn()` helper** for turn-ending paths — it fails orphaned running/awaiting tools, clears the Set + `isThinking`/`streamingText`/`currentTurnId`, and resets `attentionState:'ok'`. `SESSION_PROCESS_EXITED` (→`session-died`) and `NATIVE_SESSION_ERROR` (→`error`) are the only spread-then-override exceptions.
- **`AttentionState` is `'ok'|'stuck'|'session-died'|'error'` — four reachable states, each with a writer** (`stuck`←PTY classifier; `session-died`←`SESSION_PROCESS_EXITED`; `error`←`NATIVE_SESSION_ERROR`, native sessions ONLY). Adding a state without a writer resurrects dead branches in the `AttentionBanner` switch.
- **Dedup uses the `pending` flag** — `USER_PROMPT` appends `pending:true`; `TRANSCRIPT_USER_MESSAGE` clears the oldest matching pending entry, else appends `pending:false`. Don't "simplify" back to last-10 content matching (drops rapid-fire duplicates).
- **`TRANSCRIPT_TOOL_USE` dedups by `toolUseId`, never uuid — do NOT add a `seenUuids` guard** (the watcher re-emits tool-use on a repeated uuid by design; a guard swallows tools arriving in a CC line rewrite). Every write on that path stays idempotent, `PERMISSION_REQUEST` included. Guard: `chat-reducer.test.ts` → "chatReducer tool card duplication".
- **`attentionState` is classifier-driven, not timer-driven** — `useAttentionClassifier` ticks the xterm buffer every 1s; transcript events + `PERMISSION_REQUEST` reset to `'ok'`.

## Transcript watcher read-integrity (`transcript-watcher.ts`, `subagent-watcher.ts`) — guard: `transcript-watcher.test.ts`
- **`readNewLines` isolates each emit in try/catch** — `session.offset` advances before the loop, so a throwing listener would strand every later chunk. Root cause of "rare Claude message not appearing." Don't collapse to a batch-level wrapper.
- **`readNewLines` is SERIALIZED per session (`reading` flag + coalesced rerun)** — un-serialized overlapping reads consumed the same byte range (duplicate bubbles, flapping tool cards) and wedged NUL bytes into the carry, dropping the next message at `JSON.parse`.
- **The incomplete-line carry is BYTES (`partialBytes: Buffer`), not a string** — a string carry decodes each half of a split multi-byte char to U+FFFD (garbled emoji/CJK). Stitch bytes before decoding.
- **`<local-command-stdout>`/`<local-command-stderr>` are STRIPPED ENTIRELY in `stripSystemTags`** — unwrapping let CC's post-`/compact` echo reach `TRANSCRIPT_USER_MESSAGE`, appending a fake bubble AND setting `isThinking:true` with no turn to clear it (chat stuck thinking forever). Route any future slash-command output through a NEW event type, not the user-message path.
- **`getHistory` replay dedups by uuid with the SAME semantics as the live path** (the reducer appends duplicates). Change both in one commit.
- **SubagentWatcher polls are slow (5s) safety nets — the fast paths are event-driven** (`kickScan()` on a parent Agent tool_use, `settleByParent()` on its result). Don't speed the polls up or remove the kick/settle calls.

## Spinner classifier (`attention-classifier.ts`) — guard: `attention-classifier-parity.test.ts` + `shared-fixtures/attention-classifier/`
- **Matches glyph + gerund + ellipsis ONLY** (no seconds counter). Active-vs-stalled = glyph rotation OR `COUNTER_RE` advancement (same glyph ≥30s + no counter = stalled). **`SPINNER_RE` is `^`-anchored — DO NOT remove it** (else markdown bullets / echoed prompts / `●`-prefixed turns false-match). Patterns are CC-CLI-version-sensitive; keep the version anchor + re-run the `test-conpty` spinner probes on a CC bump.
- **The `shared-fixtures/attention-classifier/` fixtures are the contract** — a `BufferClass` or regex change needs a fixture change in the SAME commit.

## Terminal byte stream (Android xterm-in-WebView) — guard: `raw-byte-listener-contract.test.ts`
- **The vendored emulator is HEADLESS (pinned Termux v0.118.1, one documented `RawByteListener` patch — `VENDORED.md` is source of truth).** It exists solely to produce the byte stream. **`RawByteListener` fires on the terminal thread — copy bytes before any async work** (Termux reuses the `byte[]`); `rawByteFlow` uses `tryEmit` (drops rather than blocks).
- **`pty:raw-bytes` is base64-encoded** (JSON can't carry binary) with full three-surface parity (preload stub / remote-shim dispatch / SessionService.kt) — pinned by `ipc-channels.test.ts`. **xterm is display-only on touch** (`disableStdin:true`; typing flows through InputBar); single-finger scroll is custom capture-phase JS. Don't reintroduce a native render path or xterm-side touch input.
