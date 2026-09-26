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
  # Menu drivers that type into CC's live menus (2026-09-24): digit / verified-arrow rules apply.
  - "**/desktop/src/renderer/state/ink-menu-driver.ts"
  - "**/desktop/src/renderer/state/plan-menu-driver.ts"
  - "**/desktop/src/renderer/parser/plan-menu-parser.ts"
  - "**/desktop/src/renderer/parser/kept-card-binding.ts"
  - "**/desktop/src/main/menu-answer-lock.ts"
last_verified: 2026-09-24
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
  - test: youcoded/desktop/tests/startup-dialogs.test.ts
  - test: youcoded/desktop/tests/plan-menu-driver.test.ts
  - test: youcoded/desktop/tests/menu-answer-lock.test.ts
  - path: youcoded/desktop/src/main/menu-answer-lock.ts
    contains: "MENU_ANSWER_LEASE_MS"
---

# PTY I/O: submit, resize, ESC routing, launch env

**Mechanism: `youcoded/desktop/test-conpty/README.md`; depth: `youcoded/docs/pty-io.md`. Constants are CC-CLI-version-coupled — re-run `test-conpty/cc-snapshot.mjs` on each CC bump.**

`session-manager.ts` also owns the `'shell'` provider, a PTY with no assistant. **A "Run in terminal" command is TYPED onto the prompt, never run:** `prepareRunInTerminal` refuses every character that would submit the line. Detail: `test-engine/probe-shell-command.mjs`.

## Submit protocol (`pty-worker.js` case `'input'`) — verify: `test-conpty/test-worker-submit.mjs`
- **Paste classification is LENGTH-GATED at exactly 64 bytes for CC v2.1.119** (a `\r` in a ≥64-byte atomic write becomes paste content). Three paths: passthrough (no trailing `\r`), **atomic submit** (`\r` AND ≤`SAFE_ATOMIC_LEN`=56 bytes), **echo-driven submit** (`\r` AND >56 — chunk the body ≤56 bytes, then send `\r` separately).
- **Desktop echo-driven: wait for the body tail to echo from CC stdout, then write `\r` as one byte** (no timing assumption). **On echo timeout (12s) SUPPRESS the CR** — no echo ⇒ a live Ink menu has focus; `useSubmitConfirmation` retries. **Never reintroduce** the blind fallback CR (youcoded#110), the 600ms enter-split, `>56`-byte atomic writes, or bracketed paste (ConPTY mangles it). Android keeps its 600ms gap.
- **Optimistic bubble and PTY send derive from ONE sanitized string** (`outgoing-message.ts`) — the transcript confirms by content, and the send swaps newlines and tabs for spaces. Divergence leaves bubbles `pending` forever.

## Never write to the PTY during a pending interaction (`pty-input-gate.ts`)
- **CC's Ink select menu is LIVE in the PTY while a hook permission card is up** — a bare `\r` auto-answers the highlighted option. Every automated writer MUST consult `hasPendingInteraction`/`canRetrySubmit` (or `HookRelay.hasPendingPermission`). Deliberate menu-drivers (the card drivers below, xterm keystrokes) bypass.
- **Answer a numbered menu by typing the option's DIGIT — never arrows + `\r` in one write.** CC drops arrows sharing a write with Enter and confirms the HIGHLIGHTED row: every Resume Session button ran `/compact` (2026-07-26). Guard: `keystroke-diagnostic.test.ts`. The plan card (`state/plan-menu-driver.ts`) types the digit CC printed, re-read from screen first; only off the feedback text row does one confirmed up-arrow go first.
- **Unnumbered menus (2.1.281 startup dialogs) go only through `state/ink-menu-driver.ts`** — one confirmed arrow per write, Enter alone, under the host's one-device lease (`main/menu-answer-lock.ts`, `session:menu-lock`). Guards: `startup-dialogs.test.ts`, `menu-answer-lock.test.ts`.
- **`useSubmitConfirmation` is the second-line defense** — a bare `\r` only when `pending` stays 8s AND `canRetrySubmit()` passes. `attentionState==='ok'` ALONE is NOT idle (mid-turn, or with a menu up) — gating on it auto-answered prompts. `!isThinking` is no better.

## ESC / keyboard routing
- **ESC flows through the `useEscClose` stack → chat-passthrough guard** — the capture-phase listener `preventDefault()`s a popped overlay; the App bubble-phase listener reads `defaultPrevented` before forwarding `\x1b` to the PTY. Never add parallel ESC listeners. Passthrough returns when `viewMode==='terminal'` — xterm forwards ESC natively.
- **Chat-to-PTY interrupt is single-byte** (`sendInput(sessionId, '\x1b')`) — never wrap it in the paste-splitter.
- **Interrupt markers end the turn** — `transcript-watcher.ts` emits `user-interrupt` for `[Request interrupted by user]` (exact) → `TRANSCRIPT_INTERRUPT` → `endTurn()`. Removing it renders a user bubble + strands running tools.

## PTY resize (Windows) — `TerminalView.fitAndSync`
- **Dedup on unchanged cols/rows BEFORE the resize IPC.** Windows ConPTY reflows and re-emits its buffer on every resize, and ResizeObserver + `proposeDimensions()` fire spuriously → CC's Ink UI lands in xterm scrollback. Dedup is a mount-effect closure (`lastCols`/`lastRows`).

## Launch environment (`pty-worker.js` case `'spawn'`)
- **Spawned `claude` MUST NOT inherit CC's own session-identity env vars.** Inherited `CLAUDECODE`/`CLAUDE_CODE_*` (e.g. `run-dev.sh` run by the Bash tool) make the child think it is nested, and **nested interactive CC writes NO top-level transcript** — chat view stays EMPTY while terminal and hooks look fine. The spawn chokepoint DELETES them; no raw `...process.env` spread. youcoded#106.
