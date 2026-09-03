# claude-code-integration — the app steering Claude Code's terminal
Filing test: Claude Code is doing the work and the app is steering its terminal — the
terminal pane, the PTY, fake keystrokes, hooks the app plants, install and login checks. Not
here: the app's own agent (native-harness); chat bubbles shared by both (user-interface /
chat-data).

- [ ] Clicking a plan-approval button other than the first ("No, refine plan", "Tell Claude what to
      change") may still approve the plan as option 1 on Claude Code 2.1.220+ (found 2026-07-30
      during the permission-timeout review; not yet tried in a dev instance)
      `tool-cards` `desktop` `needs-verify` `checked 2026-09-02` → docs/active/investigations/2026-09-01-plan-approval-single-write.md

- [ ] On Android the permission-mode chip never shows "auto", and shows "normal" for any screen it
      cannot read — where desktop shows "unknown" (found 2026-07-17)
      `status-bar` `android` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-android-permission-mode-auto-unknown.md

- [ ] Android pops phantom prompt cards — a paste-your-sign-in-code card, or a Continue / "Ready"
      card — when Claude's ordinary reply merely contains phrases like "press Enter to continue" or
      "paste the code" (2026-07-16 sweep)
      `tool-cards` `android` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-android-bare-phrase-prompt-cards.md

- [ ] Every new Claude Code session opens with a "No such file or directory" hook error — the old
      youcoded-core start-up hook is still registered after the app deleted the folder it lived in
      (UI-review dev instance 2026-08-25; still in Destin's settings 2026-09-01)
      `terminal` `desktop` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-stale-session-start-hook.md

- [ ] Android still submits long messages (over ~56 bytes) with a fixed 600 ms pause before Enter,
      where desktop waits for the terminal's own echo — mirror the desktop approach (PITFALLS
      sweep, 2026-07-15)
      `android` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-android-pty-echo-driven-submit.md

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

- [ ] On the phone, Claude Code's full-screen redraws push duplicate banner chrome into the terminal's
      scroll history. Two candidate approaches (bigger scrollback, or disabling the alternate screen at
      launch); newer Claude Code versions fixed some cases upstream, so re-check first
      `terminal` `android` `parked` `checked 2026-05-18`

- [ ] Idea: show Claude Code's `claude agents` view — one list of every session, including daemon-run
      background sessions — inside the app's multi-session UI. Large and speculative
      `all` `parked` `checked 2026-05-18`

- [ ] Idea: surface Claude Code's `/goal` (a completion condition it works toward across turns, with a
      live elapsed/turns/tokens readout) as a status-bar widget or banner
      `status-bar` `all` `parked` `checked 2026-05-18`

- [ ] Idea: a Settings → Development toggle for Claude Code's forked-subagent flag
      (`CLAUDE_CODE_FORK_SUBAGENT`)
      `settings/development` `desktop` `parked` `checked 2026-04-21`

- [ ] Chat view hangs on "Initializing session..." forever when Claude Code is waiting on its
      trust-folder prompt — terminal view shows the prompt and answers fine, chat view never
      surfaces it and never times out (Destin, 2026-09-03, screenshot on file: "Accessing
      workspace: /home/destin ... Yes, I trust this folder"). The parser markers DO match that
      wording (`ink-select-parser.ts` — `quick safety check`, `execute files here`, `yes, i
      trust this folder`), so this is not a missing string: either `TrustGate` is not rendering
      it into chat view, or the session-initialized gate ("first hook = initialized",
      `App.tsx`) can never clear because CC has not started, which is a deadlock either way.
      Note the confounder in this repro — `~/.claude/settings.json` also had 12 dangling hook
      paths at the time, so hooks could not fire; re-verify with healthy hooks before
      concluding. An unclearable overlay was already noted as a UX bug in the 2026-08-07
      shipped entry and never tracked
      `desktop` `needs-verify` `checked 2026-09-03` `needs-repro`
