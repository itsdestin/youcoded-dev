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
Done: On branch session/workspace-tools-batch (not merged): scripts/page-standin.mjs serves any page folder for testing away from the running app, with the page's own saved data and no internet, tokens or write-back (9 tests).
Next: Destin, 2026-11-10: the Analytics page's source goes in a PRIVATE repo. To do: move the page folder into a private repo (youcoded-admin or a new one) and point the app's copy at it. Still open: whether the local stand-in may read the live analytics numbers with his sign-in.
Blocked: 

Chats
