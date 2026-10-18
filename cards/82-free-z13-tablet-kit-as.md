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
Done: V1 local candidates ready for handoff. Final Arch/CachyOS package and Fedora44 RPM/source RPM rebuilt with launcher lock wait and safe one-shot word backspace. Both clean native builds passed 15 CTest suites, setup/layout, packaging and fixture checks; extracted actual stock InputPanel loaded final binaries/models and word/candidate undo passed. Parent independently verified all four artifact SHA256 values. Arch isolated native install/check/removal passed. Parent installed exact final Fedora RPM in the full KDE VM: real swipe 'the' then whole-word Backspace gave empty text; chosen-candidate 'the works' then Backspace gave 'the'; disable restored original absent KWin keys and native removal retained stock keyboard. Earlier real tests covered Firefox Wayland, symbols, password privacy, scaling, reinstall and reboot. Firefox physical-clear spacing accepted/documented nonblocking. Final files/checksums/instructions: /home/destin/.cache/youcoded-z13-packaging/final-v1-output; docs/standalone-verification.md and docs/v1-handoff.md are current. VM shut down and synthetic touch stopped; host desktop/keyboard/YouCoded untouched. Implementation staged locally, not committed/pushed/published. Full Z13 agent setup repo deferred.
Next: Await explicit commit/push/public-visibility/release approval. Before public Reddit sharing, complete the separate Git-history/license review and provide working public download/source/issues links. Native v1 build and bounded acceptance are complete; do not repeat old timeout investigations. Public package update repository is not set up.
Blocked: No technical blocker for handing over the local v1 test candidates. Publication/commit/push remain unapproved; full public-history/legal certification is not claimed.

Chats
- 2026-10-18 session/82-z13-keyboard-release: chat started
- 2026-10-18 session/82-z13-keyboard-release: chat started
- 2026-10-18 session/82-z13-keyboard-release: chat started
- 2026-10-17 session/82-z13-keyboard-release: chat started
- 2026-10-17 session/82-z13-keyboard-release: chat started
- 2026-10-17 session/82-z13-keyboard-release: chat started

From the old roadmap (operations, status decision, seen on n/a, last checked 2026-10-14)
Free "Z13 tablet kit" as a marketing post: package Destin's ROG Flow Z13 setup so any Z13 owner on CachyOS/KDE can download and set it up, post it free on the Z13 subreddit, then a comment on how it was built with YouCoded, linking out. In it: touch-profile (tablet/laptop mode switch, status bar, Quick Settings drawer, dock and launcher, edge gestures, iPad-style keyboard), swipe-keyboard (Gboard-style swipe typing, ~97% first-guess on real sentences), and the CachyOS tweaks worth sharing (from the brain: machines/z13). Open before building: (a) one-command, fully reversible installer; strip Destin-only paths and settings; which Z13 models and distros to support. (b) swipe-keyboard's 20-minute FUTO/ExecuTorch build needs prebuilt packages, and the "Powered by FUTO Swipe" notice and GPL source must ship. (c) test on a fresh install before posting. (d) who answers support questions afterwards.
