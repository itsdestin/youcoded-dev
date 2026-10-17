---
id: 151
title: Code tidy-ups left from older reviews
stage: explore
tags: dev-workspace, housekeeping, desktop, remote-access
branch: 151-code-tidy-ups-left-from
created: 2026-10-16
why: found in the 2026-10-16 document sweep
summary: Five small code clean-ups and one keep-or-delete decision left over from July code reviews; none changes what people see.
area: Developer tools
side: behind
---
Progress
Done: nothing yet.
Next: plan it.
Blocked: nothing.

Chats

What it covers (from the 2026-10-16 document sweep)
Small clean-ups found in older reviews that nothing else tracks. None changes what a person sees.
1. A time stamp taken from the clock instead of from the event: `transcript-watcher.ts` (about line 97) uses `Date.now()` where it should use the event's own time. Source: docs/active/handoffs/2026-07-10-remote-access-review-handoff.md (Finding 5).
2. The phone-connection server keeps its own hand-written copies of the defaults and saved-folders code instead of using the shared one. Write a test for renaming a folder over the phone connection first, then merge the copies. Source: docs/active/handoffs/2026-07-10-remote-access-review-handoff.md (Finding 3).
3. The status-data builder repeats the same read-with-fallback loop three times; a shared `readPerSession` helper does not exist yet. Source: docs/active/handoffs/2026-07-10-review-followups.md.
4. The saved-folder list compares folder paths by hand (lower-casing); it should use the shared `canonicalize()` instead. Source: docs/active/handoffs/2026-07-10-review-followups.md.
5. Decision for Destin: the unused marketplace "get/set plugin settings" connection (`marketplace:get-config` / `set-config`) was left in place when its settings form was deleted. Delete the whole chain, or keep it? Source: docs/active/handoffs/2026-07-10-review-followups.md.
Dropped as moot: the same review's Kotlin items (the Android code is deleted).
