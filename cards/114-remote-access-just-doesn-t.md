---
id: 114
title: Remote setup: clearer screen and why the phone can't connect
stage: planning
priority: P2
tags: remote-access, standalone, remote, bug
branch: 114-remote-access-just-doesn-t
roadmap: remote-access: Remote access "just doesn't work sometimes" and the phone gi
created: 2026-10-15
summary: When remote access fails the phone shows a blank error instead of what's wrong, and the remote setup screen has four unclear spots.
area: Devices & sync
side: screens
platform: Phone and web
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (remote-access › standalone, status confirmed, seen on remote, last checked 2026-09-09)
Remote access "just doesn't work sometimes" and the phone gives nothing to act on. Destin 2026-09-09: "remote access just doesn't work sometimes without anything actionable for the user, when tailscale might just not be enabled on their phone" — the phone shows the browser's own cannot-reach screen. Fix: install a service worker on the first successful visit so a later failure shows OUR page, which can tell "phone has no internet" from "phone is online but cannot reach the computer" and lead with the likely fix (it cannot see VPN state, so it must not claim Tailscale is off). Limits: needs one earlier visit; iOS drops it after ~7 days unused; Add to Home Screen makes it stick. Android follow-up (planned A5): the app can ask the system whether a VPN is active and say Tailscale is not running as a fact.

Merged in #116 "Remote setup screen: four clarity gaps"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (remote-access › standalone, status confirmed, seen on remote, last checked 2026-09-10)
Remote setup screen: four clarity gaps (beta tester, 2026-09-10). (a) The password has no confirmation box and no way to reveal it, so you cannot check what you set (the "no rules" half is fixed). (b) Removing a device shows no "removed" message and has no undo. (c) "Keep awake" never says what it does or what happens when time runs out. (d) Setup asks for Install Tailscale, Sign in, Set up one at a time with no step count, so every finish brings a new demand (needs a deck). Report: docs/archive/reviews/2026-09-10-remote-access-ux-review-2.md
