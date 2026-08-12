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
  - path: scripts/ast-grep/rules/toolcalls-never-cleared.yml
  - path: scripts/ast-grep/rules/spinner-re-anchored.yml
  - path: scripts/ast-grep/rules/no-seenuuids-on-tool-use.yml
---
# Chat reducer, transcript pipeline & terminal byte stream

Chat state + the JSONL transcript watcher that feeds it + the Android byte pipeline. **Depth + why per bullet: `youcoded/docs/chat-reducer.md` (incl. its "PITFALLS-triage" and "Rule-overflow" sections).**

## Reducer state (`chat-reducer.ts`) — guard: `chat-reducer.test.ts`
- **Current-turn status checks use `activeTurnToolIds` (a Set), not the `toolCalls` Map** — the Map is never cleared (ToolCards render earlier turns) · scan: `toolcalls-never-cleared`.
- **Always use the `endTurn()` helper** for turn-ending paths — it fails orphaned tools, clears the Set + `isThinking`/`streamingText`/`currentTurnId`, resets `attentionState:'ok'`. `SESSION_PROCESS_EXITED` and `NATIVE_SESSION_ERROR` are the only spread-then-override exceptions.
- **`AttentionState` is `'ok'|'stuck'|'session-died'|'error'` — four reachable states, each with a writer.** Adding a state without a writer resurrects dead `AttentionBanner` branches.
- **Dedup uses the `pending` flag** — `USER_PROMPT` appends `pending:true`; `TRANSCRIPT_USER_MESSAGE` clears the oldest matching pending entry, else appends. Don't "simplify" back to content matching (drops rapid-fire duplicates).
- **`TRANSCRIPT_TOOL_USE` dedups by `toolUseId`, never uuid** — the watcher re-emits tool-use on a repeated uuid by design; every write on that path stays idempotent, `PERMISSION_REQUEST` included · scan: `no-seenuuids-on-tool-use`.
- **A permission ask binds ONLY to a running tool with a MATCHING NAME** (input-match, then name-match) — deliberately no name-agnostic fallback · a card naming one tool while authorizing another is a CONSENT bug · guard: "PERMISSION_REQUEST tool identity".
- **`TRANSCRIPT_REPLAY_COMPLETE` reaps replay-orphaned `running` tools ONLY when `sessionIdle`, marking them failed, never complete** — the same replay fires on a live re-dock where the tool is real; only `NativeSessionHost.isIdle()` can affirm idle, so CC sessions keep the orphan · guard: "TRANSCRIPT_REPLAY_COMPLETE".
- **`attentionState` is classifier-driven, not timer-driven** — `useAttentionClassifier` ticks the xterm buffer every 1s; transcript events + `PERMISSION_REQUEST` reset to `'ok'`.

## Transcript watcher read-integrity (`transcript-watcher.ts`, `subagent-watcher.ts`) — guard: `transcript-watcher.test.ts`
- **`readNewLines` isolates each emit in try/catch** — the offset advances before the loop, so a throwing listener strands every later chunk. Don't collapse to a batch wrapper.
- **`readNewLines` is SERIALIZED per session** (`reading` flag + coalesced rerun) — overlapping reads duplicated bubbles and wedged NUL bytes into the carry.
- **The incomplete-line carry is BYTES (`partialBytes: Buffer`), not a string** — a string carry garbles split multi-byte chars to U+FFFD.
- **`<local-command-stdout>`/`<local-command-stderr>` are STRIPPED ENTIRELY in `stripSystemTags`** — unwrapping let CC's post-`/compact` echo append a fake bubble AND stick `isThinking` forever. New slash-command output gets a NEW event type, never the user-message path.
- **`getHistory` replay dedups by uuid with the SAME semantics as the live path** — change both in one commit.
- **SubagentWatcher polls are slow (5s) safety nets — the fast paths are event-driven** (`kickScan()`/`settleByParent()`). Don't speed the polls up or remove the kicks.

## Spinner classifier (`attention-classifier.ts`) — guard: `attention-classifier-parity.test.ts`
- **Matches glyph + gerund + ellipsis ONLY** (no seconds counter). Active-vs-stalled = glyph rotation OR `COUNTER_RE` advancement (same glyph ≥30s + no counter = stalled). CC-CLI-version-sensitive; re-run the `test-conpty` spinner probes on a CC bump · scan: `spinner-re-anchored` (the `^` anchor).
- **The `shared-fixtures/attention-classifier/` fixtures are the contract** — a `BufferClass` or regex change needs a fixture change in the SAME commit.

## Terminal byte stream (Android xterm-in-WebView) — guard: `raw-byte-listener-contract.test.ts`
- **The vendored emulator is HEADLESS** (pinned Termux v0.118.1, one documented patch — `VENDORED.md` is source of truth). **`RawByteListener` fires on the terminal thread — copy bytes before any async work**; `rawByteFlow` uses `tryEmit` (drops rather than blocks).
- **`pty:raw-bytes` is base64-encoded** with full three-surface parity (pinned by `ipc-channels.test.ts`). **xterm is display-only on touch** (`disableStdin:true`; typing flows through InputBar); single-finger scroll is custom capture-phase JS. Don't reintroduce a native render path or xterm-side touch input.
