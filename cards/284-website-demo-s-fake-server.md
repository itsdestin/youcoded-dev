---
id: 284
title: Website demo's fake server matches the API address by prefix (CodeQL alert)
stage: build
tags: dev-workspace, landing-page
branch: 284-website-demo-s-fake-server
finish: The workbench mock compares URL origin; the CodeQL alert is closed and does not return on the next site-assets run.
created: 2026-11-20
why: CodeQL flagged docs/site/assets/install-mock-*.js (generated from the workbench mock fetch) on youcoded#791: `startsWith('https://api.youcoded.ai')` would also catch api.youcoded.ai.other.host. Harmless (a demo returning sample data) but the alert stays open on master and returns on every site rebuild under a new file name. Fix the source: compare the URL's origin, then dismiss.
---
Progress
Done: nothing yet.
Next: plan it.
Blocked: nothing.

Chats
