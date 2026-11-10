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
Done: the screenshot checker now waits 30 seconds (was 10) for the Pages menu to open before its Escape-key check, and the menu's page keeps asking for keyboard focus until it gets it (youcoded-dev commits 99a3ad8b1 and 732bf7c89; youcoded commit ed32a9dbe, all 2026-10-22).
Next: re-run the check on a busy machine to see whether it still fails; if it does, choose the page-sent signal.
Blocked: nothing.

Chats
