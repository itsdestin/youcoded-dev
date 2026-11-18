---
id: 266
title: A helper report can be delivered twice if the app quits mid-delivery
stage: explore
tags: native-harness, bug
related: 62
branch: 266-a-helper-report-can-be
finish: Quitting while a report is being marked delivered never re-delivers it on resume
created: 2026-11-14
why: Found 2026-11-14 while fixing a flaky test: destroy() does not wait for the idle delivery pass (native-session-host.ts ~4760 confirmDelivered, ~5560 destroyEntry), so a quit can drop the delivered flag and the report is injected again on resume. Harmless but real; not reproduced in a running app.
work: session/266-native-small-faults
---
Progress
Done: Built on branch session/266-native-small-faults (youcoded, pushed, not merged); invisible fixes only, unit-tested. Full check run: only 2 unrelated tests timed out under heavy machine load and passed alone.
Next: Independent reviewer, then Destin says merge. No deck needed (invisible). #210: tray still must be confirmed on a real build; #220 items 1 and 2 untouched.
Blocked: nothing.

Chats
- 2026-11-18 session/266-native-small-faults: chat started
