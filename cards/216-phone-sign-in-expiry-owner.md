---
id: 216
title: Phone sign-in expiry: owner notice and retry after an 'expired' answer
stage: planning
priority: P2
tags: remote-access, security
related: 113
branch: 216-phone-sign-in-expiry-owner
finish: A phone unused 90 days is signed out with its own 'expired' answer (close code 4006, CLOSE_DEVICE_EXPIRED, added in the security audit work, youcoded#713). Decide whether the computer's owner is told when that happens, and make sure the phone does not keep retrying with the old key after it.
created: 2026-11-05
---
Progress
Done: the phone now forgets its saved key and stops retrying after the 'expired' answer (on master, commit 10f3abd51, 2026-10-31); the computer sends the 90-day sign-out message (not yet released).
Next: decide whether the computer's owner gets told when a phone is signed out after 90 days unused, then build that notice.
Blocked: nothing.

Chats
