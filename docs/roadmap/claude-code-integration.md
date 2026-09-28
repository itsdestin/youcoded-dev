# claude-code-integration — the app steering Claude Code's terminal
Filing test: Claude Code is doing the work and the app is steering its terminal — the
terminal pane, the PTY, fake keystrokes, hooks the app plants, install and login checks. Not
here: the app's own agent (native-harness); chat bubbles shared by both (user-interface /
chat-data).

- [ ] "Very rarely a message I send appears twice in chat, more often with very long messages."
      One cause is fixed (a pasted tab, 2026-09-23). A second remains: on four long messages
      (168–220 characters) Claude Code saved the message, never answered it, then saved it again
      as a fresh send 7–49 s later. The second send lines up with the app's automatic 8-second
      "press Enter again" retry; what put the text back in Claude Code's box is unproven
      (suspected: a cancel before the reply started). Next step: reproduce in a dev instance with
      the keystroke trace on (found 2026-09-23 from transcripts 1b802f05, 327bd6e1)
      `chat` `desktop` `needs-verify` `checked 2026-09-23` `needs-repro`

- [ ] When `~/.claude/settings.json` could not be read at launch (a stray comma, a half-written
      save), the app now quietly moves it aside as `settings.json.corrupt-<time>` and writes a
      fresh one so its hooks keep working — but it only says so in its log. Anything the user had
      put in that file (their own permissions, a custom status line) is in the backup and nobody
      is told. Wanted: tell them in the app that a backup was saved at that path, with a button to
      open it, instead of only a log line (rule decided 2026-09-17, simplification phase 3)
      `chat` `all` `confirmed` `checked 2026-09-17`

- [ ] A launch-time change to `~/.claude/settings.json` (the hooks the app plants) is silently
      skipped when another writer holds the file's lock for more than 3 s (`LOCK_MAX_WAIT_MS`,
      `src/main/artifacts/cas-write.ts`): the call returns `refused: 'locked'` and only logs. Seen
      only on an overloaded Windows CI runner (one write took 1–3 s there; youcoded#529 fixed the
      TEST, not this). Open question for Destin: leave it, raise the wait to ~10 s (slower start
      if a lock is truly stuck), or say so in the app. Measure a real slow Windows disk first
      `settings` `desktop` `decision` `checked 2026-09-19`

- [ ] In the model picker, Fast mode’s “⚠ Billed Per Token” warning is a one-off hand-built box
      rather than the app’s shared warning box, so it will not follow changes to how warnings
      look. Found by the design check on 2026-09-16; moving it changes its look slightly.
      `model-picker` `desktop` `confirmed` `checked 2026-09-16`

- [ ] Idea: the app's bundled hooks (write-guard, hook-relay) could rewrite tool output at the
      boundary — redact secrets or PII, normalize paths — now that Claude Code lets a PostToolUse
      hook replace any tool's output (2.1.121+). Additive; nothing depends on it
      `all` `parked` `checked 2026-04-29`

- [ ] After resuming a Claude Code session, some tool cards still show as running — a tool cannot be
      live in a session that was closed. The native-session half shipped (PR #287); what remains is
      Claude Code sessions, where the app has no mid-turn idle signal to reap them on
      `tool-cards` `all` `needs-verify` `checked 2026-09-01`

- [ ] Three more ways a Claude Code prompt card can stick around after the prompt is gone (a remote
      client that connected mid-prompt, Android's native prompt hook, the buddy window's feed) — all
      the same family the 2026-07-17 fix covered for the main chat only
      `tool-cards` `all` `needs-verify` `checked 2026-07-17`

- [ ] Idea: show Claude Code's `claude agents` view — one list of every session, including daemon-run
      background sessions — inside the app's multi-session UI. Large and speculative
      `all` `parked` `checked 2026-05-18`

- [ ] Idea: surface Claude Code's `/goal` (a completion condition it works toward across turns, with a
      live elapsed/turns/tokens readout) as a status-bar widget or banner
      `status-bar` `all` `parked` `checked 2026-05-18`

- [ ] Idea: a Settings → Development toggle for Claude Code's forked-subagent flag
      (`CLAUDE_CODE_FORK_SUBAGENT`)
      `settings/development` `desktop` `parked` `checked 2026-04-21`

- [ ] Reloading the app window while a permission or plan question is waiting makes its card
      disappear: the terminal looks blank and the chat looks idle while Claude Code is still
      waiting for an answer. Now that a question is held for up to 2 hours, this can last much
      longer than before (found 2026-09-23)
      `tool-cards` `desktop` `confirmed` `checked 2026-09-23`

- [ ] On Android, the protection that stops a `claude` started inside a chat from taking over
      that chat does nothing yet: the Claude Code bundled with the Android app (2.1.112) does not
      pass along what the protection needs. It switches on by itself once Android's Claude Code
      is updated (found 2026-09-23)
      `android` `confirmed` `checked 2026-09-23`
