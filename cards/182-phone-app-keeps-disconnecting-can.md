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
Done: Phone keeps its computer through outages, rides out freezes up to ~30 s, unlock checks instead of reconnecting, one lost send no longer blocks others, failed refills retry, loads compressed/sent once/in pieces, connection logging, Tailscale retry; brand start-up screens approved (review-2); independent review F1–F6, F8, F9 fixed
Next: Real-phone pass with an assembleReleaseTest build (Destin chose not to test before merge). Then: honest connection status on the phone incl. 'your computer is asleep' and a Use-this-phone-only way out from screens other than an open conversation (review F10) — needs a review deck; explore an always-there reload only if refresh trouble remains.
Blocked: nothing.

Chats
- 2026-10-22 session/remote-access-audit: Investigated and fixed the phone disconnect/stuck-send causes; start-up screens redesigned (decks approved); independent review fixed
