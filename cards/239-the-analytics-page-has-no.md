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
Next: Destin: 1) where the Analytics page's source should live. This workspace repo is PUBLIC, which is why the folder is ignored. Options: a private repo such as youcoded-admin (RECOMMENDED: history, owner-only); track only the page file here and keep the numbers ignored (risk: internal page logic becomes public; needs a scan first); or wait for the Pages 'Versions' menu being built on session/90-pages-finish. 2) whether the stand-in may also read the live analytics numbers with your sign-in (read-only).
Blocked: Destin's two choices.

Chats
