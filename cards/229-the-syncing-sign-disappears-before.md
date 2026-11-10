---
id: 229
title: The 'Syncing…' sign disappears before the sync has actually finished
stage: explore
tags: sync, settings/sync, bug
related: 121
branch: 229-the-syncing-sign-disappears-before
finish: The indicator stays until the sync completes or fails, and a failure shows its message.
created: 2026-11-09
why: youcoded PR #444 (session/sync-retry-feedback, Sep 7) fixed this but was never merged and is now stale; the 2026-11-09 inventory confirmed the bug is still on master. You see the sync indicator vanish while files are still being sent, so a failure after that point shows nothing. Rebuild the small fix on today's code; the old PR is the reference.
---
Progress
Done: nothing yet.
Next: plan it.
Blocked: nothing.

Chats
