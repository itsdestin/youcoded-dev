---
id: 34
title: Files and Office saving: ways work can be lost
stage: planning
priority: P1
tags: files, desktop, files-panel, bug
branch: 34-files-five-ways-work-can
roadmap: files: Files: five ways work can be silently lost.
created: 2026-10-15
summary: Unsaved drafts, Office edits and comments can be lost when windows close or two programs change one file, and Office saving leaves stale copies.
area: Files & documents
side: both
platform: Desktop only
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (files, status confirmed, seen on desktop, last checked 2026-10-02)
Files: five ways work can be silently lost. (a) An unsaved text-file draft in a window that is not the last one open is lost without a question when that window is closed with its X. (b) If the assistant or another program changes a Word/Excel/PowerPoint file while it is open in Office, Office's next autosave writes over the change without asking; the planned fix was never written (design: docs/archive/specs/2026-09-28-office-build-design.md §4a). (c) When the assistant adds, edits or deletes a comment in a Word/Excel file while Office is not ready, the change is thrown away after 10 minutes (or 50 waiting changes) with no message. (d) Closing an Office tab's kept typing after a restore can remove pictures a "Save a copy…" still in progress needs. (e) In a rare case, a copy saved from an Office tab kept open across a restore comes out missing some pictures (not yet confirmed).

Merged in #37 "Office saving: leftover copies and stale warnings"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (files, status confirmed, seen on all, last checked 2026-10-02)
Office saving: four leftovers and stale warnings. (a) Saving a comment into a Word/Excel file keeps one backup per file, never cleared, so they pile up. (b) "This file looks open in another app" can keep appearing for a closed file after Word or Excel crashes and leaves its hidden marker (accepted limit). (c) If the app quits mid-save, a hidden leftover folder with a copy of the document stays beside it until that file's next save, and only once over an hour old. (d) Reloading the app window, or a crash of its page, leaves its open Office documents open in the background until the window closes.
