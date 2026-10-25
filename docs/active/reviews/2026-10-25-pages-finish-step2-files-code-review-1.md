---
status: active
date: 2026-10-25
related: docs/active/specs/2026-10-24-pages-finish-step2-files-technical-design.md; card #90
branch: session/90-pages-finish (youcoded)
---

# Finishing Pages, step 2 (files) — code review 1

A fresh reviewer read the built file door (page-file-guard.ts, page-files.ts, page-thumbs.ts, the
service, channel table, host and bootstrap). Headline: no way found for a page's own calls to reach
outside what it was approved for; the ask, handle and folder-token owner checks hold. All 11
findings accepted and fixed, each pinned by a test in `tests/page-files.test.ts` ("the gaps a code
review found stay closed") or the existing suites.

1. **accepted** — `all` writes into `AppData/`, `Library/`, `~/bin`, `~/go/bin`: denied.
2. **accepted** — hidden files directly under home (`.vimrc`, `.bash_logout`…) writable via a
   Save window or the phone chooser: denied at every level; the phone chooser refuses dot names
   and applies the `all` rules.
3. **accepted** — YouCoded's own folders were write-protected but readable: now never read.
4. **accepted** — Open/Save windows on a timer: the host requires a real press in the page, and
   main shows one window at a time per page and window.
5. **accepted** — `recent()` minted new handles each call: the same file keeps its handle.
6. **accepted** — a chosen file named with `:` or a trailing dot failed to read: names are checked
   only on paths a page writes, not on files the person chose. (The phone listing still hides
   such names, since its answer could not name them back — a known limit.)
7. **accepted** — the folder itself was trusted after its first check: re-checked every call.
8. **accepted** — truncate-then-write could lose a file on failure: an existing file is replaced
   by renaming a finished copy over it; the memory budget is taken before anything is created.
9. **accepted** — text measured in characters, not bytes: measured in bytes before allocating.
10. **accepted** — pipe swapped in between check and open could hang: files open non-blocking.
11. **accepted** — write-only remember lines skipped by `recent`; handle cap checked after
    remembering; a tile read could read a grown file whole; chooser kept showing after a page
    switch: all fixed.
