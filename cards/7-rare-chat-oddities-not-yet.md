---
id: 7
title: Chat view glitches: vanishing, stuck or misdrawn messages
stage: planning
priority: P2
tags: chat-data, desktop, needs-repro, claude-code-integration, chat, user-interface, bug
branch: 7-rare-chat-oddities-not-yet
roadmap: chat-data: Rare chat oddities, not yet reproduced (three things).
created: 2026-10-15
summary: Messages in an open chat can vanish, split, stick or draw wrongly, mostly in ways not yet reproducible on demand.
area: Chat
side: both
platform: Desktop only
---
Progress
Done: nothing recorded.
Next: check it still happens.
Blocked: nothing recorded.

Chats

From the old roadmap (chat-data, status needs-verify, seen on desktop, last checked 2026-08-12)
Rare chat oddities, not yet reproduced (three things). (a) A streamed reply split mid-sentence across two bubbles once in ~30 loaded practice-app runs while the computer was busy (2026-09-27); not seen in the real app. (b) The first Resume open after launch "can seemingly load indefinitely" (Destin, 2026-09-25); it now says "Still loading" with Try again after 6 s, never reproduced; next time note the time and check `~/.claude/desktop.log` (report: docs/active/investigations/2026-09-26-startup-resume-real-scale.md). (c) Leftovers from the 2026-08-12 session-file repair work, all safe-direction: a repair record can keep a dead key forever.

Merged in #9 "Messages to Claude Code: two unconfirmed glitches"
Progress
Done: nothing recorded.
Next: check it still happens.
Blocked: nothing recorded.

Chats

From the old roadmap (claude-code-integration, status needs-verify, seen on all, last checked 2026-09-23)
Sending messages to Claude Code: 2 unproven faults. (a) "Very rarely a message I send appears twice in chat, more often with very long messages." One cause is fixed (a pasted tab); a second remains where Claude Code saved the message, never answered, then saved it again 7–49 s later, matching the app's 8-second "press Enter again" retry. Next: reproduce in a dev instance with the keystroke trace on. (b) Claude Code's "How is Claude doing this session? 1: Bad 2: Fine 3: Good" rating may swallow a leading digit of a chat message and send a rating nobody chose; unverified, it could not be triggered on demand (next: catch it live and send "1 thing").

Merged in #140 "Messages sometimes vanish from an open chat"
Progress
Done: nothing recorded.
Next: check it still happens.
Blocked: nothing recorded.

Chats

From the old roadmap (user-interface, status needs-verify, seen on desktop, last checked 2026-09-27)
Messages vanish from an open chat: the chat panel emptied behind "Start a conversation" mid-conversation for a friend on Windows and for Destin on Linux (2026-09-27) while Claude still had the messages. Four causes fixed; the remaining one is unknown. Next step: a tripwire that logs what emptied an open chat, or the friend's log file.

Merged in #141 "Chat view: two display glitches"
Progress
Done: nothing recorded.
Next: check it still happens.
Blocked: nothing recorded.

Chats

From the old roadmap (user-interface, status needs-verify, seen on all, last checked 2026-09-01)
Chat view glitches (2 things). (a) Floating items (attention toast, permission gates, spinners, sync status) were never audited for landing on top of each other (docs/active/investigations/2026-09-01-chat-float-stacking.md); (b) an empty timestamp-only assistant bubble appears above a permission card (spec: docs/active/investigations/2026-08-17-timestamp-only-assistant-bubble.md).
