---
id: 82
title: Share Destin's Z13 tablet setup as a free kit
stage: explore
priority: P3
tags: operations, feature
branch: 82-free-z13-tablet-kit-as
roadmap: operations: Free "Z13 tablet kit" as a marketing post: package Destin's
created: 2026-10-15
summary: Package Destin's tablet setup and swipe keyboard as a free download for other Z13 owners, as a post that points to YouCoded.
area: Release & business
work: session/82-z13-keyboard-release
---
Progress
Done: Published Swipe Keyboard v0.1.0-r3 at https://github.com/itsdestin/swipe-keyboard/releases/tag/v0.1.0-r3 from source commit 0f458bb. All seven uploaded asset digests verified. Exact Arch package tested across Qt6.11/KF6.27 and Qt6.12/KF6.31; installed/activated on Destin CachyOS without OS update. All 96 installed payload files match; live KWin process loads system plugin; recording off; legacy files/settings/recordings preserved in private migration backup. Final Fedora RPM real KDE touchscreen/KWrite checks pass. Dedicated test VM stopped. Old release marked superseded, not overwritten.
Next: Destin can try swipe/candidate/backspace on the device and use the public release/setup links for the first Reddit post. Draft supplied separately; no Reddit post submitted. Maintenance/update automation is follow-up #165; broader tablet kit/video remain deferred.
Blocked: No release or installation blocker. Human touchscreen feedback on the device remains a user check.

Chats
- 2026-10-18 session/82-z13-keyboard-release: chat started
- 2026-10-18 session/82-z13-keyboard-release: chat started
- 2026-10-18 session/82-z13-keyboard-release: chat started
- 2026-10-18 session/82-z13-keyboard-release: chat started
- 2026-10-18 session/82-z13-keyboard-release: chat started
- 2026-10-18 session/82-z13-keyboard-release: chat started
- 2026-10-18 session/82-z13-keyboard-release: chat started
- 2026-10-18 session/82-z13-keyboard-release: chat started
- 2026-10-18 session/82-z13-keyboard-release: chat started
- 2026-10-18 session/82-z13-keyboard-release: chat started
- 2026-10-18 session/82-z13-keyboard-release: chat started
- 2026-10-18 session/82-z13-keyboard-release: chat started
- 2026-10-17 session/82-z13-keyboard-release: chat started
- 2026-10-17 session/82-z13-keyboard-release: chat started
- 2026-10-17 session/82-z13-keyboard-release: chat started

From the old roadmap (operations, status decision, seen on n/a, last checked 2026-10-14)
Free "Z13 tablet kit" as a marketing post: package Destin's ROG Flow Z13 setup so any Z13 owner on CachyOS/KDE can download and set it up, post it free on the Z13 subreddit, then a comment on how it was built with YouCoded, linking out. In it: touch-profile (tablet/laptop mode switch, status bar, Quick Settings drawer, dock and launcher, edge gestures, iPad-style keyboard), swipe-keyboard (Gboard-style swipe typing, ~97% first-guess on real sentences), and the CachyOS tweaks worth sharing (from the brain: machines/z13). Open before building: (a) one-command, fully reversible installer; strip Destin-only paths and settings; which Z13 models and distros to support. (b) swipe-keyboard's 20-minute FUTO/ExecuTorch build needs prebuilt packages, and the "Powered by FUTO Swipe" notice and GPL source must ship. (c) test on a fresh install before posting. (d) who answers support questions afterwards.
