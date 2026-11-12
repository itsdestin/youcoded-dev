---
id: 177
title: Android shows the Local models settings page, which can't work on a phone
stage: explore
work: session/android-ux-test
tags: android, settings/local-models, bug, known-issue
related: 1
branch: 177-android-shows-the-local-models
finish: Android's Assistant settings lists only pages that work on a phone
created: 2026-10-21
why: Known issue shipped in 1.3.2. Assistant settings now filters pages by native.supported only (assistant-settings/AssistantSettings.tsx, commit bee0caeac), so Android lists Local models although the engine is not implemented on mobile.
---
Progress
Done: a fix is written and committed on the Android test branch (session/android-ux-test, commit 5ae5a5ca6, 2026-11-01). The Local models page is hidden on the phone itself; a phone that manages a computer still sees it. Not yet on master, so no release has it.
Next: ships with card 213 (Android test findings). Needs a real phone check that the page is gone and that the Local models list still shows when a phone manages a computer.
Blocked: waiting on the session/android-ux-test branch to merge to master (card 213's release-blocker work).

Chats
