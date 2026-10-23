---
id: 182
title: Phone app keeps disconnecting; can't refresh or send
stage: build
tags: remote-access, remote, standalone, bug
branch: 182-phone-app-keeps-disconnecting-can
finish: The phone rides out laptop freezes and sleeps without getting stuck; Send and refresh keep working; checked on a real phone.
created: 2026-10-22
why: Destin: "i have serious stability/reliability/performance issues with the mobile app. it seems to disconnect frequently and i often find myself unable to refresh messages or send new ones."
work: session/remote-access-audit
---
Progress
Done: Second half (speed): first open 8.4→6.1 s, reload 3.6→2.0 s, reconnect 1.9→1.0 s, resume 11→~1 s on the rig's 470 ms link; startup download 1.9→1.0 MB over gzip; connection notices above the message box (deck approved); placeholder centering fixed. Merged with session/remote-access-audit.
Next: Read real 'waited after waking' timings from desktop.log once Destin uses the phone after a long absence; only if resumes still feel slow, consider a phone-side copy of the last conversation (set aside 2026-10-22). Android app real-phone pass (assembleReleaseTest). Honest status incl. 'your computer is asleep' and Use-this-phone-only off the conversation screen (review F10) — needs a deck.
Blocked: nothing.

Chats
- 2026-10-22 session/remote-access-audit: Investigated and fixed the phone disconnect/stuck-send causes; start-up screens redesigned (decks approved); independent review fixed
