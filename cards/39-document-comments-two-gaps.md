---
id: 39
title: Document comments: two small gaps
stage: planning
priority: P3
tags: files, files-panel, polish
branch: 39-document-comments-two-gaps
created: 2026-10-15
summary: Comments show only "5h ago" with no exact time, and on the phone an open comments panel doesn't update by itself.
area: Files & documents
side: screens
vision: chat.files.comments
---
Progress
Done: The comment popup looks right now (frosted hover card, reliable Add comment button), and the thin side marker strip is gone. Shipped in the app update from October 21 (v1.3.2).
Next: (a) Hovering a comment should show its exact time, not just "5h ago". (b) On a phone, check whether an open comments list refreshes by itself when a comment changes on the computer; the code looks like it already does this, so test on a phone first before building anything.
Blocked: none.

Chats
- 2026-10-18 session/39-comment-popup: chat started

From the old roadmap (files, status confirmed, seen on all, last checked 2026-09-28)
Document comments: two gaps. (a) Comment times are only relative ("5h ago"): hovering could show the exact time, a resolved comment could say when it was resolved (not possible for Word/Excel), and the assistant could see comment times (offered 2026-09-28, not chosen for the first version). (b) On the phone, an open comments panel does not update when comments change elsewhere; reopening the file shows them (Destin: fine for now).
