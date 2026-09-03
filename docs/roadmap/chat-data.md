# chat-data — everything kept about a chat
Filing test: everything kept about a chat — transcript, title, tags, notes, search index,
resume state. Not here: the model is running right now (native-harness); the files a chat
produced and the panel that shows them (files).

- [ ] Chat Search phase 3 — per-conversation digests (resolved / open / abandoned / unclear) behind an
      off-by-default preference and a model picker, so the open marker and the "open" state filter in
      search results stop answering "cannot be determined yet"; phases 1 and 2 shipped, phase 3 is
      unbuilt; open question whether digests should be user-editable (claude.ai's memory summary is)
      `desktop` `needs-verify` `checked 2026-09-01` `v1.3.1`

- [ ] After switching models in a chat, the saved conversation record still shows the model from
      before the swap (desktop, 2026-08-27); a red test for it sits on branch test/last-used-model-pin
      `desktop` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-metadata-only-save-keeps-old-last-used-model.md

- [ ] A conversation's name in the store and in Claude Code's topic file disagreed for the same chat
      (desktop, 2026-07-26); re-checked 2026-08-12 the same pair agreed again with no code change —
      needs a fresh sighting before anything is touched
      `resume-browser` `desktop` `needs-verify` `checked 2026-08-12` `needs-repro`

- [ ] "Welcome back" on cold start — after a window close, crash or OS kill, list the chats that were
      still open in the strip with checkboxes, Resume-all and Start-fresh; waiting on Destin to decide
      device scoping (chats left open on one machine must not pop up on another) and the milestone
      Destin 2026-09-02: this device only; discard any old branch and build it fresh
      `desktop` `needs-verify` `checked 2026-09-02` → docs/active/investigations/2026-09-01-resume-on-startup-welcome-back.md

- [ ] You cannot rename a conversation — names are auto-generated only, on every platform; all
      eight surveyed competitors have rename (2026-08-31)
      `resume-browser` `all` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-rename-a-conversation.md

- [ ] The Resume Browser search box only matches names, project paths, notes and tags — a phrase you
      remember from inside a chat finds nothing, even though the full-text index exists and the
      assistant can search it for you (2026-08-31)
      `resume-browser` `all` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-search-transcript-content-from-resume-browser.md

- [ ] Conversation organizing, the rest of the parity gap: user-made folders (today chats group only
      by where the session ran), multi-select for bulk tag / hide / complete, and sort or filter beyond
      project · tag · show-complete (tag combinations, "untagged"); list speed is no longer a gate
      `resume-browser` `all` `parked` `checked 2026-08-31`

- [ ] Every replayed chat bubble is stamped with the moment you opened the session, not when it was
      actually said — with timestamps on, an old session reads as if it all happened "now", on any
      device. Consumer audit done 2026-09-02: needs TWO decisions, not one edit — see the report
      `chat` `all` `decision` `checked 2026-09-02` → docs/active/investigations/2026-09-01-replayed-bubbles-stamped-with-replay-time.md

- [ ] After the app's window crashes and reloads, every session comes back named "New Session" — the
      title you saw was never saved, only the live window knew it
      `session-drawer` `desktop` `needs-verify` `checked 2026-07-17`

- [ ] Leftovers from the 2026-08-12 session-file repair work, all safe-direction: a repair record can
      keep a dead key forever once a mis-filed session vanishes; and the remaining follow-ups the
      branch review deferred (see `fix/project-slug-encoding` review notes in git history)
      `desktop` `needs-verify` `checked 2026-08-12`

- [ ] The auto-title reminder fires about six times per conversation instead of once — 277 wasted
      round trips across 46 sessions in the 2026-08-28 study, still firing on 2026-08-31. Wants a
      fire-once-per-conversation guard
      `desktop` `needs-verify` `checked 2026-08-31` `performance`
