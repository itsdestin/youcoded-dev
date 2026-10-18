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
Done: Standalone Swipe Keyboard published publicly as v0.1.0 test release: https://github.com/itsdestin/swipe-keyboard/releases/tag/v0.1.0 . Public main/tag source commit af8dba5; repository https://github.com/itsdestin/swipe-keyboard ; bugs/contributions https://github.com/itsdestin/swipe-keyboard/issues . Includes verified Arch/CachyOS and updated Fedora44 packages, complete corresponding source tarball/source RPM, setup guide, checksums, contribution/issue forms, reviewed synthetic screenshot and transparent YouCoded attribution. Git history scanned (42 commits after publication commit) and final staged source passed redacted Gitleaks; full archive flags classified as byte-identical public upstream fixtures/constants, no confirmed owner secrets/private phone-data blocker. Public prerelease/issue/docs/image and all six assets verified without authentication; both installable packages anonymously re-downloaded and SHA256 matched. Exact final Fedora RPM real KDE typing/word-backspace/candidate undo/restoration/removal and both native package gates passed. Firefox minor spacing limitation accepted and tracked as public issue #1. No Reddit post; host installed keyboard/desktop/YouCoded unchanged. Keyboard source worktree clean and source commit backed up on public main.
Next: Keyboard v1 publication is complete. Full LiquidGlass/exact Control Center/tablet-layout/gestures/rotation replication remains deferred as the approved agent-guided setup repo, with Destin to record his setup and later decide the Reddit post. Preserve this remaining scope rather than closing #82 as if the whole Z13 kit shipped. Future keyboard contributions/support use public GitHub Issues; no AUR/COPR automatic-update repository was promised.
Blocked: No blocker for the published keyboard test release. Full Z13 replication repo and Reddit post remain deliberately deferred, not failed or shipped.

Chats
- 2026-10-18 session/82-z13-keyboard-release: chat started
- 2026-10-18 session/82-z13-keyboard-release: chat started
- 2026-10-18 session/82-z13-keyboard-release: chat started
- 2026-10-17 session/82-z13-keyboard-release: chat started
- 2026-10-17 session/82-z13-keyboard-release: chat started
- 2026-10-17 session/82-z13-keyboard-release: chat started

From the old roadmap (operations, status decision, seen on n/a, last checked 2026-10-14)
Free "Z13 tablet kit" as a marketing post: package Destin's ROG Flow Z13 setup so any Z13 owner on CachyOS/KDE can download and set it up, post it free on the Z13 subreddit, then a comment on how it was built with YouCoded, linking out. In it: touch-profile (tablet/laptop mode switch, status bar, Quick Settings drawer, dock and launcher, edge gestures, iPad-style keyboard), swipe-keyboard (Gboard-style swipe typing, ~97% first-guess on real sentences), and the CachyOS tweaks worth sharing (from the brain: machines/z13). Open before building: (a) one-command, fully reversible installer; strip Destin-only paths and settings; which Z13 models and distros to support. (b) swipe-keyboard's 20-minute FUTO/ExecuTorch build needs prebuilt packages, and the "Powered by FUTO Swipe" notice and GPL source must ship. (c) test on a fresh install before posting. (d) who answers support questions afterwards.
