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

- [ ] Clicking a plan-approval button other than the first ("No, refine plan", "Tell Claude what to
      change") may still approve the plan as option 1 on Claude Code 2.1.220+ (found 2026-07-30
      during the permission-timeout review; not yet tried in a dev instance)
      `tool-cards` `desktop` `needs-verify` `checked 2026-09-02` → docs/active/investigations/2026-09-01-plan-approval-single-write.md

- [ ] Idea: the app's bundled hooks (write-guard, hook-relay) could rewrite tool output at the
      boundary — redact secrets or PII, normalize paths — now that Claude Code lets a PostToolUse
      hook replace any tool's output (2.1.121+). Additive; nothing depends on it
      `all` `parked` `checked 2026-04-29`

- [ ] A permission ask left unanswered for five minutes quietly expires and the session sits wedged
      with no way forward — worst with the assistant's own questions (AskUserQuestion). The fix was
      built on branch `feat/permission-ask-timeout` (worktree `worktrees/perm-timeout`, youcoded PR #278,
      2026-07-31) but the PR was never reviewed and now conflicts heavily with master
      `tool-cards` `all` `blocked` `checked 2026-09-01`

- [ ] In one narrow ordering the hook relay can lose a permission expiry entirely — the card keeps
      showing a live ask over a socket that is already dead; clicking any button then reports the
      failure honestly. Found in the permission-timeout review; fix rides that same branch
      `tool-cards` `desktop` `needs-verify` `checked 2026-07-31`

- [ ] After resuming a Claude Code session, some tool cards still show as running — a tool cannot be
      live in a session that was closed. The native-session half shipped (PR #287); what remains is
      Claude Code sessions, where the app has no mid-turn idle signal to reap them on
      `tool-cards` `all` `needs-verify` `checked 2026-09-01`

- [ ] The session id the app hands Claude Code leaks into every process that session starts, so a
      `claude` launched from inside a session (Bash tool, script, background job) reports its hooks
      under the parent session's id — this is what once repointed a live chat view at a foreign
      transcript (2026-07-26, verified on the Z13)
      `desktop` `needs-verify` `checked 2026-07-26` `security`

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

- [ ] Chat view hangs on "Initializing session..." when Claude Code is waiting on its
      trust-folder prompt — terminal view shows the prompt and answers fine, chat view never
      surfaces it (Destin, 2026-09-03, screenshot on file: "Accessing workspace: /home/destin
      ... Yes, I trust this folder"). Since 2026-09-14 the screen at least says "Something may
      be wrong" after 6 s with a Check terminal view button, so it no longer hangs silently. The
      parser markers DO match that wording (`ink-select-parser.ts`), and the init gate is
      already released the moment a trust prompt is detected — so the remaining suspect is the
      trust-gate detection itself never seeing the prompt in chat state. Note the confounder in
      this repro — `~/.claude/settings.json` also had 12 dangling hook paths at the time, so
      hooks could not fire; re-verify with healthy hooks before concluding
      `desktop` `needs-verify` `checked 2026-09-16` `needs-repro`
