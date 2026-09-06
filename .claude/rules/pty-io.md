---
paths:
  - "**/desktop/src/main/pty-worker.js"
  - "**/desktop/src/main/session-manager.ts"
  - "**/app/**/PtyBridge.kt"
  - "**/desktop/src/renderer/hooks/useSubmitConfirmation.ts"
  - "**/desktop/src/renderer/state/pty-input-gate.ts"
  - "**/desktop/src/renderer/state/prompt-input.ts"
  - "**/desktop/src/renderer/parser/ink-select-parser.ts"
  - "**/app/**/InkSelectParser.kt"
  - "**/desktop/src/renderer/components/outgoing-message.ts"
  - "**/desktop/test-conpty/**"
  - "**/desktop/src/renderer/components/TerminalView.tsx"
last_verified: 2026-09-06
verify:
  - path: youcoded/desktop/src/main/pty-worker.js
  - path: youcoded/desktop/src/main/session-manager.ts
    contains: "prepareRunInTerminal"
  - test: youcoded/desktop/test-engine/probe-shell-command.mjs
  - path: youcoded/desktop/src/renderer/state/pty-input-gate.ts
    contains: "canRetrySubmit"
  - path: youcoded/desktop/src/renderer/components/TerminalView.tsx
    contains: "disableStdin"
  - test: youcoded/desktop/test-conpty/README.md
  - test: youcoded/desktop/test-conpty/cc-snapshot.mjs
  - test: youcoded/desktop/test-conpty/test-worker-submit.mjs
  - path: youcoded/desktop/src/renderer/state/prompt-input.ts
    contains: "PROMPT_SUBMIT_DELAY_MS"
  - test: youcoded/desktop/tests/keystroke-diagnostic.test.ts
---

# PTY I/O: submit, resize, ESC routing, launch env

Writing into Claude Code's Ink input bar is a stack of undocumented behaviors. **Mechanism: `youcoded/desktop/test-conpty/README.md`; depth: `youcoded/docs/pty-io.md`. Constants are CC-CLI-version-coupled — re-run `test-conpty/cc-snapshot.mjs` on each CC bump.**

`session-manager.ts` also owns the `'shell'` provider — a PTY with no assistant. **A "Run in terminal" command is TYPED onto the prompt, never run:** `prepareRunInTerminal` refuses every character that would submit the line. Detail: its comment, `test-engine/probe-shell-command.mjs`.

## Submit protocol (`pty-worker.js` case `'input'`) — verify: `test-conpty/test-worker-submit.mjs`
- **Paste classification is LENGTH-GATED at exactly 64 bytes for CC v2.1.119** (a `\r` in a ≥64-byte atomic write becomes paste content). Three paths: passthrough (no trailing `\r`), **atomic submit** (`\r` AND ≤`SAFE_ATOMIC_LEN`=56 bytes), **echo-driven submit** (`\r` AND >56 — chunk the body ≤56 bytes, then send `\r` separately).
- **Desktop echo-driven: wait for the body tail to echo from CC stdout, then write `\r` as one byte** (no timing assumption). **On echo timeout (12s) SUPPRESS the CR** — no echo ⇒ a live Ink menu has focus; `useSubmitConfirmation` retries. **Never reintroduce** the blind fallback CR (youcoded#110), the 600ms enter-split, `>56`-byte atomic writes, or bracketed paste (ConPTY mangles it). Android keeps its 600ms gap.
- **Optimistic bubble and PTY send derive from ONE sanitized string** (`outgoing-message.ts`) — the transcript confirms by EXACT content match (the send swaps newlines for spaces). Rebuilding either inline left every multiline message `pending` forever and armed a stray retry `\r`.

## Never write to the PTY during a pending interaction (`pty-input-gate.ts`)
- **CC's Ink select menu is LIVE in the PTY while a hook permission card is up** — a bare `\r` auto-answers the highlighted option. Every automated writer MUST consult `hasPendingInteraction`/`canRetrySubmit` (or main-side `HookRelay.hasPendingPermission`). Deliberate menu-drivers (ToolCard arrows, PromptCard/TrustGate, xterm keystrokes) bypass.
- **Answer a menu by typing the option's DIGIT — never arrows + `\r` in one write.** CC drops arrows sharing a write with the Enter and confirms the HIGHLIGHTED option: every Resume Session button ran `/compact`, "No, exit" trusted the folder (2026-07-26). Guard: `keystroke-diagnostic.test.ts`.
- **`useSubmitConfirmation` is the second-line defense** — a bare `\r` only when `pending` stays 8s AND `canRetrySubmit()` passes. `attentionState==='ok'` ALONE is NOT idle (also mid-turn, and while a menu is up) — gating on it auto-answered prompts. `!isThinking` is no better — it never clears if CC never got the message.

## ESC / keyboard routing
- **ESC flows through the `useEscClose` stack → chat-passthrough guard** — the capture-phase listener `preventDefault()`s a popped overlay; the App bubble-phase listener reads `defaultPrevented` before forwarding `\x1b` to the PTY. Never add parallel window-level ESC listeners. Passthrough returns when `viewMode==='terminal'` — xterm forwards ESC natively.
- **Chat-to-PTY interrupt is single-byte** (`sendInput(sessionId, '\x1b')`) — never wrap it in the paste-splitter.
- **Interrupt markers end the turn** — `transcript-watcher.ts` emits `user-interrupt` for `[Request interrupted by user]` (exact) → `TRANSCRIPT_INTERRUPT` → `endTurn()`. Removing it renders a user bubble + strands running tools.

## PTY resize (Windows) — `TerminalView.fitAndSync`
- **Dedup on unchanged cols/rows BEFORE the resize IPC.** Windows ConPTY reflows and re-emits its buffer on every resize, and ResizeObserver + `proposeDimensions()` fire spuriously → CC's Ink UI lands in xterm scrollback. Dedup is a closure (`lastCols`/`lastRows`) in the mount effect, renderer-side.

## Launch environment (`pty-worker.js` case `'spawn'`)
- **Spawned `claude` MUST NOT inherit CC's own session-identity env vars.** Launched from inside a CC session (e.g. `run-dev.sh` via the Bash tool) the child inherits `CLAUDECODE`/`CLAUDE_CODE_*` and believes it is nested — and **nested interactive CC writes NO top-level transcript**, so chat view stays permanently EMPTY while terminal view and hooks look fine. The spawn chokepoint DELETES them; no raw `...process.env` spread. youcoded#106.
