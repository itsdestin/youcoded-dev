---
id: 55
title: Accounts: sign-in loophole and silent sign-outs
stage: planning
priority: P2
tags: marketplace, backend, security, other-features, accounts, bug
branch: 55-harden-account-sign-in-against
roadmap: marketplace: Harden account sign-in against link-based account takeover.
created: 2026-10-15
summary: Accounts: a trick sign-in link could take over a YouCoded account, and sign-outs can happen silently.
area: Settings
side: behind
vision: social.friends.signin, social.friends.signout
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (marketplace › backend, status parked, seen on all, last checked 2026-09-10)
Harden account sign-in against link-based account takeover. The GitHub device-flow can be abused to hijack a YouCoded account — social layer only (comments, friends, game records, sync, deleting the account), not the user's GitHub account, computer or files. Rated MEDIUM and deferred because the exploitable pool is smallest at launch; fix before accounts get real traction. Fix designed (device-flow to loopback proof); needs a real phone and a staged Worker rollout. Exploit detail is in the private security folder (~/system/youcoded-security-2026-09-10/, "#5").

Merged in #84 "Accounts: silent sign-out and leftover fixes"
Progress
Done: nothing recorded.
Next: check it still happens.
Blocked: nothing recorded.

Chats

From the old roadmap (other-features › accounts, status needs-verify, seen on all, last checked 2026-09-01)
Accounts: silent sign-out and Phase 2 leftovers (2 items). (a) One rejected server call quietly signs you out with no notice; friends then see you offline forever and you only find out by opening the friends panel. The log half shipped; the on-screen notice still needs a copy and surface decision (report: docs/active/investigations/2026-09-01-social-401-silent-signout.md). (b) Phase 2 leftovers: the two-person sign-in checklist never ran on a released build; a phone browser can't make account or social calls through remote access; the old PartyKit lobby room is still deployed; "Last seen Xm ago" never ticks while you watch; the friends screen is still buried inside the game lobby's code.
