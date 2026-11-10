---
id: 216
title: Sign-outs nobody is told about: expired phones, rejected accounts, and account leftovers
stage: planning
priority: P2
tags: remote-access, security, marketplace, backend, other-features, accounts, bug
related: 113
branch: 216-phone-sign-in-expiry-owner
finish: A phone unused 90 days is signed out with its own 'expired' answer (close code 4006). Decide whether the computer's owner is told when that happens, and whether a person is told when their own YouCoded account is signed out by a rejected server call.
created: 2026-11-05
vision: social.friends.signin, social.friends.signout
work: session/security-server-batch
---
Progress
Done: Both notices built on session/security-server-batch (not landed): an expired phone stays in the Remote access device list as a faded row reading 'Signed out after 90 days unused' with Remove; and a notice with 'Sign in again' when the app signs you out of your account by itself (all four code paths, now logged too).
Next: Destin reviews the before/after deck (sign-out-notices) before they land. Still owed by hand: one real phone sign-in on a released build.
Blocked: nothing.

Chats
- 2026-11-10 session/security-server-batch: Batch 5: folded #55 in, re-checked every leftover, wrote the two notice choices; nothing built

Merged in #55 "Accounts: sign-in loophole and silent sign-outs"
Progress
Done: (a) The account-takeover hole is closed. Signing in is now tied to the app that started it, with a limit on sign-in attempts and a sign-out-everywhere option. Shipped on Nov 5 (marketplace PR #114, app PR #713). Still to check: one real phone sign-in as a final test.
Next: (b) decide how the owner is told when they get signed out without warning, and fold it into card 216.
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

From the 2026-10-16 document sweep
- Friends panel: add the status line (Part 3 of the presence design). Source: docs/active/specs/2026-08-11-presence-self-healing-design.md

Open choices for Destin (2026-11-10)

1. A phone unused for 90 days is signed out of the computer. Today the owner sees nothing: no message, no log line; the phone simply drops out of the device list in Settings. (Before that, an offline phone shows "Last used <date>".)
   - Tell the owner once, quietly (a line in the device list such as "Signed out after 90 days unused", or a one-time notice). You understand why the phone vanished; one more message to read, about a phone you had stopped using anyway.
   - Keep it silent but write it to the log. Nothing new on screen; support can still see what happened. A person who notices the missing phone has no explanation.
   - Leave as is. No work; a vanished device with no trace anywhere.

2. If the server rejects one account call, the app signs you out of your YouCoded account without saying so. Friends see you offline, and you find out only by opening the friends panel. Two of the code paths that do this do not even write a log line.
   - Show a notice with a Sign in button when it happens. You know at once and can fix it; needs wording and a place on screen (a new visible element).
   - Show it only in the friends panel and account settings, plus log all paths. Nothing interrupts you; you still discover it late.
   - Log only. Nothing visible changes; support can see it, the person cannot.

Leftovers from #55, re-checked 2026-11-10 (all still true, none covered by another card)
- A phone browser using remote access cannot make account or social calls (blocked on purpose; opening it is a product choice).
- The old PartyKit lobby room is still in the deploy settings though no app connects to it; whether it is still live online was not checked.
- "Last seen Xm ago" in the friends panel does not tick while you watch.
- The friends screen still lives inside the games area of the code.
- Friends panel status line (presence design, part 3): partly there (a "Connecting…" pill and a can't-reach-server card with Try again); whether that is enough was not decided.
- The two-person sign-in checklist has never been run on a released build.
