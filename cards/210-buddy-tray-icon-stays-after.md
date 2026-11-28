---
id: 210
title: Buddy tray icon stays after turning Minimize to tray off (Linux)
stage: explore
priority: P3
tags: buddy, desktop, bug, linux
related: 85
vision: yours.look.buddy
branch: 210-buddy-tray-icon-stays-after
created: 2026-10-31
why: toggling the minimize to tray option off makes the floater come back, but doesnt remove the tray icon. its supposed to swap back and forth, but ends up just leaving both
---
Progress
Done: Built on branch session/266-native-small-faults (youcoded, pushed, not merged); invisible fixes only, unit-tested. Full check run: only 2 unrelated tests timed out under heavy machine load and passed alone.
Next: Independent reviewer, then Destin says merge. No deck needed (invisible). #210: tray still must be confirmed on a real build; #220 items 1 and 2 untouched.
Blocked: nothing.

Chats
