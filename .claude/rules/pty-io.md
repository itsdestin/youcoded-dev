---
paths:
  - "youcoded/desktop/src/main/pty-worker.js"
  - "youcoded/app/**/PtyBridge.kt"
  - "youcoded/desktop/src/renderer/hooks/useSubmitConfirmation.ts"
  - "youcoded/desktop/src/renderer/state/pty-input-gate.ts"
  - "youcoded/desktop/src/renderer/components/outgoing-message.ts"
  - "youcoded/desktop/test-conpty/**"
  - "youcoded/desktop/src/renderer/components/TerminalView.tsx"
last_verified: 2026-07-15
verify:
  - path: youcoded/desktop/src/main/pty-worker.js
  - path: youcoded/desktop/src/renderer/state/pty-input-gate.ts
    contains: "canRetrySubmit"
  - path: youcoded/desktop/src/renderer/components/TerminalView.tsx
    contains: "disableStdin"
  - test: youcoded/desktop/test-conpty/README.md
  - test: youcoded/desktop/test-conpty/cc-snapshot.mjs
  - test: youcoded/desktop/test-conpty/test-worker-submit.mjs
---

# PTY I/O: input-bar submit, resize, ESC routing, launch env

Writing into Claude Code's Ink input bar is a stack of undocumented behaviors. **Full mechanism + methodology: `youcoded/desktop/test-conpty/README.md`; overflow depth: staged `youcoded/docs/pty-io.md`. Constants are CC-CLI-version-coupled — re-run `test-conpty/cc-snapshot.mjs` on each CC bump.**

## Submit protocol (`pty-worker.js` case `'input'`) — verify: `test-conpty/test-worker-submit.mjs`
- **Paste classification is LENGTH-GATED at exactly 64 bytes for CC v2.1.119** (a `\r` in a ≥64-byte atomic write is absorbed as paste content). Three deterministic paths: passthrough (no trailing `\r`), **atomic submit** (`\r` AND ≤`SAFE_ATOMIC_LEN`=56 bytes, one write), **echo-driven submit** (`\r` AND >56 — chunk the body ≤56 bytes, then send `\r` separately).
- **Desktop echo-driven: wait for the body tail to echo from CC stdout, then write `\r` as one byte** — no timing assumption. **On echo timeout (12s) SUPPRESS the CR entirely** (no echo ⇒ a live Ink menu has focus; a blind `\r` would answer it). Recovery is the renderer `useSubmitConfirmation` retry. **Do NOT reintroduce the blind fallback CR** (2026-07-09 stray-Enter fix, youcoded#110), the 600ms enter-split, `>56`-byte atomic writes, or bracketed-paste markers (ConPTY mangles them). Android still uses the 600ms gap (Linux PTY has no gap-collapse).
- **The optimistic bubble and the PTY send derive from ONE sanitized string** (`outgoing-message.ts`) — the transcript confirms the bubble by EXACT content match (PTY send swaps newlines for spaces). Rebuilding either inline left every multiline message `pending` forever + armed a stray retry `\r`. `YOUCODED_PTY_TRACE=1` traces per-event to `~/.claude/youcoded-pty-trace-<pid>.log`.

## Never write to the PTY during a pending interaction (`pty-input-gate.ts`)
- **CC's Ink select menu is LIVE in the PTY while a hook permission card is up** — a bare `\r` selects the highlighted option (auto-answering). Every automated writer MUST consult `hasPendingInteraction`/`canRetrySubmit` (or main-side `HookRelay.hasPendingPermission`). Deliberate menu-drivers (ToolCard arrow keys, TrustGate, xterm keystrokes) intentionally bypass. Fixed youcoded#110.
- **`useSubmitConfirmation` is the second-line defense** — a bare `\r` only when `pending` stays 8s AND `canRetrySubmit()` passes. `attentionState==='ok'` ALONE is NOT idle (also mid-turn + while a menu is up); gating on it alone auto-answered prompts. Don't gate on `!isThinking` either (never clears if CC never got the message).

## ESC / keyboard routing
- **ESC flows through the `useEscClose` stack → chat-passthrough guard** — the capture-phase listener `preventDefault()`s a popped overlay; the App bubble-phase listener reads `defaultPrevented` before forwarding `\x1b` to the PTY. Don't add parallel window-level ESC listeners. The passthrough returns when `viewMode==='terminal'` (xterm forwards ESC natively — avoids a double-send).
- **Chat-to-PTY interrupt is single-byte** (`sendInput(sessionId, '\x1b')`) — well below the paste threshold; don't wrap it in the paste-splitter.
- **Interrupt markers end the turn in the reducer** — `transcript-watcher.ts` emits `user-interrupt` for `[Request interrupted by user]` (exact match) → `TRANSCRIPT_INTERRUPT` → `endTurn()`. Removing it renders a user bubble + strands running tools.

## PTY resize (Windows) — `TerminalView.fitAndSync`
- **Dedup on unchanged cols/rows BEFORE the resize IPC.** Windows ConPTY reflows + re-emits its buffer on every resize, and the ResizeObserver + `proposeDimensions()` fire spuriously → CC's Ink UI is re-emitted into xterm scrollback (duplicated chrome). The dedup is a closure (`lastCols`/`lastRows`) in the mount effect — keep it in the renderer, not `session-manager`. Android unaffected (no reflow on SIGWINCH).

## Launch environment (`pty-worker.js` case `'spawn'`)
- **Spawned `claude` MUST NOT inherit CC's own session-identity env vars.** Launched from inside a CC session (e.g. `run-dev.sh` via the Bash tool), the child inherits `CLAUDECODE`/`CLAUDE_CODE_*` and believes it's nested — **nested interactive CC writes NO top-level transcript**, so the chat view stays permanently EMPTY (terminal view works, hooks fire — masking the cause). The spawn chokepoint DELETES those vars; don't re-add a raw `...process.env` spread. Android unaffected. Shipped youcoded#106.
