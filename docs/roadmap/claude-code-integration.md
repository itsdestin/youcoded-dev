# claude-code-integration — the app steering Claude Code's terminal
Filing test: Claude Code is doing the work and the app is steering its terminal — the
terminal pane, the PTY, fake keystrokes, hooks the app plants, install and login checks. Not
here: the app's own agent (native-harness); chat bubbles shared by both (user-interface /
chat-data).

- [ ] Sending messages to Claude Code: 2 unproven faults.
      (a) "Very rarely a message I send appears twice in chat, more often with very long messages."
      One cause is fixed (a pasted tab); a second remains where Claude Code saved the message,
      never answered, then saved it again 7–49 s later, matching the app's 8-second "press Enter
      again" retry. Next: reproduce in a dev instance with the keystroke trace on. (b) Claude Code's
      "How is Claude doing this session? 1: Bad 2: Fine 3: Good" rating may swallow a leading digit
      of a chat message and send a rating nobody chose; unverified, it could not be triggered on
      demand (next: catch it live and send "1 thing").
      `chat` `all` `needs-verify` `P3` `checked 2026-09-23` `needs-repro`

- [ ] Prompt and question cards that stick or vanish: 3 faults.
      (a) After resuming a Claude Code session some tool cards still show as running; the native half
      shipped, Claude Code has no mid-turn idle signal to clear them. (b) Three more ways a prompt
      card can outlive its prompt (a remote client that connected mid-prompt, Android's prompt hook,
      the buddy window's feed). (c) Reloading the app window while a permission or plan question
      waits makes its card disappear: the terminal looks blank and chat looks idle while Claude Code
      still waits, now up to 2 hours.
      `tool-cards` `all` `confirmed` `P3` `checked 2026-07-17`

- [ ] Claude Code integration: 5 small faults.
      (a) If `~/.claude/settings.json` cannot be read at launch, the app moves it aside as a
      `.corrupt-<time>` backup and writes a fresh one, telling nobody; wanted an in-app notice with
      an open button. (b) A launch-time hook change is silently skipped when another writer holds
      the file's lock over 3 s, seen only on an overloaded Windows CI runner; leave it, raise the
      wait to ~10 s, or say so in the app. (c) Fast mode's "Billed Per Token" warning is a one-off
      box, not the shared warning box. (d) On Android, protection stopping a `claude` started in a
      chat from taking over that chat does nothing until Android's bundled Claude Code (2.1.112) is
      updated. (e) The recorded Claude Code screens the tests replay are from 2.1.281; a reworded
      prompt in a newer version would pass tests and break the real thing — re-record them.
      `all` `confirmed` `P3` `checked 2026-09-16` `regression`

- [ ] Parked ideas: 5 Claude Code ideas.
      (a) Cards for pop-ups the app only blocks today: Continue/Dismiss for notices with no options,
      full-body cards for review pop-ups; first log which occur (Destin deferred to "test and wrap
      up"). (b) Bundled hooks rewriting tool output (redact secrets, normalize paths). (c) Show
      `claude agents`, every session including background ones, in the multi-session UI. (d) Surface
      `/goal` as a status-bar widget or banner. (e) A Settings → Development toggle for the
      forked-subagent flag.
      `all` `parked` `P3` `checked 2026-04-21`
