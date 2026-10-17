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
Done: 2026-10-16 decision (supersedes the original universal-installer proposal): share the full desktop/2-in-1 setup through a public agent-guided replication repo containing the source, assets and instructions needed for LiquidGlass styling, Destin's exact Control Center, tablet layout, gestures, rotation rules and selected extras. No general-purpose installer or broad device/distro troubleshooting commitment. Initially only tested on CachyOS/KDE; agents inspect compatibility, explain features, ask what the user wants and adapt with approval, without promising an exact clone on every device. Destin will record his setup for a Reddit showcase, explain why setup is agent-guided, link GitHub bugs/contributions, and transparently recommend youcoded.ai as its creator and the tool used to build it. Proposed Reddit wording about pricing/subscriptions and recommending Linux is a draft, not verified release copy. Full-setup repo work is deferred; standalone swipe-keyboard release is the immediate discussion focus.
Next: First decide how to make swipe-keyboard independently downloadable, easy to install/update and contributor-friendly for non-Z13 KDE users, without building a multi-platform support burden. Separate the minimal keyboard integration from touch-profile; choose a narrow tested support target before implementation. Later prepare the agent-guided full-setup repo and recording/post.
Blocked: nothing recorded.

Chats
- 2026-10-17 session/82-z13-keyboard-release: chat started

From the old roadmap (operations, status decision, seen on n/a, last checked 2026-10-14)
Free "Z13 tablet kit" as a marketing post: package Destin's ROG Flow Z13 setup so any Z13 owner on CachyOS/KDE can download and set it up, post it free on the Z13 subreddit, then a comment on how it was built with YouCoded, linking out. In it: touch-profile (tablet/laptop mode switch, status bar, Quick Settings drawer, dock and launcher, edge gestures, iPad-style keyboard), swipe-keyboard (Gboard-style swipe typing, ~97% first-guess on real sentences), and the CachyOS tweaks worth sharing (from the brain: machines/z13). Open before building: (a) one-command, fully reversible installer; strip Destin-only paths and settings; which Z13 models and distros to support. (b) swipe-keyboard's 20-minute FUTO/ExecuTorch build needs prebuilt packages, and the "Powered by FUTO Swipe" notice and GPL source must ship. (c) test on a fresh install before posting. (d) who answers support questions afterwards.
