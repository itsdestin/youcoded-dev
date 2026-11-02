---
id: 40
title: File links in chat fail for files outside the project
stage: merged
priority: P3
tags: files, chat, desktop, bug
branch: 40-a-file-chip-in-chat
roadmap: files: A file chip in chat for a file outside the project folder fa
created: 2026-10-15
summary: Clicking a file in chat that lives outside the project folder says "not found", and two same-named files look identical.
area: Chat
side: screens
platform: Desktop only
vision: chat.files.drawer
work: session/40-file-chip-wrong-folder
---
Progress
Done: Short chip paths now also searched beside the chat's own files; failed chip clicks show their note while a file is open; assistant told to give full paths. Branch session/40-file-chip-wrong-folder, verify.sh green.
Next: Destin reviews file-chips.review deck; then merge on his word.
Blocked: nothing recorded.

Chats
- 2026-10-30 session/40-file-chip-wrong-folder: chat started

From the old roadmap (files, status needs-verify, seen on desktop, last checked 2026-09-03)
A file chip in chat for a file outside the project folder fails with "Couldn't open README.md — the file wasn't found in this project", and the chip shows only the bare filename so two READMEs look identical. The same click on a project file works (Destin, 2026-09-03, a document in his notes repo).
