---
id: 177
title: Android shows the Local models settings page, which can't work on a phone
stage: explore
tags: android, settings/local-models, bug, known-issue
related: 1
branch: 177-android-shows-the-local-models
finish: Android's Assistant settings lists only pages that work on a phone
created: 2026-10-21
why: Known issue shipped in 1.3.2. Assistant settings now filters pages by native.supported only (assistant-settings/AssistantSettings.tsx, commit bee0caeac), so Android lists Local models although the engine is not implemented on mobile.
---
Progress
Done: nothing yet.
Next: plan it.
Blocked: nothing.

Chats
