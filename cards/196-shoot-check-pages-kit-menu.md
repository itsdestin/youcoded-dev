---
id: 196
title: shoot --check: Pages kit menu-open screen still times out under machine load
stage: explore
work: session/android-ux-test
priority: P3
tags: dev-workspace, testing
branch: 196-shoot-check-pages-kit-menu
created: 2026-10-23
why: RECURRED 2026-10-22: scripts/shoot/shoot.mjs waits for focus in the page iframe before the Escape check; raised 10 s -> 30 s today and still failed once at load ~20 in the queue-delivery session (passes alone in 2.6 s). The menu opens on the frame's own load event (fixtures/kit-pieces-page.ts); a raised budget twice is a treadmill — needs a signal the page itself sends.
---
Progress
Done: Re-tested 2026-11-10: 28 of 28 passes, 1-3.7 seconds each against a 30 second limit, including 64 busy loops with the check pinned to one core, and during a full run at machine load 40-98. Could not make it fail.
Next: Close as fixed, or keep as a watch item. If it ever recurs, session/android-ux-test adds a way to slow the page on purpose to reproduce it.
Blocked: nothing.

Chats
