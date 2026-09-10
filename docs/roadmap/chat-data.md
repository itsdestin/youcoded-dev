# chat-data — everything kept about a chat
Filing test: everything kept about a chat — transcript, title, tags, notes, search index,
resume state. Not here: the model is running right now (native-harness); the files a chat
produced and the panel that shows them (files).

- [ ] Once the Organize (tags and note) sheet has been opened and closed on a row, the Resume
      browser no longer closes on Escape — three presses and it stays open; clicking the backdrop
      still closes it (seen in the workbench while filming the promo, 2026-09-03)
      `resume-browser` `desktop` `needs-verify` `checked 2026-09-03`

- [ ] Chat Search phase 3 — per-conversation digests (resolved / open / abandoned / unclear) behind an
      off-by-default preference and a model picker, so the open marker and the "open" state filter in
      search results stop answering "cannot be determined yet"; phases 1 and 2 shipped, phase 3 is
      unbuilt; open question whether digests should be user-editable (claude.ai's memory summary is)
      `desktop` `needs-verify` `checked 2026-09-01` `v1.3.1`

- [ ] After switching models in a chat, the saved conversation record still shows the model from
      before the swap (desktop, 2026-08-27); a red test for it sits on branch test/last-used-model-pin
      `desktop` `needs-verify` `checked 2026-09-01` → docs/active/investigations/2026-09-01-metadata-only-save-keeps-old-last-used-model.md

- [ ] A conversation's name in the store and in Claude Code's topic file disagreed for the same chat
      (desktop, 2026-07-26); re-checked 2026-08-12 the same pair agreed again with no code change —
      needs a fresh sighting before anything is touched
      `resume-browser` `desktop` `needs-verify` `checked 2026-08-12` `needs-repro`

- [ ] "Welcome back" on cold start — after a window close, crash or OS kill, list the chats that were
      still open in the strip with checkboxes, Resume-all and Start-fresh; waiting on Destin to decide
      device scoping (chats left open on one machine must not pop up on another) and the milestone
      Destin 2026-09-02: this device only; discard any old branch and build it fresh
      `desktop` `needs-verify` `checked 2026-09-02` → docs/active/investigations/2026-09-01-resume-on-startup-welcome-back.md

- [ ] A conversation you renamed by hand cannot be handed back to automatic naming. Review 3
      removed the reset action from the dialog ("get rid of that button. it's dumb"), so the
      only way out is to type another name. Matters in AI mode, where automatic naming would
      otherwise keep following the subject; barely matters in Basic, which names once anyway.
      The generated name IS still remembered, so any future affordance costs no model call
      `resume-browser` `all` `decision` `checked 2026-09-09` → docs/archive/specs/2026-09-08-session-naming-design.md

- [ ] Session naming's reply counter may double-count after a `/clear` truncation. The
      transcript watcher resets its read offset to 0 and re-emits historical `turn-complete`
      lines; the namer dedups by transcript uuid but caps that set at 200 and trims to 100,
      so a very long session could re-count. Flagged unconfirmed by the 2026-09-09 code
      review (F-not-covered); worst case is an early extra AI review, not a wrong name
      `desktop` `needs-verify` `checked 2026-09-09` → docs/archive/reviews/2026-09-09-session-naming-code-review.md

- [ ] Opening a long conversation in the Resume Browser's preview pauses noticeably before it
      appears — reading the last 40 messages parses the whole transcript file. Nothing flickers
      and the row highlights immediately, so it reads as slow rather than broken (2026-09-10)
      `resume-browser` `desktop` `confirmed` `checked 2026-09-10` `performance`

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

- [ ] Searching a long conversation says "no results" for text that is definitely there — since
      paged history shipped (youcoded#349), only the most recent ~30 turns are in the DOM, and
      `ContentFindBar.tsx` finds text by walking the DOM (`document.createTreeWalker`), so
      everything older is unfindable and the counter reads `0/0`. Surfaced by the perf cycle-3
      review 2026-08-28; nobody has reported it because it fails silently. Wants the match count
      to say what was searched when `history.hasMore` — e.g. "searching recent messages, scroll
      up to search older ones"
      `desktop` `needs-verify` `checked 2026-09-03` `regression`
