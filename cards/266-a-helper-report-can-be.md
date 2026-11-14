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
---
Progress
Done: nothing yet.
Next: plan it.
Blocked: nothing.

Chats
