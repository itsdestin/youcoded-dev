---
id: 55
title: Close a sign-in loophole that can hijack accounts
stage: planning
priority: P2
tags: marketplace, backend, security
branch: 55-harden-account-sign-in-against
roadmap: marketplace: Harden account sign-in against link-based account takeover.
created: 2026-10-15
summary: A trick link during sign-in could take over someone's YouCoded account (comments, friends, sync), not their GitHub or files.
area: Settings
side: behind
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (marketplace › backend, status parked, seen on all, last checked 2026-09-10)
Harden account sign-in against link-based account takeover. The GitHub device-flow can be abused to hijack a YouCoded account — social layer only (comments, friends, game records, sync, deleting the account), not the user's GitHub account, computer or files. Rated MEDIUM and deferred because the exploitable pool is smallest at launch; fix before accounts get real traction. Fix designed (device-flow to loopback proof); needs a real phone and a staged Worker rollout. Exploit detail is in the private security folder (~/system/youcoded-security-2026-09-10/, "#5").
