---
id: 239
title: The Analytics page has no change history and no shared test stand-in
stage: explore
tags: dev-workspace, pages, analytics
related: 90
branch: 239-the-analytics-page-has-no
finish: The page's source is kept somewhere with history, and a page can be served against real data for testing with one command
created: 2026-11-10
why: 2026-11-09: Pages/analytics/ is ignored by git, so three rounds of edits each needed a hand backup in a temporary folder (now copied to ~/Documents/youcoded-analytics-page-backups). The session also wrote its own stand-in for the app (serves the page with a fake window.youcoded that forwards to the live analytics server) to test away from the running app; it lives only in that session's scratch folder.
---
Progress
Done: scripts/page-standin.mjs (on PR #356) serves any page folder for testing away from the running app, with the page's own saved data and no internet, tokens or write-back (9 tests). Destin 2026-11-10: source goes in a private repo - done: page.html and page.json are now in youcoded-admin under pages/analytics/ (youcoded-admin PR #26, merged 02d2154), with a README saying to copy and commit after each edit.
Next: Destin: may the local stand-in also read the live analytics numbers with his sign-in (read-only)? Optional later: a one-command copy from the working folder into youcoded-admin, so the commit step cannot be forgotten.
Blocked: 

Chats
