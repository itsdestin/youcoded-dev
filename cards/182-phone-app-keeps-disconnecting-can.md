---
id: 182
title: Phone app keeps disconnecting; can't refresh or send
stage: polish
priority: P2
tags: remote-access, remote, standalone, bug
branch: 182-phone-app-keeps-disconnecting-can
finish: The phone rides out laptop freezes and sleeps without getting stuck; Send and refresh keep working; checked on a real phone.
created: 2026-10-22
why: Destin: "i have serious stability/reliability/performance issues with the mobile app. it seems to disconnect frequently and i often find myself unable to refresh messages or send new ones."
---
Progress
Done: Phones now reconnect and resume much faster. Opening the phone app takes about 6 seconds (was 8.4). Reconnecting takes about 1 second (was 1.9). Coming back after the phone sleeps takes about 1 second (was 11). Connection notices appear above the message box. Shipped in computer app v1.3.3 (Oct 23). Later fixes on master (Nov 1, not yet released): the phone says to update the computer when it cannot connect, and a connected phone is no longer logged out after sitting idle.
Next: (1) Use the phone for a while after a long break and read the real wait times from the desktop log. Only if resuming still feels slow, consider keeping a copy of the last conversation on the phone. (2) Test the Android app on a real phone. (3) Decide the honest status messages: a "your computer is asleep" message does not exist yet, and "Use this phone only" should be checked on every screen. Needs a review deck.
Blocked: nothing.

Chats
- 2026-10-22 session/remote-access-audit: Investigated and fixed the phone disconnect/stuck-send causes; start-up screens redesigned (decks approved); independent review fixed
