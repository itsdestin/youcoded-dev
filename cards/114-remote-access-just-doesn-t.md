---
id: 114
title: Remote access "just doesn't work sometimes" and the phone gives nothing to act on
stage: planning
priority: P2
tags: remote-access, standalone, remote
branch: 114-remote-access-just-doesn-t
roadmap: remote-access: Remote access "just doesn't work sometimes" and the phone gi
created: 2026-10-15
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (remote-access › standalone, status confirmed, seen on remote, last checked 2026-09-09)
Remote access "just doesn't work sometimes" and the phone gives nothing to act on. Destin 2026-09-09: "remote access just doesn't work sometimes without anything actionable for the user, when tailscale might just not be enabled on their phone" — the phone shows the browser's own cannot-reach screen. Fix: install a service worker on the first successful visit so a later failure shows OUR page, which can tell "phone has no internet" from "phone is online but cannot reach the computer" and lead with the likely fix (it cannot see VPN state, so it must not claim Tailscale is off). Limits: needs one earlier visit; iOS drops it after ~7 days unused; Add to Home Screen makes it stick. Android follow-up (planned A5): the app can ask the system whether a VPN is active and say Tailscale is not running as a fact.
