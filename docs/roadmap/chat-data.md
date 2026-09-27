# chat-data — everything kept about a chat
Filing test: everything kept about a chat — transcript, title, tags, notes, search index,
resume state. Not here: the model is running right now (native-harness); the files a chat
produced and the panel that shows them (files).

- [ ] The Projects page's conversation list shows only Claude Code conversations and carries no
      tags, note or last-used model, so its cards look sparser than the same conversations in the
      Resume browser, and assistant conversations in that folder never appear there (seen while
      matching the two cards, 2026-09-16)
      `projects` `desktop` `confirmed` `checked 2026-09-16`

- [ ] Priority shows as a tag on every card and in the per-card tag picker, but the Tags filter
      cannot narrow to it; the note marker looks like a tag too and cannot be filtered
      `resume-browser` `all` `confirmed` `checked 2026-09-10`

- [ ] Nothing in the top bar says "past conversations" or "history": the only entrance is the
      sessions chevron whose panel is headed "Sessions in this window" with a Resume button at the
      bottom, or typing /resume (beta tester, 2026-09-10)
      `session-drawer` `all` `confirmed` `checked 2026-09-10`

- [ ] The Resume browser has no close button; only Escape or clicking the dark area closes it
      `resume-browser` `all` `confirmed` `checked 2026-09-10`

- [ ] Resume browser cards older than a week show only a date ("just now / 3h ago / 2d ago" covers
      the first seven days), so older conversations from the same day cannot be told apart and the
      Most recent / Oldest first flip looks like it did nothing among them
      `resume-browser` `all` `confirmed` `checked 2026-09-16`

- [ ] In the Resume browser's expanded row, a conversation whose original model is not set up here
      shows a greyed Resume Session button and a "Choose a model…" field with no word about why
      (beta tester, 2026-09-10)
      `resume-browser` `all` `confirmed` `checked 2026-09-10`

- [ ] Nothing on a Resume browser row says how to open it: the name opens Rename, the rest of the
      row previews the conversation (desktop) or expands a panel (phone width) and the Resume
      Session button sits in the preview's foot; a beta tester expected the name to open it
      `resume-browser` `all` `confirmed` `checked 2026-09-16`

- [ ] At phone width the Resume browser's expanded row details truncate to unreadable stubs
      ("wecoded-m…", "qwen3-coder-30…"). (The Skip Permissions switch it also showed is not a
      phone-only difference: desktop's preview foot renders the same options, gated only on the
      conversation not being native — re-checked 2026-09-16)
      `resume-browser` `remote` `confirmed` `checked 2026-09-16`

- [ ] Idea: Enter in the Resume browser's search box could open the top result
      `resume-browser` `all` `parked` `checked 2026-09-10`

- [ ] Chat Search phase 3 — per-conversation digests (resolved / open / abandoned / unclear) behind an
      off-by-default preference and a model picker, so the open marker and the "open" state filter in
      search results stop answering "cannot be determined yet"; phases 1 and 2 shipped, phase 3 is
      unbuilt; open question whether digests should be user-editable (claude.ai's memory summary is). Taken off 1.3.1 in Destin's triage 2026-09-23
      `desktop` `needs-verify` `checked 2026-09-01`

- [ ] A conversation's name in the store and in Claude Code's topic file disagreed for the same chat
      (desktop, 2026-07-26); re-checked 2026-08-12 the same pair agreed again with no code change —
      needs a fresh sighting before anything is touched
      `resume-browser` `desktop` `needs-verify` `checked 2026-08-12` `needs-repro`

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

- [ ] **v1.3.1 release blocker.** Smaller reads left over from cycle 2 still do more work than
      they need to: two reads take whole files where the tail would do, the catalog fetches the
      same thing several times at once instead of once, per-session file tracking is never
      cleaned up, a history-replay path that reads a whole conversation into memory (a 112 MB
      file becomes a 224 MB string) is still wired up with nothing calling it (W5), and the
      replayed-turn record's type is ambiguous (D11). 2026-09-26 (youcoded#573, Destin asked
      for the Resume work ahead of phase 5): the Resume scan now remembers every conversation
      file by size and date across restarts, native and Claude Code halves (W1), and a folder's
      nickname lookup is remembered until the folder changes (W6) — settled open 1.7 s -> 0.3 s
      on a 2,600-conversation history. The rest resumes with phase 5
      `desktop` `blocked` `checked 2026-09-26` `performance` `v1.3.1` → docs/active/plans/2026-09-16-simplification-phases.md

- [ ] Starring, tagging or renaming a chat kicks off a full search-index rebuild three seconds
      later that lists, stats and chunk-reads every conversation on the main thread
      (`chatsearch-index`) — a stall with no visible cause. (The other half of this item, every
      conversation record read and heal listing the whole directory synchronously, shipped in
      youcoded#573, 2026-09-26: reads are async and heal shares one listing per second.)
      `desktop` `confirmed` `checked 2026-09-26` `performance`

- [ ] The first Resume open after launch "can seemingly load indefinitely" (Destin,
      2026-09-25). Never reproduced: on a copy of his 2,600-conversation history the worst was
      4.2 s before youcoded#573 and ~1.5 s after, and it now says "Still loading" with Try again
      after 6 s. Next time it happens, note the time; `~/.claude/desktop.log` around it is the
      next evidence
      `desktop` `needs-verify` `checked 2026-09-26` `needs-repro` → docs/active/investigations/2026-09-26-startup-resume-real-scale.md

