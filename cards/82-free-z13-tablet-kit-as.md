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
Done: Full setup direction remains an agent-guided replication repo for LiquidGlass, exact Control Center, tablet layout/gestures/rotation; deferred, with Destin to record a transparent Reddit/YouCoded showcase. Standalone keyboard native-package implementation is staged/uncommitted on standalone-packaging at /home/destin/youcoded-dev/worktrees/sessions/82-z13-keyboard-release/swipe-keyboard. Final Arch (Plasma6.8/Qt6.12) and Fedora44 (Plasma6.7.5/Qt6.11.2) builds succeeded; actual extracted packages loaded stock InputPanel with active SwipeInputMethod/models, installed via package manager, passed ordinary-user compatibility check, and removed cleanly while stock keyboard remained, all in disposable roots. Local15native suites,24setup/layout and24packaging tests pass. Fresh review found no blockers. Candidate binaries/source and logs retained under /home/destin/.cache/youcoded-z13-packaging; exact paths/checksums in docs/standalone-verification.md. No live desktop changes, implementation commits/pushes or publication.
Next: Ask Destin before preparing an isolated real KDE Wayland acceptance session: actual activation, tapping/swiping/correction, symbols/languages, reboot/update, disable/restore. Only after that and separate approval: public history/license audit, GitHub visibility/release, issue links and package repository. Do not repeat native builds solely because stale download-failure notices arrive; final package checks are now passing.
Blocked: Needs approval for isolated interactive KDE acceptance testing. Native build/download blockers are resolved. Public release and any commit/push remain unapproved.

Chats
- 2026-10-17 session/82-z13-keyboard-release: chat started
- 2026-10-17 session/82-z13-keyboard-release: chat started
- 2026-10-17 session/82-z13-keyboard-release: chat started

From the old roadmap (operations, status decision, seen on n/a, last checked 2026-10-14)
Free "Z13 tablet kit" as a marketing post: package Destin's ROG Flow Z13 setup so any Z13 owner on CachyOS/KDE can download and set it up, post it free on the Z13 subreddit, then a comment on how it was built with YouCoded, linking out. In it: touch-profile (tablet/laptop mode switch, status bar, Quick Settings drawer, dock and launcher, edge gestures, iPad-style keyboard), swipe-keyboard (Gboard-style swipe typing, ~97% first-guess on real sentences), and the CachyOS tweaks worth sharing (from the brain: machines/z13). Open before building: (a) one-command, fully reversible installer; strip Destin-only paths and settings; which Z13 models and distros to support. (b) swipe-keyboard's 20-minute FUTO/ExecuTorch build needs prebuilt packages, and the "Powered by FUTO Swipe" notice and GPL source must ship. (c) test on a fresh install before posting. (d) who answers support questions afterwards.
