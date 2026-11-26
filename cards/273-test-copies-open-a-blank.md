---
id: 273
title: Test copies open a blank browser for sign-ins
stage: explore
tags: dev-workspace, rigs
related: 17
branch: 273-test-copies-open-a-blank
finish: A sign-in started inside a run-dev test copy opens the person's normal browser (their own profile and Google account), while the test copy's home stays private.
created: 2026-11-18
why: Card #236 testing, 2026-11-18. Destin: "it's trying to use a new second copy of google chrome instead of my main installation with my google account, and i need to sign in with google...." Cause: the private HOME makes Chrome start a fresh profile. Workaround used: copy the link into normal Chrome. Likely fix: run-dev sets BROWSER to a wrapper that opens links with the real HOME.
---
Progress
Done: nothing yet.
Next: plan it.
Blocked: nothing.

Chats
