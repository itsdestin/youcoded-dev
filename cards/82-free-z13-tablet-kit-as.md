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
Done: Current direction: defer the full 2-in-1/LiquidGlass/exact-Control-Center/rotation setup as an agent-guided replication repo, not a universal installer; Destin will record his setup for a transparent Reddit/YouCoded showcase. Keyboard standalone implementation is staged but uncommitted on standalone-packaging in /home/destin/youcoded-dev/worktrees/sessions/82-z13-keyboard-release/swipe-keyboard. Added reversible per-user activation, private English stock-layout hook, separate system models/private recordings, native Arch and Fedora recipes/CI, hashed build/model inputs, licenses and contributor/issue docs. Fresh reviewers' concrete findings fixed and tested. Before restart: Arch binary built successfully, Fedora compiled/passed native tests but last debugsource packaging step needed a now-applied .so-mode fix. After restart: retained 14 native tests, 23 setup/layout tests and 20 packaging tests pass; isolated real stock InputPanel probe exposed and fixed actual empty .fallback-marker handling, and now loads swipe capture/models. No live keyboard changes or public release. Temporary containers were lost in the restart; new persistent clean distro verification is running under /home/destin/.cache/youcoded-z13-packaging (downloads are slow).
Next: Finish current Arch/Fedora native package and installed-payload verification, including the new real stock-layout regression. Record exact candidate versions/results. Then obtain isolated real KDE Wayland activation/typing/update/removal acceptance before advertising support. Publishing/public visibility, release audit and any package repository remain separate approvals.
Blocked: nothing recorded.

Chats
- 2026-10-17 session/82-z13-keyboard-release: chat started
- 2026-10-17 session/82-z13-keyboard-release: chat started
- 2026-10-17 session/82-z13-keyboard-release: chat started

From the old roadmap (operations, status decision, seen on n/a, last checked 2026-10-14)
Free "Z13 tablet kit" as a marketing post: package Destin's ROG Flow Z13 setup so any Z13 owner on CachyOS/KDE can download and set it up, post it free on the Z13 subreddit, then a comment on how it was built with YouCoded, linking out. In it: touch-profile (tablet/laptop mode switch, status bar, Quick Settings drawer, dock and launcher, edge gestures, iPad-style keyboard), swipe-keyboard (Gboard-style swipe typing, ~97% first-guess on real sentences), and the CachyOS tweaks worth sharing (from the brain: machines/z13). Open before building: (a) one-command, fully reversible installer; strip Destin-only paths and settings; which Z13 models and distros to support. (b) swipe-keyboard's 20-minute FUTO/ExecuTorch build needs prebuilt packages, and the "Powered by FUTO Swipe" notice and GPL source must ship. (c) test on a fresh install before posting. (d) who answers support questions afterwards.
