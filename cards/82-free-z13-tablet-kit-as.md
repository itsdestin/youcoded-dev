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
Done: Approved v1 direction recorded: fullZ13agent-guidedreplicationrepo deferred; standaloneKDEkeyboard prioritized; Firefox physicalCtrl+A/Delete spacingquirk acceptednonblocking. Latestaddition implementsfirstunmodifiedBackspaceafter swipe/candidate to undoexactknownword plusonlyitsauto-insertedseparator, consumessessiononce. Furthertyping/reportedcursormove, selections, hidden/changed/sensitivecontext preserveordinarybackspace. Freshreview caughtsamewordcursorroundtrip; exactprefixtrackingfixandred/greenregressioncloseit, finalreviewnoblockers. ActualQtInputPanel/inputenginefieldtestpasses; newnativebinaries/VMbackspacecase notyetclaimed. Prior fullFedoraVMverifiedrealtyping/correction/symbol/privacy/reboot/reinstall/restoration; VMstopped. Allsource localstageduncommitted; docs/standalone-verification.md distinguishoriginalcandidateevidencefromnewadditions.
Next: Rebuild Arch/Fedora candidates with launcher wait and one-shot safe word backspace, then separate public history/license audit and release approval. Backspace source passes full15CTest plus27integration/24packaging/6VMfixturetests; stockInputPanel integration verifies actualQt key consumption, candidateundo, normaltyping/cursorfallback. Source remains staged locally on standalone-packaging; userdesktopuntouched.
Blocked: No longer blocked on Firefox spacing: Destin accepted it as minor v1 limitation; document it and stop upstream investigation. Native candidates must be rebuilt for the tested launcher-lock and approved word-backspace source additions before publication. No implementation commit/push or public release authorized.

Chats
- 2026-10-18 session/82-z13-keyboard-release: chat started
- 2026-10-18 session/82-z13-keyboard-release: chat started
- 2026-10-17 session/82-z13-keyboard-release: chat started
- 2026-10-17 session/82-z13-keyboard-release: chat started
- 2026-10-17 session/82-z13-keyboard-release: chat started

From the old roadmap (operations, status decision, seen on n/a, last checked 2026-10-14)
Free "Z13 tablet kit" as a marketing post: package Destin's ROG Flow Z13 setup so any Z13 owner on CachyOS/KDE can download and set it up, post it free on the Z13 subreddit, then a comment on how it was built with YouCoded, linking out. In it: touch-profile (tablet/laptop mode switch, status bar, Quick Settings drawer, dock and launcher, edge gestures, iPad-style keyboard), swipe-keyboard (Gboard-style swipe typing, ~97% first-guess on real sentences), and the CachyOS tweaks worth sharing (from the brain: machines/z13). Open before building: (a) one-command, fully reversible installer; strip Destin-only paths and settings; which Z13 models and distros to support. (b) swipe-keyboard's 20-minute FUTO/ExecuTorch build needs prebuilt packages, and the "Powered by FUTO Swipe" notice and GPL source must ship. (c) test on a fresh install before posting. (d) who answers support questions afterwards.
