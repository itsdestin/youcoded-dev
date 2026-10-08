# chat-data — everything kept about a chat
Filing test: everything kept about a chat — transcript, title, tags, notes, search index,
resume state. Not here: the model is running right now (native-harness); the files a chat
produced and the panel that shows them (files).

- [ ] v1.3.1 release blocker: the replayed-turn record's type is ambiguous (D11 in the simplification plan).
      The separately open smaller-read, catalog and cleanup costs belong to perf and stay blocked on phase 5. The
      2026-09-26 Resume scan cache (youcoded#573) shipped and cut settled open from 1.7 to 0.3 s, but did not
      close this type issue.
      `desktop` `blocked` `P1` `checked 2026-09-26` `v1.3.1` → docs/active/plans/2026-09-16-simplification-phases.md

- [ ] Resume browser and conversation lists: eight clarity gaps.
      (a) Nothing in the top bar says "past conversations" or "history"; the only door is the sessions chevron
      ("Sessions in this window") or /resume (beta tester). (b) No close button; only Escape or the dark area.
      (c) Cards older than a week show only a date, so same-day conversations look alike and the sort flip seems
      to do nothing. (d) A conversation whose model is not set up shows a greyed Resume Session and "Choose a
      model…" with no reason. (e) Nothing says how to open a row: the name opens Rename (a tester expected it to
      open the chat). (f) At phone width, row details truncate to stubs ("wecoded-m…"). (g) Priority shows as
      a tag but the Tags filter cannot narrow to it, and the note marker cannot be filtered. (h) The Projects
      page's list shows only Claude Code conversations, with no tags, note or model, and omits assistant ones.
      `resume-browser` `all` `confirmed` `P3` `checked 2026-09-10`

- [ ] Session naming: four loose ends.
      (a) A conversation renamed by hand cannot go back to automatic naming; Destin removed the reset button
      ("get rid of that button. it's dumb"), so the only way out is typing another name (spec:
      docs/archive/specs/2026-09-08-session-naming-design.md). (b) The reply counter may double-count after a
      `/clear` in a very long session; worst case an early extra AI review (report:
      docs/archive/reviews/2026-09-09-session-naming-code-review.md). (c) After the window crashes and reloads,
      every session comes back named "New Session". (d) A name once disagreed between the store and Claude Code's
      topic file (2026-07-26), then agreed again; needs a fresh sighting.
      `session-drawer` `desktop` `needs-verify` `P3` `checked 2026-07-17` `needs-repro`

- [ ] Search gaps: three things search cannot find or answer.
      (a) The Resume browser search matches only names, paths, notes and tags, so a phrase remembered from inside
      a chat finds nothing (2026-08-31; report: docs/active/investigations/2026-09-01-search-transcript-content-from-resume-browser.md).
      (b) Searching a long conversation cannot find text on older pages never loaded; the count should say what
      was searched. (c) Chat Search phase 3: per-conversation digests (resolved / open / abandoned) behind an
      off-by-default setting, so the "open" filter stops saying "cannot be determined yet"; taken off 1.3.1 in the
      2026-09-23 triage.
      `all` `confirmed` `P3` `checked 2026-09-01`

- [ ] Every replayed chat bubble is stamped with the moment you opened the session, not when it was said, so
      with timestamps on an old session reads as if it all happened "now", on any device. Needs TWO decisions,
      not one edit; see the report.
      `chat` `all` `decision` `P3` `checked 2026-09-02` → docs/active/investigations/2026-09-01-replayed-bubbles-stamped-with-replay-time.md

- [ ] Rare chat oddities, not yet reproduced (three things).
      (a) A streamed reply split mid-sentence across two bubbles once in ~30 loaded practice-app runs while the
      computer was busy (2026-09-27); not seen in the real app. (b) The first Resume open after launch "can
      seemingly load indefinitely" (Destin, 2026-09-25); it now says "Still loading" with Try again after 6 s,
      never reproduced; next time note the time and check `~/.claude/desktop.log` (report:
      docs/active/investigations/2026-09-26-startup-resume-real-scale.md). (c) Leftovers from the 2026-08-12
      session-file repair work, all safe-direction: a repair record can keep a dead key forever.
      `desktop` `needs-verify` `P3` `checked 2026-08-12` `needs-repro`

- [ ] Parked ideas: conversation lists (two things).
      (a) Enter in the Resume browser's search box opens the top result. (b) Conversation organizing: user-made
      folders, multi-select for bulk tag / hide / complete, and sort or filter beyond project · tag ·
      show-complete (tag combinations, "untagged").
      `resume-browser` `all` `parked` `P3` `checked 2026-08-31`
