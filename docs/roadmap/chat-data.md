# chat-data — everything kept about a chat
Filing test: everything kept about a chat — transcript, title, tags, notes, search index,
resume state. Not here: the model is running right now (native-harness); the files a chat
produced and the panel that shows them (files).

- [ ] The Projects page's conversation list shows only Claude Code conversations and carries no
      tags, note or last-used model, so its cards look sparser than the same conversations in the
      Resume browser, and assistant conversations in that folder never appear there (seen while
      matching the two cards, 2026-09-16)
      `projects` `desktop` `confirmed` `checked 2026-09-16`

- [ ] Once the Organize (tags and note) sheet has been opened and closed on a row, the Resume
      browser no longer closes on Escape — three presses and it stays open; clicking the backdrop
      still closes it (seen in the workbench while filming the promo, 2026-09-03). Same cause as
      the 2026-09-10 code-review finding that a SECOND Escape can fall through to the chat: the
      layered Escape handling pops the browser's entry after the first press and nothing puts it
      back (`use-esc-close.tsx` re-pushes only when `open` or the store changes)
      `resume-browser` `desktop` `needs-verify` `checked 2026-09-16`

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

- [ ] Resuming a conversation that is already open in a tab made a second tab with the same name
      instead of switching to it (seen in the workbench, 2026-09-10)
      `resume-browser` `desktop` `needs-verify` `checked 2026-09-10`

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

- [ ] "Welcome back" on cold start — after a window close, crash or OS kill, list the chats that were
      still open in the strip with checkboxes, Resume-all and Start-fresh. Scoping is decided
      (Destin 2026-09-02: this device only — chats left open on one machine must not pop up on
      another; discard any old branch and build it fresh); nothing is built and no milestone is set
      `desktop` `confirmed` `checked 2026-09-16` → docs/active/investigations/2026-09-01-resume-on-startup-welcome-back.md

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

- [ ] **v1.3.1 release blocker.** Four smaller reads left over from cycle 2 still do more work than they need to: listing
      past conversations re-reads about 25 MB every time the list opens and runs without a
      concurrency cap, two more reads take whole files where the tail would do, the catalog
      fetches the same thing several times at once instead of once, and per-session file
      tracking is never cleaned up. Individually small, all on paths the user waits on.
      Deferred at the time by scope decision; carried over from the cycle-3 handoff when that
      document was archived 2026-09-10, where they existed only inside a shipped entry.
      2026-09-16 (smoothness sweep C6, MERGED youcoded#501): the NATIVE half of the Resume
      listing — every session file listed and 256 KB of each head-read synchronously — now
      reads off the main thread; the Claude Code half (the 25 MB re-read, no concurrency cap)
      and the other three are still as described. The 2026-09-16 simplification audit measured
      the same Resume scan (W1): every open re-reads every conversation file — about 260 MB on
      this machine — with nothing cached, and Project View pays the same scan just to count
      files per folder; a folder's nickname-to-path lookup is redone on every browse and, when
      nothing matches, reads every conversation in the folder in full (W6); and a history-replay
      path that reads a whole conversation into memory (a 112 MB file becomes a 224 MB string)
      is still wired up with nothing calling it (W5). Wanted: a size-and-date cache in front of
      the per-file reader so an unchanged history opens without reading a file, the lookup
      remembered and its fallback capped, the dead replay path deleted, and the replayed-turn
      record's type made unambiguous (D11) — simplification phase 5's chat-data share. Resume
      opens faster on a big history; nothing else changes. On hold since 2026-09-18 (Destin):
      resumes after phase 4, with the rest of phase 5
      `desktop` `blocked` `checked 2026-09-18` `performance` `v1.3.1` → docs/active/plans/2026-09-16-simplification-phases.md

- [ ] Every conversation record write and read first lists the whole conversations directory,
      synchronously (`conversation-store.ts` heal-on-write/read — one `readdirSync` over a file
      per conversation ever recorded, per turn per live session), and starring, tagging or
      renaming a chat kicks off a full search-index rebuild three seconds later that lists,
      stats and chunk-reads every conversation on the main thread (`chatsearch-index`). Neither
      is on a click path a user waits on directly; both are stalls with no visible cause.
      Deferred by the 2026-09-16 smoothness sweep (C7) because `conversation-store.ts` is being
      rewritten on `session/sync-safety-audit-20260908` — convert both after that lands
      `desktop` `confirmed` `checked 2026-09-16` `performance`

- [ ] The 30-minute conversation reconcile lists every transcript ever written and lstat +
      tail-reads each one, synchronously — a stall every half hour that grows for as long as
      the app has been used (`conversations/reconciler.ts`; its own note measured 2.8 s at 600
      records before the last fix). Found by the 2026-09-16 smoothness sweep (C10), not built:
      the fix is the same fs.promises recipe the click paths got, with the walk bounded per tick
      `desktop` `confirmed` `checked 2026-09-16` `performance`

