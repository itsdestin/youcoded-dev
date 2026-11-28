---
id: 114
title: Remote setup: clearer screen and why the phone can't connect
stage: planning
priority: P2
tags: remote-access, standalone, remote, bug
branch: 114-remote-access-just-doesn-t
created: 2026-10-15
summary: When remote access fails the phone shows a blank error instead of what's wrong, and the remote setup screen has four unclear spots.
area: Devices & sync
side: screens
platform: Phone and web
vision: sync.follow.remote
---
Progress
Done: Phone-app 'cannot reach' message (commit a71a0a92d). Checked 2026-11-19: password confirm + show/hide and the 'removed' notice are ready to build; Keep awake redesign and setup step count are still undecided
Next: Build-ready part: (1) Settings remote password (SettingsPanel.tsx password inputs ~1937 and ~2635): confirm box + show/hide, reuse the look of ApiKeySetup.tsx / AdminPasswordPrompt.tsx. (2) Disconnect a device (unpair ~3051): 'Device removed' notice with Undo only if the pairing can be restored safely without the password; otherwise notice only and explain why in the deck. Before/After deck. Separately undecided: phone-browser offline page (needs a service worker), Keep awake redesign with time left (Destin 2026-09-24), setup step count.
Blocked: Keep awake and step count need Destin's design decision; parked 2026-11-19

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

Updated on the old roadmap after the move (master, merged in 2026-10-16)
Keep awake needs its own redesign. Destin, 2026-09-24: "the ui for keep awake needs to be
unique and rebuilt though. it should show how much keep awake time is left." Today it is a
five-part switch strip with no sign of how long is left.
`settings` `all` `decision` `P3` `checked 2026-09-24`

