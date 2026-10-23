---
id: 196
title: shoot --check: Pages kit menu-open screen still times out under machine load
stage: explore
tags: dev-workspace, testing
branch: 196-shoot-check-pages-kit-menu
created: 2026-10-23
why: RECURRED 2026-10-22: scripts/shoot/shoot.mjs waits for focus in the page iframe before the Escape check; raised 10 s -> 30 s today and still failed once at load ~20 in the queue-delivery session (passes alone in 2.6 s). The menu opens on the frame's own load event (fixtures/kit-pieces-page.ts); a raised budget twice is a treadmill — needs a signal the page itself sends.
---
Progress
Done: nothing yet.
Next: plan it.
Blocked: nothing.

Chats
